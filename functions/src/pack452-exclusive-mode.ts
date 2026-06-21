import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 452 — Exclusive Mode v2
 *
 * When a premium offer with exclusive=true is accepted:
 * - Earner cannot respond in other PAID chats
 * - Other premium offers are auto-rejected
 * - New paid chats blocked until exclusive ends
 * - Free chats allowed but responses blocked until exclusive ends
 *
 * Exclusive duration: active until chat ends or 30 min inactivity.
 * Exclusive does NOT change multiplier logic — it changes concurrency availability.
 *
 * On end:
 * - chat.monetizationState reverts to FREE_PHASE or PAID_STANDARD
 *
 * INVARIANTS PRESERVED:
 * - Free chemistry messages unchanged
 * - Chat initiation never blocked (but earner responses blocked in other paid chats)
 * - No concurrency limits introduced for non-exclusive chats
 *
 * @module pack452-exclusive-mode
 * @version 1.0.0
 */

import { db, serverTimestamp } from './init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  ExclusiveLock,
  EXCLUSIVE_INACTIVITY_TIMEOUT_MS,
  ChatMonetizationState,
} from './types/pack452-monetization-vnext.types';

// ============================================================================
// EXCLUSIVE LOCK MANAGEMENT
// ============================================================================

/**
 * Check if an earner currently has an active exclusive lock.
 *
 * @param earnerId - The earner's user ID
 * @returns The exclusive lock if active, null otherwise
 */
export async function getExclusiveLock(earnerId: string): Promise<ExclusiveLock | null> {
  const lockDoc = await db.collection('exclusiveLocks').doc(earnerId).get();

  if (!lockDoc.exists) {
    return null;
  }

  const lock = lockDoc.data() as ExclusiveLock;

  // Check if the lock has expired due to inactivity
  const lastActivity = lock.lastActivityAt?.toDate?.() || new Date(0);
  const elapsed = Date.now() - lastActivity.getTime();

  if (elapsed >= EXCLUSIVE_INACTIVITY_TIMEOUT_MS) {
    // Lock expired — clean up asynchronously
    await endExclusiveMode(earnerId, lock.chatId, 'INACTIVITY_TIMEOUT');
    return null;
  }

  return lock;
}

/**
 * Check if an earner can respond in a specific chat.
 * During exclusive mode, the earner can only respond in the exclusive chat.
 * Free chats are allowed to exist but responses are blocked.
 *
 * @param earnerId - The earner's user ID
 * @param chatId - The chat the earner wants to respond in
 * @returns Whether the earner can respond
 */
export async function canEarnerRespondInChat(
  earnerId: string,
  chatId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const lock = await getExclusiveLock(earnerId);

  if (!lock) {
    // No exclusive lock — earner can respond anywhere
    return { allowed: true };
  }

  if (lock.chatId === chatId) {
    // This IS the exclusive chat — allowed
    return { allowed: true };
  }

  // Check if the target chat is a free chat
  const chatDoc = await db.collection('chats').doc(chatId).get();
  if (!chatDoc.exists) {
    return { allowed: false, reason: 'Chat not found' };
  }

  const chatData = chatDoc.data()!;
  const mode = chatData.mode;

  // Free chats exist but responses are blocked during exclusive
  return {
    allowed: false,
    reason: `You are in an exclusive session. Please finish your exclusive chat before responding here.`,
  };
}

/**
 * Check if a new paid chat can be started with this earner.
 * During exclusive mode, new paid chats are blocked.
 *
 * @param earnerId - The earner's user ID
 * @returns Whether a new paid chat can be started
 */
export async function canStartNewPaidChat(
  earnerId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const lock = await getExclusiveLock(earnerId);

  if (!lock) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'This user is currently in an exclusive session. Please try again later.',
  };
}

/**
 * Check if a premium offer can be accepted by this earner.
 * During exclusive mode, other premium offers are auto-rejected.
 *
 * @param earnerId - The earner's user ID
 * @param chatId - The chat the offer is for
 * @returns Whether the offer can be accepted
 */
export async function canAcceptPremiumOffer(
  earnerId: string,
  chatId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const lock = await getExclusiveLock(earnerId);

  if (!lock) {
    return { allowed: true };
  }

  // If the offer is for the same exclusive chat, it could be an upgrade
  if (lock.chatId === chatId) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'Cannot accept premium offers while in an exclusive session',
  };
}

