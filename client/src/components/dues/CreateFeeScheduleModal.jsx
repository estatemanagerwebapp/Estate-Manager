import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  X, 
  Coins, 
  Building, 
  Calendar, 
  AlertCircle,
  FileText
} from 'lucide-react';
import api from '../../services/api';
import duesService from '../../services/duesService';

export const CreateFeeScheduleModal = ({ isOpen, onClose, onCreated }) => {
  const [estateId, setEstateId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [unitsCount, setUnitsCount] = useState(320);
  const [dueDaysText, setDueDaysText] = useState('Due in 7 days');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch estates
  const { data: estates = [] } = useQuery({
    queryKey: ['estates-for-dues-modal'],
    queryFn: async () => {
      const res = await api.get('/estates');
      const list = res.data?.estates || [];
      if (list.length > 0 && !estateId) {
        setEstateId(list[0].id);
        if (list[0].totalUnits) setUnitsCount(list[0].totalUnits);
      }
      return list;
    },
    enabled: isOpen
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

    if (!estateId || !title.trim() || !amount) {
      setError('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        estateId,
        title: title.trim(),
        amount: parseFloat(amount),
        unitsCount: parseInt(unitsCount, 10) || 320,
        dueDaysText
      };

      const res = await duesService.createFeeSchedule(payload);
      if (res.success) {
        onCreated(res.data);
        onClose();
      } else {
        setError(res.message || 'Failed to create fee schedule.');
      }
    } catch (err) {
      setError(err.message || 'Failed to create fee schedule.');
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
        className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200/80 animate-in zoom-in-95 duration-200 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
              <Coins className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Create Dues Schedule</h3>
              <p className="text-xs text-slate-500">Configure a recurring estate levy or service charge structure</p>
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
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Fee Title</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Estate Service Charge, Security & Patrol Levy"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-primary"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Rate Per Unit (₦)
              </label>
              <input
                type="number"
                step="any"
                placeholder="50000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-primary"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Target Units
              </label>
              <input
                type="number"
                placeholder="320"
                value={unitsCount}
                onChange={(e) => setUnitsCount(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Due Notice Subtitle</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Due in 7 days, Due 1st of month"
              value={dueDaysText}
              onChange={(e) => setDueDaysText(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-primary"
            />
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
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-dark active:scale-98 text-white font-semibold text-xs shadow-sm shadow-primary/30 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Fee Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
