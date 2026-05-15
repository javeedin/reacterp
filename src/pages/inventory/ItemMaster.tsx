import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  Layout, Breadcrumb, Typography, Card, Table, Input, Row, Col, Spin, Alert,
  Tag, Select, Drawer, List, Badge, Tabs, Button, Form, Descriptions,
  Space, Progress, Modal, message, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, AppstoreOutlined, SearchOutlined, CloseOutlined,
  EditOutlined, ReloadOutlined, TagsOutlined, StopOutlined,
  ApiOutlined, CopyOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';

const { Content } = Layout;
const { Title, Text } = Typography;

const ORDS_BASE = 'https://g827cd88c3cfc03-mitsumioracledb.adb.me-dubai-1.oraclecloudapps.com/ords/test/FUSIONCLIENTERP';

const REDWOOD = {
  primary: '#C74634', primaryDark: '#A33B2C', primaryLight: '#E85D4A',
  success: '#1D7B4D', warning: '#D4A800', info: '#0572CE', error: '#D93025',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
  teal: '#00918A',
};

const ATTR_LABELS: Record<string, string> = {
  attribute1: 'Brand', attribute2: 'Type', attribute3: 'RMA',
  attribute4: 'Rep Status', attribute5: 'Category',
  attribute6: 'Attr 6', attribute7: 'Attr 7', attribute8: 'Attr 8',
  attribute9: 'Attr 9', attribute10: 'Attr 10',
};

interface ItemRow {
  inventory_item_id: string;
  item_number: string;
  description: string;
  primary_uom_code: string;
  inventory_item_status_code: string;
  organization_code: string;
  inventory_org_code: string | null;
  sales_account: string;
  item_price: string;
  barcode: string | null;
  old_item_code: string;
  inventory_item_flag: string;
  stock_enabled_flag: string;
  inventory_asset_flag: string;
  attribute1: string; attribute2: string; attribute3: string;
  attribute4: string; attribute5: string; attribute6: string;
  attribute7: string; attribute8: string; attribute9: string;
  attribute10: string;
  instance_name: string | null;
}

interface EditTab { key: string; item: ItemRow; }

// ── Module-level cache (survives navigation back to the page) ─────────────────
let _cache: ItemRow[] | null = null;

