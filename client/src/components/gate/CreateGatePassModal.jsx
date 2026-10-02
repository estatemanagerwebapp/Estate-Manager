import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  X, 
  Ticket, 
  User, 
  Phone, 
  Car, 
  Building, 
  Layers, 
  Clock, 
  AlertCircle 
} from 'lucide-react';
import api from '../../services/api';
import gateService from '../../services/gateService';

export const CreateGatePassModal = ({ isOpen, onClose, onPassCreated }) => {
  const [estateId, setEstateId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [type, setType] = useState('GUEST');
  const [validityHours, setValidityHours] = useState('12');
  const [maxUses, setMaxUses] = useState('1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch estates
  const { data: estates = [] } = useQuery({
    queryKey: ['estates-for-gate-pass'],
    queryFn: async () => {
      const res = await api.get('/estates');
      const list = res.data?.estates || [];
      if (list.length > 0 && !estateId) {
        setEstateId(list[0].id);
      }
      return list;
    },
    enabled: isOpen
  });

  // Fetch properties for the selected estate
  const { data: properties = [] } = useQuery({
    queryKey: ['properties-for-gate-pass', estateId],
    queryFn: async () => {
      if (!estateId) return [];
      const res = await api.get(`/properties?estateId=${estateId}&limit=100`);
      const list = res.data?.properties || [];
      if (list.length > 0) {
        setPropertyId(list[0].id);
      }
      return list;
    },
    enabled: isOpen && Boolean(estateId)
  });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!estateId || !propertyId || !visitorName.trim()) {
      setError('Please select an estate, destination unit, and enter the visitor name.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        estateId,
        propertyId,
        visitorName: visitorName.trim(),
        visitorPhone: visitorPhone.trim() || undefined,
        vehiclePlate: vehiclePlate.trim().toUpperCase() || undefined,
        type,
        validityHours: parseInt(validityHours, 10),
        maxUses: parseInt(maxUses, 10)
      };

      const res = await gateService.createGatePass(payload);
      if (res.success && res.data) {
        onPassCreated(res.data);
        onClose();
      } else {
        setError(res.message || 'Failed to generate pass.');
      }
    } catch (err) {
      setError(err.message || 'Failed to create gate pass.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200/80 animate-in zoom-in-95 duration-200 relative overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
              <Ticket className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Generate Visitor Pass</h3>
              <p className="text-xs text-slate-500">Create a secure 6-digit access code for incoming visitors</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-700 font-medium">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Estate & Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                <span>Estate</span>
              </label>
              <select
                value={estateId}
                onChange={(e) => setEstateId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-primary cursor-pointer"
                required
              >
                {estates.map((est) => (
                  <option key={est.id} value={est.id}>{est.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span>Destination Unit</span>
              </label>
              <select
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-primary cursor-pointer"
                required
              >
                {properties.length === 0 ? (
                  <option value="">No units available</option>
                ) : (
                  properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayIdentifier} ({p.tenant?.name || 'Vacant'})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Visitor Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Visitor Name</span>
              </label>
              <input
                type="text"
                placeholder="e.g. David Adeleke"
                value={visitorName}
                onChange={(e) => setVisitorName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-primary"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>Visitor Phone (Optional)</span>
              </label>
              <input
                type="tel"
                placeholder="+234 800 000 0000"
                value={visitorPhone}
                onChange={(e) => setVisitorPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Vehicle & Pass Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Car className="w-3.5 h-3.5 text-slate-400" />
                <span>Vehicle Plate (Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. KJA-543-BC"
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs uppercase font-mono focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Pass Category</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="GUEST">Guest / Personal Visit</option>
                <option value="DELIVERY">Delivery / Courier</option>
                <option value="CAB">Ride-Hailing (Uber / Bolt)</option>
                <option value="SERVICE">Contractor / Artisan</option>
              </select>
            </div>
          </div>

          {/* Validity & Usage */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Validity Window</span>
              </label>
              <select
                value={validityHours}
                onChange={(e) => setValidityHours(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="4">Valid for 4 Hours</option>
                <option value="8">Valid for 8 Hours</option>
                <option value="12">Valid for 12 Hours</option>
                <option value="24">Valid for 24 Hours</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Usage Allowance</label>
              <select
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="1">Single Entry (1 time)</option>
                <option value="5">Multi Entry (Same Day)</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-dark active:scale-98 text-white font-semibold text-xs shadow-sm shadow-primary/30 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Generate 6-Digit Pass'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
