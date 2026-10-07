import React, { useEffect, useState, ReactNode, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as authService from "@/services/auth/authService";
import { useConfig } from "@/hooks/useConfig";
import { AuthContext, type AuthContextType } from "./useAuth";

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();
    const { config, isLoaded } = useConfig();

    // Check authentication status when config is loaded
    useEffect(() => {
        if (!isLoaded) return;

        const checkAuth = () => {
            const authenticated = authService.isAuthenticated();
            setIsAuthenticated(authenticated);
            setIsLoading(false);
        };

        checkAuth();
    }, [isLoaded]);

    const startAuth = async () => {
        try {
            await authService.startAuth({
                authServer: config.authServer,
                clientId: config.clientId,
                redirectUri: config.redirectUri,
            });
        } catch (error) {
            console.error("Failed to start auth:", error);
            throw error;
        }
    };

    const handleCallback = useCallback(
        async (code: string, state?: string | null): Promise<boolean> => {
            try {
                setIsLoading(true);

                const success = await authService.handleCallback(
                    {
                        authServer: config.authServer,
                        clientId: config.clientId,
                        redirectUri: config.redirectUri,
                    },
                    code,
                    state
                );

                if (success) {
                    // Re-check authentication status
                    const authenticated = authService.isAuthenticated();
                    setIsAuthenticated(authenticated);
                }

                setIsLoading(false);
                return success;
            } catch (error) {
                console.error("Failed to handle auth callback:", error);
                setIsLoading(false);
                return false;
            }
        },
        [config.authServer, config.clientId, config.redirectUri]
    );

    const logout = useCallback(async () => {
        setIsAuthenticated(false);
        await authService.logout({
            authServer: config.authServer,
            clientId: config.clientId,
            redirectUri: config.redirectUri,
        });
        navigate("/login");
    }, [config.authServer, config.clientId, config.redirectUri, navigate]);

    const value: AuthContextType = {
        isAuthenticated,
        isLoading,
        startAuth,
        logout,
        handleCallback,
    };

    return (
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
};
