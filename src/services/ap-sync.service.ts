import { PROXY_CONFIG, ORACLE_FUSION_CONFIG, APEX_DB_CONFIG } from '../config/api.config';

// Types
export interface APInvoice {
  InvoiceId: number;
  InvoiceNumber: string;
  InvoiceCurrency: string;
  PaymentCurrency: string;
  InvoiceAmount: number;
  InvoiceDate: string;
  BusinessUnit: string;
  LegalEntity: string;
  LegalEntityIdentifier: string;
  Supplier: string;
  SupplierNumber: string;
  SupplierSite: string;
  SupplierTaxRegistrationNumber: string;
  SupplierIBAN: string;
  Party: string;
  PartySite: string;
  ProcurementBU: string;
  PurchaseOrderNumber: string;
  RequesterId: number;
  Requester: string;
  InvoiceGroup: string;
  InvoiceSourceCode: string;
  InvoiceSource: string;
  InvoiceType: string;
  Description: string;
  ConversionRateType: string;
  ConversionDate: string;
  ConversionRate: number;
  BaseAmount: number;
  AccountingDate: string;
  TermsDate: string;
  GoodsReceivedDate: string;
  InvoiceReceivedDate: string;
  ApplyAfterDate: string;
  BudgetDate: string;
  PayGroup: string;
  PaymentTerms: string;
  PaymentMethodCode: string;
  PaymentMethod: string;
  PayAloneFlag: string;
  AmountPaid: number;
  ControlAmount: number;
  PaymentReasonCode: string;
  PaymentReason: string;
  PaymentReasonComments: string;
  RemittanceMessageOne: string;
  RemittanceMessageTwo: string;
  RemittanceMessageThree: string;
  UniqueRemittanceIdentifier: string;
  UniqueRemittanceIdCheckDigit: string;
  DeliveryChannelCode: string;
  DeliveryChannel: string;
  FirstPartyTaxRegistrationId: number;
  FirstPartyTaxRegistrationNum: string;
  TaxationCountry: string;
  DocFiscalClassificationCodePath: string;
  LiabilityDistribution: string;
  DocumentCategory: string;
  DocumentSequence: number;
  VoucherNumber: string;
  ValidationStatus: string;
  ApprovalStatus: string;
  PaidStatus: string;
  AccountingStatus: string;
  AccountCodingStatus: string;
  FundsStatus: string;
  CanceledFlag: string;
  CanceledDate: string;
  CanceledBy: string;
  BankAccount: string;
  ExternalBankAccountId: number;
  BankChargeBearer: string;
  SettlementPriority: string;
  DigitalPaymentAccount: string;
  RoutingAttribute1: string;
  RoutingAttribute2: string;
  RoutingAttribute3: string;
  RoutingAttribute4: string;
  RoutingAttribute5: string;
  ReferenceKeyOne: string;
  ReferenceKeyTwo: string;
  ReferenceKeyThree: string;
  ReferenceKeyFour: string;
  ReferenceKeyFive: string;
  ProductTable: string;
  ImageDocumentNumber: string;
  CreatedBy: string;
  CreationDate: string;
  LastUpdatedBy: string;
  LastUpdateDate: string;
  LastUpdateLogin: string;
}

export interface APSyncProgress {
  status: 'idle' | 'fetching' | 'inserting' | 'completed' | 'error' | 'stopped';
  totalInvoices: number;
  processedInvoices: number;
  insertedInvoices: number;
  errors: number;
  lastError: string;
  startTime: Date | null;
  endTime: Date | null;
}

export type LogCallback = (type: 'info' | 'success' | 'error' | 'warning' | 'step', message: string) => void;
export type ProgressCallback = (progress: Partial<APSyncProgress>) => void;

// Fetch invoices from Oracle Fusion via proxy
const fetchInvoicesFromOracle = async (
  params: Record<string, string> = {},
  log?: LogCallback,
  verbose = true
): Promise<{ success: boolean; items: APInvoice[]; hasMore: boolean; totalResults?: number; error?: string }> => {
  try {
    const queryParams = new URLSearchParams(params);
    const proxyUrl = `${PROXY_CONFIG.baseUrl}/oracle/invoices?${queryParams.toString()}`;
    const oracleUrl = `${ORACLE_FUSION_CONFIG.baseUrl}/invoices?${queryParams.toString()}`;

    if (verbose) {
      log?.('step', '──── [GET] Oracle Fusion AP Invoices ────');
      log?.('info', `Oracle URL: ${oracleUrl}`);
      log?.('info', `Proxy URL: ${proxyUrl}`);
    }

    const response = await fetch(proxyUrl);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Fetch failed');
    }

    if (verbose) {
      log?.('success', `Fetched ${data.items?.length || 0} invoices`);
    }

    return {
      success: true,
      items: data.items || [],
      hasMore: data.hasMore || false,
      totalResults: data.totalResults || data.count,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `Fetch Error: ${errorMsg}`);
    return { success: false, items: [], hasMore: false, error: errorMsg };
  }
};

