import React, { useState, useCallback, useEffect } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
  Layout, Breadcrumb, Typography, Card, Table, Button, Form, Input, Select,
  DatePicker, Row, Col, Space, Tag, Tabs, message, Spin, Empty, Divider, Drawer,
  Descriptions, Badge,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  HomeOutlined, ShoppingCartOutlined, SearchOutlined, ReloadOutlined,
  EyeOutlined, PrinterOutlined, CloseOutlined, CheckCircleOutlined,
  InfoCircleOutlined, UnorderedListOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

// ── Redwood palette ──────────────────────────────────────────────────────────
const REDWOOD = {
  primary: '#C74634', primaryLight: '#E85D4A', primaryDark: '#A33B2C',
  success: '#1D7B4D', warning: '#D4A800', info: '#0572CE', error: '#D93025',
  neutral100: '#F7F7F7', neutral200: '#E5E5E5', neutral300: '#C7C7C7',
  neutral600: '#6B6B6B', neutral900: '#1A1A1A', surface: '#FFFFFF',
};

// ── Oracle Fusion API config ─────────────────────────────────────────────────
const BASE_URL = 'https://iaaobn.fa.ocs.oraclecloud.com:443/fscmRestApi/resources/11.13.18.05';
const AUTH_HEADER = 'Basic ' + btoa('emparun:Fusion@1234');
const PAGE_SIZE = 25;

// ── Types ────────────────────────────────────────────────────────────────────
interface POHeader {
  POHeaderId: number;
  OrderNumber: string;
  StatusCode: string;
  DocumentStyle: string;
  SupplierId: number;
  SupplierName: string;
  SupplierSite: string;
  SupplierContact: string;
  BuyerEmail: string;
  BuyerName: string;
  RequesterName: string;
  ProcurementBU: string;
  RequisitioningBU: string;
  BillToBU: string;
  CurrencyCode: string;
  PaymentTerms: string;
  ConversionRate?: number;
  ConversionRateType?: string;
  OrderDate: string;
  CreationDate: string;
  LastUpdateDate: string;
  ShipToLocation: string;
  BillToLocation: string;
  NoteToSupplier?: string;
  NoteToReceiver?: string;
  OrderedAmount: number;
  TaxAmount: number;
  TotalAmount: number;
  RequisitionNumber?: string;
  SalesOrderNumber?: string;
  NegotiationNumber?: string;
}

interface POLine {
  LineNumber: number;
  ItemId?: number;
  ItemNumber?: string;
  ItemDescription: string;
  CategoryName: string;
  UnitOfMeasure: string;
  QuantityOrdered: number;
  QuantityReceived: number;
  QuantityBilled: number;
  UnitPrice: number;
  LineAmount: number;
  StatusCode: string;
  NeedByDate?: string;
  ShipToLocation?: string;
}

interface SearchParams {
  orderNumber?: string;
  supplier?: string;
  statusCode?: string;
  dateRange?: [Dayjs, Dayjs] | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtAmt = (val?: number, ccy?: string) => {
  if (val == null) return '—';
  const s = new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  return ccy ? `${s} ${ccy}` : s;
};

const fmtDate = (d?: string) => {
  if (!d) return '—';
  try { return dayjs(d).format('D-MMM-YYYY'); } catch { return d; }
};

const statusConfig: Record<string, { color: string; label: string; tagColor: string }> = {
  OPEN:                  { color: REDWOOD.info,    label: 'Open',                 tagColor: 'blue' },
  APPROVED:              { color: REDWOOD.success, label: 'Approved',             tagColor: 'green' },
  CLOSED:                { color: REDWOOD.neutral600, label: 'Closed',            tagColor: 'default' },
  'CLOSED FOR RECEIVING':{ color: REDWOOD.warning, label: 'Closed for Receiving', tagColor: 'orange' },
  INCOMPLETE:            { color: REDWOOD.error,   label: 'Incomplete',           tagColor: 'red' },
  'IN PROCESS':          { color: '#722ED1',       label: 'In Process',           tagColor: 'purple' },
};

const getStatusTag = (status: string) => {
  const cfg = statusConfig[status?.toUpperCase()] ?? { color: REDWOOD.neutral600, label: status, tagColor: 'default' };
  return (
    <Tag
      color={cfg.tagColor}
      style={{ fontWeight: 600, fontSize: 11, borderRadius: 4, letterSpacing: '0.02em' }}
    >
      {cfg.label}
    </Tag>
  );
};

// ── Build Oracle REST q param ─────────────────────────────────────────────────
const buildQParam = (params: SearchParams): string => {
  const parts: string[] = [];
  if (params.orderNumber?.trim()) {
    parts.push(`OrderNumber like "${params.orderNumber.trim()}*"`);
  }
  if (params.supplier?.trim()) {
    parts.push(`SupplierName like "${params.supplier.trim()}*"`);
  }
  if (params.statusCode) {
    parts.push(`StatusCode="${params.statusCode}"`);
  }
  if (params.dateRange?.[0]) {
    parts.push(`OrderDate>="${params.dateRange[0].format('YYYY-MM-DD')}"`);
  }
  if (params.dateRange?.[1]) {
    parts.push(`OrderDate<="${params.dateRange[1].format('YYYY-MM-DD')}"`);
  }
  return parts.join(';');
};

// ── PO Lines Tab ─────────────────────────────────────────────────────────────
const POLinesTab: React.FC<{ poHeaderId: number }> = ({ poHeaderId }) => {
  const [lines, setLines] = useState<POLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!poHeaderId) return;
    setLoading(true);
    setError(null);

