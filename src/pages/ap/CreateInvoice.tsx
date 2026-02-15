import React, { useState, useMemo, useCallback, useEffect } from 'react';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import {
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
  Tooltip,
  Tabs,
  message,
  DatePicker,
  InputNumber,
  Modal,
  Divider,
  Descriptions,
  Dropdown,
  Alert,
  Statistic,
  Progress,
  Spin,
  Upload,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  SaveOutlined,
  CloseOutlined,
  PlusOutlined,
  DeleteOutlined,
  SearchOutlined,
  ReloadOutlined,
  FileTextOutlined,
  ShoppingCartOutlined,
  CheckCircleOutlined,
  UndoOutlined,
  DownOutlined,
  CheckSquareOutlined,
  StopOutlined,
  CalculatorOutlined,
  DollarOutlined,
  LockOutlined,
  UnlockOutlined,
  SendOutlined,
  RollbackOutlined,
  CopyOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  WalletOutlined,
  CreditCardOutlined,
  LoadingOutlined,
  ApiOutlined,
  AccountBookOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  UploadOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  InboxOutlined,
} from '@ant-design/icons';

dayjs.extend(customParseFormat);
import * as XLSX from 'xlsx';
import type { ColumnsType } from 'antd/es/table';
import { APEX_DB_CONFIG } from '../../config/api.config';
import AccountSelector, { validateAccountCode } from '../../components/AccountSelector';

const { Text, Title } = Typography;
const { Option } = Select;
const { TextArea } = Input;

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
};

const APEX_SUPPLIERS_URL = `${APEX_DB_CONFIG.baseUrl}/suppliers`;

// Supplier record
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

// Format currency
const formatCurrency = (amount: number, currency: string = 'AED'): string => {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

// Format date
const formatDateStr = (dateStr: string | null): string => {
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

// Unified Invoice Line - same data, different column views per tab
interface InvoiceLine {
  key: string;
  lineNumber: number;
  // Distribution columns (matching Fusion Payables)
  type: string;
  amount: number;
  distributionSet: string;
  distributionCombination: string;
  accountingDate: string;
  prorateAcrossAllItemLines: string;
  description: string;
  taxClassification: string;
  shipToLocation: string;
  // Additional distribution fields
  quantity: number;
  unitPrice: number;
  uomName: string;
  project: string;
  task: string;
  // Purchase Order columns
  poNumber: string;
  poLine: string;
  poSchedule: string;
  receiptNumber: string;
  receiptLine: string;
  consumptionAdviceNumber: string;
  consumptionAdviceLine: string;
  startDate: string;
  endDate: string;
  accrualAccount: string;
  taxAmount: number;
}

// Currency list
const CURRENCIES = [
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'QAR', name: 'Qatari Riyal' },
  { code: 'BHD', name: 'Bahraini Dinar' },
  { code: 'KWD', name: 'Kuwaiti Dinar' },
  { code: 'OMR', name: 'Omani Rial' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'PKR', name: 'Pakistani Rupee' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'JOD', name: 'Jordanian Dinar' },
  { code: 'LBP', name: 'Lebanese Pound' },
  { code: 'TRY', name: 'Turkish Lira' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'PLN', name: 'Polish Zloty' },
  { code: 'CZK', name: 'Czech Koruna' },
  { code: 'THB', name: 'Thai Baht' },
  { code: 'PHP', name: 'Philippine Peso' },
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'RUB', name: 'Russian Ruble' },
];

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

