import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Layout, Card, Form, Input, Button, Space, Typography, Table, Tabs,
  Row, Col, Breadcrumb, Spin, message, Empty, Modal, Tag, Badge, Progress, Tooltip,
} from 'antd';
import {
  HomeOutlined, SearchOutlined, DownloadOutlined,
  EyeOutlined, ApiOutlined, CopyOutlined, SyncOutlined, DatabaseOutlined,
  CloudDownloadOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType, TableRowSelection } from 'antd/es/table/interface';
import * as XLSX from 'xlsx';
import FloatingMenu from '../../components/FloatingMenu';
import { ORACLE_FUSION_CONFIG, APEX_DB_CONFIG } from '../../config/api.config';

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
const FUSION_BASE  = `${ORACLE_FUSION_CONFIG.baseUrl}/receivablesCustomerAccountSiteActivities`;
const APEX_BASE    = APEX_DB_CONFIG.baseUrl;
const APEX_CSA     = `${APEX_BASE}/ar/customer-site-activities`;
const APEX_SYNC    = `${APEX_BASE}/ar/customer-site-activities/sync`;

const CHILD_LABEL_MAP: Record<string, string> = {
  creditMemoApplications:          'CM Applications',
  creditMemos:                     'Credit Memos',
  standardReceiptApplications:     'Receipt Applications',
  standardReceipts:                'Standard Receipts',
  transactionAdjustments:          'Adjustments',
  transactionPaymentSchedules:     'Payment Schedules',
  transactionsPaidByOtherCustomers:'Paid by Others',
};
const CHILD_NAMES = Object.keys(CHILD_LABEL_MAP);

interface SiteRecord {
  BILL_TO_SITE_USE_ID:             number;
  BILL_TO_SITE_NUMBER:             string;
  BILL_TO_SITE_ADDRESS:            string;
  ACCOUNT_NUMBER:                  string;
  CUSTOMER_NAME:                   string;
  TAX_REGISTRATION_NUMBER:         string;
  TOTAL_OPEN_RECEIVABLES_FOR_SITE: number;
  TOTAL_TRANSACTIONS_DUE_FOR_SITE: number;
  SYNC_DATE?:                      string;
}

type ChildData = Record<string, unknown>;

interface ChildState {
  loading: boolean;
  data: ChildData[];
  columns: ColumnsType<ChildData>;
}

interface SyncProgress {
  phase: 'fetching' | 'saving' | 'done' | 'error';
  fetchedPages: number;
  totalFetched: number;
  savedBatches: number;
  totalBatches: number;
  message: string;
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

function buildChildColumns(items: ChildData[]): ColumnsType<ChildData> {
  if (!items.length) return [];
  const keys = Object.keys(items[0]).filter(k => k !== 'links' && k !== '_siteId' && k !== '_customerName');
  return [
    { title: 'Customer', dataIndex: '_customerName', key: '_customerName', width: 180, ellipsis: true, fixed: 'left' as const },
    ...keys.map(key => ({
      title: key.replace(/([A-Z])/g, ' $1').trim(),
      dataIndex: key,
      key,
      ellipsis: true,
      render: (val: unknown) => formatValue(key, val),
    })),
  ];
}

function exportToExcel(data: Record<string, unknown>[], filename: string) {
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
  if (!state.data.length) return <Empty description="Select customers in the first tab and click Load Activities" />;

  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Input prefix={<SearchOutlined style={{ color: '#aaa' }} />} placeholder="Filter rows..."
          value={filter} onChange={e => setFilter(e.target.value)} allowClear style={{ width: 280 }} size="small" />
        <Text type="secondary" style={{ fontSize: 12 }}>{filtered.length} / {state.data.length} rows</Text>
      </div>
      <Table dataSource={filtered} columns={state.columns} rowKey={(_r, i) => String(i)}
        size="small" scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `Total ${t} records` }} />
    </div>
  );
}

