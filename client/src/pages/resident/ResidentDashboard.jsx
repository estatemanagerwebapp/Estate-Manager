import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Card, Badge } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { 
  KeyRound, 
  Plus, 
  AlertTriangle, 
  CheckCircle2, 
  Copy, 
  Share2, 
  Clock, 
  ShieldAlert,
  Building
} from 'lucide-react';

export const ResidentDashboard = () => {
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [generatedCode, setGeneratedCode] = useState(null);
  const [copied, setCopied] = useState(false);

  // Mock initial access codes
  const [codes, setCodes] = useState([
    {
      id: 'c1',
      code: '849201',
      visitorName: 'David Adeleke',
      type: 'GUEST',
      expiresAt: 'Today, 10:00 PM',
      status: 'ACTIVE'
    },
    {
      id: 'c2',
      code: '302914',
      visitorName: 'DHL Express Dispatch',
      type: 'DELIVERY',
      expiresAt: 'Expired 2h ago',
      status: 'USED'
    }
  ]);

  const isRestricted = user?.accessControlStatus === 'DISABLED';

  const handleGenerateCode = (e) => {
    e.preventDefault();
    if (isRestricted) return;

    const newCodeNum = Math.floor(100000 + Math.random() * 900000).toString();
    const newEntry = {
      id: `c_${Date.now()}`,
      code: newCodeNum,
      visitorName: visitorName || 'Guest',
      type: 'GUEST',
      expiresAt: 'In 12 Hours',
      status: 'ACTIVE'
    };

    setCodes([newEntry, ...codes]);
    setGeneratedCode(newEntry);
  };

  const copyToClipboard = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(`Your Estate Access Code is: ${generatedCode.code}. Present to security at the gate.`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Property Context Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wide">
            <Building className="w-3.5 h-3.5" />
            <span>Mansfield Estate</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Court A — Apartment 204</h2>
          <p className="text-xs text-slate-500 font-medium">Primary Residence • Resident Owner</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="danger"
            size="sm"
            className="rounded-xl shadow-xs"
            onClick={() => alert('Emergency SOS broadcast initiated to estate security dispatch.')}
          >
            <ShieldAlert className="w-4 h-4 mr-1.5" />
            SOS Alert
          </Button>

          <Button
            variant="primary"
            size="md"
            disabled={isRestricted}
            onClick={() => {
              setGeneratedCode(null);
              setVisitorName('');
              setIsModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Generate Access Code
          </Button>
        </div>
      </div>

      {/* Competitive Differentiator: Rule 11/12 Surgical Restriction Banner */}
      {isRestricted && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-300 text-amber-900 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500 text-white mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm">Guest Access Code Creation Restricted</h4>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                Your code generation privileges are temporarily suspended due to outstanding estate maintenance dues.
                <span className="font-semibold block sm:inline sm:ml-1">
                  Your resident account remains fully active so you can review dues and pay online.
                </span>
              </p>
            </div>
          </div>
          <Button variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700 whitespace-nowrap self-start md:self-center">
            Review & Pay Invoices
          </Button>
        </div>
      )}

      {/* Active Access Codes Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            <span>Active & Recent Gate Codes</span>
          </h3>
          <span className="text-xs text-slate-500 font-medium">{codes.length} Total</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {codes.map((item) => (
            <Card key={item.id} hoverable className="flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Badge variant={item.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {item.status}
                  </Badge>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {item.type}
                  </span>
                </div>

                <div className="text-2xl font-black font-mono tracking-widest text-slate-900 mb-1">
                  {item.code}
                </div>
                <div className="text-sm font-bold text-slate-700">{item.visitorName}</div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {item.expiresAt}
                </span>
                {item.status === 'ACTIVE' && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(item.code);
                      alert(`Code ${item.code} copied!`);
                    }}
                    className="text-primary hover:text-primary-600 font-semibold cursor-pointer"
                  >
                    Copy
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Code Generation Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={generatedCode ? "Access Code Ready" : "Create Visitor Access Code"}
      >
        {!generatedCode ? (
          <form onSubmit={handleGenerateCode} className="space-y-4">
            <Input
              label="Visitor Name"
              placeholder="e.g. John Doe"
              value={visitorName}
              onChange={(e) => setVisitorName(e.target.value)}
              required
            />
            <div className="text-xs text-slate-500">
              A 6-digit numeric pass code valid for 12 hours will be generated.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Generate Pass
              </Button>
            </div>
          </form>
        ) : (
          <div className="text-center space-y-4">
            <div className="p-6 bg-slate-900 rounded-2xl text-white">
              <span className="text-xs font-bold text-primary-300 uppercase tracking-widest block mb-2">
                Visitor Access Pass
              </span>
              <span className="text-4xl font-black font-mono tracking-widest">
                {generatedCode.code}
              </span>
              <p className="text-xs text-slate-400 mt-2">Valid for {generatedCode.visitorName}</p>
            </div>

            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" onClick={copyToClipboard}>
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                {copied ? 'Copied' : 'Copy Code'}
              </Button>
              <Button variant="primary" size="sm" onClick={() => {
                const text = encodeURIComponent(`Hello ${generatedCode.visitorName}, here is your gate access code for Mansfield Estate: ${generatedCode.code}`);
                window.open(`https://wa.me/?text=${text}`, '_blank');
              }}>
                <Share2 className="w-4 h-4 mr-1" />
                WhatsApp Pass
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
