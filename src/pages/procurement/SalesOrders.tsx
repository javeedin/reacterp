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
const TotalsSummary: React.FC<{ items: any[] }> = ({ items }) => {
  if (!items.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No totals" style={{ padding: 20 }} />;
  const ccy = items.find(i => i.CurrencyCode)?.CurrencyCode;
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
        : <TotalsSummary items={items} />}
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
  const totals = useTotals(order, true);

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
    ...dynamicColumns(lines, [
      'DisplayLineNumber', 'LineNumber', 'ProductNumber', 'ProductDescription', 'OrderedQuantity', 'OrderedUOM',
      'UnitListPrice', 'UnitSellingPrice', 'Status', 'StatusCode', 'RequestedShipDate', 'InventoryOrganizationCode',
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
                : <TotalsSummary items={totals.items} />}
            </div>
          </Col>
        </Row>
      </Card>

      {/* Lines */}
      <Card size="small" styles={{ body: { padding: 0 } }} style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, marginTop: 12 }}
        title={<Space><UnorderedListOutlined style={{ color: REDWOOD.primary }} /><Text strong>Lines</Text>
          {lines.length > 0 && <Tag>{lines.length}</Tag>}</Space>}
        extra={<Space>
          <Tooltip title={<span style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}><b>GET</b> {linesHref}</span>}>
            <Button size="small" type="text" icon={<ApiOutlined />} style={{ color: REDWOOD.info }} />
          </Tooltip>
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={loadLines}>Reload</Button>
        </Space>}>
        {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          : error ? <div style={{ color: REDWOOD.error, fontSize: 12, padding: 16 }}><InfoCircleOutlined style={{ marginRight: 6 }} />{error}</div>
          : lines.length === 0 ? <Empty description="No lines" style={{ padding: 30 }} />
          : <Table size="small" columns={lineCols} dataSource={lines} rowKey={(r, i) => `${r.LineId ?? r.FulfillLineId ?? i}`}
              pagination={lines.length > 25 ? { pageSize: 25, size: 'small' } : false} scroll={{ x: 'max-content', y: 420 }} />}
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
      label: <span><ShoppingOutlined style={{ marginRight: 5 }} />Order {t.order.OrderNumber}</span>,
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
