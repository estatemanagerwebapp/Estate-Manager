import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export const PaymentOverviewCard = ({ data }) => {
  const [filter, setFilter] = useState('This Month');
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState(null);
  const [isAnimated, setIsAnimated] = useState(false);
  const [displayPercentage, setDisplayPercentage] = useState(0);

  const collected = data?.collected || 8950000;
  const outstanding = data?.outstanding || 3480000;
  const total = data?.total || 12430000;
  const targetPercentage = data?.percentage || 72;

  // Chart data points
  const chartData = data?.chartData || [
    { day: '1', received: 2400000, outstanding: 1200000 },
    { day: '3', received: 800000, outstanding: 3400000 },
    { day: '5', received: 400000, outstanding: 1100000 },
    { day: '8', received: 1500000, outstanding: 900000 },
    { day: '10', received: 2100000, outstanding: 1800000 },
    { day: '13', received: 1200000, outstanding: 2500000 },
    { day: '15', received: 2400000, outstanding: 2200000 },
    { day: '18', received: 3100000, outstanding: 1700000 },
    { day: '20', received: 2600000, outstanding: 1900000 },
    { day: '22', received: 4200000, outstanding: 1400000 },
    { day: '25', received: 2800000, outstanding: 3200000 },
    { day: '28', received: 3600000, outstanding: 3100000 },
    { day: '30', received: 1600000, outstanding: 900000 }
  ];

  const maxVal = 4500000; // ₦4.5M scale ceiling

  // Circular progress calculations for donut
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const targetStrokeDashoffset = circumference - (targetPercentage / 100) * circumference;

  // On-load motion: Trigger bar heights and donut progress after mount
  useEffect(() => {
    setIsAnimated(false);
    setDisplayPercentage(0);

    const timer = setTimeout(() => {
      setIsAnimated(true);
    }, 60);

    // Number counter animation for percentage
    const duration = 1200; // 1.2s
    const startTime = performance.now();

    const animateCounter = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * targetPercentage);
      setDisplayPercentage(current);

      if (progress < 1) {
        requestAnimationFrame(animateCounter);
      } else {
        setDisplayPercentage(targetPercentage);
      }
    };

    const counterRaf = requestAnimationFrame(animateCounter);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(counterRaf);
    };
  }, [data, filter, targetPercentage]);

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-card">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-6 pb-2">
        <h3 className="text-base font-bold text-slate-900 tracking-tight">
          Payment Overview
        </h3>

        {/* Period Filter Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setFilterOpen(!filterOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            <span>{filter}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {filterOpen && (
            <div className="absolute right-0 mt-1.5 w-36 bg-white rounded-xl shadow-dropdown border border-slate-100 py-1 z-30 animate-fadeIn text-xs">
              {['This Month', 'Last Month', 'This Quarter', 'Year to Date'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setFilter(opt);
                    setFilterOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-orange-50 hover:text-primary transition-colors cursor-pointer ${
                    filter === opt ? 'font-bold text-primary bg-orange-50/50' : 'text-slate-700'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left: Double Bar Chart (8 cols) */}
        <div className="lg:col-span-8 flex flex-col justify-between">
          <div className="h-52 relative flex items-end pt-6">
            {/* Horizontal Gridlines & Y-Axis Labels */}
            <div className="absolute inset-x-0 inset-y-0 flex flex-col justify-between pointer-events-none text-[10px] text-slate-400 font-mono">
              <div className="flex items-center w-full">
                <span className="w-8 flex-shrink-0">₦4M</span>
                <div className="w-full border-b border-dashed border-slate-100"></div>
              </div>
              <div className="flex items-center w-full">
                <span className="w-8 flex-shrink-0">₦3M</span>
                <div className="w-full border-b border-dashed border-slate-100"></div>
              </div>
              <div className="flex items-center w-full">
                <span className="w-8 flex-shrink-0">₦2M</span>
                <div className="w-full border-b border-dashed border-slate-100"></div>
              </div>
              <div className="flex items-center w-full">
                <span className="w-8 flex-shrink-0">₦1M</span>
                <div className="w-full border-b border-dashed border-slate-100"></div>
              </div>
              <div className="flex items-center w-full">
                <span className="w-8 flex-shrink-0">0</span>
                <div className="w-full border-b border-slate-200"></div>
              </div>
            </div>

            {/* Bars container */}
            <div className="w-full pl-8 h-full flex items-end justify-between gap-1 sm:gap-2 z-10">
              {chartData.map((item, idx) => {
                const targetReceived = Math.min(100, (item.received / maxVal) * 100);
                const targetOutstanding = Math.min(100, (item.outstanding / maxVal) * 100);

                const currentReceived = isAnimated ? targetReceived : 0;
                const currentOutstanding = isAnimated ? targetOutstanding : 0;

                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center h-full justify-end group relative"
                    onMouseEnter={() => setActiveTooltip(item)}
                    onMouseLeave={() => setActiveTooltip(null)}
                  >
                    {/* Tooltip */}
                    {activeTooltip === item && (
                      <div className="absolute -top-12 z-40 bg-slate-900 text-white text-[10px] py-1.5 px-2.5 rounded-lg shadow-lg pointer-events-none whitespace-nowrap animate-fadeIn">
                        <div>Day {item.day}</div>
                        <div className="text-primary font-bold">Recv: ₦{(item.received / 1000000).toFixed(2)}M</div>
                        <div className="text-amber-300">Outs: ₦{(item.outstanding / 1000000).toFixed(2)}M</div>
                      </div>
                    )}

                    {/* Dual grouped bars with staggered spring growth */}
                    <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-full pb-1">
                      {/* Received Bar (Solid Orange) */}
                      <div
                        style={{ 
                          height: `${currentReceived}%`,
                          transition: `height 800ms cubic-bezier(0.16, 1, 0.3, 1) ${idx * 35}ms` 
                        }}
                        className="w-1.5 sm:w-2.5 bg-primary rounded-t-sm group-hover:brightness-110"
                      />
                      {/* Outstanding Bar (Soft Peach) */}
                      <div
                        style={{ 
                          height: `${currentOutstanding}%`,
                          transition: `height 800ms cubic-bezier(0.16, 1, 0.3, 1) ${idx * 35 + 40}ms` 
                        }}
                        className="w-1.5 sm:w-2.5 bg-orange-200/80 rounded-t-sm group-hover:brightness-105"
                      />
                    </div>

                    {/* Day label */}
                    <span className="text-[10px] text-slate-400 font-medium mt-1 font-mono">
                      {item.day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chart Legend */}
          <div className="flex items-center justify-center gap-6 mt-4 pt-3 border-t border-slate-100 text-xs font-semibold text-slate-600">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary"></span>
              <span>Payments Received</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-200"></span>
              <span className="text-slate-500">Outstanding</span>
            </div>
          </div>
        </div>

        {/* Right: Radial Donut Chart & Breakdown (4 cols) */}
        <div className="lg:col-span-4 bg-slate-50/70 rounded-2xl p-5 border border-slate-100 flex flex-col items-center justify-center">
          {/* Radial Donut SVG Meter with smooth arc transition */}
          <div className="relative w-36 h-36 flex items-center justify-center my-1">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 130 130">
              {/* Background Track */}
              <circle
                cx="65"
                cy="65"
                r={radius}
                className="text-orange-100"
                strokeWidth="12"
                stroke="currentColor"
                fill="transparent"
              />
              {/* Active Orange Stroke */}
              <circle
                cx="65"
                cy="65"
                r={radius}
                style={{
                  strokeDashoffset: isAnimated ? targetStrokeDashoffset : circumference,
                  transition: 'stroke-dashoffset 1100ms cubic-bezier(0.16, 1, 0.3, 1)'
                }}
                className="text-primary"
                strokeWidth="12"
                strokeDasharray={circumference}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
              />
            </svg>

            {/* Inner Percentage Label with Smooth Counter */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-black text-slate-900 leading-none tabular-nums">
                {displayPercentage}%
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                Collected
              </span>
            </div>
          </div>

          {/* Financial Breakdown Table */}
          <div className="w-full space-y-2 mt-4 pt-4 border-t border-slate-200/60 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-slate-500 font-medium">Collected</span>
              </div>
              <span className="font-bold text-slate-900">₦{collected.toLocaleString()}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-300"></span>
                <span className="text-slate-500 font-medium">Outstanding</span>
              </div>
              <span className="font-bold text-slate-900">₦{outstanding.toLocaleString()}</span>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
              <span className="text-slate-700 font-bold">Total</span>
              <span className="font-extrabold text-slate-900">₦{total.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
