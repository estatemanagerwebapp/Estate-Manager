import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { CheckCircle } from 'lucide-react';

export const AddResidentModal = ({ isOpen, onClose, onSuccess }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [unit, setUnit] = useState('Court A - A101');
  const [relationship, setRelationship] = useState('OWNER');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      setSuccessMsg(`Resident ${firstName} ${lastName} registered and linked to ${unit} successfully!`);
      setTimeout(() => {
        setSuccessMsg('');
        if (onSuccess) onSuccess();
        onClose();
      }, 1400);
    }, 500);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Resident">
      {successMsg ? (
        <div className="p-6 text-center space-y-2 animate-fadeIn">
          <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto" />
          <h4 className="font-bold text-slate-900 text-sm">{successMsg}</h4>
          <p className="text-xs text-slate-500">Welcome pack & onboarding invitation sent via email and SMS.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First Name"
              placeholder="e.g. Kola"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
            <Input
              label="Last Name"
              placeholder="e.g. Alabi"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>

          <Input
            label="Email Address"
            type="email"
            placeholder="kola.alabi@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Input
            label="Phone Number"
            placeholder="+234 803 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Assigned Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="Court A - A101">Court A - A101</option>
                <option value="Court B - B204">Court B - B204</option>
                <option value="Court C - C102">Court C - C102</option>
                <option value="Tower 1 - Penthouse">Tower 1 - Penthouse</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Resident Type</label>
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="OWNER">Property Owner</option>
                <option value="TENANT">Tenant</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading} className="bg-primary hover:bg-primary-600">
              Save Resident
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
