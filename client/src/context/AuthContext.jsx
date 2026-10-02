import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeEstate, setActiveEstate] = useState(null);
  const navigate = useNavigate();

  // Restore session from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    const savedEstate = localStorage.getItem('activeEstate');

    if (savedUser && token) {
      try {
        setUser(JSON.parse(savedUser));
        if (savedEstate) {
          setActiveEstate(JSON.parse(savedEstate));
        }
      } catch (e) {
        // Corrupted storage — clear it
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('activeEstate');
        localStorage.removeItem('activeEstateId');
      }
    }
    setLoading(false);
  }, []);

  // Listen for 401 events fired by api.js interceptor
  // Uses React Router navigate instead of window.location so there's no full reload
  const handleForcedLogout = useCallback(() => {
    setUser(null);
    setActiveEstate(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    window.addEventListener('auth:logout', handleForcedLogout);
    return () => window.removeEventListener('auth:logout', handleForcedLogout);
  }, [handleForcedLogout]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.success) {
      setUser(res.data.user);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
    }
    return res;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore — clear local state regardless
    }
    setUser(null);
    setActiveEstate(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('activeEstate');
    localStorage.removeItem('activeEstateId');
    navigate('/login', { replace: true });
  };

  const selectEstate = (estate) => {
    setActiveEstate(estate);
    localStorage.setItem('activeEstate', JSON.stringify(estate));
    localStorage.setItem('activeEstateId', estate._id || estate.id);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, activeEstate, selectEstate }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
