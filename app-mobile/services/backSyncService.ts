/**
 * PACK 44 — Backend Sync Service (Hybrid Mode)
 * 
 * Minimal, local-first background sync to backend.
 * Rules:
 * - App works instantly offline → backend catches up later
 * - Sync AFTER local success, NEVER before
 * - Failures logged + retried, NEVER block user actions
 * - No media binaries, only metadata
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export type SyncOpType = 'MESSAGE' | 'TOKEN' | 'MEDIA_UNLOCK' | 'STREAK';

export interface PendingSyncOp {
  id: string;
  type: SyncOpType;
  payload: any;
  createdAt: number;
  retries: number;
}

export interface ChatMessage {
  messageId: string;
  senderId: string;
  receiverId: string;
  text: string;
  createdAt: number;
  mediaType?: 'photo' | 'audio' | 'video';
  isBoosted?: boolean;
  boostExtraTokens?: number;
  payToUnlock?: boolean;
  unlockPriceTokens?: number;
  // PACK 47: Cloud Media Delivery
  mediaStoragePath?: string;
  mediaRemoteUrl?: string;
}

export interface TokenSpent {
  userId: string;
  amount: number;
  reason: string;
  timestamp: number;
}

export interface MediaUnlock {
  messageId: string;
  userId: string;
  tokens: number;
  timestamp: number;
}

export interface StreakActivity {
  userId: string;
  partnerId: string;
  streakDays: number;
  timestamp: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY_PREFIX = 'pending_sync_ops_v1_';
const MAX_RETRIES = 12;
const RETRY_INTERVAL_MS = 60000; // 60 seconds

// Backend function names (must match deployed functions)
const BACKEND_FUNCTIONS = {
  MESSAGE: 'syncMessage',
  TOKEN: 'syncTokenSpent',
  MEDIA_UNLOCK: 'syncMediaUnlock',
  STREAK: 'syncStreakActivity',
} as const;

// ============================================================================
// RETRY QUEUE MANAGEMENT
// ============================================================================

/**
 * Get storage key for user's pending sync operations
 */
function getStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

/**
 * Load pending sync operations from AsyncStorage
 */
async function loadPendingOps(userId: string): Promise<PendingSyncOp[]> {
  try {
    const key = getStorageKey(userId);
    const data = await AsyncStorage.getItem(key);
    if (!data) {
      return [];
    }
    return JSON.parse(data) as PendingSyncOp[];
  } catch (error) {
    console.error('[backSyncService] Error loading pending ops:', error);
    return [];
  }
}

/**
 * Save pending sync operations to AsyncStorage
 */
async function savePendingOps(userId: string, ops: PendingSyncOp[]): Promise<void> {
  try {
    const key = getStorageKey(userId);
    await AsyncStorage.setItem(key, JSON.stringify(ops));
  } catch (error) {
    console.error('[backSyncService] Error saving pending ops:', error);
  }
}

/**
 * Add a new sync operation to the queue
 */
async function addPendingOp(
  userId: string,
  type: SyncOpType,
  payload: any
): Promise<void> {
  try {
    const ops = await loadPendingOps(userId);
    
    const newOp: PendingSyncOp = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      payload,
      createdAt: Date.now(),
      retries: 0,
    };
    
    ops.push(newOp);
    await savePendingOps(userId, ops);
    
    console.log(`[backSyncService] Added pending op: ${type}`);
  } catch (error) {
    console.error('[backSyncService] Error adding pending op:', error);
  }
}

/**
 * Remove a sync operation from the queue
 */
async function removePendingOp(userId: string, opId: string): Promise<void> {
  try {
    const ops = await loadPendingOps(userId);
    const filtered = ops.filter(op => op.id !== opId);
    await savePendingOps(userId, filtered);
  } catch (error) {
    console.error('[backSyncService] Error removing pending op:', error);
  }
}

/**
 * Update retry count for a sync operation
 */
async function incrementRetryCount(userId: string, opId: string): Promise<void> {
  try {
    const ops = await loadPendingOps(userId);
    const op = ops.find(o => o.id === opId);
    if (op) {
      op.retries += 1;
      await savePendingOps(userId, ops);
    }
  } catch (error) {
    console.error('[backSyncService] Error updating retry count:', error);
  }
}

/**
 * Get count of pending operations for a user
 */
export async function getPendingOpsCount(userId: string): Promise<number> {
  try {
    const ops = await loadPendingOps(userId);
    return ops.length;
  } catch (error) {
    console.error('[backSyncService] Error getting pending ops count:', error);
    return 0;
  }
}

// ============================================================================
// BACKEND SYNC FUNCTIONS
// ============================================================================

