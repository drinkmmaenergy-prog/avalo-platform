/**
 * PACK 353 — Chat + Call Session Recovery
 * 
 * Purpose: Auto-recovery for chat, voice, and video sessions
 * Handles: Connection drops, refunds for unused time/messages
 */

import * as admin from 'firebase-admin';

interface SessionData {
  sessionId: string;
  userId: string;
  partnerId: string;
  type: 'chat' | 'voice' | 'video';
  status: 'active' | 'interrupted' | 'completed' | 'refunded';
  startedAt: number;
  endedAt?: number;
  interruptedAt?: number;
  recoveryAttempts: number;
  lastRecoveryAt?: number;
  
  // Billing
  ratePerUnit: number; // tokens per message or per minute
  unitsConsumed: number; // messages sent or minutes used
  tokensSpent: number;
  tokensRefunded?: number;
  
  // Avalo commission
  avaloCommissionRate: number; // e.g., 0.3 for 30%
  avaloCommission: number;
}

interface RecoveryConfig {
  maxAttempts: number;
  attemptDelayMs: number;
  interruptionGracePeriodMs: number;
}

const RECOVERY_CONFIG: Record<'chat' | 'voice' | 'video', RecoveryConfig> = {
  chat: {
    maxAttempts: 3,
    attemptDelayMs: 10 * 1000, // 10 seconds
    interruptionGracePeriodMs: 2 * 60 * 1000, // 2 minutes
  },
  voice: {
    maxAttempts: 3,
    attemptDelayMs: 10 * 1000, // 10 seconds
    interruptionGracePeriodMs: 30 * 1000, // 30 seconds
  },
  video: {
    maxAttempts: 3,
    attemptDelayMs: 10 * 1000, // 10 seconds
    interruptionGracePeriodMs: 30 * 1000, // 30 seconds
  },
};

/**
 * Mark session as interrupted
 */
