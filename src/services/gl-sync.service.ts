import { PROXY_CONFIG, ORACLE_FUSION_CONFIG, APEX_DB_CONFIG } from '../config/api.config';

// Types
export interface SyncProgress {
  status: 'idle' | 'fetching_batches' | 'processing_batch' | 'fetching_headers' | 'processing_header' | 'fetching_lines' | 'inserting' | 'completed' | 'error' | 'stopped';

  // Batch progress
  totalBatches: number;
  processedBatches: number;
  currentBatchId: number | null;
  currentBatchName: string;

  // Header progress
  totalHeaders: number;
  processedHeaders: number;
  currentHeaderId: number | null;
  currentHeaderName: string;

  // Line progress
  totalLines: number;
  processedLines: number;

  // Totals
  totalBatchesInserted: number;
  totalHeadersInserted: number;
  totalLinesInserted: number;

  // Errors
  errors: number;
  lastError: string;

  // Timing
  startTime: Date | null;
  endTime: Date | null;
}

export type LogCallback = (type: 'info' | 'success' | 'error' | 'warning' | 'step', message: string) => void;
export type ProgressCallback = (progress: Partial<SyncProgress>) => void;
export type BatchPayloadCallback = (batchId: number, batchName: string, payload: any, result?: any, error?: string) => void;

// Extract ID from Oracle Fusion href link
const extractIdFromHref = (href: string): number | null => {
  const matches = href.match(/\/(\d+)(?:\/child\/|$)/g);
  if (matches && matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    const id = lastMatch.match(/\/(\d+)/);
    return id ? parseInt(id[1], 10) : null;
  }
  return null;
};

// Extract batch ID from href
const extractBatchIdFromHref = (href: string): number | null => {
  const match = href.match(/journalBatches\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
};

// Extract header ID from href
const extractHeaderIdFromHref = (href: string): number | null => {
  const match = href.match(/journalHeaders\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
};

// Find child link by name
const findChildLink = (links: any[], linkName: string): string | null => {
  if (!links || !Array.isArray(links)) return null;
  const link = links.find((l: any) => l.name === linkName && l.rel === 'child');
  return link?.href || null;
};

// Fetch from Oracle via proxy
const fetchFromOracleUrl = async (url: string, log?: LogCallback, verbose = true): Promise<any> => {
  try {
    // Build proxy URL
    const proxyUrl = `${PROXY_CONFIG.baseUrl}/oracle-url?url=${encodeURIComponent(url)}`;

    if (verbose) {
      log?.('step', '──── [GET] Oracle Fusion ────');
      log?.('info', `GET URL: ${url}`);
      log?.('info', `Proxy URL: ${proxyUrl}`);
    }

    const response = await fetch(proxyUrl);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Fetch failed');
    }

    if (verbose) {
      log?.('success', `GET Response: ${JSON.stringify(data)}`);
    }
    return data;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `GET Error: ${errorMsg}`);
    throw error;
  }
};

// Fetch from Oracle endpoint via proxy
const fetchFromOracle = async (
  endpoint: string,
  params: Record<string, string> = {},
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const queryParams = new URLSearchParams(params);
    const proxyUrl = `${PROXY_CONFIG.baseUrl}/oracle/${endpoint}?${queryParams.toString()}`;
    const oracleUrl = `${ORACLE_FUSION_CONFIG.baseUrl}/${endpoint}?${queryParams.toString()}`;

    if (verbose) {
      log?.('step', '──── [GET] Oracle Fusion ────');
      log?.('info', `Oracle URL: ${oracleUrl}`);
      log?.('info', `Proxy URL: ${proxyUrl}`);
    }

    const response = await fetch(proxyUrl);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Fetch failed');
    }

    if (verbose) {
      log?.('success', `GET Response: ${JSON.stringify(data)}`);
    }
    return data;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `GET Error: ${errorMsg}`);
    throw error;
  }
};

// Insert to APEX via proxy
const insertToApex = async (
  endpoint: string,
  payload: any,
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const url = `${PROXY_CONFIG.baseUrl}/apex/${endpoint}`;
    const apexUrl = `${APEX_DB_CONFIG.baseUrl}/${endpoint}`;

    if (verbose) {
      log?.('step', '──── [POST] APEX Database ────');
      log?.('info', `APEX URL: ${apexUrl}`);
      log?.('info', `Proxy URL: ${url}`);
      log?.('info', `POST Payload: ${JSON.stringify(payload)}`);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (verbose) {
      log?.('success', `POST Response: ${JSON.stringify(data)}`);
    }

    return data;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `POST Error: ${errorMsg}`);
    throw error;
  }
};

