import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Layout, Breadcrumb, Card, Table, Form, Input, Select, DatePicker, Button,
  Tag, Typography, Space, Tooltip, Spin, Row, Col, message, Modal, Empty, Tabs, InputNumber, Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, ProfileOutlined, SearchOutlined, ReloadOutlined, ClearOutlined,
  ApiOutlined, CopyOutlined, InfoCircleOutlined, ExportOutlined, BankOutlined,
  UnorderedListOutlined, ShoppingOutlined, DollarOutlined, PrinterOutlined, DownloadOutlined,
  ReconciliationOutlined, PlusOutlined, SaveOutlined, DeleteOutlined, CloudUploadOutlined,
  DatabaseOutlined, CheckCircleTwoTone, CloseCircleTwoTone, RiseOutlined, TagsOutlined,
  CheckCircleOutlined, EyeOutlined, EditOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const { Content } = Layout;
const { Title, Text } = Typography;

const _isElectron = !!(window as unknown as { electron?: unknown; electronAPI?: unknown }).electron
  || !!(window as unknown as { electronAPI?: unknown }).electronAPI;
const FUSION_BASE = _isElectron
  ? 'https://iacney-test.fa.ocs.oraclecloud.com/fscmRestApi/resources/11.13.18.05'
  : '/fusion-api';
const AUTH_HEADER = 'Basic ' + btoa('emparun:Fusion@1234');
const FUSION_HDRS = { Authorization: AUTH_HEADER, Accept: 'application/json' };
const PAGE_LIMIT = 500;

const REDWOOD = {
  primary: '#C74634', success: '#1D7B4D', warning: '#B07700', info: '#0572CE',
  error: '#D93025', teal: '#00918A', purple: '#7245A6',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d?: string) => { if (!d) return '—'; try { return dayjs(d).format('D-MMM-YYYY'); } catch { return d; } };
const fmtDateTime = (d?: string) => { if (!d) return '—'; try { return dayjs(d).format('D-MMM-YYYY HH:mm'); } catch { return d; } };
const fmtQty = (v?: number | null) => (v == null ? '—' : new Intl.NumberFormat('en-US').format(v));
const num = (v: any) => { const n = Number(v); return isNaN(n) ? 0 : n; };
const fmt = (v: any) => (v == null || v === '' ? '—' : String(v));
const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const pf = (r: any, keys: string[]) => { for (const k of keys) { const v = r?.[k]; if (v != null && v !== '') return v; } return undefined; };

// Which line-level child collections to surface as tabs (rest hidden), in order.
// `customer:true` merges billTo/shipTo into one tab; lineDetails shows as "Billing".
const LINE_TAB_DEFS: { key: string; label: string; match?: string[]; customer?: boolean }[] = [
  { key: 'additionalInformation', label: 'Additional Information', match: ['additionalinformation', 'additionalinfo'] },
  { key: 'attachments', label: 'Attachments', match: ['attachments', 'attachment'] },
  { key: 'customers', label: 'Customers', customer: true },
  { key: 'charges', label: 'Charges', match: ['charges', 'charge'] },
  { key: 'holds', label: 'Holds', match: ['holds', 'hold'] },
  { key: 'billing', label: 'Billing', match: ['linedetails', 'linedetail'] },
  { key: 'lotSerials', label: 'Lot Serials', match: ['lotserials', 'lotserial'] },
  { key: 'notes', label: 'Notes', match: ['notes', 'note'] },
];
const CUST_BILL_MATCH = ['billtocustomer', 'billto'];
const CUST_SHIP_MATCH = ['shiptocustomer', 'shipto'];

const mapLimit = async <T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> => {
  const out: R[] = new Array(items.length); let idx = 0;
  const worker = async () => { while (idx < items.length) { const c = idx++; out[c] = await fn(items[c]); } };
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, worker));
  return out;
};

const fetchAllPages = async (baseUrl: string): Promise<any[]> => {
  const stripped = baseUrl.replace(/[?&]limit=\d+/gi, '').replace(/[?&]offset=\d+/gi, '').replace(/\?&/, '?').replace(/&&/g, '&');
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const sep = stripped.includes('?') ? '&' : '?';
    const url = `${stripped}${sep}limit=${PAGE_LIMIT}&offset=${offset}`;
    const r = await fetch(url, { headers: FUSION_HDRS });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
    const d = await r.json();
    const items: any[] = Array.isArray(d) ? d : (d.items ?? []);
    all.push(...items);
    if (!d.hasMore || items.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }
  return all;
};

// Hide id/href columns and (for detail views) null/empty ones.
const isIdKey = (k: string) => /Id$/.test(k) || /Id[0-9]+$/.test(k) || k === 'links';
const isEmpty = (v: any) => v == null || v === '' || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v ?? {}).length === 0);
const humanize = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^ /, '').replace(/\bU O M\b/, 'UOM').replace(/\bP O\b/, 'PO');

const renderVal = (k: string, v: any): React.ReactNode => {
  if (isEmpty(v)) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  if (/Date$/.test(k) || k.endsWith('DateTime') || k === 'TransactionOn' || k === 'PricedOn') return fmtDateTime(String(v));
  return String(v);
};

// Build dynamic columns from rows: drop id/href columns and any column empty
// across every row. `exclude` skips keys already rendered elsewhere.
const dynamicColumns = (items: any[], exclude: string[] = []): ColumnsType<any> => {
  const ex = new Set(exclude);
  const keys: string[] = []; const seen = new Set<string>();
  items.forEach(it => Object.keys(it ?? {}).forEach(k => {
    if (seen.has(k) || isIdKey(k) || ex.has(k)) return;
    if (items.some(row => !isEmpty(row?.[k]))) { seen.add(k); keys.push(k); }
  }));
  return keys.map(k => ({
    title: humanize(k), dataIndex: k, width: 170, ellipsis: true,
    render: (v: any) => <Text style={{ fontSize: 12 }}>{renderVal(k, v)}</Text>,
  }));
};

// ── Line EFF (extensible flexfield) discovery ────────────────────────────────
// The DOO line EFF is exposed on the additionalInformation child via a nested
// FulfillLineEffB<Context>privateVO array keyed by ContextCode, one field per
// segment API name. Config is instance-specific, so discover it from the
// describe metadata and map "lot"/"cost" to segments by name. Returns null when
// nothing suitable is configured (then no EFF is sent — a safe no-op).
interface EffMeta { category: string; voName: string; contextCode: string; lotSeg?: string; costSeg?: string; segs: { name: string; label: string }[] }
const parseEffDescribe = (d: any): EffMeta | null => {
  try {
    let found: { voName: string; node: any } | null = null;
    const visit = (o: any) => {
      if (!o || typeof o !== 'object' || found) return;
      for (const k of Object.keys(o)) {
        if (/EffB.+privateVO$/i.test(k)) { found = { voName: k, node: (o as any)[k] }; return; }
        visit((o as any)[k]);
      }
    };
    visit(d);
    if (!found) return null;
    const node: any = found.node;
    const attrObjs: any[] = node?.attributes ?? node?.Attributes ?? (Array.isArray(node) ? node : []);
    const segs: { name: string; label: string }[] = [];
    for (const a of attrObjs) {
      const name = a?.name ?? a?.Name;
      const label = a?.title ?? a?.label ?? a?.Title ?? name;
      if (name && !/^(ContextCode|EffLineId|.*Id)$/i.test(String(name))) segs.push({ name: String(name), label: String(label) });
    }
    const ctxMatch = found.voName.match(/EffB(.+)privateVO$/i);
    const contextCode = node?.contextCode ?? node?.ContextCode ?? (ctxMatch ? ctxMatch[1].replace(/_+/g, ' ').trim() : '');
    const lotSeg = segs.find(s => /lot/i.test(s.name) || /lot/i.test(s.label))?.name;
    const costSeg = segs.find(s => /cost/i.test(s.name) || /cost/i.test(s.label))?.name;
    if (!lotSeg && !costSeg) return null;
    return { category: 'DOO_FULFILL_LINES_ADD_INFO', voName: found.voName, contextCode, lotSeg, costSeg, segs };
  } catch { return null; }
};

const statusTag = (s?: string, code?: string) => {
  if (!s && !code) return <Tag>—</Tag>;
  const up = String(code || s).toUpperCase();
  const color = up.includes('CANCEL') ? 'red' : up.includes('CLOSE') ? 'default'
    : up.includes('DRAFT') ? 'gold' : up.includes('SHIP') || up.includes('FULFILL') || up.includes('COMPLETE') ? 'green'
    : up.includes('PROGRESS') || up.includes('AWAIT') ? 'blue' : 'geekblue';
  return <Tag color={color} style={{ fontSize: 11 }}>{s ?? code}</Tag>;
};

// ── All-fields modal (hide null & id columns) ────────────────────────────────
const AllFieldsModal: React.FC<{ title: string; row: any | null; onClose: () => void }> = ({ title, row, onClose }) => (
  <Modal title={<Space><ProfileOutlined style={{ color: REDWOOD.info }} /> {title}</Space>}
    open={!!row} onCancel={onClose} maskClosable={false} width={920}
    footer={<Button onClick={onClose}>Close</Button>}>
    {row && (() => {
      const entries = Object.entries(row).filter(([k, v]) => !isIdKey(k) && !isEmpty(v));
      return (
        <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          <Row gutter={[12, 0]}>
            {entries.map(([k, v]) => (
              <Col key={k} xs={24} sm={12} md={8}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{humanize(k)}</div>
                  <div style={{ fontSize: 12, color: REDWOOD.neutral900, marginTop: 2, wordBreak: 'break-word' }}>{renderVal(k, v)}</div>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      );
    })()}
  </Modal>
);

const fmtAmount = (v?: number | null, ccy?: string) => {
  if (v == null) return '—';
  const s = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
  return ccy ? `${s} ${ccy}` : s;
};

const totalsHref = (order: any) => order?.links?.find((l: any) => l.name === 'totals')?.href
  ?? (order?.HeaderId ? `${FUSION_BASE}/salesOrdersForOrderHub/${order.HeaderId}/child/totals` : '');

// Classify a total line so the summary can order & label it like an order.
const totalRank = (t: any) => {
  const c = String(t.TotalCode ?? t.TotalName ?? '').toUpperCase();
  if (/SUB.?TOTAL|LINE|ITEM/.test(c)) return 0;
  if (/DISC/.test(c)) return 1;
  if (/SHIP|FREIGHT|HANDLING/.test(c)) return 2;
  if (/TAX/.test(c)) return 3;
  if (/CHARGE|MISC/.test(c)) return 4;
  return 5;
};
const isGrandTotal = (t: any) => t.PrimaryFlag
  || (/ORDER|GRAND|NET/.test(String(t.TotalCode ?? '').toUpperCase()) && !/TAX|SHIP|DISC|SUB|LINE|CHARGE|MARGIN/.test(String(t.TotalCode ?? '').toUpperCase()));

// Invoice-style order total summary (right-aligned rows + emphasized total).
const TotalsSummary: React.FC<{ items: any[]; currency?: string }> = ({ items, currency }) => {
  if (!items.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No totals" style={{ padding: 20 }} />;
  const ccy = items.find(i => i.CurrencyCode)?.CurrencyCode ?? currency;
  const grand = items.find(isGrandTotal);
  const rows = items.filter(i => i !== grand).sort((a, b) => totalRank(a) - totalRank(b));
  return (
    <div style={{ maxWidth: 400, marginLeft: 'auto' }}>
      {rows.map((t, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: `1px dashed ${REDWOOD.neutral200}` }}>
          <span style={{ color: REDWOOD.neutral600, fontSize: 12.5 }}>
            {t.TotalName ?? t.TotalCode}
            {t.EstimatedFlag && <Tag color="gold" style={{ fontSize: 9, marginLeft: 6, lineHeight: '15px' }}>est</Tag>}
          </span>
          <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: REDWOOD.neutral900 }}>{fmtAmount(t.TotalAmount, t.CurrencyCode ?? ccy)}</span>
        </div>
      ))}
      {grand && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '11px 0 2px', marginTop: 4, borderTop: `2px solid ${REDWOOD.neutral300}` }}>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: REDWOOD.neutral900 }}>{grand.TotalName ?? 'Order Total'}</span>
          <span style={{ fontWeight: 800, fontSize: 18, color: REDWOOD.success, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(grand.TotalAmount, grand.CurrencyCode ?? ccy)}</span>
        </div>
      )}
      {ccy && <div style={{ textAlign: 'right', marginTop: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>Amounts in {ccy}</Text></div>}
    </div>
  );
};

// Fetches totals for an order (used by the inline section and the modal).
const useTotals = (order: any | null, active: boolean) => {
  const href = totalsHref(order);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!href) return;
    setLoading(true); setError('');
    try { setItems(await fetchAllPages(href)); }
    catch (e: any) { setError(e.message); setItems([]); }
    finally { setLoading(false); }
  }, [href]);
  useEffect(() => { if (active && order) load(); }, [active, order, load]);
  return { href, items, loading, error, load };
};

// ── Order totals drill (…/child/totals) — modal for the search grid ──────────
const TotalsModal: React.FC<{ order: any | null; onClose: () => void }> = ({ order, onClose }) => {
  const { href, items, loading, error, load } = useTotals(order, !!order);
  return (
    <Modal open={!!order} onCancel={onClose} maskClosable={false} width={560}
      title={<Space><DollarOutlined style={{ color: REDWOOD.success }} /> Order Total
        <Tag color="volcano">{order?.OrderNumber}</Tag></Space>}
      footer={<Space>
        <Tooltip title={<span style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}><b>GET</b> {href}</span>}>
          <Button size="small" type="text" icon={<ApiOutlined />} style={{ color: REDWOOD.info, marginRight: 'auto' }} />
        </Tooltip>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={load}>Reload</Button>
        <Button onClick={onClose}>Close</Button>
      </Space>}>
      {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        : error ? <div style={{ color: REDWOOD.error, fontSize: 12 }}><InfoCircleOutlined style={{ marginRight: 6 }} />{error}</div>
        : <TotalsSummary items={items} currency={order?.TransactionalCurrencyCode ?? order?.AppliedCurrencyCode} />}
    </Modal>
  );
};

