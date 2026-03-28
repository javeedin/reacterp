import { fetchFromOracle, insertToApex } from './sync-http';

export interface ExternalCashTransactionsSyncProgress {
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
export type ProgressCallback = (progress: Partial<ExternalCashTransactionsSyncProgress>) => void;
export type ExternalTxnPayloadCallback = (
  externalTransactionId: number,
  transactionId: number,
  payload: any,
  result?: any,
  error?: string
) => void;

export const testExternalCashTransactionsConnection = async (log: LogCallback): Promise<boolean> => {
  try {
    log('info', 'Testing External Cash Transactions endpoint...');
    const result = await fetchFromOracle('cashExternalTransactions', { limit: '1' }, log, true);
    if (result.success && result.items) {
      log('success', `Connection successful! Sample: ${JSON.stringify(result.items[0])}`);
      return true;
    }
    log('error', 'Connection failed: No data returned');
    return false;
  } catch (error) {
    log('error', `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
};

export const syncExternalCashTransactions = async (
  parameters: Record<string, string>,
  testMode: boolean | 'single',
  log: LogCallback,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
  onPayload?: ExternalTxnPayloadCallback
): Promise<ExternalCashTransactionsSyncProgress> => {
  const BATCH_SIZE   = 50;
  const FETCH_LIMIT  = testMode === 'single' ? 1 : testMode ? 25 : 500;

  const progress: ExternalCashTransactionsSyncProgress = {
    status: 'fetching', totalRecords: 0, processedRecords: 0,
    insertedRecords: 0, currentPage: 0, totalPages: 0,
    errors: 0, lastError: '', startTime: new Date(), endTime: null,
  };

  onProgress({ ...progress });

  const buildQueryParams = (limit: number, offset: number) => {
    const p: Record<string, string> = { limit: String(limit), offset: String(offset) };
    if (parameters.TransactionDateFrom) p['TransactionDateFrom'] = parameters.TransactionDateFrom;
    if (parameters.TransactionDateTo)   p['TransactionDateTo']   = parameters.TransactionDateTo;
    if (parameters.Status)              p['Status']              = parameters.Status;
    if (parameters.BusinessUnit)        p['BusinessUnitName']    = parameters.BusinessUnit;
    if (parameters.BankAccountName)     p['BankAccountName']     = parameters.BankAccountName;
    if (parameters.TransactionType)     p['TransactionType']     = parameters.TransactionType;
    if (parameters.Source)              p['Source']              = parameters.Source;
    return p;
  };

  try {
    // First page to get total count
    log('step', '──── Fetching External Cash Transactions ────');
    const firstPage = await fetchFromOracle('cashExternalTransactions', buildQueryParams(FETCH_LIMIT, 0), log, true);

    if (!firstPage.success || !firstPage.items) {
      throw new Error('No items returned from Oracle');
    }

    const totalCount = firstPage.count ?? firstPage.items.length;
    const totalPages = Math.ceil(totalCount / FETCH_LIMIT);
    progress.totalRecords = totalCount;
    progress.totalPages   = totalPages;
    onProgress({ totalRecords: totalCount, totalPages });

    log('info', `Total external transactions: ${totalCount} | Pages: ${totalPages}`);

    const processPage = async (items: any[]) => {
      if (signal?.aborted) return;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        if (signal?.aborted) break;
        const batch = items.slice(i, i + BATCH_SIZE);
        const payload = {
          items: batch.map(item => ({
            ExternalTransactionId:      item.ExternalTransactionId,
            TransactionId:              item.TransactionId,
            TransactionDate:            item.TransactionDate,
            ValueDate:                  item.ValueDate,
            ClearedDate:                item.ClearedDate,
            Amount:                     item.Amount,
            CurrencyCode:               item.CurrencyCode,
            Description:                item.Description,
            ReferenceText:              item.ReferenceText,
            Source:                     item.Source,
            Status:                     item.Status,
            TransactionType:            item.TransactionType,
            AccountingFlag:             item.AccountingFlag,
            BankAccountName:            item.BankAccountName,
            BusinessUnitName:           item.BusinessUnitName,
            LegalEntityName:            item.LegalEntityName,
            AssetAccountCombination:    item.AssetAccountCombination,
            OffsetAccountCombination:   item.OffsetAccountCombination,
            BankConversionRate:         item.BankConversionRate,
            BankConversionRateType:     item.BankConversionRateType,
            TransferId:                 item.TransferId,
            AccntServicerReference:     item.AccntServicerReference,
            AddendaTxt:                 item.AddendaTxt,
            CheckNumber:                item.CheckNumber,
            ClearingSystemReference:    item.ClearingSystemReference,
            CustomerReference:          item.CustomerReference,
            EndToEndId:                 item.EndToEndId,
            InstructionIdentification:  item.InstructionIdentification,
            ReconReference:             item.ReconReference,
            StructuredPaymentReference: item.StructuredPaymentReference,
            BankTransactionId:          item.BankTransactionId,
            CreatedBy:                  item.CreatedBy,
            CreationDate:               item.CreationDate,
            LastUpdatedBy:              item.LastUpdatedBy,
            LastUpdateDate:             item.LastUpdateDate,
            LastUpdateLogin:            item.LastUpdateLogin,
          })),
        };

        try {
          const result = await insertToApex('cash/externaltransactions', payload, log);
          progress.insertedRecords += batch.length;
          onPayload?.(
            batch[0].ExternalTransactionId,
            batch[0].TransactionId,
            payload,
            result
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          progress.errors++;
          progress.lastError = msg;
          log('error', `Batch insert failed: ${msg}`);
          onPayload?.(batch[0].ExternalTransactionId, batch[0].TransactionId, payload, undefined, msg);
        }

        progress.processedRecords += batch.length;
        onProgress({ ...progress });
      }
    };

    await processPage(firstPage.items);
    if (signal?.aborted) { progress.status = 'stopped'; progress.endTime = new Date(); onProgress({ ...progress }); return progress; }
    if (testMode) { progress.status = 'completed'; progress.endTime = new Date(); onProgress({ ...progress }); return progress; }

    // Remaining pages
    for (let page = 1; page < totalPages; page++) {
      if (signal?.aborted) break;
      progress.currentPage = page + 1;
      onProgress({ currentPage: page + 1 });
      log('step', `──── Page ${page + 1} / ${totalPages} ────`);
      const pageData = await fetchFromOracle('cashExternalTransactions', buildQueryParams(FETCH_LIMIT, page * FETCH_LIMIT), log, false);
      if (pageData.items) await processPage(pageData.items);
    }

    progress.status  = signal?.aborted ? 'stopped' : 'completed';
    progress.endTime = new Date();
    onProgress({ ...progress });
    log('success', `Sync complete — ${progress.insertedRecords} records inserted, ${progress.errors} errors`);
    return progress;

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    progress.status   = 'error';
    progress.lastError = msg;
    progress.endTime  = new Date();
    onProgress({ ...progress });
    log('error', `Sync failed: ${msg}`);
    return progress;
  }
};
