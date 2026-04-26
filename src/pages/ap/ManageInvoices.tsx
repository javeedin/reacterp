import React, { useState, useMemo, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
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
  InputNumber,
  Tabs,
  Modal,
  Checkbox,
  Statistic,
  Progress,
  Spin,
  List,
  Badge,
  Space as AntSpace,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  HomeOutlined,
  SearchOutlined,
  ReloadOutlined,
  SaveOutlined,
  EditOutlined,
  DeleteOutlined,
  DownOutlined,
  ExportOutlined,
  PrinterOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FilterOutlined,
  DownloadOutlined,
  PaperClipOutlined,
  FileTextOutlined,
  DollarOutlined,
  StopOutlined,
  SendOutlined,
  BankOutlined,
  SettingOutlined,
  CopyOutlined,
  ScissorOutlined,
  ApiOutlined,
  CheckOutlined,
  CloudOutlined,
  DatabaseOutlined,
  ExclamationCircleOutlined,
  WalletOutlined,
  CreditCardOutlined,
  LoadingOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  FileZipOutlined,
} from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import { useShowAndTell } from '../../features/showAndTell';
import type { ColumnsType } from 'antd/es/table';
import FloatingMenu from '../../components/FloatingMenu';
import Autopilot from '../../components/Autopilot';
import InvoiceDetail from './InvoiceDetail';
import CreateInvoice from './CreateInvoice';
import type { InvoiceInitialData } from './CreateInvoice';
import { APEX_DB_CONFIG, ORACLE_FUSION_CONFIG } from '../../config/api.config';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

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

// Invoice record interface
interface InvoiceRecord {
  key: string;
  invoiceId: number;
  supplierId: number;
  invoiceNumber: string;
  invoiceDate: string;
  creationDate: string;
  supplierOrParty: string;
  supplierSite: string;
  unpaidAmount: number;
  invoiceAmount: number;
  appliedPrepayments: number;
  invoiceType: string;
  attachments: string;
  notes: string;
  validationStatus: string;
  approvalStatus: string;
  holdPaidStatus: string;
  accountingStatus: string;
  applyAfterDate: string;
  businessUnit: string;
  invoiceCurrency: string;
  supplierNumber: string;
  paymentTerms: string;
  invoiceGroup: string;
  termsDate: string;
  goodsReceivedDate: string;
  liabilityDistribution: string;
  accountingDate: string;
  conversionRateType: string;
  conversionDate: string;
  conversionRate: number | null;
  paymentCurrency: string;
  syncStatus: string;
  // Audit / system info fields
  createdBy: string;
  lastUpdatedBy: string;
  lastUpdateDate: string;
  syncDate: string;
  cancellationDate: string;
  cancelledBy: string;
  deliveryChannelCode: string;
  deliveryChannel: string;
  firstPartyTaxRegistrationId: string;
  firstPartyTaxRegistrationNum: string;
  taxationCountry: string;
  documentCategory: string;
  documentSequence: number | string;
  voucherNumber: string;
}

// Tab item interface
interface InvoiceTab {
  key: string;
  label: string;
  invoice: InvoiceRecord;
  tabType?: 'detail' | 'create';
  initialData?: InvoiceInitialData;
}

// Supplier record from API
interface SupplierRecord {
  key: string;
  supplierId: number;
  supplier: string;
  supplierNumber: string;
  alternativeName: string;
  status: string;
  supplierType: string;
  creationDate: string;
  taxpayerId: string;
}

// Supplier balance interfaces
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

interface BalanceInvoiceRecord {
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

interface BalancePaymentRecord {
  key: string;
  paymentId: number;
  paymentNumber: string;
  paymentDate: string;
  paymentAmount: number;
  paymentStatus: string;
  paymentMethod: string;
  currency: string;
  bankAccountName: string;
}

// APEX endpoint for invoices
const APEX_INVOICE_URL = `${APEX_DB_CONFIG.baseUrl}/ap/createinvoice`;
const APEX_SUPPLIERS_URL = `${APEX_DB_CONFIG.baseUrl}/suppliers`;

// Helper function to format amount in UAE format (000,000.00)
const formatAmount = (value: number): string => {
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// Helper function to format currency
const formatCurrency = (amount: number, currency: string = 'AED'): string => {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

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

// Aging color helper
const getAgingColor = (bucket: string): string => {
  switch (bucket) {
    case 'Current': return '#1D7B4D';
    case '1-30 Days': return '#0572CE';
    case '31-60 Days': return '#D4A800';
    case '61-90 Days': return '#FF8C00';
    case '91-120 Days': return '#C74634';
    case '120+ Days': return '#D93025';
    default: return '#6B6B6B';
  }
};

// Map API response to InvoiceRecord (API returns lowercase snake_case field names)
const mapApiToInvoiceRecord = (item: any, index: number): InvoiceRecord => ({
  key: item.invoice_id?.toString() || index.toString(),
  invoiceId: item.invoice_id,
  supplierId: item.supplier_id,
  invoiceNumber: item.invoice_number || '',
  invoiceDate: formatDate(item.invoice_date),
  creationDate: formatDate(item.creation_date || item.fusion_creation_date),
  supplierOrParty: item.supplier || item.party || '',
  supplierSite: item.supplier_site || '',
  unpaidAmount: item.unpaid_amount != null
    ? Number(item.unpaid_amount)
    : (item.invoice_amount || 0) - (item.amount_paid || 0),
  invoiceAmount: item.invoice_amount || 0,
  appliedPrepayments: item.applied_prepayments || 0,
  invoiceType: item.invoice_type || 'Standard',
  attachments: 'None',
  notes: item.description || '',
  validationStatus: item.validation_status || 'Never validated',
  approvalStatus: item.approval_status || 'Not required',
  holdPaidStatus: item.paid_status || 'Unpaid',
  accountingStatus: item.accounting_status || 'Not Accounted',
  applyAfterDate: item.apply_after_date || '',
  businessUnit: item.business_unit || '',
  invoiceCurrency: item.invoice_currency || 'AED',
  supplierNumber: item.supplier_number || '',
  paymentTerms: item.payment_terms || item.terms_name || '',
  invoiceGroup: item.invoice_group || '',
  termsDate: item.terms_date || '',
  goodsReceivedDate: item.goods_received_date || '',
  liabilityDistribution: item.liability_distribution || '',
  accountingDate: item.accounting_date || '',
  conversionRateType: item.conversion_rate_type || '',
  conversionDate: item.conversion_date || '',
  conversionRate: item.conversion_rate != null ? Number(item.conversion_rate) : null,
  paymentCurrency: item.payment_currency || item.invoice_currency || 'AED',
  // Invoices created in this app have invoice_source='MANUAL'.
  // Any other source (Oracle Fusion sync, import, etc.) is read-only.
  syncStatus: (item.invoice_source && item.invoice_source !== 'MANUAL') ? 'SYNCED' : '',
  // Audit / system info
  createdBy:                   item.created_by                      || '',
  lastUpdatedBy:               item.last_updated_by                 || '',
  lastUpdateDate:              item.last_update_date                || '',
  syncDate:                    item.sync_date                       || '',
  cancellationDate:            item.cancellation_date               || '',
  cancelledBy:                 item.cancelled_by                    || '',
  deliveryChannelCode:         item.delivery_channel_code           || '',
  deliveryChannel:             item.delivery_channel                || '',
  firstPartyTaxRegistrationId: item.first_party_tax_registration_id || '',
  firstPartyTaxRegistrationNum:item.first_party_tax_registration_num|| '',
  taxationCountry:             item.taxation_country                || '',
  documentCategory:            item.document_category               || '',
  documentSequence:            item.document_sequence != null ? Number(item.document_sequence) || item.document_sequence : '',
  voucherNumber:               item.voucher_number                  || '',
});

const ManageInvoices: React.FC = () => {
  const [form] = Form.useForm();
  const location = useLocation();
  const quickCreateHandled = useRef<string | null>(null);
  const { isRunning, activeTour } = useShowAndTell();
  const satTabOpened = useRef(false);
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [searchCollapsed, setSearchCollapsed] = useState(false);

  // Tab management state
  const [activeTab, setActiveTab] = useState('search');
  const [openTabs, setOpenTabs] = useState<InvoiceTab[]>([]);

  // API viewer modal state
  const [apiModalVisible, setApiModalVisible] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [lastCalledUrl, setLastCalledUrl] = useState<string | null>(null);
  const [lastApiResponse, setLastApiResponse] = useState<string | null>(null);

  // Invoice date operator state
  const [invoiceDateOp, setInvoiceDateOp] = useState<string>('=');

  // Supplier lookup modal state
  const [supplierModalVisible, setSupplierModalVisible] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierSearchText, setSupplierSearchText] = useState('');

  // Quick-create invoice dialog state (triggered by Autopilot)
  const [quickCreateVisible, setQuickCreateVisible] = useState(false);
  const [quickCreateForm] = Form.useForm();
  const [qcSupplierModalVisible, setQcSupplierModalVisible] = useState(false);
  const [qcSupplierSearchText, setQcSupplierSearchText] = useState('');

  // Supplier balance popup state
  const [balanceModalVisible, setBalanceModalVisible] = useState(false);
  const [balanceSupplierName, setBalanceSupplierName] = useState('');
  const [balanceSupplierNumber, setBalanceSupplierNumber] = useState('');
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceSummary, setBalanceSummary] = useState<BalanceSummary | null>(null);
  const [agingReport, setAgingReport] = useState<AgingBucket[]>([]);
  const [balanceInvoices, setBalanceInvoices] = useState<BalanceInvoiceRecord[]>([]);
  const [balancePayments, setBalancePayments] = useState<BalancePaymentRecord[]>([]);
  const [balanceInvoicesLoading, setBalanceInvoicesLoading] = useState(false);
  const [balancePaymentsLoading, setBalancePaymentsLoading] = useState(false);
  const [balanceActiveTab, setBalanceActiveTab] = useState('invoices');

  // Show/hide fully paid invoices
  const [showFullyPaid, setShowFullyPaid] = useState(true);

  // Attachment modal state
  const [attachModalVisible, setAttachModalVisible] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachInvoiceNum, setAttachInvoiceNum] = useState('');

