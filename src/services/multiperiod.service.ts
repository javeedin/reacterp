import { APEX_DB_CONFIG } from '../config/api.config';

const BASE = `${APEX_DB_CONFIG.baseUrl}/ap/multiperiod`;

export interface MpaInvoiceSummary {
  invoiceId: number;
  invoiceNumber: string;
  supplier: string;
  supplierNumber: string;
  businessUnit: string;
  invoiceDate: string;
  currencyCode: string;
  totalLines: number;
  totalAmount: number;
  postedAmount: number;
  notPostedAmount: number;
  minPeriodDate: string;
  maxPeriodDate: string;
}

export interface MpaScheduleLine {
  scheduleId: number;
  lineNumber: number;
  periodDate: string;
  periodName: string;
  originalAmount: number;
  periodAmount: number;
  accrualAccount: string;
  chargeAccount: string;
  description: string;
  postingStatus: string;
  postedDate: string | null;
  postedBy: string | null;
  slaHeaderId: number | null;
}

export interface MpaInvoiceDetail {
  invoiceId: number;
  invoiceNumber: string;
  supplier: string;
  businessUnit: string;
  invoiceDate: string;
  currencyCode: string;
  invoiceAccountingStatus: string | null;
  lines: MpaScheduleLine[];
}

export async function listMpaInvoices(params: {
  invoiceNumber?: string;
  supplier?: string;
  businessUnit?: string;
  postingStatus?: string;
}): Promise<MpaInvoiceSummary[]> {
  const q = new URLSearchParams();
  if (params.invoiceNumber) q.set('invoice_number', params.invoiceNumber);
  if (params.supplier) q.set('supplier', params.supplier);
  if (params.businessUnit) q.set('business_unit', params.businessUnit);
  if (params.postingStatus) q.set('posting_status', params.postingStatus);
  const res = await fetch(`${BASE}${q.toString() ? '?' + q.toString() : ''}`, {
    headers: { Accept: 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data.schedules || [];
}

export async function getMpaSchedule(invoiceId: number): Promise<MpaInvoiceDetail> {
  const res = await fetch(`${BASE}/${invoiceId}`, {
    headers: { Accept: 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export async function generateMpaSchedule(invoiceId: number): Promise<void> {
  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ invoiceId }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data?.error || `HTTP ${res.status}`);
}

export async function markPeriodPosted(
  invoiceId: number,
  periodName: string,
  slaHeaderId: number,
  postedBy: string,
): Promise<void> {
  const res = await fetch(`${BASE}/mark-posted`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ invoiceId, periodName, slaHeaderId, postedBy }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data?.error || `HTTP ${res.status}`);
}
