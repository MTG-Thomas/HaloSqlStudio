import { useCallback, useEffect, useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, History } from "lucide-react";
import { useIndexedDB, type QueryRecord } from "@/hooks/useIndexedDB";

interface HistoryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onOpenQuery: (record: QueryRecord) => void;
}

const MAX_PREVIEW_LENGTH = 120;

function formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
}

export function HistoryDialog({
    open,
    onOpenChange,
    onOpenQuery,
}: HistoryDialogProps) {
    const {
        isReady,
        getRecentQueries,
        searchQueries,
        deleteQuery,
    } = useIndexedDB();
    const [records, setRecords] = useState<QueryRecord[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const requestIdRef = useRef(0);

    // Debounce the search term: every search reads the full IndexedDB
    // history, so don't re-query on each keystroke.
    useEffect(() => {
        const timer = setTimeout(
            () => setDebouncedSearchTerm(searchTerm),
            250
        );
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const reload = useCallback(async () => {
        if (!isReady) return;
        const requestId = ++requestIdRef.current;
        setIsLoading(true);
        try {
            const rows = debouncedSearchTerm.trim()
                ? await searchQueries(debouncedSearchTerm.trim())
                : await getRecentQueries(100);
            // Ignore responses from superseded requests.
            if (requestIdRef.current !== requestId) return;
            rows.sort((a, b) => b.timestamp - a.timestamp);
            setRecords(rows);
        } catch (error) {
            console.warn("Failed to load query history:", error);
        } finally {
            if (requestIdRef.current === requestId) {
                setIsLoading(false);
            }
        }
    }, [isReady, debouncedSearchTerm, searchQueries, getRecentQueries]);

    useEffect(() => {
        if (open) void reload();
    }, [open, reload]);

    const handleDelete = useCallback(
        async (id: string) => {
            try {
                await deleteQuery(id);
                setRecords((prev) => prev.filter((r) => r.id !== id));
            } catch (error) {
                console.warn("Failed to delete history entry:", error);
            }
        },
        [deleteQuery]
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        Query History
                    </DialogTitle>
                    <DialogDescription>
                        Recently executed queries. Open one to load it into a
                        new tab.
                    </DialogDescription>
                </DialogHeader>

                <Input
                    placeholder="Search history…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />

                <div className="overflow-y-auto flex-1 min-h-0 space-y-2 pr-1">
                    {isLoading && (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                            Loading history…
                        </p>
                    )}
                    {!isLoading && records.length === 0 && (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                            No queries recorded yet.
                        </p>
                    )}
                    {records.map((record) => {
                        const preview =
                            record.sql.length > MAX_PREVIEW_LENGTH
                                ? `${record.sql.slice(0, MAX_PREVIEW_LENGTH)}…`
                                : record.sql;
                        return (
                            <div
                                key={record.id}
                                className="p-3 border border-border rounded-lg bg-muted/20"
                            >
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="font-medium text-sm truncate">
                                        {record.title || "Untitled query"}
                                    </span>
                                    <span className="text-xs text-muted-foreground flex-shrink-0">
                                        {formatTimestamp(record.timestamp)}
                                    </span>
                                </div>
                                <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words mb-2 font-mono">
                                    {preview || "(empty)"}
                                </pre>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-muted-foreground">
                                        {record.error
                                            ? `Error: ${record.error}`
                                            : `${record.rowCount ?? 0} rows${record.executionTime != null ? ` • ${record.executionTime} ms` : ""}`}
                                    </span>
                                    <span className="flex gap-2 flex-shrink-0">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs"
                                            onClick={() =>
                                                onOpenQuery(record)
                                            }
                                        >
                                            Open
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0"
                                            title="Delete history entry"
                                            onClick={() =>
                                                void handleDelete(record.id)
                                            }
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
}
