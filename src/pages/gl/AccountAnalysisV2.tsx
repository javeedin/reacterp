import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Layout, Typography, Card, Breadcrumb, Space, Select, Input,
  Button, Table, Tag, Spin, Tooltip, message, Switch, Row, Col,
  Divider, Badge, Modal, Tabs, Radio,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, SearchOutlined, ClearOutlined,
  FileExcelOutlined, FilePdfOutlined, AuditOutlined, ReloadOutlined,
  ApiOutlined, CopyOutlined, BookOutlined, DownOutlined,
  FilterOutlined, PlusOutlined, GroupOutlined, BarChartOutlined,
} from '@ant-design/icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Link } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const { Content } = Layout;
const { Text } = Typography;
const { Option } = Select;

// ─── Constants ────────────────────────────────────────────────────────────────
const API_BASE           = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/gl';
const APEX_BASE          = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp';
const COMPANY_LOV_URL    = `${APEX_BASE}/valuesets/getvalues/BUIMERC_FIN_GLB_COA_CO`;
const ACCOUNTS_LOV_URL   = `${APEX_BASE}/glaccountslist`;
const SEGMENTS_API_URL   = `${APEX_BASE}/chartofaccounts/structuresegments`;
const VALUES_API_URL     = `${APEX_BASE}/valuesets/getvalues`;

const REDWOOD = {
  primary: '#C74634', success: '#1D7B4D', warning: '#D4A800',
  info: '#0572CE', neutral100: '#F7F7F7', neutral200: '#E5E5E5',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

const MONTH_MAP: Record<string, number> = {
  Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6,
  Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12,
};
const parsePeriod = (p: string) => {
  const [m, y] = p.split('-');
  return (2000 + parseInt(y || '0', 10)) * 100 + (MONTH_MAP[m] ?? 0);
};

// ─── Segment definitions ──────────────────────────────────────────────────────
interface SegmentDef { key: string; label: string; color: string; valueKey: string; }
const SEGMENT_DEFS: SegmentDef[] = [
  { key: 'company',      label: 'Company',          color: 'blue',     valueKey: 'companies'      },
  { key: 'lob',          label: 'LOB',              color: 'cyan',     valueKey: 'lobs'           },
  { key: 'department',   label: 'Department',       color: 'purple',   valueKey: 'departments'    },
  { key: 'sub_account',  label: 'Sub-Account',      color: 'orange',   valueKey: 'subAccounts'    },
  { key: 'analysis',     label: 'Analysis',         color: 'geekblue', valueKey: 'analyses'       },
  { key: 'intercompany', label: 'Intercompany',     color: 'magenta',  valueKey: 'intercompanies' },
  { key: 'je_source',    label: 'Journal Source',   color: 'volcano',  valueKey: 'sources'        },
  { key: 'je_category',  label: 'Journal Category', color: 'gold',     valueKey: 'categories'     },
];

const SEG_IDX: Record<string, number> = {
  segCompany: 0, segLob: 1, segDept: 2, segSubAcct: 3, segAnalysis: 4, segInterco: 5,
};

const getGroupVal = (r: { concatenatedSegments: string; [k: string]: unknown }, field: string): string => {
  const direct = String(r[field] || '');
  if (direct) return direct;
  if (field in SEG_IDX) {
    const parts = r.concatenatedSegments.split('-');
    return parts[SEG_IDX[field]] || '';
  }
  return '';
};

const GROUP_BY_OPTIONS: { value: string; label: string; group?: string }[] = [
  { value: 'concatenatedSegments',  label: 'Full Combination', group: 'Combination' },
  { value: 'defaultPeriodName',     label: 'Period',           group: 'Field' },
  { value: 'batchName',             label: 'Batch',            group: 'Field' },
  { value: 'userJeSourceName',      label: 'Journal Source',   group: 'Field' },
  { value: 'userJeCategoryName',    label: 'Journal Category', group: 'Field' },
  { value: 'currencyCode',          label: 'Full Combination + Currency', group: 'Combination' },
  { value: 'segCompany',            label: 'Company',          group: 'Segment' },
  { value: 'segLob',                label: 'LOB',              group: 'Segment' },
  { value: 'segDept',               label: 'Department',       group: 'Segment' },
  { value: 'segSubAcct',            label: 'Sub-Account',      group: 'Segment' },
  { value: 'segAnalysis',           label: 'Analysis',         group: 'Segment' },
  { value: 'segInterco',            label: 'Intercompany',     group: 'Segment' },
];

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface PeriodInfo {
  period_name_id: string;
  period_year: number;
  period_number: number;
}

interface AccountOption { account: string; description: string; account_type: string; }

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
  segCompany?: string;
  segLob?: string;
  segDept?: string;
  segAccount?: string;
  segSubAcct?: string;
  segAnalysis?: string;
  segInterco?: string;
  approvalStatus?: string;
  isOpeningBalance?: boolean;
  isClosingBalance?: boolean;
  isTotals?: boolean;
  _entBal?: number;
  _accBal?: number;
}

interface GroupedRow {
  key: string;
  groupValue: string;
  count: number;
  lines: JournalLine[];
  totalEntDr: number;
  totalEntCr: number;
  totalAccDr: number;
  totalAccCr: number;
  accBalance: number;
  entBalance: number;
  isTotals?: boolean;
}

interface ComboBreakLine extends JournalLine {
  _accRun: number;
  _entRun: number;
}

interface ComboBreak {
  combo: string;
  description: string;
  openingRow: JournalLine | null;
  closingRow: JournalLine | null;
  linesWithBal: ComboBreakLine[];
  ptdAccDr: number;
  ptdAccCr: number;
  ptdEntDr: number;
  ptdEntCr: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtN = (v: number) =>
  Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FmtBal: React.FC<{ v: number; size?: number; bold?: boolean }> = ({ v, size = 12, bold }) =>
  v < 0
    ? <Text strong={bold} style={{ fontSize: size, color: REDWOOD.primary }}>{fmtN(Math.abs(v))} Cr</Text>
    : <Text strong={bold} style={{ fontSize: size, color: REDWOOD.success }}>{fmtN(v)}</Text>;

const DrCell: React.FC<{ v: number; bold?: boolean }> = ({ v, bold }) =>
  v > 0 ? <span style={{ fontSize: 10, color: REDWOOD.success, fontWeight: bold ? 700 : undefined }}>{fmtN(v)}</span> : null;

const CrCell: React.FC<{ v: number; bold?: boolean }> = ({ v, bold }) =>
  v > 0 ? <span style={{ fontSize: 10, color: REDWOOD.primary, fontWeight: bold ? 700 : undefined }}>{fmtN(v)}</span> : null;

// ─── ClickField ───────────────────────────────────────────────────────────────
const ClickField: React.FC<{ label: string; placeholder: string; onClick: () => void; onClear?: () => void }> = ({
  label, placeholder, onClick, onClear,
}) => (
  <div style={{ display: 'flex', gap: 4 }}>
    <div onClick={onClick}
      style={{
        flex: 1, height: 24, padding: '0 8px', border: `1px solid #d9d9d9`, borderRadius: 6,
        background: REDWOOD.surface, cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', fontSize: 12,
        color: label ? REDWOOD.neutral900 : REDWOOD.neutral600, userSelect: 'none',
        transition: 'border-color 0.2s', overflow: 'hidden',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = REDWOOD.info)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#d9d9d9')}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label || placeholder}
      </span>
      <DownOutlined style={{ fontSize: 9, color: REDWOOD.neutral600, flexShrink: 0, marginLeft: 4 }} />
    </div>
    {label && onClear && (
      <Button size="small" type="text" style={{ padding: '0 4px', height: 24 }} onClick={onClear}>✕</Button>
    )}
  </div>
);

// ─── Account Picker ───────────────────────────────────────────────────────────
const AccountPicker: React.FC<{
  open: boolean; onClose: () => void;
  onSelect: (a: string, d: string) => void;
  options: AccountOption[]; loading: boolean;
}> = ({ open, onClose, onSelect, options, loading }) => {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const lq = q.toLowerCase();
    return q ? options.filter(o => o.account.toLowerCase().includes(lq) || o.description.toLowerCase().includes(lq)) : options;
  }, [options, q]);
  const typeColor: Record<string, string> = { A: 'gold', L: 'volcano', E: 'green', R: 'blue', O: 'purple' };
  const typeLabel: Record<string, string> = { A: 'Asset', L: 'Liability', E: 'Expense', R: 'Revenue', O: 'OE' };
  const close = () => { onClose(); setQ(''); };
  return (
    <Modal open={open} onCancel={close} footer={null}
      title={<Space><SearchOutlined style={{ color: REDWOOD.info }} />Select Account</Space>} width={640}>
      <Input prefix={<SearchOutlined />} placeholder="Search code or description…" allowClear size="small"
        value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 8 }} autoFocus />
      <div onClick={() => { onSelect('', ''); close(); }}
        style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: `1px solid ${REDWOOD.neutral200}`,
          background: '#fafafa', fontSize: 12, color: REDWOOD.neutral600 }}
        onMouseEnter={e => (e.currentTarget.style.background = '#e6f4ff')}
        onMouseLeave={e => (e.currentTarget.style.background = '#fafafa')}>— All Accounts —</div>
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 24, textAlign: 'center' }}><Spin size="small" /></div>}
        {!loading && filtered.map(o => (
          <div key={o.account} onClick={() => { onSelect(o.account, o.description); close(); }}
            style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex', gap: 10, alignItems: 'center' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#e6f4ff')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}>
            <Text code style={{ fontSize: 11, minWidth: 140 }}>{o.account}</Text>
            <Text style={{ fontSize: 12, flex: 1 }}>{o.description}</Text>
            {o.account_type && (
              <Tag color={typeColor[o.account_type] || 'default'} style={{ fontSize: 10, margin: 0 }}>
                {typeLabel[o.account_type] || o.account_type}
              </Tag>
            )}
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: REDWOOD.neutral600 }}>No accounts found</div>
        )}
      </div>
    </Modal>
  );
};

