import React, { useState, useEffect, useMemo } from 'react';
import {
  Layout, Card, Typography, Table, Button, Space, Tag, Breadcrumb, Tabs,
  message, Input, Tooltip, Row, Col, Statistic, Modal, Alert, Select, Divider,
} from 'antd';
import {
  HomeOutlined, ReloadOutlined, ThunderboltOutlined, SearchOutlined,
  FileExcelOutlined, ApiOutlined, DollarOutlined, CheckCircleTwoTone, CloseCircleTwoTone,
  TableOutlined, AuditOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { ColumnsType } from 'antd/es/table';
import FloatingMenu from '../../components/FloatingMenu';
import { APEX_DB_CONFIG } from '../../config/api.config';
import { useAuth } from '../../context/AuthContext';
import {
  getRevenueContracts, getRevenueSchedules, markRevenueScheduleAccounted,
} from '../../services/revenue.service';
import type { RevenueContract, RevenueSchedule } from '../../services/revenue.service';
import {
  createAccounting, checkAccountingExists, checkGLJournalExists,
  fetchLedgerByBusinessUnit, derivePeriodName,
} from '../../services/sla.service';
import type { SlaCreatePayload } from '../../services/sla.service';
import { postSlaToGL, buildGlJournalPayload, makeBatchName } from '../../services/glPosting.service';
import type { GlPostingOptions } from '../../services/glPosting.service';

// Resolve {slaHeaderId}/{batchId}/{batchName}/{glHeaderId} tokens in debug steps.
function resolveTokens<T>(value: T, ctx: Record<string, any>): T {
  if (typeof value === 'string') return value.replace(/\{(\w+)\}/g, (_, k) => (ctx[k] != null ? String(ctx[k]) : '0')) as unknown as T;
  if (Array.isArray(value)) return value.map(v => resolveTokens(v, ctx)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value as Record<string, any>)) out[k] = resolveTokens((value as any)[k], ctx);
    return out as unknown as T;
  }
  return value;
}

const { Content } = Layout;
const { Title, Text } = Typography;

const REDWOOD = {
  primary: '#C74634', success: '#1D7B4D', warning: '#D4A800', info: '#0572CE',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral500: '#8C8C8C',
};

const fmt = (v: number | null | undefined) =>
  v == null ? '—' : new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));

// ── Revenue-recognition accounting ────────────────────────────────────────────
// COA structure (7 segments): Company-Account-CostCenter-Seg4-Seg5-Seg6-Seg7
// e.g. 00-1240100-0000-000-00-000-000
const RR_DEBIT_ACCOUNT  = '2313111';   // Dr — unbilled/deferred revenue control
const RR_CREDIT_ACCOUNT = '4111101';   // Cr — revenue
const RR_REMAINING_SEGMENTS = ['0000', '000', '00', '000', '000']; // CC + seg4..7 (default)
const RR_SOURCE = 'AR_REVENUE_RECOGNIZATION';   // reference5

// Company segment derived from the business unit. Populated at runtime from the
// finBusinessUnitsLOV Company field (keyed by upper-cased BU name); falls back
// to '01' when the BU is unknown.
const BU_TO_COMPANY: Record<string, string> = {
  // 'AMS B2B GHANA': '01',
};
const DEFAULT_COMPANY = '01';
const companyFromBU = (bu?: string): string => {
  if (!bu) return DEFAULT_COMPANY;
  const hit = BU_TO_COMPANY[bu.trim()] ?? BU_TO_COMPANY[bu.trim().toUpperCase()];
  return hit ?? DEFAULT_COMPANY;
};
const buildCombination = (company: string, account: string): string =>
  [company, account, ...RR_REMAINING_SEGMENTS].join('-');

interface AcctLine {
  key: string;
  scheduleId: number;
  trxNumber: number | null;
  periodName: string;
  unit: string;
  tenant: string;
  lineType: 'DR' | 'CR';
  accountCombination: string;
  debit: number;
  credit: number;
  reference1: string;   // trx_number
  reference2: string;   // schedule_id
  reference5: string;   // AR_REVENUE_RECOGNIZATION
}

const buildAcctLines = (rows: RevenueSchedule[]): AcctLine[] => {
  const lines: AcctLine[] = [];
  rows.forEach(s => {
    const company = companyFromBU(s.businessUnit);
    const amount = Number(s.amount) || 0;
    const base = {
      scheduleId: s.id, trxNumber: s.trxNumber, periodName: s.periodName, unit: s.unit, tenant: s.tenant,
      reference1: String(s.trxNumber ?? ''), reference2: String(s.id), reference5: RR_SOURCE,
    };
    lines.push({ ...base, key: `${s.id}-DR`, lineType: 'DR', accountCombination: buildCombination(company, RR_DEBIT_ACCOUNT),  debit: amount, credit: 0 });
    lines.push({ ...base, key: `${s.id}-CR`, lineType: 'CR', accountCombination: buildCombination(company, RR_CREDIT_ACCOUNT), debit: 0, credit: amount });
  });
  return lines;
};

// Parse the contract date strings (MM/DD/YYYY, YYYY-MM-DD, DD-MON-YYYY seen).
const parseFlexDate = (s: string): Date | null => {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);                 // YYYY-MM-DD
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);                // MM/DD/YYYY
  if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
  const d = new Date(t);                                        // DD-MON-YYYY etc.
  return isNaN(d.getTime()) ? null : d;
};

// Inclusive month count, matching CEIL(MONTHS_BETWEEN(end+1, start)) in the DB.
const contractMonths = (startStr: string, endStr: string): number | null => {
  const start = parseFlexDate(startStr);
  const end = parseFlexDate(endStr);
  if (!start || !end) return null;
  const endPlus = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  const diff = (endPlus.getFullYear() - start.getFullYear()) * 12
             + (endPlus.getMonth() - start.getMonth())
             + (endPlus.getDate() - start.getDate()) / 31;
  return Math.max(1, Math.ceil(diff));
};

