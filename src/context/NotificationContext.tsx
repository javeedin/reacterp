import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { APEX_DB_CONFIG } from '../config/api.config';
import dayjs from 'dayjs';

export type NotificationModule = 'General' | 'GL' | 'AP' | 'AR' | 'CM' | 'RM' | 'FA' | 'PMS';
export type NotificationStatus = 'Unread' | 'Read' | 'Actioned';

export interface AppNotification {
  id: string;
  module: NotificationModule;
  date: string;
  transaction: string;
  trxNo: string;
  details: string;
  status: NotificationStatus;
  severity?: 'info' | 'warning' | 'error';
  createdAt: number;
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
  const isRunningRef = useRef(false);  // ref-based guard — no stale closure issues
  const didMountCheck = useRef(false);

  const addNotification = useCallback((n: Omit<AppNotification, 'id' | 'createdAt'>) => {
    const notif: AppNotification = { ...n, id: uid(), createdAt: Date.now() };
    setNotifications(prev => {
      if (prev.some(x => x.trxNo === notif.trxNo && x.module === notif.module && x.transaction === notif.transaction)) return prev;
      return [notif, ...prev];
    });
  }, []);

  const markRead    = useCallback((id: string) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'Read' } : n)), []);
  const markAllRead = useCallback(() => setNotifications(prev => prev.map(n => ({ ...n, status: 'Read' }))), []);
  const clearAll    = useCallback(() => setNotifications([]), []);

  const checkPdcMaturity = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setPdcChecking(true);
    try {
      const today = dayjs().startOf('day');

      // Fetch Issued payments with maturity date (only_pdc=Y if ORDS handler supports it,
      // client-side filter handles it regardless)
      const url = `${APEX_PAYMENTS_URL}?payment_status=Issued&only_pdc=Y&limit=500`;
      console.log('[PDC Check] Fetching:', url);

      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        console.error('[PDC Check] HTTP error:', res.status, res.statusText);
        return;
      }

      const data = await res.json();
      const items: any[] = data.items || [];
      console.log('[PDC Check] Total items returned:', items.length);

      // Client-side: keep only those with a maturity date set
      const withMaturity = items.filter(p => !!p.MaturityDate);
      console.log('[PDC Check] Items with MaturityDate:', withMaturity.length,
        withMaturity.map(p => ({ no: p.PaymentNumber, mat: p.MaturityDate, payee: p.Payee })));

      // Narrow to ±3 days window
      const relevant = withMaturity.filter(p => {
        const diff = dayjs(p.MaturityDate).startOf('day').diff(today, 'day');
        return diff >= -3 && diff <= 3;
      });
      console.log('[PDC Check] Within ±3 days:', relevant.length);

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
    } catch (err) {
      console.error('[PDC Check] Error:', err);
    } finally {
      isRunningRef.current = false;
      setPdcChecking(false);
    }
  }, [addNotification]); // removed pdcChecking from deps — use ref guard instead

  const refreshPdcNotifications = useCallback(async () => {
    setNotifications(prev => prev.filter(n => !(n.module === 'AP' && n.transaction === 'PDC Payment')));
    isRunningRef.current = false; // reset guard so refresh always runs
    await checkPdcMaturity();
  }, [checkPdcMaturity]);

  // Run once on mount
  React.useEffect(() => {
    if (didMountCheck.current) return;
    didMountCheck.current = true;
    checkPdcMaturity();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unreadCount = notifications.filter(n => n.status === 'Unread').length;

  return (
    <NotificationContext.Provider value={{
      notifications, unreadCount,
      addNotification, markRead, markAllRead, clearAll,
      checkPdcMaturity, refreshPdcNotifications, pdcChecking,
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider');
  return ctx;
};
