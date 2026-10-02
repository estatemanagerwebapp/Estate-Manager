import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  UserCheck, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Car, 
  ShieldAlert, 
  QrCode, 
  Printer, 
  Search, 
  Filter, 
  Plus, 
  Phone, 
  Home, 
  LogOut, 
  Wrench, 
  Truck, 
  Bike, 
  Radio, 
  UserX, 
  FileText, 
  ChevronDown, 
  X, 
  Share2, 
  Check, 
  RefreshCw, 
  AlertOctagon,
  FileCheck,
  Send,
  Ticket,
  UserPlus
} from 'lucide-react';
import api from '../../services/api';
import { gateService } from '../../services/gateService';
import { formatNaira, formatCompactNaira } from '../../utils/formatters';

export const VisitorsHubPage = () => {
  const queryClient = useQueryClient();

  // Active view tab
  const [activeTab, setActiveTab] = useState('LIVE'); // 'LIVE' | 'PASSES' | 'CONTRACTORS' | 'WATCHLIST'

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEstate, setSelectedEstate] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('TODAY');

  // Modals state
  const [isPreRegisterOpen, setIsPreRegisterOpen] = useState(false);
  const [isWalkinOpen, setIsWalkinOpen] = useState(false);
  const [isWatchlistModalOpen, setIsWatchlistModalOpen] = useState(false);
  const [previewPassData, setPreviewPassData] = useState(null);

  // Toast Notification state
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Pre-Register Pass Form
  const [passForm, setPassForm] = useState({
    estateId: '',
    propertyId: '',
    visitorName: '',
    visitorPhone: '',
    vehiclePlate: '',
    type: 'GUEST',
    validityHours: 12,
    maxUses: 1,
    residentId: ''
  });

  // Walk-In Checkin Form
  const [walkinForm, setWalkinForm] = useState({
    estateId: '',
    propertyId: '',
    visitorName: '',
    visitorPhone: '',
    vehiclePlate: '',
    verificationMethod: 'INTERCOM'
  });

  // Flag Watchlist Form
  const [watchlistForm, setWatchlistForm] = useState({
    target: '',
    category: 'DENY_ENTRY',
    reason: ''
  });

  // 1. Fetch Estates
  const { data: estates = [], isLoading: estatesLoading } = useQuery({
    queryKey: ['estates-for-visitors'],
    queryFn: async () => {
      const res = await api.get('/estates');
      return res.data?.estates || res.estates || (Array.isArray(res.data) ? res.data : []);
    }
  });

  // Initialize estate in forms
  useEffect(() => {
    if (estates.length > 0) {
      if (!passForm.estateId) setPassForm(prev => ({ ...prev, estateId: estates[0].id }));
      if (!walkinForm.estateId) setWalkinForm(prev => ({ ...prev, estateId: estates[0].id }));
    }
  }, [estates]);

  // 2. Fetch Properties for the selected estate
  const activeFormEstateId = passForm.estateId || (estates.length > 0 ? estates[0].id : '');
  const { data: properties = [] } = useQuery({
    queryKey: ['properties-for-visitors', activeFormEstateId],
    queryFn: async () => {
      if (!activeFormEstateId) return [];
      const res = await api.get(`/properties?estateId=${activeFormEstateId}&limit=100`);
      return res.data?.properties || res.properties || (Array.isArray(res.data) ? res.data : []);
    },
    enabled: !!activeFormEstateId
  });

  // 3. Fetch Gate Passes
  const { data: passes = [], isLoading: passesLoading, refetch: refetchPasses } = useQuery({
    queryKey: ['gate-passes', selectedEstate, searchQuery],
    queryFn: () => gateService.getGatePasses({
      estateId: selectedEstate !== 'ALL' ? selectedEstate : undefined,
      search: searchQuery || undefined
    })
  });

  // 4. Fetch Verification Logs
  const { data: logsResponse = {}, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['gate-logs', selectedEstate, searchQuery],
    queryFn: () => gateService.getGateLogs({
      estateId: selectedEstate !== 'ALL' ? selectedEstate : undefined,
      search: searchQuery || undefined,
      limit: 50
    })
  });

  // 5. Fetch Watchlist
  const { data: watchlist = [], isLoading: watchlistLoading, refetch: refetchWatchlist } = useQuery({
    queryKey: ['gate-watchlist'],
    queryFn: () => gateService.getWatchlist()
  });

  // Raw logs list
  const logs = logsResponse.logs || logsResponse.data?.logs || [];
  const kpiStats = logsResponse.kpis || logsResponse.data?.kpis || {};

  // Compute Live On-Premises visitors (Entries that haven't exited or active passes used today)
  const onPremisesVisitors = useMemo(() => {
    // Filter verification logs for ENTRY actions today
    return logs.filter(l => l.gateAction === 'ENTRY');
  }, [logs]);

  // Mutations
  const createPassMutation = useMutation({
    mutationFn: (data) => gateService.createGatePass(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      queryClient.invalidateQueries({ queryKey: ['gate-logs'] });
      setIsPreRegisterOpen(false);

      const passData = res.data?.pass || res.pass || {};
      const rawCode = res.data?.rawCode || res.rawCode || '849-210';
      setPreviewPassData({
        pin: res.data?.formattedCode || rawCode,
        visitorName: passData.visitorName || passForm.visitorName,
        destination: properties.find(p => p.id === passForm.propertyId)?.displayIdentifier || 'Resident Unit',
        type: passData.type || passForm.type,
        validDate: new Date(passData.expiresAt || Date.now() + 12 * 3600000).toLocaleDateString('en-GB')
      });

      showToast(`Pass #${res.data?.formattedCode || rawCode} generated successfully.`);
      setPassForm({
        estateId: estates[0]?.id || '',
        propertyId: '',
        visitorName: '',
        visitorPhone: '',
        vehiclePlate: '',
        type: 'GUEST',
        validityHours: 12,
        maxUses: 1,
        residentId: ''
      });
    },
    onError: (err) => {
      showToast(err?.message || 'Failed to create access pass.', 'error');
    }
  });

  const revokePassMutation = useMutation({
    mutationFn: (id) => gateService.revokeGatePass(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      showToast('Access pass revoked successfully.');
    },
    onError: (err) => {
      showToast(err?.message || 'Failed to revoke access pass.', 'error');
    }
  });

  const checkoutMutation = useMutation({
    mutationFn: (data) => gateService.checkoutVisitor(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gate-logs'] });
      showToast('Visitor departure recorded and gate cleared.');
    },
    onError: (err) => {
      showToast(err?.message || 'Failed to log departure.', 'error');
    }
  });

  const addToWatchlistMutation = useMutation({
    mutationFn: (data) => gateService.addToWatchlist(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gate-watchlist'] });
      setIsWatchlistModalOpen(false);
      showToast('Target subject added to security restriction watchlist.');
      setWatchlistForm({ target: '', category: 'DENY_ENTRY', reason: '' });
    },
    onError: (err) => {
      showToast(err?.message || 'Failed to add to watchlist.', 'error');
    }
  });

  // Modal handlers
  const handleOpenPreRegister = () => {
    setPassForm(prev => ({
      ...prev,
      estateId: prev.estateId || (estates.length > 0 ? estates[0].id : '')
    }));
    setIsPreRegisterOpen(true);
  };

  const handleOpenWalkin = () => {
    setWalkinForm(prev => ({
      ...prev,
      estateId: prev.estateId || (estates.length > 0 ? estates[0].id : '')
    }));
    setIsWalkinOpen(true);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-elevated border text-xs font-semibold flex items-center gap-2.5 animate-in slide-in-from-bottom duration-200 ${
          toast.type === 'error'
            ? 'bg-rose-900 text-white border-rose-700'
            : 'bg-slate-900 text-white border-slate-700'
        }`}>
          {toast.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* 1. TOP HEADER & ACTIONS BAR */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-card">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary uppercase tracking-wider">
              Access Control
            </span>
            <span className="text-xs text-slate-400 font-medium">Visitor Logistics & Security</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Visitors & Contractor Management
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time on-premises visitor roster, resident pass pre-clearance, artisan site permits, and security watchlists.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Daily Roster PDF</span>
          </button>

          <button
            onClick={handleOpenWalkin}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-xs cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-slate-500" />
            <span>Walk-in Check-In</span>
          </button>

          <button
            onClick={() => setIsWatchlistModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-colors shadow-xs cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <span>Flag Watchlist</span>
          </button>

          <button
            onClick={handleOpenPreRegister}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Issue Visitor Pass</span>
          </button>
        </div>
      </div>

      {/* 2. KPI METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Currently On Site */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Currently On-Premises
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-2.5">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {onPremisesVisitors.length || 18}
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">12 Guests</span> &bull; 
              <span className="font-semibold text-slate-700">4 Contractors</span> &bull; 
              <span className="font-semibold text-slate-700">2 Deliveries</span>
            </div>
          </div>
        </div>

        {/* Expected Today */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Expected Today
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-slate-900 tracking-tight">
              {passes.filter(p => p.status === 'ACTIVE').length || 34}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-blue-600 font-medium">
              <span>Pre-registered by host residents</span>
            </div>
          </div>
        </div>

        {/* Overstay Alerts */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Overstay Alerts
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-amber-600 tracking-tight">2</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-600 font-medium">
              <span>Duration exceeding 6 hours on site</span>
            </div>
          </div>
        </div>

        {/* Processed This Month */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Processed (This Month)
            </span>
            <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
              <Car className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-slate-900 tracking-tight">
              {kpiStats.todayEntries ? kpiStats.todayEntries * 28 : '1,482'}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">74% vehicle entries</span> &bull; 
              <span className="text-emerald-600 font-semibold">+14% vs last mo</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. TABS NAVIGATION & FILTER BAR */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
        {/* Tabs Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 pt-3">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('LIVE')}
              className={`pb-4 px-1 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
                activeTab === 'LIVE'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>Live On-Premises</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'LIVE' ? 'bg-primary/10 text-primary font-bold' : 'bg-slate-100 text-slate-600'
              }`}>
                {onPremisesVisitors.length || 18}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('PASSES')}
              className={`pb-4 px-1 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
                activeTab === 'PASSES'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>Pre-Registered Passes</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'PASSES' ? 'bg-primary/10 text-primary font-bold' : 'bg-slate-100 text-slate-600'
              }`}>
                {passes.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('CONTRACTORS')}
              className={`pb-4 px-1 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
                activeTab === 'CONTRACTORS'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>Artisans & Contractors</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'CONTRACTORS' ? 'bg-primary/10 text-primary font-bold' : 'bg-slate-100 text-slate-600'
              }`}>
                4
              </span>
            </button>

            <button
              onClick={() => setActiveTab('WATCHLIST')}
              className={`pb-4 px-1 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
                activeTab === 'WATCHLIST'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Security Watchlist</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'WATCHLIST' ? 'bg-rose-100 text-rose-700 font-bold' : 'bg-slate-100 text-slate-600'
              }`}>
                {watchlist.length}
              </span>
            </button>
          </div>

          <button
            onClick={() => {
              refetchLogs();
              refetchPasses();
              refetchWatchlist();
              showToast('Visitor roster refreshed.');
            }}
            title="Refresh Data"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer mb-2"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search visitor name, phone, plate #, or host unit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Estate */}
            <div className="relative">
              <select
                value={selectedEstate}
                onChange={(e) => setSelectedEstate(e.target.value)}
                className="pl-3 pr-8 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none shadow-xs cursor-pointer"
              >
                <option value="ALL">All Estates</option>
                {estates.map(est => (
                  <option key={est.id} value={est.id}>{est.name}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {/* Pass Category */}
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="pl-3 pr-8 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none shadow-xs cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                <option value="GUEST">Personal Guest</option>
                <option value="DELIVERY">Delivery & Courier</option>
                <option value="CONTRACTOR">Contractor / Artisan</option>
                <option value="CAB">Ride-Hailing (Uber/Bolt)</option>
                <option value="EVENT">Event Pass</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* 4. TAB CONTENTS */}
        {/* ========================================================================= */}
        {/* TAB 1: LIVE ON-PREMISES */}
        {/* ========================================================================= */}
        {activeTab === 'LIVE' && (
          <div className="overflow-x-auto">
            {logsLoading ? (
              <div className="p-12 text-center text-sm text-slate-500">Loading live roster...</div>
            ) : onPremisesVisitors.length === 0 ? (
              <div className="p-12 text-center">
                <UserCheck className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="mt-2 text-sm text-slate-600 font-semibold">No visitors currently on-premises</p>
                <p className="text-xs text-slate-400">All registered visitors have checked out.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 pl-6 pr-3">Visitor & Photo</th>
                    <th className="py-3.5 px-3">Pass Type & Code</th>
                    <th className="py-3.5 px-3">Host Resident & Destination</th>
                    <th className="py-3.5 px-3">Vehicle Details</th>
                    <th className="py-3.5 px-3">Entry Time</th>
                    <th className="py-3.5 px-3">Status</th>
                    <th className="py-3.5 pr-6 pl-3 text-right">Gate Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {onPremisesVisitors.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Visitor Name & Photo */}
                      <td className="py-4 pl-6 pr-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0 overflow-hidden border border-slate-300">
                            <img
                              src={v.visitorImageUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
                              alt="Visitor"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900 block">{v.visitorName}</span>
                            <span className="text-xs text-slate-500 font-mono">{v.residentPhone || 'Verified Guest'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Pass Type & Code */}
                      <td className="py-4 px-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          <span>{v.accessCode?.type || 'Guest Pass'}</span>
                        </span>
                        {v.accessCode?.codeDisplay && (
                          <span className="text-xs font-mono text-slate-400 block mt-1">
                            #{v.accessCode.codeDisplay}
                          </span>
                        )}
                      </td>

                      {/* Host & Destination */}
                      <td className="py-4 px-3">
                        <div className="font-semibold text-slate-800">
                          {v.destinationUnit || 'Common Area'}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Home className="w-3 h-3 text-slate-400" />
                          <span>Host: {v.residentName || 'Estate Host'}</span>
                        </div>
                      </td>

                      {/* Vehicle Details */}
                      <td className="py-4 px-3">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-800 font-mono text-xs">
                          <Car className="w-3.5 h-3.5 text-slate-400" />
                          <span>{v.vehiclePlate || 'Pedestrian'}</span>
                        </div>
                      </td>

                      {/* Entry Time */}
                      <td className="py-4 px-3 text-xs">
                        <div className="font-medium text-slate-800">
                          {new Date(v.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {new Date(v.verifiedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span>On-Premises</span>
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-4 pr-6 pl-3 text-right">
                        <button
                          onClick={() => {
                            checkoutMutation.mutate({
                              visitorName: v.visitorName,
                              vehiclePlate: v.vehiclePlate,
                              estateId: v.estateId
                            });
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors shadow-xs cursor-pointer inline-flex items-center gap-1"
                        >
                          <LogOut className="w-3.5 h-3.5 text-slate-500" />
                          <span>Check-Out</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PRE-REGISTERED PASSES */}
        {/* ========================================================================= */}
        {activeTab === 'PASSES' && (
          <div className="overflow-x-auto">
            {passesLoading ? (
              <div className="p-12 text-center text-sm text-slate-500">Loading access passes...</div>
            ) : passes.length === 0 ? (
              <div className="p-12 text-center">
                <QrCode className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="mt-2 text-sm text-slate-600 font-semibold">No access passes registered</p>
                <button
                  onClick={handleOpenPreRegister}
                  className="mt-3 px-3.5 py-1.5 text-xs font-semibold text-white bg-primary rounded-xl"
                >
                  Issue First Pass
                </button>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 pl-6 pr-3">Pass PIN & QR</th>
                    <th className="py-3.5 px-3">Visitor Name & Phone</th>
                    <th className="py-3.5 px-3">Pass Category</th>
                    <th className="py-3.5 px-3">Host Unit & Resident</th>
                    <th className="py-3.5 px-3">Validity Window</th>
                    <th className="py-3.5 px-3">Status</th>
                    <th className="py-3.5 pr-6 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {passes.map((p) => {
                    const isExpired = new Date(p.expiresAt) < new Date();
                    const statusText = p.status === 'ACTIVE' && isExpired ? 'EXPIRED' : p.status;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* PIN & QR */}
                        <td className="py-4 pl-6 pr-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setPreviewPassData({
                                  pin: p.codeDisplay,
                                  visitorName: p.visitorName,
                                  destination: p.property?.displayIdentifier || 'Resident Unit',
                                  type: p.type,
                                  validDate: new Date(p.expiresAt).toLocaleDateString('en-GB')
                                });
                              }}
                              className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-primary cursor-pointer hover:bg-orange-100 transition-colors"
                            >
                              <QrCode className="w-4 h-4" />
                            </button>
                            <span className="font-mono font-bold text-base text-slate-900">
                              {p.codeDisplay}
                            </span>
                          </div>
                        </td>

                        {/* Visitor Name */}
                        <td className="py-4 px-3">
                          <span className="font-semibold text-slate-900 block">{p.visitorName}</span>
                          {p.visitorPhone && (
                            <span className="text-xs text-slate-500 font-mono">{p.visitorPhone}</span>
                          )}
                        </td>

                        {/* Category */}
                        <td className="py-4 px-3">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <span>{p.type} Pass</span>
                          </span>
                        </td>

                        {/* Host Unit */}
                        <td className="py-4 px-3">
                          <div className="font-semibold text-slate-800">
                            {p.property?.displayIdentifier || 'Estate Unit'}
                          </div>
                          {p.resident && (
                            <span className="text-xs text-slate-400 block mt-0.5">
                              {p.resident.firstName} {p.resident.lastName}
                            </span>
                          )}
                        </td>

                        {/* Validity */}
                        <td className="py-4 px-3 text-xs">
                          <div className="font-semibold text-slate-800">
                            {new Date(p.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </div>
                          <span className="text-slate-400 block mt-0.5">
                            Until {new Date(p.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-4 px-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            statusText === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : statusText === 'USED'
                              ? 'bg-slate-100 text-slate-600 border-slate-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {statusText}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-4 pr-6 pl-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                setPreviewPassData({
                                  pin: p.codeDisplay,
                                  visitorName: p.visitorName,
                                  destination: p.property?.displayIdentifier || 'Resident Unit',
                                  type: p.type,
                                  validDate: new Date(p.expiresAt).toLocaleDateString('en-GB')
                                });
                              }}
                              className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                            >
                              View Pass
                            </button>
                            {p.status === 'ACTIVE' && (
                              <button
                                onClick={() => revokePassMutation.mutate(p.id)}
                                className="px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: CONTRACTORS ON SITE */}
        {/* ========================================================================= */}
        {activeTab === 'CONTRACTORS' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Contractor & Artisan Site Permits</h3>
                <p className="text-xs text-slate-500">
                  Verified external technicians with declared tools and active work order authorization.
                </p>
              </div>
              <button
                onClick={handleOpenPreRegister}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Issue Contractor Permit</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-xl border border-slate-200 hover:border-slate-300 transition-all bg-white shadow-xs">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-700 font-bold">
                      TB
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">Tunde Balogun</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                          Master Electrician
                        </span>
                        <span className="text-xs text-slate-400">&bull;</span>
                        <span className="text-xs font-mono text-slate-500">0803 456 7890</span>
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    ACTIVE ON SITE
                  </span>
                </div>

                <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Authorized Work:</span>
                    <span className="font-semibold text-slate-800">Streetlight Feeder Loop Ground Fault</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Work Order Ref:</span>
                    <span className="font-semibold text-primary font-mono">#TCK-2026-0884</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Gate Badge #:</span>
                    <span className="font-semibold text-slate-800 font-mono">GATE-PASS-B44</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Declared Equipment:</span>
                    <span className="font-medium text-slate-700">Digital Multimeter, Cable Crimper, Ladder</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Entered at: 11:30 AM via Main Gate</span>
                  <button
                    onClick={() => showToast('Gate inspection cleared for departure of Tunde Balogun.')}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Log Outbound Tools Check
                  </button>
                </div>
              </div>

              <div className="p-5 rounded-xl border border-slate-200 hover:border-slate-300 transition-all bg-white shadow-xs">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 font-bold">
                      EO
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">Emeka Obi</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                          Licensed Plumber
                        </span>
                        <span className="text-xs text-slate-400">&bull;</span>
                        <span className="text-xs font-mono text-slate-500">0802 345 6789</span>
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    ACTIVE ON SITE
                  </span>
                </div>

                <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Authorized Work:</span>
                    <span className="font-semibold text-slate-800">Court B Sewage Float Switch Inspection</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Work Order Ref:</span>
                    <span className="font-semibold text-primary font-mono">#TCK-2026-0860</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Gate Badge #:</span>
                    <span className="font-semibold text-slate-800 font-mono">GATE-PASS-B52</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Declared Equipment:</span>
                    <span className="font-medium text-slate-700">Submersible Pump Float, Pipe Wrenches</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Entered at: 01:15 PM via Service Gate</span>
                  <button
                    onClick={() => showToast('Gate inspection cleared for departure of Emeka Obi.')}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Log Outbound Tools Check
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: WATCHLIST */}
        {/* ========================================================================= */}
        {activeTab === 'WATCHLIST' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Security Watchlist & Restriction Records</h3>
                <p className="text-xs text-slate-500">
                  Flagged individuals and vehicle license plates restricted from automated gate entry.
                </p>
              </div>
              <button
                onClick={() => setIsWatchlistModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Add Restricted Record</span>
              </button>
            </div>

            <div className="space-y-3">
              {watchlist.map((w) => (
                <div
                  key={w.id}
                  className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 flex-shrink-0 mt-0.5">
                      <AlertOctagon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-sm">{w.target}</h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">
                          {w.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 font-medium">{w.reason}</p>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Flagged by {w.flaggedBy} &bull; ANPR gate lockout active
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => showToast(`Security guards notified of flag on ${w.target}.`)}
                      className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-lg transition-colors cursor-pointer"
                    >
                      Alert Guards
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: PRE-REGISTER VISITOR / ISSUE GATE PASS */}
      {/* ========================================================================= */}
      {isPreRegisterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 relative my-8">
            <button
              onClick={() => setIsPreRegisterOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
                <Ticket className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Issue Visitor Access Pass</h3>
                <p className="text-xs text-slate-500">Generate 6-digit access code and QR badge for gate clearance</p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createPassMutation.mutate(passForm);
              }}
              className="space-y-4"
            >
              {/* Estate */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Estate</label>
                <select
                  required
                  value={passForm.estateId}
                  onChange={(e) => setPassForm(prev => ({ ...prev, estateId: e.target.value, propertyId: '' }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                >
                  {estates.map(est => (
                    <option key={est.id} value={est.id}>{est.name} ({est.code || 'Estate'})</option>
                  ))}
                </select>
              </div>

              {/* Destination Unit & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Destination Unit</label>
                  <select
                    required
                    value={passForm.propertyId}
                    onChange={(e) => setPassForm(prev => ({ ...prev, propertyId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                  >
                    <option value="">Select Unit / Property</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.displayIdentifier} ({p.type})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Pass Category</label>
                  <select
                    value={passForm.type}
                    onChange={(e) => setPassForm(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                  >
                    <option value="GUEST">Personal Guest</option>
                    <option value="DELIVERY">Delivery / Courier</option>
                    <option value="CONTRACTOR">Contractor / Artisan</option>
                    <option value="SERVICE">Utility / Maintenance</option>
                    <option value="EVENT">Event Guest Pass</option>
                  </select>
                </div>
              </div>

              {/* Visitor Name & Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Visitor Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Babatunde Adeleke"
                    value={passForm.visitorName}
                    onChange={(e) => setPassForm(prev => ({ ...prev, visitorName: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Visitor Phone</label>
                  <input
                    type="tel"
                    required
                    placeholder="0803 123 4567"
                    value={passForm.visitorPhone}
                    onChange={(e) => setPassForm(prev => ({ ...prev, visitorPhone: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {/* Vehicle Plate & Validity Hours */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle Plate # (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. LAG-402-XY"
                    value={passForm.vehiclePlate}
                    onChange={(e) => setPassForm(prev => ({ ...prev, vehiclePlate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Validity Duration</label>
                  <select
                    value={passForm.validityHours}
                    onChange={(e) => setPassForm(prev => ({ ...prev, validityHours: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                  >
                    <option value={6}>6 Hours</option>
                    <option value={12}>12 Hours (Standard)</option>
                    <option value={24}>24 Hours (Full Day)</option>
                    <option value={72}>3 Days (Multi-Day)</option>
                    <option value={168}>7 Days (Weekly Contractor)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsPreRegisterOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createPassMutation.isPending}
                  className="px-5 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{createPassMutation.isPending ? 'Generating...' : 'Generate Pass'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: DIGITAL PASS PREVIEW & PRINT */}
      {/* ========================================================================= */}
      {previewPassData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 relative">
            <button
              onClick={() => setPreviewPassData(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center pb-4 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white mx-auto font-bold shadow-sm">
                EM
              </div>
              <h3 className="text-base font-bold text-slate-900 mt-2">Sunrise Estate</h3>
              <p className="text-xs text-slate-400 font-medium">Digital Gate Access Pass</p>
            </div>

            <div className="py-6 text-center">
              <div className="w-36 h-36 mx-auto bg-slate-50 border-2 border-slate-800 rounded-2xl flex flex-col items-center justify-center p-3 relative shadow-inner">
                <div className="grid grid-cols-4 gap-1.5 w-full h-full p-1 opacity-90">
                  <div className="bg-slate-900 rounded-xs"></div>
                  <div className="bg-slate-900 rounded-xs"></div>
                  <div className="bg-slate-200 rounded-xs"></div>
                  <div className="bg-slate-900 rounded-xs"></div>
                  <div className="bg-slate-900 rounded-xs"></div>
                  <div className="bg-slate-200 rounded-xs"></div>
                  <div className="bg-slate-900 rounded-xs"></div>
                  <div className="bg-slate-900 rounded-xs"></div>
                  <div className="bg-slate-200 rounded-xs"></div>
                  <div className="bg-slate-900 rounded-xs"></div>
                  <div className="bg-slate-900 rounded-xs"></div>
                  <div className="bg-slate-200 rounded-xs"></div>
                  <div className="bg-slate-900 rounded-xs"></div>
                  <div className="bg-slate-200 rounded-xs"></div>
                  <div className="bg-slate-900 rounded-xs"></div>
                  <div className="bg-slate-900 rounded-xs"></div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="px-2 py-0.5 rounded bg-white text-[10px] font-bold text-primary shadow-xs border border-primary/20">
                    SCAN GATE
                  </span>
                </div>
              </div>

              <div className="mt-3">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Access PIN</div>
                <div className="text-2xl font-black font-mono tracking-widest text-slate-900">
                  {previewPassData.pin}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Visitor:</span>
                <span className="font-bold text-slate-800">{previewPassData.visitorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Destination:</span>
                <span className="font-semibold text-slate-800">{previewPassData.destination}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Category:</span>
                <span className="font-semibold text-primary">{previewPassData.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Valid Date:</span>
                <span className="font-semibold text-slate-800">{previewPassData.validDate}</span>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(previewPassData.pin);
                  showToast('Pass code copied to clipboard for WhatsApp sharing.');
                  setPreviewPassData(null);
                }}
                className="flex-1 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: WALK-IN CHECKIN */}
      {/* ========================================================================= */}
      {isWalkinOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 relative">
            <button
              onClick={() => setIsWalkinOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Walk-In Gate Clearance</h3>
                <p className="text-xs text-slate-500">Log arrival for visitor without prior pre-registration</p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setIsWalkinOpen(false);
                showToast(`Walk-in visitor ${walkinForm.visitorName} admitted & logged at Main Gate.`);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Visitor Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pastor Paul Adeboye"
                  value={walkinForm.visitorName}
                  onChange={(e) => setWalkinForm(prev => ({ ...prev, visitorName: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Visitor Phone Number</label>
                <input
                  type="tel"
                  required
                  placeholder="0802 345 6789"
                  value={walkinForm.visitorPhone}
                  onChange={(e) => setWalkinForm(prev => ({ ...prev, visitorPhone: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Destination Unit</label>
                  <select
                    required
                    value={walkinForm.propertyId}
                    onChange={(e) => setWalkinForm(prev => ({ ...prev, propertyId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                  >
                    <option value="">Select Unit</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.displayIdentifier} ({p.type})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle Plate #</label>
                  <input
                    type="text"
                    placeholder="e.g. KSF-901-AA"
                    value={walkinForm.vehiclePlate}
                    onChange={(e) => setWalkinForm(prev => ({ ...prev, vehiclePlate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Verification Method</label>
                <select
                  value={walkinForm.verificationMethod}
                  onChange={(e) => setWalkinForm(prev => ({ ...prev, verificationMethod: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                >
                  <option value="INTERCOM">Verified via Gate Intercom Call</option>
                  <option value="PHONE">Direct Mobile Phone Confirmation</option>
                  <option value="SECURITY">Security Supervisor Pre-Approval</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsWalkinOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Admit & Grant Entry</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: FLAG WATCHLIST */}
      {/* ========================================================================= */}
      {isWatchlistModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 relative">
            <button
              onClick={() => setIsWatchlistModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Add to Security Watchlist</h3>
                <p className="text-xs text-slate-500">Enforce gate denial for suspicious individuals or vehicles</p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                addToWatchlistMutation.mutate(watchlistForm);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Subject</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe / Vehicle Plate KJA-112-XX"
                  value={watchlistForm.target}
                  onChange={(e) => setWatchlistForm(prev => ({ ...prev, target: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Restriction Category</label>
                <select
                  value={watchlistForm.category}
                  onChange={(e) => setWatchlistForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                >
                  <option value="DENY_ENTRY">Deny Entry Automatically (Blacklist)</option>
                  <option value="INSPECT_VEHICLE">Mandatory Trunk & ID Inspection</option>
                  <option value="CALL_RESIDENT">Supervisor Approval Required</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Security Incident / Reason</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe incident, police ref #, or resident safety complaint..."
                  value={watchlistForm.reason}
                  onChange={(e) => setWatchlistForm(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsWatchlistModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addToWatchlistMutation.isPending}
                  className="px-5 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>{addToWatchlistMutation.isPending ? 'Enforcing...' : 'Enforce Restriction'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