// ============================================================================
// EXCLUSIVE MODE LIFECYCLE
// ============================================================================

/**
 * Update the last activity timestamp for an exclusive session.
 * Called whenever a message is sent in the exclusive chat.
 *
 * @param earnerId - The earner's user ID
 * @param chatId - The exclusive chat ID
 */
export async function updateExclusiveActivity(
  earnerId: string,
  chatId: string
): Promise<void> {
  const lockRef = db.collection('exclusiveLocks').doc(earnerId);
  const lockDoc = await lockRef.get();

  if (!lockDoc.exists) return;

  const lock = lockDoc.data() as ExclusiveLock;
  if (lock.chatId !== chatId) return;

  await lockRef.update({
    lastActivityAt: serverTimestamp(),
  });
}

/**
 * End exclusive mode for an earner.
 * Releases the lock and reverts the chat monetization state.
 *
 * @param earnerId - The earner's user ID
 * @param chatId - The exclusive chat ID
 * @param reason - Why exclusive mode is ending
 */
export async function endExclusiveMode(
  earnerId: string,
  chatId: string,
  reason: 'CHAT_ENDED' | 'INACTIVITY_TIMEOUT' | 'MANUAL_END'
): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const lockRef = db.collection('exclusiveLocks').doc(earnerId);
    const lockDoc = await transaction.get(lockRef);

    if (!lockDoc.exists) return;

    const lock = lockDoc.data() as ExclusiveLock;
    if (lock.chatId !== chatId) return;

    // Delete the exclusive lock
    transaction.delete(lockRef);

    // Revert chat monetization state
    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await transaction.get(chatRef);

    if (chatDoc.exists) {
      const chatData = chatDoc.data()!;
      const currentState = chatData.monetizationState as ChatMonetizationState;

      if (currentState === 'EXCLUSIVE_ACTIVE') {
        // Determine what state to revert to
        const premiumContext = chatData.premiumContext;
        let newState: ChatMonetizationState;

        if (reason === 'CHAT_ENDED') {
          newState = 'FREE_PHASE';
        } else if (premiumContext && premiumContext.multiplier > 1) {
          // Premium is still active, just exclusive ended
          newState = 'PAID_PREMIUM';
        } else {
          newState = chatData.state === 'PAID_ACTIVE' ? 'PAID_STANDARD' : 'FREE_PHASE';
        }

        const updateData: Record<string, any> = {
          monetizationState: newState,
          updatedAt: serverTimestamp(),
        };

        // If premium context exists, clear the exclusive flag
        if (premiumContext) {
          updateData['premiumContext.exclusive'] = false;
          updateData['premiumContext.exclusiveExpiresAt'] = serverTimestamp();
        }

        transaction.update(chatRef, updateData);
      }
    }

    // Log exclusive session end
    const logRef = db.collection('exclusiveSessionLogs').doc();
    transaction.set(logRef, {
      earnerId,
      chatId,
      offerId: lock.offerId,
      payerId: lock.payerId,
      activatedAt: lock.activatedAt,
      endedAt: serverTimestamp(),
      endReason: reason,
    });
  });
}

// ============================================================================
// SCHEDULED: CHECK EXPIRED EXCLUSIVE LOCKS
// ============================================================================

/**
 * Check and expire all exclusive locks that have been inactive for 30+ minutes.
 * Called by the scheduled job.
 */
export async function expireInactiveExclusiveLocks(): Promise<number> {
  const cutoff = Timestamp.fromMillis(Date.now() - EXCLUSIVE_INACTIVITY_TIMEOUT_MS);

  const expiredLocks = await db.collection('exclusiveLocks')
    .where('lastActivityAt', '<', cutoff)
    .get();

  let expiredCount = 0;

  for (const doc of expiredLocks.docs) {
    const lock = doc.data() as ExclusiveLock;
    try {
      await endExclusiveMode(doc.id, lock.chatId, 'INACTIVITY_TIMEOUT');
      expiredCount++;
    } catch (error) {
      console.error(`Failed to expire exclusive lock for earner ${doc.id}:`, error);
    }
  }

  return expiredCount;
}

























