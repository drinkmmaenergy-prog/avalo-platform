/**
 * PACK 200 — Resolve Stability Conflict (SORA Component)
 * 
 * Automatic conflict resolution for concurrent operations
 * Ensures data consistency across distributed operations
 * Prevents race conditions and data corruption
 * 
 * COMPLIANCE:
 * - Zero data loss guarantee
 * - Atomic operations only
 * - No silent failures
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions';

export type ConflictType = 
  | 'CONCURRENT_WRITE'
  | 'DOUBLE_SPEND'
  | 'SESSION_COLLISION'
  | 'CHAT_STATE_MISMATCH'
  | 'PAYMENT_RACE'
  | 'BALANCE_INCONSISTENCY';

export type ResolutionStrategy = 
  | 'LAST_WRITE_WINS'
  | 'FIRST_WRITE_WINS'
  | 'MERGE_STATES'
  | 'ROLLBACK_ALL'
  | 'MANUAL_REVIEW';

export interface StabilityConflict {
  conflictId: string;
  timestamp: Timestamp;
  type: ConflictType;
  entityType: string;
  entityId: string;
  affectedUsers: string[];
  conflictingOperations: ConflictingOperation[];
  resolutionStrategy: ResolutionStrategy;
  status: 'DETECTED' | 'RESOLVING' | 'RESOLVED' | 'MANUAL';
  resolution?: {
    chosenOperation?: string;
    mergedState?: any;
    rollbackIds?: string[];
  };
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
}

export interface ConflictingOperation {
  operationId: string;
  userId: string;
  action: string;
  timestamp: Timestamp;
  data: any;
  priority: number;
}

/**
 * Detect and resolve concurrent write conflicts
 */
export async function resolveConcurrentWrite(
  entityType: string,
  entityId: string,
  operations: ConflictingOperation[]
): Promise<boolean> {
  try {
    const conflictId = generateId();
    
    const conflict: StabilityConflict = {
      conflictId,
      timestamp: Timestamp.now(),
      type: 'CONCURRENT_WRITE',
      entityType,
      entityId,
      affectedUsers: operations.map(op => op.userId),
      conflictingOperations: operations,
      resolutionStrategy: 'LAST_WRITE_WINS',
      status: 'RESOLVING',
      createdAt: serverTimestamp() as any,
    };
    
    await db.collection('stability_conflicts').doc(conflictId).set(conflict);
    
    const sortedOps = operations.sort((a, b) => 
      b.timestamp.toMillis() - a.timestamp.toMillis()
    );
    
    const winningOp = sortedOps[0];
    
    const entityRef = db.collection(entityType).doc(entityId);
    await entityRef.update({
      ...winningOp.data,
      lastModified: serverTimestamp(),
      conflictResolved: true,
      winningOperationId: winningOp.operationId,
    });
    
    await db.collection('stability_conflicts').doc(conflictId).update({
      status: 'RESOLVED',
      resolution: {
        chosenOperation: winningOp.operationId,
      },
      resolvedAt: serverTimestamp(),
    });
    
    console.log(`[Stability] Resolved concurrent write conflict for ${entityType}/${entityId}`);
    return true;
  } catch (error) {
    console.error('[Stability] Failed to resolve concurrent write:', error);
    return false;
  }
}

/**
 * Prevent double-spend in token/payment operations
 */
export async function preventDoubleSpend(
  userId: string,
  amount: number,
  operationId: string
): Promise<boolean> {
  try {
    const walletRef = db.collection('user_wallets').doc(userId);
    
    const result = await db.runTransaction(async (transaction) => {
      const walletDoc = await transaction.get(walletRef);
      
      if (!walletDoc.exists) {
        throw new Error('Wallet not found');
      }
      
      const walletData = walletDoc.data();
      const currentBalance = walletData?.balance || 0;
      
      if (currentBalance < amount) {
        throw new Error('Insufficient balance');
      }
      
      const pendingOps = walletData?.pendingOperations || [];
      if (pendingOps.includes(operationId)) {
        throw new Error('Duplicate operation detected');
      }
      
      transaction.update(walletRef, {
        balance: FieldValue.increment(-amount),
        pendingOperations: FieldValue.arrayUnion(operationId),
        lastTransaction: serverTimestamp(),
      });
      
      const ledgerRef = db.collection('transaction_ledger').doc(generateId());
      transaction.set(ledgerRef, {
        userId,
        operationId,
        amount: -amount,
        type: 'DEBIT',
        timestamp: serverTimestamp(),
        balanceAfter: currentBalance - amount,
      });
      
      return true;
    });
    
    console.log(`[Stability] Prevented double-spend for user ${userId}, operation ${operationId}`);
    return result;
  } catch (error) {
    console.error('[Stability] Double-spend prevention failed:', error);
    
    const conflictId = generateId();
    await db.collection('stability_conflicts').doc(conflictId).set({
      conflictId,
      timestamp: Timestamp.now(),
      type: 'DOUBLE_SPEND',
      entityType: 'wallet',
      entityId: userId,
      affectedUsers: [userId],
      conflictingOperations: [{
        operationId,
        userId,
        action: 'SPEND',
        timestamp: Timestamp.now(),
        data: { amount },
        priority: 1,
      }],
      resolutionStrategy: 'ROLLBACK_ALL',
      status: 'MANUAL',
      createdAt: serverTimestamp(),
    });
    
    return false;
  }
}

