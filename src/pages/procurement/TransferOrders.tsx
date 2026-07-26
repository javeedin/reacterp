import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Layout, Breadcrumb, Card, Table, Form, Input, Select, DatePicker, Button,
  Tabs, Tag, Typography, Space, Tooltip, Spin, Row, Col, message, Modal,
  InputNumber, Empty, Divider,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, SwapOutlined, SearchOutlined, ReloadOutlined, PlusOutlined,
  DeleteOutlined, ApiOutlined, CopyOutlined, ClearOutlined, EyeOutlined,
  CheckCircleOutlined, EnvironmentOutlined, InfoCircleOutlined, CloudUploadOutlined,
  UnorderedListOutlined, EditOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';

const { Content } = Layout;
const { Title, Text } = Typography;

// Electron goes direct (no CORS); browser dev routes via the Vite proxy.
// preload exposes window.electronAPI (not window.electron) — detect via that.
const _isElectron = !!(window as unknown as { electron?: unknown; electronAPI?: unknown }).electron
  || !!(window as unknown as { electronAPI?: unknown }).electronAPI;
const FUSION_BASE = _isElectron
  ? 'https://iacney-test.fa.ocs.oraclecloud.com/fscmRestApi/resources/11.13.18.05'
  : '/fusion-api';
const AUTH_HEADER = 'Basic ' + btoa('emparun:Fusion@1234');
const FUSION_HDRS = { Authorization: AUTH_HEADER, Accept: 'application/json' };
const CHILD_LIMIT = 500;

const REDWOOD = {
  primary: '#C74634', primaryLight: '#E85D4A', primaryDark: '#A33B2C',
  success: '#1D7B4D', warning: '#B07700', info: '#0572CE', error: '#D93025',
  teal: '#00918A', purple: '#7245A6',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d?: string) => { if (!d) return '—'; try { return dayjs(d).format('D-MMM-YYYY'); } catch { return d; } };
const fmtQty = (v?: number | null) => (v == null ? '—' : new Intl.NumberFormat('en-US').format(v));
const fmtPrice = (v?: number | null, ccy?: string) => {
  if (v == null) return '—';
  const s = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
  return ccy ? `${s} ${ccy}` : s;
};

// Run async fn over items with limited concurrency (avoids hammering Fusion).
const mapLimit = async <T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> => {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const cur = idx++;
      out[cur] = await fn(items[cur], cur);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
};

const fetchAllPages = async (baseUrl: string): Promise<any[]> => {
  const stripped = baseUrl.replace(/[?&]limit=\d+/gi, '').replace(/[?&]offset=\d+/gi, '').replace(/\?&/, '?').replace(/&&/g, '&');
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const sep = stripped.includes('?') ? '&' : '?';
    const url = `${stripped}${sep}limit=${CHILD_LIMIT}&offset=${offset}`;
    const r = await fetch(url, { headers: FUSION_HDRS });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
    const d = await r.json();
    const items: any[] = Array.isArray(d) ? d : (d.items ?? []);
    all.push(...items);
    if (!d.hasMore || items.length < CHILD_LIMIT) break;
    offset += CHILD_LIMIT;
  }
  return all;
};

const statusTag = (s?: string) => {
  if (!s) return <Tag>—</Tag>;
  const up = s.toUpperCase();
  const color = up.includes('CLOSE') ? 'default' : up.includes('OPEN') ? 'blue'
    : up.includes('PROCESS') || up.includes('INTERFACE') ? 'purple'
    : up.includes('CANCEL') ? 'red' : up.includes('SHIP') ? 'green' : 'geekblue';
  return <Tag color={color} style={{ fontSize: 11 }}>{s}</Tag>;
};

interface Org { code: string; name: string }

