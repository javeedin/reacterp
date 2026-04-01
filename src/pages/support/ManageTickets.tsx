import React, { useState, useCallback, useEffect } from 'react';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Form, Input, Select,
  DatePicker, Row, Col, Space, Tag, Tooltip, Tabs, Modal, Badge, Divider,
  message, Empty, Statistic, Collapse, Alert,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, BugOutlined, SearchOutlined, ReloadOutlined,
  CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined,
  PaperClipOutlined, MessageOutlined, CloseCircleOutlined, PlusOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const APEX_BASE = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp';

const REDWOOD = {
  primary: '#C74634', info: '#0572CE', success: '#1D7B4D',
  warning: '#D4A800', error: '#D93025',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

// ── Types ─────────────────────────────────────────────────────
interface Ticket {
  ticketId:       number;
  ticketNumber:   string;
  title:          string;
  module:         string;
  pageName:       string;
  pageUrl:        string;
  feature:        string;
  priority:       string;
  status:         string;
  assignedTo:     string;
  createdBy:      string;
  creationDate:   string;
  lastUpdateDate: string;
  resolvedBy:     string;
  resolutionDate: string;
  lineCount:      number;
  attachCount:    number;
}

interface TicketLine {
  lineId:       number;
  lineNumber:   number;
  lineType:     string;
  description:  string;
  createdBy:    string;
  creationDate: string;
}

interface TicketAttachment {
  attachmentId: number;
  fileName:     string;
  fileType:     string;
  fileSize:     number;
  createdBy:    string;
  creationDate: string;
  data:         string;
}

interface TicketDetail {
  ticket:      Ticket & { description: string; resolutionNotes: string };
  lines:       TicketLine[];
  attachments: TicketAttachment[];
}

interface DashboardData {
  summary: { open: number; inProgress: number; resolved: number; closed: number };
  byModule: { module: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  recentOpen: Ticket[];
}

// ── Helpers ───────────────────────────────────────────────────
const PRIORITY_COLOR: Record<string, string> = {
  LOW: 'default', MEDIUM: 'blue', HIGH: 'orange', CRITICAL: 'red',
};
const STATUS_COLOR: Record<string, string> = {
  OPEN: 'processing', IN_PROGRESS: 'warning', RESOLVED: 'success', CLOSED: 'default',
};
const STATUS_ICON: Record<string, React.ReactNode> = {
  OPEN:        <ExclamationCircleOutlined />,
  IN_PROGRESS: <ClockCircleOutlined />,
  RESOLVED:    <CheckCircleOutlined />,
  CLOSED:      <CloseCircleOutlined />,
};

const fmtDate = (d?: string) => d ? dayjs(d).format('D-MMM-YYYY HH:mm') : '—';

const fmtSize = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

// ── Ticket Detail Modal ────────────────────────────────────────
const TicketDetailModal: React.FC<{
  ticketId: number | null;
  onClose:  () => void;
  onRefresh: () => void;
}> = ({ ticketId, onClose, onRefresh }) => {
  const [detail, setDetail]       = useState<TicketDetail | null>(null);
  const [loading, setLoading]     = useState(false);
  const [action, setAction]       = useState<string | null>(null);
  const [actionForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!ticketId) { setDetail(null); return; }
    setLoading(true);
    fetch(`${APEX_BASE}/support/tickets/${ticketId}`)
      .then(r => r.json())
      .then(d => setDetail(d.status === 'success' ? d : null))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [ticketId]);

  const doAction = async (act: string) => {
    let vals: any = {};
    if (action === act && (act === 'resolve' || act === 'comment')) {
      try { vals = await actionForm.validateFields(); } catch { return; }
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${APEX_BASE}/support/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId:         ticketId,
          action:           act,
          updatedBy:        'ERP_USER',
          comment:          vals.comment,
          resolutionNotes:  vals.resolutionNotes,
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        message.success(
          act === 'comment' ? 'Comment added' :
          act === 'resolve' ? 'Ticket resolved' :
          act === 'close'   ? 'Ticket closed'  :
          act === 'reopen'  ? 'Ticket reopened' : 'Updated'
        );
        setAction(null);
        actionForm.resetFields();
        // Reload detail
        const r2 = await fetch(`${APEX_BASE}/support/tickets/${ticketId}`);
        const d2 = await r2.json();
        if (d2.status === 'success') setDetail(d2);
        onRefresh();
      } else { message.error(data.message || 'Update failed'); }
    } catch (e: any) { message.error('Network error: ' + e.message); }
    finally { setSubmitting(false); }
  };

  const t = detail?.ticket;

  return (
    <Modal
      open={!!ticketId}
      onCancel={onClose}
      width={860}
      footer={null}
      title={
        t ? (
          <Space>
            <BugOutlined style={{ color: '#cf1322' }} />
            <Text strong>{t.ticketNumber}</Text>
            <Tag color={STATUS_COLOR[t.status]}>{t.status.replace('_', ' ')}</Tag>
            <Tag color={PRIORITY_COLOR[t.priority]}>{t.priority}</Tag>
          </Space>
        ) : 'Ticket Details'
      }
    >
      {loading && <div style={{ textAlign: 'center', padding: 32 }}>Loading…</div>}
      {!loading && t && (
        <div>
          {/* Header info */}
          <Title level={5} style={{ margin: '0 0 4px' }}>{t.title}</Title>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              ['Module', t.module], ['Page', t.pageName], ['Feature', t.feature],
              ['Created By', t.createdBy], ['Date', fmtDate(t.creationDate)],
            ].map(([k, v]) => v ? (
              <Text key={k} style={{ fontSize: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>{k}: </Text>{v}
              </Text>
            ) : null)}
          </div>
          {t.description && (
            <Alert type="info" showIcon={false} message={<Text style={{ fontSize: 13 }}>{t.description}</Text>}
              style={{ marginBottom: 12 }} />
          )}
          {t.pageUrl && (
            <Text code style={{ fontSize: 11, display: 'block', marginBottom: 12 }}>{t.pageUrl}</Text>
          )}

          {/* Issues / Comments timeline */}
          <Divider style={{ margin: '8px 0 12px' }} />
          <Text strong style={{ fontSize: 13 }}>Issues & Activity</Text>
          <div style={{ margin: '10px 0', maxHeight: 300, overflowY: 'auto' }}>
            {(detail?.lines ?? []).map(l => (
              <div key={l.lineId} style={{
                padding: '8px 12px', marginBottom: 6, borderRadius: 6,
                background: l.lineType === 'RESOLUTION' ? '#f6ffed'
                           : l.lineType === 'COMMENT'   ? '#f0f5ff'
                           : '#fafafa',
                border: `1px solid ${l.lineType === 'RESOLUTION' ? '#b7eb8f' : l.lineType === 'COMMENT' ? '#adc6ff' : '#f0f0f0'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Tag color={l.lineType === 'RESOLUTION' ? 'success' : l.lineType === 'COMMENT' ? 'blue' : 'default'}
                    style={{ fontSize: 11 }}>
                    {l.lineType}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {l.createdBy} · {fmtDate(l.creationDate)}
                  </Text>
                </div>
                <Text style={{ fontSize: 13 }}>{l.description}</Text>
              </div>
            ))}
            {!(detail?.lines?.length) && (
              <Empty description="No activity yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>

          {/* Attachments */}
          {(detail?.attachments?.length ?? 0) > 0 && (
            <>
              <Divider style={{ margin: '8px 0 12px' }} />
              <Text strong style={{ fontSize: 13 }}>
                Attachments <Tag color="blue">{detail!.attachments.length}</Tag>
              </Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {detail!.attachments.map(a => (
                  <div key={a.attachmentId} style={{
                    border: '1px solid #f0f0f0', borderRadius: 6, overflow: 'hidden',
                    width: a.fileType?.startsWith('image/') ? 120 : 'auto',
                  }}>
                    {a.fileType?.startsWith('image/') && a.data ? (
                      <img
                        src={`data:${a.fileType};base64,${a.data}`}
                        alt={a.fileName}
                        style={{ width: 120, height: 80, objectFit: 'cover', display: 'block' }}
                        onClick={() => window.open(`data:${a.fileType};base64,${a.data}`)}
                        title="Click to open"
                      />
                    ) : (
                      <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <PaperClipOutlined />
                        <div>
                          <Text style={{ fontSize: 12, display: 'block' }}>{a.fileName}</Text>
                          <Text type="secondary" style={{ fontSize: 11 }}>{fmtSize(a.fileSize)}</Text>
                        </div>
                      </div>
                    )}
                    <div style={{ padding: '2px 6px', background: '#fafafa' }}>
                      <Text type="secondary" style={{ fontSize: 10 }}>{a.fileName}</Text>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Resolution info */}
          {t.resolutionNotes && (
            <>
              <Divider style={{ margin: '8px 0 12px' }} />
              <Alert
                type="success" showIcon icon={<CheckCircleOutlined />}
                message={<Text strong>Resolution</Text>}
                description={t.resolutionNotes}
              />
              {t.resolvedBy && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Resolved by {t.resolvedBy} on {fmtDate(t.resolutionDate)}
                </Text>
              )}
            </>
          )}

          {/* Action panel */}
          <Divider style={{ margin: '12px 0 8px' }} />
          {action && (
            <div style={{ marginBottom: 12 }}>
              {action === 'comment' && (
                <Form form={actionForm} layout="vertical">
                  <Form.Item name="comment" label="Comment" rules={[{ required: true }]}>
                    <TextArea rows={3} placeholder="Add a comment…" />
                  </Form.Item>
                  <Space>
                    <Button type="primary" size="small" loading={submitting} onClick={() => doAction('comment')}>
                      Add Comment
                    </Button>
                    <Button size="small" onClick={() => { setAction(null); actionForm.resetFields(); }}>Cancel</Button>
                  </Space>
                </Form>
              )}
              {action === 'resolve' && (
                <Form form={actionForm} layout="vertical">
                  <Form.Item name="resolutionNotes" label="Resolution Notes" rules={[{ required: true }]}>
                    <TextArea rows={3} placeholder="Describe how the issue was resolved…" />
                  </Form.Item>
                  <Space>
                    <Button type="primary" size="small" loading={submitting}
                      style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
                      onClick={() => doAction('resolve')}>
                      Mark Resolved
                    </Button>
                    <Button size="small" onClick={() => { setAction(null); actionForm.resetFields(); }}>Cancel</Button>
                  </Space>
                </Form>
              )}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Button size="small" icon={<MessageOutlined />} onClick={() => setAction('comment')}>
                Add Comment
              </Button>
              {t.status !== 'RESOLVED' && t.status !== 'CLOSED' && (
                <Button size="small" icon={<CheckCircleOutlined />}
                  style={{ color: REDWOOD.success, borderColor: REDWOOD.success }}
                  onClick={() => setAction('resolve')}>
                  Resolve
                </Button>
              )}
              {t.status === 'RESOLVED' && (
                <Button size="small" icon={<CloseCircleOutlined />} onClick={() => doAction('close')}>
                  Close
                </Button>
              )}
              {(t.status === 'RESOLVED' || t.status === 'CLOSED') && (
                <Button size="small" icon={<ReloadOutlined />} onClick={() => doAction('reopen')}>
                  Reopen
                </Button>
              )}
            </Space>
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

// ── Main page ─────────────────────────────────────────────────
const ManageTickets: React.FC = () => {
  const [tickets, setTickets]         = useState<Ticket[]>([]);
  const [loading, setLoading]         = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [dashboard, setDashboard]     = useState<DashboardData | null>(null);
  const [selectedId, setSelectedId]   = useState<number | null>(null);
  const [searchOpen, setSearchOpen]   = useState(true);
  const [gridSearch, setGridSearch]   = useState('');
  const [searchForm] = Form.useForm();

  const loadDashboard = useCallback(async () => {
    try {
      const res  = await fetch(`${APEX_BASE}/support/dashboard`);
      const data = await res.json();
      if (data.status === 'success') setDashboard(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const handleSearch = useCallback(async () => {
    const v = searchForm.getFieldsValue();
    const p = new URLSearchParams();
    if (v.status)   p.set('status',    v.status);
    if (v.module)   p.set('module',    v.module);
    if (v.priority) p.set('priority',  v.priority);
    if (v.search)   p.set('search',    v.search);
    if (v.dateFrom) p.set('date_from', dayjs(v.dateFrom).format('YYYY-MM-DD'));
    if (v.dateTo)   p.set('date_to',   dayjs(v.dateTo).format('YYYY-MM-DD'));
    p.set('row_limit', '500');

    setLoading(true); setHasSearched(true);
    try {
      const res  = await fetch(`${APEX_BASE}/support/tickets?${p.toString()}`);
      const data = await res.json();
      if (data.status === 'success') {
        setTickets(data.items ?? []);
        if (!(data.items ?? []).length) message.info('No tickets found.');
      } else { message.error(data.message || 'Search failed.'); }
    } catch (e: any) { message.error('Network error: ' + e.message); }
    finally { setLoading(false); }
  }, [searchForm]);

  const handleReset = () => {
    searchForm.resetFields(); setTickets([]); setHasSearched(false); setGridSearch('');
  };

  const columns: ColumnsType<Ticket> = [
    {
      title: 'Ticket #', dataIndex: 'ticketNumber', width: 140,
      render: (v, r) => (
        <Button type="link" size="small" style={{ padding: 0, fontSize: 12 }}
          onClick={() => setSelectedId(r.ticketId)}>{v}</Button>
      ),
    },
    {
      title: 'Title', dataIndex: 'title', ellipsis: true,
      render: (v, r) => (
        <Tooltip title={v}>
          <Button type="link" size="small" style={{ padding: 0, fontSize: 12, textAlign: 'left' }}
            onClick={() => setSelectedId(r.ticketId)}>{v}</Button>
        </Tooltip>
      ),
    },
    { title: 'Module', dataIndex: 'module', width: 160, ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Page', dataIndex: 'pageName', width: 160, ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Priority', dataIndex: 'priority', width: 90,
      render: v => <Tag color={PRIORITY_COLOR[v] ?? 'default'} style={{ fontSize: 11 }}>{v}</Tag> },
    {
      title: 'Status', dataIndex: 'status', width: 120,
      render: v => <Tag color={STATUS_COLOR[v] ?? 'default'} icon={STATUS_ICON[v]} style={{ fontSize: 11 }}>
        {v.replace('_', ' ')}
      </Tag>,
    },
    { title: 'Issues', dataIndex: 'lineCount', width: 70, align: 'center',
      render: v => v > 0 ? <Badge count={v} color="#1890ff" /> : '—' },
    { title: 'Files', dataIndex: 'attachCount', width: 60, align: 'center',
      render: v => v > 0 ? <Badge count={v} color="#52c41a" /> : '—' },
    { title: 'Created By', dataIndex: 'createdBy', width: 110,
      render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Date', dataIndex: 'creationDate', width: 130,
      render: v => <Text style={{ fontSize: 12 }}>{fmtDate(v)}</Text> },
    {
      title: '', key: 'actions', width: 60, align: 'center',
      render: (_, r) => (
        <Button type="text" size="small" icon={<BugOutlined />}
          onClick={() => setSelectedId(r.ticketId)} />
      ),
    },
  ];

  const summary = dashboard?.summary;

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        <div style={{ padding: '14px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/support">Support</Link> },
            { title: 'Manage Tickets' },
          ]} />
        </div>

        <div style={{ padding: '0 24px 24px' }}>
          {/* ── Stats row ── */}
          {summary && (
            <Row gutter={[16, 16]} style={{ padding: '16px 0 4px' }}>
              {[
                { label: 'Open',        val: summary.open,       color: '#1890ff', icon: <ExclamationCircleOutlined /> },
                { label: 'In Progress', val: summary.inProgress, color: '#fa8c16', icon: <ClockCircleOutlined /> },
                { label: 'Resolved',    val: summary.resolved,   color: '#52c41a', icon: <CheckCircleOutlined /> },
                { label: 'Closed',      val: summary.closed,     color: '#8c8c8c', icon: <CloseCircleOutlined /> },
              ].map(s => (
                <Col key={s.label} xs={12} sm={6}>
                  <Card
                    size="small"
                    style={{ borderRadius: 8, borderLeft: `4px solid ${s.color}`, cursor: 'pointer' }}
                    styles={{ body: { padding: '12px 16px' } }}
                    onClick={() => {
                      searchForm.setFieldsValue({ status: s.label.replace(' ', '_').toUpperCase() === 'IN_PROGRESS' ? 'IN_PROGRESS' : s.label.toUpperCase() });
                      handleSearch();
                    }}
                  >
                    <Statistic
                      title={<Text style={{ fontSize: 12, color: '#666' }}>{s.label}</Text>}
                      value={s.val}
                      valueStyle={{ fontSize: 24, fontWeight: 700, color: s.color }}
                      prefix={React.cloneElement(s.icon as React.ReactElement, { style: { color: s.color, fontSize: 18 } })}
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          )}

          {/* Module breakdown */}
          {dashboard?.byModule && dashboard.byModule.length > 0 && (
            <div style={{ padding: '8px 0 4px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {dashboard.byModule.map(m => (
                <Tag
                  key={m.module}
                  color="geekblue" style={{ cursor: 'pointer' }}
                  onClick={() => { searchForm.setFieldsValue({ module: m.module }); handleSearch(); }}
                >
                  {m.module}: {m.count}
                </Tag>
              ))}
            </div>
          )}

          {/* Search panel */}
          <Collapse
            activeKey={searchOpen ? ['s'] : []}
            onChange={(k: string[]) => setSearchOpen(k.includes('s'))}
            style={{ marginTop: 12, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, background: REDWOOD.surface }}
            items={[{
              key: 's',
              label: <Text strong style={{ fontSize: 13 }}>Search</Text>,
              extra: (
                <Space size={8} onClick={e => e.stopPropagation()}>
                  <Button size="small" icon={<ReloadOutlined />}
                    onClick={e => { e.stopPropagation(); handleReset(); }}>Reset</Button>
                  <Button size="small" type="primary" icon={<SearchOutlined />} loading={loading}
                    onClick={e => { e.stopPropagation(); handleSearch(); }}
                    style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
                    Search
                  </Button>
                </Space>
              ),
              children: (
                <Form form={searchForm} layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }}>
                  <Row gutter={[24, 4]}>
                    <Col xs={24} md={8}>
                      <Form.Item label="Status" name="status" style={{ marginBottom: 10 }}>
                        <Select placeholder="Any" allowClear>
                          <Option value="OPEN">Open</Option>
                          <Option value="IN_PROGRESS">In Progress</Option>
                          <Option value="RESOLVED">Resolved</Option>
                          <Option value="CLOSED">Closed</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item label="Priority" name="priority" style={{ marginBottom: 10 }}>
                        <Select placeholder="Any" allowClear>
                          <Option value="LOW">Low</Option>
                          <Option value="MEDIUM">Medium</Option>
                          <Option value="HIGH">High</Option>
                          <Option value="CRITICAL">Critical</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item label="Module" name="module" style={{ marginBottom: 10 }}>
                        <Select placeholder="Any" allowClear showSearch>
                          {['General Ledger','Accounts Payable','Cash Management','Data Sync','Administration','General'].map(m => (
                            <Option key={m} value={m}>{m}</Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item label="Date From" name="dateFrom" style={{ marginBottom: 10 }}>
                        <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item label="Date To" name="dateTo" style={{ marginBottom: 10 }}>
                        <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item label="Search" name="search" style={{ marginBottom: 10 }}>
                        <Input placeholder="Ticket # or title…" />
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>
              ),
            }]}
          />

          {/* Results */}
          {hasSearched && (
            <Card
              style={{ marginTop: 12, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
              styles={{ body: { padding: 0 } }}
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Text strong>Results {tickets.length > 0 && <Tag color="blue">{tickets.length}</Tag>}</Text>
                  <Input
                    prefix={<SearchOutlined style={{ color: '#999' }} />}
                    placeholder="Filter results…"
                    size="small"
                    value={gridSearch}
                    onChange={e => setGridSearch(e.target.value)}
                    allowClear
                    style={{ width: 220 }}
                  />
                </div>
              }
            >
              {(() => {
                const q = gridSearch.trim().toLowerCase();
                const filtered = q
                  ? tickets.filter(r =>
                      [r.ticketNumber, r.title, r.module, r.pageName, r.feature,
                       r.status, r.priority, r.createdBy]
                      .some(v => String(v ?? '').toLowerCase().includes(q))
                    )
                  : tickets;
                return (
                  <Table
                    dataSource={filtered} columns={columns} rowKey="ticketId"
                    loading={loading} size="small"
                    pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} tickets` }}
                    locale={{ emptyText: <Empty description="No tickets found" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                    scroll={{ x: 1300 }}
                  />
                );
              })()}
            </Card>
          )}

          {/* Recent open tickets (shown when not searched yet) */}
          {!hasSearched && dashboard?.recentOpen && dashboard.recentOpen.length > 0 && (
            <Card
              style={{ marginTop: 12, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
              styles={{ body: { padding: 0 } }}
              title={<Text strong>Recent Open Tickets</Text>}
            >
              <Table
                dataSource={dashboard.recentOpen} rowKey="ticketId" size="small"
                pagination={false}
                columns={[
                  { title: 'Ticket #', dataIndex: 'ticketNumber', width: 140,
                    render: (v, r) => <Button type="link" size="small" style={{ padding: 0, fontSize: 12 }}
                      onClick={() => setSelectedId(r.ticketId)}>{v}</Button> },
                  { title: 'Title', dataIndex: 'title', ellipsis: true,
                    render: v => <Text style={{ fontSize: 12 }}>{v}</Text> },
                  { title: 'Module', dataIndex: 'module', width: 160,
                    render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
                  { title: 'Priority', dataIndex: 'priority', width: 90,
                    render: v => <Tag color={PRIORITY_COLOR[v] ?? 'default'} style={{ fontSize: 11 }}>{v}</Tag> },
                  { title: 'Status', dataIndex: 'status', width: 120,
                    render: v => <Tag color={STATUS_COLOR[v] ?? 'default'} style={{ fontSize: 11 }}>{v.replace('_', ' ')}</Tag> },
                  { title: 'Date', dataIndex: 'creationDate', width: 130,
                    render: v => <Text style={{ fontSize: 12 }}>{fmtDate(v)}</Text> },
                ]}
                scroll={{ x: 700 }}
              />
            </Card>
          )}
        </div>
      </Content>

      <TicketDetailModal
        ticketId={selectedId}
        onClose={() => setSelectedId(null)}
        onRefresh={() => { loadDashboard(); if (hasSearched) handleSearch(); }}
      />
    </Layout>
  );
};

export default ManageTickets;
