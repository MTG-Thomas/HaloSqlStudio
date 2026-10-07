import { createContext, useContext } from "react";

export interface AuthContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    startAuth: () => Promise<void>;
    logout: () => Promise<void>;
    handleCallback: (code: string, state?: string | null) => Promise<boolean>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
    undefined
);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
