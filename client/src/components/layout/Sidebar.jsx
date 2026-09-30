import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Building, 
  Layers, 
  Users, 
  ShieldCheck, 
  Receipt, 
  CreditCard, 
  Coins, 
  Wrench, 
  UserCheck, 
  Briefcase, 
  BarChart3, 
  Bell, 
  QrCode,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export const Sidebar = ({ 
  isOpen, 
  onClose, 
  isCollapsed = false, 
  onToggleCollapse, 
  onScanQR 
}) => {
  const navItems = [
    { label: 'Dashboard', path: '/admin', icon: LayoutDashboard, exact: true },
    { label: 'Estates', path: '/admin/estates', icon: Building },
    { label: 'Units & Properties', path: '/admin/properties', icon: Layers },
    { label: 'Residents', path: '/admin/residents', icon: Users },
    { label: 'Gate Access', path: '/admin/gate-access', icon: ShieldCheck },
    { label: 'Invoices', path: '/admin/invoices', icon: Receipt },
    { label: 'Payments', path: '/admin/payments', icon: CreditCard },
    { label: 'Dues & Fees', path: '/admin/dues', icon: Coins },
    { label: 'Maintenance', path: '/admin/maintenance', icon: Wrench },
    { label: 'Visitors', path: '/admin/visitors', icon: UserCheck },
    { label: 'Staff', path: '/admin/staff', icon: Briefcase },
    { label: 'Reports', path: '/admin/reports', icon: BarChart3 },
    { label: 'Notifications', path: '/admin/notifications', icon: Bell },
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div 
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 lg:hidden transition-opacity duration-300"
        />
      )}

      {/* Sidebar Container - Fixed Viewport with Isolated Independent Scrolling */}
      <aside 
        className={`
          fixed top-0 bottom-0 left-0 z-40 h-screen max-h-screen bg-white border-r border-slate-200/80 
          flex flex-col overflow-hidden transition-all duration-300 ease-in-out select-none
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${isCollapsed ? 'lg:w-20 w-64' : 'w-64'}
        `}
      >
        {/* Desktop Collapse Floating Edge Button */}
        <button
          type="button"
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden lg:flex absolute -right-3.5 top-7 w-7 h-7 rounded-full bg-white border border-slate-200 shadow-xs items-center justify-center text-slate-500 hover:text-primary hover:border-primary transition-all z-50 cursor-pointer"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4 text-slate-600 hover:text-primary" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-slate-600 hover:text-primary" />
          )}
        </button>

        {/* Brand Header - Pinned at top */}
        <div className={`h-20 flex-shrink-0 flex items-center border-b border-slate-100 ${
          isCollapsed ? 'lg:px-3 px-6 justify-center lg:justify-center' : 'px-6 justify-between'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary flex-shrink-0 flex items-center justify-center text-white shadow-sm shadow-primary/30">
              <Building className="w-5 h-5 text-white" />
            </div>
            
            <div className={`transition-opacity duration-200 min-w-0 ${
              isCollapsed ? 'lg:hidden block' : 'block'
            }`}>
              <span className="font-extrabold text-slate-900 tracking-tight text-xl leading-none block">
                Estate<span className="text-primary">Pro</span>
              </span>
              <span className="text-[10px] text-slate-400 font-medium tracking-wide">
                Manage. Secure. Thrive.
              </span>
            </div>
          </div>

          {/* Close button for mobile */}
          <button 
            type="button"
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Navigation Items - Independent Scroll Container with Overscroll Containment */}
        <nav 
          aria-label="Sidebar Navigation"
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain py-4 space-y-1 ${
            isCollapsed ? 'lg:px-2 px-4' : 'px-4'
          }`}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.label}
                to={item.path}
                onClick={() => {
                  if (window.innerWidth < 1024) onClose();
                }}
                className={({ isActive }) => `
                  flex items-center rounded-xl text-sm font-semibold transition-all duration-150 relative group
                  ${isCollapsed ? 'lg:justify-center lg:px-0 lg:py-2.5 px-3.5 py-2.5 gap-3' : 'px-3.5 py-2.5 gap-3'}
                  ${isActive 
                    ? 'bg-primary text-white shadow-sm shadow-primary/25' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }
                `}
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-800'}`} />
                    <span className={isCollapsed ? 'lg:hidden block' : 'block'}>
                      {item.label}
                    </span>

                    {/* Floating Tooltip when Collapsed on Desktop */}
                    {isCollapsed && (
                      <div className="hidden lg:group-hover:flex absolute left-full ml-3 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl pointer-events-none z-50 whitespace-nowrap items-center">
                        {item.label}
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom CTA Card: Quick Gate Access - Pinned at bottom */}
        <div className={`flex-shrink-0 border-t border-slate-100 bg-slate-50/50 ${
          isCollapsed ? 'lg:p-3 p-4' : 'p-4'
        }`}>
          {isCollapsed ? (
            <>
              {/* Collapsed Desktop Button */}
              <div className="hidden lg:flex justify-center">
                <button
                  type="button"
                  onClick={onScanQR}
                  title="Quick Gate Access: Scan QR"
                  className="w-12 h-12 rounded-xl bg-primary hover:bg-primary-600 active:scale-95 text-white flex items-center justify-center shadow-sm shadow-primary/30 transition-all cursor-pointer group relative"
                >
                  <QrCode className="w-5 h-5 text-white" />
                  <div className="hidden lg:group-hover:flex absolute left-full ml-3 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl pointer-events-none z-50 whitespace-nowrap items-center">
                    Quick Gate Access
                  </div>
                </button>
              </div>

              {/* Mobile Expanded Fallback */}
              <div className="lg:hidden p-4 rounded-2xl bg-gradient-to-b from-orange-50/60 to-orange-100/40 border border-orange-200/60 text-center relative overflow-hidden">
                <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-white shadow-xs border border-orange-200/80 flex items-center justify-center text-primary">
                  <QrCode className="w-6 h-6 text-primary" />
                </div>
                <h4 className="text-xs font-bold text-slate-800">Quick Gate Access</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 mb-3 leading-snug">
                  Scan visitor QR to verify entry
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (onScanQR) onScanQR();
                    onClose();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-primary hover:bg-primary-600 active:scale-98 text-white text-xs font-bold shadow-sm shadow-primary/25 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Scan QR</span>
                </button>
              </div>
            </>
          ) : (
            <div className="p-4 rounded-2xl bg-gradient-to-b from-orange-50/60 to-orange-100/40 border border-orange-200/60 text-center relative overflow-hidden">
              <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-white shadow-xs border border-orange-200/80 flex items-center justify-center text-primary">
                <QrCode className="w-6 h-6 text-primary" />
              </div>
              
              <h4 className="text-xs font-bold text-slate-800">Quick Gate Access</h4>
              <p className="text-[11px] text-slate-500 mt-0.5 mb-3 leading-snug">
                Scan visitor QR to verify entry
              </p>

              <button
                type="button"
                onClick={() => {
                  if (onScanQR) onScanQR();
                  if (window.innerWidth < 1024) onClose();
                }}
                className="w-full py-2 px-3 rounded-xl bg-primary hover:bg-primary-600 active:scale-98 text-white text-xs font-bold shadow-sm shadow-primary/25 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Scan QR</span>
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
