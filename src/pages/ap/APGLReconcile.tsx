import { useState, useCallback } from 'react';
import {
  Card, Form, Select, DatePicker, Button, Table, Tag, Statistic, Row, Col,
  Space, Typography, Alert, Segmented,
} from 'antd';
import { SearchOutlined, ReloadOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { APEX_DB_CONFIG } from '../../config/apexConfig';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const APEX_BASE = APEX_DB_CONFIG.baseUrl;

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReconRow {
  slaHeaderId:       number;
  moduleName:        string;
  sourceTable:       string;
  sourceId:          number;
  sourceNumber:      string;
  sourceType:        string;
  eventTypeCode:     string;
  accountingDate:    string;
  periodName:        string;
  businessUnit:      string;
  ledgerName:        string;
  currencyCode:      string;
  accountingStatus:  string;
  postingStatus:     string;
  glBatchId:         number | null;
  glBatchName:       string | null;
  glHeaderId:        number | null;
  postedDate:        string | null;
  slaEnteredDr:      number;
  slaEnteredCr:      number;
  slaAccountedDr:    number;
  slaAccountedCr:    number;
  slaLineCount:      number;
  glJournalName:     string | null;
  glPeriodName:      string | null;
  glCategory:        string | null;
  glSource:          string | null;
  glBatchStatus:     string | null;
  glEnteredDr:       number;
  glEnteredCr:       number;
  glAccountedDr:     number;
  glAccountedCr:     number;
  glLineCount:       number;
  difference:        number;
  isBalanced:        boolean;
}

interface Summary {
  totalRows:       number;
  slaTotalDr:      number;
  slaTotalCr:      number;
  glTotalDr:       number;
  glTotalCr:       number;
  totalDifference: number;
  isBalanced:      boolean;
}

interface BusinessUnit {
  businessUnitName: string;
}

const SOURCE_TABLE_OPTIONS = [
  { value: 'AP_INVOICES',                label: 'AP Invoices' },
  { value: 'AP_PAYMENTS',                label: 'AP Payments' },
  { value: 'RR_AP_APPLIED_PREPAYMENTS',  label: 'Prepayment Applications' },
];

const STATUS_OPTIONS = [
  { value: 'DRAFT',   label: 'Draft' },
  { value: 'FINAL',   label: 'Final' },
  { value: 'POSTED',  label: 'Posted' },
  { value: 'ERROR',   label: 'Error' },
];

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? '–' : n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

// ── Component ──────────────────────────────────────────────────────────────────

export default function APGLReconcile() {
  const [form] = Form.useForm();

  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [buLoading, setBuLoading]         = useState(false);
  const [rows, setRows]                   = useState<ReconRow[]>([]);
  const [summary, setSummary]             = useState<Summary | null>(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [filter, setFilter]               = useState<'ALL' | 'BALANCED' | 'UNBALANCED'>('ALL');

  const loadBUs = useCallback(async () => {
    if (businessUnits.length > 0) return;
    setBuLoading(true);
    try {
      const res  = await fetch(`${APEX_BASE}/gl/businessunits`);
      const data = await res.json();
      setBusinessUnits((data.items ?? []).map((b: any) => ({
        businessUnitName: b.BUSINESS_UNIT_NAME ?? b.businessUnitName,
      })));
    } catch { /* silently ignore */ } finally {
      setBuLoading(false);
    }
  }, [businessUnits.length]);

  const handleSearch = async (values: any) => {
    setError(null);
    setLoading(true);
    try {
      const [dateFrom, dateTo] = values.dateRange
        ? [values.dateRange[0].format('YYYY-MM-DD'), values.dateRange[1].format('YYYY-MM-DD')]
        : [null, null];

      const params = new URLSearchParams({ moduleName: 'AP', limit: '2000' });
      if (values.businessUnit)     params.set('businessUnit',    values.businessUnit);
      if (dateFrom)                params.set('dateFrom',         dateFrom);
      if (dateTo)                  params.set('dateTo',           dateTo);
      if (values.sourceTable)      params.set('sourceTable',      values.sourceTable);
      if (values.accountingStatus) params.set('accountingStatus', values.accountingStatus);

      const res  = await fetch(`${APEX_BASE}/ap/reconciliation?${params}`);
      const data = await res.json();

      if (data.error) throw new Error(data.message ?? 'API error');

      setRows((data.items ?? []).map((r: any) => ({
        ...r,
        isBalanced: r.isBalanced === true || r.isBalanced === 'true',
      })));
      setSummary(data.summary ?? null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load reconciliation data');
    } finally {
      setLoading(false);
    }
  };

  const displayed = rows.filter(r => {
    if (filter === 'BALANCED')   return r.isBalanced;
    if (filter === 'UNBALANCED') return !r.isBalanced;
    return true;
  });

  const unbalancedCount = rows.filter(r => !r.isBalanced).length;

  const columns: ColumnsType<ReconRow> = [
    {
      title: 'Status',
      key: 'isBalanced',
      width: 100,
      fixed: 'left',
      render: (_, r) => r.isBalanced
        ? <Tag icon={<CheckCircleOutlined />} color="success">Balanced</Tag>
        : <Tag icon={<WarningOutlined />}     color="warning">Gap</Tag>,
    },
    {
      title: 'Source',
      key: 'sourceTable',
      width: 160,
      render: (_, r) => {
        const label = SOURCE_TABLE_OPTIONS.find(o => o.value === r.sourceTable)?.label ?? r.sourceTable;
        return <Text style={{ fontSize: 12 }}>{label}</Text>;
      },
    },
    {
      title: 'Transaction #',
      dataIndex: 'sourceNumber',
      width: 150,
      render: v => <Text code style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Event',
      dataIndex: 'eventTypeCode',
      width: 140,
      render: v => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Acctg Date',
      dataIndex: 'accountingDate',
      width: 110,
      sorter: (a, b) => (a.accountingDate ?? '').localeCompare(b.accountingDate ?? ''),
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
    {
      title: 'SLA Status',
      dataIndex: 'accountingStatus',
      width: 100,
      render: v => {
        const color = v === 'POSTED' ? 'success' : v === 'FINAL' ? 'processing' : v === 'DRAFT' ? 'default' : 'error';
        return <Tag color={color}>{v}</Tag>;
      },
    },
    {
      title: 'SLA DR',
      dataIndex: 'slaEnteredDr',
      width: 130,
      align: 'right',
      render: v => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text>,
    },
    {
      title: 'SLA CR',
      dataIndex: 'slaEnteredCr',
      width: 130,
      align: 'right',
      render: v => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text>,
    },
    {
      title: 'GL Journal',
      dataIndex: 'glJournalName',
      width: 200,
      render: v => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'GL Status',
      dataIndex: 'glBatchStatus',
      width: 95,
      render: v => v
        ? <Tag color={v === 'P' ? 'success' : 'default'}>{v === 'P' ? 'Posted' : v}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'GL DR',
      dataIndex: 'glEnteredDr',
      width: 130,
      align: 'right',
      render: v => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text>,
    },
    {
      title: 'GL CR',
      dataIndex: 'glEnteredCr',
      width: 130,
      align: 'right',
      render: v => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text>,
    },
    {
      title: 'Difference',
      dataIndex: 'difference',
      width: 120,
      align: 'right',
      sorter: (a, b) => (a.difference ?? 0) - (b.difference ?? 0),
      render: v => (
        <Text style={{ fontSize: 12, color: (v ?? 0) > 0.01 ? '#faad14' : undefined }}>
          {fmt(v)}
        </Text>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 20px' }}>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="inline"
          onFinish={handleSearch}
          initialValues={{ dateRange: [dayjs().startOf('month'), dayjs()] }}
        >
          <Form.Item name="businessUnit" label="Business Unit" style={{ minWidth: 280 }}>
            <Select
              placeholder="Select business unit"
              allowClear
              showSearch
              loading={buLoading}
              onFocus={loadBUs}
              filterOption={(input, opt) =>
                (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={businessUnits.map(b => ({ value: b.businessUnitName, label: b.businessUnitName }))}
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
                setRows([]); setSummary(null); setError(null);
              }}>
                Reset
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {error && (
        <Alert type="error" message={error} closable onClose={() => setError(null)} style={{ marginBottom: 12 }} />
      )}

      {summary && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          {[
            { title: 'Total Rows',       value: summary.totalRows,       color: undefined },
            { title: 'SLA Total DR',     value: fmt(summary.slaTotalDr), color: undefined },
            { title: 'GL Total DR',      value: fmt(summary.glTotalDr),  color: undefined },
            { title: 'Total Difference', value: fmt(summary.totalDifference), color: summary.totalDifference > 0.01 ? '#faad14' : '#52c41a' },
            { title: 'Unbalanced',       value: unbalancedCount,         color: unbalancedCount > 0 ? '#faad14' : '#52c41a' },
            { title: 'Overall',          value: summary.isBalanced ? 'Balanced' : 'Has Gaps', color: summary.isBalanced ? '#52c41a' : '#faad14' },
          ].map(s => (
            <Col span={4} key={s.title}>
              <Card size="small">
                <Statistic title={s.title} value={s.value} valueStyle={s.color ? { color: s.color } : undefined} />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Card
        size="small"
        title={
          <Space>
            <span>Reconciliation Lines</span>
            {rows.length > 0 && <Tag>{rows.length} rows</Tag>}
          </Space>
        }
        extra={
          rows.length > 0 && (
            <Segmented
              value={filter}
              onChange={v => setFilter(v as any)}
              options={[
                { label: `All (${rows.length})`,                       value: 'ALL' },
                { label: `Balanced (${rows.length - unbalancedCount})`, value: 'BALANCED' },
                { label: `With Gaps (${unbalancedCount})`,             value: 'UNBALANCED' },
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
          scroll={{ x: 1800 }}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `${t} rows` }}
          rowClassName={r => r.isBalanced ? '' : 'row-warning'}
        />
      </Card>

      <style>{`.row-warning td { background-color: #fffbe6 !important; }`}</style>
    </div>
  );
}
