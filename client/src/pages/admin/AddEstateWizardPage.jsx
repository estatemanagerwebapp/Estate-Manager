import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Check, 
  ChevronRight, 
  ChevronDown, 
  Image as ImageIcon, 
  Plus, 
  X, 
  Home, 
  Building, 
  Layers, 
  Shield, 
  Lightbulb, 
  Edit3, 
  CheckCircle2, 
  AlertTriangle, 
  MapPin, 
  Mail, 
  Phone, 
  User, 
  Sliders, 
  Coins, 
  FileText, 
  Clock, 
  Wrench, 
  Bell, 
  Tv, 
  Waves, 
  Dumbbell, 
  Coffee, 
  Car, 
  Camera, 
  Zap, 
  Droplet, 
  ShieldCheck, 
  Calendar 
} from 'lucide-react';
import api from '../../services/api';
import { Button } from '../../components/ui/Button';

export const AddEstateWizardPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Wizard Step: 1 | 2 | 3
  const [currentStep, setCurrentStep] = useState(1);
  const [errorMessage, setErrorMessage] = useState('');

  // Step 1: Form State
  const [estateName, setEstateName] = useState('Sunrise Estate');
  const [shortDescription, setShortDescription] = useState('A modern and secure residential estate with premium facilities and 24/7 security.');
  const [estateType, setEstateType] = useState('Residential');
  const [status, setStatus] = useState('ACTIVE');
  const [address, setAddress] = useState('Plot 12, Lekki Phase 1, Lekki-Epe Expressway');
  const [googleMapsLocation, setGoogleMapsLocation] = useState('https://maps.google.com/?q=Lekki+Phase+1');
  const [stateName, setStateName] = useState('Lagos');
  const [cityName, setCityName] = useState('Lekki');
  const [areaName, setAreaName] = useState('Lekki Phase 1');

  // Featured and Gallery Images
  const [featuredImage, setFeaturedImage] = useState('https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&auto=format&fit=crop&q=80');
  const [galleryImages, setGalleryImages] = useState([
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&auto=format&fit=crop&q=80'
  ]);

  // Manager details
  const [managerName, setManagerName] = useState('John Doe');
  const [managerEmail, setManagerEmail] = useState('john@sunriseestate.com');
  const [managerPhone, setManagerPhone] = useState('801 234 5678');
  const [officeAddress, setOfficeAddress] = useState('Sunrise Estate Management Office, Lekki, Lagos');

  // Step 2: Facilities
  const availableFacilities = [
    { name: 'Swimming Pool', icon: Waves },
    { name: 'Gym', icon: Dumbbell },
    { name: 'Club House', icon: Coffee },
    { name: 'Playground', icon: Home },
    { name: 'CCTV', icon: Camera },
    { name: 'Backup Power', icon: Zap },
    { name: 'Water Supply', icon: Droplet },
    { name: 'Security Post', icon: ShieldCheck },
    { name: 'Parking Space', icon: Car },
    { name: 'Tennis Court', icon: Calendar },
    { name: 'Basketball Court', icon: Calendar },
    { name: 'Event Hall', icon: Calendar }
  ];

  const [selectedFacilities, setSelectedFacilities] = useState([
    'Swimming Pool',
    'Gym',
    'Club House',
    'Playground',
    'CCTV',
    'Backup Power',
    'Security Post',
    'Parking Space',
    'Event Hall'
  ]);
  const [customFacility, setCustomFacility] = useState('');

  // Access & Gate rules
  const [visitorAccess, setVisitorAccess] = useState('Requires Approval');
  const [gatePassExpiry, setGatePassExpiry] = useState('Same Day');
  const [vehicleAccess, setVehicleAccess] = useState('Allowed with Registration');
  const [deliveryAccess, setDeliveryAccess] = useState('Allowed with Verification');
  const [enableQrCode, setEnableQrCode] = useState(true);
  const [enableFaceRecognition, setEnableFaceRecognition] = useState(true);
  const [enableIntercomNotifications, setEnableIntercomNotifications] = useState(false);

  // Billing settings
  const [serviceChargeType, setServiceChargeType] = useState('Per Unit');
  const [billingCycle, setBillingCycle] = useState('Monthly');
  const [defaultServiceCharge, setDefaultServiceCharge] = useState(50000);
  const [gracePeriodDays, setGracePeriodDays] = useState(7);

  // Important system settings toggles
  const [enableMaintenanceRequests, setEnableMaintenanceRequests] = useState(true);
  const [enableEstateOffice, setEnableEstateOffice] = useState(true);
  const [enableInvoiceGeneration, setEnableInvoiceGeneration] = useState(true);
  const [enableDuesAndFees, setEnableDuesAndFees] = useState(true);
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);

  // Facility selection toggles
  const toggleFacility = (facilityName) => {
    if (selectedFacilities.includes(facilityName)) {
      setSelectedFacilities(selectedFacilities.filter((f) => f !== facilityName));
    } else {
      setSelectedFacilities([...selectedFacilities, facilityName]);
    }
  };

  const addCustomFacility = (e) => {
    e.preventDefault();
    if (!customFacility.trim()) return;
    if (!selectedFacilities.includes(customFacility.trim())) {
      setSelectedFacilities([...selectedFacilities, customFacility.trim()]);
    }
    setCustomFacility('');
  };

  // Submit Mutation
  const createEstateMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/estates', payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['estates'] });
      const newId = data?.data?.estate?.id || 'SUN-001';
      navigate(`/admin/estates/${newId}`);
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Failed to create estate. Please check your inputs.');
    }
  });

  const handleFinalSubmit = () => {
    setErrorMessage('');
    const payload = {
      name: estateName,
      description: shortDescription,
      estateType,
      status,
      address,
      googleMapsUrl: googleMapsLocation,
      state: stateName,
      city: cityName,
      area: areaName,
      imageUrl: featuredImage,
      galleryImages,
      managerName,
      managerEmail,
      managerPhone: `+234 ${managerPhone.replace(/\D/g, '')}`,
      officeAddress,
      amenities: selectedFacilities,
      visitorAccessRule: visitorAccess,
      gatePassExpiry,
      vehicleAccessRule: vehicleAccess,
      deliveryAccessRule: deliveryAccess,
      enableQrCode,
      enableFaceRecognition,
      enableIntercomNotifications,
      serviceChargeType,
      billingCycle,
      defaultServiceCharge: parseFloat(defaultServiceCharge) || 50000,
      gracePeriodDays: parseInt(gracePeriodDays, 10) || 7,
      enableMaintenanceRequests,
      enableEstateOffice,
      enableInvoiceGeneration,
      enableDuesAndFees,
      sendWelcomeEmail
    };

    createEstateMutation.mutate(payload);
  };

  // Validate step transitions
  const handleNextStep = () => {
    setErrorMessage('');
    if (currentStep === 1) {
      if (!estateName.trim() || !address.trim()) {
        setErrorMessage('Please provide the estate name and street address.');
        return;
      }
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (currentStep === 2) {
      setCurrentStep(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevStep = () => {
    setErrorMessage('');
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* 1. Header with Breadcrumb and Progress Stepper */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <button
            type="button"
            onClick={() => {
              if (currentStep > 1) handlePrevStep();
              else navigate('/admin/estates');
            }}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{currentStep === 1 ? 'Back to Estates' : 'Back to Estate Details'}</span>
          </button>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Add New Estate</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            {currentStep === 1 && 'Create a new estate and set up all the essential details.'}
            {currentStep === 2 && 'Configure facilities, rules and settings for the estate.'}
            {currentStep === 3 && 'Review all the information below before creating the estate.'}
          </p>
        </div>

        {/* Wizard Stepper matching 2.1, 2.2, 2.3 */}
        <div className="flex items-center gap-3 shrink-0 self-start lg:self-auto">
          {/* Step 1 Indicator */}
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              currentStep === 1
                ? 'bg-primary text-white shadow-sm shadow-primary/30'
                : currentStep > 1
                ? 'bg-emerald-500 text-white'
                : 'border border-slate-300 text-slate-400'
            }`}>
              {currentStep > 1 ? <Check className="w-4 h-4" /> : '1'}
            </div>
            <span className={`text-xs font-bold hidden sm:inline ${
              currentStep === 1 ? 'text-slate-900' : 'text-slate-400'
            }`}>
              Estate Details
            </span>
          </div>

          <div className="w-8 sm:w-12 h-0.5 bg-slate-200" />

          {/* Step 2 Indicator */}
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              currentStep === 2
                ? 'bg-primary text-white shadow-sm shadow-primary/30'
                : currentStep > 2
                ? 'bg-emerald-500 text-white'
                : 'border border-slate-300 text-slate-400'
            }`}>
              {currentStep > 2 ? <Check className="w-4 h-4" /> : '2'}
            </div>
            <span className={`text-xs font-bold hidden sm:inline ${
              currentStep === 2 ? 'text-slate-900' : 'text-slate-400'
            }`}>
              Facilities & Settings
            </span>
          </div>

          <div className="w-8 sm:w-12 h-0.5 bg-slate-200" />

          {/* Step 3 Indicator */}
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              currentStep === 3
                ? 'bg-primary text-white shadow-sm shadow-primary/30'
                : 'border border-slate-300 text-slate-400'
            }`}>
              3
            </div>
            <span className={`text-xs font-bold hidden sm:inline ${
              currentStep === 3 ? 'text-slate-900' : 'text-slate-400'
            }`}>
              Review & Create
            </span>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center gap-2.5 animate-shake">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ================= STEP 1: ESTATE DETAILS ================= */}
      {currentStep === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Form (Left 2 Cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Section 1: Basic Information */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-5">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-lg bg-primary text-white text-xs font-black flex items-center justify-center">
                  1
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Basic Information</h3>
                  <p className="text-xs text-slate-400">Add the main details of the estate.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Estate Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={estateName}
                    onChange={(e) => setEstateName(e.target.value)}
                    placeholder="e.g. Sunrise Estate"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <div className="row-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">Short Description</label>
                    <span className="text-[10px] text-slate-400 font-semibold">{shortDescription.length}/300</span>
                  </div>
                  <textarea
                    rows="4"
                    maxLength={300}
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    placeholder="Brief description about the estate..."
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Estate Type <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={estateType}
                      onChange={(e) => setEstateType(e.target.value)}
                      className="w-full appearance-none px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                    >
                      <option value="Residential">Residential</option>
                      <option value="Commercial">Commercial</option>
                      <option value="Mixed Use">Mixed Use</option>
                      <option value="Gated Community">Gated Community</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Status <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full appearance-none pl-7 pr-9 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <ChevronDown className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Address <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows="2"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter full address of the estate"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Google Maps Location <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="url"
                  value={googleMapsLocation}
                  onChange={(e) => setGoogleMapsLocation(e.target.value)}
                  placeholder="Paste Google Maps link"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    State <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={stateName}
                      onChange={(e) => setStateName(e.target.value)}
                      className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                    >
                      <option value="Lagos">Lagos</option>
                      <option value="Abuja FCT">Abuja FCT</option>
                      <option value="Oyo">Oyo</option>
                      <option value="Rivers">Rivers</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    City <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={cityName}
                      onChange={(e) => setCityName(e.target.value)}
                      className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                    >
                      <option value="Lekki">Lekki</option>
                      <option value="Ikoyi">Ikoyi</option>
                      <option value="Victoria Island">Victoria Island</option>
                      <option value="Ikeja">Ikeja</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Area <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={areaName}
                    onChange={(e) => setAreaName(e.target.value)}
                    placeholder="e.g. Lekki"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Estate Images */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-5">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-lg bg-primary text-white text-xs font-black flex items-center justify-center">
                  2
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Estate Images</h3>
                  <p className="text-xs text-slate-400">Upload a featured image and gallery for the estate.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Upload Featured Image Box */}
                <div className="border border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center justify-center text-center bg-slate-50/50">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 text-primary flex items-center justify-center mb-3">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-800">Upload Featured Image *</h4>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">
                    Recommended size: 1200 x 800px JPG, PNG or WebP (Max 5MB)
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const url = prompt('Enter image URL for featured photo:', featuredImage);
                      if (url) setFeaturedImage(url);
                    }}
                    className="mt-4 px-4 py-1.5 rounded-xl border border-primary text-primary text-xs font-bold hover:bg-orange-50 transition-colors cursor-pointer"
                  >
                    Choose Image
                  </button>
                </div>

                {/* Gallery Slots */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Gallery Images <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <p className="text-[11px] text-slate-400 mb-3">Add more images to showcase the estate.</p>
                  <div className="grid grid-cols-5 gap-2">
                    {galleryImages.map((img, idx) => (
                      <div key={idx} className="relative w-full aspect-square rounded-xl overflow-hidden border border-slate-200 group">
                        <img src={img} alt="gallery" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setGalleryImages(galleryImages.filter((_, i) => i !== idx))}
                          className="absolute inset-0 bg-slate-900/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {Array.from({ length: Math.max(0, 5 - galleryImages.length) }).map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          const url = prompt('Enter gallery image URL:');
                          if (url) setGalleryImages([...galleryImages, url]);
                        }}
                        className="w-full aspect-square rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:text-primary hover:border-primary transition-all cursor-pointer bg-slate-50"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Contact & Management */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-5">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-lg bg-primary text-white text-xs font-black flex items-center justify-center">
                  3
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Contact & Management</h3>
                  <p className="text-xs text-slate-400">Add estate management contact details.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Estate Manager Name</label>
                  <input
                    type="text"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Manager Email</label>
                  <input
                    type="email"
                    value={managerEmail}
                    onChange={(e) => setManagerEmail(e.target.value)}
                    placeholder="e.g. manager@sunriseestate.com"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Manager Phone</label>
                  <div className="flex items-center">
                    <span className="px-3 py-2.5 bg-slate-100 border border-r-0 border-slate-200 rounded-l-xl text-xs font-bold text-slate-600 flex items-center gap-1.5">
                      <span>🇳🇬</span>
                      <span>+234</span>
                    </span>
                    <input
                      type="text"
                      value={managerPhone}
                      onChange={(e) => setManagerPhone(e.target.value)}
                      placeholder="801 234 5678"
                      className="w-full px-4 py-2.5 rounded-r-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Office Address <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={officeAddress}
                    onChange={(e) => setOfficeAddress(e.target.value)}
                    placeholder="e.g. Estate management office address"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (Tips + Estate Types Tiles) */}
          <div className="space-y-6">
            {/* Tips Card matching 2.1 */}
            <div className="bg-orange-50/70 border border-orange-200/70 rounded-3xl p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2.5 text-primary font-bold text-sm">
                <Lightbulb className="w-5 h-5 shrink-0" />
                <span>Tips for a Great Estate Profile</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-700 font-medium">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>Use a clear and recognizable estate name</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>Add a detailed address and location</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>Upload a high-quality featured image</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>Include accurate contact information</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>Set the correct estate status</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>You can add facilities and rules in the next step</span>
                </li>
              </ul>
            </div>

            {/* Estate Types Selectable Tiles matching 2.1 */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs space-y-3">
              <h4 className="text-sm font-bold text-slate-900">Estate Types</h4>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'Residential', label: 'Residential', desc: 'Houses, apartments, duplexes', icon: Home },
                  { id: 'Commercial', label: 'Commercial', desc: 'Offices, shops, business complexes', icon: Building },
                  { id: 'Mixed Use', label: 'Mixed Use', desc: 'Residential and commercial', icon: Layers },
                  { id: 'Gated Community', label: 'Gated Community', desc: 'Secure, controlled access estate', icon: Shield }
                ].map((type) => {
                  const Icon = type.icon;
                  const isSelected = estateType === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setEstateType(type.id)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-primary bg-orange-50/60 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <Icon className={`w-5 h-5 mb-2 ${isSelected ? 'text-primary' : 'text-slate-500'}`} />
                      <div>
                        <h5 className="text-xs font-bold text-slate-900">{type.label}</h5>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{type.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Navigation Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => navigate('/admin/estates')}
                className="w-1/3"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleNextStep}
                className="w-2/3 shadow-sm shadow-primary/25"
              >
                Next: Facilities & Settings →
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ================= STEP 2: FACILITIES & SETTINGS ================= */}
      {currentStep === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content (Left 2 Cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Section 1: Facilities & Amenities matching 2.2 */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-5">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-lg bg-primary text-white text-xs font-black flex items-center justify-center">
                  1
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Facilities & Amenities</h3>
                  <p className="text-xs text-slate-400">Select the facilities available in this estate.</p>
                </div>
              </div>

              {/* Grid of facility tiles with checkboxes */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {availableFacilities.map((fac) => {
                  const Icon = fac.icon;
                  const isChecked = selectedFacilities.includes(fac.name);

                  return (
                    <button
                      key={fac.name}
                      type="button"
                      onClick={() => toggleFacility(fac.name)}
                      className={`p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isChecked
                          ? 'border-primary bg-orange-50/40 shadow-xs'
                          : 'border-slate-200/80 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className={`w-4 h-4 shrink-0 ${isChecked ? 'text-primary' : 'text-slate-400'}`} />
                        <span className="text-xs font-bold text-slate-800 truncate">{fac.name}</span>
                      </div>
                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                        isChecked
                          ? 'bg-primary border-primary text-white'
                          : 'border-slate-300 bg-white'
                      }`}>
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Custom facility add form */}
              <form onSubmit={addCustomFacility} className="pt-2">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Custom Facility</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Plus className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={customFacility}
                      onChange={(e) => setCustomFacility(e.target.value)}
                      placeholder="Add a custom facility (e.g. Mini Mart, Spa)"
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-orange-100 hover:bg-orange-200/80 text-primary text-xs font-bold transition-colors cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </form>
            </div>

            {/* Section 2: Estate Rules & Access Settings matching 2.2 */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-5">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-lg bg-primary text-white text-xs font-black flex items-center justify-center">
                  2
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Estate Rules & Access Settings</h3>
                  <p className="text-xs text-slate-400">Set important rules and access preferences for the estate.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Visitor Access</label>
                  <div className="relative">
                    <select
                      value={visitorAccess}
                      onChange={(e) => setVisitorAccess(e.target.value)}
                      className="w-full appearance-none px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                    >
                      <option value="Requires Approval">Requires Approval</option>
                      <option value="Pre-Registration Only">Pre-Registration Only</option>
                      <option value="Open Access">Open Access</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Visitors must be approved before entry.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Gate Pass Expiry (Visitors)</label>
                  <div className="relative">
                    <select
                      value={gatePassExpiry}
                      onChange={(e) => setGatePassExpiry(e.target.value)}
                      className="w-full appearance-none px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                    >
                      <option value="Same Day">Same Day</option>
                      <option value="12 Hours">12 Hours</option>
                      <option value="24 Hours">24 Hours</option>
                      <option value="Custom">Custom</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Visitor passes expire at the end of the day.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Vehicle Access</label>
                  <div className="relative">
                    <select
                      value={vehicleAccess}
                      onChange={(e) => setVehicleAccess(e.target.value)}
                      className="w-full appearance-none px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                    >
                      <option value="Allowed with Registration">Allowed with Registration</option>
                      <option value="Residents Only">Residents Only</option>
                      <option value="Strict Verification">Strict Verification</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Vehicles must be registered at the gate.</p>
                </div>

                {/* Toggle: Enable QR Code Access */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">Enable QR Code Access</h5>
                    <p className="text-[11px] text-slate-400">Use QR codes for visitor and resident entry.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableQrCode(!enableQrCode)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      enableQrCode ? 'bg-primary' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                      enableQrCode ? 'right-1' : 'left-1'
                    }`} />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Delivery Access</label>
                  <div className="relative">
                    <select
                      value={deliveryAccess}
                      onChange={(e) => setDeliveryAccess(e.target.value)}
                      className="w-full appearance-none px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                    >
                      <option value="Allowed with Verification">Allowed with Verification</option>
                      <option value="Gate Drop-off Only">Gate Drop-off Only</option>
                      <option value="Resident Escort Required">Resident Escort Required</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Delivery personnel must verify identity.</p>
                </div>

                {/* Toggle: Face Recognition */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">Enable Face Recognition <span className="text-[10px] text-slate-400 font-normal">(If available)</span></h5>
                    <p className="text-[11px] text-slate-400">Allow facial recognition at the gate.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableFaceRecognition(!enableFaceRecognition)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      enableFaceRecognition ? 'bg-primary' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                      enableFaceRecognition ? 'right-1' : 'left-1'
                    }`} />
                  </button>
                </div>

                {/* Toggle: Intercom Notifications */}
                <div className="flex items-center justify-between sm:col-span-2 pt-2 border-t border-slate-100">
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">Enable Intercom Notifications</h5>
                    <p className="text-[11px] text-slate-400">Notify residents when visitors arrive.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableIntercomNotifications(!enableIntercomNotifications)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      enableIntercomNotifications ? 'bg-primary' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                      enableIntercomNotifications ? 'right-1' : 'left-1'
                    }`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Section 3: Service Charge & Billing Settings matching 2.2 */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-5">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-lg bg-primary text-white text-xs font-black flex items-center justify-center">
                  3
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Service Charge & Billing Settings</h3>
                  <p className="text-xs text-slate-400">Configure default billing settings for the estate.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Service Charge Type</label>
                  <div className="relative">
                    <select
                      value={serviceChargeType}
                      onChange={(e) => setServiceChargeType(e.target.value)}
                      className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                    >
                      <option value="Per Unit">Per Unit</option>
                      <option value="Per SQM">Per SQM</option>
                      <option value="Fixed Rate">Fixed Rate</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">How service charges are calculated.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Default Billing Cycle</label>
                  <div className="relative">
                    <select
                      value={billingCycle}
                      onChange={(e) => setBillingCycle(e.target.value)}
                      className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                    >
                      <option value="Monthly">Monthly</option>
                      <option value="Quarterly">Quarterly</option>
                      <option value="Bi-Annually">Bi-Annually</option>
                      <option value="Annually">Annually</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Default frequency for invoices.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Default Service Charge (₦)</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={defaultServiceCharge}
                    onChange={(e) => setDefaultServiceCharge(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Default amount per unit.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Grace Period (Days)</label>
                  <input
                    type="number"
                    min="0"
                    value={gracePeriodDays}
                    onChange={(e) => setGracePeriodDays(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Number of days before a due is marked late.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Selected Facilities Chips + Important Settings matching 2.2 */}
          <div className="space-y-6">
            {/* Why Add Facilities Card */}
            <div className="bg-orange-50/70 border border-orange-200/70 rounded-3xl p-5 shadow-xs space-y-2">
              <div className="flex items-center gap-2.5 text-primary font-bold text-sm">
                <Lightbulb className="w-5 h-5 shrink-0" />
                <span>Why Add Facilities?</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Facilities help residents know what's available in the estate and can be shown on the resident portal.
              </p>
            </div>

            {/* Selected Facilities Chips Card matching 2.2 */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs space-y-3">
              <h4 className="text-sm font-bold text-slate-900">
                Selected Facilities ({selectedFacilities.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {selectedFacilities.map((fac) => (
                  <span
                    key={fac}
                    className="bg-slate-100 hover:bg-slate-200/70 border border-slate-200/80 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <span>{fac}</span>
                    <button
                      type="button"
                      onClick={() => toggleFacility(fac)}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Important Settings Card matching 2.2 */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <Sliders className="w-4 h-4" />
                <span>Important Settings</span>
              </div>

              <div className="space-y-3 divide-y divide-slate-100">
                {/* Maintenance Requests */}
                <div className="pt-2 first:pt-0 flex items-center justify-between gap-3">
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">Enable Maintenance Requests</h5>
                    <p className="text-[10px] text-slate-400">Allow residents to submit complaints/requests.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableMaintenanceRequests(!enableMaintenanceRequests)}
                    className={`w-10 h-5 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                      enableMaintenanceRequests ? 'bg-primary' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                      enableMaintenanceRequests ? 'right-0.5' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                {/* Estate Office */}
                <div className="pt-2 flex items-center justify-between gap-3">
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">Enable Estate Office</h5>
                    <p className="text-[10px] text-slate-400">Allow residents to raise and track complaints.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableEstateOffice(!enableEstateOffice)}
                    className={`w-10 h-5 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                      enableEstateOffice ? 'bg-primary' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                      enableEstateOffice ? 'right-0.5' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                {/* Invoice Generation */}
                <div className="pt-2 flex items-center justify-between gap-3">
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">Enable Invoice Generation</h5>
                    <p className="text-[10px] text-slate-400">Automatically generate service charge invoices.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableInvoiceGeneration(!enableInvoiceGeneration)}
                    className={`w-10 h-5 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                      enableInvoiceGeneration ? 'bg-primary' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                      enableInvoiceGeneration ? 'right-0.5' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                {/* Dues & Fees */}
                <div className="pt-2 flex items-center justify-between gap-3">
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">Enable Dues & Fees</h5>
                    <p className="text-[10px] text-slate-400">Track outstanding dues and fees.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableDuesAndFees(!enableDuesAndFees)}
                    className={`w-10 h-5 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                      enableDuesAndFees ? 'bg-primary' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                      enableDuesAndFees ? 'right-0.5' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                {/* Welcome Email */}
                <div className="pt-2 flex items-center justify-between gap-3">
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">Send Welcome Email to New Residents</h5>
                    <p className="text-[10px] text-slate-400">Automatically send welcome email when a resident is added.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSendWelcomeEmail(!sendWelcomeEmail)}
                    className={`w-10 h-5 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                      sendWelcomeEmail ? 'bg-primary' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                      sendWelcomeEmail ? 'right-0.5' : 'left-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                type="button"
                onClick={handlePrevStep}
                className="w-1/3"
              >
                ← Previous
              </Button>
              <Button
                type="button"
                onClick={handleNextStep}
                className="w-2/3 shadow-sm shadow-primary/25"
              >
                Next: Review & Create →
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ================= STEP 3: REVIEW & CREATE matching 2.3 ================= */}
      {currentStep === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Summary (Left 2 Cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Card 1: Estate Details Review matching 2.3 */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-primary text-white text-xs font-black flex items-center justify-center">
                    1
                  </span>
                  <h3 className="text-base font-bold text-slate-900">Estate Details</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/40 text-primary text-xs font-bold hover:bg-orange-50 transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <img
                    src={featuredImage}
                    alt={estateName}
                    className="w-full h-44 rounded-2xl object-cover border border-slate-100 shadow-xs mb-3"
                  />
                  <div className="grid grid-cols-4 gap-2">
                    {galleryImages.slice(0, 3).map((img, i) => (
                      <img key={i} src={img} alt="thumbnail" className="w-full h-12 rounded-xl object-cover border border-slate-100" />
                    ))}
                    {galleryImages.length > 3 && (
                      <div className="w-full h-12 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                        +{galleryImages.length - 3}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <span className="block text-[11px] font-semibold text-slate-400">Estate Name</span>
                    <span className="text-sm font-bold text-slate-900">{estateName}</span>
                  </div>

                  <div>
                    <span className="block text-[11px] font-semibold text-slate-400">Estate Type</span>
                    <span className="font-bold text-slate-800">{estateType}</span>
                  </div>

                  <div>
                    <span className="block text-[11px] font-semibold text-slate-400">Short Description</span>
                    <p className="font-medium text-slate-600 leading-relaxed">{shortDescription}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className="block text-[11px] font-semibold text-slate-400">Address</span>
                      <span className="font-medium text-slate-800">{address}, {stateName}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-semibold text-slate-400">Location</span>
                      <span className="font-medium text-slate-800">{cityName}, {stateName}</span>
                    </div>
                  </div>

                  <div>
                    <span className="block text-[11px] font-semibold text-slate-400 mb-1">Status</span>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                      status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {status === 'ACTIVE' ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Facilities & Amenities Review matching 2.3 */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-primary text-white text-xs font-black flex items-center justify-center">
                    2
                  </span>
                  <h3 className="text-base font-bold text-slate-900">Facilities & Amenities</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/40 text-primary text-xs font-bold hover:bg-orange-50 transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                {selectedFacilities.map((fac) => (
                  <span
                    key={fac}
                    className="bg-slate-100 text-slate-700 border border-slate-200/80 text-xs font-semibold px-3 py-1 rounded-xl flex items-center gap-2"
                  >
                    <span>{fac}</span>
                  </span>
                ))}
              </div>

              {/* Estate Rules Summary matching 2.3 */}
              <div className="border-t border-slate-100 pt-5 space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Estate Rules & Access Settings</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Visitor Access:</span>
                      <span className="font-bold text-slate-800">{visitorAccess}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Vehicle Access:</span>
                      <span className="font-bold text-slate-800">{vehicleAccess}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Delivery Access:</span>
                      <span className="font-bold text-slate-800">{deliveryAccess}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Gate Pass Expiry:</span>
                      <span className="font-bold text-slate-800">{gatePassExpiry}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">QR Code Access:</span>
                      <span className={`font-bold ${enableQrCode ? 'text-primary' : 'text-slate-400'}`}>
                        {enableQrCode ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Face Recognition:</span>
                      <span className={`font-bold ${enableFaceRecognition ? 'text-primary' : 'text-slate-400'}`}>
                        {enableFaceRecognition ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Intercom Notifications:</span>
                      <span className={`font-bold ${enableIntercomNotifications ? 'text-primary' : 'text-slate-400'}`}>
                        {enableIntercomNotifications ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Service Charge Summary matching 2.3 */}
              <div className="border-t border-slate-100 pt-5 space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Service Charge & Billing Settings</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl text-xs">
                  <div>
                    <span className="block text-[10px] text-slate-400 font-semibold">Service Charge Type</span>
                    <span className="font-bold text-slate-800">{serviceChargeType}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 font-semibold">Billing Cycle</span>
                    <span className="font-bold text-slate-800">{billingCycle}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 font-semibold">Service Charge Amount</span>
                    <span className="font-bold text-slate-900">₦{Number(defaultServiceCharge).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 font-semibold">Grace Period</span>
                    <span className="font-bold text-slate-800">{gracePeriodDays} Days</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (Contact Review + Actions) */}
          <div className="space-y-6">
            {/* Card 3: Contact & Management Review matching 2.3 */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-primary text-white text-xs font-black flex items-center justify-center">
                    3
                  </span>
                  <h3 className="text-base font-bold text-slate-900">Contact & Management</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/40 text-primary text-xs font-bold hover:bg-orange-50 transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              </div>

              <div className="space-y-3.5 text-xs divide-y divide-slate-100">
                <div className="flex items-center gap-3 pt-2 first:pt-0">
                  <div className="w-8 h-8 rounded-xl bg-orange-50 text-primary flex items-center justify-center shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Estate Manager</span>
                    <span className="font-bold text-slate-800">{managerName}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <div className="w-8 h-8 rounded-xl bg-orange-50 text-primary flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Manager Email</span>
                    <span className="font-bold text-slate-800">{managerEmail}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <div className="w-8 h-8 rounded-xl bg-orange-50 text-primary flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Manager Phone</span>
                    <span className="font-bold text-slate-800">+234 {managerPhone}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <div className="w-8 h-8 rounded-xl bg-orange-50 text-primary flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Office Address</span>
                    <span className="font-bold text-slate-800">{officeAddress}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* You're Almost Done Card matching 2.3 */}
            <div className="bg-orange-50/70 border border-orange-200/70 rounded-3xl p-5 shadow-xs space-y-2">
              <div className="flex items-center gap-2.5 text-primary font-bold text-sm">
                <Lightbulb className="w-5 h-5 shrink-0" />
                <span>You&apos;re Almost Done!</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Please review the information to make sure everything is correct before creating the estate.
              </p>
            </div>

            {/* What Happens Next Card matching 2.3 */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs space-y-3">
              <h4 className="text-sm font-bold text-slate-900">What Happens Next?</h4>
              <ul className="space-y-2 text-xs text-slate-700 font-medium">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>The estate will be created and added to your list</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>You can start adding units, residents and staff</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>Facilities, rules and settings will be applied immediately</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>You can edit all information later in the estate settings</span>
                </li>
              </ul>
            </div>

            {/* Final Action Buttons matching 2.3 */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                type="button"
                onClick={handlePrevStep}
                className="w-1/3"
              >
                ← Previous
              </Button>
              <Button
                type="button"
                disabled={createEstateMutation.isPending}
                onClick={handleFinalSubmit}
                className="w-2/3 shadow-sm shadow-primary/25"
              >
                {createEstateMutation.isPending ? 'Creating...' : '✓ Create Estate'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