const CustomerSiteActivities: React.FC = () => {
  const [form] = Form.useForm();

  // APEX data (loaded on mount & after sync)
  const [apexData, setApexData] = useState<SiteRecord[]>([]);
  const [apexLoading, setApexLoading] = useState(false);
  const [lastSyncDate, setLastSyncDate] = useState<string>('');

  // local filter over apex data
  const [resultsFilter, setResultsFilter] = useState('');

  // row selection for load activities
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [activeTab, setActiveTab] = useState('sites');
  const [childStates, setChildStates] = useState<Record<string, ChildState>>({});
  const [loadingActivities, setLoadingActivities] = useState(false);

  // sync from Fusion
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncModalVisible, setSyncModalVisible] = useState(false);

  // API debug
  const [apiDebug, setApiDebug] = useState<ApiDebug | null>(null);
  const [apiDebugVisible, setApiDebugVisible] = useState(false);

  // ── Load from APEX on mount ──────────────────────────────────────
  const loadFromApex = useCallback(async () => {
    setApexLoading(true);
    try {
      const res = await fetch(APEX_CSA);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const items: SiteRecord[] = json.items || [];
      setApexData(items);
      if (items.length > 0 && items[0].SYNC_DATE) setLastSyncDate(items[0].SYNC_DATE);
    } catch (err: unknown) {
      message.error(`Load from APEX failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setApexLoading(false);
    }
  }, []);

  useEffect(() => { loadFromApex(); }, [loadFromApex]);

  // ── Sync all records from Fusion → APEX ─────────────────────────
  const handleSyncFromFusion = useCallback(async () => {
    setSyncModalVisible(true);
    setSyncProgress({ phase: 'fetching', fetchedPages: 0, totalFetched: 0, savedBatches: 0, totalBatches: 0, message: 'Starting…' });

    const FUSION_LIMIT = 500;
    const APEX_BATCH   = 100;
    let offset = 0;
    let hasMore = true;
    let allRows: Record<string, unknown>[] = [];
    let page = 0;

    // Step 1: fetch all pages from Fusion
    while (hasMore) {
      page++;
      const url = `${FUSION_BASE}?limit=${FUSION_LIMIT}&offset=${offset}`;
      setSyncProgress(p => p ? { ...p, fetchedPages: page, message: `Fetching page ${page} (offset ${offset})…` } : null);
      try {
        const res = await fetch(url, { headers: { Authorization: FUSION_AUTH } });
        const text = await res.text();
        let json: { items?: Record<string, unknown>[]; hasMore?: boolean; count?: number };
        try { json = JSON.parse(text); } catch { throw new Error(`Non-JSON on page ${page}: ${text.substring(0, 200)}`); }
        if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page}`);
        const items = json.items || [];
        allRows = allRows.concat(items);
        hasMore = !!json.hasMore && items.length === FUSION_LIMIT;
        offset += FUSION_LIMIT;
        setSyncProgress(p => p ? { ...p, totalFetched: allRows.length } : null);
      } catch (err: unknown) {
        setSyncProgress({ phase: 'error', fetchedPages: page, totalFetched: allRows.length, savedBatches: 0, totalBatches: 0, message: String(err) });
        return;
      }
    }

    // Step 2: save to APEX in batches
    const batches = Math.ceil(allRows.length / APEX_BATCH);
    setSyncProgress(p => p ? { ...p, phase: 'saving', totalBatches: batches, message: `Saving ${allRows.length} records in ${batches} batches…` } : null);

    for (let b = 0; b < batches; b++) {
      const chunk = allRows.slice(b * APEX_BATCH, (b + 1) * APEX_BATCH);
      try {
        const res = await fetch(APEX_SYNC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk }),
        });
        if (!res.ok) throw new Error(`APEX sync batch ${b + 1} failed: HTTP ${res.status}`);
        setSyncProgress(p => p ? { ...p, savedBatches: b + 1, message: `Saved batch ${b + 1} / ${batches}` } : null);
      } catch (err: unknown) {
        setSyncProgress(prev => prev ? { ...prev, phase: 'error', message: String(err) } : null);
        return;
      }
    }

    setSyncProgress(p => p ? { ...p, phase: 'done', message: `Sync complete — ${allRows.length} records saved.` } : null);
    await loadFromApex();
  }, [loadFromApex]);

  // ── Load child activities for selected sites ─────────────────────
  const handleLoadActivities = useCallback(async () => {
    if (!selectedRowKeys.length) { message.warning('Select at least one customer site first'); return; }
    const selected = apexData.filter(r => selectedRowKeys.includes(r.BILL_TO_SITE_USE_ID));

    const initStates: Record<string, ChildState> = {};
    CHILD_NAMES.forEach(cn => { initStates[cn] = { loading: true, data: [], columns: [] }; });
    setChildStates(initStates);
    setLoadingActivities(true);
    setActiveTab(CHILD_NAMES[0]);

    const allResults: Record<string, ChildData[]> = {};
    CHILD_NAMES.forEach(cn => { allResults[cn] = []; });

    await Promise.all(
      selected.flatMap(site =>
        CHILD_NAMES.map(async childName => {
          try {
            const url = `${FUSION_BASE}/${site.BILL_TO_SITE_USE_ID}/child/${childName}`;
            const res = await fetch(url, { headers: { Authorization: FUSION_AUTH } });
            if (!res.ok) return;
            const json = await res.json();
            const items: ChildData[] = (json.items || []).map((item: ChildData) => ({
              ...item,
              _siteId: site.BILL_TO_SITE_USE_ID,
              _customerName: `${site.CUSTOMER_NAME} (${site.BILL_TO_SITE_NUMBER})`,
            }));
            allResults[childName].push(...items);
          } catch { /* skip */ }
        })
      )
    );

    const finalStates: Record<string, ChildState> = {};
    CHILD_NAMES.forEach(cn => {
      const data = allResults[cn];
      finalStates[cn] = { loading: false, data, columns: buildChildColumns(data) };
    });
    setChildStates(finalStates);
    setLoadingActivities(false);
  }, [selectedRowKeys, apexData]);

  // ── API debug for manual search (optional override) ──────────────
  const handleFusionSearch = useCallback(async () => {
    const values = form.getFieldsValue();
    const filters: string[] = [];
    if (values.CustomerName) filters.push(`CustomerName like "%${values.CustomerName}%"`);
    if (values.AccountNumber) filters.push(`AccountNumber like "%${values.AccountNumber}%"`);

    let url = `${FUSION_BASE}?limit=100`;
    if (filters.length) url += `&q=${encodeURIComponent(filters.join(' AND '))}`;

    setApiDebug({ url, status: null, response: '' });
    setApiDebugVisible(true);
    try {
      const res = await fetch(url, { headers: { Authorization: FUSION_AUTH } });
      const text = await res.text();
      let json: unknown;
      try { json = JSON.parse(text); } catch { throw new Error(`Non-JSON: ${text.substring(0, 200)}`); }
      setApiDebug({ url, status: res.status, response: JSON.stringify(json, null, 2) });
    } catch (err: unknown) {
      setApiDebug(prev => prev ? { ...prev, status: -1, response: String(err) } : null);
    }
  }, [form]);

  const rowSelection: TableRowSelection<SiteRecord> = {
    selectedRowKeys,
    onChange: keys => setSelectedRowKeys(keys),
  };

  const filteredApexData = useMemo(() => {
    if (!resultsFilter.trim()) return apexData;
    const q = resultsFilter.toLowerCase();
    return apexData.filter(r =>
      Object.values(r).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(q))
    );
  }, [apexData, resultsFilter]);

  const searchColumns: ColumnsType<SiteRecord> = useMemo(() => {
    if (!apexData.length) return [];
    return Object.keys(apexData[0]).map(key => ({
      title: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      dataIndex: key,
      key,
      ellipsis: true,
      render: (v: unknown) => {
        if (v === null || v === undefined || v === '') return '-';
        if (typeof v === 'number') {
          const k = key.toLowerCase();
          if (k.includes('amount') || k.includes('total') || k.includes('balance') || k.includes('receivable') || k.includes('due'))
            return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        return String(v);
      },
    }));
  }, [apexData]);

  const syncPercent = syncProgress
    ? syncProgress.phase === 'fetching' ? 20
    : syncProgress.phase === 'saving'
      ? 20 + Math.round(80 * (syncProgress.savedBatches / Math.max(syncProgress.totalBatches, 1)))
    : syncProgress.phase === 'done' ? 100 : 0
    : 0;

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
          <FilteredChildTable state={state} />
        </div>
      ),
    };
  });

  const tabItems = [
    {
      key: 'sites',
      label: <span><DatabaseOutlined style={{ marginRight: 4 }} />Customer Sites</span>,
      closable: false,
      children: (
        <div>
          {/* toolbar */}
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#aaa' }} />}
              placeholder="Filter customer sites..."
              value={resultsFilter}
              onChange={e => setResultsFilter(e.target.value)}
              allowClear
              style={{ width: 280 }}
            />
            {apexData.length > 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {filteredApexData.length} / {apexData.length} sites
                {lastSyncDate && ` · Last sync: ${lastSyncDate}`}
              </Text>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {selectedRowKeys.length > 0 && (
                <Button type="primary" icon={<EyeOutlined />} loading={loadingActivities}
                  style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
                  onClick={handleLoadActivities}>
                  Load Activities ({selectedRowKeys.length})
                </Button>
              )}
              <Tooltip title="Fetch all records from Oracle Fusion and save to local DB">
                <Button icon={<CloudDownloadOutlined />} onClick={handleSyncFromFusion}
                  style={{ background: REDWOOD.info, borderColor: REDWOOD.info, color: '#fff' }}>
                  Sync from Fusion
                </Button>
              </Tooltip>
              <Button icon={<SyncOutlined />} onClick={loadFromApex} loading={apexLoading} title="Refresh from APEX DB" />
              <Button icon={<ApiOutlined />} onClick={() => { handleFusionSearch(); }}
                title="Test Fusion API call" style={{ color: apiDebug ? REDWOOD.info : undefined }}>
                API
              </Button>
              {apexData.length > 0 && (
                <Button icon={<DownloadOutlined />} onClick={() => exportToExcel(apexData as unknown as Record<string, unknown>[], 'CustomerSiteActivities')}>
                  Export
                </Button>
              )}
            </div>
          </div>

          <Card style={{ borderColor: REDWOOD.border }}>
            <Table
              dataSource={filteredApexData}
              columns={searchColumns}
              rowKey="BILL_TO_SITE_USE_ID"
              rowSelection={rowSelection}
              loading={apexLoading}
              size="small"
              scroll={{ x: 'max-content' }}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `Total ${t} sites` }}
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
                    <Text type="secondary">
                      Data from local DB · Sync from Fusion to refresh · Select sites → Load Activities
                    </Text>
                  </div>
                </Space>
              </Col>
            </Row>
          </div>

          <Tabs activeKey={activeTab} onChange={setActiveTab} type="card" items={tabItems}
            style={{ background: REDWOOD.surface, borderRadius: 8 }} />
        </div>

        <FloatingMenu />
      </Content>

      {/* Sync Progress Modal */}
      <Modal open={syncModalVisible} onCancel={() => setSyncModalVisible(false)}
        footer={syncProgress?.phase === 'done' || syncProgress?.phase === 'error'
          ? <Button type="primary" onClick={() => setSyncModalVisible(false)}>Close</Button>
          : null}
        closable={syncProgress?.phase === 'done' || syncProgress?.phase === 'error'}
        maskClosable={false}
        title={<Space><CloudDownloadOutlined style={{ color: REDWOOD.info }} /> Sync from Oracle Fusion</Space>}
        width={600}
      >
        {syncProgress && (
          <div>
            <Progress
              percent={syncPercent}
              status={syncProgress.phase === 'error' ? 'exception' : syncProgress.phase === 'done' ? 'success' : 'active'}
              style={{ marginBottom: 16 }}
            />
            <div style={{ fontFamily: 'monospace', fontSize: 12, background: '#f5f5f5', padding: 12, borderRadius: 6 }}>
              <div>Phase: <Tag color={syncProgress.phase === 'error' ? 'red' : syncProgress.phase === 'done' ? 'green' : 'blue'}>{syncProgress.phase}</Tag></div>
              <div>Records fetched from Fusion: <strong>{syncProgress.totalFetched}</strong></div>
              {syncProgress.totalBatches > 0 && (
                <div>Batches saved to APEX: <strong>{syncProgress.savedBatches} / {syncProgress.totalBatches}</strong></div>
              )}
              <div style={{ marginTop: 8, color: syncProgress.phase === 'error' ? '#ff4d4f' : '#333' }}>
                {syncProgress.message}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* API Debug Modal */}
      <Modal open={apiDebugVisible} onCancel={() => setApiDebugVisible(false)} footer={null} width={900}
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /> API Debug — Fusion Direct Call</Space>}>
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
              {apiDebug.response || '(click API button to fire a test call)'}
            </pre>
          </div>
        ) : <Empty description="Click API button to test" />}
      </Modal>
    </Layout>
  );
};

export default CustomerSiteActivities;