  // Filtered invoices based on fully paid toggle
  const displayedInvoices = useMemo(() => {
    if (showFullyPaid) return invoices;
    return invoices.filter((inv) => inv.unpaidAmount !== 0);
  }, [invoices, showFullyPaid]);

  // Compute totals for amount columns (based on displayed invoices)
  const totals = useMemo(() => {
    return displayedInvoices.reduce(
      (acc, inv) => ({
        unpaidAmount: acc.unpaidAmount + (inv.unpaidAmount || 0),
        invoiceAmount: acc.invoiceAmount + (inv.invoiceAmount || 0),
        appliedPrepayments: acc.appliedPrepayments + (inv.appliedPrepayments || 0),
      }),
      { unpaidAmount: 0, invoiceAmount: 0, appliedPrepayments: 0 }
    );
  }, [displayedInvoices]);

  // Export invoices to Excel
  const exportToExcel = () => {
    if (invoices.length === 0) {
      message.warning('No data to export');
      return;
    }

    const exportData = invoices.map((inv) => ({
      'Invoice Number': inv.invoiceNumber,
      'Invoice Date': inv.invoiceDate,
      'Creation Date': inv.creationDate,
      'Supplier or Party': inv.supplierOrParty,
      'Supplier Site': inv.supplierSite,
      'Unpaid Amount': inv.unpaidAmount,
      'Invoice Amount': inv.invoiceAmount,
      'Applied Prepayments': inv.appliedPrepayments,
      'Invoice Currency': inv.invoiceCurrency,
      'Invoice Type': inv.invoiceType,
      'Notes': inv.notes,
      'Validation Status': inv.validationStatus,
      'Approval Status': inv.approvalStatus,
      'Hold Paid Status': inv.holdPaidStatus,
      'Business Unit': inv.businessUnit,
    }));

    // Add totals row
    exportData.push({
      'Invoice Number': 'TOTALS',
      'Invoice Date': '',
      'Creation Date': '',
      'Supplier or Party': '',
      'Supplier Site': '',
      'Unpaid Amount': totals.unpaidAmount,
      'Invoice Amount': totals.invoiceAmount,
      'Applied Prepayments': totals.appliedPrepayments,
      'Invoice Currency': '',
      'Invoice Type': '',
      'Notes': '',
      'Validation Status': '',
      'Approval Status': '',
      'Hold Paid Status': '',
      'Business Unit': '',
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // Set column widths
    worksheet['!cols'] = [
      { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 14 },
      { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 14 },
      { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 28 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoices');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Invoices_${new Date().toISOString().slice(0, 10)}.xlsx`);
    message.success('Exported to Excel successfully');
  };

  // Fetch suppliers from API
  const fetchSuppliers = async () => {
    setSupplierLoading(true);
    try {
      const response = await fetch(APEX_SUPPLIERS_URL, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const items = data.items || data || [];

      if (Array.isArray(items)) {
        const mapped: SupplierRecord[] = items.map((item: any, index: number) => ({
          key: item.supplier_id?.toString() || index.toString(),
          supplierId: item.supplier_id,
          supplier: item.supplier || '',
          supplierNumber: item.supplier_number || '',
          alternativeName: item.alternate_name || '',
          status: item.status || '',
          supplierType: item.supplier_type || '',
          creationDate: formatDate(item.creation_date),
          taxpayerId: item.taxpayer_id || '',
        }));
        setSuppliers(mapped);
      }
    } catch (error) {
      console.error('Supplier fetch error:', error);
      message.error(`Failed to fetch suppliers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSupplierLoading(false);
    }
  };

  // Open supplier lookup modal
  const openSupplierModal = () => {
    setSupplierModalVisible(true);
    setSupplierSearchText('');
    if (suppliers.length === 0) {
      fetchSuppliers();
    }
  };

  // Handle supplier selection
  const handleSupplierSelect = (record: SupplierRecord) => {
    form.setFieldsValue({
      supplierOrParty: record.supplier,
      supplierNumber: record.supplierNumber,
    });
    setSupplierModalVisible(false);
    message.success(`Selected supplier: ${record.supplier}`);
  };

  // Filtered suppliers based on search text
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearchText) return suppliers;
    const search = supplierSearchText.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.supplier.toLowerCase().includes(search) ||
        s.supplierNumber.toLowerCase().includes(search) ||
        (s.alternativeName && s.alternativeName.toLowerCase().includes(search))
    );
  }, [suppliers, supplierSearchText]);

  // Supplier table columns
  const supplierColumns: ColumnsType<SupplierRecord> = [
    {
      title: 'Supplier Number',
      dataIndex: 'supplierNumber',
      key: 'supplierNumber',
      width: 130,
      sorter: (a, b) => a.supplierNumber.localeCompare(b.supplierNumber),
    },
    {
      title: 'Supplier Name',
      dataIndex: 'supplier',
      key: 'supplier',
      width: 280,
      ellipsis: true,
      sorter: (a, b) => a.supplier.localeCompare(b.supplier),
    },
    {
      title: 'Alternative Name',
      dataIndex: 'alternativeName',
      key: 'alternativeName',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={status === 'ACTIVE' ? 'green' : 'red'}>{status}</Tag>
      ),
      filters: [
        { text: 'ACTIVE', value: 'ACTIVE' },
        { text: 'INACTIVE', value: 'INACTIVE' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Taxpayer ID',
      dataIndex: 'taxpayerId',
      key: 'taxpayerId',
      width: 120,
    },
    {
      title: 'Action',
      key: 'action',
      width: 80,
      render: (_: any, record: SupplierRecord) => (
        <Button
          type="link"
          size="small"
          onClick={() => handleSupplierSelect(record)}
          style={{ color: REDWOOD.info }}
        >
          Select
        </Button>
      ),
    },
  ];

  // Quick-create supplier filtering (reuse loaded suppliers)
  const qcFilteredSuppliers = useMemo(() => {
    if (!qcSupplierSearchText) return suppliers;
    const search = qcSupplierSearchText.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.supplier.toLowerCase().includes(search) ||
        s.supplierNumber.toLowerCase().includes(search) ||
        (s.alternativeName && s.alternativeName.toLowerCase().includes(search))
    );
  }, [suppliers, qcSupplierSearchText]);

  // Quick-create supplier select
  const handleQcSupplierSelect = (record: SupplierRecord) => {
    quickCreateForm.setFieldsValue({
      supplier: record.supplier,
      supplierNumber: record.supplierNumber,
    });
    setQcSupplierModalVisible(false);
  };

  // Quick-create submit
  const handleQuickCreateSubmit = async () => {
    try {
      const values = await quickCreateForm.validateFields();
      const initialData: InvoiceInitialData = {
        supplier: values.supplier,
        supplierNumber: values.supplierNumber,
        businessUnit: values.businessUnit,
        invoiceNumber: values.invoiceNumber,
        invoiceAmount: values.invoiceAmount,
        invoiceDate: values.invoiceDate,
        description: values.description,
        taxCode: values.taxCode,
        includingTax: values.includingTax || false,
      };

      // If tax code is VAT 5% and "Including Tax" is not checked, suggest the correct amount
      if (values.taxCode === 'VAT 5%' && !values.includingTax && values.invoiceAmount > 0) {
        const taxRate = 5;
        const taxAmount = Math.round(values.invoiceAmount * (taxRate / 100) * 100) / 100;
        const correctedAmount = Math.round((values.invoiceAmount + taxAmount) * 100) / 100;

        Modal.confirm({
          title: 'Invoice Amount Does Not Include Tax',
          icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
          content: (
            <div style={{ marginTop: 12 }}>
              <p>The entered amount <strong>{values.invoiceAmount.toFixed(2)}</strong> does not include VAT 5%.</p>
              <p>Correct amount with tax: <strong style={{ color: '#c74634', fontSize: 16 }}>{correctedAmount.toFixed(2)}</strong></p>
              <p style={{ fontSize: 12, color: '#666' }}>
                (Amount: {values.invoiceAmount.toFixed(2)} + VAT 5%: {taxAmount.toFixed(2)} = {correctedAmount.toFixed(2)})
              </p>
              <p>Would you like to use the corrected amount?</p>
            </div>
          ),
          okText: 'Yes, use corrected amount',
          cancelText: 'No, keep original',
          onOk: () => {
            initialData.invoiceAmount = correctedAmount;
            initialData.includingTax = true;
            setQuickCreateVisible(false);
            quickCreateForm.resetFields();
            openCreateInvoiceTab(initialData);
          },
          onCancel: () => {
            setQuickCreateVisible(false);
            quickCreateForm.resetFields();
            openCreateInvoiceTab(initialData);
          },
        });
        return;
      }

      setQuickCreateVisible(false);
      quickCreateForm.resetFields();
      openCreateInvoiceTab(initialData);
    } catch {
      // validation errors shown by form
    }
  };

  // Fetch supplier balance dashboard (summary + aging)
  const fetchBalanceDashboard = async (supplierNumber: string) => {
    setBalanceLoading(true);
    setBalanceSummary(null);
    setAgingReport([]);
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/dashboard/${supplierNumber}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (data.success === 'false') throw new Error(data.error || 'Failed to load balance data');

      setBalanceSummary({
        totalInvoices: data.balance_summary?.total_invoices || 0,
        totalInvoiceAmount: data.balance_summary?.total_invoice_amount || 0,
        totalPayments: data.balance_summary?.total_payments || 0,
        totalPaymentAmount: data.balance_summary?.total_payment_amount || 0,
        balance: data.balance_summary?.balance || 0,
        currency: data.balance_summary?.currency || 'AED',
      });
      setAgingReport(
        (data.aging_report || []).map((item: any) => ({
          bucket: item.bucket || '',
          amount: item.amount || 0,
          invoiceCount: item.invoice_count || 0,
          percentage: item.percentage || 0,
        }))
      );
    } catch (error) {
      console.error('Error fetching balance dashboard:', error);
      message.error(`Failed to load balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setBalanceLoading(false);
    }
  };

  // Fetch supplier balance invoices
  const fetchBalanceInvoices = async (supplierNumber: string) => {
    setBalanceInvoicesLoading(true);
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/invoices/${supplierNumber}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const items = data.invoices || [];
      setBalanceInvoices(
        items.map((item: any, index: number) => ({
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
        }))
      );
    } catch (error) {
      console.error('Error fetching balance invoices:', error);
      message.error('Failed to load invoices');
    } finally {
      setBalanceInvoicesLoading(false);
    }
  };

  // Fetch supplier balance payments
  const fetchBalancePayments = async (supplierNumber: string) => {
    setBalancePaymentsLoading(true);
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/payments/${supplierNumber}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const items = data.payments || [];
      setBalancePayments(
        items.map((item: any, index: number) => ({
          key: item.payment_id?.toString() || index.toString(),
          paymentId: item.payment_id,
          paymentNumber: item.payment_number || '',
          paymentDate: item.payment_date || '',
          paymentAmount: item.payment_amount || 0,
          paymentStatus: item.payment_status || '',
          paymentMethod: item.payment_method || '',
          currency: item.currency || 'AED',
          bankAccountName: item.bank_account_name || '',
        }))
      );
    } catch (error) {
      console.error('Error fetching balance payments:', error);
      message.error('Failed to load payments');
    } finally {
      setBalancePaymentsLoading(false);
    }
  };

  // Open supplier balance popup
  const handleCheckBalance = () => {
    const supplierName = quickCreateForm.getFieldValue('supplier');
    const supplierNum = quickCreateForm.getFieldValue('supplierNumber');
    if (!supplierNum) {
      message.warning('Please select a supplier first');
      return;
    }
    setBalanceSupplierName(supplierName);
    setBalanceSupplierNumber(supplierNum);
    setBalanceModalVisible(true);
    setBalanceActiveTab('invoices');
    setBalanceInvoices([]);
    setBalancePayments([]);
    fetchBalanceDashboard(supplierNum);
    fetchBalanceInvoices(supplierNum);
  };

  // Handle balance tab change (lazy-load payments)
  const handleBalanceTabChange = (key: string) => {
    setBalanceActiveTab(key);
    if (key === 'payments' && balancePayments.length === 0 && !balancePaymentsLoading) {
      fetchBalancePayments(balanceSupplierNumber);
    }
  };

  // ── Attachment helpers ────────────────────────────────────────────────────
  const FUSION_HOST = 'https://iaaobn.fa.ocs.oraclecloud.com';

  const fetchAttachments = async (invoiceId: number, invoiceNum: string) => {
    setAttachments([]);
    setAttachLoading(true);
    setAttachInvoiceNum(invoiceNum);
    setAttachModalVisible(true);
    try {
      const creds = btoa(`${ORACLE_FUSION_CONFIG.username}:${ORACLE_FUSION_CONFIG.password}`);
      const url = `${ORACLE_FUSION_CONFIG.baseUrl}/invoices/${invoiceId}/child/attachments`;
      const res = await fetch(url, { headers: { 'Authorization': `Basic ${creds}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAttachments(data.items || []);
    } catch (e: any) {
      message.error(`Failed to load attachments: ${e.message}`);
    } finally {
      setAttachLoading(false);
    }
  };

  const downloadAttachment = async (att: any) => {
    const fileName = att.FileName || att.Title || 'attachment';
    if (!att.FileUrl) {
      // fallback to enclosure link
      const link = (att.links || []).find((l: any) => l.rel === 'enclosure' && l.name === 'FileContents');
      if (link) window.open(link.href, '_blank');
      return;
    }
    const url = FUSION_HOST + att.FileUrl;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl; a.download = fileName; a.click();
      URL.revokeObjectURL(objUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  const getFileIcon = (contentType: string, fileName: string) => {
    const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
    if (contentType?.includes('pdf') || ext === 'pdf')   return <FilePdfOutlined style={{ color: '#E53935', fontSize: 20 }} />;
    if (contentType?.includes('image') || ['jpg','jpeg','png','gif','bmp','webp'].includes(ext)) return <FileImageOutlined style={{ color: '#1E88E5', fontSize: 20 }} />;
    if (['xls','xlsx'].includes(ext))  return <FileExcelOutlined style={{ color: '#1D7B4D', fontSize: 20 }} />;
    if (['doc','docx'].includes(ext))  return <FileWordOutlined  style={{ color: '#1565C0', fontSize: 20 }} />;
    if (['zip','rar','7z'].includes(ext)) return <FileZipOutlined style={{ color: '#F57C00', fontSize: 20 }} />;
    return <FileOutlined style={{ color: '#6B6B6B', fontSize: 20 }} />;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // API Configuration for this page
  const PAGE_APIS = {
    apex: [
      {
        name: 'Search Invoices',
        method: 'GET',
        proxyUrl: APEX_INVOICE_URL,
        actualUrl: APEX_INVOICE_URL,
        params: 'supplier_number={supplierNumber}&business_unit={businessUnit}&invoice_number={invoiceNumber}&supplier={supplierOrParty}&invoice_date={invoiceDate}&invoice_amount={invoiceAmount}&supplier_site={supplierSite}&invoice_group={invoiceGroup}',
        description: 'Fetches invoices from APEX database with optional filters',
      },
      {
        name: 'Create Invoice',
        method: 'POST',
        proxyUrl: APEX_INVOICE_URL,
        actualUrl: APEX_INVOICE_URL,
        params: '',
        description: 'Creates a new invoice in APEX database',
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

  // Open invoice in new tab
  // Synced invoices (from Oracle Fusion) open as read-only InvoiceDetail.
  // Locally-created invoices open in CreateInvoice (edit mode).
  const openInvoiceTab = (record: InvoiceRecord) => {
    const tabKey = `invoice-${record.invoiceId}`;

    const existingTab = openTabs.find((tab) => tab.key === tabKey);
    if (existingTab) {
      setActiveTab(tabKey);
      return;
    }

    // Always open CreateInvoice — synced invoices are read-only inside that component
    const editData: InvoiceInitialData = {
      invoiceId: record.invoiceId,
      isSynced: record.syncStatus === 'SYNCED',
      supplier: record.supplierOrParty,
      supplierNumber: record.supplierNumber,
      supplierId: record.supplierId,
      invoiceNumber: record.invoiceNumber,
      invoiceAmount: record.invoiceAmount,
      invoiceDate: record.invoiceDate ? dayjs(record.invoiceDate, 'DD MMM YYYY') : undefined,
      description: record.notes || '',
      invoiceCurrency: record.invoiceCurrency,
      businessUnit: record.businessUnit,
      invoiceType: record.invoiceType,
      supplierSite: record.supplierSite,
      unpaidAmount: record.unpaidAmount,
      validationStatus: record.validationStatus,
      approvalStatus: record.approvalStatus,
      holdPaidStatus: record.holdPaidStatus,
      applyAfterDate: record.applyAfterDate,
      paymentTerms: record.paymentTerms,
      invoiceGroup: record.invoiceGroup,
      termsDate: record.termsDate,
      goodsReceivedDate: record.goodsReceivedDate,
      liabilityDistribution: record.liabilityDistribution,
      accountingDate: record.accountingDate,
      conversionRateType: record.conversionRateType,
      conversionDate: record.conversionDate,
      conversionRate: record.conversionRate,
      paymentCurrency: record.paymentCurrency,
      // Audit / system info
      creationDate:                record.creationDate,
      createdBy:                   record.createdBy,
      lastUpdatedBy:               record.lastUpdatedBy,
      lastUpdateDate:              record.lastUpdateDate,
      syncDate:                    record.syncDate,
      cancellationDate:            record.cancellationDate,
      cancelledBy:                 record.cancelledBy,
      deliveryChannelCode:         record.deliveryChannelCode,
      deliveryChannel:             record.deliveryChannel,
      firstPartyTaxRegistrationId: record.firstPartyTaxRegistrationId,
      firstPartyTaxRegistrationNum:record.firstPartyTaxRegistrationNum,
      taxationCountry:             record.taxationCountry,
      documentCategory:            record.documentCategory,
      documentSequence:            record.documentSequence,
      voucherNumber:               record.voucherNumber,
    };

    const newTab: InvoiceTab = {
      key: tabKey,
      label: record.invoiceNumber,
      invoice: record,
      tabType: 'create',
      initialData: editData,
    };
    setOpenTabs([...openTabs, newTab]);
    setActiveTab(tabKey);
  };

  // Open create invoice tab (optionally with pre-filled data)
  const openCreateInvoiceTab = (data?: InvoiceInitialData) => {
    const tabKey = `create-invoice-${Date.now()}`;
    // Build tab label: InvoiceNo + first 4 letters of supplier
    let tabLabel = 'New Invoice';
    if (data) {
      const invNo = data.invoiceNumber || '';
      const supplierShort = (data.supplier || '').substring(0, 4).toUpperCase();
      if (invNo && supplierShort) {
        tabLabel = `${invNo} - ${supplierShort}`;
      } else if (invNo) {
        tabLabel = invNo;
      }
    }
    const newTab: InvoiceTab = {
      key: tabKey,
      label: tabLabel,
      invoice: {} as InvoiceRecord,
      tabType: 'create',
      initialData: data,
    };
    setOpenTabs((prev) => [...prev, newTab]);
    setActiveTab(tabKey);
  };

  // Show & Tell: when the create-invoice tour navigates here, open the demo tab
  useEffect(() => {
    if (!isRunning || activeTour?.id !== 'create-invoice') {
      satTabOpened.current = false;
      return;
    }
    if (satTabOpened.current) return;
    satTabOpened.current = true;
    // Open a blank form — the tour guides the user to fill each field interactively
    setTimeout(() => openCreateInvoiceTab(), 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, activeTour?.id]);

  // Handle quick-create from FloatingMenu or Autopilot navigation state
  useEffect(() => {
    const state = location.state as any;
    if (!state?.quickCreate) return;
    // Use location.key to allow repeated navigations (each navigate() gets a new key)
    if (quickCreateHandled.current === location.key) return;
    quickCreateHandled.current = location.key;

    if (state.quickCreateData) {
      // FloatingMenu / Autopilot flow: data already collected, open tab directly
      const qcData = { ...state.quickCreateData } as InvoiceInitialData;
      // Convert serialised date string back to dayjs (structured clone strips prototype)
      if (qcData.invoiceDate && typeof qcData.invoiceDate === 'string') {
        qcData.invoiceDate = dayjs(qcData.invoiceDate);
      }
      setTimeout(() => {
        openCreateInvoiceTab(qcData);
      }, 100);
    } else if (state.showQuickCreateDialog) {
      // Autopilot flow: show dialog to collect data
      setTimeout(() => {
        setQuickCreateVisible(true);
        if (suppliers.length === 0) fetchSuppliers();
      }, 200);
    }

    window.history.replaceState({}, document.title);
  }, [location.state, location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close invoice tab
  const closeInvoiceTab = (tabKey: string) => {
    const newTabs = openTabs.filter((tab) => tab.key !== tabKey);
    setOpenTabs(newTabs);

    // If closing active tab, switch to search
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
      closeInvoiceTab(targetKey);
    }
  };

  // Search invoices from API
  const handleSearch = async (values: any) => {
    setLoading(true);
    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (values.supplierNumber) params.append('supplier_number', values.supplierNumber);
      if (values.businessUnit) params.append('business_unit', values.businessUnit);
      if (values.invoiceNumber) params.append('invoice_number', values.invoiceNumber);
      if (values.supplierOrParty) params.append('supplier', values.supplierOrParty);

      // Invoice date — convert operator + picker value(s) to date_from / date_to
      const fmt = (d: import('dayjs').Dayjs) => d.format('YYYY-MM-DD');
      const today = dayjs();
      const op = invoiceDateOp;
      if (op === '=' && values.invoiceDate) {
        params.append('invoice_date_from', fmt(values.invoiceDate));
        params.append('invoice_date_to',   fmt(values.invoiceDate));
      } else if (op === 'between' && values.invoiceDateRange?.[0] && values.invoiceDateRange?.[1]) {
        params.append('invoice_date_from', fmt(values.invoiceDateRange[0]));
        params.append('invoice_date_to',   fmt(values.invoiceDateRange[1]));
      } else if (op === 'before' && values.invoiceDate) {
        params.append('invoice_date_to', fmt(values.invoiceDate));
      } else if (op === 'after' && values.invoiceDate) {
        params.append('invoice_date_from', fmt(values.invoiceDate));
      } else if (op === 'past10') {
        params.append('invoice_date_from', fmt(today.subtract(10, 'day')));
        params.append('invoice_date_to',   fmt(today));
      } else if (op === 'past20') {
        params.append('invoice_date_from', fmt(today.subtract(20, 'day')));
        params.append('invoice_date_to',   fmt(today));
      } else if (op === 'past30') {
        params.append('invoice_date_from', fmt(today.subtract(30, 'day')));
        params.append('invoice_date_to',   fmt(today));
      } else if (op === 'past60') {
        params.append('invoice_date_from', fmt(today.subtract(60, 'day')));
        params.append('invoice_date_to',   fmt(today));
      } else if (op === 'this_month') {
        params.append('invoice_date_from', fmt(today.startOf('month')));
        params.append('invoice_date_to',   fmt(today.endOf('month')));
      } else if (op === 'last_month') {
        const lm = today.subtract(1, 'month');
        params.append('invoice_date_from', fmt(lm.startOf('month')));
        params.append('invoice_date_to',   fmt(lm.endOf('month')));
      }

      if (values.invoiceAmount != null && values.invoiceAmount !== '') params.append('invoice_amount', values.invoiceAmount);
      if (values.supplierSite) params.append('supplier_site', values.supplierSite);
      if (values.invoiceGroup) params.append('invoice_group', values.invoiceGroup);

      // Build URL - call APEX endpoint directly
      const queryString = params.toString();
      const apiUrl = queryString ? `${APEX_INVOICE_URL}?${queryString}` : APEX_INVOICE_URL;

      console.log('Fetching invoices from:', apiUrl);
      setLastCalledUrl(apiUrl);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        setLastApiResponse(`Error: HTTP ${response.status} ${response.statusText}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('API Response:', data);

      // Handle response - could be { items: [...] } or direct array
      const items = data.items || data || [];

      if (Array.isArray(items) && items.length > 0) {
        const mappedInvoices = items.map(mapApiToInvoiceRecord);
        setInvoices(mappedInvoices);
        setLastApiResponse(`Success: ${mappedInvoices.length} invoices returned`);
        message.success(`Found ${mappedInvoices.length} invoices`);
      } else {
        setInvoices([]);
        setLastApiResponse(`Success: 0 invoices returned (empty result). Response keys: ${JSON.stringify(Object.keys(data))}`);
        message.info('No invoices found');
      }
    } catch (error) {
      console.error('Search error:', error);
      if (!lastApiResponse?.startsWith('Error:')) {
        setLastApiResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      message.error(`Failed to search invoices: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Reset search form
  const handleReset = () => {
    form.resetFields();
  };

  // Get validation status tag
  const getValidationStatusTag = (status: string) => {
    const statusConfig: Record<string, { color: string; textColor: string }> = {
      'Validated': { color: REDWOOD.success, textColor: '#fff' },
      'Needs revalidation': { color: REDWOOD.warning, textColor: '#000' },
      'Canceled': { color: REDWOOD.error, textColor: '#fff' },
      'Never validated': { color: REDWOOD.neutral300, textColor: '#000' },
    };
    const config = statusConfig[status] || { color: REDWOOD.neutral300, textColor: '#000' };
    return (
      <Tag style={{ background: config.color, color: config.textColor, border: 'none' }}>
        {status}
      </Tag>
    );
  };

  // Get approval status tag
  const getApprovalStatusTag = (status: string) => {
    const statusConfig: Record<string, { color: string }> = {
      'Manually approved': { color: 'green' },
      'Workflow approved': { color: 'green' },
      'Not required': { color: 'default' },
      'Rejected': { color: 'red' },
      'Pending': { color: 'orange' },
    };
    const config = statusConfig[status] || { color: 'default' };
    return <Tag color={config.color}>{status}</Tag>;
  };

  const getAccountingStatusTag = (status: string) => {
    const statusConfig: Record<string, { color: string }> = {
      'Accounted':       { color: 'green' },
      'Draft Accounted': { color: 'cyan' },
      'Not Accounted':   { color: 'default' },
      'Partial':         { color: 'orange' },
      'Error':           { color: 'red' },
    };
    const config = statusConfig[status] || { color: 'default' };
    return <Tag color={config.color}>{status || 'Not Accounted'}</Tag>;
  };

  // Action menu items
  const actionsMenuItems: MenuProps['items'] = [
    { key: 'edit', label: 'Edit', icon: <EditOutlined /> },
    { key: 'duplicate', label: 'Duplicate', icon: <CopyOutlined /> },
    { type: 'divider' },
    { key: 'delete', label: 'Delete', icon: <DeleteOutlined />, danger: true },
    { key: 'cancel', label: 'Cancel Invoice', icon: <StopOutlined />, danger: true },
  ];

  // View menu handler
  const handleViewMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'export') {
      exportToExcel();
    }
  };

  // View menu items
  const viewMenuItems: MenuProps['items'] = [
    { key: 'columns', label: 'Columns', icon: <SettingOutlined /> },
    { key: 'detach', label: 'Detach', icon: <ExportOutlined /> },
    { type: 'divider' },
    { key: 'export', label: 'Export to Excel', icon: <DownloadOutlined /> },
    { key: 'print', label: 'Print', icon: <PrinterOutlined /> },
  ];

  // Approval menu items
  const approvalMenuItems: MenuProps['items'] = [
    { key: 'approve', label: 'Approve', icon: <CheckCircleOutlined /> },
    { key: 'reject', label: 'Reject', icon: <CloseCircleOutlined /> },
    { key: 'requestInfo', label: 'Request Information', icon: <FileTextOutlined /> },
  ];

  // Post menu items
  const postMenuItems: MenuProps['items'] = [
    { key: 'post', label: 'Post to GL', icon: <SendOutlined /> },
    { key: 'unpost', label: 'Unpost', icon: <StopOutlined /> },
  ];

  // Table columns
  const columns: ColumnsType<InvoiceRecord> = [
    {
      title: 'Invoice Number',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
      width: 150,
      fixed: 'left',
      render: (text: string, record: InvoiceRecord) => (
        <a
          onClick={() => openInvoiceTab(record)}
          style={{ color: REDWOOD.info, cursor: 'pointer' }}
        >
          {text}
        </a>
      ),
      sorter: (a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber),
    },
    {
      title: 'Invoice Date',
      dataIndex: 'invoiceDate',
      key: 'invoiceDate',
      width: 110,
      sorter: true,
    },
    {
      title: 'Creation Date',
      dataIndex: 'creationDate',
      key: 'creationDate',
      width: 120,
    },
    {
      title: 'Supplier or Party',
      dataIndex: 'supplierOrParty',
      key: 'supplierOrParty',
      width: 220,
      ellipsis: true,
    },
    {
      title: 'Su Sit',
      dataIndex: 'supplierSite',
      key: 'supplierSite',
      width: 80,
      render: (text: string) => (
        <Tooltip title={text}>
          <span style={{ color: REDWOOD.primary, cursor: 'pointer' }}>
            <FileTextOutlined />
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'Unpaid Amount',
      dataIndex: 'unpaidAmount',
      key: 'unpaidAmount',
      width: 120,
      align: 'right',
      render: (value: number, record: InvoiceRecord) => (
        <span style={{ color: value === 0 ? REDWOOD.neutral600 : REDWOOD.neutral900 }}>
          {formatAmount(value)} {record.invoiceCurrency}
        </span>
      ),
    },
    {
      title: 'Invoice Amount',
      dataIndex: 'invoiceAmount',
      key: 'invoiceAmount',
      width: 130,
      align: 'right',
      render: (value: number, record: InvoiceRecord) => (
        <span style={{ color: value < 0 ? REDWOOD.error : REDWOOD.info, fontWeight: 500 }}>
          {formatAmount(value)} {record.invoiceCurrency}
        </span>
      ),
      sorter: (a, b) => a.invoiceAmount - b.invoiceAmount,
    },
    {
      title: 'Applied Prepayments',
      dataIndex: 'appliedPrepayments',
      key: 'appliedPrepayments',
      width: 140,
      align: 'right',
      render: (value: number, record: InvoiceRecord) => (
        <span>{formatAmount(value)} {record.invoiceCurrency}</span>
      ),
    },
    {
      title: 'Invoice Type',
      dataIndex: 'invoiceType',
      key: 'invoiceType',
      width: 110,
    },
    {
      title: 'Attachments',
      dataIndex: 'attachments',
      key: 'attachments',
      width: 100,
      render: (text: string, record: InvoiceRecord) => (
        text !== 'None' ? (
          <Tooltip title="View & download attachments">
            <PaperClipOutlined
              style={{ color: REDWOOD.info, cursor: 'pointer', fontSize: 16 }}
              onClick={() => fetchAttachments(record.invoiceId, record.invoiceNumber)}
            />
          </Tooltip>
        ) : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
      ),
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      width: 80,
      render: (text: string) => (
        text ? (
          <Tooltip title={text}>
            <FileTextOutlined style={{ color: REDWOOD.info, cursor: 'pointer' }} />
          </Tooltip>
        ) : null
      ),
    },
    {
      title: 'Validation Status',
      dataIndex: 'validationStatus',
      key: 'validationStatus',
      width: 130,
      render: (status: string) => getValidationStatusTag(status),
      filters: [
        { text: 'Validated', value: 'Validated' },
        { text: 'Needs revalidation', value: 'Needs revalidation' },
        { text: 'Canceled', value: 'Canceled' },
        { text: 'Never validated', value: 'Never validated' },
      ],
      onFilter: (value, record) => record.validationStatus === value,
    },
    {
      title: 'Approval Status',
      dataIndex: 'approvalStatus',
      key: 'approvalStatus',
      width: 140,
      render: (status: string) => getApprovalStatusTag(status),
    },
    {
      title: 'Accounting Status',
      dataIndex: 'accountingStatus',
      key: 'accountingStatus',
      width: 150,
      render: (status: string) => getAccountingStatusTag(status),
      filters: [
        { text: 'Accounted',       value: 'Accounted' },
        { text: 'Draft Accounted', value: 'Draft Accounted' },
        { text: 'Not Accounted',   value: 'Not Accounted' },
        { text: 'Error',           value: 'Error' },
      ],
      onFilter: (value, record) => record.accountingStatus === value,
    },
    {
      title: 'Paid Status',
      dataIndex: 'holdPaidStatus',
      key: 'holdPaidStatus',
      width: 120,
      render: (status: string) => {
        if (status === 'Fully Paid')
          return <Tag color="success" style={{ fontSize: 11 }}>Fully Paid</Tag>;
        if (status === 'Partially Paid')
          return <Tag color="warning" style={{ fontSize: 11 }}>Partially Paid</Tag>;
        return <Tag color="error" style={{ fontSize: 11 }}>Unpaid</Tag>;
      },
    },
    {
      title: 'Business Unit',
      dataIndex: 'businessUnit',
      key: 'businessUnit',
      width: 180,
      ellipsis: true,
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
                      <Text strong>Search: Invoice</Text>
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
                          { value: 'all', label: 'All Invoices' },
                          { value: 'recent', label: 'Recent Invoices' },
                          { value: 'pending', label: 'Pending Invoices' },
                        ]}
                      />
                    </Space>
                  ),
                  children: (
                    <Form
                      form={form}
                      layout="horizontal"
                      onFinish={handleSearch}
                      size="small"
                      labelCol={{ span: 8 }}
                      wrapperCol={{ span: 16 }}
                      labelAlign="right"
                    >
                      <Row gutter={32}>
                        <Col span={12}>
                          <Form.Item
                            label={<Text style={{ fontSize: 12 }}>Business Unit</Text>}
                            name="businessUnit"
                            style={{ marginBottom: 8 }}
                          >
                            <Select
                              placeholder="Select Business Unit"
                              allowClear
                              showSearch
                            >
                              <Option value="BUIMERC CORP FZE_JAFZA">BUIMERC CORP FZE_JAFZA</Option>
                              <Option value="BUIMERC CORP_DIFC_INVST">BUIMERC CORP_DIFC_INVST</Option>
                            </Select>
                          </Form.Item>
                          <Form.Item
                            label={<Text style={{ fontSize: 12 }}><span style={{ color: REDWOOD.primary }}>**</span> Invoice Number</Text>}
                            name="invoiceNumber"
                            style={{ marginBottom: 8 }}
                          >
                            <Input placeholder="Enter invoice number" />
                          </Form.Item>
                          <Form.Item
                            label={<Text style={{ fontSize: 12 }}>Invoice Amount</Text>}
                            name="invoiceAmount"
                            style={{ marginBottom: 8 }}
                          >
                            <InputNumber style={{ width: '100%' }} placeholder="0.00" />
                          </Form.Item>
                          {/* Invoice Date with operator */}
                          <Form.Item
                            label={<Text style={{ fontSize: 12 }}><span style={{ color: REDWOOD.primary }}>**</span> Invoice Date</Text>}
                            style={{ marginBottom: 8 }}
                          >
                            <AntSpace.Compact style={{ width: '100%' }}>
                              <Select
                                value={invoiceDateOp}
                                onChange={(v) => {
                                  setInvoiceDateOp(v);
                                  form.setFieldsValue({ invoiceDate: undefined, invoiceDateRange: undefined });
                                }}
                                style={{ width: 130, flexShrink: 0 }}
                                options={[
                                  { value: '=',          label: 'Equal to' },
                                  { value: 'between',    label: 'Between' },
                                  { value: 'before',     label: 'Before' },
                                  { value: 'after',      label: 'After' },
                                  { value: 'past10',     label: 'Past 10 days' },
                                  { value: 'past20',     label: 'Past 20 days' },
                                  { value: 'past30',     label: 'Past 30 days' },
                                  { value: 'past60',     label: 'Past 60 days' },
                                  { value: 'this_month', label: 'This month' },
                                  { value: 'last_month', label: 'Last month' },
                                ]}
                              />
                              {(invoiceDateOp === '=' || invoiceDateOp === 'before' || invoiceDateOp === 'after') && (
                                <Form.Item name="invoiceDate" noStyle>
                                  <DatePicker style={{ flex: 1 }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
                                </Form.Item>
                              )}
                              {invoiceDateOp === 'between' && (
                                <Form.Item name="invoiceDateRange" noStyle>
                                  <DatePicker.RangePicker style={{ flex: 1 }} format="DD-MMM-YYYY" />
                                </Form.Item>
                              )}
                              {['past10','past20','past30','past60','this_month','last_month'].includes(invoiceDateOp) && (
                                <Input
                                  disabled
                                  style={{ flex: 1, color: '#666', background: '#f5f5f5', fontSize: 12 }}
                                  value={
                                    invoiceDateOp === 'past10'     ? `${dayjs().subtract(10,'day').format('DD-MMM-YYYY')} → Today` :
                                    invoiceDateOp === 'past20'     ? `${dayjs().subtract(20,'day').format('DD-MMM-YYYY')} → Today` :
                                    invoiceDateOp === 'past30'     ? `${dayjs().subtract(30,'day').format('DD-MMM-YYYY')} → Today` :
                                    invoiceDateOp === 'past60'     ? `${dayjs().subtract(60,'day').format('DD-MMM-YYYY')} → Today` :
                                    invoiceDateOp === 'this_month' ? `${dayjs().startOf('month').format('DD-MMM')} → ${dayjs().endOf('month').format('DD-MMM-YYYY')}` :
                                    invoiceDateOp === 'last_month' ? (() => { const lm = dayjs().subtract(1,'month'); return `${lm.startOf('month').format('DD-MMM')} → ${lm.endOf('month').format('DD-MMM-YYYY')}`; })() : ''
                                  }
                                />
                              )}
                            </AntSpace.Compact>
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            label={<Text style={{ fontSize: 12 }}><span style={{ color: REDWOOD.primary }}>**</span> Supplier or Party</Text>}
                            name="supplierOrParty"
                            style={{ marginBottom: 8 }}
                          >
                            <Input
                              placeholder="Search supplier"
                              readOnly
                              suffix={
                                <SearchOutlined
                                  style={{ color: REDWOOD.info, cursor: 'pointer', fontSize: 14 }}
                                  onClick={openSupplierModal}
                                />
                              }
                              onClick={openSupplierModal}
                              style={{ cursor: 'pointer' }}
                            />
                          </Form.Item>
                          <Form.Item
                            label={<Text style={{ fontSize: 12 }}><span style={{ color: REDWOOD.primary }}>**</span> Supplier Number</Text>}
                            name="supplierNumber"
                            style={{ marginBottom: 8 }}
                          >
                            <Input placeholder="e.g. H014" />
                          </Form.Item>
                          <Form.Item
                            label={<Text style={{ fontSize: 12 }}>Supplier Site</Text>}
                            name="supplierSite"
                            style={{ marginBottom: 8 }}
                          >
                            <Select placeholder="Select site" allowClear>
                              <Option value="SHARJAH">SHARJAH</Option>
                              <Option value="DUBAI">DUBAI</Option>
                            </Select>
                          </Form.Item>
                          <Form.Item
                            label={<Text style={{ fontSize: 12 }}><span style={{ color: REDWOOD.primary }}>**</span> Invoice Group</Text>}
                            name="invoiceGroup"
                            style={{ marginBottom: 8 }}
                          >
                            <Input placeholder="Enter invoice group" />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row>
                        <Col span={24}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              <span style={{ color: REDWOOD.primary }}>**</span> At least one is required
                            </Text>
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
                          </div>
                        </Col>
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
                <Dropdown menu={{ items: viewMenuItems, onClick: handleViewMenuClick }} trigger={['click']}>
                  <Button size="small">
                    View <DownOutlined />
                  </Button>
                </Dropdown>
                <Tooltip title="Edit">
                  <Button size="small" icon={<EditOutlined />} />
                </Tooltip>
                <Tooltip title="Add Attachment">
                  <Button size="small" icon={<PaperClipOutlined />} />
                </Tooltip>
                <Tooltip title="Export to Excel">
                  <Button size="small" icon={<DownloadOutlined />} onClick={exportToExcel} />
                </Tooltip>
                <Button size="small" icon={<ScissorOutlined />}>
                  Detach
                </Button>
                <Button
                  size="small"
                  type="primary"
                  style={{ background: REDWOOD.success }}
                  icon={<CheckCircleOutlined />}
                >
                  Validate
                </Button>
                <Button
                  size="small"
                  type="primary"
                  style={{ background: REDWOOD.info }}
                  icon={<DollarOutlined />}
                >
                  Pay in Full
                </Button>
                <Dropdown menu={{ items: approvalMenuItems }} trigger={['click']}>
                  <Button size="small" type="primary" style={{ background: REDWOOD.warning }}>
                    Approval <DownOutlined />
                  </Button>
                </Dropdown>
                <Dropdown menu={{ items: postMenuItems }} trigger={['click']}>
                  <Button size="small">
                    Post <DownOutlined />
                  </Button>
                </Dropdown>
              </Space>
              <Space size="middle">
                <Checkbox
                  checked={showFullyPaid}
                  onChange={(e) => setShowFullyPaid(e.target.checked)}
                  style={{ fontSize: 12 }}
                >
                  <Text style={{ fontSize: 12 }}>Show Fully Paid</Text>
                </Checkbox>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {displayedInvoices.length} of {invoices.length} items | {selectedRowKeys.length} selected
                </Text>
              </Space>
            </div>

            {/* Data Table */}
            <Table
              columns={columns}
              dataSource={displayedInvoices}
              rowSelection={rowSelection}
              loading={loading}
              pagination={{
                pageSize: 25,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
              }}
              scroll={{ x: 1800 }}
              size="small"
              rowClassName={(_record, index) => index % 2 === 0 ? '' : 'table-row-light'}
              onRow={(record) => ({
                onDoubleClick: () => openInvoiceTab(record),
                style: { cursor: 'pointer' },
              })}
              summary={() =>
                invoices.length > 0 ? (
                  <Table.Summary fixed>
                    <Table.Summary.Row
                      style={{ background: REDWOOD.neutral100 }}
                    >
                      {/* Checkbox column */}
                      <Table.Summary.Cell index={0} />
                      {/* Invoice Number */}
                      <Table.Summary.Cell index={1}>
                        <Text strong style={{ fontSize: 12 }}>Totals</Text>
                      </Table.Summary.Cell>
                      {/* Invoice Date */}
                      <Table.Summary.Cell index={2} />
                      {/* Creation Date */}
                      <Table.Summary.Cell index={3} />
                      {/* Supplier or Party */}
                      <Table.Summary.Cell index={4} />
                      {/* Supplier Site */}
                      <Table.Summary.Cell index={5} />
                      {/* Unpaid Amount */}
                      <Table.Summary.Cell index={6} align="right">
                        <Text strong style={{
                          fontSize: 12,
                          color: totals.unpaidAmount === 0 ? REDWOOD.neutral600 : REDWOOD.neutral900,
                        }}>
                          {formatAmount(totals.unpaidAmount)}
                        </Text>
                      </Table.Summary.Cell>
                      {/* Invoice Amount */}
                      <Table.Summary.Cell index={7} align="right">
                        <Text strong style={{
                          fontSize: 12,
                          color: totals.invoiceAmount < 0 ? REDWOOD.error : REDWOOD.info,
                        }}>
                          {formatAmount(totals.invoiceAmount)}
                        </Text>
                      </Table.Summary.Cell>
                      {/* Applied Prepayments */}
                      <Table.Summary.Cell index={8} align="right">
                        <Text strong style={{ fontSize: 12 }}>
                          {formatAmount(totals.appliedPrepayments)}
                        </Text>
                      </Table.Summary.Cell>
                      {/* Remaining empty cells */}
                      <Table.Summary.Cell index={9} />
                      <Table.Summary.Cell index={10} />
                      <Table.Summary.Cell index={11} />
                      <Table.Summary.Cell index={12} />
                      <Table.Summary.Cell index={13} />
                      <Table.Summary.Cell index={14} />
                      <Table.Summary.Cell index={15} />
                    </Table.Summary.Row>
                  </Table.Summary>
                ) : null
              }
            />
          </Card>
        </div>
      ),
    },
    // Add open invoice tabs
    ...openTabs.map((tab) => ({
      key: tab.key,
      label: tab.label,
      closable: true,
      children: (
        <CreateInvoice
          onClose={() => closeInvoiceTab(tab.key)}
          initialData={tab.initialData}
          onSave={(savedValues) => {
            // Update tab label to invoice number after first save
            if (savedValues?.invoiceNumber) {
              const invNo = savedValues.invoiceNumber as string;
              const supplierShort = ((savedValues.supplier || '') as string).substring(0, 4).toUpperCase();
              const newLabel = supplierShort ? `${invNo} - ${supplierShort}` : invNo;
              setOpenTabs((prev) =>
                prev.map((t) => t.key === tab.key ? { ...t, label: newLabel } : t)
              );
            }
            // Refresh invoice list after save if search was previously executed
            if (invoices.length > 0) {
              form.submit();
            }
          }}
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
              { title: 'Manage Invoices' },
            ]}
          />
          <Space>
            <Tooltip title="Create Invoice">
              <Button
                type="primary"
                icon={<FileTextOutlined />}
                onClick={() => openCreateInvoiceTab()}
                style={{
                  background: REDWOOD.primary,
                  borderColor: REDWOOD.primary,
                  borderRadius: 6,
                  fontWeight: 500,
                }}
              >
                + Create Invoice
              </Button>
            </Tooltip>
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
              <BankOutlined /> Manage Invoices (Search)
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

        {/* Supplier Search Modal */}
        <Modal
          title={
            <Space>
              <SearchOutlined style={{ color: REDWOOD.info }} />
              <span>Search Suppliers</span>
            </Space>
          }
          open={supplierModalVisible}
          onCancel={() => setSupplierModalVisible(false)}
          footer={null}
          width={900}
          styles={{ body: { padding: '12px 24px' } }}
        >
          <div style={{ marginBottom: 12 }}>
            <Input
              placeholder="Search by supplier name, number, or alternate name..."
              prefix={<SearchOutlined style={{ color: REDWOOD.neutral300 }} />}
              value={supplierSearchText}
              onChange={(e) => setSupplierSearchText(e.target.value)}
              allowClear
              size="middle"
              style={{ marginBottom: 8 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {filteredSuppliers.length} supplier{filteredSuppliers.length !== 1 ? 's' : ''} found
              </Text>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={fetchSuppliers}
                loading={supplierLoading}
              >
                Refresh
              </Button>
            </div>
          </div>
          <Table
            columns={supplierColumns}
            dataSource={filteredSuppliers}
            loading={supplierLoading}
            size="small"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
            }}
            scroll={{ y: 400 }}
            onRow={(record) => ({
              onDoubleClick: () => handleSupplierSelect(record),
              style: { cursor: 'pointer' },
            })}
            rowClassName={(_record, index) => index % 2 === 0 ? '' : 'table-row-light'}
          />
        </Modal>

        {/* API Viewer Modal */}
        <Modal
          title={
            <Space>
              <ApiOutlined style={{ color: REDWOOD.info }} />
              <span>Page APIs - Manage Invoices</span>
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
            <Tag color="green">Data Source: APEX</Tag>
            <Text type="secondary" style={{ marginLeft: 8 }}>
              This page uses APEX database for invoice operations
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

          {/* APEX APIs */}
          <Card
            size="small"
            title={
              <Space>
                <DatabaseOutlined style={{ color: REDWOOD.success }} />
                <Text strong>APEX APIs</Text>
                <Tag color="green">Active</Tag>
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
                        background: '#e8f5e9',
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

        {/* Quick Create Invoice Dialog (triggered by Autopilot) */}
        <Modal
          title={
            <Space>
              <FileTextOutlined style={{ color: REDWOOD.primary }} />
              <span>Quick Create Invoice</span>
            </Space>
          }
          open={quickCreateVisible}
          onCancel={() => { setQuickCreateVisible(false); quickCreateForm.resetFields(); }}
          onOk={handleQuickCreateSubmit}
          okText="Create Invoice"
          width={520}
          destroyOnClose
        >
          <Form form={quickCreateForm} layout="vertical" size="small" style={{ marginTop: 16 }}>
            <Form.Item label="Supplier" required style={{ marginBottom: 12 }}>
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="supplier" noStyle rules={[{ required: true, message: 'Select a supplier' }]}>
                  <Input placeholder="Click search to select supplier" readOnly style={{ flex: 1 }} />
                </Form.Item>
                <Button
                  icon={<SearchOutlined />}
                  onClick={() => {
                    setQcSupplierModalVisible(true);
                    setQcSupplierSearchText('');
                    if (suppliers.length === 0) fetchSuppliers();
                  }}
                />
                <Tooltip title="Check Supplier Balance">
                  <Button
                    icon={<WalletOutlined />}
                    onClick={handleCheckBalance}
                    style={{ borderColor: REDWOOD.info, color: REDWOOD.info }}
                  />
                </Tooltip>
              </Space.Compact>
            </Form.Item>
            <Form.Item name="supplierNumber" hidden><Input /></Form.Item>
            <Form.Item name="businessUnit" label="Business Unit" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 12 }}>
              <Select placeholder="Select Business Unit" allowClear showSearch>
                <Option value="BUIMERC CORP FZE_JAFZA">BUIMERC CORP FZE_JAFZA</Option>
                <Option value="BUIMERC CORP_DIFC_INVST">BUIMERC CORP_DIFC_INVST</Option>
              </Select>
            </Form.Item>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="invoiceNumber" label="Invoice Number" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 12 }}>
                  <Input placeholder="Enter invoice number" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="invoiceAmount" label="Invoice Amount" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 12 }}>
                  <InputNumber placeholder="0.00" style={{ width: '100%' }} min={0} precision={2} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="invoiceDate" label="Invoice Date" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 12 }}>
                  <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="description" label="Description" style={{ marginBottom: 12 }}>
                  <Input placeholder="Invoice description" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="taxCode" label="Tax Code" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 12 }}>
                  <Select placeholder="Select tax code">
                    <Option value="VAT 5%">VAT 5%</Option>
                    <Option value="Zero Rated">Zero Rated</Option>
                    <Option value="Exempt">Exempt</Option>
                    <Option value="Reverse Charge">Reverse Charge</Option>
                    <Option value="Out of Scope">Out of Scope</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="includingTax" label=" " valuePropName="checked" style={{ marginBottom: 12 }}>
                  <Checkbox>Amount Including Tax</Checkbox>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Modal>

        {/* Quick Create Supplier Search Modal */}
        <Modal
          title="Select Supplier"
          open={qcSupplierModalVisible}
          onCancel={() => setQcSupplierModalVisible(false)}
          footer={null}
          width={700}
          destroyOnClose
        >
          <Input
            placeholder="Search by name, number, or alternative name..."
            prefix={<SearchOutlined />}
            value={qcSupplierSearchText}
            onChange={(e) => setQcSupplierSearchText(e.target.value)}
            allowClear
            style={{ marginBottom: 12 }}
          />
          <Table
            dataSource={qcFilteredSuppliers}
            columns={[
              { title: 'Number', dataIndex: 'supplierNumber', key: 'supplierNumber', width: 120 },
              { title: 'Supplier Name', dataIndex: 'supplier', key: 'supplier', width: 250, ellipsis: true },
              { title: 'Status', dataIndex: 'status', key: 'status', width: 90, render: (s: string) => <Tag color={s === 'ACTIVE' ? 'green' : 'red'}>{s}</Tag> },
              {
                title: 'Action', key: 'action', width: 80,
                render: (_: any, record: SupplierRecord) => (
                  <Button type="link" size="small" onClick={() => handleQcSupplierSelect(record)} style={{ color: REDWOOD.info }}>Select</Button>
                ),
              },
            ]}
            rowKey="key"
            size="small"
            loading={supplierLoading}
            pagination={{ pageSize: 10, size: 'small' }}
            scroll={{ y: 350 }}
          />
        </Modal>

        {/* Supplier Balance Popup Modal */}
        <Modal
          title={
            <Space>
              <WalletOutlined style={{ color: REDWOOD.info }} />
              <span>Supplier Balance — {balanceSupplierName}</span>
              <Tag color="blue">{balanceSupplierNumber}</Tag>
            </Space>
          }
          open={balanceModalVisible}
          onCancel={() => setBalanceModalVisible(false)}
          footer={<Button onClick={() => setBalanceModalVisible(false)}>Close</Button>}
          width={950}
          styles={{ body: { padding: '16px 24px', maxHeight: '70vh', overflowY: 'auto' } }}
          destroyOnClose
        >
          {balanceLoading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
              <div style={{ marginTop: 12, color: REDWOOD.neutral600 }}>Loading balance data...</div>
            </div>
          ) : balanceSummary ? (
            <>
              {/* Outstanding Balance Header */}
              <Card
                size="small"
                style={{
                  marginBottom: 16,
                  background: balanceSummary.balance > 0 ? '#FFF1F0' : '#F6FFED',
                  border: `1px solid ${balanceSummary.balance > 0 ? '#FFA39E' : '#B7EB8F'}`,
                }}
              >
                <Row justify="space-between" align="middle">
                  <Col>
                    <Text type="secondary">Outstanding Balance</Text>
                    <div>
                      <Text strong style={{ fontSize: 24, color: balanceSummary.balance > 0 ? REDWOOD.error : REDWOOD.success }}>
                        {formatCurrency(balanceSummary.balance, balanceSummary.currency)}
                      </Text>
                    </div>
                  </Col>
                  <Col>
                    <Row gutter={24}>
                      <Col>
                        <Statistic title="Total Invoices" value={balanceSummary.totalInvoices} prefix={<FileTextOutlined style={{ color: REDWOOD.info }} />} valueStyle={{ fontSize: 16 }} />
                      </Col>
                      <Col>
                        <Statistic title="Invoice Amount" value={balanceSummary.totalInvoiceAmount} precision={2} suffix={balanceSummary.currency} valueStyle={{ fontSize: 14 }} />
                      </Col>
                      <Col>
                        <Statistic title="Payments" value={balanceSummary.totalPayments} prefix={<CreditCardOutlined style={{ color: REDWOOD.success }} />} valueStyle={{ fontSize: 16 }} />
                      </Col>
                      <Col>
                        <Statistic title="Paid Amount" value={balanceSummary.totalPaymentAmount} precision={2} suffix={balanceSummary.currency} valueStyle={{ color: REDWOOD.success, fontSize: 14 }} />
                      </Col>
                    </Row>
                  </Col>
                </Row>
              </Card>

              {/* Aging Report */}
              {agingReport.length > 0 && (
                <Card
                  title={<Space><ExclamationCircleOutlined style={{ color: REDWOOD.warning }} /><Text strong style={{ fontSize: 13 }}>Aging Report</Text></Space>}
                  size="small"
                  style={{ marginBottom: 16 }}
                >
                  <Row gutter={8}>
                    {agingReport.map((bucket, index) => (
                      <Col span={4} key={index}>
                        <Card size="small" style={{ borderTop: `3px solid ${getAgingColor(bucket.bucket)}`, textAlign: 'center' }}>
                          <Text type="secondary" style={{ fontSize: 10 }}>{bucket.bucket}</Text>
                          <div style={{ margin: '6px 0' }}>
                            <Text strong style={{ fontSize: 14, color: getAgingColor(bucket.bucket) }}>{formatCurrency(bucket.amount)}</Text>
                          </div>
                          <Tag style={{ fontSize: 10 }}>{bucket.invoiceCount} inv</Tag>
                          <Progress percent={bucket.percentage} size="small" strokeColor={getAgingColor(bucket.bucket)} showInfo={false} style={{ marginTop: 6 }} />
                          <Text type="secondary" style={{ fontSize: 10 }}>{bucket.percentage.toFixed(1)}%</Text>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                </Card>
              )}

              {/* Invoices & Payments Tabs */}
              <Tabs
                activeKey={balanceActiveTab}
                onChange={handleBalanceTabChange}
                size="small"
                items={[
                  {
                    key: 'invoices',
                    label: <span><FileTextOutlined /> Invoices ({balanceInvoices.length})</span>,
                    children: (
                      <Table
                        dataSource={balanceInvoices}
                        columns={[
                          { title: 'Invoice Number', dataIndex: 'invoiceNumber', key: 'invoiceNumber', width: 130 },
                          { title: 'Invoice Date', dataIndex: 'invoiceDate', key: 'invoiceDate', width: 100, render: (d: string) => formatDate(d) },
                          { title: 'Amount', dataIndex: 'invoiceAmount', key: 'invoiceAmount', width: 120, align: 'right' as const, render: (amt: number) => <Text strong>{formatCurrency(amt)}</Text> },
                          { title: 'Paid', dataIndex: 'amountPaid', key: 'amountPaid', width: 120, align: 'right' as const, render: (amt: number) => <Text style={{ color: REDWOOD.success }}>{formatCurrency(amt)}</Text> },
                          { title: 'Balance', dataIndex: 'amountRemaining', key: 'amountRemaining', width: 120, align: 'right' as const, render: (amt: number) => <Text style={{ color: amt > 0 ? REDWOOD.error : REDWOOD.success }}>{formatCurrency(amt)}</Text> },
                          { title: 'Status', dataIndex: 'invoiceStatus', key: 'invoiceStatus', width: 90, render: (s: string) => <Tag>{s || '-'}</Tag> },
                          { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
                        ]}
                        rowKey="key"
                        size="small"
                        loading={balanceInvoicesLoading}
                        pagination={{ pageSize: 8, size: 'small' }}
                        scroll={{ y: 300 }}
                      />
                    ),
                  },
                  {
                    key: 'payments',
                    label: <span><CreditCardOutlined /> Payments ({balancePayments.length})</span>,
                    children: (
                      <Table
                        dataSource={balancePayments}
                        columns={[
                          { title: 'Payment Number', dataIndex: 'paymentNumber', key: 'paymentNumber', width: 140 },
                          { title: 'Payment Date', dataIndex: 'paymentDate', key: 'paymentDate', width: 100, render: (d: string) => formatDate(d) },
                          { title: 'Amount', dataIndex: 'paymentAmount', key: 'paymentAmount', width: 130, align: 'right' as const, render: (amt: number) => <Text strong style={{ color: REDWOOD.success }}>{formatCurrency(amt)}</Text> },
                          { title: 'Status', dataIndex: 'paymentStatus', key: 'paymentStatus', width: 100, render: (s: string) => <Tag color={s === 'NEGOTIABLE' ? 'green' : 'default'}>{s}</Tag> },
                          { title: 'Method', dataIndex: 'paymentMethod', key: 'paymentMethod', width: 100 },
                          { title: 'Bank Account', dataIndex: 'bankAccountName', key: 'bankAccountName', ellipsis: true },
                        ]}
                        rowKey="key"
                        size="small"
                        loading={balancePaymentsLoading}
                        pagination={{ pageSize: 8, size: 'small' }}
                        scroll={{ y: 300 }}
                      />
                    ),
                  },
                ]}
              />
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: REDWOOD.neutral600 }}>
              No balance data available for this supplier.
            </div>
          )}
        </Modal>
      {/* ── Attachments Modal ─────────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <PaperClipOutlined style={{ color: REDWOOD.info }} />
            <span>Attachments — Invoice {attachInvoiceNum}</span>
            {attachments.length > 0 && <Badge count={attachments.length} style={{ backgroundColor: REDWOOD.info }} />}
          </Space>
        }
        open={attachModalVisible}
        onCancel={() => setAttachModalVisible(false)}
        footer={<Button onClick={() => setAttachModalVisible(false)}>Close</Button>}
        width={640}
      >
        <Spin spinning={attachLoading}>
          {!attachLoading && attachments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#999' }}>
              <PaperClipOutlined style={{ fontSize: 32, marginBottom: 8 }} />
              <div>No attachments found for this invoice</div>
            </div>
          ) : (
            <List
              dataSource={attachments}
              renderItem={(att: any) => (
                <List.Item
                  style={{ padding: '12px 0' }}
                  actions={[
                    <Tooltip title="Download" key="dl">
                      <Button
                        type="primary"
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={() => downloadAttachment(att)}
                        style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
                      >
                        Download
                      </Button>
                    </Tooltip>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={getFileIcon(att.UploadedFileContentType, att.FileName)}
                    title={
                      <Text strong style={{ fontSize: 13 }}>
                        {att.FileName || att.Title || 'Unnamed file'}
                      </Text>
                    }
                    description={
                      <Space size={12}>
                        {att.UploadedFileLength > 0 && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatFileSize(att.UploadedFileLength)}
                          </Text>
                        )}
                        {att.Category && (
                          <Tag color="blue" style={{ fontSize: 11 }}>{att.Category}</Tag>
                        )}
                        {att.CreationDate && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {att.CreationDate.slice(0, 10)}
                          </Text>
                        )}
                        {att.CreatedByUserName && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {att.CreatedByUserName}
                          </Text>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Spin>
      </Modal>

      </Content>
      <Autopilot module="ap" />
      <FloatingMenu />
    </Layout>
  );
};

export default ManageInvoices;
