import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ToastProvider } from './toast/Toast';
import { RequireGuest, RequireAuth, RequirePermission } from './auth/RouteGuards';
import { AppShell } from './components/AppShell';
import { FoundationPage } from './pages/FoundationPage';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { OverviewPage } from './pages/OverviewPage';
import { AccountPage } from './pages/AccountPage';
import { UsersPage } from './pages/UsersPage';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {/* Unauthenticated */}
            <Route
              path="/login"
              element={
                <RequireGuest>
                  <LoginPage />
                </RequireGuest>
              }
            />
            <Route
              path="/forgot-password"
              element={
                <RequireGuest>
                  <ForgotPasswordPage />
                </RequireGuest>
              }
            />
            <Route
              path="/reset-password"
              element={
                <RequireGuest>
                  <ResetPasswordPage />
                </RequireGuest>
              }
            />

            {/* Authenticated */}
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/app" element={<OverviewPage />} />
              <Route
                path="/app/users"
                element={
                  <RequirePermission permission="user.manage">
                    <UsersPage />
                  </RequirePermission>
                }
              />
              <Route path="/app/account" element={<AccountPage />} />
            </Route>

            {/* Root: signed-in operators land on the overview; anonymous
                visitors get the Phase 0 foundation landing. */}
            <Route index element={<RootRedirect />} />
            <Route path="/foundation" element={<FoundationPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--color-surface)">
        <p className="text-sm text-(--color-ink-muted)" role="status">
          Checking your session…
        </p>
      </div>
    );
  }
  return <Navigate to={user ? '/app' : '/foundation'} replace />;
}