// Aggregate one line-level child collection (e.g. lotSerials) across every
// order line. The child rows carry no item context, so we prepend the line's
// Line #, Product, Description and UOM from the parent line.
const MergedLineChildTab: React.FC<{ lines: any[]; name: string; overrides?: { match: string[]; render: (v: any, row: any) => React.ReactNode }[] }> = ({ lines, name, overrides }) => {
  const [items, setItems] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const targets = useMemo(() =>
    lines.map(l => ({ line: l, href: l.links?.find((x: any) => x.name === name)?.href }))
      .filter(t => t.href) as { line: any; href: string }[],
  [lines, name]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const results = await mapLimit(targets, 6, async (t) => {
        try {
          const rows = await fetchAllPages(t.href);
          return rows.map(r => ({ ...r,
            _line: t.line.DisplayLineNumber ?? t.line.LineNumber,
            _item: t.line.ProductNumber, _desc: t.line.ProductDescription, _uom: t.line.OrderedUOM }));
        } catch { return []; }
      });
      setItems(results.flat());
    } catch (e: any) { setError(e.message); setItems([]); }
    finally { setLoading(false); }
  }, [targets]);
  useEffect(() => { load(); }, [load]);

  const cols = useMemo<ColumnsType<any>>(() => ([
    { title: 'Line', dataIndex: '_line', width: 60, align: 'center', fixed: 'left', render: v => <Tag color="blue" style={{ fontSize: 11 }}>{v ?? '—'}</Tag> },
    { title: 'Product', dataIndex: '_item', width: 130, fixed: 'left', render: v => <Text strong style={{ fontSize: 12, color: REDWOOD.info }}>{v ?? '—'}</Text> },
    { title: 'Description', dataIndex: '_desc', width: 240, ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    ...dynamicColumns((items ?? []).map(({ _line, _item, _desc, _uom, ...rest }) => rest)).map((col: any) => {
      const ov = overrides?.find(o => o.match.includes(norm(String(col.dataIndex ?? ''))));
      return ov ? { ...col, render: (v: any, row: any) => ov.render(v, row) } : col;
    }),
  ]), [items, overrides]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <Text type="secondary" style={{ marginRight: 'auto', fontSize: 11 }}>Merged from {targets.length} line{targets.length !== 1 ? 's' : ''}</Text>
        <Tooltip title={<span style={{ fontFamily: 'monospace', fontSize: 11 }}><b>GET</b> …/lines/&#123;line&#125;/child/{name}</span>}>
          <Button size="small" type="text" icon={<ApiOutlined />} style={{ color: REDWOOD.info }} />
        </Tooltip>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={load}>Reload</Button>
      </div>
      {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        : error ? <div style={{ color: REDWOOD.error, fontSize: 12 }}><InfoCircleOutlined style={{ marginRight: 6 }} />{error}</div>
        : items && items.length > 0
          ? <Table size="small" columns={cols} dataSource={items} rowKey={(_, i) => `${name}-${i}`}
              pagination={items.length > 25 ? { pageSize: 25, size: 'small' } : false} scroll={{ x: 'max-content', y: 380 }} />
          : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No ${name} across the order lines`} style={{ padding: 24 }} />}
    </div>
  );
};

// Merged Bill-To + Ship-To customer tab (two sections).
const CustomerTab: React.FC<{ lines: any[]; billName?: string; shipName?: string }> = ({ lines, billName, shipName }) => {
  const Section: React.FC<{ title: string; name: string }> = ({ title, name }) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <ProfileOutlined style={{ color: REDWOOD.primary }} />
        <Text strong style={{ fontSize: 13 }}>{title}</Text>
      </div>
      <MergedLineChildTab lines={lines} name={name} />
    </div>
  );
  if (!billName && !shipName) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No customer details" style={{ padding: 24 }} />;
  return (
    <div>
      {billName && <Section title="Bill-To Customer" name={billName} />}
      {shipName && <Section title="Ship-To Customer" name={shipName} />}
    </div>
  );
};

// Actual costing tab: per-line price + an order-level margin summary.
const ActualCostingTab: React.FC<{ lines: any[]; currency?: string }> = ({ lines, currency }) => {
  const totalPrice = (l: any) => (l.ExtendedAmount != null ? num(l.ExtendedAmount) : num(l.OrderedQuantity) * num(l.UnitSellingPrice));
  const totExt = lines.reduce((s, l) => s + totalPrice(l), 0);
  const totCost = lines.reduce((s, l) => s + num(l.EstimateFulfillmentCost), 0);
  const totMargin = lines.reduce((s, l) => s + (l.EstimateMargin != null ? num(l.EstimateMargin) : 0), 0);
  const marginPct = totExt ? (totMargin / totExt) * 100 : null;
  const marginColor = totMargin < 0 ? REDWOOD.error : REDWOOD.success;

  const marginOf = (v?: any) => (v == null ? '—' : <Text strong style={{ color: num(v) < 0 ? REDWOOD.error : REDWOOD.success, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(v, currency)}</Text>);

  const cols: ColumnsType<any> = [
    { title: 'Line', dataIndex: 'DisplayLineNumber', width: 60, align: 'center', render: (v, r) => <Tag color="blue" style={{ fontSize: 11 }}>{v ?? r.LineNumber ?? '—'}</Tag> },
    { title: 'Item', dataIndex: 'ProductNumber', width: 130, render: v => <Text strong style={{ color: REDWOOD.info, fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Description', dataIndex: 'ProductDescription', width: 240, ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Qty', dataIndex: 'OrderedQuantity', width: 80, align: 'right', render: (v, r) => `${fmtQty(v)}${r.OrderedUOM ? ' ' + r.OrderedUOM : ''}` },
    { title: 'Unit Price', dataIndex: 'UnitSellingPrice', width: 100, align: 'right', render: v => (v == null ? '—' : fmtAmount(v, currency)) },
    { title: 'Total Price', key: 'tot', width: 120, align: 'right', render: (_, r) => <Text strong style={{ color: REDWOOD.primary, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(totalPrice(r), currency)}</Text> },
    { title: 'Est Fulfillment Cost', dataIndex: 'EstimateFulfillmentCost', width: 130, align: 'right', render: v => (v == null ? '—' : fmtAmount(v, currency)) },
    { title: 'Est Margin', dataIndex: 'EstimateMargin', width: 120, align: 'right', render: marginOf },
  ];

  const MRow: React.FC<{ label: string; value: React.ReactNode; strong?: boolean; color?: string }> = ({ label, value, strong, color }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '7px 0', borderBottom: `1px dashed ${REDWOOD.neutral200}` }}>
      <span style={{ color: REDWOOD.neutral600, fontSize: 12.5, fontWeight: strong ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize: strong ? 16 : 13, fontWeight: strong ? 800 : 500, color: color ?? REDWOOD.neutral900, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );

  return (
    <div>
      <Table size="small" columns={cols} dataSource={lines} rowKey={(r, i) => `${r.LineId ?? r.FulfillLineId ?? i}`}
        pagination={lines.length > 25 ? { pageSize: 25, size: 'small' } : false} scroll={{ x: 980, y: 320 }}
        summary={(data) => (
          <Table.Summary fixed>
            <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
              <Table.Summary.Cell index={0} colSpan={3}><Text strong>Total ({data.length})</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={3} />
              <Table.Summary.Cell index={4} />
              <Table.Summary.Cell index={5} align="right"><Text strong style={{ color: REDWOOD.primary }}>{fmtAmount(totExt, currency)}</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={6} align="right"><Text strong>{fmtAmount(totCost, currency)}</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={7} align="right"><Text strong style={{ color: marginColor }}>{fmtAmount(totMargin, currency)}</Text></Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )} />

      {/* Order margin */}
      <div style={{ maxWidth: 420, marginLeft: 'auto', marginTop: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Order Margin</div>
        <MRow label="Extended Amount (revenue)" value={fmtAmount(totExt, currency)} />
        <MRow label="Estimate Fulfillment Cost" value={fmtAmount(totCost, currency)} />
        <MRow label="Estimate Margin" strong color={marginColor}
          value={<span>{fmtAmount(totMargin, currency)}{marginPct != null && <Text style={{ fontSize: 12, marginLeft: 8, color: marginColor }}>({marginPct.toFixed(1)}%)</Text>}</span>} />
      </div>
    </div>
  );
};

// ── AR invoice drill (receivablesInvoices) by billing transaction number ─────
const AR_RES = 'receivablesInvoices';
const AR_LINES = 'receivablesInvoiceLines';

// Small labelled field (label right-aligned, value bold) — mirrors the AR form.
const ARField: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', gap: 10, marginBottom: 7, fontSize: 12.5, alignItems: 'baseline' }}>
    <span style={{ color: REDWOOD.neutral600, minWidth: 118, textAlign: 'right', flexShrink: 0 }}>{label}</span>
    <span style={{ color: REDWOOD.neutral900, fontWeight: 600, wordBreak: 'break-word' }}>{value ?? '—'}</span>
  </div>
);
const ARSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ fontSize: 13.5, fontWeight: 700, color: REDWOOD.primary, borderBottom: `2px solid ${REDWOOD.primary}22`, paddingBottom: 5, marginBottom: 12 }}>{title}</div>
    {children}
  </div>
);

const ARInvoiceDialog: React.FC<{ txn: string | null; onClose: () => void }> = ({ txn, onClose }) => {
  const [inv, setInv] = useState<any | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [allOpen, setAllOpen] = useState(false);
  const [dists, setDists] = useState<any[]>([]);
  const [acctOpen, setAcctOpen] = useState(false);

  const url = txn ? `${FUSION_BASE}/${AR_RES}?q=${encodeURIComponent(`TransactionNumber=${txn}`)}&limit=1` : '';
  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true); setError(''); setInv(null); setLines([]); setDists([]);
    try {
      const r = await fetch(url, { headers: FUSION_HDRS });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      const d = await r.json();
      const h = (d.items ?? [])[0];
      if (!h) { setError(`No AR invoice found for transaction ${txn}`); return; }
      setInv(h);
      const lh = h.links?.find((l: any) => l.name === AR_LINES)?.href
        ?? (h.CustomerTransactionId ? `${FUSION_BASE}/${AR_RES}/${h.CustomerTransactionId}/child/${AR_LINES}` : '');
      let ld: any[] = [];
      if (lh) { try { ld = await fetchAllPages(lh); setLines(ld); } catch { /* lines optional */ } }

      // Accounting distributions — the source of tax / freight / charges amounts.
      const isAcct = (n: string) => /account|distribut|journal/i.test(n ?? '');
      const hAcct = (h.links ?? []).find((l: any) => l.rel === 'child' && isAcct(l.name));
      let dl: any[] = [];
      try {
        if (hAcct?.href) {
          dl = await fetchAllPages(hAcct.href);
        } else {
          const lname = (ld[0]?.links ?? []).find((l: any) => l.rel === 'child' && isAcct(l.name))?.name;
          if (lname) {
            const res = await mapLimit(ld, 6, async (l: any) => {
              const href = l.links?.find((x: any) => x.name === lname)?.href;
              if (!href) return [];
              try { return await fetchAllPages(href); } catch { return []; }
            });
            dl = res.flat();
          }
        }
      } catch { /* accounting optional */ }
      setDists(dl);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [url, txn]);
  useEffect(() => { if (txn) load(); }, [txn, load]);

  const ccy = pf(inv, ['InvoiceCurrencyCode', 'CurrencyCode']);
  const amt = (v: any) => fmtAmount(v, ccy);

  // Line classification → header amounts (fall back to header fields).
  const typeOf = (l: any) => String(pf(l, ['LineType', 'TransactionLineType', 'LineTypeCode']) ?? 'LINE').toUpperCase();
  const amtOf = (l: any) => num(pf(l, ['LineAmount', 'Amount', 'ExtendedAmount', 'RevenueAmount']));
  const productLines = lines.filter(l => { const t = typeOf(l); return !t.includes('TAX') && !t.includes('FREIGHT') && !t.includes('CHARGE'); });
  const linesTotal = productLines.reduce((s, l) => s + amtOf(l), 0);

  // Amounts from accounting distributions, grouped by AR account class:
  // REC = receivable (= transaction total), REV = revenue, TAX, FREIGHT, CHARGES.
  const nz = (v: any) => (v == null || v === '' || isNaN(Number(v)) ? undefined : Number(v));
  const distClass = (d: any) => String(pf(d, ['AccountClass', 'AccountClassCode', 'ClassCode', 'AccountClassMeaning']) ?? '').toUpperCase();
  const distAmt = (d: any) => Math.abs(num(pf(d, ['Amount', 'AccountedAmount', 'AmountDr', 'DistributionAmount', 'LineAmount'])));
  const distSum = (test: (c: string) => boolean) => dists.filter(d => test(distClass(d))).reduce((s, d) => s + distAmt(d), 0);
  const dOn = dists.length > 0;
  const lineTaxSum = lines.filter(l => typeOf(l).includes('TAX')).reduce((s, l) => s + amtOf(l), 0);
  const taxTotal = dOn ? distSum(c => c.includes('TAX')) : (nz(pf(inv, ['TaxAmount', 'TotalTax'])) ?? lineTaxSum);
  const freight = dOn ? distSum(c => c.includes('FREIGHT')) : (nz(pf(inv, ['FreightAmount', 'Freight'])) ?? 0);
  const charges = dOn ? distSum(c => c.includes('CHARGE')) : (nz(pf(inv, ['ChargeAmount', 'Charges'])) ?? 0);
  const recTotal = dOn ? distSum(c => c.includes('REC')) : 0;
  const total = recTotal || nz(pf(inv, ['TransactionTotal', 'InvoiceAmount', 'TotalAmount', 'EnteredAmount'])) || (linesTotal + taxTotal + freight + charges);

  const shipToHeader = pf(inv, ['ShipToCustomerName', 'ShipToPartyName']);

  const lineCols: ColumnsType<any> = [
    { title: 'Line', dataIndex: 'x', width: 55, align: 'center', render: (_, l) => <Tag color="blue" style={{ fontSize: 11 }}>{pf(l, ['LineNumber', 'CustomerTrxLineNumber']) ?? '—'}</Tag> },
    { title: 'Item', width: 120, render: (_, l) => <Text strong style={{ color: REDWOOD.info, fontSize: 12 }}>{pf(l, ['ItemNumber', 'InventoryItemNumber', 'Item']) ?? '—'}</Text> },
    { title: 'Description', width: 260, ellipsis: true, render: (_, l) => <Text style={{ fontSize: 12 }}>{pf(l, ['Description', 'LineDescription']) ?? '—'}</Text> },
    { title: 'UOM', width: 70, render: (_, l) => pf(l, ['UnitOfMeasure', 'UOM', 'UOMCode']) ?? '—' },
    { title: 'Quantity', width: 90, align: 'right', render: (_, l) => fmtQty(pf(l, ['Quantity', 'InvoicedQuantity'])) },
    { title: 'Unit Price', width: 100, align: 'right', render: (_, l) => amt(pf(l, ['UnitSellingPrice', 'UnitPrice', 'UnitStandardPrice'])) },
    { title: 'Amount', width: 120, align: 'right', render: (_, l) => <Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>{amt(amtOf(l))}</Text> },
    { title: 'Sales Order', width: 150, render: (_, l) => pf(l, ['SalesOrderNumber', 'SalesOrder', 'InterfaceLineAttribute1']) ?? '—' },
    { title: 'Date', width: 110, render: (_, l) => fmtDate(pf(l, ['SalesOrderDate', 'LineDate', 'RuleStartDate'])) },
    { title: 'Ship-to Customer', width: 180, ellipsis: true, render: (_, l) => pf(l, ['ShipToCustomerName']) ?? shipToHeader ?? '—' },
    { title: 'Tax Classification', width: 140, ellipsis: true, render: (_, l) => pf(l, ['TaxClassificationCode', 'TaxClassification']) ?? '—' },
  ];

  return (
    <Modal open={!!txn} onCancel={onClose} maskClosable={false} width={1120} style={{ top: 16 }}
      footer={<Button onClick={onClose}>Close</Button>}
      title={<Space><DollarOutlined style={{ color: REDWOOD.primary }} /> AR Invoice
        <Tag color="volcano">{pf(inv, ['TransactionNumber']) ?? txn}</Tag>
        {inv && <Tag color={/complete/i.test(String(pf(inv, ['Status', 'TransactionStatus']) ?? '')) ? 'green' : 'blue'}>{pf(inv, ['Status', 'TransactionStatus', 'PaymentStatus', 'StatusCode'])}</Tag>}</Space>}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <Tooltip title={<span style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}><b>GET</b> {decodeURIComponent(url)}</span>}>
          <Button size="small" type="text" icon={<ApiOutlined />} style={{ color: REDWOOD.info }} />
        </Tooltip>
        {dists.length > 0 && <Button size="small" icon={<ReconciliationOutlined />} style={{ borderColor: REDWOOD.purple, color: REDWOOD.purple }} onClick={() => setAcctOpen(true)}>View Accounting ({dists.length})</Button>}
        {inv && <Button size="small" icon={<ProfileOutlined />} onClick={() => setAllOpen(true)}>All fields</Button>}
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={load}>Reload</Button>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 50 }}><Spin size="large" /></div>
        : error ? <div style={{ padding: 20, color: REDWOOD.error, background: REDWOOD.error + '10', borderRadius: 6 }}><InfoCircleOutlined style={{ marginRight: 8 }} />{error}</div>
        : !inv ? <Empty description="No invoice" style={{ padding: 40 }} />
        : (
          <>
            {/* General Information */}
            <ARSection title="General Information">
              <Row gutter={[16, 0]}>
                <Col xs={24} md={9}>
                  <ARField label="Business Unit" value={pf(inv, ['BusinessUnit', 'BusinessUnitName'])} />
                  <ARField label="Transaction Source" value={pf(inv, ['TransactionSource', 'TransactionBatchSource', 'BatchSource', 'TransactionSourceName'])} />
                  <ARField label="Transaction Type" value={pf(inv, ['TransactionType', 'TransactionTypeName'])} />
                  <ARField label="Transaction Number" value={<Text strong>{pf(inv, ['TransactionNumber'])}</Text>} />
                  <ARField label="Sales Order" value={pf(inv, ['SalesOrderNumber']) ?? pf(productLines[0], ['SalesOrderNumber', 'SalesOrder', 'InterfaceLineAttribute1'])} />
                  <ARField label="Status" value={pf(inv, ['Status', 'TransactionStatus', 'PaymentStatus', 'StatusCode'])} />
                </Col>
                <Col xs={24} md={8}>
                  <ARField label="Transaction Date" value={fmtDate(pf(inv, ['TransactionDate']))} />
                  <ARField label="Accounting Date" value={fmtDate(pf(inv, ['AccountingDate', 'GlDate']))} />
                  <ARField label="Currency" value={ccy} />
                  <ARField label="Comments" value={pf(inv, ['Comments'])} />
                </Col>
                <Col xs={24} md={7}>
                  <div style={{ border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 8, padding: '10px 14px', background: REDWOOD.neutral100 }}>
                    {[
                      ['Transaction Total', amt(total), true],
                      ['Lines', amt(linesTotal), false],
                      ['Tax', amt(taxTotal), false],
                      ['Freight', amt(freight), false],
                      ['Charges', amt(charges), false],
                    ].map(([lbl, val, strong]) => (
                      <div key={lbl as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', borderBottom: `1px dashed ${REDWOOD.neutral200}` }}>
                        <span style={{ color: REDWOOD.neutral600, fontSize: 12.5, fontWeight: strong ? 700 : 400 }}>{lbl}</span>
                        <span style={{ fontWeight: strong ? 800 : 600, fontSize: strong ? 15 : 13, color: strong ? REDWOOD.primary : REDWOOD.neutral900, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </Col>
              </Row>
            </ARSection>

            {/* Customer + Payment */}
            <Row gutter={[16, 0]}>
              <Col xs={24} md={16}>
                <ARSection title="Customer">
                  <Row gutter={[16, 0]}>
                    <Col xs={24} sm={12}>
                      <ARField label="Bill-to Name" value={pf(inv, ['BillToCustomerName'])} />
                      <ARField label="Bill-to Site" value={pf(inv, ['BillToSite', 'BillToCustomerSiteNumber', 'BillToSiteNumber', 'BillToCustomerAccountSiteId'])} />
                    </Col>
                    <Col xs={24} sm={12}>
                      <ARField label="Ship-to Name" value={pf(inv, ['ShipToCustomerName'])} />
                      <ARField label="Ship-to Site" value={pf(inv, ['ShipToSite', 'ShipToCustomerSiteNumber', 'ShipToSiteNumber'])} />
                    </Col>
                  </Row>
                </ARSection>
              </Col>
              <Col xs={24} md={8}>
                <ARSection title="Payment">
                  <ARField label="Payment Terms" value={pf(inv, ['PaymentTerms', 'PaymentTermsName'])} />
                  <ARField label="Due Date" value={fmtDate(pf(inv, ['DueDate', 'PaymentDueDate']))} />
                </ARSection>
              </Col>
            </Row>

            {/* Invoice Lines */}
            <Card size="small" styles={{ body: { padding: 0 } }} style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
              title={<Space><UnorderedListOutlined style={{ color: REDWOOD.primary }} /><Text strong>Invoice Lines</Text>{productLines.length > 0 && <Tag>{productLines.length}</Tag>}</Space>}>
              {productLines.length === 0 ? <Empty description="No invoice lines" style={{ padding: 30 }} />
                : <Table size="small" columns={lineCols} dataSource={productLines} rowKey={(_, i) => `ar-line-${i}`}
                    pagination={productLines.length > 20 ? { pageSize: 20, size: 'small' } : false} scroll={{ x: 1500, y: 300 }}
                    summary={(data) => {
                      const q = data.reduce((s, l) => s + num(pf(l, ['Quantity', 'InvoicedQuantity'])), 0);
                      const a = data.reduce((s, l) => s + amtOf(l), 0);
                      return (
                        <Table.Summary fixed>
                          <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                            <Table.Summary.Cell index={0} colSpan={4} align="right"><Text strong>Total</Text></Table.Summary.Cell>
                            <Table.Summary.Cell index={4} align="right"><Text strong>{fmtQty(q)}</Text></Table.Summary.Cell>
                            <Table.Summary.Cell index={5} />
                            <Table.Summary.Cell index={6} align="right"><Text strong style={{ color: REDWOOD.primary }}>{amt(a)}</Text></Table.Summary.Cell>
                            <Table.Summary.Cell index={7} colSpan={4} />
                          </Table.Summary.Row>
                        </Table.Summary>
                      );
                    }} />}
            </Card>
          </>
        )}

      <AllFieldsModal title={`AR Invoice ${pf(inv, ['TransactionNumber']) ?? ''} — all fields`} row={allOpen ? inv : null} onClose={() => setAllOpen(false)} />

      <Modal open={acctOpen} onCancel={() => setAcctOpen(false)} maskClosable={false} width={1000}
        title={<Space><ReconciliationOutlined style={{ color: REDWOOD.purple }} /> Invoice Accounting <Tag color="volcano">{pf(inv, ['TransactionNumber']) ?? ''}</Tag></Space>}
        footer={<Button onClick={() => setAcctOpen(false)}>Close</Button>}>
        {dists.length === 0 ? <Empty description="No accounting distributions" style={{ padding: 30 }} />
          : <Table size="small" columns={dynamicColumns(dists)} dataSource={dists} rowKey={(_, i) => `dist-${i}`}
              pagination={dists.length > 20 ? { pageSize: 20, size: 'small' } : false} scroll={{ x: 'max-content', y: 400 }} />}
      </Modal>
    </Modal>
  );
};

// ── Order view (header + lines) shown in its own tab ─────────────────────────
const OrderView: React.FC<{ order: any }> = ({ order }) => {
  const linesHref = order?.links?.find((l: any) => l.name === 'lines')?.href
    ?? (order?.OrderKey ? `${FUSION_BASE}/salesOrdersForOrderHub/${encodeURIComponent(order.OrderKey)}/child/lines` : '');

  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lineDetail, setLineDetail] = useState<any | null>(null);
  const [hdrOpen, setHdrOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [arTxn, setArTxn] = useState<string | null>(null);
  const totals = useTotals(order, true);

  // Distinct line-level child collections across all lines (lotSerials, …).
  const childNames = useMemo(() => {
    const s = new Set<string>();
    lines.forEach(l => (l.links ?? []).forEach((x: any) => { if (x.rel === 'child' && x.name) s.add(x.name); }));
    return Array.from(s).sort();
  }, [lines]);

  // Only the allowlisted child collections become tabs (rest hidden); billTo +
  // shipTo merge into a single Customers tab; lineDetails shows as "Billing".
  const childTabItems = useMemo(() => {
    const findLink = (matches: string[]) => childNames.find(n => matches.includes(norm(n)));
    const billLink = findLink(CUST_BILL_MATCH);
    const shipLink = findLink(CUST_SHIP_MATCH);
    return LINE_TAB_DEFS.map(def => {
      if (def.customer) {
        if (!billLink && !shipLink) return null;
        return { key: def.key, label: <span><ProfileOutlined style={{ marginRight: 5 }} />Customers</span>,
          children: <CustomerTab lines={lines} billName={billLink} shipName={shipLink} /> };
      }
      const nm = findLink(def.match!);
      if (!nm) return null;
      // Billing tab: make the Billing Transaction Number drill into the AR invoice.
      const overrides = def.key === 'billing'
        ? [{ match: ['billingtransactionnumber', 'billingtrxnumber', 'billingtransactionnum'],
            render: (v: any) => v
              ? <Tooltip title="Open AR invoice"><Button type="link" style={{ padding: 0, fontWeight: 700, color: REDWOOD.info, fontSize: 12 }} onClick={() => setArTxn(String(v))}>{v}</Button></Tooltip>
              : '—' }]
        : undefined;
      return { key: def.key, label: <span><ProfileOutlined style={{ marginRight: 5 }} />{def.label}</span>,
        children: <MergedLineChildTab lines={lines} name={nm} overrides={overrides} /> };
    }).filter(Boolean) as { key: string; label: React.ReactNode; children: React.ReactNode }[];
  }, [childNames, lines]);

  // Fulfillment org & subinventory come from the lines — surface the distinct
  // values in the header.
  const orgList = useMemo(() => Array.from(new Set(lines.map((l: any) => l.RequestedFulfillmentOrganizationCode).filter(Boolean))) as string[], [lines]);
  const orgNameOf = (code: string) => lines.find((l: any) => l.RequestedFulfillmentOrganizationCode === code)?.RequestedFulfillmentOrganizationName;
  const subList = useMemo(() => Array.from(new Set(lines.map((l: any) => l.SubinventoryCode).filter(Boolean))) as string[], [lines]);

  const loadLines = useCallback(async () => {
    if (!linesHref) return;
    setLoading(true); setError('');
    try { setLines(await fetchAllPages(linesHref)); }
    catch (e: any) { setError(e.message); setLines([]); }
    finally { setLoading(false); }
  }, [linesHref]);
  useEffect(() => { loadLines(); }, [loadLines]);

  // Header: curated highlights + all remaining non-null, non-id fields.
  const HInfo: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <Col xs={12} sm={8} md={6}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
        <div style={{ fontSize: 12.5, color: REDWOOD.neutral900, marginTop: 2, wordBreak: 'break-word' }}>{value ?? '—'}</div>
      </div>
    </Col>
  );

  const lineCols = useMemo<ColumnsType<any>>(() => ([
    { title: 'Line', dataIndex: 'DisplayLineNumber', width: 60, align: 'center', fixed: 'left',
      render: (v, r) => <Tag color="blue" style={{ fontSize: 11 }}>{v ?? r.LineNumber ?? '—'}</Tag> },
    { title: 'Product', dataIndex: 'ProductNumber', width: 140, fixed: 'left',
      render: v => <Text strong style={{ color: REDWOOD.info, fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Description', dataIndex: 'ProductDescription', width: 260, ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Ordered Qty', dataIndex: 'OrderedQuantity', width: 100, align: 'right', render: (v, r) => `${fmtQty(v)}${r.OrderedUOM ? ' ' + r.OrderedUOM : ''}` },
    { title: 'Unit List', dataIndex: 'UnitListPrice', width: 100, align: 'right', render: v => (v == null ? '—' : fmtQty(v)) },
    { title: 'Unit Selling', dataIndex: 'UnitSellingPrice', width: 100, align: 'right', render: v => (v == null ? '—' : fmtQty(v)) },
    { title: 'Line Total', key: 'lineTotal', width: 120, align: 'right',
      render: (_, r) => {
        const ext = num(r.OrderedQuantity) * num(r.UnitSellingPrice);
        return <Text strong style={{ color: REDWOOD.primary, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmtAmount(ext, order.TransactionalCurrencyCode ?? order.AppliedCurrencyCode)}</Text>;
      } },
    { title: 'Status', dataIndex: 'Status', width: 120, render: (v, r) => statusTag(v, r.StatusCode) },
    { title: 'Req Ship Date', dataIndex: 'RequestedShipDate', width: 120, render: fmtDate },
    { title: 'Inv Org', dataIndex: 'InventoryOrganizationCode', width: 90, render: v => v ? <Tag style={{ fontSize: 11 }}>{v}</Tag> : '—' },
    { title: 'Organization', dataIndex: 'RequestedFulfillmentOrganizationCode', width: 120,
      render: (v, r) => v ? <Tooltip title={r.RequestedFulfillmentOrganizationName}><Tag style={{ fontSize: 11 }}>{v}</Tag></Tooltip> : '—' },
    { title: 'Subinventory', dataIndex: 'SubinventoryCode', width: 120, render: v => v ?? '—' },
    ...dynamicColumns(lines, [
      'DisplayLineNumber', 'LineNumber', 'ProductNumber', 'ProductDescription', 'OrderedQuantity', 'OrderedUOM',
      'UnitListPrice', 'UnitSellingPrice', 'Status', 'StatusCode', 'RequestedShipDate', 'InventoryOrganizationCode',
      'RequestedFulfillmentOrganizationCode', 'RequestedFulfillmentOrganizationName', 'SubinventoryCode', 'Subinventory',
    ]),
    { title: '', key: 'more', width: 46, fixed: 'right', align: 'center',
      render: (_, r) => (
        <Tooltip title="All fields (null & id hidden)">
          <Button size="small" type="text" icon={<ProfileOutlined />} style={{ color: REDWOOD.info }} onClick={() => setLineDetail(r)} />
        </Tooltip>
      ) },
  ]), [lines]);

  // Build a nicely formatted Sales Order PDF (header + lines + totals).
  const buildPdf = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageW = doc.internal.pageSize.getWidth();
    const RED: [number, number, number] = [199, 70, 52];
    const GREEN: [number, number, number] = [29, 123, 77];

    doc.setFillColor(...RED); doc.rect(0, 0, pageW, 24, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('SALES ORDER', 14, 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(`Order ${fmt(order.OrderNumber)}`, pageW - 14, 10, { align: 'right' });
    doc.text(`Status: ${fmt(order.Status)}`, pageW - 14, 15.5, { align: 'right' });
    doc.text(`Date: ${fmtDate(order.TransactionOn)}`, pageW - 14, 21, { align: 'right' });
    doc.setTextColor(0);

    let y = 32;
    autoTable(doc, {
      startY: y,
      body: [
        ['Business Unit', fmt(order.BusinessUnitName), 'Customer', fmt(order.BuyingPartyName)],
        ['Legal Entity', fmt(order.RequestingLegalEntity), 'Customer #', fmt(order.BuyingPartyNumber)],
        ['Source Txn #', `${fmt(order.SourceTransactionNumber)} (${fmt(order.SourceTransactionSystem)})`, 'Customer PO', fmt(order.CustomerPONumber)],
        ['Transaction Type', fmt(order.TransactionType ?? order.TransactionTypeCode), 'Currency', fmt(order.TransactionalCurrencyCode ?? order.AppliedCurrencyCode)],
        ['Payment Terms', fmt(order.PaymentTerms ?? order.PaymentTermsCode), 'Requested Ship', fmtDate(order.RequestedShipDate)],
        ['Order Key', fmt(order.OrderKey), 'Created', fmtDateTime(order.CreationDate)],
      ],
      styles: { fontSize: 9, cellPadding: 2.2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32, fillColor: [245, 245, 245] }, 2: { fontStyle: 'bold', cellWidth: 30, fillColor: [245, 245, 245] } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Lines', 14, y); y += 2;
    autoTable(doc, {
      startY: y,
      head: [['#', 'Product', 'Description', 'Qty', 'Unit List', 'Unit Price', 'Extended', 'Status']],
      body: lines.map(l => {
        const ext = num(l.OrderedQuantity) * num(l.UnitSellingPrice);
        return [
          fmt(l.DisplayLineNumber ?? l.LineNumber),
          fmt(l.ProductNumber),
          fmt(l.ProductDescription),
          `${fmtQty(l.OrderedQuantity)}${l.OrderedUOM ? ' ' + l.OrderedUOM : ''}`,
          l.UnitListPrice == null ? '—' : fmtAmount(l.UnitListPrice),
          l.UnitSellingPrice == null ? '—' : fmtAmount(l.UnitSellingPrice),
          fmtAmount(ext),
          fmt(l.Status),
        ];
      }),
      styles: { fontSize: 8, cellPadding: 1.8, overflow: 'linebreak' },
      headStyles: { fillColor: [58, 58, 58], textColor: 255 },
      alternateRowStyles: { fillColor: [249, 249, 249] },
      columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 26 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { cellWidth: 22 } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    const tItems = totals.items;
    if (tItems.length) {
      const grand = tItems.find(isGrandTotal);
      const rows = tItems.filter(t => t !== grand).sort((a, b) => totalRank(a) - totalRank(b));
      autoTable(doc, {
        startY: y,
        body: rows.map(t => [fmt(t.TotalName ?? t.TotalCode), fmtAmount(t.TotalAmount, t.CurrencyCode)]),
        foot: grand ? [[fmt(grand.TotalName ?? 'Order Total'), fmtAmount(grand.TotalAmount, grand.CurrencyCode)]] : undefined,
        styles: { fontSize: 9, cellPadding: 2 },
        footStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold', fontSize: 11 },
        columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
        tableWidth: 80,
        margin: { left: pageW - 94, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`Page ${i} of ${pageCount}`, pageW / 2, 290, { align: 'center' });
      doc.text('Generated by Fusion Client', 14, 290);
      doc.setTextColor(0);
    }
    return doc;
  };

  const printOrder = () => {
    try {
      const doc = buildPdf();
      const url = URL.createObjectURL(doc.output('blob'));
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(url);
    } catch (e: any) { message.error(`Print failed: ${e.message}`); }
  };
  const closePdf = () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); setPdfUrl(null); };

  return (
    <div style={{ padding: '4px 2px' }}>
      {/* Header card */}
      <Card size="small" style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, marginBottom: 12 }}
        title={<Space><BankOutlined style={{ color: REDWOOD.primary }} /><Text strong>Header</Text>
          <Tag color="volcano">{order.OrderNumber}</Tag>{statusTag(order.Status, order.StatusCode)}</Space>}
        extra={<Space>
          <Button size="small" type="primary" icon={<PrinterOutlined />} onClick={printOrder}
            style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>Print Order</Button>
          <Button size="small" icon={<ProfileOutlined />} onClick={() => setHdrOpen(true)}>All fields</Button>
        </Space>}>
        <Row gutter={[16, 12]}>
          {/* Info fields */}
          <Col xs={24} lg={17}>
            <Row gutter={[12, 0]}>
              <HInfo label="Order Number" value={<Text strong>{order.OrderNumber}</Text>} />
              <HInfo label="Source Transaction #" value={<span>{order.SourceTransactionNumber ?? '—'}{order.SourceTransactionSystem ? <Tag style={{ marginLeft: 6, fontSize: 10 }}>{order.SourceTransactionSystem}</Tag> : null}</span>} />
              <HInfo label="Order Key" value={order.OrderKey} />
              <HInfo label="Transaction Type" value={order.TransactionType ? <Tag color="purple">{order.TransactionType}</Tag> : (order.TransactionTypeCode ?? '—')} />
              <HInfo label="Business Unit" value={order.BusinessUnitName} />
              <HInfo label="Customer" value={order.BuyingPartyName} />
              <HInfo label="Customer #" value={order.BuyingPartyNumber} />
              <HInfo label="Customer PO" value={order.CustomerPONumber} />
              <HInfo label="Currency" value={order.TransactionalCurrencyCode ?? order.TransactionalCurrencyName ?? order.AppliedCurrencyCode} />
              <HInfo label="Payment Terms" value={order.PaymentTerms ?? order.PaymentTermsCode} />
              <HInfo label="Transaction On" value={fmtDateTime(order.TransactionOn)} />
              <HInfo label="Requested Ship" value={fmtDate(order.RequestedShipDate)} />
              <HInfo label="Requested Arrival" value={fmtDate(order.RequestedArrivalDate)} />
              <HInfo label="Requesting BU" value={order.RequestingBusinessUnitName} />
              <HInfo label="Legal Entity" value={order.RequestingLegalEntity} />
              <HInfo label="Organization" value={orgList.length ? <Space size={4} wrap>{orgList.map(o => <Tooltip key={o} title={orgNameOf(o)}><Tag style={{ margin: 0 }}>{o}</Tag></Tooltip>)}</Space> : '—'} />
              <HInfo label="Subinventory" value={subList.length ? <Space size={4} wrap>{subList.map(s => <Tag key={s} style={{ margin: 0 }}>{s}</Tag>)}</Space> : '—'} />
              <HInfo label="Created" value={fmtDateTime(order.CreationDate)} />
            </Row>
          </Col>
          {/* Order total — inside the header */}
          <Col xs={24} lg={7}>
            <div style={{ borderLeft: `1px solid ${REDWOOD.neutral200}`, paddingLeft: 16, height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <DollarOutlined style={{ color: REDWOOD.success }} />
                <Text strong style={{ fontSize: 12.5 }}>Order Total</Text>
                <span style={{ marginLeft: 'auto' }}>
                  <Tooltip title={<span style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}><b>GET</b> {totals.href}</span>}>
                    <Button size="small" type="text" icon={<ApiOutlined />} style={{ color: REDWOOD.info }} />
                  </Tooltip>
                  <Button size="small" type="text" icon={<ReloadOutlined />} loading={totals.loading} onClick={totals.load} />
                </span>
              </div>
              {totals.loading ? <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                : totals.error ? <div style={{ color: REDWOOD.error, fontSize: 12 }}><InfoCircleOutlined style={{ marginRight: 6 }} />{totals.error}</div>
                : <TotalsSummary items={totals.items} currency={order.TransactionalCurrencyCode ?? order.AppliedCurrencyCode ?? order.TransactionalCurrencyName} />}
            </div>
          </Col>
        </Row>
      </Card>

      {/* Lines + one tab per line-level child collection (lotSerials, …) */}
      <Card size="small" styles={{ body: { padding: '4px 10px 10px' } }} style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, marginTop: 12 }}>
        <Tabs size="small" items={[
          {
            key: 'lines',
            label: <span><UnorderedListOutlined style={{ marginRight: 5 }} />Lines{lines.length ? ` (${lines.length})` : ''}</span>,
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
                  <Tooltip title={<span style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}><b>GET</b> {linesHref}</span>}>
                    <Button size="small" type="text" icon={<ApiOutlined />} style={{ color: REDWOOD.info }} />
                  </Tooltip>
                  <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={loadLines}>Reload</Button>
                </div>
                {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                  : error ? <div style={{ color: REDWOOD.error, fontSize: 12, padding: 16 }}><InfoCircleOutlined style={{ marginRight: 6 }} />{error}</div>
                  : lines.length === 0 ? <Empty description="No lines" style={{ padding: 30 }} />
                  : <Table size="small" columns={lineCols} dataSource={lines} rowKey={(r, i) => `${r.LineId ?? r.FulfillLineId ?? i}`}
                      pagination={lines.length > 25 ? { pageSize: 25, size: 'small' } : false} scroll={{ x: 'max-content', y: 420 }}
                      summary={(data) => {
                        const ordCcy = order.TransactionalCurrencyCode ?? order.AppliedCurrencyCode ?? order.TransactionalCurrencyName;
                        const totQty = data.reduce((s, r) => s + num(r.OrderedQuantity), 0);
                        const totAmt = data.reduce((s, r) => s + num(r.OrderedQuantity) * num(r.UnitSellingPrice), 0);
                        return (
                          <Table.Summary fixed>
                            <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                              <Table.Summary.Cell index={0} colSpan={3}><Text strong>Total ({data.length} line{data.length !== 1 ? 's' : ''})</Text></Table.Summary.Cell>
                              <Table.Summary.Cell index={3} align="right"><Text strong>{fmtQty(totQty)}</Text></Table.Summary.Cell>
                              <Table.Summary.Cell index={4} />
                              <Table.Summary.Cell index={5} />
                              <Table.Summary.Cell index={6} align="right"><Text strong style={{ color: REDWOOD.primary, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(totAmt, ordCcy)}</Text></Table.Summary.Cell>
                              <Table.Summary.Cell index={7} colSpan={Math.max(1, lineCols.length - 7)} />
                            </Table.Summary.Row>
                          </Table.Summary>
                        );
                      }} />}
              </div>
            ),
          },
          {
            key: 'actualCosting',
            label: <span><DollarOutlined style={{ marginRight: 5 }} />Actual Costing</span>,
            children: lines.length === 0
              ? <Empty description="No lines" style={{ padding: 30 }} />
              : <ActualCostingTab lines={lines} currency={order.TransactionalCurrencyCode ?? order.AppliedCurrencyCode ?? order.TransactionalCurrencyName} />,
          },
          ...childTabItems,
        ]} />
      </Card>

      {/* Print preview */}
      <Modal open={!!pdfUrl} onCancel={closePdf} maskClosable={false} width={920} style={{ top: 20 }}
        title={<Space><PrinterOutlined style={{ color: REDWOOD.primary }} /> Order {order.OrderNumber} — Print Preview</Space>}
        footer={<Space>
          <Button icon={<DownloadOutlined />} onClick={() => { if (!pdfUrl) return; const a = document.createElement('a'); a.href = pdfUrl; a.download = `SalesOrder_${order.OrderNumber}.pdf`; a.click(); }}>Download</Button>
          <Button onClick={closePdf}>Close</Button>
        </Space>}>
        {pdfUrl && <iframe src={pdfUrl} title="order-pdf" style={{ width: '100%', height: '72vh', border: 'none' }} />}
      </Modal>

      <AllFieldsModal title={`Order ${order.OrderNumber} — header`} row={hdrOpen ? order : null} onClose={() => setHdrOpen(false)} />
      <AllFieldsModal title={`Line ${lineDetail?.DisplayLineNumber ?? ''} — ${lineDetail?.ProductNumber ?? ''}`} row={lineDetail} onClose={() => setLineDetail(null)} />
      <ARInvoiceDialog txn={arTxn} onClose={() => setArTxn(null)} />
    </div>
  );
};

// ── Search tab ───────────────────────────────────────────────────────────────
interface Filters {
  dateFrom?: Dayjs | null; dateTo?: Dayjs | null;
  businessUnit?: string; customer?: string; customerNumber?: string;
  statusCode?: string; orderKey?: string;
}

const STATUS_CODES = [
  { value: 'DOO_DRAFT', label: 'Draft (DOO_DRAFT)' },
  { value: 'DOO_OPEN', label: 'Open (DOO_OPEN)' },
  { value: 'DOO_SUBMITTED', label: 'Submitted (DOO_SUBMITTED)' },
  { value: 'DOO_PROCESSING', label: 'Processing (DOO_PROCESSING)' },
  { value: 'DOO_SCHEDULED', label: 'Scheduled (DOO_SCHEDULED)' },
  { value: 'DOO_SHIPPED', label: 'Shipped (DOO_SHIPPED)' },
  { value: 'DOO_CLOSED', label: 'Closed (DOO_CLOSED)' },
  { value: 'DOO_CANCELED', label: 'Canceled (DOO_CANCELED)' },
];

const SearchTab: React.FC<{ onOpen: (order: any) => void; onEdit: (order: any) => void }> = ({ onOpen, onEdit }) => {
  const [form] = Form.useForm();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [apiOpen, setApiOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [detail, setDetail] = useState<any | null>(null);
  const [totalsOrder, setTotalsOrder] = useState<any | null>(null);

  const [filters, setFilters] = useState<Filters>({
    dateFrom: dayjs().subtract(1, 'month'), dateTo: dayjs().add(1, 'day'),
  });

  // Dates unquoted (TransactionOn>2026-01-16); text uses SQL LIKE; codes exact.
  const buildQ = useCallback((f: Filters) => {
    const parts: string[] = [];
    if (f.dateFrom) parts.push(`TransactionOn>${dayjs(f.dateFrom).format('YYYY-MM-DD')}`);
    if (f.dateTo) parts.push(`TransactionOn<${dayjs(f.dateTo).format('YYYY-MM-DD')}`);
    if (f.businessUnit?.trim()) parts.push(`BusinessUnitName LIKE '%${f.businessUnit.trim()}%'`);
    if (f.customer?.trim()) parts.push(`BuyingPartyName LIKE '%${f.customer.trim()}%'`);
    if (f.customerNumber?.trim()) parts.push(`BuyingPartyNumber='${f.customerNumber.trim()}'`);
    if (f.statusCode) parts.push(`StatusCode='${f.statusCode}'`);
    if (f.orderKey?.trim()) parts.push(`OrderKey='${f.orderKey.trim()}'`);
    return parts.join(';');
  }, []);

  const searchUrl = useMemo(() => {
    const q = buildQ(filters);
    const qs = q ? `q=${encodeURIComponent(q)}&` : '';
    return `${FUSION_BASE}/salesOrdersForOrderHub?${qs}orderBy=TransactionOn:desc`;
  }, [filters, buildQ]);

  const runSearch = useCallback(async () => {
    setLoading(true); setError(''); setSearched(true);
    try {
      const items = await fetchAllPages(searchUrl);
      setRows(items);
      if (items.length === 0) setError('No sales orders matched.');
    } catch (e: any) { setError(e.message); setRows([]); }
    finally { setLoading(false); }
  }, [searchUrl]);

  const filtered = useMemo(() => {
    const t = filterText.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(r => JSON.stringify(r).toLowerCase().includes(t));
  }, [rows, filterText]);

  const columns = useMemo<ColumnsType<any>>(() => ([
    { title: 'Source Txn #', dataIndex: 'SourceTransactionNumber', width: 185, fixed: 'left',
      render: (v, r) => (
        <Space size={2} style={{ maxWidth: '100%' }}>
          <Button type="link" style={{ padding: 0, fontWeight: 700, color: REDWOOD.info, fontSize: 12, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={v ?? r.OrderNumber} onClick={() => onOpen(r)}>{v ?? r.OrderNumber ?? '—'}</Button>
          <Tooltip title="View order"><Button size="small" type="text" icon={<EyeOutlined />} style={{ color: REDWOOD.info }} onClick={() => onOpen(r)} /></Tooltip>
          <Tooltip title="Edit order (change order)"><Button size="small" type="text" icon={<EditOutlined />} style={{ color: '#B07700' }} onClick={() => onEdit(r)} /></Tooltip>
        </Space>
      ) },
    { title: 'Order', dataIndex: 'OrderNumber', width: 100, render: v => <Text strong style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Order Date', dataIndex: 'TransactionOn', width: 130, render: fmtDateTime,
      sorter: (a, b) => String(a.TransactionOn ?? '').localeCompare(String(b.TransactionOn ?? '')) },
    { title: 'Transaction Type', dataIndex: 'TransactionType', width: 140, render: (v, r) => v ? <Tag color="purple" style={{ fontSize: 11 }}>{v}</Tag> : (r.TransactionTypeCode ? <Tag style={{ fontSize: 11 }}>{r.TransactionTypeCode}</Tag> : '—') },
    { title: 'Currency', dataIndex: 'TransactionalCurrencyCode', width: 90, align: 'center', render: (v, r) => <Tag style={{ fontSize: 11 }}>{v ?? r.AppliedCurrencyCode ?? '—'}</Tag> },
    { title: 'Payment Terms', dataIndex: 'PaymentTerms', width: 150, ellipsis: true, render: (v, r) => <Text style={{ fontSize: 12 }}>{v ?? r.PaymentTermsCode ?? '—'}</Text> },
    { title: 'Status', dataIndex: 'Status', width: 120, render: (v, r) => statusTag(v, r.StatusCode) },
    { title: 'Business Unit', dataIndex: 'BusinessUnitName', width: 220, ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Customer', dataIndex: 'BuyingPartyName', width: 220, ellipsis: true, render: v => <Text strong style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Customer #', dataIndex: 'BuyingPartyNumber', width: 110, render: v => v ?? '—' },
    { title: 'Customer PO', dataIndex: 'CustomerPONumber', width: 120, render: v => v ?? '—' },
    { title: 'Requested Ship', dataIndex: 'RequestedShipDate', width: 130, render: fmtDate },
    { title: 'Source System', dataIndex: 'SourceTransactionSystem', width: 110, render: v => v ? <Tag style={{ fontSize: 11 }}>{v}</Tag> : '—' },
    { title: 'Order Key', dataIndex: 'OrderKey', width: 200, ellipsis: true, render: v => <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{v ?? '—'}</Text> },
    { title: 'Created', dataIndex: 'CreationDate', width: 130, render: fmtDateTime },
    { title: '', key: 'totals', width: 44, fixed: 'right', align: 'center',
      render: (_, r) => (
        <Tooltip title="Order totals">
          <Button size="small" type="text" icon={<DollarOutlined />} style={{ color: REDWOOD.success }} onClick={() => setTotalsOrder(r)} />
        </Tooltip>
      ) },
    { title: '', key: 'more', width: 46, fixed: 'right', align: 'center',
      render: (_, r) => (
        <Tooltip title="All fields (null & id hidden)">
          <Button size="small" type="text" icon={<ProfileOutlined />} style={{ color: REDWOOD.info }} onClick={() => setDetail(r)} />
        </Tooltip>
      ) },
  ]), [onOpen, onEdit]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card styles={{ body: { padding: '14px 18px' } }} style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
        <Form form={form} layout="vertical" size="small">
          <Row gutter={[8, 0]}>
            <Col xs={24} sm={12} md={6}>
              <Form.Item label={<Text style={{ fontSize: 11, fontWeight: 600 }}>Order Date (from → to)</Text>} style={{ marginBottom: 6 }}>
                <Space.Compact style={{ width: '100%' }}>
                  <DatePicker style={{ width: '100%' }} placeholder="From" value={filters.dateFrom} onChange={d => setFilters(f => ({ ...f, dateFrom: d }))} />
                  <DatePicker style={{ width: '100%' }} placeholder="To" value={filters.dateTo} onChange={d => setFilters(f => ({ ...f, dateTo: d }))} />
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col xs={12} sm={8} md={5}>
              <Form.Item label={<Text style={{ fontSize: 11, fontWeight: 600 }}>Business Unit</Text>} style={{ marginBottom: 6 }}>
                <Input placeholder="e.g. MITSUMI" allowClear value={filters.businessUnit}
                  onChange={e => setFilters(f => ({ ...f, businessUnit: e.target.value }))} onPressEnter={runSearch} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8} md={5}>
              <Form.Item label={<Text style={{ fontSize: 11, fontWeight: 600 }}>Customer</Text>} style={{ marginBottom: 6 }}>
                <Input placeholder="Buying party name" allowClear value={filters.customer}
                  onChange={e => setFilters(f => ({ ...f, customer: e.target.value }))} onPressEnter={runSearch} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Form.Item label={<Text style={{ fontSize: 11, fontWeight: 600 }}>Customer #</Text>} style={{ marginBottom: 6 }}>
                <Input placeholder="e.g. DCLG0030" allowClear value={filters.customerNumber}
                  onChange={e => setFilters(f => ({ ...f, customerNumber: e.target.value }))} onPressEnter={runSearch} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Form.Item label={<Text style={{ fontSize: 11, fontWeight: 600 }}>Status</Text>} style={{ marginBottom: 6 }}>
                <Select allowClear showSearch placeholder="Any" value={filters.statusCode}
                  onChange={v => setFilters(f => ({ ...f, statusCode: v }))}
                  options={STATUS_CODES} optionFilterProp="label" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8} md={5}>
              <Form.Item label={<Text style={{ fontSize: 11, fontWeight: 600 }}>Order Key</Text>} style={{ marginBottom: 6 }}>
                <Input placeholder="e.g. OPS:300000010754319" allowClear value={filters.orderKey}
                  onChange={e => setFilters(f => ({ ...f, orderKey: e.target.value }))} onPressEnter={runSearch} />
              </Form.Item>
            </Col>
          </Row>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button type="primary" size="small" icon={<SearchOutlined />} loading={loading} onClick={runSearch}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>Search</Button>
            <Button size="small" icon={<ClearOutlined />} onClick={() => setFilters({ dateFrom: dayjs().subtract(1, 'month'), dateTo: dayjs().add(1, 'day') })}>Reset</Button>
            <Tooltip title="API Inspector — salesOrdersForOrderHub">
              <Button size="small" icon={<ApiOutlined />} style={{ marginLeft: 'auto', borderColor: REDWOOD.info, color: REDWOOD.info }}
                onClick={() => setApiOpen(true)}>API</Button>
            </Tooltip>
          </div>
        </Form>
      </Card>

      <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
        title={<Space><ShoppingOutlined style={{ color: REDWOOD.primary }} /><Text strong>Sales Orders</Text>
          {rows.length > 0 && <Tag>{filtered.length}{filtered.length !== rows.length ? ` of ${rows.length}` : ''} order{rows.length !== 1 ? 's' : ''}</Tag>}</Space>}
        extra={<Space>
          <Input placeholder="Filter any column…" allowClear size="small" prefix={<SearchOutlined style={{ color: REDWOOD.neutral300 }} />}
            value={filterText} onChange={e => setFilterText(e.target.value)} style={{ width: 220 }} />
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={runSearch}>Refresh</Button>
        </Space>}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" tip="Loading…" /></div>
        ) : error && rows.length === 0 ? (
          <div style={{ padding: 24, color: REDWOOD.error, background: REDWOOD.error + '10', margin: 16, borderRadius: 6 }}>
            <InfoCircleOutlined style={{ marginRight: 8 }} />{error}
          </div>
        ) : !searched ? (
          <Empty description="Run a search" style={{ padding: 60 }} />
        ) : filtered.length === 0 ? (
          <Empty description="No sales orders" style={{ padding: 60 }} />
        ) : (
          <Table columns={columns} dataSource={filtered} rowKey={(r, i) => `${r.HeaderId ?? r.OrderKey ?? i}`} size="small"
            scroll={{ x: 2249 }} pagination={{ pageSize: 25, size: 'small', showSizeChanger: true, showTotal: t => `${t} orders` }} />
        )}
      </Card>

      <Modal title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /> Sales Orders API</Space>}
        open={apiOpen} onCancel={() => setApiOpen(false)} maskClosable={false} width={880}
        footer={<Button onClick={() => setApiOpen(false)}>Close</Button>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { lbl: 'Search sales orders', url: decodeURIComponent(searchUrl) },
            { lbl: 'Order lines (per order)', url: `${FUSION_BASE}/salesOrdersForOrderHub/{OrderKey}/child/lines` },
          ].map(({ lbl, url }) => (
            <div key={lbl}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase' }}>{lbl}</Text>
                <Button size="small" type="text" icon={<CopyOutlined />} style={{ marginLeft: 'auto' }}
                  onClick={() => { navigator.clipboard.writeText(url); message.success('Copied'); }}>Copy</Button>
              </div>
              <div style={{ marginTop: 4, padding: '8px 12px', borderRadius: 6, background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.neutral200}`, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', color: REDWOOD.info }}>
                <Tag color="blue">GET</Tag>{url}
              </div>
            </div>
          ))}
          <Text type="secondary" style={{ fontSize: 11 }}>Dates unquoted (TransactionOn&gt;2026-01-16); text uses SQL LIKE; codes exact ('value'). Auth: Basic [emparun].</Text>
        </div>
      </Modal>

      <AllFieldsModal title={`Order ${detail?.OrderNumber ?? ''} — all fields`} row={detail} onClose={() => setDetail(null)} />
      <TotalsModal order={totalsOrder} onClose={() => setTotalsOrder(null)} />
    </div>
  );
};

