/**
 * Tips Service
 * Handles tipping functionality for feed posts and profiles
 */

import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { TIPS_CONFIG } from '../config/monetization';
import { getTokenBalance } from './tokenService';

const getDb = () => {
  try {
    const app = getApp();
    return getFirestore(app);
  } catch (error) {
    console.error('Error getting Firestore instance:', error);
    throw error;
  }
};

export interface TipResult {
  success: boolean;
  error?: string;
  transactionId?: string;
  creatorAmount?: number;
  avaloFee?: number;
}

/**
 * Validate tip amount
 */
export function validateTipAmount(amount: number): {
  valid: boolean;
  error?: string;
} {
  if (amount < TIPS_CONFIG.MIN_TIP_AMOUNT) {
    return {
      valid: false,
      error: `Minimum tip is ${TIPS_CONFIG.MIN_TIP_AMOUNT} tokens`,
    };
  }

  if (amount > TIPS_CONFIG.MAX_TIP_AMOUNT) {
    return {
      valid: false,
      error: `Maximum tip is ${TIPS_CONFIG.MAX_TIP_AMOUNT} tokens`,
    };
  }

  return { valid: true };
}

/**
 * Calculate tip split
 */
export function calculateTipSplit(tipAmount: number): {
  creatorAmount: number;
  avaloFee: number;
} {
  const avaloFee = Math.floor(tipAmount * TIPS_CONFIG.TIP_FEE_PERCENTAGE);
  const creatorAmount = tipAmount - avaloFee;

  return {
    creatorAmount,
    avaloFee,
  };
}

/**
 * Send a tip to a creator
 */
export async function sendTip(
  fromUserId: string,
  toUserId: string,
  amount: number,
  context?: {
    postId?: string;
    messageId?: string;
    type?: 'feed' | 'profile' | 'chat';
  }
): Promise<TipResult> {
  try {
    const db = getDb();

    // Validate amount
    const validation = validateTipAmount(amount);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    // Check if user is tipping themselves
    if (fromUserId === toUserId) {
      return {
        success: false,
        error: 'You cannot tip yourself',
      };
    }

    // Check balance
    const balance = await getTokenBalance(fromUserId);
    if (balance < amount) {
      return {
        success: false,
        error: 'INSUFFICIENT_TOKENS',
      };
    }

    // Calculate split
    const { creatorAmount, avaloFee } = calculateTipSplit(amount);

    // Deduct from sender
    const senderWalletRef = doc(db, 'balances', fromUserId, 'wallet');
    await updateDoc(senderWalletRef, {
      tokens: increment(-amount),
      lastUpdated: serverTimestamp(),
    });

    // Add to receiver
    const receiverWalletRef = doc(db, 'balances', toUserId, 'wallet');
    const receiverWallet = await getDoc(receiverWalletRef);
    
    if (!receiverWallet.exists()) {
      // Create wallet if it doesn't exist
      await updateDoc(receiverWalletRef, {
        tokens: creatorAmount,
        lastUpdated: serverTimestamp(),
      });
    } else {
      await updateDoc(receiverWalletRef, {
        tokens: increment(creatorAmount),
        lastUpdated: serverTimestamp(),
      });
    }

    // Record transaction
    const transactionsRef = collection(db, 'transactions');
    const transactionDoc = await addDoc(transactionsRef, {
      senderUid: fromUserId,
      receiverUid: toUserId,
      tokensAmount: amount,
      avaloFee,
      creatorAmount,
      transactionType: 'tip',
      context: context || {},
      createdAt: serverTimestamp(),
    });

    // Record tip in separate collection for analytics
    const tipsRef = collection(db, 'tips');
    await addDoc(tipsRef, {
      fromUserId,
      toUserId,
      amount,
      creatorAmount,
      avaloFee,
      context: context || {},
      createdAt: serverTimestamp(),
    });

    // Update creator's total tips received (for profile stats)
    const creatorStatsRef = doc(db, 'creator_stats', toUserId);
    const creatorStats = await getDoc(creatorStatsRef);
    
    if (!creatorStats.exists()) {
      await updateDoc(creatorStatsRef, {
        totalTipsReceived: amount,
        totalTipsCount: 1,
        lastTipAt: serverTimestamp(),
      });
    } else {
      await updateDoc(creatorStatsRef, {
        totalTipsReceived: increment(amount),
        totalTipsCount: increment(1),
        lastTipAt: serverTimestamp(),
      });
    }

    return {
      success: true,
      transactionId: transactionDoc.id,
      creatorAmount,
      avaloFee,
    };
  } catch (error) {
    console.error('Error sending tip:', error);
    return {
      success: false,
      error: 'PROCESSING_ERROR',
    };
  }
}

/**
 * Get common tip amounts based on config
 */
export function getCommonTipAmounts(): number[] {
  return [10, 50, 100, 500, 1000, 5000];
}

/**
 * Get total tips received by a user
 */
export async function getUserTipsReceived(userId: string): Promise<{
  totalAmount: number;
  totalCount: number;
}> {
  try {
    const db = getDb();
    const statsRef = doc(db, 'creator_stats', userId);
    const statsSnap = await getDoc(statsRef);

    if (!statsSnap.exists()) {
      return { totalAmount: 0, totalCount: 0 };
    }

    const data = statsSnap.data();
    return {
      totalAmount: data.totalTipsReceived || 0,
      totalCount: data.totalTipsCount || 0,
    };
  } catch (error) {
    console.error('Error getting user tips received:', error);
    return { totalAmount: 0, totalCount: 0 };
  }
}