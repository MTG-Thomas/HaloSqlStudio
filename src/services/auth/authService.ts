import type { HaloTokens, AuthConfig } from "./types";

// Token storage keys
const TOKEN_STORAGE_KEY = "halo-tokens";

// PKCE + state storage keys (sessionStorage: bound to this tab's login attempt)
const PKCE_VERIFIER_KEY = "halo-pkce-verifier";
const OAUTH_STATE_KEY = "halo-oauth-state";

// Clock skew tolerance applied when checking token expiry
export const TOKEN_EXPIRY_SKEW_MS = 30_000;

const OAUTH_SCOPE = "read:reporting edit:reporting offline_access";

// Track processed authorization codes to prevent duplicates
const processedCodes = new Set<string>();

// Clean up old processed codes periodically (every 5 minutes)
setInterval(() => {
    if (processedCodes.size > 100) {
        processedCodes.clear();
    }
}, 5 * 60 * 1000);

function stripTrailingSlash(url: string): string {
    return url.replace(/\/+$/, "");
}

function base64UrlEncode(bytes: Uint8Array): string {
    let binary = "";
    bytes.forEach((b) => {
        binary += String.fromCharCode(b);
    });
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function generateRandomString(byteLength: number): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
}

async function sha256Base64Url(input: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(input)
    );
    return base64UrlEncode(new Uint8Array(digest));
}

export function loadTokens(): HaloTokens | null {
    try {
        const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (error) {
        console.error("Failed to parse stored tokens:", error);
        clearTokens();
    }
    return null;
}

export function saveTokens(tokens: HaloTokens): void {
    const stamped: HaloTokens = { ...tokens, obtained_at: Date.now() };
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(stamped));
}

export function clearTokens(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function clearProcessedCodes(): void {
    processedCodes.clear();
}

/**
 * Pure helper: reports whether the given tokens grant authenticated access
 * at time `now`, tolerating `skewMs` of clock skew. Tokens without a recorded
 * `obtained_at` are treated as expired (fail closed).
 */
export function isTokenValid(
    tokens: HaloTokens | null | undefined,
    now: number = Date.now(),
    skewMs: number = TOKEN_EXPIRY_SKEW_MS
): boolean {
    if (!tokens?.access_token) return false;
    if (typeof tokens.expires_in !== "number") return false;
    if (typeof tokens.obtained_at !== "number") return false;
    const expiresAt = tokens.obtained_at + tokens.expires_in * 1000;
    return now < expiresAt - skewMs;
}

export function isAuthenticated(): boolean {
    return isTokenValid(loadTokens());
}

export async function startAuth(config: AuthConfig): Promise<void> {
    // Validate required fields
    if (!config.authServer || !config.clientId || !config.redirectUri) {
        throw new Error(
            "Missing required configuration: authServer, clientId, or redirectUri"
        );
    }

    // Generate PKCE verifier/challenge (S256) and a CSRF state value
    const verifier = generateRandomString(64);
    const challenge = await sha256Base64Url(verifier);
    const state = generateRandomString(32);
    sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
    sessionStorage.setItem(OAUTH_STATE_KEY, state);

    const params = new URLSearchParams({
        client_id: config.clientId,
        response_type: "code",
        scope: OAUTH_SCOPE,
        redirect_uri: config.redirectUri,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
    });

    const authUrl = `${stripTrailingSlash(config.authServer)}/authorize?${params.toString()}`;
    window.location.href = authUrl;
}

export async function handleCallback(
    config: AuthConfig,
    code: string,
    state?: string | null
): Promise<boolean> {
    try {
        // Check if this code has already been processed
        if (processedCodes.has(code)) {
            console.warn(
                "Authorization code already processed, skipping:",
                code
            );
            return false;
        }

        // Validate required fields
        if (!config.authServer || !config.clientId || !config.redirectUri) {
            throw new Error(
                "Missing required configuration: authServer, clientId, or redirectUri"
            );
        }

        // Verify state and retrieve the PKCE verifier. Nothing is
        // consumed until validation passes, so a failed callback (or a
        // remount retry with the correct state) can still proceed.
        const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
        const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);

        if (!expectedState || !state || state !== expectedState) {
            console.error(
                "OAuth state mismatch: possible CSRF attack, aborting login"
            );
            return false;
        }

        if (!verifier) {
            console.error("Missing PKCE verifier, aborting login");
            return false;
        }

        // Validation passed: the code and verifier are now single-use.
        processedCodes.add(code);
        sessionStorage.removeItem(OAUTH_STATE_KEY);
        sessionStorage.removeItem(PKCE_VERIFIER_KEY);

        const tokenParams = new URLSearchParams({
            grant_type: "authorization_code",
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            code: code,
            scope: OAUTH_SCOPE,
            code_verifier: verifier,
        });

        const tokenResponse = await fetch(
            `${stripTrailingSlash(config.authServer)}/token`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: tokenParams,
            }
        );

        if (!tokenResponse.ok) {
            let errorMessage = `Token request failed: ${tokenResponse.statusText}`;

            try {
                const errorData = await tokenResponse.text();
                console.error("Token request error response:", errorData);
                if (errorData) {
                    errorMessage += ` - ${errorData}`;
                }
            } catch (e) {
                console.error("Could not read error response:", e);
            }

            throw new Error(errorMessage);
        }

        const tokens: HaloTokens = await tokenResponse.json();
        saveTokens(tokens);

        return true;
    } catch (error) {
        console.error("OAuth callback error:", error);
        return false;
    }
}

