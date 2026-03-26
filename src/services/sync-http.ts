/**
 * sync-http.ts
 * Direct HTTP helpers for Sync services — no local proxy server required.
 * All calls go directly to Oracle Fusion and APEX cloud APIs.
 */

import { ORACLE_FUSION_CONFIG, ORACLE_SOAP_CONFIG, APEX_DB_CONFIG } from '../config/api.config';

export type LogCallback = (type: 'info' | 'success' | 'error' | 'warning' | 'step', message: string) => void;

// ── Auth headers ──────────────────────────────────────────────────────────────

const oracleAuth = () =>
  `Basic ${btoa(`${ORACLE_FUSION_CONFIG.username}:${ORACLE_FUSION_CONFIG.password}`)}`;

// HCM uses test environment credentials
const hcmAuth = () =>
  `Basic ${btoa('javeedindia@gmail.com:Bumeric2026')}`;

const HCM_BASE_URL = 'https://iaaobn-test.fa.ocs.oraclecloud.com/hcmRestApi/resources/11.13.18.05';
const FUSION_HOST   = 'https://iaaobn.fa.ocs.oraclecloud.com';

// ── Oracle Fusion (standard endpoint) ────────────────────────────────────────

export const fetchFromOracle = async (
  endpoint: string,
  params: Record<string, string> = {},
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const queryParams = new URLSearchParams(params);
    const url = `${ORACLE_FUSION_CONFIG.baseUrl}/${endpoint}?${queryParams.toString()}`;

    if (verbose) {
      log?.('step', '──── [GET] Oracle Fusion ────');
      log?.('info', `GET URL: ${url}`);
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': oracleAuth(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Oracle API Error: ${response.status} ${response.statusText} — ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    if (verbose) log?.('success', `GET Response: ${data.items?.length || 0} records`);
    return { success: true, ...data };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `GET Error: ${errorMsg}`);
    throw error;
  }
};

// ── Oracle Fusion (full URL) ──────────────────────────────────────────────────

export const fetchFromOracleUrl = async (
  url: string,
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    if (verbose) {
      log?.('step', '──── [GET] Oracle Fusion ────');
      log?.('info', `GET URL: ${url}`);
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': oracleAuth(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Oracle API Error: ${response.status} ${response.statusText} — ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    if (verbose) log?.('success', `GET Response: ${data.items?.length || 0} records`);
    return { success: true, ...data };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `GET Error: ${errorMsg}`);
    throw error;
  }
};

// ── Oracle Fusion (full path, e.g. fscmRestApi/resources/.../suppliers) ───────

export const fetchFromFusion = async (
  fusionPath: string,
  params: Record<string, string> = {},
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const queryParams = new URLSearchParams(params);
    const url = `${FUSION_HOST}/${fusionPath}?${queryParams.toString()}`;

    if (verbose) {
      log?.('step', '──── [GET] Oracle Fusion ────');
      log?.('info', `GET URL: ${url}`);
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': oracleAuth(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Fusion API Error: ${response.status} ${response.statusText} — ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    if (verbose) log?.('success', `GET Response: ${data.items?.length || 0} records`);
    return { success: true, items: data.items || [], hasMore: data.hasMore, count: data.count };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `GET Error: ${errorMsg}`);
    throw error;
  }
};

// ── Oracle HCM (test environment) ────────────────────────────────────────────

export const fetchFromHcm = async (
  endpoint: string,
  params: Record<string, string> = {},
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const queryParams = new URLSearchParams(params);
    const url = `${HCM_BASE_URL}/${endpoint}?${queryParams.toString()}`;

    if (verbose) {
      log?.('step', '──── [GET] Oracle HCM (Test) ────');
      log?.('info', `GET URL: ${url}`);
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': hcmAuth(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HCM API Error: ${response.status} ${response.statusText} — ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    if (verbose) log?.('success', `GET Response: ${data.items?.length || 0} records`);
    return { success: true, items: data.items || [], hasMore: data.hasMore, count: data.count };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `GET Error: ${errorMsg}`);
    throw error;
  }
};

// ── APEX POST ─────────────────────────────────────────────────────────────────

export const insertToApex = async (
  endpoint: string,
  payload: any,
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const url = `${APEX_DB_CONFIG.baseUrl}/${endpoint}`;

    if (verbose) {
      log?.('step', '──── [POST] APEX Database ────');
      log?.('info', `APEX URL: ${url}`);
      log?.('info', `POST Payload: ${JSON.stringify(payload).substring(0, 200)}`);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (verbose) log?.('success', `POST Response: ${JSON.stringify(data).substring(0, 200)}`);
    return data;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `POST Error: ${errorMsg}`);
    throw error;
  }
};

// ── APEX GET ──────────────────────────────────────────────────────────────────

export const fetchFromApex = async (
  endpoint: string,
  params: Record<string, string> = {},
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const queryParams = new URLSearchParams(params);
    const url = `${APEX_DB_CONFIG.baseUrl}/${endpoint}?${queryParams.toString()}`;

    if (verbose) {
      log?.('step', '──── [GET] APEX Database ────');
      log?.('info', `APEX URL: ${url}`);
    }

    const response = await fetch(url);
    const data = await response.json();
    if (verbose) log?.('success', `GET Response: ${data.items?.length || 0} items`);
    return data;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `GET Error: ${errorMsg}`);
    throw error;
  }
};

// ── SOAP — Oracle BI Publisher ────────────────────────────────────────────────

export const callSoapBip = async (
  url: string,
  envelope: string,
  log?: LogCallback
): Promise<{ success: boolean; decodedXml?: string; recordCount?: number; duration?: number; error?: string; details?: string }> => {
  try {
    const startTime = Date.now();
    log?.('info', 'Sending SOAP request...');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"runReport"',
      },
      body: envelope,
    });

    const duration = Date.now() - startTime;
    log?.('info', `Response received in ${duration}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `SOAP Error: ${response.status} ${response.statusText}`, details: errorText.substring(0, 500) };
    }

    const soapResponse = await response.text();

    const reportBytesMatch = soapResponse.match(/<reportBytes[^>]*>([^<]+)<\/reportBytes>/);
    if (!reportBytesMatch || !reportBytesMatch[1]) {
      return { success: false, error: 'No reportBytes found in SOAP response' };
    }

    const base64Content = reportBytesMatch[1].trim();

    // Browser-safe Base64 decode (equivalent to Node Buffer.from(b64,'base64').toString('utf-8'))
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const decodedXml = new TextDecoder('utf-8').decode(bytes);

    const recordCount = (decodedXml.match(/<G_1>/g) || []).length;
    log?.('success', `SOAP decoded — records: ${recordCount}`);

    return { success: true, duration, decodedXml, recordCount };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `SOAP Error: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
};
