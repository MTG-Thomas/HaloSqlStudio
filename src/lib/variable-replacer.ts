/**
 * Validates a Halo id variable. Ids are substituted raw into SQL, so only
 * plain numeric ids are accepted.
 * @throws Error when the value is not a numeric id
 */
function assertNumericId(name: string, value: string): void {
    if (!/^\d+$/.test(value)) {
        throw new Error(
            `Invalid value for ${name}: expected a numeric id, received "${value}"`
        );
    }
}

/**
 * Validates a date variable (expected format: YYYY-MM-DD).
 * @throws Error when the value is not a valid date
 */
function assertValidDate(name: string, value: string): void {
    // Date.parse rolls impossible dates forward ("2025-02-30" becomes
    // March 2nd), so require the parsed date to round-trip exactly.
    const time = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? Date.parse(value)
        : Number.NaN;
    const roundTrips =
        !Number.isNaN(time) &&
        new Date(time).toISOString().slice(0, 10) === value;
    if (!roundTrips) {
        throw new Error(
            `Invalid value for ${name}: expected a date (YYYY-MM-DD), received "${value}"`
        );
    }
}

/**
 * Replaces Halo variables in SQL with their corresponding values.
 * Empty values keep the empty fallback: the placeholder is left in place so
 * the server substitutes the logged-in user's values.
 * @param sql - The SQL string containing variables
 * @param variables - Object containing variable values
 * @returns SQL with variables replaced
 * @throws Error when a set id is non-numeric or a set date is invalid
 */
export function replaceHaloVariables(
    sql: string,
    variables: Record<string, string>
): string {
    let processedSql = sql;

    // Replace id variables with their values if they're set
    for (const name of ["$agentid", "$siteid", "$clientid"] as const) {
        const value = variables[name];
        if (value) {
            assertNumericId(name, value);
            processedSql = processedSql.replace(
                new RegExp(`\\${name}`, "g"),
                value
            );
        }
    }

    // Replace date variables with SQL-formatted dates (wrapped in quotes)
    for (const name of ["@startdate", "@enddate"] as const) {
        const value = variables[name];
        if (value) {
            assertValidDate(name, value);
            processedSql = processedSql.replace(
                new RegExp(name.replace("@", "\\@"), "g"),
                `'${value}'`
            );
        }
    }

    return processedSql;
}

/**
 * Example usage and tests
 */
export const examples = {
    // Test SQL with variables
    testSql:
        "SELECT * FROM profiles WHERE agent_id = $agentid AND site_id = $siteid AND created_date >= @startdate AND created_date <= @enddate",

    // Test variables
    testVariables: {
        $agentid: "12345",
        $siteid: "67890",
        $clientid: "11111",
        "@startdate": "2025-01-01",
        "@enddate": "2025-01-31",
    },

    // Expected result
    expectedResult:
        "SELECT * FROM profiles WHERE agent_id = 12345 AND site_id = 67890 AND created_date >= '2025-01-01' AND created_date <= '2025-01-31'",
};
