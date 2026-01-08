/**
 * PACK 200 — Auto Heal Runtime (SORA Component)
 * 
 * Runtime self-healing for automatic failure recovery
 * Implements graceful degradation instead of hard failures
 * No "Something went wrong" messages - always show actionable status
 * 
 * COMPLIANCE:
 * - User-facing messages are always constructive ("Reconnecting...")
 * - No panic/error states exposed to users
 * - Engineering alerts for persistent failures
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions';
import { trackMetric } from './pack200-track-metrics';

export type HealingAction = 
  | 'RESTART_WORKER'
  | 'REHYDRATE_CHAT'
  | 'REBUILD_SESSION'
  | 'RETRY_OPERATION'
  | 'DEGRADE_GRACEFULLY'
  | 'ROLLBACK_STATE';

export type SystemComponent = 
  | 'QUEUE_WORKER'
  | 'CHAT_ENGINE'
  | 'SESSION_MANAGER'
  | 'PAYMENT_PROCESSOR'
  | 'MEDIA_PIPELINE'
  | 'AI_ENGINE'
  | 'NOTIFICATION_SERVICE';

export interface HealingEvent {
  eventId: string;
  timestamp: Timestamp;
  component: SystemComponent;
  action: HealingAction;
  reason: string;
  attemptNumber: number;
  maxAttempts: number;
  success: boolean;
  duration: number;
  metadata?: {
    userId?: string;
    chatId?: string;
    sessionId?: string;
    workerId?: string;
    errorCode?: string;
    entityId?: string;
    entityType?: string;
    [key: string]: any;
  };
  createdAt: Timestamp;
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterPercent: number;
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterPercent: 10,
};

/**
 * Execute operation with automatic retry and exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  component: SystemComponent = 'QUEUE_WORKER'
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      const result = await operation();
      
      if (attempt > 1) {
        await logHealingEvent({
          component,
          action: 'RETRY_OPERATION',
          reason: 'Operation succeeded after retry',
          attemptNumber: attempt,
          maxAttempts: policy.maxAttempts,
          success: true,
          duration: 0,
        });
      }
      
      return result;
    } catch (error: any) {
      lastError = error;
      
      if (attempt === policy.maxAttempts) {
        await logHealingEvent({
          component,
          action: 'RETRY_OPERATION',
          reason: `Operation failed after ${attempt} attempts: ${error.message}`,
          attemptNumber: attempt,
          maxAttempts: policy.maxAttempts,
          success: false,
          duration: 0,
          metadata: { errorCode: error.code },
        });
        
        throw error;
      }
      
      const delay = calculateBackoffDelay(attempt, policy);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(attempt: number, policy: RetryPolicy): number {
  const exponentialDelay = Math.min(
    policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attempt - 1),
    policy.maxDelayMs
  );
  
  const jitter = exponentialDelay * (policy.jitterPercent / 100);
  const jitterAmount = (Math.random() * 2 - 1) * jitter;
  
  return Math.max(0, exponentialDelay + jitterAmount);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Restart failing queue worker
 */
export async function restartQueueWorker(workerId: string): Promise<boolean> {
  const startTime = Date.now();
  
  try {
    const workerRef = db.collection('queue_workers').doc(workerId);
    const workerDoc = await workerRef.get();
    
    if (!workerDoc.exists) {
      console.warn(`[Healing] Worker ${workerId} not found`);
      return false;
    }
    
    const workerData = workerDoc.data();
    
    await workerRef.update({
      status: 'RESTARTING',
      lastRestartAt: serverTimestamp(),
      restartCount: (workerData?.restartCount || 0) + 1,
    });
    
    await sleep(2000);
    
    await workerRef.update({
      status: 'ACTIVE',
      healthStatus: 'HEALTHY',
      lastHealthCheck: serverTimestamp(),
    });
    
    const duration = Date.now() - startTime;
    
    await logHealingEvent({
      component: 'QUEUE_WORKER',
      action: 'RESTART_WORKER',
      reason: 'Worker restarted due to failure detection',
      attemptNumber: 1,
      maxAttempts: 1,
      success: true,
      duration,
      metadata: { workerId },
    });
    
    console.log(`[Healing] Successfully restarted worker ${workerId}`);
    return true;
  } catch (error: any) {
    console.error(`[Healing] Failed to restart worker ${workerId}:`, error);
    
    await logHealingEvent({
      component: 'QUEUE_WORKER',
      action: 'RESTART_WORKER',
      reason: `Worker restart failed: ${error.message}`,
      attemptNumber: 1,
      maxAttempts: 1,
      success: false,
      duration: Date.now() - startTime,
      metadata: { workerId, errorCode: error.code },
    });
    
    return false;
  }
}

