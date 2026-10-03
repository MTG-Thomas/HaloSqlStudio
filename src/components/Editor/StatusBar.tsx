import { useEditorStore } from "./store/editorStore";
import { cn } from "@/lib/utils";

/** Per-tab status bar: reflects the active tab's rows / time / error. */
export function StatusBar() {
    const activeTab = useEditorStore((state) =>
        state.tabs.find((tab) => tab.id === state.activeTabId)
    );

    let dotClass = "bg-muted-foreground/50";
    let text = "Ready";
    let title = "No query executed in this tab";

    if (activeTab?.isExecuting) {
        dotClass = "bg-blue-500 animate-pulse";
        text = "Executing…";
        title = "Query is executing";
    } else if (activeTab?.queryError) {
        dotClass = "bg-destructive";
        text = `Error: ${activeTab.queryError}`;
        title = activeTab.queryError;
    } else if (activeTab?.queryResult) {
        const result = activeTab.queryResult;
        const rows = result.rowCount ?? result.rows.length;
        dotClass = "bg-green-500";
        text =
            result.executionTime != null
                ? `${rows} rows • ${result.executionTime} ms`
                : `${rows} rows`;
        title = text;
    }

    return (
        <div className="flex items-center gap-2 px-3 h-7 text-xs text-muted-foreground bg-card border-t border-border">
            <span
                className={cn("h-2 w-2 rounded-full flex-shrink-0", dotClass)}
                aria-hidden
            />
            <span className="truncate" title={title}>
                {text}
            </span>
        </div>
    );
}
