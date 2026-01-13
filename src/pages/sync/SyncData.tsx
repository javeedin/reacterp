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
  DatabaseOutlined,
  FileTextOutlined,
  UnorderedListOutlined,
  ThunderboltOutlined,
  ExpandOutlined,
  DownloadOutlined,
  SendOutlined,
  BugOutlined,
  BankOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { SYNC_OBJECTS, PROXY_CONFIG, APEX_DB_CONFIG, type SyncObjectConfig, type ApiType } from '../../config/api.config';
import { syncGLJournals, syncGLBatchesOnly, testGLConnection, type SyncProgress, type BatchOnlySyncProgress, type LogCallback, type BatchPayloadCallback } from '../../services/gl-sync.service';
import { syncAPInvoices, testAPConnection, type APSyncProgress, type InvoicePayloadCallback } from '../../services/ap-sync.service';
import { syncAPPayments, testAPPaymentsConnection, type APPaymentsSyncProgress, type PaymentPayloadCallback } from '../../services/ap-payments-sync.service';
import { syncGLCodeCombinations, testGLCodeCombConnection, type CodeCombSyncProgress, type CodeCombPayloadCallback } from '../../services/gl-codecomb-sync.service';
import { syncGLPeriodStatus, testGLPeriodStatusConnection, type PeriodStatusSyncProgress, type PeriodStatusPayloadCallback } from '../../services/gl-periodstatus-sync.service';
import { syncBanks, testBanksConnection, type BanksSyncProgress, type BanksPayloadCallback } from '../../services/banks-sync.service';
import { syncBankBranches, testBankBranchesConnection, type BankBranchesSyncProgress, type BankBranchesPayloadCallback } from '../../services/bank-branches-sync.service';
import { syncBankAccounts, testBankAccountsConnection, type BankAccountsSyncProgress, type BankAccountsPayloadCallback } from '../../services/bank-accounts-sync.service';
import { syncLegalEntities, testLegalEntitiesConnection, type LegalEntitiesSyncProgress, type LegalEntitiesPayloadCallback } from '../../services/legal-entities-sync.service';
import { syncUserAccounts, testUserAccountsConnection, type UserAccountsSyncProgress, type UserAccountsPayloadCallback } from '../../services/user-accounts-sync.service';
import { syncUserAccountRoles, testUserAccountRolesConnection, type UserAccountRolesSyncProgress, type UserAccountRolesPayloadCallback } from '../../services/user-account-roles-sync.service';
import { syncRoles, testRolesConnection, type RolesSyncProgress, type RolesPayloadCallback } from '../../services/roles-sync.service';
import { syncSuppliers, testSuppliersConnection, type SuppliersSyncProgress, type SuppliersPayloadCallback } from '../../services/suppliers-sync.service';
import { syncSupplierAddresses, testSupplierAddressConnection, type SupplierAddressSyncProgress, type SupplierAddressPayloadCallback } from '../../services/supplier-address-sync.service';
import { syncSupplierSites, testSupplierSitesConnection, type SupplierSitesSyncProgress, type SupplierSitesPayloadCallback } from '../../services/supplier-sites-sync.service';
import { syncSiteAssignments, testSiteAssignmentsConnection, type SiteAssignmentsSyncProgress, type SiteAssignmentsPayloadCallback } from '../../services/supplier-site-assignments-sync.service';
import { useSyncWorker, type WorkerSyncProgress, type WorkerLog } from '../../hooks/useSyncWorker';
import Autopilot from '../../components/Autopilot';
import { useElectron, useElectronBackgroundSync } from '../../hooks/useElectron';

// Icon imports for AP
import { FileSearchOutlined, BranchesOutlined } from '@ant-design/icons';

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