// ─── Segment Filter Picker ────────────────────────────────────────────────────
const SegmentPicker: React.FC<{
  open: boolean; onClose: () => void;
  segmentValues: Record<string, string[]>;
  companyOptions: { value: string; meaning: string }[];
  segDescMaps: Record<string, Record<string, string>>;
  existing: Record<string, string>;
  onAdd: (key: string, value: string, label?: string) => void;
  loading: boolean;
}> = ({ open, onClose, segmentValues, companyOptions, segDescMaps, existing, onAdd, loading }) => {
  const [sel, setSel] = useState<SegmentDef | null>(null);
  const [q, setQ]     = useState('');

  const getValues = (seg: SegmentDef) => {
    if (seg.key === 'company') {
      return companyOptions.map(c => ({ value: c.value, label: `${c.value} – ${c.meaning}` }));
    }
    const descMap = segDescMaps[seg.valueKey] || {};
    return (segmentValues[seg.valueKey] || []).map(v => {
      const desc = descMap[v];
      return { value: v, label: desc ? `${v} – ${desc}` : v };
    });
  };

  const vals = sel ? getValues(sel) : [];
  const filtered = q ? vals.filter(v => v.label.toLowerCase().includes(q.toLowerCase())) : vals;
  const close = () => { onClose(); setSel(null); setQ(''); };

  return (
    <Modal open={open} onCancel={close} footer={null} width={560}
      title={
        <Space>
          <FilterOutlined style={{ color: REDWOOD.info }} />
          {sel ? (
            <Space>
              <Button size="small" type="text" onClick={() => { setSel(null); setQ(''); }}
                style={{ padding: '0 4px' }}>← Back</Button>
              <span>{sel.label} — Choose Value</span>
            </Space>
          ) : 'Add Segment Filter'}
        </Space>
      }>
      {!sel ? (
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
            Select a segment to filter by:
          </Text>
          {loading && <div style={{ padding: 24, textAlign: 'center' }}><Spin size="small" /></div>}
          <Row gutter={[8, 8]}>
            {SEGMENT_DEFS.map(seg => {
              const cnt = seg.key === 'company' ? companyOptions.length : (segmentValues[seg.valueKey] || []).length;
              return (
                <Col key={seg.key} xs={12} sm={8}>
                  <div onClick={() => { setSel(seg); setQ(''); }}
                    style={{
                      padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${existing[seg.key] ? REDWOOD.info : REDWOOD.neutral200}`,
                      background: existing[seg.key] ? '#e6f4ff' : REDWOOD.surface,
                      display: 'flex', flexDirection: 'column', gap: 4, transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = REDWOOD.info)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = existing[seg.key] ? REDWOOD.info : REDWOOD.neutral200)}>
                    <Tag color={seg.color} style={{ fontSize: 10, margin: 0, width: 'fit-content' }}>{seg.label}</Tag>
                    {existing[seg.key]
                      ? <Text style={{ fontSize: 11, color: REDWOOD.info }}>✓ {existing[seg.key]}</Text>
                      : <Text type="secondary" style={{ fontSize: 11 }}>{cnt} values</Text>}
                  </div>
                </Col>
              );
            })}
          </Row>
        </div>
      ) : (
        <div>
          <Input prefix={<SearchOutlined />} placeholder={`Search ${sel.label}…`} allowClear size="small"
            value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 8 }} autoFocus />
          {existing[sel.key] && (
            <div onClick={() => { onAdd(sel.key, '', ''); setSel(null); setQ(''); }}
              style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: `1px solid ${REDWOOD.neutral200}`,
                background: '#fff7e6', fontSize: 12, color: '#d46b08', fontWeight: 500 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#ffe7ba')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff7e6')}>
              ✕ Clear filter for {sel.label}
            </div>
          )}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: REDWOOD.neutral600 }}>No values found</div>
            )}
            {filtered.map(v => (
              <div key={v.value} onClick={() => { onAdd(sel.key, v.value, v.label); setSel(null); setQ(''); close(); }}
                style={{
                  padding: '8px 12px', cursor: 'pointer', borderBottom: `1px solid ${REDWOOD.neutral200}`,
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: existing[sel.key] === v.value ? '#e6f4ff' : '',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#e6f4ff')}
                onMouseLeave={e => (e.currentTarget.style.background = existing[sel.key] === v.value ? '#e6f4ff' : '')}>
                {v.label.includes(' – ') ? (
                  <>
                    <Tag color={sel.color} style={{ fontSize: 11, minWidth: 56, textAlign: 'center', margin: 0 }}>{v.value}</Tag>
                    <Text style={{ fontSize: 12 }}>{v.label.split(' – ').slice(1).join(' – ')}</Text>
                  </>
                ) : (
                  <Text style={{ fontSize: 12 }}>{v.label}</Text>
                )}
                {existing[sel.key] === v.value && (
                  <Tag color="blue" style={{ fontSize: 10, margin: 0, marginLeft: 'auto' }}>Selected</Tag>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};

// ─── Drill-Down Modal ─────────────────────────────────────────────────────────
const DrillModal: React.FC<{
  open: boolean; onClose: () => void;
  record: JournalLine | null;
  lines: any[]; loading: boolean;
  functionalCcy: string;
}> = ({ open, onClose, record, lines, loading, functionalCcy }) => {
  const totals = useMemo(() => lines.reduce((acc, l) => ({
    entDr: acc.entDr + Number(l.entered_dr || l.enteredDr || 0),
    entCr: acc.entCr + Number(l.entered_cr || l.enteredCr || 0),
    accDr: acc.accDr + Number(l.accounted_dr || l.accountedDr || 0),
    accCr: acc.accCr + Number(l.accounted_cr || l.accountedCr || 0),
  }), { entDr: 0, entCr: 0, accDr: 0, accCr: 0 }), [lines]);

  const drillCols: ColumnsType<any> = [
    { title: '#', key: 'lineNo', width: 44,
      render: (_: any, r: any) => <span style={{ fontSize: 10, color: REDWOOD.neutral600 }}>{r.je_line_number || r.jeLineNumber || ''}</span> },
    { title: 'Account', key: 'acct', width: 190,
      render: (_: any, r: any) => {
        const combo = r.account_combination || r.accountCombination || r.concatenatedSegments ||
          [r.company, r.lob, r.department, r.account, r.sub_account || r.subAccount, r.analysis, r.intercompany]
            .filter(Boolean).join('-');
        return <Text code style={{ fontSize: 10 }}>{combo || '—'}</Text>;
      } },
    { title: 'Description', key: 'desc', ellipsis: true,
      render: (_: any, r: any) => (
        <Tooltip title={r.description || r.je_line_description || ''}>
          <span style={{ fontSize: 10 }}>{r.description || r.je_line_description || '—'}</span>
        </Tooltip>
      ) },
    { title: 'Ent Dr', key: 'entDr', width: 120, align: 'right',
      render: (_: any, r: any) => { const v = Number(r.entered_dr || r.enteredDr || 0); return v ? <span style={{ fontSize: 10, color: REDWOOD.success }}>{fmtN(v)}</span> : null; } },
    { title: 'Ent Cr', key: 'entCr', width: 120, align: 'right',
      render: (_: any, r: any) => { const v = Number(r.entered_cr || r.enteredCr || 0); return v ? <span style={{ fontSize: 10, color: REDWOOD.primary }}>{fmtN(v)}</span> : null; } },
    { title: `Acc Dr (${functionalCcy})`, key: 'accDr', width: 130, align: 'right',
      render: (_: any, r: any) => { const v = Number(r.accounted_dr || r.accountedDr || 0); return v ? <span style={{ fontSize: 10, color: REDWOOD.success }}>{fmtN(v)}</span> : null; } },
    { title: `Acc Cr (${functionalCcy})`, key: 'accCr', width: 130, align: 'right',
      render: (_: any, r: any) => { const v = Number(r.accounted_cr || r.accountedCr || 0); return v ? <span style={{ fontSize: 10, color: REDWOOD.primary }}>{fmtN(v)}</span> : null; } },
    { title: 'Ccy', key: 'ccy', width: 60,
      render: (_: any, r: any) => <Tag style={{ fontSize: 9 }}>{r.currency_code || r.currencyCode || ''}</Tag> },
  ];

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={1100} style={{ top: 20 }}
      title={
        <Space wrap>
          <AuditOutlined style={{ color: REDWOOD.info }} />
          <Text strong>Journal Lines</Text>
          {record && (
            <>
              <Tag color="geekblue">{record.batchName || `JE #${record.jeHeaderId}`}</Tag>
              <Tag color="blue">ID: {record.jeHeaderId}</Tag>
              <Tag>{record.defaultPeriodName}</Tag>
              <Tag>{record.userJeSourceName}</Tag>
            </>
          )}
          <Tag color={lines.length ? 'green' : 'default'}>{lines.length} lines</Tag>
        </Space>
      }>
      <Spin spinning={loading}>
        <Table dataSource={lines.map((l, i) => ({ ...l, key: i }))}
          columns={drillCols} size="small" pagination={false}
          scroll={{ x: 900, y: 420 }}
          summary={() => lines.length === 0 ? null : (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}>
                  <Text strong style={{ fontSize: 11 }}>Total</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <Text strong style={{ fontSize: 10, color: REDWOOD.success }}>{totals.entDr ? fmtN(totals.entDr) : ''}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <Text strong style={{ fontSize: 10, color: REDWOOD.primary }}>{totals.entCr ? fmtN(totals.entCr) : ''}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">
                  <Text strong style={{ fontSize: 10, color: REDWOOD.success }}>{totals.accDr ? fmtN(totals.accDr) : ''}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">
                  <Text strong style={{ fontSize: 10, color: REDWOOD.primary }}>{totals.accCr ? fmtN(totals.accCr) : ''}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} />
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Spin>
    </Modal>
  );
};

// ─── Trial Balance Panel ──────────────────────────────────────────────────────
const TBPanel: React.FC = () => {
  const [ledger, setLedger]               = useState('');
  const [ledgerOptions, setLedgerOptions] = useState<string[]>([]);
  const [ledgersLoading, setLedgersLoading] = useState(false);
  const [company, setCompany]             = useState('');
  const [companyOptions, setCompanyOptions] = useState<{ value: string; meaning: string }[]>([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [allPeriods, setAllPeriods]       = useState<PeriodInfo[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [selectedYear, setSelectedYear]   = useState<number | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [ptdYtd, setPtdYtd]               = useState<'PTD' | 'YTD'>('PTD');
  const [showEntered, setShowEntered]     = useState(false);
  const [tbData, setTbData]               = useState<any[]>([]);
  const [loading, setLoading]             = useState(false);
  const [hasSearched, setHasSearched]     = useState(false);
  const [functionalCcy, setFunctionalCcy] = useState('AED');
  const [gridSearch, setGridSearch]       = useState('');

  // Load ledgers
  useEffect(() => {
    setLedgersLoading(true);
    fetch(`${API_BASE}/getledgername`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const names = [...new Set(
          (data.items || []).map((i: any) => i.ledger_name).filter(Boolean) as string[]
        )];
        setLedgerOptions(names);
        if (names.length) setLedger(names[0]);
      })
      .catch(() => {})
      .finally(() => setLedgersLoading(false));
  }, []);

  // Load company LOV
  useEffect(() => {
    setCompanyLoading(true);
    fetch(COMPANY_LOV_URL)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setCompanyOptions(
          (data.items || [])
            .map((i: any) => ({
              value: i.value || i.VALUE || '',
              meaning: i.meaning || i.MEANING || i.description || i.DESCRIPTION || i.name || i.NAME || '',
            }))
            .filter((c: any) => c.value)
        );
      })
      .catch(() => {})
      .finally(() => setCompanyLoading(false));
  }, []);

  // Load periods when ledger changes
  useEffect(() => {
    if (!ledger) return;
    setPeriodsLoading(true);
    setAllPeriods([]);
    setSelectedYear(null);
    setSelectedPeriod('');
    fetch(`${APEX_BASE}/periodsstatus/create?ledger_name=${encodeURIComponent(ledger)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const items: PeriodInfo[] = (data.items || [])
          .filter((i: any) => i.period_year && (i.period_name_id || i.period_name))
          .map((i: any) => ({
            period_name_id: i.period_name_id || i.period_name || '',
            period_year: Number(i.period_year),
            period_number: Number(i.period_number || 0),
          }));
        setAllPeriods(items);
        if (items.length) {
          const latestYear = Math.max(...items.map(p => p.period_year));
          setSelectedYear(latestYear);
        }
      })
      .catch(() => {})
      .finally(() => setPeriodsLoading(false));
  }, [ledger]);

  // Years derived from periods
  const years = useMemo(() =>
    [...new Set(allPeriods.map(p => p.period_year))].sort((a, b) => b - a),
  [allPeriods]);

  // Periods for selected year, sorted by period_number
  const periodsForYear = useMemo(() => {
    if (!selectedYear) return [];
    return allPeriods
      .filter(p => p.period_year === selectedYear)
      .sort((a, b) => a.period_number - b.period_number);
  }, [allPeriods, selectedYear]);

  // Auto-select latest period when year changes
  useEffect(() => {
    if (periodsForYear.length) {
      setSelectedPeriod(periodsForYear[periodsForYear.length - 1].period_name_id);
    } else {
      setSelectedPeriod('');
    }
  }, [periodsForYear]);

  // Search
  const handleSearch = useCallback(async () => {
    if (!ledger || !selectedPeriod) { message.warning('Select ledger and period'); return; }
    setLoading(true); setHasSearched(true); setTbData([]);
    try {
      const p = new URLSearchParams({ ledger_name: ledger, period_name: selectedPeriod });
      if (company) p.set('company', company);
      const res = await fetch(`${API_BASE}/rr-trialbalance/standard?${p}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items: any[] = data.items || [];
      if (items.length) {
        const ccy = items[0].ledger_currency || items[0].functional_currency || items[0].ledger_ccy || 'AED';
        setFunctionalCcy(ccy);
      }
      setTbData(items.map((i: any, idx: number) => ({ ...i, key: `tb-${idx}` })));
      message.success(`${items.length} accounts loaded`);
    } catch (e: any) {
      message.error(`Failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [ledger, selectedPeriod, company]);

  // Filtered data
  const filteredData = useMemo(() => {
    if (!gridSearch.trim()) return tbData;
    const q = gridSearch.toLowerCase();
    return tbData.filter(r =>
      (r.account_combination || '').toLowerCase().includes(q) ||
      (r.account_desc || '').toLowerCase().includes(q)
    );
  }, [tbData, gridSearch]);

  // Totals
  const totals = useMemo(() => filteredData.reduce((acc, r) => ({
    opening:    acc.opening    + Number(ptdYtd === 'PTD' ? (r.opening    || 0) : (r.ytd_opening    || 0)),
    debit:      acc.debit      + Number(ptdYtd === 'PTD' ? (r.debit      || 0) : (r.ytd_debit      || 0)),
    credit:     acc.credit     + Number(ptdYtd === 'PTD' ? (r.credit     || 0) : (r.ytd_credit     || 0)),
    closing:    acc.closing    + Number(r.closing || 0),
    entOpening: acc.entOpening + Number(ptdYtd === 'PTD' ? (r.entered_opening || 0) : (r.ytd_entered_opening || 0)),
    entDebit:   acc.entDebit   + Number(ptdYtd === 'PTD' ? (r.entered_debit   || 0) : (r.ytd_entered_debit   || 0)),
    entCredit:  acc.entCredit  + Number(ptdYtd === 'PTD' ? (r.entered_credit  || 0) : (r.ytd_entered_credit  || 0)),
    entClosing: acc.entClosing + Number(r.entered_closing || 0),
  }), { opening: 0, debit: 0, credit: 0, closing: 0, entOpening: 0, entDebit: 0, entCredit: 0, entClosing: 0 }),
  [filteredData, ptdYtd]);

  // Columns
  const columns = useMemo((): ColumnsType<any> => {
    const typeColor: Record<string, string> = { A: 'gold', L: 'volcano', E: 'green', R: 'blue', O: 'purple' };

    const entCols: ColumnsType<any> = showEntered ? [
      { title: <span style={{ color: '#52c41a', fontWeight: 600 }}>{ptdYtd === 'PTD' ? 'Ent Opening' : 'YTD Ent Opening'}</span>,
        key: 'entOpening', width: 140, align: 'right' as const,
        render: (_: any, r: any) => <FmtBal v={Number(ptdYtd === 'PTD' ? (r.entered_opening || 0) : (r.ytd_entered_opening || 0))} size={10} bold={r.isTotals} /> },
      { title: <span style={{ color: '#52c41a', fontWeight: 600 }}>{ptdYtd === 'PTD' ? 'Ent Dr' : 'YTD Ent Dr'}</span>,
        key: 'entDebit', width: 130, align: 'right' as const,
        render: (_: any, r: any) => { const v = Number(ptdYtd === 'PTD' ? (r.entered_debit || 0) : (r.ytd_entered_debit || 0)); return v ? <DrCell v={v} bold={r.isTotals} /> : null; } },
      { title: <span style={{ color: '#52c41a', fontWeight: 600 }}>{ptdYtd === 'PTD' ? 'Ent Cr' : 'YTD Ent Cr'}</span>,
        key: 'entCredit', width: 130, align: 'right' as const,
        render: (_: any, r: any) => { const v = Number(ptdYtd === 'PTD' ? (r.entered_credit || 0) : (r.ytd_entered_credit || 0)); return v ? <CrCell v={v} bold={r.isTotals} /> : null; } },
      ...(ptdYtd === 'PTD' ? [{ title: <span style={{ color: '#52c41a', fontWeight: 600 }}>Ent Closing</span>,
        key: 'entClosing', width: 130, align: 'right' as const,
        render: (_: any, r: any) => <FmtBal v={Number(r.entered_closing || 0)} size={10} bold={r.isTotals} /> }] : []),
    ] : [];

    const accCols: ColumnsType<any> = ptdYtd === 'PTD' ? [
      { title: <span style={{ color: REDWOOD.info, fontWeight: 600 }}>Opening ({functionalCcy})</span>,
        key: 'opening', width: 150, align: 'right' as const,
        render: (_: any, r: any) => <FmtBal v={Number(r.opening || 0)} size={10} bold={r.isTotals} /> },
      { title: <span style={{ color: REDWOOD.success, fontWeight: 600 }}>Acct Dr ({functionalCcy})</span>,
        key: 'debit', width: 150, align: 'right' as const,
        render: (_: any, r: any) => { const v = Number(r.debit || 0); return v ? <DrCell v={v} bold={r.isTotals} /> : null; } },
      { title: <span style={{ color: REDWOOD.primary, fontWeight: 600 }}>Acct Cr ({functionalCcy})</span>,
        key: 'credit', width: 150, align: 'right' as const,
        render: (_: any, r: any) => { const v = Number(r.credit || 0); return v ? <CrCell v={v} bold={r.isTotals} /> : null; } },
      { title: <span style={{ color: REDWOOD.info, fontWeight: 600 }}>Closing ({functionalCcy})</span>,
        key: 'closing', width: 150, align: 'right' as const,
        render: (_: any, r: any) => <FmtBal v={Number(r.closing || 0)} size={10} bold={r.isTotals} /> },
    ] : [
      { title: <span style={{ color: REDWOOD.info, fontWeight: 600 }}>YTD Opening ({functionalCcy})</span>,
        key: 'ytdOpening', width: 160, align: 'right' as const,
        render: (_: any, r: any) => <FmtBal v={Number(r.ytd_opening || 0)} size={10} bold={r.isTotals} /> },
      { title: <span style={{ color: REDWOOD.success, fontWeight: 600 }}>YTD Acct Dr ({functionalCcy})</span>,
        key: 'ytdDebit', width: 160, align: 'right' as const,
        render: (_: any, r: any) => { const v = Number(r.ytd_debit || 0); return v ? <DrCell v={v} bold={r.isTotals} /> : null; } },
      { title: <span style={{ color: REDWOOD.primary, fontWeight: 600 }}>YTD Acct Cr ({functionalCcy})</span>,
        key: 'ytdCredit', width: 160, align: 'right' as const,
        render: (_: any, r: any) => { const v = Number(r.ytd_credit || 0); return v ? <CrCell v={v} bold={r.isTotals} /> : null; } },
      { title: <span style={{ color: REDWOOD.info, fontWeight: 600 }}>YTD Closing ({functionalCcy})</span>,
        key: 'ytdClosing', width: 160, align: 'right' as const,
        render: (_: any, r: any) => <FmtBal v={Number(r.closing || 0)} size={10} bold={r.isTotals} /> },
    ];

    return [
      { title: 'Account', key: 'account', width: 200, fixed: 'left', ellipsis: true,
        render: (_: any, r: any) => r.isTotals
          ? <Text strong style={{ fontSize: 11 }}>Total ({filteredData.length} accounts)</Text>
          : <Text code style={{ fontSize: 10 }}>{r.account_combination || r.account || '—'}</Text> },
      { title: 'Description', key: 'desc', ellipsis: true,
        render: (_: any, r: any) => r.isTotals ? null : (
          <Tooltip title={r.account_desc}>
            <span style={{ fontSize: 11 }}>{r.account_desc || '—'}</span>
          </Tooltip>
        ) },
      { title: 'Type', key: 'type', width: 55,
        render: (_: any, r: any) => {
          if (r.isTotals) return null;
          const t = r.account_type || '';
          return t ? <Tag color={typeColor[t] || 'default'} style={{ fontSize: 9 }}>{t}</Tag> : null;
        } },
      { title: 'Ccy', key: 'currency', width: 60,
        render: (_: any, r: any) => r.isTotals ? null : (
          r.currency_code ? <Tag style={{ fontSize: 9 }}>{r.currency_code}</Tag> : null
        ) },
      ...entCols,
      ...accCols,
    ];
  }, [showEntered, ptdYtd, functionalCcy, filteredData.length]);

  // Totals row injected at bottom of table (avoids Table.Summary alignment issues)
  const totalsRow = filteredData.length > 0 ? {
    key: '__tb_totals__', isTotals: true,
    opening: totals.opening, debit: totals.debit, credit: totals.credit, closing: totals.closing,
    ytd_opening: totals.opening, ytd_debit: totals.debit, ytd_credit: totals.credit,
    entered_opening: totals.entOpening, entered_debit: totals.entDebit,
    entered_credit: totals.entCredit, entered_closing: totals.entClosing,
    ytd_entered_opening: totals.entOpening, ytd_entered_debit: totals.entDebit,
    ytd_entered_credit: totals.entCredit,
  } : null;
  const tableData = totalsRow ? [...filteredData, totalsRow] : filteredData;

  // Excel export for Trial Balance
  const exportTBExcel = async () => {
    if (!filteredData.length) { message.warning('No data to export'); return; }
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ReactERP'; wb.created = new Date();
    const ws = wb.addWorksheet('Trial Balance');
    const white = { argb: 'FFFFFFFF' };
    const numFmt = '#,##0.00';
    const entColCount = showEntered ? (ptdYtd === 'PTD' ? 4 : 3) : 0;
    const accColCount = 4; // always 4: opening, dr, cr, closing
    const baseColCount = 4; // Account, Description, Type, Currency
    const NCOLS = baseColCount + entColCount + accColCount;
    const mergeFull = (r: number) => ws.mergeCells(r, 1, r, NCOLS);

    const hdrFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC74634' } };
    const fltFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0D6' } };
    const colFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3D3D3D' } };
    const totFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    const altFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
    const accHdrFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5FCC' } };
    const entHdrFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF389E0D' } };
    const entFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9F7BE' } };
    const accFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4FF' } };

    // Title row
    mergeFull(1);
    const tc = ws.getCell('A1');
    tc.value = 'Trial Balance';
    tc.font = { bold: true, size: 13, color: white };
    tc.fill = hdrFill; tc.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 22;

    // Filter rows
    const coName = company ? (companyOptions.find(c => c.value === company)?.meaning || company) : 'All Companies';
    const fRows: [string, string][] = [
      ['Ledger',   ledger || '—'],
      ['Company',  coName],
      ['Period',   selectedPeriod || '—'],
      ['Mode',     ptdYtd],
      ['Currency', functionalCcy],
      ['Exported', new Date().toLocaleString()],
      ['Records',  String(filteredData.length)],
    ];
    let ri = 2;
    for (const [lbl, val] of fRows) {
      ws.mergeCells(ri, 1, ri, 3); ws.mergeCells(ri, 4, ri, NCOLS);
      const lc = ws.getCell(ri, 1); const vc = ws.getCell(ri, 4);
      lc.value = lbl; vc.value = val;
      lc.font = { bold: true, size: 10 }; vc.font = { size: 10 };
      lc.fill = fltFill;
      lc.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      vc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      ws.getRow(ri).height = 16; ri++;
    }
    ri++;

    // Group header row
    ws.getRow(ri).height = 16;
    for (let c = 1; c <= baseColCount; c++) ws.getCell(ri, c).fill = colFill;
    let col = baseColCount + 1;
    if (showEntered) {
      ws.mergeCells(ri, col, ri, col + entColCount - 1);
      const ec = ws.getCell(ri, col);
      ec.value = 'Entered (Transaction Currency)';
      ec.font = { bold: true, size: 10, color: { argb: 'FF52C41A' } };
      ec.fill = entFill; ec.alignment = { horizontal: 'center', vertical: 'middle' };
      col += entColCount;
    }
    ws.mergeCells(ri, col, ri, col + accColCount - 1);
    const ac = ws.getCell(ri, col);
    ac.value = `${ptdYtd} Accounted (${functionalCcy})`;
    ac.font = { bold: true, size: 10, color: { argb: 'FF1677FF' } };
    ac.fill = accFill; ac.alignment = { horizontal: 'center', vertical: 'middle' };
    ri++;

    // Column header row
    const entHdrs = showEntered
      ? ptdYtd === 'PTD'
        ? ['Ent Opening', 'Ent Dr', 'Ent Cr', 'Ent Closing']
        : ['YTD Ent Opening', 'YTD Ent Dr', 'YTD Ent Cr']
      : [];
    const accHdrs = ptdYtd === 'PTD'
      ? [`Opening (${functionalCcy})`, `Acct Dr (${functionalCcy})`, `Acct Cr (${functionalCcy})`, `Closing (${functionalCcy})`]
      : [`YTD Opening (${functionalCcy})`, `YTD Acct Dr (${functionalCcy})`, `YTD Acct Cr (${functionalCcy})`, `YTD Closing (${functionalCcy})`];
    const hdrs = ['Account', 'Description', 'Type', 'Currency', ...entHdrs, ...accHdrs];
    const widths = [30, 40, 10, 10, ...Array(entColCount).fill(16), ...Array(accColCount).fill(20)];
    ws.getRow(ri).height = 18;
    hdrs.forEach((h, i) => {
      const cell = ws.getCell(ri, i + 1);
      cell.value = h;
      const isEnt = i >= baseColCount && i < baseColCount + entColCount;
      const isAcc = i >= baseColCount + entColCount;
      cell.fill = isEnt ? entHdrFill : isAcc ? accHdrFill : colFill;
      cell.font = { bold: true, size: 10, color: white };
      cell.alignment = { horizontal: isAcc || isEnt ? 'right' : 'left', vertical: 'middle', indent: 1 };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF888888' } } };
      ws.getColumn(i + 1).width = widths[i] || 14;
    });
    ri++;

    const dataStartRow = ri;
    filteredData.forEach((r, idx) => {
      const isAlt = idx % 2 === 1;
      ws.getRow(ri).height = 15;
      const entVals = showEntered
        ? ptdYtd === 'PTD'
          ? [r.entered_opening || 0, r.entered_debit || 0, r.entered_credit || 0, r.entered_closing || 0]
          : [r.ytd_entered_opening || 0, r.ytd_entered_debit || 0, r.ytd_entered_credit || 0]
        : [];
      const accVals = ptdYtd === 'PTD'
        ? [r.opening || 0, r.debit || 0, r.credit || 0, r.closing || 0]
        : [r.ytd_opening || 0, r.ytd_debit || 0, r.ytd_credit || 0, r.closing || 0];
      const vals: (string | number)[] = [
        r.account_combination || r.account || '',
        r.account_desc || '',
        r.account_type || '',
        r.currency_code || '',
        ...entVals,
        ...accVals,
      ];
      vals.forEach((v, i) => {
        const cell = ws.getCell(ri, i + 1);
        cell.value = v; cell.font = { size: 10 };
        if (isAlt) cell.fill = altFill;
        const isNum = i >= baseColCount;
        cell.alignment = { horizontal: isNum ? 'right' : 'left', vertical: 'middle', indent: 1 };
        if (isNum) cell.numFmt = numFmt;
      });
      ri++;
    });

    // Totals row
    ws.mergeCells(ri, 1, ri, baseColCount);
    const tl = ws.getCell(ri, 1);
    tl.value = `Total (${filteredData.length} accounts)`;
    tl.font = { bold: true, size: 10 }; tl.fill = totFill;
    tl.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    const entTotVals = showEntered
      ? ptdYtd === 'PTD'
        ? [totals.entOpening, totals.entDebit, totals.entCredit, totals.entClosing]
        : [totals.entOpening, totals.entDebit, totals.entCredit]
      : [];
    const accTotVals = [totals.opening, totals.debit, totals.credit, totals.closing];
    [...entTotVals, ...accTotVals].forEach((v, i) => {
      const cell = ws.getCell(ri, baseColCount + 1 + i);
      cell.value = v; cell.font = { bold: true, size: 10 };
      cell.fill = totFill; cell.numFmt = numFmt;
      cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    });

    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: dataStartRow - 1 }];
    ws.autoFilter = { from: { row: dataStartRow - 1, column: 1 }, to: { row: ri, column: NCOLS } };

    const buf = await wb.xlsx.writeBuffer();
    saveAs(
      new Blob([buf], { type: 'application/octet-stream' }),
      `trial_balance_${selectedPeriod}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    message.success('Excel downloaded');
  };

  const summaryItems = ptdYtd === 'PTD'
    ? [
        { label: 'Opening',       v: totals.opening,  color: undefined },
        { label: 'Acct Dr',       v: totals.debit,    color: REDWOOD.success },
        { label: 'Acct Cr',       v: totals.credit,   color: REDWOOD.primary },
        { label: 'Closing',       v: totals.closing,  color: undefined },
      ]
    : [
        { label: 'YTD Opening',   v: totals.opening,  color: undefined },
        { label: 'YTD Acct Dr',   v: totals.debit,    color: REDWOOD.success },
        { label: 'YTD Acct Cr',   v: totals.credit,   color: REDWOOD.primary },
        { label: 'YTD Closing',   v: totals.closing,  color: undefined },
      ];

  return (
    <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Parameter card */}
      <Card size="small" styles={{ body: { padding: '14px 16px' } }}
        style={{ borderRadius: 10, border: `1px solid ${REDWOOD.neutral200}`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <BarChartOutlined style={{ color: REDWOOD.info, fontSize: 16 }} />
          <Text strong style={{ fontSize: 14 }}>Trial Balance Parameters</Text>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Radio.Group value={ptdYtd} onChange={e => setPtdYtd(e.target.value)} size="small" buttonStyle="solid">
              <Radio.Button value="PTD">PTD</Radio.Button>
              <Radio.Button value="YTD">YTD</Radio.Button>
            </Radio.Group>
            <Space size={6}>
              <Switch size="small" checked={showEntered} onChange={setShowEntered}
                style={{ background: showEntered ? '#52c41a' : undefined }} />
              <Text style={{ fontSize: 12, color: showEntered ? '#52c41a' : REDWOOD.neutral600, fontWeight: showEntered ? 600 : undefined }}>
                Show Entered
              </Text>
            </Space>
          </div>
        </div>
        <Row gutter={[12, 8]} align="bottom">
          <Col xs={24} sm={12} md={5}>
            <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 3, fontWeight: 500 }}>
              Ledger * {ledgersLoading && <ReloadOutlined spin style={{ marginLeft: 4, fontSize: 10 }} />}
            </div>
            <Select value={ledger || undefined} onChange={v => { setLedger(v); setSelectedYear(null); setSelectedPeriod(''); }}
              style={{ width: '100%' }} size="small" showSearch loading={ledgersLoading}
              placeholder="Select ledger">
              {ledgerOptions.map(l => <Option key={l} value={l}>{l}</Option>)}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={5}>
            <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 3, fontWeight: 500 }}>Company</div>
            <Select value={company || undefined} onChange={v => setCompany(v || '')} allowClear
              style={{ width: '100%' }} size="small" showSearch loading={companyLoading}
              placeholder="All Companies">
              {companyOptions.map(c => (
                <Option key={c.value} value={c.value}>
                  {c.meaning ? `${c.value} – ${c.meaning}` : c.value}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 3, fontWeight: 500 }}>
              Year {periodsLoading && <ReloadOutlined spin style={{ marginLeft: 4, fontSize: 10 }} />}
            </div>
            <Select value={selectedYear || undefined} onChange={v => { setSelectedYear(v); setSelectedPeriod(''); }}
              style={{ width: '100%' }} size="small" placeholder="Select year">
              {years.map(y => <Option key={y} value={y}>{y}</Option>)}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={5}>
            <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 3, fontWeight: 500 }}>Period *</div>
            <Select value={selectedPeriod || undefined} onChange={v => setSelectedPeriod(v || '')}
              style={{ width: '100%' }} size="small" showSearch placeholder="Select period">
              {periodsForYear.map(p => <Option key={p.period_name_id} value={p.period_name_id}>{p.period_name_id}</Option>)}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={5} style={{ display: 'flex', gap: 6 }}>
            <Button type="primary" icon={<SearchOutlined />} size="small" loading={loading}
              onClick={handleSearch}
              style={{ background: REDWOOD.info, borderColor: REDWOOD.info, flex: 1 }}>Search</Button>
            <Button icon={<ClearOutlined />} size="small" onClick={() => {
              setTbData([]); setHasSearched(false); setGridSearch(''); setCompany('');
            }} />
          </Col>
        </Row>
      </Card>

      {/* Toolbar */}
      {hasSearched && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Space>
            <Badge count={filteredData.length} color={REDWOOD.info} overflowCount={9999}>
              <Text type="secondary" style={{ fontSize: 12 }}>accounts</Text>
            </Badge>
            <Divider type="vertical" />
            <Tag color={ptdYtd === 'PTD' ? 'blue' : 'orange'}>{ptdYtd}</Tag>
            <Tag>{selectedPeriod}</Tag>
          </Space>
          <Space>
            <Input prefix={<SearchOutlined style={{ color: REDWOOD.neutral600 }} />}
              placeholder="Filter accounts…" size="small" allowClear
              value={gridSearch} onChange={e => setGridSearch(e.target.value)}
              style={{ width: 220, borderRadius: 6 }} />
            <Button size="small" icon={<FileExcelOutlined />} onClick={exportTBExcel}
              disabled={!filteredData.length}>Excel</Button>
          </Space>
        </div>
      )}

      {/* Table */}
      <Spin spinning={loading}>
        {hasSearched && (
          <Table
            dataSource={tableData}
            columns={columns}
            rowKey="key"
            size="small"
            scroll={{ x: 'max-content', y: 500 }}
            pagination={{ pageSize: 50, showSizeChanger: true, showTotal: () => `${filteredData.length} accounts` }}
            className="aa-v2-grid"
            rowClassName={(r: any) => r.isTotals ? 'aa-totals-row' : ''}
          />
        )}
      </Spin>

      {/* Totals summary card */}
      {hasSearched && filteredData.length > 0 && (
        <Card size="small" styles={{ body: { padding: '10px 16px' } }}
          style={{ borderRadius: 8, border: '1px solid #adc6ff', background: '#f0f5ff' }}>
          <Text strong style={{ fontSize: 11, color: '#1677ff', display: 'block', marginBottom: 8 }}>
            {ptdYtd} Summary — {selectedPeriod} ({functionalCcy})
          </Text>
          <Row gutter={0}>
            {summaryItems.map((item, i) => (
              <Col key={i} flex="1" style={{ textAlign: 'center', padding: '4px 12px',
                borderRight: i < summaryItems.length - 1 ? '1px solid #adc6ff' : undefined }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>{item.label}</Text>
                {item.color
                  ? <Text strong style={{ fontSize: 14, color: item.color }}>{fmtN(item.v)}</Text>
                  : <FmtBal v={item.v} size={14} bold />}
              </Col>
            ))}
          </Row>
        </Card>
      )}
    </div>
  );
};

// ─── Account Analysis Panel ───────────────────────────────────────────────────
const AAPanel: React.FC = () => {
  // Parameters
  const [ledger, setLedger]                   = useState('');
  const [ledgerOptions, setLedgerOptions]     = useState<string[]>([]);
  const [ledgersLoading, setLedgersLoading]   = useState(false);
  const [periods, setPeriods]                 = useState<string[]>([]);
  const [allPeriods, setAllPeriods]           = useState<string[]>([]);
  const [periodsLoading, setPeriodsLoading]   = useState(false);
  const [account, setAccount]                 = useState('');
  const [accountDesc, setAccountDesc]         = useState('');
  const [accountOptions, setAccountOptions]   = useState<AccountOption[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [segFilters, setSegFilters]           = useState<Record<string, string>>({});
  const [segLabels, setSegLabels]             = useState<Record<string, string>>({});
  const [segmentValues, setSegmentValues]     = useState<Record<string, string[]>>({
    companies: [], lobs: [], departments: [], subAccounts: [],
    analyses: [], intercompanies: [], sources: [], categories: [],
  });
  const [companyOptions, setCompanyOptions]   = useState<{ value: string; meaning: string }[]>([]);
  const [segDescMaps, setSegDescMaps]         = useState<Record<string, Record<string, string>>>({});
  const [segValuesLoading, setSegValuesLoading] = useState(false);
  const [segPickerOpen, setSegPickerOpen]     = useState(false);

  // Grid state
  const [loading, setLoading]                 = useState(false);
  const [rows, setRows]                       = useState<JournalLine[]>([]);
  const [hasSearched, setHasSearched]         = useState(false);
  const [showEntered, setShowEntered]         = useState(false);
  const [gridSearch, setGridSearch]           = useState('');
  const [functionalCcy, setFunctionalCcy]     = useState('AED');
  const [groupBy, setGroupBy]                 = useState('');
  const [appliedGroupBy, setAppliedGroupBy]   = useState('');
  const [comboBreaks, setComboBreaks]         = useState<ComboBreak[]>([]);
  const [breakLoading, setBreakLoading]       = useState(false);
  const [tbApiUrls, setTbApiUrls]             = useState<string[]>([]);

  // Balance state
  const [openingBal, setOpeningBal]           = useState<{ acc: number; ent: number } | null>(null);
  const [closingBal, setClosingBal]           = useState<{ acc: number; ent: number } | null>(null);

  // Drill-down state
  const [drillRecord, setDrillRecord]         = useState<JournalLine | null>(null);
  const [drillLines, setDrillLines]           = useState<any[]>([]);
  const [drillLoading, setDrillLoading]       = useState(false);
  const [drillOpen, setDrillOpen]             = useState(false);

  // API modal
  const [apiUrl, setApiUrl]                   = useState('');
  const [apiModalOpen, setApiModalOpen]       = useState(false);

  // PDF preview modal
  const [pdfPreviewOpen, setPdfPreviewOpen]   = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl]           = useState('');

  // ── Load ledgers ─────────────────────────────────────────────────────────────
  useEffect(() => {
    setLedgersLoading(true);
    fetch(`${API_BASE}/getledgername`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const names: string[] = [...new Set(
          (data.items || []).map((i: any) => i.ledger_name).filter(Boolean) as string[]
        )];
        setLedgerOptions(names);
        if (names.length > 0) setLedger(names[0]);
      })
      .catch(() => {})
      .finally(() => setLedgersLoading(false));
  }, []);

  // ── Load segment values ───────────────────────────────────────────────────────
  const loadSegmentValues = useCallback(async (ldg: string) => {
    if (!ldg) return;
    setSegValuesLoading(true);
    try {
      const [compRes, segRes, structRes] = await Promise.all([
        fetch(COMPANY_LOV_URL),
        fetch(`${API_BASE}/segment-values?ledger_name=${encodeURIComponent(ldg)}`),
        fetch(SEGMENTS_API_URL),
      ]);
      if (compRes.ok) {
        const cd = await compRes.json();
        setCompanyOptions((cd.items || [])
          .map((i: any) => ({
            value: i.value || i.VALUE || '',
            meaning: i.description || i.Description || i.meaning || i.MEANING || '',
          }))
          .filter((c: any) => c.value));
      }
      if (segRes.ok) {
        const sd = await segRes.json();
        setSegmentValues(prev => ({
          ...prev,
          lobs: sd.lobs || [], departments: sd.departments || [],
          subAccounts: sd.subAccounts || [], analyses: sd.analyses || [],
          intercompanies: sd.intercompanies || [], sources: sd.sources || [],
          categories: sd.categories || [],
        }));
      }
      // Fetch descriptions from valuesets for each COA segment
      if (structRes.ok) {
        const structData = await structRes.json();
        const segs: any[] = structData.items || [];
        // Map prompt → valueKey in SEGMENT_DEFS (excluding company which is handled separately)
        const promptMap: Record<string, string> = {
          lob: 'lobs', department: 'departments', 'sub account': 'subAccounts',
          subaccount: 'subAccounts', analysis: 'analyses', intercompany: 'intercompanies', interco: 'intercompanies',
        };
        const descFetches = segs
          .filter((s: any) => s.segment_code && s.segment_code !== 'BUIMERC_FIN_GLB_COA_CO')
          .map(async (s: any) => {
            const prompt = (s.prompt || s.segment_name || '').toLowerCase().trim();
            const valueKey = promptMap[prompt];
            if (!valueKey) return;
            try {
              const vRes = await fetch(`${VALUES_API_URL}/${s.segment_code}`);
              if (!vRes.ok) return;
              const vData = await vRes.json();
              const descMap: Record<string, string> = {};
              (vData.items || []).forEach((item: any) => {
                const code = item.value || item.VALUE || '';
                const desc = item.description || item.DESCRIPTION || item.meaning || '';
                if (code) descMap[code] = desc;
              });
              setSegDescMaps(prev => ({ ...prev, [valueKey]: descMap }));
            } catch { /* silent */ }
          });
        await Promise.all(descFetches);
      }
    } catch { /* silent */ } finally {
      setSegValuesLoading(false);
    }
  }, []);

  useEffect(() => { if (ledger) loadSegmentValues(ledger); }, [ledger, loadSegmentValues]);

  // ── Load periods ──────────────────────────────────────────────────────────────
  const loadPeriods = useCallback(async (ldg: string) => {
    if (!ldg) return;
    setPeriodsLoading(true); setPeriods([]);
    try {
      const res = await fetch(`${APEX_BASE}/periodsstatus/create?ledger_name=${encodeURIComponent(ldg)}`);
      if (!res.ok) return;
      const data = await res.json();
      const names = [...new Set(
        (data.items || []).map((i: any) => i.period_name || i.period_name_id || '').filter(Boolean)
      )] as string[];
      names.sort((a, b) => parsePeriod(b) - parsePeriod(a));
      setAllPeriods(names);
    } catch { /* silent */ } finally { setPeriodsLoading(false); }
  }, []);

  useEffect(() => { if (ledger) loadPeriods(ledger); }, [ledger, loadPeriods]);

  // ── Load account LOV (lazy) ───────────────────────────────────────────────────
  const loadAccounts = useCallback(async () => {
    if (accountOptions.length > 0) return;
    setAccountsLoading(true);
    try {
      const res = await fetch(ACCOUNTS_LOV_URL);
      if (!res.ok) return;
      const data = await res.json();
      setAccountOptions((data.items || [])
        .map((i: any) => ({ account: i.account || '', description: i.description || '', account_type: i.account_type || '' }))
        .filter((i: AccountOption) => i.account));
    } catch { /* silent */ } finally { setAccountsLoading(false); }
  }, [accountOptions.length]);

  // ── Opening/closing balance ───────────────────────────────────────────────────
  const fetchBalanceRow = useCallback(async (acct: string, period: string, isOpen: boolean) => {
    const p = new URLSearchParams({ ledger_name: ledger, period_name: period, account: acct });
    Object.entries(segFilters).forEach(([k, v]) => { if (v) p.set(k, v); });
    const res = await fetch(`${API_BASE}/rr-trialbalance/standard?${p}`);
    if (!res.ok) return null;
    const data = await res.json();
    const items: any[] = data.items || [];
    if (!items.length) return null;
    const accAmt = items.reduce((s: number, i: any) => s + (i.opening || 0), 0);
    const entAmt = items.reduce((s: number, i: any) => s + (i.entered_opening || 0), 0);
    if (accAmt === 0 && entAmt === 0) return null;
    const accountType = items[0].account_type || '';
    const isDebitNormal = accountType === 'A' || accountType === 'E';
    const toDrCr = (amt: number) => ({
      dr: isDebitNormal && amt > 0 ? amt : (!isDebitNormal && amt < 0 ? Math.abs(amt) : 0),
      cr: !isDebitNormal && amt > 0 ? amt : (isDebitNormal && amt < 0 ? Math.abs(amt) : 0),
    });
    const acc = toDrCr(accAmt); const ent = toDrCr(entAmt);
    return {
      key: isOpen ? 'opening-balance' : 'closing-balance',
      concatenatedSegments: acct, accountDescription: items[0].account_desc || '',
      jeLineDescription: isOpen ? 'Opening Balance' : 'Closing Balance',
      defaultPeriodName: period, accountingDate: '', batchName: '',
      userJeSourceName: '', userJeCategoryName: '', currencyCode: items[0].currency_code || 'AED',
      enteredDr: ent.dr, enteredCr: ent.cr, accountedDr: acc.dr, accountedCr: acc.cr,
      jeHeaderId: 0, isOpeningBalance: isOpen, isClosingBalance: !isOpen,
    } as JournalLine;
  }, [ledger, segFilters]);

  // ── Search ────────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    if (!periods.length) { message.warning('Select at least one period'); return; }
    setLoading(true); setHasSearched(true); setRows([]);
    setOpeningBal(null); setClosingBal(null);
    try {
      const p = new URLSearchParams({ ledger_name: ledger });
      p.set('period_names', periods.join(','));
      if (account) p.set('account', account);
      Object.entries(segFilters).forEach(([k, v]) => { if (v) p.set(k, v); });
      const url = `${API_BASE}/accountanalysis?${p}`;
      setApiUrl(url);

      let items: JournalLine[] = [];
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const seen = new Set<string>();
          items = (data.items || []).flatMap((item: any, idx: number) => {
            const dk = `${item.jeHeaderId ?? item.je_header_id}-${item.jeLineNumber ?? item.je_line_number}`;
            if (seen.has(dk)) return [];
            seen.add(dk);
            const combo = item.accountCombination || item.account_combination || item.concatenatedSegments ||
              (item.company ? [item.company, item.lob, item.department, item.account,
                item.subAccount || item.sub_account, item.analysis, item.intercompany].filter(Boolean).join('-') : '');
            const fccy = item.ledger_currency || item.functional_currency || '';
            if (fccy) setFunctionalCcy(fccy);
            return [{
              key: `row-${idx}`,
              concatenatedSegments: combo,
              accountDescription:   item.accountDescription || item.account_description || '',
              jeLineDescription:    item.description || item.DESCRIPTION || item.je_line_description || '',
              defaultPeriodName:    item.defaultPeriodName || item.period_name || '',
              accountingDate:       item.accountingDate || item.accounting_date || '',
              batchName:            item.batchName || item.batch_name || '',
              userJeSourceName:     item.userJeSourceName || item.je_source_name || item.user_je_source_name || '',
              userJeCategoryName:   item.userJeCategoryName || item.je_category_name || item.user_je_category_name || '',
              currencyCode:         item.currencyCode || item.currency_code || 'AED',
              enteredDr:   Number(item.enteredDr   || item.entered_dr   || 0),
              enteredCr:   Number(item.enteredCr   || item.entered_cr   || 0),
              accountedDr: Number(item.accountedDr || item.accounted_dr || 0),
              accountedCr: Number(item.accountedCr || item.accounted_cr || 0),
              jeHeaderId:  Number(item.jeHeaderId  || item.je_header_id || 0),
              segCompany:  String(item.company      || item.COMPANY      || ''),
              segLob:      String(item.lob          || item.LOB          || ''),
              segDept:     String(item.department   || item.DEPARTMENT   || item.dept || ''),
              segAccount:  String(item.account      || item.ACCOUNT      || ''),
              segSubAcct:  String(item.subAccount   || item.sub_account  || item.SUB_ACCOUNT || ''),
              segAnalysis: String(item.analysis     || item.ANALYSIS     || ''),
              segInterco:     String(item.intercompany || item.INTERCOMPANY || item.interco || ''),
              approvalStatus: String(item.approvalStatusMeaning || item.approval_status_meaning || ''),
            } as JournalLine];
          });
        }
      } catch { /* empty */ }

      const sortedPeriods = [...periods].sort((a, b) => parsePeriod(a) - parsePeriod(b));
      let openRow: JournalLine | null = null;
      let closeRow: JournalLine | null = null;
      if (account && sortedPeriods.length) {
        [openRow, closeRow] = await Promise.all([
          fetchBalanceRow(account, sortedPeriods[0], true),
          fetchBalanceRow(account, sortedPeriods[sortedPeriods.length - 1], false),
        ]);
      }
      const allRows: JournalLine[] = [
        ...(openRow  ? [openRow]  : []),
        ...items,
        ...(closeRow ? [closeRow] : []),
      ];
      if (openRow)  setOpeningBal({ acc: openRow.accountedDr  - openRow.accountedCr,  ent: openRow.enteredDr  - openRow.enteredCr });
      if (closeRow) setClosingBal({ acc: closeRow.accountedDr - closeRow.accountedCr, ent: closeRow.enteredDr - closeRow.enteredCr });
      setRows(allRows);
      message.success(`${allRows.length} records loaded`);
    } catch (e: any) {
      message.error(`Search failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [ledger, periods, account, segFilters, fetchBalanceRow]);

  // ── Drill-down ────────────────────────────────────────────────────────────────
  const openDrill = useCallback(async (record: JournalLine) => {
    setDrillRecord(record);
    setDrillLines([]);
    setDrillOpen(true);
    setDrillLoading(true);
    try {
      const res = await fetch(`${API_BASE}/journals/${record.jeHeaderId}/lines`);
      const data = await res.json();
      setDrillLines(data.items || []);
    } catch {
      message.error('Failed to load journal lines');
    } finally {
      setDrillLoading(false);
    }
  }, []);

  // ── Segment filter helpers ────────────────────────────────────────────────────
  const addSegFilter = (key: string, value: string, label?: string) => {
    setSegFilters(prev => { const n = { ...prev }; if (value) n[key] = value; else delete n[key]; return n; });
    setSegLabels(prev => { const n = { ...prev }; if (value && label) n[key] = label; else delete n[key]; return n; });
  };
  const removeSegFilter = (key: string) => {
    setSegFilters(prev => { const n = { ...prev }; delete n[key]; return n; });
    setSegLabels(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  // ── Derived data ──────────────────────────────────────────────────────────────
  const dataRows = useMemo(() => rows.filter(r => !r.isClosingBalance), [rows]);

  const filteredData = useMemo(() => {
    if (!gridSearch.trim()) return dataRows;
    const q = gridSearch.toLowerCase();
    return dataRows.filter(r =>
      (r.concatenatedSegments  || '').toLowerCase().includes(q) ||
      (r.accountDescription    || '').toLowerCase().includes(q) ||
      (r.jeLineDescription     || '').toLowerCase().includes(q) ||
      (r.defaultPeriodName     || '').toLowerCase().includes(q) ||
      (r.accountingDate        || '').toLowerCase().includes(q) ||
      (r.batchName             || '').toLowerCase().includes(q) ||
      (r.userJeSourceName      || '').toLowerCase().includes(q) ||
      (r.userJeCategoryName    || '').toLowerCase().includes(q) ||
      (r.currencyCode          || '').toLowerCase().includes(q) ||
      (r.approvalStatus        || '').toLowerCase().includes(q) ||
      (r.segCompany            || '').toLowerCase().includes(q) ||
      (r.segAccount            || '').toLowerCase().includes(q) ||
      (r.segSubAcct            || '').toLowerCase().includes(q)
    );
  }, [dataRows, gridSearch]);

  // ── Apply / Clear group ───────────────────────────────────────────────────────
  const applyGroup = useCallback(async () => {
    if (!groupBy) return;
    setAppliedGroupBy(groupBy);
    if (groupBy !== 'concatenatedSegments' && groupBy !== 'currencyCode') {
      setComboBreaks([]);
      return;
    }
    const byCurrency = groupBy === 'currencyCode';
    setBreakLoading(true);
    setTbApiUrls([]);
    try {
      const ptdLines = filteredData.filter(r => !r.isOpeningBalance && !r.isClosingBalance);
      const map = new Map<string, JournalLine[]>();
      ptdLines.forEach(r => {
        const k = byCurrency
          ? `${r.concatenatedSegments || '(blank)'}||${r.currencyCode || 'AED'}`
          : r.concatenatedSegments || '(blank)';
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(r);
      });

      const sortedP = [...periods].sort((a, b) => parsePeriod(a) - parsePeriod(b));
      const firstP = sortedP[0] || '';
      const lastP  = sortedP[sortedP.length - 1] || '';

      // Fetch TB for a period and return a map keyed by every truncation of
      // account_combination so journal combos (which may have fewer segments than
      // the TB's extra future1/future2 segments) match directly via combo string.
      const fetchTBMap = async (period: string): Promise<Map<string, any>> => {
        if (!period) return new Map();
        const p = new URLSearchParams({ ledger_name: ledger, period_name: period });
        if (account) p.set('account', account);
        Object.entries(segFilters).forEach(([k, v]) => { if (v) p.set(k, v); });
        const url = `${API_BASE}/rr-trialbalance/standard?${p}`;
        setTbApiUrls(prev => [...new Set([...prev, url])]);
        try {
          const res = await fetch(url);
          if (!res.ok) return new Map();
          const data = await res.json();
          const m = new Map<string, any>();
          (data.items || []).forEach((i: any) => {
            const full = (i.account_combination || '').trim();
            if (!full) return;
            const ccy = (i.currency_code || '').trim();
            m.set(full, i);
            // Also index by combo||currency for currency-mode lookups
            if (ccy) m.set(`${full}||${ccy}`, i);
            const parts = full.split('-');
            // Store every prefix length so any journal combo length will match
            for (let n = 4; n < parts.length; n++) {
              const k = parts.slice(0, n).join('-');
              if (!m.has(k)) m.set(k, i);
              if (ccy && !m.has(`${k}||${ccy}`)) m.set(`${k}||${ccy}`, i);
            }
          });
          return m;
        } catch { return new Map(); }
      };

      const [openMap, closeMap] = await Promise.all([
        fetchTBMap(firstP),
        firstP !== lastP ? fetchTBMap(lastP) : fetchTBMap(firstP),
      ]);

      const buildBalRow = (combo: string, tbRow: any, isOpen: boolean, period: string): JournalLine | null => {
        if (!tbRow) return null;
        const accAmt = Number(isOpen ? (tbRow.opening || 0) : (tbRow.closing || 0));
        const entAmt = Number(isOpen ? (tbRow.entered_opening || 0) : (tbRow.entered_closing || 0));
        if (accAmt === 0 && entAmt === 0) return null;
        const accountType = tbRow.account_type || '';
        const isDebitNormal = accountType === 'A' || accountType === 'E';
        const toDrCr = (amt: number) => ({
          dr: isDebitNormal && amt > 0 ? amt : (!isDebitNormal && amt < 0 ? Math.abs(amt) : 0),
          cr: !isDebitNormal && amt > 0 ? amt : (isDebitNormal && amt < 0 ? Math.abs(amt) : 0),
        });
        const acc = toDrCr(accAmt); const ent = toDrCr(entAmt);
        return {
          key: `${combo}-${isOpen ? 'open' : 'close'}`,
          concatenatedSegments: combo,
          accountDescription: tbRow.account_desc || tbRow.description || '',
          jeLineDescription: isOpen ? 'Opening Balance' : 'Closing Balance',
          defaultPeriodName: period, accountingDate: '', batchName: '',
          userJeSourceName: '', userJeCategoryName: '',
          currencyCode: tbRow.currency_code || '',
          enteredDr: ent.dr, enteredCr: ent.cr, accountedDr: acc.dr, accountedCr: acc.cr,
          jeHeaderId: 0, isOpeningBalance: isOpen, isClosingBalance: !isOpen,
        } as JournalLine;
      };

      const breaks: ComboBreak[] = Array.from(map.entries()).map(([combo, lines]) => {
        // For currency mode the key is "combo||ccy" — look up TB by that key first,
        // then fall back to just combo so we still get the balance when the TB has no
        // per-currency row (functional currency only).
        const tbKey = byCurrency ? combo : combo;
        const openRow  = buildBalRow(combo, openMap.get(tbKey)  || openMap.get(combo.split('||')[0])  || null, true,  firstP);
        const closeRow = buildBalRow(combo, closeMap.get(tbKey) || closeMap.get(combo.split('||')[0]) || null, false, lastP);
        const openAcc = openRow ? openRow.accountedDr - openRow.accountedCr : 0;
        const openEnt = openRow ? openRow.enteredDr   - openRow.enteredCr   : 0;
        let accRun = openAcc, entRun = openEnt;
        const linesWithBal: ComboBreakLine[] = lines.map(r => {
          accRun += r.accountedDr - r.accountedCr;
          entRun += r.enteredDr   - r.enteredCr;
          return { ...r, _accRun: accRun, _entRun: entRun };
        });
        return {
          combo,
          description: lines[0]?.accountDescription || openRow?.accountDescription || '',
          openingRow: openRow,
          closingRow: closeRow,
          linesWithBal,
          ptdAccDr: lines.reduce((s, r) => s + r.accountedDr, 0),
          ptdAccCr: lines.reduce((s, r) => s + r.accountedCr, 0),
          ptdEntDr: lines.reduce((s, r) => s + r.enteredDr,   0),
          ptdEntCr: lines.reduce((s, r) => s + r.enteredCr,   0),
        };
      });
      breaks.sort((a, b) => a.combo.localeCompare(b.combo));
      setComboBreaks(breaks);
    } finally {
      setBreakLoading(false);
    }
  }, [groupBy, filteredData, periods, account, segFilters, ledger]);

  const clearGroup = useCallback(() => {
    setGroupBy('');
    setAppliedGroupBy('');
    setComboBreaks([]);
  }, []);

  const rowsWithBal = useMemo(() => {
    let accRun = 0; let entRun = 0;
    return filteredData.map(r => {
      accRun += (r.accountedDr || 0) - (r.accountedCr || 0);
      entRun += (r.enteredDr   || 0) - (r.enteredCr   || 0);
      return { ...r, _accRun: accRun, _entRun: entRun };
    });
  }, [filteredData]);

  const ptdTotals = useMemo(() => filteredData
    .filter(r => !r.isOpeningBalance && !r.isClosingBalance)
    .reduce((acc, r) => ({
      accDr: acc.accDr + r.accountedDr, accCr: acc.accCr + r.accountedCr,
      entDr: acc.entDr + r.enteredDr,   entCr: acc.entCr + r.enteredCr,
    }), { accDr: 0, accCr: 0, entDr: 0, entCr: 0 }), [filteredData]);

  const gridTotals = useMemo(() => filteredData
    .reduce((acc, r) => ({
      accDr: acc.accDr + r.accountedDr, accCr: acc.accCr + r.accountedCr,
      entDr: acc.entDr + r.enteredDr,   entCr: acc.entCr + r.enteredCr,
    }), { accDr: 0, accCr: 0, entDr: 0, entCr: 0 }), [filteredData]);

  const finalRunning = rowsWithBal.length > 0
    ? { acc: rowsWithBal[rowsWithBal.length - 1]._accRun, ent: rowsWithBal[rowsWithBal.length - 1]._entRun }
    : { acc: 0, ent: 0 };

  // ── Grouped data ──────────────────────────────────────────────────────────────
  const groupedData = useMemo((): GroupedRow[] => {
    if (!groupBy) return [];
    const ptdLines = filteredData.filter(r => !r.isOpeningBalance && !r.isClosingBalance && !r.isTotals);
    const map = new Map<string, GroupedRow>();
    ptdLines.forEach(r => {
      const val = getGroupVal(r as any, groupBy) || '(blank)';
      if (!map.has(val)) {
        map.set(val, { key: `grp-${val}`, groupValue: val, count: 0, lines: [],
          totalEntDr: 0, totalEntCr: 0, totalAccDr: 0, totalAccCr: 0, accBalance: 0, entBalance: 0 });
      }
      const g = map.get(val)!;
      g.lines.push(r); g.count++;
      g.totalEntDr += r.enteredDr; g.totalEntCr += r.enteredCr;
      g.totalAccDr += r.accountedDr; g.totalAccCr += r.accountedCr;
      g.accBalance = g.totalAccDr - g.totalAccCr;
      g.entBalance = g.totalEntDr - g.totalEntCr;
    });
    const result = Array.from(map.values());
    if (groupBy === 'defaultPeriodName') {
      result.sort((a, b) => parsePeriod(a.groupValue) - parsePeriod(b.groupValue));
    } else {
      result.sort((a, b) => a.groupValue.localeCompare(b.groupValue));
    }
    if (result.length > 0) {
      result.push({
        key: '__gtotals__', groupValue: 'Grand Total', count: ptdLines.length, lines: [],
        totalEntDr: gridTotals.entDr, totalEntCr: gridTotals.entCr,
        totalAccDr: gridTotals.accDr, totalAccCr: gridTotals.accCr,
        accBalance: gridTotals.accDr - gridTotals.accCr,
        entBalance: gridTotals.entDr - gridTotals.entCr,
        isTotals: true,
      });
    }
    return result;
  }, [groupBy, filteredData, gridTotals]);

  // ── Flat table data ───────────────────────────────────────────────────────────
  const totalsRow: JournalLine | null = rowsWithBal.length > 0 ? {
    key: '__totals__', concatenatedSegments: '', accountDescription: '',
    jeLineDescription: 'Total for Report', defaultPeriodName: '', accountingDate: '',
    batchName: '', userJeSourceName: '', userJeCategoryName: '', currencyCode: '',
    enteredDr: gridTotals.entDr, enteredCr: gridTotals.entCr,
    accountedDr: gridTotals.accDr, accountedCr: gridTotals.accCr,
    jeHeaderId: 0, isTotals: true, _entBal: finalRunning.ent, _accBal: finalRunning.acc,
  } : null;
  const tableData = totalsRow ? [...rowsWithBal, totalsRow] : rowsWithBal;

  // ── Flat columns ──────────────────────────────────────────────────────────────
  const flatColumns = useMemo((): ColumnsType<JournalLine> => {
    const isTot     = (r: JournalLine) => !!r.isTotals;
    const isSpecial = (r: JournalLine) => !!(r.isOpeningBalance || r.isClosingBalance || r.isTotals);

    const entCols: ColumnsType<JournalLine> = showEntered ? [
      { title: <span style={{ color: '#52c41a', fontWeight: 600 }}>Ent Dr</span>,
        dataIndex: 'enteredDr', key: 'entDr', width: 130, align: 'right',
        render: (v: number, r: JournalLine) => <DrCell v={v} bold={isTot(r)} /> },
      { title: <span style={{ color: '#52c41a', fontWeight: 600 }}>Ent Cr</span>,
        dataIndex: 'enteredCr', key: 'entCr', width: 130, align: 'right',
        render: (v: number, r: JournalLine) => <CrCell v={v} bold={isTot(r)} /> },
      { title: <span style={{ color: '#52c41a', fontWeight: 600 }}>Ent Balance</span>,
        key: 'entBal', width: 140, align: 'right',
        render: (_: any, record: JournalLine) => {
          if (isTot(record)) return <FmtBal v={record._entBal ?? 0} size={10} bold />;
          return <FmtBal v={(record as any)._entRun ?? 0} size={10} bold={isSpecial(record)} />;
        } },
    ] : [];

    return [
      { title: 'Account', dataIndex: 'concatenatedSegments', key: 'account', width: 220, fixed: 'left', ellipsis: true,
        render: (_: string, r: JournalLine) => {
          if (isTot(r)) return <Text strong style={{ fontSize: 11 }}>Total for Report</Text>;
          if (r.isOpeningBalance) return <Text strong style={{ fontSize: 10, color: REDWOOD.warning }}>Opening Balance</Text>;
          if (r.isClosingBalance) return <Text strong style={{ fontSize: 10, color: REDWOOD.success }}>Closing Balance</Text>;
          return <Text style={{ fontSize: 10, color: REDWOOD.info }}>{_ || '—'}</Text>;
        } },
      { title: 'Line Description', dataIndex: 'jeLineDescription', key: 'lineDesc', width: 200, ellipsis: true,
        render: (t: string, r: JournalLine) => isTot(r) ? null : (
          <Tooltip title={t}><span style={{ fontSize: 10, fontWeight: isSpecial(r) ? 600 : undefined }}>{t || '—'}</span></Tooltip>
        ) },
      { title: 'Period', dataIndex: 'defaultPeriodName', key: 'period', width: 80,
        render: (v: string, r: JournalLine) => isTot(r) ? null : <span style={{ fontSize: 10 }}>{v}</span> },
      { title: 'Acctg Date', dataIndex: 'accountingDate', key: 'acctgDate', width: 100,
        render: (v: string, r: JournalLine) => isTot(r) ? null : <span style={{ fontSize: 10 }}>{(v || '').slice(0, 10)}</span> },
      { title: 'Batch', dataIndex: 'batchName', key: 'batch', width: 160, ellipsis: true,
        render: (v: string, r: JournalLine) => isTot(r) ? null : <span style={{ fontSize: 10 }}>{v}</span> },
      { title: 'Source', dataIndex: 'userJeSourceName', key: 'source', width: 110,
        render: (v: string, r: JournalLine) => isTot(r) ? null : <span style={{ fontSize: 10 }}>{v}</span> },
      { title: 'Category', dataIndex: 'userJeCategoryName', key: 'category', width: 120,
        render: (v: string, r: JournalLine) => isTot(r) ? null : <span style={{ fontSize: 10 }}>{v}</span> },
      { title: 'Status', dataIndex: 'approvalStatus', key: 'status', width: 80,
        render: (v: string, r: JournalLine) => isTot(r) || isSpecial(r) ? null : (
          <Tag color={v === 'Posted' ? 'success' : v ? 'warning' : 'default'} style={{ fontSize: 9 }}>{v || '—'}</Tag>
        ) },
      { title: 'Currency', dataIndex: 'currencyCode', key: 'currency', width: 80,
        render: (v: string, r: JournalLine) => isTot(r) ? null : <Tag style={{ fontSize: 9 }}>{v}</Tag> },
      ...entCols,
      { title: <span style={{ color: REDWOOD.info, fontWeight: 600 }}>Acc Dr ({functionalCcy})</span>,
        dataIndex: 'accountedDr', key: 'accDr', width: 150, align: 'right',
        render: (v: number, r: JournalLine) => <DrCell v={v} bold={isTot(r)} /> },
      { title: <span style={{ color: REDWOOD.info, fontWeight: 600 }}>Acc Cr ({functionalCcy})</span>,
        dataIndex: 'accountedCr', key: 'accCr', width: 150, align: 'right',
        render: (v: number, r: JournalLine) => <CrCell v={v} bold={isTot(r)} /> },
      { title: <span style={{ color: REDWOOD.info, fontWeight: 600 }}>Acc Balance ({functionalCcy})</span>,
        key: 'accBal', width: 160, align: 'right',
        render: (_: any, record: JournalLine) => {
          if (isTot(record)) return <FmtBal v={record._accBal ?? 0} size={10} bold />;
          return <FmtBal v={(record as any)._accRun ?? 0} size={10} bold={isSpecial(record)} />;
        } },
      { title: '', key: 'drill', width: 36, fixed: 'right',
        render: (_: any, record: JournalLine) =>
          isTot(record) || record.isOpeningBalance || record.isClosingBalance ? null : (
            <Tooltip title="View journal lines">
              <Button type="text" size="small" onClick={() => openDrill(record)}
                icon={<AuditOutlined style={{ color: REDWOOD.info, fontSize: 13 }} />} />
            </Tooltip>
          ) },
    ];
  }, [showEntered, functionalCcy, openDrill]);

  // ── Group-by columns ──────────────────────────────────────────────────────────
  const groupLabel = GROUP_BY_OPTIONS.find(o => o.value === groupBy)?.label || groupBy;

  const groupColumns = useMemo((): ColumnsType<GroupedRow> => {
    const entCols: ColumnsType<GroupedRow> = showEntered ? [
      { title: <span style={{ color: '#52c41a', fontWeight: 600 }}>Ent Dr</span>,
        key: 'entDr', width: 140, align: 'right',
        render: (_: any, r: GroupedRow) => <DrCell v={r.totalEntDr} bold={r.isTotals} /> },
      { title: <span style={{ color: '#52c41a', fontWeight: 600 }}>Ent Cr</span>,
        key: 'entCr', width: 140, align: 'right',
        render: (_: any, r: GroupedRow) => <CrCell v={r.totalEntCr} bold={r.isTotals} /> },
      { title: <span style={{ color: '#52c41a', fontWeight: 600 }}>Ent Balance</span>,
        key: 'entBal', width: 150, align: 'right',
        render: (_: any, r: GroupedRow) => <FmtBal v={r.entBalance} size={10} bold={r.isTotals} /> },
    ] : [];
    return [
      { title: groupLabel, key: 'groupValue', fixed: 'left', width: 240,
        render: (_: any, r: GroupedRow) => r.isTotals
          ? <Text strong style={{ fontSize: 11 }}>Grand Total</Text>
          : <Text style={{ fontSize: 11, fontWeight: 600 }}>{r.groupValue}</Text> },
      { title: 'Lines', key: 'count', width: 70, align: 'center',
        render: (_: any, r: GroupedRow) => r.isTotals ? null : <Tag style={{ fontSize: 10 }}>{r.count}</Tag> },
      ...entCols,
      { title: <span style={{ color: REDWOOD.info, fontWeight: 600 }}>Acc Dr ({functionalCcy})</span>,
        key: 'accDr', width: 150, align: 'right',
        render: (_: any, r: GroupedRow) => <DrCell v={r.totalAccDr} bold={r.isTotals} /> },
      { title: <span style={{ color: REDWOOD.info, fontWeight: 600 }}>Acc Cr ({functionalCcy})</span>,
        key: 'accCr', width: 150, align: 'right',
        render: (_: any, r: GroupedRow) => <CrCell v={r.totalAccCr} bold={r.isTotals} /> },
      { title: <span style={{ color: REDWOOD.info, fontWeight: 600 }}>Acc Balance ({functionalCcy})</span>,
        key: 'accBal', width: 160, align: 'right',
        render: (_: any, r: GroupedRow) => <FmtBal v={r.accBalance} size={10} bold={r.isTotals} /> },
    ];
  }, [showEntered, functionalCcy, groupLabel]);


  // ── Break line columns ────────────────────────────────────────────────────────
  const breakLineCols = useMemo((): ColumnsType<ComboBreakLine | JournalLine> => {
    const isSpec = (r: JournalLine) => !!(r.isOpeningBalance || r.isClosingBalance || r.isTotals);
    const entCols: ColumnsType<ComboBreakLine | JournalLine> = showEntered ? [
      { title: <span style={{ color: '#52c41a', fontWeight: 600 }}>Ent Dr</span>,
        dataIndex: 'enteredDr', key: 'bEntDr', width: 120, align: 'right',
        render: (v: number, r: JournalLine) => isSpec(r) ? null : <DrCell v={v} /> },
      { title: <span style={{ color: '#52c41a', fontWeight: 600 }}>Ent Cr</span>,
        dataIndex: 'enteredCr', key: 'bEntCr', width: 120, align: 'right',
        render: (v: number, r: JournalLine) => isSpec(r) ? null : <CrCell v={v} /> },
      { title: <span style={{ color: '#52c41a', fontWeight: 600 }}>Ent Bal</span>,
        key: 'bEntBal', width: 130, align: 'right',
        render: (_: any, r: any) => {
          if (r.isOpeningBalance || r.isClosingBalance)
            return <FmtBal v={r.enteredDr - r.enteredCr} size={10} bold />;
          if (r.isTotals) return <FmtBal v={r._entBal ?? 0} size={10} bold />;
          return <FmtBal v={r._entRun ?? 0} size={10} bold={false} />;
        } },
    ] : [];
    return [
      { title: 'Description', dataIndex: 'jeLineDescription', key: 'bDesc', ellipsis: true, width: 200,
        render: (v: string, r: JournalLine) => {
          if (r.isOpeningBalance) return <Text strong style={{ fontSize: 10, color: REDWOOD.warning }}>Opening Balance</Text>;
          if (r.isClosingBalance) return <Text strong style={{ fontSize: 10, color: REDWOOD.success }}>Closing Balance</Text>;
          if (r.isTotals)        return <Text strong style={{ fontSize: 10 }}>PTD Total</Text>;
          return <Tooltip title={v}><span style={{ fontSize: 10 }}>{v || '—'}</span></Tooltip>;
        } },
      { title: 'Period', dataIndex: 'defaultPeriodName', key: 'bPeriod', width: 80,
        render: (v: string, r: JournalLine) => isSpec(r) ? null : <span style={{ fontSize: 10 }}>{v}</span> },
      { title: 'Acctg Date', dataIndex: 'accountingDate', key: 'bDate', width: 100,
        render: (v: string, r: JournalLine) => isSpec(r) ? null : <span style={{ fontSize: 10 }}>{(v || '').slice(0, 10)}</span> },
      { title: 'Batch', dataIndex: 'batchName', key: 'bBatch', ellipsis: true, width: 160,
        render: (v: string, r: JournalLine) => isSpec(r) ? null : <span style={{ fontSize: 10 }}>{v}</span> },
      { title: 'Source', dataIndex: 'userJeSourceName', key: 'bSrc', width: 110,
        render: (v: string, r: JournalLine) => isSpec(r) ? null : <span style={{ fontSize: 10 }}>{v}</span> },
      { title: 'Category', dataIndex: 'userJeCategoryName', key: 'bCat', width: 120,
        render: (v: string, r: JournalLine) => isSpec(r) ? null : <span style={{ fontSize: 10 }}>{v}</span> },
      { title: 'Status', dataIndex: 'approvalStatus', key: 'bStatus', width: 80,
        render: (v: string, r: JournalLine) => isSpec(r) ? null : (
          <Tag color={v === 'Posted' ? 'success' : v ? 'warning' : 'default'} style={{ fontSize: 9 }}>{v || '—'}</Tag>
        ) },
      { title: 'Ccy', dataIndex: 'currencyCode', key: 'bCcy', width: 70,
        render: (v: string, r: JournalLine) => isSpec(r) ? null : <Tag style={{ fontSize: 9 }}>{v}</Tag> },
      ...entCols,
      { title: <span style={{ color: REDWOOD.info, fontWeight: 600 }}>Acc Dr ({functionalCcy})</span>,
        dataIndex: 'accountedDr', key: 'bAccDr', width: 140, align: 'right',
        render: (v: number, r: JournalLine) => isSpec(r) ? null : <DrCell v={v} /> },
      { title: <span style={{ color: REDWOOD.info, fontWeight: 600 }}>Acc Cr ({functionalCcy})</span>,
        dataIndex: 'accountedCr', key: 'bAccCr', width: 140, align: 'right',
        render: (v: number, r: JournalLine) => isSpec(r) ? null : <CrCell v={v} /> },
      { title: <span style={{ color: REDWOOD.info, fontWeight: 600 }}>Acc Balance ({functionalCcy})</span>,
        key: 'bAccBal', width: 150, align: 'right',
        render: (_: any, r: any) => {
          if (r.isOpeningBalance || r.isClosingBalance)
            return <FmtBal v={r.accountedDr - r.accountedCr} size={10} bold />;
          if (r.isTotals) return <FmtBal v={r._accBal ?? 0} size={10} bold />;
          return <FmtBal v={r._accRun ?? 0} size={10} bold={false} />;
        } },
      { title: '', key: 'bDrill', width: 36, fixed: 'right' as const,
        render: (_: any, r: JournalLine) =>
          isSpec(r) ? null : (
            <Tooltip title="View journal lines">
              <Button type="text" size="small" onClick={() => openDrill(r)}
                icon={<AuditOutlined style={{ color: REDWOOD.info, fontSize: 12 }} />} />
            </Tooltip>
          ) },
    ];
  }, [showEntered, functionalCcy, openDrill]);

  // ── Export ────────────────────────────────────────────────────────────────────
  const exportExcel = async () => {
    if (!filteredData.length) { message.warning('No data to export'); return; }

    const isComboBreak = appliedGroupBy === 'concatenatedSegments' || appliedGroupBy === 'currencyCode';
    const isGrouped    = !!(appliedGroupBy && !isComboBreak);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'ReactERP'; wb.created = new Date();
    const ws = wb.addWorksheet('Account Analysis');

    const white: ExcelJS.Color      = { argb: 'FFFFFFFF' } as ExcelJS.Color;
    const numFmt                    = '#,##0.00';
    const hdrFill: ExcelJS.Fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC74634' } };
    const fltFill: ExcelJS.Fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0D6' } };
    const colFill: ExcelJS.Fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3D3D3D' } };
    const totFill: ExcelJS.Fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    const altFill: ExcelJS.Fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
    const accHdrFill: ExcelJS.Fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5FCC' } };
    const entHdrFill: ExcelJS.Fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF389E0D' } };
    const entFill: ExcelJS.Fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9F7BE' } };
    const accFill: ExcelJS.Fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4FF' } };
    const brkHdrFill: ExcelJS.Fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F0FF' } };
    const openFill: ExcelJS.Fill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    const closeFill: ExcelJS.Fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBE6' } };

    // ── Column layout ──────────────────────────────────────────────────────────
    // Flat / combo-break: 9 desc cols + [3 entered] + 3 accounted + 1 jeHeaderId
    const NCOLS_FLAT = showEntered ? 16 : 13;
    // Combo-break rows skip account/desc cols → 7 desc + [3 entered] + 3 accounted
    const NCOLS_BRK  = showEntered ? 13 : 10;
    // Grouped summary: group + count + [3 entered] + 3 accounted
    const NCOLS_GRP  = showEntered ? 8 : 5;

    const NCOLS = isGrouped ? NCOLS_GRP : isComboBreak ? NCOLS_BRK : NCOLS_FLAT;
    const mergeFull = (r: number) => ws.mergeCells(r, 1, r, NCOLS);

    // ── Title ──────────────────────────────────────────────────────────────────
    mergeFull(1);
    const titleSuffix = isComboBreak
      ? (appliedGroupBy === 'currencyCode' ? ' — By Full Combination + Currency' : ' — By Full Combination')
      : isGrouped ? ` — By ${GROUP_BY_OPTIONS.find(o => o.value === appliedGroupBy)?.label || appliedGroupBy}` : '';
    const tc = ws.getCell('A1');
    tc.value = `Account Analysis${titleSuffix}`;
    tc.font = { bold: true, size: 13, color: white };
    tc.fill = hdrFill; tc.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 22;

    // ── Filter summary ─────────────────────────────────────────────────────────
    const activeSegs = Object.entries(segFilters).map(([k, v]) => {
      const def = SEGMENT_DEFS.find(d => d.key === k);
      return `${def?.label || k}: ${segLabels[k] || v}`;
    });
    const fRows: [string, string][] = [
      ['Ledger',   ledger || '—'],
      ['Account',  account ? `${account}${accountDesc ? ' – ' + accountDesc : ''}` : '—'],
      ['Periods',  periods.length ? periods.join(', ') : '—'],
      ['Filters',  activeSegs.length ? activeSegs.join(' | ') : '—'],
      ['Exported', new Date().toLocaleString()],
      ['Records',  String(filteredData.length)],
    ];
    let ri = 2;
    for (const [lbl, val] of fRows) {
      ws.mergeCells(ri, 1, ri, 3); ws.mergeCells(ri, 4, ri, NCOLS);
      const lc = ws.getCell(ri, 1); const vc = ws.getCell(ri, 4);
      lc.value = lbl; vc.value = val;
      lc.font = { bold: true, size: 10 }; vc.font = { size: 10 };
      lc.fill = fltFill;
      lc.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      vc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      ws.getRow(ri).height = 16; ri++;
    }
    ri++; // blank spacer

    // ══════════════════════════════════════════════════════════════════════════
    // MODE A: GROUPED SUMMARY
    // ══════════════════════════════════════════════════════════════════════════
    if (isGrouped) {
      const groupLabel = GROUP_BY_OPTIONS.find(o => o.value === appliedGroupBy)?.label || appliedGroupBy;
      const ghCols = showEntered
        ? [groupLabel, 'Count', 'Ent Dr', 'Ent Cr', 'Ent Balance', `Acc Dr (${functionalCcy})`, `Acc Cr (${functionalCcy})`, `Acc Balance (${functionalCcy})`]
        : [groupLabel, 'Count', `Acc Dr (${functionalCcy})`, `Acc Cr (${functionalCcy})`, `Acc Balance (${functionalCcy})`];
      const ghWidths = showEntered ? [36, 10, 16, 16, 16, 16, 16, 16] : [36, 10, 16, 16, 16];
      ws.getRow(ri).height = 18;
      ghCols.forEach((h, i) => {
        const cell = ws.getCell(ri, i + 1);
        cell.value = h; cell.font = { bold: true, size: 10, color: white };
        const isEnt = showEntered && i >= 2 && i <= 4;
        const isAcc = i >= (showEntered ? 5 : 2);
        cell.fill = isEnt ? entHdrFill : isAcc ? accHdrFill : colFill;
        cell.alignment = { horizontal: i > 0 ? 'right' : 'left', vertical: 'middle', indent: 1 };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF888888' } } };
        ws.getColumn(i + 1).width = ghWidths[i];
      });
      const dataStartRow = ++ri;
      groupedData.forEach((g, idx) => {
        ws.getRow(ri).height = 15;
        const fill = g.isTotals ? totFill : idx % 2 === 1 ? altFill : undefined;
        const gVals = showEntered
          ? [g.groupValue, g.count, g.totalEntDr, g.totalEntCr, g.entBalance, g.totalAccDr, g.totalAccCr, g.accBalance]
          : [g.groupValue, g.count, g.totalAccDr, g.totalAccCr, g.accBalance];
        gVals.forEach((v, i) => {
          const cell = ws.getCell(ri, i + 1);
          cell.value = v as any;
          if (fill) cell.fill = fill;
          cell.alignment = { horizontal: i > 0 ? 'right' : 'left', vertical: 'middle', indent: 1 };
          if (i > 1) cell.numFmt = numFmt;
          const entBalIdx = showEntered ? 4 : -1;
          const accBalIdx = showEntered ? 7 : 4;
          const isBal = i === entBalIdx || i === accBalIdx;
          const bal = i === entBalIdx ? g.entBalance : g.accBalance;
          cell.font = isBal
            ? { size: 10, bold: true, color: { argb: bal < 0 ? 'FFC41C00' : 'FF237804' } }
            : { size: 10, bold: !!g.isTotals };
        });
        ri++;
      });
      ws.views = [{ state: 'frozen', xSplit: 0, ySplit: dataStartRow - 1 }];
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SHARED HELPER: column-group header row + column header row (flat & combo)
    // ══════════════════════════════════════════════════════════════════════════
    const writeDetailColHeaders = (nDescCols: number) => {
      // row 1: Entered / Accounted group spans
      ws.getRow(ri).height = 16;
      for (let c = 1; c <= nDescCols; c++) ws.getCell(ri, c).fill = colFill;
      let col = nDescCols + 1;
      if (showEntered) {
        ws.mergeCells(ri, col, ri, col + 2);
        const ec = ws.getCell(ri, col);
        ec.value = 'Entered'; ec.font = { bold: true, size: 10, color: { argb: 'FF52C41A' } };
        ec.fill = entFill; ec.alignment = { horizontal: 'center', vertical: 'middle' };
        col += 3;
      }
      ws.mergeCells(ri, col, ri, col + 2);
      const ac = ws.getCell(ri, col);
      ac.value = `Accounted (${functionalCcy})`; ac.font = { bold: true, size: 10, color: { argb: 'FF1677FF' } };
      ac.fill = accFill; ac.alignment = { horizontal: 'center', vertical: 'middle' };
      col += 3; ws.getCell(ri, col).fill = colFill; ri++;
    };

    const writeDetailColNames = (names: string[], widths: number[]) => {
      ws.getRow(ri).height = 18;
      names.forEach((h, i) => {
        const cell = ws.getCell(ri, i + 1);
        cell.value = h;
        const descEnd = names.length - (showEntered ? 7 : 4) - 1; // last desc col index (0-based)
        const isEnt = showEntered && i > descEnd && i <= descEnd + 3;
        const isAcc = i > descEnd + (showEntered ? 3 : 0) && i <= descEnd + (showEntered ? 6 : 3);
        cell.fill = isEnt ? entHdrFill : isAcc ? accHdrFill : colFill;
        cell.font = { bold: true, size: 10, color: white };
        cell.alignment = { horizontal: (isEnt || isAcc) ? 'right' : 'left', vertical: 'middle', indent: 1 };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF888888' } } };
        ws.getColumn(i + 1).width = widths[i] || 14;
      });
      ri++;
    };

    // Write a single data row (flat or break detail)
    const writeDetailRow = (r: any, idx: number, showJeId: boolean) => {
      const isSpec = r.isOpeningBalance || r.isClosingBalance || r.isTotals;
      const fill = r.isOpeningBalance ? openFill
        : r.isClosingBalance ? closeFill
        : r.isTotals ? totFill
        : idx % 2 === 1 ? altFill : undefined;

      const accBal = r.isTotals ? (r._accBal ?? 0) : r.isOpeningBalance || r.isClosingBalance
        ? (r.accountedDr || 0) - (r.accountedCr || 0) : (r._accRun ?? 0);
      const entBal = r.isTotals ? (r._entBal ?? 0) : r.isOpeningBalance || r.isClosingBalance
        ? (r.enteredDr || 0) - (r.enteredCr || 0) : (r._entRun ?? 0);

      const vals: (string | number)[] = [
        ...(showJeId
          ? [r.concatenatedSegments || '', r.accountDescription || ''] : []),
        r.jeLineDescription || '',
        isSpec ? '' : (r.defaultPeriodName || ''),
        isSpec ? '' : ((r.accountingDate || '').slice(0, 10)),
        isSpec ? '' : (r.batchName || ''),
        isSpec ? '' : (r.userJeSourceName || ''),
        isSpec ? '' : (r.userJeCategoryName || ''),
        isSpec ? '' : (r.currencyCode || ''),
        ...(showEntered ? [
          isSpec ? '' : (r.enteredDr || 0),
          isSpec ? '' : (r.enteredCr || 0),
          entBal,
        ] : []),
        isSpec ? '' : (r.accountedDr || 0),
        isSpec ? '' : (r.accountedCr || 0),
        accBal,
        ...(showJeId ? [isSpec ? '' : (r.jeHeaderId || '')] : []),
      ];
      const descColCount = showJeId ? 9 : 7;
      ws.getRow(ri).height = 15;
      vals.forEach((v, i) => {
        const cell = ws.getCell(ri, i + 1);
        cell.value = v as any;
        if (fill) cell.fill = fill;
        const isNumeric = i >= descColCount;
        cell.alignment = { horizontal: isNumeric ? 'right' : 'left', vertical: 'middle', indent: 1 };
        if (isNumeric && v !== '') cell.numFmt = numFmt;
        const entBalCol = showEntered ? descColCount + 2 : -1;
        const accBalCol = showEntered ? descColCount + 5 : descColCount + 2;
        const isBal = i === entBalCol || i === accBalCol;
        const bal = i === entBalCol ? entBal : accBal;
        cell.font = isBal
          ? { size: 10, bold: r.isTotals || r.isOpeningBalance || r.isClosingBalance, color: { argb: bal < 0 ? 'FFC41C00' : 'FF237804' } }
          : { size: 10, bold: isSpec };
      });
      ri++;
    };

    // ══════════════════════════════════════════════════════════════════════════
    // MODE B: FLAT DETAIL
    // ══════════════════════════════════════════════════════════════════════════
    if (!isGrouped && !isComboBreak) {
      writeDetailColHeaders(9);
      const descHdrs = ['Account', 'Account Description', 'Line Description', 'Period', 'Acctg Date', 'Batch', 'Source', 'Category', 'Currency'];
      const entHdrs  = showEntered ? ['Ent Dr', 'Ent Cr', 'Ent Balance'] : [];
      const accHdrs  = [`Acc Dr (${functionalCcy})`, `Acc Cr (${functionalCcy})`, `Acc Balance (${functionalCcy})`];
      const hdrs     = [...descHdrs, ...entHdrs, ...accHdrs, 'JE Header ID'];
      const widths   = [28, 28, 32, 12, 14, 28, 14, 16, 10, ...(showEntered ? [16, 16, 16] : []), 16, 16, 16, 14];
      writeDetailColNames(hdrs, widths);
      const dataStartRow = ri;
      // pass rowsWithBal which has _accRun/_entRun; totals row already appended in tableData
      tableData.forEach((r, idx) => writeDetailRow(r as any, idx, true));
      ws.views = [{ state: 'frozen', xSplit: 0, ySplit: dataStartRow - 1 }];
      ws.autoFilter = { from: { row: dataStartRow - 1, column: 1 }, to: { row: ri - 1, column: NCOLS_FLAT } };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MODE C: COMBO-BREAK (Full Combination grouping)
    // ══════════════════════════════════════════════════════════════════════════
    if (isComboBreak) {
      if (!comboBreaks.length) { message.warning('No combo-break data — apply the group first'); return; }
      // Column group + name headers (7 desc cols, no account/desc since those are in section header)
      writeDetailColHeaders(7);
      const descHdrs = ['Line Description', 'Period', 'Acctg Date', 'Batch', 'Source', 'Category', 'Currency'];
      const entHdrs  = showEntered ? ['Ent Dr', 'Ent Cr', 'Ent Balance'] : [];
      const accHdrs  = [`Acc Dr (${functionalCcy})`, `Acc Cr (${functionalCcy})`, `Acc Balance (${functionalCcy})`];
      const hdrs     = [...descHdrs, ...entHdrs, ...accHdrs];
      const widths   = [32, 12, 14, 28, 14, 16, 10, ...(showEntered ? [16, 16, 16] : []), 16, 16, 16];
      writeDetailColNames(hdrs, widths);

      comboBreaks.forEach(brk => {
        // Section header row
        mergeFull(ri);
        const sh = ws.getCell(ri, 1);
        sh.value = `${brk.combo}${brk.description ? '   —   ' + brk.description : ''}   (${brk.linesWithBal.length} line${brk.linesWithBal.length !== 1 ? 's' : ''})`;
        sh.font = { bold: true, size: 11, color: { argb: 'FF1A5FCC' } };
        sh.fill = brkHdrFill;
        sh.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        sh.border = { left: { style: 'medium', color: { argb: 'FF1677FF' } } };
        ws.getRow(ri).height = 19; ri++;

        // Build brkData identical to what the table shows on screen
        const lastLine = brk.linesWithBal[brk.linesWithBal.length - 1];
        const ptdTotRow: any = {
          key: `${brk.combo}-ptd`, jeLineDescription: 'PTD Total',
          enteredDr: brk.ptdEntDr, enteredCr: brk.ptdEntCr,
          accountedDr: brk.ptdAccDr, accountedCr: brk.ptdAccCr,
          isTotals: true,
          _accBal: lastLine ? lastLine._accRun : 0,
          _entBal: lastLine ? lastLine._entRun : 0,
        };
        const brkData: any[] = [
          ...(brk.openingRow ? [brk.openingRow] : []),
          ...brk.linesWithBal,
          ptdTotRow,
          ...(brk.closingRow ? [brk.closingRow] : []),
        ];

        brkData.forEach((r, idx) => writeDetailRow(r, idx, false));

        // Blank spacer between combos
        ws.getRow(ri).height = 8; ri++;
      });
    }

    const buf = await wb.xlsx.writeBuffer();
    const suffix = isComboBreak ? '_by_combination' : isGrouped ? `_by_${appliedGroupBy}` : '';
    saveAs(
      new Blob([buf], { type: 'application/octet-stream' }),
      `account_analysis${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    message.success('Excel file downloaded');
  };

  const handlePrintPdf = useCallback(() => {
    if (!filteredData.length) { message.warning('No data to export'); return; }

    // Portrait when entered is off (fewer columns), landscape when entered is on
    const orientation = showEntered ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pageW  = doc.internal.pageSize.getWidth();
    const pageH  = doc.internal.pageSize.getHeight();
    const margin = 12;
    const usableW = pageW - margin * 2;

    const fmtN = (v: number) =>
      v === 0 ? '—' : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

    const periodLabel = periods.length
      ? (periods.length === 1 ? periods[0] : `${[...periods].sort()[0]} – ${[...periods].sort().slice(-1)[0]}`)
      : '';

    // Title block — all black
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Account Analysis', pageW / 2, 12, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const subtitle = [ledger, periodLabel, account ? `Acct: ${account}` : ''].filter(Boolean).join('   |   ');
    doc.text(subtitle, pageW / 2, 17, { align: 'center' });

    const baseStyles: any = { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak', textColor: [0, 0, 0] };
    const headStyles: any = { fillColor: [26, 95, 204], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 };
    const applyRowStyle = (data: any, rows: any[]) => {
      const row = rows[data.row.index];
      if (!row) return;
      data.cell.styles.textColor = [0, 0, 0];
      if (row.isOpeningBalance)      { data.cell.styles.fillColor = [219, 234, 254]; data.cell.styles.fontStyle = 'bold'; }
      else if (row.isClosingBalance) { data.cell.styles.fillColor = [255, 251, 230]; data.cell.styles.fontStyle = 'bold'; }
      else if (row.isTotals)         { data.cell.styles.fillColor = [240, 240, 240]; data.cell.styles.fontStyle = 'bold'; }
    };

    const isComboBreak = appliedGroupBy === 'concatenatedSegments' || appliedGroupBy === 'currencyCode';

    // Column widths sized to exactly fill usableW
    // Portrait (182mm usable): accounted-only columns
    // Landscape (273mm usable): entered + accounted columns
    const numW   = showEntered ? 20 : 13;   // each numeric column width
    const balW   = showEntered ? 22 : 14;   // balance column (slightly wider)

    if (isComboBreak) {
      // Fixed columns: Batch(26) Source(16) Status(13) Ccy(8) = 63
      const fixedW   = 26 + 16 + 13 + 8;
      const numCols  = showEntered ? 6 : 3;  // Ent Dr+Cr+Bal + Acc Dr+Cr+Bal  OR  Acc Dr+Cr+Bal
      const numTotal = numCols * numW + (balW - numW); // last col wider by (balW-numW)
      const lineDescW = usableW - fixedW - numTotal;

      const headers = showEntered
        ? ['Line Description', 'Batch', 'Source', 'Status', 'Ccy', 'Ent Dr', 'Ent Cr', 'Ent Bal', `Acc Dr (${functionalCcy})`, `Acc Cr (${functionalCcy})`, `Acc Bal (${functionalCcy})`]
        : ['Line Description', 'Batch', 'Source', 'Status', 'Ccy', `Acc Dr (${functionalCcy})`, `Acc Cr (${functionalCcy})`, `Acc Bal (${functionalCcy})`];

      let startY = 22;
      comboBreaks.forEach((brk, bi) => {
        if (bi > 0) startY += 4;
        const comboLabel = appliedGroupBy === 'currencyCode' && brk.combo.includes('||')
          ? brk.combo.replace('||', '  –  ')
          : brk.combo;
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
        doc.text(comboLabel + (brk.description ? `  ${brk.description}` : ''), margin, startY);

        const lastLine  = brk.linesWithBal[brk.linesWithBal.length - 1];
        const ptdTot: any = {
          jeLineDescription: 'PTD Total', batchName: '', userJeSourceName: '', approvalStatus: '', currencyCode: '',
          enteredDr: brk.ptdEntDr, enteredCr: brk.ptdEntCr,
          accountedDr: brk.ptdAccDr, accountedCr: brk.ptdAccCr,
          isTotals: true,
          _accRun: lastLine?._accRun ?? 0,
          _entRun: lastLine?._entRun ?? 0,
        };
        const brkRows: any[] = [
          ...(brk.openingRow ? [brk.openingRow] : []),
          ...brk.linesWithBal,
          ptdTot,
          ...(brk.closingRow ? [brk.closingRow] : []),
        ];

        const body = brkRows.map(r => {
          const special = r.isOpeningBalance || r.isClosingBalance || r.isTotals;
          const lineLabel = r.isOpeningBalance ? 'Opening Balance'
            : r.isClosingBalance ? 'Closing Balance'
            : r.isTotals ? 'PTD Total' : (r.jeLineDescription || '');
          const base = [lineLabel, special ? '' : (r.batchName||''), special ? '' : (r.userJeSourceName||''),
                        special ? '' : (r.approvalStatus||''), special ? '' : (r.currencyCode||'')];
          const entCols = showEntered ? [fmtN(r.enteredDr||0), fmtN(r.enteredCr||0), fmtN(r._entRun??0)] : [];
          const accCols = [fmtN(r.accountedDr||0), fmtN(r.accountedCr||0), fmtN(r._accRun??0)];
          return [...base, ...entCols, ...accCols];
        });

        const lastIdx = headers.length - 1;
        const colStyles: any = {
          0: { cellWidth: lineDescW, overflow: 'linebreak' },
          1: { cellWidth: 26 }, 2: { cellWidth: 16 }, 3: { cellWidth: 13 }, 4: { cellWidth: 8 },
        };
        for (let i = 5; i <= lastIdx; i++) {
          colStyles[i] = { halign: 'right', cellWidth: i === lastIdx ? balW : numW };
          if (i === lastIdx) colStyles[i].fontStyle = 'bold';
        }

        autoTable(doc, {
          startY: startY + 2, head: [headers], body, theme: 'grid',
          styles: baseStyles, headStyles, columnStyles: colStyles,
          didParseCell: (data) => applyRowStyle(data, brkRows),
          margin: { left: margin, right: margin },
          didDrawPage: (data) => { startY = data.cursor?.y ?? startY; },
        });
        startY = (doc as any).lastAutoTable.finalY + 4;
      });
    } else {
      // Flat mode — compute running balances inline
      let accRun = 0, entRun = 0;
      const flatRows: any[] = filteredData.map(r => {
        if (r.isOpeningBalance) {
          accRun = (r.accountedDr||0) - (r.accountedCr||0);
          entRun = (r.enteredDr||0)   - (r.enteredCr||0);
        } else if (!r.isClosingBalance) {
          accRun += (r.accountedDr||0) - (r.accountedCr||0);
          entRun += (r.enteredDr||0)   - (r.enteredCr||0);
        }
        return { ...r, _accRun: accRun, _entRun: entRun };
      });
      const totRow: any = {
        concatenatedSegments: 'Total for Report',
        jeLineDescription: '', batchName: '', userJeSourceName: '', approvalStatus: '', currencyCode: '',
        enteredDr: gridTotals.entDr, enteredCr: gridTotals.entCr,
        accountedDr: gridTotals.accDr, accountedCr: gridTotals.accCr,
        isTotals: true, _accRun: accRun, _entRun: entRun,
      };
      const pdfRows = [...flatRows, totRow];

      // Fixed columns: Account(32) LineDesc(auto) Batch(26) Source(16) Status(13) Ccy(8)
      const acctW   = 32;
      const fixedW  = acctW + 26 + 16 + 13 + 8;
      const numCols = showEntered ? 6 : 3;
      const numTotal = numCols * numW + (balW - numW);
      const lineDescW = usableW - fixedW - numTotal;

      const headers = showEntered
        ? ['Account', 'Line Description', 'Batch', 'Source', 'Status', 'Ccy', 'Ent Dr', 'Ent Cr', 'Ent Bal', `Acc Dr (${functionalCcy})`, `Acc Cr (${functionalCcy})`, `Acc Bal (${functionalCcy})`]
        : ['Account', 'Line Description', 'Batch', 'Source', 'Status', 'Ccy', `Acc Dr (${functionalCcy})`, `Acc Cr (${functionalCcy})`, `Acc Bal (${functionalCcy})`];

      const body = pdfRows.map(r => {
        const special = r.isOpeningBalance || r.isClosingBalance || r.isTotals;
        const acctLabel = r.isTotals ? 'Total for Report'
          : r.isOpeningBalance ? 'Opening Balance'
          : r.isClosingBalance ? 'Closing Balance'
          : r.concatenatedSegments || '';
        const base = [acctLabel, special ? '' : (r.jeLineDescription||''), special ? '' : (r.batchName||''),
                      special ? '' : (r.userJeSourceName||''), special ? '' : (r.approvalStatus||''),
                      special ? '' : (r.currencyCode||'')];
        const entCols = showEntered ? [fmtN(r.enteredDr||0), fmtN(r.enteredCr||0), fmtN(r._entRun??0)] : [];
        const accCols = [fmtN(r.accountedDr||0), fmtN(r.accountedCr||0), fmtN(r._accRun??0)];
        return [...base, ...entCols, ...accCols];
      });

      const lastIdx = headers.length - 1;
      const colStyles: any = {
        0: { cellWidth: acctW },
        1: { cellWidth: lineDescW, overflow: 'linebreak' },
        2: { cellWidth: 26 }, 3: { cellWidth: 16 }, 4: { cellWidth: 13 }, 5: { cellWidth: 8 },
      };
      for (let i = 6; i <= lastIdx; i++) {
        colStyles[i] = { halign: 'right', cellWidth: i === lastIdx ? balW : numW };
        if (i === lastIdx) colStyles[i].fontStyle = 'bold';
      }

      autoTable(doc, {
        startY: 22, head: [headers], body, theme: 'grid',
        styles: baseStyles, headStyles, columnStyles: colStyles,
        didParseCell: (data) => applyRowStyle(data, pdfRows),
        margin: { left: margin, right: margin },
      });
    }

    // Page numbers — black
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);
      doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 6, { align: 'right' });
      doc.text(`Generated: ${new Date().toLocaleString()}`, margin, pageH - 6);
    }

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    setPdfBlobUrl(url);
    setPdfPreviewOpen(true);
  }, [filteredData, periods, ledger, account, appliedGroupBy, comboBreaks, showEntered, functionalCcy, gridTotals, pdfBlobUrl]);

  const activeFilters = Object.entries(segFilters).filter(([, v]) => v);
  const accountLabel  = account ? `${account}${accountDesc ? ' – ' + accountDesc : ''}` : '';

  return (
    <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Parameter Card */}
      <Card size="small" styles={{ body: { padding: '14px 16px' } }}
        style={{ borderRadius: 10, border: `1px solid ${REDWOOD.neutral200}`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <BookOutlined style={{ color: REDWOOD.info, fontSize: 16 }} />
          <Text strong style={{ fontSize: 14 }}>Search Parameters</Text>
        </div>
        <Row gutter={[12, 8]} align="bottom">
          <Col xs={24} sm={12} md={5}>
            <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 3, fontWeight: 500 }}>
              Ledger * {ledgersLoading && <ReloadOutlined spin style={{ marginLeft: 4, fontSize: 10 }} />}
            </div>
            <Select value={ledger || undefined} onChange={v => { setLedger(v); setPeriods([]); }}
              style={{ width: '100%' }} size="small" showSearch loading={ledgersLoading}
              placeholder={ledgersLoading ? 'Loading…' : 'Select ledger'}>
              {ledgerOptions.map(l => <Option key={l} value={l}>{l}</Option>)}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={7}>
            <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 3, fontWeight: 500 }}>Account</div>
            <ClickField label={accountLabel} placeholder="All Accounts"
              onClick={() => { loadAccounts(); setAccountPickerOpen(true); }}
              onClear={() => { setAccount(''); setAccountDesc(''); }} />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 3, fontWeight: 500 }}>
              Period(s) * {periodsLoading && <ReloadOutlined spin style={{ marginLeft: 4, fontSize: 10 }} />}
            </div>
            <Select mode="multiple" value={periods} onChange={setPeriods}
              style={{ width: '100%' }} size="small" showSearch allowClear
              placeholder="Select periods" maxTagCount={3} loading={periodsLoading}>
              {allPeriods.map(p => <Option key={p} value={p}>{p}</Option>)}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={4} style={{ display: 'flex', gap: 6 }}>
            <Button type="primary" icon={<SearchOutlined />} size="small" loading={loading}
              onClick={handleSearch}
              style={{ background: REDWOOD.info, borderColor: REDWOOD.info, flex: 1 }}>Search</Button>
            <Button icon={<ClearOutlined />} size="small" onClick={() => {
              setRows([]); setHasSearched(false); setPeriods([]);
              setAccount(''); setAccountDesc(''); setSegFilters({}); setSegLabels({});
            }} />
          </Col>
        </Row>

        {/* Segment Filter row */}
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <Text style={{ fontSize: 11, color: REDWOOD.neutral600, fontWeight: 500 }}>
            <FilterOutlined style={{ marginRight: 4 }} />Segment Filters:
          </Text>
          {activeFilters.map(([key, val]) => {
            const def = SEGMENT_DEFS.find(d => d.key === key);
            return (
              <Tag key={key} color={def?.color || 'default'} closable
                onClose={() => removeSegFilter(key)} style={{ fontSize: 11, margin: 0 }}>
                <span style={{ opacity: 0.8 }}>{def?.label}: </span>
                <strong>{segLabels[key] || val}</strong>
              </Tag>
            );
          })}
          <Button size="small" type="dashed" icon={<PlusOutlined />}
            onClick={() => setSegPickerOpen(true)}
            style={{ fontSize: 11, height: 24, color: REDWOOD.info, borderColor: REDWOOD.info }}>
            Add Filter
          </Button>
          {activeFilters.length > 0 && (
            <Button size="small" type="text"
              onClick={() => { setSegFilters({}); setSegLabels({}); }}
              style={{ fontSize: 11, height: 24, color: REDWOOD.primary }}>Clear All</Button>
          )}
        </div>
      </Card>

      {/* Toolbar */}
      {hasSearched && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <Space wrap>
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
            <Divider type="vertical" />
            <Space size={6}>
              <GroupOutlined style={{ color: REDWOOD.neutral600, fontSize: 13 }} />
              <Select value={groupBy || undefined} allowClear placeholder="Group by…"
                style={{ width: 190 }} size="small"
                onChange={v => setGroupBy(v ?? '')}
                onClear={() => setGroupBy('')}>
                <Select.OptGroup label="Combination">
                  {GROUP_BY_OPTIONS.filter(o => o.group === 'Combination').map(o =>
                    <Option key={o.value} value={o.value}>{o.label}</Option>)}
                </Select.OptGroup>
                <Select.OptGroup label="Group by Field">
                  {GROUP_BY_OPTIONS.filter(o => o.group === 'Field').map(o =>
                    <Option key={o.value} value={o.value}>{o.label}</Option>)}
                </Select.OptGroup>
                <Select.OptGroup label="Group by Segment">
                  {GROUP_BY_OPTIONS.filter(o => o.group === 'Segment').map(o =>
                    <Option key={o.value} value={o.value}>{o.label}</Option>)}
                </Select.OptGroup>
              </Select>
              <Button size="small" type="primary" ghost
                disabled={!groupBy || !hasSearched}
                onClick={applyGroup}
                style={{ fontSize: 11, height: 24 }}>Apply Group</Button>
              {appliedGroupBy && (
                <Button size="small" danger ghost
                  onClick={clearGroup}
                  style={{ fontSize: 11, height: 24 }}>Clear Group</Button>
              )}
            </Space>
          </Space>
          <Space>
            <Input prefix={<SearchOutlined style={{ color: REDWOOD.neutral600 }} />}
              placeholder="Filter results…" size="small" allowClear
              value={gridSearch} onChange={e => setGridSearch(e.target.value)}
              style={{ width: 200, borderRadius: 6 }} />
            <Tooltip title="View API URL">
              <Button size="small" icon={<ApiOutlined />}
                style={{ color: REDWOOD.info, borderColor: REDWOOD.info }}
                onClick={() => setApiModalOpen(true)} />
            </Tooltip>
            <Button size="small" icon={<FileExcelOutlined />} onClick={exportExcel}
              disabled={!filteredData.length}>Excel</Button>
            <Button size="small" icon={<FilePdfOutlined />} onClick={handlePrintPdf}
              disabled={!filteredData.length}
              style={{ color: '#c74634', borderColor: '#c74634' }}>PDF</Button>
          </Space>
        </div>
      )}

      {/* Grid */}
      <Spin spinning={loading || breakLoading}>
        {hasSearched && !appliedGroupBy && (
          <Table<JournalLine>
            dataSource={tableData} columns={flatColumns} rowKey="key" size="small"
            scroll={{ x: 'max-content', y: 480 }}
            pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `${t} records` }}
            className="aa-v2-grid"
            rowClassName={r => r.isTotals ? 'aa-totals-row' : r.isOpeningBalance ? 'aa-opening-row' : r.isClosingBalance ? 'aa-closing-row' : ''}
          />
        )}
        {hasSearched && (appliedGroupBy === 'concatenatedSegments' || appliedGroupBy === 'currencyCode') && !breakLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {comboBreaks.map(brk => {
              const ptdTotRow = {
                key: `${brk.combo}-ptd`,
                concatenatedSegments: brk.combo, accountDescription: '', jeLineDescription: 'PTD Total',
                defaultPeriodName: '', accountingDate: '', batchName: '',
                userJeSourceName: '', userJeCategoryName: '', currencyCode: '',
                enteredDr: brk.ptdEntDr, enteredCr: brk.ptdEntCr,
                accountedDr: brk.ptdAccDr, accountedCr: brk.ptdAccCr,
                jeHeaderId: 0, isTotals: true,
                _accBal: brk.linesWithBal.length > 0 ? brk.linesWithBal[brk.linesWithBal.length - 1]._accRun : 0,
                _entBal: brk.linesWithBal.length > 0 ? brk.linesWithBal[brk.linesWithBal.length - 1]._entRun : 0,
              } as JournalLine;
              const brkData: (ComboBreakLine | JournalLine)[] = [
                ...(brk.openingRow ? [brk.openingRow] : []),
                ...brk.linesWithBal,
                ptdTotRow,
                ...(brk.closingRow ? [brk.closingRow] : []),
              ];
              return (
                <div key={brk.combo}>
                  <div style={{ background: REDWOOD.neutral100, borderLeft: `4px solid ${REDWOOD.info}`,
                    padding: '6px 12px', marginBottom: 4, borderRadius: '4px 4px 0 0',
                    display: 'flex', alignItems: 'baseline', gap: 12 }}>
                    <Text strong style={{ fontSize: 12, color: REDWOOD.info, fontFamily: 'monospace' }}>
                      {appliedGroupBy === 'currencyCode' && brk.combo.includes('||')
                        ? brk.combo.split('||')[0]
                        : brk.combo}
                    </Text>
                    {appliedGroupBy === 'currencyCode' && brk.combo.includes('||') && (
                      <Tag color="blue" style={{ fontSize: 11, fontWeight: 600 }}>{brk.combo.split('||')[1]}</Tag>
                    )}
                    {brk.description && (
                      <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{brk.description}</Text>
                    )}
                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>{brk.linesWithBal.length} line{brk.linesWithBal.length !== 1 ? 's' : ''}</Text>
                  </div>
                  <Table<ComboBreakLine | JournalLine>
                    dataSource={brkData} columns={breakLineCols as any}
                    rowKey={(r: any) => r.key || Math.random().toString()}
                    size="small" pagination={false}
                    scroll={{ x: 'max-content' }}
                    className="aa-v2-grid"
                    rowClassName={(r: any) =>
                      r.isTotals ? 'aa-totals-row' : r.isOpeningBalance ? 'aa-opening-row' : r.isClosingBalance ? 'aa-closing-row' : ''
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
        {hasSearched && appliedGroupBy && appliedGroupBy !== 'concatenatedSegments' && appliedGroupBy !== 'currencyCode' && (
          <Table<GroupedRow>
            dataSource={groupedData} columns={groupColumns} rowKey="key" size="small"
            scroll={{ x: 'max-content', y: 480 }}
            pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `${t} rows` }}
            className="aa-v2-grid"
            rowClassName={r => r.isTotals ? 'aa-totals-row' : ''}
          />
        )}
      </Spin>

      {/* Balance Summary */}
      {hasSearched && rows.length > 0 && (
        <Row gutter={12}>
          {showEntered && (
            <Col xs={24} md={12}>
              <Card size="small" styles={{ body: { padding: '10px 16px' } }}
                style={{ borderRadius: 8, border: '1px solid #b7eb8f', background: '#f6ffed' }}>
                <Text strong style={{ fontSize: 11, color: '#52c41a', display: 'block', marginBottom: 8 }}>Entered Balance</Text>
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
                      {(item as any).color
                        ? <Text strong style={{ fontSize: 14, color: (item as any).color }}>{fmtN(item.v)}</Text>
                        : <FmtBal v={item.v} size={14} bold />}
                    </Col>
                  ))}
                </Row>
              </Card>
            </Col>
          )}
          <Col xs={24} md={showEntered ? 12 : 24}>
            <Card size="small" styles={{ body: { padding: '10px 16px' } }}
              style={{ borderRadius: 8, border: '1px solid #adc6ff', background: '#f0f5ff' }}>
              <Text strong style={{ fontSize: 11, color: '#1677ff', display: 'block', marginBottom: 8 }}>
                Accounted Balance ({functionalCcy})
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
                    {(item as any).color
                      ? <Text strong style={{ fontSize: 14, color: (item as any).color }}>{fmtN(item.v)}</Text>
                      : <FmtBal v={item.v} size={14} bold />}
                  </Col>
                ))}
              </Row>
            </Card>
          </Col>
        </Row>
      )}

      {/* Modals */}
      <AccountPicker open={accountPickerOpen} onClose={() => setAccountPickerOpen(false)}
        options={accountOptions} loading={accountsLoading}
        onSelect={(val, desc) => { setAccount(val); setAccountDesc(desc); }} />

      <SegmentPicker open={segPickerOpen} onClose={() => setSegPickerOpen(false)}
        segmentValues={segmentValues} companyOptions={companyOptions}
        segDescMaps={segDescMaps}
        existing={segFilters} loading={segValuesLoading} onAdd={addSegFilter} />

      <DrillModal open={drillOpen} onClose={() => setDrillOpen(false)}
        record={drillRecord} lines={drillLines} loading={drillLoading}
        functionalCcy={functionalCcy} />

      <Modal open={apiModalOpen} onCancel={() => setApiModalOpen(false)}
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} />API Endpoint</Space>}
        footer={<Button onClick={() => setApiModalOpen(false)}>Close</Button>} width={720}>
        {/* Main account-analysis URL */}
        <Text strong style={{ fontSize: 12 }}>Account Analysis</Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
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
          <div style={{ marginTop: 6, paddingLeft: 4 }}>
            {apiUrl.split('?')[1].split('&').map((part, i) => {
              const [k, v] = part.split('=');
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
        {/* TB balance calls shown only when combo-break group is applied */}
        {(appliedGroupBy === 'concatenatedSegments' || appliedGroupBy === 'currencyCode') && tbApiUrls.length > 0 && (
          <>
            <Divider style={{ margin: '12px 0 8px' }} />
            <Text strong style={{ fontSize: 12 }}>Trial Balance (Opening / Closing Balance)</Text>
            {tbApiUrls.map((url, idx) => (
              <div key={idx} style={{ marginTop: 6 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {idx === 0 ? 'Opening period' : 'Closing period'}
                </Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <div style={{ flex: 1, background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 6,
                    padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                    {url}
                  </div>
                  <Tooltip title="Copy">
                    <Button size="small" icon={<CopyOutlined />}
                      onClick={() => { navigator.clipboard.writeText(url); message.success('Copied'); }} />
                  </Tooltip>
                </div>
                {url.includes('?') && (
                  <div style={{ marginTop: 4, paddingLeft: 4 }}>
                    {url.split('?')[1].split('&').map((part, j) => {
                      const [k, v] = part.split('=');
                      return (
                        <div key={j} style={{ fontSize: 10, marginBottom: 1 }}>
                          <Text code style={{ fontSize: 10 }}>{decodeURIComponent(k)}</Text>
                          {' = '}
                          <Text style={{ fontSize: 10, color: REDWOOD.info }}>{decodeURIComponent(v || '')}</Text>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </Modal>

      {/* PDF Preview Modal */}
      <Modal
        open={pdfPreviewOpen}
        onCancel={() => { setPdfPreviewOpen(false); }}
        title={<Space><FilePdfOutlined style={{ color: '#c74634' }} />PDF Preview — Account Analysis</Space>}
        footer={[
          <Button key="close" onClick={() => setPdfPreviewOpen(false)}>Close</Button>,
          <Button key="download" type="primary" icon={<FilePdfOutlined />}
            style={{ background: '#c74634', borderColor: '#c74634' }}
            onClick={() => {
              const a = document.createElement('a');
              a.href = pdfBlobUrl;
              a.download = `account_analysis_${new Date().toISOString().slice(0, 10)}.pdf`;
              a.click();
            }}>
            Download PDF
          </Button>,
        ]}
        width="90vw"
        styles={{ body: { padding: 0 } }}
      >
        {pdfBlobUrl && (
          <iframe
            src={pdfBlobUrl}
            style={{ width: '100%', height: '75vh', border: 'none', display: 'block' }}
            title="PDF Preview"
          />
        )}
      </Modal>
    </div>
  );
};

// ─── Tab definition ───────────────────────────────────────────────────────────
interface TabDef { key: string; label: string; }

// ─── Main Component (Tab Wrapper) ─────────────────────────────────────────────
const AccountAnalysisV2: React.FC = () => {
  const [tabs, setTabs]       = useState<TabDef[]>([
    { key: 'tb',   label: 'Trial Balance'    },
    { key: 'aa-0', label: 'Account Analysis' },
  ]);
  const [activeKey, setActiveKey] = useState('aa-0');
  const nextKeyRef = useRef(1);

  const addAnalysisTab = () => {
    const key = `aa-${nextKeyRef.current++}`;
    setTabs(prev => [...prev, { key, label: 'Account Analysis' }]);
    setActiveKey(key);
  };

  const onEdit = (
    targetKey: React.MouseEvent | React.KeyboardEvent | string,
    action: 'add' | 'remove'
  ) => {
    if (action === 'remove' && typeof targetKey === 'string' && targetKey !== 'tb') {
      setTabs(prev => {
        const next = prev.filter(t => t.key !== targetKey);
        if (activeKey === targetKey) {
          setActiveKey(next[next.length - 1]?.key || 'tb');
        }
        return next;
      });
    }
  };

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        <div style={{ padding: '12px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/gl">General Ledger</Link> },
            { title: 'Account Analysis V2' },
          ]} />
        </div>

        <div style={{ padding: '0 24px' }}>
          <Tabs
            type="editable-card"
            hideAdd
            activeKey={activeKey}
            onChange={setActiveKey}
            onEdit={onEdit}
            tabBarExtraContent={{
              right: (
                <Button
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={addAnalysisTab}
                  style={{ margin: '8px 0 8px 8px', background: REDWOOD.info, borderColor: REDWOOD.info }}>
                  New Analysis
                </Button>
              ),
            }}
            items={tabs.map(tab => ({
              key: tab.key,
              label: tab.key === 'tb'
                ? <Space size={4}><BarChartOutlined />Trial Balance</Space>
                : <Space size={4}><BookOutlined />Account Analysis</Space>,
              closable: tab.key !== 'tb',
              children: tab.key === 'tb' ? <TBPanel /> : <AAPanel />,
            }))}
          />
        </div>
      </Content>

      <style>{`
        .aa-v2-grid .ant-table-tbody > tr.aa-totals-row > td {
          background: #f0f0f0 !important; border-top: 2px solid #d9d9d9 !important; font-weight: 700;
        }
        .aa-v2-grid .ant-table-tbody > tr.aa-opening-row > td { background: #fffbe6 !important; }
        .aa-v2-grid .ant-table-tbody > tr.aa-closing-row > td { background: #f6ffed !important; }
        .aa-v2-subgrid .ant-table { background: #fafafa; }
        .aa-v2-subgrid .ant-table-thead > tr > th { background: #f0f0f0 !important; font-size: 10px; }
      `}</style>
    </Layout>
  );
};

export default AccountAnalysisV2;
