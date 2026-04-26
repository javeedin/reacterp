/**
 * Central GL Posting Service
 * Single place for the 3-step journal posting flow:
 *   0. Duplicate check  (GET  /gl/journals/check)
 *   1. Create journal   (POST /journals/create)
 *   2. Post to GL       (PUT  /gl/journals/:id/post — RR_POST_JOURNAL)
 *   3. Stamp SLA header (POST /sla/accounting/post)
 */
import { APEX_DB_CONFIG } from '../config/api.config';
import { checkGLJournalExists } from './sla.service';

const BASE = APEX_DB_CONFIG.baseUrl;

// Maps SLA event type codes → reference5 label stored on GL lines
const EVENT_TYPE_TO_REF5: Record<string, string> = {
  AP_INVOICE_CREATION:     'AP-INVOICE-CREATION',
  INVOICE_CANCELLED:       'AP-INVOICE-CANCELLATION',
  PREPAYMENT_APPLIED:      'AP-PREPAYMENT-APPLICATION',
  PAYMENT_CREATED:         'AP-PAYMENT',
  VOID_PAYMENT:            'AP-PAYMENT-VOID',
  PAYMENT_MATURITY:        'AP-PAYMENT-MATURITY',
};

export function eventTypeToRef5(eventTypeCode: string): string {
  return EVENT_TYPE_TO_REF5[eventTypeCode?.toUpperCase()] ?? eventTypeCode ?? 'PAYABLES';
}

export interface GlPostingLine {
  lineType:           'DR' | 'CR';
  enteredDr:          number | null;
  enteredCr:          number | null;
  accountedDr:        number | null;
  accountedCr:        number | null;
  description:        string;
  currencyCode:       string;
  accountingDate:     string;
  accountCombination: string;
  accountingClass:    string | null;
  legalEntity:        string | null;
  [key: string]: any;
}

export interface GlPostingOptions {
  // SLA header info
  slaHeaderId:    number;
  sourceNumber:   string;          // invoice number / payment number — goes to reference1
  sourceId:       number | string; // invoice id / payment id — goes to reference2
  eventTypeCode:  string;          // AP_INVOICE_CREATION, INVOICE_CANCELLED, etc.
  // Journal metadata
  periodName:     string;          // Mon-YY format e.g. Apr-26
  ledgerName:     string;
  ledgerId:       number;
  currency:       string;
  accountingDate: string;          // YYYY-MM-DD
  legalEntity:    string;
  businessUnit:   string;
  // Lines
  lines:          GlPostingLine[];
  createdBy?:     string;
}

export interface GlPostingResult {
  success:    boolean;
  skipped:    boolean;   // true when duplicate was found and reused
  batchId:    number | null;
  headerId:   number | null;
  batchName:  string;
  error?:     string;
}

