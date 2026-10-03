import { describe, expect, it } from "vitest";
import {
    findBareSemicolonLines,
    stripSemicolonsOutsideStrings,
    scanSemicolonWarning,
} from "../src/components/Editor/semicolonWarning";

describe("findBareSemicolonLines", () => {
    it("flags semicolons outside string literals", () => {
        expect(findBareSemicolonLines("SELECT 1;")).toEqual([1]);
        expect(
            findBareSemicolonLines("SELECT 1;\nSELECT 'a;b'\nSELECT 3;")
        ).toEqual([1, 3]);
    });

    it("ignores semicolons inside line comments", () => {
        expect(findBareSemicolonLines("-- comment;\nSELECT 1")).toEqual([]);
        expect(
            findBareSemicolonLines("SELECT 1 -- trailing;\nSELECT 2;")
        ).toEqual([2]);
    });

    it("ignores semicolons inside block comments", () => {
        expect(findBareSemicolonLines("/* one; two; */\nSELECT 1")).toEqual(
            []
        );
        expect(
            findBareSemicolonLines("SELECT 1; /* keep; me */ SELECT 2")
        ).toEqual([1]);
    });

    it("does not treat comment markers inside strings as comments", () => {
        expect(findBareSemicolonLines("SELECT '-- not; a comment';")).toEqual(
            [1]
        );
    });
});

describe("stripSemicolonsOutsideStrings", () => {
    it("removes bare semicolons while preserving literals", () => {
        expect(stripSemicolonsOutsideStrings("SELECT 1;")).toBe("SELECT 1");
        expect(stripSemicolonsOutsideStrings("SELECT 'a;b';")).toBe(
            "SELECT 'a;b'"
        );
    });

    it("preserves semicolons inside comments", () => {
        expect(
            stripSemicolonsOutsideStrings("-- fix; me not\nSELECT 1;")
        ).toBe("-- fix; me not\nSELECT 1");
        expect(stripSemicolonsOutsideStrings("/* a;b */ SELECT 1;")).toBe(
            "/* a;b */ SELECT 1"
        );
    });
});

describe("scanSemicolonWarning", () => {
    it("returns no warning for comment-only semicolons", () => {
        expect(scanSemicolonWarning("-- just; a comment")).toEqual([]);
    });

    it("reports line numbers for real violations", () => {
        const [result] = scanSemicolonWarning("SELECT 1;\nSELECT 2;");
        expect(result.lineNumbers).toEqual([1, 2]);
        expect(result.warning.id).toBe("bare-semicolon");
    });
});
