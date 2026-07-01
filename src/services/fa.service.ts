/**
 * Fixed Assets Service
 * All API calls for the FA module → reerp/fa/* endpoints
 */

import { fetchFromApex, insertToApex, putToApex } from './sync-http';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AssetSearchParams {
  assetNumber?: string;
  description?: string;
  category?: string;
  bookTypeCode?: string;
  assetType?: string;
  status?: 'ACTIVE' | 'RETIRED' | '';
  offset?: number;
  limit?: number;
}

export interface AssetRecord {
  // Fields returned by GET_ASSETS (RR_FA_ADDITIONS_TL + RR_FA_BOOKS)
  assetId: string;
  description: string;
  creationDate: string;
  createdBy: string;
  lastUpdateDate: string;
  lastUpdatedBy: string;
  bookTypeCode: string;
  datePlacedInService: string;
  cost: string;
  originalCost: string;
  adjustedCost: string;
  salvageValue: string;
  capitalizeFlag: string;
  depreciateFlag: string;
  dateIneffective: string;
  deprnReserve: string;
  nbv: string;
  retiredFlag: string;   // 'YES' if no active book entry, else 'NO'
  // Legacy / not available from current tables — kept optional for UI compat
  assetNumber?: string;
  asset_number?: string;  // snake_case from API response
  assetType?: string;
  categoryId?: string;
  tagNumber?: string;
  serialNumber?: string;
  manufacturer?: string;
  inUseFlag?: string;
  ownedLeased?: string;
  units?: string;
  currentUnits?: string;
  capitalizedFlag?: string;
}

export interface AssetDetail extends AssetRecord {
  parentAssetId: string;
  manufacturerName: string;
  modelNumber: string;
  newUsed: string;
  inventorial: string;
  pendingFlag: string;
  propertyTypeCode: string;
  feederSystemName: string;
  createdBy: string;
  lastUpdatedBy: string;
  tlDescription: string;
}

export interface AssetBook {
  bookTypeCode: string;
  bookTypeName: string;
  datePlacedInService: string;
  dateEffective: string;
  deprnStartDate: string;
  cost: string;
  originalCost: string;
  adjustedCost: string;
  salvageValue: string;
  recoverableCost: string;
  depreciateFlag: string;
  capitalizeFlag: string;
  dateIneffective: string;
  retirementId: string;
  methodId: string;
  methodCode: string;
  methodName: string;
  lifeInMonths: string;
  prorateDate: string;
  conventionTypeId: string;
  rateAdjustmentFactor: string;
  deprnReserve: string;
  ytdDeprn: string;
  nbv: string;
}

export interface DeprnRecord {
  assetId: string;
  bookTypeCode: string;
  periodCounter: string;
  periodName: string;
  fiscalYear: string;
  periodNum: string;
  distributionId: string;
  deprnRunId: string;
  deprnSourceCode: string;
  deprnRunDate: string;
  deprnAmount: string;
  ytdDeprn: string;
  deprnReserve: string;
  deprnAdjustmentAmount: string;
  totalDeprnAmount: string;
  cost: string;
  nbv: string;
  bonusDeprnAmount: string;
  bonusYtdDeprn: string;
  bonusDeprnReserve: string;
  bonusDeprnAdjustmentAmount: string;
  revalReserve: string;
  revalDeprnExpense: string;
  ytdRevalDeprnExpense: string;
  revalAmortization: string;
  revalAmortBalance: string;
  impairmentAmount: string;
  impairmentReserve: string;
  ytdImpairment: string;
  capitalAdjustment: string;
  generalFund: string;
  backlogDeprnReserve: string;
  ytdBacklogDeprn: string;
}

export interface DistributionRecord {
  distributionId: string;
  bookTypeCode: string;
  unitsAssigned: string;
  transactionUnits: string;
  codeCombinationId: string;
  locationId: string;
  locationSeg1: string;
  locationSeg2: string;
  locationSeg3: string;
  transactionHeaderIdIn: string;
  transactionHeaderIdOut: string;
  dateEffective: string;
  dateIneffective: string;
}

