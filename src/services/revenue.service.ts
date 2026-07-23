import { APEX_DB_CONFIG } from '../config/api.config';

const BASE = APEX_DB_CONFIG.baseUrl;

export interface RevenueContract {
  id: number;
  trxNumber: number | null;
  unit: string;
  location: string;
  tenant: string;
  contractStartDate: string;
  contractEndDate: string;
  status: string;
  rentTotal: number;
  scheduleCount: number;
}

export interface RevenueSchedule {
  id: number;
  contractId: number;
  trxNumber: number | null;
  unit: string;
  location: string;
  tenant: string;
  scheduleNum: number;
  periodName: string;
  periodDate: string;
  amount: number;
  invoiceNumber: string | null;
  status: string;
  accountStatus: string;
}

export const getRevenueContracts = async (): Promise<RevenueContract[]> => {
  const res = await fetch(`${BASE}/ar/revenue-contracts`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.items || []);
};

export const getRevenueSchedules = async (params?: { contractId?: number; trxNumber?: number }): Promise<RevenueSchedule[]> => {
  const q = new URLSearchParams();
  if (params?.contractId != null) q.append('contractId', String(params.contractId));
  if (params?.trxNumber != null) q.append('trxNumber', String(params.trxNumber));
  const qs = q.toString();
  const res = await fetch(`${BASE}/ar/revenue-schedules${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.items || []);
};

export const generateRevenueSchedules = async (
  contractIds: number[], createdBy?: string,
): Promise<{ success: boolean; contracts?: number; schedules?: number; error?: string }> => {
  try {
    const res = await fetch(`${BASE}/ar/revenue-schedules/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ contractIds, createdBy }),
    });
    return await res.json();
  } catch (e: any) {
    return { success: false, error: e?.message || 'Generate failed' };
  }
};
