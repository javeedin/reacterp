import { ORACLE_FUSION_CONFIG, APEX_DB_CONFIG, type SyncObjectConfig } from '../config/api.config';
import type { SyncResult } from '../types/sync.types';

// Create Basic Auth header
const getOracleAuthHeader = (): string => {
  const credentials = btoa(`${ORACLE_FUSION_CONFIG.username}:${ORACLE_FUSION_CONFIG.password}`);
  return `Basic ${credentials}`;
};

// Fetch data from Oracle Fusion
export const fetchFromOracle = async (
  objectConfig: SyncObjectConfig,
  parameters: Record<string, string>,
  offset: number = 0,
  limit: number = ORACLE_FUSION_CONFIG.defaultLimit
): Promise<SyncResult> => {
  try {
    // Build query string
    const queryParams = new URLSearchParams();

    // Add filter parameters
    const filters = Object.entries(parameters)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${value}`)
      .join(';');

    if (filters) {
      queryParams.append('q', filters);
    }

    queryParams.append('offset', offset.toString());
    queryParams.append('limit', limit.toString());

    const url = `${ORACLE_FUSION_CONFIG.baseUrl}${objectConfig.oracleEndpoint}?${queryParams.toString()}`;

    console.log('Fetching from Oracle:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': getOracleAuthHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Oracle API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Oracle REST API typically returns items array and hasMore flag
    const items = data.items || [];
    const hasMore = data.hasMore || false;
    const totalCount = data.totalResults || data.count || items.length;

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
    console.error('Oracle fetch error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

// Insert data to APEX Database
export const insertToApex = async (
  objectConfig: SyncObjectConfig,
  records: unknown[]
): Promise<SyncResult> => {
  try {
    const url = `${APEX_DB_CONFIG.baseUrl}${objectConfig.apexEndpoint}`;

    console.log('Inserting to APEX:', url, 'Records:', records.length);

    // Insert records one batch at a time
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ items: records }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`APEX API Error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    return {
      success: true,
      count: records.length,
      data: result,
    };
  } catch (error) {
    console.error('APEX insert error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      count: 0,
    };
  }
};

// Get total count from Oracle
export const getOracleTotalCount = async (
  objectConfig: SyncObjectConfig,
  parameters: Record<string, string>
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

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': getOracleAuthHeader(),
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get count: ${response.status}`);
    }

    const data = await response.json();
    return data.totalResults || data.count || 0;
  } catch (error) {
    console.error('Error getting total count:', error);
    return 0;
  }
};
