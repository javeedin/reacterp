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
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { SYNC_OBJECTS, PROXY_CONFIG, APEX_DB_CONFIG, type SyncObjectConfig, type ApiType } from '../../config/api.config';
import { syncGLJournals, testGLConnection, type SyncProgress, type LogCallback, type BatchPayloadCallback } from '../../services/gl-sync.service';
import { syncAPInvoices, testAPConnection, type APSyncProgress, type InvoicePayloadCallback } from '../../services/ap-sync.service';
import { syncAPPayments, testAPPaymentsConnection, type APPaymentsSyncProgress, type PaymentPayloadCallback } from '../../services/ap-payments-sync.service';
import { syncGLCodeCombinations, testGLCodeCombConnection, type CodeCombSyncProgress, type CodeCombPayloadCallback } from '../../services/gl-codecomb-sync.service';
import Autopilot from '../../components/Autopilot';
import { useElectron } from '../../hooks/useElectron';

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

  // Electron notifications
  const { notifySyncStarted, notifySyncCompleted, notifySyncError, notifySyncProgress } = useElectron();

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

  // Determine sync type based on selected object
  const isAPInvoices = selectedObject?.id === 'ap-invoices';
  const isAPPayments = selectedObject?.id === 'ap-payments';
  const isGLCodeComb = selectedObject?.id === 'gl-code-combinations';

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

    // Only log to console in test modes (verbose), not full sync for performance
    // Full sync will have minimal logs from the service anyway
    if (testMode !== false) {
      console.log(`[LOG #${logNumber}] [${type.toUpperCase()}] ${message}`);
    }

    setLogs((prev) => [log, ...prev].slice(0, 500));
  }, [testMode]);

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
                      {(isAPPayments ? apPaymentsProgress.startTime : isAPInvoices ? apProgress.startTime : isGLCodeComb ? codeCombProgress.startTime : progress.startTime) && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Started: {(isAPPayments ? apPaymentsProgress.startTime : isAPInvoices ? apProgress.startTime : isGLCodeComb ? codeCombProgress.startTime : progress.startTime)?.toLocaleTimeString()}
                        </Text>
                      )}
                      {(isAPPayments ? apPaymentsProgress.endTime : isAPInvoices ? apProgress.endTime : isGLCodeComb ? codeCombProgress.endTime : progress.endTime) && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Ended: {(isAPPayments ? apPaymentsProgress.endTime : isAPInvoices ? apProgress.endTime : isGLCodeComb ? codeCombProgress.endTime : progress.endTime)?.toLocaleTimeString()}
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
                          : `${progress.totalBatchesInserted + progress.totalHeadersInserted + progress.totalLinesInserted} inserted`
                        }
                      </Text>
                      {(isAPPayments ? apPaymentsProgress.errors : isAPInvoices ? apProgress.errors : isGLCodeComb ? codeCombProgress.errors : progress.errors) > 0 && (
                        <Text type="danger">
                          <CloseCircleOutlined style={{ marginRight: 4 }} />
                          {isAPPayments ? apPaymentsProgress.errors : isAPInvoices ? apProgress.errors : isGLCodeComb ? codeCombProgress.errors : progress.errors} errors
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
