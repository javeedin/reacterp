import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Form, Input, Select,
  DatePicker, Row, Col, Space, Tag, Tabs, message, Spin, Empty, Divider,
  Modal, Tooltip, Statistic, Badge, Dropdown,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
  HomeOutlined, ShoppingCartOutlined, SearchOutlined, ReloadOutlined,
  EyeOutlined, PrinterOutlined, CloseOutlined, CheckCircleOutlined,
  InfoCircleOutlined, UnorderedListOutlined, ApiOutlined, CopyOutlined,
  PlusOutlined, BankOutlined, UserOutlined, CalendarOutlined,
  DollarOutlined, FileTextOutlined, DownOutlined, FilePdfOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import CreatePurchaseOrder from './CreatePurchaseOrder';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

// ── Redwood palette ──────────────────────────────────────────────────────────
const REDWOOD = {
  primary: '#C74634', primaryLight: '#E85D4A', primaryDark: '#A33B2C',
  success: '#1D7B4D', warning: '#B07700', info: '#0572CE', error: '#D93025',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

// ── Oracle Fusion API config ─────────────────────────────────────────────────
const BASE_URL = 'https://iacney-test.fa.ocs.oraclecloud.com/fscmRestApi/resources/11.13.18.05';
const AUTH_HEADER = 'Basic ' + btoa('emparun:Fusion@1234');
const PAGE_SIZE = 25;
const CHILD_LIMIT = 500;

// Strips existing limit/offset params then paginates until hasMore=false
const fetchAllPages = async (baseUrl: string): Promise<any[]> => {
  const stripped = baseUrl.replace(/[?&]limit=\d+/gi, '').replace(/[?&]offset=\d+/gi, '').replace(/\?&/, '?').replace(/&&/g, '&');
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const sep = stripped.includes('?') ? '&' : '?';
    const url = `${stripped}${sep}limit=${CHILD_LIMIT}&offset=${offset}`;
    const r = await fetch(url, { headers: { Authorization: AUTH_HEADER, Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
    const d = await r.json();
    const items: any[] = Array.isArray(d) ? d : (d.items ?? []);
    all.push(...items);
    if (!d.hasMore || items.length < CHILD_LIMIT) break;
    offset += CHILD_LIMIT;
  }
  return all;
};

// ── Types ────────────────────────────────────────────────────────────────────
interface RawPO {
  POHeaderId: number;
  OrderNumber: string;
  StatusCode: string;
  Status: string;
  DocumentStyle: string;
  SoldToLegalEntity: string;
  SupplierId: number;
  Supplier: string;
  SupplierSite: string;
  SupplierContact?: string;
  Buyer: string;
  BuyerDisplayName: string;
  RequesterDisplayName: string;
  ProcurementBU: string;
  RequisitioningBU: string;
  BillToBU: string;
  CurrencyCode: string;
  Currency: string;
  PaymentTerms: string;
  ConversionRate?: number;
  ConversionRateType?: string;
  OrderDate: string;
  CreationDate: string;
  LastUpdateDate: string;
  CreatedBy: string;
  LastUpdatedBy: string;
  ShipToLocationAddress?: string;
  BillToLocationAddress?: string;
  ShipToLocationCode?: string;
  NoteToSupplier?: string;
  NoteToReceiver?: string;
  Ordered: number;
  TotalTax: number;
  Total: number;
  Requisition?: string;
  SalesOrder?: string;
  Negotiation?: string;
  Description?: string;
  links?: Array<{ rel: string; href: string; name: string; kind: string }>;
}

interface POLine {
  POLineId: number;
  LineNumber: number;
  LineType?: string;
  Item?: string;
  Description: string;
  Category?: string;
  UOM?: string;
  Quantity: number;
  QuantityReceived?: number;
  QuantityBilled?: number;
  BasePrice: number;
  Price: number;
  Ordered: number;
  TotalTax?: number;
  Total: number;
  StatusCode?: string;
  Status?: string;
  NeedByDate?: string;
  ShipToLocationAddress?: string;
  CurrencyCode?: string;
  links?: Array<{ rel: string; href: string; name: string; kind: string }>;
}

interface POSchedule {
  _lineNumber: number;
  _lineItem?: string;
  _lineDescription?: string;
  ShipmentNumber?: number;
  LineLocationId?: number;
  ShipToLocationId?: number;
  ShipToLocationCode?: string;
  ShipToLocation?: string;
  ShipToLocationAddress?: string;
  DestinationType?: string;
  DestinationTypeCode?: string;
  UOM?: string;
  Quantity?: number;
  QuantityOrdered?: number;
  QuantityReceived?: number;
  QuantityBilled?: number;
  NeedByDate?: string;
  PromisedDate?: string;
  ShipToOrganizationId?: number;
  ShipToOrganizationCode?: string;
  ShipToOrganizationName?: string;
  MatchApprovalLevel?: string;
  MatchApprovalLevelCode?: string;
  InspectionRequired?: string;
  ReceiptRequired?: string;
  Amount?: number;
  Price?: number;
  BasePrice?: number;
  StatusCode?: string;
  Status?: string;
  ClosedCode?: string;
  ClosedReason?: string;
  AccrualOnReceiptFlag?: string;
  [key: string]: any;
}

interface SearchParams {
  orderNumber?: string;
  supplier?: string;
  statusCode?: string;
  dateRange?: [Dayjs, Dayjs] | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtAmt = (val?: number | null, ccy?: string) => {
  if (val == null) return '—';
  const s = new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  return ccy ? `${s} ${ccy}` : s;
};

const fmtDate = (d?: string) => {
  if (!d) return '—';
  try { return dayjs(d).format('D-MMM-YYYY'); } catch { return d; }
};

const statusConfig: Record<string, { tagColor: string; label: string }> = {
  OPEN:                  { tagColor: 'blue',    label: 'Open' },
  APPROVED:              { tagColor: 'green',   label: 'Approved' },
  CLOSED:                { tagColor: 'default', label: 'Closed' },
  'CLOSED FOR RECEIVING':{ tagColor: 'orange',  label: 'Closed for Receiving' },
  INCOMPLETE:            { tagColor: 'red',     label: 'Incomplete' },
  'IN PROCESS':          { tagColor: 'purple',  label: 'In Process' },
};

const getStatusTag = (status?: string) => {
  if (!status) return <Tag>—</Tag>;
  const cfg = statusConfig[status.toUpperCase()] ?? { tagColor: 'default', label: status };
  return <Tag color={cfg.tagColor} style={{ fontSize: 11, borderRadius: 4 }}>{cfg.label}</Tag>;
};

const buildQParam = (p: SearchParams): string => {
  const parts: string[] = [];
  if (p.orderNumber) parts.push(`OrderNumber like "${p.orderNumber}*"`);
  if (p.supplier)    parts.push(`Supplier like "${p.supplier}*"`);
  if (p.statusCode)  parts.push(`StatusCode="${p.statusCode}"`);
  if (p.dateRange?.[0]) parts.push(`OrderDate>="${p.dateRange[0].format('YYYY-MM-DD')}"`);
  if (p.dateRange?.[1]) parts.push(`OrderDate<="${p.dateRange[1].format('YYYY-MM-DD')}"`);
  return parts.join(';');
};

// ── PO Detail Page (shown as a tab) ─────────────────────────────────────────
const PODetailPage: React.FC<{ po: RawPO; onClose?: () => void }> = ({ po, onClose }) => {
  const [lines, setLines]           = useState<POLine[]>([]);
  const [linesLoading, setLL]       = useState(false);
  const [linesError, setLE]         = useState<string | null>(null);
  const [linesUrl, setLinesUrl]     = useState('');
  const [rawResponse, setRawResp]   = useState('');
  const [apiOpen, setApiOpen]       = useState(false);
  const [apiTestLoading, setATL]    = useState(false);
  const [apiResult, setApiResult]   = useState<{ status: number; body: string } | null>(null);

  const [linesSubTab, setLinesSubTab]         = useState<'lines' | 'schedules'>('lines');
  const [schedules, setSchedules]             = useState<POSchedule[]>([]);
  const [schLoading, setSchLoading]           = useState(false);
  const [schError, setSchError]               = useState<string | null>(null);
  const [schFetched, setSchFetched]           = useState(false);
  const [schDetailRecord, setSchDetailRecord] = useState<POSchedule | null>(null);

  const doFetch = useCallback(async (url: string) => {
    setLL(true); setLE(null); setRawResp('');
    try {
      const items: POLine[] = await fetchAllPages(url);
      setRawResp(JSON.stringify(items, null, 2));
      setLines(items);
      if (items.length === 0) setLE('API returned 0 items.');
    } catch (e: any) {
      setLE(e.message);
    } finally { setLL(false); }
  }, []);

  const fetchSchedules = useCallback(async (linesList: POLine[]) => {
    if (linesList.length === 0) return;
    setSchLoading(true); setSchError(null);
    try {
      const results = await Promise.allSettled(
        linesList.map(async (line) => {
          const schedLink = line.links?.find(l => l.name === 'schedules')?.href;
          const base = schedLink ?? `${BASE_URL}/purchaseOrders/${po.POHeaderId}/child/lines/${line.POLineId}/child/schedules`;
          const items = await fetchAllPages(base);
          return items.map(s => ({ ...s, _lineNumber: line.LineNumber, _lineItem: line.Item, _lineDescription: line.Description }));
        })
      );
      const all: POSchedule[] = [];
      const errors: string[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') all.push(...r.value);
        else errors.push(`Line ${linesList[i].LineNumber}: ${(r as any).reason?.message ?? 'failed'}`);
      });
      setSchedules(all);
      setSchFetched(true);
      if (errors.length > 0) setSchError(errors.join(' | '));
    } catch (e: any) {
      setSchError(e.message);
    } finally { setSchLoading(false); }
  }, [po.POHeaderId]);

  useEffect(() => {
    const base = po.links?.find(l => l.name === 'lines')?.href
      ?? `${BASE_URL}/purchaseOrders/${po.POHeaderId}/child/lines`;
    setLinesUrl(base);
    doFetch(base);
  }, [po.POHeaderId, doFetch]);

  const handleApiTest = async () => {
    setATL(true); setApiResult(null);
    try {
      const r = await fetch(linesUrl, { headers: { Authorization: AUTH_HEADER, Accept: 'application/json' } });
      const body = await r.text();
      let pretty = body;
      try { pretty = JSON.stringify(JSON.parse(body), null, 2); } catch { /* keep raw */ }
      setApiResult({ status: r.status, body: pretty });
    } catch (e: any) {
      setApiResult({ status: 0, body: `Network error: ${e.message}` });
    } finally { setATL(false); }
  };

  const handleViewPDF = () => {
    const win = window.open('', '_blank', 'width=960,height=780');
    if (!win) { message.error('Allow popups to view PDF preview'); return; }
    const linesHtml = lines.map((l, i) => `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f7f7f7'}">
        <td>${l.LineNumber}</td>
        <td>${l.LineType ?? '—'}</td>
        <td><strong>${l.Item ?? '—'}</strong></td>
        <td>${l.Description ?? '—'}</td>
        <td>${l.UOM ?? '—'}</td>
        <td style="text-align:right">${l.Quantity ?? '—'}</td>
        <td style="text-align:right">${fmtAmt(l.Price)}</td>
        <td style="text-align:right">${fmtAmt(l.Ordered)}</td>
        <td style="text-align:right">${fmtAmt(l.TotalTax)}</td>
        <td style="text-align:right;color:#C74634;font-weight:700">${fmtAmt(l.Total)}</td>
        <td>${l.StatusCode ?? l.Status ?? '—'}</td>
      </tr>`).join('');
    win.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>PO ${po.OrderNumber}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1a1a1a;padding:32px;background:#fff}
  .toolbar{display:flex;justify-content:flex-end;gap:8px;margin-bottom:24px}
  .btn{padding:7px 18px;border-radius:4px;border:none;cursor:pointer;font-size:12px;font-weight:600}
  .btn-red{background:#C74634;color:#fff}.btn-def{background:#f5f5f5;color:#333;border:1px solid #d9d9d9}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:3px solid #C74634;margin-bottom:20px}
  .po-no{font-size:24px;font-weight:800}.po-lbl{font-size:10px;font-weight:700;text-transform:uppercase;color:#6b6b6b;letter-spacing:.08em}
  .sup{font-size:13px;color:#6b6b6b;margin-top:4px}
  .status{display:inline-block;font-size:11px;padding:2px 10px;border-radius:4px;margin-top:8px;font-weight:600;background:#e6f4ff;color:#0572CE}
  .amts{display:flex;gap:20px;text-align:right}
  .amt-lbl{font-size:10px;font-weight:700;text-transform:uppercase;color:#6b6b6b}
  .amt-val{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}
  .amt-tot{font-size:22px;font-weight:800;color:#C74634}
  .sec{font-size:10px;font-weight:700;text-transform:uppercase;color:#C74634;letter-spacing:.06em;border-bottom:1px solid #f0d0cc;padding-bottom:4px;margin:18px 0 10px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
  .fl{font-size:10px;font-weight:700;text-transform:uppercase;color:#6b6b6b}
  .fv{font-size:12px;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px}
  th{background:#f7f7f7;padding:6px 8px;text-align:left;border:1px solid #e5e5e5;font-weight:700;font-size:10px;text-transform:uppercase;color:#6b6b6b}
  td{padding:5px 8px;border:1px solid #e5e5e5}
  .tr-tot td{font-weight:700;background:#f0f0f0}
  .footer{margin-top:20px;font-size:10px;color:#6b6b6b;text-align:right}
  @media print{.toolbar{display:none}body{padding:16px}}
</style></head><body>
<div class="toolbar">
  <button class="btn btn-def" onclick="window.close()">Close</button>
  <button class="btn btn-red" onclick="window.print()">🖨&nbsp; Print / Save as PDF</button>
</div>
<div class="hdr">
  <div>
    <div class="po-lbl">Purchase Order</div>
    <div class="po-no">${po.OrderNumber}</div>
    <div class="sup">${po.Supplier ?? '—'}${po.SupplierSite ? ' &nbsp;·&nbsp; ' + po.SupplierSite : ''}</div>
    <div><span class="status">${po.StatusCode ?? ''}</span></div>
  </div>
  <div class="amts">
    <div><div class="amt-lbl">Ordered</div><div class="amt-val">${fmtAmt(po.Ordered)}</div><div style="font-size:10px;color:#6b6b6b">${po.CurrencyCode}</div></div>
    <div><div class="amt-lbl">Tax</div><div class="amt-val">${fmtAmt(po.TotalTax)}</div><div style="font-size:10px;color:#6b6b6b">${po.CurrencyCode}</div></div>
    <div style="border-left:2px solid #e5e5e5;padding-left:16px"><div class="amt-lbl">Total</div><div class="amt-tot">${fmtAmt(po.Total)}</div><div style="font-size:10px;color:#6b6b6b">${po.CurrencyCode}</div></div>
  </div>
</div>
<div class="sec">General</div>
<div class="grid">
  <div><div class="fl">Document Style</div><div class="fv">${po.DocumentStyle ?? '—'}</div></div>
  <div><div class="fl">Order Date</div><div class="fv">${fmtDate(po.OrderDate)}</div></div>
  <div><div class="fl">Created</div><div class="fv">${fmtDate(po.CreationDate)}</div></div>
  <div><div class="fl">Last Updated</div><div class="fv">${fmtDate(po.LastUpdateDate)}</div></div>
</div>
<div class="sec">Legal Entity &amp; Supplier</div>
<div class="grid">
  <div><div class="fl">Legal Entity</div><div class="fv"><strong>${po.SoldToLegalEntity ?? '—'}</strong></div></div>
  <div><div class="fl">Supplier</div><div class="fv"><strong>${po.Supplier ?? '—'}</strong></div></div>
  <div><div class="fl">Supplier Site</div><div class="fv">${po.SupplierSite ?? '—'}</div></div>
  <div><div class="fl">Supplier Contact</div><div class="fv">${po.SupplierContact ?? '—'}</div></div>
</div>
<div class="sec">People &amp; Organizations</div>
<div class="grid">
  <div><div class="fl">Buyer</div><div class="fv">${po.BuyerDisplayName ?? po.Buyer ?? '—'}</div></div>
  <div><div class="fl">Requester</div><div class="fv">${po.RequesterDisplayName ?? '—'}</div></div>
  <div><div class="fl">Procurement BU</div><div class="fv">${po.ProcurementBU ?? '—'}</div></div>
  <div><div class="fl">Currency / Terms</div><div class="fv">${po.CurrencyCode} · ${po.PaymentTerms ?? '—'}</div></div>
</div>
${po.NoteToSupplier ? `<div class="sec">Notes</div><div class="fv">${po.NoteToSupplier}</div>` : ''}
<div class="sec">Order Lines</div>
<table>
  <thead><tr>
    <th>#</th><th>Type</th><th>Item</th><th>Description</th><th>UOM</th>
    <th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th>
    <th style="text-align:right">Ordered</th><th style="text-align:right">Tax</th>
    <th style="text-align:right">Total</th><th>Status</th>
  </tr></thead>
  <tbody>
    ${linesHtml || '<tr><td colspan="11" style="text-align:center;padding:16px;color:#6b6b6b">No lines loaded</td></tr>'}
    <tr class="tr-tot">
      <td colspan="7" style="text-align:right">Grand Total</td>
      <td style="text-align:right">${fmtAmt(lines.reduce((s, l) => s + (l.Ordered ?? 0), 0))}</td>
      <td style="text-align:right">${fmtAmt(lines.reduce((s, l) => s + (l.TotalTax ?? 0), 0))}</td>
      <td style="text-align:right;color:#C74634">${fmtAmt(lines.reduce((s, l) => s + (l.Total ?? 0), 0))}</td>
      <td></td>
    </tr>
  </tbody>
</table>
<div class="footer">Generated ${new Date().toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
</body></html>`);
    win.document.close();
  };

  const handleRefresh = () => {
    const base = po.links?.find(l => l.name === 'lines')?.href
      ?? `${BASE_URL}/purchaseOrders/${po.POHeaderId}/child/lines`;
    doFetch(base);
    message.success('Lines refreshed');
  };

  const actionMenuItems: MenuProps['items'] = [
    { key: 'edit',      label: 'Edit' },
    { key: 'delete',    label: 'Delete', danger: true },
    { type: 'divider' },
    { key: 'acknowledge',  label: 'Acknowledge' },
    { key: 'communicate',  label: 'Communicate' },
    { type: 'divider' },
    { key: 'cancel',    label: 'Cancel Document', danger: true },
    { key: 'close',     label: 'Close' },
    { key: 'reopen',    label: 'Reopen' },
    { key: 'hold',      label: 'Hold' },
    { key: 'freeze',    label: 'Freeze' },
    { key: 'withdraw',  label: 'Withdraw', danger: true },
    { type: 'divider' },
    { key: 'docHistory',    label: 'View Document History' },
    { key: 'changeHistory', label: 'View Change History' },
    { key: 'revHistory',    label: 'View Revision History' },
  ];

  const handleActionClick: MenuProps['onClick'] = ({ key }) => {
    message.info(`"${actionMenuItems.find(i => i && 'key' in i && i.key === key) ? (actionMenuItems.find(i => i && 'key' in i && i.key === key) as any).label : key}" not yet implemented`);
  };

  const LabelVal: React.FC<{ label: string; value?: React.ReactNode; wide?: boolean }> = ({ label, value, wide }) => (
    <Col xs={24} sm={wide ? 24 : 12} md={wide ? 12 : 6}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, color: REDWOOD.neutral900, fontWeight: 400 }}>{value ?? '—'}</div>
      </div>
    </Col>
  );

  const SectionHead: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
    <Col xs={24}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 12, fontWeight: 700, color: REDWOOD.primary,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        borderBottom: `2px solid ${REDWOOD.primary}25`,
        paddingBottom: 6, marginTop: 8, marginBottom: 4,
      }}>
        {icon} {title}
      </div>
    </Col>
  );

  const lineColumns: ColumnsType<POLine> = [
    { title: '#', dataIndex: 'LineNumber', width: 48, align: 'center',
      render: v => <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>{v}</Text> },
    { title: 'Type', dataIndex: 'LineType', width: 80,
      render: v => <Tag style={{ fontSize: 11 }}>{v ?? '—'}</Tag> },
    { title: 'Item', dataIndex: 'Item', width: 130,
      render: v => <Text style={{ fontSize: 12, fontWeight: 600, color: REDWOOD.info }}>{v ?? '—'}</Text> },
    { title: 'Description', dataIndex: 'Description', ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Category', dataIndex: 'Category', width: 90,
      render: v => <Tag style={{ fontSize: 11 }}>{v ?? '—'}</Tag> },
    { title: 'UOM', dataIndex: 'UOM', width: 60, align: 'center',
      render: v => <Tag style={{ fontSize: 11 }}>{v ?? '—'}</Tag> },
    { title: 'Qty', dataIndex: 'Quantity', width: 90, align: 'right',
      render: v => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Base Price', dataIndex: 'BasePrice', width: 100, align: 'right',
      render: v => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: REDWOOD.neutral600 }}>{fmtAmt(v)}</Text> },
    { title: 'Unit Price', dataIndex: 'Price', width: 100, align: 'right',
      render: v => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmtAmt(v)}</Text> },
    { title: 'Ordered Amt', dataIndex: 'Ordered', width: 120, align: 'right',
      render: v => <Text strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmtAmt(v)}</Text> },
    { title: 'Tax', dataIndex: 'TotalTax', width: 90, align: 'right',
      render: v => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmtAmt(v)}</Text> },
    { title: 'Total', dataIndex: 'Total', width: 120, align: 'right',
      render: v => <Text strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: REDWOOD.primary }}>{fmtAmt(v)}</Text> },
    { title: 'Status', dataIndex: 'StatusCode', width: 160,
      render: (v, rec) => getStatusTag(v ?? rec.Status) },
    { title: 'Need-By', dataIndex: 'NeedByDate', width: 110, render: d => fmtDate(d) },
  ];

  const scheduleColumns: ColumnsType<POSchedule> = [
    { title: 'Line', dataIndex: '_lineNumber', width: 55, fixed: 'left', align: 'center',
      render: v => <Tag color="blue" style={{ fontSize: 11 }}>{v}</Tag> },
    { title: 'Sched #', dataIndex: 'ShipmentNumber', width: 72, align: 'center',
      render: v => <Text style={{ fontSize: 12, fontWeight: 600 }}>{v ?? '—'}</Text> },
    { title: 'Item', dataIndex: '_lineItem', width: 120,
      render: v => <Text style={{ fontSize: 12, fontWeight: 600, color: REDWOOD.info }}>{v ?? '—'}</Text> },
    { title: 'Description', dataIndex: '_lineDescription', ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Ship To Location', dataIndex: 'ShipToLocationCode', width: 145,
      render: (v, rec) => (
        <Tooltip title={rec.ShipToLocation ?? rec.ShipToLocationAddress ?? ''}>
          <Text style={{ fontSize: 12, color: REDWOOD.info, cursor: 'help' }}>{v ?? rec.ShipToLocation ?? '—'}</Text>
        </Tooltip>
      ) },
    { title: 'Destination Type', dataIndex: 'DestinationType', width: 130,
      render: (v, rec) => <Tag style={{ fontSize: 11 }}>{v ?? rec.DestinationTypeCode ?? '—'}</Tag> },
    { title: 'Ship To Org', dataIndex: 'ShipToOrganizationName', width: 165, ellipsis: true,
      render: (v, rec) => (
        <div>
          <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text>
          {rec.ShipToOrganizationCode && (
            <div style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{rec.ShipToOrganizationCode}</div>
          )}
        </div>
      ) },
    { title: 'UOM', dataIndex: 'UOM', width: 62, align: 'center',
      render: v => <Tag style={{ fontSize: 11 }}>{v ?? '—'}</Tag> },
    { title: 'Qty', dataIndex: 'Quantity', width: 80, align: 'right',
      render: (v, rec) => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{v ?? rec.QuantityOrdered ?? '—'}</Text> },
    { title: 'Qty Received', dataIndex: 'QuantityReceived', width: 100, align: 'right',
      render: v => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: (v ?? 0) > 0 ? REDWOOD.success : undefined }}>{v ?? 0}</Text> },
    { title: 'Match Approval', dataIndex: 'MatchApprovalLevel', width: 120,
      render: (v, rec) => <Tag style={{ fontSize: 11 }}>{v ?? rec.MatchApprovalLevelCode ?? '—'}</Tag> },
    { title: 'Need By', dataIndex: 'NeedByDate', width: 110, render: d => fmtDate(d) },
    { title: 'Status', dataIndex: 'StatusCode', width: 130,
      render: (v, rec) => getStatusTag(v ?? rec.Status) },
    { title: '', key: 'details', width: 46, fixed: 'right', align: 'center',
      render: (_, rec) => (
        <Tooltip title="More details">
          <Button size="small" type="text" icon={<InfoCircleOutlined />}
            style={{ color: REDWOOD.info }}
            onClick={() => setSchDetailRecord(rec)} />
        </Tooltip>
      ) },
  ];

  return (
    <div style={{ background: REDWOOD.neutral100, minHeight: '100%' }}>

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div style={{
        background: REDWOOD.surface,
        padding: '10px 20px',
        borderBottom: `1px solid ${REDWOOD.neutral200}`,
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
      }}>
        <Button
          icon={<FilePdfOutlined />}
          onClick={handleViewPDF}
          style={{ background: '#00918A', borderColor: '#00918A', color: '#fff', fontWeight: 600, borderRadius: 4 }}
        >
          View PDF
        </Button>

        <Dropdown
          menu={{ items: actionMenuItems, onClick: handleActionClick }}
          trigger={['click']}
        >
          <Button style={{ background: '#00918A', borderColor: '#00918A', color: '#fff', fontWeight: 600, borderRadius: 4 }}>
            Actions <DownOutlined style={{ fontSize: 11 }} />
          </Button>
        </Dropdown>

        <Button
          icon={<ReloadOutlined />}
          onClick={handleRefresh}
          style={{ background: '#00918A', borderColor: '#00918A', color: '#fff', fontWeight: 600, borderRadius: 4 }}
        >
          Refresh
        </Button>

        <Button
          onClick={onClose}
          style={{ background: '#00918A', borderColor: '#00918A', color: '#fff', fontWeight: 600, borderRadius: 4 }}
        >
          Done
        </Button>
      </div>

      {/* ── Top summary bar ───────────────────────────────────────────────── */}
      <div style={{
        background: REDWOOD.surface,
        padding: '20px 28px',
        borderBottom: `1px solid ${REDWOOD.neutral200}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: REDWOOD.neutral600 }}>Purchase Order</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, color: REDWOOD.neutral900 }}>{po.OrderNumber}</div>
            <div style={{ fontSize: 13, color: REDWOOD.neutral600, marginTop: 4 }}>{po.Supplier}</div>
            <div style={{ marginTop: 10 }}>{getStatusTag(po.StatusCode)}</div>
          </div>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: REDWOOD.neutral600, letterSpacing: '0.05em' }}>Ordered</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: REDWOOD.neutral900 }}>{fmtAmt(po.Ordered)}</div>
              <div style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{po.Currency ?? po.CurrencyCode}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: REDWOOD.neutral600, letterSpacing: '0.05em' }}>Tax</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: REDWOOD.neutral900 }}>{fmtAmt(po.TotalTax)}</div>
              <div style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{po.CurrencyCode}</div>
            </div>
            <div style={{ textAlign: 'right', borderLeft: `2px solid ${REDWOOD.neutral200}`, paddingLeft: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: REDWOOD.neutral600, letterSpacing: '0.05em' }}>Total</div>
              <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: REDWOOD.primary }}>{fmtAmt(po.Total)}</div>
              <div style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{po.CurrencyCode}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Header Details ─────────────────────────────────────────────── */}
        <Card
          styles={{ body: { padding: '16px 20px' } }}
          style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
          title={
            <Space style={{ fontSize: 13 }}>
              <FileTextOutlined style={{ color: REDWOOD.primary }} />
              <Text strong>Order Details</Text>
            </Space>
          }
        >
          <Row gutter={[16, 0]}>
            <SectionHead icon={<InfoCircleOutlined />} title="General" />
            <LabelVal label="Document Style"  value={po.DocumentStyle} />
            <LabelVal label="Order Date"      value={fmtDate(po.OrderDate)} />
            <LabelVal label="Created"         value={fmtDate(po.CreationDate)} />
            <LabelVal label="Last Updated"    value={fmtDate(po.LastUpdateDate)} />
            <LabelVal label="Created By"      value={po.CreatedBy} />
            <LabelVal label="Last Updated By" value={po.LastUpdatedBy} />
            <LabelVal label="Description"     value={po.Description} wide />

            <SectionHead icon={<BankOutlined />} title="Legal Entity & Supplier" />
            <LabelVal label="Legal Entity"   value={<Text strong>{po.SoldToLegalEntity}</Text>} />
            <LabelVal label="Supplier"       value={<Text strong>{po.Supplier}</Text>} />
            <LabelVal label="Supplier Site"  value={po.SupplierSite} />
            <LabelVal label="Supplier Contact" value={po.SupplierContact} />

            <SectionHead icon={<UserOutlined />} title="People & Organizations" />
            <LabelVal label="Buyer"              value={po.BuyerDisplayName ?? po.Buyer} />
            <LabelVal label="Requester"          value={po.RequesterDisplayName} />
            <LabelVal label="Procurement BU"     value={po.ProcurementBU} />
            <LabelVal label="Requisitioning BU"  value={po.RequisitioningBU} />
            <LabelVal label="Bill To BU"         value={po.BillToBU} />

            <SectionHead icon={<DollarOutlined />} title="Financial & Payment" />
            <LabelVal label="Currency"         value={`${po.CurrencyCode} — ${po.Currency ?? ''}`} />
            <LabelVal label="Payment Terms"    value={po.PaymentTerms} />
            <LabelVal label="Conversion Rate"  value={po.ConversionRate ?? '—'} />
            <LabelVal label="Rate Type"        value={po.ConversionRateType} />

            <SectionHead icon={<CalendarOutlined />} title="Locations" />
            <LabelVal label="Ship To" value={po.ShipToLocationAddress} wide />
            <LabelVal label="Bill To" value={po.BillToLocationAddress} wide />

            <SectionHead icon={<FileTextOutlined />} title="References" />
            <LabelVal label="Requisition"  value={po.Requisition} />
            <LabelVal label="Sales Order"  value={po.SalesOrder} />
            <LabelVal label="Negotiation"  value={po.Negotiation} />

            {(po.NoteToSupplier || po.NoteToReceiver) && (
              <>
                <SectionHead icon={<FileTextOutlined />} title="Notes" />
                {po.NoteToSupplier  && <LabelVal label="Note to Supplier"  value={po.NoteToSupplier}  wide />}
                {po.NoteToReceiver  && <LabelVal label="Note to Receiver"  value={po.NoteToReceiver}  wide />}
              </>
            )}
          </Row>
        </Card>

        {/* ── Lines & Schedules ─────────────────────────────────────────── */}
        <Card
          styles={{ body: { padding: 0 } }}
          style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
          title={
            <Space style={{ fontSize: 13 }}>
              <UnorderedListOutlined style={{ color: REDWOOD.primary }} />
              <Text strong>Order Lines</Text>
              {lines.length > 0 && <Tag style={{ fontSize: 11 }}>{lines.length} line{lines.length !== 1 ? 's' : ''}</Tag>}
              {schedules.length > 0 && linesSubTab === 'schedules' && (
                <Tag color="geekblue" style={{ fontSize: 11 }}>{schedules.length} schedule{schedules.length !== 1 ? 's' : ''}</Tag>
              )}
            </Space>
          }
          extra={
            <Tooltip title="API Inspector — view the lines web service URL and test it">
              <Button size="small" icon={<ApiOutlined />}
                style={{ borderColor: REDWOOD.info, color: REDWOOD.info, fontSize: 11 }}
                onClick={() => { setApiResult(null); setApiOpen(true); }}>
                API
              </Button>
            </Tooltip>
          }
        >
          <Tabs
            activeKey={linesSubTab}
            onChange={key => {
              setLinesSubTab(key as 'lines' | 'schedules');
              if (key === 'schedules' && !schFetched && lines.length > 0) {
                fetchSchedules(lines);
              }
            }}
            size="small"
            style={{ paddingLeft: 16, paddingRight: 16 }}
            tabBarStyle={{ marginBottom: 0, borderBottom: `1px solid ${REDWOOD.neutral200}` }}
            items={[
              {
                key: 'lines',
                label: <span><UnorderedListOutlined style={{ marginRight: 5 }} />Lines</span>,
                children: (
                  <>
                    {linesLoading ? (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                        <Spin size="large" tip="Loading lines…" />
                      </div>
                    ) : linesError ? (
                      <div style={{ padding: 24, color: REDWOOD.error, background: REDWOOD.error + '10', borderRadius: 6, margin: 16 }}>
                        <InfoCircleOutlined style={{ marginRight: 8 }} />{linesError}
                      </div>
                    ) : lines.length === 0 ? (
                      <Empty description="No lines found" style={{ padding: 60 }} />
                    ) : (
                      <Table
                        columns={lineColumns}
                        dataSource={lines}
                        rowKey={(r, i) => `${r.POLineId ?? r.LineNumber ?? i}`}
                        size="small"
                        pagination={false}
                        scroll={{ x: 1400 }}
                        rowClassName={(_, i) => i % 2 !== 0 ? 'po-row-alt' : ''}
                        summary={() => (
                          <Table.Summary fixed>
                            <Table.Summary.Row style={{ background: REDWOOD.neutral100 }}>
                              <Table.Summary.Cell index={0} colSpan={9} align="right">
                                <Text strong style={{ fontSize: 12 }}>Total</Text>
                              </Table.Summary.Cell>
                              <Table.Summary.Cell index={1} align="right">
                                <Text strong style={{ fontVariantNumeric: 'tabular-nums', color: REDWOOD.primary }}>
                                  {fmtAmt(lines.reduce((s, l) => s + (l.Total ?? 0), 0))}
                                </Text>
                              </Table.Summary.Cell>
                              <Table.Summary.Cell index={2} colSpan={2} />
                            </Table.Summary.Row>
                          </Table.Summary>
                        )}
                      />
                    )}
                  </>
                ),
              },
              {
                key: 'schedules',
                label: <span><CalendarOutlined style={{ marginRight: 5 }} />Schedules</span>,
                children: (
                  <>
                    {schLoading ? (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                        <Spin size="large" tip="Loading schedules…" />
                      </div>
                    ) : schError ? (
                      <div style={{ padding: 16, color: REDWOOD.error, background: REDWOOD.error + '10', borderRadius: 6, margin: 16 }}>
                        <InfoCircleOutlined style={{ marginRight: 8 }} />{schError}
                      </div>
                    ) : !schFetched ? (
                      <Empty description="Select this tab to load schedules" style={{ padding: 60 }} />
                    ) : schedules.length === 0 ? (
                      <Empty description="No schedules found" style={{ padding: 60 }} />
                    ) : (
                      <Table
                        columns={scheduleColumns}
                        dataSource={schedules}
                        rowKey={(r, i) => `${r._lineNumber}-${r.ShipmentNumber ?? i}`}
                        size="small"
                        pagination={false}
                        scroll={{ x: 1500 }}
                        rowClassName={(_, i) => i % 2 !== 0 ? 'po-row-alt' : ''}
                      />
                    )}
                  </>
                ),
              },
            ]}
          />
        </Card>


      </div>

      {/* ── Lines API Inspector Modal ───────────────────────────────────── */}
      <Modal
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /> Lines API Inspector</Space>}
        open={apiOpen} onCancel={() => setApiOpen(false)} footer={null} width={820}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Text style={{ fontSize: 11, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lines URL</Text>
            <div style={{ marginTop: 4, padding: '8px 12px', borderRadius: 6, background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.neutral200}`, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', color: REDWOOD.info }}>
              <Tag color="blue" style={{ marginRight: 8 }}>GET</Tag>{linesUrl || '(not yet resolved)'}
            </div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              URL source: {po.links?.find(l => l.name === 'lines') ? '✅ from links array in PO response' : '⚠️ constructed (no links array found in PO)'}
            </Text>
          </div>

          <div>
            <Text style={{ fontSize: 11, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Headers Sent</Text>
            <div style={{ marginTop: 4, padding: '8px 12px', borderRadius: 6, background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.neutral200}`, fontFamily: 'monospace', fontSize: 12 }}>
              <div><span style={{ color: REDWOOD.neutral600 }}>Authorization: </span><span style={{ color: REDWOOD.success }}>Basic [emparun:Fusion@1234]</span></div>
              <div><span style={{ color: REDWOOD.neutral600 }}>Accept: </span>application/json</div>
            </div>
          </div>

          {rawResponse && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Auto-fetch Response</Text>
                <Button size="small" type="text" icon={<CopyOutlined />} style={{ marginLeft: 'auto' }}
                  onClick={() => { navigator.clipboard.writeText(rawResponse); message.success('Copied'); }}>Copy</Button>
              </div>
              <div style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 6, fontFamily: 'monospace', fontSize: 11, maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {(() => { try { return JSON.stringify(JSON.parse(rawResponse), null, 2).slice(0, 3000); } catch { return rawResponse.slice(0, 3000); } })()}
              </div>
            </div>
          )}

          <Button type="primary" icon={<ApiOutlined />} loading={apiTestLoading} onClick={handleApiTest}
            style={{ background: REDWOOD.info, borderColor: REDWOOD.info, borderRadius: 6, alignSelf: 'flex-start' }}>
            Test Request Now
          </Button>

          {apiResult && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Tag color={apiResult.status >= 200 && apiResult.status < 300 ? 'success' : apiResult.status === 0 ? 'default' : 'error'}>
                  {apiResult.status === 0 ? 'Network Error' : `HTTP ${apiResult.status}`}
                </Tag>
                <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Test Response</Text>
                <Button size="small" type="text" icon={<CopyOutlined />} style={{ marginLeft: 'auto' }}
                  onClick={() => { navigator.clipboard.writeText(apiResult.body); message.success('Copied'); }}>Copy</Button>
              </div>
              <div style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 6, fontFamily: 'monospace', fontSize: 11, maxHeight: 320, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {apiResult.body.slice(0, 5000)}{apiResult.body.length > 5000 ? '\n\n… (truncated)' : ''}
              </div>
            </div>
          )}
        </div>
      </Modal>
      {/* ── Schedule Detail Modal ─────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <InfoCircleOutlined style={{ color: REDWOOD.info }} />
            Schedule Details — Line {schDetailRecord?._lineNumber}, Schedule {schDetailRecord?.ShipmentNumber ?? '—'}
          </Space>
        }
        open={!!schDetailRecord}
        onCancel={() => setSchDetailRecord(null)}
        footer={<Button onClick={() => setSchDetailRecord(null)}>Close</Button>}
        width={780}
      >
        {schDetailRecord && (() => {
          const skip = new Set(['_lineNumber', '_lineItem', '_lineDescription', 'links']);
          const entries = Object.entries(schDetailRecord).filter(([k]) => !skip.has(k));
          const LV: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
            <Col xs={24} sm={12} md={8}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                <div style={{ fontSize: 12, color: REDWOOD.neutral900, marginTop: 2 }}>{value ?? '—'}</div>
              </div>
            </Col>
          );
          return (
            <div>
              {/* Line context */}
              <div style={{ background: REDWOOD.neutral100, borderRadius: 6, padding: '8px 14px', marginBottom: 16, display: 'flex', gap: 24 }}>
                <div><span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Line: </span><Text strong>{schDetailRecord._lineNumber}</Text></div>
                {schDetailRecord._lineItem && <div><span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Item: </span><Text strong style={{ color: REDWOOD.info }}>{schDetailRecord._lineItem}</Text></div>}
                {schDetailRecord._lineDescription && <div style={{ flex: 1 }}><span style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Description: </span><Text>{schDetailRecord._lineDescription}</Text></div>}
              </div>
              {/* All schedule fields */}
              <Row gutter={[12, 0]}>
                {entries.map(([key, val]) => (
                  <LV key={key} label={key.replace(/([A-Z])/g, ' $1').trim()} value={
                    typeof val === 'boolean' ? (val ? 'Yes' : 'No') :
                    typeof val === 'object' ? JSON.stringify(val) :
                    (key.toLowerCase().includes('date') && val) ? fmtDate(String(val)) :
                    String(val ?? '—')
                  } />
                ))}
              </Row>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

// ── Search Tab ───────────────────────────────────────────────────────────────
const SearchTab: React.FC<{ onOpen: (po: RawPO) => void }> = ({ onOpen }) => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [data, setData]             = useState<RawPO[]>([]);
  const [loading, setLoading]       = useState(false);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [searchParams, setSearchParams] = useState<SearchParams>({});
  const [hasSearched, setHasSearched]   = useState(false);
  const [apiOpen, setApiOpen]       = useState(false);
  const [apiTestLoading, setATL]    = useState(false);
  const [apiResult, setApiResult]   = useState<{ status: number; body: string } | null>(null);
  const [lineCountMap, setLineCountMap] = useState<Map<number, number>>(new Map());
  const [lineCountsLoading, setLineCountsLoading] = useState(false);

  const buildUrl = (params: SearchParams, pageNum: number) => {
    const q = buildQParam(params);
    const up = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((pageNum - 1) * PAGE_SIZE), totalResults: 'true' });
    if (q) up.set('q', q);
    return `${BASE_URL}/purchaseOrders?${up.toString()}`;
  };

  const fetchLineCounts = useCallback(async (pos: RawPO[]) => {
    if (pos.length === 0) { setLineCountMap(new Map()); return; }
    setLineCountsLoading(true);
    try {
      const results = await Promise.allSettled(
        pos.map(async (po) => {
          const r = await fetch(
            `${BASE_URL}/purchaseOrders/${po.POHeaderId}/child/lines?limit=1&totalResults=true`,
            { headers: { Authorization: AUTH_HEADER, Accept: 'application/json' } }
          );
          if (!r.ok) return { id: po.POHeaderId, count: 0 };
          const j = await r.json();
          return { id: po.POHeaderId, count: j.totalResults ?? j.count ?? (j.items?.length ?? 0) };
        })
      );
      const map = new Map<number, number>();
      results.forEach(r => { if (r.status === 'fulfilled') map.set(r.value.id, r.value.count); });
      setLineCountMap(map);
    } catch {
      // line counts are supplementary — fail silently
    } finally {
      setLineCountsLoading(false);
    }
  }, []);

  const fetchPOs = useCallback(async (params: SearchParams, pageNum: number): Promise<RawPO[]> => {
    setLoading(true);
    try {
      const res = await fetch(buildUrl(params, pageNum), { headers: { Authorization: AUTH_HEADER, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const json = await res.json();
      const items: RawPO[] = (json.items ?? []).sort((a: RawPO, b: RawPO) =>
        (b.CreationDate ?? '').localeCompare(a.CreationDate ?? '')
      );
      setData(items);
      setTotal(json.totalResults ?? json.count ?? items.length);
      return items;
    } catch (e: any) {
      message.error(`Failed to load purchase orders: ${e.message}`, 6);
      setData([]); setTotal(0);
      return [];
    } finally { setLoading(false); }
  }, []);

  const handleSearch = async () => {
    const vals = form.getFieldsValue();
    const params: SearchParams = { orderNumber: vals.orderNumber, supplier: vals.supplier, statusCode: vals.statusCode, dateRange: vals.dateRange ?? null };
    setSearchParams(params); setPage(1); setHasSearched(true);
    const items = await fetchPOs(params, 1);
    fetchLineCounts(items);
  };

  const handleReset = () => { form.resetFields(); setSearchParams({}); setPage(1); setData([]); setTotal(0); setHasSearched(false); setLineCountMap(new Map()); };

  // Deep-link: ?orderNumber=<PO> (e.g. drill-down from cost-distribution reference)
  // prefills the form and runs the search automatically.
  const [urlParams] = useSearchParams();
  useEffect(() => {
    const on = urlParams.get('orderNumber');
    if (!on) return;
    form.setFieldsValue({ orderNumber: on });
    const params: SearchParams = { orderNumber: on };
    setSearchParams(params); setPage(1); setHasSearched(true);
    fetchPOs(params, 1).then(items => fetchLineCounts(items));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApiTest = async () => {
    const url = buildUrl(form.getFieldsValue(), page);
    setATL(true); setApiResult(null);
    try {
      const res = await fetch(url, { headers: { Authorization: AUTH_HEADER, Accept: 'application/json' } });
      const body = await res.text();
      let pretty = body;
      try { pretty = JSON.stringify(JSON.parse(body), null, 2); } catch { /* keep raw */ }
      setApiResult({ status: res.status, body: pretty });
    } catch (e: any) {
      setApiResult({ status: 0, body: `Network error: ${e.message}\n\nThis may be a CORS restriction.` });
    } finally { setATL(false); }
  };

  const currentUrl = buildUrl(searchParams, page);

  const columns: ColumnsType<RawPO> = [
    {
      title: 'Order Number', dataIndex: 'OrderNumber', width: 140, fixed: 'left',
      render: (v, rec) => (
        <Button type="link" style={{ padding: 0, fontWeight: 700, color: REDWOOD.info, fontSize: 13 }} onClick={() => onOpen(rec)}>
          {v}
        </Button>
      ),
    },
    {
      title: 'Legal Entity', dataIndex: 'SoldToLegalEntity', ellipsis: true, width: 200,
      render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text>,
    },
    {
      title: 'Supplier', dataIndex: 'Supplier', ellipsis: true, width: 200,
      render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text>,
    },
    { title: 'Status', dataIndex: 'StatusCode', width: 160, render: s => getStatusTag(s) },
    {
      title: 'Lines',
      key: 'linesCount',
      width: 70,
      align: 'center' as const,
      render: (_: any, rec: RawPO) => {
        const cnt = lineCountMap.get(rec.POHeaderId);
        return lineCountsLoading && cnt === undefined
          ? <Spin size="small" />
          : <Tag color="geekblue" style={{ fontSize: 11, fontWeight: 600, borderRadius: 10, minWidth: 28, textAlign: 'center' }}>
              {cnt ?? '—'}
            </Tag>;
      },
    },
    { title: 'CCY', dataIndex: 'CurrencyCode', width: 60, align: 'center', render: v => <Tag style={{ fontSize: 11 }}>{v}</Tag> },
    {
      title: 'Ordered', dataIndex: 'Ordered', width: 120, align: 'right',
      render: v => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmtAmt(v)}</Text>,
    },
    {
      title: 'Total (incl. Tax)', dataIndex: 'Total', width: 140, align: 'right',
      render: v => <Text strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: REDWOOD.neutral900 }}>{fmtAmt(v)}</Text>,
    },
    {
      title: 'Buyer', dataIndex: 'BuyerDisplayName', width: 160, ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text>,
    },
    { title: 'Order Date', dataIndex: 'OrderDate', width: 120, render: d => fmtDate(d),
      sorter: (a, b) => (a.OrderDate ?? '').localeCompare(b.OrderDate ?? ''),
    },
    { title: 'Created', dataIndex: 'CreationDate', width: 140, render: d => fmtDate(d),
      sorter: (a, b) => (a.CreationDate ?? '').localeCompare(b.CreationDate ?? ''),
      defaultSortOrder: 'descend' as const,
    },
    {
      title: '', key: 'actions', width: 80, fixed: 'right', align: 'center',
      render: (_: unknown, rec: RawPO) => (
        <Button size="small" type="primary" icon={<EyeOutlined />} onClick={() => onOpen(rec)}
          style={{ background: REDWOOD.info, borderColor: REDWOOD.info, borderRadius: 4, fontSize: 11 }}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Search Panel */}
      <Card styles={{ body: { padding: '14px 18px' } }} style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <Form form={form} layout="vertical">
          <Row gutter={[10, 0]}>
            <Col xs={24} sm={12} md={5}>
              <Form.Item name="orderNumber" label={<Text style={{ fontSize: 12, fontWeight: 600 }}>Order Number</Text>} style={{ marginBottom: 8 }}>
                <Input placeholder="e.g. PO-0001" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Form.Item name="supplier" label={<Text style={{ fontSize: 12, fontWeight: 600 }}>Supplier</Text>} style={{ marginBottom: 8 }}>
                <Input placeholder="Supplier name" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Form.Item name="statusCode" label={<Text style={{ fontSize: 12, fontWeight: 600 }}>Status</Text>} style={{ marginBottom: 8 }}>
                <Select placeholder="All statuses" allowClear>
                  <Option value="OPEN">Open</Option>
                  <Option value="APPROVED">Approved</Option>
                  <Option value="CLOSED">Closed</Option>
                  <Option value="CLOSED FOR RECEIVING">Closed for Receiving</Option>
                  <Option value="INCOMPLETE">Incomplete</Option>
                  <Option value="IN PROCESS">In Process</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={7}>
              <Form.Item name="dateRange" label={<Text style={{ fontSize: 12, fontWeight: 600 }}>Order Date</Text>} style={{ marginBottom: 8 }}>
                <RangePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={loading}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary, borderRadius: 6, fontWeight: 600 }}>
              Search
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/procurement/create-po')}
              style={{ background: '#1D7B4D', borderColor: '#1D7B4D', borderRadius: 6, fontWeight: 600 }}
            >
              + Create PO
            </Button>
            <Tooltip title="API Inspector — view web service URL and test it">
              <Button icon={<ApiOutlined />} onClick={() => { setApiResult(null); setApiOpen(true); }}
                style={{ marginLeft: 'auto', borderColor: REDWOOD.info, color: REDWOOD.info }}>
                API
              </Button>
            </Tooltip>
          </div>
        </Form>
      </Card>

      {/* Results */}
      <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${REDWOOD.neutral200}`, display: 'flex', alignItems: 'center' }}>
          <Text strong style={{ fontSize: 13 }}>
            Purchase Orders
            {hasSearched && total > 0 && <Text type="secondary" style={{ fontWeight: 400, marginLeft: 8 }}>({total} result{total !== 1 ? 's' : ''})</Text>}
          </Text>
        </div>
        <Table
          columns={columns} dataSource={data} rowKey="POHeaderId"
          loading={loading} size="small" scroll={{ x: 1400 }}
          pagination={hasSearched && total > PAGE_SIZE ? {
            current: page, pageSize: PAGE_SIZE, total, showSizeChanger: false,
            onChange: async p => { setPage(p); const items = await fetchPOs(searchParams, p); fetchLineCounts(items); },
            showTotal: (t, [s, e]) => `${s}–${e} of ${t}`,
            style: { padding: '10px 16px', margin: 0 },
          } : false}
          locale={{
            emptyText: hasSearched
              ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No purchase orders found" style={{ padding: 40 }} />
              : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Use the search panel above to find purchase orders" style={{ padding: 40 }} />,
          }}
          rowClassName={(_, i) => i % 2 !== 0 ? 'po-row-alt' : ''}
          onRow={rec => ({ style: { cursor: 'pointer' }, onDoubleClick: () => onOpen(rec) })}
        />
      </Card>

      {/* API Inspector Modal */}
      <Modal
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /> API Inspector</Space>}
        open={apiOpen} onCancel={() => setApiOpen(false)} footer={null} width={780}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Text style={{ fontSize: 11, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>URL</Text>
            <div style={{ marginTop: 4, padding: '8px 12px', borderRadius: 6, background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.neutral200}`, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', color: REDWOOD.info }}>
              <Tag color="blue" style={{ marginRight: 8 }}>GET</Tag>{currentUrl}
            </div>
          </div>
          <div>
            <Text style={{ fontSize: 11, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Headers</Text>
            <div style={{ marginTop: 4, padding: '8px 12px', borderRadius: 6, background: REDWOOD.neutral100, border: `1px solid ${REDWOOD.neutral200}`, fontFamily: 'monospace', fontSize: 12 }}>
              <div><span style={{ color: REDWOOD.neutral600 }}>Authorization: </span><span style={{ color: REDWOOD.success }}>Basic [emparun:Fusion@1234]</span></div>
              <div><span style={{ color: REDWOOD.neutral600 }}>Accept: </span>application/json</div>
            </div>
          </div>
          <Button type="primary" icon={<ApiOutlined />} loading={apiTestLoading} onClick={handleApiTest}
            style={{ background: REDWOOD.info, borderColor: REDWOOD.info, borderRadius: 6, alignSelf: 'flex-start' }}>
            Test Request
          </Button>
          {apiResult && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Tag color={apiResult.status >= 200 && apiResult.status < 300 ? 'success' : apiResult.status === 0 ? 'default' : 'error'}>
                  {apiResult.status === 0 ? 'Network Error' : `HTTP ${apiResult.status}`}
                </Tag>
                <Button size="small" type="text" icon={<CopyOutlined />} style={{ marginLeft: 'auto' }}
                  onClick={() => { navigator.clipboard.writeText(apiResult.body); message.success('Copied'); }}>
                  Copy
                </Button>
              </div>
              <div style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 6, fontFamily: 'monospace', fontSize: 11, maxHeight: 320, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {apiResult.body.slice(0, 5000)}{apiResult.body.length > 5000 ? '\n\n… (truncated)' : ''}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

// ── Lines Tab ────────────────────────────────────────────────────────────────
interface FlatLine {
  _key: string;
  _poHeaderId: number;
  _orderNumber: string;
  _supplier: string;
  _orderDate: string;
  _currencyCode: string;
  _rawPO: RawPO;
  POLineId?: number;
  LineNumber: number;
  LineType?: string;
  Item?: string;
  Description?: string;
  Category?: string;
  UOM?: string;
  Quantity?: number;
  QuantityReceived?: number;
  BasePrice?: number;
  Price?: number;
  Ordered?: number;
  TotalTax?: number;
  Total?: number;
  StatusCode?: string;
  Status?: string;
  NeedByDate?: string;
}

interface LineSearchParams {
  orderNumber?: string;
  supplier?: string;
  item?: string;
  description?: string;
  statusCode?: string;
  dateRange?: [Dayjs, Dayjs] | null;
}

const LinesTab: React.FC<{ onOpenPO: (po: RawPO) => void }> = ({ onOpenPO }) => {
  const [form] = Form.useForm<LineSearchParams>();
  const [lines, setLines] = useState<FlatLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [total, setTotal] = useState(0);

  const handleSearch = async () => {
    const vals = form.getFieldsValue();
    setLoading(true);
    try {
      const headerParts: string[] = [];
      if (vals.orderNumber) headerParts.push(`OrderNumber like "${vals.orderNumber}*"`);
      if (vals.supplier)    headerParts.push(`Supplier like "${vals.supplier}*"`);
      if (vals.dateRange?.[0]) headerParts.push(`OrderDate>="${vals.dateRange[0].format('YYYY-MM-DD')}"`);
      if (vals.dateRange?.[1]) headerParts.push(`OrderDate<="${vals.dateRange[1].format('YYYY-MM-DD')}"`);

      const up = new URLSearchParams({ limit: '200', expand: 'lines', totalResults: 'true' });
      if (headerParts.length) up.set('q', headerParts.join(';'));

      const res = await fetch(`${BASE_URL}/purchaseOrders?${up}`, {
        headers: { Authorization: AUTH_HEADER, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const json = await res.json();
      const pos: any[] = json.items ?? [];

      let flat: FlatLine[] = [];
      pos.forEach((po: any) => {
        const rawLines: any[] = po.lines?.items ?? (Array.isArray(po.lines) ? po.lines : []);
        rawLines.forEach((line: any) => {
          flat.push({
            ...line,
            _key: `${po.POHeaderId}-${line.POLineId ?? line.LineNumber}`,
            _poHeaderId: po.POHeaderId,
            _orderNumber: po.OrderNumber,
            _supplier: po.Supplier,
            _orderDate: po.OrderDate,
            _currencyCode: po.CurrencyCode,
            _rawPO: po as RawPO,
          });
        });
      });

      if (vals.item) {
        const t = vals.item.toLowerCase();
        flat = flat.filter(l => l.Item?.toLowerCase().includes(t));
      }
      if (vals.description) {
        const t = vals.description.toLowerCase();
        flat = flat.filter(l => l.Description?.toLowerCase().includes(t));
      }
      if (vals.statusCode) {
        flat = flat.filter(l => (l.StatusCode ?? l.Status)?.toUpperCase() === vals.statusCode?.toUpperCase());
      }

      setLines(flat);
      setTotal(flat.length);
      setHasSearched(true);
    } catch (e: any) {
      message.error(`Failed to load lines: ${e.message}`, 6);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => { form.resetFields(); setLines([]); setTotal(0); setHasSearched(false); };

  useEffect(() => { handleSearch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lineColumns: ColumnsType<FlatLine> = [
    {
      title: 'PO Number', dataIndex: '_orderNumber', width: 145, fixed: 'left',
      render: (v, rec) => (
        <Button type="link" style={{ padding: 0, fontWeight: 700, color: REDWOOD.info, fontSize: 12 }}
          onClick={() => onOpenPO(rec._rawPO)}>
          {v}
        </Button>
      ),
    },
    {
      title: '#', dataIndex: 'LineNumber', width: 52, align: 'center',
      render: v => <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>{v}</Text>,
    },
    { title: 'Type', dataIndex: 'LineType', width: 80,
      render: v => <Tag style={{ fontSize: 11 }}>{v ?? '—'}</Tag> },
    { title: 'Item', dataIndex: 'Item', width: 130,
      render: v => v ? <Text style={{ fontSize: 12, fontWeight: 600, color: REDWOOD.info }}>{v}</Text> : <Text type="secondary">—</Text> },
    { title: 'Description', dataIndex: 'Description', ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Category', dataIndex: 'Category', width: 100,
      render: v => v ? <Tag style={{ fontSize: 11 }}>{v}</Tag> : <Text type="secondary">—</Text> },
    { title: 'UOM', dataIndex: 'UOM', width: 60, align: 'center',
      render: v => v ? <Tag style={{ fontSize: 11 }}>{v}</Tag> : <Text type="secondary">—</Text> },
    { title: 'Qty', dataIndex: 'Quantity', width: 80, align: 'right',
      render: v => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Unit Price', dataIndex: 'Price', width: 110, align: 'right',
      render: (v, rec) => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmtAmt(v, rec._currencyCode)}</Text> },
    { title: 'Total', dataIndex: 'Total', width: 130, align: 'right',
      render: (v, rec) => <Text strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: REDWOOD.primary }}>{fmtAmt(v, rec._currencyCode)}</Text> },
    { title: 'Status', dataIndex: 'StatusCode', width: 155,
      render: (v, rec) => getStatusTag(v ?? rec.Status) },
    { title: 'Supplier', dataIndex: '_supplier', width: 170, ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
    { title: 'Order Date', dataIndex: '_orderDate', width: 110,
      render: d => <Text style={{ fontSize: 12 }}>{fmtDate(d)}</Text>,
      sorter: (a, b) => (a._orderDate ?? '').localeCompare(b._orderDate ?? ''),
      defaultSortOrder: 'descend' as const,
    },
    { title: 'Need By', dataIndex: 'NeedByDate', width: 110,
      render: d => <Text style={{ fontSize: 12 }}>{fmtDate(d)}</Text> },
  ];

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

      <Card styles={{ body: { padding: '14px 18px' } }}
        style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <Form form={form} layout="vertical">
          <Row gutter={[10, 0]}>
            <Col xs={24} sm={12} md={4}>
              <Form.Item name="orderNumber" label={<Text style={{ fontSize: 12, fontWeight: 600 }}>PO Number</Text>} style={{ marginBottom: 8 }}>
                <Input placeholder="e.g. PO-0001" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Form.Item name="supplier" label={<Text style={{ fontSize: 12, fontWeight: 600 }}>Supplier</Text>} style={{ marginBottom: 8 }}>
                <Input placeholder="Supplier name" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Form.Item name="item" label={<Text style={{ fontSize: 12, fontWeight: 600 }}>Item</Text>} style={{ marginBottom: 8 }}>
                <Input placeholder="Item code / name" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Form.Item name="description" label={<Text style={{ fontSize: 12, fontWeight: 600 }}>Description</Text>} style={{ marginBottom: 8 }}>
                <Input placeholder="Line description" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={3}>
              <Form.Item name="statusCode" label={<Text style={{ fontSize: 12, fontWeight: 600 }}>Status</Text>} style={{ marginBottom: 8 }}>
                <Select placeholder="All" allowClear>
                  <Option value="OPEN">Open</Option>
                  <Option value="APPROVED">Approved</Option>
                  <Option value="CLOSED">Closed</Option>
                  <Option value="CLOSED FOR RECEIVING">Closed for Rcv</Option>
                  <Option value="INCOMPLETE">Incomplete</Option>
                  <Option value="IN PROCESS">In Process</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={7}>
              <Form.Item name="dateRange" label={<Text style={{ fontSize: 12, fontWeight: 600 }}>Order Date</Text>} style={{ marginBottom: 8 }}>
                <RangePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={loading}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary, borderRadius: 6, fontWeight: 600 }}>
              Search
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
          </div>
        </Form>
      </Card>

      <Card styles={{ body: { padding: 0 } }}
        style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${REDWOOD.neutral200}`, display: 'flex', alignItems: 'center' }}>
          <Text strong style={{ fontSize: 13 }}>
            Purchase Order Lines
            {hasSearched && total > 0 && (
              <Text type="secondary" style={{ fontWeight: 400, marginLeft: 8 }}>({total} line{total !== 1 ? 's' : ''})</Text>
            )}
          </Text>
        </div>
        <Table
          columns={lineColumns}
          dataSource={lines}
          rowKey="_key"
          loading={loading}
          size="small"
          scroll={{ x: 1550 }}
          pagination={lines.length > 50
            ? { pageSize: 50, showSizeChanger: false, showTotal: (t, [s, e]) => `${s}–${e} of ${t}`, style: { padding: '10px 16px', margin: 0 } }
            : false}
          locale={{
            emptyText: hasSearched
              ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No lines found" style={{ padding: 40 }} />
              : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Use the search panel above to find purchase order lines" style={{ padding: 40 }} />,
          }}
          rowClassName={(_, i) => i % 2 !== 0 ? 'po-row-alt' : ''}
        />
      </Card>
    </div>
  );
};

// ── Analytics Helpers ────────────────────────────────────────────────────────
const CHART_COLORS = [
  REDWOOD.primary, REDWOOD.info, REDWOOD.success, '#722ED1',
  REDWOOD.warning, '#00918A', '#FA8C16', '#13C2C2', '#EB2F96', '#52C41A',
];

const HBar: React.FC<{
  value: number; max: number; color?: string;
  label: string; sub?: string; rightLabel?: string; count?: number;
}> = ({ value, max, color = REDWOOD.primary, label, sub, rightLabel, count }) => {
  const pct = max > 0 ? Math.max((value / max) * 100, 2) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: 600 }}>{label}</Text>
          {sub && <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>{sub}</Text>}
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          {count != null && <Text type="secondary" style={{ fontSize: 11 }}>{count} PO{count !== 1 ? 's' : ''}</Text>}
          <Text style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{rightLabel}</Text>
        </div>
      </div>
      <div style={{ background: REDWOOD.neutral200, borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ background: color, width: `${pct}%`, height: '100%', borderRadius: 4, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>
    </div>
  );
};

// ── Analytics Tab ─────────────────────────────────────────────────────────────
const AnalyticsTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [rawPos, setRawPos] = useState<any[]>([]);
  const [rawLines, setRawLines] = useState<any[]>([]);
  const [fetchedAt, setFetchedAt] = useState('');
  const didMount = useRef(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const up = new URLSearchParams({ limit: '500', expand: 'lines' });
      const res = await fetch(`${BASE_URL}/purchaseOrders?${up}`, {
        headers: { Authorization: AUTH_HEADER, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const json = await res.json();
      const poList: any[] = json.items ?? [];
      setRawPos(poList);
      const allLines: any[] = [];
      poList.forEach(po => {
        const ls: any[] = po.lines?.items ?? (Array.isArray(po.lines) ? po.lines : []);
        ls.forEach(l => allLines.push({ ...l, _po: po }));
      });
      setRawLines(allLines);
      setFetchedAt(new Date().toLocaleString('en-AE', { dateStyle: 'medium', timeStyle: 'short' }));
    } catch (e: any) {
      message.error(`Analytics load failed: ${e.message}`, 6);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;
    loadData();
  }, [loadData]);

  // ── Aggregations ──────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalPOs = rawPos.length;
    const totalLines = rawLines.length;
    const suppliers = new Set(rawPos.map(p => p.Supplier)).size;
    const byCcy = new Map<string, number>();
    rawPos.forEach(po => {
      const c = po.CurrencyCode ?? '?';
      byCcy.set(c, (byCcy.get(c) ?? 0) + (po.Total ?? 0));
    });
    return { totalPOs, totalLines, suppliers, byCcy };
  }, [rawPos, rawLines]);

  const byCurrency = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    rawPos.forEach(po => {
      const c = po.CurrencyCode ?? '?';
      const ex = map.get(c) ?? { total: 0, count: 0 };
      map.set(c, { total: ex.total + (po.Total ?? 0), count: ex.count + 1 });
    });
    return Array.from(map.entries()).map(([ccy, d]) => ({ ccy, ...d })).sort((a, b) => b.total - a.total);
  }, [rawPos]);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    rawPos.forEach(po => { const s = po.StatusCode ?? 'UNKNOWN'; map.set(s, (map.get(s) ?? 0) + 1); });
    return Array.from(map.entries()).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);
  }, [rawPos]);

  const monthlyTrend = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    rawPos.forEach(po => {
      if (!po.OrderDate) return;
      const key = dayjs(po.OrderDate).format('YYYY-MM');
      const ex = map.get(key) ?? { total: 0, count: 0 };
      map.set(key, { total: ex.total + (po.Total ?? 0), count: ex.count + 1 });
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([key, d]) => ({ label: dayjs(key, 'YYYY-MM').format("MMM 'YY"), ...d }));
  }, [rawPos]);

  const topSuppliers = useMemo(() => {
    const map = new Map<string, { total: number; count: number; lineCount: number }>();
    rawPos.forEach(po => {
      const sup = po.Supplier ?? 'Unknown';
      const ex = map.get(sup) ?? { total: 0, count: 0, lineCount: 0 };
      const lc = (po.lines?.items ?? []).length;
      map.set(sup, { total: ex.total + (po.Total ?? 0), count: ex.count + 1, lineCount: ex.lineCount + lc });
    });
    return Array.from(map.entries()).map(([supplier, d]) => ({ supplier, ...d })).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [rawPos]);

  const topItemsByAmt = useMemo(() => {
    const map = new Map<string, { total: number; qty: number; desc: string }>();
    rawLines.forEach(l => {
      if (!l.Item) return;
      const ex = map.get(l.Item) ?? { total: 0, qty: 0, desc: l.Description ?? '' };
      map.set(l.Item, { total: ex.total + (l.Total ?? 0), qty: ex.qty + (l.Quantity ?? 0), desc: ex.desc || (l.Description ?? '') });
    });
    return Array.from(map.entries()).map(([item, d]) => ({ item, ...d })).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [rawLines]);

  const topItemsByQty = useMemo(() => {
    const map = new Map<string, { qty: number; total: number; desc: string }>();
    rawLines.forEach(l => {
      if (!l.Item) return;
      const ex = map.get(l.Item) ?? { qty: 0, total: 0, desc: l.Description ?? '' };
      map.set(l.Item, { qty: ex.qty + (l.Quantity ?? 0), total: ex.total + (l.Total ?? 0), desc: ex.desc || (l.Description ?? '') });
    });
    return Array.from(map.entries()).map(([item, d]) => ({ item, ...d })).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [rawLines]);

  const byCategory = useMemo(() => {
    const map = new Map<string, { total: number; qty: number; count: number }>();
    rawLines.forEach(l => {
      const cat = l.Category ?? 'Uncategorized';
      const ex = map.get(cat) ?? { total: 0, qty: 0, count: 0 };
      map.set(cat, { total: ex.total + (l.Total ?? 0), qty: ex.qty + (l.Quantity ?? 0), count: ex.count + 1 });
    });
    return Array.from(map.entries()).map(([category, d]) => ({ category, ...d })).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [rawLines]);

  const maxSupplier  = topSuppliers[0]?.total  ?? 1;
  const maxItemAmt   = topItemsByAmt[0]?.total  ?? 1;
  const maxItemQty   = topItemsByQty[0]?.qty    ?? 1;
  const maxCat       = byCategory[0]?.total     ?? 1;
  const maxMonthly   = Math.max(...monthlyTrend.map(m => m.total), 1);

  const STATUS_COLORS: Record<string, string> = {
    OPEN: REDWOOD.info, APPROVED: REDWOOD.success, CLOSED: REDWOOD.neutral600,
    'CLOSED FOR RECEIVING': REDWOOD.warning, INCOMPLETE: REDWOOD.error, 'IN PROCESS': '#722ED1',
  };

  const SectionTitle: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      borderBottom: `2px solid ${REDWOOD.primary}22`, paddingBottom: 8, marginBottom: 16,
    }}>
      <span style={{ color: REDWOOD.primary, fontSize: 15 }}>{icon}</span>
      <Text strong style={{ fontSize: 14, color: REDWOOD.neutral900 }}>{title}</Text>
    </div>
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, flexDirection: 'column', gap: 16 }}>
        <Spin size="large" />
        <Text type="secondary" style={{ fontSize: 13 }}>Loading analytics data…</Text>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, background: REDWOOD.neutral100, minHeight: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Title level={5} style={{ margin: 0, color: REDWOOD.neutral900 }}>Purchasing Analytics</Title>
          {fetchedAt && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {rawPos.length} POs · {rawLines.length} lines · refreshed {fetchedAt}
            </Text>
          )}
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}
          style={{ borderColor: REDWOOD.primary, color: REDWOOD.primary, fontWeight: 600 }}>
          Refresh
        </Button>
      </div>

      {rawPos.length === 0 && !loading && <Empty description="No purchase order data found" style={{ padding: 60 }} />}

      {rawPos.length > 0 && (<>

        {/* ── KPI Cards ──────────────────────────────────────────────────── */}
        <Row gutter={[12, 12]}>
          {[
            { label: 'Total POs',    value: kpis.totalPOs,  color: REDWOOD.primary },
            { label: 'Total Lines',  value: kpis.totalLines, color: REDWOOD.info },
            { label: 'Suppliers',    value: kpis.suppliers,  color: REDWOOD.success },
            { label: 'Avg Lines/PO', value: kpis.totalPOs > 0 ? +(kpis.totalLines / kpis.totalPOs).toFixed(1) : 0, color: '#722ED1' },
          ].map(k => (
            <Col xs={12} sm={6} key={k.label}>
              <Card styles={{ body: { padding: '16px 20px' } }}
                style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, borderTop: `3px solid ${k.color}` }}>
                <Statistic title={k.label} value={k.value}
                  valueStyle={{ color: k.color, fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }} />
              </Card>
            </Col>
          ))}
        </Row>

        {/* ── Total by Currency ──────────────────────────────────────────── */}
        <Row gutter={[12, 12]}>
          {byCurrency.map((c, i) => (
            <Col key={c.ccy} xs={24} sm={12} md={8} lg={6}>
              <Card styles={{ body: { padding: '14px 18px' } }}
                style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, borderLeft: `4px solid ${CHART_COLORS[i % CHART_COLORS.length]}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: REDWOOD.neutral600, letterSpacing: '0.06em' }}>
                  Total Ordered · {c.ccy}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: REDWOOD.neutral900, marginTop: 4, lineHeight: 1.2 }}>
                  {fmtAmt(c.total)}
                </div>
                <Text type="secondary" style={{ fontSize: 11 }}>{c.count} purchase order{c.count !== 1 ? 's' : ''}</Text>
              </Card>
            </Col>
          ))}
        </Row>

        <Row gutter={[12, 12]}>
          {/* ── Status Distribution ─────────────────────────────────────── */}
          <Col xs={24} md={8}>
            <Card styles={{ body: { padding: '16px 20px' } }}
              style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, height: '100%' }}>
              <SectionTitle icon={<CheckCircleOutlined />} title="Status Distribution" />
              {byStatus.map(s => {
                const cfg = statusConfig[s.status.toUpperCase()] ?? { label: s.status, tagColor: 'default' };
                const color = STATUS_COLORS[s.status.toUpperCase()] ?? REDWOOD.neutral600;
                const pct = kpis.totalPOs > 0 ? ((s.count / kpis.totalPOs) * 100).toFixed(1) : '0';
                return (
                  <div key={s.status} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <Text style={{ fontSize: 12, flex: 1 }}>{cfg.label}</Text>
                    <Tag color={cfg.tagColor} style={{ fontSize: 11, fontWeight: 700, margin: 0, minWidth: 30, textAlign: 'center' }}>{s.count}</Tag>
                    <Text type="secondary" style={{ fontSize: 11, minWidth: 38, textAlign: 'right' }}>{pct}%</Text>
                  </div>
                );
              })}
            </Card>
          </Col>

          {/* ── Monthly Trend ────────────────────────────────────────────── */}
          <Col xs={24} md={16}>
            <Card styles={{ body: { padding: '16px 20px' } }}
              style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}`, height: '100%' }}>
              <SectionTitle icon={<HistoryOutlined />} title="Monthly Purchasing Trend (last 12 months)" />
              {monthlyTrend.length === 0
                ? <Empty description="No order date data" />
                : (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 130, paddingBottom: 4 }}>
                      {monthlyTrend.map((m, i) => {
                        const pct = (m.total / maxMonthly) * 100;
                        const isRecent = i >= monthlyTrend.length - 3;
                        return (
                          <Tooltip key={m.label}
                            title={<><div style={{ fontWeight: 700 }}>{m.label}</div><div>{fmtAmt(m.total)}</div><div>{m.count} PO{m.count !== 1 ? 's' : ''}</div></>}>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'default' }}>
                              <div style={{ width: '100%', height: 110, display: 'flex', alignItems: 'flex-end' }}>
                                <div style={{
                                  width: '100%',
                                  height: `${Math.max(pct, 3)}%`,
                                  background: isRecent ? REDWOOD.primary : REDWOOD.info,
                                  borderRadius: '3px 3px 0 0', opacity: isRecent ? 1 : 0.7,
                                  transition: 'height 0.8s ease',
                                }} />
                              </div>
                              <Text style={{ fontSize: 9, color: REDWOOD.neutral600, marginTop: 3, textAlign: 'center', lineHeight: 1.2 }}>
                                {m.label}
                              </Text>
                            </div>
                          </Tooltip>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 24, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${REDWOOD.neutral200}` }}>
                      {monthlyTrend.slice(-3).map(m => (
                        <div key={m.label}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase' }}>{m.label}</div>
                          <div style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(m.total)}</div>
                          <Text type="secondary" style={{ fontSize: 11 }}>{m.count} PO{m.count !== 1 ? 's' : ''}</Text>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </Card>
          </Col>
        </Row>

        <Row gutter={[12, 12]}>
          {/* ── Top Suppliers ─────────────────────────────────────────────── */}
          <Col xs={24} md={12}>
            <Card styles={{ body: { padding: '16px 20px' } }}
              style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
              <SectionTitle icon={<BankOutlined />} title="Top 10 Suppliers by Amount" />
              {topSuppliers.map((s, i) => (
                <HBar key={s.supplier}
                  value={s.total} max={maxSupplier}
                  color={CHART_COLORS[i % CHART_COLORS.length]}
                  label={s.supplier} count={s.count}
                  rightLabel={fmtAmt(s.total)}
                />
              ))}
            </Card>
          </Col>

          {/* ── Top Items by Amount ───────────────────────────────────────── */}
          <Col xs={24} md={12}>
            <Card styles={{ body: { padding: '16px 20px' } }}
              style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
              <SectionTitle icon={<DollarOutlined />} title="Top 10 Items by Amount" />
              {topItemsByAmt.length === 0
                ? <Empty description="No item codes on lines" style={{ padding: 20 }} />
                : topItemsByAmt.map((it, i) => (
                  <HBar key={it.item}
                    value={it.total} max={maxItemAmt}
                    color={CHART_COLORS[i % CHART_COLORS.length]}
                    label={it.item}
                    sub={it.desc ? `${it.desc}` : undefined}
                    rightLabel={fmtAmt(it.total)}
                  />
                ))}
            </Card>
          </Col>
        </Row>

        <Row gutter={[12, 12]}>
          {/* ── Top Items by Quantity ─────────────────────────────────────── */}
          <Col xs={24} md={12}>
            <Card styles={{ body: { padding: '16px 20px' } }}
              style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
              <SectionTitle icon={<ShoppingCartOutlined />} title="Top 10 Items by Quantity" />
              {topItemsByQty.length === 0
                ? <Empty description="No item codes on lines" style={{ padding: 20 }} />
                : topItemsByQty.map((it, i) => (
                  <HBar key={it.item}
                    value={it.qty} max={maxItemQty}
                    color={i % 2 === 0 ? REDWOOD.success : '#00918A'}
                    label={it.item}
                    sub={it.desc || undefined}
                    rightLabel={`${it.qty.toLocaleString()} units`}
                  />
                ))}
            </Card>
          </Col>

          {/* ── Category Breakdown ────────────────────────────────────────── */}
          <Col xs={24} md={12}>
            <Card styles={{ body: { padding: '16px 20px' } }}
              style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
              <SectionTitle icon={<UnorderedListOutlined />} title="Top Categories by Amount" />
              {byCategory.length === 0
                ? <Empty description="No category data on lines" style={{ padding: 20 }} />
                : byCategory.map((c, i) => (
                  <HBar key={c.category}
                    value={c.total} max={maxCat}
                    color={CHART_COLORS[(i + 4) % CHART_COLORS.length]}
                    label={c.category}
                    rightLabel={fmtAmt(c.total)}
                  />
                ))}
            </Card>
          </Col>
        </Row>

        {/* ── Supplier vs Item Pivot ─────────────────────────────────────── */}
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12}>
            <Card styles={{ body: { padding: '16px 20px' } }}
              style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
              <SectionTitle icon={<UserOutlined />} title="Supplier Summary Table" />
              <Table
                size="small"
                pagination={false}
                scroll={{ x: 420 }}
                rowKey="supplier"
                dataSource={topSuppliers}
                columns={[
                  { title: 'Supplier', dataIndex: 'supplier', ellipsis: true,
                    render: v => <Text style={{ fontSize: 12, fontWeight: 600 }}>{v}</Text> },
                  { title: 'POs', dataIndex: 'count', width: 52, align: 'center',
                    render: v => <Tag color="blue" style={{ fontSize: 11 }}>{v}</Tag> },
                  { title: 'Lines', dataIndex: 'lineCount', width: 58, align: 'center',
                    render: v => <Tag color="geekblue" style={{ fontSize: 11 }}>{v}</Tag> },
                  { title: 'Total', dataIndex: 'total', width: 130, align: 'right',
                    render: v => <Text strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: REDWOOD.primary }}>{fmtAmt(v)}</Text> },
                ]}
                rowClassName={(_, i) => i % 2 !== 0 ? 'po-row-alt' : ''}
              />
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card styles={{ body: { padding: '16px 20px' } }}
              style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
              <SectionTitle icon={<FileTextOutlined />} title="Item Summary Table (by Amount)" />
              {topItemsByAmt.length === 0
                ? <Empty description="No item codes on lines" style={{ padding: 20 }} />
                : (
                  <Table
                    size="small"
                    pagination={false}
                    scroll={{ x: 420 }}
                    rowKey="item"
                    dataSource={topItemsByAmt}
                    columns={[
                      { title: 'Item', dataIndex: 'item', width: 120,
                        render: v => <Text style={{ fontSize: 12, fontWeight: 600, color: REDWOOD.info }}>{v}</Text> },
                      { title: 'Description', dataIndex: 'desc', ellipsis: true,
                        render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
                      { title: 'Qty', dataIndex: 'qty', width: 70, align: 'right',
                        render: v => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{v?.toLocaleString() ?? '—'}</Text> },
                      { title: 'Total', dataIndex: 'total', width: 120, align: 'right',
                        render: v => <Text strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: REDWOOD.primary }}>{fmtAmt(v)}</Text> },
                    ]}
                    rowClassName={(_, i) => i % 2 !== 0 ? 'po-row-alt' : ''}
                  />
                )}
            </Card>
          </Col>
        </Row>

      </>)}
    </div>
  );
};

