import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Layout, Breadcrumb, Card, Table, Form, Input, Select, DatePicker, Button,
  Tabs, Tag, Typography, Space, Tooltip, Spin, Row, Col, message, Modal,
  InputNumber, Empty,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, SwapOutlined, SearchOutlined, ReloadOutlined, PlusOutlined,
  DeleteOutlined, ApiOutlined, CopyOutlined, ClearOutlined, EyeOutlined,
  CheckCircleOutlined, EnvironmentOutlined, InfoCircleOutlined, CloudUploadOutlined,
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
const SearchTab: React.FC<{ orgsLoading: boolean; orgsUrl: string; reloadOrgs: () => void }> =
  ({ orgsLoading, orgsUrl, reloadOrgs }) => {
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
      render: v => <Text strong style={{ color: REDWOOD.info, fontSize: 13 }}>{v ?? '—'}</Text> },
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
//  PAGE
// ═══════════════════════════════════════════════════════════════════════════
const TransferOrders: React.FC = () => {
  const { orgs, loading: orgsLoading, load: reloadOrgs, url: orgsUrl } = useOrgs();
  const [tab, setTab] = useState('search');

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
          style={{ background: REDWOOD.surface }}
          tabBarStyle={{ margin: 0, paddingLeft: 16, borderBottom: `2px solid ${REDWOOD.neutral200}` }}
          items={[
            {
              key: 'search',
              label: <span><SearchOutlined style={{ marginRight: 6 }} />Search Orders</span>,
              children: <SearchTab orgsLoading={orgsLoading} orgsUrl={orgsUrl} reloadOrgs={reloadOrgs} />,
            },
            {
              key: 'new',
              label: <span><PlusOutlined style={{ marginRight: 6 }} />New Transfer Order</span>,
              children: <NewOrderTab orgs={orgs} orgsLoading={orgsLoading} />,
            },
          ]}
        />
      </Content>
    </Layout>
  );
};

export default TransferOrders;
