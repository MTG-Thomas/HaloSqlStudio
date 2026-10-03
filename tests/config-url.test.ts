import { describe, expect, it } from "vitest";
import { validateServerUrl } from "../src/stores/configStore";

describe("validateServerUrl", () => {
    it("accepts clean https URLs", () => {
        expect(validateServerUrl("https://halo.example.com")).toBeNull();
        expect(
            validateServerUrl("https://halo.example.com:8443/base/")
        ).toBeNull();
    });

    it("accepts http only for localhost", () => {
        expect(validateServerUrl("http://localhost:8080")).toBeNull();
        expect(validateServerUrl("http://127.0.0.1")).toBeNull();
        expect(validateServerUrl("http://example.com")).not.toBeNull();
    });

    it("rejects URLs with credentials, query, or fragment", () => {
        expect(
            validateServerUrl("https://user:pass@halo.example.com")
        ).not.toBeNull();
        expect(
            validateServerUrl("https://halo.example.com/?next=/evil")
        ).not.toBeNull();
        expect(
            validateServerUrl("https://halo.example.com/#fragment")
        ).not.toBeNull();
        expect(
            validateServerUrl("http://localhost:8080/?x=1")
        ).not.toBeNull();
    });

    it("rejects missing and malformed URLs", () => {
        expect(validateServerUrl("")).not.toBeNull();
        expect(validateServerUrl("not a url")).not.toBeNull();
    });
});
