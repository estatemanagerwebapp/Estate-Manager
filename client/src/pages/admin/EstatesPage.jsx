import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Building, 
  Home, 
  Users, 
  MessageSquare, 
  ChevronRight, 
  Search, 
  ChevronDown, 
  List, 
  LayoutGrid, 
  MapPin, 
  Plus, 
  MoreVertical, 
  FileText,
  CheckCircle2, 
  AlertTriangle,
  X,
  ExternalLink,
  ShieldCheck,
  Filter
} from 'lucide-react';
import api from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

export const EstatesPage = () => {
  const queryClient = useQueryClient();

  // View state
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'ARCHIVED'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('name');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedEstate, setSelectedEstate] = useState(null);

  // Form State for Add Estate Modal
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    totalUnits: 100,
    description: '',
    amenities: 'Residential, 24/7 Security, CCTV',
    imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&auto=format&fit=crop&q=80'
  });
  const [formError, setFormError] = useState('');

  // Fetch Estates Data with KPIs
  const { data: estateData, isLoading, error } = useQuery({
    queryKey: ['estates', activeTab, searchQuery, statusFilter, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeTab !== 'ALL') params.append('status', activeTab);
      else if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (sortBy) params.append('sort', sortBy);

      const res = await api.get(`/estates?${params.toString()}`);
      return res.data;
    }
  });

  // Mutation to toggle estate status
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      return await api.patch(`/estates/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estates'] });
    }
  });

  // Mutation to create new estate
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      return await api.post('/estates', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estates'] });
      setIsAddModalOpen(false);
      setFormData({
        name: '',
        code: '',
        address: '',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        totalUnits: 100,
        description: '',
        amenities: 'Residential, 24/7 Security, CCTV',
        imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&auto=format&fit=crop&q=80'
      });
      setFormError('');
    },
    onError: (err) => {
      setFormError(err.message || 'Failed to create estate. Please check inputs.');
    }
  });

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.code || !formData.address) {
      setFormError('Please fill in Estate Name, Code, and Address.');
      return;
    }
    const amenitiesArray = formData.amenities
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);

    createMutation.mutate({
      ...formData,
      totalUnits: parseInt(formData.totalUnits, 10) || 100,
      amenities: amenitiesArray
    });
  };

  const kpis = estateData?.kpis || {
    totalEstates: { value: 4, trend: '+1 this month', trendType: 'positive' },
    totalUnits: { value: 320, trend: '+12 this month', trendType: 'positive' },
    totalResidents: { value: 286, trend: '+18 this month', trendType: 'positive' },
    openComplaints: { value: 12, trend: '5 awaiting response', trendType: 'warning' }
  };

  const estatesList = estateData?.estates || [];

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Estates</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Manage all your estates, view units, residents and key information.
          </p>
        </div>

        <Button
          onClick={() => setIsAddModalOpen(true)}
          className="shadow-sm shadow-primary/25 gap-2 shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Estate</span>
        </Button>
      </div>

      {/* 2. Top Metric / KPI Row (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Estates */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-card transition-all duration-200 flex items-center justify-between group cursor-pointer">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary shrink-0">
              <Building className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Estates</p>
              <h3 className="text-2xl font-black text-slate-900 mt-0.5 tracking-tight">
                {kpis.totalEstates.value}
              </h3>
              <p className="text-xs font-semibold text-emerald-600 mt-0.5">
                {kpis.totalEstates.trend}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>

        {/* Total Units */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-card transition-all duration-200 flex items-center justify-between group cursor-pointer">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary shrink-0">
              <Home className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Units</p>
              <h3 className="text-2xl font-black text-slate-900 mt-0.5 tracking-tight">
                {kpis.totalUnits.value}
              </h3>
              <p className="text-xs font-semibold text-emerald-600 mt-0.5">
                {kpis.totalUnits.trend}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>

        {/* Total Residents */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-card transition-all duration-200 flex items-center justify-between group cursor-pointer">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Residents</p>
              <h3 className="text-2xl font-black text-slate-900 mt-0.5 tracking-tight">
                {kpis.totalResidents.value}
              </h3>
              <p className="text-xs font-semibold text-emerald-600 mt-0.5">
                {kpis.totalResidents.trend}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>

        {/* Open Complaints */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-card transition-all duration-200 flex items-center justify-between group cursor-pointer">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary shrink-0">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Open Complaints</p>
              <h3 className="text-2xl font-black text-slate-900 mt-0.5 tracking-tight">
                {kpis.openComplaints.value}
              </h3>
              <p className="text-xs font-semibold text-amber-600 mt-0.5">
                {kpis.openComplaints.trend}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>

      {/* 3. Filter and View Controls Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3 sm:p-4 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Left: Tab Switchers */}
        <div className="flex items-center gap-1 border-b lg:border-b-0 border-slate-100 pb-2 lg:pb-0 overflow-x-auto">
          {[
            { id: 'ALL', label: 'All Estates' },
            { id: 'ACTIVE', label: 'Active Estates' },
            { id: 'ARCHIVED', label: 'Archived' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-orange-50 text-primary border-b-2 border-primary'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right: Search, Status, Sort, View Toggle */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search estates..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200/80 rounded-xl text-sm text-slate-800 placeholder-slate-400 transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Status Dropdown */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none pl-3.5 pr-8 py-2 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-xl text-sm font-medium text-slate-700 transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
            >
              <option value="ALL">Status: All</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Sort By Dropdown */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none pl-3.5 pr-8 py-2 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-xl text-sm font-medium text-slate-700 transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
            >
              <option value="name">Sort by: Name (A-Z)</option>
              <option value="name_desc">Sort by: Name (Z-A)</option>
              <option value="units_desc">Sort by: Units (High-Low)</option>
              <option value="newest">Sort by: Newest</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center border border-slate-200/80 rounded-xl p-0.5 bg-slate-50 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              title="List View"
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'list' 
                  ? 'bg-white text-primary shadow-xs border border-slate-200/60' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title="Grid View"
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'grid' 
                  ? 'bg-white text-primary shadow-xs border border-slate-200/60' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Estate Listing View */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 bg-white border border-slate-200/80 rounded-2xl animate-pulse p-6" />
          ))}
        </div>
      ) : estatesList.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center">
          <Building className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No estates found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Try adjusting your search query, status filters, or click &quot;Add Estate&quot; to register a new one.
          </p>
        </div>
      ) : viewMode === 'list' ? (
        /* ================= LIST VIEW (Horizontal Cards matching Estate Tab.png) ================= */
        <div className="space-y-4">
          {estatesList.map((estate) => {
            const isActive = estate.status === 'ACTIVE' || estate.isActive;

            return (
              <div
                key={estate.id}
                className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs hover:shadow-card transition-all duration-200 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-5 group"
              >
                {/* Left side: Thumbnail + Info */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5 flex-1 min-w-0">
                  {/* Landscape Image */}
                  <img
                    src={estate.imageUrl || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&auto=format&fit=crop&q=80'}
                    alt={estate.name}
                    className="w-full sm:w-48 sm:h-32 md:w-56 md:h-36 rounded-xl object-cover shrink-0 border border-slate-100 shadow-xs"
                    loading="lazy"
                  />

                  {/* Metadata */}
                  <div className="space-y-2 min-w-0 flex-1">
                    <div>
                      <h3 className="text-lg font-extrabold text-slate-900 tracking-tight group-hover:text-primary transition-colors">
                        {estate.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{estate.city}, {estate.state}</span>
                      </div>
                    </div>

                    <p className="text-xs font-medium text-slate-500 leading-relaxed line-clamp-2 max-w-xl">
                      {estate.description || 'A modern and secure residential estate with premium facilities and 24/7 security.'}
                    </p>

                    {/* Amenities / Tags Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {(estate.amenities && estate.amenities.length > 0
                        ? estate.amenities
                        : ['Residential', '24/7 Security', 'Swimming Pool', 'Gym']
                      ).map((tag, idx) => (
                        <span
                          key={idx}
                          className="bg-slate-100 text-slate-600 border border-slate-200/60 text-[11px] font-semibold px-2.5 py-0.5 rounded-lg"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right side: 3 Stats Columns + Actions */}
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between xl:justify-end gap-6 sm:gap-8 pt-4 xl:pt-0 border-t xl:border-t-0 border-slate-100">
                  {/* Units Stat */}
                  <div className="text-center min-w-[50px]">
                    <Home className="w-4 h-4 mx-auto text-slate-400 mb-1" />
                    <span className="block text-base font-black text-slate-900 tracking-tight">
                      {estate.unitsCount || estate.totalUnits || 0}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                      Units
                    </span>
                  </div>

                  {/* Residents Stat */}
                  <div className="text-center min-w-[50px]">
                    <Users className="w-4 h-4 mx-auto text-slate-400 mb-1" />
                    <span className="block text-base font-black text-slate-900 tracking-tight">
                      {estate.residentsCount || 0}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                      Residents
                    </span>
                  </div>

                  {/* Open Complaints Stat */}
                  <div className="text-center min-w-[70px]">
                    <FileText className="w-4 h-4 mx-auto text-amber-500 mb-1" />
                    <span className="block text-base font-black text-slate-900 tracking-tight">
                      {estate.openComplaintsCount || 0}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide leading-tight">
                      Open Complaints
                    </span>
                  </div>

                  {/* Status Dropdown Pill */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const nextStatus = isActive ? 'ARCHIVED' : 'ACTIVE';
                        statusMutation.mutate({ id: estate.id, status: nextStatus });
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
                  </div>

                  {/* View Details Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      localStorage.setItem('activeEstateId', estate.id);
                      window.location.href = `/admin?estateId=${estate.id}`;
                    }}
                    className="border-orange-200 text-primary hover:bg-orange-50/60 hover:border-primary text-xs font-bold px-3.5 py-1.5 rounded-xl shrink-0"
                  >
                    View Details
                  </Button>

                  {/* More Actions Menu */}
                  <button
                    type="button"
                    title="More actions"
                    onClick={() => setSelectedEstate(estate)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ================= GRID VIEW (Tiles) ================= */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {estatesList.map((estate) => {
            const isActive = estate.status === 'ACTIVE' || estate.isActive;

            return (
              <div
                key={estate.id}
                className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs hover:shadow-card transition-all duration-200 flex flex-col group"
              >
                {/* Card Image */}
                <div className="relative h-48 w-full overflow-hidden bg-slate-100">
                  <img
                    src={estate.imageUrl || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&auto=format&fit=crop&q=80'}
                    alt={estate.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  <div className="absolute top-3 right-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border backdrop-blur-xs flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-emerald-500/90 text-white border-white/20'
                        : 'bg-slate-800/80 text-white border-white/20'
                    }`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      <span>{isActive ? 'Active' : 'Archived'}</span>
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-900 tracking-tight group-hover:text-primary transition-colors">
                      {estate.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{estate.city}, {estate.state}</span>
                    </div>

                    <p className="text-xs font-medium text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                      {estate.description || 'A modern and secure residential estate with premium facilities and 24/7 security.'}
                    </p>

                    {/* Amenities pills */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                      {(estate.amenities && estate.amenities.length > 0
                        ? estate.amenities.slice(0, 3)
                        : ['Residential', '24/7 Security', 'Gym']
                      ).map((tag, idx) => (
                        <span
                          key={idx}
                          className="bg-slate-100 text-slate-600 text-[10px] font-semibold px-2 py-0.5 rounded-md"
                        >
                          {tag}
                        </span>
                      ))}
                      {estate.amenities && estate.amenities.length > 3 && (
                        <span className="text-[10px] font-semibold text-slate-400">
                          +{estate.amenities.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stats Row in Card */}
                  <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <span className="block text-sm font-black text-slate-900">{estate.unitsCount || estate.totalUnits || 0}</span>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Units</span>
                    </div>
                    <div>
                      <span className="block text-sm font-black text-slate-900">{estate.residentsCount || 0}</span>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Residents</span>
                    </div>
                    <div>
                      <span className="block text-sm font-black text-amber-600">{estate.openComplaintsCount || 0}</span>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Complaints</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      localStorage.setItem('activeEstateId', estate.id);
                      window.location.href = `/admin?estateId=${estate.id}`;
                    }}
                    className="w-full border-orange-200 text-primary hover:bg-orange-50/60 text-xs font-bold py-2 rounded-xl mt-2"
                  >
                    View Details
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Add Estate Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200/80 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Add New Estate</h3>
                <p className="text-xs text-slate-500 mt-0.5">Register a residential community into EstatePro</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Estate Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Royal Palm Estate"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Estate Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ROY-005"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Total Units
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.totalUnits}
                    onChange={(e) => setFormData({ ...formData, totalUnits: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Street Address *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Plot 15, Admiralty Road"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows="2"
                  placeholder="Brief description of the estate..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Amenities / Features (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Residential, 24/7 Security, Swimming Pool, Gym"
                  value={formData.amenities}
                  onChange={(e) => setFormData({ ...formData, amenities: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Estate Cover Photo URL
                </label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Estate'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
