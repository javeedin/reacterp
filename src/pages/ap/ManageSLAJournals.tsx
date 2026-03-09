import React, { useState, useCallback } from 'react';
import dayjs from 'dayjs';
import {
  Card, Table, Tabs, Form, Select, DatePicker, Input, Button,
  Space, Tag, Typography, Row, Col, Tooltip, Badge, Divider,
  Statistic, message,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, ArrowLeftOutlined,
  AccountBookOutlined, UnorderedListOutlined, FileSearchOutlined,
  CheckCircleOutlined, ClockCircleOutlined, WarningOutlined,
  DollarOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { APEX_DB_CONFIG } from '../../config/api.config';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

// ── Oracle Redwood colour palette ────────────────────────────────────────────
const REDWOOD = {
  primary:     '#C74634',
  info:        '#0572CE',
  success:     '#1D7B4D',
  warning:     '#D4A800',
  error:       '#D93025',
  neutral100:  '#F7F7F7',
  neutral200:  '#E5E5E5',
  neutral600:  '#6B6B6B',
  surface:     '#FFFFFF',
};

// ── Interfaces ───────────────────────────────────────────────────────────────

interface SlaHeader {
  key: string;
  headerId: number;
  moduleName: string;
  sourceTable: string;
  sourceId: number;
  sourceNumber: string;
  sourceType: string;
  eventTypeCode: string;
  accountingDate: string;
  periodName: string;
  ledgerName: string;
  currencyCode: string;
  businessUnit: string;
  description: string;
  accountingStatus: string;
  postingStatus: string;
  glBatchId: number | null;
  glBatchName: string | null;
  glHeaderId: number | null;
  createdBy: string;
  creationDate: string;
  postedBy: string | null;
  postedDate: string | null;
  lineCount: number;
}

interface SlaLine {
  key: string;
  lineId: number;
  headerId: number;
  lineNumber: number;
  lineType: string;
  accountingClass: string;
  accountCombination: string;
  enteredDr: number;
  enteredCr: number;
  accountedDr: number;
  accountedCr: number;
  currencyCode: string;
  description: string;
  sourceNumber: string;
  sourceTable: string;
  accountingDate: string;
  accountingStatus: string;
  businessUnit: string;
  legalEntity: string;
  moduleName: string;
  partyType: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatAmount = (v: number | null | undefined) => {
  if (v === null || v === undefined || v === 0) return '—';
  return new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
};

const statusColor = (s: string) => {
  switch (s?.toUpperCase()) {
    case 'POSTED':  return 'success';
    case 'DRAFT':   return 'warning';
    case 'ERROR':   return 'error';
    default:        return 'default';
  }
};

const statusIcon = (s: string) => {
  switch (s?.toUpperCase()) {
    case 'POSTED':  return <CheckCircleOutlined />;
    case 'DRAFT':   return <ClockCircleOutlined />;
    case 'ERROR':   return <WarningOutlined />;
    default:        return null;
  }
};

// ── Component ────────────────────────────────────────────────────────────────

const ManageSLAJournals: React.FC = () => {
  const navigate = useNavigate();
  const [headerForm] = Form.useForm();
  const [lineForm]   = Form.useForm();

  // ── Headers tab state ────────────────────────────────────────────────────
  const [headers, setHeaders]           = useState<SlaHeader[]>([]);
  const [headerLoading, setHeaderLoading] = useState(false);
  const [headerTotal, setHeaderTotal]   = useState(0);

  // ── Lines tab state ──────────────────────────────────────────────────────
  const [lines, setLines]           = useState<SlaLine[]>([]);
  const [lineLoading, setLineLoading] = useState(false);
  const [lineTotal, setLineTotal]   = useState(0);

  // ── Summary stats ────────────────────────────────────────────────────────
  const [stats, setStats] = useState({ draft: 0, posted: 0, error: 0, totalDr: 0, totalCr: 0 });

  // ── Active tab ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('headers');

  // ── Fetch headers ────────────────────────────────────────────────────────
  const fetchHeaders = useCallback(async (values: any) => {
    setHeaderLoading(true);
    try {
      const params = new URLSearchParams();
      if (values.status)      params.append('accountingStatus', values.status);
      if (values.moduleName)  params.append('moduleName', values.moduleName);
      if (values.sourceTable) params.append('sourceTable', values.sourceTable);
      if (values.eventType)   params.append('eventTypeCode', values.eventType);
      if (values.period)      params.append('periodName', values.period);
      if (values.sourceNumber) params.append('sourceNumber', values.sourceNumber);
      if (values.dateRange?.[0]) params.append('dateFrom', values.dateRange[0].format('YYYY-MM-DD'));
      if (values.dateRange?.[1]) params.append('dateTo',   values.dateRange[1].format('YYYY-MM-DD'));
      params.append('limit', '500');

      const url = `${APEX_DB_CONFIG.baseUrl}/sla/journals?${params.toString()}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items: SlaHeader[] = (data.items || data || []).map((r: any) => ({
        ...r,
        key: String(r.headerId),
      }));
      setHeaders(items);
      setHeaderTotal(items.length);

      // compute quick stats
      setStats({
        draft:   items.filter(h => h.accountingStatus === 'DRAFT').length,
        posted:  items.filter(h => h.accountingStatus === 'POSTED').length,
        error:   items.filter(h => h.accountingStatus === 'ERROR').length,
        totalDr: 0,
        totalCr: 0,
      });
    } catch (err: any) {
      message.error(`Failed to load journal entries: ${err.message}`);
    } finally {
      setHeaderLoading(false);
    }
  }, []);

  // ── Fetch lines ──────────────────────────────────────────────────────────
  const fetchLines = useCallback(async (values: any) => {
    setLineLoading(true);
    try {
      const params = new URLSearchParams();
      if (values.status)      params.append('accountingStatus', values.status);
      if (values.moduleName)  params.append('moduleName', values.moduleName);
      if (values.lineType)    params.append('lineType', values.lineType);
      if (values.acctClass)   params.append('accountingClass', values.acctClass);
      if (values.account)     params.append('accountCombination', values.account);
      if (values.sourceNumber) params.append('sourceNumber', values.sourceNumber);
      if (values.dateRange?.[0]) params.append('dateFrom', values.dateRange[0].format('YYYY-MM-DD'));
      if (values.dateRange?.[1]) params.append('dateTo',   values.dateRange[1].format('YYYY-MM-DD'));
      params.append('limit', '500');

      const url = `${APEX_DB_CONFIG.baseUrl}/sla/journals/lines?${params.toString()}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items: SlaLine[] = (data.items || data || []).map((r: any, i: number) => ({
        ...r,
        key: r.lineId ? String(r.lineId) : `${r.headerId}-${r.lineNumber}-${i}`,
      }));
      setLines(items);
      setLineTotal(items.length);

      const totalDr = items.reduce((s, l) => s + (l.accountedDr || 0), 0);
      const totalCr = items.reduce((s, l) => s + (l.accountedCr || 0), 0);
      setStats(prev => ({ ...prev, totalDr, totalCr }));
    } catch (err: any) {
      message.error(`Failed to load journal lines: ${err.message}`);
    } finally {
      setLineLoading(false);
    }
  }, []);

  // ── Header table columns ─────────────────────────────────────────────────
  const headerColumns = [
    {
      title: 'Accounting Date',
      dataIndex: 'accountingDate',
      width: 130,
      sorter: (a: SlaHeader, b: SlaHeader) => a.accountingDate.localeCompare(b.accountingDate),
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v ? dayjs(v).format('DD-MMM-YYYY') : '—'}</Text>,
    },
    {
      title: 'Transaction #',
      dataIndex: 'sourceNumber',
      width: 150,
      render: (v: string, r: SlaHeader) => (
        <Tooltip title={`Header ID: ${r.headerId} | Source ID: ${r.sourceId}`}>
          <Text strong style={{ fontSize: 12, color: REDWOOD.info }}>{v}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Module',
      dataIndex: 'moduleName',
      width: 70,
      render: (v: string) => <Tag color="blue" style={{ fontSize: 11 }}>{v}</Tag>,
    },
    {
      title: 'Event Type',
      dataIndex: 'eventTypeCode',
      width: 170,
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'accountingStatus',
      width: 90,
      render: (v: string) => (
        <Tag icon={statusIcon(v)} color={statusColor(v)} style={{ fontSize: 11, fontWeight: 600 }}>
          {v}
        </Tag>
      ),
    },
    {
      title: 'Period',
      dataIndex: 'periodName',
      width: 80,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Lines',
      dataIndex: 'lineCount',
      width: 55,
      align: 'right' as const,
      render: (v: number) => <Badge count={v} color={REDWOOD.info} style={{ fontSize: 10 }} />,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 11 }} ellipsis>{v}</Text>,
    },
    {
      title: 'Business Unit',
      dataIndex: 'businessUnit',
      width: 180,
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Ledger',
      dataIndex: 'ledgerName',
      width: 100,
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'GL Batch',
      dataIndex: 'glBatchId',
      width: 90,
      render: (v: number | null, r: SlaHeader) => v ? (
        <Tooltip title={r.glBatchName || ''}>
          <Text code style={{ fontSize: 10 }}>{v}</Text>
        </Tooltip>
      ) : <Text style={{ color: REDWOOD.neutral600, fontSize: 11 }}>—</Text>,
    },
    {
      title: 'Created By',
      dataIndex: 'createdBy',
      width: 90,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
    },
  ];

  // ── Lines table columns ──────────────────────────────────────────────────
  const lineColumns = [
    {
      title: 'Accounting Date',
      dataIndex: 'accountingDate',
      width: 130,
      sorter: (a: SlaLine, b: SlaLine) => a.accountingDate.localeCompare(b.accountingDate),
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v ? dayjs(v).format('DD-MMM-YYYY') : '—'}</Text>,
    },
    {
      title: 'Transaction #',
      dataIndex: 'sourceNumber',
      width: 150,
      render: (v: string, r: SlaLine) => (
        <Tooltip title={`Header ID: ${r.headerId} | Line: ${r.lineNumber}`}>
          <Text style={{ fontSize: 12, color: REDWOOD.info }}>{v}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'lineType',
      width: 55,
      render: (v: string) => (
        <Tag color={v === 'DR' ? 'blue' : 'red'} style={{ fontSize: 11, fontWeight: 700 }}>{v}</Tag>
      ),
    },
    {
      title: 'Accounting Class',
      dataIndex: 'accountingClass',
      width: 130,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Account Combination',
      dataIndex: 'accountCombination',
      ellipsis: true,
      render: (v: string) => <Text code style={{ fontSize: 11 }}>{v || '—'}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'accountingStatus',
      width: 90,
      render: (v: string) => (
        <Tag icon={statusIcon(v)} color={statusColor(v)} style={{ fontSize: 11, fontWeight: 600 }}>{v}</Tag>
      ),
    },
    {
      title: 'Debit',
      dataIndex: 'enteredDr',
      width: 120,
      align: 'right' as const,
      render: (v: number, r: SlaLine) => r.lineType === 'DR'
        ? <Text strong style={{ fontSize: 12, color: REDWOOD.info }}>{formatAmount(v)}</Text>
        : <Text style={{ color: REDWOOD.neutral600, fontSize: 11 }}>—</Text>,
    },
    {
      title: 'Credit',
      dataIndex: 'enteredCr',
      width: 120,
      align: 'right' as const,
      render: (v: number, r: SlaLine) => r.lineType === 'CR'
        ? <Text strong style={{ fontSize: 12, color: REDWOOD.error }}>{formatAmount(v)}</Text>
        : <Text style={{ color: REDWOOD.neutral600, fontSize: 11 }}>—</Text>,
    },
    {
      title: 'Currency',
      dataIndex: 'currencyCode',
      width: 70,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Business Unit',
      dataIndex: 'businessUnit',
      width: 180,
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 11 }} ellipsis>{v}</Text>,
    },
    {
      title: 'Module',
      dataIndex: 'moduleName',
      width: 65,
      render: (v: string) => <Tag color="blue" style={{ fontSize: 10 }}>{v}</Tag>,
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px 24px', background: REDWOOD.neutral100, minHeight: '100vh' }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/ap')} size="small" />
          <div>
            <Title level={4} style={{ margin: 0, color: REDWOOD.primary }}>
              <AccountBookOutlined style={{ marginRight: 8 }} />
              Manage Subledger Journals
            </Title>
            <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>
              Review and query subledger accounting entries from SLA tables
            </Text>
          </div>
        </Space>
      </div>

      {/* ── Summary KPI strip ─────────────────────────────────────────────── */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {[
          { label: 'Draft',    value: stats.draft,  color: REDWOOD.warning, icon: <ClockCircleOutlined /> },
          { label: 'Posted',   value: stats.posted, color: REDWOOD.success, icon: <CheckCircleOutlined /> },
          { label: 'Error',    value: stats.error,  color: REDWOOD.error,   icon: <WarningOutlined /> },
        ].map(s => (
          <Col key={s.label} xs={8} md={4}>
            <Card size="small" styles={{ body: { padding: '10px 14px' } }}>
              <Statistic
                title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{s.label}</Text>}
                value={s.value}
                valueStyle={{ fontSize: 20, fontWeight: 700, color: s.color }}
                prefix={s.icon}
              />
            </Card>
          </Col>
        ))}
        {activeTab === 'lines' && stats.totalDr > 0 && (
          <>
            <Col xs={12} md={5}>
              <Card size="small" styles={{ body: { padding: '10px 14px' } }}>
                <Statistic
                  title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Total Debit</Text>}
                  value={stats.totalDr}
                  precision={2}
                  valueStyle={{ fontSize: 16, fontWeight: 700, color: REDWOOD.info }}
                  prefix={<DollarOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} md={5}>
              <Card size="small" styles={{ body: { padding: '10px 14px' } }}>
                <Statistic
                  title={<Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Total Credit</Text>}
                  value={stats.totalCr}
                  precision={2}
                  valueStyle={{ fontSize: 16, fontWeight: 700, color: REDWOOD.error }}
                  prefix={<DollarOutlined />}
                />
              </Card>
            </Col>
          </>
        )}
      </Row>

      {/* ── Main tabs ────────────────────────────────────────────────────── */}
      <Card styles={{ body: { padding: 0 } }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          style={{ padding: '0 16px' }}
          items={[
            // ═══════════════════════════════════════════════════════════════
            // TAB 1 — Journal Entries (headers)
            // ═══════════════════════════════════════════════════════════════
            {
              key: 'headers',
              label: (
                <Space>
                  <FileSearchOutlined />
                  Journal Entries
                  {headerTotal > 0 && <Badge count={headerTotal} color={REDWOOD.info} />}
                </Space>
              ),
              children: (
                <div style={{ padding: '0 0 16px' }}>

                  {/* Search panel */}
                  <div style={{ background: REDWOOD.neutral100, padding: '14px 16px', borderBottom: `1px solid ${REDWOOD.neutral200}`, marginBottom: 0 }}>
                    <Form
                      form={headerForm}
                      layout="vertical"
                      size="small"
                      onFinish={fetchHeaders}
                      initialValues={{ status: '', moduleName: 'AP' }}
                    >
                      <Row gutter={[12, 0]} align="bottom">
                        <Col xs={24} sm={12} md={6}>
                          <Form.Item label="Accounting Date" name="dateRange" style={{ marginBottom: 8 }}>
                            <RangePicker
                              format="DD-MMM-YYYY"
                              style={{ width: '100%' }}
                              placeholder={['From', 'To']}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={3}>
                          <Form.Item label="Status" name="status" style={{ marginBottom: 8 }}>
                            <Select allowClear placeholder="All">
                              <Option value="">All</Option>
                              <Option value="DRAFT">Draft</Option>
                              <Option value="POSTED">Posted</Option>
                              <Option value="ERROR">Error</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={3}>
                          <Form.Item label="Module" name="moduleName" style={{ marginBottom: 8 }}>
                            <Select allowClear placeholder="All">
                              <Option value="">All</Option>
                              <Option value="AP">AP</Option>
                              <Option value="AR">AR</Option>
                              <Option value="GL">GL</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={4}>
                          <Form.Item label="Source Table" name="sourceTable" style={{ marginBottom: 8 }}>
                            <Select allowClear placeholder="All">
                              <Option value="">All</Option>
                              <Option value="AP_INVOICES">AP_INVOICES</Option>
                              <Option value="AP_PAYMENTS">AP_PAYMENTS</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={4}>
                          <Form.Item label="Event Type" name="eventType" style={{ marginBottom: 8 }}>
                            <Select allowClear placeholder="All">
                              <Option value="">All</Option>
                              <Option value="AP_INVOICE_CREATION">AP Invoice Creation</Option>
                              <Option value="AP_INVOICE_PAYMENT">AP Invoice Payment</Option>
                              <Option value="INVOICE_VALIDATED">Invoice Validated</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={3}>
                          <Form.Item label="Period" name="period" style={{ marginBottom: 8 }}>
                            <Input placeholder="e.g. Mar-26" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={4}>
                          <Form.Item label="Transaction #" name="sourceNumber" style={{ marginBottom: 8 }}>
                            <Input placeholder="Invoice / Payment #" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={3} style={{ marginBottom: 8 }}>
                          <Space>
                            <Button
                              type="primary"
                              htmlType="submit"
                              icon={<SearchOutlined />}
                              loading={headerLoading}
                              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                            >
                              Search
                            </Button>
                            <Button
                              icon={<ReloadOutlined />}
                              onClick={() => { headerForm.resetFields(); setHeaders([]); setHeaderTotal(0); }}
                            >
                              Reset
                            </Button>
                          </Space>
                        </Col>
                      </Row>
                    </Form>
                  </div>

                  <Divider style={{ margin: 0 }} />

                  {/* Results info */}
                  {headerTotal > 0 && (
                    <div style={{ padding: '8px 16px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
                      <Space>
                        <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>
                          {headerTotal} journal entr{headerTotal === 1 ? 'y' : 'ies'} found
                        </Text>
                        <Tag color="warning">{stats.draft} Draft</Tag>
                        <Tag color="success">{stats.posted} Posted</Tag>
                        {stats.error > 0 && <Tag color="error">{stats.error} Error</Tag>}
                      </Space>
                    </div>
                  )}

                  {/* Headers table */}
                  <Table
                    dataSource={headers}
                    columns={headerColumns}
                    loading={headerLoading}
                    size="small"
                    bordered
                    scroll={{ x: 1400 }}
                    pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `${t} entries` }}
                    style={{ fontSize: 12 }}
                    locale={{ emptyText: 'Search to load subledger journal entries' }}
                    rowClassName={(r) => r.accountingStatus === 'ERROR' ? 'ant-table-row-error' : ''}
                    expandable={{
                      expandedRowRender: (r: SlaHeader) => (
                        <div style={{ padding: '8px 16px', background: REDWOOD.neutral100 }}>
                          <Row gutter={24}>
                            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Header ID:</Text> <Text code>{r.headerId}</Text></Col>
                            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Source ID:</Text> <Text code>{r.sourceId}</Text></Col>
                            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Source Type:</Text> <Text style={{ fontSize: 11 }}>{r.sourceType}</Text></Col>
                            <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Ledger:</Text> <Text style={{ fontSize: 11 }}>{r.ledgerName}</Text></Col>
                            {r.glBatchId && <><Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>GL Batch ID:</Text> <Text code>{r.glBatchId}</Text></Col><Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>GL Header ID:</Text> <Text code>{r.glHeaderId}</Text></Col><Col span={12}><Text type="secondary" style={{ fontSize: 11 }}>GL Batch Name:</Text> <Text style={{ fontSize: 11 }}>{r.glBatchName}</Text></Col></>}
                            {r.postedDate && <Col span={12}><Text type="secondary" style={{ fontSize: 11 }}>Posted:</Text> <Text style={{ fontSize: 11 }}>{r.postedDate} by {r.postedBy}</Text></Col>}
                            <Col span={12}><Text type="secondary" style={{ fontSize: 11 }}>Created:</Text> <Text style={{ fontSize: 11 }}>{r.creationDate} by {r.createdBy}</Text></Col>
                          </Row>
                        </div>
                      ),
                    }}
                    summary={(data) => {
                      if (data.length === 0) return null;
                      return (
                        <Table.Summary.Row style={{ background: REDWOOD.neutral100, fontWeight: 700 }}>
                          <Table.Summary.Cell index={0} colSpan={6}>
                            <Text strong>Total: {data.length} entries</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={6} align="center">
                            <Badge count={data.reduce((s, r) => s + (r.lineCount || 0), 0)} color={REDWOOD.info} />
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={7} colSpan={5} />
                        </Table.Summary.Row>
                      );
                    }}
                  />
                </div>
              ),
            },

            // ═══════════════════════════════════════════════════════════════
            // TAB 2 — Journal Entry Lines
            // ═══════════════════════════════════════════════════════════════
            {
              key: 'lines',
              label: (
                <Space>
                  <UnorderedListOutlined />
                  Journal Entry Lines
                  {lineTotal > 0 && <Badge count={lineTotal} color={REDWOOD.info} />}
                </Space>
              ),
              children: (
                <div style={{ padding: '0 0 16px' }}>

                  {/* Search panel */}
                  <div style={{ background: REDWOOD.neutral100, padding: '14px 16px', borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
                    <Form
                      form={lineForm}
                      layout="vertical"
                      size="small"
                      onFinish={fetchLines}
                      initialValues={{ status: '', moduleName: 'AP' }}
                    >
                      <Row gutter={[12, 0]} align="bottom">
                        <Col xs={24} sm={12} md={6}>
                          <Form.Item label="Accounting Date" name="dateRange" style={{ marginBottom: 8 }}>
                            <RangePicker
                              format="DD-MMM-YYYY"
                              style={{ width: '100%' }}
                              placeholder={['From', 'To']}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={3}>
                          <Form.Item label="Status" name="status" style={{ marginBottom: 8 }}>
                            <Select allowClear placeholder="All">
                              <Option value="">All</Option>
                              <Option value="DRAFT">Draft</Option>
                              <Option value="POSTED">Posted</Option>
                              <Option value="ERROR">Error</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={3}>
                          <Form.Item label="Module" name="moduleName" style={{ marginBottom: 8 }}>
                            <Select allowClear placeholder="All">
                              <Option value="">All</Option>
                              <Option value="AP">AP</Option>
                              <Option value="AR">AR</Option>
                              <Option value="GL">GL</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={3}>
                          <Form.Item label="Line Type" name="lineType" style={{ marginBottom: 8 }}>
                            <Select allowClear placeholder="All">
                              <Option value="">All</Option>
                              <Option value="DR">Debit (DR)</Option>
                              <Option value="CR">Credit (CR)</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={4}>
                          <Form.Item label="Accounting Class" name="acctClass" style={{ marginBottom: 8 }}>
                            <Select allowClear placeholder="All">
                              <Option value="">All</Option>
                              <Option value="EXPENSE">Expense</Option>
                              <Option value="LIABILITY">Liability</Option>
                              <Option value="TAX">Tax</Option>
                              <Option value="PREPAYMENT">Prepayment</Option>
                              <Option value="ASSET">Asset</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={4}>
                          <Form.Item label="Account Combination" name="account" style={{ marginBottom: 8 }}>
                            <Input placeholder="e.g. 01-100-7010-..." />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={4}>
                          <Form.Item label="Transaction #" name="sourceNumber" style={{ marginBottom: 8 }}>
                            <Input placeholder="Invoice / Payment #" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={3} style={{ marginBottom: 8 }}>
                          <Space>
                            <Button
                              type="primary"
                              htmlType="submit"
                              icon={<SearchOutlined />}
                              loading={lineLoading}
                              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                            >
                              Search
                            </Button>
                            <Button
                              icon={<ReloadOutlined />}
                              onClick={() => { lineForm.resetFields(); setLines([]); setLineTotal(0); }}
                            >
                              Reset
                            </Button>
                          </Space>
                        </Col>
                      </Row>
                    </Form>
                  </div>

                  <Divider style={{ margin: 0 }} />

                  {/* Results info + totals */}
                  {lineTotal > 0 && (
                    <div style={{ padding: '8px 16px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
                      <Space wrap>
                        <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>
                          {lineTotal} line{lineTotal === 1 ? '' : 's'} found
                        </Text>
                        <Divider type="vertical" />
                        <Text style={{ fontSize: 12 }}>
                          Total DR: <Text strong style={{ color: REDWOOD.info }}>{formatAmount(stats.totalDr)}</Text>
                        </Text>
                        <Text style={{ fontSize: 12 }}>
                          Total CR: <Text strong style={{ color: REDWOOD.error }}>{formatAmount(stats.totalCr)}</Text>
                        </Text>
                        {Math.abs(stats.totalDr - stats.totalCr) < 0.01 && stats.totalDr > 0 && (
                          <Tag color="success" icon={<CheckCircleOutlined />}>Balanced</Tag>
                        )}
                      </Space>
                    </div>
                  )}

                  {/* Lines table */}
                  <Table
                    dataSource={lines}
                    columns={lineColumns}
                    loading={lineLoading}
                    size="small"
                    bordered
                    scroll={{ x: 1500 }}
                    pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `${t} lines` }}
                    locale={{ emptyText: 'Search to load subledger accounting lines' }}
                    summary={(data) => {
                      if (data.length === 0) return null;
                      const totalDr = data.reduce((s, r) => s + (r.enteredDr || 0), 0);
                      const totalCr = data.reduce((s, r) => s + (r.enteredCr || 0), 0);
                      return (
                        <Table.Summary.Row style={{ background: REDWOOD.neutral100, fontWeight: 700 }}>
                          <Table.Summary.Cell index={0} colSpan={3}>
                            <Text strong>Total: {data.length} lines</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={3} colSpan={3} />
                          <Table.Summary.Cell index={6} align="right">
                            <Text strong style={{ color: REDWOOD.info }}>{formatAmount(totalDr)}</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={7} align="right">
                            <Text strong style={{ color: REDWOOD.error }}>{formatAmount(totalCr)}</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={8} colSpan={4} />
                        </Table.Summary.Row>
                      );
                    }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default ManageSLAJournals;