export interface InvoiceRecord {
  assetInvoiceId: string;
  bookTypeCode: string;
  fixedAssetsCost: string;
  dateEffective: string;
  invoiceTransactionIdIn: string;
  feederSystemName: string;
  description: string;
  sourceLineId: string;
  postBatchId: string;
}

export interface TransactionRecord {
  transactionHeaderId: string;
  bookTypeCode: string;
  transactionTypeCode: string;
  transactionDate: string;
  dateEffective: string;
  callingInterface: string;
  creationDate: string;
  createdBy: string;
}

export interface AssetSearchResponse {
  totalCount: number;
  items: AssetRecord[];
  error?: string;
}

export interface CategoryRecord {
  categoryId: string;
  segment1: string;
  segment2: string;
  description: string;
  categoryType: string;
  ownedLeased: string;
  capitalizeFlag: string;
  summaryFlag: string;
  enabledFlag: string;
  // Asset cost CCID + resolved segments (populated by 19_fa_categories_with_ccid.sql)
  assetCostAccountCcid?: string;
  assetCostAccount?: string;
  segCo?: string; segLob?: string; segDept?: string; segAccount?: string;
  segSubAcc?: string; segAlys?: string; segIc?: string; segFut1?: string; segFut2?: string;
}

export interface CategoryDetail extends CategoryRecord {
  structureInstanceNumber: string;
  creationDate: string;
  createdBy: string;
  lastUpdateDate: string;
  lastUpdatedBy: string;
}

export interface CategoryBookRecord {
  categoryBookId: string;
  bookTypeCode: string;
  bookTypeName: string;
  bookClass: string;
  // Standard CCIDs
  assetCostAccountCcid: string;
  assetClearingAccountCcid: string;
  deprnExpenseAccountCcid: string;
  reserveAccountCcid: string;
  bonusExpenseAccountCcid: string;
  bonusReserveAccountCcid: string;
  // CIP CCIDs
  cipCostAccountCcid?: string;
  cipClearingAccountCcid?: string;
  // Unplanned + impairment CCIDs
  unplannedDeprnExpCcid?: string;
  impairmentExpenseAcctCcid?: string;
  impairmentReserveAcctCcid?: string;
  // Revaluation CCIDs
  revalReserveAcctCcid?: string;
  revalAmortAcctCcid?: string;
  revalLossExpAcctCcid?: string;
  // Resolved account strings (standard)
  assetCostAccount: string;
  assetClearingAccount: string;
  deprnExpenseAccount: string;
  reserveAccount: string;
  bonusExpenseAccount: string;
  bonusReserveAccount: string;
  // Resolved account strings (CIP)
  cipCostAccount?: string;
  cipClearingAccount?: string;
  // Resolved account strings (unplanned + impairment)
  unplannedDeprnExpAccount?: string;
  impairmentExpenseAccount?: string;
  impairmentReserveAccount?: string;
  // Resolved account strings (revaluation)
  revalReserveAccount?: string;
  revalAmortAccount?: string;
  revalLossExpAccount?: string;
}

export interface CategoryBookDefaultRecord {
  defaultsId?: string;
  bookTypeCode?: string;
  fromDate?: string;
  toDate?: string;
  depreciateFlag?: string;
  deprnMethodCode?: string;
  lifeInMonths?: string;
  prorateConventionCode?: string;
  retirementTypeCode?: string;
  percentSalvageValue?: string;
  deprnLimitType?: string;
  bonusRule?: string;
  ceilingName?: string;
  capitalGainsThreshYears?: string;
  capitalGainsThreshMonths?: string;
  priceIndexName?: string;
  massPropertyFlag?: string;
  subcompRuleType?: string;
  minYearsLife?: string;
  minMonthsLife?: string;
  recognizeGainLoss?: string;
  trackingMethod?: string;
  terminalGainLoss?: string;
  groupAssetNumber?: string;
}

export interface CategorySearchParams {
  description?: string;
  categoryType?: string;
  capitalizeFlag?: string;
  ownedLeased?: string;
  enabledFlag?: string;
  offset?: number;
  limit?: number;
}

