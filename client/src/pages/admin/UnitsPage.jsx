import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Building2, 
  Home, 
  Users, 
  Wrench, 
  Key, 
  Search, 
  ChevronRight, 
  ChevronDown, 
  List, 
  LayoutGrid, 
  Plus, 
  MoreHorizontal, 
  Eye, 
  Edit3, 
  Archive, 
  Filter,
  Check,
  CheckCircle2,
  Calendar,
  Layers,
  MapPin,
  Clock,
  Sparkles
} from 'lucide-react';
import api from '../../services/api';

export const UnitsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Filters state
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'OCCUPIED' | 'VACANT' | 'UNDER_MAINTENANCE' | 'ARCHIVED'
  const [searchQuery, setSearchQuery] = useState('');
  const [estateFilter, setEstateFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [selectedUnits, setSelectedUnits] = useState([]);
  const [page, setPage] = useState(1);
  const [actionMenuOpenId, setActionMenuOpenId] = useState(null);

  // Fetch estates list for dropdown
  const { data: estatesData } = useQuery({
    queryKey: ['estates-dropdown'],
    queryFn: async () => {
      const res = await api.get('/estates');
      return res.data?.estates || [];
    }
  });

  // Fetch properties from database
  const { data: propertiesData, isLoading, error } = useQuery({
    queryKey: ['properties', activeTab, searchQuery, estateFilter, typeFilter, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeTab !== 'ALL') params.append('status', activeTab);
      else if (statusFilter !== 'all') params.append('status', statusFilter);

      if (estateFilter !== 'all') params.append('estateId', estateFilter);
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('page', page);
      params.append('limit', 8);

      const res = await api.get(`/properties?${params.toString()}`);
      return res.data;
    }
  });

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: async (id) => {
      return await api.delete(`/properties/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      setActionMenuOpenId(null);
    }
  });

  const properties = propertiesData?.properties || [];
  const pagination = propertiesData?.pagination || { total: 0, page: 1, totalPages: 1 };
  const kpis = propertiesData?.kpis || {
    totalUnits: { value: 320, trend: '+12 this month' },
    occupiedUnits: { value: 268, occupancyRate: '84% occupancy' },
    vacantUnits: { value: 42, vacancyRate: '13% vacancy' },
    maintenanceUnits: { value: 10, label: 'Under maintenance' }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedUnits(properties.map(p => p.id));
    } else {
      setSelectedUnits([]);
    }
  };

  const handleSelectUnit = (id) => {
    setSelectedUnits(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const getTypeBadgeStyle = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('duplex')) {
      return 'bg-blue-50 text-blue-600 border border-blue-200/80';
    }
    if (t.includes('studio')) {
      return 'bg-purple-50 text-purple-600 border border-purple-200/80';
    }
    if (t.includes('commercial') || t.includes('shop') || t.includes('office')) {
      return 'bg-rose-50 text-rose-600 border border-rose-200/80';
    }
    return 'bg-orange-50 text-primary border border-orange-200/80';
  };

  const getStatusBadge = (status) => {
    const s = (status || '').toUpperCase();
    if (s === 'OCCUPIED') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          Occupied
        </span>
      );
    }
    if (s === 'UNDER_MAINTENANCE') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          Maintenance
        </span>
      );
    }
    if (s === 'RESERVED') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          Reserved
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
        Vacant
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
            Units & Properties
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage all units and properties across your estates. Add, edit and track occupancy, tenants and status.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/properties/new')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-600 active:scale-98 text-white font-semibold text-sm shadow-sm shadow-primary/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Unit</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row (Matching Units 3.0.png) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Units */}
        <div 
          onClick={() => { setActiveTab('ALL'); setPage(1); }}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card hover:border-slate-300 transition-all cursor-pointer flex items-center justify-between group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
              <Home className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Units</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">
                {kpis.totalUnits?.value?.toLocaleString() || 320}
              </h3>
              <p className="text-xs font-semibold text-emerald-600 mt-0.5">
                {kpis.totalUnits?.trend || '+12 this month'}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
        </div>

        {/* Occupied Units */}
        <div 
          onClick={() => { setActiveTab('OCCUPIED'); setPage(1); }}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card hover:border-slate-300 transition-all cursor-pointer flex items-center justify-between group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Occupied Units</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">
                {kpis.occupiedUnits?.value?.toLocaleString() || 268}
              </h3>
              <p className="text-xs font-semibold text-primary mt-0.5">
                {kpis.occupiedUnits?.occupancyRate || '84% occupancy'}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
        </div>

        {/* Vacant Units */}
        <div 
          onClick={() => { setActiveTab('VACANT'); setPage(1); }}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card hover:border-slate-300 transition-all cursor-pointer flex items-center justify-between group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
              <Key className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Vacant Units</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">
                {kpis.vacantUnits?.value?.toLocaleString() || 42}
              </h3>
              <p className="text-xs font-semibold text-primary mt-0.5">
                {kpis.vacantUnits?.vacancyRate || '13% vacancy'}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
        </div>

        {/* Maintenance */}
        <div 
          onClick={() => { setActiveTab('UNDER_MAINTENANCE'); setPage(1); }}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card hover:border-slate-300 transition-all cursor-pointer flex items-center justify-between group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
              <Wrench className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Maintenance</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">
                {kpis.maintenanceUnits?.value?.toLocaleString() || 10}
              </h3>
              <p className="text-xs font-semibold text-primary mt-0.5">
                Under maintenance
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>

      {/* Filters Bar — single aligned row */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-200 pb-4">
        {/* All Units / Status Dropdown */}
        <div className="relative">
          <select
            value={activeTab}
            onChange={(e) => { setActiveTab(e.target.value); setStatusFilter('all'); setPage(1); }}
            className="appearance-none pl-3 pr-8 py-2 text-xs font-semibold rounded-xl bg-white border border-slate-200/90 text-slate-700 hover:border-slate-300 focus:outline-none focus:border-primary cursor-pointer"
          >
            <option value="ALL">All Units</option>
            <option value="OCCUPIED">Occupied</option>
            <option value="VACANT">Vacant</option>
            <option value="UNDER_MAINTENANCE">Under Maintenance</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search units..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-white border border-slate-200/90 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
          />
        </div>

        {/* Estate Dropdown */}
        <div className="relative">
          <select
            value={estateFilter}
            onChange={(e) => { setEstateFilter(e.target.value); setPage(1); }}
            className="appearance-none pl-3 pr-8 py-2 text-xs font-medium rounded-xl bg-white border border-slate-200/90 text-slate-700 hover:border-slate-300 focus:outline-none focus:border-primary cursor-pointer"
          >
            <option value="all">Estate</option>
            {estatesData?.map((est) => (
              <option key={est.id} value={est.id}>{est.name}</option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Unit Type Dropdown */}
        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="appearance-none pl-3 pr-8 py-2 text-xs font-medium rounded-xl bg-white border border-slate-200/90 text-slate-700 hover:border-slate-300 focus:outline-none focus:border-primary cursor-pointer"
          >
            <option value="all">Unit Type</option>
            <option value="Apartment">Apartment</option>
            <option value="Duplex">Duplex</option>
            <option value="Studio">Studio</option>
            <option value="Commercial">Commercial</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* View Toggle — pushed to end */}
        <div className="ml-auto flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/60">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-lg transition-all ${
              viewMode === 'list' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
            title="List View"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-lg transition-all ${
              viewMode === 'grid' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content: Table or Grid */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-card">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500 font-medium">Loading units from database...</p>
        </div>
      ) : properties.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-card">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-primary flex items-center justify-center mx-auto mb-3">
            <Layers className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No units found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
            No properties match your current filter criteria. You can clear filters or add a new unit to the system.
          </p>
          <button
            type="button"
            onClick={() => navigate('/admin/properties/new')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-600 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Unit</span>
          </button>
        </div>
      ) : viewMode === 'list' ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={selectedUnits.length > 0 && selectedUnits.length === properties.length}
                      onChange={handleSelectAll}
                      className="rounded border-slate-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">Unit</th>
                  <th className="py-3 px-4">Estate</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Tenant / Status</th>
                  <th className="py-3 px-4">Rent (₦)</th>
                  <th className="py-3 px-4">Next Due</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {properties.map((p) => {
                  const isSelected = selectedUnits.includes(p.id);
                  const isMenuOpen = actionMenuOpenId === p.id;

                  return (
                    <tr 
                      key={p.id}
                      className={`hover:bg-slate-50/80 transition-colors group ${
                        isSelected ? 'bg-orange-50/40' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectUnit(p.id)}
                          className="rounded border-slate-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                        />
                      </td>

                      {/* UNIT: Thumbnail + Unit Code + Subtype */}
                      <td className="py-3 px-4">
                        <div 
                          onClick={() => navigate(`/admin/properties/${p.displayIdentifier || p.id}`)}
                          className="flex items-center gap-3 cursor-pointer group-hover:text-primary transition-colors"
                        >
                          <img
                            src={p.imageUrl || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=120&auto=format&fit=crop&q=80'}
                            alt={p.displayIdentifier}
                            className="w-12 h-10 rounded-lg object-cover border border-slate-200/80 flex-shrink-0"
                          />
                          <div>
                            <span className="font-bold text-slate-900 group-hover:text-primary transition-colors block text-sm">
                              {p.displayIdentifier}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium">
                              {p.subtype || `${p.bedrooms || 3} Bedroom`}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* ESTATE */}
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-bold text-slate-900 text-xs">
                            {p.estate?.name || 'Sunrise Estate'}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {p.estate?.city || 'Lekki'}, {p.estate?.state || 'Lagos'}
                          </p>
                        </div>
                      </td>

                      {/* TYPE Pill */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getTypeBadgeStyle(p.type)}`}>
                          {p.type || 'Apartment'}
                        </span>
                      </td>

                      {/* SIZE */}
                      <td className="py-3 px-4 font-medium text-slate-700">
                        {p.sizeSqm ? `${p.sizeSqm} sqm` : '120 sqm'}
                      </td>

                      {/* TENANT / STATUS */}
                      <td className="py-3 px-4">
                        {p.occupancyStatus === 'OCCUPIED' && p.tenant ? (
                          <div className="flex items-center gap-2">
                            <img
                              src={p.tenant.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=60&auto=format&fit=crop&q=80'}
                              alt={p.tenant.name}
                              className="w-6 h-6 rounded-full object-cover border border-slate-200 flex-shrink-0"
                            />
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-800 text-xs truncate max-w-[110px]">
                                {p.tenant.name}
                              </span>
                              {getStatusBadge(p.occupancyStatus)}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-slate-400">
                            <span>—</span>
                            {getStatusBadge(p.occupancyStatus)}
                          </div>
                        )}
                      </td>

                      {/* RENT (₦) */}
                      <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                        ₦{(p.monthlyRent || 50000).toLocaleString()}
                      </td>

                      {/* NEXT DUE */}
                      <td className="py-3 px-4">
                        {p.nextDueDate ? (
                          <div>
                            <p className="font-semibold text-primary text-xs">
                              {new Date(p.nextDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {p.nextDueFormatted.split('•')[1] ? p.nextDueFormatted.split('•')[1].trim() : 'in 5 days'}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-medium">—</span>
                        )}
                      </td>

                      {/* ACTIONS */}
                      <td className="py-3 px-4 text-center relative">
                        <div className="inline-block text-left">
                          <button
                            type="button"
                            onClick={() => setActionMenuOpenId(isMenuOpen ? null : p.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>

                          {/* Dropdown Menu */}
                          {isMenuOpen && (
                            <div className="absolute right-4 mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
                              <button
                                type="button"
                                onClick={() => {
                                  setActionMenuOpenId(null);
                                  navigate(`/admin/properties/${p.displayIdentifier || p.id}`);
                                }}
                                className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-500" />
                                <span>View Details</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActionMenuOpenId(null);
                                  navigate(`/admin/properties/${p.id}/edit`);
                                }}
                                className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                                <span>Edit Unit</span>
                              </button>
                              <div className="my-1 border-t border-slate-100" />
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`Are you sure you want to archive unit ${p.displayIdentifier}?`)) {
                                    archiveMutation.mutate(p.id);
                                  }
                                }}
                                className="w-full px-3.5 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                              >
                                <Archive className="w-3.5 h-3.5 text-rose-500" />
                                <span>Archive Unit</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Pagination Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-slate-100 bg-white">
            <p className="text-xs text-slate-500 font-medium">
              Showing {properties.length > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total || 320} units
            </p>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs cursor-pointer"
              >
                &lt;
              </button>

              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => i + 1).map((pNum) => (
                <button
                  key={pNum}
                  type="button"
                  onClick={() => setPage(pNum)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    pagination.page === pNum
                      ? 'bg-primary text-white shadow-xs'
                      : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {pNum}
                </button>
              ))}

              {pagination.totalPages > 5 && (
                <>
                  <span className="px-1 text-slate-400 text-xs">...</span>
                  <button
                    type="button"
                    onClick={() => setPage(pagination.totalPages)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      pagination.page === pagination.totalPages
                        ? 'bg-primary text-white shadow-xs'
                        : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {pagination.totalPages}
                  </button>
                </>
              )}

              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage(prev => Math.min(pagination.totalPages, prev + 1))}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs cursor-pointer"
              >
                &gt;
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {properties.map((p) => (
            <div
              key={p.id}
              onClick={() => navigate(`/admin/properties/${p.displayIdentifier || p.id}`)}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-card hover:shadow-md transition-all overflow-hidden group cursor-pointer flex flex-col"
            >
              <div className="h-44 relative overflow-hidden bg-slate-100">
                <img
                  src={p.imageUrl || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&auto=format&fit=crop&q=80'}
                  alt={p.displayIdentifier}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-3 left-3 flex items-center gap-1.5">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold backdrop-blur-md bg-white/90 shadow-xs ${getTypeBadgeStyle(p.type)}`}>
                    {p.type}
                  </span>
                </div>
                <div className="absolute top-3 right-3">
                  {getStatusBadge(p.occupancyStatus)}
                </div>
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-primary transition-colors">
                      {p.displayIdentifier}
                    </h3>
                    <span className="text-xs font-semibold text-slate-500">{p.sizeSqm} sqm</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{p.estate?.name}, {p.estate?.city}</p>
                  <p className="text-xs font-medium text-primary mt-1">{p.subtype}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 font-medium uppercase">Rent</span>
                    <p className="text-sm font-bold text-slate-900">₦{(p.monthlyRent || 50000).toLocaleString()}</p>
                  </div>
                  {p.tenant ? (
                    <div className="flex items-center gap-2">
                      <img
                        src={p.tenant.avatar}
                        alt={p.tenant.name}
                        className="w-7 h-7 rounded-full object-cover border border-slate-200"
                      />
                      <span className="text-xs font-medium text-slate-700 truncate max-w-[80px]">
                        {p.tenant.name}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Vacant</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
