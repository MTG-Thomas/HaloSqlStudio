export interface QueryResult {
    rows: Record<string, unknown>[];
    columns?: string[];
    rowCount?: number;
    executionTime?: number;
    hasError?: boolean;
    error?: string;
}

export interface Report {
    id: string;
    name: string;
    sql: string;
}
