import React, { useState, useRef, useEffect } from 'react';
import {
  Layout,
  Card,
  Form,
  Select,
  Input,
  Button,
  Space,
  Typography,
  Table,
  Row,
  Col,
  Breadcrumb,
  Collapse,
  message,
  DatePicker,
  Tabs,
  Switch,
  Spin,
  Divider,
  Descriptions,
  Checkbox,
  Modal,
  Tag,
  Tooltip,
  Statistic,
  Progress,
} from 'antd';
import {
  HomeOutlined,
  SearchOutlined,
  ReloadOutlined,
  SaveOutlined,
  PlusOutlined,
  SettingOutlined,
  SwapOutlined,
  CloudOutlined,
  DatabaseOutlined,
  UserOutlined,
  EnvironmentOutlined,
  BankOutlined,
  ContactsOutlined,
  SafetyCertificateOutlined,
  StarOutlined,
  CloseOutlined,
  ApiOutlined,
  CopyOutlined,
  CheckOutlined,
  DollarOutlined,
  FileTextOutlined,
  CreditCardOutlined,
  ExclamationCircleOutlined,
  CalendarOutlined,
  FileExcelOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import FloatingMenu from '../../components/FloatingMenu';
import Autopilot from '../../components/Autopilot';
import InvoiceDetail from '../ap/InvoiceDetail';
import type { ColumnsType } from 'antd/es/table';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;
const { Panel } = Collapse;

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',
  primaryLight: '#E85D4A',
  primaryDark: '#A33B2C',
  success: '#1D7B4D',
  warning: '#D4A800',
  info: '#0572CE',
  error: '#D93025',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral300: '#C7C7C7',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface: '#FFFFFF',
  taskBlue: '#0572CE',
};

import { APEX_DB_CONFIG, ORACLE_FUSION_CONFIG } from '../../config/api.config';

const FUSION_AUTH = btoa(`${ORACLE_FUSION_CONFIG.username}:${ORACLE_FUSION_CONFIG.password}`);

// Supplier record interface
interface SupplierRecord {
  key: string;
  supplierId: number;
  supplier: string;
  supplierNumber: string;
  alternateName: string;
  businessRelationship: string;
  parentSupplier: string;
  creationDate: string;
  inactiveSince: string;
  taxRegistrationNumber: string;
  taxpayerId: string;
  dunsNumber: string;
  supplierType: string;
  taxOrganizationType: string;
  status: string;
}

// Supplier detail interface
interface SupplierDetail extends SupplierRecord {
  // General
  creationSource: string;
  registrationRequest: string;
  parentSupplierNumber: string;
  inactiveDate: string;
  // Identification
  alias: string;
  customerNumber: string;
  sic: string;
  nationalInsuranceNumber: string;
  corporateWebSite: string;
  oneTimeSupplier: boolean;
  registryId: string;
  relationships: string;
  // Regional Information
  regionalInformation: string;
  // Corporate Profile
  yearEstablished: string;
  missionStatement: string;
  yearIncorporated: string;
  chiefExecutiveTitle: string;
  chiefExecutiveName: string;
  principalTitle: string;
  principalName: string;
  // Financial Profile
  fiscalYearEndMonth: string;
  currentFiscalYearRevenue: string;
  preferredFunctionalCurrency: string;
}

// Tab item interface for open suppliers
interface SupplierTab {
  key: string;
  label: string;
  supplier: SupplierRecord;
  detail?: SupplierDetail;
  loading?: boolean;
  tabType: 'detail' | 'balance';
}

// Balance tab interfaces
interface BalanceSummary {
  totalInvoices: number;
  totalInvoiceAmount: number;
  totalPayments: number;
  totalPaymentAmount: number;
  balance: number;
  currency: string;
}

interface AgingBucket {
  bucket: string;
  amount: number;
  invoiceCount: number;
  percentage: number;
}

interface SupplierAddress {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface BalanceData {
  supplier: {
    supplierId: number;
    supplierNumber: string;
    supplierName: string;
    supplierType: string | null;
    status: string;
    taxRegistrationNumber: string | null;
    creationDate: string | null;
    address: SupplierAddress | null;
  };
  balanceSummary: BalanceSummary;
  agingReport: AgingBucket[];
}

interface InvoiceRecord {
  key: string;
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceAmount: number;
  amountPaid: number;
  amountRemaining: number;
  invoiceStatus: string;
  currency: string;
  description: string;
}

interface PaymentRecord {
  key: string;
  paymentId: number;
  checkId: number;
  paymentNumber: string;
  paymentDate: string;
  paymentAmount: number;
  paymentStatus: string;
  paymentMethod: string;
  currency: string;
  bankAccountName: string;
}

interface RelatedInvoice {
  key: string;
  invoiceId: number;
  invoiceNumber: string;
  invoiceAmount: number;
  amountApplied: number;
}

// Helper function to format date
const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

// Map Fusion API response to SupplierRecord
const mapFusionToSupplierRecord = (item: any, index: number): SupplierRecord => ({
  key: item.SupplierId?.toString() || index.toString(),
  supplierId: item.SupplierId,
  supplier: item.Supplier || '',
  supplierNumber: item.SupplierNumber || '',
  alternateName: item.AlternateName || '',
  businessRelationship: item.BusinessRelationship || '',
  parentSupplier: item.ParentSupplier || '',
  creationDate: formatDate(item.CreationDate),
  inactiveSince: formatDate(item.InactiveDate),
  taxRegistrationNumber: item.TaxRegistrationNumber || '',
  taxpayerId: item.TaxpayerId || '',
  dunsNumber: item.DUNSNumber || '',
  supplierType: item.SupplierType || '',
  taxOrganizationType: item.TaxOrganizationType || '',
  status: item.Status || 'Active',
});

// Map APEX API response to SupplierRecord (lowercase column names)
const mapApexToSupplierRecord = (item: any, index: number): SupplierRecord => ({
  key: item.supplier_id?.toString() || index.toString(),
  supplierId: item.supplier_id,
  supplier: item.supplier || '',
  supplierNumber: item.supplier_number || '',
  alternateName: item.alternate_name || '',
  businessRelationship: item.business_relationship || '',
  parentSupplier: item.parent_supplier || '',
  creationDate: formatDate(item.creation_date),
  inactiveSince: formatDate(item.inactive_date),
  taxRegistrationNumber: item.tax_registration_number || '',
  taxpayerId: item.taxpayer_id || '',
  dunsNumber: item.duns_number || '',
  supplierType: item.supplier_type || '',
  taxOrganizationType: item.tax_organization_type || '',
  status: item.status || 'Active',
});

// Map Fusion detail API response to SupplierDetail
const mapFusionToSupplierDetail = (item: any): SupplierDetail => ({
  key: item.SupplierId?.toString() || '',
  supplierId: item.SupplierId,
  supplier: item.Supplier || '',
  supplierNumber: item.SupplierNumber || '',
  alternateName: item.AlternateName || '',
  businessRelationship: item.BusinessRelationship || '',
  parentSupplier: item.ParentSupplier || '',
  creationDate: formatDate(item.CreationDate),
  inactiveSince: formatDate(item.InactiveDate),
  taxRegistrationNumber: item.TaxRegistrationNumber || '',
  taxpayerId: item.TaxpayerId || '',
  dunsNumber: item.DUNSNumber || '',
  supplierType: item.SupplierType || '',
  taxOrganizationType: item.TaxOrganizationType || '',
  status: item.Status || 'Active',
  // General
  creationSource: item.CreationSource || '',
  registrationRequest: item.RegistrationRequest || '',
  parentSupplierNumber: item.ParentSupplierNumber || '',
  inactiveDate: formatDate(item.InactiveDate),
  // Identification
  alias: item.Alias || '',
  customerNumber: item.CustomerNumber || '',
  sic: item.SIC || '',
  nationalInsuranceNumber: item.NationalInsuranceNumber || '',
  corporateWebSite: item.CorporateWebSite || '',
  oneTimeSupplier: item.OneTimeSupplierFlag === 'Y',
  registryId: item.RegistryId || '',
  relationships: item.Relationships || 'Supplier',
  // Regional Information
  regionalInformation: item.RegionalInformation || '',
  // Corporate Profile
  yearEstablished: item.YearEstablished || '',
  missionStatement: item.MissionStatement || '',
  yearIncorporated: item.YearIncorporated || '',
  chiefExecutiveTitle: item.ChiefExecutiveTitle || '',
  chiefExecutiveName: item.ChiefExecutiveName || '',
  principalTitle: item.PrincipalTitle || '',
  principalName: item.PrincipalName || '',
  // Financial Profile
  fiscalYearEndMonth: item.FiscalYearEndMonth || '',
  currentFiscalYearRevenue: item.CurrentFiscalYearRevenue || '',
  preferredFunctionalCurrency: item.PreferredFunctionalCurrency || '',
});

// ── InvoicesTabContent ──────────────────────────────────────────────────────
// Defined OUTSIDE ManageSuppliers so its type identity is stable across
// parent re-renders, preventing full remount when parent state changes.
interface InvoicesTabContentProps {
  invoices: InvoiceRecord[];
  invoicesLoading: boolean;
  supplierNumber: string;
  onExport: (rows: InvoiceRecord[]) => void;
  onRefresh: () => void;
  onEdit: (invoice: InvoiceRecord) => void;
}

const InvoicesTabContent: React.FC<InvoicesTabContentProps> = ({
  invoices, invoicesLoading, onExport, onRefresh, onEdit,
}) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const filtered = React.useMemo(() => {
    if (!search) return invoices;
    const q = search.toLowerCase();
    return invoices.filter(r =>
      (r.invoiceNumber || '').toLowerCase().includes(q) ||
      (r.description   || '').toLowerCase().includes(q) ||
      (r.invoiceStatus || '').toLowerCase().includes(q) ||
      String(r.invoiceAmount).includes(q)
    );
  }, [invoices, search]);

