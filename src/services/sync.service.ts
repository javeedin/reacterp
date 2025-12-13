import { ORACLE_FUSION_CONFIG, APEX_DB_CONFIG, type SyncObjectConfig } from '../config/api.config';
import type { SyncResult } from '../types/sync.types';

// Logger callback type
type LogCallback = (type: 'info' | 'success' | 'error' | 'warning', message: string) => void;

// Create Basic Auth header
const getOracleAuthHeader = (): string => {
  const credentials = btoa(`${ORACLE_FUSION_CONFIG.username}:${ORACLE_FUSION_CONFIG.password}`);
  return `Basic ${credentials}`;
};

// Build Oracle URL
export const buildOracleUrl = (
  objectConfig: SyncObjectConfig,
  parameters: Record<string, string>,
  offset: number = 0,
  limit: number = ORACLE_FUSION_CONFIG.defaultLimit
): string => {
  const queryParams = new URLSearchParams();

  const filters = Object.entries(parameters)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join(';');

  if (filters) {
    queryParams.append('q', filters);
  }

  queryParams.append('offset', offset.toString());
  queryParams.append('limit', limit.toString());

  return `${ORACLE_FUSION_CONFIG.baseUrl}${objectConfig.oracleEndpoint}?${queryParams.toString()}`;
};

// Test Oracle connection
export const testOracleConnection = async (
  objectConfig: SyncObjectConfig,
  parameters: Record<string, string>,
  log?: LogCallback
): Promise<SyncResult> => {
  const url = buildOracleUrl(objectConfig, parameters, 0, 1);

  log?.('info', `Testing Oracle connection...`);
  log?.('info', `URL: ${url}`);
  log?.('info', `User: ${ORACLE_FUSION_CONFIG.username}`);

  try {
    console.log('=== ORACLE CONNECTION TEST ===');
    console.log('URL:', url);
    console.log('Auth Header:', getOracleAuthHeader().substring(0, 20) + '...');

    const startTime = Date.now();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': getOracleAuthHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    const duration = Date.now() - startTime;
    console.log('Response Status:', response.status);
    console.log('Response Time:', duration, 'ms');

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error Response:', errorText);
      log?.('error', `Oracle responded with ${response.status}: ${response.statusText}`);
      log?.('error', `Response: ${errorText.substring(0, 200)}`);
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    console.log('Response Data:', data);

    const count = data.count || data.totalResults || (data.items?.length || 0);
    log?.('success', `Oracle connection successful! Found ${count} records (${duration}ms)`);

    return {
      success: true,
      totalCount: count,
      data: data.items || [],
    };
  } catch (error) {
    console.error('=== ORACLE CONNECTION ERROR ===');
    console.error('Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check for CORS error
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      log?.('error', `Network/CORS Error: Browser blocked the request`);
      log?.('warning', `This is likely a CORS issue. The Oracle API doesn't allow browser requests.`);
      log?.('info', `Solution: Use a backend proxy server or run sync from server-side`);
    } else {
      log?.('error', `Connection failed: ${errorMessage}`);
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
};

// Fetch data from Oracle Fusion
export const fetchFromOracle = async (
  objectConfig: SyncObjectConfig,
  parameters: Record<string, string>,
  offset: number = 0,
  limit: number = ORACLE_FUSION_CONFIG.defaultLimit,
  log?: LogCallback
): Promise<SyncResult> => {
  const url = buildOracleUrl(objectConfig, parameters, offset, limit);

  try {
    console.log('=== FETCHING FROM ORACLE ===');
    console.log('URL:', url);
    console.log('Offset:', offset, 'Limit:', limit);

    log?.('info', `Requesting: ${url}`);

    const startTime = Date.now();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': getOracleAuthHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    const duration = Date.now() - startTime;

    console.log('Response Status:', response.status);
    console.log('Response Time:', duration, 'ms');

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error Response:', errorText);
      throw new Error(`Oracle API Error: ${response.status} ${response.statusText} - ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();
    console.log('Response Keys:', Object.keys(data));
    console.log('Items Count:', data.items?.length || 0);
    console.log('HasMore:', data.hasMore);
    console.log('TotalResults:', data.totalResults);

    const items = data.items || [];
    const hasMore = data.hasMore || false;
    const totalCount = data.totalResults || data.count || items.length;

    log?.('success', `Fetched ${items.length} records in ${duration}ms (hasMore: ${hasMore})`);

    return {
      success: true,
      data: items,
      count: items.length,
      hasMore,
      offset,
      limit,
      totalCount,
    };
  } catch (error) {
    console.error('=== ORACLE FETCH ERROR ===');
    console.error('Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    if (errorMessage.includes('Failed to fetch')) {
      log?.('error', `Network Error: Unable to reach Oracle API`);
      log?.('warning', `This may be a CORS issue - browser blocking cross-origin request`);
    } else {
      log?.('error', `Fetch failed: ${errorMessage}`);
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
};

// Insert data to APEX Database
export const insertToApex = async (
  objectConfig: SyncObjectConfig,
  records: unknown[],
  log?: LogCallback
): Promise<SyncResult> => {
  const url = `${APEX_DB_CONFIG.baseUrl}${objectConfig.apexEndpoint}`;

  try {
    console.log('=== INSERTING TO APEX ===');
    console.log('URL:', url);
    console.log('Records:', records.length);

    log?.('info', `Posting to: ${url}`);
    log?.('info', `Payload size: ${records.length} records`);

    const startTime = Date.now();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ items: records }),
    });

    const duration = Date.now() - startTime;

    console.log('Response Status:', response.status);
    console.log('Response Time:', duration, 'ms');

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error Response:', errorText);
      throw new Error(`APEX API Error: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const result = await response.json();
    console.log('Insert Result:', result);

    log?.('success', `Inserted ${records.length} records in ${duration}ms`);

    return {
      success: true,
      count: records.length,
      data: result,
    };
  } catch (error) {
    console.error('=== APEX INSERT ERROR ===');
    console.error('Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    if (errorMessage.includes('Failed to fetch')) {
      log?.('error', `Network Error: Unable to reach APEX API`);
      log?.('warning', `Check if APEX endpoint is accessible`);
    } else {
      log?.('error', `Insert failed: ${errorMessage}`);
    }

    return {
      success: false,
      error: errorMessage,
      count: 0,
    };
  }
};

// Get total count from Oracle
export const getOracleTotalCount = async (
  objectConfig: SyncObjectConfig,
  parameters: Record<string, string>,
  log?: LogCallback
): Promise<number> => {
  try {
    const queryParams = new URLSearchParams();

    const filters = Object.entries(parameters)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${value}`)
      .join(';');

    if (filters) {
      queryParams.append('q', filters);
    }

    queryParams.append('offset', '0');
    queryParams.append('limit', '1');
    queryParams.append('onlyData', 'true');

    const url = `${ORACLE_FUSION_CONFIG.baseUrl}${objectConfig.oracleEndpoint}?${queryParams.toString()}`;

    console.log('=== GETTING ORACLE COUNT ===');
    console.log('URL:', url);

    log?.('info', `Getting count from: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': getOracleAuthHeader(),
        'Content-Type': 'application/json',
      },
    });

    console.log('Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error Response:', errorText);
      throw new Error(`Failed to get count: ${response.status} - ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();
    const count = data.totalResults || data.count || 0;

    console.log('Total Count:', count);
    log?.('success', `Total records in Oracle: ${count}`);

    return count;
  } catch (error) {
    console.error('=== GET COUNT ERROR ===');
    console.error('Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `Failed to get count: ${errorMessage}`);

    return 0;
  }
};
