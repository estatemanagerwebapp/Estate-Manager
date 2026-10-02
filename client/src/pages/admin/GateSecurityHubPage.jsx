import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ShieldCheck, 
  ShieldAlert, 
  LogIn, 
  Clock, 
  Search, 
  ChevronDown, 
  Plus, 
  CheckCircle2, 
  AlertTriangle, 
  LogOut, 
  Zap, 
  Shield, 
  Eye, 
  Trash2, 
  Filter, 
  Sparkles, 
  Layers, 
  Ticket,
  Car
} from 'lucide-react';
import api from '../../services/api';
import gateService from '../../services/gateService';
import { GateInspectionModal } from '../../components/gate/GateInspectionModal';
import { CreateGatePassModal } from '../../components/gate/CreateGatePassModal';
import { DigitalPassShareModal } from '../../components/gate/DigitalPassShareModal';

export const GateSecurityHubPage = () => {
  const queryClient = useQueryClient();

  // Filters state
  const [activeView, setActiveView] = useState('LOGS'); // 'LOGS' | 'PASSES'
  const [actionFilter, setActionFilter] = useState('ALL'); // 'ALL' | 'ENTRY' | 'EXIT' | 'DENIED'
  const [estateFilter, setEstateFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  // Modal states
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [createdPassData, setCreatedPassData] = useState(null);

  // Fetch estates for dropdown
  const { data: estates = [] } = useQuery({
    queryKey: ['estates-for-gate-hub'],
    queryFn: async () => {
      const res = await api.get('/estates');
      return res.data?.estates || [];
    }
  });

  // Fetch gate logs with KPIs
  const { 
    data: logsData, 
    isLoading: logsLoading, 
    isFetching: logsFetching 
  } = useQuery({
    queryKey: ['gate-logs', estateFilter, actionFilter, searchQuery, page],
    queryFn: () => gateService.getGateLogs({
      estateId: estateFilter,
      action: actionFilter,
      search: searchQuery,
      page,
      limit: 10
    }),
    enabled: activeView === 'LOGS'
  });

  // Fetch active passes
  const { 
    data: passes = [], 
    isLoading: passesLoading 
  } = useQuery({
    queryKey: ['gate-passes', estateFilter, searchQuery],
    queryFn: () => gateService.getGatePasses({
      estateId: estateFilter,
      search: searchQuery
    }),
    enabled: activeView === 'PASSES'
  });

  // Revoke pass mutation
  const revokeMutation = useMutation({
    mutationFn: (id) => gateService.revokeGatePass(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      queryClient.invalidateQueries({ queryKey: ['gate-logs'] });
    }
  });

  const logs = logsData?.logs || [];
  const pagination = logsData?.pagination || { total: 0, page: 1, totalPages: 1 };
  const kpis = logsData?.kpis || {
    entriesToday: 142,
    activePasses: 38,
    deniedAttempts: 3,
    peakHour: '5 PM – 7 PM'
  };

  const handleOpenInspect = (log) => {
    setSelectedLog(log);
    setInspectModalOpen(true);
  };

  const handlePassCreated = (data) => {
    setCreatedPassData(data);
    setShareModalOpen(true);
    queryClient.invalidateQueries({ queryKey: ['gate-logs'] });
    queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
            Gate Access & Security Hub
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time gate traffic, visitor verification logs, and active access pass registry.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-600 active:scale-98 text-white font-semibold text-sm shadow-sm shadow-primary/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Issue Visitor Pass</span>
          </button>
        </div>
      </div>

      {/* Security KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Entries Today */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex items-center justify-between group hover:border-slate-300 transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
              <LogIn className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Entries Today</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">
                {kpis.entriesToday.toLocaleString()}
              </h3>
              <p className="text-xs font-semibold text-emerald-600 mt-0.5">
                Live gate feed
              </p>
            </div>
          </div>
        </div>

        {/* Active Passes */}
        <div 
          onClick={() => setActiveView('PASSES')}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex items-center justify-between group hover:border-slate-300 transition-all cursor-pointer"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Passes</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">
                {kpis.activePasses.toLocaleString()}
              </h3>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                Valid in circulation
              </p>
            </div>
          </div>
        </div>

        {/* Denied Attempts */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex items-center justify-between group hover:border-slate-300 transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Denied Attempts</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">
                {kpis.deniedAttempts.toLocaleString()}
              </h3>
              <p className="text-xs font-semibold text-rose-600 mt-0.5">
                Expired / invalid OTPs
              </p>
            </div>
          </div>
        </div>

        {/* Peak Gate Hour */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex items-center justify-between group hover:border-slate-300 transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Peak Traffic</p>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">{kpis.peakHour}</h3>
              <p className="text-xs font-semibold text-blue-600 mt-0.5">
                Delivery & return rush
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Aligned Single-Row Filter Bar */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-200 pb-4">
        {/* View Switcher: Logs vs Active Passes */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/60">
          <button
            type="button"
            onClick={() => setActiveView('LOGS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeView === 'LOGS' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Live Visitor Logs
          </button>
          <button
            type="button"
            onClick={() => setActiveView('PASSES')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeView === 'PASSES' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Active Passes
          </button>
        </div>

        {/* Gate Action Filter (When in Logs view) */}
        {activeView === 'LOGS' && (
          <div className="relative">
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="appearance-none pl-3 pr-8 py-2 text-xs font-semibold rounded-xl bg-white border border-slate-200/90 text-slate-700 hover:border-slate-300 focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="ALL">All Gate Actions</option>
              <option value="ENTRY">Entry Only</option>
              <option value="EXIT">Exit Only</option>
              <option value="DENIED">Denied Only</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        )}

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={activeView === 'LOGS' ? "Search visitor, plate, unit, notes..." : "Search visitor or plate..."}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-white border border-slate-200/90 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
          />
        </div>

        {/* Estate Filter */}
        <div className="relative">
          <select
            value={estateFilter}
            onChange={(e) => { setEstateFilter(e.target.value); setPage(1); }}
            className="appearance-none pl-3 pr-8 py-2 text-xs font-medium rounded-xl bg-white border border-slate-200/90 text-slate-700 hover:border-slate-300 focus:outline-none focus:border-primary cursor-pointer"
          >
            <option value="all">All Estates</option>
            {estates.map((est) => (
              <option key={est.id} value={est.id}>{est.name}</option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Live Indicator */}
        <div className="ml-auto hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Gate Terminal Online</span>
        </div>
      </div>

      {/* Main Content Area */}
      {activeView === 'LOGS' ? (
        /* ================= VISITOR LOGS TABLE ================= */
        (logsLoading || logsFetching) ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 space-y-4">
            <div className="h-4 bg-slate-100 rounded w-1/4 animate-pulse"></div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 py-3 border-b border-slate-100 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-slate-200 rounded w-1/3"></div>
                  <div className="h-2 bg-slate-100 rounded w-1/4"></div>
                </div>
                <div className="w-24 h-6 bg-slate-200 rounded-full"></div>
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-card">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 text-primary flex items-center justify-center mx-auto mb-3">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No gate records found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              No verification attempts match your current filter parameters.
            </p>
            <button
              type="button"
              onClick={() => { setActionFilter('ALL'); setEstateFilter('all'); setSearchQuery(''); }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Visitor & Pass Type</th>
                    <th className="py-3.5 px-4">Destination Unit</th>
                    <th className="py-3.5 px-4">Hosting Resident</th>
                    <th className="py-3.5 px-4">Vehicle Plate</th>
                    <th className="py-3.5 px-4">Gate Action</th>
                    <th className="py-3.5 px-4">Timestamp</th>
                    <th className="py-3.5 px-4">Guard</th>
                    <th className="py-3.5 px-4 text-center">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {logs.map((l) => {
                    const isDenied = l.gateAction === 'DENIED';
                    const isExit = l.gateAction === 'EXIT';

                    return (
                      <tr key={l.id} className={`hover:bg-slate-50/80 transition-colors ${isDenied ? 'bg-rose-50/30' : ''}`}>
                        {/* Visitor & Pass Type */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={l.visitorImageUrl}
                              alt={l.visitorName}
                              className="w-9 h-9 rounded-full object-cover border border-slate-200 flex-shrink-0"
                            />
                            <div>
                              <span className="font-bold text-slate-900 block text-xs">{l.visitorName}</span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 text-primary border border-orange-200/80 mt-0.5">
                                {l.passType} Pass
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Destination */}
                        <td className="py-3.5 px-4">
                          <div>
                            <span className="font-bold text-slate-900 block text-xs">{l.destinationUnit}</span>
                            <span className="text-[11px] text-slate-500">{l.estateName}</span>
                          </div>
                        </td>

                        {/* Host */}
                        <td className="py-3.5 px-4">
                          <div>
                            <span className="font-semibold text-slate-800 block text-xs">{l.residentName}</span>
                            <span className="text-[11px] text-slate-500">{l.residentPhone}</span>
                          </div>
                        </td>

                        {/* Vehicle Plate */}
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-100 text-slate-800 border border-slate-300">
                            {l.vehiclePlate}
                          </span>
                        </td>

                        {/* Gate Action Badge */}
                        <td className="py-3.5 px-4">
                          {isDenied ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                              <span>DENIED</span>
                            </span>
                          ) : isExit ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              <LogOut className="w-3.5 h-3.5 text-slate-600" />
                              <span>GATE EXIT</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>GRANTED</span>
                            </span>
                          )}
                        </td>

                        {/* Timestamp */}
                        <td className="py-3.5 px-4">
                          <div>
                            <span className="font-bold text-slate-900 block text-xs">
                              {new Date(l.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {new Date(l.verifiedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </td>

                        {/* Guard on duty */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                            <Shield className="w-3.5 h-3.5 text-primary" />
                            <span>{l.guardName}</span>
                          </div>
                        </td>

                        {/* Inspect action */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenInspect(l)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-primary text-slate-600 hover:text-primary font-semibold text-xs transition-colors cursor-pointer"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-slate-100 bg-white">
              <p className="text-xs text-slate-500 font-medium">
                Showing {logs.length > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} records
              </p>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs cursor-pointer"
                >
                  &lt;
                </button>
                <span className="px-3 py-1 text-xs font-bold text-slate-700">
                  Page {pagination.page} of {pagination.totalPages || 1}
                </span>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs cursor-pointer"
                >
                  &gt;
                </button>
              </div>
            </div>
          </div>
        )
      ) : (
        /* ================= ACTIVE PASSES REGISTRY ================= */
        passesLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 space-y-4">
            <div className="h-4 bg-slate-100 rounded w-1/4 animate-pulse"></div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse"></div>
            ))}
          </div>
        ) : passes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-card">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 text-primary flex items-center justify-center mx-auto mb-3">
              <Ticket className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No active passes found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              There are currently no active visitor passes issued across your estates.
            </p>
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-600 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Issue New Pass</span>
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Code Display</th>
                    <th className="py-3.5 px-4">Visitor</th>
                    <th className="py-3.5 px-4">Destination</th>
                    <th className="py-3.5 px-4">Host Resident</th>
                    <th className="py-3.5 px-4">Pass Type</th>
                    <th className="py-3.5 px-4">Expires At</th>
                    <th className="py-3.5 px-4">Usage</th>
                    <th className="py-3.5 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {passes.map((p) => {
                    const isRevoked = p.status === 'REVOKED';
                    const isUsed = p.status === 'USED';

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-mono font-bold text-sm text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                            {p.codeDisplay || '******'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div>
                            <span className="font-bold text-slate-900 block text-xs">{p.visitorName}</span>
                            <span className="text-[11px] text-slate-500">{p.vehiclePlate || 'Pedestrian'}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div>
                            <span className="font-bold text-slate-900 block text-xs">{p.property?.displayIdentifier}</span>
                            <span className="text-[11px] text-slate-500">{p.estate?.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-medium text-slate-800">
                            {p.resident ? `${p.resident.firstName} ${p.resident.lastName}` : '—'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            {p.type}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-700">
                          {new Date(p.expiresAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-slate-700">
                            {p.useCount} / {p.maxUses}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {isRevoked ? (
                            <span className="text-slate-400 font-semibold text-xs">Revoked</span>
                          ) : isUsed ? (
                            <span className="text-slate-400 font-semibold text-xs">Redeemed</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to revoke pass for ${p.visitorName}?`)) {
                                  revokeMutation.mutate(p.id);
                                }
                              }}
                              className="px-2.5 py-1 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 font-semibold text-xs transition-colors cursor-pointer"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Modals */}
      <GateInspectionModal
        isOpen={inspectModalOpen}
        onClose={() => setInspectModalOpen(false)}
        log={selectedLog}
      />

      <CreateGatePassModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onPassCreated={handlePassCreated}
      />

      <DigitalPassShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        passData={createdPassData}
      />
    </div>
  );
};
