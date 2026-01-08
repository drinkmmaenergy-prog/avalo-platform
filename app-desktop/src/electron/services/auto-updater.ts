import { autoUpdater } from 'electron-updater';
import { BrowserWindow, dialog } from 'electron';

let updateCheckInProgress = false;
let updateDownloadInProgress = false;

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    updateCheckInProgress = true;
    mainWindow.webContents.send('update:checking');
  });

  autoUpdater.on('update-available', (info) => {
    updateCheckInProgress = false;
    mainWindow.webContents.send('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    });

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available. Would you like to download it now?`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then(result => {
      if (result.response === 0) {
        downloadUpdate(mainWindow);
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    updateCheckInProgress = false;
    mainWindow.webContents.send('update:not-available');
  });

  autoUpdater.on('error', (error) => {
    updateCheckInProgress = false;
    updateDownloadInProgress = false;
    mainWindow.webContents.send('update:error', {
      message: error.message
    });
    console.error('Update error:', error);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('update:progress', {
      percent: progressObj.percent,
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloadInProgress = false;
    mainWindow.webContents.send('update:downloaded', {
      version: info.version
    });

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded. Restart the application to install the update.`,
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  if (process.env.NODE_ENV === 'production') {
    checkForUpdates();
    
    setInterval(() => {
      checkForUpdates();
    }, 4 * 60 * 60 * 1000);
  }
}

export function checkForUpdates(): void {
  if (updateCheckInProgress || updateDownloadInProgress) {
    return;
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('Update check skipped in development mode');
    return;
  }

  autoUpdater.checkForUpdates().catch(error => {
    console.error('Failed to check for updates:', error);
  });
}

export function downloadUpdate(mainWindow: BrowserWindow): void {
  if (updateDownloadInProgress) {
    return;
  }

  updateDownloadInProgress = true;
  mainWindow.webContents.send('update:downloading');

  autoUpdater.downloadUpdate().catch(error => {
    updateDownloadInProgress = false;
    console.error('Failed to download update:', error);
    mainWindow.webContents.send('update:error', {
      message: error.message
    });
  });
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall(false, true);
}