import React, { useRef, useEffect } from 'react';
import { X, Printer, Download, ShieldCheck, CheckCircle2, Building, Calendar, CreditCard, ArrowLeft } from 'lucide-react';
import { formatNaira, formatDate, formatDateTime, numberToWordsNaira } from '../../utils/formatters';

export const PaymentReceiptModal = ({ isOpen, onClose, invoice, payment }) => {
  const receiptRef = useRef(null);

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

  if (!isOpen || !invoice) return null;

  // Use the specific payment provided or the latest payment on the invoice
  const activePayment = payment || (invoice.payments && invoice.payments.length > 0 ? invoice.payments[0] : null);
  const paymentAmount = activePayment ? activePayment.amount : (invoice.paidAmount || invoice.amount);
  const receiptNumber = activePayment?.paymentReference 
    ? `REC-${activePayment.paymentReference.replace('PAY-REF-', '').replace('PAY-MANUAL-', '')}`
    : `REC-${invoice.invoiceNumber.replace('INV-', '')}`;
  const transactionRef = activePayment?.paymentReference || `PAY-SYS-${invoice.id.slice(-8).toUpperCase()}`;
  const paymentChannel = activePayment?.channel?.replace('_', ' ') || 'BANK TRANSFER';
  const paymentDate = activePayment?.paidAt || invoice.updatedAt || new Date();

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    window.print();
  };

  // Extract or parse itemized lines
  const lineItems = Array.isArray(invoice.items) && invoice.items.length > 0 
    ? invoice.items 
    : [
        {
          description: invoice.title || 'Estate Service Charge & Facility Maintenance',
          quantity: 1,
          unitPrice: invoice.amount,
          amount: invoice.amount
        }
      ];

  const residentName = invoice.resident 
    ? `${invoice.resident.firstName} ${invoice.resident.lastName}`
    : 'Resident';

  const estateName = invoice.estate?.name || 'Estate Management Authority';
  const estateAddress = invoice.estate?.address 
    ? `${invoice.estate.address}, ${invoice.estate.city || 'Lagos'}, ${invoice.estate.state || 'Nigeria'}`
    : 'Admiralty Way, Lekki Phase 1, Lagos, Nigeria';

  const propertyIdentifier = invoice.property?.displayIdentifier 
    ? `${invoice.property.block ? invoice.property.block + ', ' : ''}Unit ${invoice.property.displayIdentifier}`
    : 'Estate Property Unit';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-start justify-center p-4 sm:p-6 py-6 sm:py-10 print:p-0 print:bg-white print:static">
      
      {/* Clickable Backdrop Overlay to Close */}
      <div 
        className="fixed inset-0 bg-transparent no-print cursor-pointer" 
        onClick={onClose} 
        aria-label="Close modal backdrop"
      />

      {/* Container Card */}
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-elevated border border-slate-200 overflow-hidden flex flex-col my-auto relative z-10 print:my-0 print:shadow-none print:border-none print:w-full">
        
        {/* Sticky Top Control Bar (Hidden when printing) */}
        <div className="no-print sticky top-0 z-20 bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between border-b border-slate-800 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span className="text-xs sm:text-sm font-semibold tracking-wide">Official PropTech Electronic Receipt</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-300" />
              <span>Print</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary hover:bg-primary-dark text-white transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/90 hover:bg-rose-600 text-white transition-colors ml-1 cursor-pointer"
              title="Close Receipt (Esc)"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Printable Receipt Body */}
        <div ref={receiptRef} className="p-6 sm:p-10 text-slate-900 bg-white relative">
          
          {/* Subtle Watermark Badge */}
          <div className="absolute -right-8 -top-8 w-44 h-44 rounded-full bg-emerald-500/5 pointer-events-none" />

          {/* Receipt Top Header */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 pb-6 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center font-bold text-white text-base shadow-sm">
                  EM
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight uppercase">{estateName}</h2>
                  <p className="text-[11px] text-slate-500 uppercase tracking-widest font-medium">Estate Management Authority</p>
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500 space-y-0.5">
                <p>{estateAddress}</p>
                <p>Support: billing@estatemanager.io &bull; Automated Central Ledger</p>
              </div>
            </div>

            <div className="sm:text-right">
              <div className="inline-block px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold tracking-wider mb-2">
                OFFICIAL PAYMENT RECEIPT
              </div>
              <div className="font-mono text-sm font-bold text-slate-900">{receiptNumber}</div>
              <div className="text-xs text-slate-500 mt-1">Date: {formatDateTime(paymentDate)}</div>
            </div>
          </div>

          {/* Meta Particulars Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-6 border-b border-slate-200 text-xs">
            
            {/* Billed To Box */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Billed To (Resident)</div>
              <div className="text-sm font-bold text-slate-900">{residentName}</div>
              <div className="text-slate-600 mt-1 space-y-0.5">
                <p><span className="font-medium text-slate-700">Resident Code:</span> {invoice.resident?.residentCode || 'RES-TENANT'}</p>
                <p><span className="font-medium text-slate-700">Property:</span> {propertyIdentifier}</p>
                <p><span className="font-medium text-slate-700">Phone:</span> {invoice.resident?.phone || 'N/A'}</p>
              </div>
            </div>

            {/* Payment Details Box */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Payment Details</div>
              <div className="space-y-1.5 text-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Invoice Ref:</span>
                  <span className="font-mono font-medium text-slate-900">{invoice.invoiceNumber}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Payment Channel:</span>
                  <span className="font-medium text-slate-900 uppercase">{paymentChannel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Transaction ID:</span>
                  <span className="font-mono font-medium text-slate-900">{transactionRef}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Payment Status:</span>
                  <span className="font-semibold text-emerald-600 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>SUCCESSFUL (CLEARED)</span>
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* Itemized Table */}
          <div className="py-6">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[11px] font-semibold">
                  <th className="py-2.5">Item Description</th>
                  <th className="py-2.5 text-center w-16">Qty</th>
                  <th className="py-2.5 text-right w-32">Rate ({formatNaira(0).charAt(0)})</th>
                  <th className="py-2.5 text-right w-32">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {lineItems.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-3">
                      <div className="font-semibold text-slate-900">{item.description || item.title || 'Service Charge'}</div>
                      <div className="text-[11px] text-slate-500">{invoice.title || 'Estate Dues & Utilities'}</div>
                    </td>
                    <td className="py-3 text-center">{item.quantity || 1}</td>
                    <td className="py-3 text-right">{formatNaira(item.unitPrice || item.amount || 0)}</td>
                    <td className="py-3 text-right font-semibold text-slate-900">{formatNaira(item.amount || item.unitPrice || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Calculations Breakdown */}
            <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col items-end gap-1.5 text-xs">
              <div className="flex items-center justify-between w-64 text-slate-600">
                <span>Invoice Total:</span>
                <span className="font-semibold text-slate-900">{formatNaira(invoice.amount)}</span>
              </div>
              <div className="flex items-center justify-between w-64 text-slate-600">
                <span>Amount Paid This Receipt:</span>
                <span className="font-bold text-emerald-600">{formatNaira(paymentAmount)}</span>
              </div>
              <div className="flex items-center justify-between w-64 text-slate-600 pb-2">
                <span>Remaining Balance:</span>
                <span className="font-semibold text-slate-900">{formatNaira(Math.max(0, invoice.amount - (invoice.paidAmount || paymentAmount)))}</span>
              </div>
              <div className="flex items-center justify-between w-72 pt-3 border-t-2 border-slate-900 text-sm font-bold text-slate-900">
                <span>NET CLEARED AMOUNT:</span>
                <span className="text-base text-primary font-bold">{formatNaira(paymentAmount)}</span>
              </div>
            </div>
          </div>

          {/* Amount in Words */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700">
            <span className="font-bold text-slate-900">Amount in Words: </span>
            <span className="italic font-medium text-slate-800">{numberToWordsNaira(paymentAmount)}</span>
          </div>

          {/* Verification & Signoff */}
          <div className="pt-8 mt-6 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs">
            
            {/* Digital Stamp */}
            <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50/60">
              <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-emerald-900 tracking-wider">ELECTRONICALLY VERIFIED</div>
                <div className="text-[10px] text-emerald-700">Secured via Estate Manager Central Ledger &bull; No physical stamp required</div>
              </div>
            </div>

            {/* Authority Signoff */}
            <div className="text-right">
              <div className="text-xs font-mono font-bold text-slate-800">Estate Financial Controller</div>
              <div className="text-[11px] text-slate-500">Directorate of Revenue & Billing</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{estateName}</div>
            </div>

          </div>

        </div>

        {/* Bottom Control Bar */}
        <div className="no-print bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Press <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[11px]">Esc</kbd> or click outside to close
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
            >
              Print Receipt
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer"
            >
              Close Receipt
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};
