import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Card, Form, Select, Button, Table, Tag, Statistic, Row, Col,
  Space, Typography, Alert, Segmented, Tooltip, Modal, Input, Badge, Spin,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined,
  CheckCircleOutlined, WarningOutlined, CloseCircleOutlined,
  ApiOutlined, CopyOutlined, LockOutlined, BookOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { APEX_DB_CONFIG } from '../../config/api.config';

const { Text } = Typography;
const { Option } = Select;

const APEX_BASE = APEX_DB_CONFIG.baseUrl;

const REDWOOD = {
  primary:    '#C74634',
  success:    '#1D7B4D',
  info:       '#0572CE',
  warning:    '#A86C00',
  error:      '#C74634',
  neutral100: '#F8F8F8',
  neutral200: '#E0E0E0',
  neutral600: '#6B6B6B',
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReconRow {
  sourceTable:     string;
  sourceId:        number;
  apNumber:        string;
  apAmount:        number | null;
  apDate:          string | null;
  apStatus:        string | null;
  apSupplier:      string | null;
  businessUnit:    string;
  apCurrency:      string | null;
  slaCount:        number;
  slaExists:       boolean;
  slaStatus:       string | null;
  slaPeriodName:   string | null;
  ledgerName:      string | null;
  slaCurrency:     string | null;
  slaEnteredDr:    number;
  slaEnteredCr:    number;
  slaLineCount:    number;
  glCount:         number;
  glExists:        boolean;
  glHeaderId:      number | null;
  glJournalName:   string | null;
  glBatchStatus:   string | null;
  glEnteredDr:     number;
  glEnteredCr:     number;
  glDrAccount:     string | null;
  glCrAccount:     string | null;
  apVsSlaDiff:     number;
  slaVsGlDiff:     number;
  apMatchesSla:    boolean;
  slaMatchesGl:    boolean;
  isFullyBalanced: boolean;
}

interface Summary {
  totalRows:       number;
  apTotalDr:       number;
  slaTotalDr:      number;
  glTotalDr:       number;
  apVsSlaDiff:     number;
  slaVsGlDiff:     number;
  noSlaCount:      number;
  noGlCount:       number;
  isFullyBalanced: boolean;
}

interface BUOption {
  name:    string;
  company: string;
}

interface PeriodInfo {
  period_name_id: string;
  period_year:    number;
  period_number:  number;
}

interface AccountOption {
  account:     string;
  description: string;
}

const SOURCE_TABLE_OPTIONS = [
  { value: 'AP_INVOICES',                label: 'AP Invoices' },
  { value: 'AP_PAYMENTS',                label: 'AP Payments' },
  { value: 'RR_BANK_ACCOUNT_TRANSFERS',  label: 'Bank Transfers' },
];

const STATUS_OPTIONS = [
  { value: 'DRAFT',  label: 'Draft' },
  { value: 'FINAL',  label: 'Final' },
  { value: 'POSTED', label: 'Posted' },
  { value: 'ERROR',  label: 'Error' },
];

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? '–' : n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

function StatusTick({ exists, tooltip }: { exists: boolean; tooltip?: string }) {
  const icon = exists
    ? <CheckCircleOutlined style={{ color: REDWOOD.success, fontSize: 16 }} />
    : <CloseCircleOutlined style={{ color: REDWOOD.error,   fontSize: 16 }} />;
  return tooltip ? <Tooltip title={tooltip}>{icon}</Tooltip> : icon;
}

// ── AccountPicker modal (same UX as Account Analysis) ─────────────────────────
const AccountPicker: React.FC<{
  open: boolean;
  onClose: () => void;
  onSelect: (account: string, description: string) => void;
  options: AccountOption[];
  loading: boolean;
}> = ({ open, onClose, onSelect, options, loading }) => {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const lq = q.toLowerCase();
    return q
      ? options.filter(o => o.account.toLowerCase().includes(lq) || o.description.toLowerCase().includes(lq))
      : options;
  }, [options, q]);
  const close = () => { onClose(); setQ(''); };
  return (
    <Modal open={open} onCancel={close} footer={null}
      title={<Space><SearchOutlined style={{ color: REDWOOD.info }} />Select Account</Space>} width={640}>
      <Input prefix={<SearchOutlined />} placeholder="Search code or description…"
        allowClear size="small" value={q} onChange={e => setQ(e.target.value)}
        style={{ marginBottom: 8 }} autoFocus />
      <div onClick={() => { onSelect('', ''); close(); }}
        style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: `1px solid ${REDWOOD.neutral200}`,
          background: '#fafafa', fontSize: 12, color: REDWOOD.neutral600 }}
        onMouseEnter={e => (e.currentTarget.style.background = '#e6f4ff')}
        onMouseLeave={e => (e.currentTarget.style.background = '#fafafa')}>
        — All Accounts —
      </div>
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 24, textAlign: 'center' }}><Spin size="small" /></div>}
        {!loading && filtered.map(o => (
          <div key={o.account} onClick={() => { onSelect(o.account, o.description); close(); }}
            style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex', gap: 10, alignItems: 'center' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#e6f4ff')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}>
            <Text code style={{ fontSize: 11, minWidth: 130 }}>{o.account}</Text>
            <Text style={{ fontSize: 12, flex: 1 }}>{o.description}</Text>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: REDWOOD.neutral600 }}>No accounts found</div>
        )}
      </div>
    </Modal>
  );
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function APGLReconcile() {
  const [form] = Form.useForm();

  // ── BU / company ─────────────────────────────────────────────────────────────
  const [buObjects, setBuObjects]     = useState<BUOption[]>([]);
  const [buLoading, setBuLoading]     = useState(false);
  const [company, setCompany]         = useState('');
  const [companyLocked, setCompanyLocked] = useState(false);

  // ── Periods / calendar ────────────────────────────────────────────────────────
  const [allPeriods, setAllPeriods]       = useState<PeriodInfo[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [selectedYear, setSelectedYear]   = useState<number | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState('');

  // ── Account LOV ───────────────────────────────────────────────────────────────
  const [accountOptions, setAccountOptions]   = useState<AccountOption[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedAccountDesc, setSelectedAccountDesc] = useState('');

  // ── Grid state ────────────────────────────────────────────────────────────────
  const [rows, setRows]                   = useState<ReconRow[]>([]);
  const [summary, setSummary]             = useState<Summary | null>(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [filter, setFilter]               = useState<'ALL' | 'OK' | 'MISSING_SLA' | 'MISSING_GL' | 'GAP'>('ALL');
  const [lastCalledUrl, setLastCalledUrl] = useState<string>('');
  const [apiModalOpen, setApiModalOpen]   = useState(false);

  // ── BU API debug modal ────────────────────────────────────────────────────────
  const [buDebugOpen, setBuDebugOpen]       = useState(false);
  const [buRawItems, setBuRawItems]         = useState<any[]>([]);
  const [buDebugLoading, setBuDebugLoading] = useState(false);

  const openBuDebug = useCallback(async () => {
    setBuDebugOpen(true);
    if (buRawItems.length > 0) return;
    setBuDebugLoading(true);
    try {
      const res  = await fetch(`${APEX_BASE}/gl/businessunits`);
      const data = await res.json();
      setBuRawItems(data.items ?? []);
    } catch { /* silent */ } finally { setBuDebugLoading(false); }
  }, [buRawItems.length]);

  // ── Load business units on mount ──────────────────────────────────────────────
  useEffect(() => {
    setBuLoading(true);
    fetch(`${APEX_BASE}/gl/businessunits`)
      .then(r => r.json())
      .then(data => {
        const items: BUOption[] = (data.items ?? [])
          .filter((i: any) => i.business_unit_name || i.BUSINESS_UNIT_NAME)
          .map((i: any) => ({
            name: String(i.business_unit_name || i.BUSINESS_UNIT_NAME || ''),
            // try every casing / naming the APEX endpoint may use
            company: String(
              i.company      || i.COMPANY      ||
              i.company_code || i.COMPANY_CODE ||
              i.companyCode  || i.COMPANY_ID   ||
              ''
            ),
          }));
        setBuObjects(items);
      })
      .catch(() => {})
      .finally(() => setBuLoading(false));
  }, []);

  // ── Load periods via ledger (calendar webservice) on mount ────────────────────
  useEffect(() => {
    setPeriodsLoading(true);
    fetch(`${APEX_BASE}/gl/getledgername`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const ledgers: string[] = (data.items || []).map((i: any) => i.ledger_name).filter(Boolean);
        if (!ledgers.length) return;
        return fetch(`${APEX_BASE}/periodsstatus/create?ledger_name=${encodeURIComponent(ledgers[0])}`)
          .then(r => r.ok ? r.json() : null)
          .then(pd => {
            if (!pd) return;
            const items: PeriodInfo[] = (pd.items || [])
              .filter((i: any) => i.period_year && (i.period_name_id || i.period_name))
              .map((i: any) => ({
                period_name_id: String(i.period_name_id || i.period_name),
                period_year:    Number(i.period_year),
                period_number:  Number(i.period_number || 0),
              }));
            setAllPeriods(items);
            if (!items.length) return;
            const latestYear = Math.max(...items.map(p => p.period_year));
            setSelectedYear(latestYear);
            const inYear = items
              .filter(p => p.period_year === latestYear)
              .sort((a, b) => b.period_number - a.period_number);
            if (inYear.length) setSelectedPeriod(inYear[0].period_name_id);
          });
      })
      .catch(() => {})
      .finally(() => setPeriodsLoading(false));
  }, []);

  // ── Derived period lists ──────────────────────────────────────────────────────
  const years = useMemo(
    () => [...new Set(allPeriods.map(p => p.period_year))].sort((a, b) => b - a),
    [allPeriods],
  );

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
    }
  }, [periodsForYear]);

  // ── Load account LOV on mount ─────────────────────────────────────────────────
  useEffect(() => {
    setAccountsLoading(true);
    fetch(`${APEX_BASE}/glaccountslist`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setAccountOptions(
          (data.items || [])
            .map((i: any) => ({
              account:     String(i.account     || i.ACCOUNT     || ''),
              description: String(i.description || i.DESCRIPTION || ''),
            }))
            .filter((i: AccountOption) => i.account),
        );
      })
      .catch(() => {})
      .finally(() => setAccountsLoading(false));
  }, []);

  // ── Handle BU selection → auto-populate + lock company ───────────────────────
  // NOTE: must use Form onValuesChange, not Select onChange — Form.Item with a
  // name prop clones the child and replaces its onChange with its own handler.
  const handleFormValuesChange = useCallback((changedValues: any) => {
    if ('businessUnit' in changedValues) {
      const buName: string | undefined = changedValues.businessUnit;
      if (!buName) {
        setCompany('');
        setCompanyLocked(false);
        return;
      }
      const bu = buObjects.find(b => b.name === buName);
      if (bu?.company) {
        setCompany(bu.company);
        setCompanyLocked(true);
      } else {
        setCompany('');
        setCompanyLocked(false);
      }
    }
  }, [buObjects]);

  // ── Preview URL ───────────────────────────────────────────────────────────────
  const previewUrl = useMemo(() => {
    const values = form.getFieldsValue();
    const params = new URLSearchParams({ limit: '2000' });
    if (values.businessUnit)     params.set('businessUnit',    values.businessUnit);
    if (selectedPeriod)          params.set('period_name',     selectedPeriod);
    if (selectedAccount)         params.set('account',         selectedAccount);
    if (company)                 params.set('company',         company);
    if (values.sourceTable)      params.set('sourceTable',     values.sourceTable);
    if (values.accountingStatus) params.set('accountingStatus', values.accountingStatus);
    return `${APEX_BASE}/ap/reconciliation?${params}`;
  }, [form, selectedPeriod, selectedAccount, company]);

  // ── Search ────────────────────────────────────────────────────────────────────
  const handleSearch = async (values: any) => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '2000' });
      if (values.businessUnit)     params.set('businessUnit',    values.businessUnit);
      if (selectedPeriod)          params.set('period_name',     selectedPeriod);
      if (selectedAccount)         params.set('account',         selectedAccount);
      if (company)                 params.set('company',         company);
      if (values.sourceTable)      params.set('sourceTable',     values.sourceTable);
      if (values.accountingStatus) params.set('accountingStatus', values.accountingStatus);

      const url = `${APEX_BASE}/ap/reconciliation?${params}`;
      setLastCalledUrl(url);

      const res  = await fetch(url);
      const data = await res.json();
      if (data.error) throw new Error(data.message ?? 'API error');

      const bool = (v: any) => v === true || v === 'true';
      setRows((data.items ?? []).map((r: any) => ({
        ...r,
        slaExists:       bool(r.slaExists),
        glExists:        bool(r.glExists),
        apMatchesSla:    bool(r.apMatchesSla),
        slaMatchesGl:    bool(r.slaMatchesGl),
        isFullyBalanced: bool(r.isFullyBalanced),
      })));
      setSummary(data.summary ?? null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load reconciliation data');
    } finally { setLoading(false); }
  };

  const handleReset = () => {
    form.resetFields();
    setCompany(''); setCompanyLocked(false);
    setSelectedAccount(''); setSelectedAccountDesc('');
    setRows([]); setSummary(null); setError(null); setLastCalledUrl('');
    // Re-apply latest period
    if (periodsForYear.length) setSelectedPeriod(periodsForYear[periodsForYear.length - 1].period_name_id);
  };

  // ── Filtered rows ─────────────────────────────────────────────────────────────
  const displayed = rows.filter(r => {
    if (filter === 'OK')          return r.isFullyBalanced;
    if (filter === 'MISSING_SLA') return !r.slaExists;
    if (filter === 'MISSING_GL')  return !r.glExists;
    if (filter === 'GAP')         return r.slaExists && r.glExists && !r.isFullyBalanced;
    return true;
  });

  const missingSlaCount = rows.filter(r => !r.slaExists).length;
  const missingGlCount  = rows.filter(r => !r.glExists).length;
  const gapCount        = rows.filter(r => r.slaExists && r.glExists && !r.isFullyBalanced).length;
  const okCount         = rows.filter(r => r.isFullyBalanced).length;

  const sourceLabel = (t: string) =>
    SOURCE_TABLE_OPTIONS.find(o => o.value === t)?.label ?? t;

  // ── Columns ───────────────────────────────────────────────────────────────────
  const columns: ColumnsType<ReconRow> = [
    {
      title: () => <Tooltip title="AP transaction exists"><span>AP</span></Tooltip>,
      key: 'apTick', width: 48, align: 'center', fixed: 'left',
      render: () => <StatusTick exists tooltip="Found in AP tables" />,
    },
    {
      title: () => <Tooltip title="SLA accounting entry exists"><span>SLA</span></Tooltip>,
      key: 'slaTick', width: 48, align: 'center', fixed: 'left',
      render: (_, r) => (
        <StatusTick
          exists={r.slaExists}
          tooltip={r.slaExists
            ? `SLA found — status: ${r.slaStatus ?? 'N/A'}`
            : 'No SLA accounting entry (unposted / not yet accounted)'}
        />
      ),
    },
    {
      title: () => <Tooltip title="GL journal entry exists"><span>GL</span></Tooltip>,
      key: 'glTick', width: 48, align: 'center', fixed: 'left',
      render: (_, r) => (
        <StatusTick
          exists={r.glExists}
          tooltip={r.glExists
            ? `GL found — ${r.glBatchStatus === 'P' ? 'Posted' : (r.glBatchStatus ?? 'N/A')}`
            : 'No GL journal entry'}
        />
      ),
    },
    {
      title: 'Source', key: 'sourceTable', width: 130, fixed: 'left',
      render: (_, r) => <Text style={{ fontSize: 11 }}>{sourceLabel(r.sourceTable)}</Text>,
    },
    {
      title: 'AP Transaction #', dataIndex: 'apNumber', width: 150,
      render: v => <Text code style={{ fontSize: 11 }}>{v ?? '—'}</Text>,
    },
    {
      title: 'Supplier / Memo', dataIndex: 'apSupplier', width: 170,
      render: v => <Text style={{ fontSize: 11 }} ellipsis={{ tooltip: v }}>{v ?? '—'}</Text>,
    },
    { title: 'AP Date',   dataIndex: 'apDate',   width: 100 },
    {
      title: 'AP Status', dataIndex: 'apStatus', width: 105,
      render: v => v ? <Tag style={{ fontSize: 10 }}>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'AP Amount', dataIndex: 'apAmount', width: 120, align: 'right',
      render: (v, r) => (
        <Text style={{ fontSize: 11, fontFamily: 'monospace', color: r.slaExists && !r.apMatchesSla ? REDWOOD.warning : undefined }}>
          {fmt(v)}
        </Text>
      ),
    },
    {
      title: 'SLA Status', dataIndex: 'slaStatus', width: 95,
      render: (v, r) => {
        if (!r.slaExists) return <Text type="secondary" style={{ fontSize: 10 }}>—</Text>;
        const color = v === 'POSTED' ? 'success' : v === 'FINAL' ? 'processing' : v === 'DRAFT' ? 'default' : 'error';
        return <Tag color={color} style={{ fontSize: 10 }}>{v}</Tag>;
      },
    },
    {
      title: 'SLA DR', dataIndex: 'slaEnteredDr', width: 120, align: 'right',
      render: (v, r) => r.slaExists
        ? <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{fmt(v)}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'SLA CR', dataIndex: 'slaEnteredCr', width: 120, align: 'right',
      render: (v, r) => r.slaExists
        ? <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{fmt(v)}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'AP↔SLA', key: 'apVsSla', width: 75, align: 'center',
      render: (_, r) => {
        if (!r.slaExists) return <Text type="secondary" style={{ fontSize: 10 }}>—</Text>;
        return r.apMatchesSla
          ? <CheckCircleOutlined style={{ color: REDWOOD.success }} />
          : <Tooltip title={`Amount gap: ${fmt(r.apVsSlaDiff)}`}>
              <WarningOutlined style={{ color: REDWOOD.warning }} />
            </Tooltip>;
      },
    },
    {
      title: 'GL Journal', dataIndex: 'glJournalName', width: 180,
      render: (v, r) => r.glExists
        ? <Text style={{ fontSize: 11 }} ellipsis={{ tooltip: v }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'GL DR Account', dataIndex: 'glDrAccount', width: 170,
      render: (v, r) => r.glExists && v
        ? <Text code style={{ fontSize: 10 }} ellipsis={{ tooltip: v }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'GL CR Account', dataIndex: 'glCrAccount', width: 170,
      render: (v, r) => r.glExists && v
        ? <Text code style={{ fontSize: 10 }} ellipsis={{ tooltip: v }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'GL Status', dataIndex: 'glBatchStatus', width: 90,
      render: (v, r) => r.glExists
        ? <Tag color={v === 'P' ? 'success' : 'default'} style={{ fontSize: 10 }}>
            {v === 'P' ? 'Posted' : (v ?? '?')}
          </Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'GL DR', dataIndex: 'glEnteredDr', width: 120, align: 'right',
      render: (v, r) => r.glExists
        ? <Text style={{ fontSize: 11, fontFamily: 'monospace', color: !r.slaMatchesGl ? REDWOOD.warning : undefined }}>
            {fmt(v)}
          </Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'GL CR', dataIndex: 'glEnteredCr', width: 120, align: 'right',
      render: (v, r) => r.glExists
        ? <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{fmt(v)}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'SLA↔GL', key: 'slaVsGl', width: 75, align: 'center',
      render: (_, r) => {
        if (!r.slaExists || !r.glExists) return <Text type="secondary" style={{ fontSize: 10 }}>—</Text>;
        return r.slaMatchesGl
          ? <CheckCircleOutlined style={{ color: REDWOOD.success }} />
          : <Tooltip title={`Amount gap: ${fmt(r.slaVsGlDiff)}`}>
              <WarningOutlined style={{ color: REDWOOD.warning }} />
            </Tooltip>;
      },
    },
    {
      title: 'Period', dataIndex: 'slaPeriodName', width: 90,
      render: v => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Currency', key: 'currency', width: 80,
      render: (_, r) => r.apCurrency ?? r.slaCurrency ?? '—',
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '16px 20px' }}>

      {/* Search form */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }}>
        <Form form={form} layout="vertical" onFinish={handleSearch} onValuesChange={handleFormValuesChange}>

          {/* Row 1: BU, Company, Account */}
          <Row gutter={12}>
            <Col xs={24} sm={8}>
              <Form.Item style={{ marginBottom: 10 }}
                label={
                  <Space size={6}>
                    <span>Business Unit</span>
                    <Tooltip title="Inspect Business Units API response">
                      <ApiOutlined
                        style={{ fontSize: 12, color: REDWOOD.info, cursor: 'pointer' }}
                        onClick={e => { e.preventDefault(); openBuDebug(); }}
                      />
                    </Tooltip>
                  </Space>
                }
                name="businessUnit"
              >
                <Select
                  placeholder="Select business unit"
                  allowClear
                  showSearch
                  loading={buLoading}
                  optionFilterProp="label"
                  options={buObjects.map(b => ({
                    value: b.name,
                    label: b.company ? `${b.name}  (${b.company})` : b.name,
                  }))}
                  dropdownStyle={{ minWidth: 360 }}
                />
              </Form.Item>
            </Col>

            <Col xs={24} sm={4}>
              <Form.Item label={
                <Space size={4}>
                  <span>Company</span>
                  {companyLocked && <LockOutlined style={{ fontSize: 10, color: REDWOOD.neutral600 }} />}
                </Space>
              } style={{ marginBottom: 10 }}>
                <Input
                  value={company}
                  onChange={e => { if (!companyLocked) setCompany(e.target.value); }}
                  disabled={companyLocked}
                  placeholder="Auto from BU"
                  style={{
                    background: companyLocked ? REDWOOD.neutral100 : undefined,
                    color: companyLocked ? REDWOOD.info : undefined,
                    fontWeight: companyLocked ? 600 : undefined,
                    fontFamily: 'monospace',
                  }}
                />
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item label="Account" style={{ marginBottom: 10 }}>
                <Input.Group compact style={{ display: 'flex' }}>
                  <Input
                    readOnly
                    value={selectedAccount
                      ? `${selectedAccount}${selectedAccountDesc ? '  –  ' + selectedAccountDesc : ''}`
                      : ''}
                    placeholder="Click to select account…"
                    style={{ flex: 1, cursor: 'pointer', background: selectedAccount ? '#f0f5ff' : undefined }}
                    onClick={() => setAccountPickerOpen(true)}
                  />
                  <Button
                    icon={<BookOutlined />}
                    loading={accountsLoading}
                    onClick={() => setAccountPickerOpen(true)}
                    style={{ borderLeft: 0 }}
                  >
                    LOV
                  </Button>
                  {selectedAccount && (
                    <Button onClick={() => { setSelectedAccount(''); setSelectedAccountDesc(''); }}>✕</Button>
                  )}
                </Input.Group>
              </Form.Item>
            </Col>
          </Row>

          {/* Row 2: Year, Period, Source, Status, buttons */}
          <Row gutter={12} align="bottom">
            <Col xs={12} sm={4}>
              <Form.Item label="Year" style={{ marginBottom: 0 }}>
                <Select
                  placeholder="Year"
                  value={selectedYear ?? undefined}
                  loading={periodsLoading}
                  onChange={v => { setSelectedYear(v); setSelectedPeriod(''); }}
                  allowClear
                  style={{ width: '100%' }}
                >
                  {years.map(y => <Option key={y} value={y}>{y}</Option>)}
                </Select>
              </Form.Item>
            </Col>

            <Col xs={12} sm={5}>
              <Form.Item label="Period" style={{ marginBottom: 0 }}>
                <Select
                  placeholder="Select period"
                  value={selectedPeriod || undefined}
                  loading={periodsLoading}
                  onChange={setSelectedPeriod}
                  allowClear
                  showSearch
                  style={{ width: '100%' }}
                >
                  {periodsForYear.map(p => (
                    <Option key={p.period_name_id} value={p.period_name_id}>{p.period_name_id}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col xs={12} sm={5}>
              <Form.Item name="sourceTable" label="Source" style={{ marginBottom: 0 }}>
                <Select placeholder="All" allowClear options={SOURCE_TABLE_OPTIONS} />
              </Form.Item>
            </Col>

            <Col xs={12} sm={4}>
              <Form.Item name="accountingStatus" label="SLA Status" style={{ marginBottom: 0 }}>
                <Select placeholder="All" allowClear options={STATUS_OPTIONS} />
              </Form.Item>
            </Col>

            <Col xs={24} sm={6} style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Form.Item style={{ marginBottom: 0, width: '100%' }}>
                <Space>
                  <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}
                    style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
                    Search
                  </Button>
                  <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
                  <Tooltip title="View API endpoints">
                    <Button icon={<ApiOutlined />} onClick={() => setApiModalOpen(true)} />
                  </Tooltip>
                </Space>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {error && (
        <Alert type="error" message={error} closable onClose={() => setError(null)} style={{ marginBottom: 12 }} />
      )}

      {/* Summary cards */}
      {summary && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          {[
            { title: 'Total AP Txns',  value: summary.totalRows,      color: undefined },
            { title: 'AP Total',       value: fmt(summary.apTotalDr), color: undefined },
            { title: 'SLA Total DR',   value: fmt(summary.slaTotalDr),color: undefined },
            { title: 'GL Total DR',    value: fmt(summary.glTotalDr), color: undefined },
            { title: 'No SLA Entry',   value: summary.noSlaCount,
              color: summary.noSlaCount  > 0 ? REDWOOD.error   : REDWOOD.success },
            { title: 'No GL Entry',    value: summary.noGlCount,
              color: summary.noGlCount   > 0 ? REDWOOD.error   : REDWOOD.success },
            { title: 'AP↔SLA Gap',    value: fmt(summary.apVsSlaDiff),
              color: summary.apVsSlaDiff > 0.01 ? REDWOOD.warning : REDWOOD.success },
            { title: 'SLA↔GL Gap',    value: fmt(summary.slaVsGlDiff),
              color: summary.slaVsGlDiff > 0.01 ? REDWOOD.warning : REDWOOD.success },
          ].map(s => (
            <Col span={3} key={s.title}>
              <Card size="small">
                <Statistic
                  title={s.title}
                  value={s.value}
                  valueStyle={s.color ? { color: s.color, fontSize: 15 } : { fontSize: 15 }}
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* Table */}
      <Card
        size="small"
        title={
          <Space>
            <span>AP ↔ SLA ↔ GL Reconciliation</span>
            {selectedPeriod && <Badge count={selectedPeriod} color={REDWOOD.info} />}
            {rows.length > 0 && <Tag>{rows.length} rows</Tag>}
          </Space>
        }
        extra={
          rows.length > 0 && (
            <Segmented
              value={filter}
              onChange={v => setFilter(v as any)}
              options={[
                { label: `All (${rows.length})`,            value: 'ALL' },
                { label: `OK (${okCount})`,                 value: 'OK' },
                { label: `No SLA (${missingSlaCount})`,     value: 'MISSING_SLA' },
                { label: `No GL (${missingGlCount})`,       value: 'MISSING_GL' },
                { label: `Amount Gap (${gapCount})`,        value: 'GAP' },
              ]}
            />
          )
        }
      >
        <Table<ReconRow>
          dataSource={displayed}
          columns={columns}
          rowKey={r => `${r.sourceTable}_${r.sourceId}`}
          loading={loading}
          size="small"
          scroll={{ x: 2400 }}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `${t} rows` }}
          rowClassName={r =>
            !r.slaExists || !r.glExists ? 'row-missing'
            : !r.isFullyBalanced ? 'row-warning'
            : ''
          }
        />
      </Card>

      {/* API Modal */}
      <Modal
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /> API Endpoints</Space>}
        open={apiModalOpen}
        onCancel={() => setApiModalOpen(false)}
        footer={null}
        width={820}
      >
        {[
          { label: 'Business Units',       url: `${APEX_BASE}/gl/businessunits` },
          { label: 'Ledger Names',          url: `${APEX_BASE}/gl/getledgername` },
          { label: 'Periods (calendar)',    url: `${APEX_BASE}/periodsstatus/create?ledger_name=<ledger>` },
          { label: 'Account LOV',           url: `${APEX_BASE}/glaccountslist` },
        ].map(({ label, url }) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: REDWOOD.neutral600, marginBottom: 5, fontWeight: 600 }}>{label}</div>
            <Space.Compact style={{ width: '100%' }}>
              <Input value={url} readOnly style={{ fontFamily: 'monospace', fontSize: 11 }} />
              <Tooltip title="Copy">
                <Button icon={<CopyOutlined />} onClick={() => navigator.clipboard.writeText(url)} />
              </Tooltip>
              <Button type="primary" style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
                onClick={() => window.open(url, '_blank')}>
                Test
              </Button>
            </Space.Compact>
          </div>
        ))}

        <div style={{ borderTop: `1px solid ${REDWOOD.neutral200}`, paddingTop: 12, marginTop: 4 }}>
          <div style={{ fontSize: 12, color: REDWOOD.neutral600, marginBottom: 5, fontWeight: 600 }}>
            AP Reconciliation (last called / current form)
          </div>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={lastCalledUrl || previewUrl}
              readOnly
              style={{ fontFamily: 'monospace', fontSize: 11 }}
            />
            <Tooltip title="Copy">
              <Button icon={<CopyOutlined />}
                onClick={() => navigator.clipboard.writeText(lastCalledUrl || previewUrl)} />
            </Tooltip>
            <Button type="primary" style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
              onClick={() => window.open(lastCalledUrl || previewUrl, '_blank')}>
              Test
            </Button>
          </Space.Compact>
          {!lastCalledUrl && (
            <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginTop: 4 }}>
              Preview — click Search to see the actual called URL
            </div>
          )}
          {(lastCalledUrl || previewUrl).includes('?') && (
            <div style={{ marginTop: 8, paddingLeft: 4 }}>
              {(lastCalledUrl || previewUrl).split('?')[1].split('&').map((part, i) => {
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
        </div>
      </Modal>

      {/* Account Picker Modal */}
      <AccountPicker
        open={accountPickerOpen}
        onClose={() => setAccountPickerOpen(false)}
        onSelect={(acct, desc) => { setSelectedAccount(acct); setSelectedAccountDesc(desc); }}
        options={accountOptions}
        loading={accountsLoading}
      />

      {/* BU API Debug Modal */}
      <Modal
        open={buDebugOpen}
        onCancel={() => setBuDebugOpen(false)}
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} />Business Units — Raw API Response</Space>}
        footer={<Button onClick={() => setBuDebugOpen(false)}>Close</Button>}
        width={820}
      >
        <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 8 }}>
          <Text code style={{ fontSize: 11 }}>{APEX_BASE}/gl/businessunits</Text>
          {' — '}showing all fields returned per item so you can confirm the company field name.
        </div>
        {buDebugLoading && <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>}
        {!buDebugLoading && buRawItems.length === 0 && (
          <Alert type="warning" message="No items returned or API error" />
        )}
        {!buDebugLoading && buRawItems.length > 0 && (
          <div style={{ maxHeight: 440, overflowY: 'auto' }}>
            {buRawItems.slice(0, 20).map((item, idx) => (
              <div key={idx} style={{ marginBottom: 10, padding: '8px 12px',
                background: idx % 2 === 0 ? '#fafafa' : '#fff',
                border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 6 }}>
                {Object.entries(item).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 2, fontSize: 11 }}>
                    <Text code style={{ fontSize: 10, minWidth: 180, color: REDWOOD.info }}>{k}</Text>
                    <Text style={{ fontSize: 11 }}>{String(v ?? '—')}</Text>
                  </div>
                ))}
              </div>
            ))}
            {buRawItems.length > 20 && (
              <Text type="secondary" style={{ fontSize: 11 }}>…and {buRawItems.length - 20} more items</Text>
            )}
          </div>
        )}
      </Modal>

      <style>{`
        .row-missing td { background-color: #fff1f0 !important; }
        .row-warning td { background-color: #fff7e6 !important; }
      `}</style>
    </div>
  );
}
