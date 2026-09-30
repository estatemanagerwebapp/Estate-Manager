import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/layout/Sidebar';
import { TopNavbar } from '../components/layout/TopNavbar';
import { QuickGateModal } from '../components/dashboard/QuickGateModal';

export const AppLayout = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scanQROpen, setScanQROpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('estatepro_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('estatepro_sidebar_collapsed', String(next));
      } catch (err) {
        console.warn('Could not persist sidebar collapse state', err);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans antialiased text-slate-900 relative">
      {/* Sidebar (Fixed on Desktop, Slideout Drawer on Mobile) */}
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
        onScanQR={() => setScanQROpen(true)}
      />

      {/* Main Content Area: Dynamically offset based on sidebar state */}
      <div 
        className={`flex-1 flex flex-col min-w-0 min-h-screen transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        {/* Sticky Top Navbar */}
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
