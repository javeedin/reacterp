const { app, BrowserWindow, Tray, Menu, dialog, ipcMain, Notification, nativeImage, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch (_) { /* not available in portable build */ }

let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (_) { /* optional */ }

// ── Email sender (IPC) ──────────────────────────────────────────────────────
const APEX_BASE = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp';

// In-memory cache so we don't hit APEX on every OTP request
let _smtpCache = null;
let _smtpCacheAt = 0;
const SMTP_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// 1. Try APEX DB  2. Fall back to local file
async function loadSmtpConfig() {
  // Return cached value if still fresh
  if (_smtpCache && (Date.now() - _smtpCacheAt) < SMTP_CACHE_TTL) {
    return _smtpCache;
  }

  // ── Primary: fetch from APEX DB ──
  try {
    const res = await fetch(`${APEX_BASE}/config/emailsettings`);
    const data = await res.json();
    if (data.status === 'success') {
      console.log('[email] Config loaded from APEX DB');
      _smtpCache = { host: data.host, port: data.port, secure: data.secure === true || data.secure === 'true', user: data.user, pass: data.pass, fromName: data.fromName };
      _smtpCacheAt = Date.now();
      return _smtpCache;
    }
  } catch (e) {
    console.warn('[email] APEX fetch failed, trying local file:', e.message);
  }

  // ── Fallback: local email.config.json ──
  const candidates = [path.join(__dirname, 'email.config.json')];
  try { candidates.push(path.join(process.resourcesPath, 'email.config.json')); } catch (_) {}
  try { candidates.push(path.join(app.getAppPath(), 'electron', 'email.config.json')); } catch (_) {}

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
        const cfg = JSON.parse(raw);
        console.log('[email] Config loaded from local file:', p);
        return cfg;
      }
    } catch (e) {
      console.error('[email] Error reading', p, ':', e.message);
    }
  }

  console.error('[email] No config found in APEX DB or local file.');
  return null;
}

