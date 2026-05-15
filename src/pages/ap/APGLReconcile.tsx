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
  primary:   '#C74634',
  success:   '#1D7B4D',
  info:      '#0572CE',
  warning:   '#A86C00',
  neutral600:'#6B6B6B',
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReconRow {
  slaHeaderId:      number;
  sourceTable:      string;
  sourceId:         number;
  sourceNumber:     string;
  eventTypeCode:    string;
  accountingDate:   string;
  periodName:       string;
  businessUnit:     string;
  ledgerName:       string;
  currencyCode:     string;
  accountingStatus: string;
  postingStatus:    string;
  glHeaderId:       number | null;
  postedDate:       string | null;
  slaEnteredDr:     number;
  slaEnteredCr:     number;
  slaLineCount:     number;
  glJournalName:    string | null;
  glBatchStatus:    string | null;
  glEnteredDr:      number;
  glEnteredCr:      number;
  glLineCount:      number;
  glDrAccount:      string | null;
  glCrAccount:      string | null;
  apAmount:         number | null;
  apNumber:         string | null;
  apDate:           string | null;
  apStatus:         string | null;
  apSupplier:       string | null;
  apVsSlaDiff:      number;
  slaVsGlDiff:      number;
  apMatchesSla:     boolean;
  slaMatchesGl:     boolean;
  isFullyBalanced:  boolean;
}

interface Summary {
  totalRows:       number;
  apTotalDr:       number;
  slaTotalDr:      number;
  glTotalDr:       number;
  apVsSlaDiff:     number;
  slaVsGlDiff:     number;
  isFullyBalanced: boolean;
}

const SOURCE_TABLE_OPTIONS = [
  { value: 'AP_INVOICES',               label: 'AP Invoices' },
  { value: 'AP_PAYMENTS',               label: 'AP Payments' },
  { value: 'RR_AP_APPLIED_PREPAYMENTS', label: 'Prepayment Applications' },
  { value: 'CE_BANK_ACCT_TRANSFERS',    label: 'Bank Transfers (CE)' },
];

const STATUS_OPTIONS = [
  { value: 'DRAFT',  label: 'Draft' },
  { value: 'FINAL',  label: 'Final' },
  { value: 'POSTED', label: 'Posted' },
  { value: 'ERROR',  label: 'Error' },
];

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? '–' : n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

