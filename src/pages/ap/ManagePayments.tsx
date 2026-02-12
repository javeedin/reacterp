import React, { useState } from 'react';
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
  Tag,
  Row,
  Col,
  Breadcrumb,
  Tooltip,
  Dropdown,
  Collapse,
  message,
  DatePicker,
  Tabs,
  Modal,
  Switch,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  HomeOutlined,
  SearchOutlined,
  ReloadOutlined,
  SaveOutlined,
  EditOutlined,
  DownOutlined,
  ExportOutlined,
  PrinterOutlined,
  FilterOutlined,
  DownloadOutlined,
  PaperClipOutlined,
  FileTextOutlined,
  DollarOutlined,
  SettingOutlined,
  ScissorOutlined,
  PlusOutlined,
  ApiOutlined,
  CopyOutlined,
  CheckOutlined,
  CloudOutlined,
  DatabaseOutlined,
  SwapOutlined,
  BugOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import PaymentDetail from './PaymentDetail';
import { ORACLE_FUSION_CONFIG, APEX_DB_CONFIG } from '../../config/api.config';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

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
  reportGreen: '#1D7B4D',
};

// Payment record interface
interface PaymentRecord {
  key: string;
  checkId: number;
  paymentId: number;
  paymentNumber: number;
  paymentDocument: string;
  paymentStatus: string;
  reconciled: boolean;
  payee: string;
  paymentDate: string;
  paymentAmount: number;
  paymentCurrency: string;
  remitToAddress: string;
  remitToAccountNumber: string;
  businessUnit: string;
  legalEntity: string;
  paymentMethod: string;
  accountingStatus: string;
  paymentType: string;
  supplierNumber: string;
  payeeSite: string;
  disbursementBankAccount: string;
  paymentProcessProfile: string;
  voucherNumber: number;
  documentCategory: string;
  documentSequence: string;
  // Additional fields for detail view
  withheldAmount: number | null;
  paymentReference: number;
  paymentFileReference: number;
  paymentProcessRequest: string;
  clearingDate: string | null;
  clearingAmount: number | null;
  clearingLedgerAmount: number | null;
  clearingValueDate: string | null;
  clearingConversionRate: number | null;
  clearingConversionDate: string | null;
  clearingConversionRateType: string | null;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  city: string;
  country: string;
  relatedInvoicesHref: string;
}

// Tab item interface
interface PaymentTab {
  key: string;
  label: string;
  payment: PaymentRecord;
}

// Fusion API config
const FUSION_CONFIG = {
  baseUrl: ORACLE_FUSION_CONFIG.baseUrl,
  paymentsEndpoint: '/payablesPayments',
  auth: btoa(`${ORACLE_FUSION_CONFIG.username}:${ORACLE_FUSION_CONFIG.password}`),
};

// APEX API config
const APEX_PAYMENTS_URL = `${APEX_DB_CONFIG.baseUrl}/ap/payments`;

