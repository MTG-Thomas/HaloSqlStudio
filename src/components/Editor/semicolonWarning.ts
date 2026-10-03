import type { WarningResult } from "@/lib/warnings";

/**
 * Finds 1-based line numbers containing a semicolon outside of string
 * literals ('...', "...", `...`). T-SQL doubling ('', "") is honored.
 * Only string literals are excluded, per the documented contract.
 */
export function findBareSemicolonLines(sql: string): number[] {
    const flagged = new Set<number>();
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let line = 1;

    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i];
        const next = sql[i + 1];

        if (ch === "\n") {
            line++;
            continue;
        }
        if (inSingle) {
            if (ch === "'") {
                if (next === "'") {
                    i++;
                } else {
                    inSingle = false;
                }
            }
            continue;
        }
        if (inDouble) {
            if (ch === '"') {
                if (next === '"') {
                    i++;
                } else {
                    inDouble = false;
                }
            }
            continue;
        }
        if (inBacktick) {
            if (ch === "`") inBacktick = false;
            continue;
        }

        if (ch === "'") inSingle = true;
        else if (ch === '"') inDouble = true;
        else if (ch === "`") inBacktick = true;
        else if (ch === ";") flagged.add(line);
    }

    return [...flagged].sort((a, b) => a - b);
}

/** Removes semicolons outside string literals, preserving literals. */
export function stripSemicolonsOutsideStrings(sql: string): string {
    let out = "";
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;

    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i];
        const next = sql[i + 1];

        if (inSingle) {
            out += ch;
            if (ch === "'") {
                if (next === "'") {
                    out += next;
                    i++;
                } else {
                    inSingle = false;
                }
            }
            continue;
        }
        if (inDouble) {
            out += ch;
            if (ch === '"') {
                if (next === '"') {
                    out += next;
                    i++;
                } else {
                    inDouble = false;
                }
            }
            continue;
        }
        if (inBacktick) {
            out += ch;
            if (ch === "`") inBacktick = false;
            continue;
        }

        if (ch === "'") {
            inSingle = true;
            out += ch;
        } else if (ch === '"') {
            inDouble = true;
            out += ch;
        } else if (ch === "`") {
            inBacktick = true;
            out += ch;
        } else if (ch !== ";") {
            out += ch;
        }
    }

    return out;
}

export function scanSemicolonWarning(sql: string): WarningResult[] {
    const lineNumbers = findBareSemicolonLines(sql);
    if (lineNumbers.length === 0) return [];
    return [
        {
            warning: {
                id: "bare-semicolon",
                title: "Semicolon outside string literal",
                description:
                    "Halo reports execute a single statement. Remove semicolons that are not inside string literals.",
                severity: "warning",
                category: "compatibility",
                test: (value: string) =>
                    findBareSemicolonLines(value).length > 0,
                fix: stripSemicolonsOutsideStrings,
            },
            lineNumbers,
        },
    ];
}
