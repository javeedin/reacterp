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
  refreshPdcNotifications: () => Promise<void>;
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
      const today = dayjs().startOf('day');

      // Fetch Issued PDC payments — server filters by only_pdc=Y (maturity date not null)
      // Client-side then narrows to ±3 days window
      const url = `${APEX_PAYMENTS_URL}?payment_status=Issued&only_pdc=Y&limit=500`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      const items: any[] = data.items || [];

      // Keep only payments that have a maturity date AND it falls within ±3 days of today
      const relevant = items.filter(p => {
        const md = p.MaturityDate;
        if (!md) return false;
        const mat = dayjs(md).startOf('day');
        const diff = mat.diff(today, 'day'); // negative = overdue, 0 = today, positive = upcoming
        return diff >= -3 && diff <= 3;
      });

      relevant.forEach(p => {
        const matDate = dayjs(p.MaturityDate).startOf('day');
        const diffDays = matDate.diff(today, 'day');
        const amt = `AED ${Number(p.PaymentAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        const payee = p.Payee || 'Unknown';

        let details: string;
        let severity: AppNotification['severity'];

        if (diffDays < 0) {
          details = `PDC overdue by ${Math.abs(diffDays)} day(s) — maturity was ${matDate.format('DD-MMM-YYYY')}. Payee: ${payee}, ${amt}`;
          severity = 'error';
        } else if (diffDays === 0) {
          details = `PDC matures TODAY (${matDate.format('DD-MMM-YYYY')}). Payee: ${payee}, ${amt}`;
          severity = 'warning';
        } else {
          details = `PDC matures in ${diffDays} day(s) on ${matDate.format('DD-MMM-YYYY')}. Payee: ${payee}, ${amt}`;
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

  // Refresh: clear existing PDC notifications then re-fetch fresh data
  const refreshPdcNotifications = useCallback(async () => {
    setNotifications(prev => prev.filter(n => !(n.module === 'AP' && n.transaction === 'PDC Payment')));
    await checkPdcMaturity();
  }, [checkPdcMaturity]);

  // Run once on mount
  React.useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    checkPdcMaturity();
  }, [checkPdcMaturity]);

  const unreadCount = notifications.filter(n => n.status === 'Unread').length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, addNotification, markRead, markAllRead, clearAll, checkPdcMaturity, refreshPdcNotifications, pdcChecking }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider');
  return ctx;
};
