import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Layout,
  Card,
  Table,
  Button,
  Space,
  Typography,
  Breadcrumb,
  Tag,
  Row,
  Col,
  Spin,
  Alert,
  Tabs,
  Select,
  Tooltip,
  Statistic,
  Empty,
  Modal,
  Input,
  AutoComplete,
  message,
  Switch,
  Descriptions,
} from 'antd';
import {
  HomeOutlined,
  TableOutlined,
  ReloadOutlined,
  PlusOutlined,
  CloseOutlined,
  FilterOutlined,
  FileTextOutlined,
  DollarOutlined,
  BankOutlined,
  CalendarOutlined,
  DragOutlined,
  ExpandAltOutlined,
  ApiOutlined,
  FileExcelOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  BarsOutlined,
  BarChartOutlined,
  ThunderboltOutlined,
  ApartmentOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { APEX_DB_CONFIG } from '../../config/api.config';
import { Divider } from 'antd';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { exportRrTBToExcel, exportFusionTBToExcel, exportBothTBToExcel } from '../../utils/tbExcelExport';
import AccountSelector from '../../components/AccountSelector';

const { Content } = Layout;
const { Title, Text } = Typography;

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',
  primaryDark: '#A33B2C',
  success: '#1D7B4D',
  warning: '#D4A800',
  error: '#C74634',
  info: '#0572CE',
  neutral: '#383838',
  surface: '#FFFFFF',
  surfaceSecondary: '#F7F7F7',
  border: '#E5E5E5',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B6B6B',
};

// Types
interface GLBalanceRecord {
  period_type: string | null;
  period_name: string;
  actual_flag: string;
  period_year: string;
  period_num: string;
  ledger_id: string;
  company: string;
  lob: string;
  department: string;
  account: string;
  account_desc: string;
  sub_account: string;
  analysis: string;
  intercompany: string;
  future1: string | null;
  future2: string | null;
  account_type: string;
  currency: string;
  opening_balance: number;
  period_activity: number | null;
  closing_balance: number;
  debit: number;
  credit: number;
  currency_code: string | null;
}

interface PeriodInfo {
  period_name_id: string;
  ledger_name: string;
  app: string;
  application_name: string;
  status: string;
  start_date: string;
  end_date: string;
  period_year: number;
  period_number: number;
  adj_flag: string;
}

interface SegmentConfig {
  key: string;
  label: string;
}

// Available segments for pivot
const AVAILABLE_SEGMENTS: SegmentConfig[] = [
  { key: 'company', label: 'Company' },
  { key: 'lob', label: 'LOB' },
  { key: 'department', label: 'Department' },
  { key: 'sub_account', label: 'Sub Account' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'intercompany', label: 'Intercompany' },
];

interface RrTBRecord {
  account_combination: string;
  company: string;
  lob: string;
  department: string;
  account: string;
  account_desc: string;
  sub_account: string;
  analysis: string;
  intercompany: string;
  account_type: string;   // A / L / O / R / E
  currency_code: string;
  // PTD columns (from /standard endpoint) — Accounted (functional) currency
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  ytd_net: number;
  // PTD Entered (transaction) currency
  entered_opening: number;
  entered_debit: number;
  entered_credit: number;
  entered_closing: number;
  // YTD columns — Accounted (functional) currency
  ytd_opening: number;
  ytd_debit: number;
  ytd_credit: number;
  // YTD Entered currency
  ytd_entered_opening: number;
  ytd_entered_debit: number;
  ytd_entered_credit: number;
}

interface TabData {
  key: string;
  periodName: string;
  ledgerName: string;
  tabType: 'fusion' | 'reerp' | 'reerp-dynamic' | 'reerp-ytd';
  data: GLBalanceRecord[];
  rrData: RrTBRecord[];
  rrGenerating: boolean;
  loading: boolean;
  error: string | null;
  companies: string[];
  currencies: string[];
  selectedCompany: string | null;
  selectedCurrency: string | null;
  segmentsBefore: string[];
  segmentsAfter: string[];
  gridSearch: string;
  showEntered: boolean;
}

interface ApiCallInfo {
  label: string;
  url: string;
  method: string;
  status: number | null;
  ok: boolean | null;
  durationMs: number | null;
  running: boolean;
  body: string;
}

interface PivotRow {
  key: string;
  account: string;
  account_desc: string;
  opening_balance: number;
  debit: number;
  credit: number;
  closing_balance: number;
  segmentCount: number;
  rawRows: GLBalanceRecord[];
  [key: string]: string | number | GLBalanceRecord[];
}

// Lines Summary types
interface LineSummaryRow {
  seg1_company: string | null;
  seg4_account: string | null;
  ledger_name:  string | null;
  period_name:  string | null;
  currency:     string | null;
  total_dr:     number;
  total_cr:     number;
  net_amount:   number;
  line_count:   number;
}

// ReERP vs Fusion reconciliation row
interface ReconRecord {
  account:      string;
  account_desc: string;
  fusionOpening: number; fusionDebit: number; fusionCredit: number; fusionClosing: number;
  rrOpening:    number; rrDebit:    number; rrCredit:    number; rrClosing:    number;
  diffOpening:  number; diffDebit:  number; diffCredit:  number; diffClosing:  number;
  matched:  boolean;
  inFusion: boolean;
  inRr:     boolean;
}

