import { PROXY_CONFIG, APEX_DB_CONFIG } from '../config/api.config';

// Types
export interface SiteAssignmentsSyncProgress {
  status: 'idle' | 'fetching_sites' | 'fetching_assignments' | 'inserting' | 'completed' | 'error' | 'stopped';
  totalSites: number;
  processedSites: number;
  totalAssignments: number;
  insertedAssignments: number;
  currentSite: string;
  currentSiteId: number | null;
  errors: number;
  lastError: string;
  startTime: Date | null;
  endTime: Date | null;
}

export type LogCallback = (type: 'info' | 'success' | 'error' | 'warning' | 'step', message: string) => void;
export type ProgressCallback = (progress: Partial<SiteAssignmentsSyncProgress>) => void;
export type SiteAssignmentsPayloadCallback = (
  siteId: number,
  siteName: string,
  assignmentCount: number,
  payload: any,
  result?: any,
  error?: string
) => void;

// Fetch sites from APEX (already synced)
const fetchSitesFromApex = async (
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const url = `${PROXY_CONFIG.baseUrl}/apex/suppliers/sites`;
    const apexUrl = `${APEX_DB_CONFIG.baseUrl}/suppliers/sites`;

    if (verbose) {
      log?.('step', '──── [GET] APEX Database - Sites ────');
      log?.('info', `APEX URL: ${apexUrl}`);
    }

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Fetch failed: ${response.status}`);
    }

    if (verbose) {
      log?.('success', `GET Response: ${data.items?.length || 0} sites fetched from APEX`);
    }
    return { success: true, items: data.items || [] };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `GET Error: ${errorMsg}`);
    throw error;
  }
};

// Fetch supplier assignments from Oracle Fusion
const fetchSupplierAssignments = async (
  supplierId: number,
  params: Record<string, string> = {},
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const queryParams = new URLSearchParams(params);
    // Assignments are directly under suppliers/{id}/child/assignments
    const fusionPath = `fscmRestApi/resources/11.13.18.05/suppliers/${supplierId}/child/assignments`;
    const proxyUrl = `${PROXY_CONFIG.baseUrl}/fusion/${fusionPath}?${queryParams.toString()}`;

    if (verbose) {
      log?.('info', `Fetching assignments for supplier ${supplierId}...`);
    }

    const response = await fetch(proxyUrl);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Fetch failed: ${response.status}`);
    }

    if (verbose) {
      log?.('success', `Found ${data.items?.length || 0} assignments`);
    }
    return { success: true, items: data.items || [], hasMore: data.hasMore };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `Error fetching assignments: ${errorMsg}`);
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

