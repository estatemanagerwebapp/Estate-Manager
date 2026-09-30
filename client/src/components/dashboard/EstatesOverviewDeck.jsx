import React, { useState, useEffect } from 'react';
import { MoreHorizontal } from 'lucide-react';

export const EstatesOverviewDeck = ({ estates = [], onViewAll }) => {
  const [isAnimated, setIsAnimated] = useState(false);

  useEffect(() => {
    setIsAnimated(false);
    const timer = setTimeout(() => setIsAnimated(true), 80);
    return () => clearTimeout(timer);
  }, [estates]);

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-card flex flex-col justify-between">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4 pb-2">
        <h3 className="text-base font-bold text-slate-900 tracking-tight">
          Estates Overview
        </h3>
        <button
          type="button"
          onClick={onViewAll}
          className="text-xs font-bold text-primary hover:text-primary-600 transition-colors cursor-pointer"
        >
          View All
        </button>
      </div>

      {/* Grid of Estate Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {estates.map((est, idx) => {
          const occupancy = est.occupancyPercentage || 85;

          return (
            <div
              key={est.id || est.name}
              className="bg-slate-50/70 hover:bg-slate-50 rounded-2xl p-3.5 border border-slate-200/60 transition-all duration-200 group flex flex-col justify-between"
            >
              <div>
                {/* Estate Exterior Photo */}
                <div className="relative w-full h-28 rounded-xl overflow-hidden mb-3 bg-slate-200">
                  <img
                    src={est.imageUrl}
                    alt={est.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <button 
                    type="button"
                    className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-white/90 backdrop-blur-xs flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>

                {/* Estate Title & Units */}
                <h4 className="text-xs font-bold text-slate-900 truncate">
                  {est.name}
                </h4>
                <div className="text-[11px] text-slate-500 font-medium mt-0.5 mb-3">
                  {est.unitsCount}
                </div>
              </div>

              {/* Occupancy Progress Bar */}
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1.5 font-semibold">
                  <span className="text-slate-600">{est.occupancyRate}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    style={{ 
                      width: isAnimated ? `${occupancy}%` : '0%',
                      transition: `width 800ms cubic-bezier(0.16, 1, 0.3, 1) ${idx * 100}ms`
                    }}
                    className="h-full bg-primary rounded-full"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
