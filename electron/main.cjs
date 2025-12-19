const { app, BrowserWindow, Tray, Menu, dialog, ipcMain, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray = null;
let isQuitting = false;
let isSyncing = false;

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
    },
    show: false, // Don't show until ready
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
    console.log('App path:', app.getAppPath());
    console.log('Loading local file:', indexPath);
    console.log('File exists:', fs.existsSync(indexPath));
    mainWindow.loadFile(indexPath);
  }

  // Always open DevTools for debugging (remove this line later)
  mainWindow.webContents.openDevTools();

  // Log any load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', validatedURL);
    console.error('Error:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page loaded successfully');
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
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
  const iconPath = path.join(__dirname, '../public/icon-512.png');
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

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();

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