// Test connection to Site Assignments endpoint
export const testSiteAssignmentsConnection = async (
  log: LogCallback
): Promise<{ success: boolean; message: string; sample?: any }> => {
  try {
    log('info', 'Testing Site Assignments endpoint...');
    log('info', 'Step 1: Fetching sites from APEX to get supplier IDs...');

    // First get sites from APEX to get supplier IDs
    const sitesResult = await fetchSitesFromApex(log, true);

    if (!sitesResult.success || !sitesResult.items || sitesResult.items.length === 0) {
      return { success: false, message: 'No sites found in APEX. Please sync Supplier Sites first.' };
    }

    const site = sitesResult.items[0];
    const supplierId = site.supplierid;
    log('info', `Step 2: Fetching assignments for supplier ${supplierId}...`);

    // Then get assignments from Fusion (per supplier, not per site)
    const assignmentsResult = await fetchSupplierAssignments(
      supplierId,
      { limit: '5' },
      log,
      true
    );

    if (!assignmentsResult.success) {
      return { success: false, message: assignmentsResult.error || 'Failed to fetch assignments' };
    }

    if (assignmentsResult.items.length === 0) {
      return {
        success: true,
        message: `Connected! Supplier ${supplierId} has no assignments.`,
        sample: { supplierId, assignments: [] }
      };
    }

    const assignment = assignmentsResult.items[0];
    return {
      success: true,
      message: `Connected! Found ${assignmentsResult.items.length} assignment(s) for supplier ${supplierId}`,
      sample: { supplierId, assignment }
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log('error', `Connection test failed: ${errorMsg}`);
    return { success: false, message: errorMsg };
  }
};

// Main sync function
export const syncSiteAssignments = async (
  parameters: Record<string, string>,
  testMode: boolean | 'single',
  log: LogCallback,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
  onPayload?: SiteAssignmentsPayloadCallback
): Promise<SiteAssignmentsSyncProgress> => {
  const progress: SiteAssignmentsSyncProgress = {
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
  };

  onProgress(progress);

  try {
    log('step', `═══════════════════════════════════════`);
    log('info', `Starting Site Assignments sync (${testMode === 'single' ? 'Single Supplier Test' : testMode ? 'Test Mode - 25 suppliers' : 'Full Sync'})`);
    log('step', `═══════════════════════════════════════`);

    // Step 1: Fetch sites from APEX to get unique supplier IDs
    log('step', `\n──── Fetching Sites from APEX ────`);
    const sitesResult = await fetchSitesFromApex(log, true);

    if (!sitesResult.success || !sitesResult.items) {
      throw new Error('Failed to fetch sites from APEX');
    }

    if (sitesResult.items.length === 0) {
      throw new Error('No sites found in APEX. Please sync Supplier Sites first.');
    }

    // Extract unique supplier IDs from sites
    const uniqueSupplierIds = [...new Set(sitesResult.items.map((site: any) => site.supplierid))] as number[];

    // Limit suppliers based on test mode
    const maxSuppliers = testMode === 'single' ? 1 : (testMode ? 25 : uniqueSupplierIds.length);
    const suppliersToProcess = uniqueSupplierIds.slice(0, maxSuppliers);

    progress.totalSites = suppliersToProcess.length; // Using totalSites to track suppliers
    onProgress({ totalSites: progress.totalSites });

    log('info', `Found ${uniqueSupplierIds.length} unique suppliers from ${sitesResult.items.length} sites, processing ${suppliersToProcess.length}`);

    // Step 2: For each supplier, fetch assignments from Fusion and sync
    progress.status = 'fetching_assignments';
    onProgress({ status: 'fetching_assignments' });

    for (const supplierId of suppliersToProcess) {
      if (signal?.aborted) {
        log('warning', 'Sync stopped by user');
        progress.status = 'stopped';
        break;
      }

      progress.currentSite = `Supplier ${supplierId}`;
      progress.currentSiteId = supplierId;
      onProgress({
        currentSite: `Supplier ${supplierId}`,
        currentSiteId: supplierId
      });

      log('step', `\n──── Processing Supplier: ${supplierId} ────`);

      // Fetch all assignments for this supplier
      let assignmentOffset = 0;
      let assignmentHasMore = true;
      const supplierAssignments: any[] = [];

      while (assignmentHasMore) {
        if (signal?.aborted) break;

        const assignmentResult = await fetchSupplierAssignments(
          supplierId,
          { limit: '100', offset: String(assignmentOffset) },
          log,
          assignmentOffset === 0 // Only verbose on first page
        );

        if (!assignmentResult.success) {
          progress.errors++;
          progress.lastError = assignmentResult.error || 'Failed to fetch assignments';
          log('error', `Error fetching assignments for supplier ${supplierId}: ${progress.lastError}`);
          break;
        }

        if (assignmentResult.items.length === 0) {
          if (assignmentOffset === 0) {
            log('info', `No assignments for supplier ${supplierId}`);
          }
          break;
        }

        // Add SupplierId to each assignment (SupplierSiteId should already be in Fusion response)
        const assignmentsWithIds = assignmentResult.items.map((assignment: any) => ({
          ...assignment,
          SupplierId: supplierId
        }));

        supplierAssignments.push(...assignmentsWithIds);
        assignmentHasMore = assignmentResult.hasMore === true || assignmentResult.items.length === 100;
        assignmentOffset += 100;
      }

      if (supplierAssignments.length > 0) {
        progress.totalAssignments += supplierAssignments.length;
        onProgress({ totalAssignments: progress.totalAssignments });

        // POST assignments to APEX
        progress.status = 'inserting';
        onProgress({ status: 'inserting' });

        const payload = { items: supplierAssignments };

        try {
          const insertResult = await insertToApex('suppliers/sites/assignments', payload, log, true);

          if (insertResult.success) {
            const count = insertResult.inserted || supplierAssignments.length;
            progress.insertedAssignments += count;
            log('success', `Inserted ${count} assignments for supplier ${supplierId}`);
            onPayload?.(supplierId, `Supplier ${supplierId}`, supplierAssignments.length, payload, insertResult);
          } else {
            progress.errors++;
            progress.lastError = insertResult.error || 'Insert failed';
            log('error', `Failed to insert assignments for supplier ${supplierId}: ${progress.lastError}`);
            onPayload?.(supplierId, `Supplier ${supplierId}`, supplierAssignments.length, payload, undefined, progress.lastError);
          }
        } catch (error) {
          progress.errors++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          progress.lastError = errorMsg;
          log('error', `Error inserting assignments for supplier ${supplierId}: ${errorMsg}`);
          onPayload?.(supplierId, `Supplier ${supplierId}`, supplierAssignments.length, payload, undefined, errorMsg);
        }

        onProgress({
          insertedAssignments: progress.insertedAssignments,
          errors: progress.errors
        });
      }

      progress.processedSites++;
      onProgress({ processedSites: progress.processedSites });

      // Reset status for next site
      if (!signal?.aborted) {
        progress.status = 'fetching_assignments';
        onProgress({ status: 'fetching_assignments' });
      }
    }

    progress.status = signal?.aborted ? 'stopped' : 'completed';
    progress.endTime = new Date();
    onProgress(progress);

    const duration = progress.endTime.getTime() - (progress.startTime?.getTime() || 0);
    log('step', `\n═══════════════════════════════════════`);
    log('success', `Sync ${progress.status}!`);
    log('info', `Total sites processed: ${progress.processedSites}`);
    log('info', `Total assignments found: ${progress.totalAssignments}`);
    log('info', `Assignments inserted: ${progress.insertedAssignments}`);
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
