import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Layout, Breadcrumb, Card, Table, Form, Input, Select, DatePicker, Button,
  Tag, Typography, Space, Tooltip, Spin, Row, Col, message, Modal, Empty, Tabs, InputNumber,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, ProfileOutlined, SearchOutlined, ReloadOutlined, ClearOutlined,
  ApiOutlined, CopyOutlined, InfoCircleOutlined, ExportOutlined, BankOutlined,
  UnorderedListOutlined, ShoppingOutlined, DollarOutlined, PrinterOutlined, DownloadOutlined,
  ReconciliationOutlined, PlusOutlined, SaveOutlined, DeleteOutlined, CloudUploadOutlined,
  DatabaseOutlined, CheckCircleTwoTone, CloseCircleTwoTone,
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

const SearchTab: React.FC<{ onOpen: (order: any) => void }> = ({ onOpen }) => {
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
          <Button type="link" style={{ padding: 0, fontWeight: 700, color: REDWOOD.info, fontSize: 12, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={v ?? r.OrderNumber} onClick={() => onOpen(r)}>{v ?? r.OrderNumber ?? '—'}</Button>
          <Tooltip title="Open order"><Button size="small" type="text" icon={<ExportOutlined />} style={{ color: REDWOOD.info }} onClick={() => onOpen(r)} /></Tooltip>
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
  ]), [onOpen]);

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
  businessUnit?: string; buCode?: string; baseCurrency?: string; txnCurrency?: string; rate?: number;
  orderType?: string; orderDate?: Dayjs | null; customerName?: string; accountNumber?: string;
  billToSite?: string; shipToSite?: string; billToAddress?: string; shipToAddress?: string;
  paymentTerms?: string; salesRep?: string; warehouse?: string; subinventory?: string; remarks?: string;
  custAccountId?: string; partyId?: string;
}
interface NewLine { key: string; itemNumber: string; description?: string; uom?: string; qty: number; unitPrice: number }

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

