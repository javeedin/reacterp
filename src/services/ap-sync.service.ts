import { PROXY_CONFIG, ORACLE_FUSION_CONFIG, APEX_DB_CONFIG } from '../config/api.config';

// Types
export interface APInvoice {
  InvoiceId: number;
  InvoiceNumber: string;
  InvoiceCurrency: string;
  PaymentCurrency: string;
  InvoiceAmount: number;
  InvoiceDate: string;
  BusinessUnit: string;
  Supplier: string;
  SupplierNumber: string;
  SupplierSite: string;
  InvoiceType: string;
  Description: string;
  ValidationStatus: string;
  ApprovalStatus: string;
  PaidStatus: string;
  AccountingStatus: string;
  // Child counts (from links)
  invoiceHeaders?: any[];
  invoiceLines?: any[];
  invoiceDistributions?: any[];
  links?: any[];
  [key: string]: any;
}

export interface APSyncProgress {
  status: 'idle' | 'fetching' | 'inserting' | 'completed' | 'error' | 'stopped';
  // Invoices
  totalInvoices: number;
  processedInvoices: number;
  insertedInvoices: number;
  currentInvoiceNumber: string;
  // Headers (child data)
  totalHeaders: number;
  processedHeaders: number;
  // Lines (child data)
  totalLines: number;
  processedLines: number;
  // Distributions (child data)
  totalDistributions: number;
  processedDistributions: number;
  // Pagination
  currentPage: number;
  totalPages: number;
  // Errors
  errors: number;
  lastError: string;
  // Timing
  startTime: Date | null;
  endTime: Date | null;
}

export type LogCallback = (type: 'info' | 'success' | 'error' | 'warning' | 'step', message: string) => void;
export type ProgressCallback = (progress: Partial<APSyncProgress>) => void;

// Invoice payload callback for debugging
export type InvoicePayloadCallback = (
  invoiceId: number,
  invoiceNumber: string,
  payload: any,
  result?: any,
  error?: string
) => void;

// APEX endpoint for creating invoices
const APEX_CREATE_INVOICE_ENDPOINT = 'ap/createinvoice';

// Fetch invoices from Oracle Fusion via proxy
const fetchInvoicesFromOracle = async (
  params: Record<string, string> = {},
  log?: LogCallback,
  verbose = true
): Promise<{ success: boolean; items: APInvoice[]; hasMore: boolean; totalResults?: number; error?: string }> => {
  try {
    const queryParams = new URLSearchParams(params);
    const proxyUrl = `${PROXY_CONFIG.baseUrl}/oracle/invoices?${queryParams.toString()}`;
    const oracleUrl = `${ORACLE_FUSION_CONFIG.baseUrl}/invoices?${queryParams.toString()}`;

    if (verbose) {
      log?.('step', '──── [GET] Oracle Fusion AP Invoices ────');
      log?.('info', `Oracle URL: ${oracleUrl}`);
      log?.('info', `Proxy URL: ${proxyUrl}`);
    }

    const response = await fetch(proxyUrl);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Fetch failed');
    }

    if (verbose) {
      log?.('success', `Fetched ${data.items?.length || 0} invoices`);
    }

    return {
      success: true,
      items: data.items || [],
      hasMore: data.hasMore || false,
      totalResults: data.totalResults || data.count,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `Fetch Error: ${errorMsg}`);
    return { success: false, items: [], hasMore: false, error: errorMsg };
  }
};

