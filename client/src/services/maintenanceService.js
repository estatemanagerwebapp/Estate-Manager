import api from './api';

export const maintenanceService = {
  // Work Orders / Complaints
  getComplaints: async (params = {}) => {
    const res = await api.get('/complaints', { params });
    return res.data?.complaints || res.complaints || (Array.isArray(res.data) ? res.data : []);
  },

  getStats: async (params = {}) => {
    const res = await api.get('/complaints/stats', { params });
    return res.data || res.stats || {};
  },

  createComplaint: async (data) => {
    const res = await api.post('/complaints', data);
    return res.data?.complaint || res.complaint || res;
  },

  updateStatus: async (id, data) => {
    const res = await api.patch(`/complaints/${id}/status`, data);
    return res.data?.complaint || res.complaint || res;
  },

  assignArtisan: async (id, data) => {
    const res = await api.patch(`/complaints/${id}/assign`, data);
    return res.data?.complaint || res.complaint || res;
  },

  // Preventive Maintenance Schedules
  getSchedules: async (params = {}) => {
    const res = await api.get('/complaints/schedules', { params });
    return res.data?.schedules || res.schedules || (Array.isArray(res.data) ? res.data : []);
  },

  createSchedule: async (data) => {
    const res = await api.post('/complaints/schedules', data);
    return res.data?.schedule || res.schedule || res;
  },

  updateSchedule: async (id, data) => {
    const res = await api.patch(`/complaints/schedules/${id}`, data);
    return res.data?.schedule || res.schedule || res;
  },

  // Artisan Directory
  getArtisans: async (params = {}) => {
    const res = await api.get('/complaints/artisans', { params });
    return res.data?.artisans || res.artisans || (Array.isArray(res.data) ? res.data : []);
  },

  createArtisan: async (data) => {
    const res = await api.post('/complaints/artisans', data);
    return res.data?.artisan || res.artisan || res;
  }
};
