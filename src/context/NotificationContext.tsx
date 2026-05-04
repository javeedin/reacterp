import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { APEX_DB_CONFIG } from '../config/api.config';
import dayjs from 'dayjs';

export type NotificationModule = 'General' | 'GL' | 'AP' | 'AR' | 'CM' | 'RM' | 'FA' | 'PMS';
export type NotificationStatus = 'Unread' | 'Read' | 'Actioned';

export interface AppNotification {
  id: string;
  module: NotificationModule;
  date: string;          // ISO date of the event/transaction
  transaction: string;   // e.g. 'PDC Payment', 'Journal'
  trxNo: string;
  details: string;
  status: NotificationStatus;
  severity?: 'info' | 'warning' | 'error';
  createdAt: number;     // timestamp for sorting
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, 'id' | 'createdAt'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
  checkPdcMaturity: () => Promise<void>;
  pdcChecking: boolean;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const uid = () => `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const APEX_PAYMENTS_URL = `${APEX_DB_CONFIG.baseUrl}/ap/payments`;

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [pdcChecking, setPdcChecking] = useState(false);
  const checkedRef = useRef(false); // prevent duplicate background checks

  const addNotification = useCallback((n: Omit<AppNotification, 'id' | 'createdAt'>) => {
    const notif: AppNotification = { ...n, id: uid(), createdAt: Date.now() };
    setNotifications(prev => {
      // deduplicate by trxNo + module
      if (prev.some(x => x.trxNo === notif.trxNo && x.module === notif.module && x.transaction === notif.transaction)) return prev;
      return [notif, ...prev];
    });
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'Read' } : n));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, status: 'Read' })));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  const checkPdcMaturity = useCallback(async () => {
    if (pdcChecking) return;
    setPdcChecking(true);
    try {
      const today = dayjs();
      const dateFrom = today.subtract(3, 'day').format('YYYY-MM-DD');
      const dateTo   = today.add(3, 'day').format('YYYY-MM-DD');

      const url = `${APEX_PAYMENTS_URL}?only_pdc=Y&payment_status=Issued&limit=200`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      const items: any[] = data.items || [];

      const window3 = items.filter(p => {
        const md = p.MaturityDate;
        if (!md) return false;
        const mat = dayjs(md);
        return mat.isSame(today, 'day') ||
          (mat.isAfter(today.subtract(3, 'day').startOf('day')) &&
           mat.isBefore(today.add(3, 'day').endOf('day')));
      });

      window3.forEach(p => {
        const matDate = dayjs(p.MaturityDate);
        const diffDays = matDate.diff(today, 'day');
        let details: string;
        let severity: AppNotification['severity'];

        if (diffDays < 0) {
          details = `Maturity date was ${Math.abs(diffDays)} day(s) ago (${matDate.format('DD-MMM-YYYY')}). Payment: ${p.Payee} — AED ${Number(p.PaymentAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
          severity = 'error';
        } else if (diffDays === 0) {
          details = `Maturity date is TODAY (${matDate.format('DD-MMM-YYYY')}). Payment: ${p.Payee} — AED ${Number(p.PaymentAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
          severity = 'warning';
        } else {
          details = `Maturity date in ${diffDays} day(s) on ${matDate.format('DD-MMM-YYYY')}. Payment: ${p.Payee} — AED ${Number(p.PaymentAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
          severity = 'info';
        }

        addNotification({
          module: 'AP',
          date: p.MaturityDate,
          transaction: 'PDC Payment',
          trxNo: String(p.PaymentNumber || p.CheckId || ''),
          details,
          status: 'Unread',
          severity,
        });
      });
    } catch {
      // silent — background task
    } finally {
      setPdcChecking(false);
    }
  }, [addNotification, pdcChecking]);

  // Run once on mount
  const runOnce = useCallback(async () => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    await checkPdcMaturity();
  }, [checkPdcMaturity]);

  React.useEffect(() => { runOnce(); }, [runOnce]);

  const unreadCount = notifications.filter(n => n.status === 'Unread').length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, addNotification, markRead, markAllRead, clearAll, checkPdcMaturity, pdcChecking }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider');
  return ctx;
};