// Helper function to format amount in UAE format (000,000.00)
const formatAmount = (value: number): string => {
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// Helper function to format date
const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

// Map Fusion API response to PaymentRecord (PascalCase fields)
const mapFusionToPaymentRecord = (item: any, index: number): PaymentRecord => ({
  key: item.CheckId?.toString() || index.toString(),
  checkId: item.CheckId,
  paymentId: item.PaymentId,
  paymentNumber: item.PaymentNumber || item.PaperDocumentNumber,
  paymentDocument: item.PaymentDocument || '',
  paymentStatus: item.PaymentStatus || '',
  reconciled: item.ReconciledFlag === true || item.ReconciledFlag === 'Y',
  payee: item.Payee || '',
  paymentDate: formatDate(item.PaymentDate),
  paymentAmount: item.PaymentAmount || 0,
  paymentCurrency: item.PaymentCurrency || 'AED',
  remitToAddress: [item.AddressLine1, item.City, item.Country].filter(Boolean).join(', '),
  remitToAccountNumber: item.RemitToAccountNumber || '',
  businessUnit: item.BusinessUnit || '',
  legalEntity: item.LegalEntity || '',
  paymentMethod: item.PaymentMethod || '',
  accountingStatus: item.AccountingStatus || '',
  paymentType: item.PaymentType || '',
  supplierNumber: item.SupplierNumber || '',
  payeeSite: item.PayeeSite || '',
  disbursementBankAccount: item.DisbursementBankAccountName || '',
  paymentProcessProfile: item.PaymentProcessProfile || '',
  voucherNumber: item.VoucherNumber || 0,
  documentCategory: item.DocumentCategory || '',
  documentSequence: item.DocumentSequence || '',
  withheldAmount: item.WithheldAmount,
  paymentReference: item.PaymentReference || 0,
  paymentFileReference: item.PaymentFileReference || 0,
  paymentProcessRequest: item.PaymentProcessRequest || '',
  clearingDate: item.ClearingDate,
  clearingAmount: item.ClearingAmount,
  clearingLedgerAmount: item.ClearingLedgerAmount,
  clearingValueDate: item.ClearingValueDate,
  clearingConversionRate: item.ClearingConversionRate,
  clearingConversionDate: item.ClearingConversionDate,
  clearingConversionRateType: item.ClearingConversionRateType,
  addressLine1: item.AddressLine1 || '',
  addressLine2: item.AddressLine2 || '',
  addressLine3: item.AddressLine3 || '',
  city: item.City || '',
  country: item.Country || '',
  relatedInvoicesHref: item.links?.find((l: any) => l.name === 'relatedInvoices')?.href || '',
});

// Map APEX API response to PaymentRecord
// APEX package returns PascalCase keys (same as Fusion) for consistency
const mapApexToPaymentRecord = (item: any, index: number): PaymentRecord => ({
  key: item.CheckId?.toString() || item.PaymentId?.toString() || index.toString(),
  checkId: item.CheckId || item.PaymentId,
  paymentId: item.PaymentId,
  paymentNumber: item.PaymentNumber || item.PaperDocumentNumber,
  paymentDocument: item.PaymentDocument || '',
  paymentStatus: item.PaymentStatus || '',
  reconciled: item.ReconciledFlag === true || item.ReconciledFlag === 'true' || item.ReconciledFlag === 'Y',
  payee: item.Payee || '',
  paymentDate: formatDate(item.PaymentDate),
  paymentAmount: item.PaymentAmount || 0,
  paymentCurrency: item.PaymentCurrency || 'AED',
  remitToAddress: [item.AddressLine1, item.City, item.Country].filter(Boolean).join(', '),
  remitToAccountNumber: item.RemitToAccountNumber || '',
  businessUnit: item.BusinessUnit || '',
  legalEntity: item.LegalEntity || '',
  paymentMethod: item.PaymentMethod || '',
  accountingStatus: item.AccountingStatus || '',
  paymentType: item.PaymentType || '',
  supplierNumber: item.SupplierNumber || '',
  payeeSite: item.PayeeSite || '',
  disbursementBankAccount: item.DisbursementBankAccountName || '',
  paymentProcessProfile: item.PaymentProcessProfile || '',
  voucherNumber: item.VoucherNumber || 0,
  documentCategory: item.DocumentCategory || '',
  documentSequence: item.DocumentSequence || '',
  withheldAmount: item.WithheldAmount,
  paymentReference: item.PaymentReference || 0,
  paymentFileReference: item.PaymentFileReference || 0,
  paymentProcessRequest: item.PaymentProcessRequest || '',
  clearingDate: item.ClearingDate,
  clearingAmount: item.ClearingAmount,
  clearingLedgerAmount: item.ClearingLedgerAmount,
  clearingValueDate: item.ClearingValueDate,
  clearingConversionRate: item.ClearingConversionRate,
  clearingConversionDate: item.ClearingConversionDate,
  clearingConversionRateType: item.ClearingConversionRateType,
  addressLine1: item.AddressLine1 || '',
  addressLine2: item.AddressLine2 || '',
  addressLine3: item.AddressLine3 || '',
  city: item.City || '',
  country: item.Country || '',
  relatedInvoicesHref: '',
});

const ManagePayments: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [searchCollapsed, setSearchCollapsed] = useState(false);

  // Tab management state
  const [activeTab, setActiveTab] = useState('search');
  const [openTabs, setOpenTabs] = useState<PaymentTab[]>([]);

  // Data source toggle: true = APEX, false = Fusion
  const [useApex, setUseApex] = useState(true);

  // API viewer modal state
  const [apiModalVisible, setApiModalVisible] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [lastCalledUrl, setLastCalledUrl] = useState<string | null>(null);
  const [lastApiResponse, setLastApiResponse] = useState<string | null>(null);

  // Debug log state
  const [debugLogs, setDebugLogs] = useState<Array<{ time: string; type: string; message: string }>>([]);

  // Debug logger helper
  const debugLog = (type: 'REQUEST' | 'RESPONSE' | 'INFO' | 'ERROR' | 'MAPPED', msg: string) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-GB', { hour12: false }) + '.' + now.getMilliseconds().toString().padStart(3, '0');
    const entry = { time: timeStr, type, message: msg };
    setDebugLogs(prev => [...prev.slice(-50), entry]); // keep last 50 entries
    if (type === 'ERROR') {
      console.error(`[${timeStr}] [${type}]`, msg);
    } else {
      console.log(`[${timeStr}] [${type}]`, msg);
    }
  };

  // API Configuration for this page
  const PAGE_APIS = {
    apex: [
      {
        name: 'Search Payments (List)',
        method: 'GET',
        url: APEX_PAYMENTS_URL,
        params: 'payment_number=&payment_status=&payee=&supplier_number=&business_unit=&date_from=&date_to=&limit=100&offset=0',
        description: 'Fetches paginated payments from ORDS/APEX database with optional filters. Returns JSON with count, limit, offset, items[].',
      },
      {
        name: 'Get Payment by Check ID',
        method: 'GET',
        url: `${APEX_PAYMENTS_URL}/{check_id}`,
        params: '',
        description: 'Fetches a single payment by Check ID. Example: /ap/payments/300000085294470',
      },
      {
        name: 'Save Payments (Bulk)',
        method: 'POST',
        url: APEX_PAYMENTS_URL,
        params: 'Body: { "items": [...] }',
        description: 'Saves payments to APEX database. Accepts single object, array, or { items: [...] } format.',
      },
    ],
    fusion: [
      {
        name: 'Search Payments',
        method: 'GET',
        url: `${FUSION_CONFIG.baseUrl}${FUSION_CONFIG.paymentsEndpoint}`,
        params: 'q=PaymentNumber={number};Payee LIKE *name*;PaymentStatus=Cleared;BusinessUnit=BU_NAME',
        description: 'Fetches payments from Oracle Fusion REST API (may have CORS issues from browser)',
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

  // Open payment in new tab
  const openPaymentTab = (record: PaymentRecord) => {
    const tabKey = `payment-${record.checkId}`;

    // Check if tab already exists
    const existingTab = openTabs.find((tab) => tab.key === tabKey);
    if (existingTab) {
      setActiveTab(tabKey);
      return;
    }

    // Add new tab
    const newTab: PaymentTab = {
      key: tabKey,
      label: `Payment: ${record.paymentNumber}`,
      payment: record,
    };
    setOpenTabs([...openTabs, newTab]);
    setActiveTab(tabKey);
  };

  // Close payment tab
  const closePaymentTab = (tabKey: string) => {
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
      closePaymentTab(targetKey);
    }
  };

  // Search payments from API
  const handleSearch = async (values: any) => {
    setLoading(true);
    const source = useApex ? 'APEX/ORDS' : 'Fusion';
    debugLog('INFO', `══════════════════════════════════════════════════`);
    debugLog('INFO', `Starting payment search [Source: ${source}]`);
    debugLog('INFO', `Search filters: ${JSON.stringify(values, null, 2)}`);

    try {
      let apiUrl: string;
      let response: Response;

      if (useApex) {
        // Build APEX/ORDS query parameters
        const params = new URLSearchParams();
        if (values.supplierOrParty) params.append('payee', values.supplierOrParty);
        if (values.paymentNumber) params.append('payment_number', values.paymentNumber);
        if (values.paymentStatus) params.append('payment_status', values.paymentStatus);
        if (values.businessUnit) params.append('business_unit', values.businessUnit);
        if (values.supplierNumber) params.append('supplier_number', values.supplierNumber);

        const queryString = params.toString();
        apiUrl = queryString ? `${APEX_PAYMENTS_URL}?${queryString}` : APEX_PAYMENTS_URL;

        debugLog('REQUEST', `GET ${apiUrl}`);
        debugLog('REQUEST', `Headers: { Accept: application/json }`);
        setLastCalledUrl(apiUrl);

        const startTime = performance.now();
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });
        const elapsed = Math.round(performance.now() - startTime);

        debugLog('RESPONSE', `HTTP ${response.status} ${response.statusText} (${elapsed}ms)`);
        debugLog('RESPONSE', `Content-Type: ${response.headers.get('content-type')}`);
      } else {
        // Build Fusion query string
        const filters: string[] = [];
        if (values.paymentNumber) filters.push(`PaymentNumber=${values.paymentNumber}`);
        if (values.supplierOrParty) filters.push(`Payee LIKE '*${values.supplierOrParty}*'`);
        if (values.paymentStatus) filters.push(`PaymentStatus='${values.paymentStatus}'`);
        if (values.businessUnit) filters.push(`BusinessUnit='${values.businessUnit}'`);

        apiUrl = `${FUSION_CONFIG.baseUrl}${FUSION_CONFIG.paymentsEndpoint}`;
        if (filters.length > 0) {
          apiUrl += `?q=${encodeURIComponent(filters.join(';'))}`;
        }

        debugLog('REQUEST', `GET ${apiUrl}`);
        debugLog('REQUEST', `Headers: { Authorization: Basic ***, Content-Type: application/json }`);
        setLastCalledUrl(apiUrl);

        const startTime = performance.now();
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${FUSION_CONFIG.auth}`,
          },
        });
        const elapsed = Math.round(performance.now() - startTime);

        debugLog('RESPONSE', `HTTP ${response.status} ${response.statusText} (${elapsed}ms)`);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        debugLog('ERROR', `HTTP ${response.status}: ${errorBody.substring(0, 500)}`);
        setLastApiResponse(`Error: HTTP ${response.status} ${response.statusText}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      debugLog('RESPONSE', `JSON payload received`);

      // Handle response - ORDS returns { count, limit, offset, items: [...] }
      const items = data.items || data || [];
      const totalCount = data.count || (Array.isArray(items) ? items.length : 0);

      debugLog('RESPONSE', `Total count: ${totalCount}, Items in page: ${Array.isArray(items) ? items.length : 0}`);

      if (Array.isArray(items) && items.length > 0) {
        // Log first item fields for debugging
        const firstItem = items[0];
        const fieldNames = Object.keys(firstItem);
        debugLog('RESPONSE', `Fields per record (${fieldNames.length}): ${fieldNames.join(', ')}`);
        debugLog('RESPONSE', `Sample record: CheckId=${firstItem.CheckId}, PaymentNumber=${firstItem.PaymentNumber}, Payee=${firstItem.Payee}, Amount=${firstItem.PaymentAmount}, Status=${firstItem.PaymentStatus}`);

        const mapper = useApex ? mapApexToPaymentRecord : mapFusionToPaymentRecord;
        const mappedPayments = items.map(mapper);
        setPayments(mappedPayments);
        debugLog('MAPPED', `Mapped ${mappedPayments.length} payment records to UI model`);
        setLastApiResponse(`Success: ${mappedPayments.length} of ${totalCount} payments returned`);
        message.success(`Found ${mappedPayments.length} payments (total: ${totalCount})`);
      } else {
        setPayments([]);
        debugLog('INFO', `No payments found for the given filters`);
        setLastApiResponse(`Success: 0 payments returned (empty result)`);
        message.info('No payments found');
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      debugLog('ERROR', `Search failed: ${errMsg}`);
      if (!lastApiResponse?.startsWith('Error:')) {
        setLastApiResponse(`Error: ${errMsg}`);
      }
      message.error(`Failed to search payments: ${errMsg}`);
    } finally {
      setLoading(false);
      debugLog('INFO', `Search completed`);
      debugLog('INFO', `══════════════════════════════════════════════════`);
    }
  };

  // Reset search form
  const handleReset = () => {
    form.resetFields();
  };

  // Get payment status tag
  const getPaymentStatusTag = (status: string) => {
    const statusConfig: Record<string, { color: string; textColor: string }> = {
      'Cleared': { color: REDWOOD.success, textColor: '#fff' },
      'Negotiable': { color: REDWOOD.info, textColor: '#fff' },
      'Voided': { color: REDWOOD.error, textColor: '#fff' },
      'Stopped': { color: REDWOOD.warning, textColor: '#000' },
      'Formatted': { color: REDWOOD.neutral300, textColor: '#000' },
    };
    const config = statusConfig[status] || { color: REDWOOD.neutral300, textColor: '#000' };
    return (
      <Tag style={{ background: config.color, color: config.textColor, border: 'none' }}>
        {status}
      </Tag>
    );
  };

  // Action menu items
  const actionsMenuItems: MenuProps['items'] = [
    { key: 'edit', label: 'Edit', icon: <EditOutlined /> },
    { type: 'divider' },
    { key: 'void', label: 'Void Payment', danger: true },
    { key: 'stop', label: 'Stop Payment', danger: true },
  ];

  // View menu items
  const viewMenuItems: MenuProps['items'] = [
    { key: 'columns', label: 'Columns', icon: <SettingOutlined /> },
    { key: 'detach', label: 'Detach', icon: <ExportOutlined /> },
    { type: 'divider' },
    { key: 'export', label: 'Export to Excel', icon: <DownloadOutlined /> },
    { key: 'print', label: 'Print', icon: <PrinterOutlined /> },
  ];

  // Table columns
  const columns: ColumnsType<PaymentRecord> = [
    {
      title: 'Payment Number',
      dataIndex: 'paymentNumber',
      key: 'paymentNumber',
      width: 130,
      fixed: 'left',
      render: (text: number, record: PaymentRecord) => (
        <a
          onClick={() => openPaymentTab(record)}
          style={{ color: REDWOOD.info, cursor: 'pointer' }}
        >
          {text}
        </a>
      ),
      sorter: (a, b) => a.paymentNumber - b.paymentNumber,
    },
    {
      title: 'Payment Document',
      dataIndex: 'paymentDocument',
      key: 'paymentDocument',
      width: 140,
    },
    {
      title: 'Payment Status',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      width: 120,
      render: (status: string) => getPaymentStatusTag(status),
      filters: [
        { text: 'Cleared', value: 'Cleared' },
        { text: 'Negotiable', value: 'Negotiable' },
        { text: 'Voided', value: 'Voided' },
        { text: 'Stopped', value: 'Stopped' },
      ],
      onFilter: (value, record) => record.paymentStatus === value,
    },
    {
      title: 'Reconciled',
      dataIndex: 'reconciled',
      key: 'reconciled',
      width: 100,
      render: (reconciled: boolean) => (
        <span style={{ color: reconciled ? REDWOOD.success : REDWOOD.neutral600 }}>
          {reconciled ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      title: 'Payee',
      dataIndex: 'payee',
      key: 'payee',
      width: 220,
      ellipsis: true,
    },
    {
      title: 'Payment Date',
      dataIndex: 'paymentDate',
      key: 'paymentDate',
      width: 120,
      sorter: true,
    },
    {
      title: 'Payment Amount',
      dataIndex: 'paymentAmount',
      key: 'paymentAmount',
      width: 140,
      align: 'right',
      render: (value: number, record: PaymentRecord) => (
        <span style={{ color: REDWOOD.info, fontWeight: 500 }}>
          {formatAmount(value)} {record.paymentCurrency}
        </span>
      ),
      sorter: (a, b) => a.paymentAmount - b.paymentAmount,
    },
    {
      title: 'Remit-to Address',
      dataIndex: 'remitToAddress',
      key: 'remitToAddress',
      width: 250,
      ellipsis: true,
    },
    {
      title: 'Remit-to Account Number',
      dataIndex: 'remitToAccountNumber',
      key: 'remitToAccountNumber',
      width: 180,
    },
    {
      title: 'Details',
      key: 'details',
      width: 80,
      fixed: 'right',
      render: (_, record: PaymentRecord) => (
        <Tooltip title="View Details">
          <Button
            type="link"
            size="small"
            icon={<FileTextOutlined />}
            onClick={() => openPaymentTab(record)}
          />
        </Tooltip>
      ),
    },
  ];

  // Row selection config
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  // Build tab items
  const tabItems = [
    {
      key: 'search',
      label: 'Search Results',
      closable: false,
      children: (
        <div style={{ padding: 16 }}>
          {/* Search Section */}
          <Card
            style={{
              marginBottom: 16,
              borderRadius: 8,
              border: `1px solid ${REDWOOD.neutral200}`,
            }}
            styles={{ body: { padding: searchCollapsed ? 0 : 16 } }}
          >
            <Collapse
              ghost
              defaultActiveKey={['search']}
              onChange={(keys) => setSearchCollapsed(keys.length === 0)}
              items={[
                {
                  key: 'search',
                  label: (
                    <Space>
                      <FilterOutlined />
                      <Text strong>Search</Text>
                    </Space>
                  ),
                  extra: (
                    <Space onClick={(e) => e.stopPropagation()}>
                      <Button size="small">Advanced</Button>
                      <Select
                        size="small"
                        defaultValue="all"
                        style={{ width: 150 }}
                        options={[
                          { value: 'all', label: 'All Payments' },
                          { value: 'recent', label: 'Recent Payments' },
                        ]}
                      />
                    </Space>
                  ),
                  children: (
                    <Form
                      form={form}
                      layout="vertical"
                      onFinish={handleSearch}
                      size="small"
                    >
                      <Row gutter={24}>
                        <Col span={8}>
                          <Form.Item
                            label={<><span style={{ color: REDWOOD.primary }}>**</span> Supplier or Party</>}
                            name="supplierOrParty"
                          >
                            <Select
                              placeholder="Select Supplier"
                              allowClear
                              showSearch
                            />
                          </Form.Item>
                          <Form.Item
                            label={<><span style={{ color: REDWOOD.primary }}>**</span> Payment Date</>}
                            name="paymentDate"
                          >
                            <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
                          </Form.Item>
                          <Form.Item
                            label={<><span style={{ color: REDWOOD.primary }}>**</span> Payment Number</>}
                            name="paymentNumber"
                          >
                            <Input placeholder="Enter payment number" />
                          </Form.Item>
                          <Form.Item
                            label={<><span style={{ color: REDWOOD.primary }}>**</span> Disbursement Bank Account</>}
                            name="disbursementBankAccount"
                          >
                            <Select placeholder="Select Bank Account" allowClear />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item
                            label={<><span style={{ color: REDWOOD.primary }}>**</span> Payment Type</>}
                            name="paymentType"
                          >
                            <Select placeholder="Select Type" allowClear>
                              <Option value="Quick">Quick</Option>
                              <Option value="Standard">Standard</Option>
                            </Select>
                          </Form.Item>
                          <Form.Item
                            label={<><span style={{ color: REDWOOD.primary }}>**</span> Payment Process Request</>}
                            name="paymentProcessRequest"
                          >
                            <Select placeholder="Select Request" allowClear />
                          </Form.Item>
                          <Form.Item label="Payment Status" name="paymentStatus">
                            <Select placeholder="Select Status" allowClear>
                              <Option value="Cleared">Cleared</Option>
                              <Option value="Negotiable">Negotiable</Option>
                              <Option value="Voided">Voided</Option>
                              <Option value="Stopped">Stopped</Option>
                            </Select>
                          </Form.Item>
                          <Form.Item label="Business Unit" name="businessUnit">
                            <Select placeholder="Select Business Unit" allowClear>
                              <Option value="BUMGA_DXB_TRADING">BUMGA_DXB_TRADING</Option>
                              <Option value="BUIMERC CORP FZE_JAFZA">BUIMERC CORP FZE_JAFZA</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            ** At least one is required
                          </Text>
                        </Col>
                      </Row>
                      <Row justify="end" style={{ marginTop: 8 }}>
                        <Space>
                          <Button icon={<SearchOutlined />} type="primary" htmlType="submit" loading={loading}>
                            Search
                          </Button>
                          <Button icon={<ReloadOutlined />} onClick={handleReset}>
                            Reset
                          </Button>
                          <Button icon={<SaveOutlined />}>
                            Save...
                          </Button>
                        </Space>
                      </Row>
                    </Form>
                  ),
                },
              ]}
            />
          </Card>

          {/* Results Section */}
          <Card
            style={{
              borderRadius: 8,
              border: `1px solid ${REDWOOD.neutral200}`,
            }}
            styles={{ body: { padding: 0 } }}
          >
            {/* Action Toolbar */}
            <div style={{
              padding: '8px 16px',
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: REDWOOD.neutral100,
            }}>
              <Space size="small">
                <Dropdown menu={{ items: actionsMenuItems }} trigger={['click']}>
                  <Button size="small">
                    Actions <DownOutlined />
                  </Button>
                </Dropdown>
                <Dropdown menu={{ items: viewMenuItems }} trigger={['click']}>
                  <Button size="small">
                    View <DownOutlined />
                  </Button>
                </Dropdown>
                <Tooltip title="Add">
                  <Button size="small" icon={<PlusOutlined />} />
                </Tooltip>
                <Tooltip title="Add Attachment">
                  <Button size="small" icon={<PaperClipOutlined />} />
                </Tooltip>
                <Tooltip title="Export">
                  <Button size="small" icon={<ExportOutlined />} />
                </Tooltip>
                <Button size="small" icon={<ScissorOutlined />}>
                  Detach
                </Button>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {payments.length} items | {selectedRowKeys.length} selected
              </Text>
            </div>

            {/* Data Table */}
            <Table
              columns={columns}
              dataSource={payments}
              rowSelection={rowSelection}
              loading={loading}
              pagination={{
                pageSize: 25,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
              }}
              scroll={{ x: 1600 }}
              size="small"
              rowClassName={(_, index) => index % 2 === 0 ? '' : 'table-row-light'}
              onRow={(record) => ({
                onDoubleClick: () => openPaymentTab(record),
                style: { cursor: 'pointer' },
              })}
            />
          </Card>
        </div>
      ),
    },
    // Add open payment tabs
    ...openTabs.map((tab) => ({
      key: tab.key,
      label: tab.label,
      closable: true,
      children: (
        <PaymentDetail
          payment={tab.payment}
          onClose={() => closePaymentTab(tab.key)}
        />
      ),
    })),
  ];

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.neutral100 }}>
      <Content>
        {/* Breadcrumb Header */}
        <div style={{
          padding: '12px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: <Link to="/ap">Payables</Link> },
              { title: 'Manage Payments' },
            ]}
          />
          <Space>
            {/* Data Source Toggle */}
            <Space size="small" style={{
              background: REDWOOD.neutral100,
              padding: '4px 12px',
              borderRadius: 6,
              border: `1px solid ${REDWOOD.neutral200}`,
            }}>
              <SwapOutlined style={{ color: REDWOOD.info, fontSize: 14 }} />
              <Text style={{ fontSize: 12 }}>Fusion</Text>
              <Switch
                checked={useApex}
                onChange={(checked) => {
                  setUseApex(checked);
                  setPayments([]);
                  message.info(`Switched to ${checked ? 'APEX' : 'Fusion'} data source`);
                }}
                checkedChildren="APEX"
                unCheckedChildren="Fusion"
                style={{ background: useApex ? REDWOOD.success : REDWOOD.info }}
              />
              <Text style={{ fontSize: 12 }}>APEX</Text>
              <Tag color={useApex ? 'green' : 'blue'} style={{ margin: 0, fontSize: 10 }}>
                {useApex ? 'Active' : 'Active'}
              </Tag>
            </Space>
            <Tooltip title="View Page APIs">
              <Button
                icon={<ApiOutlined />}
                onClick={() => setApiModalVisible(true)}
                style={{ color: REDWOOD.info }}
              />
            </Tooltip>
            <Button type="primary" style={{ background: REDWOOD.primary }}>
              Done
            </Button>
          </Space>
        </div>

        {/* Page Title and Tabs */}
        <div style={{ background: REDWOOD.surface, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
          <div style={{ padding: '8px 16px 0 16px' }}>
            <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <DollarOutlined /> Manage Payments
            </Title>
          </div>

          {/* Tab Navigation */}
          <Tabs
            type="editable-card"
            activeKey={activeTab}
            onChange={onTabChange}
            onEdit={onTabEdit}
            hideAdd
            items={tabItems}
            style={{ marginBottom: 0 }}
            tabBarStyle={{
              margin: 0,
              padding: '0 16px',
              background: REDWOOD.surface,
            }}
          />
        </div>

        {/* Custom styles */}
        <style>{`
          .table-row-light {
            background-color: ${REDWOOD.neutral100};
          }
          .ant-table-thead > tr > th {
            background: ${REDWOOD.neutral100} !important;
            font-weight: 600;
            font-size: 12px;
          }
          .ant-table-tbody > tr > td {
            font-size: 12px;
          }
          .ant-collapse-header {
            padding: 8px 16px !important;
          }
          .ant-form-item {
            margin-bottom: 12px;
          }
          .ant-form-item-label {
            padding-bottom: 2px !important;
          }
          .ant-form-item-label > label {
            font-size: 12px;
            color: ${REDWOOD.neutral600};
          }
          .ant-tabs-tab {
            border-radius: 4px 4px 0 0 !important;
          }
          .ant-tabs-tab-active {
            background: ${REDWOOD.surface} !important;
            border-bottom: 2px solid ${REDWOOD.primary} !important;
          }
          .ant-tabs-nav {
            margin-bottom: 0 !important;
          }
          .ant-tabs-content-holder {
            background: ${REDWOOD.neutral100};
          }
        `}</style>

        {/* API Viewer Modal */}
        <Modal
          title={
            <Space>
              <ApiOutlined style={{ color: REDWOOD.info }} />
              <span>Page APIs - Manage Payments</span>
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
            <Tag color={useApex ? 'green' : 'blue'}>
              Data Source: {useApex ? 'APEX' : 'Fusion'}
            </Tag>
            <Text type="secondary" style={{ marginLeft: 8 }}>
              Toggle the switch in the header to change data source
            </Text>
          </div>

          {/* Last Called URL */}
          {lastCalledUrl && (
            <Card
              size="small"
              style={{ marginBottom: 16, border: `1px solid ${lastApiResponse?.startsWith('Error') ? '#ff4d4f' : '#52c41a'}` }}
              title={
                <Space>
                  <CloudOutlined style={{ color: lastApiResponse?.startsWith('Error') ? '#ff4d4f' : '#52c41a' }} />
                  <Text strong>Last Called URL</Text>
                  <Tag color={lastApiResponse?.startsWith('Error') ? 'red' : 'green'}>
                    {lastApiResponse?.startsWith('Error') ? 'Failed' : 'Success'}
                  </Tag>
                </Space>
              }
            >
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>URL:</Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code
                    style={{
                      background: '#fff7e6',
                      padding: '6px 10px',
                      borderRadius: 4,
                      fontSize: 12,
                      flex: 1,
                      wordBreak: 'break-all',
                      border: '1px solid #ffd591',
                    }}
                  >
                    {lastCalledUrl}
                  </code>
                  <Button
                    size="small"
                    icon={copiedUrl === lastCalledUrl ? <CheckOutlined /> : <CopyOutlined />}
                    onClick={() => copyToClipboard(lastCalledUrl)}
                  />
                </div>
              </div>
              {lastApiResponse && (
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Response:</Text>
                  <div>
                    <code
                      style={{
                        background: lastApiResponse.startsWith('Error') ? '#fff2f0' : '#f6ffed',
                        padding: '6px 10px',
                        borderRadius: 4,
                        fontSize: 12,
                        display: 'block',
                        wordBreak: 'break-all',
                        border: `1px solid ${lastApiResponse.startsWith('Error') ? '#ffccc7' : '#b7eb8f'}`,
                      }}
                    >
                      {lastApiResponse}
                    </code>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Debug Log Panel */}
          {debugLogs.length > 0 && (
            <Card
              size="small"
              style={{ marginBottom: 16, border: `1px solid ${REDWOOD.neutral200}` }}
              title={
                <Space>
                  <BugOutlined style={{ color: REDWOOD.warning }} />
                  <Text strong>Debug Log</Text>
                  <Tag color="orange">{debugLogs.length} entries</Tag>
                </Space>
              }
              extra={
                <Button
                  size="small"
                  icon={<ClearOutlined />}
                  onClick={() => setDebugLogs([])}
                >
                  Clear
                </Button>
              }
            >
              <div
                style={{
                  maxHeight: 250,
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  background: '#1e1e1e',
                  color: '#d4d4d4',
                  padding: 10,
                  borderRadius: 4,
                }}
              >
                {debugLogs.map((log, idx) => {
                  const typeColors: Record<string, string> = {
                    REQUEST: '#569cd6',
                    RESPONSE: '#4ec9b0',
                    INFO: '#9cdcfe',
                    ERROR: '#f44747',
                    MAPPED: '#dcdcaa',
                  };
                  return (
                    <div key={idx} style={{ marginBottom: 2, lineHeight: '16px' }}>
                      <span style={{ color: '#858585' }}>{log.time}</span>
                      {' '}
                      <span style={{ color: typeColors[log.type] || '#d4d4d4', fontWeight: 600 }}>
                        [{log.type}]
                      </span>
                      {' '}
                      <span style={{ color: log.type === 'ERROR' ? '#f44747' : '#d4d4d4' }}>
                        {log.message}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* APEX APIs */}
          <Card
            size="small"
            style={{ marginBottom: 16 }}
            title={
              <Space>
                <DatabaseOutlined style={{ color: REDWOOD.success }} />
                <Text strong>APEX APIs</Text>
                <Tag color={useApex ? 'green' : 'default'}>{useApex ? 'Active' : 'Inactive'}</Tag>
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
                      <Tag color={api.method === 'GET' ? 'blue' : 'orange'}>{api.method}</Tag>
                      <Text strong>{api.name}</Text>
                    </Space>
                  </Col>
                </Row>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  {api.description}
                </Text>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>URL:</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code
                      style={{
                        background: '#e8f5e9',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {api.url}{api.params ? `?${api.params}` : ''}
                    </code>
                    <Button
                      size="small"
                      icon={copiedUrl === api.url ? <CheckOutlined /> : <CopyOutlined />}
                      onClick={() => copyToClipboard(api.url)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </Card>

          {/* Fusion APIs */}
          <Card
            size="small"
            title={
              <Space>
                <CloudOutlined style={{ color: REDWOOD.info }} />
                <Text strong>Fusion APIs</Text>
                <Tag color={!useApex ? 'blue' : 'default'}>{!useApex ? 'Active' : 'Inactive'}</Tag>
              </Space>
            }
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
                      <Tag color={api.method === 'GET' ? 'blue' : 'orange'}>{api.method}</Tag>
                      <Text strong>{api.name}</Text>
                    </Space>
                  </Col>
                </Row>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  {api.description}
                </Text>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>URL:</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code
                      style={{
                        background: '#e3f2fd',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {api.url}{api.params ? `?${api.params}` : ''}
                    </code>
                    <Button
                      size="small"
                      icon={copiedUrl === api.url ? <CheckOutlined /> : <CopyOutlined />}
                      onClick={() => copyToClipboard(api.url)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </Modal>
      </Content>
    </Layout>
  );
};

export default ManagePayments;
