const { app, BrowserWindow, Tray, Menu, dialog, ipcMain, Notification, nativeImage } = require('electron');
const path = require('path');

let mainWindow;
let tray = null;
let isQuitting = false;
let isSyncing = false;

// Create the main application window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    icon: path.join(__dirname, '../public/icon-512.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false, // Don't show until ready
  });

  // Load the app
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

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
      icon: path.join(__dirname, '../public/icon-512.png'),
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
