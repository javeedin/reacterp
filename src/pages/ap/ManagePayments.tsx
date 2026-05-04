import React, { useState, useMemo, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
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
  Spin,
  Alert,
  Drawer,
  Descriptions,
  Popover,
  InputNumber,
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
  StopOutlined,
  PlayCircleOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  AccountBookOutlined,
  FormOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import FloatingMenu from '../../components/FloatingMenu';
import Autopilot from '../../components/Autopilot';
import AccountSelector from '../../components/AccountSelector';
import PaymentDetail from './PaymentDetail';
import { ORACLE_FUSION_CONFIG, APEX_DB_CONFIG } from '../../config/api.config';
import {
  checkAccountingExists,
  createAccounting,
  postToLedger,
  fetchLedgerByBusinessUnit,
  buildApPaymentSlaPayloads,
  getAccounting,
  getLinesByHeaderId,
  getAccountingLinesBySourceId,
  checkGLJournalExists,
  derivePeriodName,
} from '../../services/sla.service';
import type { SlaGetResult, SlaCreatePayload } from '../../services/sla.service';
import { eventTypeToRef5, postSlaToGL } from '../../services/glPosting.service';
import { useNotifications } from '../../context/NotificationContext';

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
  currency?: string;
  checkDate?: string;
  legalEntityName?: string;
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
  description: string;
  cashAccountCombination: string;
  cashAccountDescription: string;
  cashClearingAccountCombination: string;
  cashClearingAccountDescription: string;
  pdcAccountCombination: string;
  legalEntityName: string;
}

