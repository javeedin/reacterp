const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Verbose logging - set VERBOSE=true to enable detailed console logs
const VERBOSE = process.env.VERBOSE === 'true';

// Oracle Fusion Configuration
const ORACLE_CONFIG = {
  baseUrl: 'https://iaaobn.fa.ocs.oraclecloud.com/fscmRestApi/resources/11.13.18.05',
  username: 'ratheesh@buimerccorp.com',
  password: 'BCL#261285',
};

// Oracle HCM Configuration (Test environment for User Accounts)
const ORACLE_HCM_CONFIG = {
  baseUrl: 'https://iaaobn-test.fa.ocs.oraclecloud.com/hcmRestApi/resources/11.13.18.05',
  username: 'javeedindia@gmail.com',
  password: 'Bumeric2026',
};

// APEX Database Configuration
const APEX_CONFIG = {
  baseUrl: 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp',
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
  if (VERBOSE) console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get Oracle Auth header
const getOracleAuth = () => {
  const credentials = Buffer.from(`${ORACLE_CONFIG.username}:${ORACLE_CONFIG.password}`).toString('base64');
  return `Basic ${credentials}`;
};

// Get Oracle HCM Auth header
const getOracleHcmAuth = () => {
  const credentials = Buffer.from(`${ORACLE_HCM_CONFIG.username}:${ORACLE_HCM_CONFIG.password}`).toString('base64');
  return `Basic ${credentials}`;
};

// Proxy: Fetch from Oracle Fusion using FULL URL (for child resources)
app.get('/api/oracle-url', async (req, res) => {
  const fullUrl = req.query.url;

  if (!fullUrl) {
    return res.status(400).json({ success: false, error: 'URL parameter required' });
  }

  if (VERBOSE) {
    console.log('=== ORACLE URL PROXY REQUEST ===');
    console.log('Full URL:', fullUrl);
  }

  try {
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Authorization': getOracleAuth(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (VERBOSE) console.log('Oracle Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      if (VERBOSE) console.log('Oracle Error:', errorText.substring(0, 300));
      return res.status(response.status).json({
        success: false,
        error: `Oracle API Error: ${response.status} ${response.statusText}`,
        details: errorText.substring(0, 500),
      });
    }

    const data = await response.json();
    if (VERBOSE) console.log('Oracle Response - Items:', data.items?.length || 0, 'HasMore:', data.hasMore);

    res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    if (VERBOSE) console.error('Oracle URL Proxy Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Proxy: Fetch from Oracle Fusion - single endpoint
app.get('/api/oracle/:endpoint', async (req, res) => {
  const endpoint = req.params.endpoint;
  const queryString = new URLSearchParams(req.query).toString();
  const url = `${ORACLE_CONFIG.baseUrl}/${endpoint}${queryString ? '?' + queryString : ''}`;

  if (VERBOSE) {
    console.log('=== ORACLE PROXY REQUEST ===');
    console.log('Endpoint:', endpoint);
    console.log('Query:', req.query);
    console.log('Full URL:', url);
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': getOracleAuth(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (VERBOSE) console.log('Oracle Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      if (VERBOSE) console.log('Oracle Error:', errorText);
      return res.status(response.status).json({
        success: false,
        error: `Oracle API Error: ${response.status} ${response.statusText}`,
        details: errorText.substring(0, 500),
      });
    }

    const data = await response.json();
    if (VERBOSE) console.log('Oracle Response - Items:', data.items?.length || 0, 'HasMore:', data.hasMore);

    res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    if (VERBOSE) console.error('Oracle Proxy Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Proxy: Fetch from Oracle Fusion - supports nested paths like /fscmRestApi/resources/...
app.get(/^\/api\/fusion\/(.+)$/, async (req, res) => {
  const path = req.params[0]; // Gets everything after /api/fusion/
  const queryString = Object.keys(req.query).length > 0
    ? '?' + new URLSearchParams(req.query).toString()
    : '';

  // Construct URL - the path already includes /fscmRestApi/...
  const url = `https://iaaobn.fa.ocs.oraclecloud.com:443/${path}${queryString}`;

  if (VERBOSE) {
    console.log('=== FUSION PROXY REQUEST ===');
    console.log('Path:', path);
    console.log('Query:', req.query);
    console.log('Full URL:', url);
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': getOracleAuth(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (VERBOSE) console.log('Fusion Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      if (VERBOSE) console.log('Fusion Error:', errorText.substring(0, 300));
      return res.status(response.status).json({
        success: false,
        error: `Fusion API Error: ${response.status} ${response.statusText}`,
        details: errorText.substring(0, 500),
      });
    }

    const data = await response.json();
    if (VERBOSE) console.log('Fusion Response - Items:', data.items?.length || 0, 'HasMore:', data.hasMore);

    res.json(data);
  } catch (error) {
    if (VERBOSE) console.error('Fusion Proxy Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Proxy: Fetch from Oracle HCM (Test environment) - for User Accounts
app.get(/^\/api\/hcm\/(.+)$/, async (req, res) => {
  const path = req.params[0]; // Gets everything after /api/hcm/
  const queryString = Object.keys(req.query).length > 0
    ? '?' + new URLSearchParams(req.query).toString()
    : '';

  // Construct URL using HCM test environment
  const url = `${ORACLE_HCM_CONFIG.baseUrl}/${path}${queryString}`;

  if (VERBOSE) {
    console.log('=== HCM PROXY REQUEST ===');
    console.log('Path:', path);
    console.log('Query:', req.query);
    console.log('Full URL:', url);
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': getOracleHcmAuth(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (VERBOSE) console.log('HCM Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      if (VERBOSE) console.log('HCM Error:', errorText.substring(0, 300));
      return res.status(response.status).json({
        success: false,
        error: `HCM API Error: ${response.status} ${response.statusText}`,
        details: errorText.substring(0, 500),
      });
    }

    const data = await response.json();
    if (VERBOSE) console.log('HCM Response - Items:', data.items?.length || 0, 'HasMore:', data.hasMore);

    res.json(data);
  } catch (error) {
    if (VERBOSE) console.error('HCM Proxy Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Proxy: Fetch from Oracle HCM using FULL URL (for child resources like userAccountRoles)
app.get('/api/hcm-url', async (req, res) => {
  const fullUrl = req.query.url;

  if (!fullUrl) {
    return res.status(400).json({ success: false, error: 'URL parameter required' });
  }

  if (VERBOSE) {
    console.log('=== HCM URL PROXY REQUEST ===');
    console.log('Full URL:', fullUrl);
  }

  try {
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Authorization': getOracleHcmAuth(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (VERBOSE) console.log('HCM URL Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      if (VERBOSE) console.log('HCM URL Error:', errorText.substring(0, 300));
      return res.status(response.status).json({
        success: false,
        error: `HCM API Error: ${response.status} ${response.statusText}`,
        details: errorText.substring(0, 500),
      });
    }

    const data = await response.json();
    if (VERBOSE) console.log('HCM URL Response - Items:', data.items?.length || 0);

    res.json(data);
  } catch (error) {
    if (VERBOSE) console.error('HCM URL Proxy Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Proxy: GET from APEX Database - supports nested paths like ap/createinvoice
app.get(/^\/api\/apex\/(.+)$/, async (req, res) => {
  const path = req.params[0]; // Gets everything after /api/apex/
  const queryString = Object.keys(req.query).length > 0
    ? '?' + new URLSearchParams(req.query).toString()
    : '';
  const url = `${APEX_CONFIG.baseUrl}/${path}${queryString}`;

  if (VERBOSE) {
    console.log('=== APEX GET REQUEST ===');
    console.log('Path:', path);
    console.log('Full URL:', url);
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (VERBOSE) console.log('APEX Response Status:', response.status);

    const responseText = await response.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      data = { rawResponse: responseText.substring(0, 500) };
    }

    if (!response.ok) {
      if (VERBOSE) console.log('APEX Error:', responseText.substring(0, 500));
      return res.status(response.status).json({
        success: false,
        error: `APEX API Error: ${response.status}`,
        details: responseText.substring(0, 500),
      });
    }

    if (VERBOSE) console.log('APEX Success - Items:', data.items?.length || 0);
    res.json(data);
  } catch (error) {
    if (VERBOSE) console.error('APEX GET Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Proxy: Insert to APEX Database - supports nested paths like gl/journals/headers
// Using regex pattern for Express 5 compatibility
app.post(/^\/api\/apex\/(.+)$/, async (req, res) => {
  const path = req.params[0]; // Gets everything after /api/apex/
  const url = `${APEX_CONFIG.baseUrl}/${path}`;

  if (VERBOSE) {
    console.log('=== APEX PROXY REQUEST ===');
    console.log('Path:', path);
    console.log('Full URL:', url);
    console.log('Records:', req.body.items?.length || 0);
    console.log('BatchId:', req.body.batchId);
    console.log('JeHeaderId:', req.body.jeHeaderId);
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (VERBOSE) console.log('APEX Response Status:', response.status);

    const responseText = await response.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      data = { rawResponse: responseText.substring(0, 500) };
    }

    if (!response.ok) {
      if (VERBOSE) console.log('APEX Error:', responseText.substring(0, 500));
      return res.status(response.status).json({
        success: false,
        error: `APEX API Error: ${response.status}`,
        details: responseText.substring(0, 500),
      });
    }

    if (VERBOSE) console.log('APEX Success:', data);
    res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    if (VERBOSE) console.error('APEX Proxy Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Test Oracle connection
app.get('/api/test/oracle', async (req, res) => {
  const url = `${ORACLE_CONFIG.baseUrl}/journalBatches?offset=0&limit=1`;

  if (VERBOSE) {
    console.log('=== TESTING ORACLE CONNECTION ===');
    console.log('URL:', url);
    console.log('User:', ORACLE_CONFIG.username);
  }

  try {
    const startTime = Date.now();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': getOracleAuth(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    const duration = Date.now() - startTime;
    if (VERBOSE) {
      console.log('Response Status:', response.status);
      console.log('Response Time:', duration, 'ms');
    }

    if (!response.ok) {
      const errorText = await response.text();
      if (VERBOSE) console.log('Error:', errorText.substring(0, 300));
      return res.json({
        success: false,
        status: response.status,
        statusText: response.statusText,
        duration,
        error: errorText.substring(0, 300),
      });
    }

    const data = await response.json();
    if (VERBOSE) console.log('Success! Count:', data.count || data.totalResults || data.items?.length);

    res.json({
      success: true,
      status: response.status,
      duration,
      count: data.count || data.totalResults || data.items?.length || 0,
      hasMore: data.hasMore,
      sampleKeys: data.items?.[0] ? Object.keys(data.items[0]) : [],
    });
  } catch (error) {
    if (VERBOSE) console.error('Connection Error:', error.message);
    res.json({
      success: false,
      error: error.message,
    });
  }
});

// Test APEX connection
app.get('/api/test/apex', async (req, res) => {
  const url = `${APEX_CONFIG.baseUrl}/gl/journalbatches`;

  if (VERBOSE) {
    console.log('=== TESTING APEX CONNECTION ===');
    console.log('URL:', url);
  }

  try {
    const startTime = Date.now();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const duration = Date.now() - startTime;
    if (VERBOSE) {
      console.log('Response Status:', response.status);
      console.log('Response Time:', duration, 'ms');
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.substring(0, 200) };
    }

    res.json({
      success: response.ok,
      status: response.status,
      duration,
      data: response.ok ? data : text.substring(0, 300),
    });
  } catch (error) {
    if (VERBOSE) console.error('Connection Error:', error.message);
    res.json({
      success: false,
      error: error.message,
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('ReactERP Proxy Server v1.1.0');
  console.log('='.repeat(50));
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log('  GET  /api/health                - Health check');
  console.log('  GET  /api/test/oracle           - Test Oracle connection');
  console.log('  GET  /api/test/apex             - Test APEX connection');
  console.log('  GET  /api/oracle/:endpoint      - Proxy Oracle requests');
  console.log('  GET  /api/oracle-url?url=...    - Proxy Oracle full URL (for child resources)');
  console.log('  GET  /api/fusion/*              - Proxy Fusion REST API requests');
  console.log('  GET  /api/apex/*                - Proxy APEX GET requests');
  console.log('  POST /api/apex/*                - Proxy APEX POST requests');
  console.log('');
  console.log('Oracle Host:', ORACLE_CONFIG.baseUrl);
  console.log('APEX Host:', APEX_CONFIG.baseUrl);
  console.log('='.repeat(50));
});
