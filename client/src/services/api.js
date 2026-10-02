import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request Interceptor: Attach bearer token from localStorage if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const currentEstateId = localStorage.getItem('activeEstateId');
    if (currentEstateId) {
      config.headers['x-estate-id'] = currentEstateId;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Centralized error handling
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const customError = error.response?.data || {
      success: false,
      message: error.message || 'Network request failed'
    };

    // On 401, clear credentials and fire a custom event so the React Router
    // listener (in AuthContext) can navigate to /login without a full reload.
    if (error.response?.status === 401 && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('activeEstate');
      localStorage.removeItem('activeEstateId');
      // Dispatch a custom event that AuthContext listens to
      window.dispatchEvent(new CustomEvent('auth:logout'));
    }

    return Promise.reject(customError);
  }
);

export default api;
