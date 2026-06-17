import { ORACLE_FUSION_CONFIG, APEX_DB_CONFIG } from '../config/api.config';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ARLookupsProgress {
  status: 'idle' | 'fetching' | 'inserting' | 'completed' | 'error' | 'stopped';
  totalFetched: number;
  inserted:     number;
  updated:      number;
  errors:       number;
  lastError:    string;
  startTime:    Date | null;
  endTime:      Date | null;
  objectName:   string;
}

export type LogCallback             = (type: 'info' | 'success' | 'error' | 'warning' | 'step', message: string) => void;
export type LookupsProgressCallback = (progress: Partial<ARLookupsProgress>) => void;

// ─── Lookup object config ─────────────────────────────────────────────────────

interface LookupConfig {
  objectName:     string;
  fusionEndpoint: string;  // relative to ORACLE_FUSION_CONFIG.baseUrl
  apexBulkPath:   string;  // relative to APEX_DB_CONFIG.baseUrl
}

// ─── Generic paginated fetch from Fusion ─────────────────────────────────────

const fetchFromFusion = async (
  endpoint: string,
  params: Record<string, string>,
  log?: LogCallback
): Promise<any[]> => {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (ORACLE_FUSION_CONFIG.username && ORACLE_FUSION_CONFIG.password) {
    headers['Authorization'] = 'Basic ' + btoa(`${ORACLE_FUSION_CONFIG.username}:${ORACLE_FUSION_CONFIG.password}`);
  }

  const baseUrl = `${ORACLE_FUSION_CONFIG.baseUrl}/${endpoint}`;
  const limit   = ORACLE_FUSION_CONFIG.defaultLimit ?? 500;
  const allItems: any[] = [];
  let offset = 0;

  // Build static query params
  const staticQs = Object.entries(params)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  log?.('step', `──── [GET] Fusion ${endpoint} ────`);

  while (true) {
    const qs = [`limit=${limit}`, `offset=${offset}`, staticQs].filter(Boolean).join('&');
    const url = `${baseUrl}?${qs}`;
    log?.('info', `  URL: ${url}`);

    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`Fusion ${endpoint} fetch failed: ${resp.status} ${resp.statusText}`);

    const data  = await resp.json();
    const items: any[] = data.items || [];
    allItems.push(...items);

    log?.('info', `  Fetched ${items.length} items (total so far: ${allItems.length})`);

    if (!data.hasMore || items.length < limit) break;
    offset += items.length;
  }

  return allItems;
};

// ─── Generic bulk POST to APEX ────────────────────────────────────────────────

const postBulkToApex = async (
  apexEndpoint: string,
  items: any[],
  log?: LogCallback
): Promise<{ inserted: number; updated: number; errors: number; errorDetail?: string }> => {
  const url     = `${APEX_DB_CONFIG.baseUrl}/${apexEndpoint}`;
  const payload = { items: items.map(({ links, ...rest }) => rest) };

  log?.('step', `──── [POST] APEX ${apexEndpoint} (${items.length} records) ────`);
  log?.('info', `  URL: ${url}`);

  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify(payload),
  });

  const data = await resp.json();

  if (data.status === 'SUCCESS' || data.status === 'PARTIAL') {
    log?.('success', `  Inserted: ${data.inserted ?? 0}, Updated: ${data.updated ?? 0}, Errors: ${data.errors ?? 0}`);
    return {
      inserted:    data.inserted    ?? 0,
      updated:     data.updated     ?? 0,
      errors:      data.errors      ?? 0,
      errorDetail: data.errorDetail,
    };
  }

  const msg = data.message || data.error || `APEX POST failed: ${resp.status}`;
  log?.('error', `  APEX error: ${msg}`);
  throw new Error(msg);
};

// ─── Generic lookup sync ──────────────────────────────────────────────────────