// ── Page (Search tab + one tab per opened order) ─────────────────────────────
// ── Create New Order ─────────────────────────────────────────────────────────
const SO_CREATE_URL = `${FUSION_BASE}/salesOrdersForOrderHub`;
const CURRENCIES = ['AED', 'USD', 'RWF', 'EUR', 'GBP', 'INR', 'SAR', 'KES', 'TZS', 'UGX', 'ZAR', 'XOF'];
const PAYMENT_TERMS = ['Immediate', '30 Net', '45 Net', '60 Net', 'CR7D', 'CR30D', 'CR45D'];

// Custom ORDS lookups (customers, payment terms, salespersons).
// Electron goes direct; the browser build routes via the /ords-mitsu proxy to avoid CORS.
const ORDS_AR = _isElectron
  ? 'https://g827cd88c3cfc03-mitsumioracledb.adb.me-dubai-1.oraclecloudapps.com/ords/test/FUSIONCLIENTERP/ar'
  : '/ords-mitsu/ar';
const PAYMENT_TERMS_URL = `${ORDS_AR}/paymentterms`;
const SALESREPS_URL = `${ORDS_AR}/salesperson`;

// Pick a display label from an ORDS row (candidate keys, else first non-id string).
const ordsLabel = (row: any, keys: string[]): string | undefined => {
  const v = pf(row, keys);
  if (v != null && v !== '') return String(v);
  const e = Object.entries(row ?? {}).find(([k, val]) => typeof val === 'string' && String(val).trim() && !/id$/i.test(k) && k !== 'links');
  return e ? String(e[1]) : undefined;
};
// Fetch an ORDS list → distinct {value,label} options (empty on failure).
const useOrdsOptions = (url: string, keys: string[], fallback: string[] = []): { value: string; label: string }[] => {
  const [opts, setOpts] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    let live = true;
    fetch(url, { headers: { Accept: 'application/json' } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        if (!live) return;
        const rows = d.items ?? (Array.isArray(d) ? d : []);
        const seen = new Set<string>(); const list: { value: string; label: string }[] = [];
        rows.forEach((row: any) => { const lbl = ordsLabel(row, keys); if (lbl && !seen.has(lbl)) { seen.add(lbl); list.push({ value: lbl, label: lbl }); } });
        setOpts(list.length ? list : fallback.map(f => ({ value: f, label: f })));
      })
      .catch(() => { if (live) setOpts(fallback.map(f => ({ value: f, label: f }))); });
    return () => { live = false; };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  return opts;
};
const PAY_TERM_KEYS = ['name', 'Name', 'payment_terms', 'paymentterms', 'term_name', 'termname', 'payment_term', 'value', 'description'];
const SALESREP_KEYS = ['salesrep_name', 'salerep_code', 'name', 'Name', 'salesperson', 'salesperson_name', 'salespersonname', 'resource_name', 'full_name', 'value'];

