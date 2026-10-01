import React, { useState } from 'react';
import { Card, Badge } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { 
  ShieldAlert, 
  Building2, 
  Users, 
  KeyRound, 
  Search,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

export const SuperAdminDashboard = () => {
  const [residents, setResidents] = useState([
    {
      id: 'res_1',
      name: 'Adeola Johnson',
      email: 'resident@estatemanager.io',
      estate: 'Mansfield Estate',
      unit: 'Court A - A204',
      arrears: '₦85,000',
      accessControlStatus: 'ENABLED'
    },
    {
      id: 'res_2',
      name: 'Babatunde Fashola',
      email: 'babatunde@lagos.ng',
      estate: 'Eko Atlantic Heights',
      unit: 'Tower 3 - Penthouse 12',
      arrears: '₦0',
      accessControlStatus: 'ENABLED'
    },
    {
      id: 'res_3',
      name: 'Emeka Okafor',
      email: 'emeka@gmail.com',
      estate: 'Mansfield Estate',
      unit: 'Court C - C101',
      arrears: '₦142,500',
      accessControlStatus: 'DISABLED'
    }
  ]);

  const [search, setSearch] = useState('');
  const [selectedResident, setSelectedResident] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState('Unpaid Q3/Q4 estate service charge arrears exceeding 60-day grace period.');

  const filteredResidents = residents.filter(r => 
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.estate.toLowerCase().includes(search.toLowerCase()) ||
    r.unit.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggleRestriction = (resident) => {
    setSelectedResident(resident);
    setModalOpen(true);
  };

  const confirmAction = () => {
    if (!selectedResident) return;

    setResidents(residents.map(r => {
      if (r.id === selectedResident.id) {
        const nextStatus = r.accessControlStatus === 'ENABLED' ? 'DISABLED' : 'ENABLED';
        return { ...r, accessControlStatus: nextStatus };
      }
      return r;
    }));

    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Global Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">14</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Managed Estates</div>
          </div>
        </Card>

        <Card className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">4,820</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Residents</div>
          </div>
        </Card>

        <Card className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-50/70 border border-orange-100/60 flex items-center justify-center text-primary">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">18,340</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Monthly Gate Passes</div>
          </div>
        </Card>

        <Card className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-rose-600">12</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Restricted Codes (Rule 11)</div>
          </div>
        </Card>
      </div>

      {/* Super Admin Competitive Engine: Surgical Access Code Restriction Console */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" />
              <span>Surgical Debt-Enforcement Console (Rules 11, 12, 13)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Disable gate pass issuance for defaulters without account lockout or blocking payments.
            </p>
          </div>

          <div className="w-full sm:w-64">
            <Input
              placeholder="Search resident, estate, unit..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* High-density Residents Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Resident</th>
                <th className="px-4 py-3">Estate / Property</th>
                <th className="px-4 py-3">Outstanding Dues</th>
                <th className="px-4 py-3">Gate Code Status</th>
                <th className="px-4 py-3 text-right">Super Admin Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredResidents.map((r) => {
                const isRestricted = r.accessControlStatus === 'DISABLED';
                return (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{r.name}</div>
                      <div className="text-slate-400 text-[11px]">{r.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{r.estate}</div>
                      <div className="text-slate-500">{r.unit}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-mono font-bold ${r.arrears !== '₦0' ? 'text-rose-600' : 'text-slate-700'}`}>
                        {r.arrears}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={isRestricted ? 'danger' : 'success'}>
                        {isRestricted ? 'RESTRICTED' : 'ENABLED'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant={isRestricted ? 'secondary' : 'danger'}
                        onClick={() => handleToggleRestriction(r)}
                      >
                        {isRestricted ? 'Re-enable Codes' : 'Restrict Code Generation'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Confirmation Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={selectedResident?.accessControlStatus === 'ENABLED' ? 'Restrict Code Generation' : 'Restore Code Generation'}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            {selectedResident?.accessControlStatus === 'ENABLED'
              ? `You are applying a surgical restriction on ${selectedResident?.name}. They will NOT be able to generate visitor codes, but they CAN still log in, review invoices, and make online payments.`
              : `Restore guest code generation rights for ${selectedResident?.name}?`}
          </p>

          {selectedResident?.accessControlStatus === 'ENABLED' && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Reason / Justification (Logged to Audit Trail)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={selectedResident?.accessControlStatus === 'ENABLED' ? 'danger' : 'primary'}
              onClick={confirmAction}
            >
              Confirm Update
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
