import api from './api';

export const billingService = {
  getInvoices: async (params = {}) => {
    const res = await api.get('/billing/invoices', { params });
    return res.data;
  },

  getInvoiceById: async (id) => {
    const res = await api.get(`/billing/invoices/${id}`);
    return res.data?.invoice;
  },

  createInvoice: async (data) => {
    const res = await api.post('/billing/invoices', data);
    return res.data?.invoice;
  },

  payInvoice: async (id, data = {}) => {
    const res = await api.post(`/billing/invoices/${id}/pay`, data);
    return res.data;
  },

  recordPayment: async (id, data) => {
    const res = await api.post(`/billing/invoices/${id}/record-payment`, data);
    return res.data;
  },

  getPayments: async (params = {}) => {
    const res = await api.get('/billing/payments', { params });
    return res.data?.payments || [];
  }
};
