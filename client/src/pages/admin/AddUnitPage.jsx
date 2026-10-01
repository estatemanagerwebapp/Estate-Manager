import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Upload, 
  Trash2, 
  MapPin, 
  Plus, 
  Check, 
  Calendar, 
  FileText, 
  ChevronDown, 
  X, 
  Image, 
  AlertCircle 
} from 'lucide-react';
import api from '../../services/api';

export const AddUnitPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Form State
  const [formData, setFormData] = useState({
    estateId: '',
    block: 'Block A',
    apartmentNumber: 'A1-01',
    displayIdentifier: 'A1-01',
    type: 'Apartment',
    category: 'Residential',
    bedrooms: 3,
    bathrooms: 3,
    parkingSlots: 2,
    sizeSqm: 120,
    floor: '1st Floor',
    buildYear: 2023,
    occupancyStatus: 'OCCUPIED',
    description: 'Spacious 3-bedroom apartment with modern finishing, balcony, and 24/7 security. Ideal for families looking for comfort and convenience.',
    
    // Pricing
    monthlyRent: 50000,
    serviceCharge: 5000,
    billingCycle: 'Monthly',
    gracePeriodDays: 7,
    
    // Occupancy
    currentTenantId: '',
    tenantName: 'Amaka Okafor',
    tenantEmail: 'amaka.okafor@gmail.com',
    tenantPhone: '+234 801 234 5678',
    moveInDate: '2025-01-12',
    leaseEndDate: '2026-01-11',
    tenancyType: 'Residential',
    agreementDocument: 'lease-agreement.pdf',
    
    // Location & images
    position: '',
    imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&auto=format&fit=crop&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&auto=format&fit=crop&q=80'
    ],
    
    // Additional settings
    includeInPublicListings: false,
    enableMaintenanceRequests: true,
    allowVisitorRegistration: true,
    receivePaymentReminders: true
  });

  const [formError, setFormError] = useState('');
  const [tenantModalOpen, setTenantModalOpen] = useState(false);

  // Fetch estates
  const { data: estates = [] } = useQuery({
    queryKey: ['estates-list-for-unit'],
    queryFn: async () => {
      const res = await api.get('/estates');
      const list = res.data?.estates || [];
      if (list.length > 0 && !formData.estateId) {
        setFormData(prev => ({ ...prev, estateId: list[0].id }));
      }
      return list;
    }
  });

  // Fetch tenants
  const { data: tenants = [] } = useQuery({
    queryKey: ['tenants-list'],
    queryFn: async () => {
      const res = await api.get('/properties/meta/tenants');
      return res.data?.tenants || [];
    }
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      return await api.post('/properties', payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      const newId = res.data?.property?.id || res.data?.property?.displayIdentifier;
      navigate(`/admin/properties/${newId || ''}`);
    },
    onError: (err) => {
      setFormError(err.response?.data?.message || err.message || 'Failed to create unit.');
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

    if (!formData.estateId) {
      setFormError('Please select an estate.');
      return;
    }
    if (!formData.apartmentNumber.trim()) {
      setFormError('Unit number is required.');
      return;
    }

    createMutation.mutate(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-16">
      {/* Top Header & Breadcrumb */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-2">
          <Link to="/admin/properties" className="flex items-center gap-1 hover:text-slate-800 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Units & Properties</span>
          </Link>
          <span>&gt;</span>
          <span className="text-slate-900 font-bold">Add Unit</span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">Add Unit</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Create a new unit and assign property details, pricing and settings.
        </p>
      </div>

      {formError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-rose-700 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* Main Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols): Steps 1, 2, 3 */}
        <div className="lg:col-span-8 space-y-6">
          {/* Step 1: Basic Information */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-primary text-white font-bold flex items-center justify-center text-sm shadow-xs shadow-primary/30">
                1
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 leading-tight">Basic Information</h3>
                <p className="text-xs text-slate-500">Enter the main details of the unit.</p>
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

              {/* Property / Building * */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Property / Building <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.block}
                    onChange={(e) => handleChange('block', e.target.value)}
                    required
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="Block A">Block A</option>
                    <option value="Block B">Block B</option>
                    <option value="Block C">Block C</option>
                    <option value="Block D">Block D</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Unit Number * */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Unit Number <span className="text-rose-500">*</span>
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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

              {/* Property Category */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Property Category</label>
                <div className="relative">
                  <select
                    value={formData.category}
                    onChange={(e) => handleChange('category', e.target.value)}
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
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
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value={0}>0 (Studio/Shop)</option>
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
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {/* Parking Slots */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Parking Slots</label>
                <div className="relative">
                  <select
                    value={formData.parkingSlots}
                    onChange={(e) => handleChange('parkingSlots', parseInt(e.target.value, 10))}
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
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

              {/* Unit Size (sqm) * */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Unit Size (sqm) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.sizeSqm}
                  onChange={(e) => handleChange('sizeSqm', parseFloat(e.target.value) || 0)}
                  required
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Floor * */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Floor <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.floor}
                    onChange={(e) => handleChange('floor', e.target.value)}
                    required
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="Ground Floor">Ground Floor</option>
                    <option value="1st Floor">1st Floor</option>
                    <option value="2nd Floor">2nd Floor</option>
                    <option value="3rd Floor">3rd Floor</option>
                    <option value="Penthouse Floor">Penthouse Floor</option>
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
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Unit Status Radio options */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                Unit Status <span className="text-rose-500">*</span>
              </label>
              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                {[
                  { id: 'VACANT', label: 'Vacant' },
                  { id: 'OCCUPIED', label: 'Occupied' },
                  { id: 'UNDER_MAINTENANCE', label: 'Under Maintenance' },
                  { id: 'RESERVED', label: 'Reserved' },
                  { id: 'ARCHIVED', label: 'Archived' }
                ].map((st) => (
                  <label key={st.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="occupancyStatus"
                      value={st.id}
                      checked={formData.occupancyStatus === st.id}
                      onChange={(e) => handleChange('occupancyStatus', e.target.value)}
                      className="text-primary focus:ring-primary w-4 h-4"
                    />
                    <span className="text-slate-800">{st.label}</span>
                  </label>
                ))}
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
                placeholder="Spacious apartment with modern finishing..."
                className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary leading-relaxed"
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
              {/* Monthly Rent */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Monthly Rent (₦) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.monthlyRent}
                  onChange={(e) => handleChange('monthlyRent', parseFloat(e.target.value) || 0)}
                  required
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 font-bold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Service Charge */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Service Charge (₦) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.serviceCharge}
                  onChange={(e) => handleChange('serviceCharge', parseFloat(e.target.value) || 0)}
                  required
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 font-bold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Billing Cycle */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Billing Cycle <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.billingCycle}
                    onChange={(e) => handleChange('billingCycle', e.target.value)}
                    required
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Bi-Annually">Bi-Annually</option>
                    <option value="Annually">Annually</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Grace Period (Days) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Grace Period (Days)</label>
                <input
                  type="number"
                  value={formData.gracePeriodDays}
                  onChange={(e) => handleChange('gracePeriodDays', parseInt(e.target.value, 10) || 7)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <span className="text-[10px] text-slate-400 block mt-1">Number of days before a due is marked late.</span>
              </div>
            </div>
          </div>

          {/* Step 3: Occupancy Information */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-primary text-white font-bold flex items-center justify-center text-sm shadow-xs shadow-primary/30">
                3
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 leading-tight">Occupancy Information</h3>
                <p className="text-xs text-slate-500">Assign the current tenant or set availability.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
              {/* Occupancy Status */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Occupancy Status <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.occupancyStatus}
                    onChange={(e) => handleChange('occupancyStatus', e.target.value)}
                    required
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="OCCUPIED">Occupied</option>
                    <option value="VACANT">Vacant</option>
                    <option value="UNDER_MAINTENANCE">Under Maintenance</option>
                    <option value="RESERVED">Reserved</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Current Tenant */}
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
                    Select Tenant
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Move In Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Move In Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={formData.moveInDate}
                    onChange={(e) => handleChange('moveInDate', e.target.value)}
                    className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Lease End Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Lease End Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={formData.leaseEndDate}
                    onChange={(e) => handleChange('leaseEndDate', e.target.value)}
                    className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Tenancy Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tenancy Type</label>
                <div className="relative">
                  <select
                    value={formData.tenancyType}
                    onChange={(e) => handleChange('tenancyType', e.target.value)}
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="Residential">Residential</option>
                    <option value="Commercial">Commercial</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Agreement Document */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Agreement Document (Optional)</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700">
                    <span className="flex items-center gap-1.5 font-medium truncate">
                      <FileText className="w-3.5 h-3.5 text-rose-500" />
                      <span>{formData.agreementDocument || 'lease-agreement.pdf'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleChange('agreementDocument', '')}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const doc = prompt('Enter document name or URL:');
                      if (doc) handleChange('agreementDocument', doc);
                    }}
                    className="px-3 py-2 rounded-xl border border-orange-200 text-primary text-xs font-bold hover:bg-orange-50 whitespace-nowrap cursor-pointer"
                  >
                    Upload New
                  </button>
                </div>
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
                <p className="text-[10px] text-slate-500">Upload clear images to showcase this unit.</p>
              </div>
            </div>

            {/* Upload Main Image Box */}
            <div 
              onClick={() => {
                const url = prompt('Enter main image URL:');
                if (url) handleChange('imageUrl', url);
              }}
              className="border-2 border-dashed border-slate-200 hover:border-primary rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50"
            >
              <div className="w-10 h-10 rounded-full bg-white shadow-xs border border-slate-200 flex items-center justify-center mx-auto mb-2 text-slate-500">
                <Plus className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-slate-800">Upload Main Image</p>
              <p className="text-[10px] text-slate-400 mt-0.5">JPG, PNG (Max 5MB)</p>
            </div>

            {/* Gallery Thumbnails Grid with Delete */}
            <div className="grid grid-cols-2 gap-2">
              {formData.galleryImages.map((img, idx) => (
                <div key={idx} className="relative h-20 rounded-lg overflow-hidden border border-slate-200 group">
                  <img src={img} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(idx)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-slate-900/70 hover:bg-rose-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
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
                <p className="text-[10px] text-slate-500">Set the unit's location within the estate.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Block / Building <span className="text-rose-500">*</span>
                </label>
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
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Floor <span className="text-rose-500">*</span>
                </label>
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
                  onClick={() => handleChange('position', 'Corner Unit (Lake View)')}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-xs font-semibold hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <span>Select on Map</span>
                </button>
              </div>
            </div>
          </div>

          {/* Step 4: Additional Settings */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-primary text-white font-bold flex items-center justify-center text-xs">
                4
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

          {/* Bottom Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/admin/properties')}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-600 active:scale-98 text-white font-bold text-xs shadow-sm shadow-primary/30 transition-all cursor-pointer disabled:opacity-60"
            >
              <Plus className="w-4 h-4" />
              <span>{createMutation.isPending ? 'Creating Unit...' : 'Add Unit'}</span>
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
