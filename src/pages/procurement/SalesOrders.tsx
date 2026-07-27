import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Layout, Breadcrumb, Card, Table, Form, Input, Select, DatePicker, Button,
  Tag, Typography, Space, Tooltip, Spin, Row, Col, message, Modal, Empty, Tabs,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, ProfileOutlined, SearchOutlined, ReloadOutlined, ClearOutlined,
  ApiOutlined, CopyOutlined, InfoCircleOutlined, ExportOutlined, BankOutlined,
  UnorderedListOutlined, ShoppingOutlined, DollarOutlined, PrinterOutlined, DownloadOutlined,
  ReconciliationOutlined,
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

// Loads a child collection href and shows it as a generic table (accounting…).
const ChildDataModal: React.FC<{ href: string | null; title: string; onClose: () => void }> = ({ href, title, onClose }) => {
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
  useEffect(() => { if (href) load(); }, [href, load]);
  const cols = useMemo(() => dynamicColumns(items), [items]);
  return (
    <Modal open={!!href} onCancel={onClose} maskClosable={false} width={960} title={<Space><ProfileOutlined style={{ color: REDWOOD.info }} /> {title}</Space>}
      footer={<Button onClick={onClose}>Close</Button>}>
      {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        : error ? <div style={{ color: REDWOOD.error, fontSize: 12 }}><InfoCircleOutlined style={{ marginRight: 6 }} />{error}</div>
        : items.length === 0 ? <Empty description="No records" style={{ padding: 30 }} />
        : <Table size="small" columns={cols} dataSource={items} rowKey={(_, i) => `cd-${i}`}
            pagination={items.length > 20 ? { pageSize: 20, size: 'small' } : false} scroll={{ x: 'max-content', y: 400 }} />}
    </Modal>
  );
};

const ARInvoiceDialog: React.FC<{ txn: string | null; onClose: () => void }> = ({ txn, onClose }) => {
  const [inv, setInv] = useState<any | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [allOpen, setAllOpen] = useState(false);
  const [acctHref, setAcctHref] = useState<string | null>(null);

  const url = txn ? `${FUSION_BASE}/${AR_RES}?q=${encodeURIComponent(`TransactionNumber=${txn}`)}&limit=1` : '';
  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true); setError(''); setInv(null); setLines([]);
    try {
      const r = await fetch(url, { headers: FUSION_HDRS });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      const d = await r.json();
      const h = (d.items ?? [])[0];
      if (!h) { setError(`No AR invoice found for transaction ${txn}`); return; }
      setInv(h);
      const lh = h.links?.find((l: any) => l.name === AR_LINES)?.href
        ?? (h.CustomerTransactionId ? `${FUSION_BASE}/${AR_RES}/${h.CustomerTransactionId}/child/${AR_LINES}` : '');
      if (lh) { try { setLines(await fetchAllPages(lh)); } catch { /* lines optional */ } }
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
  const taxTotal = num(pf(inv, ['TaxAmount', 'TotalTax']) ?? lines.filter(l => typeOf(l).includes('TAX')).reduce((s, l) => s + amtOf(l), 0));
  const freight = num(pf(inv, ['FreightAmount', 'Freight']) ?? lines.filter(l => typeOf(l).includes('FREIGHT')).reduce((s, l) => s + amtOf(l), 0));
  const charges = num(pf(inv, ['ChargeAmount', 'Charges']) ?? lines.filter(l => typeOf(l).includes('CHARGE')).reduce((s, l) => s + amtOf(l), 0));
  const total = num(pf(inv, ['TransactionTotal', 'InvoiceAmount', 'TotalAmount', 'EnteredAmount']) ?? (linesTotal + taxTotal + freight + charges));

  // Detect an accounting / distributions child link on the header or lines.
  const acctLink = useMemo(() => {
    const hit = (inv?.links ?? []).find((l: any) => l.rel === 'child' && /account|distribut|journal/i.test(l.name ?? ''));
    if (hit) return hit.href;
    const lhit = (lines[0]?.links ?? []).find((l: any) => l.rel === 'child' && /account|distribut|journal/i.test(l.name ?? ''));
    return lhit?.href;
  }, [inv, lines]);

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
        {acctLink && <Button size="small" icon={<ReconciliationOutlined />} style={{ borderColor: REDWOOD.purple, color: REDWOOD.purple }} onClick={() => setAcctHref(acctLink)}>View Accounting</Button>}
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
      <ChildDataModal href={acctHref} title="Invoice Accounting" onClose={() => setAcctHref(null)} />
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
const SalesOrders: React.FC = () => {
  const [openTabs, setOpenTabs] = useState<{ key: string; order: any }[]>([]);
  const [activeKey, setActiveKey] = useState('search');

  const openOrder = useCallback((order: any) => {
    const key = String(order.OrderKey ?? order.HeaderId ?? order.OrderNumber);
    setOpenTabs(prev => (prev.some(t => t.key === key) ? prev : [...prev, { key, order }]));
    setActiveKey(key);
  }, []);

  const removeTab = (key: string) => {
    setOpenTabs(prev => prev.filter(t => t.key !== key));
    setActiveKey(cur => (cur === key ? 'search' : cur));
  };

  const items = [
    {
      key: 'search',
      label: <span><SearchOutlined style={{ marginRight: 5 }} />Search</span>,
      closable: false,
      children: <SearchTab onOpen={openOrder} />,
    },
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
            items={items} />
        </div>
      </Content>
    </Layout>
  );
};

export default SalesOrders;