ipcMain.handle('send-otp-email', async (_event, { to, otp }) => {
  const cfg = await loadSmtpConfig();
  if (!cfg) return { success: false, error: 'Email config not found. Please add SMTP settings to RR_EMAIL_CONFIG table in APEX.' };
  try {
    // Use Brevo HTTP API — same approach as the proxy server (avoids SMTP auth issues)
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': cfg.pass },
      body: JSON.stringify({
        sender: { name: cfg.fromName || 'ReactERP', email: cfg.user },
        to: [{ email: to }],
        subject: 'ReactERP — Your One-Time Password (OTP)',
        htmlContent: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e0e0e0;border-radius:8px">
            <h2 style="color:#1a1a2e;margin-top:0">ReactERP</h2>
            <p>Your one-time password (OTP) is:</p>
            <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1677ff;background:#f0f5ff;padding:16px 24px;border-radius:6px;text-align:center;margin:24px 0">
              ${otp}
            </div>
            <p style="color:#666;font-size:13px">Valid for <strong>15 minutes</strong>. Enter this code along with your new password.</p>
            <p style="color:#999;font-size:12px">If you did not request this, please ignore this email.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
            <p style="color:#aaa;font-size:11px;margin:0">ReactERP System</p>
          </div>`,
      }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.message || 'Brevo API error' };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

let mainWindow;
let tray = null;
let isQuitting = false;
let isSyncing = false;
let proxyServer = null;

// Start the proxy server.
// Primary: utilityProcess.fork() — uses Electron's bundled Node, no system Node needed.
// Fallback: spawn('node', ...) — for dev environments where node is on PATH.
function startProxyServer() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  const serverPath = isDev
    ? path.join(__dirname, '../server/proxy.cjs')
    : path.join(app.getAppPath(), 'server', 'proxy.cjs');

  console.log('Starting proxy server from:', serverPath);

  if (!fs.existsSync(serverPath)) {
    console.error('Proxy server not found at:', serverPath);
    return;
  }

  // Primary: utilityProcess (packaged build — no external Node required)
  if (app.isPackaged && utilityProcess) {
    try {
      proxyServer = utilityProcess.fork(serverPath, [], {
        cwd: app.getAppPath(),
        stdio: 'pipe',
      });
      proxyServer.stdout?.on('data', (d) => console.log('Proxy:', d.toString().trim()));
      proxyServer.stderr?.on('data', (d) => console.error('Proxy Error:', d.toString().trim()));
      proxyServer.on('exit', (code) => { console.log('Proxy exited:', code); proxyServer = null; });
      console.log('Proxy server started via utilityProcess');
      return;
    } catch (err) {
      console.warn('utilityProcess.fork failed, trying spawn fallback:', err.message);
    }
  }

  // Fallback: spawn node (dev or if utilityProcess failed)
  try {
    proxyServer = spawn('node', [serverPath], {
      cwd: isDev ? path.join(__dirname, '..') : app.getAppPath(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proxyServer.stdout.on('data', (d) => console.log('Proxy:', d.toString().trim()));
    proxyServer.stderr.on('data', (d) => console.error('Proxy Error:', d.toString().trim()));
    proxyServer.on('close', (code) => { console.log('Proxy exited:', code); proxyServer = null; });
    proxyServer.on('error', (err) => { console.error('Proxy spawn error:', err); proxyServer = null; });
    console.log('Proxy server started via spawn');
  } catch (err) {
    console.error('Failed to start proxy server:', err);
    proxyServer = null;
  }
}

// Stop the proxy server
function stopProxyServer() {
  if (proxyServer) {
    console.log('Stopping proxy server...');
    proxyServer.kill();
    proxyServer = null;
  }
}

// Get config file path
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

// Configure remote URL (prompt user)
function configureRemoteUrl() {
  const { BrowserWindow } = require('electron');

  // Create a simple prompt dialog
  const prompt = new BrowserWindow({
    width: 500,
    height: 200,
    parent: mainWindow,
    modal: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Configure Remote URL</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
        h3 { margin-top: 0; color: #333; }
        input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
        .buttons { text-align: right; margin-top: 15px; }
        button { padding: 8px 20px; margin-left: 10px; cursor: pointer; border-radius: 4px; }
        .save { background: #C74634; color: white; border: none; }
        .cancel { background: #ddd; border: none; }
        .hint { font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <h3>Configure Remote URL</h3>
      <p class="hint">Enter the URL where ReactERP is hosted (e.g., GitHub Pages, Vercel, or your server)</p>
      <input type="text" id="url" placeholder="https://your-domain.com/reacterp" />
      <div class="buttons">
        <button class="cancel" onclick="window.close()">Cancel</button>
        <button class="save" onclick="save()">Save & Restart</button>
      </div>
      <script>
        const { ipcRenderer } = require('electron');
        function save() {
          const url = document.getElementById('url').value;
          if (url) {
            ipcRenderer.send('save-remote-url', url);
          }
        }
        // Load existing URL
        ipcRenderer.on('load-url', (e, url) => {
          if (url) document.getElementById('url').value = url;
        });
      </script>
    </body>
    </html>
  `;

  prompt.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
  prompt.once('ready-to-show', () => {
    prompt.show();
    // Send existing URL to the prompt
    try {
      const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
      prompt.webContents.send('load-url', config.remoteUrl || '');
    } catch (e) {
      // No config
    }
  });
}

// Save remote URL and restart
ipcMain.on('save-remote-url', (event, url) => {
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify({ remoteUrl: url }, null, 2));
  dialog.showMessageBox({
    type: 'info',
    title: 'Configuration Saved',
    message: 'Remote URL saved. The app will now restart.',
  }).then(() => {
    app.relaunch();
    app.exit(0);
  });
});

// Clear remote URL (use local files)
function clearRemoteUrl() {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      dialog.showMessageBox({
        type: 'info',
        title: 'Configuration Cleared',
        message: 'Remote URL cleared. The app will restart and use local files.',
      }).then(() => {
        app.relaunch();
        app.exit(0);
      });
    } else {
      dialog.showMessageBox({
        type: 'info',
        title: 'Already Using Local Files',
        message: 'The app is already configured to use local files.',
      });
    }
  } catch (e) {
    console.error('Error clearing config:', e);
  }
}

// Create the main application window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    icon: path.join(__dirname, '../public/icons/icon-512.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false, // Allow cross-origin requests to Oracle Fusion API
    },
    show: true, // Show immediately — avoids window getting stuck invisible
  });

  // Load the app
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  // Check for remote config (Git-based loading)
  const configPath = getConfigPath();
  let remoteUrl = null;

  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      remoteUrl = config.remoteUrl;
      console.log('Loaded remote URL from config:', remoteUrl);
    }
  } catch (e) {
    console.log('No remote config found, using local files');
  }

  if (remoteUrl) {
    // Load from remote URL (Git Pages, Vercel, etc.)
    console.log('Loading from remote URL:', remoteUrl);
    mainWindow.loadURL(remoteUrl);
  } else if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // In production, load from the dist folder relative to app root
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    const appPath = app.getAppPath();

    // Create debug info
    const debugInfo = {
      appPath: appPath,
      indexPath: indexPath,
      indexExists: fs.existsSync(indexPath),
      dirname: __dirname,
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath || 'N/A',
    };

    // List files in app directory
    try {
      debugInfo.appFiles = fs.readdirSync(appPath);
      const distPath = path.join(appPath, 'dist');
      if (fs.existsSync(distPath)) {
        debugInfo.distFiles = fs.readdirSync(distPath);
      } else {
        debugInfo.distFiles = 'dist folder NOT FOUND';
      }
    } catch (e) {
      debugInfo.error = e.message;
    }

    console.log('Debug Info:', JSON.stringify(debugInfo, null, 2));

    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    } else {
      // Show debug page if index.html not found
      const debugHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>ReactERP - Debug Info</title>
          <style>
            body { font-family: monospace; padding: 20px; background: #1a1a1a; color: #00ff00; }
            h1 { color: #ff6b6b; }
            pre { background: #2a2a2a; padding: 15px; border-radius: 5px; overflow: auto; }
            .error { color: #ff6b6b; }
            .success { color: #00ff00; }
          </style>
        </head>
        <body>
          <h1>⚠️ ReactERP - Loading Error</h1>
          <p class="error">Could not find index.html</p>
          <h2>Debug Information:</h2>
          <pre>${JSON.stringify(debugInfo, null, 2)}</pre>
          <h2>Possible Solutions:</h2>
          <ul>
            <li>Make sure 'dist' folder is included in the build</li>
            <li>Run 'npm run build' before 'npm run electron:build:win'</li>
            <li>Check electron-builder 'files' configuration in package.json</li>
          </ul>
        </body>
        </html>
      `;
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(debugHtml));
    }
  }

  // Open DevTools only in development
  if (!app.isPackaged && process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Log any load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', validatedURL);
    console.error('Error:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page loaded successfully');
  });

  // Ensure window is visible and focused once content is loaded
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Handle close button - ask for confirmation or minimize to tray
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();

      if (isSyncing) {
        // If syncing, ask for confirmation
        const choice = dialog.showMessageBoxSync(mainWindow, {
          type: 'warning',
          buttons: ['Minimize to Tray', 'Stop Sync & Close', 'Cancel'],
          defaultId: 2,
          cancelId: 2,
          title: 'Sync in Progress',
          message: 'A sync operation is currently running.',
          detail: 'What would you like to do?',
        });

        if (choice === 0) {
          // Minimize to tray
          mainWindow.hide();
        } else if (choice === 1) {
          // Stop sync and close
          mainWindow.webContents.send('stop-sync');
          isQuitting = true;
          app.quit();
        }
        // choice === 2: Cancel - do nothing
      } else {
        // Not syncing, ask if they want to close or minimize
        const choice = dialog.showMessageBoxSync(mainWindow, {
          type: 'question',
          buttons: ['Minimize to Tray', 'Close App', 'Cancel'],
          defaultId: 0,
          cancelId: 2,
          title: 'Close ReactERP',
          message: 'What would you like to do?',
          detail: 'You can minimize to system tray to keep the app running in background.',
        });

        if (choice === 0) {
          // Minimize to tray
          mainWindow.hide();
        } else if (choice === 1) {
          // Close app
          isQuitting = true;
          app.quit();
        }
        // choice === 2: Cancel - do nothing
      }
    }
  });

  // Handle minimize - optionally minimize to tray
  mainWindow.on('minimize', (event) => {
    // Uncomment below to always minimize to tray
    // event.preventDefault();
    // mainWindow.hide();
  });
}

// Create system tray icon
function createTray() {
  // Create tray icon
  const iconPath = path.join(__dirname, '../public/icons/icon-512.png');
  let trayIcon;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    // Resize for tray (16x16 on most systems)
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } catch (e) {
    console.error('Failed to load tray icon:', e);
    // Create a simple colored icon as fallback
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('ReactERP - Oracle Fusion Sync');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open ReactERP',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: 'Sync Status',
      enabled: false,
      id: 'sync-status',
    },
    { type: 'separator' },
    {
      label: 'Start Sync',
      click: () => {
        mainWindow.show();
        mainWindow.webContents.send('start-sync');
      },
    },
    {
      label: 'Stop Sync',
      click: () => {
        mainWindow.webContents.send('stop-sync');
      },
    },
    { type: 'separator' },
    {
      label: 'Configure Remote URL...',
      click: () => {
        configureRemoteUrl();
      },
    },
    {
      label: 'Use Local Files',
      click: () => {
        clearRemoteUrl();
      },
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => {
        if (autoUpdater && app.isPackaged) {
          autoUpdater.checkForUpdates();
        } else {
          require('electron').shell.openExternal('https://github.com/javeedin/reacterp/releases');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Double-click on tray icon opens window
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

// Update tray tooltip and menu based on sync status
function updateTrayStatus(status, details = '') {
  if (!tray) return;

  isSyncing = status === 'syncing';

  let tooltip = 'ReactERP';
  let statusLabel = 'Idle';

  switch (status) {
    case 'syncing':
      tooltip = `ReactERP - Syncing... ${details}`;
      statusLabel = `Syncing: ${details}`;
      break;
    case 'completed':
      tooltip = 'ReactERP - Sync Completed';
      statusLabel = 'Last sync: Completed';
      break;
    case 'error':
      tooltip = 'ReactERP - Sync Error';
      statusLabel = 'Last sync: Error';
      break;
    default:
      tooltip = 'ReactERP - Ready';
      statusLabel = 'Ready';
  }

  tray.setToolTip(tooltip);

  // Update context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open ReactERP',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: statusLabel,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Start Sync',
      enabled: !isSyncing,
      click: () => {
        mainWindow.show();
        mainWindow.webContents.send('start-sync');
      },
    },
    {
      label: 'Stop Sync',
      enabled: isSyncing,
      click: () => {
        mainWindow.webContents.send('stop-sync');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// Show notification
function showNotification(title, body, type = 'info') {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: title,
      body: body,
      icon: path.join(__dirname, '../public/icons/icon-512.png'),
      silent: false,
    });

    notification.on('click', () => {
      mainWindow.show();
      mainWindow.focus();
    });

    notification.show();
  }
}

// IPC Handlers
ipcMain.on('sync-status', (event, status, details) => {
  updateTrayStatus(status, details);
});

ipcMain.on('sync-started', (event, syncType) => {
  isSyncing = true;
  updateTrayStatus('syncing', syncType);
});

ipcMain.on('sync-progress', (event, progress) => {
  updateTrayStatus('syncing', progress);
});

ipcMain.on('sync-completed', (event, summary) => {
  isSyncing = false;
  updateTrayStatus('completed');
  showNotification(
    'Sync Completed',
    summary || 'Data synchronization completed successfully.',
    'success'
  );
});

ipcMain.on('sync-error', (event, error) => {
  isSyncing = false;
  updateTrayStatus('error');
  showNotification(
    'Sync Error',
    error || 'An error occurred during synchronization.',
    'error'
  );
});

ipcMain.on('show-notification', (event, title, body) => {
  showNotification(title, body);
});

// ── Auto-update ────────────────────────────────────────────────────────────
function setupAutoUpdater() {
  // Only run in production with autoUpdater available
  if (!app.isPackaged || !autoUpdater) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available.`,
      detail: 'Downloading update in the background. You will be notified when it is ready to install.',
      buttons: ['OK'],
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('App is up to date.');
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent);
    console.log(`Downloading update: ${percent}%`);
    if (mainWindow) {
      mainWindow.setProgressBar(progress.percent / 100);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    if (mainWindow) mainWindow.setProgressBar(-1);

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'Restart the app now to apply the update, or it will be applied on next launch.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err.message);
  });

  // Check for updates after app starts (delay to not slow startup)
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 5000);

  // Check again every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdates();
  }, 4 * 60 * 60 * 1000);
}

// App lifecycle
app.whenReady().then(() => {
  // Start proxy server and create window in parallel — no delay
  startProxyServer();
  createWindow();
  createTray();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopProxyServer();
});

// Handle certificate errors in development
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  // In development, ignore certificate errors
  if (!app.isPackaged) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});
