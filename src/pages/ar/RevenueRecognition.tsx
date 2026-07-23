import React, { useState, useEffect, useMemo } from 'react';
import {
  Layout, Card, Typography, Table, Button, Space, Tag, Breadcrumb, Tabs,
  message, Input, Tooltip, Row, Col, Statistic, Modal, Alert,
} from 'antd';
import {
  HomeOutlined, ReloadOutlined, ThunderboltOutlined, SearchOutlined,
  FileExcelOutlined, ApiOutlined, DollarOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { ColumnsType } from 'antd/es/table';
import FloatingMenu from '../../components/FloatingMenu';
import { APEX_DB_CONFIG } from '../../config/api.config';
import { useAuth } from '../../context/AuthContext';
import {
  getRevenueContracts, getRevenueSchedules,
} from '../../services/revenue.service';
import type { RevenueContract, RevenueSchedule } from '../../services/revenue.service';

const { Content } = Layout;
const { Title, Text } = Typography;

const REDWOOD = {
  primary: '#C74634', success: '#1D7B4D', warning: '#D4A800', info: '#0572CE',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral500: '#8C8C8C',
};

const fmt = (v: number | null | undefined) =>
  v == null ? '—' : new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));

// Parse the contract date strings (MM/DD/YYYY, YYYY-MM-DD, DD-MON-YYYY seen).
const parseFlexDate = (s: string): Date | null => {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);                 // YYYY-MM-DD
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);                // MM/DD/YYYY
  if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
  const d = new Date(t);                                        // DD-MON-YYYY etc.
  return isNaN(d.getTime()) ? null : d;
};

// Inclusive month count, matching CEIL(MONTHS_BETWEEN(end+1, start)) in the DB.
const contractMonths = (startStr: string, endStr: string): number | null => {
  const start = parseFlexDate(startStr);
  const end = parseFlexDate(endStr);
  if (!start || !end) return null;
  const endPlus = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  const diff = (endPlus.getFullYear() - start.getFullYear()) * 12
             + (endPlus.getMonth() - start.getMonth())
             + (endPlus.getDate() - start.getDate()) / 31;
  return Math.max(1, Math.ceil(diff));
};

