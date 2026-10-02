import React, { useState, useEffect } from 'react';
import { 
  X, 
  Send, 
  Share2, 
  MessageSquare, 
  AlertTriangle, 
  CheckCircle2, 
  Building 
} from 'lucide-react';
import duesService from '../../services/duesService';
import { formatNaira } from '../../utils/formatters';

export const SendDuesReminderModal = ({ isOpen, onClose, targetUnit, onSent }) => {
  const [loading, setLoading] = useState(false);
  const [reminderText, setReminderText] = useState('');

  useEffect(() => {
    if (targetUnit) {
      const name = targetUnit.tenantName || 'Resident';
      const unit = targetUnit.displayIdentifier || 'Unit';
      const amt = formatNaira(targetUnit.outstandingDue || 0);
      const days = targetUnit.daysOverdue ? `${targetUnit.daysOverdue} days` : 'recently';
      
      setReminderText(
        `Dear ${name},\nThis is a friendly reminder from Estate Management that your outstanding dues of ${amt} for ${unit} are overdue by ${days}. Kindly settle via the resident portal or bank transfer to maintain uninterrupted estate services.`
      );
    }
  }, [targetUnit]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !targetUnit) return null;

  const handleSend = async () => {
    setLoading(true);
    try {
      await duesService.sendDuesReminder({
        propertyId: targetUnit.propertyId,
        residentName: targetUnit.tenantName,
        amount: targetUnit.outstandingDue,
        channels: ['WHATSAPP', 'SMS']
      });

      // Also trigger WhatsApp web intent if on desktop/mobile
      const waUrl = `https://wa.me/?text=${encodeURIComponent(reminderText)}`;
      window.open(waUrl, '_blank');

      if (onSent) onSent();
      onClose();
    } catch (err) {
      console.error('Failed to send reminder', err);
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
        className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200/80 animate-in zoom-in-95 duration-200 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Send Dues Reminder</h3>
            <p className="text-xs text-slate-500">Dispatch notice via WhatsApp & SMS</p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          {/* Overdue Snapshot Pill */}
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-between">
            <div>
              <span className="font-bold text-rose-900 text-sm block">
                {targetUnit.tenantName}
              </span>
              <span className="text-rose-700 font-medium">
                {targetUnit.displayIdentifier} &bull; {targetUnit.estateName}
              </span>
            </div>
            <div className="text-right">
              <span className="text-base font-extrabold text-rose-600 block">
                {formatNaira(targetUnit.outstandingDue)}
              </span>
              <span className="text-[10px] text-rose-700 font-bold uppercase">
                {targetUnit.daysOverdue} days overdue
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Editable Reminder Message
            </label>
            <textarea
              rows={4}
              value={reminderText}
              onChange={(e) => setReminderText(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-primary leading-relaxed"
            />
          </div>

          <div className="space-y-2 pt-2">
            <button
              type="button"
              disabled={loading}
              onClick={handleSend}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{loading ? 'Sending...' : 'Send Reminder via WhatsApp & SMS'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold text-xs cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
