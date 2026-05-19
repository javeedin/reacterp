// ─────────────────────────────────────────────────────────────────────────────
// Approval Management Engine — Service Layer
// ─────────────────────────────────────────────────────────────────────────────

import { APEX_DB_CONFIG } from '../config/api.config';

const BASE = `${APEX_DB_CONFIG.baseUrl}/approvals`;

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ApprovalUser {
  userId: number;
  fullName: string;
  email: string;
  department?: string;
  jobTitle?: string;
  maxApprovalAmount?: number | null;  // null = unlimited
  currency: string;
  modules: string[];  // ['AP', 'AR', 'CASH', 'GL', 'FA', 'PROCUREMENT']
  active: 'Y' | 'N';
  phoneNumber?: string;
  createdBy?: string;
  creationDate?: string;
  lastUpdateDate?: string;
}

export interface RuleApprover {
  sequence: number;
  userId: number;
  fullName: string;
  email: string;
  department?: string;
}

export interface ApprovalRule {
  ruleId: number;
  ruleName: string;
  module: string;
  transactionType: string;
  description?: string;
  minAmount: number;
  maxAmount?: number | null;  // null = unlimited
  currency: string;
  approvalType: 'SEQUENTIAL' | 'PARALLEL' | 'ANY_ONE';
  approvers: RuleApprover[];
  active: 'Y' | 'N';
  priority: number;
  createdBy?: string;
  creationDate?: string;
}

export interface ApprovalRequest {
  requestId: number;
  module: string;
  transactionType: string;
  transactionId?: number;
  transactionRef: string;
  amount: number;
  currency: string;
  description?: string;
  requestedByName: string;
  requestedDate: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'RECALLED';
  ruleId?: number;
  ruleName?: string;
  currentApproverName?: string;
  history?: ApprovalHistoryEntry[];
}

export interface ApprovalHistoryEntry {
  historyId: number;
  requestId: number;
  action: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'FORWARDED' | 'RECALLED' | 'NOTIFIED' | 'CANCELLED';
  actorName: string;
  comments?: string;
  actionDate: string;
  notificationSent: 'Y' | 'N';
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const APPROVAL_MODULES = ['AP', 'AR', 'CASH', 'GL', 'FA', 'PROCUREMENT'] as const;

export const TRANSACTION_TYPES: Record<string, string[]> = {
  AP:          ['INVOICE', 'PAYMENT', 'CREDIT_NOTE'],
  AR:          ['INVOICE', 'RECEIPT'],
  CASH:        ['EXTERNAL_TXN', 'BANK_TRANSFER'],
  GL:          ['JOURNAL'],
  FA:          ['ASSET_ADDITION', 'DISPOSAL'],
  PROCUREMENT: ['PURCHASE_ORDER'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

// ─── Approver Users CRUD ──────────────────────────────────────────────────────

export async function getApprovalUsers(): Promise<ApprovalUser[]> {
  const res = await fetch(`${BASE}/users`);
  const data = await handleResponse<{ items?: ApprovalUser[] } | ApprovalUser[]>(res);
  if (Array.isArray(data)) return data;
  return (data as { items?: ApprovalUser[] }).items ?? [];
}

export async function createApprovalUser(
  payload: Omit<ApprovalUser, 'userId' | 'createdBy' | 'creationDate' | 'lastUpdateDate'>
): Promise<{ userId: number }> {
  const res = await fetch(`${BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<{ userId: number }>(res);
}

export async function updateApprovalUser(
  userId: number,
  payload: Partial<ApprovalUser>
): Promise<void> {
  const res = await fetch(`${BASE}/users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await handleResponse<void>(res);
}

export async function deleteApprovalUser(userId: number): Promise<void> {
  const res = await fetch(`${BASE}/users/${userId}`, { method: 'DELETE' });
  await handleResponse<void>(res);
}

// ─── Approval Rules CRUD ──────────────────────────────────────────────────────

export async function getApprovalRules(module?: string): Promise<ApprovalRule[]> {
  const url = module ? `${BASE}/rules?module=${encodeURIComponent(module)}` : `${BASE}/rules`;
  const res = await fetch(url);
  const data = await handleResponse<{ items?: ApprovalRule[] } | ApprovalRule[]>(res);
  if (Array.isArray(data)) return data;
  return (data as { items?: ApprovalRule[] }).items ?? [];
}

export async function createApprovalRule(
  payload: Omit<ApprovalRule, 'ruleId' | 'createdBy' | 'creationDate'>
): Promise<{ ruleId: number }> {
  const res = await fetch(`${BASE}/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<{ ruleId: number }>(res);
}

export async function updateApprovalRule(
  ruleId: number,
  payload: Partial<ApprovalRule>
): Promise<void> {
  const res = await fetch(`${BASE}/rules/${ruleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await handleResponse<void>(res);
}

export async function deleteApprovalRule(ruleId: number): Promise<void> {
  const res = await fetch(`${BASE}/rules/${ruleId}`, { method: 'DELETE' });
  await handleResponse<void>(res);
}

// ─── Approval Requests ────────────────────────────────────────────────────────

export async function getApprovalRequests(params?: {
  module?: string;
  status?: string;
  from?: string;
  to?: string;
}): Promise<ApprovalRequest[]> {
  const qs = new URLSearchParams();
  if (params?.module) qs.set('module', params.module);
  if (params?.status) qs.set('status', params.status);
  if (params?.from)   qs.set('from', params.from);
  if (params?.to)     qs.set('to', params.to);
  const url = `${BASE}/requests${qs.toString() ? '?' + qs.toString() : ''}`;
  const res = await fetch(url);
  const data = await handleResponse<{ items?: ApprovalRequest[] } | ApprovalRequest[]>(res);
  if (Array.isArray(data)) return data;
  return (data as { items?: ApprovalRequest[] }).items ?? [];
}

export async function getApprovalHistory(requestId: number): Promise<ApprovalHistoryEntry[]> {
  const res = await fetch(`${BASE}/requests/${requestId}/history`);
  const data = await handleResponse<{ items?: ApprovalHistoryEntry[] } | ApprovalHistoryEntry[]>(res);
  if (Array.isArray(data)) return data;
  return (data as { items?: ApprovalHistoryEntry[] }).items ?? [];
}

export async function submitApprovalAction(
  requestId: number,
  action: ApprovalHistoryEntry['action'],
  actorName: string,
  comments?: string
): Promise<void> {
  const res = await fetch(`${BASE}/requests/${requestId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, actorName, comments }),
  });
  await handleResponse<void>(res);
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function sendTestNotification(
  userId: number,
  sampleData?: Record<string, unknown>
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${BASE}/notify/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, sampleData }),
  });
  return handleResponse<{ success: boolean; message: string }>(res);
}
