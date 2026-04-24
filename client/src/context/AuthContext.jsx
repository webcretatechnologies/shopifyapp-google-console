import React, { createContext, useContext, useState, useCallback } from 'react';
import { adminApi } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const res = await adminApi.login(email, password);
      localStorage.setItem('admin_token', res.token);
      setAdmin(res.admin);
      return res;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('admin_token');
    setAdmin(null);
    window.location.href = '/admin/login';
  }, []);

  const loadMe = useCallback(async () => {
    try {
      const me = await adminApi.me();
      setAdmin(me);
    } catch {
      logout();
    }
  }, [logout]);

  return (
    <AuthContext.Provider value={{ admin, loading, login, logout, loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
