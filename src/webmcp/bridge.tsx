import { useEffect } from "react";
import { useApi } from "@/hooks/useApi";
import { useIndexedDB } from "@/hooks/useIndexedDB";
import { registerHaloTools } from "./tools";

/**
 * Renders nothing. Registers the WebMCP tools once the hooks they need
 * (API client, history) are available. Safe to mount anywhere inside the
 * authenticated app; registration no-ops without `document.modelContext`.
 */
export function WebMCPBridge() {
    const { executeQuery, createOrUpdateReport } = useApi();
    const { getRecentQueries } = useIndexedDB();

    useEffect(() => {
        void registerHaloTools({
            executeQueryApi: executeQuery,
            getRecentQueries,
            createReport: (report) => createOrUpdateReport(report),
        });
    }, [executeQuery, getRecentQueries, createOrUpdateReport]);

    return null;
}
