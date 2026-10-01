import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Building, 
  Home, 
  Users, 
  FileText, 
  Coins, 
  ChevronRight, 
  ChevronDown, 
  MapPin, 
  Edit3, 
  MoreVertical, 
  Wrench, 
  CheckCircle2, 
  AlertTriangle, 
  User, 
  Clock, 
  DollarSign, 
  ShieldCheck, 
  Settings, 
  ArrowLeft,
  Calendar,
  Layers
} from 'lucide-react';
import api from '../../services/api';
import { Button } from '../../components/ui/Button';

export const EstateDetailsPage = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();

  // Active sub-navigation tab
  const [activeTab, setActiveTab] = useState('Overview');
  const [occupancyPeriod, setOccupancyPeriod] = useState('This Month');
  const [paymentsPeriod, setPaymentsPeriod] = useState('This Year');

  // Fetch complete estate details from live API
  const { data: estateDetails, isLoading, error } = useQuery({
    queryKey: ['estate-details', id],
    queryFn: async () => {
      const res = await api.get(`/estates/${id || 'SUN-001'}/details`);
      return res.data;
    }
  });

  // Mutation to toggle status
  const statusMutation = useMutation({
    mutationFn: async ({ estateId, status }) => {
      return await api.patch(`/estates/${estateId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estate-details', id] });
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse pb-16">
        <div className="h-6 w-48 bg-slate-200 rounded-md" />
        <div className="h-64 bg-white border border-slate-200/80 rounded-3xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-white border border-slate-200/80 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !estateDetails) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-3xl p-12 text-center">
        <Building className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-800">Estate not found</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          The requested estate could not be retrieved. Please return to the estates directory.
        </p>
        <Link to="/admin/estates" className="mt-4 inline-block">
          <Button variant="outline" size="sm">Back to Estates</Button>
        </Link>
      </div>
    );
  }

  const {
    estate,
    kpis,
    occupancy,
    paymentsOverview,
    estateOffice,
    recentUnits,
    recentResidents,
    upcomingDues
  } = estateDetails;

  const isActive = estate.status === 'ACTIVE' || estate.isActive;

  const navTabs = [
    { name: 'Overview' },
    { name: 'Units' },
    { name: 'Residents' },
    { name: 'Gate Access' },
    { name: 'Invoices' },
    { name: 'Payments' },
    { name: 'Dues & Fees' },
    { name: 'Estate Office', badge: 5 },
    { name: 'Maintenance' },
    { name: 'Settings' }
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* 1. Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <Link to="/admin/estates" className="hover:text-primary transition-colors flex items-center gap-1">
          <span>Estates</span>
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-slate-800">{estate.name}</span>
      </nav>

      {/* 2. Hero Card */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 flex-1 min-w-0">
          {/* Landscape Hero Image */}
          <img
            src={estate.imageUrl || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&auto=format&fit=crop&q=80'}
            alt={estate.name}
            className="w-full sm:w-64 sm:h-40 md:w-80 md:h-44 rounded-2xl object-cover shrink-0 border border-slate-100 shadow-xs"
          />

          {/* Details */}
          <div className="space-y-2.5 min-w-0 flex-1">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {estate.name}
              </h1>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mt-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{estate.city}, {estate.state}</span>
              </div>
            </div>

            <p className="text-xs font-medium text-slate-500 leading-relaxed max-w-2xl">
              {estate.description || 'A modern and secure residential estate with premium facilities and 24/7 security.'}
            </p>

            {/* Amenity / Facility Badges */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {(estate.amenities && estate.amenities.length > 0
                ? estate.amenities
                : ['Residential', '24/7 Security', 'Swimming Pool', 'Gym', 'CCTV']
              ).map((tag, idx) => (
                <span
                  key={idx}
                  className="bg-slate-100 text-slate-600 border border-slate-200/60 text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Top Right Actions */}
        <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-3 shrink-0 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-100">
          <div className="flex items-center gap-2">
            {/* Status Dropdown Pill */}
            <button
              type="button"
              onClick={() => {
                const nextStatus = isActive ? 'ARCHIVED' : 'ACTIVE';
                statusMutation.mutate({ estateId: estate.id, status: nextStatus });
              }}
              title="Click to toggle status"
              className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
                isActive
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 hover:bg-emerald-100/60'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/60'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              <span>{isActive ? 'Active' : 'Archived'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* More Options */}
            <button
              type="button"
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200/60 cursor-pointer"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>

          {/* Edit Estate Button */}
          <Button
            variant="outline"
            size="sm"
            className="border-orange-200 text-primary hover:bg-orange-50/60 hover:border-primary text-xs font-bold px-4 py-2 rounded-xl gap-2"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit Estate</span>
          </Button>
        </div>
      </div>

      {/* 3. Top 4 Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Units */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-card transition-all duration-200 flex items-center justify-between group cursor-pointer">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary shrink-0">
              <Home className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                {kpis.units.value}
              </h3>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Units</p>
              <p className="text-xs font-semibold text-emerald-600 mt-0.5">
                {kpis.units.trend}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>

        {/* Residents */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-card transition-all duration-200 flex items-center justify-between group cursor-pointer">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                {kpis.residents.value}
              </h3>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Residents</p>
              <p className="text-xs font-semibold text-emerald-600 mt-0.5">
                {kpis.residents.trend}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>

        {/* Open Complaints */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-card transition-all duration-200 flex items-center justify-between group cursor-pointer">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                {kpis.openComplaints.value}
              </h3>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Open Complaints</p>
              <p className="text-xs font-semibold text-amber-600 mt-0.5">
                {kpis.openComplaints.trend}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>

        {/* Total Payments */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-card transition-all duration-200 flex items-center justify-between group cursor-pointer">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary shrink-0">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                ₦{Number(kpis.totalPayments.value).toLocaleString()}
              </h3>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Payments</p>
              <p className="text-xs font-semibold text-emerald-600 mt-0.5">
                {kpis.totalPayments.trend}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>

      {/* 4. Sub-Navigation Tab Bar */}
      <div className="border-b border-slate-200/80 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          {navTabs.map((tab) => (
            <button
              key={tab.name}
              type="button"
              onClick={() => setActiveTab(tab.name)}
              className={`px-4 py-3 text-sm font-semibold transition-all relative flex items-center gap-2 cursor-pointer ${
                activeTab === tab.name
                  ? 'text-primary'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>{tab.name}</span>
              {tab.badge && (
                <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
              {activeTab === tab.name && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Middle Row (Occupancy, Payments, Estate Office) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Occupancy Overview */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900">Occupancy Overview</h3>
            <div className="relative">
              <select
                value={occupancyPeriod}
                onChange={(e) => setOccupancyPeriod(e.target.value)}
                className="appearance-none pl-3 pr-7 py-1 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-semibold text-slate-600 focus:outline-none cursor-pointer"
              >
                <option value="This Month">This Month</option>
                <option value="Last Month">Last Month</option>
                <option value="This Year">This Year</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* SVG Donut Chart */}
          <div className="flex items-center justify-between gap-6 my-2">
            <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                {/* Background Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="transparent"
                  stroke="#F1F5F9"
                  strokeWidth="12"
                />
                {/* Reserved Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="transparent"
                  stroke="#CBD5E1"
                  strokeWidth="12"
                  strokeDasharray={`${(occupancy.reserved / occupancy.total) * 238.76} 238.76`}
                  strokeDashoffset="0"
                />
                {/* Vacant Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="transparent"
                  stroke="#FED7AA"
                  strokeWidth="12"
                  strokeDasharray={`${(occupancy.vacant / occupancy.total) * 238.76} 238.76`}
                  strokeDashoffset={`-${(occupancy.reserved / occupancy.total) * 238.76}`}
                />
                {/* Occupied Ring (Orange) */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="transparent"
                  stroke="#FF5A1F"
                  strokeWidth="12"
                  strokeDasharray={`${(occupancy.occupied / occupancy.total) * 238.76} 238.76`}
                  strokeDashoffset={`-${((occupancy.reserved + occupancy.vacant) / occupancy.total) * 238.76}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xl font-black text-slate-900 tracking-tight">{occupancy.rate}%</span>
                <span className="text-[10px] font-semibold text-slate-400">Occupied</span>
              </div>
            </div>

            {/* Legend */}
            <div className="space-y-2.5 flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
                  <span className="font-semibold text-slate-700">Occupied</span>
                </div>
                <span className="font-bold text-slate-900">{occupancy.occupied} (85%)</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-200 shrink-0" />
                  <span className="font-semibold text-slate-700">Vacant</span>
                </div>
                <span className="font-bold text-slate-900">{occupancy.vacant} (12%)</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0" />
                  <span className="font-semibold text-slate-700">Reserved</span>
                </div>
                <span className="font-bold text-slate-900">{occupancy.reserved} (3%)</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total Units</span>
            <span className="font-black text-slate-900 text-sm">{occupancy.total}</span>
          </div>
        </div>

        {/* Card 2: Payments Overview */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900">Payments Overview</h3>
            <div className="relative">
              <select
                value={paymentsPeriod}
                onChange={(e) => setPaymentsPeriod(e.target.value)}
                className="appearance-none pl-3 pr-7 py-1 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-semibold text-slate-600 focus:outline-none cursor-pointer"
              >
                <option value="This Year">This Year</option>
                <option value="Last Year">Last Year</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Bar Chart Area */}
          <div className="h-44 flex items-end justify-between gap-2 pt-6 pb-2 px-1 border-b border-slate-100">
            {paymentsOverview.map((item, index) => {
              const maxVal = 4000000;
              const recHeight = Math.min(Math.round((item.received / maxVal) * 100), 100);
              const outHeight = Math.min(Math.round((item.outstanding / maxVal) * 100), 100);

              return (
                <div key={index} className="flex-1 flex flex-col items-center h-full justify-end group">
                  <div className="w-full flex items-end justify-center gap-1 h-36">
                    {/* Received Bar (Dark Orange) */}
                    <div
                      style={{ height: `${recHeight}%` }}
                      className="w-2.5 sm:w-3.5 bg-primary rounded-t-md transition-all duration-300 group-hover:brightness-110"
                      title={`${item.month} Received: ₦${item.received.toLocaleString()}`}
                    />
                    {/* Outstanding Bar (Light Peach) */}
                    <div
                      style={{ height: `${outHeight}%` }}
                      className="w-2.5 sm:w-3.5 bg-orange-200/80 rounded-t-md transition-all duration-300 group-hover:brightness-110"
                      title={`${item.month} Outstanding: ₦${item.outstanding.toLocaleString()}`}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400 mt-2">{item.month}</span>
                </div>
              );
            })}
          </div>

          {/* Chart Legend */}
          <div className="pt-3 flex items-center justify-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary" />
              <span className="font-semibold text-slate-600">Payments Received</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-200" />
              <span className="font-semibold text-slate-600">Outstanding</span>
            </div>
          </div>
        </div>

        {/* Card 3: Estate Office (Complaints Feed) */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-slate-900">Estate Office</h3>
            <Link
              to="/admin/complaints"
              className="text-xs font-bold text-primary hover:text-primary-600 transition-colors"
            >
              View All
            </Link>
          </div>

          {/* Feed List */}
          <div className="space-y-3.5 flex-1 divide-y divide-slate-100">
            {estateOffice.map((ticket, index) => {
              const isOpen = ticket.status === 'Open';
              const isInProgress = ticket.status === 'In Progress';
              const isResolved = ticket.status === 'Resolved';

              return (
                <div key={ticket.id || index} className="pt-3 first:pt-0 flex items-center justify-between gap-3 group">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isOpen
                        ? 'bg-rose-50 text-rose-600'
                        : isResolved
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-orange-50 text-primary'
                    }`}>
                      {isOpen ? (
                        <User className="w-4 h-4" />
                      ) : isResolved ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate group-hover:text-primary transition-colors">
                        {ticket.title}
                      </h4>
                      <p className="text-[11px] font-medium text-slate-400 mt-0.5 truncate">
                        #{ticket.ticketNumber} • {ticket.location}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                      isOpen
                        ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
                        : isResolved
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                        : 'bg-orange-50 text-primary border border-orange-200/80'
                    }`}>
                      {ticket.status}
                    </span>
                    <span className="block text-[10px] font-semibold text-slate-400 mt-0.5">
                      {ticket.timeAgo}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 6. Bottom Row: 3 Data Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table 1: Recent Units */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900">Recent Units</h3>
            <Link to="/admin/properties" className="text-xs font-bold text-primary hover:text-primary-600 transition-colors">
              View All
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="pb-2.5">UNIT</th>
                  <th className="pb-2.5">TYPE</th>
                  <th className="pb-2.5">STATUS</th>
                  <th className="pb-2.5">RESIDENT/TENANT</th>
                  <th className="pb-2.5 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {recentUnits.map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 font-bold text-slate-900">{item.unit}</td>
                    <td className="py-3 text-slate-500">{item.type}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        item.status === 'Occupied'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3">
                      {item.resident ? (
                        <div className="flex items-center gap-2">
                          <img
                            src={item.resident.avatar}
                            alt={item.resident.name}
                            className="w-5 h-5 rounded-full object-cover shrink-0"
                          />
                          <span className="truncate max-w-[100px] text-slate-800 font-semibold">{item.resident.name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <button className="text-slate-400 hover:text-slate-700 p-1">
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Recent Residents */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900">Recent Residents</h3>
            <Link to="/admin/residents" className="text-xs font-bold text-primary hover:text-primary-600 transition-colors">
              View All
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="pb-2.5">NAME</th>
                  <th className="pb-2.5">UNIT</th>
                  <th className="pb-2.5">MOVE IN</th>
                  <th className="pb-2.5 text-right">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {recentResidents.map((r, idx) => (
                  <tr key={r.id || idx} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <img
                          src={r.avatar}
                          alt={r.name}
                          className="w-6 h-6 rounded-full object-cover shrink-0"
                        />
                        <span className="font-bold text-slate-900 truncate max-w-[110px]">{r.name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-slate-600 font-semibold">{r.unit}</td>
                    <td className="py-3 text-slate-500">{r.moveInDate}</td>
                    <td className="py-3 text-right">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 3: Upcoming Dues */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900">Upcoming Dues</h3>
            <Link to="/admin/dues" className="text-xs font-bold text-primary hover:text-primary-600 transition-colors">
              View All
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="pb-2.5">DESCRIPTION</th>
                  <th className="pb-2.5">UNITS</th>
                  <th className="pb-2.5">DUE DATE</th>
                  <th className="pb-2.5 text-right">AMOUNT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {upcomingDues.map((due, idx) => (
                  <tr key={due.id || idx} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 font-bold text-slate-900">{due.title}</td>
                    <td className="py-3 text-slate-500">{due.unitsCount}</td>
                    <td className="py-3 text-primary font-semibold">{due.dueDate}</td>
                    <td className="py-3 text-right font-black text-slate-900">
                      ₦{Number(due.amount).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
