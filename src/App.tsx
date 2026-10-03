import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "./contexts/AuthContext";
import Index from "./pages/Index";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";

const App = () => (
    <ErrorBoundary>
        <TooltipProvider>
            <Toaster />
            <BrowserRouter>
                <AuthProvider>
                    <Routes>
                        <Route
                            path="/"
                            element={
                                <ProtectedRoute>
                                    <Index />
                                </ProtectedRoute>
                            }
                        />
                        <Route path="/login" element={<Login />} />
                        <Route
                            path="/auth/callback"
                            element={<AuthCallback />}
                        />
                        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </AuthProvider>
            </BrowserRouter>
        </TooltipProvider>
    </ErrorBoundary>
);

export default App;
