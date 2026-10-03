import React, { useCallback, useMemo, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import {
    ColDef,
    GridOptions,
    ModuleRegistry,
    AllCommunityModule,
    type CellDoubleClickedEvent,
    type ICellRendererParams,
} from "ag-grid-community";
import { themeQuartz } from "ag-grid-community";
import type { QueryResult } from "@/services/api/types";
import { useEditorStore } from "../store/editorStore";
import { useThemeStore } from "../theme";
import { useToast } from "@/hooks/use-toast";

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

// AG Grid theme configuration (dark)
const darkTheme = themeQuartz.withParams({
    accentColor: "#3C83F6",
    backgroundColor: "#14161A",
    borderRadius: 0,
    browserColorScheme: "dark",
    chromeBackgroundColor: {
        ref: "foregroundColor",
        mix: 0.07,
        onto: "backgroundColor",
    },
    fontFamily: {
        googleFont: "IBM Plex Sans",
    },
    foregroundColor: "#FFF",
    headerBackgroundColor: "#191B1F",
    headerFontSize: 16,
    wrapperBorderRadius: 0,

    // Additional theme parameters for better appearance
    borderColor: "#2A2D31",
});

// AG Grid theme configuration (light)
const lightTheme = themeQuartz.withParams({
    accentColor: "#3C83F6",
    backgroundColor: "#FFFFFF",
    borderRadius: 0,
    browserColorScheme: "light",
    chromeBackgroundColor: {
        ref: "foregroundColor",
        mix: 0.07,
        onto: "backgroundColor",
    },
    fontFamily: {
        googleFont: "IBM Plex Sans",
    },
    foregroundColor: "#1F2328",
    headerBackgroundColor: "#F3F4F6",
    headerFontSize: 16,
    wrapperBorderRadius: 0,

    // Additional theme parameters for better appearance
    borderColor: "#E5E7EB",
});

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// NULL renders as styled italic text; empty string renders as nothing.
function nullAwareCellRenderer(params: ICellRendererParams): string {
    const value: unknown = params.value;
    if (value === null || value === undefined) {
        return '<span class="ag-null-value">NULL</span>';
    }
    if (value === "") {
        return '<span class="ag-empty-value"></span>';
    }
    return escapeHtml(String(value));
}

interface AgDataTableProps {
    result: QueryResult | null;
}

export const ResultsTable: React.FC<AgDataTableProps> = ({ result }) => {
    const gridRef = useRef<AgGridReact>(null);
    const { activeTabId } = useEditorStore();
    const theme = useThemeStore((state) => state.theme);
    const { toast } = useToast();

    // Get the current tab's global filter from the store
    const currentTab = useEditorStore((state) =>
        state.tabs.find((tab) => tab.id === activeTabId)
    );
    const globalFilter = currentTab?.globalFilter || "";

    const handleCellDoubleClicked = useCallback(
        (event: CellDoubleClickedEvent) => {
            const raw: unknown = event.value;
            const text =
                raw === null || raw === undefined ? "" : String(raw);
            const label =
                raw === null || raw === undefined
                    ? "NULL"
                    : text === ""
                      ? "(empty string)"
                      : text.length > 80
                        ? `${text.slice(0, 80)}…`
                        : text;
            navigator.clipboard
                .writeText(text)
                .then(() => {
                    toast({
                        title: "Cell copied",
                        description: label,
                    });
                })
                .catch(() => {
                    toast({
                        title: "Copy failed",
                        description: "Could not copy the cell value.",
                        variant: "destructive",
                    });
                });
        },
        [toast]
    );

    // Transform data for AG Grid
    const rowData = useMemo(() => {
        if (!result?.rows) return [];

        return result.rows.map((row, index) => ({
            id: index,
            ...row,
        }));
    }, [result]);

    // Generate column definitions dynamically
    const columnDefs = useMemo((): ColDef[] => {
        if (!result?.columns) return [];

        return result.columns.map((col) => ({
            field: col.name,
            headerName: col.name,
            sortable: true,
            filter: true,
            filterParams: {
                filterOptions: ["contains", "equals", "startsWith", "endsWith"],
                defaultOption: "contains",
            },
            resizable: true,
            minWidth: 120,
            maxWidth: 300,
            cellRenderer: nullAwareCellRenderer,
            cellStyle: {
                fontSize: "14px",
                padding: "8px 12px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
            },
        }));
    }, [result]);

    // Grid options
    const gridOptions: GridOptions = {
        // Data
        rowData,
        columnDefs,

        // Styling
        rowHeight: 40,
        headerHeight: 44,

        // Features
        enableCellTextSelection: true,
        suppressCellFocus: true,

        // Global Search
        quickFilterText: globalFilter,

        // Pagination
        pagination: true,
        paginationPageSize: 50,
        paginationPageSizeSelector: [25, 50, 100, 200],

        // Performance
        rowBuffer: 20,
        suppressAnimationFrame: false,

        // Enable Google Fonts loading for the theme
        loadThemeGoogleFonts: true,

        // Default column properties
        defaultColDef: {
            sortable: true,
            filter: true,
            resizable: true,
            minWidth: 120,
            maxWidth: 300,
            cellStyle: {
                fontSize: "14px",
                padding: "8px 12px",
                display: "flex",
                alignItems: "center",
            },
        },
    };

    return (
        <div className="w-full h-full">
            <div
                className="h-full w-full"
                style={{
                    height: "100%",
                    minHeight: "400px",
                }}
            >
                <AgGridReact
                    ref={gridRef}
                    {...gridOptions}
                    // Apply theme directly to the component
                    theme={theme === "light" ? lightTheme : darkTheme}
                    onCellDoubleClicked={handleCellDoubleClicked}
                />
            </div>
        </div>
    );
};
