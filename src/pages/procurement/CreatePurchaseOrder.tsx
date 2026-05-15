import React, { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Form, Input, Select,
  DatePicker, Row, Col, Space, Modal, InputNumber, Descriptions, Collapse,
  message, Spin, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TableRowSelection } from 'antd/es/table/interface';
import {
  HomeOutlined, ShoppingCartOutlined, PlusOutlined, DeleteOutlined,
  EditOutlined, SaveOutlined, CloseOutlined, SearchOutlined, ApiOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';

const { Content } = Layout;
const { Text } = Typography;
const { Option } = Select;

const FUSION_BASE = 'https://iacney-test.fa.ocs.oraclecloud.com/fscmRestApi/resources/11.13.18.05';
const ORDS_BASE = 'https://g827cd88c3cfc03-mitsumioracledb.adb.me-dubai-1.oraclecloudapps.com/ords/test/FUSIONCLIENTERP';
const AUTH_HEADER = 'Basic ' + btoa('emparun:Fusion@1234');
const FUSION_HDRS = { Authorization: AUTH_HEADER, Accept: 'application/json' };
const REDWOOD = {
  primary: '#C74634', primaryDark: '#A33B2C', primaryLight: '#E85D4A',
  success: '#1D7B4D', warning: '#D4A800', info: '#0572CE', error: '#D93025',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF', teal: '#00918A',
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
  const date = dayjs().format('DDMMYYYY');
  return `${docType}${date}${String(seq).padStart(4, '0')}`;
};

const formatNumber = (val: number): string =>
  new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

interface POHeader {
  poNumber: string;
  docType: string;
  orderDate: Dayjs;
  procurementBU: string;
  billTo: string;
  currency: string;
  supplierId: string;
  supplierName: string;
  supplierSite: string;
  shipToOrg: string;
  subinventory: string;
  noteToSupplier?: string;
}

interface POLine {
  key: string;
  itemNumber: string;
  description: string;
  uom: string;
  qty: number;
  price: number;
  taxPct: number;
  needBy: Dayjs | null;
  lineTotal: number;
  taxAmount: number;
  netTotal: number;
}

const computeLine = (line: Omit<POLine, 'lineTotal' | 'taxAmount' | 'netTotal'>): POLine => {
  const lineTotal = line.qty * line.price;
  const taxAmount = lineTotal * line.taxPct / 100;
  return { ...line, lineTotal, taxAmount, netTotal: lineTotal + taxAmount };
};

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
    color: REDWOOD.neutral600, borderBottom: `2px solid ${REDWOOD.neutral200}`,
    paddingBottom: 4, marginBottom: 12,
  }}>
    {children}
  </div>
);

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
  const [headerCollapseOpen, setHeaderCollapseOpen] = useState<string[]>(['header']);

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

  // Supplier popup state
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierResults, setSupplierResults] = useState<any[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [supplierSites, setSupplierSites] = useState<any[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [supplierApiUrl, setSupplierApiUrl] = useState('');
  const [supplierApiModalOpen, setSupplierApiModalOpen] = useState(false);

  const [lovLoading, setLovLoading] = useState(false);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [initConfirmLoading, setInitConfirmLoading] = useState(false);

  useEffect(() => {
    if (showInitModal) {
      loadInitLOVs();
    }
  }, [showInitModal]);

  const loadInitLOVs = async () => {
    setLovLoading(true);
    try {
      const [buItems, ccyItems, orgItems, subItems] = await Promise.allSettled([
        fetchLOV(`${FUSION_BASE}/finBusinessUnitsLOV`),
        fetch(`${FUSION_BASE}/currencies?limit=500`, { headers: FUSION_HDRS }).then(r => r.json()).then(d => d.items ?? []),
        fetchLOV(`${FUSION_BASE}/inventoryOrganizations`),
        fetch(`${ORDS_BASE}/inventory/inventorywarehousesubinventory`, {}).then(r => r.json()).then(d => d.items ?? (Array.isArray(d) ? d : [])),
      ]);
      if (buItems.status === 'fulfilled') setBusUnits(buItems.value);
      if (ccyItems.status === 'fulfilled') setCurrencies(ccyItems.value);
      if (orgItems.status === 'fulfilled') setInventoryOrgs(orgItems.value);
      if (subItems.status === 'fulfilled') setAllSubinventories(subItems.value);
    } catch {
      /* non-blocking */
    } finally {
      setLovLoading(false);
    }
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
    } catch {
      /* ignore */
    } finally {
      setSuppliersLoading(false);
    }
  }, []);

  const loadSupplierSites = async (supplierId: string) => {
    headerForm.setFieldValue('supplierSite', undefined);
    setSupplierSites([]);
    if (!supplierId) return;
    setSitesLoading(true);
    try {
      const r = await fetch(
        `${FUSION_BASE}/suppliers/${supplierId}/child/sites?limit=100`,
        { headers: FUSION_HDRS }
      );
      const d = await r.json();
      setSupplierSites(d.items ?? []);
    } catch {
      /* ignore */
    } finally {
      setSitesLoading(false);
    }
  };

  const handleOpenSupplierModal = () => {
    setSupplierModalOpen(true);
    setSupplierSearch('');
    setSupplierResults([]);
  };

  const handleSelectSupplier = async (supplier: any) => {
    setSelectedSupplier(supplier);
    setSupplierModalOpen(false);
    await loadSupplierSites(String(supplier.SupplierId));
  };

  const handleShipToOrgChange = (orgCode: string) => {
    headerForm.setFieldValue('subinventory', undefined);
    const filtered = allSubinventories.filter((s: any) => s.warehouse_code === orgCode);
    setSubinventories(filtered);
  };

  const handleInitSubmit = async () => {
    if (!selectedSupplier) {
      message.error('Please select a supplier');
      return;
    }
    setInitConfirmLoading(true);
    try {
      const vals = await headerForm.validateFields();
      const poNumber = generatePONumber(vals.docType);
      setHeader({
        poNumber,
        docType: vals.docType,
        orderDate: vals.orderDate,
        procurementBU: vals.procurementBU,
        billTo: vals.billTo,
        currency: vals.currency,
        supplierId: String(selectedSupplier.SupplierId),
        supplierName: selectedSupplier.Supplier ?? String(selectedSupplier.SupplierId),
        supplierSite: vals.supplierSite ?? '',
        shipToOrg: vals.shipToOrg,
        subinventory: vals.subinventory ?? '',
        noteToSupplier: vals.noteToSupplier,
      });
      setShowInitModal(false);
    } catch {
      /* validation error — keep modal open */
    } finally {
      setInitConfirmLoading(false);
    }
  };

  const handleEditHeader = () => {
    if (!header) return;
    headerForm.setFieldsValue({
      procurementBU: header.procurementBU,
      billTo: header.billTo,
      orderDate: header.orderDate,
      docType: header.docType,
      currency: header.currency,
      supplierId: header.supplierId,
      supplierSite: header.supplierSite,
      shipToOrg: header.shipToOrg,
      subinventory: header.subinventory,
      noteToSupplier: header.noteToSupplier,
    });
    setShowInitModal(true);
  };

  const handleNeedByAllChange = (date: Dayjs | null) => {
    setNeedByAll(date);
    setLines(prev => prev.map(l => computeLine({ ...l, needBy: date })));
  };

  const handleLineChange = (key: string, field: keyof POLine, value: any) => {
    setLines(prev => prev.map(l => {
      if (l.key !== key) return l;
      return computeLine({ ...l, [field]: value });
    }));
  };

  const handleDeleteLine = (key: string) => {
    setLines(prev => prev.filter(l => l.key !== key));
  };

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const totalTax = lines.reduce((s, l) => s + l.taxAmount, 0);
  const grandTotal = lines.reduce((s, l) => s + l.netTotal, 0);

  const openAddItem = async () => {
    if (!header) return;
    setAddItemOpen(true);
    setSearchTerm('');
    setSelectedItemKeys([]);
    setItemsLoading(true);
    try {
      const r = await fetch(
        `${ORDS_BASE}/inventory/itemmaster?org=${header.shipToOrg}&limit=500`,
        {}
      );
      const d = await r.json();
      setItems(d.items ?? (Array.isArray(d) ? d : []));
    } catch {
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  };

  const existingItemNumbers = new Set(lines.map(l => l.itemNumber));

  const filteredItems = items.filter(item => {
    if (!searchTerm) return true;
    const t = searchTerm.toLowerCase();
    return (
      String(item.item_number ?? '').toLowerCase().includes(t) ||
      String(item.description ?? '').toLowerCase().includes(t)
    );
  });

  const handleAddItems = () => {
    const toAdd = items.filter(item => selectedItemKeys.includes(String(item.item_number)) && !existingItemNumbers.has(String(item.item_number)));
    const newLines: POLine[] = toAdd.map(item => computeLine({
      key: `${item.item_number}-${Date.now()}-${Math.random()}`,
      itemNumber: String(item.item_number ?? ''),
      description: String(item.description ?? ''),
      uom: String(item.primary_uom_code ?? item.uom ?? ''),
      qty: 1,
      price: parseFloat(item.item_price) || 0,
      taxPct: defaultTaxPct,
      needBy: needByAll,
    }));
    setLines(prev => [...prev, ...newLines]);
    setAddItemOpen(false);
  };

  const handleSave = () => {
    if (!header) return;
    setSaveModalOpen(true);
  };

  const itemTableColumns: ColumnsType<any> = [
    {
      title: 'Item Number', dataIndex: 'item_number', width: 140,
      render: v => <Text style={{ fontSize: 12, fontWeight: 600, color: REDWOOD.info }}>{v ?? '—'}</Text>,
    },
    {
      title: 'Description', dataIndex: 'description', ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text>,
    },
    { title: 'UOM', dataIndex: 'primary_uom_code', width: 70, align: 'center' as const, render: v => v ?? '—' },
    { title: 'Status', dataIndex: 'inventory_item_status_code', width: 90, render: (v: any) => v ?? '—' },
    {
      title: 'Price', dataIndex: 'item_price', width: 100, align: 'right' as const,
      render: v => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{v != null ? formatNumber(parseFloat(v) || 0) : '—'}</Text>,
    },
    { title: 'Brand', dataIndex: 'attr1', width: 100, ellipsis: true, render: v => v ?? '—' },
    { title: 'Category', dataIndex: 'attr5', width: 100, ellipsis: true, render: v => v ?? '—' },
  ];

  const rowSelection: TableRowSelection<any> = {
    selectedRowKeys: selectedItemKeys,
    onChange: keys => setSelectedItemKeys(keys as string[]),
    getCheckboxProps: record => ({
      disabled: existingItemNumbers.has(String(record.item_number)),
    }),
  };

  const lineColumns: ColumnsType<POLine> = [
    {
      title: '#', width: 46, align: 'center' as const,
      render: (_v: any, _r: POLine, idx: number) => <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>{idx + 1}</Text>,
    },
    {
      title: 'Item Number', dataIndex: 'itemNumber', width: 130,
      render: v => <Text style={{ fontSize: 12, fontWeight: 600, color: REDWOOD.info }}>{v}</Text>,
    },
    {
      title: 'Description', dataIndex: 'description', ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    { title: 'UOM', dataIndex: 'uom', width: 70, align: 'center' as const },
    {
      title: 'Qty', dataIndex: 'qty', width: 90, align: 'right' as const,
      render: (v, record) => (
        <InputNumber
          size="small"
          value={v}
          min={0}
          precision={4}
          style={{ width: 80 }}
          onChange={val => handleLineChange(record.key, 'qty', val ?? 0)}
        />
      ),
    },
    {
      title: 'Unit Price', dataIndex: 'price', width: 110, align: 'right' as const,
      render: (v, record) => (
        <InputNumber
          size="small"
          value={v}
          min={0}
          precision={4}
          style={{ width: 100 }}
          onChange={val => handleLineChange(record.key, 'price', val ?? 0)}
        />
      ),
    },
    {
      title: 'Line Total', dataIndex: 'lineTotal', width: 110, align: 'right' as const,
      render: v => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{formatNumber(v)}</Text>,
    },
    {
      title: 'Tax %', dataIndex: 'taxPct', width: 90, align: 'right' as const,
      render: (v, record) => (
        <InputNumber
          size="small"
          value={v}
          min={0}
          max={100}
          precision={2}
          style={{ width: 80 }}
          onChange={val => handleLineChange(record.key, 'taxPct', val ?? 0)}
        />
      ),
    },
    {
      title: 'Tax Amount', dataIndex: 'taxAmount', width: 110, align: 'right' as const,
      render: v => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{formatNumber(v)}</Text>,
    },
    {
      title: 'Net Total', dataIndex: 'netTotal', width: 120, align: 'right' as const,
      render: v => <Text strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: REDWOOD.primary }}>{formatNumber(v)}</Text>,
    },
    {
      title: 'Need By', dataIndex: 'needBy', width: 140,
      render: (v, record) => (
        <DatePicker
          size="small"
          value={v}
          onChange={date => handleLineChange(record.key, 'needBy', date)}
          style={{ width: 130 }}
          format="D-MMM-YYYY"
        />
      ),
    },
    {
      title: '', key: 'actions', width: 50, align: 'center' as const,
      render: (_v: any, record: POLine) => (
        <Tooltip title="Remove line">
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            danger
            onClick={() => handleDeleteLine(record.key)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>

        {/* Init Modal */}
        <Modal
          open={showInitModal}
          title={<span style={{ fontWeight: 700 }}>New Purchase Order — Header</span>}
          width={700}
          closable={false}
          maskClosable={false}
          footer={
            <Space>
              <Button onClick={() => navigate('/procurement')}>Cancel</Button>
              <Button
                type="primary"
                loading={initConfirmLoading}
                onClick={handleInitSubmit}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              >
                Create PO
              </Button>
            </Space>
          }
        >
          {lovLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <Spin tip="Loading LOVs…" />
            </div>
          ) : (
            <Form form={headerForm} layout="vertical" initialValues={{ orderDate: dayjs() }}>
              <Row gutter={[12, 0]}>
                <Col xs={24} sm={12}>
                  <Form.Item name="procurementBU" label="Procurement BU" rules={[{ required: true, message: 'Required' }]}>
                    <Select
                      showSearch
                      allowClear
                      placeholder="Select Procurement BU"
                      optionFilterProp="children"
                      onChange={(value) => headerForm.setFieldValue('billTo', value)}
                    >
                      {busUnits.map(bu => (
                        <Option key={bu.BusinessUnitId ?? bu.BusinessUnitName} value={bu.BusinessUnitName}>
                          {bu.BusinessUnitName}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="billTo" label="Bill To" rules={[{ required: true, message: 'Required' }]}>
                    <Select showSearch allowClear placeholder="Select Bill To" optionFilterProp="children">
                      {busUnits.map(bu => (
                        <Option key={`bt-${bu.BusinessUnitId ?? bu.BusinessUnitName}`} value={bu.BusinessUnitName}>
                          {bu.BusinessUnitName}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="orderDate" label="Order Date" rules={[{ required: true, message: 'Required' }]}>
                    <DatePicker style={{ width: '100%' }} format="D-MMM-YYYY" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="docType" label="Document Type" rules={[{ required: true, message: 'Required' }]}>
                    <Select
                      showSearch
                      allowClear
                      placeholder="Select or type custom…"
                      optionFilterProp="children"
                      mode={undefined}
                    >
                      <Option value="LPON">LPON</Option>
                      <Option value="IPON">IPON</Option>
                      <Option value="STANDARD">STANDARD</Option>
                      <Option value="BLANKET">BLANKET</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="currency" label="Currency" rules={[{ required: true, message: 'Required' }]}>
                    <Select
                      showSearch
                      allowClear
                      placeholder="Select or type currency code"
                      filterOption={false}
                      onSearch={val => setCurrencyInput(val)}
                      onBlur={() => setCurrencyInput('')}
                    >
                      {currencyInput.trim() && !currencies.find(c =>
                        c.CurrencyCode.toLowerCase() === currencyInput.trim().toLowerCase()
                      ) && (
                        <Option key={`__custom__${currencyInput}`} value={currencyInput.trim().toUpperCase()}>
                          <span style={{ color: REDWOOD.info, fontStyle: 'italic' }}>
                            Use: {currencyInput.trim().toUpperCase()}
                          </span>
                        </Option>
                      )}
                      {currencies
                        .filter(c => !currencyInput.trim() ||
                          c.CurrencyCode.toLowerCase().includes(currencyInput.toLowerCase()) ||
                          (c.Name ?? '').toLowerCase().includes(currencyInput.toLowerCase())
                        )
                        .map(c => (
                          <Option key={c.CurrencyCode} value={c.CurrencyCode}>
                            {c.CurrencyCode}{c.Name ? ` — ${c.Name}` : ''}
                          </Option>
                        ))
                      }
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="Supplier"
                    required
                    validateStatus={selectedSupplier ? '' : undefined}
                  >
                    <Space>
                      <Button icon={<SearchOutlined />} onClick={handleOpenSupplierModal}>
                        Select Supplier
                      </Button>
                      {selectedSupplier && (
                        <Text strong style={{ color: REDWOOD.info }}>{selectedSupplier.Supplier}</Text>
                      )}
                    </Space>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="supplierSite" label="Supplier Site">
                    <Select showSearch allowClear placeholder="Select supplier site" loading={sitesLoading} optionFilterProp="children">
                      {supplierSites.map(ss => (
                        <Option key={ss.SupplierSiteId ?? ss.SupplierSite} value={ss.SupplierSite}>
                          {ss.SupplierSite}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="shipToOrg" label="Ship To Organization" rules={[{ required: true, message: 'Required' }]}>
                    <Select
                      showSearch
                      allowClear
                      placeholder="Select organization"
                      optionFilterProp="children"
                      loading={orgsLoading}
                      onChange={handleShipToOrgChange}
                    >
                      {inventoryOrgs.map(org => (
                        <Option key={org.OrganizationCode} value={org.OrganizationCode}>
                          {org.OrganizationCode}{org.OrganizationName ? ` — ${org.OrganizationName}` : ''}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="subinventory" label="Subinventory">
                    <Select showSearch allowClear placeholder="Select subinventory" loading={subLoading} optionFilterProp="children">
                      {subinventories.map(sub => (
                        <Option key={sub.subinventory_code} value={sub.subinventory_code}>
                          {sub.subinventory_code}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <Form.Item name="noteToSupplier" label="Note to Supplier">
                    <Input.TextArea rows={2} placeholder="Optional note to supplier" />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          )}
        </Modal>

        {header && (
          <>
            {/* Breadcrumb */}
            <div style={{ padding: '12px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
              <Breadcrumb items={[
                { title: <Link to="/home"><HomeOutlined /> Home</Link> },
                { title: <Link to="/procurement">Procurement</Link> },
                { title: <Link to="/procurement/purchase-orders">Purchase Orders</Link> },
                { title: `Create: ${header.poNumber}` },
              ]} />
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Header Card */}
              <Collapse
                activeKey={headerCollapseOpen}
                onChange={keys => setHeaderCollapseOpen(typeof keys === 'string' ? [keys] : keys as string[])}
                style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
                items={[
                  {
                    key: 'header',
                    label: (
                      <Space>
                        <ShoppingCartOutlined style={{ color: REDWOOD.primary }} />
                        <Text strong>Purchase Order Header — {header.poNumber}</Text>
                      </Space>
                    ),
                    extra: (
                      <Tooltip title="Edit header fields">
                        <Button
                          size="small"
                          type="text"
                          icon={<EditOutlined />}
                          style={{ color: REDWOOD.info }}
                          onClick={e => { e.stopPropagation(); handleEditHeader(); }}
                        />
                      </Tooltip>
                    ),
                    children: (
                      <Descriptions
                        bordered
                        size="small"
                        column={4}
                        labelStyle={{ fontSize: 11, fontWeight: 700, color: REDWOOD.neutral600, textTransform: 'uppercase', letterSpacing: '0.04em' }}
                        contentStyle={{ fontSize: 13, color: REDWOOD.neutral900 }}
                      >
                        <Descriptions.Item label="PO Number" span={2}>
                          <Text strong style={{ color: REDWOOD.primary }}>{header.poNumber}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="Document Type">{header.docType}</Descriptions.Item>
                        <Descriptions.Item label="Order Date">{header.orderDate.format('D-MMM-YYYY')}</Descriptions.Item>
                        <Descriptions.Item label="Procurement BU">{header.procurementBU}</Descriptions.Item>
                        <Descriptions.Item label="Bill To">{header.billTo}</Descriptions.Item>
                        <Descriptions.Item label="Currency">{header.currency}</Descriptions.Item>
                        <Descriptions.Item label="Supplier">
                          <Text strong>{header.supplierName}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="Supplier Site">{header.supplierSite || '—'}</Descriptions.Item>
                        <Descriptions.Item label="Ship To Org">{header.shipToOrg}</Descriptions.Item>
                        <Descriptions.Item label="Subinventory">{header.subinventory || '—'}</Descriptions.Item>
                        {header.noteToSupplier && (
                          <Descriptions.Item label="Note to Supplier" span={4}>
                            {header.noteToSupplier}
                          </Descriptions.Item>
                        )}
                      </Descriptions>
                    ),
                  },
                ]}
              />

              {/* Lines Section */}
              <Card
                style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
                styles={{ body: { padding: 0 } }}
                title={
                  <div style={{ padding: '12px 16px 0' }}>
                    <SectionLabel>Order Lines</SectionLabel>
                  </div>
                }
              >
                {/* Toolbar */}
                <div style={{
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                  borderBottom: `1px solid ${REDWOOD.neutral200}`,
                }}>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={openAddItem}
                    style={{ background: REDWOOD.success, borderColor: REDWOOD.success, fontWeight: 600 }}
                  >
                    Add Item
                  </Button>
                  <Space wrap>
                    <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Set Need By for All:</Text>
                    <DatePicker
                      size="small"
                      value={needByAll}
                      onChange={handleNeedByAllChange}
                      format="D-MMM-YYYY"
                      placeholder="Pick date"
                      style={{ width: 140 }}
                    />
                    <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Default Tax %:</Text>
                    <InputNumber
                      size="small"
                      value={defaultTaxPct}
                      min={0}
                      max={100}
                      precision={2}
                      style={{ width: 80 }}
                      onChange={val => setDefaultTaxPct(val ?? 0)}
                    />
                  </Space>
                </div>

                <Table
                  columns={lineColumns}
                  dataSource={lines}
                  rowKey="key"
                  size="small"
                  bordered
                  pagination={false}
                  scroll={{ x: 1100 }}
                  locale={{ emptyText: <div style={{ padding: 32, color: REDWOOD.neutral600, textAlign: 'center' }}>No lines added yet. Click "Add Item" to begin.</div> }}
                  rowClassName={(_, i) => i % 2 !== 0 ? 'po-row-alt' : ''}
                />
              </Card>

              {/* Totals Card */}
              <Card
                style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
                styles={{ body: { padding: '12px 20px' } }}
              >
                <Row justify="end">
                  <Col>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: REDWOOD.neutral600, minWidth: 100, textAlign: 'right' }}>Subtotal</Text>
                        <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, minWidth: 130, textAlign: 'right' }}>
                          {formatNumber(subtotal)}
                        </Text>
                      </div>
                      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: REDWOOD.neutral600, minWidth: 100, textAlign: 'right' }}>Total Tax</Text>
                        <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, minWidth: 130, textAlign: 'right' }}>
                          {formatNumber(totalTax)}
                        </Text>
                      </div>
                      <div style={{ borderTop: `2px solid ${REDWOOD.neutral200}`, paddingTop: 6, display: 'flex', gap: 24, alignItems: 'center' }}>
                        <Text strong style={{ fontSize: 13, minWidth: 100, textAlign: 'right' }}>Grand Total</Text>
                        <Text strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 18, color: REDWOOD.primary, minWidth: 130, textAlign: 'right' }}>
                          {formatNumber(grandTotal)}
                        </Text>
                      </div>
                    </div>
                  </Col>
                </Row>
              </Card>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <Button
                  danger
                  onClick={() => setDiscardConfirmOpen(true)}
                >
                  Discard
                </Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={handleSave}
                  style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary, fontWeight: 600 }}
                >
                  Save Purchase Order
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Supplier Search Modal */}
        <Modal
          open={supplierModalOpen}
          title={
            <Space>
              <span>Search Supplier</span>
              <Tooltip title="Show last API call">
                <Button
                  size="small"
                  type="text"
                  icon={<ApiOutlined style={{ color: supplierApiUrl ? REDWOOD.info : REDWOOD.neutral300 }} />}
                  onClick={() => supplierApiUrl && setSupplierApiModalOpen(true)}
                />
              </Tooltip>
            </Space>
          }
          width={700}
          onCancel={() => setSupplierModalOpen(false)}
          footer={<Button onClick={() => setSupplierModalOpen(false)}>Close</Button>}
        >
          <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
            <Input
              placeholder="Type supplier name to search…"
              value={supplierSearch}
              onChange={e => setSupplierSearch(e.target.value)}
              onPressEnter={() => handleSupplierSearch(supplierSearch)}
              allowClear
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              loading={suppliersLoading}
              onClick={() => handleSupplierSearch(supplierSearch)}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
            >
              Search
            </Button>
          </Space.Compact>
          <Table
            dataSource={supplierResults}
            rowKey={r => String(r.SupplierId)}
            size="small"
            bordered
            loading={suppliersLoading}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            locale={{ emptyText: 'Enter a name and click Search' }}
            onRow={record => ({
              onClick: () => handleSelectSupplier(record),
              style: { cursor: 'pointer' },
            })}
            columns={[
              {
                title: 'Supplier Number',
                dataIndex: 'SupplierNumber',
                width: 140,
                render: v => <Text style={{ fontSize: 12, fontWeight: 600 }}>{v ?? '—'}</Text>,
              },
              {
                title: 'Supplier Name',
                dataIndex: 'Supplier',
                render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text>,
              },
              {
                title: 'Type',
                dataIndex: 'SupplierType',
                width: 120,
                render: v => v ?? '—',
              },
            ]}
          />
        </Modal>

        {/* Supplier API URL Modal */}
        <Modal
          open={supplierApiModalOpen}
          title={<Space><ApiOutlined style={{ color: REDWOOD.info }} /><span>Supplier API Call</span></Space>}
          width={620}
          onCancel={() => setSupplierApiModalOpen(false)}
          footer={<Button onClick={() => setSupplierApiModalOpen(false)}>Close</Button>}
        >
          <div style={{ background: REDWOOD.neutral100, borderRadius: 6, padding: 12, wordBreak: 'break-all' }}>
            <Text copyable style={{ fontFamily: 'monospace', fontSize: 12 }}>{supplierApiUrl}</Text>
          </div>
        </Modal>

        {/* Add Item Modal */}
        <Modal
          open={addItemOpen}
          title={`Add Items — ${header?.shipToOrg ?? ''}`}
          width={900}
          onCancel={() => setAddItemOpen(false)}
          footer={
            <Space>
              <Button onClick={() => setAddItemOpen(false)} icon={<CloseOutlined />}>Cancel</Button>
              <Button
                type="primary"
                onClick={handleAddItems}
                disabled={selectedItemKeys.filter(k => !existingItemNumbers.has(k)).length === 0}
                style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
              >
                Add {selectedItemKeys.filter(k => !existingItemNumbers.has(k)).length > 0
                  ? `${selectedItemKeys.filter(k => !existingItemNumbers.has(k)).length} `
                  : ''}Selected Items
              </Button>
            </Space>
          }
        >
          <div style={{ marginBottom: 12 }}>
            <Input
              placeholder="Search by item number or description…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              allowClear
            />
          </div>
          {itemsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <Spin tip="Loading items…" />
            </div>
          ) : (
            <Table
              columns={itemTableColumns}
              dataSource={filteredItems}
              rowKey={r => String(r.item_number)}
              size="small"
              bordered
              pagination={{ pageSize: 10, showSizeChanger: false }}
              scroll={{ x: 700 }}
              rowSelection={rowSelection}
              rowClassName={(_, i) => i % 2 !== 0 ? 'po-row-alt' : ''}
            />
          )}
        </Modal>

        {/* Save Success Modal */}
        <Modal
          open={saveModalOpen}
          title="Purchase Order Saved"
          onCancel={() => setSaveModalOpen(false)}
          footer={
            <Space>
              <Button onClick={() => setSaveModalOpen(false)}>Stay on Page</Button>
              <Button
                type="primary"
                onClick={() => { setSaveModalOpen(false); navigate('/procurement/purchase-orders'); }}
                style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              >
                Go to Search
              </Button>
            </Space>
          }
        >
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <Text strong style={{ fontSize: 16, display: 'block' }}>
              Purchase Order <Text style={{ color: REDWOOD.primary }}>{header?.poNumber}</Text> has been saved.
            </Text>
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              {lines.length} line{lines.length !== 1 ? 's' : ''} · Grand Total: {formatNumber(grandTotal)} {header?.currency}
            </Text>
          </div>
        </Modal>

        {/* Discard Confirm Modal */}
        <Modal
          open={discardConfirmOpen}
          title="Discard Purchase Order?"
          onCancel={() => setDiscardConfirmOpen(false)}
          footer={
            <Space>
              <Button onClick={() => setDiscardConfirmOpen(false)}>Cancel</Button>
              <Button
                danger
                type="primary"
                onClick={() => { setDiscardConfirmOpen(false); navigate('/procurement/purchase-orders'); }}
              >
                Discard
              </Button>
            </Space>
          }
        >
          <Text>All unsaved changes will be lost. Are you sure you want to discard this purchase order?</Text>
        </Modal>

      </Content>
    </Layout>
  );
};

export default CreatePurchaseOrder;
