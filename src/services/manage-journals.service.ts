/**
 * Manage Journals Service
 * Service for querying journals from APEX REST API
 */

import { fetchFromApex } from './sync-http';

// Types
export interface JournalSearchParams {
  journal?: string;
  journalOperator?: 'Starts with' | 'Equals' | 'Contains' | 'Ends with';
  batch?: string;
  batchOperator?: 'Starts with' | 'Equals' | 'Contains' | 'Ends with';
  accountingPeriod?: string;
  source?: string;
  category?: string;
  ledger?: string;
  batchStatus?: string;
  offset?: number;
  limit?: number;
}

export interface JournalRecord {
  key: string;
  headerSyncId: number;
  jeHeaderId: number;
  jeBatchId: number;
  journal: string;
  journalBatch: string;
  batchName: string;
  accountingPeriod: string;
  source: string;
  category: string;
  journalEnteredDebit: number;
  journalEnteredCredit: number;
  journalAccountedDebit: number;
  journalAccountedCredit: number;
  currency: string;
  batchStatus: 'Posted' | 'Unposted' | 'Error' | 'Pending' | string;
  statusCode: string;
  reference: string;
  approvalStatus: 'Approved' | 'Pending' | 'Rejected' | 'Not required' | string;
  ledgerName: string;
  effectiveDate: string;
  postedDate: string;
  creationDate: string;
}

export interface JournalLine {
  key: string;
  lineSyncId: number;
  lineNum: number;
  jeHeaderId: number;
  account: string;
  description: string;
  enteredDr: number;
  enteredCr: number;
  accountedDr: number;
  accountedCr: number;
  currency: string;
  status: string;
}

export interface JournalSearchResponse {
  success: boolean;
  totalCount: number;
  offset: number;
  limit: number;
  items: JournalRecord[];
  error?: string;
}

export interface JournalLinesResponse {
  success: boolean;
  jeHeaderId: number;
  lines: JournalLine[];
  error?: string;
}

export interface LookupItem {
  value: string;
  label: string;
}

export interface LookupResponse {
  items: LookupItem[];
}

/**
 * Build query string from search parameters
 */
const buildQueryString = (params: JournalSearchParams): string => {
  const queryParams = new URLSearchParams();

  if (params.journal) queryParams.append('journal', params.journal);
  if (params.journalOperator) queryParams.append('journalOperator', params.journalOperator);
  if (params.batch) queryParams.append('batch', params.batch);
  if (params.batchOperator) queryParams.append('batchOperator', params.batchOperator);
  if (params.accountingPeriod) queryParams.append('accountingPeriod', params.accountingPeriod);
  if (params.source) queryParams.append('source', params.source);
  if (params.category) queryParams.append('category', params.category);
  if (params.ledger) queryParams.append('ledger', params.ledger);
  if (params.batchStatus) queryParams.append('batchStatus', params.batchStatus);
  if (params.offset !== undefined) queryParams.append('offset', params.offset.toString());
  if (params.limit !== undefined) queryParams.append('limit', params.limit.toString());

  return queryParams.toString();
};

/**
 * Search journals with parameters
 */
export const searchJournals = async (
  params: JournalSearchParams,
  _useProxy: boolean = true
): Promise<JournalSearchResponse> => {
  const queryString = buildQueryString(params);
  const endpoint = `gl/journals${queryString ? '?' + queryString : ''}`;

  try {
    const data = await fetchFromApex(endpoint);
    return data;
  } catch (error) {
    console.error('Error searching journals:', error);
    return {
      success: false,
      totalCount: 0,
      offset: params.offset || 0,
      limit: params.limit || 25,
      items: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Get journal lines by header ID
 */
export const getJournalLines = async (
  jeHeaderId: number,
  _useProxy: boolean = true
): Promise<JournalLinesResponse> => {
  try {
    const data = await fetchFromApex(`gl/journals/${jeHeaderId}/lines`);
    return data;
  } catch (error) {
    console.error('Error fetching journal lines:', error);
    return {
      success: false,
      jeHeaderId,
      lines: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Get lookup values for dropdowns
 */
export const getLookupValues = async (
  lookupType: 'periods' | 'sources' | 'categories' | 'ledgers' | 'batch-statuses',
  _useProxy: boolean = true
): Promise<LookupItem[]> => {
  try {
    const data: LookupResponse = await fetchFromApex(`gl/lookups/${lookupType}`);
    return data.items || [];
  } catch (error) {
    console.error(`Error fetching ${lookupType} lookup:`, error);
    return [];
  }
};

/**
 * Get all lookup values for the search form
 */
export const getAllLookups = async (useProxy: boolean = true): Promise<{
  periods: LookupItem[];
  sources: LookupItem[];
  categories: LookupItem[];
  ledgers: LookupItem[];
  batchStatuses: LookupItem[];
}> => {
  const [periods, sources, categories, ledgers, batchStatuses] = await Promise.all([
    getLookupValues('periods', useProxy),
    getLookupValues('sources', useProxy),
    getLookupValues('categories', useProxy),
    getLookupValues('ledgers', useProxy),
    getLookupValues('batch-statuses', useProxy),
  ]);

  return {
    periods,
    sources,
    categories,
    ledgers,
    batchStatuses,
  };
};

/**
 * Format currency value
 */
export const formatCurrency = (value: number, currency: string = 'INR'): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(value);
};

/**
 * Format date
 */
export const formatDate = (dateString: string): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};
