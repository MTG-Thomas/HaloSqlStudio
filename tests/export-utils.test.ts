import { describe, expect, it } from "vitest";
import {
    buildCsvContent,
    escapeCsvValue,
} from "../src/lib/export-utils";
import type {
    ColumnInfo,
    QueryResult,
} from "../src/services/api/types";

function col(name: string, id = 1): ColumnInfo {
    return { id, name, data_type: "text", data_type_group: "text" };
}

function resultWith(
    columns: ColumnInfo[],
    rows: Record<string, string>[]
): QueryResult {
    return { columns, rows };
}

describe("escapeCsvValue", () => {
    it("passes plain values through unchanged", () => {
        expect(escapeCsvValue("hello")).toBe("hello");
        expect(escapeCsvValue("123")).toBe("123");
        expect(escapeCsvValue("")).toBe("");
    });

    it("quotes fields containing commas, quotes, or line breaks", () => {
        expect(escapeCsvValue("a,b")).toBe('"a,b"');
        expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
        expect(escapeCsvValue("line1\nline2")).toBe('"line1\nline2"');
        expect(escapeCsvValue("line1\rline2")).toBe('"line1\rline2"');
    });

    it("prefixes formula-like cells so spreadsheets treat them as text", () => {
        expect(escapeCsvValue("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
        expect(escapeCsvValue("+1+1")).toBe("'+1+1");
        expect(escapeCsvValue("-2")).toBe("'-2");
        expect(escapeCsvValue("@mention")).toBe("'@mention");
    });

    it("quotes formula-like cells that also need quoting", () => {
        expect(escapeCsvValue("=A1,B1")).toBe("\"'=A1,B1\"");
    });

    it("does not prefix values with leading trigger characters elsewhere", () => {
        expect(escapeCsvValue("a=b")).toBe("a=b");
        expect(escapeCsvValue("well-known")).toBe("well-known");
    });
});

describe("buildCsvContent", () => {
    it("builds header and data rows", () => {
        const result = resultWith([col("id"), col("name")], [
            { id: "1", name: "alice" },
            { id: "2", name: "bob" },
        ]);
        expect(buildCsvContent(result)).toBe("id,name\n1,alice\n2,bob");
    });

    it("escapes headers as well as cell values", () => {
        const result = resultWith([col('weird,"name'), col("note")], [
            { 'weird,"name': "x", note: "has, comma" },
        ]);
        expect(buildCsvContent(result)).toBe(
            '"weird,""name",note\nx,"has, comma"'
        );
    });

    it("renders null and undefined cells as empty strings", () => {
        const result = {
            columns: [col("a"), col("b")],
            rows: [{ a: null, b: undefined }],
        } as unknown as QueryResult;
        expect(buildCsvContent(result)).toBe("a,b\n,");
    });

    it("applies formula-prefix protection to cell values", () => {
        const result = resultWith([col("calc")], [{ calc: "=1+1" }]);
        expect(buildCsvContent(result)).toBe("calc\n'=1+1");
    });

    it("throws for results carrying an error", () => {
        const result: QueryResult = {
            columns: [col("a")],
            rows: [],
            hasError: true,
            error: "boom",
        };
        expect(() => buildCsvContent(result)).toThrow(
            "Cannot export results with errors"
        );
    });
});
