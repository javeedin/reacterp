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
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { APEX_DB_CONFIG } from '../../config/api.config';
import { Divider } from 'antd';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

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
  opening_dr: number;
  opening_cr: number;
  ptd_dr: number;
  ptd_cr: number;
  ytd_dr: number;
  ytd_cr: number;
  closing_dr: number;
  closing_cr: number;
}

interface TabData {
  key: string;
  periodName: string;
  tabType: 'fusion' | 'reerp';
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
  const [apiPanelVisible, setApiPanelVisible] = useState(false);
  const [apiCalls, setApiCalls] = useState<Record<string, ApiCallInfo>>({
    ledgers:      { label: 'GET Ledgers',            url: '', method: 'GET',  status: null, ok: null, durationMs: null, running: false, body: '' },
    periods:      { label: 'GET Periods',             url: '', method: 'GET',  status: null, ok: null, durationMs: null, running: false, body: '' },
    trialBalance: { label: 'GET Trial Balance',       url: '', method: 'GET',  status: null, ok: null, durationMs: null, running: false, body: '' },
    rrGenerate:   { label: 'POST RR TB Generate',     url: '', method: 'POST', status: null, ok: null, durationMs: null, running: false, body: '' },
    rrFetch:      { label: 'GET RR Trial Balance',    url: '', method: 'GET',  status: null, ok: null, durationMs: null, running: false, body: '' },
    linesSummary: { label: 'GET Lines Summary',       url: '', method: 'GET',  status: null, ok: null, durationMs: null, running: false, body: '' },
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
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTab(tabKey);

    try {
      // Step 1: Generate TB for this period
      const genUrl = `${APEX_DB_CONFIG.baseUrl}/gl/rr-trialbalance/generate`;
      const t0gen = trackCall('rrGenerate', `POST RR TB Generate — ${record.period_name_id}`, genUrl);
      setApiCalls(prev => ({ ...prev, rrGenerate: { ...prev.rrGenerate, method: 'POST' } }));
      const genRes = await fetch(genUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          p_ledger_name: record.ledger_name,
          p_period_year: record.period_year,
          p_period_name: record.period_name_id,
        }),
      });
      const genData = await genRes.json();
      resolveCall('rrGenerate', t0gen, genRes.status, genRes.ok, genData.status || '');
      if (genData.status === 'error') throw new Error(genData.message || 'Generation failed');

      setTabs(prev => prev.map(t =>
        t.key === tabKey ? { ...t, rrGenerating: false } : t
      ));

      // Step 2: Fetch the generated rows
      const fetchUrl = `${APEX_DB_CONFIG.baseUrl}/gl/rr-trialbalance`
        + `?ledger_name=${encodeURIComponent(record.ledger_name)}`
        + `&period_name=${encodeURIComponent(record.period_name_id)}`
        + `&limit=5000`;
      const t0fetch = trackCall('rrFetch', `GET RR TB — ${record.period_name_id}`, fetchUrl);
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

