import React from 'react';
import { Routes, Route, Navigate, useOutletContext, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AppLayout } from '../layouts/AppLayout';
import { LoginPage } from '../pages/auth/LoginPage';
import { EstateProDashboard } from '../pages/admin/EstateProDashboard';
import { EstatesPage } from '../pages/admin/EstatesPage';
import { AddEstateWizardPage } from '../pages/admin/AddEstateWizardPage';
import { EstateDetailsPage } from '../pages/admin/EstateDetailsPage';
import { UnitsPage } from '../pages/admin/UnitsPage';
import { UnitDetailsPage } from '../pages/admin/UnitDetailsPage';
import { AddUnitPage } from '../pages/admin/AddUnitPage';
import { EditUnitPage } from '../pages/admin/EditUnitPage';
import { ResidentsPage } from '../pages/admin/ResidentsPage';
import { ResidentDetailsPage } from '../pages/admin/ResidentDetailsPage';
import { AddResidentPage } from '../pages/admin/AddResidentPage';
import { BillingHubPage } from '../pages/admin/BillingHubPage';
import { GateSecurityHubPage } from '../pages/admin/GateSecurityHubPage';
import { ResidentDashboard } from '../pages/resident/ResidentDashboard';
import { GuardGateView } from '../pages/guard/GuardGateView';
import { SuperAdminDashboard } from '../pages/super-admin/SuperAdminDashboard';

const DashboardWrapper = () => {
  const context = useOutletContext();
  return <EstateProDashboard {...context} />;
};

/** Spinner shown while auth state is being restored from localStorage */
const AuthLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

/**
 * ProtectedRoute — requires a valid session.
 * Unauthenticated users are sent to /login with the intended path saved in
 * location.state.from so LoginPage can redirect back after a successful login.
 */
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoader />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

/**
 * PublicRoute — only for unauthenticated users (e.g. /login).
 * Authenticated users are bounced to /admin so they never see the login page.
 */
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoader />;

  if (user) {
    const destination = location.state?.from?.pathname || '/admin';
    return <Navigate to={destination} replace />;
  }

  return children;
};

export const AppRoutes = () => {
  return (
    <Routes>
      {/* Public: login — redirect to /admin if already authenticated */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />

      {/* Protected: all admin / app routes */}
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        {/* Root → admin dashboard */}
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/admin" element={<DashboardWrapper />} />

        {/* Estates Suite */}
        <Route path="/admin/estates" element={<EstatesPage />} />
        <Route path="/admin/estates/new" element={<AddEstateWizardPage />} />
        <Route path="/admin/estates/:id" element={<EstateDetailsPage />} />

        {/* Units & Properties Suite */}
        <Route path="/admin/properties" element={<UnitsPage />} />
        <Route path="/admin/properties/new" element={<AddUnitPage />} />
        <Route path="/admin/properties/:id" element={<UnitDetailsPage />} />
        <Route path="/admin/properties/:id/edit" element={<EditUnitPage />} />

        {/* Residents Suite */}
        <Route path="/admin/residents" element={<ResidentsPage />} />
        <Route path="/admin/residents/new" element={<AddResidentPage />} />
        <Route path="/admin/residents/:id" element={<ResidentDetailsPage />} />

        {/* Invoicing & Billing Suite */}
        <Route path="/admin/invoices" element={<BillingHubPage />} />
        <Route path="/admin/billing" element={<BillingHubPage />} />
        <Route path="/admin/payments" element={<BillingHubPage />} />
        <Route path="/admin/dues" element={<BillingHubPage />} />

        {/* Gate Access & Visitor Suite */}
        <Route path="/admin/gate-access" element={<GateSecurityHubPage />} />
        <Route path="/admin/gate" element={<GateSecurityHubPage />} />
        <Route path="/admin/visitors" element={<GateSecurityHubPage />} />

        {/* Persona sub-modules */}
        <Route path="/resident" element={<ResidentDashboard />} />
        <Route path="/resident/*" element={<ResidentDashboard />} />
        <Route path="/guard" element={<GuardGateView />} />
        <Route path="/super-admin" element={<SuperAdminDashboard />} />

        {/* Unknown admin sub-paths → dashboard */}
        <Route path="/admin/*" element={<DashboardWrapper />} />
      </Route>

      {/* Any other unknown path → login (unauthenticated) or admin (authenticated) */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};
