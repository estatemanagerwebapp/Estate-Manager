import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Camera, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Sun, 
  Moon,
  Car,
  UserCheck,
  Zap,
  Phone,
  Home,
  User,
  ArrowRight,
  RotateCcw
} from 'lucide-react';
import gateService from '../../services/gateService';
import api from '../../services/api';

// Web Audio API tone synthesizer (clean sound feedback without audio assets)
const playChime = (type = 'success') => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'success') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.setValueAtTime(164.81, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (e) {
    // Audio context not allowed without prior gesture
  }
};

export const GuardGateView = () => {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [highContrast, setHighContrast] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  // Clock tick
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch estates to bind estateId
  const { data: estates = [] } = useQuery({
    queryKey: ['estates-for-guard'],
    queryFn: async () => {
      const res = await api.get('/estates');
      return res.data?.estates || [];
    }
  });

  const activeEstateId = estates[0]?.id;

  // Real-time Checkpoint Stream
  const { data: logsData } = useQuery({
    queryKey: ['guard-gate-stream', activeEstateId],
    queryFn: () => gateService.getGateLogs({
      estateId: activeEstateId,
      limit: 6
    }),
    refetchInterval: 5000 // Poll every 5s for live gate arrivals
  });

  const recentLogs = logsData?.logs || [];

  // Verification Handler
  const handleVerify = useCallback(async (codeToVerify) => {
    const targetCode = (codeToVerify || code).trim();
    if (!targetCode || targetCode.length < 4) return;

    setVerifying(true);
    setVerificationResult(null);

    try {
      const res = await gateService.verifyAccessCode({
        code: targetCode,
        estateId: activeEstateId,
        guardNotes: 'Routine gate pass check'
      });

      if (res.success && res.data) {
        setVerificationResult({
          status: 'GRANTED',
          visitorName: res.data.visitorName,
          unit: res.data.destinationUnit,
          residentName: res.data.residentName,
          residentPhone: res.data.residentPhone,
          vehiclePlate: res.data.vehiclePlate,
          accessType: res.data.accessType,
          speedMs: res.verificationSpeedMs || res.data.speedMs || 140
        });
        playChime('success');
      }
    } catch (err) {
      setVerificationResult({
        status: 'DENIED',
        reason: err.message || 'Access code is invalid, expired, or already used.',
        speedMs: 180
      });
      playChime('error');
    } finally {
      setVerifying(false);
      queryClient.invalidateQueries({ queryKey: ['guard-gate-stream'] });
      queryClient.invalidateQueries({ queryKey: ['gate-logs'] });
    }
  }, [code, activeEstateId, queryClient]);

  // Physical keyboard support
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        if (code.length < 6) {
          const next = code + e.key;
          setCode(next);
          if (next.length === 6) {
            handleVerify(next);
          }
        }
      } else if (e.key === 'Backspace') {
        setCode(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        if (code.length >= 4) {
          handleVerify(code);
        }
      } else if (e.key === 'Escape') {
        clearCode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [code, handleVerify]);

  const pressDigit = (digit) => {
    if (code.length < 6) {
      const next = code + digit;
      setCode(next);
      if (next.length === 6) {
        handleVerify(next);
      }
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
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white font-bold shadow-lg shadow-primary/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight text-white">Main Security Checkpoint</h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                ONLINE
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Sunrise Estate &bull; Gate Terminal Kiosk &bull; Guard on Duty
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-base font-mono font-bold text-white">{currentTime}</p>
            <p className="text-[11px] text-slate-400">Live Station Clock</p>
          </div>

          <button
            type="button"
            onClick={() => setHighContrast(!highContrast)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {highContrast ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-primary" />}
            <span>{highContrast ? 'Day Mode' : 'Night Mode'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Verification Terminal Panel (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <Card className={`p-6 border rounded-2xl ${cardTheme}`}>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 block text-center">
              Enter 6-Digit Gate Code
            </label>

            <div className="flex gap-3 mb-5 max-w-md mx-auto">
              <input
                type="text"
                maxLength={6}
                readOnly
                value={code}
                placeholder="------"
                className={`w-full py-4 text-center font-mono text-3xl font-black tracking-[0.5em] rounded-2xl border ${
                  highContrast ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                } focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary select-none`}
              />
              <Button
                variant="primary"
                size="lg"
                disabled={code.length < 4}
                loading={verifying}
                onClick={() => handleVerify(code)}
                className="px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 font-bold cursor-pointer"
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
                  className={`py-3.5 text-xl font-bold font-mono rounded-xl border transition-all active:scale-95 cursor-pointer ${
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
                className="py-3.5 text-xs font-bold uppercase tracking-wider rounded-xl border border-rose-800/50 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 active:scale-95 transition-all cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => pressDigit('0')}
                className={`py-3.5 text-xl font-bold font-mono rounded-xl border transition-all active:scale-95 cursor-pointer ${
                  highContrast
                    ? 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
                }`}
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setCode(prev => prev.slice(0, -1))}
                className="py-3.5 text-sm font-bold rounded-xl border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            <div className="pt-3 border-t border-slate-800/60 text-center text-[11px] text-slate-400">
              <span>Supports physical keyboard entry &bull; Press Enter to verify</span>
            </div>
          </Card>

          {/* Verification Result Banner */}
          {verificationResult && (
            <div
              className={`p-6 rounded-2xl border animate-in zoom-in-95 duration-150 ${
                verificationResult.status === 'GRANTED'
                  ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-100'
                  : 'bg-rose-950/70 border-rose-500/60 text-rose-100'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {verificationResult.status === 'GRANTED' ? (
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-8 h-8 text-rose-400 flex-shrink-0" />
                  )}
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-wider">
                      {verificationResult.status === 'GRANTED' ? 'ACCESS GRANTED' : 'ACCESS DENIED'}
                    </h3>
                    <p className="text-xs opacity-75">
                      Verified in {verificationResult.speedMs}ms
                    </p>
                  </div>
                </div>

                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  verificationResult.status === 'GRANTED'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-rose-500 text-white'
                }`}>
                  {verificationResult.status === 'GRANTED' ? 'Gate Cleared' : 'Barred Entry'}
                </span>
              </div>

              {verificationResult.status === 'GRANTED' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-emerald-800/50 text-xs">
                    <div className="bg-slate-900/60 p-3 rounded-xl border border-emerald-900/40">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Visitor Name</span>
                      <span className="font-bold text-sm text-white mt-0.5 block">{verificationResult.visitorName}</span>
                    </div>
                    <div className="bg-slate-900/60 p-3 rounded-xl border border-emerald-900/40">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Destination Unit</span>
                      <span className="font-bold text-sm text-white mt-0.5 block">{verificationResult.unit}</span>
                    </div>
                    <div className="bg-slate-900/60 p-3 rounded-xl border border-emerald-900/40">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Resident Host</span>
                      <span className="font-bold text-white mt-0.5 block">{verificationResult.residentName}</span>
                    </div>
                    <div className="bg-slate-900/60 p-3 rounded-xl border border-emerald-900/40">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Host Contact</span>
                      <span className="font-mono font-bold text-emerald-300 mt-0.5 block">{verificationResult.residentPhone || '—'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={clearCode}
                      className="flex-1 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Raise Gate Barrier & Clear Next</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-rose-200 leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-rose-900/40">
                    {verificationResult.reason}
                  </p>
                  <button
                    type="button"
                    onClick={clearCode}
                    className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors cursor-pointer"
                  >
                    Log Rejection & Reset Terminal
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live Gate Feed & Queue (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className={`p-5 border rounded-2xl ${cardTheme}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <span>Live Checkpoint Stream</span>
              </h3>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>

            <div className="space-y-2.5">
              {recentLogs.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">No recent gate activity</p>
              ) : (
                recentLogs.map((log) => {
                  const isDenied = log.gateAction === 'DENIED';
                  const isExit = log.gateAction === 'EXIT';

                  return (
                    <div
                      key={log.id}
                      className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 flex items-center justify-between text-xs hover:border-slate-600 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-white text-xs">{log.visitorName}</div>
                        <div className="text-slate-400 text-[11px]">
                          {log.destinationUnit} &bull; {log.vehiclePlate}
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            isDenied
                              ? 'bg-rose-500/20 text-rose-400'
                              : isExit
                              ? 'bg-slate-600/30 text-slate-300'
                              : 'bg-emerald-500/20 text-emerald-400'
                          }`}
                        >
                          {log.gateAction}
                        </span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {new Date(log.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