const TrialBalance: React.FC = () => {
  // Periods list state
  const [periods, setPeriods] = useState<PeriodInfo[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [periodsError, setPeriodsError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // Tabs state
  const [activeTab, setActiveTab] = useState('periods');
  const [tabs, setTabs] = useState<TabData[]>([]);

  // Detail modal state
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailModalData, setDetailModalData] = useState<{ account: string; account_desc: string; rows: GLBalanceRecord[] } | null>(null);

  // Ledger state
  const [ledgerOptions, setLedgerOptions] = useState<string[]>([]);
  const [loadingLedgers, setLoadingLedgers] = useState(false);
  const [selectedLedger, setSelectedLedger] = useState<string>('BUIMERC LEDGER');

  // API panel state

  // Row selection per tab (for revaluation)
  const [tabSelections, setTabSelections] = useState<Record<string, string[]>>({});

  // Revaluation modal state
  const [revalVisible,         setRevalVisible]         = useState(false);
  const [revalTabKey,          setRevalTabKey]          = useState('');
  const [revalAccount,         setRevalAccount]         = useState('');
  const [revalRates,           setRevalRates]           = useState<Record<string, string>>({});
  const [revalGainCombo,       setRevalGainCombo]       = useState('');
  const [revalLossCombo,       setRevalLossCombo]       = useState('');
  const [revalComboPickerOpen, setRevalComboPickerOpen] = useState(false);
  const [revalComboPickerFor,  setRevalComboPickerFor]  = useState<'gain'|'loss'>('gain');
  const [revalComboSearch,     setRevalComboSearch]     = useState('');
  const [revalPreviewRows,     setRevalPreviewRows]     = useState<
    { lineNum: number; combo: string; desc: string; comment: string; dr: number; cr: number }[]
  >([]);
  const [revalAcctSelectorOpen,    setRevalAcctSelectorOpen]    = useState(false);
  const [revalAcctSelectorLineNum, setRevalAcctSelectorLineNum] = useState<number | null>(null);
  const [apiPanelVisible, setApiPanelVisible] = useState(false);
  const [apiCalls, setApiCalls] = useState<Record<string, ApiCallInfo>>({
    ledgers:      { label: 'GET Ledgers',            url: '', method: 'GET',  status: null, ok: null, durationMs: null, running: false, body: '' },
    periods:      { label: 'GET Periods',             url: '', method: 'GET',  status: null, ok: null, durationMs: null, running: false, body: '' },
    trialBalance: { label: 'GET Trial Balance',       url: '', method: 'GET',  status: null, ok: null, durationMs: null, running: false, body: '' },
    rrGenerate:   { label: 'POST RR TB Generate',     url: '', method: 'POST', status: null, ok: null, durationMs: null, running: false, body: '' },
    rrFetch:      { label: 'GET RR Trial Balance',    url: '', method: 'GET',  status: null, ok: null, durationMs: null, running: false, body: '' },
    linesSummary: { label: 'GET Lines Summary',       url: '', method: 'GET',  status: null, ok: null, durationMs: null, running: false, body: '' },
    rrDynamic:    { label: 'GET RR Dynamic TB',        url: '', method: 'GET',  status: null, ok: null, durationMs: null, running: false, body: '' },
  });

  // Lines Summary state
  const [lsVisible,  setLsVisible]  = useState(false);
  const [lsLoading,  setLsLoading]  = useState(false);
  const [lsData,     setLsData]     = useState<LineSummaryRow[]>([]);
  const [lsPeriod,   setLsPeriod]   = useState<string | null>(null);
  const [lsCompany,  setLsCompany]  = useState<string | null>(null);
  const [lsLedger,   setLsLedger]   = useState<string | null>(null);
  const [lsCurrency, setLsCurrency] = useState<string | null>(null);
  const [lsSearch,   setLsSearch]   = useState('');
  const [lsApiUrl,   setLsApiUrl]   = useState('');
  const [lsError,    setLsError]    = useState<string | null>(null);
  const [lsReconMap,  setLsReconMap]  = useState<Map<string, { tbDr: number; tbCr: number; matched: boolean }>>(new Map());
  const [lsReconDone, setLsReconDone] = useState(false);
  const [lsDetailRow, setLsDetailRow] = useState<{
    account: string; company: string; ledger: string | null;
    accountDesc: string; combinations: string[];
    lsDr: number; lsCr: number; lsNet: number; lsLines: number;
    tbRecords: GLBalanceRecord[];
  } | null>(null);
  const [lsDetailCcy, setLsDetailCcy] = useState<string | null>(null);

  // ── TB Drill-down: Combinations modal ────────────────────
  const [drillComboVisible, setDrillComboVisible] = useState(false);
  const [drillComboRows,    setDrillComboRows]    = useState<RrTBRecord[]>([]);
  const [drillComboAccount, setDrillComboAccount] = useState('');
  const [drillComboSearch,  setDrillComboSearch]  = useState('');
  const [drillComboLedger,  setDrillComboLedger]  = useState('');
  const [drillComboPeriod,  setDrillComboPeriod]  = useState('');

  // ── All companies from COA value set ────────────────────────
  const [allCompanies, setAllCompanies] = useState<{ value: string; label: string }[]>([]);

  // ── TB Drill-down: Journal Lines modal ───────────────────
  interface JournalLine {
    line_id: number;
    line_num: number;
    je_header_id: number;
    je_name: string;
    je_description: string;
    period_name: string;
    ledger_name: string;
    source: string;
    category: string;
    status: string;
    effective_date: string;
    account_combination: string;
    company: string;
    account: string;
    currency_code: string;
    entered_dr: number;
    entered_cr: number;
    accounted_dr: number;
    accounted_cr: number;
    line_description: string;
  }
  const [drillJnlVisible,  setDrillJnlVisible]  = useState(false);
  const [drillJnlLoading,  setDrillJnlLoading]  = useState(false);
  const [drillJnlData,     setDrillJnlData]     = useState<JournalLine[]>([]);
  const [drillJnlAccount,  setDrillJnlAccount]  = useState('');
  const [drillJnlCombo,    setDrillJnlCombo]    = useState('');
  const [drillJnlPeriod,   setDrillJnlPeriod]   = useState('');
  const [drillJnlLedger,   setDrillJnlLedger]   = useState('');
  const [drillJnlSearch,   setDrillJnlSearch]   = useState('');
  const [drillJnlError,    setDrillJnlError]    = useState<string | null>(null);

  // ReERP ↔ Fusion reconciliation state
  const [reconVisible,  setReconVisible]  = useState(false);
  const [reconData,     setReconData]     = useState<ReconRecord[]>([]);
  const [reconPeriod,   setReconPeriod]   = useState('');
  const [reconFilter,   setReconFilter]   = useState<'all' | 'diff' | 'matched'>('all');
  const [reconSearch,   setReconSearch]   = useState('');

  // Get unique years from periods
  const availableYears = useMemo(() => {
    const years = [...new Set(periods.map(p => p.period_year))].sort((a, b) => b - a);
    return years;
  }, [periods]);

  // Filter periods by year
  const filteredPeriods = useMemo(() => {
    if (!selectedYear) return periods;
    return periods.filter(p => p.period_year === selectedYear);
  }, [periods, selectedYear]);

  // Track an API call for the panel
  const trackCall = (key: string, label: string, url: string) => {
    setApiCalls(prev => ({ ...prev, [key]: { ...prev[key], label, url, method: 'GET', status: null, ok: null, durationMs: null, running: true, body: '' } }));
    return performance.now();
  };
  const resolveCall = (key: string, t0: number, status: number, ok: boolean, body: string) => {
    setApiCalls(prev => ({ ...prev, [key]: { ...prev[key], status, ok, durationMs: Math.round(performance.now() - t0), running: false, body } }));
  };

  // Test an API endpoint directly from the panel
  const testEndpoint = async (key: string) => {
    const call = apiCalls[key];
    if (!call.url) { message.warning('Load a period first to capture the URL'); return; }
    setApiCalls(prev => ({ ...prev, [key]: { ...prev[key], status: null, ok: null, body: '', running: true } }));
    const t0 = performance.now();
    try {
      const res = await fetch(call.url);
      const text = await res.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch (_) {}
      setApiCalls(prev => ({ ...prev, [key]: { ...prev[key], status: res.status, ok: res.ok, durationMs: Math.round(performance.now() - t0), running: false, body: pretty.slice(0, 2000) } }));
    } catch (e: any) {
      setApiCalls(prev => ({ ...prev, [key]: { ...prev[key], status: 0, ok: false, durationMs: Math.round(performance.now() - t0), running: false, body: e.message } }));
    }
  };

  // Fetch ledger list from APEX
  const fetchLedgers = useCallback(async () => {
    setLoadingLedgers(true);
    const url = `${APEX_DB_CONFIG.baseUrl}/${APEX_DB_CONFIG.endpoints.getLedgerName}`;
    const t0 = trackCall('ledgers', 'GET Ledgers', url);
    try {
      const res = await fetch(url);
      const data = await res.json();
      const names: string[] = (data.items || []).map((i: any) => i.ledger_name).filter(Boolean);
      resolveCall('ledgers', t0, res.status, res.ok, `${names.length} ledgers`);
      setLedgerOptions(names);
      if (names.length > 0 && !names.includes(selectedLedger)) {
        setSelectedLedger(names[0]);
      }
    } catch (e: any) {
      resolveCall('ledgers', t0, 0, false, e.message);
    } finally {
      setLoadingLedgers(false);
    }
  }, [selectedLedger]);

  // Fetch periods list from APEX periods status endpoint
  const fetchPeriods = useCallback(async () => {
    setLoadingPeriods(true);
    setPeriodsError(null);

    try {
      const params = new URLSearchParams({
        'P_APPLICATION_NAME': 'General Ledger',
        'P_LEDGER_NAME': selectedLedger,
      });
      const url = `${APEX_DB_CONFIG.baseUrl}/${APEX_DB_CONFIG.endpoints.periodsStatus}?${params}`;
      const t0 = trackCall('periods', `GET Periods — ${selectedLedger}`, url);
      const response = await fetch(url);

      if (!response.ok) {
        resolveCall('periods', t0, response.status, false, response.statusText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      resolveCall('periods', t0, response.status, true, `${JSON.parse(text)?.items?.length ?? '?'} periods returned`);
      const data = JSON.parse(text);
      const items: PeriodInfo[] = data.items || [];

      // Sort by year desc, then by period_number desc
      const sortedPeriods = items.sort((a, b) => {
        if (a.period_year !== b.period_year) {
          return b.period_year - a.period_year;
        }
        return b.period_number - a.period_number;
      });

      setPeriods(sortedPeriods);

      // Auto-select most recent year
      if (sortedPeriods.length > 0 && !selectedYear) {
        setSelectedYear(sortedPeriods[0].period_year);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to fetch periods';
      setPeriodsError(errorMsg);
    } finally {
      setLoadingPeriods(false);
    }
  }, [selectedYear, selectedLedger]);

  // Fetch trial balance data for a specific period
  const fetchTrialBalance = useCallback(async (periodName: string) => {
    const tabKey = `tb-${periodName}`;

    // Check if tab already exists
    const existingTab = tabs.find(t => t.key === tabKey);
    if (existingTab) {
      setActiveTab(tabKey);
      return;
    }

    // Create new tab in loading state
    const newTab: TabData = {
      key: tabKey,
      periodName,
      ledgerName: selectedLedger,
      tabType: 'fusion',
      data: [],
      rrData: [],
      rrGenerating: false,
      loading: true,
      error: null,
      companies: [],
      currencies: [],
      selectedCompany: '01',
      selectedCurrency: 'AED',
      segmentsBefore: [],
      segmentsAfter: [],
      gridSearch: '',
      showEntered: false,
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTab(tabKey);

    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/${APEX_DB_CONFIG.endpoints.glBalances}?p_period_name=${encodeURIComponent(periodName)}`;
      const t0 = trackCall('trialBalance', `GET Trial Balance — ${periodName}`, url);
      const response = await fetch(url);

      if (!response.ok) {
        resolveCall('trialBalance', t0, response.status, false, response.statusText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      const data = JSON.parse(text);
      const items: GLBalanceRecord[] = data.items || [];
      resolveCall('trialBalance', t0, response.status, true, `${items.length} rows returned`);

      // Extract unique companies and currencies from actual JSON result
      const companies = [...new Set(items.map(i => i.company).filter(Boolean))].sort();
      const currencies = [...new Set(items.map(i => i.currency || i.currency_code).filter(Boolean))].sort() as string[];

      setTabs(prev => prev.map(t =>
        t.key === tabKey
          ? { ...t, data: items, loading: false, companies, currencies }
          : t
      ));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to fetch trial balance';
      setTabs(prev => prev.map(t =>
        t.key === tabKey
          ? { ...t, loading: false, error: errorMsg }
          : t
      ));
    }
  }, [tabs]);

  // Fetch + generate ReERP Trial Balance for a period
  const fetchRrTrialBalance = useCallback(async (record: PeriodInfo) => {
    const tabKey = `rr-${record.period_name_id}`;

    const existingTab = tabs.find(t => t.key === tabKey);
    if (existingTab) { setActiveTab(tabKey); return; }

    const newTab: TabData = {
      key: tabKey,
      periodName: `ReERP: ${record.period_name_id}`,
      ledgerName: record.ledger_name,
      tabType: 'reerp',
      data: [],
      rrData: [],
      rrGenerating: true,
      loading: true,
      error: null,
      companies: [],
      currencies: [],
      selectedCompany: null,
      selectedCurrency: null,
      segmentsBefore: [],
      segmentsAfter: [],
      gridSearch: '',
      showEntered: false,
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTab(tabKey);

    try {
      // Step 1: Generate TB for this period
      // Pass fiscal_year / fiscal_period from the period record so the
      // ORDS handler can sync RR_GL_FISCAL_PERIODS before calling GENERATE_TB.
      // Do NOT pass p_period_year — GENERATE_TB derives fiscal year from the
      // periods table; passing a fiscal year here would mismatch the calendar
      // fallback if the table isn't populated yet.
      const genUrl = `${APEX_DB_CONFIG.baseUrl}/${APEX_DB_CONFIG.endpoints.rrTrialBalanceGenerate}`;
      const t0gen = trackCall('rrGenerate', `POST RR TB Generate — ${record.period_name_id}`, genUrl);
      setApiCalls(prev => ({ ...prev, rrGenerate: { ...prev.rrGenerate, method: 'POST' } }));
      const genRes = await fetch(genUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          p_ledger_name:   record.ledger_name,
          p_period_name:   record.period_name_id,
          p_fiscal_year:   record.period_year,
          p_fiscal_period: record.period_number,
        }),
      });
      const genData = await genRes.json();
      resolveCall('rrGenerate', t0gen, genRes.status, genRes.ok,
        genData.message || (genData.success === false ? (genData.error_msg || 'Generation failed') : JSON.stringify(genData).slice(0, 300)));
      if (genData.success === false) throw new Error(genData.error_msg || genData.message || 'Generation failed');

      setTabs(prev => prev.map(t =>
        t.key === tabKey ? { ...t, rrGenerating: false } : t
      ));

      // Step 2: Fetch the generated rows in standard TB format
      const fetchUrl = `${APEX_DB_CONFIG.baseUrl}/${APEX_DB_CONFIG.endpoints.rrTrialBalanceStandard}`
        + `?ledger_name=${encodeURIComponent(record.ledger_name)}`
        + `&period_name=${encodeURIComponent(record.period_name_id)}`
        + `&limit=5000`;
      const t0fetch = trackCall('rrFetch', `GET RR TB Standard — ${record.period_name_id}`, fetchUrl);
      const res = await fetch(fetchUrl, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      resolveCall('rrFetch', t0fetch, res.status, res.ok, `${(data.items || []).length} rows`);
      const items: RrTBRecord[] = (data.items || []) as RrTBRecord[];

      const companies = [...new Set(items.map(i => i.company).filter(Boolean))].sort();
      const currencies = [...new Set(items.map(i => i.currency_code).filter(Boolean))].sort();

      setTabs(prev => prev.map(t =>
        t.key === tabKey
          ? { ...t, rrData: items, loading: false, companies, currencies }
          : t
      ));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate ReERP TB';
      setTabs(prev => prev.map(t =>
        t.key === tabKey ? { ...t, loading: false, rrGenerating: false, error: msg } : t
      ));
    }
  }, [tabs]);

  // Fetch ReERP Dynamic TB — calls /standard directly (no generate step)
  const fetchDynamicTB = useCallback(async (record: PeriodInfo) => {
    const tabKey = `rr-dyn-${record.period_name_id}`;

    const existingTab = tabs.find(t => t.key === tabKey);
    if (existingTab) { setActiveTab(tabKey); return; }

    const newTab: TabData = {
      key: tabKey,
      periodName: `Dynamic: ${record.period_name_id}`,
      ledgerName: record.ledger_name,
      tabType: 'reerp-dynamic',
      data: [],
      rrData: [],
      rrGenerating: false,
      loading: true,
      error: null,
      companies: [],
      currencies: [],
      selectedCompany: null,
      selectedCurrency: null,
      segmentsBefore: [],
      segmentsAfter: [],
      gridSearch: '',
      showEntered: false,
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTab(tabKey);

    try {
      // Drop period_year: PeriodInfo.period_year is the calendar year but the
      // view uses FISCAL_YEAR (e.g. Jul-23 → calendar 2023, fiscal 2024).
      // period_name is already unique per month, so filtering by it alone
      // is sufficient and avoids the fiscal/calendar year mismatch.
      const fetchUrl = `${APEX_DB_CONFIG.baseUrl}/${APEX_DB_CONFIG.endpoints.rrTrialBalanceStandard}`
        + `?ledger_name=${encodeURIComponent(record.ledger_name)}`
        + `&period_name=${encodeURIComponent(record.period_name_id)}`
        + `&limit=10000`;
      const t0 = trackCall('rrDynamic', `GET RR Dynamic TB — ${record.period_name_id}`, fetchUrl);
      const res = await fetch(fetchUrl, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      resolveCall('rrDynamic', t0, res.status, res.ok, `${(data.items || []).length} rows`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const items: RrTBRecord[] = (data.items || []) as RrTBRecord[];

      const companies = [...new Set(items.map(i => i.company).filter(Boolean))].sort();
      const currencies = [...new Set(items.map(i => i.currency_code).filter(Boolean))].sort();

      setTabs(prev => prev.map(t =>
        t.key === tabKey
          ? { ...t, rrData: items, loading: false, companies, currencies }
          : t
      ));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch Dynamic TB';
      setTabs(prev => prev.map(t =>
        t.key === tabKey ? { ...t, loading: false, error: msg } : t
      ));
    }
  }, [tabs]);

  // Fetch Dynamic YTD TB — same /standard endpoint, displayed in YTD columns
  const fetchDynamicYtdTB = useCallback(async (record: PeriodInfo) => {
    const tabKey = `rr-ytd-${record.period_name_id}`;
    const existingTab = tabs.find(t => t.key === tabKey);
    if (existingTab) { setActiveTab(tabKey); return; }

    const newTab: TabData = {
      key: tabKey,
      periodName: `YTD: ${record.period_name_id}`,
      ledgerName: record.ledger_name,
      tabType: 'reerp-ytd',
      data: [], rrData: [], rrGenerating: false, loading: true, error: null,
      companies: [], currencies: [],
      selectedCompany: null, selectedCurrency: null,
      segmentsBefore: [], segmentsAfter: [], gridSearch: '', showEntered: false,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTab(tabKey);

    try {
      const fetchUrl = `${APEX_DB_CONFIG.baseUrl}/${APEX_DB_CONFIG.endpoints.rrTrialBalanceStandard}`
        + `?ledger_name=${encodeURIComponent(record.ledger_name)}`
        + `&period_name=${encodeURIComponent(record.period_name_id)}`
        + `&limit=10000`;
      const res = await fetch(fetchUrl, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const items: RrTBRecord[] = (data.items || []) as RrTBRecord[];
      const companies = [...new Set(items.map(i => i.company).filter(Boolean))].sort();
      const currencies = [...new Set(items.map(i => i.currency_code).filter(Boolean))].sort();
      setTabs(prev => prev.map(t =>
        t.key === tabKey ? { ...t, rrData: items, loading: false, companies, currencies } : t
      ));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch YTD TB';
      setTabs(prev => prev.map(t =>
        t.key === tabKey ? { ...t, loading: false, error: msg } : t
      ));
    }
  }, [tabs]);

  // Close a tab
  const closeTab = useCallback((tabKey: string) => {
    if (tabKey === 'lines-summary') {
      setLsVisible(false);
      if (activeTab === 'lines-summary') setActiveTab('periods');
      return;
    }
    setTabs(prev => prev.filter(t => t.key !== tabKey));
    if (activeTab === tabKey) setActiveTab('periods');
  }, [activeTab]);

  // ── TB Drill: open Combinations modal ───────────────────
  const openDrillCombo = useCallback((
    account: string,
    rrData: RrTBRecord[],
    ledgerName: string,
    periodName: string,
  ) => {
    setDrillComboAccount(account);
    setDrillComboRows(rrData.filter(r => r.account === account));
    setDrillComboLedger(ledgerName);
    setDrillComboPeriod(periodName);
    setDrillComboSearch('');
    setDrillComboVisible(true);
  }, []);

  // ── TB Drill: fetch Journal Lines for an account + period ─
  const fetchDrillJournalLines = useCallback(async (
    ledgerName: string,
    periodName: string,
    account: string,
    accountCombination: string | null,
  ) => {
    setDrillJnlLedger(ledgerName);
    setDrillJnlPeriod(periodName);
    setDrillJnlAccount(account);
    setDrillJnlCombo(accountCombination || '');
    setDrillJnlSearch('');
    setDrillJnlError(null);
    setDrillJnlData([]);
    setDrillJnlLoading(true);
    setDrillJnlVisible(true);

    try {
      const params = new URLSearchParams({
        ledger_name: ledgerName,
        period_name: periodName,
        account,
        limit: '5000',
      });
      if (accountCombination) params.set('account_combination', accountCombination);
      const url = `${APEX_DB_CONFIG.baseUrl}/${APEX_DB_CONFIG.endpoints.rrTrialBalanceLines}?${params}`;
      const res  = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      setDrillJnlData((data.items || []) as any[]);
    } catch (err) {
      setDrillJnlError(err instanceof Error ? err.message : 'Failed to load journal lines');
    } finally {
      setDrillJnlLoading(false);
    }
  }, []);

  // ── Lines Summary ────────────────────────────────────────
  const fetchLinesSummary = useCallback(async (period: string | null, company: string | null) => {
    if (!period) { message.warning('Select a period first'); return; }
    setLsLoading(true);
    setLsError(null);
    const params = new URLSearchParams({ period_name: period, limit: '5000' });
    if (company) params.set('company', company);
    const url = `${APEX_DB_CONFIG.baseUrl}/${APEX_DB_CONFIG.endpoints.glLinesSummary}?${params}`;
    setLsApiUrl(url);
    const t0 = trackCall('linesSummary', `GET Lines Summary — ${period}`, url);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const json = await res.json();
      resolveCall('linesSummary', t0, res.status, true, `${(json.items || []).length} rows`);
      setLsData(json.items || []);
    } catch (e: any) {
      resolveCall('linesSummary', t0, 0, false, e.message);
      setLsError(e.message);
    } finally {
      setLsLoading(false);
    }
  }, []);

  const handleOpenLinesSummary = useCallback(() => {
    const activeTBTab = tabs.find(t => t.key === activeTab);
    const periodHint  = activeTBTab?.periodName ?? null;
    if (periodHint && !lsPeriod) setLsPeriod(periodHint);
    setLsVisible(true);
    setActiveTab('lines-summary');
  }, [tabs, activeTab, lsPeriod]);

  const handleReconcile = useCallback(() => {
    if (!lsPeriod) { message.warning('Select a period first'); return; }
    if (!lsData.length) { message.warning('Fetch Lines Summary data first'); return; }

    // Find the GL TB tab for this period
    const tbTab = tabs.find(t => t.periodName === lsPeriod);
    if (!tbTab || !tbTab.data.length) {
      message.warning(`Open the GL Trial Balance tab for ${lsPeriod} first`);
      return;
    }

    // Build TB map: company|account → { dr, cr } (sum all rows — TB debit/credit are functional currency)
    const tbMap = new Map<string, { dr: number; cr: number }>();
    for (const rec of tbTab.data) {
      const key  = `${(rec.company || '').trim()}|${(rec.account || '').trim()}`;
      const prev = tbMap.get(key) ?? { dr: 0, cr: 0 };
      tbMap.set(key, { dr: prev.dr + (rec.debit || 0), cr: prev.cr + (rec.credit || 0) });
    }

    // Aggregate LS data (ACCOUNTED_DR/CR are functional currency — sum all currencies)
    const lsAcctMap = new Map<string, { dr: number; cr: number }>();
    for (const row of lsData) {
      const key  = `${(row.seg1_company || '').trim()}|${(row.seg4_account || '').trim()}|${(row.ledger_name || '').trim()}`;
      const prev = lsAcctMap.get(key) ?? { dr: 0, cr: 0 };
      lsAcctMap.set(key, { dr: prev.dr + row.total_dr, cr: prev.cr + row.total_cr });
    }

    // Build recon map keyed by company|account|ledger
    const newMap = new Map<string, { tbDr: number; tbCr: number; matched: boolean }>();
    for (const [key, ls] of lsAcctMap) {
      const [company, account] = key.split('|');
      const tb = tbMap.get(`${company}|${account}`);
      if (!tb) {
        newMap.set(key, { tbDr: 0, tbCr: 0, matched: false });
      } else {
        newMap.set(key, { tbDr: tb.dr, tbCr: tb.cr, matched: Math.abs(tb.dr - ls.dr) < 0.01 && Math.abs(tb.cr - ls.cr) < 0.01 });
      }
    }

    setLsReconMap(newMap);
    setLsReconDone(true);
    const matched   = [...newMap.values()].filter(v => v.matched).length;
    const unmatched = newMap.size - matched;
    message.info(`Reconciliation: ${matched} matched ✓, ${unmatched} unmatched ✗`);
  }, [lsPeriod, lsData, tabs]);

  // ── ReERP ↔ Fusion account-level reconciliation ────────────────────────
  const handleRrReconcile = useCallback((tab: TabData) => {
    const periodName = tab.periodName.replace(/^(?:ReERP|Dynamic):\s*/, '');

    // Find the Fusion TB tab for this period
    const fusionTab = tabs.find(t => t.tabType === 'fusion' && t.periodName === periodName);
    if (!fusionTab) {
      message.warning(
        `Open "Fusion TB" for ${periodName} first, then click Reconcile`,
        4,
      );
      return;
    }
    if (!fusionTab.data.length) {
      message.warning('Fusion TB has no data loaded for this period');
      return;
    }

    const TOLERANCE = 0.005;

    // Fusion TB stores everything in functional currency (AED) → filter to AED.
    // Dynamic TB uses ENTERED currency codes (e.g. INR for Indian entries) even
    // though the ACCOUNTED amounts are already in the functional currency (AED).
    // So we must NOT filter the ReERP side by currency — sum all currencies,
    // which gives the same total as Fusion AED.
    const FUSION_CURRENCY = 'AED';

    // Aggregate Fusion TB by account — AED (functional currency) only
    type Agg = { opening: number; debit: number; credit: number; closing: number; desc: string };
    const fusionMap = new Map<string, Agg>();
    fusionTab.data.forEach(r => {
      if (tab.selectedCompany && r.company !== tab.selectedCompany) return;
      if ((r.currency || r.currency_code) !== FUSION_CURRENCY) return;
      const prev = fusionMap.get(r.account) ?? { opening: 0, debit: 0, credit: 0, closing: 0, desc: r.account_desc || '' };
      fusionMap.set(r.account, {
        opening: prev.opening + (r.opening_balance || 0),
        debit:   prev.debit   + (r.debit           || 0),
        credit:  prev.credit  + (r.credit          || 0),
        closing: prev.closing + (r.closing_balance || 0),
        desc:    r.account_desc || prev.desc,
      });
    });

    // Aggregate ReERP TB by account — ALL currencies summed
    // (accounted amounts are already in functional currency regardless of the
    // entered currency code stored on the line)
    const rrMap = new Map<string, Agg>();
    tab.rrData.forEach(r => {
      if (tab.selectedCompany && r.company !== tab.selectedCompany) return;
      const prev = rrMap.get(r.account) ?? { opening: 0, debit: 0, credit: 0, closing: 0, desc: r.account_desc || '' };
      rrMap.set(r.account, {
        opening: prev.opening + (r.opening || 0),
        debit:   prev.debit   + (r.debit   || 0),
        credit:  prev.credit  + (r.credit  || 0),
        closing: prev.closing + (r.closing || 0),
        desc:    r.account_desc || prev.desc,
      });
    });

    const allAccounts = new Set([...fusionMap.keys(), ...rrMap.keys()]);
    const records: ReconRecord[] = Array.from(allAccounts)
      .map(account => {
        const f  = fusionMap.get(account) ?? { opening: 0, debit: 0, credit: 0, closing: 0, desc: '' };
        const rr = rrMap.get(account)     ?? { opening: 0, debit: 0, credit: 0, closing: 0, desc: '' };
        const dO = rr.opening - f.opening;
        const dD = rr.debit   - f.debit;
        const dC = rr.credit  - f.credit;
        const dCl= rr.closing - f.closing;
        return {
          account,
          account_desc:  rr.desc || f.desc,
          fusionOpening: f.opening,  fusionDebit: f.debit,  fusionCredit: f.credit,  fusionClosing: f.closing,
          rrOpening:    rr.opening,  rrDebit:    rr.debit,  rrCredit:    rr.credit,  rrClosing:    rr.closing,
          diffOpening:   dO,  diffDebit: dD,  diffCredit: dC,  diffClosing: dCl,
          matched:  Math.abs(dO) < TOLERANCE && Math.abs(dD) < TOLERANCE &&
                    Math.abs(dC) < TOLERANCE && Math.abs(dCl) < TOLERANCE,
          inFusion: fusionMap.has(account),
          inRr:     rrMap.has(account),
        };
      })
      .sort((a, b) => a.account.localeCompare(b.account));

    setReconData(records);
    setReconPeriod(periodName);
    setReconFilter('all');
    setReconSearch('');
    setReconVisible(true);

    const matchedCount = records.filter(r => r.matched).length;
    const diffCount    = records.length - matchedCount;
    if (diffCount === 0) {
      message.success(`All ${matchedCount} accounts reconcile perfectly ✓`);
    } else {
      message.warning(`${diffCount} account(s) have differences — see reconciliation panel`);
    }
  }, [tabs]);

  // Update tab filter
  const updateTabFilter = useCallback((tabKey: string, field: 'selectedCompany' | 'selectedCurrency', value: string | null) => {
    setTabs(prev => prev.map(t =>
      t.key === tabKey
        ? { ...t, [field]: value }
        : t
    ));
  }, []);

  const updateTabSearch = useCallback((tabKey: string, search: string) => {
    setTabs(prev => prev.map(t => t.key === tabKey ? { ...t, gridSearch: search } : t));
  }, []);

  const updateTabEntered = useCallback((tabKey: string, show: boolean) => {
    setTabs(prev => prev.map(t => t.key === tabKey ? { ...t, showEntered: show } : t));
  }, []);

  // Handle segment drop
  const handleSegmentDrop = useCallback((tabKey: string, segment: string, position: 'before' | 'after') => {
    setTabs(prev => prev.map(t => {
      if (t.key !== tabKey) return t;

      // Remove from both arrays first
      const newBefore = t.segmentsBefore.filter(s => s !== segment);
      const newAfter = t.segmentsAfter.filter(s => s !== segment);

      if (position === 'before') {
        return { ...t, segmentsBefore: [...newBefore, segment], segmentsAfter: newAfter };
      } else {
        return { ...t, segmentsBefore: newBefore, segmentsAfter: [...newAfter, segment] };
      }
    }));
  }, []);

  // Remove dropped segment
  const removeDroppedSegment = useCallback((tabKey: string, segment: string) => {
    setTabs(prev => prev.map(t => {
      if (t.key !== tabKey) return t;
      return {
        ...t,
        segmentsBefore: t.segmentsBefore.filter(s => s !== segment),
        segmentsAfter: t.segmentsAfter.filter(s => s !== segment),
      };
    }));
  }, []);

  // Get segment label
  const getSegmentLabel = (segmentKey: string): string => {
    const segment = AVAILABLE_SEGMENTS.find(s => s.key === segmentKey);
    return segment?.label || segmentKey;
  };

  // Generate pivot data - group by segments + account
  const generatePivotData = (data: GLBalanceRecord[], segmentsBefore: string[], segmentsAfter: string[]): PivotRow[] => {
    const pivotMap = new Map<string, PivotRow>();
    const groupByKeys = [...segmentsBefore, 'account', ...segmentsAfter];

    // Also track raw rows per account (regardless of segments) for the detail popup
    const accountRawRows = new Map<string, GLBalanceRecord[]>();

    data.forEach(row => {
      // Track raw rows by account
      if (!accountRawRows.has(row.account)) {
        accountRawRows.set(row.account, []);
      }
      accountRawRows.get(row.account)!.push(row);

      // Build key from selected segments
      const keyParts = groupByKeys.map(key => (row as any)[key] || '');
      const pivotKey = keyParts.join('|');

      if (!pivotMap.has(pivotKey)) {
        const pivotRow: PivotRow = {
          key: pivotKey,
          account: row.account,
          account_desc: row.account_desc,
          opening_balance: 0,
          debit: 0,
          credit: 0,
          closing_balance: 0,
          segmentCount: 0,
          rawRows: [],
        };

        // Add segment values
        segmentsBefore.forEach(seg => {
          pivotRow[seg] = (row as any)[seg] || '';
        });
        segmentsAfter.forEach(seg => {
          pivotRow[seg] = (row as any)[seg] || '';
        });

        pivotMap.set(pivotKey, pivotRow);
      }

      const pivotRow = pivotMap.get(pivotKey)!;
      pivotRow.opening_balance += row.opening_balance || 0;
      pivotRow.debit += row.debit || 0;
      pivotRow.credit += row.credit || 0;
      pivotRow.closing_balance += row.closing_balance || 0;
      pivotRow.segmentCount += 1;
      (pivotRow.rawRows as GLBalanceRecord[]).push(row);
    });

    // Convert to array and sort by account
    const result = Array.from(pivotMap.values());
    result.sort((a, b) => a.account.localeCompare(b.account));

    return result;
  };

  // Show account detail modal
  const showAccountDetail = (account: string, account_desc: string, rows: GLBalanceRecord[]) => {
    setDetailModalData({ account, account_desc, rows });
    setDetailModalVisible(true);
  };

  // Initial load
  useEffect(() => {
    fetchLedgers();
    fetchPeriods();
    // Fetch all companies from COA value set
    const VALUES_API = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/valuesets/getvalues';
    fetch(`${VALUES_API}/BUIMERC_FIN_GLB_COA_CO`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const items: any[] = data.items || [];
        setAllCompanies(items
          .filter((i: any) => i.value || i.Value)
          .map((i: any) => {
            const code = i.value || i.Value;
            const desc = i.description || i.Description || code;
            return { value: code, label: `${code} - ${desc}` };
          })
        );
      })
      .catch(() => {});
  }, []);

  // Re-fetch periods when ledger changes
  useEffect(() => {
    setPeriods([]);
    setSelectedYear(null);
    fetchPeriods();
  }, [selectedLedger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Get status tag color
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'open': return 'green';
      case 'closed': return 'red';
      case 'future': return 'blue';
      case 'never opened': return 'default';
      default: return 'default';
    }
  };

  // Periods table columns
  const periodColumns = [
    {
      title: '#',
      dataIndex: 'period_number',
      key: 'period_number',
      width: 60,
      align: 'center' as const,
      render: (num: number) => (
        <Text style={{ fontFamily: 'monospace' }}>{num}</Text>
      ),
    },
    {
      title: 'Period',
      dataIndex: 'period_name_id',
      key: 'period_name_id',
      width: 120,
      render: (text: string) => (
        <Text strong style={{ color: REDWOOD.primary }}>{text}</Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>{status}</Tag>
      ),
    },
    {
      title: 'Year',
      dataIndex: 'period_year',
      key: 'period_year',
      width: 80,
      render: (year: number) => <Tag color="blue">{year}</Tag>,
    },
    {
      title: 'Start Date',
      dataIndex: 'start_date',
      key: 'start_date',
      width: 120,
      render: (date: string) => (
        <Text type="secondary">{date ? new Date(date).toLocaleDateString() : '-'}</Text>
      ),
    },
    {
      title: 'End Date',
      dataIndex: 'end_date',
      key: 'end_date',
      width: 120,
      render: (date: string) => (
        <Text type="secondary">{date ? new Date(date).toLocaleDateString() : '-'}</Text>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      width: 200,
      render: (_: unknown, record: PeriodInfo) => (
        <Space size={4}>
          <Button
            type="primary"
            icon={<TableOutlined />}
            size="small"
            onClick={() => fetchTrialBalance(record.period_name_id)}
            style={{
              background: REDWOOD.primary,
              borderColor: REDWOOD.primary,
              borderRadius: 6,
            }}
          >
            Fusion TB
          </Button>
          <Button
            type="primary"
            icon={<BarChartOutlined />}
            size="small"
            onClick={() => fetchRrTrialBalance(record)}
            style={{
              background: REDWOOD.success,
              borderColor: REDWOOD.success,
              borderRadius: 6,
            }}
          >
            ReERP TB
          </Button>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            size="small"
            onClick={() => fetchDynamicTB(record)}
            style={{
              background: '#722ed1',
              borderColor: '#722ed1',
              borderRadius: 6,
            }}
          >
            Dynamic PTD TB
          </Button>
          <Button
            type="primary"
            icon={<BarChartOutlined />}
            size="small"
            onClick={() => fetchDynamicYtdTB(record)}
            style={{
              background: '#0958d9',
              borderColor: '#0958d9',
              borderRadius: 6,
            }}
          >
            Dynamic YTD TB
          </Button>
        </Space>
      ),
    },
  ];

  // Render periods tab content
  const renderPeriodsTab = () => (
    <Card
      style={{
        borderRadius: 12,
        border: `1px solid ${REDWOOD.border}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Select
            placeholder={loadingLedgers ? 'Loading ledgers...' : 'Select Ledger'}
            value={selectedLedger || undefined}
            onChange={(val) => setSelectedLedger(val)}
            loading={loadingLedgers}
            style={{ width: '100%' }}
            size="large"
            suffixIcon={<BankOutlined />}
          >
            {ledgerOptions.map(l => (
              <Select.Option key={l} value={l}>
                <BankOutlined style={{ marginRight: 8, color: REDWOOD.info }} />
                {l}
              </Select.Option>
            ))}
          </Select>
        </Col>
        <Col span={8}>
          <Select
            placeholder="Filter by Year"
            value={selectedYear}
            onChange={setSelectedYear}
            allowClear
            style={{ width: '100%' }}
            size="large"
          >
            {availableYears.map(year => (
              <Select.Option key={year} value={year}>
                <CalendarOutlined style={{ marginRight: 8 }} />
                {year}
              </Select.Option>
            ))}
          </Select>
        </Col>
        <Col span={8} style={{ textAlign: 'right' }}>
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchPeriods}
            loading={loadingPeriods}
            style={{ borderRadius: 6 }}
          >
            Refresh
          </Button>
        </Col>
      </Row>

      {periodsError && (
        <Alert
          message="Error loading periods"
          description={periodsError}
          type="error"
          showIcon
          style={{ marginBottom: 16, borderRadius: 8 }}
        />
      )}

      <Table
        columns={periodColumns}
        dataSource={filteredPeriods}
        rowKey="period_name_id"
        loading={loadingPeriods}
        pagination={{
          pageSize: 12,
          showSizeChanger: true,
          pageSizeOptions: ['12', '24', '48'],
          showTotal: (total) => `${total} periods`,
        }}
        size="middle"
        style={{ borderRadius: 8 }}
      />
    </Card>
  );

  // Export Fusion TB — delegates to styled utility
  const exportTabToExcel = async (tab: TabData, pivotData: PivotRow[]) => {
    if (!pivotData.length) { message.warning('No data to export'); return; }
    const segKeys = [...tab.segmentsBefore, ...tab.segmentsAfter];
    const totals  = pivotData.reduce(
      (acc, r) => ({
        opening: acc.opening + (r.opening_balance || 0),
        debit:   acc.debit   + (r.debit || 0),
        credit:  acc.credit  + (r.credit || 0),
        closing: acc.closing + (r.closing_balance || 0),
      }),
      { opening: 0, debit: 0, credit: 0, closing: 0 }
    );
    message.loading({ content: 'Building Excel…', key: 'xl', duration: 0 });
    try {
      await exportFusionTBToExcel({
        ledger:   selectedLedger || 'All',
        company:  tab.selectedCompany  || 'All',
        period:   tab.periodName,
        currency: tab.selectedCurrency || 'All',
        segments: segKeys.map(s => getSegmentLabel(s)),
        segKeys,
        rows:     pivotData as any,
        totals,
      });
      message.success({ content: 'Excel exported', key: 'xl' });
    } catch (e: any) {
      message.error({ content: `Export failed: ${e.message}`, key: 'xl' });
    }
  };

  // Export ReERP standard TB — delegates to styled utility
  const handleRrExport = async (
    tab:       TabData,
    tableRows: { account: string; account_desc: string; account_type: string;
                 opening: number; debit: number; credit: number; closing: number; ytd_net: number;
                 entered_opening: number; entered_debit: number; entered_credit: number; entered_closing: number }[],
    totals:    { opening: number; debit: number; credit: number; closing: number; ytd_net: number;
                 entered_opening: number; entered_debit: number; entered_credit: number; entered_closing: number }
  ) => {
    if (!tableRows.length) { message.warning('No data to export'); return; }
    message.loading({ content: 'Building Excel…', key: 'xl', duration: 0 });
    try {
      await exportRrTBToExcel({
        ledger:   selectedLedger || 'All',
        company:  tab.selectedCompany  || 'All',
        period:   tab.periodName.replace(/^ReERP:\s*/, ''),
        currency: tab.selectedCurrency || 'All',
        rows:     tableRows,
        totals,
      });
      message.success({ content: 'Excel exported', key: 'xl' });
    } catch (e: any) {
      message.error({ content: `Export failed: ${e.message}`, key: 'xl' });
    }
  };

  // Export both Fusion TB + ReERP TB into one workbook (two sheets)
  const handleExportBoth = useCallback(async (rrTab: TabData) => {
    const periodName = rrTab.periodName.replace(/^(?:ReERP|Dynamic):\s*/, '');
    const fusionTab  = tabs.find(t => t.tabType === 'fusion' && t.periodName === periodName);

    if (!fusionTab) {
      message.warning(`Open "Fusion TB" for ${periodName} first, then export both`, 4);
      return;
    }

    // ── Fusion: filter + pivot (flat, no segment grouping) ──
    const fusionFiltered = fusionTab.data.filter(item => {
      if (rrTab.selectedCompany  && item.company !== rrTab.selectedCompany) return false;
      if (rrTab.selectedCurrency && (item.currency || item.currency_code) !== rrTab.selectedCurrency) return false;
      return true;
    });
    const fusionPivot  = generatePivotData(fusionFiltered, [], []);
    const fusionTotals = fusionPivot.reduce(
      (acc, r) => ({
        opening: acc.opening + (r.opening_balance || 0),
        debit:   acc.debit   + (r.debit           || 0),
        credit:  acc.credit  + (r.credit          || 0),
        closing: acc.closing + (r.closing_balance || 0),
      }),
      { opening: 0, debit: 0, credit: 0, closing: 0 },
    );

    // ── ReERP: filter + group by account ──
    const rrFiltered = rrTab.rrData.filter(r => {
      if (rrTab.selectedCompany  && r.company      !== rrTab.selectedCompany)  return false;
      if (rrTab.selectedCurrency && r.currency_code !== rrTab.selectedCurrency) return false;
      return true;
    });
    type GR = { account: string; account_desc: string; account_type: string;
                opening: number; debit: number; credit: number; closing: number; ytd_net: number;
                entered_opening: number; entered_debit: number; entered_credit: number; entered_closing: number };
    const rrMap = new Map<string, GR>();
    rrFiltered.forEach(r => {
      if (!rrMap.has(r.account)) {
        rrMap.set(r.account, { account: r.account, account_desc: r.account_desc,
          account_type: r.account_type, opening: 0, debit: 0, credit: 0, closing: 0, ytd_net: 0,
          entered_opening: 0, entered_debit: 0, entered_credit: 0, entered_closing: 0 });
      }
      const g = rrMap.get(r.account)!;
      g.opening         += r.opening         || 0;
      g.debit           += r.debit           || 0;
      g.credit          += r.credit          || 0;
      g.closing         += r.closing         || 0;
      g.ytd_net         += r.ytd_net         || 0;
      g.entered_opening += r.entered_opening || 0;
      g.entered_debit   += r.entered_debit   || 0;
      g.entered_credit  += r.entered_credit  || 0;
      g.entered_closing += r.entered_closing || 0;
    });
    const rrRows   = Array.from(rrMap.values()).sort((a, b) => a.account.localeCompare(b.account));
    const rrTotals = rrRows.reduce(
      (acc, r) => ({
        opening:         acc.opening         + r.opening,
        debit:           acc.debit           + r.debit,
        credit:          acc.credit          + r.credit,
        closing:         acc.closing         + r.closing,
        ytd_net:         acc.ytd_net         + r.ytd_net,
        entered_opening: acc.entered_opening + r.entered_opening,
        entered_debit:   acc.entered_debit   + r.entered_debit,
        entered_credit:  acc.entered_credit  + r.entered_credit,
        entered_closing: acc.entered_closing + r.entered_closing,
      }),
      { opening: 0, debit: 0, credit: 0, closing: 0, ytd_net: 0,
        entered_opening: 0, entered_debit: 0, entered_credit: 0, entered_closing: 0 },
    );

    message.loading({ content: 'Building combined Excel…', key: 'xl', duration: 0 });
    try {
      await exportBothTBToExcel({
        ledger:   selectedLedger          || 'All',
        company:  rrTab.selectedCompany   || 'All',
        period:   periodName,
        currency: rrTab.selectedCurrency  || 'All',
        fusionRows:   fusionPivot as any,
        fusionTotals,
        rrRows,
        rrTotals,
      });
      message.success({ content: 'Combined Excel exported', key: 'xl' });
    } catch (e: any) {
      message.error({ content: `Export failed: ${e.message}`, key: 'xl' });
    }
  }, [tabs, selectedLedger]);

  // Render trial balance tab content
  const renderTBTab = (tab: TabData) => {
    // Filter data based on selected filters
    const filteredData = tab.data.filter(item => {
      if (tab.selectedCompany && item.company !== tab.selectedCompany) return false;
      if (tab.selectedCurrency && (item.currency || item.currency_code) !== tab.selectedCurrency) return false;
      return true;
    });

    // Generate pivot data
    let pivotData = generatePivotData(filteredData, tab.segmentsBefore, tab.segmentsAfter);

    // Grid search filter
    if (tab.gridSearch.trim()) {
      const lc = tab.gridSearch.toLowerCase();
      pivotData = pivotData.filter(r =>
        r.account.toLowerCase().includes(lc) ||
        (r.account_desc as string)?.toLowerCase().includes(lc) ||
        tab.segmentsBefore.some(s => String(r[s]).toLowerCase().includes(lc)) ||
        tab.segmentsAfter.some(s => String(r[s]).toLowerCase().includes(lc))
      );
    }

    // Calculate totals from pivot data
    const totals = pivotData.reduce(
      (acc, item) => ({
        opening: acc.opening + item.opening_balance,
        debit: acc.debit + item.debit,
        credit: acc.credit + item.credit,
        closing: acc.closing + item.closing_balance,
      }),
      { opening: 0, debit: 0, credit: 0, closing: 0 }
    );

    // Build dynamic columns based on dropped segments
    const dynamicColumns = [
      // Segments before Account
      ...tab.segmentsBefore.map(seg => ({
        title: getSegmentLabel(seg),
        dataIndex: seg,
        key: seg,
        width: 100,
        render: (text: string) => <Text style={{ fontFamily: 'monospace' }}>{text}</Text>,
      })),
      // Account column (fixed) with expand icon for multiple segments
      {
        title: 'Account',
        dataIndex: 'account',
        key: 'account',
        width: 140,
        sorter: (a: PivotRow, b: PivotRow) => a.account.localeCompare(b.account),
        defaultSortOrder: 'ascend' as const,
        render: (text: string, record: PivotRow) => (
          <Space size={4}>
            <Text strong style={{ fontFamily: 'monospace' }}>{text}</Text>
            {record.segmentCount > 1 && (
              <Tooltip title={`${record.segmentCount} segment combinations - click to view details`}>
                <Button
                  type="link"
                  size="small"
                  icon={<ExpandAltOutlined />}
                  onClick={() => showAccountDetail(record.account, record.account_desc as string, record.rawRows as GLBalanceRecord[])}
                  style={{ padding: 0, height: 'auto', color: REDWOOD.info }}
                />
              </Tooltip>
            )}
          </Space>
        ),
      },
      // Account Description
      {
        title: 'Description',
        dataIndex: 'account_desc',
        key: 'account_desc',
        width: 250,
        ellipsis: true,
        render: (text: string) => <Tooltip title={text}><Text>{text}</Text></Tooltip>,
      },
      // Segments after Account
      ...tab.segmentsAfter.map(seg => ({
        title: getSegmentLabel(seg),
        dataIndex: seg,
        key: seg,
        width: 100,
        render: (text: string) => <Text style={{ fontFamily: 'monospace' }}>{text}</Text>,
      })),
      // Amount columns
      {
        title: 'Opening',
        dataIndex: 'opening_balance',
        key: 'opening_balance',
        width: 130,
        align: 'right' as const,
        render: (value: number) => (
          <Text style={{ fontFamily: 'monospace', color: value < 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
            {formatCurrency(value)}
          </Text>
        ),
      },
      {
        title: 'Debit',
        dataIndex: 'debit',
        key: 'debit',
        width: 130,
        align: 'right' as const,
        render: (value: number) => (
          <Text style={{ fontFamily: 'monospace', color: value > 0 ? REDWOOD.info : REDWOOD.textSecondary }}>
            {formatCurrency(value)}
          </Text>
        ),
      },
      {
        title: 'Credit',
        dataIndex: 'credit',
        key: 'credit',
        width: 130,
        align: 'right' as const,
        render: (value: number) => (
          <Text style={{ fontFamily: 'monospace', color: value > 0 ? REDWOOD.success : REDWOOD.textSecondary }}>
            {formatCurrency(value)}
          </Text>
        ),
      },
      {
        title: 'Closing',
        dataIndex: 'closing_balance',
        key: 'closing_balance',
        width: 130,
        align: 'right' as const,
        render: (value: number) => (
          <Text strong style={{ fontFamily: 'monospace', color: value < 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
            {formatCurrency(value)}
          </Text>
        ),
      },
    ];

    // Calculate segment column count for summary row
    const segmentColCount = tab.segmentsBefore.length + 2 + tab.segmentsAfter.length; // +2 for Account + Description

    if (tab.loading) {
      return (
        <Card style={{ borderRadius: 12, textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">Loading Trial Balance for {tab.periodName}...</Text>
          </div>
        </Card>
      );
    }

    if (tab.error) {
      return (
        <Alert
          message="Error loading Trial Balance"
          description={tab.error}
          type="error"
          showIcon
          style={{ borderRadius: 8 }}
        />
      );
    }

    return (
      <Card
        style={{
          borderRadius: 12,
          border: `1px solid ${REDWOOD.border}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        {/* Filters */}
        <Row gutter={[8, 8]} style={{ marginBottom: 12 }} align="middle">
          <Col xs={24} sm={6}>
            <Select
              placeholder="All Companies"
              value={tab.selectedCompany}
              onChange={(value) => updateTabFilter(tab.key, 'selectedCompany', value)}
              allowClear
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              options={(allCompanies.length > 0 ? allCompanies : tab.companies.map(c => ({ value: c, label: c }))).map(o => ({
                value: o.value,
                label: (
                  <span><BankOutlined style={{ marginRight: 6, color: REDWOOD.info }} />{o.label}</span>
                ),
              }))}
            />
          </Col>
          <Col xs={24} sm={5}>
            <Select
              placeholder="All Currencies"
              value={tab.selectedCurrency}
              onChange={(value) => updateTabFilter(tab.key, 'selectedCurrency', value)}
              allowClear
              style={{ width: '100%' }}
              showSearch
            >
              {tab.currencies.map(currency => (
                <Select.Option key={currency} value={currency}>
                  <DollarOutlined style={{ marginRight: 6, color: REDWOOD.success }} />
                  {currency}
                </Select.Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={7}>
            <Input
              placeholder="Search account, description..."
              prefix={<SearchOutlined style={{ color: REDWOOD.textSecondary }} />}
              value={tab.gridSearch}
              onChange={e => updateTabSearch(tab.key, e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={6} style={{ textAlign: 'right' }}>
            <Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {pivotData.length} / {generatePivotData(filteredData, tab.segmentsBefore, tab.segmentsAfter).length} rows
              </Text>
              <Button
                icon={<FileExcelOutlined />}
                size="small"
                onClick={() => exportTabToExcel(tab, pivotData)}
                style={{ borderColor: REDWOOD.success, color: REDWOOD.success }}
              >
                Excel
              </Button>
            </Space>
          </Col>
        </Row>

        {/* Draggable Segment Filters */}
        <Divider style={{ margin: '12px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <Text style={{ fontSize: 12, color: REDWOOD.textSecondary }}>
            <FilterOutlined /> Segments (drag to pivot):
          </Text>
          {AVAILABLE_SEGMENTS.map((segment) => {
            const isDropped = tab.segmentsBefore.includes(segment.key) || tab.segmentsAfter.includes(segment.key);
            return (
              <Tag
                key={segment.key}
                style={{
                  cursor: 'grab',
                  padding: '4px 8px',
                  fontSize: 11,
                  background: isDropped ? `${REDWOOD.info}15` : REDWOOD.surfaceSecondary,
                  borderColor: isDropped ? REDWOOD.info : REDWOOD.border,
                }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('segment', segment.key);
                }}
              >
                <DragOutlined style={{ marginRight: 4 }} />
                {segment.label}
              </Tag>
            );
          })}
        </div>

        {/* Pivot columns drop zones */}
        <div
          style={{
            marginBottom: 16,
            padding: 8,
            background: `${REDWOOD.info}08`,
            borderRadius: 6,
            border: `1px dashed ${REDWOOD.info}`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <Text style={{ fontSize: 11, color: REDWOOD.textSecondary }}>Pivot columns:</Text>

          {/* Drop zone BEFORE Account */}
          <div
            onDrop={(e) => {
              e.preventDefault();
              const segment = e.dataTransfer.getData('segment');
              if (segment) handleSegmentDrop(tab.key, segment, 'before');
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.background = `${REDWOOD.info}30`;
            }}
            onDragLeave={(e) => {
              e.currentTarget.style.background = `${REDWOOD.info}10`;
            }}
            style={{
              minWidth: 80,
              minHeight: 28,
              padding: '4px 8px',
              background: `${REDWOOD.info}10`,
              border: `1px dashed ${REDWOOD.info}`,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexWrap: 'wrap',
            }}
          >
            {tab.segmentsBefore.length === 0 && (
              <Text type="secondary" style={{ fontSize: 10 }}>Drop here (before)</Text>
            )}
            {tab.segmentsBefore.map((segment) => (
              <Tag
                key={segment}
                closable
                onClose={() => removeDroppedSegment(tab.key, segment)}
                style={{ fontSize: 11, margin: 0 }}
                color="blue"
              >
                {getSegmentLabel(segment)}
              </Tag>
            ))}
          </div>

          {/* Account (fixed) */}
          <Tag style={{ fontSize: 11, margin: 0, fontWeight: 'bold' }} color="gold">
            Account
          </Tag>
          <Tag style={{ fontSize: 11, margin: 0 }} color="default">
            Description
          </Tag>

          {/* Drop zone AFTER Account */}
          <div
            onDrop={(e) => {
              e.preventDefault();
              const segment = e.dataTransfer.getData('segment');
              if (segment) handleSegmentDrop(tab.key, segment, 'after');
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.background = `${REDWOOD.info}30`;
            }}
            onDragLeave={(e) => {
              e.currentTarget.style.background = `${REDWOOD.info}10`;
            }}
            style={{
              minWidth: 80,
              minHeight: 28,
              padding: '4px 8px',
              background: `${REDWOOD.info}10`,
              border: `1px dashed ${REDWOOD.info}`,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexWrap: 'wrap',
            }}
          >
            {tab.segmentsAfter.length === 0 && (
              <Text type="secondary" style={{ fontSize: 10 }}>Drop here (after)</Text>
            )}
            {tab.segmentsAfter.map((segment) => (
              <Tag
                key={segment}
                closable
                onClose={() => removeDroppedSegment(tab.key, segment)}
                style={{ fontSize: 11, margin: 0 }}
                color="blue"
              >
                {getSegmentLabel(segment)}
              </Tag>
            ))}
          </div>

          {/* Amount columns (fixed) */}
          <Tag style={{ fontSize: 11, margin: 0 }} color="default">Opening</Tag>
          <Tag style={{ fontSize: 11, margin: 0 }} color="default">Debit</Tag>
          <Tag style={{ fontSize: 11, margin: 0 }} color="default">Credit</Tag>
          <Tag style={{ fontSize: 11, margin: 0 }} color="default">Closing</Tag>
        </div>

        {/* Table — all rows, no pagination */}
        <Table
          columns={dynamicColumns}
          dataSource={pivotData}
          rowKey="key"
          pagination={false}
          scroll={{ x: 1000, y: 520 }}
          size="small"
          style={{ borderRadius: 8 }}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ background: REDWOOD.surfaceSecondary, fontWeight: 'bold' }}>
                <Table.Summary.Cell index={0} colSpan={segmentColCount}>
                  <Text strong>TOTAL</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={segmentColCount} align="right">
                  <Text strong style={{ fontFamily: 'monospace' }}>
                    {formatCurrency(totals.opening)}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={segmentColCount + 1} align="right">
                  <Text strong style={{ fontFamily: 'monospace', color: REDWOOD.info }}>
                    {formatCurrency(totals.debit)}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={segmentColCount + 2} align="right">
                  <Text strong style={{ fontFamily: 'monospace', color: REDWOOD.success }}>
                    {formatCurrency(totals.credit)}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={segmentColCount + 3} align="right">
                  <Text strong style={{ fontFamily: 'monospace' }}>
                    {formatCurrency(totals.closing)}
                  </Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>
    );
  };

  // ── Lines Summary Tab ────────────────────────────────────
  const renderLinesSummaryTab = () => {
    const fmtN = (n: number) =>
      n === 0 ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Distinct values for filter dropdowns
    const companies  = [...new Set(lsData.map(r => r.seg1_company).filter(Boolean) as string[])].sort();
    const ledgers    = [...new Set(lsData.map(r => r.ledger_name).filter(Boolean)  as string[])].sort();
    const currencies = [...new Set(lsData.map(r => r.currency).filter(Boolean)     as string[])].sort();

    // Client-side filter
    const visibleData = lsData.filter(r => {
      if (lsLedger   && (r.ledger_name || '').trim().toLowerCase() !== lsLedger.trim().toLowerCase()) return false;
      if (lsCurrency && (r.currency    || '').toUpperCase() !== lsCurrency.toUpperCase()) return false;
      if (lsSearch) {
        const q = lsSearch.toLowerCase();
        if (!(r.seg4_account || '').toLowerCase().includes(q) &&
            !(r.seg1_company || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });

    // Pull account descriptions from the open TB tab for this period
    const tbDataForPeriod = tabs.find(t => t.periodName === lsPeriod)?.data || [];
    const tbDescMap = new Map<string, string>();
    for (const rec of tbDataForPeriod) {
      const k = `${(rec.company||'').trim()}|${(rec.account||'').trim()}`;
      if (!tbDescMap.has(k) && rec.account_desc) tbDescMap.set(k, rec.account_desc);
    }

    // When no currency selected (All): aggregate ACCOUNTED DR/CR per company+account+ledger
    // When specific currency selected: filter rows to that currency, then show as-is
    let displayData: any[];
    if (!lsCurrency) {
      const aggMap = new Map<string, any>();
      for (const r of visibleData) {
        const key = `${r.seg1_company}|${r.seg4_account}|${r.ledger_name}`;
        if (!aggMap.has(key)) {
          aggMap.set(key, {
            rowKey: key,
            seg1_company: r.seg1_company,
            seg4_account: r.seg4_account,
            ledger_name:  r.ledger_name,
            period_name:  r.period_name,
            account_desc: tbDescMap.get(`${(r.seg1_company||'').trim()}|${(r.seg4_account||'').trim()}`) || '',
            total_dr: 0, total_cr: 0, net_amount: 0, line_count: 0,
          });
        }
        const row = aggMap.get(key)!;
        row.total_dr   += r.total_dr;
        row.total_cr   += r.total_cr;
        row.net_amount += r.net_amount;
        row.line_count += r.line_count;
      }
      displayData = [...aggMap.values()];
    } else {
      displayData = visibleData.map(r => ({
        ...r,
        rowKey: `${r.seg1_company}|${r.seg4_account}|${r.ledger_name}|${r.currency}`,
        account_desc: tbDescMap.get(`${(r.seg1_company||'').trim()}|${(r.seg4_account||'').trim()}`) || '',
      }));
    }

    // KPI totals (always from displayData)
    const totalDr    = displayData.reduce((s: number, r: any) => s + (r.total_dr   || 0), 0);
    const totalCr    = displayData.reduce((s: number, r: any) => s + (r.total_cr   || 0), 0);
    const totalNet   = displayData.reduce((s: number, r: any) => s + (r.net_amount || 0), 0);
    const totalLines = displayData.reduce((s: number, r: any) => s + (r.line_count || 0), 0);

    // Open detail popup for a row
    const openDetail = (r: any) => {
      const tbRecs = tbDataForPeriod.filter(t =>
        (t.company || '').trim() === (r.seg1_company || '').trim() &&
        (t.account || '').trim() === (r.seg4_account || '').trim()
      );
      setLsDetailRow({
        account: r.seg4_account || '', company: r.seg1_company || '',
        ledger: r.ledger_name || null,
        accountDesc: r.account_desc || tbDescMap.get(`${(r.seg1_company||'').trim()}|${(r.seg4_account||'').trim()}`) || '',
        combinations: [],
        lsDr: r.total_dr, lsCr: r.total_cr, lsNet: r.net_amount, lsLines: r.line_count,
        tbRecords: tbRecs,
      });
    };

    // Shared columns
    const numCol = (title: React.ReactNode, key: string, color: string) => ({
      title,
      dataIndex: key,
      key,
      align: 'right' as const,
      width: 130,
      sorter: (a: any, b: any) => (a[key] || 0) - (b[key] || 0),
      render: (v: number) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 12, color: v !== 0 ? color : REDWOOD.textSecondary }}>
          {fmtN(v)}
        </Text>
      ),
    });

    const reconCol = lsReconDone ? [{
      title: <Tooltip title="Click to view TB detail"><CheckCircleOutlined style={{ color: REDWOOD.success }} /> Recon</Tooltip>,
      key: 'recon', width: 72, align: 'center' as const, fixed: 'right' as const,
      render: (_: any, r: any) => {
        const mapKey = `${(r.seg1_company||'').trim()}|${(r.seg4_account||'').trim()}|${(r.ledger_name||'').trim()}`;
        const res = lsReconMap.get(mapKey);
        const icon = !res
          ? <Tag color="orange" style={{ fontSize: 10, cursor: 'pointer' }}>No TB</Tag>
          : res.matched
            ? <CheckCircleOutlined style={{ color: REDWOOD.success, fontSize: 16, cursor: 'pointer' }} />
            : <CloseCircleOutlined style={{ color: REDWOOD.primary,  fontSize: 16, cursor: 'pointer' }} />;
        return <span onClick={() => openDetail(r)} style={{ cursor: 'pointer' }}>{icon}</span>;
      },
    }] : [];

    const columns = [
      { title: 'Co.', dataIndex: 'seg1_company', key: 'seg1_company', width: 55,
        render: (v: string) => <Tag style={{ fontSize: 11 }}>{v || '—'}</Tag>,
        filters: companies.map(c => ({ text: c, value: c })),
        onFilter: (val: any, r: any) => r.seg1_company === val },
      { title: 'Account', dataIndex: 'seg4_account', key: 'seg4_account', width: 100,
        sorter: (a: any, b: any) => (a.seg4_account||'').localeCompare(b.seg4_account||''),
        render: (v: string, r: any) => (
          <span style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>
            <Text strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text>
          </span>
        ) },
      { title: 'Description', dataIndex: 'account_desc', key: 'account_desc', ellipsis: true,
        render: (v: string) => <Text style={{ fontSize: 12 }}>{v || <Text type="secondary">—</Text>}</Text> },
      { title: 'Ledger', dataIndex: 'ledger_name', key: 'ledger_name', width: 130, ellipsis: true,
        filters: ledgers.map(l => ({ text: l, value: l })),
        onFilter: (val: any, r: any) => r.ledger_name === val,
        render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v||'—'}</Text> },
      numCol(<span style={{ color: REDWOOD.info }}>Total DR</span>,   'total_dr',   REDWOOD.info),
      numCol(<span style={{ color: REDWOOD.primary }}>Total CR</span>, 'total_cr',   REDWOOD.primary),
      numCol('Net (Dr−Cr)', 'net_amount', ''),
      { title: 'Lines', dataIndex: 'line_count', key: 'line_count', align: 'right' as const, width: 60,
        render: (v: number) => <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text> },
      ...reconCol,
    ];

    return (
      <div>
        {/* Parameter bar */}
        <Card size="small" style={{ marginBottom: 12, borderColor: REDWOOD.border }} bodyStyle={{ padding: '10px 16px' }}>
          <Row gutter={10} align="middle" wrap>
            <Col>
              <Text style={{ fontSize: 11, color: REDWOOD.textSecondary, display: 'block', marginBottom: 2 }}>Period</Text>
              <Select
                style={{ width: 130 }} size="small" placeholder="Select period"
                value={lsPeriod ?? undefined}
                onChange={v => setLsPeriod(v)}
                showSearch
              >
                {filteredPeriods.map(p => (
                  <Select.Option key={p.period_name_id} value={p.period_name_id}>{p.period_name_id}</Select.Option>
                ))}
              </Select>
            </Col>
            <Col>
              <Text style={{ fontSize: 11, color: REDWOOD.textSecondary, display: 'block', marginBottom: 2 }}>
                Company (Seg 1)
                <Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>type or select</Text>
              </Text>
              <AutoComplete
                style={{ width: 140 }}
                size="small"
                placeholder="All  /  type code"
                value={lsCompany ?? undefined}
                onChange={v => setLsCompany(v || null)}
                allowClear
                options={companies.map(c => ({ value: c, label: c }))}
                filterOption={(input, opt) =>
                  (opt?.value as string)?.toLowerCase().includes(input.toLowerCase())
                }
              />
            </Col>
            {ledgers.length > 0 && (
              <Col>
                <Text style={{ fontSize: 11, color: REDWOOD.textSecondary, display: 'block', marginBottom: 2 }}>
                  Ledger
                </Text>
                <Select
                  style={{ minWidth: 160 }}
                  size="small"
                  placeholder="All ledgers"
                  value={lsLedger ?? undefined}
                  onChange={v => setLsLedger(v || null)}
                  allowClear
                  showSearch
                >
                  {ledgers.map(l => (
                    <Select.Option key={l} value={l}>{l}</Select.Option>
                  ))}
                </Select>
              </Col>
            )}
            {currencies.length > 0 && (
              <Col>
                <Text style={{ fontSize: 11, color: REDWOOD.textSecondary, display: 'block', marginBottom: 2 }}>Currency</Text>
                <Select
                  style={{ width: 90 }} size="small" placeholder="All"
                  value={lsCurrency ?? undefined}
                  onChange={v => setLsCurrency(v || null)}
                  allowClear showSearch
                >
                  {currencies.map(c => (
                    <Select.Option key={c} value={c}>{c}</Select.Option>
                  ))}
                </Select>
              </Col>
            )}
            <Col style={{ marginTop: 18 }}>
              <Button
                type="primary" size="small" icon={<BarChartOutlined />}
                loading={lsLoading}
                onClick={() => fetchLinesSummary(lsPeriod, lsCompany)}
                disabled={!lsPeriod}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primaryDark }}
              >
                Fetch
              </Button>
            </Col>
            {lsData.length > 0 && (
              <Col style={{ marginTop: 18 }}>
                <Tooltip title="Compare Lines Summary PTD DR/CR against GL Trial Balance for the same period">
                  <Button
                    size="small"
                    icon={<CheckCircleOutlined />}
                    onClick={handleReconcile}
                    style={{
                      color: lsReconDone ? REDWOOD.success : REDWOOD.primary,
                      borderColor: lsReconDone ? REDWOOD.success : REDWOOD.primary,
                    }}
                  >
                    Reconcile TB
                  </Button>
                </Tooltip>
              </Col>
            )}
            {lsData.length > 0 && (
              <Col style={{ marginTop: 18 }}>
                <Button
                  size="small" icon={<FileExcelOutlined />}
                  style={{ color: REDWOOD.success, borderColor: REDWOOD.success }}
                  onClick={() => {
                    if (!visibleData.length) return;
                    const rows = displayData.map((r: any) => ({
                      'Company':  r.seg1_company,
                      'Account':  r.seg4_account,
                      'Description': r.account_desc || '',
                      'Ledger':   r.ledger_name,
                      'Currency': r.currency,
                      'Period':   r.period_name,
                      'PTD DR':   r.total_dr,
                      'PTD CR':   r.total_cr,
                      'Net':      r.net_amount,
                      'Lines':    r.line_count,
                    }));
                    const ws = XLSX.utils.json_to_sheet(rows);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Lines Summary');
                    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                    saveAs(new Blob([buf], { type: 'application/octet-stream' }),
                      `LinesSummary_${lsPeriod || 'All'}.xlsx`);
                  }}
                >
                  Excel
                </Button>
              </Col>
            )}
          </Row>
          {/* API URL row — always visible once a period is chosen */}
          {(lsPeriod || lsApiUrl) && (
            <Row style={{ marginTop: 8, borderTop: '1px solid #f0f0f0', paddingTop: 8 }} align="middle" gutter={8}>
              <Col flex="none">
                <Tag color="green" style={{ fontFamily: 'monospace', fontSize: 10 }}>GET</Tag>
              </Col>
              <Col flex="auto">
                <Input
                  size="small"
                  readOnly
                  value={lsApiUrl || (() => {
                    const p = new URLSearchParams({ period_name: lsPeriod || '', limit: '5000' });
                    if (lsCompany) p.set('company', lsCompany);
                    return `${APEX_DB_CONFIG.baseUrl}/${APEX_DB_CONFIG.endpoints.glLinesSummary}?${p}`;
                  })()}
                  style={{ fontFamily: 'monospace', fontSize: 10, color: REDWOOD.textSecondary, background: '#fafafa' }}
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
              </Col>
              <Col flex="none">
                <Button
                  size="small"
                  type="text"
                  style={{ fontSize: 10, color: REDWOOD.info }}
                  onClick={() => {
                    const url = lsApiUrl || (() => {
                      const p = new URLSearchParams({ period_name: lsPeriod || '', limit: '5000' });
                      if (lsCompany) p.set('company', lsCompany);
                      return `${APEX_DB_CONFIG.baseUrl}/${APEX_DB_CONFIG.endpoints.glLinesSummary}?${p}`;
                    })();
                    navigator.clipboard?.writeText(url).then(() => message.success('URL copied'));
                  }}
                >
                  Copy
                </Button>
              </Col>
            </Row>
          )}
        </Card>

        {/* Error */}
        {lsError && <Alert type="error" message={lsError} style={{ marginBottom: 12 }} />}

        {/* KPI row */}
        {lsData.length > 0 && (
          <Row gutter={10} style={{ marginBottom: 12 }}>
            {[
              { label: 'Accounts',   value: visibleData.length,                 isCcy: false, color: REDWOOD.neutral },
              { label: 'Line Count', value: totalLines,                          isCcy: false, color: REDWOOD.neutral },
              { label: 'Total DR',   value: totalDr,                            isCcy: true,  color: REDWOOD.info        },
              { label: 'Total CR',   value: totalCr,                            isCcy: true,  color: REDWOOD.primary     },
              { label: 'Net (Dr−Cr)',value: totalNet, isCcy: true,
                color: totalNet > 0 ? REDWOOD.info : totalNet < 0 ? REDWOOD.primary : REDWOOD.neutral },
            ].map(k => (
              <Col key={k.label}>
                <Card size="small" bodyStyle={{ padding: '8px 14px', textAlign: 'center' }}
                  style={{ minWidth: 120, borderColor: REDWOOD.border }}>
                  <div style={{ fontSize: 10, color: REDWOOD.textSecondary }}>{k.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: k.color }}>
                    {k.isCcy
                      ? (k.value as number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : (k.value as number).toLocaleString()}
                  </div>
                </Card>
              </Col>
            ))}
            <Col flex="auto" style={{ display: 'flex', alignItems: 'center' }}>
              <Input
                prefix={<SearchOutlined style={{ color: REDWOOD.textSecondary }} />}
                placeholder="Search account, combination…"
                size="small" allowClear
                style={{ maxWidth: 280 }}
                value={lsSearch}
                onChange={e => setLsSearch(e.target.value)}
              />
            </Col>
          </Row>
        )}

        {/* Table */}
        <Table
          columns={columns}
          dataSource={displayData}
          rowKey={(r: any) => r.rowKey || `${r.seg1_company}|${r.seg4_account}|${r.ledger_name}|${r.currency}`}
          size="small"
          loading={lsLoading}
          scroll={{ x: 1000 }}
          sticky
          pagination={{ pageSize: 100, showSizeChanger: true, pageSizeOptions: ['50','100','250'],
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}` }}
          locale={{ emptyText: lsLoading ? <Spin /> : <Empty description={lsPeriod ? 'Click Fetch to load' : 'Select a period'} /> }}
          summary={() =>
            displayData.length > 0 ? (
              <Table.Summary.Row style={{ background: REDWOOD.surfaceSecondary }}>
                <Table.Summary.Cell index={0} colSpan={4}>
                  <Text strong style={{ fontSize: 11 }}>TOTAL ({displayData.length} rows)</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Text strong style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.info }}>
                    {totalDr.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <Text strong style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.primary }}>
                    {totalCr.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <Text strong style={{ fontFamily: 'monospace', fontSize: 11,
                    color: totalNet > 0 ? REDWOOD.info : totalNet < 0 ? REDWOOD.primary : REDWOOD.textSecondary }}>
                    {totalNet === 0 ? '—' : (totalNet > 0 ? '+' : '') + totalNet.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <Text strong style={{ fontSize: 11 }}>{totalLines.toLocaleString()}</Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            ) : null
          }
        />

        {/* Account Detail Modal */}
        <Modal
          open={!!lsDetailRow}
          onCancel={() => { setLsDetailRow(null); setLsDetailCcy(null); }}
          footer={[
            <Button key="tb" type="primary"
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primaryDark }}
              onClick={() => {
                setLsDetailRow(null);
                const tbTab = tabs.find(t => t.periodName === lsPeriod);
                if (tbTab) { setActiveTab(tbTab.key); }
                else message.warning(`Open the GL Trial Balance tab for ${lsPeriod} first`);
              }}
            >
              Go to TB Tab — {lsPeriod}
            </Button>,
            <Button key="close" onClick={() => setLsDetailRow(null)}>Close</Button>,
          ]}
          width={760}
          title={
            <span>
              <BarsOutlined style={{ marginRight: 8, color: REDWOOD.primary }} />
              Account {lsDetailRow?.account}
              {lsDetailRow?.accountDesc && <Text type="secondary" style={{ marginLeft: 8, fontSize: 13 }}>{lsDetailRow.accountDesc}</Text>}
              <Tag style={{ marginLeft: 8 }} color="blue">{lsPeriod}</Tag>
            </span>
          }
        >
          {lsDetailRow && (() => {
            const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            // All currencies available in both sources
            const tbCcys = [...new Set(lsDetailRow.tbRecords.map(r => r.currency || r.currency_code).filter(Boolean) as string[])].sort();
            const lsAllRows = lsData.filter(r =>
              (r.seg1_company || '').trim() === lsDetailRow.company.trim() &&
              (r.seg4_account  || '').trim() === lsDetailRow.account.trim() &&
              (!lsDetailRow.ledger || (r.ledger_name || '') === lsDetailRow.ledger)
            );
            const lsCcys = [...new Set(lsAllRows.map(r => r.currency).filter(Boolean) as string[])].sort();
            const allCcys = [...new Set([...tbCcys, ...lsCcys])].sort();

            // Apply currency filter
            const filteredTb = lsDetailCcy
              ? lsDetailRow.tbRecords.filter(r => (r.currency || r.currency_code || '').toUpperCase() === lsDetailCcy.toUpperCase())
              : lsDetailRow.tbRecords;
            const filteredLs = lsDetailCcy
              ? lsAllRows.filter(r => (r.currency || '').toUpperCase() === lsDetailCcy.toUpperCase())
              : lsAllRows;

            // Totals — compare only PTD Debit vs PTD Credit (not balances)
            const tbDr = filteredTb.reduce((s, r) => s + (r.debit  || 0), 0);
            const tbCr = filteredTb.reduce((s, r) => s + (r.credit || 0), 0);
            const lsDr = filteredLs.reduce((s, r) => s + r.total_dr, 0);
            const lsCr = filteredLs.reduce((s, r) => s + r.total_cr, 0);
            const varDr = lsDr - tbDr;
            const varCr = lsCr - tbCr;

            return (
              <div>
                {/* Header: account info + currency filter */}
                <Row align="middle" justify="space-between" style={{ marginBottom: 12 }}>
                  <Col>
                    <Descriptions size="small" column={3} bordered>
                      <Descriptions.Item label="Company">{lsDetailRow.company}</Descriptions.Item>
                      <Descriptions.Item label="Account">{lsDetailRow.account}</Descriptions.Item>
                      <Descriptions.Item label="Ledger">{lsDetailRow.ledger || '—'}</Descriptions.Item>
                    </Descriptions>
                  </Col>
                  {allCcys.length > 0 && (
                    <Col style={{ marginLeft: 16 }}>
                      <Text style={{ fontSize: 11, marginRight: 8 }} type="secondary">Currency:</Text>
                      <Select size="small" style={{ width: 100 }} allowClear placeholder="All"
                        value={lsDetailCcy ?? undefined} onChange={v => setLsDetailCcy(v || null)}>
                        {allCcys.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                      </Select>
                    </Col>
                  )}
                </Row>

                {/* Comparison table — PTD DR/CR only */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: REDWOOD.surfaceSecondary }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Source</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', color: REDWOOD.info, fontWeight: 600 }}>PTD Debit (DR)</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', color: REDWOOD.primary, fontWeight: 600 }}>PTD Credit (CR)</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>Net (Dr−Cr)</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600 }}>Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '6px 10px' }}><Text strong>Lines Summary</Text></td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', color: REDWOOD.info }}>{fmt(lsDr)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', color: REDWOOD.primary }}>{fmt(lsCr)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(lsDr - lsCr)}</td>
                      <td />
                    </tr>
                    <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '6px 10px' }}><Text strong>GL Trial Balance</Text></td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', color: REDWOOD.info }}>{fmt(tbDr)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', color: REDWOOD.primary }}>{fmt(tbCr)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(tbDr - tbCr)}</td>
                      <td />
                    </tr>
                    <tr style={{ background: Math.abs(varDr) < 0.01 && Math.abs(varCr) < 0.01 ? '#f6ffed' : '#fff2f0' }}>
                      <td style={{ padding: '6px 10px' }}><Text strong>Variance</Text></td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace',
                        color: Math.abs(varDr) < 0.01 ? REDWOOD.success : '#f5222d', fontWeight: 700 }}>{fmt(varDr)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace',
                        color: Math.abs(varCr) < 0.01 ? REDWOOD.success : '#f5222d', fontWeight: 700 }}>{fmt(varCr)}</td>
                      <td />
                      <td style={{ textAlign: 'center', fontSize: 18 }}>
                        {Math.abs(varDr) < 0.01 && Math.abs(varCr) < 0.01
                          ? <CheckCircleOutlined style={{ color: REDWOOD.success }} />
                          : <CloseCircleOutlined style={{ color: '#f5222d' }} />}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Lines Summary breakdown */}
                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                  Lines Summary — {filteredLs.length} row(s)
                  {lsDetailRow.combinations.length > 1 &&
                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                      ({lsDetailRow.combinations.length} combinations)
                    </Text>}
                </Text>
                <Table
                  size="small"
                  dataSource={filteredLs}
                  rowKey={(r: LineSummaryRow) => `${r.seg4_account}|${r.ledger_name}|${r.currency}`}
                  pagination={false}
                  style={{ marginBottom: 16 }}
                  columns={[
                    { title: 'Ledger', dataIndex: 'ledger_name', width: 140, ellipsis: true,
                      render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v || '—'}</Text> },
                    { title: 'CCY', dataIndex: 'currency', width: 55,
                      render: (v: string) => <Tag style={{ fontSize: 10 }}>{v}</Tag> },
                    { title: 'PTD DR', dataIndex: 'total_dr', align: 'right' as const, width: 120,
                      render: (v: number) => <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.info }}>{fmt(v)}</Text> },
                    { title: 'PTD CR', dataIndex: 'total_cr', align: 'right' as const, width: 120,
                      render: (v: number) => <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.primary }}>{fmt(v)}</Text> },
                    { title: 'Net', dataIndex: 'net_amount', align: 'right' as const, width: 110,
                      render: (v: number) => <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{fmt(v)}</Text> },
                    { title: 'Lines', dataIndex: 'line_count', align: 'right' as const, width: 55,
                      render: (v: number) => <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text> },
                  ]}
                />

                {/* GL Trial Balance breakdown */}
                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                  GL Trial Balance — {filteredTb.length} row(s)
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>(PTD Debit / Credit only)</Text>
                </Text>
                {filteredTb.length > 0 ? (
                  <Table
                    size="small"
                    dataSource={filteredTb}
                    rowKey={(r: GLBalanceRecord) => `${r.period_name}|${r.currency}|${r.account_type}`}
                    pagination={false}
                    columns={[
                      { title: 'Period',   dataIndex: 'period_name',  width: 90 },
                      { title: 'CCY', dataIndex: 'currency', width: 55,
                        render: (v: string) => <Tag style={{ fontSize: 10 }}>{v}</Tag> },
                      { title: 'Type', dataIndex: 'account_type', width: 50 },
                      { title: 'PTD Debit', dataIndex: 'debit', align: 'right' as const, width: 120,
                        render: (v: number) => <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.info }}>{fmt(v || 0)}</Text> },
                      { title: 'PTD Credit', dataIndex: 'credit', align: 'right' as const, width: 120,
                        render: (v: number) => <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.primary }}>{fmt(v || 0)}</Text> },
                      { title: 'Opening', dataIndex: 'opening_balance', align: 'right' as const, width: 120,
                        render: (v: number) => <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 11 }}>{fmt(v || 0)}</Text> },
                      { title: 'Closing', dataIndex: 'closing_balance', align: 'right' as const, width: 120,
                        render: (v: number) => <Text strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{fmt(v || 0)}</Text> },
                    ]}
                  />
                ) : (
                  <Alert type="warning" message="No GL Trial Balance records found. Open the TB tab for this period first." />
                )}
              </div>
            );
          })()}
        </Modal>
      </div>
    );
  };

  // Render a ReERP TB tab — Standard format: Opening / Debit / Credit / Closing (net)
  // ── Open revaluation modal ───────────────────────────────────
  const openRevalModal = (tabKey: string, accountKey: string) => {
    setRevalTabKey(tabKey);
    setRevalAccount(accountKey);
    setRevalRates({});
    setRevalGainCombo('');
    setRevalLossCombo('');
    setRevalPreviewRows([]);
    setRevalVisible(true);
  };

  // ── Revaluation modal renderer ────────────────────────────────
  const renderRevalModal = () => {
    const tab = tabs.find(t => t.key === revalTabKey);
    if (!tab) return null;

    // All raw rows for this account
    const rawRows = tab.rrData.filter(r => r.account === revalAccount);
    const accountType = rawRows[0]?.account_type || 'A';
    const accountDesc = rawRows[0]?.account_desc || '';
    const functionalCcy = rawRows[0]?.currency_code || 'AED'; // default

    // Group by entered currency, sum balances
    const byFxCcy = new Map<string, { entClosing: number; acctClosing: number; combos: string[] }>();
    rawRows.forEach(r => {
      const ccy = r.currency_code || '';
      if (!byFxCcy.has(ccy)) byFxCcy.set(ccy, { entClosing: 0, acctClosing: 0, combos: [] });
      const g = byFxCcy.get(ccy)!;
      g.entClosing  += r.entered_closing || 0;
      g.acctClosing += r.closing        || 0;
      if (r.account_combination && !g.combos.includes(r.account_combination))
        g.combos.push(r.account_combination);
    });

    const fmtN = (n: number) =>
      new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));

    // Build per-currency revaluation rows
    interface CcyRow {
      ccy: string; entClosing: number; acctClosing: number;
      bookRate: number; newRate: number; newAcctValue: number;
      revalAmt: number; isGain: boolean; combos: string[];
    }
    const ccyRows: CcyRow[] = [];
    byFxCcy.forEach((v, ccy) => {
      const newRateStr = revalRates[ccy] || '';
      const newRate    = parseFloat(newRateStr) || 0;
      const bookRate   = v.entClosing !== 0 ? v.acctClosing / v.entClosing : 0;
      const newAcctVal = v.entClosing * newRate;
      const revalAmt   = newAcctVal - v.acctClosing;
      // Universal rule: revalAmt > 0 → Dr Account, Cr Gain; < 0 → Dr Loss, Cr Account
      const isGain = revalAmt >= 0;
      ccyRows.push({ ccy, entClosing: v.entClosing, acctClosing: v.acctClosing,
        bookRate, newRate, newAcctValue: newAcctVal, revalAmt, isGain, combos: v.combos });
    });

    const totalGain = ccyRows.filter(r => r.isGain && r.revalAmt !== 0).reduce((s, r) => s + r.revalAmt, 0);
    const totalLoss = ccyRows.filter(r => !r.isGain).reduce((s, r) => s + Math.abs(r.revalAmt), 0);

    // Build journal preview
    const buildPreview = () => {
      const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const baseDesc = `${accountDesc} - Revaluation on ${today}`;
      const lines: { lineNum: number; combo: string; desc: string; comment: string; dr: number; cr: number }[] = [];
      let ln = 1;
      ccyRows.forEach(r => {
        if (r.revalAmt === 0 || r.newRate === 0) return;
        const abs = Math.abs(r.revalAmt);
        const combo = r.combos[0] || revalAccount;
        if (r.isGain) {
          lines.push({ lineNum: ln++, combo, desc: baseDesc, comment: '', dr: abs, cr: 0 });
          lines.push({ lineNum: ln++, combo: revalGainCombo || '[Gain Account]', desc: `Unrealized FX Gain - ${r.ccy}`, comment: '', dr: 0, cr: abs });
        } else {
          lines.push({ lineNum: ln++, combo: revalLossCombo || '[Loss Account]', desc: `Unrealized FX Loss - ${r.ccy}`, comment: '', dr: abs, cr: 0 });
          lines.push({ lineNum: ln++, combo, desc: baseDesc, comment: '', dr: 0, cr: abs });
        }
      });
      setRevalPreviewRows(lines);
    };

    const updatePreviewRow = (lineNum: number, field: string, value: string) => {
      setRevalPreviewRows(prev => prev.map(r => r.lineNum === lineNum ? { ...r, [field]: value } : r));
    };

    // Account combo picker entries (all unique combos in this tab)
    const allCombos = [...new Set(tab.rrData.map(r => r.account_combination).filter(Boolean))].sort();
    const filteredCombos = revalComboSearch
      ? allCombos.filter(c => c.toLowerCase().includes(revalComboSearch.toLowerCase()))
      : allCombos;

    const ccyColumns = [
      { title: 'Currency', dataIndex: 'ccy', key: 'ccy', width: 80,
        render: (v: string) => <Tag color="blue">{v}</Tag> },
      { title: 'Entered Balance', dataIndex: 'entClosing', key: 'entClosing', align: 'right' as const, width: 140,
        render: (v: number, r: CcyRow) => (
          <Text style={{ fontFamily: 'monospace', color: v >= 0 ? '#237804' : REDWOOD.primary }}>
            {v >= 0 ? fmtN(v) : `(${fmtN(v)})`}
          </Text>
        )},
      { title: 'Acctd Balance', dataIndex: 'acctClosing', key: 'acctClosing', align: 'right' as const, width: 140,
        render: (v: number) => (
          <Text style={{ fontFamily: 'monospace', color: v >= 0 ? '#237804' : REDWOOD.primary }}>
            {v >= 0 ? fmtN(v) : `(${fmtN(v)})`}
          </Text>
        )},
      { title: 'Book Rate', dataIndex: 'bookRate', key: 'bookRate', align: 'right' as const, width: 100,
        render: (v: number, r: CcyRow) => (
          <Tooltip
            title={
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Book Rate Formula</div>
                <div style={{ fontFamily: 'monospace' }}>Accounted Closing ÷ Entered Closing</div>
                <div style={{ marginTop: 6, color: '#ffffffa0' }}>
                  {r.acctClosing.toFixed(2)} ÷ {r.entClosing.toFixed(2)}
                </div>
              </div>
            }
            color="#1d3557"
          >
            <Text style={{ fontFamily: 'monospace', color: REDWOOD.textSecondary, cursor: 'help', borderBottom: '1px dashed #aaa' }}>
              {v ? v.toFixed(5) : '—'}
            </Text>
          </Tooltip>
        )},
      { title: 'New Rate', key: 'newRate', align: 'right' as const, width: 120,
        render: (_: any, r: CcyRow) => (
          <Input
            size="small"
            style={{ width: 100, fontFamily: 'monospace', textAlign: 'right' }}
            placeholder="e.g. 3.675"
            value={revalRates[r.ccy] || ''}
            onChange={e => setRevalRates(prev => ({ ...prev, [r.ccy]: e.target.value }))}
          />
        )},
      { title: 'New Acctd Value', dataIndex: 'newAcctValue', key: 'newAcctValue', align: 'right' as const, width: 140,
        render: (v: number, r: CcyRow) => r.newRate > 0 ? (
          <Text style={{ fontFamily: 'monospace', color: REDWOOD.info }}>{v >= 0 ? fmtN(v) : `(${fmtN(v)})`}</Text>
        ) : <Text style={{ color: REDWOOD.textSecondary }}>—</Text> },
      { title: 'Adjustment', key: 'revalAmt', align: 'right' as const, width: 130,
        render: (_: any, r: CcyRow) => r.newRate === 0 ? <Text style={{ color: REDWOOD.textSecondary }}>—</Text> : (
          <Tag color={r.isGain ? 'green' : 'red'} style={{ fontFamily: 'monospace', fontWeight: 700 }}>
            {r.isGain ? '+' : '-'}{fmtN(r.revalAmt)} {r.isGain ? '▲ GAIN' : '▼ LOSS'}
          </Tag>
        )},
    ];

    const previewColumns = [
      { title: '#', dataIndex: 'lineNum', key: 'lineNum', width: 36 },
      { title: 'Account', dataIndex: 'combo', key: 'combo', width: 290,
        render: (v: string, row: any) => (
          <Space.Compact style={{ width: '100%' }}>
            <Input
              size="small"
              value={v}
              onChange={e => updatePreviewRow(row.lineNum, 'combo', e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: 11 }}
            />
            <Button
              size="small"
              icon={<ApartmentOutlined />}
              onClick={() => { setRevalAcctSelectorLineNum(row.lineNum); setRevalAcctSelectorOpen(true); }}
            />
          </Space.Compact>
        )},
      { title: 'Description', dataIndex: 'desc', key: 'desc',
        render: (v: string, row: any) => (
          <Input
            size="small"
            value={v}
            onChange={e => updatePreviewRow(row.lineNum, 'desc', e.target.value)}
          />
        )},
      { title: 'Comment', dataIndex: 'comment', key: 'comment', width: 160,
        render: (v: string, row: any) => (
          <Input
            size="small"
            value={v}
            onChange={e => updatePreviewRow(row.lineNum, 'comment', e.target.value)}
            placeholder="Optional comment…"
          />
        )},
      { title: 'Debit', dataIndex: 'dr', key: 'dr', align: 'right' as const, width: 120,
        render: (v: number) => v ? <Text style={{ fontFamily: 'monospace', color: '#237804', fontWeight: 600 }}>{fmtN(v)}</Text> : null },
      { title: 'Credit', dataIndex: 'cr', key: 'cr', align: 'right' as const, width: 120,
        render: (v: number) => v ? <Text style={{ fontFamily: 'monospace', color: REDWOOD.primary, fontWeight: 600 }}>{fmtN(v)}</Text> : null },
    ];

    return (
      <>
        <Modal
          open={revalVisible}
          onCancel={() => { setRevalVisible(false); setRevalPreviewRows([]); }}
          footer={null}
          width={1150}
          title={
            <Space>
              <Tag color={accountType === 'A' ? 'blue' : accountType === 'L' ? 'orange' : 'green'}>
                {accountType === 'A' ? 'Asset' : accountType === 'L' ? 'Liability' : accountType === 'O' ? 'Equity' : accountType}
              </Tag>
              <Text strong style={{ fontFamily: 'monospace' }}>{revalAccount}</Text>
              <Text style={{ color: REDWOOD.textSecondary }}>{accountDesc}</Text>
              <Tag color="purple">{tab.periodName.replace(/^(?:ReERP|Dynamic|YTD):\s*/, '')}</Tag>
            </Space>
          }
        >
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Oracle Fusion revaluation logic: New Acctd Value = Entered Balance × New Rate.
              Adjustment = New Value − Book Value. Positive → Dr Account / Cr Gain. Negative → Dr Loss / Cr Account.
            </Text>
          </div>

          {/* Per-currency balance + rate table */}
          <Table
            dataSource={ccyRows}
            columns={ccyColumns}
            rowKey="ccy"
            size="small"
            pagination={false}
            style={{ marginBottom: 16 }}
          />

          {/* Gain / Loss totals */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, padding: '8px 12px' }}>
                <Text style={{ color: '#389e0d', fontWeight: 700, fontSize: 13 }}>
                  Total Gain: {fmtN(totalGain)}
                </Text>
              </div>
            </Col>
            <Col span={12}>
              <div style={{ background: '#fff2f0', border: '1px solid #ffa39e', borderRadius: 6, padding: '8px 12px' }}>
                <Text style={{ color: REDWOOD.primary, fontWeight: 700, fontSize: 13 }}>
                  Total Loss: {fmtN(totalLoss)}
                </Text>
              </div>
            </Col>
          </Row>

          {/* Gain / Loss GL account selectors */}
          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <div style={{ marginBottom: 4 }}>
                <Text strong style={{ fontSize: 12, color: '#389e0d' }}>Realised Gain Account</Text>
              </div>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  size="small"
                  placeholder="e.g. 100-000-000-7001000-000-000-000"
                  value={revalGainCombo}
                  onChange={e => setRevalGainCombo(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: 11 }}
                />
                <Button size="small" icon={<SearchOutlined />}
                  onClick={() => { setRevalComboPickerFor('gain'); setRevalComboSearch(''); setRevalComboPickerOpen(true); }} />
              </Space.Compact>
            </Col>
            <Col span={12}>
              <div style={{ marginBottom: 4 }}>
                <Text strong style={{ fontSize: 12, color: REDWOOD.primary }}>Realised Loss Account</Text>
              </div>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  size="small"
                  placeholder="e.g. 100-000-000-7002000-000-000-000"
                  value={revalLossCombo}
                  onChange={e => setRevalLossCombo(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: 11 }}
                />
                <Button size="small" icon={<SearchOutlined />}
                  onClick={() => { setRevalComboPickerFor('loss'); setRevalComboSearch(''); setRevalComboPickerOpen(true); }} />
              </Space.Compact>
            </Col>
          </Row>

          {/* Preview button */}
          <Button
            type="primary"
            icon={<FileTextOutlined />}
            onClick={buildPreview}
            disabled={ccyRows.every(r => r.newRate === 0)}
            style={{ background: REDWOOD.info, borderColor: REDWOOD.info, marginBottom: 16 }}
          >
            Preview Journal Entry
          </Button>

          {/* Journal preview table */}
          {revalPreviewRows.length > 0 && (
            <div style={{ border: `1px solid ${REDWOOD.border}`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: '#1d1d1d', color: '#fff', padding: '6px 12px', fontSize: 12, fontWeight: 600 }}>
                Journal Preview — FX Revaluation &nbsp;
                <Tag color="gold">Preview Only — No journal created</Tag>
              </div>
              <Table
                dataSource={revalPreviewRows}
                columns={previewColumns}
                rowKey="lineNum"
                size="small"
                pagination={false}
                summary={() => (
                  <Table.Summary fixed>
                    <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 700 }}>
                      <Table.Summary.Cell index={0} colSpan={4} align="right">
                        <Text strong>Total</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right">
                        <Text strong style={{ fontFamily: 'monospace', color: '#237804' }}>
                          {fmtN(revalPreviewRows.reduce((s, r) => s + r.dr, 0))}
                        </Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="right">
                        <Text strong style={{ fontFamily: 'monospace', color: REDWOOD.primary }}>
                          {fmtN(revalPreviewRows.reduce((s, r) => s + r.cr, 0))}
                        </Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  </Table.Summary>
                )}
              />
            </div>
          )}
        </Modal>

        {/* Account combination picker */}
        <Modal
          open={revalComboPickerOpen}
          onCancel={() => setRevalComboPickerOpen(false)}
          footer={null}
          width={600}
          title={`Select ${revalComboPickerFor === 'gain' ? 'Gain' : 'Loss'} Account Combination`}
        >
          <Input.Search
            placeholder="Search combination…"
            value={revalComboSearch}
            onChange={e => setRevalComboSearch(e.target.value)}
            style={{ marginBottom: 10 }}
            allowClear
          />
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {filteredCombos.map(combo => (
              <div
                key={combo}
                style={{
                  padding: '6px 10px', cursor: 'pointer', borderRadius: 4,
                  fontFamily: 'monospace', fontSize: 12,
                  borderBottom: `1px solid ${REDWOOD.border}`,
                  background: (revalComboPickerFor === 'gain' ? revalGainCombo : revalLossCombo) === combo ? '#e6f7ff' : undefined,
                }}
                onClick={() => {
                  if (revalComboPickerFor === 'gain') setRevalGainCombo(combo);
                  else setRevalLossCombo(combo);
                  setRevalComboPickerOpen(false);
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f0f5ff')}
                onMouseLeave={e => (e.currentTarget.style.background = (revalComboPickerFor === 'gain' ? revalGainCombo : revalLossCombo) === combo ? '#e6f7ff' : '')}
              >
                {combo}
              </div>
            ))}
          </div>
        </Modal>

        <AccountSelector
          visible={revalAcctSelectorOpen}
          onCancel={() => { setRevalAcctSelectorOpen(false); setRevalAcctSelectorLineNum(null); }}
          onSelect={(accountCode) => {
            if (revalAcctSelectorLineNum !== null)
              setRevalPreviewRows(prev => prev.map(r => r.lineNum === revalAcctSelectorLineNum ? { ...r, combo: accountCode } : r));
            setRevalAcctSelectorOpen(false);
            setRevalAcctSelectorLineNum(null);
          }}
          initialValue={revalAcctSelectorLineNum !== null ? revalPreviewRows.find(r => r.lineNum === revalAcctSelectorLineNum)?.combo : undefined}
        />
      </>
    );
  };

  const renderRrTBTab = (tab: TabData) => {
    if (tab.loading || tab.rrGenerating) {
      return (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: REDWOOD.textSecondary, fontSize: 13 }}>
            {tab.rrGenerating ? 'Generating ReERP Trial Balance…' : 'Loading…'}
          </div>
        </div>
      );
    }
    if (tab.error) {
      return <Alert type="error" showIcon message="Error" description={tab.error} />;
    }

    const fmtAbs = (n: number) =>
      new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));

    // Net amount renderer: positive = Dr (blue), negative = Cr shown in brackets (red)
    const fmtNet = (n: number) => {
      if (!n) return <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.textSecondary }}>0.00</Text>;
      return n > 0
        ? <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.info }}>{fmtAbs(n)}</Text>
        : <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.primary }}>({fmtAbs(n)})</Text>;
    };

    const fmtDr = (n: number) =>
      n ? <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#237804' }}>{fmtAbs(n)}</Text>
        : <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.textSecondary }}>0.00</Text>;

    const fmtCr = (n: number) =>
      n ? <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.primary }}>{fmtAbs(n)}</Text>
        : <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.textSecondary }}>0.00</Text>;

    const accountTypeColor: Record<string, string> = { A: '#e6f7ff', L: '#fff7e6', O: '#f6ffed', R: '#fff0f6', E: '#f9f0ff' };
    const accountTypeLabel: Record<string, string> = { A: 'Asset', L: 'Liability', O: 'Equity', R: 'Revenue', E: 'Expense' };
    const typeTagColor: Record<string, string> = { A: 'blue', L: 'orange', O: 'green', R: 'magenta', E: 'purple' };

    // Filter
    let rows = tab.rrData.filter(r => {
      if (tab.selectedCompany && r.company !== tab.selectedCompany) return false;
      if (tab.selectedCurrency && r.currency_code !== tab.selectedCurrency) return false;
      return true;
    });

    if (tab.gridSearch.trim()) {
      const lc = tab.gridSearch.toLowerCase();
      rows = rows.filter(r =>
        r.account?.toLowerCase().includes(lc) ||
        r.account_desc?.toLowerCase().includes(lc) ||
        r.account_combination?.toLowerCase().includes(lc) ||
        r.company?.toLowerCase().includes(lc)
      );
    }

    // Group by account — sum net amounts across companies/currencies
    type GroupRow = {
      account: string; account_desc: string; account_type: string;
      opening: number; debit: number; credit: number; closing: number; ytd_net: number;
      entered_opening: number; entered_debit: number; entered_credit: number; entered_closing: number;
    };
    const grouped = new Map<string, GroupRow>();
    rows.forEach(r => {
      const k = r.account;
      if (!grouped.has(k)) {
        grouped.set(k, {
          account: r.account, account_desc: r.account_desc, account_type: r.account_type,
          opening: 0, debit: 0, credit: 0, closing: 0, ytd_net: 0,
          entered_opening: 0, entered_debit: 0, entered_credit: 0, entered_closing: 0,
        });
      }
      const g = grouped.get(k)!;
      g.opening         += r.opening         || 0;
      g.debit           += r.debit           || 0;
      g.credit          += r.credit          || 0;
      g.closing         += r.closing         || 0;
      g.ytd_net         += r.ytd_net         || 0;
      g.entered_opening += r.entered_opening || 0;
      g.entered_debit   += r.entered_debit   || 0;
      g.entered_credit  += r.entered_credit  || 0;
      g.entered_closing += r.entered_closing || 0;
    });

    const tableRows = Array.from(grouped.values()).sort((a, b) => a.account.localeCompare(b.account));

    const totals = tableRows.reduce(
      (acc, r) => ({
        opening:         acc.opening         + r.opening,
        debit:           acc.debit           + r.debit,
        credit:          acc.credit          + r.credit,
        closing:         acc.closing         + r.closing,
        ytd_net:         acc.ytd_net         + r.ytd_net,
        entered_opening: acc.entered_opening + r.entered_opening,
        entered_debit:   acc.entered_debit   + r.entered_debit,
        entered_credit:  acc.entered_credit  + r.entered_credit,
        entered_closing: acc.entered_closing + r.entered_closing,
      }),
      { opening: 0, debit: 0, credit: 0, closing: 0, ytd_net: 0,
        entered_opening: 0, entered_debit: 0, entered_credit: 0, entered_closing: 0 }
    );

    const columns = [
      {
        title: 'Type', dataIndex: 'account_type', key: 'account_type',
        width: 62, align: 'center' as const,
        render: (t: string) => (
          <Tag color={typeTagColor[t] || 'default'} style={{ fontSize: 10, margin: 0 }}>
            {accountTypeLabel[t] || t}
          </Tag>
        ),
      },
      {
        title: 'Account', dataIndex: 'account', key: 'account', width: 160,
        sorter: (a: GroupRow, b: GroupRow) => a.account.localeCompare(b.account),
        defaultSortOrder: 'ascend' as const,
        render: (v: string) => (
          <Space size={4}>
            <Text
              strong
              style={{ fontFamily: 'monospace', cursor: 'pointer', color: REDWOOD.info }}
              onClick={() => openDrillCombo(v, tab.rrData, tab.ledgerName, tab.periodName.replace(/^(?:ReERP|Dynamic):\s*/, ''))}
            >
              {v}
            </Text>
            <Tooltip title="View combinations">
              <ApartmentOutlined
                style={{ color: REDWOOD.info, cursor: 'pointer', fontSize: 13 }}
                onClick={() => openDrillCombo(v, tab.rrData, tab.ledgerName, tab.periodName.replace(/^(?:ReERP|Dynamic):\s*/, ''))}
              />
            </Tooltip>
            <Tooltip title="View journal lines">
              <UnorderedListOutlined
                style={{ color: '#722ed1', cursor: 'pointer', fontSize: 13 }}
                onClick={() => fetchDrillJournalLines(
                  tab.ledgerName,
                  tab.periodName.replace(/^(?:ReERP|Dynamic):\s*/, ''),
                  v,
                  null,
                )}
              />
            </Tooltip>
          </Space>
        ),
      },
      {
        title: 'Description', dataIndex: 'account_desc', key: 'account_desc',
        ellipsis: true,
        render: (v: string) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text>,
      },
      {
        title: <span style={{ color: '#1677ff' }}>Accounted</span>,
        children: [
          {
            title: 'Opening', dataIndex: 'opening', key: 'opening',
            align: 'right' as const, width: 130,
            sorter: (a: GroupRow, b: GroupRow) => a.opening - b.opening,
            render: fmtNet,
          },
          {
            title: 'Debit', dataIndex: 'debit', key: 'debit',
            align: 'right' as const, width: 130,
            sorter: (a: GroupRow, b: GroupRow) => a.debit - b.debit,
            render: fmtDr,
          },
          {
            title: 'Credit', dataIndex: 'credit', key: 'credit',
            align: 'right' as const, width: 130,
            sorter: (a: GroupRow, b: GroupRow) => a.credit - b.credit,
            render: fmtCr,
          },
          {
            title: 'Closing', dataIndex: 'closing', key: 'closing',
            align: 'right' as const, width: 130,
            sorter: (a: GroupRow, b: GroupRow) => a.closing - b.closing,
            render: fmtNet,
          },
        ],
      },
      {
        title: <span style={{ color: '#52c41a' }}>Entered</span>,
        children: [
          {
            title: 'Opening', dataIndex: 'entered_opening', key: 'entered_opening',
            align: 'right' as const, width: 130,
            sorter: (a: GroupRow, b: GroupRow) => a.entered_opening - b.entered_opening,
            render: fmtNet,
          },
          {
            title: 'Debit', dataIndex: 'entered_debit', key: 'entered_debit',
            align: 'right' as const, width: 130,
            sorter: (a: GroupRow, b: GroupRow) => a.entered_debit - b.entered_debit,
            render: fmtDr,
          },
          {
            title: 'Credit', dataIndex: 'entered_credit', key: 'entered_credit',
            align: 'right' as const, width: 130,
            sorter: (a: GroupRow, b: GroupRow) => a.entered_credit - b.entered_credit,
            render: fmtCr,
          },
          {
            title: 'Closing', dataIndex: 'entered_closing', key: 'entered_closing',
            align: 'right' as const, width: 130,
            sorter: (a: GroupRow, b: GroupRow) => a.entered_closing - b.entered_closing,
            render: fmtNet,
          },
        ],
      },
      {
        title: 'YTD Net', dataIndex: 'ytd_net', key: 'ytd_net',
        align: 'right' as const, width: 130,
        sorter: (a: GroupRow, b: GroupRow) => a.ytd_net - b.ytd_net,
        render: fmtNet,
      },
    ];

    const summaryRow = () => {
      const fmt = (v: number) =>
        new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
      const accValues   = [totals.opening, totals.debit, totals.credit, totals.closing];
      const entValues   = [totals.entered_opening, totals.entered_debit, totals.entered_credit, totals.entered_closing];
      return (
        <Table.Summary fixed>
          <Table.Summary.Row style={{ background: '#f0f0f0', fontWeight: 700 }}>
            <Table.Summary.Cell index={0} colSpan={3} align="right">
              <Text strong style={{ fontSize: 12 }}>TOTAL</Text>
            </Table.Summary.Cell>
            {accValues.map((v, i) => (
              <Table.Summary.Cell key={`acc-${i}`} index={i + 3} align="right">
                <Text strong style={{ fontFamily: 'monospace', fontSize: 11, color: '#1677ff' }}>{fmt(v)}</Text>
              </Table.Summary.Cell>
            ))}
            {entValues.map((v, i) => (
              <Table.Summary.Cell key={`ent-${i}`} index={i + 7} align="right">
                <Text strong style={{ fontFamily: 'monospace', fontSize: 11, color: '#52c41a' }}>{fmt(v)}</Text>
              </Table.Summary.Cell>
            ))}
            <Table.Summary.Cell index={11} align="right">
              <Text strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{fmt(totals.ytd_net)}</Text>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        </Table.Summary>
      );
    };

    return (
      <div>
        {/* Ledger / period info bar */}
        <Row gutter={8} style={{ marginBottom: 8 }}>
          <Col>
            <Tag icon={<BankOutlined />} color="geekblue" style={{ fontSize: 12, padding: '2px 8px' }}>
              {tab.ledgerName}
            </Tag>
          </Col>
          <Col>
            <Tag color="purple" style={{ fontSize: 12, padding: '2px 8px' }}>
              {tab.periodName.replace(/^(?:ReERP|Dynamic):\s*/, '')}
            </Tag>
          </Col>
          <Col>
            <Tag color="default" style={{ fontSize: 12, padding: '2px 8px' }}>
              {tableRows.length} accounts
            </Tag>
          </Col>
        </Row>

        {/* Filters */}
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Select placeholder="All Companies" allowClear showSearch optionFilterProp="label" style={{ width: '100%' }}
              value={tab.selectedCompany}
              onChange={v => updateTabFilter(tab.key, 'selectedCompany', v ?? null)}
              options={allCompanies.length > 0 ? allCompanies : tab.companies.map(c => ({ value: c, label: c }))}
            />
          </Col>
          <Col span={6}>
            <Select placeholder="All Currencies" allowClear style={{ width: '100%' }}
              value={tab.selectedCurrency}
              onChange={v => updateTabFilter(tab.key, 'selectedCurrency', v ?? null)}
              options={tab.currencies.map(c => ({ value: c, label: c }))}
            />
          </Col>
          <Col span={6}>
            <Input.Search placeholder="Search account / description…"
              value={tab.gridSearch}
              onChange={e => updateTabSearch(tab.key, e.target.value)}
              allowClear
            />
          </Col>
          <Col span={6} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Tag color="blue" style={{ lineHeight: '30px', fontSize: 12 }}>{tableRows.length} accounts</Tag>
            <Button
              icon={<FileExcelOutlined />}
              size="small"
              onClick={() => handleRrExport(tab, tableRows, totals)}
              style={{ color: REDWOOD.success, borderColor: REDWOOD.success }}
            >
              Excel
            </Button>
            <Button
              icon={<CheckCircleOutlined />}
              size="small"
              onClick={() => handleRrReconcile(tab)}
              style={{ color: REDWOOD.info, borderColor: REDWOOD.info }}
            >
              Reconcile
            </Button>
            <Tooltip title={
              tabs.find(t => t.tabType === 'fusion' && t.periodName === tab.periodName.replace(/^(?:ReERP|Dynamic):\s*/, ''))
                ? 'Export Fusion TB + ReERP TB to one Excel file (2 sheets)'
                : 'Open Fusion TB for this period first'
            }>
              <Button
                icon={<FileExcelOutlined />}
                size="small"
                onClick={() => handleExportBoth(tab)}
                style={{ background: REDWOOD.success, borderColor: REDWOOD.success, color: '#fff' }}
              >
                Export Both
              </Button>
            </Tooltip>
            <Button
              size="small"
              type="primary"
              disabled={(tabSelections[tab.key] || []).length !== 1}
              style={{ background: '#d46b08', borderColor: '#d46b08' }}
              onClick={() => openRevalModal(tab.key, (tabSelections[tab.key] || [])[0])}
            >
              Revalue
            </Button>
          </Col>
        </Row>

        {/* Account type legend */}
        <Space style={{ marginBottom: 10 }} wrap>
          {Object.entries(accountTypeLabel).map(([k, v]) => (
            <Tag key={k} color={typeTagColor[k]} style={{ fontSize: 11 }}>
              {v}{k === 'R' || k === 'E' ? ' — P&L (resets Jan)' : ' — BS (carries fwd)'}
            </Tag>
          ))}
          <Tag style={{ fontSize: 11, color: REDWOOD.info, borderColor: REDWOOD.info }}>positive = Dr balance</Tag>
          <Tag style={{ fontSize: 11, color: REDWOOD.primary, borderColor: REDWOOD.primary }}>(brackets) = Cr balance</Tag>
        </Space>

        <Table
          dataSource={tableRows}
          columns={columns}
          rowKey="account"
          size="small"
          pagination={false}
          scroll={{ x: 1600 }}
          summary={summaryRow}
          onRow={(r: any) => ({ style: { background: accountTypeColor[r.account_type] || '#fff' } })}
        />
      </div>
    );
  };

  // ── Render: Combinations drill-down modal ────────────────
  const renderDrillComboModal = () => {
    const fmtN = (n: number) =>
      new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

    const lc   = drillComboSearch.toLowerCase();
    const rows = drillComboRows.filter(r =>
      !lc ||
      r.account_combination?.toLowerCase().includes(lc) ||
      r.currency_code?.toLowerCase().includes(lc) ||
      r.company?.toLowerCase().includes(lc)
    );

    const cols = [
      { title: 'Combination', dataIndex: 'account_combination', key: 'account_combination',
        render: (v: string) => (
          <Space size={4}>
            <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text>
            <Tooltip title="View journal lines for this combination">
              <UnorderedListOutlined
                style={{ color: '#722ed1', cursor: 'pointer' }}
                onClick={() => {
                  // ledger and period are stored when the combos modal was opened
                  setDrillComboVisible(false);
                  fetchDrillJournalLines(drillComboLedger, drillComboPeriod, drillComboAccount, v);
                }}
              />
            </Tooltip>
          </Space>
        ),
      },
      { title: 'Co', dataIndex: 'company',       key: 'company',       width: 60 },
      { title: 'Ccy', dataIndex: 'currency_code', key: 'currency_code', width: 60 },
      { title: 'Opening', dataIndex: 'opening', key: 'opening', align: 'right' as const, width: 130,
        render: (n: number) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmtN(n ?? 0)}</Text> },
      { title: 'Debit',   dataIndex: 'debit',   key: 'debit',   align: 'right' as const, width: 130,
        render: (n: number) => <Text style={{ fontFamily: 'monospace', fontSize: 12, color: '#237804' }}>{fmtN(n ?? 0)}</Text> },
      { title: 'Credit',  dataIndex: 'credit',  key: 'credit',  align: 'right' as const, width: 130,
        render: (n: number) => <Text style={{ fontFamily: 'monospace', fontSize: 12, color: REDWOOD.primary }}>{fmtN(n ?? 0)}</Text> },
      { title: 'Closing', dataIndex: 'closing', key: 'closing', align: 'right' as const, width: 130,
        render: (n: number) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmtN(n ?? 0)}</Text> },
    ];

    return (
      <Modal
        open={drillComboVisible}
        onCancel={() => setDrillComboVisible(false)}
        footer={null}
        width={1100}
        title={
          <Space>
            <ApartmentOutlined style={{ color: REDWOOD.info }} />
            <span>Combinations — Account <Text strong style={{ fontFamily: 'monospace' }}>{drillComboAccount}</Text></span>
            <Tag color="blue">{rows.length} rows</Tag>
          </Space>
        }
      >
        <Input.Search
          placeholder="Search combination / currency / company…"
          value={drillComboSearch}
          onChange={e => setDrillComboSearch(e.target.value)}
          allowClear
          style={{ marginBottom: 12 }}
        />
        <Table
          dataSource={rows}
          columns={cols}
          rowKey={r => `${r.account_combination}-${r.currency_code}`}
          size="small"
          pagination={false}
          scroll={{ x: 800, y: 400 }}
        />
      </Modal>
    );
  };

  // ── Render: Journal Lines drill-down modal ────────────────
  const renderDrillJnlModal = () => {
    const fmtN = (n: number) =>
      new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

    const lc   = drillJnlSearch.toLowerCase();
    const rows = drillJnlData.filter(r =>
      !lc ||
      r.je_name?.toLowerCase().includes(lc) ||
      r.account_combination?.toLowerCase().includes(lc) ||
      r.line_description?.toLowerCase().includes(lc) ||
      r.je_description?.toLowerCase().includes(lc) ||
      r.source?.toLowerCase().includes(lc) ||
      r.category?.toLowerCase().includes(lc)
    );

    const totalDr = rows.reduce((s, r) => s + (r.accounted_dr || 0), 0);
    const totalCr = rows.reduce((s, r) => s + (r.accounted_cr || 0), 0);

    const cols = [
      { title: 'Journal Name', dataIndex: 'je_name', key: 'je_name', width: 180, ellipsis: true,
        render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
      { title: 'Source', dataIndex: 'source', key: 'source', width: 100, ellipsis: true },
      { title: 'Category', dataIndex: 'category', key: 'category', width: 100, ellipsis: true },
      { title: 'Date', dataIndex: 'effective_date', key: 'effective_date', width: 100,
        render: (v: string) => v ? new Date(v).toLocaleDateString() : '—' },
      { title: 'Combination', dataIndex: 'account_combination', key: 'account_combination', width: 220,
        render: (v: string) => <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</Text> },
      { title: 'Ccy', dataIndex: 'currency_code', key: 'currency_code', width: 55 },
      { title: 'Ent Dr', dataIndex: 'entered_dr', key: 'entered_dr', align: 'right' as const, width: 120,
        render: (n: number) => n ? <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#237804' }}>{fmtN(n)}</Text> : <Text style={{ color: '#aaa' }}>0.00</Text> },
      { title: 'Ent Cr', dataIndex: 'entered_cr', key: 'entered_cr', align: 'right' as const, width: 120,
        render: (n: number) => n ? <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.primary }}>{fmtN(n)}</Text> : <Text style={{ color: '#aaa' }}>0.00</Text> },
      { title: 'Acc Dr', dataIndex: 'accounted_dr', key: 'accounted_dr', align: 'right' as const, width: 130,
        render: (n: number) => n ? <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#237804' }}>{fmtN(n)}</Text> : <Text style={{ color: '#aaa' }}>0.00</Text> },
      { title: 'Acc Cr', dataIndex: 'accounted_cr', key: 'accounted_cr', align: 'right' as const, width: 130,
        render: (n: number) => n ? <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.primary }}>{fmtN(n)}</Text> : <Text style={{ color: '#aaa' }}>0.00</Text> },
      { title: 'Description', dataIndex: 'line_description', key: 'line_description', ellipsis: true,
        render: (v: string) => <Text style={{ fontSize: 11 }}>{v || '—'}</Text> },
    ];

    const summary = () => (
      <Table.Summary fixed>
        <Table.Summary.Row style={{ background: '#f0f0f0', fontWeight: 700 }}>
          <Table.Summary.Cell index={0} colSpan={7} align="right">
            <Text strong style={{ fontSize: 12 }}>TOTAL ({rows.length} lines)</Text>
          </Table.Summary.Cell>
          <Table.Summary.Cell index={7} align="right">
            <Text strong style={{ fontFamily: 'monospace', fontSize: 11, color: '#237804' }}>{fmtN(totalDr)}</Text>
          </Table.Summary.Cell>
          <Table.Summary.Cell index={8} align="right">
            <Text strong style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.primary }}>{fmtN(totalCr)}</Text>
          </Table.Summary.Cell>
          <Table.Summary.Cell index={9} colSpan={2} />
        </Table.Summary.Row>
      </Table.Summary>
    );

    return (
      <Modal
        open={drillJnlVisible}
        onCancel={() => setDrillJnlVisible(false)}
        footer={null}
        width={1300}
        title={
          <Space>
            <UnorderedListOutlined style={{ color: '#722ed1' }} />
            <span>Journal Lines — Account <Text strong style={{ fontFamily: 'monospace' }}>{drillJnlAccount}</Text></span>
            {drillJnlCombo && <Tag color="purple" style={{ fontFamily: 'monospace', fontSize: 11 }}>{drillJnlCombo}</Tag>}
            <Tag color="blue">{drillJnlPeriod}</Tag>
            {!drillJnlLoading && <Tag color="default">{rows.length} lines</Tag>}
          </Space>
        }
      >
        {drillJnlLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
        ) : drillJnlError ? (
          <Alert type="error" showIcon message={drillJnlError} />
        ) : (
          <>
            <Input.Search
              placeholder="Search journal name / description / source / category…"
              value={drillJnlSearch}
              onChange={e => setDrillJnlSearch(e.target.value)}
              allowClear
              style={{ marginBottom: 12 }}
            />
            <Table
              dataSource={rows}
              columns={cols}
              rowKey={r => `${r.line_id}-${r.je_header_id}-${r.line_num}`}
              size="small"
              pagination={false}
              scroll={{ x: 1200, y: 450 }}
              summary={summary}
            />
          </>
        )}
      </Modal>
    );
  };

  // ── Render: Dynamic YTD Trial Balance tab ─────────────────
  const renderRrYtdTBTab = (tab: TabData) => {
    if (tab.loading) {
      return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;
    }
    if (tab.error) {
      return <Alert type="error" showIcon message="Error" description={tab.error} />;
    }

    const fmtAbs = (n: number) =>
      new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));

    const fmtNet = (n: number) => {
      if (!n) return <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.textSecondary }}>0.00</Text>;
      return n > 0
        ? <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.info }}>{fmtAbs(n)}</Text>
        : <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.primary }}>({fmtAbs(n)})</Text>;
    };
    const fmtDr = (n: number) =>
      n ? <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#237804' }}>{fmtAbs(n)}</Text>
        : <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.textSecondary }}>0.00</Text>;
    const fmtCr = (n: number) =>
      n ? <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.primary }}>{fmtAbs(n)}</Text>
        : <Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.textSecondary }}>0.00</Text>;

    const accountTypeColor: Record<string, string> = { A: '#e6f7ff', L: '#fff7e6', O: '#f6ffed', R: '#fff0f6', E: '#f9f0ff' };
    const accountTypeLabel: Record<string, string> = { A: 'Asset', L: 'Liability', O: 'Equity', R: 'Revenue', E: 'Expense' };
    const typeTagColor: Record<string, string> = { A: 'blue', L: 'orange', O: 'green', R: 'magenta', E: 'purple' };

    let rows = tab.rrData.filter(r => {
      if (tab.selectedCompany && r.company !== tab.selectedCompany) return false;
      if (tab.selectedCurrency && r.currency_code !== tab.selectedCurrency) return false;
      return true;
    });

    if (tab.gridSearch.trim()) {
      const lc = tab.gridSearch.toLowerCase();
      rows = rows.filter(r =>
        r.account?.toLowerCase().includes(lc) ||
        r.account_desc?.toLowerCase().includes(lc) ||
        r.account_combination?.toLowerCase().includes(lc) ||
        r.company?.toLowerCase().includes(lc)
      );
    }

    type YtdGroupRow = {
      account: string; account_desc: string; account_type: string;
      ytd_opening: number; ytd_debit: number; ytd_credit: number; closing: number;
      ytd_entered_opening: number; ytd_entered_debit: number; ytd_entered_credit: number; entered_closing: number;
    };
    const grouped = new Map<string, YtdGroupRow>();
    rows.forEach(r => {
      const k = r.account;
      if (!grouped.has(k)) {
        grouped.set(k, {
          account: r.account, account_desc: r.account_desc, account_type: r.account_type,
          ytd_opening: 0, ytd_debit: 0, ytd_credit: 0, closing: 0,
          ytd_entered_opening: 0, ytd_entered_debit: 0, ytd_entered_credit: 0, entered_closing: 0,
        });
      }
      const g = grouped.get(k)!;
      g.ytd_opening         += r.ytd_opening         || 0;
      g.ytd_debit           += r.ytd_debit           || 0;
      g.ytd_credit          += r.ytd_credit          || 0;
      g.closing             += r.closing             || 0;
      g.ytd_entered_opening += r.ytd_entered_opening || 0;
      g.ytd_entered_debit   += r.ytd_entered_debit   || 0;
      g.ytd_entered_credit  += r.ytd_entered_credit  || 0;
      g.entered_closing     += r.entered_closing     || 0;
    });

    const tableRows = Array.from(grouped.values()).sort((a, b) => a.account.localeCompare(b.account));

    const totals = tableRows.reduce(
      (acc, r) => ({
        ytd_opening:         acc.ytd_opening         + r.ytd_opening,
        ytd_debit:           acc.ytd_debit           + r.ytd_debit,
        ytd_credit:          acc.ytd_credit          + r.ytd_credit,
        closing:             acc.closing             + r.closing,
        ytd_entered_opening: acc.ytd_entered_opening + r.ytd_entered_opening,
        ytd_entered_debit:   acc.ytd_entered_debit   + r.ytd_entered_debit,
        ytd_entered_credit:  acc.ytd_entered_credit  + r.ytd_entered_credit,
        entered_closing:     acc.entered_closing     + r.entered_closing,
      }),
      { ytd_opening: 0, ytd_debit: 0, ytd_credit: 0, closing: 0,
        ytd_entered_opening: 0, ytd_entered_debit: 0, ytd_entered_credit: 0, entered_closing: 0 }
    );

    const allCompanies = [...new Set(tab.rrData.map(r => r.company).filter(Boolean))]
      .sort()
      .map(c => ({ value: c, label: c }));

    const columns = [
      {
        title: 'Type', dataIndex: 'account_type', key: 'account_type',
        width: 62, align: 'center' as const,
        render: (t: string) => (
          <Tag color={typeTagColor[t] || 'default'} style={{ fontSize: 10, margin: 0 }}>
            {accountTypeLabel[t] || t}
          </Tag>
        ),
      },
      {
        title: <span style={{ color: '#d46b08' }}>Account</span>, dataIndex: 'account', key: 'account', width: 160,
        sorter: (a: YtdGroupRow, b: YtdGroupRow) => a.account.localeCompare(b.account),
        defaultSortOrder: 'ascend' as const,
        render: (v: string) => (
          <Text strong style={{ fontFamily: 'monospace', color: '#d46b08' }}>{v}</Text>
        ),
      },
      {
        title: 'Description', dataIndex: 'account_desc', key: 'account_desc',
        width: 200, ellipsis: true,
        render: (v: string) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text>,
      },
      {
        title: <span style={{ color: '#1677ff' }}>Accounted (YTD)</span>,
        children: [
          {
            title: 'YTD Opening', dataIndex: 'ytd_opening', key: 'ytd_opening',
            align: 'right' as const, width: 130,
            sorter: (a: YtdGroupRow, b: YtdGroupRow) => a.ytd_opening - b.ytd_opening,
            render: fmtNet,
          },
          {
            title: 'YTD Debit', dataIndex: 'ytd_debit', key: 'ytd_debit',
            align: 'right' as const, width: 130,
            sorter: (a: YtdGroupRow, b: YtdGroupRow) => a.ytd_debit - b.ytd_debit,
            render: fmtDr,
          },
          {
            title: 'YTD Credit', dataIndex: 'ytd_credit', key: 'ytd_credit',
            align: 'right' as const, width: 130,
            sorter: (a: YtdGroupRow, b: YtdGroupRow) => a.ytd_credit - b.ytd_credit,
            render: fmtCr,
          },
          {
            title: 'Closing', dataIndex: 'closing', key: 'closing',
            align: 'right' as const, width: 130,
            sorter: (a: YtdGroupRow, b: YtdGroupRow) => a.closing - b.closing,
            render: fmtNet,
          },
        ],
      },
      ...(tab.showEntered ? [{
        title: <span style={{ color: '#08979c' }}>Entered (YTD)</span>,
        onHeaderCell: () => ({ style: { background: '#e6fffb' } }),
        children: [
          {
            title: 'YTD Opening', dataIndex: 'ytd_entered_opening', key: 'ytd_entered_opening',
            align: 'right' as const, width: 130,
            sorter: (a: YtdGroupRow, b: YtdGroupRow) => a.ytd_entered_opening - b.ytd_entered_opening,
            render: fmtNet,
            onHeaderCell: () => ({ style: { background: '#e6fffb' } }),
            onCell: () => ({ style: { background: '#f0fffe' } }),
          },
          {
            title: 'YTD Debit', dataIndex: 'ytd_entered_debit', key: 'ytd_entered_debit',
            align: 'right' as const, width: 130,
            sorter: (a: YtdGroupRow, b: YtdGroupRow) => a.ytd_entered_debit - b.ytd_entered_debit,
            render: fmtDr,
            onHeaderCell: () => ({ style: { background: '#e6fffb' } }),
            onCell: () => ({ style: { background: '#f0fffe' } }),
          },
          {
            title: 'YTD Credit', dataIndex: 'ytd_entered_credit', key: 'ytd_entered_credit',
            align: 'right' as const, width: 130,
            sorter: (a: YtdGroupRow, b: YtdGroupRow) => a.ytd_entered_credit - b.ytd_entered_credit,
            render: fmtCr,
            onHeaderCell: () => ({ style: { background: '#e6fffb' } }),
            onCell: () => ({ style: { background: '#f0fffe' } }),
          },
          {
            title: 'Closing', dataIndex: 'entered_closing', key: 'entered_closing',
            align: 'right' as const, width: 130,
            sorter: (a: YtdGroupRow, b: YtdGroupRow) => a.entered_closing - b.entered_closing,
            render: fmtNet,
            onHeaderCell: () => ({ style: { background: '#e6fffb' } }),
            onCell: () => ({ style: { background: '#f0fffe' } }),
          },
        ],
      }] : []),
    ];

    const fmt = (v: number) =>
      new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

    const summaryRow = () => {
      const accValues = [totals.ytd_opening, totals.ytd_debit, totals.ytd_credit, totals.closing];
      const entValues = [totals.ytd_entered_opening, totals.ytd_entered_debit, totals.ytd_entered_credit, totals.entered_closing];
      return (
        <Table.Summary fixed>
          <Table.Summary.Row style={{ background: '#f0f0f0', fontWeight: 700 }}>
            <Table.Summary.Cell index={0} colSpan={3} align="right">
              <Text strong style={{ fontSize: 12 }}>TOTAL</Text>
            </Table.Summary.Cell>
            {accValues.map((v, i) => (
              <Table.Summary.Cell key={`acc-${i}`} index={i + 3} align="right">
                <Text strong style={{ fontFamily: 'monospace', fontSize: 11, color: '#1677ff' }}>{fmt(v)}</Text>
              </Table.Summary.Cell>
            ))}
            {tab.showEntered && entValues.map((v, i) => (
              <Table.Summary.Cell key={`ent-${i}`} index={i + 7} align="right">
                <Text strong style={{ fontFamily: 'monospace', fontSize: 11, color: '#08979c' }}>{fmt(v)}</Text>
              </Table.Summary.Cell>
            ))}
          </Table.Summary.Row>
        </Table.Summary>
      );
    };

    return (
      <div>
        <Row gutter={8} style={{ marginBottom: 8 }}>
          <Col>
            <Tag icon={<BankOutlined />} color="geekblue" style={{ fontSize: 12, padding: '2px 8px' }}>
              {tab.ledgerName}
            </Tag>
          </Col>
          <Col>
            <Tag color="blue" style={{ fontSize: 12, padding: '2px 8px' }}>
              {tab.periodName.replace(/^YTD:\s*/, '')}
            </Tag>
          </Col>
          <Col>
            <Tag color="default" style={{ fontSize: 12, padding: '2px 8px' }}>
              {tableRows.length} accounts
            </Tag>
          </Col>
          <Col>
            <Tag color="blue" style={{ fontSize: 12, padding: '2px 8px', fontWeight: 600 }}>
              YTD — cumulative from period 1 of fiscal year
            </Tag>
          </Col>
        </Row>

        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Select placeholder="All Companies" allowClear showSearch optionFilterProp="label" style={{ width: '100%' }}
              value={tab.selectedCompany}
              onChange={v => updateTabFilter(tab.key, 'selectedCompany', v ?? null)}
              options={allCompanies.length > 0 ? allCompanies : tab.companies.map(c => ({ value: c, label: c }))}
            />
          </Col>
          <Col span={6}>
            <Select placeholder="All Currencies" allowClear style={{ width: '100%' }}
              value={tab.selectedCurrency}
              onChange={v => updateTabFilter(tab.key, 'selectedCurrency', v ?? null)}
              options={tab.currencies.map(c => ({ value: c, label: c }))}
            />
          </Col>
          <Col span={6}>
            <Input.Search placeholder="Search account / description…"
              value={tab.gridSearch}
              onChange={e => updateTabSearch(tab.key, e.target.value)}
              allowClear
            />
          </Col>
          <Col span={6} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag color="blue" style={{ lineHeight: '30px', fontSize: 12 }}>{tableRows.length} accounts</Tag>
            <Switch
              size="small"
              checked={tab.showEntered}
              onChange={v => updateTabEntered(tab.key, v)}
              checkedChildren="Entered ✓"
              unCheckedChildren="Entered"
            />
            <Button
              size="small"
              type="primary"
              disabled={(tabSelections[tab.key] || []).length !== 1}
              style={{ background: '#d46b08', borderColor: '#d46b08' }}
              onClick={() => openRevalModal(tab.key, (tabSelections[tab.key] || [])[0])}
            >
              Revalue
            </Button>
          </Col>
        </Row>

        <Space style={{ marginBottom: 10 }} wrap>
          {Object.entries(accountTypeLabel).map(([k, v]) => (
            <Tag key={k} color={typeTagColor[k]} style={{ fontSize: 11 }}>
              {v}{k === 'R' || k === 'E' ? ' — P&L (resets each fiscal year)' : ' — BS (carries forward)'}
            </Tag>
          ))}
          <Tag style={{ fontSize: 11, color: REDWOOD.info, borderColor: REDWOOD.info }}>positive = Dr balance</Tag>
          <Tag style={{ fontSize: 11, color: REDWOOD.primary, borderColor: REDWOOD.primary }}>(brackets) = Cr balance</Tag>
        </Space>

        <Table
          dataSource={tableRows}
          columns={columns}
          rowKey="account"
          size="small"
          pagination={false}
          scroll={{ x: 1600 }}
          summary={summaryRow}
          rowSelection={{
            type: 'checkbox',
            selectedRowKeys: tabSelections[tab.key] || [],
            onChange: keys => setTabSelections(prev => ({ ...prev, [tab.key]: keys as string[] })),
          }}
          onRow={(r: any) => ({ style: { background: accountTypeColor[r.account_type] || '#fff' } })}
        />
      </div>
    );
  };

  // Build tab items
  const tabItems = [
    {
      key: 'periods',
      label: (
        <span>
          <CalendarOutlined style={{ marginRight: 8 }} />
          Periods
        </span>
      ),
      children: renderPeriodsTab(),
      closable: false,
    },
    ...tabs.map(tab => ({
      key: tab.key,
      label: (
        <span>
          {tab.tabType === 'reerp'
            ? <BarChartOutlined style={{ marginRight: 6, color: REDWOOD.success }} />
            : tab.tabType === 'reerp-dynamic'
            ? <ThunderboltOutlined style={{ marginRight: 6, color: '#722ed1' }} />
            : tab.tabType === 'reerp-ytd'
            ? <BarChartOutlined style={{ marginRight: 6, color: '#0958d9' }} />
            : <TableOutlined style={{ marginRight: 8 }} />}
          {tab.periodName}
        </span>
      ),
      children: tab.tabType === 'reerp-ytd'
        ? renderRrYtdTBTab(tab)
        : (tab.tabType === 'reerp' || tab.tabType === 'reerp-dynamic') ? renderRrTBTab(tab) : renderTBTab(tab),
      closable: true,
    })),
    ...(lsVisible ? [{
      key: 'lines-summary',
      label: (
        <span>
          <BarsOutlined style={{ marginRight: 6, color: REDWOOD.primary }} />
          Lines Summary
          {lsPeriod && <Tag style={{ marginLeft: 6, fontSize: 10 }}>{lsPeriod}</Tag>}
        </span>
      ),
      children: renderLinesSummaryTab(),
      closable: true,
    }] : []),
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.surfaceSecondary }}>
      <Content style={{ padding: '24px 48px' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <Breadcrumb
            items={[
              { title: <Link to="/"><HomeOutlined /> Home</Link> },
              { title: <Link to="/gl">General Ledger</Link> },
              { title: 'Trial Balance' },
            ]}
            style={{ marginBottom: 16 }}
          />

          <Row justify="space-between" align="middle">
            <Col>
              <Title level={2} style={{ margin: 0, color: REDWOOD.textPrimary }}>
                <TableOutlined style={{ marginRight: 12, color: REDWOOD.primary }} />
                Trial Balance
              </Title>
              <Text type="secondary">
                View and analyze trial balance by period with company and currency filters
              </Text>
            </Col>
            <Col>
              <Space>
                <Button
                  icon={<BarsOutlined />}
                  onClick={handleOpenLinesSummary}
                  style={{ borderColor: REDWOOD.primary, color: REDWOOD.primary }}
                >
                  Lines Summary
                </Button>
                <Button
                  icon={<ApiOutlined />}
                  type={apiPanelVisible ? 'primary' : 'default'}
                  style={apiPanelVisible
                    ? { background: REDWOOD.info, borderColor: REDWOOD.info }
                    : { borderColor: REDWOOD.info, color: REDWOOD.info }
                  }
                  onClick={() => setApiPanelVisible(v => !v)}
                >
                  API
                </Button>
              </Space>
            </Col>
          </Row>

          {/* API Panel */}
          {apiPanelVisible && (
            <Card
              size="small"
              style={{ marginTop: 12, background: '#f5f8ff', border: `1px solid ${REDWOOD.info}`, borderRadius: 8 }}
              title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /><Text strong style={{ color: REDWOOD.info }}>API Endpoints — Trial Balance</Text></Space>}
            >
              {Object.entries(apiCalls).map(([key, call]) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <Space align="start" wrap>
                    <Tag color={call.method === 'POST' ? 'blue' : 'green'} style={{ fontFamily: 'monospace' }}>{call.method}</Tag>
                    <Text strong style={{ fontSize: 12 }}>{call.label}</Text>
                    {call.method === 'GET' && (
                      <Button
                        size="small"
                        icon={call.running ? <LoadingOutlined /> : <ApiOutlined />}
                        onClick={() => testEndpoint(key)}
                        disabled={call.running || !call.url}
                      >
                        Test
                      </Button>
                    )}
                    {call.status !== null && (
                      <Tag
                        color={call.ok ? 'success' : 'error'}
                        icon={call.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                      >
                        {call.status} · {call.durationMs}ms
                      </Tag>
                    )}
                  </Space>
                  {call.url && (
                    <div style={{ marginTop: 2 }}>
                      <Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>{call.url}</Text>
                    </div>
                  )}
                  {call.body && (
                    <pre style={{ fontSize: 11, background: '#fff', border: '1px solid #e5e5e5', padding: 6, borderRadius: 4, maxHeight: 120, overflow: 'auto', marginTop: 4 }}>
                      {call.body}
                    </pre>
                  )}
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* Main Content - Tabs */}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          type="editable-card"
          hideAdd
          onEdit={(targetKey, action) => {
            if (action === 'remove' && typeof targetKey === 'string') {
              closeTab(targetKey);
            }
          }}
          items={tabItems}
          style={{
            background: REDWOOD.surface,
            padding: 16,
            borderRadius: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        />

        {/* Account Detail Modal */}
        <Modal
          title={
            <Space>
              <Text strong style={{ fontFamily: 'monospace', color: REDWOOD.primary }}>
                {detailModalData?.account}
              </Text>
              <Text type="secondary">-</Text>
              <Text>{detailModalData?.account_desc}</Text>
            </Space>
          }
          open={detailModalVisible}
          onCancel={() => setDetailModalVisible(false)}
          footer={null}
          width={1000}
        >
          {detailModalData && (
            <Table
              dataSource={detailModalData.rows}
              rowKey={(record, index) => `${record.company}-${record.currency}-${record.sub_account}-${index}`}
              size="small"
              pagination={{ pageSize: 20 }}
              scroll={{ x: 900 }}
              columns={[
                {
                  title: 'Company',
                  dataIndex: 'company',
                  key: 'company',
                  width: 80,
                  render: (text: string) => <Text style={{ fontFamily: 'monospace' }}>{text}</Text>,
                },
                {
                  title: 'LOB',
                  dataIndex: 'lob',
                  key: 'lob',
                  width: 60,
                  render: (text: string) => <Text style={{ fontFamily: 'monospace' }}>{text}</Text>,
                },
                {
                  title: 'Dept',
                  dataIndex: 'department',
                  key: 'department',
                  width: 60,
                  render: (text: string) => <Text style={{ fontFamily: 'monospace' }}>{text}</Text>,
                },
                {
                  title: 'Sub Acct',
                  dataIndex: 'sub_account',
                  key: 'sub_account',
                  width: 80,
                  render: (text: string) => <Text style={{ fontFamily: 'monospace' }}>{text}</Text>,
                },
                {
                  title: 'Analysis',
                  dataIndex: 'analysis',
                  key: 'analysis',
                  width: 70,
                  render: (text: string) => <Text style={{ fontFamily: 'monospace' }}>{text}</Text>,
                },
                {
                  title: 'IC',
                  dataIndex: 'intercompany',
                  key: 'intercompany',
                  width: 50,
                  render: (text: string) => <Text style={{ fontFamily: 'monospace' }}>{text}</Text>,
                },
                {
                  title: 'Currency',
                  dataIndex: 'currency',
                  key: 'currency',
                  width: 70,
                  render: (text: string) => <Tag>{text}</Tag>,
                },
                {
                  title: 'Opening',
                  dataIndex: 'opening_balance',
                  key: 'opening_balance',
                  width: 110,
                  align: 'right' as const,
                  render: (value: number) => (
                    <Text style={{ fontFamily: 'monospace', color: value < 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                      {formatCurrency(value)}
                    </Text>
                  ),
                },
                {
                  title: 'Debit',
                  dataIndex: 'debit',
                  key: 'debit',
                  width: 110,
                  align: 'right' as const,
                  render: (value: number) => (
                    <Text style={{ fontFamily: 'monospace', color: value > 0 ? REDWOOD.info : REDWOOD.textSecondary }}>
                      {formatCurrency(value)}
                    </Text>
                  ),
                },
                {
                  title: 'Credit',
                  dataIndex: 'credit',
                  key: 'credit',
                  width: 110,
                  align: 'right' as const,
                  render: (value: number) => (
                    <Text style={{ fontFamily: 'monospace', color: value > 0 ? REDWOOD.success : REDWOOD.textSecondary }}>
                      {formatCurrency(value)}
                    </Text>
                  ),
                },
                {
                  title: 'Closing',
                  dataIndex: 'closing_balance',
                  key: 'closing_balance',
                  width: 110,
                  align: 'right' as const,
                  render: (value: number) => (
                    <Text strong style={{ fontFamily: 'monospace', color: value < 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                      {formatCurrency(value)}
                    </Text>
                  ),
                },
              ]}
              summary={(pageData) => {
                const totals = pageData.reduce(
                  (acc, row) => ({
                    opening: acc.opening + (row.opening_balance || 0),
                    debit: acc.debit + (row.debit || 0),
                    credit: acc.credit + (row.credit || 0),
                    closing: acc.closing + (row.closing_balance || 0),
                  }),
                  { opening: 0, debit: 0, credit: 0, closing: 0 }
                );
                return (
                  <Table.Summary.Row style={{ background: REDWOOD.surfaceSecondary }}>
                    <Table.Summary.Cell index={0} colSpan={7}>
                      <Text strong>Page Total</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">
                      <Text strong style={{ fontFamily: 'monospace' }}>{formatCurrency(totals.opening)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8} align="right">
                      <Text strong style={{ fontFamily: 'monospace', color: REDWOOD.info }}>{formatCurrency(totals.debit)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={9} align="right">
                      <Text strong style={{ fontFamily: 'monospace', color: REDWOOD.success }}>{formatCurrency(totals.credit)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={10} align="right">
                      <Text strong style={{ fontFamily: 'monospace' }}>{formatCurrency(totals.closing)}</Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                );
              }}
            />
          )}
        </Modal>

        {/* ── TB Drill-down modals ─────────────────────────────────────── */}
        {renderDrillComboModal()}
        {renderDrillJnlModal()}

        {/* ── ReERP ↔ Fusion Reconciliation Modal ──────────────────────── */}
        <Modal
          title={
            <Space>
              <CheckCircleOutlined style={{ color: REDWOOD.info }} />
              <span>Reconciliation — Fusion TB vs ReERP TB</span>
              {reconPeriod && <Tag color="blue">{reconPeriod}</Tag>}
              <Tag color="gold">Fusion: AED | ReERP: all currencies</Tag>
            </Space>
          }
          open={reconVisible}
          onCancel={() => setReconVisible(false)}
          footer={null}
          width="96vw"
          style={{ top: 20 }}
          bodyStyle={{ padding: '12px 16px' }}
        >
          {(() => {
            const fmt = (n: number) =>
              new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
            const fmtDiff = (n: number) => {
              if (Math.abs(n) < 0.005) return <Text style={{ color: REDWOOD.success, fontFamily: 'monospace', fontSize: 11 }}>—</Text>;
              return <Text style={{ color: REDWOOD.primary, fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>
                {n > 0 ? '+' : ''}{fmt(n)}
              </Text>;
            };

            const matchedCount = reconData.filter(r => r.matched).length;
            const diffCount    = reconData.length - matchedCount;

            let visible = reconData;
            if (reconFilter === 'diff')    visible = reconData.filter(r => !r.matched);
            if (reconFilter === 'matched') visible = reconData.filter(r =>  r.matched);
            if (reconSearch.trim()) {
              const lc = reconSearch.toLowerCase();
              visible = visible.filter(r =>
                r.account.toLowerCase().includes(lc) ||
                r.account_desc?.toLowerCase().includes(lc)
              );
            }

            const amtCell = (f: number, r: number) => (
              <Space direction="vertical" size={0} style={{ width: '100%' }}>
                <Text style={{ fontFamily: 'monospace', fontSize: 10, color: REDWOOD.textSecondary }}>F: {fmt(f)}</Text>
                <Text style={{ fontFamily: 'monospace', fontSize: 10, color: REDWOOD.info }}>R: {fmt(r)}</Text>
                <Divider style={{ margin: '2px 0' }} />
                {fmtDiff(r - f)}
              </Space>
            );

            const reconColumns = [
              {
                title: 'Account', dataIndex: 'account', key: 'account', width: 110, fixed: 'left' as const,
                sorter: (a: ReconRecord, b: ReconRecord) => a.account.localeCompare(b.account),
                defaultSortOrder: 'ascend' as const,
                render: (v: string) => <Text strong style={{ fontFamily: 'monospace' }}>{v}</Text>,
              },
              {
                title: 'Description', dataIndex: 'account_desc', key: 'account_desc', width: 200, ellipsis: true,
                render: (v: string) => <Text style={{ fontSize: 11 }}>{v || '—'}</Text>,
              },
              {
                title: 'Status', key: 'status', width: 80, align: 'center' as const, fixed: 'left' as const,
                filters: [{ text: 'Matched', value: true }, { text: 'Difference', value: false }],
                onFilter: (value: any, record: ReconRecord) => record.matched === value,
                render: (_: any, r: ReconRecord) => r.matched
                  ? <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 10 }}>Match</Tag>
                  : <Tag color="error"   icon={<CloseCircleOutlined />} style={{ fontSize: 10 }}>Diff</Tag>,
              },
              {
                title: 'Opening', key: 'opening', width: 140, align: 'center' as const,
                render: (_: any, r: ReconRecord) => amtCell(r.fusionOpening, r.rrOpening),
                sorter: (a: ReconRecord, b: ReconRecord) => Math.abs(a.diffOpening) - Math.abs(b.diffOpening),
              },
              {
                title: 'Debit (PTD)', key: 'debit', width: 140, align: 'center' as const,
                render: (_: any, r: ReconRecord) => amtCell(r.fusionDebit, r.rrDebit),
                sorter: (a: ReconRecord, b: ReconRecord) => Math.abs(a.diffDebit) - Math.abs(b.diffDebit),
              },
              {
                title: 'Credit (PTD)', key: 'credit', width: 140, align: 'center' as const,
                render: (_: any, r: ReconRecord) => amtCell(r.fusionCredit, r.rrCredit),
                sorter: (a: ReconRecord, b: ReconRecord) => Math.abs(a.diffCredit) - Math.abs(b.diffCredit),
              },
              {
                title: 'Closing', key: 'closing', width: 140, align: 'center' as const,
                render: (_: any, r: ReconRecord) => amtCell(r.fusionClosing, r.rrClosing),
                sorter: (a: ReconRecord, b: ReconRecord) => Math.abs(a.diffClosing) - Math.abs(b.diffClosing),
              },
              {
                title: 'In', key: 'in', width: 80, align: 'center' as const,
                render: (_: any, r: ReconRecord) => (
                  <Space direction="vertical" size={0}>
                    <Tag color={r.inFusion ? 'blue'  : 'default'} style={{ fontSize: 9, marginBottom: 2 }}>Fusion</Tag>
                    <Tag color={r.inRr     ? 'green' : 'default'} style={{ fontSize: 9 }}>ReERP</Tag>
                  </Space>
                ),
              },
            ];

            return (
              <>
                {/* Summary bar */}
                <Row gutter={12} style={{ marginBottom: 12 }}>
                  <Col span={4}>
                    <Card size="small" style={{ textAlign: 'center', borderColor: REDWOOD.success, background: '#f6ffed' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: REDWOOD.success }}>{matchedCount}</div>
                      <div style={{ fontSize: 11, color: REDWOOD.textSecondary }}>Matched</div>
                    </Card>
                  </Col>
                  <Col span={4}>
                    <Card size="small" style={{ textAlign: 'center', borderColor: diffCount ? REDWOOD.error : REDWOOD.border, background: diffCount ? '#fff2f0' : '#fff' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: diffCount ? REDWOOD.error : REDWOOD.textSecondary }}>{diffCount}</div>
                      <div style={{ fontSize: 11, color: REDWOOD.textSecondary }}>Differences</div>
                    </Card>
                  </Col>
                  <Col span={4}>
                    <Card size="small" style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: REDWOOD.neutral }}>{reconData.length}</div>
                      <div style={{ fontSize: 11, color: REDWOOD.textSecondary }}>Total Accounts</div>
                    </Card>
                  </Col>
                  <Col span={6} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Button size="small" type={reconFilter === 'all'     ? 'primary' : 'default'} onClick={() => setReconFilter('all')}>All</Button>
                    <Button size="small" type={reconFilter === 'diff'    ? 'primary' : 'default'} onClick={() => setReconFilter('diff')}    danger={reconFilter !== 'diff'    && diffCount > 0}>Differences ({diffCount})</Button>
                    <Button size="small" type={reconFilter === 'matched' ? 'primary' : 'default'} onClick={() => setReconFilter('matched')}>Matched ({matchedCount})</Button>
                  </Col>
                  <Col span={6}>
                    <Input.Search
                      placeholder="Search account…"
                      value={reconSearch}
                      onChange={e => setReconSearch(e.target.value)}
                      allowClear
                      size="small"
                    />
                  </Col>
                </Row>

                <div style={{ fontSize: 11, color: REDWOOD.textSecondary, marginBottom: 8 }}>
                  <strong>F</strong> = Fusion TB &nbsp;|&nbsp; <strong>R</strong> = ReERP TB &nbsp;|&nbsp; Diff = R − F &nbsp;|&nbsp; Tolerance: 0.005
                </div>

                <Table
                  dataSource={visible}
                  columns={reconColumns}
                  rowKey="account"
                  size="small"
                  pagination={false}
                  scroll={{ x: 1000, y: 'calc(80vh - 220px)' }}
                  rowClassName={(r: ReconRecord) => r.matched ? '' : 'recon-diff-row'}
                  onRow={(r: ReconRecord) => ({
                    style: { background: r.matched ? '#f6ffed' : '#fff2f0' },
                  })}
                />
              </>
            );
          })()}
        </Modal>
        {renderRevalModal()}
      </Content>
    </Layout>
  );
};

export default TrialBalance;
