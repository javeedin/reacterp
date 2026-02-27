import React, { useState, useMemo, useEffect } from 'react';
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
  Checkbox,
  Divider,
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
  CloseCircleOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import FloatingMenu from '../../components/FloatingMenu';
import Autopilot from '../../components/Autopilot';
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
  // Accounting
  accountingDate: string;
  paymentDescription: string;
  // Currency conversion
  conversionRate: number | null;
  conversionDate: string;
  conversionRateType: string;
  // Maturity
  maturityDate: string;
  anticipatedValueDate: string;
  // Void
  voidDate: string;
  voidAccountingDate: string;
  // Stop payment
  stopDate: string;
  stopReason: string;
  stopReference: string;
  // Third party
  thirdPartySupplier: string;
  // Last update
  lastUpdateDate: string;
  // Clearing
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

// Bank account record from APEX (matches /banks/bankaccounts response)
interface BankAccountRecord {
  bankAccountName: string;
  bankAccountNumber: string;
  currencyCode: string;
  bankNumber: string;
  branchNumber: string;
  cashAccountCombination: string;
  cashClearingAccountCombination: string;
  legalEntityName: string;
}

// Invoice record used in the "Invoices to Pay" grid within Create Payment
interface PaymentInvoice {
  key: string;
  invoiceNumber: string;
  invoiceDate: string;
  description: string;
  invoiceAmount: number;
  amountDue: number;
  applyAmount: number;
  discountAmount: number;
  dueDate: string;
  currency: string;
  supplierSite: string;
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

// Fusion API config
const FUSION_CONFIG = {
  baseUrl: ORACLE_FUSION_CONFIG.baseUrl,
  paymentsEndpoint: '/payablesPayments',
  auth: btoa(`${ORACLE_FUSION_CONFIG.username}:${ORACLE_FUSION_CONFIG.password}`),
};

// APEX API config
const APEX_PAYMENTS_URL = `${APEX_DB_CONFIG.baseUrl}/ap/payments`;
const APEX_SUPPLIERS_URL = `${APEX_DB_CONFIG.baseUrl}/suppliers`;
const APEX_BANK_ACCOUNTS_URL = `${APEX_DB_CONFIG.baseUrl}/banks/bankaccounts`;
const APEX_BUSINESS_UNITS_URL = `${APEX_DB_CONFIG.baseUrl}/gl/businessunits`;
const APEX_INVOICE_URL = `${APEX_DB_CONFIG.baseUrl}/ap/createinvoice`;

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
  accountingDate: formatDate(item.AccountingDate),
  paymentDescription: item.PaymentDescription || '',
  conversionRate: item.ConversionRate ?? null,
  conversionDate: formatDate(item.ConversionDate),
  conversionRateType: item.ConversionRateType || '',
  maturityDate: formatDate(item.MaturityDate),
  anticipatedValueDate: formatDate(item.AnticipatedValueDate),
  voidDate: formatDate(item.VoidDate),
  voidAccountingDate: formatDate(item.VoidAccountingDate),
  stopDate: formatDate(item.StopDate),
  stopReason: item.StopReason || '',
  stopReference: item.StopReference || '',
  thirdPartySupplier: item.ThirdPartySupplier || '',
  lastUpdateDate: formatDate(item.LastUpdateDate),
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
  accountingDate: formatDate(item.AccountingDate),
  paymentDescription: item.PaymentDescription || '',
  conversionRate: item.ConversionRate ?? null,
  conversionDate: formatDate(item.ConversionDate),
  conversionRateType: item.ConversionRateType || '',
  maturityDate: formatDate(item.MaturityDate),
  anticipatedValueDate: formatDate(item.AnticipatedValueDate),
  voidDate: formatDate(item.VoidDate),
  voidAccountingDate: formatDate(item.VoidAccountingDate),
  stopDate: formatDate(item.StopDate),
  stopReason: item.StopReason || '',
  stopReference: item.StopReference || '',
  thirdPartySupplier: item.ThirdPartySupplier || '',
  lastUpdateDate: formatDate(item.LastUpdateDate),
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
  const [createPaymentForm] = Form.useForm();
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

  // Create Payment tab state
  const [createPaymentTabOpen, setCreatePaymentTabOpen] = useState(false);
  const [createPaymentActiveTab, setCreatePaymentActiveTab] = useState('paymentDetails');