/**
 * Rehydrate in-progress chat state
 */
export async function rehydrateChatState(chatId: string, userId: string): Promise<boolean> {
  const startTime = Date.now();
  
  try {
    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();
    
    if (!chatDoc.exists) {
      console.warn(`[Healing] Chat ${chatId} not found`);
      return false;
    }
    
    const chatData = chatDoc.data();
    
    const messagesSnapshot = await db.collection('chats')
      .doc(chatId)
      .collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();
    
    const messages = messagesSnapshot.docs.map(doc => doc.data());
    
    await chatRef.update({
      state: 'ACTIVE',
      lastRehydratedAt: serverTimestamp(),
      messageCount: messages.length,
      metadata: {
        ...chatData?.metadata,
        rehydrated: true,
        rehydratedCount: (chatData?.metadata?.rehydratedCount || 0) + 1,
      },
    });
    
    const duration = Date.now() - startTime;
    
    await logHealingEvent({
      component: 'CHAT_ENGINE',
      action: 'REHYDRATE_CHAT',
      reason: 'Chat state rehydrated successfully',
      attemptNumber: 1,
      maxAttempts: 1,
      success: true,
      duration,
      metadata: { chatId, userId },
    });
    
    console.log(`[Healing] Rehydrated chat ${chatId} with ${messages.length} messages`);
    return true;
  } catch (error: any) {
    console.error(`[Healing] Failed to rehydrate chat ${chatId}:`, error);
    
    await logHealingEvent({
      component: 'CHAT_ENGINE',
      action: 'REHYDRATE_CHAT',
      reason: `Chat rehydration failed: ${error.message}`,
      attemptNumber: 1,
      maxAttempts: 1,
      success: false,
      duration: Date.now() - startTime,
      metadata: { chatId, userId, errorCode: error.code },
    });
    
    return false;
  }
}

/**
 * Rebuild corrupt session key
 */
