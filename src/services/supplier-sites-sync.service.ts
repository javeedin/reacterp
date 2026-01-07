import { PROXY_CONFIG, APEX_DB_CONFIG } from '../config/api.config';

// Types
export interface SupplierSitesSyncProgress {
  status: 'idle' | 'fetching' | 'fetching_sites' | 'inserting' | 'completed' | 'error' | 'stopped';
  totalSuppliers: number;
  processedSuppliers: number;
  totalSites: number;
  insertedSites: number;
  currentSupplier: string;
  currentSupplierId: number | null;
  errors: number;
  lastError: string;
  startTime: Date | null;
  endTime: Date | null;
}

export type LogCallback = (type: 'info' | 'success' | 'error' | 'warning' | 'step', message: string) => void;
export type ProgressCallback = (progress: Partial<SupplierSitesSyncProgress>) => void;
export type SupplierSitesPayloadCallback = (
  supplierId: number,
  supplierName: string,
  siteCount: number,
  payload: any,
  result?: any,
  error?: string
) => void;

// Fetch from Oracle Fusion REST API via proxy
const fetchFromFusion = async (
  endpoint: string,
  params: Record<string, string> = {},
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const queryParams = new URLSearchParams(params);
    // Suppliers uses fscmRestApi (main Fusion API)
    const fusionPath = `fscmRestApi/resources/11.13.18.05/${endpoint}`;
    const proxyUrl = `${PROXY_CONFIG.baseUrl}/fusion/${fusionPath}?${queryParams.toString()}`;

    if (verbose) {
      log?.('step', '──── [GET] Oracle Fusion ────');
      log?.('info', `Proxy URL: ${proxyUrl}`);
    }

    const response = await fetch(proxyUrl);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Fetch failed: ${response.status}`);
    }

    if (verbose) {
      log?.('success', `GET Response: ${data.items?.length || 0} records fetched`);
    }
    return { success: true, items: data.items || [], hasMore: data.hasMore, count: data.count };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `GET Error: ${errorMsg}`);
    throw error;
  }
};

// Fetch supplier sites from Oracle Fusion
const fetchSupplierSites = async (
  supplierId: number,
  params: Record<string, string> = {},
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const queryParams = new URLSearchParams(params);
    // Sites are under suppliers/{id}/child/sites
    const fusionPath = `fscmRestApi/resources/11.13.18.05/suppliers/${supplierId}/child/sites`;
    const proxyUrl = `${PROXY_CONFIG.baseUrl}/fusion/${fusionPath}?${queryParams.toString()}`;

    if (verbose) {
      log?.('info', `Fetching sites for supplier ${supplierId}...`);
    }

    const response = await fetch(proxyUrl);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Fetch failed: ${response.status}`);
    }

    if (verbose) {
      log?.('success', `Found ${data.items?.length || 0} sites`);
    }
    return { success: true, items: data.items || [], hasMore: data.hasMore };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `Error fetching sites: ${errorMsg}`);
    return { success: false, items: [], error: errorMsg };
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
      log?.('info', `Payload: ${JSON.stringify(payload).substring(0, 200)}...`);
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