  // Supplier lookup modal state
  const [supplierModalVisible, setSupplierModalVisible] = useState(false);
  const [supplierModalContext, setSupplierModalContext] = useState<'search' | 'create'>('search');
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierSearchText, setSupplierSearchText] = useState('');

  // Business Units state (for Business Unit LOV)
  const [businessUnitsList, setBusinessUnitsList] = useState<{ id: number; name: string; legalEntityName: string }[]>([]);
  const [businessUnitsListLoading, setBusinessUnitsListLoading] = useState(false);
  const [selectedBuLegalEntityName, setSelectedBuLegalEntityName] = useState<string>('');

  const fetchBusinessUnits = async () => {
    setBusinessUnitsListLoading(true);
    try {
      const response = await fetch(APEX_BUSINESS_UNITS_URL, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const items = (data.items || []).map((item: any) => ({
        id: item.business_unit_id,
        name: item.business_unit_name || '',
        legalEntityName: item.legal_entity_name || '',
      }));
      setBusinessUnitsList(items);
    } catch (err) {
      console.error('Failed to fetch business units:', err);
      message.error('Failed to load business units');
    } finally {
      setBusinessUnitsListLoading(false);
    }
  };

  // Bank accounts state (for Disbursement Bank Account LOV)
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([]);
  const [bankAccountsLoading, setBankAccountsLoading] = useState(false);
  const [selectedBankAccount, setSelectedBankAccount] = useState<BankAccountRecord | null>(null);

  // Fetch bank accounts from APEX
  const fetchBankAccounts = async () => {
    setBankAccountsLoading(true);
    try {
      const response = await fetch(APEX_BANK_ACCOUNTS_URL, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const items: BankAccountRecord[] = (data.items || []).map((item: any) => ({
        bankAccountName: item.bank_account_name || '',
        bankAccountNumber: item.bank_account_number || '',
        currencyCode: item.currency_code || '',
        bankNumber: item.bank_number || '',
        branchNumber: item.branch_number || '',
        cashAccountCombination: item.cash_account_combination || '',
        cashClearingAccountCombination: item.cash_clearing_account_combination || '',
        legalEntityName: item.legal_entity_name || '',
      }));
      setBankAccounts(items);
    } catch (err) {
      console.error('Failed to fetch bank accounts:', err);
      message.error('Failed to load bank accounts');
    } finally {
      setBankAccountsLoading(false);
    }
  };

  // Pre-load Business Units on mount (needed for Search form too)
  useEffect(() => {
    fetchBusinessUnits();
  }, []);

  // Load remaining LOV data when Create Payment tab opens
  useEffect(() => {
    if (createPaymentTabOpen && bankAccounts.length === 0) {
      fetchBankAccounts();
    }
  }, [createPaymentTabOpen]);

  // Add Invoices modal state
  const [addInvoicesModalVisible, setAddInvoicesModalVisible] = useState(false);
  const [availableInvoices, setAvailableInvoices] = useState<PaymentInvoice[]>([]);
  const [availableInvoicesLoading, setAvailableInvoicesLoading] = useState(false);
  const [selectedInvoiceKeys, setSelectedInvoiceKeys] = useState<React.Key[]>([]);
  const [invoicesToPay, setInvoicesToPay] = useState<PaymentInvoice[]>([]);
  const [supplierTotalBalance, setSupplierTotalBalance] = useState<number | null>(null);
  const [supplierBalanceLoading, setSupplierBalanceLoading] = useState(false);

  const totalAppliedAmount = invoicesToPay.reduce((sum, i) => sum + (i.applyAmount || 0), 0);
  const balanceAfterApplication = supplierTotalBalance !== null ? supplierTotalBalance - totalAppliedAmount : null;

  const fetchAvailableInvoices = async (supplierNumber: string) => {
    setAvailableInvoicesLoading(true);
    try {
      const url = `${APEX_INVOICE_URL}?supplier_number=${encodeURIComponent(supplierNumber)}`;
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const already = new Set(invoicesToPay.map(i => i.key));
      const items = (data.items || [])
        .map((item: any, index: number) => ({
          key: item.invoice_id?.toString() || item.invoice_number || index.toString(),
          invoiceNumber: item.invoice_number || '',
          invoiceDate: item.invoice_date ? item.invoice_date.substring(0, 10) : '',
          description: item.description || '',
          invoiceAmount: item.invoice_amount || 0,
          amountDue: (item.invoice_amount || 0) - (item.amount_paid || 0),
          applyAmount: (item.invoice_amount || 0) - (item.amount_paid || 0),
          discountAmount: 0,
          dueDate: item.due_date ? item.due_date.substring(0, 10) : '',
          currency: item.invoice_currency || 'AED',
          supplierSite: item.supplier_site || '',
        }))
        .filter((inv: PaymentInvoice) => inv.amountDue > 0 && !already.has(inv.key));
      setAvailableInvoices(items);
      setSelectedInvoiceKeys([]);
    } catch (err) {
      console.error('Failed to fetch invoices:', err);
      message.error('Failed to load invoices');
    } finally {
      setAvailableInvoicesLoading(false);
    }
  };

  const fetchSupplierDueBalance = async (supplierNumber: string) => {
    setSupplierBalanceLoading(true);
    setSupplierTotalBalance(null);
    try {
      const url = `${APEX_INVOICE_URL}?supplier_number=${encodeURIComponent(supplierNumber)}`;
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const balance = (data.items || []).reduce((sum: number, item: any) => {
        const due = (item.invoice_amount || 0) - (item.amount_paid || 0);
        return due > 0 ? sum + due : sum;
      }, 0);
      setSupplierTotalBalance(balance);
    } catch (err) {
      console.error('Failed to fetch supplier balance:', err);
      setSupplierTotalBalance(0);
    } finally {
      setSupplierBalanceLoading(false);
    }
  };

  // Filter bank accounts to only those matching the selected BU's legal entity
  const filteredBankAccounts = useMemo(() => {
    if (!selectedBuLegalEntityName) return [];
    return bankAccounts.filter(a => a.legalEntityName === selectedBuLegalEntityName);
  }, [bankAccounts, selectedBuLegalEntityName]);

  // Fetch suppliers from API
  const fetchSuppliers = async () => {
    setSupplierLoading(true);
    debugLog('INFO', `Fetching suppliers from: ${APEX_SUPPLIERS_URL}`);
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
          creationDate: item.creation_date || '',
          taxpayerId: item.taxpayer_id || '',
        }));
        setSuppliers(mapped);
        debugLog('RESPONSE', `Fetched ${mapped.length} suppliers`);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      debugLog('ERROR', `Supplier fetch failed: ${errMsg}`);
      message.error(`Failed to fetch suppliers: ${errMsg}`);
    } finally {
      setSupplierLoading(false);
    }
  };

  // Open supplier lookup modal
  const openSupplierModal = (context: 'search' | 'create' = 'search') => {
    setSupplierModalContext(context);
    setSupplierModalVisible(true);
    setSupplierSearchText('');
    if (suppliers.length === 0) {
      fetchSuppliers();
    }
  };

  // Handle supplier selection
  const handleSupplierSelect = (record: SupplierRecord) => {
    if (supplierModalContext === 'create') {
      createPaymentForm.setFieldsValue({
        payee: record.supplier,
        supplierNumber: record.supplierNumber,
        payeeSite: undefined,
      });
      setInvoicesToPay([]);
      fetchSupplierDueBalance(record.supplierNumber);
    } else {
      form.setFieldsValue({
        supplierOrParty: record.supplier,
        supplierNumber: record.supplierNumber,
      });
    }
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
      if (targetKey === 'create-payment') {
        setCreatePaymentTabOpen(false);
        setActiveTab('search');
      } else {
        closePaymentTab(targetKey);
      }
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
      title: 'Business Unit',
      dataIndex: 'businessUnit',
      key: 'businessUnit',
      width: 160,
      ellipsis: true,
    },
    {
      title: 'Supplier Number',
      dataIndex: 'supplierNumber',
      key: 'supplierNumber',
      width: 130,
    },
    {
      title: 'Payee Site',
      dataIndex: 'payeeSite',
      key: 'payeeSite',
      width: 130,
      ellipsis: true,
    },
    {
      title: 'Payment Method',
      dataIndex: 'paymentMethod',
      key: 'paymentMethod',
      width: 130,
    },
    {
      title: 'Payment Type',
      dataIndex: 'paymentType',
      key: 'paymentType',
      width: 130,
    },
    {
      title: 'Accounting Date',
      dataIndex: 'accountingDate',
      key: 'accountingDate',
      width: 130,
      sorter: true,
    },
    {
      title: 'Accounting Status',
      dataIndex: 'accountingStatus',
      key: 'accountingStatus',
      width: 140,
      render: (status: string) => {
        if (!status) return null;
        const color = status === 'Accounted' ? REDWOOD.success : status === 'Not Accounted' ? REDWOOD.warning : REDWOOD.neutral600;
        return <Tag style={{ color, borderColor: color, background: 'transparent' }}>{status}</Tag>;
      },
    },
    {
      title: 'Void Date',
      dataIndex: 'voidDate',
      key: 'voidDate',
      width: 110,
      render: (val: string) => val ? <span style={{ color: REDWOOD.error }}>{val}</span> : null,
    },
    {
      title: 'Legal Entity',
      dataIndex: 'legalEntity',
      key: 'legalEntity',
      width: 160,
      ellipsis: true,
    },
    {
      title: 'Disbursement Bank Account',
      dataIndex: 'disbursementBankAccount',
      key: 'disbursementBankAccount',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Voucher Number',
      dataIndex: 'voucherNumber',
      key: 'voucherNumber',
      width: 130,
      render: (val: number) => val || null,
    },
    {
      title: 'Description',
      dataIndex: 'paymentDescription',
      key: 'paymentDescription',
      width: 180,
      ellipsis: true,
    },
    {
      title: 'Conv. Rate',
      dataIndex: 'conversionRate',
      key: 'conversionRate',
      width: 100,
      align: 'right' as const,
      render: (val: number | null) => val != null ? val : null,
    },
    {
      title: 'Conv. Rate Type',
      dataIndex: 'conversionRateType',
      key: 'conversionRateType',
      width: 130,
    },
    {
      title: 'Maturity Date',
      dataIndex: 'maturityDate',
      key: 'maturityDate',
      width: 120,
    },
    {
      title: 'Anticipated Value Date',
      dataIndex: 'anticipatedValueDate',
      key: 'anticipatedValueDate',
      width: 160,
    },
    {
      title: 'Stop Date',
      dataIndex: 'stopDate',
      key: 'stopDate',
      width: 110,
      render: (val: string) => val ? <span style={{ color: REDWOOD.warning }}>{val}</span> : null,
    },
    {
      title: 'Stop Reason',
      dataIndex: 'stopReason',
      key: 'stopReason',
      width: 160,
      ellipsis: true,
    },
    {
      title: 'Third Party Supplier',
      dataIndex: 'thirdPartySupplier',
      key: 'thirdPartySupplier',
      width: 180,
      ellipsis: true,
    },
    {
      title: 'Last Updated',
      dataIndex: 'lastUpdateDate',
      key: 'lastUpdateDate',
      width: 130,
      sorter: true,
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
                      layout="horizontal"
                      labelCol={{ span: 10 }}
                      wrapperCol={{ span: 14 }}
                      onFinish={handleSearch}
                      size="small"
                    >
                      <Row gutter={24}>
                        <Col span={8}>
                          <Form.Item
                            label={<><span style={{ color: REDWOOD.primary }}>**</span> Supplier or Party</>}
                            name="supplierOrParty"
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
                          <Form.Item name="supplierNumber" hidden>
                            <Input />
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
                            <Select
                              placeholder="Select Business Unit"
                              allowClear
                              showSearch
                              optionFilterProp="children"
                              loading={businessUnitsListLoading}
                            >
                              {businessUnitsList.map(bu => (
                                <Option key={bu.id} value={bu.name}>{bu.name}</Option>
                              ))}
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
              scroll={{ x: 4200 }}
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
    // Create Payment tab
    ...(createPaymentTabOpen ? [{
      key: 'create-payment',
      label: 'Create Payment',
      closable: true,
      children: (
        <div style={{ padding: 16, background: REDWOOD.neutral100, minHeight: 'calc(100vh - 160px)' }}>

          {/* Payment Header Form */}
          <Card
            style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
            styles={{ body: { padding: 0 } }}
          >
            <Form
              form={createPaymentForm}
              layout="horizontal"
              labelCol={{ span: 7 }}
              wrapperCol={{ span: 17 }}
              labelAlign="right"
              size="small"
            >
              <Tabs
                activeKey={createPaymentActiveTab}
                onChange={setCreatePaymentActiveTab}
                style={{ padding: '0 16px' }}
                tabBarStyle={{ marginBottom: 0 }}
                tabBarExtraContent={
                  <Space style={{ paddingRight: 4 }}>
                    <Button size="small" onClick={() => { setCreatePaymentTabOpen(false); setActiveTab('search'); }}>Cancel</Button>
                    <Button size="small">Save and Create Another</Button>
                    <Button size="small" type="primary" style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}>Save and Close</Button>
                  </Space>
                }
                items={[
                  {
                    key: 'paymentDetails',
                    label: 'Payment Details',
                    children: (
                      <div style={{ padding: '12px 0' }}>
                        <Row gutter={32}>
                          <Col span={12}>
                            <Form.Item
                              label={<><span style={{ color: REDWOOD.primary }}>*</span> Business Unit</>}
                              name="businessUnit"
                              rules={[{ required: true, message: 'Required' }]}
                            >
                              <Select
                                placeholder="Select Business Unit"
                                allowClear
                                showSearch
                                loading={businessUnitsListLoading}
                                optionFilterProp="children"
                                notFoundContent={businessUnitsListLoading ? 'Loading…' : 'No business units found'}
                                onChange={(value) => {
                                  const bu = businessUnitsList.find(b => b.name === value);
                                  setSelectedBuLegalEntityName(bu?.legalEntityName || '');
                                  setSelectedBankAccount(null);
                                  setSupplierTotalBalance(null);
                                  setInvoicesToPay([]);
                                  createPaymentForm.setFieldsValue({ disbursementBankAccount: undefined, payee: undefined, supplierNumber: undefined });
                                }}
                                onClear={() => {
                                  setSelectedBuLegalEntityName('');
                                  setSelectedBankAccount(null);
                                  setSupplierTotalBalance(null);
                                  setInvoicesToPay([]);
                                  createPaymentForm.setFieldsValue({ disbursementBankAccount: undefined, payee: undefined, supplierNumber: undefined });
                                }}
                              >
                                {businessUnitsList.map(bu => (
                                  <Option key={bu.id} value={bu.name}>{bu.name}</Option>
                                ))}
                              </Select>
                            </Form.Item>
                            <Form.Item
                              label={<><span style={{ color: REDWOOD.primary }}>*</span> Supplier or Party</>}
                              name="payee"
                              rules={[{ required: true, message: 'Required' }]}
                            >
                              <Input
                                placeholder="Search and select supplier"
                                readOnly
                                disabled={!selectedBuLegalEntityName}
                                suffix={
                                  <SearchOutlined
                                    style={{ color: selectedBuLegalEntityName ? REDWOOD.info : '#ccc', cursor: selectedBuLegalEntityName ? 'pointer' : 'default', fontSize: 14 }}
                                    onClick={() => selectedBuLegalEntityName && openSupplierModal('create')}
                                  />
                                }
                                onClick={() => selectedBuLegalEntityName && openSupplierModal('create')}
                                style={{ cursor: selectedBuLegalEntityName ? 'pointer' : 'not-allowed' }}
                              />
                            </Form.Item>
                            <Form.Item label="Supplier Number" name="supplierNumber">
                              <Input readOnly style={{ background: '#f5f5f5', color: '#555' }} placeholder="Auto-filled" />
                            </Form.Item>
                            <Form.Item
                              label={<><span style={{ color: REDWOOD.primary }}>*</span> Supplier Site</>}
                              name="payeeSite"
                              rules={[{ required: true, message: 'Required' }]}
                            >
                              <Select placeholder="Select Supplier Site" allowClear disabled={!selectedBuLegalEntityName}>
                                <Option value="MAIN">Main</Option>
                                <Option value="HQ">Headquarters</Option>
                              </Select>
                            </Form.Item>
                            <Form.Item label="Address" name="supplierAddress">
                              <Input.TextArea
                                rows={2}
                                readOnly
                                placeholder=""
                                style={{ background: '#f5f5f5', resize: 'none', color: '#555' }}
                              />
                            </Form.Item>
                            <Form.Item
                              label={<><span style={{ color: REDWOOD.primary }}>*</span> Payment Date</>}
                              name="paymentDate"
                              rules={[{ required: true, message: 'Required' }]}
                            >
                              <DatePicker disabled={!selectedBuLegalEntityName} style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
                            </Form.Item>
                            <Form.Item
                              label={<><span style={{ color: REDWOOD.primary }}>*</span> Type</>}
                              name="paymentType"
                              initialValue="QUICK"
                              rules={[{ required: true, message: 'Required' }]}
                            >
                              <Select disabled={!selectedBuLegalEntityName} style={{ width: 130 }}>
                                <Option value="QUICK">Quick</Option>
                                <Option value="STANDARD">Standard</Option>
                                <Option value="MANUAL">Manual</Option>
                                <Option value="REFUND">Refund</Option>
                              </Select>
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item
                              label={<><span style={{ color: REDWOOD.primary }}>*</span> Disbursement Bank Account</>}
                              name="disbursementBankAccount"
                              rules={[{ required: true, message: 'Required' }]}
                              extra={selectedBuLegalEntityName && filteredBankAccounts.length === 0 && !bankAccountsLoading
                                ? <span style={{ color: REDWOOD.warning, fontSize: 12 }}>No bank accounts found for {selectedBuLegalEntityName}</span>
                                : null}
                            >
                              <Select
                                placeholder={selectedBuLegalEntityName ? 'Select Bank Account' : 'Select Business Unit first'}
                                allowClear
                                showSearch
                                disabled={!selectedBuLegalEntityName}
                                loading={bankAccountsLoading}
                                optionFilterProp="children"
                                notFoundContent={bankAccountsLoading ? 'Loading…' : 'No bank accounts found'}
                                onChange={(value) => {
                                  const acct = filteredBankAccounts.find(a => a.bankAccountName === value) || null;
                                  setSelectedBankAccount(acct);
                                }}
                                onClear={() => setSelectedBankAccount(null)}
                              >
                                {filteredBankAccounts.map((acct, idx) => (
                                  <Option key={idx} value={acct.bankAccountName}>
                                    {acct.bankAccountName}
                                  </Option>
                                ))}
                              </Select>
                            </Form.Item>
                            <Form.Item
                              label={<><span style={{ color: REDWOOD.primary }}>*</span> Payment Currency</>}
                              name="paymentCurrency"
                              initialValue="AED"
                              rules={[{ required: true, message: 'Required' }]}
                            >
                              <Select showSearch optionFilterProp="label" placeholder="Select Currency" disabled={!selectedBuLegalEntityName}>
                                <Option value="AED" label="AED - UAE Dirham">AED – UAE Dirham</Option>
                                <Option value="USD" label="USD - US Dollar">USD – US Dollar</Option>
                                <Option value="EUR" label="EUR - Euro">EUR – Euro</Option>
                                <Option value="GBP" label="GBP - British Pound">GBP – British Pound</Option>
                                <Option value="SAR" label="SAR - Saudi Riyal">SAR – Saudi Riyal</Option>
                                <Option value="KWD" label="KWD - Kuwaiti Dinar">KWD – Kuwaiti Dinar</Option>
                                <Option value="BHD" label="BHD - Bahraini Dinar">BHD – Bahraini Dinar</Option>
                                <Option value="QAR" label="QAR - Qatari Riyal">QAR – Qatari Riyal</Option>
                                <Option value="OMR" label="OMR - Omani Rial">OMR – Omani Rial</Option>
                                <Option value="EGP" label="EGP - Egyptian Pound">EGP – Egyptian Pound</Option>
                                <Option value="INR" label="INR - Indian Rupee">INR – Indian Rupee</Option>
                                <Option value="PKR" label="PKR - Pakistani Rupee">PKR – Pakistani Rupee</Option>
                                <Option value="JPY" label="JPY - Japanese Yen">JPY – Japanese Yen</Option>
                                <Option value="CNY" label="CNY - Chinese Yuan">CNY – Chinese Yuan</Option>
                                <Option value="CAD" label="CAD - Canadian Dollar">CAD – Canadian Dollar</Option>
                                <Option value="AUD" label="AUD - Australian Dollar">AUD – Australian Dollar</Option>
                                <Option value="CHF" label="CHF - Swiss Franc">CHF – Swiss Franc</Option>
                                <Option value="SGD" label="SGD - Singapore Dollar">SGD – Singapore Dollar</Option>
                                <Option value="HKD" label="HKD - Hong Kong Dollar">HKD – Hong Kong Dollar</Option>
                                <Option value="TRY" label="TRY - Turkish Lira">TRY – Turkish Lira</Option>
                              </Select>
                            </Form.Item>
                            <Form.Item
                              label={<><span style={{ color: REDWOOD.primary }}>*</span> Payment Method</>}
                              name="paymentMethod"
                              rules={[{ required: true, message: 'Required' }]}
                            >
                              <Select placeholder="Select Payment Method" disabled={!selectedBuLegalEntityName}>
                                <Option value="CHECK">Check</Option>
                                <Option value="EFT">Electronic Funds Transfer</Option>
                                <Option value="WIRE">Wire Transfer</Option>
                                <Option value="CASH">Cash</Option>
                              </Select>
                            </Form.Item>
                            <Form.Item label="Payment Document" name="paymentDocument">
                              <Select placeholder="Select Payment Document" allowClear disabled={!selectedBuLegalEntityName} />
                            </Form.Item>
                            <Form.Item label="Paper Document Number" name="paperDocumentNumber">
                              <Input disabled={!selectedBuLegalEntityName} style={{ background: '#f5f5f5' }} />
                            </Form.Item>
                            <Form.Item label="Attachments">
                              <Space size={4}>
                                <Text style={{ color: '#666', fontSize: 13 }}>None</Text>
                                <Button
                                  size="small"
                                  type="text"
                                  icon={<PlusOutlined />}
                                  disabled={!selectedBuLegalEntityName}
                                  style={{ color: selectedBuLegalEntityName ? REDWOOD.info : '#ccc', padding: '0 4px', height: 22 }}
                                />
                              </Space>
                            </Form.Item>
                            <Form.Item label="Description" name="paymentDescription">
                              <Input disabled={!selectedBuLegalEntityName} />
                            </Form.Item>
                          </Col>
                        </Row>
                        {/* Stats row */}
                        <Row gutter={0} style={{ borderTop: `1px solid ${REDWOOD.neutral200}`, marginTop: 8, paddingTop: 8, background: '#fafafa', borderRadius: '0 0 6px 6px' }}>
                          {/* Supplier Due Balance */}
                          <Col span={6} style={{ textAlign: 'center', padding: '6px 8px', borderRight: `1px solid ${REDWOOD.neutral200}` }}>
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Supplier Due Balance</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: REDWOOD.neutral800 }}>
                              {supplierBalanceLoading
                                ? <span style={{ fontSize: 12, color: '#aaa' }}>Loading…</span>
                                : supplierTotalBalance !== null
                                  ? supplierTotalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                  : <span style={{ fontSize: 12, color: '#ccc' }}>—</span>}
                            </div>
                          </Col>
                          {/* Selected Invoices */}
                          <Col span={6} style={{ textAlign: 'center', padding: '6px 8px', borderRight: `1px solid ${REDWOOD.neutral200}` }}>
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Selected Invoices</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: REDWOOD.neutral800 }}>{invoicesToPay.length}</div>
                          </Col>
                          {/* Applied Amount */}
                          <Col span={6} style={{ textAlign: 'center', padding: '6px 8px', borderRight: `1px solid ${REDWOOD.neutral200}` }}>
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Applied Amount</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: REDWOOD.neutral800 }}>
                              {totalAppliedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </Col>
                          {/* Balance After Application */}
                          <Col span={6} style={{ textAlign: 'center', padding: '6px 8px' }}>
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Balance After Application</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: balanceAfterApplication !== null && balanceAfterApplication < 0 ? REDWOOD.warning : REDWOOD.neutral800 }}>
                              {supplierBalanceLoading
                                ? <span style={{ fontSize: 12, color: '#aaa' }}>Loading…</span>
                                : balanceAfterApplication !== null
                                  ? balanceAfterApplication.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                  : <span style={{ fontSize: 12, color: '#ccc' }}>—</span>}
                            </div>
                          </Col>
                        </Row>
                      </div>
                    ),
                  },
                  {
                    key: 'bankDetails',
                    label: 'Bank Details',
                    children: (
                      <div style={{ padding: '12px 0' }}>
                        <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, color: '#666', marginTop: 0 }}>Disbursement Bank Account</Divider>
                        {selectedBankAccount ? (
                          <Row gutter={32}>
                            <Col span={12}>
                              <Form.Item label="Bank Account Name">
                                <Input readOnly value={selectedBankAccount.bankAccountName} style={{ background: '#f5f5f5', color: '#333' }} />
                              </Form.Item>
                              <Form.Item label="Bank Account Number">
                                <Input readOnly value={selectedBankAccount.bankAccountNumber} style={{ background: '#f5f5f5', color: '#333' }} />
                              </Form.Item>
                              <Form.Item label="Currency">
                                <Input readOnly value={selectedBankAccount.currencyCode} style={{ background: '#f5f5f5', color: '#333' }} />
                              </Form.Item>
                              <Form.Item label="Bank Number">
                                <Input readOnly value={selectedBankAccount.bankNumber} style={{ background: '#f5f5f5', color: '#333' }} />
                              </Form.Item>
                              <Form.Item label="Branch Number">
                                <Input readOnly value={selectedBankAccount.branchNumber} style={{ background: '#f5f5f5', color: '#333' }} />
                              </Form.Item>
                            </Col>
                            <Col span={12}>
                              <Form.Item label="Cash Account Combination">
                                <Input readOnly value={selectedBankAccount.cashAccountCombination} style={{ background: '#f5f5f5', color: '#333' }} />
                              </Form.Item>
                              <Form.Item label="Cash Clearing Account Combination">
                                <Input readOnly value={selectedBankAccount.cashClearingAccountCombination} style={{ background: '#f5f5f5', color: '#333' }} />
                              </Form.Item>
                            </Col>
                          </Row>
                        ) : (
                          <div style={{ padding: '8px 0 16px', color: '#aaa', fontSize: 12 }}>
                            Select a Disbursement Bank Account in Payment Details to view bank information here.
                          </div>
                        )}

                        <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, color: '#666' }}>Remittance</Divider>
                        <Row gutter={32}>
                          <Col span={12}>
                            <Form.Item label="Payment Process Profile" name="paymentProcessProfile">
                              <Select placeholder="Select Profile" allowClear disabled={!selectedBuLegalEntityName} />
                            </Form.Item>
                            <Form.Item label="Remit-to Account" name="remitToAccount">
                              <Select placeholder="Select Remit-to Account" allowClear disabled={!selectedBuLegalEntityName} />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item label="Remit-to Bank Name" name="remitToBankName">
                              <Input readOnly style={{ background: '#f5f5f5', color: '#555' }} placeholder="—" />
                            </Form.Item>
                            <Form.Item label="Remit-to Branch Name" name="remitToBranchName">
                              <Input readOnly style={{ background: '#f5f5f5', color: '#555' }} placeholder="—" />
                            </Form.Item>
                          </Col>
                        </Row>
                      </div>
                    ),
                  },
                  {
                    key: 'advanced',
                    label: 'Advanced',
                    children: (
                      <div style={{ padding: '12px 0' }}>

                        {/* ── Options ── */}
                        <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, color: '#666', marginTop: 0 }}>Options</Divider>
                        <Row gutter={32}>
                          <Col span={12}>
                            <Form.Item name="accrueToLedger" valuePropName="checked">
                              <Checkbox>Account and post to ledger</Checkbox>
                            </Form.Item>
                            <Form.Item name="printNow" valuePropName="checked">
                              <Checkbox>Print now</Checkbox>
                            </Form.Item>
                            <Form.Item label="Printer" name="printer">
                              <Select placeholder="Select Printer" allowClear disabled>
                                <Option value="PDF_PRINTER">PDF Printer</Option>
                                <Option value="NETWORK_PRINTER">Network Printer</Option>
                              </Select>
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item label="Document Category" name="documentCategory">
                              <Select placeholder="Select Document Category" allowClear>
                                <Option value="ELECTRONIC">Electronic Payments</Option>
                                <Option value="MANUAL">Manual Payments</Option>
                                <Option value="WIRE">Wire Transfers</Option>
                              </Select>
                            </Form.Item>
                            <Form.Item label="Document Sequence" name="documentSequence">
                              <Input readOnly style={{ background: '#f5f5f5', color: '#555' }} placeholder="—" />
                            </Form.Item>
                            <Form.Item label="Voucher Number" name="voucherNumber">
                              <Input readOnly style={{ background: '#f5f5f5', color: '#555' }} placeholder="—" />
                            </Form.Item>
                          </Col>
                        </Row>

                        {/* ── Conversion ── */}
                        <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, color: '#666' }}>Conversion</Divider>
                        <Row gutter={32}>
                          <Col span={12}>
                            <Form.Item
                              label={<><span style={{ color: REDWOOD.primary }}>*</span> Conversion Rate Type</>}
                              name="conversionRateType"
                              initialValue="CORPORATE"
                              rules={[{ required: true, message: 'Required' }]}
                            >
                              <Select>
                                <Option value="CORPORATE">Corporate</Option>
                                <Option value="SPOT">Spot</Option>
                                <Option value="USER">User</Option>
                                <Option value="FIXED">Fixed</Option>
                              </Select>
                            </Form.Item>
                            <Form.Item label="Conversion Date" name="conversionDate">
                              <Input readOnly style={{ background: '#f5f5f5', color: '#555' }} placeholder="—" />
                            </Form.Item>
                            <Form.Item label="Conversion Rate" name="conversionRate">
                              <Input readOnly style={{ background: '#f5f5f5', color: '#555', textAlign: 'right' }} placeholder="—" />
                            </Form.Item>
                            <Form.Item label="Accounted Amount" name="accountedAmount">
                              <Input readOnly style={{ background: '#f5f5f5', color: '#555', textAlign: 'right' }} placeholder="—" />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item label="Cross-Currency Rate Type" name="crossCurrencyRateType" initialValue="CORPORATE">
                              <Select allowClear>
                                <Option value="CORPORATE">Corporate</Option>
                                <Option value="SPOT">Spot</Option>
                                <Option value="USER">User</Option>
                                <Option value="FIXED">Fixed</Option>
                              </Select>
                            </Form.Item>
                          </Col>
                        </Row>

                        {/* ── Bills Payable ── */}
                        <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, color: '#666' }}>Bills Payable</Divider>
                        <Row gutter={32}>
                          <Col span={12}>
                            <Form.Item label="Bills Payable" name="billsPayable">
                              <Input readOnly style={{ background: '#f5f5f5', color: '#555' }} defaultValue="No" placeholder="No" />
                            </Form.Item>
                            <Form.Item label="Maturity Conversion Rate Type" name="maturityConversionRateType">
                              <Select placeholder="Select Rate Type" allowClear disabled>
                                <Option value="CORPORATE">Corporate</Option>
                                <Option value="SPOT">Spot</Option>
                                <Option value="USER">User</Option>
                              </Select>
                            </Form.Item>
                            <Form.Item label="Maturity Conversion Date" name="maturityConversionDate">
                              <Input readOnly style={{ background: '#f5f5f5', color: '#555' }} placeholder="—" />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item label="Maturity Date" name="maturityDate">
                              <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" />
                            </Form.Item>
                            <Form.Item label="Maturity Conversion Rate" name="maturityConversionRate">
                              <Input readOnly style={{ background: '#f5f5f5', color: '#555', textAlign: 'right' }} placeholder="—" />
                            </Form.Item>
                            <Form.Item label="Matured Amount" name="maturedAmount">
                              <Input readOnly style={{ background: '#f5f5f5', color: '#555', textAlign: 'right' }} placeholder="—" />
                            </Form.Item>
                          </Col>
                        </Row>

                      </div>
                    ),
                  },
                  {
                    key: 'additionalInfo',
                    label: 'Additional Information',
                    children: (
                      <div style={{ padding: '12px 0' }}>
                        <Row gutter={32}>
                          <Col span={12}>
                            <Form.Item label="Payment Purpose" name="paymentPurpose">
                              <Input placeholder="Enter payment purpose" />
                            </Form.Item>
                            <Form.Item label="Reference Info" name="referenceInfo">
                              <Input placeholder="Enter reference information" />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item label="Notes" name="notes">
                              <Input.TextArea rows={4} placeholder="Enter any additional notes..." />
                            </Form.Item>
                          </Col>
                        </Row>
                      </div>
                    ),
                  },
                ]}
              />
            </Form>
          </Card>

          {/* Invoices to Pay */}
          <Card
            style={{ borderRadius: 8, border: `1px solid ${REDWOOD.neutral200}` }}
            styles={{ body: { padding: 0 } }}
          >
            <div style={{
              padding: '8px 16px',
              borderBottom: `1px solid ${REDWOOD.neutral200}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: REDWOOD.neutral100,
              borderRadius: '8px 8px 0 0',
            }}>
              <Space>
                <FileTextOutlined style={{ color: REDWOOD.info }} />
                <Text strong style={{ fontSize: 13 }}>Invoices to Pay</Text>
              </Space>
              <Space>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    const supplierNum = createPaymentForm.getFieldValue('supplierNumber');
                    if (!supplierNum) { message.warning('Please select a supplier first'); return; }
                    fetchAvailableInvoices(supplierNum);
                    setAddInvoicesModalVisible(true);
                  }}
                >Add Invoices</Button>
                <Button size="small" icon={<ReloadOutlined />}>Refresh</Button>
              </Space>
            </div>
            <Table
              size="small"
              style={{ padding: 0 }}
              dataSource={invoicesToPay}
              pagination={false}
              locale={{ emptyText: 'Select a supplier and click Add Invoices to add unpaid invoices' }}
              summary={() => invoicesToPay.length === 0 ? null : (
                <Table.Summary.Row style={{ background: '#f0f2f5', fontWeight: 600 }}>
                  <Table.Summary.Cell index={0} colSpan={4} align="right">
                    <span style={{ fontSize: 12, color: '#555' }}>Totals</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <span style={{ fontSize: 12 }}>
                      {invoicesToPay.reduce((s, i) => s + (i.amountDue || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <span style={{ fontSize: 12, color: REDWOOD.primary }}>
                      {totalAppliedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <span style={{ fontSize: 12 }}>
                      {invoicesToPay.reduce((s, i) => s + (i.discountAmount || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} />
                  <Table.Summary.Cell index={5} />
                </Table.Summary.Row>
              )}
              columns={[
                {
                  title: 'Invoice Number',
                  dataIndex: 'invoiceNumber',
                  key: 'invoiceNumber',
                  width: 150,
                  render: (text: string) => <a style={{ color: REDWOOD.info }}>{text}</a>,
                },
                {
                  title: 'Invoice Date',
                  dataIndex: 'invoiceDate',
                  key: 'invoiceDate',
                  width: 110,
                },
                {
                  title: 'Description',
                  dataIndex: 'description',
                  key: 'description',
                  ellipsis: true,
                },
                {
                  title: 'Invoice Amount',
                  dataIndex: 'invoiceAmount',
                  key: 'invoiceAmount',
                  width: 130,
                  align: 'right' as const,
                  render: (val: number) => val?.toLocaleString('en-US', { minimumFractionDigits: 2 }),
                },
                {
                  title: 'Amount Due',
                  dataIndex: 'amountDue',
                  key: 'amountDue',
                  width: 120,
                  align: 'right' as const,
                  render: (val: number) => val?.toLocaleString('en-US', { minimumFractionDigits: 2 }),
                },
                {
                  title: 'Apply Amount',
                  dataIndex: 'applyAmount',
                  key: 'applyAmount',
                  width: 140,
                  align: 'right' as const,
                  render: (val: number, record: PaymentInvoice) => (
                    <Input
                      size="small"
                      type="number"
                      defaultValue={val.toFixed(2)}
                      style={{ textAlign: 'right', width: 120 }}
                      onBlur={(e) => {
                        const newVal = parseFloat(e.target.value) || 0;
                        setInvoicesToPay(prev => prev.map(i => i.key === record.key ? { ...i, applyAmount: newVal } : i));
                      }}
                    />
                  ),
                },
                {
                  title: 'Discount Amount',
                  dataIndex: 'discountAmount',
                  key: 'discountAmount',
                  width: 140,
                  align: 'right' as const,
                  render: (val: number, record: PaymentInvoice) => (
                    <Input
                      size="small"
                      type="number"
                      defaultValue={(val || 0).toFixed(2)}
                      style={{ textAlign: 'right', width: 120 }}
                      onBlur={(e) => {
                        const newVal = parseFloat(e.target.value) || 0;
                        setInvoicesToPay(prev => prev.map(i => i.key === record.key ? { ...i, discountAmount: newVal } : i));
                      }}
                    />
                  ),
                },
                {
                  title: 'Due Date',
                  dataIndex: 'dueDate',
                  key: 'dueDate',
                  width: 110,
                },
                {
                  title: '',
                  key: 'remove',
                  width: 40,
                  render: (_: any, record: PaymentInvoice) => (
                    <Button
                      type="link"
                      size="small"
                      danger
                      icon={<CloseCircleOutlined />}
                      onClick={() => setInvoicesToPay(prev => prev.filter(i => i.key !== record.key))}
                    />
                  ),
                },
              ]}
            />
          </Card>

        </div>
      ),
    }] : []),

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
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ background: REDWOOD.success }}
              onClick={() => {
                setCreatePaymentTabOpen(true);
                setCreatePaymentActiveTab('paymentDetails');
                createPaymentForm.resetFields();
                setActiveTab('create-payment');
              }}
            >
              Create Payment
            </Button>
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

        {/* Add Invoices Modal */}
        <Modal
          title={
            <Space>
              <FileTextOutlined style={{ color: REDWOOD.info }} />
              <span>Select Invoices to Pay</span>
            </Space>
          }
          open={addInvoicesModalVisible}
          onCancel={() => { setAddInvoicesModalVisible(false); setSelectedInvoiceKeys([]); }}
          width={1000}
          footer={[
            <Button key="cancel" onClick={() => { setAddInvoicesModalVisible(false); setSelectedInvoiceKeys([]); }}>
              Cancel
            </Button>,
            <Button
              key="add"
              type="primary"
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              disabled={selectedInvoiceKeys.length === 0}
              onClick={() => {
                const selected = availableInvoices.filter(inv => selectedInvoiceKeys.includes(inv.key));
                setInvoicesToPay(prev => [...prev, ...selected]);
                setAddInvoicesModalVisible(false);
                setSelectedInvoiceKeys([]);
              }}
            >
              Add Selected ({selectedInvoiceKeys.length})
            </Button>,
          ]}
          styles={{ body: { padding: '12px 24px' } }}
        >
          <Table
            size="small"
            loading={availableInvoicesLoading}
            dataSource={availableInvoices}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            locale={{ emptyText: availableInvoicesLoading ? 'Loading...' : 'No unpaid invoices found for this supplier' }}
            rowSelection={{
              type: 'checkbox',
              selectedRowKeys: selectedInvoiceKeys,
              onChange: (keys) => setSelectedInvoiceKeys(keys),
            }}
            columns={[
              {
                title: 'Invoice Number',
                dataIndex: 'invoiceNumber',
                key: 'invoiceNumber',
                width: 140,
                render: (text: string) => <span style={{ color: REDWOOD.info, fontWeight: 500 }}>{text}</span>,
              },
              {
                title: 'Invoice Date',
                dataIndex: 'invoiceDate',
                key: 'invoiceDate',
                width: 110,
              },
              {
                title: 'Supplier Site',
                dataIndex: 'supplierSite',
                key: 'supplierSite',
                width: 120,
              },
              {
                title: 'Description',
                dataIndex: 'description',
                key: 'description',
                ellipsis: true,
              },
              {
                title: 'Currency',
                dataIndex: 'currency',
                key: 'currency',
                width: 80,
                render: (val: string) => <Tag>{val}</Tag>,
              },
              {
                title: 'Invoice Amount',
                dataIndex: 'invoiceAmount',
                key: 'invoiceAmount',
                width: 130,
                align: 'right' as const,
                render: (val: number) => val?.toLocaleString('en-US', { minimumFractionDigits: 2 }),
              },
              {
                title: 'Amount Due',
                dataIndex: 'amountDue',
                key: 'amountDue',
                width: 120,
                align: 'right' as const,
                render: (val: number) => (
                  <span style={{ color: val > 0 ? '#cf1322' : '#389e0d', fontWeight: 500 }}>
                    {val?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                ),
              },
              {
                title: 'Due Date',
                dataIndex: 'dueDate',
                key: 'dueDate',
                width: 110,
              },
            ]}
            summary={() => availableInvoices.length === 0 ? null : (
              <Table.Summary.Row style={{ background: '#f0f2f5', fontWeight: 600 }}>
                <Table.Summary.Cell index={0} colSpan={5} align="right">
                  <span style={{ fontSize: 12, color: '#555' }}>Totals</span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <span style={{ fontSize: 12 }}>
                    {availableInvoices.reduce((s, i) => s + (i.invoiceAmount || 0), 0)
                      .toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <span style={{ fontSize: 12, color: '#cf1322', fontWeight: 600 }}>
                    {availableInvoices.reduce((s, i) => s + (i.amountDue || 0), 0)
                      .toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} />
              </Table.Summary.Row>
            )}
          />
        </Modal>

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
      <Autopilot module="ap" />
      <FloatingMenu />
    </Layout>
  );
};

export default ManagePayments;
