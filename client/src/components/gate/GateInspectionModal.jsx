import React, { useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  ShieldAlert, 
  LogOut, 
  User, 
  Home, 
  Car, 
  Clock, 
  Shield, 
  FileText 
} from 'lucide-react';

export const GateInspectionModal = ({ isOpen, onClose, log }) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !log) return null;

  const isDenied = log.gateAction === 'DENIED';
  const isExit = log.gateAction === 'EXIT';

  const formatTimestamp = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
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
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
              isDenied 
                ? 'bg-rose-50 text-rose-600 border border-rose-200' 
                : isExit 
                ? 'bg-slate-100 text-slate-700 border border-slate-200'
                : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
            }`}>
              {isDenied ? (
                <ShieldAlert className="w-5 h-5 text-rose-600" />
              ) : isExit ? (
                <LogOut className="w-5 h-5 text-slate-600" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Gate Verification Detail</h3>
              <p className="text-xs text-slate-500">Security audit log & gate snapshot</p>
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

        {/* Modal Content */}
        <div className="space-y-4 text-xs">
          {/* Visitor Card */}
          <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
            <img 
              src={log.visitorImageUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'} 
              alt={log.visitorName} 
              className="w-16 h-16 rounded-xl object-cover border border-slate-200 shadow-xs flex-shrink-0" 
            />
            <div className="space-y-1">
              <h4 className="font-bold text-slate-900 text-sm">{log.visitorName}</h4>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isDenied 
                  ? 'bg-rose-100 text-rose-800' 
                  : isExit 
                  ? 'bg-slate-200 text-slate-700' 
                  : 'bg-emerald-100 text-emerald-800'
              }`}>
                {log.gateAction}
              </span>
              <p className="text-slate-500 flex items-center gap-1 text-[11px]">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>{formatTimestamp(log.verifiedAt)}</span>
              </p>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl border border-slate-100 bg-white">
              <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                <Home className="w-3 h-3 text-slate-400" />
                <span>Destination Unit</span>
              </span>
              <p className="font-bold text-slate-800 mt-1">{log.destinationUnit || '—'}</p>
              <p className="text-[11px] text-slate-500">{log.estateName}</p>
            </div>

            <div className="p-3 rounded-xl border border-slate-100 bg-white">
              <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                <User className="w-3 h-3 text-slate-400" />
                <span>Host Resident</span>
              </span>
              <p className="font-bold text-slate-800 mt-1">{log.residentName || '—'}</p>
              <p className="text-[11px] text-slate-500">{log.residentPhone || '—'}</p>
            </div>

            <div className="p-3 rounded-xl border border-slate-100 bg-white">
              <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                <Car className="w-3 h-3 text-slate-400" />
                <span>Vehicle Plate</span>
              </span>
              <p className="font-mono font-bold text-slate-800 mt-1">{log.vehiclePlate || 'Pedestrian'}</p>
            </div>

            <div className="p-3 rounded-xl border border-slate-100 bg-white">
              <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                <Shield className="w-3 h-3 text-primary" />
                <span>Verifying Guard</span>
              </span>
              <p className="font-bold text-slate-800 mt-1">{log.guardName || 'Officer'}</p>
            </div>
          </div>

          {/* Guard Security Notes */}
          <div className="p-3.5 rounded-xl bg-orange-50/60 border border-orange-100">
            <span className="text-[10px] text-primary uppercase font-bold flex items-center gap-1">
              <FileText className="w-3 h-3 text-primary" />
              <span>Guard Security Notes</span>
            </span>
            <p className="text-slate-700 mt-1 leading-relaxed">
              {log.guardNotes || 'Routine entry verified through gate terminal.'}
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
          <button 
            type="button"
            onClick={onClose} 
            className="px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Close Inspection
          </button>
        </div>
      </div>
    </div>
  );
};