// Main GL Journal Sync Function
export const syncGLJournals = async (
  parameters: Record<string, string>,
  testMode: boolean | 'single' = true, // true=25, false=full, 'single'=1
  log?: LogCallback,
  onProgress?: ProgressCallback,
  abortSignal?: AbortSignal,
  onBatchPayload?: BatchPayloadCallback
): Promise<SyncProgress> => {
  const progress: SyncProgress = {
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
    startTime: new Date(),
    endTime: null,
  };

  const updateProgress = (updates: Partial<SyncProgress>) => {
    Object.assign(progress, updates);
    onProgress?.(progress);
  };

  // Verbose logging only for test/single mode, not full sync
  const verbose = testMode !== false;

  try {
    // ========================================
    // STEP 1: Fetch Journal Batches (with pagination)
    // ========================================
    updateProgress({ status: 'fetching_batches' });
    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('step', '  STEP 1: Fetching Journal Batches from Oracle Fusion');
    log?.('step', '═══════════════════════════════════════════════════════════');

    const pageLimit = testMode === 'single'
      ? ORACLE_FUSION_CONFIG.singleRecordLimit
      : (testMode ? ORACLE_FUSION_CONFIG.testLimit : ORACLE_FUSION_CONFIG.defaultLimit);

    // For test modes, limit total records; for full sync, fetch all
    const maxRecords = testMode === 'single' ? 1 : (testMode ? 25 : null);

    const modeLabel = testMode === 'single' ? 'SINGLE RECORD DEBUG' : (testMode ? 'TEST MODE (25 batches)' : 'FULL SYNC (all pages)');

    // Build filter parameters
    const filters = Object.entries(parameters)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${value}`)
      .join(';');

    log?.('info', `Parameters: ${JSON.stringify(parameters)}`);
    log?.('info', `Page size: ${pageLimit}, Max records: ${maxRecords ?? 'unlimited'} (${modeLabel})`);
    if (!verbose) {
      log?.('info', 'Full sync mode - detailed logging disabled for performance');
    }

    // Fetch all batches with pagination
    let batches: any[] = [];
    let offset = 0;
    let hasMore = true;
    let pageNum = 0;

    while (hasMore && (maxRecords === null || batches.length < maxRecords)) {
      if (abortSignal?.aborted) {
        updateProgress({ status: 'stopped' });
        log?.('warning', 'Sync stopped by user during batch fetch');
        break;
      }

      pageNum++;
      const fetchLimit = maxRecords !== null
        ? Math.min(pageLimit, maxRecords - batches.length)
        : pageLimit;

      const batchParams: Record<string, string> = {
        limit: fetchLimit.toString(),
        offset: offset.toString(),
      };

      if (filters) {
        batchParams.q = filters;
      }

      if (verbose || pageNum === 1 || pageNum % 10 === 0) {
        log?.('info', `Fetching page ${pageNum} (offset: ${offset}, limit: ${fetchLimit})...`);
      }

      const batchResult = await fetchFromOracle('journalBatches', batchParams, log, verbose);
      const items = batchResult.items || [];

      batches = [...batches, ...items];

      if (verbose || pageNum === 1 || pageNum % 10 === 0) {
        log?.('success', `Page ${pageNum}: fetched ${items.length} batches (Total: ${batches.length})`);
      }

      // Check if there are more records
      hasMore = items.length === fetchLimit;
      offset += items.length;

      // Stop if we've reached maxRecords limit
      if (maxRecords !== null && batches.length >= maxRecords) {
        hasMore = false;
      }

      updateProgress({ totalBatches: batches.length });
    }

    log?.('success', `Total batches fetched: ${batches.length} (${pageNum} page${pageNum > 1 ? 's' : ''})`);

    if (batches.length === 0) {
      updateProgress({ status: 'completed', endTime: new Date() });
      log?.('warning', 'No batches found for the given parameters');
      return progress;
    }

    // ========================================
    // STEP 2: Process Each Batch
    // ========================================
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      if (abortSignal?.aborted) {
        updateProgress({ status: 'stopped' });
        log?.('warning', 'Sync stopped by user');
        break;
      }

      const batch = batches[batchIndex];
      const batchId = extractBatchIdFromHref(findChildLink(batch.links, 'journalHeaders') || '') || (batchIndex + 1);

      updateProgress({
        status: 'processing_batch',
        currentBatchId: batchId,
        currentBatchName: batch.JournalName || `Batch ${batchIndex + 1}`,
        processedBatches: batchIndex,
      });

      // In full sync, only log every 10th batch or first/last for high-level progress
      const shouldLogBatch = verbose || batchIndex === 0 || batchIndex === batches.length - 1 || (batchIndex + 1) % 10 === 0;

      if (shouldLogBatch) {
        log?.('info', `Processing Batch ${batchIndex + 1}/${batches.length}: ${batch.JournalName || 'Unnamed'}`);
      }

      // Find journalHeaders child link
      const headersHref = findChildLink(batch.links, 'journalHeaders');
      if (!headersHref) {
        log?.('warning', `No journalHeaders link found for batch ${batchId}`);
        continue;
      }

      // ========================================
      // STEP 2a: Fetch Headers for this Batch
      // ========================================
      updateProgress({ status: 'fetching_headers' });

      const headersResult = await fetchFromOracleUrl(headersHref, log, verbose);
      const headers = headersResult.items || [];

      updateProgress({ totalHeaders: progress.totalHeaders + headers.length });
      if (verbose) {
        log?.('success', `Found ${headers.length} headers in this batch`);
      }

      // ========================================
      // STEP 2b: Process Each Header
      // ========================================
      for (let headerIndex = 0; headerIndex < headers.length; headerIndex++) {
        if (abortSignal?.aborted) {
          updateProgress({ status: 'stopped' });
          break;
        }

        const header = headers[headerIndex];
        const headerId = extractHeaderIdFromHref(findChildLink(header.links, 'journalLines') || '') || extractIdFromHref(header.links?.[0]?.href || '') || (headerIndex + 1);

        updateProgress({
          status: 'processing_header',
          currentHeaderId: headerId,
          currentHeaderName: header.JournalName || `Header ${headerIndex + 1}`,
          processedHeaders: progress.processedHeaders,
        });

        if (verbose) {
          log?.('info', `  Header ${headerIndex + 1}/${headers.length}: ${header.JournalName || 'Unnamed'} (ID: ${headerId})`);
        }

        // Find journalLines child link
        const linesHref = findChildLink(header.links, 'journalLines');

        // ========================================
        // STEP 2c: Fetch Lines for this Header
        // ========================================
        let lines: any[] = [];
        if (linesHref) {
          updateProgress({ status: 'fetching_lines' });

          try {
            const linesResult = await fetchFromOracleUrl(linesHref, log, verbose);
            lines = linesResult.items || [];

            updateProgress({ totalLines: progress.totalLines + lines.length });
            if (verbose) {
              log?.('success', `    Found ${lines.length} lines`);
            }
          } catch (error) {
            log?.('warning', `    Could not fetch lines: ${error}`);
          }
        }

        // ========================================
        // STEP 2d: Insert Header to APEX
        // ========================================
        updateProgress({ status: 'inserting' });

        // Prepare header payload with batchId and JeHeaderId
        const headerPayload = {
          batchId: batchId,
          items: [{
            JeHeaderId: headerId,
            ...header,
          }],
        };

        try {
          const headerInsertResult = await insertToApex(APEX_DB_CONFIG.endpoints.journalHeaders, headerPayload, log, verbose);
          if (headerInsertResult.success || headerInsertResult.inserted > 0) {
            updateProgress({ totalHeadersInserted: progress.totalHeadersInserted + 1 });
            if (verbose) {
              log?.('success', `    ✓ Header inserted`);
            }
          } else {
            updateProgress({ errors: progress.errors + 1, lastError: headerInsertResult.error || 'Header insert failed' });
            log?.('error', `    ✗ Header insert failed: ${headerInsertResult.lastError || headerInsertResult.error}`);
          }
        } catch (error) {
          updateProgress({ errors: progress.errors + 1, lastError: String(error) });
        }

        // ========================================
        // STEP 2e: Insert Lines to APEX
        // ========================================
        if (lines.length > 0) {
          const linesPayload = {
            batchId: batchId,
            jeHeaderId: headerId,
            items: lines,
          };

          try {
            const linesInsertResult = await insertToApex(APEX_DB_CONFIG.endpoints.journalLines, linesPayload, log, verbose);
            if (linesInsertResult.success || linesInsertResult.inserted > 0) {
              const insertedCount = linesInsertResult.inserted || lines.length;
              updateProgress({ totalLinesInserted: progress.totalLinesInserted + insertedCount });
              if (verbose) {
                log?.('success', `    ✓ ${insertedCount} lines inserted`);
              }
            } else {
              updateProgress({ errors: progress.errors + 1, lastError: linesInsertResult.error || 'Lines insert failed' });
              log?.('error', `    ✗ Lines insert failed: ${linesInsertResult.lastError || linesInsertResult.error}`);
            }
          } catch (error) {
            updateProgress({ errors: progress.errors + 1, lastError: String(error) });
          }
        }

        updateProgress({ processedHeaders: progress.processedHeaders + 1 });

        // Small delay to prevent API throttling
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // ========================================
      // STEP 2f: Insert Batch to APEX
      // ========================================
      if (verbose) {
        log?.('step', '──── Inserting Batch to APEX ────');
      }

      // Build batch payload with all fields from Oracle Fusion response
      const batchPayload = {
        items: [{
          JeBatchId: batchId,
          AccountedPeriodType: batch.AccountedPeriodType,
          DefaultPeriodName: batch.DefaultPeriodName,
          BatchName: batch.JournalBatchName || batch.JournalName,
          Status: batch.Status,
          ControlTotal: batch.ControlTotal,
          BatchDescription: batch.Description || batch.BatchDescription,
          ErrorMessage: batch.ErrorMessage,
          PostedDate: batch.PostedDate,
          PostingRunId: batch.PostingRunId,
          RequestId: batch.RequestId,
          RunningTotalAccountedCr: batch.RunningTotalAccountedCr,
          RunningTotalAccountedDr: batch.RunningTotalAccountedDr,
          RunningTotalCr: batch.RunningTotalCr,
          RunningTotalDr: batch.RunningTotalDr,
          CreatedBy: batch.CreatedBy,
          CreationDate: batch.CreationDate,
          LastUpdateDate: batch.LastUpdateDate,
          LastUpdatedBy: batch.LastUpdatedBy,
          ActualFlagMeaning: batch.ActualFlagMeaning,
          ApprovalStatusMeaning: batch.ApprovalStatusMeaning,
          ApproverEmployeeName: batch.ApproverEmployeeName,
          FundsStatusMeaning: batch.FundsStatusMeaning,
          ParentJeBatchName: batch.ParentJeBatchName,
          ChartOfAccountsName: batch.ChartOfAccountsName,
          StatusMeaning: batch.StatusMeaning,
          CompletionStatusMeaning: batch.CompletionStatusMeaning,
          UserPeriodSetName: batch.UserPeriodSetName,
          UserJeSourceName: batch.UserJeSourceName,
          ReversalDate: batch.ReversalDate,
          ReversalPeriod: batch.ReversalPeriod,
          ReversalFlag: batch.ReversalFlag,
          ReversalMethodMeaning: batch.ReversalMethodMeaning,
          // Legacy field names for backwards compatibility
          LedgerId: batch.LedgerId,
          LedgerName: batch.LedgerName,
          JournalName: batch.JournalName,
        }],
      };

      try {
        const batchName = batch.JournalBatchName || batch.JournalName || `Batch ${batchId}`;

        // Only track batch payloads in verbose mode (test/single) to avoid memory overhead
        if (verbose) {
          onBatchPayload?.(batchId, batchName, batchPayload);
        }

        const batchInsertResult = await insertToApex(APEX_DB_CONFIG.endpoints.journalBatches, batchPayload, log, verbose);
        if (batchInsertResult.success || batchInsertResult.inserted > 0) {
          updateProgress({ totalBatchesInserted: progress.totalBatchesInserted + 1 });
          if (verbose) {
            log?.('success', `  ✓ Batch inserted to APEX`);
            onBatchPayload?.(batchId, batchName, batchPayload, batchInsertResult);
          }
        } else {
          const errorMsg = batchInsertResult.lastError || batchInsertResult.error || 'Unknown error';
          updateProgress({ errors: progress.errors + 1, lastError: batchInsertResult.error || 'Batch insert failed' });
          log?.('error', `  ✗ Batch insert failed: ${errorMsg || JSON.stringify(batchInsertResult)}`);
          if (verbose) {
            onBatchPayload?.(batchId, batchName, batchPayload, batchInsertResult, errorMsg);
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        updateProgress({ errors: progress.errors + 1, lastError: errorMsg });
        log?.('error', `  ✗ Batch insert error: ${error}`);
        if (verbose) {
          const batchName = batch.JournalBatchName || batch.JournalName || `Batch ${batchId}`;
          onBatchPayload?.(batchId, batchName, batchPayload, undefined, errorMsg);
        }
      }

      updateProgress({ processedBatches: batchIndex + 1 });

      // Log batch completion - in full sync only log every 10th or last batch
      if (shouldLogBatch) {
        log?.('success', `✓ Batch ${batchIndex + 1}/${batches.length} completed`);
      }

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 200));
    }

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
    log?.('success', `Total Batches Processed: ${progress.processedBatches}`);
    log?.('success', `Total Headers Inserted: ${progress.totalHeadersInserted}`);
    log?.('success', `Total Lines Inserted: ${progress.totalLinesInserted}`);
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

// Test connection
export const testGLConnection = async (log?: LogCallback): Promise<boolean> => {
  try {
    log?.('info', 'Testing Oracle Fusion connection...');

    const result = await fetchFromOracle('journalBatches', { limit: '1', offset: '0' }, log);

    if (result.success) {
      log?.('success', 'Oracle Fusion connection successful!');
      log?.('info', `Sample data available: ${result.items?.length || 0} items`);
      return true;
    }

    log?.('error', 'Connection test failed');
    return false;
  } catch (error) {
    log?.('error', `Connection test error: ${error}`);
    return false;
  }
};
