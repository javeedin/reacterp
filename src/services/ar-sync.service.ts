import { ORACLE_FUSION_CONFIG, APEX_DB_CONFIG } from '../config/api.config';
import { fetchFromOracle, fetchAllFromOracleUrl, insertToApex } from './sync-http';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ARSyncProgress {
  status: 'idle' | 'fetching' | 'inserting' | 'completed' | 'error' | 'stopped';
  totalInvoices: number;
  processedInvoices: number;
  insertedInvoices: number;
  currentInvoiceNumber: string;
  totalLines: number;
  processedLines: number;
  currentPage: number;
  totalPages: number;
  errors: number;
  lastError: string;
  startTime: Date | null;
  endTime: Date | null;
}

export type LogCallback = (type: 'info' | 'success' | 'error' | 'warning' | 'step', message: string) => void;
export type ARProgressCallback = (progress: Partial<ARSyncProgress>) => void;

const APEX_AR_INVOICES_ENDPOINT = 'ar/invoices/bulk';
const APEX_AR_LINES_ENDPOINT    = 'ar/invoices/lines/bulk';

// ─── Oracle Fetch ─────────────────────────────────────────────────────────────

const fetchARInvoicesFromOracle = async (
  params: Record<string, string>,
  log?: LogCallback,
  verbose = true
): Promise<{ success: boolean; items: any[]; hasMore: boolean; totalResults?: number; error?: string }> => {
  try {
    log?.('step', `──── [GET] Oracle Fusion AR Invoices (offset=${params.offset ?? 0}, limit=${params.limit}) ────`);

    const data = await fetchFromOracle('receivablesInvoices', params, log, verbose);

    log?.('info', `  Oracle response: ${(data.items || []).length} items, hasMore=${data.hasMore}, totalResults=${data.totalResults ?? data.count ?? 'N/A'}`);

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

const fetchARInvoiceLinesFromOracle = async (
  customerTransactionId: number,
  log?: LogCallback,
): Promise<{ success: boolean; items: any[]; error?: string }> => {
  try {
    const url = `${ORACLE_FUSION_CONFIG.baseUrl}/receivablesInvoices/${customerTransactionId}/child/receivablesInvoiceLines`;

    log?.('step', `──── [GET] Oracle Fusion AR Invoice Lines (Txn: ${customerTransactionId}) ────`);
    log?.('info', `  URL: ${url}`);

    const items = await fetchAllFromOracleUrl(url, log, true, 500);

    log?.('success', `  Fetched ${items.length} lines for Transaction ${customerTransactionId}`);
    log?.('step', '──── GET RESPONSE (Invoice Lines) ────');
    log?.('info', JSON.stringify({ count: items.length, items }, null, 2));

    return { success: true, items };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `Fetch Lines Error: ${errorMsg}`);
    return { success: false, items: [], error: errorMsg };
  }
};

// ─── APEX Insert ──────────────────────────────────────────────────────────────

const insertARInvoicesToApex = async (
  invoices: any[],
  log?: LogCallback,
  verbose = true
): Promise<{ success: boolean; successCount: number; error?: string }> => {
  try {
    const payload = { items: invoices.map(inv => {
      const { links, ...rest } = inv as any;
      return rest;
    }) };

    if (verbose) {
      log?.('step', `──── [POST] APEX AR Invoices (${invoices.length} records) ────`);
      log?.('info', JSON.stringify(payload, null, 2));
    }

    const data = await insertToApex(APEX_AR_INVOICES_ENDPOINT, payload, log, verbose);

    if (verbose) {
      log?.('step', '──── POST RESPONSE ────');
      log?.('success', JSON.stringify(data, null, 2));
    }

    const isSuccess = data.status === 'SUCCESS';
    return {
      success: isSuccess,
      successCount: data.successCount ?? (isSuccess ? invoices.length : 0),
      error: isSuccess ? undefined : (data.message || data.error || 'Insert failed'),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `POST Error: ${errorMsg}`);
    return { success: false, successCount: 0, error: errorMsg };
  }
};

const insertARLinesToApex = async (
  lines: any[],
  customerTransactionId: number,
  log?: LogCallback,
): Promise<{ success: boolean; successCount: number; error?: string }> => {
  try {
    const payload = { items: lines.map(line => {
      const { links, ...rest } = line as any;
      return { CustomerTransactionId: customerTransactionId, ...rest };
    }) };

    log?.('step', `──── [POST] APEX AR Lines for Txn ${customerTransactionId} (${lines.length} lines) ────`);
    log?.('info', `  URL: ${APEX_DB_CONFIG.baseUrl}/${APEX_AR_LINES_ENDPOINT}`);
    log?.('step', '──── POST PAYLOAD (Invoice Lines) ────');
    log?.('info', JSON.stringify(payload, null, 2));

    const data = await insertToApex(APEX_AR_LINES_ENDPOINT, payload, log, true);

    log?.('step', '──── POST RESPONSE (Invoice Lines) ────');
    log?.('success', JSON.stringify(data, null, 2));

    const isSuccess = data.status === 'SUCCESS';
    return {
      success: isSuccess,
      successCount: data.successCount ?? (isSuccess ? lines.length : 0),
      error: isSuccess ? undefined : (data.message || data.error || 'Lines insert failed'),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `POST Lines Error: ${errorMsg}`);
    return { success: false, successCount: 0, error: errorMsg };
  }
};

// ─── Test Connection ──────────────────────────────────────────────────────────

export const testARConnection = async (log?: LogCallback): Promise<boolean> => {
  try {
    log?.('info', 'Testing Oracle Fusion AR Invoices connection...');
    const result = await fetchARInvoicesFromOracle({ limit: '1', offset: '0' }, log, true);
    if (result.success) {
      log?.('success', 'Oracle Fusion AR connection successful!');
      log?.('info', `Sample data: ${result.items?.length ?? 0} invoices`);
      return true;
    }
    log?.('error', 'Connection test failed');
    return false;
  } catch (error) {
    log?.('error', `Connection test error: ${error}`);
    return false;
  }
};

// ─── Main Sync ────────────────────────────────────────────────────────────────

export const syncARInvoices = async (
  parameters: Record<string, string>,
  testMode: boolean | 'single' = true,
  log?: LogCallback,
  onProgress?: ARProgressCallback,
  abortSignal?: AbortSignal
): Promise<ARSyncProgress> => {
  const progress: ARSyncProgress = {
    status: 'idle',
    totalInvoices: 0,
    processedInvoices: 0,
    insertedInvoices: 0,
    currentInvoiceNumber: '',
    totalLines: 0,
    processedLines: 0,
    currentPage: 0,
    totalPages: 0,
    errors: 0,
    lastError: '',
    startTime: new Date(),
    endTime: null,
  };

  const updateProgress = (updates: Partial<ARSyncProgress>) => {
    Object.assign(progress, updates);
    onProgress?.(updates);
  };

  let pageSize: number;
  let maxRecords: number | null;

  if (testMode === 'single') {
    pageSize = 1;
    maxRecords = 1;
  } else if (testMode === true) {
    pageSize = 25;
    maxRecords = 25;
  } else {
    pageSize = 500;  // Full sync: 500 per page
    maxRecords = null;
  }

  const verbose = testMode !== false;
  const modeLabel = testMode === 'single' ? 'SINGLE RECORD DEBUG' : (testMode ? 'TEST MODE (25 invoices)' : 'FULL SYNC (all invoices)');

  try {
    updateProgress({ status: 'fetching' });

    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('step', `  AR INVOICES SYNC - ${modeLabel}`);
    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('info', '  │ FUSION GET (Source):');
    log?.('info', `  │   Invoices: ${ORACLE_FUSION_CONFIG.baseUrl}/receivablesInvoices`);
    log?.('info', `  │   Lines:    ${ORACLE_FUSION_CONFIG.baseUrl}/receivablesInvoices/{id}/child/receivablesInvoiceLines`);
    log?.('info', '  │ APEX POST (Target):');
    log?.('info', `  │   Invoices: ${APEX_DB_CONFIG.baseUrl}/${APEX_AR_INVOICES_ENDPOINT}`);
    log?.('info', `  │   Lines:    ${APEX_DB_CONFIG.baseUrl}/${APEX_AR_LINES_ENDPOINT}`);
    log?.('step', '═══════════════════════════════════════════════════════════');

    // ── STEP 1: Fetch AR Invoices ──────────────────────────────────────────────
    let allInvoices: any[] = [];
    let currentPage = 0;
    let hasMore = true;

    while (hasMore && (maxRecords === null || allInvoices.length < maxRecords) && !abortSignal?.aborted) {
      currentPage++;
      updateProgress({ currentPage });

      const offset = (currentPage - 1) * pageSize;
      const fetchLimit = maxRecords !== null
        ? Math.min(pageSize, maxRecords - allInvoices.length)
        : pageSize;

      if (verbose) log?.('info', `Page ${currentPage}: offset=${offset}, limit=${fetchLimit}`);

      const queryParams: Record<string, string> = {
        limit: String(fetchLimit),
        offset: String(offset),
      };

      // Build filter from parameters
      const filters = Object.entries(parameters)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${v}`)
        .join(';');
      if (filters) queryParams.q = filters;

      const result = await fetchARInvoicesFromOracle(queryParams, log, verbose);

      if (!result.success) {
        updateProgress({ status: 'error', lastError: result.error || 'Failed to fetch AR invoices', endTime: new Date() });
        return progress;
      }

      if (result.items.length === 0) {
        if (verbose) log?.('info', 'No more invoices to fetch');
        hasMore = false;
        break;
      }

      allInvoices = [...allInvoices, ...result.items];
      // Continue if: got a full page OR Oracle explicitly says hasMore
      // (don't rely solely on hasMore flag — some Fusion endpoints omit it on the last page)
      hasMore = result.items.length > 0 && (result.hasMore === true || result.items.length === fetchLimit);
      if (maxRecords !== null && allInvoices.length >= maxRecords) hasMore = false;

      log?.('info', `Page ${currentPage}: ${result.items.length} invoices fetched (Total so far: ${allInvoices.length}, hasMore: ${hasMore})`);

      if (hasMore) await new Promise(r => setTimeout(r, 100));
    }

    updateProgress({ totalInvoices: allInvoices.length, totalPages: currentPage });
    log?.('success', `Total AR invoices fetched: ${allInvoices.length}`);

    if (allInvoices.length === 0) {
      updateProgress({ status: 'completed', endTime: new Date() });
      log?.('warning', 'No AR invoices found for the given parameters');
      return progress;
    }

    // ── STEP 2: Insert Invoices in Batches ────────────────────────────────────
    updateProgress({ status: 'inserting' });
    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('step', '  STEP 2: Inserting AR Invoices to APEX');
    log?.('step', '═══════════════════════════════════════════════════════════');

    const batchSize = 50;
    let insertedInvoices = 0;

    for (let i = 0; i < allInvoices.length; i += batchSize) {
      if (abortSignal?.aborted) {
        updateProgress({ status: 'stopped', endTime: new Date() });
        log?.('warning', 'Sync stopped by user');
        return progress;
      }

      const batch = allInvoices.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(allInvoices.length / batchSize);

      log?.('info', `Inserting batch ${batchNum}/${totalBatches} (${batch.length} invoices)`);

      const insertResult = await insertARInvoicesToApex(batch, log, verbose);

      if (insertResult.success) {
        insertedInvoices += insertResult.successCount;
        updateProgress({ insertedInvoices, processedInvoices: Math.min(i + batch.length, allInvoices.length) });
        log?.('success', `✓ Batch ${batchNum}: ${insertResult.successCount} invoices inserted`);
      } else {
        updateProgress({
          errors: progress.errors + 1,
          lastError: insertResult.error || 'Batch insert failed',
          processedInvoices: Math.min(i + batch.length, allInvoices.length),
        });
        log?.('error', `✗ Batch ${batchNum} failed: ${insertResult.error}`);
      }
    }

    // ── STEP 3: Fetch & Insert Lines per Invoice ───────────────────────────────
    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('step', '  STEP 3: Fetching and Inserting AR Invoice Lines');
    log?.('step', '═══════════════════════════════════════════════════════════');

    let totalLines = 0;
    let processedLines = 0;

    for (let i = 0; i < allInvoices.length; i++) {
      if (abortSignal?.aborted) {
        updateProgress({ status: 'stopped', endTime: new Date() });
        log?.('warning', 'Sync stopped by user');
        return progress;
      }

      const invoice = allInvoices[i];
      const txnId: number = invoice.CustomerTransactionId;
      const txnNumber: string = invoice.TransactionNumber || String(txnId);

      if (verbose) log?.('info', `[${i + 1}/${allInvoices.length}] Lines for ${txnNumber} (ID: ${txnId})`);

      if (!txnId) {
        if (verbose) log?.('warning', `  Skipping — no CustomerTransactionId`);
        continue;
      }

      const linesResult = await fetchARInvoiceLinesFromOracle(txnId, log);

      if (!linesResult.success) {
        log?.('error', `  ✗ Failed to fetch lines for ${txnNumber}: ${linesResult.error}`);
        continue;
      }

      if (linesResult.items.length === 0) {
        log?.('info', `  No lines found for ${txnNumber} — skipping POST`);
        continue;
      }

      totalLines += linesResult.items.length;
      updateProgress({ totalLines });

      // Batch-insert lines
      const lineBatchSize = 100;
      for (let j = 0; j < linesResult.items.length; j += lineBatchSize) {
        const lineBatch = linesResult.items.slice(j, j + lineBatchSize);
        const lineInsertResult = await insertARLinesToApex(lineBatch, txnId, log);

        if (lineInsertResult.success) {
          processedLines += lineInsertResult.successCount;
          updateProgress({ processedLines });
          if (verbose) log?.('success', `  ✓ ${lineInsertResult.successCount} lines inserted for ${txnNumber}`);
        } else {
          updateProgress({ errors: progress.errors + 1, lastError: lineInsertResult.error || 'Lines insert failed' });
          log?.('error', `  ✗ Lines failed for ${txnNumber}: ${lineInsertResult.error}`);
        }
      }

      if (i < allInvoices.length - 1) await new Promise(r => setTimeout(r, 50));
    }

    // ── COMPLETE ──────────────────────────────────────────────────────────────
    updateProgress({
      status: abortSignal?.aborted ? 'stopped' : 'completed',
      endTime: new Date(),
      processedInvoices: allInvoices.length,
      processedLines,
      totalLines,
    });

    log?.('success', `✓ AR Sync completed: ${progress.insertedInvoices} invoices, ${processedLines} lines inserted`);
    if (progress.errors > 0) log?.('warning', `⚠ ${progress.errors} errors occurred`);

    return progress;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    updateProgress({ status: 'error', lastError: errorMsg, endTime: new Date() });
    log?.('error', `AR Sync failed: ${errorMsg}`);
    return progress;
  }
};