// ── Shared: inventory-organization dropdown source ───────────────────────────
const useOrgs = () => {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const url = `${FUSION_BASE}/inventoryOrganizations?onlyData=true&limit=500`;
  const load = useCallback(() => {
    setLoading(true); setError('');
    fetch(url, { headers: FUSION_HDRS })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status} ${r.statusText}`)))
      .then(d => {
        const items: any[] = Array.isArray(d) ? d : (d.items ?? []);
        const seen = new Set<string>();
        const list = items
          .map(o => ({ code: o.OrganizationCode, name: o.OrganizationName }))
          .filter(o => o.code && !seen.has(o.code) && seen.add(o.code))
          .sort((a, b) => String(a.code).localeCompare(String(b.code)));
        setOrgs(list);
        if (list.length === 0) setError('inventoryOrganizations returned no rows.');
      })
      .catch(e => setError(e?.message || 'Failed to load organizations'))
      .finally(() => setLoading(false));
  }, [url]);
  useEffect(() => { load(); }, [load]);
  return { orgs, loading, error, load, url };
};

const orgOptions = (orgs: Org[]) => orgs.map(o => ({
  value: o.code, label: `${o.code} — ${o.name ?? ''}`,
}));

// ═══════════════════════════════════════════════════════════════════════════
//  SEARCH TAB
// ═══════════════════════════════════════════════════════════════════════════
const SearchTab: React.FC<{ orgsLoading: boolean; orgsUrl: string; reloadOrgs: () => void; onEdit: (headerId: number, headerNumber: string) => void }> =
  ({ orgsLoading, orgsUrl, reloadOrgs, onEdit }) => {
  const [form] = Form.useForm();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [apiOpen, setApiOpen] = useState(false);
  const [lineCache, setLineCache] = useState<Record<number, any[]>>({});
  const [lineLoading, setLineLoading] = useState<Record<number, boolean>>({});

  const [filters, setFilters] = useState<{ header?: string; bu?: string; status?: string; iface?: string; dateOp?: string; date?: Dayjs | null }>({
    dateOp: '>', date: dayjs().subtract(30, 'day'),
  });

  // NOTE: the transferOrders header has no org fields (source/destination org
  // live on the lines). Dates are filtered UNQUOTED, e.g. OrderedDate>2026-04-06.
  const buildQ = useCallback((f: typeof filters) => {
    const parts: string[] = [];
    if (f.header?.trim()) parts.push(`HeaderNumber="${f.header.trim()}"`);
    if (f.bu?.trim()) parts.push(`BusinessUnitName LIKE "${f.bu.trim()}*"`);
    if (f.status) parts.push(`Status="${f.status}"`);
    if (f.iface?.trim()) parts.push(`InterfaceStatus LIKE "${f.iface.trim()}*"`);
    if (f.date) parts.push(`OrderedDate${f.dateOp || '>'}${dayjs(f.date).format('YYYY-MM-DD')}`);
    return parts.join(';');
  }, []);

  const searchUrl = useMemo(() => {
    const q = buildQ(filters);
    const qs = q ? `q=${encodeURIComponent(q)}&` : '';
    return `${FUSION_BASE}/transferOrders?${qs}orderBy=OrderedDate:desc&onlyData=true&limit=200`;
  }, [filters, buildQ]);

  const runSearch = useCallback(async () => {
    setLoading(true); setError(''); setSearched(true); setLineCache({});
    try {
      const items = await fetchAllPages(searchUrl.replace(/&?limit=\d+/, ''));
      setRows(items);
      if (items.length === 0) setError('No transfer orders matched.');
    } catch (e: any) {
      setError(e.message); setRows([]);
    } finally { setLoading(false); }
  }, [searchUrl]);

  useEffect(() => { runSearch(); /* initial default search */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLines = useCallback(async (rec: any) => {
    const id = rec.HeaderId;
    if (lineCache[id] || lineLoading[id]) return;
    setLineLoading(p => ({ ...p, [id]: true }));
    try {
      const link = rec.links?.find((l: any) => l.name === 'transferOrderLines')?.href;
      const base = link ?? `${FUSION_BASE}/transferOrders/${id}/child/transferOrderLines`;
      const items = await fetchAllPages(base);
      setLineCache(p => ({ ...p, [id]: items }));
    } catch (e: any) {
      setLineCache(p => ({ ...p, [id]: [] }));
      message.error(`Lines: ${e.message}`);
    } finally { setLineLoading(p => ({ ...p, [id]: false })); }
  }, [lineCache, lineLoading]);

  const columns: ColumnsType<any> = [
    { title: 'Order #', dataIndex: 'HeaderNumber', width: 100, fixed: 'left',
      render: (v, r) => <Button type="link" style={{ padding: 0, fontWeight: 700, color: REDWOOD.info, fontSize: 13 }}
        onClick={() => onEdit(r.HeaderId, String(v))}>{v ?? '—'}</Button> },
    { title: 'Business Unit', dataIndex: 'BusinessUnitName', width: 230, ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Source', dataIndex: 'SourceOfTransferOrder', width: 190, ellipsis: true,
      render: (v, r) => <Tooltip title={v}><Tag color="purple" style={{ fontSize: 11 }}>{r.SourceTypeLookup ?? '—'}</Tag>
        <Text style={{ fontSize: 12 }}>{v ?? ''}</Text></Tooltip> },
    { title: 'Status', dataIndex: 'Status', width: 100, render: v => statusTag(v) },
    { title: 'Interface Status', dataIndex: 'InterfaceStatus', width: 170, render: v => statusTag(v) },
    { title: 'Ordered Date', dataIndex: 'OrderedDate', width: 130, render: fmtDate },
    { title: 'Total Transfer Price', dataIndex: 'TotalTransferPrice', width: 150, align: 'right',
      render: (v, r) => <Text strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: REDWOOD.primary }}>
        {v == null ? '—' : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v)) + (r.CurrencyCode ? ` ${r.CurrencyCode}` : '')}
      </Text> },
    { title: 'Created By', dataIndex: 'CreatedBy', width: 110, render: v => v ?? '—' },
    { title: 'Created', dataIndex: 'CreationDate', width: 120, render: fmtDate },
  ];

  const pick = (r: any, keys: string[]) => { for (const k of keys) { const v = r?.[k]; if (v != null && v !== '') return v; } return undefined; };
  const lineColumns: ColumnsType<any> = [
    { title: 'Line', dataIndex: 'LineNumber', width: 55, align: 'center', render: v => <Tag color="blue" style={{ fontSize: 11 }}>{v ?? '—'}</Tag> },
    { title: 'Item', width: 140, render: (_, r) => <Text strong style={{ fontSize: 12, color: REDWOOD.info }}>{pick(r, ['ItemNumber', 'Item']) ?? '—'}</Text> },
    { title: 'Description', width: 220, ellipsis: true, render: (_, r) => <Text style={{ fontSize: 12 }}>{pick(r, ['ItemDescription', 'Description']) ?? '—'}</Text> },
    { title: 'Source Org', width: 130, render: (_, r) => <Tag color="blue" style={{ fontSize: 11 }}>{pick(r, ['SourceOrganizationCode', 'SourceOrganization', 'ShipFromOrganizationCode']) ?? '—'}</Tag> },
    { title: 'Dest Org', width: 130, render: (_, r) => <Tag color="geekblue" style={{ fontSize: 11 }}>{pick(r, ['DestinationOrganizationCode', 'DestinationOrganization', 'ShipToOrganizationCode']) ?? '—'}</Tag> },
    { title: 'UOM', width: 70, align: 'center', render: (_, r) => <Tag style={{ fontSize: 11 }}>{pick(r, ['UOMCode', 'UOMName', 'UnitOfMeasure', 'UOM']) ?? '—'}</Tag> },
    { title: 'Requested Qty', width: 110, align: 'right', render: (_, r) => fmtQty(pick(r, ['Quantity', 'RequestedQuantity', 'OrderedQuantity'])) },
    { title: 'Shipped', width: 90, align: 'right', render: (_, r) => { const v = pick(r, ['ShippedQuantity', 'QuantityShipped']); return <Text style={{ color: (Number(v) || 0) > 0 ? REDWOOD.success : undefined }}>{fmtQty(v)}</Text>; } },
    { title: 'Received', width: 90, align: 'right', render: (_, r) => { const v = pick(r, ['ReceivedQuantity', 'QuantityReceived']); return <Text style={{ color: (Number(v) || 0) > 0 ? REDWOOD.success : undefined }}>{fmtQty(v)}</Text>; } },
    { title: 'Src Subinv', width: 110, render: (_, r) => pick(r, ['SourceSubinventoryCode', 'SourceSubinventory']) ?? '—' },
    { title: 'Dst Subinv', width: 110, render: (_, r) => pick(r, ['DestinationSubinventoryCode', 'DestinationSubinventory']) ?? '—' },
    { title: 'Requested Ship', width: 130, render: (_, r) => fmtDate(pick(r, ['RequestedShipDate', 'ScheduledShipDate'])) },
    { title: 'Requested Delivery', width: 140, render: (_, r) => fmtDate(pick(r, ['RequestedDeliveryDate', 'RequestedArrivalDate'])) },
    { title: 'Status', width: 120, render: (_, r) => statusTag(pick(r, ['Status', 'StatusCode'])) },
  ];

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card styles={{ body: { padding: '14px 18px' } }} style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
        <Form form={form} layout="vertical">
          <Row gutter={[10, 0]}>
            <Col xs={24} sm={12} md={4}>
              <Form.Item label={<Text style={{ fontSize: 12, fontWeight: 600 }}>Order Number</Text>} style={{ marginBottom: 8 }}>
                <Input placeholder="Header number" allowClear value={filters.header}
                  onChange={e => setFilters(f => ({ ...f, header: e.target.value }))} onPressEnter={runSearch} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item label={<Text style={{ fontSize: 12, fontWeight: 600 }}>Business Unit</Text>} style={{ marginBottom: 8 }}>
                <Input placeholder="Business unit name" allowClear value={filters.bu}
                  onChange={e => setFilters(f => ({ ...f, bu: e.target.value }))} onPressEnter={runSearch} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Form.Item label={<Text style={{ fontSize: 12, fontWeight: 600 }}>Status</Text>} style={{ marginBottom: 8 }}>
                <Select allowClear placeholder="Any" value={filters.status}
                  onChange={v => setFilters(f => ({ ...f, status: v }))}
                  options={['Open', 'Closed', 'Canceled'].map(s => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Form.Item label={<Text style={{ fontSize: 12, fontWeight: 600 }}>Interface Status</Text>} style={{ marginBottom: 8 }}>
                <Input placeholder="e.g. Interfaced" allowClear value={filters.iface}
                  onChange={e => setFilters(f => ({ ...f, iface: e.target.value }))} onPressEnter={runSearch} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item label={<Text style={{ fontSize: 12, fontWeight: 600 }}>Ordered Date</Text>} style={{ marginBottom: 8 }}>
                <Space.Compact style={{ width: '100%' }}>
                  <Select style={{ width: 72 }} value={filters.dateOp} onChange={v => setFilters(f => ({ ...f, dateOp: v }))}
                    options={['>', '>=', '=', '<=', '<'].map(o => ({ value: o, label: o }))} />
                  <DatePicker style={{ width: '100%' }} value={filters.date} onChange={d => setFilters(f => ({ ...f, date: d }))} />
                </Space.Compact>
              </Form.Item>
            </Col>
          </Row>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={runSearch}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>Search</Button>
            <Button icon={<ClearOutlined />} onClick={() => { setFilters({ dateOp: '>', date: dayjs().subtract(30, 'day') }); }}>Reset</Button>
            <Tooltip title="API Inspector — transferOrders web service">
              <Button icon={<ApiOutlined />} style={{ marginLeft: 'auto', borderColor: REDWOOD.info, color: REDWOOD.info }}
                onClick={() => setApiOpen(true)}>API</Button>
            </Tooltip>
          </div>
        </Form>
      </Card>

      <Card
        styles={{ body: { padding: 0 } }}
        style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
        title={<Space><SwapOutlined style={{ color: REDWOOD.primary }} /><Text strong>Transfer Orders</Text>
          {rows.length > 0 && <Tag>{rows.length} result{rows.length !== 1 ? 's' : ''}</Tag>}</Space>}
        extra={<Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={runSearch}>Refresh</Button>}
      >
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" tip="Loading…" /></div>
        ) : error && rows.length === 0 ? (
          <div style={{ padding: 24, color: REDWOOD.error, background: REDWOOD.error + '10', margin: 16, borderRadius: 6 }}>
            <InfoCircleOutlined style={{ marginRight: 8 }} />{error}
          </div>
        ) : !searched ? (
          <Empty description="Run a search" style={{ padding: 60 }} />
        ) : rows.length === 0 ? (
          <Empty description="No transfer orders" style={{ padding: 60 }} />
        ) : (
          <Table
            columns={columns}
            dataSource={rows}
            rowKey={(r, i) => `${r.HeaderId ?? i}`}
            size="small"
            scroll={{ x: 1350 }}
            pagination={{ pageSize: 25, size: 'small', showSizeChanger: true }}
            expandable={{
              onExpand: (expanded, rec) => { if (expanded) loadLines(rec); },
              expandedRowRender: (rec) => {
                const id = rec.HeaderId;
                return lineLoading[id] ? <Spin style={{ margin: 16 }} /> : (
                  <Table
                    columns={lineColumns}
                    dataSource={lineCache[id] ?? []}
                    rowKey={(l, i) => `${l.LineNumber ?? i}`}
                    size="small"
                    pagination={false}
                    scroll={{ x: 1300 }}
                    locale={{ emptyText: 'No lines' }}
                  />
                );
              },
            }}
          />
        )}
      </Card>

      <Modal title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /> Transfer Orders API</Space>}
        open={apiOpen} onCancel={() => setApiOpen(false)} footer={null} width={860}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { lbl: 'Search Transfer Orders', method: 'GET', url: searchUrl },
            { lbl: 'Transfer Order Lines', method: 'GET', url: `${FUSION_BASE}/transferOrders/{HeaderId}/child/transferOrderLines` },
            { lbl: 'Organizations dropdown', method: 'GET', url: orgsUrl },
          ].map(({ lbl, method, url }) => (
            <div key={lbl}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase' }}>{lbl}</Text>
                <Button size="small" type="text" icon={<CopyOutlined />} style={{ marginLeft: 'auto' }}
                  onClick={() => { navigator.clipboard.writeText(url); message.success('Copied'); }}>Copy</Button>
              </div>
              <div style={{ marginTop: 4, padding: '8px 12px', borderRadius: 6, background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.neutral200}`, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', color: REDWOOD.info }}>
                <Tag color="blue">{method}</Tag>{url}
              </div>
            </div>
          ))}
          <Button size="small" icon={<ReloadOutlined />} loading={orgsLoading} onClick={reloadOrgs} style={{ alignSelf: 'flex-start' }}>Reload orgs</Button>
          <Text type="secondary" style={{ fontSize: 11 }}>Auth: Basic [emparun] · Accept: application/json</Text>
        </div>
      </Modal>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  NEW TRANSFER ORDER TAB
