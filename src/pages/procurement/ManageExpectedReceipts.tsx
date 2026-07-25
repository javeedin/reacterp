import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Layout, Card, Table, Form, Input, Select, DatePicker, Button,
  Tabs, Tag, Typography, Space, Badge, Tooltip, Spin, Row, Col, message, Modal, InputNumber,
} from 'antd';
import type { TabsProps } from 'antd';
import {
  SearchOutlined, EyeOutlined, ClearOutlined, InboxOutlined,
  ReloadOutlined, HomeOutlined, FileExcelOutlined, FilterOutlined,
  CodeOutlined, EnvironmentOutlined, CopyOutlined,
  EditOutlined, NumberOutlined, ApiOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

// In Electron the request goes directly (no CORS). In a browser (localhost dev)
// we route through the Vite proxy to avoid CORS blocking.
const _isElectron = !!(window as unknown as { electron?: unknown }).electron;
const FUSION_BASE = _isElectron
  ? 'https://iacney-test.fa.ocs.oraclecloud.com/fscmRestApi/resources/11.13.18.05'
  : '/fusion-api';
const AUTH_HEADER = 'Basic ' + btoa('emparun:Fusion@1234');
const FUSION_HDRS = { Authorization: AUTH_HEADER, Accept: 'application/json' };

const REDWOOD = {
  primary: '#C74634',
  info: '#0572CE',
  success: '#1D7B4D',
  warning: '#D4A800',
  teal: '#00918A',
  bg: '#F4F5F7',
  surface: '#FFFFFF',
  neutral200: '#E5E5E5',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface ReceiptLine {
  DocumentLineId?: number;
  DocumentNumber?: string;
  DocumentLineNumber?: number;
  DocumentScheduleNumber?: number;
  ItemNumber?: string;
  ItemDescription?: string;
  ToOrganizationCode?: string;
  VendorName?: string;
  VendorSiteCode?: string;
  SourceDocumentCode?: string;
  ShipToLocation?: string;
  AvailableQuantity?: number;
  OrderedQuantity?: number;
  UOMCode?: string;
  DueDate?: string;
  POUnitPrice?: number;
  CurrencyCode?: string;
  IntegrationStatus?: string;
  DestinationType?: string;
  links?: Array<{ name: string; href: string; rel?: string }>;
  _selfLink?: string;
  [key: string]: unknown;
}

interface POGroup {
  DocumentNumber: string;
  ToOrganizationCode: string;
  SourceDocumentCode: string;
  VendorName: string;
  DestinationType: string;
  ShipToLocation: string;
  IntegrationStatus: string;
  dueDateEarliest: string;
  dueDateLatest: string;
  linesCount: number;
  lines: ReceiptLine[];
}

interface OpenTab {
  key: string;
  poNumber: string;
  lines: ReceiptLine[];
}

type DateMode = 'none' | 'exact' | 'last7' | 'last15' | 'range';

// ── Helpers ────────────────────────────────────────────────────────────────────
const buildQuery = (
  org: string, poNum: string, dateMode: DateMode,
  exactDate: Dayjs | null, dateRange: [Dayjs | null, Dayjs | null] | null,
): string => {
  const parts: string[] = [];
  if (org.trim()) parts.push(`ToOrganizationCode='${org.trim()}'`);
  if (poNum.trim()) parts.push(`DocumentNumber='${poNum.trim()}'`);
  if (dateMode === 'exact' && exactDate)
    parts.push(`DueDate='${exactDate.format('YYYY-MM-DD')}'`);
  else if (dateMode === 'last7')
    parts.push(`DueDate>='${dayjs().subtract(7, 'day').format('YYYY-MM-DD')}'`);
  else if (dateMode === 'last15')
    parts.push(`DueDate>='${dayjs().subtract(15, 'day').format('YYYY-MM-DD')}'`);
  else if (dateMode === 'range' && dateRange?.[0] && dateRange?.[1]) {
    parts.push(`DueDate>='${dateRange[0].format('YYYY-MM-DD')}'`);
    parts.push(`DueDate<='${dateRange[1].format('YYYY-MM-DD')}'`);
  }
  return parts.join(';');
};

function groupRows(rows: ReceiptLine[]): POGroup[] {
  const map = new Map<string, {
    ToOrganizationCode: Set<string>;
    SourceDocumentCode: Set<string>;
    VendorName: Set<string>;
    DestinationType: Set<string>;
    ShipToLocation: Set<string>;
    IntegrationStatus: Set<string>;
    dueDates: string[];
    lines: ReceiptLine[];
  }>();

  for (const row of rows) {
    const key = row.DocumentNumber ?? '';
    if (!map.has(key)) {
      map.set(key, {
        ToOrganizationCode: new Set(),
        SourceDocumentCode: new Set(),
        VendorName: new Set(),
        DestinationType: new Set(),
        ShipToLocation: new Set(),
        IntegrationStatus: new Set(),
        dueDates: [],
        lines: [],
      });
    }
    const g = map.get(key)!;
    if (row.ToOrganizationCode) g.ToOrganizationCode.add(row.ToOrganizationCode);
    if (row.SourceDocumentCode) g.SourceDocumentCode.add(String(row.SourceDocumentCode));
    if (row.VendorName) g.VendorName.add(row.VendorName);
    if (row.DestinationType) g.DestinationType.add(row.DestinationType);
    if (row.ShipToLocation) g.ShipToLocation.add(String(row.ShipToLocation));
    if (row.IntegrationStatus) g.IntegrationStatus.add(row.IntegrationStatus);
    if (row.DueDate) g.dueDates.push(row.DueDate);
    g.lines.push(row);
  }

  const pick = (s: Set<string>) => s.size === 0 ? '—' : s.size === 1 ? [...s][0] : 'Multiple';
  const pickStatus = (s: Set<string>) => s.size === 0 ? '—' : s.size === 1 ? [...s][0] : 'Mixed';

  return Array.from(map.entries()).map(([docNum, g]) => {
    const sorted = [...g.dueDates].sort();
    return {
      DocumentNumber: docNum,
      ToOrganizationCode: pick(g.ToOrganizationCode),
      SourceDocumentCode: pick(g.SourceDocumentCode),
      VendorName: pick(g.VendorName),
      DestinationType: pick(g.DestinationType),
      ShipToLocation: pick(g.ShipToLocation),
      IntegrationStatus: pickStatus(g.IntegrationStatus),
      dueDateEarliest: sorted[0] ?? '',
      dueDateLatest: sorted[sorted.length - 1] ?? '',
      linesCount: g.lines.length,
      lines: g.lines,
    };
  });
}

async function fetchLinesToReceive(q: string): Promise<ReceiptLine[]> {
  const qParam = q ? `q=${encodeURIComponent(q)}&` : '';
  let all: ReceiptLine[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const url = `${FUSION_BASE}/linesToReceive?${qParam}limit=500&offset=${offset}`;
    const res = await fetch(url, { headers: FUSION_HDRS });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    const items: ReceiptLine[] = (data.items ?? []).map((item: ReceiptLine) => ({
      ...item,
      _selfLink: item.links?.find(l => l.name === 'linesToReceive')?.href,
    }));
    all = [...all, ...items];
    hasMore = items.length === 500;
    offset += 500;
  }
  return all;
}

// ── DueDateTag ─────────────────────────────────────────────────────────────────
const DueDateTag: React.FC<{ date?: string }> = ({ date }) => {
  if (!date) return <span>—</span>;
  const d = dayjs(date);
  const diff = d.diff(dayjs(), 'day');
  const color = diff < 0 ? REDWOOD.primary : diff <= 7 ? REDWOOD.warning : REDWOOD.success;
  return (
    <Tag style={{ background: color + '18', color, borderColor: color + '60', fontWeight: 600 }}>
      {d.format('YYYY-MM-DD')}
    </Tag>
  );
};

// ── InfoTile ────────────────────────────────────────────────────────────────────
const InfoTile: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div style={{ background: REDWOOD.bg, borderRadius: 6, padding: '8px 12px', minWidth: 0 }}>
    <div style={{ fontSize: 10, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
      {label}
    </div>
    <div style={{ fontSize: 12, color: REDWOOD.neutral900, fontWeight: 600, wordBreak: 'break-word' }}>
      {value || '—'}
    </div>
  </div>
);

// ── StatusTag ──────────────────────────────────────────────────────────────────
const StatusTag: React.FC<{ status?: string }> = ({ status }) => {
  if (!status || status === '—') return <span>—</span>;
  if (status === 'Mixed') return <Tag color="orange">Mixed</Tag>;
  const isReady = status === 'Ready to interface';
  const color = isReady ? REDWOOD.success : REDWOOD.warning;
  return (
    <Tag style={{ background: color + '18', color, borderColor: color + '60', fontSize: 11 }}>{status}</Tag>
  );
};

// ── AllFieldsModal ──────────────────────────────────────────────────────────────
const AllFieldsModal: React.FC<{
  open: boolean;
  onClose: () => void;
  record: Record<string, unknown> | null;
  title: string;
}> = ({ open, onClose, record, title }) => {
  const entries = record
    ? Object.entries(record).filter(([k, v]) => !k.startsWith('_') && k !== 'links' && v !== null && v !== undefined)
    : [];
  return (
    <Modal open={open} title={title} onCancel={onClose} width={800}
      footer={[<Button key="close" onClick={onClose}>Close</Button>]}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '8px 24px', maxHeight: 520, overflowY: 'auto', padding: '8px 0',
      }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ borderBottom: `1px solid ${REDWOOD.neutral200}`, paddingBottom: 6 }}>
            <div style={{ fontSize: 10, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</div>
            <div style={{ fontSize: 12, color: REDWOOD.neutral900, wordBreak: 'break-all' }}>{String(v)}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
};

// ── PO Detail Tab ───────────────────────────────────────────────────────────────
interface RcvData { lotNumber: string; locator: string; fromSerial: string; toSerial: string; qty: number; }

const PODetailTab: React.FC<{ poNumber: string; initialLines: ReceiptLine[] }> = ({
  poNumber, initialLines,
}) => {
  const [lines, setLines]   = useState<ReceiptLine[]>(initialLines);
  const [loading, setLoading] = useState(false);
  const [allFieldsRecord, setAllFieldsRecord] = useState<ReceiptLine | null>(null);
  const [detailSubTab, setDetailSubTab] = useState<'lines' | 'receiving'>('lines');

  // Receiving state
  const [rcvSelectedKeys, setRcvSelectedKeys] = useState<(string | number)[]>([]);
  const [rcvLineData, setRcvLineData]         = useState<Record<string, RcvData>>({});
  const [rcvShipmentNum, setRcvShipmentNum]   = useState('');
  const [rcvJsonOpen, setRcvJsonOpen]         = useState(false);

  // Lot / serial customisation
  const [lotPrefix, setLotPrefix]           = useState(`IGRN_${poNumber}`);
  const [serialStart, setSerialStart]       = useState(1);
  const [rcvLotOpen, setRcvLotOpen]         = useState(false);
  const [rcvSerialOpen, setRcvSerialOpen]   = useState(false);
  const [tempLot, setTempLot]               = useState('');
  const [tempSerial, setTempSerial]         = useState(1);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await fetchLinesToReceive(`DocumentNumber='${poNumber}'`);
      setLines(fresh);
    } catch (e: unknown) {
      message.error('Refresh failed: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [poNumber]);

  const pad3 = (n: number) => String(Math.ceil(n)).padStart(3, '0');

  // Assign cumulative serials across ALL lines so each line continues where the previous ended.
  // Reacts to lotPrefix / serialStart changes automatically via useEffect below.
  const initAllRcvLines = useCallback((lineList: ReceiptLine[]): Record<string, RcvData> => {
    const result: Record<string, RcvData> = {};
    let counter = serialStart;
    lineList.forEach(r => {
      const qty = Math.ceil(r.AvailableQuantity ?? r.OrderedQuantity ?? 1);
      const k = String(r.DocumentLineId ?? '');
      result[k] = {
        lotNumber:  lotPrefix,
        locator:    '',
        fromSerial: `${lotPrefix}_${pad3(counter)}`,
        toSerial:   `${lotPrefix}_${pad3(counter + qty - 1)}`,
        qty,
      };
      counter += qty;
    });
    return result;
  }, [lotPrefix, serialStart]);

  // Re-initialise whenever lines change (first load or refresh).
  React.useEffect(() => {
    if (lines.length > 0) setRcvLineData(initAllRcvLines(lines));
  }, [lines, initAllRcvLines]);

  const rcvUpdateField = useCallback((lineKey: string, field: keyof RcvData, value: string | number) => {
    setRcvLineData(prev => ({ ...prev, [lineKey]: { ...prev[lineKey], [field]: value } as RcvData }));
  }, []);

  const buildReceivingJson = useCallback(() => {
    const firstL = lines[0];
    const shipNum = rcvShipmentNum.trim() || String(Date.now()).slice(-6);
    const selectedLines = lines.filter(l => rcvSelectedKeys.includes(String(l.DocumentLineId ?? '')));
    return {
      FromOrganizationCode: null,
      OrganizationCode:  firstL?.ToOrganizationCode ?? '',
      ReceiptSourceCode: 'VENDOR',
      EmployeeId:        '',
      VendorName:        firstL?.VendorName ?? '',
      ShipmentNumber:    shipNum,
      lines: selectedLines.map(line => {
        const k = String(line.DocumentLineId ?? '');
        const d: RcvData = rcvLineData[k];
        if (!d) return null;
        return {
          POHeaderId:       String((line as Record<string, unknown>).DocumentHeaderId ?? ''),
          POLineLocationId: String(line.DocumentLineId ?? ''),
          SourceDocumentCode: 'PO',
          ReceiptSourceCode:  'VENDOR',
          TransactionType:    'RECEIVE',
          AutoTransactCode:   'DELIVER',
          DocumentNumber:      line.DocumentNumber ?? poNumber,
          DocumentLineNumber:  String(line.DocumentLineNumber ?? ''),
          ItemNumber:         line.ItemNumber ?? '',
          OrganizationCode:   line.ToOrganizationCode ?? '',
          Subinventory:       '',
          Quantity:           d.qty,
          FromOrganizationCode: null,
          UnitOfMeasure:      line.UOMCode ?? '',
          lotSerialItemLots: [{
            LotNumber:           d.lotNumber,
            TransactionQuantity: d.qty,
            lotSerialItemSerials: [{
              FromSerialNumber: d.fromSerial,
              ToSerialNumber:   d.toSerial,
            }],
          }],
        };
      }).filter(Boolean),
    };
  }, [lines, rcvSelectedKeys, rcvLineData, rcvShipmentNum, poNumber]);

  const firstLine = lines[0];

  // ── Lines tab columns ──────────────────────────────────────────────────────
  const lineColumns = [
    { title: 'Line / Sch', key: 'linesch', width: 90,
      render: (_: unknown, r: ReceiptLine) => `${r.DocumentLineNumber ?? '—'}.${r.DocumentScheduleNumber ?? '—'}` },
    { title: 'Item Number', dataIndex: 'ItemNumber', key: 'ItemNumber', width: 150,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{v ?? '—'}</span> },
    { title: 'Description', dataIndex: 'ItemDescription', key: 'ItemDescription', width: 220, ellipsis: true,
      render: (v: string) => <Tooltip title={v}><span>{v ?? '—'}</span></Tooltip> },
    { title: 'Avail Qty', dataIndex: 'AvailableQuantity', key: 'AvailableQuantity', width: 90, align: 'right' as const,
      render: (v: number) => {
        if (v === undefined || v === null) return '—';
        const color = v > 0 ? REDWOOD.success : REDWOOD.info;
        return <Tag style={{ background: color + '18', color, borderColor: color + '60', fontWeight: 600 }}>{v.toLocaleString()}</Tag>;
      } },
    { title: 'Ordered Qty', dataIndex: 'OrderedQuantity', key: 'OrderedQuantity', width: 100, align: 'right' as const,
      render: (v: number) => v !== undefined && v !== null ? v.toLocaleString() : '—' },
    { title: 'UOM', dataIndex: 'UOMCode', key: 'UOMCode', width: 60, align: 'center' as const },
    { title: 'Due Date', dataIndex: 'DueDate', key: 'DueDate', width: 130,
      render: (v: string) => <DueDateTag date={v} /> },
    { title: 'Unit Price', dataIndex: 'POUnitPrice', key: 'POUnitPrice', width: 110, align: 'right' as const,
      render: (v: number) => v !== undefined && v !== null
        ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—' },
    { title: 'Currency', dataIndex: 'CurrencyCode', key: 'CurrencyCode', width: 80 },
    { title: 'Status', dataIndex: 'IntegrationStatus', key: 'IntegrationStatus', width: 170,
      render: (v: string) => <StatusTag status={v} /> },
    { title: '', key: 'actions', width: 48, fixed: 'right' as const,
      render: (_: unknown, record: ReceiptLine) => (
        <Tooltip title="View all fields">
          <Button size="small" icon={<EyeOutlined />} onClick={() => setAllFieldsRecord(record)} />
        </Tooltip>
      ) },
  ];

  // ── Receiving tab columns ──────────────────────────────────────────────────
  const rcvColumns = [
    { title: 'Line / Sch', key: 'linesch', width: 80,
      render: (_: unknown, r: ReceiptLine) => `${r.DocumentLineNumber ?? '—'}.${r.DocumentScheduleNumber ?? '—'}` },
    { title: 'Item', dataIndex: 'ItemNumber', key: 'ItemNumber', width: 130,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{v ?? '—'}</span> },
    { title: 'Description', dataIndex: 'ItemDescription', key: 'ItemDescription', width: 180, ellipsis: true,
      render: (v: string) => <Tooltip title={v}><span style={{ fontSize: 12 }}>{v ?? '—'}</span></Tooltip> },
    { title: 'Qty', key: 'rcvQty', width: 90, align: 'right' as const,
      render: (_: unknown, r: ReceiptLine) => {
        const k = String(r.DocumentLineId ?? '');
        const disabled = !rcvSelectedKeys.includes(k);
        return <InputNumber size="small" min={0} precision={4} style={{ width: 80 }} disabled={disabled}
          value={rcvLineData[k]?.qty ?? (r.AvailableQuantity ?? r.OrderedQuantity ?? 0)}
          onChange={val => rcvUpdateField(k, 'qty', val ?? 0)} />;
      } },
    { title: 'UOM', dataIndex: 'UOMCode', key: 'UOMCode', width: 60, align: 'center' as const,
      render: (v: string) => <Tag style={{ fontSize: 11 }}>{v ?? '—'}</Tag> },
    { title: 'Lot Number', key: 'lotNumber', width: 200,
      render: (_: unknown, r: ReceiptLine) => {
        const k = String(r.DocumentLineId ?? '');
        const disabled = !rcvSelectedKeys.includes(k);
        return <Input size="small" style={{ width: 190 }} disabled={disabled}
          value={rcvLineData[k]?.lotNumber ?? `IGRN_${poNumber}`}
          onChange={e => rcvUpdateField(k, 'lotNumber', e.target.value)} />;
      } },
    { title: 'Locator', key: 'locator', width: 150,
      render: (_: unknown, r: ReceiptLine) => {
        const k = String(r.DocumentLineId ?? '');
        const disabled = !rcvSelectedKeys.includes(k);
        return <Input size="small" style={{ width: 140 }} placeholder="—" disabled={disabled}
          value={rcvLineData[k]?.locator ?? ''}
          onChange={e => rcvUpdateField(k, 'locator', e.target.value)} />;
      } },
    { title: 'From Serial', key: 'fromSerial', width: 220,
      render: (_: unknown, r: ReceiptLine) => {
        const k = String(r.DocumentLineId ?? '');
        const disabled = !rcvSelectedKeys.includes(k);
        return <Input size="small" style={{ width: 210 }} disabled={disabled}
          value={rcvLineData[k]?.fromSerial ?? ''}
          onChange={e => rcvUpdateField(k, 'fromSerial', e.target.value)} />;
      } },
    { title: 'To Serial', key: 'toSerial', width: 220,
      render: (_: unknown, r: ReceiptLine) => {
        const k = String(r.DocumentLineId ?? '');
        const disabled = !rcvSelectedKeys.includes(k);
        return <Input size="small" style={{ width: 210 }} disabled={disabled}
          value={rcvLineData[k]?.toSerial ?? ''}
          onChange={e => rcvUpdateField(k, 'toSerial', e.target.value)} />;
      } },
  ];

  return (
    <div style={{ padding: '4px 0 20px' }}>
      {/* Header strip */}
      <Card
        size="small"
        style={{ marginBottom: 14, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
        styles={{ body: { padding: '12px 16px' } }}
        title={<Text strong style={{ color: REDWOOD.teal, fontSize: 13 }}>Purchase Order Header</Text>}
        extra={
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={handleRefresh}>
            Refresh Lines
          </Button>
        }
      >
        <Row gutter={[8, 8]}>
          <Col xs={12} sm={8} md={4}><InfoTile label="PO Number" value={<span style={{ color: REDWOOD.info, fontWeight: 700 }}>{poNumber}</span>} /></Col>
          <Col xs={12} sm={8} md={4}><InfoTile label="Organization" value={firstLine?.ToOrganizationCode} /></Col>
          <Col xs={12} sm={8} md={4}><InfoTile label="Vendor" value={firstLine?.VendorName} /></Col>
          <Col xs={12} sm={8} md={4}><InfoTile label="Vendor Site" value={firstLine?.VendorSiteCode} /></Col>
          <Col xs={12} sm={8} md={4}><InfoTile label="Source Doc Code" value={firstLine?.SourceDocumentCode as string} /></Col>
          <Col xs={12} sm={8} md={4}><InfoTile label="Currency" value={firstLine?.CurrencyCode} /></Col>
          <Col xs={12} sm={8} md={4}><InfoTile label="Destination Type" value={firstLine?.DestinationType} /></Col>
          <Col xs={12} sm={8} md={4}><InfoTile label="Ship To Location" value={firstLine?.ShipToLocation as string} /></Col>
          <Col xs={12} sm={8} md={4}><InfoTile label="Integration Status" value={firstLine?.IntegrationStatus} /></Col>
          <Col xs={12} sm={8} md={4}><InfoTile label="Total Lines" value={String(lines.length)} /></Col>
        </Row>
      </Card>

      {/* Lines / Receiving tabs */}
      <Card
        size="small"
        style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
        styles={{ body: { padding: '0 12px 12px' } }}
      >
        <Tabs
          size="small"
          activeKey={detailSubTab}
          onChange={k => setDetailSubTab(k as 'lines' | 'receiving')}
          tabBarStyle={{ marginBottom: 0 }}
          items={[
            {
              key: 'lines',
              label: (
                <Space size={4}>
                  <span>Lines</span>
                  <Badge count={lines.length} size="small" style={{ background: REDWOOD.teal }} overflowCount={9999} />
                  {loading && <Spin size="small" />}
                </Space>
              ),
              children: (
                <div style={{ paddingTop: 8 }}>
                  <Table<ReceiptLine>
                    dataSource={lines}
                    columns={lineColumns}
                    rowKey={(r, i) => String(r.DocumentLineId ?? i)}
                    size="small"
                    scroll={{ x: 'max-content' }}
                    loading={loading}
                    pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} lines` }}
                  />
                </div>
              ),
            },
            {
              key: 'receiving',
              label: (
                <Space size={4}>
                  <InboxOutlined />
                  <span>Receiving</span>
                  {rcvSelectedKeys.length > 0 && (
                    <Badge count={rcvSelectedKeys.length} size="small" style={{ background: REDWOOD.primary }} />
                  )}
                </Space>
              ),
              children: (
                <div style={{ paddingTop: 10 }}>
                  {/* Toolbar */}
                  <Space style={{ marginBottom: 12, flexWrap: 'wrap' as const }}>
                    <Button
                      type="primary"
                      icon={<InboxOutlined />}
                      disabled={rcvSelectedKeys.length === 0}
                      style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
                      onClick={() => message.info('Receive PO — wire to the Fusion receiving endpoint')}
                    >
                      Receive PO
                    </Button>
                    <Button
                      icon={<EnvironmentOutlined />}
                      disabled={rcvSelectedKeys.length === 0}
                      onClick={() => message.info('Find Locators — not yet implemented')}
                    >
                      Find Locators
                    </Button>
                    <Button
                      icon={<CodeOutlined />}
                      disabled={rcvSelectedKeys.length === 0}
                      onClick={() => setRcvJsonOpen(true)}
                    >
                      View JSON
                    </Button>
                    <Button
                      icon={<EditOutlined />}
                      onClick={() => { setTempLot(lotPrefix); setRcvLotOpen(true); }}
                    >
                      Change Lot
                    </Button>
                    <Button
                      icon={<NumberOutlined />}
                      onClick={() => { setTempSerial(serialStart); setRcvSerialOpen(true); }}
                    >
                      Serial Start
                    </Button>
                    {rcvSelectedKeys.length > 0 && (
                      <Tag color="blue">{rcvSelectedKeys.length} line{rcvSelectedKeys.length !== 1 ? 's' : ''} selected</Tag>
                    )}
                    <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Shipment #:</Text>
                    <Input
                      size="small" style={{ width: 140 }} placeholder="auto-generated"
                      value={rcvShipmentNum}
                      onChange={e => setRcvShipmentNum(e.target.value)}
                    />
                  </Space>

                  <Table<ReceiptLine>
                    dataSource={lines}
                    columns={rcvColumns}
                    rowKey={r => String(r.DocumentLineId ?? '')}
                    size="small"
                    scroll={{ x: 'max-content' }}
                    loading={loading}
                    pagination={false}
                    rowClassName={(_, i) => i % 2 !== 0 ? 'po-row-alt' : ''}
                    rowSelection={{
                      selectedRowKeys: rcvSelectedKeys,
                      onChange: keys => setRcvSelectedKeys(keys as (string | number)[]),
                    }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      <AllFieldsModal
        open={!!allFieldsRecord}
        onClose={() => setAllFieldsRecord(null)}
        record={allFieldsRecord as Record<string, unknown> | null}
        title={`All Fields — PO ${poNumber} · Line ${allFieldsRecord?.DocumentLineNumber ?? ''}.${allFieldsRecord?.DocumentScheduleNumber ?? ''}`}
      />

      {/* Receiving JSON Preview Modal */}
      <Modal
        title={<Space><CodeOutlined style={{ color: REDWOOD.info }} />Receiving JSON Preview — PO {poNumber}</Space>}
        open={rcvJsonOpen}
        onCancel={() => setRcvJsonOpen(false)}
        width={960}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(buildReceivingJson(), null, 2));
            message.success('Copied to clipboard');
          }}>Copy JSON</Button>,
          <Button key="close" onClick={() => setRcvJsonOpen(false)}>Close</Button>,
        ]}
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          {rcvSelectedKeys.length} line{rcvSelectedKeys.length !== 1 ? 's' : ''} selected · PO: <Text strong>{poNumber}</Text>
        </Text>
        <pre style={{
          background: '#1e1e1e', color: '#d4d4d4',
          padding: 16, borderRadius: 8,
          maxHeight: 520, overflow: 'auto',
          fontSize: 12, lineHeight: 1.6,
          fontFamily: '"Fira Code", Consolas, monospace',
          margin: 0,
        }}>
          {JSON.stringify(buildReceivingJson(), null, 2)}
        </pre>
      </Modal>

      {/* Change Lot Number Modal */}
      <Modal
        title={<Space><EditOutlined style={{ color: REDWOOD.info }} />Change Lot Number</Space>}
        open={rcvLotOpen}
        onOk={() => { setLotPrefix(tempLot || `IGRN_${poNumber}`); setRcvLotOpen(false); }}
        onCancel={() => setRcvLotOpen(false)}
        okText="Apply & Regenerate"
        width={440}
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
          The lot number is applied to all lines. Serial numbers will also be regenerated using this value as prefix.
        </Text>
        <Input
          value={tempLot}
          onChange={e => setTempLot(e.target.value)}
          placeholder={`IGRN_${poNumber}`}
          addonBefore="Lot #"
          size="large"
        />
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
          Current: <Text strong code>{lotPrefix}</Text>
        </Text>
      </Modal>

      {/* Change Serial Start Modal */}
      <Modal
        title={<Space><NumberOutlined style={{ color: REDWOOD.info }} />Change Serial Start Number</Space>}
        open={rcvSerialOpen}
        onOk={() => { setSerialStart(tempSerial > 0 ? tempSerial : 1); setRcvSerialOpen(false); }}
        onCancel={() => setRcvSerialOpen(false)}
        okText="Apply & Regenerate"
        width={440}
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
          Serial numbers will be re-assigned starting from this number. All lines are recalculated in order.
        </Text>
        <InputNumber
          min={1}
          value={tempSerial}
          onChange={v => setTempSerial(v ?? 1)}
          style={{ width: '100%' }}
          addonBefore="Start from"
          size="large"
        />
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
          Current start: <Text strong code>{serialStart}</Text> — example: line 1 (qty 10) → <Text code>{lotPrefix}_{pad3(serialStart)}</Text> to <Text code>{lotPrefix}_{pad3(serialStart + 9)}</Text>
        </Text>
      </Modal>
    </div>
  );
};

// ── Search Tab ─────────────────────────────────────────────────────────────────
const SearchTabContent: React.FC<{ onOpenPO: (group: POGroup) => void }> = ({ onOpenPO }) => {
  const [org, setOrg] = useState('');
  const [poNum, setPoNum] = useState('');
  const [sourceDoc, setSourceDoc] = useState<string>('');
  const [orgs, setOrgs] = useState<{ code: string; name: string }[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgError, setOrgError] = useState('');
  const [dateMode, setDateMode] = useState<DateMode>('none');

  // Inventory organizations for the Organization dropdown — same source as the
  // On-Hand Inventory page (inventoryOrganizations web service).
  const orgsUrl = `${FUSION_BASE}/inventoryOrganizations?onlyData=true&limit=500`;
  const loadOrgs = useCallback(() => {
    setOrgsLoading(true); setOrgError('');
    fetch(orgsUrl, { headers: FUSION_HDRS })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status} ${r.statusText}`)))
      .then(d => {
        const items: any[] = Array.isArray(d) ? d : (d.items ?? []);
        const seen = new Set<string>();
        const list = items
          .map(o => ({ code: o.OrganizationCode ?? o.OrganizationCode, name: o.OrganizationName }))
          .filter(o => o.code && !seen.has(o.code) && seen.add(o.code))
          .sort((a, b) => String(a.code).localeCompare(String(b.code)));
        setOrgs(list);
        if (list.length === 0) setOrgError('inventoryOrganizations returned no rows.');
      })
      .catch((e) => setOrgError(e?.message || 'Failed to load organizations'))
      .finally(() => setOrgsLoading(false));
  }, [orgsUrl]);
  useEffect(() => { loadOrgs(); }, [loadOrgs]);
  const [exactDate, setExactDate] = useState<Dayjs | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [groups, setGroups] = useState<POGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [apiOpen, setApiOpen] = useState(false);

  // The exact linesToReceive request the current filters will run.
  const currentUrl = useMemo(() => {
    let q = buildQuery(org, poNum, dateMode, exactDate, dateRange);
    if (sourceDoc.trim()) q = (q ? q + ';' : '') + `SourceDocumentCode='${sourceDoc.trim()}'`;
    const qParam = q ? `q=${encodeURIComponent(q)}&` : '';
    return `${FUSION_BASE}/linesToReceive?${qParam}limit=500&offset=0`;
  }, [org, poNum, sourceDoc, dateMode, exactDate, dateRange]);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    setFilterText('');
    try {
      let q = buildQuery(org, poNum, dateMode, exactDate, dateRange);
      if (sourceDoc.trim()) q = (q ? q + ';' : '') + `SourceDocumentCode='${sourceDoc.trim()}'`;
      const rows = await fetchLinesToReceive(q);
      const grouped = groupRows(rows);
      setGroups(grouped);
      if (grouped.length === 0) message.info('No records found.');
    } catch (e: unknown) {
      message.error('Search failed: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [org, poNum, sourceDoc, dateMode, exactDate, dateRange]);

  const handleClear = () => {
    setOrg(''); setPoNum(''); setSourceDoc(''); setDateMode('none');
    setExactDate(null); setDateRange(null);
    setGroups([]); setSearched(false); setFilterText('');
  };

  const filteredGroups = useMemo(() => {
    if (!filterText.trim()) return groups;
    const term = filterText.toLowerCase();
    return groups.filter(g =>
      [g.DocumentNumber, g.VendorName, g.ToOrganizationCode,
       g.SourceDocumentCode, g.DestinationType, g.ShipToLocation,
       g.IntegrationStatus, g.dueDateEarliest]
        .some(v => v?.toLowerCase().includes(term))
    );
  }, [groups, filterText]);

  const handleExport = useCallback(() => {
    if (filteredGroups.length === 0) { message.warning('No data to export.'); return; }
    const sheetData = filteredGroups.map(g => ({
      'PO Number': g.DocumentNumber,
      'Organization': g.ToOrganizationCode,
      'Source Doc Code': g.SourceDocumentCode,
      'Vendor': g.VendorName,
      'Destination Type': g.DestinationType,
      'Ship To Location': g.ShipToLocation,
      'Integration Status': g.IntegrationStatus,
      'Earliest Due Date': g.dueDateEarliest,
      'Latest Due Date': g.dueDateLatest !== g.dueDateEarliest ? g.dueDateLatest : '',
      'Lines Count': g.linesCount,
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [
      { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 36 },
      { wch: 18 }, { wch: 26 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expected PO Receipts');
    XLSX.writeFile(wb, `expected-po-receipts-${dayjs().format('YYYY-MM-DD')}.xlsx`);
    message.success(`Exported ${filteredGroups.length} purchase orders.`);
  }, [filteredGroups]);

  const columns = [
    {
      title: 'PO Number',
      dataIndex: 'DocumentNumber',
      key: 'DocumentNumber',
      width: 140,
      render: (v: string, record: POGroup) => (
        <Button
          type="link"
          style={{ padding: 0, fontWeight: 700, color: REDWOOD.info }}
          onClick={() => onOpenPO(record)}
        >
          {v}
        </Button>
      ),
    },
    {
      title: 'Organization',
      dataIndex: 'ToOrganizationCode',
      key: 'ToOrganizationCode',
      width: 110,
      render: (v: string) => v && v !== '—' ? <Tag color="cyan">{v}</Tag> : '—',
    },
    {
      title: 'Source Doc Code',
      dataIndex: 'SourceDocumentCode',
      key: 'SourceDocumentCode',
      width: 140,
    },
    {
      title: 'Vendor',
      dataIndex: 'VendorName',
      key: 'VendorName',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Destination Type',
      dataIndex: 'DestinationType',
      key: 'DestinationType',
      width: 140,
    },
    {
      title: 'Ship To Location',
      dataIndex: 'ShipToLocation',
      key: 'ShipToLocation',
      width: 180,
      ellipsis: true,
    },
    {
      title: 'Integration Status',
      dataIndex: 'IntegrationStatus',
      key: 'IntegrationStatus',
      width: 170,
      render: (v: string) => <StatusTag status={v} />,
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDateEarliest',
      key: 'dueDateEarliest',
      width: 140,
      sorter: (a: POGroup, b: POGroup) => {
        if (!a.dueDateEarliest) return 1;
        if (!b.dueDateEarliest) return -1;
        return a.dueDateEarliest.localeCompare(b.dueDateEarliest);
      },
      defaultSortOrder: 'ascend' as const,
      render: (v: string, r: POGroup) => {
        if (!v) return '—';
        const hasRange = r.dueDateLatest && r.dueDateLatest !== v;
        return (
          <Space size={4} direction="vertical" style={{ gap: 2 }}>
            <DueDateTag date={v} />
            {hasRange && (
              <span style={{ fontSize: 10, color: REDWOOD.neutral600 }}>
                → {r.dueDateLatest}
              </span>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Lines',
      dataIndex: 'linesCount',
      key: 'linesCount',
      width: 70,
      align: 'center' as const,
      render: (v: number) => (
        <Badge
          count={v}
          style={{ background: REDWOOD.teal, fontWeight: 600 }}
          overflowCount={999}
        />
      ),
    },
  ];

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Search form */}
      <Card
        style={{ marginBottom: 14, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
        styles={{ body: { padding: '14px 16px' } }}
      >
        <Form layout="vertical">
          <Row gutter={[12, 0]} align="bottom">
            <Col xs={24} sm={6}>
              <Form.Item label="Organization" style={{ marginBottom: 0 }}>
                {orgs.length > 0 ? (
                  <Select
                    showSearch
                    allowClear
                    size="small"
                    loading={orgsLoading}
                    placeholder="Select inventory org"
                    value={org || undefined}
                    onChange={v => setOrg(v || '')}
                    optionFilterProp="label"
                    style={{ width: '100%' }}
                    options={orgs.map(o => ({ label: o.name ? `${o.code} — ${o.name}` : o.code, value: o.code }))}
                  />
                ) : (
                  <Input
                    placeholder={orgsLoading ? 'Loading orgs…' : 'e.g. AMS_B2B_GHANA'}
                    value={org}
                    onChange={e => setOrg(e.target.value)}
                    onPressEnter={handleSearch}
                    allowClear
                    size="small"
                    suffix={<Tooltip title="Reload org list"><ReloadOutlined spin={orgsLoading} onClick={loadOrgs} style={{ cursor: 'pointer', color: REDWOOD.info }} /></Tooltip>}
                  />
                )}
              </Form.Item>
            </Col>
            <Col xs={24} sm={6}>
              <Form.Item label="Purchase Order" style={{ marginBottom: 0 }}>
                <Input
                  placeholder="e.g. 2026020014"
                  value={poNum}
                  onChange={e => setPoNum(e.target.value)}
                  onPressEnter={handleSearch}
                  allowClear
                  size="small"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={6}>
              <Form.Item label="Source Document" style={{ marginBottom: 0 }}>
                <Select
                  value={sourceDoc || undefined}
                  onChange={v => setSourceDoc(v || '')}
                  size="small"
                  allowClear
                  placeholder="All"
                  style={{ width: '100%' }}
                  options={[
                    { label: 'Purchase Order (PO)', value: 'PO' },
                    { label: 'Transfer Order (TO)', value: 'TRANSFER ORDER' },
                    { label: 'ASN', value: 'ASN' },
                    { label: 'RMA', value: 'RMA' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={6}>
              <Form.Item label="Date Filter" style={{ marginBottom: 0 }}>
                <Select
                  value={dateMode}
                  onChange={v => { setDateMode(v); setExactDate(null); setDateRange(null); }}
                  size="small"
                  style={{ width: '100%' }}
                >
                  <Option value="none">No Date Filter</Option>
                  <Option value="exact">= Exact Date</Option>
                  <Option value="last7">Last 7 Days</Option>
                  <Option value="last15">Last 15 Days</Option>
                  <Option value="range">Date Range</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={6}>
              <Form.Item label=" " style={{ marginBottom: 0 }}>
                <Space>
                  <Button
                    type="primary"
                    icon={<SearchOutlined />}
                    onClick={handleSearch}
                    loading={loading}
                    size="small"
                    style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                  >
                    Search
                  </Button>
                  <Button icon={<ClearOutlined />} onClick={handleClear} size="small">
                    Clear
                  </Button>
                  <Tooltip title="Show the Fusion web service URL">
                    <Button icon={<ApiOutlined />} size="small" onClick={() => setApiOpen(true)} />
                  </Tooltip>
                </Space>
              </Form.Item>
            </Col>
          </Row>

          {dateMode === 'exact' && (
            <Row style={{ marginTop: 10 }}>
              <Col xs={24} sm={8}>
                <Form.Item label="Exact Date" style={{ marginBottom: 0 }}>
                  <DatePicker
                    value={exactDate}
                    onChange={d => setExactDate(d)}
                    size="small"
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
            </Row>
          )}
          {dateMode === 'range' && (
            <Row style={{ marginTop: 10 }}>
              <Col xs={24} sm={12}>
                <Form.Item label="Date Range" style={{ marginBottom: 0 }}>
                  <RangePicker
                    value={dateRange as [Dayjs, Dayjs] | null}
                    onChange={v => setDateRange(v ? [v[0], v[1]] : null)}
                    size="small"
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
            </Row>
          )}
        </Form>
      </Card>

      <Modal
        open={apiOpen}
        onCancel={() => setApiOpen(false)}
        footer={<Button onClick={() => setApiOpen(false)}>Close</Button>}
        title={<Space><ApiOutlined style={{ color: REDWOOD.info }} />Fusion Web Service</Space>}
        width={720}
      >
        <div style={{ fontSize: 12, marginBottom: 6 }}>
          <Space size={6}><Tag color="blue">GET</Tag><Text type="secondary">Expected receipts — linesToReceive</Text></Space>
        </div>
        <Text copyable style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{currentUrl}</Text>

        <div style={{ fontSize: 12, margin: '16px 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Space size={6}><Tag color="blue">GET</Tag><Text type="secondary">Organizations dropdown — inventoryOrganizations</Text></Space>
          <Tag color={orgError ? 'error' : orgsLoading ? 'processing' : 'success'} style={{ fontSize: 10 }}>
            {orgsLoading ? 'loading…' : orgError ? 'error' : `${orgs.length} orgs`}
          </Tag>
          <Button size="small" icon={<ReloadOutlined />} loading={orgsLoading} onClick={loadOrgs} style={{ marginLeft: 'auto' }}>Reload</Button>
        </div>
        <Text copyable style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{orgsUrl}</Text>
        {orgError && <div style={{ fontSize: 11, color: REDWOOD.primary, marginTop: 6 }}>Org load error: {orgError}</div>}

        <div style={{ fontSize: 11, color: REDWOOD.neutral600, marginTop: 14 }}>
          linesToReceive params: ToOrganizationCode, DocumentNumber, SourceDocumentCode, DueDate (from the filters above).
        </div>
      </Modal>

      {/* Grouped results */}
      {(searched || groups.length > 0) && (
        <Card
          style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
          styles={{ body: { padding: '8px 12px' } }}
          title={
            <Space>
              <InboxOutlined style={{ color: REDWOOD.teal }} />
              <Text strong>Purchase Orders</Text>
              <Badge count={groups.length} style={{ background: REDWOOD.teal }} overflowCount={9999} />
              {filterText && filteredGroups.length !== groups.length && (
                <Tag color="blue">{filteredGroups.length} shown</Tag>
              )}
              {loading && <Spin size="small" />}
            </Space>
          }
          extra={
            <Space size={6}>
              <Button
                size="small"
                icon={<FileExcelOutlined />}
                onClick={handleExport}
                disabled={loading || filteredGroups.length === 0}
                style={{ color: REDWOOD.success, borderColor: REDWOOD.success }}
              >
                Export
              </Button>
              <Button size="small" icon={<ReloadOutlined />} onClick={handleSearch} disabled={loading}>
                Refresh
              </Button>
            </Space>
          }
        >
          {/* Grid filter bar */}
          <div style={{ marginBottom: 10 }}>
            <Input
              size="small"
              allowClear
              placeholder="Filter results by PO, vendor, org, status, date…"
              prefix={<FilterOutlined style={{ color: REDWOOD.neutral600 }} />}
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              style={{ maxWidth: 380 }}
            />
          </div>

          <Table<POGroup>
            dataSource={filteredGroups}
            columns={columns}
            rowKey="DocumentNumber"
            size="small"
            scroll={{ x: 'max-content' }}
            loading={loading}
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} purchase orders` }}
          />
        </Card>
      )}
    </div>
  );
};

// ── Main Page ───────────────────────────────────────────────────────────────────
const ManageExpectedReceipts: React.FC = () => {
  const [activeTab, setActiveTab] = useState('search');
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);

  const handleOpenPO = useCallback((group: POGroup) => {
    const key = `po-${group.DocumentNumber}`;
    setOpenTabs(prev => {
      if (prev.find(t => t.key === key)) return prev;
      return [...prev, { key, poNumber: group.DocumentNumber, lines: group.lines }];
    });
    setActiveTab(key);
  }, []);

  const handleRemoveTab = useCallback((targetKey: string) => {
    setOpenTabs(prev => {
      const idx = prev.findIndex(t => t.key === targetKey);
      const next = prev.filter(t => t.key !== targetKey);
      if (activeTab === targetKey) {
        const fallback = idx > 0 ? prev[idx - 1].key : (next.length > 0 ? next[0].key : 'search');
        setActiveTab(fallback);
      }
      return next;
    });
  }, [activeTab]);

  const tabItems: TabsProps['items'] = [
    {
      key: 'search',
      label: (
        <span>
          <SearchOutlined style={{ marginRight: 4 }} />
          Search
        </span>
      ),
      closable: false,
      children: <SearchTabContent onOpenPO={handleOpenPO} />,
    },
    ...openTabs.map(tab => ({
      key: tab.key,
      label: (
        <span>
          <InboxOutlined style={{ marginRight: 4 }} />
          {`PO ${tab.poNumber}`}
        </span>
      ),
      closable: true,
      children: (
        <PODetailTab
          poNumber={tab.poNumber}
          initialLines={tab.lines}
        />
      ),
    })),
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.bg }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{ padding: '10px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Space>
            <Link to="/home"><HomeOutlined /> Home</Link>
            <Text type="secondary">/</Text>
            <Link to="/procurement">Procurement</Link>
            <Text type="secondary">/</Text>
            <Text>Expected PO Receipts</Text>
          </Space>
        </div>

        <div style={{ padding: 20 }}>
          {/* Page header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: `linear-gradient(135deg, ${REDWOOD.teal} 0%, #007A74 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 12px ${REDWOOD.teal}40`,
            }}>
              <InboxOutlined style={{ fontSize: 22, color: '#fff' }} />
            </div>
            <div>
              <Title level={3} style={{ margin: 0, color: REDWOOD.neutral900 }}>
                Manage Expected PO Receipts
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                View and manage purchase order lines pending receipt in Oracle Fusion
              </Text>
            </div>
          </div>

          <Tabs
            type="editable-card"
            hideAdd
            activeKey={activeTab}
            onChange={setActiveTab}
            onEdit={(targetKey, action) => {
              if (action === 'remove') handleRemoveTab(String(targetKey));
            }}
            items={tabItems}
            style={{ background: REDWOOD.surface, borderRadius: 8, padding: '0 8px' }}
          />
        </div>
      </Content>
    </Layout>
  );
};

export default ManageExpectedReceipts;
