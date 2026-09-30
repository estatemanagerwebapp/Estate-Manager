import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { QrCode, CheckCircle, XCircle, ShieldCheck } from 'lucide-react';
import api from '../../services/api';

export const QuickGateModal = ({ isOpen, onClose, onVerified }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleVerify = async (e) => {
    e?.preventDefault();
    if (!code) return;
    setLoading(true);
    setResult(null);

    try {
      // Simulate fast verification against gate engine
      setTimeout(() => {
        if (code === '000000') {
          setResult({
            success: false,
            message: 'Access Code Expired or Restricted'
          });
        } else {
          setResult({
            success: true,
            visitorName: 'David Adeleke',
            unit: 'Court A - A204',
            action: 'ENTRY GRANTED'
          });
          if (onVerified) onVerified();
        }
        setLoading(false);
      }, 400);
    } catch (err) {
      setResult({ success: false, message: err.message || 'Verification failed' });
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Quick Gate Checkpoint">
      <div className="space-y-4">
        {/* Simulated Camera Scanner Window */}
        <div className="w-full h-44 rounded-2xl bg-slate-900 border-2 border-dashed border-orange-500/40 relative overflow-hidden flex flex-col items-center justify-center p-4 text-center">
          <div className="w-20 h-20 rounded-2xl border-2 border-primary animate-pulse flex items-center justify-center mb-2">
            <QrCode className="w-10 h-10 text-primary" />
          </div>
          <p className="text-xs text-slate-300 font-medium">Position Visitor QR Code in frame</p>
          <span className="text-[10px] text-slate-500 mt-1">or enter 6-digit gate code below</span>
        </div>

        {/* Verification Result */}
        {result && (
          <div className={`p-4 rounded-xl border flex items-center gap-3 animate-fadeIn ${
            result.success 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {result.success ? (
              <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0" />
            ) : (
              <XCircle className="w-6 h-6 text-rose-600 flex-shrink-0" />
            )}
            <div className="text-xs">
              <div className="font-bold">{result.success ? result.action : 'ACCESS DENIED'}</div>
              <div>{result.success ? `${result.visitorName} • ${result.unit}` : result.message}</div>
            </div>
          </div>
        )}

        {/* Code Input */}
        <form onSubmit={handleVerify} className="space-y-3">
          <Input
            label="Manual 6-Digit Passcode"
            placeholder="e.g. 849201"
            value={code}
            maxLength={6}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="text-center font-mono text-xl tracking-widest font-bold"
          />

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" loading={loading} disabled={code.length < 4} className="bg-primary hover:bg-primary-600">
              <ShieldCheck className="w-4 h-4 mr-1.5" />
              Verify Pass
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
