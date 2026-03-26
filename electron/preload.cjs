const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Sync status updates
  syncStarted: (syncType) => ipcRenderer.send('sync-started', syncType),
  syncProgress: (progress) => ipcRenderer.send('sync-progress', progress),
  syncCompleted: (summary) => ipcRenderer.send('sync-completed', summary),
  syncError: (error) => ipcRenderer.send('sync-error', error),

  // General notifications
  showNotification: (title, body) => ipcRenderer.send('show-notification', title, body),

  // Listen for commands from main process
  onStartSync: (callback) => ipcRenderer.on('start-sync', callback),
  onStopSync: (callback) => ipcRenderer.on('stop-sync', callback),

  // Remove listeners
  removeStartSyncListener: () => ipcRenderer.removeAllListeners('start-sync'),
  removeStopSyncListener: () => ipcRenderer.removeAllListeners('stop-sync'),

  // Send OTP email via nodemailer (main process)
  sendOtpEmail: (to, otp) =>
    ipcRenderer.invoke('send-otp-email', { to, otp }),

  // Check if running in Electron
  isElectron: true,

  // Platform info
  platform: process.platform,
});

// Log that preload script loaded
console.log('Electron preload script loaded');
