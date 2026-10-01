import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  MapPin, 
  Home, 
  User, 
  Calendar, 
  CreditCard, 
  Wrench, 
  CheckCircle2, 
  QrCode, 
  Download, 
  FileText, 
  ExternalLink, 
  MoreHorizontal, 
  Edit3, 
  ChevronDown, 
  AlertCircle,
  Folder,
  Layers,
  ShieldCheck,
  IdCard
} from 'lucide-react';
import api from '../../services/api';

export const ResidentDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('Overview');
  const [actionsOpen, setActionsOpen] = useState(false);

  // Fetch resident
  const { data: residentResponse, isLoading, error } = useQuery({
    queryKey: ['resident-details', id],
    queryFn: async () => {
      const res = await api.get(`/residents/${id}`);
      return res.data?.resident;
    }
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center shadow-card">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm font-semibold text-slate-600">Loading resident details from database...</p>
      </div>
    );
  }

  if (error || !residentResponse) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center shadow-card">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-800">Resident Not Found</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-5">
          We could not locate this resident profile in the database.
        </p>
        <button
          type="button"
          onClick={() => navigate('/admin/residents')}
          className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold cursor-pointer"
        >
          Back to Residents
        </button>
      </div>
    );
  }

  const r = residentResponse;
  const invoices = r.invoices || [];
  const documents = r.documents || [];

  const handleDownloadQR = () => {
    alert(`Downloading gate pass QR code for ${r.name} (${r.residentCode})`);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <Link to="/admin/residents" className="flex items-center gap-1 hover:text-slate-800 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Residents</span>
          </Link>
          <span>&gt;</span>
          <span className="text-slate-900 font-bold">{r.name}</span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate(`/admin/residents/new`)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-xs cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-primary" />
            <span>Edit Resident</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setActionsOpen(!actionsOpen)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-xs cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4 text-slate-500" />
              <span>Actions</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {actionsOpen && (
              <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-30">
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false);
                    handleDownloadQR();
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <QrCode className="w-3.5 h-3.5 text-slate-500" />
                  <span>Download QR</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hero Card (Matching View-residents(4.1).png) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <img
              src={r.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80'}
              alt={r.name}
              className="w-24 h-24 rounded-full object-cover border-4 border-slate-100 shadow-sm flex-shrink-0"
            />

            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{r.name}</h1>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {r.status || 'Active'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{r.email}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{r.phone}</span>
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-600 border border-purple-200/80">
                  {r.tenancyType || 'Owner'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>{r.estate?.name || 'Sunrise Estate'}, {r.estate?.city || 'Lekki'}, {r.estate?.state || 'Lagos'}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Home className="w-3.5 h-3.5 text-slate-400" />
                  <span>Unit {r.unit?.displayIdentifier || 'A1-01'} ({r.unit?.subtype || '3 Bedroom Apartment'})</span>
                </span>
              </div>
            </div>
          </div>

          {/* Right 3 Chips */}
          <div className="flex items-center gap-3 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-100">
            <div className="px-4 py-3 rounded-xl bg-slate-50/80 border border-slate-200/80 text-center min-w-[100px]">
              <p className="text-[10px] text-slate-400 font-semibold uppercase">Resident ID</p>
              <p className="text-xs font-extrabold text-slate-900 mt-0.5">{r.residentCode || 'RES-001'}</p>
            </div>

            <div className="px-4 py-3 rounded-xl bg-slate-50/80 border border-slate-200/80 text-center min-w-[100px]">
              <p className="text-[10px] text-slate-400 font-semibold uppercase">Move In Date</p>
              <p className="text-xs font-extrabold text-slate-900 mt-0.5">{r.moveInDate || 'Jan 12, 2025'}</p>
            </div>

            <div className="px-4 py-3 rounded-xl bg-slate-50/80 border border-slate-200/80 text-center min-w-[100px]">
              <p className="text-[10px] text-slate-400 font-semibold uppercase">Member Since</p>
              <p className="text-xs font-extrabold text-slate-900 mt-0.5">{r.memberSince || 'Jan 8, 2025'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex items-center gap-8 overflow-x-auto no-scrollbar">
          {[
            'Overview',
            'Unit & Lease',
            'Invoices & Payments',
            'Dues & Fees',
            'Gate Access',
            'Maintenance',
            'Documents',
            'Visitors',
            'Activity Log'
          ].map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`text-sm font-semibold whitespace-nowrap pb-3 transition-colors relative cursor-pointer ${
                  isActive ? 'text-primary' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Overview Tab Content */}
      {activeTab === 'Overview' && (
        <div className="space-y-6">
          {/* 4 Highlight Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Payment Status */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Payment Status</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xl font-bold text-slate-900">{r.paymentStatus || 'Up to Date'}</span>
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-xs text-slate-400 mt-1">{r.paymentStatusSub || 'No outstanding payments'}</p>
            </div>

            {/* Next Due Date */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Next Due Date</p>
              <h3 className="text-xl font-bold text-slate-900 mt-1">{r.nextDueDate || 'Oct 5, 2026'}</h3>
              <p className="text-xs text-primary font-semibold mt-1">
                Monthly Rent - ₦{(r.monthlyRent || 50000).toLocaleString()}
              </p>
            </div>

            {/* Total Payments */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Payments</p>
              <h3 className="text-xl font-bold text-slate-900 mt-1">
                ₦{(r.totalPayments || 300000).toLocaleString()}
              </h3>
              <p className="text-xs text-slate-400 mt-1">Last payment: {r.lastPaymentDate || 'Sep 5, 2026'}</p>
            </div>

            {/* Open Requests */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Open Requests</p>
              <h3 className="text-xl font-bold text-slate-900 mt-1">{r.openRequests ?? 1}</h3>
              <p className="text-xs text-slate-400 mt-1">1 pending maintenance</p>
            </div>
          </div>

          {/* Grid Layout: Main (8 cols) + Right (4 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Main Column */}
            <div className="lg:col-span-8 space-y-6">
              {/* Personal Information & Unit Information Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Personal Information */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">Personal Information</h3>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Full Name</span>
                      <span className="font-bold text-slate-900">{r.name}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Email Address</span>
                      <span className="font-semibold text-primary">{r.email}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Phone Number</span>
                      <span className="font-semibold text-slate-800">{r.phone}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Date of Birth</span>
                      <span className="font-semibold text-slate-800">{r.dateOfBirth}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Identification Type</span>
                      <span className="font-semibold text-slate-800">{r.identificationType || 'National ID'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">ID Number</span>
                      <span className="font-semibold text-slate-800">{r.idNumber || '1234 5678 9012'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Emergency Contact</span>
                      <span className="font-semibold text-slate-800 text-right">{r.emergencyContact}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Address</span>
                      <span className="font-semibold text-slate-800">{r.address || 'Lekki, Lagos, Nigeria'}</span>
                    </div>
                  </div>
                </div>

                {/* Unit Information */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-primary">
                      <Home className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">Unit Information</h3>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Estate</span>
                      <span className="font-bold text-slate-900">{r.estate?.name || 'Sunrise Estate'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Unit</span>
                      <span className="font-bold text-slate-900">{r.unit?.displayIdentifier || 'A1-01'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Unit Type</span>
                      <span className="font-semibold text-slate-800">{r.unit?.type || 'Apartment'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Bedrooms</span>
                      <span className="font-semibold text-slate-800">{r.unit?.bedrooms ?? 3}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Parking Slots</span>
                      <span className="font-semibold text-slate-800">{r.unit?.parkingSlots ?? 2}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Move In Date</span>
                      <span className="font-semibold text-slate-800">{r.moveInDate || 'Jan 12, 2025'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Lease End Date</span>
                      <span className="font-semibold text-primary">{r.leaseEndDate || 'Jan 11, 2026'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Tenancy Type</span>
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-600 border border-purple-200/80">
                        {r.tenancyType || 'Owner'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Invoices Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">Recent Invoices</h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('Invoices & Payments')}
                    className="text-xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    View All
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="py-2.5 px-3">Invoice #</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Amount</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Due Date</th>
                        <th className="py-2.5 px-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-slate-900">{inv.invoiceNumber}</td>
                          <td className="py-2.5 px-3 text-slate-700">{inv.title}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">₦{inv.amount.toLocaleString()}</td>
                          <td className="py-2.5 px-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              inv.status === 'PAID'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-orange-50 text-primary border border-orange-200'
                            }`}>
                              {inv.status === 'PAID' ? 'Paid' : 'Pending'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {new Date(inv.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button type="button" className="p-1 rounded text-slate-400 hover:text-slate-700">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: QR Code & Documents */}
            <div className="lg:col-span-4 space-y-6">
              {/* Resident QR Code Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 text-center">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <h3 className="text-sm font-bold text-slate-900">Resident QR Code</h3>
                  <QrCode className="w-4 h-4 text-primary" />
                </div>

                {/* QR Vector Frame */}
                <div className="w-44 h-44 mx-auto p-3 rounded-2xl bg-white border-2 border-slate-200 shadow-xs flex items-center justify-center relative">
                  <div className="w-full h-full flex flex-col justify-between p-1 bg-slate-900 rounded-xl relative overflow-hidden">
                    {/* SVG Stylized QR Matrix */}
                    <svg viewBox="0 0 100 100" className="w-full h-full text-white fill-current">
                      <rect x="5" y="5" width="25" height="25" fill="#fff" rx="4" />
                      <rect x="9" y="9" width="17" height="17" fill="#0f172a" rx="2" />
                      <rect x="13" y="13" width="9" height="9" fill="#FF5A1F" rx="1" />
                      
                      <rect x="70" y="5" width="25" height="25" fill="#fff" rx="4" />
                      <rect x="74" y="9" width="17" height="17" fill="#0f172a" rx="2" />
                      <rect x="78" y="13" width="9" height="9" fill="#FF5A1F" rx="1" />
                      
                      <rect x="5" y="70" width="25" height="25" fill="#fff" rx="4" />
                      <rect x="9" y="74" width="17" height="17" fill="#0f172a" rx="2" />
                      <rect x="13" y="78" width="9" height="9" fill="#FF5A1F" rx="1" />

                      <rect x="35" y="15" width="8" height="8" fill="#fff" />
                      <rect x="47" y="15" width="8" height="8" fill="#fff" />
                      <rect x="35" y="35" width="8" height="8" fill="#fff" />
                      <rect x="47" y="35" width="8" height="8" fill="#fff" />
                      <rect x="60" y="45" width="8" height="8" fill="#fff" />
                      <rect x="35" y="60" width="8" height="8" fill="#fff" />
                      <rect x="50" y="60" width="8" height="8" fill="#fff" />
                      <rect x="75" y="60" width="8" height="8" fill="#fff" />
                      <rect x="65" y="75" width="8" height="8" fill="#fff" />
                    </svg>
                  </div>
                </div>

                <p className="text-xs font-bold text-slate-800 mt-3">{r.residentCode || 'RES-001'}</p>
                <p className="text-[11px] text-slate-500">{r.name}</p>

                <button
                  type="button"
                  onClick={handleDownloadQR}
                  className="w-full mt-4 py-2.5 px-4 rounded-xl bg-orange-50 hover:bg-orange-100 text-primary text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download QR Code</span>
                </button>
              </div>

              {/* Documents Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                  <h3 className="text-sm font-bold text-slate-900">Documents</h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('Documents')}
                    className="text-xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    View All
                  </button>
                </div>

                <div className="space-y-2.5">
                  {documents.map((doc, idx) => {
                    const colorClass = doc.color === 'red' ? 'text-rose-500 bg-rose-50' :
                      doc.color === 'blue' ? 'text-blue-500 bg-blue-50' :
                      doc.color === 'green' ? 'text-emerald-500 bg-emerald-50' :
                      'text-purple-500 bg-purple-50';

                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/70 hover:border-slate-300 transition-colors bg-slate-50/40"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClass}`}>
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-800 truncate">{doc.name}</h4>
                            <p className="text-[10px] text-slate-400">{doc.uploadedAt}</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => alert(`Downloading ${doc.name}`)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Other tabs fallback */}
      {activeTab !== 'Overview' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-card">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-primary flex items-center justify-center mx-auto mb-3">
            <Layers className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-base font-bold text-slate-900">{activeTab} for {r.name}</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            Real-time live resident records from Supabase database.
          </p>
        </div>
      )}
    </div>
  );
};