// ═══════════════════════════════════════════════════════════════════════════
interface NewLine { key: number; itemNumber: string; quantity: number | null; uom: string; }

const NewOrderTab: React.FC<{ orgs: Org[]; orgsLoading: boolean }> = ({ orgs, orgsLoading }) => {
  const [srcOrg, setSrcOrg]   = useState<string>();
  const [dstOrg, setDstOrg]   = useState<string>();
  const [srcSub, setSrcSub]   = useState<string>();
  const [dstSub, setDstSub]   = useState<string>();
  const [needBy, setNeedBy]   = useState<Dayjs | null>(dayjs().add(3, 'day'));
  const [ifaceCode, setIfaceCode] = useState('EXT');
  const [lines, setLines]     = useState<NewLine[]>([{ key: 1, itemNumber: '', quantity: null, uom: 'Ea' }]);
  const seqRef = React.useRef(1);

  const [srcSubs, setSrcSubs] = useState<string[]>([]);
  const [dstSubs, setDstSubs] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]   = useState<{ ok: boolean; status: number; body: string } | null>(null);
  const [payloadOpen, setPayloadOpen] = useState(false);

  const loadSubs = (org: string | undefined, set: (v: string[]) => void) => {
    if (!org) { set([]); return; }
    fetch(`${FUSION_BASE}/subinventories?q=OrganizationCode=${encodeURIComponent(org)}&onlyData=true&limit=500`, { headers: FUSION_HDRS })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => {
        const items: any[] = Array.isArray(d) ? d : (d.items ?? []);
        set(Array.from(new Set(items.map(i => i.SecondaryInventoryName).filter(Boolean))).sort());
      })
      .catch(() => set([]));
  };
  useEffect(() => { setSrcSub(undefined); loadSubs(srcOrg, setSrcSubs); }, [srcOrg]);
  useEffect(() => { setDstSub(undefined); loadSubs(dstOrg, setDstSubs); }, [dstOrg]);

  const addLine = () => { seqRef.current += 1; setLines(l => [...l, { key: seqRef.current, itemNumber: '', quantity: null, uom: 'Ea' }]); };
  const delLine = (key: number) => setLines(l => l.filter(x => x.key !== key));
  const clearLines = () => { seqRef.current = 1; setLines([{ key: 1, itemNumber: '', quantity: null, uom: 'Ea' }]); };
  const updLine = (key: number, patch: Partial<NewLine>) => setLines(l => l.map(x => x.key === key ? { ...x, ...patch } : x));

  const validLines = lines.filter(l => l.itemNumber.trim() && (l.quantity ?? 0) > 0);

  const payload = useMemo(() => ({
    InterfaceSourceCode: ifaceCode || 'EXT',
    supplyRequestLines: validLines.map((l, i) => ({
      SupplyRequestLineNumber: i + 1,
      SupplyType: 'TRANSFER',
      DestinationTypeCode: 'INVENTORY',
      SourceOrganizationCode: srcOrg,
      DestinationOrganizationCode: dstOrg,
      ItemNumber: l.itemNumber.trim(),
      Quantity: l.quantity,
      UOMCode: l.uom || 'Ea',
      ...(needBy ? { NeedByDate: dayjs(needBy).format('YYYY-MM-DD') } : {}),
      ...(srcSub ? { SourceSubinventoryCode: srcSub } : {}),
      ...(dstSub ? { DestinationSubinventoryCode: dstSub } : {}),
    })),
  }), [ifaceCode, validLines, srcOrg, dstOrg, needBy, srcSub, dstSub]);

  const postUrl = `${FUSION_BASE}/supplyRequests`;

  const validate = (): string | null => {
    if (!srcOrg) return 'Select a source organization';
    if (!dstOrg) return 'Select a destination organization';
    if (srcOrg === dstOrg) return 'Source and destination organizations must differ';
    if (validLines.length === 0) return 'Add at least one line with an item number and quantity';
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) { message.error(err); return; }
    Modal.confirm({
      title: 'Create Transfer Order?',
      width: 560,
      content: (
        <div style={{ fontSize: 13 }}>
          Transfer <b>{validLines.length}</b> item line{validLines.length !== 1 ? 's' : ''} from{' '}
          <Tag color="blue">{srcOrg}</Tag> to <Tag color="geekblue">{dstOrg}</Tag> via Supply Chain Orchestration.
          <div style={{ marginTop: 8, color: REDWOOD.neutral600, fontSize: 12 }}>
            POST {postUrl}
          </div>
        </div>
      ),
      okText: 'Create',
      onOk: async () => {
        setSubmitting(true); setResult(null);
        try {
          const r = await fetch(postUrl, {
            method: 'POST',
            headers: { ...FUSION_HDRS, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const raw = await r.text();
          let pretty = raw; try { pretty = JSON.stringify(JSON.parse(raw), null, 2); } catch { /* keep raw */ }
          setResult({ ok: r.ok, status: r.status, body: pretty });
          if (r.ok) message.success('Supply request submitted — transfer order will be created by SCO');
          else message.error(`Create failed (HTTP ${r.status})`);
        } catch (e: any) {
          setResult({ ok: false, status: 0, body: `Network error: ${e.message}` });
          message.error(e.message);
        } finally { setSubmitting(false); }
      },
    });
  };

  const lineColumns: ColumnsType<NewLine> = [
    { title: '#', width: 42, align: 'center', render: (_, __, i) => <Text style={{ color: REDWOOD.neutral600 }}>{i + 1}</Text> },
    { title: <span>Item Number <span style={{ color: REDWOOD.error }}>*</span></span>, dataIndex: 'itemNumber',
      render: (v, r) => <Input placeholder="e.g. AS54888" value={v} onChange={e => updLine(r.key, { itemNumber: e.target.value })} /> },
    { title: <span>Quantity <span style={{ color: REDWOOD.error }}>*</span></span>, dataIndex: 'quantity', width: 150,
      render: (v, r) => <InputNumber min={0} style={{ width: '100%' }} value={v ?? undefined} onChange={val => updLine(r.key, { quantity: val })} /> },
    { title: 'UOM', dataIndex: 'uom', width: 100,
      render: (v, r) => <Input value={v} onChange={e => updLine(r.key, { uom: e.target.value })} /> },
    { title: '', width: 46, align: 'center',
      render: (_, r) => <Tooltip title="Remove line"><Button size="small" type="text" danger icon={<DeleteOutlined />}
        onClick={() => delLine(r.key)} disabled={lines.length === 1} /></Tooltip> },
  ];

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card title={<Space><EnvironmentOutlined style={{ color: REDWOOD.primary }} /><Text strong>Transfer Details</Text></Space>}
        styles={{ body: { padding: '16px 20px' } }} style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
        <Row gutter={[14, 4]}>
          <Col xs={24} md={7}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Source Organization <span style={{ color: REDWOOD.error }}>*</span></div>
            <Select showSearch placeholder="From organization" loading={orgsLoading} style={{ width: '100%' }}
              options={orgOptions(orgs)} optionFilterProp="label" value={srcOrg} onChange={setSrcOrg} />
          </Col>
          <Col xs={24} md={5}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Source Subinventory</div>
            <Select allowClear showSearch placeholder={srcOrg ? 'Optional' : 'Pick org first'} disabled={!srcOrg}
              style={{ width: '100%' }} value={srcSub} onChange={setSrcSub}
              options={srcSubs.map(s => ({ value: s, label: s }))}
              notFoundContent={srcSubs.length === 0 ? 'No subinventories' : undefined} />
          </Col>
          <Col xs={24} md={7}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Destination Organization <span style={{ color: REDWOOD.error }}>*</span></div>
            <Select showSearch placeholder="To organization" loading={orgsLoading} style={{ width: '100%' }}
              options={orgOptions(orgs)} optionFilterProp="label" value={dstOrg} onChange={setDstOrg} />
          </Col>
          <Col xs={24} md={5}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Destination Subinventory</div>
            <Select allowClear showSearch placeholder={dstOrg ? 'Optional' : 'Pick org first'} disabled={!dstOrg}
              style={{ width: '100%' }} value={dstSub} onChange={setDstSub}
              options={dstSubs.map(s => ({ value: s, label: s }))}
              notFoundContent={dstSubs.length === 0 ? 'No subinventories' : undefined} />
          </Col>
          <Col xs={24} md={7} style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Need-By Date</div>
            <DatePicker style={{ width: '100%' }} value={needBy} onChange={setNeedBy} />
          </Col>
          <Col xs={24} md={5} style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Interface Source</div>
            <Input value={ifaceCode} onChange={e => setIfaceCode(e.target.value)} placeholder="EXT" />
          </Col>
        </Row>
        {srcOrg && dstOrg && srcOrg === dstOrg && (
          <div style={{ marginTop: 10, color: REDWOOD.error, fontSize: 12 }}>
            <InfoCircleOutlined style={{ marginRight: 6 }} />Source and destination organizations must be different.
          </div>
        )}
      </Card>

      <Card title={<Space><SwapOutlined style={{ color: REDWOOD.primary }} /><Text strong>Items to Transfer</Text>
        <Tag>{validLines.length} valid line{validLines.length !== 1 ? 's' : ''}</Tag></Space>}
        styles={{ body: { padding: 0 } }} style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
        extra={<Space>
          <Button size="small" icon={<PlusOutlined />} onClick={addLine}>Add Line</Button>
          <Button size="small" icon={<ClearOutlined />} onClick={clearLines}>Clear</Button>
        </Space>}>
        <Table columns={lineColumns} dataSource={lines} rowKey="key" size="small" pagination={false} />
      </Card>

      <Card styles={{ body: { padding: '14px 18px' } }} style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button icon={<EyeOutlined />} onClick={() => setPayloadOpen(true)}>Show Payload</Button>
          <Button type="primary" icon={<CloudUploadOutlined />} loading={submitting} onClick={submit}
            style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}>Create Transfer Order</Button>
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 'auto', fontFamily: 'monospace' }}>
            <Tag color="green">POST</Tag>{postUrl}
          </Text>
        </div>
        {result && (
          <div style={{ marginTop: 14 }}>
            <Space style={{ marginBottom: 6 }}>
              <Tag color={result.ok ? 'success' : result.status === 0 ? 'default' : 'error'}>
                {result.status === 0 ? 'Network Error' : `HTTP ${result.status}`}
              </Tag>
              {result.ok && <Text style={{ color: REDWOOD.success, fontSize: 12 }}><CheckCircleOutlined /> Submitted to Supply Chain Orchestration</Text>}
              <Button size="small" type="text" icon={<CopyOutlined />}
                onClick={() => { navigator.clipboard.writeText(result.body); message.success('Copied'); }}>Copy</Button>
            </Space>
            <div style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 6, fontFamily: 'monospace', fontSize: 11, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {result.body.slice(0, 6000)}{result.body.length > 6000 ? '\n\n… (truncated)' : ''}
            </div>
          </div>
        )}
      </Card>

      <Modal title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /> Request Payload — supplyRequests</Space>}
        open={payloadOpen} onCancel={() => setPayloadOpen(false)} width={720}
        footer={<Button onClick={() => { navigator.clipboard.writeText(JSON.stringify(payload, null, 2)); message.success('Copied'); }} icon={<CopyOutlined />}>Copy JSON</Button>}>
        <div style={{ padding: '6px 10px', borderRadius: 6, background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.neutral200}`, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', color: REDWOOD.info, marginBottom: 10 }}>
          <Tag color="green">POST</Tag>{postUrl}
        </div>
        <div style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 6, fontFamily: 'monospace', fontSize: 11, maxHeight: 420, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(payload, null, 2)}
        </div>
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
          <InfoCircleOutlined style={{ marginRight: 6 }} />
          Transfer orders are created asynchronously by Supply Chain Orchestration. After submitting, search the
          Search Orders tab (by source/destination org) to find the generated transfer order.
        </Text>
      </Modal>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  SEARCH LINES TAB — date-driven orders GET, then fan out to each order's lines
// ═══════════════════════════════════════════════════════════════════════════
const SearchLinesTab: React.FC<{ onEdit: (headerId: number, headerNumber: string) => void }> = ({ onEdit }) => {
  const [dateOp, setDateOp] = useState('>');
  const [date, setDate]     = useState<Dayjs | null>(dayjs().subtract(30, 'day'));
  const [allLines, setAllLines] = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [progress, setProgress] = useState('');
  const [searched, setSearched] = useState(false);
  const [error, setError]       = useState('');
  const [apiOpen, setApiOpen]   = useState(false);

  // client-side filters over the fetched lines
  const [fOrder, setFOrder]   = useState('');
  const [fItem, setFItem]     = useState('');
  const [fSrc, setFSrc]       = useState<string>();
  const [fDst, setFDst]       = useState<string>();
  const [fStatus, setFStatus] = useState<string>();
  const [fText, setFText]     = useState('');

  const ordersUrl = useMemo(() => {
    const q = date ? `q=${encodeURIComponent(`OrderedDate${dateOp}${dayjs(date).format('YYYY-MM-DD')}`)}&` : '';
    return `${FUSION_BASE}/transferOrders?${q}orderBy=OrderedDate:desc&onlyData=true`;
  }, [date, dateOp]);

  const run = useCallback(async () => {
    setLoading(true); setError(''); setSearched(true); setAllLines([]); setProgress('Fetching transfer orders…');
    try {
      const headers = await fetchAllPages(ordersUrl);
      if (headers.length === 0) { setError('No transfer orders in this date range.'); setLoading(false); return; }
      setProgress(`Loading lines for ${headers.length} order${headers.length !== 1 ? 's' : ''}…`);
      let done = 0;
      const perOrder = await mapLimit(headers, 6, async (h) => {
        const link = h.links?.find((l: any) => l.name === 'transferOrderLines')?.href;
        const base = link ?? `${FUSION_BASE}/transferOrders/${h.HeaderId}/child/transferOrderLines`;
        try {
          const lines = await fetchAllPages(base);
          return lines.map(ln => ({
            ...ln,
            _headerId: h.HeaderId,
            _headerNumber: h.HeaderNumber,
            _orderedDate: h.OrderedDate,
            _headerStatus: h.Status,
          }));
        } catch { return []; }
        finally { done += 1; setProgress(`Loading lines… ${done}/${headers.length} orders`); }
      });
      const flat = perOrder.flat();
      setAllLines(flat);
      if (flat.length === 0) setError('Orders found but no lines returned.');
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); setProgress(''); }
  }, [ordersUrl]);

  useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const srcOrgOpts = useMemo(() => Array.from(new Set(allLines.map(l => l.SourceOrganizationCode).filter(Boolean))).sort()
    .map(c => ({ value: c, label: c })), [allLines]);
  const dstOrgOpts = useMemo(() => Array.from(new Set(allLines.map(l => l.DestinationOrganizationCode).filter(Boolean))).sort()
    .map(c => ({ value: c, label: c })), [allLines]);
  const statusOpts = useMemo(() => Array.from(new Set(allLines.map(l => l.TransferOrderLineStatus).filter(Boolean))).sort()
    .map(c => ({ value: c, label: c })), [allLines]);

  const filtered = useMemo(() => {
    const t = fText.trim().toLowerCase();
    return allLines.filter(l =>
      (!fOrder.trim() || String(l._headerNumber ?? '').toLowerCase().includes(fOrder.trim().toLowerCase())) &&
      (!fItem.trim() || String(l.ItemNumber ?? '').toLowerCase().includes(fItem.trim().toLowerCase())) &&
      (!fSrc || l.SourceOrganizationCode === fSrc) &&
      (!fDst || l.DestinationOrganizationCode === fDst) &&
      (!fStatus || l.TransferOrderLineStatus === fStatus) &&
      (!t || JSON.stringify(l).toLowerCase().includes(t))
    );
  }, [allLines, fOrder, fItem, fSrc, fDst, fStatus, fText]);

  const totalPrice = filtered.reduce((s, l) => s + (Number(l.TotalTransferPrice) || 0), 0);
  const ccy = filtered.find(l => l.CurrencyCode)?.CurrencyCode ?? allLines.find(l => l.CurrencyCode)?.CurrencyCode ?? '';

  const columns: ColumnsType<any> = [
    { title: 'Order #', dataIndex: '_headerNumber', width: 100, fixed: 'left',
      render: (v, r) => <Button type="link" style={{ padding: 0, fontWeight: 700, color: REDWOOD.info, fontSize: 13 }}
        onClick={() => onEdit(r._headerId, String(v))}>{v ?? '—'}</Button> },
    { title: 'Line', dataIndex: 'DisplayLineNumber', width: 55, align: 'center', render: (v, r) => <Tag color="blue" style={{ fontSize: 11 }}>{v ?? r.LineNumber ?? '—'}</Tag> },
    { title: 'Item', dataIndex: 'ItemNumber', width: 120, render: v => <Text strong style={{ fontSize: 12, color: REDWOOD.info }}>{v ?? '—'}</Text> },
    { title: 'Description', dataIndex: 'ItemDescription', width: 220, ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Source Org', width: 150, ellipsis: true,
      render: (_, r) => <Tooltip title={r.SourceOrganizationName}><Tag color="blue" style={{ fontSize: 11 }}>{r.SourceOrganizationCode ?? '—'}</Tag>
        <Text style={{ fontSize: 11 }}>{r.SourceSubinventoryCode ? `· ${r.SourceSubinventoryCode}` : ''}</Text></Tooltip> },
    { title: 'Dest Org', width: 150, ellipsis: true,
      render: (_, r) => <Tooltip title={r.DestinationOrganizationName}><Tag color="geekblue" style={{ fontSize: 11 }}>{r.DestinationOrganizationCode ?? '—'}</Tag>
        <Text style={{ fontSize: 11 }}>{r.DestinationSubinventoryCode ? `· ${r.DestinationSubinventoryCode}` : ''}</Text></Tooltip> },
    { title: 'UOM', dataIndex: 'QuantityUOMCode', width: 60, align: 'center', render: v => <Tag style={{ fontSize: 11 }}>{v ?? '—'}</Tag> },
    { title: 'Requested', dataIndex: 'RequestedQuantity', width: 90, align: 'right', render: fmtQty },
    { title: 'Shipped', dataIndex: 'ShippedQuantity', width: 80, align: 'right', render: v => <Text style={{ color: (v ?? 0) > 0 ? REDWOOD.success : undefined }}>{fmtQty(v)}</Text> },
    { title: 'Received', dataIndex: 'ReceivedQuantity', width: 80, align: 'right', render: v => <Text style={{ color: (v ?? 0) > 0 ? REDWOOD.success : undefined }}>{fmtQty(v)}</Text> },
    { title: 'Delivered', dataIndex: 'DeliveredQuantity', width: 80, align: 'right', render: fmtQty },
    { title: 'Unit Price', dataIndex: 'UnitPrice', width: 110, align: 'right', render: (v, r) => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmtPrice(v, r.CurrencyCode)}</Text> },
    { title: 'Total Transfer Price', dataIndex: 'TotalTransferPrice', width: 160, align: 'right',
      render: (v, r) => <Text strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: REDWOOD.primary }}>{fmtPrice(v, r.CurrencyCode)}</Text> },
    { title: 'Fulfillment', dataIndex: 'FulfillStatusMeaning', width: 150, render: v => statusTag(v) },
    { title: 'Line Status', dataIndex: 'TransferOrderLineStatus', width: 110, render: v => statusTag(v) },
    { title: 'Need By', dataIndex: 'NeedByDate', width: 115, render: fmtDate },
    { title: 'Ordered', dataIndex: '_orderedDate', width: 115, render: fmtDate },
  ];

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card styles={{ body: { padding: '14px 18px' } }} style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
        <Row gutter={[10, 10]} align="bottom">
          <Col xs={24} md={7}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Ordered Date (main GET on transfer orders)</div>
            <Space.Compact style={{ width: '100%' }}>
              <Select style={{ width: 72 }} value={dateOp} onChange={setDateOp} options={['>', '>=', '=', '<=', '<'].map(o => ({ value: o, label: o }))} />
              <DatePicker style={{ width: '100%' }} value={date} onChange={setDate} />
            </Space.Compact>
          </Col>
          <Col xs={24} md={17}>
            <Space wrap>
              <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={run}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>Fetch Orders &amp; Lines</Button>
              <Tooltip title="API Inspector"><Button icon={<ApiOutlined />} style={{ borderColor: REDWOOD.info, color: REDWOOD.info }} onClick={() => setApiOpen(true)}>API</Button></Tooltip>
              {loading && progress && <Text type="secondary" style={{ fontSize: 12 }}><Spin size="small" style={{ marginRight: 6 }} />{progress}</Text>}
            </Space>
          </Col>
        </Row>
        <Divider style={{ margin: '12px 0' }} />
        <Row gutter={[10, 10]}>
          <Col xs={12} md={4}><Input placeholder="Order #" allowClear prefix={<SearchOutlined style={{ color: REDWOOD.neutral300 }} />} value={fOrder} onChange={e => setFOrder(e.target.value)} /></Col>
          <Col xs={12} md={4}><Input placeholder="Item" allowClear value={fItem} onChange={e => setFItem(e.target.value)} /></Col>
          <Col xs={12} md={4}><Select allowClear showSearch placeholder="Source Org" style={{ width: '100%' }} value={fSrc} onChange={setFSrc} options={srcOrgOpts} /></Col>
          <Col xs={12} md={4}><Select allowClear showSearch placeholder="Dest Org" style={{ width: '100%' }} value={fDst} onChange={setFDst} options={dstOrgOpts} /></Col>
          <Col xs={12} md={4}><Select allowClear placeholder="Line Status" style={{ width: '100%' }} value={fStatus} onChange={setFStatus} options={statusOpts} /></Col>
          <Col xs={12} md={4}><Input placeholder="Filter any text…" allowClear value={fText} onChange={e => setFText(e.target.value)} /></Col>
        </Row>
      </Card>

      <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
        title={<Space><UnorderedListOutlined style={{ color: REDWOOD.primary }} /><Text strong>Transfer Order Lines</Text>
          {allLines.length > 0 && <Tag>{filtered.length} of {allLines.length} line{allLines.length !== 1 ? 's' : ''}</Tag>}
          {filtered.length > 0 && <Tag color="volcano">Σ {fmtPrice(totalPrice, ccy)}</Tag>}</Space>}
        extra={<Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={run}>Refresh</Button>}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 50 }}>
            <Spin size="large" /><Text type="secondary">{progress}</Text>
          </div>
        ) : error && allLines.length === 0 ? (
          <div style={{ padding: 24, color: REDWOOD.error, background: REDWOOD.error + '10', margin: 16, borderRadius: 6 }}><InfoCircleOutlined style={{ marginRight: 8 }} />{error}</div>
        ) : !searched ? (
          <Empty description="Fetch orders & lines" style={{ padding: 60 }} />
        ) : filtered.length === 0 ? (
          <Empty description="No lines match the filters" style={{ padding: 60 }} />
        ) : (
          <Table columns={columns} dataSource={filtered} rowKey={(r, i) => `${r.LineId ?? i}`} size="small"
            scroll={{ x: 1900 }} pagination={{ pageSize: 50, size: 'small', showSizeChanger: true }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                  <Table.Summary.Cell index={0} colSpan={13} align="right"><Text strong>Total Transfer Price</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right"><Text strong style={{ color: REDWOOD.primary }}>{fmtPrice(totalPrice, ccy)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} colSpan={3} />
                </Table.Summary.Row>
              </Table.Summary>
            )} />
        )}
      </Card>

      <Modal title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /> Search Lines API</Space>} open={apiOpen} onCancel={() => setApiOpen(false)} footer={null} width={860}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Step 1 — get transfer orders in the date range. Step 2 — for each order, follow its <Text code>transferOrderLines</Text> link.</Text>
          {[
            { lbl: '1. Transfer Orders (by date)', url: ordersUrl },
            { lbl: '2. Lines per order', url: `${FUSION_BASE}/transferOrders/{HeaderId}/child/transferOrderLines` },
          ].map(({ lbl, url }) => (
            <div key={lbl}>
              <Text style={{ fontSize: 11, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase' }}>{lbl}</Text>
              <div style={{ marginTop: 4, padding: '8px 12px', borderRadius: 6, background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.neutral200}`, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', color: REDWOOD.info }}>
                <Tag color="blue">GET</Tag>{url}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  EDIT TRANSFER ORDER TAB
// ═══════════════════════════════════════════════════════════════════════════
const EditOrderTab: React.FC<{ headerId: number; headerNumber: string; onClose: () => void }> = ({ headerId, headerNumber, onClose }) => {
  const [header, setHeader]   = useState<any>(null);
  const [lines, setLines]     = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [edits, setEdits]     = useState<Record<number, { RequestedQuantity?: number | null; NeedByDate?: string | null }>>({});
  const [saving, setSaving]   = useState(false);
  const [result, setResult]   = useState<string>('');

  const headerUrl = `${FUSION_BASE}/transferOrders/${headerId}`;
  const linesUrl  = `${FUSION_BASE}/transferOrders/${headerId}/child/transferOrderLines`;

  const load = useCallback(async () => {
    setLoading(true); setError(''); setEdits({}); setResult('');
    try {
      const [h, l] = await Promise.all([
        fetch(headerUrl, { headers: FUSION_HDRS }).then(r => r.ok ? r.json() : Promise.reject(new Error(`Header HTTP ${r.status}`))),
        fetchAllPages(linesUrl),
      ]);
      setHeader(h); setLines(l);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [headerUrl, linesUrl]);
  useEffect(() => { load(); }, [load]);

  const isEditable = (l: any) => !['CLOSED', 'CANCELED', 'CANCELLED'].includes(String(l.StatusLookup ?? '').toUpperCase());
  const setEdit = (lineId: number, patch: any) => setEdits(p => ({ ...p, [lineId]: { ...p[lineId], ...patch } }));
  const dirtyLines = Object.entries(edits).filter(([id, e]) => {
    const orig = lines.find(l => l.LineId === Number(id));
    if (!orig) return false;
    const qChanged = e.RequestedQuantity != null && Number(e.RequestedQuantity) !== Number(orig.RequestedQuantity);
    const dChanged = e.NeedByDate != null && dayjs(e.NeedByDate).format('YYYY-MM-DD') !== dayjs(orig.NeedByDate).format('YYYY-MM-DD');
    return qChanged || dChanged;
  });

  const buildLinePayload = (lineId: number) => {
    const e = edits[lineId]; const orig = lines.find(l => l.LineId === lineId); const body: any = {};
    if (e?.RequestedQuantity != null && Number(e.RequestedQuantity) !== Number(orig.RequestedQuantity)) body.RequestedQuantity = Number(e.RequestedQuantity);
    if (e?.NeedByDate != null && dayjs(e.NeedByDate).format('YYYY-MM-DD') !== dayjs(orig.NeedByDate).format('YYYY-MM-DD')) body.NeedByDate = dayjs(e.NeedByDate).format('YYYY-MM-DD');
    return body;
  };

  const save = async () => {
    if (dirtyLines.length === 0) { message.info('No changes to save'); return; }
    setSaving(true); setResult('');
    const log: string[] = [];
    for (const [id] of dirtyLines) {
      const lineId = Number(id);
      const body = buildLinePayload(lineId);
      try {
        const r = await fetch(`${linesUrl}/${lineId}`, {
          method: 'PATCH',
          headers: { ...FUSION_HDRS, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const raw = await r.text();
        log.push(`Line ${lineId}: HTTP ${r.status} ${r.ok ? 'OK' : ''} — ${JSON.stringify(body)}${r.ok ? '' : '\n' + raw.slice(0, 400)}`);
      } catch (e: any) { log.push(`Line ${lineId}: ${e.message}`); }
    }
    setResult(log.join('\n\n'));
    setSaving(false);
    message.success('Save complete — see results');
    load();
  };

  const cols: ColumnsType<any> = [
    { title: 'Line', dataIndex: 'DisplayLineNumber', width: 55, align: 'center', render: (v, r) => <Tag color="blue">{v ?? r.LineNumber}</Tag> },
    { title: 'Item', dataIndex: 'ItemNumber', width: 120, render: v => <Text strong style={{ color: REDWOOD.info, fontSize: 12 }}>{v}</Text> },
    { title: 'Description', dataIndex: 'ItemDescription', width: 200, ellipsis: true },
    { title: 'Source → Dest', width: 150, render: (_, r) => <span><Tag color="blue" style={{ fontSize: 11 }}>{r.SourceOrganizationCode}</Tag><SwapOutlined style={{ margin: '0 2px', color: REDWOOD.neutral600 }} /><Tag color="geekblue" style={{ fontSize: 11 }}>{r.DestinationOrganizationCode}</Tag></span> },
    { title: 'UOM', dataIndex: 'QuantityUOMCode', width: 60, align: 'center', render: v => <Tag style={{ fontSize: 11 }}>{v}</Tag> },
    { title: 'Requested Qty', width: 130, align: 'right',
      render: (_, r) => isEditable(r)
        ? <InputNumber min={0} size="small" style={{ width: '100%' }} defaultValue={r.RequestedQuantity}
            onChange={v => setEdit(r.LineId, { RequestedQuantity: v })} />
        : <Text>{fmtQty(r.RequestedQuantity)}</Text> },
    { title: 'Shipped', dataIndex: 'ShippedQuantity', width: 80, align: 'right', render: fmtQty },
    { title: 'Received', dataIndex: 'ReceivedQuantity', width: 80, align: 'right', render: fmtQty },
    { title: 'Need By', width: 150,
      render: (_, r) => isEditable(r)
        ? <DatePicker size="small" style={{ width: '100%' }} defaultValue={r.NeedByDate ? dayjs(r.NeedByDate) : null}
            onChange={d => setEdit(r.LineId, { NeedByDate: d ? d.toISOString() : null })} />
        : <Text>{fmtDate(r.NeedByDate)}</Text> },
    { title: 'Unit Price', dataIndex: 'UnitPrice', width: 110, align: 'right', render: (v, r) => fmtPrice(v, r.CurrencyCode) },
    { title: 'Total Transfer Price', dataIndex: 'TotalTransferPrice', width: 150, align: 'right', render: (v, r) => <Text strong style={{ color: REDWOOD.primary }}>{fmtPrice(v, r.CurrencyCode)}</Text> },
    { title: 'Status', dataIndex: 'TransferOrderLineStatus', width: 110, render: v => statusTag(v) },
  ];

  const HInfo: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <Col xs={12} sm={8} md={6}>
      <div style={{ fontSize: 10, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 13, marginTop: 2 }}>{value ?? '—'}</div>
    </Col>
  );

  const grandTotal = lines.reduce((s, l) => s + (Number(l.TotalTransferPrice) || 0), 0);
  const ccy = lines.find(l => l.CurrencyCode)?.CurrencyCode ?? '';

  return (
    <div style={{ background: REDWOOD.neutral100, minHeight: '100%' }}>
      <div style={{ background: REDWOOD.surface, padding: '10px 20px', borderBottom: `1px solid ${REDWOOD.neutral200}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <SwapOutlined style={{ color: REDWOOD.primary }} />
        <Text strong style={{ fontSize: 15 }}>Transfer Order {headerNumber}</Text>
        {header && statusTag(header.Status)}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={load}>Refresh</Button>
          <Button type="primary" icon={<CloudUploadOutlined />} loading={saving} onClick={save}
            disabled={dirtyLines.length === 0} style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}>
            Save Changes{dirtyLines.length > 0 ? ` (${dirtyLines.length})` : ''}
          </Button>
          <Button onClick={onClose}>Close Tab</Button>
        </div>
      </div>

      {loading && !header ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" tip="Loading order…" /></div>
      ) : error ? (
        <div style={{ padding: 24, color: REDWOOD.error, background: REDWOOD.error + '10', margin: 16, borderRadius: 6 }}><InfoCircleOutlined style={{ marginRight: 8 }} />{error}</div>
      ) : (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {header && (
            <Card size="small" title={<Text strong>Order Details</Text>} style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
              <Row gutter={[12, 12]}>
                <HInfo label="Order Number" value={<Text strong>{header.HeaderNumber}</Text>} />
                <HInfo label="Business Unit" value={header.BusinessUnitName} />
                <HInfo label="Source" value={header.SourceOfTransferOrder} />
                <HInfo label="Status" value={statusTag(header.Status)} />
                <HInfo label="Interface Status" value={statusTag(header.InterfaceStatus)} />
                <HInfo label="Ordered Date" value={fmtDate(header.OrderedDate)} />
                <HInfo label="Total Transfer Price" value={<Text strong style={{ color: REDWOOD.primary }}>{fmtPrice(header.TotalTransferPrice ?? grandTotal, ccy)}</Text>} />
                <HInfo label="Created By" value={header.CreatedBy} />
              </Row>
            </Card>
          )}

          <Card size="small" styles={{ body: { padding: 0 } }} style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
            title={<Space><UnorderedListOutlined style={{ color: REDWOOD.primary }} /><Text strong>Lines</Text><Tag>{lines.length}</Tag>
              <Tag color="volcano">Σ {fmtPrice(grandTotal, ccy)}</Tag></Space>}>
            <Table columns={cols} dataSource={lines} rowKey={(r, i) => `${r.LineId ?? i}`} size="small" pagination={false} scroll={{ x: 1400 }} />
          </Card>

          <Text type="secondary" style={{ fontSize: 11 }}>
            <InfoCircleOutlined style={{ marginRight: 6 }} />
            Editable fields (Requested Qty, Need-By) PATCH to <Text code>{linesUrl}/{'{LineId}'}</Text>. Closed/canceled lines are read-only.
          </Text>

          {result && (
            <div>
              <Text style={{ fontSize: 11, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase' }}>Save Results</Text>
              <div style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 6, fontFamily: 'monospace', fontSize: 11, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap', marginTop: 4 }}>{result}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  PAGE
// ═══════════════════════════════════════════════════════════════════════════
interface EditTab { id: string; headerId: number; headerNumber: string }

const TransferOrders: React.FC = () => {
  const { orgs, loading: orgsLoading, load: reloadOrgs, url: orgsUrl } = useOrgs();
  const [tab, setTab] = useState('search');
  const [editTabs, setEditTabs] = useState<EditTab[]>([]);

  const openEdit = (headerId: number, headerNumber: string) => {
    const id = `edit-${headerId}`;
    setEditTabs(prev => prev.find(t => t.id === id) ? prev : [...prev, { id, headerId, headerNumber }]);
    setTab(id);
  };
  const closeEdit = (id: string) => {
    setEditTabs(prev => prev.filter(t => t.id !== id));
    setTab('lines');
  };

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        <div style={{ padding: '12px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/procurement">Procurement</Link> },
            { title: 'Transfer Orders' },
          ]} />
          <Title level={4} style={{ margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <SwapOutlined style={{ color: REDWOOD.primary }} /> Transfer Orders
            <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>— move stock between inventory organizations</Text>
          </Title>
        </div>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          type="editable-card"
          hideAdd
          onEdit={(key, action) => { if (action === 'remove') closeEdit(String(key)); }}
          style={{ background: REDWOOD.surface }}
          tabBarStyle={{ margin: 0, paddingLeft: 16, borderBottom: `2px solid ${REDWOOD.neutral200}` }}
          items={[
            {
              key: 'search',
              label: <span><SearchOutlined style={{ marginRight: 6 }} />Search Orders</span>,
              closable: false,
              children: <SearchTab orgsLoading={orgsLoading} orgsUrl={orgsUrl} reloadOrgs={reloadOrgs} onEdit={openEdit} />,
            },
            {
              key: 'lines',
              label: <span><UnorderedListOutlined style={{ marginRight: 6 }} />Search Lines</span>,
              closable: false,
              children: <SearchLinesTab onEdit={openEdit} />,
            },
            {
              key: 'new',
              label: <span><PlusOutlined style={{ marginRight: 6 }} />New Transfer Order</span>,
              closable: false,
              children: <NewOrderTab orgs={orgs} orgsLoading={orgsLoading} />,
            },
            ...editTabs.map(t => ({
              key: t.id,
              label: <span><EditOutlined style={{ marginRight: 6, color: REDWOOD.primary }} />Edit {t.headerNumber}</span>,
              closable: true,
              children: <EditOrderTab headerId={t.headerId} headerNumber={t.headerNumber} onClose={() => closeEdit(t.id)} />,
            })),
          ]}
        />
      </Content>
    </Layout>
  );
};

export default TransferOrders;
