const HASH_PREFIX = "#sql=";

/** Unicode-safe base64url encoding for share links. */
export function encodeSqlToHash(sql: string): string {
    const bytes = new TextEncoder().encode(sql);
    let binary = "";
    bytes.forEach((b) => {
        binary += String.fromCharCode(b);
    });
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

export function decodeSqlFromHash(hash: string): string | null {
    try {
        let base64 = hash.replace(/-/g, "+").replace(/_/g, "/");
        while (base64.length % 4 !== 0) base64 += "=";
        const binary = atob(base64);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

export function buildShareUrl(sql: string): string {
    return `${window.location.origin}${window.location.pathname}${HASH_PREFIX}${encodeSqlToHash(sql)}`;
}

/** Returns shared SQL from `location.hash`, or null when absent/invalid. */
export function parseSharedSqlFromHash(
    hash: string = window.location.hash
): string | null {
    if (!hash.startsWith(HASH_PREFIX)) return null;
    const decoded = decodeSqlFromHash(hash.slice(HASH_PREFIX.length));
    if (!decoded || !decoded.trim()) return null;
    return decoded;
}

export function clearSharedSqlHash(): void {
    window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
    );
}