// Tax codes for a business unit (ORDS: FUSION_TAX_CODES where BUSINESS_UNIT = :P_BUSINESS_UNIT).
export interface TaxCode { code: string; pct: number }
const TAXCODES_URL = `${ORDS_AR}/taxcodes`;
const useTaxCodes = (bu?: string): TaxCode[] => {
  const [rows, setRows] = useState<TaxCode[]>([]);
  useEffect(() => {
    if (!bu) { setRows([]); return; }
    let live = true;
    const qs = new URLSearchParams({ P_BUSINESS_UNIT: bu, business_unit: bu }).toString();
    fetch(`${TAXCODES_URL}?${qs}`, { headers: { Accept: 'application/json' } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        if (!live) return;
        const items = d.items ?? (Array.isArray(d) ? d : []);
        const seen = new Set<string>(); const list: TaxCode[] = [];
        items.forEach((x: any) => {
          const code = String(pf(x, ['tax_code', 'TAX_CODE', 'code', 'name']) ?? '').trim();
          if (code && !seen.has(code)) { seen.add(code); list.push({ code, pct: num(pf(x, ['tax_code_per', 'TAX_CODE_PER', 'rate', 'pct', 'percentage'])) }); }
        });
        setRows(list);
      })
      .catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [bu]);
  return rows;
};
const round2 = (v: number) => Math.round((num(v) + Number.EPSILON) * 100) / 100;

const CUSTOMERS_URL = `${ORDS_AR}/customers`;
// Fetch all customer rows (paged) from the ORDS customers endpoint.
const useCustomers = (): any[] => {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const all: any[] = []; let offset = 0;
        for (let i = 0; i < 20; i++) {
          const r = await fetch(`${CUSTOMERS_URL}?limit=500&offset=${offset}`, { headers: { Accept: 'application/json' } });
          if (!r.ok) break;
          const d = await r.json(); const items = d.items ?? (Array.isArray(d) ? d : []);
          all.push(...items);
          if (!d.hasMore || items.length === 0) break;
          offset += 500;
        }
        if (live) setRows(all);
      } catch { /* ignore */ }
    })();
    return () => { live = false; };
  }, []);
  return rows;
};
const custAcct = (c: any) => pf(c, ['account_number', 'ACCOUNT_NUMBER', 'AccountNumber']);
const custName = (c: any) => pf(c, ['account_name', 'ACCOUNT_NAME', 'AccountName']);
const custOptionList = (customers: any[]) => {
  const seen = new Set<string>();
  return customers.map(c => ({ value: String(custName(c) ?? ''), label: `${custName(c) ?? ''}${custAcct(c) ? ` (${custAcct(c)})` : ''}`, _c: c }))
    .filter(o => o.value && !seen.has(o.value) && seen.add(o.value));
};
// Field values to set when a customer is picked (fills sites + addresses).
const customerFill = (row: any) => {
  const join = (...ks: string[][]) => ks.map(k => pf(row, k)).filter(Boolean).join(', ');
  const idStr = (k: string[]) => { const v = pf(row, k); return v == null || v === '' ? undefined : String(v); };
  return {
    customerName: custName(row), accountNumber: custAcct(row),
    billToSite: idStr(['bill_to_site_use_id', 'BILL_TO_SITE_USE_ID']),
    shipToSite: idStr(['ship_to_party_site_id', 'SHIP_TO_PARTY_SITE_ID']),
    billToAddress: join(['bill_to_address1', 'BILL_TO_ADDRESS1'], ['bill_to_address2', 'BILL_TO_ADDRESS2'], ['bill_to_city', 'BILL_TO_CITY']),
    shipToAddress: join(['ship_to_address1', 'SHIP_TO_ADDRESS1'], ['ship_to_address2', 'SHIP_TO_ADDRESS2'], ['ship_to_city', 'SHIP_TO_CITY'], ['ship_to_country', 'SHIP_TO_COUNTRY']),
    custAccountId: idStr(['cust_account_id', 'CUST_ACCOUNT_ID']),
    partyId: idStr(['party_id', 'PARTY_ID']),
  };
};

interface OrderHeader {
  businessUnit?: string; businessUnitId?: number | string; buCode?: string; baseCurrency?: string; txnCurrency?: string; rate?: number;
  orderType?: string; orderDate?: Dayjs | null; customerName?: string; accountNumber?: string;
  billToSite?: string; shipToSite?: string; billToAddress?: string; shipToAddress?: string;
  paymentTerms?: string; salesRep?: string; warehouse?: string; subinventory?: string; remarks?: string;
  custAccountId?: string; partyId?: string;
}
interface NewLine { key: string; itemNumber: string; description?: string; uom?: string; qty: number; unitPrice: number; costUnit?: number; taxCode?: string; taxPct?: number; taxAmount?: number; lot?: string; lots?: string[]; qoh?: number; ohLoading?: boolean; status?: string; statusCode?: string;
  // Edit mode: original DOO source line keys (preserved so a change order maps
  // onto the existing fulfillment line) + a cancel marker (there is no DELETE).
  srcLineId?: string; srcLineNumber?: string | number; srcScheduleNumber?: string | number; existing?: boolean; canceled?: boolean;
  // Fusion system ids captured on edit load (to target PATCH/DELETE on the line).
  fulfillLineId?: string | number; lineHref?: string; origQty?: number; origUnitPrice?: number;
  error?: string }

const INV_ORGS_URL = `${FUSION_BASE}/inventoryOrganizations?onlyData=true&limit=500`;

// Business units (+ currency) from payablesOptions, deduped by name.
const usePayablesBUs = (): any[] => {
  const [bUnits, setBUnits] = useState<any[]>([]);
  useEffect(() => {
    fetch(`${FUSION_BASE}/payablesOptions?onlyData=true&limit=500&fields=businessUnitId,businessUnitName,paymentCurrency,ledgerCurrency`, { headers: FUSION_HDRS })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { const seen = new Set<string>(); setBUnits((d.items ?? []).filter((b: any) => { const n = b.businessUnitName; if (!n || seen.has(n)) return false; seen.add(n); return true; })); })
      .catch(() => { /* manual */ });
  }, []);
  return bUnits;
};
// All inventory organizations (full rows so a BU field is available for filtering).
const useInvOrgs = (): any[] => {
  const [orgRows, setOrgRows] = useState<any[]>([]);
  useEffect(() => {
    fetch(INV_ORGS_URL, { headers: FUSION_HDRS })
      .then(r => r.ok ? r.json() : Promise.reject()).then(d => setOrgRows(d.items ?? [])).catch(() => { /* manual */ });
  }, []);
  return orgRows;
};
// Warehouse options filtered to the selected BU (falls back to all if no BU link on the org rows).
const orgOptionsForBU = (orgs: any[], buRow: any) => {
  const id = buRow?.businessUnitId; const name = buRow?.businessUnitName;
  const match = orgs.filter(o => {
    if (id == null && !name) return true;
    const oid = pf(o, ['BusinessUnitId', 'ManagementBusinessUnitId', 'ProfitCenterBusinessUnitId']);
    const oname = pf(o, ['BusinessUnitName', 'ManagementBusinessUnitName', 'ProfitCenterBusinessUnitName']);
    return (oid != null && String(oid) === String(id)) || (!!oname && !!name && oname === name);
  });
  return (match.length ? match : orgs).map(o => ({ value: o.OrganizationCode, label: `${o.OrganizationCode}${o.OrganizationName ? ' — ' + o.OrganizationName : ''}` }));
};
const WarehouseLabel: React.FC = () => (
  <Space size={4}>Warehouse
    <Tooltip title={<span style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}><b>GET</b> {INV_ORGS_URL}<br />filtered by the selected BU (BusinessUnitId / Name on the org)</span>}>
      <ApiOutlined style={{ color: REDWOOD.info }} />
    </Tooltip>
  </Space>
);

