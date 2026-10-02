import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Receipt, 
  CreditCard, 
  Coins, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Plus, 
  Search, 
  Download, 
  TrendingUp, 
  ChevronDown, 
  Calculator, 
  Send, 
  Filter, 
  RefreshCw, 
  SlidersHorizontal,
  Building,
  FileText,
  Printer,
  Calendar,
  Layers,
  Info
} from 'lucide-react';

import api from '../../services/api';
import { billingService } from '../../services/billingService';
import duesService from '../../services/duesService';
import { formatNaira, formatCompactNaira, getNairaTextSizeClass, formatDate, formatDateTime } from '../../utils/formatters';

// Modals
import { GenerateInvoiceModal } from '../../components/billing/GenerateInvoiceModal';
import { PaymentReceiptModal } from '../../components/billing/PaymentReceiptModal';
import { RecordPaymentModal } from '../../components/billing/RecordPaymentModal';
import { CreateFeeScheduleModal } from '../../components/dues/CreateFeeScheduleModal';
import { BatchAssessModal } from '../../components/dues/BatchAssessModal';
import { SendDuesReminderModal } from '../../components/dues/SendDuesReminderModal';

export const FinanceHubPage = ({ defaultTab = 'INVOICES' }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // Primary Hub Tab: 'INVOICES' | 'PAYMENTS' | 'DUES'
  const initialTab = searchParams.get('tab')?.toUpperCase() || defaultTab;
  const [activeTab, setActiveTab] = useState(['INVOICES', 'PAYMENTS', 'DUES'].includes(initialTab) ? initialTab : 'INVOICES');

  // Sub-tab for Dues: 'CATALOG' | 'LEDGER'
  const [duesSubTab, setDuesSubTab] = useState('CATALOG');

  // Filters
  const [estateFilter, setEstateFilter] = useState('ALL');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('ALL'); // ALL, PENDING, PAID, OVERDUE
  const [complianceStatusFilter, setComplianceStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [invoicePage, setInvoicePage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);

  // Compact currency mode toggle
  const [isCompactCurrency, setIsCompactCurrency] = useState(false);

  // Modals state
  const [isGenerateInvoiceOpen, setIsGenerateInvoiceOpen] = useState(false);
  const [isCreateScheduleOpen, setIsCreateScheduleOpen] = useState(false);
  const [isBatchAssessOpen, setIsBatchAssessOpen] = useState(false);
  const [selectedScheduleForAssess, setSelectedScheduleForAssess] = useState(null);
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [selectedInvoiceForReceipt, setSelectedInvoiceForReceipt] = useState(null);
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState(null);
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [targetUnitForReminder, setTargetUnitForReminder] = useState(null);

  // Toast alert
  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Sync tab with URL search parameter
  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    setSearchParams({ tab: newTab.toLowerCase() });
  };

  // Fetch estates list
  const { data: estates = [] } = useQuery({
    queryKey: ['estates-for-finance-hub'],
    queryFn: async () => {
      const res = await api.get('/estates');
      return res.data?.estates || [];
    }
  });

  // Fetch Invoices & High-Level Billing Stats
  const { 
    data: invoicesResponse, 
    isLoading: invoicesLoading, 
    isFetching: invoicesFetching, 
    refetch: refetchInvoices 
  } = useQuery({
    queryKey: ['finance-invoices', invoiceStatusFilter, estateFilter, searchQuery, invoicePage],
    queryFn: () => billingService.getInvoices({
      status: invoiceStatusFilter !== 'ALL' ? invoiceStatusFilter : undefined,
      estateId: estateFilter !== 'ALL' ? estateFilter : undefined,
      search: searchQuery || undefined,
      page: invoicePage,
      limit: 10
    })
  });

  const invoices = invoicesResponse?.invoices || invoicesResponse?.data?.invoices || [];
  const billingStats = invoicesResponse?.stats || invoicesResponse?.data?.stats || {
    totalInvoiced: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    totalCount: 0,
    paidCount: 0,
    pendingCount: 0,
    overdueCount: 0
  };
  const invoicePagination = invoicesResponse?.pagination || invoicesResponse?.data?.pagination || { page: 1, totalPages: 1, total: invoices.length };

  // Fetch Payments History
  const { 
    data: payments = [], 
    isLoading: paymentsLoading, 
    refetch: refetchPayments 
  } = useQuery({
    queryKey: ['finance-payments', estateFilter],
    queryFn: () => billingService.getPayments({
      estateId: estateFilter !== 'ALL' ? estateFilter : undefined
    }),
    enabled: activeTab === 'PAYMENTS' || activeTab === 'INVOICES'
  });

  // Filter payments by search query client-side
  const filteredPayments = payments.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const refMatch = p.paymentReference?.toLowerCase().includes(q);
    const residentMatch = `${p.resident?.firstName || ''} ${p.resident?.lastName || ''}`.toLowerCase().includes(q);
    const invoiceMatch = p.invoice?.invoiceNumber?.toLowerCase().includes(q);
    return refMatch || residentMatch || invoiceMatch;
  });

  // Fetch Dues & Levies Schedules
  const { 
    data: duesData, 
    isLoading: duesLoading, 
    refetch: refetchDues 
  } = useQuery({
    queryKey: ['finance-dues-schedules', estateFilter],
    queryFn: () => duesService.getDuesKPIsAndSchedules({
      estateId: estateFilter !== 'ALL' ? estateFilter : undefined
    })
  });

  const duesSchedules = duesData?.schedules || [];
  const duesKpis = duesData?.kpis || {
    totalAssessed: 0,
    totalCollected: 0,
    totalOverdue: 0,
    complianceRate: 0,
    activeSchedulesCount: 0
  };

  // Fetch Unit Compliance Ledger
  const { 
    data: ledgerData, 
    isLoading: ledgerLoading,
    refetch: refetchLedger
  } = useQuery({
    queryKey: ['finance-dues-ledger', estateFilter, complianceStatusFilter, searchQuery, ledgerPage],
    queryFn: () => duesService.getUnitComplianceLedger({
      estateId: estateFilter !== 'ALL' ? estateFilter : undefined,
      status: complianceStatusFilter !== 'ALL' ? complianceStatusFilter : undefined,
      search: searchQuery || undefined,
      page: ledgerPage,
      limit: 10
    }),
    enabled: activeTab === 'DUES' && duesSubTab === 'LEDGER'
  });

  const ledgerItems = ledgerData?.ledger || ledgerData?.units || [];
  const ledgerPagination = ledgerData?.pagination || { page: 1, totalPages: 1, total: ledgerItems.length };

  // Combined Top KPI Metrics
  const combinedTotalInvoiced = billingStats.totalInvoiced || duesKpis.totalAssessed || 0;
  const combinedTotalPaid = billingStats.totalPaid || duesKpis.totalCollected || 0;
  const combinedTotalOutstanding = billingStats.totalOutstanding || duesKpis.totalOverdue || 0;
  const collectionEfficiency = combinedTotalInvoiced > 0 
    ? Math.round((combinedTotalPaid / combinedTotalInvoiced) * 100) 
    : (duesKpis.complianceRate || 0);

  // Modal Handlers
  const handleOpenAssess = (schedule = null) => {
    setSelectedScheduleForAssess(schedule);
    setIsBatchAssessOpen(true);
  };

  const handleOpenRecordPayment = (inv) => {
    setSelectedInvoiceForPayment(inv);
    setIsRecordPaymentOpen(true);
  };

  const handleOpenReceipt = (inv, payment = null) => {
    setSelectedInvoiceForReceipt(inv);
    setSelectedPaymentForReceipt(payment);
    setIsReceiptOpen(true);
  };

  const handleOpenReminder = (unit) => {
    setTargetUnitForReminder(unit);
    setIsReminderOpen(true);
  };

  const handlePaymentRecorded = (data) => {
    showToast(`Payment of ${formatNaira(data?.payment?.amount || 0)} recorded successfully.`);
    queryClient.invalidateQueries({ queryKey: ['finance-invoices'] });
    queryClient.invalidateQueries({ queryKey: ['finance-payments'] });
    queryClient.invalidateQueries({ queryKey: ['finance-dues-schedules'] });
  };

  const handleScheduleCreated = () => {
    showToast('New fee schedule successfully configured.');
    queryClient.invalidateQueries({ queryKey: ['finance-dues-schedules'] });
  };

  const handleAssessed = (data) => {
    showToast(`Batch assessment complete: ${data.unitsInvoiced} invoices generated.`);
    queryClient.invalidateQueries({ queryKey: ['finance-invoices'] });
    queryClient.invalidateQueries({ queryKey: ['finance-payments'] });
    queryClient.invalidateQueries({ queryKey: ['finance-dues-schedules'] });
  };

  return (
    <div className="space-y-6 pb-14">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-elevated border border-slate-700 text-xs font-semibold flex items-center gap-2.5 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Global Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">
            Billing & Finance Hub
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Unified billing operations: issue invoices, reconcile payment receipts, configure dues, and monitor resident collection compliance.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Format Toggle Pill */}
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

          {/* Batch Assess Cycle */}
          <button
            type="button"
            onClick={() => handleOpenAssess()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-xs transition-all cursor-pointer"
          >
            <Calculator className="w-4 h-4 text-primary" />
            <span>Batch Assess</span>
          </button>

          {/* Create Fee Schedule */}
          <button
            type="button"
            onClick={() => setIsCreateScheduleOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-xs transition-all cursor-pointer"
          >
            <Coins className="w-4 h-4 text-blue-600" />
            <span>New Fee Schedule</span>
          </button>

          {/* Generate Invoice */}
          <button
            type="button"
            onClick={() => setIsGenerateInvoiceOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-600 active:scale-98 text-white font-semibold text-xs shadow-sm shadow-primary/25 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Generate Invoice</span>
          </button>
        </div>
      </div>

      {/* 4 Financial KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Invoiced */}
        <div 
          onClick={() => setIsCompactCurrency(!isCompactCurrency)}
          title="Click to toggle compact / exact figure"
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between group hover:border-slate-300 transition-all cursor-pointer select-none"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Invoiced</span>
            <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
              <Receipt className="w-4 h-4 text-primary" />
            </div>
          </div>
          <div className="mt-3 min-w-0">
            <div 
              className={`${getNairaTextSizeClass(combinedTotalInvoiced, isCompactCurrency)} font-extrabold text-slate-900 tracking-tight tabular-nums whitespace-nowrap overflow-hidden text-ellipsis`}
              title={`Exact: ${formatNaira(combinedTotalInvoiced, { autoTrimCents: false })}`}
            >
              {isCompactCurrency ? formatCompactNaira(combinedTotalInvoiced) : formatNaira(combinedTotalInvoiced)}
            </div>
            <p className="text-xs font-medium text-slate-500 mt-1 flex items-center gap-1.5">
              <span className="text-primary font-semibold">{billingStats.totalCount} total bills</span>
              <span>across active cycles</span>
            </p>
          </div>
        </div>

        {/* Card 2: Revenue Collected */}
        <div 
          onClick={() => setIsCompactCurrency(!isCompactCurrency)}
          title="Click to toggle compact / exact figure"
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between group hover:border-slate-300 transition-all cursor-pointer select-none"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Revenue Collected</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition-transform">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 min-w-0">
            <div 
              className={`${getNairaTextSizeClass(combinedTotalPaid, isCompactCurrency)} font-extrabold text-slate-900 tracking-tight tabular-nums whitespace-nowrap overflow-hidden text-ellipsis`}
              title={`Exact: ${formatNaira(combinedTotalPaid, { autoTrimCents: false })}`}
            >
              {isCompactCurrency ? formatCompactNaira(combinedTotalPaid) : formatNaira(combinedTotalPaid)}
            </div>
            <p className="text-xs font-semibold text-emerald-600 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{collectionEfficiency}% collection efficiency</span>
            </p>
          </div>
        </div>

        {/* Card 3: Outstanding Receivables */}
        <div 
          onClick={() => setIsCompactCurrency(!isCompactCurrency)}
          title="Click to toggle compact / exact figure"
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between group hover:border-slate-300 transition-all cursor-pointer select-none"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Outstanding Dues</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 group-hover:scale-105 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 min-w-0">
            <div 
              className={`${getNairaTextSizeClass(combinedTotalOutstanding, isCompactCurrency)} font-extrabold text-slate-900 tracking-tight tabular-nums whitespace-nowrap overflow-hidden text-ellipsis`}
              title={`Exact: ${formatNaira(combinedTotalOutstanding, { autoTrimCents: false })}`}
            >
              {isCompactCurrency ? formatCompactNaira(combinedTotalOutstanding) : formatNaira(combinedTotalOutstanding)}
            </div>
            <p className="text-xs font-semibold text-amber-600 mt-1 flex items-center gap-1.5">
              <span>{billingStats.pendingCount + billingStats.overdueCount} accounts pending</span>
            </p>
          </div>
        </div>

        {/* Card 4: Fee Schedules & Delinquency */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between group hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Fee Schedules</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 min-w-0">
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight tabular-nums whitespace-nowrap">
              {duesKpis.activeSchedulesCount || duesSchedules.length} Levies
            </div>
            <p className="text-xs font-semibold text-blue-600 mt-1">
              Active recurring fee structures
            </p>
          </div>
        </div>
      </div>

      {/* Main Unified Workspace */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
        {/* Navigation Tabs Bar */}
        <div className="border-b border-slate-200 px-4 pt-3 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          {/* Main 3 Segmented Tabs */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleTabChange('INVOICES')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all border-b-2 cursor-pointer ${
                activeTab === 'INVOICES'
                  ? 'border-primary text-primary bg-white shadow-xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>Invoices & Billing</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'INVOICES' ? 'bg-orange-100 text-primary' : 'bg-slate-200 text-slate-600'}`}>
                {billingStats.totalCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('PAYMENTS')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all border-b-2 cursor-pointer ${
                activeTab === 'PAYMENTS'
                  ? 'border-primary text-primary bg-white shadow-xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Payments & Settlements</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'PAYMENTS' ? 'bg-orange-100 text-primary' : 'bg-slate-200 text-slate-600'}`}>
                {payments.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('DUES')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all border-b-2 cursor-pointer ${
                activeTab === 'DUES'
                  ? 'border-primary text-primary bg-white shadow-xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Coins className="w-4 h-4" />
              <span>Dues & Fee Schedules</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'DUES' ? 'bg-orange-100 text-primary' : 'bg-slate-200 text-slate-600'}`}>
                {duesSchedules.length}
              </span>
            </button>
          </div>

          {/* Quick Refresh & Statement Export */}
          <div className="flex items-center gap-2 pb-2">
            <button
              type="button"
              onClick={() => {
                refetchInvoices();
                refetchPayments();
                refetchDues();
              }}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 bg-white border border-slate-200 shadow-xs hover:bg-slate-50 transition-colors cursor-pointer"
              title="Refresh financial records"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${invoicesFetching ? 'animate-spin text-primary' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export Ledger</span>
            </button>
          </div>
        </div>

        {/* Global Filter Bar */}
        <div className="p-4 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-white">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
            {/* Search Box */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setInvoicePage(1);
                  setLedgerPage(1);
                }}
                placeholder={
                  activeTab === 'INVOICES' ? 'Search invoice #, resident, unit...' :
                  activeTab === 'PAYMENTS' ? 'Search payment ref, resident...' :
                  'Search fee title, resident...'
                }
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all placeholder:text-slate-400"
              />
            </div>

            {/* Estate Dropdown Filter */}
            <div className="relative">
              <select
                value={estateFilter}
                onChange={(e) => {
                  setEstateFilter(e.target.value);
                  setInvoicePage(1);
                  setLedgerPage(1);
                }}
                className="appearance-none pl-3 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary font-medium text-slate-700 cursor-pointer"
              >
                <option value="ALL">All Estates</option>
                {estates.map((est) => (
                  <option key={est.id} value={est.id}>{est.name}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Invoices Status Sub-Filter (only on Invoices tab) */}
            {activeTab === 'INVOICES' && (
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/60">
                {['ALL', 'PENDING', 'PAID', 'OVERDUE'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      setInvoiceStatusFilter(status);
                      setInvoicePage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      invoiceStatusFilter === status
                        ? 'bg-white text-primary shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {status === 'ALL' ? 'All Invoices' : status.charAt(0) + status.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            )}

            {/* Dues Sub-Switch (only on Dues tab) */}
            {activeTab === 'DUES' && (
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/60">
                <button
                  type="button"
                  onClick={() => setDuesSubTab('CATALOG')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    duesSubTab === 'CATALOG' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Fee Catalog
                </button>
                <button
                  type="button"
                  onClick={() => setDuesSubTab('LEDGER')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    duesSubTab === 'LEDGER' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Compliance Ledger
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tab Content Panes */}

        {/* ========================================================================= */}
        {/* TAB 1: INVOICES & BILLING                                                 */}
        {/* ========================================================================= */}
        {activeTab === 'INVOICES' && (
          <div>
            {invoicesLoading ? (
              <div className="p-8 text-center space-y-3">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                <p className="text-xs text-slate-500">Loading invoices ledger...</p>
              </div>
            ) : invoices.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 text-primary flex items-center justify-center mx-auto mb-3">
                  <Receipt className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-base font-bold text-slate-800">No invoices found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                  {searchQuery || invoiceStatusFilter !== 'ALL' || estateFilter !== 'ALL'
                    ? 'No invoices match your selected filters. Try broadening your criteria.'
                    : 'Generate your first bill or run a batch assessment from your dues schedules.'}
                </p>
                <button
                  type="button"
                  onClick={() => setIsGenerateInvoiceOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-600 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Generate New Invoice</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Invoice # & Title</th>
                      <th className="py-3.5 px-4">Estate & Unit</th>
                      <th className="py-3.5 px-4">Resident</th>
                      <th className="py-3.5 px-4">Amount Due</th>
                      <th className="py-3.5 px-4">Paid / Progress</th>
                      <th className="py-3.5 px-4">Due Date</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {invoices.map((inv) => {
                      const isPaid = inv.status === 'PAID';
                      const isPartiallyPaid = inv.status === 'PARTIALLY_PAID';
                      const isOverdue = inv.status === 'OVERDUE' || (!isPaid && new Date(inv.dueDate) < new Date());
                      const percentPaid = inv.amount > 0 ? Math.min(100, Math.round(((inv.paidAmount || 0) / inv.amount) * 100)) : 0;

                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                          {/* Invoice # & Title */}
                          <td className="py-3.5 px-4">
                            <span className="font-mono font-bold text-slate-900 block text-xs">{inv.invoiceNumber}</span>
                            <span className="text-[11px] text-slate-500 truncate max-w-[180px] block">{inv.title}</span>
                          </td>

                          {/* Estate & Unit */}
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-slate-800 block text-xs">{inv.estate?.name || 'Estate'}</span>
                            <span className="text-[11px] text-slate-500 font-medium">Unit {inv.property?.displayIdentifier || 'N/A'}</span>
                          </td>

                          {/* Resident */}
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-slate-900 block text-xs">
                              {inv.resident ? `${inv.resident.firstName} ${inv.resident.lastName}` : 'Unassigned'}
                            </span>
                            <span className="text-[11px] text-slate-500">{inv.resident?.email || 'No email'}</span>
                          </td>

                          {/* Amount */}
                          <td className="py-3.5 px-4 font-extrabold text-slate-900 tabular-nums whitespace-nowrap">
                            {formatNaira(inv.amount)}
                          </td>

                          {/* Paid Progress */}
                          <td className="py-3.5 px-4 min-w-[120px]">
                            <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
                              <span className="text-slate-700 tabular-nums">{formatNaira(inv.paidAmount || 0)}</span>
                              <span className="text-slate-400">{percentPaid}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  isPaid ? 'bg-emerald-500' : isPartiallyPaid ? 'bg-amber-500' : 'bg-slate-200'
                                }`}
                                style={{ width: `${percentPaid}%` }}
                              />
                            </div>
                          </td>

                          {/* Due Date */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`text-xs font-semibold ${isOverdue ? 'text-rose-600' : 'text-slate-700'}`}>
                              {formatDate(inv.dueDate)}
                            </span>
                            {isOverdue && (
                              <span className="block text-[10px] text-rose-500 font-bold">Overdue</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              isPartiallyPaid ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              isOverdue ? 'bg-rose-50 text-rose-700 border-rose-200' :
                              'bg-slate-100 text-slate-700 border-slate-200'
                            }`}>
                              {inv.status}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              {!isPaid && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenRecordPayment(inv)}
                                  className="px-2.5 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-primary font-bold text-[11px] transition-colors cursor-pointer"
                                >
                                  Record Pay
                                </button>
                              )}
                              {(isPaid || isPartiallyPaid) && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReceipt(inv)}
                                  className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-[11px] transition-colors cursor-pointer"
                                  title="View and print official payment receipt"
                                >
                                  Receipt
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Pagination */}
                {invoicePagination.totalPages > 1 && (
                  <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>Showing page {invoicePagination.page} of {invoicePagination.totalPages}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={invoicePagination.page <= 1}
                        onClick={() => setInvoicePage(p => Math.max(1, p - 1))}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium cursor-pointer"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={invoicePagination.page >= invoicePagination.totalPages}
                        onClick={() => setInvoicePage(p => p + 1)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PAYMENTS & SETTLEMENTS                                             */}
        {/* ========================================================================= */}
        {activeTab === 'PAYMENTS' && (
          <div>
            {paymentsLoading ? (
              <div className="p-8 text-center space-y-3">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                <p className="text-xs text-slate-500">Loading settlements ledger...</p>
              </div>
            ) : filteredPayments.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <CreditCard className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-800">No payment transactions recorded</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                  Settlements made online or recorded manually will appear here in chronological order.
                </p>
                <button
                  type="button"
                  onClick={() => handleTabChange('INVOICES')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-600 transition-all cursor-pointer"
                >
                  <Receipt className="w-4 h-4" />
                  <span>View Pending Invoices to Record</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Payment Reference</th>
                      <th className="py-3.5 px-4">Date & Time</th>
                      <th className="py-3.5 px-4">Resident & Estate</th>
                      <th className="py-3.5 px-4">Linked Invoice</th>
                      <th className="py-3.5 px-4">Amount Paid</th>
                      <th className="py-3.5 px-4">Channel / Method</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Reference */}
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          {p.paymentReference}
                        </td>

                        {/* Date */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 font-medium">
                          {formatDateTime(p.paidAt)}
                        </td>

                        {/* Resident */}
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-slate-900 block text-xs">
                            {p.resident ? `${p.resident.firstName} ${p.resident.lastName}` : 'Resident'}
                          </span>
                          <span className="text-[11px] text-slate-500">{p.estate?.name || 'Estate'}</span>
                        </td>

                        {/* Invoice */}
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-700">
                          {p.invoice?.invoiceNumber || 'Manual Receipt'}
                        </td>

                        {/* Amount */}
                        <td className="py-3.5 px-4 font-extrabold text-emerald-600 tabular-nums whitespace-nowrap text-sm">
                          {formatNaira(p.amount)}
                        </td>

                        {/* Channel */}
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 uppercase">
                            {p.channel?.replace('_', ' ') || 'BANK TRANSFER'}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {p.status || 'SUCCESS'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              // If payment has invoice details, render receipt
                              const mockInvoice = {
                                id: p.invoiceId,
                                invoiceNumber: p.invoice?.invoiceNumber || p.paymentReference,
                                title: p.invoice?.title || 'Estate Dues Settlement',
                                amount: p.invoice?.amount || p.amount,
                                paidAmount: p.amount,
                                estate: p.estate,
                                resident: p.resident,
                                payments: [p]
                              };
                              handleOpenReceipt(mockInvoice, p);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-[11px] transition-colors cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5 text-slate-500" />
                            <span>Receipt</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: DUES & FEE SCHEDULES                                              */}
        {/* ========================================================================= */}
        {activeTab === 'DUES' && (
          <div className="p-5">
            {duesSubTab === 'CATALOG' ? (
              /* Sub-View: Fee Catalog */
              duesLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-slate-50 rounded-2xl p-6 space-y-4 animate-pulse">
                      <div className="h-5 bg-slate-200 rounded w-1/3"></div>
                      <div className="h-4 bg-slate-200 rounded w-2/3"></div>
                      <div className="h-8 bg-slate-200 rounded w-1/2"></div>
                    </div>
                  ))}
                </div>
              ) : duesSchedules.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                    <Coins className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800">No fee schedules created yet</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                    Set up your recurring service charges, security levies, and capital development dues.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsCreateScheduleOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-600 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Fee Schedule</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {duesSchedules.map((s) => (
                    <div
                      key={s.id}
                      className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all p-5 flex flex-col justify-between group"
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
                            <span className="text-base font-extrabold text-slate-900 tabular-nums">{formatNaira(s.amount)}</span>
                            <span className="text-[11px] text-slate-500"> / cycle</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Target Expected</span>
                            <span className="text-sm font-bold text-slate-700 tabular-nums">{formatNaira(s.targetExpected)}</span>
                          </div>
                        </div>

                        {/* Progress */}
                        <div className="space-y-1 pt-1">
                          <div className="flex justify-between text-[11px] font-semibold">
                            <span className="text-slate-500">Collection Progress</span>
                            <span className="text-primary font-bold">{s.collectionRate}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
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
                          onClick={() => setDuesSubTab('LEDGER')}
                          className="py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                        >
                          Defaulters
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              /* Sub-View: Unit Compliance Ledger */
              ledgerLoading ? (
                <div className="p-8 text-center space-y-3">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                  <p className="text-xs text-slate-500">Loading unit compliance ledger...</p>
                </div>
              ) : ledgerItems.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800">100% compliance rate!</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                    All residents are currently up to date on their assigned levies.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-5 -mb-5">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-3.5 px-4">Unit & Subtype</th>
                        <th className="py-3.5 px-4">Estate</th>
                        <th className="py-3.5 px-4">Resident Host</th>
                        <th className="py-3.5 px-4">Assigned Levies</th>
                        <th className="py-3.5 px-4">Outstanding Due</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {ledgerItems.map((u) => {
                        const isOverdue = u.complianceStatus === 'OVERDUE';
                        const isPending = u.complianceStatus === 'PENDING';

                        return (
                          <tr key={u.propertyId} className={`hover:bg-slate-50/70 transition-colors ${isOverdue ? 'bg-rose-50/30' : ''}`}>
                            <td className="py-3.5 px-4">
                              <span className="font-bold text-slate-900 block text-xs">{u.displayIdentifier}</span>
                              <span className="text-[11px] text-slate-500">{u.subtype}</span>
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-700">{u.estateName}</td>
                            <td className="py-3.5 px-4">
                              <span className="font-bold text-slate-900 block text-xs">{u.tenantName}</span>
                              <span className="text-[11px] text-slate-500">{u.tenantPhone}</span>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex flex-wrap gap-1">
                                {u.assignedLevies.map((l, i) => (
                                  <span key={i} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                                    {l}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-extrabold text-sm tabular-nums whitespace-nowrap">
                              <span className={isOverdue ? 'text-rose-600' : isPending ? 'text-amber-600' : 'text-slate-900'}>
                                {formatNaira(u.outstandingDue)}
                              </span>
                              {isOverdue && (
                                <span className="text-[10px] text-rose-700 block font-semibold">{u.daysOverdue} days overdue</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                u.complianceStatus === 'COMPLIANT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                u.complianceStatus === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                'bg-rose-50 text-rose-700 border-rose-200'
                              }`}>
                                {u.complianceStatus}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              {u.outstandingDue > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReminder(u)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-primary font-bold text-[11px] transition-colors cursor-pointer"
                                >
                                  <Send className="w-3 h-3" />
                                  <span>Send Reminder</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODALS SUITE                                                              */}
      {/* ========================================================================= */}
      <GenerateInvoiceModal
        isOpen={isGenerateInvoiceOpen}
        onClose={() => setIsGenerateInvoiceOpen(false)}
        onSuccess={() => {
          showToast('New invoice created successfully.');
          setInvoiceStatusFilter('ALL');
          setInvoicePage(1);
          queryClient.invalidateQueries({ queryKey: ['finance-invoices'] });
          refetchInvoices();
        }}
        onCreated={() => {
          showToast('New invoice created successfully.');
          setInvoiceStatusFilter('ALL');
          setInvoicePage(1);
          queryClient.invalidateQueries({ queryKey: ['finance-invoices'] });
          refetchInvoices();
        }}
        estates={estates}
      />

      <CreateFeeScheduleModal
        isOpen={isCreateScheduleOpen}
        onClose={() => setIsCreateScheduleOpen(false)}
        onCreated={handleScheduleCreated}
        estates={estates}
      />

      <BatchAssessModal
        isOpen={isBatchAssessOpen}
        onClose={() => {
          setIsBatchAssessOpen(false);
          setSelectedScheduleForAssess(null);
        }}
        onAssessed={handleAssessed}
        schedule={selectedScheduleForAssess}
        schedules={duesSchedules}
      />

      <RecordPaymentModal
        isOpen={isRecordPaymentOpen}
        onClose={() => {
          setIsRecordPaymentOpen(false);
          setSelectedInvoiceForPayment(null);
        }}
        invoice={selectedInvoiceForPayment}
        onSuccess={handlePaymentRecorded}
        onPaymentRecorded={handlePaymentRecorded}
      />

      <PaymentReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => {
          setIsReceiptOpen(false);
          setSelectedInvoiceForReceipt(null);
          setSelectedPaymentForReceipt(null);
        }}
        invoice={selectedInvoiceForReceipt}
        payment={selectedPaymentForReceipt}
      />

      <SendDuesReminderModal
        isOpen={isReminderOpen}
        onClose={() => {
          setIsReminderOpen(false);
          setTargetUnitForReminder(null);
        }}
        targetUnit={targetUnitForReminder}
        onSent={(result) => {
          showToast(`Reminder sent successfully via ${result.channel || 'SMS'}.`);
        }}
      />
    </div>
  );
};
