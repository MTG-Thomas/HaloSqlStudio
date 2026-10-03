import {
    useCallback,
    useRef,
    useEffect,
    Suspense,
    lazy,
} from "react";
import type { editor, Position } from "monaco-editor";
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { useMonacoSetup } from "./hooks/useMonacoSetup";
import { useExplorerStore } from "@/stores/explorerStore";
import { useThemeStore } from "../theme";

// Use the bundled Monaco build instead of the CDN: the production
// Content-Security-Policy only allows scripts from 'self' and blob:.
loader.config({ monaco });
self.MonacoEnvironment = {
    getWorker: () => new editorWorker(),
};

// Lazy load Monaco Editor to reduce initial bundle size
const Editor = lazy(() => import("@monaco-editor/react"));

// The SQL completion provider is registered once per page load; it reads
// live table data from the explorer store on every invocation.
let sqlCompletionRegistered = false;

interface HaloVariableSuggestion {
    name: string;
    detail: string;
    documentation: string;
}

const HALO_VARIABLES: HaloVariableSuggestion[] = [
    {
        name: "$agentid",
        detail: "Halo variable",
        documentation:
            "Current agent ID. Leave blank to use the logged-in user.",
    },
    {
        name: "$siteid",
        detail: "Halo variable",
        documentation:
            "Current site ID. Leave blank to use the logged-in user.",
    },
    {
        name: "$clientid",
        detail: "Halo variable",
        documentation:
            "Current client ID. Leave blank to use the logged-in user.",
    },
    {
        name: "@startdate",
        detail: "Halo variable",
        documentation: "Report start date parameter.",
    },
    {
        name: "@enddate",
        detail: "Halo variable",
        documentation: "Report end date parameter.",
    },
];

interface MonacoWrapperProps {
    value: string;
    onChange: (value: string | undefined) => void;
    readOnly: boolean;
    onSave?: () => void;
    onExecute?: (value: string) => void;
}