// Reusable card-like form section with an icon header.
const OrderSection: React.FC<{ icon: React.ReactNode; title: string; color: string; children: React.ReactNode }> = ({ icon, title, color, children }) => (
  <div style={{ border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 10, padding: '12px 16px 2px', marginBottom: 12, background: REDWOOD.surface }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ width: 24, height: 24, borderRadius: 7, background: color + '18', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{icon}</span>
      <Text strong style={{ fontSize: 12, color: REDWOOD.neutral900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</Text>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${color}33, transparent)` }} />
    </div>
    <Row gutter={14}>{children}</Row>
  </div>
);
// A read-only labelled value (for the Address / totals panes).
const ROField: React.FC<{ label: string; value?: React.ReactNode; span?: number; mono?: boolean }> = ({ label, value, span = 6, mono }) => (
  <Col xs={12} md={span as any}>
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: REDWOOD.neutral900, fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-word', minHeight: 20 }}>{value ?? '—'}</div>
    </div>
  </Col>
);
// Vertical section (a full-height column card) — fields stack inside it.
const VSection: React.FC<{ icon: React.ReactNode; title: string; color: string; children: React.ReactNode }> = ({ icon, title, color, children }) => (
  <div style={{ border: `1px solid ${REDWOOD.neutral200}`, borderTop: `3px solid ${color}`, borderRadius: 10, padding: '12px 14px 4px', background: REDWOOD.surface, height: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ width: 24, height: 24, borderRadius: 7, background: color + '18', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{icon}</span>
      <Text strong style={{ fontSize: 12, color: REDWOOD.neutral900, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</Text>
    </div>
    {children}
  </div>
);
// A compact label:value row for the Totals column.
const TotalLine: React.FC<{ label: string; value: React.ReactNode; strong?: boolean; color?: string }> = ({ label, value, strong, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '5px 0', borderBottom: `1px dashed ${REDWOOD.neutral200}` }}>
    <span style={{ fontSize: 12, color: REDWOOD.neutral600, fontWeight: strong ? 700 : 400 }}>{label}</span>
    <span style={{ fontSize: strong ? 15 : 13, fontWeight: strong ? 800 : 600, color: color ?? REDWOOD.neutral900, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
  </div>
);

// itemCosts lives on the "latest" resource version; org is inside ValuationUnit
// "COSTORG-INVORG-SUBINV-LOT" (not directly filterable), so match client-side.
const LATEST_URL = 'https://iacney-test.fa.ocs.oraclecloud.com/fscmRestApi/resources/latest';
const COST_FIELDS = ['TotalUnitCost', 'UnitCost', 'ItemCost', 'UnitAverageCost', 'AverageUnitCost'];
const QTY_FIELDS = ['Quantity', 'OnhandQuantity', 'OnHandQuantity', 'TotalQuantity', 'ItemQuantity', 'CostQuantity'];
const parseVU = (vu?: string) => { const p = String(vu ?? '').split('-'); return { costOrg: p[0], invOrg: p[1], subinv: p[2], lot: p[3] }; };
const rowOrgMatches = (row: any, org?: string) => { if (!org) return true; const p = parseVU(row.ValuationUnit); return p.invOrg === org || p.costOrg === org; };
// Fusion child-resource links come back as absolute URLs; in the browser they must
// go through the /fusion-api dev proxy, so rewrite the host+version prefix.
const fusionHref = (href: string) => _isElectron ? href : href.replace(/^https?:\/\/[^/]+\/fscmRestApi\/resources\/[^/]+/, '/fusion-api');
const onhQtyOf = (x: any) => num(pf(x, ['PrimaryQuantity', 'QuantityOnhand', 'OnhandQuantity', 'Quantity']));

// Shared Fusion lookups (used by the picker modal and inline new-line search).
async function fetchItemCostRows(item: string, org?: string) {
  const r = await fetch(`${LATEST_URL}/itemCosts?q=${encodeURIComponent(`ItemNumber=${item}`)}&onlyData=true&limit=500`, { headers: FUSION_HDRS });
  const d = await r.json();
  return ((d.items ?? []) as any[]).filter(x => rowOrgMatches(x, org));
}
async function fetchOnhand(item: string, invOrg: string, subinv?: string, lot?: string): Promise<{ qty: number; lots: string[] }> {
  let q = `OrganizationCode=${invOrg};ItemNumber=${item}`; if (subinv) q += `;SubinventoryCode=${subinv}`;
  const r = await fetch(`${FUSION_BASE}/inventoryOnhandBalances?q=${encodeURIComponent(q)}&limit=500`, { headers: FUSION_HDRS });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  const lotRows: any[] = [];
  for (const b of (d.items ?? [])) {
    if (pf(b, ['LotNumber']) != null) { lotRows.push(b); continue; }
    const child = (b.links ?? []).find((l: any) => l.rel === 'child' && /lot/i.test(l.href || l.name || ''));
    if (child?.href) {
      try { const cr = await fetch(`${fusionHref(child.href)}${child.href.includes('?') ? '&' : '?'}limit=500`, { headers: FUSION_HDRS }); const cd = await cr.json(); (cd.items ?? []).forEach((x: any) => lotRows.push(x)); }
      catch { /* skip this balance's lot detail */ }
    } else { lotRows.push(b); }
  }
  const lots = Array.from(new Set(lotRows.map(x => pf(x, ['LotNumber'])).filter(Boolean))) as string[];
  const matched = lot ? lotRows.filter(x => String(pf(x, ['LotNumber']) ?? '') === String(lot)) : lotRows;
  const qty = (matched.length ? matched : lotRows).reduce((s, x) => s + onhQtyOf(x), 0);
  return { qty, lots };
}
// Type-ahead item search by code OR description (merged, deduped by ItemNumber).
async function searchItems(text: string, org?: string): Promise<any[]> {
  const t = text.trim(); if (!t) return [];
  const esc = t.replace(/'/g, "''");
  const one = async (q: string) => { try { const r = await fetch(`${FUSION_BASE}/itemsV2?q=${encodeURIComponent(q)}&limit=25&onlyData=true`, { headers: FUSION_HDRS }); const d = await r.json(); return (d.items ?? []) as any[]; } catch { return []; } };
  const orgQ = org ? `;OrganizationCode=${org}` : '';
  const [a, b] = await Promise.all([one(`ItemNumber LIKE '${esc}%'${orgQ}`), one(`ItemDescription LIKE '%${esc}%'${orgQ}`)]);
  const map = new Map<string, any>();
  [...a, ...b].forEach(x => { if (!map.has(x.ItemNumber)) map.set(x.ItemNumber, x); });
  return Array.from(map.values()).slice(0, 40);
}

// Item picker (itemsV2) — single-line editable grid: cost, on-hand, qty, price,
// total, margin, tax and net; select rows and add them as order lines.
const ItemSearchModal: React.FC<{ open: boolean; org?: string; subinv?: string; taxOptions?: { value: string; label: string; pct: number }[]; onClose: () => void; onAdd: (items: any[]) => void }> = ({ open, org, subinv, taxOptions = [], onClose, onAdd }) => {
  const [byDesc, setByDesc] = useState(false);
  const [term, setTerm] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sel, setSel] = useState<React.Key[]>([]);
  const [costs, setCosts] = useState<Record<string, { cost?: number; ccy?: string; onhand?: number; n: number; rows: any[] }>>({});
  const [costLoading, setCostLoading] = useState(false);
  const [draft, setDraft] = useState<Record<string, { qty: number; price: number; taxCode?: string; taxPct?: number; tax: number }>>({});
  const [onh, setOnh] = useState<Record<string, { loading?: boolean; qty?: number; lots?: string[]; err?: string }>>({});
  const [apiOpen, setApiOpen] = useState(false);
  useEffect(() => { if (open) { setTerm(''); setRows([]); setSel([]); setError(''); setCosts({}); setDraft({}); setOnh({}); } }, [open]);

  const url = useMemo(() => {
    const t = term.trim(); if (!t) return '';
    const field = byDesc ? 'ItemDescription' : 'ItemNumber';
    const pattern = byDesc ? `%${t}%` : `${t}%`;
    let q = `${field} LIKE '${pattern}'`;
    if (org) q += `;OrganizationCode=${org}`;
    return `${FUSION_BASE}/itemsV2?q=${encodeURIComponent(q)}&limit=100&onlyData=true`;
  }, [term, byDesc, org]);

  const loadCosts = useCallback(async (items: any[]) => {
    if (!items.length) return;
    setCostLoading(true);
    const map: Record<string, { cost?: number; ccy?: string; onhand?: number; n: number; rows: any[] }> = {};
    await mapLimit(items, 5, async (it) => {
      const item = it.ItemNumber;
      try {
        // itemCosts is queryable directly by ItemNumber; org lives in ValuationUnit.
        const r = await fetch(`${LATEST_URL}/itemCosts?q=${encodeURIComponent(`ItemNumber=${item}`)}&onlyData=true&limit=500`, { headers: FUSION_HDRS });
        const d = await r.json();
        const matched = (d.items ?? []).filter((x: any) => rowOrgMatches(x, org));
        const row = matched[0];
        map[item] = { cost: row ? num(pf(row, COST_FIELDS)) : undefined, ccy: row?.CurrencyCode, onhand: row ? num(pf(row, ['QuantityOnhand', ...QTY_FIELDS])) : undefined, n: matched.length, rows: matched };
      } catch { map[item] = { n: 0, rows: [] }; }
    });
    setCosts(map); setCostLoading(false);
  }, [org]);

  const search = useCallback(async () => {
    if (!url) { message.warning('Enter a search term'); return; }
    setLoading(true); setError(''); setSel([]); setCosts({}); setDraft({}); setOnh({});
    try { const items = await fetchAllPages(url); setRows(items); loadCosts(items); }
    catch (e: any) { setError(e.message); setRows([]); }
    finally { setLoading(false); }
  }, [url, loadCosts]);

  const dget = (item: string) => draft[item] ?? { qty: 0, price: num(costs[item]?.cost), tax: 0, taxCode: undefined as string | undefined, taxPct: undefined as number | undefined };
  const dset = (item: string, patch: Partial<{ qty: number; price: number; taxCode?: string; taxPct?: number; tax: number }>) =>
    // Re-derive tax from the chosen tax_code_per whenever qty/price/tax code change.
    setDraft(p => { const base = p[item] ?? { qty: 0, price: num(costs[item]?.cost), tax: 0 }; const m = { ...base, ...patch }; if (m.taxPct != null) m.tax = round2(m.qty * m.price * m.taxPct / 100); return { ...p, [item]: m }; });
  const vuOf = (item: string) => parseVU(costs[item]?.rows?.[0]?.ValuationUnit);
  const costQtyOf = (item: string) => num(pf(costs[item]?.rows?.[0], QTY_FIELDS));
  const costOnhandOf = (item: string) => costs[item]?.onhand;
  const num2 = (v: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const onhQty = (x: any) => num(pf(x, ['PrimaryQuantity', 'QuantityOnhand', 'OnhandQuantity', 'Quantity']));

  // On-hand: query the org+item (+subinventory) balances, follow each balance's
  // lot child link to read per-lot quantities, then match the cost row's lot.
  const checkOnhand = async (item: string, invOrg?: string, subinv?: string, lot?: string) => {
    if (!invOrg) { message.warning('No inventory org on the cost row'); return; }
    setOnh(p => ({ ...p, [item]: { loading: true } }));
    try {
      let q = `OrganizationCode=${invOrg};ItemNumber=${item}`; if (subinv) q += `;SubinventoryCode=${subinv}`;
      const r = await fetch(`${FUSION_BASE}/inventoryOnhandBalances?q=${encodeURIComponent(q)}&limit=500`, { headers: FUSION_HDRS });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const balances: any[] = d.items ?? [];
      // Collect lot-level rows: use LotNumber when present on the balance itself,
      // otherwise follow the balance's lot child link to fetch per-lot detail.
      const lotRows: any[] = [];
      for (const b of balances) {
        if (pf(b, ['LotNumber']) != null) { lotRows.push(b); continue; }
        const child = (b.links ?? []).find((l: any) => l.rel === 'child' && /lot/i.test(l.href || l.name || ''));
        if (child?.href) {
          try {
            const cr = await fetch(`${fusionHref(child.href)}${child.href.includes('?') ? '&' : '?'}limit=500`, { headers: FUSION_HDRS });
            const cd = await cr.json();
            (cd.items ?? []).forEach((x: any) => lotRows.push(x));
          } catch { /* skip this balance's lot detail */ }
        } else { lotRows.push(b); }
      }
      const lots = Array.from(new Set(lotRows.map(x => pf(x, ['LotNumber'])).filter(Boolean))) as string[];
      const matched = lot ? lotRows.filter(x => String(pf(x, ['LotNumber']) ?? '') === String(lot)) : lotRows;
      const qty = (matched.length ? matched : lotRows).reduce((s, x) => s + onhQty(x), 0);
      setOnh(p => ({ ...p, [item]: { qty, lots } }));
    } catch (e: any) { setOnh(p => ({ ...p, [item]: { err: e.message } })); }
  };

  // Changing Ord Qty auto-selects the row so it will be added on "Add".
  const maxQohOf = (item: string) => onh[item]?.qty ?? costs[item]?.onhand;
  const setQty = (item: string, v: number) => {
    const cap = maxQohOf(item);
    if (cap != null && v > cap) { v = cap; message.warning(`Cannot order more than on-hand (${fmtQty(cap)})`); }
    dset(item, { qty: v }); if (v > 0) setSel(s => s.includes(item) ? s : [...s, item]);
  };

  const cols: ColumnsType<any> = [
    { title: 'Item', dataIndex: 'ItemNumber', width: 140, fixed: 'left', render: v => <Text strong style={{ color: REDWOOD.info, fontSize: 12 }}>{v}</Text> },
    { title: 'Description', dataIndex: 'ItemDescription', width: 200, ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'UOM', width: 60, render: (_, r) => pf(r, ['PrimaryUOMValue', 'PrimaryUOMCode', 'PrimaryUnitOfMeasure', 'UOMCode']) ?? '—' },
    { title: 'Lot', width: 120, ellipsis: true, render: (_, r) => { const l = vuOf(r.ItemNumber).lot; return l ? <Tag color="geekblue" style={{ fontSize: 10 }}>{l}</Tag> : '—'; } },
    { title: 'Item Cost', width: 95, align: 'right', render: (_, r) => { const c = costs[r.ItemNumber]; if (costLoading && !c) return <Spin size="small" />; return (c?.cost == null) ? <Text type="secondary" style={{ fontSize: 11 }}>—</Text> : <Text strong style={{ fontSize: 11.5, color: REDWOOD.primary, fontVariantNumeric: 'tabular-nums' }}>{num2(c.cost)}</Text>; } },
    { title: 'O/H (Cost)', width: 82, align: 'right', render: (_, r) => { const c = costs[r.ItemNumber]; if (costLoading && !c) return <Spin size="small" />; return (c?.onhand == null) ? <Text type="secondary" style={{ fontSize: 11 }}>—</Text> : <Text style={{ fontSize: 11, color: REDWOOD.info, fontVariantNumeric: 'tabular-nums' }}>{fmtQty(c.onhand)}</Text>; } },
    { title: 'On-hand', width: 150, render: (_, r) => {
        const item = r.ItemNumber; const p = vuOf(item); const st = onh[item]; const base = costOnhandOf(item);
        const invOrg = org || p.invOrg; const sub = subinv || p.subinv; // prefer the header warehouse/subinventory
        return <Space size={4}>
          <Tooltip title={<span>On-hand — org <b>{invOrg}</b>, item <b>{item}</b>{sub ? <>, subinv <b>{sub}</b></> : null}{p.lot ? <>, lot <b>{p.lot}</b></> : null}</span>}>
            <Button size="small" type="text" icon={<DatabaseOutlined />} style={{ color: REDWOOD.info }} loading={st?.loading} onClick={() => checkOnhand(item, invOrg, sub, p.lot)} /></Tooltip>
          {st?.qty != null && <>
            <Tooltip title={st.lots?.length ? <span>Lots: {st.lots.join(', ')}</span> : 'No lot detail'}><Text style={{ fontSize: 11 }}>{fmtQty(st.qty)}</Text></Tooltip>
            {base != null && (Math.abs(st.qty - base) < 0.001 ? <CheckCircleTwoTone twoToneColor={REDWOOD.success} /> : <CloseCircleTwoTone twoToneColor={REDWOOD.error} />)}
          </>}
          {st?.err && <Tooltip title={st.err}><Text type="danger" style={{ fontSize: 10 }}>err</Text></Tooltip>}
        </Space>;
      } },
    { title: 'Ord Qty', width: 88, render: (_, r) => { const cap = maxQohOf(r.ItemNumber); return <InputNumber size="small" min={0} max={cap != null ? cap : undefined} value={dget(r.ItemNumber).qty} onChange={v => setQty(r.ItemNumber, Number(v) || 0)} style={{ width: 76 }} />; } },
    { title: 'Unit Price', width: 98, render: (_, r) => <InputNumber size="small" min={0} value={dget(r.ItemNumber).price} onChange={v => dset(r.ItemNumber, { price: Number(v) || 0 })} style={{ width: 86 }} /> },
    { title: 'Total', width: 98, align: 'right', render: (_, r) => { const d = dget(r.ItemNumber); return <Text style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}>{num2(d.qty * d.price)}</Text>; } },
    { title: 'Margin', width: 98, align: 'right', render: (_, r) => { const d = dget(r.ItemNumber); const m = (d.price - num(costs[r.ItemNumber]?.cost)) * d.qty; return <Text strong style={{ fontSize: 11.5, color: m < 0 ? REDWOOD.error : REDWOOD.success, fontVariantNumeric: 'tabular-nums' }}>{num2(m)}</Text>; } },
    { title: 'Margin %', width: 78, align: 'right', render: (_, r) => { const d = dget(r.ItemNumber); const t = d.qty * d.price; const m = (d.price - num(costs[r.ItemNumber]?.cost)) * d.qty; const pct = t ? (m / t) * 100 : 0; return <Text style={{ fontSize: 11, color: pct < 0 ? REDWOOD.error : REDWOOD.success }}>{t ? pct.toFixed(1) + '%' : '—'}</Text>; } },
    { title: 'Tax Code', width: 130, render: (_, r) => <Select size="small" showSearch allowClear style={{ width: 118 }} popupMatchSelectWidth={false} value={dget(r.ItemNumber).taxCode || undefined} placeholder="—"
        options={taxOptions} optionFilterProp="value" notFoundContent={taxOptions.length ? undefined : 'No tax codes'}
        onChange={val => { const opt = taxOptions.find(o => o.value === val); dset(r.ItemNumber, { taxCode: val, taxPct: opt ? opt.pct : undefined }); }} /> },
    { title: 'Tax Amt', width: 108, align: 'right', render: (_, r) => { const d = dget(r.ItemNumber); return <Space size={4}>{d.taxPct != null && <Tag color="gold" style={{ margin: 0, fontSize: 10 }}>{d.taxPct}%</Tag>}<Text style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}>{num2(num(d.tax))}</Text></Space>; } },
    { title: 'Net', width: 108, align: 'right', render: (_, r) => { const d = dget(r.ItemNumber); return <Text strong style={{ fontSize: 12, color: REDWOOD.primary, fontVariantNumeric: 'tabular-nums' }}>{num2(d.qty * d.price + num(d.tax))}</Text>; } },
    { title: 'Cost Org', width: 105, render: (_, r) => <Text style={{ fontSize: 11 }}>{vuOf(r.ItemNumber).costOrg || '—'}</Text> },
    { title: 'Inv Org', width: 95, render: (_, r) => <Text style={{ fontSize: 11 }}>{vuOf(r.ItemNumber).invOrg || '—'}</Text> },
    { title: 'Subinv', width: 85, render: (_, r) => { const s = vuOf(r.ItemNumber).subinv; return s ? <Tag color="cyan" style={{ fontSize: 10 }}>{s}</Tag> : '—'; } },
  ];

  const searchUrlPretty = url ? decodeURIComponent(url) : `${FUSION_BASE}/itemsV2?q=ItemNumber LIKE 'x%';OrganizationCode=${org ?? '<org>'}`;

  return (
    <Modal open={open} onCancel={onClose} maskClosable={false} width={1260} style={{ top: 16 }}
      title={<Space><SearchOutlined style={{ color: REDWOOD.primary }} /> Search Items{org ? <Tag>{org}</Tag> : null}
        <Tooltip title="Web services used"><Button size="small" type="text" icon={<ApiOutlined />} style={{ color: REDWOOD.info }} onClick={() => setApiOpen(true)} /></Tooltip></Space>}
      footer={<Space>
        <Text type="secondary" style={{ marginRight: 'auto', fontSize: 12 }}>{sel.length} selected</Text>
        <Button onClick={onClose}>Close</Button>
        <Button type="primary" disabled={sel.length === 0} icon={<PlusOutlined />} style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
          onClick={() => {
            const picked = rows.filter(r => sel.includes(r.ItemNumber)).map(r => { const d = dget(r.ItemNumber); const p = vuOf(r.ItemNumber); return { ...r, _cost: costs[r.ItemNumber]?.cost, _qty: d.qty, _price: d.price, _taxCode: d.taxCode, _taxPct: d.taxPct, _tax: d.tax, _lot: p.lot, _lots: onh[r.ItemNumber]?.lots, _costOrg: p.costOrg, _invOrg: p.invOrg, _subinv: p.subinv, _qoh: maxQohOf(r.ItemNumber) }; });
            onAdd(picked);
            message.success(`Added ${picked.length} line(s) — pick more or Close`);
            setSel([]); // keep the dialog open so more items can be added
          }}>Add {sel.length || ''} Item(s)</Button>
      </Space>}>
      <Space.Compact style={{ width: '100%', marginBottom: 10 }}>
        <Select value={byDesc ? 'desc' : 'num'} style={{ width: 130 }} onChange={v => setByDesc(v === 'desc')}
          options={[{ value: 'num', label: 'Item Number' }, { value: 'desc', label: 'Description' }]} />
        <Input placeholder={byDesc ? 'e.g. TONER' : 'e.g. SM-A057'} value={term} onChange={e => setTerm(e.target.value)} onPressEnter={search} allowClear />
        <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={search} style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>Search</Button>
      </Space.Compact>
      {error ? <div style={{ color: REDWOOD.error, fontSize: 12, marginBottom: 8 }}><InfoCircleOutlined style={{ marginRight: 6 }} />{error}</div> : null}
      <Table size="small" columns={cols} dataSource={rows} rowKey="ItemNumber" loading={loading}
        rowSelection={{ selectedRowKeys: sel, onChange: setSel }}
        pagination={rows.length > 12 ? { pageSize: 12, size: 'small' } : false} scroll={{ x: 1980, y: 360 }}
        locale={{ emptyText: 'Search for items to add' }} />

      <Modal open={apiOpen} onCancel={() => setApiOpen(false)} maskClosable={false} width={880}
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /> Web services used</Space>}
        footer={<Button onClick={() => setApiOpen(false)}>Close</Button>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { lbl: 'Item search (itemsV2)', u: searchUrlPretty },
            { lbl: 'Item cost — direct by ItemNumber, org via ValuationUnit (itemCosts)', u: `${LATEST_URL}/itemCosts?q=ItemNumber=<item>` },
            { lbl: 'On-hand by subinventory (inventoryOnhandBalances)', u: `${FUSION_BASE}/inventoryOnhandBalances?q=OrganizationCode=${org ?? '<org>'};ItemNumber=<item>;SubinventoryCode=<subinv>` },
            { lbl: 'On-hand lot detail — followed from each balance’s child link', u: '<inventoryOnhandBalance href>/child/... (lot rows)' },
            { lbl: 'Tax codes by business unit (ORDS FUSION_TAX_CODES)', u: `${TAXCODES_URL}?P_BUSINESS_UNIT=<business unit>` },
          ].map(({ lbl, u }) => (
            <div key={lbl}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase' }}>{lbl}</Text>
                <Button size="small" type="text" icon={<CopyOutlined />} style={{ marginLeft: 'auto' }} onClick={() => { navigator.clipboard.writeText(u); message.success('Copied'); }}>Copy</Button>
              </div>
              <div style={{ marginTop: 4, padding: '8px 12px', borderRadius: 6, background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.neutral200}`, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', color: REDWOOD.info }}>
                <Tag color="blue">GET</Tag>{u}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </Modal>
  );
};

// Register New Order dialog (collects the header, then opens the creation tab).
const RegisterOrderModal: React.FC<{ open: boolean; onClose: () => void; onProceed: (h: OrderHeader) => void }> = ({ open, onClose, onProceed }) => {
  const [form] = Form.useForm();
  const bUnits = usePayablesBUs();
  const orgRows = useInvOrgs();
  const customers = useCustomers();
  const payTermOpts = useOrdsOptions(PAYMENT_TERMS_URL, PAY_TERM_KEYS, PAYMENT_TERMS);
  const salesRepOpts = useOrdsOptions(SALESREPS_URL, SALESREP_KEYS);
  const custOptions = useMemo(() => custOptionList(customers), [customers]);
  const [subs, setSubs] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ orderType: 'LSO01', rate: 1, orderDate: dayjs() });
    setSubs([]);
  }, [open, form]);

  const onCustomer = (name: string, opt: any) => {
    const row = opt?._c ?? customers.find(c => custName(c) === name);
    if (row) form.setFieldsValue(customerFill(row));
  };

  const buName = Form.useWatch('businessUnit', form);
  const buRow = useMemo(() => bUnits.find(b => b.businessUnitName === buName), [bUnits, buName]);
  const whOptions = useMemo(() => orgOptionsForBU(orgRows, buRow), [orgRows, buRow]);

  const onBU = (name: string) => {
    const row = bUnits.find(b => b.businessUnitName === name);
    const cur = pf(row, ['paymentCurrency', 'ledgerCurrency', 'invoiceCurrency']);
    form.setFieldsValue({ baseCurrency: cur, txnCurrency: form.getFieldValue('txnCurrency') || cur, warehouse: undefined, subinventory: undefined });
    setSubs([]);
  };
  const onWarehouse = (code: string) => {
    form.setFieldsValue({ subinventory: undefined }); setSubs([]);
    fetch(`${FUSION_BASE}/subinventories?q=OrganizationCode=${encodeURIComponent(code)}&onlyData=true&limit=500`, { headers: FUSION_HDRS })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setSubs(Array.from(new Set((d.items ?? []).map((s: any) => s.SecondaryInventoryName).filter(Boolean))).sort() as string[])).catch(() => setSubs([]));
  };

  const submit = () => form.validateFields().then(() => {
    // getFieldsValue(true) keeps values set via setFieldsValue that have no
    // Form.Item (customer ids, sites, addresses); add the BU id from its row.
    const all = form.getFieldsValue(true);
    const bu = bUnits.find(b => b.businessUnitName === all.businessUnit);
    onProceed({ ...all, businessUnitId: bu?.businessUnitId });
    onClose();
  }).catch(() => { /* show errors */ });

  const req = (msg: string) => [{ required: true, message: msg }];
  const Section: React.FC<{ icon: React.ReactNode; title: string; color: string; children: React.ReactNode }> = ({ icon, title, color, children }) => (
    <div style={{ border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 10, padding: '12px 16px 2px', marginBottom: 14, background: REDWOOD.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ width: 26, height: 26, borderRadius: 7, background: color + '18', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{icon}</span>
        <Text strong style={{ fontSize: 12.5, color: REDWOOD.neutral900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</Text>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${color}33, transparent)` }} />
      </div>
      <Row gutter={14}>{children}</Row>
    </div>
  );
  return (
    <Modal open={open} onCancel={onClose} maskClosable={false} width={960} styles={{ body: { background: REDWOOD.neutral100, padding: 18, maxHeight: '76vh', overflowY: 'auto' } }}
      title={<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg, ${REDWOOD.primary}, ${REDWOOD.primary}bb)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: `0 3px 10px ${REDWOOD.primary}40` }}><PlusOutlined /></span>
        <div><div style={{ fontSize: 16, fontWeight: 700, color: REDWOOD.neutral900 }}>Register New Order</div>
          <div style={{ fontSize: 12, color: REDWOOD.neutral600, fontWeight: 400 }}>Set the order header, then proceed to add lines</div></div>
      </div>}
      footer={<Space><Button onClick={onClose}>Cancel</Button>
        <Button type="primary" icon={<ExportOutlined />} style={{ background: REDWOOD.info, borderColor: REDWOOD.info }} onClick={submit}>Proceed to Lines</Button></Space>}>
      <Form form={form} layout="vertical" size="small" requiredMark colon={false}>
        <Section icon={<BankOutlined />} title="Order Details" color={REDWOOD.primary}>
          <Col xs={24} md={12}><Form.Item label="Business Unit" name="businessUnit" rules={req('Select business unit')} style={{ marginBottom: 12 }}>
            <Select showSearch placeholder="Select" onChange={onBU} optionFilterProp="label"
              options={bUnits.map(b => ({ value: b.businessUnitName, label: `${b.businessUnitName}${b.paymentCurrency ? ` — ${b.paymentCurrency}` : ''}` }))} /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item label="BU Code" name="buCode" style={{ marginBottom: 12 }}><Input placeholder="—" readOnly /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item label="Base Currency" name="baseCurrency" rules={req('Base currency')} style={{ marginBottom: 12 }}><Input placeholder="e.g. AED" readOnly /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item label="Transaction Currency" name="txnCurrency" rules={req('Currency')} style={{ marginBottom: 12 }}>
            <Select showSearch placeholder="Currency" options={CURRENCIES.map(c => ({ value: c, label: c }))} /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item label="Rate" name="rate" style={{ marginBottom: 12 }}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item label="Order Type" name="orderType" rules={req('Order type')} style={{ marginBottom: 12 }}><Input /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item label="Order Date" name="orderDate" rules={req('Order date')} style={{ marginBottom: 12 }}><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
        </Section>

        <Section icon={<ProfileOutlined />} title="Customer" color={REDWOOD.info}>
          <Col xs={24} md={12}><Form.Item label="Customer Name" name="customerName" rules={req('Customer')} style={{ marginBottom: 12 }}>
            <Select showSearch placeholder="Search customer" onChange={onCustomer} optionFilterProp="label" options={custOptions} notFoundContent={customers.length ? 'No match' : 'Loading…'} /></Form.Item></Col>
          <Col xs={8} md={4}><Form.Item label="Account Number" name="accountNumber" style={{ marginBottom: 12 }}><Input placeholder="—" readOnly /></Form.Item></Col>
          <Col xs={8} md={4}><Form.Item label="Bill To Site" name="billToSite" style={{ marginBottom: 12 }}><Input placeholder="—" readOnly /></Form.Item></Col>
          <Col xs={8} md={4}><Form.Item label="Ship To Site" name="shipToSite" style={{ marginBottom: 12 }}><Input placeholder="—" readOnly /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item label="Bill To Address" name="billToAddress" style={{ marginBottom: 12 }}><Input.TextArea rows={2} readOnly /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item label="Ship To Address" name="shipToAddress" style={{ marginBottom: 12 }}><Input.TextArea rows={2} readOnly /></Form.Item></Col>
        </Section>

        <Section icon={<ShoppingOutlined />} title="Terms & Fulfillment" color={REDWOOD.purple}>
          <Col xs={12} md={6}><Form.Item label="Payment Terms" name="paymentTerms" rules={req('Payment terms')} style={{ marginBottom: 12 }}>
            <Select showSearch placeholder="Terms" optionFilterProp="label" options={payTermOpts} /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item label="Sales Rep Name" name="salesRep" style={{ marginBottom: 12 }}>
            <Select showSearch allowClear placeholder="Salesperson" optionFilterProp="label" options={salesRepOpts} notFoundContent={salesRepOpts.length ? 'No match' : 'Loading…'} /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item label={<WarehouseLabel />} name="warehouse" rules={req('Warehouse')} style={{ marginBottom: 12 }}>
            <Select showSearch placeholder={buName ? 'Organization' : 'Select BU first'} onChange={onWarehouse} options={whOptions} optionFilterProp="label" /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item label="Sub Inventory" name="subinventory" style={{ marginBottom: 12 }}>
            <Select showSearch placeholder="Subinventory" notFoundContent="Pick a warehouse" options={subs.map(s => ({ value: s, label: s }))} /></Form.Item></Col>
          <Col xs={24}><Form.Item label="Remarks" name="remarks" style={{ marginBottom: 12 }}><Input.TextArea rows={2} placeholder="Optional notes…" /></Form.Item></Col>
        </Section>
      </Form>
    </Modal>
  );
};

// New order creation tab — header summary + editable lines + save.
// ── Sales-order draft: Save/Load the full on-screen state as JSON ────────────
// Captures the header plus every line (item, qty, price, cost, lots, on-hand,
// tax) so a draft round-trips exactly. Tolerant loader accepts a bare
// { header, lines } too.
const SO_DRAFT_TYPE = 'reacterp.salesOrderDraft';
interface SoDraft { header: OrderHeader; lines: NewLine[]; discAmt?: number; expAmt?: number }
const downloadJson = (obj: any, filename: string) => {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const readJsonFile = (file: File): Promise<any> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => { try { resolve(JSON.parse(String(reader.result))); } catch { reject(new Error('Not valid JSON')); } };
  reader.onerror = () => reject(new Error('Could not read file'));
  reader.readAsText(file);
});
// Save the create-order response (success or failure) to a local folder instead
// of showing the raw JSON on screen. Electron-only; a no-op in the browser.
const ORDER_LOG_FOLDER = 'c:/fusionclient/orderloading';
const saveOrderLog = async (filename: string, content: string): Promise<string | null> => {
  const api = (window as any).electronAPI;
  if (!api?.saveFileToFolder) return null;
  try {
    const bytes = new TextEncoder().encode(content);
    const res = await api.saveFileToFolder(bytes, ORDER_LOG_FOLDER, filename);
    return res?.success ? (res.filePath ?? `${ORDER_LOG_FOLDER}/${filename}`) : null;
  } catch { return null; }
};
// Collect individual error lines from a DOO response (title, o:errorDetails,
// or the raw text on a hard failure), split into one message per line.
const collectOrderErrors = (data: any, text: string, includeRawText: boolean): string[] => {
  const out: string[] = [];
  if (data && typeof data === 'object') {
    if (data.title) out.push(String(data.title));
    if (data.detail && data.detail !== data.title) out.push(String(data.detail));
    const details = data['o:errorDetails'] ?? data.errorDetails;
    if (Array.isArray(details)) details.forEach((d: any) => { const m = d?.detail ?? d?.title; if (m) out.push(String(m)); });
  }
  if (!out.length && includeRawText && text) out.push(text.trim());
  return out.flatMap(s => s.split('\n')).map(s => s.trim()).filter(Boolean);
};
// Split error messages into per-line (keyed by NewLine.key) and general buckets,
// matching on "SourceTransactionLineNumber N" (which Fusion embeds in messages).
const mapErrorsToLines = (msgs: string[], lines: NewLine[]): { byKey: Record<string, string[]>; general: string[] } => {
  const byKey: Record<string, string[]> = {};
  const general: string[] = [];
  msgs.forEach(msg => {
    const m = msg.match(/SourceTransactionLineNumber\s+["']?(\w+)/i);
    const lineNo = m ? m[1] : null;
    const target = lineNo ? lines.find((l, i) => String(l.srcLineNumber ?? (i + 1)) === lineNo) : undefined;
    if (target) (byKey[target.key] ??= []).push(msg);
    else general.push(msg);
  });
  return { byKey, general };
};

// Pull a readable error message out of a DOO error response.
const extractOrderError = (data: any, status: number, text: string): string => {
  if (data && typeof data === 'object') {
    const parts: string[] = [];
    if (data.title) parts.push(String(data.title));
    if (data.detail && data.detail !== data.title) parts.push(String(data.detail));
    const details = data['o:errorDetails'] ?? data.errorDetails;
    if (Array.isArray(details)) details.forEach((d: any) => { const m = d?.detail ?? d?.title; if (m) parts.push(String(m)); });
    if (parts.length) return parts.join('\n');
  }
  return (text || '').trim().slice(0, 3000) || `HTTP ${status}`;
};

const toSoDraft = (raw: any): SoDraft | null => {
  if (!raw || typeof raw !== 'object') return null;
  const header = raw.header ?? raw.Header ?? raw.hdr;
  const lines = raw.lines ?? raw.Lines;
  if (!header && !Array.isArray(lines)) return null;
  return {
    header: (header ?? {}) as OrderHeader,
    lines: Array.isArray(lines) ? lines : [],
    discAmt: Number(raw.discAmt) || 0,
    expAmt: Number(raw.expAmt) || 0,
  };
};

const NewOrderTab: React.FC<{ header: OrderHeader; initialDraft?: SoDraft; editOrder?: any }> = ({ header, initialDraft, editOrder }) => {
  const editMode = !!editOrder;
  const [form] = Form.useForm();
  const [hdr, setHdr] = useState<OrderHeader>(initialDraft?.header ?? header);
  const bUnits = usePayablesBUs();
  const orgRows = useInvOrgs();
  const customers = useCustomers();
  const payTermOpts = useOrdsOptions(PAYMENT_TERMS_URL, PAY_TERM_KEYS, PAYMENT_TERMS);
  const salesRepOpts = useOrdsOptions(SALESREPS_URL, SALESREP_KEYS);
  const custOptions = useMemo(() => custOptionList(customers), [customers]);
  const taxCodes = useTaxCodes(hdr.businessUnit);
  const taxOptions = useMemo(() => taxCodes.map(t => ({ value: t.code, label: `${t.code} (${t.pct}%)`, pct: t.pct })), [taxCodes]);
  const [subs, setSubs] = useState<string[]>([]);
  const [lines, setLines] = useState<NewLine[]>(initialDraft?.lines ?? []);
  const [pickOpen, setPickOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [posting, setPosting] = useState(false);
  // Error message from the last save (drives the result dialog's error state).
  const [saveError, setSaveError] = useState<string | null>(null);
  // Per-save error breakdown: general (order-level) messages + a click-to-view modal.
  const [orderErrors, setOrderErrors] = useState<string[]>([]);
  const [errModal, setErrModal] = useState<{ title: string; msg: string } | null>(null);
  // Full raw response of the last save/update (shown via the "Show Response" button).
  const [lastResponse, setLastResponse] = useState<string>('');
  const [respOpen, setRespOpen] = useState(false);
  // Success celebration + created-order tracking (line status refresh).
  const [confetti, setConfetti] = useState<{ id: number; x: number; color: string; delay: number; size: number }[]>([]);
  const [successInfo, setSuccessInfo] = useState<{ orderNumber: string; status: string } | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [createdOrderKey, setCreatedOrderKey] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  // Discovered line EFF (for saving lot number + item cost as additional info).
  const [effMeta, setEffMeta] = useState<EffMeta | null>(null);
  useEffect(() => {
    const url = `${FUSION_BASE}/salesOrdersForOrderHub/describe?polymorphicType=${encodeURIComponent('salesOrdersForOrderHub.lines.additionalInformation:DOO_FULFILL_LINES_ADD_INFO')}`;
    fetch(url, { headers: FUSION_HDRS })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => setEffMeta(parseEffDescribe(d)))
      .catch(() => setEffMeta(null));
  }, []);
  // Build one additionalInformation EFF entry for a line, populating the
  // discovered lot/cost segments. null when no line EFF context is configured.
  const effLineChild = (l: NewLine) => {
    if (!effMeta) return null;
    const seg: Record<string, any> = { ContextCode: effMeta.contextCode };
    if (effMeta.lotSeg && l.lot) seg[effMeta.lotSeg] = l.lot;
    if (effMeta.costSeg && l.costUnit != null) seg[effMeta.costSeg] = l.costUnit;
    if (Object.keys(seg).length <= 1) return null; // only ContextCode → nothing to send
    return { CategoryCode: effMeta.category, [effMeta.voName]: [seg] };
  };
  const [discAmt, setDiscAmt] = useState(initialDraft?.discAmt ?? 0);
  const [expAmt, setExpAmt] = useState(initialDraft?.expAmt ?? 0);
  const [lineSearch, setLineSearch] = useState<Record<string, { loading?: boolean; tooShort?: boolean; opts: any[] }>>({});
  const [lotPick, setLotPick] = useState<{ key: string; item: string; rows: any[]; onh: Record<string, { loading?: boolean; qty?: number }> } | null>(null);
  const [itemModal, setItemModal] = useState<{ key: string; term: string; rows: any[] } | null>(null);
  const [itemFilter, setItemFilter] = useState('');
  const [ohLoading, setOhLoading] = useState(false);
  const searchTimer = useRef<Record<string, any>>({});
  const ccy = hdr.txnCurrency;
  // Order sequence (stands in for the APEX id) — generated once per new-order tab.
  const [orderSeq] = useState(() => Math.floor(Date.now() / 1000) % 100000);
  // Order number: {orderType}{YYYY}{MM}{seq} e.g. LSO01 → LSO012026071428.
  const orderNumber = useMemo(() => {
    const d = hdr.orderDate ? dayjs(hdr.orderDate) : dayjs();
    return `${hdr.orderType || 'SO'}${d.format('YYYYMM')}${orderSeq}`;
  }, [hdr.orderType, hdr.orderDate, orderSeq]);

  useEffect(() => { const h = initialDraft?.header ?? header; form.setFieldsValue(h as any); setHdr(h); /* init once */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Edit mode: pull the existing order's lines and map them into the grid,
  // preserving each line's DOO source keys (for the change-order re-POST).
  useEffect(() => {
    if (!editOrder) return;
    const key = editOrder.OrderKey ?? editOrder.HeaderId;
    if (key != null) setCreatedOrderKey(String(key));
    const href = editOrder?.links?.find((l: any) => l.name === 'lines')?.href
      ?? (key != null ? `${FUSION_BASE}/salesOrdersForOrderHub/${encodeURIComponent(key)}/child/lines` : '');
    if (!href) return;
    (async () => {
      try {
        const rows = await fetchAllPages(href);
        setLines(rows.map((l: any, i: number): NewLine => {
          const q = num(pf(l, ['OrderedQuantity']));
          const price = num(pf(l, ['UnitSellingPrice', 'UnitListPrice']));
          const selfHref = (l.links ?? []).find((x: any) => x.rel === 'self')?.href;
          return {
            key: `edit-${pf(l, ['FulfillLineId']) ?? pf(l, ['SourceTransactionLineId']) ?? i}`,
            itemNumber: String(pf(l, ['ProductNumber', 'Product', 'ItemNumber']) ?? ''),
            description: pf(l, ['ProductDescription', 'ItemDescription']),
            uom: pf(l, ['OrderedUOMCode', 'OrderedUOM']),
            qty: q, unitPrice: price, origQty: q, origUnitPrice: price,
            status: pf(l, ['DisplayStatus', 'Status']),
            statusCode: pf(l, ['StatusCode']),
            srcLineId: pf(l, ['SourceTransactionLineId']) != null ? String(pf(l, ['SourceTransactionLineId'])) : undefined,
            srcLineNumber: pf(l, ['SourceTransactionLineNumber']),
            srcScheduleNumber: pf(l, ['SourceScheduleNumber', 'SourceTransactionScheduleId']),
            fulfillLineId: pf(l, ['FulfillLineId']),
            lineHref: selfHref,
            existing: true,
          };
        }));
      } catch (e: any) { message.error(`Failed to load order lines: ${e.message}`); }
    })();
  }, [editOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save / Load the full draft (header + all lines) as JSON ──
  const saveDraftJson = () => {
    const draft = { __type: SO_DRAFT_TYPE, version: 1, orderNumber, header: hdr, lines, discAmt, expAmt };
    downloadJson(draft, `sales-order-${orderNumber || 'draft'}.json`);
    message.success('Order saved to JSON');
  };
  const loadDraftJson = async (file: File) => {
    try {
      const draft = toSoDraft(await readJsonFile(file));
      if (!draft) { message.error('Not a sales-order JSON (missing header/lines)'); return; }
      setHdr(draft.header);
      form.setFieldsValue(draft.header as any);
      setLines(draft.lines);
      setDiscAmt(draft.discAmt ?? 0);
      setExpAmt(draft.expAmt ?? 0);
      message.success(`Loaded ${draft.lines.length} line(s) from JSON`);
    } catch (e: any) { message.error(`Load failed: ${e.message}`); }
  };

  const syncHdr = () => setHdr(prev => ({ ...prev, ...form.getFieldsValue() }));
  const loadSubs = useCallback((org?: string) => {
    if (!org) { setSubs([]); return; }
    fetch(`${FUSION_BASE}/subinventories?q=OrganizationCode=${encodeURIComponent(org)}&onlyData=true&limit=500`, { headers: FUSION_HDRS })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setSubs(Array.from(new Set((d.items ?? []).map((s: any) => s.SecondaryInventoryName).filter(Boolean))).sort() as string[])).catch(() => setSubs([]));
  }, []);
  useEffect(() => { loadSubs(header.warehouse); }, [header.warehouse, loadSubs]);

  const buName = (Form.useWatch('businessUnit', form) as string) ?? hdr.businessUnit;
  const buRow = useMemo(() => bUnits.find(b => b.businessUnitName === buName), [bUnits, buName]);
  const whOptions = useMemo(() => orgOptionsForBU(orgRows, buRow), [orgRows, buRow]);

  const onBU = (name: string) => {
    const row = bUnits.find(b => b.businessUnitName === name);
    const cur = pf(row, ['paymentCurrency', 'ledgerCurrency', 'invoiceCurrency']);
    form.setFieldsValue({ baseCurrency: cur, txnCurrency: form.getFieldValue('txnCurrency') || cur, warehouse: undefined, subinventory: undefined });
    setSubs([]); setHdr(prev => ({ ...prev, ...form.getFieldsValue(), businessUnitId: row?.businessUnitId }));
  };
  const onWh = (code: string) => { form.setFieldsValue({ subinventory: undefined }); loadSubs(code); syncHdr(); };
  const onCustomer = (name: string, opt: any) => { const row = opt?._c ?? customers.find(c => custName(c) === name); if (row) { const fill = customerFill(row); form.setFieldsValue(fill); setHdr(prev => ({ ...prev, ...fill })); } };

  const addItems = (items: any[]) => {
    setLines(prev => {
      const existing = new Set(prev.map(l => l.itemNumber));
      const add = items.filter(it => !existing.has(it.ItemNumber)).map((it, i) => ({
        key: `${it.ItemNumber}-${prev.length + i}`, itemNumber: it.ItemNumber,
        description: it.ItemDescription, uom: pf(it, ['PrimaryUOMValue', 'PrimaryUOMCode', 'UOMCode']),
        qty: num(it._qty), unitPrice: it._price != null ? num(it._price) : num(it._cost),
        costUnit: num(it._cost), taxCode: it._taxCode, taxPct: it._taxPct != null ? num(it._taxPct) : undefined, taxAmount: num(it._tax),
        lot: it._lot, lots: (it._lots && it._lots.length) ? it._lots : (it._lot ? [it._lot] : []),
        qoh: it._qoh != null ? num(it._qoh) : undefined,
      }));
      return [...prev, ...add];
    });
  };
  const upd = (key: string, patch: Partial<NewLine>) => setLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l));
  // Like upd, but re-derives tax from tax_code_per whenever qty/price/tax code change.
  const updLine = (key: string, patch: Partial<NewLine>) => setLines(prev => prev.map(l => {
    if (l.key !== key) return l;
    const m = { ...l, ...patch };
    if (m.taxPct != null) m.taxAmount = round2(num(m.qty) * num(m.unitPrice) * num(m.taxPct) / 100);
    return m;
  }));
  // In edit mode, "removing" an existing line means cancelling it (a change order
  // must still carry the line with CanceledFlag) — toggle it. Added lines and all
  // create-mode lines are removed outright.
  const del = (key: string) => setLines(prev => {
    const l = prev.find(x => x.key === key);
    if (editMode && l?.existing) return prev.map(x => x.key === key ? { ...x, canceled: !x.canceled } : x);
    return prev.filter(x => x.key !== key);
  });

  // "New Line" — append a blank, editable line the user fills via inline search.
  const addBlankLine = () => setLines(prev => [...prev, { key: `new-${Date.now()}-${prev.length}`, itemNumber: '', qty: 0, unitPrice: 0 }]);

  // Debounced type-ahead for a blank line's item cell (by code or description).
  // Query only after 3 chars; when many rows come back, open a filter popup.
  const MANY_ITEMS = 12;
  const onLineSearch = (key: string, text: string) => {
    clearTimeout(searchTimer.current[key]);
    const t = text.trim();
    if (t.length < 3) { setLineSearch(p => ({ ...p, [key]: { opts: [], tooShort: true } })); return; }
    setLineSearch(p => ({ ...p, [key]: { loading: true, opts: p[key]?.opts ?? [] } }));
    searchTimer.current[key] = setTimeout(async () => {
      const items = await searchItems(t, hdr.warehouse);
      if (items.length > MANY_ITEMS) {
        setLineSearch(p => ({ ...p, [key]: { loading: false, opts: [] } }));
        setItemModal({ key, term: t, rows: items }); setItemFilter('');
      } else {
        setLineSearch(p => ({ ...p, [key]: { loading: false, opts: items } }));
      }
    }, 350);
  };

  // Apply the chosen item + a specific lot to the line: cost, price, on-hand.
  const applyItemToLine = async (key: string, item: any, costRows: any[], lot?: string) => {
    const row = lot ? costRows.find(c => parseVU(c.ValuationUnit).lot === lot) : costRows[0];
    const vu = parseVU(row?.ValuationUnit);
    const cost = row ? num(pf(row, COST_FIELDS)) : undefined;
    const uom = pf(item, ['PrimaryUOMValue', 'PrimaryUOMCode', 'UOMCode']);
    upd(key, { itemNumber: item.ItemNumber, ...(item.ItemDescription ? { description: item.ItemDescription } : {}), ...(uom ? { uom } : {}), costUnit: cost, unitPrice: cost ?? 0, lot, ohLoading: true });
    try {
      const oh = await fetchOnhand(item.ItemNumber, hdr.warehouse || vu.invOrg || '', hdr.subinventory || vu.subinv, lot);
      upd(key, { qoh: oh.qty, lots: oh.lots.length ? oh.lots : (lot ? [lot] : []), ohLoading: false });
    } catch { upd(key, { ohLoading: false }); }
  };

  // User picked an item from the inline search — fetch cost rows, then either
  // apply directly or prompt for a lot when several lots exist.
  const pickInlineItem = async (key: string, itemNumber: string, itemRow?: any) => {
    const item = itemRow ?? (lineSearch[key]?.opts ?? []).find(o => o.ItemNumber === itemNumber) ?? { ItemNumber: itemNumber };
    upd(key, { itemNumber, description: item.ItemDescription, uom: pf(item, ['PrimaryUOMValue', 'PrimaryUOMCode', 'UOMCode']), ohLoading: true });
    setLineSearch(p => ({ ...p, [key]: { opts: [] } }));
    let costRows: any[] = [];
    try { costRows = await fetchItemCostRows(itemNumber, hdr.warehouse); } catch { /* none */ }
    const lots = Array.from(new Set(costRows.map(c => parseVU(c.ValuationUnit).lot).filter(Boolean))) as string[];
    if (lots.length > 1) { upd(key, { ohLoading: false }); setLotPick({ key, item: itemNumber, rows: costRows, onh: {} }); }
    else { await applyItemToLine(key, item, costRows, lots[0]); }
  };

  // "Check On-Hand" — refresh QoH for every populated line from Fusion.
  const checkAllOnhand = async () => {
    const withItems = lines.filter(l => l.itemNumber);
    if (!withItems.length) { message.warning('No lines to check'); return; }
    if (!hdr.warehouse) { message.warning('No warehouse selected on the header'); return; }
    setOhLoading(true);
    setLines(prev => prev.map(l => l.itemNumber ? { ...l, ohLoading: true } : l));
    try {
      await mapLimit(withItems, 4, async (l) => {
        try { const oh = await fetchOnhand(l.itemNumber, hdr.warehouse!, hdr.subinventory, l.lot); upd(l.key, { qoh: oh.qty, lots: oh.lots.length ? oh.lots : l.lots, ohLoading: false }); }
        catch { upd(l.key, { ohLoading: false }); }
      });
      message.success('On-hand updated from Fusion');
    } finally { setOhLoading(false); }
  };

  // DOO order-import payload matching the target JSON (billTo/shipTo, salesCredits, per-line charges).
  const buildPayload = () => {
    const dateIso = (hdr.orderDate ? dayjs(hdr.orderDate) : dayjs()).format('YYYY-MM-DD[T]00:00:00[Z]');
    const numOrStr = (v: any) => { const n = Number(v); return v != null && v !== '' && !Number.isNaN(n) ? n : v; };
    // Edit = DOO change order: reuse the original source keys + bump the revision
    // so Fusion updates the existing order instead of creating a new one.
    const srcNumber = editMode ? editOrder.SourceTransactionNumber : orderNumber;
    const srcSystem = editMode ? (editOrder.SourceTransactionSystem ?? 'OPS') : 'OPS';
    const srcId     = editMode ? editOrder.SourceTransactionId : `APEX:${orderSeq}`;
    const revision  = editMode ? (Number(editOrder.SourceTransactionRevisionNumber) || 1) + 1 : undefined;
    return {
      SourceTransactionNumber: srcNumber,
      SourceTransactionSystem: srcSystem,
      SourceTransactionId: srcId,
      ...(revision != null ? { SourceTransactionRevisionNumber: revision } : {}),
      TransactionalCurrencyCode: hdr.txnCurrency,
      ...(hdr.businessUnitId != null ? { BusinessUnitId: numOrStr(hdr.businessUnitId) } : {}),
      ...(hdr.accountNumber ? { BuyingPartyNumber: hdr.accountNumber } : {}),
      RequestedShipDate: dateIso,
      TransactionOn: dateIso,
      ...(hdr.orderType ? { TransactionTypeCode: hdr.orderType, TransactionType: hdr.orderType } : {}),
      SubmittedFlag: 'true',
      FreezePriceFlag: 'true',
      FreezeShippingChargeFlag: 'true',
      FreezeTaxFlag: 'true',
      ...(hdr.businessUnitId != null ? { RequestingBusinessUnitId: numOrStr(hdr.businessUnitId) } : {}),
      ...(hdr.paymentTerms ? { PaymentTerms: hdr.paymentTerms } : {}),
      ...(hdr.warehouse ? { RequestedFulfillmentOrganizationCode: hdr.warehouse } : {}),
      billToCustomer: [{
        ...(hdr.custAccountId != null ? { CustomerAccountId: numOrStr(hdr.custAccountId) } : {}),
        ...(hdr.billToSite != null ? { SiteUseId: numOrStr(hdr.billToSite) } : {}),
      }],
      shipToCustomer: [{
        ...(hdr.partyId != null ? { PartyId: String(hdr.partyId) } : {}),
        ...(hdr.shipToSite != null ? { SiteId: numOrStr(hdr.shipToSite) } : {}),
      }],
      ...(hdr.salesRep ? { salesCredits: [{ SourceTransactionSalesCreditIdentifier: orderSeq, Salesperson: hdr.salesRep, Percent: '100', SalesCreditTypeId: '1' }] } : {}),
      lines: lines.map((l, i) => {
        const qty = num(l.qty), price = num(l.unitPrice), tax = num(l.taxAmount);
        const ext = round2(price * qty), taxUnit = qty ? round2(tax / qty) : 0;
        // Preserve the original source line id for existing lines (so a change
        // order maps onto the right fulfillment line); mint one for added lines.
        const lineId = l.srcLineId ?? (editMode ? `N${i + 1}` : String(orderSeq * 100 + (i + 1)));
        const lineNum = l.srcLineNumber ?? (i + 1);
        const schedNum = l.srcScheduleNumber ?? lineId;
        // Canceled line → minimal change-order entry with CanceledFlag (no charges).
        if (editMode && l.canceled) {
          return {
            SourceTransactionLineId: String(lineId),
            SourceTransactionLineNumber: String(lineNum),
            SourceScheduleNumber: String(schedNum),
            ProductNumber: l.itemNumber,
            OrderedQuantity: 0,
            CanceledFlag: true,
            CancelReasonCode: 'CUSTOMER_REQUEST',
          };
        }
        return {
          SourceTransactionLineId: String(lineId),
          SourceTransactionLineNumber: lineNum,
          SourceTransactionScheduleId: schedNum,
          SourceScheduleNumber: schedNum,
          ...(l.uom ? { OrderedUOMCode: l.uom } : {}),
          OrderedQuantity: qty,
          ProductNumber: l.itemNumber,
          ...(hdr.subinventory ? { SubinventoryCode: hdr.subinventory } : {}),
          ...(hdr.paymentTerms ? { PaymentTerms: hdr.paymentTerms } : {}),
          TransactionCategoryCode: 'ORDER',
          // NOTE: lotSerials is NOT sent on standard outbound order lines — Fusion
          // rejects it (FOM-4515328) because a shippable ORDER line has no inventory
          // transaction; lot/serial is assigned downstream at pick/ship confirm.
          // The lot is instead carried in the line EFF below (additionalInformation).
          // Line EFF (additionalInformation) — populated dynamically from the
          // instance's configured line context/segments (see effLineChild).
          ...(effLineChild(l) ? { additionalInformation: [effLineChild(l)] } : {}),
          charges: [{
            SourceChargeId: `C${i + 1}`,
            ApplyTo: 'Price',
            PricedQuantity: qty,
            GSAUnitPrice: price,
            PriceType: 'One time',
            ChargeType: 'Sale',
            ChargeSubType: 'Price',
            ChargeCurrencyCode: hdr.txnCurrency,
            SequenceNumber: 1,
            ChargeDefinitionCode: 'QP_SALE_PRICE',
            PrimaryFlag: 'true',
            RollupFlag: 'false',
            chargeComponents: [
              { SourceChargeComponentId: `C${i + 1}-CC1`, PriceElementCode: 'QP_LIST_PRICE', PriceElementUsageCode: 'LIST_PRICE', HeaderCurrencyUnitPrice: price, HeaderCurrencyExtendedAmount: ext, RollupFlag: 'false', SequenceNumber: 1 },
              { SourceChargeComponentId: `C${i + 1}-CC2`, PriceElementCode: 'QP_NET_PRICE', PriceElementUsageCode: 'NET_PRICE', HeaderCurrencyUnitPrice: price, HeaderCurrencyExtendedAmount: ext, RollupFlag: 'false', SequenceNumber: 2 },
              { SourceChargeComponentId: `C${i + 1}-CC3`, PriceElementCode: 'QP_EXCLUSIVE_TAX', PriceElementUsageCode: 'EXCLUSIVE_TAX', HeaderCurrencyUnitPrice: taxUnit, HeaderCurrencyExtendedAmount: tax, RollupFlag: 'false', SequenceNumber: 3 },
              { SourceChargeComponentId: `C${i + 1}-CC4`, PriceElementCode: 'QP_NET_PRICE_PLUS_TAX', PriceElementUsageCode: 'NET_PRICE_PLUS_TAX', HeaderCurrencyUnitPrice: round2(price + taxUnit), HeaderCurrencyExtendedAmount: round2(ext + tax), RollupFlag: 'false', SequenceNumber: 4 },
            ],
          }],
        };
      }),
    };
  };
  const payloadStr = useMemo(() => JSON.stringify(buildPayload(), null, 2), [lines, hdr, orderNumber, orderSeq, effMeta, editOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Edit mode: build the exact per-line REST operations against the live order.
  //   update qty  → PATCH  {OrderKey}/child/lines/{linesUniqID}  { OrderedQuantity }
  //   add line    → POST   {OrderKey}/child/lines                 { Product, Qty, ... }
  //   remove line → PATCH  {OrderKey}/child/lines/{linesUniqID}  { CanceledFlag: true }
  interface EditOp { kind: 'update' | 'add' | 'cancel'; method: string; url: string; body: any; lineKey: string; label: string; srcLineNumber: any }
  const editOps: EditOp[] = useMemo(() => {
    if (!editMode) return [];
    const orderKey = editOrder.OrderKey ?? editOrder.HeaderId;
    const addUrl = `${FUSION_BASE}/salesOrdersForOrderHub/${encodeURIComponent(String(orderKey))}/child/lines`;
    const ops: EditOp[] = [];
    lines.forEach((l, i) => {
      const label = `${l.itemNumber || '(item)'}${l.srcLineNumber != null ? ` · line ${l.srcLineNumber}` : ''}`;
      if (l.existing) {
        const href = l.lineHref ? fusionHref(l.lineHref) : (l.fulfillLineId != null ? `${addUrl}/${l.fulfillLineId}` : '');
        if (!href) return;
        if (l.canceled) ops.push({ kind: 'cancel', method: 'PATCH', url: href, body: { CanceledFlag: true, CancelReasonCode: 'CUSTOMER_REQUEST' }, lineKey: l.key, label, srcLineNumber: l.srcLineNumber });
        else if (num(l.qty) !== num(l.origQty)) ops.push({ kind: 'update', method: 'PATCH', url: href, body: { OrderedQuantity: num(l.qty) }, lineKey: l.key, label, srcLineNumber: l.srcLineNumber });
      } else {
        ops.push({ kind: 'add', method: 'POST', url: addUrl, body: {
          ProductNumber: l.itemNumber, OrderedQuantity: num(l.qty), ...(l.uom ? { OrderedUOMCode: l.uom } : {}),
          SourceTransactionLineId: `N${i + 1}`, SourceTransactionLineNumber: String(i + 1), SourceScheduleNumber: `N${i + 1}`,
        }, lineKey: l.key, label, srcLineNumber: i + 1 });
      }
    });
    return ops;
  }, [editMode, editOrder, lines]); // eslint-disable-line react-hooks/exhaustive-deps

  // What the Payload button shows: the ops list in edit mode, else the create body.
  const previewStr = editMode
    ? JSON.stringify(editOps.map(o => ({ operation: o.kind, method: o.method, url: o.url, body: o.body })), null, 2)
    : payloadStr;

  // Pull the created order's lines from Fusion and stamp each grid line's status.
  // Match by SourceTransactionLineNumber (what we sent), then fall back to item.
  const refreshLineStatuses = async (orderKey?: string) => {
    const key = orderKey ?? createdOrderKey;
    if (!key) { message.warning('Save the order first, then refresh statuses'); return; }
    setStatusLoading(true);
    try {
      const url = `${FUSION_BASE}/salesOrdersForOrderHub/${encodeURIComponent(key)}/child/lines?onlyData=true&limit=500`;
      const r = await fetch(url, { headers: FUSION_HDRS });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const items: any[] = d.items ?? [];
      setLines(prev => prev.map((l, i) => {
        const match =
          items.find(it => String(pf(it, ['SourceTransactionLineNumber']) ?? '') === String(i + 1)) ??
          items.find(it => String(pf(it, ['ProductNumber', 'Product', 'ItemNumber']) ?? '') === String(l.itemNumber));
        if (!match) return l;
        return { ...l, status: pf(match, ['Status', 'DisplayStatus', 'FulfillLineStatus']), statusCode: pf(match, ['StatusCode']) };
      }));
      message.success('Line statuses refreshed from Fusion');
    } catch (e: any) { message.error(`Refresh failed: ${e.message}`); }
    finally { setStatusLoading(false); }
  };

  const save = async () => {
    if (lines.length === 0) { message.warning('Add at least one line'); return; }
    setPosting(true); setSaveError(null); setOrderErrors([]);
    setLines(prev => prev.map(l => l.error ? { ...l, error: undefined } : l));
    const stamp = String(Date.now());
    // Map response errors onto lines (red ✗) + the Errors tab.
    const applyErrors = (data: any, text: string, includeRaw: boolean) => {
      const msgs = collectOrderErrors(data, text, includeRaw);
      const { byKey } = mapErrorsToLines(msgs, lines);
      setLines(prev => prev.map(l => ({ ...l, error: byKey[l.key]?.join('\n\n') })));
      setOrderErrors(msgs);
    };
    try {
      const r = await fetch(SO_CREATE_URL, { method: 'POST', headers: { ...FUSION_HDRS, 'Content-Type': 'application/json' }, body: payloadStr });
      const text = await r.text(); let data: any = null, pretty = text;
      try { data = JSON.parse(text); pretty = JSON.stringify(data, null, 2); } catch { /* raw */ }
      setLastResponse(`HTTP ${r.status}\n\n${pretty}`);

      if (r.ok && data?.OrderNumber) {
        // Success — write the response to the order-loading folder (no on-screen log).
        applyErrors(data, '', false); // surface any per-line warnings the create still returned
        saveOrderLog(`order-${data.OrderNumber}-${stamp}.json`, pretty);
        const pieces = Array.from({ length: 60 }, (_, i) => ({
          id: i, x: Math.random() * 100,
          color: ['#C74634', '#1D7B4D', '#0572CE', '#D4A800', '#00918A', '#6B21A8', '#FF6B35', '#4ECDC4'][Math.floor(Math.random() * 8)],
          delay: Math.random() * 1.2, size: 6 + Math.random() * 8,
        }));
        setConfetti(pieces);
        setSuccessInfo({ orderNumber: data.OrderNumber, status: data.StatusCode ?? data.Status ?? (editMode ? 'Updated' : 'Created') });
        setSaveError(null);
        setSuccessOpen(true);
        const orderKey = data.OrderKey ?? data.HeaderId ?? null;
        setCreatedOrderKey(orderKey != null ? String(orderKey) : null);
        message.success(`Sales order ${data.OrderNumber} ${editMode ? 'updated' : 'created'}`);
        if (orderKey != null) refreshLineStatuses(String(orderKey));
      } else {
        // Failure — map errors onto lines + Errors tab, write the log, show the dialog.
        applyErrors(data, text, true);
        const msg = extractOrderError(data, r.status, text);
        saveOrderLog(`order-ERROR-${orderNumber || 'draft'}-${stamp}.json`,
          `HTTP ${r.status}\n\n=== RESPONSE ===\n${pretty}\n\n=== REQUEST PAYLOAD ===\n${payloadStr}`);
        setConfetti([]);
        setSaveError(msg);
        setSuccessOpen(true);
        message.error('Sales order creation failed');
      }
    } catch (e: any) {
      saveOrderLog(`order-ERROR-${orderNumber || 'draft'}-${stamp}.json`, `NETWORK ERROR: ${e?.message}\n\n=== REQUEST PAYLOAD ===\n${payloadStr}`);
      setConfetti([]);
      setLastResponse(`NETWORK ERROR: ${e?.message}`);
      setSaveError(e?.message || 'Network error');
      setOrderErrors([e?.message || 'Network error']);
      setSuccessOpen(true);
      message.error('Sales order creation failed');
    } finally { setPosting(false); }
  };

  // Edit mode: run each per-line operation (PATCH update / POST add / PATCH cancel)
  // against the live order and collect per-line results.
  const updateOrder = async () => {
    const orderKey = editOrder.OrderKey ?? editOrder.HeaderId;
    if (editOps.length === 0) { message.warning('No changes to save'); return; }
    setPosting(true); setSaveError(null); setOrderErrors([]);
    setLines(prev => prev.map(l => l.error ? { ...l, error: undefined } : l));
    const stamp = String(Date.now());
    const results: any[] = [];
    const errByKey: Record<string, string[]> = {};
    const general: string[] = [];
    for (const op of editOps) {
      try {
        const r = await fetch(op.url, { method: op.method, headers: { ...FUSION_HDRS, 'Content-Type': 'application/json' }, body: JSON.stringify(op.body) });
        const text = await r.text(); let data: any = null, pretty = text;
        try { data = JSON.parse(text); pretty = JSON.stringify(data, null, 2); } catch { /* raw */ }
        results.push({ operation: op.kind, method: op.method, url: op.url, status: r.status, ok: r.ok, request: op.body, response: pretty });
        if (!r.ok) {
          const msgs = collectOrderErrors(data, text, true);
          const use = msgs.length ? msgs : [`HTTP ${r.status}`];
          (errByKey[op.lineKey] ??= []).push(...use); general.push(...use);
        }
      } catch (e: any) {
        results.push({ operation: op.kind, method: op.method, url: op.url, status: 0, ok: false, request: op.body, response: e?.message });
        (errByKey[op.lineKey] ??= []).push(e?.message ?? 'Network error'); general.push(e?.message ?? 'Network error');
      }
    }
    saveOrderLog(`order-EDIT-${editOrder.OrderNumber ?? orderKey}-${stamp}.json`, JSON.stringify({ operations: editOps, results }, null, 2));
    setLastResponse(JSON.stringify(results, null, 2));
    setLines(prev => prev.map(l => ({ ...l, error: errByKey[l.key]?.join('\n\n') })));
    setOrderErrors(general);
    const failed = results.filter(r => !r.ok).length;
    if (failed === 0) {
      const pieces = Array.from({ length: 60 }, (_, i) => ({
        id: i, x: Math.random() * 100,
        color: ['#C74634', '#1D7B4D', '#0572CE', '#D4A800', '#00918A', '#6B21A8', '#FF6B35', '#4ECDC4'][Math.floor(Math.random() * 8)],
        delay: Math.random() * 1.2, size: 6 + Math.random() * 8,
      }));
      setConfetti(pieces);
      setSuccessInfo({ orderNumber: editOrder.OrderNumber ?? String(orderKey), status: `${results.length} change(s) applied` });
      setSaveError(null); setSuccessOpen(true);
      message.success(`Order updated — ${results.length} change(s)`);
      refreshLineStatuses(String(orderKey));
    } else {
      setSaveError(`${failed} of ${results.length} change(s) failed. See the Errors tab / red ✗ on the lines.`);
      setSuccessOpen(true);
      message.error(`${failed} change(s) failed`);
    }
    setPosting(false);
  };

  const totQty = lines.reduce((s, l) => s + num(l.qty), 0);
  const totAmt = lines.reduce((s, l) => s + num(l.qty) * num(l.unitPrice), 0);
  const lineTax = lines.reduce((s, l) => s + num(l.taxAmount), 0);

  const cols: ColumnsType<NewLine> = [
    { title: 'Line', width: 50, align: 'center', fixed: 'left', render: (_, __, i) => <Tag color="blue">{i + 1}</Tag> },
    { title: 'Item', dataIndex: 'itemNumber', width: 210, fixed: 'left', render: (v, r) => v
        ? <Text strong style={{ color: REDWOOD.info, fontSize: 12 }}>{v}</Text>
        : <Select showSearch size="small" style={{ width: 196 }} placeholder="Type 3+ chars — code / desc" value={undefined}
            filterOption={false} loading={lineSearch[r.key]?.loading} onSearch={t => onLineSearch(r.key, t)} onChange={val => pickInlineItem(r.key, val)}
            notFoundContent={lineSearch[r.key]?.loading ? <Spin size="small" /> : (lineSearch[r.key]?.tooShort ? 'Type at least 3 characters' : 'No match')}
            options={(lineSearch[r.key]?.opts ?? []).map(o => ({ value: o.ItemNumber, label: <span><Text strong style={{ fontSize: 11 }}>{o.ItemNumber}</Text>{o.ItemDescription ? <Text type="secondary" style={{ fontSize: 11 }}> — {o.ItemDescription}</Text> : null}</span> }))} /> },
    { title: 'Description', dataIndex: 'description', width: 240, ellipsis: true, render: (v, r) => r.ohLoading && v == null ? <Spin size="small" /> : <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'UOM', dataIndex: 'uom', width: 70, render: v => v ?? '—' },
    { title: 'Cost', dataIndex: 'costUnit', width: 90, align: 'right', render: v => v == null ? '—' : <Text type="secondary" style={{ fontSize: 11 }}>{fmtAmount(v, ccy)}</Text> },
    { title: 'QoH', dataIndex: 'qoh', width: 80, align: 'right', render: (v, r) => r.ohLoading ? <Spin size="small" /> : (v == null ? <Text type="secondary" style={{ fontSize: 11 }}>—</Text> : <Text style={{ fontSize: 11.5, color: REDWOOD.info, fontVariantNumeric: 'tabular-nums' }}>{fmtQty(num(v))}</Text>) },
    { title: 'Qty', dataIndex: 'qty', width: 90, align: 'right', render: (v, r) => <InputNumber size="small" min={0} max={r.qoh != null ? r.qoh : undefined} value={v} disabled={!!r.canceled}
        onChange={n => { let q = Number(n) || 0; if (r.qoh != null && q > r.qoh) { q = r.qoh; message.warning(`Cannot order more than on-hand (${fmtQty(r.qoh)})`); } updLine(r.key, { qty: q }); }} style={{ width: 78 }} /> },
    { title: 'Unit Price', dataIndex: 'unitPrice', width: 100, align: 'right', render: (v, r) => <InputNumber size="small" min={0} value={v} disabled={!!r.canceled} onChange={n => updLine(r.key, { unitPrice: Number(n) || 0 })} style={{ width: 88 }} /> },
    { title: 'Line Total', width: 110, align: 'right', render: (_, r) => <Text strong style={{ color: REDWOOD.primary, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(num(r.qty) * num(r.unitPrice), ccy)}</Text> },
    { title: 'Margin', width: 100, align: 'right', render: (_, r) => { const m = (num(r.unitPrice) - num(r.costUnit)) * num(r.qty); return <Text style={{ fontSize: 11.5, color: m < 0 ? REDWOOD.error : REDWOOD.success, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(m, ccy)}</Text>; } },
    { title: 'Tax Code', dataIndex: 'taxCode', width: 140, render: (v, r) => <Select size="small" showSearch allowClear style={{ width: 128 }} popupMatchSelectWidth={false} value={v || undefined} placeholder="—"
        options={taxOptions} optionFilterProp="value"
        notFoundContent={taxOptions.length ? undefined : (hdr.businessUnit ? 'No tax codes' : 'Select a business unit')}
        onChange={val => { const opt = taxOptions.find(o => o.value === val); updLine(r.key, { taxCode: val, taxPct: opt ? opt.pct : undefined }); }} /> },
    { title: 'Tax', dataIndex: 'taxAmount', width: 120, align: 'right', render: (v, r) => <Space size={4}>{r.taxPct != null && <Tag color="gold" style={{ margin: 0, fontSize: 10 }}>{r.taxPct}%</Tag>}<Text style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(num(v), ccy)}</Text></Space> },
    { title: 'Net', width: 110, align: 'right', fixed: 'right', render: (_, r) => <Text strong style={{ color: REDWOOD.success, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(num(r.qty) * num(r.unitPrice) + num(r.taxAmount), ccy)}</Text> },
    { title: 'Status', dataIndex: 'status', width: 130, fixed: 'right', render: (v, r, i) => r.error
        ? <Tooltip title="Click to view the error"><Button size="small" type="text" danger style={{ padding: '0 4px' }}
            icon={<CloseCircleTwoTone twoToneColor={REDWOOD.error} />}
            onClick={() => setErrModal({ title: `Line ${r.srcLineNumber ?? i + 1}${r.itemNumber ? ` · ${r.itemNumber}` : ''}`, msg: r.error! })}>Error</Button></Tooltip>
        : r.canceled
          ? <Tag color="error" style={{ fontSize: 11 }}>Canceled</Tag>
          : (v || r.statusCode ? statusTag(v, r.statusCode) : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>) },
    { title: '', width: 40, align: 'center', fixed: 'right', render: (_, r) => (editMode && r.existing)
        ? <Tooltip title={r.canceled ? 'Restore line' : 'Cancel line'}>
            <Button size="small" type="text" danger={!r.canceled} icon={r.canceled ? <ReloadOutlined /> : <DeleteOutlined />} onClick={() => del(r.key)} />
          </Tooltip>
        : <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => del(r.key)} /> },
  ];

  // Margin tab — item code / description plus margin figures.
  const marginCols: ColumnsType<NewLine> = [
    { title: 'Item', dataIndex: 'itemNumber', width: 150, render: v => <Text strong style={{ color: REDWOOD.info, fontSize: 12 }}>{v}</Text> },
    { title: 'Description', dataIndex: 'description', width: 260, ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Qty', dataIndex: 'qty', width: 80, align: 'right', render: v => fmtQty(num(v)) },
    { title: 'Cost', dataIndex: 'costUnit', width: 100, align: 'right', render: v => v == null ? '—' : <Text type="secondary" style={{ fontSize: 11 }}>{fmtAmount(num(v), ccy)}</Text> },
    { title: 'Unit Price', dataIndex: 'unitPrice', width: 100, align: 'right', render: v => fmtAmount(num(v), ccy) },
    { title: 'Margin', width: 120, align: 'right', render: (_, r) => { const m = (num(r.unitPrice) - num(r.costUnit)) * num(r.qty); return <Text strong style={{ color: m < 0 ? REDWOOD.error : REDWOOD.success, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(m, ccy)}</Text>; } },
    { title: 'Margin %', width: 90, align: 'right', render: (_, r) => { const t = num(r.qty) * num(r.unitPrice); const m = (num(r.unitPrice) - num(r.costUnit)) * num(r.qty); const pct = t ? (m / t) * 100 : 0; return <Text style={{ fontSize: 11.5, color: pct < 0 ? REDWOOD.error : REDWOOD.success }}>{t ? pct.toFixed(1) + '%' : '—'}</Text>; } },
  ];

  // Lot Details tab — one row per selected lot with item code / description.
  const lotRows = useMemo(() => lines.flatMap(l => {
    const ls = (l.lots && l.lots.length) ? l.lots : (l.lot ? [l.lot] : []);
    return ls.length
      ? ls.map((lot, i) => ({ key: `${l.key}-lot-${i}`, itemNumber: l.itemNumber, description: l.description, lot, qty: l.qty }))
      : [{ key: `${l.key}-nolot`, itemNumber: l.itemNumber, description: l.description, lot: undefined as string | undefined, qty: l.qty }];
  }), [lines]);
  const lotCols: ColumnsType<any> = [
    { title: 'Item', dataIndex: 'itemNumber', width: 150, render: v => <Text strong style={{ color: REDWOOD.info, fontSize: 12 }}>{v}</Text> },
    { title: 'Description', dataIndex: 'description', width: 300, ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Lot', dataIndex: 'lot', width: 200, render: v => v ? <Tag color="geekblue">{v}</Tag> : <Text type="secondary">— no lot —</Text> },
    { title: 'Ord Qty', dataIndex: 'qty', width: 100, align: 'right', render: v => fmtQty(num(v)) },
  ];

  // Errors tab — per-line errors + general order-level errors from the last save.
  const errorRows = useMemo(() => {
    const rows: { key: string; scope: string; item?: string; msg: string }[] = [];
    lines.forEach((l, i) => {
      if (l.error) l.error.split('\n\n').forEach((m, j) => rows.push({ key: `${l.key}-e${j}`, scope: `Line ${l.srcLineNumber ?? i + 1}`, item: l.itemNumber, msg: m }));
    });
    orderErrors.filter(m => !lines.some(l => l.error?.includes(m))).forEach((m, j) => rows.push({ key: `gen-${j}`, scope: 'Order', msg: m }));
    return rows;
  }, [lines, orderErrors]);

  // System IDs tab (edit mode) — the Fusion keys we use to target each line.
  const sysIdRows = useMemo(() => lines.map((l, i) => ({
    key: l.key, lineNo: l.srcLineNumber ?? i + 1, item: l.itemNumber,
    fulfillLineId: l.fulfillLineId, srcLineId: l.srcLineId,
    linesUniqID: l.lineHref ? l.lineHref.split('/child/lines/')[1]?.split(/[?#]/)[0] : undefined,
    state: !l.existing ? 'New' : (l.canceled ? 'Cancel' : (num(l.qty) !== num(l.origQty) ? 'Update' : 'Unchanged')),
  })), [lines]);

  return (
    <div style={{ padding: '4px 2px' }}>
      <Card size="small" style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, marginBottom: 12 }}
        styles={{ body: { paddingTop: 4 } }}
        title={<Space><span style={{ width: 30, height: 30, borderRadius: 8, background: editMode ? 'linear-gradient(135deg, #B07700, #8a5e00)' : `linear-gradient(135deg, ${REDWOOD.primary}, ${REDWOOD.primary}bb)`, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>{editMode ? <EditOutlined /> : <BankOutlined />}</span>
          <Text strong style={{ fontSize: 15 }}>{editMode ? 'Edit Sales Order' : 'New Sales Order'}</Text>
          {editMode && <Tag color="warning" style={{ fontWeight: 700 }}>EDIT MODE · rev {(Number(editOrder?.SourceTransactionRevisionNumber) || 1) + 1}</Tag>}
          <Tag color="geekblue" style={{ fontVariantNumeric: 'tabular-nums' }}>{editMode ? (editOrder?.OrderNumber ?? orderNumber) : orderNumber}</Tag>
          <Tag color="purple">{hdr.orderType}</Tag><Tag>{hdr.txnCurrency}</Tag>{hdr.customerName && <Tag color="blue">{hdr.customerName}</Tag>}</Space>}
        extra={<Space>
          {/* JSON Actions — save/load the full on-screen draft (header + lines) */}
          <Space.Compact>
            <Button icon={<DownloadOutlined />} onClick={saveDraftJson}>Save JSON</Button>
            <Upload accept=".json,application/json" showUploadList={false} beforeUpload={(f) => { loadDraftJson(f); return false; }}>
              <Button icon={<CloudUploadOutlined />}>Load JSON</Button>
            </Upload>
          </Space.Compact>
          <Button icon={<CloudUploadOutlined />} onClick={() => setPreview(true)}>Payload</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={posting} onClick={editMode ? updateOrder : save}
            style={{ background: editMode ? '#B07700' : REDWOOD.success, borderColor: editMode ? '#B07700' : REDWOOD.success }}>
            {editMode ? `Update Order${editOps.length ? ` (${editOps.length})` : ''}` : 'Save Sales Order'}
          </Button>
        </Space>}>
        <Form form={form} layout="horizontal" size="small" labelAlign="left" colon labelWrap
          labelCol={{ flex: '0 0 104px' }} wrapperCol={{ flex: '1 1 auto' }}
          onValuesChange={(_c, all) => setHdr(prev => ({ ...prev, ...all }))}>
          <Tabs size="small" items={[
            {
              key: 'header', label: <span><BankOutlined style={{ marginRight: 5 }} />Header</span>,
              children: (
                <Row gutter={[12, 12]} align="stretch">
                  {/* S1 — Order */}
                  <Col xs={24} sm={12} md={5}><VSection icon={<BankOutlined />} title="Order" color={REDWOOD.primary}>
                    <Form.Item label="Order No" style={{ marginBottom: 10 }}>
                      <Text strong style={{ color: REDWOOD.primary, fontVariantNumeric: 'tabular-nums' }}>{orderNumber}</Text></Form.Item>
                    <Form.Item label="Business Unit" name="businessUnit" style={{ marginBottom: 10 }}>
                      <Select showSearch placeholder="Select" onChange={onBU} optionFilterProp="label"
                        options={bUnits.map(b => ({ value: b.businessUnitName, label: `${b.businessUnitName}${b.paymentCurrency ? ` — ${b.paymentCurrency}` : ''}` }))} /></Form.Item>
                    <Form.Item label="Order Date" name="orderDate" style={{ marginBottom: 10 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
                    <Form.Item label="Order Type" name="orderType" style={{ marginBottom: 10 }}><Input /></Form.Item>
                    <Form.Item label="BU Code" name="buCode" style={{ marginBottom: 10 }}><Input readOnly placeholder="—" /></Form.Item>
                  </VSection></Col>

                  {/* S2 — Customer Information */}
                  <Col xs={24} sm={12} md={9}><VSection icon={<ProfileOutlined />} title="Customer Information" color={REDWOOD.info}>
                    <Form.Item label="Customer Name" name="customerName" layout="vertical" labelCol={{ span: 24 }} wrapperCol={{ span: 24 }} style={{ marginBottom: hdr.customerName ? 2 : 10 }}>
                      <Select showSearch placeholder="Search customer" onChange={onCustomer} optionFilterProp="label" options={custOptions} notFoundContent={customers.length ? 'No match' : 'Loading…'} /></Form.Item>
                    {hdr.customerName && <div style={{ fontSize: 12, fontWeight: 600, color: REDWOOD.info, whiteSpace: 'normal', lineHeight: 1.35, margin: '0 0 10px' }}>{hdr.customerName}</div>}
                    <Form.Item label="Cust Number" name="accountNumber" style={{ marginBottom: 10 }}><Input readOnly placeholder="—" /></Form.Item>
                    <Form.Item label="Payment Terms" name="paymentTerms" style={{ marginBottom: 10 }}>
                      <Select showSearch optionFilterProp="label" options={payTermOpts} /></Form.Item>
                    <Form.Item label="Salesperson" name="salesRep" style={{ marginBottom: 10 }}>
                      <Select showSearch allowClear optionFilterProp="label" options={salesRepOpts} notFoundContent={salesRepOpts.length ? 'No match' : 'Loading…'} /></Form.Item>
                  </VSection></Col>

                  {/* S3 — Warehouse */}
                  <Col xs={24} sm={12} md={4}><VSection icon={<ShoppingOutlined />} title="Warehouse" color={REDWOOD.teal}>
                    <Form.Item label={<WarehouseLabel />} name="warehouse" style={{ marginBottom: 10 }}>
                      <Select showSearch placeholder={buName ? 'Organization' : 'Select BU first'} onChange={onWh} options={whOptions} optionFilterProp="label" /></Form.Item>
                    <Form.Item label="Sub Inventory" name="subinventory" style={{ marginBottom: 10 }}>
                      <Select showSearch notFoundContent="Pick a warehouse" options={subs.map(s => ({ value: s, label: s }))} /></Form.Item>
                    <Form.Item label="Base Currency" name="baseCurrency" style={{ marginBottom: 10 }}><Input readOnly placeholder="—" /></Form.Item>
                  </VSection></Col>

                  {/* S4 — Totals */}
                  <Col xs={24} sm={12} md={6}><VSection icon={<DollarOutlined />} title="Totals" color={REDWOOD.success}>
                    <Row gutter={8}>
                      <Col span={14}><Form.Item label="Txn Currency" name="txnCurrency" layout="vertical" labelCol={{ span: 24 }} wrapperCol={{ span: 24 }} style={{ marginBottom: 10 }}>
                        <Select showSearch options={CURRENCIES.map(c => ({ value: c, label: c }))} /></Form.Item></Col>
                      <Col span={10}><Form.Item label="Rate" name="rate" layout="vertical" labelCol={{ span: 24 }} wrapperCol={{ span: 24 }} style={{ marginBottom: 10 }}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                    </Row>
                    <TotalLine label="Gross" value={fmtAmount(totAmt, ccy)} />
                    <TotalLine label="Tax (from lines)" value={fmtAmount(lineTax, ccy)} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: `1px dashed ${REDWOOD.neutral200}` }}>
                      <span style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Discount</span><InputNumber size="small" min={0} value={discAmt} onChange={v => setDiscAmt(Number(v) || 0)} style={{ width: 120 }} /></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: `1px dashed ${REDWOOD.neutral200}` }}>
                      <span style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Expense</span><InputNumber size="small" min={0} value={expAmt} onChange={v => setExpAmt(Number(v) || 0)} style={{ width: 120 }} /></div>
                    <TotalLine label="Net (Trx Currency)" strong color={REDWOOD.primary} value={fmtAmount(totAmt + lineTax + num(expAmt) - num(discAmt), ccy)} />
                    <TotalLine label="Net (Base Currency)" strong color={REDWOOD.success} value={fmtAmount((totAmt + lineTax + num(expAmt) - num(discAmt)) * (num(hdr.rate) || 1), hdr.baseCurrency ?? ccy)} />
                  </VSection></Col>
                </Row>
              ),
            },
            {
              key: 'address', label: <span><ProfileOutlined style={{ marginRight: 5 }} />Customer Address</span>,
              children: (
                <OrderSection icon={<ProfileOutlined />} title="Bill-To / Ship-To" color={REDWOOD.info}>
                  <ROField label="Cust Account Id" value={hdr.custAccountId} mono span={6} />
                  <ROField label="Party Id" value={hdr.partyId} mono span={6} />
                  <ROField label="Bill To Site Use Id" value={hdr.billToSite} mono span={6} />
                  <ROField label="Ship To Party Site Id" value={hdr.shipToSite} mono span={6} />
                  <ROField label="Account Number" value={hdr.accountNumber} span={6} />
                  <ROField label="Customer" value={hdr.customerName} span={18} />
                  <ROField label="Bill To Address" value={hdr.billToAddress} span={12} />
                  <ROField label="Ship To Address" value={hdr.shipToAddress} span={12} />
                </OrderSection>
              ),
            },
            { key: 'additional', label: <span><ProfileOutlined style={{ marginRight: 5 }} />Additional Info</span>,
              children: <OrderSection icon={<ProfileOutlined />} title="Additional Information" color={REDWOOD.purple}>
                <Col xs={24}><Form.Item label="Remarks" name="remarks" layout="vertical" style={{ marginBottom: 12 }}><Input.TextArea rows={3} placeholder="Optional notes…" /></Form.Item></Col>
              </OrderSection> },
            { key: 'credit', label: <span><ReconciliationOutlined style={{ marginRight: 5 }} />Customer Credit Check</span>,
              children: <div style={{ padding: 8 }}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Customer credit check — connect the credit web service to show limit, exposure and available credit." style={{ padding: 24 }} /></div> },
            { key: 'validations', label: <span><InfoCircleOutlined style={{ marginRight: 5 }} />Order Validations</span>,
              children: <div style={{ padding: 8 }}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Order validations — item, warehouse and customer checks will appear here before submission." style={{ padding: 24 }} /></div> },
          ]} />
        </Form>
      </Card>

      <Card size="small" styles={{ body: { padding: 0 } }} style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
        title={<Space><UnorderedListOutlined style={{ color: REDWOOD.primary }} /><Text strong>Lines</Text>{lines.length > 0 && <Tag>{lines.length}</Tag>}
          {effMeta
            ? <Tooltip title={`Line EFF context "${effMeta.contextCode}" — lot → ${effMeta.lotSeg ?? '(none)'}, cost → ${effMeta.costSeg ?? '(none)'}`}>
                <Tag color="purple" style={{ fontSize: 10 }}>EFF: lot {effMeta.lotSeg ? '✓' : '—'} · cost {effMeta.costSeg ? '✓' : '—'}</Tag>
              </Tooltip>
            : <Tooltip title="No line extensible flexfield context with lot/cost segments was auto-detected, so lot number and item cost are kept in the grid only (not sent to Fusion). Lot/serial on a standard sales order is assigned at pick/ship confirm. Send me your EFF context code + segment API names to save them.">
                <Tag color="default" style={{ fontSize: 10 }}>EFF: not detected</Tag>
              </Tooltip>}</Space>}
        extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setPickOpen(true)} style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>Add Multiple Lines</Button>}>
        {<Tabs size="small" tabBarStyle={{ padding: '0 12px', marginBottom: 0 }}
            tabBarExtraContent={{ right: <Space size={6} style={{ paddingRight: 4 }}>
              <Button size="small" icon={<PlusOutlined />} onClick={addBlankLine}>New Line</Button>
              <Button size="small" icon={<DatabaseOutlined />} loading={ohLoading} onClick={checkAllOnhand} style={{ color: REDWOOD.info, borderColor: REDWOOD.info }}>Check On-Hand</Button>
              <Button size="small" icon={<ReloadOutlined />} loading={statusLoading} disabled={!createdOrderKey} onClick={() => refreshLineStatuses()} style={createdOrderKey ? { color: REDWOOD.success, borderColor: REDWOOD.success } : undefined}>Refresh Status</Button>
            </Space> }} items={[
              {
                key: 'lines', label: <Space size={6}><UnorderedListOutlined />Lines<Tag style={{ marginInlineEnd: 0 }}>{lines.length}</Tag></Space>,
                children: <Table size="small" columns={cols} dataSource={lines} rowKey="key" pagination={false} scroll={{ x: 1890, y: 360 }}
                  locale={{ emptyText: 'No lines — use “Add Multiple Lines” or “New Line”' }}
                  summary={() => lines.length === 0 ? null : (() => {
                    const totMargin = lines.reduce((s, l) => s + (num(l.unitPrice) - num(l.costUnit)) * num(l.qty), 0);
                    return (
                      <Table.Summary fixed>
                        <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                          <Table.Summary.Cell index={0} colSpan={6} align="right"><Text strong>Total</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={6} align="right"><Text strong>{fmtQty(totQty)}</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={7} />
                          <Table.Summary.Cell index={8} align="right"><Text strong style={{ color: REDWOOD.primary }}>{fmtAmount(totAmt, ccy)}</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={9} align="right"><Text strong style={{ color: totMargin < 0 ? REDWOOD.error : REDWOOD.success }}>{fmtAmount(totMargin, ccy)}</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={10} />
                          <Table.Summary.Cell index={11} align="right"><Text strong>{fmtAmount(lineTax, ccy)}</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={12} align="right"><Text strong style={{ color: REDWOOD.success }}>{fmtAmount(totAmt + lineTax, ccy)}</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={13} />
                          <Table.Summary.Cell index={14} />
                        </Table.Summary.Row>
                      </Table.Summary>
                    );
                  })() } />,
              },
              {
                key: 'margin', label: <Space size={6}><RiseOutlined />Margin</Space>,
                children: <Table size="small" columns={marginCols} dataSource={lines} rowKey="key" pagination={false} scroll={{ x: 900, y: 360 }}
                  summary={() => {
                    const totMargin = lines.reduce((s, l) => s + (num(l.unitPrice) - num(l.costUnit)) * num(l.qty), 0);
                    const pct = totAmt ? (totMargin / totAmt) * 100 : 0;
                    return (
                      <Table.Summary fixed>
                        <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                          <Table.Summary.Cell index={0} colSpan={5} align="right"><Text strong>Total Margin</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={5} align="right"><Text strong style={{ color: totMargin < 0 ? REDWOOD.error : REDWOOD.success }}>{fmtAmount(totMargin, ccy)}</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={6} align="right"><Text strong style={{ color: pct < 0 ? REDWOOD.error : REDWOOD.success }}>{totAmt ? pct.toFixed(1) + '%' : '—'}</Text></Table.Summary.Cell>
                        </Table.Summary.Row>
                      </Table.Summary>
                    );
                  }} />,
              },
              {
                key: 'lots', label: <Space size={6}><TagsOutlined />Lot Details<Tag style={{ marginInlineEnd: 0 }}>{lotRows.length}</Tag></Space>,
                children: <Table size="small" columns={lotCols} dataSource={lotRows} rowKey="key" pagination={false} scroll={{ x: 750, y: 360 }}
                  locale={{ emptyText: 'No lot details on the selected items' }} />,
              },
              {
                key: 'errors', label: <Space size={6}><CloseCircleTwoTone twoToneColor={errorRows.length ? REDWOOD.error : '#bbb'} />Errors{errorRows.length > 0 && <Tag color="error" style={{ marginInlineEnd: 0 }}>{errorRows.length}</Tag>}</Space>,
                children: <Table size="small" rowKey="key" pagination={false} scroll={{ x: 700, y: 360 }}
                  dataSource={errorRows}
                  locale={{ emptyText: 'No errors from the last save' }}
                  columns={[
                    { title: 'Where', dataIndex: 'scope', width: 110, render: (v: string) => <Tag color={v === 'Order' ? 'volcano' : 'red'} style={{ fontSize: 11 }}>{v}</Tag> },
                    { title: 'Item', dataIndex: 'item', width: 150, render: (v: string) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">—</Text> },
                    { title: 'Error', dataIndex: 'msg', render: (v: string) => <Text style={{ fontSize: 12, color: REDWOOD.error }}>{v}</Text> },
                  ]} />,
              },
              ...(editMode ? [{
                key: 'sysids', label: <Space size={6}><DatabaseOutlined />System IDs</Space>,
                children: <>
                  <div style={{ padding: '6px 8px', fontSize: 12 }}>
                    <Text type="secondary">Order Key </Text><Text code>{editOrder?.OrderKey ?? '—'}</Text>
                    <Text type="secondary"> · Header Id </Text><Text code>{editOrder?.HeaderId ?? '—'}</Text>
                    <Text type="secondary"> · Order # </Text><Text code>{editOrder?.OrderNumber ?? '—'}</Text>
                  </div>
                  <Table size="small" rowKey="key" pagination={false} scroll={{ x: 900, y: 320 }} dataSource={sysIdRows}
                    columns={[
                      { title: 'Line', dataIndex: 'lineNo', width: 60, align: 'center' as const },
                      { title: 'Item', dataIndex: 'item', width: 150, render: (v: string) => <Text strong style={{ fontSize: 12, color: REDWOOD.info }}>{v || '—'}</Text> },
                      { title: 'Action', dataIndex: 'state', width: 100, render: (v: string) => <Tag color={v === 'New' ? 'green' : v === 'Cancel' ? 'red' : v === 'Update' ? 'blue' : 'default'} style={{ fontSize: 11 }}>{v}</Tag> },
                      { title: 'FulfillLineId', dataIndex: 'fulfillLineId', width: 170, render: (v: any) => v != null ? <Text code style={{ fontSize: 11 }}>{v}</Text> : <Text type="secondary">— new —</Text> },
                      { title: 'Source Line Id', dataIndex: 'srcLineId', width: 140, render: (v: any) => v != null ? <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{v}</Text> : <Text type="secondary">—</Text> },
                      { title: 'linesUniqID (PATCH key)', dataIndex: 'linesUniqID', ellipsis: true, render: (v: any) => v ? <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{v}</Text> : <Text type="secondary">—</Text> },
                    ]} />
                </>,
              }] : []),
            ]} />}
      </Card>

      <ItemSearchModal open={pickOpen} org={hdr.warehouse} subinv={hdr.subinventory} taxOptions={taxOptions} onClose={() => setPickOpen(false)} onAdd={addItems} />

      {/* Line error detail (opened from the red ✗ in the Status column) */}
      <Modal open={!!errModal} onCancel={() => setErrModal(null)} width={640}
        title={<Space><CloseCircleTwoTone twoToneColor={REDWOOD.error} /> Error — {errModal?.title}</Space>}
        footer={<Button onClick={() => setErrModal(null)}>Close</Button>}>
        <div style={{ fontSize: 12, color: REDWOOD.error, whiteSpace: 'pre-wrap', background: '#FFF1F0', border: '1px solid #FFCCC7', borderRadius: 6, padding: '10px 12px', maxHeight: 360, overflow: 'auto' }}>
          {errModal?.msg}
        </div>
      </Modal>

      {/* Full response of the last save/update (opened from "Show Response") */}
      <Modal open={respOpen} onCancel={() => setRespOpen(false)} width={760}
        title={<Space><CopyOutlined style={{ color: REDWOOD.info }} /> Response</Space>}
        footer={<Space>
          <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(lastResponse); message.success('Copied'); }}>Copy</Button>
          <Button onClick={() => setRespOpen(false)}>Close</Button>
        </Space>}>
        <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 460, overflow: 'auto', background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 6, padding: 12 }}>{lastResponse || '—'}</pre>
      </Modal>

      {/* ── Save result dialog — celebration on success, error state on failure ── */}
      <Modal
        open={successOpen}
        title={null}
        closable={!!saveError}
        centered
        width={480}
        onCancel={() => { setSuccessOpen(false); setConfetti([]); }}
        footer={
          saveError
            ? <Space style={{ justifyContent: 'center', width: '100%' }} wrap>
                <Button size="large" icon={<DownloadOutlined />} onClick={saveDraftJson}>Save Order to JSON</Button>
                <Button size="large" icon={<CopyOutlined />} disabled={!lastResponse} onClick={() => setRespOpen(true)}>Show Response</Button>
                <Button danger type="primary" size="large" onClick={() => setSuccessOpen(false)}>Close</Button>
              </Space>
            : <Space style={{ justifyContent: 'center', width: '100%' }} wrap>
                <Button size="large" icon={<ReloadOutlined />} loading={statusLoading} onClick={() => refreshLineStatuses()}>
                  Refresh Line Status
                </Button>
                <Button size="large" icon={<CopyOutlined />} disabled={!lastResponse} onClick={() => setRespOpen(true)}>Show Response</Button>
                <Button type="primary" size="large" icon={<CheckCircleOutlined />}
                  style={{ background: REDWOOD.success, borderColor: REDWOOD.success, fontWeight: 700 }}
                  onClick={() => { setSuccessOpen(false); setConfetti([]); }}>
                  Done
                </Button>
              </Space>
        }
      >
        <style>{`
          @keyframes so-confetti-fall { 0% { transform: translateY(-20px) rotate(0deg); opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg); opacity: 0; } }
          @keyframes so-success-pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.12); } 100% { transform: scale(1); opacity: 1; } }
        `}</style>
        {!saveError && confetti.map(p => (
          <div key={p.id} style={{
            position: 'fixed', top: 0, left: `${p.x}%`, width: p.size, height: p.size * 0.6,
            background: p.color, borderRadius: 2, pointerEvents: 'none', zIndex: 99999,
            animation: `so-confetti-fall ${1.8 + (p.id % 5) * 0.24}s ease-in forwards`, animationDelay: `${p.delay}s`,
          }} />
        ))}
        {saveError
          ? (
            <div style={{ textAlign: 'center', padding: '28px 16px 8px' }}>
              <CloseCircleTwoTone twoToneColor={REDWOOD.error} style={{ fontSize: 52, marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: REDWOOD.neutral900, marginBottom: 4 }}>Sales Order creation failed</div>
              <Tag color="error" style={{ fontWeight: 700, marginBottom: 12 }}>ERROR</Tag>
              <div style={{ fontSize: 12, color: REDWOOD.error, whiteSpace: 'pre-wrap', textAlign: 'left', background: '#FFF1F0', border: '1px solid #FFCCC7', borderRadius: 6, padding: '10px 12px', maxHeight: 260, overflow: 'auto' }}>
                {saveError}
              </div>
              <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginTop: 10 }}>
                The full response &amp; payload were saved to <Text code style={{ fontSize: 11 }}>{ORDER_LOG_FOLDER}</Text>.
              </div>
            </div>
          )
          : (
            <div style={{ textAlign: 'center', padding: '32px 16px 16px', animation: 'so-success-pop 0.5s ease-out' }}>
              <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 12 }}>🎉</div>
              <CheckCircleOutlined style={{ fontSize: 48, color: REDWOOD.success, marginBottom: 10 }} />
              <div style={{ fontSize: 15, color: REDWOOD.neutral600, marginBottom: 6 }}>
                Sales Order {editMode ? 'updated' : 'created'} successfully in Oracle Fusion
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: REDWOOD.info, letterSpacing: '0.04em', fontFamily: 'monospace', marginBottom: 10 }}>
                {successInfo?.orderNumber}
              </div>
              {successInfo?.status && (
                <Tag color="green" style={{ fontWeight: 700, fontSize: 13, padding: '2px 14px' }}>{successInfo.status}</Tag>
              )}
              <div style={{ marginTop: 16, padding: '10px 16px', background: '#F0FFF4', borderRadius: 8, border: '1px solid #b7ebc8' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {lines.length} line{lines.length !== 1 ? 's' : ''} &nbsp;·&nbsp; Total:&nbsp;
                </Text>
                <Text strong style={{ color: REDWOOD.teal, fontSize: 13 }}>{fmtAmount(totAmt + lineTax, ccy)}</Text>
              </div>
            </div>
          )}
      </Modal>

      <Modal open={!!itemModal} onCancel={() => setItemModal(null)} maskClosable={false} width={760} style={{ top: 24 }}
        footer={<Button onClick={() => setItemModal(null)}>Cancel</Button>}
        title={<Space><SearchOutlined style={{ color: REDWOOD.primary }} /> Select item{itemModal ? <Tag color="blue">“{itemModal.term}”</Tag> : null}<Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>{itemModal?.rows.length ?? 0} matches — filter to narrow</Text></Space>}>
        <Input allowClear autoFocus prefix={<SearchOutlined />} placeholder="Filter by code or description" value={itemFilter} onChange={e => setItemFilter(e.target.value)} style={{ marginBottom: 10 }} />
        {itemModal && (() => {
          const f = itemFilter.trim().toLowerCase();
          const rows = f ? itemModal.rows.filter(r => String(r.ItemNumber ?? '').toLowerCase().includes(f) || String(r.ItemDescription ?? '').toLowerCase().includes(f)) : itemModal.rows;
          return <Table size="small" rowKey="ItemNumber" dataSource={rows} pagination={rows.length > 10 ? { pageSize: 10, size: 'small' } : false} scroll={{ y: 340 }}
            locale={{ emptyText: 'No items match the filter' }}
            onRow={rec => ({ style: { cursor: 'pointer' }, onClick: () => { const mk = itemModal.key; setItemModal(null); pickInlineItem(mk, rec.ItemNumber, rec); } })}
            columns={[
              { title: 'Item', dataIndex: 'ItemNumber', width: 160, render: v => <Text strong style={{ color: REDWOOD.info, fontSize: 12 }}>{v}</Text> },
              { title: 'Description', dataIndex: 'ItemDescription', ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
              { title: 'UOM', width: 70, render: (_, r: any) => pf(r, ['PrimaryUOMValue', 'PrimaryUOMCode', 'PrimaryUnitOfMeasure', 'UOMCode']) ?? '—' },
              { title: '', width: 70, align: 'right', render: (_, r: any) => <Button size="small" type="primary" style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }} onClick={e => { e.stopPropagation(); const mk = itemModal.key; setItemModal(null); pickInlineItem(mk, r.ItemNumber, r); }}>Select</Button> },
            ]} />;
        })()}
      </Modal>

      <Modal open={!!lotPick} onCancel={() => setLotPick(null)} maskClosable={false} width={620} footer={<Button onClick={() => setLotPick(null)}>Cancel</Button>}
        title={<Space><TagsOutlined style={{ color: REDWOOD.info }} /> Select a lot{lotPick ? <Tag color="blue">{lotPick.item}</Tag> : null}</Space>}>
        <Text type="secondary" style={{ fontSize: 12 }}>This item has multiple lots — pick one to bring its cost and on-hand.</Text>
        <Table size="small" style={{ marginTop: 10 }} pagination={false} rowKey={(_, i) => `lp-${i}`}
          dataSource={lotPick ? Array.from(new Set(lotPick.rows.map(r => parseVU(r.ValuationUnit).lot).filter(Boolean))).map(lot => {
            const row = lotPick.rows.find(r => parseVU(r.ValuationUnit).lot === lot);
            return { lot, cost: row ? num(pf(row, COST_FIELDS)) : undefined, subinv: parseVU(row?.ValuationUnit).subinv, invOrg: parseVU(row?.ValuationUnit).invOrg };
          }) : []}
          columns={[
            { title: 'Lot', dataIndex: 'lot', render: v => <Tag color="geekblue">{v}</Tag> },
            { title: 'Inv Org', dataIndex: 'invOrg', render: v => v || '—' },
            { title: 'Subinv', dataIndex: 'subinv', render: v => v ? <Tag color="cyan">{v}</Tag> : '—' },
            { title: 'Cost', dataIndex: 'cost', align: 'right', render: v => v == null ? '—' : fmtAmount(num(v), ccy) },
            { title: '', align: 'right', render: (_, r: any) => <Button size="small" type="primary" style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                onClick={() => { const lp = lotPick!; setLotPick(null); applyItemToLine(lp.key, { ItemNumber: lp.item }, lp.rows, r.lot); }}>Select</Button> },
          ]} />
      </Modal>

      <Modal open={preview} onCancel={() => setPreview(false)} maskClosable={false} width={760}
        title={<Space><CloudUploadOutlined style={{ color: REDWOOD.primary }} /> {editMode ? `Update operations (${editOps.length})` : 'Create Order payload'}</Space>}
        footer={<Space>
          <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(previewStr); message.success('Copied'); }}>Copy</Button>
          <Button onClick={() => setPreview(false)}>Close</Button>
        </Space>}>
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          {editMode
            ? <Text type="secondary" style={{ fontSize: 12 }}>Each change runs as its own request: <Tag color="blue">PATCH</Tag> update qty · <Tag color="green">POST</Tag> add line · <Tag color="volcano">PATCH CanceledFlag</Tag> remove line.</Text>
            : <><Tag color="green">POST</Tag><Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.info, wordBreak: 'break-all' }}>{SO_CREATE_URL}</Text></>}
        </div>
        <div style={{ maxHeight: 360, overflow: 'auto', background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 6, padding: 12 }}>
          <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{previewStr}</pre>
        </div>
      </Modal>

    </div>
  );
};

const SalesOrders: React.FC = () => {
  const [openTabs, setOpenTabs] = useState<{ key: string; order: any }[]>([]);
  const [newTabs, setNewTabs] = useState<{ key: string; header: OrderHeader; draft?: SoDraft; editOrder?: any }[]>([]);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [activeKey, setActiveKey] = useState('search');

  const openOrder = useCallback((order: any) => {
    const key = String(order.OrderKey ?? order.HeaderId ?? order.OrderNumber);
    setOpenTabs(prev => (prev.some(t => t.key === key) ? prev : [...prev, { key, order }]));
    setActiveKey(key);
  }, []);

  // Open an existing order in the create page as an editable change order.
  const openEdit = useCallback((order: any) => {
    const key = `edit-${order.OrderKey ?? order.HeaderId ?? order.OrderNumber}`;
    const header: OrderHeader = {
      businessUnit: order.BusinessUnitName ?? undefined,
      businessUnitId: order.BusinessUnitId ?? undefined,
      txnCurrency: order.TransactionalCurrencyCode ?? order.AppliedCurrencyCode ?? 'AED',
      baseCurrency: order.TransactionalCurrencyCode ?? 'AED',
      orderType: order.TransactionTypeCode ?? order.TransactionType ?? undefined,
      orderDate: order.TransactionOn ? dayjs(order.TransactionOn) : dayjs(),
      customerName: order.BuyingPartyName ?? undefined,
      accountNumber: order.BuyingPartyNumber ?? undefined,
      paymentTerms: order.PaymentTerms ?? order.PaymentTermsCode ?? undefined,
      warehouse: order.RequestedFulfillmentOrganizationCode ?? undefined,
      rate: 1,
    };
    setNewTabs(prev => (prev.some(t => t.key === key) ? prev : [...prev, { key, header, editOrder: order }]));
    setActiveKey(key);
  }, []);

  const removeTab = (key: string) => {
    setOpenTabs(prev => prev.filter(t => t.key !== key));
    setNewTabs(prev => prev.filter(t => t.key !== key));
    setActiveKey(cur => (cur === key ? 'search' : cur));
  };

  const proceedNewOrder = (header: OrderHeader) => {
    const key = `new-${Date.now()}`;
    setNewTabs(prev => [...prev, { key, header }]);
    setActiveKey(key);
  };

  // Open a new-order tab pre-populated from a saved draft JSON.
  const loadNewOrderFromJson = async (file: File) => {
    try {
      const draft = toSoDraft(await readJsonFile(file));
      if (!draft) { message.error('Not a sales-order JSON (missing header/lines)'); return false; }
      const key = `new-${Date.now()}`;
      setNewTabs(prev => [...prev, { key, header: draft.header, draft }]);
      setActiveKey(key);
      message.success(`Loaded ${draft.lines.length} line(s) from JSON`);
    } catch (e: any) { message.error(`Load failed: ${e.message}`); }
    return false;
  };

  const items = [
    {
      key: 'search',
      label: <span><SearchOutlined style={{ marginRight: 5 }} />Search</span>,
      closable: false,
      children: <SearchTab onOpen={openOrder} onEdit={openEdit} />,
    },
    ...newTabs.map((t, i) => ({
      key: t.key,
      label: t.editOrder
        ? <span><EditOutlined style={{ marginRight: 5, color: '#B07700' }} />Edit {t.editOrder.OrderNumber ?? ''}</span>
        : <span><PlusOutlined style={{ marginRight: 5 }} />New Order{newTabs.filter(x => !x.editOrder).length > 1 ? ` ${i + 1}` : ''}</span>,
      closable: true,
      children: <NewOrderTab header={t.header} initialDraft={t.draft} editOrder={t.editOrder} />,
    })),
    ...openTabs.map(t => ({
      key: t.key,
      label: <span><ShoppingOutlined style={{ marginRight: 5 }} />{t.order.SourceTransactionNumber ?? t.order.OrderNumber}</span>,
      closable: true,
      children: <OrderView order={t.order} />,
    })),
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        <div style={{ padding: '12px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/procurement">Procurement</Link> },
            { title: 'Sales Orders' },
          ]} />
          <Title level={4} style={{ margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingOutlined style={{ color: REDWOOD.primary }} /> Sales Orders
            <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>— search & drill into sales orders (Fusion salesOrdersForOrderHub)</Text>
          </Title>
        </div>

        <div style={{ padding: '12px 20px' }}>
          <Tabs type="editable-card" hideAdd size="small" activeKey={activeKey}
            onChange={setActiveKey} onEdit={(key, action) => { if (action === 'remove') removeTab(key as string); }}
            tabBarExtraContent={<Space>
              <Upload accept=".json,application/json" showUploadList={false} beforeUpload={(f) => loadNewOrderFromJson(f)}>
                <Button icon={<CloudUploadOutlined />}>Load from JSON</Button>
              </Upload>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setRegisterOpen(true)}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>Create New Order</Button>
            </Space>}
            items={items} />
        </div>

        <RegisterOrderModal open={registerOpen} onClose={() => setRegisterOpen(false)} onProceed={proceedNewOrder} />
      </Content>
    </Layout>
  );
};

export default SalesOrders;
