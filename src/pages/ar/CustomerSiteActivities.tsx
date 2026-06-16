import React, { useState, useCallback, useMemo } from 'react';
import {
  Layout, Card, Form, Input, Button, Space, Typography, Table, Tabs,
  Row, Col, Breadcrumb, Spin, message, Empty, Modal, Tag, Badge,
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

const AUTH_HEADER = 'Basic ' + btoa(`${ORACLE_FUSION_CONFIG.username}:${ORACLE_FUSION_CONFIG.password}`);
const BASE_URL = `${ORACLE_FUSION_CONFIG.baseUrl}/receivablesCustomerAccountSiteActivities`;

const CHILD_LABEL_MAP: Record<string, string> = {
  creditMemoApplications:          'CM Applications',
  creditMemos:                      'Credit Memos',
  standardReceiptApplications:     'Receipt Applications',
  standardReceipts:                 'Standard Receipts',
  transactionAdjustments:           'Adjustments',
  transactionPaymentSchedules:      'Payment Schedules',
  transactionsPaidByOtherCustomers: 'Paid by Others',
};
const CHILD_NAMES = Object.keys(CHILD_LABEL_MAP);

interface SiteRecord {
  BillToSiteUseId: number;
  BillToSiteNumber: string;
  BillToSiteAddress: string;
  AccountNumber: string;
  CustomerName: string;
  TaxRegistrationNumber: string;
  TotalOpenReceivablesForSite: number;
  TotalTransactionsDueForSite: number;
}

// merged data per child collection
type ChildData = Record<string, unknown>;

interface ChildState {
  loading: boolean;
  data: ChildData[];
  columns: ColumnsType<ChildData>;
}

interface ApiDebug { url: string; status: number | null; response: string; }

function formatValue(key: string, val: unknown): React.ReactNode {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'number') {
    const k = key.toLowerCase();
    if (k.includes('amount') || k.includes('total') || k.includes('balance') || k.includes('due') || k.includes('receivable')) {
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return val.toString();
  }
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
  }
  return String(val);
}

function buildColumns(items: ChildData[]): ColumnsType<ChildData> {
  if (!items.length) return [];
  const keys = Object.keys(items[0]).filter(k => k !== 'links' && k !== '_siteId' && k !== '_customerName');
  const cols: ColumnsType<ChildData> = [
    { title: 'Customer', dataIndex: '_customerName', key: '_customerName', width: 160, ellipsis: true, fixed: 'left' as const },
    ...keys.map(key => ({
      title: key.replace(/([A-Z])/g, ' $1').trim(),
      dataIndex: key,
      key,
      ellipsis: true,
      render: (val: unknown) => formatValue(key, val),
    })),
  ];
  return cols;
}

