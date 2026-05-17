import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Layout, Typography, Card, Breadcrumb, Space, Form, Select, Input,
  Button, Table, Tag, Spin, Tooltip, message, Switch, Row, Col,
  Divider, Badge, Modal,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, SearchOutlined, ClearOutlined, BarChartOutlined,
  FileExcelOutlined, FilePdfOutlined, AuditOutlined, ReloadOutlined,
  ApiOutlined, CopyOutlined, BookOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs, { Dayjs } from 'dayjs';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

// ─── Constants ────────────────────────────────────────────────────────────────
const API_BASE  = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/gl';
const APEX_BASE = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp';
const COMPANY_LOV_URL = `${APEX_BASE}/valuesets/getvalues/BUIMERC_FIN_GLB_COA_CO`;

const REDWOOD = {
  primary: '#C74634', success: '#1D7B4D', warning: '#D4A800',
  info: '#0572CE', neutral100: '#F7F7F7', neutral200: '#E5E5E5',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
  headerBg: '#1B2A4A',
};

const MONTH_MAP: Record<string,number> = {
  Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12,
};
const parsePeriod = (p: string): number => {
  const [m, y] = p.split('-');
  return (2000 + parseInt(y || '0', 10)) * 100 + (MONTH_MAP[m] ?? 0);
};

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface JournalLine {
  key: string;
  concatenatedSegments: string;
  accountDescription: string;
  jeLineDescription: string;
  defaultPeriodName: string;
  accountingDate: string;
  batchName: string;
  userJeSourceName: string;
  userJeCategoryName: string;
  currencyCode: string;
  enteredDr: number;
  enteredCr: number;
  accountedDr: number;
  accountedCr: number;
  jeHeaderId: number;
  isOpeningBalance?: boolean;
  isClosingBalance?: boolean;
  isTotals?: boolean;
  _entBal?: number;
  _accBal?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtN = (v: number) =>
  Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FmtBal: React.FC<{ v: number; size?: number }> = ({ v, size = 12 }) =>
  v < 0
    ? <Text strong style={{ fontSize: size, color: REDWOOD.primary }}>{fmtN(Math.abs(v))} Cr</Text>
    : <Text strong style={{ fontSize: size, color: REDWOOD.success }}>{fmtN(v)}</Text>;

// ─── Main Component ───────────────────────────────────────────────────────────
const AccountAnalysisV2: React.FC = () => {
  // Parameters
  const [ledger, setLedger]         = useState('BUIMERC LEDGER');
  const [ledgerOptions, setLedgerOptions] = useState<string[]>(['BUIMERC LEDGER']);
  const [company, setCompany]       = useState('');
  const [companyOptions, setCompanyOptions] = useState<{ value: string; label: string }[]>([]);
  const [periods, setPeriods]       = useState<string[]>([]);
  const [allPeriods, setAllPeriods] = useState<string[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [account, setAccount]       = useState('');
  const [jeSource, setJeSource]     = useState('');
  const [jeCategory, setJeCategory] = useState('');

  // Grid state
  const [loading, setLoading]       = useState(false);
  const [rows, setRows]             = useState<JournalLine[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [showEntered, setShowEntered] = useState(false);
  const [gridSearch, setGridSearch] = useState('');

  // Balance state
  const [openingBal, setOpeningBal] = useState<{ acc: number; ent: number } | null>(null);
  const [closingBal, setClosingBal] = useState<{ acc: number; ent: number } | null>(null);

  // API modal
  const [apiUrl, setApiUrl] = useState('');
  const [apiModalOpen, setApiModalOpen] = useState(false);

  // ── Load periods ────────────────────────────────────────────────────────────
  const loadPeriods = useCallback(async (ldg: string) => {
    setPeriodsLoading(true);
    try {
      const res = await fetch(
        `${APEX_BASE}/periodsstatus/create?ledger_name=${encodeURIComponent(ldg)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      const items: any[] = data.items || [];
      const names = [...new Set(items.map((i: any) => i.period_name || i.period_name_id || '').filter(Boolean))];
      names.sort((a, b) => parsePeriod(b) - parsePeriod(a));
      setAllPeriods(names);
    } catch { /* silent */ } finally {
      setPeriodsLoading(false);
    }
  }, []);

  // ── Load company LOV ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(COMPANY_LOV_URL)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const items: any[] = data.items || [];
        setCompanyOptions(items.map((i: any) => ({
          value: i.value || i.VALUE || '',
          label: `${i.value || ''} – ${i.meaning || i.MEANING || ''}`,
        })));
      }).catch(() => {});
  }, []);

  useEffect(() => { loadPeriods(ledger); }, [ledger, loadPeriods]);

  // ── Build balance row from trial balance API ────────────────────────────────
  const fetchBalanceRow = useCallback(async (acct: string, co: string, period: string, isOpen: boolean) => {
    const p = new URLSearchParams({ ledger_name: ledger, period_name: period, account: acct });
    if (co) p.set('company', co);
    const res = await fetch(`${API_BASE}/rr-trialbalance/standard?${p}`);
    if (!res.ok) return null;
    const data = await res.json();
    const items: any[] = data.items || [];
    if (!items.length) return null;
    const accAmt = items.reduce((s, i) => s + (i.opening || 0), 0);
    const entAmt = items.reduce((s, i) => s + (i.entered_opening || 0), 0);
    if (accAmt === 0 && entAmt === 0) return null;
    const accountType = items[0].account_type || '';
    const isDebitNormal = accountType === 'A' || accountType === 'E';
    const toDrCr = (amt: number) => ({
      dr: isDebitNormal && amt > 0 ? amt : (!isDebitNormal && amt < 0 ? Math.abs(amt) : 0),
      cr: !isDebitNormal && amt > 0 ? amt : (isDebitNormal && amt < 0 ? Math.abs(amt) : 0),
    });
    const acc = toDrCr(accAmt);
    const ent = toDrCr(entAmt);
    return {
      key: isOpen ? 'opening-balance' : 'closing-balance',
      concatenatedSegments: acct,
      accountDescription: items[0].account_desc || '',
      jeLineDescription: isOpen ? 'Opening Balance' : 'Closing Balance',
      defaultPeriodName: period,
      accountingDate: '', batchName: '', userJeSourceName: '', userJeCategoryName: '',
      currencyCode: items[0].currency_code || 'AED',
      enteredDr: ent.dr, enteredCr: ent.cr,
      accountedDr: acc.dr, accountedCr: acc.cr,
      jeHeaderId: 0,
      isOpeningBalance: isOpen,
      isClosingBalance: !isOpen,
    } as JournalLine;
  }, [ledger]);

  // ── Search ──────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    if (!periods.length) { message.warning('Select at least one period'); return; }
    setLoading(true); setHasSearched(true); setRows([]); setOpeningBal(null); setClosingBal(null);

    try {
      const p = new URLSearchParams({ ledger_name: ledger });
      p.set('period_names', periods.join(','));
      if (company)     p.set('company', company);
      if (account)     p.set('account', account);
      if (jeSource)    p.set('je_source', jeSource);
      if (jeCategory)  p.set('je_category', jeCategory);
      const url = `${API_BASE}/accountanalysis?${p}`;
      setApiUrl(url);

      let items: JournalLine[] = [];
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const seen = new Set<string>();
          items = (data.items || []).flatMap((item: any, idx: number) => {
            const dk = `${item.je_header_id}-${item.je_line_number}`;
            if (seen.has(dk)) return [];
            seen.add(dk);
            return [{
              key: `row-${idx}`,
              concatenatedSegments: item.accountCombination || item.account_combination || '',
              accountDescription: item.accountDescription || item.account_description || '',
              jeLineDescription: item.description || item.DESCRIPTION || '',
              defaultPeriodName: item.defaultPeriodName || item.period_name || '',
              accountingDate: item.accountingDate || item.accounting_date || '',
              batchName: item.batchName || item.batch_name || '',
              userJeSourceName: item.userJeSourceName || item.je_source_name || '',
              userJeCategoryName: item.userJeCategoryName || item.je_category_name || '',
              currencyCode: item.currencyCode || item.currency_code || 'AED',
              enteredDr: Number(item.enteredDr || item.entered_dr || 0),
              enteredCr: Number(item.enteredCr || item.entered_cr || 0),
              accountedDr: Number(item.accountedDr || item.accounted_dr || 0),
              accountedCr: Number(item.accountedCr || item.accounted_cr || 0),
              jeHeaderId: Number(item.jeHeaderId || item.je_header_id || 0),
            } as JournalLine];
          });
        }
      } catch { /* treat as empty */ }

      // Opening / Closing balance
      const sortedPeriods = [...periods].sort((a, b) => parsePeriod(a) - parsePeriod(b));
      let openRow: JournalLine | null = null;
      let closeRow: JournalLine | null = null;
      if (account && sortedPeriods.length) {
        [openRow, closeRow] = await Promise.all([
          fetchBalanceRow(account, company, sortedPeriods[0], true),
          fetchBalanceRow(account, company, sortedPeriods[sortedPeriods.length - 1], false),
        ]);
      }

      const allRows: JournalLine[] = [
        ...(openRow ? [openRow] : []),
        ...items,
        ...(closeRow ? [closeRow] : []),
      ];

      if (openRow)  setOpeningBal({ acc: openRow.accountedDr - openRow.accountedCr, ent: openRow.enteredDr - openRow.enteredCr });
      if (closeRow) setClosingBal({ acc: closeRow.accountedDr - closeRow.accountedCr, ent: closeRow.enteredDr - closeRow.enteredCr });

      setRows(allRows);
      message.success(`${allRows.length} records loaded`);
    } catch (e: any) {
      message.error(`Search failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [ledger, periods, company, account, jeSource, jeCategory, fetchBalanceRow]);

  // ── Filtered rows + running balance + totals row ───────────────────────────
  const dataRows = useMemo(() => rows.filter(r => !r.isClosingBalance), [rows]);

  const filteredData = useMemo(() => {
    if (!gridSearch.trim()) return dataRows;
    const q = gridSearch.toLowerCase();
    return dataRows.filter(r =>
      Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))
    );
  }, [dataRows, gridSearch]);

  // Running balances for each row in filteredData
  const runningBals = useMemo(() => {
    let accRun = 0; let entRun = 0;
    return filteredData.map(r => {
      accRun += (r.accountedDr || 0) - (r.accountedCr || 0);
      entRun += (r.enteredDr   || 0) - (r.enteredCr   || 0);
      return { acc: accRun, ent: entRun };
    });
  }, [filteredData]);

  // Totals (sum of PTD rows — exclude opening/closing)
  const ptdTotals = useMemo(() => filteredData
    .filter(r => !r.isOpeningBalance && !r.isClosingBalance)
    .reduce((acc, r) => ({
      accDr: acc.accDr + r.accountedDr, accCr: acc.accCr + r.accountedCr,
      entDr: acc.entDr + r.enteredDr,   entCr: acc.entCr + r.enteredCr,
    }), { accDr: 0, accCr: 0, entDr: 0, entCr: 0 }),
  [filteredData]);

  // Grid totals (all rows including opening)
  const gridTotals = useMemo(() => filteredData
    .reduce((acc, r) => ({
      accDr: acc.accDr + r.accountedDr, accCr: acc.accCr + r.accountedCr,
      entDr: acc.entDr + r.enteredDr,   entCr: acc.entCr + r.enteredCr,
    }), { accDr: 0, accCr: 0, entDr: 0, entCr: 0 }),
  [filteredData]);

  const finalRunning = runningBals[runningBals.length - 1] ?? { acc: 0, ent: 0 };

  // Totals data row — injected at the end so alignment is guaranteed
  const totalsRow: JournalLine | null = filteredData.length > 0 ? {
    key: '__totals__',
    concatenatedSegments: '', accountDescription: '',
    jeLineDescription: 'Total for Report',
    defaultPeriodName: '', accountingDate: '', batchName: '',
    userJeSourceName: '', userJeCategoryName: '', currencyCode: '',
    enteredDr: gridTotals.entDr, enteredCr: gridTotals.entCr,
    accountedDr: gridTotals.accDr, accountedCr: gridTotals.accCr,
    jeHeaderId: 0, isTotals: true,
    _entBal: finalRunning.ent, _accBal: finalRunning.acc,
  } : null;

  const tableData = totalsRow ? [...filteredData, totalsRow] : filteredData;

  // ── Column definitions (flat — no grouped headers) ─────────────────────────
  const columns = useMemo((): ColumnsType<JournalLine> => {
    const isTot = (r: JournalLine) => !!r.isTotals;
    const isSpecial = (r: JournalLine) => !!(r.isOpeningBalance || r.isClosingBalance || r.isTotals);

    return [
      {
        title: 'Account',
        dataIndex: 'concatenatedSegments',
        key: 'account',
        width: 220,
        fixed: 'left',
        ellipsis: true,
        render: (text, record, idx) => {
          if (isTot(record)) return (
            <Text strong style={{ fontSize: 11, color: REDWOOD.neutral900 }}>Total for Report</Text>
          );
          if (record.isOpeningBalance) return (
            <Text strong style={{ fontSize: 10, color: REDWOOD.warning }}>{record.jeLineDescription}</Text>
          );
          if (record.isClosingBalance) return (
            <Text strong style={{ fontSize: 10, color: REDWOOD.success }}>{record.jeLineDescription}</Text>
          );
          return (
            <Text style={{ fontSize: 10, color: REDWOOD.info, cursor: 'pointer' }}>{text || '—'}</Text>
          );
        },
      },
      {
        title: 'Line Description',
        dataIndex: 'jeLineDescription',
        key: 'lineDesc',
        width: 200,
        ellipsis: true,
        render: (text, record) =>
          isTot(record) ? null : (
            <Tooltip title={text}>
              <span style={{ fontSize: 10, fontWeight: isSpecial(record) ? 600 : undefined }}>
                {text || '—'}
              </span>
            </Tooltip>
          ),
      },
      {
        title: 'Period',
        dataIndex: 'defaultPeriodName',
        key: 'period',
        width: 80,
        render: (v, r) => isTot(r) ? null : <span style={{ fontSize: 10 }}>{v}</span>,
      },
      {
        title: 'Acctg Date',
        dataIndex: 'accountingDate',
        key: 'acctgDate',
        width: 100,
        render: (v, r) => isTot(r) ? null : <span style={{ fontSize: 10 }}>{(v || '').slice(0, 10)}</span>,
      },
      {
        title: 'Batch',
        dataIndex: 'batchName',
        key: 'batch',
        width: 160,
        ellipsis: true,
        render: (v, r) => isTot(r) ? null : <span style={{ fontSize: 10 }}>{v}</span>,
      },
      {
        title: 'Source',
        dataIndex: 'userJeSourceName',
        key: 'source',
        width: 110,
        render: (v, r) => isTot(r) ? null : <span style={{ fontSize: 10 }}>{v}</span>,
      },
      {
        title: 'Category',
        dataIndex: 'userJeCategoryName',
        key: 'category',
        width: 120,
        render: (v, r) => isTot(r) ? null : <span style={{ fontSize: 10 }}>{v}</span>,
      },
      {
        title: 'Currency',
        dataIndex: 'currencyCode',
        key: 'currency',
        width: 80,
        render: (v, r) => isTot(r) ? null : <Tag style={{ fontSize: 9 }}>{v}</Tag>,
      },
      // ── Accounted columns (always visible) ───────────────────────────────
      {
        title: 'Acc Dr',
        dataIndex: 'accountedDr',
        key: 'accDr',
        width: 130,
        align: 'right',
        render: (v, r) => (
          <span style={{ fontSize: 10, color: v > 0 ? REDWOOD.success : undefined, fontWeight: isTot(r) ? 700 : undefined }}>
            {v > 0 ? fmtN(v) : ''}
          </span>
        ),
      },
      {
        title: 'Acc Cr',
        dataIndex: 'accountedCr',
        key: 'accCr',
        width: 130,
        align: 'right',
        render: (v, r) => (
          <span style={{ fontSize: 10, color: v > 0 ? REDWOOD.primary : undefined, fontWeight: isTot(r) ? 700 : undefined }}>
            {v > 0 ? fmtN(v) : ''}
          </span>
        ),
      },
      {
        title: 'Acc Balance',
        key: 'accBal',
        width: 140,
        align: 'right',
        render: (_, record, index) => {
          if (isTot(record)) return <FmtBal v={record._accBal ?? 0} size={10} />;
          const bal = isTot(record) ? (record._accBal ?? 0) : (runningBals[index]?.acc ?? 0);
          const v = runningBals[index]?.acc ?? 0;
          return v < 0
            ? <span style={{ fontSize: 10, color: REDWOOD.primary, fontWeight: isSpecial(record) ? 700 : undefined }}>{fmtN(Math.abs(v))} Cr</span>
            : <span style={{ fontSize: 10, color: REDWOOD.success, fontWeight: isSpecial(record) ? 700 : undefined }}>{fmtN(v)}</span>;
        },
      },
      // ── Entered columns (visible only when toggle is ON) ──────────────────
      ...(showEntered ? [
        {
          title: 'Ent Dr',
          dataIndex: 'enteredDr',
          key: 'entDr',
          width: 130,
          align: 'right' as const,
          render: (v: number, r: JournalLine) => (
            <span style={{ fontSize: 10, color: v > 0 ? REDWOOD.success : undefined, fontWeight: isTot(r) ? 700 : undefined }}>
              {v > 0 ? fmtN(v) : ''}
            </span>
          ),
        },
        {
          title: 'Ent Cr',
          dataIndex: 'enteredCr',
          key: 'entCr',
          width: 130,
          align: 'right' as const,
          render: (v: number, r: JournalLine) => (
            <span style={{ fontSize: 10, color: v > 0 ? REDWOOD.primary : undefined, fontWeight: isTot(r) ? 700 : undefined }}>
              {v > 0 ? fmtN(v) : ''}
            </span>
          ),
        },
        {
          title: 'Ent Balance',
          key: 'entBal',
          width: 140,
          align: 'right' as const,
          render: (_: any, record: JournalLine, index: number) => {
            if (isTot(record)) return <FmtBal v={record._entBal ?? 0} size={10} />;
            const v = runningBals[index]?.ent ?? 0;
            return v < 0
              ? <span style={{ fontSize: 10, color: REDWOOD.primary, fontWeight: isSpecial(record) ? 700 : undefined }}>{fmtN(Math.abs(v))} Cr</span>
              : <span style={{ fontSize: 10, color: REDWOOD.success, fontWeight: isSpecial(record) ? 700 : undefined }}>{fmtN(v)}</span>;
          },
        },
      ] : []),
      {
        title: '',
        key: 'drill',
        width: 36,
        fixed: 'right',
        render: (_: any, record: JournalLine) =>
          isTot(record) ? null : (
            <Tooltip title={`Journal ${record.jeHeaderId}`}>
              <Button type="text" size="small"
                icon={<AuditOutlined style={{ color: REDWOOD.info, fontSize: 13 }} />} />
            </Tooltip>
          ),
      },
    ];
  }, [showEntered, runningBals]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const exportExcel = () => {
    const cols = columns.filter(c => c.key !== 'drill' && c.key !== 'accBal' && c.key !== 'entBal');
    const ws = XLSX.utils.json_to_sheet(filteredData.map(r => ({
      Account: r.concatenatedSegments,
      'Line Desc': r.jeLineDescription,
      Period: r.defaultPeriodName,
      Date: r.accountingDate,
      Batch: r.batchName,
      Source: r.userJeSourceName,
      Category: r.userJeCategoryName,
      Currency: r.currencyCode,
      'Acc Dr': r.accountedDr || '',
      'Acc Cr': r.accountedCr || '',
      ...(showEntered ? { 'Ent Dr': r.enteredDr || '', 'Ent Cr': r.enteredCr || '' } : {}),
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Account Analysis');
    saveAs(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' }),
      `account_analysis_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{ padding: '12px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/gl">General Ledger</Link> },
            { title: 'Account Analysis' },
          ]} />
        </div>

        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── Parameter Card ── */}
          <Card
            size="small"
            styles={{ body: { padding: '14px 16px' } }}
            style={{ borderRadius: 10, border: `1px solid ${REDWOOD.neutral200}`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <BookOutlined style={{ color: REDWOOD.info, fontSize: 16 }} />
              <Text strong style={{ fontSize: 14 }}>Search Parameters</Text>
            </div>
            <Row gutter={[12, 8]}>
              <Col xs={24} sm={12} md={6}>
                <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 3, fontWeight: 500 }}>Ledger *</div>
                <Select
                  value={ledger} onChange={setLedger}
                  style={{ width: '100%' }} size="small" showSearch
                >
                  {ledgerOptions.map(l => <Option key={l} value={l}>{l}</Option>)}
                </Select>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 3, fontWeight: 500 }}>Company</div>
                <Select
                  value={company || undefined} onChange={setCompany}
                  style={{ width: '100%' }} size="small" showSearch allowClear placeholder="All Companies"
                  filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={companyOptions}
                />
              </Col>
              <Col xs={24} sm={12} md={8}>
                <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 3, fontWeight: 500 }}>
                  Period(s) * {periodsLoading && <ReloadOutlined spin style={{ marginLeft: 4, fontSize: 10 }} />}
                </div>
                <Select
                  mode="multiple" value={periods} onChange={setPeriods}
                  style={{ width: '100%' }} size="small" showSearch allowClear
                  placeholder="Select periods" maxTagCount={3}
                  loading={periodsLoading}
                >
                  {allPeriods.map(p => <Option key={p} value={p}>{p}</Option>)}
                </Select>
              </Col>
              <Col xs={24} sm={12} md={4}>
                <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 3, fontWeight: 500 }}>Account</div>
                <Input
                  value={account} onChange={e => setAccount(e.target.value)}
                  size="small" placeholder="e.g. 01-00-00-..." allowClear
                  prefix={<SearchOutlined style={{ fontSize: 10, color: REDWOOD.neutral600 }} />}
                />
              </Col>
              <Col xs={24} sm={12} md={5}>
                <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 3, fontWeight: 500 }}>Journal Source</div>
                <Input
                  value={jeSource} onChange={e => setJeSource(e.target.value)}
                  size="small" placeholder="Optional" allowClear
                />
              </Col>
              <Col xs={24} sm={12} md={5}>
                <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 3, fontWeight: 500 }}>Journal Category</div>
                <Input
                  value={jeCategory} onChange={e => setJeCategory(e.target.value)}
                  size="small" placeholder="Optional" allowClear
                />
              </Col>
              <Col xs={24} sm={12} md={4} style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <Button type="primary" icon={<SearchOutlined />} size="small" loading={loading}
                  onClick={handleSearch}
                  style={{ background: REDWOOD.info, borderColor: REDWOOD.info, flex: 1 }}>
                  Search
                </Button>
                <Button icon={<ClearOutlined />} size="small"
                  onClick={() => { setRows([]); setHasSearched(false); setPeriods([]); setAccount(''); setCompany(''); setJeSource(''); setJeCategory(''); }}>
                  Clear
                </Button>
              </Col>
            </Row>
          </Card>

          {/* ── Toolbar ── */}
          {hasSearched && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <Space>
                <Badge count={filteredData.length} color={REDWOOD.info} overflowCount={9999}>
                  <Text type="secondary" style={{ fontSize: 12 }}>records</Text>
                </Badge>
                <Divider type="vertical" />
                <Space size={6}>
                  <Switch size="small" checked={showEntered} onChange={setShowEntered}
                    style={{ background: showEntered ? '#52c41a' : undefined }} />
                  <Text style={{ fontSize: 12, color: showEntered ? '#52c41a' : REDWOOD.neutral600, fontWeight: showEntered ? 600 : undefined }}>
                    Show Entered
                  </Text>
                </Space>
              </Space>
              <Space>
                <Input
                  prefix={<SearchOutlined style={{ color: REDWOOD.neutral600 }} />}
                  placeholder="Filter results..." size="small" allowClear
                  value={gridSearch} onChange={e => setGridSearch(e.target.value)}
                  style={{ width: 200, borderRadius: 6 }}
                />
                <Tooltip title="View API URL">
                  <Button size="small" icon={<ApiOutlined />}
                    style={{ color: REDWOOD.info, borderColor: REDWOOD.info }}
                    onClick={() => setApiModalOpen(true)} />
                </Tooltip>
                <Button size="small" icon={<FileExcelOutlined />} onClick={exportExcel}
                  disabled={!filteredData.length}>Excel</Button>
              </Space>
            </div>
          )}

          {/* ── Grid ── */}
          <Spin spinning={loading}>
            {hasSearched && (
              <Table<JournalLine>
                dataSource={tableData}
                columns={columns}
                rowKey="key"
                size="small"
                scroll={{ x: 'max-content', y: 480 }}
                pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `${t} records` }}
                className="aa-v2-grid"
                rowClassName={record =>
                  record.isTotals ? 'aa-totals-row' :
                  record.isOpeningBalance ? 'aa-opening-row' :
                  record.isClosingBalance ? 'aa-closing-row' : ''
                }
              />
            )}
          </Spin>

          {/* ── Balance Summary ── */}
          {hasSearched && rows.length > 0 && (
            <Row gutter={12}>
              {/* Accounted */}
              <Col xs={24} md={showEntered ? 12 : 24}>
                <Card size="small"
                  styles={{ body: { padding: '10px 16px' } }}
                  style={{ borderRadius: 8, border: '1px solid #adc6ff', background: '#f0f5ff' }}>
                  <Text strong style={{ fontSize: 11, color: '#1677ff', display: 'block', marginBottom: 8 }}>
                    Accounted Balance
                  </Text>
                  <Row gutter={0}>
                    {[
                      { label: 'Opening Balance', v: openingBal?.acc ?? 0 },
                      { label: 'PTD Debits',      v: ptdTotals.accDr, color: REDWOOD.success },
                      { label: 'PTD Credits',     v: ptdTotals.accCr, color: REDWOOD.primary },
                      { label: 'Closing Balance', v: closingBal?.acc ?? 0 },
                    ].map((item, i, arr) => (
                      <Col key={i} flex="1" style={{ textAlign: 'center', padding: '4px 12px',
                        borderRight: i < arr.length - 1 ? '1px solid #adc6ff' : undefined }}>
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>{item.label}</Text>
                        {item.color
                          ? <Text strong style={{ fontSize: 14, color: item.color }}>{fmtN(item.v)}</Text>
                          : <FmtBal v={item.v} size={14} />}
                      </Col>
                    ))}
                  </Row>
                </Card>
              </Col>

              {/* Entered (only when toggle on) */}
              {showEntered && (
                <Col xs={24} md={12}>
                  <Card size="small"
                    styles={{ body: { padding: '10px 16px' } }}
                    style={{ borderRadius: 8, border: '1px solid #b7eb8f', background: '#f6ffed' }}>
                    <Text strong style={{ fontSize: 11, color: '#52c41a', display: 'block', marginBottom: 8 }}>
                      Entered Balance
                    </Text>
                    <Row gutter={0}>
                      {[
                        { label: 'Opening Balance', v: openingBal?.ent ?? 0 },
                        { label: 'PTD Debits',      v: ptdTotals.entDr, color: REDWOOD.success },
                        { label: 'PTD Credits',     v: ptdTotals.entCr, color: REDWOOD.primary },
                        { label: 'Closing Balance', v: closingBal?.ent ?? 0 },
                      ].map((item, i, arr) => (
                        <Col key={i} flex="1" style={{ textAlign: 'center', padding: '4px 12px',
                          borderRight: i < arr.length - 1 ? '1px solid #b7eb8f' : undefined }}>
                          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>{item.label}</Text>
                          {item.color
                            ? <Text strong style={{ fontSize: 14, color: item.color }}>{fmtN(item.v)}</Text>
                            : <FmtBal v={item.v} size={14} />}
                        </Col>
                      ))}
                    </Row>
                  </Card>
                </Col>
              )}
            </Row>
          )}
        </div>
      </Content>

      {/* API URL modal */}
      <Modal open={apiModalOpen} onCancel={() => setApiModalOpen(false)}
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} />API Endpoint</Space>}
        footer={<Button onClick={() => setApiModalOpen(false)}>Close</Button>} width={680}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 6,
            padding: '8px 12px', fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
            {apiUrl}
          </div>
          <Tooltip title="Copy">
            <Button size="small" icon={<CopyOutlined />}
              onClick={() => { navigator.clipboard.writeText(apiUrl); message.success('Copied'); }} />
          </Tooltip>
        </div>
        {apiUrl.includes('?') && (
          <div style={{ marginTop: 10, paddingLeft: 4 }}>
            {apiUrl.split('?')[1].split('&').map((p, i) => {
              const [k, v] = p.split('=');
              return (
                <div key={i} style={{ fontSize: 11, marginBottom: 2 }}>
                  <Text code style={{ fontSize: 11 }}>{decodeURIComponent(k)}</Text>
                  {' = '}
                  <Text style={{ fontSize: 11, color: REDWOOD.info }}>{decodeURIComponent(v || '')}</Text>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <style>{`
        .aa-v2-grid .ant-table-tbody > tr.aa-totals-row > td {
          background: #f0f0f0 !important;
          border-top: 2px solid #d9d9d9 !important;
          font-weight: 700;
        }
        .aa-v2-grid .ant-table-tbody > tr.aa-opening-row > td {
          background: #fffbe6 !important;
        }
        .aa-v2-grid .ant-table-tbody > tr.aa-closing-row > td {
          background: #f6ffed !important;
        }
      `}</style>
    </Layout>
  );
};

export default AccountAnalysisV2;
