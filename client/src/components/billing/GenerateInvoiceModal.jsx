import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, Check, FilePlus, Building, Home, User, Calendar, CreditCard, AlertCircle } from 'lucide-react';
import api from '../../services/api';
import { billingService } from '../../services/billingService';
import { formatNaira } from '../../utils/formatters';

export const GenerateInvoiceModal = ({ isOpen, onClose, onSuccess }) => {
  const queryClient = useQueryClient();

  const [estateId, setEstateId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [residentId, setResidentId] = useState('');
  const [residentName, setResidentName] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Service Charge');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });
  const [gracePeriodDays, setGracePeriodDays] = useState(7);
  const [paymentInstructions, setPaymentInstructions] = useState(
    'Payable to Estate Central Bank Account: Zenith Bank PLC | 1012345678. Quote invoice reference on teller.'
  );
  
  const [items, setItems] = useState([
    { description: 'Quarterly Estate Security & Gate Access Surcharge', quantity: 1, unitPrice: 45000, amount: 45000 },
    { description: 'Common Area Maintenance (CAM) & Streetlight Power', quantity: 1, unitPrice: 35000, amount: 35000 },
    { description: 'Waste Disposal & Environmental Sanitation Levy', quantity: 1, unitPrice: 15000, amount: 15000 }
  ]);

  const [formError, setFormError] = useState('');

  // Fetch all estates
  const { data: estates = [] } = useQuery({
    queryKey: ['estates-for-invoice-gen'],
    queryFn: async () => {
      const res = await api.get('/estates');
      const list = res.data?.estates || [];
      if (list.length > 0 && !estateId) {
        setEstateId(list[0].id);
      }
      return list;
    }
  });

  // Fetch units for chosen estate
  const { data: properties = [] } = useQuery({
    queryKey: ['properties-for-invoice-gen', estateId],
    enabled: Boolean(estateId),
    queryFn: async () => {
      const res = await api.get(`/properties?estateId=${estateId}&limit=100`);
      const list = res.data?.properties || [];
      if (list.length > 0) {
        const first = list[0];
        setPropertyId(first.id);
        bindResidentFromProperty(first);
      } else {
        setPropertyId('');
        setResidentId('');
        setResidentName('');
      }
      return list;
    }
  });

  // Helper to bind resident from property occupant
  const bindResidentFromProperty = (property) => {
    if (!property) return;
    if (property.currentTenantId) {
      setResidentId(property.currentTenantId);
      setResidentName(property.tenantName || 'Current Occupant');
    } else if (property.currentTenant) {
      setResidentId(property.currentTenant.id);
      setResidentName(`${property.currentTenant.firstName} ${property.currentTenant.lastName}`);
    } else {
      setResidentId('cmuoequ6p000iv1vz9c9yfwed'); // fallback to active demo resident ID if vacant
      setResidentName(property.tenantName || 'Property Occupant');
    }
  };

  const handlePropertyChange = (newPropId) => {
    setPropertyId(newPropId);
    const found = properties.find(p => p.id === newPropId);
    if (found) {
      bindResidentFromProperty(found);
    }
  };

  // Line item handlers
  const handleItemChange = (index, field, value) => {
    setItems(prev => {
      const copy = [...prev];
      const item = { ...copy[index] };

      if (field === 'quantity') {
        item.quantity = Math.max(1, parseInt(value) || 1);
        item.amount = item.quantity * (item.unitPrice || 0);
      } else if (field === 'unitPrice') {
        item.unitPrice = Math.max(0, parseFloat(value) || 0);
        item.amount = (item.quantity || 1) * item.unitPrice;
      } else {
        item[field] = value;
      }

      copy[index] = item;
      return copy;
    });
  };

  const addItemRow = () => {
    setItems(prev => [
      ...prev,
      { description: '', quantity: 1, unitPrice: 0, amount: 0 }
    ]);
  };

  const removeItemRow = (index) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Grand total calculation
  const totalAmount = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  // Set default title based on category if empty
  useEffect(() => {
    if (!title) {
      setTitle(`Q4 2026 Comprehensive ${category}`);
    }
  }, [category]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      return await billingService.createInvoice(payload);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['billing-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-stats'] });
      if (onSuccess) onSuccess(data);
      onClose();
    },
    onError: (err) => {
      setFormError(err.message || 'Failed to generate invoice. Please check the fields.');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');

    if (!estateId || !propertyId || !residentId) {
      setFormError('Please select a valid estate and property unit.');
      return;
    }

    if (!title.trim()) {
      setFormError('Please enter an invoice title.');
      return;
    }

    if (totalAmount <= 0) {
      setFormError('Invoice total amount must be greater than ₦0.00.');
      return;
    }

    createMutation.mutate({
      estateId,
      propertyId,
      residentId,
      title: title.trim(),
      description: paymentInstructions,
      amount: totalAmount,
      dueDate,
      items
    });
  };

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-start justify-center p-4 sm:p-6 py-6 sm:py-10">
      
      {/* Clickable Backdrop to Close */}
      <div 
        className="fixed inset-0 bg-transparent cursor-pointer" 
        onClick={onClose} 
        aria-label="Close modal backdrop"
      />

      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-elevated border border-slate-200 overflow-hidden flex flex-col my-auto relative z-10">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
              <FilePlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Generate Estate Invoice</h2>
              <p className="text-xs text-slate-400">Create itemized service charges, utility billings, or infrastructure levies.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {formError && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          {/* Section 1: Beneficiary */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-slate-900 text-white inline-flex items-center justify-center text-[10px] font-bold">1</span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Target Estate & Beneficiary</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Select Estate <span className="text-rose-500">*</span>
                </label>
                <select
                  value={estateId}
                  onChange={(e) => setEstateId(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  {estates.map((est) => (
                    <option key={est.id} value={est.id}>
                      {est.name} ({est.code || 'EST'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Select Unit / Property <span className="text-rose-500">*</span>
                </label>
                <select
                  value={propertyId}
                  onChange={(e) => handlePropertyChange(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  {properties.map((prop) => (
                    <option key={prop.id} value={prop.id}>
                      {prop.block ? `${prop.block} &bull; ` : ''}Unit {prop.displayIdentifier} ({prop.subtype || prop.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Primary Resident (Auto-bound)
                </label>
                <input
                  type="text"
                  value={residentName || 'Auto-bound to selected unit'}
                  readOnly
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-600 font-medium cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Section 2: Invoice Particulars */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-slate-900 text-white inline-flex items-center justify-center text-[10px] font-bold">2</span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Invoice Particulars & Timeline</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Invoice Title / Subject <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Q4 2026 Comprehensive Security & Service Charge"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Billing Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="Service Charge">Service Charge</option>
                  <option value="Quarterly Facility Levy">Quarterly Facility Levy</option>
                  <option value="Generator & Diesel Levy">Generator & Diesel Levy</option>
                  <option value="Water & Sanitation">Water & Sanitation</option>
                  <option value="Special Capital Assessment">Special Capital Assessment</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Due Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Grace Period (Days)
                </label>
                <select
                  value={gracePeriodDays}
                  onChange={(e) => setGracePeriodDays(parseInt(e.target.value))}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value={3}>3 Days</option>
                  <option value={7}>7 Days (Standard)</option>
                  <option value={14}>14 Days</option>
                  <option value={30}>30 Days</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Currency
                </label>
                <input
                  type="text"
                  value="NGN (Nigerian Naira - ₦)"
                  readOnly
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-600 font-semibold cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Section 3: Itemized Breakdown */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-900 text-white inline-flex items-center justify-center text-[10px] font-bold">3</span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Line Items & Financial Calculation</h3>
              </div>

              <button
                type="button"
                onClick={addItemRow}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dark transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item Line</span>
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase font-semibold">
                    <th className="py-2.5 px-3">Item Description</th>
                    <th className="py-2.5 px-3 w-20 text-center">Qty</th>
                    <th className="py-2.5 px-3 w-36">Unit Price (₦)</th>
                    <th className="py-2.5 px-3 w-36 text-right">Total (₦)</th>
                    <th className="py-2.5 px-3 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                          placeholder="Line item description..."
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          className="w-16 text-center text-xs px-2 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-900">
                        {formatNaira(item.amount)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItemRow(idx)}
                            className="text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals Summary */}
              <div className="bg-slate-50/90 p-4 border-t border-slate-200 flex flex-col items-end gap-1.5 text-xs">
                <div className="flex items-center justify-between w-64 text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-medium text-slate-900">{formatNaira(totalAmount)}</span>
                </div>
                <div className="flex items-center justify-between w-64 text-slate-600">
                  <span>VAT / Tax (0%):</span>
                  <span className="font-medium text-slate-900">{formatNaira(0)}</span>
                </div>
                <div className="flex items-center justify-between w-64 text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>Total Amount Due:</span>
                  <span className="text-primary text-base font-bold">{formatNaira(totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Bank Notes & Notifications */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bank Payment Instructions / Invoice Notes
              </label>
              <textarea
                rows={2}
                value={paymentInstructions}
                onChange={(e) => setPaymentInstructions(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-1 text-xs text-slate-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" defaultChecked className="w-4 h-4 rounded text-primary focus:ring-primary border-slate-300" />
                <span>Send automated SMS payment alert to resident phone</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" defaultChecked className="w-4 h-4 rounded text-primary focus:ring-primary border-slate-300" />
                <span>Email electronic PDF copy to resident</span>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-primary hover:bg-primary-dark text-white transition-all shadow-sm shadow-primary/20 disabled:opacity-50 cursor-pointer"
            >
              {createMutation.isPending ? (
                <span>Generating...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Generate & Issue Invoice</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>

    </div>
  );
};
