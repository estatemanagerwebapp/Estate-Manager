import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { CheckCircle2, Copy, Share2 } from 'lucide-react';

export const CreatePassModal = ({ isOpen, onClose, onSuccess }) => {
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [type, setType] = useState('GUEST');
  const [generatedCode, setGeneratedCode] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = (e) => {
    e.preventDefault();
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedCode({
      code,
      visitorName,
      type
    });
    if (onSuccess) onSuccess();
  };

  const copyCode = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(`EstatePro Gate Pass: ${generatedCode.code} for ${generatedCode.visitorName}. Present at gate.`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={generatedCode ? "Visitor Pass Ready" : "Create Visitor Pass"}>
      {!generatedCode ? (
        <form onSubmit={handleGenerate} className="space-y-3.5">
          <Input
            label="Visitor Full Name"
            placeholder="e.g. David Adeleke"
            value={visitorName}
            onChange={(e) => setVisitorName(e.target.value)}
            required
          />

          <Input
            label="Phone Number (Optional)"
            placeholder="+234 803 123 4567"
            value={visitorPhone}
            onChange={(e) => setVisitorPhone(e.target.value)}
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">Access Category</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="GUEST">Guest / Personal Visitor</option>
              <option value="DELIVERY">Dispatch & Delivery Rider</option>
              <option value="SERVICE">Service & Maintenance Technician</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-primary hover:bg-primary-600">
              Generate 6-Digit Pass
            </Button>
          </div>
        </form>
      ) : (
        <div className="text-center space-y-4">
          <div className="p-6 bg-slate-900 rounded-2xl text-white">
            <span className="text-xs font-bold text-primary uppercase tracking-widest block mb-2">
              EstatePro Gate Verification Pass
            </span>
            <span className="text-4xl font-black font-mono tracking-widest">
              {generatedCode.code}
            </span>
            <p className="text-xs text-slate-400 mt-2">Authorized for {generatedCode.visitorName} ({generatedCode.type})</p>
          </div>

          <div className="flex gap-2 justify-center pt-2">
            <Button variant="outline" size="sm" onClick={copyCode}>
              {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
              {copied ? 'Copied' : 'Copy Passcode'}
            </Button>
            <Button variant="primary" size="sm" onClick={() => {
              const text = encodeURIComponent(`Hello ${generatedCode.visitorName}, here is your gate access code: ${generatedCode.code}. Please present to security at the gate.`);
              window.open(`https://wa.me/?text=${text}`, '_blank');
            }}>
              <Share2 className="w-4 h-4 mr-1" />
              WhatsApp
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
