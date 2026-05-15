import { useState, useCallback, useMemo } from 'react';
import {
  Card, Form, Select, DatePicker, Button, Table, Tag, Statistic, Row, Col,
  Space, Typography, Alert, Segmented, Tooltip, Modal, Input,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined,
  CheckCircleOutlined, WarningOutlined, CloseCircleOutlined,
  ApiOutlined, CopyOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { APEX_DB_CONFIG } from '../../config/api.config';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const APEX_BASE = APEX_DB_CONFIG.baseUrl;

const REDWOOD = {
  primary:    '#C74634',
  success:    '#1D7B4D',
  info:       '#0572CE',
  warning:    '#A86C00',
  error:      '#C74634',
  neutral600: '#6B6B6B',
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReconRow {
  // AP source (always present)
  sourceTable:     string;
  sourceId:        number;
  apNumber:        string;
  apAmount:        number | null;
  apDate:          string | null;
  apStatus:        string | null;
  apSupplier:      string | null;
  businessUnit:    string;
  apCurrency:      string | null;
  // SLA (LEFT JOIN — may be zero)
  slaCount:        number;
  slaExists:       boolean;
  slaStatus:       string | null;
  slaPeriodName:   string | null;
  ledgerName:      string | null;
  slaCurrency:     string | null;
  slaEnteredDr:    number;
  slaEnteredCr:    number;
  slaLineCount:    number;
  // GL (scalar subqueries — may be zero)
  glCount:         number;
  glExists:        boolean;
  glHeaderId:      number | null;
  glJournalName:   string | null;
  glBatchStatus:   string | null;
  glEnteredDr:     number;
  glEnteredCr:     number;
  glDrAccount:     string | null;
  glCrAccount:     string | null;
  // Three-way derived
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

// Three-way status indicator — ✓ green or ✗ red
function StatusTick({ exists, tooltip }: { exists: boolean; tooltip?: string }) {
  const icon = exists
    ? <CheckCircleOutlined style={{ color: REDWOOD.success, fontSize: 16 }} />
    : <CloseCircleOutlined style={{ color: REDWOOD.error,   fontSize: 16 }} />;
  return tooltip ? <Tooltip title={tooltip}>{icon}</Tooltip> : icon;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function APGLReconcile() {
  const [form] = Form.useForm();

  const [businessUnits, setBusinessUnits] = useState<string[]>([]);
  const [buLoading, setBuLoading]         = useState(false);
  const [rows, setRows]                   = useState<ReconRow[]>([]);
  const [summary, setSummary]             = useState<Summary | null>(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [filter, setFilter]               = useState<'ALL' | 'OK' | 'MISSING_SLA' | 'MISSING_GL' | 'GAP'>('ALL');
  const [lastCalledUrl, setLastCalledUrl] = useState<string>('');
  const [apiModalOpen, setApiModalOpen]   = useState(false);

  const previewUrl = useMemo(() => {
    const values = form.getFieldsValue();
    const [dateFrom, dateTo] = values.dateRange
      ? [values.dateRange[0]?.format('YYYY-MM-DD'), values.dateRange[1]?.format('YYYY-MM-DD')]
      : [null, null];
    const params = new URLSearchParams({ limit: '2000' });
    if (values.businessUnit)     params.set('businessUnit',    values.businessUnit);
    if (dateFrom)                params.set('dateFrom',         dateFrom);
    if (dateTo)                  params.set('dateTo',           dateTo);
    if (values.sourceTable)      params.set('sourceTable',      values.sourceTable);
    if (values.accountingStatus) params.set('accountingStatus', values.accountingStatus);
    return `${APEX_BASE}/ap/reconciliation?${params}`;
  }, [form]);

  const loadBUs = useCallback(async () => {
    if (businessUnits.length > 0) return;
    setBuLoading(true);
    try {
      const res  = await fetch(`${APEX_BASE}/gl/businessunits`);
      const data = await res.json();
      const names: string[] = (data.items ?? [])
        .map((b: any) => b.business_unit_name ?? b.BUSINESS_UNIT_NAME ?? b.businessUnitName)
        .filter(Boolean);
      setBusinessUnits(names);
    } catch { /* ignore */ } finally { setBuLoading(false); }
  }, [businessUnits.length]);

  const handleSearch = async (values: any) => {
    setError(null);
    setLoading(true);
    try {
      const [dateFrom, dateTo] = values.dateRange
        ? [values.dateRange[0].format('YYYY-MM-DD'), values.dateRange[1].format('YYYY-MM-DD')]
        : [null, null];

      const params = new URLSearchParams({ limit: '2000' });
      if (values.businessUnit)     params.set('businessUnit',    values.businessUnit);
      if (dateFrom)                params.set('dateFrom',         dateFrom);
      if (dateTo)                  params.set('dateTo',           dateTo);
      if (values.sourceTable)      params.set('sourceTable',      values.sourceTable);
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

  const columns: ColumnsType<ReconRow> = [
    // ── Three tick columns ───────────────────────────────────────────────────
    {
      title: () => <Tooltip title="AP transaction exists"><span>AP</span></Tooltip>,
      key: 'apTick',
      width: 48,
      align: 'center',
      fixed: 'left',
      render: () => <StatusTick exists tooltip="Found in AP tables" />,
    },
    {
      title: () => <Tooltip title="SLA accounting entry exists"><span>SLA</span></Tooltip>,
      key: 'slaTick',
      width: 48,
      align: 'center',
      fixed: 'left',
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
      key: 'glTick',
      width: 48,
      align: 'center',
      fixed: 'left',
      render: (_, r) => (
        <StatusTick
          exists={r.glExists}
          tooltip={r.glExists
            ? `GL found — ${r.glBatchStatus === 'P' ? 'Posted' : (r.glBatchStatus ?? 'N/A')}`
            : 'No GL journal entry'}
        />
      ),
    },
    // ── Source ───────────────────────────────────────────────────────────────
    {
      title: 'Source',
      key: 'sourceTable',
      width: 130,
      fixed: 'left',
      render: (_, r) => <Text style={{ fontSize: 11 }}>{sourceLabel(r.sourceTable)}</Text>,
    },
    // ── AP leg ───────────────────────────────────────────────────────────────
    {
      title: 'AP Transaction #',
      dataIndex: 'apNumber',
      width: 150,
      render: v => <Text code style={{ fontSize: 11 }}>{v ?? '—'}</Text>,
    },
    {
      title: 'Supplier / Memo',
      dataIndex: 'apSupplier',
      width: 170,
      render: v => <Text style={{ fontSize: 11 }} ellipsis={{ tooltip: v }}>{v ?? '—'}</Text>,
    },
    {
      title: 'AP Date',
      dataIndex: 'apDate',
      width: 100,
    },
    {
      title: 'AP Status',
      dataIndex: 'apStatus',
      width: 105,
      render: v => v ? <Tag style={{ fontSize: 10 }}>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'AP Amount',
      dataIndex: 'apAmount',
      width: 120,
      align: 'right',
      render: (v, r) => (
        <Text style={{ fontSize: 11, fontFamily: 'monospace', color: r.slaExists && !r.apMatchesSla ? REDWOOD.warning : undefined }}>
          {fmt(v)}
        </Text>
      ),
    },
    // ── SLA leg ──────────────────────────────────────────────────────────────
    {
      title: 'SLA Status',
      dataIndex: 'slaStatus',
      width: 95,
      render: (v, r) => {
        if (!r.slaExists) return <Text type="secondary" style={{ fontSize: 10 }}>—</Text>;
        const color = v === 'POSTED' ? 'success' : v === 'FINAL' ? 'processing' : v === 'DRAFT' ? 'default' : 'error';
        return <Tag color={color} style={{ fontSize: 10 }}>{v}</Tag>;
      },
    },
    {
      title: 'SLA DR',
      dataIndex: 'slaEnteredDr',
      width: 120,
      align: 'right',
      render: (v, r) => r.slaExists
        ? <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{fmt(v)}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'SLA CR',
      dataIndex: 'slaEnteredCr',
      width: 120,
      align: 'right',
      render: (v, r) => r.slaExists
        ? <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{fmt(v)}</Text>
        : <Text type="secondary">—</Text>,
    },
    // ── Amount gap AP↔SLA ────────────────────────────────────────────────────
    {
      title: 'AP↔SLA',
      key: 'apVsSla',
      width: 75,
      align: 'center',
      render: (_, r) => {
        if (!r.slaExists) return <Text type="secondary" style={{ fontSize: 10 }}>—</Text>;
        return r.apMatchesSla
          ? <CheckCircleOutlined style={{ color: REDWOOD.success }} />
          : <Tooltip title={`Amount gap: ${fmt(r.apVsSlaDiff)}`}>
              <WarningOutlined style={{ color: REDWOOD.warning }} />
            </Tooltip>;
      },
    },
    // ── GL leg ───────────────────────────────────────────────────────────────
    {
      title: 'GL Journal',
      dataIndex: 'glJournalName',
      width: 180,
      render: (v, r) => r.glExists
        ? <Text style={{ fontSize: 11 }} ellipsis={{ tooltip: v }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'GL DR Account',
      dataIndex: 'glDrAccount',
      width: 170,
      render: (v, r) => r.glExists && v
        ? <Text code style={{ fontSize: 10 }} ellipsis={{ tooltip: v }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'GL CR Account',
      dataIndex: 'glCrAccount',
      width: 170,
      render: (v, r) => r.glExists && v
        ? <Text code style={{ fontSize: 10 }} ellipsis={{ tooltip: v }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'GL Status',
      dataIndex: 'glBatchStatus',
      width: 90,
      render: (v, r) => r.glExists
        ? <Tag color={v === 'P' ? 'success' : 'default'} style={{ fontSize: 10 }}>
            {v === 'P' ? 'Posted' : (v ?? '?')}
          </Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'GL DR',
      dataIndex: 'glEnteredDr',
      width: 120,
      align: 'right',
      render: (v, r) => r.glExists
        ? <Text style={{ fontSize: 11, fontFamily: 'monospace', color: !r.slaMatchesGl ? REDWOOD.warning : undefined }}>
            {fmt(v)}
          </Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'GL CR',
      dataIndex: 'glEnteredCr',
      width: 120,
      align: 'right',
      render: (v, r) => r.glExists
        ? <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{fmt(v)}</Text>
        : <Text type="secondary">—</Text>,
    },
    // ── SLA↔GL gap ──────────────────────────────────────────────────────────
    {
      title: 'SLA↔GL',
      key: 'slaVsGl',
      width: 75,
      align: 'center',
      render: (_, r) => {
        if (!r.slaExists || !r.glExists) return <Text type="secondary" style={{ fontSize: 10 }}>—</Text>;
        return r.slaMatchesGl
          ? <CheckCircleOutlined style={{ color: REDWOOD.success }} />
          : <Tooltip title={`Amount gap: ${fmt(r.slaVsGlDiff)}`}>
              <WarningOutlined style={{ color: REDWOOD.warning }} />
            </Tooltip>;
      },
    },
    // ── Period / Currency ────────────────────────────────────────────────────
    {
      title: 'Period',
      dataIndex: 'slaPeriodName',
      width: 90,
      render: v => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Currency',
      key: 'currency',
      width: 80,
      render: (_, r) => r.apCurrency ?? r.slaCurrency ?? '—',
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '16px 20px' }}>

      {/* Search form */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="inline"
          onFinish={handleSearch}
          initialValues={{ dateRange: [dayjs().startOf('month'), dayjs()] }}
          onValuesChange={() => form.validateFields().catch(() => {})}
        >
          <Form.Item name="businessUnit" label="Business Unit" style={{ minWidth: 280 }}>
            <Select
              placeholder="Select business unit"
              allowClear
              showSearch
              loading={buLoading}
              onFocus={loadBUs}
              filterOption={(input, opt) =>
                String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={businessUnits.map(name => ({ value: name, label: name }))}
              dropdownStyle={{ minWidth: 320 }}
              optionFilterProp="label"
            />
          </Form.Item>

          <Form.Item name="dateRange" label="Date Range">
            <RangePicker format="YYYY-MM-DD" style={{ width: 240 }} />
          </Form.Item>

          <Form.Item name="sourceTable" label="Source">
            <Select placeholder="All" allowClear style={{ width: 175 }} options={SOURCE_TABLE_OPTIONS} />
          </Form.Item>

          <Form.Item name="accountingStatus" label="SLA Status">
            <Select placeholder="All" allowClear style={{ width: 120 }} options={STATUS_OPTIONS} />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>
                Search
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => {
                form.resetFields();
                form.setFieldValue('dateRange', [dayjs().startOf('month'), dayjs()]);
                setRows([]); setSummary(null); setError(null); setLastCalledUrl('');
              }}>
                Reset
              </Button>
              <Tooltip title="View API endpoints">
                <Button icon={<ApiOutlined />} onClick={() => setApiModalOpen(true)} />
              </Tooltip>
            </Space>
          </Form.Item>
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
        width={780}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: REDWOOD.neutral600, marginBottom: 6, fontWeight: 600 }}>
            GET — Business Units
          </div>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={`${APEX_BASE}/gl/businessunits`}
              readOnly
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
            <Tooltip title="Copy">
              <Button icon={<CopyOutlined />}
                onClick={() => navigator.clipboard.writeText(`${APEX_BASE}/gl/businessunits`)} />
            </Tooltip>
            <Button type="primary" style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
              onClick={() => window.open(`${APEX_BASE}/gl/businessunits`, '_blank')}>
              Test
            </Button>
          </Space.Compact>
        </div>

        <div>
          <div style={{ fontSize: 12, color: REDWOOD.neutral600, marginBottom: 6, fontWeight: 600 }}>
            GET — AP Reconciliation (last called / current form)
          </div>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={lastCalledUrl || previewUrl}
              readOnly
              style={{ fontFamily: 'monospace', fontSize: 12 }}
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
              Preview URL — click Search to see the actual called URL
            </div>
          )}
        </div>
      </Modal>

      <style>{`
        .row-missing td { background-color: #fff1f0 !important; }
        .row-warning td { background-color: #fff7e6 !important; }
      `}</style>
    </div>
  );
}