    fetch(`${BASE_URL}/purchaseOrders/${poHeaderId}/child/lines`, {
      headers: {
        Authorization: AUTH_HEADER,
        Accept: 'application/json',
      },
    })
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        return (data.items ?? data) as POLine[];
      })
      .then(items => {
        setLines(items);
        setLoading(false);
      })
      .catch(err => {
        console.error('Lines fetch error:', err);
        if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError') || err.message?.includes('CORS')) {
          setError('Unable to connect to Oracle Fusion API. This may be a CORS restriction — the API must allow requests from this origin.');
        } else {
          setError(err.message ?? 'Failed to load lines');
        }
        setLoading(false);
      });
  }, [poHeaderId]);

  const columns: ColumnsType<POLine> = [
    { title: '#', dataIndex: 'LineNumber', width: 50, align: 'center' as const },
    { title: 'Item', dataIndex: 'ItemNumber', width: 120, render: v => v ?? '—' },
    {
      title: 'Description', dataIndex: 'ItemDescription', ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text>,
    },
    { title: 'Category', dataIndex: 'CategoryName', width: 140, render: v => v ?? '—' },
    { title: 'UOM', dataIndex: 'UnitOfMeasure', width: 60, align: 'center' as const },
    {
      title: 'Qty Ordered', dataIndex: 'QuantityOrdered', width: 100, align: 'right' as const,
      render: v => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{v ?? '—'}</Text>,
    },
    {
      title: 'Qty Received', dataIndex: 'QuantityReceived', width: 110, align: 'right' as const,
      render: v => <Text style={{ fontVariantNumeric: 'tabular-nums', color: v > 0 ? REDWOOD.success : undefined }}>{v ?? 0}</Text>,
    },
    {
      title: 'Qty Billed', dataIndex: 'QuantityBilled', width: 100, align: 'right' as const,
      render: v => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{v ?? 0}</Text>,
    },
    {
      title: 'Unit Price', dataIndex: 'UnitPrice', width: 110, align: 'right' as const,
      render: v => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(v)}</Text>,
    },
    {
      title: 'Amount', dataIndex: 'LineAmount', width: 120, align: 'right' as const,
      render: v => <Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(v)}</Text>,
    },
    {
      title: 'Status', dataIndex: 'StatusCode', width: 130,
      render: s => getStatusTag(s),
    },
    {
      title: 'Need-By Date', dataIndex: 'NeedByDate', width: 120,
      render: d => fmtDate(d),
    },
    {
      title: 'Ship-To', dataIndex: 'ShipToLocation', width: 140,
      render: v => <Text style={{ fontSize: 11 }}>{v ?? '—'}</Text>,
    },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" tip="Loading lines..." />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        margin: 24, padding: 20, borderRadius: 8,
        background: REDWOOD.error + '10', border: `1px solid ${REDWOOD.error}30`,
        color: REDWOOD.error,
      }}>
        <InfoCircleOutlined style={{ marginRight: 8 }} />
        {error}
      </div>
    );
  }

  if (lines.length === 0) {
    return <Empty description="No lines found for this purchase order" style={{ padding: 60 }} />;
  }

  return (
    <Table
      columns={columns}
      dataSource={lines}
      rowKey={(r, i) => `line-${r.LineNumber ?? i}`}
      size="small"
      pagination={false}
      scroll={{ x: 1400 }}
      style={{ marginTop: 8 }}
      rowClassName={(_, idx) => idx % 2 === 0 ? '' : 'ant-table-row-alt'}
    />
  );
};

