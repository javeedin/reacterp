import { PROXY_CONFIG, APEX_DB_CONFIG } from '../config/api.config';

// Types
export interface RolesSyncProgress {
  status: 'idle' | 'fetching' | 'inserting' | 'completed' | 'error' | 'stopped';
  totalRecords: number;
  processedRecords: number;
  insertedRecords: number;
  currentPage: number;
  totalPages: number;
  errors: number;
  lastError: string;
  startTime: Date | null;
  endTime: Date | null;
}

export type LogCallback = (type: 'info' | 'success' | 'error' | 'warning' | 'step', message: string) => void;
export type ProgressCallback = (progress: Partial<RolesSyncProgress>) => void;
export type RolesPayloadCallback = (
  roleId: number,
  roleName: string,
  payload: any,
  result?: any,
  error?: string
) => void;

// Fetch from Oracle HCM REST API via proxy (Test environment)
const fetchFromHcm = async (
  endpoint: string,
  params: Record<string, string> = {},
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const queryParams = new URLSearchParams(params);
    const proxyUrl = `${PROXY_CONFIG.baseUrl}/hcm/${endpoint}?${queryParams.toString()}`;

    if (verbose) {
      log?.('step', '──── [GET] Oracle HCM (Test) ────');
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

// Test connection to Roles endpoint
export const testRolesConnection = async (
  log: LogCallback
): Promise<{ success: boolean; message: string; sample?: any }> => {
  try {
    log('info', 'Testing Roles endpoint...');

    const result = await fetchFromHcm(
      'rolesLOV',
      { limit: '1' },
      log,
      true
    );

    if (!result.success || !result.items || result.items.length === 0) {
      return { success: false, message: 'No roles found' };
    }

    const role = result.items[0];
    return {
      success: true,
      message: `Connected! Found role: ${role.RoleName} (${role.RoleCode})`,
      sample: role
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log('error', `Connection test failed: ${errorMsg}`);
    return { success: false, message: errorMsg };
  }
};

// Main sync function
export const syncRoles = async (
  parameters: Record<string, string>,
  testMode: boolean | 'single',
  log: LogCallback,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
  onPayload?: RolesPayloadCallback
): Promise<RolesSyncProgress> => {
  const progress: RolesSyncProgress = {
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
  };

  onProgress(progress);

  try {
    const pageSize = testMode === 'single' ? 1 : (testMode ? 25 : 500);
    let offset = 0;
    let hasMore = true;
    let pageNum = 0;
    const BATCH_SIZE = 50; // Records per POST

    log('step', `═══════════════════════════════════════`);
    log('info', `Starting Roles sync (${testMode === 'single' ? 'Single Record Test' : testMode ? 'Test Mode - 25 records' : 'Full Sync'})`);
    log('step', `═══════════════════════════════════════`);

    while (hasMore) {
      if (signal?.aborted) {
        log('warning', 'Sync stopped by user');
        progress.status = 'stopped';
        break;
      }

      pageNum++;
      progress.currentPage = pageNum;
      onProgress({ currentPage: pageNum });

      log('step', `\n──── Page ${pageNum} ────`);

      // Fetch roles
      const queryParams: Record<string, string> = {
        limit: String(pageSize),
        offset: String(offset),
        ...parameters,
      };

      const result = await fetchFromHcm('rolesLOV', queryParams, log, true);

      if (!result.success || !result.items) {
        throw new Error('Failed to fetch roles');
      }

      const roles = result.items;

      if (roles.length === 0) {
        log('info', 'No more roles to process');
        break;
      }

      progress.totalRecords += roles.length;
      onProgress({ totalRecords: progress.totalRecords });

      log('info', `Processing ${roles.length} roles...`);

      // Process in batches
      for (let i = 0; i < roles.length; i += BATCH_SIZE) {
        if (signal?.aborted) break;

        const batch = roles.slice(i, i + BATCH_SIZE);
        const payload = { items: batch };

        try {
          progress.status = 'inserting';
          onProgress({ status: 'inserting' });

          const insertResult = await insertToApex('roles', payload, log, i === 0);

          if (insertResult.success) {
            const count = insertResult.count || batch.length;
            progress.insertedRecords += count;
            progress.processedRecords += batch.length;
            log('success', `Inserted batch of ${count} roles`);

            // Call payload callback for first item in batch
            if (batch.length > 0) {
              onPayload?.(batch[0].RoleId, batch[0].RoleName, payload, insertResult);
            }
          } else {
            progress.errors++;
            progress.lastError = insertResult.error || 'Insert failed';
            progress.processedRecords += batch.length;
            log('error', `Failed to insert batch: ${progress.lastError}`);

            if (batch.length > 0) {
              onPayload?.(batch[0].RoleId, batch[0].RoleName, payload, undefined, progress.lastError);
            }
          }
        } catch (error) {
          progress.errors++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          progress.lastError = errorMsg;
          progress.processedRecords += batch.length;
          log('error', `Error inserting batch: ${errorMsg}`);
        }

        onProgress({
          processedRecords: progress.processedRecords,
          insertedRecords: progress.insertedRecords,
          errors: progress.errors
        });
      }

      // Check if more pages
      hasMore = result.hasMore === true && roles.length === pageSize;

      if (testMode) {
        log('info', 'Test mode - stopping after first batch');
        break;
      }

      offset += pageSize;
    }

    progress.status = signal?.aborted ? 'stopped' : 'completed';
    progress.endTime = new Date();
    onProgress(progress);

    const duration = progress.endTime.getTime() - (progress.startTime?.getTime() || 0);
    log('step', `\n═══════════════════════════════════════`);
    log('success', `Sync ${progress.status}!`);
    log('info', `Total roles: ${progress.totalRecords}`);
    log('info', `Inserted: ${progress.insertedRecords}`);
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
