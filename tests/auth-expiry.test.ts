import { describe, expect, it } from "vitest";
import {
    TOKEN_EXPIRY_SKEW_MS,
    isTokenValid,
} from "../src/services/auth/authService";
import type { HaloTokens } from "../src/services/auth/types";

function tokensWith(overrides: Partial<HaloTokens> = {}): HaloTokens {
    return {
        access_token: "access",
        refresh_token: "refresh",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "read:reporting",
        obtained_at: 1_000_000,
        ...overrides,
    };
}

describe("isTokenValid", () => {
    it("accepts a fresh token", () => {
        expect(isTokenValid(tokensWith(), 1_000_000)).toBe(true);
    });

    it("rejects null or undefined tokens", () => {
        expect(isTokenValid(null, 1_000_000)).toBe(false);
        expect(isTokenValid(undefined, 1_000_000)).toBe(false);
    });

    it("rejects tokens without an access token", () => {
        expect(isTokenValid(tokensWith({ access_token: "" }), 1_000_000)).toBe(
            false
        );
    });

    it("rejects tokens without a numeric expires_in", () => {
        const tokens = tokensWith() as unknown as Record<string, unknown>;
        delete tokens.expires_in;
        expect(isTokenValid(tokens as unknown as HaloTokens, 1_000_000)).toBe(
            false
        );
    });

    it("fails closed when obtained_at was never recorded", () => {
        const { obtained_at: _dropped, ...rest } = tokensWith();
        expect(_dropped).toBe(1_000_000);
        expect(isTokenValid(rest, 1_000_000)).toBe(false);
    });

    it("rejects a long-expired token", () => {
        // expires at 1_000_000 + 3600_000 = 4_600_000
        expect(isTokenValid(tokensWith(), 5_000_000)).toBe(false);
    });

    it("treats the skew boundary as expired", () => {
        // obtained 1_000_000 + 60s lifetime => expires at 1_060_000.
        // With the 30s default skew, validity ends at 1_030_000 (exclusive).
        const tokens = tokensWith({ expires_in: 60 });
        expect(TOKEN_EXPIRY_SKEW_MS).toBe(30_000);
        expect(isTokenValid(tokens, 1_029_999)).toBe(true);
        expect(isTokenValid(tokens, 1_030_000)).toBe(false);
        expect(isTokenValid(tokens, 1_030_001)).toBe(false);
    });

    it("treats the exact expiry instant as expired with zero skew", () => {
        const tokens = tokensWith({ expires_in: 60 });
        expect(isTokenValid(tokens, 1_059_999, 0)).toBe(true);
        expect(isTokenValid(tokens, 1_060_000, 0)).toBe(false);
    });

    it("honours an explicit skew override", () => {
        const tokens = tokensWith({ expires_in: 60 });
        // 5s skew: valid until 1_055_000 (exclusive)
        expect(isTokenValid(tokens, 1_054_999, 5_000)).toBe(true);
        expect(isTokenValid(tokens, 1_055_000, 5_000)).toBe(false);
    });
});
