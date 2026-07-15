import React, { useState, useEffect, useCallback } from 'react';
import {
  Layout, Card, Row, Col, Breadcrumb, Typography, Select, Space,
  Button, Spin, Tag, Tooltip, message, Popover, Table, Alert, Divider, Input,
} from 'antd';
import {
  HomeOutlined, LineChartOutlined, ReloadOutlined,
  CheckCircleOutlined, ClockCircleOutlined, ApiOutlined,
  PlayCircleOutlined, SyncOutlined, CloudUploadOutlined, EyeOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import {
  getBookControls, getDeprnLastPeriod,
  getDeprnPreview, postDeprnCalculate,
  getDeprnWorkbench, getDeprnPeriods, getDeprnStatus, postSingleDeprn,
} from '../../services/fa.service';
import { APEX_DB_CONFIG } from '../../config/api.config';
import type { BookControlRecord } from '../../services/fa.service';
import { useAuth } from '../../context/AuthContext';

const { Content } = Layout;
const { Text, Title } = Typography;
const { Option } = Select;

const REDWOOD = {
  primary:    '#C74634',
  success:    '#1D7B4D',
  warning:    '#D4A800',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral500: '#8C8C8C',
  surface:    '#FFFFFF',
};
const FA_COLOR = '#CA7700';

const fmt = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Period straight-line depreciation (same daily-rate math as the Manage
// Assets "Depreciation Preview" dialog) — returns the depreciation for one
// target period ("MMM-YY", e.g. "Apr-26"). Used to show/post the amount for
// assets that are not yet depreciated in that period.
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const periodLabel = (y: number, m: number) => `${MON[m]}-${String(y).slice(-2)}`;
// Previous period name from a 'MMM-YY' label (e.g. 'Apr-26' -> 'Mar-26').
const prevPeriodName = (name?: string): string => {
  if (!name) return '';
  const m = MON.indexOf(name.slice(0, 3));
  const yy = parseInt(name.slice(4), 10);
  if (m < 0 || isNaN(yy)) return '';
  const d = new Date(2000 + yy, m, 1);
  d.setMonth(d.getMonth() - 1);
  return `${MON[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
};
const computePeriodDeprn = (
  cost: number, salvage: number, life: number, dpis?: string, deprnStart?: string, target?: string,
): number | null => {
  if (!cost || cost <= 0 || !life || life <= 0 || !target) return null;
  let startY: number, startM: number;
  if (dpis) {
    const d = new Date(dpis); if (isNaN(d.getTime())) return null;
    // depreciation starts the month AFTER date-placed-in-service
    startY = d.getFullYear() + Math.floor((d.getMonth() + 1) / 12);
    startM = (d.getMonth() + 1) % 12;
  } else if (deprnStart) {
    const d = new Date(deprnStart); if (isNaN(d.getTime())) return null;
    startY = d.getFullYear(); startM = d.getMonth();
  } else return null;

  let totalDays = 0;
  for (let i = 0; i < life; i++) {
    totalDays += daysInMonth(startY + Math.floor((startM + i) / 12), (startM + i) % 12);
  }
  if (totalDays <= 0) return null;
  const dailyRate = (cost - salvage) / totalDays;

  let nbv = cost;
  for (let i = 0; i < life + 3; i++) {
    const yy = startY + Math.floor((startM + i) / 12);
    const mm = (startM + i) % 12;
    const depr = Math.min(dailyRate * daysInMonth(yy, mm), nbv - salvage);
    if (depr <= 0) continue;
    if (periodLabel(yy, mm).toUpperCase() === target.toUpperCase()) return Math.round(depr * 100) / 100;
    nbv -= depr;
  }
  return null;
};

type ViewMode = 'last' | 'preview' | 'compare' | 'status';

const CalculateDeprn: React.FC = () => {
  const [bookControls, setBookControls] = useState<BookControlRecord[]>([]);
  const [selectedBook, setSelectedBook] = useState<string>('');
  const [lastPeriod,   setLastPeriod]   = useState<any | null>(null);
  const [loading,      setLoading]      = useState(false);

  // Last period workbench
  const [wbItems,   setWbItems]   = useState<any[]>([]);
  const [wbSummary, setWbSummary] = useState<any>(null);
  const [wbLoading, setWbLoading] = useState(false);

  // Preview (next period calculated)
  const [previewItems,   setPreviewItems]   = useState<any[]>([]);
  const [previewSummary, setPreviewSummary] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewed,      setPreviewed]      = useState(false);

  // Posting
  const [posting, setPosting] = useState(false);

  // Which table to show
  const [viewMode, setViewMode] = useState<ViewMode>('last');

  // Status-by-period (all assets)
  const [periodsList,     setPeriodsList]     = useState<any[]>([]);
  const [statusPeriodName, setStatusPeriodName] = useState<string>('');   // period name (resolved server-side)
  const [statusItems,   setStatusItems]   = useState<any[]>([]);
  const [statusSummary, setStatusSummary] = useState<any>(null);
  const [statusMeta,    setStatusMeta]    = useState<{ periodName?: string; postedCount?: number; notPostedCount?: number; totalCount?: number } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusFilter,  setStatusFilter]  = useState<'all' | 'posted' | 'notposted'>('all');
  const [statusError,   setStatusError]   = useState('');
  const [statusUrl,     setStatusUrl]     = useState('');
  const [statusSelected, setStatusSelected] = useState<string[]>([]);   // selected assetIds
  const [statusPosting,  setStatusPosting]  = useState(false);
  const [statusPrev,     setStatusPrev]     = useState<Record<string, number>>({});  // prev-period deprn by assetId
  const [statusPrevName, setStatusPrevName] = useState('');
  const [statusSearch,   setStatusSearch]   = useState('');   // quick filter across all columns
  const { user } = useAuth();
  const loggedUser = user?.username || user?.name || 'REACTERP';

  useEffect(() => {
    getBookControls().then((bc) => {
      setBookControls(bc);
      if (bc.length > 0) setSelectedBook(bc[0].bookTypeCode);
    });
  }, []);

  const loadAll = useCallback(async (book: string) => {
    if (!book) return;
    setLoading(true);
    setPreviewed(false);
    setPreviewItems([]);
    setPreviewSummary(null);
    setViewMode('last');
    try {
      const last = await getDeprnLastPeriod(book);
      setLastPeriod(last);

      if (last?.lastPeriodCounter) {
        setWbLoading(true);
        const wb = await getDeprnWorkbench({
          bookTypeCode:  book,
          periodCounter: last.lastPeriodCounter,
          limit: 500,
        });
        setWbItems(wb.items || []);
        setWbSummary(wb.summary || null);
        setWbLoading(false);
      } else {
        setWbItems([]);
        setWbSummary(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBook) loadAll(selectedBook);
  }, [selectedBook, loadAll]);

  // Load the full period list for the status-by-period selector
  useEffect(() => {
    if (!selectedBook) { setPeriodsList([]); return; }
    getDeprnPeriods(selectedBook).then((ps) => setPeriodsList(ps || []));
  }, [selectedBook]);

  // Period options — merge the list endpoint with the known last/next periods so
  // the dropdown is never empty even if fa/deprn-periods (list) isn't deployed.
  const periodOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { name: string; fy?: string }[] = [];
    const add = (name?: string, fy?: string) => {
      if (name && !seen.has(name.toUpperCase())) { seen.add(name.toUpperCase()); out.push({ name, fy }); }
    };
    (periodsList || []).forEach((p: any) => add(p.periodName, p.fiscalYear));
    add(lastPeriod?.lastPeriodName, lastPeriod?.fiscalYear);
    add(lastPeriod?.nextPeriodName);
    return out;
  }, [periodsList, lastPeriod]);

  // Default the selection to the last run period once options are known
  useEffect(() => {
    if (!statusPeriodName && periodOptions.length > 0) {
      setStatusPeriodName(lastPeriod?.lastPeriodName || periodOptions[0].name);
    }
  }, [periodOptions, lastPeriod, statusPeriodName]);

  const handleShowStatus = useCallback(async (periodName: string) => {
    if (!selectedBook || !periodName) return;
    setStatusLoading(true);
    setStatusError('');
    setStatusSelected([]);
    setStatusSearch('');
    setViewMode('status');
    const url = `${APEX_DB_CONFIG.baseUrl}/fa/deprn-by-period?bookTypeCode=${encodeURIComponent(selectedBook)}&periodName=${encodeURIComponent(periodName)}`;
    setStatusUrl(url);
    try {
      const res = await getDeprnStatus({ bookTypeCode: selectedBook, periodName });
      if (res.success === false) {
        setStatusError(res.error || 'Failed to load status');
        setStatusItems([]); setStatusSummary(null); setStatusMeta(null);
        message.error(res.error || 'Failed to load status');
        return;
      }
      setStatusItems(res.items || []);
      setStatusSummary(res.summary || null);
      setStatusMeta({
        periodName: res.periodName,
        postedCount: res.postedCount,
        notPostedCount: res.notPostedCount,
        totalCount: res.totalCount,
      });

      // Also fetch the PREVIOUS period so we can show it alongside the current.
      const prevName = prevPeriodName(res.periodName || periodName);
      setStatusPrevName(prevName);
      if (prevName) {
        const pres = await getDeprnStatus({ bookTypeCode: selectedBook, periodName: prevName });
        const map: Record<string, number> = {};
        (pres.items || []).forEach((it: any) => {
          if (it.deprnAmount != null) map[String(it.assetId)] = Number(it.deprnAmount);
        });
        setStatusPrev(map);
      } else {
        setStatusPrev({});
      }
    } finally {
      setStatusLoading(false);
    }
  }, [selectedBook]);

  const handlePreview = async () => {
    if (!lastPeriod?.nextPeriodName) return;
    setPreviewLoading(true);
    setViewMode('preview');
    try {
      const result = await getDeprnPreview(selectedBook, lastPeriod.nextPeriodName);
      if (result.success) {
        setPreviewItems(result.items || []);
        setPreviewSummary(result.summary || null);
        setPreviewed(true);
      } else {
        message.error(result.error || 'Preview failed');
        setViewMode('last');
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePost = async () => {
    if (!lastPeriod?.nextPeriodName || !lastPeriod?.lastPeriodCounter) return;
    setPosting(true);
    try {
      const result = await postDeprnCalculate({
        bookTypeCode:  selectedBook,
        periodName:    lastPeriod.nextPeriodName,
        periodCounter: Number(lastPeriod.lastPeriodCounter) + 1,
      });
      if (result.success) {
        message.success(`Depreciation posted for ${lastPeriod.nextPeriodName} — ${result.assetsProcessed} assets processed`);
        await loadAll(selectedBook);
      } else {
        message.error(result.error || 'Post failed');
      }
    } finally {
      setPosting(false);
    }
  };

  const fmtDate = (v: string | null | undefined) => {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const apiContent = (
    <div style={{ maxWidth: 560, fontSize: 12 }}>
      <div style={{ marginBottom: 10 }}>
        <Text strong>1. Last period status</Text>
        <Typography.Text copyable code style={{ display: 'block', fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
          {`${APEX_DB_CONFIG.baseUrl}/fa/deprn-periods/last?bookTypeCode=${encodeURIComponent(selectedBook)}`}
        </Typography.Text>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Text strong>2. Last period actuals (workbench)</Text>
        <Typography.Text copyable code style={{ display: 'block', fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
          {`${APEX_DB_CONFIG.baseUrl}/fa/deprn-workbench?bookTypeCode=${encodeURIComponent(selectedBook)}&periodCounter=${lastPeriod?.lastPeriodCounter || '...'}`}
        </Typography.Text>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Text strong>3. Preview next period depreciation</Text>
        <Typography.Text copyable code style={{ display: 'block', fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
          {`${APEX_DB_CONFIG.baseUrl}/fa/deprn-calculate/preview?bookTypeCode=${encodeURIComponent(selectedBook)}&periodName=${encodeURIComponent(lastPeriod?.nextPeriodName || '')}`}
        </Typography.Text>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Text strong>Status by period (all assets)</Text>
        <Typography.Text copyable code style={{ display: 'block', fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
          {`${APEX_DB_CONFIG.baseUrl}/fa/deprn-by-period?bookTypeCode=${encodeURIComponent(selectedBook)}&periodName=${encodeURIComponent(statusPeriodName || '...')}`}
        </Typography.Text>
      </div>
      <div>
        <Text strong>4. Post depreciation</Text>
        <Typography.Text copyable code style={{ display: 'block', fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
          {`POST ${APEX_DB_CONFIG.baseUrl}/fa/deprn-calculate`}
        </Typography.Text>
        <Typography.Text code style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
          {`{ "bookTypeCode": "${selectedBook}", "periodName": "${lastPeriod?.nextPeriodName || ''}", "periodCounter": ${lastPeriod?.lastPeriodCounter ? Number(lastPeriod.lastPeriodCounter) + 1 : '...'} }`}
        </Typography.Text>
      </div>
    </div>
  );

  const summaryCards = (summary: any, isPreview: boolean) => [
    { label: 'Total Cost',       value: summary?.totalCost,                          color: '#1677ff' },
    { label: isPreview ? 'Calculated Deprn' : 'Deprn Amount', value: isPreview ? summary?.totalDeprnAmount : summary?.totalDeprnAmount, color: REDWOOD.primary },
    { label: isPreview ? 'New Reserve'      : 'Total Reserve', value: isPreview ? summary?.totalNewReserve  : summary?.totalDeprnReserve, color: REDWOOD.warning },
    { label: 'Total NBV',        value: summary?.totalNbv,                           color: REDWOOD.success },
  ];

  const lastColumns = [
    { title: 'Asset #',       dataIndex: 'assetNumber',  key: 'assetNumber',  width: 100, fixed: 'left' as const,
      render: (v: string) => <Text style={{ fontSize: 12, fontWeight: 600 }}>{v}</Text> },
    { title: 'Description',   dataIndex: 'description',  key: 'description',  width: 220,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'FY',            dataIndex: 'fiscalYear',   key: 'fiscalYear',   width: 60 },
    { title: 'Cost',          dataIndex: 'adjustedCost', key: 'adjustedCost', width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'Deprn Amount',  dataIndex: 'deprnAmount',  key: 'deprnAmount',  width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12, color: REDWOOD.primary, fontWeight: 600 }}>{fmt(v)}</Text> },
    { title: 'YTD Deprn',     dataIndex: 'ytdDeprn',     key: 'ytdDeprn',     width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'Reserve',       dataIndex: 'deprnReserve', key: 'deprnReserve', width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'NBV',           dataIndex: 'nbv',          key: 'nbv',          width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12, color: REDWOOD.success, fontWeight: 600 }}>{fmt(v)}</Text> },
    { title: 'Run Date',      dataIndex: 'deprnRunDate', key: 'deprnRunDate', width: 120,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{fmtDate(v)}</Text> },
  ];

  const previewColumns = [
    { title: 'Asset #',      dataIndex: 'assetNumber',  key: 'assetNumber',  width: 100, fixed: 'left' as const,
      render: (v: string) => <Text style={{ fontSize: 12, fontWeight: 600 }}>{v}</Text> },
    { title: 'Description',  dataIndex: 'description',  key: 'description',  width: 220,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Method',       dataIndex: 'methodCode',   key: 'methodCode',   width: 90,
      render: (v: string) => <Tag style={{ fontSize: 11 }}>{v || '—'}</Tag> },
    { title: 'Life (Months)',dataIndex: 'lifeInMonths', key: 'lifeInMonths', width: 110, align: 'right' as const },
    { title: 'Cost',         dataIndex: 'adjustedCost', key: 'adjustedCost', width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'Salvage',      dataIndex: 'salvageValue', key: 'salvageValue', width: 110, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'Deprn Amount', dataIndex: 'deprnAmount',  key: 'deprnAmount',  width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12, color: REDWOOD.primary, fontWeight: 600 }}>{fmt(v)}</Text> },
    { title: 'Prior Reserve',dataIndex: 'priorReserve', key: 'priorReserve', width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'New Reserve',  dataIndex: 'newReserve',   key: 'newReserve',   width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'NBV',          dataIndex: 'nbv',          key: 'nbv',          width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12, color: REDWOOD.success, fontWeight: 600 }}>{fmt(v)}</Text> },
  ];

  const compareColumns = [
    { title: 'Asset #',     dataIndex: 'assetNumber', key: 'assetNumber', width: 100, fixed: 'left' as const,
      render: (v: string) => <Text style={{ fontSize: 12, fontWeight: 600 }}>{v}</Text> },
    { title: 'Description', dataIndex: 'description', key: 'description', width: 200,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Method',      dataIndex: 'methodCode',  key: 'methodCode',  width: 80,
      render: (v: string) => <Tag style={{ fontSize: 11 }}>{v || '—'}</Tag> },
    { title: lastPeriod?.lastPeriodName ?? 'Last Deprn', dataIndex: 'lastDeprn', key: 'lastDeprn', width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: lastPeriod?.nextPeriodName ?? 'Next Deprn', dataIndex: 'nextDeprn', key: 'nextDeprn', width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12, color: '#1677ff', fontWeight: 600 }}>{fmt(v)}</Text> },
    { title: 'Difference',  dataIndex: 'difference',  key: 'difference',  width: 130, align: 'right' as const,
      render: (v: number) => {
        const color = v > 0 ? REDWOOD.primary : v < 0 ? REDWOOD.success : REDWOOD.neutral500;
        const prefix = v > 0 ? '+' : '';
        return <Text style={{ fontSize: 12, fontWeight: 700, color }}>{v === 0 ? '—' : `${prefix}${fmt(v)}`}</Text>;
      },
    },
    { title: `${lastPeriod?.lastPeriodName ?? 'Last'} NBV`, dataIndex: 'lastNbv', key: 'lastNbv', width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: `${lastPeriod?.nextPeriodName ?? 'Next'} NBV`, dataIndex: 'nextNbv', key: 'nextNbv', width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12, color: REDWOOD.success }}>{fmt(v)}</Text> },
  ];

  const monoRed = { fontSize: 12, fontFamily: 'monospace', color: REDWOOD.primary, fontWeight: 600 } as const;
  const mono   = { fontSize: 12, fontFamily: 'monospace' } as const;
  const statusColumns = [
    { title: 'Asset #',     dataIndex: 'assetNumber', key: 'assetNumber', width: 100, fixed: 'left' as const,
      render: (v: string) => <Text style={{ fontSize: 12, fontWeight: 600 }}>{v}</Text> },
    { title: 'Description', dataIndex: 'description', key: 'description', width: 200, ellipsis: true,
      render: (v: string) => <Tooltip title={v}><Text style={{ fontSize: 12 }}>{v || '—'}</Text></Tooltip> },
    { title: 'Period',      dataIndex: 'periodName', key: 'periodName', width: 90,
      render: (v: string) => <Text style={{ fontSize: 12, fontWeight: 600 }}>{v || statusMeta?.periodName || '—'}</Text> },
    { title: 'Days',        dataIndex: 'days', key: 'days', width: 70, align: 'right' as const,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Daily Rate',  dataIndex: 'dailyRate', key: 'dailyRate', width: 110, align: 'right' as const,
      render: (v: number) => <Text style={mono}>{v == null ? '—' : fmt(v)}</Text> },
    { title: 'Opening NBV', dataIndex: 'openingNbv', key: 'openingNbv', width: 140, align: 'right' as const,
      render: (v: number) => <Text style={mono}>{v == null ? '—' : fmt(v)}</Text> },
    { title: `Depreciation${statusPrevName ? ` (${statusPrevName})` : ' (Prev)'}`, dataIndex: 'prevDeprn', key: 'prevDeprn', width: 140, align: 'right' as const,
      render: (v: number | null) => v == null
        ? <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        : <Text style={{ fontSize: 12, fontFamily: 'monospace', color: REDWOOD.neutral500 }}>{fmt(v)}</Text> },
    { title: `Depreciation${statusMeta?.periodName ? ` (${statusMeta.periodName})` : ''}`, dataIndex: 'periodDeprn', key: 'periodDeprn', width: 150, align: 'right' as const,
      render: (v: number | null, r: any) => v == null
        ? <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        : <Text style={monoRed} title={r.status === 'Posted' ? 'Posted amount' : 'Calculated (not yet posted)'}>{fmt(v)}</Text> },
    { title: 'Closing NBV', dataIndex: 'closingNbv', key: 'closingNbv', width: 140, align: 'right' as const,
      render: (v: number) => <Text style={{ ...mono, color: REDWOOD.success, fontWeight: 600 }}>{v == null ? '—' : fmt(v)}</Text> },
    { title: 'Status',      dataIndex: 'status', key: 'status', width: 120, fixed: 'right' as const,
      filters: [{ text: 'Posted', value: 'Posted' }, { text: 'Not Posted', value: 'Not Posted' }],
      onFilter: (value: any, r: any) => r.status === value,
      render: (v: string) => v === 'Posted'
        ? <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 11 }}>Posted</Tag>
        : <Tag color="default" icon={<ClockCircleOutlined />} style={{ fontSize: 11, color: REDWOOD.neutral500 }}>Not Posted</Tag> },
  ];

  // Enrich each asset with the period's depreciation amount + schedule. Prefer
  // the server's values (days/dailyRate/opening/closing/deprnAmount); fall back
  // to the client calc if a field is missing. Exclude assets with 0 cost.
  const enrichedStatusItems = React.useMemo(() => {
    const target = statusMeta?.periodName || statusPeriodName;
    return statusItems
      .filter(r => Number(r.cost) > 0)
      .map(r => {
        const server = r.deprnAmount != null ? Number(r.deprnAmount) : null;
        const calc = server == null ? computePeriodDeprn(
          Number(r.cost), Number(r.salvageValue ?? 0), Number(r.lifeInMonths ?? 0),
          r.datePlacedInService, r.deprnStartDate, target,
        ) : null;
        // previous period: from the prev-period fetch, else client calc
        const prev = statusPrev[String(r.assetId)] ?? (statusPrevName ? computePeriodDeprn(
          Number(r.cost), Number(r.salvageValue ?? 0), Number(r.lifeInMonths ?? 0),
          r.datePlacedInService, r.deprnStartDate, statusPrevName,
        ) : null);
        return { ...r, periodDeprn: server ?? calc, prevDeprn: prev };
      });
  }, [statusItems, statusMeta, statusPeriodName, statusPrev, statusPrevName]);

  const filteredStatusItems = (() => {
    const byStatus = statusFilter === 'all'
      ? enrichedStatusItems
      : enrichedStatusItems.filter(r => statusFilter === 'posted' ? r.status === 'Posted' : r.status === 'Not Posted');
    const q = statusSearch.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter(r =>
      [r.assetNumber, r.description, r.periodName ?? statusMeta?.periodName, r.methodCode,
       r.days, r.dailyRate, r.openingNbv, r.prevDeprn, r.periodDeprn, r.closingNbv, r.cost, r.status]
        .some(v => v != null && String(v).toLowerCase().includes(q)));
  })();

  const handlePostSelected = async () => {
    const target = statusMeta?.periodName || statusPeriodName;
    const rows = enrichedStatusItems.filter(r =>
      statusSelected.includes(String(r.assetId)) && r.status !== 'Posted' && (r.periodDeprn ?? 0) > 0);
    if (rows.length === 0) { message.warning('No postable lines selected (need Not-Posted with an amount).'); return; }
    setStatusPosting(true);
    let ok = 0, fail = 0;
    for (const r of rows) {
      const res = await postSingleDeprn({
        assetId: String(r.assetId),
        bookTypeCode: selectedBook,
        periodName: target,
        deprnAmount: Number(r.periodDeprn),
        createdBy: loggedUser,
      });
      if (res.success || res.status === 'POSTED' || res.status === 'ALREADY_EXISTS') ok++; else fail++;
    }
    setStatusPosting(false);
    if (ok > 0) message.success(`${ok} line(s) depreciation posted${fail ? `, ${fail} failed` : ''}`);
    else message.error(`Post failed for ${fail} line(s)`);
    setStatusSelected([]);
    handleShowStatus(statusPeriodName);   // refresh
  };

  const isPreview = viewMode === 'preview';
  const isCompare = viewMode === 'compare';
  const isStatus  = viewMode === 'status';

  // Build compare rows — join last actuals + preview by assetId
  const compareRows = React.useMemo(() => {
    if (!previewed) return [];
    const lastMap = new Map(wbItems.map(r => [String(r.assetId), r]));
    return previewItems.map(pr => {
      const last = lastMap.get(String(pr.assetId));
      const lastAmt  = Number(last?.deprnAmount  ?? 0);
      const nextAmt  = Number(pr.deprnAmount      ?? 0);
      const diff     = nextAmt - lastAmt;
      return {
        assetId:      pr.assetId,
        assetNumber:  pr.assetNumber,
        description:  pr.description,
        methodCode:   pr.methodCode,
        lastPeriod:   lastPeriod?.lastPeriodName  ?? '—',
        nextPeriod:   lastPeriod?.nextPeriodName  ?? '—',
        lastDeprn:    lastAmt,
        nextDeprn:    nextAmt,
        difference:   diff,
        lastNbv:      Number(last?.nbv ?? 0),
        nextNbv:      Number(pr.nbv    ?? 0),
      };
    });
  }, [previewed, wbItems, previewItems, lastPeriod]);

  const activeItems   = isCompare ? compareRows   : isPreview ? previewItems   : wbItems;
  const activeSummary = isCompare ? null          : isPreview ? previewSummary : wbSummary;
  const activeLoading = isCompare ? false         : isPreview ? previewLoading : wbLoading;
  const activeRowKey  = 'assetId';

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Header bar */}
        <div style={{ padding: '12px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/fa">Fixed Assets</Link> },
            { title: 'Calculate Depreciation' },
          ]} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Space align="center">
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: `linear-gradient(135deg, ${FA_COLOR} 0%, #9E5C00 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <LineChartOutlined style={{ fontSize: 18, color: '#fff' }} />
              </div>
              <div>
                <Title level={5} style={{ margin: 0 }}>Calculate Depreciation</Title>
                <Text type="secondary" style={{ fontSize: 11 }}>Run depreciation for the current open period</Text>
              </div>
            </Space>
            <Space>
              <Text type="secondary" style={{ fontSize: 12 }}>Book:</Text>
              <Select
                value={selectedBook || undefined}
                onChange={(v) => setSelectedBook(v)}
                style={{ width: 240 }}
                placeholder="Select book"
                showSearch
              >
                {bookControls.map(b => (
                  <Option key={b.bookTypeCode} value={b.bookTypeCode}>{b.bookTypeCode}</Option>
                ))}
              </Select>
              <Tooltip title="Refresh">
                <Button icon={<ReloadOutlined />} onClick={() => loadAll(selectedBook)} loading={loading} />
              </Tooltip>
              <Popover title="API Requests" content={apiContent} trigger="click" placement="bottomRight">
                <Tooltip title="Show API calls">
                  <Button icon={<ApiOutlined />} style={{ color: '#1677ff', borderColor: '#1677ff' }} />
                </Tooltip>
              </Popover>
            </Space>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
          ) : (
            <>
              {/* Period cards + action buttons */}
              <Row gutter={[12, 12]} style={{ marginBottom: 20 }} align="middle">
                {/* Last Run */}
                <Col xs={12} sm={6} md={4}>
                  <Card size="small" style={{
                    borderRadius: 8, border: `2px solid ${REDWOOD.success}`,
                    textAlign: 'center', background: '#f6ffed',
                  }} styles={{ body: { padding: '12px' } }}>
                    <Text style={{ fontSize: 11, color: REDWOOD.success, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                      Last Depreciation Run
                    </Text>
                    {lastPeriod?.lastPeriodName ? (
                      <>
                        <div style={{ fontSize: 20, fontWeight: 700, color: REDWOOD.success }}>
                          {lastPeriod.lastPeriodName}
                        </div>
                        <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 11, marginTop: 4 }}>
                          FY {lastPeriod.fiscalYear}
                        </Tag>
                      </>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>Never Run</Text>
                    )}
                  </Card>
                </Col>

                {/* Next Period */}
                <Col xs={12} sm={6} md={4}>
                  <Card size="small" style={{
                    borderRadius: 8, border: `2px solid #1677ff`,
                    textAlign: 'center', background: '#f0f5ff',
                  }} styles={{ body: { padding: '12px' } }}>
                    <Text style={{ fontSize: 11, color: '#1677ff', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                      Next Period to Run
                    </Text>
                    {lastPeriod?.nextPeriodName ? (
                      <>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#1677ff' }}>
                          {lastPeriod.nextPeriodName}
                        </div>
                        <Tag color="processing" icon={<ClockCircleOutlined />} style={{ fontSize: 11, marginTop: 4 }}>Pending</Tag>
                      </>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
                    )}
                  </Card>
                </Col>

                {/* Action buttons */}
                <Col xs={24} sm={12} md={10}>
                  <Space wrap>
                    <Button
                      icon={<EyeOutlined />}
                      onClick={handlePreview}
                      loading={previewLoading}
                      disabled={!lastPeriod?.nextPeriodName}
                      style={{ height: 44 }}
                    >
                      Preview {lastPeriod?.nextPeriodName || ''} Depreciation
                    </Button>
                    <Button
                      type="primary"
                      icon={posting ? <SyncOutlined spin /> : <CloudUploadOutlined />}
                      loading={posting}
                      disabled={!previewed || !lastPeriod?.nextPeriodName}
                      onClick={handlePost}
                      style={{ height: 44, background: previewed ? FA_COLOR : undefined, borderColor: previewed ? FA_COLOR : undefined }}
                    >
                      Post Depreciation
                    </Button>
                    {previewed && (
                      <Tag color="orange" style={{ height: 44, display: 'flex', alignItems: 'center', fontSize: 12 }}>
                        <PlayCircleOutlined style={{ marginRight: 4 }} />
                        Preview ready — review then Post
                      </Tag>
                    )}
                  </Space>
                </Col>
              </Row>

              {/* Toggle tabs */}
              <div style={{ marginBottom: 12 }}>
                <Space>
                  <Button
                    type={viewMode === 'last' ? 'primary' : 'default'}
                    size="small"
                    onClick={() => setViewMode('last')}
                    style={viewMode === 'last' ? { background: REDWOOD.success, borderColor: REDWOOD.success } : {}}
                  >
                    Last Period — {lastPeriod?.lastPeriodName || '—'}
                  </Button>
                  {previewed && (
                    <Button
                      type={viewMode === 'preview' ? 'primary' : 'default'}
                      size="small"
                      onClick={() => setViewMode('preview')}
                      style={viewMode === 'preview' ? { background: FA_COLOR, borderColor: FA_COLOR } : {}}
                    >
                      Preview — {lastPeriod?.nextPeriodName}
                    </Button>
                  )}
                  {previewed && (
                    <Button
                      type={viewMode === 'compare' ? 'primary' : 'default'}
                      size="small"
                      icon={<SwapOutlined />}
                      onClick={() => setViewMode('compare')}
                      style={viewMode === 'compare' ? { background: '#722ed1', borderColor: '#722ed1' } : { color: '#722ed1', borderColor: '#722ed1' }}
                    >
                      Compare
                    </Button>
                  )}
                  <Button
                    type={isStatus ? 'primary' : 'default'}
                    size="small"
                    icon={<CheckCircleOutlined />}
                    onClick={() => { setViewMode('status'); if (statusItems.length === 0 && statusPeriodName) handleShowStatus(statusPeriodName); }}
                    style={isStatus ? { background: '#1677ff', borderColor: '#1677ff' } : { color: '#1677ff', borderColor: '#1677ff' }}
                  >
                    Status by Period
                  </Button>
                </Space>
              </div>

              {/* Preview notice */}
              {isPreview && (
                <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                  message={`Depreciation preview for ${lastPeriod?.nextPeriodName} — amounts are calculated but NOT yet posted. Click "Post Depreciation" to commit.`}
                />
              )}

              {/* Compare notice + summary */}
              {isCompare && compareRows.length > 0 && (() => {
                const totalLast = compareRows.reduce((s, r) => s + r.lastDeprn, 0);
                const totalNext = compareRows.reduce((s, r) => s + r.nextDeprn, 0);
                const totalDiff = totalNext - totalLast;
                return (
                  <Row gutter={[10, 10]} style={{ marginBottom: 12 }}>
                    {[
                      { label: `${lastPeriod?.lastPeriodName} Deprn`, value: totalLast, color: REDWOOD.neutral500 },
                      { label: `${lastPeriod?.nextPeriodName} Deprn`, value: totalNext, color: '#1677ff' },
                      { label: 'Total Difference', value: totalDiff,
                        color: totalDiff > 0 ? REDWOOD.primary : totalDiff < 0 ? REDWOOD.success : REDWOOD.neutral500 },
                    ].map(s => (
                      <Col xs={8} key={s.label}>
                        <Card size="small" styles={{ body: { padding: '10px 14px' } }}
                          style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, background: REDWOOD.neutral100 }}>
                          <Text style={{ fontSize: 11, color: REDWOOD.neutral500, display: 'block' }}>{s.label}</Text>
                          <Text style={{ fontSize: 15, fontWeight: 700, color: s.color }}>
                            {s.label === 'Total Difference' && totalDiff > 0 ? '+' : ''}{fmt(s.value)}
                          </Text>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                );
              })()}

              {/* ── Status by Period (all assets) ── */}
              {isStatus && (
                <Card
                  style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                  styles={{ body: { padding: '16px 20px' } }}
                  title={
                    <Space wrap>
                      <CheckCircleOutlined style={{ color: '#1677ff' }} />
                      <Text strong>Depreciation Status — all assets</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>Period:</Text>
                      <Select
                        size="small"
                        style={{ width: 200 }}
                        placeholder="Select period"
                        value={statusPeriodName || undefined}
                        onChange={(v) => { setStatusPeriodName(v); handleShowStatus(v); }}
                        showSearch
                        optionFilterProp="children"
                      >
                        {periodOptions.map((p) => (
                          <Option key={p.name} value={p.name}>
                            {p.name}{p.fy ? ` (FY ${p.fy})` : ''}
                          </Option>
                        ))}
                      </Select>
                      <Button size="small" icon={<ReloadOutlined />} loading={statusLoading}
                        onClick={() => handleShowStatus(statusPeriodName)}>Show</Button>
                      <Tooltip title={
                        <div style={{ maxWidth: 520 }}>
                          <div style={{ fontSize: 11, marginBottom: 4 }}>GET (no body — query params):</div>
                          <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#fff', wordBreak: 'break-all' }}>
                            {statusUrl || `${APEX_DB_CONFIG.baseUrl}/fa/deprn-by-period?bookTypeCode=${encodeURIComponent(selectedBook)}&periodName=${encodeURIComponent(statusPeriodName || '...')}`}
                          </div>
                          <div style={{ fontSize: 10, marginTop: 6, opacity: 0.75 }}>Click to copy</div>
                        </div>
                      }>
                        <Button type="text" size="small" icon={<ApiOutlined style={{ color: '#1677ff' }} />}
                          onClick={() => {
                            const u = statusUrl || `${APEX_DB_CONFIG.baseUrl}/fa/deprn-by-period?bookTypeCode=${encodeURIComponent(selectedBook)}&periodName=${encodeURIComponent(statusPeriodName || '')}`;
                            navigator.clipboard.writeText(u); message.success('URL copied');
                          }} />
                      </Tooltip>
                    </Space>
                  }
                >
                  {statusError && (
                    <Alert type="error" showIcon style={{ marginBottom: 12 }}
                      message="Failed to load depreciation status"
                      description={
                        <div>
                          <div style={{ marginBottom: 6 }}>{statusError}</div>
                          <div style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', color: REDWOOD.neutral500 }}>GET {statusUrl}</div>
                          <div style={{ fontSize: 11, marginTop: 6 }}>
                            A 404 means the webservice isn't deployed. Run <b>08_rr_fa_pkg_spec.sql → 09_rr_fa_pkg_body.sql → 18_fa_deprn_by_period_get.sql</b>.
                          </div>
                        </div>
                      } />
                  )}
                  {statusLoading ? (
                    <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                  ) : statusMeta ? (
                    <>
                      <Row gutter={[10, 10]} style={{ marginBottom: 12 }}>
                        {[
                          { label: 'Total Assets',  value: statusMeta.totalCount ?? 0,      color: '#1677ff', isCount: true },
                          { label: 'Posted',         value: statusMeta.postedCount ?? 0,     color: REDWOOD.success, isCount: true },
                          { label: 'Not Posted',     value: statusMeta.notPostedCount ?? 0,  color: REDWOOD.warning, isCount: true },
                          { label: 'Deprn Amount',   value: statusSummary?.totalDeprnAmount, color: REDWOOD.primary },
                        ].map(s => (
                          <Col xs={12} md={6} key={s.label}>
                            <Card size="small" styles={{ body: { padding: '10px 14px' } }}
                              style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, background: REDWOOD.neutral100 }}>
                              <Text style={{ fontSize: 11, color: REDWOOD.neutral500, display: 'block' }}>{s.label}</Text>
                              <Text style={{ fontSize: 15, fontWeight: 700, color: s.color }}>
                                {s.isCount ? s.value : fmt(s.value as number)}
                              </Text>
                            </Card>
                          </Col>
                        ))}
                      </Row>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
                        <Space wrap>
                          <Input.Search
                            allowClear
                            size="small"
                            placeholder="Filter any column…"
                            style={{ width: 240 }}
                            value={statusSearch}
                            onChange={e => setStatusSearch(e.target.value)}
                          />
                          <Button size="small" type={statusFilter === 'all' ? 'primary' : 'default'} onClick={() => setStatusFilter('all')}>All ({enrichedStatusItems.length})</Button>
                          <Button size="small" type={statusFilter === 'posted' ? 'primary' : 'default'}
                            style={statusFilter === 'posted' ? { background: REDWOOD.success, borderColor: REDWOOD.success } : {}}
                            onClick={() => setStatusFilter('posted')}>Posted ({statusMeta.postedCount ?? 0})</Button>
                          <Button size="small" type={statusFilter === 'notposted' ? 'primary' : 'default'}
                            style={statusFilter === 'notposted' ? { background: REDWOOD.warning, borderColor: REDWOOD.warning } : {}}
                            onClick={() => setStatusFilter('notposted')}>Not Posted ({statusMeta.notPostedCount ?? 0})</Button>
                        </Space>
                        <Tooltip title={statusSelected.length === 0
                          ? 'Select one or more Not-Posted assets to post their depreciation'
                          : `Post depreciation (fa/deprn-post-single) for ${statusSelected.length} asset(s), period ${statusMeta.periodName}`}>
                          <Button
                            type="primary"
                            icon={<CloudUploadOutlined />}
                            loading={statusPosting}
                            disabled={statusSelected.length === 0}
                            onClick={handlePostSelected}
                            style={statusSelected.length > 0 ? { background: FA_COLOR, borderColor: FA_COLOR } : {}}
                          >
                            Create Depreciation ({statusSelected.length})
                          </Button>
                        </Tooltip>
                      </div>
                      <Table
                        dataSource={filteredStatusItems}
                        columns={statusColumns}
                        rowKey="assetId"
                        size="small"
                        scroll={{ x: 1330, y: 440 }}
                        pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} assets` }}
                        locale={{ emptyText: 'No assets found for this book/period' }}
                        rowSelection={{
                          selectedRowKeys: statusSelected,
                          onChange: (keys) => setStatusSelected(keys as string[]),
                          // Only Not-Posted assets with a computable amount can be posted.
                          getCheckboxProps: (r: any) => ({ disabled: r.status === 'Posted' || !(r.periodDeprn > 0) }),
                        }}
                      />
                    </>
                  ) : (
                    <Alert type="info" showIcon message="Select a period and click Show to see the depreciation status for all assets." />
                  )}
                </Card>
              )}

              {/* Details card */}
              {!isStatus && (
              <Card
                style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                styles={{ body: { padding: '16px 20px' } }}
                title={
                  <Space>
                    <LineChartOutlined style={{ color: isPreview ? FA_COLOR : REDWOOD.success }} />
                    <Text strong>
                      {isCompare
                        ? `Compare — ${lastPeriod?.lastPeriodName} vs ${lastPeriod?.nextPeriodName}`
                        : isPreview
                          ? `Calculated Depreciation — ${lastPeriod?.nextPeriodName} (Preview)`
                          : `Depreciation Details — ${lastPeriod?.lastPeriodName || '—'}`}
                    </Text>
                    {!isPreview && !isCompare && lastPeriod?.lastPeriodCounter && (
                      <Tag color="green" style={{ fontSize: 11 }}>Counter: {lastPeriod.lastPeriodCounter}</Tag>
                    )}
                    {isCompare && (
                      <Tag color="purple" icon={<SwapOutlined />} style={{ fontSize: 11 }}>
                        {compareRows.length} assets
                      </Tag>
                    )}
                  </Space>
                }
              >
                {activeLoading ? (
                  <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                ) : (
                  <>
                    {activeSummary && (
                      <>
                        <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
                          {summaryCards(activeSummary, isPreview).map(s => (
                            <Col xs={12} md={6} key={s.label}>
                              <Card size="small" styles={{ body: { padding: '10px 14px' } }}
                                style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, background: REDWOOD.neutral100 }}>
                                <Text style={{ fontSize: 11, color: REDWOOD.neutral500, display: 'block' }}>{s.label}</Text>
                                <Text style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{fmt(s.value)}</Text>
                              </Card>
                            </Col>
                          ))}
                        </Row>
                        <Divider style={{ margin: '0 0 12px' }} />
                      </>
                    )}

                    <Table
                      dataSource={activeItems}
                      columns={isCompare ? compareColumns : isPreview ? previewColumns : lastColumns}
                      rowKey={activeRowKey}
                      size="small"
                      scroll={{ x: isCompare ? 1100 : isPreview ? 1200 : 1100, y: 420 }}
                      pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} assets` }}
                      locale={{ emptyText: lastPeriod ? 'No records found' : 'Select a book' }}
                      rowClassName={(r: any) =>
                        isCompare && r.difference > 0 ? 'row-increase'
                        : isCompare && r.difference < 0 ? 'row-decrease' : ''
                      }
                    />
                  </>
                )}
              </Card>
              )}
            </>
          )}
        </div>
      </Content>
    </Layout>
  );
};

export default CalculateDeprn;
