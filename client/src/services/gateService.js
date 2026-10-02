import api from './api';

export const gateService = {
  // Fetch verification logs with filtering & KPIs
  getGateLogs: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.estateId && params.estateId !== 'all') searchParams.append('estateId', params.estateId);
    if (params.action && params.action !== 'ALL' && params.action !== 'all') searchParams.append('action', params.action);
    if (params.search && params.search.trim()) searchParams.append('search', params.search.trim());
    if (params.page) searchParams.append('page', params.page);
    if (params.limit) searchParams.append('limit', params.limit);

    const res = await api.get(`/gate/logs?${searchParams.toString()}`);
    return res.data || res;
  },

  // Guard verification request
  verifyAccessCode: async (payload) => {
    return await api.post('/gate/verify', payload);
  },

  // Active passes registry
  getGatePasses: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.estateId && params.estateId !== 'all') searchParams.append('estateId', params.estateId);
    if (params.status && params.status !== 'all') searchParams.append('status', params.status);
    if (params.search && params.search.trim()) searchParams.append('search', params.search.trim());

    const res = await api.get(`/gate/passes?${searchParams.toString()}`);
    return res.data?.passes || res.passes || (Array.isArray(res.data) ? res.data : []);
  },

  // Issue new visitor pass
  createGatePass: async (payload) => {
    const res = await api.post('/gate/passes', payload);
    return res.data || res;
  },

  // Revoke pass
  revokeGatePass: async (id) => {
    return await api.patch(`/gate/passes/${id}/revoke`);
  },

  // Log departure checkout
  checkoutVisitor: async (payload) => {
    const res = await api.post('/gate/checkout', payload);
    return res.data || res;
  },

  // Watchlist registry
  getWatchlist: async () => {
    const res = await api.get('/gate/watchlist');
    return res.data?.watchlist || res.watchlist || [];
  },

  // Add to Watchlist
  addToWatchlist: async (payload) => {
    const res = await api.post('/gate/watchlist', payload);
    return res.data || res;
  }
};

export default gateService;
