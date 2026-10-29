import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/query';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ToastProvider } from './toast/Toast';
import { RequireGuest, RequireAuth, RequirePermission } from './auth/RouteGuards';
import { AppShell } from './components/AppShell';
import { FoundationPage } from './pages/FoundationPage';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { OnboardPage } from './pages/OnboardPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { OverviewPage } from './pages/OverviewPage';
import { ActivityPage } from './pages/activity/ActivityPage';
import { AccountPage } from './pages/AccountPage';
import { AdministratorsPage } from './pages/AdministratorsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ResidentsPage } from './pages/ResidentsPage';
import { SosAlertsPage } from './pages/SosAlertsPage';
import { MessagesPage } from './pages/MessagesPage';
import { ComplaintsPage } from './pages/ComplaintsPage';
import { BillingPage } from './pages/BillingPage';
import { FacilitiesPage } from './pages/FacilitiesPage';
import { OrgImportsPage } from './pages/imports/OrgImportsPage';
import { BookingsPage } from './pages/BookingsPage';
import { GatePage } from './pages/GatePage';
import { ResidentLoginPage } from './pages/ResidentLoginPage';
import { ResidentAppShell } from './components/ResidentAppShell';
import { ResidentDashboardPage } from './pages/ResidentDashboardPage';
import { ResidentChangePasswordPage } from './pages/ResidentChangePasswordPage';
import { ResidentProfilePage } from './pages/resident/ResidentProfilePage';
import { ResidentPropertiesPage } from './pages/resident/ResidentPropertiesPage';
import { ResidentInvoicesPage } from './pages/resident/ResidentInvoicesPage';
import { ResidentCodesPage } from './pages/resident/ResidentCodesPage';
import { ResidentComplaintsPage } from './pages/resident/ResidentComplaintsPage';
import { ResidentMessagesPage } from './pages/resident/ResidentMessagesPage';
import { ResidentCommunityPage } from './pages/resident/ResidentCommunityPage';
import { ResidentFacilitiesPage } from './pages/resident/ResidentFacilitiesPage';
import { ResidentBookingsPage } from './pages/resident/ResidentBookingsPage';
import { ResidentSosPage } from './pages/resident/ResidentSosPage';
import { ResidentNotificationsPage } from './pages/resident/ResidentNotificationsPage';
import { EstatesListPage } from './pages/estates/EstatesListPage';
import { EstateCreatePage } from './pages/estates/EstateCreatePage';
import { EstateDetailPage } from './pages/estates/EstateDetailPage';
import { PropertiesListPage } from './pages/properties/PropertiesListPage';
import { PropertyDetailPage } from './pages/properties/PropertyDetailPage';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
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
              <Route
                path="/onboard"
                element={
                  <RequireGuest>
                    <OnboardPage />
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
                  path="/app/activity"
                  element={
                    <RequirePermission permission="audit.read">
                      <ActivityPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/administrators"
                  element={
                    <RequirePermission permission="user.manage">
                      <AdministratorsPage />
                    </RequirePermission>
                  }
                />
                {/* Older bookmark: the Users screen became Administrators. */}
                <Route path="/app/users" element={<Navigate to="/app/administrators" replace />} />
                <Route
                  path="/app/residents"
                  element={
                    <RequirePermission permission="user.manage">
                      <ResidentsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/billing"
                  element={
                    <RequirePermission permission="billing.read">
                      <BillingPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/facilities"
                  element={
                    <RequirePermission permission="facility.read">
                      <FacilitiesPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/bookings"
                  element={
                    <RequirePermission permission="booking.read">
                      <BookingsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/gate"
                  element={
                    <RequirePermission permission="verification.read">
                      <GatePage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/sos"
                  element={
                    <RequirePermission permission="sos.read">
                      <SosAlertsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/messages"
                  element={
                    <RequirePermission permission="message.read">
                      <MessagesPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/complaints"
                  element={
                    <RequirePermission permission="complaint.read">
                      <ComplaintsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/settings"
                  element={
                    <RequirePermission permission="config.manage">
                      <SettingsPage />
                    </RequirePermission>
                  }
                />
                <Route path="/app/account" element={<AccountPage />} />

                {/* Phase 2: estates */}
                <Route
                  path="/app/estates"
                  element={
                    <RequirePermission permission="estate.read">
                      <EstatesListPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/estates/new"
                  element={
                    <RequirePermission permission="estate.manage">
                      <EstateCreatePage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/estates/:estateId"
                  element={
                    <RequirePermission permission="estate.read">
                      <EstateDetailPage />
                    </RequirePermission>
                  }
                />

                {/* Phase 2: properties */}
                <Route
                  path="/app/properties"
                  element={
                    <RequirePermission permission="property.read">
                      <PropertiesListPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/properties/:propertyId"
                  element={
                    <RequirePermission permission="property.read">
                      <PropertyDetailPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/app/imports"
                  element={
                    <RequirePermission permission="import.manage">
                      <OrgImportsPage />
                    </RequirePermission>
                  }
                />
              </Route>

              {/* Resident dashboard */}
              <Route
                path="/resident/login"
                element={
                  <RequireGuest>
                    <ResidentLoginPage />
                  </RequireGuest>
                }
              />
              <Route
                path="/resident/app"
                element={
                  <RequireAuth>
                    <ResidentAppShell />
                  </RequireAuth>
                }
              >
                <Route index element={<ResidentDashboardPage />} />
                <Route path="dashboard" element={<ResidentDashboardPage />} />
                <Route path="change-password" element={<ResidentChangePasswordPage />} />
                <Route path="profile" element={<ResidentProfilePage />} />
                <Route path="properties" element={<ResidentPropertiesPage />} />
                <Route path="invoices" element={<ResidentInvoicesPage />} />
                <Route path="codes" element={<ResidentCodesPage />} />
                <Route path="complaints" element={<ResidentComplaintsPage />} />
                <Route path="messages" element={<ResidentMessagesPage />} />
                <Route path="community" element={<ResidentCommunityPage />} />
                <Route path="facilities" element={<ResidentFacilitiesPage />} />
                <Route path="bookings" element={<ResidentBookingsPage />} />
                <Route path="sos" element={<ResidentSosPage />} />
                <Route path="notifications" element={<ResidentNotificationsPage />} />
              </Route>

              {/* Root: signed-in operators land on the overview; anonymous
                visitors get the Phase 0 foundation landing. */}
              <Route index element={<RootRedirect />} />
              <Route path="/foundation" element={<FoundationPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
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
