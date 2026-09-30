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
  X
} from 'lucide-react';

export const Sidebar = ({ isOpen, onClose, onScanQR }) => {
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

      {/* Sidebar Container */}
      <aside className={`
        fixed top-0 bottom-0 left-0 z-50 w-64 bg-white border-r border-slate-200/80 
        flex flex-col justify-between transition-transform duration-300 ease-in-out
        lg:static lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Brand Header */}
        <div className="h-20 px-6 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-sm shadow-primary/30">
              {/* House shape icon */}
              <Building className="w-5 h-5 text-white" />
            </div>
            <div>
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
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Navigation Items */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
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
                  flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150
                  ${isActive 
                    ? 'bg-primary text-white shadow-sm shadow-primary/25' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }
                `}
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* Bottom CTA Card: Quick Gate Access */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="p-4 rounded-2xl bg-gradient-to-b from-orange-50/60 to-orange-100/40 border border-orange-200/60 text-center relative overflow-hidden">
            {/* Phone QR graphic simulation */}
            <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-white shadow-xs border border-orange-200/80 flex items-center justify-center text-primary">
              <QrCode className="w-6 h-6 text-primary" />
            </div>
            
            <h4 className="text-xs font-bold text-slate-800">Quick Gate Access</h4>
            <p className="text-[11px] text-slate-500 mt-0.5 mb-3 leading-snug">
              Scan visitor QR to verify entry
            </p>

            <button
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
        </div>
      </aside>
    </>
  );
};
