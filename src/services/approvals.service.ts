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

// ─── Approval Tokens ─────────────────────────────────────────────────────────

async function generateApprovalTokens(
  requestRef: string,
  requestId: number | undefined,
  toEmail: string,
  toName: string,
  transactionType?: string,
): Promise<{ approveToken: string; rejectToken: string }> {
  const res = await fetch(`${BASE}/generate-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestRef, requestId, toEmail, toName, transactionType }),
  });
  return handleResponse<{ approveToken: string; rejectToken: string }>(res);
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

// ─── External Transaction Approval ───────────────────────────────────────────

function buildTxnApprovalEmailHtml(params: {
  recipientName: string;
  today: string;
  approveUrl: string;
  rejectUrl: string;
  txnRef: string;
  txnType: string;
  amount: number;
  currency: string;
  description: string;
  submittedBy: string;
}): string {
  const { recipientName, today, approveUrl, rejectUrl, txnRef, txnType, amount, currency, description, submittedBy } = params;
  const fmtAmt = `${currency} ${amount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Approval Required</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0"
  style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.10);max-width:600px;">
  <tr><td style="background:linear-gradient(135deg,#C74634 0%,#9B3528 100%);padding:32px;text-align:center;">
    <div style="font-size:10px;letter-spacing:3px;color:rgba(255,255,255,0.70);margin-bottom:8px;text-transform:uppercase;">Bumeric Business Solutions</div>
    <div style="font-size:28px;font-weight:700;color:#ffffff;margin-bottom:6px;">&#128338; Approval Required</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.80);">Cash — External Transaction Approval</div>
  </td></tr>
  <tr><td style="background:#fff8e1;padding:12px 32px;border-bottom:2px solid #ffe082;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:13px;color:#7c5a00;font-weight:600;">&#9888;&nbsp; Action Required — Please click Approve or Reject below</td>
      <td align="right" style="font-size:11px;color:#bbb;white-space:nowrap;">${today}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 32px 0;">
    <p style="margin:0 0 10px;font-size:15px;color:#1a1a1a;font-weight:500;">Dear ${recipientName},</p>
    <p style="margin:0 0 22px;font-size:13px;color:#555;line-height:1.7;">
      A cash external transaction has been submitted for your approval. Click <strong>Approve</strong> or
      <strong>Reject</strong> below — your response will be recorded instantly.
      Each link is single-use and expires in 72 hours.
    </p>
  </td></tr>
  <tr><td style="padding:0 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="border:1px solid #e8e8e8;border-radius:8px;overflow:hidden;">
      <tr><td colspan="2" style="background:#f8f9fa;padding:10px 16px;font-size:10px;font-weight:700;color:#999;letter-spacing:1px;text-transform:uppercase;">Transaction Details</td></tr>
      <tr style="border-top:1px solid #e8e8e8;">
        <td style="padding:11px 16px;font-size:12px;color:#888;width:130px;background:#fff;">Module</td>
        <td style="padding:11px 16px;font-size:13px;font-weight:600;background:#fff;">Cash Management</td>
      </tr>
      <tr style="border-top:1px solid #e8e8e8;">
        <td style="padding:11px 16px;font-size:12px;color:#888;background:#f8f9fa;">Transaction Type</td>
        <td style="padding:11px 16px;font-size:13px;font-weight:600;background:#f8f9fa;">${txnType || '—'}</td>
      </tr>
      <tr style="border-top:1px solid #e8e8e8;">
        <td style="padding:11px 16px;font-size:12px;color:#888;background:#fff;">Reference</td>
        <td style="padding:11px 16px;font-size:13px;font-weight:600;background:#fff;">${txnRef}</td>
      </tr>
      <tr style="border-top:1px solid #e8e8e8;">
        <td style="padding:11px 16px;font-size:12px;color:#888;background:#f8f9fa;">Amount</td>
        <td style="padding:11px 16px;font-size:16px;font-weight:700;color:#C74634;background:#f8f9fa;">${fmtAmt}</td>
      </tr>
      <tr style="border-top:1px solid #e8e8e8;">
        <td style="padding:11px 16px;font-size:12px;color:#888;background:#fff;">Submitted By</td>
        <td style="padding:11px 16px;font-size:13px;background:#fff;">${submittedBy}</td>
      </tr>
      <tr style="border-top:1px solid #e8e8e8;">
        <td style="padding:11px 16px;font-size:12px;color:#888;background:#f8f9fa;">Date</td>
        <td style="padding:11px 16px;font-size:13px;background:#f8f9fa;">${today}</td>
      </tr>
      <tr style="border-top:1px solid #e8e8e8;">
        <td style="padding:11px 16px;font-size:12px;color:#888;background:#fff;">Description</td>
        <td style="padding:11px 16px;font-size:13px;color:#555;background:#fff;">${description || '—'}</td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table cellpadding="0" cellspacing="0"><tr>
        <td style="padding:0 8px;">
          <a href="${approveUrl}"
            style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;
              padding:14px 40px;border-radius:7px;font-weight:700;font-size:15px;
              letter-spacing:0.4px;box-shadow:0 3px 10px rgba(22,163,74,0.40);">
            &#10003;&nbsp;APPROVE
          </a>
        </td>
        <td style="padding:0 8px;">
          <a href="${rejectUrl}"
            style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;
              padding:14px 40px;border-radius:7px;font-weight:700;font-size:15px;
              letter-spacing:0.4px;box-shadow:0 3px 10px rgba(220,38,38,0.40);">
            &#10007;&nbsp;REJECT
          </a>
        </td>
      </tr></table>
    </td></tr></table>
    <p style="text-align:center;margin:12px 0 0;font-size:11px;color:#aaa;">Each button is a single-use secure link valid for 72 hours.</p>
  </td></tr>
  <tr><td style="background:#f8f9fa;border-top:1px solid #e8e8e8;padding:18px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:11px;color:#bbb;">This is an automated notification from the ERP Approval System. Please do not reply to this email.</p>
    <p style="margin:0;font-size:11px;color:#ddd;">&copy; ${new Date().getFullYear()} Bumeric Business Solutions LLC</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export async function sendExternalTxnApproval(params: {
  txnId: number;
  txnRef: string;
  txnType: string;
  amount: number;
  currency: string;
  description: string;
  approverEmail: string;
  approverName: string;
  sentBy: string;
}): Promise<{ success: boolean; message: string }> {
  const { txnId, txnRef, txnType, amount, currency, description, approverEmail, approverName, sentBy } = params;

  const cfgRes = await fetch(`${APEX_DB_CONFIG.baseUrl}/config/emailsettings`);
  const cfg = await cfgRes.json();
  if (cfg.status !== 'success') throw new Error('Email config not found in database');

  const apiKey    = cfg.pass;
  const fromEmail = cfg.user;
  const fromName  = cfg.fromName ?? 'ERP Approval System';
  const approvalRef = `CASH-EXT-${txnId}`;
  const today = new Date().toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric' });

  const { approveToken, rejectToken } = await generateApprovalTokens(
    approvalRef, txnId, approverEmail, approverName, txnType,
  );
  const approveUrl = `https://erp-approval.reerperp.workers.dev?token=${approveToken}`;
  const rejectUrl  = `https://erp-approval.reerperp.workers.dev?token=${rejectToken}`;

  // Mark transaction as PENDING approval in the DB
  const putRes = await fetch(`${APEX_DB_CONFIG.baseUrl}/cash/externaltransactions/${txnId}/approval`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      approvalStatus:  'PENDING',
      approvalSentBy:  sentBy,
      approverName,
      approverEmail,
      approvalRef,
    }),
  });
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => putRes.statusText);
    throw new Error(`Failed to update approval status: ${t}`);
  }

  const html = buildTxnApprovalEmailHtml({
    recipientName: approverName,
    today,
    approveUrl,
    rejectUrl,
    txnRef,
    txnType,
    amount,
    currency,
    description,
    submittedBy: sentBy,
  });

  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify({
      sender:      { name: fromName, email: fromEmail },
      to:          [{ email: approverEmail, name: approverName }],
      subject:     `[Approval Required] ${txnType || 'External Transaction'} — ${txnRef}`,
      htmlContent: html,
    }),
  });

  if (brevoRes.ok) {
    return { success: true, message: `Approval email sent to ${approverName} (${approverEmail}). Single-use links expire in 72 hours.` };
  }
  const errText = await brevoRes.text().catch(() => '');
  let errMsg = `Brevo API error (${brevoRes.status})`;
  try { errMsg += ': ' + JSON.parse(errText).message; } catch { /* ignore */ }
  return { success: false, message: errMsg };
}
