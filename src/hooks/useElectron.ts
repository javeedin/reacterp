import { useCallback, useEffect } from 'react';

// Check if running in Electron
export const isElectron = (): boolean => {
  return !!(window.electronAPI?.isElectron);
};

// Hook to use Electron features with fallback for browser
export const useElectron = () => {
  const electron = window.electronAPI;

  // Notify that sync has started
  const notifySyncStarted = useCallback((syncType: string) => {
    if (electron) {
      electron.syncStarted(syncType);
    }
    console.log(`[Electron] Sync started: ${syncType}`);
  }, [electron]);

  // Update sync progress
  const notifySyncProgress = useCallback((progress: string) => {
    if (electron) {
      electron.syncProgress(progress);
    }
  }, [electron]);

  // Notify that sync completed
  const notifySyncCompleted = useCallback((summary: string) => {
    if (electron) {
      electron.syncCompleted(summary);
    } else {
      // Fallback: use browser notification if available
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Sync Completed', { body: summary });
      }
    }
    console.log(`[Electron] Sync completed: ${summary}`);
  }, [electron]);

  // Notify sync error
  const notifySyncError = useCallback((error: string) => {
    if (electron) {
      electron.syncError(error);
    } else {
      // Fallback: use browser notification if available
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Sync Error', { body: error });
      }
    }
    console.log(`[Electron] Sync error: ${error}`);
  }, [electron]);

  // Show a general notification
  const showNotification = useCallback((title: string, body: string) => {
    if (electron) {
      electron.showNotification(title, body);
    } else {
      // Fallback: use browser notification if available
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    }
  }, [electron]);

  // Request notification permission (for browser fallback)
  const requestNotificationPermission = useCallback(async () => {
    if (!electron && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return true; // Electron handles permissions differently
  }, [electron]);

  return {
    isElectron: !!electron,
    notifySyncStarted,
    notifySyncProgress,
    notifySyncCompleted,
    notifySyncError,
    showNotification,
    requestNotificationPermission,
  };
};

// Hook to listen for Electron commands
export const useElectronCommands = (
  onStartSync?: () => void,
  onStopSync?: () => void
) => {
  useEffect(() => {
    const electron = window.electronAPI;
    if (!electron) return;

    if (onStartSync) {
      electron.onStartSync(onStartSync);
    }
    if (onStopSync) {
      electron.onStopSync(onStopSync);
    }

    return () => {
      electron.removeStartSyncListener();
      electron.removeStopSyncListener();
    };
  }, [onStartSync, onStopSync]);
};

export default useElectron;
