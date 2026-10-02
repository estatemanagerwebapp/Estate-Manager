import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Check, CreditCard, Building, Calendar, AlertCircle } from 'lucide-react';
import { billingService } from '../../services/billingService';
import { formatNaira } from '../../utils/formatters';

export const RecordPaymentModal = ({ isOpen, onClose, invoice, onSuccess, onPaymentRecorded }) => {
  const queryClient = useQueryClient();

  const remainingBalance = invoice ? Math.max(0, invoice.amount - (invoice.paidAmount || 0)) : 0;

  const [amount, setAmount] = useState('');
  const [channel, setChannel] = useState('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('Payment received via bank transfer teller verification.');
  const [errorMsg, setErrorMsg] = useState('');

  // Synchronize default amount whenever modal opens with an invoice
  useEffect(() => {
    if (invoice) {
      const bal = Math.max(0, invoice.amount - (invoice.paidAmount || 0));
      setAmount(bal.toString());
      setReference(`PAY-ZEN-${Date.now().toString().slice(-6)}`);
      setErrorMsg('');
    }
  }, [invoice, isOpen]);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const recordMutation = useMutation({
    mutationFn: async (payload) => {
      return await billingService.recordPayment(invoice.id, payload);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['billing-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-stats'] });
      queryClient.invalidateQueries({ queryKey: ['finance-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['finance-payments'] });
      queryClient.invalidateQueries({ queryKey: ['finance-dues-schedules'] });
      if (onSuccess) onSuccess(data);
      if (onPaymentRecorded) onPaymentRecorded(data);
      onClose();
    },
    onError: (err) => {
      setErrorMsg(err.message || 'Failed to record payment. Please verify inputs.');
    }
  });

  if (!isOpen || !invoice) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) {
      setErrorMsg('Please enter a valid payment amount greater than ₦0.00.');
      return;
    }

    recordMutation.mutate({
      amount: numericAmount,
      channel,
      reference: reference.trim(),
      paidAt,
      notes: notes.trim()
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
      
      {/* Clickable Backdrop to Close */}
      <div 
        className="fixed inset-0 bg-transparent cursor-pointer" 
        onClick={onClose} 
        aria-label="Close modal backdrop"
      />

      <div className="bg-white w-full max-w-lg rounded-2xl shadow-elevated border border-slate-200 overflow-hidden flex flex-col my-6 relative z-10">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Record Resident Payment</h2>
              <p className="text-xs text-slate-400">Log bank transfer, POS, or offline payment against an invoice.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Invoice Summary Card */}
        <div className="bg-slate-50 p-4 border-b border-slate-200 text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono font-semibold text-slate-900">{invoice.invoiceNumber}</span>
            <span className="text-slate-500">{invoice.estate?.name || 'Estate'}</span>
          </div>
          <div className="text-slate-700 font-medium">{invoice.title}</div>
          <div className="text-slate-500 text-[11px] mt-0.5">
            Resident: {invoice.resident?.firstName} {invoice.resident?.lastName} &bull; Unit: {invoice.property?.displayIdentifier}
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-200 text-center">
            <div>
              <div className="text-[10px] uppercase text-slate-400 font-bold">Total Invoiced</div>
              <div className="font-semibold text-slate-900 mt-0.5">{formatNaira(invoice.amount)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400 font-bold">Already Paid</div>
              <div className="font-semibold text-emerald-600 mt-0.5">{formatNaira(invoice.paidAmount || 0)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400 font-bold">Remaining Due</div>
              <div className="font-bold text-primary mt-0.5">{formatNaira(remainingBalance)}</div>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Payment Amount (₦) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              step="any"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Payment Channel
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="BANK_TRANSFER">Direct Bank Transfer</option>
                <option value="POS">POS Terminal</option>
                <option value="CASH">Cash Deposit</option>
                <option value="CARD">Debit Card (Online)</option>
                <option value="CHEQUE">Bank Cheque</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Payment Date
              </label>
              <input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Bank Reference / Teller Number
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. ZEN-TRF-981240"
              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Internal Verification Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={recordMutation.isPending}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {recordMutation.isPending ? (
                <span>Recording...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Confirm & Record Payment</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>

    </div>
  );
};