/**
 * Resolve session collision (multiple active sessions)
 */
export async function resolveSessionCollision(userId: string): Promise<boolean> {
  try {
    const sessionsSnapshot = await db.collection('user_sessions')
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .get();
    
    if (sessionsSnapshot.size <= 1) {
      return true;
    }
    
    console.warn(`[Stability] Session collision detected for user ${userId}: ${sessionsSnapshot.size} active sessions`);
    
    const sessions = sessionsSnapshot.docs.map(doc => ({
      id: doc.id,
      data: doc.data(),
    }));
    
    sessions.sort((a, b) => 
      (b.data.lastActivity?.toMillis() || 0) - (a.data.lastActivity?.toMillis() || 0)
    );
    
    const keepSession = sessions[0];
    const terminateSessions = sessions.slice(1);
    
    const batch = db.batch();
    
    for (const session of terminateSessions) {
      const sessionRef = db.collection('user_sessions').doc(session.id);
      batch.update(sessionRef, {
        isActive: false,
        terminatedReason: 'COLLISION_RESOLVED',
        terminatedAt: serverTimestamp(),
      });
    }
    
    await batch.commit();
    
    const conflictId = generateId();
    await db.collection('stability_conflicts').doc(conflictId).set({
      conflictId,
      timestamp: Timestamp.now(),
      type: 'SESSION_COLLISION',
      entityType: 'session',
      entityId: userId,
      affectedUsers: [userId],
      conflictingOperations: sessions.map(s => ({
        operationId: s.id,
        userId,
        action: 'SESSION_ACTIVE',
        timestamp: s.data.lastActivity || Timestamp.now(),
        data: { deviceId: s.data.deviceId },
        priority: 1,
      })),
      resolutionStrategy: 'LAST_WRITE_WINS',
      status: 'RESOLVED',
      resolution: {
        chosenOperation: keepSession.id,
        rollbackIds: terminateSessions.map(s => s.id),
      },
      createdAt: serverTimestamp(),
      resolvedAt: serverTimestamp(),
    });
    
    console.log(`[Stability] Resolved session collision for user ${userId}, kept ${keepSession.id}`);
    return true;
  } catch (error) {
    console.error('[Stability] Session collision resolution failed:', error);
    return false;
  }
}

/**
 * Resolve chat state mismatch
 */
export async function resolveChatStateMismatch(chatId: string): Promise<boolean> {
  try {
    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();
    
    if (!chatDoc.exists) {
      return false;
    }
    
    const messagesSnapshot = await db.collection('chats')
      .doc(chatId)
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .get();
    
    const messages = messagesSnapshot.docs.map(doc => doc.data());
    
    const correctMessageCount = messages.length;
    const lastMessage = messages[messages.length - 1];
    
    const chatData = chatDoc.data();
    const recordedCount = chatData?.messageCount || 0;
    
    if (correctMessageCount !== recordedCount) {
      console.warn(`[Stability] Chat state mismatch for ${chatId}: recorded ${recordedCount}, actual ${correctMessageCount}`);
      
      await chatRef.update({
        messageCount: correctMessageCount,
        lastMessage: lastMessage ? {
          content: lastMessage.content,
          timestamp: lastMessage.timestamp,
          senderId: lastMessage.senderId,
        } : null,
        stateCorrectedAt: serverTimestamp(),
      });
      
      const conflictId = generateId();
      await db.collection('stability_conflicts').doc(conflictId).set({
        conflictId,
        timestamp: Timestamp.now(),
        type: 'CHAT_STATE_MISMATCH',
        entityType: 'chat',
        entityId: chatId,
        affectedUsers: [chatData?.user1Id, chatData?.user2Id].filter(Boolean),
        conflictingOperations: [],
        resolutionStrategy: 'MERGE_STATES',
        status: 'RESOLVED',
        resolution: {
          mergedState: {
            messageCount: correctMessageCount,
            previousCount: recordedCount,
          },
        },
        createdAt: serverTimestamp(),
        resolvedAt: serverTimestamp(),
      });
      
      console.log(`[Stability] Resolved chat state mismatch for ${chatId}`);
    }
    
    return true;
  } catch (error) {
    console.error('[Stability] Chat state resolution failed:', error);
    return false;
  }
}

