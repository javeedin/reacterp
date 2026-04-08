import React, { useState, useCallback, useRef } from 'react';
import {
  Layout,
  Card,
  Form,
  Select,
  Input,
  Button,
  Space,
  Typography,
  Progress,
  Table,
  Tag,
  Row,
  Col,
  Divider,
  Alert,
  Breadcrumb,
  Tooltip,
  Modal,
  Checkbox,
  Switch,
} from 'antd';
import {
  SyncOutlined,
  PlayCircleOutlined,
  StopOutlined,
  HomeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  ApiOutlined,
  CopyOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  UnorderedListOutlined,
  ThunderboltOutlined,
  ExpandOutlined,
  DownloadOutlined,
  SendOutlined,
  BugOutlined,
  BankOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  ClockCircleOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { SYNC_OBJECTS, PROXY_CONFIG, APEX_DB_CONFIG, type SyncObjectConfig, type ApiType } from '../../config/api.config';
import { syncGLJournals, syncGLBatchesOnly, syncGLHeadersOnly, syncGLLinesOnly, testGLConnection, fetchGLJournalBatches, processSingleGLBatch, type SyncProgress, type BatchOnlySyncProgress, type HeadersOnlySyncProgress, type LinesOnlySyncProgress, type LogCallback, type BatchPayloadCallback, type SingleBatchResult } from '../../services/gl-sync.service';
import { syncAPInvoices, testAPConnection, type APSyncProgress, type InvoicePayloadCallback } from '../../services/ap-sync.service';
import { syncAPPayments, testAPPaymentsConnection, type APPaymentsSyncProgress, type PaymentPayloadCallback } from '../../services/ap-payments-sync.service';
import { syncGLCodeCombinations, testGLCodeCombConnection, type CodeCombSyncProgress, type CodeCombPayloadCallback } from '../../services/gl-codecomb-sync.service';
import { syncGLPeriodStatus, testGLPeriodStatusConnection, type PeriodStatusSyncProgress, type PeriodStatusPayloadCallback } from '../../services/gl-periodstatus-sync.service';
import { syncBanks, testBanksConnection, type BanksSyncProgress, type BanksPayloadCallback } from '../../services/banks-sync.service';
import { syncBankBranches, testBankBranchesConnection, type BankBranchesSyncProgress, type BankBranchesPayloadCallback } from '../../services/bank-branches-sync.service';
import { syncBankAccounts, testBankAccountsConnection, type BankAccountsSyncProgress, type BankAccountsPayloadCallback } from '../../services/bank-accounts-sync.service';
import { syncBankAccountTransfers, testBankAccountTransfersConnection, type BankAccountTransfersSyncProgress, type BankAccountTransfersPayloadCallback } from '../../services/bank-account-transfers-sync.service';
import { syncExternalCashTransactions, testExternalCashTransactionsConnection, type ExternalCashTransactionsSyncProgress } from '../../services/external-cash-transactions-sync.service';
import { syncLegalEntities, testLegalEntitiesConnection, type LegalEntitiesSyncProgress, type LegalEntitiesPayloadCallback } from '../../services/legal-entities-sync.service';
import { syncBusinessUnits, testBusinessUnitsConnection, type BusinessUnitsSyncProgress } from '../../services/business-units-sync.service';
import { syncUserAccounts, testUserAccountsConnection, type UserAccountsSyncProgress, type UserAccountsPayloadCallback } from '../../services/user-accounts-sync.service';
import { syncUserAccountRoles, testUserAccountRolesConnection, type UserAccountRolesSyncProgress, type UserAccountRolesPayloadCallback } from '../../services/user-account-roles-sync.service';
import { syncRoles, testRolesConnection, type RolesSyncProgress, type RolesPayloadCallback } from '../../services/roles-sync.service';
import { syncSuppliers, testSuppliersConnection, type SuppliersSyncProgress, type SuppliersPayloadCallback } from '../../services/suppliers-sync.service';
import { syncSupplierAddresses, testSupplierAddressConnection, type SupplierAddressSyncProgress, type SupplierAddressPayloadCallback } from '../../services/supplier-address-sync.service';
import { syncSupplierSites, testSupplierSitesConnection, type SupplierSitesSyncProgress, type SupplierSitesPayloadCallback } from '../../services/supplier-sites-sync.service';
import { syncSiteAssignments, testSiteAssignmentsConnection, type SiteAssignmentsSyncProgress, type SiteAssignmentsPayloadCallback } from '../../services/supplier-site-assignments-sync.service';
import { syncGLBalances, testGLBalancesConnection, type GLBalancesSyncProgress, type BalancePayloadCallback, type GLBalanceRecord } from '../../services/gl-balances-sync.service';
import { useSyncWorker, type WorkerSyncProgress, type WorkerLog } from '../../hooks/useSyncWorker';
import Autopilot from '../../components/Autopilot';
import { useElectron, useElectronBackgroundSync } from '../../hooks/useElectron';

// Icon imports for AP
import { FileSearchOutlined, BranchesOutlined, ScheduleOutlined } from '@ant-design/icons';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

const SYNC_VERSION = '2.1.0'; // Added proxy status check

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',      // Oracle Red
  primaryDark: '#A33B2C',  // Darker red
  success: '#1D7B4D',      // Green
  warning: '#D4A800',      // Amber
  error: '#C74634',        // Red
  info: '#0572CE',         // Blue
  neutral: '#383838',      // Dark gray
  surface: '#FFFFFF',
  surfaceSecondary: '#F7F7F7',
  border: '#E5E5E5',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B6B6B',
};

interface SyncLog {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning' | 'step';
  message: string;
}

// Interface for batch payload debugging
interface BatchPayloadLog {
  batchId: number;
  batchName: string;
  payload: any;
  postResult?: any;
  status: 'pending' | 'success' | 'error';
  errorMessage?: string;
}

// Interface for invoice payload debugging
interface InvoicePayloadLog {
  invoiceId: number;
  invoiceNumber: string;
  payload: any;
  postResult?: any;
  status: 'pending' | 'success' | 'error';
  errorMessage?: string;
  // Lines info
  linesFetched: number;
  linesInserted: number;
  linesError?: string;
}

// Interface for payment payload debugging
interface PaymentPayloadLog {
  checkId: number;
  paymentNumber: string;
  payload: any;
  postResult?: any;
  status: 'pending' | 'success' | 'error';
  errorMessage?: string;
  // Related invoices info
  relatedInvoicesFetched: number;
  relatedInvoicesInserted: number;
  relatedInvoicesError?: string;
}

// Proxy status type
type ProxyStatus = 'unknown' | 'checking' | 'online' | 'offline';

// Interface for All Suppliers batch sync
interface SupplierSyncItem {
  supplierNumber: string;
  supplierName: string;
  status: 'pending' | 'syncing' | 'done' | 'error';
  invoicesInserted: number;
  paymentsInserted: number;
  errors: number;
  errorMsg?: string;
  // Live progress
  currentStep?: 'inv-fetch' | 'inv-insert' | 'pay-fetch' | 'pay-insert';
  invTotal?: number;
  invProcessed?: number;
  payTotal?: number;
  payProcessed?: number;
}

// Single-supplier sync progress popup item
interface SingleSupplierSyncItem {
  key: string;
  label: string;
  status: 'pending' | 'syncing' | 'done' | 'error' | 'skipped';
  step?: string;         // 'Fetching' | 'Inserting'
  total?: number;
  processed?: number;
  inserted: number;
  errors: number;
  errorMsg?: string;
}

// Batch list modal item (for two-phase GL Journal sync)
interface BatchListItem {
  batchId: number;
  batchName: string;
  raw: any;
  status: 'pending' | 'syncing' | 'done' | 'error';
  headersCount: number;
  linesCount: number;
  headersInserted: number;
  linesInserted: number;
  errorMsg?: string;
}