export async function postSlaToGL(opts: GlPostingOptions): Promise<GlPostingResult> {
  const {
    slaHeaderId, sourceNumber, sourceId, eventTypeCode,
    periodName, ledgerName, ledgerId, currency, accountingDate,
    legalEntity, businessUnit, lines, createdBy = 'user',
  } = opts;

  const ref5      = eventTypeToRef5(eventTypeCode);
  const batchName = `${ref5}-${sourceNumber}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Date.now().toString().slice(-6)}`;

  // ── 0. Duplicate check ────────────────────────────────────────────────────
  const exists = await checkGLJournalExists(sourceNumber, String(sourceId), ref5);
  if (exists.exists) {
    if (exists.status === 'P') {
      // Already posted — just stamp SLA and return
      await stampSla(slaHeaderId, exists.batchId, batchName, exists.headerId, createdBy);
      return { success: true, skipped: true, batchId: exists.batchId, headerId: exists.headerId, batchName };
    }
    // Exists but unposted — post the existing batch
    const putOk = await putPostJournal(exists.batchId!);
    if (!putOk.success) return { success: false, skipped: false, batchId: exists.batchId, headerId: exists.headerId, batchName, error: putOk.error };
    await stampSla(slaHeaderId, exists.batchId, batchName, exists.headerId, createdBy);
    return { success: true, skipped: true, batchId: exists.batchId, headerId: exists.headerId, batchName };
  }

  // ── 1. Create journal ─────────────────────────────────────────────────────
  const totalDr = lines.reduce((s, l) => s + (l.enteredDr || 0), 0);
  const totalCr = lines.reduce((s, l) => s + (l.enteredCr || 0), 0);

  const payload = {
    batch: {
      batchName,
      batchDescription:  `${ref5} – ${sourceNumber}`,
      ledgerName, ledgerId,
      status:            'NEW',
      accountingPeriod:  periodName,
      controlTotal:      totalDr,
      runningTotalDr:    totalDr,
      runningTotalCr:    totalCr,
      batchSource:       'Payables',
      createdBy,
    },
    header: {
      ledgerId, ledgerName,
      jeCategory:             'Purchase Invoices',
      jeSource:               'Payables',
      periodName,
      journalName:            `${ref5}-${sourceNumber}`,
      description:            `${ref5} – ${sourceNumber}`,
      currencyCode:           currency,
      currencyConversionType: 'User',
      currencyConversionDate: accountingDate,
      currencyConversionRate: 1,
      defaultEffectiveDate:   accountingDate,
      status:                 'NEW',
      runningTotalDr:         totalDr,
      runningTotalCr:         totalCr,
      createdBy,
    },
    lines: lines.map(l => ({
      enteredDr:                l.lineType === 'DR' ? (l.enteredDr || null) : null,
      enteredCr:                l.lineType === 'CR' ? (l.enteredCr || null) : null,
      accountedDr:              l.accountedDr || null,
      accountedCr:              l.accountedCr || null,
      statAmount:               null,
      description:              l.description || '',
      currencyCode:             l.currencyCode || currency,
      currencyConversionDate:   l.accountingDate || accountingDate,
      currencyConversionRate:   1,
      userCurrencyConversionType: 'User',
      accountCombination:       l.accountCombination || '',
      chartOfAccountsName:      'Chart of Accounts',
      reference1:               sourceNumber,
      reference2:               String(sourceId),
      reference3:               l.accountingClass || null,
      reference4:               businessUnit || null,
      reference5:               ref5,
      createdBy,
    })),
  };

  const createRes  = await fetch(`${BASE}/journals/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const createData = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    return { success: false, skipped: false, batchId: null, headerId: null, batchName, error: createData?.message || `HTTP ${createRes.status}` };
  }

  const glBatchId  = createData.jeBatchId  ?? createData.je_batch_id  ?? createData.batchId  ?? null;
  const glHeaderId = createData.jeHeaderId ?? createData.je_header_id ?? createData.headerId ?? null;

  // ── 2. PUT /gl/journals/:id/post (RR_POST_JOURNAL — validates period + posts) ──
  if (glBatchId) {
    const putOk = await putPostJournal(glBatchId);
    if (!putOk.success) {
      return { success: false, skipped: false, batchId: glBatchId, headerId: glHeaderId, batchName, error: putOk.error };
    }
  }

  // ── 3. Stamp SLA header ───────────────────────────────────────────────────
  await stampSla(slaHeaderId, glBatchId, batchName, glHeaderId, createdBy);

  return { success: true, skipped: false, batchId: glBatchId, headerId: glHeaderId, batchName };
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function putPostJournal(batchId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const res  = await fetch(`${BASE}/gl/journals/${batchId}/post`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      const err = Array.isArray(data?.errors) && data.errors.length > 0
        ? data.errors[0] : data?.error || `HTTP ${res.status}`;
      return { success: false, error: err };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function stampSla(
  headerId: number,
  glBatchId: number | null,
  glBatchName: string,
  glHeaderId: number | null,
  postedBy: string,
): Promise<void> {
  try {
    await fetch(`${BASE}/sla/accounting/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headerId, glBatchId, glBatchName, glHeaderId, postedBy }),
    });
  } catch { /* stamp failure is non-fatal — journal is posted */ }
}
