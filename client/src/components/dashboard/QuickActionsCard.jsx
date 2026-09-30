import React, { useState } from 'react';
import { 
  UserPlus, 
  FileText, 
  CreditCard, 
  ShieldCheck, 
  DoorOpen, 
  Wrench, 
  ChevronRight, 
  ChevronUp, 
  ChevronDown 
} from 'lucide-react';

export const QuickActionsCard = ({ onAction }) => {
  const [collapsed, setCollapsed] = useState(false);

  const actions = [
    { id: 'add-resident', label: 'Add Resident', icon: UserPlus },
    { id: 'generate-invoice', label: 'Generate Invoice', icon: FileText },
    { id: 'record-payment', label: 'Record Payment', icon: CreditCard },
    { id: 'create-pass', label: 'Create Visitor Pass', icon: ShieldCheck },
    { id: 'remote-gate', label: 'Open Gate Remotely', icon: DoorOpen },
    { id: 'maintenance-request', label: 'Log Maintenance Request', icon: Wrench },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
      {/* Orange Collapsible Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full bg-primary hover:bg-primary-600 transition-colors px-5 py-4 flex items-center justify-between text-white font-bold text-sm tracking-wide cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-base font-extrabold">+</span>
          <span>Quick Action</span>
        </div>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-white/80" />
        ) : (
          <ChevronUp className="w-4 h-4 text-white/80" />
        )}
      </button>

      {/* Action items list */}
      {!collapsed && (
        <div className="divide-y divide-slate-100 p-2">
          {actions.map((act) => {
            const Icon = act.icon;
            return (
              <button
                key={act.id}
                onClick={() => onAction && onAction(act.id)}
                className="w-full px-4 py-3 rounded-xl hover:bg-orange-50/60 transition-colors flex items-center justify-between text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 group-hover:bg-white border border-slate-200/60 flex items-center justify-center text-slate-600 group-hover:text-primary transition-colors">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-700 group-hover:text-slate-900 transition-colors">
                    {act.label}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