export interface CategorySearchResponse {
  totalCount: number;
  items: CategoryRecord[];
  error?: string;
}

export interface MethodRecord {
  methodId: string;
  methodCode: string;
  name: string;
  lifeInMonths: string;
  stlMethodFlag: string;
  rateSourceRule: string;
  deprnBasisRule: string;
}

export interface LocationRecord {
  locationId: string;
  segment1: string;
  segment2: string;
  segment3: string;
  segment4: string;
  fullLocation: string;
}

export interface BookControlRecord {
  bookTypeCode: string;
  bookTypeName: string;
  bookClass: string;
  deprnCalendar: string;
  fiscalYearName: string;
  currentFiscalYear: string;
  deprnStatus: string;
}

export interface RetirementRecord {
  retirementId: string;
  bookTypeCode: string;
  assetId: string;
  assetNumber: string;
  description: string;
  dateRetired: string;
  costRetired: string;
  status: string;
  nbvRetired: string;
  gainLossAmount: string;
  proceedsOfSale: string;
  costOfRemoval: string;
  retirementTypeCode: string;
  soldTo: string;
}

export interface DeprnWorkbenchRecord {
  assetId: string;
  assetNumber: string;
  description: string;
  bookTypeCode: string;
  periodCounter: string;
  periodName: string;
  fiscalYear: string;
  deprnAmount: string;
  ytdDeprn: string;
  deprnReserve: string;
  adjustedCost: string;
  nbv: string;
  salvageValue: string;
  deprnRunDate: string;
}

export interface DeprnWorkbenchSummary {
  totalCost: number;
  totalDeprnReserve: number;
  totalNbv: number;
  totalDeprnAmount: number;
}

// ── Asset Search ──────────────────────────────────────────────────────────────

export const searchAssets = async (
  params: AssetSearchParams
): Promise<AssetSearchResponse> => {
  const q = new URLSearchParams();
  if (params.assetNumber)  q.append('assetNumber',  params.assetNumber);
  if (params.description)  q.append('description',  params.description);
  if (params.category)     q.append('category',     params.category);
  if (params.bookTypeCode) q.append('bookTypeCode', params.bookTypeCode);
  if (params.assetType)    q.append('assetType',    params.assetType);
  if (params.status)       q.append('assetStatus',  params.status);
  if (params.offset !== undefined) q.append('offset', String(params.offset));
  if (params.limit  !== undefined) q.append('limit',  String(params.limit));

  const qs = q.toString();
  try {
    return await fetchFromApex(`fa/assets${qs ? '?' + qs : ''}`);
  } catch (e) {
    return { totalCount: 0, items: [], error: e instanceof Error ? e.message : 'Unknown error' };
  }
};

// ── Single Asset ──────────────────────────────────────────────────────────────

export const getAssetDetail = async (assetId: string): Promise<{ success: boolean; error?: string } & Partial<AssetDetail>> => {
  try { return await fetchFromApex(`fa/assets/${assetId}`); }
  catch (e) { return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }; }
};

export const getAssetBooks = async (assetId: string): Promise<{ success: boolean; items: AssetBook[]; error?: string }> => {
  try { return await fetchFromApex(`fa/assets/${assetId}/books`); }
  catch (e) { return { success: false, items: [], error: e instanceof Error ? e.message : 'Unknown error' }; }
};

export const getAssetDeprn = async (assetId: string): Promise<{ success: boolean; items: DeprnRecord[]; error?: string }> => {
  try { return await fetchFromApex(`fa/assets/${assetId}/deprn`); }
  catch (e) { return { success: false, items: [], error: e instanceof Error ? e.message : 'Unknown error' }; }
};

export const getAssetDistributions = async (assetId: string): Promise<{ success: boolean; items: DistributionRecord[]; error?: string }> => {
  try { return await fetchFromApex(`fa/assets/${assetId}/distributions`); }
  catch (e) { return { success: false, items: [], error: e instanceof Error ? e.message : 'Unknown error' }; }
};

