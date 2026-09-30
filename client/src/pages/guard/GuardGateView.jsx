import React, { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { 
  ShieldCheck, 
  Camera, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Sun, 
  Moon,
  Car,
  UserCheck
} from 'lucide-react';

export const GuardGateView = () => {
  const [code, setCode] = useState('');
  const [highContrast, setHighContrast] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [hasPhoto, setHasPhoto] = useState(true);

  // Recent logs
  const [logs, setLogs] = useState([
    {
      id: 'l1',
      visitor: 'Chinedu Eze',
      unit: 'Court B - B102',
      plate: 'EKY-882-AA',
      time: '13:42',
      status: 'GRANTED'
    },
    {
      id: 'l2',
      visitor: 'Unknown Visitor',
      unit: '-',
      plate: 'APP-102-LK',
      time: '13:30',
      status: 'DENIED'
    }
  ]);

  const handleVerify = (e) => {
    e?.preventDefault();
    if (!code || code.length < 4) return;

    setVerifying(true);
    setVerificationResult(null);

    const startTime = Date.now();

    setTimeout(() => {
      const elapsed = Date.now() - startTime;
      if (code === '000000') {
        setVerificationResult({
          status: 'DENIED',
          reason: 'Access Code Expired or Restricted',
          speedMs: elapsed
        });
      } else {
        setVerificationResult({
          status: 'GRANTED',
          visitorName: 'David Adeleke',
          unit: 'Court A - Apartment 204',
          residentName: 'Adeola Johnson',
          residentPhone: '+234 803 123 4567',
          speedMs: elapsed
        });

        setLogs([
          {
            id: `l_${Date.now()}`,
            visitor: 'David Adeleke',
            unit: 'Court A - A204',
            plate: 'KJA-543-BC',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: 'GRANTED'
          },
          ...logs
        ]);
      }
      setVerifying(false);
    }, 450); // Simulates fast sub-500ms server response
  };

  const pressDigit = (digit) => {
    if (code.length < 6) {
      setCode(code + digit);
    }
  };

  const clearCode = () => {
    setCode('');
    setVerificationResult(null);
  };

  const bgTheme = highContrast ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-900';
  const cardTheme = highContrast ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';

  return (
    <div className={`p-4 md:p-6 rounded-3xl min-h-[85vh] transition-colors duration-200 ${bgTheme}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">Main Security Checkpoint</h1>
            <p className="text-xs text-slate-400 font-medium">Sub-5-Second Gate Verification Terminal</p>
          </div>
        </div>

        <button
          onClick={() => setHighContrast(!highContrast)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-semibold hover:bg-slate-800 transition-colors"
        >
          {highContrast ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
          <span>{highContrast ? 'Day Mode' : 'Night Gate Mode'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Verification Terminal Panel */}
        <div className="lg:col-span-7 space-y-6">
          <Card className={`p-6 border rounded-2xl ${cardTheme}`}>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 block">
              Enter 6-Digit Gate Code
            </label>

            <div className="flex gap-3 mb-4">
              <input
                type="text"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="------"
                className={`w-full py-4 text-center font-mono text-3xl font-black tracking-[0.5em] rounded-2xl border ${
                  highContrast ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
              />
              <Button
                variant="primary"
                size="lg"
                disabled={code.length < 4}
                loading={verifying}
                onClick={handleVerify}
                className="px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 font-bold"
              >
                Verify
              </Button>
            </div>

            {/* Quick Touch Numpad */}
            <div className="grid grid-cols-3 gap-2.5 max-w-sm mx-auto mb-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => pressDigit(num.toString())}
                  className={`py-3.5 text-xl font-bold font-mono rounded-xl border transition-all active:scale-95 ${
                    highContrast
                      ? 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
                  }`}
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={clearCode}
                className="py-3.5 text-sm font-bold rounded-xl border border-rose-800/50 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => pressDigit('0')}
                className={`py-3.5 text-xl font-bold font-mono rounded-xl border transition-all active:scale-95 ${
                  highContrast
                    ? 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
                }`}
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setCode(code.slice(0, -1))}
                className="py-3.5 text-sm font-bold rounded-xl border border-slate-700 bg-slate-800/50 text-slate-300"
              >
                ⌫
              </button>
            </div>

            {/* Gate Camera Verification Status */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Camera className="w-4 h-4 text-emerald-400" />
                Visitor Cam: Auto-Capture Ready
              </span>
              <button
                onClick={() => setHasPhoto(!hasPhoto)}
                className="text-indigo-400 hover:underline cursor-pointer"
              >
                {hasPhoto ? 'Photo Attached (OK)' : 'Attach Photo'}
              </button>
            </div>
          </Card>

          {/* Verification Result Banner */}
          {verificationResult && (
            <div
              className={`p-6 rounded-2xl border animate-slideDown ${
                verificationResult.status === 'GRANTED'
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-100'
                  : 'bg-rose-950/60 border-rose-500/50 text-rose-100'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {verificationResult.status === 'GRANTED' ? (
                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                  ) : (
                    <XCircle className="w-8 h-8 text-rose-400" />
                  )}
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-wider">
                      {verificationResult.status === 'GRANTED' ? 'ACCESS GRANTED' : 'ACCESS DENIED'}
                    </h3>
                    <p className="text-xs opacity-75">
                      Verified in {verificationResult.speedMs}ms (Sub-5-Second SLA Met)
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500 text-slate-950">
                  Gate Cleared
                </span>
              </div>

              {verificationResult.status === 'GRANTED' && (
                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-emerald-800/50 text-xs">
                  <div>
                    <span className="text-slate-400 block">Visitor Name</span>
                    <span className="font-bold text-sm text-white">{verificationResult.visitorName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Destination Property</span>
                    <span className="font-bold text-sm text-white">{verificationResult.unit}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Resident Host</span>
                    <span className="font-bold text-white">{verificationResult.residentName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Host Phone</span>
                    <span className="font-bold text-white">{verificationResult.residentPhone}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live Gate Feed & Queue */}
        <div className="lg:col-span-5 space-y-4">
          <Card className={`p-5 border rounded-2xl ${cardTheme}`}>
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span>Real-Time Checkpoint Stream</span>
            </h3>

            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-white">{log.visitor}</div>
                    <div className="text-slate-400">{log.unit} • {log.plate}</div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.status === 'GRANTED'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {log.status}
                    </span>
                    <div className="text-[10px] text-slate-500 mt-1">{log.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
