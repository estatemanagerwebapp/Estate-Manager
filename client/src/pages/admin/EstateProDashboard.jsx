import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Building, 
  Users, 
  Receipt, 
  CreditCard, 
  Calendar, 
  ChevronDown, 
  CheckCircle,
  DoorOpen
} from 'lucide-react';
import api from '../../services/api';
import { StatCard } from '../../components/dashboard/StatCard';
import { PaymentOverviewCard } from '../../components/dashboard/PaymentOverviewCard';
import { QuickActionsCard } from '../../components/dashboard/QuickActionsCard';
import { RecentInvoicesTable } from '../../components/dashboard/RecentInvoicesTable';
import { GateAccessLogsList } from '../../components/dashboard/GateAccessLogsList';
import { EstatesOverviewDeck } from '../../components/dashboard/EstatesOverviewDeck';
import { UpcomingDuesList } from '../../components/dashboard/UpcomingDuesList';
import { QuickGateModal } from '../../components/dashboard/QuickGateModal';
import { AddResidentModal } from '../../components/dashboard/AddResidentModal';
import { GenerateInvoiceModal } from '../../components/dashboard/GenerateInvoiceModal';
import { CreatePassModal } from '../../components/dashboard/CreatePassModal';

export const EstateProDashboard = ({ isScanQROpen, setIsScanQROpen }) => {
  const [selectedEstate, setSelectedEstate] = useState('All Estates');
  const [estateDropdownOpen, setEstateDropdownOpen] = useState(false);
  
  // Interactive modal states
  const [addResidentOpen, setAddResidentOpen] = useState(false);
  const [generateInvoiceOpen, setGenerateInvoiceOpen] = useState(false);
  const [createPassOpen, setCreatePassOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Fetch summary data from live Supabase-backed API
  const { data: summaryResponse, isLoading, refetch } = useQuery({
    queryKey: ['dashboardSummary', selectedEstate],
    queryFn: async () => {
      const res = await api.get('/dashboard/summary');
      return res.data;
    }
  });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleQuickAction = (actionId) => {
    switch (actionId) {
      case 'add-resident':
        setAddResidentOpen(true);
        break;
      case 'generate-invoice':
        setGenerateInvoiceOpen(true);
        break;
      case 'record-payment':
        showToast('💳 Record Payment: Select an invoice or scan transaction reference.');
        break;
      case 'create-pass':
        setCreatePassOpen(true);
        break;
      case 'remote-gate':
        showToast('🚪 Command Dispatched: Main Entrance Gate opened remotely by Administrator.');
        break;
      case 'maintenance-request':
        showToast('🔧 Maintenance Log: New work order dispatch ticket initialized.');
        break;
      default:
        break;
    }
  };

  const kpis = summaryResponse?.kpis;
  const paymentOverview = summaryResponse?.paymentOverview;
  const recentInvoices = summaryResponse?.recentInvoices || [];
  const gateLogs = summaryResponse?.gateLogs || [];
  const estatesOverview = summaryResponse?.estatesOverview || [];
  const upcomingDues = summaryResponse?.upcomingDues || [];

  const estateOptions = [
    'All Estates',
    'Sunrise Estate',
    'Maple Residency',
    'Lakeside Court',
    'Pineview Estate'
  ];

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-dropdown border border-slate-700 flex items-center gap-3 text-xs font-semibold animate-slideUp">
          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Greeting & Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Good morning, Tobi</span>
            <span className="text-2xl inline-block transform hover:rotate-12 transition-transform cursor-default">👋</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            Here's what's happening across your estates today.
          </p>
        </div>

        {/* Date & Estate Selector Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Calendar Pill */}
          <div className="flex items-center gap-2 px-3.5 py-2 bg-white rounded-xl border border-slate-200/80 shadow-xs text-xs font-medium text-slate-600">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Tuesday, 30 Sep 2026</span>
          </div>

          {/* Estate Dropdown Pill */}
          <div className="relative">
            <button
              onClick={() => setEstateDropdownOpen(!estateDropdownOpen)}
              className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 rounded-xl border border-slate-200/80 shadow-xs text-xs font-semibold text-slate-800 transition-colors cursor-pointer"
            >
              <span>{selectedEstate}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {estateDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-xl shadow-dropdown border border-slate-100 py-1 z-30 animate-fadeIn text-xs">
                {estateOptions.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setSelectedEstate(opt);
                      setEstateDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 hover:bg-orange-50 hover:text-primary transition-colors cursor-pointer ${
                      selectedEstate === opt ? 'font-bold text-primary bg-orange-50/40' : 'text-slate-700'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 1: Top 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <StatCard
          icon={Building}
          label="Total Estates"
          value={kpis?.totalEstates?.value || 4}
          subtext={kpis?.totalEstates?.trend || "+1 this month"}
          subtextColor="emerald"
        />

        <StatCard
          icon={Users}
          label="Total Residents"
          value={kpis?.totalResidents?.value || 286}
          subtext={kpis?.totalResidents?.trend || "+12 this month"}
          subtextColor="emerald"
        />

        <StatCard
          icon={Receipt}
          label="Open Invoices"
          value={kpis?.openInvoices?.value || 48}
          subtext={kpis?.openInvoices?.formattedSubAmount || "₦2,430,000"}
          subtextColor="orange"
        />

        <StatCard
          icon={CreditCard}
          label="Total Payments"
          value={kpis?.totalPayments?.value || "₦8,950,000"}
          subtext={kpis?.totalPayments?.trend || "+18% from last month"}
          subtextColor="emerald"
        />
      </div>

      {/* Row 2: Middle Section (Payment Overview Chart + Quick Action Drawer) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Payment Overview (8 cols) */}
        <div className="lg:col-span-8">
          <PaymentOverviewCard data={paymentOverview} />
        </div>

        {/* Quick Action Drawer (4 cols) */}
        <div className="lg:col-span-4">
          <QuickActionsCard onAction={handleQuickAction} />
        </div>
      </div>

      {/* Row 3: Operational Stream (Recent Invoices Table + Gate Access Logs) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Recent Invoices Table (7 cols) */}
        <div className="lg:col-span-7">
          <RecentInvoicesTable 
            invoices={recentInvoices} 
            onViewAll={() => showToast('Opening Invoices Ledger...')}
          />
        </div>

        {/* Gate Access Logs (5 cols) */}
        <div className="lg:col-span-5">
          <GateAccessLogsList 
            logs={gateLogs}
            onViewAll={() => showToast('Opening Live Gate Feed...')}
          />
        </div>
      </div>

      {/* Row 4: Bottom Section (Estates Overview Deck + Upcoming Dues) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Estates Overview Cards (8 cols) */}
        <div className="lg:col-span-8">
          <EstatesOverviewDeck 
            estates={estatesOverview}
            onViewAll={() => showToast('Opening Estates Directory...')}
          />
        </div>

        {/* Upcoming Dues Schedule (4 cols) */}
        <div className="lg:col-span-4">
          <UpcomingDuesList 
            dues={upcomingDues}
            onViewAll={() => showToast('Opening Dues Schedule...')}
          />
        </div>
      </div>

      {/* Interactive Modals */}
      <QuickGateModal
        isOpen={isScanQROpen}
        onClose={() => setIsScanQROpen(false)}
        onVerified={() => {
          showToast('✅ Gate Access Granted! Arrival alert dispatched.');
          refetch();
        }}
      />

      <AddResidentModal
        isOpen={addResidentOpen}
        onClose={() => setAddResidentOpen(false)}
        onSuccess={() => {
          showToast('Resident added successfully.');
          refetch();
        }}
      />

      <GenerateInvoiceModal
        isOpen={generateInvoiceOpen}
        onClose={() => setGenerateInvoiceOpen(false)}
        onSuccess={() => {
          showToast('Invoice generated and sent.');
          refetch();
        }}
      />

      <CreatePassModal
        isOpen={createPassOpen}
        onClose={() => setCreatePassOpen(false)}
        onSuccess={() => {
          showToast('Visitor gate pass generated.');
          refetch();
        }}
      />
    </div>
  );
};