// ── Main Page with Tabs ──────────────────────────────────────────────────────
const ManagePurchaseOrders: React.FC = () => {
  const [openPOs, setOpenPOs]         = useState<RawPO[]>([]);
  const [activeTab, setActiveTab]     = useState('search');
  const [createPoOpen, setCreatePoOpen] = useState(false);

  const handleOpen = (po: RawPO) => {
    const key = String(po.POHeaderId);
    if (!openPOs.find(p => p.POHeaderId === po.POHeaderId)) {
      setOpenPOs(prev => [...prev, po]);
    }
    setActiveTab(key);
  };

  const handleCloseTab = (key: string) => {
    if (key === 'create') { setCreatePoOpen(false); setActiveTab('search'); return; }
    const remaining = openPOs.filter(p => String(p.POHeaderId) !== key);
    setOpenPOs(remaining);
    if (activeTab === key) {
      setActiveTab(remaining.length > 0 ? String(remaining[remaining.length - 1].POHeaderId) : 'search');
    }
  };

  const openCreatePO = () => { setCreatePoOpen(true); setActiveTab('create'); };
  const closeCreatePO = () => { setCreatePoOpen(false); setActiveTab('search'); };

  const tabItems = [
    {
      key: 'search',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <SearchOutlined style={{ fontSize: 13 }} /> Search Orders
        </span>
      ),
      children: <SearchTab onOpen={handleOpen} />,
      closable: false,
    },
    {
      key: 'lines',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <UnorderedListOutlined style={{ fontSize: 13 }} /> Search Lines
        </span>
      ),
      children: <LinesTab onOpenPO={handleOpen} />,
      closable: false,
    },
    {
      key: 'analytics',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <HistoryOutlined style={{ fontSize: 13 }} /> Analytics
        </span>
      ),
      children: <AnalyticsTab />,
      closable: false,
    },
    ...(createPoOpen ? [{
      key: 'create',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <PlusOutlined style={{ fontSize: 12, color: REDWOOD.success }} />
          <span style={{ fontWeight: 600, color: REDWOOD.success }}>Create PO</span>
        </span>
      ),
      children: <CreatePurchaseOrder onExit={closeCreatePO} />,
      closable: true,
    }] : []),
    ...openPOs.map(po => ({
      key: String(po.POHeaderId),
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShoppingCartOutlined style={{ fontSize: 12, color: REDWOOD.primary }} />
          <span style={{ fontWeight: 600, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {po.OrderNumber}
          </span>
        </span>
      ),
      children: <PODetailPage po={po} onClose={() => handleCloseTab(String(po.POHeaderId))} />,
      closable: true,
    })),
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{ padding: '12px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/procurement">Procurement</Link> },
            { title: 'Purchase Orders' },
          ]} />
        </div>

        {/* Tab container */}
        <Tabs
          type="editable-card"
          hideAdd
          activeKey={activeTab}
          onChange={setActiveTab}
          onEdit={(key, action) => { if (action === 'remove') handleCloseTab(String(key)); }}
          items={tabItems}
          style={{ background: REDWOOD.surface }}
          tabBarStyle={{
            margin: 0,
            paddingLeft: 16,
            borderBottom: `2px solid ${REDWOOD.neutral200}`,
            background: REDWOOD.surface,
          }}
          tabBarGutter={4}
          tabBarExtraContent={{
            right: (
              <div style={{ paddingRight: 16 }}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openCreatePO}
                  style={{ background: REDWOOD.success, borderColor: REDWOOD.success, fontWeight: 600 }}
                >
                  + Create PO
                </Button>
              </div>
            ),
          }}
        />

      </Content>
    </Layout>
  );
};

export default ManagePurchaseOrders;
