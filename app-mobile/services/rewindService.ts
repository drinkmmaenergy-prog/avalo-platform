/**
 * Rewind Service
 * Allows users to undo their last swipe (like/skip)
 */

import {
  getFirestore,
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
  getDoc,
  setDoc,
  serverTimestamp,
  addDoc,
} from 'firebase/firestore';
import { REWIND_CONFIG, VIP_BENEFITS, ROYAL_BENEFITS } from '../config/monetization';
import { getTokenBalance } from './tokenService';

export interface LastSwipe {
  id: string;
  fromUserId: string;
  toUserId: string;
  action: 'like' | 'skip' | 'superlike';
  timestamp: Date;
  isSuperLike: boolean;
}

/**
 * Get user's last swipe within the rewind time window
 */
export async function getLastSwipe(userId: string): Promise<LastSwipe | null> {
  try {
    const db = getFirestore();
    const interactionsRef = collection(db, 'interactions');

    // Get the most recent interaction from this user
    const q = query(
      interactionsRef,
      where('fromUserId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    const swipeTime = data.createdAt?.toDate() || new Date();
    const now = new Date();
    const timeDiffMinutes = (now.getTime() - swipeTime.getTime()) / 60000;

    // Check if within rewind time window
    if (timeDiffMinutes > REWIND_CONFIG.MAX_REWIND_TIME_MINUTES) {
      return null;
    }

    return {
      id: doc.id,
      fromUserId: data.fromUserId,
      toUserId: data.toUserId,
      action: data.action,
      timestamp: swipeTime,
      isSuperLike: data.isSuperLike || false,
    };
  } catch (error) {
    console.error('Error getting last swipe:', error);
    return null;
  }
}

/**
 * Check if user has rewinds available today
 */
async function getRewindsUsedToday(
  userId: string,
  membershipType: 'none' | 'vip' | 'royal'
): Promise<number> {
  try {
    const db = getFirestore();
    
    // Royal members have unlimited rewinds
    if (membershipType === 'royal') {
      return 0;
    }

    const rewindsRef = collection(db, 'rewind_usage');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const q = query(
      rewindsRef,
      where('userId', '==', userId),
      where('date', '==', today.toISOString().split('T')[0])
    );

    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (error) {
    console.error('Error checking rewinds used:', error);
    return 0;
  }
}

/**
 * Check if user can use rewind (free or paid)
 */
export async function canUseRewind(
  userId: string,
  membershipType: 'none' | 'vip' | 'royal' = 'none'
): Promise<{ canRewind: boolean; requiresTokens: boolean; reason?: string }> {
  try {
    // Royal members have unlimited free rewinds
    if (membershipType === 'royal') {
      return { canRewind: true, requiresTokens: false };
    }

    // VIP members get 5 free rewinds per day
    if (membershipType === 'vip') {
      const rewindsUsed = await getRewindsUsedToday(userId, membershipType);
      if (rewindsUsed < VIP_BENEFITS.REWINDS_PER_DAY) {
        return { canRewind: true, requiresTokens: false };
      }
      // Exceeded free rewinds, need to pay
      return { canRewind: true, requiresTokens: true };
    }

    // Non-members must pay
    return { canRewind: true, requiresTokens: true };
  } catch (error) {
    console.error('Error checking rewind availability:', error);
    return { canRewind: false, requiresTokens: false, reason: 'ERROR' };
  }
}

/**
 * Perform rewind - undo last swipe
 */
export async function performRewind(
  userId: string,
  membershipType: 'none' | 'vip' | 'royal' = 'none'
): Promise<{
  success: boolean;
  error?: string;
  swipe?: LastSwipe;
  tokensCharged?: number;
}> {
  try {
    const db = getFirestore();

    // Get last swipe
    const lastSwipe = await getLastSwipe(userId);
    if (!lastSwipe) {
      return {
        success: false,
        error: 'NO_RECENT_SWIPE',
      };
    }

    // Check if user can rewind
    const { canRewind, requiresTokens } = await canUseRewind(userId, membershipType);
    
    if (!canRewind) {
      return {
        success: false,
        error: 'REWIND_NOT_AVAILABLE',
      };
    }

    let tokensCharged = 0;

    // Charge tokens if required
    if (requiresTokens) {
      const balance = await getTokenBalance(userId);
      const rewindCost = REWIND_CONFIG.COST;

      if (balance < rewindCost) {
        return {
          success: false,
          error: 'INSUFFICIENT_TOKENS',
        };
      }

      // Deduct tokens
      const walletRef = doc(db, 'balances', userId, 'wallet');
      await setDoc(
        walletRef,
        {
          tokens: balance - rewindCost,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );

      tokensCharged = rewindCost;

      // Record transaction
      const transactionsRef = collection(db, 'transactions');
      await addDoc(transactionsRef, {
        senderUid: userId,
        receiverUid: 'system',
        tokensAmount: rewindCost,
        avaloFee: rewindCost,
        chatId: 'rewind',
        transactionType: 'rewind',
        createdAt: serverTimestamp(),
      });
    }

    // If it was a SuperLike, refund the tokens
    if (lastSwipe.isSuperLike) {
      // Get SuperLike cost from config
      const { DISCOVERY_CONFIG } = await import('../config/monetization');
      const superlikeCost = DISCOVERY_CONFIG.SUPERLIKE_COST;

      const walletRef = doc(db, 'balances', userId, 'wallet');
      const currentBalance = await getTokenBalance(userId);
      
      await setDoc(
        walletRef,
        {
          tokens: currentBalance + superlikeCost,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );

      // Record refund transaction
      const transactionsRef = collection(db, 'transactions');
      await addDoc(transactionsRef, {
        senderUid: 'system',
        receiverUid: userId,
        tokensAmount: superlikeCost,
        avaloFee: 0,
        chatId: 'rewind_refund',
        transactionType: 'refund',
        originalSwipeId: lastSwipe.id,
        createdAt: serverTimestamp(),
      });
    }

    // Delete the interaction
    const interactionRef = doc(db, 'interactions', lastSwipe.id);
    await deleteDoc(interactionRef);

    // Record rewind usage (for VIP daily limit tracking)
    if (membershipType === 'vip' && !requiresTokens) {
      const today = new Date().toISOString().split('T')[0];
      const rewindUsageRef = collection(db, 'rewind_usage');
      await addDoc(rewindUsageRef, {
        userId,
        date: today,
        timestamp: serverTimestamp(),
        wasFree: true,
      });
    }

    return {
      success: true,
      swipe: lastSwipe,
      tokensCharged,
    };
  } catch (error) {
    console.error('Error performing rewind:', error);
    return {
      success: false,
      error: 'PROCESSING_ERROR',
    };
  }
}

/**
 * Get rewinds remaining for VIP members today
 */
export async function getRewindsRemaining(
  userId: string,
  membershipType: 'none' | 'vip' | 'royal'
): Promise<number> {
  if (membershipType === 'royal') {
    return 999; // Unlimited
  }
  
  if (membershipType === 'vip') {
    const used = await getRewindsUsedToday(userId, membershipType);
    return Math.max(0, VIP_BENEFITS.REWINDS_PER_DAY - used);
  }

  return 0; // Non-members must pay
}