  // Reset to page 1 whenever filter changes
  React.useEffect(() => { setPage(1); }, [search]);

  const columns = React.useMemo(() => [
    { title: 'Invoice #', dataIndex: 'invoiceNumber', key: 'invoiceNumber', width: 140 },
    { title: 'Date', dataIndex: 'invoiceDate', key: 'invoiceDate', width: 110 },
    {
      title: 'Amount', dataIndex: 'invoiceAmount', key: 'invoiceAmount', width: 130, align: 'right' as const,
      render: (amt: number, r: InvoiceRecord) => <Text strong>{new Intl.NumberFormat('en-AE', { style: 'currency', currency: r.currency || 'AED', minimumFractionDigits: 2 }).format(amt)}</Text>
    },
    {
      title: 'Paid', dataIndex: 'amountPaid', key: 'amountPaid', width: 130, align: 'right' as const,
      render: (amt: number, r: InvoiceRecord) => <Text style={{ color: REDWOOD.success }}>{new Intl.NumberFormat('en-AE', { style: 'currency', currency: r.currency || 'AED', minimumFractionDigits: 2 }).format(amt)}</Text>
    },
    {
      title: 'Balance', dataIndex: 'amountRemaining', key: 'amountRemaining', width: 130, align: 'right' as const,
      render: (amt: number, r: InvoiceRecord) => <Text style={{ color: amt > 0 ? REDWOOD.error : REDWOOD.success }}>{new Intl.NumberFormat('en-AE', { style: 'currency', currency: r.currency || 'AED', minimumFractionDigits: 2 }).format(amt)}</Text>
    },
    {
      title: 'Status', dataIndex: 'invoiceStatus', key: 'invoiceStatus', width: 100,
      render: (status: string) => <Tag>{status || '-'}</Tag>
    },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '', key: 'actions', width: 60, fixed: 'right' as const,
      render: (_: any, record: InvoiceRecord) => (
        <Tooltip title="View / Edit Invoice">
          <Button type="text" size="small" icon={<EditOutlined />} style={{ color: REDWOOD.info }} onClick={() => onEdit(record)} />
        </Tooltip>
      ),
    },
  ], [onEdit]);

  return (
    <div>
      <Row gutter={8} style={{ marginBottom: 12 }} align="middle">
        <Col>
          <Input
            placeholder="Search invoice #, description, status..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            size="small"
            style={{ width: 280 }}
          />
        </Col>
        <Col>
          <Space>
            <Text type="secondary" style={{ fontSize: 12 }}>{filtered.length}/{invoices.length} rows</Text>
            <Button icon={<FileExcelOutlined />} size="small" style={{ color: '#1D7B4D', borderColor: '#1D7B4D' }} onClick={() => onExport(filtered)}>Excel</Button>
            <Button icon={<ReloadOutlined />} size="small" onClick={onRefresh} loading={invoicesLoading}>Refresh</Button>
          </Space>
        </Col>
      </Row>
      <Table
        columns={columns}
        dataSource={filtered}
        loading={invoicesLoading}
        scroll={{ x: 900 }}
        size="small"
        rowKey="key"
        pagination={{
          current: page,
          pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} invoices`,
          onChange: (p, s) => { setPage(p); setPageSize(s); },
        }}
      />
    </div>
  );
};

const ManageSuppliers: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [searchCollapsed, setSearchCollapsed] = useState(false);
  const [dataSource, setDataSource] = useState<'fusion' | 'apex'>('fusion');

  // Tab management state
  const [activeTab, setActiveTab] = useState('search');
  const [openTabs, setOpenTabs] = useState<SupplierTab[]>([]);

  // Balance tab state - stored per tab key
  const [balanceDataMap, setBalanceDataMap] = useState<Record<string, BalanceData | null>>({});
  const [invoicesMap, setInvoicesMap] = useState<Record<string, InvoiceRecord[]>>({});
  const [paymentsMap, setPaymentsMap] = useState<Record<string, PaymentRecord[]>>({});
  const [balanceLoadingMap, setBalanceLoadingMap] = useState<Record<string, boolean>>({});
  const [invoicesLoadingMap, setInvoicesLoadingMap] = useState<Record<string, boolean>>({});
  const [paymentsLoadingMap, setPaymentsLoadingMap] = useState<Record<string, boolean>>({});

  // Payment drilldown modal
  const [drilldownVisible, setDrilldownVisible] = useState(false);
  const [drilldownPayment, setDrilldownPayment] = useState<PaymentRecord | null>(null);
  const [editInvoiceVisible, setEditInvoiceVisible] = useState(false);
  const [editInvoice, setEditInvoice] = useState<InvoiceRecord | null>(null);
  const [editInvoiceSaving, setEditInvoiceSaving] = useState(false);
  const [relatedInvoices, setRelatedInvoices] = useState<RelatedInvoice[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  // API Info Modal state
  const [apiModalVisible, setApiModalVisible] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Supplier LOV modal state
  const [lovVisible, setLovVisible] = useState(false);
  const [lovSearch, setLovSearch] = useState('');
  const [lovResults, setLovResults] = useState<{ supplierNumber: string; supplier: string }[]>([]);
  const [lovLoading, setLovLoading] = useState(false);
  const lovDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openLov = (initialValue?: string) => {
    const val = initialValue || '';
    setLovSearch(val);
    setLovResults([]);
    setLovVisible(true);
    fetchLovResults(val);   // always load — empty string returns all suppliers
  };

  const fetchLovResults = (q: string) => {
    if (lovDebounceRef.current) clearTimeout(lovDebounceRef.current);
    lovDebounceRef.current = setTimeout(async () => {
      setLovLoading(true);
      try {
        const bu: string = form.getFieldValue('businessUnit') || '';
        const params = new URLSearchParams();
        if (q)  params.set('q', q);
        if (bu) params.set('P_BUSINESS_UNIT', bu);
        const qs = params.toString();
        const url = `${APEX_DB_CONFIG.baseUrl}/suppliers${qs ? '?' + qs : ''}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const items: any[] = Array.isArray(data) ? data : (data.items || []);
        setLovResults(items.slice(0, 100).map((item: any) => ({
          supplierNumber: item.supplier_number || '',
          supplier: item.supplier || '',
        })));
      } catch { /* ignore */ }
      finally { setLovLoading(false); }
    }, 300);
  };

  const onLovPick = (row: { supplierNumber: string; supplier: string }) => {
    form.setFieldsValue({ supplierNumber: row.supplierNumber, supplier: row.supplier });
    setLovVisible(false);
  };

  // Business Unit options — fetched from RR_GL_BUSINESS_UNITS via GET /gl/businessunits
  const [businessUnits, setBusinessUnits] = useState<string[]>([]);
  useEffect(() => {
    fetch(`${APEX_DB_CONFIG.baseUrl}/gl/businessunits`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const items: any[] = Array.isArray(data) ? data : (data.items || []);
        setBusinessUnits(items.map((i: any) => i.business_unit_name || '').filter(Boolean));
      })
      .catch(() => {});
  }, []);

  // API Configuration for this page
  const PAGE_APIS = {
    fusion: [
      {
        name: 'Search Suppliers',
        method: 'GET',
        proxyUrl: `${ORACLE_FUSION_CONFIG.baseUrl}/suppliers`,
        actualUrl: `${ORACLE_FUSION_CONFIG.baseUrl}/suppliers`,
        params: 'limit=25&onlyData=true',
        description: 'Fetches list of suppliers with pagination',
      },
      {
        name: 'Get Supplier Detail',
        method: 'GET',
        proxyUrl: `${ORACLE_FUSION_CONFIG.baseUrl}/suppliers/{supplierId}`,
        actualUrl: `${ORACLE_FUSION_CONFIG.baseUrl}/suppliers/{supplierId}`,
        params: '',
        description: 'Fetches complete supplier details by ID',
      },
    ],
    apex: [
      {
        name: 'Search Suppliers',
        method: 'GET',
        proxyUrl: `${APEX_DB_CONFIG.baseUrl}/suppliers`,
        actualUrl: `${APEX_DB_CONFIG.baseUrl}/suppliers`,
        params: '',
        description: 'Fetches suppliers from APEX database',
      },
      {
        name: 'Supplier Balance Dashboard',
        method: 'GET',
        proxyUrl: `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/dashboard/{supplierNumber}`,
        actualUrl: `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/dashboard/{supplierNumber}`,
        params: '',
        description: 'Fetches supplier balance summary, aging report, and supplier details',
      },
      {
        name: 'Supplier Balance Invoices',
        method: 'GET',
        proxyUrl: `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/invoices/{supplierNumber}`,
        actualUrl: `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/invoices/{supplierNumber}`,
        params: '',
        description: 'Fetches all invoices for a supplier with amounts and status',
      },
      {
        name: 'Supplier Balance Payments',
        method: 'GET',
        proxyUrl: `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/payments/{supplierNumber}`,
        actualUrl: `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/payments/{supplierNumber}`,
        params: '',
        description: 'Fetches all payments made to a supplier',
      },
      {
        name: 'Payment Drilldown (Related Invoices)',
        method: 'GET',
        proxyUrl: `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/payment-invoices/{checkId}`,
        actualUrl: `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/payment-invoices/{checkId}`,
        params: '',
        description: 'Fetches invoices related to a specific payment check',
      },
    ],
  };

  // Copy URL to clipboard
  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    message.success('URL copied to clipboard');
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  // Fetch supplier detail from Fusion
  const fetchSupplierDetail = async (supplierId: number): Promise<SupplierDetail | null> => {
    try {
      const directUrl = `${ORACLE_FUSION_CONFIG.baseUrl}/suppliers/${supplierId}`;

      const response = await fetch(directUrl, {
        headers: { 'Authorization': `Basic ${FUSION_AUTH}` },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return mapFusionToSupplierDetail(data);
    } catch (error) {
      console.error('Error fetching supplier detail:', error);
      message.error('Failed to fetch supplier details');
      return null;
    }
  };

  // Fetch balance dashboard data
  const fetchBalanceDashboard = async (supplierNumber: string): Promise<BalanceData | null> => {
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/dashboard/${supplierNumber}`;
      console.log('Fetching balance dashboard:', url);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Balance dashboard response:', data);

      if (data.success === 'false') {
        throw new Error(data.error || 'Failed to load balance data');
      }

      return {
        supplier: {
          supplierId: data.supplier?.supplier_id || 0,
          supplierNumber: data.supplier?.supplier_number || supplierNumber,
          supplierName: data.supplier?.supplier_name || '',
          supplierType: data.supplier?.supplier_type || null,
          status: data.supplier?.status || 'Active',
          taxRegistrationNumber: data.supplier?.tax_registration_number || null,
          creationDate: data.supplier?.creation_date || null,
          address: data.supplier?.address ? {
            addressLine1: data.supplier.address.address_line_1 || '',
            addressLine2: data.supplier.address.address_line_2 || '',
            city: data.supplier.address.city || '',
            state: data.supplier.address.state || '',
            postalCode: data.supplier.address.postal_code || '',
            country: data.supplier.address.country || '',
          } : null,
        },
        balanceSummary: {
          totalInvoices: data.balance_summary?.total_invoices || 0,
          totalInvoiceAmount: data.balance_summary?.total_invoice_amount || 0,
          totalPayments: data.balance_summary?.total_payments || 0,
          totalPaymentAmount: data.balance_summary?.total_payment_amount || 0,
          balance: data.balance_summary?.balance || 0,
          currency: data.balance_summary?.currency || 'AED',
        },
        agingReport: (data.aging_report || []).map((item: any) => ({
          bucket: item.bucket || '',
          amount: item.amount || 0,
          invoiceCount: item.invoice_count || 0,
          percentage: item.percentage || 0,
        })),
      };
    } catch (error) {
      console.error('Error fetching balance dashboard:', error);
      message.error(`Failed to load balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  };

  // Fetch invoices for balance tab
  const fetchBalanceInvoices = async (supplierNumber: string, tabKey: string) => {
    setInvoicesLoadingMap(prev => ({ ...prev, [tabKey]: true }));
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/invoices/${supplierNumber}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const rawText = await response.text();
      // Strip raw control characters that Oracle may embed in string values
      // (e.g. \r causes "Bad control character at position N")
      const sanitized = rawText.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ');
      const data = JSON.parse(sanitized);
      const items = data.invoices || [];
      setInvoicesMap(prev => ({
        ...prev,
        [tabKey]: items.map((item: any, index: number) => ({
          key: item.invoice_id?.toString() || index.toString(),
          invoiceId: item.invoice_id,
          invoiceNumber: item.invoice_number || '',
          invoiceDate: item.invoice_date || '',
          invoiceAmount: item.invoice_amount || 0,
          amountPaid: item.amount_paid || 0,
          amountRemaining: item.amount_remaining || 0,
          invoiceStatus: item.invoice_status || '',
          currency: item.currency || 'AED',
          description: item.description || '',
        })),
      }));
    } catch (error) {
      console.error('Error fetching invoices:', error);
      message.error('Failed to load invoices');
    } finally {
      setInvoicesLoadingMap(prev => ({ ...prev, [tabKey]: false }));
    }
  };

  // Fetch payments for balance tab
  const fetchBalancePayments = async (supplierNumber: string, tabKey: string) => {
    setPaymentsLoadingMap(prev => ({ ...prev, [tabKey]: true }));
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/payments/${supplierNumber}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const rawText = await response.text();
      const sanitized = rawText.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ');
      const data = JSON.parse(sanitized);
      const items = data.payments || [];
      setPaymentsMap(prev => ({
        ...prev,
        [tabKey]: items.map((item: any, index: number) => ({
          key: item.payment_id?.toString() || index.toString(),
          paymentId: item.payment_id,
          checkId: item.check_id,
          paymentNumber: item.payment_number || '',
          paymentDate: item.payment_date || '',
          paymentAmount: item.payment_amount || 0,
          paymentStatus: item.payment_status || '',
          paymentMethod: item.payment_method || '',
          currency: item.currency || 'AED',
          bankAccountName: item.bank_account_name || '',
        })),
      }));
    } catch (error) {
      console.error('Error fetching payments:', error);
      message.error('Failed to load payments');
    } finally {
      setPaymentsLoadingMap(prev => ({ ...prev, [tabKey]: false }));
    }
  };

  // Fetch payment drilldown
  const fetchPaymentDrilldown = async (payment: PaymentRecord) => {
    setDrilldownPayment(payment);
    setDrilldownVisible(true);
    setDrilldownLoading(true);

    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/payment-invoices/${payment.checkId}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      const items = data.invoices || [];
      setRelatedInvoices(items.map((item: any, index: number) => ({
        key: item.invoice_id?.toString() || index.toString(),
        invoiceId: item.invoice_id,
        invoiceNumber: item.invoice_number || '',
        invoiceAmount: item.invoice_amount || 0,
        amountApplied: item.amount_applied || 0,
      })));
    } catch (error) {
      console.error('Error fetching drilldown:', error);
      message.error('Failed to load related invoices');
    } finally {
      setDrilldownLoading(false);
    }
  };

  // Open supplier detail in new tab
  const openSupplierTab = async (record: SupplierRecord) => {
    const tabKey = `supplier-${record.supplierId}`;

    // Check if tab already exists
    const existingTab = openTabs.find((tab) => tab.key === tabKey);
    if (existingTab) {
      setActiveTab(tabKey);
      return;
    }

    // Add new tab with loading state
    const newTab: SupplierTab = {
      key: tabKey,
      label: record.supplier,
      supplier: record,
      loading: dataSource === 'fusion',
      tabType: 'detail',
    };
    setOpenTabs([...openTabs, newTab]);
    setActiveTab(tabKey);

    // Fetch detail if Fusion mode
    if (dataSource === 'fusion') {
      const detail = await fetchSupplierDetail(record.supplierId);
      setOpenTabs((prevTabs) =>
        prevTabs.map((tab) =>
          tab.key === tabKey ? { ...tab, detail: detail || undefined, loading: false } : tab
        )
      );
    }
  };

  // Open supplier balance in new tab
  const openBalanceTab = async (record: SupplierRecord) => {
    const tabKey = `balance-${record.supplierNumber}`;

    // Check if tab already exists
    const existingTab = openTabs.find((tab) => tab.key === tabKey);
    if (existingTab) {
      setActiveTab(tabKey);
      return;
    }

    // Add new tab with loading state
    const newTab: SupplierTab = {
      key: tabKey,
      label: record.supplier,
      supplier: record,
      loading: true,
      tabType: 'balance',
    };
    setOpenTabs([...openTabs, newTab]);
    setActiveTab(tabKey);
    setBalanceLoadingMap(prev => ({ ...prev, [tabKey]: true }));

    // Fetch balance dashboard
    const balanceData = await fetchBalanceDashboard(record.supplierNumber);
    setBalanceDataMap(prev => ({ ...prev, [tabKey]: balanceData }));
    setBalanceLoadingMap(prev => ({ ...prev, [tabKey]: false }));
    setOpenTabs((prevTabs) =>
      prevTabs.map((tab) =>
        tab.key === tabKey ? { ...tab, loading: false } : tab
      )
    );
  };

  // Close supplier tab
  const closeSupplierTab = (tabKey: string) => {
    const newTabs = openTabs.filter((tab) => tab.key !== tabKey);
    setOpenTabs(newTabs);

    if (activeTab === tabKey) {
      setActiveTab('search');
    }
  };

  // Handle tab change
  const onTabChange = (key: string) => {
    setActiveTab(key);
  };

  // Handle tab edit (close)
  const onTabEdit = (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
    if (action === 'remove' && typeof targetKey === 'string') {
      closeSupplierTab(targetKey);
    }
  };

  // Search suppliers from API
  const handleSearch = async () => {
    setLoading(true);
    try {
      let proxyUrl: string;
      let mapFunction: (item: any, index: number) => SupplierRecord;

      // Get form values
      const formValues = form.getFieldsValue();
      const supplierNumber = formValues.supplierNumber?.trim();
      const supplierName = formValues.supplier?.trim();
      const businessUnit = formValues.businessUnit?.trim();

      let headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (dataSource === 'fusion') {
        // Fusion API - direct URL
        let queryParams = 'limit=25&onlyData=true';

        // Build query filters
        const filters: string[] = [];
        if (supplierNumber) {
          filters.push(`SupplierNumber=${supplierNumber}`);
        }
        if (supplierName) {
          filters.push(`Supplier LIKE *${supplierName}*`);
        }

        // Add q parameter if filters exist
        if (filters.length > 0) {
          queryParams += `&q=${encodeURIComponent(filters.join(';'))}`;
        }

        proxyUrl = `${ORACLE_FUSION_CONFIG.baseUrl}/suppliers?${queryParams}`;
        headers['Authorization'] = `Basic ${FUSION_AUTH}`;
        mapFunction = mapFusionToSupplierRecord;
      } else {
        // APEX API - build params
        const apexParams = new URLSearchParams();
        if (supplierNumber) apexParams.set('supplier_number', supplierNumber);
        if (supplierName)   apexParams.set('supplier', supplierName);
        if (businessUnit)   apexParams.set('P_BUSINESS_UNIT', businessUnit);
        const qs = apexParams.toString();
        proxyUrl = `${APEX_DB_CONFIG.baseUrl}/suppliers${qs ? '?' + qs : ''}`;
        mapFunction = mapApexToSupplierRecord;
      }

      console.log('Fetching suppliers from:', proxyUrl);

      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('API Response:', data);

      const items = data.items || data || [];

      if (Array.isArray(items) && items.length > 0) {
        const mappedSuppliers = items.slice(0, 25).map(mapFunction);
        setSuppliers(mappedSuppliers);
        message.success(`Found ${mappedSuppliers.length} suppliers from ${dataSource === 'fusion' ? 'Fusion' : 'APEX'}`);
      } else {
        setSuppliers([]);
        message.info('No suppliers found');
      }
    } catch (error) {
      console.error('Search error:', error);
      message.error(`Failed to search suppliers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Reset search form
  const handleReset = () => {
    form.resetFields();
    setSuppliers([]);
  };

  // Table columns
  const columns: ColumnsType<SupplierRecord> = [
    {
      title: 'Supplier',
      dataIndex: 'supplier',
      key: 'supplier',
      width: 250,
      render: (text: string, record: SupplierRecord) => (
        <a
          onClick={() => openSupplierTab(record)}
          style={{ color: REDWOOD.info, fontWeight: 500 }}
        >
          {text}
        </a>
      ),
    },
    {
      title: 'Supplier Number',
      dataIndex: 'supplierNumber',
      key: 'supplierNumber',
      width: 120,
    },
    {
      title: 'Alt Name',
      dataIndex: 'alternateName',
      key: 'alternateName',
      width: 150,
    },
    {
      title: 'Business Relationship',
      dataIndex: 'businessRelationship',
      key: 'businessRelationship',
      width: 150,
    },
    {
      title: 'Parent Supplier',
      dataIndex: 'parentSupplier',
      key: 'parentSupplier',
      width: 150,
    },
    {
      title: 'Creation Date',
      dataIndex: 'creationDate',
      key: 'creationDate',
      width: 120,
    },
    {
      title: 'Inactive Since',
      dataIndex: 'inactiveSince',
      key: 'inactiveSince',
      width: 120,
    },
    {
      title: 'Tax Registration Number',
      dataIndex: 'taxRegistrationNumber',
      key: 'taxRegistrationNumber',
      width: 160,
    },
    {
      title: 'Taxpayer ID',
      dataIndex: 'taxpayerId',
      key: 'taxpayerId',
      width: 120,
    },
    {
      title: 'D-U-N-S Number',
      dataIndex: 'dunsNumber',
      key: 'dunsNumber',
      width: 120,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 130,
      fixed: 'right' as const,
      render: (_: any, record: SupplierRecord) => (
        <Button
          type="primary"
          size="small"
          icon={<DollarOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            openBalanceTab(record);
          }}
          style={{ background: REDWOOD.success }}
        >
          Balance
        </Button>
      ),
    },
  ];

  // Row selection config
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  // Render search tab content
  const renderSearchTab = () => (
    <div style={{ padding: '0 24px 24px' }}>
      {/* Search Form */}
      <Card
        style={{
          marginBottom: 16,
          borderRadius: 8,
          border: `1px solid ${REDWOOD.neutral200}`,
        }}
        bodyStyle={{ padding: 16 }}
      >
        <Collapse
          activeKey={searchCollapsed ? [] : ['1']}
          onChange={() => setSearchCollapsed(!searchCollapsed)}
          bordered={false}
          style={{ background: 'transparent' }}
        >
          <Panel
            header={
              <Space>
                <SearchOutlined />
                <Text strong>Advanced Search</Text>
              </Space>
            }
            key="1"
          >
            <Form form={form} layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Business Unit" name="businessUnit" style={{ marginBottom: 8 }}>
                    <Select
                      placeholder="Select business unit..."
                      allowClear
                      size="small"
                      showSearch
                      filterOption={(input, option) =>
                        String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                      onChange={() => {
                        // Re-run LOV search with new BU if LOV is open
                        if (lovVisible) fetchLovResults(lovSearch);
                      }}
                    >
                      {businessUnits.map(bu => (
                        <Option key={bu} value={bu}>{bu}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Supplier Number" name="supplierNumber" style={{ marginBottom: 8 }}>
                    <Input
                      size="small"
                      placeholder="e.g. A022"
                      suffix={
                        <SearchOutlined
                          style={{ color: REDWOOD.info, cursor: 'pointer' }}
                          onClick={() => openLov(form.getFieldValue('supplierNumber'))}
                        />
                      }
                      onPressEnter={() => openLov(form.getFieldValue('supplierNumber'))}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Supplier" name="supplier" style={{ marginBottom: 8 }}>
                    <Input
                      size="small"
                      placeholder="Type name or click 🔍"
                      suffix={
                        <SearchOutlined
                          style={{ color: REDWOOD.info, cursor: 'pointer' }}
                          onClick={() => openLov(form.getFieldValue('supplier'))}
                        />
                      }
                      onPressEnter={() => openLov(form.getFieldValue('supplier'))}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Supplier Type" name="supplierType" style={{ marginBottom: 8 }}>
                    <Select placeholder="" allowClear size="small">
                      <Option value="">All</Option>
                      <Option value="Vendor">Vendor</Option>
                      <Option value="Contractor">Contractor</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Taxpayer ID" name="taxpayerId" style={{ marginBottom: 8 }}>
                    <Input placeholder="" size="small" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Tax Organization Type" name="taxOrganizationType" style={{ marginBottom: 8 }}>
                    <Select placeholder="" allowClear size="small">
                      <Option value="">All</Option>
                      <Option value="Corporation">Corporation</Option>
                      <Option value="Individual">Individual</Option>
                      <Option value="Partnership">Partnership</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Tax Registration Number" name="taxRegistrationNumber" style={{ marginBottom: 8 }}>
                    <Input placeholder="" size="small" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Business Classification" name="businessClassification" style={{ marginBottom: 8 }}>
                    <Select placeholder="" allowClear size="small">
                      <Option value="">All</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8} />
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Creation Date" name="creationDate" style={{ marginBottom: 8 }}>
                    <RangePicker size="small" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Products and Services" name="productsServices" style={{ marginBottom: 8 }}>
                    <Input placeholder="" size="small" suffix={<SearchOutlined />} />
                  </Form.Item>
                </Col>
                <Col span={8} />
              </Row>
            </Form>
          </Panel>
        </Collapse>

        {/* Action buttons */}
        <Row justify="end" style={{ marginTop: 16 }}>
          <Space>
            <Button icon={<SearchOutlined />} type="primary" onClick={handleSearch} loading={loading}>
              Search
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              Reset
            </Button>
            <Button icon={<SaveOutlined />}>Save...</Button>
            <Button icon={<PlusOutlined />}>Add Fields</Button>
            <Button icon={<SwapOutlined />}>Reorder</Button>
          </Space>
        </Row>
      </Card>

      {/* Data Source Toggle */}
      <Card
        style={{
          marginBottom: 16,
          borderRadius: 8,
          border: `1px solid ${REDWOOD.neutral200}`,
        }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <Row justify="space-between" align="middle">
          <Col>
            <Space size="large">
              <Text strong>Data Source:</Text>
              <Space>
                <CloudOutlined style={{ color: dataSource === 'fusion' ? REDWOOD.info : REDWOOD.neutral600 }} />
                <Text style={{ color: dataSource === 'fusion' ? REDWOOD.info : REDWOOD.neutral600 }}>Fusion</Text>
                <Switch
                  checked={dataSource === 'apex'}
                  onChange={(checked) => {
                    setDataSource(checked ? 'apex' : 'fusion');
                    setSuppliers([]);
                  }}
                  style={{ margin: '0 8px' }}
                />
                <DatabaseOutlined style={{ color: dataSource === 'apex' ? REDWOOD.success : REDWOOD.neutral600 }} />
                <Text style={{ color: dataSource === 'apex' ? REDWOOD.success : REDWOOD.neutral600 }}>APEX</Text>
              </Space>
            </Space>
          </Col>
          <Col>
            <Text type="secondary">
              {dataSource === 'fusion' ? 'Fetching live data from Oracle Fusion' : 'Fetching synced data from APEX database'}
            </Text>
          </Col>
        </Row>
      </Card>

      {/* Search Results */}
      <Card
        title={
          <Space>
            <Text strong>Search Results</Text>
            {suppliers.length > 0 && (
              <Text type="secondary">({suppliers.length} records)</Text>
            )}
          </Space>
        }
        style={{
          borderRadius: 8,
          border: `1px solid ${REDWOOD.neutral200}`,
        }}
        extra={
          <Space>
            <Button size="small" icon={<PlusOutlined />} type="primary">
              Register Supplier
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={suppliers}
          rowSelection={rowSelection}
          loading={loading}
          scroll={{ x: 1550 }}
          pagination={{
            pageSize: 25,
            showSizeChanger: true,
            showTotal: (total) => `${total} suppliers`,
          }}
          size="small"
          onRow={(record) => ({
            onDoubleClick: () => openSupplierTab(record),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
    </div>
  );

  // Render supplier detail tab content
  const renderSupplierDetailTab = (tab: SupplierTab) => {
    if (tab.loading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
          <Spin size="large" tip="Loading supplier details..." />
        </div>
      );
    }

    const detail = tab.detail || tab.supplier;

    return (
      <div style={{ padding: '0 24px 24px' }}>
        {/* Header */}
        <Card
          style={{
            marginBottom: 16,
            borderRadius: 8,
            border: `1px solid ${REDWOOD.neutral200}`,
          }}
          bodyStyle={{ padding: '16px 24px' }}
        >
          <Row justify="space-between" align="middle">
            <Col>
              <Space>
                <Title level={4} style={{ margin: 0 }}>
                  Edit Supplier: {detail.supplier}
                </Title>
                <StarOutlined style={{ color: REDWOOD.warning }} />
              </Space>
            </Col>
            <Col>
              <Space>
                <Button type="primary" style={{ background: REDWOOD.primary }}>Save</Button>
                <Button type="primary" style={{ background: REDWOOD.info }}>Save and Close</Button>
                <Button onClick={() => closeSupplierTab(tab.key)}>Cancel</Button>
                <Text type="secondary" style={{ marginLeft: 16 }}>
                  Last Saved: {new Date().toLocaleString()}
                </Text>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* Supplier Detail Tabs */}
        <Card
          style={{
            borderRadius: 8,
            border: `1px solid ${REDWOOD.neutral200}`,
          }}
        >
          <Tabs
            defaultActiveKey="profile"
            items={[
              {
                key: 'profile',
                label: (
                  <Space>
                    <UserOutlined />
                    Profile
                  </Space>
                ),
                children: renderProfileTab(detail as SupplierDetail),
              },
              {
                key: 'addresses',
                label: (
                  <Space>
                    <EnvironmentOutlined />
                    Addresses
                  </Space>
                ),
                children: <div style={{ padding: 24 }}><Text type="secondary">Addresses tab content</Text></div>,
              },
              {
                key: 'sites',
                label: (
                  <Space>
                    <BankOutlined />
                    Sites
                  </Space>
                ),
                children: <div style={{ padding: 24 }}><Text type="secondary">Sites tab content</Text></div>,
              },
              {
                key: 'contacts',
                label: (
                  <Space>
                    <ContactsOutlined />
                    Contacts
                  </Space>
                ),
                children: <div style={{ padding: 24 }}><Text type="secondary">Contacts tab content</Text></div>,
              },
              {
                key: 'qualifications',
                label: (
                  <Space>
                    <SafetyCertificateOutlined />
                    Qualifications
                  </Space>
                ),
                children: <div style={{ padding: 24 }}><Text type="secondary">Qualifications tab content</Text></div>,
              },
            ]}
          />
        </Card>
      </div>
    );
  };

  // Render Profile tab content
  const renderProfileTab = (detail: SupplierDetail) => (
    <div>
      {/* General Section */}
      <Collapse defaultActiveKey={['general']} bordered={false}>
        <Panel header={<Text strong>General</Text>} key="general">
          <Row gutter={24}>
            <Col span={12}>
              <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
                <Form.Item label="Supplier" required style={{ marginBottom: 6 }}>
                  <Input value={detail.supplier} size="small" />
                </Form.Item>
                <Form.Item label="Supplier Number" style={{ marginBottom: 6 }}>
                  <Text>{detail.supplierNumber}</Text>
                </Form.Item>
                <Form.Item label="Alternate Name" style={{ marginBottom: 6 }}>
                  <Input value={detail.alternateName} size="small" />
                </Form.Item>
                <Form.Item label="Tax Organization Type" style={{ marginBottom: 6 }}>
                  <Select value={detail.taxOrganizationType || 'Corporation'} style={{ width: '100%' }} size="small">
                    <Option value="Corporation">Corporation</Option>
                    <Option value="Individual">Individual</Option>
                    <Option value="Partnership">Partnership</Option>
                  </Select>
                </Form.Item>
                <Form.Item label="Supplier Type" style={{ marginBottom: 6 }}>
                  <Select value={detail.supplierType} style={{ width: '100%' }} allowClear size="small">
                    <Option value="Vendor">Vendor</Option>
                    <Option value="Contractor">Contractor</Option>
                  </Select>
                </Form.Item>
                <Form.Item label="Inactive Date" style={{ marginBottom: 6 }}>
                  <DatePicker style={{ width: '100%' }} placeholder="dd-mmm-yyyy" size="small" />
                </Form.Item>
                <Form.Item label="Status" style={{ marginBottom: 6 }}>
                  <Text>{detail.status}</Text>
                </Form.Item>
              </Form>
            </Col>
            <Col span={12}>
              <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
                <Form.Item label="Business Relationship" style={{ marginBottom: 6 }}>
                  <Text>{detail.businessRelationship}</Text>
                </Form.Item>
                <Form.Item label="Parent Supplier" style={{ marginBottom: 6 }}>
                  <Input suffix={<SearchOutlined />} size="small" />
                </Form.Item>
                <Form.Item label="Parent Supplier Number" style={{ marginBottom: 6 }}>
                  <Text>{detail.parentSupplierNumber}</Text>
                </Form.Item>
                <Form.Item label="Creation Date" style={{ marginBottom: 6 }}>
                  <Text>{detail.creationDate}</Text>
                </Form.Item>
                <Form.Item label="Creation Source" style={{ marginBottom: 6 }}>
                  <Text>{detail.creationSource || 'Import'}</Text>
                </Form.Item>
                <Form.Item label="Registration Request" style={{ marginBottom: 6 }}>
                  <Text>{detail.registrationRequest}</Text>
                </Form.Item>
                <Form.Item label="Attachments" style={{ marginBottom: 6 }}>
                  <Button type="link" style={{ padding: 0 }} size="small">None +</Button>
                </Form.Item>
              </Form>
            </Col>
          </Row>
        </Panel>
      </Collapse>

      <Divider style={{ margin: '16px 0' }} />

      {/* Profile Details Section */}
      <Title level={5}>Profile Details</Title>
      <Tabs
        defaultActiveKey="organization"
        size="small"
        items={[
          {
            key: 'organization',
            label: 'Organization',
            children: renderOrganizationTab(detail),
          },
          {
            key: 'businessClassifications',
            label: 'Business Classifications',
            children: <div style={{ padding: 16 }}><Text type="secondary">Business Classifications content</Text></div>,
          },
          {
            key: 'productsServices',
            label: 'Products and Services',
            children: <div style={{ padding: 16 }}><Text type="secondary">Products and Services content</Text></div>,
          },
          {
            key: 'transactionTax',
            label: 'Transaction Tax',
            children: <div style={{ padding: 16 }}><Text type="secondary">Transaction Tax content</Text></div>,
          },
          {
            key: 'incomeTax',
            label: 'Income Tax',
            children: <div style={{ padding: 16 }}><Text type="secondary">Income Tax content</Text></div>,
          },
          {
            key: 'payments',
            label: 'Payments',
            children: <div style={{ padding: 16 }}><Text type="secondary">Payments content</Text></div>,
          },
        ]}
      />
    </div>
  );

  // Render Organization sub-tab
  const renderOrganizationTab = (detail: SupplierDetail) => (
    <div>
      {/* Identification */}
      <Collapse defaultActiveKey={['identification', 'corporate', 'financial']} bordered={false}>
        <Panel header={<Text strong>Identification</Text>} key="identification">
          <Row gutter={24}>
            <Col span={12}>
              <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
                <Form.Item label="Alias" style={{ marginBottom: 6 }}>
                  <Input value={detail.alias} size="small" />
                </Form.Item>
                <Form.Item label="D-U-N-S Number" style={{ marginBottom: 6 }}>
                  <Input value={detail.dunsNumber} size="small" />
                </Form.Item>
                <Form.Item label=" " colon={false} style={{ marginBottom: 6 }}>
                  <Checkbox checked={detail.oneTimeSupplier}>One-time supplier</Checkbox>
                </Form.Item>
                <Form.Item label="Registry ID" style={{ marginBottom: 6 }}>
                  <Text>{detail.registryId}</Text>
                </Form.Item>
                <Form.Item label="Relationships" style={{ marginBottom: 6 }}>
                  <Text>{detail.relationships}</Text>
                </Form.Item>
              </Form>
            </Col>
            <Col span={12}>
              <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
                <Form.Item label="Customer Number" style={{ marginBottom: 6 }}>
                  <Input value={detail.customerNumber} size="small" />
                </Form.Item>
                <Form.Item label="SIC" style={{ marginBottom: 6 }}>
                  <Input value={detail.sic} size="small" />
                </Form.Item>
                <Form.Item label="National Insurance Number" style={{ marginBottom: 6 }}>
                  <Input value={detail.nationalInsuranceNumber} size="small" />
                </Form.Item>
                <Form.Item label="Corporate Web Site" style={{ marginBottom: 6 }}>
                  <Input value={detail.corporateWebSite} size="small" />
                </Form.Item>
              </Form>
            </Col>
          </Row>
        </Panel>

        <Panel header={<Text strong>Regional Information</Text>} key="regional">
          <Form layout="horizontal" labelCol={{ span: 5 }} wrapperCol={{ span: 19 }} size="small">
            <Form.Item label="Regional Information" style={{ marginBottom: 6 }}>
              <Select style={{ width: 300 }} allowClear size="small">
                <Option value="">Select...</Option>
              </Select>
            </Form.Item>
          </Form>
        </Panel>

        <Panel header={<Text strong>Corporate Profile</Text>} key="corporate">
          <Row gutter={24}>
            <Col span={12}>
              <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
                <Form.Item label="Year Established" style={{ marginBottom: 6 }}>
                  <Input value={detail.yearEstablished} size="small" />
                </Form.Item>
                <Form.Item label="Mission Statement" style={{ marginBottom: 6 }}>
                  <Input.TextArea value={detail.missionStatement} rows={2} size="small" />
                </Form.Item>
                <Form.Item label="Year Incorporated" style={{ marginBottom: 6 }}>
                  <Input value={detail.yearIncorporated} size="small" />
                </Form.Item>
              </Form>
            </Col>
            <Col span={12}>
              <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
                <Form.Item label="Chief Executive Title" style={{ marginBottom: 6 }}>
                  <Input value={detail.chiefExecutiveTitle} size="small" />
                </Form.Item>
                <Form.Item label="Chief Executive Name" style={{ marginBottom: 6 }}>
                  <Input value={detail.chiefExecutiveName} size="small" />
                </Form.Item>
                <Form.Item label="Principal Title" style={{ marginBottom: 6 }}>
                  <Input value={detail.principalTitle} size="small" />
                </Form.Item>
                <Form.Item label="Principal Name" style={{ marginBottom: 6 }}>
                  <Input value={detail.principalName} size="small" />
                </Form.Item>
              </Form>
            </Col>
          </Row>
        </Panel>

        <Panel header={<Text strong>Financial Profile</Text>} key="financial">
          <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} style={{ maxWidth: 600 }} size="small">
            <Form.Item label="Fiscal Year End Month" style={{ marginBottom: 6 }}>
              <Select style={{ width: 200 }} value={detail.fiscalYearEndMonth} allowClear size="small">
                <Option value="January">January</Option>
                <Option value="February">February</Option>
                <Option value="March">March</Option>
                <Option value="December">December</Option>
              </Select>
            </Form.Item>
            <Form.Item label="Current Fiscal Year's Potential Revenue" style={{ marginBottom: 6 }}>
              <Input value={detail.currentFiscalYearRevenue} size="small" />
            </Form.Item>
            <Form.Item label="Preferred Functional Currency" style={{ marginBottom: 6 }}>
              <Select style={{ width: 200 }} value={detail.preferredFunctionalCurrency} allowClear size="small">
                <Option value="AED">AED</Option>
                <Option value="USD">USD</Option>
                <Option value="EUR">EUR</Option>
              </Select>
            </Form.Item>
          </Form>
        </Panel>
      </Collapse>
    </div>
  );

  // Format currency helper
  const formatCurrency = (amount: number, currency: string = 'AED'): string => {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Get aging color helper
  const getAgingColor = (bucket: string): string => {
    switch (bucket) {
      case 'Current': return REDWOOD.success;
      case '1-30 Days': return REDWOOD.info;
      case '31-60 Days': return REDWOOD.warning;
      case '61-90 Days': return '#FF8C00';
      case '91-120 Days': return REDWOOD.primary;
      case '120+ Days': return REDWOOD.error;
      default: return REDWOOD.neutral600;
    }
  };

  // Export invoices for a tab to Excel
  const exportInvoicesToExcel = async (tabKey: string, supplierNumber: string, rows: InvoiceRecord[]) => {
    if (!rows.length) { message.warning('No data to export'); return; }
    const exportRows = rows.map(r => ({
      'Invoice Number':   r.invoiceNumber,
      'Invoice Date':     r.invoiceDate,
      'Invoice Amount':   r.invoiceAmount,
      'Amount Paid':      r.amountPaid,
      'Balance Due':      r.amountRemaining,
      'Currency':         r.currency,
      'Status':           r.invoiceStatus,
      'Description':      r.description,
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    ws['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 60 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Invoices`);
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const filename = `Invoices_${supplierNumber}.xlsx`;
    const eAPI = (window as any).electronAPI;
    if (eAPI?.openExcel) {
      await eAPI.openExcel(buf, filename);
      message.success('Excel opened');
    } else {
      saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
      message.success('Exported to Excel');
    }
  };


  // Render supplier balance tab content
  const renderSupplierBalanceTab = (tab: SupplierTab) => {
    const tabKey = tab.key;
    const balanceData = balanceDataMap[tabKey];
    const invoices = invoicesMap[tabKey] || [];
    const payments = paymentsMap[tabKey] || [];
    const isLoading = balanceLoadingMap[tabKey];
    const invoicesLoading = invoicesLoadingMap[tabKey];
    const paymentsLoading = paymentsLoadingMap[tabKey];

    if (tab.loading || isLoading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
          <Spin size="large" tip="Loading supplier balance..." />
        </div>
      );
    }

    if (!balanceData) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
          <Text type="secondary">Failed to load balance data</Text>
        </div>
      );
    }

    const { supplier, balanceSummary, agingReport } = balanceData;

    // Payment columns
    const paymentColumns = [
      {
        title: 'Payment Number', dataIndex: 'paymentNumber', key: 'paymentNumber', width: 150,
        render: (text: string, record: PaymentRecord) => (
          <a onClick={() => fetchPaymentDrilldown(record)} style={{ color: REDWOOD.info }}>{text}</a>
        )
      },
      { title: 'Payment Date', dataIndex: 'paymentDate', key: 'paymentDate', width: 110 },
      {
        title: 'Amount', dataIndex: 'paymentAmount', key: 'paymentAmount', width: 140, align: 'right' as const,
        render: (amt: number) => <Text strong style={{ color: REDWOOD.success }}>{formatCurrency(amt)}</Text>
      },
      {
        title: 'Status', dataIndex: 'paymentStatus', key: 'paymentStatus', width: 100,
        render: (status: string) => <Tag color={status === 'NEGOTIABLE' ? 'green' : 'default'}>{status}</Tag>
      },
      { title: 'Method', dataIndex: 'paymentMethod', key: 'paymentMethod', width: 100 },
      { title: 'Bank Account', dataIndex: 'bankAccountName', key: 'bankAccountName', ellipsis: true },
    ];

    // Handle balance tab change to lazy load data
    const handleBalanceTabChange = (key: string) => {
      if (key === 'invoices' && invoices.length === 0 && !invoicesLoading) {
        fetchBalanceInvoices(tab.supplier.supplierNumber, tabKey);
      } else if (key === 'payments' && payments.length === 0 && !paymentsLoading) {
        fetchBalancePayments(tab.supplier.supplierNumber, tabKey);
      }
    };

    return (
      <div style={{ padding: '0 24px 24px' }}>
        {/* Supplier Header */}
        <Card style={{ marginBottom: 16, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
          <Row gutter={24} align="middle">
            <Col span={16}>
              <Row align="middle" gutter={16}>
                <Col>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: REDWOOD.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UserOutlined style={{ fontSize: 24, color: '#fff' }} />
                  </div>
                </Col>
                <Col>
                  <Title level={4} style={{ margin: 0 }}>{supplier.supplierName}</Title>
                  <Space>
                    <Tag color={REDWOOD.info}>{supplier.supplierNumber}</Tag>
                    <Tag color={supplier.status === 'Active' ? REDWOOD.success : REDWOOD.error}>{supplier.status}</Tag>
                    {supplier.supplierType && <Tag>{supplier.supplierType}</Tag>}
                  </Space>
                </Col>
              </Row>
              {supplier.address && (
                <>
                  <Divider style={{ margin: '12px 0' }} />
                  <Space>
                    <EnvironmentOutlined style={{ color: REDWOOD.neutral600 }} />
                    <Text type="secondary">
                      {[supplier.address.addressLine1, supplier.address.city, supplier.address.country].filter(Boolean).join(', ')}
                    </Text>
                  </Space>
                </>
              )}
            </Col>
            <Col span={8}>
              <Card style={{ background: balanceSummary.balance > 0 ? '#fff2f0' : '#f6ffed', borderColor: balanceSummary.balance > 0 ? REDWOOD.error : REDWOOD.success }}>
                <Statistic
                  title={<Text strong>Outstanding Balance</Text>}
                  value={balanceSummary.balance}
                  precision={2}
                  prefix={balanceSummary.currency}
                  valueStyle={{ color: balanceSummary.balance > 0 ? REDWOOD.error : REDWOOD.success, fontSize: 24 }}
                />
              </Card>
            </Col>
          </Row>
        </Card>

        {/* Balance Tabs */}
        <Card style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}>
          <Tabs
            defaultActiveKey="summary"
            onChange={handleBalanceTabChange}
            items={[
              {
                key: 'summary',
                label: <Space><DollarOutlined />Balance Summary</Space>,
                children: (
                  <div>
                    {/* Summary Cards */}
                    <Row gutter={16} style={{ marginBottom: 24 }}>
                      <Col span={6}>
                        <Card size="small">
                          <Statistic title="Total Invoices" value={balanceSummary.totalInvoices} prefix={<FileTextOutlined style={{ color: REDWOOD.info }} />} />
                        </Card>
                      </Col>
                      <Col span={6}>
                        <Card size="small">
                          <Statistic title="Invoice Amount" value={balanceSummary.totalInvoiceAmount} precision={2} suffix={balanceSummary.currency} valueStyle={{ fontSize: 18 }} />
                        </Card>
                      </Col>
                      <Col span={6}>
                        <Card size="small">
                          <Statistic title="Total Payments" value={balanceSummary.totalPayments} prefix={<CreditCardOutlined style={{ color: REDWOOD.success }} />} />
                        </Card>
                      </Col>
                      <Col span={6}>
                        <Card size="small">
                          <Statistic title="Paid Amount" value={balanceSummary.totalPaymentAmount} precision={2} suffix={balanceSummary.currency} valueStyle={{ color: REDWOOD.success, fontSize: 18 }} />
                        </Card>
                      </Col>
                    </Row>

                    {/* Aging Report */}
                    <Card title={<Space><ExclamationCircleOutlined style={{ color: REDWOOD.warning }} /><Text strong>Aging Report</Text></Space>} size="small" style={{ marginBottom: 16 }}>
                      <Row gutter={12}>
                        {agingReport.map((bucket, index) => (
                          <Col span={4} key={index}>
                            <Card size="small" style={{ borderTop: `3px solid ${getAgingColor(bucket.bucket)}`, textAlign: 'center' }}>
                              <Text type="secondary" style={{ fontSize: 11 }}>{bucket.bucket}</Text>
                              <div style={{ margin: '8px 0' }}>
                                <Text strong style={{ fontSize: 16, color: getAgingColor(bucket.bucket) }}>{formatCurrency(bucket.amount)}</Text>
                              </div>
                              <Tag style={{ fontSize: 10 }}>{bucket.invoiceCount} inv</Tag>
                              <Progress percent={bucket.percentage} size="small" strokeColor={getAgingColor(bucket.bucket)} showInfo={false} style={{ marginTop: 8 }} />
                              <Text type="secondary" style={{ fontSize: 10 }}>{bucket.percentage.toFixed(1)}%</Text>
                            </Card>
                          </Col>
                        ))}
                      </Row>
                    </Card>

                    {/* Balance Calculation */}
                    <Card title="Balance Calculation" size="small">
                      <Descriptions column={1} bordered size="small">
                        <Descriptions.Item label="Total Invoice Amount"><Text strong>{formatCurrency(balanceSummary.totalInvoiceAmount)}</Text></Descriptions.Item>
                        <Descriptions.Item label="Total Payment Amount"><Text style={{ color: REDWOOD.success }}>- {formatCurrency(balanceSummary.totalPaymentAmount)}</Text></Descriptions.Item>
                        <Descriptions.Item label="Outstanding Balance">
                          <Text strong style={{ fontSize: 16, color: balanceSummary.balance > 0 ? REDWOOD.error : REDWOOD.success }}>= {formatCurrency(balanceSummary.balance)}</Text>
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>
                  </div>
                ),
              },
              {
                key: 'invoices',
                label: <Space><FileTextOutlined />Invoices ({invoices.length})</Space>,
                children: (
                  <InvoicesTabContent
                    invoices={invoices}
                    invoicesLoading={!!invoicesLoading}
                    supplierNumber={tab.supplier.supplierNumber}
                    onExport={rows => exportInvoicesToExcel(tabKey, tab.supplier.supplierNumber, rows)}
                    onRefresh={() => fetchBalanceInvoices(tab.supplier.supplierNumber, tabKey)}
                    onEdit={record => { setEditInvoice({ ...record }); setEditInvoiceVisible(true); }}
                  />
                ),
              },
              {
                key: 'payments',
                label: <Space><CreditCardOutlined />Payments ({payments.length})</Space>,
                children: (
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <Button icon={<ReloadOutlined />} onClick={() => fetchBalancePayments(tab.supplier.supplierNumber, tabKey)} loading={paymentsLoading}>Refresh</Button>
                      <Text type="secondary" style={{ marginLeft: 16 }}>Click payment number to view related invoices</Text>
                    </div>
                    <Table columns={paymentColumns} dataSource={payments} loading={paymentsLoading} scroll={{ x: 800 }} pagination={{ pageSize: 10, showTotal: (total) => `${total} payments` }} size="small" />
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </div>
    );
  };

  // Build tab items
  const tabItems = [
    {
      key: 'search',
      label: (
        <Space>
          <SearchOutlined />
          Manage Suppliers
        </Space>
      ),
      children: renderSearchTab(),
      closable: false,
    },
    ...openTabs.map((tab) => ({
      key: tab.key,
      label: (
        <Space>
          {tab.tabType === 'balance' ? <DollarOutlined style={{ color: REDWOOD.success }} /> : <UserOutlined />}
          <Text>{tab.tabType === 'balance' ? 'Balance: ' : 'Supplier: '}{tab.label}</Text>
        </Space>
      ),
      children: tab.tabType === 'balance' ? renderSupplierBalanceTab(tab) : renderSupplierDetailTab(tab),
      closable: true,
    })),
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb */}
        <div style={{ padding: '16px 24px', background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <Breadcrumb>
            <Breadcrumb.Item>
              <Link to="/home">
                <HomeOutlined /> Home
              </Link>
            </Breadcrumb.Item>
            <Breadcrumb.Item>
              <Link to="/ap">Payables</Link>
            </Breadcrumb.Item>
            <Breadcrumb.Item>Suppliers</Breadcrumb.Item>
          </Breadcrumb>
        </div>

        {/* Page Title */}
        <div style={{ padding: '16px 24px', background: REDWOOD.surface }}>
          <Row justify="space-between" align="middle">
            <Col>
              <Title level={3} style={{ margin: 0 }}>
                Manage Suppliers
              </Title>
            </Col>
            <Col>
              <Space>
                <Tooltip title="View API Endpoints">
                  <Button
                    type="text"
                    icon={<ApiOutlined />}
                    onClick={() => setApiModalVisible(true)}
                    style={{ color: REDWOOD.info }}
                  >
                    API
                  </Button>
                </Tooltip>
                <Button type="text" style={{ color: REDWOOD.info }}>Done</Button>
              </Space>
            </Col>
          </Row>
        </div>

        {/* Tabs */}
        <Tabs
          type="editable-card"
          activeKey={activeTab}
          onChange={onTabChange}
          onEdit={onTabEdit}
          hideAdd
          items={tabItems}
          style={{ background: REDWOOD.surface }}
          tabBarStyle={{
            padding: '0 24px',
            marginBottom: 0,
            borderBottom: `1px solid ${REDWOOD.neutral200}`,
          }}
        />

        {/* Supplier LOV Modal */}
        <Modal
          title={<Space><SearchOutlined style={{ color: REDWOOD.info }} /><span>Supplier List of Values</span></Space>}
          open={lovVisible}
          onCancel={() => setLovVisible(false)}
          footer={null}
          width={680}
          destroyOnClose
        >
          <Input
            placeholder="Search by supplier number or name..."
            prefix={<SearchOutlined />}
            value={lovSearch}
            onChange={e => { setLovSearch(e.target.value); fetchLovResults(e.target.value); }}
            allowClear
            autoFocus
            style={{ marginBottom: 12 }}
          />
          <Table
            size="small"
            loading={lovLoading}
            dataSource={lovResults.map((r, i) => ({ ...r, key: i }))}
            pagination={{ pageSize: 10, showTotal: t => `${t} suppliers`, size: 'small' }}
            locale={{ emptyText: 'Type to search suppliers' }}
            onRow={row => ({
              onClick: () => onLovPick(row),
              style: { cursor: 'pointer' },
            })}
            columns={[
              { title: 'Supplier Number', dataIndex: 'supplierNumber', key: 'supplierNumber', width: 160,
                render: (v: string) => <Text style={{ color: REDWOOD.info, fontWeight: 500 }}>{v}</Text> },
              { title: 'Supplier Name', dataIndex: 'supplier', key: 'supplier' },
            ]}
          />
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Click a row to select</Text>
          </div>
        </Modal>

        {/* API Info Modal */}
        <Modal
          title={
            <Space>
              <ApiOutlined style={{ color: REDWOOD.info }} />
              <span>API Endpoints - Manage Suppliers</span>
            </Space>
          }
          open={apiModalVisible}
          onCancel={() => setApiModalVisible(false)}
          footer={[
            <Button key="close" onClick={() => setApiModalVisible(false)}>
              Close
            </Button>,
          ]}
          width={900}
        >
          <div style={{ marginBottom: 16 }}>
            <Tag color="blue" style={{ marginRight: 8 }}>
              Current Mode: {dataSource === 'fusion' ? 'Fusion' : 'APEX'}
            </Tag>
            <Text type="secondary">
              Switch between Fusion and APEX using the toggle on the search page
            </Text>
          </div>

          {/* Fusion APIs */}
          <Card
            size="small"
            title={
              <Space>
                <CloudOutlined style={{ color: REDWOOD.info }} />
                <Text strong>Fusion APIs</Text>
                <Tag color={dataSource === 'fusion' ? 'green' : 'default'}>
                  {dataSource === 'fusion' ? 'Active' : 'Inactive'}
                </Tag>
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            {PAGE_APIS.fusion.map((api, index) => (
              <div
                key={index}
                style={{
                  padding: '12px',
                  background: REDWOOD.neutral100,
                  borderRadius: 6,
                  marginBottom: index < PAGE_APIS.fusion.length - 1 ? 12 : 0,
                }}
              >
                <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
                  <Col>
                    <Space>
                      <Tag color="blue">{api.method}</Tag>
                      <Text strong>{api.name}</Text>
                    </Space>
                  </Col>
                </Row>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  {api.description}
                </Text>
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Proxy URL:</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code
                      style={{
                        background: '#f5f5f5',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {api.proxyUrl}{api.params ? `?${api.params}` : ''}
                    </code>
                    <Button
                      type="text"
                      size="small"
                      icon={copiedUrl === api.proxyUrl ? <CheckOutlined /> : <CopyOutlined />}
                      onClick={() => copyToClipboard(api.proxyUrl + (api.params ? `?${api.params}` : ''))}
                    />
                  </div>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Actual URL:</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code
                      style={{
                        background: '#e6f7ff',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {api.actualUrl}{api.params ? `?${api.params}` : ''}
                    </code>
                    <Button
                      type="text"
                      size="small"
                      icon={copiedUrl === api.actualUrl ? <CheckOutlined /> : <CopyOutlined />}
                      onClick={() => copyToClipboard(api.actualUrl + (api.params ? `?${api.params}` : ''))}
                    />
                  </div>
                </div>
              </div>
            ))}
          </Card>

          {/* APEX APIs */}
          <Card
            size="small"
            title={
              <Space>
                <DatabaseOutlined style={{ color: REDWOOD.success }} />
                <Text strong>APEX APIs</Text>
                <Tag color={dataSource === 'apex' ? 'green' : 'default'}>
                  {dataSource === 'apex' ? 'Active' : 'Inactive'}
                </Tag>
              </Space>
            }
          >
            {PAGE_APIS.apex.map((api, index) => (
              <div
                key={index}
                style={{
                  padding: '12px',
                  background: REDWOOD.neutral100,
                  borderRadius: 6,
                  marginBottom: index < PAGE_APIS.apex.length - 1 ? 12 : 0,
                }}
              >
                <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
                  <Col>
                    <Space>
                      <Tag color="green">{api.method}</Tag>
                      <Text strong>{api.name}</Text>
                    </Space>
                  </Col>
                </Row>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  {api.description}
                </Text>
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Proxy URL:</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code
                      style={{
                        background: '#f5f5f5',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {api.proxyUrl}
                    </code>
                    <Button
                      type="text"
                      size="small"
                      icon={copiedUrl === api.proxyUrl ? <CheckOutlined /> : <CopyOutlined />}
                      onClick={() => copyToClipboard(api.proxyUrl)}
                    />
                  </div>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Actual URL:</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code
                      style={{
                        background: '#f6ffed',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {api.actualUrl}
                    </code>
                    <Button
                      type="text"
                      size="small"
                      icon={copiedUrl === api.actualUrl ? <CheckOutlined /> : <CopyOutlined />}
                      onClick={() => copyToClipboard(api.actualUrl)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </Modal>

        {/* Payment Drilldown Modal */}
        <Modal
          title={
            <Space>
              <CreditCardOutlined style={{ color: REDWOOD.success }} />
              <span>Payment: {drilldownPayment?.paymentNumber}</span>
            </Space>
          }
          open={drilldownVisible}
          onCancel={() => {
            setDrilldownVisible(false);
            setDrilldownPayment(null);
            setRelatedInvoices([]);
          }}
          footer={[
            <Button key="close" onClick={() => setDrilldownVisible(false)}>Close</Button>,
          ]}
          width={800}
        >
          {drilldownPayment && (
            <div style={{ marginBottom: 16 }}>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="Payment Number">{drilldownPayment.paymentNumber}</Descriptions.Item>
                <Descriptions.Item label="Payment Date">{drilldownPayment.paymentDate}</Descriptions.Item>
                <Descriptions.Item label="Amount">
                  <Text strong style={{ color: REDWOOD.success }}>{formatCurrency(drilldownPayment.paymentAmount, drilldownPayment.currency)}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Status"><Tag>{drilldownPayment.paymentStatus}</Tag></Descriptions.Item>
                <Descriptions.Item label="Method">{drilldownPayment.paymentMethod}</Descriptions.Item>
                <Descriptions.Item label="Bank Account">{drilldownPayment.bankAccountName}</Descriptions.Item>
              </Descriptions>
            </div>
          )}

          <Card title="Related Invoices" size="small">
            <Table
              columns={[
                { title: 'Invoice Number', dataIndex: 'invoiceNumber', key: 'invoiceNumber', width: 150 },
                { title: 'Invoice Amount', dataIndex: 'invoiceAmount', key: 'invoiceAmount', width: 140, align: 'right' as const, render: (amt: number) => formatCurrency(amt) },
                { title: 'Amount Applied', dataIndex: 'amountApplied', key: 'amountApplied', width: 140, align: 'right' as const, render: (amt: number) => <Text style={{ color: REDWOOD.success }}>{formatCurrency(amt)}</Text> },
              ]}
              dataSource={relatedInvoices}
              loading={drilldownLoading}
              pagination={false}
              size="small"
              locale={{ emptyText: 'No related invoices found' }}
            />
          </Card>
        </Modal>
        {/* Edit Invoice Modal — full InvoiceDetail (header + lines) */}
        <Modal
          title={
            <Space>
              <EditOutlined style={{ color: REDWOOD.info }} />
              <span>Invoice: {editInvoice?.invoiceNumber}</span>
            </Space>
          }
          open={editInvoiceVisible}
          onCancel={() => { setEditInvoiceVisible(false); setEditInvoice(null); }}
          footer={null}
          width="95vw"
          style={{ top: 20 }}
          styles={{ body: { padding: 0, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' } }}
          destroyOnClose
        >
          {editInvoice && (() => {
            // Find the supplier name from the active balance tab
            const activeBalanceTab = openTabs.find(t => t.tabType === 'balance' && t.key === activeTab);
            const supplierName = activeBalanceTab
              ? balanceDataMap[activeBalanceTab.key]?.supplier?.supplierName || activeBalanceTab.supplier.supplier
              : '';
            return (
              <InvoiceDetail
                invoice={{
                  invoiceId: editInvoice.invoiceId,
                  invoiceNumber: editInvoice.invoiceNumber,
                  invoiceDate: editInvoice.invoiceDate,
                  invoiceType: 'Standard',
                  supplierOrParty: supplierName,
                  supplierSite: '',
                  invoiceAmount: editInvoice.invoiceAmount,
                  unpaidAmount: editInvoice.amountRemaining,
                  appliedPrepayments: 0,
                  invoiceCurrency: editInvoice.currency,
                  businessUnit: '',
                  validationStatus: editInvoice.invoiceStatus || 'Never validated',
                  approvalStatus: '',
                  holdPaidStatus: editInvoice.amountRemaining <= 0 ? 'Paid' : 'Not paid',
                  notes: editInvoice.description,
                  syncStatus: 'SYNCED',
                }}
                onClose={() => { setEditInvoiceVisible(false); setEditInvoice(null); }}
              />
            );
          })()}
        </Modal>

        <FloatingMenu />
        <Autopilot module="ap" />
      </Content>
    </Layout>
  );
};

export default ManageSuppliers;