export const getAssetInvoices = async (assetId: string): Promise<{ success: boolean; items: InvoiceRecord[]; error?: string }> => {
  try { return await fetchFromApex(`fa/assets/${assetId}/invoices`); }
  catch (e) { return { success: false, items: [], error: e instanceof Error ? e.message : 'Unknown error' }; }
};

export const getAssetTransactions = async (assetId: string): Promise<{ success: boolean; items: TransactionRecord[]; error?: string }> => {
  try { return await fetchFromApex(`fa/assets/${assetId}/transactions`); }
  catch (e) { return { success: false, items: [], error: e instanceof Error ? e.message : 'Unknown error' }; }
};

// ── Setup Lookups ─────────────────────────────────────────────────────────────

export const searchCategories = async (
  params: CategorySearchParams
): Promise<CategorySearchResponse> => {
  const q = new URLSearchParams();
  if (params.description)   q.append('description',   params.description);
  if (params.categoryType)  q.append('categoryType',  params.categoryType);
  if (params.capitalizeFlag)q.append('capitalizeFlag',params.capitalizeFlag);
  if (params.ownedLeased)   q.append('ownedLeased',   params.ownedLeased);
  if (params.enabledFlag)   q.append('enabledFlag',   params.enabledFlag);
  if (params.offset !== undefined) q.append('offset', String(params.offset));
  if (params.limit  !== undefined) q.append('limit',  String(params.limit));
  const qs = q.toString();
  try { return await fetchFromApex(`fa/categories${qs ? '?' + qs : ''}`); }
  catch (e) { return { totalCount: 0, items: [], error: e instanceof Error ? e.message : 'Unknown error' }; }
};

export const getCategoryDetail = async (categoryId: string): Promise<{ success: boolean; error?: string } & Partial<CategoryDetail>> => {
  try { return await fetchFromApex(`fa/categories/${categoryId}`); }
  catch (e) { return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }; }
};

export const getCategoryBooks = async (categoryId: string): Promise<{ success: boolean; items: CategoryBookRecord[]; error?: string }> => {
  try { return await fetchFromApex(`fa/categories/${categoryId}/books`); }
  catch (e) { return { success: false, items: [], error: e instanceof Error ? e.message : 'Unknown error' }; }
};

export const getCategoryBookDefaults = async (categoryId: string): Promise<{ success: boolean; items: CategoryBookDefaultRecord[]; error?: string }> => {
  try { return await fetchFromApex(`fa/categories/${categoryId}/book-defaults`); }
  catch (e) { return { success: false, items: [], error: e instanceof Error ? e.message : 'Unknown error' }; }
};

export const getCategories = async (): Promise<CategoryRecord[]> => {
  try {
    const d = await fetchFromApex('fa/categories');
    return (d.items || []).map((r: any): CategoryRecord => ({
      categoryId:          r.categoryId          ?? r.category_id          ?? '',
      segment1:            r.segment1            ?? r.SEGMENT1             ?? '',
      segment2:            r.segment2            ?? r.SEGMENT2             ?? '',
      description:         r.description         ?? '',
      categoryType:        r.categoryType        ?? r.category_type        ?? '',
      ownedLeased:         r.ownedLeased         ?? r.owned_leased         ?? '',
      capitalizeFlag:      r.capitalizeFlag      ?? r.capitalize_flag      ?? '',
      summaryFlag:         r.summaryFlag         ?? r.summary_flag         ?? '',
      enabledFlag:         r.enabledFlag         ?? r.enabled_flag         ?? '',
      assetCostAccountCcid: r.assetCostAccountCcid ?? r.asset_cost_account_ccid ?? undefined,
      assetCostAccount:    r.assetCostAccount    ?? r.asset_cost_account   ?? undefined,
      segCo:      r.segCo      ?? r.seg_co      ?? undefined,
      segLob:     r.segLob     ?? r.seg_lob     ?? undefined,
      segDept:    r.segDept    ?? r.seg_dept     ?? undefined,
      segAccount: r.segAccount ?? r.seg_account  ?? undefined,
      segSubAcc:  r.segSubAcc  ?? r.seg_sub_acc  ?? undefined,
      segAlys:    r.segAlys    ?? r.seg_alys     ?? undefined,
      segIc:      r.segIc      ?? r.seg_ic       ?? undefined,
      segFut1:    r.segFut1    ?? r.seg_fut1     ?? undefined,
      segFut2:    r.segFut2    ?? r.seg_fut2     ?? undefined,
    }));
  }
  catch { return []; }
};