// Invoice record used in the "Invoices to Pay" grid within Create Payment
interface PaymentInvoice {
  key: string;
  invoiceId: number;
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
  liabilityDistribution?: string;
  installmentNumber?: number | null;
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

// Convert any date representation (display "1 Mar 2024" OR ISO "2024-03-01") → "YYYY-MM-DD" for Oracle APIs
const toApiDate = (s: string): string => {
  if (!s) return new Date().toISOString().split('T')[0];
  // Already YYYY-MM-DD or ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Display format "D MMM YYYY" e.g. "1 Mar 2024"
  const MONTHS: Record<string, string> = {
    Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
    Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
  };
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (m) {
    const mo = MONTHS[m[2]];
    if (mo) return `${m[3]}-${mo}-${m[1].padStart(2, '0')}`;
  }
  // Fallback: let the JS engine parse it and extract local date parts
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  return new Date().toISOString().split('T')[0];
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
  const watchedConversionRate = Form.useWatch('conversionRate', createPaymentForm);
  const [voidForm] = Form.useForm();
  const { checkPdcMaturity } = useNotifications();
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

  // ── Clear Payment state ─────────────────────────────────────────────────
  const [clearModalOpen, setClearModalOpen]             = useState(false);
  const [clearTargetPayment, setClearTargetPayment]     = useState<PaymentRecord | null>(null);
  const [clearStepsOpen, setClearStepsOpen]             = useState(false);
  const [clearExistingAcctLoading, setClearExistingAcctLoading] = useState(false);
  const [clearExistingAcctData, setClearExistingAcctData]       = useState<SlaGetResult | null>(null);
  type ClearStepKey = 'sla' | 'gl_create' | 'gl_post' | 'sla_stamp' | 'patch';
  const CLEAR_STEP_KEYS: ClearStepKey[] = ['sla','gl_create','gl_post','sla_stamp','patch'];
  type ClearStepState = { status: 'idle'|'running'|'success'|'error'; response?: any; error?: string };
  const initClearSteps = (): Record<ClearStepKey, ClearStepState> => ({
    sla: { status: 'idle' }, gl_create: { status: 'idle' }, gl_post: { status: 'idle' },
    sla_stamp: { status: 'idle' }, patch: { status: 'idle' },
  });
  const [clearStepMap, setClearStepMap] = useState<Record<ClearStepKey, ClearStepState>>(initClearSteps());
  const clearCtxRef = useRef<{
    clearDate: string; paymentNum: string; buName: string; ccy: string; exRate: number;
    clearPeriod: string; ledgerId: number; ledgerName: string;
    clearLines: any[]; slaHeaderId: number | null;
    glBatchId: number | null; glHeaderId: number | null; batchName: string;
    pdcAccount: string; cashAccount: string;
  }>({ clearDate: '', paymentNum: '', buName: '', ccy: 'AED', exRate: 1, clearPeriod: '',
    ledgerId: 300000003259529, ledgerName: 'BCL DIFC',
    clearLines: [], slaHeaderId: null, glBatchId: null, glHeaderId: null, batchName: '',
    pdcAccount: '', cashAccount: '' });
  const setClearStep = (key: ClearStepKey, upd: Partial<ClearStepState>) =>
    setClearStepMap(prev => ({ ...prev, [key]: { ...prev[key], ...upd } }));
  // ────────────────────────────────────────────────────────────────────────

  // ── Void Payment state ───────────────────────────────────────────────────
  const [voidModalOpen, setVoidModalOpen]           = useState(false);
  const [voidApiDrawerOpen, setVoidApiDrawerOpen]   = useState(false);
  const [voidTargetPayment, setVoidTargetPayment]   = useState<PaymentRecord | null>(null);
  const [voidRelatedInvoices, setVoidRelatedInvoices]       = useState<any[]>([]);
  const [voidRelatedLoading, setVoidRelatedLoading]         = useState(false);

  // ── Manual step-by-step void state ─────────────────────────────────────
  type VoidStepStatus = 'idle' | 'running' | 'success' | 'error';
  interface VoidStepState { status: VoidStepStatus; response?: any; error?: string; running?: boolean }
  const VOID_STEP_KEYS = ['eligibility','void','sla','gl_create','gl_post','sla_stamp'] as const;
  type VoidStepKey = typeof VOID_STEP_KEYS[number];
  const initVoidSteps = (): Record<VoidStepKey, VoidStepState> => ({
    eligibility: { status: 'idle' }, void: { status: 'idle' }, sla: { status: 'idle' },
    gl_create:   { status: 'idle' }, gl_post: { status: 'idle' }, sla_stamp: { status: 'idle' },
  });
  const [voidStepMap, setVoidStepMap] = useState<Record<VoidStepKey, VoidStepState>>(initVoidSteps());
  const voidCtxRef = useRef<{
    voidDate: string; paymentNum: string; buName: string; ccy: string; exRate: number;
    voidPeriod: string; ledgerId: number; ledgerName: string;
    reverseLines: any[]; slaHeaderId: number | null;
    glBatchId: number | null; glHeaderId: number | null; batchName: string;
  }>({ voidDate: '', paymentNum: '', buName: '', ccy: 'AED', exRate: 1, voidPeriod: '',
    ledgerId: 300000003259529, ledgerName: 'BCL DIFC',
    reverseLines: [], slaHeaderId: null, glBatchId: null, glHeaderId: null, batchName: '' });
  const setVoidStep = (key: VoidStepKey, upd: Partial<VoidStepState>) =>
    setVoidStepMap(prev => ({ ...prev, [key]: { ...prev[key], ...upd } }));
  // ────────────────────────────────────────────────────────────────────────

  // Create Payment tab state
  const [createPaymentTabOpen, setCreatePaymentTabOpen] = useState(false);
  const [createPaymentActiveTab, setCreatePaymentActiveTab] = useState('paymentDetails');
  const [createPaymentCurrency, setCreatePaymentCurrency] = useState<string>('AED');

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

  // Payment date filter state
  const [paymentDateMode, setPaymentDateMode]   = useState<string>('');
  const [paymentDateRange, setPaymentDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [onlyPdc, setOnlyPdc] = useState(false);

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
  // Local overrides so user can set missing account combinations without leaving the form
  const [bankAcctCashOverride,    setBankAcctCashOverride]    = useState<string>('');
  const [bankAcctPdcOverride,     setBankAcctPdcOverride]     = useState<string>('');
  const [bankAcctSelectorField,   setBankAcctSelectorField]   = useState<'cash' | 'pdc' | null>(null);

  // Payment accounting state
  const [acctPayment, setAcctPayment] = useState<PaymentRecord | null>(null);
  const [acctLoading, setAcctLoading] = useState(false);
  const [acctResults, setAcctResults] = useState<{ invoiceNumber: string; status: string; headerId?: number; error?: string }[]>([]);
  const [acctModalOpen, setAcctModalOpen] = useState(false);

  // View / Post Accounting modal state
  const [viewAcctRecord, setViewAcctRecord] = useState<PaymentRecord | null>(null);
  const [viewAcctOpen, setViewAcctOpen] = useState(false);
  const [viewAcctLoading, setViewAcctLoading] = useState(false);
  const [viewAcctData, setViewAcctData] = useState<SlaGetResult | null>(null);
  // All accounting events (grouped by headerId) for the viewed payment
  const [viewAcctAllEvents, setViewAcctAllEvents] = useState<{ headerId: number; eventTypeCode: string; accountingStatus: string; accountingDate: string; lines: any[] }[]>([]);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [postModalHeadId, setPostModalHeadId] = useState<number | null>(null);
  const [postGLPayload, setPostGLPayload] = useState<any>(null);
  const [postGLFetchingLines, setPostGLFetchingLines] = useState(false);
  const [postGLResult, setPostGLResult] = useState<{ success: boolean; data?: any; error?: string } | null>(null);
  const [postGLLinesUrl, setPostGLLinesUrl] = useState('');
  const [postGLRawCount, setPostGLRawCount] = useState(0);
  const [slaActionLoading, setSlaActionLoading] = useState(false);

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
        description: item.description || '',
        cashAccountCombination: item.cash_account_combination || '',
        cashAccountDescription: item.cash_account_description || '',
        cashClearingAccountCombination: item.cash_clearing_account_combination || '',
        cashClearingAccountDescription: item.cash_clearing_account_description || '',
        pdcAccountCombination: item.pdc_account_combination || '',
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

  // Pre-load Business Units and Bank Accounts on mount
  useEffect(() => {
    fetchBusinessUnits();
    fetchBankAccounts();
    checkPdcMaturity(); // background PDC maturity check on AP page load
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
  const [addInvoicesApiUrl, setAddInvoicesApiUrl] = useState('');
  const [invoicesToPay, setInvoicesToPay] = useState<PaymentInvoice[]>([]);
  const [supplierTotalBalance, setSupplierTotalBalance] = useState<number | null>(null);
  const [supplierBalanceLoading, setSupplierBalanceLoading] = useState(false);

  const totalAppliedAmount = invoicesToPay.reduce((sum, i) => sum + (i.applyAmount || 0), 0);
  const balanceAfterApplication = supplierTotalBalance !== null ? supplierTotalBalance - totalAppliedAmount : null;

  // ── API panel ───────────────────────────────────────────────────────────────
  const [apiPanelOpen, setApiPanelOpen] = useState(false);
  const [apiTestLoading, setApiTestLoading] = useState<Record<number, boolean>>({});
  const [apiTestResults, setApiTestResults] = useState<Record<number, { status: 'success' | 'error'; data: any }>>({});
  const [apiStep1CheckId, setApiStep1CheckId] = useState<number | null>(null);

  // Convert form date value (dayjs | string | null) → 'YYYY-MM-DD'
  const formDateStr = (val: any): string => {
    if (!val) return new Date().toISOString().slice(0, 10);
    if (dayjs.isDayjs(val)) return val.format('YYYY-MM-DD');
    return toApiDate(String(val));
  };

  // Build live payload from current form values — recomputed every render so it
  // always reflects what the user has typed (no tick counter needed).
  const livePaymentPayload = (() => {
    const v = createPaymentForm.getFieldsValue();
    const payDate = formDateStr(v.paymentDate);
    const sysdate = new Date().toISOString();
    return {
      CheckId: null, PaymentId: null,
      PaymentReference: null,
      PaperDocumentNumber: v.paperDocumentNumber || null,
      PaymentNumber: v.paperDocumentNumber || null,
      VoucherNumber: v.voucherNumber || null,
      PaymentAmount: totalAppliedAmount,
      PaymentBaseAmount: totalAppliedAmount,
      WithheldAmount: null, BankChargeAmount: null,
      PaymentDate: payDate, AccountingDate: payDate,
      MaturityDate: v.maturityDate ? formDateStr(v.maturityDate) : null,
      AnticipatedValueDate: null,
      StopDate: null, VoidDate: null, VoidAccountingDate: null,
      ConversionDate: v.conversionDate ? formDateStr(v.conversionDate) : payDate,
      ClearingDate: null, ClearingConversionDate: null,
      ClearingValueDate: null, MaturityConversionDate: null,
      CreationDate: sysdate, LastUpdateDate: sysdate,
      PaymentDescription: v.paymentDescription || null,
      PaymentStatus: v.maturityDate ? 'Issued' : 'Negotiable',
      PaymentType: v.paymentType || 'Quick',
      PaymentMode: null,
      PaymentFunction: 'Supplier Payments',
      PaymentCurrency: v.paymentCurrency || null,
      PaymentBaseCurrency: v.paymentCurrency || null,
      ConversionRate: v.conversionRate || null,
      ConversionRateType: v.conversionRateType || null,
      CrossCurrencyRateType: 'Corporate',
      ClearingAmount: null, ClearingLedgerAmount: null,
      ClearingConversionRate: null, ClearingConversionRateType: null,
      MaturityConversionRateType: null, MaturityConversionRate: null,
      AccountingStatus: null, ReconciledFlag: 'false',
      SeparateRemittanceAdviceCreated: null, IbyPaymentStatus: null,
      LegalEntity: selectedBuLegalEntityName || null,
      BusinessUnit: v.businessUnit || null,
      ProcurementBU: v.businessUnit || null,
      Payee: v.payee || null,
      PartyId: null,
      PayeeSite: v.payeeSite || null,
      SupplierNumber: v.supplierNumber || null,
      EmployeeAddress: null, ThirdPartySupplier: null, ThirdPartyAddressName: null,
      ExternalBankAccountId: null,
      RemitToAccountNumber: v.remitToAccount || null,
      DisbursementBankAccountNumber: selectedBankAccount?.bankAccountNumber || null,
      DisbursementBankAccountName: v.disbursementBankAccount || null,
      FundingCardAccount: null, DigitalPaymentAccount: null,
      PaymentMethodCode: v.paymentMethod || null,
      PaymentMethod: v.paymentMethod || null,
      PaymentDocument: v.paymentDocument || null,
      PaymentProcessProfileCode: null,
      PaymentProcessProfile: v.paymentProcessProfile || null,
      DocumentCategory: v.documentCategory || null,
      DocumentSequence: null,
      AddressLine1: null, AddressLine2: null, AddressLine3: null, AddressLine4: null,
      City: null, County: null, Province: null, State: null,
      Country: 'AE', Zip: null,
      StopReason: null, StopReference: null,
      CreatedBy: null, LastUpdatedBy: null, LastUpdateLogin: null,
    };
  })();

  const executeApiStep = async (step: number, url: string, body: object) => {
    setApiTestLoading(prev => ({ ...prev, [step]: true }));
    setApiTestResults(prev => { const n = { ...prev }; delete n[step]; return n; });
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      const isErr = data?.status === 'error' || !res.ok;
      if (step === 1 && data?.checkId != null) setApiStep1CheckId(data.checkId);
      setApiTestResults(prev => ({ ...prev, [step]: { status: isErr ? 'error' : 'success', data } }));
    } catch (err: any) {
      setApiTestResults(prev => ({ ...prev, [step]: { status: 'error', data: { message: err?.message ?? 'Network error' } } }));
    } finally {
      setApiTestLoading(prev => ({ ...prev, [step]: false }));
    }
  };

  // ── Confirm Payment state ──────────────────────────────────────────────────
  const [confirmPaymentOpen, setConfirmPaymentOpen]         = useState(false);
  const [createAccountingChecked, setCreateAccountingChecked] = useState(true);
  const [paymentConfirmed, setPaymentConfirmed]             = useState(false);
  const [confirmedPaymentNumber, setConfirmedPaymentNumber] = useState<string>('');
  const [confirmedCheckId, setConfirmedCheckId]             = useState<number | null>(null);
  const [savePaymentLoading, setSavePaymentLoading]         = useState(false);

  type ConfirmStepKey = 'payment' | 'installments' | 'link' | 'sla' | 'gl';
  interface ConfirmStep { label: string; status: 'idle' | 'running' | 'success' | 'error'; detail?: string }
  const [confirmSteps, setConfirmSteps] = useState<Record<ConfirmStepKey, ConfirmStep>>({
    payment:      { label: 'Create Payment',               status: 'idle' },
    installments: { label: 'Update Invoice Installments',  status: 'idle' },
    link:         { label: 'Link Invoices to Payment',     status: 'idle' },
    sla:          { label: 'Create SLA Accounting',        status: 'idle' },
    gl:           { label: 'Post to GL',                   status: 'idle' },
  });
  const setConfStep = (key: ConfirmStepKey, upd: Partial<ConfirmStep>) =>
    setConfirmSteps(prev => ({ ...prev, [key]: { ...prev[key], ...upd } }));

  const handleConfirmPaymentClick = async () => {
    try { await createPaymentForm.validateFields(); } catch { message.warning('Please fill in all required fields'); return; }
    if (invoicesToPay.length === 0) { message.warning('Please add at least one invoice before confirming the payment'); return; }
    const fv = createPaymentForm.getFieldsValue();
    const effectiveCash = bankAcctCashOverride || selectedBankAccount?.cashAccountCombination || '';
    const effectivePdc  = bankAcctPdcOverride  || selectedBankAccount?.pdcAccountCombination  || '';
    const hasMaturity   = !!fv.maturityDate;
    if (!effectiveCash) { message.error('Cash Account Combination is missing. Please set it in the Bank Details tab before confirming.'); return; }
    if (hasMaturity && !effectivePdc) { message.error('PDC Account Combination is missing. Please set it in the Bank Details tab before confirming.'); return; }
    setConfirmSteps({
      payment:      { label: 'Create Payment',              status: 'idle' },
      installments: { label: 'Update Invoice Installments', status: 'idle' },
      link:         { label: 'Link Invoices to Payment',    status: 'idle' },
      sla:          { label: 'Create SLA Accounting',       status: 'idle' },
      gl:           { label: 'Post to GL',                  status: 'idle' },
    });
    setConfirmPaymentOpen(true);
  };

  const handleConfirmPaymentSubmit = async () => {
    setSavePaymentLoading(true);
    const v = createPaymentForm.getFieldsValue();
    const buName = v.businessUnit || '';

    try {
      // ── Step 1: POST /ap/payments — create payment header ──────────────────
      setConfStep('payment', { status: 'running' });
      const step1Payload = livePaymentPayload;
      const res1 = await fetch(APEX_PAYMENTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(step1Payload),
      });
      const text1 = await res1.text();
      const data1 = (() => { try { return JSON.parse(text1); } catch { return { raw: text1 }; } })();

      if (data1?.status === 'error' || !res1.ok) {
        setConfStep('payment', { status: 'error', detail: data1?.message || `HTTP ${res1.status}` });
        throw new Error(data1?.message || data1?.error || `Step 1 HTTP ${res1.status}`);
      }

      const checkId: number | null = data1?.checkId ?? null;
      const paymentNumber: string = data1?.paymentNumber ?? (checkId ? String(checkId) : 'Unknown');
      if (checkId) setConfirmedCheckId(checkId);
      setConfStep('payment', { status: 'success', detail: `Payment #${paymentNumber} created` });

      // ── Step 2: PUT /ap/createinvoice/installments — reduce UNPAID_AMOUNT ──
      setConfStep('installments', { status: 'running' });
      const instBaseUrl = `${APEX_DB_CONFIG.baseUrl}/ap/createinvoice/installments`;
      const instErrors: string[] = [];
      let totalInstUpdated = 0;

      for (const inv of invoicesToPay) {
        try {
          if (inv.installmentNumber) {
            // Installment ID is known (from available-installments endpoint) — PUT directly
            const newUnpaid = Math.max(0, inv.amountDue - inv.applyAmount);
            const newStatus = newUnpaid <= 0 ? 'Fully Paid' : 'Partially Paid';
            const putRes = await fetch(instBaseUrl, {
              method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ InvoiceId: inv.invoiceId, InstallmentId: inv.installmentNumber, PaymentStatus: newStatus, AmountRemaining: newUnpaid }),
            });
            const d2 = await putRes.json().catch(() => ({}));
            if (d2?.status === 'error' || !putRes.ok) instErrors.push(`${inv.invoiceNumber} inst ${inv.installmentNumber}: ${d2?.message || `HTTP ${putRes.status}`}`);
            else totalInstUpdated++;
          } else {
            // Fallback: fetch installments and apply in order
            const getRes = await fetch(`${instBaseUrl}?P_INVOICE_ID=${inv.invoiceId}`, { headers: { Accept: 'application/json' } });
            if (!getRes.ok) throw new Error(`HTTP ${getRes.status}`);
            const instData = await getRes.json();
            const allInst: any[] = instData.items || instData.installments || (Array.isArray(instData) ? instData : []);
            const pending = allInst.filter(i => (i.amount_remaining ?? i.unpaid_amount ?? 1) > 0);
            let remainingApply = inv.applyAmount;
            for (const inst of pending) {
              if (remainingApply <= 0) break;
              const instId = inst.installment_id?.toString() || inst.key;
              const instUnpaid = Number(inst.amount_remaining ?? inst.unpaid_amount ?? inst.UNPAID_AMOUNT ?? 0);
              const amountApplied = Math.min(remainingApply, instUnpaid);
              const newUnpaid = Math.max(0, instUnpaid - amountApplied);
              const newStatus = newUnpaid <= 0 ? 'Fully Paid' : 'Partially Paid';
              remainingApply -= amountApplied;
              const putRes = await fetch(instBaseUrl, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ InvoiceId: inv.invoiceId, InstallmentId: instId, PaymentStatus: newStatus, AmountRemaining: newUnpaid }),
              });
              const d2 = await putRes.json().catch(() => ({}));
              if (d2?.status === 'error' || !putRes.ok) instErrors.push(`${inv.invoiceNumber} inst ${instId}: ${d2?.message || `HTTP ${putRes.status}`}`);
              else totalInstUpdated++;
            }
          }
        } catch (e: any) { instErrors.push(`${inv.invoiceNumber}: ${e?.message ?? 'Network error'}`); }
      }
      setConfStep('installments', { status: instErrors.length > 0 ? 'error' : 'success', detail: instErrors.length > 0 ? instErrors[0] : `${totalInstUpdated} installment(s) updated` });

      // ── Step 3: POST /ap/payments/related-invoices — link invoices ──────────
      setConfStep('link', { status: 'running' });
      const relatedUrl = `${APEX_DB_CONFIG.baseUrl}/ap/payments/related-invoices`;
      const relatedErrors: string[] = [];
      const v2 = createPaymentForm.getFieldsValue();
      for (const inv of invoicesToPay) {
        const body3 = {
          InvoicePaymentId: null, CheckId: checkId, InvoiceId: inv.invoiceId,
          InvoiceBusinessUnit: buName, InvoiceNumber: inv.invoiceNumber, InstallmentNumber: inv.installmentNumber ?? null,
          AmountPaidPaymentCurrency: inv.applyAmount, AmountPaidInvoiceCurrency: inv.applyAmount,
          InvoicePaymentAmount: inv.applyAmount, InvoiceAmount: inv.invoiceAmount,
          InvoiceBaseAmount: inv.invoiceAmount, PaymentBaseAmount: inv.applyAmount,
          DiscountLost: null, DiscountTaken: inv.discountAmount || null,
          InvoiceCurrency: inv.currency || v2.paymentCurrency || 'AED',
          CrossCurrencyRate: v2.conversionRate || null, InvoicePaymentStatus: 'Negotiable',
          CreatedBy: null, LastUpdatedBy: null, LastUpdateLogin: null,
        };
        try {
          const res3 = await fetch(relatedUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body3) });
          const d3 = await res3.json().catch(() => ({}));
          if (d3?.status === 'error' || !res3.ok) relatedErrors.push(`${inv.invoiceNumber}: ${d3?.message || `HTTP ${res3.status}`}`);
        } catch (e: any) { relatedErrors.push(`${inv.invoiceNumber}: ${e?.message ?? 'Network error'}`); }
      }
      setConfStep('link', { status: relatedErrors.length > 0 ? 'error' : 'success', detail: relatedErrors.length > 0 ? relatedErrors[0] : `${invoicesToPay.length} invoice(s) linked` });

      // Lock the form once payment is saved
      setPaymentConfirmed(true);
      setConfirmedPaymentNumber(paymentNumber);

      // ── Step 4 & 5: Create Accounting + Post to GL ───────────────────────────
      if (createAccountingChecked && checkId) {
        try {
          setConfStep('sla', { status: 'running' });
          // Fetch related invoices to get liabilityDistribution
          const relRes = await fetch(`${APEX_DB_CONFIG.baseUrl}/ap/payments/${checkId}/related-invoices`, { headers: { Accept: 'application/json' } });
          const relData = relRes.ok ? await relRes.json() : { items: [] };
          const relItems: any[] = relData.items || [];

          const bank = bankAccounts.find(b => b.bankAccountName === v2.disbursementBankAccount || b.bankAccountName === v2.paymentDocument);
          const hasMaturityDate = !!v2.maturityDate;
          const cashAcct = bankAcctCashOverride || bank?.cashAccountCombination || '';
          const pdcAcct  = bankAcctPdcOverride  || bank?.pdcAccountCombination  || '';
          const crAcct   = hasMaturityDate ? pdcAcct : cashAcct;
          const crClass  = hasMaturityDate ? 'PDC' : 'CASH';
          const ledger = await fetchLedgerByBusinessUnit(buName);
          const ccy    = v2.paymentCurrency || 'AED';
          const exRate = (v2.conversionRate && v2.conversionRate > 0) ? Number(v2.conversionRate) : 1;
          const payDate = v2.paymentDate ? (v2.paymentDate.format ? v2.paymentDate.format('YYYY-MM-DD') : String(v2.paymentDate).substring(0, 10)) : new Date().toISOString().substring(0, 10);
          const paperDocNum = v2.paperDocumentNumber || paymentNumber;

          const appliedInvoices = invoicesToPay.map(inv => {
            const rel = relItems.find((r: any) => r.InvoiceId === inv.invoiceId || r.InvoiceNumber === inv.invoiceNumber);
            return {
              invoiceNumber: inv.invoiceNumber,
              invoiceId: inv.invoiceId,
              amountPaid: inv.applyAmount,
              liabilityDistribution: rel?.LiabilityDistribution || inv.liabilityDistribution || '',
            };
          });

          if (!appliedInvoices.length) throw new Error('No invoices to account for');
          setConfStep('sla', { status: 'running', detail: `Creating SLA entry (${appliedInvoices.length} DR + 1 CR)…` });

          const totalAmount = appliedInvoices.reduce((s, inv) => s + inv.amountPaid, 0);
          const singlePayload: SlaCreatePayload = {
            header: {
              moduleName:       'AP',
              sourceTable:      'AP_PAYMENTS',
              sourceId:         checkId,
              sourceNumber:     paperDocNum,
              sourceType:       'PAYMENT',
              eventTypeCode:    'AP_PAYMENT_CREATED',
              eventDate:        payDate,
              accountingDate:   payDate,
              periodName:       derivePeriodName(new Date(payDate)),
              ledgerId:         ledger?.ledgerId   ?? 300000003259529,
              ledgerName:       ledger?.ledgerName ?? 'BCL DIFC',
              currencyCode:     ccy,
              ledgerCurrency:   'AED',
              exchangeRate:     exRate,
              exchangeRateType: 'Corporate',
              businessUnit:     buName,
              legalEntity:      ledger?.legalEntity,
              description:      `AP Payment ${paperDocNum}`,
              createdBy:        'SYSTEM',
            },
            lines: [
              ...appliedInvoices.map((inv, idx) => ({
                lineNumber:         idx + 1,
                lineType:           'DR' as const,
                accountingClass:    'LIABILITY',
                accountCombination: inv.liabilityDistribution,
                enteredDr:          inv.amountPaid,
                enteredCr:          0,
                accountedDr:        Math.round(inv.amountPaid * exRate * 100) / 100,
                accountedCr:        0,
                currencyCode:       ccy,
                exchangeRate:       exRate,
                description:        `AP Liability – ${paperDocNum} / ${inv.invoiceNumber} / ${v2.payee || ''}`,
                sourceLineNumber:   idx + 1,
              })),
              {
                lineNumber:         appliedInvoices.length + 1,
                lineType:           'CR' as const,
                accountingClass:    crClass,
                accountCombination: crAcct,
                enteredDr:          0,
                enteredCr:          totalAmount,
                accountedDr:        0,
                accountedCr:        Math.round(totalAmount * exRate * 100) / 100,
                currencyCode:       ccy,
                exchangeRate:       exRate,
                description:        `${crClass} – Payment ${paperDocNum} / Invoices: ${appliedInvoices.map(i => i.invoiceNumber).join(', ')}`,
                sourceLineNumber:   appliedInvoices.length + 1,
              },
            ],
          };

          const slaResult = await createAccounting(singlePayload);
          if ((slaResult as any).status === 'error' || !(slaResult.headerId > 0)) throw new Error((slaResult as any).message ?? 'headerId missing');
          const lastSlaHeaderId = slaResult.headerId;
          setConfStep('sla', { status: 'success', detail: `SLA header #${lastSlaHeaderId} created (${appliedInvoices.length} DR + 1 CR)` });

          // Post to GL
          setConfStep('gl', { status: 'running' });
          const glResult = await postSlaToGL({
            slaHeaderId:    lastSlaHeaderId!,
            sourceNumber:   paperDocNum,
            sourceId:       checkId,
            eventTypeCode:  'AP_PAYMENT_CREATED',
            periodName:     derivePeriodName(new Date(payDate)),
            ledgerName:     ledger?.ledgerName ?? 'BCL DIFC',
            ledgerId:       ledger?.ledgerId   ?? 300000003259529,
            currency:       ccy,
            accountingDate: payDate,
            legalEntity:    ledger?.legalEntity ?? buName,
            businessUnit:   buName,
            conversionRate: exRate,
            jeCategory:     'AP_PAYMENT_CREATED',
            lines: singlePayload.lines.map(l => ({
              lineType:           (l.enteredDr ?? 0) > 0 ? 'DR' as const : 'CR' as const,
              enteredDr:          l.enteredDr ?? null,
              enteredCr:          l.enteredCr ?? null,
              accountedDr:        l.accountedDr ?? null,
              accountedCr:        l.accountedCr ?? null,
              description:        l.description ?? '',
              currencyCode:       l.currencyCode ?? ccy,
              accountingDate:     payDate,
              accountCombination: l.accountCombination ?? '',
              accountingClass:    l.accountingClass ?? null,
              legalEntity:        ledger?.legalEntity ?? null,
            })),
          });
          setConfStep('gl', { status: glResult.success ? 'success' : 'error', detail: glResult.success ? `GL Batch: ${glResult.batchName}` : glResult.error });
        } catch (accErr: any) {
          setConfStep('sla', { status: 'error', detail: accErr.message });
          setConfStep('gl',  { status: 'error', detail: 'Skipped due to SLA error' });
        }
      }

      message.success(`Payment #${paymentNumber} confirmed successfully`);
    } catch (err: any) {
      message.error(`Failed to confirm payment: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setSavePaymentLoading(false);
    }
  };

  const fetchAvailableInvoices = async (supplierNumber: string) => {
    setAvailableInvoicesLoading(true);
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/ap/payments/available-installments?supplier_number=${encodeURIComponent(supplierNumber)}`;
      setAddInvoicesApiUrl(url);
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const already = new Set(invoicesToPay.map(i => i.key));
      const items = (data.items || [])
        .map((item: any, index: number) => {
          const unpaid = Number(item.unpaid_amount ?? 0);
          return {
            key: item.installment_id?.toString() || index.toString(),
            invoiceId: item.invoice_id || 0,
            invoiceNumber: item.invoice_number || '',
            invoiceDate: item.invoice_date ? item.invoice_date.substring(0, 10) : '',
            description: item.description || '',
            invoiceAmount: Number(item.installment_amount ?? item.invoice_amount ?? 0),
            amountDue: unpaid,
            applyAmount: unpaid,
            discountAmount: 0,
            dueDate: item.due_date ? item.due_date.substring(0, 10) : '',
            currency: item.invoice_currency || 'AED',
            supplierSite: item.supplier_site || '',
            liabilityDistribution: item.liability_distribution || '',
            installmentNumber: item.installment_id != null ? Number(item.installment_id) : null,
          };
        })
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
        name: '1. Search Payments (List)',
        method: 'GET',
        url: APEX_PAYMENTS_URL,
        params: 'payment_number=&payment_status=&payee=&supplier_number=&business_unit=&date_from=&date_to=&limit=100&offset=0',
        description: 'Fetches paginated payments from ORDS/APEX database with optional filters. Returns JSON with count, limit, offset, items[].',
      },
      {
        name: '2. Get Payment by Check ID',
        method: 'GET',
        url: `${APEX_PAYMENTS_URL}/{check_id}`,
        params: '',
        description: 'Fetches a single payment by Check ID. Example: /ap/payments/300000085294470',
      },
      {
        name: '3. Save Payments (Bulk)',
        method: 'POST',
        url: APEX_PAYMENTS_URL,
        params: 'Body: { "items": [...] }',
        description: 'Saves payments to APEX database. Accepts single object, array, or { items: [...] } format.',
      },
      {
        name: '4. Get Related Invoices',
        method: 'GET',
        url: `${APEX_DB_CONFIG.baseUrl}/ap/payments/{check_id}/related-invoices`,
        params: '',
        description: 'Fetches invoices related to a payment (used for void accounting reversal and SLA line building).',
      },
      {
        name: '5. Check Void Eligibility (Void Step 1)',
        method: 'GET',
        url: `${APEX_DB_CONFIG.baseUrl}/ap/payments/{check_id}/void-eligibility`,
        params: '',
        description: 'Checks whether a payment can be voided. Returns { eligible, reason }.',
      },
      {
        name: '6. Void Payment (Void Step 2)',
        method: 'PUT',
        url: `${APEX_DB_CONFIG.baseUrl}/ap/payments/void`,
        params: 'Body: { "checkId": 123, "voidDate": "YYYY-MM-DD", "voidReason": "..." }',
        description: 'Voids a payment in the system. Returns paperDocumentNumber and voidDate used in subsequent SLA/GL steps.',
      },
      {
        name: '7. Create SLA Reversal Accounting (Void Step 3)',
        method: 'POST',
        url: `${APEX_DB_CONFIG.baseUrl}/sla/accounting/create`,
        params: 'Body: { header: { sourceTable, eventTypeCode, ... }, lines: [...] }',
        description: 'Creates subledger accounting reversal entries for the voided payment (DR Cash Clearing / CR AP Liability).',
      },
      {
        name: '8. Get SLA Accounting Lines',
        method: 'GET',
        url: `${APEX_DB_CONFIG.baseUrl}/sla/accounting`,
        params: 'sourceTable=AP_PAYMENTS&sourceId={check_id}',
        description: 'Fetches existing SLA accounting entries for a payment. Used in View Accounting modal.',
      },
      {
        name: '9. GL Duplicate Check',
        method: 'GET',
        url: `${APEX_DB_CONFIG.baseUrl}/gl/journals/check`,
        params: 'reference1={sourceNumber}&reference2={sourceId}&reference5={ref5}',
        description: 'Checks whether a GL journal already exists for a given source number/reference. Prevents duplicate posting.',
      },
      {
        name: '10. Create GL Journal (Void Step 4)',
        method: 'POST',
        url: `${APEX_DB_CONFIG.baseUrl}/journals/create`,
        params: 'Body: { batch: {...}, header: {...}, lines: [...] }',
        description: 'Creates a new GL journal batch + header + lines for the void reversal accounting entries.',
      },
      {
        name: '11. Post GL Journal (Void Step 5)',
        method: 'PUT',
        url: `${APEX_DB_CONFIG.baseUrl}/gl/journals/{batch_id}/post`,
        params: 'Body: {}',
        description: 'Posts (validates period + finalizes) a GL journal batch. Called after journal creation to complete GL posting.',
      },
      {
        name: '12. Stamp SLA as Posted (Void Step 6)',
        method: 'POST',
        url: `${APEX_DB_CONFIG.baseUrl}/sla/accounting/post`,
        params: 'Body: { headerId, glBatchId, glBatchName, glHeaderId, postedBy }',
        description: 'Updates the SLA header status to POSTED and links it to the GL batch/header IDs.',
      },
      {
        name: '13. Bank Accounts',
        method: 'GET',
        url: APEX_BANK_ACCOUNTS_URL,
        params: 'bank_account_id=&bank_account_num=',
        description: 'Fetches bank accounts including cashClearingAccountCombination used for SLA/GL cash clearing lines.',
      },
      {
        name: '14. Ledger by Business Unit',
        method: 'GET',
        url: `${APEX_DB_CONFIG.baseUrl}/ledgers`,
        params: 'businessUnit={bu_name}',
        description: 'Fetches ledger details (ledgerId, ledgerName, currency) for a business unit. Used to populate GL journal metadata.',
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

  // Resolve payment date mode → { dateFrom, dateTo } as 'YYYY-MM-DD' strings
  const resolvePaymentDateRange = (): { dateFrom: string | null; dateTo: string | null } => {
    const today = dayjs().format('YYYY-MM-DD');
    const pastDays = (n: number) => dayjs().subtract(n, 'day').format('YYYY-MM-DD');
    switch (paymentDateMode) {
      case 'today':  return { dateFrom: today, dateTo: today };
      case 'past7':  return { dateFrom: pastDays(7),  dateTo: today };
      case 'past10': return { dateFrom: pastDays(10), dateTo: today };
      case 'past15': return { dateFrom: pastDays(15), dateTo: today };
      case 'past30': return { dateFrom: pastDays(30), dateTo: today };
      case 'past60': return { dateFrom: pastDays(60), dateTo: today };
      case 'custom': return paymentDateRange
        ? { dateFrom: paymentDateRange[0].format('YYYY-MM-DD'), dateTo: paymentDateRange[1].format('YYYY-MM-DD') }
        : { dateFrom: null, dateTo: null };
      default: return { dateFrom: null, dateTo: null };
    }
  };

  // Search payments from API
  const handleSearch = async (values: any = {}) => {
    setLoading(true);
    const source = useApex ? 'APEX/ORDS' : 'Fusion';
    debugLog('INFO', `══════════════════════════════════════════════════`);
    debugLog('INFO', `Starting payment search [Source: ${source}]`);
    debugLog('INFO', `Search filters: ${JSON.stringify(values, null, 2)}`);

    const { dateFrom, dateTo } = resolvePaymentDateRange();

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
        if (dateFrom) params.append('payment_date_from', dateFrom);
        if (dateTo)   params.append('payment_date_to',   dateTo);
        if (onlyPdc)  params.append('only_pdc', 'Y');

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
        let mappedPayments = items.map(mapper);
        // Client-side date filtering (guards against APEX endpoints that don't support date params yet)
        if (dateFrom || dateTo) {
          mappedPayments = mappedPayments.filter(p => {
            const d = toApiDate(p.paymentDate || '');
            if (dateFrom && d < dateFrom) return false;
            if (dateTo   && d > dateTo)   return false;
            return true;
          });
        }
        // Client-side PDC filter — keep only payments with a maturity date set
        if (onlyPdc) {
          mappedPayments = mappedPayments.filter(p => !!p.maturityDate && p.maturityDate !== '-');
        }
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
    setPaymentDateMode('');
    setPaymentDateRange(null);
    setOnlyPdc(false);
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

  // Action menu items (top toolbar — works on first selected row)
  const actionsMenuItems: MenuProps['items'] = [
    { key: 'edit', label: 'Edit', icon: <EditOutlined /> },
    { type: 'divider' },
    { key: 'void', label: 'Void Payment', icon: <StopOutlined />, danger: true },
    { key: 'stop', label: 'Stop Payment', danger: true },
  ];

  const handleActionsMenuClick = ({ key }: { key: string }) => {
    if (key === 'void') {
      const firstSelected = payments.find(p => p.key === selectedRowKeys[0]);
      if (!firstSelected) { message.warning('Select a payment row first'); return; }
      openVoidModal(firstSelected);
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
      title: 'Actions',
      key: 'rowActions',
      width: 90,
      fixed: 'right',
      render: (_, record: PaymentRecord) => {
        const isVoided   = record.paymentStatus === 'Voided';
        const isCleared  = !!(record.clearingDate || record.clearingAmount || record.reconciled);
        const canVoid    = !isVoided && !isCleared;
        return (
          <Space size={2}>
            <Tooltip title={isVoided ? 'Already voided' : isCleared ? 'Cleared — cannot void' : 'Void Payment'}>
              <Button
                size="small"
                danger={canVoid}
                disabled={!canVoid}
                icon={<StopOutlined />}
                style={{ fontSize: 11, padding: '0 6px' }}
                onClick={() => openVoidModal(record)}
              />
            </Tooltip>
            {record.accountingStatus !== 'Accounted' && (
              <Tooltip title="Create Accounting">
                <Button
                  type="link"
                  size="small"
                  icon={<AccountBookOutlined />}
                  onClick={() => handleCreateAccounting(record)}
                />
              </Tooltip>
            )}
            <Tooltip title="View / Post Accounting">
              <Button
                type="link"
                size="small"
                icon={<FormOutlined />}
                onClick={() => handleViewAccounting(record)}
              />
            </Tooltip>
            <Tooltip title="View Details">
              <Button
                type="link"
                size="small"
                icon={<FileTextOutlined />}
                onClick={() => openPaymentTab(record)}
              />
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  // ── Void Payment handlers ────────────────────────────────────────────────
  const fetchVoidRelatedInvoices = async (checkId: number) => {
    setVoidRelatedLoading(true);
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/ap/payments/${checkId}/related-invoices`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items = (data.items || []).map((item: any, index: number) => ({
        key:                  item.InvoicePaymentId?.toString() || index.toString(),
        invoiceNumber:        item.InvoiceNumber || '',
        invoiceId:            item.InvoiceId || 0,
        invoiceAmount:        item.InvoiceAmount || 0,
        amountPaid:           item.AmountPaidInvoiceCurrency || item.AmountPaidPaymentCurrency || item.InvoicePaymentAmount || 0,
        invoiceCurrency:      item.InvoiceCurrency || '',
        invoicePaymentStatus: item.InvoicePaymentStatus || '',
        liabilityDistribution: item.LiabilityDistribution || '',
        installmentNumber:    item.InstallmentNumber ?? item.installment_number ?? null,
      }));
      setVoidRelatedInvoices(items);
    } catch {
      setVoidRelatedInvoices([]);
    } finally {
      setVoidRelatedLoading(false);
    }
  };

  const openVoidModal = (record: PaymentRecord) => {
    setVoidTargetPayment(record);
    setVoidStepMap(initVoidSteps());
    setVoidRelatedInvoices([]);
    voidCtxRef.current = { voidDate: '', paymentNum: '', buName: '', ccy: 'AED', exRate: 1,
      voidPeriod: '', ledgerId: 300000003259529, ledgerName: 'BCL DIFC',
      reverseLines: [], slaHeaderId: null, glBatchId: null, glHeaderId: null, batchName: '' };
    voidForm.setFieldsValue({ voidDate: dayjs(), voidReason: '' });
    setVoidModalOpen(true);
    fetchVoidRelatedInvoices(record.checkId);
  };

  // ── Step 1: Check Eligibility ───────────────────────────────────────────
  const runVoidStep_eligibility = async (): Promise<boolean> => {
    if (!voidTargetPayment) return false;
    setVoidStep('eligibility', { status: 'running', response: undefined, error: undefined });
    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/ap/payments/${voidTargetPayment.checkId}/void-eligibility`;
      const res  = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (!data.eligible) {
        setVoidStep('eligibility', { status: 'error', response: data, error: data.errors?.[0] ?? 'Not eligible' });
        return false;
      }
      setVoidStep('eligibility', { status: 'success', response: data });
      return true;
    } catch (e: any) {
      setVoidStep('eligibility', { status: 'error', error: e.message });
      return false;
    }
  };

  // ── Step 2: Void Payment ────────────────────────────────────────────────
  const runVoidStep_void = async (): Promise<boolean> => {
    if (!voidTargetPayment) return false;
    setVoidStep('void', { status: 'running', response: undefined, error: undefined });
    try {
      const values    = voidForm.getFieldsValue();
      const voidDate  = values.voidDate ? values.voidDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
      const paymentNum = String(voidTargetPayment.paymentNumber || voidTargetPayment.checkId);
      const buName    = voidTargetPayment.businessUnit || '';
      const ccy       = voidTargetPayment.paymentCurrency || 'AED';
      const exRate    = (voidTargetPayment.conversionRate && voidTargetPayment.conversionRate > 0) ? voidTargetPayment.conversionRate : 1;
      const voidPeriod = derivePeriodName(new Date(voidDate));
      const ledger    = await fetchLedgerByBusinessUnit(buName);
      voidCtxRef.current = { ...voidCtxRef.current, voidDate, paymentNum, buName, ccy, exRate, voidPeriod,
        ledgerId: ledger?.ledgerId ?? 300000003259529, ledgerName: ledger?.ledgerName ?? 'BCL DIFC' };
      const body = {
        CheckId: voidTargetPayment.checkId, VoidDate: voidDate, VoidedBy: null,
        StopReason: values.voidReason || 'Payment Voided', StopReference: paymentNum,
      };
      const url  = `${APEX_DB_CONFIG.baseUrl}/ap/payments/void`;
      const res  = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.status === 'error' || !res.ok) {
        setVoidStep('void', { status: 'error', response: data, error: data.message ?? `HTTP ${res.status}` });
        return false;
      }
      // Restore invoice installments so voided invoices become available again
      const instBaseUrl = `${APEX_DB_CONFIG.baseUrl}/ap/createinvoice/installments`;
      for (const inv of voidRelatedInvoices) {
        if (!inv.installmentNumber) continue; // only restore if we know exactly which installment was paid
        try {
          const getRes = await fetch(`${instBaseUrl}?P_INVOICE_ID=${inv.invoiceId}`, { headers: { Accept: 'application/json' } });
          if (!getRes.ok) continue;
          const instData = await getRes.json();
          const allInst: any[] = instData.items || instData.installments || (Array.isArray(instData) ? instData : []);
          const targetInst = allInst.find(i => String(i.installment_id) === String(inv.installmentNumber));
          if (!targetInst) continue;
          const curAmt   = Number(targetInst.amount_remaining ?? targetInst.unpaid_amount ?? targetInst.UNPAID_AMOUNT ?? 0);
          const restored = curAmt + Number(inv.amountPaid);
          const instAmt  = Number(targetInst.installment_amount ?? targetInst.gross_amount ?? targetInst.GROSS_AMOUNT ?? inv.invoiceAmount ?? 0);
          const newStatus = instAmt > 0 && restored >= instAmt ? 'Never Paid' : 'Partially Paid';
          await fetch(instBaseUrl, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ InvoiceId: inv.invoiceId, InstallmentId: inv.installmentNumber, PaymentStatus: newStatus, AmountRemaining: restored }),
          });
        } catch { /* non-critical — void itself succeeded */ }
      }
      setVoidStep('void', { status: 'success', response: data });
      return true;
    } catch (e: any) {
      setVoidStep('void', { status: 'error', error: e.message });
      return false;
    }
  };

  // ── Step 3: Create SLA Accounting ──────────────────────────────────────
  const runVoidStep_sla = async (): Promise<boolean> => {
    if (!voidTargetPayment) return false;
    setVoidStep('sla', { status: 'running', response: undefined, error: undefined });
    try {
      const ctx = voidCtxRef.current;
      if (!ctx.voidDate) throw new Error('Run Step 2 (Void Payment) first');
      const bank = bankAccounts.find(b => b.bankAccountName === voidTargetPayment.disbursementBankAccount);
      const cashClearingAcct = bank?.cashClearingAccountCombination || '';
      if (!cashClearingAcct) throw new Error(`No cash clearing account for bank: ${voidTargetPayment.disbursementBankAccount || '(none)'}`);
      if (!voidRelatedInvoices.length) throw new Error('No related invoices — payment may not have linked invoices');
      const totalAmt = voidRelatedInvoices.reduce((s, inv) => s + (Number(inv.amountPaid) || 0), 0);
      const reverseLines: any[] = [
        // Single DR: Cash Clearing for the full payment amount
        {
          lineNumber: 1, lineType: 'DR', accountingClass: 'CASH_CLEARING',
          accountCombination: cashClearingAcct, enteredDr: totalAmt, enteredCr: 0,
          accountedDr: Math.round(totalAmt * ctx.exRate * 100) / 100, accountedCr: 0,
          currencyCode: ctx.ccy, exchangeRate: ctx.exRate, sourceLineNumber: 1,
          description: `Void Cash Clearing – Payment ${ctx.paymentNum} / Invoices: ${voidRelatedInvoices.map(i => i.invoiceNumber).join(', ')}`,
        },
        // One CR per invoice: AP Liability
        ...voidRelatedInvoices.map((inv, idx) => {
          const amt = Number(inv.amountPaid) || 0;
          return {
            lineNumber: idx + 2, lineType: 'CR', accountingClass: 'LIABILITY',
            accountCombination: inv.liabilityDistribution || '', enteredDr: 0, enteredCr: amt,
            accountedDr: 0, accountedCr: Math.round(amt * ctx.exRate * 100) / 100,
            currencyCode: ctx.ccy, exchangeRate: ctx.exRate, sourceLineNumber: idx + 2,
            description: `Void AP Liability – ${ctx.paymentNum} / ${inv.invoiceNumber}`,
          };
        }),
      ];
      voidCtxRef.current.reverseLines = reverseLines;
      const payload: SlaCreatePayload = {
        header: { moduleName: 'AP', sourceTable: 'AP_PAYMENTS', sourceId: voidTargetPayment.checkId,
          sourceNumber: ctx.paymentNum, sourceType: 'PAYMENT', eventTypeCode: 'AP_PAYMENT_VOID',
          eventDate: ctx.voidDate, accountingDate: ctx.voidDate, periodName: ctx.voidPeriod,
          ledgerId: ctx.ledgerId, ledgerName: ctx.ledgerName, currencyCode: ctx.ccy,
          ledgerCurrency: 'AED', exchangeRate: ctx.exRate, exchangeRateType: 'Corporate',
          businessUnit: ctx.buName || undefined, description: `AP Payment Void — ${ctx.paymentNum}`, createdBy: 'SYSTEM' },
        lines: reverseLines,
      };
      const result = await createAccounting(payload);
      if ((result as any).status === 'error' || !(result.headerId > 0)) {
        setVoidStep('sla', { status: 'error', response: result, error: (result as any).message ?? 'headerId missing' });
        return false;
      }
      voidCtxRef.current.slaHeaderId = result.headerId;
      setVoidStep('sla', { status: 'success', response: result });
      return true;
    } catch (e: any) {
      setVoidStep('sla', { status: 'error', error: e.message });
      return false;
    }
  };

  // ── Step 4: Create GL Journal ───────────────────────────────────────────
  const runVoidStep_glCreate = async (): Promise<boolean> => {
    if (!voidTargetPayment) return false;
    setVoidStep('gl_create', { status: 'running', response: undefined, error: undefined });
    try {
      const ctx = voidCtxRef.current;
      if (!ctx.reverseLines.length) throw new Error('Run Step 3 (Create Accounting) first');
      const ref5 = eventTypeToRef5('AP_PAYMENT_VOID');
      const batchName = `${ref5}-${ctx.paymentNum}-${ctx.voidDate.replace(/-/g,'')}-${Date.now().toString().slice(-6)}`;
      voidCtxRef.current.batchName = batchName;
      const totalDr = ctx.reverseLines.reduce((s, l) => s + (l.enteredDr||0), 0);
      const totalCr = ctx.reverseLines.reduce((s, l) => s + (l.enteredCr||0), 0);
      const payload = {
        batch: { batchName, batchDescription: `AP-PAYMENT-VOID – ${ctx.paymentNum}`,
          ledgerName: ctx.ledgerName, ledgerId: ctx.ledgerId, status: 'NEW',
          accountingPeriod: ctx.voidPeriod, controlTotal: totalDr,
          runningTotalDr: totalDr, runningTotalCr: totalCr, batchSource: 'Payables', createdBy: 'SYSTEM' },
        header: { ledgerId: ctx.ledgerId, ledgerName: ctx.ledgerName,
          jeCategory: 'AP_PAYMENT_VOID', jeSource: 'Payables', periodName: ctx.voidPeriod,
          journalName: batchName, description: `AP Payment Void — ${ctx.paymentNum}`,
          currencyCode: ctx.ccy, currencyConversionType: 'User',
          currencyConversionDate: ctx.voidDate, currencyConversionRate: ctx.exRate,
          defaultEffectiveDate: ctx.voidDate, status: 'NEW',
          runningTotalDr: totalDr, runningTotalCr: totalCr, createdBy: 'SYSTEM' },
        lines: ctx.reverseLines.map(l => ({
          enteredDr: l.enteredDr||null, enteredCr: l.enteredCr||null,
          accountedDr: l.accountedDr||null, accountedCr: l.accountedCr||null,
          statAmount: null, description: l.description||'', currencyCode: l.currencyCode||ctx.ccy,
          currencyConversionDate: ctx.voidDate, currencyConversionRate: ctx.exRate,
          userCurrencyConversionType: 'User', accountCombination: l.accountCombination||'',
          chartOfAccountsName: 'Chart of Accounts',
          reference1: ctx.paymentNum, reference2: String(voidTargetPayment.checkId),
          reference3: l.accountingClass||null, reference4: ctx.buName||null,
          reference5: ref5, createdBy: 'SYSTEM',
        })),
      };
      const url  = `${APEX_DB_CONFIG.baseUrl}/journals/create`;
      const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        setVoidStep('gl_create', { status: 'error', response: data, error: data.message ?? `HTTP ${res.status}` });
        return false;
      }
      voidCtxRef.current.glBatchId  = data.jeBatchId  ?? data.batchId  ?? null;
      voidCtxRef.current.glHeaderId = data.jeHeaderId ?? data.headerId ?? null;
      setVoidStep('gl_create', { status: 'success', response: data });
      return true;
    } catch (e: any) {
      setVoidStep('gl_create', { status: 'error', error: e.message });
      return false;
    }
  };

  // ── Step 5: Post GL Journal ─────────────────────────────────────────────
  const runVoidStep_glPost = async (): Promise<boolean> => {
    setVoidStep('gl_post', { status: 'running', response: undefined, error: undefined });
    try {
      const ctx = voidCtxRef.current;
      if (!ctx.glBatchId) throw new Error('Run Step 4 (Create GL Journal) first');
      const url  = `${APEX_DB_CONFIG.baseUrl}/gl/journals/${ctx.glBatchId}/post`;
      const res  = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        setVoidStep('gl_post', { status: 'error', response: data, error: data.error ?? `HTTP ${res.status}` });
        return false;
      }
      setVoidStep('gl_post', { status: 'success', response: data });
      return true;
    } catch (e: any) {
      setVoidStep('gl_post', { status: 'error', error: e.message });
      return false;
    }
  };

  // ── Step 6: Stamp SLA as POSTED ────────────────────────────────────────
  const runVoidStep_stamp = async (): Promise<boolean> => {
    setVoidStep('sla_stamp', { status: 'running', response: undefined, error: undefined });
    try {
      const ctx = voidCtxRef.current;
      if (!ctx.slaHeaderId) throw new Error('Run Step 3 (Create Accounting) first');
      const result = await postToLedger(ctx.slaHeaderId, ctx.glBatchId ?? 0, ctx.batchName, ctx.glHeaderId ?? 0, 'SYSTEM');
      setVoidStep('sla_stamp', { status: 'success', response: result });
      handleSearch();
      message.success('Void complete — accounting reversed and posted to GL');
      return true;
    } catch (e: any) {
      setVoidStep('sla_stamp', { status: 'error', error: e.message });
      return false;
    }
  };

  // ── Auto-run all 6 void steps sequentially ─────────────────────────────
  const runVoidEligibilityApi = runVoidStep_eligibility;

  // ────────────────────────────────────────────────────────────────────────

  // ── Clear Payment handlers ────────────────────────────────────────────────

  const openClearModal = async (record: PaymentRecord) => {
    setClearTargetPayment(record);
    setClearStepMap(initClearSteps());
    setClearStepsOpen(false);
    setClearExistingAcctData(null);
    clearCtxRef.current = { clearDate: '', paymentNum: '', buName: '', ccy: 'AED', exRate: 1,
      clearPeriod: '', ledgerId: 300000003259529, ledgerName: 'BCL DIFC',
      clearLines: [], slaHeaderId: null, glBatchId: null, glHeaderId: null, batchName: '',
      pdcAccount: '', cashAccount: '' };
    setClearModalOpen(true);
    // Load existing accounting entries — also used to verify accounting exists
    setClearExistingAcctLoading(true);
    try {
      const result = await getAccounting('AP_PAYMENTS', record.checkId);
      if (result.headerId) {
        try {
          const linesData = await getLinesByHeaderId(result.headerId);
          const descMap = new Map(linesData.items.map((l: any) => [l.lineId, l.accountDescription]));
          result.lines = result.lines.map(l => ({ ...l, accountDescription: descMap.get(l.lineId) || undefined }));
        } catch { /* non-critical */ }
      }
      setClearExistingAcctData(result);
    } catch { setClearExistingAcctData(null); }
    finally { setClearExistingAcctLoading(false); }
  };

  // Step 1: Create SLA clearing entry (Dr: PDC Acct → Cr: Cash Acct)
  const runClearStep_sla = async (): Promise<boolean> => {
    if (!clearTargetPayment) return false;
    setClearStep('sla', { status: 'running', response: undefined, error: undefined });
    try {
      const today = dayjs().format('YYYY-MM-DD');
      const paymentNum = String(clearTargetPayment.paymentNumber || clearTargetPayment.checkId);
      const buName = clearTargetPayment.businessUnit || '';
      const ccy = clearTargetPayment.paymentCurrency || 'AED';
      const exRate = (clearTargetPayment.conversionRate && clearTargetPayment.conversionRate > 0) ? clearTargetPayment.conversionRate : 1;
      const clearPeriod = derivePeriodName(new Date(today));
      const ledger = await fetchLedgerByBusinessUnit(buName);
      const ledgerId = ledger?.ledgerId ?? 300000003259529;
      const ledgerName = ledger?.ledgerName ?? 'BCL DIFC';

      const bank = bankAccounts.find(b => b.bankAccountName === clearTargetPayment.disbursementBankAccount);
      const pdcAccount = bank?.pdcAccountCombination || '';
      const cashAccount = (bankAcctCashOverride || bank?.cashAccountCombination || '');

      if (!pdcAccount) throw new Error(`No PDC account found for bank: ${clearTargetPayment.disbursementBankAccount || '(none)'}`);
      if (!cashAccount) throw new Error(`No Cash account found for bank: ${clearTargetPayment.disbursementBankAccount || '(none)'}`);

      const amt = clearTargetPayment.paymentAmount;
      const clearLines = [
        {
          lineNumber: 1, lineType: 'DR', accountingClass: 'PDC_CLEARING',
          accountCombination: cashAccount,
          enteredDr: amt, enteredCr: 0,
          accountedDr: Math.round(amt * exRate * 100) / 100, accountedCr: 0,
          currencyCode: ccy, exchangeRate: exRate, sourceLineNumber: 1,
          description: `PDC Clearing — Debit Cash Acct — Payment ${paymentNum}`,
        },
        {
          lineNumber: 2, lineType: 'CR', accountingClass: 'PDC_CLEARING',
          accountCombination: pdcAccount,
          enteredDr: 0, enteredCr: amt,
          accountedDr: 0, accountedCr: Math.round(amt * exRate * 100) / 100,
          currencyCode: ccy, exchangeRate: exRate, sourceLineNumber: 2,
          description: `PDC Clearing — Credit PDC Acct — Payment ${paymentNum}`,
        },
      ];

      clearCtxRef.current = { ...clearCtxRef.current, clearDate: today, paymentNum, buName, ccy, exRate, clearPeriod,
        ledgerId, ledgerName, clearLines, pdcAccount, cashAccount };

      const payload: SlaCreatePayload = {
        header: { moduleName: 'AP', sourceTable: 'AP_PAYMENTS', sourceId: clearTargetPayment.checkId,
          sourceNumber: paymentNum, sourceType: 'PAYMENT', eventTypeCode: 'AP_PDC_CLEARING',
          eventDate: today, accountingDate: today, periodName: clearPeriod,
          ledgerId, ledgerName, currencyCode: ccy, ledgerCurrency: 'AED', exchangeRate: exRate,
          exchangeRateType: 'Corporate', businessUnit: buName || undefined,
          description: `AP PDC Clearing — ${paymentNum}`, createdBy: 'SYSTEM' },
        lines: clearLines,
      };
      const result = await createAccounting(payload);
      if ((result as any).status === 'error' || !(result.headerId > 0)) {
        setClearStep('sla', { status: 'error', response: result, error: (result as any).message ?? 'headerId missing' });
        return false;
      }
      clearCtxRef.current.slaHeaderId = result.headerId;
      setClearStep('sla', { status: 'success', response: result });
      return true;
    } catch (e: any) {
      setClearStep('sla', { status: 'error', error: e.message });
      return false;
    }
  };

  // Step 2: Create GL Journal
  const runClearStep_glCreate = async (): Promise<boolean> => {
    if (!clearTargetPayment) return false;
    setClearStep('gl_create', { status: 'running', response: undefined, error: undefined });
    try {
      const ctx = clearCtxRef.current;
      if (!ctx.clearLines.length) throw new Error('Run Step 1 (Create Accounting) first');
      const ref5 = eventTypeToRef5('AP_PDC_CLEARING');
      const batchName = `${ref5}-${ctx.paymentNum}-${ctx.clearDate.replace(/-/g,'')}-${Date.now().toString().slice(-6)}`;
      clearCtxRef.current.batchName = batchName;
      const totalDr = ctx.clearLines.reduce((s, l) => s + (l.enteredDr||0), 0);
      const totalCr = ctx.clearLines.reduce((s, l) => s + (l.enteredCr||0), 0);
      const payload = {
        batch: { batchName, batchDescription: `AP-PDC-CLEARING – ${ctx.paymentNum}`,
          ledgerName: ctx.ledgerName, ledgerId: ctx.ledgerId, status: 'NEW',
          accountingPeriod: ctx.clearPeriod, controlTotal: totalDr,
          runningTotalDr: totalDr, runningTotalCr: totalCr, batchSource: 'Payables', createdBy: 'SYSTEM' },
        header: { ledgerId: ctx.ledgerId, ledgerName: ctx.ledgerName,
          jeCategory: 'AP_PDC_CLEARING', jeSource: 'Payables', periodName: ctx.clearPeriod,
          journalName: batchName, description: `AP PDC Clearing — ${ctx.paymentNum}`,
          currencyCode: ctx.ccy, currencyConversionType: 'User',
          currencyConversionDate: ctx.clearDate, currencyConversionRate: ctx.exRate,
          defaultEffectiveDate: ctx.clearDate, status: 'NEW',
          runningTotalDr: totalDr, runningTotalCr: totalCr, createdBy: 'SYSTEM' },
        lines: ctx.clearLines.map(l => ({
          enteredDr: l.enteredDr||null, enteredCr: l.enteredCr||null,
          accountedDr: l.accountedDr||null, accountedCr: l.accountedCr||null,
          statAmount: null, description: l.description||'', currencyCode: l.currencyCode||ctx.ccy,
          currencyConversionDate: ctx.clearDate, currencyConversionRate: ctx.exRate,
          userCurrencyConversionType: 'User', accountCombination: l.accountCombination||'',
          chartOfAccountsName: 'Chart of Accounts',
          reference1: ctx.paymentNum, reference2: String(clearTargetPayment.checkId),
          reference3: l.accountingClass||null, reference4: ctx.buName||null,
          reference5: ref5, createdBy: 'SYSTEM',
        })),
      };
      const url = `${APEX_DB_CONFIG.baseUrl}/journals/create`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        setClearStep('gl_create', { status: 'error', response: data, error: data.message ?? `HTTP ${res.status}` });
        return false;
      }
      clearCtxRef.current.glBatchId  = data.jeBatchId  ?? data.batchId  ?? null;
      clearCtxRef.current.glHeaderId = data.jeHeaderId ?? data.headerId ?? null;
      setClearStep('gl_create', { status: 'success', response: data });
      return true;
    } catch (e: any) {
      setClearStep('gl_create', { status: 'error', error: e.message });
      return false;
    }
  };

  // Step 3: Post GL Journal
  const runClearStep_glPost = async (): Promise<boolean> => {
    setClearStep('gl_post', { status: 'running', response: undefined, error: undefined });
    try {
      const ctx = clearCtxRef.current;
      if (!ctx.glBatchId) throw new Error('Run Step 2 (Create GL Journal) first');
      const url = `${APEX_DB_CONFIG.baseUrl}/gl/journals/${ctx.glBatchId}/post`;
      const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        setClearStep('gl_post', { status: 'error', response: data, error: data.error ?? `HTTP ${res.status}` });
        return false;
      }
      setClearStep('gl_post', { status: 'success', response: data });
      return true;
    } catch (e: any) {
      setClearStep('gl_post', { status: 'error', error: e.message });
      return false;
    }
  };

  // Step 4: Stamp SLA as POSTED
  const runClearStep_stamp = async (): Promise<boolean> => {
    setClearStep('sla_stamp', { status: 'running', response: undefined, error: undefined });
    try {
      const ctx = clearCtxRef.current;
      if (!ctx.slaHeaderId) throw new Error('Run Step 1 (Create Accounting) first');
      const result = await postToLedger(ctx.slaHeaderId, ctx.glBatchId ?? 0, ctx.batchName, ctx.glHeaderId ?? 0, 'SYSTEM');
      setClearStep('sla_stamp', { status: 'success', response: result });
      return true;
    } catch (e: any) {
      setClearStep('sla_stamp', { status: 'error', error: e.message });
      return false;
    }
  };

  // Step 5: Patch payment status to Cleared
  const runClearStep_patch = async (): Promise<boolean> => {
    if (!clearTargetPayment) return false;
    setClearStep('patch', { status: 'running', response: undefined, error: undefined });
    try {
      const today = clearCtxRef.current.clearDate || dayjs().format('YYYY-MM-DD');
      const url = `${APEX_PAYMENTS_URL}/${clearTargetPayment.checkId}`;
      const body = { PaymentStatus: 'Cleared', ClearingDate: today };
      const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.status === 'error') {
        setClearStep('patch', { status: 'error', response: data, error: data.message ?? `HTTP ${res.status}` });
        return false;
      }
      setClearStep('patch', { status: 'success', response: data });
      handleSearch();
      message.success(`Payment ${clearCtxRef.current.paymentNum} cleared successfully`);
      return true;
    } catch (e: any) {
      setClearStep('patch', { status: 'error', error: e.message });
      return false;
    }
  };
  // ────────────────────────────────────────────────────────────────────────

  // ── View / Post Accounting handlers ──────────────────────────────────────

  const handleViewAccounting = async (record: PaymentRecord) => {
    setViewAcctRecord(record);
    setViewAcctOpen(true);
    setViewAcctLoading(true);
    setViewAcctData(null);
    setViewAcctAllEvents([]);
    try {
      // Fetch all SLA lines for this specific payment (by checkId) and the primary header in parallel
      const [result, allLinesData] = await Promise.all([
        getAccounting('AP_PAYMENTS', record.checkId),
        getAccountingLinesBySourceId(record.checkId, 'AP_PAYMENTS', 'AP').catch(() => ({ items: [] })),
      ]);
      // Enrich main result lines with account descriptions
      if (result.headerId) {
        try {
          const linesData = await getLinesByHeaderId(result.headerId);
          const descMap = new Map(linesData.items.map(l => [l.lineId, l.accountDescription]));
          result.lines = result.lines.map(l => ({ ...l, accountDescription: descMap.get(l.lineId) || undefined }));
        } catch { /* non-critical */ }
      }
      setViewAcctData(result);
      // Group all lines by headerId to build per-event sections (one section per event type)
      const eventsMap = new Map<number, { headerId: number; eventTypeCode: string; accountingStatus: string; accountingDate: string; lines: any[] }>();
      for (const line of (allLinesData.items || [])) {
        const hid = line.headerId as number;
        if (!eventsMap.has(hid)) {
          eventsMap.set(hid, {
            headerId:         hid,
            eventTypeCode:    (line as any).eventTypeCode || '',
            accountingStatus: (line as any).accountingStatus || '',
            accountingDate:   (line as any).accountingDate || '',
            lines:            [],
          });
        }
        eventsMap.get(hid)!.lines.push(line);
      }
      setViewAcctAllEvents(Array.from(eventsMap.values()).sort((a, b) => a.headerId - b.headerId));
    } catch (err: any) {
      message.error(`Failed to fetch accounting: ${err.message}`);
      setViewAcctOpen(false);
    } finally {
      setViewAcctLoading(false);
    }
  };

  const handlePostToLedgerOpen = async () => {
    if (!viewAcctData?.headerId || !viewAcctRecord) return;
    setSlaActionLoading(true);
    setPostGLPayload(null);
    setPostGLResult(null);
    setPostGLFetchingLines(true);
    try {
      // viewAcctData.lines already loaded by View Accounting — use directly, no second fetch needed
      const lines = viewAcctData.lines || [];
      setPostGLRawCount(lines.length);
      setPostModalHeadId(viewAcctData.headerId);

      const acctUrl = `${APEX_DB_CONFIG.baseUrl}/sla/accounting?sourceTable=AP_PAYMENTS&sourceId=${viewAcctRecord.checkId}`;
      setPostGLLinesUrl(acctUrl);

      const ledgerInfo = await fetchLedgerByBusinessUnit(viewAcctRecord.businessUnit || '');
      const totalDr    = lines.reduce((s, l) => s + (l.enteredDr || 0), 0);
      const totalCr    = lines.reduce((s, l) => s + (l.enteredCr || 0), 0);
      const ledgerName = ledgerInfo?.ledgerName ?? 'BCL DIFC';
      const ledgerId   = ledgerInfo?.ledgerId   ?? 0;
      const batchName  = `SLA-AP_PAYMENTS-${viewAcctData.periodName}-${viewAcctData.headerId}`;

      setPostGLPayload({
        batch: {
          batchName,
          batchDescription:  viewAcctData.description || '',
          ledgerName, ledgerId,
          status:            'NEW',
          accountingPeriod:  viewAcctData.periodName,
          controlTotal:      totalDr, runningTotalDr: totalDr, runningTotalCr: totalCr,
          batchSource:       'Payables',
          createdBy:         'SYSTEM',
        },
        header: {
          ledgerId, ledgerName,
          jeCategory:             viewAcctData.eventTypeCode || 'Payables',
          jeSource:               'Payables',
          periodName:             viewAcctData.periodName,
          journalName:            `SLA-${viewAcctRecord.paymentNumber}-${viewAcctData.eventTypeCode}`,
          description:            viewAcctData.description || '',
          currencyCode:           viewAcctRecord.currency || viewAcctRecord.paymentCurrency || 'AED',
          currencyConversionType: 'User',
          currencyConversionDate: viewAcctData.accountingDate,
          currencyConversionRate: (viewAcctRecord.conversionRate && viewAcctRecord.conversionRate > 0) ? viewAcctRecord.conversionRate : 1,
          defaultEffectiveDate:   viewAcctData.accountingDate,
          status:                 'NEW',
          runningTotalDr:         totalDr, runningTotalCr: totalCr,
          createdBy:              'SYSTEM',
        },
        lines: lines.map((l) => {
          const eDr  = l.lineType === 'DR' ? (l.enteredDr  || null) : null;
          const eCr  = l.lineType === 'CR' ? (l.enteredCr  || null) : null;
          const rate = (viewAcctRecord.conversionRate && viewAcctRecord.conversionRate > 0) ? viewAcctRecord.conversionRate : 1;
          return {
            enteredDr:                  eDr,
            enteredCr:                  eCr,
            accountedDr:                eDr != null ? Math.round(eDr * rate * 100) / 100 : null,
            accountedCr:                eCr != null ? Math.round(eCr * rate * 100) / 100 : null,
            statAmount:                 null,
            description:                l.description || viewAcctData.description || '',
            currencyCode:               viewAcctRecord.currency || viewAcctRecord.paymentCurrency || 'AED',
            currencyConversionDate:     viewAcctData.accountingDate,
            currencyConversionRate:     rate,
            userCurrencyConversionType: 'User',
            accountCombination:         l.accountCombination || '',
            chartOfAccountsName:        'Chart of Accounts',
            reference1:                 String(viewAcctRecord.paymentNumber || ''),
            reference2:                 String(viewAcctRecord.checkId || ''),
            reference3:                 l.accountingClass || null,
            reference4:                 viewAcctRecord.businessUnit || null,
            reference5:                 eventTypeToRef5(viewAcctData.eventTypeCode || 'PAYMENT_CREATED'),
            createdBy:                  'SYSTEM',
          };
        }),
      });
      setPostModalOpen(true);
    } catch (err: any) {
      message.error(`Failed to prepare posting: ${err.message}`);
    } finally {
      setSlaActionLoading(false);
      setPostGLFetchingLines(false);
    }
  };

  const handlePostToLedgerConfirm = async () => {
    if (!postGLPayload || !postModalHeadId || !viewAcctRecord) return;
    setSlaActionLoading(true);
    try {
      // Step 1 — Duplicate check by ref1/ref2/ref5
      const ref5 = postGLPayload.lines?.[0]?.reference5 || eventTypeToRef5('PAYMENT_CREATED');
      const glExists = await checkGLJournalExists(
        String(viewAcctRecord.paymentNumber || ''),
        String(viewAcctRecord.checkId || ''),
        ref5,
      );

      let retBatchId: number | null  = glExists.batchId;
      let retHeaderId: number | null = glExists.headerId;
      let retBatchName: string       = postGLPayload.batch.batchName;

      if (glExists.exists && glExists.status === 'P') {
        message.info('GL journal already posted. Stamping SLA header.');
      } else if (glExists.exists && glExists.batchId) {
        // Exists but unposted — post via PUT
        const putRes  = await fetch(`${APEX_DB_CONFIG.baseUrl}/gl/journals/${glExists.batchId}/post`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}',
        });
        const putData = await putRes.json().catch(() => ({}));
        if (!putRes.ok || putData?.success === false) {
          throw new Error(Array.isArray(putData?.errors) ? putData.errors[0] : putData?.error || `HTTP ${putRes.status}`);
        }
      } else {
        // Step 2 — Create the GL journal
        const glRes = await fetch(`${APEX_DB_CONFIG.baseUrl}/journals/create`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body:    JSON.stringify(postGLPayload),
        });
        const glData = await glRes.json();
        if (!glRes.ok) throw new Error(glData?.message || `HTTP ${glRes.status}`);

        retBatchId   = glData.jeBatchId  ?? glData.batchId  ?? null;
        retHeaderId  = glData.jeHeaderId ?? glData.headerId ?? null;
        retBatchName = glData.batchName  ?? retBatchName;

        // Step 3 — Post the newly created batch
        if (retBatchId) {
          const putRes  = await fetch(`${APEX_DB_CONFIG.baseUrl}/gl/journals/${retBatchId}/post`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}',
          });
          const putData = await putRes.json().catch(() => ({}));
          if (!putRes.ok || putData?.success === false) {
            throw new Error(Array.isArray(putData?.errors) ? putData.errors[0] : putData?.error || `HTTP ${putRes.status}`);
          }
        }
      }

      // Step 4 — Stamp SLA header
      await fetch(`${APEX_DB_CONFIG.baseUrl}/sla/accounting/post`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify({ headerId: postModalHeadId, glBatchId: retBatchId, glBatchName: retBatchName, glHeaderId: retHeaderId, postedBy: 'SYSTEM' }),
      });

      setPostGLResult({ success: true, data: { batchId: retBatchId, headerId: retHeaderId } });
      message.success('Posted to GL successfully.');
      const refreshed = await getAccounting('AP_PAYMENTS', viewAcctRecord.checkId);
      if (refreshed.headerId) {
        try {
          const linesData = await getLinesByHeaderId(refreshed.headerId);
          const descMap = new Map(linesData.items.map(l => [l.lineId, l.accountDescription]));
          refreshed.lines = refreshed.lines.map(l => ({ ...l, accountDescription: descMap.get(l.lineId) || undefined }));
        } catch { /* non-critical */ }
      }
      setViewAcctData(refreshed);
      if (viewAcctRecord.paymentNumber) {
        try {
          const allData = await getAccountingLinesBySourceNumber(String(viewAcctRecord.paymentNumber), 'AP');
          const filteredItems = (allData.items || []).filter(
            (l: any) => !l.sourceId || Number(l.sourceId) === Number(viewAcctRecord.checkId)
          );
          const eventsMap = new Map<number, any>();
          for (const line of filteredItems) {
            const hid = line.headerId as number;
            if (!eventsMap.has(hid)) eventsMap.set(hid, { headerId: hid, eventTypeCode: (line as any).eventTypeCode || '', accountingStatus: (line as any).accountingStatus || '', accountingDate: (line as any).accountingDate || '', lines: [] });
            eventsMap.get(hid)!.lines.push(line);
          }
          setViewAcctAllEvents(Array.from(eventsMap.values()).sort((a, b) => a.headerId - b.headerId));
        } catch { /* non-critical */ }
      }
    } catch (err: any) {
      setPostGLResult({ success: false, error: err.message });
      message.error(`Post to GL failed: ${err.message}`);
    } finally {
      setSlaActionLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  // ── Create Accounting for Payment ────────────────────────────────────────
  const handleCreateAccounting = async (record: PaymentRecord) => {
    setAcctPayment(record);
    setAcctResults([]);
    setAcctLoading(true);
    setAcctModalOpen(true);

    try {
      // 1. Check if accounting already exists
      const exists = await checkAccountingExists('AP_PAYMENTS', record.checkId);
      if (exists.exists && exists.accountingStatus === 'POSTED') {
        setAcctResults([{ invoiceNumber: '—', status: 'ALREADY POSTED', headerId: exists.headerId ?? undefined }]);
        setAcctLoading(false);
        return;
      }

      // 2. Find matching bank account by name
      const bank = bankAccounts.find(b => b.bankAccountName === record.disbursementBankAccount);
      if (!bank) {
        setAcctResults([{ invoiceNumber: '—', status: 'ERROR', error: `Bank account not found: ${record.disbursementBankAccount}` }]);
        setAcctLoading(false);
        return;
      }

      // 3. Fetch related invoices (includes LiabilityDistribution via updated SQL)
      const relUrl = `${APEX_DB_CONFIG.baseUrl}/ap/payments/${record.checkId}/related-invoices`;
      const relRes = await fetch(relUrl, { headers: { Accept: 'application/json' } });
      if (!relRes.ok) throw new Error(`Failed to fetch related invoices: HTTP ${relRes.status}`);
      const relData = await relRes.json();
      const relInvoices: any[] = relData.items || [];

      if (relInvoices.length === 0) {
        setAcctResults([{ invoiceNumber: '—', status: 'ERROR', error: 'No applied invoices found for this payment' }]);
        setAcctLoading(false);
        return;
      }

      // 4. Fetch ledger
      const ledgerInfo = await fetchLedgerByBusinessUnit(record.businessUnit || '');

      // 5. Build one journal payload per invoice and post
      const paymentDate = toApiDate(record.paymentDate || record.checkDate || '');
      const paymentCcy = record.currency || record.paymentCurrency || 'AED';
      const payloads = buildApPaymentSlaPayloads({
        checkId: record.checkId,
        paymentNumber: String(record.paymentNumber || record.checkId),
        paymentDate,
        currencyCode: paymentCcy,
        exchangeRate: (paymentCcy !== 'AED' && record.conversionRate && record.conversionRate > 0)
          ? record.conversionRate : 1,
        businessUnit: record.businessUnit,
        legalEntity: record.legalEntityName,
        ledgerId: ledgerInfo?.ledgerId,
        ledgerName: ledgerInfo?.ledgerName,
        cashClearingAccount: bank.cashClearingAccountCombination,
        appliedInvoices: relInvoices.map((inv: any) => ({
          invoiceNumber: inv.InvoiceNumber || '',
          invoiceId: inv.InvoiceId || 0,
          amountPaid: inv.AmountPaidInvoiceCurrency || inv.InvoicePaymentAmount || 0,
          liabilityDistribution: inv.LiabilityDistribution || '',
        })),
      });

      // 6. Post each journal and collect results
      const results: typeof acctResults = [];
      for (const payload of payloads) {
        const invNum = payload.header.description?.split('Invoice ')[1] || '—';
        try {
          const result = await createAccounting(payload);
          results.push({ invoiceNumber: invNum, status: 'DRAFT', headerId: result.headerId });
        } catch (err: any) {
          results.push({ invoiceNumber: invNum, status: 'ERROR', error: err.message });
        }
      }
      setAcctResults(results);
    } catch (err: any) {
      setAcctResults([{ invoiceNumber: '—', status: 'ERROR', error: err.message }]);
    } finally {
      setAcctLoading(false);
    }
  };
  // ────────────────────────────────────────────────────────────────────────

  // Row selection config
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  const exportToExcel = () => {
    const rows = (selectedRowKeys.length > 0
      ? payments.filter(p => selectedRowKeys.includes(p.key))
      : payments
    ).map(p => ({
      'Payment #':           p.paymentNumber,
      'Payee':               p.payee,
      'Payment Date':        p.paymentDate,
      'Amount':              p.paymentAmount,
      'Currency':            p.paymentCurrency,
      'Status':              p.paymentStatus,
      'Accounting Status':   p.accountingStatus,
      'Business Unit':       p.businessUnit,
      'Payment Method':      p.paymentMethod,
      'Bank Account':        p.disbursementBankAccount,
      'Maturity Date':       p.maturityDate || '',
      'Void Date':           p.voidDate || '',
      'Clearing Date':       p.clearingDate || '',
      'Supplier #':          p.supplierNumber,
      'Payee Site':          p.payeeSite,
      'Document Category':   p.documentCategory,
      'Voucher #':           p.voucherNumber || '',
      'Accounting Date':     p.accountingDate,
      'Description':         p.paymentDescription,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payments');

    // Auto-fit column widths
    const colWidths = Object.keys(rows[0] || {}).map(key => ({
      wch: Math.max(key.length, ...rows.map(r => String((r as any)[key] ?? '').length)) + 2,
    }));
    ws['!cols'] = colWidths;

    const filename = `Payments_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`;
    XLSX.writeFile(wb, filename);
    message.success(`Exported ${rows.length} payment(s) to ${filename}`);
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
                        {/* ── Column 1 ─────────────────────────────────── */}
                        <Col span={8}>
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
                                  onClick={() => openSupplierModal()}
                                />
                              }
                              onClick={() => openSupplierModal()}
                              style={{ cursor: 'pointer' }}
                            />
                          </Form.Item>
                          <Form.Item name="supplierNumber" hidden>
                            <Input />
                          </Form.Item>
                          {/* Smart Payment Date filter */}
                          <Form.Item label={<><span style={{ color: REDWOOD.primary }}>**</span> Payment Date</>}>
                            <Select
                              placeholder="Select date range"
                              allowClear
                              value={paymentDateMode || undefined}
                              onChange={(v) => { setPaymentDateMode(v ?? ''); setPaymentDateRange(null); }}
                              style={{ width: '100%' }}
                              options={[
                                { value: 'today',  label: 'Today' },
                                { value: 'past7',  label: 'Past 7 days' },
                                { value: 'past10', label: 'Past 10 days' },
                                { value: 'past15', label: 'Past 15 days' },
                                { value: 'past30', label: 'Past 30 days' },
                                { value: 'past60', label: 'Past 60 days' },
                                { value: 'custom', label: 'Custom range…' },
                              ]}
                            />
                            {paymentDateMode === 'custom' && (
                              <DatePicker.RangePicker
                                style={{ width: '100%', marginTop: 4 }}
                                format="DD-MMM-YYYY"
                                value={paymentDateRange}
                                onChange={(v) => setPaymentDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
                              />
                            )}
                          </Form.Item>
                          <Form.Item
                            label={<><span style={{ color: REDWOOD.primary }}>**</span> Payment Number</>}
                            name="paymentNumber"
                          >
                            <Input placeholder="Enter payment number" />
                          </Form.Item>
                        </Col>
                        {/* ── Column 2 ─────────────────────────────────── */}
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
                              <Option value="Issued">Issued</Option>
                              <Option value="Negotiable">Negotiable</Option>
                              <Option value="Cleared">Cleared</Option>
                              <Option value="Voided">Voided</Option>
                              <Option value="Stopped">Stopped</Option>
                            </Select>
                          </Form.Item>
                          <Form.Item
                            label={<><span style={{ color: REDWOOD.primary }}>**</span> Disbursement Bank Account</>}
                            name="disbursementBankAccount"
                          >
                            <Select placeholder="Select Bank Account" allowClear />
                          </Form.Item>
                        </Col>
                        {/* ── Column 3 ─────────────────────────────────── */}
                        <Col span={8}>
                          <Form.Item label="Only PDC" name="onlyPdc" valuePropName="checked">
                            <Checkbox
                              checked={onlyPdc}
                              onChange={e => {
                                setOnlyPdc(e.target.checked);
                                if (e.target.checked) {
                                  form.setFieldsValue({ paymentStatus: 'Issued' });
                                } else {
                                  form.setFieldsValue({ paymentStatus: undefined });
                                }
                              }}
                            >
                              <span style={{ fontSize: 12 }}>
                                Show only Post-Dated Cheques
                                <br />
                                <Text type="secondary" style={{ fontSize: 11 }}>(payments with Maturity Date)</Text>
                              </span>
                            </Checkbox>
                          </Form.Item>
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
                <Dropdown menu={{ items: actionsMenuItems, onClick: handleActionsMenuClick }} trigger={['click']}>
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
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={exportToExcel}
                  disabled={payments.length === 0}
                >
                  Export to Excel
                </Button>
                <Button size="small" icon={<ScissorOutlined />}>
                  Detach
                </Button>
                {(() => {
                  if (selectedRowKeys.length !== 1) return null;
                  const sel = payments.find(p => p.key === selectedRowKeys[0]);
                  if (!sel) return null;
                  const matDate = sel.maturityDate ? toApiDate(sel.maturityDate) : null;
                  const today = dayjs().format('YYYY-MM-DD');
                  const isMatured = matDate && matDate <= today;
                  const isIssued = sel.paymentStatus === 'Issued';
                  if (!isMatured || !isIssued) return null;
                  return (
                    <Tooltip title="Clear PDC Payment">
                      <Button
                        size="small"
                        style={{ background: REDWOOD.success, borderColor: REDWOOD.success, color: '#fff' }}
                        icon={<CheckCircleOutlined />}
                        onClick={() => openClearModal(sel)}
                      >
                        Clear Payment
                      </Button>
                    </Tooltip>
                  );
                })()}
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
              disabled={paymentConfirmed}
            >
              <Tabs
                activeKey={createPaymentActiveTab}
                onChange={setCreatePaymentActiveTab}
                style={{ padding: '0 16px' }}
                tabBarStyle={{ marginBottom: 0 }}
                tabBarExtraContent={
                  <Space style={{ paddingRight: 4 }}>
                    <Button
                      size="small"
                      onClick={() => {
                        setCreatePaymentTabOpen(false);
                        setActiveTab('search');
                        createPaymentForm.resetFields();
                        setInvoicesToPay([]);
                        setSelectedBuLegalEntityName('');
                        setCreatePaymentCurrency('AED');
                      }}
                    >
                      Cancel
                    </Button>
                    <Tooltip title="View API payload & test">
                      <Button
                        size="small"
                        icon={<ApiOutlined />}
                        onClick={() => {
                          setApiStep1CheckId(null);
                          setApiTestResults({});
                          setApiPanelOpen(true);
                        }}
                      >
                        API
                      </Button>
                    </Tooltip>
                    {paymentConfirmed && (
                      <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 12 }}>
                        Payment #{confirmedPaymentNumber} Confirmed
                      </Tag>
                    )}
                    <Button
                      size="small"
                      onClick={() => {
                        setCreatePaymentTabOpen(false);
                        setActiveTab('search');
                        createPaymentForm.resetFields();
                        setInvoicesToPay([]);
                        setSelectedBuLegalEntityName('');
                        setCreatePaymentCurrency('AED');
                        setPaymentConfirmed(false);
                        setConfirmedPaymentNumber('');
                      }}
                    >
                      {paymentConfirmed ? 'Close' : 'Cancel'}
                    </Button>
                    {!paymentConfirmed && (
                      <Button
                        size="small"
                        type="primary"
                        icon={<CheckCircleOutlined />}
                        style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
                        onClick={handleConfirmPaymentClick}
                      >
                        Confirm Payment
                      </Button>
                    )}
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
                                  setBankAcctCashOverride('');
                                  setBankAcctPdcOverride('');
                                }}
                                onClear={() => { setSelectedBankAccount(null); setBankAcctCashOverride(''); setBankAcctPdcOverride(''); }}
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
                              <Select
                                showSearch
                                optionFilterProp="label"
                                placeholder="Select Currency"
                                disabled={!selectedBuLegalEntityName}
                                onChange={(val) => {
                                  setCreatePaymentCurrency(val || 'AED');
                                  createPaymentForm.validateFields(['conversionRateType', 'conversionDate', 'conversionRate']);
                                }}
                              >
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
                              label={createPaymentCurrency !== 'AED' ? <><span style={{ color: REDWOOD.primary }}>*</span> Conversion Rate Type</> : 'Conversion Rate Type'}
                              name="conversionRateType"
                              rules={[{ required: createPaymentCurrency !== 'AED', message: 'Required for foreign currency' }]}
                            >
                              <Select placeholder="Select rate type" allowClear disabled={!selectedBuLegalEntityName}>
                                <Option value="User">User</Option>
                                <Option value="Corporate">Corporate</Option>
                                <Option value="Spot">Spot</Option>
                              </Select>
                            </Form.Item>
                            <Form.Item
                              label={createPaymentCurrency !== 'AED' ? <><span style={{ color: REDWOOD.primary }}>*</span> Conversion Date</> : 'Conversion Date'}
                              name="conversionDate"
                              rules={[{ required: createPaymentCurrency !== 'AED', message: 'Required for foreign currency' }]}
                            >
                              <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" disabled={!selectedBuLegalEntityName} />
                            </Form.Item>
                            <Form.Item
                              label={createPaymentCurrency !== 'AED' ? <><span style={{ color: REDWOOD.primary }}>*</span> Conversion Rate</> : 'Conversion Rate'}
                              name="conversionRate"
                              rules={[{ required: createPaymentCurrency !== 'AED', message: 'Required for foreign currency' }]}
                            >
                              <InputNumber style={{ width: '100%' }} placeholder="0.000000" precision={6} min={0} disabled={!selectedBuLegalEntityName} />
                            </Form.Item>
                            {createPaymentCurrency !== 'AED' && (
                              <Form.Item label="Functional Amount (AED)">
                                {(() => {
                                  const rate = Number(watchedConversionRate) || 0;
                                  const functionalAmt = rate > 0 ? totalAppliedAmount * rate : null;
                                  return functionalAmt != null ? (
                                    <Text strong style={{ color: REDWOOD.info, fontSize: 14 }}>
                                      {functionalAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>AED</Text>
                                    </Text>
                                  ) : (
                                    <Text type="secondary">Enter conversion rate to calculate</Text>
                                  );
                                })()}
                              </Form.Item>
                            )}
                            <Form.Item label="Maturity Date" name="maturityDate">
                              <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="dd-mmm-yyyy" disabled={!selectedBuLegalEntityName} />
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
                              <Input disabled={!selectedBuLegalEntityName} placeholder="Leave blank to auto-generate" />
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
                            <div style={{ fontSize: 14, fontWeight: 600, color: REDWOOD.neutral900 }}>
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
                            <div style={{ fontSize: 14, fontWeight: 600, color: REDWOOD.neutral900 }}>{invoicesToPay.length}</div>
                          </Col>
                          {/* Applied Amount */}
                          <Col span={6} style={{ textAlign: 'center', padding: '6px 8px', borderRight: `1px solid ${REDWOOD.neutral200}` }}>
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Applied Amount</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: REDWOOD.neutral900 }}>
                              {totalAppliedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </Col>
                          {/* Balance After Application */}
                          <Col span={6} style={{ textAlign: 'center', padding: '6px 8px' }}>
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Balance After Application</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: balanceAfterApplication !== null && balanceAfterApplication < 0 ? REDWOOD.warning : REDWOOD.neutral900 }}>
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
                        <Divider orientationMargin={0} style={{ fontSize: 12, color: '#666', marginTop: 0 }}>Disbursement Bank Account</Divider>
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
                              {(() => {
                                const effectiveCash = bankAcctCashOverride || selectedBankAccount.cashAccountCombination;
                                const effectivePdc  = bankAcctPdcOverride  || selectedBankAccount.pdcAccountCombination;
                                const maturityDate  = createPaymentForm.getFieldValue('maturityDate');
                                return (
                                  <>
                                    <Form.Item
                                      label="Cash Account Combination"
                                      validateStatus={!effectiveCash ? 'error' : ''}
                                      help={!effectiveCash ? 'Required — click to select' : ''}
                                    >
                                      <Input.Group compact>
                                        <Input
                                          readOnly
                                          value={effectiveCash}
                                          style={{ background: effectiveCash ? '#f5f5f5' : '#fff2f0', color: '#333', width: 'calc(100% - 32px)', borderColor: !effectiveCash ? '#ff4d4f' : undefined }}
                                          placeholder="Not set"
                                        />
                                        <Button
                                          icon={<SearchOutlined />}
                                          onClick={() => setBankAcctSelectorField('cash')}
                                          style={{ borderColor: !effectiveCash ? '#ff4d4f' : undefined }}
                                        />
                                      </Input.Group>
                                      {selectedBankAccount.cashAccountDescription && (
                                        <Text type="secondary" style={{ fontSize: 11 }}>{selectedBankAccount.cashAccountDescription}</Text>
                                      )}
                                    </Form.Item>
                                    <Form.Item label="Cash Clearing Account Combination">
                                      <Input readOnly value={selectedBankAccount.cashClearingAccountCombination} style={{ background: '#f5f5f5', color: '#333' }} />
                                      {selectedBankAccount.cashClearingAccountDescription && (
                                        <Text type="secondary" style={{ fontSize: 11 }}>{selectedBankAccount.cashClearingAccountDescription}</Text>
                                      )}
                                    </Form.Item>
                                    <Form.Item
                                      label="PDC Account Combination"
                                      validateStatus={maturityDate && !effectivePdc ? 'error' : ''}
                                      help={maturityDate && !effectivePdc ? 'Required when Maturity Date is set' : ''}
                                    >
                                      <Input.Group compact>
                                        <Input
                                          readOnly
                                          value={effectivePdc}
                                          style={{ background: effectivePdc ? '#f5f5f5' : (maturityDate ? '#fff2f0' : '#fafafa'), color: '#333', width: 'calc(100% - 32px)', borderColor: maturityDate && !effectivePdc ? '#ff4d4f' : undefined }}
                                          placeholder="Not set"
                                        />
                                        <Button
                                          icon={<SearchOutlined />}
                                          onClick={() => setBankAcctSelectorField('pdc')}
                                          style={{ borderColor: maturityDate && !effectivePdc ? '#ff4d4f' : undefined }}
                                        />
                                      </Input.Group>
                                    </Form.Item>
                                  </>
                                );
                              })()}
                            </Col>
                          </Row>
                        ) : (
                          <div style={{ padding: '8px 0 16px', color: '#aaa', fontSize: 12 }}>
                            Select a Disbursement Bank Account in Payment Details to view bank information here.
                          </div>
                        )}

                        <Divider orientationMargin={0} style={{ fontSize: 12, color: '#666' }}>Remittance</Divider>
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
                        <Divider orientationMargin={0} style={{ fontSize: 12, color: '#666', marginTop: 0 }}>Options</Divider>
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
                        <Divider orientationMargin={0} style={{ fontSize: 12, color: '#666' }}>Conversion</Divider>
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
                        <Divider orientationMargin={0} style={{ fontSize: 12, color: '#666' }}>Bills Payable</Divider>
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
                  <Table.Summary.Cell index={0} colSpan={6} align="right">
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
                  title: 'Currency',
                  dataIndex: 'currency',
                  key: 'currency',
                  width: 75,
                  render: (v: string) => <Tag style={{ fontSize: 11, padding: '0 4px' }}>{v || 'AED'}</Tag>,
                },
                {
                  title: 'Conv. Rate',
                  key: 'convRate',
                  width: 90,
                  align: 'right' as const,
                  render: (_: any, record: PaymentInvoice) => {
                    const ccy = record.currency || 'AED';
                    if (ccy === 'AED') return <span style={{ color: '#bbb' }}>—</span>;
                    const rate = watchedConversionRate;
                    return rate ? <span style={{ fontSize: 11 }}>{Number(rate).toFixed(4)}</span> : <span style={{ color: '#bbb' }}>—</span>;
                  },
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
            {/* Data source is always APEX */}
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
                setPaymentConfirmed(false);
                setConfirmedPaymentNumber('');
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
              {addInvoicesApiUrl && (
                <Popover
                  title={<Space><ApiOutlined style={{ color: '#1677ff' }} /><span>API Request</span></Space>}
                  content={
                    <div style={{ maxWidth: 520 }}>
                      <div style={{ marginBottom: 6 }}>
                        <Tag color="blue">GET</Tag>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>/ap/createinvoice</span>
                      </div>
                      <div style={{
                        background: '#1e1e1e', color: '#d4d4d4', borderRadius: 6,
                        padding: '8px 10px', fontSize: 11, fontFamily: 'monospace',
                        wordBreak: 'break-all', maxHeight: 80, overflowY: 'auto',
                      }}>
                        {addInvoicesApiUrl}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11, color: '#555' }}>
                        Filters: <code>unpaid_amount &gt; 0</code> (derived from <code>RR_AP_PAYMENTS_RELATED_INVOICES</code>)
                      </div>
                    </div>
                  }
                  trigger="click"
                  placement="bottomLeft"
                >
                  <Tooltip title="View API details">
                    <ApiOutlined style={{ color: '#1677ff', cursor: 'pointer', fontSize: 15 }} />
                  </Tooltip>
                </Popover>
              )}
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

        {/* ── Void Payment Modal ──────────────────────────────────────────── */}
        <Modal
          title={
            <Space>
              <StopOutlined style={{ color: REDWOOD.error }} />
              <span>Void Payment</span>
              {voidTargetPayment && <Tag color="red" style={{ marginLeft: 4 }}>{voidTargetPayment.paymentNumber}</Tag>}
            </Space>
          }
          open={voidModalOpen}
          onCancel={() => { setVoidModalOpen(false); voidForm.resetFields(); setVoidStepMap(initVoidSteps()); }}
          footer={null}
          width={900}
          destroyOnClose
          styles={{ body: { maxHeight: '80vh', overflowY: 'auto' } }}
        >
          {/* Payment header info + form fields — compact single row */}
          <Form form={voidForm} layout="inline" size="small" style={{ marginBottom: 10, flexWrap: 'nowrap', gap: 8 }}>
            <Form.Item label="Payment #" style={{ marginBottom: 0, flex: '0 0 auto' }}>
              <Input value={voidTargetPayment?.paymentNumber?.toString()} readOnly style={{ background: '#f5f5f5', width: 140 }} />
            </Form.Item>
            <Form.Item label="Amount" style={{ marginBottom: 0, flex: '0 0 auto' }}>
              <Input value={voidTargetPayment ? `${formatAmount(voidTargetPayment.paymentAmount)} ${voidTargetPayment.paymentCurrency}` : ''} readOnly style={{ background: '#f5f5f5', width: 150, fontWeight: 500 }} />
            </Form.Item>
            <Form.Item label="Void Date" name="voidDate" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 0, flex: '0 0 auto' }}>
              <DatePicker style={{ width: 140 }} format="DD-MMM-YYYY" />
            </Form.Item>
            <Form.Item label="Void Reason" name="voidReason" style={{ marginBottom: 0, flex: 1 }}>
              <Input placeholder="Optional" />
            </Form.Item>
          </Form>

          {/* Related invoices (compact) */}
          <Table size="small" loading={voidRelatedLoading} dataSource={voidRelatedInvoices} rowKey="key"
            pagination={false} scroll={{ y: 70 }} style={{ marginBottom: 12 }}
            locale={{ emptyText: 'No related invoices' }}
            columns={[
              { title: 'Invoice #', dataIndex: 'invoiceNumber', key: 'invoiceNumber', ellipsis: true },
              { title: 'Installment', dataIndex: 'installmentNumber', key: 'installmentNumber', width: 90, align: 'center' as const, render: (v: any) => v ?? '—' },
              { title: 'Amt Paid', dataIndex: 'amountPaid', key: 'amountPaid', align: 'right' as const, render: (v: number) => formatAmount(v) },
              { title: 'Liability Account', dataIndex: 'liabilityDistribution', key: 'liabilityDistribution', ellipsis: true },
            ]}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button onClick={() => { setVoidModalOpen(false); voidForm.resetFields(); setVoidStepMap(initVoidSteps()); setVoidApiDrawerOpen(false); }}>
              Cancel
            </Button>
            <Button
              type="primary"
              danger
              icon={<StopOutlined />}
              onClick={async () => {
                try { await voidForm.validateFields(); } catch { return; }
                setVoidStepMap(initVoidSteps());
                setVoidApiDrawerOpen(true);
              }}
            >
              Void Payment
            </Button>
          </div>

          <Collapse
            activeKey={voidApiDrawerOpen ? ['steps'] : []}
            onChange={keys => setVoidApiDrawerOpen(Array.isArray(keys) ? keys.includes('steps') : keys === 'steps')}
            style={{ marginTop: 12 }}
            items={[{
              key: 'steps',
              label: (
                <Space size={4}>
                  <ApiOutlined style={{ color: REDWOOD.info }} />
                  <span style={{ fontWeight: 600 }}>API Steps</span>
                  {VOID_STEP_KEYS.map(k => voidStepMap[k].status).some(s => s === 'running') && <LoadingOutlined style={{ color: '#1677ff' }} spin />}
                  {VOID_STEP_KEYS.every(k => voidStepMap[k].status === 'success') && <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                  {VOID_STEP_KEYS.some(k => voidStepMap[k].status === 'error') && <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
                </Space>
              ),
              children: (() => {
                const stepCards = [
                  { key: 'eligibility' as VoidStepKey, step: 1, method: 'GET',  methodColor: 'blue',   label: 'Check Void Eligibility',
                    url: `${APEX_DB_CONFIG.baseUrl}/ap/payments/${voidTargetPayment?.checkId ?? ':id'}/void-eligibility`,
                    handler: runVoidStep_eligibility },
                  { key: 'void'        as VoidStepKey, step: 2, method: 'PUT',  methodColor: 'orange', label: 'Void Payment',
                    url: `${APEX_DB_CONFIG.baseUrl}/ap/payments/void`,
                    handler: runVoidStep_void, enabledAfter: 'eligibility' as VoidStepKey },
                  { key: 'sla'         as VoidStepKey, step: 3, method: 'POST', methodColor: 'green',  label: 'Create SLA Reversal Accounting',
                    url: `${APEX_DB_CONFIG.baseUrl}/sla/accounting/create`,
                    handler: runVoidStep_sla, enabledAfter: 'void' as VoidStepKey },
                  { key: 'gl_create'   as VoidStepKey, step: 4, method: 'POST', methodColor: 'green',  label: 'Create GL Journal',
                    url: `${APEX_DB_CONFIG.baseUrl}/journals/create`,
                    handler: runVoidStep_glCreate, enabledAfter: 'sla' as VoidStepKey },
                  { key: 'gl_post'     as VoidStepKey, step: 5, method: 'PUT',  methodColor: 'orange', label: 'Post GL Journal',
                    url: `${APEX_DB_CONFIG.baseUrl}/gl/journals/:batchId/post`,
                    handler: runVoidStep_glPost, enabledAfter: 'gl_create' as VoidStepKey },
                  { key: 'sla_stamp'   as VoidStepKey, step: 6, method: 'POST', methodColor: 'green',  label: 'Stamp SLA as POSTED',
                    url: `${APEX_DB_CONFIG.baseUrl}/sla/accounting/post`,
                    handler: runVoidStep_stamp, enabledAfter: 'gl_post' as VoidStepKey },
                ];
                return stepCards.map(card => {
                  const st = voidStepMap[card.key];
                  const isRunning = st.status === 'running';
                  const enabled = !isRunning && (!card.enabledAfter || voidStepMap[card.enabledAfter]?.status === 'success');
                  const borderColor = st.status === 'success' ? '#52c41a' : st.status === 'error' ? '#ff4d4f' : st.status === 'running' ? '#1677ff' : undefined;
                  const statusIcon = st.status === 'running' ? <LoadingOutlined style={{ color: '#1677ff' }} spin />
                    : st.status === 'success' ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    : st.status === 'error'   ? <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> : null;
                  return (
                    <Card key={card.key} size="small" style={{ marginBottom: 10, borderColor }}
                      title={
                        <Space size={4}>
                          <Tag color={card.methodColor} style={{ minWidth: 44, textAlign: 'center', margin: 0 }}>{card.method}</Tag>
                          <Text strong style={{ fontSize: 12 }}>Step {card.step}: {card.label}</Text>
                          {statusIcon}
                        </Space>
                      }
                      extra={
                        <Button size="small" type="primary" danger={card.key === 'void'}
                          icon={isRunning ? <LoadingOutlined /> : <PlayCircleOutlined />}
                          loading={isRunning} disabled={!enabled} onClick={card.handler}
                        >
                          Run
                        </Button>
                      }
                    >
                      <code style={{ fontSize: 10, background: '#f0f0f0', padding: '2px 6px', borderRadius: 3, display: 'block', wordBreak: 'break-all', marginBottom: st.response || st.error ? 6 : 0 }}>{card.url}</code>
                      {st.error && <Alert type="error" message={st.error} style={{ marginTop: 6, fontSize: 11 }} showIcon />}
                      {st.response && (
                        <pre style={{ fontSize: 10, background: '#1e1e1e', color: st.status === 'error' ? '#f48771' : '#b5cea8', padding: 8, borderRadius: 4, margin: '6px 0 0', maxHeight: 120, overflowY: 'auto' }}>
                          {JSON.stringify(st.response, null, 2)}
                        </pre>
                      )}
                    </Card>
                  );
                });
              })(),
            }]}
          />
        </Modal>

        {/* ── Clear Payment Modal ─────────────────────────────────────────── */}
        <Modal
          title={
            <Space>
              <CheckCircleOutlined style={{ color: REDWOOD.success }} />
              <span>Clear PDC Payment</span>
              {clearTargetPayment && <Tag color="green" style={{ marginLeft: 4 }}>{clearTargetPayment.paymentNumber}</Tag>}
            </Space>
          }
          open={clearModalOpen}
          onCancel={() => { setClearModalOpen(false); setClearStepMap(initClearSteps()); setClearStepsOpen(false); }}
          footer={null}
          width={920}
          destroyOnClose
          styles={{ body: { maxHeight: '82vh', overflowY: 'auto' } }}
        >
          {/* Payment summary */}
          {clearTargetPayment && (
            <div style={{ background: '#f6fff9', border: `1px solid ${REDWOOD.success}`, borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
                {[
                  ['Payee',          clearTargetPayment.payee],
                  ['Payment #',      String(clearTargetPayment.paymentNumber)],
                  ['Amount',         `${formatAmount(clearTargetPayment.paymentAmount)} ${clearTargetPayment.paymentCurrency}`],
                  ['Payment Date',   clearTargetPayment.paymentDate || '—'],
                  ['Maturity Date',  clearTargetPayment.maturityDate || '—'],
                  ['Bank Account',   clearTargetPayment.disbursementBankAccount || '—'],
                  ['Accounting',     clearTargetPayment.accountingStatus || '—'],
                  ['Business Unit',  clearTargetPayment.businessUnit || '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <Text type="secondary" style={{ fontSize: 11 }}>{label}</Text>
                    <div><Text strong style={{ fontSize: 12 }}>{value}</Text></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!clearExistingAcctLoading && clearExistingAcctData && !clearExistingAcctData.found && (
            <Alert
              type="error" showIcon style={{ marginBottom: 14 }}
              message="Accounting Required"
              description="No SLA accounting entries found for this payment. Create and post accounting first."
            />
          )}

          {/* Existing Accounting Entries */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text strong style={{ fontSize: 13 }}>Existing Accounting Entries</Text>
              <Button
                size="small"
                icon={<FormOutlined />}
                onClick={() => { if (clearTargetPayment) handleViewAccounting(clearTargetPayment); }}
              >
                View Full Detail
              </Button>
            </div>
            {clearExistingAcctLoading ? (
              <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
            ) : clearExistingAcctData?.found ? (
              <Table
                size="small"
                pagination={false}
                scroll={{ y: 160 }}
                dataSource={(clearExistingAcctData.lines || []).map((l: any, i: number) => ({ ...l, key: i }))}
                columns={[
                  { title: 'Type', dataIndex: 'lineType', width: 50, render: (v: string) => <Tag color={v==='DR'?'blue':'green'}>{v}</Tag> },
                  { title: 'Class', dataIndex: 'accountingClass', width: 130 },
                  { title: 'Account', dataIndex: 'accountCombination', width: 170, render: (v: string) => <code style={{ fontSize: 11 }}>{v||'—'}</code> },
                  { title: 'Description', dataIndex: 'description', ellipsis: true },
                  { title: 'Dr', dataIndex: 'enteredDr', width: 110, align: 'right' as const, render: (v: number) => v ? v.toLocaleString('en-US',{minimumFractionDigits:2}) : <span style={{color:'#bbb'}}>—</span> },
                  { title: 'Cr', dataIndex: 'enteredCr', width: 110, align: 'right' as const, render: (v: number) => v ? v.toLocaleString('en-US',{minimumFractionDigits:2}) : <span style={{color:'#bbb'}}>—</span> },
                ]}
              />
            ) : (
              <Alert type="warning" showIcon message="No accounting entries found for this payment." />
            )}
          </div>

          <Divider style={{ margin: '12px 0' }} />

          {/* Clearing journal preview */}
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 13 }}>Clearing Journal Entries (to be posted)</Text>
            <div style={{ marginTop: 8, background: '#f0fff4', border: '1px solid #b7eb8f', borderRadius: 6, padding: '10px 14px' }}>
              {(() => {
                const bank = bankAccounts.find(b => b.bankAccountName === clearTargetPayment?.disbursementBankAccount);
                const pdc  = bank?.pdcAccountCombination  || '(PDC Account — configure in Banks)';
                const cash = bankAcctCashOverride || bank?.cashAccountCombination || '(Cash Account — configure in Banks)';
                const amt  = clearTargetPayment?.paymentAmount ?? 0;
                return (
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #d9d9d9' }}>
                        <th style={{ textAlign: 'left', paddingBottom: 4, width: 50 }}>Type</th>
                        <th style={{ textAlign: 'left', paddingBottom: 4 }}>Account</th>
                        <th style={{ textAlign: 'right', paddingBottom: 4, width: 150 }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><Tag color="blue" style={{ fontSize: 11 }}>DR</Tag></td>
                        <td><code style={{ fontSize: 11 }}>{cash}</code><span style={{ marginLeft: 8, color: '#888', fontSize: 11 }}>Cash / Bank Account</span></td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: REDWOOD.info }}>{formatAmount(amt)}</td>
                      </tr>
                      <tr>
                        <td><Tag color="green" style={{ fontSize: 11 }}>CR</Tag></td>
                        <td><code style={{ fontSize: 11 }}>{pdc}</code><span style={{ marginLeft: 8, color: '#888', fontSize: 11 }}>PDC Account</span></td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: REDWOOD.success }}>{formatAmount(amt)}</td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Button onClick={() => { setClearModalOpen(false); setClearStepMap(initClearSteps()); setClearStepsOpen(false); }}>
              Cancel
            </Button>
            <Button
              type="primary"
              style={{ background: REDWOOD.success, borderColor: REDWOOD.success }}
              icon={<CheckCircleOutlined />}
              disabled={clearExistingAcctLoading || !clearExistingAcctData?.found}
              onClick={() => { setClearStepMap(initClearSteps()); setClearStepsOpen(true); }}
            >
              Proceed to Clear
            </Button>
          </div>

          <Collapse
            activeKey={clearStepsOpen ? ['steps'] : []}
            onChange={keys => setClearStepsOpen(Array.isArray(keys) ? keys.includes('steps') : keys === 'steps')}
            style={{ marginTop: 12 }}
            items={[{
              key: 'steps',
              label: (
                <Space size={4}>
                  <ApiOutlined style={{ color: REDWOOD.info }} />
                  <span style={{ fontWeight: 600 }}>API Steps — Clear Payment</span>
                  {CLEAR_STEP_KEYS.map(k => clearStepMap[k].status).some(s => s === 'running') && <LoadingOutlined style={{ color: '#1677ff' }} spin />}
                  {CLEAR_STEP_KEYS.every(k => clearStepMap[k].status === 'success') && <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                  {CLEAR_STEP_KEYS.some(k => clearStepMap[k].status === 'error') && <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
                </Space>
              ),
              children: (() => {
                const stepCards: { key: ClearStepKey; step: number; method: string; methodColor: string; label: string; url: string; handler: () => Promise<boolean>; enabledAfter?: ClearStepKey }[] = [
                  { key: 'sla',       step: 1, method: 'POST', methodColor: 'green',  label: 'Create SLA Clearing Accounting',
                    url: `${APEX_DB_CONFIG.baseUrl}/sla/accounting/create`, handler: runClearStep_sla },
                  { key: 'gl_create', step: 2, method: 'POST', methodColor: 'green',  label: 'Create GL Journal',
                    url: `${APEX_DB_CONFIG.baseUrl}/journals/create`, handler: runClearStep_glCreate, enabledAfter: 'sla' },
                  { key: 'gl_post',   step: 3, method: 'PUT',  methodColor: 'orange', label: 'Post GL Journal',
                    url: `${APEX_DB_CONFIG.baseUrl}/gl/journals/:batchId/post`, handler: runClearStep_glPost, enabledAfter: 'gl_create' },
                  { key: 'sla_stamp', step: 4, method: 'POST', methodColor: 'green',  label: 'Stamp SLA as POSTED',
                    url: `${APEX_DB_CONFIG.baseUrl}/sla/accounting/post`, handler: runClearStep_stamp, enabledAfter: 'gl_post' },
                  { key: 'patch',     step: 5, method: 'PUT',  methodColor: 'orange', label: 'Update Payment Status → Cleared',
                    url: `${APEX_PAYMENTS_URL}/${clearTargetPayment?.checkId ?? ':id'}`, handler: runClearStep_patch, enabledAfter: 'sla_stamp' },
                ];
                return stepCards.map(card => {
                  const st = clearStepMap[card.key];
                  const isRunning = st.status === 'running';
                  const enabled = !isRunning && (!card.enabledAfter || clearStepMap[card.enabledAfter]?.status === 'success');
                  const borderColor = st.status === 'success' ? '#52c41a' : st.status === 'error' ? '#ff4d4f' : st.status === 'running' ? '#1677ff' : undefined;
                  const statusIcon = st.status === 'running' ? <LoadingOutlined style={{ color: '#1677ff' }} spin />
                    : st.status === 'success' ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    : st.status === 'error'   ? <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> : null;
                  return (
                    <Card key={card.key} size="small" style={{ marginBottom: 10, borderColor }}
                      title={
                        <Space size={4}>
                          <Tag color={card.methodColor} style={{ minWidth: 44, textAlign: 'center', margin: 0 }}>{card.method}</Tag>
                          <Text strong style={{ fontSize: 12 }}>Step {card.step}: {card.label}</Text>
                          {statusIcon}
                        </Space>
                      }
                      extra={
                        <Button size="small" type="primary"
                          style={card.key === 'patch' ? { background: REDWOOD.success, borderColor: REDWOOD.success } : undefined}
                          icon={isRunning ? <LoadingOutlined /> : <PlayCircleOutlined />}
                          loading={isRunning} disabled={!enabled} onClick={card.handler}
                        >
                          Run
                        </Button>
                      }
                    >
                      <code style={{ fontSize: 10, background: '#f0f0f0', padding: '2px 6px', borderRadius: 3, display: 'block', wordBreak: 'break-all', marginBottom: st.response || st.error ? 6 : 0 }}>{card.url}</code>
                      {st.error && <Alert type="error" message={st.error} style={{ marginTop: 6, fontSize: 11 }} showIcon />}
                      {st.response && (
                        <pre style={{ fontSize: 10, background: '#1e1e1e', color: st.status === 'error' ? '#f48771' : '#b5cea8', padding: 8, borderRadius: 4, margin: '6px 0 0', maxHeight: 120, overflowY: 'auto' }}>
                          {JSON.stringify(st.response, null, 2)}
                        </pre>
                      )}
                    </Card>
                  );
                });
              })(),
            }]}
          />
        </Modal>

      </Content>

      {/* ── Confirm Payment Modal ────────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <CheckCircleOutlined style={{ color: REDWOOD.primary }} />
            <span>Confirm Payment</span>
          </Space>
        }
        open={confirmPaymentOpen}
        onCancel={() => { if (!savePaymentLoading) setConfirmPaymentOpen(false); }}
        footer={null}
        width={580}
        destroyOnClose={false}
      >
        {/* Payment summary */}
        {(() => {
          const fv = createPaymentForm.getFieldsValue();
          return (
            <div style={{ background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 6, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                {[
                  ['Payee', fv.payee || '—'],
                  ['Payment Date', fv.paymentDate ? (fv.paymentDate.format ? fv.paymentDate.format('DD-MMM-YYYY') : fv.paymentDate) : '—'],
                  ['Amount', `${totalAppliedAmount.toLocaleString('en-AE', { minimumFractionDigits: 2 })} ${fv.paymentCurrency || 'AED'}`],
                  ['Business Unit', fv.businessUnit || '—'],
                  ['Bank Account', fv.disbursementBankAccount || '—'],
                  ['Invoices', `${invoicesToPay.length} invoice(s)`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <Text type="secondary" style={{ fontSize: 11 }}>{label}</Text>
                    <div><Text strong style={{ fontSize: 12 }}>{value}</Text></div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Create Accounting checkbox */}
        <div style={{ background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>
          <Checkbox
            checked={createAccountingChecked}
            onChange={e => setCreateAccountingChecked(e.target.checked)}
            disabled={savePaymentLoading}
          >
            <Text strong style={{ fontSize: 13 }}>Create Accounting</Text>
          </Checkbox>
          <div><Text type="secondary" style={{ fontSize: 11 }}>Automatically create SLA subledger entries and post to GL after payment is confirmed.</Text></div>
        </div>

        {/* Step progress (shown while/after running) */}
        {Object.values(confirmSteps).some(s => s.status !== 'idle') && (
          <div style={{ marginBottom: 16 }}>
            {(Object.entries(confirmSteps) as [ConfirmStepKey, ConfirmStep][])
              .filter(([key]) => key !== 'sla' && key !== 'gl' ? true : createAccountingChecked)
              .map(([key, s]) => {
                const icon = s.status === 'running' ? <LoadingOutlined style={{ color: '#1677ff' }} spin />
                  : s.status === 'success' ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  : s.status === 'error'   ? <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                  : <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: '#d9d9d9' }} />;
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                    <span style={{ marginTop: 2 }}>{icon}</span>
                    <div>
                      <Text style={{ fontSize: 12, color: s.status === 'success' ? '#52c41a' : s.status === 'error' ? '#ff4d4f' : s.status === 'running' ? '#1677ff' : '#6B6B6B' }}>{s.label}</Text>
                      {s.detail && <div><Text type="secondary" style={{ fontSize: 11 }}>{s.detail}</Text></div>}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Done confirmation */}
        {paymentConfirmed && !savePaymentLoading && (
          <Alert type="success" showIcon
            message={`Payment #${confirmedPaymentNumber} Confirmed`}
            description={createAccountingChecked ? 'Payment created and accounting posted to GL.' : 'Payment created successfully.'}
            style={{ marginBottom: 16 }}
          />
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button disabled={savePaymentLoading} onClick={() => setConfirmPaymentOpen(false)}>
            {paymentConfirmed ? 'Close' : 'Cancel'}
          </Button>
          {paymentConfirmed && confirmedCheckId && (
            <Button
              icon={<FileTextOutlined />}
              onClick={() => handleViewAccounting({
                key: String(confirmedCheckId),
                checkId: confirmedCheckId,
                paymentNumber: Number(confirmedPaymentNumber),
                paymentId: 0,
                paymentDocument: '',
                paymentStatus: 'NEGOTIABLE',
                reconciled: false,
                payee: '',
                paymentDate: '',
                paymentAmount: 0,
                paymentCurrency: 'AED',
                remitToAddress: '',
                remitToAccountNumber: '',
                businessUnit: form.getFieldValue('businessUnit') || '',
                legalEntity: '',
                paymentMethod: '',
                accountingStatus: '',
                paymentType: '',
                supplierNumber: '',
                payeeSite: '',
                disbursementBankAccount: '',
                paymentProcessProfile: '',
                voucherNumber: 0,
                documentCategory: '',
                documentSequence: '',
                withheldAmount: null,
                paymentReference: 0,
                paymentFileReference: 0,
                paymentProcessRequest: '',
                accountingDate: '',
                paymentDescription: '',
                conversionRate: null,
                conversionDate: '',
                conversionRateType: '',
                maturityDate: '',
                anticipatedValueDate: '',
                voidDate: '',
                voidAccountingDate: '',
                stopDate: '',
                stopReason: '',
                stopReference: '',
                thirdPartySupplier: '',
                currency: '',
              } as any)}
            >
              View Accounting
            </Button>
          )}
          {!paymentConfirmed && (
            <Button
              type="primary"
              danger
              loading={savePaymentLoading}
              icon={<CheckCircleOutlined />}
              style={{ background: REDWOOD.primary, borderColor: REDWOOD.primary }}
              onClick={handleConfirmPaymentSubmit}
            >
              {savePaymentLoading ? 'Processing…' : 'Confirm Payment'}
            </Button>
          )}
        </div>
      </Modal>

      {/* ── Payment Accounting Results Modal ─────────────────────────────── */}
      <Modal
        open={acctModalOpen}
        onCancel={() => setAcctModalOpen(false)}
        title={`Create Accounting — Payment ${acctPayment?.paymentNumber || acctPayment?.checkId || ''}`}
        footer={<Button onClick={() => setAcctModalOpen(false)}>Close</Button>}
        width={620}
      >
        {acctLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <LoadingOutlined style={{ fontSize: 28 }} />
            <p style={{ marginTop: 12, color: '#666' }}>Creating accounting journals…</p>
          </div>
        ) : (
          <Table
            size="small"
            pagination={false}
            dataSource={acctResults.map((r, i) => ({ ...r, key: i }))}
            columns={[
              { title: 'Invoice', dataIndex: 'invoiceNumber', key: 'invoiceNumber' },
              {
                title: 'Status',
                dataIndex: 'status',
                key: 'status',
                render: (v: string) => (
                  <Tag color={v === 'DRAFT' ? 'blue' : v === 'ALREADY POSTED' ? 'green' : 'red'}>{v}</Tag>
                ),
              },
              {
                title: 'Header ID',
                dataIndex: 'headerId',
                key: 'headerId',
                render: (v?: number) => v ?? '—',
              },
              {
                title: 'Error',
                dataIndex: 'error',
                key: 'error',
                render: (v?: string) => v ? <span style={{ color: 'red', fontSize: 11 }}>{v}</span> : '—',
              },
            ]}
          />
        )}
      </Modal>

      {/* View Accounting Modal */}
      <Modal
        title={`Accounting Entries — Payment ${viewAcctRecord?.paymentNumber ?? ''}`}
        open={viewAcctOpen}
        onCancel={() => setViewAcctOpen(false)}
        footer={
          viewAcctData?.found && viewAcctData.accountingStatus === 'DRAFT' ? (
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={slaActionLoading}
              onClick={handlePostToLedgerOpen}
            >
              Post Accounting
            </Button>
          ) : null
        }
        width={960}
      >
        {viewAcctLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
        ) : viewAcctData?.found ? (() => {
          const acctLineColumns = [
            { title: '#', dataIndex: 'lineNumber', width: 40 },
            { title: 'Type', dataIndex: 'lineType', width: 50, render: (v: string) => <Tag color={v === 'DR' ? 'blue' : 'green'}>{v}</Tag> },
            { title: 'Class', dataIndex: 'accountingClass', width: 120 },
            { title: 'Account', dataIndex: 'accountCombination', width: 170, render: (v: string, r: any) => (
              <div>
                <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v || '—'}</span>
                {r.accountDescription && <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>{r.accountDescription}</div>}
              </div>
            )},
            { title: 'Description', dataIndex: 'description', ellipsis: true },
            { title: 'Ent. Dr',  dataIndex: 'enteredDr',   width: 105, align: 'right' as const, render: (v: number) => v ? v.toLocaleString('en-US', { minimumFractionDigits: 2 }) : <span style={{ color: '#bbb' }}>—</span> },
            { title: 'Ent. Cr',  dataIndex: 'enteredCr',   width: 105, align: 'right' as const, render: (v: number) => v ? v.toLocaleString('en-US', { minimumFractionDigits: 2 }) : <span style={{ color: '#bbb' }}>—</span> },
            { title: 'Acc. Dr',  dataIndex: 'accountedDr', width: 105, align: 'right' as const, render: (v: number) => v ? v.toLocaleString('en-US', { minimumFractionDigits: 2 }) : <span style={{ color: '#bbb' }}>—</span> },
            { title: 'Acc. Cr',  dataIndex: 'accountedCr', width: 105, align: 'right' as const, render: (v: number) => v ? v.toLocaleString('en-US', { minimumFractionDigits: 2 }) : <span style={{ color: '#bbb' }}>—</span> },
            { title: 'CCY', dataIndex: 'currencyCode', width: 55 },
          ];
          const isVoid   = (code: string) => code?.includes('VOID') || code?.includes('void');
          const eventLabel = (code: string) =>
            isVoid(code) ? 'Void Reversal' : code?.includes('PAYMENT') ? 'Payment Accounting' : code || 'Accounting';

          // Show multi-event Collapse if multiple events; otherwise show flat view
          if (viewAcctAllEvents.length > 1) {
            return (
              <Collapse
                defaultActiveKey={viewAcctAllEvents.map(e => String(e.headerId))}
                style={{ background: 'transparent' }}
                items={viewAcctAllEvents.map(event => ({
                  key: String(event.headerId),
                  label: (
                    <Space>
                      <Tag color={isVoid(event.eventTypeCode) ? 'orange' : 'blue'} style={{ fontWeight: 600 }}>
                        {eventLabel(event.eventTypeCode)}
                      </Tag>
                      <Tag color={event.accountingStatus === 'POSTED' ? 'green' : event.accountingStatus === 'DRAFT' ? 'blue' : 'default'}>
                        {event.accountingStatus}
                      </Tag>
                      <span style={{ fontSize: 12, color: '#888' }}>{event.accountingDate}</span>
                      <span style={{ fontSize: 12, color: '#999' }}>Header #{event.headerId}</span>
                    </Space>
                  ),
                  children: (
                    <Table
                      size="small"
                      pagination={false}
                      dataSource={event.lines.map((l: any, i: number) => ({ ...l, key: i }))}
                      columns={acctLineColumns}
                    />
                  ),
                }))}
              />
            );
          }

          return (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Descriptions size="small" column={3} bordered>
                <Descriptions.Item label="Header ID">{viewAcctData.headerId}</Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag color={viewAcctData.accountingStatus === 'POSTED' ? 'green' : viewAcctData.accountingStatus === 'DRAFT' ? 'blue' : 'default'}>
                    {viewAcctData.accountingStatus}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Period">{viewAcctData.periodName}</Descriptions.Item>
                <Descriptions.Item label="Accounting Date">{viewAcctData.accountingDate}</Descriptions.Item>
                <Descriptions.Item label="Description" span={2}>{viewAcctData.description}</Descriptions.Item>
                {viewAcctData.postedDate && (
                  <Descriptions.Item label="Posted Date">{viewAcctData.postedDate}</Descriptions.Item>
                )}
              </Descriptions>
              <Table
                size="small"
                pagination={false}
                dataSource={(viewAcctData.lines || []).map((l, i) => ({ ...l, key: i }))}
                columns={acctLineColumns}
              />
            </Space>
          );
        })() : (
          <Alert message="No accounting entries found for this payment." type="info" />
        )}
      </Modal>

      {/* Post to Ledger Modal */}
      <Modal
        title={`Post to Ledger — Payment ${viewAcctRecord?.paymentNumber ?? ''} (SLA Header ${postModalHeadId})`}
        open={postModalOpen}
        onOk={handlePostToLedgerConfirm}
        onCancel={() => { setPostModalOpen(false); setPostGLResult(null); }}
        confirmLoading={slaActionLoading}
        okText="Post to GL"
        okButtonProps={{ type: 'primary', disabled: !postGLPayload || postGLFetchingLines || !!postGLResult?.success }}
        width={740}
      >
        {/* SLA Lines API row — always visible */}
        {postGLLinesUrl && (
          <div style={{ marginBottom: 10, padding: '6px 10px', background: REDWOOD.neutral100, borderRadius: 6, border: `1px solid ${REDWOOD.neutral200}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Tag color="green" style={{ fontSize: 11, margin: 0 }}>GET</Tag>
            <code style={{ fontSize: 11, flex: 1, wordBreak: 'break-all', color: REDWOOD.neutral900 }}>{postGLLinesUrl}</code>
            <Button
              size="small"
              icon={<ApiOutlined />}
              onClick={() => window.open(postGLLinesUrl, '_blank')}
              style={{ fontSize: 11, flexShrink: 0 }}
            >
              Open
            </Button>
            {postGLRawCount > 0 && (
              <span style={{ fontSize: 11, color: REDWOOD.neutral600, flexShrink: 0 }}>
                {postGLRawCount} raw → {postGLPayload?.lines?.length ?? 0} for header {postModalHeadId}
              </span>
            )}
          </div>
        )}

        {postGLFetchingLines ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin tip="Loading SLA lines…" /></div>
        ) : postGLResult ? (
          <Alert
            type={postGLResult.success ? 'success' : 'error'}
            message={postGLResult.success ? 'Posted to GL successfully' : 'Post failed'}
            description={
              <pre style={{ fontSize: 11, margin: 0, whiteSpace: 'pre-wrap' }}>
                {postGLResult.success ? JSON.stringify(postGLResult.data, null, 2) : postGLResult.error}
              </pre>
            }
          />
        ) : postGLPayload ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            {postGLPayload.lines?.length === 0 && (
              <Alert type="warning" message={`No SLA lines found for header ${postModalHeadId}. Check the GET endpoint above.`} />
            )}
            <div style={{ color: REDWOOD.warning, fontSize: 12 }}>
              ⚠ Once posted, the accounting entry will be locked and cannot be modified.
            </div>
            <div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>POST</Tag>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: REDWOOD.neutral900 }}>
                  {`${APEX_DB_CONFIG.baseUrl}/journals/create`}
                </span>
              </div>
              <pre style={{
                fontSize: 11, background: REDWOOD.neutral100,
                border: `1px solid ${REDWOOD.neutral200}`, borderRadius: 4,
                padding: '8px 10px', margin: 0, color: REDWOOD.neutral900,
                maxHeight: 360, overflowY: 'auto',
              }}>
                {JSON.stringify(postGLPayload, null, 2)}
              </pre>
            </div>
            <div style={{ fontSize: 11, color: REDWOOD.neutral600 }}>
              <ApiOutlined /> Step 2 (auto): <Tag color="blue" style={{ fontSize: 10 }}>POST</Tag>
              <code style={{ fontSize: 11 }}>{`${APEX_DB_CONFIG.baseUrl}/sla/accounting/post`}</code>
              {' '}— stamps returned GL IDs back on SLA header
            </div>
          </Space>
        ) : null}
      </Modal>

      <Autopilot module="ap" />
      <FloatingMenu />

      {/* ── Create Payment — API panel drawer ─────────────────────────────── */}
      <Drawer
        title={
          <Space>
            <ApiOutlined style={{ color: '#0572CE' }} />
            <span>Create Payment — API Panel</span>
            <Tag color="blue" style={{ fontSize: 11 }}>Same as Pay in Full</Tag>
          </Space>
        }
        open={apiPanelOpen}
        onClose={() => setApiPanelOpen(false)}
        width={680}
        styles={{ body: { padding: 16, background: '#fafafa' } }}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16, fontSize: 12 }}
          message="Execute steps in order: 1 → 2 → 3"
          description={
            <>
              Click Execute on each step. Step 1 response <code>checkId</code> is captured automatically and injected into the Step 3 body. Step 3 Execute button is locked until Step 1 succeeds.<br />
              <b>Step 1</b> — POST /ap/payments → create payment header, returns <code>checkId</code>.<br />
              <b>Step 2</b> — PUT /ap/createinvoice/installments → one call per pending installment (sets PaymentStatus=Fully Paid).<br />
              <b>Step 3</b> — POST /ap/payments/related-invoices → one call per invoice (links payment → invoice).
            </>
          }
        />

        {/* Step 1 */}
        {(() => {
          const step1Result = apiTestResults[1];
          const step1Loading = apiTestLoading[1] ?? false;
          const url1 = APEX_PAYMENTS_URL;
          return (
            <div style={{ border: `1px solid ${step1Result ? (step1Result.status === 'success' ? '#b7eb8f' : '#ffa39e') : '#d9d9d9'}`, borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', background: '#f5f5f5', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Space size={4} wrap>
                  <Tag color="green" style={{ fontSize: 11, margin: 0 }}>POST</Tag>
                  <Typography.Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{url1}</Typography.Text>
                </Space>
                <Space size={4}>
                  <Tooltip title="Copy URL">
                    <Button size="small" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(url1); message.success('URL copied'); }} />
                  </Tooltip>
                  <Button
                    size="small"
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    loading={step1Loading}
                    onClick={() => executeApiStep(1, url1, livePaymentPayload)}
                  >
                    Execute Step 1
                  </Button>
                </Space>
              </div>
              <div style={{ padding: '4px 12px 6px' }}>
                <Typography.Text style={{ fontSize: 11, color: '#888' }}>
                  Creates the payment record. <code>checkId</code> from the response is captured automatically for Step 2.
                  {apiStep1CheckId !== null && (
                    <span style={{ marginLeft: 8, color: '#52c41a', fontWeight: 600 }}>
                      ✓ CheckId captured: {apiStep1CheckId}
                    </span>
                  )}
                </Typography.Text>
              </div>
              <div style={{ padding: '0 12px 8px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', marginBottom: 4 }}>REQUEST BODY</div>
                <div style={{ position: 'relative' }}>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    style={{ position: 'absolute', top: 6, right: 6, zIndex: 1 }}
                    onClick={() => { navigator.clipboard.writeText(JSON.stringify(livePaymentPayload, null, 2)); message.success('JSON copied'); }}
                  />
                  <pre style={{ background: '#1e1e1e', color: '#d4d4d4', fontSize: 11, padding: 12, borderRadius: 6, margin: 0, maxHeight: 320, overflow: 'auto', fontFamily: 'monospace' }}>
                    {JSON.stringify(livePaymentPayload, null, 2)}
                  </pre>
                </div>
              </div>
              {step1Result && (
                <div style={{ padding: '0 12px 12px', borderTop: '1px solid #f0f0f0' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: step1Result.status === 'success' ? '#52c41a' : '#ff4d4f', margin: '8px 0 4px' }}>
                    {step1Result.status === 'success' ? '✅ RESPONSE' : '❌ ERROR'}
                  </div>
                  <pre style={{ background: step1Result.status === 'success' ? '#f6ffed' : '#fff2f0', border: `1px solid ${step1Result.status === 'success' ? '#b7eb8f' : '#ffccc7'}`, fontSize: 11, padding: 10, borderRadius: 6, margin: 0, maxHeight: 200, overflow: 'auto' }}>
                    {JSON.stringify(step1Result.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })()}

        {/* Step 2 — PUT installments per invoice */}
        {invoicesToPay.length > 0 && invoicesToPay.map((inv, idx) => {
          const stepKey = 100 + idx;
          const step2Result = apiTestResults[stepKey];
          const step2Loading = apiTestLoading[stepKey] ?? false;
          const instUrl = `${APEX_DB_CONFIG.baseUrl}/ap/createinvoice/installments`;
          const exampleBody = {
            '// call once per pending installment': '',
            '// AmountRemaining = installment.unpaid - amountApplied (0 if fully paid)': '',
            InvoiceId:       inv.invoiceId,
            InstallmentId:   '<fetched from GET installments>',
            PaymentStatus:   '<Fully Paid | Partially Paid>',
            AmountRemaining: '<unpaid balance after this payment>',
          };
          return (
            <div key={stepKey} style={{ border: `1px solid ${step2Result ? (step2Result.status === 'success' ? '#b7eb8f' : '#ffa39e') : '#d9d9d9'}`, borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', background: '#f5f5f5', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Space size={4} wrap>
                  <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>PUT</Tag>
                  <Typography.Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{instUrl}</Typography.Text>
                  <Tag style={{ fontSize: 10 }}>{inv.invoiceNumber}</Tag>
                </Space>
                <Button
                  size="small"
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  loading={step2Loading}
                  onClick={async () => {
                    setApiTestLoading(prev => ({ ...prev, [stepKey]: true }));
                    try {
                      const getRes = await fetch(`${instUrl}?P_INVOICE_ID=${inv.invoiceId}`, { headers: { Accept: 'application/json' } });
                      const instData = await getRes.json();
                      const allInst: any[] = instData.items || instData.installments || (Array.isArray(instData) ? instData : []);
                      const pending = allInst.filter(i => (i.amount_remaining ?? i.unpaid_amount ?? 1) > 0);
                      if (pending.length === 0) {
                        setApiTestResults(prev => ({ ...prev, [stepKey]: { status: 'success', data: { message: 'No pending installments found', total: allInst.length } } }));
                        return;
                      }
                      const results: Array<{ status: string; [key: string]: any }> = [];
                      let remainingApply = inv.applyAmount;
                      for (const inst of pending) {
                        if (remainingApply <= 0) break;
                        const instId = inst.installment_id?.toString() || inst.key;
                        const instUnpaid = Number(inst.amount_remaining ?? inst.unpaid_amount ?? inst.UNPAID_AMOUNT ?? 0);
                        const amountApplied = Math.min(remainingApply, instUnpaid);
                        const newUnpaid = Math.max(0, instUnpaid - amountApplied);
                        const newStatus = newUnpaid <= 0 ? 'Fully Paid' : 'Partially Paid';
                        remainingApply -= amountApplied;
                        const putRes = await fetch(instUrl, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                          body: JSON.stringify({ InvoiceId: inv.invoiceId, InstallmentId: instId, PaymentStatus: newStatus, AmountRemaining: newUnpaid }),
                        });
                        const d = await putRes.json().catch(() => ({}));
                        results.push({ instId, amountApplied, newUnpaid, newStatus, status: putRes.ok ? 'ok' : 'error', data: d });
                      }
                      setApiTestResults(prev => ({ ...prev, [stepKey]: { status: results.every(r => r.status === 'ok') ? 'success' : 'error', data: results } }));
                    } catch (e: any) {
                      setApiTestResults(prev => ({ ...prev, [stepKey]: { status: 'error', data: { error: e?.message } } }));
                    } finally {
                      setApiTestLoading(prev => ({ ...prev, [stepKey]: false }));
                    }
                  }}
                >
                  Execute Step 2
                </Button>
              </div>
              <div style={{ padding: '4px 12px 6px' }}>
                <Typography.Text style={{ fontSize: 11, color: '#888' }}>
                  Fetches installments for invoice <b>{inv.invoiceNumber}</b> (ID: {inv.invoiceId}), then PUTs each pending one as <b>Fully Paid</b>
                </Typography.Text>
              </div>
              <div style={{ padding: '0 12px 8px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', marginBottom: 4 }}>PUT BODY (per installment)</div>
                <div style={{ position: 'relative' }}>
                  <Button size="small" icon={<CopyOutlined />} style={{ position: 'absolute', top: 6, right: 6, zIndex: 1 }}
                    onClick={() => { navigator.clipboard.writeText(JSON.stringify(exampleBody, null, 2)); message.success('JSON copied'); }} />
                  <pre style={{ background: '#1e1e1e', color: '#d4d4d4', fontSize: 11, padding: 12, borderRadius: 6, margin: 0, maxHeight: 160, overflow: 'auto', fontFamily: 'monospace' }}>
                    {JSON.stringify(exampleBody, null, 2)}
                  </pre>
                </div>
              </div>
              {step2Result && (
                <div style={{ padding: '0 12px 12px', borderTop: '1px solid #f0f0f0' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: step2Result.status === 'success' ? '#52c41a' : '#ff4d4f', margin: '8px 0 4px' }}>
                    {step2Result.status === 'success' ? '✅ RESPONSE' : '❌ ERROR'}
                  </div>
                  <pre style={{ background: step2Result.status === 'success' ? '#f6ffed' : '#fff2f0', border: `1px solid ${step2Result.status === 'success' ? '#b7eb8f' : '#ffccc7'}`, fontSize: 11, padding: 10, borderRadius: 6, margin: 0, maxHeight: 200, overflow: 'auto' }}>
                    {JSON.stringify(step2Result.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}

        {/* Step 3 — POST /ap/payments/related-invoices per invoice */}
        {invoicesToPay.length > 0 && invoicesToPay.map((inv, idx) => {
          const stepKey = 200 + idx;
          const step3Result = apiTestResults[stepKey];
          const step3Loading = apiTestLoading[stepKey] ?? false;
          const relUrl = `${APEX_DB_CONFIG.baseUrl}/ap/payments/related-invoices`;
          const fv = createPaymentForm.getFieldsValue();
          const body3 = {
            InvoicePaymentId:          null,
            CheckId:                   apiStep1CheckId ?? '<checkId from Step 1>',
            InvoiceId:                 inv.invoiceId,
            InvoiceBusinessUnit:       fv.businessUnit || null,
            InvoiceNumber:             inv.invoiceNumber,
            InstallmentNumber:         inv.installmentNumber ?? null,
            AmountPaidPaymentCurrency: inv.applyAmount,
            AmountPaidInvoiceCurrency: inv.applyAmount,
            InvoicePaymentAmount:      inv.applyAmount,
            InvoiceAmount:             inv.invoiceAmount,
            InvoiceBaseAmount:         inv.invoiceAmount,
            PaymentBaseAmount:         inv.applyAmount,
            DiscountLost:              null,
            DiscountTaken:             inv.discountAmount || null,
            InvoiceCurrency:           inv.currency || fv.paymentCurrency || 'AED',
            CrossCurrencyRate:         fv.conversionRate || null,
            InvoicePaymentStatus:      'Negotiable',
            CreatedBy:                 null,
            LastUpdatedBy:             null,
            LastUpdateLogin:           null,
          };
          const locked = apiStep1CheckId === null;
          return (
            <div key={stepKey} style={{ border: `1px solid ${step3Result ? (step3Result.status === 'success' ? '#b7eb8f' : '#ffa39e') : '#d9d9d9'}`, borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', background: '#f5f5f5', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Space size={4} wrap>
                  <Tag color="green" style={{ fontSize: 11, margin: 0 }}>POST</Tag>
                  <Typography.Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{relUrl}</Typography.Text>
                  <Tag style={{ fontSize: 10 }}>{inv.invoiceNumber}</Tag>
                </Space>
                <Tooltip title={locked ? 'Execute Step 1 first to get CheckId' : ''}>
                  <Button
                    size="small"
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    loading={step3Loading}
                    disabled={locked}
                    onClick={() => executeApiStep(stepKey, relUrl, body3)}
                  >
                    Execute Step 3
                  </Button>
                </Tooltip>
              </div>
              <div style={{ padding: '4px 12px 6px' }}>
                <Typography.Text style={{ fontSize: 11, color: '#888' }}>
                  Links payment to invoice <b>{inv.invoiceNumber}</b> — CheckId auto-filled after Step 1
                  {locked && <span style={{ color: '#faad14', marginLeft: 8 }}>⚠ Execute Step 1 first</span>}
                </Typography.Text>
              </div>
              <div style={{ padding: '0 12px 8px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', marginBottom: 4 }}>REQUEST BODY</div>
                <div style={{ position: 'relative' }}>
                  <Button size="small" icon={<CopyOutlined />} style={{ position: 'absolute', top: 6, right: 6, zIndex: 1 }}
                    onClick={() => { navigator.clipboard.writeText(JSON.stringify(body3, null, 2)); message.success('JSON copied'); }} />
                  <pre style={{ background: '#1e1e1e', color: '#d4d4d4', fontSize: 11, padding: 12, borderRadius: 6, margin: 0, maxHeight: 260, overflow: 'auto', fontFamily: 'monospace' }}>
                    {JSON.stringify(body3, null, 2)}
                  </pre>
                </div>
              </div>
              {step3Result && (
                <div style={{ padding: '0 12px 12px', borderTop: '1px solid #f0f0f0' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: step3Result.status === 'success' ? '#52c41a' : '#ff4d4f', margin: '8px 0 4px' }}>
                    {step3Result.status === 'success' ? '✅ RESPONSE' : '❌ ERROR'}
                  </div>
                  <pre style={{ background: step3Result.status === 'success' ? '#f6ffed' : '#fff2f0', border: `1px solid ${step3Result.status === 'success' ? '#b7eb8f' : '#ffccc7'}`, fontSize: 11, padding: 10, borderRadius: 6, margin: 0, maxHeight: 200, overflow: 'auto' }}>
                    {JSON.stringify(step3Result.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}

        {invoicesToPay.length === 0 && (
          <Alert type="warning" showIcon message="Add invoices to the payment to see Step 2 & 3 calls" style={{ fontSize: 12 }} />
        )}
      </Drawer>

      {/* Account selector for missing cash / PDC combinations in Bank Details */}
      <AccountSelector
        visible={bankAcctSelectorField !== null}
        onCancel={() => setBankAcctSelectorField(null)}
        onSelect={(code: string) => {
          if (bankAcctSelectorField === 'cash') setBankAcctCashOverride(code);
          else if (bankAcctSelectorField === 'pdc') setBankAcctPdcOverride(code);
          setBankAcctSelectorField(null);
        }}
        initialValue={
          bankAcctSelectorField === 'cash'
            ? (bankAcctCashOverride || selectedBankAccount?.cashAccountCombination || '')
            : (bankAcctPdcOverride  || selectedBankAccount?.pdcAccountCombination  || '')
        }
      />

      <Autopilot module="ap" />
      <FloatingMenu />
    </Layout>
  );
};

export default ManagePayments;
