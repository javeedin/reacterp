// Type declarations for Electron API exposed via preload script
export interface ElectronAPI {
  // Sync status updates
  syncStarted: (syncType: string) => void;
  syncProgress: (progress: string) => void;
  syncCompleted: (summary: string) => void;
  syncError: (error: string) => void;

  // General notifications
  showNotification: (title: string, body: string) => void;

  // Listen for commands from main process
  onStartSync: (callback: () => void) => void;
  onStopSync: (callback: () => void) => void;

  // Remove listeners
  removeStartSyncListener: () => void;
  removeStopSyncListener: () => void;

  // Check if running in Electron
  isElectron: boolean;

  // Platform info
  platform: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