// ── PO Detail Drawer ─────────────────────────────────────────────────────────
const PODetailDrawer: React.FC<{
  po: POHeader | null;
  open: boolean;
  onClose: () => void;
}> = ({ po, open, onClose }) => {
  if (!po) return null;

  const labelStyle: React.CSSProperties = {
    color: REDWOOD.neutral600,
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  };
  const valueStyle: React.CSSProperties = { color: REDWOOD.neutral900, fontSize: 13 };

  const FieldPair: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
    <Col xs={24} sm={12}>
      <div style={{ marginBottom: 16 }}>
        <div style={labelStyle}>{label}</div>
        <div style={valueStyle}>{value ?? '—'}</div>
      </div>
    </Col>
  );

  const SectionTitle: React.FC<{ title: string }> = ({ title }) => (
    <Col xs={24}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: REDWOOD.primary,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        paddingTop: 12, paddingBottom: 4,
        borderBottom: `2px solid ${REDWOOD.primary}30`,
        marginBottom: 4,
      }}>
        {title}
      </div>
    </Col>
  );

  const headerTab = (
    <div style={{ padding: '8px 0' }}>
      <Row gutter={[16, 0]}>
        <SectionTitle title="Order Information" />
        <FieldPair label="Order Number" value={<Text strong style={{ color: REDWOOD.info }}>{po.OrderNumber}</Text>} />
        <FieldPair label="Status" value={getStatusTag(po.StatusCode)} />
        <FieldPair label="Document Style" value={po.DocumentStyle} />
        <FieldPair label="Order Date" value={fmtDate(po.OrderDate)} />
        <FieldPair label="Creation Date" value={fmtDate(po.CreationDate)} />
        <FieldPair label="Last Updated" value={fmtDate(po.LastUpdateDate)} />

        <SectionTitle title="Supplier" />
        <FieldPair label="Supplier" value={po.SupplierName} />
        <FieldPair label="Supplier Site" value={po.SupplierSite} />
        <FieldPair label="Supplier Contact" value={po.SupplierContact} />

        <SectionTitle title="People & Organizations" />
        <FieldPair label="Buyer" value={po.BuyerName} />
        <FieldPair label="Requester" value={po.RequesterName} />
        <FieldPair label="Procurement BU" value={po.ProcurementBU} />
        <FieldPair label="Requisitioning BU" value={po.RequisitioningBU} />
        <FieldPair label="Bill To BU" value={po.BillToBU} />

        <SectionTitle title="Financial" />
        <FieldPair label="Currency" value={po.CurrencyCode} />
        <FieldPair label="Payment Terms" value={po.PaymentTerms} />
        <FieldPair label="Conversion Rate" value={po.ConversionRate ? `${po.ConversionRate} (${po.ConversionRateType ?? ''})` : '—'} />

        <SectionTitle title="Locations" />
        <FieldPair label="Ship To Location" value={po.ShipToLocation} />
        <FieldPair label="Bill To Location" value={po.BillToLocation} />

        {(po.NoteToSupplier || po.NoteToReceiver) && (
          <>
            <SectionTitle title="Notes" />
            {po.NoteToSupplier && <FieldPair label="Note to Supplier" value={<Text style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{po.NoteToSupplier}</Text>} />}
            {po.NoteToReceiver && <FieldPair label="Note to Receiver" value={<Text style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{po.NoteToReceiver}</Text>} />}
          </>
        )}

        <SectionTitle title="Amounts" />
        <Col xs={24}>
          <div style={{
            background: REDWOOD.neutral100,
            border: `1px solid ${REDWOOD.neutral200}`,
            borderRadius: 8,
            padding: '16px 20px',
            marginBottom: 16,
          }}>
            <Row gutter={[0, 8]}>
              <Col xs={12}><Text style={{ color: REDWOOD.neutral600, fontSize: 12 }}>Ordered Amount</Text></Col>
              <Col xs={12} style={{ textAlign: 'right' }}>
                <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                  {fmtAmt(po.OrderedAmount, po.CurrencyCode)}
                </Text>
              </Col>
              <Col xs={12}><Text style={{ color: REDWOOD.neutral600, fontSize: 12 }}>Tax Amount</Text></Col>
              <Col xs={12} style={{ textAlign: 'right' }}>
                <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                  {fmtAmt(po.TaxAmount, po.CurrencyCode)}
                </Text>
              </Col>
              <Col xs={24}><Divider style={{ margin: '4px 0' }} /></Col>
              <Col xs={12}>
                <Text strong style={{ fontSize: 14, color: REDWOOD.neutral900 }}>Total (with Tax)</Text>
              </Col>
              <Col xs={12} style={{ textAlign: 'right' }}>
                <Text strong style={{
                  fontVariantNumeric: 'tabular-nums', fontSize: 16,
                  color: REDWOOD.primary,
                }}>
                  {fmtAmt(po.TotalAmount, po.CurrencyCode)}
                </Text>
              </Col>
            </Row>
          </div>
        </Col>

        {(po.RequisitionNumber || po.SalesOrderNumber || po.NegotiationNumber) && (
          <>
            <SectionTitle title="Source Documents" />
            {po.RequisitionNumber && <FieldPair label="Requisition" value={po.RequisitionNumber} />}
            {po.SalesOrderNumber && <FieldPair label="Sales Order" value={po.SalesOrderNumber} />}
            {po.NegotiationNumber && <FieldPair label="Negotiation" value={po.NegotiationNumber} />}
          </>
        )}
      </Row>
    </div>
  );

  const tabItems = [
    {
      key: 'header',
      label: (
        <span>
          <InfoCircleOutlined style={{ marginRight: 6 }} />
          Header
        </span>
      ),
      children: headerTab,
    },
    {
      key: 'lines',
      label: (
        <span>
          <UnorderedListOutlined style={{ marginRight: 6 }} />
          Lines
        </span>
      ),
      children: <POLinesTab poHeaderId={po.POHeaderId} />,
    },
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="85%"
      title={null}
      styles={{
        header: { display: 'none' },
        body: { padding: 0, background: REDWOOD.neutral100 },
      }}
      destroyOnClose
    >
      {/* Drawer Header */}
      <div style={{
        padding: '16px 24px',
        background: REDWOOD.surface,
        borderBottom: `1px solid ${REDWOOD.neutral200}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: `linear-gradient(135deg, ${REDWOOD.primary} 0%, ${REDWOOD.primaryDark} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ShoppingCartOutlined style={{ color: '#fff', fontSize: 18 }} />
          </div>
          <div>
            <Title level={5} style={{ margin: 0, color: REDWOOD.neutral900 }}>
              Purchase Order: {po.OrderNumber}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {po.SupplierName} &nbsp;·&nbsp; {fmtDate(po.OrderDate)}
            </Text>
          </div>
        </div>
        <Space>
          <Button
            icon={<PrinterOutlined />}
            onClick={() => window.print()}
            style={{ borderColor: REDWOOD.neutral200 }}
          >
            Print
          </Button>
          <Button
            icon={<CheckCircleOutlined />}
            onClick={() => message.info('Approval workflow not yet configured')}
            style={{ borderColor: REDWOOD.info, color: REDWOOD.info }}
          >
            Submit for Approval
          </Button>
          <Button
            icon={<CloseOutlined />}
            onClick={onClose}
            style={{ borderColor: REDWOOD.neutral200 }}
          >
            Close
          </Button>
        </Space>
      </div>

      {/* Drawer Body */}
      <div style={{ padding: '0 24px 24px' }}>
        <Tabs
          defaultActiveKey="header"
          items={tabItems}
          style={{ background: REDWOOD.surface, borderRadius: 8, padding: '0 16px' }}
          tabBarStyle={{ borderBottom: `1px solid ${REDWOOD.neutral200}` }}
        />
      </div>
    </Drawer>
  );
};

// ── Main Page ────────────────────────────────────────────────────────────────
const ManagePurchaseOrders: React.FC = () => {
  const [form] = Form.useForm();
  const [data, setData] = useState<POHeader[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useState<SearchParams>({});
  const [selectedPO, setSelectedPO] = useState<POHeader | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const fetchPOs = useCallback(async (params: SearchParams, pageNum: number) => {
    setLoading(true);
    const offset = (pageNum - 1) * PAGE_SIZE;
    const q = buildQParam(params);

    const urlParams = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      totalResults: 'true',
    });
    if (q) urlParams.set('q', q);

    try {
      const res = await fetch(`${BASE_URL}/purchaseOrders?${urlParams.toString()}`, {
        headers: {
          Authorization: AUTH_HEADER,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      const items: POHeader[] = json.items ?? json ?? [];
      const count: number = json.totalResults ?? json.count ?? items.length;

      setData(items);
      setTotal(count);
    } catch (err: unknown) {
      const e = err as Error;
      console.error('PO fetch error:', e);
      if (
        e.message?.includes('Failed to fetch') ||
        e.message?.includes('NetworkError') ||
        e.message?.includes('CORS')
      ) {
        message.error(
          'Unable to connect to Oracle Fusion API. The API server may need CORS configuration to allow requests from this application.',
          6
        );
      } else {
        message.error(`Failed to load purchase orders: ${e.message}`);
      }
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = () => {
    const vals = form.getFieldsValue();
    const params: SearchParams = {
      orderNumber: vals.orderNumber,
      supplier: vals.supplier,
      statusCode: vals.statusCode,
      dateRange: vals.dateRange ?? null,
    };
    setSearchParams(params);
    setPage(1);
    setHasSearched(true);
    fetchPOs(params, 1);
  };

  const handleReset = () => {
    form.resetFields();
    setSearchParams({});
    setPage(1);
    setData([]);
    setTotal(0);
    setHasSearched(false);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchPOs(searchParams, newPage);
  };

  const handleView = (po: POHeader) => {
    setSelectedPO(po);
    setDrawerOpen(true);
  };

  const columns: ColumnsType<POHeader> = [
    {
      title: 'Order Number',
      dataIndex: 'OrderNumber',
      width: 150,
      fixed: 'left' as const,
      render: (v: string, rec: POHeader) => (
        <Button
          type="link"
          style={{ padding: 0, fontWeight: 600, color: REDWOOD.info }}
          onClick={() => handleView(rec)}
        >
          {v}
        </Button>
      ),
    },
    {
      title: 'Supplier',
      dataIndex: 'SupplierName',
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'StatusCode',
      width: 160,
      render: (s: string) => getStatusTag(s),
    },
    {
      title: 'Currency',
      dataIndex: 'CurrencyCode',
      width: 80,
      align: 'center' as const,
    },
    {
      title: 'Ordered Amt',
      dataIndex: 'OrderedAmount',
      width: 130,
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmtAmt(v)}</Text>
      ),
    },
    {
      title: 'Total (with Tax)',
      dataIndex: 'TotalAmount',
      width: 140,
      align: 'right' as const,
      render: (v: number) => (
        <Text strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: REDWOOD.neutral900 }}>
          {fmtAmt(v)}
        </Text>
      ),
    },
    {
      title: 'Buyer',
      dataIndex: 'BuyerName',
      width: 150,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text>,
    },
    {
      title: 'Order Date',
      dataIndex: 'OrderDate',
      width: 120,
      render: (d: string) => fmtDate(d),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 90,
      fixed: 'right' as const,
      align: 'center' as const,
      render: (_: unknown, rec: POHeader) => (
        <Button
          type="primary"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleView(rec)}
          style={{
            background: REDWOOD.info,
            borderColor: REDWOOD.info,
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{
          padding: '14px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
        }}>
          <Breadcrumb items={[
            { title: <Link to="/home"><HomeOutlined /> Home</Link> },
            { title: <Link to="/procurement">Procurement</Link> },
            { title: 'Purchase Orders' },
          ]} />
        </div>

        <div style={{ padding: 24 }}>
          {/* Page Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: `linear-gradient(135deg, ${REDWOOD.primary} 0%, ${REDWOOD.primaryDark} 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 12px ${REDWOOD.primary}40`,
            }}>
              <ShoppingCartOutlined style={{ fontSize: 22, color: '#fff' }} />
            </div>
            <div>
              <Title level={3} style={{ margin: 0, color: REDWOOD.neutral900 }}>Manage Purchase Orders</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Search and view purchase orders from Oracle Fusion Procurement
              </Text>
            </div>
          </div>

          {/* Search Panel */}
          <Card
            style={{
              borderRadius: 8,
              border: `1px solid ${REDWOOD.neutral200}`,
              marginBottom: 16,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}
            styles={{ body: { padding: '16px 20px' } }}
          >
            <Form form={form} layout="vertical">
              <Row gutter={[12, 0]}>
                <Col xs={24} sm={12} md={6}>
                  <Form.Item name="orderNumber" label={<Text style={{ fontSize: 12, fontWeight: 600 }}>Order Number</Text>} style={{ marginBottom: 8 }}>
                    <Input
                      placeholder="e.g. BHT-0001"
                      allowClear
                      style={{ borderRadius: 6 }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={6}>
                  <Form.Item name="supplier" label={<Text style={{ fontSize: 12, fontWeight: 600 }}>Supplier</Text>} style={{ marginBottom: 8 }}>
                    <Input
                      placeholder="Supplier name"
                      allowClear
                      style={{ borderRadius: 6 }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={5}>
                  <Form.Item name="statusCode" label={<Text style={{ fontSize: 12, fontWeight: 600 }}>Status</Text>} style={{ marginBottom: 8 }}>
                    <Select
                      placeholder="All statuses"
                      allowClear
                      style={{ borderRadius: 6 }}
                    >
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
                    <RangePicker style={{ width: '100%', borderRadius: 6 }} />
                  </Form.Item>
                </Col>
              </Row>
              <Row>
                <Col xs={24} style={{ display: 'flex', gap: 8 }}>
                  <Button
                    type="primary"
                    icon={<SearchOutlined />}
                    onClick={handleSearch}
                    loading={loading}
                    style={{
                      background: REDWOOD.primary,
                      borderColor: REDWOOD.primary,
                      borderRadius: 6,
                      fontWeight: 600,
                    }}
                  >
                    Search
                  </Button>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={handleReset}
                    style={{ borderRadius: 6 }}
                  >
                    Reset
                  </Button>
                </Col>
              </Row>
            </Form>
          </Card>

          {/* Results Table */}
          <Card
            style={{
              borderRadius: 8,
              border: `1px solid ${REDWOOD.neutral200}`,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}
            styles={{ body: { padding: 0 } }}
          >
            {/* Table Header Bar */}
            <div style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: REDWOOD.surface,
              borderRadius: '8px 8px 0 0',
            }}>
              <Text strong style={{ fontSize: 13, color: REDWOOD.neutral900 }}>
                Purchase Orders
                {hasSearched && total > 0 && (
                  <Text type="secondary" style={{ fontWeight: 400, marginLeft: 8 }}>
                    ({total} result{total !== 1 ? 's' : ''})
                  </Text>
                )}
              </Text>
            </div>

            <Table
              columns={columns}
              dataSource={data}
              rowKey="POHeaderId"
              loading={loading}
              size="small"
              scroll={{ x: 1200 }}
              pagination={
                hasSearched && total > 0
                  ? {
                      current: page,
                      pageSize: PAGE_SIZE,
                      total,
                      showSizeChanger: false,
                      showTotal: (t) => `${t} purchase orders`,
                      onChange: handlePageChange,
                      style: { padding: '12px 16px', margin: 0 },
                    }
                  : false
              }
              locale={{
                emptyText: hasSearched ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No purchase orders found matching your search criteria"
                    style={{ padding: 40 }}
                  />
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="Use the search panel above to find purchase orders"
                    style={{ padding: 40 }}
                  />
                ),
              }}
              rowClassName={(_, idx) => idx % 2 === 0 ? '' : 'po-row-alt'}
              onRow={rec => ({
                style: { cursor: 'pointer' },
                onDoubleClick: () => handleView(rec),
              })}
            />
          </Card>
        </div>
      </Content>

      {/* Detail Drawer */}
      <PODetailDrawer
        po={selectedPO}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedPO(null); }}
      />
    </Layout>
  );
};

export default ManagePurchaseOrders;