const SyncData: React.FC = () => {
  const [form] = Form.useForm();
  const [selectedObject, setSelectedObject] = useState<SyncObjectConfig | null>(null);
  const [, setApiType] = useState<ApiType>('REST');
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
    isBackgroundSyncSupported: isElectronBgSyncSupported,
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
  const [codeCombPayloads, setCodeCombPayloads] = useState<Array<{
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
  const [periodStatusPayloads, setPeriodStatusPayloads] = useState<Array<{
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
  const [banksPayloads, setBanksPayloads] = useState<Array<{
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
  const [bankBranchesPayloads, setBankBranchesPayloads] = useState<Array<{
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
  const [bankAccountsPayloads, setBankAccountsPayloads] = useState<Array<{
    bankAccountId: number;
    accountName: string;
    payload: any;
    postResult?: any;
    status: 'pending' | 'success' | 'error';
    errorMessage?: string;
  }>>([]);

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

  // Legal Entities payload state (for debug)
  const [legalEntitiesPayloads, setLegalEntitiesPayloads] = useState<Array<{
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
  const [userAccountsPayloads, setUserAccountsPayloads] = useState<Array<{
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
  const [userAccountRolesPayloads, setUserAccountRolesPayloads] = useState<Array<{
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
  const [rolesPayloads, setRolesPayloads] = useState<Array<{
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
  const [suppliersPayloads, setSuppliersPayloads] = useState<Array<{
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
  const [supplierAddressPayloads, setSupplierAddressPayloads] = useState<Array<{
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
  const [supplierSitesPayloads, setSupplierSitesPayloads] = useState<Array<{
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
  const [siteAssignmentsPayloads, setSiteAssignmentsPayloads] = useState<Array<{
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

  // Determine sync type based on selected object
  const isAPInvoices = selectedObject?.id === 'ap-invoices';
  const isAPPayments = selectedObject?.id === 'ap-payments';
  const isGLCodeComb = selectedObject?.id === 'gl-code-combinations';
  const isGLPeriodStatus = selectedObject?.id === 'gl-period-status';
  const isBanks = selectedObject?.id === 'banks';
  const isBankBranches = selectedObject?.id === 'bank-branches';
  const isBankAccounts = selectedObject?.id === 'bank-accounts';
  const isLegalEntities = selectedObject?.id === 'legal-entities';
  const isUserAccounts = selectedObject?.id === 'user-accounts';
  const isUserAccountRoles = selectedObject?.id === 'user-account-roles';
  const isRoles = selectedObject?.id === 'roles';
  const isSuppliers = selectedObject?.id === 'suppliers';
  const isSupplierAddresses = selectedObject?.id === 'supplier-addresses';
  const isSupplierSites = selectedObject?.id === 'supplier-sites';
  const isSiteAssignments = selectedObject?.id === 'supplier-site-assignments';
  const isGLBatchesOnly = selectedObject?.id === 'gl-batches-only';

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
  const logCounterRef = useRef(0); // Track total logs generated for debugging

  const addLog: LogCallback = useCallback((type, message) => {
    logCounterRef.current += 1;
    const logNumber = logCounterRef.current;

    const log: SyncLog = {
      id: `${logNumber}-${Date.now()}`,
      timestamp: new Date(),
      type,
      message,
    };

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

  // POST a single batch manually
  const postSingleBatch = useCallback(async (batchPayload: BatchPayloadLog) => {
    setIsPostingBatch(true);
    addLog('step', `──── Manual POST for Batch ${batchPayload.batchId} ────`);

    try {
      const url = `${PROXY_CONFIG.baseUrl}/apex/${APEX_DB_CONFIG.endpoints.journalBatches}`;
      addLog('info', `POST URL: ${url}`);
      addLog('info', `POST Payload: ${JSON.stringify(batchPayload.payload)}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchPayload.payload),
      });

      const data = await response.json();
      addLog('success', `POST Response: ${JSON.stringify(data)}`);

      if (data.success || data.inserted > 0) {
        updateBatchPayloadStatus(batchPayload.batchId, 'success', data);
        addLog('success', `✓ Batch ${batchPayload.batchId} posted successfully!`);
      } else {
        updateBatchPayloadStatus(batchPayload.batchId, 'error', data, data.error || data.lastError || 'Unknown error');
        addLog('error', `✗ Batch ${batchPayload.batchId} failed: ${data.error || data.lastError || JSON.stringify(data)}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      updateBatchPayloadStatus(batchPayload.batchId, 'error', undefined, errorMsg);
      addLog('error', `✗ Batch ${batchPayload.batchId} error: ${errorMsg}`);
    }

    setIsPostingBatch(false);
  }, [addLog, updateBatchPayloadStatus]);

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
      const url = `${PROXY_CONFIG.baseUrl}/apex/ap/createinvoice`;

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
    setSelectedObject(object || null);
    form.resetFields(['parameters']);

    if (object) {
      addLog('info', `Selected: ${object.name}`);
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
    } else if (isLegalEntities) {
      addLog('info', 'Testing Legal Entities endpoint...');
      success = await testLegalEntitiesConnection(addLog);
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
      // AP Invoices Sync
      setApProgress({
        status: 'fetching',
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
        currentPage: 0,
        totalPages: 0,
        errors: 0,
        lastError: '',
        startTime: new Date(),
        endTime: null,
      });

      const result = await syncAPInvoices(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setApProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.processedInvoices !== undefined && newProgress.totalInvoices) {
            notifySyncProgress(`${newProgress.processedInvoices}/${newProgress.totalInvoices} invoices`);
          }
        },
        abortControllerRef.current.signal,
        handleInvoicePayload
      );
      syncResult = { inserted: result.insertedInvoices, errors: result.errors, type: 'invoices' };
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
    } else if (isGLBatchesOnly) {
      // GL Batches Only Sync
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

      const result = await syncGLBatchesOnly(
        parameters,
        testMode,
        addLog,
        (newProgress) => {
          setGLBatchesOnlyProgress((prev) => ({ ...prev, ...newProgress }));
          if (newProgress.insertedBatches !== undefined && newProgress.totalBatches) {
            notifySyncProgress(`${newProgress.insertedBatches}/${newProgress.totalBatches} batches inserted`);
          }
        },
        abortControllerRef.current.signal
      );
      syncResult = { inserted: result.insertedBatches, errors: result.errors, type: 'batches' };
    } else {
      // GL Journals Sync
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
      addLog('step', `  GL JOURNAL SYNC - ${modeLabel}`);
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
    : isLegalEntities
    ? legalEntitiesProgress.status
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

                <Form form={form} layout="vertical">
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
                    <Form.Item
                      key={param.key}
                      label={<Text strong>{param.label}</Text>}
                      name={param.key}
                      rules={[{ required: param.required, message: `Please enter ${param.label}` }]}
                      initialValue={param.defaultValue}
                    >
                      <Input placeholder={`Enter ${param.label}`} disabled={isSyncing || isTesting} />
                    </Form.Item>
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
                        <span style={{ color: REDWOOD.success }}>●</span> Full Sync ({isAPPayments ? '500 payments' : isAPInvoices ? '500 invoices' : 'All records'})
                      </Option>
                    </Select>
                    <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                      {testMode === 'single'
                        ? `Debug mode: Sync only 1 ${isAPPayments ? 'payment' : isAPInvoices ? 'invoice' : isGLCodeComb ? 'code combination' : 'batch'} with full logging`
                        : testMode
                        ? `Limited to 25 ${isAPPayments ? 'payments' : isAPInvoices ? 'invoices' : isGLCodeComb ? 'code combinations' : 'batches'} for testing`
                        : isAPPayments
                        ? 'Full sync - 500 payments (paginated 25 per page)'
                        : isAPInvoices
                        ? 'Full sync - 500 invoices (paginated 25 per page)'
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
                        Start Sync
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
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {/* Invoices Card */}
                  <Col xs={24} sm={6}>
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
                  <Col xs={24} sm={6}>
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
                  <Col xs={24} sm={6}>
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

                  {/* Distributions Card */}
                  <Col xs={24} sm={6}>
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
                      {(isAPPayments ? apPaymentsProgress.startTime : isAPInvoices ? apProgress.startTime : isGLCodeComb ? codeCombProgress.startTime : isGLPeriodStatus ? periodStatusProgress.startTime : isBanks ? banksProgress.startTime : isBankBranches ? bankBranchesProgress.startTime : isBankAccounts ? bankAccountsProgress.startTime : isLegalEntities ? legalEntitiesProgress.startTime : isUserAccounts ? userAccountsProgress.startTime : isUserAccountRoles ? userAccountRolesProgress.startTime : isRoles ? rolesProgress.startTime : isSuppliers ? suppliersProgress.startTime : isSupplierAddresses ? supplierAddressProgress.startTime : progress.startTime) && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Started: {(isAPPayments ? apPaymentsProgress.startTime : isAPInvoices ? apProgress.startTime : isGLCodeComb ? codeCombProgress.startTime : isGLPeriodStatus ? periodStatusProgress.startTime : isBanks ? banksProgress.startTime : isBankBranches ? bankBranchesProgress.startTime : isBankAccounts ? bankAccountsProgress.startTime : isLegalEntities ? legalEntitiesProgress.startTime : isUserAccounts ? userAccountsProgress.startTime : isUserAccountRoles ? userAccountRolesProgress.startTime : isRoles ? rolesProgress.startTime : isSuppliers ? suppliersProgress.startTime : isSupplierAddresses ? supplierAddressProgress.startTime : progress.startTime)?.toLocaleTimeString()}
                        </Text>
                      )}
                      {(isAPPayments ? apPaymentsProgress.endTime : isAPInvoices ? apProgress.endTime : isGLCodeComb ? codeCombProgress.endTime : isGLPeriodStatus ? periodStatusProgress.endTime : isBanks ? banksProgress.endTime : isBankBranches ? bankBranchesProgress.endTime : isBankAccounts ? bankAccountsProgress.endTime : isLegalEntities ? legalEntitiesProgress.endTime : isUserAccounts ? userAccountsProgress.endTime : isUserAccountRoles ? userAccountRolesProgress.endTime : isRoles ? rolesProgress.endTime : isSuppliers ? suppliersProgress.endTime : isSupplierAddresses ? supplierAddressProgress.endTime : progress.endTime) && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Ended: {(isAPPayments ? apPaymentsProgress.endTime : isAPInvoices ? apProgress.endTime : isGLCodeComb ? codeCombProgress.endTime : isGLPeriodStatus ? periodStatusProgress.endTime : isBanks ? banksProgress.endTime : isBankBranches ? bankBranchesProgress.endTime : isBankAccounts ? bankAccountsProgress.endTime : isLegalEntities ? legalEntitiesProgress.endTime : isUserAccounts ? userAccountsProgress.endTime : isUserAccountRoles ? userAccountRolesProgress.endTime : isRoles ? rolesProgress.endTime : isSuppliers ? suppliersProgress.endTime : isSupplierAddresses ? supplierAddressProgress.endTime : progress.endTime)?.toLocaleTimeString()}
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
                          : isLegalEntities
                          ? `${legalEntitiesProgress.insertedRecords} legal entities inserted`
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
                      {(isAPPayments ? apPaymentsProgress.errors : isAPInvoices ? apProgress.errors : isGLCodeComb ? codeCombProgress.errors : isGLPeriodStatus ? periodStatusProgress.errors : isBanks ? banksProgress.errors : isBankBranches ? bankBranchesProgress.errors : isBankAccounts ? bankAccountsProgress.errors : isLegalEntities ? legalEntitiesProgress.errors : isUserAccounts ? userAccountsProgress.errors : isUserAccountRoles ? userAccountRolesProgress.errors : isRoles ? rolesProgress.errors : isSuppliers ? suppliersProgress.errors : isSupplierAddresses ? supplierAddressProgress.errors : isSupplierSites ? supplierSitesProgress.errors : progress.errors) > 0 && (
                        <Text type="danger">
                          <CloseCircleOutlined style={{ marginRight: 4 }} />
                          {isAPPayments ? apPaymentsProgress.errors : isAPInvoices ? apProgress.errors : isGLCodeComb ? codeCombProgress.errors : isGLPeriodStatus ? periodStatusProgress.errors : isBanks ? banksProgress.errors : isBankBranches ? bankBranchesProgress.errors : isBankAccounts ? bankAccountsProgress.errors : isLegalEntities ? legalEntitiesProgress.errors : isUserAccounts ? userAccountsProgress.errors : isUserAccountRoles ? userAccountRolesProgress.errors : isRoles ? rolesProgress.errors : isSuppliers ? suppliersProgress.errors : isSupplierAddresses ? supplierAddressProgress.errors : isSupplierSites ? supplierSitesProgress.errors : progress.errors} errors
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
                      <Tag color="warning" style={{ borderRadius: 12 }}>
                        {logCounterRef.current - logs.length} missing!
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

      {/* Batch Debug Modal */}
      <Modal
        title={
          <Space>
            <BugOutlined style={{ color: REDWOOD.warning }} />
            <span>Batch Payload Debug</span>
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
            key="copy"
            onClick={() => {
              if (selectedBatchPayload) {
                navigator.clipboard.writeText(JSON.stringify(selectedBatchPayload.payload, null, 2));
              }
            }}
          >
            Copy Payload
          </Button>,
          <Button
            key="post"
            type="primary"
            icon={<SendOutlined />}
            loading={isPostingBatch}
            onClick={() => {
              if (selectedBatchPayload) {
                postSingleBatch(selectedBatchPayload);
              }
            }}
            style={{ background: REDWOOD.primary }}
          >
            POST This Batch
          </Button>,
          <Button key="close" onClick={() => setBatchDebugVisible(false)}>
            Close
          </Button>,
        ]}
        width={800}
      >
        {selectedBatchPayload && (
          <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <div style={{
                  padding: '8px 12px',
                  background: REDWOOD.surfaceSecondary,
                  borderRadius: 6,
                  fontSize: 12,
                }}>
                  <Text type="secondary">Batch ID: </Text>
                  <Text strong code>{selectedBatchPayload.batchId}</Text>
                </div>
              </Col>
              <Col span={12}>
                <div style={{
                  padding: '8px 12px',
                  background: REDWOOD.surfaceSecondary,
                  borderRadius: 6,
                  fontSize: 12,
                }}>
                  <Text type="secondary">Batch Name: </Text>
                  <Text strong>{selectedBatchPayload.batchName}</Text>
                </div>
              </Col>
            </Row>

            {selectedBatchPayload.errorMessage && (
              <Alert
                type="error"
                message="Error"
                description={selectedBatchPayload.errorMessage}
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
              {JSON.stringify(selectedBatchPayload.payload, null, 2)}
            </pre>

            {selectedBatchPayload.postResult && (
              <>
                <Divider style={{ margin: '12px 0' }}>POST Response</Divider>
                <pre style={{
                  background: selectedBatchPayload.status === 'success' ? '#f6ffed' : '#fff2f0',
                  padding: 16,
                  borderRadius: 8,
                  border: `1px solid ${selectedBatchPayload.status === 'success' ? '#b7eb8f' : '#ffccc7'}`,
                  maxHeight: 200,
                  overflow: 'auto',
                  fontSize: 12,
                  fontFamily: 'monospace',
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
    </Layout>
  );
};

export default SyncData;
