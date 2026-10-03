import { afterEach, describe, expect, it, vi } from "vitest";
import { registerHaloTools } from "../src/webmcp/tools";
import { useEditorStore } from "../src/components/Editor/store/editorStore";
import { useExplorerStore } from "../src/stores/explorerStore";
import type { QueryResult } from "../src/services/api/types";
import type { QueryRecord } from "../src/hooks/useIndexedDB";

interface FakeModelContext {
    tools: Map<string, WebMCPTool>;
    registerTool: (tool: WebMCPTool) => Promise<undefined>;
}

function makeModelContext(): FakeModelContext {
    const tools = new Map<string, WebMCPTool>();
    return {
        tools,
        registerTool: (tool: WebMCPTool) => {
            tools.set(tool.name, tool);
            return Promise.resolve(undefined);
        },
    };
}

interface Harness {
    call: (
        name: string,
        input?: Record<string, unknown>,
        signal?: AbortSignal
    ) => Promise<unknown>;
    apiCalls: { sql: string }[];
    historyLimits: (number | undefined)[];
    reportCalls: { sql: string; name: string; description?: string }[];
}

async function setup(): Promise<Harness> {
    const modelContext = makeModelContext();
    vi.stubGlobal("document", { modelContext });
    const apiCalls: { sql: string }[] = [];
    const historyLimits: (number | undefined)[] = [];
    const reportCalls: {
        sql: string;
        name: string;
        description?: string;
    }[] = [];
    await registerHaloTools({
        executeQueryApi: (sql: string) => {
            apiCalls.push({ sql });
            const result: QueryResult = {
                columns: [
                    {
                        id: 1,
                        name: "n",
                        data_type: "int",
                        data_type_group: "number",
                    },
                ],
                rows: [{ n: "1" }],
                rowCount: 1,
                executionTime: 5,
            };
            return Promise.resolve(result);
        },
        getRecentQueries: (limit?: number) => {
            historyLimits.push(limit);
            const record: QueryRecord = {
                id: "h1",
                title: "past query",
                sql: "SELECT 1",
                timestamp: 1700000000000,
                lastModified: 1700000000000,
                isPinned: false,
                isFavorite: false,
                tags: [],
                rowCount: 1,
            };
            return Promise.resolve([record]);
        },
        createReport: (report) => {
            reportCalls.push(report);
            return Promise.resolve({ id: "99" });
        },
    });
    return {
        call: (name, input = {}, signal) => {
            const tool = modelContext.tools.get(name);
            if (!tool) throw new Error(`tool not registered: ${name}`);
            return Promise.resolve().then(() =>
                tool.execute(input, {
                    signal: signal ?? new AbortController().signal,
                })
            );
        },
        apiCalls,
        historyLimits,
        reportCalls,
    };
}

function resetActiveTab() {
    useEditorStore.getState().updateTab("console", {
        sql: "",
        queryResult: null,
        queryError: null,
        isExecuting: false,
    });
}