// ── Edit Item Panel ───────────────────────────────────────────────────────────
const EditItemPanel: React.FC<{ item: ItemRow }> = ({ item }) => {
  const flagTag = (v: string) =>
    v === 'Y' ? <Tag color="success">Yes</Tag> : <Tag color="default">{v || 'No'}</Tag>;

  const section = (title: string, children: React.ReactNode) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 10, paddingBottom: 4,
        borderBottom: `2px solid ${REDWOOD.neutral200}`,
      }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>{item.item_number}</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>{item.description}</Text>
        </div>
        <Tag style={{ borderRadius: 10, fontSize: 12 }} color={item.inventory_item_status_code === 'Active' ? 'success' : 'error'}>
          {item.inventory_item_status_code}
        </Tag>
      </div>

      {section('Basic Information',
        <Descriptions size="small" bordered column={3}
          labelStyle={{ fontWeight: 600, fontSize: 12, background: REDWOOD.neutral100 }}
          contentStyle={{ fontSize: 12 }}>
          <Descriptions.Item label="Item Number">{item.item_number || '—'}</Descriptions.Item>
          <Descriptions.Item label="Old Item Code">{item.old_item_code || '—'}</Descriptions.Item>
          <Descriptions.Item label="Barcode">{item.barcode || '—'}</Descriptions.Item>
          <Descriptions.Item label="Description" span={2}>{item.description || '—'}</Descriptions.Item>
          <Descriptions.Item label="UOM">{item.primary_uom_code || '—'}</Descriptions.Item>
          <Descriptions.Item label="Organization">{item.organization_code || '—'}</Descriptions.Item>
          <Descriptions.Item label="Inv Org Code">{item.inventory_org_code || '—'}</Descriptions.Item>
          <Descriptions.Item label="Instance">{item.instance_name || '—'}</Descriptions.Item>
        </Descriptions>
      )}

      {section('Pricing & Accounting',
        <Descriptions size="small" bordered column={3}
          labelStyle={{ fontWeight: 600, fontSize: 12, background: REDWOOD.neutral100 }}
          contentStyle={{ fontSize: 12 }}>
          <Descriptions.Item label="Item Price">
            {item.item_price?.trim() ? <Text strong style={{ color: REDWOOD.success }}>{item.item_price.trim()}</Text> : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Sales Account">{item.sales_account?.trim() || '—'}</Descriptions.Item>
          <Descriptions.Item label="Status">
            <Tag color={item.inventory_item_status_code === 'Active' ? 'success' : 'error'} style={{ borderRadius: 10 }}>
              {item.inventory_item_status_code}
            </Tag>
          </Descriptions.Item>
        </Descriptions>
      )}

      {section('Inventory Flags',
        <Descriptions size="small" bordered column={3}
          labelStyle={{ fontWeight: 600, fontSize: 12, background: REDWOOD.neutral100 }}
          contentStyle={{ fontSize: 12 }}>
          <Descriptions.Item label="Inventory Item">{flagTag(item.inventory_item_flag)}</Descriptions.Item>
          <Descriptions.Item label="Stock Enabled">{flagTag(item.stock_enabled_flag)}</Descriptions.Item>
          <Descriptions.Item label="Inventory Asset">{flagTag(item.inventory_asset_flag)}</Descriptions.Item>
        </Descriptions>
      )}

      {section('Attributes',
        <Descriptions size="small" bordered column={3}
          labelStyle={{ fontWeight: 600, fontSize: 12, background: REDWOOD.neutral100 }}
          contentStyle={{ fontSize: 12 }}>
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <Descriptions.Item key={n} label={ATTR_LABELS[`attribute${n}`] ?? `Attr ${n}`}>
              {(item as any)[`attribute${n}`] || '—'}
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const ItemMaster: React.FC = () => {
  const [form] = Form.useForm();

  // search state
  const [searching, setSearching] = useState(false);
  const [fetchProgress, setFetchProgress] = useState<{ fetched: number; page: number } | null>(null);
  const [searchError, setSearchError] = useState('');
  const [results, setResults] = useState<ItemRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [cacheSize, setCacheSize] = useState<number>(_cache?.length ?? 0);

  // drawer state
  const [drawer, setDrawer] = useState<{ open: boolean; label: string; values: { value: string; count: number }[] }>({
    open: false, label: '', values: [],
  });

  // API debug modal
  const [apiOpen, setApiOpen] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [apiError, setApiError] = useState('');

  // tabs
  const [activeTabKey, setActiveTabKey] = useState('search');
  const [editTabs, setEditTabs] = useState<EditTab[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const testUrl = `${ORDS_BASE}/inventory/itemmaster?limit=5&offset=0`;

  // ── Fetch all pages ──────────────────────────────────────────────────────────
  const fetchAll = useCallback(async (signal: AbortSignal): Promise<ItemRow[]> => {
    if (_cache) return _cache;
    const all: ItemRow[] = [];
    let offset = 0;
    const limit = 500;
    let page = 1;
    while (true) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const r = await fetch(`${ORDS_BASE}/inventory/itemmaster?limit=${limit}&offset=${offset}`, { signal });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
      const d = await r.json();
      const items: ItemRow[] = d.items ?? (Array.isArray(d) ? d : []);
      all.push(...items);
      setFetchProgress({ fetched: all.length, page });
      if (!d.hasMore || items.length < limit) break;
      offset += limit;
      page++;
    }
    _cache = all;
    return all;
  }, []);

  // ── Search handler ───────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const vals = form.getFieldsValue();
    setSearching(true);
    setSearchError('');
    setFetchProgress(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const allData = await fetchAll(ctrl.signal);
      setCacheSize(allData.length);

      const filtered = allData.filter(row => {
        if (vals.itemNumber) {
          const q = vals.itemNumber.toLowerCase();
          const num = (row.item_number || '').toLowerCase();
          const old = (row.old_item_code || '').toLowerCase();
          if (!num.includes(q) && !old.includes(q)) return false;
        }
        if (vals.description) {
          if (!(row.description || '').toLowerCase().includes(vals.description.toLowerCase())) return false;
        }
        if (vals.status && row.inventory_item_status_code !== vals.status) return false;
        if (vals.org && row.organization_code !== vals.org) return false;
        if (vals.brand && row.attribute1 !== vals.brand) return false;
        if (vals.category && row.attribute5 !== vals.category) return false;
        return true;
      });

      setResults(filtered);
      setSearched(true);
    } catch (e: any) {
      if (e.name !== 'AbortError') setSearchError(e.message);
    } finally {
      setSearching(false);
      setFetchProgress(null);
    }
  }, [form, fetchAll]);

  const handleCancel = () => abortRef.current?.abort();

  const handleReset = () => {
    form.resetFields();
    setResults([]);
    setSearched(false);
    setSearchError('');
  };

  // ── Distinct values for drawer ───────────────────────────────────────────────
  const openDrawer = (attrKey: string) => {
    const data = _cache ?? [];
    const map = new Map<string, number>();
    data.forEach(row => {
      const v = String((row as any)[attrKey] ?? '').trim() || '(blank)';
      map.set(v, (map.get(v) ?? 0) + 1);
    });
    const values = Array.from(map.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
    setDrawer({ open: true, label: ATTR_LABELS[attrKey] ?? attrKey, values });
  };

  // ── Options (from cache or empty until first search) ─────────────────────────
  const makeOptions = (key: keyof ItemRow) => {
    const data = _cache ?? [];
    const set = new Set(data.map(r => String(r[key] ?? '')).filter(Boolean));
    return Array.from(set).sort().map(v => ({ label: v, value: v }));
  };

  // ── Edit tabs ────────────────────────────────────────────────────────────────
  const openEditTab = (item: ItemRow) => {
    const key = `edit-${item.inventory_item_id}`;
    if (editTabs.some(t => t.key === key)) { setActiveTabKey(key); return; }
    setEditTabs(prev => [...prev, { key, item }]);
    setActiveTabKey(key);
  };

  const closeEditTab = (targetKey: string) => {
    const newTabs = editTabs.filter(t => t.key !== targetKey);
    setEditTabs(newTabs);
    if (activeTabKey === targetKey)
      setActiveTabKey(newTabs.length > 0 ? newTabs[newTabs.length - 1].key : 'search');
  };

  // ── Table columns ────────────────────────────────────────────────────────────
  const columns: ColumnsType<ItemRow> = [
    {
      title: 'Item Number', dataIndex: 'item_number', key: 'item_number', width: 140, fixed: 'left', ellipsis: true,
      render: v => <Text code style={{ fontSize: 11 }}>{v}</Text>,
    },
    { title: 'Description', dataIndex: 'description', key: 'description', width: 280, ellipsis: true },
    { title: 'Org', dataIndex: 'organization_code', key: 'org', width: 70, align: 'center' },
    { title: 'UOM', dataIndex: 'primary_uom_code', key: 'uom', width: 65, align: 'center' },
    {
      title: 'Status', dataIndex: 'inventory_item_status_code', key: 'status', width: 90,
      render: (v: string) => <Tag style={{ borderRadius: 10, fontSize: 11 }} color={v === 'Active' ? 'success' : 'error'}>{v || '—'}</Tag>,
    },
    {
      title: 'Price', dataIndex: 'item_price', key: 'price', width: 80, align: 'right',
      render: v => v?.trim() ? v.trim() : '—',
    },
    {
      title: 'Inv', dataIndex: 'inventory_item_flag', key: 'inv', width: 55, align: 'center',
      render: v => v === 'Y' ? <Tag color="success" style={{ fontSize: 10, margin: 0 }}>Y</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Stock', dataIndex: 'stock_enabled_flag', key: 'stock', width: 60, align: 'center',
      render: v => v === 'Y' ? <Tag color="success" style={{ fontSize: 10, margin: 0 }}>Y</Tag> : <Text type="secondary">—</Text>,
    },
    { title: 'Brand', dataIndex: 'attribute1', key: 'brand', width: 110, ellipsis: true, render: v => v || '—' },
    { title: 'Type', dataIndex: 'attribute2', key: 'type', width: 100, ellipsis: true, render: v => v || '—' },
    { title: 'RMA', dataIndex: 'attribute3', key: 'rma', width: 80, render: v => v || '—' },
    { title: 'Rep Status', dataIndex: 'attribute4', key: 'repstatus', width: 100, render: v => v || '—' },
    { title: 'Category', dataIndex: 'attribute5', key: 'cat', width: 100, render: v => v || '—' },
    {
      title: '', key: 'actions', width: 80, fixed: 'right',
      render: (_: any, record: ItemRow) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => openEditTab(record)}
          style={{ fontSize: 11, color: REDWOOD.info, borderColor: REDWOOD.info }}>
          Edit
        </Button>
      ),
    },
  ];

  // ── KPI cards (only shown when cache has data) ───────────────────────────────
  const kpiAttrs = ['attribute1', 'attribute2', 'attribute3', 'attribute4', 'attribute5'];

  // ── Search tab content ───────────────────────────────────────────────────────
  const searchTabContent = (
    <div>
      {/* KPI row — only when cache has data */}
      {cacheSize > 0 && (
        <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
          <Col xs={12} sm={8} md={4}>
            <Card style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, textAlign: 'center' }}
              styles={{ body: { padding: '12px 10px' } }}>
              <Text style={{ fontSize: 22, fontWeight: 700, color: REDWOOD.success, display: 'block' }}>{cacheSize.toLocaleString()}</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>Total Items</Text>
            </Card>
          </Col>
          {kpiAttrs.map(attr => {
            const data = _cache ?? [];
            const set = new Set(data.map(r => (r as any)[attr]).filter(Boolean));
            return (
              <Col xs={12} sm={8} md={4} key={attr}>
                <Card hoverable onClick={() => openDrawer(attr)}
                  style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, textAlign: 'center', cursor: 'pointer' }}
                  styles={{ body: { padding: '12px 10px' } }}>
                  <Text style={{ fontSize: 22, fontWeight: 700, color: REDWOOD.info, display: 'block' }}>{set.size}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{ATTR_LABELS[attr]}</Text>
                  <Text style={{ fontSize: 10, color: REDWOOD.neutral300, display: 'block' }}>distinct values</Text>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* Search form */}
      <Card
        style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, marginBottom: 16 }}
        styles={{ body: { padding: '16px 20px 12px' } }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Space>
              <SearchOutlined style={{ color: REDWOOD.primary }} />
              <Text strong style={{ fontSize: 13 }}>Search Parameters</Text>
            </Space>
            <Space size={8}>
              {cacheSize > 0 && (
                <Tag icon={<CheckCircleOutlined />} color="success" style={{ borderRadius: 10, fontSize: 11 }}>
                  {cacheSize.toLocaleString()} items cached
                </Tag>
              )}
              <Tooltip title="View API endpoint and test it">
                <Button size="small" icon={<ApiOutlined />}
                  onClick={() => { setApiResponse(null); setApiError(''); setApiOpen(true); }}
                  style={{ fontSize: 11, color: REDWOOD.info, borderColor: REDWOOD.info }}>
                  API
                </Button>
              </Tooltip>
            </Space>
          </div>
        }
      >
        <Form form={form} layout="vertical">
          <Row gutter={[16, 0]}>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="itemNumber" label={<Text style={{ fontSize: 12 }}>Item Number</Text>} style={{ marginBottom: 12 }}>
                <Input placeholder="e.g. 005049573" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="description" label={<Text style={{ fontSize: 12 }}>Description</Text>} style={{ marginBottom: 12 }}>
                <Input placeholder="Partial description..." allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8} md={4}>
              <Form.Item name="status" label={<Text style={{ fontSize: 12 }}>Status</Text>} style={{ marginBottom: 12 }}>
                <Select placeholder="Any" options={makeOptions('inventory_item_status_code')} allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8} md={4}>
              <Form.Item name="org" label={<Text style={{ fontSize: 12 }}>Organization</Text>} style={{ marginBottom: 12 }}>
                <Select placeholder="Any" options={makeOptions('organization_code')} allowClear showSearch />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8} md={4}>
              <Form.Item name="brand" label={<Text style={{ fontSize: 12 }}>Brand (Attr 1)</Text>} style={{ marginBottom: 12 }}>
                <Select placeholder="Any" options={makeOptions('attribute1')} allowClear showSearch />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8} md={4}>
              <Form.Item name="category" label={<Text style={{ fontSize: 12 }}>Category (Attr 5)</Text>} style={{ marginBottom: 12 }}>
                <Select placeholder="Any" options={makeOptions('attribute5')} allowClear showSearch />
              </Form.Item>
            </Col>
          </Row>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button
              type="primary"
              icon={searching ? <Spin size="small" /> : <SearchOutlined />}
              onClick={handleSearch}
              disabled={searching}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary, fontWeight: 600, minWidth: 100 }}
            >
              {searching ? 'Searching...' : 'Search'}
            </Button>
            {searching && (
              <Button danger icon={<StopOutlined />} onClick={handleCancel}>Cancel</Button>
            )}
            {!searching && (
              <Button icon={<ReloadOutlined />} onClick={handleReset}>Clear</Button>
            )}
            {searching && fetchProgress && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Fetching page {fetchProgress.page} — {fetchProgress.fetched.toLocaleString()} items loaded...
              </Text>
            )}
            {searched && !searching && (
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
                {results.length.toLocaleString()} result{results.length !== 1 ? 's' : ''}
              </Text>
            )}
          </div>
        </Form>
      </Card>

      {searching && fetchProgress && (
        <Progress
          percent={undefined}
          status="active"
          strokeColor={REDWOOD.primary}
          style={{ marginBottom: 16 }}
          format={() => `${fetchProgress.fetched.toLocaleString()} items — page ${fetchProgress.page}`}
        />
      )}

      {searchError && <Alert type="error" message={searchError} style={{ marginBottom: 16 }} closable onClose={() => setSearchError('')} />}

      {/* Results table */}
      {searched && !searching && (
        <Card style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }} styles={{ body: { padding: 0 } }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${REDWOOD.neutral200}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong style={{ fontSize: 13 }}>Results</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{results.length.toLocaleString()} items</Text>
          </div>
          <Table
            dataSource={results}
            columns={columns}
            rowKey={(r, i) => r.inventory_item_id || String(i)}
            size="small"
            bordered
            scroll={{ x: 1400 }}
            pagination={{ pageSize: 100, showSizeChanger: true, pageSizeOptions: ['50', '100', '250'], showTotal: t => `${t.toLocaleString()} records` }}
          />
        </Card>
      )}

      {/* API Debug Modal */}
      <Modal
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /> API Debug — Item Master</Space>}
        open={apiOpen}
        onCancel={() => setApiOpen(false)}
        footer={<Button onClick={() => setApiOpen(false)}>Close</Button>}
        width={720}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>Data URL (paginated, 500 per page):</Text>
            <div style={{
              background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.neutral200}`,
              borderRadius: 6, padding: '8px 12px', fontFamily: 'monospace',
              fontSize: 12, wordBreak: 'break-all', margin: '6px 0',
            }}>
              {`${ORDS_BASE}/inventory/itemmaster?limit=500&offset=0`}
            </div>
            <Button size="small" icon={<CopyOutlined />} onClick={() => {
              navigator.clipboard.writeText(`${ORDS_BASE}/inventory/itemmaster?limit=500&offset=0`);
              message.success('URL copied!');
            }}>Copy</Button>
          </div>

          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>Test URL (first 5 items):</Text>
            <div style={{
              background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.neutral200}`,
              borderRadius: 6, padding: '8px 12px', fontFamily: 'monospace',
              fontSize: 12, wordBreak: 'break-all', margin: '6px 0 8px',
            }}>
              {testUrl}
            </div>
            <Button type="primary" icon={<ApiOutlined />} loading={apiLoading}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              onClick={async () => {
                setApiLoading(true); setApiResponse(null); setApiError('');
                try {
                  const res = await fetch(testUrl, { headers: { Accept: 'application/json' } });
                  const text = await res.text();
                  let parsed: any;
                  try { parsed = JSON.parse(text); } catch { parsed = text; }
                  setApiResponse({ status: res.status, ok: res.ok, body: parsed });
                } catch (err: any) {
                  setApiError(err.message);
                } finally { setApiLoading(false); }
              }}>
              Test API
            </Button>
          </div>

          {apiError && <Alert type="error" message={apiError} />}

          {apiResponse && (
            <div>
              <Space style={{ marginBottom: 6 }}>
                <Tag color={apiResponse.ok ? 'success' : 'error'}>HTTP {apiResponse.status}</Tag>
                {apiResponse.ok && apiResponse.body?.items && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {apiResponse.body.items.length} items · hasMore: {String(apiResponse.body.hasMore)} · count: {apiResponse.body.count ?? 'n/a'}
                  </Text>
                )}
              </Space>
              <div style={{
                background: '#1e1e1e', borderRadius: 6, padding: '10px 14px',
                fontFamily: 'monospace', fontSize: 11, color: '#d4d4d4',
                maxHeight: 320, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {JSON.stringify(apiResponse.body, null, 2)}
              </div>
            </div>
          )}
        </Space>
      </Modal>

      {/* Attribute drawer */}
      <Drawer
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space><TagsOutlined />{drawer.label} — Distinct Values</Space>
            <Badge count={drawer.values.length} style={{ backgroundColor: REDWOOD.info }} />
          </div>
        }
        open={drawer.open}
        onClose={() => setDrawer(d => ({ ...d, open: false }))}
        width={380}
        closeIcon={<CloseOutlined />}
      >
        <List size="small" dataSource={drawer.values}
          renderItem={item => (
            <List.Item style={{ padding: '8px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 13 }} ellipsis title={item.value}>{item.value}</Text>
                <Tag style={{ borderRadius: 10, minWidth: 44, textAlign: 'center' }} color="blue">
                  {item.count.toLocaleString()}
                </Tag>
              </div>
            </List.Item>
          )}
        />
      </Drawer>
    </div>
  );

  // ── Tab items ────────────────────────────────────────────────────────────────
  const tabItems = [
    {
      key: 'search',
      label: <span style={{ fontSize: 12 }}><SearchOutlined style={{ marginRight: 5 }} />Search Items</span>,
      closable: false,
      children: searchTabContent,
    },
    ...editTabs.map(tab => ({
      key: tab.key,
      label: <span style={{ fontSize: 12 }}><EditOutlined style={{ marginRight: 5, color: REDWOOD.info }} />{tab.item.item_number}</span>,
      closable: true,
      children: <EditItemPanel item={tab.item} />,
    })),
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        <div style={{ padding: '10px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/procurement">Procurement</Link> },
            { title: 'Item Master' },
          ]} />
        </div>

        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0 10px' }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: `linear-gradient(135deg, ${REDWOOD.success} 0%, #155E3A 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 3px 10px ${REDWOOD.success}40`,
            }}>
              <AppstoreOutlined style={{ fontSize: 22, color: '#fff' }} />
            </div>
            <div>
              <Title level={3} style={{ margin: 0, color: REDWOOD.neutral900 }}>Item Master</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>Item catalog with attributes, pricing and flags</Text>
            </div>
          </div>

          <Tabs
            type="editable-card"
            activeKey={activeTabKey}
            onChange={setActiveTabKey}
            onEdit={(targetKey, action) => {
              if (action === 'remove' && typeof targetKey === 'string') closeEditTab(targetKey);
            }}
            hideAdd
            items={tabItems}
            tabBarStyle={{ marginBottom: 0 }}
          />
        </div>
      </Content>
    </Layout>
  );
};

export default ItemMaster;
