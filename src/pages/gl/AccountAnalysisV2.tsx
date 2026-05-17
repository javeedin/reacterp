import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layout, Typography, Card, Breadcrumb, Space, Select, Input,
  Button, Table, Tag, Spin, Tooltip, message, Switch, Row, Col,
  Divider, Badge, Modal,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, SearchOutlined, ClearOutlined,
  FileExcelOutlined, AuditOutlined, ReloadOutlined,
  ApiOutlined, CopyOutlined, BookOutlined, DownOutlined,
  FilterOutlined, PlusOutlined, CloseOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const { Content } = Layout;
const { Text } = Typography;
const { Option } = Select;

// ─── Constants ────────────────────────────────────────────────────────────────
const API_BASE         = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/gl';
const APEX_BASE        = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp';
const COMPANY_LOV_URL  = `${APEX_BASE}/valuesets/getvalues/BUIMERC_FIN_GLB_COA_CO`;
const ACCOUNTS_LOV_URL = `${APEX_BASE}/glaccountslist`;

const REDWOOD = {
  primary: '#C74634', success: '#1D7B4D', warning: '#D4A800',
  info: '#0572CE', neutral100: '#F7F7F7', neutral200: '#E5E5E5',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

const MONTH_MAP: Record<string, number> = {
  Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6,
  Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12,
};
const parsePeriod = (p: string): number => {
  const [m, y] = p.split('-');
  return (2000 + parseInt(y || '0', 10)) * 100 + (MONTH_MAP[m] ?? 0);
};

// ─── Segment definitions ──────────────────────────────────────────────────────
interface SegmentDef {
  key: string;         // API param name
  label: string;       // display name
  color: string;       // tag colour
  valueKey: string;    // key in segmentValues map
}
const SEGMENT_DEFS: SegmentDef[] = [
  { key: 'company',      label: 'Company',         color: 'blue',    valueKey: 'companies'      },
  { key: 'lob',          label: 'LOB',             color: 'cyan',    valueKey: 'lobs'           },
  { key: 'department',   label: 'Department',      color: 'purple',  valueKey: 'departments'    },
  { key: 'sub_account',  label: 'Sub-Account',     color: 'orange',  valueKey: 'subAccounts'    },
  { key: 'analysis',     label: 'Analysis',        color: 'geekblue',valueKey: 'analyses'       },
  { key: 'intercompany', label: 'Intercompany',    color: 'magenta', valueKey: 'intercompanies' },
  { key: 'je_source',    label: 'Journal Source',  color: 'volcano', valueKey: 'sources'        },
  { key: 'je_category',  label: 'Journal Category',color: 'gold',   valueKey: 'categories'     },
];

// ─── Interfaces ───────────────────────────────────────────────────────────────
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

// ─── ClickField helper (company/account picker trigger) ───────────────────────
const ClickField: React.FC<{
  label: string; placeholder: string; onClick: () => void; onClear?: () => void;
}> = ({ label, placeholder, onClick, onClear }) => (
  <div style={{ display: 'flex', gap: 4 }}>
    <div
      onClick={onClick}
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
interface AccountPickerProps {
  open: boolean; onClose: () => void;
  onSelect: (account: string, description: string) => void;
  options: AccountOption[]; loading: boolean;
}
const AccountPicker: React.FC<AccountPickerProps> = ({ open, onClose, onSelect, options, loading }) => {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    if (!q.trim()) return options;
    const lq = q.toLowerCase();
    return options.filter(o => o.account.toLowerCase().includes(lq) || o.description.toLowerCase().includes(lq));
  }, [options, q]);
  const typeColor: Record<string, string> = { A: 'gold', L: 'volcano', E: 'green', R: 'blue', O: 'purple' };
  const typeLabel: Record<string, string> = { A: 'Asset', L: 'Liability', E: 'Expense', R: 'Revenue', O: 'OE' };
  return (
    <Modal open={open} onCancel={() => { onClose(); setQ(''); }} footer={null}
      title={<Space><SearchOutlined style={{ color: REDWOOD.info }} />Select Account</Space>} width={640}>
      <Input prefix={<SearchOutlined />} placeholder="Search code or description…" allowClear size="small"
        value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 8 }} autoFocus />
      <div
        onClick={() => { onSelect('', ''); onClose(); setQ(''); }}
        style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: `1px solid ${REDWOOD.neutral200}`,
          background: '#fafafa', fontSize: 12, color: REDWOOD.neutral600 }}
        onMouseEnter={e => (e.currentTarget.style.background = '#e6f4ff')}
        onMouseLeave={e => (e.currentTarget.style.background = '#fafafa')}
      >— All Accounts —</div>
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 24, textAlign: 'center' }}><Spin size="small" /></div>}
        {!loading && filtered.map(o => (
          <div key={o.account} onClick={() => { onSelect(o.account, o.description); onClose(); setQ(''); }}
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
interface SegmentPickerProps {
  open: boolean;
  onClose: () => void;
  segmentValues: Record<string, string[]>;
  companyOptions: { value: string; meaning: string }[];
  existing: Record<string, string>;
  onAdd: (key: string, value: string, label?: string) => void;
  loading: boolean;
}
const SegmentPicker: React.FC<SegmentPickerProps> = ({
  open, onClose, segmentValues, companyOptions, existing, onAdd, loading,
}) => {
  const [selectedSeg, setSelectedSeg] = useState<SegmentDef | null>(null);
  const [q, setQ] = useState('');

  const getValues = (seg: SegmentDef): { value: string; label: string }[] => {
    if (seg.key === 'company') {
      return companyOptions.map(c => ({ value: c.value, label: `${c.value} – ${c.meaning}` }));
    }
    return (segmentValues[seg.valueKey] || []).map(v => ({ value: v, label: v }));
  };

  const values = selectedSeg ? getValues(selectedSeg) : [];
  const filtered = q.trim()
    ? values.filter(v => v.label.toLowerCase().includes(q.toLowerCase()))
    : values;

  const handleSegClick = (seg: SegmentDef) => {
    setSelectedSeg(seg); setQ('');
  };
  const handleValueClick = (val: string, label?: string) => {
    if (selectedSeg) {
      onAdd(selectedSeg.key, val, label);
      setSelectedSeg(null); setQ('');
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => { onClose(); setSelectedSeg(null); setQ(''); }}
      footer={null}
      title={<Space><FilterOutlined style={{ color: REDWOOD.info }} />
        {selectedSeg ? (
          <Space>
            <Button size="small" type="text" icon={<CloseOutlined />}
              onClick={() => { setSelectedSeg(null); setQ(''); }}
              style={{ padding: '0 4px' }} />
            <span>{selectedSeg.label} — Choose Value</span>
          </Space>
        ) : 'Add Segment Filter'}
      </Space>}
      width={560}
    >
      {!selectedSeg ? (
        // Step 1: choose segment
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
            Select a segment to filter by:
          </Text>
          {loading && <div style={{ padding: 24, textAlign: 'center' }}><Spin size="small" /></div>}
          <Row gutter={[8, 8]}>
            {SEGMENT_DEFS.map(seg => (
              <Col key={seg.key} xs={12} sm={8}>
                <div
                  onClick={() => handleSegClick(seg)}
                  style={{
                    padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${existing[seg.key] ? REDWOOD.info : REDWOOD.neutral200}`,
                    background: existing[seg.key] ? '#e6f4ff' : REDWOOD.surface,
                    display: 'flex', flexDirection: 'column', gap: 4,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = REDWOOD.info)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = existing[seg.key] ? REDWOOD.info : REDWOOD.neutral200)}
                >
                  <Tag color={seg.color} style={{ fontSize: 10, margin: 0, width: 'fit-content' }}>{seg.label}</Tag>
                  {existing[seg.key] && (
                    <Text style={{ fontSize: 11, color: REDWOOD.info }}>✓ {existing[seg.key]}</Text>
                  )}
                  {!existing[seg.key] && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {(segmentValues[seg.valueKey] || []).length || (seg.key === 'company' ? companyOptions.length : 0)} values
                    </Text>
                  )}
                </div>
              </Col>
            ))}
          </Row>
        </div>
      ) : (
        // Step 2: choose value
        <div>
          <Input prefix={<SearchOutlined />} placeholder={`Search ${selectedSeg.label} values…`}
            allowClear size="small" value={q} onChange={e => setQ(e.target.value)}
            style={{ marginBottom: 8 }} autoFocus />
          {/* Clear filter option */}
          {existing[selectedSeg.key] && (
            <div
              onClick={() => { onAdd(selectedSeg.key, '', ''); setSelectedSeg(null); setQ(''); }}
              style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: `1px solid ${REDWOOD.neutral200}`,
                background: '#fff7e6', fontSize: 12, color: '#d46b08', fontWeight: 500 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#ffe7ba')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff7e6')}
            >✕ Clear filter for {selectedSeg.label}</div>
          )}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: REDWOOD.neutral600 }}>No values found</div>
            )}
            {filtered.map(v => (
              <div key={v.value}
                onClick={() => handleValueClick(v.value, v.label)}
                style={{
                  padding: '8px 12px', cursor: 'pointer', borderBottom: `1px solid ${REDWOOD.neutral200}`,
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: existing[selectedSeg.key] === v.value ? '#e6f4ff' : '',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#e6f4ff')}
                onMouseLeave={e => (e.currentTarget.style.background = existing[selectedSeg.key] === v.value ? '#e6f4ff' : '')}
              >
                {selectedSeg.key === 'company' ? (
                  <>
                    <Tag color="blue" style={{ fontSize: 11, minWidth: 56, textAlign: 'center', margin: 0 }}>
                      {v.value}
                    </Tag>
                    <Text style={{ fontSize: 12 }}>{v.label.split(' – ')[1]}</Text>
                  </>
                ) : (
                  <Text style={{ fontSize: 12 }}>{v.label}</Text>
                )}
                {existing[selectedSeg.key] === v.value && (
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

// ─── Main Component ───────────────────────────────────────────────────────────
const AccountAnalysisV2: React.FC = () => {
  // ── Parameters ──────────────────────────────────────────────────────────────
  const [ledger, setLedger]               = useState('');
  const [ledgerOptions, setLedgerOptions] = useState<string[]>([]);
  const [ledgersLoading, setLedgersLoading] = useState(false);

  const [periods, setPeriods]             = useState<string[]>([]);
  const [allPeriods, setAllPeriods]       = useState<string[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);

  const [account, setAccount]             = useState('');
  const [accountDesc, setAccountDesc]     = useState('');
  const [accountOptions, setAccountOptions]   = useState<AccountOption[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);

  // segment filters: { company: '101', lob: 'RETAIL', ... }
  const [segFilters, setSegFilters]       = useState<Record<string, string>>({});
  // labels for display (company has "101 – Name" style)
  const [segLabels, setSegLabels]         = useState<Record<string, string>>({});

  // segment LOV data
  const [segmentValues, setSegmentValues] = useState<Record<string, string[]>>({
    companies: [], lobs: [], departments: [], subAccounts: [],
    analyses: [], intercompanies: [], sources: [], categories: [],
  });
  const [companyOptions, setCompanyOptions] = useState<{ value: string; meaning: string }[]>([]);
  const [segValuesLoading, setSegValuesLoading] = useState(false);
  const [segPickerOpen, setSegPickerOpen] = useState(false);

  // ── Grid state ──────────────────────────────────────────────────────────────
  const [loading, setLoading]             = useState(false);
  const [rows, setRows]                   = useState<JournalLine[]>([]);
  const [hasSearched, setHasSearched]     = useState(false);
  const [showEntered, setShowEntered]     = useState(false);
  const [gridSearch, setGridSearch]       = useState('');
  const [functionalCcy, setFunctionalCcy] = useState('AED');

  // ── Balance state ────────────────────────────────────────────────────────────
  const [openingBal, setOpeningBal] = useState<{ acc: number; ent: number } | null>(null);
  const [closingBal, setClosingBal] = useState<{ acc: number; ent: number } | null>(null);

  // ── API modal ────────────────────────────────────────────────────────────────
  const [apiUrl, setApiUrl]               = useState('');
  const [apiModalOpen, setApiModalOpen]   = useState(false);

  // ── Load ledgers ─────────────────────────────────────────────────────────────
  useEffect(() => {
    setLedgersLoading(true);
    fetch(`${API_BASE}/getledgername`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const names: string[] = [
          ...new Set((data.items || []).map((i: any) => i.ledger_name).filter(Boolean) as string[]),
        ];
        setLedgerOptions(names);
        if (names.length > 0) setLedger(names[0]);
      })
      .catch(() => {})
      .finally(() => setLedgersLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load segment values (lazy: when picker opens, or when ledger changes) ────
  const loadSegmentValues = useCallback(async (ldg: string) => {
    if (!ldg) return;
    setSegValuesLoading(true);
    try {
      // company LOV
      const compRes = await fetch(COMPANY_LOV_URL);
      if (compRes.ok) {
        const cd = await compRes.json();
        setCompanyOptions((cd.items || []).map((i: any) => ({
          value: i.value || i.VALUE || '',
          meaning: i.meaning || i.MEANING || '',
        })).filter((c: any) => c.value));
      }
      // other segments
      const segRes = await fetch(`${API_BASE}/segment-values?ledger_name=${encodeURIComponent(ldg)}`);
      if (segRes.ok) {
        const sd = await segRes.json();
        setSegmentValues(prev => ({
          ...prev,
          lobs:           sd.lobs           || [],
          departments:    sd.departments    || [],
          subAccounts:    sd.subAccounts    || [],
          analyses:       sd.analyses       || [],
          intercompanies: sd.intercompanies || [],
          sources:        sd.sources        || [],
          categories:     sd.categories     || [],
        }));
      }
    } catch { /* silent */ } finally {
      setSegValuesLoading(false);
    }
  }, []);

  // reload segments when ledger changes (needed for value counts in picker)
  useEffect(() => { if (ledger) loadSegmentValues(ledger); }, [ledger, loadSegmentValues]);

  // ── Load periods ─────────────────────────────────────────────────────────────
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
    } catch { /* silent */ } finally {
      setPeriodsLoading(false);
    }
  }, []);

  useEffect(() => { if (ledger) loadPeriods(ledger); }, [ledger, loadPeriods]);

  // ── Load account LOV (lazy) ──────────────────────────────────────────────────
  const loadAccounts = useCallback(async () => {
    if (accountOptions.length > 0) return;
    setAccountsLoading(true);
    try {
      const res = await fetch(ACCOUNTS_LOV_URL);
      if (!res.ok) return;
      const data = await res.json();
      setAccountOptions((data.items || []).map((i: any) => ({
        account:      i.account      || i.ACCOUNT      || '',
        description:  i.description  || i.DESCRIPTION  || '',
        account_type: i.account_type || i.ACCOUNT_TYPE || '',
      })).filter((i: AccountOption) => i.account));
    } catch { /* silent */ } finally {
      setAccountsLoading(false);
    }
  }, [accountOptions.length]);

  // ── Fetch opening/closing balance ────────────────────────────────────────────
  const fetchBalanceRow = useCallback(async (acct: string, co: string, period: string, isOpen: boolean) => {
    const p = new URLSearchParams({ ledger_name: ledger, period_name: period, account: acct });
    if (co) p.set('company', co);
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
    const acc = toDrCr(accAmt);
    const ent = toDrCr(entAmt);
    return {
      key: isOpen ? 'opening-balance' : 'closing-balance',
      concatenatedSegments: acct,
      accountDescription: items[0].account_desc || '',
      jeLineDescription: isOpen ? 'Opening Balance' : 'Closing Balance',
      defaultPeriodName: period, accountingDate: '', batchName: '',
      userJeSourceName: '', userJeCategoryName: '',
      currencyCode: items[0].currency_code || 'AED',
      enteredDr: ent.dr, enteredCr: ent.cr,
      accountedDr: acc.dr, accountedCr: acc.cr,
      jeHeaderId: 0, isOpeningBalance: isOpen, isClosingBalance: !isOpen,
    } as JournalLine;
  }, [ledger]);

  // ── Search ───────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    if (!periods.length) { message.warning('Select at least one period'); return; }
    setLoading(true); setHasSearched(true); setRows([]);
    setOpeningBal(null); setClosingBal(null);
    try {
      const p = new URLSearchParams({ ledger_name: ledger });
      p.set('period_names', periods.join(','));
      if (account) p.set('account', account);
      // append all segment filters
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
            const combo =
              item.accountCombination ||
              item.account_combination ||
              item.concatenatedSegments ||
              (item.company
                ? [item.company, item.lob, item.department, item.account,
                   item.subAccount || item.sub_account, item.analysis, item.intercompany]
                   .filter(Boolean).join('-')
                : '');
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
            } as JournalLine];
          });
        }
      } catch { /* treat as empty */ }

      const sortedPeriods = [...periods].sort((a, b) => parsePeriod(a) - parsePeriod(b));
      let openRow: JournalLine | null = null;
      let closeRow: JournalLine | null = null;
      if (account && sortedPeriods.length) {
        const co = segFilters['company'] || '';
        [openRow, closeRow] = await Promise.all([
          fetchBalanceRow(account, co, sortedPeriods[0], true),
          fetchBalanceRow(account, co, sortedPeriods[sortedPeriods.length - 1], false),
        ]);
      }

      const allRows: JournalLine[] = [
        ...(openRow  ? [openRow]  : []),
        ...items,
        ...(closeRow ? [closeRow] : []),
      ];
      if (openRow)  setOpeningBal({ acc: openRow.accountedDr  - openRow.accountedCr,  ent: openRow.enteredDr  - openRow.enteredCr  });
      if (closeRow) setClosingBal({ acc: closeRow.accountedDr - closeRow.accountedCr, ent: closeRow.enteredDr - closeRow.enteredCr });
      setRows(allRows);
      message.success(`${allRows.length} records loaded`);
    } catch (e: any) {
      message.error(`Search failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [ledger, periods, account, segFilters, fetchBalanceRow]);

  // ── Segment filter helpers ───────────────────────────────────────────────────
  const addSegFilter = (key: string, value: string, label?: string) => {
    setSegFilters(prev => {
      const next = { ...prev };
      if (value) next[key] = value; else delete next[key];
      return next;
    });
    setSegLabels(prev => {
      const next = { ...prev };
      if (value && label) next[key] = label; else delete next[key];
      return next;
    });
  };

  const removeSegFilter = (key: string) => {
    setSegFilters(prev => { const n = { ...prev }; delete n[key]; return n; });
    setSegLabels(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  // ── Derived data ─────────────────────────────────────────────────────────────
  const dataRows = useMemo(() => rows.filter(r => !r.isClosingBalance), [rows]);
  const filteredData = useMemo(() => {
    if (!gridSearch.trim()) return dataRows;
    const q = gridSearch.toLowerCase();
    return dataRows.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q)));
  }, [dataRows, gridSearch]);

  const runningBals = useMemo(() => {
    let accRun = 0; let entRun = 0;
    return filteredData.map(r => {
      accRun += (r.accountedDr || 0) - (r.accountedCr || 0);
      entRun += (r.enteredDr   || 0) - (r.enteredCr   || 0);
      return { acc: accRun, ent: entRun };
    });
  }, [filteredData]);

  const ptdTotals = useMemo(() => filteredData
    .filter(r => !r.isOpeningBalance && !r.isClosingBalance)
    .reduce((acc, r) => ({
      accDr: acc.accDr + r.accountedDr, accCr: acc.accCr + r.accountedCr,
      entDr: acc.entDr + r.enteredDr,   entCr: acc.entCr + r.enteredCr,
    }), { accDr: 0, accCr: 0, entDr: 0, entCr: 0 }),
  [filteredData]);

  const gridTotals = useMemo(() => filteredData
    .reduce((acc, r) => ({
      accDr: acc.accDr + r.accountedDr, accCr: acc.accCr + r.accountedCr,
      entDr: acc.entDr + r.enteredDr,   entCr: acc.entCr + r.enteredCr,
    }), { accDr: 0, accCr: 0, entDr: 0, entCr: 0 }),
  [filteredData]);

  const finalRunning = runningBals[runningBals.length - 1] ?? { acc: 0, ent: 0 };

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

  // ── Columns ──────────────────────────────────────────────────────────────────
  const columns = useMemo((): ColumnsType<JournalLine> => {
    const isTot     = (r: JournalLine) => !!r.isTotals;
    const isSpecial = (r: JournalLine) => !!(r.isOpeningBalance || r.isClosingBalance || r.isTotals);

    const enteredCols: ColumnsType<JournalLine> = showEntered ? [
      {
        title: <span style={{ color: '#52c41a', fontWeight: 600 }}>Ent Dr</span>,
        dataIndex: 'enteredDr', key: 'entDr', width: 130, align: 'right',
        render: (v: number, r: JournalLine) => (
          <span style={{ fontSize: 10, color: v > 0 ? REDWOOD.success : undefined, fontWeight: isTot(r) ? 700 : undefined }}>
            {v > 0 ? fmtN(v) : ''}
          </span>
        ),
      },
      {
        title: <span style={{ color: '#52c41a', fontWeight: 600 }}>Ent Cr</span>,
        dataIndex: 'enteredCr', key: 'entCr', width: 130, align: 'right',
        render: (v: number, r: JournalLine) => (
          <span style={{ fontSize: 10, color: v > 0 ? REDWOOD.primary : undefined, fontWeight: isTot(r) ? 700 : undefined }}>
            {v > 0 ? fmtN(v) : ''}
          </span>
        ),
      },
      {
        title: <span style={{ color: '#52c41a', fontWeight: 600 }}>Ent Balance</span>,
        key: 'entBal', width: 140, align: 'right',
        render: (_: any, record: JournalLine, index: number) => {
          if (isTot(record)) return <FmtBal v={record._entBal ?? 0} size={10} />;
          const v = runningBals[index]?.ent ?? 0;
          return v < 0
            ? <span style={{ fontSize: 10, color: REDWOOD.primary, fontWeight: isSpecial(record) ? 700 : undefined }}>{fmtN(Math.abs(v))} Cr</span>
            : <span style={{ fontSize: 10, color: REDWOOD.success, fontWeight: isSpecial(record) ? 700 : undefined }}>{fmtN(v)}</span>;
        },
      },
    ] : [];

    return [
      {
        title: 'Account', dataIndex: 'concatenatedSegments', key: 'account',
        width: 220, fixed: 'left', ellipsis: true,
        render: (_text: string, record: JournalLine) => {
          if (isTot(record)) return <Text strong style={{ fontSize: 11 }}>Total for Report</Text>;
          if (record.isOpeningBalance) return <Text strong style={{ fontSize: 10, color: REDWOOD.warning }}>Opening Balance</Text>;
          if (record.isClosingBalance) return <Text strong style={{ fontSize: 10, color: REDWOOD.success }}>Closing Balance</Text>;
          return <Text style={{ fontSize: 10, color: REDWOOD.info }}>{_text || '—'}</Text>;
        },
      },
      {
        title: 'Line Description', dataIndex: 'jeLineDescription', key: 'lineDesc', width: 200, ellipsis: true,
        render: (text: string, record: JournalLine) =>
          isTot(record) ? null : (
            <Tooltip title={text}>
              <span style={{ fontSize: 10, fontWeight: isSpecial(record) ? 600 : undefined }}>{text || '—'}</span>
            </Tooltip>
          ),
      },
      {
        title: 'Period', dataIndex: 'defaultPeriodName', key: 'period', width: 80,
        render: (v: string, r: JournalLine) => isTot(r) ? null : <span style={{ fontSize: 10 }}>{v}</span>,
      },
      {
        title: 'Acctg Date', dataIndex: 'accountingDate', key: 'acctgDate', width: 100,
        render: (v: string, r: JournalLine) => isTot(r) ? null : <span style={{ fontSize: 10 }}>{(v || '').slice(0, 10)}</span>,
      },
      {
        title: 'Batch', dataIndex: 'batchName', key: 'batch', width: 160, ellipsis: true,
        render: (v: string, r: JournalLine) => isTot(r) ? null : <span style={{ fontSize: 10 }}>{v}</span>,
      },
      {
        title: 'Source', dataIndex: 'userJeSourceName', key: 'source', width: 110,
        render: (v: string, r: JournalLine) => isTot(r) ? null : <span style={{ fontSize: 10 }}>{v}</span>,
      },
      {
        title: 'Category', dataIndex: 'userJeCategoryName', key: 'category', width: 120,
        render: (v: string, r: JournalLine) => isTot(r) ? null : <span style={{ fontSize: 10 }}>{v}</span>,
      },
      {
        title: 'Currency', dataIndex: 'currencyCode', key: 'currency', width: 80,
        render: (v: string, r: JournalLine) => isTot(r) ? null : <Tag style={{ fontSize: 9 }}>{v}</Tag>,
      },
      // Entered first
      ...enteredCols,
      // Accounted
      {
        title: <span style={{ color: REDWOOD.info, fontWeight: 600 }}>Acc Dr ({functionalCcy})</span>,
        dataIndex: 'accountedDr', key: 'accDr', width: 150, align: 'right',
        render: (v: number, r: JournalLine) => (
          <span style={{ fontSize: 10, color: v > 0 ? REDWOOD.success : undefined, fontWeight: isTot(r) ? 700 : undefined }}>
            {v > 0 ? fmtN(v) : ''}
          </span>
        ),
      },
      {
        title: <span style={{ color: REDWOOD.info, fontWeight: 600 }}>Acc Cr ({functionalCcy})</span>,
        dataIndex: 'accountedCr', key: 'accCr', width: 150, align: 'right',
        render: (v: number, r: JournalLine) => (
          <span style={{ fontSize: 10, color: v > 0 ? REDWOOD.primary : undefined, fontWeight: isTot(r) ? 700 : undefined }}>
            {v > 0 ? fmtN(v) : ''}
          </span>
        ),
      },
      {
        title: <span style={{ color: REDWOOD.info, fontWeight: 600 }}>Acc Balance ({functionalCcy})</span>,
        key: 'accBal', width: 160, align: 'right',
        render: (_: any, record: JournalLine, index: number) => {
          if (isTot(record)) return <FmtBal v={record._accBal ?? 0} size={10} />;
          const v = runningBals[index]?.acc ?? 0;
          return v < 0
            ? <span style={{ fontSize: 10, color: REDWOOD.primary, fontWeight: isSpecial(record) ? 700 : undefined }}>{fmtN(Math.abs(v))} Cr</span>
            : <span style={{ fontSize: 10, color: REDWOOD.success, fontWeight: isSpecial(record) ? 700 : undefined }}>{fmtN(v)}</span>;
        },
      },
      {
        title: '', key: 'drill', width: 36, fixed: 'right',
        render: (_: any, record: JournalLine) =>
          isTot(record) ? null : (
            <Tooltip title={`Journal ${record.jeHeaderId}`}>
              <Button type="text" size="small"
                icon={<AuditOutlined style={{ color: REDWOOD.info, fontSize: 13 }} />} />
            </Tooltip>
          ),
      },
    ];
  }, [showEntered, runningBals, functionalCcy]);

  // ── Export ───────────────────────────────────────────────────────────────────
  const exportExcel = async () => {
    if (!filteredData.length) { message.warning('No data to export'); return; }
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ReactERP'; wb.created = new Date();
    const ws = wb.addWorksheet('Account Analysis');
    const white = { argb: 'FFFFFFFF' };
    const numFmt = '#,##0.00';
    const NCOLS = showEntered ? 16 : 13;
    const mergeFull = (r: number) => ws.mergeCells(r, 1, r, NCOLS);

    const hdrFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC74634' } };
    const fltFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0D6' } };
    const colFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3D3D3D' } };
    const accFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4FF' } };
    const entFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9F7BE' } };
    const totFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    const altFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
    const accHdrFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5FCC' } };
    const entHdrFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF389E0D' } };

    // title
    mergeFull(1);
    const tc = ws.getCell('A1');
    tc.value = 'Account Analysis'; tc.font = { bold: true, size: 13, color: white };
    tc.fill = hdrFill; tc.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 22;

    // filter rows
    const activeSegs = Object.entries(segFilters).map(([k, v]) => {
      const def = SEGMENT_DEFS.find(d => d.key === k);
      return `${def?.label || k}: ${segLabels[k] || v}`;
    });
    const fRows: [string, string][] = [
      ['Ledger',    ledger || '—'],
      ['Account',   account ? `${account}${accountDesc ? ' – ' + accountDesc : ''}` : '—'],
      ['Periods',   periods.length ? periods.join(', ') : '—'],
      ['Filters',   activeSegs.length ? activeSegs.join(' | ') : '—'],
      ['Exported',  new Date().toLocaleString()],
      ['Records',   String(filteredData.length)],
    ];
    let ri = 2;
    for (const [lbl, val] of fRows) {
      ws.mergeCells(ri, 1, ri, 3); ws.mergeCells(ri, 4, ri, NCOLS);
      const lc = ws.getCell(ri, 1); const vc = ws.getCell(ri, 4);
      lc.value = lbl; vc.value = val;
      lc.font = { bold: true, size: 10 }; vc.font = { size: 10 };
      lc.fill = fltFill;
      lc.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      vc.alignment = { horizontal: 'left',  vertical: 'middle', indent: 1 };
      ws.getRow(ri).height = 16; ri++;
    }
    ri++;

    // group header
    ws.getRow(ri).height = 16;
    for (let c = 1; c <= 9; c++) ws.getCell(ri, c).fill = colFill;
    let col = 10;
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
    col += 3;
    ws.getCell(ri, col).fill = colFill;
    ri++;

    // column headers
    const descHdrs = ['Account', 'Account Description', 'Line Description', 'Period', 'Acctg Date', 'Batch', 'Source', 'Category', 'Currency'];
    const entHdrs  = showEntered ? ['Ent Dr', 'Ent Cr', 'Ent Balance'] : [];
    const accHdrs  = [`Acc Dr (${functionalCcy})`, `Acc Cr (${functionalCcy})`, `Acc Balance (${functionalCcy})`];
    const hdrs = [...descHdrs, ...entHdrs, ...accHdrs, 'JE Header ID'];
    const widths = [28, 28, 32, 12, 14, 28, 14, 16, 10, ...(showEntered ? [16, 16, 16] : []), 16, 16, 16, 14];
    const hRow = ws.getRow(ri); hRow.height = 18;
    hdrs.forEach((h, i) => {
      const cell = ws.getCell(ri, i + 1);
      cell.value = h;
      const isEnt = showEntered && i >= 9 && i <= 11;
      const accStart = showEntered ? 12 : 9;
      const isAcc = i >= accStart && i <= accStart + 2;
      cell.fill = isEnt ? entHdrFill : isAcc ? accHdrFill : colFill;
      cell.font = { bold: true, size: 10, color: white };
      cell.alignment = { horizontal: (isEnt || isAcc) ? 'right' : 'left', vertical: 'middle', indent: 1 };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF888888' } } };
      ws.getColumn(i + 1).width = widths[i] || 14;
    });
    ri++;

    // data rows
    let accRun = 0; let entRun = 0;
    const dataStartRow = ri;
    filteredData.forEach((r, idx) => {
      accRun += (r.accountedDr || 0) - (r.accountedCr || 0);
      entRun += (r.enteredDr   || 0) - (r.enteredCr   || 0);
      const isAlt = idx % 2 === 1;
      ws.getRow(ri).height = 15;
      const vals: (string | number)[] = [
        r.concatenatedSegments || '',
        r.accountDescription || '',
        r.jeLineDescription || '',
        r.defaultPeriodName || '',
        (r.accountingDate || '').slice(0, 10),
        r.batchName || '',
        r.userJeSourceName || '',
        r.userJeCategoryName || '',
        r.currencyCode || '',
        ...(showEntered ? [r.enteredDr || 0, r.enteredCr || 0, entRun] : []),
        r.accountedDr || 0, r.accountedCr || 0, accRun,
        r.jeHeaderId,
      ];
      vals.forEach((v, i) => {
        const cell = ws.getCell(ri, i + 1);
        cell.value = v; cell.font = { size: 10 };
        if (isAlt) cell.fill = altFill;
        const isNumeric = i >= 9;
        cell.alignment = { horizontal: isNumeric ? 'right' : 'left', vertical: 'middle', indent: 1 };
        if (isNumeric) cell.numFmt = numFmt;
        const isEntBal = showEntered && i === 11;
        const isAccBal = i === (showEntered ? 14 : 11);
        if (isEntBal || isAccBal) {
          const bal = isEntBal ? entRun : accRun;
          cell.font = { size: 10, bold: true, color: { argb: bal < 0 ? 'FFC41C00' : 'FF237804' } };
        }
      });
      ri++;
    });

    // totals row
    ws.getRow(ri).height = 16;
    ws.mergeCells(ri, 1, ri, 9);
    const tl = ws.getCell(ri, 1);
    tl.value = `Totals  (${filteredData.length} lines)`;
    tl.font = { bold: true, size: 10 }; tl.fill = totFill;
    tl.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    const tVals = showEntered
      ? [gridTotals.entDr, gridTotals.entCr, finalRunning.ent, gridTotals.accDr, gridTotals.accCr, finalRunning.acc]
      : [gridTotals.accDr, gridTotals.accCr, finalRunning.acc];
    tVals.forEach((v, i) => {
      const cell = ws.getCell(ri, 10 + i);
      cell.value = v; cell.font = { bold: true, size: 10 };
      cell.fill = totFill; cell.numFmt = numFmt;
      cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    });
    ws.getCell(ri, 10 + tVals.length).fill = totFill;

    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: dataStartRow - 1 }];
    ws.autoFilter = { from: { row: dataStartRow - 1, column: 1 }, to: { row: ri, column: NCOLS } };

    const buf = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buf], { type: 'application/octet-stream' }), `account_analysis_${new Date().toISOString().slice(0, 10)}.xlsx`);
    message.success('Excel file downloaded');
  };

  // ── Active filter chips ───────────────────────────────────────────────────────
  const activeFilters = Object.entries(segFilters).filter(([, v]) => v);
  const accountLabel = account
    ? `${account}${accountDesc ? ' – ' + accountDesc : ''}`
    : '';

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{ padding: '12px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/gl">General Ledger</Link> },
            { title: 'Account Analysis V2' },
          ]} />
        </div>

        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── Parameter Card ── */}
          <Card size="small"
            styles={{ body: { padding: '14px 16px' } }}
            style={{ borderRadius: 10, border: `1px solid ${REDWOOD.neutral200}`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <BookOutlined style={{ color: REDWOOD.info, fontSize: 16 }} />
              <Text strong style={{ fontSize: 14 }}>Search Parameters</Text>
            </div>

            {/* Row 1: Ledger / Account / Period / Buttons */}
            <Row gutter={[12, 8]} align="bottom">
              {/* Ledger */}
              <Col xs={24} sm={12} md={5}>
                <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 3, fontWeight: 500 }}>
                  Ledger *
                  {ledgersLoading && <ReloadOutlined spin style={{ marginLeft: 4, fontSize: 10 }} />}
                </div>
                <Select value={ledger || undefined} onChange={v => { setLedger(v); setPeriods([]); }}
                  style={{ width: '100%' }} size="small" showSearch loading={ledgersLoading}
                  placeholder={ledgersLoading ? 'Loading…' : 'Select ledger'}>
                  {ledgerOptions.map(l => <Option key={l} value={l}>{l}</Option>)}
                </Select>
              </Col>

              {/* Account */}
              <Col xs={24} sm={12} md={7}>
                <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 3, fontWeight: 500 }}>Account</div>
                <ClickField
                  label={accountLabel} placeholder="All Accounts"
                  onClick={() => { loadAccounts(); setAccountPickerOpen(true); }}
                  onClear={() => { setAccount(''); setAccountDesc(''); }}
                />
              </Col>

              {/* Period(s) */}
              <Col xs={24} sm={12} md={8}>
                <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 3, fontWeight: 500 }}>
                  Period(s) *
                  {periodsLoading && <ReloadOutlined spin style={{ marginLeft: 4, fontSize: 10 }} />}
                </div>
                <Select mode="multiple" value={periods} onChange={setPeriods}
                  style={{ width: '100%' }} size="small" showSearch allowClear
                  placeholder="Select periods" maxTagCount={3} loading={periodsLoading}>
                  {allPeriods.map(p => <Option key={p} value={p}>{p}</Option>)}
                </Select>
              </Col>

              {/* Buttons */}
              <Col xs={24} sm={12} md={4} style={{ display: 'flex', gap: 6 }}>
                <Button type="primary" icon={<SearchOutlined />} size="small" loading={loading}
                  onClick={handleSearch}
                  style={{ background: REDWOOD.info, borderColor: REDWOOD.info, flex: 1 }}>
                  Search
                </Button>
                <Button icon={<ClearOutlined />} size="small" onClick={() => {
                  setRows([]); setHasSearched(false); setPeriods([]);
                  setAccount(''); setAccountDesc('');
                  setSegFilters({}); setSegLabels({});
                }} />
              </Col>
            </Row>

            {/* Row 2: Segment Filters */}
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <Text style={{ fontSize: 11, color: REDWOOD.neutral600, fontWeight: 500 }}>
                <FilterOutlined style={{ marginRight: 4 }} />Segment Filters:
              </Text>

              {/* Active filter chips */}
              {activeFilters.map(([key, val]) => {
                const def = SEGMENT_DEFS.find(d => d.key === key);
                return (
                  <Tag
                    key={key}
                    color={def?.color || 'default'}
                    closable
                    onClose={() => removeSegFilter(key)}
                    style={{ fontSize: 11, margin: 0 }}
                  >
                    <span style={{ opacity: 0.8 }}>{def?.label}: </span>
                    <strong>{segLabels[key] || val}</strong>
                  </Tag>
                );
              })}

              {/* Add filter button */}
              <Button
                size="small" type="dashed" icon={<PlusOutlined />}
                onClick={() => setSegPickerOpen(true)}
                style={{ fontSize: 11, height: 24, color: REDWOOD.info, borderColor: REDWOOD.info }}
              >
                Add Filter
              </Button>

              {activeFilters.length > 0 && (
                <Button size="small" type="text"
                  onClick={() => { setSegFilters({}); setSegLabels({}); }}
                  style={{ fontSize: 11, height: 24, color: REDWOOD.primary }}>
                  Clear All
                </Button>
              )}
            </div>
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
              </Space>
            </div>
          )}

          {/* ── Grid ── */}
          <Spin spinning={loading}>
            {hasSearched && (
              <Table<JournalLine>
                dataSource={tableData} columns={columns} rowKey="key" size="small"
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
                          {item.color
                            ? <Text strong style={{ fontSize: 14, color: item.color }}>{fmtN(item.v)}</Text>
                            : <FmtBal v={item.v} size={14} />}
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
                        {item.color
                          ? <Text strong style={{ fontSize: 14, color: item.color }}>{fmtN(item.v)}</Text>
                          : <FmtBal v={item.v} size={14} />}
                      </Col>
                    ))}
                  </Row>
                </Card>
              </Col>
            </Row>
          )}
        </div>
      </Content>

      {/* Account Picker */}
      <AccountPicker open={accountPickerOpen} onClose={() => setAccountPickerOpen(false)}
        options={accountOptions} loading={accountsLoading}
        onSelect={(val, desc) => { setAccount(val); setAccountDesc(desc); }} />

      {/* Segment Filter Picker */}
      <SegmentPicker
        open={segPickerOpen} onClose={() => setSegPickerOpen(false)}
        segmentValues={segmentValues} companyOptions={companyOptions}
        existing={segFilters} loading={segValuesLoading}
        onAdd={addSegFilter}
      />

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
      </Modal>

      <style>{`
        .aa-v2-grid .ant-table-tbody > tr.aa-totals-row > td {
          background: #f0f0f0 !important; border-top: 2px solid #d9d9d9 !important; font-weight: 700;
        }
        .aa-v2-grid .ant-table-tbody > tr.aa-opening-row > td { background: #fffbe6 !important; }
        .aa-v2-grid .ant-table-tbody > tr.aa-closing-row > td { background: #f6ffed !important; }
      `}</style>
    </Layout>
  );
};

export default AccountAnalysisV2;
