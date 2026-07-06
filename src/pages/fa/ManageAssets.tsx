import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import {
  Layout, Card, Form, Input, Button, Space, Typography, Table, Tag,
  Row, Col, Breadcrumb, Tooltip, Select, Tabs, Descriptions,
  Spin, Empty, Badge, message, Modal, Switch, Statistic, DatePicker, Popconfirm, Divider,
} from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import {
  HomeOutlined, SearchOutlined, ReloadOutlined, PlusOutlined,
  FileTextOutlined, LineChartOutlined,
  EnvironmentOutlined, DatabaseOutlined, InfoCircleOutlined,
  BookOutlined, HistoryOutlined, BarcodeOutlined, ApiOutlined, CheckOutlined,
  FilterOutlined, DownloadOutlined, DollarOutlined, SaveOutlined, DeleteOutlined,
  AccountBookOutlined, AuditOutlined, TagsOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { postSlaToGL } from '../../services/glPosting.service';
import { useAuth } from '../../context/AuthContext';
import { APEX_DB_CONFIG } from '../../config/api.config';
import {
  searchAssets, getAssetDetail, getAssetBooks, getAssetDeprn,
  getAssetDistributions, getAssetInvoices, getAssetTransactions,
  getCategoryDetail, getCategoryBooks, postAssetDeprn, postSingleDeprn, deleteAssetDeprn,
  getBookControls,
  getAdditionsAccountingPreview, getDeprnAccountingPreview,
  checkSlaAccountingExists, getSlaAccounting,
  createSlaAccounting, markFaAdditionAccounted, markFaDeprnAccounted,
  updateAssetAttributes,
  formatCurrency, assetTypeLabel, assetStatusLabel,
} from '../../services/fa.service';
import type { JournalLine } from '../../services/manage-journals.service';
import type {
  AssetRecord, AssetDetail, AssetBook, DeprnRecord,
  DistributionRecord, InvoiceRecord, TransactionRecord, CategoryBookRecord,
  BookControlRecord, AccountingPreview, SlaExistsResult,
} from '../../services/fa.service';

const { Content } = Layout;
const { Text, Title } = Typography;
const { Option } = Select;

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDate = (v: string | null | undefined): string => {
  if (!v) return '—';
  if (/^\d{4}-[A-Za-z]{3}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return `${d.getUTCFullYear()}-${MONTHS[d.getUTCMonth()]}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const REDWOOD = {
  primary:    '#C74634',
  success:    '#1D7B4D',
  warning:    '#D4A800',
  info:       '#0572CE',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral300: '#C7C7C7',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface:    '#FFFFFF',
};
const FA_COLOR = '#CA7700';

const statusTag = (retiredFlag: string) => (
  <Tag color={retiredFlag === 'YES' ? 'error' : 'success'} style={{ borderRadius: 4, fontSize: 11 }}>
    {assetStatusLabel(retiredFlag)}
  </Tag>
);

// ── Per-tab data ───────────────────────────────────────────────────────────────
interface OpenAssetTab {
  key: string;
  asset: AssetRecord;
  loading: boolean;
  detail: Partial<AssetDetail> | null;
  books: AssetBook[];
  deprn: DeprnRecord[];
  distributions: DistributionRecord[];
  invoices: InvoiceRecord[];
  transactions: TransactionRecord[];
  categoryBooks: CategoryBookRecord[];
  categoryName: string;
  categoryId: string;
  categoryApiUrl: string;
  activeSubTab: string;
  additionSlaStatus: SlaExistsResult | null;
}

// ── Asset tab content ──────────────────────────────────────────────────────────
const AssetTabContent: React.FC<{
  tab: OpenAssetTab;
  onSubTabChange: (key: string, subTab: string) => void;
  onRefresh: () => void;
  onSlaStatusChange: (tabKey: string, status: SlaExistsResult) => void;
  setOpenAssetTabs: React.Dispatch<React.SetStateAction<OpenAssetTab[]>>;
}> = ({ tab, onSubTabChange, onRefresh, onSlaStatusChange, setOpenAssetTabs }) => {
  const { asset, detail, books, deprn, distributions, invoices, transactions, categoryBooks, categoryName, categoryId, categoryApiUrl, loading, activeSubTab } = tab;
  const { user } = useAuth();
  const loggedUser = user?.username || user?.name || 'REACTERP';

  // Depreciation filter state
  const [deprnFY,       setDeprnFY]       = useState('');
  const [deprnPeriod,   setDeprnPeriod]   = useState('');
  const [deprnPageSize, setDeprnPageSize] = useState(15);

  // Depreciation preview modal state
  interface DeprnRow { period: string; days: number; dailyRate: number; openingNbv: number; depreciation: number; closingNbv: number; }
  interface PostResult { period: string; status: 'POSTED' | 'ALREADY_EXISTS' | 'ERROR'; message?: string; }
  const [deprnModal,     setDeprnModal]     = useState(false);
  const [deprnFromDate,  setDeprnFromDate]  = useState<dayjs.Dayjs | null>(null);
  const [deprnToDate,    setDeprnToDate]    = useState<dayjs.Dayjs>(dayjs());
  const [deprnRows,      setDeprnRows]      = useState<DeprnRow[]>([]);
  const [selectedPeriods,setSelectedPeriods]= useState<Set<string>>(new Set());
  const [postResults,    setPostResults]    = useState<PostResult[]>([]);
  const [posting,        setPosting]        = useState(false);

  const openDeprnPreview = () => {
    const b0 = books[0];
    // Depreciation starts the month AFTER the date placed in service (following-month
    // prorate convention): an asset placed 30-Sep-2022 first depreciates in Oct-2022, so the
    // placed-in-service month must never be depreciated. We derive this from the DPIS rather
    // than the backend deprnStartDate/prorateDate because those fields come back equal to the
    // DPIS for these assets. Fall back to the backend start dates only when DPIS is missing.
    const dpis = asset.datePlacedInService;
    const startSource = dpis
      ? dayjs(dpis).add(1, 'month').startOf('month').format('YYYY-MM-DD')
      : (b0?.deprnStartDate || b0?.prorateDate || '');
    setDeprnFromDate(startSource ? dayjs(startSource) : null);
    setDeprnToDate(dayjs());
    setDeprnRows([]);
    setSelectedPeriods(new Set());
    setPostResults([]);
    setDeprnModal(true);
  };

  // Normalise a period string to "YYYY-MM" for duplicate detection
  const normPeriod = (p: string) => {
    const d = dayjs(p, ['MMM-YYYY', 'MMM-YY', 'MMMM-YYYY']);
    return d.isValid() ? d.format('YYYY-MM') : p.toUpperCase();
  };

  // Periods already posted for this asset (from deprn tab data)
  const postedPeriods = new Set(deprn.map(r => normPeriod(r.periodName)));
  const isPosted = (period: string) => postedPeriods.has(normPeriod(period));

  const handleCreateDeprn = async () => {
    const toPost = deprnRows.filter(r => selectedPeriods.has(r.period) && !isPosted(r.period));
    if (!toPost.length) return;
    setPosting(true);
    setPostResults([]);
    const results: PostResult[] = [];
    for (const row of toPost) {
      const res = await postSingleDeprn({
        assetId:      asset.assetId,
        bookTypeCode: asset.bookTypeCode || books[0]?.bookTypeCode || '',
        periodName:   row.period,
        deprnAmount:  row.depreciation,
        createdBy:    loggedUser,
      });
      results.push({
        period:  row.period,
        status:  res.status || (res.success ? 'POSTED' : 'ERROR'),
        message: res.error || res.message,
      });
    }
    setPostResults(results);
    setSelectedPeriods(new Set());
    setPosting(false);
    const posted = results.filter(r => r.status === 'POSTED').length;
    if (posted > 0) {
      message.success(`${posted} period(s) posted successfully`);
      // Refresh the tab so deprn rows get distributionId populated from DB
      onRefresh();
    }
  };

  const calcDeprn = () => {
    const b0 = books[0];
    const cost       = parseFloat(asset.cost)       || 0;
    const salvage    = parseFloat(b0?.salvageValue ?? asset.salvageValue) || 0;
    const lifeMonths = Number(b0?.lifeInMonths)     || 0;

    if (lifeMonths <= 0 || cost <= 0 || !deprnFromDate) { setDeprnRows([]); return; }

    const startDate = deprnFromDate.startOf('month');
    let totalLifeDays = 0;
    for (let i = 0; i < lifeMonths; i++) totalLifeDays += startDate.add(i, 'month').daysInMonth();
    const dailyRate = (cost - salvage) / totalLifeDays;

    const rows: DeprnRow[] = [];
    let nbv = cost;
    let cur = startDate;
    const end = deprnToDate.startOf('month');

    while (cur.isBefore(end) || cur.isSame(end, 'month')) {
      const depr = Math.min(dailyRate * cur.daysInMonth(), nbv - salvage);
      if (depr <= 0) { cur = cur.add(1, 'month'); continue; }
      rows.push({ period: cur.format('MMM-YY'), days: cur.daysInMonth(), dailyRate, openingNbv: nbv, depreciation: depr, closingNbv: nbv - depr });
      nbv -= depr;
      cur = cur.add(1, 'month');
    }
    setDeprnRows(rows);
  };

  const exportPreviewToExcel = () => {
    if (!deprnRows.length) return;
    const num = (n: number) => Number(n.toFixed(2));
    const data: Record<string, string | number>[] = deprnRows.map(r => ({
      'Period':       r.period,
      'Days':         r.days,
      'Daily Rate':   num(r.dailyRate),
      'Opening NBV':  num(r.openingNbv),
      'Depreciation': num(r.depreciation),
      'Closing NBV':  num(r.closingNbv),
      'Status':       isPosted(r.period) ? 'Posted' : '',
    }));
    data.push({
      'Period':       `Total (${deprnRows.length} months)`,
      'Days':         deprnRows.reduce((s, r) => s + r.days, 0),
      'Daily Rate':   '',
      'Opening NBV':  '',
      'Depreciation': num(deprnRows.reduce((s, r) => s + r.depreciation, 0)),
      'Closing NBV':  num(deprnRows[deprnRows.length - 1].closingNbv),
      'Status':       '',
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Deprn Preview');
    XLSX.writeFile(wb, `deprn_preview_asset${asset.assetId}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Derived unique option lists for filter dropdowns
  const fyOptions     = Array.from(new Set(deprn.map(r => r.fiscalYear).filter(Boolean))).sort((a, b) => b.localeCompare(a));
  const periodOptions = Array.from(new Set(deprn.map(r => r.periodName).filter(Boolean))).sort((a, b) => b.localeCompare(a));

  const filteredDeprn = deprn
    .filter(r =>
      (!deprnFY     || r.fiscalYear  === deprnFY) &&
      (!deprnPeriod || r.periodName  === deprnPeriod)
    )
    .sort((a, b) => {
      const fyDiff = (a.fiscalYear || '').localeCompare(b.fiscalYear || '');
      if (fyDiff !== 0) return fyDiff;
      return (Number(a.periodNum) || 0) - (Number(b.periodNum) || 0);
    });

  const exportDeprnToExcel = () => {
    const data = filteredDeprn.map(r => ({
      'FY':                         r.fiscalYear,
      'Period Num':                 r.periodNum,
      'Period':                     r.periodName,
      'Total Amount':               parseFloat(r.totalDeprnAmount) || 0,
      'Depreciation Amount':        parseFloat(r.deprnAmount) || 0,
      'Deprn Adjustment':           parseFloat(r.deprnAdjustmentAmount) || 0,
      'Bonus Deprn Amount':         parseFloat(r.bonusDeprnAmount) || 0,
      'Bonus Deprn Adjustment':     parseFloat(r.bonusDeprnAdjustmentAmount) || 0,
      'YTD Deprn':                  parseFloat(r.ytdDeprn) || 0,
      'Deprn Reserve':              parseFloat(r.deprnReserve) || 0,
      'Cost':                       parseFloat(r.cost) || 0,
      'NBV':                        parseFloat(r.nbv) || 0,
      'Reval Reserve':              parseFloat(r.revalReserve) || 0,
      'Impairment Amount':          parseFloat(r.impairmentAmount) || 0,
      'Backlog Deprn Reserve':      parseFloat(r.backlogDeprnReserve) || 0,
      'Distribution ID':            r.distributionId,
      'Source Code':                r.deprnSourceCode,
      'Run Date':                   r.deprnRunDate,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Depreciation');
    XLSX.writeFile(wb, `deprn_asset${asset.assetId}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // Create Accounting state
  const [acctPreviewVisible, setAcctPreviewVisible] = useState(false);
  const [acctPreview,        setAcctPreview]        = useState<AccountingPreview | null>(null);
  const [acctSlaExists,      setAcctSlaExists]      = useState<SlaExistsResult | null>(tab.additionSlaStatus);
  // Sync when parent tab finishes loading the SLA status
  useEffect(() => { setAcctSlaExists(tab.additionSlaStatus); }, [tab.additionSlaStatus]);
  const [acctExistingJournal,setAcctExistingJournal]= useState<any>(null);
  const [acctPreviewLoading, setAcctPreviewLoading] = useState(false);
  const [creatingAccounting, setCreatingAccounting] = useState(false);
  const [viewGlLines,        setViewGlLines]        = useState<JournalLine[]>([]);
  const [viewGlLoading,      setViewGlLoading]      = useState(false);

  type StepStatus = 'wait' | 'process' | 'finish' | 'error';
  interface AcctStep { label: string; detail: string; status: StepStatus; result?: string; error?: string; }
  const ACCT_STEPS_INIT: AcctStep[] = [
    { label: 'Create SLA Accounting',              detail: 'POST sla/accounting/create',          status: 'wait' },
    { label: 'Create & Post GL Journal',           detail: 'POST journals/create → PUT gl/journals/{id}/post → POST sla/accounting/post', status: 'wait' },
    { label: 'Mark Addition as Accounted',         detail: 'POST fa/accounting/mark-accounted',   status: 'wait' },
  ];
  const [acctSteps, setAcctSteps] = useState<AcctStep[]>(ACCT_STEPS_INIT);
  const [acctStepsVisible, setAcctStepsVisible] = useState(false);
  const [acctDebugVisible, setAcctDebugVisible] = useState(false);

  // Debug panel: per-step { response, loading }
  interface DbgStep { method: string; url: string; body: object | null; response: any; loading: boolean; }
  const [dbgSteps, setDbgSteps] = useState<DbgStep[]>([]);
  // Carry IDs between debug steps
  const [dbgSlaHeaderId, setDbgSlaHeaderId] = useState<number | null>(null);
  const [dbgGlBatchId,   setDbgGlBatchId]   = useState<number | null>(null);
  const [dbgGlHeaderId,  setDbgGlHeaderId]  = useState<number | null>(null);

  const updateStep = (index: number, status: StepStatus, resultOrError?: string) =>
    setAcctSteps(prev => prev.map((s, i) => i === index
      ? { ...s, status, result: status === 'finish' ? resultOrError : undefined, error: status === 'error' ? resultOrError : undefined }
      : s));

  // Build debug steps from current preview data
  const buildDbgSteps = (h: any, lines: any[]): DbgStep[] => {
    const base = APEX_DB_CONFIG.baseUrl;
    const slaId  = dbgSlaHeaderId;
    const batchId = dbgGlBatchId;
    const glId   = dbgGlHeaderId;
    return [
      {
        method: 'POST', url: `${base}/sla/accounting/create`,
        body: {
          header: { moduleName: h.moduleName, sourceTable: h.sourceTable, sourceId: h.sourceId,
            sourceNumber: h.sourceNumber, sourceType: h.sourceType, eventTypeCode: h.eventTypeCode,
            eventDate: h.eventDate, accountingDate: h.accountingDate, periodName: h.periodName,
            ledgerId: h.ledgerId, ledgerName: h.ledgerName, currencyCode: h.currencyCode,
            ledgerCurrency: h.ledgerCurrency, description: h.description, createdBy: loggedUser },
          lines: lines.map(l => ({ lineNumber: l.lineNumber, lineType: l.lineType,
            accountingClass: l.accountingClass, accountCombo: l.accountCombination,
            enteredDr: l.enteredDr, enteredCr: l.enteredCr, accountedDr: l.accountedDr,
            accountedCr: l.accountedCr, currencyCode: h.currencyCode, description: l.description,
            sourceLineId: h.sourceId, sourceLineNum: l.lineNumber })),
        },
        response: null, loading: false,
      },
      {
        method: 'POST', url: `${base}/journals/create`,
        body: slaId ? {
          batch: { batchName: `FA-ADDITION-${h.sourceNumber}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}`,
            batchDescription: `FA Addition — ${h.sourceNumber}`, ledgerName: h.ledgerName,
            ledgerId: h.ledgerId, status: 'NEW', accountingPeriod: h.periodName,
            controlTotal: h.cost, runningTotalDr: h.cost, runningTotalCr: h.cost,
            batchSource: 'Fixed Assets', createdBy: loggedUser },
          header: { ledgerId: h.ledgerId, ledgerName: h.ledgerName, jeCategory: 'Assets',
            jeSource: 'Fixed Assets', periodName: h.periodName,
            journalName: `FA Addition — ${h.sourceNumber}`, description: h.description,
            currencyCode: h.currencyCode, currencyConversionType: 'User',
            currencyConversionDate: h.accountingDate, currencyConversionRate: 1,
            defaultEffectiveDate: h.accountingDate, status: 'NEW',
            runningTotalDr: h.cost, runningTotalCr: h.cost, createdBy: loggedUser },
          lines: lines.map(l => ({ enteredDr: l.enteredDr || null, enteredCr: l.enteredCr || null,
            accountedDr: l.accountedDr || null, accountedCr: l.accountedCr || null,
            description: l.description, currencyCode: h.currencyCode,
            currencyConversionDate: h.accountingDate, currencyConversionRate: 1,
            userCurrencyConversionType: 'User', accountCombination: l.accountCombination,
            reference1: l.reference1, reference2: l.reference2, reference5: l.reference5,
            reconciledFlag: 'N', createdBy: loggedUser })),
        } : '⚠ Run Step 1 first to get slaHeaderId',
        response: null, loading: false,
      },
      {
        method: 'PUT', url: batchId ? `${base}/gl/journals/${batchId}/post` : `${base}/gl/journals/{batchId}/post`,
        body: null, response: null, loading: false,
      },
      {
        method: 'POST', url: `${base}/sla/accounting/post`,
        body: (slaId && batchId) ? { headerId: slaId, glBatchId: batchId,
          glBatchName: `FA-ADDITION-${h.sourceNumber}`, glHeaderId: glId, postedBy: loggedUser }
          : '⚠ Run Steps 1 & 2 first',
        response: null, loading: false,
      },
      {
        method: 'POST', url: `${base}/fa/accounting/mark-accounted`,
        body: { assetId: h.sourceId, slaHeaderId: slaId, glHeaderId: glId, createdBy: loggedUser },
        response: null, loading: false,
      },
    ];
  };

  const runDbgStep = async (idx: number) => {
    if (!acctPreview) return;
    const h = acctPreview.header;
    const steps = buildDbgSteps(h, acctPreview.lines);
    const step = steps[idx];

    setDbgSteps(prev => { const n = [...prev]; n[idx] = { ...n[idx], loading: true, response: null }; return n; });
    try {
      const fetchOpts: RequestInit = { method: step.method, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } };
      if (step.body && typeof step.body === 'object') fetchOpts.body = JSON.stringify(step.body);
      const res = await fetch(step.url, fetchOpts);
      const data = await res.json();
      setDbgSteps(prev => { const n = [...prev]; n[idx] = { ...n[idx], loading: false, response: data }; return n; });
      // Capture IDs for downstream steps
      if (idx === 0 && data.headerId) setDbgSlaHeaderId(data.headerId);
      if (idx === 1 && data.jeBatchId) { setDbgGlBatchId(data.jeBatchId); setDbgGlHeaderId(data.jeHeaderId); }
    } catch (e: any) {
      setDbgSteps(prev => { const n = [...prev]; n[idx] = { ...n[idx], loading: false, response: { error: e.message } }; return n; });
    }
  };

  const openAccountingPreview = async () => {
    const book = asset.bookTypeCode || books[0]?.bookTypeCode || '';
    if (!book) { message.error('No book found for this asset'); return; }
    setAcctPreviewLoading(true);
    setAcctPreviewVisible(true);
    setAcctPreview(null);
    setAcctSlaExists(null);
    setAcctExistingJournal(null);
    setAcctSteps(ACCT_STEPS_INIT);
    setAcctStepsVisible(false);
    setAcctDebugVisible(false);
    setDbgSteps([]);
    setDbgSlaHeaderId(null);
    setDbgGlBatchId(null);
    setDbgGlHeaderId(null);
    setViewGlLines([]);
    try {
      // Parallel: preview data + SLA exists check
      const [preview, slaExists] = await Promise.all([
        getAdditionsAccountingPreview(asset.assetId, book),
        checkSlaAccountingExists('RR_FA_ADDITIONS', asset.assetId, 'FA_ADDITION'),
      ]);
      setAcctPreview(preview);
      setAcctSlaExists(slaExists);
      // If accounting already exists, load SLA record + actual GL lines by reference2=assetId
      if (slaExists.exists && slaExists.headerId) {
        const existing = await getSlaAccounting('RR_FA_ADDITIONS', asset.assetId);
        setAcctExistingJournal(existing);
        // Fetch actual GL lines via GET /gl/journals/lines?reference2={assetId}
        setViewGlLoading(true);
        fetch(`${APEX_DB_CONFIG.baseUrl}/gl/journals/lines?reference2=${encodeURIComponent(asset.assetId)}`, {
          headers: { Accept: 'application/json' },
        })
          .then(r => r.json())
          .then(data => setViewGlLines(Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : [])))
          .catch(() => setViewGlLines([]))
          .finally(() => setViewGlLoading(false));
      }
    } catch {
      message.error('Failed to load accounting preview');
    } finally {
      setAcctPreviewLoading(false);
    }
  };

  const handleCreateAccounting = async () => {
    if (!acctPreview) return;
    const book = asset.bookTypeCode || books[0]?.bookTypeCode || '';
    setCreatingAccounting(true);
    setAcctSteps(ACCT_STEPS_INIT);
    setAcctStepsVisible(true);
    try {
      const h = acctPreview.header;
      const now = new Date().toISOString().slice(0, 10);

      // Step 0: Create SLA accounting
      updateStep(0, 'process');
      const slaRes = await createSlaAccounting({
        header: {
          moduleName:      h.moduleName,
          sourceTable:     h.sourceTable,
          sourceId:        h.sourceId,
          sourceNumber:    h.sourceNumber,
          sourceType:      h.sourceType,
          eventTypeCode:   h.eventTypeCode,
          eventDate:       h.eventDate,
          accountingDate:  h.accountingDate,
          periodName:      h.periodName,
          ledgerId:        h.ledgerId,
          ledgerName:      h.ledgerName,
          currencyCode:    h.currencyCode,
          ledgerCurrency:  h.ledgerCurrency,
          description:     h.description,
          createdBy:       loggedUser,
        },
        lines: acctPreview.lines.map(l => ({
          lineNumber:      l.lineNumber,
          lineType:        l.lineType,
          accountingClass: l.accountingClass,
          accountCombo:    l.accountCombination,
          enteredDr:       l.enteredDr,
          enteredCr:       l.enteredCr,
          accountedDr:     l.accountedDr,
          accountedCr:     l.accountedCr,
          currencyCode:    h.currencyCode,
          description:     l.description,
          sourceLineId:    h.sourceId,
          sourceLineNum:   l.lineNumber,
        })),
      });
      if (!slaRes.headerId) {
        const errMsg = slaRes.error || slaRes.message || 'Failed to create SLA accounting';
        updateStep(0, 'error', errMsg);
        message.error(errMsg);
        return;
      }
      updateStep(0, 'finish', `SLA Header ID: ${slaRes.headerId}`);
      const slaHeaderId = slaRes.headerId;

      // Step 1: Create GL batch+header+lines in one call, then post journal, then stamp SLA
      updateStep(1, 'process');
      const glRes = await postSlaToGL({
        slaHeaderId,
        sourceNumber:   String(h.sourceNumber || h.assetNumber),
        sourceId:       h.sourceId,
        eventTypeCode:  h.eventTypeCode,
        periodName:     h.periodName,
        ledgerName:     h.ledgerName,
        ledgerId:       h.ledgerId,
        currency:       h.currencyCode,
        accountingDate: h.accountingDate,
        legalEntity:    '',
        businessUnit:   '',
        jeCategory:     'Assets',
        jeSource:       'Fixed Assets',
        batchSource:    'Fixed Assets',
        journalName:    `FA Addition — ${h.sourceNumber || h.assetNumber}`,
        journalDescription: h.description,
        createdBy:      loggedUser,
        lines: acctPreview.lines.map(l => ({
          lineType:           l.lineType,
          enteredDr:          l.enteredDr || null,
          enteredCr:          l.enteredCr || null,
          accountedDr:        l.accountedDr || null,
          accountedCr:        l.accountedCr || null,
          description:        l.description,
          currencyCode:       h.currencyCode,
          accountingDate:     h.accountingDate,
          accountCombination: l.accountCombination,
          accountingClass:    l.accountingClass,
          legalEntity:        null,
        })),
      });
      if (!glRes.success) {
        updateStep(1, 'error', glRes.error || 'Failed to create/post GL journal');
        message.error(glRes.error || 'Failed to create GL journal');
        return;
      }
      updateStep(1, 'finish', `GL Batch: ${glRes.batchId} | Header: ${glRes.headerId}`);

      // Step 2: Mark FA addition as ACCOUNTED
      updateStep(2, 'process');
      const markRes = await markFaAdditionAccounted({
        assetId:      asset.assetId,
        slaHeaderId:  slaHeaderId,
        glHeaderId:   glRes.headerId ?? slaHeaderId,
        createdBy:    loggedUser,
      });
      if (markRes?.success === false) {
        updateStep(2, 'error', markRes.error || 'Failed to mark as accounted');
        message.error(markRes.error || 'Failed to mark addition as accounted');
        return;
      }
      updateStep(2, 'finish', 'Addition marked as ACCOUNTED');

      message.success('Accounting created and posted to GL successfully');

      // Refresh preview to show new status
      const [updatedPreview, updatedExists] = await Promise.all([
        getAdditionsAccountingPreview(asset.assetId, book),
        checkSlaAccountingExists('RR_FA_ADDITIONS', asset.assetId, 'FA_ADDITION'),
      ]);
      setAcctPreview(updatedPreview);
      setAcctSlaExists(updatedExists);
      // Propagate status back to parent so the Financial tab button updates
      onSlaStatusChange(`asset-${asset.assetId}`, updatedExists);
      if (updatedExists.exists) {
        const existing = await getSlaAccounting('RR_FA_ADDITIONS', asset.assetId);
        setAcctExistingJournal(existing);
        setViewGlLoading(true);
        fetch(`${APEX_DB_CONFIG.baseUrl}/gl/journals/lines?reference2=${encodeURIComponent(asset.assetId)}`, {
          headers: { Accept: 'application/json' },
        })
          .then(r => r.json())
          .then(data => setViewGlLines(Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : [])))
          .catch(() => setViewGlLines([]))
          .finally(() => setViewGlLoading(false));
      }
    } catch (err: any) {
      message.error(err.message || 'Accounting creation failed');
    } finally {
      setCreatingAccounting(false);
    }
  };

  // ── Depreciation Accounting state ────────────────────────────────────────────
  const [deprnAcctVisible,   setDeprnAcctVisible]   = useState(false);
  const [deprnAcctRecord,    setDeprnAcctRecord]     = useState<DeprnRecord | null>(null);
  const [deprnAcctPreview,   setDeprnAcctPreview]    = useState<AccountingPreview | null>(null);
  const [deprnAcctLoading,   setDeprnAcctLoading]    = useState(false);
  const [deprnAcctCreating,  setDeprnAcctCreating]   = useState(false);
  const [deprnAcctSteps,     setDeprnAcctSteps]      = useState<AcctStep[]>([]);
  const [deprnAcctStepsVis,  setDeprnAcctStepsVis]   = useState(false);
  const [deprnSlaExists,     setDeprnSlaExists]      = useState<SlaExistsResult | null>(null);
  const [deprnGlLines,       setDeprnGlLines]        = useState<any[]>([]);
  const [deprnGlLoading,     setDeprnGlLoading]      = useState(false);
  const [deprnDebugVisible,  setDeprnDebugVisible]   = useState(false);
  const [deprnDbgSteps,      setDeprnDbgSteps]       = useState<DbgStep[]>([]);
  const [deprnDbgSlaId,      setDeprnDbgSlaId]       = useState<number | null>(null);
  const [deprnDbgBatchId,    setDeprnDbgBatchId]     = useState<number | null>(null);
  const [deprnDbgGlId,       setDeprnDbgGlId]        = useState<number | null>(null);

  const buildDeprnDbgSteps = (h: any, lines: any[]): DbgStep[] => {
    const base    = APEX_DB_CONFIG.baseUrl;
    const slaId   = deprnDbgSlaId;
    const batchId = deprnDbgBatchId;
    const glId    = deprnDbgGlId;
    const amount  = h.totalAmount || h.deprnAmount || 0;
    return [
      {
        method: 'POST', url: `${base}/sla/accounting/create`,
        body: {
          header: { moduleName: h.moduleName, sourceTable: h.sourceTable, sourceId: h.sourceId,
            sourceNumber: h.sourceNumber, sourceType: h.sourceType, eventTypeCode: h.eventTypeCode,
            eventDate: h.eventDate, accountingDate: h.accountingDate, periodName: h.periodName,
            ledgerId: h.ledgerId, ledgerName: h.ledgerName, currencyCode: h.currencyCode,
            ledgerCurrency: h.ledgerCurrency, description: h.description, createdBy: loggedUser },
          lines: lines.map(l => ({ lineNumber: l.lineNumber, lineType: l.lineType,
            accountingClass: l.accountingClass, accountCombo: l.accountCombination,
            enteredDr: l.enteredDr, enteredCr: l.enteredCr,
            accountedDr: l.accountedDr, accountedCr: l.accountedCr,
            currencyCode: h.currencyCode, description: l.description,
            sourceLineId: h.sourceId, sourceLineNum: l.lineNumber })),
        },
        response: null, loading: false,
      },
      {
        method: 'POST', url: `${base}/journals/create`,
        body: slaId ? {
          batch: { batchName: `FA-DEPRN-${h.sourceNumber}-${h.periodName}`,
            batchDescription: `FA Depreciation — ${h.sourceNumber} ${h.periodName}`,
            ledgerName: h.ledgerName, ledgerId: h.ledgerId, status: 'NEW',
            accountingPeriod: h.periodName,
            controlTotal: amount, runningTotalDr: amount, runningTotalCr: amount,
            batchSource: 'Fixed Assets', createdBy: loggedUser },
          header: { ledgerId: h.ledgerId, ledgerName: h.ledgerName,
            jeCategory: 'Depreciation', jeSource: 'Fixed Assets',
            periodName: h.periodName,
            journalName: `FA Depreciation — ${h.sourceNumber} ${h.periodName}`,
            description: h.description, currencyCode: h.currencyCode,
            currencyConversionType: 'User', currencyConversionDate: h.accountingDate,
            currencyConversionRate: 1, defaultEffectiveDate: h.accountingDate, status: 'NEW',
            runningTotalDr: amount, runningTotalCr: amount, createdBy: loggedUser },
          lines: lines.map(l => ({ enteredDr: l.enteredDr || null, enteredCr: l.enteredCr || null,
            accountedDr: l.accountedDr || null, accountedCr: l.accountedCr || null,
            description: l.description, currencyCode: h.currencyCode,
            currencyConversionDate: h.accountingDate, currencyConversionRate: 1,
            userCurrencyConversionType: 'User', accountCombination: l.accountCombination,
            reference1: l.reference1, reference2: l.reference2, reference5: l.reference5,
            reconciledFlag: 'N', createdBy: loggedUser })),
        } : '⚠ Run Step 1 first to get slaHeaderId',
        response: null, loading: false,
      },
      {
        method: 'PUT', url: batchId ? `${base}/gl/journals/${batchId}/post` : `${base}/gl/journals/{batchId}/post`,
        body: null, response: null, loading: false,
      },
      {
        method: 'POST', url: `${base}/sla/accounting/post`,
        body: (slaId && batchId) ? { headerId: slaId, glBatchId: batchId,
          glBatchName: `FA-DEPRN-${h.sourceNumber}-${h.periodName}`, glHeaderId: glId, postedBy: loggedUser }
          : '⚠ Run Steps 1 & 2 first',
        response: null, loading: false,
      },
      {
        method: 'POST', url: `${base}/fa/accounting/mark-deprn-accounted`,
        body: { assetId: h.sourceId, bookTypeCode: h.bookTypeCode,
          distributionId: (h as any).distributionId || null,
          periodName: h.periodName,
          slaHeaderId: slaId, glHeaderId: glId, createdBy: loggedUser },
        response: null, loading: false,
      },
    ];
  };

  const runDeprnDbgStep = async (idx: number) => {
    if (!deprnAcctPreview) return;
    const h     = deprnAcctPreview.header;
    const steps = buildDeprnDbgSteps(h, deprnAcctPreview.lines);
    const step  = steps[idx];
    setDeprnDbgSteps(prev => { const n = [...prev]; n[idx] = { ...n[idx], loading: true, response: null }; return n; });
    try {
      const opts: RequestInit = { method: step.method, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } };
      if (step.body && typeof step.body === 'object') opts.body = JSON.stringify(step.body);
      const res  = await fetch(step.url, opts);
      const data = await res.json();
      setDeprnDbgSteps(prev => { const n = [...prev]; n[idx] = { ...n[idx], loading: false, response: data }; return n; });
      if (idx === 0 && data.headerId) setDeprnDbgSlaId(data.headerId);
      if (idx === 1 && data.jeBatchId) { setDeprnDbgBatchId(data.jeBatchId); setDeprnDbgGlId(data.jeHeaderId); }
    } catch (e: any) {
      setDeprnDbgSteps(prev => { const n = [...prev]; n[idx] = { ...n[idx], loading: false, response: { error: e.message } }; return n; });
    }
  };

  const DEPRN_ACCT_STEPS_INIT: AcctStep[] = [
    { label: 'Create SLA Accounting',    detail: 'POST sla/accounting/create',            status: 'wait' },
    { label: 'Create & Post GL Journal', detail: 'POST journals/create → PUT post',       status: 'wait' },
    { label: 'Mark Period as Accounted', detail: 'POST fa/accounting/mark-deprn-accounted', status: 'wait' },
  ];

  const updateDeprnStep = (index: number, status: StepStatus, resultOrError?: string) =>
    setDeprnAcctSteps(prev => prev.map((s, i) => i === index
      ? { ...s, status, result: status === 'finish' ? resultOrError : undefined, error: status === 'error' ? resultOrError : undefined }
      : s));

  const openDeprnAccounting = async (record: DeprnRecord) => {
    const book = record.bookTypeCode || asset.bookTypeCode || books[0]?.bookTypeCode || '';
    setDeprnAcctRecord(record);
    setDeprnAcctPreview(null);
    setDeprnAcctLoading(true);
    setDeprnAcctVisible(true);
    setDeprnAcctSteps(DEPRN_ACCT_STEPS_INIT);
    setDeprnAcctStepsVis(false);
    setDeprnDebugVisible(false);
    setDeprnDbgSteps([]);
    setDeprnDbgSlaId(null);
    setDeprnDbgBatchId(null);
    setDeprnDbgGlId(null);
    setDeprnGlLines([]);
    setDeprnSlaExists(null);
    try {
      const preview = await getDeprnAccountingPreview(asset.assetId, book, record.periodName, record.distributionId);
      setDeprnAcctPreview(preview);

      // Check if SLA already exists for this distribution (sourceId = distributionId)
      const distId = record.distributionId || preview.header?.distributionId;
      const [slaExists] = await Promise.all([
        distId
          ? checkSlaAccountingExists('RR_FA_DEPRN_DETAIL', String(distId), 'FA_DEPRECIATION')
          : Promise.resolve(null),
      ]);
      setDeprnSlaExists(slaExists);

      // Load GL lines based on reference2=distributionId, reference5=FA_DEPRECIATION
      const deprnRef2 = distId || preview.header?.periodCounter || record.periodCounter;
      if (deprnRef2) {
        setDeprnGlLoading(true);
        fetch(`${APEX_DB_CONFIG.baseUrl}/gl/journals/lines?reference2=${encodeURIComponent(String(deprnRef2))}&reference5=FA_DEPRECIATION`, {
          headers: { Accept: 'application/json' },
        })
          .then(r => r.json())
          .then(d => setDeprnGlLines(Array.isArray(d?.items) ? d.items : (Array.isArray(d) ? d : [])))
          .catch(() => setDeprnGlLines([]))
          .finally(() => setDeprnGlLoading(false));
      }
    } catch {
      message.error('Failed to load depreciation accounting preview');
    } finally {
      setDeprnAcctLoading(false);
    }
  };

  const handleCreateDeprnAccounting = async () => {
    if (!deprnAcctPreview || !deprnAcctRecord) return;

    // Block if already POSTED — user must reverse first
    if (deprnSlaExists?.exists && deprnSlaExists.accountingStatus === 'POSTED') {
      message.warning(`Depreciation ${deprnAcctRecord.periodName} is already accounted (SLA #${deprnSlaExists.headerId}). Reverse the existing entry first.`);
      return;
    }

    const book = deprnAcctRecord.bookTypeCode || asset.bookTypeCode || books[0]?.bookTypeCode || '';
    setDeprnAcctCreating(true);
    setDeprnAcctSteps(DEPRN_ACCT_STEPS_INIT);
    setDeprnAcctStepsVis(true);
    try {
      const h = deprnAcctPreview.header;

      // Step 0: Create SLA
      updateDeprnStep(0, 'process');
      const slaRes = await createSlaAccounting({
        header: {
          moduleName: h.moduleName, sourceTable: h.sourceTable, sourceId: h.sourceId,
          sourceNumber: h.sourceNumber, sourceType: h.sourceType, eventTypeCode: h.eventTypeCode,
          eventDate: h.eventDate, accountingDate: h.accountingDate, periodName: h.periodName,
          ledgerId: h.ledgerId, ledgerName: h.ledgerName, currencyCode: h.currencyCode,
          ledgerCurrency: h.ledgerCurrency, description: h.description, createdBy: loggedUser,
        },
        lines: deprnAcctPreview.lines.map(l => ({
          lineNumber: l.lineNumber, lineType: l.lineType, accountingClass: l.accountingClass,
          accountCombo: l.accountCombination, enteredDr: l.enteredDr, enteredCr: l.enteredCr,
          accountedDr: l.accountedDr, accountedCr: l.accountedCr, currencyCode: h.currencyCode,
          description: l.description, sourceLineId: h.sourceId, sourceLineNum: l.lineNumber,
        })),
      });
      if (!slaRes.headerId) {
        const err = slaRes.error || slaRes.message || 'Failed to create SLA accounting';
        updateDeprnStep(0, 'error', err); message.error(err); return;
      }
      updateDeprnStep(0, 'finish', `SLA Header ID: ${slaRes.headerId}`);
      const slaHeaderId = slaRes.headerId;

      // Step 1: Create + post GL journal
      updateDeprnStep(1, 'process');
      const glRes = await postSlaToGL({
        slaHeaderId,
        sourceNumber:   String(h.sourceNumber || h.assetNumber),
        sourceId:       h.sourceId,
        eventTypeCode:  h.eventTypeCode,
        periodName:     h.periodName,
        ledgerName:     h.ledgerName,
        ledgerId:       h.ledgerId,
        currency:       h.currencyCode,
        accountingDate: h.accountingDate,
        legalEntity: '', businessUnit: '',
        jeCategory:    'Depreciation',
        jeSource:      'Fixed Assets',
        batchSource:   'Fixed Assets',
        journalName:   `FA Depreciation — ${h.sourceNumber || h.assetNumber} — ${h.periodName}`,
        journalDescription: h.description,
        createdBy: loggedUser,
        lines: deprnAcctPreview.lines.map(l => ({
          lineType: l.lineType, enteredDr: l.enteredDr || null, enteredCr: l.enteredCr || null,
          accountedDr: l.accountedDr || null, accountedCr: l.accountedCr || null,
          description: l.description, currencyCode: h.currencyCode, accountingDate: h.accountingDate,
          accountCombination: l.accountCombination, accountingClass: l.accountingClass, legalEntity: null,
        })),
      });
      if (!glRes.success) {
        const err = glRes.error || 'Failed to create/post GL journal';
        updateDeprnStep(1, 'error', err); message.error(err); return;
      }
      updateDeprnStep(1, 'finish', `GL Batch: ${glRes.batchId} | Header: ${glRes.headerId}`);

      // Step 2: Mark deprn period as ACCOUNTED
      updateDeprnStep(2, 'process');
      const markRes = await markFaDeprnAccounted({
        assetId:        asset.assetId,
        bookTypeCode:   book,
        distributionId: deprnAcctRecord.distributionId || null,
        periodName:     deprnAcctRecord.periodName,
        slaHeaderId,
        glHeaderId:     glRes.headerId ?? slaHeaderId,
        createdBy:      loggedUser,
      });
      if (markRes?.success === false) {
        const err = markRes.error || 'Failed to mark as accounted';
        updateDeprnStep(2, 'error', err); message.error(err); return;
      }
      updateDeprnStep(2, 'finish', `${markRes.rowsUpdated || 1} row(s) updated`);
      message.success(`Depreciation ${deprnAcctRecord.periodName} accounted and posted to GL`);

      // Reload preview + SLA exists check
      const distId = deprnAcctRecord.distributionId;
      const [updatedPreview, updatedSlaExists] = await Promise.all([
        getDeprnAccountingPreview(asset.assetId, book, deprnAcctRecord.periodName, distId),
        distId ? checkSlaAccountingExists('RR_FA_DEPRN_DETAIL', String(distId), 'FA_DEPRECIATION') : Promise.resolve(null),
      ]);
      setDeprnAcctPreview(updatedPreview);
      setDeprnSlaExists(updatedSlaExists);
      const deprnRef2 = distId || updatedPreview.header?.periodCounter || deprnAcctRecord.periodCounter;
      setDeprnGlLoading(true);
      fetch(`${APEX_DB_CONFIG.baseUrl}/gl/journals/lines?reference2=${encodeURIComponent(String(deprnRef2))}&reference5=FA_DEPRECIATION`, {
        headers: { Accept: 'application/json' },
      })
        .then(r => r.json())
        .then(d => setDeprnGlLines(Array.isArray(d?.items) ? d.items : (Array.isArray(d) ? d : [])))
        .catch(() => setDeprnGlLines([]))
        .finally(() => setDeprnGlLoading(false));

      // Update the deprn row status in the parent tab
      setOpenAssetTabs((prev: OpenAssetTab[]) => prev.map((t: OpenAssetTab) => t.key === `asset-${asset.assetId}`
        ? { ...t, deprn: t.deprn.map(r => r.periodName === deprnAcctRecord.periodName ? { ...r, accountedStatus: 'ACCOUNTED', accountedDate: new Date().toISOString().slice(0,10) } : r) }
        : t));

    } catch (err: any) {
      message.error(err.message || 'Depreciation accounting failed');
    } finally {
      setDeprnAcctCreating(false);
    }
  };

  const [deletingPeriod, setDeletingPeriod] = useState<string | null>(null);

  const handleDeleteDeprn = async (record: DeprnRecord) => {
    const book = books[0]?.bookTypeCode || '';
    if (!book) { message.error('No book found for this asset'); return; }
    setDeletingPeriod(record.periodName);
    try {
      const res = await deleteAssetDeprn({
        assetId: asset.assetId,
        bookTypeCode: book,
        periodName: record.periodName,
      });
      if (res.success) {
        message.success(`Depreciation deleted for period ${record.periodName}`);
      } else if (res.status === 'PERIOD_CLOSED') {
        message.error(`Period ${record.periodName} is closed and cannot be deleted`);
      } else {
        message.error(res.error || 'Delete failed');
      }
    } finally {
      setDeletingPeriod(null);
    }
  };

  const deprnColumns: ColumnsType<DeprnRecord> = [
    { title: 'FY',          dataIndex: 'fiscalYear',               key: 'fiscalYear',  width: 60  },
    { title: 'Period Num',  dataIndex: 'periodNum',                key: 'periodNum',   width: 80  },
    { title: 'Period',      dataIndex: 'periodName',               key: 'periodName',  width: 110 },
    { title: 'Total Amount',            dataIndex: 'totalDeprnAmount',           key: 'totalAmt',  align: 'right' as const, render: (v) => formatCurrency(v) },
    { title: 'Depreciation Amount',     dataIndex: 'deprnAmount',                key: 'deprnAmt',  align: 'right' as const, render: (v) => formatCurrency(v) },
    { title: 'Deprn Adjustment',        dataIndex: 'deprnAdjustmentAmount',      key: 'deprnAdj',  align: 'right' as const, render: (v) => formatCurrency(v) },
    { title: 'Bonus Deprn Amount',      dataIndex: 'bonusDeprnAmount',           key: 'bonusAmt',  align: 'right' as const, render: (v) => formatCurrency(v) },
    { title: 'Bonus Deprn Adjustment',  dataIndex: 'bonusDeprnAdjustmentAmount', key: 'bonusAdj',  align: 'right' as const, render: (v) => formatCurrency(v) },
    { title: 'YTD Deprn',               dataIndex: 'ytdDeprn',                   key: 'ytdDeprn',  align: 'right' as const, render: (v) => formatCurrency(v) },
    { title: 'Deprn Reserve',           dataIndex: 'deprnReserve',               key: 'reserve',   align: 'right' as const, render: (v) => formatCurrency(v) },
    {
      title: 'Acctd Status',
      dataIndex: 'accountedStatus',
      key: 'accountedStatus',
      width: 110,
      render: (v: string) => v
        ? <Tag color={v === 'ACCOUNTED' ? 'success' : 'default'} style={{ borderRadius: 4, fontSize: 10 }}>{v}</Tag>
        : <Tag color="default" style={{ borderRadius: 4, fontSize: 10 }}>UNACCOUNTED</Tag>,
    },
    {
      title: 'Acctd Date',
      dataIndex: 'accountedDate',
      key: 'accountedDate',
      width: 100,
      render: (v: string) => v ? fmtDate(v) : '—',
    },
    {
      title: '',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: DeprnRecord) => (
        <Space size={4}>
          <Tooltip title={record.accountedStatus === 'ACCOUNTED' ? 'View Accounting' : 'Create Accounting'}>
            <Button
              size="small"
              icon={record.accountedStatus === 'ACCOUNTED' ? <CheckOutlined /> : <AccountBookOutlined />}
              style={{
                color: record.accountedStatus === 'ACCOUNTED' ? REDWOOD.success : '#0572CE',
                borderColor: record.accountedStatus === 'ACCOUNTED' ? REDWOOD.success : '#0572CE',
              }}
              onClick={() => openDeprnAccounting(record)}
            />
          </Tooltip>
          <Popconfirm
            title={`Delete depreciation for ${record.periodName}?`}
            description="This cannot be undone if the period has been transferred to GL."
            onConfirm={() => handleDeleteDeprn(record)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={deletingPeriod === record.periodName}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const distColumns: ColumnsType<DistributionRecord> = [
    { title: 'ID',        dataIndex: 'distributionId',   key: 'distributionId',  width: 80  },
    { title: 'Book',      dataIndex: 'bookTypeCode',     key: 'bookTypeCode',    ellipsis: true },
    { title: 'Units',     dataIndex: 'unitsAssigned',    key: 'unitsAssigned',   width: 70  },
    { title: 'Location',  key: 'location',
      render: (_: any, r: DistributionRecord) =>
        [r.locationSeg1, r.locationSeg2, r.locationSeg3].filter(Boolean).join(' / ') || '—' },
    { title: 'Effective', dataIndex: 'dateEffective',    key: 'dateEffective',   width: 110, render: fmtDate },
    { title: 'End Date',  dataIndex: 'dateIneffective',  key: 'dateIneffective', width: 110,
      render: (v) => v ? fmtDate(v) : '—' },
  ];

  const invoiceColumns: ColumnsType<InvoiceRecord> = [
    { title: 'Invoice ID',  dataIndex: 'assetInvoiceId',   key: 'assetInvoiceId',  width: 90  },
    { title: 'Book',        dataIndex: 'bookTypeCode',     key: 'bookTypeCode',    ellipsis: true },
    { title: 'Cost',        dataIndex: 'fixedAssetsCost',  key: 'fixedAssetsCost', align: 'right' as const, render: (v) => formatCurrency(v) },
    { title: 'Description', dataIndex: 'description',      key: 'description',     ellipsis: true },
    { title: 'Feeder',      dataIndex: 'feederSystemName', key: 'feederSystemName',ellipsis: true },
    { title: 'Effective',   dataIndex: 'dateEffective',    key: 'dateEffective',   width: 110, render: fmtDate },
  ];

  const txnColumns: ColumnsType<TransactionRecord> = [
    { title: 'Txn ID',    dataIndex: 'transactionHeaderId', key: 'txnId',   width: 90  },
    { title: 'Book',      dataIndex: 'bookTypeCode',        key: 'book',    ellipsis: true },
    { title: 'Type',      dataIndex: 'transactionTypeCode', key: 'type',
      render: (v) => <Tag style={{ borderRadius: 4, fontSize: 11 }}>{v}</Tag> },
    { title: 'Txn Date',  dataIndex: 'transactionDate',     key: 'txnDate', width: 110, render: fmtDate },
    { title: 'Effective', dataIndex: 'dateEffective',       key: 'effDate', width: 110, render: fmtDate },
    { title: 'Interface', dataIndex: 'callingInterface',    key: 'iface',   ellipsis: true },
  ];

  // ── Attributes tab state ─────────────────────────────────────────────────────
  const [attrValues, setAttrValues] = useState<Record<string, string>>({});
  const [attrDirty,  setAttrDirty]  = useState(false);
  const [attrSaving, setAttrSaving] = useState(false);

  // Seed editable fields whenever detail loads
  const attrFields: { key: string; label: string }[] = [
    { key: 'attribute1',  label: 'Sub Account' },
    { key: 'attribute2',  label: 'Attribute 2' },
    { key: 'attribute3',  label: 'Attribute 3' },
    { key: 'attribute4',  label: 'Attribute 4' },
    { key: 'attribute5',  label: 'Attribute 5' },
    { key: 'attribute6',  label: 'Attribute 6' },
    { key: 'attribute7',  label: 'Attribute 7' },
    { key: 'attribute8',  label: 'Attribute 8' },
    { key: 'attribute9',  label: 'Attribute 9' },
    { key: 'attribute10', label: 'Attribute 10' },
  ];

  // Sync attrValues — prefer detail (if endpoint exists), fall back to asset (search result)
  React.useEffect(() => {
    const source = detail || asset;
    if (source) {
      const vals: Record<string, string> = {};
      attrFields.forEach(f => { vals[f.key] = (source as any)[f.key] ?? ''; });
      setAttrValues(vals);
      setAttrDirty(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, asset]);

  const handleAttrChange = (key: string, val: string) => {
    setAttrValues(prev => ({ ...prev, [key]: val }));
    setAttrDirty(true);
  };

  const handleAttrSave = async () => {
    setAttrSaving(true);
    try {
      const payload: Record<string, string | null> = {};
      attrFields.forEach(f => { payload[f.key] = attrValues[f.key] || null; });
      payload.updatedBy = loggedUser;
      const res = await updateAssetAttributes(asset.assetId, payload);
      if (res.success) {
        message.success('Attributes saved successfully');
        setAttrDirty(false);
        onRefresh();
      } else {
        message.error(res.error || 'Failed to save attributes');
      }
    } catch (e: any) {
      message.error(e.message || 'Failed to save attributes');
    } finally {
      setAttrSaving(false);
    }
  };

  const subTabs = [
    {
      key: 'general',
      label: <span><InfoCircleOutlined style={{ marginRight: 4 }} />Financial</span>,
      children: loading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : (
          <>
          <Descriptions column={2} size="small" bordered
            styles={{ label: { fontWeight: 500, width: 160, background: REDWOOD.neutral100 } }}
            style={{ marginTop: 4 }}
          >
            <Descriptions.Item label="Asset Number">{asset.asset_number || asset.assetNumber || asset.assetId}</Descriptions.Item>
            <Descriptions.Item label="Asset ID">{asset.assetId}</Descriptions.Item>
            <Descriptions.Item label="Asset Type">{assetTypeLabel(detail?.assetType || asset.assetType || '')}</Descriptions.Item>
            <Descriptions.Item label="Description" span={2}>{detail?.description || asset.description}</Descriptions.Item>
            <Descriptions.Item label="Book">{asset.bookTypeCode || '—'}</Descriptions.Item>
            <Descriptions.Item label="Date in Service">{fmtDate(asset.datePlacedInService)}</Descriptions.Item>
            <Descriptions.Item label="Cost">{formatCurrency(asset.cost)}</Descriptions.Item>
            <Descriptions.Item label="Original Cost">{formatCurrency(asset.originalCost)}</Descriptions.Item>
            <Descriptions.Item label="Adjusted Cost">{formatCurrency(asset.adjustedCost)}</Descriptions.Item>
            <Descriptions.Item label="Salvage Value">{formatCurrency(asset.salvageValue)}</Descriptions.Item>
            <Descriptions.Item label="Deprn Reserve">{formatCurrency(asset.deprnReserve)}</Descriptions.Item>
            <Descriptions.Item label="NBV">{formatCurrency(asset.nbv)}</Descriptions.Item>
            <Descriptions.Item label="Depreciate">{asset.depreciateFlag || '—'}</Descriptions.Item>
            <Descriptions.Item label="Capitalize">{asset.capitalizeFlag || '—'}</Descriptions.Item>
            <Descriptions.Item label="Status">{statusTag(asset.retiredFlag)}</Descriptions.Item>
            <Descriptions.Item label="Date Ineffective">{fmtDate(asset.dateIneffective)}</Descriptions.Item>
            <Descriptions.Item label="Addition Accounting" span={2}>
              {(acctSlaExists?.exists || asset.accountedStatus === 'ACCOUNTED')
                ? <Space size={8}>
                    <Tag color="success" style={{ fontSize: 12 }}><CheckOutlined /> ACCOUNTED</Tag>
                    {acctSlaExists?.headerId && <Text type="secondary" style={{ fontSize: 11 }}>SLA #{acctSlaExists.headerId}</Text>}
                    {asset.accountedDate && <Text type="secondary" style={{ fontSize: 11 }}>— {asset.accountedDate}</Text>}
                  </Space>
                : <Tag color="orange" style={{ fontSize: 12 }}>UNACCOUNTED</Tag>
              }
            </Descriptions.Item>
            {books[0] && (() => {
              const b0 = books[0];
              const totalMonths = Number(b0.lifeInMonths) || 0;
              const calcRemaining = (fromDate: string) => {
                if (!fromDate || !totalMonths) return null;
                const start = new Date(fromDate);
                const now = new Date();
                const elapsed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
                const rem = Math.max(0, totalMonths - elapsed);
                return { years: Math.floor(rem / 12), months: rem % 12 };
              };
              const remSvc    = calcRemaining(b0.datePlacedInService);
              const remProrate = calcRemaining(b0.prorateDate);
              return (
                <>
                  <Descriptions.Item label="Depreciation Method">{b0.methodName || b0.methodCode || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Prorate Date">{fmtDate(b0.prorateDate)}</Descriptions.Item>
                  <Descriptions.Item label="Life in Years" span={2}>
                    {totalMonths
                      ? <Space size={16}>
                          <span><Text type="secondary" style={{ fontSize: 11 }}>Years</Text>{' '}<Text strong>{Math.floor(totalMonths / 12)}</Text></span>
                          <span><Text type="secondary" style={{ fontSize: 11 }}>Months</Text>{' '}<Text strong>{totalMonths % 12}</Text></span>
                        </Space>
                      : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Group Asset Number">{'—'}</Descriptions.Item>
                  <Descriptions.Item label="Remaining Life From" span={2}>
                    <Space direction="vertical" size={4}>
                      {remSvc && (
                        <Space size={16}>
                          <Text type="secondary" style={{ fontSize: 11, width: 100 }}>In Service Date</Text>
                          <span><Text type="secondary" style={{ fontSize: 11 }}>Years</Text>{' '}<Text strong>{remSvc.years}</Text></span>
                          <span><Text type="secondary" style={{ fontSize: 11 }}>Months</Text>{' '}<Text strong>{remSvc.months}</Text></span>
                        </Space>
                      )}
                      {remProrate && (
                        <Space size={16}>
                          <Text type="secondary" style={{ fontSize: 11, width: 100 }}>Prorate Date</Text>
                          <span><Text type="secondary" style={{ fontSize: 11 }}>Years</Text>{' '}<Text strong>{remProrate.years}</Text></span>
                          <span><Text type="secondary" style={{ fontSize: 11 }}>Months</Text>{' '}<Text strong>{remProrate.months}</Text></span>
                        </Space>
                      )}
                    </Space>
                  </Descriptions.Item>
                </>
              );
            })()}
          </Descriptions>
          {/* Accounting status + button */}
          {(() => {
            const isAccounted = acctSlaExists?.exists || asset.accountedStatus === 'ACCOUNTED';
            return (
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {isAccounted ? (
                  <Space size={8}>
                    <Tag color="success" style={{ fontSize: 12, padding: '2px 8px' }}>
                      <CheckOutlined style={{ marginRight: 4 }} />ACCOUNTED
                    </Tag>
                    {acctSlaExists?.headerId && (
                      <Text type="secondary" style={{ fontSize: 11 }}>SLA #{acctSlaExists.headerId}</Text>
                    )}
                    {asset.accountedDate && (
                      <Text type="secondary" style={{ fontSize: 11 }}>— {asset.accountedDate}</Text>
                    )}
                  </Space>
                ) : (
                  <Tag color="orange" style={{ fontSize: 12, padding: '2px 8px' }}>UNACCOUNTED</Tag>
                )}
                <Button
                  icon={isAccounted ? <CheckOutlined /> : <AccountBookOutlined />}
                  style={{
                    borderColor: isAccounted ? REDWOOD.success : FA_COLOR,
                    color: isAccounted ? REDWOOD.success : FA_COLOR,
                  }}
                  onClick={openAccountingPreview}
                >
                  {isAccounted ? 'View Accounting' : 'Create Accounting'}
                </Button>
              </div>
            );
          })()}
          </>
        ),
    },
    {
      key: 'descriptive',
      label: <span><BarcodeOutlined style={{ marginRight: 4 }} />Descriptive</span>,
      children: loading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : (
          <Descriptions column={2} size="small" bordered
            styles={{ label: { fontWeight: 500, width: 160, background: REDWOOD.neutral100 } }}
            style={{ marginTop: 4 }}
          >
            <Descriptions.Item label="Tag Number">{detail?.tagNumber || asset.tagNumber || '—'}</Descriptions.Item>
            <Descriptions.Item label="Serial Number">{detail?.serialNumber || asset.serialNumber || '—'}</Descriptions.Item>
            <Descriptions.Item label="Manufacturer">{detail?.manufacturerName || detail?.manufacturer || '—'}</Descriptions.Item>
            <Descriptions.Item label="Model Number">{detail?.modelNumber || '—'}</Descriptions.Item>
            <Descriptions.Item label="New / Used">{detail?.newUsed || '—'}</Descriptions.Item>
            <Descriptions.Item label="In Use">{detail?.inUseFlag || asset.inUseFlag || '—'}</Descriptions.Item>
            <Descriptions.Item label="Owned / Leased">{detail?.ownedLeased || asset.ownedLeased || '—'}</Descriptions.Item>
            <Descriptions.Item label="Units">{detail?.units || asset.units || '—'}</Descriptions.Item>
            <Descriptions.Item label="Property Type">{detail?.propertyTypeCode || '—'}</Descriptions.Item>
            <Descriptions.Item label="Feeder System">{detail?.feederSystemName || '—'}</Descriptions.Item>
            <Descriptions.Item label="Created By">{detail?.createdBy || asset.createdBy || '—'}</Descriptions.Item>
            <Descriptions.Item label="Creation Date">{fmtDate(detail?.creationDate || asset.creationDate)}</Descriptions.Item>
            <Descriptions.Item label="Last Updated By">{detail?.lastUpdatedBy || asset.lastUpdatedBy || '—'}</Descriptions.Item>
            <Descriptions.Item label="Last Update Date">{fmtDate(detail?.lastUpdateDate || asset.lastUpdateDate)}</Descriptions.Item>
          </Descriptions>
        ),
    },
    {
      key: 'books',
      label: <span><BookOutlined style={{ marginRight: 4 }} />Books</span>,
      children: loading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : books.length === 0
          ? <Empty description="No book records" style={{ marginTop: 32 }} />
          : (
            <div style={{ marginTop: 4 }}>
              {books.map((b, i) => (
                <Card key={i} size="small"
                  style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
                  title={
                    <Space>
                      <BookOutlined style={{ color: FA_COLOR }} />
                      <Text strong>{b.bookTypeCode}</Text>
                      {b.companyCode && (
                        <Tag color="blue" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                          Company: {b.companyCode}
                        </Tag>
                      )}
                    </Space>
                  }
                >
                  <Descriptions column={2} size="small">
                    <Descriptions.Item label="Company Code">{b.companyCode || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Date in Service">{fmtDate(b.datePlacedInService)}</Descriptions.Item>
                    <Descriptions.Item label="Deprn Start">{fmtDate(b.deprnStartDate)}</Descriptions.Item>
                    <Descriptions.Item label="Cost">{formatCurrency(b.cost)}</Descriptions.Item>
                    <Descriptions.Item label="Original Cost">{formatCurrency(b.originalCost)}</Descriptions.Item>
                    <Descriptions.Item label="Salvage Value">{formatCurrency(b.salvageValue)}</Descriptions.Item>
                    <Descriptions.Item label="Recoverable Cost">{formatCurrency(b.recoverableCost)}</Descriptions.Item>
                    <Descriptions.Item label="Deprn Reserve">{formatCurrency(b.deprnReserve)}</Descriptions.Item>
                    <Descriptions.Item label="YTD Deprn">{formatCurrency(b.ytdDeprn)}</Descriptions.Item>
                    <Descriptions.Item label="NBV">{formatCurrency(b.nbv)}</Descriptions.Item>
                    <Descriptions.Item label="Method">{b.methodCode || b.methodName || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Depreciation Method">{b.methodName || b.methodCode || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Life in Years" span={2}>
                      {b.lifeInMonths
                        ? <Space size={16}>
                            <span><Text type="secondary" style={{ fontSize: 11 }}>Years</Text>{' '}<Text strong>{Math.floor(Number(b.lifeInMonths) / 12)}</Text></span>
                            <span><Text type="secondary" style={{ fontSize: 11 }}>Months</Text>{' '}<Text strong>{Number(b.lifeInMonths) % 12}</Text></span>
                          </Space>
                        : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Group Asset Number">{'—'}</Descriptions.Item>
                    <Descriptions.Item label="Prorate Date">{fmtDate(b.prorateDate)}</Descriptions.Item>
                    {(() => {
                      const totalMonths = Number(b.lifeInMonths) || 0;
                      const calcRemaining = (fromDate: string) => {
                        if (!fromDate || !totalMonths) return null;
                        const start = new Date(fromDate);
                        const now = new Date();
                        const elapsedMonths = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
                        const rem = Math.max(0, totalMonths - elapsedMonths);
                        return { years: Math.floor(rem / 12), months: rem % 12 };
                      };
                      const remFromService = calcRemaining(b.datePlacedInService);
                      const remFromProrate = calcRemaining(b.prorateDate);
                      return (
                        <>
                          <Descriptions.Item label="Remaining Life From" span={2}>
                            <Space direction="vertical" size={4}>
                              {remFromService && (
                                <Space size={16}>
                                  <Text type="secondary" style={{ fontSize: 11 }}>In Service Date</Text>
                                  <span><Text type="secondary" style={{ fontSize: 11 }}>Years</Text>{' '}<Text strong>{remFromService.years}</Text></span>
                                  <span><Text type="secondary" style={{ fontSize: 11 }}>Months</Text>{' '}<Text strong>{remFromService.months}</Text></span>
                                </Space>
                              )}
                              {remFromProrate && (
                                <Space size={16}>
                                  <Text type="secondary" style={{ fontSize: 11 }}>Prorate Date</Text>
                                  <span><Text type="secondary" style={{ fontSize: 11 }}>Years</Text>{' '}<Text strong>{remFromProrate.years}</Text></span>
                                  <span><Text type="secondary" style={{ fontSize: 11 }}>Months</Text>{' '}<Text strong>{remFromProrate.months}</Text></span>
                                </Space>
                              )}
                            </Space>
                          </Descriptions.Item>
                        </>
                      );
                    })()}
                    <Descriptions.Item label="Depreciate">{b.depreciateFlag}</Descriptions.Item>
                    <Descriptions.Item label="Capitalize">{b.capitalizeFlag}</Descriptions.Item>
                    <Descriptions.Item label="Date Ineffective">{fmtDate(b.dateIneffective)}</Descriptions.Item>
                  </Descriptions>
                </Card>
              ))}
            </div>
          ),
    },
    {
      key: 'depreciation',
      label: <span><LineChartOutlined style={{ marginRight: 4 }} />Depreciation</span>,
      children: loading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : (
          <>
            {/* Filter row */}
            <div style={{
              display: 'flex', gap: 10, alignItems: 'center',
              padding: '8px 0 10px', flexWrap: 'wrap',
            }}>
              <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>Filter:</Text>
              <Select
                allowClear placeholder="Fiscal Year" size="small"
                style={{ width: 120 }} value={deprnFY || undefined}
                onChange={(v) => { setDeprnFY(v || ''); setDeprnPeriod(''); }}
              >
                {fyOptions.map(fy => <Option key={fy} value={fy}>{fy}</Option>)}
              </Select>
              <Select
                allowClear placeholder="Period" size="small"
                style={{ width: 140 }} value={deprnPeriod || undefined}
                onChange={(v) => setDeprnPeriod(v || '')}
              >
                {(deprnFY
                  ? Array.from(new Set(deprn.filter(r => r.fiscalYear === deprnFY).map(r => r.periodName).filter(Boolean))).sort((a,b) => b.localeCompare(a))
                  : periodOptions
                ).map(p => <Option key={p} value={p}>{p}</Option>)}
              </Select>
              {(deprnFY || deprnPeriod) && (
                <Button size="small" onClick={() => { setDeprnFY(''); setDeprnPeriod(''); }}>
                  Clear
                </Button>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {filteredDeprn.length} of {deprn.length} records
                </Text>
                {filteredDeprn.length > 0 && (
                  <Tooltip title="Export to Excel">
                    <Button size="small" icon={<DownloadOutlined />} onClick={exportDeprnToExcel}>
                      Excel
                    </Button>
                  </Tooltip>
                )}
                <Tooltip title="Show Depreciation APIs">
                  <Button
                    size="small"
                    icon={<ApiOutlined />}
                    style={{ color: FA_COLOR, borderColor: FA_COLOR }}
                    onClick={() => Modal.info({
                      title: 'Depreciation API Endpoints',
                      width: 780,
                      content: (
                        <div style={{ marginTop: 8 }}>
                          <Text strong style={{ fontSize: 12 }}>GET — Depreciation records for this asset</Text>
                          <div style={{ margin: '6px 0 14px' }}>
                            <Text copyable style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                              {`${APEX_DB_CONFIG.baseUrl}/fa/assets/${asset.assetId}/deprn`}
                            </Text>
                          </div>
                          <Text strong style={{ fontSize: 12 }}>POST — Post depreciation for this asset (check-then-post)</Text>
                          <div style={{ margin: '6px 0 14px' }}>
                            <Text copyable style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                              {`${APEX_DB_CONFIG.baseUrl}/fa/deprn-post-single`}
                            </Text>
                          </div>
                          <Text type="secondary" style={{ fontSize: 11 }}>Request body: {'{'} "assetId", "bookTypeCode", "periodName", "deprnAmount" {'}'}</Text>
                          <div style={{ marginTop: 14 }}>
                            <Text strong style={{ fontSize: 12 }}>POST — Create depreciation (errors on duplicate)</Text>
                            <div style={{ marginTop: 6 }}>
                              <Text copyable style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                                {`${APEX_DB_CONFIG.baseUrl}/fa/deprn-post-asset`}
                              </Text>
                            </div>
                          </div>
                          <div style={{ marginTop: 14 }}>
                            <Text strong style={{ fontSize: 12 }}>DELETE — Delete depreciation (blocked if period closed)</Text>
                            <div style={{ marginTop: 6 }}>
                              <Text copyable style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                                {`${APEX_DB_CONFIG.baseUrl}/fa/deprn-post-asset`}
                              </Text>
                            </div>
                          </div>
                        </div>
                      ),
                    })}
                  />
                </Tooltip>
                <Button
                  size="small"
                  icon={<DollarOutlined />}
                  style={{ borderColor: FA_COLOR, color: FA_COLOR }}
                  onClick={openDeprnPreview}
                  disabled={!books[0]?.lifeInMonths}
                >
                  Preview Depreciation
                </Button>
              </div>
            </div>
            <Table
              dataSource={filteredDeprn} columns={deprnColumns}
              rowKey={(r) => `${r.periodCounter}-${r.distributionId}`}
              size="small"
              scroll={{ x: 1000 }}
              pagination={{
                pageSize: deprnPageSize,
                showSizeChanger: true,
                pageSizeOptions: ['15', '25', '50'],
                showTotal: (t) => `${t} records`,
                onChange: (_page, ps) => setDeprnPageSize(ps),
              }}
              locale={{ emptyText: 'No depreciation records' }}
              summary={() => {
                const total = filteredDeprn.reduce((s, r) => s + (parseFloat(r.deprnAmount) || 0), 0);
                return (
                  <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 600 }}>
                    <Table.Summary.Cell index={0} colSpan={4}>
                      <Text strong style={{ fontSize: 12 }}>Total ({filteredDeprn.length} periods)</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                      <Text strong style={{ color: FA_COLOR }}>{formatCurrency(String(total))}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} colSpan={4} />
                  </Table.Summary.Row>
                );
              }}
            />

            {/* ── Preview Depreciation Modal ── */}
            <Modal
              open={deprnModal}
              onCancel={() => { setDeprnModal(false); setPostResults([]); if (postResults.some(r => r.status === 'POSTED')) onRefresh(); }}
              width={900}
              title={<Space><DollarOutlined style={{ color: FA_COLOR }} /><span>Depreciation Preview — {asset.asset_number || asset.assetNumber}</span></Space>}
              footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {selectedPeriods.size > 0 ? `${selectedPeriods.size} period(s) selected` : 'Select rows to post depreciation'}
                  </Text>
                  <Space>
                    <Tooltip title="Show API request details">
                      <Button
                        size="small"
                        icon={<ApiOutlined />}
                        style={{ color: FA_COLOR, borderColor: FA_COLOR }}
                        onClick={() => {
                          const book = asset.bookTypeCode || books[0]?.bookTypeCode || '';
                          const sampleRow = deprnRows.find(r => selectedPeriods.has(r.period)) || deprnRows[0];
                          const samplePayload = sampleRow ? {
                            assetId:      asset.assetId,
                            bookTypeCode: book,
                            periodName:   sampleRow.period,
                            deprnAmount:  parseFloat(sampleRow.depreciation.toFixed(2)),
                            createdBy:    loggedUser,
                          } : { assetId: asset.assetId, bookTypeCode: book, periodName: 'MMM-YY', deprnAmount: 0, createdBy: loggedUser };
                          Modal.info({
                            title: 'Depreciation API — POST Request',
                            width: 680,
                            content: (
                              <div style={{ marginTop: 8 }}>
                                <Text strong style={{ fontSize: 12 }}>Endpoint</Text>
                                <div style={{ margin: '6px 0 14px' }}>
                                  <Text copyable style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                                    POST {APEX_DB_CONFIG.baseUrl}/fa/deprn-post-single
                                  </Text>
                                </div>
                                <Text strong style={{ fontSize: 12 }}>Request Body {selectedPeriods.size > 0 ? `(sample — ${selectedPeriods.size} request(s) will be sent)` : '(example)'}</Text>
                                <div style={{ marginTop: 6, background: '#f5f5f5', borderRadius: 4, padding: '8px 12px' }}>
                                  <Text copyable={{ text: JSON.stringify(samplePayload, null, 2) }} style={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre' }}>
                                    {JSON.stringify(samplePayload, null, 2)}
                                  </Text>
                                </div>
                                <div style={{ marginTop: 12 }}>
                                  <Text type="secondary" style={{ fontSize: 11 }}>
                                    One POST is sent per selected period. The periodName follows the format shown above (e.g., Apr-2025).
                                  </Text>
                                </div>
                              </div>
                            ),
                          });
                        }}
                      />
                    </Tooltip>
                    <Button onClick={() => { setDeprnModal(false); setPostResults([]); if (postResults.some(r => r.status === 'POSTED')) onRefresh(); }}>Close</Button>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={posting}
                      disabled={selectedPeriods.size === 0}
                      style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
                      onClick={handleCreateDeprn}
                    >
                      Create Depreciation ({selectedPeriods.size})
                    </Button>
                  </Space>
                </div>
              }
            >
              {/* Info strip */}
              {books[0] && (
                <div style={{ background: REDWOOD.neutral100, borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
                  <Space size={20} wrap>
                    <span><Text type="secondary">Method: </Text><Text strong>{books[0].methodName || books[0].methodCode || '—'}</Text></span>
                    <span><Text type="secondary">Life: </Text><Text strong>{books[0].lifeInMonths} months</Text></span>
                    <span><Text type="secondary">Cost: </Text><Text strong>{formatCurrency(asset.cost)}</Text></span>
                    <span><Text type="secondary">Salvage: </Text><Text strong>{formatCurrency(books[0].salvageValue ?? asset.salvageValue)}</Text></span>
                    <span><Text type="secondary">Book: </Text><Text strong>{books[0].bookTypeCode}</Text></span>
                  </Space>
                </div>
              )}

              <Row gutter={[12, 0]} style={{ marginBottom: 12 }}>
                <Col xs={24} sm={8}>
                  <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>From Date (Deprn Start)</Text></div>
                  <DatePicker style={{ width: '100%' }} value={deprnFromDate} format="DD-MMM-YYYY" onChange={v => { setDeprnFromDate(v); setDeprnRows([]); setSelectedPeriods(new Set()); }} />
                </Col>
                <Col xs={24} sm={8}>
                  <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>To Date</Text></div>
                  <DatePicker style={{ width: '100%' }} value={deprnToDate} format="DD-MMM-YYYY" onChange={v => { setDeprnToDate(v || dayjs()); setDeprnRows([]); setSelectedPeriods(new Set()); }} />
                </Col>
                <Col xs={24} sm={8} style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <Button type="primary" style={{ background: FA_COLOR, borderColor: FA_COLOR, width: '100%' }} onClick={calcDeprn} disabled={!deprnFromDate}>
                    Calculate
                  </Button>
                </Col>
              </Row>

              {/* Post results banner */}
              {postResults.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {postResults.map(r => (
                    <div key={r.period} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 10px', marginBottom: 4, borderRadius: 4, fontSize: 12,
                      background: r.status === 'POSTED' ? '#f6ffed' : r.status === 'ALREADY_EXISTS' ? '#fffbe6' : '#fff2f0',
                      border: `1px solid ${r.status === 'POSTED' ? '#b7eb8f' : r.status === 'ALREADY_EXISTS' ? '#ffe58f' : '#ffccc7'}`,
                    }}>
                      <Tag color={r.status === 'POSTED' ? 'success' : r.status === 'ALREADY_EXISTS' ? 'warning' : 'error'} style={{ fontSize: 11 }}>
                        {r.status === 'POSTED' ? 'Posted' : r.status === 'ALREADY_EXISTS' ? 'Already Posted' : 'Error'}
                      </Tag>
                      <Text strong style={{ fontSize: 12 }}>{r.period}</Text>
                      {r.message && <Text type="secondary" style={{ fontSize: 11 }}>— {r.message}</Text>}
                    </div>
                  ))}
                </div>
              )}

              {deprnRows.length > 0 && (() => {
                const totalDeprn = deprnRows.reduce((s, r) => s + r.depreciation, 0);
                const totalDays  = deprnRows.reduce((s, r) => s + r.days, 0);
                const finalNbv   = deprnRows[deprnRows.length - 1].closingNbv;
                const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const selectableCount = deprnRows.filter(r => !isPosted(r.period)).length;
                const allSelected = selectableCount > 0 && deprnRows.filter(r => !isPosted(r.period)).every(r => selectedPeriods.has(r.period));

                const toggleAll = () => {
                  if (allSelected) {
                    setSelectedPeriods(new Set());
                  } else {
                    setSelectedPeriods(new Set(deprnRows.filter(r => !isPosted(r.period)).map(r => r.period)));
                  }
                };
                const toggle = (period: string) => {
                  setSelectedPeriods(prev => {
                    const next = new Set(prev);
                    next.has(period) ? next.delete(period) : next.add(period);
                    return next;
                  });
                };

                return (
                  <>
                    {/* Table header */}
                    <div style={{ border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '36px 90px 50px 110px 1fr 1fr 1fr 90px', background: REDWOOD.neutral100, padding: '6px 12px', fontSize: 12, fontWeight: 600, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
                        <span>
                          <input type="checkbox" checked={allSelected} onChange={toggleAll}
                            title="Select all unposted" style={{ cursor: 'pointer' }} />
                        </span>
                        <span>Period</span>
                        <span style={{ textAlign: 'right' }}>Days</span>
                        <span style={{ textAlign: 'right' }}>Daily Rate</span>
                        <span style={{ textAlign: 'right' }}>Opening NBV</span>
                        <span style={{ textAlign: 'right' }}>Depreciation</span>
                        <span style={{ textAlign: 'right' }}>Closing NBV</span>
                        <span style={{ textAlign: 'center' }}>Status</span>
                      </div>
                      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                        {deprnRows.map((r, i) => {
                          const posted     = isPosted(r.period);
                          const selected   = selectedPeriods.has(r.period);
                          const postResult = postResults.find(p => p.period === r.period);
                          return (
                            <div key={r.period} style={{
                              display: 'grid', gridTemplateColumns: '36px 90px 50px 110px 1fr 1fr 1fr 90px',
                              padding: '5px 12px', fontSize: 12,
                              background: posted ? '#f6ffed' : selected ? '#e6f4ff' : i % 2 === 0 ? '#fff' : REDWOOD.neutral100,
                              borderBottom: `1px solid ${REDWOOD.neutral200}`,
                              opacity: posted ? 0.75 : 1,
                            }}>
                              <span>
                                {!posted && (
                                  <input type="checkbox" checked={selected} onChange={() => toggle(r.period)}
                                    style={{ cursor: 'pointer' }} />
                                )}
                              </span>
                              <span style={{ fontFamily: 'monospace', fontWeight: selected ? 600 : 400 }}>{r.period}</span>
                              <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{r.days}</span>
                              <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.dailyRate)}</span>
                              <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.openingNbv)}</span>
                              <span style={{ textAlign: 'right', fontFamily: 'monospace', color: REDWOOD.primary }}>{fmt(r.depreciation)}</span>
                              <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.closingNbv)}</span>
                              <span style={{ textAlign: 'center' }}>
                                {postResult?.status === 'POSTED'
                                  ? <Tag color="success" style={{ fontSize: 10 }}>Posted</Tag>
                                  : postResult?.status === 'ALREADY_EXISTS'
                                    ? <Tag color="warning" style={{ fontSize: 10 }}>Duplicate</Tag>
                                    : postResult?.status === 'ERROR'
                                      ? <Tag color="error" style={{ fontSize: 10 }}>Error</Tag>
                                      : posted
                                        ? <Tag color="green" style={{ fontSize: 10 }}>✓ Posted</Tag>
                                        : null
                                }
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {/* Totals */}
                      <div style={{ display: 'grid', gridTemplateColumns: '36px 90px 50px 110px 1fr 1fr 1fr 90px', padding: '6px 12px', fontSize: 12, fontWeight: 700, background: '#fff3cd', borderTop: `2px solid ${REDWOOD.warning}` }}>
                        <span />
                        <span>Total ({deprnRows.length} mo)</span>
                        <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{totalDays}</span>
                        <span />
                        <span />
                        <span style={{ textAlign: 'right', fontFamily: 'monospace', color: REDWOOD.primary }}>{fmt(totalDeprn)}</span>
                        <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(finalNbv)}</span>
                        <span />
                      </div>
                    </div>
                    <Space wrap>
                      <Tag color="orange">Total Depreciation: {fmt(totalDeprn)}</Tag>
                      <Tag color="blue">Final NBV: {fmt(finalNbv)}</Tag>
                      <Tag color="green">{deprnRows.length} months</Tag>
                      <Tag color="geekblue">Total Days: {totalDays}</Tag>
                      {postedPeriods.size > 0 && <Tag color="success">{deprnRows.filter(r => isPosted(r.period)).length} already posted</Tag>}
                      <Button size="small" icon={<DownloadOutlined />} onClick={exportPreviewToExcel}>Excel</Button>
                    </Space>
                  </>
                );
              })()}
              {deprnRows.length === 0 && deprnFromDate && (
                <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '20px 0' }}>Click "Calculate" to generate the depreciation schedule.</Text>
              )}
            </Modal>
          </>
        ),
    },
    {
      key: 'distributions',
      label: <span><EnvironmentOutlined style={{ marginRight: 4 }} />Assignments</span>,
      children: loading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : (
          <Table
            dataSource={distributions} columns={distColumns} rowKey="distributionId"
            size="small" pagination={false}
            locale={{ emptyText: 'No distribution records' }}
            style={{ marginTop: 4 }}
          />
        ),
    },
    {
      key: 'invoices',
      label: <span><FileTextOutlined style={{ marginRight: 4 }} />Source Lines</span>,
      children: loading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : (
          <Table
            dataSource={invoices} columns={invoiceColumns} rowKey="assetInvoiceId"
            size="small" pagination={false}
            locale={{ emptyText: 'No invoice records' }}
            style={{ marginTop: 4 }}
          />
        ),
    },
    {
      key: 'transactions',
      label: <span><HistoryOutlined style={{ marginRight: 4 }} />Transactions</span>,
      children: loading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : (
          <Table
            dataSource={transactions} columns={txnColumns} rowKey="transactionHeaderId"
            size="small" pagination={{ pageSize: 15, showSizeChanger: false }}
            locale={{ emptyText: 'No transaction records' }}
            style={{ marginTop: 4 }}
          />
        ),
    },
    {
      key: 'categoryAccounts',
      label: <span><BookOutlined style={{ marginRight: 4 }} />Category Accounts</span>,
      children: loading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : (
          <>
            {/* API info strip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 10px', flexWrap: 'wrap' }}>
              <Text type="secondary" style={{ fontSize: 11 }}>Category ID:</Text>
              {categoryId
                ? <Tag color="blue" style={{ fontFamily: 'monospace', fontSize: 11 }}>{categoryId}</Tag>
                : <Tag color="error" style={{ fontSize: 11 }}>Not resolved — re-run 09_rr_fa_pkg_body.sql in Oracle</Tag>
              }
              {books[0]?.companyCode && (
                <>
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>Company Code (from Book):</Text>
                  <Tag color="geekblue" style={{ fontFamily: 'monospace', fontSize: 11 }}>{books[0].companyCode}</Tag>
                  <Text type="secondary" style={{ fontSize: 11 }}>— defaulted as first segment in accounts below</Text>
                </>
              )}
              <div style={{ marginLeft: 'auto' }}>
                <Tooltip title={categoryApiUrl}>
                  <Button
                    size="small" icon={<ApiOutlined />}
                    style={{ color: FA_COLOR, borderColor: FA_COLOR, fontSize: 11 }}
                    onClick={() => Modal.info({
                      title: 'Category Accounts API',
                      width: 760,
                      content: (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 11, color: '#888', marginBottom: 4, fontWeight: 600 }}>ENDPOINT (GET)</div>
                          <Text copyable style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                            {categoryApiUrl}
                          </Text>
                          {!categoryId && (
                            <div style={{ marginTop: 12, padding: '8px 12px', background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 6 }}>
                              <Text style={{ fontSize: 12, color: '#cf1322' }}>
                                <strong>Category ID is empty.</strong> The asset detail API ({APEX_DB_CONFIG.baseUrl}/fa/assets/{asset.assetId})
                                must return <code>assetCategoryId</code>. Please re-run <code>09_rr_fa_pkg_body.sql</code> in Oracle to deploy the updated package.
                              </Text>
                            </div>
                          )}
                        </div>
                      ),
                    })}
                  >
                    API
                  </Button>
                </Tooltip>
              </div>
            </div>

            {categoryBooks.length === 0
              ? <Empty description={categoryId ? 'No category account records found for this category' : 'Category ID not available — cannot load accounts'} style={{ marginTop: 24 }} />
              : (
            <div style={{ marginTop: 8 }}>
              {categoryBooks.map((cb, i) => {
                const accounts = [
                  { label: 'Asset Cost',                val: cb.assetCostAccount },
                  { label: 'Asset Clearing',            val: cb.assetClearingAccount },
                  { label: 'Depreciation Expense',      val: cb.deprnExpenseAccount },
                  { label: 'Depreciation Reserve',      val: cb.reserveAccount },
                  { label: 'Bonus Deprn Expense',       val: cb.bonusExpenseAccount },
                  { label: 'Bonus Deprn Reserve',       val: cb.bonusReserveAccount },
                  { label: 'CIP Cost',                  val: cb.cipCostAccount },
                  { label: 'CIP Clearing',              val: cb.cipClearingAccount },
                  { label: 'Unplanned Deprn Expense',   val: cb.unplannedDeprnExpAccount },
                  { label: 'Impairment Expense',        val: cb.impairmentExpenseAccount },
                  { label: 'Impairment Reserve',        val: cb.impairmentReserveAccount },
                  { label: 'Revaluation Reserve',       val: cb.revalReserveAccount },
                  { label: 'Reval Amortization',        val: cb.revalAmortAccount },
                  { label: 'Reval Loss Expense',        val: cb.revalLossExpAccount },
                ];
                return (
                  <Card key={i} size="small"
                    style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
                    title={
                      <Space>
                        <BookOutlined style={{ color: FA_COLOR }} />
                        <Text strong>{cb.bookTypeCode}</Text>
                        {cb.bookTypeName && <Text type="secondary" style={{ fontSize: 12 }}>— {cb.bookTypeName}</Text>}
                      </Space>
                    }
                  >
                    {/* Column header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '0 16px', padding: '4px 0 6px', borderBottom: `2px solid ${REDWOOD.neutral200}` }}>
                      <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Account Type</Text>
                      <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Account Combination</Text>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: '0 16px' }}>
                      {accounts.map(a => {
                        const companyCode = books[0]?.companyCode || '';
                        let displayVal = a.val || '';
                        if (a.val && companyCode) {
                          const segments = a.val.split('-');
                          segments[0] = companyCode;
                          displayVal = segments.join('-');
                        }
                        const rest = displayVal ? displayVal.split('-').slice(1).join('-') : '';
                        return (
                          <div key={a.label} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '7px 0', borderBottom: `1px solid ${REDWOOD.neutral200}`,
                            minHeight: 36,
                          }}>
                            <Text style={{ fontSize: 12, color: REDWOOD.neutral600, minWidth: 200 }}>{a.label}</Text>
                            {a.val ? (
                              <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>
                                <Tag color="geekblue" style={{ fontFamily: 'monospace', fontSize: 11, marginRight: 0 }}>
                                  {companyCode || displayVal.split('-')[0]}
                                </Tag>
                                <span style={{ color: REDWOOD.neutral900 }}>{rest ? `-${rest}` : ''}</span>
                              </span>
                            ) : (
                              <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
              )
            }
          </>
        ),
    },
    {
      key: 'attributes',
      label: <span><TagsOutlined style={{ marginRight: 4 }} />Attributes</span>,
      children: loading
        ? <Spin style={{ display: 'block', margin: '40px auto' }} />
        : (
          <div style={{ padding: '16px 0' }}>
            {/* API info strip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>GET</Text>
              <Text copyable style={{ fontFamily: 'monospace', fontSize: 11, color: FA_COLOR, wordBreak: 'break-all' }}>
                {`${APEX_DB_CONFIG.baseUrl}/fa/assets?assetNumber=${asset.assetNumber}&limit=1`}
              </Text>
              <Tooltip title="View live API response">
                <Button
                  size="small"
                  icon={<ApiOutlined />}
                  style={{ color: FA_COLOR, borderColor: FA_COLOR, fontSize: 11 }}
                  onClick={() => {
                    const url = `${APEX_DB_CONFIG.baseUrl}/fa/assets?assetNumber=${asset.assetNumber}&limit=1`;
                    fetch(url, { headers: { Accept: 'application/json' } })
                      .then(r => r.json())
                      .then(data => Modal.info({
                        title: `GET fa/assets?assetNumber=${asset.assetNumber}`,
                        width: 820,
                        content: (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 6, fontWeight: 600 }}>ENDPOINT</div>
                            <Text copyable style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{url}</Text>
                            <div style={{ fontSize: 11, color: '#888', margin: '12px 0 6px', fontWeight: 600 }}>RESPONSE</div>
                            <pre style={{
                              background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 6,
                              padding: 12, fontSize: 11, maxHeight: 500, overflow: 'auto',
                              fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                            }}>
                              {JSON.stringify(data, null, 2)}
                            </pre>
                          </div>
                        ),
                      }))
                      .catch(err => message.error(`API call failed: ${err.message}`));
                  }}
                >
                  Test API
                </Button>
              </Tooltip>
            </div>
            <Descriptions
              column={2}
              size="small"
              bordered
              styles={{ label: { fontWeight: 500, width: 160, background: REDWOOD.neutral100 } }}
              style={{ marginBottom: 16 }}
            >
              {attrFields.map(f => (
                <Descriptions.Item key={f.key} label={f.label}>
                  <Input
                    value={attrValues[f.key] ?? ''}
                    onChange={e => handleAttrChange(f.key, e.target.value)}
                    placeholder={`Enter ${f.label}`}
                    allowClear
                    style={{ maxWidth: 320 }}
                  />
                </Descriptions.Item>
              ))}
            </Descriptions>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button
                onClick={() => {
                  const source = detail || asset;
                  if (source) {
                    const vals: Record<string, string> = {};
                    attrFields.forEach(f => { vals[f.key] = (source as any)[f.key] ?? ''; });
                    setAttrValues(vals);
                    setAttrDirty(false);
                  }
                }}
                disabled={!attrDirty}
              >
                Discard Changes
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={attrSaving}
                disabled={!attrDirty}
                onClick={handleAttrSave}
                style={{ background: attrDirty ? FA_COLOR : undefined, borderColor: attrDirty ? FA_COLOR : undefined }}
              >
                Save Attributes
              </Button>
            </div>
          </div>
        ),
    },
  ];

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* Header summary strip */}
      <Card
        size="small"
        style={{
          borderRadius: 10, marginBottom: 16,
          border: `1px solid ${REDWOOD.neutral200}`,
          background: REDWOOD.surface,
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        }}
        styles={{ body: { padding: '14px 20px' } }}
      >
        {/* Top row: identity + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>Asset</Text>
            {' '}
            <Text strong style={{ fontSize: 15, color: FA_COLOR }}>{asset.asset_number || asset.assetNumber || asset.assetId}</Text>
          </div>
          <span style={{ color: REDWOOD.neutral300 }}>|</span>
          <Text style={{ fontSize: 13, color: REDWOOD.neutral900 }}>{asset.description}</Text>
          {categoryName && (
            <Tag style={{ borderRadius: 4, fontSize: 11, color: REDWOOD.neutral600, background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.neutral200}` }}>
              {categoryName}
            </Tag>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {statusTag(asset.retiredFlag)}
            <Tooltip title="Refresh asset data">
              <Button
                size="small"
                icon={<ReloadOutlined />}
                loading={loading}
                onClick={onRefresh}
                style={{ color: FA_COLOR, borderColor: FA_COLOR }}
              />
            </Tooltip>
          </div>
        </div>
        {/* Bottom row: key metrics — all consistent cards */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Book',            value: asset.bookTypeCode || '—',              color: REDWOOD.neutral600, bg: REDWOOD.neutral100, border: REDWOOD.neutral200 },
            { label: 'Date in Service', value: fmtDate(asset.datePlacedInService),     color: REDWOOD.neutral600, bg: REDWOOD.neutral100, border: REDWOOD.neutral200 },
            { label: 'Company',         value: books[0]?.companyCode || '—',           color: REDWOOD.info,       bg: '#f0f7ff',          border: '#bdd7f5' },
            { label: 'Cost',            value: formatCurrency(asset.cost),             color: FA_COLOR,           bg: `${FA_COLOR}10`,    border: `${FA_COLOR}30` },
            { label: 'NBV',             value: formatCurrency(asset.nbv),              color: REDWOOD.info,       bg: `${REDWOOD.info}10`,border: `${REDWOOD.info}30` },
            { label: 'Deprn Reserve',   value: formatCurrency(asset.deprnReserve),     color: REDWOOD.warning,    bg: `${REDWOOD.warning}10`, border: `${REDWOOD.warning}30` },
          ].map(({ label, value, color, bg, border }) => (
            <div key={label} style={{ padding: '6px 14px', borderRadius: 6, background: bg, border: `1px solid ${border}`, minWidth: 110 }}>
              <Text type="secondary" style={{ fontSize: 10, display: 'block', whiteSpace: 'nowrap' }}>{label}</Text>
              <Text strong style={{ fontSize: 13, color, whiteSpace: 'nowrap' }}>{value}</Text>
            </div>
          ))}
        </div>
      </Card>

      {/* Sub-tabs */}
      <Tabs
        activeKey={activeSubTab}
        onChange={(k) => onSubTabChange(tab.key, k)}
        size="small"
        tabBarStyle={{
          borderBottom: `2px solid ${FA_COLOR}40`,
          marginBottom: 0,
        }}
        items={subTabs}
      />

      {/* ── Accounting Preview Modal ── */}
      <Modal
        open={acctPreviewVisible}
        onCancel={() => setAcctPreviewVisible(false)}
        width={820}
        title={
          <Space>
            {acctSlaExists?.exists ? <CheckOutlined style={{ color: REDWOOD.success }} /> : <AuditOutlined style={{ color: FA_COLOR }} />}
            <span>{acctSlaExists?.exists ? 'View Accounting' : 'Create Accounting'} — Addition {asset.asset_number || asset.assetNumber}</span>
          </Space>
        }
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              {acctSlaExists?.exists && (
                <Tag color="success" style={{ fontSize: 12 }}>
                  <CheckOutlined /> SLA Header #{acctSlaExists.headerId} — {acctSlaExists.accountingStatus}
                </Tag>
              )}
            </span>
            <Space>
              <Tooltip
                title={
                  <div style={{ fontFamily: 'monospace', fontSize: 11 }}>
                    <div style={{ color: '#aaa', marginBottom: 4 }}>GET (preview)</div>
                    <div style={{ wordBreak: 'break-all' }}>
                      {`${APEX_DB_CONFIG.baseUrl}/fa/accounting/additions-preview?assetId=${asset.assetId}&bookTypeCode=${encodeURIComponent(asset.bookTypeCode || books[0]?.bookTypeCode || '')}`}
                    </div>
                    <div style={{ color: '#aaa', marginTop: 8, marginBottom: 4 }}>GET (SLA exists check)</div>
                    <div style={{ wordBreak: 'break-all' }}>
                      {`${APEX_DB_CONFIG.baseUrl}/sla/accounting/exists?sourceTable=RR_FA_ADDITIONS&sourceId=${asset.assetId}&eventType=FA_ADDITION`}
                    </div>
                  </div>
                }
                overlayStyle={{ maxWidth: 520 }}
                placement="topLeft"
              >
                <Button size="small" icon={<ApiOutlined />} style={{ color: '#888' }} />
              </Tooltip>
              {!acctSlaExists?.exists && (
                <Button
                  size="small"
                  icon={<ApiOutlined />}
                  style={{ color: acctDebugVisible ? FA_COLOR : '#888', borderColor: acctDebugVisible ? FA_COLOR : undefined }}
                  onClick={() => { setAcctDebugVisible(v => !v); if (!acctDebugVisible && acctPreview) setDbgSteps(buildDbgSteps(acctPreview.header, acctPreview.lines)); }}
                >
                  Debug
                </Button>
              )}
              <Button onClick={() => setAcctPreviewVisible(false)}>Close</Button>
              {!acctSlaExists?.exists && (
                <Button
                  type="primary"
                  icon={<AccountBookOutlined />}
                  loading={creatingAccounting}
                  disabled={!acctPreview}
                  style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
                  onClick={handleCreateAccounting}
                >
                  Create Accounting
                </Button>
              )}
            </Space>
          </div>
        }
      >
        <Spin spinning={acctPreviewLoading}>
          {acctPreview && !acctPreview.success && (
            <div style={{ background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 6, padding: '10px 14px' }}>
              <Text type="danger">Failed to load accounting preview: {acctPreview.error || 'Unknown error'}</Text>
            </div>
          )}
          {acctPreview && acctPreview.success && acctPreview.header && (
            <>
              {/* Step-by-step progress during accounting creation */}
              {acctStepsVisible && (
                <div style={{ background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 6, padding: '12px 16px', marginBottom: 14 }}>
                  <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>Accounting Progress</Text>
                  {acctSteps.map((step, i) => {
                    const icon = step.status === 'finish'  ? <span style={{ color: REDWOOD.success, fontWeight: 700 }}>✓</span>
                               : step.status === 'error'   ? <span style={{ color: REDWOOD.primary, fontWeight: 700 }}>✗</span>
                               : step.status === 'process' ? <Spin size="small" />
                               : <span style={{ color: REDWOOD.neutral300 }}>○</span>;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, opacity: step.status === 'wait' ? 0.45 : 1 }}>
                        <span style={{ width: 20, textAlign: 'center' }}>{icon}</span>
                        <span style={{ flex: 1 }}>
                          <Text strong style={{ fontSize: 12 }}>{step.label}</Text>
                          <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>{step.detail}</Text>
                          {step.result && <Text style={{ fontSize: 11, color: REDWOOD.success, display: 'block' }}>{step.result}</Text>}
                          {step.error  && <Text type="danger" style={{ fontSize: 11, display: 'block' }}>{step.error}</Text>}
                        </span>
                        {step.status === 'finish' && !step.error && <Tag color="success" style={{ fontSize: 10 }}>Done</Tag>}
                        {step.status === 'error'  && <Tag color="error"   style={{ fontSize: 10 }}>Failed</Tag>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Create Accounting Debug Panel */}
              {acctDebugVisible && (() => {
                const steps = buildDbgSteps(acctPreview.header, acctPreview.lines);
                const labels = [
                  'Step 1 — Create SLA Accounting',
                  'Step 2 — Create GL Journal (batch+header+lines)',
                  'Step 3 — Post GL Journal',
                  'Step 4 — Post SLA (stamp GL IDs)',
                  'Step 5 — Mark FA Addition as Accounted',
                ];
                return (
                  <div style={{ marginBottom: 14, border: `1px solid ${FA_COLOR}40`, borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ background: `${FA_COLOR}15`, padding: '8px 14px', borderBottom: `1px solid ${FA_COLOR}30` }}>
                      <Text strong style={{ fontSize: 12, color: FA_COLOR }}>Create Accounting Debug — run each step individually</Text>
                    </div>
                    {steps.map((step, idx) => {
                      const dbg = dbgSteps[idx];
                      const resp = dbg?.response;
                      const loading = dbg?.loading ?? false;
                      return (
                        <div key={idx} style={{ borderBottom: idx < steps.length - 1 ? `1px solid ${REDWOOD.neutral200}` : undefined, padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <Tag style={{ fontSize: 10, fontWeight: 700 }} color={step.method === 'POST' ? 'blue' : step.method === 'PUT' ? 'orange' : 'green'}>{step.method}</Tag>
                            <Text style={{ fontFamily: 'monospace', fontSize: 11, flex: 1, wordBreak: 'break-all' }}>{step.url}</Text>
                            <Button
                              size="small" type="primary" loading={loading}
                              style={{ background: FA_COLOR, borderColor: FA_COLOR, fontSize: 11 }}
                              onClick={() => { const s = buildDbgSteps(acctPreview.header, acctPreview.lines); setDbgSteps(s.map((x,i) => ({ ...x, response: dbgSteps[i]?.response ?? null, loading: false }))); runDbgStep(idx); }}
                            >
                              Run
                            </Button>
                            <Tooltip title="Copy URL">
                              <Button size="small" icon={<ApiOutlined />} style={{ fontSize: 10 }} onClick={() => navigator.clipboard.writeText(step.url)} />
                            </Tooltip>
                          </div>
                          {step.body && typeof step.body === 'object' && (
                            <div style={{ position: 'relative' }}>
                              <pre style={{ background: '#1a1a2e', color: '#a8d8ea', fontSize: 10, borderRadius: 4, padding: '8px 10px', margin: '0 0 6px', overflowX: 'auto', maxHeight: 160 }}>
                                {JSON.stringify(step.body, null, 2)}
                              </pre>
                              <Button size="small" style={{ position: 'absolute', top: 4, right: 4, fontSize: 10, opacity: 0.7 }}
                                onClick={() => navigator.clipboard.writeText(JSON.stringify(step.body, null, 2))}>Copy</Button>
                            </div>
                          )}
                          {typeof step.body === 'string' && (
                            <Text type="warning" style={{ fontSize: 11 }}>{step.body}</Text>
                          )}
                          {resp && (
                            <div style={{ position: 'relative' }}>
                              <pre style={{ background: resp.error || resp.success === false ? '#2a0a0a' : '#0a2a0a', color: resp.error || resp.success === false ? '#ffaaaa' : '#aaffaa', fontSize: 10, borderRadius: 4, padding: '8px 10px', margin: 0, overflowX: 'auto', maxHeight: 120 }}>
                                {JSON.stringify(resp, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* ── POSTED: show actual GL journal lines only ── */}
              {acctSlaExists?.exists ? (
                <>
                  {/* Summary strip */}
                  <div style={{
                    display: 'flex', gap: 24, alignItems: 'center',
                    background: '#f6ffed', border: '1px solid #b7eb8f',
                    borderRadius: 8, padding: '10px 16px', marginBottom: 14,
                  }}>
                    <Space size={6}>
                      <CheckOutlined style={{ color: REDWOOD.success, fontSize: 14 }} />
                      <Text strong style={{ color: REDWOOD.success, fontSize: 13 }}>Posted</Text>
                    </Space>
                    {[
                      { label: 'SLA Header', val: `#${acctSlaExists.headerId}` },
                      { label: 'Period',     val: acctPreview.header?.periodName },
                      { label: 'Acctg Date', val: acctPreview.header?.accountingDate || acctPreview.accountedDate },
                      { label: 'Currency',   val: acctPreview.header?.currencyCode },
                      { label: 'Cost',       val: formatCurrency(String(acctPreview.header?.cost)) },
                    ].map(({ label, val }) => val ? (
                      <div key={label} style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                        <Text type="secondary" style={{ fontSize: 10 }}>{label}</Text>
                        <Text strong style={{ fontSize: 12 }}>{val}</Text>
                      </div>
                    ) : null)}
                  </div>

                  {/* Actual GL lines */}
                  <Spin spinning={viewGlLoading}>
                    {viewGlLines.length > 0 ? (
                      <>
                        {/* Custom table — no wrapping account column */}
                        <div style={{ border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 8, overflow: 'hidden' }}>
                          {/* Header row */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '36px 1fr 140px 140px 80px',
                            padding: '7px 14px',
                            background: REDWOOD.neutral100,
                            borderBottom: `1px solid ${REDWOOD.neutral200}`,
                            fontSize: 11, fontWeight: 600, color: REDWOOD.neutral600,
                          }}>
                            <span>#</span>
                            <span>Account Combination</span>
                            <span style={{ textAlign: 'right' }}>Debit (AED)</span>
                            <span style={{ textAlign: 'right' }}>Credit (AED)</span>
                            <span style={{ textAlign: 'center' }}>Status</span>
                          </div>
                          {viewGlLines.map((line: any, idx: number) => (
                            <div key={idx} style={{
                              borderBottom: idx < viewGlLines.length - 1 ? `1px solid ${REDWOOD.neutral200}` : undefined,
                              background: idx % 2 === 0 ? '#fff' : REDWOOD.neutral100,
                            }}>
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: '36px 1fr 140px 140px 80px',
                                padding: '8px 14px',
                                alignItems: 'start',
                              }}>
                                <Text type="secondary" style={{ fontSize: 11, paddingTop: 2 }}>{line.line_num}</Text>
                                <div>
                                  {/* Account combination — single line, monospace */}
                                  <div style={{
                                    fontFamily: 'monospace', fontSize: 12, fontWeight: 600,
                                    color: REDWOOD.neutral900, whiteSpace: 'nowrap',
                                    letterSpacing: '0.02em',
                                  }}>
                                    {line.account || '—'}
                                  </div>
                                  {/* Description below */}
                                  <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginTop: 2 }}>
                                    {line.description || ''}
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                                  {line.accounted_dr
                                    ? <Text style={{ color: REDWOOD.info, fontWeight: 600 }}>{formatCurrency(String(line.accounted_dr))}</Text>
                                    : <Text type="secondary">—</Text>}
                                </div>
                                <div style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                                  {line.accounted_cr
                                    ? <Text style={{ color: REDWOOD.primary, fontWeight: 600 }}>{formatCurrency(String(line.accounted_cr))}</Text>
                                    : <Text type="secondary">—</Text>}
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                  <Tag
                                    color={line.posting_status === 'POSTED' ? 'success' : 'default'}
                                    style={{ fontSize: 10, margin: 0 }}
                                  >
                                    {line.posting_status || '—'}
                                  </Tag>
                                </div>
                              </div>
                            </div>
                          ))}
                          {/* Totals row */}
                          {(() => {
                            const totalDr = viewGlLines.reduce((s: number, l: any) => s + (Number(l.accounted_dr) || 0), 0);
                            const totalCr = viewGlLines.reduce((s: number, l: any) => s + (Number(l.accounted_cr) || 0), 0);
                            return (
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: '36px 1fr 140px 140px 80px',
                                padding: '7px 14px',
                                background: '#fff8e1',
                                borderTop: `2px solid ${REDWOOD.warning}`,
                                fontSize: 12, fontWeight: 700,
                              }}>
                                <span />
                                <Text strong style={{ fontSize: 12 }}>Total ({viewGlLines.length} lines)</Text>
                                <Text strong style={{ textAlign: 'right', display: 'block', color: REDWOOD.info, fontFamily: 'monospace' }}>{formatCurrency(String(totalDr))}</Text>
                                <Text strong style={{ textAlign: 'right', display: 'block', color: REDWOOD.primary, fontFamily: 'monospace' }}>{formatCurrency(String(totalCr))}</Text>
                                <span />
                              </div>
                            );
                          })()}
                        </div>
                        <div style={{ marginTop: 6, padding: '3px 4px' }}>
                          <Text type="secondary" style={{ fontSize: 10 }}>
                            Source: reerp/gl/journals/lines?reference2={asset.assetId} · Journal: {viewGlLines[0]?.journal_name}
                          </Text>
                        </div>
                      </>
                    ) : (
                      <Empty description="No GL lines found for this asset (reference2)" style={{ padding: '20px 0' }} />
                    )}
                  </Spin>
                </>
              ) : (
                <>
                  {/* ── NOT YET POSTED: show preview header + lines ── */}
                  <Card size="small" title={<Space><FileTextOutlined /><span>Journal Header (Preview)</span></Space>}
                    style={{ marginBottom: 12, borderRadius: 6 }}
                  >
                    <Descriptions column={2} size="small">
                      <Descriptions.Item label="Asset Number">{acctPreview.header.assetNumber || acctPreview.header.sourceNumber}</Descriptions.Item>
                      <Descriptions.Item label="Asset ID">{acctPreview.header.assetId || acctPreview.header.sourceId}</Descriptions.Item>
                      <Descriptions.Item label="Description" span={2}>{acctPreview.header.description}</Descriptions.Item>
                      <Descriptions.Item label="Book">{acctPreview.header.bookTypeCode}</Descriptions.Item>
                      <Descriptions.Item label="Period">{acctPreview.header.periodName}</Descriptions.Item>
                      <Descriptions.Item label="Accounting Date">{acctPreview.header.accountingDate}</Descriptions.Item>
                      <Descriptions.Item label="Event Type">{acctPreview.header.eventTypeCode}</Descriptions.Item>
                      <Descriptions.Item label="Source Table">{acctPreview.header.sourceTable}</Descriptions.Item>
                      <Descriptions.Item label="Module">{acctPreview.header.moduleName}</Descriptions.Item>
                      <Descriptions.Item label="Cost" span={2}>
                        <Text strong style={{ color: FA_COLOR }}>{formatCurrency(String(acctPreview.header.cost))}</Text>
                      </Descriptions.Item>
                    </Descriptions>
                  </Card>

                  <Card size="small" title={<Space><DatabaseOutlined /><span>Journal Lines (Preview)</span></Space>} style={{ borderRadius: 6 }}>
                    <div style={{ border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{
                        display: 'grid', gridTemplateColumns: '36px 60px 90px 1fr 130px 130px',
                        padding: '6px 12px', background: REDWOOD.neutral100,
                        borderBottom: `1px solid ${REDWOOD.neutral200}`,
                        fontSize: 11, fontWeight: 600, color: REDWOOD.neutral600,
                      }}>
                        <span>#</span><span>Dr/Cr</span><span>Class</span><span>Account Combination</span>
                        <span style={{ textAlign: 'right' }}>Debit</span><span style={{ textAlign: 'right' }}>Credit</span>
                      </div>
                      {acctPreview.lines.map((l: any, idx: number) => (
                        <div key={idx} style={{
                          display: 'grid', gridTemplateColumns: '36px 60px 90px 1fr 130px 130px',
                          padding: '7px 12px', fontSize: 12,
                          background: idx % 2 === 0 ? '#fff' : REDWOOD.neutral100,
                          borderBottom: idx < acctPreview.lines.length - 1 ? `1px solid ${REDWOOD.neutral200}` : undefined,
                          alignItems: 'start',
                        }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>{l.lineNumber}</Text>
                          <Tag color={l.lineType === 'DR' ? 'blue' : 'orange'} style={{ fontSize: 10, fontWeight: 700, margin: 0 }}>{l.lineType}</Tag>
                          <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{l.accountingClass}</Text>
                          <div>
                            <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {l.accountCombination || <Text type="secondary" style={{ fontSize: 11 }}>CCID: {l.ccid ?? '—'}</Text>}
                            </div>
                            {l.description && <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginTop: 1 }}>{l.description}</div>}
                          </div>
                          <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                            {l.accountedDr ? <Text style={{ color: REDWOOD.info, fontWeight: 600 }}>{formatCurrency(String(l.accountedDr))}</Text> : <Text type="secondary">—</Text>}
                          </div>
                          <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                            {l.accountedCr ? <Text style={{ color: REDWOOD.primary, fontWeight: 600 }}>{formatCurrency(String(l.accountedCr))}</Text> : <Text type="secondary">—</Text>}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 6, padding: '3px 4px' }}>
                      <Text type="secondary" style={{ fontSize: 10 }}>
                        Reference1={asset.asset_number || asset.assetNumber} · Reference2={asset.assetId} · Reference5=FA_ADDITIONS
                      </Text>
                    </div>
                  </Card>
                </>
              )}
            </>
          )}
          {!acctPreview && !acctPreviewLoading && (
            <Empty description="No accounting preview data" />
          )}
        </Spin>
      </Modal>

      {/* ── Depreciation Accounting Modal ── */}
      <Modal
        open={deprnAcctVisible}
        title={
          <Space>
            <AccountBookOutlined style={{ color: REDWOOD.primary }} />
            <span>Depreciation Accounting</span>
            {deprnAcctRecord && (
              <Tag color="blue" style={{ marginLeft: 4 }}>
                {deprnAcctRecord.periodName}
              </Tag>
            )}
          </Space>
        }
        onCancel={() => { setDeprnAcctVisible(false); setDeprnAcctStepsVis(false); }}
        width={720}
        footer={[
          <Button key="close" onClick={() => { setDeprnAcctVisible(false); setDeprnAcctStepsVis(false); setDeprnDebugVisible(false); }}>
            Close
          </Button>,
          deprnSlaExists?.exists
            ? <Tag key="sla-status" color={deprnSlaExists.accountingStatus === 'POSTED' ? 'success' : 'warning'} style={{ marginLeft: 8, fontSize: 12 }}>
                <CheckOutlined /> SLA #{deprnSlaExists.headerId} — {deprnSlaExists.accountingStatus}
              </Tag>
            : null,
          !deprnSlaExists?.exists && deprnGlLines.length === 0 && (
            <Button
              key="debug"
              icon={<ApiOutlined />}
              style={{ color: deprnDebugVisible ? FA_COLOR : '#888', borderColor: deprnDebugVisible ? FA_COLOR : undefined }}
              onClick={() => {
                setDeprnDebugVisible(v => !v);
                if (!deprnDebugVisible && deprnAcctPreview)
                  setDeprnDbgSteps(buildDeprnDbgSteps(deprnAcctPreview.header, deprnAcctPreview.lines));
              }}
            >
              Debug
            </Button>
          ),
          !deprnSlaExists?.exists && deprnGlLines.length === 0 && (
            <Button
              key="create"
              type="primary"
              icon={<AccountBookOutlined />}
              loading={deprnAcctCreating}
              onClick={handleCreateDeprnAccounting}
              disabled={!deprnAcctPreview}
            >
              Create Accounting
            </Button>
          ),
        ]}
      >
        <Spin spinning={deprnAcctLoading}>
          {/* Step progress */}
          {deprnAcctStepsVis && (
            <div style={{ marginBottom: 16 }}>
              {deprnAcctSteps.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 0', borderBottom: `1px solid ${REDWOOD.neutral200}`,
                }}>
                  <div style={{ width: 22, textAlign: 'center' }}>
                    {s.status === 'done' && <CheckOutlined style={{ color: REDWOOD.success }} />}
                    {s.status === 'running' && <Spin size="small" />}
                    {s.status === 'error' && <span style={{ color: REDWOOD.error }}>✕</span>}
                    {s.status === 'pending' && <span style={{ color: REDWOOD.neutral400 }}>○</span>}
                  </div>
                  <Text style={{ fontSize: 13, flex: 1 }}>{s.label}</Text>
                  {s.detail && <Text type="secondary" style={{ fontSize: 11 }}>{s.detail}</Text>}
                </div>
              ))}
            </div>
          )}

          {/* Debug panel */}
          {deprnDebugVisible && deprnAcctPreview && (() => {
            const steps = buildDeprnDbgSteps(deprnAcctPreview.header, deprnAcctPreview.lines);
            const labels = [
              'Step 1 — Create SLA Accounting',
              'Step 2 — Create GL Journal (batch+header+lines)',
              'Step 3 — Post GL Journal',
              'Step 4 — Post SLA (stamp GL IDs)',
              'Step 5 — Mark Deprn Period as Accounted',
            ];
            return (
              <div style={{ marginBottom: 14, border: `1px solid ${FA_COLOR}40`, borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ background: `${FA_COLOR}15`, padding: '8px 14px', borderBottom: `1px solid ${FA_COLOR}30` }}>
                  <Text strong style={{ fontSize: 12, color: FA_COLOR }}>Depreciation Accounting Debug — run each step individually</Text>
                </div>
                {steps.map((step, idx) => {
                  const dbg     = deprnDbgSteps[idx];
                  const resp    = dbg?.response;
                  const loading = dbg?.loading ?? false;
                  return (
                    <div key={idx} style={{ borderBottom: idx < steps.length - 1 ? `1px solid ${REDWOOD.neutral200}` : undefined, padding: '10px 14px' }}>
                      <div style={{ marginBottom: 4 }}>
                        <Text type="secondary" style={{ fontSize: 10, fontWeight: 600 }}>{labels[idx]}</Text>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Tag style={{ fontSize: 10, fontWeight: 700 }} color={step.method === 'POST' ? 'blue' : step.method === 'PUT' ? 'orange' : 'green'}>{step.method}</Tag>
                        <Text style={{ fontFamily: 'monospace', fontSize: 11, flex: 1, wordBreak: 'break-all' }}>{step.url}</Text>
                        <Button size="small" type="primary" loading={loading}
                          style={{ background: FA_COLOR, borderColor: FA_COLOR, fontSize: 11 }}
                          onClick={() => {
                            const s = buildDeprnDbgSteps(deprnAcctPreview.header, deprnAcctPreview.lines);
                            setDeprnDbgSteps(s.map((x, i) => ({ ...x, response: deprnDbgSteps[i]?.response ?? null, loading: false })));
                            runDeprnDbgStep(idx);
                          }}>Run</Button>
                        <Tooltip title="Copy URL">
                          <Button size="small" icon={<ApiOutlined />} style={{ fontSize: 10 }} onClick={() => navigator.clipboard.writeText(step.url)} />
                        </Tooltip>
                      </div>
                      {step.body && typeof step.body === 'object' && (
                        <div style={{ position: 'relative' }}>
                          <pre style={{ background: '#1a1a2e', color: '#a8d8ea', fontSize: 10, borderRadius: 4, padding: '8px 10px', margin: '0 0 6px', overflowX: 'auto', maxHeight: 160 }}>
                            {JSON.stringify(step.body, null, 2)}
                          </pre>
                          <Button size="small" style={{ position: 'absolute', top: 4, right: 4, fontSize: 10, opacity: 0.7 }}
                            onClick={() => navigator.clipboard.writeText(JSON.stringify(step.body, null, 2))}>Copy</Button>
                        </div>
                      )}
                      {typeof step.body === 'string' && (
                        <Text type="warning" style={{ fontSize: 11 }}>{step.body}</Text>
                      )}
                      {resp && (
                        <pre style={{ background: resp.error || resp.success === false ? '#2a0a0a' : '#0a2a0a', color: resp.error || resp.success === false ? '#ffaaaa' : '#aaffaa', fontSize: 10, borderRadius: 4, padding: '8px 10px', margin: 0, overflowX: 'auto', maxHeight: 120 }}>
                          {JSON.stringify(resp, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {deprnGlLines.length > 0 ? (
            /* ── GL lines exist: show summary + posted lines ── */
            <>
              {deprnAcctPreview?.header && (
                <div style={{
                  display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
                  background: '#f6ffed', border: '1px solid #b7eb8f',
                  borderRadius: 8, padding: '10px 16px', marginBottom: 14,
                }}>
                  <Space size={6}>
                    <CheckOutlined style={{ color: REDWOOD.success, fontSize: 14 }} />
                    <Text strong style={{ color: REDWOOD.success, fontSize: 13 }}>Posted</Text>
                  </Space>
                  <Divider type="vertical" style={{ margin: '0 4px' }} />
                  {[
                    { label: 'Period', val: deprnAcctPreview.header.periodName },
                    { label: 'Acctg Date', val: deprnAcctPreview.header.accountingDate },
                    { label: 'Currency', val: deprnAcctPreview.header.currencyCode },
                    { label: 'Amount', val: formatCurrency(String(deprnAcctPreview.header.totalAmount || deprnAcctRecord?.deprnAmount || 0)) },
                  ].map(f => (
                    <Text key={f.label} type="secondary" style={{ fontSize: 12 }}>
                      {f.label}: <strong>{f.val || '—'}</strong>
                    </Text>
                  ))}
                  <div style={{ marginTop: 2, width: '100%' }}>
                    <Text type="secondary" style={{ fontSize: 10 }}>
                      Source: <strong>{APEX_DB_CONFIG.baseUrl}/gl/journals/lines?reference2={(deprnAcctRecord?.distributionId || deprnAcctPreview.header.periodCounter)}&amp;reference5=FA_DEPRECIATION</strong>
                    </Text>
                  </div>
                </div>
              )}
              <Card size="small" title={<Text style={{ fontSize: 12, fontWeight: 600 }}>GL Journal Lines</Text>}
                style={{ borderRadius: 8 }} styles={{ body: { padding: '8px 12px' } }}>
                <Spin spinning={deprnGlLoading}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '36px 1fr 140px 140px 80px',
                    gap: '0 8px', padding: '4px 0',
                    borderBottom: `2px solid ${REDWOOD.neutral300}`, marginBottom: 4,
                  }}>
                    {['#','Account','Debit','Credit','Status'].map((h, i) => (
                      <Text key={h} style={{ fontSize: 10, color: REDWOOD.neutral500, fontWeight: 600, textAlign: i >= 2 && i <= 3 ? 'right' : 'left' }}>{h}</Text>
                    ))}
                  </div>
                  {deprnGlLines.map((l: any, idx: number) => (
                    <div key={idx} style={{
                      display: 'grid', gridTemplateColumns: '36px 1fr 140px 140px 80px',
                      gap: '0 8px', padding: '6px 0',
                      borderBottom: `1px solid ${REDWOOD.neutral200}`, alignItems: 'start',
                    }}>
                      <Text style={{ fontSize: 11, color: REDWOOD.neutral500, paddingTop: 2 }}>{l.line_num ?? idx + 1}</Text>
                      <div>
                        <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', color: REDWOOD.neutral900 }}>{l.account}</div>
                        {l.description && <div style={{ fontSize: 11, color: REDWOOD.neutral500, marginTop: 2 }}>{l.description}</div>}
                      </div>
                      <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {l.accounted_dr ? <Text style={{ color: REDWOOD.info, fontWeight: 600 }}>{formatCurrency(String(l.accounted_dr))}</Text> : <Text type="secondary">—</Text>}
                      </div>
                      <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {l.accounted_cr ? <Text style={{ color: REDWOOD.primary, fontWeight: 600 }}>{formatCurrency(String(l.accounted_cr))}</Text> : <Text type="secondary">—</Text>}
                      </div>
                      <div>
                        <Tag color={l.posting_status === 'P' ? 'success' : 'default'} style={{ fontSize: 10, padding: '0 4px' }}>
                          {l.posting_status === 'P' ? 'Posted' : l.posting_status || '—'}
                        </Tag>
                      </div>
                    </div>
                  ))}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '36px 1fr 140px 140px 80px',
                    gap: '0 8px', padding: '6px 0',
                    borderTop: `2px solid ${REDWOOD.neutral300}`, marginTop: 4,
                  }}>
                    <span /><Text style={{ fontSize: 11, fontWeight: 600 }}>Total ({deprnGlLines.length} lines)</Text>
                    <Text style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: REDWOOD.info }}>
                      {formatCurrency(String(deprnGlLines.reduce((s: number, l: any) => s + (Number(l.accounted_dr) || 0), 0)))}
                    </Text>
                    <Text style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: REDWOOD.primary }}>
                      {formatCurrency(String(deprnGlLines.reduce((s: number, l: any) => s + (Number(l.accounted_cr) || 0), 0)))}
                    </Text>
                    <span />
                  </div>
                </Spin>
              </Card>
            </>
          ) : (
            /* ── Not posted: show preview ── */
            deprnAcctPreview && (
              <>
                <Card size="small"
                  title={<Text style={{ fontSize: 12, fontWeight: 600, color: REDWOOD.neutral600 }}>Journal Header (Preview)</Text>}
                  style={{ borderRadius: 8, marginBottom: 12 }}
                  styles={{ body: { padding: '10px 14px' } }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                    {[
                      { label: 'Source',        val: (deprnAcctPreview.header as any).source || 'Fixed Assets' },
                      { label: 'Category',      val: (deprnAcctPreview.header as any).category || 'Depreciation' },
                      { label: 'Ledger',        val: deprnAcctPreview.header.ledgerName },
                      { label: 'Period',        val: deprnAcctPreview.header.periodName },
                      { label: 'Acctg Date',    val: deprnAcctPreview.header.accountingDate },
                      { label: 'Currency',      val: deprnAcctPreview.header.currencyCode },
                      { label: 'Total Amount',  val: formatCurrency(String((deprnAcctPreview.header as any).totalAmount || (deprnAcctPreview.header as any).deprnAmount || 0)) },
                    ].map(f => (
                      <div key={f.label}>
                        <Text style={{ fontSize: 10, color: REDWOOD.neutral500 }}>{f.label}</Text>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{f.val || '—'}</div>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card size="small"
                  title={<Text style={{ fontSize: 12, fontWeight: 600, color: REDWOOD.neutral600 }}>Journal Lines (Preview)</Text>}
                  style={{ borderRadius: 8 }}
                  styles={{ body: { padding: '8px 12px' } }}
                >
                  <div style={{
                    display: 'grid', gridTemplateColumns: '36px 1fr 140px 140px',
                    gap: '0 8px', padding: '4px 0',
                    borderBottom: `2px solid ${REDWOOD.neutral300}`, marginBottom: 4,
                  }}>
                    {['#','Account','Debit','Credit'].map((h, i) => (
                      <Text key={h} style={{ fontSize: 10, color: REDWOOD.neutral500, fontWeight: 600, textAlign: i >= 2 ? 'right' : 'left' }}>{h}</Text>
                    ))}
                  </div>
                  {deprnAcctPreview.lines.map((l, idx) => (
                    <div key={idx} style={{
                      display: 'grid', gridTemplateColumns: '36px 1fr 140px 140px',
                      gap: '0 8px', padding: '6px 0',
                      borderBottom: `1px solid ${REDWOOD.neutral200}`, alignItems: 'start',
                    }}>
                      <Text style={{ fontSize: 11, color: REDWOOD.neutral500, paddingTop: 2 }}>{idx + 1}</Text>
                      <div>
                        <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', color: REDWOOD.neutral900 }}>
                          {l.accountCombination || (l as any).accountCode}
                        </div>
                        <div style={{ fontSize: 11, color: REDWOOD.neutral500, marginTop: 2 }}>{l.description}</div>
                        <Text type="secondary" style={{ fontSize: 10 }}>
                          ref1={l.reference1} · ref2={(l as any).reference2} · ref5={(l as any).reference5 || 'FA_DEPRECIATION'}
                        </Text>
                      </div>
                      <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {l.accountedDr ? <Text style={{ color: REDWOOD.info, fontWeight: 600 }}>{formatCurrency(String(l.accountedDr))}</Text> : <Text type="secondary">—</Text>}
                      </div>
                      <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {l.accountedCr ? <Text style={{ color: REDWOOD.primary, fontWeight: 600 }}>{formatCurrency(String(l.accountedCr))}</Text> : <Text type="secondary">—</Text>}
                      </div>
                    </div>
                  ))}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '36px 1fr 140px 140px',
                    gap: '0 8px', padding: '6px 0',
                    borderTop: `2px solid ${REDWOOD.neutral300}`, marginTop: 4,
                  }}>
                    <span /><Text style={{ fontSize: 11, fontWeight: 600 }}>Total</Text>
                    <Text style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: REDWOOD.info }}>
                      {formatCurrency(String(deprnAcctPreview.lines.reduce((s, l) => s + (l.accountedDr || 0), 0)))}
                    </Text>
                    <Text style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: REDWOOD.primary }}>
                      {formatCurrency(String(deprnAcctPreview.lines.reduce((s, l) => s + (l.accountedCr || 0), 0)))}
                    </Text>
                  </div>
                </Card>
              </>
            )
          )}
          {!deprnAcctPreview && !deprnAcctLoading && (
            <Empty description="No depreciation accounting data" />
          )}
        </Spin>
      </Modal>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const ManageAssets: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();

  // Search state
  const [rows,       setRows]       = useState<AssetRecord[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page,       setPage]       = useState(1);
  const [pageSize,   setPageSize]   = useState(25);
  const [searched,   setSearched]   = useState(false);
  const [bookList,   setBookList]   = useState<BookControlRecord[]>([]);

  useEffect(() => {
    getBookControls().then(setBookList);
  }, []);

  // API modal
  const [lastApiUrl,      setLastApiUrl]      = useState<string | null>(null);
  const [apiResponse,     setApiResponse]     = useState<string>('');
  const [apiModalVisible, setApiModalVisible] = useState(false);
  const [apiUrlCopied,    setApiUrlCopied]    = useState(false);

  // Tab management
  const [activeTabKey,  setActiveTabKey]  = useState('search');
  const [openAssetTabs, setOpenAssetTabs] = useState<OpenAssetTab[]>([]);

  // Run search
  const runSearch = useCallback(async (pg = 1, ps = pageSize) => {
    const vals = form.getFieldsValue();
    setLoading(true);

    const q = new URLSearchParams();
    if (vals.assetNumber)  q.append('assetNumber',  vals.assetNumber);
    if (vals.description)  q.append('description',  vals.description);
    if (vals.category)     q.append('category',     vals.category);
    if (vals.bookTypeCode) q.append('bookTypeCode', vals.bookTypeCode);
    if (vals.assetType)    q.append('assetType',    vals.assetType);
    if (vals.status)       q.append('assetStatus',  vals.status);
    q.append('offset', String((pg - 1) * ps));
    q.append('limit',  String(ps));
    setLastApiUrl(`${APEX_DB_CONFIG.baseUrl}/fa/assets?${q.toString()}`);

    try {
      const res = await searchAssets({
        assetNumber:  vals.assetNumber  || undefined,
        description:  vals.description  || undefined,
        category:     vals.category     || undefined,
        bookTypeCode: vals.bookTypeCode || undefined,
        assetType:    vals.assetType    || undefined,
        status:       vals.status       || undefined,
        offset:       (pg - 1) * ps,
        limit:        ps,
      });
      setApiResponse(JSON.stringify(res, null, 2));
      if (res.error) {
        message.error(res.error);
      } else {
        setRows(res.items || []);
        setTotalCount(res.totalCount || 0);
        setPage(pg);
      }
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, [form, pageSize]);

  useEffect(() => { runSearch(1, pageSize); }, []);

  // Open asset in new tab
  const openAssetTab = async (asset: AssetRecord) => {
    const tabKey = `asset-${asset.assetId}`;

    // Already open — just switch
    if (openAssetTabs.find(t => t.key === tabKey)) {
      setActiveTabKey(tabKey);
      return;
    }

    // Add a loading placeholder tab immediately
    setOpenAssetTabs(prev => [...prev, {
      key: tabKey, asset, loading: true,
      detail: null, books: [], deprn: [], distributions: [], invoices: [], transactions: [],
      categoryBooks: [], categoryName: '', categoryId: '', categoryApiUrl: '',
      activeSubTab: 'general', additionSlaStatus: null,
    }]);
    setActiveTabKey(tabKey);

    try {
      const [det, bks, dep, dist, inv, txn, slaStatus] = await Promise.all([
        getAssetDetail(asset.assetId),
        getAssetBooks(asset.assetId),
        getAssetDeprn(asset.assetId),
        getAssetDistributions(asset.assetId),
        getAssetInvoices(asset.assetId),
        getAssetTransactions(asset.assetId),
        checkSlaAccountingExists('RR_FA_ADDITIONS', asset.assetId, 'FA_ADDITION'),
      ]);

      // Load category info using the assetCategoryId from the detail response
      const catId = (det as any).assetCategoryId || (asset as any).assetCategoryId || '';
      const catApiUrl = catId
        ? `${APEX_DB_CONFIG.baseUrl}/fa/categories/${catId}/books`
        : `${APEX_DB_CONFIG.baseUrl}/fa/categories/(no-category-id)/books`;
      let catName = '';
      let catBooks: CategoryBookRecord[] = [];
      if (catId) {
        const [catDet, catBks] = await Promise.all([
          getCategoryDetail(catId),
          getCategoryBooks(catId),
        ]);
        catName  = catDet.description || '';
        catBooks = catBks.items || [];
      }

      setOpenAssetTabs(prev => prev.map(t => t.key === tabKey ? {
        ...t, loading: false,
        detail:        det.success !== false ? det : null,
        books:         bks.items || [],
        deprn:         dep.items || [],
        distributions: dist.items || [],
        invoices:      inv.items || [],
        transactions:  txn.items || [],
        categoryBooks: catBooks,
        categoryName:  catName,
        categoryId:    catId,
        categoryApiUrl: catApiUrl,
        additionSlaStatus: slaStatus,
      } : t));
    } catch {
      message.error('Failed to load asset details');
      setOpenAssetTabs(prev => prev.map(t => t.key === tabKey ? { ...t, loading: false } : t));
    }
  };

  const refreshAssetTab = async (tabKey: string, asset: AssetRecord) => {
    setOpenAssetTabs(prev => prev.map(t => t.key === tabKey ? { ...t, loading: true } : t));
    try {
      const [det, bks, dep, dist, inv, txn, slaStatus] = await Promise.all([
        getAssetDetail(asset.assetId),
        getAssetBooks(asset.assetId),
        getAssetDeprn(asset.assetId),
        getAssetDistributions(asset.assetId),
        getAssetInvoices(asset.assetId),
        getAssetTransactions(asset.assetId),
        checkSlaAccountingExists('RR_FA_ADDITIONS', asset.assetId, 'FA_ADDITION'),
      ]);
      const catId = (det as any).assetCategoryId || (asset as any).assetCategoryId || '';
      let catName = '';
      let catBooks: CategoryBookRecord[] = [];
      if (catId) {
        const [catDet, catBks] = await Promise.all([getCategoryDetail(catId), getCategoryBooks(catId)]);
        catName  = catDet.description || '';
        catBooks = catBks.items || [];
      }
      setOpenAssetTabs(prev => prev.map(t => t.key === tabKey ? {
        ...t, loading: false,
        detail: det.success !== false ? det : null,
        books: bks.items || [], deprn: dep.items || [],
        distributions: dist.items || [], invoices: inv.items || [], transactions: txn.items || [],
        categoryBooks: catBooks, categoryName: catName, categoryId: catId,
        additionSlaStatus: slaStatus,
      } : t));
      message.success('Asset data refreshed');
    } catch {
      message.error('Failed to refresh asset data');
      setOpenAssetTabs(prev => prev.map(t => t.key === tabKey ? { ...t, loading: false } : t));
    }
  };

  const closeAssetTab = (tabKey: string) => {
    setOpenAssetTabs(prev => prev.filter(t => t.key !== tabKey));
    if (activeTabKey === tabKey) setActiveTabKey('search');
  };

  const onTabEdit = (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
    if (action === 'remove' && typeof targetKey === 'string') closeAssetTab(targetKey);
  };

  const onSubTabChange = (tabKey: string, subTab: string) => {
    setOpenAssetTabs(prev => prev.map(t => t.key === tabKey ? { ...t, activeSubTab: subTab } : t));
  };

  const handleReset = () => {
    form.resetFields();
    setRows([]);
    setTotalCount(0);
    setSearched(false);
    setGridSearch('');
  };

  // Grid quick-search + cost filter (client-side)
  const [gridSearch,  setGridSearch]  = useState('');
  const [costFilter,  setCostFilter]  = useState(true);

  const displayedRows = rows.filter(r => {
    if (costFilter && (parseFloat(r.cost) || 0) <= 0) return false;
    if (gridSearch) {
      const q = gridSearch.toLowerCase();
      return (
        (r.description  || '').toLowerCase().includes(q) ||
        (r.asset_number || r.assetNumber || '').toLowerCase().includes(q) ||
        (r.assetId      || '').toLowerCase().includes(q) ||
        (r.bookTypeCode || '').toLowerCase().includes(q) ||
        (r.assetType    || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalCost = displayedRows.reduce((s, r) => s + (parseFloat(r.cost) || 0), 0);
  const totalNbv  = displayedRows.reduce((s, r) => s + (parseFloat(r.nbv)  || 0), 0);

  // Export assets grid to Excel
  const exportAssetsToExcel = () => {
    const data = displayedRows.map(r => ({
      'Asset Number':      r.asset_number || r.assetNumber || r.assetId,
      'Description':       r.description,
      'Asset Type':        assetTypeLabel(r.assetType || ''),
      'Book':              r.bookTypeCode,
      'Date in Service':   fmtDate(r.datePlacedInService),
      'Cost':              parseFloat(r.cost) || 0,
      'Original Cost':     parseFloat(r.originalCost) || 0,
      'Adjusted Cost':     parseFloat(r.adjustedCost) || 0,
      'Salvage Value':     parseFloat(r.salvageValue) || 0,
      'Deprn Reserve':     parseFloat(r.deprnReserve) || 0,
      'NBV':               parseFloat(r.nbv) || 0,
      'Depreciate':        r.depreciateFlag,
      'Capitalize':        r.capitalizeFlag,
      'Status':            assetStatusLabel(r.retiredFlag),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assets');
    XLSX.writeFile(wb, `assets_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── Table columns ─────────────────────────────────────────────────────────────
  const columns: ColumnsType<AssetRecord> = [
    {
      title: 'Asset Number', key: 'assetNumber', width: 130,
      sorter: (a, b) => (a.asset_number || a.assetNumber || a.assetId).localeCompare(b.asset_number || b.assetNumber || b.assetId),
      render: (_v, record) => (
        <Button type="link" style={{ padding: 0, fontWeight: 600 }} onClick={(e) => { e.stopPropagation(); openAssetTab(record); }}>
          {record.asset_number || record.assetNumber || record.assetId}
        </Button>
      ),
    },
    {
      title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true,
      sorter: (a, b) => (a.description || '').localeCompare(b.description || ''),
    },
    {
      title: 'Type', dataIndex: 'assetType', key: 'assetType', width: 110,
      sorter: (a, b) => (a.assetType || '').localeCompare(b.assetType || ''),
      render: (v) => <Tag style={{ borderRadius: 4, fontSize: 11 }}>{assetTypeLabel(v)}</Tag>,
    },
    {
      title: 'Book', dataIndex: 'bookTypeCode', key: 'bookTypeCode', width: 150, ellipsis: true,
      sorter: (a, b) => (a.bookTypeCode || '').localeCompare(b.bookTypeCode || ''),
    },
    {
      title: 'Date in Service', dataIndex: 'datePlacedInService', key: 'datePlacedInService', width: 130,
      sorter: (a, b) => (a.datePlacedInService || '').localeCompare(b.datePlacedInService || ''),
      render: (v: string) => fmtDate(v),
    },
    {
      title: 'Cost', dataIndex: 'cost', key: 'cost', width: 130, align: 'right' as const,
      sorter: (a, b) => (parseFloat(a.cost) || 0) - (parseFloat(b.cost) || 0),
      render: (v) => formatCurrency(v),
    },
    {
      title: 'NBV', dataIndex: 'nbv', key: 'nbv', width: 130, align: 'right' as const,
      sorter: (a, b) => (parseFloat(a.nbv) || 0) - (parseFloat(b.nbv) || 0),
      render: (v) => formatCurrency(v),
    },
    {
      title: 'Status', dataIndex: 'retiredFlag', key: 'status', width: 90,
      sorter: (a, b) => (a.retiredFlag || '').localeCompare(b.retiredFlag || ''),
      render: (v) => statusTag(v),
    },
    {
      title: 'Acctd', dataIndex: 'accountedStatus', key: 'accountedStatus', width: 100,
      render: (v: string) => v === 'ACCOUNTED'
        ? <Tag color="success" style={{ borderRadius: 4, fontSize: 10 }}><CheckOutlined /> Accounted</Tag>
        : <Tag color="default" style={{ borderRadius: 4, fontSize: 10 }}>Unaccounted</Tag>,
    },
    {
      title: '', key: 'actions', width: 60, align: 'center' as const,
      render: (_: any, record: AssetRecord) => (
        <Tooltip title="Open asset">
          <Button size="small" type="text" icon={<InfoCircleOutlined />} onClick={(e) => { e.stopPropagation(); openAssetTab(record); }} />
        </Tooltip>
      ),
    },
  ];

  // ── Search tab content ────────────────────────────────────────────────────────
  const searchTabContent = (
    <div style={{ padding: 16 }}>
      {/* Search card */}
      <Card
        style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}
        styles={{ body: { padding: '16px 20px' } }}
        title={<Space><FilterOutlined style={{ color: FA_COLOR }} /><Text strong style={{ fontSize: 13 }}>Search Parameters</Text></Space>}
      >
        <Form form={form} layout="vertical" onFinish={() => runSearch(1, pageSize)}>
          <Row gutter={[16, 0]}>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="bookTypeCode" label="Book" style={{ marginBottom: 8 }}>
                <Select allowClear placeholder="All books" showSearch optionFilterProp="children">
                  {bookList.map(b => (
                    <Option key={b.bookTypeCode} value={b.bookTypeCode}>
                      {b.bookTypeCode}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="assetNumber" label="Asset Number" style={{ marginBottom: 8 }}>
                <Input placeholder="e.g. FA-0001" allowClear prefix={<BarcodeOutlined />} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="description" label="Description" style={{ marginBottom: 8 }}>
                <Input placeholder="Contains..." allowClear prefix={<SearchOutlined />} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="assetType" label="Asset Type" style={{ marginBottom: 8 }}>
                <Select allowClear placeholder="All types">
                  <Option value="CAPITALIZED">Capitalized</Option>
                  <Option value="CIP">CIP</Option>
                  <Option value="EXPENSED">Expensed</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="status" label="Status" style={{ marginBottom: 8 }}>
                <Select allowClear placeholder="All">
                  <Option value="ACTIVE">Active</Option>
                  <Option value="RETIRED">Retired</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="category" label="Category" style={{ marginBottom: 8 }}>
                <Input placeholder="Category segment" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} md={8} style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Form.Item style={{ marginBottom: 8, width: '100%' }}>
                <Space>
                  <Button
                    type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}
                    style={{ background: FA_COLOR, borderColor: FA_COLOR }}
                  >
                    Search
                  </Button>
                  <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
                  {lastApiUrl && (
                    <Tooltip title="Show API URL">
                      <Button
                        size="small" icon={<ApiOutlined />}
                        style={{ color: FA_COLOR, borderColor: FA_COLOR }}
                        onClick={() => Modal.info({
                          title: 'API Request — fa/assets',
                          width: 860,
                          content: (
                            <div style={{ marginTop: 8 }}>
                              <Text copyable style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                                {lastApiUrl}
                              </Text>
                            </div>
                          ),
                        })}
                      />
                    </Tooltip>
                  )}
                </Space>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {/* Results table */}
      <Card
        style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        styles={{ body: { padding: 0 } }}
        title={
          searched
            ? <Text strong>Results <Badge count={totalCount} style={{ backgroundColor: FA_COLOR }} /></Text>
            : <Text strong>Assets</Text>
        }
        extra={
          <Space size="small">
            <Space size={4}>
              <Switch
                size="small"
                checked={costFilter}
                onChange={setCostFilter}
                style={costFilter ? { backgroundColor: FA_COLOR } : {}}
              />
              <Typography.Text style={{ fontSize: 12 }}>Cost &gt; 0</Typography.Text>
            </Space>
            <Input
              size="small" allowClear placeholder="Search in grid…"
              prefix={<SearchOutlined style={{ color: REDWOOD.neutral300 }} />}
              style={{ width: 180 }}
              value={gridSearch}
              onChange={(e) => setGridSearch(e.target.value)}
            />
            {rows.length > 0 && (
              <Tooltip title="Export to Excel">
                <Button size="small" icon={<DownloadOutlined />} onClick={exportAssetsToExcel}>
                  Excel
                </Button>
              </Tooltip>
            )}
            {lastApiUrl && (
              <Button
                size="small" icon={<ApiOutlined />}
                style={{ color: FA_COLOR, borderColor: FA_COLOR, fontSize: 11 }}
                onClick={() => setApiModalVisible(true)}
              >
                API
              </Button>
            )}
          </Space>
        }
      >
        <Table<AssetRecord>
          dataSource={displayedRows}
          columns={columns}
          rowKey="assetId"
          loading={loading}
          size="small"
          scroll={{ x: 1100 }}
          locale={{ emptyText: searched ? 'No assets found' : 'Enter search criteria above' }}
          onRow={(record) => ({ onClick: () => openAssetTab(record), style: { cursor: 'pointer' } })}
          pagination={{
            current: page, pageSize, total: totalCount,
            showSizeChanger: true,
            showTotal: (t) => `${t} total${gridSearch ? ` (${displayedRows.length} shown)` : ''}`,
            pageSizeOptions: ['25', '50', '100'],
            onChange: (p, ps) => { setPageSize(ps); runSearch(p, ps); },
          }}
        />
        {displayedRows.length > 0 && (
          <div style={{
            display: 'flex', gap: 32, padding: '12px 20px',
            borderTop: `1px solid ${REDWOOD.neutral200}`,
            background: REDWOOD.neutral100,
            borderRadius: '0 0 12px 12px',
          }}>
            <Statistic
              title={<span style={{ fontSize: 12, color: REDWOOD.neutral500 }}>Total Cost ({displayedRows.length} assets)</span>}
              value={totalCost}
              precision={2}
              valueStyle={{ fontSize: 15, fontWeight: 600, color: FA_COLOR }}
              prefix={<span style={{ fontSize: 13 }}></span>}
            />
            <Statistic
              title={<span style={{ fontSize: 12, color: REDWOOD.neutral500 }}>Total NBV</span>}
              value={totalNbv}
              precision={2}
              valueStyle={{ fontSize: 15, fontWeight: 600, color: '#1677ff' }}
            />
          </div>
        )}
      </Card>
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb + header */}
        <div style={{
          padding: '12px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
        }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/fa">Fixed Assets</Link> },
            { title: 'Manage Assets' },
          ]} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Space align="center">
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: `linear-gradient(135deg, ${FA_COLOR} 0%, #9E5C00 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <DatabaseOutlined style={{ fontSize: 18, color: '#fff' }} />
              </div>
              <div>
                <Title level={5} style={{ margin: 0, lineHeight: 1.2 }}>Asset Workbench</Title>
                <Text type="secondary" style={{ fontSize: 11 }}>Search and manage fixed asset records</Text>
              </div>
            </Space>
            <Button
              type="primary" icon={<PlusOutlined />}
              style={{ background: FA_COLOR, borderColor: FA_COLOR }}
              onClick={() => navigate('/fa/create-asset')}
            >
              New Asset
            </Button>
          </div>
        </div>

        {/* Editable-card tabs */}
        <Tabs
          type="editable-card"
          activeKey={activeTabKey}
          onChange={setActiveTabKey}
          onEdit={onTabEdit}
          hideAdd
          destroyOnHidden
          style={{ background: REDWOOD.surface }}
          tabBarStyle={{
            margin: 0,
            padding: '4px 16px 0',
            background: REDWOOD.neutral200,
            borderBottom: `2px solid ${FA_COLOR}`,
          }}
          items={[
            {
              key: 'search',
              closable: false,
              label: (
                <span style={{
                  fontSize: 12,
                  fontWeight: activeTabKey === 'search' ? 600 : 400,
                  color: activeTabKey === 'search' ? FA_COLOR : REDWOOD.neutral600,
                  padding: '4px 4px',
                }}>
                  <SearchOutlined style={{ marginRight: 6 }} />
                  Search
                  {totalCount > 0 && (
                    <Tag color={FA_COLOR} style={{ fontSize: 10, marginLeft: 8 }}>{totalCount}</Tag>
                  )}
                </span>
              ),
              children: searchTabContent,
            },
            ...openAssetTabs.map(tab => ({
              key: tab.key,
              label: (
                <span style={{
                  fontSize: 12,
                  fontWeight: activeTabKey === tab.key ? 600 : 400,
                  color: activeTabKey === tab.key ? FA_COLOR : REDWOOD.neutral600,
                  maxWidth: 180,
                  display: 'inline-block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  verticalAlign: 'middle',
                }}>
                  {tab.loading && <Spin size="small" style={{ marginRight: 6 }} />}
                  {tab.asset.description.length > 22
                    ? tab.asset.description.substring(0, 22) + '…'
                    : tab.asset.description}
                </span>
              ),
              children: (
                <AssetTabContent
                  key={tab.key}
                  tab={tab}
                  onSubTabChange={onSubTabChange}
                  onRefresh={() => refreshAssetTab(tab.key, tab.asset)}
                  onSlaStatusChange={(tabKey, status) =>
                    setOpenAssetTabs(prev => prev.map(t => t.key === tabKey ? { ...t, additionSlaStatus: status } : t))
                  }
                  setOpenAssetTabs={setOpenAssetTabs}
                />
              ),
            })),
          ]}
        />

        {/* API Response Modal */}
        <Modal
          open={apiModalVisible}
          onCancel={() => setApiModalVisible(false)}
          footer={[
            <Button
              key="copy" size="small"
              icon={apiUrlCopied ? <CheckOutlined /> : <ApiOutlined />}
              onClick={() => {
                navigator.clipboard.writeText(lastApiUrl || '');
                setApiUrlCopied(true);
                setTimeout(() => setApiUrlCopied(false), 2000);
              }}
            >
              {apiUrlCopied ? 'Copied' : 'Copy URL'}
            </Button>,
            <Button key="close" size="small" type="primary" onClick={() => setApiModalVisible(false)}>
              Close
            </Button>,
          ]}
          width={720}
          title={<Space><ApiOutlined style={{ color: FA_COLOR }} /><span>Last API Call — fa/assets</span></Space>}
          styles={{ body: { padding: '12px 16px' } }}
        >
          <div style={{ marginBottom: 10 }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Endpoint (GET)</Text>
            <div style={{
              fontFamily: 'monospace', fontSize: 11,
              background: '#f5f5f5', border: '1px solid #e0e0e0',
              borderRadius: 4, padding: '6px 10px', wordBreak: 'break-all',
            }}>
              {lastApiUrl}
            </div>
          </div>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Response</Text>
          <pre style={{
            background: '#1a1a1a', color: '#e8e8e8',
            padding: '10px 14px', borderRadius: 6,
            fontSize: 11, fontFamily: 'monospace',
            maxHeight: 460, overflow: 'auto',
            margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {apiResponse}
          </pre>
        </Modal>
      </Content>

      
    </Layout>
  );
};

export default ManageAssets;