function BalanceTag({ row }: { row: ReconRow }) {
  if (row.isFullyBalanced)
    return <Tag icon={<CheckCircleOutlined />} color="success" style={{ fontSize: 11 }}>Balanced</Tag>;
  if (row.apMatchesSla && !row.slaMatchesGl)
    return (
      <Tooltip title={`SLA→GL gap: ${fmt(row.slaVsGlDiff)}`}>
        <Tag icon={<WarningOutlined />} color="warning" style={{ fontSize: 11 }}>SLA↛GL</Tag>
      </Tooltip>
    );
  if (!row.apMatchesSla && row.slaMatchesGl)
    return (
      <Tooltip title={`AP→SLA gap: ${fmt(row.apVsSlaDiff)}`}>
        <Tag icon={<WarningOutlined />} color="orange" style={{ fontSize: 11 }}>AP↛SLA</Tag>
      </Tooltip>
    );
  return (
    <Tooltip title={`AP→SLA: ${fmt(row.apVsSlaDiff)} | SLA→GL: ${fmt(row.slaVsGlDiff)}`}>
      <Tag icon={<CloseCircleOutlined />} color="error" style={{ fontSize: 11 }}>Both Gaps</Tag>
    </Tooltip>
  );
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
  const [filter, setFilter]               = useState<'ALL' | 'BALANCED' | 'UNBALANCED'>('ALL');
  const [lastCalledUrl, setLastCalledUrl] = useState<string>('');
  const [apiModalOpen, setApiModalOpen]   = useState(false);

  // ── Derived API URL (updates as form values change) ──────────────────────────
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
      // ORDS json/collection returns lowercase snake_case field names
      const names: string[] = (data.items ?? [])
        .map((b: any) => b.business_unit_name ?? b.BUSINESS_UNIT_NAME ?? b.businessUnitName)
        .filter(Boolean);
      setBusinessUnits(names);
    } catch { /* silently ignore */ } finally { setBuLoading(false); }
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
        apMatchesSla:    bool(r.apMatchesSla),
        slaMatchesGl:    bool(r.slaMatchesGl),
        isFullyBalanced: bool(r.isFullyBalanced),
      })));
      setSummary(data.summary ?? null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load reconciliation data');
    } finally { setLoading(false); }
  };

  const unbalancedCount = rows.filter(r => !r.isFullyBalanced).length;
  const displayed = rows.filter(r => {
    if (filter === 'BALANCED')   return r.isFullyBalanced;
    if (filter === 'UNBALANCED') return !r.isFullyBalanced;
    return true;
  });

  const columns: ColumnsType<ReconRow> = [
    {
      title: 'Balance',
      key: 'balance',
      width: 95,
      fixed: 'left',
      render: (_, r) => <BalanceTag row={r} />,
    },
    {
      title: 'Source',
      key: 'sourceTable',
      width: 140,
      render: (_, r) => {
        const label = SOURCE_TABLE_OPTIONS.find(o => o.value === r.sourceTable)?.label ?? r.sourceTable;
        return <Text style={{ fontSize: 11 }}>{label}</Text>;
      },
    },
    // ── AP leg ──────────────────────────────────────────────────────────────
    {
      title: 'AP Transaction #',
      key: 'apNumber',
      width: 140,
      render: (_, r) => (
        <Text code style={{ fontSize: 11 }}>{r.apNumber ?? r.sourceNumber ?? '—'}</Text>
      ),
    },
    {
      title: 'Supplier',
      dataIndex: 'apSupplier',
      width: 160,
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
      width: 100,
      render: v => v ? <Tag style={{ fontSize: 10 }}>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'AP Amount',
      dataIndex: 'apAmount',
      width: 120,
      align: 'right',
      render: (v, r) => (
        <Text style={{ fontSize: 11, color: !r.apMatchesSla && v != null ? REDWOOD.warning : undefined }}>
          {fmt(v)}
        </Text>
      ),
    },
    // ── AP↔SLA check ────────────────────────────────────────────────────────
    {
      title: 'AP↔SLA',
      key: 'apVsSla',
      width: 75,
      align: 'center',
      render: (_, r) => r.apAmount == null
        ? <Text type="secondary" style={{ fontSize: 10 }}>N/A</Text>
        : r.apMatchesSla
          ? <CheckCircleOutlined style={{ color: REDWOOD.success }} />
          : <Tooltip title={`Diff: ${fmt(r.apVsSlaDiff)}`}>
              <WarningOutlined style={{ color: REDWOOD.warning }} />
            </Tooltip>,
    },
    // ── SLA leg ─────────────────────────────────────────────────────────────
    {
      title: 'SLA Status',
      dataIndex: 'accountingStatus',
      width: 95,
      render: v => {
        const color = v === 'POSTED' ? 'success' : v === 'FINAL' ? 'processing' : v === 'DRAFT' ? 'default' : 'error';
        return <Tag color={color} style={{ fontSize: 10 }}>{v}</Tag>;
      },
    },
    {
      title: 'SLA DR',
      dataIndex: 'slaEnteredDr',
      width: 120,
      align: 'right',
      render: v => <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{fmt(v)}</Text>,
    },
    {
      title: 'SLA CR',
      dataIndex: 'slaEnteredCr',
      width: 120,
      align: 'right',
      render: v => <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{fmt(v)}</Text>,
    },
    // ── SLA↔GL check ────────────────────────────────────────────────────────
    {
      title: 'SLA↔GL',
      key: 'slaVsGl',
      width: 75,
      align: 'center',
      render: (_, r) => r.glHeaderId == null
        ? <Tooltip title="No GL journal"><CloseCircleOutlined style={{ color: '#ff4d4f' }} /></Tooltip>
        : r.slaMatchesGl
          ? <CheckCircleOutlined style={{ color: REDWOOD.success }} />
          : <Tooltip title={`Diff: ${fmt(r.slaVsGlDiff)}`}>
              <WarningOutlined style={{ color: REDWOOD.warning }} />
            </Tooltip>,
    },
    // ── GL leg ──────────────────────────────────────────────────────────────
    {
      title: 'GL Journal',
      dataIndex: 'glJournalName',
      width: 180,
      render: v => v
        ? <Text style={{ fontSize: 11 }} ellipsis={{ tooltip: v }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'GL DR Account',
      dataIndex: 'glDrAccount',
      width: 170,
      render: v => v
        ? <Text code style={{ fontSize: 10 }} ellipsis={{ tooltip: v }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'GL CR Account',
      dataIndex: 'glCrAccount',
      width: 170,
      render: v => v
        ? <Text code style={{ fontSize: 10 }} ellipsis={{ tooltip: v }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'GL Status',
      dataIndex: 'glBatchStatus',
      width: 90,
      render: v => v
        ? <Tag color={v === 'P' ? 'success' : 'default'} style={{ fontSize: 10 }}>
            {v === 'P' ? 'Posted' : v}
          </Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'GL DR',
      dataIndex: 'glEnteredDr',
      width: 120,
      align: 'right',
      render: (v, r) => (
        <Text style={{ fontSize: 11, fontFamily: 'monospace', color: !r.slaMatchesGl && r.glHeaderId != null ? REDWOOD.warning : undefined }}>
          {fmt(v)}
        </Text>
      ),
    },
    {
      title: 'GL CR',
      dataIndex: 'glEnteredCr',
      width: 120,
      align: 'right',
      render: v => <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{fmt(v)}</Text>,
    },
    {
      title: 'Period',
      dataIndex: 'periodName',
      width: 90,
    },
    {
      title: 'Currency',
      dataIndex: 'currencyCode',
      width: 80,
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
            <Select placeholder="All" allowClear style={{ width: 190 }} options={SOURCE_TABLE_OPTIONS} />
          </Form.Item>

          <Form.Item name="accountingStatus" label="Acctg Status">
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
            { title: 'Total Rows',   value: summary.totalRows,      color: undefined },
            { title: 'AP Total',     value: fmt(summary.apTotalDr), color: undefined },
            { title: 'SLA Total DR', value: fmt(summary.slaTotalDr),color: undefined },
            { title: 'GL Total DR',  value: fmt(summary.glTotalDr), color: undefined },
            { title: 'AP↔SLA Gap',  value: fmt(summary.apVsSlaDiff),  color: summary.apVsSlaDiff  > 0.01 ? REDWOOD.warning : REDWOOD.success },
            { title: 'SLA↔GL Gap',  value: fmt(summary.slaVsGlDiff),  color: summary.slaVsGlDiff > 0.01 ? REDWOOD.warning : REDWOOD.success },
            { title: 'Unbalanced',   value: unbalancedCount,           color: unbalancedCount > 0 ? REDWOOD.warning : REDWOOD.success },
            { title: 'Overall',      value: summary.isFullyBalanced ? 'Balanced' : 'Has Gaps',
              color: summary.isFullyBalanced ? REDWOOD.success : REDWOOD.warning },
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
                { label: `All (${rows.length})`,                        value: 'ALL' },
                { label: `Balanced (${rows.length - unbalancedCount})`, value: 'BALANCED' },
                { label: `With Gaps (${unbalancedCount})`,              value: 'UNBALANCED' },
              ]}
            />
          )
        }
      >
        <Table<ReconRow>
          dataSource={displayed}
          columns={columns}
          rowKey="slaHeaderId"
          loading={loading}
          size="small"
          scroll={{ x: 2450 }}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `${t} rows` }}
          rowClassName={r => r.isFullyBalanced ? '' : 'row-warning'}
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
              <Button
                icon={<CopyOutlined />}
                onClick={() => navigator.clipboard.writeText(`${APEX_BASE}/gl/businessunits`)}
              />
            </Tooltip>
            <Button
              type="primary"
              style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
              onClick={() => window.open(`${APEX_BASE}/gl/businessunits`, '_blank')}
            >
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
              <Button
                icon={<CopyOutlined />}
                onClick={() => navigator.clipboard.writeText(lastCalledUrl || previewUrl)}
              />
            </Tooltip>
            <Button
              type="primary"
              style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
              onClick={() => window.open(lastCalledUrl || previewUrl, '_blank')}
            >
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

      <style>{`.row-warning td { background-color: #fff7e6 !important; }`}</style>
    </div>
  );
}
