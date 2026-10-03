import { describe, expect, it } from "vitest";
import { replaceHaloVariables } from "../src/lib/variable-replacer";

describe("replaceHaloVariables", () => {
    it("replaces id variables raw and date variables quoted (happy path)", () => {
        const sql =
            "SELECT * FROM profiles WHERE agent_id = $agentid AND site_id = $siteid " +
            "AND client_id = $clientid AND created >= @startdate AND created <= @enddate";
        const variables = {
            $agentid: "12345",
            $siteid: "67890",
            $clientid: "11111",
            "@startdate": "2025-01-01",
            "@enddate": "2025-01-31",
        };
        expect(replaceHaloVariables(sql, variables)).toBe(
            "SELECT * FROM profiles WHERE agent_id = 12345 AND site_id = 67890 " +
                "AND client_id = 11111 AND created >= '2025-01-01' AND created <= '2025-01-31'"
        );
    });

    it("replaces every occurrence of a repeated placeholder", () => {
        const sql = "SELECT $agentid, $agentid";
        expect(replaceHaloVariables(sql, { $agentid: "7" })).toBe(
            "SELECT 7, 7"
        );
    });

    it("leaves SQL untouched when no variables are set", () => {
        const sql = "SELECT * FROM t WHERE a = $agentid AND d >= @startdate";
        expect(replaceHaloVariables(sql, {})).toBe(sql);
    });

    it.each(["$agentid", "$siteid", "$clientid"])(
        "rejects a non-numeric id for %s",
        (name) => {
            const sql = `SELECT * FROM t WHERE id = ${name}`;
            for (const bad of ["abc", "12a", "1.5", "-3", "1; DROP TABLE t"]) {
                expect(() =>
                    replaceHaloVariables(sql, { [name]: bad })
                ).toThrow(/numeric id/);
            }
        }
    );

    it("rejects SQL-injection-shaped id values", () => {
        expect(() =>
            replaceHaloVariables("SELECT $agentid", {
                $agentid: "1 OR 1=1",
            })
        ).toThrow(/numeric id/);
    });

    it.each(["@startdate", "@enddate"])(
        "rejects an invalid date for %s",
        (name) => {
            const sql = `SELECT * FROM t WHERE d >= ${name}`;
            for (const bad of [
                "not-a-date",
                "01/31/2025",
                "2025-13-01",
                "2025-01-32",
                "2025-1-1",
                "2025-01-01'; DROP TABLE t; --",
            ]) {
                expect(() =>
                    replaceHaloVariables(sql, { [name]: bad })
                ).toThrow(/date/);
            }
        }
    );

    it.each(["@startdate", "@enddate"])(
        "rejects impossible calendar dates for %s",
        (name) => {
            const sql = `SELECT * FROM t WHERE d >= ${name}`;
            for (const bad of ["2025-02-30", "2025-04-31", "2025-02-29"]) {
                expect(() =>
                    replaceHaloVariables(sql, { [name]: bad })
                ).toThrow(/date/);
            }
        }
    );

    it("accepts leap-day dates", () => {
        expect(
            replaceHaloVariables("SELECT * FROM t WHERE d >= @startdate", {
                "@startdate": "2024-02-29",
            })
        ).toBe("SELECT * FROM t WHERE d >= '2024-02-29'");
    });

    it("keeps placeholders for empty values (server-side fallback)", () => {
        const sql =
            "SELECT * FROM t WHERE a = $agentid AND s = $siteid AND d >= @startdate";
        expect(
            replaceHaloVariables(sql, {
                $agentid: "",
                $siteid: "",
                "@startdate": "",
            })
        ).toBe(sql);
    });

    it("replaces set values while leaving empty ones as placeholders", () => {
        const sql = "SELECT * FROM t WHERE a = $agentid AND s = $siteid";
        expect(
            replaceHaloVariables(sql, { $agentid: "42", $siteid: "" })
        ).toBe("SELECT * FROM t WHERE a = 42 AND s = $siteid");
    });
});
