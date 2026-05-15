import React, { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Form, Input, Select,
  DatePicker, Row, Col, Space, Modal, InputNumber, Tabs, Checkbox,
  Spin, Tooltip, Tag, Divider, Badge,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TableRowSelection } from 'antd/es/table/interface';
import {
  HomeOutlined, PlusOutlined, DeleteOutlined, EditOutlined,
  SaveOutlined, CloseOutlined, SearchOutlined, ApiOutlined,
  UserOutlined, CalendarOutlined, DollarOutlined, ShopOutlined,
  BuildOutlined, FileTextOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { message } from 'antd';

const { Content } = Layout;
const { Text, Title } = Typography;
const { Option } = Select;

const FUSION_BASE = 'https://iacney-test.fa.ocs.oraclecloud.com/fscmRestApi/resources/11.13.18.05';
const ORDS_BASE   = 'https://g827cd88c3cfc03-mitsumioracledb.adb.me-dubai-1.oraclecloudapps.com/ords/test/FUSIONCLIENTERP';
const AUTH_HEADER = 'Basic ' + btoa('emparun:Fusion@1234');
const FUSION_HDRS = { Authorization: AUTH_HEADER, Accept: 'application/json' };

const C = {
  red: '#C74634', redDark: '#A33B2C',
  green: '#1D7B4D', blue: '#0572CE',
  orange: '#D4A800', teal: '#00918A', purple: '#6B21A8',
  bg: '#F4F5F7', surface: '#FFFFFF',
  border: '#DFE1E6', borderDark: '#C1C7D0',
  text: '#172B4D', textMid: '#5E6C84', textLight: '#97A0AF',
  rowAlt: '#FAFBFC',
};

const fetchLOV = async (url: string, auth = true): Promise<any[]> => {
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const sep = url.includes('?') ? '&' : '?';
    const r = await fetch(`${url}${sep}limit=500&offset=${offset}`, auth ? { headers: FUSION_HDRS } : {});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const items = d.items ?? (Array.isArray(d) ? d : []);
    all.push(...items);
    if (!d.hasMore || items.length < 500) break;
    offset += 500;
  }
  return all;
};

const generatePONumber = (docType: string): string => {
  const seq = parseInt(sessionStorage.getItem('po_seq') ?? '0', 10) + 1;
  sessionStorage.setItem('po_seq', String(seq));
  return `${docType}${dayjs().format('DDMMYYYY')}${String(seq).padStart(4, '0')}`;
};

const fmt = (v: number) =>
  new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

/* ─── Types ─────────────────────────────────────────── */
interface POHeader {
  poNumber: string; docType: string; orderDate: Dayjs;
  status: string; buyer: string;
  procurementBU: string; requisitioningBU: string; billToBU: string;
  currency: string; description: string;
  supplierId: string; supplierName: string; supplierSite: string;
  supplierContact: string; communicationMethod: string; communicationEmail: string;
  billToLocation: string; shipToLocation: string;
  shipToOrg: string; subinventory: string;
  paymentTerms: string; shippingMethod: string; freightTerms: string; fob: string;
  payOnReceipt: boolean; confirmingOrder: boolean;
  noteToSupplier: string; noteToReceiver: string;
}

interface POLine {
  key: string; lineNum: number;
  itemNumber: string; description: string; uom: string;
  qty: number; price: number; taxPct: number;
  needBy: Dayjs | null; promisedDate: Dayjs | null;
  lineTotal: number; taxAmount: number; netTotal: number;
  chargeAccount: string; destinationType: string;
}

const computeLine = (line: Omit<POLine, 'lineTotal' | 'taxAmount' | 'netTotal'>): POLine => {
  const lineTotal = line.qty * line.price;
  const taxAmount = lineTotal * line.taxPct / 100;
  return { ...line, lineTotal, taxAmount, netTotal: lineTotal + taxAmount };
};

/* ─── Compact field pair (label : value on one row) ─── */
const FieldPair: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 7, gap: 6, minHeight: 24 }}>
    <span style={{ fontSize: 11, color: C.textLight, minWidth: 110, flexShrink: 0 }}>{label}</span>
    <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{value}</span>
  </div>
);

/* ─── Info tile (small label + value) ───────────────── */
const InfoTile: React.FC<{ label: string; value: React.ReactNode; icon?: React.ReactNode }> = ({ label, value, icon }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textLight, marginBottom: 2 }}>
      {icon && <span style={{ marginRight: 4 }}>{icon}</span>}{label}
    </div>
    <div style={{ fontSize: 13, color: C.text, minHeight: 22 }}>{value ?? '—'}</div>
  </div>
);

/* ─── Inline editable field ─────────────────────────── */
const InlineEdit: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => (
  <Input size="small" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder ?? '—'}
    variant="borderless"
    style={{ padding: 0, fontSize: 13, color: value ? C.blue : C.textLight, width: '100%' }} />
);

/* ─── Section header inside card ────────────────────── */
const SectionHead: React.FC<{ title: string; icon?: React.ReactNode; color?: string }> = ({ title, icon, color = C.blue }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, paddingBottom: 8, borderBottom: `2px solid ${color}` }}>
    {icon && <span style={{ color, fontSize: 14 }}>{icon}</span>}
    <Text strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textMid }}>{title}</Text>
  </div>
);