function exportToExcel(data: ChildData[], filename: string) {
  const cleaned = data.map(row => {
    const r: Record<string, unknown> = {};
    Object.keys(row).filter(k => k !== 'links').forEach(k => { r[k] = row[k]; });
    return r;
  });
  const ws = XLSX.utils.json_to_sheet(cleaned);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// Per-tab filter component
function FilteredChildTable({ state }: { state: ChildState }) {
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    if (!filter.trim()) return state.data;
    const q = filter.toLowerCase();
    return state.data.filter(row =>
      Object.values(row).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(q))
    );
  }, [state.data, filter]);

  if (state.loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>;
  if (!state.data.length) return <Empty description="No data — select customers and click Load Activities" />;

  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#aaa' }} />}
          placeholder="Filter rows..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          allowClear
          style={{ width: 280 }}
          size="small"
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          {filtered.length} / {state.data.length} rows
        </Text>
      </div>
      <Table
        dataSource={filtered}
        columns={state.columns}
        rowKey={(_rec, idx) => String(idx)}
        size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t} records` }}
      />
    </div>
  );
}

const CustomerSiteActivities: React.FC = () => {
  const [form] = Form.useForm();
  const [searchResults, setSearchResults] = useState<SiteRecord[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [activeTab, setActiveTab] = useState('search');

  // one state entry per child collection — merged across all selected customers
  const [childStates, setChildStates] = useState<Record<string, ChildState>>({});
  const [loadingActivities, setLoadingActivities] = useState(false);

  const [apiDebug, setApiDebug] = useState<ApiDebug | null>(null);
  const [apiDebugVisible, setApiDebugVisible] = useState(false);
  const [resultsFilter, setResultsFilter] = useState('');

  const handleSearch = useCallback(async () => {
    const values = form.getFieldsValue();
    const filters: string[] = [];
    if (values.CustomerName) filters.push(`CustomerName like "%${values.CustomerName}%"`);
    if (values.AccountNumber) filters.push(`AccountNumber like "%${values.AccountNumber}%"`);
    if (values.BillToSiteNumber) filters.push(`BillToSiteNumber like "%${values.BillToSiteNumber}%"`);

    let url = `${BASE_URL}?limit=100`;
    if (filters.length) url += `&q=${encodeURIComponent(filters.join(' AND '))}`;

    setApiDebug({ url, status: null, response: '' });
    setSearchLoading(true);
    setSelectedRowKeys([]);
    setResultsFilter('');
    try {
      const res = await fetch(url, { headers: { Authorization: AUTH_HEADER } });
      const text = await res.text();
      let json: { items?: SiteRecord[] };
      try { json = JSON.parse(text); } catch { throw new Error(`Non-JSON (HTTP ${res.status}): ${text.substring(0, 200)}`); }
      setApiDebug({ url, status: res.status, response: JSON.stringify(json, null, 2) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSearchResults(json.items || []);
      if (!(json.items || []).length) message.info('No results found');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setApiDebug(prev => prev ? { ...prev, status: -1, response: msg } : null);
      message.error(`Search failed: ${msg}`);
    } finally {
      setSearchLoading(false);
    }
  }, [form]);

  const handleLoadActivities = useCallback(async () => {
    if (!selectedRowKeys.length) { message.warning('Select at least one customer site first'); return; }

    const selected = searchResults.filter(r => selectedRowKeys.includes(r.BillToSiteUseId));

    // init all child states as loading
    const initStates: Record<string, ChildState> = {};
    CHILD_NAMES.forEach(cn => { initStates[cn] = { loading: true, data: [], columns: [] }; });
    setChildStates(initStates);
    setLoadingActivities(true);
    setActiveTab(CHILD_NAMES[0]);

    // fetch all children for all selected sites in parallel, then merge by childName
    const allResults: Record<string, ChildData[]> = {};
    CHILD_NAMES.forEach(cn => { allResults[cn] = []; });

    await Promise.all(
      selected.flatMap(site =>
        CHILD_NAMES.map(async childName => {
          try {
            const url = `${BASE_URL}/${site.BillToSiteUseId}/child/${childName}`;
            const res = await fetch(url, { headers: { Authorization: AUTH_HEADER } });
            if (!res.ok) return;
            const json = await res.json();
            const items: ChildData[] = (json.items || []).map((item: ChildData) => ({
              ...item,
              _siteId: site.BillToSiteUseId,
              _customerName: `${site.CustomerName} (${site.BillToSiteNumber})`,
            }));
            allResults[childName].push(...items);
          } catch { /* skip failed child */ }
        })
      )
    );

    // build final states
    const finalStates: Record<string, ChildState> = {};
    CHILD_NAMES.forEach(cn => {
      const data = allResults[cn];
      finalStates[cn] = { loading: false, data, columns: buildColumns(data) };
    });
    setChildStates(finalStates);
    setLoadingActivities(false);
  }, [selectedRowKeys, searchResults]);

  const rowSelection: TableRowSelection<SiteRecord> = {
    selectedRowKeys,
    onChange: keys => setSelectedRowKeys(keys),
  };

  const searchColumns: ColumnsType<SiteRecord> = [
    { title: 'Customer Name',    dataIndex: 'CustomerName',               key: 'CustomerName', ellipsis: true },
    { title: 'Account Number',   dataIndex: 'AccountNumber',              key: 'AccountNumber' },
    { title: 'Site Number',      dataIndex: 'BillToSiteNumber',           key: 'BillToSiteNumber' },
    { title: 'Site Address',     dataIndex: 'BillToSiteAddress',          key: 'BillToSiteAddress', ellipsis: true },
    { title: 'Tax Reg No',       dataIndex: 'TaxRegistrationNumber',      key: 'TaxRegistrationNumber' },
    {
      title: 'Open Receivables', dataIndex: 'TotalOpenReceivablesForSite', key: 'TotalOpenReceivablesForSite',
      align: 'right' as const,
      render: (v: number) => typeof v === 'number' ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-',
    },
    {
      title: 'Trans. Due', dataIndex: 'TotalTransactionsDueForSite', key: 'TotalTransactionsDueForSite',
      align: 'right' as const,
      render: (v: number) => typeof v === 'number' ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-',
    },
  ];

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
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
            {!state.loading && state.data.length > 0 && (
              <Button size="small" icon={<DownloadOutlined />} onClick={() => exportToExcel(state.data, cn)}>
                Export to Excel
              </Button>
            )}
          </div>
          <FilteredChildTable state={state} />
        </div>
      ),
    };
  });

  const tabItems = [
    {
      key: 'search',
      label: 'Customer Sites',
      closable: false,
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
              {searchResults.length > 0 && (
                <Form.Item>
                  <Button icon={<DownloadOutlined />}
                    onClick={() => exportToExcel(searchResults as unknown as ChildData[], 'CustomerSiteActivities')}>
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
                <Button
                  type="primary" icon={<EyeOutlined />} loading={loadingActivities}
                  style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
                  onClick={handleLoadActivities}
                >
                  Load Activities
                </Button>
              </Space>
            </div>
          )}

          <Card style={{ borderColor: REDWOOD.border }}>
            {searchResults.length > 0 && (
              <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Input
                  prefix={<SearchOutlined style={{ color: '#aaa' }} />}
                  placeholder="Filter results..."
                  value={resultsFilter}
                  onChange={e => setResultsFilter(e.target.value)}
                  allowClear
                  style={{ width: 280 }}
                  size="small"
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {(() => {
                    const q = resultsFilter.toLowerCase();
                    const count = q ? searchResults.filter(r =>
                      Object.values(r).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(q))
                    ).length : searchResults.length;
                    return `${count} / ${searchResults.length} sites`;
                  })()}
                </Text>
              </div>
            )}
            <Table
              dataSource={resultsFilter
                ? searchResults.filter(r =>
                    Object.values(r).some(v => v !== null && v !== undefined &&
                      String(v).toLowerCase().includes(resultsFilter.toLowerCase()))
                  )
                : searchResults}
              columns={searchColumns}
              rowKey="BillToSiteUseId"
              rowSelection={rowSelection}
              loading={searchLoading}
              size="small"
              scroll={{ x: 'max-content' }}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t} sites` }}
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
            <Row justify="space-between" align="middle">
              <Col>
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
                    <Text type="secondary">Search sites → select one or more → Load Activities</Text>
                  </div>
                </Space>
              </Col>
            </Row>
          </div>

          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            type="card"
            items={tabItems}
            style={{ background: REDWOOD.surface, borderRadius: 8 }}
          />
        </div>

        <FloatingMenu />
      </Content>

      <Modal
        open={apiDebugVisible}
        onCancel={() => setApiDebugVisible(false)}
        footer={null}
        width={900}
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /> API Debug — Customer Site Activities Search</Space>}
      >
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
              {apiDebug.response || '(no response yet — click Search first)'}
            </pre>
          </div>
        ) : (
          <Empty description="Click Search to see the API call" />
        )}
      </Modal>
    </Layout>
  );
};

export default CustomerSiteActivities;
