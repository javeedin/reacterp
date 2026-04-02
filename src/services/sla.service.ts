/**
 * SLA (Subledger Accounting) Service
 * Wraps all RR_SLA_PKG ORDS REST endpoints.
 */
import { APEX_DB_CONFIG } from '../config/api.config';

const BASE = APEX_DB_CONFIG.baseUrl;
const EP   = APEX_DB_CONFIG.endpoints;

// ── Types ──────────────────────────────────────────────────────────────────

export interface SlaExistsResult {
  exists: boolean;
  headerId: number | null;
  eventTypeCode: string | null;
  accountingStatus: string | null;
  postingStatus: string | null;
  accountingDate: string | null;
  creationDate: string | null;
  postedDate: string | null;
  canCreate: boolean;
  message: string;
}

export interface SlaCreateResult {
  headerId: number;
  lineCount: number;
  status: string;
  message: string;
}

export interface SlaPostResult {
  headerId: number;
  glBatchId: number;
  glHeaderId: number;
  status: string;
  message: string;
}

export interface SlaGetResult {
  found: boolean;
  headerId: number | null;
  moduleName: string | null;
  eventTypeCode: string | null;
  accountingStatus: string | null;
  postingStatus: string | null;
  accountingDate: string | null;
  periodName: string | null;
  description: string | null;
  creationDate: string | null;
  postedDate: string | null;
  postedBy: string | null;
  glBatchId: number | null;
  glBatchName: string | null;
  glHeaderId: number | null;
  lines: SlaLine[];
}

export interface SlaLine {
  lineId: number;
  lineNumber: number;
  lineType: string;
  accountingClass: string;
  accountCombination: string;
  enteredDr: number;
  enteredCr: number;
  accountedDr: number;
  accountedCr: number;
  currencyCode: string;
  description: string;
}

export interface SlaCreatePayload {
  header: {
    moduleName: string;
    sourceTable: string;
    sourceId: number;
    sourceNumber: string;
    sourceType: string;
    eventTypeCode: string;
    eventDate: string;           // YYYY-MM-DD
    accountingDate: string;      // YYYY-MM-DD
    periodName: string;
    ledgerId: number;
    ledgerName: string;
    currencyCode: string;
    ledgerCurrency?: string;
    exchangeRate?: number;
    exchangeRateType?: string;
    businessUnit?: string;
    legalEntity?: string;
    description?: string;
    createdBy?: string;
  };
  lines: {
    lineNumber: number;
    lineType: string;            // 'DR' | 'CR'
    accountingClass: string;
    accountCombination: string;
    enteredDr: number;
    enteredCr: number;
    accountedDr: number;
    accountedCr: number;
    currencyCode?: string;
    exchangeRate?: number;
    description?: string;
    sourceLineId?: number;
    sourceLineNumber?: number;
    partyId?: number;
    partyType?: string;
  }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function apexGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
  return body as T;
}

async function apexPost<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
  return body as T;
}

// ── API calls ──────────────────────────────────────────────────────────────

/**
 * Check whether accounting exists for a source transaction.
 * Call this BEFORE createAccounting to understand current state.
 */
export async function checkAccountingExists(
  sourceTable: string,
  sourceId: number,
  eventType?: string,
): Promise<SlaExistsResult> {
  let url = `${BASE}/${EP.slaAccountingExists}?sourceTable=${encodeURIComponent(sourceTable)}&sourceId=${sourceId}`;
  if (eventType) url += `&eventType=${encodeURIComponent(eventType)}`;
  return apexGet<SlaExistsResult>(url);
}

/**
 * Create (or replace DRAFT) SLA accounting for a source transaction.
 * Will be rejected with HTTP 409 if a POSTED entry already exists.
 */
export async function createAccounting(payload: SlaCreatePayload): Promise<SlaCreateResult> {
  return apexPost<SlaCreateResult>(`${BASE}/${EP.slaAccountingCreate}`, payload);
}

/**
 * Stamp GL batch / header IDs and lock the SLA header to POSTED.
 */
export async function postToLedger(
  headerId: number,
  glBatchId: number,
  glBatchName: string,
  glHeaderId: number,
  postedBy?: string,
): Promise<SlaPostResult> {
  return apexPost<SlaPostResult>(`${BASE}/${EP.slaAccountingPost}`, {
    headerId,
    glBatchId,
    glBatchName,
    glHeaderId,
    postedBy: postedBy ?? 'SYSTEM',
  });
}

/**
 * Mark an SLA header as ERROR (called when GL write fails).
 */
