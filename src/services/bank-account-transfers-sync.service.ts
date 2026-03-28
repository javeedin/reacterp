import { fetchFromOracle, insertToApex } from './sync-http';

// Types
export interface BankAccountTransfersSyncProgress {
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
export type ProgressCallback = (progress: Partial<BankAccountTransfersSyncProgress>) => void;
export type BankAccountTransfersPayloadCallback = (
  transferId: number,
  transferNumber: number,
  payload: any,
  result?: any,
  error?: string
) => void;

// Test connection to Oracle Fusion cashBankAccountTransfers endpoint
export const testBankAccountTransfersConnection = async (log: LogCallback): Promise<boolean> => {
  try {
    log('info', 'Testing Bank Account Transfers endpoint...');

    const result = await fetchFromOracle(
      'cashBankAccountTransfers',
      { limit: '1' },
      log,
      true
    );

    if (result.success && result.items) {
      log('success', `Connection successful! Sample: ${JSON.stringify(result.items[0])}`);
      return true;
    } else {
      log('error', 'Connection failed: No data returned');
      return false;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log('error', `Connection test failed: ${errorMsg}`);
    return false;
  }
};

// Main sync function for Bank Account Transfers
export const syncBankAccountTransfers = async (
  parameters: Record<string, string>,
  testMode: boolean | 'single',
  log: LogCallback,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
  onPayload?: BankAccountTransfersPayloadCallback
): Promise<BankAccountTransfersSyncProgress> => {
  const progress: BankAccountTransfersSyncProgress = {
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

  let pageLimit: number;
  let maxRecords: number | null;
  if (testMode === 'single') {
    pageLimit = 1;
    maxRecords = 1;
  } else if (testMode === true) {
    pageLimit = 25;
    maxRecords = 25;
  } else {
    pageLimit = 500;
    maxRecords = null;
  }

  const modeLabel = testMode === 'single'
    ? 'SINGLE RECORD DEBUG'
    : testMode ? 'TEST MODE (25 records)' : 'FULL SYNC (all records)';

  log('step', '═══════════════════════════════════════════════════════════');
  log('step', `  BANK ACCOUNT TRANSFERS SYNC - ${modeLabel}`);
  log('step', '═══════════════════════════════════════════════════════════');

  try {
    let allRecords: any[] = [];
    let offset = 0;
    let hasMore = true;
    let pageNum = 0;

    // Build query params from parameters (e.g. TransactionDateFrom, TransactionDateTo, BusinessUnit)
    const buildQueryParams = (limit: number, off: number): Record<string, string> => {
      const p: Record<string, string> = { limit: String(limit), offset: String(off) };
      if (parameters.TransactionDateFrom) p['q'] = `TransactionDate>="${parameters.TransactionDateFrom}"`;
      if (parameters.TransactionDateFrom && parameters.TransactionDateTo) {
        p['q'] = `TransactionDate>="${parameters.TransactionDateFrom}";TransactionDate<="${parameters.TransactionDateTo}"`;
      }
      if (parameters.Status) p['q'] = (p['q'] ? p['q'] + ';' : '') + `Status="${parameters.Status}"`;
      if (parameters.BusinessUnit) p['q'] = (p['q'] ? p['q'] + ';' : '') + `Businessunit="${parameters.BusinessUnit}"`;
      return p;
    };

    // Fetch with pagination
    while (hasMore && (maxRecords === null || allRecords.length < maxRecords)) {
      if (signal?.aborted) {
        log('warning', 'Sync aborted by user');
        progress.status = 'stopped';
        progress.endTime = new Date();
        onProgress(progress);
        return progress;
      }

      pageNum++;
      const fetchLimit = maxRecords !== null
        ? Math.min(pageLimit, maxRecords - allRecords.length)
        : pageLimit;

      log('info', '');
      log('step', `──── Fetching Page ${pageNum} (offset: ${offset}, limit: ${fetchLimit}) ────`);

      const result = await fetchFromOracle(
        'cashBankAccountTransfers',
        buildQueryParams(fetchLimit, offset),
        log,
        true
      );

      if (!result.success || !result.items) {
        throw new Error(result.error || 'Failed to fetch bank account transfers');
      }

      const items = result.items;
      allRecords = [...allRecords, ...items];

      log('success', `Fetched ${items.length} records (Total: ${allRecords.length})`);

      hasMore = items.length === fetchLimit;
      offset += items.length;

      if (maxRecords !== null && allRecords.length >= maxRecords) hasMore = false;

      progress.currentPage = pageNum;
      progress.totalRecords = allRecords.length;
      onProgress(progress);
    }

    progress.totalRecords = allRecords.length;
    progress.totalPages = pageNum;
    log('success', `Total records fetched: ${allRecords.length}`);

    if (allRecords.length === 0) {
      log('warning', 'No records to sync');
      progress.status = 'completed';
      progress.endTime = new Date();
      onProgress(progress);
      return progress;
    }

    // Insert to APEX
    log('info', '');
    log('step', '══════════════════════════════════════════════════════════');
    log('step', '  INSERTING TO APEX DATABASE');
    log('step', '══════════════════════════════════════════════════════════');

    progress.status = 'inserting';
    onProgress(progress);

    const batchSize = 50;
    const totalBatches = Math.ceil(allRecords.length / batchSize);

    for (let i = 0; i < allRecords.length; i += batchSize) {
      if (signal?.aborted) {
        log('warning', 'Sync aborted by user');
        progress.status = 'stopped';
        progress.endTime = new Date();
        onProgress(progress);
        return progress;
      }

      const batch = allRecords.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;

      log('info', '');
      log('step', `──── POST Batch ${batchNum}/${totalBatches} (${batch.length} records) ────`);

      const payload = {
        items: batch.map(item => ({
          BankAccountTransferId:     item.BankAccountTransferId,
          BankAccountTransferNumber: item.BankAccountTransferNumber,
          TransactionDate:           item.TransactionDate,
          Memo:                      item.Memo,
          PaymentRequestId:          item.PaymentRequestId,
          PaymentAmount:             item.PaymentAmount,
          FromAmount:                item.FromAmount,
          FromExternalTrxId:         item.FromExternalTrxId,
          ToExternalTrxId:           item.ToExternalTrxId,
          ConversionRate:            item.ConversionRate,
          FromBankAccountName:       item.FromBankAccountName,
          ToBankAccountName:         item.ToBankAccountName,
          FromCurrencyCode:          item.FromCurrencyCode,
          ToCurrencyCode:            item.ToCurrencyCode,
          PaymentCurrencyCode:       item.PaymentCurrencyCode,
          ConversionRateType:        item.ConversionRateType,
          Status:                    item.Status,
          PaymentStatus:             item.PaymentStatus,
          PaymentMethod:             item.PaymentMethod,
          PaymentProfileName:        item.PaymentProfileName,
          Businessunit:              item.Businessunit,
          PaymentFile:               item.PaymentFile,
          IsSettledWithIbyFlag:      item.IsSettledWithIbyFlag,
          CreatedBy:                 item.CreatedBy,
          CreationDate:              item.CreationDate,
          LastUpdatedBy:             item.LastUpdatedBy,
          LastUpdateDate:            item.LastUpdateDate,
          LastUpdateLogin:           item.LastUpdateLogin,
        })),
      };

      try {
        const result = await insertToApex('cash/banktransfers', payload, log, true);

        if (result.status === 'success') {
          const inserted = result.count || batch.length;
          progress.insertedRecords += inserted;
          log('success', `Batch ${batchNum} inserted: ${inserted} records`);

          if (onPayload) {
            batch.forEach(item => {
              onPayload(item.BankAccountTransferId, item.BankAccountTransferNumber, item, result);
            });
          }
        } else {
          progress.errors++;
          progress.lastError = result.message || 'Insert failed';
          log('error', `Batch ${batchNum} failed: ${result.message || JSON.stringify(result)}`);

          if (onPayload) {
            batch.forEach(item => {
              onPayload(item.BankAccountTransferId, item.BankAccountTransferNumber, item, result, result.message);
            });
          }
        }
      } catch (error) {
        progress.errors++;
        progress.lastError = error instanceof Error ? error.message : 'Unknown error';
        log('error', `Batch ${batchNum} error: ${progress.lastError}`);

        if (onPayload) {
          batch.forEach(item => {
            onPayload(item.BankAccountTransferId, item.BankAccountTransferNumber, item, undefined, progress.lastError);
          });
        }
      }

      progress.processedRecords = i + batch.length;
      onProgress(progress);
    }

    progress.status = 'completed';
    progress.endTime = new Date();
    onProgress(progress);

    log('info', '');
    log('step', '═══════════════════════════════════════════════════════════');
    log('success', '  SYNC COMPLETED');
    log('success', `    Total Records: ${progress.totalRecords}`);
    log('success', `    Inserted:      ${progress.insertedRecords}`);
    log('success', `    Errors:        ${progress.errors}`);
    log('step', '═══════════════════════════════════════════════════════════');

    return progress;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    progress.status = 'error';
    progress.lastError = errorMsg;
    progress.endTime = new Date();
    onProgress(progress);

    log('error', '');
    log('error', '═══════════════════════════════════════════════════════════');
    log('error', `  SYNC FAILED: ${errorMsg}`);
    log('error', '═══════════════════════════════════════════════════════════');

    return progress;
  }
};
