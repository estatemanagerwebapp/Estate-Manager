import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Wrench, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  Phone, 
  UserCheck, 
  ShieldCheck, 
  FileText, 
  ChevronRight, 
  X, 
  ArrowUpRight, 
  Printer, 
  Building, 
  Home, 
  DollarSign, 
  Sparkles,
  Check,
  RefreshCw,
  ExternalLink,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';
import { maintenanceService } from '../../services/maintenanceService';
import { formatNaira, formatCompactNaira } from '../../utils/formatters';
import api from '../../services/api';

export const MaintenanceHubPage = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('TICKETS'); // 'TICKETS' | 'SCHEDULES' | 'ARTISANS'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEstate, setSelectedEstate] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedPriority, setSelectedPriority] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isArtisanModalOpen, setIsArtisanModalOpen] = useState(false);
  const [activeTicket, setActiveTicket] = useState(null);

  // Toast Notification state
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Form states
  const [ticketForm, setTicketForm] = useState({
    estateId: '',
    propertyId: '',
    residentId: '',
    title: '',
    description: '',
    category: 'Water & Plumbing',
    priority: 'MEDIUM',
    location: '',
    estimatedCost: '',
    dueDate: ''
  });

  const [assignForm, setAssignForm] = useState({
    artisanName: '',
    artisanPhone: '',
    artisanSpecialty: '',
    dueDate: '',
    notes: ''
  });

  const [resolveForm, setResolveForm] = useState({
    status: 'RESOLVED',
    actualCost: '',
    resolutionNotes: '',
    invoiceRef: ''
  });

  const [scheduleForm, setScheduleForm] = useState({
    estateId: '',
    title: '',
    category: 'Power',
    assetName: '',
    frequency: 'Monthly',
    nextDueDate: '',
    vendorName: '',
    vendorPhone: '',
    estimatedCost: '',
    notes: ''
  });

  const [artisanForm, setArtisanForm] = useState({
    estateId: '',
    name: '',
    phone: '',
    category: 'Electrical'
  });

  // 1. Fetch Estates
  const { data: estates = [], isLoading: estatesLoading } = useQuery({
    queryKey: ['estates-list-maintenance'],
    queryFn: async () => {
      const res = await api.get('/estates');
      const list = res.data?.estates || res.estates || (Array.isArray(res.data) ? res.data : []);
      return list;
    }
  });

  // Set default estateId when estates load
  useEffect(() => {
    if (estates.length > 0) {
      if (!ticketForm.estateId) {
        setTicketForm(prev => ({ ...prev, estateId: estates[0].id }));
      }
      if (!scheduleForm.estateId) {
        setScheduleForm(prev => ({ ...prev, estateId: estates[0].id }));
      }
      if (!artisanForm.estateId) {
        setArtisanForm(prev => ({ ...prev, estateId: estates[0].id }));
      }
    }
  }, [estates]);

  // 2. Fetch Properties for the selected estate in ticketForm
  const { data: properties = [], isLoading: propertiesLoading } = useQuery({
    queryKey: ['properties-for-maintenance', ticketForm.estateId],
    queryFn: async () => {
      if (!ticketForm.estateId) return [];
      const res = await api.get(`/properties?estateId=${ticketForm.estateId}&limit=100`);
      const list = res.data?.properties || res.properties || (Array.isArray(res.data) ? res.data : []);
      return list;
    },
    enabled: !!ticketForm.estateId
  });

  // 3. Fetch Maintenance KPI Stats
  const { data: stats = {}, isLoading: statsLoading } = useQuery({
    queryKey: ['maintenance-stats', selectedEstate],
    queryFn: () => maintenanceService.getStats({ estateId: selectedEstate })
  });

  // 4. Fetch Tickets / Complaints
  const { data: tickets = [], isLoading: ticketsLoading, refetch: refetchTickets } = useQuery({
    queryKey: ['maintenance-tickets', selectedEstate, selectedStatus, selectedPriority, selectedCategory, searchQuery],
    queryFn: () => maintenanceService.getComplaints({
      estateId: selectedEstate,
      status: selectedStatus,
      priority: selectedPriority,
      category: selectedCategory,
      search: searchQuery
    })
  });

  // 5. Fetch Preventive Schedules
  const { data: schedules = [], isLoading: schedulesLoading, refetch: refetchSchedules } = useQuery({
    queryKey: ['maintenance-schedules', selectedEstate],
    queryFn: () => maintenanceService.getSchedules({ estateId: selectedEstate })
  });

  // 6. Fetch Artisans
  const { data: artisans = [], isLoading: artisansLoading, refetch: refetchArtisans } = useQuery({
    queryKey: ['maintenance-artisans', selectedEstate],
    queryFn: () => maintenanceService.getArtisans({ estateId: selectedEstate })
  });

  // Mutations
  const createTicketMutation = useMutation({
    mutationFn: (data) => maintenanceService.createComplaint(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-stats'] });
      setIsCreateModalOpen(false);
      showToast(`Work order ${data?.ticketNumber ? '#' + data.ticketNumber : ''} created successfully.`);
      setTicketForm({
        estateId: estates[0]?.id || '',
        propertyId: '',
        residentId: '',
        title: '',
        description: '',
        category: 'Water & Plumbing',
        priority: 'MEDIUM',
        location: '',
        estimatedCost: '',
        dueDate: ''
      });
    },
    onError: (err) => {
      showToast(err?.message || 'Failed to create work order ticket.', 'error');
    }
  });

  const assignArtisanMutation = useMutation({
    mutationFn: ({ id, data }) => maintenanceService.assignArtisan(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-stats'] });
      setIsAssignModalOpen(false);
      showToast(`Artisan dispatched successfully to ticket #${activeTicket?.ticketNumber || ''}.`);
      setActiveTicket(null);
    },
    onError: (err) => {
      showToast(err?.message || 'Failed to dispatch artisan.', 'error');
    }
  });

  const resolveTicketMutation = useMutation({
    mutationFn: ({ id, data }) => maintenanceService.updateStatus(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-stats'] });
      setIsResolveModalOpen(false);
      showToast(`Ticket #${activeTicket?.ticketNumber || ''} marked as resolved & closed.`);
      setActiveTicket(null);
    },
    onError: (err) => {
      showToast(err?.message || 'Failed to update ticket status.', 'error');
    }
  });

  const createScheduleMutation = useMutation({
    mutationFn: (data) => maintenanceService.createSchedule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-schedules'] });
      setIsScheduleModalOpen(false);
      showToast('Preventive maintenance schedule configured successfully.');
      setScheduleForm({
        estateId: estates[0]?.id || '',
        title: '',
        category: 'Power',
        assetName: '',
        frequency: 'Monthly',
        nextDueDate: '',
        vendorName: '',
        vendorPhone: '',
        estimatedCost: '',
        notes: ''
      });
    },
    onError: (err) => {
      showToast(err?.message || 'Failed to create PM schedule.', 'error');
    }
  });

  const updateScheduleMutation = useMutation({
    mutationFn: ({ id, data }) => maintenanceService.updateSchedule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-schedules'] });
      showToast('Maintenance marked complete and schedule advanced.');
    },
    onError: (err) => {
      showToast(err?.message || 'Failed to update PM schedule.', 'error');
    }
  });

  const createArtisanMutation = useMutation({
    mutationFn: (data) => maintenanceService.createArtisan(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-artisans'] });
      setIsArtisanModalOpen(false);
      showToast('Artisan registered and added to directory.');
      setArtisanForm({
        estateId: estates[0]?.id || '',
        name: '',
        phone: '',
        category: 'Electrical'
      });
    },
    onError: (err) => {
      showToast(err?.message || 'Failed to register artisan.', 'error');
    }
  });

  // Modal open helpers
  const handleOpenCreateTicket = () => {
    const defaultEstateId = ticketForm.estateId || (estates.length > 0 ? estates[0].id : '');
    setTicketForm(prev => ({
      ...prev,
      estateId: defaultEstateId
    }));
    setIsCreateModalOpen(true);
  };

  const handleOpenSchedule = () => {
    const defaultEstateId = scheduleForm.estateId || (estates.length > 0 ? estates[0].id : '');
    setScheduleForm(prev => ({
      ...prev,
      estateId: defaultEstateId
    }));
    setIsScheduleModalOpen(true);
  };

  const handleOpenArtisan = () => {
    const defaultEstateId = artisanForm.estateId || (estates.length > 0 ? estates[0].id : '');
    setArtisanForm(prev => ({
      ...prev,
      estateId: defaultEstateId
    }));
    setIsArtisanModalOpen(true);
  };

  const handleOpenAssign = (ticket) => {
    setActiveTicket(ticket);
    setAssignForm({
      artisanName: ticket.artisanName || '',
      artisanPhone: ticket.artisanPhone || '',
      artisanSpecialty: ticket.artisanSpecialty || '',
      dueDate: ticket.dueDate ? new Date(ticket.dueDate).toISOString().split('T')[0] : '',
      notes: ''
    });
    setIsAssignModalOpen(true);
  };

  const handleOpenResolve = (ticket) => {
    setActiveTicket(ticket);
    setResolveForm({
      status: 'RESOLVED',
      actualCost: ticket.actualCost || ticket.estimatedCost || '',
      resolutionNotes: ticket.resolutionNotes || '',
      invoiceRef: ''
    });
    setIsResolveModalOpen(true);
  };

  // Helper for Priority badge styling
  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'CRITICAL':
      case 'EMERGENCY':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'HIGH':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'MEDIUM':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'LOW':
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  // Helper for Status badge styling
  const getStatusBadge = (status) => {
    switch (status) {
      case 'OPEN':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'ASSIGNED':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'IN_PROGRESS':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'RESOLVED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'CLOSED':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification Alert */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-elevated border text-xs font-semibold flex items-center gap-2.5 animate-in slide-in-from-bottom duration-200 ${
          toast.type === 'error'
            ? 'bg-rose-900 text-white border-rose-700'
            : 'bg-slate-900 text-white border-slate-700'
        }`}>
          {toast.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* 1. TOP HEADER & ACTIONS BAR */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-card">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary uppercase tracking-wider">
              Asset & Facilities
            </span>
            <span className="text-xs text-slate-400 font-medium">Enterprise Suite</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Maintenance & Work Orders
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time work orders ledger, scheduled preventive maintenance, and vetted artisan dispatch.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Export / Print</span>
          </button>

          <button
            onClick={handleOpenSchedule}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-xs cursor-pointer"
          >
            <Calendar className="w-4 h-4 text-slate-500" />
            <span>Schedule PM</span>
          </button>

          <button
            onClick={handleOpenArtisan}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-xs cursor-pointer"
          >
            <UserCheck className="w-4 h-4 text-slate-500" />
            <span>Add Artisan</span>
          </button>

          <button
            onClick={handleOpenCreateTicket}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Log Work Order</span>
          </button>
        </div>
      </div>

      {/* 2. KPI METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Tickets */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Work Orders
            </span>
            <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {statsLoading ? '...' : (stats.totalTickets || tickets.length)}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
              <span>Est. Spend:</span>
              <span className="font-semibold text-slate-800">
                {formatCompactNaira(stats.totalEstimatedCost || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* In Progress */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              In Progress
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {statsLoading ? '...' : (stats.inProgressTickets || 0)}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-600 font-medium">
              <span>Active contractor jobs on site</span>
            </div>
          </div>
        </div>

        {/* SLA Breach Risk */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              SLA Breach Risk
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-rose-600 tracking-tight">
              {statsLoading ? '...' : (stats.slaRiskTickets || 0)}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-rose-500 font-medium">
              <span>Critical priority or past due date</span>
            </div>
          </div>
        </div>

        {/* Completed & Closed */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Completed & Closed
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {statsLoading ? '...' : (stats.resolvedTickets || 0)}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-600 font-medium">
              <span>Actual Incurred: {formatCompactNaira(stats.totalActualSpend || 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. TABS NAVIGATION & FILTERS BAR */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
        {/* Navigation Tabs Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 pt-3">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('TICKETS')}
              className={`pb-4 px-1 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'TICKETS'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>Work Orders Ledger</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'TICKETS' ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-600'
              }`}>
                {tickets.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('SCHEDULES')}
              className={`pb-4 px-1 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'SCHEDULES'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Preventive Schedules</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'SCHEDULES' ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-600'
              }`}>
                {schedules.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('ARTISANS')}
              className={`pb-4 px-1 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'ARTISANS'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Vetted Artisans</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'ARTISANS' ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-600'
              }`}>
                {artisans.length}
              </span>
            </button>
          </div>

          <button
            onClick={() => {
              refetchTickets();
              refetchSchedules();
              refetchArtisans();
            }}
            title="Refresh Ledger"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer mb-2"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Tab 1 Filter Bar (Only shown on TICKETS tab) */}
        {activeTab === 'TICKETS' && (
          <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search ticket #, description, or artisan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-xs"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Estate Selector */}
              <div className="relative">
                <select
                  value={selectedEstate}
                  onChange={(e) => setSelectedEstate(e.target.value)}
                  className="pl-3 pr-8 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none shadow-xs cursor-pointer"
                >
                  <option value="ALL">All Estates</option>
                  {estates.map(est => (
                    <option key={est.id} value={est.id}>{est.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {/* Status Selector */}
              <div className="relative">
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="pl-3 pr-8 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none shadow-xs cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="OPEN">Open</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {/* Priority Selector */}
              <div className="relative">
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                  className="pl-3 pr-8 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none shadow-xs cursor-pointer"
                >
                  <option value="ALL">All Priorities</option>
                  <option value="CRITICAL">Critical / Emergency</option>
                  <option value="HIGH">High Priority</option>
                  <option value="MEDIUM">Medium Priority</option>
                  <option value="LOW">Low Priority</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>
        )}

        {/* 4. TAB CONTENTS */}
        {/* ========================================================================= */}
        {/* TAB 1: WORK ORDERS LEDGER */}
        {/* ========================================================================= */}
        {activeTab === 'TICKETS' && (
          <div className="overflow-x-auto">
            {ticketsLoading ? (
              <div className="p-12 text-center">
                <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="mt-3 text-sm text-slate-500 font-medium">Loading work orders ledger...</p>
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <Wrench className="w-6 h-6" />
                </div>
                <h3 className="mt-3 text-base font-semibold text-slate-800">No work order tickets found</h3>
                <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
                  There are no maintenance requests matching your current filter criteria.
                </p>
                <button
                  onClick={handleOpenCreateTicket}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary-dark transition-colors shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Work Order</span>
                </button>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 pl-6 pr-3">Ticket # & Date</th>
                    <th className="py-3.5 px-3">Title & Issue Details</th>
                    <th className="py-3.5 px-3">Location / Unit</th>
                    <th className="py-3.5 px-3">Priority</th>
                    <th className="py-3.5 px-3">Status</th>
                    <th className="py-3.5 px-3">Assigned Artisan</th>
                    <th className="py-3.5 px-3">Cost (Est / Act)</th>
                    <th className="py-3.5 pr-6 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {tickets.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Ticket # & Date */}
                      <td className="py-4 pl-6 pr-3 font-mono">
                        <span className="font-semibold text-slate-900 block">{t.ticketNumber}</span>
                        <span className="text-xs text-slate-400">
                          {new Date(t.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                      </td>

                      {/* Title & Details */}
                      <td className="py-4 px-3 max-w-[280px]">
                        <span className="font-semibold text-slate-900 block truncate" title={t.title}>
                          {t.title}
                        </span>
                        <p className="text-xs text-slate-500 truncate" title={t.description}>
                          {t.description}
                        </p>
                        {t.category && (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                            {t.category}
                          </span>
                        )}
                      </td>

                      {/* Unit / Location */}
                      <td className="py-4 px-3">
                        <div className="flex items-center gap-1.5 font-medium text-slate-800">
                          <Home className="w-3.5 h-3.5 text-slate-400" />
                          <span>{t.property?.displayIdentifier || t.location || 'Estate Common Area'}</span>
                        </div>
                        {t.resident && (
                          <span className="text-xs text-slate-400 block mt-0.5">
                            {t.resident.firstName} {t.resident.lastName}
                          </span>
                        )}
                      </td>

                      {/* Priority */}
                      <td className="py-4 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${getPriorityBadge(t.priority)}`}>
                          {t.priority}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadge(t.status)}`}>
                          {t.status.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Artisan */}
                      <td className="py-4 px-3">
                        {t.artisanName ? (
                          <div>
                            <div className="flex items-center gap-1.5 font-medium text-slate-800">
                              <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                              <span>{t.artisanName}</span>
                            </div>
                            {t.artisanPhone && (
                              <a href={`tel:${t.artisanPhone}`} className="text-xs text-primary hover:underline block mt-0.5">
                                {t.artisanPhone}
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Unassigned</span>
                        )}
                      </td>

                      {/* Cost */}
                      <td className="py-4 px-3 font-mono text-xs">
                        <div className="font-semibold text-slate-800">
                          {formatNaira(t.actualCost || t.estimatedCost || 0)}
                        </div>
                        {t.actualCost > 0 && t.estimatedCost > 0 && (
                          <span className="text-[10px] text-slate-400 block">
                            Est: {formatCompactNaira(t.estimatedCost)}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 pr-6 pl-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {t.status === 'OPEN' && (
                            <button
                              onClick={() => handleOpenAssign(t)}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg transition-colors shadow-xs"
                            >
                              Assign
                            </button>
                          )}
                          {(t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS') && (
                            <button
                              onClick={() => handleOpenResolve(t)}
                              className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
                            >
                              Resolve
                            </button>
                          )}
                          {(t.status === 'RESOLVED' || t.status === 'CLOSED') && (
                            <span className="text-xs text-emerald-600 font-medium inline-flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" />
                              <span>Closed</span>
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PREVENTIVE SCHEDULES */}
        {/* ========================================================================= */}
        {activeTab === 'SCHEDULES' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Preventive Asset Schedules</h3>
                <p className="text-xs text-slate-500">
                  Recurring servicing intervals to prevent critical infrastructure failure.
                </p>
              </div>
              <button
                onClick={() => setIsScheduleModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New PM Schedule</span>
              </button>
            </div>

            {schedulesLoading ? (
              <div className="p-8 text-center text-sm text-slate-500">Loading schedules...</div>
            ) : schedules.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No scheduled maintenance found.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {schedules.map((s) => {
                  const isUpcoming = new Date(s.nextDueDate) >= new Date();
                  const daysLeft = Math.ceil((new Date(s.nextDueDate) - new Date()) / (1000 * 60 * 60 * 24));

                  return (
                    <div
                      key={s.id}
                      className="p-5 rounded-xl border border-slate-200 hover:border-slate-300 transition-all bg-white shadow-xs flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                            {s.category}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                            daysLeft <= 3
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            {daysLeft < 0 ? 'Overdue' : `Due in ${daysLeft} days`}
                          </span>
                        </div>

                        <h4 className="font-bold text-slate-900 text-base mt-2">{s.title}</h4>
                        <p className="text-xs text-slate-500 mt-0.5 font-medium">{s.assetName}</p>

                        <div className="mt-3.5 space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Frequency:</span>
                            <span className="font-semibold text-slate-800">{s.frequency}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Next Due Date:</span>
                            <span className="font-semibold text-slate-800 font-mono">
                              {new Date(s.nextDueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                          {s.vendorName && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Contractor / Vendor:</span>
                              <span className="font-semibold text-slate-800">{s.vendorName}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-slate-400">Estimated Cost:</span>
                            <span className="font-semibold text-slate-900 font-mono">
                              {formatNaira(s.estimatedCost || 0)}
                            </span>
                          </div>
                        </div>

                        {s.notes && (
                          <p className="text-xs text-slate-500 mt-2 italic">
                            &quot;{s.notes}&quot;
                          </p>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            const nextDate = new Date();
                            nextDate.setMonth(nextDate.getMonth() + 1);
                            updateScheduleMutation.mutate({
                              id: s.id,
                              data: {
                                lastCompletedAt: new Date(),
                                nextDueDate: nextDate,
                                status: 'UPCOMING'
                              }
                            });
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Mark Done & Advance Date</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: ARTISANS DIRECTORY */}
        {/* ========================================================================= */}
        {activeTab === 'ARTISANS' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Vetted Artisan & Contractor Directory</h3>
                <p className="text-xs text-slate-500">
                  Approved technical specialists on standby for rapid estate maintenance response.
                </p>
              </div>
              <button
                onClick={() => setIsArtisanModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Register Artisan</span>
              </button>
            </div>

            {artisansLoading ? (
              <div className="p-8 text-center text-sm text-slate-500">Loading artisans...</div>
            ) : artisans.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No vetted artisans registered.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {artisans.map((artisan) => (
                  <div
                    key={artisan.id}
                    className="p-5 rounded-xl border border-slate-200 hover:border-slate-300 transition-all bg-white shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-primary border border-orange-100">
                          {artisan.category}
                        </span>
                        {artisan.isVerified && (
                          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100" title="Identity & Vetting Checked">
                            <ShieldCheck className="w-3 h-3" />
                            <span>Vetted</span>
                          </div>
                        )}
                      </div>

                      <h4 className="font-bold text-slate-900 text-base mt-3">{artisan.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-amber-500 font-bold">★ {artisan.rating.toFixed(1)}</span>
                        <span className="text-xs text-slate-400">&bull;</span>
                        <span className="text-xs text-slate-500">{artisan.jobsCount} completed jobs</span>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Availability:</span>
                          <span className={`font-semibold ${artisan.isAvailable ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {artisan.isAvailable ? 'Available Now' : 'Active On Job'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <a
                        href={`tel:${artisan.phone}`}
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        <span>{artisan.phone}</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: CREATE WORK ORDER TICKET */}
      {/* ========================================================================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 relative my-8">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
                <Wrench className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Log Maintenance Work Order</h3>
                <p className="text-xs text-slate-500">Create a work order for facilities or resident repairs</p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createTicketMutation.mutate({
                  ...ticketForm,
                  estimatedCost: ticketForm.estimatedCost ? parseFloat(ticketForm.estimatedCost) : 0
                });
              }}
              className="space-y-4"
            >
              {/* Estate */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Estate</label>
                <select
                  required
                  value={ticketForm.estateId || ''}
                  onChange={(e) => setTicketForm(prev => ({ ...prev, estateId: e.target.value, propertyId: '' }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                >
                  {estates.length === 0 ? (
                    <option value="">{estatesLoading ? 'Loading estates...' : 'No estates found'}</option>
                  ) : (
                    estates.map(est => (
                      <option key={est.id} value={est.id}>
                        {est.name} ({est.code || 'Estate'})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Unit / Property (Optional for common area) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Unit / Property (Optional for Common Infrastructure)
                </label>
                <select
                  value={ticketForm.propertyId}
                  onChange={(e) => setTicketForm(prev => ({ ...prev, propertyId: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Estate Common Area / Shared Facilities</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.displayIdentifier} ({p.type})</option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Issue Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Borehole Booster Pump Failure"
                  value={ticketForm.title}
                  onChange={(e) => setTicketForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Category & Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Trade Category</label>
                  <select
                    value={ticketForm.category}
                    onChange={(e) => setTicketForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="Water & Plumbing">Water & Plumbing</option>
                    <option value="Electrical & Power">Electrical & Power</option>
                    <option value="Gate & Security">Gate & Security</option>
                    <option value="HVAC & Cooling">HVAC & Cooling</option>
                    <option value="Civil & Masonry">Civil & Masonry</option>
                    <option value="General">General Repairs</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                  <select
                    value={ticketForm.priority}
                    onChange={(e) => setTicketForm(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical / Emergency</option>
                  </select>
                </div>
              </div>

              {/* Estimated Cost & Due Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Estimated Cost (₦)</label>
                  <input
                    type="number"
                    placeholder="e.g. 50000"
                    value={ticketForm.estimatedCost}
                    onChange={(e) => setTicketForm(prev => ({ ...prev, estimatedCost: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Completion Date</label>
                  <input
                    type="date"
                    value={ticketForm.dueDate}
                    onChange={(e) => setTicketForm(prev => ({ ...prev, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Issue Description & Diagnostics</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe problem, observed symptoms, breaker numbers, or leak locations..."
                  value={ticketForm.description}
                  onChange={(e) => setTicketForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createTicketMutation.isPending}
                  className="px-5 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl transition-colors shadow-xs"
                >
                  {createTicketMutation.isPending ? 'Logging Ticket...' : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ASSIGN ARTISAN */}
      {/* ========================================================================= */}
      {isAssignModalOpen && activeTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 relative">
            <button
              onClick={() => setIsAssignModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Assign Artisan / Contractor</h3>
                <p className="text-xs text-slate-500">Ticket: {activeTicket.ticketNumber}</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 mb-4 text-xs">
              <span className="font-semibold text-slate-900 block">{activeTicket.title}</span>
              <span className="text-slate-500 block mt-0.5">{activeTicket.property?.displayIdentifier || 'Common Area'}</span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                assignArtisanMutation.mutate({
                  id: activeTicket.id,
                  data: assignForm
                });
              }}
              className="space-y-4"
            >
              {/* Quick Select from Vetted Artisans */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select from Vetted Directory
                </label>
                <select
                  onChange={(e) => {
                    const sel = artisans.find(a => a.name === e.target.value);
                    if (sel) {
                      setAssignForm(prev => ({
                        ...prev,
                        artisanName: sel.name,
                        artisanPhone: sel.phone,
                        artisanSpecialty: sel.category
                      }));
                    }
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">-- Choose Artisan or Enter Manually --</option>
                  {artisans.map(a => (
                    <option key={a.id} value={a.name}>
                      {a.name} ({a.category} &bull; {a.phone})
                    </option>
                  ))}
                </select>
              </div>

              {/* Artisan Name & Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Artisan Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Tunde Balogun"
                    value={assignForm.artisanName}
                    onChange={(e) => setAssignForm(prev => ({ ...prev, artisanName: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    required
                    placeholder="0803 123 4567"
                    value={assignForm.artisanPhone}
                    onChange={(e) => setAssignForm(prev => ({ ...prev, artisanPhone: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {/* Target Due Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">SLA Target Date</label>
                <input
                  type="date"
                  value={assignForm.dueDate}
                  onChange={(e) => setAssignForm(prev => ({ ...prev, dueDate: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Instructions */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Special Instructions</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Call security post before entering plant room..."
                  value={assignForm.notes}
                  onChange={(e) => setAssignForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignArtisanMutation.isPending}
                  className="px-5 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl transition-colors shadow-xs"
                >
                  {assignArtisanMutation.isPending ? 'Assigning...' : 'Dispatch Artisan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: RESOLVE WORK ORDER */}
      {/* ========================================================================= */}
      {isResolveModalOpen && activeTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 relative">
            <button
              onClick={() => setIsResolveModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Resolve & Close Ticket</h3>
                <p className="text-xs text-slate-500">Record final cost and technical resolution</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 mb-4 text-xs">
              <span className="font-semibold text-slate-900 block">{activeTicket.title}</span>
              <span className="text-slate-500 block mt-0.5">Ticket: {activeTicket.ticketNumber}</span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                resolveTicketMutation.mutate({
                  id: activeTicket.id,
                  data: {
                    status: resolveForm.status,
                    actualCost: resolveForm.actualCost ? parseFloat(resolveForm.actualCost) : 0,
                    resolutionNotes: resolveForm.resolutionNotes
                  }
                });
              }}
              className="space-y-4"
            >
              {/* Actual Cost */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Actual Incurred Cost (₦)</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 42000"
                  value={resolveForm.actualCost}
                  onChange={(e) => setResolveForm(prev => ({ ...prev, actualCost: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Resolution Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Technical Resolution Notes</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe parts replaced, test procedures performed, and warranty details..."
                  value={resolveForm.resolutionNotes}
                  onChange={(e) => setResolveForm(prev => ({ ...prev, resolutionNotes: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsResolveModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resolveTicketMutation.isPending}
                  className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-xs"
                >
                  {resolveTicketMutation.isPending ? 'Saving...' : 'Mark as Resolved'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: CREATE SCHEDULE */}
      {/* ========================================================================= */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 relative my-8">
            <button
              onClick={() => setIsScheduleModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Schedule Preventive Maintenance</h3>
                <p className="text-xs text-slate-500">Add asset servicing routine and recurring schedule</p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createScheduleMutation.mutate(scheduleForm);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Estate</label>
                <select
                  required
                  value={scheduleForm.estateId || ''}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, estateId: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                >
                  {estates.length === 0 ? (
                    <option value="">{estatesLoading ? 'Loading estates...' : 'No estates found'}</option>
                  ) : (
                    estates.map(est => (
                      <option key={est.id} value={est.id}>
                        {est.name} ({est.code || 'Estate'})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 500kVA Generator 250-Hour Service"
                  value={scheduleForm.title}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Asset Category</label>
                  <select
                    value={scheduleForm.category}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="Power">Power & Generators</option>
                    <option value="Water">Water & Filtration</option>
                    <option value="Security">Security & CCTV</option>
                    <option value="Elevator">Elevator / Lifts</option>
                    <option value="Fire Safety">Fire Safety</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Frequency</label>
                  <select
                    value={scheduleForm.frequency}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, frequency: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="Bi-Weekly">Bi-Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Bi-Annual">Bi-Annual</option>
                    <option value="Annual">Annual</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Asset Name / Tag</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Main Powerhouse Gen #1"
                  value={scheduleForm.assetName}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, assetName: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Next Due Date</label>
                  <input
                    type="date"
                    required
                    value={scheduleForm.nextDueDate}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, nextDueDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Estimated Cost (₦)</label>
                  <input
                    type="number"
                    placeholder="e.g. 150000"
                    value={scheduleForm.estimatedCost}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, estimatedCost: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Vendor / Contractor</label>
                  <input
                    type="text"
                    placeholder="e.g. Mantrac Nigeria"
                    value={scheduleForm.vendorName}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, vendorName: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Vendor Phone</label>
                  <input
                    type="text"
                    placeholder="0803 123 4567"
                    value={scheduleForm.vendorPhone}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, vendorPhone: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createScheduleMutation.isPending}
                  className="px-5 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl transition-colors shadow-xs"
                >
                  {createScheduleMutation.isPending ? 'Saving...' : 'Create Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: ADD ARTISAN */}
      {/* ========================================================================= */}
      {isArtisanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 relative">
            <button
              onClick={() => setIsArtisanModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Register Vetted Artisan</h3>
                <p className="text-xs text-slate-500">Add an approved tradesperson to the directory</p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createArtisanMutation.mutate(artisanForm);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Babatunde Johnson"
                  value={artisanForm.name}
                  onChange={(e) => setArtisanForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  required
                  placeholder="0803 123 4567"
                  value={artisanForm.phone}
                  onChange={(e) => setArtisanForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Trade Specialty</label>
                <select
                  value={artisanForm.category}
                  onChange={(e) => setArtisanForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="Electrical">Electrical</option>
                  <option value="Plumbing">Plumbing</option>
                  <option value="HVAC & Power">HVAC & Power</option>
                  <option value="Access Automation & Gates">Access Automation & Gates</option>
                  <option value="Carpentry & Masonry">Carpentry & Masonry</option>
                  <option value="General Maintenance">General Maintenance</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsArtisanModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createArtisanMutation.isPending}
                  className="px-5 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl transition-colors shadow-xs"
                >
                  {createArtisanMutation.isPending ? 'Registering...' : 'Register Artisan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
