/**
 * sync-http.ts
 * HTTP helpers for Sync services.
 *
 * - Electron: calls Oracle Fusion directly (no CORS restrictions in Electron)
 * - Browser:  routes through the local proxy server to avoid CORS
 */

import { ORACLE_FUSION_CONFIG, ORACLE_SOAP_CONFIG, APEX_DB_CONFIG } from '../config/api.config';

export type LogCallback = (type: 'info' | 'success' | 'error' | 'warning' | 'step', message: string) => void;

// ── Environment detection ──────────────────────────────────────────────────────
const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');
const PROXY_BASE  = 'http://localhost:3001/api';
const FUSION_HOST = 'https://iaaobn.fa.ocs.oraclecloud.com';
const HCM_BASE    = 'https://iaaobn-test.fa.ocs.oraclecloud.com/hcmRestApi/resources/11.13.18.05';

// ── Auth headers (used in Electron only) ─────────────────────────────────────
const oracleAuth = () =>
  `Basic ${btoa(`${ORACLE_FUSION_CONFIG.username}:${ORACLE_FUSION_CONFIG.password}`)}`;

const hcmAuth = () =>
  `Basic ${btoa('javeedindia@gmail.com:Bumeric2026')}`;

// ── Oracle Fusion (standard endpoint) ────────────────────────────────────────

export const fetchFromOracle = async (
  endpoint: string,
  params: Record<string, string> = {},
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const queryParams = new URLSearchParams(params);
    let response: Response;

    if (isElectron) {
      const url = `${ORACLE_FUSION_CONFIG.baseUrl}/${endpoint}?${queryParams.toString()}`;
      if (verbose) { log?.('step', '──── [GET] Oracle Fusion (Electron) ────'); log?.('info', `GET URL: ${url}`); }
      response = await fetch(url, {
        headers: { 'Authorization': oracleAuth(), 'Content-Type': 'application/json', 'Accept': 'application/json' },
      });
    } else {
      const url = `${PROXY_BASE}/oracle/${endpoint}?${queryParams.toString()}`;
      if (verbose) { log?.('step', '──── [GET] Oracle Fusion (proxy) ────'); log?.('info', `GET URL: ${url}`); }
      response = await fetch(url);
    }

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
    let response: Response;

    if (isElectron) {
      if (verbose) { log?.('step', '──── [GET] Oracle Fusion URL (Electron) ────'); log?.('info', `GET URL: ${url}`); }
      response = await fetch(url, {
        headers: { 'Authorization': oracleAuth(), 'Content-Type': 'application/json', 'Accept': 'application/json' },
      });
    } else {
      const proxyUrl = `${PROXY_BASE}/oracle-url?url=${encodeURIComponent(url)}`;
      if (verbose) { log?.('step', '──── [GET] Oracle Fusion URL (proxy) ────'); log?.('info', `Original URL: ${url}`); }
      response = await fetch(proxyUrl);
    }

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

// ── Oracle Fusion (full path) ─────────────────────────────────────────────────

export const fetchFromFusion = async (
  fusionPath: string,
  params: Record<string, string> = {},
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const queryParams = new URLSearchParams(params);
    let response: Response;

    if (isElectron) {
      const url = `${FUSION_HOST}/${fusionPath}?${queryParams.toString()}`;
      if (verbose) { log?.('step', '──── [GET] Oracle Fusion (Electron) ────'); log?.('info', `GET URL: ${url}`); }
      response = await fetch(url, {
        headers: { 'Authorization': oracleAuth(), 'Content-Type': 'application/json', 'Accept': 'application/json' },
      });
    } else {
      const url = `${PROXY_BASE}/fusion/${fusionPath}?${queryParams.toString()}`;
      if (verbose) { log?.('step', '──── [GET] Oracle Fusion (proxy) ────'); log?.('info', `GET URL: ${url}`); }
      response = await fetch(url);
    }

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
    let response: Response;

    if (isElectron) {
      const url = `${HCM_BASE}/${endpoint}?${queryParams.toString()}`;
      if (verbose) { log?.('step', '──── [GET] Oracle HCM (Electron) ────'); log?.('info', `GET URL: ${url}`); }
      response = await fetch(url, {
        headers: { 'Authorization': hcmAuth(), 'Content-Type': 'application/json', 'Accept': 'application/json' },
      });
    } else {
      const url = `${PROXY_BASE}/hcm/${endpoint}?${queryParams.toString()}`;
      if (verbose) { log?.('step', '──── [GET] Oracle HCM (proxy) ────'); log?.('info', `GET URL: ${url}`); }
      response = await fetch(url);
    }

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
    if (isElectron) {
      // In Electron: call SOAP endpoint directly — no CORS restriction
      const startTime = Date.now();
      log?.('info', 'Sending SOAP request (Electron)...');

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '"runReport"' },
        body: envelope,
      });

      const duration = Date.now() - startTime;
      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `SOAP Error: ${response.status} ${response.statusText}`, details: errorText.substring(0, 500) };
      }

      const soapResponse = await response.text();
      const match = soapResponse.match(/<reportBytes[^>]*>([^<]+)<\/reportBytes>/);
      if (!match) return { success: false, error: 'No reportBytes found in SOAP response' };

      const binaryString = atob(match[1].trim());
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      const decodedXml = new TextDecoder('utf-8').decode(bytes);
      const recordCount = (decodedXml.match(/<G_1>/g) || []).length;

      log?.('success', `SOAP decoded — records: ${recordCount}`);
      return { success: true, duration, decodedXml, recordCount };
    } else {
      // In browser: proxy handles the SOAP call and Base64 decode
      log?.('info', 'Sending SOAP request (via proxy)...');
      const response = await fetch(`${PROXY_BASE}/soap/bip-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, envelope }),
      });
      const data = await response.json();
      if (!data.success) return { success: false, error: data.error || 'SOAP request failed', details: data.details };
      log?.('success', `SOAP decoded — records: ${data.recordCount}`);
      return { success: true, duration: data.duration, decodedXml: data.decodedXml, recordCount: data.recordCount };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `SOAP Error: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
};
