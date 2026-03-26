import React, { createContext, useContext, useState, useCallback } from 'react';
import type { User, AuthContextType, LoginResult } from '../types';

const APEX_AUTH_BASE = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('erp_user');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const loginWithStatus = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    try {
      const res = await fetch(`${APEX_AUTH_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (data.status === 'SUCCESS') {
        const userData: User = {
          id: data.user?.username || username,
          username: data.user?.username || username,
          name: data.user?.name || username,
          email: data.user?.email || username,
          role: 'User',
        };
        setUser(userData);
        localStorage.setItem('erp_user', JSON.stringify(userData));
        localStorage.setItem('erp_token', data.token || '');
      }

      return { status: data.status, message: data.message || '' };
    } catch {
      return { status: 'ERROR', message: 'Unable to connect. Please check your internet connection.' };
    }
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    const result = await loginWithStatus(username, password);
    return result.status === 'SUCCESS';
  }, [loginWithStatus]);

  const sendOtp = useCallback(async (username: string) => {
    try {
      const res = await fetch(`${APEX_AUTH_BASE}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      return await res.json();
    } catch {
      return { status: 'ERROR', message: 'Unable to connect. Please try again.' };
    }
  }, []);

  const setPassword = useCallback(async (username: string, otp: string, newPassword: string) => {
    try {
      const res = await fetch(`${APEX_AUTH_BASE}/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, otp, new_password: newPassword }),
      });
      return await res.json();
    } catch {
      return { status: 'ERROR', message: 'Unable to connect. Please try again.' };
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('erp_user');
    localStorage.removeItem('erp_token');
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, loginWithStatus, sendOtp, setPassword, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