/**
 * Call backend sync function with error handling
 */
async function callBackendSync(
  functionName: string,
  payload: any
): Promise<boolean> {
  try {
    const syncFn = httpsCallable(functions, functionName);
    const result = await syncFn(payload);
    
    // Check if backend returned success
    const data = result.data as any;
    if (data && data.ok === true) {
      return true;
    }
    
    console.warn(`[backSyncService] Backend returned non-ok response:`, data);
    return false;
  } catch (error: any) {
    console.error(`[backSyncService] Error calling ${functionName}:`, error.message);
    return false;
  }
}

/**
 * Sync message to backend
 * PACK 45: Returns serverCreatedAt on success
 */
export async function syncMessage(message: ChatMessage): Promise<{ serverCreatedAt?: number }> {
  try {
    console.log('[backSyncService] Attempting to sync message:', message.messageId);
    
    const payload = {
      messageId: message.messageId,
      senderId: message.senderId,
      receiverId: message.receiverId,
      text: message.text,
      createdAt: message.createdAt,
      mediaType: message.mediaType,
      isBoosted: message.isBoosted,
      boostExtraTokens: message.boostExtraTokens,
      payToUnlock: message.payToUnlock,
      unlockPriceTokens: message.unlockPriceTokens,
      // PACK 47: Cloud Media Delivery
      mediaStoragePath: message.mediaStoragePath,
      mediaRemoteUrl: message.mediaRemoteUrl,
    };
    
    // Call backend sync and get response with serverCreatedAt
    try {
      const syncFn = httpsCallable(functions, BACKEND_FUNCTIONS.MESSAGE);
      const result = await syncFn(payload);
      
      const data = result.data as any;
      if (data && data.ok === true) {
        console.log('[backSyncService] Message synced successfully, serverCreatedAt:', data.serverCreatedAt);
        return { serverCreatedAt: data.serverCreatedAt };
      }
      
      console.warn('[backSyncService] Backend returned non-ok response:', data);
      // Add to retry queue
      await addPendingOp(message.senderId, 'MESSAGE', payload);
      return {};
    } catch (error: any) {
      console.error('[backSyncService] Error calling backend:', error.message);
      // Add to retry queue on error
      await addPendingOp(message.senderId, 'MESSAGE', payload);
      return {};
    }
  } catch (error) {
    console.error('[backSyncService] Error in syncMessage:', error);
    // Add to retry queue on error
    await addPendingOp(message.senderId, 'MESSAGE', {
      messageId: message.messageId,
      senderId: message.senderId,
      receiverId: message.receiverId,
      text: message.text,
      createdAt: message.createdAt,
      mediaType: message.mediaType,
      isBoosted: message.isBoosted,
      boostExtraTokens: message.boostExtraTokens,
      payToUnlock: message.payToUnlock,
      unlockPriceTokens: message.unlockPriceTokens,
      // PACK 47: Cloud Media Delivery
      mediaStoragePath: message.mediaStoragePath,
      mediaRemoteUrl: message.mediaRemoteUrl,
    });
    return {};
  }
}

/**
 * Sync token spent to backend
 */
export async function syncTokenSpent(
  userId: string,
  amount: number,
  reason: string
): Promise<void> {
  try {
    console.log('[backSyncService] Attempting to sync token spent:', amount, reason);
    
    const payload: TokenSpent = {
      userId,
      amount,
      reason,
      timestamp: Date.now(),
    };
    
    const success = await callBackendSync(BACKEND_FUNCTIONS.TOKEN, payload);
    
    if (!success) {
      // Add to retry queue
      await addPendingOp(userId, 'TOKEN', payload);
    } else {
      console.log('[backSyncService] Token spent synced successfully');
    }
  } catch (error) {
    console.error('[backSyncService] Error in syncTokenSpent:', error);
    // Add to retry queue on error
    await addPendingOp(userId, 'TOKEN', {
      userId,
      amount,
      reason,
      timestamp: Date.now(),
    });
  }
}

/**
 * Sync media unlock to backend
 */
export async function syncMediaUnlock(
  messageId: string,
  userId: string,
  tokens: number
): Promise<void> {
  try {
    console.log('[backSyncService] Attempting to sync media unlock:', messageId);
    
    const payload: MediaUnlock = {
      messageId,
      userId,
      tokens,
      timestamp: Date.now(),
    };
    
    const success = await callBackendSync(BACKEND_FUNCTIONS.MEDIA_UNLOCK, payload);
    
    if (!success) {
      // Add to retry queue
      await addPendingOp(userId, 'MEDIA_UNLOCK', payload);
    } else {
      console.log('[backSyncService] Media unlock synced successfully');
    }
  } catch (error) {
    console.error('[backSyncService] Error in syncMediaUnlock:', error);
    // Add to retry queue on error
    await addPendingOp(userId, 'MEDIA_UNLOCK', {
      messageId,
      userId,
      tokens,
      timestamp: Date.now(),
    });
  }
}

