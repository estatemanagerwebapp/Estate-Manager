import React from 'react';

export const GateAccessLogsList = ({ logs = [], onViewAll }) => {
  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-card flex flex-col justify-between">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4 pb-2">
        <h3 className="text-base font-bold text-slate-900 tracking-tight">
          Gate Access Logs
        </h3>
        <button
          onClick={onViewAll}
          className="text-xs font-bold text-primary hover:text-primary-600 transition-colors cursor-pointer"
        >
          View All
        </button>
      </div>

      {/* Log items stream */}
      <div className="divide-y divide-slate-100">
        {logs.map((log, idx) => {
          const isEntry = log.action === 'ENTRY';
          const defaultAvatar = `https://images.unsplash.com/photo-${1500000000000 + (idx * 50000000)}?w=100&auto=format&fit=crop&q=80`;

          return (
            <div key={log.id || idx} className="py-3 flex items-center justify-between gap-3 group">
              <div className="flex items-center gap-3 min-w-0">
                {/* User avatar */}
                <img
                  src={log.avatar || defaultAvatar}
                  alt={log.visitorName}
                  className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-2xs flex-shrink-0"
                />

                {/* Name & Role/Unit Subtitle */}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    {log.visitorName}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                    {log.subtitle}
                  </div>
                </div>
              </div>

              {/* Status Badge & Timestamp */}
              <div className="flex items-center gap-3 flex-shrink-0 text-right">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                    isEntry
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {isEntry ? 'Entry' : 'Exit'}
                </span>
                <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap min-w-[55px] text-right font-mono">
                  {log.time}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