// Insert invoices to APEX via proxy (bulk)
const insertInvoicesToApex = async (
  invoices: APInvoice[],
  log?: LogCallback,
  verbose = true
): Promise<{ success: boolean; successCount?: number; errorCount?: number; error?: string }> => {
  try {
    const url = `${PROXY_CONFIG.baseUrl}/apex/${APEX_DB_CONFIG.endpoints.apInvoicesBulk}`;
    const apexUrl = `${APEX_DB_CONFIG.baseUrl}/${APEX_DB_CONFIG.endpoints.apInvoicesBulk}`;

    const payload = { items: invoices };

    if (verbose) {
      log?.('step', '──── [POST] APEX Database - AP Invoices Bulk ────');
      log?.('info', `APEX URL: ${apexUrl}`);
      log?.('info', `Proxy URL: ${url}`);
      log?.('info', `Payload: ${invoices.length} invoices`);
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

    return {
      success: data.status === 'SUCCESS' || data.status === 'PARTIAL',
      successCount: data.successCount,
      errorCount: data.errorCount,
      error: data.message,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `POST Error: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
};

// Insert single invoice to APEX via proxy
const insertSingleInvoiceToApex = async (
  invoice: APInvoice,
  log?: LogCallback,
  verbose = true
): Promise<{ success: boolean; error?: string }> => {
  try {
    const url = `${PROXY_CONFIG.baseUrl}/apex/${APEX_DB_CONFIG.endpoints.apInvoices}`;
    const apexUrl = `${APEX_DB_CONFIG.baseUrl}/${APEX_DB_CONFIG.endpoints.apInvoices}`;

    if (verbose) {
      log?.('step', '──── [POST] APEX Database - AP Invoice ────');
      log?.('info', `APEX URL: ${apexUrl}`);
      log?.('info', `Invoice: ${invoice.InvoiceNumber}`);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoice),
    });

    const data = await response.json();

    if (verbose) {
      log?.('success', `POST Response: ${JSON.stringify(data)}`);
    }

    return {
      success: data.status === 'SUCCESS',
      error: data.message,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `POST Error: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
};

// Main AP Invoices Sync Function
export const syncAPInvoices = async (
  parameters: Record<string, string>,
  testMode: boolean | 'single' = true,
  log?: LogCallback,
  onProgress?: ProgressCallback,
  abortSignal?: AbortSignal
): Promise<APSyncProgress> => {
  const progress: APSyncProgress = {
    status: 'idle',
    totalInvoices: 0,
    processedInvoices: 0,
    insertedInvoices: 0,
    errors: 0,
    lastError: '',
    startTime: new Date(),
    endTime: null,
  };

  const updateProgress = (updates: Partial<APSyncProgress>) => {
    Object.assign(progress, updates);
    onProgress?.(progress);
  };

  const verbose = testMode !== false;
  const batchSize = 100; // Process invoices in batches of 100

  try {
    // ========================================
    // STEP 1: Fetch Invoices from Oracle Fusion
    // ========================================
    updateProgress({ status: 'fetching' });
    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('step', '  STEP 1: Fetching AP Invoices from Oracle Fusion');
    log?.('step', '═══════════════════════════════════════════════════════════');

    const limit = testMode === 'single'
      ? ORACLE_FUSION_CONFIG.singleRecordLimit
      : (testMode ? ORACLE_FUSION_CONFIG.testLimit : ORACLE_FUSION_CONFIG.defaultLimit);

    const modeLabel = testMode === 'single' ? 'SINGLE RECORD DEBUG' : (testMode ? 'TEST MODE (25 invoices)' : 'FULL SYNC');

    // Build query parameters
    const queryParams: Record<string, string> = {
      limit: limit.toString(),
      offset: '0',
    };

    // Add filter parameters
    const filters = Object.entries(parameters)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${value}`)
      .join(';');

    if (filters) {
      queryParams.q = filters;
    }

    log?.('info', `Parameters: ${JSON.stringify(parameters)}`);
    log?.('info', `Limit: ${limit} invoices (${modeLabel})`);

    let allInvoices: APInvoice[] = [];
    let hasMore = true;
    let offset = 0;

    // Fetch all invoices (with pagination for full sync)
    while (hasMore && !abortSignal?.aborted) {
      queryParams.offset = offset.toString();

      const result = await fetchInvoicesFromOracle(queryParams, log, verbose);

      if (!result.success) {
        updateProgress({
          status: 'error',
          lastError: result.error || 'Failed to fetch invoices',
          endTime: new Date()
        });
        return progress;
      }

      allInvoices = [...allInvoices, ...result.items];
      hasMore = result.hasMore && testMode === false; // Only paginate in full sync mode
      offset += limit;

      if (!verbose && allInvoices.length % 100 === 0) {
        log?.('info', `Fetched ${allInvoices.length} invoices so far...`);
      }
    }

    updateProgress({ totalInvoices: allInvoices.length });
    log?.('success', `Total invoices fetched: ${allInvoices.length}`);

    if (allInvoices.length === 0) {
      updateProgress({ status: 'completed', endTime: new Date() });
      log?.('warning', 'No invoices found for the given parameters');
      return progress;
    }

    // ========================================
    // STEP 2: Insert Invoices to APEX
    // ========================================
    updateProgress({ status: 'inserting' });
    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('step', '  STEP 2: Inserting AP Invoices to APEX Database');
    log?.('step', '═══════════════════════════════════════════════════════════');

    // Process in batches
    for (let i = 0; i < allInvoices.length; i += batchSize) {
      if (abortSignal?.aborted) {
        updateProgress({ status: 'stopped' });
        log?.('warning', 'Sync stopped by user');
        break;
      }

      const batch = allInvoices.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(allInvoices.length / batchSize);

      log?.('info', `Processing batch ${batchNum}/${totalBatches} (${batch.length} invoices)`);

      const insertResult = await insertInvoicesToApex(batch, log, verbose);

      if (insertResult.success) {
        const inserted = insertResult.successCount || batch.length;
        const errors = insertResult.errorCount || 0;

        updateProgress({
          processedInvoices: Math.min(i + batchSize, allInvoices.length),
          insertedInvoices: progress.insertedInvoices + inserted,
          errors: progress.errors + errors,
        });

        log?.('success', `✓ Batch ${batchNum} completed: ${inserted} inserted, ${errors} errors`);
      } else {
        updateProgress({
          processedInvoices: Math.min(i + batchSize, allInvoices.length),
          errors: progress.errors + batch.length,
          lastError: insertResult.error || 'Batch insert failed',
        });

        log?.('error', `✗ Batch ${batchNum} failed: ${insertResult.error}`);
      }

      // Small delay between batches to prevent API throttling
      if (i + batchSize < allInvoices.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
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
    log?.('success', `Total Invoices Processed: ${progress.processedInvoices}`);
    log?.('success', `Total Invoices Inserted: ${progress.insertedInvoices}`);
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

// Test Oracle Fusion connection for AP Invoices
export const testAPConnection = async (log?: LogCallback): Promise<boolean> => {
  try {
    log?.('info', 'Testing Oracle Fusion AP Invoices connection...');

    const result = await fetchInvoicesFromOracle({ limit: '1', offset: '0' }, log);

    if (result.success) {
      log?.('success', 'Oracle Fusion AP connection successful!');
      log?.('info', `Sample data available: ${result.items?.length || 0} invoices`);
      return true;
    }

    log?.('error', 'Connection test failed');
    return false;
  } catch (error) {
    log?.('error', `Connection test error: ${error}`);
    return false;
  }
};

// Get AP Invoice statistics from APEX
export const getAPInvoiceStats = async (log?: LogCallback): Promise<{
  totalInvoices: number;
  validatedCount: number;
  approvedCount: number;
  paidCount: number;
  unpaidCount: number;
  canceledCount: number;
  totalAmount: number;
  totalPaid: number;
  totalOutstanding: number;
  lastSyncDate: string;
} | null> => {
  try {
    const url = `${PROXY_CONFIG.baseUrl}/apex/${APEX_DB_CONFIG.endpoints.apInvoicesStats}`;

    log?.('info', 'Fetching AP Invoice statistics...');

    const response = await fetch(url);
    const data = await response.json();

    if (data.success) {
      log?.('success', 'Statistics retrieved successfully');
      return data.items?.[0] || null;
    }

    log?.('error', `Failed to get statistics: ${data.error}`);
    return null;
  } catch (error) {
    log?.('error', `Stats error: ${error}`);
    return null;
  }
};