// Single-flight guard: concurrent refresh callers share one token request
let refreshPromise: Promise<boolean> | null = null;

export function refreshToken(config: AuthConfig): Promise<boolean> {
    if (refreshPromise) {
        return refreshPromise;
    }
    refreshPromise = doRefresh(config).finally(() => {
        refreshPromise = null;
    });
    return refreshPromise;
}

function snapshotStoredTokens(): string | null {
    try {
        return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
        return null;
    }
}

/** True when another login or refresh replaced the stored session. */
function storedSessionChanged(before: string | null): boolean {
    return snapshotStoredTokens() !== before;
}

async function doRefresh(config: AuthConfig): Promise<boolean> {
    const tokens = loadTokens();
    if (!tokens?.refresh_token) {
        console.warn("No refresh token available");
        return false;
    }
    // A fresh OAuth login may land while the refresh request is in
    // flight; never let this older session overwrite or clear it.
    const sessionBefore = snapshotStoredTokens();

    try {
        const response = await fetch(
            `${stripTrailingSlash(config.authServer)}/token`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    grant_type: "refresh_token",
                    client_id: config.clientId,
                    refresh_token: tokens.refresh_token,
                    scope: OAUTH_SCOPE,
                }),
            }
        );

        // A newer session won the race: preserve it and report success
        // so callers don't log out a valid login.
        if (storedSessionChanged(sessionBefore)) return true;

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Token refresh failed:", response.status, errorText);

            // If refresh token is invalid/expired, clear everything
            if (response.status === 400 || response.status === 401) {
                console.warn(
                    "Refresh token is invalid/expired, clearing authentication"
                );
                clearTokens();
                return false;
            }

            throw new Error(`Token refresh failed: ${response.statusText}`);
        }

        const newTokens: HaloTokens = await response.json();
        // Some providers omit the refresh token when it is unchanged; keep it
        if (!newTokens.refresh_token) {
            newTokens.refresh_token = tokens.refresh_token;
        }
        saveTokens(newTokens);
        return true;
    } catch (error) {
        // Same guard on the failure path: a newer session must survive.
        if (storedSessionChanged(sessionBefore)) return true;
        console.error("Token refresh error:", error);
        clearTokens();
        return false;
    }
}

export async function logout(config?: AuthConfig): Promise<void> {
    // Best-effort revocation (RFC 7009): never block logout on failure
    const tokens = loadTokens();
    if (config?.authServer && tokens) {
        const endpoint = `${stripTrailingSlash(config.authServer)}/revoke`;
        const revoke = async (token: string, hint: string) => {
            try {
                await fetch(endpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded",
                    },
                    body: new URLSearchParams({
                        token,
                        token_type_hint: hint,
                        client_id: config.clientId,
                    }),
                });
            } catch {
                // Best-effort: ignore revocation failures
            }
        };
        await Promise.allSettled([
            tokens.refresh_token
                ? revoke(tokens.refresh_token, "refresh_token")
                : Promise.resolve(),
            tokens.access_token
                ? revoke(tokens.access_token, "access_token")
                : Promise.resolve(),
        ]);
    }

    clearTokens();
    sessionStorage.removeItem(PKCE_VERIFIER_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    // Clear processed codes on logout
    processedCodes.clear();
    // Redirect to login page
    if (window.location.pathname !== "/login") {
        window.location.href = "/login";
    }
}
