import { create } from "zustand";

export type Theme = "light" | "dark";

const STORAGE_KEY = "halo-theme";

function resolveInitialTheme(): Theme {
    if (typeof window === "undefined") return "dark";
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    if (
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: light)").matches
    ) {
        return "light";
    }
    return "dark";
}

function applyTheme(theme: Theme): void {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.toggle("light", theme === "light");
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
}

interface ThemeState {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

const initialTheme = resolveInitialTheme();
applyTheme(initialTheme);

export const useThemeStore = create<ThemeState>((set, get) => ({
    theme: initialTheme,
    toggleTheme: () => {
        const next: Theme = get().theme === "light" ? "dark" : "light";
        applyTheme(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Storage unavailable (private mode); theme still applies.
        }
        set({ theme: next });
    },
    setTheme: (theme) => {
        applyTheme(theme);
        try {
            window.localStorage.setItem(STORAGE_KEY, theme);
        } catch {
            // Storage unavailable (private mode); theme still applies.
        }
        set({ theme });
    },
}));
