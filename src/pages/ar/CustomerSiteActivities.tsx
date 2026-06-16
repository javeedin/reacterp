import React, { useState, useCallback, useMemo } from 'react';
import {
  Layout, Card, Form, Input, Button, Space, Typography, Table, Tabs,
  Breadcrumb, Spin, message, Empty, Modal, Tag, Badge,
} from 'antd';
import {
  HomeOutlined, SearchOutlined, DownloadOutlined,
  EyeOutlined, ApiOutlined, CopyOutlined, SyncOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType, TableRowSelection } from 'antd/es/table/interface';
import * as XLSX from 'xlsx';
import FloatingMenu from '../../components/FloatingMenu';
import { ORACLE_FUSION_CONFIG } from '../../config/api.config';

const { Content } = Layout;
const { Title, Text } = Typography;

const REDWOOD = {
  primary:    '#C74634',
  success:    '#1D7B4D',
  info:       '#0572CE',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  surface:    '#FFFFFF',
  border:     '#E5E5E5',
};

const FUSION_AUTH = 'Basic ' + btoa(`${ORACLE_FUSION_CONFIG.username}:${ORACLE_FUSION_CONFIG.password}`);
const FUSION_BASE = `${ORACLE_FUSION_CONFIG.baseUrl}/receivablesCustomerAccountSiteActivities`;

const CHILD_LABEL_MAP: Record<string, string> = {
  creditMemoApplications:           'CM Applications',
  creditMemos:                      'Credit Memos',
  standardReceiptApplications:      'Receipt Applications',
  standardReceipts:                 'Standard Receipts',
  transactionAdjustments:           'Adjustments',
  transactionPaymentSchedules:      'Payment Schedules',
  transactionsPaidByOtherCustomers: 'Paid by Others',
};
const CHILD_NAMES = Object.keys(CHILD_LABEL_MAP);

type Row = Record<string, unknown>;

interface ChildState {
  loading: boolean;
  data: Row[];
  columns: ColumnsType<Row>;
}

interface ApiDebug { url: string; status: number | null; response: string; }

function formatVal(key: string, val: unknown): React.ReactNode {
  if (val === null || val === undefined || val === '') return '-';
  if (typeof val === 'number') {
    const k = key.toLowerCase();
    if (k.includes('amount') || k.includes('total') || k.includes('balance') || k.includes('receivable') || k.includes('due'))
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return val.toString();
  }
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
  }
  return String(val);
}

function buildColumns(items: Row[], extraFirst?: { key: string; title: string }): ColumnsType<Row> {
  if (!items.length) return [];
  const keys = Object.keys(items[0]).filter(k => k !== 'links' && k !== '_customerName');
  const cols: ColumnsType<Row> = keys.map(key => ({
    title: key.replace(/([A-Z])/g, ' $1').trim(),
    dataIndex: key,
    key,
    ellipsis: true,
    render: (v: unknown) => formatVal(key, v),
  }));
  if (extraFirst) {
    cols.unshift({ title: extraFirst.title, dataIndex: extraFirst.key, key: extraFirst.key, width: 180, ellipsis: true, fixed: 'left' as const });
  }
  return cols;
}

function exportToExcel(data: Row[], filename: string) {
  const cleaned = data.map(row => {
    const r: Row = {};
    Object.keys(row).filter(k => k !== 'links').forEach(k => { r[k] = row[k]; });
    return r;
  });
  const ws = XLSX.utils.json_to_sheet(cleaned);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function SiteResultsTable({ data, columns, loading, rowSelection }: {
  data: Row[]; columns: ColumnsType<Row>; loading?: boolean; rowSelection?: TableRowSelection<Row>;
}) {
  const [filter, setFilter] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!filter.trim()) return data;
    const q = filter.toLowerCase();
    return data.filter(row => Object.values(row).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(q)));
  }, [data, filter]);

  if (!data.length && !loading) return <Empty description="Enter search criteria and click Search" />;

  return (
    <div>
      {data.length > 0 && (
        <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input prefix={<SearchOutlined style={{ color: '#aaa' }} />} placeholder="Filter results..."
            value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}
            allowClear style={{ width: 280 }} size="small" />
          <Text type="secondary" style={{ fontSize: 12 }}>{filtered.length} / {data.length} rows</Text>
        </div>
      )}
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey={r => String(r['BillToSiteUseId'] ?? JSON.stringify(r))}
        rowSelection={rowSelection}
        loading={loading}
        size="small"
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize,
          showSizeChanger: true,
          pageSizeOptions: [20, 50, 100, 200, 500, 1000],
          showTotal: t => `Total ${t} sites`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
      />
    </div>
  );
}

