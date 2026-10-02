import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  X, 
  Calculator, 
  Building, 
  Calendar, 
  AlertCircle, 
  Send, 
  CheckCircle2, 
  Info 
} from 'lucide-react';
import api from '../../services/api';
import duesService from '../../services/duesService';
import { formatNaira } from '../../utils/formatters';

export const BatchAssessModal = ({ isOpen, onClose, onAssessed, defaultSchedule, schedule }) => {
  const [estateId, setEstateId] = useState('');
  const [scheduleTitle, setScheduleTitle] = useState('Estate Service Charge');
  const [amount, setAmount] = useState(50000);
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const targetSchedule = schedule || defaultSchedule;

  // Default dueDate to 30 days from now
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setDueDate(d.toISOString().split('T')[0]);
  }, []);

  // Sync if schedule provided
  useEffect(() => {
    if (targetSchedule) {
      if (targetSchedule.estateId) setEstateId(targetSchedule.estateId);
      if (targetSchedule.title) setScheduleTitle(targetSchedule.title);
      if (targetSchedule.amount) setAmount(targetSchedule.amount);
    }
  }, [targetSchedule]);

  // Fetch estates
  const { data: estates = [] } = useQuery({
    queryKey: ['estates-for-assess-modal'],
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

  // Count properties in selected estate
  const { data: propertiesCount = 0 } = useQuery({
    queryKey: ['estate-properties-count', estateId],
    queryFn: async () => {
      if (!estateId) return 0;
      const res = await api.get(`/properties?estateId=${estateId}&limit=1`);
      return res.data?.pagination?.total || 14;
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

  const grossInvoiced = (propertiesCount || 0) * (parseFloat(amount) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!estateId || !amount) {
      setError('Please select an estate and enter an assessment amount.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        estateId,
        scheduleTitle,
        amount: parseFloat(amount),
        dueDate
      };

      const res = await duesService.batchAssessDues(payload);
      if (res.success) {
        onAssessed(res.data);
        onClose();
      } else {
        setError(res.message || 'Batch assessment failed.');
      }
    } catch (err) {
      setError(err.message || 'Batch assessment failed.');
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
        className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200/80 animate-in zoom-in-95 duration-200 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary font-bold">
              <Calculator className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Batch Dues Assessment Engine</h3>
              <p className="text-xs text-slate-500">Automate recurring billing cycle across all estate properties</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                <span>Target Estate</span>
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
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Levy Title
              </label>
              <input
                type="text"
                value={scheduleTitle}
                onChange={(e) => setScheduleTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-primary"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Rate Per Unit (₦)
              </label>
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-primary"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Invoice Due Date</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-primary"
                required
              />
            </div>
          </div>

          {/* Projection Card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
              Assessment Summary Projection
            </span>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-xs">
                <span className="text-[10px] text-slate-400 block font-semibold">Total Units</span>
                <span className="font-extrabold text-slate-800 text-sm mt-0.5 block">{propertiesCount} Units</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-xs">
                <span className="text-[10px] text-slate-400 block font-semibold">Unit Rate</span>
                <span className="font-extrabold text-slate-800 text-sm mt-0.5 block">{formatNaira(amount)}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-xs">
                <span className="text-[10px] text-primary block font-semibold">Gross Invoiced</span>
                <span className="font-extrabold text-primary text-sm mt-0.5 block">{formatNaira(grossInvoiced)}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 flex items-start gap-1.5 leading-relaxed pt-1">
              <Info className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
              <span>
                Running this batch assessment generates electronic invoices for all matching units in this estate, posts debits to resident ledgers, and schedules automated payment notices.
              </span>
            </p>
          </div>

          {/* Action buttons */}
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
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-dark active:scale-98 text-white font-semibold text-xs shadow-sm shadow-primary/30 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? 'Assessing...' : 'Run Batch Assessment'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
