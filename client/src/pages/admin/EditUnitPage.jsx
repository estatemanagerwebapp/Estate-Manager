import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Trash2, 
  MapPin, 
  Check, 
  Calendar, 
  FileText, 
  ChevronDown, 
  X, 
  Image, 
  AlertCircle,
  MoreHorizontal,
  Plus
} from 'lucide-react';
import api from '../../services/api';

export const EditUnitPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    estateId: '',
    block: 'Block A',
    apartmentNumber: '',
    displayIdentifier: '',
    type: 'Apartment',
    category: 'Residential',
    bedrooms: 3,
    bathrooms: 3,
    parkingSlots: 2,
    sizeSqm: 120,
    floor: '1st Floor',
    buildYear: 2023,
    occupancyStatus: 'OCCUPIED',
    description: '',
    
    // Pricing
    monthlyRent: 50000,
    serviceCharge: 5000,
    billingCycle: 'Monthly',
    gracePeriodDays: 7,
    
    // Occupancy
    currentTenantId: '',
    tenantName: '',
    tenantEmail: '',
    tenantPhone: '',
    moveInDate: '',
    leaseEndDate: '',
    tenancyType: 'Residential',
    agreementDocument: 'lease-agreement.pdf',
    notes: '',
    
    // Location & images
    position: '',
    imageUrl: '',
    galleryImages: [],
    
    // Additional settings
    includeInPublicListings: false,
    enableMaintenanceRequests: true,
    allowVisitorRegistration: true,
    receivePaymentReminders: true
  });

  const [formError, setFormError] = useState('');
  const [tenantModalOpen, setTenantModalOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  // Fetch unit details
  const { data: property, isLoading } = useQuery({
    queryKey: ['property-edit', id],
    queryFn: async () => {
      const res = await api.get(`/properties/${id}`);
      return res.data?.property;
    }
  });

  // Fetch estates
  const { data: estates = [] } = useQuery({
    queryKey: ['estates-list-edit'],
    queryFn: async () => {
      const res = await api.get('/estates');
      return res.data?.estates || [];
    }
  });

  // Fetch tenants
  const { data: tenants = [] } = useQuery({
    queryKey: ['tenants-list-edit'],
    queryFn: async () => {
      const res = await api.get('/properties/meta/tenants');
      return res.data?.tenants || [];
    }
  });

  // Populate data when fetched
  useEffect(() => {
    if (property) {
      setFormData({
        estateId: property.estateId || '',
        block: property.block || 'Block A',
        apartmentNumber: property.apartmentNumber || property.displayIdentifier || '',
        displayIdentifier: property.displayIdentifier || '',
        type: property.type || 'Apartment',
        category: property.category || 'Residential',
        bedrooms: property.bedrooms ?? 3,
        bathrooms: property.bathrooms ?? 3,
        parkingSlots: property.parkingSlots ?? 2,
        sizeSqm: property.sizeSqm ?? 120,
        floor: property.floor || '1st Floor',
        buildYear: property.buildYear || 2023,
        occupancyStatus: property.occupancyStatus || 'OCCUPIED',
        description: property.description || '',
        monthlyRent: property.monthlyRent || 50000,
        serviceCharge: property.serviceCharge || 5000,
        billingCycle: property.billingCycle || 'Monthly',
        gracePeriodDays: property.gracePeriodDays || 7,
        currentTenantId: property.currentTenantId || '',
        tenantName: property.tenant?.name || property.tenantName || '',
        tenantEmail: property.tenant?.email || property.tenantEmail || '',
        tenantPhone: property.tenant?.phone || property.tenantPhone || '',
        moveInDate: property.moveInDate ? property.moveInDate.split('T')[0] : '2025-01-12',
        leaseEndDate: property.leaseEndDate ? property.leaseEndDate.split('T')[0] : '2026-01-11',
        tenancyType: property.tenancyType || 'Residential',
        agreementDocument: property.agreementDocument || 'lease-agreement.pdf',
        notes: property.notes || 'Tenant has been good with payments. Requested painting of balcony wall (scheduled for Oct 10, 2026).',
        position: property.position || '',
        imageUrl: property.imageUrl || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&auto=format&fit=crop&q=80',
        galleryImages: property.galleryImages?.length > 0 ? property.galleryImages : [
          'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&auto=format&fit=crop&q=80'
        ],
        includeInPublicListings: Boolean(property.includeInPublicListings),
        enableMaintenanceRequests: property.enableMaintenanceRequests !== false,
        allowVisitorRegistration: property.allowVisitorRegistration !== false,
        receivePaymentReminders: property.receivePaymentReminders !== false
      });
    }
  }, [property]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (payload) => {
      return await api.patch(`/properties/${property?.id || id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      navigate(`/admin/properties/${property?.displayIdentifier || id}`);
    },
    onError: (err) => {
      setFormError(err.response?.data?.message || err.message || 'Failed to update unit.');
    }
  });

  const handleChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'apartmentNumber') {
        updated.displayIdentifier = value;
      }
      return updated;
    });
  };

  const handleSelectTenant = (t) => {
    setFormData(prev => ({
      ...prev,
      currentTenantId: t.id,
      tenantName: `${t.firstName} ${t.lastName}`,
      tenantEmail: t.email,
      tenantPhone: t.phone
    }));
    setTenantModalOpen(false);
  };

  const handleRemoveImage = (index) => {
    setFormData(prev => ({
      ...prev,
      galleryImages: prev.galleryImages.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');
    updateMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center shadow-card">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm font-semibold text-slate-600">Loading unit data for editing...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-16">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            to={`/admin/properties/${property?.displayIdentifier || id}`}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Unit Details</span>
          </Link>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">Edit Unit</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Update the unit details, occupancy, pricing and settings.
          </p>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setActionsOpen(!actionsOpen)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs cursor-pointer"
          >
            <MoreHorizontal className="w-4 h-4 text-slate-500" />
            <span>Actions</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {actionsOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-30">
              <button
                type="button"
                onClick={() => {
                  setActionsOpen(false);
                  navigate(`/admin/properties/${property?.displayIdentifier || id}`);
                }}
                className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                View Unit Details
              </button>
            </div>
          )}
        </div>
      </div>

      {formError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-rose-700 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols): Steps 1, 2, 4 */}
        <div className="lg:col-span-8 space-y-6">
          {/* Step 1: Basic Information */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-primary text-white font-bold flex items-center justify-center text-sm shadow-xs shadow-primary/30">
                1
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 leading-tight">Basic Information</h3>
                <p className="text-xs text-slate-500">Update the main details of the unit.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Estate * */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Estate <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.estateId}
                    onChange={(e) => handleChange('estateId', e.target.value)}
                    required
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    {estates.map((est) => (
                      <option key={est.id} value={est.id}>{est.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Unit Name / Number * */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Unit Name / Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.apartmentNumber}
                  onChange={(e) => handleChange('apartmentNumber', e.target.value)}
                  placeholder="e.g. A1-01"
                  required
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Unit Type * */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Unit Type <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.type}
                    onChange={(e) => handleChange('type', e.target.value)}
                    required
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="Apartment">Apartment</option>
                    <option value="Duplex">Duplex</option>
                    <option value="Studio">Studio</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Penthouse">Penthouse</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {/* Property Category */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Property Category</label>
                <div className="relative">
                  <select
                    value={formData.category}
                    onChange={(e) => handleChange('category', e.target.value)}
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="Residential">Residential</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Bedrooms * */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Bedrooms <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.bedrooms}
                    onChange={(e) => handleChange('bedrooms', parseInt(e.target.value, 10))}
                    required
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value={0}>0</option>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={5}>5+</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Bathrooms * */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Bathrooms <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.bathrooms}
                    onChange={(e) => handleChange('bathrooms', parseInt(e.target.value, 10))}
                    required
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={5}>5+</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Parking Slots */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Parking Slots</label>
                <div className="relative">
                  <select
                    value={formData.parkingSlots}
                    onChange={(e) => handleChange('parkingSlots', parseInt(e.target.value, 10))}
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value={0}>0</option>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4+</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {/* Unit Size */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Unit Size (sqm) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.sizeSqm}
                  onChange={(e) => handleChange('sizeSqm', parseFloat(e.target.value) || 0)}
                  required
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary"
                />
              </div>

              {/* Floor / Block */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Floor / Block</label>
                <div className="relative">
                  <select
                    value={formData.block}
                    onChange={(e) => handleChange('block', e.target.value)}
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 cursor-pointer"
                  >
                    <option value="Block A">Block A</option>
                    <option value="Block B">Block B</option>
                    <option value="Block C">Block C</option>
                    <option value="Block D">Block D</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Build Year */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Build Year (Optional)</label>
                <input
                  type="number"
                  value={formData.buildYear}
                  onChange={(e) => handleChange('buildYear', parseInt(e.target.value, 10))}
                  placeholder="2023"
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800"
                />
              </div>

              {/* Status * */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Status <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.occupancyStatus}
                    onChange={(e) => handleChange('occupancyStatus', e.target.value)}
                    required
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 font-semibold cursor-pointer"
                  >
                    <option value="OCCUPIED">Occupied</option>
                    <option value="VACANT">Vacant</option>
                    <option value="UNDER_MAINTENANCE">Under Maintenance</option>
                    <option value="RESERVED">Reserved</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">Description</label>
                <span className="text-[10px] text-slate-400 font-medium">
                  {formData.description.length}/500
                </span>
              </div>
              <textarea
                rows={3}
                maxLength={500}
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary leading-relaxed"
              />
            </div>
          </div>

          {/* Step 2: Rental & Pricing Information */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-primary text-white font-bold flex items-center justify-center text-sm shadow-xs shadow-primary/30">
                2
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 leading-tight">Rental & Pricing Information</h3>
                <p className="text-xs text-slate-500">Set the rental amount and billing details.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Monthly Rent (₦) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.monthlyRent}
                  onChange={(e) => handleChange('monthlyRent', parseFloat(e.target.value) || 0)}
                  required
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 font-bold focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Service Charge (₦) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.serviceCharge}
                  onChange={(e) => handleChange('serviceCharge', parseFloat(e.target.value) || 0)}
                  required
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 font-bold focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Billing Cycle <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.billingCycle}
                    onChange={(e) => handleChange('billingCycle', e.target.value)}
                    required
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 cursor-pointer"
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Bi-Annually">Bi-Annually</option>
                    <option value="Annually">Annually</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Grace Period (Days)</label>
                <input
                  type="number"
                  value={formData.gracePeriodDays}
                  onChange={(e) => handleChange('gracePeriodDays', parseInt(e.target.value, 10) || 7)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800"
                />
                <span className="text-[10px] text-slate-400 block mt-1">Number of days before a due is marked late.</span>
              </div>
            </div>
          </div>

          {/* Step 4: Occupancy Information */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-primary text-white font-bold flex items-center justify-center text-sm shadow-xs shadow-primary/30">
                4
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 leading-tight">Occupancy Information</h3>
                <p className="text-xs text-slate-500">Set the current tenant and lease details.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Occupancy Status <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.occupancyStatus}
                    onChange={(e) => handleChange('occupancyStatus', e.target.value)}
                    required
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 font-semibold cursor-pointer"
                  >
                    <option value="OCCUPIED">Occupied</option>
                    <option value="VACANT">Vacant</option>
                    <option value="UNDER_MAINTENANCE">Under Maintenance</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-bold text-slate-700 mb-1">Current Tenant</label>
                <div className="flex items-center gap-3">
                  {formData.tenantName ? (
                    <div className="flex-1 flex items-center justify-between px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50/70 text-xs">
                      <div className="flex items-center gap-2">
                        <img
                          src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=60&auto=format&fit=crop&q=80"
                          alt="Tenant"
                          className="w-6 h-6 rounded-full object-cover"
                        />
                        <span className="font-bold text-slate-800">{formData.tenantName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            currentTenantId: '',
                            tenantName: '',
                            tenantEmail: '',
                            tenantPhone: ''
                          }));
                        }}
                        className="text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">No tenant assigned</span>
                  )}

                  <button
                    type="button"
                    onClick={() => setTenantModalOpen(true)}
                    className="px-4 py-2.5 rounded-xl border border-orange-200 text-primary text-xs font-bold hover:bg-orange-50 transition-all cursor-pointer whitespace-nowrap"
                  >
                    {formData.tenantName ? 'View Profile' : 'Select Tenant'}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Move In Date</label>
                <input
                  type="date"
                  value={formData.moveInDate}
                  onChange={(e) => handleChange('moveInDate', e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Lease End Date</label>
                <input
                  type="date"
                  value={formData.leaseEndDate}
                  onChange={(e) => handleChange('leaseEndDate', e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tenancy Type</label>
                <div className="relative">
                  <select
                    value={formData.tenancyType}
                    onChange={(e) => handleChange('tenancyType', e.target.value)}
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 cursor-pointer"
                  >
                    <option value="Residential">Residential</option>
                    <option value="Commercial">Commercial</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">Notes (Optional)</label>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {formData.notes?.length || 0}/300
                  </span>
                </div>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={formData.notes || ''}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  placeholder="Notes about tenant or property..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 leading-snug"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Images, Unit Location, Additional Settings */}
        <div className="lg:col-span-4 space-y-6">
          {/* Unit Images Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-orange-50 text-primary flex items-center justify-center">
                <Image className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Unit Images</h4>
                <p className="text-[10px] text-slate-500">Upload and manage images for this unit.</p>
              </div>
            </div>

            {/* Main Image Tile with Badge */}
            <div className="relative h-44 rounded-xl overflow-hidden border border-slate-200 group">
              <img
                src={formData.imageUrl || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&auto=format&fit=crop&q=80'}
                alt="Main"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2 px-2.5 py-1 rounded-md bg-primary text-white text-[10px] font-bold shadow-xs">
                Main Image
              </div>
              <button
                type="button"
                onClick={() => {
                  const url = prompt('Enter new main image URL:');
                  if (url) handleChange('imageUrl', url);
                }}
                className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-slate-900/70 hover:bg-rose-600 text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Gallery Thumbnails Grid with Delete */}
            <div className="grid grid-cols-3 gap-2">
              {formData.galleryImages.map((img, idx) => (
                <div key={idx} className="relative h-18 rounded-lg overflow-hidden border border-slate-200 group">
                  <img src={img} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(idx)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-md bg-slate-900/70 hover:bg-rose-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  const url = prompt('Enter image URL:');
                  if (url) {
                    setFormData(prev => ({ ...prev, galleryImages: [...prev.galleryImages, url] }));
                  }
                }}
                className="h-18 rounded-lg border-2 border-dashed border-slate-200 hover:border-primary flex flex-col items-center justify-center text-slate-400 hover:text-primary transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4 mb-0.5" />
                <span className="text-[10px] font-bold">Add More</span>
              </button>
            </div>
          </div>

          {/* Step 3: Unit Location */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-primary text-white font-bold flex items-center justify-center text-xs">
                3
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Unit Location</h4>
                <p className="text-[10px] text-slate-500">Set the unit location within the estate.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Block / Building</label>
                <div className="relative">
                  <select
                    value={formData.block}
                    onChange={(e) => handleChange('block', e.target.value)}
                    className="w-full appearance-none px-2.5 py-2 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 cursor-pointer"
                  >
                    <option value="Block A">Block A</option>
                    <option value="Block B">Block B</option>
                    <option value="Block C">Block C</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Floor</label>
                <div className="relative">
                  <select
                    value={formData.floor}
                    onChange={(e) => handleChange('floor', e.target.value)}
                    className="w-full appearance-none px-2.5 py-2 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 cursor-pointer"
                  >
                    <option value="Ground Floor">Ground Floor</option>
                    <option value="1st Floor">1st Floor</option>
                    <option value="2nd Floor">2nd Floor</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Unit Position (Optional)</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={formData.position}
                  onChange={(e) => handleChange('position', e.target.value)}
                  placeholder="e.g. Front, Back, Corner"
                  className="flex-1 px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 text-slate-800"
                />
                <button
                  type="button"
                  onClick={() => handleChange('position', 'Corner Unit')}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-xs font-semibold hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <span>Select on Map</span>
                </button>
              </div>
            </div>
          </div>

          {/* Step 5: Additional Settings */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-primary text-white font-bold flex items-center justify-center text-xs">
                5
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Additional Settings</h4>
                <p className="text-[10px] text-slate-500">Configure unit-specific settings and features.</p>
              </div>
            </div>

            <div className="space-y-3 text-xs font-medium text-slate-700">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.includeInPublicListings}
                  onChange={(e) => handleChange('includeInPublicListings', e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                />
                <span>Include in public listings (if applicable)</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.enableMaintenanceRequests}
                  onChange={(e) => handleChange('enableMaintenanceRequests', e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                />
                <span>Enable maintenance requests</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.allowVisitorRegistration}
                  onChange={(e) => handleChange('allowVisitorRegistration', e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                />
                <span>Allow visitor registration for this unit</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.receivePaymentReminders}
                  onChange={(e) => handleChange('receivePaymentReminders', e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                />
                <span>Receive payment reminders</span>
              </label>
            </div>
          </div>

          {/* Bottom Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate(`/admin/properties/${property?.displayIdentifier || id}`)}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-600 active:scale-98 text-white font-bold text-xs shadow-sm shadow-primary/30 transition-all cursor-pointer disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              <span>{updateMutation.isPending ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Select Tenant Modal */}
      {tenantModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Select Resident Tenant</h3>
              <button
                type="button"
                onClick={() => setTenantModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {tenants.map((t) => (
                <div
                  key={t.id}
                  onClick={() => handleSelectTenant(t)}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-primary hover:bg-orange-50/50 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={t.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=60&auto=format&fit=crop&q=80'}
                      alt={t.firstName}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{t.firstName} {t.lastName}</h4>
                      <p className="text-[11px] text-slate-500">{t.email}</p>
                    </div>
                  </div>
                  <Check className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </form>
  );
};
