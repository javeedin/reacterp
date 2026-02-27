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
  Drawer,
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
  ScheduleOutlined,
  BankOutlined,
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
  // Edit mode fields
  invoiceId?: number;
  supplierSite?: string;
  unpaidAmount?: number;
  validationStatus?: string;
  approvalStatus?: string;
  holdPaidStatus?: string;
}

interface CreateInvoiceProps {
  onClose: () => void;
  onSave?: (values: any) => void;
  initialData?: InvoiceInitialData;
}

const CreateInvoice: React.FC<CreateInvoiceProps> = ({ onClose, onSave, initialData }) => {
  const [form] = Form.useForm();
  const [payInFullForm] = Form.useForm();

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
  const [taxRate, setTaxRate] = useState<number>(0);

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
  // Pay in Full modal state
  const [payInFullOpen, setPayInFullOpen] = useState(false);
  const [payInFullApiDrawerOpen, setPayInFullApiDrawerOpen] = useState(false);
  const [payInFullBankAccounts, setPayInFullBankAccounts] = useState<{ bankAccountName: string; currencyCode: string; legalEntityName: string }[]>([]);
  const [payInFullBankLoading, setPayInFullBankLoading] = useState(false);
  const [payInFullSubmitting, setPayInFullSubmitting] = useState(false);

  const [installmentsModalOpen, setInstallmentsModalOpen] = useState(false);
  const [installmentsModalData, setInstallmentsModalData] = useState<any[]>([]);
  const [installmentsModalLoading, setInstallmentsModalLoading] = useState(false);
  const [installmentsModalUrl, setInstallmentsModalUrl] = useState('');
  const [importPreviewData, setImportPreviewData] = useState<{ type: string; amount: number; description: string }[]>([]);
  const [pasteText, setPasteText] = useState('');

  // API Preview modal
  const [apiPreviewVisible, setApiPreviewVisible] = useState(false);
  const [apiPreviewData, setApiPreviewData] = useState<{ url: string; body: string } | null>(null);

  // API Log (last request/response)
  const [apiLog, setApiLog] = useState<{ url: string; method: string; requestBody: string; responseBody: string; status: string; httpStatus: number; timestamp: string } | null>(null);
  // API Log history (all requests during session)
  const [apiLogHistory, setApiLogHistory] = useState<{ action: string; url: string; method: string; requestBody: string; responseBody: string; status: string; httpStatus: number; timestamp: string }[]>([]);
  const [apiLogHistoryVisible, setApiLogHistoryVisible] = useState(false);

  // Saved invoice state — tracks whether we're in create or update mode
  const [savedInvoiceId, setSavedInvoiceId] = useState<number | null>(initialData?.invoiceId || null);

  // Edit mode: determine if invoice is editable or read-only
  const isEditMode = Boolean(initialData?.invoiceId);
  const isReadOnly = useMemo(() => {
    if (!initialData) return false;
    const status = initialData.holdPaidStatus || '';
    const isPosted = initialData.validationStatus === 'Validated';
    const isPaid = status === 'Fully paid' || status === 'Paid';
    return isPosted || isPaid;
  }, [initialData]);

  // Payments tab state (for edit mode)
  const [invoicePayments, setInvoicePayments] = useState<{ key: string; number: string; paymentDocument: string; status: string; reconciled: string; currentPayeeName: string; paymentDate: string; paidAmount: number; currency: string; address: string; remitToAccount: string }[]>([]);
  const [invoicePaymentsLoading, setInvoicePaymentsLoading] = useState(false);
  const [invoicePaymentsUrl, setInvoicePaymentsUrl] = useState('');

  // Holds tab state (for edit mode)
  const [invoiceHolds, setInvoiceHolds] = useState<{ key: string; holdName: string; holdReason: string; holdDate: string; heldBy: string; releaseDate: string; releasedBy: string }[]>([]);
  const [invoiceHoldsLoading, setInvoiceHoldsLoading] = useState(false);

  // Installments tab state (for edit mode)
  const [invoiceInstallments, setInvoiceInstallments] = useState<{ key: string; installmentNumber: number; dueDate: string; grossAmount: number; unpaidAmount: number; paymentPriority: number; paymentMethod: string; bankAccount: string }[]>([]);
  const [invoiceInstallmentsLoading, setInvoiceInstallmentsLoading] = useState(false);
  const [invoiceInstallmentsUrl, setInvoiceInstallmentsUrl] = useState('');

  // Fetch invoice payments (edit mode)
  const fetchInvoicePayments = useCallback(async (invoiceId: number) => {
    const url = `${APEX_DB_CONFIG.baseUrl}/ap/createinvoice/payments?P_INVOICE_ID=${invoiceId}`;
    setInvoicePaymentsUrl(url);
    setInvoicePaymentsLoading(true);
    console.log('[Payments Tab] Fetching:', url);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      console.log('[Payments Tab] Raw response:', data);
      const items = data.items || (Array.isArray(data) ? data : []);
      setInvoicePayments(
        items.map((item: any, index: number) => ({
          key:              (item.id ?? index).toString(),
          number:           (item.paper_document_number ?? item.id ?? '').toString(),
          paymentDocument:  item.invoice_number ?? '',
          status:           item.payment_status ?? '',
          reconciled:       item.reconciled_flag === 'Y' ? 'Yes' : item.reconciled_flag === 'N' ? 'No' : (item.reconciled_flag ?? ''),
          currentPayeeName: item.invoice_business_unit ?? '',
          paymentDate:      formatDateStr(item.creation_date ?? ''),
          paidAmount:       Number(item.amount_paid_payment_currency ?? 0),
          currency:         item.invoice_currency ?? '',
          address:          '',
          remitToAccount:   '',
        }))
      );
    } catch (error) {
      console.error('[Payments Tab] Error:', error);
    } finally {
      setInvoicePaymentsLoading(false);
    }
  }, []);

  // Fetch invoice holds (edit mode)
  const fetchInvoiceHolds = useCallback(async (invoiceId: number) => {
    setInvoiceHoldsLoading(true);
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/ap/invoice-holds?invoice_id=${invoiceId}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const items = data.items || data || [];
      setInvoiceHolds(
        items.map((item: any, index: number) => ({
          key: item.hold_id?.toString() || index.toString(),
          holdName: item.hold_lookup_code || item.hold_name || '',
          holdReason: item.hold_reason || item.description || '',
          holdDate: formatDateStr(item.hold_date || item.creation_date),
          heldBy: item.held_by || item.created_by || '',
          releaseDate: formatDateStr(item.release_date),
          releasedBy: item.released_by || '',
        }))
      );
    } catch (error) {
      console.error('Error fetching invoice holds:', error);
    } finally {
      setInvoiceHoldsLoading(false);
    }
  }, []);

  // Fetch invoice installments (edit mode)
  const fetchInvoiceInstallments = useCallback(async (invoiceId: number) => {
    setInvoiceInstallmentsLoading(true);
    const url = `${APEX_DB_CONFIG.baseUrl}/ap/createinvoice/installments?P_INVOICE_ID=${invoiceId}`;
    setInvoiceInstallmentsUrl(url);
    console.log('[Installments Tab] Fetching:', url);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const items = data.items || data.installments || data || [];
      setInvoiceInstallments(
        items.map((item: any, index: number) => ({
          key: item.installment_id?.toString() || index.toString(),
          installmentNumber: item.installment_number || index + 1,
          dueDate: formatDateStr(item.due_date),
          grossAmount: item.gross_amount || 0,
          unpaidAmount: item.amount_remaining || item.unpaid_amount || 0,
          paymentPriority: item.payment_priority || 0,
          paymentMethod: item.payment_method || '',
          bankAccount: item.bank_account || item.bank_account_name || '',
        }))
      );
    } catch (error) {
      console.error('Error fetching installments:', error);
    } finally {
      setInvoiceInstallmentsLoading(false);
    }
  }, []);

  // Fetch existing invoice lines (edit mode)
  const fetchExistingLines = useCallback(async (invoiceId: number) => {
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/ap/createinvoiceslines?P_INVOICE_ID=${invoiceId}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const items = data.items || data || [];

      if (Array.isArray(items) && items.length > 0) {
        const itemLines = items.filter((item: any) => item.line_type === 'Item' || !item.line_type);
        if (itemLines.length > 0) {
          const mappedLines: InvoiceLine[] = itemLines.map((item: any, index: number) => {
            const taxClass = item.tax_classification_code || item.tax_classification || '';
            return {
              key: item.line_id?.toString() || `${Date.now()}-${index}`,
              lineNumber: item.line_number || index + 1,
              type: item.line_type || 'Item',
              amount: item.line_amount || 0,
              distributionSet: item.distribution_set || '',
              distributionCombination: item.distribution_combination || item.dist_code_combination || '',
              accountingDate: formatDateStr(item.accounting_date) || '',
              prorateAcrossAllItemLines: item.prorate_across_all_items || 'No',
              description: item.description || '',
              taxClassification: taxClass,
              shipToLocation: item.ship_to_location || '',
              quantity: item.quantity || 1,
              unitPrice: item.unit_price || 0,
              uomName: item.uom || '',
              project: item.project || '',
              task: item.task || '',
              poNumber: item.purchase_order_number || item.po_number || '',
              poLine: item.purchase_order_line_number?.toString() || item.po_line_number?.toString() || '',
              poSchedule: item.purchase_order_schedule_line_number?.toString() || '',
              receiptNumber: item.receipt_number || '',
              receiptLine: item.receipt_line_number?.toString() || '',
              consumptionAdviceNumber: item.consumption_advice_number || '',
              consumptionAdviceLine: item.consumption_advice_line_number?.toString() || '',
              startDate: formatDateStr(item.multiperiod_start_date) || '',
              endDate: formatDateStr(item.multiperiod_end_date) || '',
              accrualAccount: item.multiperiod_accrual_account || item.accrual_account || '',
              // Only carry taxAmount if the line actually has a tax classification
              taxAmount: taxClass ? (item.tax_amount || 0) : 0,
            };
          });
          setLines(mappedLines);

          // Set tax rate from the first line that has a tax classification;
          // if no line has one, default to 0 (no tax)
          const firstTaxedLine = mappedLines.find(l => l.taxClassification);
          if (firstTaxedLine) {
            setTaxRate(getTaxRateForClassification(firstTaxedLine.taxClassification));
          } else {
            setTaxRate(0);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching existing invoice lines:', error);
      message.warning('Could not load existing invoice lines');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill from initialData (Quick Create or Edit mode)
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
      if (initialData.supplierSite) formValues.supplierSite = initialData.supplierSite;
      form.setFieldsValue(formValues);
      setHeaderValues((prev) => ({ ...prev, ...formValues }));

      // Edit mode: fetch existing lines, payments, holds, installments
      if (initialData.invoiceId) {
        fetchExistingLines(initialData.invoiceId);
        fetchInvoicePayments(initialData.invoiceId);
        fetchInvoiceHolds(initialData.invoiceId);
        fetchInvoiceInstallments(initialData.invoiceId);
        // Mark as validated if it was already validated
        if (initialData.validationStatus === 'Validated') {
          setIsValidated(true);
        }
        return; // Skip blank line creation for edit mode
      }

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
      // Set on the current line first
      setLines((prev) =>
        prev.map((line) =>
          line.key === editingLineKey ? { ...line, distributionCombination: accountCode } : line
        )
      );
      // Offer to apply to all lines if there are multiple
      const otherLines = lines.filter((l) => l.key !== editingLineKey && (l.amount !== 0 || l.description));
      if (otherLines.length > 0) {
        const linesWithout = otherLines.filter((l) => !l.distributionCombination);
        Modal.confirm({
          title: 'Apply to All Lines?',
          icon: <AppstoreOutlined style={{ color: REDWOOD.info }} />,
          content: (
            <div style={{ fontSize: 13 }}>
              <div style={{ marginBottom: 8 }}>
                Distribution: <Text code style={{ fontSize: 12 }}>{accountCode}</Text>
              </div>
              {linesWithout.length > 0 && (
                <div style={{ color: REDWOOD.neutral600, fontSize: 12 }}>
                  {linesWithout.length} line(s) have no distribution set.
                </div>
              )}
            </div>
          ),
          okText: 'Apply to All Lines',
          cancelText: 'Only This Line',
          onOk: () => {
            setLines((prev) =>
              prev.map((line) => ({ ...line, distributionCombination: accountCode }))
            );
            message.success(`Distribution applied to all ${lines.length} lines`);
            setIsValidated(false);
          },
        });
      }
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
      key: 'payInFull',
      icon: <CreditCardOutlined />,
      label: 'Pay in Full',
    },
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
    { type: 'divider' },
    {
      key: 'installments',
      icon: <ScheduleOutlined />,
      label: 'Installments',
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

  const fetchInstallmentsForModal = async () => {
    const invoiceId = savedInvoiceId ?? initialData?.invoiceId ?? null;
    const url = `${APEX_DB_CONFIG.baseUrl}/ap/createinvoice/installments?P_INVOICE_ID=${invoiceId ?? ''}`;
    setInstallmentsModalUrl(url);
    if (!invoiceId) { message.warning('Invoice ID not available'); return; }
    setInstallmentsModalLoading(true);
    console.log('[Installments] Fetching:', url);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const items = data.items || (Array.isArray(data) ? data : []);
      setInstallmentsModalData(items);
    } catch (err) {
      console.error('Error fetching installments:', err);
      message.error('Failed to load installments');
      setInstallmentsModalData([]);
    } finally {
      setInstallmentsModalLoading(false);
    }
  };

  // ── Pay in Full helpers ─────────────────────────────────────────────────
  const fetchPayInFullBankAccounts = async (legalEntityName: string) => {
    setPayInFullBankLoading(true);
    try {
      const response = await fetch(`${APEX_DB_CONFIG.baseUrl}/banks/bankaccounts`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const all = (data.items || []).map((item: any) => ({
        bankAccountName: item.bank_account_name || '',
        currencyCode:    item.currency_code    || '',
        legalEntityName: item.legal_entity_name || '',
      }));
      const filtered = legalEntityName
        ? all.filter((a: any) => a.legalEntityName === legalEntityName)
        : all;
      setPayInFullBankAccounts(filtered);
      if (filtered.length === 0)
        message.warning(`No bank accounts found for legal entity "${legalEntityName}"`);
    } catch {
      message.error('Failed to load bank accounts');
    } finally {
      setPayInFullBankLoading(false);
    }
  };

  const openPayInFullModal = async () => {
    const buName = form.getFieldValue('businessUnit') || headerValues.businessUnit || '';
    payInFullForm.resetFields();
    payInFullForm.setFieldsValue({
      businessUnit:  buName,
      supplier:      form.getFieldValue('supplier') || '',
      invoiceNumber: form.getFieldValue('invoiceNumber') || '',
      payAmount:     computedTotal - invoicePayments
        .filter(p => p.status !== 'Voided')
        .reduce((sum, p) => sum + p.paidAmount, 0),
      currency:      headerValues.invoiceCurrency || form.getFieldValue('invoiceCurrency') || 'AED',
      paymentDate:   dayjs(),
    });
    setPayInFullOpen(true);

    // Step 1: fetch BUs to resolve legalEntityName for the current BU
    try {
      const buRes = await fetch(`${APEX_DB_CONFIG.baseUrl}/gl/businessunits`, {
        headers: { Accept: 'application/json' },
      });
      if (!buRes.ok) throw new Error(`HTTP ${buRes.status}`);
      const buData = await buRes.json();
      const buList = (buData.items || []).map((item: any) => ({
        name:            item.business_unit_name || item.name || '',
        legalEntityName: item.legal_entity_name  || '',
      }));
      const matched = buList.find((b: any) => b.name === buName);
      const legalEntityName = matched?.legalEntityName || '';
      console.log(`[Pay in Full] BU="${buName}" → legalEntity="${legalEntityName}"`);
      // Step 2: fetch bank accounts filtered by legalEntityName
      fetchPayInFullBankAccounts(legalEntityName);
    } catch {
      // fallback: load all accounts
      fetchPayInFullBankAccounts('');
    }
  };
  // ────────────────────────────────────────────────────────────────────────

  const handleInvoiceAction = ({ key }: { key: string }) => {
    switch (key) {
      case 'validate':
        runValidation();
        break;
      case 'calculateTax':
        message.info('Calculating tax...');
        break;
      case 'payInFull':
        if (!isEditMode) { message.warning('Save the invoice first before making a payment.'); return; }
        openPayInFullModal();
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
      case 'installments':
        setInstallmentsModalOpen(true);
        fetchInstallmentsForModal();
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

  // Helper to log an API call to both current log and history
  const logApiCall = (action: string, entry: { url: string; method: string; requestBody: string; responseBody: string; status: string; httpStatus: number; timestamp: string }) => {
    setApiLog(entry);
    setApiLogHistory((prev) => [{ action, ...entry }, ...prev]);
  };

  // POST combined invoice (header + lines) to APEX
  const saveInvoice = async (values: any): Promise<boolean> => {
    setSaving(true);
    const payload = buildInvoicePayload(values);
    const isUpdate = savedInvoiceId !== null;
    const httpMethod = isUpdate ? 'PUT' : 'POST';
    const actionLabel = isUpdate ? 'Update Invoice' : 'Create Invoice';
    const url = isUpdate
      ? `${APEX_DB_CONFIG.baseUrl}/ap/createinvoicefull/${savedInvoiceId}`
      : `${APEX_DB_CONFIG.baseUrl}/ap/createinvoicefull`;

    // Include InvoiceId in payload for updates
    if (isUpdate) {
      payload.InvoiceId = savedInvoiceId;
    }

    const requestBody = JSON.stringify(payload, null, 2);
    const timestamp = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

    try {
      console.log(`${httpMethod} Invoice (${actionLabel}):`, url, payload);

      const response = await fetch(url, {
        method: httpMethod,
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
        logApiCall(actionLabel, {
          url,
          method: httpMethod,
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
      logApiCall(actionLabel, {
        url,
        method: httpMethod,
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

      const invoiceId = data.invoiceId || savedInvoiceId || 0;

      // Store invoice ID — switch to update mode
      if (!isUpdate && invoiceId) {
        setSavedInvoiceId(invoiceId);
      }

      message.success(data.message || `Invoice ${isUpdate ? 'updated' : 'created'} (ID: ${invoiceId})`);

      // Notify parent
      if (onSave) onSave({ ...values, invoiceId });

      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Save invoice error:', error);
      logApiCall(actionLabel, {
        url,
        method: httpMethod,
        requestBody,
        responseBody: JSON.stringify({ error: errorMsg }, null, 2),
        status: 'NETWORK_ERROR',
        httpStatus: 0,
        timestamp,
      });
      message.error(`Failed to ${isUpdate ? 'update' : 'save'} invoice: ${errorMsg}`);
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
        setSavedInvoiceId(null); // Reset to create mode
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
    const isUpdate = savedInvoiceId !== null;
    const url = isUpdate
      ? `${APEX_DB_CONFIG.baseUrl}/ap/createinvoicefull/${savedInvoiceId}`
      : `${APEX_DB_CONFIG.baseUrl}/ap/createinvoicefull`;
    if (isUpdate) payload.InvoiceId = savedInvoiceId;

    setApiPreviewData({
      url: `${isUpdate ? 'PUT' : 'POST'} ${url}`,
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
      width: 280,
      render: (val: string, record: InvoiceLine) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Input
            size="small"
            value={val}
            onChange={(e) => updateLine(record.key, 'distributionCombination', e.target.value)}
            onBlur={(e) => handleAccountBlur(record.key, e.target.value)}
            placeholder="e.g. 01-000-2100-0000-000"
            variant="borderless"
            style={{ flex: 1 }}
            suffix={
              <SearchOutlined
                style={{ color: REDWOOD.info, fontSize: 12, cursor: 'pointer' }}
                onClick={() => openAccountSelector(record.key, val)}
              />
            }
          />
          {val && lines.length > 1 && (
            <Tooltip title="Apply to all lines">
              <AppstoreOutlined
                style={{ color: REDWOOD.info, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}
                onClick={() => {
                  Modal.confirm({
                    title: 'Apply to All Lines?',
                    icon: <AppstoreOutlined style={{ color: REDWOOD.info }} />,
                    content: (
                      <div style={{ fontSize: 13 }}>
                        Set <Text code style={{ fontSize: 12 }}>{val}</Text> on all {lines.length} lines?
                      </div>
                    ),
                    okText: 'Apply to All',
                    cancelText: 'Cancel',
                    onOk: () => {
                      setLines((prev) =>
                        prev.map((line) => ({ ...line, distributionCombination: val }))
                      );
                      message.success(`Distribution applied to all ${lines.length} lines`);
                      setIsValidated(false);
                    },
                  });
                }}
              />
            </Tooltip>
          )}
        </div>
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
            {isEditMode ? (isReadOnly ? 'View Invoice' : 'Edit Invoice') : 'Create Invoice'}
          </Title>
          {isEditMode && initialData?.unpaidAmount !== undefined && (
            <Tag color={initialData.unpaidAmount === 0 ? 'green' : 'blue'} style={{ marginLeft: 8, fontSize: 12 }}>
              Unpaid: {formatAmount(initialData.unpaidAmount)} {initialData.invoiceCurrency || 'AED'}
            </Tag>
          )}
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
          {!isReadOnly && (
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
          )}
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
          {savedInvoiceId && (
            <Tag color="green" style={{ fontSize: 12, padding: '2px 10px', fontWeight: 600 }}>
              <CheckCircleOutlined /> Invoice ID: {savedInvoiceId}
            </Tag>
          )}
          {!savedInvoiceId && !isReadOnly && (
            <Button onClick={handleSaveAndCreateNext} loading={saving} disabled={saving || !isValidated}>
              Save and Create Next
            </Button>
          )}
          {!isReadOnly && (
            <Button
              type="primary"
              onClick={handleSave}
              loading={saving}
              disabled={saving || !isValidated}
              icon={savedInvoiceId ? <SaveOutlined /> : undefined}
              style={{ background: isValidated ? REDWOOD.primary : undefined, borderColor: isValidated ? REDWOOD.primary : undefined }}
            >
              {savedInvoiceId ? 'Update Invoice' : 'Save'}
            </Button>
          )}
          {!isReadOnly && (
            <Button
              type="primary"
              onClick={async () => { const success = await handleSave(); if (success !== false) onClose(); }}
              loading={saving}
              disabled={saving || !isValidated}
              style={{ background: isValidated ? REDWOOD.primary : undefined, borderColor: isValidated ? REDWOOD.primary : undefined }}
            >
              {savedInvoiceId ? 'Update and Close' : 'Save and Close'}
            </Button>
          )}
          <Button onClick={onClose}>
            {isReadOnly ? 'Close' : 'Cancel'}
          </Button>
        </Space>
      </div>

      <div style={{ padding: '16px 24px' }}>
        {/* Edit mode banner */}
        {isEditMode && (
          <Alert
            type={isReadOnly ? 'warning' : 'info'}
            showIcon
            style={{ marginBottom: 12, borderRadius: 8 }}
            message={
              isReadOnly ? (
                <span>
                  <strong>Read-Only</strong> — This invoice is {initialData?.holdPaidStatus === 'Fully paid' || initialData?.holdPaidStatus === 'Paid' ? 'paid' : 'posted/validated'} and cannot be edited.
                  {initialData?.validationStatus && <Tag color="green" style={{ marginLeft: 8 }}>{initialData.validationStatus}</Tag>}
                  {initialData?.holdPaidStatus && <Tag color={initialData.holdPaidStatus === 'Fully paid' || initialData.holdPaidStatus === 'Paid' ? 'blue' : 'default'} style={{ marginLeft: 4 }}>{initialData.holdPaidStatus}</Tag>}
                </span>
              ) : (
                <span>
                  <strong>Edit Mode</strong> — Invoice #{initialData?.invoiceNumber} (ID: {initialData?.invoiceId})
                  {initialData?.validationStatus && <Tag style={{ marginLeft: 8 }}>{initialData.validationStatus}</Tag>}
                  {initialData?.approvalStatus && <Tag style={{ marginLeft: 4 }}>{initialData.approvalStatus}</Tag>}
                  {initialData?.holdPaidStatus && <Tag style={{ marginLeft: 4 }}>{initialData.holdPaidStatus}</Tag>}
                </span>
              )
            }
          />
        )}

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
              {!isReadOnly && (
                <Button
                  size="small"
                  icon={<UploadOutlined />}
                  onClick={() => { setImportPreviewData([]); setPasteText(''); setImportModalVisible(true); }}
                  disabled={!isHeaderComplete}
                  style={{ fontSize: 12, borderColor: REDWOOD.info, color: REDWOOD.info }}
                >
                  Import Lines
                </Button>
              )}
              {!isReadOnly && (
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
              )}
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
              // Payments tab (edit mode only, shown when payments exist)
              ...(isEditMode ? [{
                key: 'payments',
                label: (
                  <Space size={4}>
                    <CreditCardOutlined />
                    <span>Payments ({invoicePayments.length})</span>
                    <Tooltip
                      title={
                        <span style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                          {invoicePaymentsUrl}
                        </span>
                      }
                      placement="bottom"
                    >
                      <ApiOutlined style={{ color: REDWOOD.info, cursor: 'pointer', fontSize: 12 }} />
                    </Tooltip>
                  </Space>
                ),
                children: invoicePaymentsLoading ? (
                  <div style={{ textAlign: 'center', padding: 40 }}>
                    <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
                    <div style={{ marginTop: 8, color: REDWOOD.neutral600, fontSize: 12 }}>Loading payments...</div>
                  </div>
                ) : invoicePayments.length > 0 ? (
                  <Table
                    dataSource={invoicePayments}
                    columns={[
                      { title: 'Number',             dataIndex: 'number',           key: 'number',           width: 80 },
                      { title: 'Payment Document',   dataIndex: 'paymentDocument',  key: 'paymentDocument',  width: 200, ellipsis: true },
                      { title: 'Status',             dataIndex: 'status',           key: 'status',           width: 130,
                        render: (s: string) => {
                          const lower = s?.toLowerCase() ?? '';
                          const color = lower.includes('fully') ? 'green' : lower.includes('partial') ? 'orange' : lower.includes('not') ? 'red' : lower.includes('void') ? 'red' : lower.includes('clear') ? 'green' : 'default';
                          return <Tag color={color}>{s}</Tag>;
                        }},
                      { title: 'Reconciled',         dataIndex: 'reconciled',       key: 'reconciled',       width: 100, align: 'center' as const,
                        render: (v: string) => v === 'Yes' ? <Tag color="green">Yes</Tag> : v === 'No' ? <Tag>No</Tag> : '—' },
                      { title: 'Current Payee Name', dataIndex: 'currentPayeeName', key: 'currentPayeeName', width: 220, ellipsis: true },
                      { title: 'Payment Date',       dataIndex: 'paymentDate',      key: 'paymentDate',      width: 110 },
                      { title: 'Paid Amount',        dataIndex: 'paidAmount',       key: 'paidAmount',       width: 160, align: 'right' as const,
                        render: (amt: number, row: any) => (
                          <Text strong style={{ color: REDWOOD.success }}>{formatAmount(amt)}{row.currency ? ` ${row.currency}` : ''}</Text>
                        )},
                      { title: 'Address',            dataIndex: 'address',          key: 'address',          ellipsis: true,
                        render: (v: string) => v || '—' },
                      { title: 'Remit-to Account',   dataIndex: 'remitToAccount',   key: 'remitToAccount',   width: 160, ellipsis: true,
                        render: (v: string) => v || '—' },
                    ]}
                    rowKey="key"
                    size="small"
                    pagination={false}
                    scroll={{ x: 1200, y: 300 }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: 30, color: REDWOOD.neutral600, fontSize: 12 }}>
                    No payments found for this invoice.
                  </div>
                ),
              }] : []),
              // Holds tab (edit mode only, shown when holds exist)
              ...(isEditMode ? [{
                key: 'holds',
                label: (
                  <Space size={4}>
                    <StopOutlined />
                    <span>Holds ({invoiceHolds.length})</span>
                    {invoiceHolds.length > 0 && <Tag color="red" style={{ fontSize: 10, marginLeft: 2, padding: '0 4px', lineHeight: '16px' }}>{invoiceHolds.length}</Tag>}
                  </Space>
                ),
                children: invoiceHoldsLoading ? (
                  <div style={{ textAlign: 'center', padding: 40 }}>
                    <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
                    <div style={{ marginTop: 8, color: REDWOOD.neutral600, fontSize: 12 }}>Loading holds...</div>
                  </div>
                ) : invoiceHolds.length > 0 ? (
                  <Table
                    dataSource={invoiceHolds}
                    columns={[
                      { title: 'Hold Name', dataIndex: 'holdName', key: 'holdName', width: 180, render: (v: string) => <Text strong style={{ color: REDWOOD.error }}>{v}</Text> },
                      { title: 'Hold Reason', dataIndex: 'holdReason', key: 'holdReason', ellipsis: true },
                      { title: 'Hold Date', dataIndex: 'holdDate', key: 'holdDate', width: 110 },
                      { title: 'Held By', dataIndex: 'heldBy', key: 'heldBy', width: 140 },
                      { title: 'Release Date', dataIndex: 'releaseDate', key: 'releaseDate', width: 110, render: (v: string) => v ? <Text style={{ color: REDWOOD.success }}>{v}</Text> : <Tag color="red">Active</Tag> },
                      { title: 'Released By', dataIndex: 'releasedBy', key: 'releasedBy', width: 140 },
                    ]}
                    rowKey="key"
                    size="small"
                    pagination={false}
                    scroll={{ y: 300 }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: 30, color: REDWOOD.neutral600, fontSize: 12 }}>
                    No holds on this invoice.
                  </div>
                ),
              }] : []),
              // Installments tab (edit mode only)
              ...(isEditMode ? [{
                key: 'installments',
                label: (
                  <Space size={4}>
                    <DollarOutlined />
                    <span>Installments ({invoiceInstallments.length})</span>
                    <Tooltip
                      title={
                        <span style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                          {invoiceInstallmentsUrl}
                        </span>
                      }
                      placement="bottom"
                    >
                      <ApiOutlined style={{ color: REDWOOD.info, cursor: 'pointer', fontSize: 12 }} />
                    </Tooltip>
                  </Space>
                ),
                children: invoiceInstallmentsLoading ? (
                  <div style={{ textAlign: 'center', padding: 40 }}>
                    <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
                    <div style={{ marginTop: 8, color: REDWOOD.neutral600, fontSize: 12 }}>Loading installments...</div>
                  </div>
                ) : invoiceInstallments.length > 0 ? (
                  <Table
                    dataSource={invoiceInstallments}
                    columns={[
                      { title: '#', dataIndex: 'installmentNumber', key: 'installmentNumber', width: 60, align: 'center' as const },
                      { title: 'Due Date', dataIndex: 'dueDate', key: 'dueDate', width: 110 },
                      { title: 'Gross Amount', dataIndex: 'grossAmount', key: 'grossAmount', width: 130, align: 'right' as const, render: (v: number) => <Text strong>{formatAmount(v)}</Text> },
                      { title: 'Unpaid Amount', dataIndex: 'unpaidAmount', key: 'unpaidAmount', width: 130, align: 'right' as const, render: (v: number) => <Text style={{ color: v > 0 ? REDWOOD.error : REDWOOD.success }}>{formatAmount(v)}</Text> },
                      { title: 'Priority', dataIndex: 'paymentPriority', key: 'paymentPriority', width: 80, align: 'center' as const },
                      { title: 'Payment Method', dataIndex: 'paymentMethod', key: 'paymentMethod', width: 140 },
                      { title: 'Bank Account', dataIndex: 'bankAccount', key: 'bankAccount', ellipsis: true },
                    ]}
                    rowKey="key"
                    size="small"
                    pagination={false}
                    scroll={{ y: 300 }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: 30, color: REDWOOD.neutral600, fontSize: 12 }}>
                    No installments found for this invoice.
                  </div>
                ),
              }] : []),
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
                {isEditMode && invoicePayments.length > 0 && (() => {
                  const paidTotal = invoicePayments
                    .filter(p => p.status !== 'Voided')
                    .reduce((sum, p) => sum + p.paidAmount, 0);
                  const currency = invoicePayments[0]?.currency ?? '';
                  const balance = computedTotal - paidTotal;
                  return (
                    <>
                      <Divider style={{ margin: '4px 0' }} />
                      <Row justify="space-between" align="middle">
                        <Text style={{ fontSize: 12, color: REDWOOD.neutral600 }}>Total Paid (excl. Voided)</Text>
                        <Text style={{ fontSize: 13, color: REDWOOD.success }}>
                          {formatAmount(paidTotal)}{currency ? ` ${currency}` : ''}
                        </Text>
                      </Row>
                      <Row
                        justify="space-between"
                        align="middle"
                        style={{
                          padding: '8px 12px',
                          background: balance <= 0 ? '#f6ffed' : '#fff7e6',
                          borderRadius: 6,
                          border: `1px solid ${balance <= 0 ? '#b7eb8f' : '#ffd591'}`,
                          marginTop: 4,
                        }}
                      >
                        <Space>
                          <CreditCardOutlined style={{ color: balance <= 0 ? REDWOOD.success : REDWOOD.warning }} />
                          <Text strong style={{ fontSize: 14 }}>Invoice Balance</Text>
                        </Space>
                        <Text strong style={{ fontSize: 20, color: balance <= 0 ? REDWOOD.success : REDWOOD.warning }}>
                          {formatAmount(Math.abs(balance))}{currency ? ` ${currency}` : ''}
                        </Text>
                      </Row>
                    </>
                  );
                })()}
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
                  <Tag color={apiLog.method === 'PUT' ? 'orange' : 'blue'} style={{ fontSize: 10 }}>{apiLog.method}</Tag>
                  <Tag color={apiLog.status === 'SUCCESS' ? 'green' : 'red'}>{apiLog.httpStatus} {apiLog.status}</Tag>
                  <Text type="secondary" style={{ fontSize: 11 }}>{apiLog.timestamp}</Text>
                </Space>
                <Space>
                  {apiLogHistory.length > 1 && (
                    <Button
                      size="small"
                      icon={<FileTextOutlined />}
                      onClick={() => setApiLogHistoryVisible(true)}
                    >
                      History ({apiLogHistory.length})
                    </Button>
                  )}
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      const curlCmd = `curl -X ${apiLog.method} '${apiLog.url}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${apiLog.requestBody.replace(/'/g, "'\\''")}'`;
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
                    <Tag color={apiLog.method === 'PUT' ? 'orange' : 'blue'} style={{ fontSize: 10 }}>{apiLog.method}</Tag> Request Body
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
                    {apiLog.status === 'SUCCESS'
                      ? (apiLog.method === 'PUT' ? 'Invoice updated successfully' : 'Invoice created successfully')
                      : 'Request failed'}
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

      {/* ========== API LOG HISTORY MODAL ========== */}
      <Modal
        title={
          <Space>
            <ApiOutlined style={{ color: REDWOOD.info }} />
            <span>API Log History ({apiLogHistory.length} calls)</span>
          </Space>
        }
        open={apiLogHistoryVisible}
        onCancel={() => setApiLogHistoryVisible(false)}
        footer={
          <Space>
            <Button
              danger
              onClick={() => { setApiLogHistory([]); setApiLogHistoryVisible(false); message.success('History cleared'); }}
              disabled={apiLogHistory.length === 0}
            >
              Clear History
            </Button>
            <Button type="primary" onClick={() => setApiLogHistoryVisible(false)}>Close</Button>
          </Space>
        }
        width={850}
      >
        <Table
          dataSource={apiLogHistory.map((entry, i) => ({ ...entry, key: i }))}
          pagination={false}
          size="small"
          scroll={{ y: 400 }}
          columns={[
            {
              title: '#',
              key: 'idx',
              width: 35,
              align: 'center',
              render: (_: any, __: any, idx: number) => <Text style={{ fontSize: 11 }}>{idx + 1}</Text>,
            },
            {
              title: 'Action',
              dataIndex: 'action',
              key: 'action',
              width: 130,
              render: (v: string) => <Text strong style={{ fontSize: 11 }}>{v}</Text>,
            },
            {
              title: 'Method',
              dataIndex: 'method',
              key: 'method',
              width: 60,
              render: (v: string) => <Tag color={v === 'PUT' ? 'orange' : v === 'DELETE' ? 'red' : 'blue'} style={{ fontSize: 10 }}>{v}</Tag>,
            },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              width: 100,
              render: (v: string, record: any) => (
                <Tag color={v === 'SUCCESS' ? 'green' : 'red'} style={{ fontSize: 10 }}>{record.httpStatus} {v}</Tag>
              ),
            },
            {
              title: 'URL',
              dataIndex: 'url',
              key: 'url',
              ellipsis: true,
              render: (v: string) => <Text style={{ fontSize: 10, fontFamily: 'monospace' }}>{v.replace(APEX_DB_CONFIG.baseUrl, '...')}</Text>,
            },
            {
              title: 'Time',
              dataIndex: 'timestamp',
              key: 'timestamp',
              width: 140,
              render: (v: string) => <Text type="secondary" style={{ fontSize: 10 }}>{v}</Text>,
            },
            {
              title: '',
              key: 'actions',
              width: 60,
              render: (_: any, record: any) => (
                <Button
                  size="small"
                  type="link"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    const curlCmd = `curl -X ${record.method} '${record.url}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${record.requestBody.replace(/'/g, "'\\''")}'`;
                    navigator.clipboard.writeText(curlCmd);
                    message.success('cURL copied');
                  }}
                  style={{ fontSize: 10 }}
                >
                  cURL
                </Button>
              ),
            },
          ]}
          expandable={{
            expandedRowRender: (record: any) => (
              <Row gutter={12}>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 10 }}>Request</Text>
                  <pre style={{
                    background: '#1e1e1e', color: '#d4d4d4', padding: '6px 8px', borderRadius: 4,
                    fontSize: 9, fontFamily: 'monospace', maxHeight: 150, overflow: 'auto', margin: '4px 0 0',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {record.requestBody}
                  </pre>
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 10 }}>Response</Text>
                  <pre style={{
                    background: '#1e1e1e', color: record.status === 'SUCCESS' ? '#4ec9b0' : '#f48771',
                    padding: '6px 8px', borderRadius: 4, fontSize: 9, fontFamily: 'monospace',
                    maxHeight: 150, overflow: 'auto', margin: '4px 0 0',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {record.responseBody}
                  </pre>
                </Col>
              </Row>
            ),
          }}
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

      {/* Installments Modal */}
      <Modal
        title={
          <Space>
            <ScheduleOutlined style={{ color: '#722ed1' }} />
            <span>Installments</span>
            <Tooltip
              title={
                <span style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                  {installmentsModalUrl}
                </span>
              }
              placement="bottom"
            >
              <ApiOutlined style={{ color: REDWOOD.info, cursor: 'pointer', fontSize: 14 }} />
            </Tooltip>
          </Space>
        }
        open={installmentsModalOpen}
        onCancel={() => setInstallmentsModalOpen(false)}
        footer={[<Button key="close" onClick={() => setInstallmentsModalOpen(false)}>Close</Button>]}
        width={900}
        destroyOnClose
      >
        <Spin spinning={installmentsModalLoading}>
          <Table
            dataSource={installmentsModalData.map((item: any, idx: number) => ({
              key: (item.installment_id ?? item.INSTALLMENT_ID ?? idx).toString(),
              paymentNum:    item.payment_num         ?? item.PAYMENT_NUM         ?? item.PaymentNum         ?? idx + 1,
              dueDate:       item.due_date            ?? item.DUE_DATE            ?? item.DueDate            ?? '',
              grossAmount:   item.gross_amount        ?? item.GROSS_AMOUNT        ?? item.GrossAmount        ?? 0,
              remaining:     item.amount_remaining    ?? item.AMOUNT_REMAINING    ?? item.unpaid_amount      ?? item.UNPAID_AMOUNT ?? item.UnpaidAmount ?? 0,
              status:        item.payment_status_flag ?? item.PAYMENT_STATUS_FLAG ?? item.status             ?? item.STATUS       ?? '',
              paymentMethod: item.payment_method_code ?? item.PAYMENT_METHOD_CODE ?? item.payment_method     ?? item.PAYMENT_METHOD ?? '',
              priority:      item.payment_priority    ?? item.PAYMENT_PRIORITY    ?? item.PaymentPriority    ?? '',
              holdFlag:      item.hold_flag           ?? item.HOLD_FLAG           ?? 'N',
            }))}
            columns={[
              { title: '#',              dataIndex: 'paymentNum',    key: 'paymentNum',    width: 55,  align: 'center' as const },
              { title: 'Due Date',       dataIndex: 'dueDate',       key: 'dueDate',       width: 110,
                render: (v: string) => v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '' },
              { title: 'Gross Amount',   dataIndex: 'grossAmount',   key: 'grossAmount',   width: 130, align: 'right' as const,
                render: (v: number) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 }) },
              { title: 'Remaining',      dataIndex: 'remaining',     key: 'remaining',     width: 130, align: 'right' as const,
                render: (v: number) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 }) },
              { title: 'Status',         dataIndex: 'status',        key: 'status',        width: 90,
                render: (v: string) => {
                  const s = (v || '').toUpperCase();
                  const color = s === 'Y' || s === 'PAID' ? 'success' : s === 'P' || s === 'PARTIAL' ? 'warning' : 'default';
                  const label = s === 'Y' ? 'Paid' : s === 'N' ? 'Unpaid' : s === 'P' ? 'Partial' : v || 'Unpaid';
                  return <Tag color={color}>{label}</Tag>;
                }},
              { title: 'Payment Method', dataIndex: 'paymentMethod', key: 'paymentMethod', width: 130 },
              { title: 'Priority',       dataIndex: 'priority',      key: 'priority',      width: 70, align: 'center' as const },
              { title: 'Hold',           dataIndex: 'holdFlag',      key: 'holdFlag',      width: 60, align: 'center' as const,
                render: (v: string) => v === 'Y' ? <Tag color="error">Hold</Tag> : null },
            ]}
            size="small"
            bordered
            pagination={false}
            locale={{ emptyText: 'No installments found for this invoice.' }}
            summary={(rows) => rows.length === 0 ? undefined : (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2}><span style={{ fontWeight: 600 }}>Totals</span></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <span style={{ fontWeight: 600 }}>
                      {rows.reduce((s, r: any) => s + Number(r.grossAmount || 0), 0)
                        .toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <span style={{ fontWeight: 600 }}>
                      {rows.reduce((s, r: any) => s + Number(r.remaining || 0), 0)
                        .toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} colSpan={4} />
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </Spin>
      </Modal>

      {/* ═══════════════════ PAY IN FULL MODAL ═══════════════════ */}
      <Modal
        title={
          <Space>
            <CreditCardOutlined style={{ color: REDWOOD.success }} />
            <span>Pay Invoice in Full</span>
            <Tooltip title="View POST endpoints & JSON bodies">
              <ApiOutlined
                style={{ color: REDWOOD.info, cursor: 'pointer', fontSize: 15, marginLeft: 4 }}
                onClick={(e) => { e.stopPropagation(); setPayInFullApiDrawerOpen(true); }}
              />
            </Tooltip>
          </Space>
        }
        open={payInFullOpen}
        onCancel={() => { setPayInFullOpen(false); payInFullForm.resetFields(); }}
        width={750}
        destroyOnClose
        footer={[
          <Button key="cancel" onClick={() => { setPayInFullOpen(false); payInFullForm.resetFields(); }}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={payInFullSubmitting}
            icon={<CreditCardOutlined />}
            style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
            onClick={() => payInFullForm.submit()}
          >
            Confirm Payment
          </Button>,
        ]}
      >
        <Form
          form={payInFullForm}
          layout="vertical"
          size="small"
          onFinish={async (values) => {
            setPayInFullSubmitting(true);
            try {
              // TODO: wire up payment submission API
              console.log('[Pay in Full] Payload:', values);
              message.success('Payment submitted successfully');
              setPayInFullOpen(false);
              payInFullForm.resetFields();
            } catch {
              message.error('Payment submission failed');
            } finally {
              setPayInFullSubmitting(false);
            }
          }}
        >
          {/* ── Read-only invoice summary ── */}
          <div style={{
            background: REDWOOD.neutral100,
            border: `1px solid ${REDWOOD.neutral200}`,
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 16,
          }}>
            <Row gutter={16}>
              <Col span={12}>
                <div style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Business Unit</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {form.getFieldValue('businessUnit') || headerValues.businessUnit || '—'}
                </div>
              </Col>
              <Col span={12}>
                <div style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Supplier</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {form.getFieldValue('supplier') || '—'}
                </div>
              </Col>
            </Row>
            <Row gutter={16} style={{ marginTop: 8 }}>
              <Col span={12}>
                <div style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Invoice Number</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {form.getFieldValue('invoiceNumber') || '—'}
                </div>
              </Col>
              <Col span={12}>
                <div style={{ fontSize: 11, color: REDWOOD.neutral600 }}>Pay Amount</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: REDWOOD.success }}>
                  {formatAmount(
                    computedTotal - invoicePayments.filter(p => p.status !== 'Voided').reduce((s, p) => s + p.paidAmount, 0)
                  )}{' '}
                  <span style={{ fontSize: 13 }}>
                    {headerValues.invoiceCurrency || form.getFieldValue('invoiceCurrency') || 'AED'}
                  </span>
                </div>
              </Col>
            </Row>
          </div>

          <Divider style={{ margin: '0 0 14px' }} />

          {/* ── Payment fields ── */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Payment Date"
                name="paymentDate"
                rules={[{ required: true, message: 'Payment date is required' }]}
              >
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Payment Method"
                name="paymentMethod"
                rules={[{ required: true, message: 'Payment method is required' }]}
              >
                <Select placeholder="Select method">
                  <Select.Option value="Electronic">Electronic</Select.Option>
                  <Select.Option value="Check">Check</Select.Option>
                  <Select.Option value="Wire">Wire</Select.Option>
                  <Select.Option value="EFT">EFT</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label={
              <Space>
                <span>Disbursement Bank Account</span>
                {payInFullBankLoading && <LoadingOutlined style={{ fontSize: 12, color: REDWOOD.info }} />}
                {!payInFullBankLoading && payInFullBankAccounts.length === 0 && (
                  <span style={{ color: REDWOOD.warning, fontSize: 11 }}>
                    No accounts found for this Business Unit
                  </span>
                )}
              </Space>
            }
            name="disbursementBankAccount"
            rules={[{ required: true, message: 'Bank account is required' }]}
          >
            <Select
              placeholder={payInFullBankLoading ? 'Loading...' : 'Select bank account'}
              loading={payInFullBankLoading}
              showSearch
              optionFilterProp="label"
            >
              {payInFullBankAccounts.map((acct, i) => (
                <Select.Option key={i} value={acct.bankAccountName} label={acct.bankAccountName}>
                  <Space>
                    <BankOutlined style={{ color: REDWOOD.info }} />
                    <span>{acct.bankAccountName}</span>
                    {acct.currencyCode && <Tag style={{ fontSize: 10 }}>{acct.currencyCode}</Tag>}
                  </Space>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Payment Document" name="paymentDocument">
                <Select placeholder="Select document" allowClear>
                  <Select.Option value="Check">Check</Select.Option>
                  <Select.Option value="Manual">Manual</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Paper Document Number" name="paperDocumentNumber">
                <Input placeholder="Auto-assigned if blank" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Description" name="description">
            <Input.TextArea rows={2} placeholder="Optional payment description" />
          </Form.Item>

          {/* ── Pending installments (below form fields) ── */}
          {(() => {
            const pending = invoiceInstallments.filter(i => i.unpaidAmount > 0);
            if (pending.length === 0) return null;
            const totalUnpaid = pending.reduce((s, i) => s + i.unpaidAmount, 0);
            const currency = headerValues.invoiceCurrency || form.getFieldValue('invoiceCurrency') || 'AED';
            return (
              <>
                <Divider style={{ margin: '12px 0 10px' }} />
                <div style={{ fontSize: 12, fontWeight: 600, color: REDWOOD.neutral700, marginBottom: 6 }}>
                  Pending Installments
                </div>
                <Table
                  dataSource={pending}
                  rowKey="key"
                  size="small"
                  pagination={false}
                  scroll={{ y: 180 }}
                  columns={[
                    { title: '#',            dataIndex: 'installmentNumber', key: 'installmentNumber', width: 45,  align: 'center' as const },
                    { title: 'Due Date',     dataIndex: 'dueDate',           key: 'dueDate',           width: 110 },
                    { title: 'Gross Amount', dataIndex: 'grossAmount',       key: 'grossAmount',       width: 140, align: 'right' as const,
                      render: (v: number) => <Text>{formatAmount(v)}</Text> },
                    { title: 'Unpaid Amount', dataIndex: 'unpaidAmount',     key: 'unpaidAmount',      align: 'right' as const,
                      render: (v: number) => (
                        <Text strong style={{ color: REDWOOD.warning }}>{formatAmount(v)} {currency}</Text>
                      )},
                  ]}
                  summary={() => (
                    <Table.Summary.Row style={{ background: '#fffbe6' }}>
                      <Table.Summary.Cell index={0} colSpan={3} align="right">
                        <Text strong style={{ fontSize: 12 }}>Total Unpaid</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        <Text strong style={{ color: REDWOOD.warning, fontSize: 13 }}>
                          {formatAmount(totalUnpaid)} {currency}
                        </Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  )}
                />
              </>
            );
          })()}
        </Form>
      </Modal>

      {/* ═══════════════ PAY IN FULL — API REFERENCE DRAWER ═══════════════ */}
      <Drawer
        title={
          <Space>
            <ApiOutlined style={{ color: REDWOOD.info }} />
            <span>Pay in Full — API Endpoints</span>
          </Space>
        }
        placement="right"
        width={520}
        open={payInFullApiDrawerOpen}
        onClose={() => setPayInFullApiDrawerOpen(false)}
        destroyOnClose={false}
      >
        {(() => {
          const invoiceId   = savedInvoiceId ?? initialData?.invoiceId ?? '<INVOICE_ID>';
          const fv          = payInFullForm.getFieldsValue();
          const buName      = form.getFieldValue('businessUnit') || headerValues.businessUnit || '';
          const pendingInst = invoiceInstallments.filter(i => i.unpaidAmount > 0);
          const currency    = headerValues.invoiceCurrency || form.getFieldValue('invoiceCurrency') || 'AED';
          const balance     = computedTotal - invoicePayments
            .filter(p => p.status !== 'Voided').reduce((s, p) => s + p.paidAmount, 0);

          const blockStyle: React.CSSProperties = {
            background: '#1e1e1e', color: '#d4d4d4',
            fontFamily: 'monospace', fontSize: 11,
            padding: '10px 12px', borderRadius: 6,
            overflowX: 'auto', whiteSpace: 'pre',
            marginTop: 6, marginBottom: 0,
          };
          const labelStyle: React.CSSProperties = {
            fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            padding: '2px 8px', borderRadius: 4, marginRight: 8,
          };

          const apis = [
            {
              step: 1,
              method: 'POST',
              color: '#52c41a',
              url: `${APEX_DB_CONFIG.baseUrl}/ap/payments`,
              desc: '✅ Endpoint EXISTS. Inserts into RR_AP_PAYMENTS_ALL via save_payment(). Keys must be PascalCase. Returns { "status":"success", "checkId":<value> } — use that checkId in Step 3.',
              body: {
                '// CheckId':                 'leave null — APEX/DB will assign a new ID',
                CheckId:                      null,
                PaymentDate:                  fv.paymentDate ? fv.paymentDate.format('YYYY-MM-DD') : '',
                PaymentAmount:                balance,
                PaymentCurrency:              currency,
                PaymentStatus:                'Negotiable',
                PaymentMethod:                fv.paymentMethod || '',
                PaymentDocument:              fv.paymentDocument || '',
                PaperDocumentNumber:          fv.paperDocumentNumber || null,
                PaymentDescription:           fv.description || '',
                BusinessUnit:                 buName,
                DisbursementBankAccountName:  fv.disbursementBankAccount || '',
                '// InvoiceId note':          'NOT in this table — linked in Step 3',
              },
            },
            ...(pendingInst.length > 0 ? [{
              step: 2,
              method: 'PUT',
              color: '#fa8c16',
              url: `${APEX_DB_CONFIG.baseUrl}/ap/createinvoice/installments`,
              desc: `⚠️ Endpoint NEEDS TO BE CREATED on backend. Update each pending installment (${pendingInst.length} call${pendingInst.length > 1 ? 's' : ''}). Call once per row below.`,
              body: {
                '// call once per pending installment': '',
                InvoiceId:       invoiceId,
                InstallmentId:   pendingInst[0]?.key ?? '<INSTALLMENT_ID>',
                PaymentStatus:   'Fully Paid',
                AmountRemaining: 0,
                ...(pendingInst.length > 1 ? {
                  '// also call for': pendingInst.slice(1).map(i => ({
                    InstallmentId:   i.key,
                    DueDate:         i.dueDate,
                    UnpaidWas:       i.unpaidAmount,
                  })),
                } : {}),
              },
            }] : []),
            {
              step: pendingInst.length > 0 ? 3 : 2,
              method: 'POST',
              color: '#fa8c16',
              url: `${APEX_DB_CONFIG.baseUrl}/ap/createinvoice/payments`,
              desc: '⚠️ Endpoint NEEDS TO BE CREATED on backend (currently GET only). Inserts into RR_AP_INVOICE_PAYMENTS_ALL to link the payment to the invoice — this makes it appear in the Payments tab.',
              body: {
                InvoiceId:           invoiceId,
                CheckId:             '<checkId from Step 1 response>',
                PaperDocumentNumber: fv.paperDocumentNumber || null,
                PaymentDate:         fv.paymentDate ? fv.paymentDate.format('YYYY-MM-DD') : '',
                Amount:              balance,
                CurrencyCode:        currency,
                PaymentStatus:       'Negotiable',
                BankAccount:         fv.disbursementBankAccount || '',
                Description:         fv.description || '',
              },
            },
          ];

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Alert
                type="info"
                showIcon
                message="3-step payment creation flow"
                description="Step 1 endpoint exists (POST /ap/payments). Steps 2 & 3 endpoints need to be created on the backend. Test Step 1 in Postman first."
                style={{ fontSize: 12 }}
              />
              {apis.map(api => (
                <div key={api.step} style={{ border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', background: REDWOOD.neutral100, borderBottom: `1px solid ${REDWOOD.neutral200}` }}>
                    <Space>
                      <Text strong style={{ color: REDWOOD.neutral600, fontSize: 12 }}>Step {api.step}</Text>
                      <span style={{ ...labelStyle, background: api.color, color: '#fff' }}>{api.method}</span>
                      <Text style={{ fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {api.url}
                      </Text>
                    </Space>
                  </div>
                  <div style={{ padding: '6px 12px 4px' }}>
                    <Text style={{ fontSize: 11, color: REDWOOD.neutral600 }}>{api.desc}</Text>
                  </div>
                  <div style={{ padding: '0 12px 12px' }}>
                    <pre style={blockStyle}>{JSON.stringify(api.body, null, 2)}</pre>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </Drawer>
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* ═══════════════════════════════════════════════════════════ */}

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