export async function markError(
  headerId: number,
  errorMessage: string,
  postedBy?: string,
): Promise<{ headerId: number; status: string; message: string }> {
  return apexPost(`${BASE}/${EP.slaAccountingError}`, {
    headerId,
    errorMessage,
    postedBy: postedBy ?? 'SYSTEM',
  });
}

/**
 * Retrieve the most recent SLA header + lines for a source transaction.
 */
export async function getAccounting(
  sourceTable: string,
  sourceId: number,
): Promise<SlaGetResult> {
  const url = `${BASE}/${EP.slaAccounting}?sourceTable=${encodeURIComponent(sourceTable)}&sourceId=${sourceId}`;
  return apexGet<SlaGetResult>(url);
}

// ── Ledger lookup ──────────────────────────────────────────────────────────

export interface LedgerInfo {
  ledgerId: number;
  ledgerName: string;
}

/**
 * Fetch the primary ledger for a given business unit.
 * Returns null if the BU is blank or the lookup fails.
 */
export async function fetchLedgerByBusinessUnit(businessUnitName: string): Promise<LedgerInfo | null> {
  if (!businessUnitName) return null;
  try {
    const url = `${BASE}/gl/getledgername?P_BUSINESS_UNIT_NAME=${encodeURIComponent(businessUnitName)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const body = await res.json();
    const item = body?.items?.[0];
    if (!item) return null;
    return { ledgerId: item.ledger_id, ledgerName: item.ledger_name };
  } catch {
    return null;
  }
}

// ── Payload builder for AP Invoices ───────────────────────────────────────

/**
 * Derive GL period name from a date: "Mon-YY" format (e.g. "Mar-26").
 */
export function derivePeriodName(date: Date = new Date()): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;
}

export interface ApInvoiceSlaOptions {
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;           // YYYY-MM-DD or raw date string
  invoiceType?: string;
  currencyCode: string;
  invoiceAmount: number;
  businessUnit?: string;
  legalEntity?: string;
  ledgerId?: number;
  ledgerName?: string;
  ledgerCurrency?: string;
  exchangeRate?: number;
  createdBy?: string;
  /** Expense/cost account for the DR side of each line */
  expenseAccount: string;
  /** AP Liability account for the CR side total */
  apLiabilityAccount: string;
  /** Invoice lines for individual DR splits */
  invoiceLines: { lineNumber: number; amount: number; description?: string; accrualAccount?: string; lineId?: number }[];
}

/**
 * Build a well-formed SLA create payload for a standard AP invoice.
 * Pattern: DR Expense (per line) / CR AP Liability (total).
 */
export function buildApInvoiceSlaPayload(opts: ApInvoiceSlaOptions): SlaCreatePayload {
  const today      = new Date();
  const acctDate   = today.toISOString().split('T')[0];
  const periodName = derivePeriodName(today);

  // Parse invoice date to YYYY-MM-DD
  const rawDate    = opts.invoiceDate
    ? new Date(opts.invoiceDate).toISOString().split('T')[0]
    : acctDate;

  const currency   = opts.currencyCode || 'AED';
  const exRate     = opts.exchangeRate  ?? 1;
  const total      = opts.invoiceAmount;

  const slaLines: SlaCreatePayload['lines'] = [];
  let lineNum = 1;

  // DR lines — one per invoice line
  for (const il of opts.invoiceLines) {
    const account = il.accrualAccount || opts.expenseAccount;
    slaLines.push({
      lineNumber:         lineNum++,
      lineType:           'DR',
      accountingClass:    'EXPENSE',
      accountCombination: account,
      enteredDr:          il.amount,
      enteredCr:          0,
      accountedDr:        il.amount * exRate,
      accountedCr:        0,
      currencyCode:       currency,
      exchangeRate:       exRate,
      description:        il.description || `AP Invoice ${opts.invoiceNumber} Line ${il.lineNumber}`,
      sourceLineId:       il.lineId,
      sourceLineNumber:   il.lineNumber,
    });
  }

  // CR line — AP Liability for the total
  slaLines.push({
    lineNumber:         lineNum,
    lineType:           'CR',
    accountingClass:    'LIABILITY',
    accountCombination: opts.apLiabilityAccount,
    enteredDr:          0,
    enteredCr:          total,
    accountedDr:        0,
    accountedCr:        total * exRate,
    currencyCode:       currency,
    exchangeRate:       exRate,
    description:        `AP Liability – Invoice ${opts.invoiceNumber}`,
  });

  return {
    header: {
      moduleName:        'AP',
      sourceTable:       'AP_INVOICES',
      sourceId:          opts.invoiceId,
      sourceNumber:      opts.invoiceNumber,
      sourceType:        opts.invoiceType    || 'Standard',
      eventTypeCode:     'AP_INVOICE_CREATION',
      eventDate:         rawDate,
      accountingDate:    acctDate,
      periodName,
      ledgerId:          opts.ledgerId       ?? 300000003259529,
      ledgerName:        opts.ledgerName     ?? 'BCL DIFC',
      currencyCode:      currency,
      ledgerCurrency:    opts.ledgerCurrency ?? 'AED',
      exchangeRate:      exRate,
      exchangeRateType:  'Corporate',
      businessUnit:      opts.businessUnit,
      legalEntity:       opts.legalEntity,
      description:       `AP Invoice ${opts.invoiceNumber} – ${opts.invoiceType || 'Standard'}`,
      createdBy:         opts.createdBy      ?? 'SYSTEM',
    },
    lines: slaLines,
  };
}

// ── Payload builder for AP Payments ───────────────────────────────────────

export interface ApPaymentInvoiceLine {
  invoiceNumber: string;
  invoiceId: number;
  /** Amount paid against this invoice in the invoice currency */
  amountPaid: number;
  /** AP Liability account from the invoice's liability_distribution */
  liabilityDistribution: string;
}

export interface ApPaymentSlaOptions {
  checkId: number;
  paymentNumber: string;
  paymentDate: string;           // YYYY-MM-DD
  currencyCode: string;
  businessUnit?: string;
  legalEntity?: string;
  ledgerId?: number;
  ledgerName?: string;
  ledgerCurrency?: string;
  exchangeRate?: number;
  createdBy?: string;
  /** Cash Clearing account from the bank account record */
  cashClearingAccount: string;
  /** One entry per applied invoice */
  appliedInvoices: ApPaymentInvoiceLine[];
}

/**
 * Build one SLA payload per applied invoice for a payment.
 * Pattern per invoice: DR AP Liability / CR Cash Clearing.
 */
export function buildApPaymentSlaPayloads(opts: ApPaymentSlaOptions): SlaCreatePayload[] {
  const today      = new Date();
  const acctDate   = opts.paymentDate || today.toISOString().split('T')[0];
  const d          = new Date(acctDate);
  const periodName = derivePeriodName(d);
  const currency   = opts.currencyCode || 'AED';
  const exRate     = opts.exchangeRate  ?? 1;

  return opts.appliedInvoices.map((inv) => {
    const amt = inv.amountPaid;
    return {
      header: {
        moduleName:       'AP',
        sourceTable:      'AP_PAYMENTS',
        sourceId:         opts.checkId,
        sourceNumber:     opts.paymentNumber,
        sourceType:       'PAYMENT',
        eventTypeCode:    'AP_PAYMENT_CREATED',
        eventDate:        acctDate,
        accountingDate:   acctDate,
        periodName,
        ledgerId:         opts.ledgerId   ?? 300000003259529,
        ledgerName:       opts.ledgerName ?? 'BCL DIFC',
        currencyCode:     currency,
        ledgerCurrency:   opts.ledgerCurrency ?? 'AED',
        exchangeRate:     exRate,
        exchangeRateType: 'Corporate',
        businessUnit:     opts.businessUnit,
        legalEntity:      opts.legalEntity,
        description:      `AP Payment ${opts.paymentNumber} – Invoice ${inv.invoiceNumber}`,
        createdBy:        opts.createdBy ?? 'SYSTEM',
      },
      lines: [
        {
          lineNumber:         1,
          lineType:           'DR',
          accountingClass:    'LIABILITY',
          accountCombination: inv.liabilityDistribution,
          enteredDr:          amt,
          enteredCr:          0,
          accountedDr:        Math.round(amt * exRate * 100) / 100,
          accountedCr:        0,
          currencyCode:       currency,
          exchangeRate:       exRate,
          description:        `AP Liability – Invoice ${inv.invoiceNumber}`,
        },
        {
          lineNumber:         2,
          lineType:           'CR',
          accountingClass:    'CASH_CLEARING',
          accountCombination: opts.cashClearingAccount,
          enteredDr:          0,
          enteredCr:          amt,
          accountedDr:        0,
          accountedCr:        Math.round(amt * exRate * 100) / 100,
          currencyCode:       currency,
          exchangeRate:       exRate,
          description:        `Cash Clearing – Payment ${opts.paymentNumber}`,
        },
      ],
    };
  });
}