export const getMethods = async (): Promise<MethodRecord[]> => {
  try {
    const d = await fetchFromApex('fa/methods');
    return (d.items || []).map((m: any): MethodRecord => ({
      methodId:      m.methodId      ?? m.method_id      ?? '',
      methodCode:    m.methodCode    ?? m.method_code    ?? '',
      name:          m.name         ?? '',
      lifeInMonths:  m.lifeInMonths  ?? m.life_in_months  ?? '',
      stlMethodFlag: m.stlMethodFlag ?? m.stl_method_flag ?? '',
      rateSourceRule: m.rateSourceRule ?? m.rate_source_rule ?? '',
      deprnBasisRule: m.deprnBasisRule ?? m.deprn_basis_rule ?? '',
    }));
  }
  catch { return []; }
};

export const getLocations = async (): Promise<LocationRecord[]> => {
  try {
    const d = await fetchFromApex('fa/locations');
    return (d.items || []).map((r: any) => ({
      locationId:   r.locationId   ?? r.location_id   ?? '',
      segment1:     r.segment1     ?? r.SEGMENT1       ?? '',
      segment2:     r.segment2     ?? r.SEGMENT2       ?? '',
      segment3:     r.segment3     ?? r.SEGMENT3       ?? '',
      segment4:     r.segment4     ?? r.SEGMENT4       ?? '',
      fullLocation: r.fullLocation ?? r.full_location  ?? '',
      summaryFlag:  r.summaryFlag  ?? r.summary_flag   ?? '',
      enabledFlag:  r.enabledFlag  ?? r.enabled_flag   ?? '',
    }));
  }
  catch { return []; }
};

export interface CcidRecord {
  ccid: string;
  label: string;
  co: string; lob: string; dept: string; account: string; subAcc: string; alys: string; ic: string; accountType: string;
}

export const getCcids = async (search?: string): Promise<CcidRecord[]> => {
  try {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    const d = await fetchFromApex(`fa/ccid${qs}`);
    return (d.items || []).map((r: any): CcidRecord => ({
      ccid:        String(r.ccid   ?? r.CCID   ?? ''),
      label:       r.label        ?? r.LABEL   ?? '',
      co:          r.co           ?? '',
      lob:         r.lob          ?? '',
      dept:        r.dept         ?? '',
      account:     r.account      ?? '',
      subAcc:      r.subAcc       ?? r.sub_acc ?? '',
      alys:        r.alys         ?? '',
      ic:          r.ic           ?? '',
      accountType: r.accountType  ?? r.account_type ?? '',
    }));
  }
  catch { return []; }
};

export const getBookControls = async (): Promise<BookControlRecord[]> => {
  try { const d = await fetchFromApex('fa/book-controls'); return d.items || []; }
  catch { return []; }
};

export const getDeprnPeriods = async (bookTypeCode?: string): Promise<any[]> => {
  try {
    const qs = bookTypeCode ? `?bookTypeCode=${encodeURIComponent(bookTypeCode)}` : '';
    const d = await fetchFromApex(`fa/deprn-periods${qs}`);
    return d.items || [];
  } catch { return []; }
};

export const getDeprnPeriodsCurrent = async (bookTypeCode?: string): Promise<any[]> => {
  try {
    const qs = bookTypeCode ? `?bookTypeCode=${encodeURIComponent(bookTypeCode)}` : '';
    const d = await fetchFromApex(`fa/deprn-periods/current${qs}`);
    return d.items || [];
  } catch { return []; }
};

