import { lazy, Suspense, useCallback } from "react";
import { useSqlEditor } from "./hooks/useSqlEditor";

// Lazy load Monaco Editor to reduce initial bundle size
const MonacoWrapper = lazy(() =>
    import("./MonacoWrapper").then((module) => ({
        default: module.MonacoWrapper,
    }))
);

interface SqlEditorProps {
    sql: string;
    onContentChange: (sql: string) => void;
    onSave?: (sql: string) => void;
    onExecute?: (sql: string) => void;
    isReport?: boolean;
    originalSql?: string; // For reports, this is the original SQL from the database
}

export function SqlEditor({
    sql,
    onContentChange,
    onSave,
    onExecute,
    originalSql,
}: SqlEditorProps) {
    const { handleEditorChange, handleSave } = useSqlEditor({
        initialSql: sql,
        onContentChange,
        onSave,
        originalSql,
    });

    // Cmd/Ctrl+Enter: flush the freshest editor value, then execute it.
    const handleExecute = useCallback(
        (value: string) => {
            onContentChange(value);
            onExecute?.(value);
        },
        [onContentChange, onExecute]
    );

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 min-h-0">
                <Suspense
                    fallback={
                        <div className="flex items-center justify-center h-full bg-muted/20">
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                                <p className="text-sm text-muted-foreground">
                                    Loading SQL Editor...
                                </p>
                            </div>
                        </div>
                    }
                >
                    <MonacoWrapper
                        value={sql}
                        onChange={handleEditorChange}
                        readOnly={false}
                        onSave={handleSave}
                        onExecute={handleExecute}
                    />
                </Suspense>
            </div>
        </div>
    );
}
