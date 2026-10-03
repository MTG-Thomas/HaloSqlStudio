export interface HaloTokens {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
    /** Epoch milliseconds when the tokens were obtained (stamped by saveTokens). */
    obtained_at?: number;
}

export interface HaloUser {
    id: string;
    username: string;
    email?: string;
}

export interface AuthConfig {
    authServer: string;
    clientId: string;
    redirectUri: string;
}