export async function markSessionInterrupted(
  sessionId: string,
  reason: string
): Promise<{ success: boolean }> {
  const db = admin.firestore();
  
  try {
    const sessionRef = db.collection('sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();
    
    if (!sessionDoc.exists) {
      return { success: false };
    }
    
    const session = sessionDoc.data() as SessionData;
    
    if (session.status !== 'active') {
      return { success: true }; // Already handled
    }
    
    await sessionRef.update({
      status: 'interrupted',
      interruptedAt: Date.now(),
      interruptionReason: reason,
    });
    
    // Schedule auto-reconnect
    await scheduleAutoReconnect(sessionId, session.type);
    
    return { success: true };
  } catch (error) {
    console.error('Mark session interrupted error:', error);
    return { success: false };
  }
}

/**
 * Attempt to recover session
 */
export async function attemptSessionRecovery(
  sessionId: string
): Promise<{ success: boolean; recovered?: boolean; refunded?: boolean }> {
  const db = admin.firestore();
  
  try {
    const sessionRef = db.collection('sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();
    
    if (!sessionDoc.exists) {
      return { success: false };
    }
    
    const session = sessionDoc.data() as SessionData;
    const config = RECOVERY_CONFIG[session.type];
    
    if (session.status !== 'interrupted') {
      return { success: true };
    }
    
    // Check if grace period expired
    const timeSinceInterruption = Date.now() - (session.interruptedAt || 0);
    
    if (timeSinceInterruption > config.interruptionGracePeriodMs) {
      // Grace period expired, initiate refund
      const refundResult = await initiateSessionRefund(sessionId, session);
      return {
        success: true,
        recovered: false,
        refunded: refundResult.success,
      };
    }
    
    // Check if max attempts reached
    if (session.recoveryAttempts >= config.maxAttempts) {
      // Max attempts reached, initiate refund
      const refundResult = await initiateSessionRefund(sessionId, session);
      return {
        success: true,
        recovered: false,
        refunded: refundResult.success,
      };
    }
    
    // Check if both parties are online
    const bothOnline = await checkParticipantsOnline(session.userId, session.partnerId);
    
    if (bothOnline) {
      // Attempt recovery
      await sessionRef.update({
        status: 'active',
        recoveryAttempts: admin.firestore.FieldValue.increment(1),
        lastRecoveryAt: Date.now(),
      });
      
      // Notify clients to reconnect
      await notifySessionRecovery(session);
      
      return { success: true, recovered: true };
    } else {
      // Increment recovery attempts
      await sessionRef.update({
        recoveryAttempts: admin.firestore.FieldValue.increment(1),
        lastRecoveryAt: Date.now(),
      });
      
      // Schedule next retry
      await scheduleAutoReconnect(sessionId, session.type);
      
      return { success: true, recovered: false };
    }
  } catch (error) {
    console.error('Session recovery error:', error);
    return { success: false };
  }
}

/**
 * Initiate refund for interrupted session
 */
async function initiateSessionRefund(
  sessionId: string,
  session: SessionData
): Promise<{ success: boolean; refundAmount?: number }> {
  const db = admin.firestore();
  
  try {
    // Calculate refund based on session type
    let refundAmount = 0;
    
    if (session.type === 'chat') {
      // For chat: no refund needed (pay per message)
      // Only counted messages were charged
      refundAmount = 0;
    } else {
      // For voice/video: refund unused time
      const timeSinceInterruption = Date.now() - (session.interruptedAt || session.startedAt);
      const minutesSinceInterruption = Math.floor(timeSinceInterruption / (60 * 1000));
      
      // Refund tokens for minutes not used due to interruption
      // Assuming billing happens per minute
      const unusedMinutes = Math.max(0, session.unitsConsumed - minutesSinceInterruption / (60 * 1000));
      refundAmount = Math.floor(unusedMinutes * session.ratePerUnit);
    }
    
    if (refundAmount > 0) {
      // Process refund (tokens back to user)
      await db.runTransaction(async (transaction) => {
        const walletRef = db.collection('wallets').doc(session.userId);
        
        transaction.update(walletRef, {
          balance: admin.firestore.FieldValue.increment(refundAmount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        // Create refund transaction
        transaction.set(db.collection('transactions').doc(), {
          userId: session.userId,
          type: 'refund',
          amount: refundAmount,
          currency: 'AVALO',
          reason: 'session_interrupted',
          sessionId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        // Update session
        transaction.update(db.collection('sessions').doc(sessionId), {
          status: 'refunded',
          tokensRefunded: refundAmount,
          refundedAt: Date.now(),
        });
      });
    } else {
      // No refund needed, just mark as completed
      await db.collection('sessions').doc(sessionId).update({
        status: 'completed',
        endedAt: Date.now(),
      });
    }
    
    // Note: Avalo commission stays (as per requirement)
    // The commission is kept even if user gets refund
    
    return { success: true, refundAmount };
  } catch (error) {
    console.error('Session refund error:', error);
    return { success: false };
  }
}

/**
 * Check if both participants are online
 */
async function checkParticipantsOnline(
  userId: string,
  partnerId: string
): Promise<boolean> {
  const db = admin.firestore();
  
  try {
    const [userPresence, partnerPresence] = await Promise.all([
      db.collection('presence').doc(userId).get(),
      db.collection('presence').doc(partnerId).get(),
    ]);
    
    const userOnline = userPresence.exists && userPresence.data()?.online === true;
    const partnerOnline = partnerPresence.exists && partnerPresence.data()?.online === true;
    
    return userOnline && partnerOnline;
  } catch (error) {
    console.error('Check participants online error:', error);
    return false;
  }
}

/**
 * Schedule auto-reconnect attempt
 */
async function scheduleAutoReconnect(
  sessionId: string,
  sessionType: 'chat' | 'voice' | 'video'
): Promise<void> {
  const db = admin.firestore();
  const config = RECOVERY_CONFIG[sessionType];
  
  await db.collection('scheduledRecoveryAttempts').add({
    sessionId,
    sessionType,
    scheduledFor: Date.now() + config.attemptDelayMs,
    status: 'scheduled',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Notify clients about session recovery
 */
async function notifySessionRecovery(session: SessionData): Promise<void> {
  const db = admin.firestore();
  
  // Send notifications to both participants
  const notifications = [
    {
      userId: session.userId,
      type: 'session_recovered',
      sessionId: session.sessionId,
      sessionType: session.type,
      message: 'Your session has been recovered. Please reconnect.',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      userId: session.partnerId,
      type: 'session_recovered',
      sessionId: session.sessionId,
      sessionType: session.type,
      message: 'Your session has been recovered. Please reconnect.',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    },
  ];
  
  const batch = db.batch();
  
  notifications.forEach((notification) => {
    const ref = db.collection('notifications').doc();
    batch.set(ref, notification);
  });
  
  await batch.commit();
}

/**
 * Process scheduled recovery attempts (scheduled function)
 */
export async function processScheduledRecoveryAttempts(): Promise<void> {
  const db = admin.firestore();
  const now = Date.now();
  
  const dueRecoveries = await db
    .collection('scheduledRecoveryAttempts')
    .where('status', '==', 'scheduled')
    .where('scheduledFor', '<=', now)
    .limit(50)
    .get();
  
  const promises = dueRecoveries.docs.map(async (doc) => {
    const data = doc.data();
    
    try {
      // Mark as processing
      await doc.ref.update({ status: 'processing' });
      
      // Attempt recovery
      const result = await attemptSessionRecovery(data.sessionId);
      
      // Mark as completed
      await doc.ref.update({
        status: 'completed',
        completedAt: Date.now(),
        result: result.recovered ? 'recovered' : result.refunded ? 'refunded' : 'failed',
      });
    } catch (error) {
      console.error('Recovery attempt processing error:', error);
      await doc.ref.update({
        status: 'error',
        error: String(error),
      });
    }
  });
  
  await Promise.all(promises);
  
  console.log(`Processed ${dueRecoveries.size} scheduled recovery attempts`);
}

/**
 * Get session status
 */
export async function getSessionStatus(
  sessionId: string
): Promise<SessionData | null> {
  const db = admin.firestore();
  
  const doc = await db.collection('sessions').doc(sessionId).get();
  
  if (!doc.exists) {
    return null;
  }
  
  return doc.data() as SessionData;
}

/**
 * Clean up old recovery attempts (scheduled function)
 */
export async function cleanupOldRecoveryAttempts(): Promise<void> {
  const db = admin.firestore();
  const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
  
  const batch = db.batch();
  const oldAttempts = await db
    .collection('scheduledRecoveryAttempts')
    .where('createdAt', '<', new Date(cutoffTime))
    .where('status', 'in', ['completed', 'error'])
    .limit(500)
    .get();
  
  oldAttempts.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  
  console.log(`Cleaned up ${oldAttempts.size} old recovery attempts`);
}