/* ═══════════════════════════════════════════════════════ */
const CreatePurchaseOrder: React.FC = () => {
  const navigate = useNavigate();
  const [headerForm] = Form.useForm();

  const [showInitModal, setShowInitModal] = useState(true);
  const [header, setHeader] = useState<POHeader | null>(null);
  const [lines, setLines] = useState<POLine[]>([]);
  const [defaultTaxPct, setDefaultTaxPct] = useState(0);
  const [needByAll, setNeedByAll] = useState<Dayjs | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  const [busUnits, setBusUnits] = useState<any[]>([]);
  const [currencies, setCurrencies] = useState<any[]>([]);
  const [currencyInput, setCurrencyInput] = useState('');
  const [inventoryOrgs, setInventoryOrgs] = useState<any[]>([]);
  const [subinventories, setSubinventories] = useState<any[]>([]);
  const [allSubinventories, setAllSubinventories] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemKeys, setSelectedItemKeys] = useState<string[]>([]);
  const [lovLoading, setLovLoading] = useState(false);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [initConfirmLoading, setInitConfirmLoading] = useState(false);

  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierResults, setSupplierResults] = useState<any[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [supplierSites, setSupplierSites] = useState<any[]>([]);
  const [supplierApiUrl, setSupplierApiUrl] = useState('');
  const [supplierApiModalOpen, setSupplierApiModalOpen] = useState(false);

  useEffect(() => { if (showInitModal) loadInitLOVs(); }, [showInitModal]);

  const loadInitLOVs = async () => {
    setLovLoading(true);
    try {
      const [buRes, ccyRes, orgRes, subRes] = await Promise.allSettled([
        fetchLOV(`${FUSION_BASE}/finBusinessUnitsLOV`),
        fetch(`${FUSION_BASE}/currencies?limit=500`, { headers: FUSION_HDRS }).then(r => r.json()).then(d => d.items ?? []),
        fetchLOV(`${FUSION_BASE}/inventoryOrganizations`),
        fetch(`${ORDS_BASE}/inventory/inventorywarehousesubinventory`).then(r => r.json()).then(d => d.items ?? (Array.isArray(d) ? d : [])),
      ]);
      if (buRes.status === 'fulfilled') setBusUnits(buRes.value);
      if (ccyRes.status === 'fulfilled') setCurrencies(ccyRes.value);
      if (orgRes.status === 'fulfilled') setInventoryOrgs(orgRes.value);
      if (subRes.status === 'fulfilled') setAllSubinventories(subRes.value);
    } finally { setLovLoading(false); }
  };

  const handleSupplierSearch = useCallback(async (term: string) => {
    if (!term || term.length < 2) return;
    const url = `${FUSION_BASE}/suppliers?q=Supplier LIKE '*${term}*'&limit=20`;
    setSupplierApiUrl(url);
    setSuppliersLoading(true);
    try {
      const r = await fetch(url, { headers: FUSION_HDRS });
      const d = await r.json();
      setSupplierResults(d.items ?? []);
    } catch { /* ignore */ } finally { setSuppliersLoading(false); }
  }, []);

  const loadSupplierSites = async (supplierId: string) => {
    headerForm.setFieldValue('supplierSite', undefined);
    setSupplierSites([]);
    if (!supplierId) return;
    setSitesLoading(true);
    try {
      const r = await fetch(`${FUSION_BASE}/suppliers/${supplierId}/child/sites?limit=100`, { headers: FUSION_HDRS });
      const d = await r.json();
      setSupplierSites(d.items ?? []);
    } catch { /* ignore */ } finally { setSitesLoading(false); }
  };

  const handleSelectSupplier = async (supplier: any) => {
    setSelectedSupplier(supplier);
    setSupplierModalOpen(false);
    await loadSupplierSites(String(supplier.SupplierId));
  };

  const handleShipToOrgChange = (orgCode: string) => {
    headerForm.setFieldValue('subinventory', undefined);
    setSubinventories(allSubinventories.filter((s: any) => s.warehouse_code === orgCode));
  };

  const handleInitSubmit = async () => {
    if (!selectedSupplier) { message.error('Please select a supplier'); return; }
    setInitConfirmLoading(true);
    try {
      const v = await headerForm.validateFields();
      setHeader({
        poNumber: generatePONumber(v.docType),
        docType: v.docType, orderDate: v.orderDate,
        status: 'Incomplete', buyer: 'Current User',
        procurementBU: v.procurementBU, requisitioningBU: v.procurementBU, billToBU: v.billTo,
        currency: v.currency, description: '',
        supplierId: String(selectedSupplier.SupplierId), supplierName: selectedSupplier.Supplier ?? '',
        supplierSite: v.supplierSite ?? '', supplierContact: '',
        communicationMethod: 'E-Mail', communicationEmail: '',
        billToLocation: v.procurementBU, shipToLocation: v.shipToOrg,
        shipToOrg: v.shipToOrg, subinventory: v.subinventory ?? '',
        paymentTerms: '', shippingMethod: '', freightTerms: '', fob: '',
        payOnReceipt: false, confirmingOrder: false,
        noteToSupplier: v.noteToSupplier ?? '', noteToReceiver: '',
      });
      setShowInitModal(false);
    } catch { /* validation */ } finally { setInitConfirmLoading(false); }
  };

  const patch = (p: Partial<POHeader>) => setHeader(prev => prev ? { ...prev, ...p } : prev);

  const handleNeedByAllChange = (date: Dayjs | null) => {
    setNeedByAll(date);
    setLines(prev => prev.map(l => computeLine({ ...l, needBy: date })));
  };

  const handleLineChange = (key: string, field: keyof POLine, value: any) =>
    setLines(prev => prev.map(l => l.key !== key ? l : computeLine({ ...l, [field]: value })));

  const handleDeleteLine = (key: string) =>
    setLines(prev => prev.filter(l => l.key !== key).map((l, i) => ({ ...l, lineNum: i + 1 })));

  const subtotal  = lines.reduce((s, l) => s + l.lineTotal, 0);
  const totalTax  = lines.reduce((s, l) => s + l.taxAmount, 0);
  const grandTotal = lines.reduce((s, l) => s + l.netTotal, 0);

  const openAddItem = async () => {
    if (!header) return;
    setAddItemOpen(true); setSearchTerm(''); setSelectedItemKeys([]); setItemsLoading(true);
    try {
      const r = await fetch(`${ORDS_BASE}/inventory/itemmaster?org=${header.shipToOrg}&limit=500`);
      const d = await r.json();
      setItems(d.items ?? (Array.isArray(d) ? d : []));
    } catch { setItems([]); } finally { setItemsLoading(false); }
  };

  const existingItemNumbers = new Set(lines.map(l => l.itemNumber));
  const filteredItems = items.filter(item => {
    if (!searchTerm) return true;
    const t = searchTerm.toLowerCase();
    return String(item.item_number ?? '').toLowerCase().includes(t) ||
      String(item.description ?? '').toLowerCase().includes(t);
  });

  const handleAddItems = () => {
    const toAdd = items.filter(item =>
      selectedItemKeys.includes(String(item.item_number)) &&
      !existingItemNumbers.has(String(item.item_number)));
    const base = lines.length;
    setLines(prev => [...prev, ...toAdd.map((item, i) => computeLine({
      key: `${item.item_number}-${Date.now()}-${i}`,
      lineNum: base + i + 1,
      itemNumber: String(item.item_number ?? ''), description: String(item.description ?? ''),
      uom: String(item.primary_uom_code ?? item.uom ?? ''),
      qty: 1, price: parseFloat(item.item_price) || 0, taxPct: defaultTaxPct,
      needBy: needByAll, promisedDate: null, chargeAccount: '', destinationType: 'Inventory',
    }))]);
    setAddItemOpen(false);
  };

  /* ─── Column defs ─────────────────────────────────── */
  const itemTableCols: ColumnsType<any> = [
    { title: 'Item Number', dataIndex: 'item_number', width: 140, render: v => <Text style={{ fontSize: 12, fontWeight: 600, color: C.blue }}>{v ?? '—'}</Text> },
    {
      title: 'Description', dataIndex: 'description',
      render: v => (
        <Text style={{ fontSize: 12, whiteSpace: 'normal', wordBreak: 'break-word' }}>{v ?? '—'}</Text>
      ),
    },
    { title: 'UOM', dataIndex: 'primary_uom_code', width: 70, align: 'center' as const, render: v => v ?? '—' },
    { title: 'Status', dataIndex: 'inventory_item_status_code', width: 90, render: v => v ?? '—' },
    { title: 'Price', dataIndex: 'item_price', width: 100, align: 'right' as const, render: v => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{v != null ? fmt(parseFloat(v) || 0) : '—'}</Text> },
    { title: 'Brand', dataIndex: 'attr1', width: 100, ellipsis: true, render: v => v ?? '—' },
    { title: 'Category', dataIndex: 'attr5', width: 100, ellipsis: true, render: v => v ?? '—' },
  ];

  const rowSel: TableRowSelection<any> = {
    selectedRowKeys: selectedItemKeys,
    onChange: keys => setSelectedItemKeys(keys as string[]),
    getCheckboxProps: r => ({ disabled: existingItemNumbers.has(String(r.item_number)) }),
  };

  const lineCols: ColumnsType<POLine> = [
    { title: '#', dataIndex: 'lineNum', width: 46, align: 'center' as const, render: v => <Text style={{ color: C.textMid, fontSize: 12 }}>{v}</Text> },
    { title: 'Item', dataIndex: 'itemNumber', width: 130, render: v => <Text style={{ fontWeight: 600, color: C.blue, fontSize: 12 }}>{v}</Text> },
    { title: 'Description', dataIndex: 'description', ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'UOM', dataIndex: 'uom', width: 60, align: 'center' as const },
    { title: 'Qty', dataIndex: 'qty', width: 90, align: 'right' as const, render: (v, r) => <InputNumber size="small" value={v} min={0} precision={4} style={{ width: 80 }} onChange={val => handleLineChange(r.key, 'qty', val ?? 0)} /> },
    { title: 'Unit Price', dataIndex: 'price', width: 110, align: 'right' as const, render: (v, r) => <InputNumber size="small" value={v} min={0} precision={4} style={{ width: 100 }} onChange={val => handleLineChange(r.key, 'price', val ?? 0)} /> },
    { title: 'Amount', dataIndex: 'lineTotal', width: 110, align: 'right' as const, render: v => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'Tax %', dataIndex: 'taxPct', width: 80, align: 'right' as const, render: (v, r) => <InputNumber size="small" value={v} min={0} max={100} precision={2} style={{ width: 70 }} onChange={val => handleLineChange(r.key, 'taxPct', val ?? 0)} /> },
    { title: 'Tax Amt', dataIndex: 'taxAmount', width: 100, align: 'right' as const, render: v => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmt(v)}</Text> },
    { title: 'Net Total', dataIndex: 'netTotal', width: 120, align: 'right' as const, render: v => <Text strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: C.red }}>{fmt(v)}</Text> },
    { title: 'Need By', dataIndex: 'needBy', width: 135, render: (v, r) => <DatePicker size="small" value={v} onChange={d => handleLineChange(r.key, 'needBy', d)} style={{ width: 125 }} format="D-MMM-YYYY" /> },
    { title: '', key: 'del', width: 46, align: 'center' as const, render: (_: any, r: POLine) => <Tooltip title="Remove"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteLine(r.key)} /></Tooltip> },
  ];

  const scheduleCols: ColumnsType<POLine> = [
    { title: 'Line', dataIndex: 'lineNum', width: 50, align: 'center' as const },
    { title: 'Description', dataIndex: 'description', ellipsis: true },
    { title: 'Schedule', width: 70, align: 'center' as const, render: () => 1 },
    { title: 'Location', width: 130, render: () => header?.shipToOrg ?? '—' },
    { title: 'Requested Delivery Date', dataIndex: 'needBy', width: 175, render: (v, r) => <DatePicker size="small" value={v} onChange={d => handleLineChange(r.key, 'needBy', d)} style={{ width: 160 }} format="D-MMM-YYYY" /> },
    { title: 'Promised Delivery Date', dataIndex: 'promisedDate', width: 170, render: (v, r) => <DatePicker size="small" value={v} onChange={d => handleLineChange(r.key, 'promisedDate', d)} style={{ width: 155 }} format="D-MMM-YYYY" /> },
    { title: 'Qty', dataIndex: 'qty', width: 70, align: 'right' as const, render: v => fmt(v) },
    { title: 'UOM', dataIndex: 'uom', width: 60, align: 'center' as const },
    { title: 'Price', dataIndex: 'price', width: 100, align: 'right' as const, render: v => fmt(v) },
    { title: 'Ordered', dataIndex: 'lineTotal', width: 110, align: 'right' as const, render: v => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(v)}</Text> },
    { title: 'Status', width: 90, render: () => <Tag color="orange">Incomplete</Tag> },
  ];

  const distCols: ColumnsType<POLine> = [
    { title: 'Line', dataIndex: 'lineNum', width: 50, align: 'center' as const },
    { title: 'Sch', width: 50, align: 'center' as const, render: () => 1 },
    { title: 'Description', dataIndex: 'description', ellipsis: true },
    { title: 'Dist', width: 50, align: 'center' as const, render: () => 1 },
    { title: 'Status', width: 90, render: () => <Tag color="orange">Incomplete</Tag> },
    { title: 'Destination Type', dataIndex: 'destinationType', width: 130, render: (v, r) => <Select size="small" value={v} style={{ width: 120 }} onChange={val => handleLineChange(r.key, 'destinationType', val)}><Option value="Inventory">Inventory</Option><Option value="Expense">Expense</Option></Select> },
    { title: 'Deliver-to Location', width: 140, render: () => header?.subinventory || header?.shipToOrg || '—' },
    { title: 'Qty', dataIndex: 'qty', width: 70, align: 'right' as const, render: v => fmt(v) },
    { title: 'UOM', dataIndex: 'uom', width: 60, align: 'center' as const },
    { title: 'Ordered', dataIndex: 'lineTotal', width: 110, align: 'right' as const, render: v => fmt(v) },
    { title: 'PO Charge Account', dataIndex: 'chargeAccount', width: 210, render: (v, r) => <Input size="small" value={v} placeholder="e.g. 001-2050000-VLA-000" onChange={e => handleLineChange(r.key, 'chargeAccount', e.target.value)} /> },
  ];

  /* ─── Summary box component ─────────────────────── */

  /* ═══════════════════════════════════════════════════ */
  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: C.bg }}>
      <Content>

        {/* ── Init Modal ──────────────────────────────── */}
        <Modal open={showInitModal} title={<Text strong style={{ fontSize: 15 }}>New Purchase Order</Text>}
          width={720} closable={false} maskClosable={false}
          footer={
            <Space>
              <Button onClick={() => navigate('/procurement')}>Cancel</Button>
              <Button type="primary" loading={initConfirmLoading} onClick={handleInitSubmit}
                style={{ background: C.red, borderColor: C.red, fontWeight: 600 }}>
                Create PO
              </Button>
            </Space>
          }>
          {lovLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spin tip="Loading…" /></div>
          ) : (
            <Form form={headerForm} layout="vertical" initialValues={{ orderDate: dayjs() }}>
              <Divider orientation="left" plain style={{ fontSize: 12, color: C.textMid }}>Organization & Order</Divider>
              <Row gutter={[16, 0]}>
                <Col xs={24} sm={12}>
                  <Form.Item name="procurementBU" label="Procurement BU" rules={[{ required: true }]}>
                    <Select showSearch allowClear placeholder="Select Procurement BU" optionFilterProp="children"
                      onChange={v => headerForm.setFieldValue('billTo', v)}>
                      {busUnits.map(bu => <Option key={bu.BusinessUnitId ?? bu.BusinessUnitName} value={bu.BusinessUnitName}>{bu.BusinessUnitName}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="billTo" label="Bill To BU" rules={[{ required: true }]}>
                    <Select showSearch allowClear placeholder="Select Bill To" optionFilterProp="children">
                      {busUnits.map(bu => <Option key={`bt-${bu.BusinessUnitId ?? bu.BusinessUnitName}`} value={bu.BusinessUnitName}>{bu.BusinessUnitName}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="orderDate" label="Order Date" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="docType" label="Document Type" rules={[{ required: true }]}>
                    <Select showSearch allowClear placeholder="Select type" optionFilterProp="children">
                      <Option value="LPON">LPON</Option>
                      <Option value="IPON">IPON</Option>
                      <Option value="STANDARD">STANDARD</Option>
                      <Option value="BLANKET">BLANKET</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
                    <Select showSearch allowClear placeholder="Select or type currency" filterOption={false}
                      onSearch={val => setCurrencyInput(val)} onBlur={() => setCurrencyInput('')}>
                      {currencyInput.trim() && !currencies.find(c => c.CurrencyCode.toLowerCase() === currencyInput.trim().toLowerCase()) && (
                        <Option key={`__custom__${currencyInput}`} value={currencyInput.trim().toUpperCase()}>
                          <span style={{ color: C.blue, fontStyle: 'italic' }}>Use: {currencyInput.trim().toUpperCase()}</span>
                        </Option>
                      )}
                      {currencies.filter(c => !currencyInput.trim() ||
                        c.CurrencyCode.toLowerCase().includes(currencyInput.toLowerCase()) ||
                        (c.Name ?? '').toLowerCase().includes(currencyInput.toLowerCase())
                      ).map(c => <Option key={c.CurrencyCode} value={c.CurrencyCode}>{c.CurrencyCode}{c.Name ? ` — ${c.Name}` : ''}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              <Divider orientation="left" plain style={{ fontSize: 12, color: C.textMid }}>Supplier</Divider>
              <Row gutter={[16, 0]}>
                <Col xs={24} sm={12}>
                  <Form.Item label="Supplier" required>
                    <Space>
                      <Button icon={<SearchOutlined />}
                        onClick={() => { setSupplierModalOpen(true); setSupplierSearch(''); setSupplierResults([]); }}>
                        Select Supplier
                      </Button>
                      {selectedSupplier && <Tag color="blue" style={{ fontSize: 12 }}>{selectedSupplier.Supplier}</Tag>}
                    </Space>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="supplierSite" label="Supplier Site">
                    <Select showSearch allowClear placeholder="Select supplier site" loading={sitesLoading} optionFilterProp="children">
                      {supplierSites.map(ss => <Option key={ss.SupplierSiteId ?? ss.SupplierSite} value={ss.SupplierSite}>{ss.SupplierSite}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              <Divider orientation="left" plain style={{ fontSize: 12, color: C.textMid }}>Ship To</Divider>
              <Row gutter={[16, 0]}>
                <Col xs={24} sm={12}>
                  <Form.Item name="shipToOrg" label="Ship To Organization" rules={[{ required: true }]}>
                    <Select showSearch allowClear placeholder="Select organization" optionFilterProp="children" onChange={handleShipToOrgChange}>
                      {inventoryOrgs.map(org => <Option key={org.OrganizationCode} value={org.OrganizationCode}>{org.OrganizationCode}{org.OrganizationName ? ` — ${org.OrganizationName}` : ''}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="subinventory" label="Subinventory">
                    <Select showSearch allowClear placeholder="Select subinventory" optionFilterProp="children">
                      {subinventories.map(sub => <Option key={sub.subinventory_code} value={sub.subinventory_code}>{sub.subinventory_code}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <Form.Item name="noteToSupplier" label="Note to Supplier">
                    <Input.TextArea rows={2} placeholder="Optional note…" />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          )}
        </Modal>

        {/* ── Main PO Page ─────────────────────────────── */}
        {header && (
          <>
            {/* Page header bar */}
            <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '12px 24px' }}>
              <Breadcrumb style={{ marginBottom: 6 }} items={[
                { title: <Link to="/home"><HomeOutlined /> Home</Link> },
                { title: <Link to="/procurement">Procurement</Link> },
                { title: <Link to="/procurement/purchase-orders">Purchase Orders</Link> },
              ]} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <Space align="center" size={10}>
                  <Title level={5} style={{ margin: 0, color: C.text }}>{header.poNumber}</Title>
                  <Tag color="orange" style={{ fontSize: 11, fontWeight: 600 }}>{header.status}</Tag>
                  <Tag color="geekblue" style={{ fontSize: 11 }}>{header.docType}</Tag>
                </Space>
                <Space>
                  <Button danger onClick={() => setDiscardConfirmOpen(true)}>Discard</Button>
                  <Button type="primary" icon={<SaveOutlined />} onClick={() => setSaveModalOpen(true)}
                    style={{ background: C.red, borderColor: C.red, fontWeight: 600 }}>
                    Save Purchase Order
                  </Button>
                </Space>
              </div>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* ── Header card ─────────────────────────── */}
              <div style={{
                background: C.surface, borderRadius: 10,
                boxShadow: '0 1px 6px rgba(0,0,0,0.09)',
                overflow: 'hidden',
                border: `1px solid ${C.border}`,
              }}>
                {/* Document banner — top strip */}
                <div style={{
                  background: 'linear-gradient(90deg, #1a2340 0%, #1e3a5f 100%)',
                  padding: '14px 20px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Purchase Order</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>{header.poNumber}</div>
                    </div>
                    <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.15)' }} />
                    <Tag color="orange" style={{ fontWeight: 700, fontSize: 11 }}>{header.status}</Tag>
                    <Tag color="geekblue" style={{ fontSize: 11 }}>{header.docType}</Tag>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
                      <CalendarOutlined /> {header.orderDate.format('D-MMM-YYYY')}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
                      <UserOutlined /> {header.buyer}
                    </div>
                    <Tag color="purple" style={{ fontWeight: 700, fontSize: 12 }}>{header.currency}</Tag>
                  </div>
                  <Tooltip title="Edit header">
                    <Button size="small" icon={<EditOutlined />} onClick={() => setShowInitModal(true)}
                      style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}>
                      Edit
                    </Button>
                  </Tooltip>
                </div>

                {/* Three zones */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 280px' }}>

                  {/* Zone 1 — Organization */}
                  <div style={{ padding: '16px 20px', borderRight: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.blue, marginBottom: 12 }}>
                      Organization
                    </div>
                    <FieldPair label="Procurement BU" value={<strong>{header.procurementBU}</strong>} />
                    <FieldPair label="Requisitioning BU" value={header.requisitioningBU} />
                    <FieldPair label="Bill-to BU" value={header.billToBU} />
                    <FieldPair label="Ship-to Org" value={<strong>{header.shipToOrg}</strong>} />
                    <FieldPair label="Subinventory" value={header.subinventory || '—'} />
                    <FieldPair label="Description"
                      value={<InlineEdit value={header.description} onChange={v => patch({ description: v })} placeholder="Enter description…" />} />
                  </div>

                  {/* Zone 2 — Supplier */}
                  <div style={{ padding: '16px 20px', borderRight: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.teal, marginBottom: 12 }}>
                      Supplier
                    </div>
                    <FieldPair label="Supplier"
                      value={<Text strong style={{ color: C.blue, fontSize: 13 }}>{header.supplierName}</Text>} />
                    <FieldPair label="Site" value={header.supplierSite || '—'} />
                    <FieldPair label="Contact"
                      value={<InlineEdit value={header.supplierContact} onChange={v => patch({ supplierContact: v })} placeholder="—" />} />
                    <FieldPair label="Comm. Method"
                      value={
                        <Select size="small" value={header.communicationMethod} style={{ width: 120 }} variant="borderless"
                          onChange={v => patch({ communicationMethod: v })}>
                          <Option value="E-Mail">E-Mail</Option>
                          <Option value="Fax">Fax</Option>
                          <Option value="Print">Print</Option>
                        </Select>
                      } />
                    <FieldPair label="Email"
                      value={<InlineEdit value={header.communicationEmail} onChange={v => patch({ communicationEmail: v })} placeholder="—" />} />
                    <FieldPair label="Bill-to Location"
                      value={<InlineEdit value={header.billToLocation} onChange={v => patch({ billToLocation: v })} />} />
                    <FieldPair label="Ship-to Location"
                      value={<InlineEdit value={header.shipToLocation} onChange={v => patch({ shipToLocation: v })} />} />
                  </div>

                  {/* Zone 3 — Financials */}
                  <div style={{ padding: '16px 20px', background: '#FAFBFF' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.red, marginBottom: 12 }}>
                      Order Totals
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: C.textMid }}>Ordered</Text>
                        <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 600 }}>{fmt(subtotal)}</Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: C.textMid }}>Total Tax</Text>
                        <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, color: C.orange }}>{fmt(totalTax)}</Text>
                      </div>
                      <div style={{ borderTop: `2px solid ${C.border}`, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text strong style={{ fontSize: 13 }}>Total</Text>
                        <Text strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 18, color: C.red }}>{fmt(grandTotal)}</Text>
                      </div>
                      <Text style={{ fontSize: 11, color: C.textLight, textAlign: 'right', marginTop: -4 }}>{header.currency}</Text>
                    </div>
                    <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 12 }}>
                      <FieldPair label="Source Agreement"
                        value={<InlineEdit value="" onChange={() => {}} placeholder="—" />} />
                      <FieldPair label="Supplier Order"
                        value={<InlineEdit value="" onChange={() => {}} placeholder="—" />} />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Terms & Notes ───────────────────────── */}
              <Card size="small" style={{ borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                <Tabs size="small" defaultActiveKey="terms" items={[
                  {
                    key: 'terms', label: 'Terms',
                    children: (
                      <Row gutter={[32, 0]}>
                        <Col xs={24} md={8}>
                          <InfoTile label="Required Acknowledgment" value={
                            <Select size="small" defaultValue="None" style={{ width: 130 }}>
                              <Option value="None">None</Option>
                              <Option value="Required">Required</Option>
                            </Select>
                          } />
                          <InfoTile label="Payment Terms"
                            value={<InlineEdit value={header.paymentTerms} onChange={v => patch({ paymentTerms: v })} placeholder="e.g. CR30D" />} />
                        </Col>
                        <Col xs={24} md={8}>
                          <InfoTile label="Shipping Method"
                            value={<InlineEdit value={header.shippingMethod} onChange={v => patch({ shippingMethod: v })} placeholder="—" />} />
                          <InfoTile label="Freight Terms"
                            value={<InlineEdit value={header.freightTerms} onChange={v => patch({ freightTerms: v })} placeholder="—" />} />
                          <InfoTile label="FOB"
                            value={<InlineEdit value={header.fob} onChange={v => patch({ fob: v })} placeholder="—" />} />
                        </Col>
                        <Col xs={24} md={8}>
                          <InfoTile label="Pay on Receipt"
                            value={<Checkbox checked={header.payOnReceipt} onChange={e => patch({ payOnReceipt: e.target.checked })}><Text style={{ fontSize: 13 }}>Yes</Text></Checkbox>} />
                          <InfoTile label="Confirming Order"
                            value={<Checkbox checked={header.confirmingOrder} onChange={e => patch({ confirmingOrder: e.target.checked })}><Text style={{ fontSize: 13 }}>Yes</Text></Checkbox>} />
                        </Col>
                      </Row>
                    ),
                  },
                  {
                    key: 'notes', label: 'Notes & Attachments',
                    children: (
                      <Row gutter={[24, 0]}>
                        <Col xs={24} md={12}>
                          <Text style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textLight }}>Note to Supplier</Text>
                          <Input.TextArea rows={3} value={header.noteToSupplier}
                            onChange={e => patch({ noteToSupplier: e.target.value })} placeholder="Note to supplier…" style={{ marginTop: 4 }} />
                        </Col>
                        <Col xs={24} md={12}>
                          <Text style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textLight }}>Note to Receiver</Text>
                          <Input.TextArea rows={3} value={header.noteToReceiver}
                            onChange={e => patch({ noteToReceiver: e.target.value })} placeholder="Note to receiver…" style={{ marginTop: 4 }} />
                        </Col>
                      </Row>
                    ),
                  },
                ]} />
              </Card>

              {/* ── Lines ───────────────────────────────── */}
              <Card size="small" style={{ borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
                title={
                  <Space wrap>
                    <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openAddItem}
                      style={{ background: C.green, borderColor: C.green }}>Add Item</Button>
                    <Divider type="vertical" />
                    <Text style={{ fontSize: 12, color: C.textMid }}>Need By for All:</Text>
                    <DatePicker size="small" value={needByAll} onChange={handleNeedByAllChange} format="D-MMM-YYYY" placeholder="Pick date" style={{ width: 130 }} />
                    <Text style={{ fontSize: 12, color: C.textMid }}>Default Tax %:</Text>
                    <InputNumber size="small" value={defaultTaxPct} min={0} max={100} precision={2} style={{ width: 72 }} onChange={val => setDefaultTaxPct(val ?? 0)} />
                  </Space>
                }
              >
                <Tabs size="small" defaultActiveKey="lines"
                  items={[
                    {
                      key: 'lines',
                      label: <Badge count={lines.length} size="small" offset={[6, 0]} color={C.blue}><span style={{ paddingRight: 8 }}>Lines</span></Badge>,
                      children: (
                        <Table columns={lineCols} dataSource={lines} rowKey="key" size="small" bordered
                          pagination={false} scroll={{ x: 1100 }}
                          rowClassName={(_, i) => i % 2 !== 0 ? 'po-row-alt' : ''}
                          locale={{ emptyText: <div style={{ padding: 28, color: C.textLight, textAlign: 'center' }}>No lines yet. Click "Add Item" to begin.</div> }}
                          summary={() => lines.length > 0 ? (
                            <Table.Summary.Row style={{ background: '#EBF0FA', fontWeight: 600 }}>
                              <Table.Summary.Cell index={0} colSpan={6} />
                              <Table.Summary.Cell index={6} align="right"><Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(subtotal)}</Text></Table.Summary.Cell>
                              <Table.Summary.Cell index={7} />
                              <Table.Summary.Cell index={8} align="right"><Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(totalTax)}</Text></Table.Summary.Cell>
                              <Table.Summary.Cell index={9} align="right"><Text strong style={{ fontVariantNumeric: 'tabular-nums', color: C.red }}>{fmt(grandTotal)}</Text></Table.Summary.Cell>
                              <Table.Summary.Cell index={10} colSpan={2} />
                            </Table.Summary.Row>
                          ) : null}
                        />
                      ),
                    },
                    {
                      key: 'schedules', label: 'Schedules',
                      children: (
                        <Table columns={scheduleCols} dataSource={lines} rowKey="key" size="small" bordered
                          pagination={false} scroll={{ x: 900 }} rowClassName={(_, i) => i % 2 !== 0 ? 'po-row-alt' : ''}
                          locale={{ emptyText: <div style={{ padding: 28, color: C.textLight, textAlign: 'center' }}>No schedules yet.</div> }} />
                      ),
                    },
                    {
                      key: 'distributions', label: 'Distributions',
                      children: (
                        <Table columns={distCols} dataSource={lines} rowKey="key" size="small" bordered
                          pagination={false} scroll={{ x: 1000 }} rowClassName={(_, i) => i % 2 !== 0 ? 'po-row-alt' : ''}
                          locale={{ emptyText: <div style={{ padding: 28, color: C.textLight, textAlign: 'center' }}>No distributions yet.</div> }} />
                      ),
                    },
                  ]}
                />
              </Card>

            </div>
          </>
        )}

        {/* ── Supplier Search Modal ────────────────────── */}
        <Modal open={supplierModalOpen}
          title={<Space><span>Search Supplier</span>
            <Tooltip title="Show last API call">
              <Button size="small" type="text" icon={<ApiOutlined style={{ color: supplierApiUrl ? C.blue : C.textLight }} />}
                onClick={() => supplierApiUrl && setSupplierApiModalOpen(true)} />
            </Tooltip></Space>}
          width={700} onCancel={() => setSupplierModalOpen(false)}
          footer={<Button onClick={() => setSupplierModalOpen(false)}>Close</Button>}>
          <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
            <Input placeholder="Type supplier name to search…" value={supplierSearch}
              onChange={e => setSupplierSearch(e.target.value)} onPressEnter={() => handleSupplierSearch(supplierSearch)} allowClear />
            <Button type="primary" icon={<SearchOutlined />} loading={suppliersLoading}
              onClick={() => handleSupplierSearch(supplierSearch)}
              style={{ background: C.red, borderColor: C.red }}>Search</Button>
          </Space.Compact>
          <Table dataSource={supplierResults} rowKey={r => String(r.SupplierId)} size="small" bordered
            loading={suppliersLoading} pagination={{ pageSize: 8, showSizeChanger: false }}
            locale={{ emptyText: 'Enter a name and click Search' }}
            onRow={record => ({ onClick: () => handleSelectSupplier(record), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'Supplier Number', dataIndex: 'SupplierNumber', width: 140, render: v => <Text style={{ fontSize: 12, fontWeight: 600 }}>{v ?? '—'}</Text> },
              { title: 'Supplier Name', dataIndex: 'Supplier', render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text> },
              { title: 'Type', dataIndex: 'SupplierType', width: 120, render: v => v ?? '—' },
            ]} />
        </Modal>

        <Modal open={supplierApiModalOpen}
          title={<Space><ApiOutlined style={{ color: C.blue }} /><span>Supplier API Call</span></Space>}
          width={620} onCancel={() => setSupplierApiModalOpen(false)}
          footer={<Button onClick={() => setSupplierApiModalOpen(false)}>Close</Button>}>
          <div style={{ background: C.bg, borderRadius: 6, padding: 12, wordBreak: 'break-all' }}>
            <Text copyable style={{ fontFamily: 'monospace', fontSize: 12 }}>{supplierApiUrl}</Text>
          </div>
        </Modal>

        {/* ── Add Item Modal ───────────────────────────── */}
        <Modal open={addItemOpen} title={`Add Items — ${header?.shipToOrg ?? ''}`} width={920}
          onCancel={() => setAddItemOpen(false)}
          footer={<Space>
            <Button onClick={() => setAddItemOpen(false)} icon={<CloseOutlined />}>Cancel</Button>
            <Button type="primary" onClick={handleAddItems}
              disabled={selectedItemKeys.filter(k => !existingItemNumbers.has(k)).length === 0}
              style={{ background: C.green, borderColor: C.green }}>
              {selectedItemKeys.filter(k => !existingItemNumbers.has(k)).length > 0
                ? `Add ${selectedItemKeys.filter(k => !existingItemNumbers.has(k)).length} Item(s)` : 'Add Selected Items'}
            </Button>
          </Space>}>
          <div style={{ marginBottom: 12 }}>
            <Input placeholder="Search by item number or description…" value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)} allowClear prefix={<SearchOutlined style={{ color: C.textLight }} />} />
          </div>
          {itemsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin tip="Loading items…" /></div>
          ) : (
            <Table columns={itemTableCols} dataSource={filteredItems} rowKey={r => String(r.item_number)}
              size="small" bordered pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 700 }}
              rowSelection={rowSel} rowClassName={(_, i) => i % 2 !== 0 ? 'po-row-alt' : ''} />
          )}
        </Modal>

        {/* ── Save Modal ──────────────────────────────── */}
        <Modal open={saveModalOpen} title={null} onCancel={() => setSaveModalOpen(false)}
          footer={<Space>
            <Button onClick={() => setSaveModalOpen(false)}>Stay on Page</Button>
            <Button type="primary" onClick={() => { setSaveModalOpen(false); navigate('/procurement/purchase-orders'); }}
              style={{ background: C.red, borderColor: C.red }}>Go to List</Button>
          </Space>}>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <CheckCircleOutlined style={{ fontSize: 48, color: C.green, marginBottom: 12 }} />
            <Title level={4} style={{ margin: 0 }}>Purchase Order Saved</Title>
            <Text strong style={{ color: C.red, fontSize: 15 }}>{header?.poNumber}</Text>
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">{lines.length} line{lines.length !== 1 ? 's' : ''} · Grand Total: </Text>
              <Text strong style={{ color: C.teal }}>{fmt(grandTotal)} {header?.currency}</Text>
            </div>
          </div>
        </Modal>

        {/* ── Discard Modal ───────────────────────────── */}
        <Modal open={discardConfirmOpen} title="Discard Purchase Order?" onCancel={() => setDiscardConfirmOpen(false)}
          footer={<Space>
            <Button onClick={() => setDiscardConfirmOpen(false)}>Cancel</Button>
            <Button danger type="primary" onClick={() => { setDiscardConfirmOpen(false); navigate('/procurement/purchase-orders'); }}>Discard</Button>
          </Space>}>
          <Text>All unsaved changes will be lost. Are you sure?</Text>
        </Modal>

      </Content>
    </Layout>
  );
};

export default CreatePurchaseOrder;
