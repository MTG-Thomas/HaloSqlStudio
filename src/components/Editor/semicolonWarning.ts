import type { WarningResult } from "@/lib/warnings";

/**
 * Finds 1-based line numbers containing a semicolon outside of string
 * literals ('...', "...", `...`) and SQL comments (-- ..., / * ... * /).
 * T-SQL doubling ('', "") is honored.
 */
export function findBareSemicolonLines(sql: string): number[] {
    const flagged = new Set<number>();
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;
    let line = 1;

    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i];
        const next = sql[i + 1];

        if (ch === "\n") {
            line++;
            inLineComment = false;
            continue;
        }
        if (inLineComment) continue;
        if (inBlockComment) {
            if (ch === "*" && next === "/") {
                inBlockComment = false;
                i++;
            }
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
        else if (ch === "/" && next === "*") {
            inBlockComment = true;
            i++;
        } else if (ch === "-" && next === "-") {
            inLineComment = true;
            i++;
        } else if (ch === ";") flagged.add(line);
    }

    return [...flagged].sort((a, b) => a - b);
}

/**
 * Removes semicolons outside string literals and SQL comments,
 * preserving literals and comment text.
 */
export function stripSemicolonsOutsideStrings(sql: string): string {
    let out = "";
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i];
        const next = sql[i + 1];

        if (ch === "\n") inLineComment = false;
        if (inLineComment) {
            out += ch;
            continue;
        }
        if (inBlockComment) {
            out += ch;
            if (ch === "*" && next === "/") {
                out += next;
                i++;
                inBlockComment = false;
            }
            continue;
        }

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
        } else if (ch === "/" && next === "*") {
            inBlockComment = true;
            out += ch;
        } else if (ch === "-" && next === "-") {
            inLineComment = true;
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
                title: "Semicolon outside string literal or comment",
                description:
                    "Halo reports execute a single statement. Remove semicolons that are not inside string literals or comments.",
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
