import React, { useState, useCallback, useEffect } from 'react';
import dayjs from 'dayjs';
import {
  Layout, Card, Form, Select, Input, Button, Space, Typography,
  Table, Tag, Row, Col, Breadcrumb, Tabs, Descriptions, Alert,
  Modal, message, Tooltip, Statistic, Spin, DatePicker, Drawer, Collapse, Popconfirm, Radio,
} from 'antd';
import {
  HomeOutlined, SearchOutlined, ReloadOutlined, CalendarOutlined,
  CheckCircleOutlined, CloseOutlined, SyncOutlined, BookOutlined,
  FileTextOutlined, WarningOutlined, ApiOutlined, CopyOutlined,
  EyeOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { APEX_DB_CONFIG } from '../../config/api.config';
import {
  listMpaInvoices, getMpaSchedule, generateMpaSchedule, markPeriodPosted,
  listFusionMpaLines, getFusionMpaDetail, deleteMpaSchedule,
  type MpaInvoiceSummary, type MpaScheduleLine, type MpaInvoiceDetail,
  type FusionMpaLine, type FusionMpaDetail, type FusionMpaSchedulePeriod,
} from '../../services/multiperiod.service';
import {
  createAccounting, fetchLedgerByBusinessUnit, getAccounting,
  type SlaCreatePayload, type SlaGetResult,
} from '../../services/sla.service';
import { useAuth } from '../../context/AuthContext';

const { Content } = Layout;
const { Text, Title } = Typography;
const { Option } = Select;

const REDWOOD = {
  primary: '#C74634',
  success: '#1D7B4D',
  warning: '#D4A800',
  info:    '#0572CE',
  neutral: '#F7F7F7',
};

const APEX_BU_URL = `${APEX_DB_CONFIG.baseUrl}/gl/businessunits`;

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtAmt = (v: number | null | undefined, currency = 'AED') =>
  v == null ? '—' : `${currency} ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (s: string | null | undefined) =>
  s ? dayjs(s).format('DD MMM YYYY') : '—';

const currentPeriod = () => dayjs().format('MMM-YY');   // e.g. "Apr-26"

const statusTag = (status: string) => {
  if (status === 'Posted')     return <Tag color="success" icon={<CheckCircleOutlined />}>Posted</Tag>;
  if (status === 'Not Posted') return <Tag color="warning" icon={<WarningOutlined />}>Not Posted</Tag>;
  if (status === 'Error')      return <Tag color="error">Error</Tag>;
  return <Tag>{status}</Tag>;
};

// ── types ─────────────────────────────────────────────────────────────────────

interface DetailTab {
  key:     string;
  invoiceId: number;
  label:   string;
  detail:  MpaInvoiceDetail | null;
  loading: boolean;
  error:   string | null;
}

// ── component ─────────────────────────────────────────────────────────────────

const ManageMultiperiod: React.FC = () => {
  const { user } = useAuth();
  const [form] = Form.useForm();

  const [activeTab,    setActiveTab]    = useState('search');
  const [detailTabs,   setDetailTabs]   = useState<DetailTab[]>([]);
  const [searchResult, setSearchResult] = useState<MpaInvoiceSummary[]>([]);
  const [mpaStatusFilter, setMpaStatusFilter] = useState<'all'|'open'|'closed'>('all');
  const [searching,    setSearching]    = useState(false);
  const [searchErr,    setSearchErr]    = useState<string | null>(null);
  const [businessUnits, setBusinessUnits] = useState<string[]>([]);
  const [generating,   setGenerating]   = useState<Set<number>>(new Set());
  const [deleting,     setDeleting]     = useState<Set<number>>(new Set());
  const [postingTab,   setPostingTab]   = useState<string | null>(null);
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [confirmTab,   setConfirmTab]   = useState<string | null>(null);
  const [apiModalOpen,       setApiModalOpen]       = useState(false);
  const [lastApiUrl,         setLastApiUrl]         = useState<string | null>(null);
  const [lastApiStatus,      setLastApiStatus]      = useState<'success' | 'error' | null>(null);
  const [lastApiNote,        setLastApiNote]        = useState<string | null>(null);
  const [copiedUrl,          setCopiedUrl]          = useState(false);
  const [acctModalOpen,      setAcctModalOpen]      = useState(false);
  const [acctModalInvoiceId, setAcctModalInvoiceId] = useState<number | null>(null);
  const [acctData,           setAcctData]           = useState<SlaGetResult | null>(null);
  const [acctLoading,        setAcctLoading]        = useState(false);

  // ── Post Accrual tab ──────────────────────────────────────────────────────
  const [accrualPeriods,    setAccrualPeriods]    = useState<string[]>([]);
  const [accrualPeriod,     setAccrualPeriod]     = useState<string>('');
  const [accrualLines,      setAccrualLines]      = useState<any[]>([]);
  const [accrualLoading,    setAccrualLoading]    = useState(false);
  const [accrualPosting,    setAccrualPosting]    = useState(false);
  const [accrualPosted,     setAccrualPosted]     = useState<{invoiceId:number;invoiceNumber:string;period:string;status:'ok'|'error';note:string}[]>([]);
  const [accrualSelected,    setAccrualSelected]    = useState<number[]>([]);   // selected invoiceIds
  const [accrualSearch,      setAccrualSearch]      = useState('');
  const [detailSearch,       setDetailSearch]       = useState<Record<string, string>>({});
  const [accrualPreviewOpen, setAccrualPreviewOpen] = useState(false);
  const [accrualPreviewLines, setAccrualPreviewLines] = useState<any[]>([]);

  // ── Fusion data tab ───────────────────────────────────────────────────────
  const [fusionForm]        = Form.useForm();
  const [fusionRows,        setFusionRows]        = useState<FusionMpaLine[]>([]);
  const [fusionLoading,     setFusionLoading]     = useState(false);
  const [fusionErr,         setFusionErr]         = useState<string | null>(null);
  const [fusionSearched,    setFusionSearched]    = useState(false);

  // ── Fusion detail drawer ──────────────────────────────────────────────────
  const [drawerOpen,        setDrawerOpen]        = useState(false);
  const [drawerData,        setDrawerData]        = useState<FusionMpaDetail | null>(null);
  const [drawerLoading,     setDrawerLoading]     = useState(false);
  const [drawerOpenAsOf,    setDrawerOpenAsOf]    = useState<string | undefined>(undefined);

  // ── Bulk generate modal ───────────────────────────────────────────────────
  const [bulkModalOpen,     setBulkModalOpen]     = useState(false);
  const [bulkInvoices,      setBulkInvoices]      = useState<FusionMpaLine[]>([]);
  const [bulkSelected,      setBulkSelected]      = useState<Set<number>>(new Set());
  const [bulkRunning,       setBulkRunning]        = useState(false);
  const [bulkProgress,      setBulkProgress]      = useState<{ done: number; total: number; current: string; results: { invoiceId: number; invoiceNumber: string; status: 'ok' | 'skip' | 'error'; note: string }[] }>({ done: 0, total: 0, current: '', results: [] });

  // Load business units
  useEffect(() => {
    fetch(APEX_BU_URL, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(d => setBusinessUnits((d?.items ?? []).map((i: any) => i.business_unit_name).filter(Boolean)))
      .catch(() => {});
  }, []);

  // ── search ────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    const vals = form.getFieldsValue();
    setSearching(true);
    setSearchErr(null);

    // Build URL for debug display
    const BASE_URL = `${APEX_DB_CONFIG.baseUrl}/ap/multiperiod`;
    const q = new URLSearchParams();
    if (vals.invoiceNumber) q.set('invoice_number', vals.invoiceNumber);
    if (vals.supplier)      q.set('supplier',       vals.supplier);
    if (vals.businessUnit)  q.set('business_unit',  vals.businessUnit);
    if (vals.postingStatus) q.set('posting_status', vals.postingStatus);
    const calledUrl = q.toString() ? `${BASE_URL}?${q.toString()}` : BASE_URL;
    setLastApiUrl(calledUrl);

    try {
      const rows = await listMpaInvoices({
        invoiceNumber: vals.invoiceNumber || undefined,
        supplier:      vals.supplier      || undefined,
        businessUnit:  vals.businessUnit  || undefined,
        postingStatus: vals.postingStatus || undefined,
      });
      setSearchResult(rows);
      setLastApiStatus('success');
      setLastApiNote(`${rows.length} invoice(s) returned`);
    } catch (e: any) {
      setSearchErr(e?.message ?? 'Search failed');
      setLastApiStatus('error');
      setLastApiNote(e?.message ?? 'Unknown error');
    }
    setSearching(false);
  }, [form]);

  const handleReset = () => { form.resetFields(); setSearchResult([]); setSearchErr(null); };

  // ── open detail tab ───────────────────────────────────────────────────────

  const openDetail = useCallback(async (row: MpaInvoiceSummary) => {
    const tabKey = `inv-${row.invoiceId}`;
    const existing = detailTabs.find(t => t.key === tabKey);
    if (existing) { setActiveTab(tabKey); return; }

    const newTab: DetailTab = {
      key: tabKey, invoiceId: row.invoiceId,
      label: row.invoiceNumber, detail: null, loading: true, error: null,
    };
    setDetailTabs(prev => [...prev, newTab]);
    setActiveTab(tabKey);

    try {
      const detail = await getMpaSchedule(row.invoiceId);
      setDetailTabs(prev => prev.map(t => t.key === tabKey ? { ...t, detail, loading: false } : t));
    } catch (e: any) {
      setDetailTabs(prev => prev.map(t => t.key === tabKey ? { ...t, loading: false, error: e?.message ?? 'Failed to load' } : t));
    }
  }, [detailTabs]);

  const closeTab = (key: string) => {
    setDetailTabs(prev => prev.filter(t => t.key !== key));
    if (activeTab === key) setActiveTab('search');
  };

  // ── refresh detail ────────────────────────────────────────────────────────

  const refreshDetail = useCallback(async (tabKey: string, invoiceId: number) => {
    setDetailTabs(prev => prev.map(t => t.key === tabKey ? { ...t, loading: true, error: null } : t));
    try {
      const detail = await getMpaSchedule(invoiceId);
      setDetailTabs(prev => prev.map(t => t.key === tabKey ? { ...t, detail, loading: false } : t));
    } catch (e: any) {
      setDetailTabs(prev => prev.map(t => t.key === tabKey ? { ...t, loading: false, error: e?.message ?? 'Failed' } : t));
    }
  }, []);

  // ── generate schedule ─────────────────────────────────────────────────────

  const handleGenerate = useCallback(async (invoiceId: number, tabKey?: string) => {
    setGenerating(prev => new Set([...prev, invoiceId]));
    try {
      await generateMpaSchedule(invoiceId);
      message.success('Schedule generated');
      if (tabKey) await refreshDetail(tabKey, invoiceId);
      else await handleSearch();
    } catch (e: any) {
      message.error(`Generate failed: ${e?.message}`);
    }
    setGenerating(prev => { const s = new Set(prev); s.delete(invoiceId); return s; });
  }, [handleSearch, refreshDetail]);

  // ── delete MPA schedule ───────────────────────────────────────────────────

  const handleDeleteMpa = useCallback(async (invoiceId: number) => {
    setDeleting(prev => new Set([...prev, invoiceId]));
    try {
      const result = await deleteMpaSchedule(invoiceId);
      if (result.deleted === 0 && result.postedKept === 0) {
        message.warning('No schedule rows found for this invoice');
      } else if (result.deleted === 0 && result.postedKept > 0) {
        message.info(`All ${result.postedKept} period(s) are already Posted — nothing to delete`);
      } else {
        const kept = result.postedKept > 0 ? ` (${result.postedKept} posted period(s) kept)` : '';
        message.success(`Deleted ${result.deleted} pending period(s)${kept}`);
        await handleSearch();
      }
    } catch (e: any) {
      message.error(`Delete failed: ${e?.message}`);
    }
    setDeleting(prev => { const s = new Set(prev); s.delete(invoiceId); return s; });
  }, [handleSearch]);

  // ── post current period ───────────────────────────────────────────────────

  const handlePostConfirm = async () => {
    if (!confirmTab) return;
    const tab = detailTabs.find(t => t.key === confirmTab);
    if (!tab?.detail) return;

    const period = currentPeriod();
    const linesToPost = (tab.detail.lines || []).filter(
      l => l.periodName === period && l.postingStatus === 'Not Posted',
    );
    if (linesToPost.length === 0) {
      message.warning(`No unposted lines for ${period}`);
      setConfirmOpen(false);
      return;
    }

    setConfirmOpen(false);
    setPostingTab(confirmTab);
    const postedBy = user?.name || user?.username || 'System';

    try {
      const ledger = await fetchLedgerByBusinessUnit(tab.detail.businessUnit);
      if (!ledger) throw new Error('Could not find ledger for Business Unit: ' + tab.detail.businessUnit);

      const currency = tab.detail.currencyCode || 'AED';
      const payload: SlaCreatePayload = {
        header: {
          moduleName:     'AP',
          sourceTable:    'RR_AP_INVOICE_MULTIPERIOD_SCHEDULE',
          sourceId:       tab.detail.invoiceId,
          sourceNumber:   `${tab.detail.invoiceNumber}_${period}`,
          sourceType:     'Multiperiod',
          eventTypeCode:  'MULTIPERIOD_ACCRUAL',
          eventDate:      dayjs().format('YYYY-MM-DD'),
          accountingDate: dayjs().format('YYYY-MM-DD'),
          periodName:     period,
          ledgerId:       ledger.ledgerId,
          ledgerName:     ledger.ledgerName,
          currencyCode:   currency,
          ledgerCurrency: ledger.ledgerName,
          exchangeRate:   1,
          businessUnit:   tab.detail.businessUnit,
          description:    `Multiperiod Accrual – ${tab.detail.invoiceNumber} – ${period}`,
          createdBy:      postedBy,
        },
        lines: linesToPost.flatMap((l, idx) => [
          {
            lineNumber:        idx * 2 + 1,
            lineType:          'DR',
            accountingClass:   'EXPENSE',
            accountCombination: l.chargeAccount || '',
            enteredDr:         l.periodAmount,
            enteredCr:         0,
            accountedDr:       l.periodAmount,
            accountedCr:       0,
            currencyCode:      currency,
            exchangeRate:      1,
            description:       `${l.description || 'Expense'} – ${period}`,
            sourceLineId:      l.scheduleId,
            sourceLineNumber:  l.lineNumber,
          },
          {
            lineNumber:        idx * 2 + 2,
            lineType:          'CR',
            accountingClass:   'ACCRUAL',
            accountCombination: l.accrualAccount || '',
            enteredDr:         0,
            enteredCr:         l.periodAmount,
            accountedDr:       0,
            accountedCr:       l.periodAmount,
            currencyCode:      currency,
            exchangeRate:      1,
            description:       `${l.description || 'Accrual'} – ${period}`,
            sourceLineId:      l.scheduleId,
            sourceLineNumber:  l.lineNumber,
          },
        ]),
      };

      const result = await createAccounting(payload);
      await markPeriodPosted(tab.detail.invoiceId, period, result.headerId, postedBy);
      message.success(`${period} accrual posted — SLA header #${result.headerId}`);
      await refreshDetail(confirmTab, tab.detail.invoiceId);
    } catch (e: any) {
      message.error(`Posting failed: ${e?.message}`);
    }
    setPostingTab(null);
  };

  const openPostConfirm = (tabKey: string) => {
    const tab = detailTabs.find(t => t.key === tabKey);
    if (!tab?.detail) return;

    const period = currentPeriod();

    // Validation 1: invoice must be posted
    const invStatus = tab.detail.invoiceAccountingStatus?.toUpperCase();
    if (!invStatus || invStatus !== 'POSTED') {
      Modal.error({
        title: 'Invoice Not Posted',
        content: (
          <span>
            The invoice must be <strong>accounted and posted</strong> before posting multiperiod
            accruals.
            {tab.detail.invoiceAccountingStatus
              ? ` Current accounting status: ${tab.detail.invoiceAccountingStatus}.`
              : ' No accounting entries found for this invoice.'}
            {' '}Use <em>Refresh</em> if the invoice was recently posted.
          </span>
        ),
      });
      return;
    }

    // Validation 2: current period only
    const currentLines = (tab.detail.lines || []).filter(
      l => l.periodName === period && l.postingStatus === 'Not Posted',
    );
    if (currentLines.length === 0) {
      Modal.error({
        title: 'Cannot Post Accrual',
        content: (
          <span>
            Multiperiod accruals can only be posted for the <strong>current period ({period})</strong>.
            No unposted lines were found for this period.
          </span>
        ),
      });
      return;
    }

    setConfirmTab(tabKey);
    setConfirmOpen(true);
  };

  // ── view accounting ───────────────────────────────────────────────────────

  const openAccountingModal = useCallback(async (invoiceId: number) => {
    setAcctModalInvoiceId(invoiceId);
    setAcctModalOpen(true);
    setAcctLoading(true);
    setAcctData(null);
    try {
      const result = await getAccounting('RR_AP_INVOICE_MULTIPERIOD_SCHEDULE', invoiceId);
      setAcctData(result);
    } catch (e: any) {
      message.error(`Failed to load accounting: ${e?.message}`);
      setAcctModalOpen(false);
    }
    setAcctLoading(false);
  }, []);

  // ── fusion data search ────────────────────────────────────────────────────

  const handleFusionSearch = useCallback(async () => {
    const vals = fusionForm.getFieldsValue();
    setFusionLoading(true);
    setFusionErr(null);
    try {
      const rows = await listFusionMpaLines({
        invoiceNumber:   vals.invoiceNumber   || undefined,
        supplier:        vals.supplier        || undefined,
        businessUnit:    vals.businessUnit    || undefined,
        lineDescription: vals.lineDescription || undefined,
        openAsOf:        vals.openAsOf ? (vals.openAsOf as any).format('YYYY-MM-DD') : undefined,
      });
      setFusionRows(rows);
      setFusionSearched(true);
    } catch (e: any) {
      setFusionErr(e?.message ?? 'Search failed');
    }
    setFusionLoading(false);
  }, [fusionForm]);

  // ── Accrual period helpers ────────────────────────────────────────────────

  const loadAccrualPeriods = useCallback(async () => {
    setAccrualLoading(true);
    try {
      const open = await listMpaInvoices({ postingStatus: 'Not Posted' });
      const dates = open.flatMap((r: MpaInvoiceSummary) => [r.minPeriodDate, r.maxPeriodDate]).filter(Boolean) as string[];
      if (dates.length === 0) { setAccrualPeriods([]); setAccrualLoading(false); return; }
      const start = dayjs(dates.reduce((a, b) => a < b ? a : b));
      const end = dayjs(dates.reduce((a, b) => a > b ? a : b));
      const periods: string[] = [];
      let cur = start.startOf('month');
      while (!cur.isAfter(end, 'month')) {
        periods.push(cur.format('MMM-YYYY'));
        cur = cur.add(1, 'month');
      }
      setAccrualPeriods(periods);
      if (periods.length > 0 && !accrualPeriod) {
        setAccrualPeriod(periods[0]);
        await loadAccrualLines(periods[0]);
      }
    } catch (e: any) {
      message.error('Failed to load periods: ' + e?.message);
    }
    setAccrualLoading(false);
  }, [accrualPeriod]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAccrualLines = useCallback(async (period: string) => {
    if (!period) return;
    setAccrualLoading(true);
    try {
      // First get summaries where period falls within min/max range and has open lines
      const all = await listMpaInvoices({});
      const periodDate = dayjs(period, 'MMM-YYYY');
      const candidates = (all as MpaInvoiceSummary[]).filter(r => {
        const min = dayjs(r.minPeriodDate);
        const max = dayjs(r.maxPeriodDate);
        return !periodDate.isBefore(min, 'month') && !periodDate.isAfter(max, 'month');
      });

      // Fetch full schedule per invoice to get per-period amounts
      const enriched = await Promise.all(
        candidates.map(async (inv) => {
          try {
            const detail = await getMpaSchedule(inv.invoiceId);
            const periodLines   = detail.lines.filter(l => dayjs(l.periodDate).format('MMM-YYYY') === period);
            const periodAmt     = periodLines.reduce((s, l) => s + (l.periodAmount || 0), 0);
            const periodPosted  = periodLines.filter(l => l.postingStatus === 'Posted').reduce((s, l) => s + (l.periodAmount || 0), 0);
            const periodOpen    = periodLines.filter(l => l.postingStatus === 'Not Posted').reduce((s, l) => s + (l.periodAmount || 0), 0);
            const postedToDate  = detail.lines.filter(l => l.postingStatus === 'Posted').reduce((s, l) => s + (l.periodAmount || 0), 0);
            const totalScheduled = detail.lines.reduce((s, l) => s + (l.periodAmount || 0), 0);
            const periodNotPostedLines = periodLines.filter(l => l.postingStatus === 'Not Posted');
            return {
              ...inv,
              periodAmt,
              periodPosted,
              periodOpen,
              postedToDate,
              totalScheduled,
              hasPeriodLines: periodLines.length > 0,
              hasPeriodOpen: periodOpen > 0,
              periodNotPostedLines,
            };
          } catch {
            return { ...inv, periodAmt: 0, periodPosted: 0, periodOpen: 0, postedToDate: 0, totalScheduled: inv.totalAmount, hasPeriodLines: false, hasPeriodOpen: false, periodNotPostedLines: [] };
          }
        })
      );
      // Only show invoices that actually have lines in this period
      setAccrualLines(enriched.filter(r => r.hasPeriodLines));
    } catch (e: any) {
      message.error('Failed to load accrual lines: ' + e?.message);
    }
    setAccrualLoading(false);
  }, []);

  const openBulkModal = useCallback(() => {
    const seen = new Set<number>();
    const pending = fusionRows.filter(r => {
      if (r.scheduleGenerated || seen.has(r.invoiceId)) return false;
      seen.add(r.invoiceId);
      return true;
    });
    setBulkInvoices(pending);
    setBulkSelected(new Set(pending.map(r => r.invoiceId)));
    setBulkProgress({ done: 0, total: 0, current: '', results: [] });
    setBulkRunning(false);
    setBulkModalOpen(true);
  }, [fusionRows]);

  const handleBulkGenerate = useCallback(async () => {
    const toProcess = bulkInvoices.filter(r => bulkSelected.has(r.invoiceId));
    if (toProcess.length === 0) return;
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: toProcess.length, current: '', results: [] });
    const results: { invoiceId: number; invoiceNumber: string; status: 'ok' | 'skip' | 'error'; note: string }[] = [];
    for (let i = 0; i < toProcess.length; i++) {
      const row = toProcess[i];
      setBulkProgress(p => ({ ...p, current: `${row.invoiceNumber} (${row.supplier})`, done: i }));
      try {
        const detail = await getMpaSchedule(row.invoiceId);
        if (detail.lines.length > 0) {
          results.push({ invoiceId: row.invoiceId, invoiceNumber: row.invoiceNumber, status: 'skip', note: `Already has ${detail.lines.length} schedule line(s)` });
        } else {
          await generateMpaSchedule(row.invoiceId);
          results.push({ invoiceId: row.invoiceId, invoiceNumber: row.invoiceNumber, status: 'ok', note: 'Schedule generated' });
        }
      } catch (e: any) {
        results.push({ invoiceId: row.invoiceId, invoiceNumber: row.invoiceNumber, status: 'error', note: e?.message || 'Failed' });
      }
      setBulkProgress(p => ({ ...p, done: i + 1, results: [...results] }));
    }
    setBulkRunning(false);
    handleFusionSearch();
  }, [bulkInvoices, bulkSelected, handleFusionSearch]);

  const openFusionDetail = useCallback(async (invoiceId: number, openAsOf?: string) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerData(null);
    setDrawerOpenAsOf(openAsOf);
    try {
      const detail = await getFusionMpaDetail(invoiceId, openAsOf);
      setDrawerData(detail);
    } catch (e: any) {
      message.error(`Failed to load detail: ${e?.message}`);
      setDrawerOpen(false);
    }
    setDrawerLoading(false);
  }, []);

  const refreshDrawer = useCallback(async () => {
    if (!drawerData) return;
    setDrawerLoading(true);
    try {
      const detail = await getFusionMpaDetail(drawerData.invoiceId, drawerOpenAsOf);
      setDrawerData(detail);
    } catch (e: any) {
      message.error(`Refresh failed: ${e?.message}`);
    }
    setDrawerLoading(false);
  }, [drawerData, drawerOpenAsOf]);

  const fusionColumns: ColumnsType<FusionMpaLine> = [
    {
      title: 'Invoice Number', dataIndex: 'invoiceNumber', width: 150, fixed: 'left' as const,
      render: (v, rec) => {
        const openAsOf = fusionForm.getFieldValue('openAsOf')?.format?.('YYYY-MM-DD');
        return (
          <Button type="link" size="small" style={{ padding: 0 }}
            onClick={() => openFusionDetail(rec.invoiceId, openAsOf)}>
            {v}
          </Button>
        );
      },
    },
    {
      title: 'Invoice Date', dataIndex: 'invoiceDate', width: 110,
      render: v => <Text style={{ fontSize: 12 }}>{fmtDate(v)}</Text>,
    },
    { title: 'Supplier', dataIndex: 'supplier', ellipsis: true, width: 200 },
    { title: 'Supplier No.', dataIndex: 'supplierNumber', width: 110 },
    { title: 'Business Unit', dataIndex: 'businessUnit', width: 160, ellipsis: true },
    {
      title: 'Invoice Amount', dataIndex: 'invoiceAmount', width: 140, align: 'right' as const,
      render: (v, rec) => <Text strong style={{ fontSize: 12 }}>{fmtAmt(v, rec.invoiceCurrency)}</Text>,
    },
    { title: 'Line', dataIndex: 'lineNumber', width: 55, align: 'center' as const },
    {
      title: 'Line Amount', dataIndex: 'lineAmount', width: 130, align: 'right' as const,
      render: (v, rec) => <Text style={{ fontSize: 12 }}>{fmtAmt(v, rec.invoiceCurrency)}</Text>,
    },
    { title: 'Line Description', dataIndex: 'lineDescription', ellipsis: true, width: 200 },
    {
      title: 'MPA Start', dataIndex: 'multiperiodStartDate', width: 110,
      render: v => <Text style={{ fontSize: 12, color: REDWOOD.info }}>{fmtDate(v)}</Text>,
    },
    {
      title: 'MPA End', dataIndex: 'multiperiodEndDate', width: 110,
      render: v => <Text style={{ fontSize: 12, color: REDWOOD.info }}>{fmtDate(v)}</Text>,
    },
    {
      title: 'Charge A/C', dataIndex: 'chargeAccount', width: 190, ellipsis: true,
      render: v => <Text code style={{ fontSize: 11 }}>{v || '—'}</Text>,
    },
    {
      title: 'Accrual A/C', dataIndex: 'multiperiodAccrualAccount', width: 190, ellipsis: true,
      render: v => <Text code style={{ fontSize: 11 }}>{v || '—'}</Text>,
    },
    {
      title: 'Schedule', dataIndex: 'scheduleGenerated', width: 100, align: 'center' as const,
      render: v => v
        ? <Tag color="success" icon={<CheckCircleOutlined />}>Generated</Tag>
        : <Tag color="default">Pending</Tag>,
    },
    {
      title: 'Action', width: 160, fixed: 'right' as const,
      render: (_, rec) => {
        const openAsOf = fusionForm.getFieldValue('openAsOf')?.format?.('YYYY-MM-DD');
        return (
          <Space size={4}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => openFusionDetail(rec.invoiceId, openAsOf)}
            >
              Detail
            </Button>
            {!rec.scheduleGenerated && (
              <Button
                size="small"
                icon={<SyncOutlined />}
                loading={generating.has(rec.invoiceId)}
                onClick={() => handleGenerate(rec.invoiceId)}
              >
                Generate
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  // ── search columns ────────────────────────────────────────────────────────

  const searchColumns: ColumnsType<MpaInvoiceSummary> = [
    {
      title: 'Invoice Number',
      dataIndex: 'invoiceNumber',
      width: 160,
      render: (v, rec) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => openDetail(rec)}>{v}</Button>
      ),
    },
    { title: 'Supplier',       dataIndex: 'supplier',      ellipsis: true },
    { title: 'Business Unit',  dataIndex: 'businessUnit',  width: 180, ellipsis: true },
    {
      title: 'Invoice Date', dataIndex: 'invoiceDate', width: 110,
      render: v => <Text style={{ fontSize: 12 }}>{fmtDate(v)}</Text>,
    },
    {
      title: 'Period Range', width: 160,
      render: (_, rec) => (
        <Text style={{ fontSize: 12 }}>
          {fmtDate(rec.minPeriodDate)} – {fmtDate(rec.maxPeriodDate)}
        </Text>
      ),
    },
    {
      title: 'Schedules', width: 160,
      render: (_, rec) => (
        <Space size={6}>
          <Tag style={{ fontSize: 11 }}>Total: {rec.totalLines ?? 0}</Tag>
          <Tag color="success" style={{ fontSize: 11 }}>Closed: {rec.closedLines ?? 0}</Tag>
          <Tag color="warning" style={{ fontSize: 11 }}>Open: {rec.openLines ?? 0}</Tag>
        </Space>
      ),
    },
    {
      title: 'Not Posted', dataIndex: 'notPostedAmount', width: 130, align: 'right' as const,
      render: (v, rec) => v > 0
        ? <Text type="warning" style={{ fontSize: 12 }}>{fmtAmt(v, rec.currencyCode)}</Text>
        : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      title: 'Posted', dataIndex: 'postedAmount', width: 130, align: 'right' as const,
      render: (v, rec) => v > 0
        ? <Text style={{ color: REDWOOD.success, fontSize: 12 }}>{fmtAmt(v, rec.currencyCode)}</Text>
        : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      title: 'Actions', width: 140,
      render: (_, rec) => (
        <Space size={4}>
          <Button size="small" type="primary" onClick={() => openDetail(rec)}>View</Button>
          <Popconfirm
            title="Delete MPA Schedule"
            description={`Delete all pending (not-posted) schedule rows for invoice ${rec.invoiceNumber}?`}
            onConfirm={() => handleDeleteMpa(rec.invoiceId)}
            okText="Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={deleting.has(rec.invoiceId)}
            >
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ── detail schedule columns ───────────────────────────────────────────────

  const buildScheduleColumns = (lines: MpaScheduleLine[]): ColumnsType<MpaScheduleLine> => {
    const periodOptions = [...new Set(lines.map(l => l.periodName))].sort().map(v => ({ text: v, value: v }));
    return [
    {
      title: 'Period', dataIndex: 'periodName', width: 110,
      filters: periodOptions,
      onFilter: (value: any, rec) => rec.periodName === value,
      render: v => <Text strong style={{ fontSize: 12 }}>{v}</Text>,
    },
    { title: 'Line', dataIndex: 'lineNumber', width: 55, align: 'center' as const },
    { title: 'Description', dataIndex: 'description', ellipsis: true,
      render: (v: string) => <Tooltip title={v}><Text style={{ fontSize: 12 }}>{v}</Text></Tooltip> },
    {
      title: 'Original Amt', dataIndex: 'originalAmount', width: 130, align: 'right' as const,
      render: v => <Text style={{ fontSize: 12 }}>{fmtAmt(v)}</Text>,
    },
    {
      title: 'Period Amt', dataIndex: 'periodAmount', width: 130, align: 'right' as const,
      render: v => <Text strong style={{ fontSize: 12 }}>{fmtAmt(v)}</Text>,
    },
    {
      title: 'Charge A/C (Dr)', dataIndex: 'chargeAccount', width: 200, ellipsis: true,
      render: v => <Text code style={{ fontSize: 11 }}>{v || '—'}</Text>,
    },
    {
      title: 'Accrual A/C (Cr)', dataIndex: 'accrualAccount', width: 200, ellipsis: true,
      render: v => <Text code style={{ fontSize: 11 }}>{v || '—'}</Text>,
    },
    {
      title: 'Status', dataIndex: 'postingStatus', width: 120,
      render: v => statusTag(v),
    },
    {
      title: 'Posted By / Date', width: 150,
      render: (_, rec) => rec.postingStatus === 'Posted'
        ? <Text type="secondary" style={{ fontSize: 11 }}>{rec.postedBy}<br />{fmtDate(rec.postedDate)}</Text>
        : null,
    },
  ];};

  // ── render detail tab content ─────────────────────────────────────────────

  const renderDetail = (tab: DetailTab) => {
    if (tab.loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>;
    if (tab.error)   return <Alert type="error" showIcon message="Failed to load schedule" description={tab.error} style={{ margin: 24 }} />;
    if (!tab.detail) return null;

    const d = tab.detail;
    const period = currentPeriod();
    const currentLines = (d.lines || []).filter(l => l.periodName === period && l.postingStatus === 'Not Posted');
    const hasCurrentPeriod = currentLines.length > 0;
    const isPosting = postingTab === tab.key;
    const isInvoicePosted = d.invoiceAccountingStatus?.toUpperCase() === 'POSTED';
    const canPost = hasCurrentPeriod && isInvoicePosted;

    const postDisabledReason = !isInvoicePosted
      ? `Invoice must be Posted before posting accruals (current: ${d.invoiceAccountingStatus || 'Not Accounted'})`
      : !hasCurrentPeriod
      ? `No unposted lines for the current period (${period})`
      : undefined;

    const totalAmt      = d.lines.reduce((s, l) => s + (l.periodAmount || 0), 0);
    const postedAmt     = d.lines.filter(l => l.postingStatus === 'Posted').reduce((s, l) => s + l.periodAmount, 0);
    const notPostedAmt  = d.lines.filter(l => l.postingStatus === 'Not Posted').reduce((s, l) => s + l.periodAmount, 0);

    return (
      <div style={{ padding: '0 8px' }}>
        {/* Invoice header */}
        <Card size="small" style={{ marginBottom: 12 }}>
          <Descriptions size="small" column={5}>
            <Descriptions.Item label="Invoice Number">
              <Text strong>{d.invoiceNumber}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Invoice Date">{fmtDate(d.invoiceDate)}</Descriptions.Item>
            <Descriptions.Item label="Supplier">{d.supplier}</Descriptions.Item>
            <Descriptions.Item label="Business Unit">{d.businessUnit}</Descriptions.Item>
            <Descriptions.Item label="Invoice Accounting">
              {isInvoicePosted
                ? <Tag color="success" icon={<CheckCircleOutlined />}>Posted</Tag>
                : <Tag color="warning" icon={<WarningOutlined />}>{d.invoiceAccountingStatus || 'Not Accounted'}</Tag>
              }
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* Summary stats */}
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Total Schedule" value={totalAmt} precision={2} prefix={d.currencyCode} valueStyle={{ fontSize: 14 }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Posted" value={postedAmt} precision={2} prefix={d.currencyCode} valueStyle={{ fontSize: 14, color: REDWOOD.success }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Not Posted" value={notPostedAmt} precision={2} prefix={d.currencyCode} valueStyle={{ fontSize: 14, color: REDWOOD.warning }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Periods" value={new Set(d.lines.map(l => l.periodName)).size} valueStyle={{ fontSize: 14 }} />
            </Card>
          </Col>
        </Row>

        {/* Action bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              size="small"
              onClick={() => refreshDetail(tab.key, tab.invoiceId)}
            >
              Refresh
            </Button>
            <Button
              icon={<EyeOutlined />}
              size="small"
              onClick={() => openAccountingModal(tab.invoiceId)}
            >
              View Accounting
            </Button>
          </Space>

          <Tooltip title={postDisabledReason ?? `Create Dr Expense / Cr Accrual entries for ${period}`}>
            <Button
              type="primary"
              icon={<BookOutlined />}
              disabled={!canPost}
              loading={isPosting}
              onClick={() => openPostConfirm(tab.key)}
              style={{ background: canPost ? REDWOOD.primary : undefined }}
            >
              Post {period} Accrual
            </Button>
          </Tooltip>
        </div>

        {/* Schedule table */}
        {(() => {
          const sq = (detailSearch[tab.key] || '').trim().toLowerCase();
          const filteredLines = sq
            ? d.lines.filter(l =>
                [l.periodName, l.description, l.chargeAccount, l.accrualAccount,
                 l.postingStatus, l.postedBy, String(l.lineNumber), String(l.scheduleId)]
                  .some(v => v && String(v).toLowerCase().includes(sq))
              )
            : d.lines;
          return (
            <>
              <div style={{ marginBottom: 8 }}>
                <Input.Search
                  placeholder="Search schedule lines…"
                  allowClear
                  size="small"
                  style={{ width: 260 }}
                  value={detailSearch[tab.key] || ''}
                  onChange={e => setDetailSearch(prev => ({ ...prev, [tab.key]: e.target.value }))}
                  onSearch={v => setDetailSearch(prev => ({ ...prev, [tab.key]: v }))}
                />
              </div>
              <Table
                dataSource={filteredLines}
                columns={buildScheduleColumns(d.lines)}
                rowKey="scheduleId"
                size="small"
                pagination={false}
                scroll={{ x: 1050 }}
                rowClassName={(rec) => rec.periodName === period && rec.postingStatus === 'Not Posted' ? 'ant-table-row-selected' : ''}
              />
            </>
          );
        })()}
      </div>
    );
  };

  // ── confirm modal lines preview ───────────────────────────────────────────

  const confirmModalLines = () => {
    if (!confirmTab) return [];
    const tab = detailTabs.find(t => t.key === confirmTab);
    return (tab?.detail?.lines || []).filter(l => l.periodName === currentPeriod() && l.postingStatus === 'Not Posted');
  };

  // ── tabs ──────────────────────────────────────────────────────────────────

  const tabItems = [
    {
      key:   'search',
      label: 'Manage Multiperiod Accounting',
      children: (
        <>
          {/* Search form */}
          <Card size="small" style={{ marginBottom: 12 }}>
            <Form form={form} layout="inline" size="small" onFinish={handleSearch}>
              <Form.Item name="invoiceNumber" label="Invoice Number">
                <Input placeholder="Search…" style={{ width: 160 }} allowClear />
              </Form.Item>
              <Form.Item name="supplier" label="Supplier">
                <Input placeholder="Search…" style={{ width: 180 }} allowClear />
              </Form.Item>
              <Form.Item name="businessUnit" label="Business Unit">
                <Select placeholder="All" style={{ width: 200 }} allowClear>
                  {businessUnits.map(bu => <Option key={bu} value={bu}>{bu}</Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="postingStatus" label="Status">
                <Select placeholder="All" style={{ width: 130 }} allowClear>
                  <Option value="Not Posted">Not Posted</Option>
                  <Option value="Posted">Posted</Option>
                  <Option value="Error">Error</Option>
                </Select>
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={searching}>Search</Button>
                  <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          {searchErr && <Alert type="error" showIcon message={searchErr} style={{ marginBottom: 12 }} />}

          {(() => {
            const filteredSearchResult = searchResult.filter(r => {
              if (mpaStatusFilter === 'open')   return (r.openLines   ?? 0) > 0;
              if (mpaStatusFilter === 'closed') return (r.closedLines ?? 0) > 0 && (r.openLines ?? 0) === 0;
              return true;
            });
            return (
              <>
                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
                  <Radio.Group
                    value={mpaStatusFilter}
                    onChange={e => setMpaStatusFilter(e.target.value)}
                    optionType="button"
                    buttonStyle="solid"
                    size="small"
                  >
                    <Radio.Button value="all">All</Radio.Button>
                    <Radio.Button value="open">Open</Radio.Button>
                    <Radio.Button value="closed">Closed</Radio.Button>
                  </Radio.Group>
                </div>
                <Table
                  dataSource={filteredSearchResult}
                  columns={searchColumns}
                  rowKey="invoiceId"
                  size="small"
                  loading={searching}
                  pagination={{ pageSize: 20, showSizeChanger: true }}
                  scroll={{ x: 1000 }}
                  locale={{ emptyText: 'Run a search to see multiperiod invoices' }}
                />
              </>
            );
          })()}
        </>
      ),
    },
    {
      key:   'fusion',
      label: <span><ApiOutlined style={{ marginRight: 4 }} />Data from Fusion</span>,
      children: (
        <>
          <Card size="small" style={{ marginBottom: 12 }}>
            <Form form={fusionForm} layout="inline" size="small" onFinish={handleFusionSearch}>
              <Form.Item name="invoiceNumber" label="Invoice Number">
                <Input placeholder="Search…" style={{ width: 160 }} allowClear />
              </Form.Item>
              <Form.Item name="supplier" label="Supplier">
                <Input placeholder="Search…" style={{ width: 180 }} allowClear />
              </Form.Item>
              <Form.Item name="businessUnit" label="Business Unit">
                <Select placeholder="All" style={{ width: 200 }} allowClear>
                  {businessUnits.map(bu => <Option key={bu} value={bu}>{bu}</Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="lineDescription" label="Description">
                <Input placeholder="Search…" style={{ width: 160 }} allowClear />
              </Form.Item>
              <Form.Item
                name="openAsOf"
                label="Open As Of"
                tooltip="Show only lines where MPA End Date ≥ selected date"
              >
                <DatePicker
                  format="DD-MMM-YY"
                  placeholder="e.g. 01-May-26"
                  style={{ width: 140 }}
                  allowClear
                />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={fusionLoading}>
                    Search
                  </Button>
                  <Button icon={<ReloadOutlined />} onClick={() => { fusionForm.resetFields(); setFusionRows([]); setFusionErr(null); setFusionSearched(false); }}>
                    Reset
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          {fusionErr && <Alert type="error" showIcon message={fusionErr} style={{ marginBottom: 12 }} />}

          {fusionSearched && !fusionLoading && fusionRows.length > 0 && (() => {
            const totalScheduled  = fusionRows.reduce((s, r) => s + (r.totalScheduled  || 0), 0);
            const totalPosted     = fusionRows.reduce((s, r) => s + (r.postedAmount    || 0), 0);
            const totalPending    = fusionRows.reduce((s, r) => s + (r.pendingAmount   || 0), 0);
            const currency        = fusionRows[0]?.invoiceCurrency || '';
            return (
              <Row gutter={12} style={{ marginBottom: 12 }}>
                <Col span={4}>
                  <Card size="small">
                    <Statistic title="Lines" value={fusionRows.length} valueStyle={{ fontSize: 14 }} />
                  </Card>
                </Col>
                <Col span={4}>
                  <Card size="small">
                    <Statistic title="Invoices" value={new Set(fusionRows.map(r => r.invoiceId)).size} valueStyle={{ fontSize: 14 }} />
                  </Card>
                </Col>
                <Col span={4}>
                  <Card size="small">
                    <Statistic title="Schedules" value={new Set(fusionRows.filter(r => r.scheduleGenerated).map(r => r.invoiceId)).size} valueStyle={{ fontSize: 14, color: REDWOOD.success }} suffix="generated" />
                  </Card>
                </Col>
                <Col span={4}>
                  <Card size="small">
                    <Statistic title="Total Scheduled" value={totalScheduled} precision={2} prefix={currency} valueStyle={{ fontSize: 13 }} />
                  </Card>
                </Col>
                <Col span={4}>
                  <Card size="small">
                    <Statistic title="Posted" value={totalPosted} precision={2} prefix={currency} valueStyle={{ fontSize: 13, color: REDWOOD.success }} />
                  </Card>
                </Col>
                <Col span={4}>
                  <Card size="small">
                    <Statistic title="Pending" value={totalPending} precision={2} prefix={currency} valueStyle={{ fontSize: 13, color: REDWOOD.warning }} />
                  </Card>
                </Col>
              </Row>
            );
          })()}

          {fusionSearched && !fusionLoading && fusionRows.some(r => !r.scheduleGenerated) && (
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                icon={<SyncOutlined />}
                type="primary"
                style={{ background: '#722ed1', borderColor: '#722ed1' }}
                onClick={openBulkModal}
              >
                Generate Schedule for All Pending
              </Button>
            </div>
          )}

          <Table
            dataSource={fusionRows}
            columns={fusionColumns}
            rowKey={(r) => `${r.invoiceId}-${r.lineNumber}`}
            size="small"
            loading={fusionLoading}
            pagination={{ pageSize: 25, showSizeChanger: true, showTotal: (total) => `${total} lines` }}
            scroll={{ x: 1600 }}
            locale={{ emptyText: fusionSearched ? 'No multiperiod invoice lines found' : 'Run a search to see invoice lines eligible for multiperiod accounting' }}
          />
        </>
      ),
    },
    {
      key: 'post-accrual',
      label: <span><CalendarOutlined style={{ marginRight: 4 }} />Post Accrual</span>,
      children: (
        <div style={{ padding: '0 4px' }}>
          {/* Period selector */}
          <Card size="small" style={{ marginBottom: 12 }}>
            <Space align="center">
              <Text strong>Accrual Period:</Text>
              <Select
                value={accrualPeriod || undefined}
                onChange={(v: string) => { setAccrualPeriod(v); loadAccrualLines(v); }}
                style={{ width: 160 }}
                placeholder="Select period"
                loading={accrualLoading}
              >
                {accrualPeriods.map(p => <Option key={p} value={p}>{p}</Option>)}
              </Select>
              <Button
                icon={<ReloadOutlined />}
                size="small"
                onClick={() => { loadAccrualPeriods(); }}
              >
                Refresh Periods
              </Button>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Default shows first open (unposted) period
              </Text>
            </Space>
          </Card>

          {/* Invoices with open lines in this period */}
          {(() => {
            // Flatten: one row per schedule line for the selected period
            const allFlatRows = accrualLines.flatMap((inv: any) =>
              (inv.periodNotPostedLines || []).map((sl: any) => ({
                rowKey: `${inv.invoiceId}-${sl.scheduleId}`,
                scheduleId: sl.scheduleId,
                invoiceId: inv.invoiceId,
                invoiceNumber: inv.invoiceNumber,
                supplier: inv.supplier,
                businessUnit: inv.businessUnit,
                currencyCode: inv.currencyCode,
                totalLines: inv.totalLines,
                closedLines: inv.closedLines,
                openLines: inv.openLines,
                totalAmount: inv.totalAmount,
                postedToDate: inv.postedToDate,
                periodAmt: sl.periodAmount,
                chargeAccount: sl.chargeAccount,
                accrualAccount: sl.accrualAccount,
                description: sl.description,
                periodName: sl.periodName,
                lineNumber: sl.lineNumber,
              }))
            );

            // Apply global search filter across all text columns
            const q = accrualSearch.trim().toLowerCase();
            const flatRows = q
              ? allFlatRows.filter((r: any) =>
                  [r.invoiceNumber, r.supplier, r.description, r.chargeAccount,
                   r.accrualAccount, r.businessUnit, r.periodName, String(r.scheduleId), String(r.lineNumber)]
                    .some(v => v && String(v).toLowerCase().includes(q))
                )
              : allFlatRows;

            // Unique invoice numbers for column filter
            const invoiceOptions = [...new Set(allFlatRows.map((r: any) => r.invoiceNumber as string))]
              .sort()
              .map(v => ({ text: v, value: v }));

            return (
              <>
                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Input.Search
                    placeholder="Search any column…"
                    allowClear
                    size="small"
                    style={{ width: 280 }}
                    value={accrualSearch}
                    onChange={e => setAccrualSearch(e.target.value)}
                    onSearch={v => setAccrualSearch(v)}
                  />
                </div>
                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {accrualSelected.length > 0 ? `${accrualSelected.length} schedule(s) selected` : 'Select schedules to create accrual accounting entries'}
                  </Text>
                  <Space>
                    {accrualSelected.length > 0 && (
                      <Button size="small" onClick={() => setAccrualSelected([])}>Clear Selection</Button>
                    )}
                    <Button
                      type="primary"
                      icon={<BookOutlined />}
                      disabled={accrualSelected.length === 0}
                      onClick={() => {
                        const selectedSet = new Set(accrualSelected);
                        const lines: any[] = [];
                        let lineNum = 1;
                        flatRows
                          .filter((r: any) => selectedSet.has(r.scheduleId))
                          .forEach((r: any) => {
                            lines.push({
                              lineNum: lineNum++, scheduleId: r.scheduleId,
                              invoiceId: r.invoiceId, invoiceNumber: r.invoiceNumber,
                              supplier: r.supplier, businessUnit: r.businessUnit,
                              periodName: r.periodName,
                              account: r.chargeAccount, accountType: 'Expense (DR)',
                              description: r.description,
                              dr: r.periodAmt, cr: 0,
                              reference1: r.invoiceNumber,
                              reference2: String(r.scheduleId),
                              reference3: r.periodName,
                              reference4: r.invoiceNumber,
                              reference5: 'MPA_ACCRUAL',
                            });
                            lines.push({
                              lineNum: lineNum++, scheduleId: r.scheduleId,
                              invoiceId: r.invoiceId, invoiceNumber: r.invoiceNumber,
                              supplier: r.supplier, businessUnit: r.businessUnit,
                              periodName: r.periodName,
                              account: r.accrualAccount, accountType: 'Accrual (CR)',
                              description: r.description,
                              dr: 0, cr: r.periodAmt,
                              reference1: r.invoiceNumber,
                              reference2: String(r.scheduleId),
                              reference3: r.periodName,
                              reference4: r.invoiceNumber,
                              reference5: 'MPA_ACCRUAL',
                            });
                          });
                        setAccrualPreviewLines(lines);
                        setAccrualPreviewOpen(true);
                      }}
                    >
                      Create Accrual Accounting
                    </Button>
                  </Space>
                </div>
                <Table
                  dataSource={flatRows}
                  rowKey="scheduleId"
                  size="small"
                  loading={accrualLoading}
                  pagination={{ pageSize: 25, showSizeChanger: true }}
                  scroll={{ x: 1300 }}
                  rowSelection={{
                    selectedRowKeys: accrualSelected,
                    onChange: (keys) => setAccrualSelected(keys as number[]),
                  }}
                  locale={{ emptyText: accrualPeriod ? `No accrual lines for ${accrualPeriod}` : 'Select a period to see accrual lines' }}
                  summary={(rows) => {
                    const totPeriod  = rows.reduce((s, r: any) => s + (r.periodAmt || 0), 0);
                    const cur = rows[0] as any;
                    return (
                      <Table.Summary.Row style={{ background: '#f0f5ff', fontWeight: 700 }}>
                        <Table.Summary.Cell index={0} colSpan={4}><strong>Total ({rows.length} schedules)</strong></Table.Summary.Cell>
                        <Table.Summary.Cell index={4} align="right">
                          <Text strong style={{ color: '#1677ff', fontSize: 11 }}>{fmtAmt(totPeriod, cur?.currencyCode)}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={5} colSpan={5} />
                      </Table.Summary.Row>
                    );
                  }}
                  columns={[
                    {
                      title: 'Sched ID', dataIndex: 'scheduleId', width: 80, fixed: 'left' as const,
                      render: (v: number) => <Tag style={{ fontSize: 10, fontFamily: 'monospace' }}>{v}</Tag>,
                    },
                    {
                      title: 'Line', dataIndex: 'lineNumber', width: 55, align: 'center' as const,
                      render: (v: number) => <Text style={{ fontSize: 11 }}>{v}</Text>,
                    },
                    {
                      title: 'Period', dataIndex: 'periodName', width: 90,
                      render: (v: string) => <Tag color="purple" style={{ fontSize: 10 }}>{v}</Tag>,
                    },
                    {
                      title: 'Invoice Number', dataIndex: 'invoiceNumber', width: 150, fixed: 'left' as const,
                      filters: invoiceOptions,
                      onFilter: (value: any, rec: any) => rec.invoiceNumber === value,
                      filterSearch: true,
                      render: (v: string, rec: any) => (
                        <Button type="link" size="small" style={{ padding: 0, fontSize: 11 }} onClick={() => openDetail(rec)}>{v}</Button>
                      ),
                    },
                    { title: 'Supplier', dataIndex: 'supplier', ellipsis: true, width: 180,
                      render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text> },
                    { title: 'Description', dataIndex: 'description', ellipsis: true, width: 200,
                      render: (v: string) => <Text style={{ fontSize: 11 }} title={v}>{v}</Text> },
                    {
                      title: `${accrualPeriod || 'Period'} Amount`, dataIndex: 'periodAmt', width: 140, align: 'right' as const,
                      render: (v: number, rec: any) => <Text strong style={{ color: '#1677ff', fontSize: 11 }}>{fmtAmt(v, rec.currencyCode)}</Text>,
                    },
                    {
                      title: 'Charge A/C (Expense DR)', dataIndex: 'chargeAccount', ellipsis: true, width: 200,
                      render: (v: string) => <Text code style={{ fontSize: 10 }}>{v || '—'}</Text>,
                    },
                    {
                      title: 'Accrual A/C (CR)', dataIndex: 'accrualAccount', ellipsis: true, width: 200,
                      render: (v: string) => <Text code style={{ fontSize: 10 }}>{v || '—'}</Text>,
                    },
                    {
                      title: 'Invoice Total', dataIndex: 'totalAmount', width: 130, align: 'right' as const,
                      render: (v: number, rec: any) => <Text style={{ color: '#555', fontSize: 11 }}>{fmtAmt(v, rec.currencyCode)}</Text>,
                    },
                    {
                      title: 'Posted to Date', dataIndex: 'postedToDate', width: 130, align: 'right' as const,
                      render: (v: number, rec: any) => <Text style={{ color: REDWOOD.success, fontSize: 11 }}>{fmtAmt(v, rec.currencyCode)}</Text>,
                    },
                    {
                      title: 'Action', width: 100, fixed: 'right' as const,
                      render: (_: any, rec: any) => (
                        <Button size="small" onClick={() => openDetail(rec)}>View & Post</Button>
                      ),
                    },
                  ]}
                />
              </>
            );
          })()}
          <Modal
            open={accrualPreviewOpen}
            onCancel={() => setAccrualPreviewOpen(false)}
            title={
              <Space>
                <BookOutlined style={{ color: REDWOOD.primary }} />
                <span>Accrual Accounting Preview — {accrualPeriod}</span>
                <Tag color="blue">{accrualPreviewLines.filter(l => l.dr > 0).length} invoices</Tag>
              </Space>
            }
            width="95vw"
            style={{ maxWidth: 1600 }}
            footer={
              <Space>
                <Button onClick={() => setAccrualPreviewOpen(false)}>Close</Button>
              </Space>
            }
            destroyOnClose
          >
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12, fontSize: 11 }}
              message="DR Expense Account (Charge A/C) / CR Accrual Account — one journal pair per schedule line. Ref 5 class = MPA_ACCRUAL"
            />
            <Table
              dataSource={accrualPreviewLines}
              rowKey={(r: any) => `${r.scheduleId}-${r.accountType}`}
              size="small"
              pagination={false}
              scroll={{ x: 1700, y: 480 }}
              rowClassName={(r: any) => r.dr > 0 ? 'mpa-preview-dr' : 'mpa-preview-cr'}
              summary={(rows) => {
                const totDr = rows.reduce((s: number, r: any) => s + (r.dr || 0), 0);
                const totCr = rows.reduce((s: number, r: any) => s + (r.cr || 0), 0);
                return (
                  <Table.Summary.Row style={{ background: '#f0f5ff', fontWeight: 700 }}>
                    <Table.Summary.Cell index={0} colSpan={5}><strong>Total</strong></Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      <Text strong style={{ color: '#237804', fontSize: 12 }}>{totDr.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                      <Text strong style={{ color: REDWOOD.primary, fontSize: 12 }}>{totCr.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} colSpan={5} />
                  </Table.Summary.Row>
                );
              }}
              columns={[
                {
                  title: '#', dataIndex: 'lineNum', width: 42,
                  render: (v: number) => <Text style={{ fontSize: 11 }}>{v}</Text>,
                },
                {
                  title: 'Sched ID', dataIndex: 'scheduleId', width: 75,
                  render: (v: number) => <Tag style={{ fontSize: 10, fontFamily: 'monospace' }}>{v}</Tag>,
                },
                {
                  title: 'Invoice', dataIndex: 'invoiceNumber', width: 130,
                  render: (v: string) => <Text style={{ fontSize: 11, fontWeight: 600 }}>{v}</Text>,
                },
                {
                  title: 'Type', dataIndex: 'accountType', width: 105,
                  render: (v: string) => (
                    <Tag color={v.startsWith('Expense') ? 'blue' : 'orange'} style={{ fontSize: 10 }}>{v}</Tag>
                  ),
                },
                {
                  title: 'Account / Description', dataIndex: 'account', width: 240,
                  render: (v: string, r: any) => (
                    <div>
                      <Text code style={{ fontSize: 10 }}>{v || '—'}</Text>
                      {r.description && (
                        <div style={{ fontSize: 10, color: '#666', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.description}>
                          {r.description}
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  title: 'Debit', dataIndex: 'dr', width: 120, align: 'right' as const,
                  render: (v: number) => v > 0
                    ? <Text style={{ fontFamily: 'monospace', color: '#237804', fontSize: 12, fontWeight: 600 }}>{v.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                    : null,
                },
                {
                  title: 'Credit', dataIndex: 'cr', width: 120, align: 'right' as const,
                  render: (v: number) => v > 0
                    ? <Text style={{ fontFamily: 'monospace', color: REDWOOD.primary, fontSize: 12, fontWeight: 600 }}>{v.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                    : null,
                },
                {
                  title: 'Ref 1 — Invoice No', dataIndex: 'reference1', width: 140, ellipsis: true,
                  render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
                },
                {
                  title: 'Ref 2 — Schedule ID', dataIndex: 'reference2', width: 120,
                  render: (v: string) => <Tag style={{ fontSize: 10, fontFamily: 'monospace' }}>{v}</Tag>,
                },
                {
                  title: 'Ref 3 — Period', dataIndex: 'reference3', width: 95,
                  render: (v: string) => <Tag color="purple" style={{ fontSize: 10 }}>{v}</Tag>,
                },
                {
                  title: 'Ref 4 — Invoice No', dataIndex: 'reference4', width: 140, ellipsis: true,
                  render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
                },
                {
                  title: 'Ref 5 — Class', dataIndex: 'reference5', width: 110,
                  render: (v: string) => <Tag color="geekblue" style={{ fontSize: 10 }}>{v}</Tag>,
                },
              ]}
            />
          </Modal>
        </div>
      ),
    },
    ...detailTabs.map(tab => ({
      key:   tab.key,
      label: (
        <span>
          <FileTextOutlined style={{ marginRight: 4 }} />
          {tab.label}
          <CloseOutlined
            style={{ marginLeft: 8, fontSize: 11, color: '#999' }}
            onClick={(e) => { e.stopPropagation(); closeTab(tab.key); }}
          />
        </span>
      ),
      children: renderDetail(tab),
    })),
  ];

  // ── main render ───────────────────────────────────────────────────────────

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral }}>
      <Content style={{ padding: '12px 16px' }}>
        {/* Breadcrumb */}
        <Breadcrumb style={{ marginBottom: 8 }} items={[
          { title: <Link to="/"><HomeOutlined /></Link> },
          { title: <Link to="/ap">Accounts Payable</Link> },
          { title: 'Multiperiod Accounting' },
        ]} />

        {/* Page title */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Space size={10}>
            <CalendarOutlined style={{ fontSize: 22, color: REDWOOD.primary }} />
            <Title level={4} style={{ margin: 0, color: REDWOOD.primary }}>Multiperiod Accounting</Title>
          </Space>
          <Tooltip title="View Page APIs">
            <Button
              icon={<ApiOutlined />}
              size="small"
              style={{ color: REDWOOD.info }}
              onClick={() => setApiModalOpen(true)}
            />
          </Tooltip>
        </div>

        <Card bodyStyle={{ padding: 12 }}>
          <Tabs
            activeKey={activeTab}
            onChange={(key) => {
              setActiveTab(key);
              if (key === 'post-accrual') loadAccrualPeriods();
            }}
            type="card"
            size="small"
            items={tabItems}
          />
        </Card>

        {/* ── Fusion Detail Drawer ─────────────────────────────────────── */}
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={900}
          title={
            drawerData
              ? <Space>
                  <FileTextOutlined style={{ color: REDWOOD.primary }} />
                  <span style={{ color: REDWOOD.primary, fontWeight: 600 }}>
                    {drawerData.invoiceNumber}
                  </span>
                  <Tag color="default">{drawerData.businessUnit}</Tag>
                  {drawerData.openAsOf && (
                    <Tag color="blue" icon={<CalendarOutlined />}>Open as of {fmtDate(drawerData.openAsOf)}</Tag>
                  )}
                </Space>
              : 'Invoice Detail'
          }
          extra={
            <Space>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                loading={drawerLoading}
                onClick={refreshDrawer}
              >
                Refresh
              </Button>
              {drawerData && (() => {
              const hasSchedule = (drawerData.lines || []).some(l => l.scheduleGenerated);
              if (!hasSchedule) return (
                <Button
                  size="small"
                  icon={<SyncOutlined />}
                  loading={generating.has(drawerData.invoiceId)}
                  onClick={async () => {
                    await handleGenerate(drawerData.invoiceId);
                    await refreshDrawer();
                  }}
                >
                  Generate Schedule
                </Button>
              );
              return (
                <Popconfirm
                  title="Delete MPA Schedule"
                  description="Delete all pending (not-posted) periods for this invoice?"
                  onConfirm={async () => {
                    await handleDeleteMpa(drawerData.invoiceId);
                    setDrawerOpen(false);
                    await handleFusionSearch();
                  }}
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  cancelText="Cancel"
                >
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    loading={deleting.has(drawerData.invoiceId)}
                  >
                    Delete Schedule
                  </Button>
                </Popconfirm>
              );
            })()}
            </Space>
          }
        >
          {drawerLoading && !drawerData && (
            <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
          )}
          {drawerData && (() => {
            const d = drawerData;
            const currency = d.currencyCode || '';
            const totalScheduled = (d.lines || []).reduce((s, l) => s + (l.totalScheduled || 0), 0);
            const totalPosted    = (d.lines || []).reduce((s, l) => s + (l.postedAmount   || 0), 0);
            const totalPending   = (d.lines || []).reduce((s, l) => s + (l.pendingAmount  || 0), 0);
            const totalPendingFD = (d.lines || []).reduce((s, l) => s + (l.pendingFromDate|| 0), 0);

            const periodCols: ColumnsType<FusionMpaSchedulePeriod> = [
              {
                title: 'Period', dataIndex: 'periodName', width: 95,
                render: v => <Text strong style={{ fontSize: 12 }}>{v}</Text>,
              },
              {
                title: 'Date', dataIndex: 'periodDate', width: 100,
                render: v => <Text style={{ fontSize: 12 }}>{fmtDate(v)}</Text>,
              },
              {
                title: 'Amount', dataIndex: 'periodAmount', width: 120, align: 'right' as const,
                render: v => <Text strong style={{ fontSize: 12 }}>{fmtAmt(v, currency)}</Text>,
              },
              {
                title: 'Status', dataIndex: 'postingStatus', width: 110,
                render: v => statusTag(v),
              },
              {
                title: 'Posted By', dataIndex: 'postedBy', width: 120, ellipsis: true,
                render: v => <Text type="secondary" style={{ fontSize: 11 }}>{v || '—'}</Text>,
              },
              {
                title: 'Posted Date', dataIndex: 'postedDate', width: 105,
                render: v => <Text type="secondary" style={{ fontSize: 11 }}>{fmtDate(v)}</Text>,
              },
              {
                title: 'Accrual A/C', dataIndex: 'accrualAccount', ellipsis: true,
                render: v => <Text code style={{ fontSize: 10 }}>{v || '—'}</Text>,
              },
            ];

            const collapseItems = (d.lines || []).map(ln => ({
              key: String(ln.lineNumber),
              label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <Tag color="blue">Line {ln.lineNumber}</Tag>
                  <Text style={{ fontSize: 12 }}>{ln.lineDescription || '—'}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {fmtDate(ln.mpaStartDate)} → {fmtDate(ln.mpaEndDate)}
                  </Text>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    {ln.scheduleGenerated
                      ? <Tag color="success" icon={<CheckCircleOutlined />}>Generated</Tag>
                      : <Tag color="default">No Schedule</Tag>
                    }
                    <Text strong style={{ fontSize: 12 }}>{fmtAmt(ln.lineAmount, currency)}</Text>
                  </span>
                </div>
              ),
              children: (
                <div>
                  <Row gutter={8} style={{ marginBottom: 10 }}>
                    <Col span={6}>
                      <Card size="small" bodyStyle={{ padding: '6px 10px' }}>
                        <Statistic title="Scheduled" value={ln.totalScheduled} precision={2} prefix={currency} valueStyle={{ fontSize: 12 }} />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small" bodyStyle={{ padding: '6px 10px' }}>
                        <Statistic title="Posted" value={ln.postedAmount} precision={2} prefix={currency} valueStyle={{ fontSize: 12, color: REDWOOD.success }} />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small" bodyStyle={{ padding: '6px 10px' }}>
                        <Statistic title="Pending" value={ln.pendingAmount} precision={2} prefix={currency} valueStyle={{ fontSize: 12, color: REDWOOD.warning }} />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small" bodyStyle={{ padding: '6px 10px' }}>
                        <Statistic
                          title={d.openAsOf ? `Pending ≥ ${fmtDate(d.openAsOf)}` : 'Pending (all)'}
                          value={ln.pendingFromDate}
                          precision={2}
                          prefix={currency}
                          valueStyle={{ fontSize: 12, color: REDWOOD.warning }}
                        />
                      </Card>
                    </Col>
                  </Row>
                  <div style={{ marginBottom: 6 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Charge A/C: <Text code style={{ fontSize: 10 }}>{ln.chargeAccount || '—'}</Text>
                      {'  '}
                      Accrual A/C: <Text code style={{ fontSize: 10 }}>{ln.accrualAccount || '—'}</Text>
                    </Text>
                  </div>
                  {(ln.periods || []).length === 0 ? (
                    <Alert type="info" showIcon message="No schedule periods — generate the schedule first." />
                  ) : (
                    <Table
                      dataSource={ln.periods}
                      columns={periodCols}
                      rowKey="scheduleId"
                      size="small"
                      pagination={false}
                      scroll={{ x: 700 }}
                      rowClassName={rec => rec.postingStatus !== 'Posted' ? 'ant-table-row-selected' : ''}
                    />
                  )}
                </div>
              ),
            }));

            return (
              <>
                {/* Invoice header */}
                <Descriptions size="small" column={3} bordered style={{ marginBottom: 14 }}>
                  <Descriptions.Item label="Invoice Number">
                    <Text strong>{d.invoiceNumber}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Invoice Date">{fmtDate(d.invoiceDate)}</Descriptions.Item>
                  <Descriptions.Item label="Invoice Amount">
                    <Text strong>{fmtAmt(d.invoiceAmount, currency)}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Supplier">{d.supplier}</Descriptions.Item>
                  <Descriptions.Item label="Supplier No.">{d.supplierNumber}</Descriptions.Item>
                  <Descriptions.Item label="Business Unit">{d.businessUnit}</Descriptions.Item>
                </Descriptions>

                {/* Summary */}
                <Row gutter={8} style={{ marginBottom: 14 }}>
                  <Col span={6}>
                    <Card size="small">
                      <Statistic title="Total Scheduled" value={totalScheduled} precision={2} prefix={currency} valueStyle={{ fontSize: 13 }} />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card size="small">
                      <Statistic title="Posted / Expensed" value={totalPosted} precision={2} prefix={currency} valueStyle={{ fontSize: 13, color: REDWOOD.success }} />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card size="small">
                      <Statistic title="Pending (Total)" value={totalPending} precision={2} prefix={currency} valueStyle={{ fontSize: 13, color: REDWOOD.warning }} />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card size="small">
                      <Statistic
                        title={d.openAsOf ? `Pending ≥ ${fmtDate(d.openAsOf)}` : 'Pending (all)'}
                        value={totalPendingFD}
                        precision={2}
                        prefix={currency}
                        valueStyle={{ fontSize: 13, color: REDWOOD.warning }}
                      />
                    </Card>
                  </Col>
                </Row>

                {/* Per-line collapse */}
                {drawerLoading ? (
                  <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                ) : (
                  <Collapse
                    defaultActiveKey={(d.lines || []).map(l => String(l.lineNumber))}
                    items={collapseItems}
                    size="small"
                  />
                )}
              </>
            );
          })()}
        </Drawer>

        {/* Post confirmation modal */}
        <Modal
          open={confirmOpen}
          title={<Space><BookOutlined />Post {currentPeriod()} Accrual</Space>}
          onOk={handlePostConfirm}
          onCancel={() => setConfirmOpen(false)}
          okText="Post Accrual"
          okType="primary"
          okButtonProps={{ style: { background: REDWOOD.primary } }}
          width={700}
        >
          <Alert
            type="info"
            showIcon
            message={`This will create Dr Expense / Cr Accrual accounting entries for period ${currentPeriod()}.`}
            style={{ marginBottom: 12 }}
          />
          <Table
            dataSource={confirmModalLines()}
            rowKey="scheduleId"
            size="small"
            pagination={false}
            columns={[
              { title: 'Line', dataIndex: 'lineNumber', width: 55 },
              { title: 'Description', dataIndex: 'description', ellipsis: true },
              { title: 'Dr (Expense)', dataIndex: 'chargeAccount', ellipsis: true, width: 180,
                render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
              { title: 'Cr (Accrual)', dataIndex: 'accrualAccount', ellipsis: true, width: 180,
                render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
              { title: 'Amount', dataIndex: 'periodAmount', width: 110, align: 'right' as const,
                render: v => <Text strong>{fmtAmt(v)}</Text> },
            ]}
          />
        </Modal>

        {/* ── View Accounting Modal ────────────────────────────────────── */}
        <Modal
          open={acctModalOpen}
          title={<Space><EyeOutlined style={{ color: REDWOOD.info }} />Multiperiod Accounting Journal</Space>}
          onCancel={() => setAcctModalOpen(false)}
          footer={<Button onClick={() => setAcctModalOpen(false)}>Close</Button>}
          width={900}
        >
          {acctLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
          ) : !acctData?.found ? (
            <Alert
              type="warning"
              showIcon
              message="No accounting entries found"
              description="No journal entries have been posted yet for this invoice's multiperiod schedule."
            />
          ) : (
            <>
              <Descriptions size="small" column={3} style={{ marginBottom: 12 }}>
                <Descriptions.Item label="Journal #">{acctData.headerId}</Descriptions.Item>
                <Descriptions.Item label="Period">{acctData.periodName}</Descriptions.Item>
                <Descriptions.Item label="Accounting Date">{acctData.accountingDate ? dayjs(acctData.accountingDate).format('DD MMM YYYY') : '—'}</Descriptions.Item>
                <Descriptions.Item label="Status">
                  {acctData.accountingStatus === 'POSTED'
                    ? <Tag color="success">Posted</Tag>
                    : <Tag color="processing">{acctData.accountingStatus}</Tag>}
                </Descriptions.Item>
                <Descriptions.Item label="Posted By">{acctData.postedBy || '—'}</Descriptions.Item>
                <Descriptions.Item label="GL Batch">{acctData.glBatchName || '—'}</Descriptions.Item>
              </Descriptions>
              <Table
                dataSource={acctData.lines}
                rowKey="lineId"
                size="small"
                pagination={false}
                scroll={{ x: 800 }}
                columns={[
                  { title: '#', dataIndex: 'lineNumber', width: 45, align: 'center' as const },
                  {
                    title: 'Type', dataIndex: 'lineType', width: 55, align: 'center' as const,
                    render: (v: string) => (
                      <Tag color={v === 'DR' ? 'blue' : 'orange'} style={{ fontWeight: 600 }}>{v}</Tag>
                    ),
                  },
                  { title: 'Class', dataIndex: 'accountingClass', width: 100 },
                  {
                    title: 'Account', dataIndex: 'accountCombination', ellipsis: true,
                    render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text>,
                  },
                  { title: 'Description', dataIndex: 'description', ellipsis: true },
                  {
                    title: 'Dr Amount', dataIndex: 'enteredDr', width: 120, align: 'right' as const,
                    render: (v: number) => v ? <Text style={{ color: REDWOOD.info }}>{fmtAmt(v)}</Text> : <Text type="secondary">—</Text>,
                  },
                  {
                    title: 'Cr Amount', dataIndex: 'enteredCr', width: 120, align: 'right' as const,
                    render: (v: number) => v ? <Text style={{ color: REDWOOD.success }}>{fmtAmt(v)}</Text> : <Text type="secondary">—</Text>,
                  },
                ]}
                summary={() => {
                  const totalDr = acctData.lines.reduce((s, l) => s + (l.enteredDr || 0), 0);
                  const totalCr = acctData.lines.reduce((s, l) => s + (l.enteredCr || 0), 0);
                  return (
                    <Table.Summary fixed>
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={5} align="right">
                          <Text strong>Total</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="right">
                          <Text strong style={{ color: REDWOOD.info }}>{fmtAmt(totalDr)}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={6} align="right">
                          <Text strong style={{ color: REDWOOD.success }}>{fmtAmt(totalCr)}</Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  );
                }}
              />
            </>
          )}
        </Modal>

        {/* ── API Debug Modal ──────────────────────────────────────────── */}
        <Modal
          open={apiModalOpen}
          title={<Space><ApiOutlined style={{ color: REDWOOD.info }} />Page APIs — Multiperiod Accounting</Space>}
          onCancel={() => setApiModalOpen(false)}
          footer={<Button onClick={() => setApiModalOpen(false)}>Close</Button>}
          width={800}
        >
          <div style={{ marginBottom: 12 }}>
            <Tag color="blue">Module: ap</Tag>
            <Tag color="green">Source: Oracle APEX ORDS</Tag>
          </div>

          {/* Endpoint reference table */}
          <Table
            size="small"
            pagination={false}
            style={{ marginBottom: lastApiUrl ? 16 : 0 }}
            dataSource={[
              { method: 'GET',  endpoint: `${APEX_DB_CONFIG.baseUrl}/ap/multiperiod/fusion-data`,       purpose: 'Data from Fusion — AP invoice lines with MPA dates' },
              { method: 'GET',  endpoint: `${APEX_DB_CONFIG.baseUrl}/ap/multiperiod/fusion-detail/:id`, purpose: 'Fusion Detail — per-line schedule with posted/pending totals' },
              { method: 'GET',  endpoint: `${APEX_DB_CONFIG.baseUrl}/ap/multiperiod`,                  purpose: 'Search — list invoices with MPA schedules' },
              { method: 'GET',  endpoint: `${APEX_DB_CONFIG.baseUrl}/ap/multiperiod/:invoice_id`,      purpose: 'Detail — schedule lines for one invoice' },
              { method: 'POST', endpoint: `${APEX_DB_CONFIG.baseUrl}/ap/multiperiod/generate`,         purpose: 'Generate / refresh schedule for an invoice' },
              { method: 'POST', endpoint: `${APEX_DB_CONFIG.baseUrl}/ap/multiperiod/mark-posted`,      purpose: 'Mark period lines as Posted after SLA create' },
            ]}
            rowKey="endpoint"
            columns={[
              { title: 'Method', dataIndex: 'method', width: 70,
                render: v => <Tag color={v === 'GET' ? 'blue' : 'orange'}>{v}</Tag> },
              { title: 'Endpoint', dataIndex: 'endpoint', ellipsis: true,
                render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
              { title: 'Purpose', dataIndex: 'purpose' },
            ]}
          />

          {/* Last called URL */}
          {lastApiUrl && (
            <Card
              size="small"
              title={
                <Space>
                  <span style={{ color: lastApiStatus === 'error' ? '#ff4d4f' : '#52c41a' }}>●</span>
                  <Text strong>Last Search Request</Text>
                  <Tag color={lastApiStatus === 'error' ? 'red' : 'green'}>
                    {lastApiStatus === 'error' ? 'Failed' : 'Success'}
                  </Tag>
                  {lastApiNote && <Text type="secondary" style={{ fontSize: 12 }}>{lastApiNote}</Text>}
                </Space>
              }
              style={{ border: `1px solid ${lastApiStatus === 'error' ? '#ff4d4f' : '#52c41a'}` }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text code style={{ fontSize: 11, flex: 1, wordBreak: 'break-all' }}>{lastApiUrl}</Text>
                <Tooltip title={copiedUrl ? 'Copied!' : 'Copy URL'}>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      navigator.clipboard.writeText(lastApiUrl);
                      setCopiedUrl(true);
                      setTimeout(() => setCopiedUrl(false), 2000);
                    }}
                  />
                </Tooltip>
                <Tooltip title="Open in new tab">
                  <Button
                    size="small"
                    icon={<ApiOutlined />}
                    onClick={() => window.open(lastApiUrl, '_blank')}
                  />
                </Tooltip>
              </div>
            </Card>
          )}

          {!lastApiUrl && (
            <Alert type="info" showIcon message="Run a search to see the last called API URL here." />
          )}
        </Modal>

        {/* ── Bulk Generate Schedule Modal ── */}
        <Modal
          open={bulkModalOpen}
          onCancel={() => { if (!bulkRunning) setBulkModalOpen(false); }}
          closable={!bulkRunning}
          maskClosable={!bulkRunning}
          width={700}
          title={
            <Space>
              <SyncOutlined style={{ color: '#722ed1' }} />
              <span>Generate Schedule — Pending Invoices</span>
              <Tag color="purple">{bulkInvoices.length} pending</Tag>
            </Space>
          }
          footer={
            bulkProgress.total > 0 && bulkProgress.done === bulkProgress.total ? (
              <Button type="primary" onClick={() => setBulkModalOpen(false)}>Done</Button>
            ) : (
              <Space>
                <Button onClick={() => setBulkModalOpen(false)} disabled={bulkRunning}>Cancel</Button>
                <Button
                  type="primary"
                  icon={<SyncOutlined spin={bulkRunning} />}
                  loading={bulkRunning}
                  disabled={bulkSelected.size === 0}
                  style={{ background: '#722ed1', borderColor: '#722ed1' }}
                  onClick={handleBulkGenerate}
                >
                  Generate Schedule ({bulkSelected.size})
                </Button>
              </Space>
            )
          }
          styles={{ body: { maxHeight: '65vh', overflowY: 'auto', padding: '12px 20px' } }}
        >
          {bulkProgress.total === 0 ? (
            /* ── Selection list ── */
            <>
              {bulkInvoices.length === 0 ? (
                <Alert type="success" showIcon message="All invoices in the current search already have schedules generated." />
              ) : (
                <>
                  <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                      type="checkbox"
                      id="select-all-bulk"
                      checked={bulkSelected.size === bulkInvoices.length}
                      ref={el => { if (el) el.indeterminate = bulkSelected.size > 0 && bulkSelected.size < bulkInvoices.length; }}
                      onChange={e => setBulkSelected(e.target.checked ? new Set(bulkInvoices.map(r => r.invoiceId)) : new Set())}
                    />
                    <label htmlFor="select-all-bulk" style={{ fontWeight: 600, cursor: 'pointer' }}>
                      Select All ({bulkInvoices.length} invoices)
                    </label>
                  </div>
                  <Table
                    dataSource={bulkInvoices}
                    rowKey="invoiceId"
                    size="small"
                    pagination={false}
                    scroll={{ y: 340 }}
                    columns={[
                      {
                        title: '', width: 40,
                        render: (_, rec) => (
                          <input
                            type="checkbox"
                            checked={bulkSelected.has(rec.invoiceId)}
                            onChange={e => setBulkSelected(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(rec.invoiceId) : next.delete(rec.invoiceId);
                              return next;
                            })}
                          />
                        ),
                      },
                      { title: 'Invoice Number', dataIndex: 'invoiceNumber', width: 160 },
                      { title: 'Supplier', dataIndex: 'supplier', ellipsis: true },
                      { title: 'Business Unit', dataIndex: 'businessUnit', width: 160, ellipsis: true },
                      {
                        title: 'Amount', dataIndex: 'lineAmount', width: 120, align: 'right' as const,
                        render: (v: number, rec) => `${rec.invoiceCurrency} ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                      },
                    ]}
                  />
                </>
              )}
            </>
          ) : (
            /* ── Progress view ── */
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text strong>{bulkRunning ? `Processing: ${bulkProgress.current}` : 'Completed'}</Text>
                  <Text type="secondary">{bulkProgress.done} / {bulkProgress.total}</Text>
                </div>
                <div style={{ background: '#f0f0f0', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4, transition: 'width 0.3s',
                    background: bulkRunning ? '#722ed1' : '#52c41a',
                    width: `${Math.round(bulkProgress.done / bulkProgress.total * 100)}%`,
                  }} />
                </div>
              </div>
              <Table
                dataSource={bulkProgress.results}
                rowKey="invoiceId"
                size="small"
                pagination={false}
                scroll={{ y: 340 }}
                columns={[
                  { title: 'Invoice', dataIndex: 'invoiceNumber', width: 160 },
                  {
                    title: 'Result', dataIndex: 'status', width: 90,
                    render: (v: string) => v === 'ok'
                      ? <Tag color="success" icon={<CheckCircleOutlined />}>Generated</Tag>
                      : v === 'skip'
                      ? <Tag color="blue">Already Exists</Tag>
                      : <Tag color="error">Error</Tag>,
                  },
                  { title: 'Note', dataIndex: 'note', ellipsis: true },
                ]}
              />
            </>
          )}
        </Modal>
      </Content>
    </Layout>
  );
};

export default ManageMultiperiod;
