import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/layout/Sidebar';
import { TopNavbar } from '../components/layout/TopNavbar';
import { QuickGateModal } from '../components/dashboard/QuickGateModal';

export const AppLayout = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scanQROpen, setScanQROpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans antialiased text-slate-900">
      {/* Sidebar (Desktop sticky & Mobile Slideout Drawer) */}
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        onScanQR={() => setScanQROpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Sticky Top Navbar with Global Search & User Profile */}
        <TopNavbar onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        {/* Page Content View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          <Outlet context={{ isScanQROpen: scanQROpen, setIsScanQROpen: setScanQROpen }} />
        </main>
      </div>

      {/* Global Quick Gate QR Scan Modal */}
      <QuickGateModal
        isOpen={scanQROpen}
        onClose={() => setScanQROpen(false)}
      />
    </div>
  );
};
