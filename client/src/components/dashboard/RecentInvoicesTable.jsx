import React from 'react';
import { MoreHorizontal } from 'lucide-react';

export const RecentInvoicesTable = ({ invoices = [], onViewAll }) => {
  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'PAID':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Paid
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            Pending
          </span>
        );
      case 'OVERDUE':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            Overdue
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-card flex flex-col justify-between">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4 pb-2">
        <h3 className="text-base font-bold text-slate-900 tracking-tight">
          Recent Invoices
        </h3>
        <button
          onClick={onViewAll}
          className="text-xs font-bold text-primary hover:text-primary-600 transition-colors cursor-pointer"
        >
          View All
        </button>
      </div>

      {/* Responsive Table Container */}
      <div className="overflow-x-auto -mx-5 sm:-mx-6">
        <table className="w-full text-left text-xs min-w-[540px]">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <th className="py-2.5 px-5 sm:px-6">Invoice #</th>
              <th className="py-2.5 px-3">Resident</th>
              <th className="py-2.5 px-3">Unit</th>
              <th className="py-2.5 px-3">Amount</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Due Date</th>
              <th className="py-2.5 pr-5 sm:pr-6 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {invoices.map((inv) => {
              const isOverdue = inv.status?.toUpperCase() === 'OVERDUE';
              return (
                <tr key={inv.id || inv.invoiceNumber} className="hover:bg-slate-50/70 transition-colors">
                  {/* Invoice # */}
                  <td className="py-3 px-5 sm:px-6 font-mono font-medium text-slate-600 whitespace-nowrap">
                    {inv.invoiceNumber}
                  </td>

                  {/* Resident Name */}
                  <td className="py-3 px-3 font-semibold text-slate-900 whitespace-nowrap">
                    {inv.residentName}
                  </td>

                  {/* Unit */}
                  <td className="py-3 px-3 text-slate-500 font-medium whitespace-nowrap">
                    {inv.unit}
                  </td>

                  {/* Amount */}
                  <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap font-sans">
                    {inv.formattedAmount}
                  </td>

                  {/* Status Badge */}
                  <td className="py-3 px-3 whitespace-nowrap">
                    {getStatusBadge(inv.status)}
                  </td>

                  {/* Due Date */}
                  <td className={`py-3 px-3 whitespace-nowrap font-medium ${isOverdue ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
                    {inv.dueDate}
                  </td>

                  {/* Action Dots */}
                  <td className="py-3 pr-5 sm:pr-6 text-right whitespace-nowrap">
                    <button className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