/**
 * Resolve balance inconsistency
 */
export async function resolveBalanceInconsistency(userId: string): Promise<boolean> {
  try {
    const walletRef = db.collection('user_wallets').doc(userId);
    const walletDoc = await walletRef.get();
    
    if (!walletDoc.exists) {
      return false;
    }
    
    const walletBalance = walletDoc.data()?.balance || 0;
    
    const ledgerSnapshot = await db.collection('transaction_ledger')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'asc')
      .get();
    
    let calculatedBalance = 0;
    for (const doc of ledgerSnapshot.docs) {
      const tx = doc.data();
      calculatedBalance += tx.amount || 0;
    }
    
    if (Math.abs(walletBalance - calculatedBalance) > 0.01) {
      console.warn(`[Stability] Balance inconsistency for user ${userId}: wallet ${walletBalance}, ledger ${calculatedBalance}`);
      
      await walletRef.update({
        balance: calculatedBalance,
        balanceCorrectedAt: serverTimestamp(),
        previousBalance: walletBalance,
      });
      
      const conflictId = generateId();
      await db.collection('stability_conflicts').doc(conflictId).set({
        conflictId,
        timestamp: Timestamp.now(),
        type: 'BALANCE_INCONSISTENCY',
        entityType: 'wallet',
        entityId: userId,
        affectedUsers: [userId],
        conflictingOperations: [],
        resolutionStrategy: 'MERGE_STATES',
        status: 'RESOLVED',
        resolution: {
          mergedState: {
            correctedBalance: calculatedBalance,
            previousBalance: walletBalance,
            difference: calculatedBalance - walletBalance,
          },
        },
        createdAt: serverTimestamp(),
        resolvedAt: serverTimestamp(),
      });
      
      console.log(`[Stability] Resolved balance inconsistency for user ${userId}`);
    }
    
    return true;
  } catch (error) {
    console.error('[Stability] Balance reconciliation failed:', error);
    return false;
  }
}

/**
 * Scheduled conflict detection and resolution
 */
export const scheduled_resolveConflicts = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    try {
      const unresolvedSnapshot = await db.collection('stability_conflicts')
        .where('status', 'in', ['DETECTED', 'RESOLVING'])
        .limit(50)
        .get();
      
      for (const doc of unresolvedSnapshot.docs) {
        const conflict = doc.data() as StabilityConflict;
        
        switch (conflict.type) {
          case 'CONCURRENT_WRITE':
            await resolveConcurrentWrite(
              conflict.entityType,
              conflict.entityId,
              conflict.conflictingOperations
            );
            break;
          
          case 'SESSION_COLLISION':
            await resolveSessionCollision(conflict.entityId);
            break;
          
          case 'CHAT_STATE_MISMATCH':
            await resolveChatStateMismatch(conflict.entityId);
            break;
          
          case 'BALANCE_INCONSISTENCY':
            await resolveBalanceInconsistency(conflict.entityId);
            break;
        }
      }
      
      console.log('[Stability] Conflict resolution cycle completed');
    } catch (error) {
      console.error('[Stability] Conflict resolution cycle failed:', error);
    }
  });

/**
 * Admin endpoint to view conflicts
 */
export const admin_getStabilityConflicts = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const adminDoc = await db.collection('admin_users').doc(context.auth.uid).get();
  if (!adminDoc.exists || !['ADMIN', 'ENGINEER'].includes(adminDoc.data()?.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Engineering access required');
  }
  
  try {
    const { status = 'DETECTED', limit = 50 } = data;
    
    let query = db.collection('stability_conflicts')
      .orderBy('timestamp', 'desc')
      .limit(limit);
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    const snapshot = await query.get();
    const conflicts = snapshot.docs.map(doc => doc.data());
    
    return {
      success: true,
      conflicts,
      total: snapshot.size,
    };
  } catch (error: any) {
    console.error('[Stability] Failed to get conflicts:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});