import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  MapPin, 
  Edit3, 
  MoreHorizontal, 
  ChevronDown, 
  ChevronRight, 
  Home, 
  BedDouble, 
  Bath, 
  Car, 
  Maximize2, 
  Calendar, 
  FileText, 
  Wrench, 
  Folder, 
  UserCheck, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileCheck,
  Building,
  User,
  ShieldAlert,
  Coins,
  Receipt,
  Layers,
  Phone,
  Mail,
  Plus
} from 'lucide-react';
import api from '../../services/api';

export const UnitDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('Overview');
  const [selectedGalleryImg, setSelectedGalleryImg] = useState(0);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);

  // Fetch unit details from database
  const { data: propertyResponse, isLoading, error } = useQuery({
    queryKey: ['property-detail', id],
    queryFn: async () => {
      const res = await api.get(`/properties/${id}`);
      return res.data?.property;
    }
  });

  // Status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus) => {
      return await api.patch(`/properties/${propertyResponse?.id}`, {
        occupancyStatus: newStatus
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-detail', id] });
      setStatusDropdownOpen(false);
    }
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center shadow-card">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm font-semibold text-slate-600">Loading unit details from database...</p>
      </div>
    );
  }

  if (error || !propertyResponse) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center shadow-card">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-800">Unit Not Found</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-5">
          We could not locate this property in the database.
        </p>
        <button
          type="button"
          onClick={() => navigate('/admin/properties')}
          className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold cursor-pointer"
        >
          Back to Units & Properties
        </button>
      </div>
    );
  }

  const p = propertyResponse;
  const tenant = p.tenant || p.currentTenant;
  const gallery = p.galleryImages?.length > 0 ? p.galleryImages : [
    p.imageUrl || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&auto=format&fit=crop&q=80'
  ];

  const invoices = p.invoices || [];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Breadcrumb & Header Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <Link 
            to="/admin/properties" 
            className="flex items-center gap-1.5 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Units & Properties</span>
          </Link>
          <span>&gt;</span>
          <span className="text-slate-900 font-bold">{p.displayIdentifier}</span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate(`/admin/properties/${p.id}/edit`)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-xs cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-primary" />
            <span>Edit Unit</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsActionsOpen(!isActionsOpen)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-xs cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4 text-slate-500" />
              <span>Actions</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isActionsOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsOpen(false);
                    navigate(`/admin/properties/${p.id}/edit`);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Edit Unit Details</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsOpen(false);
                    alert(`Generate invoice for unit ${p.displayIdentifier}`);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Receipt className="w-3.5 h-3.5 text-slate-400" />
                  <span>Create Invoice</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Hero Card (Matching Unit Details 3.1.png) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 lg:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Photos Gallery */}
          <div className="lg:col-span-4 space-y-2.5">
            <div className="w-full h-56 sm:h-64 rounded-xl overflow-hidden bg-slate-100 border border-slate-200/80 shadow-xs relative">
              <img
                src={gallery[selectedGalleryImg] || gallery[0]}
                alt={p.displayIdentifier}
                className="w-full h-full object-cover transition-all duration-300"
              />
            </div>

            {/* Gallery Thumbnails */}
            <div className="grid grid-cols-5 gap-2">
              {gallery.slice(0, 5).map((imgUrl, index) => {
                const isLastWithOverlay = index === 4 && gallery.length >= 5;
                const isSelected = selectedGalleryImg === index;

                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setSelectedGalleryImg(index)}
                    className={`relative h-14 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                      isSelected ? 'border-primary ring-1 ring-primary' : 'border-transparent hover:opacity-90'
                    }`}
                  >
                    <img
                      src={imgUrl}
                      alt={`Gallery thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {isLastWithOverlay && (
                      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center text-white text-xs font-bold">
                        +{gallery.length > 5 ? gallery.length - 4 : 8}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Middle Column: Details & Specs */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {p.displayIdentifier}
                </h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  p.occupancyStatus === 'OCCUPIED'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : p.occupancyStatus === 'UNDER_MAINTENANCE'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}>
                  {p.occupancyStatus === 'OCCUPIED' ? 'Occupied' : p.occupancyStatus === 'UNDER_MAINTENANCE' ? 'Maintenance' : 'Vacant'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>{p.estate?.name || 'Sunrise Estate'}, {p.estate?.city || 'Lekki'}, {p.estate?.state || 'Lagos'}</span>
              </div>

              <h3 className="text-sm font-bold text-primary mt-3">
                {p.subtype || `${p.bedrooms || 3} Bedroom ${p.type || 'Apartment'}`}
              </h3>

              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                {p.description || 'Spacious 3-bedroom apartment with modern finishing, balcony, and 24/7 security. Ideal for families looking for comfort and convenience.'}
              </p>
            </div>

            {/* Spec Metrics Row */}
            <div className="grid grid-cols-4 gap-2 pt-2">
              <div className="p-2.5 rounded-xl bg-orange-50/50 border border-orange-100/80 text-center">
                <div className="flex justify-center text-primary mb-1">
                  <Maximize2 className="w-4 h-4 text-primary" />
                </div>
                <p className="text-xs font-bold text-slate-900">{p.sizeSqm || 120} sqm</p>
                <p className="text-[10px] text-slate-500">Unit Size</p>
              </div>

              <div className="p-2.5 rounded-xl bg-orange-50/50 border border-orange-100/80 text-center">
                <div className="flex justify-center text-primary mb-1">
                  <BedDouble className="w-4 h-4 text-primary" />
                </div>
                <p className="text-xs font-bold text-slate-900">{p.bedrooms ?? 3}</p>
                <p className="text-[10px] text-slate-500">Bedrooms</p>
              </div>

              <div className="p-2.5 rounded-xl bg-orange-50/50 border border-orange-100/80 text-center">
                <div className="flex justify-center text-primary mb-1">
                  <Bath className="w-4 h-4 text-primary" />
                </div>
                <p className="text-xs font-bold text-slate-900">{p.bathrooms ?? 3}</p>
                <p className="text-[10px] text-slate-500">Bathrooms</p>
              </div>

              <div className="p-2.5 rounded-xl bg-orange-50/50 border border-orange-100/80 text-center">
                <div className="flex justify-center text-primary mb-1">
                  <Car className="w-4 h-4 text-primary" />
                </div>
                <p className="text-xs font-bold text-slate-900">{p.parkingSlots ?? 2}</p>
                <p className="text-[10px] text-slate-500">Parking Slots</p>
              </div>
            </div>
          </div>

          {/* Right Column: Status & Current Tenant Card */}
          <div className="lg:col-span-3 bg-slate-50/70 rounded-xl border border-slate-200/80 p-4 space-y-4">
            {/* Status Dropdown */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Unit Status</span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>{p.occupancyStatus === 'OCCUPIED' ? 'Occupied' : p.occupancyStatus === 'VACANT' ? 'Vacant' : 'Maintenance'}</span>
                  <ChevronDown className="w-3 h-3 text-emerald-600" />
                </button>

                {statusDropdownOpen && (
                  <div className="absolute right-0 mt-1 w-36 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-30">
                    {['OCCUPIED', 'VACANT', 'UNDER_MAINTENANCE', 'RESERVED'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => updateStatusMutation.mutate(st)}
                        className="w-full px-3 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {st.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Current Tenant Information */}
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Current Tenant
              </p>
              {tenant ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200/70 shadow-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={tenant.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
                      alt={tenant.name || tenant.firstName}
                      className="w-10 h-10 rounded-full object-cover border border-slate-200 flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {tenant.name || `${tenant.firstName} ${tenant.lastName}`}
                      </h4>
                      <p className="text-[11px] text-slate-500 truncate">{tenant.email || 'amaka@gmail.com'}</p>
                      <p className="text-[10px] text-slate-400 truncate">{tenant.phone || '+234 801 234 5678'}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-white border border-dashed border-slate-300 text-center">
                  <p className="text-xs text-slate-400 italic">No tenant assigned</p>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/properties/${p.id}/edit`)}
                    className="mt-1.5 text-xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    Assign Tenant
                  </button>
                </div>
              )}
            </div>

            {/* Dates row */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60 text-xs">
              <div>
                <p className="text-[10px] text-slate-400 font-medium">Move In Date</p>
                <div className="flex items-center gap-1 font-semibold text-slate-800 mt-0.5">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>
                    {p.moveInDate ? new Date(p.moveInDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Jan 12, 2025'}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-[10px] text-slate-400 font-medium">Lease End Date</p>
                <div className="flex items-center gap-1 font-semibold text-slate-800 mt-0.5">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>
                    {p.leaseEndDate ? new Date(p.leaseEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Jan 11, 2026'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex items-center gap-8 overflow-x-auto no-scrollbar">
          {[
            'Overview',
            'Residents',
            'Invoices & Payments',
            'Dues & Fees',
            'Maintenance',
            'Documents',
            'Access & Visitors',
            'Activity Log'
          ].map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`text-sm font-semibold whitespace-nowrap pb-3 transition-colors relative cursor-pointer ${
                  isActive ? 'text-primary' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Overview Tab Content (Matching 3.1.png) */}
      {activeTab === 'Overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Column (8 cols): Rental Info, Occupancy Info, Recent Invoices */}
          <div className="lg:col-span-8 space-y-6">
            {/* Two Side-by-Side Cards: Rental Info + Occupancy Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Rental Information */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
                    <Calendar className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">Rental Information</h3>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Monthly Rent</span>
                    <span className="font-bold text-slate-900">₦{(p.monthlyRent || 50000).toLocaleString()}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Billing Cycle</span>
                    <span className="font-semibold text-slate-800">{p.billingCycle || 'Monthly'}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Service Charge</span>
                    <span className="font-bold text-slate-900">₦{(p.serviceCharge || 5000).toLocaleString()}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Next Due Date</span>
                    <span className="font-bold text-primary">
                      {p.nextDueDate ? new Date(p.nextDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Oct 5, 2026'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Occupancy Information */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
                    <Home className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">Occupancy Information</h3>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Status</span>
                    <span className="flex items-center gap-1.5 font-bold text-emerald-700">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>{p.occupancyStatus === 'OCCUPIED' ? 'Occupied' : 'Vacant'}</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Tenant</span>
                    <span className="font-bold text-slate-900">{tenant?.name || `${tenant?.firstName} ${tenant?.lastName}` || 'Amaka Okafor'}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Move In Date</span>
                    <span className="font-semibold text-slate-800">
                      {p.moveInDate ? new Date(p.moveInDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Jan 12, 2025'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Lease End Date</span>
                    <span className="font-semibold text-primary">
                      {p.leaseEndDate ? new Date(p.leaseEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Jan 11, 2026'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Tenancy Type</span>
                    <span className="font-semibold text-slate-800">{p.tenancyType || 'Residential'}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Agreement</span>
                    <a
                      href="#agreement"
                      onClick={(e) => { e.preventDefault(); alert('Agreement document: ' + (p.agreementDocument || 'lease-agreement.pdf')); }}
                      className="font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3 text-primary" />
                      <span>View Agreement</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Invoices Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">Recent Invoices</h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('Invoices & Payments')}
                  className="text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  View All
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-3">Invoice #</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Amount</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Due Date</th>
                      <th className="py-2.5 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {invoices.length > 0 ? (
                      invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-slate-900">{inv.invoiceNumber}</td>
                          <td className="py-2.5 px-3 text-slate-700">{inv.title}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">₦{inv.amount.toLocaleString()}</td>
                          <td className="py-2.5 px-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              inv.status === 'PAID'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-orange-50 text-primary border border-orange-200'
                            }`}>
                              {inv.status === 'PAID' ? 'Paid' : 'Pending'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {new Date(inv.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="py-6 text-center text-slate-400 italic">
                          No recent invoices found for this unit.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column (4 cols): Location, Quick Actions, Unit Notes */}
          <div className="lg:col-span-4 space-y-6">
            {/* Unit Location Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">Unit Location</h3>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(`${p.estate?.name || 'Sunrise Estate'}, Lagos, Nigeria`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                >
                  <span>Open in Maps</span>
                  <ExternalLink className="w-3 h-3 text-primary" />
                </a>
              </div>

              {/* Map Preview Image */}
              <div className="w-full h-36 rounded-xl overflow-hidden bg-slate-100 relative border border-slate-200/80 mb-3">
                <img
                  src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=600&auto=format&fit=crop&q=80"
                  alt="Unit Location Map"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-slate-900/10 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shadow-lg border-2 border-white animate-bounce">
                    <MapPin className="w-4 h-4 text-white" />
                  </div>
                </div>
              </div>

              <div className="text-xs">
                <h4 className="font-bold text-slate-900">{p.estate?.name || 'Sunrise Estate'}, {p.displayIdentifier}</h4>
                <p className="text-slate-500 text-[11px] mt-0.5">{p.estate?.city || 'Lekki'}, {p.estate?.state || 'Lagos'}, Nigeria</p>
              </div>
            </div>

            {/* Quick Actions Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-3 pb-2 border-b border-slate-100">
                Quick Actions
              </h3>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => alert(`Create invoice for ${p.displayIdentifier}`)}
                  className="p-3 rounded-xl bg-orange-50/40 hover:bg-orange-50 border border-orange-200/60 hover:border-orange-300 transition-all text-left group cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-primary mb-2 group-hover:scale-110 transition-transform" />
                  <p className="text-xs font-bold text-slate-800">Create Invoice</p>
                </button>

                <button
                  type="button"
                  onClick={() => alert(`Log maintenance ticket for ${p.displayIdentifier}`)}
                  className="p-3 rounded-xl bg-orange-50/40 hover:bg-orange-50 border border-orange-200/60 hover:border-orange-300 transition-all text-left group cursor-pointer"
                >
                  <Wrench className="w-4 h-4 text-primary mb-2 group-hover:scale-110 transition-transform" />
                  <p className="text-xs font-bold text-slate-800">Log Maintenance</p>
                </button>

                <button
                  type="button"
                  onClick={() => alert(`View documents for ${p.displayIdentifier}`)}
                  className="p-3 rounded-xl bg-orange-50/40 hover:bg-orange-50 border border-orange-200/60 hover:border-orange-300 transition-all text-left group cursor-pointer"
                >
                  <Folder className="w-4 h-4 text-primary mb-2 group-hover:scale-110 transition-transform" />
                  <p className="text-xs font-bold text-slate-800">View Documents</p>
                </button>

                <button
                  type="button"
                  onClick={() => alert(`Register visitor for ${p.displayIdentifier}`)}
                  className="p-3 rounded-xl bg-orange-50/40 hover:bg-orange-50 border border-orange-200/60 hover:border-orange-300 transition-all text-left group cursor-pointer"
                >
                  <UserCheck className="w-4 h-4 text-primary mb-2 group-hover:scale-110 transition-transform" />
                  <p className="text-xs font-bold text-slate-800">Register Visitor</p>
                </button>
              </div>
            </div>

            {/* Unit Notes Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">Unit Notes</h3>
                <button
                  type="button"
                  onClick={() => {
                    const note = prompt('Add unit note:');
                    if (note) {
                      api.patch(`/properties/${p.id}`, { notes: note }).then(() => {
                        queryClient.invalidateQueries({ queryKey: ['property-detail', id] });
                      });
                    }
                  }}
                  className="text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  Add Note
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-900 leading-relaxed font-medium">
                    {p.notes || 'Tenant requested for painting of the balcony wall. Scheduled for Oct 10, 2026.'}
                  </p>
                </div>
                <p className="text-[10px] text-amber-700/80 font-semibold pl-6">
                  Added by Tobi John • Sep 28, 2026
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Residents Tab Content */}
      {activeTab === 'Residents' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900">Assigned Residents & Occupants</h3>
            <button
              type="button"
              onClick={() => navigate(`/admin/properties/${p.id}/edit`)}
              className="text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              Manage Residents
            </button>
          </div>

          {tenant ? (
            <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200/80 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <img
                  src={tenant.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
                  alt={tenant.name || tenant.firstName}
                  className="w-12 h-12 rounded-full object-cover border border-slate-200"
                />
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{tenant.name || `${tenant.firstName} ${tenant.lastName}`}</h4>
                  <p className="text-xs text-slate-500">{tenant.email}</p>
                  <p className="text-xs text-slate-500">{tenant.phone}</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Primary Tenant
              </span>
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">No resident currently registered to this unit.</p>
          )}
        </div>
      )}

      {/* Invoices & Payments Tab Content */}
      {activeTab === 'Invoices & Payments' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">Invoices & Billing History</h3>
            <button
              type="button"
              onClick={() => alert(`Create invoice for unit ${p.displayIdentifier}`)}
              className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold cursor-pointer"
            >
              + Create Invoice
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3">Invoice #</th>
                  <th className="py-2.5 px-3">Title</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Paid Amount</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3 font-bold text-slate-900">{inv.invoiceNumber}</td>
                    <td className="py-3 px-3 text-slate-700">{inv.title}</td>
                    <td className="py-3 px-3 font-bold text-slate-900">₦{inv.amount.toLocaleString()}</td>
                    <td className="py-3 px-3 text-slate-600">₦{inv.paidAmount.toLocaleString()}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        inv.status === 'PAID'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-orange-50 text-primary border border-orange-200'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {new Date(inv.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dues, Maintenance, Documents, Access tabs placeholders */}
      {['Dues & Fees', 'Maintenance', 'Documents', 'Access & Visitors', 'Activity Log'].includes(activeTab) && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-card">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-primary flex items-center justify-center mx-auto mb-3">
            <Layers className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-base font-bold text-slate-900">{activeTab} for {p.displayIdentifier}</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            Real-time {activeTab.toLowerCase()} data synchronizing with Supabase estate management subsystem.
          </p>
        </div>
      )}
    </div>
  );
};
