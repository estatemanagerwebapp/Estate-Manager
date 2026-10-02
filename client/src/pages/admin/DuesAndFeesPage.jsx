import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Coins, 
  CheckCircle2, 
  AlertTriangle, 
  Receipt, 
  Search, 
  ChevronDown, 
  Plus, 
  Send, 
  Calculator, 
  Layers, 
  Clock, 
  TrendingUp, 
  Building, 
  CreditCard,
  RefreshCw,
  Info,
  SlidersHorizontal
} from 'lucide-react';
import api from '../../services/api';
import duesService from '../../services/duesService';
import { formatNaira, formatCompactNaira, getNairaTextSizeClass } from '../../utils/formatters';
import { CreateFeeScheduleModal } from '../../components/dues/CreateFeeScheduleModal';
import { BatchAssessModal } from '../../components/dues/BatchAssessModal';
import { SendDuesReminderModal } from '../../components/dues/SendDuesReminderModal';
import { RecordPaymentModal } from '../../components/billing/RecordPaymentModal';

export const DuesAndFeesPage = () => {
  const queryClient = useQueryClient();

  // Filters & State
  const [activeTab, setActiveTab] = useState('SCHEDULES'); // 'SCHEDULES' | 'LEDGER'
  const [estateFilter, setEstateFilter] = useState('all');
  const [complianceStatusFilter, setComplianceStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [isCompactCurrency, setIsCompactCurrency] = useState(false);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [assessModalOpen, setAssessModalOpen] = useState(false);
  const [selectedScheduleForAssess, setSelectedScheduleForAssess] = useState(null);
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [targetUnitForReminder, setTargetUnitForReminder] = useState(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch estates
  const { data: estates = [] } = useQuery({
    queryKey: ['estates-for-dues-hub'],
    queryFn: async () => {
      const res = await api.get('/estates');
      return res.data?.estates || [];
    }
  });

  // Fetch fee schedules & KPIs
  const { 
    data: duesData, 
    isLoading: schedulesLoading, 
    refetch: refetchSchedules 
  } = useQuery({
    queryKey: ['dues-schedules-kpis', estateFilter],
    queryFn: () => duesService.getDuesKPIsAndSchedules({ estateId: estateFilter })
  });

  // Fetch unit compliance ledger
  const { 
    data: ledgerData, 
    isLoading: ledgerLoading, 
    refetch: refetchLedger 
  } = useQuery({
    queryKey: ['dues-compliance-ledger', estateFilter, complianceStatusFilter, searchQuery, page],
    queryFn: () => duesService.getUnitComplianceLedger({
      estateId: estateFilter,
      status: complianceStatusFilter,
      search: searchQuery,
      page,
      limit: 10
    }),
    enabled: activeTab === 'LEDGER'
  });

  const kpis = duesData?.kpis || {
    totalAssessed: 14800000,
    totalCollected: 11240000,
    totalOverdue: 3560000,
    complianceRate: 76,
    activeSchedulesCount: 4
  };

  const schedules = duesData?.schedules || [];
  const ledgerItems = ledgerData?.ledger || [];
  const pagination = ledgerData?.pagination || { total: 0, page: 1, totalPages: 1 };

  const handleOpenAssess = (schedule = null) => {
    setSelectedScheduleForAssess(schedule);
    setAssessModalOpen(true);
  };

  const handleOpenReminder = (unit) => {
    setTargetUnitForReminder(unit);
    setReminderModalOpen(true);
  };

  const handleCreated = () => {
    showToast('New fee schedule successfully created.');
    queryClient.invalidateQueries({ queryKey: ['dues-schedules-kpis'] });
  };

  const handleAssessed = (data) => {
    showToast(`Batch assessment complete: ${data.unitsInvoiced} invoices generated.`);
    queryClient.invalidateQueries({ queryKey: ['dues-schedules-kpis'] });
    queryClient.invalidateQueries({ queryKey: ['dues-compliance-ledger'] });
    queryClient.invalidateQueries({ queryKey: ['billing-invoices'] });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-elevated border border-slate-700 text-xs font-semibold flex items-center gap-2.5 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
            Dues, Levies & Service Charges
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure recurring estate fee structures, automate bulk billing cycles, and monitor resident payment compliance.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsCompactCurrency(!isCompactCurrency)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              isCompactCurrency 
                ? 'bg-orange-50 border-orange-200 text-primary shadow-xs' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs'
            }`}
            title="Toggle between compact (₦M/₦B) and exact figures"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{isCompactCurrency ? 'Figures: Compact (₦M)' : 'Figures: Exact (₦)'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenAssess()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-xs transition-all cursor-pointer"
          >
            <Calculator className="w-4 h-4 text-primary" />
            <span>Batch Assess Next Cycle</span>
          </button>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary hover:bg-primary-600 active:scale-98 text-white font-semibold text-xs shadow-sm shadow-primary/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Fee Schedule</span>
          </button>
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Assessed */}
        <div 
          onClick={() => setIsCompactCurrency(!isCompactCurrency)}
          title="Click to toggle compact / exact figure"
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between group hover:border-slate-300 transition-all cursor-pointer select-none"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Assessed</span>
            <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
              <Receipt className="w-4 h-4 text-primary" />
            </div>
          </div>
          <div className="mt-3">
            <div 
              className={`${getNairaTextSizeClass(kpis.totalAssessed, isCompactCurrency)} font-extrabold text-slate-900 tracking-tight tabular-nums whitespace-nowrap overflow-hidden text-ellipsis`}
              title={`Exact: ${formatNaira(kpis.totalAssessed, { autoTrimCents: false })}`}
            >
              {isCompactCurrency ? formatCompactNaira(kpis.totalAssessed) : formatNaira(kpis.totalAssessed)}
            </div>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Active annual billing
            </p>
          </div>
        </div>

        {/* Collected Dues */}
        <div 
          onClick={() => setIsCompactCurrency(!isCompactCurrency)}
          title="Click to toggle compact / exact figure"
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between group hover:border-slate-300 transition-all cursor-pointer select-none"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Collected Dues</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition-transform">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div 
              className={`${getNairaTextSizeClass(kpis.totalCollected, isCompactCurrency)} font-extrabold text-slate-900 tracking-tight tabular-nums whitespace-nowrap overflow-hidden text-ellipsis`}
              title={`Exact: ${formatNaira(kpis.totalCollected, { autoTrimCents: false })}`}
            >
              {isCompactCurrency ? formatCompactNaira(kpis.totalCollected) : formatNaira(kpis.totalCollected)}
            </div>
            <p className="text-xs font-semibold text-emerald-600 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{kpis.complianceRate}% compliance rate</span>
            </p>
          </div>
        </div>

        {/* Overdue Dues */}
        <div 
          onClick={() => setIsCompactCurrency(!isCompactCurrency)}
          title="Click to toggle compact / exact figure"
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between group hover:border-slate-300 transition-all cursor-pointer select-none"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overdue Dues</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 group-hover:scale-105 transition-transform">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div 
              className={`${getNairaTextSizeClass(kpis.totalOverdue, isCompactCurrency)} font-extrabold text-slate-900 tracking-tight tabular-nums whitespace-nowrap overflow-hidden text-ellipsis`}
              title={`Exact: ${formatNaira(kpis.totalOverdue, { autoTrimCents: false })}`}
            >
              {isCompactCurrency ? formatCompactNaira(kpis.totalOverdue) : formatNaira(kpis.totalOverdue)}
            </div>
            <p className="text-xs font-semibold text-rose-600 mt-1">
              Pending collection
            </p>
          </div>
        </div>

        {/* Active Schedules */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between group hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Fee Schedules</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight tabular-nums whitespace-nowrap">
              {kpis.activeSchedulesCount} Levies
            </div>
            <p className="text-xs font-semibold text-blue-600 mt-1">
              Active fee catalog
            </p>
          </div>
        </div>
      </div>

      {/* Aligned Single-Row Filter Bar */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-200 pb-4">
        {/* View Switcher: Schedules vs Ledger */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/60">
          <button
            type="button"
            onClick={() => setActiveTab('SCHEDULES')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'SCHEDULES' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Fee Schedules Catalog
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('LEDGER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'LEDGER' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Unit Compliance Ledger
          </button>
        </div>

        {/* Status Dropdown (When on Ledger view) */}
        {activeTab === 'LEDGER' && (
          <div className="relative">
            <select
              value={complianceStatusFilter}
              onChange={(e) => { setComplianceStatusFilter(e.target.value); setPage(1); }}
              className="appearance-none pl-3 pr-8 py-2 text-xs font-semibold rounded-xl bg-white border border-slate-200/90 text-slate-700 hover:border-slate-300 focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="ALL">All Compliance Statuses</option>
              <option value="OVERDUE">Overdue Units</option>
              <option value="PENDING">Pending Grace Period</option>
              <option value="UP_TO_DATE">Up to Date</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        )}

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={activeTab === 'SCHEDULES' ? "Search fee title or category..." : "Search unit, resident or phone..."}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-white border border-slate-200/90 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
          />
        </div>

        {/* Estate Dropdown */}
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
      </div>

      {/* Main Content Area */}
      {activeTab === 'SCHEDULES' ? (
        /* ================= TAB 1: FEE SCHEDULES CATALOG ================= */
        schedulesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4 animate-pulse">
                <div className="h-5 bg-slate-200 rounded w-1/3"></div>
                <div className="h-4 bg-slate-100 rounded w-2/3"></div>
                <div className="h-8 bg-slate-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : schedules.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-card">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 text-primary flex items-center justify-center mx-auto mb-3">
              <Coins className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No fee schedules found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              Set up your estate recurring levies and service charges.
            </p>
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-600 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Fee Schedule</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {schedules.map((s) => (
              <div
                key={s.id}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-card hover:border-slate-300 transition-all p-5 flex flex-col justify-between group"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      {s.frequency} Levy
                    </span>
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                      Active
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-primary transition-colors">
                      {s.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {s.estateName} &bull; {s.unitsCount} Units
                    </p>
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                      {s.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Rate Per Unit</span>
                      <span className="text-base font-extrabold text-slate-900">{formatNaira(s.amount)}</span>
                      <span className="text-[11px] text-slate-500"> / cycle</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Target Expected</span>
                      <span className="text-sm font-bold text-slate-700">{formatNaira(s.targetExpected)}</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-[11px] font-semibold">
                      <span className="text-slate-500">Collection Progress</span>
                      <span className="text-primary font-bold">{s.collectionRate}% Collected</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full transition-all duration-500" 
                        style={{ width: `${s.collectionRate}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAssess(s)}
                    className="flex-1 py-2 px-3 rounded-xl bg-orange-50 hover:bg-orange-100 text-primary font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Assess Units</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('LEDGER')}
                    className="py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    View Defaulters
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* ================= TAB 2: UNIT COMPLIANCE LEDGER ================= */
        ledgerLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 space-y-4">
            <div className="h-4 bg-slate-100 rounded w-1/4 animate-pulse"></div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse"></div>
            ))}
          </div>
        ) : ledgerItems.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-card">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 text-primary flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No units match criteria</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              All units appear up to date or no units match your active filter.
            </p>
            <button
              type="button"
              onClick={() => { setComplianceStatusFilter('ALL'); setEstateFilter('all'); setSearchQuery(''); }}
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
                    <th className="py-3.5 px-4">Unit & Subtype</th>
                    <th className="py-3.5 px-4">Estate</th>
                    <th className="py-3.5 px-4">Resident Host</th>
                    <th className="py-3.5 px-4">Assigned Levies</th>
                    <th className="py-3.5 px-4">Outstanding Due</th>
                    <th className="py-3.5 px-4">Compliance Status</th>
                    <th className="py-3.5 px-4">Last Payment</th>
                    <th className="py-3.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {ledgerItems.map((u) => {
                    const isOverdue = u.complianceStatus === 'OVERDUE';
                    const isPending = u.complianceStatus === 'PENDING';

                    return (
                      <tr 
                        key={u.propertyId} 
                        className={`hover:bg-slate-50/80 transition-colors ${isOverdue ? 'bg-rose-50/30' : ''}`}
                      >
                        {/* Unit */}
                        <td className="py-3.5 px-4">
                          <div>
                            <span className="font-bold text-slate-900 block text-xs">{u.displayIdentifier}</span>
                            <span className="text-[11px] text-slate-500">{u.subtype}</span>
                          </div>
                        </td>

                        {/* Estate */}
                        <td className="py-3.5 px-4 font-medium text-slate-700">
                          {u.estateName}
                        </td>

                        {/* Resident */}
                        <td className="py-3.5 px-4">
                          <div>
                            <span className="font-bold text-slate-900 block text-xs">{u.tenantName}</span>
                            <span className="text-[11px] text-slate-500">{u.tenantPhone}</span>
                          </div>
                        </td>

                        {/* Assigned Levies */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1">
                            {u.assignedLevies.map((l, i) => (
                              <span key={i} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                                {l}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Outstanding Due */}
                        <td className="py-3.5 px-4">
                          <span className={`font-extrabold text-sm ${isOverdue ? 'text-rose-600' : isPending ? 'text-amber-600' : 'text-slate-900'}`}>
                            {formatNaira(u.outstandingDue)}
                          </span>
                          {isOverdue && (
                            <span className="text-[10px] text-rose-700 block font-semibold">
                              {u.daysOverdue} days overdue
                            </span>
                          )}
                          {isPending && (
                            <span className="text-[10px] text-amber-700 block font-semibold">
                              Grace period
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          {isOverdue ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                              <span>OVERDUE</span>
                            </span>
                          ) : isPending ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                              <span>PENDING</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>UP TO DATE</span>
                            </span>
                          )}
                        </td>

                        {/* Last Payment */}
                        <td className="py-3.5 px-4 text-slate-600 font-medium">
                          {u.lastPaymentDate}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-center">
                          {isOverdue ? (
                            <button
                              type="button"
                              onClick={() => handleOpenReminder(u)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs border border-rose-200 transition-colors cursor-pointer"
                            >
                              Remind
                            </button>
                          ) : isPending ? (
                            <button
                              type="button"
                              onClick={() => handleOpenReminder(u)}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-primary text-slate-600 hover:text-primary font-semibold text-xs transition-colors cursor-pointer"
                            >
                              Remind
                            </button>
                          ) : (
                            <span className="text-slate-400 font-semibold text-xs">Settled</span>
                          )}
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
                Showing {ledgerItems.length > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} units
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
      )}

      {/* Modals */}
      <CreateFeeScheduleModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleCreated}
      />

      <BatchAssessModal
        isOpen={assessModalOpen}
        onClose={() => setAssessModalOpen(false)}
        onAssessed={handleAssessed}
        defaultSchedule={selectedScheduleForAssess}
      />

      <SendDuesReminderModal
        isOpen={reminderModalOpen}
        onClose={() => setReminderModalOpen(false)}
        targetUnit={targetUnitForReminder}
        onSent={() => showToast('Payment reminder dispatched via WhatsApp & SMS.')}
      />
    </div>
  );
};