function FilteredTable({ data, columns, loading, emptyText }: { data: Row[]; columns: ColumnsType<Row>; loading?: boolean; emptyText?: string }) {
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    if (!filter.trim()) return data;
    const q = filter.toLowerCase();
    return data.filter(row => Object.values(row).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(q)));
  }, [data, filter]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>;
  if (!data.length) return <Empty description={emptyText || 'No data'} />;

  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Input prefix={<SearchOutlined style={{ color: '#aaa' }} />} placeholder="Filter rows..."
          value={filter} onChange={e => setFilter(e.target.value)} allowClear style={{ width: 280 }} size="small" />
        <Text type="secondary" style={{ fontSize: 12 }}>{filtered.length} / {data.length} rows</Text>
      </div>
      <Table dataSource={filtered} columns={columns} rowKey={(_r, i) => String(i)}
        size="small" scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `Total ${t} records` }} />
    </div>
  );
}

const CustomerSiteActivities: React.FC = () => {
  const [form] = Form.useForm();

  const [fusionData, setFusionData] = useState<Row[]>([]);
  const [fusionColumns, setFusionColumns] = useState<ColumnsType<Row>>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [activeTab, setActiveTab] = useState('sites');
  const [childStates, setChildStates] = useState<Record<string, ChildState>>({});
  const [loadingActivities, setLoadingActivities] = useState(false);

  const [apiDebug, setApiDebug] = useState<ApiDebug | null>(null);
  const [apiDebugVisible, setApiDebugVisible] = useState(false);

  // ── Search Fusion ────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const values = form.getFieldsValue();
    const filters: string[] = [];
    if (values.CustomerName)    filters.push(`CustomerName like "%${values.CustomerName}%"`);
    if (values.AccountNumber)   filters.push(`AccountNumber like "%${values.AccountNumber}%"`);
    if (values.BillToSiteNumber) filters.push(`BillToSiteNumber like "%${values.BillToSiteNumber}%"`);

    let url = `${FUSION_BASE}?limit=500`;
    if (filters.length) url += `&q=${encodeURIComponent(filters.join(' AND '))}`;

    setApiDebug({ url, status: null, response: '' });
    setSearchLoading(true);
    setSelectedRowKeys([]);
    try {
      const res = await fetch(url, { headers: { Authorization: FUSION_AUTH } });
      const text = await res.text();
      let json: { items?: Row[] };
      try { json = JSON.parse(text); } catch { throw new Error(`Non-JSON (HTTP ${res.status}): ${text.substring(0, 300)}`); }
      setApiDebug({ url, status: res.status, response: JSON.stringify(json, null, 2) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = (json.items || []).map(item => {
        const r: Row = {};
        Object.keys(item).filter(k => k !== 'links').forEach(k => { r[k] = item[k]; });
        return r;
      });
      setFusionData(items);
      setFusionColumns(buildColumns(items));
      if (!items.length) message.info('No results found');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setApiDebug(prev => prev ? { ...prev, status: -1, response: msg } : null);
      message.error(`Search failed: ${msg}`);
    } finally {
      setSearchLoading(false);
    }
  }, [form]);

  // ── Load child activities for selected rows ──────────────────────
  const handleLoadActivities = useCallback(async () => {
    if (!selectedRowKeys.length) { message.warning('Select at least one customer site first'); return; }
    const selected = fusionData.filter(r => selectedRowKeys.includes(String(r['BillToSiteUseId'])));

    const initStates: Record<string, ChildState> = {};
    CHILD_NAMES.forEach(cn => { initStates[cn] = { loading: true, data: [], columns: [] }; });
    setChildStates(initStates);
    setLoadingActivities(true);
    setActiveTab(CHILD_NAMES[0]);

    const allResults: Record<string, Row[]> = {};
    CHILD_NAMES.forEach(cn => { allResults[cn] = []; });

    await Promise.all(
      selected.flatMap(site =>
        CHILD_NAMES.map(async childName => {
          try {
            const siteId = site['BillToSiteUseId'];
            const url = `${FUSION_BASE}/${siteId}/child/${childName}`;
            const res = await fetch(url, { headers: { Authorization: FUSION_AUTH } });
            if (!res.ok) return;
            const json = await res.json();
            const items: Row[] = (json.items || []).map((item: Row) => {
              const r: Row = { _customerName: `${site['CustomerName']} (${site['BillToSiteNumber']})` };
              Object.keys(item).filter(k => k !== 'links').forEach(k => { r[k] = item[k]; });
              return r;
            });
            allResults[childName].push(...items);
          } catch { /* skip */ }
        })
      )
    );

    const finalStates: Record<string, ChildState> = {};
    CHILD_NAMES.forEach(cn => {
      const data = allResults[cn];
      finalStates[cn] = { loading: false, data, columns: buildColumns(data, { key: '_customerName', title: 'Customer' }) };
    });
    setChildStates(finalStates);
    setLoadingActivities(false);
  }, [selectedRowKeys, fusionData]);

  const rowSelection: TableRowSelection<Row> = {
    selectedRowKeys,
    onChange: keys => setSelectedRowKeys(keys),
  };

  const childTabItems = CHILD_NAMES.map(cn => {
    const state = childStates[cn] || { loading: false, data: [], columns: [] };
    return {
      key: cn,
      label: (
        <span>
          {CHILD_LABEL_MAP[cn]}
          {state.data.length > 0 && <Badge count={state.data.length} size="small" style={{ marginLeft: 6, background: REDWOOD.info }} />}
          {state.loading && <SyncOutlined spin style={{ marginLeft: 6, fontSize: 11 }} />}
        </span>
      ),
      children: (
        <div>
          {!state.loading && state.data.length > 0 && (
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <Button size="small" icon={<DownloadOutlined />} onClick={() => exportToExcel(state.data, cn)}>Export to Excel</Button>
            </div>
          )}
          <FilteredTable data={state.data} columns={state.columns} loading={state.loading}
            emptyText="Select customers in the first tab and click Load Activities" />
        </div>
      ),
    };
  });

  const tabItems = [
    {
      key: 'sites',
      label: 'Customer Sites',
      children: (
        <div>
          <Card style={{ marginBottom: 16, borderColor: REDWOOD.border }} bodyStyle={{ padding: '16px 24px' }}>
            <Form form={form} layout="inline" onFinish={handleSearch}>
              <Form.Item name="CustomerName" label="Customer Name">
                <Input placeholder="Customer name..." style={{ width: 200 }} />
              </Form.Item>
              <Form.Item name="AccountNumber" label="Account Number">
                <Input placeholder="Account number..." style={{ width: 160 }} />
              </Form.Item>
              <Form.Item name="BillToSiteNumber" label="Site Number">
                <Input placeholder="Site number..." style={{ width: 140 }} />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={searchLoading}
                  style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
                  Search
                </Button>
              </Form.Item>
              <Form.Item>
                <Button icon={<ApiOutlined />} onClick={() => setApiDebugVisible(true)}
                  style={{ color: apiDebug ? REDWOOD.info : undefined }}>
                  API
                </Button>
              </Form.Item>
              {fusionData.length > 0 && (
                <Form.Item>
                  <Button icon={<DownloadOutlined />} onClick={() => exportToExcel(fusionData, 'CustomerSiteActivities')}>
                    Export
                  </Button>
                </Form.Item>
              )}
            </Form>
          </Card>

          {selectedRowKeys.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Space>
                <Text type="secondary">{selectedRowKeys.length} site(s) selected</Text>
                <Button type="primary" icon={<EyeOutlined />} loading={loadingActivities}
                  style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
                  onClick={handleLoadActivities}>
                  Load Activities
                </Button>
              </Space>
            </div>
          )}

          <Card style={{ borderColor: REDWOOD.border }}>
            <SiteResultsTable
              data={fusionData}
              columns={fusionColumns}
              loading={searchLoading}
              rowSelection={rowSelection}
            />
          </Card>
        </div>
      ),
    },
    ...childTabItems,
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: REDWOOD.neutral100 }}>
      <Content>
        <div style={{ padding: '16px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/"><HomeOutlined /> Home</Link> },
            { title: <Link to="/ar">Accounts Receivable</Link> },
            { title: 'Customer Site Activities' },
          ]} />
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ marginBottom: 24 }}>
            <Space align="center">
              <div style={{
                width: 48, height: 48, borderRadius: 10,
                background: `linear-gradient(135deg, ${REDWOOD.primary} 0%, #E85D4A 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <EyeOutlined style={{ color: '#fff', fontSize: 22 }} />
              </div>
              <div>
                <Title level={4} style={{ margin: 0 }}>Customer Account Site Activities</Title>
                <Text type="secondary">Search → select sites → Load Activities tabs</Text>
              </div>
            </Space>
          </div>

          <Tabs activeKey={activeTab} onChange={setActiveTab} type="card" items={tabItems}
            style={{ background: REDWOOD.surface, borderRadius: 8 }} />
        </div>

        <FloatingMenu />
      </Content>

      <Modal open={apiDebugVisible} onCancel={() => setApiDebugVisible(false)} footer={null} width={900}
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /> API Debug</Space>}>
        {apiDebug ? (
          <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <Tag color="blue">GET</Tag>
              <Text copyable style={{ fontSize: 12, wordBreak: 'break-all' }}>{apiDebug.url}</Text>
            </div>
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary">Status: </Text>
              {apiDebug.status === null ? <Tag>Pending…</Tag>
                : apiDebug.status > 0 ? <Tag color={apiDebug.status < 300 ? 'green' : 'red'}>{apiDebug.status}</Tag>
                : <Tag color="red">Error</Tag>}
            </div>
            <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
              <Text strong>Response</Text>
              <Button size="small" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(apiDebug.response); message.success('Copied'); }}>Copy</Button>
            </div>
            <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {apiDebug.response || '(click Search first)'}
            </pre>
          </div>
        ) : <Empty description="Click Search to populate" />}
      </Modal>
    </Layout>
  );
};

export default CustomerSiteActivities;