describe("registerHaloTools", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("registers the Halo tool set", async () => {
        const modelContext = makeModelContext();
        vi.stubGlobal("document", { modelContext });
        const names = await registerHaloTools({
            executeQueryApi: () => Promise.reject(new Error("unused")),
            getRecentQueries: () => Promise.resolve([]),
            createReport: () => Promise.resolve({ id: "x" }),
        });
        expect(names).toEqual([
            "halo.list_tables",
            "halo.get_active_sql",
            "halo.set_sql",
            "halo.execute_query",
            "halo.cancel_query",
            "halo.get_results",
            "halo.get_variables",
            "halo.set_variables",
            "halo.get_history",
            "halo.save_report",
        ]);
        for (const tool of modelContext.tools.values()) {
            expect(tool.description.length).toBeGreaterThan(10);
            expect(tool.inputSchema).toMatchObject({ type: "object" });
        }
    });

    it("no-ops without a model context and registers once per context", async () => {
        vi.stubGlobal("document", {});
        const deps = {
            executeQueryApi: () => Promise.reject(new Error("unused")),
            getRecentQueries: () => Promise.resolve([]),
            createReport: () => Promise.resolve({ id: "x" }),
        };
        expect(await registerHaloTools(deps)).toEqual([]);

        const modelContext = makeModelContext();
        vi.stubGlobal("document", { modelContext });
        expect(await registerHaloTools(deps)).toHaveLength(10);
        expect(await registerHaloTools(deps)).toEqual([]);
    });

    it("lists tables with an optional name filter", async () => {
        useExplorerStore.getState().setTables([
            {
                name: "tickets",
                columns: [
                    {
                        id: 1,
                        name: "id",
                        data_type: "int",
                        data_type_group: "number",
                    },
                ],
            },
            {
                name: "agents",
                columns: [
                    {
                        id: 2,
                        name: "name",
                        data_type: "text",
                        data_type_group: "text",
                    },
                ],
            },
        ]);
        const h = await setup();
        const all = (await h.call("halo.list_tables")) as {
            tables: { name: string }[];
        };
        expect(all.tables.map((t) => t.name)).toEqual(["tickets", "agents"]);
        const one = (await h.call("halo.list_tables", {
            name: "TICKETS",
        })) as { tables: { name: string }[] };
        expect(one.tables.map((t) => t.name)).toEqual(["tickets"]);
        useExplorerStore.getState().setTables([]);
    });

    it("reads and writes the active tab SQL", async () => {
        resetActiveTab();
        const h = await setup();
        await h.call("halo.set_sql", { sql: "SELECT 42" });
        expect(await h.call("halo.get_active_sql")).toMatchObject({
            tab_id: "console",
            sql: "SELECT 42",
        });
        await expect(h.call("halo.set_sql", { sql: 42 })).rejects.toThrow(
            "expected a string"
        );
        resetActiveTab();
    });

    it("executes the active query and caps returned rows", async () => {
        resetActiveTab();
        useEditorStore
            .getState()
            .updateTabContent("console", "SELECT * FROM big");
        const h = await setup();
        const outcome = (await h.call("halo.execute_query")) as Record<
            string,
            unknown
        >;
        expect(outcome).toMatchObject({ status: "ok", tab_id: "console" });
        expect(h.apiCalls).toEqual([{ sql: "SELECT * FROM big" }]);
        expect(
            useEditorStore.getState().getTabById("console")?.queryResult
        ).toBeTruthy();
        resetActiveTab();
    });

    it("reports an already-running query instead of stacking", async () => {
        useEditorStore.getState().updateTab("console", { isExecuting: true });
        const h = await setup();
        expect(await h.call("halo.execute_query")).toMatchObject({
            status: "already_running",
        });
        expect(h.apiCalls).toEqual([]);
        resetActiveTab();
    });

    it("propagates agent cancellation to the running query", async () => {
        resetActiveTab();
        const modelContext = makeModelContext();
        vi.stubGlobal("document", { modelContext });
        await registerHaloTools({
            executeQueryApi: (_sql: string, signal?: AbortSignal) =>
                new Promise<QueryResult>((_resolve, reject) => {
                    signal?.addEventListener("abort", () =>
                        reject(new Error("fetch aborted"))
                    );
                }),
            getRecentQueries: () => Promise.resolve([]),
            createReport: () => Promise.resolve({ id: "x" }),
        });
        const tool = modelContext.tools.get("halo.execute_query");
        if (!tool) throw new Error("execute tool missing");
        const controller = new AbortController();
        const pending = Promise.resolve(
            tool.execute({}, { signal: controller.signal })
        );
        await new Promise((r) => setTimeout(r, 10));
        controller.abort();
        expect(await pending).toMatchObject({
            status: "aborted",
            tab_id: "console",
        });
        resetActiveTab();
    });

    it("reads results with row caps and reports failures", async () => {
        const h = await setup();
        expect(await h.call("halo.get_results")).toMatchObject({
            executed: false,
        });
        useEditorStore.getState().updateTab("console", {
            queryResult: {
                columns: [
                    {
                        id: 1,
                        name: "n",
                        data_type: "int",
                        data_type_group: "number",
                    },
                ],
                rows: Array.from({ length: 60 }, (_, i) => ({
                    n: `${i}`,
                })),
                rowCount: 60,
                executionTime: 7,
            },
            queryError: null,
        });
        const capped = (await h.call("halo.get_results")) as Record<
            string,
            unknown
        >;
        expect(capped).toMatchObject({
            executed: true,
            row_count: 60,
            truncated: true,
        });
        expect((capped.rows as unknown[]).length).toBe(50);
        await expect(h.call("halo.get_results", { max_rows: 0 })).rejects.toThrow(
            "positive integer"
        );
        resetActiveTab();
    });

    it("merges variable overrides", async () => {
        useEditorStore.getState().setVariables({
            $agentid: "",
            $siteid: "",
            $clientid: "",
            "@startdate": "",
            "@enddate": "",
        });
        const h = await setup();
        const merged = (await h.call("halo.set_variables", {
            variables: { $agentid: "42", "@startdate": "2025-01-01" },
        })) as Record<string, string>;
        expect(merged.$agentid).toBe("42");
        expect(merged["@startdate"]).toBe("2025-01-01");
        expect(merged.$siteid).toBe("");
        expect(await h.call("halo.get_variables")).toMatchObject({
            $agentid: "42",
        });
        await expect(
            h.call("halo.set_variables", { variables: ["nope"] })
        ).rejects.toThrow("expected an object");
        useEditorStore.getState().setVariables({
            $agentid: "",
            $siteid: "",
            $clientid: "",
            "@startdate": "",
            "@enddate": "",
        });
    });

    it("reads history with a clamped limit", async () => {
        const h = await setup();
        const records = (await h.call("halo.get_history", {
            limit: 5,
        })) as Record<string, unknown>[];
        expect(h.historyLimits).toEqual([5]);
        expect(records).toMatchObject([
            { id: "h1", title: "past query", sql: "SELECT 1" },
        ]);
        await h.call("halo.get_history", { limit: 500 });
        expect(h.historyLimits[1]).toBe(100);
    });

    it("saves reports defaulting to the active SQL", async () => {
        resetActiveTab();
        useEditorStore
            .getState()
            .updateTabContent("console", "SELECT * FROM tickets");
        const h = await setup();
        expect(
            await h.call("halo.save_report", { name: " Open tickets " })
        ).toEqual({ id: "99", name: "Open tickets" });
        expect(h.reportCalls).toEqual([
            {
                sql: "SELECT * FROM tickets",
                name: "Open tickets",
                description: undefined,
            },
        ]);
        await expect(
            h.call("halo.save_report", { name: "  " })
        ).rejects.toThrow("must not be empty");
        resetActiveTab();
        await h.call("halo.set_sql", { sql: "" });
        await expect(
            h.call("halo.save_report", { name: "Empty" })
        ).rejects.toThrow("empty SQL");
        resetActiveTab();
    });

    it("cancels the active query", async () => {
        const h = await setup();
        expect(await h.call("halo.cancel_query")).toEqual({
            tab_id: "console",
            cancelled: true,
        });
    });
});