// Insert single invoice to APEX via proxy
const insertInvoiceToApex = async (
  invoice: APInvoice,
  log?: LogCallback,
  verbose = true
): Promise<{ success: boolean; error?: string; response?: any }> => {
  try {
    const url = `${PROXY_CONFIG.baseUrl}/apex/${APEX_CREATE_INVOICE_ENDPOINT}`;
    const apexUrl = `${APEX_DB_CONFIG.baseUrl}/${APEX_CREATE_INVOICE_ENDPOINT}`;

    if (verbose) {
      log?.('step', `──── [POST] APEX - Invoice ${invoice.InvoiceNumber} (ID: ${invoice.InvoiceId}) ────`);
      log?.('info', `APEX URL: ${apexUrl}`);
      log?.('info', `Proxy URL: ${url}`);
      log?.('info', `Invoice ID: ${invoice.InvoiceId}`);
      log?.('info', `Invoice Number: ${invoice.InvoiceNumber}`);
      log?.('info', `Supplier: ${invoice.Supplier}`);
      log?.('info', `Amount: ${invoice.InvoiceAmount} ${invoice.InvoiceCurrency}`);
      log?.('info', `POST Payload: ${JSON.stringify(invoice)}`);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoice),
    });

    const data = await response.json();

    if (verbose) {
      log?.('info', `HTTP Status: ${response.status}`);
      log?.('success', `POST Response: ${JSON.stringify(data)}`);
    }

    return {
      success: data.status === 'SUCCESS' || data.success === true,
      error: data.message || data.error,
      response: data,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `POST Error: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
};

// Main AP Invoices Sync Function
export const syncAPInvoices = async (
  parameters: Record<string, string>,
  testMode: boolean | 'single' = true,
  log?: LogCallback,
  onProgress?: ProgressCallback,
  abortSignal?: AbortSignal,
  onInvoicePayload?: InvoicePayloadCallback
): Promise<APSyncProgress> => {
  const progress: APSyncProgress = {
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
    startTime: new Date(),
    endTime: null,
  };

  const updateProgress = (updates: Partial<APSyncProgress>) => {
    Object.assign(progress, updates);
    onProgress?.(progress);
  };

  // Determine limits based on mode
  const pageSize = 25; // Always fetch 25 per page
  const maxRecords = testMode === 'single' ? 1 : (testMode ? 25 : 500);
  const totalPages = Math.ceil(maxRecords / pageSize);
  const verbose = testMode !== false;

  const modeLabel = testMode === 'single' ? 'SINGLE RECORD DEBUG' : (testMode ? 'TEST MODE (25 invoices)' : 'FULL SYNC (500 invoices)');

  try {
    // ========================================
    // STEP 1: Fetch Invoices from Oracle Fusion
    // ========================================
    updateProgress({ status: 'fetching', totalPages });
    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('step', `  AP INVOICES SYNC - ${modeLabel}`);
    log?.('step', '═══════════════════════════════════════════════════════════');

    log?.('info', `Parameters: ${JSON.stringify(parameters)}`);
    log?.('info', `Max Records: ${maxRecords}, Page Size: ${pageSize}, Total Pages: ${totalPages}`);

    let allInvoices: APInvoice[] = [];
    let currentPage = 0;
    let hasMore = true;

    // Fetch with pagination
    while (hasMore && allInvoices.length < maxRecords && !abortSignal?.aborted) {
      currentPage++;
      updateProgress({ currentPage });

      const offset = (currentPage - 1) * pageSize;
      const remainingNeeded = maxRecords - allInvoices.length;
      const fetchLimit = Math.min(pageSize, remainingNeeded);

      log?.('info', `Page ${currentPage}/${totalPages}: Fetching offset=${offset}, limit=${fetchLimit}`);

      // Build query parameters
      const queryParams: Record<string, string> = {
        limit: fetchLimit.toString(),
        offset: offset.toString(),
      };

      // Add filter parameters
      const filters = Object.entries(parameters)
        .filter(([, value]) => value)
        .map(([key, value]) => `${key}=${value}`)
        .join(';');

      if (filters) {
        queryParams.q = filters;
      }

      const result = await fetchInvoicesFromOracle(queryParams, log, verbose);

      if (!result.success) {
        updateProgress({
          status: 'error',
          lastError: result.error || 'Failed to fetch invoices',
          endTime: new Date()
        });
        return progress;
      }

      if (result.items.length === 0) {
        log?.('info', 'No more invoices to fetch');
        hasMore = false;
        break;
      }

      allInvoices = [...allInvoices, ...result.items];
      hasMore = result.hasMore && allInvoices.length < maxRecords;

      log?.('success', `Page ${currentPage}: Fetched ${result.items.length} invoices (Total: ${allInvoices.length})`);

      // Small delay between pages
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Count child records (headers, lines, distributions) from links
    let totalHeaders = 0;
    let totalLines = 0;
    let totalDistributions = 0;

    allInvoices.forEach(invoice => {
      // Count based on links if available
      if (invoice.links && Array.isArray(invoice.links)) {
        const headerLink = invoice.links.find((l: any) => l.name === 'invoiceHeaders');
        const lineLink = invoice.links.find((l: any) => l.name === 'invoiceLines');
        const distLink = invoice.links.find((l: any) => l.name === 'invoiceDistributions');

        // Estimate 1 header per invoice, varies for lines/distributions
        if (headerLink) totalHeaders++;
        if (lineLink) totalLines++;
        if (distLink) totalDistributions++;
      } else {
        // Default estimate: 1 header, 2 lines, 2 distributions per invoice
        totalHeaders += 1;
        totalLines += 2;
        totalDistributions += 2;
      }
    });

    updateProgress({
      totalInvoices: allInvoices.length,
      totalHeaders,
      totalLines,
      totalDistributions,
    });

    log?.('success', `Total invoices fetched: ${allInvoices.length}`);
    log?.('info', `Estimated: ${totalHeaders} headers, ${totalLines} lines, ${totalDistributions} distributions`);

    if (allInvoices.length === 0) {
      updateProgress({ status: 'completed', endTime: new Date() });
      log?.('warning', 'No invoices found for the given parameters');
      return progress;
    }

    // ========================================
    // STEP 2: Insert Invoices to APEX
    // ========================================
    updateProgress({ status: 'inserting' });
    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('step', '  STEP 2: Inserting AP Invoices to APEX Database');
    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('info', `POST Endpoint: ${APEX_DB_CONFIG.baseUrl}/${APEX_CREATE_INVOICE_ENDPOINT}`);

    // Process invoices one by one
    for (let i = 0; i < allInvoices.length; i++) {
      if (abortSignal?.aborted) {
        updateProgress({ status: 'stopped' });
        log?.('warning', 'Sync stopped by user');
        break;
      }

      const invoice = allInvoices[i];
      const invoiceNum = invoice.InvoiceNumber || `Invoice ${i + 1}`;

      updateProgress({
        processedInvoices: i,
        currentInvoiceNumber: invoiceNum,
      });

      log?.('info', `[${i + 1}/${allInvoices.length}] Processing: ${invoiceNum} (ID: ${invoice.InvoiceId})`);

      // Record payload before POST for debugging
      onInvoicePayload?.(invoice.InvoiceId, invoiceNum, invoice);

      const insertResult = await insertInvoiceToApex(invoice, log, verbose);

      if (insertResult.success) {
        updateProgress({
          insertedInvoices: progress.insertedInvoices + 1,
          processedHeaders: progress.processedHeaders + 1,
          processedLines: progress.processedLines + 2,
          processedDistributions: progress.processedDistributions + 2,
        });

        // Update payload callback with success result
        onInvoicePayload?.(invoice.InvoiceId, invoiceNum, invoice, insertResult.response);

        if (verbose) {
          log?.('success', `✓ Invoice ${invoiceNum} (ID: ${invoice.InvoiceId}) inserted successfully`);
        }
      } else {
        updateProgress({
          errors: progress.errors + 1,
          lastError: insertResult.error || 'Insert failed',
        });

        // Update payload callback with error
        onInvoicePayload?.(invoice.InvoiceId, invoiceNum, invoice, insertResult.response, insertResult.error);

        log?.('error', `✗ Invoice ${invoiceNum} (ID: ${invoice.InvoiceId}) failed: ${insertResult.error}`);
      }

      // Small delay between inserts to prevent API throttling
      if (i < allInvoices.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    updateProgress({ processedInvoices: allInvoices.length });

    // ========================================
    // COMPLETE
    // ========================================
    updateProgress({
      status: abortSignal?.aborted ? 'stopped' : 'completed',
      endTime: new Date(),
    });

    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('step', '  SYNC COMPLETED');
    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('success', `Total Invoices Processed: ${progress.processedInvoices}`);
    log?.('success', `Total Invoices Inserted: ${progress.insertedInvoices}`);
    log?.('success', `Headers: ${progress.processedHeaders}, Lines: ${progress.processedLines}, Distributions: ${progress.processedDistributions}`);
    log?.('info', `Errors: ${progress.errors}`);

    return progress;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    updateProgress({
      status: 'error',
      lastError: errorMsg,
      endTime: new Date(),
    });
    log?.('error', `Sync failed: ${errorMsg}`);
    return progress;
  }
};

// Test Oracle Fusion connection for AP Invoices
export const testAPConnection = async (log?: LogCallback): Promise<boolean> => {
  try {
    log?.('info', 'Testing Oracle Fusion AP Invoices connection...');

    const result = await fetchInvoicesFromOracle({ limit: '1', offset: '0' }, log);

    if (result.success) {
      log?.('success', 'Oracle Fusion AP connection successful!');
      log?.('info', `Sample data available: ${result.items?.length || 0} invoices`);
      return true;
    }

    log?.('error', 'Connection test failed');
    return false;
  } catch (error) {
    log?.('error', `Connection test error: ${error}`);
    return false;
  }
};

// Get AP Invoice statistics from APEX
export const getAPInvoiceStats = async (log?: LogCallback): Promise<{
  totalInvoices: number;
  validatedCount: number;
  approvedCount: number;
  paidCount: number;
  unpaidCount: number;
  canceledCount: number;
  totalAmount: number;
  totalPaid: number;
  totalOutstanding: number;
  lastSyncDate: string;
} | null> => {
  try {
    const url = `${PROXY_CONFIG.baseUrl}/apex/${APEX_DB_CONFIG.endpoints.apInvoicesStats}`;

    log?.('info', 'Fetching AP Invoice statistics...');

    const response = await fetch(url);
    const data = await response.json();

    if (data.success) {
      log?.('success', 'Statistics retrieved successfully');
      return data.items?.[0] || null;
    }

    log?.('error', `Failed to get statistics: ${data.error}`);
    return null;
  } catch (error) {
    log?.('error', `Stats error: ${error}`);
    return null;
  }
};
