import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Form, Input, Select,
  Row, Col, Space, Tag, Tabs, message, Spin, Empty, Modal, Tooltip, Badge,
  Divider, Drawer,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, DatabaseOutlined, SearchOutlined, ReloadOutlined,
  InfoCircleOutlined, CloseOutlined, AppstoreOutlined, BarcodeOutlined,
  TagsOutlined, ApartmentOutlined, FilterOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

// ── Palette ──────────────────────────────────────────────────────────────────
const REDWOOD = {
  primary: '#C74634', primaryLight: '#E85D4A', primaryDark: '#A33B2C',
  teal: '#00918A', tealDark: '#007A74',
  success: '#1D7B4D', warning: '#B07700', info: '#0572CE', error: '#D93025',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

// ── API config ────────────────────────────────────────────────────────────────
const BASE_URL = 'https://iacney-test.fa.ocs.oraclecloud.com/fscmRestApi/resources/11.13.18.05';
const AUTH_HEADER = 'Basic ' + btoa('emparun:Fusion@1234');
const HEADERS = { Authorization: AUTH_HEADER, Accept: 'application/json' };
const PAGE_SIZE = 50;
const CHILD_LIMIT = 500;

const fetchAllPages = async (baseUrl: string): Promise<any[]> => {
  const stripped = baseUrl
    .replace(/[?&]limit=\d+/gi, '')
    .replace(/[?&]offset=\d+/gi, '')
    .replace(/\?&/, '?')
    .replace(/&&/g, '&');
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const sep = stripped.includes('?') ? '&' : '?';
    const url = `${stripped}${sep}limit=${CHILD_LIMIT}&offset=${offset}`;
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
    const d = await r.json();
    const items: any[] = Array.isArray(d) ? d : (d.items ?? []);
    all.push(...items);
    if (!d.hasMore || items.length < CHILD_LIMIT) break;
    offset += CHILD_LIMIT;
  }
  return all;
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface RawOnhand {
  ItemNumber: string;
  ItemDescription: string;
  OrganizationCode: string;
  OrganizationId: number;
  InventoryItemId: number;
  SubinventoryCode: string;
  Locator: string;
  LocatorId: number;
  PrimaryQuantity: number;
  ConsignedQuantity: number;
  PrimaryUOMCode: string;
  PrimaryUnitOfMeasure: string;
  MaterialStatus: string;
  MaterialStatusId: number;
  Revision: string | null;
  SummaryLevel: string;
  CreationDate: string;
  LastUpdateDate: string;
  links?: Array<{ rel: string; href: string; name: string; kind: string }>;
  [key: string]: any;
}

interface SearchParams {
  orgCode: string;
  itemNumber?: string;
  subinventory?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const getChildUrl = (item: RawOnhand, name: string): string | undefined =>
  item.links?.find(l => l.name === name)?.href;

const matchesFilter = (row: any, q: string): boolean => {
  if (!q) return true;
  const lower = q.toLowerCase();
  return Object.values(row).some(v =>
    v !== null && v !== undefined && String(v).toLowerCase().includes(lower)
  );
};

// ── LV field display (same pattern as Suppliers) ──────────────────────────────
const LV: React.FC<{ label: string; value?: React.ReactNode; cols?: number }> = ({ label, value, cols = 1 }) => (
  <Col xs={24} sm={12} md={6 * cols}>
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: REDWOOD.neutral900 }}>
        {value ?? <span style={{ color: REDWOOD.neutral300 }}>—</span>}
      </div>
    </div>
  </Col>
);

