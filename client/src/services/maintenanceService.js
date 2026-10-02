import api from './api';

export const maintenanceService = {
  // Work Orders / Complaints
  getComplaints: async (params = {}) => {
    const res = await api.get('/complaints', { params });
    return res.data?.data?.complaints || [];
  },

  getStats: async (params = {}) => {
    const res = await api.get('/complaints/stats', { params });
    return res.data?.data || {};
  },

  createComplaint: async (data) => {
    const res = await api.post('/complaints', data);
    return res.data?.data?.complaint;
  },

  updateStatus: async (id, data) => {
    const res = await api.patch(`/complaints/${id}/status`, data);
    return res.data?.data?.complaint;
  },

  assignArtisan: async (id, data) => {
    const res = await api.patch(`/complaints/${id}/assign`, data);
    return res.data?.data?.complaint;
  },

  // Preventive Maintenance Schedules
  getSchedules: async (params = {}) => {
    const res = await api.get('/complaints/schedules', { params });
    return res.data?.data?.schedules || [];
  },

  createSchedule: async (data) => {
    const res = await api.post('/complaints/schedules', data);
    return res.data?.data?.schedule;
  },

  updateSchedule: async (id, data) => {
    const res = await api.patch(`/complaints/schedules/${id}`, data);
    return res.data?.data?.schedule;
  },

  // Artisan Directory
  getArtisans: async (params = {}) => {
    const res = await api.get('/complaints/artisans', { params });
    return res.data?.data?.artisans || [];
  },

  createArtisan: async (data) => {
    const res = await api.post('/complaints/artisans', data);
    return res.data?.data?.artisan;
  }
};
