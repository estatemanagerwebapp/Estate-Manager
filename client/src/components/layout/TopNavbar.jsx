import React, { useState } from 'react';
import { Search, Bell, ChevronDown, Menu, LogOut, User, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const TopNavbar = ({ onOpenMobileMenu }) => {
  const { user, logout } = useAuth();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const adminName = user ? `${user.firstName} ${user.lastName}` : 'Tobi John';
  const adminRole = user?.role === 'SUPER_ADMIN' ? 'Administrator' : (user?.role || 'Administrator');
  const avatarUrl = user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';

  return (
    <header className="h-20 bg-white border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30">
      {/* Left: Mobile hamburger & Search bar */}
      <div className="flex items-center gap-3 flex-1 max-w-lg">
        {/* Mobile menu button */}
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Global Search Input with ⌘K */}
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search residents, units, invoices, visitors..."
            className="w-full pl-10 pr-12 py-2 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-150"
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-400 bg-white border border-slate-200 rounded shadow-2xs">
              ⌘ K
            </kbd>
          </div>
        </div>
      </div>

      {/* Right: Notifications & Profile Pill */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="p-2.5 rounded-xl border border-slate-200/80 hover:bg-slate-50 text-slate-600 transition-colors relative cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-white"></span>
          </button>

          {/* Quick Notification Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-dropdown border border-slate-100 p-3 z-50 animate-fadeIn">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                <span className="text-xs font-bold text-slate-800">Notifications</span>
                <span className="text-[10px] text-primary font-bold cursor-pointer">Mark all read</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="p-2 rounded-xl bg-orange-50/50 border border-orange-100/60">
                  <div className="font-bold text-slate-800">Visitor John Adeyemi Entered</div>
                  <div className="text-[10px] text-slate-500">Court A • A1-02 • 10:24 AM</div>
                </div>
                <div className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100">
                  <div className="font-bold text-slate-800">Invoice Paid: INV-2026-001</div>
                  <div className="text-[10px] text-slate-500">₦120,000 • Amaka Okafor</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Chip with Dropdown */}
        <div className="relative">
          <button
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="flex items-center gap-3 pl-2 pr-3 py-1.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <img
              src={avatarUrl}
              alt={adminName}
              className="w-9 h-9 rounded-full object-cover border border-slate-200 shadow-2xs"
            />
            <div className="text-left hidden md:block">
              <div className="text-xs font-bold text-slate-900 leading-tight">{adminName}</div>
              <div className="text-[11px] text-slate-400 font-medium leading-none">{adminRole}</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {profileDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-dropdown border border-slate-100 py-1.5 z-50 animate-fadeIn">
              <div className="px-3 py-2 border-b border-slate-100 md:hidden">
                <div className="text-xs font-bold text-slate-900">{adminName}</div>
                <div className="text-[11px] text-slate-400">{adminRole}</div>
              </div>
              <button
                onClick={() => setProfileDropdownOpen(false)}
                className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
              >
                <User className="w-3.5 h-3.5 text-slate-400" />
                Profile Settings
              </button>
              <button
                onClick={() => setProfileDropdownOpen(false)}
                className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                Preferences
              </button>
              <div className="my-1 border-t border-slate-100"></div>
              <button
                onClick={logout}
                className="w-full px-3.5 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-500" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
