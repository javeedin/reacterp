/**
 * sync-http.ts
 * HTTP helpers for Sync services.
 * Oracle Fusion calls are routed through the local proxy server (localhost:3001)
 * to avoid CORS restrictions. APEX calls go directly (APEX has CORS configured).
 */

import { APEX_DB_CONFIG } from '../config/api.config';

export type LogCallback = (type: 'info' | 'success' | 'error' | 'warning' | 'step', message: string) => void;

// ── Proxy base (Oracle Fusion calls must go through here to avoid CORS) ───────
const PROXY_BASE = 'http://localhost:3001/api';

// ── Oracle Fusion (standard endpoint) ────────────────────────────────────────
// Proxied via GET /api/oracle/:endpoint — proxy adds auth header server-side

export const fetchFromOracle = async (
  endpoint: string,
  params: Record<string, string> = {},
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const queryParams = new URLSearchParams(params);
    const proxyUrl = `${PROXY_BASE}/oracle/${endpoint}?${queryParams.toString()}`;

    if (verbose) {
      log?.('step', '──── [GET] Oracle Fusion (via proxy) ────');
      log?.('info', `GET URL: ${proxyUrl}`);
    }

    const response = await fetch(proxyUrl);

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
// Proxied via GET /api/oracle-url?url=<encoded> — proxy adds auth header

export const fetchFromOracleUrl = async (
  url: string,
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const proxyUrl = `${PROXY_BASE}/oracle-url?url=${encodeURIComponent(url)}`;

    if (verbose) {
      log?.('step', '──── [GET] Oracle Fusion URL (via proxy) ────');
      log?.('info', `Original URL: ${url}`);
    }

    const response = await fetch(proxyUrl);

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
// Proxied via GET /api/fusion/<path> — proxy adds auth header

export const fetchFromFusion = async (
  fusionPath: string,
  params: Record<string, string> = {},
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const queryParams = new URLSearchParams(params);
    const proxyUrl = `${PROXY_BASE}/fusion/${fusionPath}?${queryParams.toString()}`;

    if (verbose) {
      log?.('step', '──── [GET] Oracle Fusion (via proxy) ────');
      log?.('info', `GET URL: ${proxyUrl}`);
    }

    const response = await fetch(proxyUrl);

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
// Proxied via GET /api/hcm/<endpoint> — proxy adds HCM auth header

export const fetchFromHcm = async (
  endpoint: string,
  params: Record<string, string> = {},
  log?: LogCallback,
  verbose = true
): Promise<any> => {
  try {
    const queryParams = new URLSearchParams(params);
    const proxyUrl = `${PROXY_BASE}/hcm/${endpoint}?${queryParams.toString()}`;

    if (verbose) {
      log?.('step', '──── [GET] Oracle HCM (via proxy) ────');
      log?.('info', `GET URL: ${proxyUrl}`);
    }

    const response = await fetch(proxyUrl);

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
// Proxied via POST /api/soap/bip-report — proxy handles auth and Base64 decode

export const callSoapBip = async (
  url: string,
  envelope: string,
  log?: LogCallback
): Promise<{ success: boolean; decodedXml?: string; recordCount?: number; duration?: number; error?: string; details?: string }> => {
  try {
    log?.('info', 'Sending SOAP request via proxy...');

    const response = await fetch(`${PROXY_BASE}/soap/bip-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, envelope }),
    });

    const data = await response.json();

    if (!data.success) {
      return { success: false, error: data.error || 'SOAP request failed', details: data.details };
    }

    log?.('success', `SOAP decoded — records: ${data.recordCount}`);
    return { success: true, duration: data.duration, decodedXml: data.decodedXml, recordCount: data.recordCount };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log?.('error', `SOAP Error: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
};