const RevenueRecognition: React.FC = () => {
  const { user } = useAuth();
  const loggedUser = user?.username || user?.name || 'REACTERP';

  const [tab, setTab] = useState('contracts');

  // Contracts
  const [contracts, setContracts] = useState<RevenueContract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [generating, setGenerating] = useState(false);
  const [contractSearch, setContractSearch] = useState('');

  // Generate-schedule debug modal
  const [genOpen, setGenOpen] = useState(false);
  const [genStatus, setGenStatus] = useState<number | null>(null);
  const [genResponse, setGenResponse] = useState<string>('');

  const GEN_URL = `${APEX_DB_CONFIG.baseUrl}/ar/revenue-schedules/generate`;
  const genPayload = { contractIds: selectedKeys.map(Number), createdBy: loggedUser };

  // Schedules
  const [schedules, setSchedules] = useState<RevenueSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [scheduleSearch, setScheduleSearch] = useState('');

  const loadContracts = async () => {
    setContractsLoading(true);
    try { setContracts(await getRevenueContracts()); }
    catch (e: any) { message.error(`Failed to load contracts: ${e.message}`); }
    finally { setContractsLoading(false); }
  };

  const loadSchedules = async () => {
    setSchedulesLoading(true);
    try { setSchedules(await getRevenueSchedules()); }
    catch (e: any) { message.error(`Failed to load schedules: ${e.message}`); }
    finally { setSchedulesLoading(false); }
  };

  useEffect(() => { loadContracts(); loadSchedules(); }, []);

  const openGenerate = () => {
    if (selectedKeys.length === 0) { message.warning('Select one or more contracts'); return; }
    setGenStatus(null);
    setGenResponse('');
    setGenOpen(true);
  };

  // Runs the POST directly (not via the service) so we can show the exact URL,
  // payload, HTTP status and raw response body for debugging.
  const runGenerate = async () => {
    setGenerating(true);
    setGenStatus(null);
    setGenResponse('');
    try {
      const res = await fetch(GEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(genPayload),
      });
      setGenStatus(res.status);
      const text = await res.text();
      setGenResponse(text);
      let data: any = {};
      try { data = JSON.parse(text); } catch { /* non-JSON response */ }
      if (res.ok && data.success) {
        message.success(`Generated ${data.schedules} schedule line(s) for ${data.contracts} contract(s)`);
        setSelectedKeys([]);
        await Promise.all([loadContracts(), loadSchedules()]);
        setGenOpen(false);
        setTab('schedules');
      } else {
        message.error(data.error || `Generation failed (HTTP ${res.status})`);
      }
    } catch (e: any) {
      setGenResponse(e?.message || 'Network error');
      message.error(e?.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const showApi = () => {
    const c = `GET  ${APEX_DB_CONFIG.baseUrl}/ar/revenue-contracts`;
    const g = `POST ${APEX_DB_CONFIG.baseUrl}/ar/revenue-schedules/generate   { "contractIds":[...] }`;
    const s = `GET  ${APEX_DB_CONFIG.baseUrl}/ar/revenue-schedules`;
    message.info(<div style={{ textAlign: 'left', fontFamily: 'monospace', fontSize: 11 }}>{c}<br />{g}<br />{s}</div>, 8);
  };

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const filteredContracts = useMemo(() => {
    const q = contractSearch.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter(c =>
      [c.trxNumber, c.unit, c.location, c.tenant, c.status].some(v => v != null && String(v).toLowerCase().includes(q)));
  }, [contracts, contractSearch]);

  const filteredSchedules = useMemo(() => {
    const q = scheduleSearch.trim().toLowerCase();
    if (!q) return schedules;
    return schedules.filter(s =>
      [s.trxNumber, s.unit, s.location, s.tenant, s.periodName, s.invoiceNumber, s.status, s.accountStatus]
        .some(v => v != null && String(v).toLowerCase().includes(q)));
  }, [schedules, scheduleSearch]);

  const scheduleTotal = useMemo(() => filteredSchedules.reduce((s, r) => s + (Number(r.amount) || 0), 0), [filteredSchedules]);

  // ── Columns ────────────────────────────────────────────────────────────────
  const contractCols: ColumnsType<RevenueContract> = [
    { title: 'Trx #', dataIndex: 'trxNumber', key: 'trxNumber', width: 100, sorter: (a, b) => (a.trxNumber || 0) - (b.trxNumber || 0),
      render: (v) => <Text strong>{v ?? '—'}</Text> },
    { title: 'Unit', dataIndex: 'unit', key: 'unit', width: 120 },
    { title: 'Location', dataIndex: 'location', key: 'location', width: 150, ellipsis: true },
    { title: 'Tenant', dataIndex: 'tenant', key: 'tenant', width: 180, ellipsis: true },
    { title: 'Start', dataIndex: 'contractStartDate', key: 'contractStartDate', width: 110 },
    { title: 'End', dataIndex: 'contractEndDate', key: 'contractEndDate', width: 110 },
    { title: 'Total Periods', key: 'periods', width: 110, align: 'center' as const,
      render: (_: any, r: RevenueContract) => {
        const n = contractMonths(r.contractStartDate, r.contractEndDate);
        return n == null ? <Text type="secondary">—</Text> : <Tag color="purple">{n} mo</Tag>;
      } },
    { title: 'Rent Total', dataIndex: 'rentTotal', key: 'rentTotal', width: 130, align: 'right' as const,
      sorter: (a, b) => (a.rentTotal || 0) - (b.rentTotal || 0),
      render: (v) => <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={String(v).toUpperCase() === 'ACTIVE' ? 'green' : 'default'}>{v || '—'}</Tag> },
    { title: 'Schedules', dataIndex: 'scheduleCount', key: 'scheduleCount', width: 100, align: 'center' as const,
      render: (v: number) => v > 0 ? <Tag color="blue">{v}</Tag> : <Text type="secondary">—</Text> },
  ];

  const scheduleCols: ColumnsType<RevenueSchedule> = [
    { title: 'Trx #', dataIndex: 'trxNumber', key: 'trxNumber', width: 90, sorter: (a, b) => (a.trxNumber || 0) - (b.trxNumber || 0),
      render: (v) => <Text strong>{v ?? '—'}</Text> },
    { title: 'Invoice #', dataIndex: 'invoiceNumber', key: 'invoiceNumber', width: 120,
      render: (v: string) => v || <Text type="secondary">—</Text> },
    { title: 'Unit', dataIndex: 'unit', key: 'unit', width: 110 },
    { title: 'Location', dataIndex: 'location', key: 'location', width: 140, ellipsis: true },
    { title: 'Tenant', dataIndex: 'tenant', key: 'tenant', width: 160, ellipsis: true },
    { title: '#', dataIndex: 'scheduleNum', key: 'scheduleNum', width: 55, align: 'right' as const },
    { title: 'Month', dataIndex: 'periodName', key: 'periodName', width: 90,
      render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right' as const,
      sorter: (a, b) => (a.amount || 0) - (b.amount || 0),
      render: (v) => <Text style={{ fontFamily: 'monospace' }}>{fmt(v)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={String(v).toUpperCase() === 'PENDING' ? 'orange' : 'green'}>{v || '—'}</Tag> },
    { title: 'Acct Status', dataIndex: 'accountStatus', key: 'accountStatus', width: 120,
      render: (v: string) => <Tag color={String(v).toUpperCase() === 'ACCOUNTED' ? 'green' : 'default'}>{v || '—'}</Tag> },
  ];

  const exportSchedules = () => {
    if (filteredSchedules.length === 0) { message.warning('No schedules to export'); return; }
    const data = filteredSchedules.map(s => ({
      'Trx #': s.trxNumber, 'Invoice #': s.invoiceNumber || '', 'Unit': s.unit, 'Location': s.location,
      'Tenant': s.tenant, 'Schedule #': s.scheduleNum, 'Month': s.periodName, 'Period Date': s.periodDate,
      'Amount': Number(s.amount) || 0, 'Status': s.status, 'Account Status': s.accountStatus,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Revenue Schedules');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf], { type: 'application/octet-stream' }), `revenue_schedules_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
      <Content>
        <div style={{ padding: '16px 24px 0' }}>
          <Breadcrumb items={[
            { title: <Link to="/"><HomeOutlined /> Home</Link> },
            { title: 'Receivables' },
            { title: 'Revenue Recognition' },
          ]} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0' }}>
            <div>
              <Title level={3} style={{ margin: 0 }}>Revenue Recognition</Title>
              <Text type="secondary">Generate monthly revenue schedules from rental contracts</Text>
            </div>
            <Tooltip title="Show API endpoints">
              <Button icon={<ApiOutlined />} onClick={showApi}>API</Button>
            </Tooltip>
          </div>
        </div>

        <div style={{ padding: '0 24px 24px' }}>
          <Card styles={{ body: { padding: 12 } }}>
            <Tabs
              activeKey={tab}
              onChange={setTab}
              items={[
                {
                  key: 'contracts',
                  label: `Revenue Contracts (${contracts.length})`,
                  children: (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                        <Input allowClear prefix={<SearchOutlined />} placeholder="Filter contracts…"
                          value={contractSearch} onChange={e => setContractSearch(e.target.value)} style={{ width: 260 }} />
                        <Space>
                          <Button icon={<ReloadOutlined />} onClick={loadContracts} loading={contractsLoading}>Refresh</Button>
                          <Button type="primary" icon={<ThunderboltOutlined />}
                            disabled={selectedKeys.length === 0}
                            style={selectedKeys.length > 0 ? { background: REDWOOD.primary, borderColor: REDWOOD.primary } : {}}
                            onClick={openGenerate}>
                            Generate Schedule ({selectedKeys.length})
                          </Button>
                        </Space>
                      </div>
                      <Table
                        rowKey="id"
                        columns={contractCols}
                        dataSource={filteredContracts}
                        loading={contractsLoading}
                        size="small"
                        scroll={{ x: 1100 }}
                        rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
                        pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'], showTotal: (t) => `${t} contracts` }}
                      />
                    </>
                  ),
                },
                {
                  key: 'schedules',
                  label: `Revenue Schedules (${schedules.length})`,
                  children: (
                    <>
                      <Row gutter={12} style={{ marginBottom: 12 }}>
                        <Col xs={12} md={6}>
                          <Card size="small"><Statistic title={<Text style={{ fontSize: 11 }}>Schedule Lines</Text>} value={filteredSchedules.length} valueStyle={{ fontSize: 16 }} /></Card>
                        </Col>
                        <Col xs={12} md={6}>
                          <Card size="small"><Statistic title={<Text style={{ fontSize: 11 }}>Total Amount</Text>} value={scheduleTotal} precision={2} prefix={<DollarOutlined />} valueStyle={{ fontSize: 15, color: REDWOOD.primary }} /></Card>
                        </Col>
                      </Row>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                        <Input allowClear prefix={<SearchOutlined />} placeholder="Filter schedules…"
                          value={scheduleSearch} onChange={e => setScheduleSearch(e.target.value)} style={{ width: 260 }} />
                        <Space>
                          <Button icon={<FileExcelOutlined />} style={{ color: REDWOOD.success, borderColor: REDWOOD.success }} onClick={exportSchedules}>Excel</Button>
                          <Button icon={<ReloadOutlined />} onClick={loadSchedules} loading={schedulesLoading}>Refresh</Button>
                        </Space>
                      </div>
                      <Table
                        rowKey="id"
                        columns={scheduleCols}
                        dataSource={filteredSchedules}
                        loading={schedulesLoading}
                        size="small"
                        scroll={{ x: 1150 }}
                        pagination={{ pageSize: 100, showSizeChanger: true, pageSizeOptions: ['50', '100', '200', '500'], showTotal: (t) => `${t} schedule lines` }}
                        summary={() => filteredSchedules.length === 0 ? null : (
                          <Table.Summary fixed>
                            <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 600 }}>
                              <Table.Summary.Cell index={0} colSpan={7}><Text strong>Total ({filteredSchedules.length})</Text></Table.Summary.Cell>
                              <Table.Summary.Cell index={7} align="right"><Text strong style={{ fontFamily: 'monospace', color: REDWOOD.primary }}>{fmt(scheduleTotal)}</Text></Table.Summary.Cell>
                              <Table.Summary.Cell index={8} colSpan={2} />
                            </Table.Summary.Row>
                          </Table.Summary>
                        )}
                      />
                    </>
                  ),
                },
              ]}
            />
          </Card>
        </div>

        {/* ── Generate Schedule — debug/confirm modal ── */}
        <Modal
          open={genOpen}
          onCancel={() => { if (!generating) setGenOpen(false); }}
          maskClosable={!generating}
          width={720}
          title={<Space><ThunderboltOutlined style={{ color: REDWOOD.primary }} /><span>Generate Revenue Schedule</span></Space>}
          footer={
            <Space>
              <Button disabled={generating} onClick={() => setGenOpen(false)}>Close</Button>
              <Button type="primary" loading={generating}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                onClick={runGenerate}>
                Run Generate ({selectedKeys.length})
              </Button>
            </Space>
          }
        >
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Method / URL</div>
          <Typography.Text copyable code style={{ fontSize: 12, wordBreak: 'break-all' }}>{`POST ${GEN_URL}`}</Typography.Text>

          <div style={{ fontSize: 12, color: '#888', margin: '12px 0 4px' }}>Request Body (JSON)</div>
          <pre style={{ fontSize: 11, background: '#0d0d0d', color: '#a8ff78', borderRadius: 4, padding: 10, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(genPayload, null, 2)}
          </pre>

          {genStatus != null && (
            <>
              <div style={{ fontSize: 12, color: '#888', margin: '12px 0 4px' }}>
                Response — HTTP <b style={{ color: genStatus >= 200 && genStatus < 300 ? REDWOOD.success : REDWOOD.primary }}>{genStatus}</b>
              </div>
              <pre style={{ fontSize: 11, background: '#0d0d0d', color: '#79c0ff', borderRadius: 4, padding: 10, maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {genResponse || '(empty)'}
              </pre>
              {genStatus === 404 && (
                <Alert type="warning" showIcon style={{ marginTop: 8, fontSize: 12 }}
                  message="404 — the webservice isn't deployed. Run database/ar/rr_ar_revenue.sql in APEX SQL Workshop (it registers POST ar/revenue-schedules/generate)." />
              )}
            </>
          )}
        </Modal>

        <FloatingMenu />
      </Content>
    </Layout>
  );
};

export default RevenueRecognition;