export const getDeprnLastPeriod = async (bookTypeCode?: string): Promise<any | null> => {
  try {
    const qs = bookTypeCode ? `?bookTypeCode=${encodeURIComponent(bookTypeCode)}` : '';
    const d = await fetchFromApex(`fa/deprn-periods/last${qs}`);
    const items = d.items || [];
    return items.length > 0 ? items[0] : null;
  } catch { return null; }
};

export const getDeprnPreview = async (bookTypeCode: string, periodName: string): Promise<any> => {
  try {
    const qs = `?bookTypeCode=${encodeURIComponent(bookTypeCode)}&periodName=${encodeURIComponent(periodName)}`;
    return await fetchFromApex(`fa/deprn-calculate/preview${qs}`);
  } catch { return { success: false, items: [], summary: null }; }
};

export const postDeprnCalculate = async (params: {
  bookTypeCode: string;
  periodName: string;
  periodCounter: number;
}): Promise<any> => {
  try {
    return await insertToApex('fa/deprn-calculate', params);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
};

export const getRetirements = async (bookTypeCode?: string): Promise<RetirementRecord[]> => {
  try {
    const qs = bookTypeCode ? `?bookTypeCode=${encodeURIComponent(bookTypeCode)}` : '';
    const d = await fetchFromApex(`fa/retirements${qs}`);
    return d.items || [];
  } catch { return []; }
};

// ── Depreciation Workbench ────────────────────────────────────────────────────

export const getDeprnWorkbench = async (params: {
  bookTypeCode?: string;
  periodCounter?: string;
  assetNumber?: string;
  offset?: number;
  limit?: number;
}): Promise<{ success: boolean; totalCount: number; items: DeprnWorkbenchRecord[]; summary: DeprnWorkbenchSummary; error?: string }> => {
  const q = new URLSearchParams();
  if (params.bookTypeCode)  q.append('bookTypeCode',  params.bookTypeCode);
  if (params.periodCounter) q.append('periodCounter', params.periodCounter);
  if (params.assetNumber)   q.append('assetNumber',   params.assetNumber);
  if (params.offset !== undefined) q.append('offset', String(params.offset));
  if (params.limit  !== undefined) q.append('limit',  String(params.limit));
  try {
    const qs = q.toString();
    return await fetchFromApex(`fa/deprn-workbench${qs ? '?' + qs : ''}`);
  } catch (e) {
    return { success: false, totalCount: 0, items: [],
             summary: { totalCost: 0, totalDeprnReserve: 0, totalNbv: 0, totalDeprnAmount: 0 },
             error: e instanceof Error ? e.message : 'Unknown error' };
  }
};

// ── Write operations ──────────────────────────────────────────────────────────

export const createAsset = async (payload: any): Promise<{ success: boolean; assetId?: string; assetNumber?: string; message?: string; error?: string }> => {
  try { return await insertToApex('fa/assets', payload); }
  catch (e) { return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }; }
};

export const retireAsset = async (assetId: string, payload: any): Promise<{ success: boolean; message?: string; gainLoss?: string; error?: string }> => {
  try { return await putToApex(`fa/assets/${assetId}/retire`, payload); }
  catch (e) { return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }; }
};

export const adjustAsset = async (assetId: string, payload: any): Promise<{ success: boolean; message?: string; newCost?: string; error?: string }> => {
  try { return await putToApex(`fa/assets/${assetId}/adjust`, payload); }
  catch (e) { return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }; }
};

// ── Formatting helpers ────────────────────────────────────────────────────────

export const formatCurrency = (value: string | number, decimals = 2): string => {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
};

export const assetTypeLabel = (type: string): string =>
  ({ CAPITALIZED: 'Capitalized', CIP: 'CIP', EXPENSED: 'Expensed' }[type] || type || '—');

export const assetStatusColor = (retiredFlag: string): string =>
  retiredFlag === 'YES' ? '#cf1322' : '#1D7B4D';

export const assetStatusLabel = (retiredFlag: string): string =>
  retiredFlag === 'YES' ? 'Retired' : 'Active';
