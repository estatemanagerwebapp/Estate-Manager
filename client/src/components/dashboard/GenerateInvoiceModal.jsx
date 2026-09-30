import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { CheckCircle } from 'lucide-react';

export const GenerateInvoiceModal = ({ isOpen, onClose, onSuccess }) => {
  const [resident, setResident] = useState('Amaka Okafor (A1-02)');
  const [title, setTitle] = useState('Monthly Estate Service Charge & Security');
  const [amount, setAmount] = useState('120000');
  const [dueDate, setDueDate] = useState('2026-10-31');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        if (onSuccess) onSuccess();
        onClose();
      }, 1300);
    }, 450);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Generate New Invoice">
      {success ? (
        <div className="p-6 text-center space-y-2 animate-fadeIn">
          <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto" />
          <h4 className="font-bold text-slate-900 text-sm">Invoice Generated & Sent!</h4>
          <p className="text-xs text-slate-500">Invoice notification and payment link delivered to {resident}.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">Resident / Unit</label>
            <select
              value={resident}
              onChange={(e) => setResident(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="Amaka Okafor (A1-02)">Amaka Okafor (A1-02)</option>
              <option value="Daniel Musa (B2-05)">Daniel Musa (B2-05)</option>
              <option value="Chinedu Nwosu (C1-01)">Chinedu Nwosu (C1-01)</option>
              <option value="Fatima Bello (A3-04)">Fatima Bello (A3-04)</option>
              <option value="Ibrahim Lawal (B1-03)">Ibrahim Lawal (B1-03)</option>
            </select>
          </div>

          <Input
            label="Invoice Title / Description"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Amount (₦)"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <Input
              label="Due Date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading} className="bg-primary hover:bg-primary-600">
              Generate & Dispatch
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