/**
 * Sync streak activity to backend
 */
export async function syncStreakActivity(
  userId: string,
  partnerId: string,
  streakDays: number
): Promise<void> {
  try {
    console.log('[backSyncService] Attempting to sync streak activity:', streakDays);
    
    const payload: StreakActivity = {
      userId,
      partnerId,
      streakDays,
      timestamp: Date.now(),
    };
    
    const success = await callBackendSync(BACKEND_FUNCTIONS.STREAK, payload);
    
    if (!success) {
      // Add to retry queue
      await addPendingOp(userId, 'STREAK', payload);
    } else {
      console.log('[backSyncService] Streak activity synced successfully');
    }
  } catch (error) {
    console.error('[backSyncService] Error in syncStreakActivity:', error);
    // Add to retry queue on error
    await addPendingOp(userId, 'STREAK', {
      userId,
      partnerId,
      streakDays,
      timestamp: Date.now(),
    });
  }
}

// ============================================================================
// RETRY SCHEDULER
// ============================================================================

let retryTimer: NodeJS.Timeout | null = null;

/**
 * Process pending sync operations (retry failed syncs)
 */
export async function processPendingSyncs(userId: string): Promise<void> {
  try {
    const ops = await loadPendingOps(userId);
    
    if (ops.length === 0) {
      return;
    }
    
    console.log(`[backSyncService] Processing ${ops.length} pending syncs`);
    
    for (const op of ops) {
      // Check if max retries exceeded
      if (op.retries >= MAX_RETRIES) {
        console.warn(`[backSyncService] Max retries exceeded for op ${op.id}, discarding`);
        await removePendingOp(userId, op.id);
        continue;
      }
      
      // Attempt sync based on type
      let success = false;
      
      switch (op.type) {
        case 'MESSAGE':
          success = await callBackendSync(BACKEND_FUNCTIONS.MESSAGE, op.payload);
          break;
        case 'TOKEN':
          success = await callBackendSync(BACKEND_FUNCTIONS.TOKEN, op.payload);
          break;
        case 'MEDIA_UNLOCK':
          success = await callBackendSync(BACKEND_FUNCTIONS.MEDIA_UNLOCK, op.payload);
          break;
        case 'STREAK':
          success = await callBackendSync(BACKEND_FUNCTIONS.STREAK, op.payload);
          break;
        default:
          console.warn(`[backSyncService] Unknown op type: ${op.type}`);
          await removePendingOp(userId, op.id);
          continue;
      }
      
      if (success) {
        console.log(`[backSyncService] Successfully synced op ${op.id}`);
        await removePendingOp(userId, op.id);
      } else {
        console.log(`[backSyncService] Failed to sync op ${op.id}, will retry later`);
        await incrementRetryCount(userId, op.id);
      }
    }
  } catch (error) {
    console.error('[backSyncService] Error processing pending syncs:', error);
  }
}

/**
 * Start the retry scheduler (60s periodic timer)
 */
export function startRetryScheduler(userId: string): void {
  // Clear existing timer if any
  if (retryTimer) {
    clearInterval(retryTimer);
  }
  
  console.log('[backSyncService] Starting retry scheduler');
  
  // Process immediately on start
  processPendingSyncs(userId).catch(err => {
    console.error('[backSyncService] Error in initial sync:', err);
  });
  
  // Then process every 60 seconds
  retryTimer = setInterval(() => {
    processPendingSyncs(userId).catch(err => {
      console.error('[backSyncService] Error in scheduled sync:', err);
    });
  }, RETRY_INTERVAL_MS);
}

/**
 * Stop the retry scheduler
 */
export function stopRetryScheduler(): void {
  if (retryTimer) {
    console.log('[backSyncService] Stopping retry scheduler');
    clearInterval(retryTimer);
    retryTimer = null;
  }
}

/**
 * Manually trigger sync processing (e.g., when chat screen opens)
 */
export async function triggerSync(userId: string): Promise<void> {
  console.log('[backSyncService] Manual sync trigger');
  await processPendingSyncs(userId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  syncMessage,
  syncTokenSpent,
  syncMediaUnlock,
  syncStreakActivity,
  startRetryScheduler,
  stopRetryScheduler,
  triggerSync,
  processPendingSyncs,
  getPendingOpsCount,
};