import React from 'react';
import { ShieldAlert, Wrench, ShieldCheck } from 'lucide-react';

export const UpcomingDuesList = ({ dues = [], onViewAll }) => {
  const getDueIcon = (title) => {
    if (title.toLowerCase().includes('maintenance')) {
      return Wrench;
    }
    if (title.toLowerCase().includes('security')) {
      return ShieldCheck;
    }
    return ShieldAlert;
  };

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-card flex flex-col justify-between">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4 pb-2">
        <h3 className="text-base font-bold text-slate-900 tracking-tight">
          Upcoming Dues
        </h3>
        <button
          onClick={onViewAll}
          className="text-xs font-bold text-primary hover:text-primary-600 transition-colors cursor-pointer"
        >
          View All
        </button>
      </div>

      {/* Dues List */}
      <div className="divide-y divide-slate-100">
        {dues.map((due, idx) => {
          const Icon = getDueIcon(due.title);

          return (
            <div key={due.id || idx} className="py-3 flex items-center justify-between gap-3 group">
              <div className="flex items-center gap-3 min-w-0">
                {/* Due Type Icon */}
                <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200/70 flex items-center justify-center text-primary flex-shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>

                {/* Title & Units/Due countdown */}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    {due.title}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                    <span>{due.units}</span>
                    <span>•</span>
                    <span className="text-primary font-bold">{due.dueTag}</span>
                  </div>
                </div>
              </div>

              {/* Amount */}
              <div className="text-xs font-extrabold text-slate-900 flex-shrink-0 text-right font-sans">
                {due.amount}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
