import type { ApiResponse } from "./types";

export interface ApiClientConfig {
    baseUrl: string;
    getAccessToken: () => Promise<string | null>;
    onTokenRefresh: () => Promise<boolean>;
    onAuthExpired: () => void;
}

export class ApiClient {
    private config: ApiClientConfig;

    constructor(config: ApiClientConfig) {
        this.config = config;
    }

    async makeRequest(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<ApiResponse> {
        return this.request(endpoint, options, false);
    }

    private async request(
        endpoint: string,
        options: RequestInit,
        retried: boolean
    ): Promise<ApiResponse> {
        try {
            const token = await this.config.getAccessToken();
            if (!token) {
                throw new Error("No access token available");
            }

            const url = `${this.config.baseUrl}/api${endpoint}`;

            const response = await fetch(url, {
                ...options,
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    ...options.headers,
                },
            });

            if (!response.ok) {
                if (response.status === 401 && !retried) {
                    // Try to refresh the token (single-flight in authService)
                    const refreshed = await this.config.onTokenRefresh();
                    if (refreshed) {
                        // Retry the request once with the new token
                        return this.request(endpoint, options, true);
                    }
                    console.error(
                        "Token refresh failed, clearing authentication and redirecting..."
                    );
                }

                if (response.status === 401) {
                    // Refresh failed or already retried: expire the session
                    this.config.onAuthExpired();
                    throw new Error(
                        "Authentication expired - redirecting to login"
                    );
                }

                // Handle other HTTP errors (keep a truncated server body)
                let detail = "";
                try {
                    const errorText = (await response.text()).trim();
                    if (errorText) {
                        detail =
                            errorText.length > 500
                                ? `${errorText.slice(0, 500)}…`
                                : errorText;
                    }
                } catch {
                    // Ignore body-read failures; the status is enough
                }
                console.error(
                    `API request failed: ${response.status} ${response.statusText}`,
                    detail
                );
                throw new Error(
                    `API request failed: ${response.statusText}${detail ? ` - ${detail}` : ""}`
                );
            }

            return response.json();
        } catch (error) {
            console.error("API request error:", error);
            throw error;
        }
    }
}