  // Export current tab data to Excel
  const exportTabToExcel = async (tab: TabData, pivotData: PivotRow[]) => {
    if (!pivotData.length) { message.warning('No data to export'); return; }
    const exportRows = pivotData.map(r => ({
      'Account':         r.account,
      'Description':     r.account_desc,
      ...tab.segmentsBefore.reduce((acc, s) => ({ ...acc, [getSegmentLabel(s)]: r[s] }), {}),
      ...tab.segmentsAfter.reduce((acc, s) => ({ ...acc, [getSegmentLabel(s)]: r[s] }), {}),
      'Opening Balance': r.opening_balance,
      'Debit':           r.debit,
      'Credit':          r.credit,
      'Closing Balance': r.closing_balance,
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    ws['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `TB-${tab.periodName}`);
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const filename = `TrialBalance_${tab.periodName}.xlsx`;
    const eAPI = (window as any).electronAPI;
    if (eAPI?.openExcel) {
      await eAPI.openExcel(buf, filename);
      message.success('Excel opened');
    } else {
      saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
      message.success('Exported to Excel');
    }
  };

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
            >
              {tab.companies.map(company => (
                <Select.Option key={company} value={company}>
                  <BankOutlined style={{ marginRight: 6, color: REDWOOD.info }} />
                  {company}
                </Select.Option>
              ))}
            </Select>
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

  // Render a ReERP TB tab (uses RrTBRecord with separate DR/CR columns)
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

    const fmt = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    const accountTypeColor: Record<string, string> = { A: '#e6f7ff', L: '#fff7e6', O: '#f6ffed', R: '#fff0f6', E: '#f9f0ff' };
    const accountTypeLabel: Record<string, string> = { A: 'Asset', L: 'Liability', O: 'Equity', R: 'Revenue', E: 'Expense' };

    // Filter
    let rows = tab.rrData.filter(r => {
      if (tab.selectedCompany && r.company !== tab.selectedCompany) return false;
      if (tab.selectedCurrency && r.currency_code !== tab.selectedCurrency) return false;
      return true;
    });

    if (tab.gridSearch.trim()) {
      const lc = tab.gridSearch.toLowerCase();
      rows = rows.filter(r =>
        r.account.toLowerCase().includes(lc) ||
        r.account_desc?.toLowerCase().includes(lc) ||
        r.account_combination?.toLowerCase().includes(lc) ||
        r.company?.toLowerCase().includes(lc)
      );
    }

    // Group by account for summary
    const grouped = new Map<string, { account: string; account_desc: string; account_type: string;
      open_dr: number; open_cr: number; ptd_dr: number; ptd_cr: number;
      ytd_dr: number; ytd_cr: number; cls_dr: number; cls_cr: number }>();
    rows.forEach(r => {
      const k = r.account;
      if (!grouped.has(k)) grouped.set(k, { account: r.account, account_desc: r.account_desc,
        account_type: r.account_type, open_dr: 0, open_cr: 0, ptd_dr: 0, ptd_cr: 0,
        ytd_dr: 0, ytd_cr: 0, cls_dr: 0, cls_cr: 0 });
      const g = grouped.get(k)!;
      g.open_dr += r.opening_dr || 0;  g.open_cr += r.opening_cr || 0;
      g.ptd_dr  += r.ptd_dr    || 0;  g.ptd_cr  += r.ptd_cr    || 0;
      g.ytd_dr  += r.ytd_dr    || 0;  g.ytd_cr  += r.ytd_cr    || 0;
      g.cls_dr  += r.closing_dr || 0; g.cls_cr  += r.closing_cr || 0;
    });
    const tableRows = Array.from(grouped.values()).sort((a, b) => a.account.localeCompare(b.account));

    const totals = tableRows.reduce((acc, r) => ({
      open_dr: acc.open_dr + r.open_dr, open_cr: acc.open_cr + r.open_cr,
      ptd_dr:  acc.ptd_dr  + r.ptd_dr,  ptd_cr:  acc.ptd_cr  + r.ptd_cr,
      ytd_dr:  acc.ytd_dr  + r.ytd_dr,  ytd_cr:  acc.ytd_cr  + r.ytd_cr,
      cls_dr:  acc.cls_dr  + r.cls_dr,  cls_cr:  acc.cls_cr  + r.cls_cr,
    }), { open_dr: 0, open_cr: 0, ptd_dr: 0, ptd_cr: 0, ytd_dr: 0, ytd_cr: 0, cls_dr: 0, cls_cr: 0 });

    const amtCol = (title: string, drKey: string, crKey: string, drColor?: string, crColor?: string) => ([
      { title: `${title} DR`, dataIndex: drKey, key: drKey, align: 'right' as const, width: 110,
        render: (v: number) => <Text style={{ fontFamily: 'monospace', fontSize: 11, color: drColor }}>{fmt(v || 0)}</Text> },
      { title: `${title} CR`, dataIndex: crKey, key: crKey, align: 'right' as const, width: 110,
        render: (v: number) => <Text style={{ fontFamily: 'monospace', fontSize: 11, color: crColor || REDWOOD.primary }}>{fmt(v || 0)}</Text> },
    ]);

    const columns = [
      { title: 'Type', dataIndex: 'account_type', key: 'account_type', width: 60, align: 'center' as const,
        render: (t: string) => <Tag color={t === 'A' ? 'blue' : t === 'L' ? 'orange' : t === 'O' ? 'green' : t === 'R' ? 'magenta' : 'purple'} style={{ fontSize: 10 }}>{t}</Tag> },
      { title: 'Account', dataIndex: 'account', key: 'account', width: 120, sorter: (a: any, b: any) => a.account.localeCompare(b.account), defaultSortOrder: 'ascend' as const,
        render: (v: string) => <Text strong style={{ fontFamily: 'monospace' }}>{v}</Text> },
      { title: 'Description', dataIndex: 'account_desc', key: 'account_desc', ellipsis: true,
        render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
      ...amtCol('Opening', 'open_dr', 'open_cr', '#595959', '#595959'),
      ...amtCol('PTD', 'ptd_dr', 'ptd_cr', REDWOOD.info, REDWOOD.primary),
      ...amtCol('YTD', 'ytd_dr', 'ytd_cr', '#237804', '#ad6800'),
      ...amtCol('Closing', 'cls_dr', 'cls_cr', REDWOOD.neutral, REDWOOD.neutral),
    ];

    const summaryRow = () => (
      <Table.Summary fixed>
        <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 700 }}>
          <Table.Summary.Cell index={0} colSpan={3} align="right">
            <Text strong>TOTAL</Text>
          </Table.Summary.Cell>
          {[totals.open_dr, totals.open_cr, totals.ptd_dr, totals.ptd_cr,
            totals.ytd_dr, totals.ytd_cr, totals.cls_dr, totals.cls_cr].map((v, i) => (
            <Table.Summary.Cell key={i} index={i + 3} align="right">
              <Text strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{fmt(v)}</Text>
            </Table.Summary.Cell>
          ))}
        </Table.Summary.Row>
      </Table.Summary>
    );

    return (
      <div>
        {/* Filters */}
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Select placeholder="All Companies" allowClear style={{ width: '100%' }}
              value={tab.selectedCompany}
              onChange={v => updateTabFilter(tab.key, 'selectedCompany', v ?? null)}
              options={tab.companies.map(c => ({ value: c, label: c }))}
            />
          </Col>
          <Col span={6}>
            <Select placeholder="All Currencies" allowClear style={{ width: '100%' }}
              value={tab.selectedCurrency}
              onChange={v => updateTabFilter(tab.key, 'selectedCurrency', v ?? null)}
              options={tab.currencies.map(c => ({ value: c, label: c }))}
            />
          </Col>
          <Col span={8}>
            <Input.Search placeholder="Search account / description…"
              value={tab.gridSearch}
              onChange={e => updateTabSearch(tab.key, e.target.value)}
              allowClear
            />
          </Col>
          <Col span={4}>
            <Tag color="blue" style={{ lineHeight: '30px', fontSize: 12 }}>{tableRows.length} accounts</Tag>
          </Col>
        </Row>

        {/* Account type legend */}
        <Space style={{ marginBottom: 10 }} wrap>
          {Object.entries(accountTypeLabel).map(([k, v]) => (
            <Tag key={k} style={{ background: accountTypeColor[k], fontSize: 11 }}>
              <strong>{k}</strong> = {v}{k === 'R' || k === 'E' ? ' (P&L — resets Jan)' : ' (BS — carries fwd)'}
            </Tag>
          ))}
        </Space>

        <Table
          dataSource={tableRows}
          columns={columns}
          rowKey="account"
          size="small"
          pagination={{ pageSize: 50, showSizeChanger: true }}
          scroll={{ x: 1200 }}
          summary={summaryRow}
          rowClassName={(r: any) => ''}
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
            : <TableOutlined style={{ marginRight: 8 }} />}
          {tab.periodName}
        </span>
      ),
      children: tab.tabType === 'reerp' ? renderRrTBTab(tab) : renderTBTab(tab),
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
      </Content>
    </Layout>
  );
};

export default TrialBalance;
