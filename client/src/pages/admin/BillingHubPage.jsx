import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Plus, 
  Search, 
  Download, 
  CreditCard, 
  Receipt, 
  Filter, 
  TrendingUp,
  Building,
  RefreshCw
} from 'lucide-react';
import api from '../../services/api';
import { billingService } from '../../services/billingService';
import { formatNaira, formatDate } from '../../utils/formatters';
import { GenerateInvoiceModal } from '../../components/billing/GenerateInvoiceModal';
import { PaymentReceiptModal } from '../../components/billing/PaymentReceiptModal';
import { RecordPaymentModal } from '../../components/billing/RecordPaymentModal';

export const BillingHubPage = () => {
  const [activeTab, setActiveTab] = useState('ALL'); // ALL, PAID, PENDING, OVERDUE
  const [estateFilter, setEstateFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [selectedInvoiceForReceipt, setSelectedInvoiceForReceipt] = useState(null);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch estates list for filter
  const { data: estates = [] } = useQuery({
    queryKey: ['billing-estates-filter'],
    queryFn: async () => {
      const res = await api.get('/estates');
      return res.data?.estates || [];
    }
  });

  // Fetch invoices with live filters
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['billing-invoices', estateFilter, activeTab, searchQuery],
    queryFn: async () => {
      const params = {};
      if (estateFilter !== 'ALL') params.estateId = estateFilter;
      if (activeTab !== 'ALL') params.status = activeTab;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      return await billingService.getInvoices(params);
    }
  });

  const invoices = data?.invoices || [];
  const stats = data?.stats || {
    totalInvoiced: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    paidCount: 0,
    pendingCount: 0,
    overdueCount: 0,
    totalCount: 0
  };

  const collectionEfficiency = stats.totalInvoiced > 0
    ? Math.round((stats.totalPaid / stats.totalInvoiced) * 100)
    : 100;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg border border-slate-700 flex items-center gap-2.5 text-xs animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            <span>Financial Operations</span>
            <span>&bull;</span>
            <span className="text-primary font-bold">Revenue & Invoicing</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Billing & Invoices Hub</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage estate service charges, automated resident levies, and reconciled payment records.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button 
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 bg-white border border-slate-200 shadow-xs hover:bg-slate-50 transition-colors cursor-pointer"
            title="Refresh Invoices"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-primary' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export Statement</span>
          </button>

          <button
            type="button"
            onClick={() => setIsGenerateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-primary hover:bg-primary-dark text-white transition-all shadow-sm shadow-primary/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Generate Invoice</span>
          </button>
        </div>
      </div>

      {/* Financial KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Invoiced */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Invoiced</span>
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {formatNaira(stats.totalInvoiced)}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
              <span className="text-emerald-600 font-semibold inline-flex items-center">
                <TrendingUp className="w-3 h-3 mr-0.5" /> Active
              </span>
              <span>across {stats.totalCount} issued bills</span>
            </div>
          </div>
        </div>

        {/* Card 2: Collected Revenue */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Revenue Collected</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {formatNaira(stats.totalPaid)}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              <span>{collectionEfficiency}% collection efficiency</span>
            </div>
          </div>
        </div>

        {/* Card 3: Outstanding Dues */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Outstanding Dues</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {formatNaira(stats.totalOutstanding)}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-amber-600 font-medium mt-1">
              <span>{stats.pendingCount} pending payment</span>
            </div>
          </div>
        </div>

        {/* Card 4: Overdue Delinquency */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overdue Accounts</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {stats.overdueCount} Accounts
            </div>
            <div className="flex items-center gap-1.5 text-xs text-rose-600 font-medium mt-1">
              <span>Past due grace deadline</span>
            </div>
          </div>
        </div>

      </div>

      {/* Main Ledger Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
        
        {/* Controls Bar */}
        <div className="p-4 border-b border-slate-200/80 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-50/40">
          
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-xl text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              All Invoices ({stats.totalCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PAID')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'PAID' ? 'bg-white text-emerald-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              Paid ({stats.paidCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PENDING')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'PENDING' ? 'bg-white text-amber-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              Pending ({stats.pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('OVERDUE')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'OVERDUE' ? 'bg-white text-rose-700 shadow-xs' : 'hover:text-rose-600'
              }`}
            >
              Overdue ({stats.overdueCount})
            </button>
          </div>

          {/* Search & Estate Select */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search resident, invoice #, unit..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white text-slate-800"
              />
            </div>

            <select
              value={estateFilter}
              onChange={(e) => setEstateFilter(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
            >
              <option value="ALL">All Estates</option>
              {estates.map((est) => (
                <option key={est.id} value={est.id}>
                  {est.name}
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Resident & Property</th>
                <th className="py-3 px-4">Description / Type</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span>Loading real-time financial records from database...</span>
                    </div>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400">
                    <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-medium text-slate-600">No invoices found matching current filters.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Try switching tabs or generating a new estate invoice.</p>
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const isPaid = inv.status === 'PAID';
                  const isOverdue = inv.status === 'OVERDUE' || (inv.dueDate && new Date(inv.dueDate) < new Date() && !isPaid);
                  const isPartial = inv.status === 'PARTIALLY_PAID' || (inv.paidAmount > 0 && inv.paidAmount < inv.amount);
                  
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                      
                      {/* Invoice Number */}
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                        {inv.invoiceNumber}
                      </td>

                      {/* Resident & Unit */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">
                          {inv.resident ? `${inv.resident.firstName} ${inv.resident.lastName}` : 'Unassigned'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {inv.estate?.name} &bull; Unit {inv.property?.displayIdentifier || 'N/A'}
                        </div>
                      </td>

                      {/* Title & Type */}
                      <td className="py-3.5 px-4">
                        <div className="text-slate-900 font-medium">{inv.title}</div>
                        <div className="text-[11px] text-slate-500">
                          {Array.isArray(inv.items) && inv.items.length > 0
                            ? `${inv.items.length} line items itemized`
                            : 'Service charge'}
                        </div>
                      </td>

                      {/* Due Date */}
                      <td className={`py-3.5 px-4 ${isOverdue ? 'text-rose-600 font-medium' : 'text-slate-600'}`}>
                        {formatDate(inv.dueDate)}
                        {isOverdue && <span className="block text-[10px] text-rose-500">Past grace period</span>}
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{formatNaira(inv.amount)}</div>
                        {inv.paidAmount > 0 && (
                          <div className="text-[11px] text-emerald-600 font-medium">
                            Paid: {formatNaira(inv.paidAmount)}
                          </div>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>PAID</span>
                          </span>
                        ) : isOverdue ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            <span>OVERDUE</span>
                          </span>
                        ) : isPartial ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                            <Clock className="w-3 h-3 text-sky-600" />
                            <span>PARTIAL ({Math.round((inv.paidAmount / inv.amount) * 100)}%)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>PENDING</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right space-x-1.5">
                        {/* View Receipt Button (if any payment recorded or invoice paid) */}
                        {(isPaid || isPartial) && (
                          <button
                            type="button"
                            onClick={() => setSelectedInvoiceForReceipt(inv)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-primary hover:bg-primary-50 transition-colors border border-primary/20 cursor-pointer"
                          >
                            <Receipt className="w-3 h-3" />
                            <span>Receipt</span>
                          </button>
                        )}

                        {/* Record Payment Button (if not fully paid) */}
                        {!isPaid && (
                          <button
                            type="button"
                            onClick={() => setSelectedInvoiceForPayment(inv)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors border border-slate-200 cursor-pointer"
                          >
                            <CreditCard className="w-3 h-3 text-slate-500" />
                            <span>Record Payment</span>
                          </button>
                        )}
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500 bg-slate-50/40">
          <div>Showing {invoices.length} of {stats.totalCount} total invoices</div>
          <div className="text-[11px] text-slate-400">All data synchronized live with Supabase PostgreSQL</div>
        </div>

      </div>

      {/* MODALS */}
      <GenerateInvoiceModal
        isOpen={isGenerateOpen}
        onClose={() => setIsGenerateOpen(false)}
        onSuccess={(createdInv) => {
          showToast(`Invoice ${createdInv?.invoiceNumber || ''} generated successfully.`);
          refetch();
        }}
      />

      <PaymentReceiptModal
        isOpen={Boolean(selectedInvoiceForReceipt)}
        invoice={selectedInvoiceForReceipt}
        onClose={() => setSelectedInvoiceForReceipt(null)}
      />

      <RecordPaymentModal
        isOpen={Boolean(selectedInvoiceForPayment)}
        invoice={selectedInvoiceForPayment}
        onClose={() => setSelectedInvoiceForPayment(null)}
        onSuccess={(data) => {
          showToast(`Payment of ${formatNaira(data?.payment?.amount || 0)} recorded successfully.`);
          refetch();
          if (data?.invoice) {
            setSelectedInvoiceForReceipt(data.invoice);
          }
        }}
      />

    </div>
  );
};
