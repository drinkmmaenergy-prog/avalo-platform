import { BrowserWindow } from 'electron';
import { store } from '../main';
import { v4 as uuidv4 } from 'uuid';

interface QueueItem {
  id: string;
  type: 'upload' | 'message' | 'post' | 'comment' | 'like' | 'tip' | 'subscription';
  data: any;
  timestamp: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
  maxRetries: number;
  error?: string;
  priority: 'low' | 'normal' | 'high';
}

interface QueueStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

let mainWindow: BrowserWindow | null = null;
let processingInterval: NodeJS.Timeout | null = null;
let isProcessing = false;
const MAX_CONCURRENT_OPERATIONS = 3;
const PROCESS_INTERVAL_MS = 5000;

export function setupOfflineQueue(window: BrowserWindow): void {
  mainWindow = window;
  startQueueProcessor();
}

export function addToQueue(item: Omit<QueueItem, 'id' | 'timestamp' | 'status' | 'retryCount'>): string {
  const queueItem: QueueItem = {
    id: uuidv4(),
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0,
    ...item
  };

  const queue = getQueue();
  queue.push(queueItem);
  saveQueue(queue);

  notifyQueueUpdate();

  return queueItem.id;
}

export function getQueue(): QueueItem[] {
  return store.get('offlineQueue', []) as QueueItem[];
}

function saveQueue(queue: QueueItem[]): void {
  store.set('offlineQueue', queue);
}

export function getQueueItem(id: string): QueueItem | undefined {
  const queue = getQueue();
  return queue.find(item => item.id === id);
}

export function updateQueueItem(id: string, updates: Partial<QueueItem>): void {
  const queue = getQueue();
  const index = queue.findIndex(item => item.id === id);
  
  if (index !== -1) {
    queue[index] = { ...queue[index], ...updates };
    saveQueue(queue);
    notifyQueueUpdate();
  }
}

export function removeFromQueue(id: string): void {
  const queue = getQueue();
  const filteredQueue = queue.filter(item => item.id !== id);
  saveQueue(filteredQueue);
  notifyQueueUpdate();
}

export function clearCompletedItems(): void {
  const queue = getQueue();
  const activeQueue = queue.filter(item => item.status !== 'completed');
  saveQueue(activeQueue);
  notifyQueueUpdate();
}

export function clearFailedItems(): void {
  const queue = getQueue();
  const activeQueue = queue.filter(item => item.status !== 'failed');
  saveQueue(activeQueue);
  notifyQueueUpdate();
}

export function clearAllItems(): void {
  saveQueue([]);
  notifyQueueUpdate();
}

export function getQueueStats(): QueueStats {
  const queue = getQueue();
  
  return {
    total: queue.length,
    pending: queue.filter(item => item.status === 'pending').length,
    processing: queue.filter(item => item.status === 'processing').length,
    completed: queue.filter(item => item.status === 'completed').length,
    failed: queue.filter(item => item.status === 'failed').length
  };
}

export function retryFailedItems(): void {
  const queue = getQueue();
  
  queue.forEach(item => {
    if (item.status === 'failed' && item.retryCount < item.maxRetries) {
      item.status = 'pending';
      item.error = undefined;
    }
  });
  
  saveQueue(queue);
  notifyQueueUpdate();
  processQueue();
}

export function retryItem(id: string): void {
  const queue = getQueue();
  const item = queue.find(i => i.id === id);
  
  if (item && item.status === 'failed' && item.retryCount < item.maxRetries) {
    item.status = 'pending';
    item.error = undefined;
    saveQueue(queue);
    notifyQueueUpdate();
    processQueue();
  }
}

function startQueueProcessor(): void {
  if (processingInterval) {
    clearInterval(processingInterval);
  }

  processingInterval = setInterval(() => {
    if (!isProcessing) {
      processQueue();
    }
  }, PROCESS_INTERVAL_MS);

  processQueue();
}

export function stopQueueProcessor(): void {
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
  }
}

async function processQueue(): Promise<void> {
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    const queue = getQueue();
    const pendingItems = queue
      .filter(item => item.status === 'pending')
      .sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.timestamp - b.timestamp;
      })
      .slice(0, MAX_CONCURRENT_OPERATIONS);

    if (pendingItems.length === 0) {
      isProcessing = false;
      return;
    }

    const processingPromises = pendingItems.map(item => processQueueItem(item));
    await Promise.allSettled(processingPromises);
  } catch (error) {
    console.error('Error processing queue:', error);
  } finally {
    isProcessing = false;
  }
}

async function processQueueItem(item: QueueItem): Promise<void> {
  updateQueueItem(item.id, { status: 'processing' });

  try {
    await simulateOperation(item);
    
    updateQueueItem(item.id, {
      status: 'completed',
      error: undefined
    });
  } catch (error: any) {
    const newRetryCount = item.retryCount + 1;
    
    if (newRetryCount >= item.maxRetries) {
      updateQueueItem(item.id, {
        status: 'failed',
        retryCount: newRetryCount,
        error: error.message
      });
    } else {
      updateQueueItem(item.id, {
        status: 'pending',
        retryCount: newRetryCount,
        error: error.message
      });
    }
  }
}

async function simulateOperation(item: QueueItem): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() > 0.9) {
        reject(new Error('Simulated network error'));
      } else {
        resolve();
      }
    }, 1000 + Math.random() * 2000);
  });
}

function notifyQueueUpdate(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const stats = getQueueStats();
    mainWindow.webContents.send('offline:sync', {
      stats,
      timestamp: Date.now()
    });
  }
}

export function getPendingCount(): number {
  return getQueueStats().pending;
}

export function getFailedCount(): number {
  return getQueueStats().failed;
}

export function hasNetworkConnection(): boolean {
  return store.get('networkConnected', true) as boolean;
}

export function setNetworkConnection(connected: boolean): void {
  const wasConnected = hasNetworkConnection();
  store.set('networkConnected', connected);

  if (!wasConnected && connected) {
    processQueue();
  }

  notifyQueueUpdate();
}