// Per-item cost rows (ValuationUnit split + qty) with an on-hand tally check.
const ItemCostDetail: React.FC<{ item: string; rows: any[] }> = ({ item, rows }) => {
  const [onh, setOnh] = useState<Record<string, { loading?: boolean; qty?: number; err?: string }>>({});
  const checkOnhand = async (key: string, invOrg?: string, lot?: string) => {
    if (!invOrg) { message.warning('No inventory org on this cost row'); return; }
    setOnh(p => ({ ...p, [key]: { loading: true } }));
    try {
      let q = `OrganizationCode=${invOrg};ItemNumber=${item}`;
      if (lot) q += `;LotNumber=${lot}`;
      const r = await fetch(`${FUSION_BASE}/inventoryOnhandBalances?q=${encodeURIComponent(q)}&onlyData=true&limit=500`, { headers: FUSION_HDRS });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const qty = (d.items ?? []).reduce((s: number, x: any) => s + num(pf(x, ['PrimaryQuantity', 'OnhandQuantity', 'Quantity'])), 0);
      setOnh(p => ({ ...p, [key]: { qty } }));
    } catch (e: any) { setOnh(p => ({ ...p, [key]: { err: e.message } })); }
  };
  const cols: ColumnsType<any> = [
    { title: 'Cost Org', width: 110, render: (_, r) => <Text strong style={{ fontSize: 11 }}>{parseVU(r.ValuationUnit).costOrg || '—'}</Text> },
    { title: 'Inv Org', width: 90, render: (_, r) => <Text style={{ fontSize: 11 }}>{parseVU(r.ValuationUnit).invOrg || '—'}</Text> },
    { title: 'Subinv', width: 90, render: (_, r) => { const s = parseVU(r.ValuationUnit).subinv; return s ? <Tag color="cyan" style={{ fontSize: 10 }}>{s}</Tag> : '—'; } },
    { title: 'Lot', width: 120, render: (_, r) => { const l = parseVU(r.ValuationUnit).lot; return l ? <Tag color="geekblue" style={{ fontSize: 10 }}>{l}</Tag> : '—'; } },
    { title: 'Unit Cost', width: 110, align: 'right', render: (_, r) => <Text strong style={{ fontSize: 11, color: REDWOOD.primary, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(pf(r, COST_FIELDS), r.CurrencyCode)}</Text> },
    { title: 'Cost Qty', width: 90, align: 'right', render: (_, r) => <Text style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{fmtQty(num(pf(r, QTY_FIELDS)))}</Text> },
    { title: 'On-hand', width: 170, render: (_, r, i) => {
        const p = parseVU(r.ValuationUnit); const key = String(r.ValuationUnit ?? i);
        const st = onh[key]; const costQty = num(pf(r, QTY_FIELDS));
        return (
          <Space size={4}>
            <Tooltip title={<span>Check on-hand — org <b>{p.invOrg}</b>, item <b>{item}</b>{p.lot ? <>, lot <b>{p.lot}</b></> : null}</span>}>
              <Button size="small" type="text" icon={<DatabaseOutlined />} style={{ color: REDWOOD.info }} loading={st?.loading} onClick={() => checkOnhand(key, p.invOrg, p.lot)} />
            </Tooltip>
            {st?.qty != null && <>
              <Text style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{fmtQty(st.qty)}</Text>
              {Math.abs(st.qty - costQty) < 0.001
                ? <Tooltip title="Tallies with cost qty"><CheckCircleTwoTone twoToneColor={REDWOOD.success} /></Tooltip>
                : <Tooltip title={`Differs — cost ${fmtQty(costQty)} vs on-hand ${fmtQty(st.qty)}`}><CloseCircleTwoTone twoToneColor={REDWOOD.error} /></Tooltip>}
            </>}
            {st?.err && <Tooltip title={st.err}><Text type="danger" style={{ fontSize: 10 }}>err</Text></Tooltip>}
          </Space>
        );
      } },
  ];
  return rows.length === 0
    ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No cost rows for this org" style={{ padding: 12 }} />
    : <Table size="small" columns={cols} dataSource={rows} rowKey={(r, i) => String(r.ValuationUnit ?? i)} pagination={false} scroll={{ x: 780 }} />;
};

// Item picker (itemsV2), scoped to the warehouse org — like PO Add Lines,
// showing each item's cost for the selected inventory organization.
const ItemSearchModal: React.FC<{ open: boolean; org?: string; onClose: () => void; onAdd: (items: any[]) => void }> = ({ open, org, onClose, onAdd }) => {
  const [byDesc, setByDesc] = useState(false);
  const [term, setTerm] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sel, setSel] = useState<React.Key[]>([]);
  const [costs, setCosts] = useState<Record<string, { cost?: number; ccy?: string; n: number; rows: any[] }>>({});
  const [costLoading, setCostLoading] = useState(false);
  useEffect(() => { if (open) { setTerm(''); setRows([]); setSel([]); setError(''); setCosts({}); } }, [open]);

  const url = useMemo(() => {
    const t = term.trim(); if (!t) return '';
    const field = byDesc ? 'ItemDescription' : 'ItemNumber';
    const pattern = byDesc ? `%${t}%` : `${t}%`;
    let q = `${field} LIKE '${pattern}'`;
    if (org) q += `;OrganizationCode=${org}`;
    return `${FUSION_BASE}/itemsV2?q=${encodeURIComponent(q)}&limit=100&onlyData=true`;
  }, [term, byDesc, org]);

  // Fetch each item's cost (matched to the selected inventory org via ValuationUnit).
  const loadCosts = useCallback(async (items: any[]) => {
    if (!items.length) return;
    setCostLoading(true);
    const map: Record<string, { cost?: number; ccy?: string; n: number; rows: any[] }> = {};
    await mapLimit(items, 5, async (it) => {
      const item = it.ItemNumber;
      try {
        const r = await fetch(`${LATEST_URL}/itemCosts?q=${encodeURIComponent(`ItemNumber=${item}`)}&onlyData=true&limit=500`, { headers: FUSION_HDRS });
        const d = await r.json();
        const matched = (d.items ?? []).filter((x: any) => rowOrgMatches(x, org));
        const row = matched[0];
        map[item] = { cost: row ? num(pf(row, COST_FIELDS)) : undefined, ccy: row?.CurrencyCode, n: matched.length, rows: matched };
      } catch { map[item] = { n: 0, rows: [] }; }
    });
    setCosts(map); setCostLoading(false);
  }, [org]);

  const search = useCallback(async () => {
    if (!url) { message.warning('Enter a search term'); return; }
    setLoading(true); setError(''); setSel([]); setCosts({});
    try { const items = await fetchAllPages(url); setRows(items); loadCosts(items); }
    catch (e: any) { setError(e.message); setRows([]); }
    finally { setLoading(false); }
  }, [url, loadCosts]);

  const cols: ColumnsType<any> = [
    { title: 'Item', dataIndex: 'ItemNumber', width: 140, render: v => <Text strong style={{ color: REDWOOD.info, fontSize: 12 }}>{v}</Text> },
    { title: 'Description', dataIndex: 'ItemDescription', ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'UOM', width: 70, render: (_, r) => pf(r, ['PrimaryUOMValue', 'PrimaryUOMCode', 'PrimaryUnitOfMeasure', 'UOMCode']) ?? '—' },
    { title: <Tooltip title={`Item cost in ${org ?? 'the selected org'} (itemCosts, matched via ValuationUnit)`}><span>Item Cost {org ? <Tag style={{ fontSize: 10 }}>{org}</Tag> : null}</span></Tooltip>, width: 130, align: 'right',
      render: (_, r) => {
        const c = costs[r.ItemNumber];
        if (costLoading && !c) return <Spin size="small" />;
        if (!c || c.cost == null) return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
        return <Tooltip title={c.n > 1 ? `${c.n} cost rows for this org` : undefined}><Text strong style={{ fontSize: 12, color: REDWOOD.primary, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(c.cost, c.ccy)}</Text></Tooltip>;
      } },
  ];

  return (
    <Modal open={open} onCancel={onClose} maskClosable={false} width={780}
      title={<Space><SearchOutlined style={{ color: REDWOOD.primary }} /> Search Items{org ? <Tag>{org}</Tag> : null}</Space>}
      footer={<Space>
        <Text type="secondary" style={{ marginRight: 'auto', fontSize: 12 }}>{sel.length} selected</Text>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="primary" disabled={sel.length === 0} style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
          onClick={() => { onAdd(rows.filter(r => sel.includes(r.ItemNumber)).map(r => ({ ...r, _cost: costs[r.ItemNumber]?.cost }))); onClose(); }}>Add {sel.length || ''} Item(s)</Button>
      </Space>}>
      <Space.Compact style={{ width: '100%', marginBottom: 10 }}>
        <Select value={byDesc ? 'desc' : 'num'} style={{ width: 130 }} onChange={v => setByDesc(v === 'desc')}
          options={[{ value: 'num', label: 'Item Number' }, { value: 'desc', label: 'Description' }]} />
        <Input placeholder={byDesc ? 'e.g. TONER' : 'e.g. CC531'} value={term} onChange={e => setTerm(e.target.value)} onPressEnter={search} allowClear />
        <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={search} style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>Search</Button>
      </Space.Compact>
      {error ? <div style={{ color: REDWOOD.error, fontSize: 12, marginBottom: 8 }}><InfoCircleOutlined style={{ marginRight: 6 }} />{error}</div> : null}
      <Table size="small" columns={cols} dataSource={rows} rowKey="ItemNumber" loading={loading}
        rowSelection={{ selectedRowKeys: sel, onChange: setSel }}
        expandable={{
          rowExpandable: r => (costs[r.ItemNumber]?.n ?? 0) > 0,
          expandedRowRender: r => <ItemCostDetail item={r.ItemNumber} rows={costs[r.ItemNumber]?.rows ?? []} />,
        }}
        pagination={rows.length > 10 ? { pageSize: 10, size: 'small' } : false} scroll={{ y: 340 }}
        locale={{ emptyText: 'Search for items to add' }} />
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

  const submit = () => form.validateFields().then((v: any) => { onProceed(v); onClose(); }).catch(() => { /* show errors */ });

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
const NewOrderTab: React.FC<{ header: OrderHeader }> = ({ header }) => {
  const [form] = Form.useForm();
  const [hdr, setHdr] = useState<OrderHeader>(header);
  const bUnits = usePayablesBUs();
  const orgRows = useInvOrgs();
  const customers = useCustomers();
  const payTermOpts = useOrdsOptions(PAYMENT_TERMS_URL, PAY_TERM_KEYS, PAYMENT_TERMS);
  const salesRepOpts = useOrdsOptions(SALESREPS_URL, SALESREP_KEYS);
  const custOptions = useMemo(() => custOptionList(customers), [customers]);
  const [subs, setSubs] = useState<string[]>([]);
  const [lines, setLines] = useState<NewLine[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [posting, setPosting] = useState(false);
  const [resp, setResp] = useState<{ ok: boolean; status: number; body: string } | null>(null);
  const [taxAmt, setTaxAmt] = useState(0);
  const [discAmt, setDiscAmt] = useState(0);
  const [expAmt, setExpAmt] = useState(0);
  const ccy = hdr.txnCurrency;

  useEffect(() => { form.setFieldsValue(header as any); setHdr(header); /* init once */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    setSubs([]); syncHdr();
  };
  const onWh = (code: string) => { form.setFieldsValue({ subinventory: undefined }); loadSubs(code); syncHdr(); };
  const onCustomer = (name: string, opt: any) => { const row = opt?._c ?? customers.find(c => custName(c) === name); if (row) { const fill = customerFill(row); form.setFieldsValue(fill); setHdr(prev => ({ ...prev, ...fill })); } };

  const addItems = (items: any[]) => {
    setLines(prev => {
      const existing = new Set(prev.map(l => l.itemNumber));
      const add = items.filter(it => !existing.has(it.ItemNumber)).map((it, i) => ({
        key: `${it.ItemNumber}-${prev.length + i}`, itemNumber: it.ItemNumber,
        description: it.ItemDescription, uom: pf(it, ['PrimaryUOMValue', 'PrimaryUOMCode', 'UOMCode']), qty: 1, unitPrice: num(it._cost),
      }));
      return [...prev, ...add];
    });
  };
  const upd = (key: string, patch: Partial<NewLine>) => setLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l));
  const del = (key: string) => setLines(prev => prev.filter(l => l.key !== key));

  // Best-effort DOO order-import payload (finalise once the sample JSON is in).
  const buildPayload = () => {
    const src = `${hdr.orderType || 'SO'}-${Date.now()}`;
    return {
      SourceTransactionNumber: src, SourceTransactionSystem: 'OPS', SourceTransactionId: src,
      TransactionalCurrencyCode: hdr.txnCurrency,
      RequestingBusinessUnitName: hdr.businessUnit,
      ...(hdr.orderType ? { TransactionTypeCode: hdr.orderType } : {}),
      BuyingPartyName: hdr.customerName,
      ...(hdr.accountNumber ? { BuyingPartyNumber: hdr.accountNumber } : {}),
      ...(hdr.paymentTerms ? { PaymentTerms: hdr.paymentTerms } : {}),
      ...(hdr.salesRep ? { Salesperson: hdr.salesRep } : {}),
      ...(hdr.orderDate ? { RequestedShipDate: dayjs(hdr.orderDate).toISOString() } : {}),
      lines: lines.map((l, i) => ({
        SourceTransactionLineNumber: String(i + 1), SourceTransactionLineId: String(i + 1),
        SourceScheduleNumber: '1', SourceTransactionScheduleId: String(i + 1),
        ProductNumber: l.itemNumber, OrderedQuantity: l.qty,
        ...(l.uom ? { OrderedUOMCode: l.uom } : {}),
        ...(l.unitPrice ? { UnitListPrice: l.unitPrice, UnitSellingPrice: l.unitPrice } : {}),
        ...(hdr.warehouse ? { RequestingBusinessUnitName: hdr.businessUnit, ShipFromOrganizationCode: hdr.warehouse } : {}),
        ...(hdr.subinventory ? { SubinventoryCode: hdr.subinventory } : {}),
        ...(hdr.orderDate ? { RequestedShipDate: dayjs(hdr.orderDate).toISOString() } : {}),
      })),
    };
  };
  const payloadStr = useMemo(() => JSON.stringify(buildPayload(), null, 2), [lines, hdr]);

  const save = async () => {
    if (lines.length === 0) { message.warning('Add at least one line'); return; }
    setPosting(true); setResp(null);
    try {
      const r = await fetch(SO_CREATE_URL, { method: 'POST', headers: { ...FUSION_HDRS, 'Content-Type': 'application/json' }, body: payloadStr });
      const text = await r.text(); let pretty = text; try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* raw */ }
      setResp({ ok: r.ok, status: r.status, body: pretty });
      if (r.ok) message.success('Sales order created'); else message.error(`Create failed (HTTP ${r.status})`);
    } catch (e: any) { setResp({ ok: false, status: 0, body: e.message }); message.error(e.message); }
    finally { setPosting(false); }
  };

  const totQty = lines.reduce((s, l) => s + num(l.qty), 0);
  const totAmt = lines.reduce((s, l) => s + num(l.qty) * num(l.unitPrice), 0);

  const cols: ColumnsType<NewLine> = [
    { title: 'Line', width: 55, align: 'center', render: (_, __, i) => <Tag color="blue">{i + 1}</Tag> },
    { title: 'Item', dataIndex: 'itemNumber', width: 140, render: v => <Text strong style={{ color: REDWOOD.info, fontSize: 12 }}>{v}</Text> },
    { title: 'Description', dataIndex: 'description', width: 260, ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'UOM', dataIndex: 'uom', width: 80, render: v => v ?? '—' },
    { title: 'Qty', dataIndex: 'qty', width: 100, align: 'right', render: (v, r) => <InputNumber size="small" min={0} value={v} onChange={n => upd(r.key, { qty: Number(n) || 0 })} style={{ width: 84 }} /> },
    { title: 'Unit Price', dataIndex: 'unitPrice', width: 120, align: 'right', render: (v, r) => <InputNumber size="small" min={0} value={v} onChange={n => upd(r.key, { unitPrice: Number(n) || 0 })} style={{ width: 100 }} /> },
    { title: 'Line Total', width: 120, align: 'right', render: (_, r) => <Text strong style={{ color: REDWOOD.primary, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(num(r.qty) * num(r.unitPrice), ccy)}</Text> },
    { title: '', width: 44, align: 'center', render: (_, r) => <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => del(r.key)} /> },
  ];

  return (
    <div style={{ padding: '4px 2px' }}>
      <Card size="small" style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, marginBottom: 12 }}
        styles={{ body: { paddingTop: 4 } }}
        title={<Space><span style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${REDWOOD.primary}, ${REDWOOD.primary}bb)`, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}><BankOutlined /></span>
          <Text strong style={{ fontSize: 15 }}>New Sales Order</Text>
          <Tag color="purple">{hdr.orderType}</Tag><Tag>{hdr.txnCurrency}</Tag>{hdr.customerName && <Tag color="blue">{hdr.customerName}</Tag>}</Space>}
        extra={<Space>
          <Button icon={<CloudUploadOutlined />} onClick={() => setPreview(true)}>Payload</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={posting} onClick={save} style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}>Save Sales Order</Button>
        </Space>}>
        <Form form={form} layout="vertical" size="small" onValuesChange={(_c, all) => setHdr(prev => ({ ...prev, ...all }))}>
          <Tabs size="small" items={[
            {
              key: 'header', label: <span><BankOutlined style={{ marginRight: 5 }} />Header</span>,
              children: (
                <Row gutter={[12, 12]} align="stretch">
                  {/* S1 — Order */}
                  <Col xs={24} sm={12} md={6}><VSection icon={<BankOutlined />} title="Order" color={REDWOOD.primary}>
                    <Form.Item label="Business Unit" name="businessUnit" style={{ marginBottom: 10 }}>
                      <Select showSearch placeholder="Select" onChange={onBU} optionFilterProp="label"
                        options={bUnits.map(b => ({ value: b.businessUnitName, label: `${b.businessUnitName}${b.paymentCurrency ? ` — ${b.paymentCurrency}` : ''}` }))} /></Form.Item>
                    <Form.Item label="Order Date" name="orderDate" style={{ marginBottom: 10 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
                    <Form.Item label="Order Type" name="orderType" style={{ marginBottom: 10 }}><Input /></Form.Item>
                    <Form.Item label="BU Code" name="buCode" style={{ marginBottom: 10 }}><Input readOnly placeholder="—" /></Form.Item>
                  </VSection></Col>

                  {/* S2 — Customer Information */}
                  <Col xs={24} sm={12} md={6}><VSection icon={<ProfileOutlined />} title="Customer Information" color={REDWOOD.info}>
                    <Form.Item label="Customer Name" name="customerName" style={{ marginBottom: 10 }}>
                      <Select showSearch placeholder="Search customer" onChange={onCustomer} optionFilterProp="label" options={custOptions} notFoundContent={customers.length ? 'No match' : 'Loading…'} /></Form.Item>
                    <Form.Item label="Customer Number" name="accountNumber" style={{ marginBottom: 10 }}><Input readOnly placeholder="—" /></Form.Item>
                    <Form.Item label="Payment Terms" name="paymentTerms" style={{ marginBottom: 10 }}>
                      <Select showSearch optionFilterProp="label" options={payTermOpts} /></Form.Item>
                    <Form.Item label="Salesperson" name="salesRep" style={{ marginBottom: 10 }}>
                      <Select showSearch allowClear optionFilterProp="label" options={salesRepOpts} notFoundContent={salesRepOpts.length ? 'No match' : 'Loading…'} /></Form.Item>
                  </VSection></Col>

                  {/* S3 — Warehouse */}
                  <Col xs={24} sm={12} md={5}><VSection icon={<ShoppingOutlined />} title="Warehouse" color={REDWOOD.teal}>
                    <Form.Item label={<WarehouseLabel />} name="warehouse" style={{ marginBottom: 10 }}>
                      <Select showSearch placeholder={buName ? 'Organization' : 'Select BU first'} onChange={onWh} options={whOptions} optionFilterProp="label" /></Form.Item>
                    <Form.Item label="Sub Inventory" name="subinventory" style={{ marginBottom: 10 }}>
                      <Select showSearch notFoundContent="Pick a warehouse" options={subs.map(s => ({ value: s, label: s }))} /></Form.Item>
                    <Form.Item label="Base Currency" name="baseCurrency" style={{ marginBottom: 10 }}><Input readOnly placeholder="—" /></Form.Item>
                  </VSection></Col>

                  {/* S4 — Totals */}
                  <Col xs={24} sm={12} md={7}><VSection icon={<DollarOutlined />} title="Totals" color={REDWOOD.success}>
                    <Row gutter={8}>
                      <Col span={14}><Form.Item label="Transaction Currency" name="txnCurrency" style={{ marginBottom: 10 }}>
                        <Select showSearch options={CURRENCIES.map(c => ({ value: c, label: c }))} /></Form.Item></Col>
                      <Col span={10}><Form.Item label="Rate" name="rate" style={{ marginBottom: 10 }}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                    </Row>
                    <TotalLine label="Gross" value={fmtAmount(totAmt, ccy)} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: `1px dashed ${REDWOOD.neutral200}` }}>
                      <span style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Tax</span><InputNumber size="small" min={0} value={taxAmt} onChange={v => setTaxAmt(Number(v) || 0)} style={{ width: 120 }} /></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: `1px dashed ${REDWOOD.neutral200}` }}>
                      <span style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Discount</span><InputNumber size="small" min={0} value={discAmt} onChange={v => setDiscAmt(Number(v) || 0)} style={{ width: 120 }} /></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: `1px dashed ${REDWOOD.neutral200}` }}>
                      <span style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Expense</span><InputNumber size="small" min={0} value={expAmt} onChange={v => setExpAmt(Number(v) || 0)} style={{ width: 120 }} /></div>
                    <TotalLine label="Net (Trx Currency)" strong color={REDWOOD.primary} value={fmtAmount(totAmt + num(taxAmt) + num(expAmt) - num(discAmt), ccy)} />
                    <TotalLine label="Net (Base Currency)" strong color={REDWOOD.success} value={fmtAmount((totAmt + num(taxAmt) + num(expAmt) - num(discAmt)) * (num(hdr.rate) || 1), hdr.baseCurrency ?? ccy)} />
                  </VSection></Col>
                </Row>
              ),
            },
            {
              key: 'address', label: <span><ProfileOutlined style={{ marginRight: 5 }} />Customer Address</span>,
              children: (
                <OrderSection icon={<ProfileOutlined />} title="Bill-To / Ship-To" color={REDWOOD.info}>
                  <ROField label="Bill To Site" value={hdr.billToSite} mono span={6} />
                  <ROField label="Ship To Site" value={hdr.shipToSite} mono span={6} />
                  <ROField label="Account Number" value={hdr.accountNumber} span={6} />
                  <ROField label="Customer" value={hdr.customerName} span={6} />
                  <ROField label="Bill To Address" value={hdr.billToAddress} span={12} />
                  <ROField label="Ship To Address" value={hdr.shipToAddress} span={12} />
                </OrderSection>
              ),
            },
            { key: 'additional', label: <span><ProfileOutlined style={{ marginRight: 5 }} />Additional Info</span>,
              children: <OrderSection icon={<ProfileOutlined />} title="Additional Information" color={REDWOOD.purple}>
                <Col xs={24}><Form.Item label="Remarks" name="remarks" style={{ marginBottom: 12 }}><Input.TextArea rows={3} placeholder="Optional notes…" /></Form.Item></Col>
              </OrderSection> },
            { key: 'credit', label: <span><ReconciliationOutlined style={{ marginRight: 5 }} />Customer Credit Check</span>,
              children: <div style={{ padding: 8 }}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Customer credit check — connect the credit web service to show limit, exposure and available credit." style={{ padding: 24 }} /></div> },
            { key: 'validations', label: <span><InfoCircleOutlined style={{ marginRight: 5 }} />Order Validations</span>,
              children: <div style={{ padding: 8 }}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Order validations — item, warehouse and customer checks will appear here before submission." style={{ padding: 24 }} /></div> },
          ]} />
        </Form>
      </Card>

      <Card size="small" styles={{ body: { padding: 0 } }} style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
        title={<Space><UnorderedListOutlined style={{ color: REDWOOD.primary }} /><Text strong>Lines</Text>{lines.length > 0 && <Tag>{lines.length}</Tag>}</Space>}
        extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setPickOpen(true)} style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>Add Lines</Button>}>
        {lines.length === 0 ? <Empty description="No lines — use Add Lines to search items" style={{ padding: 30 }} />
          : <Table size="small" columns={cols} dataSource={lines} rowKey="key" pagination={false} scroll={{ x: 900, y: 360 }}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                    <Table.Summary.Cell index={0} colSpan={4} align="right"><Text strong>Total</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right"><Text strong>{fmtQty(totQty)}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={5} />
                    <Table.Summary.Cell index={6} align="right"><Text strong style={{ color: REDWOOD.primary }}>{fmtAmount(totAmt, ccy)}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={7} />
                  </Table.Summary.Row>
                </Table.Summary>
              )} />}
      </Card>

      <ItemSearchModal open={pickOpen} org={header.warehouse} onClose={() => setPickOpen(false)} onAdd={addItems} />

      <Modal open={preview} onCancel={() => setPreview(false)} maskClosable={false} width={760}
        title={<Space><CloudUploadOutlined style={{ color: REDWOOD.primary }} /> Create Order payload</Space>}
        footer={<Space>
          <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(payloadStr); message.success('Copied'); }}>Copy</Button>
          <Button onClick={() => setPreview(false)}>Close</Button>
        </Space>}>
        <div style={{ fontSize: 12, marginBottom: 8 }}><Tag color="green">POST</Tag><Text style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.info, wordBreak: 'break-all' }}>{SO_CREATE_URL}</Text></div>
        <div style={{ maxHeight: 360, overflow: 'auto', background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 6, padding: 12 }}>
          <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{payloadStr}</pre>
        </div>
      </Modal>

      {resp && (
        <Modal open onCancel={() => setResp(null)} maskClosable={false} width={760}
          title={<Space>{resp.ok ? <SaveOutlined style={{ color: REDWOOD.success }} /> : <InfoCircleOutlined style={{ color: REDWOOD.error }} />} Create Order — {resp.status === 0 ? 'Network Error' : `HTTP ${resp.status}`}</Space>}
          footer={<Button onClick={() => setResp(null)}>Close</Button>}>
          <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 420, overflow: 'auto', background: REDWOOD.neutral100, padding: 12, borderRadius: 6 }}>{resp.body}</pre>
        </Modal>
      )}
    </div>
  );
};

const SalesOrders: React.FC = () => {
  const [openTabs, setOpenTabs] = useState<{ key: string; order: any }[]>([]);
  const [newTabs, setNewTabs] = useState<{ key: string; header: OrderHeader }[]>([]);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [activeKey, setActiveKey] = useState('search');

  const openOrder = useCallback((order: any) => {
    const key = String(order.OrderKey ?? order.HeaderId ?? order.OrderNumber);
    setOpenTabs(prev => (prev.some(t => t.key === key) ? prev : [...prev, { key, order }]));
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

  const items = [
    {
      key: 'search',
      label: <span><SearchOutlined style={{ marginRight: 5 }} />Search</span>,
      closable: false,
      children: <SearchTab onOpen={openOrder} />,
    },
    ...newTabs.map((t, i) => ({
      key: t.key,
      label: <span><PlusOutlined style={{ marginRight: 5 }} />New Order{newTabs.length > 1 ? ` ${i + 1}` : ''}</span>,
      closable: true,
      children: <NewOrderTab header={t.header} />,
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
            tabBarExtraContent={<Button type="primary" icon={<PlusOutlined />} onClick={() => setRegisterOpen(true)}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>Create New Order</Button>}
            items={items} />
        </div>

        <RegisterOrderModal open={registerOpen} onClose={() => setRegisterOpen(false)} onProceed={proceedNewOrder} />
      </Content>
    </Layout>
  );
};

export default SalesOrders;
