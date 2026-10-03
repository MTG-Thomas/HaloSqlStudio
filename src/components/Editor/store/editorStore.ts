import { create } from "zustand";
import { persist } from "zustand/middleware";
import { replaceHaloVariables } from "@/lib/variable-replacer";

export interface Tab {
    id: string;
    title: string;
    sql: string;
    isPinned: boolean;
    isReport: boolean;
    reportId?: string;
    originalSql?: string;
    hasUnsavedChanges: boolean;
    lastModified: number;
    // Query execution state
    queryResult?: QueryResult | null;
    isExecuting?: boolean;
    queryError?: string | null;
    // Search state
    globalFilter?: string;
}

// Import the QueryResult type
import type { QueryResult } from "@/services/api/types";

export const QUERY_CANCELLED_MESSAGE = "Query cancelled";

/**
 * Distinct outcome for a cancelled execution, so callers can tell "the
 * user stopped this run" apart from "the run failed" (null).
 */
export const EXECUTION_ABORTED = Symbol("execution-aborted");

/** One in-flight execution per tab so the Stop button can cancel it. */
const abortControllers = new Map<string, AbortController>();

function newTabId(): string {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {
        return `query-${crypto.randomUUID()}`;
    }
    return `query-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface EditorState {
    // State
    tabs: Tab[];
    activeTabId: string;
    editingTabId: string | null;
    variables: Record<string, string>;

    // Actions
    addTab: (title: string, sql?: string, metadata?: Partial<Tab>) => void;
    updateTab: (id: string, updates: Partial<Tab>) => void;
    closeTab: (id: string) => void;
    setActiveTab: (id: string) => void;
    startEditingTab: (id: string) => void;
    stopEditingTab: () => void;

    // Report-specific actions
    createReportTab: (report: {
        id: string;
        name: string;
        sql: string;
    }) => void;
    saveReport: (
        tabId: string,
        updateReportFn: (reportId: string, sql: string) => Promise<void>
    ) => Promise<void>;
    updateTabContent: (tabId: string, sql: string) => void;

    // Query execution actions
    executeQuery: (
        tabId: string,
        executeQueryFn: (
            sql: string,
            signal?: AbortSignal
        ) => Promise<QueryResult>
    ) => Promise<QueryResult | typeof EXECUTION_ABORTED | null>;
    cancelQuery: (tabId: string) => void;
    clearQueryResult: (tabId: string) => void;

    // Search actions
    setGlobalFilter: (tabId: string, filter: string) => void;
    clearGlobalFilter: (tabId: string) => void;

    // Variables actions
    setVariables: (variables: Record<string, string>) => void;

    // Utility
    getActiveTab: () => Tab | undefined;
    getTabById: (id: string) => Tab | undefined;
}

export const useEditorStore = create<EditorState>()(
    persist(
        (set, get) => ({
            // Initial state
            tabs: [
                {
                    id: "console",
                    title: "Console",
                    sql: "",
                    isPinned: true,
                    isReport: false,
                    hasUnsavedChanges: false,
                    lastModified: Date.now(),
                },
            ],
            activeTabId: "console",
            editingTabId: null,
            variables: {
                $agentid: "",
                $siteid: "",
                $clientid: "",
                "@startdate": "",
                "@enddate": "",
            },

            // Actions
            addTab: (title, sql = "", metadata = {}) => {
                const newTab: Tab = {
                    id: newTabId(),
                    title,
                    sql,
                    isPinned: false,
                    isReport: false,
                    hasUnsavedChanges: false,
                    lastModified: Date.now(),
                    ...metadata,
                };

                set((state) => ({
                    tabs: [...state.tabs, newTab],
                    activeTabId: newTab.id,
                }));
            },

            updateTab: (id, updates) => {
                set((state) => ({
                    tabs: state.tabs.map((tab) =>
                        tab.id === id
                            ? { ...tab, ...updates, lastModified: Date.now() }
                            : tab
                    ),
                }));
            },

            closeTab: (id) => {
                const state = get();
                if (id === "console") return; // Don't close console tab

                const newTabs = state.tabs.filter((tab) => tab.id !== id);
                let newActiveTabId = state.activeTabId;

                // If we're closing the active tab, switch to another tab
                if (state.activeTabId === id) {
                    const remainingTabs = newTabs.filter(
                        (tab) => !tab.isPinned
                    );
                    if (remainingTabs.length > 0) {
                        newActiveTabId =
                            remainingTabs[remainingTabs.length - 1].id;
                    } else {
                        newActiveTabId = "console";
                    }
                }

                set({
                    tabs: newTabs,
                    activeTabId: newActiveTabId,
                });
            },

            setActiveTab: (id) => {
                set({ activeTabId: id });
            },

            startEditingTab: (id) => {
                set({ editingTabId: id });
            },

            stopEditingTab: () => {
                set({ editingTabId: null });
            },

            // Report-specific actions
            createReportTab: (report) => {
                const newTab: Tab = {
                    id: newTabId(),
                    title: `Report: ${report.name}`,
                    sql: report.sql,
                    isPinned: false,
                    isReport: true,
                    reportId: report.id,
                    originalSql: report.sql,
                    hasUnsavedChanges: false,
                    lastModified: Date.now(),
                };

                set((state) => ({
                    tabs: [...state.tabs, newTab],
                    activeTabId: newTab.id,
                }));
            },

            saveReport: async (tabId, updateReportFn) => {
                const tab = get().getTabById(tabId);
                if (tab?.isReport && tab.reportId) {
                    try {
                        // Call the actual API
                        await updateReportFn(tab.reportId, tab.sql);

                        // Update the tab to clear unsaved changes
                        get().updateTab(tabId, {
                            hasUnsavedChanges: false,
                            originalSql: tab.sql,
                        });
                    } catch (error) {
                        console.error("Failed to save report:", error);
                        throw error; // Re-throw so the UI can handle it
                    }
                }
            },

            updateTabContent: (tabId, sql) => {
                const state = get();
                const tab = state.getTabById(tabId);
                if (!tab) return;

                const hasUnsavedChanges = tab.isReport
                    ? sql !== tab.originalSql
                    : false;

                state.updateTab(tabId, {
                    sql,
                    hasUnsavedChanges,
                });
            },

            // Query execution actions
            executeQuery: async (tabId, executeQueryFn) => {
                const tab = get().getTabById(tabId);
                if (!tab) return null;

                // Cancel any previous in-flight execution for this tab.
                abortControllers.get(tabId)?.abort();
                const controller = new AbortController();
                abortControllers.set(tabId, controller);

                set((state) => ({
                    tabs: state.tabs.map((t) =>
                        t.id === tabId
                            ? {
                                  ...t,
                                  isExecuting: true,
                                  queryResult: null,
                                  queryError: null,
                              }
                            : t
                    ),
                }));

                const startedAt = Date.now();
                try {
                    // Replace Halo variables in SQL before execution
                    const state = get();
                    const processedSql = replaceHaloVariables(
                        tab.sql,
                        state.variables
                    );

                    const result = await executeQueryFn(
                        processedSql,
                        controller.signal
                    );
                    if (controller.signal.aborted)
                        return EXECUTION_ABORTED;
                    const withTime: QueryResult =
                        result.executionTime == null
                            ? {
                                  ...result,
                                  executionTime: Date.now() - startedAt,
                              }
                            : result;
                    set((state) => ({
                        tabs: state.tabs.map((t) =>
                            t.id === tabId
                                ? {
                                      ...t,
                                      queryResult: withTime,
                                      isExecuting: false,
                                  }
                                : t
                        ),
                    }));
                    return withTime;
                } catch (error) {
                    if (controller.signal.aborted)
                        return EXECUTION_ABORTED;
                    const queryError =
                        error instanceof Error
                            ? error.message
                            : "Failed to execute query";
                    set((state) => ({
                        tabs: state.tabs.map((t) =>
                            t.id === tabId
                                ? {
                                      ...t,
                                      queryError,
                                      isExecuting: false,
                                  }
                                : t
                        ),
                    }));
                    return null;
                } finally {
                    if (abortControllers.get(tabId) === controller) {
                        abortControllers.delete(tabId);
                    }
                }
            },

            cancelQuery: (tabId) => {
                abortControllers.get(tabId)?.abort();
                abortControllers.delete(tabId);
                set((state) => ({
                    tabs: state.tabs.map((t) =>
                        t.id === tabId && t.isExecuting
                            ? {
                                  ...t,
                                  isExecuting: false,
                                  queryError: QUERY_CANCELLED_MESSAGE,
                              }
                            : t
                    ),
                }));
            },

            clearQueryResult: (tabId) => {
                set((state) => ({
                    tabs: state.tabs.map((t) =>
                        t.id === tabId
                            ? { ...t, queryResult: null, queryError: null }
                            : t
                    ),
                }));
            },

            // Search actions
            setGlobalFilter: (tabId, filter) => {
                set((state) => ({
                    tabs: state.tabs.map((t) =>
                        t.id === tabId ? { ...t, globalFilter: filter } : t
                    ),
                }));
            },

            clearGlobalFilter: (tabId) => {
                set((state) => ({
                    tabs: state.tabs.map((t) =>
                        t.id === tabId ? { ...t, globalFilter: "" } : t
                    ),
                }));
            },

            // Variables actions
            setVariables: (variables) => {
                set({ variables });
            },

            // Utility
            getActiveTab: () => {
                const state = get();
                return state.tabs.find((tab) => tab.id === state.activeTabId);
            },

            getTabById: (id) => {
                const state = get();
                return state.tabs.find((tab) => tab.id === id);
            },
        }),
        {
            name: "editor-storage",
            partialize: (state) => ({
                tabs: state.tabs.map((tab) => ({
                    ...tab,
                    queryResult: undefined, // Don't persist query results
                    isExecuting: false, // Don't persist execution state
                    queryError: null, // Don't persist errors
                })),
                activeTabId: state.activeTabId,
            }),
        }
    )
);
