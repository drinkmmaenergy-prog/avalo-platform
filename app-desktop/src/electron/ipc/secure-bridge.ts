import { ipcMain, BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { validateRequest, sanitizeData } from './validators';
import { store } from '../main';

type IPCHandler = (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any;

interface IPCChannel {
  name: string;
  handler: IPCHandler;
  requiresAuth: boolean;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
}

class SecureIPCBridge {
  private channels: Map<string, IPCChannel> = new Map();
  private rateLimitMap: Map<string, { count: number; resetTime: number }> = new Map();
  private activeRequests: Map<string, number> = new Map();
  private mainWindow: BrowserWindow | null = null;

  initialize(window: BrowserWindow): void {
    this.mainWindow = window;
    this.registerCoreChannels();
  }

  private registerCoreChannels(): void {
    this.registerChannel({
      name: 'desktop:ping',
      handler: async () => ({ success: true, timestamp: Date.now() }),
      requiresAuth: false
    });

    this.registerChannel({
      name: 'desktop:getDeviceInfo',
      handler: async () => this.getDeviceInfo(),
      requiresAuth: true
    });

    this.registerChannel({
      name: 'desktop:uploadFiles',
      handler: async (event, files) => this.handleFileUpload(files),
      requiresAuth: true,
      rateLimit: { maxRequests: 10, windowMs: 60000 }
    });

    this.registerChannel({
      name: 'desktop:batchUpload',
      handler: async (event, files) => this.handleBatchUpload(files),
      requiresAuth: true,
      rateLimit: { maxRequests: 5, windowMs: 60000 }
    });

    this.registerChannel({
      name: 'desktop:getOfflineQueue',
      handler: async () => this.getOfflineQueue(),
      requiresAuth: true
    });

    this.registerChannel({
      name: 'desktop:addToOfflineQueue',
      handler: async (event, item) => this.addToOfflineQueue(item),
      requiresAuth: true
    });

    this.registerChannel({
      name: 'desktop:processOfflineQueue',
      handler: async () => this.processOfflineQueue(),
      requiresAuth: true
    });

    this.registerChannel({
      name: 'desktop:showNotification',
      handler: async (event, notification) => this.showNotification(notification),
      requiresAuth: true
    });

    this.registerChannel({
      name: 'desktop:switchAccount',
      handler: async (event, accountId) => this.switchAccount(accountId),
      requiresAuth: true
    });

    this.registerChannel({
      name: 'desktop:getAccounts',
      handler: async () => this.getAccounts(),
      requiresAuth: true
    });

    this.registerChannel({
      name: 'desktop:openSplitView',
      handler: async (event, config) => this.openSplitView(config),
      requiresAuth: true
    });

    this.registerChannel({
      name: 'desktop:closeSplitView',
      handler: async () => this.closeSplitView(),
      requiresAuth: true
    });

    this.registerChannel({
      name: 'desktop:exportVideo',
      handler: async (event, videoData) => this.exportVideo(videoData),
      requiresAuth: true,
      rateLimit: { maxRequests: 3, windowMs: 60000 }
    });

    this.registerChannel({
      name: 'desktop:checkForUpdates',
      handler: async () => this.checkForUpdates(),
      requiresAuth: false
    });
  }

  private registerChannel(channel: IPCChannel): void {
    this.channels.set(channel.name, channel);

    ipcMain.handle(channel.name, async (event, ...args) => {
      try {
        if (channel.requiresAuth && !this.isAuthenticated()) {
          throw new Error('Authentication required');
        }

        if (channel.rateLimit && !this.checkRateLimit(channel.name, channel.rateLimit)) {
          throw new Error('Rate limit exceeded');
        }

        if (!validateRequest(channel.name, args)) {
          throw new Error('Invalid request data');
        }

        const requestId = uuidv4();
        this.activeRequests.set(requestId, Date.now());

        const sanitizedArgs = args.map(arg => sanitizeData(arg));
        const result = await channel.handler(event, ...sanitizedArgs);

        this.activeRequests.delete(requestId);

        return { success: true, data: result };
      } catch (error: any) {
        console.error(`IPC error in ${channel.name}:`, error);
        return { success: false, error: error.message };
      }
    });
  }

  private checkRateLimit(channelName: string, limit: { maxRequests: number; windowMs: number }): boolean {
    const now = Date.now();
    const key = channelName;
    const current = this.rateLimitMap.get(key);

    if (!current || now > current.resetTime) {
      this.rateLimitMap.set(key, {
        count: 1,
        resetTime: now + limit.windowMs
      });
      return true;
    }

    if (current.count >= limit.maxRequests) {
      return false;
    }

    current.count++;
    return true;
  }

  private isAuthenticated(): boolean {
    const session = store.get('currentSession');
    return !!session;
  }

  private async getDeviceInfo(): Promise<any> {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.version,
      deviceId: store.get('deviceId'),
      timestamp: Date.now()
    };
  }

  private async handleFileUpload(files: any[]): Promise<any> {
    return {
      uploadId: uuidv4(),
      files: files.map(f => ({
        id: uuidv4(),
        name: f.name,
        size: f.size,
        type: f.type,
        status: 'queued'
      }))
    };
  }

  private async handleBatchUpload(files: any[]): Promise<any> {
    return {
      batchId: uuidv4(),
      totalFiles: files.length,
      status: 'processing',
      files: files.map(f => ({
        id: uuidv4(),
        name: f.name,
        size: f.size,
        type: f.type,
        status: 'queued'
      }))
    };
  }

  private async getOfflineQueue(): Promise<any> {
    const queue = store.get('offlineQueue', []) as any[];
    return queue;
  }

  private async addToOfflineQueue(item: any): Promise<any> {
    const queue = store.get('offlineQueue', []) as any[];
    const queueItem = {
      id: uuidv4(),
      ...item,
      timestamp: Date.now(),
      status: 'pending'
    };
    queue.push(queueItem);
    store.set('offlineQueue', queue);
    return queueItem;
  }

  private async processOfflineQueue(): Promise<any> {
    const queue = store.get('offlineQueue', []) as any[];
    return {
      processed: 0,
      failed: 0,
      remaining: queue.length
    };
  }

  private async showNotification(notification: any): Promise<any> {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('notification:show', notification);
    }
    return { success: true };
  }

  private async switchAccount(accountId: string): Promise<any> {
    store.set('currentAccountId', accountId);
    return { success: true, accountId };
  }

  private async getAccounts(): Promise<any> {
    const accounts = store.get('accounts', []) as any[];
    return accounts;
  }

  private async openSplitView(config: any): Promise<any> {
    return { success: true, splitViewId: uuidv4() };
  }

  private async closeSplitView(): Promise<any> {
    return { success: true };
  }

  private async exportVideo(videoData: any): Promise<any> {
    return {
      exportId: uuidv4(),
      status: 'processing',
      progress: 0
    };
  }

  private async checkForUpdates(): Promise<any> {
    return {
      updateAvailable: false,
      currentVersion: '1.0.0',
      latestVersion: '1.0.0'
    };
  }

  sendToRenderer(channel: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  cleanup(): void {
    this.channels.clear();
    this.rateLimitMap.clear();
    this.activeRequests.clear();
  }
}

const ipcBridge = new SecureIPCBridge();

export function setupSecureIPC(window: BrowserWindow): void {
  ipcBridge.initialize(window);
}

export function sendToRenderer(channel: string, data: any): void {
  ipcBridge.sendToRenderer(channel, data);
}

export { ipcBridge };