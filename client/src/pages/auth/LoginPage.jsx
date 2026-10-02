import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Building2, Shield, User, Key, AlertCircle } from 'lucide-react';

export const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('admin@estatemanager.io');
  const [password, setPassword] = useState('Admin@12345');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await login(email, password);
      // Redirect back to the page the user originally tried to visit, or role default
      const from = location.state?.from?.pathname;
      if (from && from !== '/login') {
        navigate(from, { replace: true });
      } else if (res.data?.user?.role === 'SUPER_ADMIN') {
        navigate('/admin/estates', { replace: true });
      } else if (res.data?.user?.role === 'GUARD') {
        navigate('/guard', { replace: true });
      } else {
        navigate('/admin', { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const setDemoUser = (roleEmail, defaultRoute) => {
    setEmail(roleEmail);
    setPassword('Admin@12345');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl border border-slate-100">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-white mb-3 shadow-lg shadow-primary/30">
            <Building2 className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Estate Manager</h1>
          <p className="text-sm text-slate-500 font-medium">Enterprise Property & Gate Ecosystem</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-rose-700 font-medium leading-relaxed">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email Address"
            type="email"
            placeholder="resident@estatemanager.io"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <Button type="submit" className="w-full mt-2" loading={loading}>
            Sign In
          </Button>
        </form>

        {/* Quick Demo Personas Switcher */}
        <div className="mt-8 pt-6 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 text-center">
            Quick Persona Switch
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setDemoUser('admin@estatemanager.io', '/super-admin')}
              className="p-2 rounded-xl bg-slate-50 hover:bg-orange-50/60 hover:border-primary/40 border border-slate-200 text-xs font-semibold text-slate-700 flex flex-col items-center gap-1 transition-colors cursor-pointer"
            >
              <Shield className="w-4 h-4 text-primary" />
              <span>Super Admin</span>
            </button>
            <button
              type="button"
              onClick={() => setDemoUser('guard@estatemanager.io', '/guard')}
              className="p-2 rounded-xl bg-slate-50 hover:bg-orange-50/60 hover:border-primary/40 border border-slate-200 text-xs font-semibold text-slate-700 flex flex-col items-center gap-1 transition-colors cursor-pointer"
            >
              <Key className="w-4 h-4 text-emerald-600" />
              <span>Guard</span>
            </button>
            <button
              type="button"
              onClick={() => setDemoUser('resident@estatemanager.io', '/resident')}
              className="p-2 rounded-xl bg-slate-50 hover:bg-orange-50/60 hover:border-primary/40 border border-slate-200 text-xs font-semibold text-slate-700 flex flex-col items-center gap-1 transition-colors cursor-pointer"
            >
              <User className="w-4 h-4 text-primary" />
              <span>Resident</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
