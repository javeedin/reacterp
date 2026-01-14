import { PROXY_CONFIG, ORACLE_SOAP_CONFIG, APEX_DB_CONFIG } from '../config/api.config';

// Types
export interface GLBalancesSyncProgress {
  status: 'idle' | 'fetching' | 'parsing' | 'inserting' | 'completed' | 'error' | 'stopped';
  totalRecords: number;
  processedRecords: number;
  insertedRecords: number;
  updatedRecords: number;
  errors: number;
  lastError: string;
  startTime: Date | null;
  endTime: Date | null;
}

export interface GLBalanceRecord {
  period_type: string | null;
  period_name: string;
  actual_flag: string;
  period_year: string;
  period_num: string;
  ledger_id: string;
  company: string;
  lob: string;
  department: string;
  account: string;
  account_desc: string;
  sub_account: string;
  analysis: string;
  intercompany: string;
  future1: string | null;
  future2: string | null;
  account_type: string;
  currency: string;
  opening_balance: number;
  period_activity: number | null;
  closing_balance: number;
  debit: number;
  credit: number;
  currency_code: string | null;
}

export type LogCallback = (type: 'info' | 'success' | 'error' | 'warning' | 'step', message: string) => void;
export type ProgressCallback = (progress: Partial<GLBalancesSyncProgress>) => void;
export type BalancePayloadCallback = (batchNum: number, payload: GLBalanceRecord[], result?: unknown, error?: string) => void;

