import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AppLayout } from '../layouts/AppLayout';
import { LoginPage } from '../pages/auth/LoginPage';
import { ResidentDashboard } from '../pages/resident/ResidentDashboard';
import { GuardGateView } from '../pages/guard/GuardGateView';
import { SuperAdminDashboard } from '../pages/super-admin/SuperAdminDashboard';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role) && user.role !== 'SUPER_ADMIN') {
    return <Navigate to="/resident" replace />;
  }

  return children;
};

export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/resident" element={<ResidentDashboard />} />
        <Route path="/resident/billing" element={<ResidentDashboard />} />
        <Route path="/resident/complaints" element={<ResidentDashboard />} />
        
        <Route path="/guard" element={
          <ProtectedRoute allowedRoles={['GUARD', 'SUPER_ADMIN', 'ESTATE_ADMIN']}>
            <GuardGateView />
          </ProtectedRoute>
        } />

        <Route path="/super-admin" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
            <SuperAdminDashboard />
          </ProtectedRoute>
        } />

        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['ESTATE_ADMIN', 'SUPER_ADMIN']}>
            <SuperAdminDashboard />
          </ProtectedRoute>
        } />
      </Route>

      <Route path="*" element={<Navigate to="/resident" replace />} />
    </Routes>
  );
};