// Format amount
const formatAmount = (value: number): string => {
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// Helper: derive tax rate from tax classification code
const getTaxRateForClassification = (taxClassification: string): number => {
  if (!taxClassification) return 0;
  if (taxClassification === 'VAT 5%') return 5;
  // Zero Rated, Exempt, Out of Scope, Reverse Charge => 0
  return 0;
};

// Helper: compute end of month from a DD-MMM-YYYY date string
const getEndOfMonth = (dateStr: string): string => {
  if (!dateStr) return '';
  const parsed = dayjs(dateStr, 'DD-MMM-YYYY');
  if (!parsed.isValid()) return '';
  return parsed.endOf('month').format('DD-MMM-YYYY');
};

// Create a blank line — accepts optional defaults to inherit from header
const createBlankLine = (lineNumber: number, defaults?: { accountingDate?: string; taxClassification?: string; accrualAccount?: string }): InvoiceLine => {
  const acctDate = defaults?.accountingDate || '';
  return {
    key: Date.now().toString() + '-' + lineNumber,
    lineNumber,
    type: 'Item',
    amount: 0,
    distributionSet: '',
    distributionCombination: '',
    accountingDate: acctDate,
    prorateAcrossAllItemLines: 'No',
    description: '',
    taxClassification: defaults?.taxClassification || '',
    shipToLocation: '',
    quantity: 1,
    unitPrice: 0,
    uomName: '',
    project: '',
    task: '',
    poNumber: '',
    poLine: '',
    poSchedule: '',
    receiptNumber: '',
    receiptLine: '',
    consumptionAdviceNumber: '',
    consumptionAdviceLine: '',
    startDate: acctDate,
    endDate: getEndOfMonth(acctDate),
    accrualAccount: defaults?.accrualAccount || '',
    taxAmount: 0,
  };
};

export interface InvoiceInitialData {
  supplier?: string;
  supplierNumber?: string;
  invoiceNumber?: string;
  invoiceAmount?: number;
  invoiceDate?: any;
  description?: string;
  invoiceCurrency?: string;
  businessUnit?: string;
  invoiceType?: string;
  taxCode?: string;
  includingTax?: boolean;
}

interface CreateInvoiceProps {
  onClose: () => void;
  onSave?: (values: any) => void;
  initialData?: InvoiceInitialData;
}

const CreateInvoice: React.FC<CreateInvoiceProps> = ({ onClose, onSave, initialData }) => {
  const [form] = Form.useForm();

  // Unified invoice lines - shared across both tabs
  const [lines, setLines] = useState<InvoiceLine[]>([createBlankLine(1)]);

  // Supplier modal
  const [supplierModalVisible, setSupplierModalVisible] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierSearchText, setSupplierSearchText] = useState('');

  // Header completion tracking
  const [headerValues, setHeaderValues] = useState<Record<string, any>>({
    invoiceType: 'Standard',
    invoiceCurrency: 'AED',
  });
  const [taxRate, setTaxRate] = useState<number>(5);

  // Check if all required header fields are filled
  const isHeaderComplete = useMemo(() => {
    const requiredFields = ['businessUnit', 'invoiceNumber', 'invoiceCurrency', 'invoiceAmount', 'invoiceDate', 'supplier', 'invoiceType'];
    return requiredFields.every((field) => {
      const val = headerValues[field];
      return val !== undefined && val !== null && val !== '';
    });
  }, [headerValues]);

  // Line selection
  const [selectedLineKeys, setSelectedLineKeys] = useState<React.Key[]>([]);

  // Account Selector (Distribution Combination popup)
  const [accountSelectorVisible, setAccountSelectorVisible] = useState(false);
  const [editingLineKey, setEditingLineKey] = useState<string | null>(null);
  const [accountSelectorInitialValue, setAccountSelectorInitialValue] = useState<string | undefined>(undefined);

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

  // Saving state
  const [saving, setSaving] = useState(false);

  // Validation state
  const [isValidated, setIsValidated] = useState(false);
  const [validationResults, setValidationResults] = useState<{ label: string; passed: boolean; detail?: string; action?: { label: string; onClick: () => void }; subItems?: { label: string; detail?: string; action?: { label: string; onClick: () => void } }[] }[]>([]);
  const [validationModalVisible, setValidationModalVisible] = useState(false);

  // View Accounting modal
  const [accountingModalVisible, setAccountingModalVisible] = useState(false);

  // Import Lines modal
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState<{ type: string; amount: number; description: string }[]>([]);
  const [pasteText, setPasteText] = useState('');

  // API Preview modal
  const [apiPreviewVisible, setApiPreviewVisible] = useState(false);
  const [apiPreviewData, setApiPreviewData] = useState<{ url: string; body: string } | null>(null);

  // API Log (last request/response)
  const [apiLog, setApiLog] = useState<{ url: string; method: string; requestBody: string; responseBody: string; status: string; httpStatus: number; timestamp: string } | null>(null);

  // Pre-fill from initialData (Quick Create task)
  useEffect(() => {
    if (initialData) {
      const formValues: Record<string, any> = {};
      if (initialData.supplier) formValues.supplier = initialData.supplier;
      if (initialData.supplierNumber) formValues.supplierNumber = initialData.supplierNumber;
      if (initialData.invoiceNumber) formValues.invoiceNumber = initialData.invoiceNumber;
      if (initialData.invoiceAmount) formValues.invoiceAmount = initialData.invoiceAmount;
      if (initialData.invoiceDate) formValues.invoiceDate = initialData.invoiceDate;
      if (initialData.description) formValues.description = initialData.description;
      if (initialData.invoiceCurrency) formValues.invoiceCurrency = initialData.invoiceCurrency;
      if (initialData.businessUnit) formValues.businessUnit = initialData.businessUnit;
      if (initialData.invoiceType) formValues.invoiceType = initialData.invoiceType;
      form.setFieldsValue(formValues);
      setHeaderValues((prev) => ({ ...prev, ...formValues }));

      // Set tax rate based on tax code
      if (initialData.taxCode) {
        if (initialData.taxCode === 'VAT 5%') setTaxRate(5);
        else if (initialData.taxCode === 'Zero Rated' || initialData.taxCode === 'Exempt' || initialData.taxCode === 'Out of Scope') setTaxRate(0);
        else setTaxRate(5);
      }

      // Pre-fill the first line with amount and description
      const firstLine = createBlankLine(1);
      if (initialData.invoiceAmount) {
        if (initialData.includingTax && initialData.taxCode === 'VAT 5%') {
          // Amount includes tax: back-calculate line amount
          const rate = 5;
          firstLine.amount = Math.round((initialData.invoiceAmount / (1 + rate / 100)) * 100) / 100;
        } else {
          firstLine.amount = initialData.invoiceAmount;
        }
      }
      if (initialData.taxCode) {
        firstLine.taxClassification = initialData.taxCode;
        // Compute line-level tax
        const lineRate = getTaxRateForClassification(initialData.taxCode);
        firstLine.taxAmount = Math.round(firstLine.amount * (lineRate / 100) * 100) / 100;
      }
      if (initialData.description) firstLine.description = initialData.description;
      if (initialData.invoiceDate && initialData.invoiceDate.format) {
        const formattedDate = initialData.invoiceDate.format('DD-MMM-YYYY');
        firstLine.accountingDate = formattedDate;
        firstLine.startDate = formattedDate;
        firstLine.endDate = getEndOfMonth(formattedDate);
      }
      // Default accrual account from liability distribution
      firstLine.accrualAccount = '02-00-00-2313101-0000-000-00-000-000';
      setLines([firstLine]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch suppliers
  const fetchSuppliers = async () => {
    setSupplierLoading(true);
    try {
      const response = await fetch(APEX_SUPPLIERS_URL, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
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
      message.error('Failed to fetch suppliers');
    } finally {
      setSupplierLoading(false);
    }
  };

  const openSupplierModal = () => {
    setSupplierModalVisible(true);
    setSupplierSearchText('');
    if (suppliers.length === 0) fetchSuppliers();
  };

  const handleSupplierSelect = (record: SupplierRecord) => {
    form.setFieldsValue({
      supplier: record.supplier,
      supplierNumber: record.supplierNumber,
      supplierSite: '',
    });
    setSupplierModalVisible(false);
    message.success(`Selected: ${record.supplier}`);
  };

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

  // Fetch supplier balance dashboard (summary + aging)
  const fetchBalanceDashboard = async (supplierNum: string) => {
    setBalanceLoading(true);
    setBalanceSummary(null);
    setAgingReport([]);
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/dashboard/${supplierNum}`;
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
  const fetchBalanceInvoices = async (supplierNum: string) => {
    setBalanceInvoicesLoading(true);
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/invoices/${supplierNum}`;
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
  const fetchBalancePayments = async (supplierNum: string) => {
    setBalancePaymentsLoading(true);
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/suppliers/balance/payments/${supplierNum}`;
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
    const supplierName = form.getFieldValue('supplier');
    const supplierNum = form.getFieldValue('supplierNumber');
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

  const supplierColumns: ColumnsType<SupplierRecord> = [
    { title: 'Supplier Number', dataIndex: 'supplierNumber', key: 'supplierNumber', width: 130, sorter: (a, b) => a.supplierNumber.localeCompare(b.supplierNumber) },
    { title: 'Supplier Name', dataIndex: 'supplier', key: 'supplier', width: 280, ellipsis: true, sorter: (a, b) => a.supplier.localeCompare(b.supplier) },
    { title: 'Alternative Name', dataIndex: 'alternativeName', key: 'alternativeName', width: 200, ellipsis: true },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: (status: string) => <Tag color={status === 'ACTIVE' ? 'green' : 'red'}>{status}</Tag> },
    { title: 'Taxpayer ID', dataIndex: 'taxpayerId', key: 'taxpayerId', width: 120 },
    {
      title: 'Action', key: 'action', width: 80,
      render: (_: any, record: SupplierRecord) => (
        <Button type="link" size="small" onClick={() => handleSupplierSelect(record)} style={{ color: REDWOOD.info }}>Select</Button>
      ),
    },
  ];

  // Line management
  const addLine = () => {
    const nextLine = lines.length + 1;
    // Inherit accounting date from header invoice date, tax classification, and accrual account
    const invoiceDate = form.getFieldValue('invoiceDate');
    const defaultAcctDate = invoiceDate?.format?.('DD-MMM-YYYY') || '';
    const existingTax = lines.find((l) => l.taxClassification)?.taxClassification || '';
    const defaultAccrual = form.getFieldValue('liabilityDistribution') || '';
    setLines([...lines, createBlankLine(nextLine, { accountingDate: defaultAcctDate, taxClassification: existingTax, accrualAccount: defaultAccrual })]);
  };

  const removeLines = () => {
    if (selectedLineKeys.length === 0) {
      message.warning('Select lines to delete');
      return;
    }
    const filtered = lines.filter((l) => !selectedLineKeys.includes(l.key));
    const renumbered = filtered.map((l, idx) => ({ ...l, lineNumber: idx + 1 }));
    setLines(renumbered);
    setSelectedLineKeys([]);
  };

  // ========== Import Lines Logic ==========
  const VALID_TYPES = ['Item', 'Freight', 'Miscellaneous', 'Tax', 'Prepay'];

  const normalizeType = (raw: string): string => {
    if (!raw) return 'Item';
    const lower = raw.trim().toLowerCase();
    const match = VALID_TYPES.find((t) => t.toLowerCase() === lower);
    return match || 'Item';
  };

  const parseImportRows = (rows: Record<string, any>[]): { type: string; amount: number; description: string }[] => {
    return rows
      .map((row) => {
        // Flexible column matching (case-insensitive)
        const keys = Object.keys(row);
        const findCol = (names: string[]) => keys.find((k) => names.includes(k.trim().toLowerCase()));
        const typeKey = findCol(['type', 'line type', 'linetype']);
        const amountKey = findCol(['amount', 'line amount', 'lineamount', 'amt']);
        const descKey = findCol(['description', 'desc', 'line description', 'linedescription', 'memo']);

        const rawAmt = amountKey ? row[amountKey] : 0;
        const amount = typeof rawAmt === 'number' ? rawAmt : parseFloat(String(rawAmt).replace(/,/g, '')) || 0;

        return {
          type: normalizeType(typeKey ? String(row[typeKey]) : ''),
          amount,
          description: descKey ? String(row[descKey] || '') : '',
        };
      })
      .filter((r) => r.amount !== 0 || r.description.trim() !== '');
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json(firstSheet);
        const parsed = parseImportRows(jsonRows as Record<string, any>[]);
        if (parsed.length === 0) {
          message.warning('No valid rows found in file. Ensure columns: Type, Amount, Description');
          return;
        }
        setImportPreviewData(parsed);
        message.success(`${parsed.length} line(s) parsed from file`);
      } catch {
        message.error('Failed to parse file. Please use the template format.');
      }
    };
    reader.readAsArrayBuffer(file);
    return false; // prevent antd auto upload
  };

  const handlePasteImport = () => {
    if (!pasteText.trim()) {
      message.warning('Paste data first');
      return;
    }
    // Parse tab/comma separated text
    const rawLines = pasteText.trim().split('\n');
    const parsed: { type: string; amount: number; description: string }[] = [];

    for (const rawLine of rawLines) {
      // Try tab-separated first, then comma
      const cols = rawLine.includes('\t') ? rawLine.split('\t') : rawLine.split(',');
      if (cols.length >= 2) {
        const firstCol = cols[0].trim();
        // Detect if first col is a type or an amount
        const isType = VALID_TYPES.some((t) => t.toLowerCase() === firstCol.toLowerCase());
        if (isType) {
          parsed.push({
            type: normalizeType(firstCol),
            amount: parseFloat(String(cols[1]).replace(/,/g, '')) || 0,
            description: (cols.slice(2).join(',') || '').trim(),
          });
        } else {
          // Assume: amount, description (default type Item)
          const amt = parseFloat(String(cols[0]).replace(/,/g, ''));
          if (!isNaN(amt)) {
            parsed.push({
              type: 'Item',
              amount: amt,
              description: (cols.slice(1).join(',') || '').trim(),
            });
          }
        }
      }
    }

    if (parsed.length === 0) {
      message.warning('No valid rows detected. Use format: Type, Amount, Description (or just Amount, Description)');
      return;
    }
    setImportPreviewData(parsed);
    message.success(`${parsed.length} line(s) parsed from pasted data`);
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Type', 'Amount', 'Description'],
      ['Item', 1000, 'Office Supplies'],
      ['Item', 2500, 'IT Equipment'],
      ['Freight', 150, 'Shipping Charges'],
    ]);
    ws['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoice Lines');
    XLSX.writeFile(wb, 'invoice_lines_template.xlsx');
    message.success('Template downloaded');
  };

  const handleConfirmImport = () => {
    if (importPreviewData.length === 0) {
      message.warning('No lines to import');
      return;
    }
    const invoiceDate = form.getFieldValue('invoiceDate');
    const defaultAcctDate = invoiceDate?.format?.('DD-MMM-YYYY') || '';
    const existingTax = lines.find((l) => l.taxClassification)?.taxClassification || '';
    const defaultAccrual = form.getFieldValue('liabilityDistribution') || '';

    // Filter out empty placeholder lines
    const existingNonEmpty = lines.filter((l) => l.amount !== 0 || l.description.trim() !== '' || l.distributionCombination);
    const startNum = existingNonEmpty.length + 1;

    const newLines = importPreviewData.map((row, idx) => {
      const line = createBlankLine(startNum + idx, { accountingDate: defaultAcctDate, taxClassification: existingTax, accrualAccount: defaultAccrual });
      line.type = row.type;
      line.amount = row.amount;
      line.description = row.description;
      // Compute tax
      const lineRate = getTaxRateForClassification(existingTax);
      line.taxAmount = Math.round(row.amount * (lineRate / 100) * 100) / 100;
      return line;
    });

    // If first line is empty placeholder, replace it
    const firstLineEmpty = lines.length === 1 && lines[0].amount === 0 && !lines[0].description && !lines[0].distributionCombination;
    if (firstLineEmpty) {
      // Renumber imported lines from 1
      newLines.forEach((l, i) => { l.lineNumber = i + 1; });
      setLines(newLines);
    } else {
      setLines([...existingNonEmpty, ...newLines]);
    }

    setImportModalVisible(false);
    setImportPreviewData([]);
    setPasteText('');
    setIsValidated(false);
    message.success(`${newLines.length} line(s) imported`);
  };

  const updateLine = useCallback((key: string, field: string, value: any) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const updated = { ...line, [field]: value };
        if (field === 'quantity' || field === 'unitPrice') {
          updated.amount = (field === 'quantity' ? value : updated.quantity) * (field === 'unitPrice' ? value : updated.unitPrice);
        }
        // Recalculate line-level tax when amount or taxClassification changes
        if (field === 'amount' || field === 'quantity' || field === 'unitPrice' || field === 'taxClassification') {
          const lineAmount = updated.amount || 0;
          const lineRate = getTaxRateForClassification(updated.taxClassification);
          updated.taxAmount = Math.round(lineAmount * (lineRate / 100) * 100) / 100;
        }
        // Auto-derive multiperiod dates when accounting date changes
        if (field === 'accountingDate' && value) {
          updated.startDate = value;
          updated.endDate = getEndOfMonth(value);
        }
        return updated;
      })
    );
    setIsValidated(false);
  }, []);

  // Open account selector for a line
  const openAccountSelector = (lineKey: string, initialValue?: string) => {
    setEditingLineKey(lineKey);
    setAccountSelectorInitialValue(initialValue);
    setAccountSelectorVisible(true);
  };

  // Handle account code validation on blur
  const handleAccountBlur = async (lineKey: string, accountCode: string) => {
    if (!accountCode || accountCode.trim() === '' || !accountCode.includes('-')) return;

    try {
      const result = await validateAccountCode(accountCode);
      if (!result.segmentsLoaded) {
        message.info('Could not load segment data for validation.');
        return;
      }
      if (!result.isValid) {
        message.warning(`Invalid segment value(s): ${result.invalidSegments.join(', ')}. Please correct using the account selector.`);
        setLines((prev) =>
          prev.map((line) =>
            line.key === lineKey ? { ...line, distributionCombination: result.validatedCode } : line
          )
        );
        openAccountSelector(lineKey, result.validatedCode);
      } else {
        message.success('Account code validated successfully');
      }
    } catch (error) {
      console.error('Error validating account code:', error);
    }
  };

  // Handle account selection from popup
  const handleAccountSelect = (accountCode: string, segments: Record<string, { value: string; description: string }>) => {
    if (editingLineKey === '__liability__') {
      // Liability distribution (header)
      form.setFieldValue('liabilityDistribution', accountCode);
      setHeaderValues((prev) => ({ ...prev, liabilityDistribution: accountCode }));
    } else if (editingLineKey) {
      setLines((prev) =>
        prev.map((line) =>
          line.key === editingLineKey ? { ...line, distributionCombination: accountCode } : line
        )
      );
    }
    setAccountSelectorVisible(false);
    setEditingLineKey(null);
  };

  // Totals
  const linesTotal = useMemo(() => {
    return lines.reduce((sum, l) => sum + (l.amount || 0), 0);
  }, [lines]);

  // Tax total based on dynamic tax rate
  const taxTotal = useMemo(() => linesTotal * (taxRate / 100), [linesTotal, taxRate]);

  // Tally validation: header amount must equal lines total + tax
  const headerInvoiceAmount = headerValues.invoiceAmount || 0;
  const computedTotal = linesTotal + taxTotal;
  const isTallyMismatch = useMemo(() => {
    if (!isHeaderComplete) return false;
    if (linesTotal === 0) return false;
    return Math.abs(headerInvoiceAmount - computedTotal) > 0.01;
  }, [isHeaderComplete, headerInvoiceAmount, computedTotal, linesTotal]);

  // Invoice Actions dropdown menu items
  const invoiceActionItems: MenuProps['items'] = [
    {
      key: 'calculateTax',
      icon: <CalculatorOutlined />,
      label: 'Calculate Tax',
    },
    { type: 'divider' },
    {
      key: 'applyPrepayment',
      icon: <DollarOutlined />,
      label: 'Apply Prepayment',
    },
    {
      key: 'placeHold',
      icon: <LockOutlined />,
      label: 'Place Hold',
    },
    {
      key: 'releaseHold',
      icon: <UnlockOutlined />,
      label: 'Release Hold',
    },
    { type: 'divider' },
    {
      key: 'initiateApproval',
      icon: <SendOutlined />,
      label: 'Initiate Approval',
    },
    {
      key: 'cancelInvoice',
      icon: <StopOutlined />,
      label: 'Cancel Invoice',
    },
    {
      key: 'reverseInvoice',
      icon: <RollbackOutlined />,
      label: 'Reverse Invoice',
    },
    { type: 'divider' },
    {
      key: 'duplicate',
      icon: <CopyOutlined />,
      label: 'Duplicate Invoice',
    },
  ];

  // Handle invoice action menu clicks
  // Run all validations and show checklist
  const runValidation = () => {
    const values = form.getFieldsValue();
    const results: { label: string; passed: boolean; detail?: string }[] = [];

    // 1. Required header fields
    const requiredFields = ['businessUnit', 'invoiceNumber', 'invoiceCurrency', 'invoiceAmount', 'invoiceDate', 'supplier', 'invoiceType', 'paymentTerms'];
    const missingHeader = requiredFields.filter((f) => !values[f]);
    results.push({
      label: 'Required header fields',
      passed: missingHeader.length === 0,
      detail: missingHeader.length > 0 ? `Missing: ${missingHeader.join(', ')}` : undefined,
    });

    // 2. Liability Distribution
    const liabilityDist = values.liabilityDistribution;
    results.push({
      label: 'Liability Distribution',
      passed: !!liabilityDist && liabilityDist.trim() !== '',
      detail: !liabilityDist ? 'Liability distribution is required' : undefined,
    });

    // 3. Line distributions — check every line that has data
    const activeLines = lines.filter((l) => l.amount !== 0 || l.description);
    const linesWithoutDist = activeLines.filter(
      (l) => !l.distributionCombination && !l.distributionSet
    );
    const hasLineData = activeLines.length > 0;
    results.push({
      label: 'Line distributions',
      passed: linesWithoutDist.length === 0 && hasLineData,
      detail: !hasLineData
        ? 'At least one line is required'
        : linesWithoutDist.length > 0
        ? `${linesWithoutDist.length} line(s) missing distribution`
        : undefined,
      subItems: linesWithoutDist.map((l) => ({
        label: `Line ${l.lineNumber}`,
        detail: `${l.description || l.type || 'Item'} — ${formatAmount(l.amount)}`,
        action: {
          label: 'Select Distribution',
          onClick: () => {
            setValidationModalVisible(false);
            setTimeout(() => openAccountSelector(l.key, ''), 150);
          },
        },
      })),
    });

    // 4. Invoice amount vs lines + tax tally
    const hdrAmt = values.invoiceAmount || 0;
    const tallyOk = linesTotal === 0 || Math.abs(hdrAmt - computedTotal) <= 0.01;
    results.push({
      label: 'Amount tally (Header vs Lines + Tax)',
      passed: tallyOk,
      detail: !tallyOk ? `Header: ${formatAmount(hdrAmt)}, Lines + Tax: ${formatAmount(computedTotal)}` : undefined,
      action: !tallyOk && computedTotal > 0 ? {
        label: `Update header to ${formatAmount(computedTotal)}`,
        onClick: () => {
          form.setFieldValue('invoiceAmount', computedTotal);
          setHeaderValues((prev) => ({ ...prev, invoiceAmount: computedTotal }));
          message.success(`Header amount updated to ${formatAmount(computedTotal)}`);
          setValidationModalVisible(false);
          setTimeout(() => runValidation(), 100);
        },
      } : undefined,
    });

    // 5. Conversion rate for non-AED currency
    const currency = values.invoiceCurrency || 'AED';
    const convRate = values.conversionRate;
    const needsRate = currency !== 'AED';
    results.push({
      label: 'Conversion rate (non-AED)',
      passed: !needsRate || (!!convRate && convRate > 0),
      detail: needsRate && !convRate ? `Currency is ${currency} — conversion rate is required` : undefined,
    });

    // 6. At least one line
    results.push({
      label: 'Invoice lines exist',
      passed: lines.some((l) => l.amount !== 0 || l.description),
      detail: !lines.some((l) => l.amount !== 0 || l.description) ? 'Add at least one invoice line' : undefined,
    });

    const allPassed = results.every((r) => r.passed);
    setValidationResults(results);
    setIsValidated(allPassed);
    setValidationModalVisible(true);

    if (allPassed) {
      message.success('Validation passed — invoice is ready to save');
    }
  };

  const handleInvoiceAction = ({ key }: { key: string }) => {
    switch (key) {
      case 'validate':
        runValidation();
        break;
      case 'calculateTax':
        message.info('Calculating tax...');
        break;
      case 'applyPrepayment':
        message.info('Apply prepayment...');
        break;
      case 'placeHold':
        message.info('Placing hold on invoice...');
        break;
      case 'releaseHold':
        message.info('Releasing hold...');
        break;
      case 'initiateApproval':
        message.info('Initiating approval...');
        break;
      case 'cancelInvoice':
        message.warning('Cancel invoice...');
        break;
      case 'reverseInvoice':
        message.warning('Reverse invoice...');
        break;
      case 'duplicate':
        message.info('Duplicating invoice...');
        break;
      default:
        break;
    }
  };

  // Tally check before save
  const validateTally = (): boolean => {
    if (linesTotal > 0 && Math.abs(headerInvoiceAmount - computedTotal) > 0.01) {
      message.error(
        `Invoice amount (${formatAmount(headerInvoiceAmount)}) does not match Lines + Tax total (${formatAmount(computedTotal)}). Please correct before saving.`
      );
      return false;
    }
    return true;
  };

  // Build the combined invoice payload (header + lines)
  const buildInvoicePayload = (values: any) => {
    const invoiceDate = values.invoiceDate?.format('YYYY-MM-DD') || '';

    // Convert DD-MMM-YYYY (display format) to YYYY-MM-DD (API format)
    const toISODate = (dateStr: string): string | null => {
      if (!dateStr) return null;
      // Already in YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
      // Convert DD-MMM-YYYY → YYYY-MM-DD
      const months: Record<string, string> = {
        Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
        Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
      };
      const parts = dateStr.split('-');
      if (parts.length === 3 && months[parts[1]]) {
        return `${parts[2]}-${months[parts[1]]}-${parts[0].padStart(2, '0')}`;
      }
      return dateStr;
    };

    // Keep every line the user has in the grid (only drop truly blank rows)
    const validLines = lines.filter(l =>
      l.amount !== 0 || l.description || l.distributionCombination ||
      l.distributionSet || l.poNumber || l.taxClassification ||
      l.unitPrice !== 0 || l.quantity !== 1
    );

    // Helper: remove empty string, null, undefined keys to keep JSON compact
    const clean = (obj: Record<string, any>) => {
      const result: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v !== '' && v !== null && v !== undefined) result[k] = v;
      }
      return result;
    };

    const accountingDate = values.accountingDate?.format?.('YYYY-MM-DD') || invoiceDate || null;

    const payload = clean({
      InvoiceNumber: values.invoiceNumber || null,
      InvoiceCurrency: values.invoiceCurrency || 'AED',
      PaymentCurrency: values.paymentCurrency || values.invoiceCurrency || 'AED',
      InvoiceAmount: values.invoiceAmount || 0,
      InvoiceDate: invoiceDate || null,
      BusinessUnit: values.businessUnit || null,
      Supplier: values.supplier || null,
      SupplierNumber: values.supplierNumber || null,
      SupplierSite: values.supplierSite || null,
      InvoiceType: values.invoiceType || 'Standard',
      Description: values.description || null,
      LegalEntity: values.legalEntity || null,
      InvoiceGroup: values.invoiceGroup || null,
      InvoiceSource: 'MANUAL',
      PaymentTerms: values.paymentTerms || null,
      AccountingDate: accountingDate,
      TermsDate: values.termsDate?.format?.('YYYY-MM-DD') || null,
      GoodsReceivedDate: values.goodsReceivedDate?.format?.('YYYY-MM-DD') || null,
      PayGroup: values.payGroup || null,
      PaymentMethod: values.paymentMethod || null,
      PayAlone: (values.payAlone === 'Yes' || values.payAlone === 'Y') ? 'Y' : 'N',
      // Accounting tab fields
      LiabilityDistribution: values.liabilityDistribution || null,
      ConversionRateType: values.conversionRateType || null,
      ConversionDate: values.conversionDate?.format?.('YYYY-MM-DD') || null,
      ConversionRate: values.conversionRate || null,
      DocumentCategory: values.documentCategory || null,
      VoucherNumber: values.voucherNumber || null,
      FirstPartyTaxRegistrationNumber: values.firstPartyTaxRegistrationNumber || null,
      SupplierTaxRegistrationNumber: values.supplierTaxRegistrationNumber || null,
    });

    // Always include lines array (even if empty) so PL/SQL JSON_TABLE can parse it
    payload.lines = validLines.map(line => clean({
      LineNumber: line.lineNumber,
      LineType: line.type || 'Item',
      LineAmount: line.amount ?? 0,
      Description: line.description || null,
      AccountingDate: toISODate(line.accountingDate) || invoiceDate || null,
      DistributionCombination: line.distributionCombination || null,
      DistributionSet: line.distributionSet || null,
      TaxClassification: line.taxClassification || null,
      Quantity: line.quantity || null,
      UnitPrice: line.unitPrice || null,
      UOM: line.uomName || null,
      PONumber: line.poNumber || null,
      POLineNumber: line.poLine || null,
      ReceiptNumber: line.receiptNumber || null,
      ReceiptLineNumber: line.receiptLine || null,
      ShipToLocation: line.shipToLocation || null,
    }));

    console.log('Invoice payload lines:', lines.length, 'total,', validLines.length, 'valid, payload:', JSON.stringify(payload).length, 'chars');
    return payload;
  };

  // POST combined invoice (header + lines) to APEX
  const saveInvoice = async (values: any): Promise<boolean> => {
    setSaving(true);
    const payload = buildInvoicePayload(values);
    const url = `${APEX_DB_CONFIG.baseUrl}/ap/createinvoicefull`;
    const requestBody = JSON.stringify(payload, null, 2);
    const timestamp = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

    try {
      console.log('POST Invoice (Full):', url, payload);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Read response as text first (ORDS may return HTML error pages, not JSON)
      const responseText = await response.text();
      let data: any = null;
      let responseBody = responseText;

      try {
        data = JSON.parse(responseText);
        responseBody = JSON.stringify(data, null, 2);
      } catch {
        // Response is not JSON (e.g. ORDS PL/SQL error page)
        data = null;
      }
      console.log('Invoice Response:', response.status, data || responseText);

      // If response is not JSON or not OK, show the raw server error
      if (!data) {
        setApiLog({
          url,
          method: 'POST',
          requestBody,
          responseBody: responseText || '(empty response)',
          status: 'SERVER_ERROR',
          httpStatus: response.status,
          timestamp,
        });
        message.error(`Server error (HTTP ${response.status}): Check API Log for details`);
        return false;
      }

      // Update API log
      setApiLog({
        url,
        method: 'POST',
        requestBody,
        responseBody,
        status: data.status || (response.ok ? 'SUCCESS' : 'ERROR'),
        httpStatus: response.status,
        timestamp,
      });

      if (data.status !== 'SUCCESS' || !data.success) {
        message.error(`Failed: ${data.message || 'Unknown error'}`);
        return false;
      }

      const invoiceId = data.invoiceId || 0;
      message.success(data.message || `Invoice created (ID: ${invoiceId})`);

      // Notify parent
      if (onSave) onSave({ ...values, invoiceId });

      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Save invoice error:', error);
      // Log the error
      setApiLog({
        url,
        method: 'POST',
        requestBody,
        responseBody: JSON.stringify({ error: errorMsg }, null, 2),
        status: 'NETWORK_ERROR',
        httpStatus: 0,
        timestamp,
      });
      message.error(`Failed to save invoice: ${errorMsg}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Save and create next handler
  const handleSaveAndCreateNext = async () => {
    try {
      const values = await form.validateFields();
      if (!validateTally()) return;

      const success = await saveInvoice(values);
      if (success) {
        message.success('Invoice saved. Creating next...');
        // Reset form and lines for next invoice
        form.resetFields();
        setLines([createBlankLine(1)]);
        setSelectedLineKeys([]);
        setHeaderValues({ invoiceType: 'Standard', invoiceCurrency: 'AED' });
        setTaxRate(5);
        setIsValidated(false);
      }
    } catch {
      message.error('Please fill in required fields');
    }
  };

  // Save handler
  const handleSave = async (): Promise<boolean> => {
    try {
      const values = await form.validateFields();
      if (!validateTally()) return false;

      const success = await saveInvoice(values);
      if (success) {
        message.success('Invoice saved successfully');
      }
      return success;
    } catch (err) {
      console.log('Validation failed:', err);
      message.error('Please fill in required fields');
      return false;
    }
  };

  // Show API preview (URL + JSON body for Postman testing)
  const handleApiPreview = () => {
    const values = form.getFieldsValue();
    const payload = buildInvoicePayload(values);
    const url = `${APEX_DB_CONFIG.baseUrl}/ap/createinvoicefull`;

    setApiPreviewData({
      url,
      body: JSON.stringify(payload, null, 2),
    });
    setApiPreviewVisible(true);
  };

  // ========== Distribution Tab Columns (matching Fusion Payables) ==========
  const distributionColumns: ColumnsType<InvoiceLine> = [
    {
      title: 'Number',
      dataIndex: 'lineNumber',
      key: 'lineNumber',
      width: 65,
      align: 'center',
      render: (val: number) => <Text style={{ fontSize: 12 }}>{val}</Text>,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (val: string, record: InvoiceLine) => (
        <Select
          size="small"
          value={val}
          onChange={(v) => updateLine(record.key, 'type', v)}
          style={{ width: '100%' }}
          variant="borderless"
        >
          <Option value="Item">Item</Option>
          <Option value="Freight">Freight</Option>
          <Option value="Miscellaneous">Miscellaneous</Option>
          <Option value="Tax">Tax</Option>
          <Option value="Prepay">Prepay</Option>
        </Select>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 130,
      align: 'right',
      render: (val: number, record: InvoiceLine) => (
        <InputNumber
          size="small"
          value={val}
          onChange={(v) => updateLine(record.key, 'amount', v || 0)}
          min={0}
          precision={2}
          style={{ width: '100%', fontWeight: 600 }}
          variant="borderless"
        />
      ),
    },
    {
      title: 'Distribution Set',
      dataIndex: 'distributionSet',
      key: 'distributionSet',
      width: 160,
      render: (val: string, record: InvoiceLine) => (
        <Input
          size="small"
          value={val}
          onChange={(e) => updateLine(record.key, 'distributionSet', e.target.value)}
          variant="borderless"
          placeholder=""
          suffix={<SearchOutlined style={{ color: REDWOOD.neutral300, fontSize: 11 }} />}
        />
      ),
    },
    {
      title: 'Distribution Combination',
      dataIndex: 'distributionCombination',
      key: 'distributionCombination',
      width: 250,
      render: (val: string, record: InvoiceLine) => (
        <Input
          size="small"
          value={val}
          onChange={(e) => updateLine(record.key, 'distributionCombination', e.target.value)}
          onBlur={(e) => handleAccountBlur(record.key, e.target.value)}
          placeholder="e.g. 01-000-2100-0000-000"
          variant="borderless"
          suffix={
            <SearchOutlined
              style={{ color: REDWOOD.info, fontSize: 12, cursor: 'pointer' }}
              onClick={() => openAccountSelector(record.key, val)}
            />
          }
        />
      ),
    },
    {
      title: 'Accounting Date',
      dataIndex: 'accountingDate',
      key: 'accountingDate',
      width: 150,
      render: (val: string, record: InvoiceLine) => (
        <DatePicker
          size="small"
          value={val ? dayjs(val, 'DD-MMM-YYYY') : null}
          onChange={(d) => updateLine(record.key, 'accountingDate', d ? d.format('DD-MMM-YYYY') : '')}
          format="DD-MMM-YYYY"
          variant="borderless"
          placeholder="dd-mmm-yyyy"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Prorate Across All Item Lines',
      dataIndex: 'prorateAcrossAllItemLines',
      key: 'prorateAcrossAllItemLines',
      width: 200,
      render: (val: string, record: InvoiceLine) => (
        <Select
          size="small"
          value={val || 'No'}
          onChange={(v) => updateLine(record.key, 'prorateAcrossAllItemLines', v)}
          style={{ width: '100%' }}
          variant="borderless"
        >
          <Option value="Yes">Yes</Option>
          <Option value="No">No</Option>
        </Select>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 220,
      render: (val: string, record: InvoiceLine) => (
        <Input
          size="small"
          value={val}
          onChange={(e) => updateLine(record.key, 'description', e.target.value)}
          placeholder=""
          variant="borderless"
        />
      ),
    },
    {
      title: 'Tax Classification',
      dataIndex: 'taxClassification',
      key: 'taxClassification',
      width: 160,
      render: (val: string, record: InvoiceLine) => (
        <Select
          size="small"
          value={val || undefined}
          onChange={(v) => updateLine(record.key, 'taxClassification', v)}
          style={{ width: '100%' }}
          variant="borderless"
          placeholder=""
          allowClear
        >
          <Option value="VAT 5%">VAT 5%</Option>
          <Option value="Zero Rated">Zero Rated</Option>
          <Option value="Exempt">Exempt</Option>
          <Option value="Reverse Charge">Reverse Charge</Option>
          <Option value="Out of Scope">Out of Scope</Option>
        </Select>
      ),
    },
    {
      title: 'Tax Amount',
      dataIndex: 'taxAmount',
      key: 'taxAmount',
      width: 110,
      align: 'right',
      render: (val: number, record: InvoiceLine) => {
        const rate = getTaxRateForClassification(record.taxClassification);
        const computed = Math.round((record.amount || 0) * (rate / 100) * 100) / 100;
        return (
          <Text style={{ fontSize: 12, fontWeight: 600, color: computed > 0 ? REDWOOD.info : REDWOOD.neutral600 }}>
            {computed > 0 ? formatAmount(computed) : '0.00'}
          </Text>
        );
      },
    },
    {
      title: 'Ship-to Location',
      dataIndex: 'shipToLocation',
      key: 'shipToLocation',
      width: 160,
      render: (val: string, record: InvoiceLine) => (
        <Input
          size="small"
          value={val}
          onChange={(e) => updateLine(record.key, 'shipToLocation', e.target.value)}
          variant="borderless"
          placeholder=""
          suffix={<SearchOutlined style={{ color: REDWOOD.neutral300, fontSize: 11 }} />}
        />
      ),
    },
  ];

  // ========== Purchase Orders Tab Columns ==========
  const poColumns: ColumnsType<InvoiceLine> = [
    {
      title: 'Line',
      dataIndex: 'lineNumber',
      key: 'lineNumber',
      width: 50,
      align: 'center',
      render: (val: number) => <Text type="secondary" style={{ fontSize: 12 }}>{val}</Text>,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 130,
      align: 'right',
      render: (val: number) => <Text strong style={{ fontSize: 12 }}>{formatAmount(val)}</Text>,
    },
    {
      title: 'PO Number',
      dataIndex: 'poNumber',
      key: 'poNumber',
      width: 130,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'poNumber', e.target.value)} variant="borderless" placeholder="" suffix={<SearchOutlined style={{ color: REDWOOD.neutral300, fontSize: 11 }} />} />
      ),
    },
    {
      title: 'PO Line',
      dataIndex: 'poLine',
      key: 'poLine',
      width: 80,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'poLine', e.target.value)} variant="borderless" />
      ),
    },
    {
      title: 'PO Schedule',
      dataIndex: 'poSchedule',
      key: 'poSchedule',
      width: 100,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'poSchedule', e.target.value)} variant="borderless" />
      ),
    },
    {
      title: 'Receipt Number',
      dataIndex: 'receiptNumber',
      key: 'receiptNumber',
      width: 130,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'receiptNumber', e.target.value)} variant="borderless" />
      ),
    },
    {
      title: 'Receipt Line',
      dataIndex: 'receiptLine',
      key: 'receiptLine',
      width: 100,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'receiptLine', e.target.value)} variant="borderless" />
      ),
    },
    {
      title: 'Consumption Advice Number',
      dataIndex: 'consumptionAdviceNumber',
      key: 'consumptionAdviceNumber',
      width: 190,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'consumptionAdviceNumber', e.target.value)} variant="borderless" />
      ),
    },
    {
      title: 'Consumption Advice Line',
      dataIndex: 'consumptionAdviceLine',
      key: 'consumptionAdviceLine',
      width: 170,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'consumptionAdviceLine', e.target.value)} variant="borderless" />
      ),
    },
    {
      title: 'Ship-to Location',
      dataIndex: 'shipToLocation',
      key: 'shipToLocation',
      width: 150,
      render: (val: string, record: InvoiceLine) => (
        <Input size="small" value={val} onChange={(e) => updateLine(record.key, 'shipToLocation', e.target.value)} variant="borderless" suffix={<SearchOutlined style={{ color: REDWOOD.neutral300, fontSize: 11 }} />} />
      ),
    },
    {
      title: 'Start Date',
      dataIndex: 'startDate',
      key: 'startDate',
      width: 140,
      render: (val: string, record: InvoiceLine) => (
        <DatePicker
          size="small"
          value={val ? dayjs(val, 'DD-MMM-YYYY') : null}
          onChange={(d) => updateLine(record.key, 'startDate', d ? d.format('DD-MMM-YYYY') : '')}
          format="DD-MMM-YYYY"
          variant="borderless"
          placeholder="dd-mmm-yyyy"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'End Date',
      dataIndex: 'endDate',
      key: 'endDate',
      width: 140,
      render: (val: string, record: InvoiceLine) => (
        <DatePicker
          size="small"
          value={val ? dayjs(val, 'DD-MMM-YYYY') : null}
          onChange={(d) => updateLine(record.key, 'endDate', d ? d.format('DD-MMM-YYYY') : '')}
          format="DD-MMM-YYYY"
          variant="borderless"
          placeholder="dd-mmm-yyyy"
          style={{ width: '100%' }}
        />
      ),
    },
  ];

  // ========== Multiperiod Accounting Tab Columns ==========
  const multiperiodColumns: ColumnsType<InvoiceLine> = [
    {
      title: 'Line',
      dataIndex: 'lineNumber',
      key: 'lineNumber',
      width: 50,
      align: 'center',
      render: (val: number) => <Text style={{ fontSize: 12 }}>{val}</Text>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 200,
      render: (val: string) => <Text style={{ fontSize: 12 }}>{val || '—'}</Text>,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (val: number) => <Text strong style={{ fontSize: 12 }}>{formatAmount(val)}</Text>,
    },
    {
      title: 'Accounting Date',
      dataIndex: 'accountingDate',
      key: 'accountingDate',
      width: 150,
      render: (val: string, record: InvoiceLine) => (
        <DatePicker
          size="small"
          value={val ? dayjs(val, 'DD-MMM-YYYY') : null}
          onChange={(d) => updateLine(record.key, 'accountingDate', d ? d.format('DD-MMM-YYYY') : '')}
          format="DD-MMM-YYYY"
          variant="borderless"
          placeholder="dd-mmm-yyyy"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Start Date',
      dataIndex: 'startDate',
      key: 'startDate',
      width: 150,
      render: (val: string, record: InvoiceLine) => (
        <DatePicker
          size="small"
          value={val ? dayjs(val, 'DD-MMM-YYYY') : null}
          onChange={(d) => updateLine(record.key, 'startDate', d ? d.format('DD-MMM-YYYY') : '')}
          format="DD-MMM-YYYY"
          variant="borderless"
          placeholder="dd-mmm-yyyy"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'End Date',
      dataIndex: 'endDate',
      key: 'endDate',
      width: 150,
      render: (val: string, record: InvoiceLine) => (
        <DatePicker
          size="small"
          value={val ? dayjs(val, 'DD-MMM-YYYY') : null}
          onChange={(d) => updateLine(record.key, 'endDate', d ? d.format('DD-MMM-YYYY') : '')}
          format="DD-MMM-YYYY"
          variant="borderless"
          placeholder="dd-mmm-yyyy"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Accrual Account',
      dataIndex: 'accrualAccount',
      key: 'accrualAccount',
      width: 250,
      render: (val: string, record: InvoiceLine) => (
        <Input
          size="small"
          value={val}
          onChange={(e) => updateLine(record.key, 'accrualAccount', e.target.value)}
          variant="borderless"
          placeholder="e.g. 01-000-2200-0000-000"
          suffix={
            <SearchOutlined
              style={{ color: REDWOOD.info, fontSize: 12, cursor: 'pointer' }}
              onClick={() => openAccountSelector(record.key, val)}
            />
          }
        />
      ),
    },
  ];

  // Row selection config (shared)
  const rowSelection = {
    selectedRowKeys: selectedLineKeys,
    onChange: (keys: React.Key[]) => setSelectedLineKeys(keys),
  };

  return (
    <div style={{ background: REDWOOD.neutral100, minHeight: 'calc(100vh - 200px)' }}>
      {/* Action Bar - matching Fusion Payables layout */}
      <div
        style={{
          padding: '8px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.neutral200}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Space size={12}>
          <Title level={5} style={{ margin: 0 }}>
            <FileTextOutlined style={{ marginRight: 8, color: REDWOOD.primary }} />
            Create Invoice
          </Title>
        </Space>

        <Space size={8}>
          <Tooltip title="API Preview (Postman)">
            <Button
              icon={<ApiOutlined />}
              onClick={handleApiPreview}
              style={{ color: REDWOOD.info, borderColor: REDWOOD.info }}
            />
          </Tooltip>
          {/* Invoice Actions Dropdown */}
          <Dropdown
            menu={{
              items: invoiceActionItems,
              onClick: handleInvoiceAction,
            }}
            trigger={['click']}
          >
            <Button style={{ fontWeight: 500 }}>
              Invoice Actions <DownOutlined style={{ fontSize: 10 }} />
            </Button>
          </Dropdown>
          <Button
            icon={<CheckSquareOutlined />}
            onClick={runValidation}
            style={{
              fontWeight: 500,
              borderColor: isValidated ? REDWOOD.success : REDWOOD.primary,
              color: isValidated ? REDWOOD.success : REDWOOD.primary,
            }}
          >
            {isValidated ? 'Validated' : 'Validate'}
          </Button>
          <Tooltip title={!isValidated ? 'Run validation first' : ''}>
            <Button
              icon={<AccountBookOutlined />}
              onClick={() => setAccountingModalVisible(true)}
              disabled={!isValidated}
              style={{
                fontWeight: 500,
                borderColor: isValidated ? REDWOOD.info : undefined,
                color: isValidated ? REDWOOD.info : undefined,
              }}
            >
              View Accounting
            </Button>
          </Tooltip>
          <Button onClick={handleSaveAndCreateNext} loading={saving} disabled={saving || !isValidated}>
            Save and Create Next
          </Button>
          <Button
            type="primary"
            onClick={handleSave}
            loading={saving}
            disabled={saving || !isValidated}
            style={{ background: isValidated ? REDWOOD.primary : undefined, borderColor: isValidated ? REDWOOD.primary : undefined }}
          >
            Save
          </Button>
          <Button
            type="primary"
            onClick={async () => { const success = await handleSave(); if (success !== false) onClose(); }}
            loading={saving}
            disabled={saving || !isValidated}
            style={{ background: isValidated ? REDWOOD.primary : undefined, borderColor: isValidated ? REDWOOD.primary : undefined }}
          >
            Save and Close
          </Button>
          <Button onClick={onClose}>
            Cancel
          </Button>
        </Space>
      </div>

      <div style={{ padding: '16px 24px' }}>
        {/* ========== INVOICE HEADER ========== */}
        <Card
          style={{
            marginBottom: 12,
            borderRadius: 8,
            border: `1px solid ${REDWOOD.neutral200}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
          bodyStyle={{ padding: '8px 16px 4px' }}
        >
          <div style={{ marginBottom: 4 }}>
            <Text strong style={{ fontSize: 13, color: REDWOOD.neutral900 }}>Invoice Header</Text>
          </div>
          <Form
            form={form}
            layout="horizontal"
            labelCol={{ span: 9 }}
            wrapperCol={{ span: 15 }}
            size="small"
            initialValues={{
              invoiceType: 'Standard',
              invoiceCurrency: 'AED',
              paymentCurrency: 'AED',
              legalEntity: '',
              payGroup: '',
              payAlone: 'No',
              calculateTax: 'Yes',
              liabilityDistribution: '02-00-00-2313101-0000-000-00-000-000',
            }}
            onValuesChange={(changedValues, allValues) => {
              setHeaderValues(allValues);
              setIsValidated(false);
              // Copy invoice date to all lines' accounting date + derive multiperiod dates
              if (changedValues.invoiceDate) {
                const formattedDate = changedValues.invoiceDate.format('DD-MMM-YYYY');
                const endDate = getEndOfMonth(formattedDate);
                setLines((prev) => prev.map((line) => ({
                  ...line,
                  accountingDate: formattedDate,
                  startDate: formattedDate,
                  endDate,
                })));
              }
              // Copy header description to all lines' description
              if ('description' in changedValues) {
                setLines((prev) => prev.map((line) => ({ ...line, description: changedValues.description || '' })));
              }
              // Copy liability distribution to all lines' accrual account
              if ('liabilityDistribution' in changedValues) {
                const accrual = changedValues.liabilityDistribution || '';
                setLines((prev) => prev.map((line) => ({ ...line, accrualAccount: accrual })));
              }
            }}
          >
            <Tabs
              defaultActiveKey="general"
              size="small"
              tabBarStyle={{ marginBottom: 6 }}
              items={[
                {
                  key: 'general',
                  label: (
                    <Space size={4}>
                      <AppstoreOutlined />
                      <span>General</span>
                    </Space>
                  ),
                  children: (
                    <Row gutter={32} style={{ paddingTop: 8 }}>
                      {/* Column 1 */}
                      <Col span={8}>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Business Unit</Text>}
                          name="businessUnit"
                          rules={[{ required: true, message: 'Required' }]}
                          style={{ marginBottom: 4 }}
                        >
                          <Select placeholder="Select Business Unit" showSearch allowClear>
                            <Option value="BUIMERC CORP FZE_JAFZA">BUIMERC CORP FZE_JAFZA</Option>
                            <Option value="BUIMERC CORP_DIFC_INVST">BUIMERC CORP_DIFC_INVST</Option>
                          </Select>
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Invoice Number</Text>}
                          name="invoiceNumber"
                          rules={[{ required: true, message: 'Required' }]}
                          style={{ marginBottom: 4 }}
                        >
                          <Input placeholder="Enter invoice number" />
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Invoice Currency</Text>}
                          name="invoiceCurrency"
                          rules={[{ required: true, message: 'Required' }]}
                          style={{ marginBottom: 4 }}
                        >
                          <Select showSearch optionFilterProp="children" placeholder="Select currency">
                            {CURRENCIES.map((c) => (
                              <Option key={c.code} value={c.code}>{c.code} - {c.name}</Option>
                            ))}
                          </Select>
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Amount</Text>}
                          name="invoiceAmount"
                          rules={[{ required: true, message: 'Required' }]}
                          style={{ marginBottom: 4 }}
                        >
                          <InputNumber
                            style={{ width: '100%' }}
                            placeholder="0.00"
                            precision={2}
                            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={(value) => value!.replace(/,/g, '') as any}
                          />
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Invoice Date</Text>}
                          name="invoiceDate"
                          rules={[{ required: true, message: 'Required' }]}
                          style={{ marginBottom: 4 }}
                        >
                          <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Legal Entity</Text>}
                          name="legalEntity"
                          style={{ marginBottom: 4 }}
                        >
                          <Select placeholder="Select entity" allowClear showSearch>
                            <Option value="BUIMERC CORP FZE">BUIMERC CORP FZE</Option>
                            <Option value="BUIMERC CORP DIFC">BUIMERC CORP DIFC</Option>
                          </Select>
                        </Form.Item>
                      </Col>

                      {/* Column 2 */}
                      <Col span={8}>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Supplier</Text>}
                          required
                          style={{ marginBottom: 4 }}
                        >
                          <Space.Compact style={{ width: '100%' }}>
                            <Form.Item name="supplier" noStyle rules={[{ required: true, message: 'Required' }]}>
                              <Input
                                placeholder="Search supplier..."
                                readOnly
                                suffix={
                                  <SearchOutlined
                                    style={{ color: REDWOOD.info, cursor: 'pointer', fontSize: 14 }}
                                    onClick={openSupplierModal}
                                  />
                                }
                                onClick={openSupplierModal}
                                style={{ cursor: 'pointer', flex: 1 }}
                              />
                            </Form.Item>
                            <Tooltip title="Check Balance">
                              <Button
                                icon={<WalletOutlined />}
                                onClick={handleCheckBalance}
                                style={{ borderColor: REDWOOD.info, color: REDWOOD.info }}
                              />
                            </Tooltip>
                          </Space.Compact>
                        </Form.Item>
                        <Form.Item name="supplierNumber" hidden>
                          <Input />
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Supplier Site</Text>}
                          name="supplierSite"
                          style={{ marginBottom: 4 }}
                        >
                          <Select placeholder="Select site" allowClear>
                            <Option value="SHARJAH">SHARJAH</Option>
                            <Option value="DUBAI">DUBAI</Option>
                            <Option value="ABU DHABI">ABU DHABI</Option>
                          </Select>
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Type</Text>}
                          name="invoiceType"
                          rules={[{ required: true, message: 'Required' }]}
                          style={{ marginBottom: 4 }}
                        >
                          <Select>
                            <Option value="Standard">Standard</Option>
                            <Option value="Prepayment">Prepayment</Option>
                            <Option value="Debit Memo">Debit Memo</Option>
                            <Option value="Credit Memo">Credit Memo</Option>
                          </Select>
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Payment Currency</Text>}
                          name="paymentCurrency"
                          style={{ marginBottom: 4 }}
                        >
                          <Select showSearch optionFilterProp="children">
                            {CURRENCIES.map((c) => (
                              <Option key={c.code} value={c.code}>{c.code} - {c.name}</Option>
                            ))}
                          </Select>
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Pay Group</Text>}
                          name="payGroup"
                          style={{ marginBottom: 4 }}
                        >
                          <Select placeholder="Select pay group" allowClear>
                            <Option value="Standard">Standard</Option>
                            <Option value="Urgent">Urgent</Option>
                            <Option value="Manual">Manual</Option>
                          </Select>
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Pay Alone</Text>}
                          name="payAlone"
                          style={{ marginBottom: 4 }}
                        >
                          <Select>
                            <Option value="No">No</Option>
                            <Option value="Yes">Yes</Option>
                          </Select>
                        </Form.Item>
                      </Col>

                      {/* Column 3 */}
                      <Col span={8}>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Description</Text>}
                          name="description"
                          style={{ marginBottom: 4 }}
                        >
                          <TextArea rows={1} placeholder="Enter description" />
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Invoice Group</Text>}
                          name="invoiceGroup"
                          style={{ marginBottom: 4 }}
                        >
                          <Input placeholder="Enter group" />
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Payment Terms</Text>}
                          name="paymentTerms"
                          rules={[{ required: true, message: 'Required' }]}
                          style={{ marginBottom: 4 }}
                        >
                          <Select placeholder="Select terms" allowClear showSearch>
                            <Option value="Immediate">Immediate</Option>
                            <Option value="Net 15">Net 15</Option>
                            <Option value="Net 30">Net 30</Option>
                            <Option value="Net 45">Net 45</Option>
                            <Option value="Net 60">Net 60</Option>
                            <Option value="Net 90">Net 90</Option>
                          </Select>
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Terms Date</Text>}
                          name="termsDate"
                          style={{ marginBottom: 4 }}
                        >
                          <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Goods Received Date</Text>}
                          name="goodsReceivedDate"
                          style={{ marginBottom: 4 }}
                        >
                          <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Calculate Tax</Text>}
                          name="calculateTax"
                          style={{ marginBottom: 4 }}
                        >
                          <Select>
                            <Option value="Yes">Yes</Option>
                            <Option value="No">No</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                    </Row>
                  ),
                },
                {
                  key: 'accounting',
                  label: (
                    <Space size={4}>
                      <AccountBookOutlined />
                      <span>Accounting</span>
                    </Space>
                  ),
                  children: (
                    <Row gutter={32} style={{ paddingTop: 8 }}>
                      {/* Column 1 */}
                      <Col span={8}>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Accounting Date</Text>}
                          name="accountingDate"
                          style={{ marginBottom: 4 }}
                        >
                          <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Liability Distribution</Text>}
                          required
                          style={{ marginBottom: 4 }}
                        >
                          <Space.Compact style={{ width: '100%' }}>
                            <Form.Item name="liabilityDistribution" noStyle rules={[{ required: true, message: 'Required' }]}>
                              <Input
                                placeholder="e.g. 02-00-00-2313101-0000-000-00-000-000"
                                readOnly
                                style={{ cursor: 'pointer' }}
                                onClick={() => openAccountSelector('__liability__', form.getFieldValue('liabilityDistribution'))}
                              />
                            </Form.Item>
                            <Tooltip title="Select Account">
                              <Button
                                icon={<SearchOutlined />}
                                onClick={() => openAccountSelector('__liability__', form.getFieldValue('liabilityDistribution'))}
                                style={{ borderColor: REDWOOD.info, color: REDWOOD.info }}
                              />
                            </Tooltip>
                          </Space.Compact>
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Document Category</Text>}
                          name="documentCategory"
                          style={{ marginBottom: 4 }}
                        >
                          <Select placeholder="Select category" allowClear showSearch>
                            <Option value="Standard Invoices">Standard Invoices</Option>
                            <Option value="Credit Memos">Credit Memos</Option>
                            <Option value="Prepayments">Prepayments</Option>
                          </Select>
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Voucher Number</Text>}
                          name="voucherNumber"
                          style={{ marginBottom: 4 }}
                        >
                          <Input placeholder="Enter voucher number" />
                        </Form.Item>
                      </Col>

                      {/* Column 2 */}
                      <Col span={8}>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Conversion Rate Type</Text>}
                          name="conversionRateType"
                          style={{ marginBottom: 4 }}
                        >
                          <Select placeholder="Select rate type" allowClear>
                            <Option value="User">User</Option>
                            <Option value="Corporate">Corporate</Option>
                            <Option value="Spot">Spot</Option>
                          </Select>
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Conversion Date</Text>}
                          name="conversionDate"
                          style={{ marginBottom: 4 }}
                        >
                          <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Conversion Rate</Text>}
                          name="conversionRate"
                          style={{ marginBottom: 4 }}
                        >
                          <InputNumber style={{ width: '100%' }} placeholder="0.000000" precision={6} min={0} />
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Inverse Rate</Text>}
                          style={{ marginBottom: 4 }}
                        >
                          <InputNumber
                            style={{ width: '100%' }}
                            placeholder="Auto-calculated"
                            precision={6}
                            disabled
                            value={headerValues?.conversionRate ? (1 / headerValues.conversionRate) : undefined}
                          />
                        </Form.Item>
                      </Col>

                      {/* Column 3 */}
                      <Col span={8}>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>First-Party Tax Reg No.</Text>}
                          name="firstPartyTaxRegistrationNumber"
                          style={{ marginBottom: 4 }}
                        >
                          <Input placeholder="Enter registration number" />
                        </Form.Item>
                        <Form.Item
                          label={<Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Supplier Tax Reg No.</Text>}
                          name="supplierTaxRegistrationNumber"
                          style={{ marginBottom: 4 }}
                        >
                          <Input placeholder="Enter registration number" />
                        </Form.Item>
                      </Col>
                    </Row>
                  ),
                },
              ]}
            />
          </Form>
        </Card>

        {/* ========== INVOICE LINES ========== */}
        <Card
          style={{
            marginBottom: 16,
            borderRadius: 8,
            border: `1px solid ${!isHeaderComplete ? REDWOOD.neutral300 : REDWOOD.neutral200}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            position: 'relative',
          }}
        >
          {/* Lock overlay when header is incomplete */}
          {!isHeaderComplete && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(255, 255, 255, 0.85)',
                zIndex: 5,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                cursor: 'not-allowed',
              }}
            >
              <LockOutlined style={{ fontSize: 32, color: REDWOOD.neutral300, marginBottom: 12 }} />
              <Text style={{ fontSize: 14, color: REDWOOD.neutral600, fontWeight: 500 }}>
                Complete the Invoice Header to enter lines
              </Text>
              <Text type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
                Fill in Business Unit, Invoice Number, Currency, Amount, Date, Supplier, and Type
              </Text>
            </div>
          )}

          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong style={{ fontSize: 14, color: REDWOOD.neutral900 }}>
              Invoice Lines
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>({lines.length} line{lines.length !== 1 ? 's' : ''})</Text>
              {isHeaderComplete && (
                <Tag color="green" style={{ marginLeft: 8, fontSize: 10 }}>
                  <CheckCircleOutlined /> Header Complete
                </Tag>
              )}
            </Text>
            <Space>
              <Button
                size="small"
                icon={<UploadOutlined />}
                onClick={() => { setImportPreviewData([]); setPasteText(''); setImportModalVisible(true); }}
                disabled={!isHeaderComplete}
                style={{ fontSize: 12, borderColor: REDWOOD.info, color: REDWOOD.info }}
              >
                Import Lines
              </Button>
              <Button
                size="small"
                type="primary"
                icon={<PlusOutlined />}
                onClick={addLine}
                disabled={!isHeaderComplete}
                style={{ background: isHeaderComplete ? REDWOOD.info : undefined, borderColor: isHeaderComplete ? REDWOOD.info : undefined, fontSize: 12 }}
              >
                Add Line
              </Button>
              <Button
                size="small"
                icon={<DeleteOutlined />}
                danger
                onClick={removeLines}
                disabled={!isHeaderComplete || selectedLineKeys.length === 0}
                style={{ fontSize: 12 }}
              >
                Delete {selectedLineKeys.length > 0 ? `(${selectedLineKeys.length})` : ''}
              </Button>
            </Space>
          </div>

          <Tabs
            defaultActiveKey="distribution"
            size="small"
            items={[
              {
                key: 'distribution',
                label: (
                  <Space size={4}>
                    <FileTextOutlined />
                    <span>Distribution</span>
                  </Space>
                ),
                children: (
                  <Table
                    columns={distributionColumns}
                    dataSource={lines}
                    size="small"
                    pagination={false}
                    scroll={{ x: 1600 }}
                    rowSelection={rowSelection}
                    summary={() => (
                      <Table.Summary fixed>
                        <Table.Summary.Row>
                          <Table.Summary.Cell index={0} colSpan={2}>
                            <Text strong style={{ fontSize: 12, paddingLeft: 8 }}>Total</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={2} align="right">
                            <Text strong style={{ fontSize: 13, color: REDWOOD.primary }}>
                              {formatAmount(linesTotal)}
                            </Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={3} colSpan={8} />
                        </Table.Summary.Row>
                      </Table.Summary>
                    )}
                  />
                ),
              },
              {
                key: 'multiperiod',
                label: (
                  <Space size={4}>
                    <CalendarOutlined />
                    <span>Multiperiod Accounting</span>
                  </Space>
                ),
                children: (
                  <Table
                    columns={multiperiodColumns}
                    dataSource={lines}
                    size="small"
                    pagination={false}
                    scroll={{ x: 1100 }}
                    rowSelection={rowSelection}
                    summary={() => (
                      <Table.Summary fixed>
                        <Table.Summary.Row>
                          <Table.Summary.Cell index={0} colSpan={2}>
                            <Text strong style={{ fontSize: 12, paddingLeft: 8 }}>Total</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={2} align="right">
                            <Text strong style={{ fontSize: 13, color: REDWOOD.primary }}>
                              {formatAmount(linesTotal)}
                            </Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={3} colSpan={5} />
                        </Table.Summary.Row>
                      </Table.Summary>
                    )}
                  />
                ),
              },
              {
                key: 'purchaseOrders',
                label: (
                  <Space size={4}>
                    <ShoppingCartOutlined />
                    <span>Purchase Orders</span>
                  </Space>
                ),
                children: (
                  <Table
                    columns={poColumns}
                    dataSource={lines}
                    size="small"
                    pagination={false}
                    scroll={{ x: 1500 }}
                    rowSelection={rowSelection}
                    summary={() => (
                      <Table.Summary fixed>
                        <Table.Summary.Row>
                          <Table.Summary.Cell index={0}>
                            <Text strong style={{ fontSize: 12, paddingLeft: 8 }}>Total</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={1} align="right">
                            <Text strong style={{ fontSize: 13, color: REDWOOD.primary }}>
                              {formatAmount(linesTotal)}
                            </Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={2} colSpan={10} />
                        </Table.Summary.Row>
                      </Table.Summary>
                    )}
                  />
                ),
              },
            ]}
          />
        </Card>

        {/* ========== TAXES & TOTALS ========== */}
        <Row gutter={16}>
          {/* Taxes */}
          <Col span={12}>
            <Card
              style={{
                borderRadius: 8,
                border: `1px solid ${REDWOOD.neutral200}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                height: '100%',
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <Text strong style={{ fontSize: 14, color: REDWOOD.neutral900 }}>Taxes</Text>
              </div>
              <Descriptions
                column={1}
                size="small"
                labelStyle={{ fontSize: 12, color: REDWOOD.neutral600, width: 180 }}
                contentStyle={{ fontSize: 12 }}
              >
                <Descriptions.Item label="Tax Classification">
                  <Select size="small" style={{ width: 200 }} placeholder="Select" defaultValue="">
                    <Option value="">None</Option>
                    <Option value="standard_vat">Standard VAT (5%)</Option>
                    <Option value="zero_rated">Zero Rated</Option>
                    <Option value="exempt">Exempt</Option>
                    <Option value="reverse_charge">Reverse Charge</Option>
                    <Option value="out_of_scope">Out of Scope</Option>
                  </Select>
                </Descriptions.Item>
                <Descriptions.Item label="Tax Rate">
                  <InputNumber size="small" style={{ width: 100 }} value={taxRate} onChange={(v) => setTaxRate(v || 0)} min={0} max={100} precision={2} addonAfter="%" />
                </Descriptions.Item>
                <Descriptions.Item label="Tax Amount">
                  <Text style={{ fontSize: 13 }}>{formatAmount(taxTotal)}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Withholding Tax Group">
                  <Select size="small" style={{ width: 200 }} placeholder="Select" allowClear>
                    <Option value="standard">Standard</Option>
                    <Option value="none">None</Option>
                  </Select>
                </Descriptions.Item>
                <Descriptions.Item label="Self-Assessed Tax">
                  <Select size="small" style={{ width: 100 }} defaultValue="No">
                    <Option value="Yes">Yes</Option>
                    <Option value="No">No</Option>
                  </Select>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>

          {/* Totals */}
          <Col span={12}>
            <Card
              style={{
                borderRadius: 8,
                border: `1px solid ${REDWOOD.neutral200}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                height: '100%',
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <Text strong style={{ fontSize: 14, color: REDWOOD.neutral900 }}>Totals</Text>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Tally mismatch warning */}
                {isTallyMismatch && (
                  <Alert
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                    message={
                      <span style={{ fontSize: 12 }}>
                        Header amount (<strong>{formatAmount(headerInvoiceAmount)}</strong>) does not match
                        Lines + Tax total (<strong>{formatAmount(computedTotal)}</strong>).
                        Difference: <strong style={{ color: REDWOOD.error }}>{formatAmount(Math.abs(headerInvoiceAmount - computedTotal))}</strong>
                      </span>
                    }
                    style={{ marginBottom: 4, borderRadius: 6 }}
                  />
                )}
                <Row justify="space-between" align="middle">
                  <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Header Invoice Amount</Text>
                  <Text style={{ fontSize: 14, fontWeight: 500, color: isTallyMismatch ? REDWOOD.error : undefined }}>
                    {formatAmount(headerInvoiceAmount)}
                  </Text>
                </Row>
                <Divider style={{ margin: '4px 0' }} />
                <Row justify="space-between" align="middle">
                  <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Lines Total</Text>
                  <Text style={{ fontSize: 14, fontWeight: 500 }}>{formatAmount(linesTotal)}</Text>
                </Row>
                <Row justify="space-between" align="middle">
                  <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Tax Total ({taxRate}%)</Text>
                  <Text style={{ fontSize: 14, fontWeight: 500 }}>{formatAmount(taxTotal)}</Text>
                </Row>
                <Divider style={{ margin: '4px 0' }} />
                <Row justify="space-between" align="middle">
                  <Text strong style={{ fontSize: 13 }}>Computed Total (Lines + Tax)</Text>
                  <Text strong style={{ fontSize: 18, color: isTallyMismatch ? REDWOOD.error : REDWOOD.primary }}>
                    {formatAmount(computedTotal)}
                    {isTallyMismatch && <ExclamationCircleOutlined style={{ marginLeft: 6, fontSize: 14 }} />}
                  </Text>
                </Row>
                <Divider style={{ margin: '4px 0' }} />
                <Row justify="space-between" align="middle">
                  <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Amount Applicable to Discount</Text>
                  <Text style={{ fontSize: 13 }}>0.00</Text>
                </Row>
                <Row justify="space-between" align="middle">
                  <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Prepayment Applied</Text>
                  <Text style={{ fontSize: 13 }}>0.00</Text>
                </Row>
                <Row justify="space-between" align="middle">
                  <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Amount Withheld</Text>
                  <Text style={{ fontSize: 13 }}>0.00</Text>
                </Row>
                <Divider style={{ margin: '4px 0' }} />
                <Row
                  justify="space-between"
                  align="middle"
                  style={{
                    padding: '8px 12px',
                    background: isTallyMismatch ? '#fff7e6' : REDWOOD.neutral100,
                    borderRadius: 6,
                    border: `1px solid ${isTallyMismatch ? '#ffd591' : REDWOOD.neutral200}`,
                  }}
                >
                  <Text strong style={{ fontSize: 14 }}>Amount Due</Text>
                  <Text strong style={{ fontSize: 20, color: isTallyMismatch ? REDWOOD.warning : REDWOOD.success }}>
                    {formatAmount(computedTotal)}
                  </Text>
                </Row>
              </div>
            </Card>
          </Col>
        </Row>
      </div>

      {/* ========== API LOG PANEL ========== */}
      {apiLog && (
        <div style={{ padding: '0 24px 16px' }}>
          <Card
            size="small"
            title={
              <Row justify="space-between" align="middle">
                <Space>
                  <ApiOutlined style={{ color: apiLog.status === 'SUCCESS' ? REDWOOD.success : REDWOOD.error }} />
                  <Text strong style={{ fontSize: 13 }}>API Log</Text>
                  <Tag color={apiLog.status === 'SUCCESS' ? 'green' : 'red'}>{apiLog.httpStatus} {apiLog.status}</Tag>
                  <Text type="secondary" style={{ fontSize: 11 }}>{apiLog.timestamp}</Text>
                </Space>
                <Space>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      const curlCmd = `curl -X POST '${apiLog.url}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${apiLog.requestBody.replace(/'/g, "'\\''")}'`;
                      navigator.clipboard.writeText(curlCmd);
                      message.success('cURL command copied');
                    }}
                  >
                    Copy cURL
                  </Button>
                  <Button size="small" onClick={() => setApiLog(null)}>
                    <CloseOutlined />
                  </Button>
                </Space>
              </Row>
            }
            style={{ border: `1px solid ${apiLog.status === 'SUCCESS' ? '#b7eb8f' : '#ffa39e'}` }}
          >
            <Row gutter={12}>
              {/* Request */}
              <Col span={12}>
                <Row justify="space-between" align="middle" style={{ marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    <Tag color="blue" style={{ fontSize: 10 }}>POST</Tag> Request Body
                  </Text>
                  <Button
                    size="small"
                    type="link"
                    icon={<CopyOutlined />}
                    onClick={() => { navigator.clipboard.writeText(apiLog.requestBody); message.success('Request JSON copied'); }}
                    style={{ fontSize: 11, padding: 0 }}
                  >
                    Copy
                  </Button>
                </Row>
                <div style={{ marginBottom: 4 }}>
                  <Text style={{ fontSize: 10, fontFamily: 'monospace', color: REDWOOD.info, wordBreak: 'break-all' }}>{apiLog.url}</Text>
                </div>
                <pre style={{
                  background: '#1e1e1e', color: '#d4d4d4', padding: '8px 10px', borderRadius: 4,
                  fontSize: 10, fontFamily: 'monospace', maxHeight: 200, overflow: 'auto', margin: 0,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {apiLog.requestBody}
                </pre>
              </Col>
              {/* Response */}
              <Col span={12}>
                <Row justify="space-between" align="middle" style={{ marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    <Tag color={apiLog.status === 'SUCCESS' ? 'green' : 'red'} style={{ fontSize: 10 }}>{apiLog.httpStatus}</Tag> Response
                  </Text>
                  <Button
                    size="small"
                    type="link"
                    icon={<CopyOutlined />}
                    onClick={() => { navigator.clipboard.writeText(apiLog.responseBody); message.success('Response JSON copied'); }}
                    style={{ fontSize: 11, padding: 0 }}
                  >
                    Copy
                  </Button>
                </Row>
                <div style={{ marginBottom: 4 }}>
                  <Text style={{ fontSize: 10, fontFamily: 'monospace', color: apiLog.status === 'SUCCESS' ? REDWOOD.success : REDWOOD.error }}>
                    {apiLog.status === 'SUCCESS' ? 'Invoice created successfully' : 'Request failed'}
                  </Text>
                </div>
                <pre style={{
                  background: '#1e1e1e', color: apiLog.status === 'SUCCESS' ? '#4ec9b0' : '#f48771', padding: '8px 10px', borderRadius: 4,
                  fontSize: 10, fontFamily: 'monospace', maxHeight: 200, overflow: 'auto', margin: 0,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {apiLog.responseBody}
                </pre>
              </Col>
            </Row>
          </Card>
        </div>
      )}

      {/* ========== SUPPLIER SEARCH MODAL ========== */}
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
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}` }}
          scroll={{ y: 400 }}
          onRow={(record) => ({
            onDoubleClick: () => handleSupplierSelect(record),
            style: { cursor: 'pointer' },
          })}
        />
      </Modal>

      {/* ========== ACCOUNT SELECTOR MODAL (Distribution Combination) ========== */}
      <AccountSelector
        visible={accountSelectorVisible}
        onCancel={() => {
          setAccountSelectorVisible(false);
          setEditingLineKey(null);
          setAccountSelectorInitialValue(undefined);
        }}
        onSelect={(accountCode, segments) => {
          handleAccountSelect(accountCode, segments);
          setAccountSelectorInitialValue(undefined);
        }}
        initialValue={
          accountSelectorInitialValue
          ?? (editingLineKey === '__liability__'
            ? form.getFieldValue('liabilityDistribution')
            : editingLineKey
            ? lines.find((l) => l.key === editingLineKey)?.distributionCombination
            : undefined)
        }
      />

      {/* ========== VALIDATION CHECKLIST MODAL ========== */}
      <Modal
        title={
          <Space>
            <CheckSquareOutlined style={{ color: isValidated ? REDWOOD.success : REDWOOD.primary }} />
            <span>Invoice Validation</span>
          </Space>
        }
        open={validationModalVisible}
        onCancel={() => setValidationModalVisible(false)}
        footer={
          <Button type="primary" onClick={() => setValidationModalVisible(false)}>
            Close
          </Button>
        }
        width={520}
      >
        <div style={{ padding: '8px 0' }}>
          {validationResults.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                padding: '8px 12px',
                marginBottom: 4,
                borderRadius: 6,
                background: item.passed ? '#f6ffed' : '#fff2f0',
                border: `1px solid ${item.passed ? '#b7eb8f' : '#ffccc7'}`,
              }}
            >
              <span style={{ fontSize: 16, marginRight: 10, marginTop: 1 }}>
                {item.passed
                  ? <CheckCircleOutlined style={{ color: REDWOOD.success }} />
                  : <ExclamationCircleOutlined style={{ color: REDWOOD.primary }} />}
              </span>
              <div style={{ flex: 1 }}>
                <Text strong style={{ fontSize: 13 }}>{item.label}</Text>
                {item.detail && (
                  <div style={{ fontSize: 12, color: REDWOOD.neutral600, marginTop: 2 }}>{item.detail}</div>
                )}
                {item.action && (
                  <Button
                    size="small"
                    type="link"
                    style={{ padding: 0, fontSize: 12, marginTop: 2, color: REDWOOD.info }}
                    onClick={item.action.onClick}
                  >
                    {item.action.label}
                  </Button>
                )}
                {/* Sub-items: list each line missing distribution with individual fix actions */}
                {item.subItems && item.subItems.length > 0 && (
                  <div style={{ marginTop: 6, borderTop: '1px dashed #ffccc7', paddingTop: 6 }}>
                    {item.subItems.map((sub, sIdx) => (
                      <div
                        key={sIdx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 0',
                          borderBottom: sIdx < item.subItems!.length - 1 ? '1px solid #fff0ee' : 'none',
                        }}
                      >
                        <div>
                          <Text style={{ fontSize: 12, fontWeight: 600 }}>{sub.label}</Text>
                          {sub.detail && (
                            <Text style={{ fontSize: 11, color: REDWOOD.neutral600, marginLeft: 8 }}>{sub.detail}</Text>
                          )}
                        </div>
                        {sub.action && (
                          <Button
                            size="small"
                            type="primary"
                            ghost
                            style={{ fontSize: 11, height: 24, borderRadius: 4 }}
                            onClick={sub.action.onClick}
                          >
                            {sub.action.label}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Tag color={item.passed ? 'success' : 'error'} style={{ marginLeft: 8 }}>
                {item.passed ? 'PASS' : 'FAIL'}
              </Tag>
            </div>
          ))}
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            {isValidated ? (
              <Tag color="success" style={{ fontSize: 13, padding: '4px 16px' }}>All validations passed</Tag>
            ) : (
              <Tag color="error" style={{ fontSize: 13, padding: '4px 16px' }}>Fix issues above before saving</Tag>
            )}
          </div>
        </div>
      </Modal>

      {/* ========== IMPORT LINES MODAL ========== */}
      <Modal
        title={
          <Space>
            <FileExcelOutlined style={{ color: '#217346' }} />
            <span>Import Invoice Lines</span>
          </Space>
        }
        open={importModalVisible}
        onCancel={() => { setImportModalVisible(false); setImportPreviewData([]); setPasteText(''); }}
        width={720}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={() => { setImportModalVisible(false); setImportPreviewData([]); setPasteText(''); }}>
              Cancel
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={importPreviewData.length === 0}
              onClick={handleConfirmImport}
              style={{ background: REDWOOD.info, borderColor: REDWOOD.info }}
            >
              Import {importPreviewData.length > 0 ? `(${importPreviewData.length} lines)` : ''}
            </Button>
          </div>
        }
      >
        {/* Step 1: Template download */}
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <Text strong style={{ fontSize: 13 }}>Step 1: Download Template</Text>
              <div style={{ fontSize: 12, color: REDWOOD.neutral600, marginTop: 2 }}>
                Excel file with columns: <Text code>Type</Text>, <Text code>Amount</Text>, <Text code>Description</Text>
              </div>
            </div>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleDownloadTemplate}
              style={{ borderColor: '#217346', color: '#217346' }}
            >
              Download Template
            </Button>
          </div>
        </div>

        {/* Step 2: Upload or Paste */}
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ fontSize: 13 }}>Step 2: Upload File or Paste Data</Text>
          <Tabs
            size="small"
            style={{ marginTop: 4 }}
            items={[
              {
                key: 'upload',
                label: (
                  <Space size={4}>
                    <UploadOutlined />
                    <span>Upload File</span>
                  </Space>
                ),
                children: (
                  <Upload.Dragger
                    accept=".xlsx,.xls,.csv"
                    beforeUpload={handleFileUpload}
                    showUploadList={false}
                    style={{ padding: '16px 0' }}
                  >
                    <p style={{ marginBottom: 8 }}>
                      <InboxOutlined style={{ fontSize: 32, color: REDWOOD.info }} />
                    </p>
                    <p style={{ fontSize: 13, color: REDWOOD.neutral900 }}>
                      Click or drag an Excel/CSV file here
                    </p>
                    <p style={{ fontSize: 11, color: REDWOOD.neutral600 }}>
                      Supports .xlsx, .xls, .csv
                    </p>
                  </Upload.Dragger>
                ),
              },
              {
                key: 'paste',
                label: (
                  <Space size={4}>
                    <CopyOutlined />
                    <span>Paste Data</span>
                  </Space>
                ),
                children: (
                  <div>
                    <Input.TextArea
                      rows={5}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder={`Paste tab or comma separated data:\nItem, 1000, Office Supplies\nItem, 2500, IT Equipment\nFreight, 150, Shipping\n\nOr just amount and description:\n1000, Office Supplies\n2500, IT Equipment`}
                      style={{ fontFamily: 'monospace', fontSize: 12 }}
                    />
                    <Button
                      size="small"
                      type="primary"
                      onClick={handlePasteImport}
                      style={{ marginTop: 8, background: REDWOOD.info, borderColor: REDWOOD.info }}
                      disabled={!pasteText.trim()}
                    >
                      Parse Pasted Data
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </div>

        {/* Step 3: Preview */}
        {importPreviewData.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong style={{ fontSize: 13 }}>Step 3: Preview ({importPreviewData.length} lines)</Text>
              <Button size="small" type="link" danger onClick={() => setImportPreviewData([])}>
                Clear
              </Button>
            </div>
            <Table
              dataSource={importPreviewData.map((r, i) => ({ ...r, key: i, lineNumber: i + 1 }))}
              pagination={false}
              size="small"
              bordered
              scroll={{ y: 200 }}
              columns={[
                {
                  title: '#',
                  dataIndex: 'lineNumber',
                  key: 'lineNumber',
                  width: 40,
                  align: 'center',
                  render: (v: number) => <Text style={{ fontSize: 11 }}>{v}</Text>,
                },
                {
                  title: 'Type',
                  dataIndex: 'type',
                  key: 'type',
                  width: 100,
                  render: (v: string) => <Tag color={v === 'Item' ? 'blue' : v === 'Freight' ? 'orange' : 'default'}>{v}</Tag>,
                },
                {
                  title: 'Amount',
                  dataIndex: 'amount',
                  key: 'amount',
                  width: 120,
                  align: 'right',
                  render: (v: number) => <Text strong style={{ fontSize: 12 }}>{formatAmount(v)}</Text>,
                },
                {
                  title: 'Description',
                  dataIndex: 'description',
                  key: 'description',
                  render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>,
                },
              ]}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={2}>
                      <Text strong style={{ fontSize: 12 }}>Total</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} align="right">
                      <Text strong style={{ fontSize: 13, color: REDWOOD.primary }}>
                        {formatAmount(importPreviewData.reduce((s, r) => s + r.amount, 0))}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} />
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </div>
        )}
      </Modal>

      {/* ========== VIEW ACCOUNTING MODAL ========== */}
      <Modal
        title={
          <Space>
            <AccountBookOutlined style={{ color: REDWOOD.info }} />
            <span>Accounting Entries — Multi-Period</span>
          </Space>
        }
        open={accountingModalVisible}
        onCancel={() => setAccountingModalVisible(false)}
        footer={<Button type="primary" onClick={() => setAccountingModalVisible(false)}>Close</Button>}
        width={900}
      >
        {(() => {
          const liabilityDist = form.getFieldValue('liabilityDistribution') || '—';
          const invoiceDate = form.getFieldValue('invoiceDate');
          const defaultAcctDate = invoiceDate?.format?.('DD-MMM-YYYY') || 'N/A';

          // Build entries grouped by accounting period (date)
          type AcctEntry = { key: number; period: string; line: string; account: string; description: string; debit: number; credit: number; isGroupHeader?: boolean; isPeriodSubtotal?: boolean; subtotalDebit?: number; subtotalCredit?: number };
          const allEntries: AcctEntry[] = [];
          let keyIdx = 0;

          // Active lines with data
          const activeLines = lines.filter((l) => l.amount > 0 || l.description);

          // Group lines by their accounting date (period)
          const periodMap = new Map<string, typeof activeLines>();
          activeLines.forEach((l) => {
            const period = l.accountingDate || defaultAcctDate;
            if (!periodMap.has(period)) periodMap.set(period, []);
            periodMap.get(period)!.push(l);
          });

          // Sort periods chronologically
          const sortedPeriods = Array.from(periodMap.keys()).sort((a, b) => {
            const da = new Date(a);
            const db = new Date(b);
            return da.getTime() - db.getTime();
          });

          let grandTotalDebit = 0;
          let grandTotalCredit = 0;

          sortedPeriods.forEach((period) => {
            const periodLines = periodMap.get(period)!;
            let periodDebit = 0;
            let periodCredit = 0;

            // Period header row
            allEntries.push({
              key: keyIdx++,
              period,
              line: '',
              account: '',
              description: '',
              debit: 0,
              credit: 0,
              isGroupHeader: true,
            });

            // Debit: each expense line
            periodLines.forEach((l) => {
              const amt = l.amount || 0;
              allEntries.push({
                key: keyIdx++,
                period,
                line: `Line ${l.lineNumber}`,
                account: l.distributionCombination || l.distributionSet || '—',
                description: l.description || (l.type || 'Item'),
                debit: amt,
                credit: 0,
              });
              periodDebit += amt;
            });

            // Debit: tax recoverable for this period's lines
            const periodLineTax = periodLines.reduce((sum, l) => {
              const rate = getTaxRateForClassification(l.taxClassification);
              return sum + Math.round((l.amount || 0) * (rate / 100) * 100) / 100;
            }, 0);
            if (periodLineTax > 0) {
              allEntries.push({
                key: keyIdx++,
                period,
                line: 'Tax',
                account: 'Tax Recoverable',
                description: 'Input VAT',
                debit: periodLineTax,
                credit: 0,
              });
              periodDebit += periodLineTax;
            }

            // Credit: liability for each expense line
            periodLines.forEach((l) => {
              const amt = l.amount || 0;
              allEntries.push({
                key: keyIdx++,
                period,
                line: `Line ${l.lineNumber}`,
                account: liabilityDist,
                description: `AP — ${l.description || l.type || 'Item'}`,
                debit: 0,
                credit: amt,
              });
              periodCredit += amt;
            });

            // Credit: liability for tax
            if (periodLineTax > 0) {
              allEntries.push({
                key: keyIdx++,
                period,
                line: 'Tax',
                account: liabilityDist,
                description: 'AP — Input VAT',
                debit: 0,
                credit: periodLineTax,
              });
              periodCredit += periodLineTax;
            }

            // Period subtotal row
            allEntries.push({
              key: keyIdx++,
              period,
              line: '',
              account: '',
              description: '',
              debit: 0,
              credit: 0,
              isPeriodSubtotal: true,
              subtotalDebit: periodDebit,
              subtotalCredit: periodCredit,
            });

            grandTotalDebit += periodDebit;
            grandTotalCredit += periodCredit;
          });

          return (
            <>
              <Table
                dataSource={allEntries}
                pagination={false}
                size="small"
                bordered
                rowClassName={(record) => record.isGroupHeader ? 'acct-period-header' : record.isPeriodSubtotal ? 'acct-period-subtotal' : ''}
                columns={[
                  {
                    title: 'Accounting Date',
                    dataIndex: 'period',
                    key: 'period',
                    width: 120,
                    onCell: (record: AcctEntry) => ({
                      colSpan: record.isGroupHeader ? 6 : record.isPeriodSubtotal ? 4 : 1,
                      style: record.isGroupHeader
                        ? { background: '#e6f4ff', fontWeight: 700, fontSize: 12 }
                        : record.isPeriodSubtotal
                        ? { background: '#f0f5ff', borderTop: '1px solid #d6e4ff' }
                        : undefined,
                    }),
                    render: (v: string, record: AcctEntry) => {
                      if (record.isGroupHeader) {
                        const periodLines = periodMap.get(v)!;
                        const periodTotal = periodLines.reduce((s, l) => s + (l.amount || 0), 0);
                        const periodTax = periodLines.reduce((s, l) => s + Math.round((l.amount || 0) * (getTaxRateForClassification(l.taxClassification) / 100) * 100) / 100, 0);
                        return (
                          <span>
                            Period: <strong>{v}</strong>
                            <span style={{ marginLeft: 16, color: REDWOOD.neutral600, fontWeight: 400 }}>
                              Lines: {formatAmount(periodTotal)} | Tax: {formatAmount(periodTax)} | Total: {formatAmount(periodTotal + periodTax)}
                            </span>
                          </span>
                        );
                      }
                      if (record.isPeriodSubtotal) {
                        return <Text strong style={{ fontSize: 12 }}>Period Subtotal — {v}</Text>;
                      }
                      return <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{v}</Text>;
                    },
                  },
                  {
                    title: 'Line',
                    dataIndex: 'line',
                    key: 'line',
                    width: 70,
                    onCell: (record: AcctEntry) => ({ colSpan: record.isGroupHeader || record.isPeriodSubtotal ? 0 : 1 }),
                    render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>,
                  },
                  {
                    title: 'Account',
                    dataIndex: 'account',
                    key: 'account',
                    width: 240,
                    onCell: (record: AcctEntry) => ({ colSpan: record.isGroupHeader || record.isPeriodSubtotal ? 0 : 1 }),
                    render: (v: string) => <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{v}</Text>,
                  },
                  {
                    title: 'Description',
                    dataIndex: 'description',
                    key: 'description',
                    onCell: (record: AcctEntry) => ({ colSpan: record.isGroupHeader || record.isPeriodSubtotal ? 0 : 1 }),
                    render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>,
                  },
                  {
                    title: 'Debit',
                    dataIndex: 'debit',
                    key: 'debit',
                    width: 110,
                    align: 'right' as const,
                    onCell: (record: AcctEntry) => ({
                      colSpan: record.isGroupHeader ? 0 : 1,
                      style: record.isPeriodSubtotal ? { background: '#f0f5ff', borderTop: '1px solid #d6e4ff' } : undefined,
                    }),
                    render: (v: number, record: AcctEntry) => {
                      if (record.isPeriodSubtotal) {
                        return <Text strong style={{ fontSize: 12, color: '#389e0d' }}>{formatAmount(record.subtotalDebit || 0)}</Text>;
                      }
                      return v > 0 ? <Text style={{ fontSize: 12, fontWeight: 600, color: '#389e0d' }}>{formatAmount(v)}</Text> : null;
                    },
                  },
                  {
                    title: 'Credit',
                    dataIndex: 'credit',
                    key: 'credit',
                    width: 110,
                    align: 'right' as const,
                    onCell: (record: AcctEntry) => ({
                      colSpan: record.isGroupHeader ? 0 : 1,
                      style: record.isPeriodSubtotal ? { background: '#f0f5ff', borderTop: '1px solid #d6e4ff' } : undefined,
                    }),
                    render: (v: number, record: AcctEntry) => {
                      if (record.isPeriodSubtotal) {
                        return <Text strong style={{ fontSize: 12, color: REDWOOD.primary }}>{formatAmount(record.subtotalCredit || 0)}</Text>;
                      }
                      return v > 0 ? <Text style={{ fontSize: 12, fontWeight: 600, color: REDWOOD.primary }}>{formatAmount(v)}</Text> : null;
                    },
                  },
                ]}
                summary={() => (
                  <Table.Summary fixed>
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={4}>
                        <Text strong style={{ fontSize: 13 }}>Grand Total</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right">
                        <Text strong style={{ fontSize: 13, color: '#389e0d' }}>{formatAmount(grandTotalDebit)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="right">
                        <Text strong style={{ fontSize: 13, color: REDWOOD.primary }}>{formatAmount(grandTotalCredit)}</Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                    {Math.abs(grandTotalDebit - grandTotalCredit) > 0.01 && (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={6}>
                          <Text type="danger" style={{ fontSize: 12 }}>
                            Debit/Credit out of balance by {formatAmount(Math.abs(grandTotalDebit - grandTotalCredit))}
                          </Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    )}
                    {Math.abs(grandTotalDebit - grandTotalCredit) <= 0.01 && (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={6}>
                          <Text style={{ fontSize: 12, color: '#389e0d' }}>
                            Balanced — Debit equals Credit
                          </Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    )}
                  </Table.Summary>
                )}
              />
              {sortedPeriods.length > 1 && (
                <div style={{ marginTop: 8, fontSize: 11, color: REDWOOD.neutral600 }}>
                  Multi-period invoice across {sortedPeriods.length} accounting periods
                </div>
              )}
            </>
          );
        })()}
      </Modal>

      {/* API Preview Modal */}
      <Modal
        title={
          <Space>
            <ApiOutlined style={{ color: REDWOOD.info }} />
            <span>API Preview — Postman</span>
          </Space>
        }
        open={apiPreviewVisible}
        onCancel={() => setApiPreviewVisible(false)}
        footer={<Button onClick={() => setApiPreviewVisible(false)}>Close</Button>}
        width={800}
        styles={{ body: { padding: '16px 24px', maxHeight: '75vh', overflowY: 'auto' } }}
        destroyOnClose
      >
        {apiPreviewData && (
          <>
            <Card
              size="small"
              title={
                <Row justify="space-between" align="middle">
                  <Space>
                    <Tag color="green">POST</Tag>
                    <Text strong>Create Invoice (Header + Lines)</Text>
                  </Space>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      navigator.clipboard.writeText(apiPreviewData.url);
                      message.success('URL copied');
                    }}
                  >
                    Copy URL
                  </Button>
                </Row>
              }
            >
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>URL</Text>
                <div
                  style={{
                    background: '#1e1e1e',
                    color: '#d4d4d4',
                    padding: '8px 12px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                  }}
                >
                  {apiPreviewData.url}
                </div>
              </div>
              <div>
                <Row justify="space-between" align="middle" style={{ marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>JSON Body (Header + Lines combined)</Text>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      navigator.clipboard.writeText(apiPreviewData.body);
                      message.success('JSON copied');
                    }}
                  >
                    Copy JSON
                  </Button>
                </Row>
                <pre
                  style={{
                    background: '#1e1e1e',
                    color: '#d4d4d4',
                    padding: '10px 14px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: 'monospace',
                    maxHeight: 450,
                    overflow: 'auto',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {apiPreviewData.body}
                </pre>
              </div>
            </Card>

            <Alert
              type="info"
              showIcon
              style={{ marginTop: 12 }}
              message="Postman Setup"
              description={
                <ul style={{ margin: '4px 0', paddingLeft: 20, fontSize: 12 }}>
                  <li>Method: <Tag color="green" style={{ fontSize: 11 }}>POST</Tag></li>
                  <li>Header: <code>Content-Type: application/json</code></li>
                  <li>Single POST — header + lines in one JSON, InvoiceId auto-generated by sequence</li>
                  <li>PL/SQL Package: <code>RR_AP_CREATE_INVOICE_PKG.create_invoice</code></li>
                  <li>Tables: <code>RR_AP_INVOICES_ALL</code> (header) + <code>XXAP_INVOICE_LINES_STG</code> (lines)</li>
                </ul>
              }
            />

            <Alert
              type="success"
              showIcon
              style={{ marginTop: 8 }}
              message="Expected Response"
              description={
                <pre style={{ margin: 0, fontSize: 11, fontFamily: 'monospace' }}>
{`{
  "status": "SUCCESS",
  "message": "Invoice INV-001 created (ID: 900001) with 2 lines",
  "invoiceId": 900001,
  "success": true
}`}
                </pre>
              }
            />
          </>
        )}
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
                        { title: 'Invoice Date', dataIndex: 'invoiceDate', key: 'invoiceDate', width: 100, render: (d: string) => formatDateStr(d) },
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
                        { title: 'Payment Date', dataIndex: 'paymentDate', key: 'paymentDate', width: 100, render: (d: string) => formatDateStr(d) },
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

      <style>{`
        .ant-table-thead > tr > th {
          background: ${REDWOOD.neutral100} !important;
          font-weight: 600;
          font-size: 11px;
          padding: 6px 8px !important;
          color: ${REDWOOD.neutral600};
        }
        .ant-table-tbody > tr > td {
          font-size: 12px;
          padding: 4px 8px !important;
        }
        .ant-input-number-borderless,
        .ant-input-borderless,
        .ant-select-borderless .ant-select-selector {
          background: transparent !important;
        }
        .ant-table-tbody > tr:hover > td {
          background: #fef7f6 !important;
        }
      `}</style>
    </div>
  );
};

export default CreateInvoice;
