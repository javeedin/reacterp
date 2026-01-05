import { PROXY_CONFIG, APEX_DB_CONFIG } from '../config/api.config';

// Types
export interface UserAccountRolesSyncProgress {
  status: 'idle' | 'fetching' | 'inserting' | 'completed' | 'error' | 'stopped';
  totalUsers: number;
  processedUsers: number;
  totalRoles: number;
  insertedRoles: number;
  currentPage: number;
  totalPages: number;
  errors: number;
  lastError: string;
  startTime: Date | null;
  endTime: Date | null;
}

export type LogCallback = (type: 'info' | 'success' | 'error' | 'warning' | 'step', message: string) => void;
export type ProgressCallback = (progress: Partial<UserAccountRolesSyncProgress>) => void;
export type UserAccountRolesPayloadCallback = (
  userId: number,
  username: string,
  rolesCount: number,
  payload: any,
  result?: any,
  error?: string
) => void;

interface UserAccount {
  UserId: number;
  Username: string;
  links?: Array<{
    rel: string;
    href: string;
    name: string;
    kind: string;
  }>;
}

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

// Fetch from a full URL (for child resources)
const fetchFromUrl = async (
  url: string,
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    // Use the oracle-url proxy endpoint for full URLs
    const proxyUrl = `${PROXY_CONFIG.baseUrl}/hcm-url?url=${encodeURIComponent(url)}`;

    if (verbose) {
      log?.('info', `Fetching roles from: ${url}`);
    }

    const response = await fetch(proxyUrl);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Fetch failed: ${response.status}`);
    }

    return { success: true, items: data.items || [], hasMore: data.hasMore };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `Fetch URL Error: ${errorMsg}`);
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

// Test connection to User Account Roles endpoint
export const testUserAccountRolesConnection = async (
  log: LogCallback
): Promise<{ success: boolean; message: string; sample?: any }> => {
  try {
    log('info', 'Testing User Accounts endpoint to fetch roles...');

    // First fetch a user to get the roles link
    const result = await fetchFromHcm(
      'userAccounts',
      { limit: '1', expand: 'userAccountRoles' },
      log,
      true
    );

    if (!result.success || !result.items || result.items.length === 0) {
      return { success: false, message: 'No user accounts found' };
    }

    const user = result.items[0];
    const rolesLink = user.links?.find((link: any) => link.name === 'userAccountRoles');

    if (!rolesLink) {
      log('warning', 'No userAccountRoles link found in user response');
      return {
        success: true,
        message: `Connected! Found user ${user.Username} but no roles link`,
        sample: user
      };
    }

    log('info', `Found roles link: ${rolesLink.href}`);

    // Fetch roles for this user
    const rolesResult = await fetchFromUrl(rolesLink.href, log, true);

    return {
      success: true,
      message: `Connected! User ${user.Username} has ${rolesResult.items?.length || 0} roles`,
      sample: { user, roles: rolesResult.items }
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log('error', `Connection test failed: ${errorMsg}`);
    return { success: false, message: errorMsg };
  }
};

// Main sync function
export const syncUserAccountRoles = async (
  parameters: Record<string, string>,
  testMode: boolean | 'single',
  log: LogCallback,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
  onPayload?: UserAccountRolesPayloadCallback
): Promise<UserAccountRolesSyncProgress> => {
  const progress: UserAccountRolesSyncProgress = {
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
  };

  onProgress(progress);

  try {
    const pageSize = testMode === 'single' ? 1 : (testMode ? 25 : 500);
    let offset = 0;
    let hasMore = true;
    let pageNum = 0;

    log('step', `═══════════════════════════════════════`);
    log('info', `Starting User Account Roles sync (${testMode === 'single' ? 'Single Record Test' : testMode ? 'Test Mode - 25 users' : 'Full Sync'})`);
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

      // Fetch users with roles link
      const queryParams: Record<string, string> = {
        limit: String(pageSize),
        offset: String(offset),
        ...parameters,
      };

      const result = await fetchFromHcm('userAccounts', queryParams, log, true);

      if (!result.success || !result.items) {
        throw new Error('Failed to fetch user accounts');
      }

      const users: UserAccount[] = result.items;

      if (users.length === 0) {
        log('info', 'No more users to process');
        break;
      }

      progress.totalUsers += users.length;
      onProgress({ totalUsers: progress.totalUsers });

      log('info', `Processing ${users.length} users for roles...`);

      // Process each user
      for (const user of users) {
        if (signal?.aborted) break;

        // Find the userAccountRoles link
        const rolesLink = user.links?.find((link) => link.name === 'userAccountRoles');

        if (!rolesLink) {
          log('warning', `User ${user.Username} (${user.UserId}) has no roles link`);
          progress.processedUsers++;
          onProgress({ processedUsers: progress.processedUsers });
          continue;
        }

        try {
          // Fetch roles for this user
          const rolesResult = await fetchFromUrl(rolesLink.href, log, false);
          const roles = rolesResult.items || [];

          if (roles.length === 0) {
            log('info', `User ${user.Username} has no roles`);
            progress.processedUsers++;
            onProgress({ processedUsers: progress.processedUsers });
            continue;
          }

          progress.totalRoles += roles.length;
          onProgress({ totalRoles: progress.totalRoles });

          // Prepare payload with userId included
          const payload = {
            userId: user.UserId,
            items: roles
          };

          // Insert to APEX
          const insertResult = await insertToApex('useraccountroles', payload, log, false);

          if (insertResult.success) {
            const count = insertResult.count || roles.length;
            progress.insertedRoles += count;
            log('success', `Inserted ${count} roles for user ${user.Username}`);
            onPayload?.(user.UserId, user.Username, roles.length, payload, insertResult);
          } else {
            progress.errors++;
            progress.lastError = insertResult.error || 'Insert failed';
            log('error', `Failed to insert roles for ${user.Username}: ${progress.lastError}`);
            onPayload?.(user.UserId, user.Username, roles.length, payload, undefined, progress.lastError);
          }
        } catch (error) {
          progress.errors++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          progress.lastError = errorMsg;
          log('error', `Error processing user ${user.Username}: ${errorMsg}`);
        }

        progress.processedUsers++;
        onProgress({
          processedUsers: progress.processedUsers,
          insertedRoles: progress.insertedRoles,
          totalRoles: progress.totalRoles,
          errors: progress.errors
        });
      }

      // Check if more pages
      hasMore = result.hasMore === true && users.length === pageSize;

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
    log('info', `Users processed: ${progress.processedUsers}`);
    log('info', `Roles inserted: ${progress.insertedRoles}`);
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