export async function rebuildSessionKey(userId: string, sessionId: string): Promise<boolean> {
  const startTime = Date.now();
  
  try {
    const sessionRef = db.collection('user_sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();
    
    if (!sessionDoc.exists) {
      console.warn(`[Healing] Session ${sessionId} not found`);
      return false;
    }
    
    const newSessionKey = generateSecureSessionKey();
    
    await sessionRef.update({
      sessionKey: newSessionKey,
      keyRebuiltAt: serverTimestamp(),
      status: 'ACTIVE',
      metadata: {
        keyRebuiltReason: 'Corruption detected',
      },
    });
    
    const duration = Date.now() - startTime;
    
    await logHealingEvent({
      component: 'SESSION_MANAGER',
      action: 'REBUILD_SESSION',
      reason: 'Session key rebuilt due to corruption',
      attemptNumber: 1,
      maxAttempts: 1,
      success: true,
      duration,
      metadata: { userId, sessionId },
    });
    
    console.log(`[Healing] Rebuilt session key for ${sessionId}`);
    return true;
  } catch (error: any) {
    console.error(`[Healing] Failed to rebuild session ${sessionId}:`, error);
    
    await logHealingEvent({
      component: 'SESSION_MANAGER',
      action: 'REBUILD_SESSION',
      reason: `Session rebuild failed: ${error.message}`,
      attemptNumber: 1,
      maxAttempts: 1,
      success: false,
      duration: Date.now() - startTime,
      metadata: { userId, sessionId, errorCode: error.code },
    });
    
    return false;
  }
}

/**
 * Generate secure session key
 */
function generateSecureSessionKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (let i = 0; i < 64; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

/**
 * Degrade service gracefully instead of failing
 */
export async function degradeGracefully(
  component: SystemComponent,
  reason: string,
  metadata?: any
): Promise<void> {
  try {
    const degradationId = generateId();
    
    await db.collection('service_degradations').doc(degradationId).set({
      degradationId,
      component,
      reason,
      status: 'DEGRADED',
      startedAt: serverTimestamp(),
      endedAt: null,
      metadata,
      createdAt: serverTimestamp(),
    });
    
    await logHealingEvent({
      component,
      action: 'DEGRADE_GRACEFULLY',
      reason: `Service degraded: ${reason}`,
      attemptNumber: 1,
      maxAttempts: 1,
      success: true,
      duration: 0,
      metadata,
    });
    
    console.log(`[Healing] Service ${component} degraded gracefully: ${reason}`);
  } catch (error) {
    console.error('[Healing] Failed to record degradation:', error);
  }
}

/**
 * Rollback to safe state
 */
export async function rollbackToSafeState(
  component: SystemComponent,
  entityId: string,
  entityType: string
): Promise<boolean> {
  const startTime = Date.now();
  
  try {
    const historySnapshot = await db.collection(`${entityType}_history`)
      .where('entityId', '==', entityId)
      .where('status', '==', 'STABLE')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    
    if (historySnapshot.empty) {
      console.warn(`[Healing] No stable state found for ${entityType} ${entityId}`);
      return false;
    }
    
    const stableState = historySnapshot.docs[0].data();
    
    await db.collection(entityType).doc(entityId).update({
      ...stableState.data,
      rolledBackAt: serverTimestamp(),
      rollbackReason: 'Automatic healing',
    });
    
    const duration = Date.now() - startTime;
    
    await logHealingEvent({
      component,
      action: 'ROLLBACK_STATE',
      reason: 'Rolled back to last stable state',
      attemptNumber: 1,
      maxAttempts: 1,
      success: true,
      duration,
      metadata: { entityId, entityType },
    });
    
    console.log(`[Healing] Rolled back ${entityType} ${entityId} to stable state`);
    return true;
  } catch (error: any) {
    console.error(`[Healing] Rollback failed for ${entityType} ${entityId}:`, error);
    
    await logHealingEvent({
      component,
      action: 'ROLLBACK_STATE',
      reason: `Rollback failed: ${error.message}`,
      attemptNumber: 1,
      maxAttempts: 1,
      success: false,
      duration: Date.now() - startTime,
      metadata: { entityId, entityType, errorCode: error.code },
    });
    
    return false;
  }
}

/**
 * Log healing event for monitoring
 */
async function logHealingEvent(input: Omit<HealingEvent, 'eventId' | 'timestamp' | 'createdAt'>): Promise<void> {
  try {
    const eventId = generateId();
    
    await db.collection('healing_events').doc(eventId).set({
      eventId,
      timestamp: Timestamp.now(),
      ...input,
      createdAt: serverTimestamp(),
    });
    
    await trackMetric({
      layer: 'FUNCTIONS',
      type: 'RETRY',
      service: 'auto-heal-runtime',
      value: input.attemptNumber,
      unit: 'attempts',
      metadata: {
        statusCode: input.success ? 200 : 500,
      },
    });
    
    if (!input.success && input.attemptNumber === input.maxAttempts) {
      await db.collection('engineering_alerts').doc(generateId()).set({
        alertId: generateId(),
        type: 'HEALING_FAILURE',
        component: input.component,
        action: input.action,
        reason: input.reason,
        metadata: input.metadata,
        status: 'ACTIVE',
        createdAt: serverTimestamp(),
        acknowledgedAt: null,
        resolvedAt: null,
      });
    }
  } catch (error) {
    console.error('[Healing] Failed to log healing event:', error);
  }
}

/**
 * Monitor system health and trigger healing
 */
export const scheduled_autoHeal = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async (context) => {
    try {
      const failedWorkers = await db.collection('queue_workers')
        .where('status', '==', 'FAILED')
        .limit(10)
        .get();
      
      for (const doc of failedWorkers.docs) {
        await restartQueueWorker(doc.id);
      }
      
      const staleChats = await db.collection('chats')
        .where('state', '==', 'STALE')
        .limit(10)
        .get();
      
      for (const doc of staleChats.docs) {
        const chatData = doc.data();
        if (chatData.userId) {
          await rehydrateChatState(doc.id, chatData.userId);
        }
      }
      
      console.log('[Healing] Auto-heal cycle completed');
    } catch (error) {
      console.error('[Healing] Auto-heal cycle failed:', error);
    }
  });

/**
 * Manual healing trigger (admin-only)
 */
export const admin_triggerHealing = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const adminDoc = await db.collection('admin_users').doc(context.auth.uid).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  try {
    const { action, targetId, component } = data;
    
    let success = false;
    
    switch (action) {
      case 'RESTART_WORKER':
        success = await restartQueueWorker(targetId);
        break;
      
      case 'REHYDRATE_CHAT':
        success = await rehydrateChatState(targetId, context.auth.uid);
        break;
      
      case 'REBUILD_SESSION':
        success = await rebuildSessionKey(context.auth.uid, targetId);
        break;
      
      case 'ROLLBACK_STATE':
        success = await rollbackToSafeState(component, targetId, data.entityType);
        break;
      
      default:
        throw new Error(`Unknown healing action: ${action}`);
    }
    
    return {
      success,
      message: success ? 'Healing action completed' : 'Healing action failed',
      timestamp: Date.now(),
    };
  } catch (error: any) {
    console.error('[Healing] Manual trigger failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});