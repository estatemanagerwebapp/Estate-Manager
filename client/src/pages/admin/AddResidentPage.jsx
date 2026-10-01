import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Upload, 
  User, 
  Home, 
  Key, 
  Plus, 
  Check, 
  Calendar, 
  FileText, 
  ChevronDown, 
  X, 
  AlertCircle,
  MoreHorizontal,
  Info
} from 'lucide-react';
import api from '../../services/api';

export const AddResidentPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    gender: '',
    identificationType: '',
    idNumber: '',
    emergencyContactName: '',
    emergencyContactNumber: '',
    address: '',
    
    // Tenancy
    tenancyType: 'Owner',
    moveInDate: '2025-01-12',
    expectedMoveOutDate: '',
    leaseStartDate: '2025-01-12',
    leaseEndDate: '2026-01-11',
    monthlyRent: 50000,
    
    // Additional
    notes: '',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80',
    
    // Assignment
    estateId: '',
    unitId: '',
    
    // Access & permissions
    generateQrCode: true,
    allowVisitorRegistration: true,
    sendWelcomeEmail: true,
    residentPortalAccess: false
  });

  const [formError, setFormError] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);

  // Fetch estates
  const { data: estates = [] } = useQuery({
    queryKey: ['estates-for-add-resident'],
    queryFn: async () => {
      const res = await api.get('/estates');
      const list = res.data?.estates || [];
      if (list.length > 0 && !formData.estateId) {
        setFormData(prev => ({ ...prev, estateId: list[0].id }));
      }
      return list;
    }
  });

  // Fetch properties for selected estate
  const { data: units = [] } = useQuery({
    queryKey: ['units-for-add-resident', formData.estateId],
    enabled: Boolean(formData.estateId),
    queryFn: async () => {
      const res = await api.get(`/properties?estateId=${formData.estateId}&limit=50`);
      const list = res.data?.properties || [];
      if (list.length > 0 && !formData.unitId) {
        setFormData(prev => ({ ...prev, unitId: list[0].id }));
      }
      return list;
    }
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      return await api.post('/residents', payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['residents-list'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      const newCode = res.data?.resident?.residentCode || res.data?.resident?.id;
      navigate(`/admin/residents/${newCode || ''}`);
    },
    onError: (err) => {
      setFormError(err.response?.data?.message || err.message || 'Failed to register resident.');
    }
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.fullName.trim()) {
      setFormError('Resident full name is required.');
      return;
    }
    if (!formData.email.trim()) {
      setFormError('Email address is required.');
      return;
    }
    if (!formData.phone.trim()) {
      setFormError('Phone number is required.');
      return;
    }

    createMutation.mutate(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-16">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-2">
            <Link to="/admin/residents" className="flex items-center gap-1 hover:text-slate-800 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Residents</span>
            </Link>
            <span>&gt;</span>
            <span className="text-slate-900 font-bold">Add Resident</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">Add Resident</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Register a new resident and assign them to a unit. All fields marked with <span className="text-rose-500">*</span> are required.
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
                  navigate('/admin/residents');
                }}
                className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to Residents List
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

      {/* Main Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Steps 1, 2, 3 */}
        <div className="lg:col-span-8 space-y-6">
          {/* Step 1: Personal Information */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-primary text-white font-bold flex items-center justify-center text-sm shadow-xs shadow-primary/30">
                1
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 leading-tight">Personal Information</h3>
                <p className="text-xs text-slate-500">Enter the resident's personal details.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Full Name * */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Amaka Okafor"
                  value={formData.fullName}
                  onChange={(e) => handleChange('fullName', e.target.value)}
                  required
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Email Address * */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  placeholder="e.g. amaka@gmail.com"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  required
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Phone Number * */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Phone Number <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center">
                  <span className="inline-flex items-center px-2.5 py-2.5 rounded-l-xl border border-r-0 border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                    NG
                  </span>
                  <input
                    type="text"
                    placeholder="+234 801 234 5678"
                    value={formData.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    required
                    className="w-full px-3 py-2.5 text-xs rounded-r-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Date of Birth */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => handleChange('dateOfBirth', e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Gender */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Gender</label>
                <div className="relative">
                  <select
                    value={formData.gender}
                    onChange={(e) => handleChange('gender', e.target.value)}
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="">Select gender</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Identification Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Identification Type</label>
                <div className="relative">
                  <select
                    value={formData.identificationType}
                    onChange={(e) => handleChange('identificationType', e.target.value)}
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="">Select ID type</option>
                    <option value="National ID">National ID</option>
                    <option value="Driver's License">Driver's License</option>
                    <option value="International Passport">International Passport</option>
                    <option value="Voter's Card">Voter's Card</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* ID Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ID Number</label>
                <input
                  type="text"
                  placeholder="e.g. 1234 5678 9012"
                  value={formData.idNumber}
                  onChange={(e) => handleChange('idNumber', e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Emergency Contact Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Emergency Contact Name</label>
                <input
                  type="text"
                  placeholder="e.g. Chinedu Okafor"
                  value={formData.emergencyContactName}
                  onChange={(e) => handleChange('emergencyContactName', e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Emergency Contact Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Emergency Contact Number</label>
                <div className="flex items-center">
                  <span className="inline-flex items-center px-2.5 py-2.5 rounded-l-xl border border-r-0 border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                    NG
                  </span>
                  <input
                    type="text"
                    placeholder="+234 803 112 9987"
                    value={formData.emergencyContactNumber}
                    onChange={(e) => handleChange('emergencyContactNumber', e.target.value)}
                    className="w-full px-3 py-2.5 text-xs rounded-r-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Address */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">Address</label>
                <span className="text-[10px] text-slate-400 font-medium">
                  {formData.address.length}/200
                </span>
              </div>
              <textarea
                rows={2}
                maxLength={200}
                placeholder="Enter current address"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary leading-relaxed"
              />
            </div>
          </div>

          {/* Step 2: Tenancy Information */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-primary text-white font-bold flex items-center justify-center text-sm shadow-xs shadow-primary/30">
                2
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 leading-tight">Tenancy Information</h3>
                <p className="text-xs text-slate-500">Set the tenancy details for this resident.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Tenancy Type * */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tenancy Type <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.tenancyType}
                    onChange={(e) => handleChange('tenancyType', e.target.value)}
                    required
                    className="w-full appearance-none px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="Owner">Owner</option>
                    <option value="Tenant">Tenant</option>
                    <option value="Business">Business</option>
                    <option value="Family Member">Family Member</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Move In Date * */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Move In Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.moveInDate}
                  onChange={(e) => handleChange('moveInDate', e.target.value)}
                  required
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Expected Move Out Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Expected Move Out Date</label>
                <input
                  type="date"
                  value={formData.expectedMoveOutDate}
                  onChange={(e) => handleChange('expectedMoveOutDate', e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Lease Start Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Lease Start Date</label>
                <input
                  type="date"
                  value={formData.leaseStartDate}
                  onChange={(e) => handleChange('leaseStartDate', e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Lease End Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Lease End Date</label>
                <input
                  type="date"
                  value={formData.leaseEndDate}
                  onChange={(e) => handleChange('leaseEndDate', e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Monthly Rent (₦) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Monthly Rent (₦)</label>
                <input
                  type="number"
                  placeholder="e.g. 50000"
                  value={formData.monthlyRent}
                  onChange={(e) => handleChange('monthlyRent', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 font-bold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Step 3: Additional Information */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-primary text-white font-bold flex items-center justify-center text-sm shadow-xs shadow-primary/30">
                3
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 leading-tight">Additional Information</h3>
                <p className="text-xs text-slate-500">Add any notes or extra details about the resident.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Notes */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">Notes (Optional)</label>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {formData.notes.length}/300
                  </span>
                </div>
                <textarea
                  rows={4}
                  maxLength={300}
                  placeholder="e.g. Special instructions, additional contact info, etc."
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary leading-relaxed"
                />
              </div>

              {/* Upload Documents Box */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Documents (Optional)</label>
                <div
                  onClick={() => alert('Document upload modal')}
                  className="h-[105px] border-2 border-dashed border-slate-200 hover:border-primary rounded-xl flex flex-col items-center justify-center text-center p-3 cursor-pointer bg-slate-50/50 transition-colors"
                >
                  <Upload className="w-5 h-5 text-slate-400 mb-1" />
                  <p className="text-xs font-bold text-slate-800">Upload Documents</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                    ID card, lease agreement, passport, etc.<br />JPG, PNG, PDF (Max 5MB each)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Resident Photo, Unit Assignment, Access & Permissions */}
        <div className="lg:col-span-4 space-y-6">
          {/* Resident Photo Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-orange-50 text-primary flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Resident Photo</h4>
                <p className="text-[10px] text-slate-500">Upload a clear photo of the resident.</p>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center py-2">
              <div className="w-24 h-24 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center overflow-hidden mb-3">
                {formData.avatar ? (
                  <img src={formData.avatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-slate-400" />
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  const url = prompt('Enter photo URL:', formData.avatar);
                  if (url) handleChange('avatar', url);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-xs cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Photo</span>
              </button>
              <span className="text-[10px] text-slate-400 mt-1">JPG, PNG (Max 2MB)</span>
            </div>
          </div>

          {/* Unit Assignment Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-primary text-white font-bold flex items-center justify-center text-xs">
                <Home className="w-4 h-4 text-white" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Unit Assignment</h4>
                <p className="text-[10px] text-slate-500">Assign the resident to a unit.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Estate * */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Estate <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.estateId}
                    onChange={(e) => handleChange('estateId', e.target.value)}
                    required
                    className="w-full appearance-none px-2.5 py-2 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 cursor-pointer"
                  >
                    {estates.map((est) => (
                      <option key={est.id} value={est.id}>{est.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Unit * */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Unit <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.unitId}
                    onChange={(e) => handleChange('unitId', e.target.value)}
                    required
                    className="w-full appearance-none px-2.5 py-2 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 cursor-pointer"
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayIdentifier} ({u.type})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 flex items-start gap-2 text-amber-900 text-xs leading-snug">
              <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <span>Only available units will be shown. You can change this later if needed.</span>
            </div>
          </div>

          {/* Access & Permissions Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-orange-50 text-primary flex items-center justify-center text-xs">
                <Key className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Access & Permissions</h4>
                <p className="text-[10px] text-slate-500">Set gate access and system permissions.</p>
              </div>
            </div>

            <div className="space-y-3 text-xs font-medium text-slate-700">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.generateQrCode}
                  onChange={(e) => handleChange('generateQrCode', e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                />
                <span>Generate QR code for gate access</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.allowVisitorRegistration}
                  onChange={(e) => handleChange('allowVisitorRegistration', e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                />
                <span>Allow visitor registration for this resident</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.sendWelcomeEmail}
                  onChange={(e) => handleChange('sendWelcomeEmail', e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                />
                <span>Send welcome email with login details</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.residentPortalAccess}
                  onChange={(e) => handleChange('residentPortalAccess', e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                />
                <span>Give access to resident portal (if applicable)</span>
              </label>
            </div>
          </div>

          {/* Bottom Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/admin/residents')}
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
              <span>{createMutation.isPending ? 'Registering...' : 'Add Resident'}</span>
            </button>
          </div>
        </div>
      </div>
    </form>
  );
};
