import { APEX_DB_CONFIG } from '../config/api.config';

const BASE = `${APEX_DB_CONFIG.baseUrl}/pc`;

export interface PCRegister {
  registerId: number;
  registerName: string;
  startDate: string | null;
  endDate: string | null;
  comments: string | null;
  cashAccountCcid: number | null;
  cashAccountDesc: string | null;
  currency: string;
  status: 'ACTIVE' | 'CLOSED';
  balance: number;
  totalDebit: number;
  totalCredit: number;
  createdBy: string | null;
  creationDate: string | null;
}

export interface PCTransaction {
  transactionId: number;
  registerId: number;
  lineNumber: number;
  transactionDate: string;
  transactionType: 'Balance Refill' | 'Expense' | 'Adjustment';
  expenseType: string | null;
  chargeAccountCcid: number | null;
  chargeAccountDesc: string | null;
  accountingDate: string | null;
  postingStatus: 'Unposted' | 'Posted' | 'Error';
  currency: string;
  debitAmount: number;
  creditAmount: number;
  comments: string | null;
  referenceNo: string | null;
  attachment: string | null;
  createdBy: string | null;
  creationDate: string | null;
  runningBalance: number;
}

export interface SearchRegistersParams {
  q?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function searchRegisters(params: SearchRegistersParams = {}): Promise<PCRegister[]> {
  const qs = new URLSearchParams();
  if (params.q)        qs.set('q',        params.q);
  if (params.status)   qs.set('status',   params.status);
  if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
  if (params.dateTo)   qs.set('dateTo',   params.dateTo);
  const url = `${BASE}/registers${qs.toString() ? '?' + qs.toString() : ''}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
  return (data.items || []) as PCRegister[];
}

export async function getRegister(registerId: number): Promise<PCRegister> {
  const res = await fetch(`${BASE}/registers/${registerId}`, { headers: { Accept: 'application/json' } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
  return data as PCRegister;
}

export async function createRegister(payload: Partial<PCRegister> & { createdBy?: string }): Promise<{ registerId: number }> {
  const res = await fetch(`${BASE}/registers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data?.message || `HTTP ${res.status}`);
  return data;
}

export async function updateRegister(registerId: number, payload: Partial<PCRegister> & { updatedBy?: string }): Promise<void> {
  const res = await fetch(`${BASE}/registers/${registerId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data?.message || `HTTP ${res.status}`);
}

export async function deleteRegister(registerId: number): Promise<void> {
  const res = await fetch(`${BASE}/registers/${registerId}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data?.message || `HTTP ${res.status}`);
}

export async function getTransactions(registerId: number): Promise<PCTransaction[]> {
  const res = await fetch(`${BASE}/registers/${registerId}/transactions`, { headers: { Accept: 'application/json' } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
  return (data.items || []) as PCTransaction[];
}

export async function createTransaction(payload: Partial<PCTransaction> & { createdBy?: string }): Promise<{ transactionId: number; lineNumber: number }> {
  const res = await fetch(`${BASE}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data?.message || `HTTP ${res.status}`);
  return data;
}

export async function updateTransaction(transactionId: number, payload: Partial<PCTransaction> & { updatedBy?: string }): Promise<void> {
  const res = await fetch(`${BASE}/transactions/${transactionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data?.message || `HTTP ${res.status}`);
}

export async function deleteTransaction(transactionId: number): Promise<void> {
  const res = await fetch(`${BASE}/transactions/${transactionId}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data?.message || `HTTP ${res.status}`);
}
