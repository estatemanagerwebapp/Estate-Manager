import React from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Building2, 
  ShieldCheck, 
  KeyRound, 
  Receipt, 
  Wrench, 
  LogOut, 
  User, 
  Sliders
} from 'lucide-react';

export const AppLayout = () => {
  const { user, logout, activeEstate } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getNavLinks = () => {
    if (!user) return [];
    switch (user.role) {
      case 'SUPER_ADMIN':
        return [
          { label: 'Platform Hub', path: '/super-admin', icon: Sliders },
          { label: 'Gate Console', path: '/guard', icon: ShieldCheck },
          { label: 'Resident View', path: '/resident', icon: KeyRound }
        ];
      case 'GUARD':
        return [
          { label: 'Gate Checkpoint', path: '/guard', icon: ShieldCheck }
        ];
      case 'ESTATE_ADMIN':
        return [
          { label: 'Estate Operations', path: '/admin', icon: Building2 },
          { label: 'Gate Activity', path: '/guard', icon: ShieldCheck }
        ];
      case 'RESIDENT':
      default:
        return [
          { label: 'Access Codes', path: '/resident', icon: KeyRound },
          { label: 'Invoices & Dues', path: '/resident/billing', icon: Receipt },
          { label: 'Maintenance', path: '/resident/complaints', icon: Wrench }
        ];
    }
  };

  const navLinks = getNavLinks();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-800 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-slate-900 tracking-tight text-lg">Estate Manager</span>
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-indigo-50 text-indigo-700 tracking-wider">
                {user?.role?.replace('_', ' ') || 'PROD'}
              </span>
            </div>
          </div>

          {/* Right Action Menu */}
          <div className="flex items-center space-x-4">
            {activeEstate && (
              <div className="hidden md:flex items-center px-3 py-1 bg-slate-100 rounded-lg text-xs font-semibold text-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span>
                {activeEstate.name}
              </div>
            )}

            <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-slate-800">{user?.firstName} {user?.lastName}</div>
                <div className="text-[11px] text-slate-500">{user?.email}</div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 gap-6">
        {/* Sidebar Nav */}
        <aside className="hidden md:block w-56 flex-shrink-0 space-y-1">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </aside>

        {/* Content View */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation for PWA */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-2 flex justify-around items-center z-40 shadow-lg">
        {navLinks.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center py-1 text-[11px] font-medium transition-colors ${
                isActive ? 'text-indigo-600 font-bold' : 'text-slate-500'
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};
