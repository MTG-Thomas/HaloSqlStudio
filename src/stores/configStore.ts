import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface HaloConfig {
    tenant: string;
    authServer: string;
    resourceServer: string;
    clientId: string;
    redirectUri: string;
}

const defaultConfig: HaloConfig = {
    tenant: "",
    authServer: "",
    resourceServer: "",
    clientId: "",
    redirectUri: "",
};

/** Trim whitespace and strip trailing slashes so URL joins stay predictable. */
export function normalizeServerUrl(url: string): string {
    return url.trim().replace(/\/+$/, "");
}

function isLocalhostHostname(hostname: string): boolean {
    const host = hostname.toLowerCase();
    return (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host === "[::1]"
    );
}

/**
 * Validate a Halo server URL. Returns an error message, or null when valid.
 * Requires https; plain http is only allowed for localhost development.
 */
export function validateServerUrl(url: string): string | null {
    const normalized = normalizeServerUrl(url);
    if (!normalized) {
        return "Server URL is required";
    }
    let parsed: URL;
    try {
        parsed = new URL(normalized);
    } catch {
        return "Invalid URL";
    }
    // Credentials, query strings, and fragments would corrupt the
    // /authorize, /token, and /api paths appended to this URL.
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        return "Server URL must not include credentials, query, or fragment";
    }
    if (parsed.protocol === "https:") {
        return null;
    }
    if (parsed.protocol === "http:" && isLocalhostHostname(parsed.hostname)) {
        return null;
    }
    return "URL must use https:// (http is only allowed for localhost)";
}

function isConfigComplete(config: HaloConfig): boolean {
    return Boolean(
        config.clientId &&
            config.clientId.trim() !== "" &&
            config.authServer &&
            validateServerUrl(config.authServer) === null &&
            config.resourceServer &&
            validateServerUrl(config.resourceServer) === null
    );
}

function normalizeConfig(config: HaloConfig): HaloConfig {
    return {
        ...config,
        authServer: config.authServer
            ? normalizeServerUrl(config.authServer)
            : config.authServer,
        resourceServer: config.resourceServer
            ? normalizeServerUrl(config.resourceServer)
            : config.resourceServer,
    };
}

interface ConfigState {
    config: HaloConfig;
    isLoaded: boolean;
    isConfigured: boolean;
    setConfig: (updates: Partial<HaloConfig>) => void;
    resetConfig: () => void;
    setLoaded: (loaded: boolean) => void;
    generateRedirectUri: () => string;
}

export const useConfigStore = create<ConfigState>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            isLoaded: false,
            isConfigured: false,

            setConfig: (updates) => {
                set((state) => {
                    const newConfig = normalizeConfig({
                        ...state.config,
                        ...updates,
                    });
                    return {
                        config: newConfig,
                        isConfigured: isConfigComplete(newConfig),
                    };
                });
            },

            resetConfig: () => {
                const defaultRedirectUri = get().generateRedirectUri();
                set({
                    config: {
                        ...defaultConfig,
                        redirectUri: defaultRedirectUri,
                    },
                    isConfigured: false,
                });
            },

            setLoaded: (loaded) => {
                set({ isLoaded: loaded });
            },

            generateRedirectUri: () => {
                const baseUrl =
                    typeof window !== "undefined" ? window.location.origin : "";
                return `${baseUrl}/auth/callback`;
            },
        }),
        {
            name: "halo-config",
            partialize: (state) => ({ config: state.config }),
            onRehydrateStorage: () => (state) => {
                if (state) {
                    // Normalize persisted URLs and generate redirect URI
                    state.config = normalizeConfig(state.config);
                    const defaultRedirectUri = state.generateRedirectUri();
                    if (!state.config.redirectUri) {
                        state.config.redirectUri = defaultRedirectUri;
                    }

                    // Check if config is complete
                    state.isConfigured = isConfigComplete(state.config);
                    state.setLoaded(true);
                }
            },
        }
    )
);
