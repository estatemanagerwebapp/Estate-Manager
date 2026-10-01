import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Users, 
  Home, 
  UserPlus, 
  UserX, 
  Search, 
  ChevronRight, 
  ChevronDown, 
  List, 
  LayoutGrid, 
  Plus, 
  MoreHorizontal, 
  Eye, 
  Edit3, 
  QrCode, 
  Check, 
  X,
  Phone,
  Mail,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import api from '../../services/api';

export const ResidentsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Filter state
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'PENDING' | 'INACTIVE' | 'MOVED_OUT'
  const [searchQuery, setSearchQuery] = useState('');
  const [estateFilter, setEstateFilter] = useState('all');
  const [unitTypeFilter, setUnitTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [selectedResidents, setSelectedResidents] = useState([]);
  const [page, setPage] = useState(1);
  const [actionMenuOpenId, setActionMenuOpenId] = useState(null);

  // Fetch estates for dropdown
  const { data: estatesData = [] } = useQuery({
    queryKey: ['estates-dropdown-for-residents'],
    queryFn: async () => {
      const res = await api.get('/estates');
      return res.data?.estates || [];
    }
  });

  // Fetch residents
  const { data: residentsResponse, isLoading } = useQuery({
    queryKey: ['residents-list', activeTab, searchQuery, estateFilter, unitTypeFilter, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeTab !== 'ALL') params.append('status', activeTab);
      else if (statusFilter !== 'all') params.append('status', statusFilter);

      if (estateFilter !== 'all') params.append('estateId', estateFilter);
      if (unitTypeFilter !== 'all') params.append('unitType', unitTypeFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('page', page);
      params.append('limit', 8);

      const res = await api.get(`/residents?${params.toString()}`);
      return res.data;
    }
  });

  const residents = residentsResponse?.residents || [];
  const pagination = residentsResponse?.pagination || { total: 0, page: 1, totalPages: 1 };
  const kpis = residentsResponse?.kpis || {
    totalResidents: { value: 268, trend: '+12 this month' },
    activeResidents: { value: 236, occupancyRate: '88% occupancy' },
    pendingApproval: { value: 18, sublabel: 'Under review' },
    inactiveMovedOut: { value: 14, sublabel: '5% of total' }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedResidents(residents.map(r => r.id));
    } else {
      setSelectedResidents([]);
    }
  };

  const handleSelectOne = (id) => {
    setSelectedResidents(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const getTypeBadgeStyle = (type) => {
    const t = (type || '').toLowerCase();
    if (t === 'owner') {
      return 'bg-purple-50 text-purple-600 border border-purple-200/80';
    }
    if (t === 'business') {
      return 'bg-orange-50 text-primary border border-orange-200/80';
    }
    return 'bg-blue-50 text-blue-600 border border-blue-200/80';
  };

  const getStatusBadge = (status) => {
    const s = (status || '').toUpperCase();
    if (s === 'ACTIVE') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          Active
        </span>
      );
    }
    if (s === 'PENDING') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          Pending
        </span>
      );
    }
    if (s === 'MOVED_OUT') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          Moved Out
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
        Inactive
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
            Residents
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage all residents across your estates. Add, edit and track resident details, unit assignments, documents and status.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/residents/new')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-600 active:scale-98 text-white font-semibold text-sm shadow-sm shadow-primary/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Resident</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row (Matching Residents-4.png) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Residents */}
        <div 
          onClick={() => { setActiveTab('ALL'); setPage(1); }}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card hover:border-slate-300 transition-all cursor-pointer flex items-center justify-between group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Residents</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">
                {kpis.totalResidents?.value || 268}
              </h3>
              <p className="text-xs font-semibold text-emerald-600 mt-0.5">
                {kpis.totalResidents?.trend || '+12 this month'}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
        </div>

        {/* Active Residents */}
        <div 
          onClick={() => { setActiveTab('ACTIVE'); setPage(1); }}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card hover:border-slate-300 transition-all cursor-pointer flex items-center justify-between group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
              <Home className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Residents</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">
                {kpis.activeResidents?.value || 236}
              </h3>
              <p className="text-xs font-semibold text-primary mt-0.5">
                {kpis.activeResidents?.occupancyRate || '88% occupancy'}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
        </div>

        {/* Pending Approval */}
        <div 
          onClick={() => { setActiveTab('PENDING'); setPage(1); }}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card hover:border-slate-300 transition-all cursor-pointer flex items-center justify-between group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
              <UserPlus className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pending Approval</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">
                {kpis.pendingApproval?.value || 18}
              </h3>
              <p className="text-xs font-semibold text-primary mt-0.5">
                {kpis.pendingApproval?.sublabel || 'Under review'}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
        </div>

        {/* Inactive / Moved Out */}
        <div 
          onClick={() => { setActiveTab('MOVED_OUT'); setPage(1); }}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card hover:border-slate-300 transition-all cursor-pointer flex items-center justify-between group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
              <UserX className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Inactive / Moved Out</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">
                {kpis.inactiveMovedOut?.value || 14}
              </h3>
              <p className="text-xs font-semibold text-rose-600 mt-0.5">
                {kpis.inactiveMovedOut?.sublabel || '5% of total'}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>

      {/* Tabs & Search Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        {/* Tabs */}
        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
          {[
            { id: 'ALL', label: 'All Residents' },
            { id: 'ACTIVE', label: 'Active' },
            { id: 'PENDING', label: 'Pending' },
            { id: 'INACTIVE', label: 'Inactive' },
            { id: 'MOVED_OUT', label: 'Moved Out' }
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setActiveTab(tab.id); setPage(1); }}
                className={`text-sm font-semibold whitespace-nowrap pb-3 -mb-3 transition-colors relative cursor-pointer ${
                  isActive ? 'text-primary' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search residents..."
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
              {estatesData.map((est) => (
                <option key={est.id} value={est.id}>{est.name}</option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Unit Type Dropdown */}
          <div className="relative">
            <select
              value={unitTypeFilter}
              onChange={(e) => { setUnitTypeFilter(e.target.value); setPage(1); }}
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

          {/* Status Dropdown */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="appearance-none pl-3 pr-8 py-2 text-xs font-medium rounded-xl bg-white border border-slate-200/90 text-slate-700 hover:border-slate-300 focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="all">Status</option>
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Pending</option>
              <option value="INACTIVE">Inactive</option>
              <option value="MOVED_OUT">Moved Out</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/60">
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
      </div>

      {/* Main Content: Table or Grid */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-card">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500 font-medium">Loading residents from database...</p>
        </div>
      ) : residents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-card">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-primary flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No residents found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
            No residents match your current filter parameters.
          </p>
          <button
            type="button"
            onClick={() => navigate('/admin/residents/new')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-600 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Resident</span>
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
                      checked={selectedResidents.length > 0 && selectedResidents.length === residents.length}
                      onChange={handleSelectAll}
                      className="rounded border-slate-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">Resident</th>
                  <th className="py-3 px-4">Unit</th>
                  <th className="py-3 px-4">Estate</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Move In Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {residents.map((r) => {
                  const isSelected = selectedResidents.includes(r.id);
                  const isMenuOpen = actionMenuOpenId === r.id;

                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-50/80 transition-colors group ${
                        isSelected ? 'bg-orange-50/40' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectOne(r.id)}
                          className="rounded border-slate-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                        />
                      </td>

                      {/* RESIDENT */}
                      <td className="py-3.5 px-4">
                        <div
                          onClick={() => navigate(`/admin/residents/${r.residentCode || r.id}`)}
                          className="flex items-center gap-3 cursor-pointer group-hover:text-primary transition-colors"
                        >
                          <img
                            src={r.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
                            alt={r.name}
                            className="w-10 h-10 rounded-full object-cover border border-slate-200 flex-shrink-0"
                          />
                          <div>
                            <span className="font-bold text-slate-900 group-hover:text-primary transition-colors block text-sm">
                              {r.name}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium">
                              {r.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* UNIT */}
                      <td className="py-3.5 px-4">
                        <div>
                          <p className="font-bold text-slate-900 text-xs">
                            {r.unit?.displayIdentifier || 'A1-01'}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {r.unit?.subtype || '3 Bedroom'}
                          </p>
                        </div>
                      </td>

                      {/* ESTATE */}
                      <td className="py-3.5 px-4">
                        <div>
                          <p className="font-bold text-slate-900 text-xs">
                            {r.estate?.name || 'Sunrise Estate'}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {r.estate?.city || 'Lekki'}, {r.estate?.state || 'Lagos'}
                          </p>
                        </div>
                      </td>

                      {/* TYPE */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getTypeBadgeStyle(r.tenancyType)}`}>
                          {r.tenancyType || 'Owner'}
                        </span>
                      </td>

                      {/* MOVE IN DATE */}
                      <td className="py-3.5 px-4 font-medium text-slate-700">
                        {r.moveInDate || 'Jan 12, 2025'}
                      </td>

                      {/* STATUS */}
                      <td className="py-3.5 px-4">
                        {getStatusBadge(r.status)}
                      </td>

                      {/* CONTACT */}
                      <td className="py-3.5 px-4 font-medium text-slate-800 text-xs">
                        {r.phone || '+234 801 234 5678'}
                      </td>

                      {/* ACTIONS */}
                      <td className="py-3.5 px-4 text-center relative">
                        <div className="inline-block text-left">
                          <button
                            type="button"
                            onClick={() => setActionMenuOpenId(isMenuOpen ? null : r.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>

                          {isMenuOpen && (
                            <div className="absolute right-4 mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
                              <button
                                type="button"
                                onClick={() => {
                                  setActionMenuOpenId(null);
                                  navigate(`/admin/residents/${r.residentCode || r.id}`);
                                }}
                                className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-500" />
                                <span>View Profile</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActionMenuOpenId(null);
                                  alert(`Gate QR generated for ${r.name}`);
                                }}
                                className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                              >
                                <QrCode className="w-3.5 h-3.5 text-slate-500" />
                                <span>Download QR</span>
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
              Showing {residents.length > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total || 268} residents
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
          {residents.map((r) => (
            <div
              key={r.id}
              onClick={() => navigate(`/admin/residents/${r.residentCode || r.id}`)}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-card hover:shadow-md transition-all p-5 group cursor-pointer flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <img
                    src={r.avatar}
                    alt={r.name}
                    className="w-14 h-14 rounded-full object-cover border-2 border-slate-100 shadow-xs"
                  />
                  {getStatusBadge(r.status)}
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-primary transition-colors">
                    {r.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{r.email}</p>
                  <p className="text-xs text-slate-500">{r.phone}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Unit</span>
                    <span className="font-bold text-slate-800">{r.unit?.displayIdentifier}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Estate</span>
                    <span className="font-medium text-slate-700">{r.estate?.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Type</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${getTypeBadgeStyle(r.tenancyType)}`}>
                      {r.tenancyType}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-primary">
                <span>View Details</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
