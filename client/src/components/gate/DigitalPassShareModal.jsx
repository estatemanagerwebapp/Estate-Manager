import React, { useState, useEffect } from 'react';
import { 
  X, 
  Share2, 
  Copy, 
  Check, 
  Download, 
  Printer, 
  Building, 
  Clock, 
  User, 
  Home, 
  ShieldCheck 
} from 'lucide-react';

export const DigitalPassShareModal = ({ isOpen, onClose, passData }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !passData) return null;

  const rawCode = passData.rawCode || '000000';
  const formattedCode = passData.formattedCode || `${rawCode.slice(0, 3)} - ${rawCode.slice(3)}`;
  const pass = passData.pass || {};
  const estateName = pass.estate?.name || 'Sunrise Estate';
  const estateAddress = pass.estate?.address || 'Plot 12, Admiralty Way, Lekki Phase 1, Lagos';
  const unitIdentifier = pass.property?.displayIdentifier || 'Unit A1';
  const visitorName = pass.visitorName || 'Visitor';
  const expiresAt = pass.expiresAt ? new Date(pass.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '11:59 PM';

  const shareText = `Hi ${visitorName}, here is your gate access pass for ${estateName} (${unitIdentifier}). Code: ${rawCode}. Valid until ${expiresAt}. Show this code to gate security upon arrival.`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsAppShare = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200/80 animate-in zoom-in-95 duration-200 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button 
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Card Header */}
        <div className="text-center pt-2 pb-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary mx-auto mb-2 shadow-xs">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 mb-1">
            GATE PASS ACTIVE
          </span>
          <h3 className="text-lg font-black text-slate-900">{estateName}</h3>
          <p className="text-[11px] text-slate-500 max-w-xs mx-auto truncate">{estateAddress}</p>
        </div>

        {/* Big Code Box */}
        <div className="bg-orange-50/70 border-2 border-dashed border-primary/40 rounded-2xl p-4 text-center mb-4">
          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Gate Access OTP</p>
          <div className="text-3xl font-mono font-black text-primary tracking-widest">
            {formattedCode}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Read or show this code to security</p>
        </div>

        {/* SVG QR Code Simulation */}
        <div className="w-36 h-36 mx-auto bg-slate-50 border border-slate-200 rounded-2xl p-2.5 flex flex-col items-center justify-center mb-4 shadow-xs">
          <svg className="w-28 h-28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="100" height="100" fill="white"/>
            <rect x="10" y="10" width="24" height="24" rx="4" fill="#0f172a"/>
            <rect x="14" y="14" width="16" height="16" rx="2" fill="white"/>
            <rect x="18" y="18" width="8" height="8" rx="1" fill="#FF5A1F"/>
            <rect x="66" y="10" width="24" height="24" rx="4" fill="#0f172a"/>
            <rect x="70" y="14" width="16" height="16" rx="2" fill="white"/>
            <rect x="74" y="18" width="8" height="8" rx="1" fill="#FF5A1F"/>
            <rect x="10" y="66" width="24" height="24" rx="4" fill="#0f172a"/>
            <rect x="14" y="70" width="16" height="16" rx="2" fill="white"/>
            <rect x="18" y="74" width="8" height="8" rx="1" fill="#FF5A1F"/>
            <rect x="42" y="12" width="6" height="6" fill="#0f172a"/>
            <rect x="52" y="12" width="6" height="6" fill="#0f172a"/>
            <rect x="42" y="24" width="6" height="6" fill="#0f172a"/>
            <rect x="52" y="34" width="6" height="6" fill="#0f172a"/>
            <rect x="12" y="44" width="6" height="6" fill="#0f172a"/>
            <rect x="24" y="44" width="6" height="6" fill="#0f172a"/>
            <rect x="42" y="44" width="16" height="16" rx="2" fill="#FF5A1F"/>
            <rect x="66" y="44" width="6" height="6" fill="#0f172a"/>
            <rect x="78" y="44" width="6" height="6" fill="#0f172a"/>
            <rect x="42" y="68" width="6" height="6" fill="#0f172a"/>
            <rect x="52" y="78" width="6" height="6" fill="#0f172a"/>
            <rect x="66" y="68" width="6" height="6" fill="#0f172a"/>
            <rect x="78" y="78" width="6" height="6" fill="#0f172a"/>
          </svg>
          <span className="text-[9px] text-slate-400 font-semibold mt-1">Touchless Gate Scanner</span>
        </div>

        {/* Pass Details List */}
        <div className="bg-slate-50 rounded-2xl p-3.5 text-xs space-y-2 border border-slate-100 mb-5">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Visitor</span>
            <span className="font-bold text-slate-800">{visitorName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Destination</span>
            <span className="font-bold text-slate-800">{unitIdentifier}</span>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-slate-200">
            <span className="text-slate-400">Expires At</span>
            <span className="font-bold text-rose-600">{expiresAt}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleWhatsAppShare}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>Share Pass via WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="w-full py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-bold">Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Copy Pass Message</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="w-full py-2 text-slate-500 hover:text-slate-800 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print or Save as PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