// Build SOAP envelope for BI Publisher report
const buildSoapEnvelope = (
  reportPath: string,
  parameters: Record<string, string>,
  username: string,
  password: string
): string => {
  // Build parameter XML
  const paramXml = Object.entries(parameters)
    .filter(([key]) => key !== 'environment') // Skip environment parameter
    .map(([key, value]) => `
            <v2:item>
              <v2:name>${key}</v2:name>
              <v2:values><v2:item>${value}</v2:item></v2:values>
            </v2:item>`)
    .join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v2="http://xmlns.oracle.com/oxp/service/v2">
  <soapenv:Header/>
  <soapenv:Body>
    <v2:runReport>
      <v2:reportRequest>
        <v2:reportAbsolutePath>${reportPath}</v2:reportAbsolutePath>
        <v2:parameterNameValues>
          <v2:listOfParamNameValues>${paramXml}
          </v2:listOfParamNameValues>
        </v2:parameterNameValues>
        <v2:reportData/>
        <v2:reportOutputPath/>
      </v2:reportRequest>
      <v2:userID>${username}</v2:userID>
      <v2:password>${password}</v2:password>
    </v2:runReport>
  </soapenv:Body>
</soapenv:Envelope>`;
};

// Parse XML and extract GL Balance records
const parseGLBalancesXml = (xmlString: string): GLBalanceRecord[] => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

  // Check for parse errors
  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error('XML Parse Error: ' + parseError.textContent);
  }

  const records: GLBalanceRecord[] = [];

  // Find all G_1 elements (each represents a balance record)
  const g1Elements = xmlDoc.querySelectorAll('G_1');

  g1Elements.forEach((g1) => {
    const getText = (tagName: string): string => {
      const el = g1.querySelector(tagName);
      return el?.textContent?.trim() || '';
    };

    const getNumber = (tagName: string): number => {
      const text = getText(tagName);
      const num = parseFloat(text);
      return isNaN(num) ? 0 : num;
    };

    const record: GLBalanceRecord = {
      period_type: getText('PERIOD_TYPE') || null,
      period_name: getText('PERIOD_NAME'),
      actual_flag: getText('ACTUAL_FLAG') || 'A',
      period_year: getText('PERIOD_YEAR'),
      period_num: getText('PERIOD_NO'),
      ledger_id: getText('LEDGER_ID'),
      company: getText('COMPANY'),
      lob: getText('LOB'),
      department: getText('DEPARTMENT'),
      account: getText('ACCOUNT'),
      account_desc: getText('ACCOUNT_DESCRIPTION'),
      sub_account: getText('SUB_ACCOUNT'),
      analysis: getText('ANALYSIS'),
      intercompany: getText('INTERCOMPANY'),
      future1: getText('FUTURE1') || null,
      future2: getText('FUTURE2') || null,
      account_type: getText('ACCOUNT_TYPE'),
      currency: getText('CURRENCY'),
      opening_balance: getNumber('OPENING'),
      period_activity: getNumber('PERIOD_ACTIVITY') || null,
      closing_balance: getNumber('CLOSING'),
      debit: getNumber('DEBIT'),
      credit: getNumber('CREDIT'),
      currency_code: getText('CURRENCY_CODE') || null,
    };

    records.push(record);
  });

  return records;
};

// Test SOAP connection
export const testGLBalancesConnection = async (
  parameters: Record<string, string>,
  log?: LogCallback
): Promise<{ success: boolean; error?: string }> => {
  log?.('info', 'Testing GL Balances SOAP connection...');

  const environment = (parameters.environment || 'prod') as 'prod' | 'test';
  const config = ORACLE_SOAP_CONFIG[environment];

  log?.('info', `Environment: ${environment}`);
  log?.('info', `SOAP URL: ${config.baseUrl}`);

  try {
    // Build a test request with minimal data
    const soapEnvelope = buildSoapEnvelope(
      ORACLE_SOAP_CONFIG.reports.glBalances,
      parameters,
      config.username,
      config.password
    );

    log?.('info', 'Testing via proxy server...');

    const response = await fetch(`${PROXY_CONFIG.baseUrl}/soap/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: config.baseUrl,
        envelope: soapEnvelope,
      }),
    });

    const result = await response.json();

    if (result.success) {
      log?.('success', 'SOAP connection successful!');
      return { success: true };
    } else {
      log?.('error', `SOAP connection failed: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `Connection test failed: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
};

// Main sync function
export const syncGLBalances = async (
  parameters: Record<string, string>,
  testMode: boolean | 'single' = true,
  log?: LogCallback,
  onProgress?: ProgressCallback,
  abortSignal?: AbortSignal,
  onPayload?: BalancePayloadCallback,
  verboseConsole: boolean = false
): Promise<GLBalancesSyncProgress> => {
  const progress: GLBalancesSyncProgress = {
    status: 'idle',
    totalRecords: 0,
    processedRecords: 0,
    insertedRecords: 0,
    updatedRecords: 0,
    errors: 0,
    lastError: '',
    startTime: new Date(),
    endTime: null,
  };

  const updateProgress = (updates: Partial<GLBalancesSyncProgress>) => {
    Object.assign(progress, updates);
    onProgress?.(progress);
  };

  try {
    // ========================================
    // STEP 1: Build and send SOAP request
    // ========================================
    updateProgress({ status: 'fetching' });
    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('step', '  STEP 1: Fetching GL Balances from Oracle BI Publisher');
    log?.('step', '═══════════════════════════════════════════════════════════');

    const environment = (parameters.environment || 'prod') as 'prod' | 'test';
    const config = ORACLE_SOAP_CONFIG[environment];

    log?.('info', `Environment: ${environment}`);
    log?.('info', `Report: ${ORACLE_SOAP_CONFIG.reports.glBalances}`);
    log?.('info', `Period: ${parameters.P_PERIOD_NAME}`);

    const soapEnvelope = buildSoapEnvelope(
      ORACLE_SOAP_CONFIG.reports.glBalances,
      parameters,
      config.username,
      config.password
    );

    if (verboseConsole) {
      console.log('=== SOAP REQUEST ===');
      console.log('URL:', config.baseUrl);
      console.log('Envelope:', soapEnvelope.substring(0, 500) + '...');
    }

    log?.('info', 'Sending SOAP request to proxy...');

    if (abortSignal?.aborted) {
      updateProgress({ status: 'stopped' });
      log?.('warning', 'Sync stopped by user');
      return progress;
    }

    const startTime = Date.now();
    const response = await fetch(`${PROXY_CONFIG.baseUrl}/soap/bip-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: config.baseUrl,
        envelope: soapEnvelope,
      }),
    });

    const duration = Date.now() - startTime;
    const result = await response.json();

    if (!result.success) {
      log?.('error', `SOAP request failed: ${result.error}`);
      updateProgress({ status: 'error', lastError: result.error });
      return progress;
    }

    log?.('success', `SOAP response received in ${duration}ms`);

    // ========================================
    // STEP 2: Parse XML response
    // ========================================
    updateProgress({ status: 'parsing' });
    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('step', '  STEP 2: Parsing XML Response');
    log?.('step', '═══════════════════════════════════════════════════════════');

    if (abortSignal?.aborted) {
      updateProgress({ status: 'stopped' });
      log?.('warning', 'Sync stopped by user');
      return progress;
    }

    const decodedXml = result.decodedXml;

    if (!decodedXml) {
      log?.('error', 'No XML data in response');
      updateProgress({ status: 'error', lastError: 'No XML data in response' });
      return progress;
    }

    log?.('info', `Decoded XML length: ${decodedXml.length} characters`);

    // Parse XML to records
    const records = parseGLBalancesXml(decodedXml);

    log?.('success', `Parsed ${records.length} GL Balance records`);
    updateProgress({ totalRecords: records.length });

    if (records.length === 0) {
      log?.('warning', 'No records found in response');
      updateProgress({ status: 'completed', endTime: new Date() });
      return progress;
    }

    // Apply test mode limits
    let recordsToProcess = records;
    if (testMode === 'single') {
      recordsToProcess = records.slice(0, 1);
      log?.('info', `SINGLE RECORD MODE: Processing 1 of ${records.length} records`);
    } else if (testMode === true) {
      recordsToProcess = records.slice(0, 25);
      log?.('info', `TEST MODE: Processing ${recordsToProcess.length} of ${records.length} records`);
    }

    updateProgress({ totalRecords: recordsToProcess.length });

    // ========================================
    // STEP 3: Insert to APEX
    // ========================================
    updateProgress({ status: 'inserting' });
    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('step', '  STEP 3: Inserting to APEX Database');
    log?.('step', '═══════════════════════════════════════════════════════════');

    const batchSize = 500;
    let batchNum = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    for (let i = 0; i < recordsToProcess.length; i += batchSize) {
      if (abortSignal?.aborted) {
        updateProgress({ status: 'stopped' });
        log?.('warning', 'Sync stopped by user');
        return progress;
      }

      batchNum++;
      const batch = recordsToProcess.slice(i, i + batchSize);

      log?.('info', `Processing batch ${batchNum}: ${batch.length} records (${i + 1}-${i + batch.length} of ${recordsToProcess.length})`);

      try {
        const insertUrl = `${PROXY_CONFIG.baseUrl}/apex/${APEX_DB_CONFIG.endpoints.glBalances}`;

        if (verboseConsole) {
          console.log('=== APEX POST ===');
          console.log('URL:', insertUrl);
          console.log('Records:', batch.length);
        }

        const insertStart = Date.now();
        const insertResponse = await fetch(insertUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ items: batch }),
        });

        const insertDuration = Date.now() - insertStart;
        const insertResult = await insertResponse.json();

        if (verboseConsole) {
          console.log('Response:', insertResult);
        }

        if (insertResult.success) {
          totalInserted += insertResult.inserted || 0;
          totalUpdated += insertResult.updated || 0;
          totalErrors += insertResult.errors || 0;

          log?.('success', `Batch ${batchNum}: Inserted ${insertResult.inserted || 0}, Updated ${insertResult.updated || 0}, Errors ${insertResult.errors || 0} (${insertDuration}ms)`);

          onPayload?.(batchNum, batch, insertResult);
        } else {
          totalErrors += batch.length;
          log?.('error', `Batch ${batchNum} failed: ${insertResult.error}`);
          onPayload?.(batchNum, batch, undefined, insertResult.error);
        }

        updateProgress({
          processedRecords: Math.min(i + batch.length, recordsToProcess.length),
          insertedRecords: totalInserted,
          updatedRecords: totalUpdated,
          errors: totalErrors,
          lastError: insertResult.lastError || '',
        });

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        totalErrors += batch.length;
        log?.('error', `Batch ${batchNum} error: ${errorMsg}`);
        onPayload?.(batchNum, batch, undefined, errorMsg);

        updateProgress({
          errors: totalErrors,
          lastError: errorMsg,
        });
      }
    }

    // ========================================
    // STEP 4: Summary
    // ========================================
    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('step', '  SYNC COMPLETED');
    log?.('step', '═══════════════════════════════════════════════════════════');
    log?.('success', `Total Records: ${recordsToProcess.length}`);
    log?.('success', `Inserted: ${totalInserted}`);
    log?.('success', `Updated: ${totalUpdated}`);
    log?.('info', `Errors: ${totalErrors}`);

    updateProgress({
      status: 'completed',
      endTime: new Date(),
    });

    return progress;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `Sync failed: ${errorMsg}`);
    updateProgress({
      status: 'error',
      lastError: errorMsg,
      endTime: new Date(),
    });
    return progress;
  }
};
