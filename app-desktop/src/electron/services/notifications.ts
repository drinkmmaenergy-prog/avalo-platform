import { BrowserWindow, Notification } from 'electron';
import { store } from '../main';

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  silent?: boolean;
  urgency?: 'normal' | 'critical' | 'low';
  actions?: Array<{
    type: string;
    text: string;
  }>;
  timeoutType?: 'default' | 'never';
}

interface NotificationPreferences {
  enabled: boolean;
  sound: boolean;
  showPreview: boolean;
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

let mainWindow: BrowserWindow | null = null;
const notificationQueue: NotificationOptions[] = [];
let isProcessingQueue = false;

export function setupDesktopNotifications(window: BrowserWindow): void {
  mainWindow = window;
  
  const preferences = getNotificationPreferences();
  if (!preferences.enabled) {
    return;
  }

  startQueueProcessor();
}

function getNotificationPreferences(): NotificationPreferences {
  return store.get('notificationPreferences', {
    enabled: true,
    sound: true,
    showPreview: true,
    position: 'top-right'
  }) as NotificationPreferences;
}

export function showDesktopNotification(options: NotificationOptions): void {
  const preferences = getNotificationPreferences();
  
  if (!preferences.enabled) {
    return;
  }

  if (!Notification.isSupported()) {
    console.warn('System notifications are not supported');
    return;
  }

  notificationQueue.push(options);
  processNotificationQueue();
}

async function processNotificationQueue(): Promise<void> {
  if (isProcessingQueue || notificationQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;

  while (notificationQueue.length > 0) {
    const options = notificationQueue.shift();
    if (options) {
      await displayNotification(options);
      await delay(1000);
    }
  }

  isProcessingQueue = false;
}

function displayNotification(options: NotificationOptions): Promise<void> {
  return new Promise((resolve) => {
    const preferences = getNotificationPreferences();
    
    const notification = new Notification({
      title: options.title,
      body: options.body,
      icon: options.icon,
      silent: options.silent || !preferences.sound,
      urgency: options.urgency || 'normal',
      timeoutType: options.timeoutType || 'default'
    });

    notification.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();
      }
    });

    notification.on('close', () => {
      resolve();
    });

    notification.show();

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('notification:shown', {
        title: options.title,
        body: options.body
      });
    }

    storeNotificationHistory({
      ...options,
      timestamp: Date.now(),
      read: false
    });
  });
}

function storeNotificationHistory(notification: any): void {
  const history = store.get('notificationHistory', []) as any[];
  history.unshift(notification);
  
  if (history.length > 100) {
    history.splice(100);
  }
  
  store.set('notificationHistory', history);
}

export function getNotificationHistory(limit: number = 50): any[] {
  const history = store.get('notificationHistory', []) as any[];
  return history.slice(0, limit);
}

export function clearNotificationHistory(): void {
  store.set('notificationHistory', []);
}

export function markNotificationAsRead(timestamp: number): void {
  const history = store.get('notificationHistory', []) as any[];
  const notification = history.find((n: any) => n.timestamp === timestamp);
  if (notification) {
    notification.read = true;
    store.set('notificationHistory', history);
  }
}

export function markAllNotificationsAsRead(): void {
  const history = store.get('notificationHistory', []) as any[];
  history.forEach((n: any) => {
    n.read = true;
  });
  store.set('notificationHistory', history);
}

export function getUnreadNotificationCount(): number {
  const history = store.get('notificationHistory', []) as any[];
  return history.filter((n: any) => !n.read).length;
}

export function updateNotificationPreferences(preferences: Partial<NotificationPreferences>): void {
  const current = getNotificationPreferences();
  store.set('notificationPreferences', { ...current, ...preferences });
}

function startQueueProcessor(): void {
  setInterval(() => {
    if (!isProcessingQueue && notificationQueue.length > 0) {
      processNotificationQueue();
    }
  }, 2000);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function showNewMessageNotification(sender: string, preview: string): void {
  showDesktopNotification({
    title: `New message from ${sender}`,
    body: preview,
    urgency: 'normal'
  });
}

export function showTokenReceivedNotification(amount: number, sender: string): void {
  showDesktopNotification({
    title: 'Tokens Received',
    body: `You received ${amount} tokens from ${sender}`,
    urgency: 'normal'
  });
}

export function showCallIncomingNotification(caller: string): void {
  showDesktopNotification({
    title: 'Incoming Call',
    body: `${caller} is calling you`,
    urgency: 'critical'
  });
}

export function showUploadCompleteNotification(fileName: string): void {
  showDesktopNotification({
    title: 'Upload Complete',
    body: `${fileName} has been uploaded successfully`,
    urgency: 'low'
  });
}