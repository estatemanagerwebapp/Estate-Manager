import React from 'react';
import { ChevronRight } from 'lucide-react';

export const StatCard = ({
  icon: Icon,
  label,
  value,
  subtext,
  subtextColor = 'emerald', // 'emerald', 'orange', 'slate'
  onClick
}) => {
  const getSubtextColorClass = () => {
    switch (subtextColor) {
      case 'orange':
        return 'text-primary font-bold';
      case 'emerald':
        return 'text-emerald-600 font-semibold';
      case 'rose':
        return 'text-rose-600 font-semibold';
      default:
        return 'text-slate-500 font-medium';
    }
  };

  const getValueFontSize = () => {
    const str = String(value || '');
    if (str.length >= 15) return 'text-lg sm:text-xl';
    if (str.length >= 11) return 'text-xl sm:text-2xl';
    return 'text-2xl sm:text-3xl';
  };

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-card hover:shadow-card-hover transition-all duration-200 flex flex-col justify-between group cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        {/* Left: Soft rounded icon */}
        <div className="w-11 h-11 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary group-hover:scale-105 transition-transform duration-200">
          <Icon className="w-5 h-5 text-primary" />
        </div>

        {/* Right: Chevron link */}
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all">
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>

      <div className="min-w-0">
        <span className="text-xs font-semibold text-slate-500 block mb-1">
          {label}
        </span>
        <div className="flex items-baseline justify-between gap-2 overflow-hidden">
          <span 
            title={typeof value === 'string' ? value : undefined}
            className={`${getValueFontSize()} font-black text-slate-900 tracking-tight font-sans tabular-nums whitespace-nowrap overflow-hidden text-ellipsis`}
          >
            {value}
          </span>
        </div>
        <div className="mt-1.5 flex items-center text-xs">
          <span className={getSubtextColorClass()}>
            {subtext}
          </span>
        </div>
      </div>
    </div>
  );
};