const RevenueRecognition: React.FC = () => {
  const { user } = useAuth();
  const loggedUser = user?.username || user?.name || 'REACTERP';

  const [tab, setTab] = useState('contracts');

  // Contracts
  const [contracts, setContracts] = useState<RevenueContract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [generating, setGenerating] = useState(false);
  const [contractSearch, setContractSearch] = useState('');

  // Generate-schedule debug modal
  const [genOpen, setGenOpen] = useState(false);
  const [genStatus, setGenStatus] = useState<number | null>(null);
  const [genResponse, setGenResponse] = useState<string>('');

  const GEN_URL = `${APEX_DB_CONFIG.baseUrl}/ar/revenue-schedules/generate`;
  const genPayload = { contractIds: selectedKeys.map(Number), createdBy: loggedUser };

  // Schedules
  const [schedules, setSchedules] = useState<RevenueSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [scheduleSearch, setScheduleSearch] = useState('');

  // Post Revenue — accounting (standard SLA + GL journal flow, like Multiperiod)
  const [postPeriod, setPostPeriod]           = useState<string>();
  // Schedules carry no business unit, so allow the user to pick the Fusion BU
  // that drives ledger + company resolution for accounting.
  const [postBusinessUnit, setPostBusinessUnit] = useState<string>('');
  const [buOptions, setBuOptions] = useState<{ name: string; company: string }[]>([]);
  const [buLoading, setBuLoading] = useState(false);
  const [postSelectedKeys, setPostSelectedKeys] = useState<React.Key[]>([]);
  const [acctPreviewOpen, setAcctPreviewOpen] = useState(false);
  const [acctSchedules, setAcctSchedules]     = useState<RevenueSchedule[]>([]);
  const [acctLines, setAcctLines]             = useState<AcctLine[]>([]);
  const [posting, setPosting]                 = useState(false);
  const [postResults, setPostResults]         = useState<{ schedule: number; trx: number | null; status: string; message: string }[]>([]);

  // Create-accounting debug modal (per-step URL + payload + Run)
  const [acctDebugOpen,   setAcctDebugOpen]   = useState(false);
  const [acctDebugSteps,  setAcctDebugSteps]  = useState<{ step: string; method: string; url: string; payload: any }[]>([]);
  const [acctStepTest,    setAcctStepTest]    = useState<Record<number, { loading: boolean; status: number; body: string }>>({});
  const [acctDebugCtx,    setAcctDebugCtx]    = useState<Record<string, any>>({});
  const [acctDebugHalted, setAcctDebugHalted] = useState(false);
  const [acctDebugLedgerOk, setAcctDebugLedgerOk] = useState(true);
  const [acctDebugBU,     setAcctDebugBU]     = useState('');

  const loadContracts = async () => {
    setContractsLoading(true);
    try { setContracts(await getRevenueContracts()); }
    catch (e: any) { message.error(`Failed to load contracts: ${e.message}`); }
    finally { setContractsLoading(false); }
  };

  const loadSchedules = async () => {
    setSchedulesLoading(true);
    try { setSchedules(await getRevenueSchedules()); }
    catch (e: any) { message.error(`Failed to load schedules: ${e.message}`); }
    finally { setSchedulesLoading(false); }
  };

  // Load business units for the Post Revenue BU picker from the APEX (emparun)
  // backend — GET gl/businessunits — same source the rest of the AR module uses.
  // The company field feeds the runtime BU→company map so the account
  // combination uses the right first segment (falls back to DEFAULT_COMPANY '01').
  const loadBusinessUnits = async () => {
    setBuLoading(true);
    try {
      const res = await fetch(`${APEX_DB_CONFIG.baseUrl}/gl/businessunits`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items: any[] = Array.isArray(data) ? data : (data.items ?? []);
      const opts = items
        .map(it => ({
          name: String(it.business_unit_name ?? it.businessUnitName ?? it.BusinessUnitName ?? '').trim(),
          company: String(it.company ?? it.company_code ?? it.companyCode ?? it.Company ?? '').trim(),
        }))
        .filter(o => o.name)
        .sort((a, b) => a.name.localeCompare(b.name));
      // Feed the runtime company map (upper-cased keys) so companyFromBU resolves.
      opts.forEach(o => { if (o.company) BU_TO_COMPANY[o.name.toUpperCase()] = o.company; });
      setBuOptions(opts);
    } catch (e: any) {
      message.error(`Failed to load business units: ${e.message}`);
    } finally { setBuLoading(false); }
  };

  useEffect(() => { loadContracts(); loadSchedules(); loadBusinessUnits(); }, []);

  const openGenerate = () => {
    if (selectedKeys.length === 0) { message.warning('Select one or more contracts'); return; }
    setGenStatus(null);
    setGenResponse('');
    setGenOpen(true);
  };

  // Runs the POST directly (not via the service) so we can show the exact URL,
  // payload, HTTP status and raw response body for debugging.
  const runGenerate = async () => {
    setGenerating(true);
    setGenStatus(null);
    setGenResponse('');
    try {
      const res = await fetch(GEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(genPayload),
      });
      setGenStatus(res.status);
      const text = await res.text();
      setGenResponse(text);
      let data: any = {};
      try { data = JSON.parse(text); } catch { /* non-JSON response */ }
      if (res.ok && data.success) {
        message.success(`Generated ${data.schedules} schedule line(s) for ${data.contracts} contract(s)`);
        setSelectedKeys([]);
        await Promise.all([loadContracts(), loadSchedules()]);
        setGenOpen(false);
        setTab('schedules');
      } else {
        message.error(data.error || `Generation failed (HTTP ${res.status})`);
      }
    } catch (e: any) {
      setGenResponse(e?.message || 'Network error');
      message.error(e?.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const showApi = () => {
    const c = `GET  ${APEX_DB_CONFIG.baseUrl}/ar/revenue-contracts`;
    const g = `POST ${APEX_DB_CONFIG.baseUrl}/ar/revenue-schedules/generate   { "contractIds":[...] }`;
    const s = `GET  ${APEX_DB_CONFIG.baseUrl}/ar/revenue-schedules`;
    message.info(<div style={{ textAlign: 'left', fontFamily: 'monospace', fontSize: 11 }}>{c}<br />{g}<br />{s}</div>, 8);
  };

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const filteredContracts = useMemo(() => {
    const q = contractSearch.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter(c =>
      [c.trxNumber, c.unit, c.location, c.tenant, c.status].some(v => v != null && String(v).toLowerCase().includes(q)));
  }, [contracts, contractSearch]);

  const filteredSchedules = useMemo(() => {
    const q = scheduleSearch.trim().toLowerCase();
    if (!q) return schedules;
    return schedules.filter(s =>
      [s.trxNumber, s.unit, s.location, s.tenant, s.periodName, s.invoiceNumber, s.status, s.accountStatus]
        .some(v => v != null && String(v).toLowerCase().includes(q)));
  }, [schedules, scheduleSearch]);

  const scheduleTotal = useMemo(() => filteredSchedules.reduce((s, r) => s + (Number(r.amount) || 0), 0), [filteredSchedules]);

  const isBilled = (s: RevenueSchedule) => String(s.status || '').toUpperCase() !== 'PENDING' || !!s.invoiceNumber;
  const isAccounted = (s: RevenueSchedule) => String(s.accountStatus || '').toUpperCase() === 'ACCOUNTED';

  // ── Post Revenue: period list, schedules in the period, and selection ──
  const periodOptions = useMemo(() => {
    const seen = new Map<string, string>();   // name → date (for sort)
    schedules.forEach(s => { if (s.periodName && !seen.has(s.periodName)) seen.set(s.periodName, s.periodDate); });
    return Array.from(seen.entries())
      .sort((a, b) => (a[1] || a[0]).localeCompare(b[1] || b[0]))
      .map(([name]) => name);
  }, [schedules]);

  const postSchedules = useMemo(
    () => (postPeriod ? schedules.filter(s => s.periodName === postPeriod) : []),
    [schedules, postPeriod]);

  const openAcctPreview = () => {
    const chosen = postSchedules.filter(s => postSelectedKeys.includes(s.id));
    if (chosen.length === 0) { message.warning('Select one or more schedules'); return; }
    setAcctSchedules(chosen);
    setAcctLines(buildAcctLines(chosen));
    setPostResults([]);
    setAcctPreviewOpen(true);
  };

  const acctTotals = useMemo(() => ({
    debit:  acctLines.reduce((s, l) => s + l.debit, 0),
    credit: acctLines.reduce((s, l) => s + l.credit, 0),
  }), [acctLines]);

  // ── Standard SLA create-accounting + GL journal (mirrors ManageMultiperiod) ──
  const RR_SOURCE_TABLE = 'RR_AR_REVENUE_SCHEDULE';

  // Accounting date = last day of the period month (end of period). Formats
  // with local Y/M/D parts so it isn't shifted back a day by UTC conversion.
  const scheduleAcctDate = (s: RevenueSchedule): string => {
    const d = parseFlexDate(s.periodDate) || new Date();
    const eom = new Date(d.getFullYear(), d.getMonth() + 1, 0); // day 0 of next month
    return `${eom.getFullYear()}-${String(eom.getMonth() + 1).padStart(2, '0')}-${String(eom.getDate()).padStart(2, '0')}`;
  };
  const schedulePeriodLabel = (s: RevenueSchedule): string =>
    derivePeriodName(parseFlexDate(s.periodDate) || new Date());

  // Effective business unit for a schedule: use the row's BU if present, else
  // fall back to the BU the user typed in the Post Revenue toolbar.
  const buForSchedule = (s: RevenueSchedule): string => (s.businessUnit || postBusinessUnit || '').trim();

  const buildRevenueSlaPayload = (s: RevenueSchedule, ledger: { ledgerId: number; ledgerName: string }, postedBy: string, today: string): SlaCreatePayload => {
    const acctDate = scheduleAcctDate(s);
    const bu = buForSchedule(s);
    const company = companyFromBU(bu);
    const amount = Number(s.amount) || 0;
    return {
      header: {
        moduleName: 'AR', sourceTable: RR_SOURCE_TABLE, sourceId: s.id,
        sourceNumber: String(s.trxNumber ?? s.id), sourceType: 'Revenue Recognition',
        eventTypeCode: RR_SOURCE, eventDate: today, accountingDate: acctDate,
        periodName: schedulePeriodLabel(s), ledgerId: ledger.ledgerId, ledgerName: ledger.ledgerName,
        currencyCode: 'AED', ledgerCurrency: ledger.ledgerName, exchangeRate: 1,
        businessUnit: bu, description: `Revenue Recognition — Trx ${s.trxNumber ?? s.id} — ${s.periodName}`,
        createdBy: postedBy,
      },
      lines: [
        { lineNumber: 1, lineType: 'DR', accountingClass: 'RECEIVABLE', accountCombination: buildCombination(company, RR_DEBIT_ACCOUNT),
          enteredDr: amount, enteredCr: 0, accountedDr: amount, accountedCr: 0, currencyCode: 'AED', exchangeRate: 1,
          description: `Dr ${RR_DEBIT_ACCOUNT} — ${s.periodName}`, sourceLineId: s.id, sourceLineNumber: 1 },
        { lineNumber: 2, lineType: 'CR', accountingClass: 'REVENUE', accountCombination: buildCombination(company, RR_CREDIT_ACCOUNT),
          enteredDr: 0, enteredCr: amount, accountedDr: 0, accountedCr: amount, currencyCode: 'AED', exchangeRate: 1,
          description: `Cr ${RR_CREDIT_ACCOUNT} — ${s.periodName}`, sourceLineId: s.id, sourceLineNumber: 2 },
      ],
    };
  };

  const buildRevenueGlOpts = (s: RevenueSchedule, ledger: { ledgerId: number; ledgerName: string }, postedBy: string, slaHeaderId: number): GlPostingOptions => {
    const acctDate = scheduleAcctDate(s);
    const bu = buForSchedule(s);
    const company = companyFromBU(bu);
    const amount = Number(s.amount) || 0;
    return {
      slaHeaderId, sourceNumber: String(s.trxNumber ?? s.id), sourceId: s.id,
      eventTypeCode: RR_SOURCE, periodName: schedulePeriodLabel(s), ledgerName: ledger.ledgerName,
      ledgerId: ledger.ledgerId, currency: 'AED', accountingDate: acctDate, legalEntity: '',
      businessUnit: bu, jeCategory: 'Revenue', jeSource: 'Receivables', batchSource: 'Receivables',
      createdBy: postedBy,
      lines: [
        { lineType: 'DR', enteredDr: amount, enteredCr: 0, accountedDr: amount, accountedCr: 0,
          description: `Dr ${RR_DEBIT_ACCOUNT} — ${s.periodName}`, currencyCode: 'AED', accountingDate: acctDate,
          accountCombination: buildCombination(company, RR_DEBIT_ACCOUNT), accountingClass: 'RECEIVABLE', legalEntity: null },
        { lineType: 'CR', enteredDr: 0, enteredCr: amount, accountedDr: 0, accountedCr: amount,
          description: `Cr ${RR_CREDIT_ACCOUNT} — ${s.periodName}`, currencyCode: 'AED', accountingDate: acctDate,
          accountCombination: buildCombination(company, RR_CREDIT_ACCOUNT), accountingClass: 'REVENUE', legalEntity: null },
      ],
    };
  };

  // Post one schedule end-to-end: ledger → dup check → SLA (reuse/create) →
  // create+post GL journal (reference1=trx, reference2=schedule, reference5=source).
  const postRevenueSchedule = async (s: RevenueSchedule, postedBy: string, today: string): Promise<{ status: 'success' | 'skipped' | 'error'; message: string }> => {
    const bu = buForSchedule(s);
    const ledger = await fetchLedgerByBusinessUnit(bu);
    if (!ledger) return { status: 'error', message: `No ledger for BU '${bu || '—'}' — set the Business Unit field` };

    const dup = await checkGLJournalExists(String(s.trxNumber ?? ''), s.id, RR_SOURCE);
    if (dup.exists && dup.status === 'P') return { status: 'skipped', message: `Already accounted — GL batch ${dup.batchId}` };

    const slaExists = await checkAccountingExists(RR_SOURCE_TABLE, s.id, RR_SOURCE);
    const slaHeaderId = (slaExists.exists && slaExists.headerId)
      ? slaExists.headerId
      : (await createAccounting(buildRevenueSlaPayload(s, ledger, postedBy, today))).headerId;

    const glRes = await postSlaToGL(buildRevenueGlOpts(s, ledger, postedBy, slaHeaderId));
    if (!glRes.success) return { status: 'error', message: glRes.error || 'GL posting failed' };

    // Stamp the revenue schedule accounted (best-effort — don't fail the post).
    let markNote = '';
    try { await markRevenueScheduleAccounted(s.id, { slaHeaderId, updatedBy: postedBy }); }
    catch (e: any) { markNote = ` · schedule not stamped (${e.message})`; }
    return { status: 'success', message: `SLA #${slaHeaderId} — GL ${glRes.batchName}${glRes.skipped ? ' (reused)' : ''}${markNote}` };
  };

  const runCreateAccounting = async () => {
    if (acctSchedules.length === 0) return;
    setPosting(true); setPostResults([]);
    const postedBy = loggedUser;
    const today = new Date().toISOString().split('T')[0];
    const results: { schedule: number; trx: number | null; status: string; message: string }[] = [];
    for (const s of acctSchedules) {
      try {
        const r = await postRevenueSchedule(s, postedBy, today);
        results.push({ schedule: s.id, trx: s.trxNumber, status: r.status, message: r.message });
      } catch (e: any) {
        results.push({ schedule: s.id, trx: s.trxNumber, status: 'error', message: String(e.message) });
      }
      setPostResults([...results]);
    }
    setPosting(false);
    const ok = results.filter(r => r.status === 'success').length;
    const skip = results.filter(r => r.status === 'skipped').length;
    const err = results.filter(r => r.status === 'error').length;
    if (err === 0) message.success(`Accounting created: ${ok} posted${skip ? `, ${skip} already accounted` : ''}`);
    else message.warning(`Posted ${ok}, skipped ${skip}, failed ${err}`);
    await loadSchedules();
  };

  // ── Create-accounting debug: build all steps for the first selected schedule ──
  const openAcctDebug = async () => {
    const chosen = postSchedules.filter(s => postSelectedKeys.includes(s.id));
    const s = chosen[0];
    if (!s) { message.warning('Select a schedule to debug'); return; }
    const postedBy = loggedUser;
    const today = new Date().toISOString().split('T')[0];
    const base = APEX_DB_CONFIG.baseUrl;
    const bu = buForSchedule(s);
    const ledger = await fetchLedgerByBusinessUnit(bu).catch(() => null);
    // Always build the real SLA/GL request bodies so the JSON is visible in the
    // debug modal even when the ledger can't be resolved — use a placeholder
    // ledger and surface the resolution problem as a warning instead.
    const effLedger = ledger ?? { ledgerId: 0, ledgerName: '(unresolved)' };
    const slaPayload = buildRevenueSlaPayload(s, effLedger, postedBy, today);
    const batchName = makeBatchName(RR_SOURCE, String(s.trxNumber ?? s.id));
    const glPayload = buildGlJournalPayload(buildRevenueGlOpts(s, effLedger, postedBy, 0), batchName);
    setAcctDebugLedgerOk(!!ledger);
    setAcctDebugBU(bu);
    setAcctDebugSteps([
      { step: `1 — Ledger by BU (${bu || '—'})`, method: 'GET',
        url: `${base}/gl/getledgername?P_BUSINESS_UNIT_NAME=${encodeURIComponent(bu)}`, payload: null },
      { step: `2 — Duplicate check (Ref2=${s.id}, Ref5=${RR_SOURCE})`, method: 'GET',
        url: `${base}/gl/journals/check?reference1=${encodeURIComponent(String(s.trxNumber ?? ''))}&reference2=${s.id}&reference5=${RR_SOURCE}`, payload: null },
      { step: '3 — Create SLA accounting', method: 'POST', url: `${base}/sla/accounting/create`, payload: slaPayload },
      { step: '4 — Create GL journal', method: 'POST', url: `${base}/journals/create`, payload: glPayload },
      { step: '5 — Post journal to GL', method: 'PUT', url: `${base}/gl/journals/{batchId}/post`, payload: {} },
      { step: '6 — Stamp SLA header POSTED', method: 'POST', url: `${base}/sla/accounting/post`,
        payload: { headerId: '{slaHeaderId}', glBatchId: '{batchId}', glBatchName: batchName, glHeaderId: '{glHeaderId}', postedBy } },
      { step: `7 — Update revenue schedule (schedule ${s.id})`, method: 'POST', url: `${base}/ar/revenue-schedules/mark-accounted`,
        payload: { scheduleId: s.id, slaHeaderId: '{slaHeaderId}', accountStatus: 'ACCOUNTED', updatedBy: postedBy } },
    ]);
    setAcctStepTest({});
    setAcctDebugCtx({ batchName });
    setAcctDebugHalted(false);
    setAcctDebugOpen(true);
  };

  const runAcctDebugStep = async (idx: number) => {
    const s = acctDebugSteps[idx];
    if (!s) return;
    const isDupCheck = s.url.includes('/gl/journals/check');
    if (acctDebugHalted && !isDupCheck) { message.warning('Journal already exists — remaining steps are halted. Re-open the debug modal to reset.'); return; }
    setAcctStepTest(prev => ({ ...prev, [idx]: { loading: true, status: 0, body: '' } }));
    try {
      const url = resolveTokens(s.url, acctDebugCtx);
      const payload = s.payload ? resolveTokens(s.payload, acctDebugCtx) : null;

      // SLA create — reuse an existing header instead of creating a duplicate.
      if (s.url.includes('/sla/accounting/create') && payload?.header?.sourceId != null) {
        const h = payload.header;
        const chk = await checkAccountingExists(h.sourceTable, h.sourceId, h.eventTypeCode);
        if (chk.exists && chk.headerId) {
          setAcctDebugCtx(prev => ({ ...prev, slaHeaderId: chk.headerId }));
          setAcctStepTest(prev => ({ ...prev, [idx]: { loading: false, status: 200, body: `SLA already exists for schedule ${h.sourceId} — reusing headerId ${chk.headerId}. No duplicate created.\n\n${JSON.stringify(chk, null, 2)}` } }));
          message.info(`SLA already exists — reusing header #${chk.headerId}`);
          return;
        }
      }

      const hasBody = s.method === 'POST' || s.method === 'PUT';
      const res = await fetch(url, {
        method: s.method,
        headers: hasBody ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
        body: hasBody && payload && !payload.error ? JSON.stringify(payload) : undefined,
      });
      const text = await res.text();
      let data: any = null, pretty = text;
      try { data = JSON.parse(text); pretty = JSON.stringify(data, null, 2); } catch { /* not json */ }
      setAcctStepTest(prev => ({ ...prev, [idx]: { loading: false, status: res.status, body: pretty } }));

      if (data && res.ok) {
        if (isDupCheck) {
          if (data.exists) {
            setAcctDebugCtx(prev => ({ ...prev, batchId: data.batchId ?? prev.batchId, glHeaderId: data.headerId ?? prev.glHeaderId }));
            setAcctDebugHalted(true);
            message.warning(`Journal already exists (GL batch ${data.batchId ?? '—'}) — remaining steps halted.`);
          }
        } else if (s.url.includes('/gl/getledgername')) {
          const item = data.items?.[0];
          if (item) setAcctDebugCtx(prev => ({ ...prev, ledgerId: item.ledger_id, ledgerName: item.ledger_name }));
        } else if (s.url.includes('/sla/accounting/create')) {
          if (data.headerId != null) setAcctDebugCtx(prev => ({ ...prev, slaHeaderId: data.headerId }));
        } else if (s.url.includes('/journals/create')) {
          const batchId    = data.jeBatchId  ?? data.je_batch_id  ?? data.batchId  ?? null;
          const glHeaderId = data.jeHeaderId ?? data.je_header_id ?? data.headerId ?? null;
          setAcctDebugCtx(prev => ({ ...prev, batchId: batchId ?? prev.batchId, glHeaderId: glHeaderId ?? prev.glHeaderId }));
        }
      }
    } catch (e: any) {
      setAcctStepTest(prev => ({ ...prev, [idx]: { loading: false, status: 0, body: e?.message ?? 'Network error' } }));
    }
  };

  // Pivot: one row per contract, one column per month (chronological).
  const matrix = useMemo(() => {
    const months: { name: string; date: string }[] = [];
    const seen = new Set<string>();
    const byContract = new Map<number, any>();
    filteredSchedules.forEach(s => {
      if (!seen.has(s.periodName)) { seen.add(s.periodName); months.push({ name: s.periodName, date: s.periodDate }); }
      let row = byContract.get(s.contractId);
      if (!row) { row = { key: s.contractId, contractId: s.contractId, trxNumber: s.trxNumber, unit: s.unit, tenant: s.tenant, total: 0, billedAmount: 0, balance: 0, totalPeriods: 0, billedPeriods: 0, remainingPeriods: 0, cells: {} as Record<string, RevenueSchedule> }; byContract.set(s.contractId, row); }
      row.cells[s.periodName] = s;
      const amt = Number(s.amount) || 0;
      row.total += amt;
      row.totalPeriods += 1;
      if (isBilled(s)) { row.billedAmount += amt; row.billedPeriods += 1; }
    });
    months.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const rows = Array.from(byContract.values()).map((r: any) => ({
      ...r,
      balance: r.total - r.billedAmount,
      remainingPeriods: r.totalPeriods - r.billedPeriods,
    }));
    // Grand totals across all contracts
    const totals = rows.reduce((a: any, r: any) => ({
      total: a.total + r.total, billedAmount: a.billedAmount + r.billedAmount, balance: a.balance + r.balance,
      totalPeriods: a.totalPeriods + r.totalPeriods, billedPeriods: a.billedPeriods + r.billedPeriods, remainingPeriods: a.remainingPeriods + r.remainingPeriods,
    }), { total: 0, billedAmount: 0, balance: 0, totalPeriods: 0, billedPeriods: 0, remainingPeriods: 0 });
    return { months, rows, totals };
  }, [filteredSchedules]);

  const matrixColumns: ColumnsType<any> = useMemo(() => [
    { title: 'Trx #', dataIndex: 'trxNumber', key: 'trxNumber', width: 90, fixed: 'left' as const, render: (v: any) => <Text strong>{v ?? '—'}</Text> },
    { title: 'Unit', dataIndex: 'unit', key: 'unit', width: 110, fixed: 'left' as const },
    { title: 'Tenant', dataIndex: 'tenant', key: 'tenant', width: 150, fixed: 'left' as const, ellipsis: true },
    ...matrix.months.map(m => ({
      title: m.name, key: m.name, width: 110, align: 'center' as const,
      render: (_: any, row: any) => {
        const s: RevenueSchedule | undefined = row.cells[m.name];
        if (!s) return <Text type="secondary">—</Text>;
        const billed = isBilled(s);
        return (
          <Tooltip title={`Billed: ${billed ? 'Yes' : 'No'} · Accounted: ${isAccounted(s) ? 'Yes' : 'No'}${s.invoiceNumber ? ` · Inv ${s.invoiceNumber}` : ''}`}>
            <div style={{ lineHeight: 1.3 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmt(s.amount)}</div>
              <div>
                {billed ? <CheckCircleTwoTone twoToneColor="#1D7B4D" /> : <CloseCircleTwoTone twoToneColor="#C74634" />}
                {isAccounted(s) && <Tag color="green" style={{ marginLeft: 4, fontSize: 9, padding: '0 4px', lineHeight: '14px' }}>Acct</Tag>}
              </div>
            </div>
          </Tooltip>
        );
      },
    })),
    { title: 'Total Amount', dataIndex: 'total', key: 'total', width: 120, align: 'right' as const, fixed: 'right' as const,
      render: (v: number) => <Text strong style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text> },
    { title: 'Billed', dataIndex: 'billedAmount', key: 'billedAmount', width: 110, align: 'right' as const, fixed: 'right' as const,
      render: (v: number) => <Text style={{ fontFamily: 'monospace', color: REDWOOD.success }}>{fmt(v)}</Text> },
    { title: 'Balance', dataIndex: 'balance', key: 'balance', width: 120, align: 'right' as const, fixed: 'right' as const,
      render: (v: number) => <Text strong style={{ fontFamily: 'monospace', color: REDWOOD.primary }}>{fmt(v)}</Text> },
    { title: 'Periods', key: 'periods', width: 130, align: 'center' as const, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Tooltip title={`Total ${r.totalPeriods} · Billed ${r.billedPeriods} · Remaining ${r.remainingPeriods}`}>
          <Text style={{ fontSize: 12 }}>
            <Tag color="green" style={{ marginInlineEnd: 2 }}>{r.billedPeriods}</Tag>
            /<Tag color="orange" style={{ margin: '0 2px' }}>{r.remainingPeriods}</Tag>
            / {r.totalPeriods}
          </Text>
        </Tooltip>
      ) },
  ], [matrix.months]);

  // ── Columns ────────────────────────────────────────────────────────────────
  const contractCols: ColumnsType<RevenueContract> = [
    { title: 'Trx #', dataIndex: 'trxNumber', key: 'trxNumber', width: 100, sorter: (a, b) => (a.trxNumber || 0) - (b.trxNumber || 0),
      render: (v) => <Text strong>{v ?? '—'}</Text> },
    { title: 'Unit', dataIndex: 'unit', key: 'unit', width: 120 },
    { title: 'Location', dataIndex: 'location', key: 'location', width: 150, ellipsis: true },
    { title: 'Tenant', dataIndex: 'tenant', key: 'tenant', width: 180, ellipsis: true },
    { title: 'Start', dataIndex: 'contractStartDate', key: 'contractStartDate', width: 110 },
    { title: 'End', dataIndex: 'contractEndDate', key: 'contractEndDate', width: 110 },
    { title: 'Total Periods', key: 'periods', width: 110, align: 'center' as const,
      render: (_: any, r: RevenueContract) => {
        const n = contractMonths(r.contractStartDate, r.contractEndDate);
        return n == null ? <Text type="secondary">—</Text> : <Tag color="purple">{n} mo</Tag>;
      } },
    { title: 'Rent Total', dataIndex: 'rentTotal', key: 'rentTotal', width: 130, align: 'right' as const,
      sorter: (a, b) => (a.rentTotal || 0) - (b.rentTotal || 0),
      render: (v) => <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={String(v).toUpperCase() === 'ACTIVE' ? 'green' : 'default'}>{v || '—'}</Tag> },
    { title: 'Schedules', dataIndex: 'scheduleCount', key: 'scheduleCount', width: 100, align: 'center' as const,
      render: (v: number) => v > 0 ? <Tag color="blue">{v}</Tag> : <Text type="secondary">—</Text> },
  ];

  const scheduleCols: ColumnsType<RevenueSchedule> = [
    { title: 'Trx #', dataIndex: 'trxNumber', key: 'trxNumber', width: 90, sorter: (a, b) => (a.trxNumber || 0) - (b.trxNumber || 0),
      render: (v) => <Text strong>{v ?? '—'}</Text> },
    { title: 'Invoice #', dataIndex: 'invoiceNumber', key: 'invoiceNumber', width: 120,
      render: (v: string) => v || <Text type="secondary">—</Text> },
    { title: 'Unit', dataIndex: 'unit', key: 'unit', width: 110 },
    { title: 'Location', dataIndex: 'location', key: 'location', width: 140, ellipsis: true },
    { title: 'Tenant', dataIndex: 'tenant', key: 'tenant', width: 160, ellipsis: true },
    { title: '#', dataIndex: 'scheduleNum', key: 'scheduleNum', width: 55, align: 'right' as const },
    { title: 'Month', dataIndex: 'periodName', key: 'periodName', width: 90,
      render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right' as const,
      sorter: (a, b) => (a.amount || 0) - (b.amount || 0),
      render: (v) => <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={String(v).toUpperCase() === 'PENDING' ? 'orange' : 'green'}>{v || '—'}</Tag> },
    { title: 'Acct Status', dataIndex: 'accountStatus', key: 'accountStatus', width: 120,
      render: (v: string) => <Tag color={String(v).toUpperCase() === 'ACCOUNTED' ? 'green' : 'default'}>{v || '—'}</Tag> },
  ];

  const saveWb = (wb: XLSX.WorkBook, name: string) => {
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf], { type: 'application/octet-stream' }), `${name}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportContracts = () => {
    if (filteredContracts.length === 0) { message.warning('No contracts to export'); return; }
    const data = filteredContracts.map(c => ({
      'Trx #': c.trxNumber, 'Unit': c.unit, 'Location': c.location, 'Tenant': c.tenant,
      'Start': c.contractStartDate, 'End': c.contractEndDate,
      'Total Periods': contractMonths(c.contractStartDate, c.contractEndDate) ?? '',
      'Rent Total': Number(c.rentTotal) || 0, 'Status': c.status, 'Schedules': c.scheduleCount,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Revenue Contracts');
    saveWb(wb, 'revenue_contracts');
  };

  const exportMatrix = () => {
    if (matrix.rows.length === 0) { message.warning('No schedules to export'); return; }
    const data = matrix.rows.map((r: any) => {
      const row: Record<string, any> = { 'Trx #': r.trxNumber, 'Unit': r.unit, 'Tenant': r.tenant };
      matrix.months.forEach(m => { row[m.name] = Number(r.cells[m.name]?.amount) || 0; });
      row['Total Amount'] = r.total;
      row['Billed'] = r.billedAmount;
      row['Balance'] = r.balance;
      row['Billed Periods'] = r.billedPeriods;
      row['Remaining Periods'] = r.remainingPeriods;
      row['Total Periods'] = r.totalPeriods;
      return row;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Schedule Matrix');
    saveWb(wb, 'revenue_matrix');
  };

  const exportSchedules = () => {
    if (filteredSchedules.length === 0) { message.warning('No schedules to export'); return; }
    const data = filteredSchedules.map(s => ({
      'Trx #': s.trxNumber, 'Invoice #': s.invoiceNumber || '', 'Unit': s.unit, 'Location': s.location,
      'Tenant': s.tenant, 'Schedule #': s.scheduleNum, 'Month': s.periodName, 'Period Date': s.periodDate,
      'Amount': Number(s.amount) || 0, 'Status': s.status, 'Account Status': s.accountStatus,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Revenue Schedules');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf], { type: 'application/octet-stream' }), `revenue_schedules_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
      <Content>
        <div style={{ padding: '16px 24px 0' }}>
          <Breadcrumb items={[
            { title: <Link to="/"><HomeOutlined /> Home</Link> },
            { title: <Link to="/ar">Receivables</Link> },
            { title: 'Revenue Recognition' },
          ]} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0' }}>
            <div>
              <Title level={3} style={{ margin: 0 }}>Revenue Recognition</Title>
              <Text type="secondary">Generate monthly revenue schedules from rental contracts</Text>
            </div>
            <Tooltip title="Show API endpoints">
              <Button icon={<ApiOutlined />} onClick={showApi}>API</Button>
            </Tooltip>
          </div>
        </div>

        <div style={{ padding: '0 24px 24px' }}>
          <Card styles={{ body: { padding: 12 } }}>
            <Tabs
              activeKey={tab}
              onChange={setTab}
              items={[
                {
                  key: 'contracts',
                  label: `Revenue Contracts (${contracts.length})`,
                  children: (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                        <Input allowClear prefix={<SearchOutlined />} placeholder="Filter contracts…"
                          value={contractSearch} onChange={e => setContractSearch(e.target.value)} style={{ width: 260 }} />
                        <Space>
                          <Button icon={<FileExcelOutlined />} style={{ color: REDWOOD.success, borderColor: REDWOOD.success }} onClick={exportContracts}>Excel</Button>
                          <Button icon={<ReloadOutlined />} onClick={loadContracts} loading={contractsLoading}>Refresh</Button>
                          <Button type="primary" icon={<ThunderboltOutlined />}
                            disabled={selectedKeys.length === 0}
                            style={selectedKeys.length > 0 ? { background: REDWOOD.primary, borderColor: REDWOOD.primary } : {}}
                            onClick={openGenerate}>
                            Generate Schedule ({selectedKeys.length})
                          </Button>
                        </Space>
                      </div>
                      <Table
                        rowKey="id"
                        columns={contractCols}
                        dataSource={filteredContracts}
                        loading={contractsLoading}
                        size="small"
                        scroll={{ x: 1100 }}
                        rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
                        pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'], showTotal: (t) => `${t} contracts` }}
                      />
                    </>
                  ),
                },
                {
                  key: 'schedules',
                  label: `Revenue Schedules (${schedules.length})`,
                  children: (
                    <>
                      <Row gutter={12} style={{ marginBottom: 12 }}>
                        <Col xs={12} md={6}>
                          <Card size="small"><Statistic title={<Text style={{ fontSize: 11 }}>Schedule Lines</Text>} value={filteredSchedules.length} valueStyle={{ fontSize: 16 }} /></Card>
                        </Col>
                        <Col xs={12} md={6}>
                          <Card size="small"><Statistic title={<Text style={{ fontSize: 11 }}>Total Amount</Text>} value={scheduleTotal} precision={2} prefix={<DollarOutlined />} valueStyle={{ fontSize: 15, color: REDWOOD.primary }} /></Card>
                        </Col>
                      </Row>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                        <Input allowClear prefix={<SearchOutlined />} placeholder="Filter schedules…"
                          value={scheduleSearch} onChange={e => setScheduleSearch(e.target.value)} style={{ width: 260 }} />
                        <Space>
                          <Button icon={<FileExcelOutlined />} style={{ color: REDWOOD.success, borderColor: REDWOOD.success }} onClick={exportSchedules}>Excel</Button>
                          <Button icon={<ReloadOutlined />} onClick={loadSchedules} loading={schedulesLoading}>Refresh</Button>
                        </Space>
                      </div>
                      <Table
                        rowKey="id"
                        columns={scheduleCols}
                        dataSource={filteredSchedules}
                        loading={schedulesLoading}
                        size="small"
                        scroll={{ x: 1150 }}
                        pagination={{ pageSize: 100, showSizeChanger: true, pageSizeOptions: ['50', '100', '200', '500'], showTotal: (t) => `${t} schedule lines` }}
                        summary={() => filteredSchedules.length === 0 ? null : (
                          <Table.Summary fixed>
                            <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 600 }}>
                              <Table.Summary.Cell index={0} colSpan={7}><Text strong>Total ({filteredSchedules.length})</Text></Table.Summary.Cell>
                              <Table.Summary.Cell index={7} align="right"><Text strong style={{ fontFamily: 'monospace', color: REDWOOD.primary }}>{fmt(scheduleTotal)}</Text></Table.Summary.Cell>
                              <Table.Summary.Cell index={8} colSpan={2} />
                            </Table.Summary.Row>
                          </Table.Summary>
                        )}
                      />
                    </>
                  ),
                },
                {
                  key: 'matrix',
                  label: <Space size={4}><TableOutlined />Schedule Matrix</Space>,
                  children: (
                    <>
                      <Row gutter={12} style={{ marginBottom: 12 }}>
                        <Col xs={12} md={5}><Card size="small"><Statistic title={<Text style={{ fontSize: 11 }}>Contract Total</Text>} value={matrix.totals.total} precision={2} valueStyle={{ fontSize: 15 }} /></Card></Col>
                        <Col xs={12} md={5}><Card size="small"><Statistic title={<Text style={{ fontSize: 11 }}>Total Billed</Text>} value={matrix.totals.billedAmount} precision={2} valueStyle={{ fontSize: 15, color: REDWOOD.success }} /></Card></Col>
                        <Col xs={12} md={5}><Card size="small"><Statistic title={<Text style={{ fontSize: 11 }}>Balance</Text>} value={matrix.totals.balance} precision={2} valueStyle={{ fontSize: 15, color: REDWOOD.primary }} /></Card></Col>
                        <Col xs={12} md={9}><Card size="small"><Statistic title={<Text style={{ fontSize: 11 }}>Periods (billed / remaining / total)</Text>} valueRender={() => (
                          <Space size={4}>
                            <Tag color="green" style={{ fontSize: 13 }}>{matrix.totals.billedPeriods}</Tag>/
                            <Tag color="orange" style={{ fontSize: 13 }}>{matrix.totals.remainingPeriods}</Tag>/
                            <Text strong>{matrix.totals.totalPeriods}</Text>
                          </Space>
                        )} /></Card></Col>
                      </Row>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                        <Space wrap>
                          <Input allowClear prefix={<SearchOutlined />} placeholder="Filter…"
                            value={scheduleSearch} onChange={e => setScheduleSearch(e.target.value)} style={{ width: 240 }} />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            <CheckCircleTwoTone twoToneColor="#1D7B4D" /> billed &nbsp; <CloseCircleTwoTone twoToneColor="#C74634" /> not billed &nbsp; <Tag color="green" style={{ fontSize: 9 }}>Acct</Tag> accounted
                          </Text>
                        </Space>
                        <Space>
                          <Button icon={<FileExcelOutlined />} style={{ color: REDWOOD.success, borderColor: REDWOOD.success }} onClick={exportMatrix}>Excel</Button>
                          <Button icon={<ReloadOutlined />} onClick={loadSchedules} loading={schedulesLoading}>Refresh</Button>
                        </Space>
                      </div>
                      <Table
                        rowKey="key"
                        columns={matrixColumns}
                        dataSource={matrix.rows}
                        loading={schedulesLoading}
                        size="small"
                        bordered
                        scroll={{ x: 300 + matrix.months.length * 110 + 480 }}
                        pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: (t) => `${t} contracts` }}
                        locale={{ emptyText: 'No schedules — generate them from the Contracts tab' }}
                        summary={() => matrix.rows.length === 0 ? null : (
                          <Table.Summary fixed>
                            <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 700 }}>
                              <Table.Summary.Cell index={0} colSpan={3}><Text strong>Grand Total ({matrix.rows.length})</Text></Table.Summary.Cell>
                              {matrix.months.map((m, i) => (
                                <Table.Summary.Cell key={m.name} index={3 + i} align="center">
                                  <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>
                                    {fmt(matrix.rows.reduce((s: number, r: any) => s + (Number(r.cells[m.name]?.amount) || 0), 0))}
                                  </Text>
                                </Table.Summary.Cell>
                              ))}
                              <Table.Summary.Cell index={3 + matrix.months.length} align="right"><Text strong style={{ fontFamily: 'monospace' }}>{fmt(matrix.totals.total)}</Text></Table.Summary.Cell>
                              <Table.Summary.Cell index={4 + matrix.months.length} align="right"><Text strong style={{ fontFamily: 'monospace', color: REDWOOD.success }}>{fmt(matrix.totals.billedAmount)}</Text></Table.Summary.Cell>
                              <Table.Summary.Cell index={5 + matrix.months.length} align="right"><Text strong style={{ fontFamily: 'monospace', color: REDWOOD.primary }}>{fmt(matrix.totals.balance)}</Text></Table.Summary.Cell>
                              <Table.Summary.Cell index={6 + matrix.months.length} align="center">
                                <Text style={{ fontSize: 11 }}>{matrix.totals.billedPeriods}/{matrix.totals.remainingPeriods}/{matrix.totals.totalPeriods}</Text>
                              </Table.Summary.Cell>
                            </Table.Summary.Row>
                          </Table.Summary>
                        )}
                      />
                    </>
                  ),
                },
                {
                  key: 'post-revenue',
                  label: <Space size={4}><AuditOutlined />Post Revenue</Space>,
                  children: (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                        <Space wrap>
                          <Text style={{ fontSize: 12, color: REDWOOD.neutral500 }}>
                            <span style={{ color: REDWOOD.primary, marginRight: 2 }}>*</span>Business Unit
                          </Text>
                          <Select showSearch allowClear placeholder="Select business unit"
                            status={postBusinessUnit ? undefined : 'error'}
                            loading={buLoading} value={postBusinessUnit || undefined}
                            onChange={(v) => setPostBusinessUnit(v || '')}
                            style={{ width: 240 }}
                            optionFilterProp="label"
                            options={buOptions.map(o => ({
                              label: o.company ? `${o.name} (Co ${o.company})` : o.name, value: o.name }))}
                            notFoundContent={buLoading ? 'Loading…' : 'No business units'} />
                          <Text style={{ fontSize: 12, color: REDWOOD.neutral500 }}>
                            <span style={{ color: REDWOOD.primary, marginRight: 2 }}>*</span>Period
                          </Text>
                          <Select showSearch placeholder="Select accounting period"
                            status={postPeriod ? undefined : 'error'}
                            value={postPeriod} onChange={(v) => { setPostPeriod(v); setPostSelectedKeys([]); }}
                            style={{ width: 220 }} options={periodOptions.map(p => ({ label: p, value: p }))}
                            notFoundContent={schedules.length === 0 ? 'Load schedules first' : 'No periods'} />
                          {postPeriod
                            ? <Text type="secondary" style={{ fontSize: 12 }}>
                                {postSchedules.length} schedule(s) · {postSelectedKeys.length} selected
                              </Text>
                            : <Text style={{ fontSize: 12, color: REDWOOD.primary }}>Select a period to list schedules</Text>}
                        </Space>
                        <Space>
                          <Button type="primary" icon={<AuditOutlined />} disabled={postSelectedKeys.length === 0}
                            style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                            onClick={openAcctPreview}>
                            Create Accounting ({postSelectedKeys.length})
                          </Button>
                          <Button icon={<ApiOutlined />} disabled={postSelectedKeys.length === 0} onClick={openAcctDebug}>Debug</Button>
                          <Button icon={<ReloadOutlined />} onClick={loadSchedules} loading={schedulesLoading}>Refresh</Button>
                        </Space>
                      </div>
                      <Table
                        rowKey="id"
                        size="small"
                        loading={schedulesLoading}
                        dataSource={postSchedules}
                        pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: (t) => `${t} schedules` }}
                        rowSelection={{ selectedRowKeys: postSelectedKeys, onChange: setPostSelectedKeys,
                          getCheckboxProps: (r) => ({ disabled: isAccounted(r) }) }}
                        locale={{ emptyText: postPeriod ? 'No schedules for this period' : 'Select a period to list schedules' }}
                        columns={[
                          { title: 'Business Unit', key: 'businessUnit', width: 200, ellipsis: true, render: (_: any, r: RevenueSchedule) => {
                            const bu = buForSchedule(r);
                            return bu ? bu : <span style={{ color: REDWOOD.neutral500 }}>— select BU —</span>;
                          } },
                          { title: 'Schedule ID', dataIndex: 'id', width: 100, render: (v: number) => <Text code>{v}</Text> },
                          { title: 'Trx #', dataIndex: 'trxNumber', width: 90, render: (v: any) => <Text strong>{v ?? '—'}</Text> },
                          { title: 'Invoice #', dataIndex: 'invoiceNumber', width: 120, render: (v: any) => v || <span style={{ color: REDWOOD.neutral500 }}>—</span> },
                          { title: 'Unit', dataIndex: 'unit', width: 110 },
                          { title: 'Tenant', dataIndex: 'tenant', width: 170, ellipsis: true },
                          { title: 'Company', key: 'company', width: 90, render: (_: any, r: RevenueSchedule) => <Tag color="blue">{companyFromBU(buForSchedule(r))}</Tag> },
                          { title: '#', dataIndex: 'scheduleNum', width: 55, align: 'right' as const },
                          { title: 'Amount', dataIndex: 'amount', width: 120, align: 'right' as const, render: (v: number) => <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text> },
                          { title: 'Billed', key: 'billed', width: 70, align: 'center' as const, render: (_: any, r: RevenueSchedule) => isBilled(r) ? <CheckCircleTwoTone twoToneColor="#1D7B4D" /> : <CloseCircleTwoTone twoToneColor="#C74634" /> },
                          { title: 'Accounted', key: 'acct', width: 90, align: 'center' as const, render: (_: any, r: RevenueSchedule) => isAccounted(r) ? <Tag color="green">Accounted</Tag> : <Tag>Pending</Tag> },
                        ]}
                        summary={() => postSchedules.length === 0 ? null : (
                          <Table.Summary fixed>
                            <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 700 }}>
                              <Table.Summary.Cell index={0} colSpan={8}><Text strong>Total ({postSchedules.length})</Text></Table.Summary.Cell>
                              <Table.Summary.Cell index={8} align="right"><Text strong style={{ fontFamily: 'monospace' }}>{fmt(postSchedules.reduce((s, r) => s + (Number(r.amount) || 0), 0))}</Text></Table.Summary.Cell>
                              <Table.Summary.Cell index={9} colSpan={2} />
                            </Table.Summary.Row>
                          </Table.Summary>
                        )}
                      />
                    </>
                  ),
                },
              ]}
            />
          </Card>
        </div>

        {/* ── Generate Schedule — debug/confirm modal ── */}
        <Modal
          open={genOpen}
          onCancel={() => { if (!generating) setGenOpen(false); }}
          maskClosable={!generating}
          width={720}
          title={<Space><ThunderboltOutlined style={{ color: REDWOOD.primary }} /><span>Generate Revenue Schedule</span></Space>}
          footer={
            <Space>
              <Button disabled={generating} onClick={() => setGenOpen(false)}>Close</Button>
              <Button type="primary" loading={generating}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                onClick={runGenerate}>
                Run Generate ({selectedKeys.length})
              </Button>
            </Space>
          }
        >
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Method / URL</div>
          <Typography.Text copyable code style={{ fontSize: 12, wordBreak: 'break-all' }}>{`POST ${GEN_URL}`}</Typography.Text>

          <div style={{ fontSize: 12, color: '#888', margin: '12px 0 4px' }}>Request Body (JSON)</div>
          <pre style={{ fontSize: 11, background: '#0d0d0d', color: '#a8ff78', borderRadius: 4, padding: 10, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(genPayload, null, 2)}
          </pre>

          {genStatus != null && (
            <>
              <div style={{ fontSize: 12, color: '#888', margin: '12px 0 4px' }}>
                Response — HTTP <b style={{ color: genStatus >= 200 && genStatus < 300 ? REDWOOD.success : REDWOOD.primary }}>{genStatus}</b>
              </div>
              <pre style={{ fontSize: 11, background: '#0d0d0d', color: '#79c0ff', borderRadius: 4, padding: 10, maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {genResponse || '(empty)'}
              </pre>
              {genStatus === 404 && (
                <Alert type="warning" showIcon style={{ marginTop: 8, fontSize: 12 }}
                  message="404 — the webservice isn't deployed. Run database/ar/rr_ar_revenue.sql in APEX SQL Workshop (it registers POST ar/revenue-schedules/generate)." />
              )}
            </>
          )}
        </Modal>

        {/* ── Create Accounting — preview + post ── */}
        <Modal
          open={acctPreviewOpen}
          onCancel={() => { if (!posting) setAcctPreviewOpen(false); }}
          maskClosable={!posting}
          width={980}
          title={<Space><AuditOutlined style={{ color: REDWOOD.primary }} /><span>Create Accounting — Preview</span></Space>}
          footer={
            <Space>
              <Button disabled={posting} onClick={() => setAcctPreviewOpen(false)}>Close</Button>
              <Button type="primary" loading={posting} icon={<AuditOutlined />}
                disabled={Math.abs(acctTotals.debit - acctTotals.credit) > 0.005}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                onClick={runCreateAccounting}>
                Post Accounting ({acctLines.length / 2})
              </Button>
            </Space>
          }
        >
          <Space size={16} wrap style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 12 }}>Period: <Tag color="blue">{postPeriod}</Tag></Text>
            <Text style={{ fontSize: 12 }}>Dr: <Tag>{RR_DEBIT_ACCOUNT}</Tag></Text>
            <Text style={{ fontSize: 12 }}>Cr: <Tag>{RR_CREDIT_ACCOUNT}</Tag></Text>
            <Text style={{ fontSize: 12 }}>Source (ref5): <Tag color="purple">{RR_SOURCE}</Tag></Text>
          </Space>
          <Table
            rowKey="key"
            size="small"
            bordered
            dataSource={acctLines}
            pagination={false}
            scroll={{ y: 320, x: 900 }}
            columns={[
              { title: 'Trx #', dataIndex: 'trxNumber', width: 80, render: (v: any) => v ?? '—' },
              { title: 'Sched', dataIndex: 'scheduleId', width: 70 },
              { title: 'Dr/Cr', dataIndex: 'lineType', width: 60, render: (v: string) => <Tag color={v === 'DR' ? 'geekblue' : 'gold'}>{v}</Tag> },
              { title: 'Account Combination', dataIndex: 'accountCombination', width: 220, render: (v: string) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text> },
              { title: 'Debit', dataIndex: 'debit', width: 110, align: 'right' as const, render: (v: number) => v ? <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text> : '—' },
              { title: 'Credit', dataIndex: 'credit', width: 110, align: 'right' as const, render: (v: number) => v ? <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text> : '—' },
              { title: 'Ref1', dataIndex: 'reference1', width: 90, render: (v: string) => <Tooltip title="trx_number">{v || '—'}</Tooltip> },
              { title: 'Ref2', dataIndex: 'reference2', width: 90, render: (v: string) => <Tooltip title="schedule_id">{v}</Tooltip> },
              { title: 'Ref5', dataIndex: 'reference5', width: 170, ellipsis: true, render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text> },
            ]}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 700 }}>
                  <Table.Summary.Cell index={0} colSpan={4}><Text strong>Totals</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right"><Text strong style={{ fontFamily: 'monospace' }}>{fmt(acctTotals.debit)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right"><Text strong style={{ fontFamily: 'monospace' }}>{fmt(acctTotals.credit)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={6} colSpan={3} align="right">
                    {Math.abs(acctTotals.debit - acctTotals.credit) < 0.005
                      ? <Tag color="green">Balanced</Tag>
                      : <Tag color="red">Out of balance</Tag>}
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />

          <Divider style={{ margin: '12px 0' }} />
          <Alert type="info" showIcon style={{ fontSize: 12, marginBottom: postResults.length ? 10 : 0 }}
            message="Standard Subledger Accounting"
            description={<span>Each schedule runs the standard flow: resolve ledger by business unit → duplicate check → create SLA accounting → create &amp; post the GL journal (reference1 = trx #, reference2 = schedule id, reference5 = {RR_SOURCE}) → stamp SLA. Same path as Multiperiod Accounting.</span>} />
          {postResults.length > 0 && (
            <Table
              rowKey="schedule"
              size="small"
              style={{ marginTop: 10 }}
              dataSource={postResults}
              pagination={false}
              scroll={{ y: 180 }}
              columns={[
                { title: 'Trx #', dataIndex: 'trx', width: 90, render: (v: any) => v ?? '—' },
                { title: 'Schedule', dataIndex: 'schedule', width: 90 },
                { title: 'Status', dataIndex: 'status', width: 100, render: (v: string) =>
                  <Tag color={v === 'success' ? 'green' : v === 'skipped' ? 'gold' : 'red'}>{v}</Tag> },
                { title: 'Result', dataIndex: 'message', ellipsis: true, render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
              ]}
            />
          )}
        </Modal>

        {/* ── Create Accounting — step-by-step debug ── */}
        <Modal
          open={acctDebugOpen}
          onCancel={() => setAcctDebugOpen(false)}
          width={860}
          title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /><span>Create Accounting — Service Debug</span></Space>}
          footer={
            <Space>
              <Button onClick={() => setAcctDebugOpen(false)}>Close</Button>
              <Button type="primary" style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                onClick={() => { setAcctDebugOpen(false); openAcctPreview(); }}>
                Go to Create Accounting
              </Button>
            </Space>
          }
        >
          {!acctDebugLedgerOk && (
            <Alert type="error" showIcon style={{ marginBottom: 10, fontSize: 12 }}
              message={`No ledger resolved for Business Unit '${acctDebugBU || '—'}'`}
              description="The JSON bodies below are built with a placeholder ledger (id 0) so you can review them, but steps 3–6 will fail until a valid Business Unit is set in the Post Revenue toolbar." />
          )}
          {acctDebugHalted && (
            <Alert type="warning" showIcon style={{ marginBottom: 10, fontSize: 12 }}
              message="Journal already exists — remaining steps are halted. Re-open Debug to reset." />
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>
            Runs the standard SLA + GL journal services for the first selected schedule. Test each step in order — ids ({'{slaHeaderId}'}, {'{batchId}'}, {'{glHeaderId}'}) captured by earlier steps fill in automatically.
          </Text>
          <div style={{ marginTop: 10 }}>
            {acctDebugSteps.map((s, idx) => {
              const t = acctStepTest[idx];
              const isDupCheck = s.url.includes('/gl/journals/check');
              const stepHalted = acctDebugHalted && !isDupCheck;
              const dispUrl     = resolveTokens(s.url, acctDebugCtx);
              const dispPayload = s.payload != null ? resolveTokens(s.payload, acctDebugCtx) : null;
              return (
                <div key={idx} style={{ border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 6, padding: 10, marginBottom: 8, opacity: stepHalted ? 0.55 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag color={s.method === 'GET' ? 'blue' : s.method === 'PUT' ? 'purple' : 'green'} style={{ fontSize: 11 }}>{s.method}</Tag>
                    <Text strong style={{ fontSize: 12 }}>{s.step}</Text>
                    <Button size="small" style={{ marginLeft: 'auto' }} loading={t?.loading} disabled={stepHalted} onClick={() => runAcctDebugStep(idx)}>Run</Button>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.info, wordBreak: 'break-all', marginTop: 6 }}>{dispUrl}</div>
                  {dispPayload != null && (
                    <pre style={{ fontSize: 10.5, background: '#0d0d0d', color: '#a8ff78', borderRadius: 4, padding: 8, margin: '6px 0 0', maxHeight: 150, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {JSON.stringify(dispPayload, null, 2)}
                    </pre>
                  )}
                  {t && t.status !== 0 && (
                    <>
                      <div style={{ fontSize: 11, color: '#888', margin: '6px 0 2px' }}>
                        HTTP <b style={{ color: t.status >= 200 && t.status < 300 ? REDWOOD.success : REDWOOD.primary }}>{t.status}</b>
                      </div>
                      <pre style={{ fontSize: 10.5, background: '#0d0d0d', color: '#79c0ff', borderRadius: 4, padding: 8, margin: 0, maxHeight: 150, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {t.body || '(empty)'}
                      </pre>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Modal>

        <FloatingMenu />
      </Content>
    </Layout>
  );
};

export default RevenueRecognition;
