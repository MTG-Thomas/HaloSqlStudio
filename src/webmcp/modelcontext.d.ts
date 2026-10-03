/**
 * Ambient declarations for the experimental WebMCP API
 * (https://webmachinelearning.github.io/webmcp/), which TypeScript's DOM
 * library does not include yet. Covers only the surface this app uses:
 * imperative tool registration on `document.modelContext`.
 */

interface WebMCPToolAnnotations {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
    consequentialHint?: boolean;
    debugging?: boolean;
}

interface WebMCPToolExecuteOptions {
    signal: AbortSignal;
}

type WebMCPToolExecute = (
    input: Record<string, unknown>,
    options: WebMCPToolExecuteOptions
) => unknown | Promise<unknown>;

interface WebMCPTool {
    name: string;
    title?: string;
    description: string;
    inputSchema?: Record<string, unknown>;
    execute: WebMCPToolExecute;
    annotations?: WebMCPToolAnnotations;
}

interface WebMCPModelContext {
    registerTool(tool: WebMCPTool): Promise<undefined>;
}

interface Document {
    readonly modelContext?: WebMCPModelContext;
}
