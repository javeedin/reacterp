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

  // Open a file (e.g. Excel) with the OS default application
  openExcel: (buffer, filename) =>
    ipcRenderer.invoke('open-excel', { buffer, filename }),

  // Screen recording
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  saveRecording: (buffer, metadata) => ipcRenderer.invoke('save-recording', { buffer, metadata }),

  // Training video library
  listRecordings: () => ipcRenderer.invoke('list-recordings'),
  deleteRecording: (id, filePath) => ipcRenderer.invoke('delete-recording', { id, filePath }),
  openRecordingsFolder: () => ipcRenderer.invoke('open-recordings-folder'),
  getFileUrl: (filePath) => ipcRenderer.invoke('get-file-url', filePath),

  // ERP session persistence (file-based — survives Chromium quota DB failures)
  saveErpSession: (user, token) => ipcRenderer.invoke('save-erp-session', { user, token }),
  getErpSession: () => ipcRenderer.invoke('get-erp-session'),
  clearErpSession: () => ipcRenderer.invoke('clear-erp-session'),

  // Oracle Fusion saved credentials
  saveFusionCredentials: (username, password) => ipcRenderer.invoke('save-fusion-credentials', { username, password }),
  getFusionCredentials: () => ipcRenderer.invoke('get-fusion-credentials'),
  clearFusionCredentials: () => ipcRenderer.invoke('clear-fusion-credentials'),

  // Claude AI Agents
  claudeReconAgent: (params) => ipcRenderer.invoke('claude:recon-agent', params),

  // Check if running in Electron
  isElectron: true,

  // Platform info
  platform: process.platform,
});

// Log that preload script loaded
console.log('Electron preload script loaded');