const SyncData: React.FC = () => {
  const [form] = Form.useForm();
  const [selectedObject, setSelectedObject] = useState<SyncObjectConfig | null>(null);
  const [, setApiType] = useState<ApiType>('REST');

  // API-driven select options cache: paramKey → { loading, items }
  const [apiSelectOptions, setApiSelectOptions] = useState<Record<string, { loading: boolean; items: { label: string; value: string; subLabel?: string; count?: number }[] }>>({});
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testMode, setTestMode] = useState<boolean | 'single'>(true); // true=25, false=full, 'single'=1
  const [useBackgroundWorker, setUseBackgroundWorker] = useState(false); // Run sync in Web Worker
  const [verboseConsole, setVerboseConsole] = useState(false); // Show logs in browser console
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus>('unknown');
  const [proxyError, setProxyError] = useState<string>('');
  const [logDetailVisible, setLogDetailVisible] = useState(false);
  const [selectedLog, setSelectedLog] = useState<SyncLog | null>(null);
  const [batchPayloads, setBatchPayloads] = useState<BatchPayloadLog[]>([]);
  const [batchDebugVisible, setBatchDebugVisible] = useState(false);
  const [selectedBatchPayload, setSelectedBatchPayload] = useState<BatchPayloadLog | null>(null);
  const [isPostingBatch, setIsPostingBatch] = useState(false);

  // Invoice payload state (for AP Invoices debug)
  const [invoicePayloads, setInvoicePayloads] = useState<InvoicePayloadLog[]>([]);
  const [invoiceDebugVisible, setInvoiceDebugVisible] = useState(false);
  const [selectedInvoicePayload, setSelectedInvoicePayload] = useState<InvoicePayloadLog | null>(null);
  const [isPostingInvoice, setIsPostingInvoice] = useState(false);

  // Payment payload state (for AP Payments debug - reserved for future use)
  const [, setPaymentPayloads] = useState<PaymentPayloadLog[]>([]);

  // Electron notifications and background sync
  const {
    isElectron: isRunningInElectron,
    isBackgroundSyncSupported: _isElectronBgSyncSupported,
    notifySyncStarted,
    notifySyncCompleted,
    notifySyncError,
    notifySyncProgress
  } = useElectron();
  const [useElectronBackground, setUseElectronBackground] = useState(false);

  // GL Progress State
  const [progress, setProgress] = useState<SyncProgress>({
    status: 'idle',
    totalBatches: 0,
    processedBatches: 0,
    currentBatchId: null,
    currentBatchName: '',
    totalHeaders: 0,
    processedHeaders: 0,
    currentHeaderId: null,
    currentHeaderName: '',
    totalLines: 0,
    processedLines: 0,
    totalBatchesInserted: 0,
    totalHeadersInserted: 0,
    totalLinesInserted: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // AP Progress State
  const [apProgress, setApProgress] = useState<APSyncProgress>({
    status: 'idle',
    totalInvoices: 0,
    processedInvoices: 0,
    insertedInvoices: 0,
    currentInvoiceNumber: '',
    totalHeaders: 0,
    processedHeaders: 0,
    totalLines: 0,
    processedLines: 0,
    totalDistributions: 0,
    processedDistributions: 0,
    totalInstallments: 0,
    processedInstallments: 0,
    currentPage: 0,
    totalPages: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // AP Payments Progress State
  const [apPaymentsProgress, setApPaymentsProgress] = useState<APPaymentsSyncProgress>({
    status: 'idle',
    totalPayments: 0,
    processedPayments: 0,
    insertedPayments: 0,
    currentPaymentNumber: '',
    totalRelatedInvoices: 0,
    processedRelatedInvoices: 0,
    currentPage: 0,
    totalPages: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // GL Code Combinations Progress State
  const [codeCombProgress, setCodeCombProgress] = useState<CodeCombSyncProgress>({
    status: 'idle',
    totalRecords: 0,
    processedRecords: 0,
    insertedRecords: 0,
    currentPage: 0,
    totalPages: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // Code Combination payload state (for debug)
  const [_codeCombPayloads, setCodeCombPayloads] = useState<Array<{
    ccId: number;
    concatenatedSegments: string;
    payload: any;
    postResult?: any;
    status: 'pending' | 'success' | 'error';
    errorMessage?: string;
  }>>([]);

  // GL Period Status Progress State
  const [periodStatusProgress, setPeriodStatusProgress] = useState<PeriodStatusSyncProgress>({
    status: 'idle',
    totalRecords: 0,
    processedRecords: 0,
    insertedRecords: 0,
    currentPage: 0,
    totalPages: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // Period Status payload state (for debug)
  const [_periodStatusPayloads, setPeriodStatusPayloads] = useState<Array<{
    periodNameId: string;
    ledgerId: number;
    payload: any;
    postResult?: any;
    status: 'pending' | 'success' | 'error';
    errorMessage?: string;
  }>>([]);

  // Banks Progress State
  const [banksProgress, setBanksProgress] = useState<BanksSyncProgress>({
    status: 'idle',
    totalRecords: 0,
    processedRecords: 0,
    insertedRecords: 0,
    currentPage: 0,
    totalPages: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // Banks payload state (for debug)
  const [_banksPayloads, setBanksPayloads] = useState<Array<{
    bankPartyId: number;
    bankName: string;
    payload: any;
    postResult?: any;
    status: 'pending' | 'success' | 'error';
    errorMessage?: string;
  }>>([]);

  // Bank Branches Progress State
  const [bankBranchesProgress, setBankBranchesProgress] = useState<BankBranchesSyncProgress>({
    status: 'idle',
    totalRecords: 0,
    processedRecords: 0,
    insertedRecords: 0,
    currentPage: 0,
    totalPages: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // Bank Branches payload state (for debug)
  const [_bankBranchesPayloads, setBankBranchesPayloads] = useState<Array<{
    branchPartyId: number;
    branchName: string;
    payload: any;
    postResult?: any;
    status: 'pending' | 'success' | 'error';
    errorMessage?: string;
  }>>([]);

  // Bank Accounts Progress State
  const [bankAccountsProgress, setBankAccountsProgress] = useState<BankAccountsSyncProgress>({
    status: 'idle',
    totalRecords: 0,
    processedRecords: 0,
    insertedRecords: 0,
    currentPage: 0,
    totalPages: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // Bank Accounts payload state (for debug)
  const [_bankAccountsPayloads, setBankAccountsPayloads] = useState<Array<{
    bankAccountId: number;
    accountName: string;
    payload: any;
    postResult?: any;
    status: 'pending' | 'success' | 'error';
    errorMessage?: string;
  }>>([]);

  // Bank Account Transfers Progress State
  const [bankAccountTransfersProgress, setBankAccountTransfersProgress] = useState<BankAccountTransfersSyncProgress>({
    status: 'idle',
    totalRecords: 0,
    processedRecords: 0,
    insertedRecords: 0,
    currentPage: 0,
    totalPages: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  const [_bankAccountTransfersPayloads, setBankAccountTransfersPayloads] = useState<Array<{
    transferId: number;
    transferNumber: number;
    payload: any;
    postResult?: any;
    status: 'pending' | 'success' | 'error';
    errorMessage?: string;
  }>>([]);

  // External Cash Transactions Progress State
  const [externalCashTxnProgress, setExternalCashTxnProgress] = useState<ExternalCashTransactionsSyncProgress>({
    status: 'idle',
    totalRecords: 0,
    processedRecords: 0,
    insertedRecords: 0,
    currentPage: 0,
    totalPages: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // Legal Entities Progress State
  const [legalEntitiesProgress, setLegalEntitiesProgress] = useState<LegalEntitiesSyncProgress>({
    status: 'idle',
    totalRecords: 0,
    processedRecords: 0,
    insertedRecords: 0,
    currentPage: 0,
    totalPages: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // Business Units Progress State
  const [businessUnitsProgress, setBusinessUnitsProgress] = useState<BusinessUnitsSyncProgress>({
    status: 'idle',
    totalRecords: 0,
    processedRecords: 0,
    insertedRecords: 0,
    currentPage: 0,
    totalPages: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // Legal Entities payload state (for debug)
  const [_legalEntitiesPayloads, setLegalEntitiesPayloads] = useState<Array<{
    legalEntityId: number;
    name: string;
    payload: any;
    postResult?: any;
    status: 'pending' | 'success' | 'error';
    errorMessage?: string;
  }>>([]);

  // User Accounts Progress State
  const [userAccountsProgress, setUserAccountsProgress] = useState<UserAccountsSyncProgress>({
    status: 'idle',
    totalRecords: 0,
    processedRecords: 0,
    insertedRecords: 0,
    currentPage: 0,
    totalPages: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // User Accounts payload state (for debug)
  const [_userAccountsPayloads, setUserAccountsPayloads] = useState<Array<{
    userId: number;
    username: string;
    payload: any;
    postResult?: any;
    status: 'pending' | 'success' | 'error';
    errorMessage?: string;
  }>>([]);

  // User Account Roles Progress State
  const [userAccountRolesProgress, setUserAccountRolesProgress] = useState<UserAccountRolesSyncProgress>({
    status: 'idle',
    totalUsers: 0,
    processedUsers: 0,
    totalRoles: 0,
    insertedRoles: 0,
    currentPage: 0,
    totalPages: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // User Account Roles payload state (for debug)
  const [_userAccountRolesPayloads, setUserAccountRolesPayloads] = useState<Array<{
    userId: number;
    username: string;
    rolesCount: number;
    payload: any;
    postResult?: any;
    status: 'pending' | 'success' | 'error';
    errorMessage?: string;
  }>>([]);

  // Roles Progress State
  const [rolesProgress, setRolesProgress] = useState<RolesSyncProgress>({
    status: 'idle',
    totalRecords: 0,
    processedRecords: 0,
    insertedRecords: 0,
    currentPage: 0,
    totalPages: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // Roles payload state (for debug)
  const [_rolesPayloads, setRolesPayloads] = useState<Array<{
    roleId: number;
    roleName: string;
    payload: any;
    postResult?: any;
    status: 'pending' | 'success' | 'error';
    errorMessage?: string;
  }>>([]);

  // Suppliers Progress State
  const [suppliersProgress, setSuppliersProgress] = useState<SuppliersSyncProgress>({
    status: 'idle',
    totalRecords: 0,
    processedRecords: 0,
    insertedRecords: 0,
    currentPage: 0,
    totalPages: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // Suppliers payload state (for debug)
  const [_suppliersPayloads, setSuppliersPayloads] = useState<Array<{
    supplierId: number;
    supplierName: string;
    payload: any;
    postResult?: any;
    status: 'pending' | 'success' | 'error';
    errorMessage?: string;
  }>>([]);

  // Supplier Address Progress State
  const [supplierAddressProgress, setSupplierAddressProgress] = useState<SupplierAddressSyncProgress>({
    status: 'idle',
    totalSuppliers: 0,
    processedSuppliers: 0,
    totalAddresses: 0,
    insertedAddresses: 0,
    currentSupplier: '',
    currentSupplierId: null,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // Supplier Address payload state (for debug)
  const [_supplierAddressPayloads, setSupplierAddressPayloads] = useState<Array<{
    supplierId: number;
    supplierName: string;
    addressCount: number;
    payload: any;
    postResult?: any;
    status: 'pending' | 'success' | 'error';
    errorMessage?: string;
  }>>([]);

  // Supplier Sites Progress State
  const [supplierSitesProgress, setSupplierSitesProgress] = useState<SupplierSitesSyncProgress>({
    status: 'idle',
    totalSuppliers: 0,
    processedSuppliers: 0,
    totalSites: 0,
    insertedSites: 0,
    currentSupplier: '',
    currentSupplierId: null,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // Supplier Sites payload state (for debug)
  const [_supplierSitesPayloads, setSupplierSitesPayloads] = useState<Array<{
    supplierId: number;
    supplierName: string;
    siteCount: number;
    payload: any;
    postResult?: any;
    status: 'pending' | 'success' | 'error';
    errorMessage?: string;
  }>>([]);

  // Site Assignments Progress State
  const [siteAssignmentsProgress, setSiteAssignmentsProgress] = useState<SiteAssignmentsSyncProgress>({
    status: 'idle',
    totalSites: 0,
    processedSites: 0,
    totalAssignments: 0,
    insertedAssignments: 0,
    currentSite: '',
    currentSiteId: null,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // Site Assignments payload state (for debug)
  const [_siteAssignmentsPayloads, setSiteAssignmentsPayloads] = useState<Array<{
    siteId: number;
    siteName: string;
    assignmentCount: number;
    payload: any;
    postResult?: any;
    status: 'pending' | 'success' | 'error';
    errorMessage?: string;
  }>>([]);

  // GL Batches Only Progress State
  const [glBatchesOnlyProgress, setGLBatchesOnlyProgress] = useState<BatchOnlySyncProgress>({
    status: 'idle',
    totalBatches: 0,
    fetchedBatches: 0,
    insertedBatches: 0,
    currentPage: 0,
    totalPages: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // GL Headers Only Progress State
  const [glHeadersOnlyProgress, setGLHeadersOnlyProgress] = useState<HeadersOnlySyncProgress>({
    status: 'idle',
    totalBatches: 0,
    processedBatches: 0,
    currentBatchId: null,
    totalHeaders: 0,
    insertedHeaders: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // GL Lines Only Progress State
  const [glLinesOnlyProgress, setGLLinesOnlyProgress] = useState<LinesOnlySyncProgress>({
    status: 'idle',
    totalHeaders: 0,
    processedHeaders: 0,
    currentHeaderId: null,
    currentBatchId: null,
    totalLines: 0,
    insertedLines: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // ── Chain GL Sync state ───────────────────────────────────────────────────
  const [chainGLEnabled, setChainGLEnabled] = useState(false);
  type ChainStepStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped';
  interface ChainGLStatus {
    batches:  ChainStepStatus;
    headers:  ChainStepStatus;
    lines:    ChainStepStatus;
    balances: ChainStepStatus;
    batchesInserted:  number;
    headersInserted:  number;
    linesInserted:    number;
    balancesInserted: number;
    batchesErrors:  number;
    headersErrors:  number;
    linesErrors:    number;
    balancesErrors: number;
    visible: boolean;
  }
  const [chainStatus, setChainStatus] = useState<ChainGLStatus>({
    batches: 'idle', headers: 'idle', lines: 'idle', balances: 'idle',
    batchesInserted: 0, headersInserted: 0, linesInserted: 0, balancesInserted: 0,
    batchesErrors: 0,  headersErrors: 0,  linesErrors: 0,  balancesErrors: 0,
    visible: false,
  });
  const [glBalancesProgress, setGLBalancesProgress] = useState<GLBalancesSyncProgress>({
    status: 'idle',
    totalRecords: 0,
    processedRecords: 0,
    insertedRecords: 0,
    updatedRecords: 0,
    errors: 0,
    lastError: '',
    startTime: null,
    endTime: null,
  });

  // GL Balances payload state (for debug)
  const [_glBalancesPayloads, setGLBalancesPayloads] = useState<Array<{
    batchNum: number;
    recordCount: number;
    payload: GLBalanceRecord[];
    postResult?: any;
    status: 'pending' | 'success' | 'error';
    errorMessage?: string;
  }>>([]);

  // Determine sync type based on selected object
  const isAPInvoices = selectedObject?.id === 'ap-invoices';
  const isAPPayments = selectedObject?.id === 'ap-payments';
  const isGLCodeComb = selectedObject?.id === 'gl-code-combinations';
  const isGLPeriodStatus = selectedObject?.id === 'gl-period-status';
  const isBanks = selectedObject?.id === 'banks';
  const isBankBranches = selectedObject?.id === 'bank-branches';
  const isBankAccounts = selectedObject?.id === 'bank-accounts';
  const isBankAccountTransfers = selectedObject?.id === 'bank-account-transfers';
  const isExternalCashTxn = selectedObject?.id === 'external-cash-transactions';
  const isLegalEntities = selectedObject?.id === 'legal-entities';
  const isBusinessUnits = selectedObject?.id === 'business-units';
  const isUserAccounts = selectedObject?.id === 'user-accounts';
  const isUserAccountRoles = selectedObject?.id === 'user-account-roles';
  const isRoles = selectedObject?.id === 'roles';
  const isSuppliers = selectedObject?.id === 'suppliers';
  const isSupplierAddresses = selectedObject?.id === 'supplier-addresses';
  const isSupplierSites = selectedObject?.id === 'supplier-sites';
  const isSiteAssignments = selectedObject?.id === 'supplier-site-assignments';
  const isGLBatchesOnly = selectedObject?.id === 'gl-batches-only';
  const isGLHeadersOnly = selectedObject?.id === 'gl-headers-only';
  const isGLLinesOnly = selectedObject?.id === 'gl-lines-only';
  const isGLBalances  = selectedObject?.id === 'gl-balances-soap';
  const isGLJournals  = selectedObject?.id === 'gl-journal-batches';

  // Web Worker for background sync
  const handleWorkerProgress = useCallback((progress: WorkerSyncProgress) => {
    if (isSupplierAddresses) {
      setSupplierAddressProgress((prev) => ({
        ...prev,
        status: progress.status as any,
        totalSuppliers: progress.totalSuppliers,
        processedSuppliers: progress.processedSuppliers,
        totalAddresses: progress.totalAddresses,
        insertedAddresses: progress.insertedAddresses,
        currentSupplier: progress.currentSupplier,
        currentSupplierId: progress.currentSupplierId,
        errors: progress.errors,
        lastError: progress.lastError,
        startTime: progress.startTime ? new Date(progress.startTime) : null,
        endTime: progress.endTime ? new Date(progress.endTime) : null,
      }));
    }
  }, [isSupplierAddresses]);

  const handleWorkerLog = useCallback((log: WorkerLog) => {
    setLogs((prev) => [log, ...prev].slice(0, 500));
  }, []);

  const handleWorkerComplete = useCallback((result: WorkerSyncProgress) => {
    isSyncingRef.current = false;
    const syncType = isSupplierAddresses ? 'supplier addresses' : 'data';
    addLog('success', `Background sync completed: ${result.insertedAddresses} ${syncType} inserted`);
  }, [isSupplierAddresses]);

  const handleWorkerError = useCallback((error: string) => {
    isSyncingRef.current = false;
    addLog('error', `Background sync failed: ${error}`);
  }, []);

  const {
    isSupported: isWorkerSupported,
    isRunning: isWorkerRunning,
    startSync: startWorkerSync,
    stopSync: stopWorkerSync,
  } = useSyncWorker({
    onProgress: handleWorkerProgress,
    onLog: handleWorkerLog,
    onComplete: handleWorkerComplete,
    onError: handleWorkerError,
  });

  // Electron background sync callbacks
  const handleElectronProgress = useCallback((progress: any) => {
    if (isSupplierAddresses) {
      setSupplierAddressProgress((prev) => ({
        ...prev,
        status: progress.status as any,
        totalSuppliers: progress.totalSuppliers ?? prev.totalSuppliers,
        processedSuppliers: progress.processedSuppliers ?? prev.processedSuppliers,
        totalAddresses: progress.totalAddresses ?? prev.totalAddresses,
        insertedAddresses: progress.insertedAddresses ?? prev.insertedAddresses,
        currentSupplier: progress.currentSupplier ?? prev.currentSupplier,
        errors: progress.errors ?? prev.errors,
      }));
    }
  }, [isSupplierAddresses]);

  const handleElectronLog = useCallback((log: any) => {
    const syncLog = {
      id: `electron-${Date.now()}`,
      timestamp: new Date(log.timestamp || Date.now()),
      type: log.type as any,
      message: log.message,
    };
    setLogs((prev) => [syncLog, ...prev].slice(0, 500));
  }, []);

  const handleElectronComplete = useCallback((result: any) => {
    isSyncingRef.current = false;
    addLog('success', `Electron background sync completed: ${result.insertedRecords} records in ${result.duration}s`);
    notifySyncCompleted(`Sync completed: ${result.insertedRecords} records`);
  }, [notifySyncCompleted]);

  const handleElectronError = useCallback((error: string) => {
    isSyncingRef.current = false;
    addLog('error', `Electron background sync failed: ${error}`);
    notifySyncError(error);
  }, [notifySyncError]);

  const {
    isSupported: isElectronSyncSupported,
    startSync: startElectronSync,
    stopSync: stopElectronSync,
  } = useElectronBackgroundSync(
    handleElectronProgress,
    handleElectronLog,
    handleElectronComplete,
    handleElectronError
  );

  const abortControllerRef = useRef<AbortController | null>(null);
  const isSyncingRef = useRef(false);

  // Batch list modal state (two-phase GL Journal sync)
  const [glSyncMode,     setGlSyncMode]     = useState<'chain' | 'batch-popup'>('chain');
  const [batchListOpen,  setBatchListOpen]  = useState(false);
  const [batchList,      setBatchList]      = useState<BatchListItem[]>([]);
  const [batchSyncing,   setBatchSyncing]   = useState(false);
  const batchAbortRef = useRef<AbortController | null>(null);

  // ── AP Invoices chain + All Suppliers state ───────────────────────────────
  const [chainAPPayments, setChainAPPayments] = useState(false);
  const [singleSyncOpen,  setSingleSyncOpen]  = useState(false);
  const [singleSyncItems, setSingleSyncItems] = useState<SingleSupplierSyncItem[]>([]);
  const [allSuppliersMode, setAllSuppliersMode] = useState(false);
  const [supplierSyncOpen, setSupplierSyncOpen] = useState(false);
  const [supplierSyncList, setSupplierSyncList] = useState<SupplierSyncItem[]>([]);
  const [supplierSyncing, setSupplierSyncing] = useState(false);
  const supplierAbortRef = useRef<AbortController | null>(null);

  const logCounterRef = useRef(0); // Track total logs generated for debugging
  const allLogsRef = useRef<SyncLog[]>([]); // Unbounded full log store
  const [missingLogsModalOpen, setMissingLogsModalOpen] = useState(false);

  const addLog: LogCallback = useCallback((type, message) => {
    logCounterRef.current += 1;
    const logNumber = logCounterRef.current;

    const log: SyncLog = {
      id: `${logNumber}-${Date.now()}`,
      timestamp: new Date(),
      type,
      message,
    };

    // Always store every log in the unbounded ref
    allLogsRef.current.push(log);

    // Only log to console if verboseConsole is enabled
    if (verboseConsole) {
      console.log(`[LOG #${logNumber}] [${type.toUpperCase()}] ${message}`);
    }

    setLogs((prev) => [log, ...prev].slice(0, 500));
  }, [verboseConsole]);

  // Update batch payload status after POST
  const updateBatchPayloadStatus = useCallback((batchId: number, status: 'success' | 'error', postResult?: any, errorMessage?: string) => {
    setBatchPayloads((prev) => prev.map((bp) =>
      bp.batchId === batchId
        ? { ...bp, status, postResult, errorMessage }
        : bp
    ));
  }, []);

  // Download batch payloads as log file
  const downloadBatchPayloads = useCallback(() => {
    let content = `BATCH PAYLOADS LOG\n`;
    content += `Generated: ${new Date().toLocaleString()}\n`;
    content += `Total Batches: ${batchPayloads.length}\n`;
    content += `${'='.repeat(80)}\n\n`;

    batchPayloads.forEach((bp, index) => {
      content += `BATCH #${index + 1}\n`;
      content += `${'─'.repeat(40)}\n`;
      content += `Batch ID: ${bp.batchId}\n`;
      content += `Batch Name: ${bp.batchName}\n`;
      content += `Status: ${bp.status.toUpperCase()}\n`;
      if (bp.errorMessage) {
        content += `Error: ${bp.errorMessage}\n`;
      }
      content += `\nPOST Payload:\n`;
      content += JSON.stringify(bp.payload, null, 2);
      content += `\n`;
      if (bp.postResult) {
        content += `\nPOST Response:\n`;
        content += JSON.stringify(bp.postResult, null, 2);
      }
      content += `\n${'─'.repeat(40)}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-payloads-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [batchPayloads]);

  // Build the direct APEX URL for a given endpoint key
  const buildApexUrl = useCallback((endpointKey: keyof typeof APEX_DB_CONFIG.endpoints) => {
    return `${APEX_DB_CONFIG.baseUrl}/${APEX_DB_CONFIG.endpoints[endpointKey]}`;
  }, []);

  // POST a single batch manually (direct to APEX — no proxy)
  const postSingleBatch = useCallback(async (batchPayload: BatchPayloadLog) => {
    setIsPostingBatch(true);
    addLog('step', `──── Manual POST for Batch ${batchPayload.batchId} ────`);

    try {
      const url = buildApexUrl('journalBatches');
      addLog('info', `POST URL: ${url}`);
      addLog('info', `POST Payload: ${JSON.stringify(batchPayload.payload).substring(0, 300)}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchPayload.payload),
      });

      const responseText = await response.text();
      let data: any;
      try { data = JSON.parse(responseText); } catch { data = { raw: responseText.substring(0, 300) }; }

      addLog('success', `POST Response (HTTP ${response.status}): ${JSON.stringify(data)}`);
      const ok = data.success === true || data.inserted > 0 || data.syncedCount > 0 || data.successCount > 0 || data.status === 'SUCCESS';
      const errMsg = data.error || data.lastError || (data.errorCount > 0 ? `${data.errorCount} errors` : undefined);
      updateBatchPayloadStatus(batchPayload.batchId, ok ? 'success' : 'error', data, ok ? undefined : (errMsg || `HTTP ${response.status}`));
      if (ok) {
        const n = data.inserted ?? data.syncedCount ?? data.successCount ?? '?';
        addLog('success', `✓ Batch ${batchPayload.batchId} posted — synced: ${n}`);
      } else {
        addLog('error', `✗ Batch ${batchPayload.batchId} failed: ${errMsg || JSON.stringify(data)}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      updateBatchPayloadStatus(batchPayload.batchId, 'error', undefined, errorMsg);
      addLog('error', `✗ Batch ${batchPayload.batchId} error: ${errorMsg}`);
    }

    setIsPostingBatch(false);
  }, [addLog, buildApexUrl, updateBatchPayloadStatus]);

  // Update invoice payload status after POST
  const updateInvoicePayloadStatus = useCallback((invoiceId: number, status: 'success' | 'error', postResult?: any, errorMessage?: string) => {
    setInvoicePayloads((prev) => prev.map((ip) =>
      ip.invoiceId === invoiceId
        ? { ...ip, status, postResult, errorMessage }
        : ip
    ));
  }, []);

  // Download invoice payloads as log file
  const downloadInvoicePayloads = useCallback(() => {
    let content = `INVOICE PAYLOADS LOG\n`;
    content += `Generated: ${new Date().toLocaleString()}\n`;
    content += `Total Invoices: ${invoicePayloads.length}\n`;
    content += `${'='.repeat(80)}\n\n`;

    invoicePayloads.forEach((ip, index) => {
      content += `INVOICE #${index + 1}\n`;
      content += `${'─'.repeat(40)}\n`;
      content += `Invoice ID: ${ip.invoiceId}\n`;
      content += `Invoice Number: ${ip.invoiceNumber}\n`;
      content += `Status: ${ip.status.toUpperCase()}\n`;
      if (ip.errorMessage) {
        content += `Error: ${ip.errorMessage}\n`;
      }
      content += `\nPOST Payload:\n`;
      content += JSON.stringify(ip.payload, null, 2);
      content += `\n`;
      if (ip.postResult) {
        content += `\nPOST Response:\n`;
        content += JSON.stringify(ip.postResult, null, 2);
      }
      content += `\n${'─'.repeat(40)}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-payloads-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [invoicePayloads]);

  // POST a single invoice manually
  const postSingleInvoice = useCallback(async (invoicePayload: InvoicePayloadLog) => {
    setIsPostingInvoice(true);
    addLog('step', `──── Manual POST for Invoice ${invoicePayload.invoiceNumber} (ID: ${invoicePayload.invoiceId}) ────`);

    try {
      const url = `${APEX_DB_CONFIG.baseUrl}/ap/invoices/bulk`;

      // Remove links property and wrap in expected format (items array)
      const { links, ...invoiceWithoutLinks } = invoicePayload.payload as any;
      const wrappedPayload = {
        items: [invoiceWithoutLinks]
      };

      addLog('info', `POST URL: ${url}`);
      addLog('step', `──── POST PAYLOAD ────`);
      addLog('info', JSON.stringify(wrappedPayload, null, 2));

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wrappedPayload),
      });

      const data = await response.json();
      addLog('step', `──── POST RESPONSE ────`);
      addLog('info', `HTTP Status: ${response.status}`);
      addLog('success', JSON.stringify(data, null, 2));

      // Check if successCount > 0 for bulk endpoint
      const isSuccess = data.status === 'SUCCESS' && (data.successCount > 0 || data.success === true);

      if (isSuccess) {
        updateInvoicePayloadStatus(invoicePayload.invoiceId, 'success', data);
        addLog('success', `✓ Invoice ${invoicePayload.invoiceNumber} posted successfully! (${data.successCount} inserted)`);
      } else {
        updateInvoicePayloadStatus(invoicePayload.invoiceId, 'error', data, data.error || data.message || 'No invoices inserted');
        addLog('error', `✗ Invoice ${invoicePayload.invoiceNumber} failed: ${data.error || data.message || 'successCount=0'}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      updateInvoicePayloadStatus(invoicePayload.invoiceId, 'error', undefined, errorMsg);
      addLog('error', `✗ Invoice ${invoicePayload.invoiceNumber} error: ${errorMsg}`);
    }

    setIsPostingInvoice(false);
  }, [addLog, updateInvoicePayloadStatus]);

  // Invoice payload callback handler
  const handleInvoicePayload: InvoicePayloadCallback = useCallback((invoiceId, invoiceNumber, payload, result, error, linesInfo) => {
    setInvoicePayloads((prev) => {
      const existing = prev.find((ip) => ip.invoiceId === invoiceId);
      if (existing) {
        // Update existing entry
        return prev.map((ip) =>
          ip.invoiceId === invoiceId
            ? {
                ...ip,
                postResult: result,
                status: error ? 'error' : (result ? 'success' : 'pending'),
                errorMessage: error,
                linesFetched: linesInfo?.fetched ?? ip.linesFetched,
                linesInserted: linesInfo?.inserted ?? ip.linesInserted,
                linesError: linesInfo?.linesError ?? ip.linesError,
              }
            : ip
        );
      } else {
        // Add new entry
        return [...prev, {
          invoiceId,
          invoiceNumber,
          payload,
          postResult: result,
          status: error ? 'error' : (result ? 'success' : 'pending'),
          errorMessage: error,
          linesFetched: linesInfo?.fetched ?? 0,
          linesInserted: linesInfo?.inserted ?? 0,
          linesError: linesInfo?.linesError,
        }];
      }
    });
  }, []);

  // Payment payload callback handler (for AP Payments debug)
  const handlePaymentPayload: PaymentPayloadCallback = useCallback((checkId, paymentNumber, payload, result, error, relatedInvoicesInfo) => {
    setPaymentPayloads((prev) => {
      const existing = prev.find((pp) => pp.checkId === checkId);
      if (existing) {
        // Update existing entry
        return prev.map((pp) =>
          pp.checkId === checkId
            ? {
                ...pp,
                postResult: result,
                status: error ? 'error' : (result ? 'success' : 'pending'),
                errorMessage: error,
                relatedInvoicesFetched: relatedInvoicesInfo?.fetched ?? pp.relatedInvoicesFetched,
                relatedInvoicesInserted: relatedInvoicesInfo?.inserted ?? pp.relatedInvoicesInserted,
                relatedInvoicesError: relatedInvoicesInfo?.error ?? pp.relatedInvoicesError,
              }
            : pp
        );
      } else {
        // Add new entry
        return [...prev, {
          checkId,
          paymentNumber,
          payload,
          postResult: result,
          status: error ? 'error' : (result ? 'success' : 'pending'),
          errorMessage: error,
          relatedInvoicesFetched: relatedInvoicesInfo?.fetched ?? 0,
          relatedInvoicesInserted: relatedInvoicesInfo?.inserted ?? 0,
          relatedInvoicesError: relatedInvoicesInfo?.error,
        }];
      }
    });
  }, []);

  // ── All Suppliers batch sync handler ─────────────────────────────────────
  const handleProcessAllSuppliers = async () => {
    setSupplierSyncing(true);
    supplierAbortRef.current = new AbortController();
    const signal = supplierAbortRef.current.signal;
    const baseParameters = getParameters();

    for (let i = 0; i < supplierSyncList.length; i++) {
      if (signal.aborted) break;
      const supplier = supplierSyncList[i];
      if (supplier.status === 'done') continue;

      setSupplierSyncList(prev => prev.map((s, idx) =>
        idx === i ? { ...s, status: 'syncing' as const } : s
      ));

      try {
        const supplierParams = { ...baseParameters, SupplierNumber: supplier.supplierNumber };

        const updateRow = (patch: Partial<SupplierSyncItem>) =>
          setSupplierSyncList(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));

        // Invoices: mark fetch phase, then track progress
        updateRow({ currentStep: 'inv-fetch', invTotal: 0, invProcessed: 0 });

        const invResult = await syncAPInvoices(
          supplierParams,
          false,
          addLog,
          (p) => {
            if (p.status === 'fetching') {
              updateRow({ currentStep: 'inv-fetch', invTotal: p.totalInvoices, invProcessed: p.processedInvoices });
            } else if (p.status === 'inserting' || p.insertedInvoices > 0) {
              updateRow({ currentStep: 'inv-insert', invTotal: p.totalInvoices, invProcessed: p.insertedInvoices });
            }
          },
          signal,
          undefined
        );

        let paymentsInserted = 0;

        if (!signal.aborted && chainAPPayments) {
          updateRow({ currentStep: 'pay-fetch', payTotal: 0, payProcessed: 0 });

          const payResult = await syncAPPayments(
            supplierParams,
            false,
            addLog,
            (p) => {
              if (p.status === 'fetching') {
                updateRow({ currentStep: 'pay-fetch', payTotal: p.totalPayments, payProcessed: p.processedPayments });
              } else if (p.status === 'inserting' || p.insertedPayments > 0) {
                updateRow({ currentStep: 'pay-insert', payTotal: p.totalPayments, payProcessed: p.insertedPayments });
              }
            },
            signal,
            undefined
          );
          paymentsInserted = payResult.insertedPayments || 0;
        }

        updateRow({
          status: (invResult.errors > 0 ? 'error' : 'done') as const,
          invoicesInserted: invResult.insertedInvoices || 0,
          paymentsInserted,
          errors: invResult.errors,
          errorMsg: invResult.errors > 0 ? invResult.lastError : undefined,
          currentStep: undefined,
          invTotal: undefined, invProcessed: undefined,
          payTotal: undefined, payProcessed: undefined,
        });
      } catch (e: any) {
        setSupplierSyncList(prev => prev.map((s, idx) =>
          idx === i ? { ...s, status: 'error' as const, errorMsg: String(e) } : s
        ));
      }
    }
    setSupplierSyncing(false);
  };

  // Code Combination payload callback handler
  const handleCodeCombPayload: CodeCombPayloadCallback = useCallback((ccId, concatenatedSegments, payload, result, error) => {
    setCodeCombPayloads((prev) => {
      const existing = prev.find((cc) => cc.ccId === ccId);
      if (existing) {
        return prev.map((cc) =>
          cc.ccId === ccId
            ? {
                ...cc,
                postResult: result,
                status: error ? 'error' : (result ? 'success' : 'pending'),
                errorMessage: error,
              }
            : cc
        );
      } else {
        return [...prev, {
          ccId,
          concatenatedSegments,
          payload,
          postResult: result,
          status: error ? 'error' : (result ? 'success' : 'pending'),
          errorMessage: error,
        }];
      }
    });
  }, []);

  // Period Status payload callback handler
  const handlePeriodStatusPayload: PeriodStatusPayloadCallback = useCallback((periodNameId, ledgerId, payload, result, error) => {
    setPeriodStatusPayloads((prev) => {
      const existing = prev.find((ps) => ps.periodNameId === periodNameId && ps.ledgerId === ledgerId);
      if (existing) {
        return prev.map((ps) =>
          ps.periodNameId === periodNameId && ps.ledgerId === ledgerId
            ? {
                ...ps,
                postResult: result,
                status: error ? 'error' : (result ? 'success' : 'pending'),
                errorMessage: error,
              }
            : ps
        );
      } else {
        return [...prev, {
          periodNameId,
          ledgerId,
          payload,
          postResult: result,
          status: error ? 'error' : (result ? 'success' : 'pending'),
          errorMessage: error,
        }];
      }
    });
  }, []);

  // Banks payload callback handler
  const handleBanksPayload: BanksPayloadCallback = useCallback((bankPartyId, bankName, payload, result, error) => {
    setBanksPayloads((prev) => {
      const existing = prev.find((b) => b.bankPartyId === bankPartyId);
      if (existing) {
        return prev.map((b) =>
          b.bankPartyId === bankPartyId
            ? {
                ...b,
                postResult: result,
                status: error ? 'error' : (result ? 'success' : 'pending'),
                errorMessage: error,
              }
            : b
        );
      } else {
        return [...prev, {
          bankPartyId,
          bankName,
          payload,
          postResult: result,
          status: error ? 'error' : (result ? 'success' : 'pending'),
          errorMessage: error,
        }];
      }
    });
  }, []);

  // Bank Branches payload callback handler
  const handleBankBranchesPayload: BankBranchesPayloadCallback = useCallback((branchPartyId, branchName, payload, result, error) => {
    setBankBranchesPayloads((prev) => {
      const existing = prev.find((b) => b.branchPartyId === branchPartyId);
      if (existing) {
        return prev.map((b) =>
          b.branchPartyId === branchPartyId
            ? {
                ...b,
                postResult: result,
                status: error ? 'error' : (result ? 'success' : 'pending'),
                errorMessage: error,
              }
            : b
        );
      } else {
        return [...prev, {
          branchPartyId,
          branchName,
          payload,
          postResult: result,
          status: error ? 'error' : (result ? 'success' : 'pending'),
          errorMessage: error,
        }];
      }
    });
  }, []);

  // Bank Accounts payload callback handler
  const handleBankAccountsPayload: BankAccountsPayloadCallback = useCallback((bankAccountId, accountName, payload, result, error) => {
    setBankAccountsPayloads((prev) => {
      const existing = prev.find((b) => b.bankAccountId === bankAccountId);
      if (existing) {
        return prev.map((b) =>
          b.bankAccountId === bankAccountId
            ? {
                ...b,
                postResult: result,
                status: error ? 'error' : (result ? 'success' : 'pending'),
                errorMessage: error,
              }
            : b
        );
      } else {
        return [...prev, {
          bankAccountId,
          accountName,
          payload,
          postResult: result,
          status: error ? 'error' : (result ? 'success' : 'pending'),
          errorMessage: error,
        }];
      }
    });
  }, []);

  // Bank Account Transfers payload callback handler
  const handleBankAccountTransfersPayload: BankAccountTransfersPayloadCallback = useCallback((transferId, transferNumber, payload, result, error) => {
    setBankAccountTransfersPayloads((prev) => {
      const existing = prev.find((t) => t.transferId === transferId);
      if (existing) {
        return prev.map((t) =>
          t.transferId === transferId
            ? { ...t, postResult: result, status: error ? 'error' : (result ? 'success' : 'pending'), errorMessage: error }
            : t
        );
      } else {
        return [...prev, { transferId, transferNumber, payload, postResult: result, status: error ? 'error' : (result ? 'success' : 'pending'), errorMessage: error }];
      }
    });
  }, []);

  // Legal Entities payload callback handler
  const handleLegalEntitiesPayload: LegalEntitiesPayloadCallback = useCallback((legalEntityId, name, payload, result, error) => {
    setLegalEntitiesPayloads((prev) => {
      const existing = prev.find((e) => e.legalEntityId === legalEntityId);
      if (existing) {
        return prev.map((e) =>
          e.legalEntityId === legalEntityId
            ? {
                ...e,
                postResult: result,
                status: error ? 'error' : (result ? 'success' : 'pending'),
                errorMessage: error,
              }
            : e
        );
      } else {
        return [...prev, {
          legalEntityId,
          name,
          payload,
          postResult: result,
          status: error ? 'error' : (result ? 'success' : 'pending'),
          errorMessage: error,
        }];
      }
    });
  }, []);

  // User Accounts payload callback handler
  const handleUserAccountsPayload: UserAccountsPayloadCallback = useCallback((userId, username, payload, result, error) => {
    setUserAccountsPayloads((prev) => {
      const existing = prev.find((u) => u.userId === userId);
      if (existing) {
        return prev.map((u) =>
          u.userId === userId
            ? {
                ...u,
                postResult: result,
                status: error ? 'error' : (result ? 'success' : 'pending'),
                errorMessage: error,
              }
            : u
        );
      } else {
        return [...prev, {
          userId,
          username,
          payload,
          postResult: result,
          status: error ? 'error' : (result ? 'success' : 'pending'),
          errorMessage: error,
        }];
      }
    });
  }, []);

  // User Account Roles payload callback handler
  const handleUserAccountRolesPayload: UserAccountRolesPayloadCallback = useCallback((userId, username, rolesCount, payload, result, error) => {
    setUserAccountRolesPayloads((prev) => {
      const existing = prev.find((u) => u.userId === userId);
      if (existing) {
        return prev.map((u) =>
          u.userId === userId
            ? {
                ...u,
                rolesCount,
                postResult: result,
                status: error ? 'error' : (result ? 'success' : 'pending'),
                errorMessage: error,
              }
            : u
        );
      } else {
        return [...prev, {
          userId,
          username,
          rolesCount,
          payload,
          postResult: result,
          status: error ? 'error' : (result ? 'success' : 'pending'),
          errorMessage: error,
        }];
      }
    });
  }, []);

  // Roles payload callback handler
  const handleRolesPayload: RolesPayloadCallback = useCallback((roleId, roleName, payload, result, error) => {
    setRolesPayloads((prev) => {
      const existing = prev.find((r) => r.roleId === roleId);
      if (existing) {
        return prev.map((r) =>
          r.roleId === roleId
            ? {
                ...r,
                postResult: result,
                status: error ? 'error' : (result ? 'success' : 'pending'),
                errorMessage: error,
              }
            : r
        );
      } else {
        return [...prev, {
          roleId,
          roleName,
          payload,
          postResult: result,
          status: error ? 'error' : (result ? 'success' : 'pending'),
          errorMessage: error,
        }];
      }
    });
  }, []);

  // Suppliers payload callback handler
  const handleSuppliersPayload: SuppliersPayloadCallback = useCallback((supplierId, supplierName, payload, result, error) => {
    setSuppliersPayloads((prev) => {
      const existing = prev.find((s) => s.supplierId === supplierId);
      if (existing) {
        return prev.map((s) =>
          s.supplierId === supplierId
            ? {
                ...s,
                postResult: result,
                status: error ? 'error' : (result ? 'success' : 'pending'),
                errorMessage: error,
              }
            : s
        );
      } else {
        return [...prev, {
          supplierId,
          supplierName,
          payload,
          postResult: result,
          status: error ? 'error' : (result ? 'success' : 'pending'),
          errorMessage: error,
        }];
      }
    });
  }, []);

  // Supplier Address payload callback handler
  const handleSupplierAddressPayload: SupplierAddressPayloadCallback = useCallback((supplierId, supplierName, addressCount, payload, result, error) => {
    setSupplierAddressPayloads((prev) => {
      const existing = prev.find((s) => s.supplierId === supplierId);
      if (existing) {
        return prev.map((s) =>
          s.supplierId === supplierId
            ? {
                ...s,
                postResult: result,
                status: error ? 'error' : (result ? 'success' : 'pending'),
                errorMessage: error,
              }
            : s
        );
      } else {
        return [...prev, {
          supplierId,
          supplierName,
          addressCount,
          payload,
          postResult: result,
          status: error ? 'error' : (result ? 'success' : 'pending'),
          errorMessage: error,
        }];
      }
    });
  }, []);

  // Supplier Sites payload callback handler
  const handleSupplierSitesPayload: SupplierSitesPayloadCallback = useCallback((supplierId, supplierName, siteCount, payload, result, error) => {
    setSupplierSitesPayloads((prev) => {
      const existing = prev.find((s) => s.supplierId === supplierId);
      if (existing) {
        return prev.map((s) =>
          s.supplierId === supplierId
            ? {
                ...s,
                postResult: result,
                status: error ? 'error' : (result ? 'success' : 'pending'),
                errorMessage: error,
              }
            : s
        );
      } else {
        return [...prev, {
          supplierId,
          supplierName,
          siteCount,
          payload,
          postResult: result,
          status: error ? 'error' : (result ? 'success' : 'pending'),
          errorMessage: error,
        }];
      }
    });
  }, []);

  // Site Assignments payload callback handler
  const handleSiteAssignmentsPayload: SiteAssignmentsPayloadCallback = useCallback((siteId, siteName, assignmentCount, payload, result, error) => {
    setSiteAssignmentsPayloads((prev) => {
      const existing = prev.find((s) => s.siteId === siteId);
      if (existing) {
        return prev.map((s) =>
          s.siteId === siteId
            ? {
                ...s,
                postResult: result,
                status: error ? 'error' : (result ? 'success' : 'pending'),
                errorMessage: error,
              }
            : s
        );
      } else {
        return [...prev, {
          siteId,
          siteName,
          assignmentCount,
          payload,
          postResult: result,
          status: error ? 'error' : (result ? 'success' : 'pending'),
          errorMessage: error,
        }];
      }
    });
  }, []);

  // Check proxy server status
  const checkProxyStatus = useCallback(async () => {
    setProxyStatus('checking');
    setProxyError('');
    addLog('info', `Checking proxy server at ${PROXY_CONFIG.baseUrl}...`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(`${PROXY_CONFIG.baseUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        setProxyStatus('online');
        addLog('success', `✓ Proxy server is ONLINE (${data.timestamp})`);
        addLog('info', `Proxy URL: ${PROXY_CONFIG.baseUrl}`);
        return true;
      } else {
        setProxyStatus('offline');
        setProxyError(`HTTP ${response.status}`);
        addLog('error', `✗ Proxy returned HTTP ${response.status}`);
        return false;
      }
    } catch (error) {
      setProxyStatus('offline');
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      if (errorMsg.includes('abort')) {
        setProxyError('Connection timeout (5s)');
        addLog('error', '✗ Proxy connection timeout after 5 seconds');
      } else if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
        setProxyError('Cannot connect - server not running?');
        addLog('error', '✗ Cannot connect to proxy server');
        addLog('warning', 'Make sure proxy server is running: node server/proxy.cjs');
      } else {
        setProxyError(errorMsg);
        addLog('error', `✗ Proxy error: ${errorMsg}`);
      }

      addLog('info', '─────────────────────────────────────────');
      addLog('info', 'To start the proxy server, run in a terminal:');
      addLog('step', '  cd C:\\FusionApi\\reacterp');
      addLog('step', '  node server/proxy.cjs');
      addLog('info', '─────────────────────────────────────────');

      return false;
    }
  }, [addLog]);

  const handleObjectChange = (objectId: string) => {
    const object = SYNC_OBJECTS.find((o) => o.id === objectId);

    // Reset all parameter fields from ALL sync objects to clear any cached values
    const allParamKeys = SYNC_OBJECTS.flatMap(obj => obj.parameters.map(p => p.key));
    const uniqueParamKeys = [...new Set(allParamKeys)];
    form.resetFields(uniqueParamKeys);

    setSelectedObject(object || null);

    // Set default values for new object's parameters
    if (object) {
      const defaults: Record<string, string> = {};
      object.parameters.forEach((param) => {
        if (param.defaultValue) {
          defaults[param.key] = param.defaultValue;
        }
      });
      if (Object.keys(defaults).length > 0) {
        form.setFieldsValue(defaults);
      }
      addLog('info', `Selected: ${object.name}`);

      // Fetch options for any api-select parameters
      object.parameters.forEach((param) => {
        if (param.type === 'api-select' && param.apiUrl) {
          fetchApiSelectOptions(param.key, param.apiUrl, param.apiLabelKey!, param.apiValueKey!, param.apiCountKey, undefined, undefined, param.apiSubLabelKey);
        }
      });
    }
  };

  const fetchApiSelectOptions = async (
    paramKey: string,
    apiUrl: string,
    labelKey: string,
    valueKey: string,
    countKey?: string,
    filterParam?: string,
    filterValue?: string,
    subLabelKey?: string,
  ) => {
    setApiSelectOptions(prev => ({ ...prev, [paramKey]: { loading: true, items: prev[paramKey]?.items || [] } }));
    try {
      let url = apiUrl;
      if (filterParam && filterValue) {
        url += (url.includes('?') ? '&' : '?') + `${filterParam}=${encodeURIComponent(filterValue)}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      const rawItems: any[] = data.items || data || [];
      const items = rawItems.map((item: any) => ({
        label: String(item[labelKey] ?? ''),
        value: String(item[valueKey] ?? ''),
        subLabel: subLabelKey ? String(item[subLabelKey] ?? '') : undefined,
        count: countKey ? Number(item[countKey]) : undefined,
      }));
      setApiSelectOptions(prev => ({ ...prev, [paramKey]: { loading: false, items } }));
    } catch {
      setApiSelectOptions(prev => ({ ...prev, [paramKey]: { loading: false, items: [] } }));
    }
  };

  const getParameters = (): Record<string, string> => {
    const values = form.getFieldsValue();
    const parameters: Record<string, string> = {};

    selectedObject?.parameters.forEach((param) => {
      if (values[param.key]) {
        parameters[param.key] = values[param.key];
      }
    });

    return parameters;
  };

  // ── localStorage helpers for batch sync progress persistence ──────────────
  const getBatchDoneKey = (params: Record<string, string>) =>
    `glsync_done_${params.DefaultPeriodName || 'all'}_${params.JeBatchId || 'all'}`;

  const loadDoneBatchIds = (params: Record<string, string>): Set<number> => {
    try {
      const raw = localStorage.getItem(getBatchDoneKey(params));
      return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
    } catch { return new Set(); }
  };

  const saveDoneBatchId = (params: Record<string, string>, batchId: number) => {
    try {
      const key = getBatchDoneKey(params);
      const existing = loadDoneBatchIds(params);
      existing.add(batchId);
      localStorage.setItem(key, JSON.stringify([...existing]));
    } catch {}
  };

  const clearDoneBatchIds = (params: Record<string, string>) => {
    try { localStorage.removeItem(getBatchDoneKey(params)); } catch {}
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setLogs([]);
    addLog('step', '═══════════════════════════════════════════════════════════');
    addLog('step', '  CONNECTION TEST');
    addLog('step', '═══════════════════════════════════════════════════════════');

    // Step 1: Check proxy
    addLog('info', '');
    addLog('info', '▶ STEP 1: Checking Proxy Server...');
    const proxyOk = await checkProxyStatus();

    if (!proxyOk) {
      addLog('error', '');
      addLog('error', '✗ CONNECTION TEST FAILED - Proxy server not available');
      setIsTesting(false);
      return;
    }

    // Step 2: Test Oracle connection via proxy
    addLog('info', '');
    addLog('info', '▶ STEP 2: Testing Oracle Fusion via Proxy...');

    // Test based on selected object type
    let success = false;
    if (isAPPayments) {
      addLog('info', 'Testing AP Payments endpoint...');
      success = await testAPPaymentsConnection(addLog);
    } else if (isAPInvoices) {
      addLog('info', 'Testing AP Invoices endpoint...');
      success = await testAPConnection(addLog);
    } else if (isGLCodeComb) {
      addLog('info', 'Testing GL Code Combinations endpoint...');
      success = await testGLCodeCombConnection(addLog);
    } else if (isGLPeriodStatus) {
      addLog('info', 'Testing GL Period Status endpoint...');
      success = await testGLPeriodStatusConnection(addLog);
    } else if (isBanks) {
      addLog('info', 'Testing Banks endpoint...');
      success = await testBanksConnection(addLog);
    } else if (isBankBranches) {
      addLog('info', 'Testing Bank Branches endpoint...');
      success = await testBankBranchesConnection(addLog);
    } else if (isBankAccounts) {
      addLog('info', 'Testing Bank Accounts endpoint...');
      success = await testBankAccountsConnection(addLog);
    } else if (isBankAccountTransfers) {
      addLog('info', 'Testing Bank Account Transfers endpoint...');
      success = await testBankAccountTransfersConnection(addLog);
    } else if (isExternalCashTxn) {
      addLog('info', 'Testing External Cash Transactions endpoint...');
      success = await testExternalCashTransactionsConnection(addLog);
    } else if (isLegalEntities) {
      addLog('info', 'Testing Legal Entities endpoint...');
      success = await testLegalEntitiesConnection(addLog);
    } else if (isBusinessUnits) {
      addLog('info', 'Testing Business Units endpoint...');
      success = await testBusinessUnitsConnection(addLog);
    } else if (isUserAccounts) {
      addLog('info', 'Testing User Accounts endpoint...');
      success = await testUserAccountsConnection(addLog);
    } else if (isUserAccountRoles) {
      addLog('info', 'Testing User Account Roles endpoint...');
      const result = await testUserAccountRolesConnection(addLog);
      success = result.success;
    } else if (isRoles) {
      addLog('info', 'Testing Roles endpoint...');
      const result = await testRolesConnection(addLog);
      success = result.success;
    } else if (isSuppliers) {
      addLog('info', 'Testing Suppliers endpoint...');
      const result = await testSuppliersConnection(addLog);
      success = result.success;
    } else if (isSupplierAddresses) {
      addLog('info', 'Testing Supplier Address endpoint...');
      const result = await testSupplierAddressConnection(addLog);
      success = result.success;
    } else if (isSupplierSites) {
      addLog('info', 'Testing Supplier Sites endpoint...');
      const result = await testSupplierSitesConnection(addLog);
      success = result.success;
    } else if (isSiteAssignments) {
      addLog('info', 'Testing Site Assignments endpoint...');
      const result = await testSiteAssignmentsConnection(addLog);
      success = result.success;
    } else if (isGLBalances) {
      addLog('info', 'Testing GL Balances SOAP endpoint...');
      const parameters = getParameters();
      const result = await testGLBalancesConnection(parameters, addLog);
      success = result.success;
    } else {
      addLog('info', 'Testing GL Journals endpoint...');
      success = await testGLConnection(addLog);
    }

    addLog('info', '');
    if (success) {
      addLog('success', '═══════════════════════════════════════════════════════════');
      addLog('success', '  ✓ CONNECTION TEST PASSED');
      addLog('success', '═══════════════════════════════════════════════════════════');
    } else {
      addLog('error', '═══════════════════════════════════════════════════════════');
      addLog('error', '  ✗ CONNECTION TEST FAILED');
      addLog('error', '═══════════════════════════════════════════════════════════');
    }

    setIsTesting(false);
  };

  // Batch payload callback handler
  const handleBatchPayload: BatchPayloadCallback = useCallback((batchId, batchName, payload, result, error) => {
    setBatchPayloads((prev) => {
      const existing = prev.find((bp) => bp.batchId === batchId);
      if (existing) {
        // Update existing entry
        return prev.map((bp) =>
          bp.batchId === batchId
            ? {
                ...bp,
                postResult: result,
                status: error ? 'error' : (result ? 'success' : 'pending'),
                errorMessage: error,
              }
            : bp
        );
      } else {
        // Add new entry
        return [...prev, {
          batchId,
          batchName,
          payload,
          postResult: result,
          status: error ? 'error' : (result ? 'success' : 'pending'),
          errorMessage: error,
        }];
      }
    });
  }, []);

  const handleSync = async () => {
    if (!selectedObject) {
      addLog('error', 'Please select a sync object');
      return;
    }

    const parameters = getParameters();

    isSyncingRef.current = true;
    abortControllerRef.current = new AbortController();

    // Clear previous data
    setLogs([]);
    setBatchPayloads([]);
    setInvoicePayloads([]);
    setPaymentPayloads([]);
    setCodeCombPayloads([]);
    setPeriodStatusPayloads([]);
    setBanksPayloads([]);
    setBankBranchesPayloads([]);
    setBankAccountsPayloads([]);
    setLegalEntitiesPayloads([]);
    setUserAccountsPayloads([]);
    setUserAccountRolesPayloads([]);
    setRolesPayloads([]);
    setSuppliersPayloads([]);
    setSupplierAddressPayloads([]);
    setSupplierSitesPayloads([]);
    setSiteAssignmentsPayloads([]);
    logCounterRef.current = 0;
    allLogsRef.current = [];

    // Notify Electron that sync started
    const syncTypeName = selectedObject?.name || 'Data';
    notifySyncStarted(syncTypeName);

    let syncResult: { inserted: number; errors: number; type: string } = { inserted: 0, errors: 0, type: '' };

    if (isAPPayments) {
      // AP Payments Sync
      setApPaymentsProgress({
        status: 'fetching',
        totalPayments: 0,
        processedPayments: 0,
        insertedPayments: 0,
        currentPaymentNumber: '',
        totalRelatedInvoices: 0,
        processedRelatedInvoices: 0,
        currentPage: 0,
        totalPages: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const result = await syncAPPayments(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setApPaymentsProgress((prev) => ({ ...prev, ...newProgress }));
          // Update tray with progress
          if (newProgress.processedPayments !== undefined && newProgress.totalPayments) {
            notifySyncProgress(`${newProgress.processedPayments}/${newProgress.totalPayments} payments`);
          }
        },
        abortControllerRef.current.signal,
        handlePaymentPayload
      );
      syncResult = { inserted: result.insertedPayments, errors: result.errors, type: 'payments' };
    } else if (isAPInvoices) {
      // AP Invoices Sync — open progress popup showing each object's status
      const initialItems: SingleSupplierSyncItem[] = [
        { key: 'invoices', label: 'AP Invoices', status: 'pending', inserted: 0, errors: 0 },
        ...(chainAPPayments
          ? [{ key: 'payments', label: 'AP Payments', status: 'pending' as const, inserted: 0, errors: 0 }]
          : []),
      ];
      setSingleSyncItems(initialItems);
      setSingleSyncOpen(true);

      const updateItem = (key: string, patch: Partial<SingleSupplierSyncItem>) =>
        setSingleSyncItems(prev => prev.map(it => it.key === key ? { ...it, ...patch } : it));

      // ── AP Invoices ──
      updateItem('invoices', { status: 'syncing', step: 'Fetching' });
      setApProgress({
        status: 'fetching',
        totalInvoices: 0, processedInvoices: 0, insertedInvoices: 0,
        currentInvoiceNumber: '',
        totalHeaders: 0, processedHeaders: 0,
        totalLines: 0, processedLines: 0,
        totalDistributions: 0, processedDistributions: 0,
        totalInstallments: 0, processedInstallments: 0,
        currentPage: 0, totalPages: 0,
        errors: 0, lastError: '',
        startTime: new Date(), endTime: null,
      });

      const result = await syncAPInvoices(
        parameters,
        testMode,
        addLog,
        (p) => {
          setApProgress((prev) => ({ ...prev, ...p }));
          if (p.status === 'fetching') {
            updateItem('invoices', { step: 'Fetching', total: p.totalInvoices, processed: p.processedInvoices });
          } else if (p.insertedInvoices !== undefined) {
            updateItem('invoices', { step: 'Inserting', total: p.totalInvoices, processed: p.insertedInvoices });
          }
          if (p.processedInvoices !== undefined && p.totalInvoices) {
            notifySyncProgress(`${p.processedInvoices}/${p.totalInvoices} invoices`);
          }
        },
        abortControllerRef.current.signal,
        handleInvoicePayload
      );
      updateItem('invoices', {
        status: result.errors > 0 ? 'error' : 'done',
        inserted: result.insertedInvoices,
        errors: result.errors,
        errorMsg: result.errors > 0 ? result.lastError : undefined,
        step: undefined, total: undefined, processed: undefined,
      });

      // ── AP Payments (chained) ──
      if (chainAPPayments && !abortControllerRef.current?.signal.aborted) {
        addLog('step', '─── Chain: Syncing AP Payments ───');
        updateItem('payments', { status: 'syncing', step: 'Fetching' });

        const paymentsResult = await syncAPPayments(
          parameters,
          testMode,
          addLog,
          (p) => {
            setApPaymentsProgress((prev) => ({ ...prev, ...p }));
            if (p.status === 'fetching') {
              updateItem('payments', { step: 'Fetching', total: p.totalPayments, processed: p.processedPayments });
            } else if (p.insertedPayments !== undefined) {
              updateItem('payments', { step: 'Inserting', total: p.totalPayments, processed: p.insertedPayments });
            }
          },
          abortControllerRef.current.signal,
          handlePaymentPayload
        );
        updateItem('payments', {
          status: paymentsResult.errors > 0 ? 'error' : 'done',
          inserted: paymentsResult.insertedPayments,
          errors: paymentsResult.errors,
          errorMsg: paymentsResult.errors > 0 ? paymentsResult.lastError : undefined,
          step: undefined, total: undefined, processed: undefined,
        });
        syncResult = {
          inserted: result.insertedInvoices + paymentsResult.insertedPayments,
          errors: result.errors + paymentsResult.errors,
          type: 'invoices + payments',
        };
      } else {
        syncResult = { inserted: result.insertedInvoices, errors: result.errors, type: 'invoices' };
      }
    } else if (isGLCodeComb) {
      // GL Code Combinations Sync
      setCodeCombProgress({
        status: 'fetching',
        totalRecords: 0,
        processedRecords: 0,
        insertedRecords: 0,
        currentPage: 0,
        totalPages: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const result = await syncGLCodeCombinations(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setCodeCombProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedRecords !== undefined && newProgress.totalRecords) {
            notifySyncProgress(`${newProgress.processedRecords}/${newProgress.totalRecords} code combinations`);
          }
        },
        abortControllerRef.current.signal,
        handleCodeCombPayload
      );
      syncResult = { inserted: result.insertedRecords, errors: result.errors, type: 'code combinations' };
    } else if (isGLPeriodStatus) {
      // GL Period Status Sync
      setPeriodStatusProgress({
        status: 'fetching',
        totalRecords: 0,
        processedRecords: 0,
        insertedRecords: 0,
        currentPage: 0,
        totalPages: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const result = await syncGLPeriodStatus(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setPeriodStatusProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedRecords !== undefined && newProgress.totalRecords) {
            notifySyncProgress(`${newProgress.processedRecords}/${newProgress.totalRecords} period statuses`);
          }
        },
        abortControllerRef.current.signal,
        handlePeriodStatusPayload
      );
      syncResult = { inserted: result.insertedRecords, errors: result.errors, type: 'period statuses' };
    } else if (isBanks) {
      // Banks Sync
      setBanksProgress({
        status: 'fetching',
        totalRecords: 0,
        processedRecords: 0,
        insertedRecords: 0,
        currentPage: 0,
        totalPages: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const result = await syncBanks(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setBanksProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedRecords !== undefined && newProgress.totalRecords) {
            notifySyncProgress(`${newProgress.processedRecords}/${newProgress.totalRecords} banks`);
          }
        },
        abortControllerRef.current.signal,
        handleBanksPayload
      );
      syncResult = { inserted: result.insertedRecords, errors: result.errors, type: 'banks' };
    } else if (isBankBranches) {
      // Bank Branches Sync
      setBankBranchesProgress({
        status: 'fetching',
        totalRecords: 0,
        processedRecords: 0,
        insertedRecords: 0,
        currentPage: 0,
        totalPages: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const result = await syncBankBranches(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setBankBranchesProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedRecords !== undefined && newProgress.totalRecords) {
            notifySyncProgress(`${newProgress.processedRecords}/${newProgress.totalRecords} bank branches`);
          }
        },
        abortControllerRef.current.signal,
        handleBankBranchesPayload
      );
      syncResult = { inserted: result.insertedRecords, errors: result.errors, type: 'bank branches' };
    } else if (isBankAccounts) {
      // Bank Accounts Sync
      setBankAccountsProgress({
        status: 'fetching',
        totalRecords: 0,
        processedRecords: 0,
        insertedRecords: 0,
        currentPage: 0,
        totalPages: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const result = await syncBankAccounts(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setBankAccountsProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedRecords !== undefined && newProgress.totalRecords) {
            notifySyncProgress(`${newProgress.processedRecords}/${newProgress.totalRecords} bank accounts`);
          }
        },
        abortControllerRef.current.signal,
        handleBankAccountsPayload
      );
      syncResult = { inserted: result.insertedRecords, errors: result.errors, type: 'bank accounts' };
    } else if (isBankAccountTransfers) {
      // Bank Account Transfers Sync
      setBankAccountTransfersProgress({
        status: 'fetching',
        totalRecords: 0,
        processedRecords: 0,
        insertedRecords: 0,
        currentPage: 0,
        totalPages: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const result = await syncBankAccountTransfers(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setBankAccountTransfersProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedRecords !== undefined && newProgress.totalRecords) {
            notifySyncProgress(`${newProgress.processedRecords}/${newProgress.totalRecords} bank account transfers`);
          }
        },
        abortControllerRef.current.signal,
        handleBankAccountTransfersPayload
      );
      syncResult = { inserted: result.insertedRecords, errors: result.errors, type: 'bank account transfers' };
    } else if (isExternalCashTxn) {
      // External Cash Transactions Sync
      setExternalCashTxnProgress({
        status: 'fetching', totalRecords: 0, processedRecords: 0, insertedRecords: 0,
        currentPage: 0, totalPages: 0, errors: 0, lastError: '', startTime: new Date(), endTime: null,
      });
      const result = await syncExternalCashTransactions(
        parameters, testMode, addLog,
        (newProgress) => {
          setExternalCashTxnProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedRecords !== undefined && newProgress.totalRecords) {
            notifySyncProgress(`${newProgress.processedRecords}/${newProgress.totalRecords} external transactions`);
          }
        },
        abortControllerRef.current.signal
      );
      syncResult = { inserted: result.insertedRecords, errors: result.errors, type: 'external cash transactions' };
    } else if (isLegalEntities) {
      // Legal Entities Sync
      setLegalEntitiesProgress({
        status: 'fetching',
        totalRecords: 0,
        processedRecords: 0,
        insertedRecords: 0,
        currentPage: 0,
        totalPages: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const result = await syncLegalEntities(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setLegalEntitiesProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedRecords !== undefined && newProgress.totalRecords) {
            notifySyncProgress(`${newProgress.processedRecords}/${newProgress.totalRecords} legal entities`);
          }
        },
        abortControllerRef.current.signal,
        handleLegalEntitiesPayload
      );
      syncResult = { inserted: result.insertedRecords, errors: result.errors, type: 'legal entities' };
    } else if (isBusinessUnits) {
      // Business Units Sync
      setBusinessUnitsProgress({
        status: 'fetching',
        totalRecords: 0,
        processedRecords: 0,
        insertedRecords: 0,
        currentPage: 0,
        totalPages: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });
      const result = await syncBusinessUnits(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setBusinessUnitsProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedRecords !== undefined && newProgress.totalRecords) {
            notifySyncProgress(`${newProgress.processedRecords}/${newProgress.totalRecords} business units`);
          }
        },
        abortControllerRef.current.signal
      );
      syncResult = { inserted: result.insertedRecords, errors: result.errors, type: 'business units' };
    } else if (isUserAccounts) {
      // User Accounts Sync
      setUserAccountsProgress({
        status: 'fetching',
        totalRecords: 0,
        processedRecords: 0,
        insertedRecords: 0,
        currentPage: 0,
        totalPages: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const result = await syncUserAccounts(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setUserAccountsProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedRecords !== undefined && newProgress.totalRecords) {
            notifySyncProgress(`${newProgress.processedRecords}/${newProgress.totalRecords} user accounts`);
          }
        },
        abortControllerRef.current.signal,
        handleUserAccountsPayload
      );
      syncResult = { inserted: result.insertedRecords, errors: result.errors, type: 'user accounts' };
    } else if (isUserAccountRoles) {
      // User Account Roles Sync
      setUserAccountRolesProgress({
        status: 'fetching',
        totalUsers: 0,
        processedUsers: 0,
        totalRoles: 0,
        insertedRoles: 0,
        currentPage: 0,
        totalPages: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const result = await syncUserAccountRoles(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setUserAccountRolesProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedUsers !== undefined && newProgress.totalUsers) {
            notifySyncProgress(`${newProgress.processedUsers}/${newProgress.totalUsers} users processed, ${newProgress.insertedRoles || 0} roles`);
          }
        },
        abortControllerRef.current.signal,
        handleUserAccountRolesPayload
      );
      syncResult = { inserted: result.insertedRoles, errors: result.errors, type: 'user account roles' };
    } else if (isRoles) {
      // Roles Sync
      setRolesProgress({
        status: 'fetching',
        totalRecords: 0,
        processedRecords: 0,
        insertedRecords: 0,
        currentPage: 0,
        totalPages: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const result = await syncRoles(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setRolesProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedRecords !== undefined && newProgress.totalRecords) {
            notifySyncProgress(`${newProgress.processedRecords}/${newProgress.totalRecords} roles`);
          }
        },
        abortControllerRef.current.signal,
        handleRolesPayload
      );
      syncResult = { inserted: result.insertedRecords, errors: result.errors, type: 'roles' };
    } else if (isSuppliers) {
      // Suppliers Sync
      setSuppliersProgress({
        status: 'fetching',
        totalRecords: 0,
        processedRecords: 0,
        insertedRecords: 0,
        currentPage: 0,
        totalPages: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const result = await syncSuppliers(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setSuppliersProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedRecords !== undefined && newProgress.totalRecords) {
            notifySyncProgress(`${newProgress.processedRecords}/${newProgress.totalRecords} suppliers`);
          }
        },
        abortControllerRef.current.signal,
        handleSuppliersPayload
      );
      syncResult = { inserted: result.insertedRecords, errors: result.errors, type: 'suppliers' };
    } else if (isSupplierAddresses) {
      // Supplier Addresses Sync
      setSupplierAddressProgress({
        status: 'fetching',
        totalSuppliers: 0,
        processedSuppliers: 0,
        totalAddresses: 0,
        insertedAddresses: 0,
        currentSupplier: '',
        currentSupplierId: null,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      // Use Electron background sync if enabled
      if (useElectronBackground && isElectronSyncSupported) {
        addLog('info', 'Starting sync in Electron main process...');
        addLog('info', 'Sync will continue even if window is minimized.');
        try {
          await startElectronSync({
            syncType: 'supplier-addresses',
            parameters,
            testMode,
            proxyBaseUrl: PROXY_CONFIG.baseUrl,
            apexBaseUrl: APEX_DB_CONFIG.baseUrl,
          });
          // Electron handles the rest asynchronously - return early
          return;
        } catch (error) {
          addLog('error', `Failed to start Electron sync: ${error}`);
          syncResult = { inserted: 0, errors: 1, type: 'supplier addresses' };
        }
      }
      // Use Web Worker for background sync if enabled
      else if (useBackgroundWorker && isWorkerSupported) {
        addLog('info', 'Starting sync in background thread (Web Worker)...');
        addLog('info', 'UI will remain responsive. You can switch tabs safely.');
        const started = startWorkerSync('supplier-addresses', parameters, testMode);
        if (!started) {
          addLog('error', 'Failed to start Web Worker sync');
          syncResult = { inserted: 0, errors: 1, type: 'supplier addresses' };
        } else {
          // Worker handles the rest asynchronously - return early
          return;
        }
      } else {
        const result = await syncSupplierAddresses(
          parameters,
          testMode,
          addLog,
          (newProgress) => {
            setSupplierAddressProgress((prev) => ({ ...prev, ...newProgress }));
            if (newProgress.processedSuppliers !== undefined && newProgress.totalSuppliers) {
              notifySyncProgress(`${newProgress.processedSuppliers}/${newProgress.totalSuppliers} suppliers, ${newProgress.insertedAddresses || 0} addresses`);
            }
          },
          abortControllerRef.current.signal,
          handleSupplierAddressPayload
        );
        syncResult = { inserted: result.insertedAddresses, errors: result.errors, type: 'supplier addresses' };
      }
    } else if (isSupplierSites) {
      // Supplier Sites Sync
      setSupplierSitesProgress({
        status: 'fetching',
        totalSuppliers: 0,
        processedSuppliers: 0,
        totalSites: 0,
        insertedSites: 0,
        currentSupplier: '',
        currentSupplierId: null,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const result = await syncSupplierSites(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setSupplierSitesProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedSuppliers !== undefined && newProgress.totalSuppliers) {
            notifySyncProgress(`${newProgress.processedSuppliers}/${newProgress.totalSuppliers} suppliers, ${newProgress.insertedSites || 0} sites`);
          }
        },
        abortControllerRef.current.signal,
        handleSupplierSitesPayload
      );
      syncResult = { inserted: result.insertedSites, errors: result.errors, type: 'supplier sites' };
    } else if (isSiteAssignments) {
      // Site Assignments Sync
      setSiteAssignmentsProgress({
        status: 'fetching_sites',
        totalSites: 0,
        processedSites: 0,
        totalAssignments: 0,
        insertedAssignments: 0,
        currentSite: '',
        currentSiteId: null,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const result = await syncSiteAssignments(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setSiteAssignmentsProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedSites !== undefined && newProgress.totalSites) {
            notifySyncProgress(`${newProgress.processedSites}/${newProgress.totalSites} sites, ${newProgress.insertedAssignments || 0} assignments`);
          }
        },
        abortControllerRef.current.signal,
        handleSiteAssignmentsPayload
      );
      syncResult = { inserted: result.insertedAssignments, errors: result.errors, type: 'site assignments' };
    } else if (isGLBalances) {
      // GL Balances (SOAP) Sync
      setGLBalancesProgress({
        status: 'fetching',
        totalRecords: 0,
        processedRecords: 0,
        insertedRecords: 0,
        updatedRecords: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const handleGLBalancesPayload: BalancePayloadCallback = (batchNum, payload, result, error) => {
        setGLBalancesPayloads((prev) => [
          ...prev,
          {
            batchNum,
            recordCount: payload.length,
            payload,
            postResult: result,
            status: (error ? 'error' : (result ? 'success' : 'pending')) as 'error' | 'success' | 'pending',
            errorMessage: error,
          },
        ].slice(-100)); // Keep last 100 batches
      };

      const result = await syncGLBalances(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setGLBalancesProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedRecords !== undefined && newProgress.totalRecords) {
            notifySyncProgress(`${newProgress.processedRecords}/${newProgress.totalRecords} balances`);
          }
        },
        abortControllerRef.current.signal,
        handleGLBalancesPayload,
        verboseConsole
      );
      syncResult = { inserted: result.insertedRecords + result.updatedRecords, errors: result.errors, type: 'GL balances' };
    } else if (isGLBatchesOnly && glSyncMode === 'batch-popup') {
      // ── GL Batches — Batch Popup mode ────────────────────────────────────
      addLog('step', '═══════════════════════════════════════════════════════════');
      addLog('step', '  GL BATCHES SYNC — Fetching Batches (Batch Popup Mode)');
      addLog('step', '═══════════════════════════════════════════════════════════');

      const batches = await fetchGLJournalBatches(
        parameters,
        testMode,
        addLog,
        abortControllerRef.current.signal,
      );

      if (batches.length === 0) {
        addLog('warning', 'No batches found for the given parameters');
        isSyncingRef.current = false;
        return;
      }

      const doneBatchIds = loadDoneBatchIds(parameters);
      const items: BatchListItem[] = batches.map((b: any) => {
        const batchId = b._batchId || 0;
        const isDone = doneBatchIds.has(batchId);
        return {
          batchId,
          batchName: b.JournalBatchName || b.JournalName || `Batch ${batchId}`,
          raw: b,
          status: isDone ? 'done' : 'pending',
          headersCount: 0,
          linesCount: 0,
          headersInserted: 0,
          linesInserted: 0,
        };
      });

      setBatchList(items);
      setBatchListOpen(true);
      isSyncingRef.current = false;
      return; // Modal takes over

    } else if (isGLBatchesOnly) {
      // ── GL Batches — Auto Chain mode (Headers → Lines) ───────────────────
      const runChain = chainGLEnabled;

      if (runChain) {
        setChainStatus({ batches: 'running', headers: 'idle', lines: 'idle', balances: 'idle',
          batchesInserted: 0, headersInserted: 0, linesInserted: 0, balancesInserted: 0,
          batchesErrors: 0, headersErrors: 0, linesErrors: 0, balancesErrors: 0, visible: true });
      }

      setGLBatchesOnlyProgress({
        status: 'counting',
        totalBatches: 0,
        fetchedBatches: 0,
        insertedBatches: 0,
        currentPage: 0,
        totalPages: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const batchResult = await syncGLBatchesOnly(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setGLBatchesOnlyProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.insertedBatches !== undefined && newProgress.totalBatches) {
            notifySyncProgress(`${newProgress.insertedBatches}/${newProgress.totalBatches} batches inserted`);
          }
          if (runChain && newProgress.insertedBatches !== undefined) {
            setChainStatus(prev => ({ ...prev, batchesInserted: newProgress.insertedBatches ?? 0, batchesErrors: newProgress.errors ?? 0 }));
          }
        },
        abortControllerRef.current.signal
      );

      if (runChain) {
        const batchFailed = batchResult.errors > 0 && batchResult.insertedBatches === 0;
        setChainStatus(prev => ({
          ...prev,
          batches: batchFailed ? 'error' : 'success',
          batchesInserted: batchResult.insertedBatches,
          batchesErrors:   batchResult.errors,
          headers:  batchFailed ? 'skipped' : 'running',
          lines:    batchFailed ? 'skipped' : 'idle',
          balances: batchFailed ? 'skipped' : 'idle',
        }));

        if (!batchFailed && !abortControllerRef.current?.signal.aborted) {
          // ── Step 2: GL Headers ──────────────────────────────────────────
          addLog('step', '─────────────────────────────────────────────────────');
          addLog('step', '  CHAIN SYNC: Starting GL Headers');
          addLog('step', '─────────────────────────────────────────────────────');
          setGLHeadersOnlyProgress({
            status: 'fetching_batches', totalBatches: 0, processedBatches: 0,
            currentBatchId: null, totalHeaders: 0, insertedHeaders: 0,
            errors: 0, lastError: '', startTime: new Date(), endTime: null,
          });

          const headersResult = await syncGLHeadersOnly(
            parameters, testMode, addLog,
            (newProgress) => {
              setGLHeadersOnlyProgress((prev) => ({ ...prev, ...newProgress }));
              if (newProgress.insertedHeaders !== undefined) {
                notifySyncProgress(`Headers: ${newProgress.insertedHeaders}/${newProgress.totalHeaders ?? '?'} inserted`);
                setChainStatus(prev => ({ ...prev, headersInserted: newProgress.insertedHeaders ?? 0, headersErrors: newProgress.errors ?? 0 }));
              }
            },
            abortControllerRef.current.signal
          );

          const headersFailed = headersResult.errors > 0 && headersResult.insertedHeaders === 0;
          setChainStatus(prev => ({
            ...prev,
            headers: headersFailed ? 'error' : 'success',
            headersInserted: headersResult.insertedHeaders,
            headersErrors:   headersResult.errors,
            lines:    headersFailed ? 'skipped' : 'running',
            balances: headersFailed ? 'skipped' : 'idle',
          }));

          if (!headersFailed && !abortControllerRef.current?.signal.aborted) {
            // ── Step 3: GL Lines ──────────────────────────────────────────
            addLog('step', '─────────────────────────────────────────────────────');
            addLog('step', '  CHAIN SYNC: Starting GL Lines');
            addLog('step', '─────────────────────────────────────────────────────');
            setGLLinesOnlyProgress({
              status: 'fetching_headers', totalHeaders: 0, processedHeaders: 0,
              currentHeaderId: null, currentBatchId: null, totalLines: 0, insertedLines: 0,
              errors: 0, lastError: '', startTime: new Date(), endTime: null,
            });

            const linesResult = await syncGLLinesOnly(
              parameters, testMode, addLog,
              (newProgress) => {
                setGLLinesOnlyProgress((prev) => ({ ...prev, ...newProgress }));
                if (newProgress.insertedLines !== undefined) {
                  notifySyncProgress(`Lines: ${newProgress.insertedLines}/${newProgress.totalLines ?? '?'} inserted`);
                  setChainStatus(prev => ({ ...prev, linesInserted: newProgress.insertedLines ?? 0, linesErrors: newProgress.errors ?? 0 }));
                }
              },
              abortControllerRef.current.signal
            );

            const linesFailed = linesResult.errors > 0 && linesResult.insertedLines === 0;
            setChainStatus(prev => ({
              ...prev,
              lines:    linesFailed ? 'error' : 'success',
              linesInserted: linesResult.insertedLines,
              linesErrors:   linesResult.errors,
              balances: linesFailed ? 'skipped' : 'running',
            }));

            if (!linesFailed && !abortControllerRef.current?.signal.aborted) {
              // ── Step 4: GL Trial Balance ────────────────────────────────
              addLog('step', '─────────────────────────────────────────────────────');
              addLog('step', '  CHAIN SYNC: Starting GL Trial Balance');
              addLog('step', '─────────────────────────────────────────────────────');
              setGLBalancesProgress({
                status: 'fetching', totalRecords: 0, processedRecords: 0,
                insertedRecords: 0, updatedRecords: 0,
                errors: 0, lastError: '', startTime: new Date(), endTime: null,
              });

              const balancesResult = await syncGLBalances(
                parameters, testMode, addLog,
                (newProgress) => {
                  setGLBalancesProgress((prev) => ({ ...prev, ...newProgress }));
                  if (newProgress.processedRecords !== undefined) {
                    notifySyncProgress(`Balances: ${newProgress.processedRecords}/${newProgress.totalRecords ?? '?'}`);
                    setChainStatus(prev => ({
                      ...prev,
                      balancesInserted: (newProgress.insertedRecords ?? 0) + (newProgress.updatedRecords ?? 0),
                      balancesErrors: newProgress.errors ?? 0,
                    }));
                  }
                },
                abortControllerRef.current.signal,
                undefined,  // no payload callback needed in chain mode
                false
              );

              setChainStatus(prev => ({
                ...prev,
                balances: balancesResult.errors > 0 && (balancesResult.insertedRecords + balancesResult.updatedRecords) === 0 ? 'error' : 'success',
                balancesInserted: balancesResult.insertedRecords + balancesResult.updatedRecords,
                balancesErrors:   balancesResult.errors,
              }));
            }
          }
        }
      }

      syncResult = { inserted: batchResult.insertedBatches, errors: batchResult.errors, type: 'batches' };
    } else if (isGLHeadersOnly) {
      // GL Headers Only Sync
      setGLHeadersOnlyProgress({
        status: 'fetching_batches',
        totalBatches: 0,
        processedBatches: 0,
        currentBatchId: null,
        totalHeaders: 0,
        insertedHeaders: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const result = await syncGLHeadersOnly(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setGLHeadersOnlyProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.insertedHeaders !== undefined && newProgress.totalHeaders) {
            notifySyncProgress(`${newProgress.insertedHeaders}/${newProgress.totalHeaders} headers inserted`);
          }
        },
        abortControllerRef.current.signal
      );
      syncResult = { inserted: result.insertedHeaders, errors: result.errors, type: 'headers' };
    } else if (isGLLinesOnly) {
      // GL Lines Only Sync
      setGLLinesOnlyProgress({
        status: 'fetching_headers',
        totalHeaders: 0,
        processedHeaders: 0,
        currentHeaderId: null,
        currentBatchId: null,
        totalLines: 0,
        insertedLines: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const result = await syncGLLinesOnly(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setGLLinesOnlyProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.insertedLines !== undefined && newProgress.totalLines) {
            notifySyncProgress(`${newProgress.insertedLines}/${newProgress.totalLines} lines inserted`);
          }
        },
        abortControllerRef.current.signal
      );
      syncResult = { inserted: result.insertedLines, errors: result.errors, type: 'lines' };
    } else if (glSyncMode === 'batch-popup') {
      // GL Journals — Batch Popup mode: fetch batches then show modal
      addLog('step', '═══════════════════════════════════════════════════════════');
      addLog('step', '  GL JOURNAL SYNC — Fetching Batches (Batch Popup Mode)');
      addLog('step', '═══════════════════════════════════════════════════════════');

      const batches = await fetchGLJournalBatches(
        parameters,
        testMode,
        addLog,
        abortControllerRef.current.signal,
      );

      if (batches.length === 0) {
        addLog('warning', 'No batches found for the given parameters');
        isSyncingRef.current = false;
        return;
      }

      const doneBatchIds = loadDoneBatchIds(parameters);
      const items: BatchListItem[] = batches.map((b: any) => {
        const batchId = b._batchId || 0;
        const isDone = doneBatchIds.has(batchId);
        return {
          batchId,
          batchName: b.JournalBatchName || b.JournalName || `Batch ${batchId}`,
          raw: b,
          status: isDone ? 'done' : 'pending',
          headersCount: 0,
          linesCount: 0,
          headersInserted: 0,
          linesInserted: 0,
        };
      });

      setBatchList(items);
      setBatchListOpen(true);
      isSyncingRef.current = false;
      return; // Modal takes over from here

    } else {
      // GL Journals — Chain mode: auto process everything in sequence
      setProgress({
        status: 'fetching_batches',
        totalBatches: 0,
        processedBatches: 0,
        currentBatchId: null,
        currentBatchName: '',
        totalHeaders: 0,
        processedHeaders: 0,
        currentHeaderId: null,
        currentHeaderName: '',
        totalLines: 0,
        processedLines: 0,
        totalBatchesInserted: 0,
        totalHeadersInserted: 0,
        totalLinesInserted: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const modeLabel = testMode === 'single' ? 'SINGLE RECORD DEBUG' : (testMode ? 'TEST MODE (25 batches)' : 'FULL SYNC');
      addLog('step', '═══════════════════════════════════════════════════════════');
      addLog('step', `  GL JOURNAL SYNC — Chain Mode — ${modeLabel}`);
      addLog('step', '═══════════════════════════════════════════════════════════');

      const result = await syncGLJournals(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedBatches !== undefined && newProgress.totalBatches) {
            notifySyncProgress(`${newProgress.processedBatches}/${newProgress.totalBatches} batches`);
          }
        },
        abortControllerRef.current.signal,
        handleBatchPayload
      );
      syncResult = { inserted: result.totalBatchesInserted + result.totalHeadersInserted + result.totalLinesInserted, errors: result.errors, type: 'records' };
    }

    // Notify Electron of sync completion
    if (syncResult.errors > 0) {
      notifySyncError(`Sync completed with ${syncResult.errors} errors. ${syncResult.inserted} ${syncResult.type} inserted.`);
    } else {
      notifySyncCompleted(`${syncResult.inserted} ${syncResult.type} synced successfully!`);
    }

    isSyncingRef.current = false;
  };

  const handleStop = () => {
    isSyncingRef.current = false;
    abortControllerRef.current?.abort();

    // Stop Web Worker if running
    if (isWorkerRunning) {
      stopWorkerSync();
      addLog('warning', '⚠ Stopping Web Worker sync...');
    }

    // Stop Electron background sync if running
    if (useElectronBackground) {
      stopElectronSync();
      addLog('warning', '⚠ Stopping Electron background sync...');
    }

    addLog('warning', '⚠ Stopping sync...');
  };

  const handleProcessBatches = async () => {
    const parameters = getParameters();
    setBatchSyncing(true);
    batchAbortRef.current = new AbortController();
    const signal = batchAbortRef.current.signal;

    for (let i = 0; i < batchList.length; i++) {
      if (signal.aborted) break;
      const item = batchList[i];
      if (item.status === 'done') continue; // skip already synced

      // Mark as syncing
      setBatchList(prev => prev.map((b, idx) =>
        idx === i ? { ...b, status: 'syncing' as const } : b
      ));

      addLog('info', `Processing batch ${i + 1}/${batchList.length}: ${item.batchName}`);

      try {
        const result = await processSingleGLBatch(
          item.raw,
          addLog,
          signal,
        );

        const newStatus: BatchListItem['status'] = result.errors > 0 ? 'error' : 'done';

        setBatchList(prev => prev.map((b, idx) =>
          idx === i ? {
            ...b,
            status: newStatus,
            headersCount: result.headersCount,
            linesCount: result.linesCount,
            headersInserted: result.headersInserted,
            linesInserted: result.linesInserted,
            errorMsg: result.errors > 0 ? result.lastError : undefined,
          } : b
        ));

        if (newStatus === 'done') {
          saveDoneBatchId(parameters, item.batchId);
          addLog('success', `✓ Batch ${item.batchName}: ${result.headersInserted} headers, ${result.linesInserted} lines`);
        } else {
          addLog('error', `✗ Batch ${item.batchName}: ${result.lastError}`);
        }
      } catch (e: any) {
        setBatchList(prev => prev.map((b, idx) =>
          idx === i ? { ...b, status: 'error' as const, errorMsg: String(e) } : b
        ));
        addLog('error', `✗ Batch ${item.batchName} error: ${e}`);
      }
    }

    setBatchSyncing(false);
    addLog('success', 'Batch processing complete');
  };

  const handleStopBatchSync = () => {
    batchAbortRef.current?.abort();
    setBatchSyncing(false);
    addLog('warning', '⚠ Batch sync stopped');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return REDWOOD.success;
      case 'error': return REDWOOD.error;
      case 'stopped': return REDWOOD.warning;
      default: return REDWOOD.info;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'idle': return 'Ready';
      case 'counting': return 'Counting Records...';
      case 'fetching': return 'Fetching Data...';
      case 'fetching_batches': return 'Fetching Batches...';
      case 'processing_batch': return 'Processing Batch...';
      case 'fetching_headers': return 'Fetching Headers...';
      case 'processing_header': return 'Processing Header...';
      case 'fetching_lines': return 'Fetching Lines...';
      case 'inserting': return 'Inserting to APEX...';
      case 'completed': return 'Completed';
      case 'error': return 'Error';
      case 'stopped': return 'Stopped';
      default: return status;
    }
  };

  const getLogIcon = (type: SyncLog['type']) => {
    switch (type) {
      case 'success': return <CheckCircleOutlined style={{ color: REDWOOD.success }} />;
      case 'error': return <CloseCircleOutlined style={{ color: REDWOOD.error }} />;
      case 'warning': return <WarningOutlined style={{ color: REDWOOD.warning }} />;
      case 'step': return <ThunderboltOutlined style={{ color: REDWOOD.primary }} />;
      default: return <InfoCircleOutlined style={{ color: REDWOOD.info }} />;
    }
  };

  const handleViewLog = (log: SyncLog) => {
    setSelectedLog(log);
    setLogDetailVisible(true);
  };

  // Try to format JSON if the message contains JSON
  const formatLogMessage = (message: string) => {
    // Check if message contains JSON object or array
    const jsonMatch = message.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const before = message.substring(0, jsonMatch.index);
        const after = message.substring((jsonMatch.index || 0) + jsonMatch[0].length);
        return (
          <>
            {before && <div style={{ marginBottom: 8 }}>{before}</div>}
            <pre style={{
              background: REDWOOD.surfaceSecondary,
              padding: 12,
              borderRadius: 8,
              overflow: 'auto',
              maxHeight: 400,
              fontSize: 12,
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {JSON.stringify(parsed, null, 2)}
            </pre>
            {after && <div style={{ marginTop: 8 }}>{after}</div>}
          </>
        );
      } catch {
        // Not valid JSON, return as-is
      }
    }
    // Check for URLs
    if (message.includes('http://') || message.includes('https://')) {
      return (
        <div style={{
          wordBreak: 'break-all',
          fontFamily: 'monospace',
          fontSize: 12,
          lineHeight: 1.6,
        }}>
          {message}
        </div>
      );
    }
    return message;
  };

  const logColumns = [
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 90,
      render: (date: Date) => (
        <Text style={{ fontSize: 11, color: REDWOOD.textSecondary }}>
          {date.toLocaleTimeString()}
        </Text>
      ),
    },
    {
      title: 'Message',
      dataIndex: 'message',
      key: 'message',
      render: (message: string, record: SyncLog) => (
        <Space>
          {getLogIcon(record.type)}
          <Text
            style={{
              fontSize: 12,
              fontFamily: record.type === 'step' ? 'monospace' : 'inherit',
              fontWeight: record.type === 'step' ? 600 : 400,
              color: record.type === 'step' ? REDWOOD.primary : REDWOOD.textPrimary,
              maxWidth: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'inline-block',
            }}
          >
            {message}
          </Text>
        </Space>
      ),
    },
    {
      title: '',
      key: 'action',
      width: 40,
      render: (_: unknown, record: SyncLog) => (
        <Tooltip title="View full message">
          <Button
            type="text"
            size="small"
            icon={<ExpandOutlined style={{ color: REDWOOD.info }} />}
            onClick={() => handleViewLog(record)}
          />
        </Tooltip>
      ),
    },
  ];

  // Check if syncing based on current object type
  const currentStatus = isAPPayments
    ? apPaymentsProgress.status
    : isAPInvoices
    ? apProgress.status
    : isGLBatchesOnly
    ? glBatchesOnlyProgress.status
    : isGLHeadersOnly
    ? glHeadersOnlyProgress.status
    : isGLLinesOnly
    ? glLinesOnlyProgress.status
    : isGLCodeComb
    ? codeCombProgress.status
    : isGLPeriodStatus
    ? periodStatusProgress.status
    : isBanks
    ? banksProgress.status
    : isBankBranches
    ? bankBranchesProgress.status
    : isBankAccounts
    ? bankAccountsProgress.status
    : isBankAccountTransfers
    ? bankAccountTransfersProgress.status
    : isExternalCashTxn
    ? externalCashTxnProgress.status
    : isLegalEntities
    ? legalEntitiesProgress.status
    : isBusinessUnits
    ? businessUnitsProgress.status
    : isUserAccounts
    ? userAccountsProgress.status
    : isUserAccountRoles
    ? userAccountRolesProgress.status
    : isRoles
    ? rolesProgress.status
    : isSuppliers
    ? suppliersProgress.status
    : isSupplierAddresses
    ? supplierAddressProgress.status
    : isSupplierSites
    ? supplierSitesProgress.status
    : isSiteAssignments
    ? siteAssignmentsProgress.status
    : progress.status;
  const isSyncing = !['idle', 'completed', 'error', 'stopped'].includes(currentStatus);

  // Calculate progress percentages for GL
  const batchProgress = progress.totalBatches > 0
    ? Math.round((progress.processedBatches / progress.totalBatches) * 100)
    : 0;

  // Calculate progress percentages for AP
  const invoiceProgress = apProgress.totalInvoices > 0
    ? Math.round((apProgress.processedInvoices / apProgress.totalInvoices) * 100)
    : 0;

  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', background: REDWOOD.surfaceSecondary }}>
      <Content>
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          background: REDWOOD.surface,
          borderBottom: `1px solid ${REDWOOD.border}`
        }}>
          <Breadcrumb
            items={[
              { title: <Link to="/home"><HomeOutlined /> Home</Link> },
              { title: 'Sync Data' },
            ]}
          />
        </div>

        <div style={{ padding: 24 }}>
          {/* Title Section */}
          <div style={{ marginBottom: 24 }}>
            <Space align="center">
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                background: REDWOOD.primary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <SyncOutlined style={{ fontSize: 24, color: '#fff' }} spin={isSyncing || isTesting} />
              </div>
              <div>
                <Title level={3} style={{ margin: 0, color: REDWOOD.textPrimary }}>
                  Data Synchronization
                </Title>
                <Text type="secondary">Oracle Fusion → APEX Database</Text>
              </div>
              <Tag color={REDWOOD.primary} style={{ marginLeft: 16 }}>v{SYNC_VERSION}</Tag>
            </Space>
          </div>

          <Row gutter={24}>
            {/* Left Panel - Configuration */}
            <Col xs={24} lg={7}>
              <Card
                style={{
                  borderRadius: 12,
                  border: `1px solid ${REDWOOD.border}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}
                bodyStyle={{ padding: 20 }}
              >
                <Title level={5} style={{ marginBottom: 16, color: REDWOOD.textPrimary }}>
                  <DatabaseOutlined style={{ marginRight: 8, color: REDWOOD.primary }} />
                  Configuration
                </Title>

                <Form
                  form={form}
                  layout="vertical"
                  onValuesChange={(changedValues) => {
                    // Re-fetch dependent api-select dropdowns when their dependency changes
                    if (!selectedObject) return;
                    const changedKey = Object.keys(changedValues)[0];
                    if (!changedKey) return;
                    selectedObject.parameters.forEach((param) => {
                      if (
                        param.type === 'api-select' &&
                        param.apiUrl &&
                        param.dependsOn === changedKey
                      ) {
                        fetchApiSelectOptions(
                          param.key,
                          param.apiUrl,
                          param.apiLabelKey!,
                          param.apiValueKey!,
                          param.apiCountKey,
                          param.apiFilterParam,
                          changedValues[changedKey] || undefined,
                          param.apiSubLabelKey,
                        );
                      }
                    });
                  }}
                >
                  <Form.Item
                    label={<Text strong>Sync Object</Text>}
                    name="syncObject"
                    rules={[{ required: true, message: 'Please select a sync object' }]}
                  >
                    <Select
                      placeholder="Select object to sync"
                      onChange={handleObjectChange}
                      disabled={isSyncing || isTesting}
                      size="large"
                    >
                      {SYNC_OBJECTS.map((obj) => (
                        <Option key={obj.id} value={obj.id}>
                          {obj.name}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>

                  {selectedObject && (
                    <Alert
                      message={selectedObject.description}
                      type="info"
                      showIcon
                      style={{ marginBottom: 16, borderRadius: 8 }}
                    />
                  )}

                  <Form.Item label={<Text strong>API Type</Text>} name="apiType" initialValue="REST">
                    <Select disabled={isSyncing || isTesting} onChange={(v) => setApiType(v)}>
                      <Option value="REST">REST API</Option>
                      <Option value="SOAP" disabled>SOAP (Coming Soon)</Option>
                    </Select>
                  </Form.Item>

                  {selectedObject?.parameters.map((param) => (
                    <React.Fragment key={param.key}>
                      <Form.Item
                        label={
                          <Space size={6}>
                            <Text strong>{param.label}</Text>
                            {param.type === 'api-select' && param.apiUrl && (
                              <Tooltip title="View webservice URL">
                                <ApiOutlined
                                  style={{ color: '#888', cursor: 'pointer', fontSize: 13 }}
                                  onClick={() => {
                                    const dependsValue = param.dependsOn ? form.getFieldValue(param.dependsOn) : undefined;
                                    let url = param.apiUrl!;
                                    if (param.apiFilterParam && dependsValue) {
                                      url += (url.includes('?') ? '&' : '?') + `${param.apiFilterParam}=${encodeURIComponent(dependsValue)}`;
                                    }
                                    Modal.info({
                                      title: `${param.label} — Webservice URL`,
                                      width: 620,
                                      content: (
                                        <div>
                                          <Text type="secondary" style={{ fontSize: 12 }}>
                                            URL called to populate this dropdown:
                                          </Text>
                                          <div style={{
                                            marginTop: 8,
                                            padding: '10px 14px',
                                            background: '#f5f5f5',
                                            borderRadius: 6,
                                            fontFamily: 'monospace',
                                            fontSize: 12,
                                            wordBreak: 'break-all',
                                            color: '#C74634',
                                          }}>
                                            {url}
                                          </div>
                                          {param.dependsOn && (
                                            <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
                                              Depends on: <strong>{param.dependsOn}</strong>
                                              {dependsValue ? ` = "${dependsValue}"` : ' (not selected yet)'}
                                            </Text>
                                          )}
                                          <div style={{ marginTop: 12 }}>
                                            <Button
                                              size="small"
                                              icon={<CopyOutlined />}
                                              onClick={() => navigator.clipboard.writeText(url)}
                                            >
                                              Copy URL
                                            </Button>
                                          </div>
                                        </div>
                                      ),
                                    });
                                  }}
                                />
                              </Tooltip>
                            )}
                          </Space>
                        }
                        name={param.key}
                        rules={[{ required: param.required, message: `Please enter ${param.label}` }]}
                        initialValue={param.defaultValue}
                      >
                        {param.type === 'select' && param.options ? (
                          <Select placeholder={param.placeholder || `Select ${param.label}`} disabled={isSyncing || isTesting}>
                            {param.options.map((opt) => (
                              <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                            ))}
                          </Select>
                        ) : param.type === 'api-select' ? (
                          <Select
                            showSearch
                            allowClear
                            placeholder={param.placeholder || `Select ${param.label}`}
                            disabled={isSyncing || isTesting}
                            loading={apiSelectOptions[param.key]?.loading}
                            filterOption={(input, option) => {
                              const lc = input.toLowerCase();
                              return (
                                String(option?.label ?? '').toLowerCase().includes(lc) ||
                                String((option as any)?.subLabel ?? '').toLowerCase().includes(lc)
                              );
                            }}
                            notFoundContent={
                              apiSelectOptions[param.key]?.loading ? 'Loading…' : 'No results found'
                            }
                          >
                            {(apiSelectOptions[param.key]?.items || []).map((opt) => (
                              <Option key={opt.value} value={opt.value} label={opt.label} subLabel={opt.subLabel}>
                                {opt.subLabel ? (
                                  <div style={{ lineHeight: 1.3 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{opt.label}</div>
                                    <div style={{ color: '#888', fontSize: 11 }}>{opt.subLabel}</div>
                                  </div>
                                ) : (
                                  <span style={{ fontWeight: 600 }}>{opt.label}</span>
                                )}
                                {opt.count !== undefined && (
                                  <span style={{ float: 'right', color: '#888', fontSize: 12 }}>
                                    {opt.count.toLocaleString()} batches
                                  </span>
                                )}
                              </Option>
                            ))}
                          </Select>
                        ) : (
                          <Input placeholder={param.placeholder || `Enter ${param.label}`} disabled={isSyncing || isTesting} />
                        )}
                      </Form.Item>
                      {param.key === 'SupplierNumber' && isAPInvoices && !isSyncing && (
                        <div style={{ padding: '10px 14px', background: REDWOOD.surfaceSecondary, borderRadius: 8, marginBottom: 12 }}>
                          <div style={{ marginBottom: 8 }}>
                            <Checkbox checked={chainAPPayments} onChange={e => setChainAPPayments(e.target.checked)}>
                              <Text style={{ fontSize: 12 }}>Also sync AP Payments after invoices</Text>
                            </Checkbox>
                          </div>
                          <Button
                            size="small"
                            type="primary"
                            icon={<DatabaseOutlined />}
                            style={{ width: '100%' }}
                            onClick={async () => {
                              const buParam = form.getFieldValue('BusinessUnit');
                              const url = buParam
                                ? `https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/suppliers?P_BUSINESS_UNIT=${encodeURIComponent(buParam)}`
                                : 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp/suppliers';
                              try {
                                const resp = await fetch(url);
                                const data = await resp.json();
                                const list: SupplierSyncItem[] = (data.items || []).map((s: any) => ({
                                  supplierNumber: s.supplier_number,
                                  supplierName: s.supplier,
                                  status: 'pending' as const,
                                  invoicesInserted: 0,
                                  paymentsInserted: 0,
                                  errors: 0,
                                }));
                                setSupplierSyncList(list);
                                setAllSuppliersMode(true);
                                setSupplierSyncOpen(true);
                              } catch {
                                Modal.error({ title: 'Failed to fetch suppliers', content: 'Check your connection and try again.' });
                              }
                            }}
                          >
                            Sync All Suppliers
                          </Button>
                        </div>
                      )}
                    </React.Fragment>
                  ))}

                  <Divider style={{ margin: '16px 0' }} />

                  {/* Sync Mode Selection */}
                  <div style={{
                    marginBottom: 16,
                    padding: '12px 16px',
                    background: REDWOOD.surfaceSecondary,
                    borderRadius: 8,
                  }}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>Sync Mode</Text>
                    <Select
                      value={testMode}
                      onChange={(value) => setTestMode(value)}
                      disabled={isSyncing}
                      style={{ width: '100%' }}
                    >
                      <Option value="single">
                        <span style={{ color: REDWOOD.warning }}>●</span> Single Record (Debug)
                      </Option>
                      <Option value={true}>
                        <span style={{ color: REDWOOD.info }}>●</span> Test Mode (25 {isAPPayments ? 'payments' : isAPInvoices ? 'invoices' : isGLCodeComb ? 'records' : 'batches'})
                      </Option>
                      <Option value={false}>
                        <span style={{ color: REDWOOD.success }}>●</span> Full Sync ({isAPPayments ? 'All payments' : isAPInvoices ? 'All invoices' : 'All records'})
                      </Option>
                    </Select>
                    <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                      {testMode === 'single'
                        ? `Debug mode: Sync only 1 ${isAPPayments ? 'payment' : isAPInvoices ? 'invoice' : isGLCodeComb ? 'code combination' : 'batch'} with full logging`
                        : testMode
                        ? `Limited to 25 ${isAPPayments ? 'payments' : isAPInvoices ? 'invoices' : isGLCodeComb ? 'code combinations' : 'batches'} for testing`
                        : isAPPayments
                        ? 'Full sync - all payments (paginated 25 per page)'
                        : isAPInvoices
                        ? 'Full sync - all invoices (paginated 25 per page)'
                        : isGLCodeComb
                        ? 'Full sync - all code combinations (paginated 500 per page)'
                        : 'Full sync - all matching records'}
                    </Text>
                  </div>

                  {/* Background Options */}
                  {isSupplierAddresses && (isWorkerSupported || isElectronSyncSupported) && (
                    <div style={{
                      marginBottom: 16,
                      padding: '12px 16px',
                      background: REDWOOD.surfaceSecondary,
                      borderRadius: 8,
                    }}>
                      <Text strong style={{ display: 'block', marginBottom: 8 }}>Background Processing</Text>

                      {/* Web Worker Option */}
                      {isWorkerSupported && (
                        <div style={{ marginBottom: 8 }}>
                          <Checkbox
                            checked={useBackgroundWorker && !useElectronBackground}
                            onChange={(e) => {
                              setUseBackgroundWorker(e.target.checked);
                              if (e.target.checked) setUseElectronBackground(false);
                            }}
                            disabled={isSyncing}
                          >
                            Web Worker (Browser Thread)
                          </Checkbox>
                        </div>
                      )}

                      {/* Electron Option */}
                      {isElectronSyncSupported && (
                        <div style={{ marginBottom: 8 }}>
                          <Checkbox
                            checked={useElectronBackground}
                            onChange={(e) => {
                              setUseElectronBackground(e.target.checked);
                              if (e.target.checked) setUseBackgroundWorker(false);
                            }}
                            disabled={isSyncing}
                          >
                            Electron (Main Process)
                          </Checkbox>
                        </div>
                      )}

                      <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                        {useElectronBackground
                          ? 'Runs in Electron main process. Can continue even if window is minimized.'
                          : useBackgroundWorker
                          ? 'Runs in browser Web Worker. UI remains responsive.'
                          : 'Select an option for long-running sync to prevent UI freezing.'}
                      </Text>

                      {!isRunningInElectron && (
                        <Text type="warning" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                          ⚠️ Not running in Electron. Electron option requires desktop app.
                        </Text>
                      )}
                    </div>
                  )}

                  {/* Verbose Console Option */}
                  <div style={{
                    marginBottom: 16,
                    padding: '12px 16px',
                    background: REDWOOD.surfaceSecondary,
                    borderRadius: 8,
                  }}>
                    <Checkbox
                      checked={verboseConsole}
                      onChange={(e) => setVerboseConsole(e.target.checked)}
                      disabled={isSyncing}
                    >
                      <Text strong>Show Console Logs</Text>
                    </Checkbox>
                    <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block', marginLeft: 24 }}>
                      {verboseConsole
                        ? 'Logs are shown in browser console (may affect performance).'
                        : 'Console logs disabled. Logs still appear in the panel below.'}
                    </Text>
                  </div>

                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <Button
                      icon={<ApiOutlined />}
                      onClick={handleTestConnection}
                      disabled={isSyncing || isTesting}
                      loading={isTesting}
                      block
                      size="large"
                      style={{ borderRadius: 8 }}
                    >
                      Test Connection
                    </Button>

                    {isGLBatchesOnly && !isSyncing && (
                      <div style={{
                        background: '#fffbe6',
                        border: '1px solid #ffe58f',
                        borderRadius: 8,
                        padding: '10px 14px',
                      }}>
                        <Checkbox
                          checked={chainGLEnabled}
                          onChange={e => setChainGLEnabled(e.target.checked)}
                        >
                          <span style={{ fontWeight: 600, fontSize: 13 }}>Chain Sync</span>
                        </Checkbox>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 4, marginLeft: 24 }}>
                          After batches → auto-run GL Headers → GL Lines
                        </div>
                      </div>
                    )}

                    {(isGLJournals || isGLBatchesOnly) && !isSyncing && (
                      <div style={{
                        padding: '10px 14px',
                        background: REDWOOD.surfaceSecondary,
                        borderRadius: 8,
                        marginBottom: 4,
                      }}>
                        <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Sync Mode</Text>
                        <Space>
                          <Button
                            size="small"
                            type={glSyncMode === 'chain' ? 'primary' : 'default'}
                            onClick={() => setGlSyncMode('chain')}
                            style={glSyncMode === 'chain' ? { background: REDWOOD.primary, borderColor: REDWOOD.primary } : {}}
                          >
                            Auto Chain
                          </Button>
                          <Button
                            size="small"
                            type={glSyncMode === 'batch-popup' ? 'primary' : 'default'}
                            onClick={() => setGlSyncMode('batch-popup')}
                            style={glSyncMode === 'batch-popup' ? { background: REDWOOD.primary, borderColor: REDWOOD.primary } : {}}
                          >
                            Batch Popup
                          </Button>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
                          {glSyncMode === 'chain'
                            ? 'Processes all batches automatically in sequence.'
                            : 'Shows batch list — process one by one, resume after refresh.'}
                        </Text>
                      </div>
                    )}

                    {!isSyncing ? (
                      <Button
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        size="large"
                        onClick={handleSync}
                        disabled={!selectedObject || isTesting}
                        block
                        style={{
                          borderRadius: 8,
                          background: REDWOOD.primary,
                          borderColor: REDWOOD.primary,
                          height: 48,
                        }}
                      >
                        {isGLBatchesOnly && chainGLEnabled ? 'Start Chain Sync' : 'Start Sync'}
                      </Button>
                    ) : (
                      <Button
                        danger
                        icon={<StopOutlined />}
                        size="large"
                        onClick={handleStop}
                        block
                        style={{ borderRadius: 8, height: 48 }}
                      >
                        Stop Sync
                      </Button>
                    )}
                  </Space>
                </Form>

                {/* Proxy Status */}
                <Divider style={{ margin: '16px 0' }} />
                <div style={{
                  padding: 16,
                  background: proxyStatus === 'online' ? '#f6ffed' : proxyStatus === 'offline' ? '#fff2f0' : REDWOOD.surfaceSecondary,
                  borderRadius: 8,
                  border: `1px solid ${proxyStatus === 'online' ? '#b7eb8f' : proxyStatus === 'offline' ? '#ffccc7' : REDWOOD.border}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text strong>Proxy Server</Text>
                    <Tag
                      color={
                        proxyStatus === 'online' ? 'success' :
                        proxyStatus === 'offline' ? 'error' :
                        proxyStatus === 'checking' ? 'processing' : 'default'
                      }
                    >
                      {proxyStatus === 'online' ? '● ONLINE' :
                       proxyStatus === 'offline' ? '● OFFLINE' :
                       proxyStatus === 'checking' ? '● CHECKING...' : '● UNKNOWN'}
                    </Tag>
                  </div>

                  <div style={{ fontSize: 12, marginBottom: 8 }}>
                    <Text type="secondary">{PROXY_CONFIG.baseUrl}</Text>
                  </div>

                  {proxyError && (
                    <div style={{ fontSize: 11, color: REDWOOD.error, marginBottom: 8 }}>
                      Error: {proxyError}
                    </div>
                  )}

                  <Button
                    size="small"
                    icon={<ApiOutlined />}
                    onClick={checkProxyStatus}
                    loading={proxyStatus === 'checking'}
                    style={{ marginBottom: 8 }}
                    block
                  >
                    Check Proxy Status
                  </Button>

                  {proxyStatus === 'offline' && (
                    <Alert
                      message="Start proxy server"
                      description={
                        <div style={{ fontSize: 11 }}>
                          <div>Open a terminal and run:</div>
                          <code style={{
                            display: 'block',
                            background: '#fff',
                            padding: '4px 8px',
                            borderRadius: 4,
                            marginTop: 4,
                            fontSize: 11,
                          }}>
                            cd C:\FusionApi\reacterp<br/>
                            node server/proxy.cjs
                          </code>
                        </div>
                      }
                      type="error"
                      showIcon
                      style={{ borderRadius: 6, marginTop: 8 }}
                    />
                  )}
                </div>
              </Card>
            </Col>

            {/* Right Panel - Progress & Logs */}
            <Col xs={24} lg={17}>
              {/* Progress Cards - Conditional based on sync type */}
              {isAPPayments ? (
                /* AP Payments KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Payments Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <DatabaseOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Payments</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {apPaymentsProgress.insertedPayments} / {apPaymentsProgress.totalPayments}
                      </div>
                      <Progress
                        percent={apPaymentsProgress.totalPayments > 0 ? Math.round((apPaymentsProgress.insertedPayments / apPaymentsProgress.totalPayments) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {apPaymentsProgress.currentPaymentNumber && (
                        <Tooltip title={apPaymentsProgress.currentPaymentNumber}>
                          <Text
                            type="secondary"
                            style={{ fontSize: 11, display: 'block', marginTop: 4 }}
                            ellipsis
                          >
                            {apPaymentsProgress.currentPaymentNumber}
                          </Text>
                        </Tooltip>
                      )}
                      {apPaymentsProgress.currentPage > 0 && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>
                          Page {apPaymentsProgress.currentPage}/{apPaymentsProgress.totalPages}
                        </Text>
                      )}
                    </Card>
                  </Col>

                  {/* Related Invoices Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Related Invoices</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {apPaymentsProgress.processedRelatedInvoices}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {apPaymentsProgress.totalRelatedInvoices}
                        </Text>
                      </div>
                      <Progress
                        percent={apPaymentsProgress.totalRelatedInvoices > 0 ? Math.round((apPaymentsProgress.processedRelatedInvoices / apPaymentsProgress.totalRelatedInvoices) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: apPaymentsProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: apPaymentsProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {apPaymentsProgress.errors}
                      </div>
                      {apPaymentsProgress.lastError && (
                        <Tooltip title={apPaymentsProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {apPaymentsProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isAPInvoices ? (
                /* AP Invoices KPI Cards */
                <>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Invoices Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileSearchOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Invoices</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {apProgress.insertedInvoices} / {apProgress.totalInvoices}
                      </div>
                      <Progress
                        percent={invoiceProgress}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {apProgress.currentInvoiceNumber && (
                        <Tooltip title={apProgress.currentInvoiceNumber}>
                          <Text
                            type="secondary"
                            style={{ fontSize: 11, display: 'block', marginTop: 4 }}
                            ellipsis
                          >
                            {apProgress.currentInvoiceNumber}
                          </Text>
                        </Tooltip>
                      )}
                      {apProgress.currentPage > 0 && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>
                          Page {apProgress.currentPage}/{apProgress.totalPages}
                        </Text>
                      )}
                    </Card>
                  </Col>

                  {/* Headers Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.info, marginRight: 8 }} />
                        <Text strong>Headers</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {apProgress.processedHeaders}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {apProgress.totalHeaders}
                        </Text>
                      </div>
                      <Progress
                        percent={apProgress.totalHeaders > 0 ? Math.round((apProgress.processedHeaders / apProgress.totalHeaders) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.info}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Lines Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <UnorderedListOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Lines</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {apProgress.processedLines}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {apProgress.totalLines}
                        </Text>
                      </div>
                      <Progress
                        percent={apProgress.totalLines > 0 ? Math.round((apProgress.processedLines / apProgress.totalLines) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>
                </Row>

                {/* Row 2: Distributions · Installments */}
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Distributions Card */}
                  <Col xs={24} sm={12}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <BranchesOutlined style={{ fontSize: 20, color: REDWOOD.warning, marginRight: 8 }} />
                        <Text strong>Distributions</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {apProgress.processedDistributions}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {apProgress.totalDistributions}
                        </Text>
                      </div>
                      <Progress
                        percent={apProgress.totalDistributions > 0 ? Math.round((apProgress.processedDistributions / apProgress.totalDistributions) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.warning}
                        style={{ marginTop: 8 }}
                      />
                      {apProgress.errors > 0 && (
                        <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                          {apProgress.errors} errors
                        </Text>
                      )}
                    </Card>
                  </Col>

                  {/* Installments Card */}
                  <Col xs={24} sm={12}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <ScheduleOutlined style={{ fontSize: 20, color: '#722ed1', marginRight: 8 }} />
                        <Text strong>Installments</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {apProgress.processedInstallments}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {apProgress.totalInstallments}
                        </Text>
                      </div>
                      <Progress
                        percent={apProgress.totalInstallments > 0 ? Math.round((apProgress.processedInstallments / apProgress.totalInstallments) * 100) : 0}
                        showInfo={false}
                        strokeColor="#722ed1"
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>
                </Row>
                </>
              ) : isGLBatchesOnly ? (
                /* GL Batches Only KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Batches Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <DatabaseOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>GL Batches</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {glBatchesOnlyProgress.insertedBatches} / {glBatchesOnlyProgress.totalBatches}
                      </div>
                      <Progress
                        percent={glBatchesOnlyProgress.totalBatches > 0 ? Math.round((glBatchesOnlyProgress.insertedBatches / glBatchesOnlyProgress.totalBatches) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {glBatchesOnlyProgress.currentPage > 0 && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                          Page {glBatchesOnlyProgress.currentPage}/{glBatchesOnlyProgress.totalPages}
                        </Text>
                      )}
                    </Card>
                  </Col>

                  {/* Fetched Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Fetched</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {glBatchesOnlyProgress.fetchedBatches}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {glBatchesOnlyProgress.totalBatches}
                        </Text>
                      </div>
                      <Progress
                        percent={glBatchesOnlyProgress.totalBatches > 0 ? Math.round((glBatchesOnlyProgress.fetchedBatches / glBatchesOnlyProgress.totalBatches) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: glBatchesOnlyProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: glBatchesOnlyProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {glBatchesOnlyProgress.errors}
                      </div>
                      {glBatchesOnlyProgress.lastError && (
                        <Tooltip title={glBatchesOnlyProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {glBatchesOnlyProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isGLHeadersOnly ? (
                /* GL Headers Only KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Headers Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <DatabaseOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>GL Headers</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {glHeadersOnlyProgress.insertedHeaders} / {glHeadersOnlyProgress.totalHeaders}
                      </div>
                      <Progress
                        percent={glHeadersOnlyProgress.totalHeaders > 0 ? Math.round((glHeadersOnlyProgress.insertedHeaders / glHeadersOnlyProgress.totalHeaders) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {glHeadersOnlyProgress.currentBatchId && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                          Batch ID: {glHeadersOnlyProgress.currentBatchId}
                        </Text>
                      )}
                    </Card>
                  </Col>

                  {/* Batches Processed Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Batches Processed</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {glHeadersOnlyProgress.processedBatches}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {glHeadersOnlyProgress.totalBatches}
                        </Text>
                      </div>
                      <Progress
                        percent={glHeadersOnlyProgress.totalBatches > 0 ? Math.round((glHeadersOnlyProgress.processedBatches / glHeadersOnlyProgress.totalBatches) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: glHeadersOnlyProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: glHeadersOnlyProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {glHeadersOnlyProgress.errors}
                      </div>
                      {glHeadersOnlyProgress.lastError && (
                        <Tooltip title={glHeadersOnlyProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {glHeadersOnlyProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isGLLinesOnly ? (
                /* GL Lines Only KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Lines Inserted Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <UnorderedListOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Lines Inserted</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {glLinesOnlyProgress.insertedLines} / {glLinesOnlyProgress.totalLines}
                      </div>
                      <Progress
                        percent={glLinesOnlyProgress.totalLines > 0 ? Math.round((glLinesOnlyProgress.insertedLines / glLinesOnlyProgress.totalLines) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {glLinesOnlyProgress.currentHeaderId && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                          Header ID: {glLinesOnlyProgress.currentHeaderId} | Batch ID: {glLinesOnlyProgress.currentBatchId}
                        </Text>
                      )}
                    </Card>
                  </Col>

                  {/* Headers Processed Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Headers Processed</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {glLinesOnlyProgress.processedHeaders}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {glLinesOnlyProgress.totalHeaders}
                        </Text>
                      </div>
                      <Progress
                        percent={glLinesOnlyProgress.totalHeaders > 0 ? Math.round((glLinesOnlyProgress.processedHeaders / glLinesOnlyProgress.totalHeaders) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: glLinesOnlyProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: glLinesOnlyProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {glLinesOnlyProgress.errors}
                      </div>
                      {glLinesOnlyProgress.lastError && (
                        <Tooltip title={glLinesOnlyProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {glLinesOnlyProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isGLCodeComb ? (
                /* GL Code Combinations KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Records Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <DatabaseOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Code Combinations</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {codeCombProgress.insertedRecords} / {codeCombProgress.totalRecords}
                      </div>
                      <Progress
                        percent={codeCombProgress.totalRecords > 0 ? Math.round((codeCombProgress.insertedRecords / codeCombProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {codeCombProgress.currentPage > 0 && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                          Page {codeCombProgress.currentPage}/{codeCombProgress.totalPages}
                        </Text>
                      )}
                    </Card>
                  </Col>

                  {/* Processed Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Processed</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {codeCombProgress.processedRecords}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {codeCombProgress.totalRecords}
                        </Text>
                      </div>
                      <Progress
                        percent={codeCombProgress.totalRecords > 0 ? Math.round((codeCombProgress.processedRecords / codeCombProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: codeCombProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: codeCombProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {codeCombProgress.errors}
                      </div>
                      {codeCombProgress.lastError && (
                        <Tooltip title={codeCombProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {codeCombProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isGLPeriodStatus ? (
                /* GL Period Status KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Records Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <DatabaseOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Period Statuses</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {periodStatusProgress.insertedRecords} / {periodStatusProgress.totalRecords}
                      </div>
                      <Progress
                        percent={periodStatusProgress.totalRecords > 0 ? Math.round((periodStatusProgress.insertedRecords / periodStatusProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {periodStatusProgress.currentPage > 0 && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                          Page {periodStatusProgress.currentPage}/{periodStatusProgress.totalPages}
                        </Text>
                      )}
                    </Card>
                  </Col>

                  {/* Processed Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Processed</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {periodStatusProgress.processedRecords}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {periodStatusProgress.totalRecords}
                        </Text>
                      </div>
                      <Progress
                        percent={periodStatusProgress.totalRecords > 0 ? Math.round((periodStatusProgress.processedRecords / periodStatusProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: periodStatusProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: periodStatusProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {periodStatusProgress.errors}
                      </div>
                      {periodStatusProgress.lastError && (
                        <Tooltip title={periodStatusProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {periodStatusProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isBanks ? (
                /* Banks KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Records Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <DatabaseOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Banks</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {banksProgress.insertedRecords} / {banksProgress.totalRecords}
                      </div>
                      <Progress
                        percent={banksProgress.totalRecords > 0 ? Math.round((banksProgress.insertedRecords / banksProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {banksProgress.currentPage > 0 && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                          Page {banksProgress.currentPage}/{banksProgress.totalPages}
                        </Text>
                      )}
                    </Card>
                  </Col>

                  {/* Processed Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Processed</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {banksProgress.processedRecords}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {banksProgress.totalRecords}
                        </Text>
                      </div>
                      <Progress
                        percent={banksProgress.totalRecords > 0 ? Math.round((banksProgress.processedRecords / banksProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: banksProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: banksProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {banksProgress.errors}
                      </div>
                      {banksProgress.lastError && (
                        <Tooltip title={banksProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {banksProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isBankBranches ? (
                /* Bank Branches KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Records Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <BranchesOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Bank Branches</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {bankBranchesProgress.insertedRecords} / {bankBranchesProgress.totalRecords}
                      </div>
                      <Progress
                        percent={bankBranchesProgress.totalRecords > 0 ? Math.round((bankBranchesProgress.insertedRecords / bankBranchesProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {bankBranchesProgress.currentPage > 0 && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                          Page {bankBranchesProgress.currentPage}/{bankBranchesProgress.totalPages}
                        </Text>
                      )}
                    </Card>
                  </Col>

                  {/* Processed Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Processed</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {bankBranchesProgress.processedRecords}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {bankBranchesProgress.totalRecords}
                        </Text>
                      </div>
                      <Progress
                        percent={bankBranchesProgress.totalRecords > 0 ? Math.round((bankBranchesProgress.processedRecords / bankBranchesProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: bankBranchesProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: bankBranchesProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {bankBranchesProgress.errors}
                      </div>
                      {bankBranchesProgress.lastError && (
                        <Tooltip title={bankBranchesProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {bankBranchesProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isBankAccounts ? (
                /* Bank Accounts KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Records Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <BankOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Bank Accounts</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {bankAccountsProgress.insertedRecords} / {bankAccountsProgress.totalRecords}
                      </div>
                      <Progress
                        percent={bankAccountsProgress.totalRecords > 0 ? Math.round((bankAccountsProgress.insertedRecords / bankAccountsProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {bankAccountsProgress.currentPage > 0 && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                          Page {bankAccountsProgress.currentPage}/{bankAccountsProgress.totalPages}
                        </Text>
                      )}
                    </Card>
                  </Col>

                  {/* Processed Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Processed</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {bankAccountsProgress.processedRecords}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {bankAccountsProgress.totalRecords}
                        </Text>
                      </div>
                      <Progress
                        percent={bankAccountsProgress.totalRecords > 0 ? Math.round((bankAccountsProgress.processedRecords / bankAccountsProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: bankAccountsProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: bankAccountsProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {bankAccountsProgress.errors}
                      </div>
                      {bankAccountsProgress.lastError && (
                        <Tooltip title={bankAccountsProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {bankAccountsProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isBankAccountTransfers ? (
                /* Bank Account Transfers KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col xs={24} sm={8}>
                    <Card
                      style={{ borderRadius: 12, border: `1px solid ${REDWOOD.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <BankOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Transfers</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {bankAccountTransfersProgress.insertedRecords} / {bankAccountTransfersProgress.totalRecords}
                      </div>
                      <Progress
                        percent={bankAccountTransfersProgress.totalRecords > 0 ? Math.round((bankAccountTransfersProgress.insertedRecords / bankAccountTransfersProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {bankAccountTransfersProgress.currentPage > 0 && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                          Page {bankAccountTransfersProgress.currentPage}/{bankAccountTransfersProgress.totalPages}
                        </Text>
                      )}
                    </Card>
                  </Col>

                  <Col xs={24} sm={8}>
                    <Card
                      style={{ borderRadius: 12, border: `1px solid ${REDWOOD.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Processed</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {bankAccountTransfersProgress.processedRecords}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {bankAccountTransfersProgress.totalRecords}
                        </Text>
                      </div>
                      <Progress
                        percent={bankAccountTransfersProgress.totalRecords > 0 ? Math.round((bankAccountTransfersProgress.processedRecords / bankAccountTransfersProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  <Col xs={24} sm={8}>
                    <Card
                      style={{ borderRadius: 12, border: `1px solid ${REDWOOD.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: bankAccountTransfersProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: bankAccountTransfersProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {bankAccountTransfersProgress.errors}
                      </div>
                      {bankAccountTransfersProgress.lastError && (
                        <Tooltip title={bankAccountTransfersProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {bankAccountTransfersProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isExternalCashTxn ? (
                /* External Cash Transactions KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col xs={24} sm={8}>
                    <Card style={{ borderRadius: 12, border: `1px solid ${REDWOOD.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }} bodyStyle={{ padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Transactions</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {externalCashTxnProgress.insertedRecords} / {externalCashTxnProgress.totalRecords}
                      </div>
                      <Progress
                        percent={externalCashTxnProgress.totalRecords > 0 ? Math.round((externalCashTxnProgress.insertedRecords / externalCashTxnProgress.totalRecords) * 100) : 0}
                        showInfo={false} strokeColor={REDWOOD.primary} style={{ marginTop: 8 }}
                      />
                      {externalCashTxnProgress.currentPage > 0 && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                          Page {externalCashTxnProgress.currentPage}/{externalCashTxnProgress.totalPages}
                        </Text>
                      )}
                    </Card>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Card style={{ borderRadius: 12, border: `1px solid ${REDWOOD.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }} bodyStyle={{ padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <DatabaseOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Processed</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {externalCashTxnProgress.processedRecords}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>/ {externalCashTxnProgress.totalRecords}</Text>
                      </div>
                      <Progress
                        percent={externalCashTxnProgress.totalRecords > 0 ? Math.round((externalCashTxnProgress.processedRecords / externalCashTxnProgress.totalRecords) * 100) : 0}
                        showInfo={false} strokeColor={REDWOOD.success} style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Card style={{ borderRadius: 12, border: `1px solid ${REDWOOD.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }} bodyStyle={{ padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: externalCashTxnProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: externalCashTxnProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {externalCashTxnProgress.errors}
                      </div>
                      {externalCashTxnProgress.lastError && (
                        <Tooltip title={externalCashTxnProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {externalCashTxnProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isLegalEntities ? (
                /* Legal Entities KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Records Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <BankOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Legal Entities</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {legalEntitiesProgress.insertedRecords} / {legalEntitiesProgress.totalRecords}
                      </div>
                      <Progress
                        percent={legalEntitiesProgress.totalRecords > 0 ? Math.round((legalEntitiesProgress.insertedRecords / legalEntitiesProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {legalEntitiesProgress.currentPage > 0 && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                          Page {legalEntitiesProgress.currentPage}/{legalEntitiesProgress.totalPages}
                        </Text>
                      )}
                    </Card>
                  </Col>

                  {/* Processed Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Processed</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {legalEntitiesProgress.processedRecords}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {legalEntitiesProgress.totalRecords}
                        </Text>
                      </div>
                      <Progress
                        percent={legalEntitiesProgress.totalRecords > 0 ? Math.round((legalEntitiesProgress.processedRecords / legalEntitiesProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: legalEntitiesProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: legalEntitiesProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {legalEntitiesProgress.errors}
                      </div>
                      {legalEntitiesProgress.lastError && (
                        <Tooltip title={legalEntitiesProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {legalEntitiesProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isBusinessUnits ? (
                /* Business Units KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col xs={24} sm={8}>
                    <Card
                      style={{ borderRadius: 12, border: `1px solid ${REDWOOD.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <BankOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Business Units</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {businessUnitsProgress.insertedRecords} / {businessUnitsProgress.totalRecords}
                      </div>
                      <Progress
                        percent={businessUnitsProgress.totalRecords > 0 ? Math.round((businessUnitsProgress.insertedRecords / businessUnitsProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {businessUnitsProgress.currentPage > 0 && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                          Page {businessUnitsProgress.currentPage}/{businessUnitsProgress.totalPages}
                        </Text>
                      )}
                    </Card>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Card
                      style={{ borderRadius: 12, border: `1px solid ${REDWOOD.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Processed</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {businessUnitsProgress.processedRecords}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {businessUnitsProgress.totalRecords}
                        </Text>
                      </div>
                      <Progress
                        percent={businessUnitsProgress.totalRecords > 0 ? Math.round((businessUnitsProgress.processedRecords / businessUnitsProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Card
                      style={{ borderRadius: 12, border: `1px solid ${REDWOOD.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: businessUnitsProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: businessUnitsProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {businessUnitsProgress.errors}
                      </div>
                      {businessUnitsProgress.lastError && (
                        <Tooltip title={businessUnitsProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {businessUnitsProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isUserAccounts ? (
                /* User Accounts KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Records Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <DatabaseOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>User Accounts</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {userAccountsProgress.insertedRecords} / {userAccountsProgress.totalRecords}
                      </div>
                      <Progress
                        percent={userAccountsProgress.totalRecords > 0 ? Math.round((userAccountsProgress.insertedRecords / userAccountsProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {userAccountsProgress.currentPage > 0 && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                          Page {userAccountsProgress.currentPage}/{userAccountsProgress.totalPages}
                        </Text>
                      )}
                    </Card>
                  </Col>

                  {/* Processed Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Processed</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {userAccountsProgress.processedRecords}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {userAccountsProgress.totalRecords}
                        </Text>
                      </div>
                      <Progress
                        percent={userAccountsProgress.totalRecords > 0 ? Math.round((userAccountsProgress.processedRecords / userAccountsProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: userAccountsProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: userAccountsProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {userAccountsProgress.errors}
                      </div>
                      {userAccountsProgress.lastError && (
                        <Tooltip title={userAccountsProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {userAccountsProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isUserAccountRoles ? (
                /* User Account Roles KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Users Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <DatabaseOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Users Processed</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {userAccountRolesProgress.processedUsers} / {userAccountRolesProgress.totalUsers}
                      </div>
                      <Progress
                        percent={userAccountRolesProgress.totalUsers > 0 ? Math.round((userAccountRolesProgress.processedUsers / userAccountRolesProgress.totalUsers) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {userAccountRolesProgress.currentPage > 0 && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                          Page {userAccountRolesProgress.currentPage}
                        </Text>
                      )}
                    </Card>
                  </Col>

                  {/* Roles Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Roles Inserted</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {userAccountRolesProgress.insertedRoles}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {userAccountRolesProgress.totalRoles} found
                        </Text>
                      </div>
                      <Progress
                        percent={userAccountRolesProgress.totalRoles > 0 ? Math.round((userAccountRolesProgress.insertedRoles / userAccountRolesProgress.totalRoles) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: userAccountRolesProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: userAccountRolesProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {userAccountRolesProgress.errors}
                      </div>
                      {userAccountRolesProgress.lastError && (
                        <Tooltip title={userAccountRolesProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {userAccountRolesProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isRoles ? (
                /* Roles KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Records Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <DatabaseOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Roles</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {rolesProgress.insertedRecords} / {rolesProgress.totalRecords}
                      </div>
                      <Progress
                        percent={rolesProgress.totalRecords > 0 ? Math.round((rolesProgress.insertedRecords / rolesProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {rolesProgress.currentPage > 0 && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                          Page {rolesProgress.currentPage}
                        </Text>
                      )}
                    </Card>
                  </Col>

                  {/* Processed Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Processed</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {rolesProgress.processedRecords}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {rolesProgress.totalRecords}
                        </Text>
                      </div>
                      <Progress
                        percent={rolesProgress.totalRecords > 0 ? Math.round((rolesProgress.processedRecords / rolesProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: rolesProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: rolesProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {rolesProgress.errors}
                      </div>
                      {rolesProgress.lastError && (
                        <Tooltip title={rolesProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {rolesProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isSuppliers ? (
                /* Suppliers KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Records Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <DatabaseOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Suppliers</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {suppliersProgress.insertedRecords} / {suppliersProgress.totalRecords}
                      </div>
                      <Progress
                        percent={suppliersProgress.totalRecords > 0 ? Math.round((suppliersProgress.insertedRecords / suppliersProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {suppliersProgress.currentPage > 0 && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                          Page {suppliersProgress.currentPage}
                        </Text>
                      )}
                    </Card>
                  </Col>

                  {/* Processed Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Processed</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {suppliersProgress.processedRecords}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {suppliersProgress.totalRecords}
                        </Text>
                      </div>
                      <Progress
                        percent={suppliersProgress.totalRecords > 0 ? Math.round((suppliersProgress.processedRecords / suppliersProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: suppliersProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: suppliersProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {suppliersProgress.errors}
                      </div>
                      {suppliersProgress.lastError && (
                        <Tooltip title={suppliersProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {suppliersProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isSupplierAddresses ? (
                /* Supplier Addresses KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Suppliers Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <DatabaseOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Suppliers</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {supplierAddressProgress.processedSuppliers} / {supplierAddressProgress.totalSuppliers}
                      </div>
                      <Progress
                        percent={supplierAddressProgress.totalSuppliers > 0 ? Math.round((supplierAddressProgress.processedSuppliers / supplierAddressProgress.totalSuppliers) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {supplierAddressProgress.currentSupplier && (
                        <Tooltip title={supplierAddressProgress.currentSupplier}>
                          <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }} ellipsis>
                            {supplierAddressProgress.currentSupplier}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>

                  {/* Addresses Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Addresses Inserted</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {supplierAddressProgress.insertedAddresses}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {supplierAddressProgress.totalAddresses}
                        </Text>
                      </div>
                      <Progress
                        percent={supplierAddressProgress.totalAddresses > 0 ? Math.round((supplierAddressProgress.insertedAddresses / supplierAddressProgress.totalAddresses) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: supplierAddressProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: supplierAddressProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {supplierAddressProgress.errors}
                      </div>
                      {supplierAddressProgress.lastError && (
                        <Tooltip title={supplierAddressProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {supplierAddressProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isSupplierSites ? (
                /* Supplier Sites KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Suppliers Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <DatabaseOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Suppliers</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {supplierSitesProgress.processedSuppliers} / {supplierSitesProgress.totalSuppliers}
                      </div>
                      <Progress
                        percent={supplierSitesProgress.totalSuppliers > 0 ? Math.round((supplierSitesProgress.processedSuppliers / supplierSitesProgress.totalSuppliers) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {supplierSitesProgress.currentSupplier && (
                        <Tooltip title={supplierSitesProgress.currentSupplier}>
                          <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }} ellipsis>
                            {supplierSitesProgress.currentSupplier}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>

                  {/* Sites Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <BranchesOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Sites Inserted</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {supplierSitesProgress.insertedSites}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {supplierSitesProgress.totalSites}
                        </Text>
                      </div>
                      <Progress
                        percent={supplierSitesProgress.totalSites > 0 ? Math.round((supplierSitesProgress.insertedSites / supplierSitesProgress.totalSites) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: supplierSitesProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: supplierSitesProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {supplierSitesProgress.errors}
                      </div>
                      {supplierSitesProgress.lastError && (
                        <Tooltip title={supplierSitesProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {supplierSitesProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isSiteAssignments ? (
                /* Site Assignments KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Sites Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <BranchesOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Sites</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {siteAssignmentsProgress.processedSites} / {siteAssignmentsProgress.totalSites}
                      </div>
                      <Progress
                        percent={siteAssignmentsProgress.totalSites > 0 ? Math.round((siteAssignmentsProgress.processedSites / siteAssignmentsProgress.totalSites) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {siteAssignmentsProgress.currentSite && (
                        <Tooltip title={siteAssignmentsProgress.currentSite}>
                          <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }} ellipsis>
                            {siteAssignmentsProgress.currentSite}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>

                  {/* Assignments Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileSearchOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Assignments Inserted</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {siteAssignmentsProgress.insertedAssignments}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {siteAssignmentsProgress.totalAssignments}
                        </Text>
                      </div>
                      <Progress
                        percent={siteAssignmentsProgress.totalAssignments > 0 ? Math.round((siteAssignmentsProgress.insertedAssignments / siteAssignmentsProgress.totalAssignments) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: siteAssignmentsProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: siteAssignmentsProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {siteAssignmentsProgress.errors}
                      </div>
                      {siteAssignmentsProgress.lastError && (
                        <Tooltip title={siteAssignmentsProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {siteAssignmentsProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : isGLBalances ? (
                /* GL Balances (SOAP) KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Records Fetched from SOAP Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <CloudDownloadOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Fetched from SOAP</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {glBalancesProgress.totalRecords}
                      </div>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                        {glBalancesProgress.status === 'fetching' ? 'Fetching from Oracle BI Publisher...' :
                         glBalancesProgress.status === 'parsing' ? 'Parsing XML response...' :
                         glBalancesProgress.status === 'inserting' ? 'Records ready for insert' :
                         glBalancesProgress.status === 'completed' ? 'Fetch completed' :
                         glBalancesProgress.status === 'error' ? 'Error during fetch' : 'Ready'}
                      </Text>
                    </Card>
                  </Col>

                  {/* Records Inserted to APEX Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <CloudUploadOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Inserted to APEX</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {glBalancesProgress.insertedRecords + glBalancesProgress.updatedRecords}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {glBalancesProgress.totalRecords}
                        </Text>
                      </div>
                      <Progress
                        percent={glBalancesProgress.totalRecords > 0 ? Math.round(((glBalancesProgress.insertedRecords + glBalancesProgress.updatedRecords) / glBalancesProgress.totalRecords) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                      <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                        Inserted: {glBalancesProgress.insertedRecords} | Updated: {glBalancesProgress.updatedRecords}
                      </Text>
                    </Card>
                  </Col>

                  {/* Errors Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <WarningOutlined style={{ fontSize: 20, color: glBalancesProgress.errors > 0 ? REDWOOD.error : REDWOOD.textSecondary, marginRight: 8 }} />
                        <Text strong>Errors</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: glBalancesProgress.errors > 0 ? REDWOOD.error : REDWOOD.textPrimary }}>
                        {glBalancesProgress.errors}
                      </div>
                      {glBalancesProgress.lastError && (
                        <Tooltip title={glBalancesProgress.lastError}>
                          <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 8 }} ellipsis>
                            {glBalancesProgress.lastError}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : (
                /* GL Journals KPI Cards */
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Batches Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <DatabaseOutlined style={{ fontSize: 20, color: REDWOOD.primary, marginRight: 8 }} />
                        <Text strong>Batches</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {progress.processedBatches} / {progress.totalBatches}
                      </div>
                      <Progress
                        percent={batchProgress}
                        showInfo={false}
                        strokeColor={REDWOOD.primary}
                        style={{ marginTop: 8 }}
                      />
                      {progress.currentBatchName && (
                        <Tooltip title={progress.currentBatchName}>
                          <Text
                            type="secondary"
                            style={{ fontSize: 11, display: 'block', marginTop: 4 }}
                            ellipsis
                          >
                            {progress.currentBatchName}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>

                  {/* Headers Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: REDWOOD.info, marginRight: 8 }} />
                        <Text strong>Headers</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {progress.totalHeadersInserted}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {progress.totalHeaders}
                        </Text>
                      </div>
                      <Progress
                        percent={progress.totalHeaders > 0 ? Math.round((progress.totalHeadersInserted / progress.totalHeaders) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.info}
                        style={{ marginTop: 8 }}
                      />
                      {progress.currentHeaderName && (
                        <Tooltip title={progress.currentHeaderName}>
                          <Text
                            type="secondary"
                            style={{ fontSize: 11, display: 'block', marginTop: 4 }}
                            ellipsis
                          >
                            {progress.currentHeaderName}
                          </Text>
                        </Tooltip>
                      )}
                    </Card>
                  </Col>

                  {/* Lines Card */}
                  <Col xs={24} sm={8}>
                    <Card
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${REDWOOD.border}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <UnorderedListOutlined style={{ fontSize: 20, color: REDWOOD.success, marginRight: 8 }} />
                        <Text strong>Lines</Text>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: REDWOOD.textPrimary }}>
                        {progress.totalLinesInserted}
                        <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
                          / {progress.totalLines}
                        </Text>
                      </div>
                      <Progress
                        percent={progress.totalLines > 0 ? Math.round((progress.totalLinesInserted / progress.totalLines) * 100) : 0}
                        showInfo={false}
                        strokeColor={REDWOOD.success}
                        style={{ marginTop: 8 }}
                      />
                      {progress.errors > 0 && (
                        <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                          {progress.errors} errors
                        </Text>
                      )}
                    </Card>
                  </Col>
                </Row>
              )}

              {/* Status Bar */}
              <Card
                style={{
                  borderRadius: 12,
                  border: `1px solid ${REDWOOD.border}`,
                  marginBottom: 16,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}
                bodyStyle={{ padding: '12px 20px' }}
              >
                <Row justify="space-between" align="middle">
                  <Col>
                    <Space size="large">
                      <div>
                        <Tag
                          color={getStatusColor(currentStatus)}
                          style={{
                            padding: '4px 12px',
                            fontSize: 13,
                            borderRadius: 16,
                          }}
                        >
                          {getStatusText(currentStatus)}
                        </Tag>
                      </div>
                      {(isAPPayments ? apPaymentsProgress.startTime : isAPInvoices ? apProgress.startTime : isGLCodeComb ? codeCombProgress.startTime : isGLPeriodStatus ? periodStatusProgress.startTime : isBanks ? banksProgress.startTime : isBankBranches ? bankBranchesProgress.startTime : isBankAccounts ? bankAccountsProgress.startTime : isBankAccountTransfers ? bankAccountTransfersProgress.startTime : isExternalCashTxn ? externalCashTxnProgress.startTime : isLegalEntities ? legalEntitiesProgress.startTime : isUserAccounts ? userAccountsProgress.startTime : isUserAccountRoles ? userAccountRolesProgress.startTime : isRoles ? rolesProgress.startTime : isSuppliers ? suppliersProgress.startTime : isSupplierAddresses ? supplierAddressProgress.startTime : progress.startTime) && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Started: {(isAPPayments ? apPaymentsProgress.startTime : isAPInvoices ? apProgress.startTime : isGLCodeComb ? codeCombProgress.startTime : isGLPeriodStatus ? periodStatusProgress.startTime : isBanks ? banksProgress.startTime : isBankBranches ? bankBranchesProgress.startTime : isBankAccounts ? bankAccountsProgress.startTime : isBankAccountTransfers ? bankAccountTransfersProgress.startTime : isExternalCashTxn ? externalCashTxnProgress.startTime : isLegalEntities ? legalEntitiesProgress.startTime : isUserAccounts ? userAccountsProgress.startTime : isUserAccountRoles ? userAccountRolesProgress.startTime : isRoles ? rolesProgress.startTime : isSuppliers ? suppliersProgress.startTime : isSupplierAddresses ? supplierAddressProgress.startTime : progress.startTime)?.toLocaleTimeString()}
                        </Text>
                      )}
                      {(isAPPayments ? apPaymentsProgress.endTime : isAPInvoices ? apProgress.endTime : isGLCodeComb ? codeCombProgress.endTime : isGLPeriodStatus ? periodStatusProgress.endTime : isBanks ? banksProgress.endTime : isBankBranches ? bankBranchesProgress.endTime : isBankAccounts ? bankAccountsProgress.endTime : isBankAccountTransfers ? bankAccountTransfersProgress.endTime : isExternalCashTxn ? externalCashTxnProgress.endTime : isLegalEntities ? legalEntitiesProgress.endTime : isUserAccounts ? userAccountsProgress.endTime : isUserAccountRoles ? userAccountRolesProgress.endTime : isRoles ? rolesProgress.endTime : isSuppliers ? suppliersProgress.endTime : isSupplierAddresses ? supplierAddressProgress.endTime : progress.endTime) && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Ended: {(isAPPayments ? apPaymentsProgress.endTime : isAPInvoices ? apProgress.endTime : isGLCodeComb ? codeCombProgress.endTime : isGLPeriodStatus ? periodStatusProgress.endTime : isBanks ? banksProgress.endTime : isBankBranches ? bankBranchesProgress.endTime : isBankAccounts ? bankAccountsProgress.endTime : isBankAccountTransfers ? bankAccountTransfersProgress.endTime : isExternalCashTxn ? externalCashTxnProgress.endTime : isLegalEntities ? legalEntitiesProgress.endTime : isUserAccounts ? userAccountsProgress.endTime : isUserAccountRoles ? userAccountRolesProgress.endTime : isRoles ? rolesProgress.endTime : isSuppliers ? suppliersProgress.endTime : isSupplierAddresses ? supplierAddressProgress.endTime : progress.endTime)?.toLocaleTimeString()}
                        </Text>
                      )}
                    </Space>
                  </Col>
                  <Col>
                    <Space>
                      <Text type="secondary">
                        <CheckCircleOutlined style={{ color: REDWOOD.success, marginRight: 4 }} />
                        {isAPPayments
                          ? `${apPaymentsProgress.insertedPayments} payments, ${apPaymentsProgress.processedRelatedInvoices} related invoices inserted`
                          : isAPInvoices
                          ? `${apProgress.insertedInvoices} invoices inserted`
                          : isGLBatchesOnly
                          ? `${glBatchesOnlyProgress.insertedBatches} batches inserted`
                          : isGLHeadersOnly
                          ? `${glHeadersOnlyProgress.insertedHeaders} headers inserted (${glHeadersOnlyProgress.processedBatches} batches)`
                          : isGLLinesOnly
                          ? `${glLinesOnlyProgress.insertedLines} lines inserted (${glLinesOnlyProgress.processedHeaders} headers)`
                          : isGLCodeComb
                          ? `${codeCombProgress.insertedRecords} code combinations inserted`
                          : isGLPeriodStatus
                          ? `${periodStatusProgress.insertedRecords} period statuses inserted`
                          : isBanks
                          ? `${banksProgress.insertedRecords} banks inserted`
                          : isBankBranches
                          ? `${bankBranchesProgress.insertedRecords} bank branches inserted`
                          : isBankAccounts
                          ? `${bankAccountsProgress.insertedRecords} bank accounts inserted`
                          : isBankAccountTransfers
                          ? `${bankAccountTransfersProgress.insertedRecords} bank account transfers inserted`
                          : isExternalCashTxn
                          ? `${externalCashTxnProgress.insertedRecords} external cash transactions inserted`
                          : isLegalEntities
                          ? `${legalEntitiesProgress.insertedRecords} legal entities inserted`
                          : isBusinessUnits
                          ? `${businessUnitsProgress.insertedRecords} business units inserted`
                          : isUserAccounts
                          ? `${userAccountsProgress.insertedRecords} user accounts inserted`
                          : isUserAccountRoles
                          ? `${userAccountRolesProgress.insertedRoles} roles inserted (${userAccountRolesProgress.processedUsers} users)`
                          : isRoles
                          ? `${rolesProgress.insertedRecords} roles inserted`
                          : isSuppliers
                          ? `${suppliersProgress.insertedRecords} suppliers inserted`
                          : isSupplierAddresses
                          ? `${supplierAddressProgress.insertedAddresses} addresses inserted (${supplierAddressProgress.processedSuppliers} suppliers)`
                          : isSupplierSites
                          ? `${supplierSitesProgress.insertedSites} sites inserted (${supplierSitesProgress.processedSuppliers} suppliers)`
                          : `${progress.totalBatchesInserted + progress.totalHeadersInserted + progress.totalLinesInserted} inserted`
                        }
                      </Text>
                      {(isAPPayments ? apPaymentsProgress.errors : isAPInvoices ? apProgress.errors : isGLBatchesOnly ? glBatchesOnlyProgress.errors : isGLHeadersOnly ? glHeadersOnlyProgress.errors : isGLLinesOnly ? glLinesOnlyProgress.errors : isGLCodeComb ? codeCombProgress.errors : isGLPeriodStatus ? periodStatusProgress.errors : isBanks ? banksProgress.errors : isBankBranches ? bankBranchesProgress.errors : isBankAccounts ? bankAccountsProgress.errors : isBankAccountTransfers ? bankAccountTransfersProgress.errors : isExternalCashTxn ? externalCashTxnProgress.errors : isLegalEntities ? legalEntitiesProgress.errors : isUserAccounts ? userAccountsProgress.errors : isUserAccountRoles ? userAccountRolesProgress.errors : isRoles ? rolesProgress.errors : isSuppliers ? suppliersProgress.errors : isSupplierAddresses ? supplierAddressProgress.errors : isSupplierSites ? supplierSitesProgress.errors : progress.errors) > 0 && (
                        <Text type="danger">
                          <CloseCircleOutlined style={{ marginRight: 4 }} />
                          {isAPPayments ? apPaymentsProgress.errors : isAPInvoices ? apProgress.errors : isGLBatchesOnly ? glBatchesOnlyProgress.errors : isGLHeadersOnly ? glHeadersOnlyProgress.errors : isGLLinesOnly ? glLinesOnlyProgress.errors : isGLCodeComb ? codeCombProgress.errors : isGLPeriodStatus ? periodStatusProgress.errors : isBanks ? banksProgress.errors : isBankBranches ? bankBranchesProgress.errors : isBankAccounts ? bankAccountsProgress.errors : isBankAccountTransfers ? bankAccountTransfersProgress.errors : isExternalCashTxn ? externalCashTxnProgress.errors : isLegalEntities ? legalEntitiesProgress.errors : isUserAccounts ? userAccountsProgress.errors : isUserAccountRoles ? userAccountRolesProgress.errors : isRoles ? rolesProgress.errors : isSuppliers ? suppliersProgress.errors : isSupplierAddresses ? supplierAddressProgress.errors : isSupplierSites ? supplierSitesProgress.errors : progress.errors} errors
                        </Text>
                      )}
                    </Space>
                  </Col>
                </Row>
              </Card>

              {/* Batch Debug Section */}
              {batchPayloads.length > 0 && (
                <Card
                  title={
                    <Space>
                      <BugOutlined style={{ color: REDWOOD.warning }} />
                      <span>Batch Debug</span>
                      <Tag style={{ borderRadius: 12 }}>{batchPayloads.length} batches</Tag>
                      <Tag color="success" style={{ borderRadius: 12 }}>
                        {batchPayloads.filter((bp) => bp.status === 'success').length} success
                      </Tag>
                      <Tag color="error" style={{ borderRadius: 12 }}>
                        {batchPayloads.filter((bp) => bp.status === 'error').length} errors
                      </Tag>
                    </Space>
                  }
                  extra={
                    <Space>
                      <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={downloadBatchPayloads}
                      >
                        Download Log
                      </Button>
                      <Button size="small" onClick={() => setBatchPayloads([])}>
                        Clear
                      </Button>
                    </Space>
                  }
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${REDWOOD.border}`,
                    marginBottom: 16,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  }}
                  bodyStyle={{ padding: 0 }}
                >
                  <Table
                    dataSource={batchPayloads}
                    rowKey="batchId"
                    size="small"
                    pagination={false}
                    scroll={{ y: 200 }}
                    columns={[
                      {
                        title: 'Batch ID',
                        dataIndex: 'batchId',
                        key: 'batchId',
                        width: 100,
                        render: (id: number) => <Text code>{id}</Text>,
                      },
                      {
                        title: 'Batch Name',
                        dataIndex: 'batchName',
                        key: 'batchName',
                        ellipsis: true,
                      },
                      {
                        title: 'Status',
                        dataIndex: 'status',
                        key: 'status',
                        width: 100,
                        render: (status: string) => (
                          <Tag color={status === 'success' ? 'success' : status === 'error' ? 'error' : 'default'}>
                            {status.toUpperCase()}
                          </Tag>
                        ),
                      },
                      {
                        title: 'Error',
                        dataIndex: 'errorMessage',
                        key: 'errorMessage',
                        width: 200,
                        ellipsis: true,
                        render: (error: string) => error ? <Text type="danger" style={{ fontSize: 11 }}>{error}</Text> : '-',
                      },
                      {
                        title: 'Actions',
                        key: 'actions',
                        width: 140,
                        render: (_: unknown, record: BatchPayloadLog) => (
                          <Space size="small">
                            <Tooltip title="View Payload">
                              <Button
                                type="text"
                                size="small"
                                icon={<ExpandOutlined style={{ color: REDWOOD.info }} />}
                                onClick={() => {
                                  setSelectedBatchPayload(record);
                                  setBatchDebugVisible(true);
                                }}
                              />
                            </Tooltip>
                            <Tooltip title="POST this batch">
                              <Button
                                type="text"
                                size="small"
                                icon={<SendOutlined style={{ color: REDWOOD.primary }} />}
                                onClick={() => postSingleBatch(record)}
                                loading={isPostingBatch}
                              />
                            </Tooltip>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              )}

              {/* Invoice Debug Section (for AP Invoices) */}
              {invoicePayloads.length > 0 && (
                <Card
                  title={
                    <Space>
                      <BugOutlined style={{ color: REDWOOD.warning }} />
                      <span>Invoice Debug</span>
                      <Tag style={{ borderRadius: 12 }}>{invoicePayloads.length} invoices</Tag>
                      <Tag color="success" style={{ borderRadius: 12 }}>
                        {invoicePayloads.filter((ip) => ip.status === 'success').length} success
                      </Tag>
                      <Tag color="error" style={{ borderRadius: 12 }}>
                        {invoicePayloads.filter((ip) => ip.status === 'error').length} errors
                      </Tag>
                    </Space>
                  }
                  extra={
                    <Space>
                      <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={downloadInvoicePayloads}
                      >
                        Download Log
                      </Button>
                      <Button size="small" onClick={() => setInvoicePayloads([])}>
                        Clear
                      </Button>
                    </Space>
                  }
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${REDWOOD.border}`,
                    marginBottom: 16,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  }}
                  bodyStyle={{ padding: 0 }}
                >
                  <Table
                    dataSource={invoicePayloads}
                    rowKey="invoiceId"
                    size="small"
                    pagination={false}
                    scroll={{ y: 200 }}
                    columns={[
                      {
                        title: 'Invoice ID',
                        dataIndex: 'invoiceId',
                        key: 'invoiceId',
                        width: 100,
                        render: (id: number) => <Text code>{id}</Text>,
                      },
                      {
                        title: 'Invoice Number',
                        dataIndex: 'invoiceNumber',
                        key: 'invoiceNumber',
                        width: 130,
                        ellipsis: true,
                      },
                      {
                        title: 'Status',
                        dataIndex: 'status',
                        key: 'status',
                        width: 90,
                        render: (status: string) => (
                          <Tag color={status === 'success' ? 'success' : status === 'error' ? 'error' : 'default'}>
                            {status.toUpperCase()}
                          </Tag>
                        ),
                      },
                      {
                        title: 'Lines',
                        key: 'lines',
                        width: 100,
                        render: (_: unknown, record: InvoicePayloadLog) => {
                          const hasError = !!record.linesError;
                          const color = hasError ? REDWOOD.error : (record.linesInserted > 0 ? REDWOOD.success : REDWOOD.textSecondary);
                          return (
                            <Tooltip title={record.linesError || `Fetched: ${record.linesFetched}, Inserted: ${record.linesInserted}`}>
                              <span style={{ fontSize: 12, color }}>
                                {record.linesInserted}/{record.linesFetched}
                                {hasError && <CloseCircleOutlined style={{ marginLeft: 4, color: REDWOOD.error }} />}
                              </span>
                            </Tooltip>
                          );
                        },
                      },
                      {
                        title: 'Error',
                        dataIndex: 'errorMessage',
                        key: 'errorMessage',
                        width: 160,
                        ellipsis: true,
                        render: (error: string, record: InvoicePayloadLog) => {
                          const displayError = error || record.linesError;
                          return displayError ? <Text type="danger" style={{ fontSize: 11 }}>{displayError}</Text> : '-';
                        },
                      },
                      {
                        title: 'Actions',
                        key: 'actions',
                        width: 100,
                        render: (_: unknown, record: InvoicePayloadLog) => (
                          <Space size="small">
                            <Tooltip title="View Payload">
                              <Button
                                type="text"
                                size="small"
                                icon={<ExpandOutlined style={{ color: REDWOOD.info }} />}
                                onClick={() => {
                                  setSelectedInvoicePayload(record);
                                  setInvoiceDebugVisible(true);
                                }}
                              />
                            </Tooltip>
                            <Tooltip title="POST this invoice">
                              <Button
                                type="text"
                                size="small"
                                icon={<SendOutlined style={{ color: REDWOOD.primary }} />}
                                onClick={() => postSingleInvoice(record)}
                                loading={isPostingInvoice}
                              />
                            </Tooltip>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              )}

              {/* Sync Logs */}
              <Card
                title={
                  <Space>
                    <span>Sync Logs</span>
                    <Tag style={{ borderRadius: 12 }}>{logs.length} displayed</Tag>
                    <Tag color="blue" style={{ borderRadius: 12 }}>{logCounterRef.current} generated</Tag>
                    {logCounterRef.current !== logs.length && logCounterRef.current > 0 && (
                      <Tag
                        color="warning"
                        style={{ borderRadius: 12, cursor: 'pointer' }}
                        onClick={() => setMissingLogsModalOpen(true)}
                      >
                        ⚠ {logCounterRef.current - logs.length} missing — click to view
                      </Tag>
                    )}
                  </Space>
                }
                extra={
                  <Space>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Check browser console (F12) for all logs
                    </Text>
                    <Button size="small" onClick={() => { setLogs([]); logCounterRef.current = 0; }}>
                      Clear
                    </Button>
                  </Space>
                }
                style={{
                  borderRadius: 12,
                  border: `1px solid ${REDWOOD.border}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}
                bodyStyle={{ padding: 0 }}
              >
                <Table
                  dataSource={logs}
                  columns={logColumns}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 20, size: 'small' }}
                  scroll={{ y: 400 }}
                  locale={{ emptyText: 'No sync logs yet. Click "Test Connection" or "Start Sync" to begin.' }}
                  style={{ borderRadius: '0 0 12px 12px' }}
                />
              </Card>
            </Col>
          </Row>
        </div>
      </Content>

      {/* Autopilot Assistant */}
      <Autopilot />

      {/* Log Detail Modal */}
      <Modal
        title={
          <Space>
            {selectedLog && getLogIcon(selectedLog.type)}
            <span>Log Details</span>
            {selectedLog && (
              <Tag
                color={
                  selectedLog.type === 'success' ? 'success' :
                  selectedLog.type === 'error' ? 'error' :
                  selectedLog.type === 'warning' ? 'warning' :
                  selectedLog.type === 'step' ? 'volcano' : 'blue'
                }
              >
                {selectedLog.type.toUpperCase()}
              </Tag>
            )}
          </Space>
        }
        open={logDetailVisible}
        onCancel={() => setLogDetailVisible(false)}
        footer={[
          <Button key="copy" onClick={() => {
            if (selectedLog) {
              navigator.clipboard.writeText(selectedLog.message);
            }
          }}>
            Copy to Clipboard
          </Button>,
          <Button key="close" type="primary" onClick={() => setLogDetailVisible(false)}>
            Close
          </Button>,
        ]}
        width={700}
      >
        {selectedLog && (
          <div>
            <div style={{
              marginBottom: 12,
              padding: '8px 12px',
              background: REDWOOD.surfaceSecondary,
              borderRadius: 6,
              fontSize: 12,
            }}>
              <Text type="secondary">Time: </Text>
              <Text strong>{selectedLog.timestamp.toLocaleString()}</Text>
            </div>
            <div style={{
              padding: 16,
              background: '#fafafa',
              borderRadius: 8,
              border: `1px solid ${REDWOOD.border}`,
              minHeight: 100,
              maxHeight: 500,
              overflow: 'auto',
            }}>
              {formatLogMessage(selectedLog.message)}
            </div>
          </div>
        )}
      </Modal>

      {/* Batch API Inspector Modal */}
      <Modal
        title={
          <Space>
            <ApiOutlined style={{ color: REDWOOD.info }} />
            <span>API Inspector — GL Journal Batch</span>
            {selectedBatchPayload && (
              <Tag
                color={
                  selectedBatchPayload.status === 'success' ? 'success' :
                  selectedBatchPayload.status === 'error' ? 'error' : 'default'
                }
              >
                {selectedBatchPayload.status.toUpperCase()}
              </Tag>
            )}
          </Space>
        }
        open={batchDebugVisible}
        onCancel={() => setBatchDebugVisible(false)}
        footer={[
          <Button
            key="copyUrl"
            onClick={() => navigator.clipboard.writeText(buildApexUrl('journalBatches'))}
          >
            Copy URL
          </Button>,
          <Button
            key="copyBody"
            onClick={() => {
              if (selectedBatchPayload) {
                navigator.clipboard.writeText(JSON.stringify(selectedBatchPayload.payload, null, 2));
              }
            }}
          >
            Copy Body
          </Button>,
          <Button
            key="post"
            type="primary"
            icon={<SendOutlined />}
            loading={isPostingBatch}
            disabled={!selectedBatchPayload}
            onClick={() => { if (selectedBatchPayload) postSingleBatch(selectedBatchPayload); }}
            style={{ background: REDWOOD.primary }}
          >
            POST to APEX
          </Button>,
          <Button key="close" onClick={() => setBatchDebugVisible(false)}>
            Close
          </Button>,
        ]}
        width={860}
      >
        {selectedBatchPayload && (
          <div>
            {/* Batch Info */}
            <Row gutter={12} style={{ marginBottom: 12 }}>
              <Col span={8}>
                <div style={{ padding: '6px 10px', background: REDWOOD.surfaceSecondary, borderRadius: 6, fontSize: 12 }}>
                  <Text type="secondary">Batch ID: </Text><Text strong code>{selectedBatchPayload.batchId}</Text>
                </div>
              </Col>
              <Col span={16}>
                <div style={{ padding: '6px 10px', background: REDWOOD.surfaceSecondary, borderRadius: 6, fontSize: 12 }}>
                  <Text type="secondary">Batch Name: </Text><Text strong>{selectedBatchPayload.batchName}</Text>
                </div>
              </Col>
            </Row>

            {/* Full Endpoint URL */}
            <div style={{
              background: '#0f1117',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              border: '1px solid #2a2d3a',
            }}>
              <Tag color="blue" style={{ fontWeight: 700, fontSize: 12, letterSpacing: 1, margin: 0 }}>POST</Tag>
              <Text style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', flex: 1 }}>
                {buildApexUrl('journalBatches')}
              </Text>
            </div>

            {selectedBatchPayload.errorMessage && (
              <Alert type="error" message="Last Error" description={selectedBatchPayload.errorMessage} style={{ marginBottom: 12 }} showIcon />
            )}

            {/* JSON Body */}
            <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Request Body (JSON)</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {selectedBatchPayload.payload?.items?.length ?? 0} item(s)
              </Text>
            </div>
            <pre style={{
              background: '#fafafa',
              padding: 14,
              borderRadius: 8,
              border: `1px solid ${REDWOOD.border}`,
              maxHeight: 280,
              overflow: 'auto',
              fontSize: 12,
              fontFamily: 'monospace',
              marginBottom: 0,
            }}>
              {JSON.stringify(selectedBatchPayload.payload, null, 2)}
            </pre>

            {/* POST Response */}
            {selectedBatchPayload.postResult && (
              <>
                <Divider style={{ margin: '12px 0' }}>
                  <Tag color={selectedBatchPayload.status === 'success' ? 'success' : 'error'}>
                    Response
                  </Tag>
                </Divider>
                <pre style={{
                  background: selectedBatchPayload.status === 'success' ? '#f6ffed' : '#fff2f0',
                  padding: 14,
                  borderRadius: 8,
                  border: `1px solid ${selectedBatchPayload.status === 'success' ? '#b7eb8f' : '#ffccc7'}`,
                  maxHeight: 160,
                  overflow: 'auto',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  marginBottom: 0,
                }}>
                  {JSON.stringify(selectedBatchPayload.postResult, null, 2)}
                </pre>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Invoice Debug Modal (for AP Invoices) */}
      <Modal
        title={
          <Space>
            <BugOutlined style={{ color: REDWOOD.warning }} />
            <span>Invoice Payload Debug</span>
            {selectedInvoicePayload && (
              <Tag
                color={
                  selectedInvoicePayload.status === 'success' ? 'success' :
                  selectedInvoicePayload.status === 'error' ? 'error' : 'default'
                }
              >
                {selectedInvoicePayload.status.toUpperCase()}
              </Tag>
            )}
          </Space>
        }
        open={invoiceDebugVisible}
        onCancel={() => setInvoiceDebugVisible(false)}
        footer={[
          <Button
            key="copy"
            onClick={() => {
              if (selectedInvoicePayload) {
                navigator.clipboard.writeText(JSON.stringify(selectedInvoicePayload.payload, null, 2));
              }
            }}
          >
            Copy Payload
          </Button>,
          <Button
            key="post"
            type="primary"
            icon={<SendOutlined />}
            loading={isPostingInvoice}
            onClick={() => {
              if (selectedInvoicePayload) {
                postSingleInvoice(selectedInvoicePayload);
              }
            }}
            style={{ background: REDWOOD.primary }}
          >
            POST This Invoice
          </Button>,
          <Button key="close" onClick={() => setInvoiceDebugVisible(false)}>
            Close
          </Button>,
        ]}
        width={800}
      >
        {selectedInvoicePayload && (
          <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>
                <div style={{
                  padding: '8px 12px',
                  background: REDWOOD.surfaceSecondary,
                  borderRadius: 6,
                  fontSize: 12,
                }}>
                  <Text type="secondary">Invoice ID: </Text>
                  <Text strong code>{selectedInvoicePayload.invoiceId}</Text>
                </div>
              </Col>
              <Col span={8}>
                <div style={{
                  padding: '8px 12px',
                  background: REDWOOD.surfaceSecondary,
                  borderRadius: 6,
                  fontSize: 12,
                }}>
                  <Text type="secondary">Invoice Number: </Text>
                  <Text strong>{selectedInvoicePayload.invoiceNumber}</Text>
                </div>
              </Col>
              <Col span={8}>
                <div style={{
                  padding: '8px 12px',
                  background: REDWOOD.surfaceSecondary,
                  borderRadius: 6,
                  fontSize: 12,
                }}>
                  <Text type="secondary">Supplier: </Text>
                  <Text strong>{selectedInvoicePayload.payload?.Supplier || '-'}</Text>
                </div>
              </Col>
            </Row>

            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>
                <div style={{
                  padding: '8px 12px',
                  background: REDWOOD.surfaceSecondary,
                  borderRadius: 6,
                  fontSize: 12,
                }}>
                  <Text type="secondary">Amount: </Text>
                  <Text strong>{selectedInvoicePayload.payload?.InvoiceAmount} {selectedInvoicePayload.payload?.InvoiceCurrency}</Text>
                </div>
              </Col>
              <Col span={8}>
                <div style={{
                  padding: '8px 12px',
                  background: REDWOOD.surfaceSecondary,
                  borderRadius: 6,
                  fontSize: 12,
                }}>
                  <Text type="secondary">Invoice Date: </Text>
                  <Text strong>{selectedInvoicePayload.payload?.InvoiceDate || '-'}</Text>
                </div>
              </Col>
              <Col span={8}>
                <div style={{
                  padding: '8px 12px',
                  background: REDWOOD.surfaceSecondary,
                  borderRadius: 6,
                  fontSize: 12,
                }}>
                  <Text type="secondary">Business Unit: </Text>
                  <Text strong>{selectedInvoicePayload.payload?.BusinessUnit || '-'}</Text>
                </div>
              </Col>
            </Row>

            {selectedInvoicePayload.errorMessage && (
              <Alert
                type="error"
                message="Error"
                description={selectedInvoicePayload.errorMessage}
                style={{ marginBottom: 16 }}
              />
            )}

            <Divider style={{ margin: '12px 0' }}>POST Payload</Divider>
            <pre style={{
              background: '#fafafa',
              padding: 16,
              borderRadius: 8,
              border: `1px solid ${REDWOOD.border}`,
              maxHeight: 300,
              overflow: 'auto',
              fontSize: 12,
              fontFamily: 'monospace',
            }}>
              {JSON.stringify(selectedInvoicePayload.payload, null, 2)}
            </pre>

            {selectedInvoicePayload.postResult && (
              <>
                <Divider style={{ margin: '12px 0' }}>POST Response</Divider>
                <pre style={{
                  background: selectedInvoicePayload.status === 'success' ? '#f6ffed' : '#fff2f0',
                  padding: 16,
                  borderRadius: 8,
                  border: `1px solid ${selectedInvoicePayload.status === 'success' ? '#b7eb8f' : '#ffccc7'}`,
                  maxHeight: 200,
                  overflow: 'auto',
                  fontSize: 12,
                  fontFamily: 'monospace',
                }}>
                  {JSON.stringify(selectedInvoicePayload.postResult, null, 2)}
                </pre>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Missing Logs Modal */}
      <Modal
        title={
          <Space>
            <WarningOutlined style={{ color: '#faad14' }} />
            <span>Full Sync Log</span>
            <Tag style={{ borderRadius: 12 }}>{allLogsRef.current.length} total</Tag>
            <Tag color="blue" style={{ borderRadius: 12 }}>{logs.length} displayed</Tag>
            {allLogsRef.current.length > logs.length && (
              <Tag color="warning" style={{ borderRadius: 12 }}>
                {allLogsRef.current.length - logs.length} not shown in main view
              </Tag>
            )}
          </Space>
        }
        open={missingLogsModalOpen}
        onCancel={() => setMissingLogsModalOpen(false)}
        width={860}
        footer={
          isSyncingRef.current ? (
            <Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Sync is currently running. Do you want to stop it?
              </Text>
              <Button onClick={() => setMissingLogsModalOpen(false)}>
                Continue Sync
              </Button>
              <Button
                danger
                type="primary"
                onClick={() => {
                  handleStop();
                  setMissingLogsModalOpen(false);
                }}
              >
                Stop Sync
              </Button>
            </Space>
          ) : (
            <Button type="primary" onClick={() => setMissingLogsModalOpen(false)}>
              Close
            </Button>
          )
        }
      >
        <div style={{ marginBottom: 8, fontSize: 12, color: REDWOOD.textSecondary }}>
          The main log view keeps the latest 500 entries. All {allLogsRef.current.length} log entries are shown below (oldest first).
        </div>
        <Table
          dataSource={[...allLogsRef.current].reverse().map((l, i) => ({ ...l, key: `all-${i}` }))}
          columns={logColumns}
          rowKey="key"
          size="small"
          pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'], showTotal: (t) => `${t} entries` }}
          scroll={{ y: 460 }}
          rowClassName={(record: SyncLog) =>
            record.type === 'error' ? 'ant-table-row-error' : ''
          }
          style={{ fontSize: 12 }}
        />
      </Modal>

      {/* ── Chain GL Sync Floating Popup ─────────────────────────────────── */}
      {chainStatus.visible && (
        <div style={{
          position:     'fixed',
          bottom:       24,
          left:         24,
          zIndex:       9998,
          width:        320,
          background:   '#fff',
          borderRadius: 12,
          boxShadow:    '0 8px 32px rgba(0,0,0,0.18)',
          border:       '1px solid #e8e8e8',
          overflow:     'hidden',
        }}>
          {/* Header */}
          <div style={{
            background:  '#1a1a2e',
            padding:     '10px 16px',
            display:     'flex',
            alignItems:  'center',
            justifyContent: 'space-between',
          }}>
            <Space size={8}>
              <SyncOutlined spin={chainStatus.batches === 'running' || chainStatus.headers === 'running' || chainStatus.lines === 'running'}
                style={{ color: '#fff', fontSize: 15 }} />
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>Chain GL Sync</span>
            </Space>
            <Space size={6}>
              {chainStatus.batches !== 'running' && chainStatus.headers !== 'running' && chainStatus.lines !== 'running' && (
                <Tag color={
                  chainStatus.batches === 'success' && chainStatus.headers === 'success' && chainStatus.lines === 'success'
                    ? 'success'
                    : chainStatus.batches === 'error' || chainStatus.headers === 'error' || chainStatus.lines === 'error'
                    ? 'error' : 'default'
                } style={{ margin: 0, fontSize: 10 }}>
                  {chainStatus.batches === 'success' && chainStatus.headers === 'success' && chainStatus.lines === 'success'
                    ? 'Complete' : 'Done'}
                </Tag>
              )}
              <Button type="text" size="small"
                style={{ color: '#aaa', padding: 0, height: 20, lineHeight: '20px' }}
                onClick={() => setChainStatus(prev => ({ ...prev, visible: false }))}>✕</Button>
            </Space>
          </div>

          {/* Steps */}
          {[
            { key: 'batches',  label: 'GL Batches',       status: chainStatus.batches,   inserted: chainStatus.batchesInserted,  errors: chainStatus.batchesErrors,   icon: '📦' },
            { key: 'headers',  label: 'GL Headers',       status: chainStatus.headers,   inserted: chainStatus.headersInserted,  errors: chainStatus.headersErrors,   icon: '📋' },
            { key: 'lines',    label: 'GL Lines',         status: chainStatus.lines,     inserted: chainStatus.linesInserted,    errors: chainStatus.linesErrors,     icon: '📄' },
            { key: 'balances', label: 'GL Trial Balance', status: chainStatus.balances,  inserted: chainStatus.balancesInserted, errors: chainStatus.balancesErrors,  icon: '⚖️' },
          ].map((step, idx) => {
            const statusColor =
              step.status === 'running' ? '#1677ff' :
              step.status === 'success' ? '#52c41a' :
              step.status === 'error'   ? '#ff4d4f' :
              step.status === 'skipped' ? '#bbb'     : '#d9d9d9';
            const statusBg =
              step.status === 'running' ? '#e6f4ff' :
              step.status === 'success' ? '#f6ffed' :
              step.status === 'error'   ? '#fff2f0' :
              step.status === 'skipped' ? '#fafafa'  : '#fafafa';
            return (
              <div key={step.key} style={{
                display:        'flex',
                alignItems:     'center',
                padding:        '10px 16px',
                background:     statusBg,
                borderBottom:   idx < 3 ? '1px solid #f0f0f0' : undefined,
                gap:            10,
              }}>
                {/* Step number badge */}
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: statusColor, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>
                  {step.status === 'success' ? '✓' : step.status === 'error' ? '✗' : idx + 1}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a' }}>
                      {step.icon} {step.label}
                    </span>
                    {step.status === 'running' && (
                      <SyncOutlined spin style={{ color: statusColor, fontSize: 13 }} />
                    )}
                    {step.status === 'idle' && (
                      <span style={{ fontSize: 10, color: '#bbb' }}>Waiting</span>
                    )}
                    {step.status === 'skipped' && (
                      <Tag style={{ fontSize: 10, margin: 0 }}>Skipped</Tag>
                    )}
                  </div>
                  {(step.status === 'success' || step.status === 'error' || (step.status === 'running' && step.inserted > 0)) && (
                    <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                      <span style={{ color: '#52c41a', fontWeight: 600 }}>{step.inserted.toLocaleString()} inserted</span>
                      {step.errors > 0 && (
                        <span style={{ color: '#ff4d4f', marginLeft: 8 }}>{step.errors} errors</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* KPI summary row */}
          {(chainStatus.batches === 'success' || chainStatus.batches === 'error') && (
            <div style={{ padding: '8px 16px', background: '#fafafa', borderTop: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
                {[
                  { label: 'Batches',  val: chainStatus.batchesInserted  },
                  { label: 'Headers',  val: chainStatus.headersInserted  },
                  { label: 'Lines',    val: chainStatus.linesInserted    },
                  { label: 'Balances', val: chainStatus.balancesInserted },
                ].map(k => (
                  <div key={k.label}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>{k.val.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: '#888' }}>{k.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {/* Single Supplier Sync Progress Modal */}
      <Modal
        open={singleSyncOpen}
        title={
          <Space>
            <DatabaseOutlined />
            <span>AP Sync{form.getFieldValue('SupplierNumber') ? ` — ${form.getFieldValue('SupplierNumber')}` : ''}</span>
            {isSyncing && <Tag color="processing">Syncing...</Tag>}
          </Space>
        }
        onCancel={() => { if (!isSyncing) setSingleSyncOpen(false); }}
        footer={
          <Button onClick={() => setSingleSyncOpen(false)} disabled={isSyncing}>
            Close
          </Button>
        }
        width={700}
        styles={{ body: { padding: '16px' } }}
      >
        <Table
          dataSource={singleSyncItems}
          rowKey="key"
          size="small"
          pagination={false}
          columns={[
            {
              title: '',
              key: 'icon',
              width: 36,
              render: (_: any, r: SingleSupplierSyncItem) => {
                if (r.status === 'done')    return <CheckCircleOutlined style={{ color: '#22c55e', fontSize: 16 }} />;
                if (r.status === 'error')   return <CloseCircleOutlined style={{ color: '#ef4444', fontSize: 16 }} />;
                if (r.status === 'syncing') return <SyncOutlined spin style={{ color: '#3b82f6', fontSize: 16 }} />;
                if (r.status === 'skipped') return <MinusCircleOutlined style={{ color: '#94a3b8', fontSize: 16 }} />;
                return <ClockCircleOutlined style={{ color: '#94a3b8', fontSize: 16 }} />;
              },
            },
            {
              title: 'Object',
              dataIndex: 'label',
              key: 'label',
              width: 140,
              render: (v: string) => <Text strong style={{ fontSize: 13 }}>{v}</Text>,
            },
            {
              title: 'Progress',
              key: 'progress',
              render: (_: any, r: SingleSupplierSyncItem) => {
                if (r.status === 'pending') return <Text style={{ color: '#94a3b8', fontSize: 12 }}>Waiting…</Text>;
                if (r.status === 'skipped') return <Text style={{ color: '#94a3b8', fontSize: 12 }}>Skipped</Text>;
                if (r.status === 'syncing' && r.step) {
                  const prog = r.processed ?? 0;
                  const total = r.total ?? 0;
                  return (
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Space size={6}>
                        <Text style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>{r.step}</Text>
                        {total > 0 && <Text style={{ fontSize: 12 }}>{prog} / {total}</Text>}
                      </Space>
                      {total > 0 && (
                        <Progress
                          percent={Math.round((prog / total) * 100)}
                          size="small"
                          showInfo={false}
                          strokeColor={r.key === 'payments' ? '#8b5cf6' : '#3b82f6'}
                          style={{ margin: 0, minWidth: 200 }}
                        />
                      )}
                    </Space>
                  );
                }
                if (r.status === 'done') {
                  return <Text style={{ fontSize: 12, color: '#22c55e' }}>✓ {r.inserted} inserted</Text>;
                }
                return <Text type="danger" style={{ fontSize: 12 }}>{r.errorMsg || 'Error'}</Text>;
              },
            },
            {
              title: 'Status',
              key: 'statusTag',
              width: 100,
              render: (_: any, r: SingleSupplierSyncItem) => {
                const map = { done: 'success', error: 'error', syncing: 'processing', pending: 'default', skipped: 'default' } as const;
                return <Tag color={map[r.status]}>{r.status}</Tag>;
              },
            },
          ]}
        />
      </Modal>

      {/* All Suppliers Sync Modal */}
      <Modal
        open={supplierSyncOpen}
        title={
          <Space>
            <DatabaseOutlined />
            <span>All Suppliers Sync — {supplierSyncList.length} suppliers</span>
            {supplierSyncing && <Tag color="processing">Syncing...</Tag>}
          </Space>
        }
        onCancel={() => { if (!supplierSyncing) setSupplierSyncOpen(false); }}
        footer={null}
        width={960}
        styles={{ body: { padding: '16px' } }}
      >
        <Row gutter={12} style={{ marginBottom: 12 }}>
          {[
            { label: 'Total',   value: supplierSyncList.length,                                          color: '#64748b' },
            { label: 'Done',    value: supplierSyncList.filter(s => s.status === 'done').length,    color: '#22c55e' },
            { label: 'Pending', value: supplierSyncList.filter(s => s.status === 'pending').length, color: '#f59e0b' },
            { label: 'Error',   value: supplierSyncList.filter(s => s.status === 'error').length,   color: '#ef4444' },
          ].map(kpi => (
            <Col key={kpi.label}>
              <Card size="small" style={{ minWidth: 80, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{kpi.label}</div>
              </Card>
            </Col>
          ))}
          <Col flex="auto" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            <Checkbox
              checked={chainAPPayments}
              onChange={e => setChainAPPayments(e.target.checked)}
              disabled={supplierSyncing}
            >
              <Text style={{ fontSize: 12 }}>Also sync AP Payments</Text>
            </Checkbox>
            {!supplierSyncing ? (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleProcessAllSuppliers}
                disabled={supplierSyncList.every(s => s.status === 'done')}
              >
                {supplierSyncList.some(s => s.status === 'done') ? 'Resume' : 'Start Syncing'}
              </Button>
            ) : (
              <Button danger icon={<StopOutlined />} onClick={() => { supplierAbortRef.current?.abort(); setSupplierSyncing(false); }}>
                Stop
              </Button>
            )}
          </Col>
        </Row>
        <Table
          dataSource={supplierSyncList}
          rowKey="supplierNumber"
          size="small"
          pagination={{ pageSize: 20 }}
          scroll={{ y: 380 }}
          columns={[
            {
              title: '',
              key: 'icon',
              width: 36,
              render: (_: any, r: SupplierSyncItem) => {
                if (r.status === 'done')    return <CheckCircleOutlined style={{ color: '#22c55e', fontSize: 16 }} />;
                if (r.status === 'error')   return <CloseCircleOutlined style={{ color: '#ef4444', fontSize: 16 }} />;
                if (r.status === 'syncing') return <SyncOutlined spin style={{ color: '#3b82f6', fontSize: 16 }} />;
                return <ClockCircleOutlined style={{ color: '#94a3b8', fontSize: 16 }} />;
              },
            },
            {
              title: 'Supplier No.',
              dataIndex: 'supplierNumber',
              key: 'supplierNumber',
              width: 120,
              render: (v: string) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text>,
            },
            { title: 'Supplier Name', dataIndex: 'supplierName', key: 'supplierName', ellipsis: true },
            {
              title: 'AP Invoices',
              key: 'inv',
              width: 160,
              render: (_: any, r: SupplierSyncItem) => {
                if (r.status === 'pending') return <Text style={{ color: '#94a3b8', fontSize: 12 }}>—</Text>;
                if (r.status === 'syncing' && (r.currentStep === 'inv-fetch' || r.currentStep === 'inv-insert')) {
                  const label = r.currentStep === 'inv-fetch' ? 'Fetching' : 'Inserting';
                  const prog = r.invProcessed ?? 0;
                  const total = r.invTotal ?? 0;
                  return (
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Space size={4}>
                        <SyncOutlined spin style={{ color: '#3b82f6', fontSize: 11 }} />
                        <Text style={{ fontSize: 11, color: '#3b82f6' }}>{label}</Text>
                        {total > 0 && <Text style={{ fontSize: 11 }}>{prog}/{total}</Text>}
                      </Space>
                      {total > 0 && <Progress percent={Math.round((prog / total) * 100)} size="small" showInfo={false} strokeColor="#3b82f6" style={{ margin: 0 }} />}
                    </Space>
                  );
                }
                const color = r.status === 'error' ? '#ef4444' : '#22c55e';
                return <Text style={{ fontSize: 12, color }}>{r.invoicesInserted} inserted</Text>;
              },
            },
            {
              title: 'AP Payments',
              key: 'pay',
              width: 160,
              render: (_: any, r: SupplierSyncItem) => {
                if (r.status === 'pending') return <Text style={{ color: '#94a3b8', fontSize: 12 }}>—</Text>;
                if (!chainAPPayments && r.status !== 'done') return <Text style={{ color: '#94a3b8', fontSize: 12 }}>skipped</Text>;
                if (r.status === 'syncing' && (r.currentStep === 'pay-fetch' || r.currentStep === 'pay-insert')) {
                  const label = r.currentStep === 'pay-fetch' ? 'Fetching' : 'Inserting';
                  const prog = r.payProcessed ?? 0;
                  const total = r.payTotal ?? 0;
                  return (
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Space size={4}>
                        <SyncOutlined spin style={{ color: '#8b5cf6', fontSize: 11 }} />
                        <Text style={{ fontSize: 11, color: '#8b5cf6' }}>{label}</Text>
                        {total > 0 && <Text style={{ fontSize: 11 }}>{prog}/{total}</Text>}
                      </Space>
                      {total > 0 && <Progress percent={Math.round((prog / total) * 100)} size="small" showInfo={false} strokeColor="#8b5cf6" style={{ margin: 0 }} />}
                    </Space>
                  );
                }
                if (r.status === 'syncing' && (r.currentStep === 'inv-fetch' || r.currentStep === 'inv-insert')) {
                  return <Text style={{ color: '#94a3b8', fontSize: 12 }}>waiting…</Text>;
                }
                if (!chainAPPayments) return <Text style={{ color: '#94a3b8', fontSize: 12 }}>skipped</Text>;
                return <Text style={{ fontSize: 12, color: '#22c55e' }}>{r.paymentsInserted} inserted</Text>;
              },
            },
            {
              title: 'Status',
              key: 'statusTag',
              width: 90,
              render: (_: any, r: SupplierSyncItem) => {
                const colors = { done: 'success', error: 'error', syncing: 'processing', pending: 'default' } as const;
                return <Tag color={colors[r.status]}>{r.status}</Tag>;
              },
            },
            {
              title: 'Error',
              dataIndex: 'errorMsg',
              key: 'errorMsg',
              ellipsis: true,
              render: (v: string) => v ? <Text type="danger" style={{ fontSize: 11 }}>{v}</Text> : null,
            },
          ]}
        />
      </Modal>

      {/* Batch List Modal */}
      <Modal
        open={batchListOpen}
        title={
          <Space>
            <DatabaseOutlined />
            <span>GL Journal Batches — {batchList.length} found</span>
            {batchSyncing && <Tag color="processing">Syncing...</Tag>}
          </Space>
        }
        onCancel={() => { if (!batchSyncing) setBatchListOpen(false); }}
        footer={null}
        width={900}
        styles={{ body: { padding: '16px' } }}
      >
        {/* Summary row */}
        <Row gutter={12} style={{ marginBottom: 12 }}>
          {[
            { label: 'Total', value: batchList.length, color: '#64748b' },
            { label: 'Done', value: batchList.filter(b => b.status === 'done').length, color: '#22c55e' },
            { label: 'Pending', value: batchList.filter(b => b.status === 'pending').length, color: '#f59e0b' },
            { label: 'Error', value: batchList.filter(b => b.status === 'error').length, color: '#ef4444' },
          ].map(kpi => (
            <Col key={kpi.label}>
              <Card size="small" style={{ minWidth: 80, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{kpi.label}</div>
              </Card>
            </Col>
          ))}
          <Col flex="auto" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            {!batchSyncing ? (
              <>
                <Button
                  size="small"
                  onClick={() => {
                    const parameters = getParameters();
                    clearDoneBatchIds(parameters);
                    setBatchList(prev => prev.map(b => ({ ...b, status: 'pending' as const })));
                  }}
                >
                  Reset Progress
                </Button>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={handleProcessBatches}
                  disabled={batchList.every(b => b.status === 'done')}
                >
                  {batchList.some(b => b.status === 'done') ? 'Resume Syncing' : 'Start Syncing'}
                </Button>
              </>
            ) : (
              <Button danger icon={<StopOutlined />} onClick={handleStopBatchSync}>
                Stop
              </Button>
            )}
          </Col>
        </Row>

        {/* Batch table */}
        <Table
          dataSource={batchList}
          rowKey="batchId"
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (t, r) => `${r[0]}-${r[1]} of ${t}` }}
          scroll={{ y: 400 }}
          columns={[
            {
              title: '',
              key: 'status',
              width: 36,
              render: (_: any, r: BatchListItem) => {
                if (r.status === 'done') return <CheckCircleOutlined style={{ color: '#22c55e', fontSize: 16 }} />;
                if (r.status === 'error') return <CloseCircleOutlined style={{ color: '#ef4444', fontSize: 16 }} />;
                if (r.status === 'syncing') return <SyncOutlined spin style={{ color: '#3b82f6', fontSize: 16 }} />;
                return <ClockCircleOutlined style={{ color: '#94a3b8', fontSize: 16 }} />;
              },
            },
            {
              title: 'Batch ID',
              dataIndex: 'batchId',
              key: 'batchId',
              width: 90,
              render: (v: number) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text>,
            },
            {
              title: 'Batch Name',
              dataIndex: 'batchName',
              key: 'batchName',
              ellipsis: true,
              render: (v: string, r: BatchListItem) => (
                <span>
                  <Text style={{ fontSize: 12 }}>{v}</Text>
                  {r.errorMsg && <Text type="danger" style={{ fontSize: 11, marginLeft: 8 }}>{r.errorMsg}</Text>}
                </span>
              ),
            },
            {
              title: 'Headers',
              key: 'headers',
              width: 100,
              align: 'right' as const,
              render: (_: any, r: BatchListItem) =>
                r.status === 'pending' ? <Text type="secondary">—</Text> :
                <Text style={{ fontSize: 12 }}>{r.headersInserted}/{r.headersCount}</Text>,
            },
            {
              title: 'Lines',
              key: 'lines',
              width: 100,
              align: 'right' as const,
              render: (_: any, r: BatchListItem) =>
                r.status === 'pending' ? <Text type="secondary">—</Text> :
                <Text style={{ fontSize: 12 }}>{r.linesInserted}/{r.linesCount}</Text>,
            },
            {
              title: 'Status',
              key: 'statusText',
              width: 80,
              render: (_: any, r: BatchListItem) => {
                const colors = { done: 'success', error: 'error', syncing: 'processing', pending: 'default' } as const;
                return <Tag color={colors[r.status]}>{r.status}</Tag>;
              },
            },
          ]}
        />
      </Modal>
    </Layout>
  );
};

export default SyncData;
