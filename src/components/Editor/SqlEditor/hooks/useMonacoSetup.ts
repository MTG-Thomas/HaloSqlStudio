import { useCallback } from "react";
import type { editor } from "monaco-editor";
import * as monaco from "monaco-editor";

export function useMonacoSetup() {
    // Setup Monaco editor keyboard shortcuts. Table names for completion
    // come from the explorer store subscription in MonacoWrapper.
    const setupMonaco = useCallback((editor: editor.IStandaloneCodeEditor) => {
        // Add keyboard shortcut for save (Ctrl+S)
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            // This will be handled by the parent component
            // We'll dispatch a custom event that the parent can listen to
            editor.trigger("keyboard", "save", {});
        });
    }, []);

    return {
        setupMonaco,
    };
}