const syncARLookup = async (
  config:      LookupConfig,
  parameters:  Record<string, string>,
  testMode:    boolean | 'single',
  log?:        LogCallback,
  onProgress?: LookupsProgressCallback,
  signal?:     AbortSignal
): Promise<ARLookupsProgress> => {
  const progress: ARLookupsProgress = {
    status:       'idle',
    totalFetched: 0,
    inserted:     0,
    updated:      0,
    errors:       0,
    lastError:    '',
    startTime:    new Date(),
    endTime:      null,
    objectName:   config.objectName,
  };

  const update = (p: Partial<ARLookupsProgress>) => {
    Object.assign(progress, p);
    onProgress?.(p);
  };

  try {
    update({ status: 'fetching' });

    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('step', `  ${config.objectName.toUpperCase()} SYNC`);
    log?.('step', '═══════════════════════════════════════════════════════════');

    if (signal?.aborted) {
      update({ status: 'stopped', endTime: new Date() });
      return progress;
    }

    let items = await fetchFromFusion(config.fusionEndpoint, parameters, log);

    // Limit items in test mode
    if (testMode === 'single') items = items.slice(0, 1);
    else if (testMode === true) items = items.slice(0, ORACLE_FUSION_CONFIG.testLimit ?? 25);

    update({ totalFetched: items.length });
    log?.('info', `  Total records to sync: ${items.length}`);

    if (items.length === 0) {
      log?.('warning', '  No records found — nothing to sync');
      update({ status: 'completed', endTime: new Date() });
      return progress;
    }

    if (signal?.aborted) {
      update({ status: 'stopped', endTime: new Date() });
      return progress;
    }

    update({ status: 'inserting' });

    const result = await postBulkToApex(config.apexBulkPath, items, log);

    update({
      inserted:  result.inserted,
      updated:   result.updated,
      errors:    result.errors,
      lastError: result.errorDetail ?? '',
    });

    const finalStatus = result.errors === 0 ? 'completed' : 'error';
    update({ status: finalStatus, endTime: new Date() });

    log?.('step', '───────────────────────────────────────────────────────────');
    log?.(finalStatus === 'completed' ? 'success' : 'warning',
      `  DONE — ${result.inserted} inserted, ${result.updated} updated, ${result.errors} errors`);
    log?.('step', '═══════════════════════════════════════════════════════════');

    return progress;
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    update({ status: 'error', lastError: msg, endTime: new Date() });
    log?.('error', `Fatal error: ${msg}`);
    return progress;
  }
};

// ─── Named exports for each of the 5 objects ─────────────────────────────────

export const syncPaymentTerms = (
  parameters:  Record<string, string>,
  testMode:    boolean | 'single' = true,
  log?:        LogCallback,
  onProgress?: LookupsProgressCallback,
  signal?:     AbortSignal
): Promise<ARLookupsProgress> =>
  syncARLookup(
    { objectName: 'AR Payment Terms', fusionEndpoint: 'paymentTermsLOV', apexBulkPath: 'ar/payment-terms/bulk' },
    parameters, testMode, log, onProgress, signal
  );

export const syncTxnSources = (
  parameters:  Record<string, string>,
  testMode:    boolean | 'single' = true,
  log?:        LogCallback,
  onProgress?: LookupsProgressCallback,
  signal?:     AbortSignal
): Promise<ARLookupsProgress> =>
  syncARLookup(
    { objectName: 'AR Transaction Sources', fusionEndpoint: 'transactionSourcesLOV', apexBulkPath: 'ar/txn-sources/bulk' },
    parameters, testMode, log, onProgress, signal
  );

export const syncTxnTypes = (
  parameters:  Record<string, string>,
  testMode:    boolean | 'single' = true,
  log?:        LogCallback,
  onProgress?: LookupsProgressCallback,
  signal?:     AbortSignal
): Promise<ARLookupsProgress> =>
  syncARLookup(
    { objectName: 'AR Transaction Types', fusionEndpoint: 'transactionTypesLOV', apexBulkPath: 'ar/txn-types/bulk' },
    parameters, testMode, log, onProgress, signal
  );

export const syncMemoLines = (
  parameters:  Record<string, string>,
  testMode:    boolean | 'single' = true,
  log?:        LogCallback,
  onProgress?: LookupsProgressCallback,
  signal?:     AbortSignal
): Promise<ARLookupsProgress> =>
  syncARLookup(
    { objectName: 'AR Memo Lines', fusionEndpoint: 'memoLinesLOV', apexBulkPath: 'ar/memo-lines/bulk' },
    parameters, testMode, log, onProgress, signal
  );

export const syncRevenueRules = (
  parameters:  Record<string, string>,
  testMode:    boolean | 'single' = true,
  log?:        LogCallback,
  onProgress?: LookupsProgressCallback,
  signal?:     AbortSignal
): Promise<ARLookupsProgress> =>
  syncARLookup(
    { objectName: 'AR Revenue Scheduling Rules', fusionEndpoint: 'revenueSchedulingRulesLOV', apexBulkPath: 'ar/revenue-sched-rules/bulk' },
    parameters, testMode, log, onProgress, signal
  );
