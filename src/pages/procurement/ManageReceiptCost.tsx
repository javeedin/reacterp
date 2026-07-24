import React, { useState, useCallback, useEffect } from 'react';
import {
  Layout, Typography, Card, Table, Button, Form, Input, Space, Tabs,
  Tooltip, Row, Col, Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, ReconciliationOutlined, SearchOutlined, ReloadOutlined,
  FilterOutlined, ApiOutlined, ClearOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';

const { Content } = Layout;
const { Title, Text } = Typography;

// ── Palette ───────────────────────────────────────────────────────────────────
const REDWOOD = {
  primary: '#C74634', primaryDark: '#A33B2C',
  teal: '#00918A', tealDark: '#007A74',
  success: '#1D7B4D', warning: '#B07700', info: '#0572CE', error: '#D93025',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

// ── API ───────────────────────────────────────────────────────────────────────
const BASE_URL = 'https://iacney-test.fa.ocs.oraclecloud.com/fscmRestApi/resources/11.13.18.05';
const AUTH_HEADER = 'Basic ' + btoa('emparun:Fusion@1234');
const HEADERS = { Authorization: AUTH_HEADER, Accept: 'application/json' };
const PAGE_LIMIT = 500;

// ── Helpers ───────────────────────────────────────────────────────────────────
const numFmt = (v: any) =>
  v == null || v === '' || isNaN(Number(v)) ? '—'
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(Number(v));

const fmtDate = (d?: string) => {
  if (!d || typeof d !== 'string' || d.length < 10) return d ?? '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const matchesFilter = (row: any, q: string) => {
  const needle = q.toLowerCase();
  return Object.values(row).some(v => v != null && String(v).toLowerCase().includes(needle));
};

// Split a ValuationUnit like "COSTORG-INVORG-SUBINV-LOT\-2026020223" into parts.
// Hyphens escaped as "\-" (inside the lot) are NOT split points.
const parseValuationUnit = (vu?: string) => {
  if (!vu) return { costOrg: '', invOrg: '', subinv: '', lot: '' };
  const parts = String(vu).split(/(?<!\\)-/);   // split on unescaped hyphens
  return {
    costOrg: parts[0] || '',
    invOrg:  parts[1] || '',
    subinv:  parts[2] || '',
    lot:     parts.slice(3).join('-').replace(/\\-/g, '-'),
  };
};

// The four columns a ValuationUnit is broken into (like the on-hand cost tabs).
const vuCols: ColumnsType<any> = [
  { title: 'Cost Org',      key: '_vu_costOrg', width: 150, ellipsis: true, render: (_: any, r: any) => { const p = parseValuationUnit(r.ValuationUnit); return <Text strong style={{ fontSize: 12 }}>{p.costOrg || '—'}</Text>; } },
  { title: 'Inventory Org', key: '_vu_invOrg',  width: 150, ellipsis: true, render: (_: any, r: any) => { const p = parseValuationUnit(r.ValuationUnit); return <Text style={{ fontSize: 12 }}>{p.invOrg || '—'}</Text>; } },
  { title: 'Subinventory',  key: '_vu_subinv',  width: 130,                 render: (_: any, r: any) => { const p = parseValuationUnit(r.ValuationUnit); return p.subinv ? <Tag color="cyan">{p.subinv}</Tag> : '—'; } },
  { title: 'Lot',           key: '_vu_lot',     width: 180, ellipsis: true, render: (_: any, r: any) => { const p = parseValuationUnit(r.ValuationUnit); return p.lot ? <Tag color="geekblue">{p.lot}</Tag> : '—'; } },
];

// Build clean columns: drop links, object-valued and all-null columns, hide *Id.
// A ValuationUnit column is broken into Cost Org / Inventory Org / Subinventory / Lot.
const buildCols = (rows: any[]): ColumnsType<any> => {
  const keys: string[] = [];
  rows.forEach(r => Object.keys(r).forEach(k => {
    if (k === 'links') return;
    if (/id$/i.test(k)) return;                 // hide all *Id columns
    if (keys.includes(k)) return;
    const hasValue = rows.some(row => {
      const v = row[k];
      return v != null && v !== '' && !(typeof v === 'object');
    });
    if (hasValue) keys.push(k);
  }));
  const cols: ColumnsType<any> = [];
  keys.forEach(k => {
    if (/^valuationunit$/i.test(k)) { cols.push(...vuCols); return; }   // break it out
    cols.push({
      title: k, dataIndex: k, key: k, ellipsis: true,
      width: /description|name/i.test(k) ? 220 : 150,
      render: (v: any) => {
        if (v == null || v === '') return <span style={{ color: REDWOOD.neutral300 }}>—</span>;
        if (/date/i.test(k) && typeof v === 'string' && v.length >= 10) return <Text style={{ fontSize: 12 }}>{fmtDate(v)}</Text>;
        if (/cost|amount|price|qty|quantity|value/i.test(k) && !isNaN(Number(v)))
          return <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{numFmt(v)}</Text>;
        return <Text style={{ fontSize: 12 }}>{String(v)}</Text>;
      },
    });
  });
  return cols;
};

// Pull all receiptCosts (paged) — capped so a bad filter can't run away.
const fetchAllReceiptCosts = async (baseUrl: string, cap = 5000): Promise<any[]> => {
  const stripped = baseUrl.replace(/[?&]limit=\d+/gi, '').replace(/[?&]offset=\d+/gi, '').replace(/\?&/, '?').replace(/&&/g, '&');
  const all: any[] = [];
  let offset = 0;
  const step = PAGE_LIMIT;
  while (all.length < cap) {
    const sep = stripped.includes('?') ? '&' : '?';
    const r = await fetch(`${stripped}${sep}limit=${step}&offset=${offset}`, { headers: HEADERS });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
    const d = await r.json();
    const items: any[] = Array.isArray(d) ? d : (d.items ?? []);
    all.push(...items);
    if (!d.hasMore || items.length < step) break;
    offset += step;
  }
  return all;
};

interface SearchVals {
  item?: string;
  valuationUnit?: string;
  reference?: string;
}

// ── Search Tab ────────────────────────────────────────────────────────────────
const SearchTab: React.FC = () => {
  const [form] = Form.useForm();
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');
  const [filter, setFilter]   = useState('');

  const buildUrl = (vals: SearchVals) => {
    const clauses: string[] = [];
    if (vals.item)          clauses.push(`Item like "${vals.item}*"`);
    if (vals.valuationUnit) clauses.push(`ValuationUnit like "${vals.valuationUnit}*"`);
    if (vals.reference)     clauses.push(`ReferenceNumber like "${vals.reference}*"`);
    const qs = clauses.length ? `?q=${encodeURIComponent(clauses.join(';'))}` : '';
    return `${BASE_URL}/receiptCosts${qs}`;
  };

  const currentUrl = `${buildUrl(form.getFieldsValue())}${buildUrl(form.getFieldsValue()).includes('?') ? '&' : '?'}limit=${PAGE_LIMIT}`;

  const search = useCallback(() => {
    const vals = form.getFieldsValue() as SearchVals;
    setLoading(true); setErr('');
    fetchAllReceiptCosts(buildUrl(vals))
      .then(d => setRows(d))
      .catch(e => { setErr(e.message); setRows([]); })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  // Show full data on open.
  useEffect(() => { search(); }, [search]);

  const reset = () => { form.resetFields(); setFilter(''); search(); };

  const columns = React.useMemo(() => buildCols(rows), [rows]);
  const filtered = filter ? rows.filter(r => matchesFilter(r, filter)) : rows;

  return (
    <div style={{ padding: 16 }}>
      <Form form={form} layout="vertical" onFinish={search}>
        <Row gutter={12}>
          <Col xs={24} sm={8} md={6}>
            <Form.Item name="item" label="Item Number" style={{ marginBottom: 12 }}>
              <Input allowClear placeholder="e.g. SM-A055FLGDAFB" onPressEnter={search} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Form.Item name="valuationUnit" label="Valuation Unit" style={{ marginBottom: 12 }}>
              <Input allowClear placeholder="Valuation unit" onPressEnter={search} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Form.Item name="reference" label="Reference # (PO)" style={{ marginBottom: 12 }}>
              <Input allowClear placeholder="e.g. 2026020223" onPressEnter={search} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={24} md={6}>
            <Form.Item label=" " style={{ marginBottom: 12 }}>
              <Space>
                <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}
                  style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>
                  Search
                </Button>
                <Button icon={<ClearOutlined />} onClick={reset}>Reset</Button>
              </Space>
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 10px', gap: 8, flexWrap: 'wrap' }}>
        <Space>
          <Input size="small" allowClear prefix={<FilterOutlined />} placeholder="Filter results…"
            value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 240 }} />
          <Text type="secondary" style={{ fontSize: 12 }}>{filtered.length} row(s)</Text>
        </Space>
        <Space>
          <Button size="small" icon={<ReloadOutlined />} onClick={search} loading={loading}>Refresh</Button>
          <Tooltip title={<span style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>GET {currentUrl}</span>} placement="bottomRight">
            <ApiOutlined style={{ color: REDWOOD.info, cursor: 'pointer', fontSize: 15 }} />
          </Tooltip>
        </Space>
      </div>

      {err && <div style={{ color: REDWOOD.error, fontSize: 12, marginBottom: 8 }}>Failed to load: {err}</div>}
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey={(_, i) => String(i)}
        loading={loading}
        size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: (t) => `${t} rows` }}
        locale={{ emptyText: loading ? 'Loading…' : (err ? 'Error' : 'No receipt costs found') }}
      />
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────
const ManageReceiptCost: React.FC = () => {
  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb — back to Procurement (Purchasing) only */}
        <div style={{ padding: '10px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Space>
            <Link to="/home"><HomeOutlined /> Home</Link>
            <Text type="secondary">/</Text>
            <Link to="/procurement">Procurement</Link>
            <Text type="secondary">/</Text>
            <Text>Manage Receipt Cost</Text>
          </Space>
        </div>

        <div style={{ padding: 20 }}>
          {/* Page header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: `linear-gradient(135deg, ${REDWOOD.teal} 0%, ${REDWOOD.tealDark} 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 14px ${REDWOOD.teal}40`,
            }}>
              <ReconciliationOutlined style={{ fontSize: 22, color: '#fff' }} />
            </div>
            <div>
              <Title level={3} style={{ margin: 0, color: REDWOOD.neutral900 }}>Manage Receipt Cost</Title>
              <Text type="secondary">Receipt costs from Oracle Fusion (receiptCosts)</Text>
            </div>
          </div>

          <Card styles={{ body: { padding: 0 } }}
            style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <Tabs
              size="small"
              style={{ paddingLeft: 16, paddingRight: 16 }}
              tabBarStyle={{ marginBottom: 0, borderBottom: `1px solid ${REDWOOD.neutral200}` }}
              items={[{
                key: 'search',
                label: <Space size={4}><SearchOutlined />Search</Space>,
                children: <SearchTab />,
              }]}
            />
          </Card>
        </div>
      </Content>
    </Layout>
  );
};

export default ManageReceiptCost;
