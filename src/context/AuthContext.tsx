import React, { createContext, useContext, useState, useCallback } from 'react';
import type { User, AuthContextType, LoginResult } from '../types';
import { BREVO_API_KEY, BREVO_SENDER } from '../config/email.secret';

const APEX_AUTH_BASE = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/auth';

// Electron API (available only in desktop app)
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      sendOtpEmail: (to: string, otp: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

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

  const sendOtpViaBrowser = async (to: string, otp: string): Promise<{ success: boolean; error?: string }> => {
    const apiKey = BREVO_API_KEY;
    const sender = BREVO_SENDER;
    if (!apiKey) return { success: false, error: 'Brevo API key not configured.' };
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          sender: { name: 'ReactERP', email: sender },
          to: [{ email: to }],
          subject: 'ReactERP — Your One-Time Password (OTP)',
          htmlContent: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e0e0e0;border-radius:8px">
              <h2 style="color:#1677ff;margin-bottom:8px">ReactERP</h2>
              <p>Your one-time password (OTP) is:</p>
              <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1a1a2e;padding:16px;background:#f5f5f5;border-radius:6px;text-align:center">
                ${otp}
              </div>
              <p style="margin-top:16px;color:#666;font-size:13px">Valid for 15 minutes. Do not share this code.</p>
            </div>`,
        }),
      });
      if (res.ok) return { success: true };
      const err = await res.json();
      return { success: false, error: err.message || 'Email send failed.' };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Email send failed.' };
    }
  };

  const sendOtp = useCallback(async (username: string) => {
    try {
      // Step 1: Ask APEX to generate & store OTP — returns the OTP value
      const res = await fetch(`${APEX_AUTH_BASE}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();

      if (data.status !== 'OK') {
        return { status: data.status, message: data.message || 'Failed to generate OTP.' };
      }

      // Step 2a: Electron — send via nodemailer
      if (window.electronAPI?.isElectron && window.electronAPI.sendOtpEmail) {
        const emailResult = await window.electronAPI.sendOtpEmail(data.email, data.otp);
        if (!emailResult.success) {
          return { status: 'EMAIL_ERROR', message: `OTP generated but email failed: ${emailResult.error}` };
        }
        return { status: 'SENT', message: `OTP sent to ${data.email}. Valid for 15 minutes.` };
      }

      // Step 2b: Browser — send via Brevo HTTP API
      const emailResult = await sendOtpViaBrowser(data.email, data.otp);
      if (!emailResult.success) {
        return { status: 'EMAIL_ERROR', message: `OTP generated but email failed: ${emailResult.error}` };
      }
      return { status: 'SENT', message: `OTP sent to ${data.email}. Valid for 15 minutes.` };

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