// ── Generic child table with local search ─────────────────────────────────────
const ChildTable: React.FC<{
  url: string;
  knownCols?: { key: string; title: string; render?: (v: any, r: any) => React.ReactNode }[];
  onRowAction?: (row: any) => void;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
}> = ({ url, knownCols, onRowAction, actionLabel, actionIcon }) => {
  const [data, setData]       = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState('');
  const [detail, setDetail]   = useState<any | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    fetchAllPages(url)
      .then(rows => { if (mounted.current) setData(rows); })
      .catch(e => { if (mounted.current) message.error(`Load failed: ${e.message}`, 5); })
      .finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, [url]);

  const filtered = data.filter(r => matchesFilter(r, filter));

  // Auto-build columns: known first, then first record extras, skip links/internal
  const autoKeys = data.length > 0
    ? Object.keys(data[0]).filter(k => k !== 'links' && !k.startsWith('_') && typeof data[0][k] !== 'object')
    : [];
  const knownKeys = (knownCols ?? []).map(c => c.key);
  const extraKeys = autoKeys.filter(k => !knownKeys.includes(k)).slice(0, 6);

  const columns: ColumnsType<any> = [
    ...(knownCols ?? []).map(c => ({
      title: c.title,
      dataIndex: c.key,
      key: c.key,
      ellipsis: true,
      render: c.render ?? ((v: any) => v ?? '—'),
    })),
    ...extraKeys.map(k => ({
      title: k.replace(/([A-Z])/g, ' $1').trim(),
      dataIndex: k,
      key: k,
      ellipsis: true,
      width: 120,
      render: (v: any) => {
        if (v === null || v === undefined) return <span style={{ color: REDWOOD.neutral300 }}>—</span>;
        if (typeof v === 'string' && v.includes('T') && v.includes(':')) return fmtDate(v);
        return String(v);
      },
    })),
    {
      title: '',
      key: '_actions',
      width: onRowAction ? 130 : 50,
      render: (_: any, row: any) => (
        <Space size={4}>
          {onRowAction && (
            <Button size="small" icon={actionIcon} style={{ fontSize: 11, color: REDWOOD.info, borderColor: REDWOOD.info }}
              onClick={() => onRowAction(row)}>
              {actionLabel}
            </Button>
          )}
          <Tooltip title="View all fields">
            <Button size="small" shape="circle" icon={<InfoCircleOutlined />}
              style={{ color: REDWOOD.info, borderColor: REDWOOD.neutral200 }}
              onClick={() => setDetail(row)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${REDWOOD.neutral200}`, display: 'flex', gap: 8, alignItems: 'center' }}>
        <FilterOutlined style={{ color: REDWOOD.neutral600, fontSize: 13 }} />
        <Input
          size="small"
          placeholder={`Filter ${data.length} records...`}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          allowClear
          style={{ maxWidth: 300 }}
        />
        {filter && (
          <Text type="secondary" style={{ fontSize: 11 }}>{filtered.length} match</Text>
        )}
      </div>
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey={(_, i) => String(i)}
        loading={loading}
        size="small"
        pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} records` }}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: loading ? ' ' : <Empty description="No records found" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        style={{ fontSize: 12 }}
      />
      <Modal
        title={<Space><InfoCircleOutlined style={{ color: REDWOOD.info }} /><span>Full Record Details</span></Space>}
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
        width={680}
        styles={{ body: { maxHeight: '60vh', overflowY: 'auto' } }}
      >
        {detail && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
            {Object.entries(detail).filter(([k]) => k !== 'links').map(([k, v]) => (
              <div key={k} style={{ borderBottom: `1px solid ${REDWOOD.neutral100}`, paddingBottom: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
                <div style={{ fontSize: 12, color: REDWOOD.neutral900, wordBreak: 'break-all' }}>
                  {v === null || v === undefined ? <span style={{ color: REDWOOD.neutral300 }}>—</span> : String(v)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
};

// ── Lots Tab ──────────────────────────────────────────────────────────────────
const LotsTab: React.FC<{ lotsUrl: string }> = ({ lotsUrl }) => {
  const [lotSerialDrawer, setLotSerialDrawer] = useState<any | null>(null);

  const lotsKnownCols = [
    { key: 'LotNumber',        title: 'Lot Number',   render: (v: any) => <Text strong style={{ fontFamily: 'monospace', color: REDWOOD.info }}>{v}</Text> },
    { key: 'PrimaryQuantity',  title: 'Qty',          render: (v: any) => <Tag color={v > 0 ? 'green' : 'default'} style={{ fontWeight: 700 }}>{v}</Tag> },
    { key: 'PrimaryUOMCode',   title: 'UOM' },
    { key: 'ExpirationDate',   title: 'Expiry',       render: (v: any) => v ? <Tag color="orange">{fmtDate(v)}</Tag> : <span style={{ color: REDWOOD.neutral300 }}>—</span> },
    { key: 'OriginationDate',  title: 'Originated',   render: (v: any) => fmtDate(v) },
    { key: 'MaterialStatus',   title: 'Status',       render: (v: any) => v ? <Tag color="blue">{v}</Tag> : '—' },
  ];

  return (
    <>
      <ChildTable
        url={lotsUrl}
        knownCols={lotsKnownCols}
        onRowAction={row => {
          const serialUrl = row.links?.find((l: any) => l.name === 'serials')?.href;
          if (serialUrl) setLotSerialDrawer({ lot: row, url: serialUrl });
          else message.info('No serials link for this lot');
        }}
        actionLabel="Serials"
        actionIcon={<BarcodeOutlined />}
      />
      <Drawer
        title={
          <Space>
            <BarcodeOutlined style={{ color: REDWOOD.teal }} />
            <span>Serials for Lot: <Text strong style={{ color: REDWOOD.info }}>{lotSerialDrawer?.lot?.LotNumber}</Text></span>
          </Space>
        }
        open={!!lotSerialDrawer}
        onClose={() => setLotSerialDrawer(null)}
        width={760}
        styles={{ body: { padding: 0 } }}
      >
        {lotSerialDrawer && (
          <ChildTable
            url={lotSerialDrawer.url}
            knownCols={[
              { key: 'SerialNumber',   title: 'Serial Number', render: (v: any) => <Text strong style={{ fontFamily: 'monospace', color: REDWOOD.teal }}>{v}</Text> },
              { key: 'CurrentStatus', title: 'Status',        render: (v: any) => v ? <Tag color="blue">{v}</Tag> : '—' },
              { key: 'LotNumber',     title: 'Lot' },
              { key: 'CreationDate',  title: 'Created',       render: (v: any) => fmtDate(v) },
            ]}
          />
        )}
      </Drawer>
    </>
  );
};

// ── Item Detail Page ──────────────────────────────────────────────────────────
const OnhandDetailPage: React.FC<{ item: RawOnhand; onClose?: () => void }> = ({ item, onClose }) => {
  const [activeTab, setActiveTab] = useState('summary');

  const lotsUrl    = getChildUrl(item, 'lots');
  const serialsUrl = getChildUrl(item, 'serials');
  const trackUrl   = getChildUrl(item, 'inventoryTrackingAttributes');

  const qtyColor = item.PrimaryQuantity > 0 ? REDWOOD.success : REDWOOD.error;

  const tabs = [
    {
      key: 'summary',
      label: <Space size={4}><AppstoreOutlined />Summary</Space>,
      children: (
        <div style={{ padding: '20px 24px' }}>
          <Row gutter={[16, 0]}>
            <LV label="Item Number"     value={<Text strong style={{ fontFamily: 'monospace', color: REDWOOD.info, fontSize: 14 }}>{item.ItemNumber}</Text>} />
            <LV label="Description"     value={item.ItemDescription} cols={2} />
            <LV label="Organization"    value={item.OrganizationCode} />
            <LV label="Subinventory"    value={item.SubinventoryCode} />
            <LV label="Locator"         value={item.Locator} />
            <LV label="On-Hand Qty"     value={<span style={{ fontWeight: 700, color: qtyColor, fontSize: 16 }}>{item.PrimaryQuantity} <span style={{ fontSize: 12, fontWeight: 400 }}>{item.PrimaryUOMCode}</span></span>} />
            <LV label="Consigned Qty"   value={item.ConsignedQuantity > 0 ? <Tag color="orange">{item.ConsignedQuantity}</Tag> : '0'} />
            <LV label="Material Status" value={<Tag color={item.MaterialStatus === 'Active' ? 'green' : 'default'}>{item.MaterialStatus ?? '—'}</Tag>} />
            <LV label="Revision"        value={item.Revision ?? '—'} />
            <LV label="Summary Level"   value={item.SummaryLevel} />
            <LV label="Inventory Item ID" value={<Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{item.InventoryItemId}</Text>} />
            <LV label="Organization ID"   value={<Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{item.OrganizationId}</Text>} />
            <LV label="Locator ID"        value={<Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{item.LocatorId}</Text>} />
            <LV label="Created"           value={fmtDate(item.CreationDate)} />
            <LV label="Last Updated"      value={fmtDate(item.LastUpdateDate)} />
          </Row>
        </div>
      ),
    },
    lotsUrl && {
      key: 'lots',
      label: <Space size={4}><TagsOutlined />Lots</Space>,
      children: <LotsTab lotsUrl={lotsUrl} />,
    },
    serialsUrl && {
      key: 'serials',
      label: <Space size={4}><BarcodeOutlined />Serials</Space>,
      children: (
        <ChildTable
          url={serialsUrl}
          knownCols={[
            { key: 'SerialNumber',  title: 'Serial Number', render: (v: any) => <Text strong style={{ fontFamily: 'monospace', color: REDWOOD.teal }}>{v}</Text> },
            { key: 'CurrentStatus', title: 'Status',        render: (v: any) => v ? <Tag color="blue">{v}</Tag> : '—' },
            { key: 'LotNumber',     title: 'Lot Number',    render: (v: any) => v ? <Tag color="purple">{v}</Tag> : '—' },
            { key: 'CreationDate',  title: 'Created',       render: (v: any) => fmtDate(v) },
            { key: 'LastUpdateDate', title: 'Updated',      render: (v: any) => fmtDate(v) },
          ]}
        />
      ),
    },
    trackUrl && {
      key: 'tracking',
      label: <Space size={4}><ApartmentOutlined />Tracking</Space>,
      children: <ChildTable url={trackUrl} />,
    },
  ].filter(Boolean) as NonNullable<typeof tabs[0]>[];

  return (
    <div style={{ background: REDWOOD.neutral100, minHeight: '100%' }}>
      {/* Toolbar */}
      <div style={{
        background: REDWOOD.teal,
        padding: '8px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}>
        <Space>
          <DatabaseOutlined style={{ color: '#fff', fontSize: 16 }} />
          <Text strong style={{ color: '#fff', fontSize: 14 }}>{item.ItemNumber}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{item.ItemDescription}</Text>
        </Space>
        <Space>
          {onClose && (
            <Button size="small" icon={<CloseOutlined />}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontWeight: 600 }}
              onClick={onClose}>
              Close
            </Button>
          )}
        </Space>
      </div>

      {/* Quick stats bar */}
      <div style={{ background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}`, padding: '10px 24px', display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <Text style={{ fontSize: 10, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Organization</Text>
          <Text strong style={{ fontSize: 13 }}>{item.OrganizationCode}</Text>
        </div>
        <div>
          <Text style={{ fontSize: 10, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Subinventory</Text>
          <Text strong style={{ fontSize: 13 }}>{item.SubinventoryCode}</Text>
        </div>
        <div>
          <Text style={{ fontSize: 10, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Locator</Text>
          <Text strong style={{ fontSize: 13 }}>{item.Locator ?? '—'}</Text>
        </div>
        <div>
          <Text style={{ fontSize: 10, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>On-Hand</Text>
          <Text strong style={{ fontSize: 18, color: qtyColor }}>{item.PrimaryQuantity} <span style={{ fontSize: 12, fontWeight: 400, color: REDWOOD.neutral600 }}>{item.PrimaryUOMCode}</span></Text>
        </div>
        <div>
          <Text style={{ fontSize: 10, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Status</Text>
          <Tag color={item.MaterialStatus === 'Active' ? 'green' : 'default'} style={{ margin: 0, fontWeight: 600 }}>{item.MaterialStatus ?? '—'}</Tag>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '16px 20px' }}>
        <Card
          styles={{ body: { padding: 0 } }}
          style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
        >
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            size="small"
            style={{ paddingLeft: 16, paddingRight: 16 }}
            tabBarStyle={{ marginBottom: 0, borderBottom: `1px solid ${REDWOOD.neutral200}` }}
            items={tabs}
          />
        </Card>
      </div>
    </div>
  );
};

// ── Search Tab ────────────────────────────────────────────────────────────────
const SearchTab: React.FC<{ onOpen: (item: RawOnhand) => void }> = ({ onOpen }) => {
  const [form] = Form.useForm();
  const [data, setData]         = useState<RawOnhand[]>([]);
  const [loading, setLoading]   = useState(false);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [params, setParams]     = useState<SearchParams | null>(null);
  const [filter, setFilter]     = useState('');
  const [searched, setSearched] = useState(false);

  const buildUrl = (p: SearchParams, pg: number) => {
    const parts: string[] = [`OrganizationCode=${p.orgCode.trim()}`];
    if (p.itemNumber?.trim()) parts.push(`ItemNumber like "${p.itemNumber.trim()}*"`);
    if (p.subinventory?.trim()) parts.push(`SubinventoryCode=${p.subinventory.trim()}`);
    const q = parts.join(';');
    const up = new URLSearchParams({
      q,
      limit: String(PAGE_SIZE),
      offset: String((pg - 1) * PAGE_SIZE),
      totalResults: 'true',
    });
    return `${BASE_URL}/inventoryOnhandBalances?${up}`;
  };

  const fetchData = useCallback(async (p: SearchParams, pg: number) => {
    setLoading(true);
    try {
      const res = await fetch(buildUrl(p, pg), { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const json = await res.json();
      setData(json.items ?? []);
      setTotal(json.totalResults ?? json.count ?? (json.items ?? []).length);
    } catch (e: any) {
      message.error(`Failed to load inventory: ${e.message}`, 6);
      setData([]); setTotal(0);
    } finally { setLoading(false); }
  }, []);

  const handleSearch = () => {
    const v = form.getFieldsValue();
    if (!v.orgCode?.trim()) { message.warning('Organization Code is required'); return; }
    const p: SearchParams = { orgCode: v.orgCode, itemNumber: v.itemNumber, subinventory: v.subinventory };
    setParams(p); setPage(1); setSearched(true); setFilter('');
    fetchData(p, 1);
  };

  const handleReset = () => {
    form.resetFields();
    setParams(null); setPage(1); setData([]); setTotal(0); setSearched(false); setFilter('');
  };

  const filtered = data.filter(r => matchesFilter(r, filter));

  const qtyTag = (qty: number) => (
    <Tag color={qty > 100 ? 'green' : qty > 0 ? 'blue' : 'default'} style={{ fontWeight: 700, minWidth: 40, textAlign: 'center' }}>{qty}</Tag>
  );

  const columns: ColumnsType<RawOnhand> = [
    {
      title: 'Item Number', dataIndex: 'ItemNumber', fixed: 'left', width: 160, ellipsis: true,
      render: (v, rec) => (
        <Button type="link" style={{ padding: 0, fontWeight: 700, color: REDWOOD.info, fontSize: 13, fontFamily: 'monospace' }}
          onClick={() => onOpen(rec)}>
          {v}
        </Button>
      ),
    },
    { title: 'Description', dataIndex: 'ItemDescription', ellipsis: true, width: 240 },
    { title: 'Org',         dataIndex: 'OrganizationCode', width: 70, render: v => <Tag>{v}</Tag> },
    { title: 'Subinventory', dataIndex: 'SubinventoryCode', width: 110 },
    { title: 'Locator',     dataIndex: 'Locator', width: 140, ellipsis: true },
    {
      title: 'On-Hand Qty', dataIndex: 'PrimaryQuantity', width: 110, align: 'right' as const,
      sorter: (a, b) => a.PrimaryQuantity - b.PrimaryQuantity,
      render: (v) => qtyTag(v),
    },
    { title: 'UOM', dataIndex: 'PrimaryUOMCode', width: 65 },
    {
      title: 'Status', dataIndex: 'MaterialStatus', width: 90,
      render: v => <Tag color={v === 'Active' ? 'green' : 'default'}>{v ?? '—'}</Tag>,
    },
    { title: 'Last Updated', dataIndex: 'LastUpdateDate', width: 110, render: fmtDate, sorter: (a, b) => (a.LastUpdateDate ?? '').localeCompare(b.LastUpdateDate ?? '') },
    {
      title: '', key: '_open', width: 50, fixed: 'right' as const,
      render: (_, rec) => (
        <Tooltip title="Open detail">
          <Button type="text" size="small" icon={<InfoCircleOutlined />}
            style={{ color: REDWOOD.info }} onClick={() => onOpen(rec)} />
        </Tooltip>
      ),
    },
  ];

  return (
    <div style={{ padding: 20 }}>
      {/* Search form */}
      <Card
        style={{ borderRadius: 8, marginBottom: 16, border: `1px solid ${REDWOOD.neutral200}` }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        <Form form={form} layout="inline" onFinish={handleSearch} style={{ gap: 8, flexWrap: 'wrap' }}>
          <Form.Item
            name="orgCode"
            label={<Text strong style={{ fontSize: 12 }}>Organization Code</Text>}
            rules={[{ required: true, message: 'Required' }]}
            style={{ marginBottom: 8 }}
          >
            <Input placeholder="e.g. MLC" style={{ width: 160 }} allowClear />
          </Form.Item>
          <Form.Item name="itemNumber" label={<Text style={{ fontSize: 12 }}>Item Number</Text>} style={{ marginBottom: 8 }}>
            <Input placeholder="e.g. 6UW42AA (prefix search)" style={{ width: 200 }} allowClear />
          </Form.Item>
          <Form.Item name="subinventory" label={<Text style={{ fontSize: 12 }}>Subinventory</Text>} style={{ marginBottom: 8 }}>
            <Input placeholder="e.g. S02" style={{ width: 130 }} allowClear />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
                Search
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {/* Results */}
      {searched && (
        <Card
          styles={{ body: { padding: 0 } }}
          style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
          title={
            <Space>
              <DatabaseOutlined style={{ color: REDWOOD.teal }} />
              <Text strong>On-Hand Balances</Text>
              <Badge count={total} overflowCount={9999} style={{ background: REDWOOD.teal }} />
            </Space>
          }
          extra={
            <Input
              size="small"
              prefix={<FilterOutlined style={{ color: REDWOOD.neutral600 }} />}
              placeholder="Filter results..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              allowClear
              style={{ width: 220 }}
            />
          }
        >
          <Table
            dataSource={filtered}
            columns={columns}
            rowKey={(_, i) => String(i)}
            loading={loading}
            size="small"
            scroll={{ x: 1100 }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total,
              showSizeChanger: false,
              showTotal: (t, [s, e]) => `${s}–${e} of ${t} items`,
              onChange: (p) => { setPage(p); if (params) fetchData(params, p); },
            }}
            style={{ fontSize: 12 }}
            locale={{ emptyText: <Empty description="No inventory records found" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          />
        </Card>
      )}

      {!searched && (
        <div style={{ textAlign: 'center', paddingTop: 60, color: REDWOOD.neutral600 }}>
          <DatabaseOutlined style={{ fontSize: 48, color: REDWOOD.neutral300, display: 'block', marginBottom: 12 }} />
          <Text type="secondary">Enter an Organization Code and click Search to view on-hand inventory</Text>
        </div>
      )}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const ManageOnhandInventory: React.FC = () => {
  const [tabs, setTabs]         = useState<{ key: string; item: RawOnhand }[]>([]);
  const [activeKey, setActiveKey] = useState('search');

  const handleOpen = (item: RawOnhand) => {
    const key = `${item.InventoryItemId}-${item.SubinventoryCode}-${item.LocatorId}`;
    if (!tabs.find(t => t.key === key)) {
      setTabs(prev => [...prev, { key, item }]);
    }
    setActiveKey(key);
  };

  const handleClose = (key: string) => {
    const idx = tabs.findIndex(t => t.key === key);
    setTabs(prev => prev.filter(t => t.key !== key));
    if (activeKey === key) {
      setActiveKey(tabs[idx - 1]?.key ?? 'search');
    }
  };

  const tabItems = [
    {
      key: 'search',
      label: <Space size={4}><SearchOutlined />Search</Space>,
      children: <SearchTab onOpen={handleOpen} />,
      closable: false,
    },
    ...tabs.map(t => ({
      key: t.key,
      label: (
        <Space size={4}>
          <DatabaseOutlined style={{ fontSize: 11 }} />
          <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', whiteSpace: 'nowrap' }}>
            {t.item.ItemNumber}
          </span>
        </Space>
      ),
      children: (
        <OnhandDetailPage
          key={t.key}
          item={t.item}
          onClose={() => handleClose(t.key)}
        />
      ),
      closable: true,
    })),
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{ padding: '10px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/procurement">Procurement</Link> },
            { title: 'On-Hand Inventory' },
          ]} />
        </div>

        {/* Page header */}
        <div style={{ background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}`, padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: `linear-gradient(135deg, ${REDWOOD.teal} 0%, ${REDWOOD.tealDark} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 12px ${REDWOOD.teal}40`,
          }}>
            <DatabaseOutlined style={{ fontSize: 22, color: '#fff' }} />
          </div>
          <div>
            <Title level={4} style={{ margin: 0, color: REDWOOD.neutral900 }}>On-Hand Inventory</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>Real-time inventory balances · Lots · Serial Numbers</Text>
          </div>
        </div>

        {/* Tabs */}
        <Tabs
          type="editable-card"
          hideAdd
          activeKey={activeKey}
          onChange={setActiveKey}
          onEdit={(key, action) => { if (action === 'remove') handleClose(String(key)); }}
          style={{ background: REDWOOD.surface }}
          tabBarStyle={{ margin: 0, paddingLeft: 16, background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}
          items={tabItems}
        />
      </Content>
    </Layout>
  );
};

export default ManageOnhandInventory;