// Test connection to Supplier Sites endpoint
export const testSupplierSitesConnection = async (
  log: LogCallback
): Promise<{ success: boolean; message: string; sample?: any }> => {
  try {
    log('info', 'Testing Supplier Sites endpoint...');
    log('info', 'Step 1: Fetching first supplier...');

    // First get a supplier
    const suppliersResult = await fetchFromFusion(
      'suppliers',
      { limit: '1' },
      log,
      true
    );

    if (!suppliersResult.success || !suppliersResult.items || suppliersResult.items.length === 0) {
      return { success: false, message: 'No suppliers found' };
    }

    const supplier = suppliersResult.items[0];
    log('info', `Step 2: Fetching sites for ${supplier.Supplier} (ID: ${supplier.SupplierId})...`);

    // Then get sites for that supplier
    const sitesResult = await fetchSupplierSites(
      supplier.SupplierId,
      { limit: '1' },
      log,
      true
    );

    if (!sitesResult.success) {
      return { success: false, message: sitesResult.error || 'Failed to fetch sites' };
    }

    if (sitesResult.items.length === 0) {
      return {
        success: true,
        message: `Connected! Supplier ${supplier.Supplier} has no sites.`,
        sample: { supplier, sites: [] }
      };
    }

    const site = sitesResult.items[0];
    return {
      success: true,
      message: `Connected! Found site: ${site.SupplierSite} (${site.ProcurementBU})`,
      sample: { supplier, site }
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log('error', `Connection test failed: ${errorMsg}`);
    return { success: false, message: errorMsg };
  }
};

// Main sync function
export const syncSupplierSites = async (
  parameters: Record<string, string>,
  testMode: boolean | 'single',
  log: LogCallback,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
  onPayload?: SupplierSitesPayloadCallback
): Promise<SupplierSitesSyncProgress> => {
  const progress: SupplierSitesSyncProgress = {
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
  };

  onProgress(progress);

  try {
    // Limit suppliers based on test mode
    // Use smaller page size for reliable pagination
    const pageSize = 100;
    const maxSuppliers = testMode === 'single' ? 1 : (testMode ? 25 : 10000);
    let offset = 0;
    let hasMore = true;
    let pageNum = 0;

    log('step', `═══════════════════════════════════════`);
    log('info', `Starting Supplier Sites sync (${testMode === 'single' ? 'Single Supplier Test' : testMode ? 'Test Mode - 25 suppliers' : 'Full Sync - up to 10000 suppliers'})`);
    log('step', `═══════════════════════════════════════`);

    // Step 1: Fetch all suppliers (paginated)
    const allSuppliers: any[] = [];

    while (hasMore) {
      if (signal?.aborted) {
        log('warning', 'Sync stopped by user');
        progress.status = 'stopped';
        break;
      }

      pageNum++;
      log('step', `\n──── Fetching Suppliers Page ${pageNum} ────`);

      const queryParams: Record<string, string> = {
        limit: String(pageSize),
        offset: String(offset),
        ...parameters,
      };

      const result = await fetchFromFusion('suppliers', queryParams, log, true);

      if (!result.success || !result.items) {
        throw new Error('Failed to fetch suppliers');
      }

      if (result.items.length === 0) {
        log('info', 'No more suppliers to process');
        break;
      }

      allSuppliers.push(...result.items);
      progress.totalSuppliers = allSuppliers.length;
      onProgress({ totalSuppliers: progress.totalSuppliers });

      log('info', `Total suppliers fetched so far: ${allSuppliers.length}`);

      // Check if more pages - continue if we got a full page OR hasMore is true
      hasMore = result.hasMore === true || result.items.length === pageSize;

      // Stop if we've reached max suppliers limit
      if (allSuppliers.length >= maxSuppliers) {
        log('info', `Reached max suppliers limit (${maxSuppliers})`);
        break;
      }

      if (testMode) {
        log('info', 'Test mode - stopping supplier fetch after first page');
        break;
      }

      offset += pageSize;
    }

    if (allSuppliers.length === 0) {
      throw new Error('No suppliers found');
    }

    log('info', `Found ${allSuppliers.length} suppliers to process`);

    // Step 2: For each supplier, fetch sites and sync
    progress.status = 'fetching_sites';
    onProgress({ status: 'fetching_sites' });

    for (const supplier of allSuppliers) {
      if (signal?.aborted) {
        log('warning', 'Sync stopped by user');
        progress.status = 'stopped';
        break;
      }

      const supplierId = supplier.SupplierId;
      const supplierName = supplier.Supplier || `Supplier ${supplierId}`;

      progress.currentSupplier = supplierName;
      progress.currentSupplierId = supplierId;
      onProgress({
        currentSupplier: supplierName,
        currentSupplierId: supplierId
      });

      log('step', `\n──── Processing: ${supplierName} (ID: ${supplierId}) ────`);

      // Fetch all sites for this supplier
      let siteOffset = 0;
      let siteHasMore = true;
      const supplierSites: any[] = [];

      while (siteHasMore) {
        if (signal?.aborted) break;

        const siteResult = await fetchSupplierSites(
          supplierId,
          { limit: '100', offset: String(siteOffset) },
          log,
          siteOffset === 0 // Only verbose on first page
        );

        if (!siteResult.success) {
          progress.errors++;
          progress.lastError = siteResult.error || 'Failed to fetch sites';
          log('error', `Error fetching sites for ${supplierName}: ${progress.lastError}`);
          break;
        }

        if (siteResult.items.length === 0) {
          if (siteOffset === 0) {
            log('info', `No sites for ${supplierName}`);
          }
          break;
        }

        // Add SupplierId to each site
        const sitesWithSupplierId = siteResult.items.map((site: any) => ({
          ...site,
          SupplierId: supplierId
        }));

        supplierSites.push(...sitesWithSupplierId);
        siteHasMore = siteResult.hasMore === true;
        siteOffset += 100;
      }

      if (supplierSites.length > 0) {
        progress.totalSites += supplierSites.length;
        onProgress({ totalSites: progress.totalSites });

        // POST sites to APEX
        progress.status = 'inserting';
        onProgress({ status: 'inserting' });

        const payload = { items: supplierSites };

        try {
          const insertResult = await insertToApex('suppliers/sites', payload, log, true);

          if (insertResult.success) {
            const count = insertResult.inserted || supplierSites.length;
            progress.insertedSites += count;
            log('success', `Inserted ${count} sites for ${supplierName}`);
            onPayload?.(supplierId, supplierName, supplierSites.length, payload, insertResult);
          } else {
            progress.errors++;
            progress.lastError = insertResult.error || 'Insert failed';
            log('error', `Failed to insert sites for ${supplierName}: ${progress.lastError}`);
            onPayload?.(supplierId, supplierName, supplierSites.length, payload, undefined, progress.lastError);
          }
        } catch (error) {
          progress.errors++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          progress.lastError = errorMsg;
          log('error', `Error inserting sites for ${supplierName}: ${errorMsg}`);
          onPayload?.(supplierId, supplierName, supplierSites.length, payload, undefined, errorMsg);
        }

        onProgress({
          insertedSites: progress.insertedSites,
          errors: progress.errors
        });
      }

      progress.processedSuppliers++;
      onProgress({ processedSuppliers: progress.processedSuppliers });

      // Reset status for next supplier
      if (!signal?.aborted) {
        progress.status = 'fetching_sites';
        onProgress({ status: 'fetching_sites' });
      }
    }

    progress.status = signal?.aborted ? 'stopped' : 'completed';
    progress.endTime = new Date();
    onProgress(progress);

    const duration = progress.endTime.getTime() - (progress.startTime?.getTime() || 0);
    log('step', `\n═══════════════════════════════════════`);
    log('success', `Sync ${progress.status}!`);
    log('info', `Total suppliers processed: ${progress.processedSuppliers}`);
    log('info', `Total sites found: ${progress.totalSites}`);
    log('info', `Sites inserted: ${progress.insertedSites}`);
    log('info', `Errors: ${progress.errors}`);
    log('info', `Duration: ${(duration / 1000).toFixed(1)}s`);
    log('step', `═══════════════════════════════════════`);

    return progress;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    progress.status = 'error';
    progress.lastError = errorMsg;
    progress.endTime = new Date();
    onProgress(progress);
    log('error', `Sync failed: ${errorMsg}`);
    return progress;
  }
};
