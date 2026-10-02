import api from './api';

export const duesService = {
  // Fetch fee schedules and real-time financial KPIs
  getDuesKPIsAndSchedules: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.estateId && params.estateId !== 'all') searchParams.append('estateId', params.estateId);
    const res = await api.get(`/dues/schedules?${searchParams.toString()}`);
    return res.data;
  },

  // Fetch unit-by-unit compliance ledger
  getUnitComplianceLedger: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.estateId && params.estateId !== 'all') searchParams.append('estateId', params.estateId);
    if (params.status && params.status !== 'ALL' && params.status !== 'all') searchParams.append('status', params.status);
    if (params.search && params.search.trim()) searchParams.append('search', params.search.trim());
    if (params.page) searchParams.append('page', params.page);
    if (params.limit) searchParams.append('limit', params.limit);

    const res = await api.get(`/dues/ledger?${searchParams.toString()}`);
    return res.data;
  },

  // Create a new fee schedule / recurring levy
  createFeeSchedule: async (payload) => {
    return await api.post('/dues/schedules', payload);
  },

  // Batch assess dues across all properties in estate
  batchAssessDues: async (payload) => {
    return await api.post('/dues/assess', payload);
  },

  // Send WhatsApp/SMS reminder
  sendDuesReminder: async (payload) => {
    return await api.post('/dues/remind', payload);
  }
};

export default duesService;
