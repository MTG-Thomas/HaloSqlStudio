const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";
const BEACON_TOKEN = "d1f883f1db5b4c88aa736d010a3ae0d8";
const BEACON_ELEMENT_ID = "cf-web-analytics-beacon";

/**
 * Installs the Cloudflare Web Analytics beacon (privacy-friendly,
 * cookieless page-view measurement).
 *
 * Injected at runtime rather than declared in index.html because the
 * Cloudflare Vite plugin strips non-module scripts from the built HTML.
 * Idempotent: safe to call on every startup path.
 */
export function installWebAnalytics(): void {
    if (typeof document === "undefined") return;
    if (document.getElementById(BEACON_ELEMENT_ID)) return;
    const script = document.createElement("script");
    script.id = BEACON_ELEMENT_ID;
    script.defer = true;
    script.src = BEACON_SRC;
    script.setAttribute(
        "data-cf-beacon",
        JSON.stringify({ token: BEACON_TOKEN })
    );
    document.body.appendChild(script);
}