export function MonacoWrapper({
    value,
    onChange,
    readOnly,
    onSave,
    onExecute,
}: MonacoWrapperProps) {
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const onExecuteRef = useRef(onExecute);
    const onSaveRef = useRef(onSave);
    const theme = useThemeStore((state) => state.theme);
    const monacoTheme = theme === "light" ? "vs" : "vs-dark";
    const { setupMonaco } = useMonacoSetup();

    useEffect(() => {
        onExecuteRef.current = onExecute;
    }, [onExecute]);

    // Keybindings are registered once at mount, so the save callback must
    // be read through a ref to stay current as the SQL changes.
    useEffect(() => {
        onSaveRef.current = onSave;
    }, [onSave]);

    // Apply light/dark theme changes to a mounted editor.
    useEffect(() => {
        editorRef.current?.updateOptions({ theme: monacoTheme });
    }, [monacoTheme]);

    const handleEditorDidMount = useCallback(
        (editor: editor.IStandaloneCodeEditor) => {
            editorRef.current = editor;

            // Setup Monaco with our custom configuration
            setupMonaco(editor);

            try {
                editor.addCommand(
                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                    () => {
                        onSaveRef.current?.();
                    }
                );
                editor.addCommand(
                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                    () => {
                        onExecuteRef.current?.(editor.getValue());
                    }
                );
            } catch (error) {
                console.warn("Failed to add command binding:", error);
            }
        },
        [setupMonaco]
    );

    // Cleanup editor on unmount
    useEffect(() => {
        const editor = editorRef.current;

        return () => {
            // Clean up Monaco editor instance
            if (editor) {
                editor.dispose();
            }
        };
    }, []);

    const handleEditorChange = useCallback(
        (value: string | undefined) => {
            onChange(value);
        },
        [onChange]
    );

    return (
        <Suspense fallback={<div>Loading Monaco Editor...</div>}>
            <Editor
                height="100%"
                defaultLanguage="sql"
                value={value}
                theme={monacoTheme}
                onChange={handleEditorChange}
                onMount={handleEditorDidMount}
                beforeMount={(monaco) => {
                    monaco.editor.defineTheme("vs-dark", {
                        base: "vs-dark",
                        inherit: true,
                        rules: [],
                        colors: {},
                    });

                    if (sqlCompletionRegistered) return;
                    sqlCompletionRegistered = true;

                    // Register completion provider for SQL language
                    const completionProvider = {
                        provideCompletionItems: (
                            model: editor.ITextModel,
                            position: Position
                        ) => {
                            const suggestions: monaco.languages.CompletionItem[] =
                                [];

                            // Halo variables ($agentid, @startdate, ...).
                            // Monaco's word detection skips $/@ prefixes, so
                            // match the prefix explicitly from the line text.
                            const linePrefix = model
                                .getLineContent(position.lineNumber)
                                .slice(0, position.column - 1);
                            const varMatch =
                                linePrefix.match(/([$@][A-Za-z0-9_]*)$/);
                            if (varMatch) {
                                const prefix =
                                    varMatch[1].toLowerCase();
                                const varRange = {
                                    startLineNumber: position.lineNumber,
                                    startColumn:
                                        position.column - varMatch[1].length,
                                    endLineNumber: position.lineNumber,
                                    endColumn: position.column,
                                };
                                HALO_VARIABLES.filter((variable) =>
                                    variable.name
                                        .toLowerCase()
                                        .startsWith(prefix)
                                ).forEach((variable) => {
                                    suggestions.push({
                                        label: variable.name,
                                        kind: monaco.languages
                                            .CompletionItemKind.Variable,
                                        insertText: variable.name,
                                        detail: variable.detail,
                                        sortText: `A${variable.name}`,
                                        range: varRange,
                                        documentation: {
                                            value: variable.documentation,
                                        },
                                    });
                                });
                            }

                            // Get the current word being typed - more reliable approach
                            const word = model.getWordAtPosition(position);
                            let currentWord = "";
                            let wordRange = null;

                            if (word) {
                                // Get the word at the current position
                                currentWord = word.word.toLowerCase();
                                // Calculate the word range
                                wordRange = {
                                    startLineNumber: position.lineNumber,
                                    startColumn: word.startColumn,
                                    endLineNumber: position.lineNumber,
                                    endColumn: word.endColumn,
                                };
                            } else {
                                // Fallback: get word until position (for when typing)
                                const wordUntil =
                                    model.getWordUntilPosition(position);
                                currentWord = wordUntil.word.toLowerCase();
                            }

                            // Skip if currentWord is too short (less than 1 character)
                            if (currentWord.length < 1) {
                                return { suggestions };
                            }

                            // Create a range for the current word position
                            let range;
                            if (wordRange) {
                                // Use the actual word range when available
                                range = wordRange;
                            } else {
                                // Fallback to cursor position
                                range = {
                                    startLineNumber: position.lineNumber,
                                    startColumn: position.column,
                                    endLineNumber: position.lineNumber,
                                    endColumn: position.column,
                                };
                            }

                            // SQL Keywords
                            const sqlKeywords = [
                                "SELECT",
                                "FROM",
                                "WHERE",
                                "JOIN",
                                "LEFT",
                                "RIGHT",
                                "INNER",
                                "OUTER",
                                "ON",
                                "AND",
                                "OR",
                                "NOT",
                                "IN",
                                "EXISTS",
                                "GROUP BY",
                                "HAVING",
                                "LIMIT",
                                "OFFSET",
                                "DISTINCT",
                                "COUNT",
                                "SUM",
                                "AVG",
                                "MIN",
                                "MAX",
                                "CASE",
                                "WHEN",
                                "THEN",
                                "ELSE",
                                "END",
                                "AS",
                                "ASC",
                                "DESC",
                                "NULL",
                                "IS NULL",
                                "IS NOT NULL",
                                "LIKE",
                                "ILIKE",
                                "BETWEEN",
                                "UNION",
                                "ALL",
                            ];

                            // Add table names FIRST - highest priority.
                            // Read live from the explorer store subscription.
                            const currentTables =
                                useExplorerStore.getState().tables;
                            currentTables.forEach((table) => {
                                const tableName = table.name;
                                const tableNameLower = tableName.toLowerCase();

                                // Only add tables that actually match what's being typed
                                if (tableNameLower.startsWith(currentWord)) {
                                    suggestions.push({
                                        label: tableName,
                                        kind: monaco.languages
                                            .CompletionItemKind.Class,
                                        insertText: tableName,
                                        detail: "Table",
                                        sortText: `A${tableName}`,
                                        range: range,
                                        documentation: {
                                            value: `Table: ${tableName}\nColumns: ${table.columns
                                                .map((col) => col.name)
                                                .join(", ")}`,
                                        },
                                    });

                                    // Add column names with table prefix
                                    table.columns.forEach((column) => {
                                        const columnName = column.name;
                                        const columnNameLower =
                                            columnName.toLowerCase();
                                        const fullName = `${tableName}.${columnName}`;
                                        const fullNameLower =
                                            fullName.toLowerCase();

                                        // Only add table.column combinations that match what's being typed
                                        if (
                                            fullNameLower.startsWith(
                                                currentWord
                                            )
                                        ) {
                                            suggestions.push({
                                                label: fullName,
                                                kind: monaco.languages
                                                    .CompletionItemKind.Field,
                                                insertText: fullName,
                                                detail: `Column (${column.data_type})`,
                                                sortText: `B${fullName}`,
                                                range: range,
                                                documentation: {
                                                    value: `Column: ${columnName}\nType: ${column.data_type}\nTable: ${tableName}`,
                                                },
                                            });
                                        }

                                        // Only add individual column names that match what's being typed
                                        if (
                                            columnNameLower.startsWith(
                                                currentWord
                                            )
                                        ) {
                                            suggestions.push({
                                                label: columnName,
                                                kind: monaco.languages
                                                    .CompletionItemKind.Field,
                                                insertText: columnName,
                                                detail: `Column (${column.data_type})`,
                                                sortText: `C${columnName}`,
                                                range: range,
                                                documentation: {
                                                    value: `Column: ${columnName}\nType: ${column.data_type}\nTable: ${tableName}`,
                                                },
                                            });
                                        }
                                    });
                                }
                            });

                            // Add SQL keywords LAST - lowest priority
                            sqlKeywords.forEach((keyword) => {
                                const keywordLower = keyword.toLowerCase();

                                // Only show keywords if they start with what's being typed
                                if (keywordLower.startsWith(currentWord)) {
                                    suggestions.push({
                                        label: keyword,
                                        kind: monaco.languages
                                            .CompletionItemKind.Keyword,
                                        insertText: keyword,
                                        detail: "SQL Keyword",
                                        sortText: `D${keyword}`,
                                        range: range,
                                    });
                                }
                            });

                            return { suggestions };
                        },
                    };

                    // Register completion provider once for the SQL language
                    monaco.languages.registerCompletionItemProvider(
                        "sql",
                        completionProvider
                    );
                }}
                options={{
                    padding: { top: 24, bottom: 24 },
                    acceptSuggestionOnEnter: "off",
                    tabCompletion: "on",
                    readOnly,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 14,
                    lineNumbers: "on",
                    roundedSelection: false,
                    scrollbar: {
                        vertical: "visible",
                        horizontal: "visible",
                    },
                    automaticLayout: true,
                    wordWrap: "on",
                    suggestOnTriggerCharacters: true,
                    quickSuggestions: true,
                    quickSuggestionsDelay: 0,
                    parameterHints: {
                        enabled: true,
                    },
                    hover: {
                        enabled: true,
                    },
                    contextmenu: true,
                    folding: true,
                    foldingStrategy: "indentation",
                    showFoldingControls: "always",
                    matchBrackets: "always",
                    autoClosingBrackets: "always",
                    autoClosingQuotes: "always",
                    autoClosingOvertype: "always",
                    autoSurround: "quotes",
                    tabSize: 4,
                    insertSpaces: true,
                    detectIndentation: false,
                    trimAutoWhitespace: true,
                    largeFileOptimizations: true,
                }}
            />
        </Suspense>
    );
}
