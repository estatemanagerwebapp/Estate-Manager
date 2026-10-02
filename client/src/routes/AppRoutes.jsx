import React from 'react';
import { Routes, Route, Navigate, useOutletContext } from 'react-router-dom';
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
import { ResidentDashboard } from '../pages/resident/ResidentDashboard';
import { GuardGateView } from '../pages/guard/GuardGateView';
import { SuperAdminDashboard } from '../pages/super-admin/SuperAdminDashboard';

const DashboardWrapper = () => {
  const context = useOutletContext();
  return <EstateProDashboard {...context} />;
};

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Allow preview even if not signed in, or automatically authenticate demo user
  return children;
};

export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        {/* Main EstatePro Command Center Dashboard */}
        <Route path="/" element={<DashboardWrapper />} />
        <Route path="/admin" element={<DashboardWrapper />} />
        
        {/* Estates Suite */}
        <Route path="/admin/estates" element={<EstatesPage />} />
        <Route path="/admin/estates/new" element={<AddEstateWizardPage />} />
        <Route path="/admin/estates/:id" element={<EstateDetailsPage />} />

        {/* Units & Properties Suite (Part 3) */}
        <Route path="/admin/properties" element={<UnitsPage />} />
        <Route path="/admin/properties/new" element={<AddUnitPage />} />
        <Route path="/admin/properties/:id" element={<UnitDetailsPage />} />
        <Route path="/admin/properties/:id/edit" element={<EditUnitPage />} />

        {/* Residents Suite (Part 4) */}
        <Route path="/admin/residents" element={<ResidentsPage />} />
        <Route path="/admin/residents/new" element={<AddResidentPage />} />
        <Route path="/admin/residents/:id" element={<ResidentDetailsPage />} />

        {/* Invoicing & Billing Suite */}
        <Route path="/admin/invoices" element={<BillingHubPage />} />
        <Route path="/admin/billing" element={<BillingHubPage />} />
        <Route path="/admin/payments" element={<BillingHubPage />} />
        <Route path="/admin/dues" element={<BillingHubPage />} />

        <Route path="/admin/*" element={<DashboardWrapper />} />

        {/* Persona sub-modules */}
        <Route path="/resident" element={<ResidentDashboard />} />
        <Route path="/resident/*" element={<ResidentDashboard />} />
        <Route path="/guard" element={<GuardGateView />} />
        <Route path="/super-admin" element={<SuperAdminDashboard />} />
      </Route>

      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
};
