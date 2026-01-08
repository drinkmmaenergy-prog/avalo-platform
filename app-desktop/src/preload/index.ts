import { contextBridge, ipcRenderer } from 'electron';

const ALLOWED_CHANNELS = [
  'desktop:ping',
  'desktop:getDeviceInfo',
  'desktop:uploadFiles',
  'desktop:batchUpload',
  'desktop:getOfflineQueue',
  'desktop:addToOfflineQueue',
  'desktop:processOfflineQueue',
  'desktop:showNotification',
  'desktop:switchAccount',
  'desktop:getAccounts',
  'desktop:openSplitView',
  'desktop:closeSplitView',
  'desktop:exportVideo',
  'desktop:checkForUpdates'
];

const ALLOWED_SEND_CHANNELS = [
  'notification:show',
  'upload:progress',
  'update:available',
  'update:downloaded',
  'offline:sync'
];

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: async (channel: string, ...args: any[]): Promise<any> => {
    if (!ALLOWED_CHANNELS.includes(channel)) {
      throw new Error(`Channel ${channel} is not allowed`);
    }
    return await ipcRenderer.invoke(channel, ...args);
  },

  on: (channel: string, callback: (...args: any[]) => void): void => {
    if (!ALLOWED_SEND_CHANNELS.includes(channel)) {
      throw new Error(`Channel ${channel} is not allowed`);
    }
    const subscription = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
  },

  once: (channel: string, callback: (...args: any[]) => void): void => {
    if (!ALLOWED_SEND_CHANNELS.includes(channel)) {
      throw new Error(`Channel ${channel} is not allowed`);
    }
    const subscription = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.once(channel, subscription);
  },

  removeListener: (channel: string, callback: (...args: any[]) => void): void => {
    if (!ALLOWED_SEND_CHANNELS.includes(channel)) {
      throw new Error(`Channel ${channel} is not allowed`);
    }
    ipcRenderer.removeListener(channel, callback);
  },

  ping: async (): Promise<any> => {
    return await ipcRenderer.invoke('desktop:ping');
  },

  getDeviceInfo: async (): Promise<any> => {
    return await ipcRenderer.invoke('desktop:getDeviceInfo');
  },

  uploadFiles: async (files: any[]): Promise<any> => {
    return await ipcRenderer.invoke('desktop:uploadFiles', files);
  },

  batchUpload: async (files: any[]): Promise<any> => {
    return await ipcRenderer.invoke('desktop:batchUpload', files);
  },

  getOfflineQueue: async (): Promise<any> => {
    return await ipcRenderer.invoke('desktop:getOfflineQueue');
  },

  addToOfflineQueue: async (item: any): Promise<any> => {
    return await ipcRenderer.invoke('desktop:addToOfflineQueue', item);
  },

  processOfflineQueue: async (): Promise<any> => {
    return await ipcRenderer.invoke('desktop:processOfflineQueue');
  },

  showNotification: async (notification: any): Promise<any> => {
    return await ipcRenderer.invoke('desktop:showNotification', notification);
  },

  switchAccount: async (accountId: string): Promise<any> => {
    return await ipcRenderer.invoke('desktop:switchAccount', accountId);
  },

  getAccounts: async (): Promise<any> => {
    return await ipcRenderer.invoke('desktop:getAccounts');
  },

  openSplitView: async (config: any): Promise<any> => {
    return await ipcRenderer.invoke('desktop:openSplitView', config);
  },

  closeSplitView: async (): Promise<any> => {
    return await ipcRenderer.invoke('desktop:closeSplitView');
  },

  exportVideo: async (videoData: any): Promise<any> => {
    return await ipcRenderer.invoke('desktop:exportVideo', videoData);
  },

  checkForUpdates: async (): Promise<any> => {
    return await ipcRenderer.invoke('desktop:checkForUpdates');
  },

  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
});

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      on: (channel: string, callback: (...args: any[]) => void) => void;
      once: (channel: string, callback: (...args: any[]) => void) => void;
      removeListener: (channel: string, callback: (...args: any[]) => void) => void;
      ping: () => Promise<any>;
      getDeviceInfo: () => Promise<any>;
      uploadFiles: (files: any[]) => Promise<any>;
      batchUpload: (files: any[]) => Promise<any>;
      getOfflineQueue: () => Promise<any>;
      addToOfflineQueue: (item: any) => Promise<any>;
      processOfflineQueue: () => Promise<any>;
      showNotification: (notification: any) => Promise<any>;
      switchAccount: (accountId: string) => Promise<any>;
      getAccounts: () => Promise<any>;
      openSplitView: (config: any) => Promise<any>;
      closeSplitView: () => Promise<any>;
      exportVideo: (videoData: any) => Promise<any>;
      checkForUpdates: () => Promise<any>;
      platform: string;
      versions: {
        node: string;
        chrome: string;
        electron: string;
      };
    };
  }
}