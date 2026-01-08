/**
 * Interaction Service
 * Handles likes, SuperLikes, matches, and swipe interactions
 */

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  writeBatch,
  addDoc,
} from 'firebase/firestore';
import { hasEnoughTokens, processMessageTransaction } from './tokenService';
import { DISCOVERY_CONFIG } from '../config/monetization';

export type SwipeAction = 'like' | 'skip' | 'superlike';

export interface Interaction {
  id?: string;
  fromUserId: string;
  toUserId: string;
  action: SwipeAction;
  isSuperLike: boolean;
  createdAt: Date;
  matchCreated?: boolean;
}

export interface Match {
  id?: string;
  users: [string, string];
  chatId?: string;
  createdAt: Date;
  lastActivity?: Date;
}

/**
 * Check if two users have matched
 */
async function checkForMatch(userId1: string, userId2: string): Promise<boolean> {
  try {
    const db = getFirestore();
    const interactionsRef = collection(db, 'interactions');

    // Check if userId1 liked userId2
    const q1 = query(
      interactionsRef,
      where('fromUserId', '==', userId1),
      where('toUserId', '==', userId2),
      where('action', '==', 'like')
    );

    // Check if userId2 liked userId1
    const q2 = query(
      interactionsRef,
      where('fromUserId', '==', userId2),
      where('toUserId', '==', userId1),
      where('action', '==', 'like')
    );

    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

    return !snap1.empty && !snap2.empty;
  } catch (error) {
    console.error('Error checking for match:', error);
    return false;
  }
}

/**
 * Create a match between two users
 */
async function createMatch(userId1: string, userId2: string): Promise<string> {
  try {
    const db = getFirestore();
    const matchesRef = collection(db, 'matches');

    // Check if match already exists
    const existingMatchQuery = query(
      matchesRef,
      where('users', 'array-contains', userId1)
    );
    const existingSnap = await getDocs(existingMatchQuery);
    
    for (const doc of existingSnap.docs) {
      const data = doc.data();
      if (data.users.includes(userId2)) {
        return doc.id; // Match already exists
      }
    }

    // Create new match
    const matchDoc = await addDoc(matchesRef, {
      users: [userId1, userId2],
      createdAt: serverTimestamp(),
      lastActivity: serverTimestamp(),
    });

    return matchDoc.id;
  } catch (error) {
    console.error('Error creating match:', error);
    throw error;
  }
}

/**
 * Create or get existing chat for a match
 */
async function getOrCreateChatForMatch(
  matchId: string,
  userId1: string,
  userId2: string
): Promise<string> {
  try {
    const db = getFirestore();
    const chatsRef = collection(db, 'chats');

    // Check if chat already exists for these users
    const q = query(chatsRef, where('participants', 'array-contains', userId1));
    const snapshot = await getDocs(q);

    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data.participants.includes(userId2)) {
        return doc.id; // Chat already exists
      }
    }

    // Create new chat
    const chatDoc = await addDoc(chatsRef, {
      participants: [userId1, userId2],
      matchId,
      createdAt: serverTimestamp(),
      lastMessage: null,
      lastTimestamp: serverTimestamp(),
      unreadCountPerUser: {
        [userId1]: 0,
        [userId2]: 0,
      },
    });

    // Update match with chatId
    await setDoc(
      doc(db, 'matches', matchId),
      { chatId: chatDoc.id },
      { merge: true }
    );

    return chatDoc.id;
  } catch (error) {
    console.error('Error creating chat for match:', error);
    throw error;
  }
}

/**
 * Record a like interaction
 */
export async function recordLike(
  fromUserId: string,
  toUserId: string,
  isSuperLike: boolean = false
): Promise<{ matchCreated: boolean; chatId?: string; matchId?: string }> {
  try {
    const db = getFirestore();
    const interactionsRef = collection(db, 'interactions');

    // Check if user already interacted with this profile
    const existingQuery = query(
      interactionsRef,
      where('fromUserId', '==', fromUserId),
      where('toUserId', '==', toUserId)
    );
    const existingSnap = await getDocs(existingQuery);

    if (!existingSnap.empty) {
      throw new Error('You have already interacted with this profile');
    }

    // Record the interaction
    await addDoc(interactionsRef, {
      fromUserId,
      toUserId,
      action: 'like',
      isSuperLike,
      createdAt: serverTimestamp(),
    });

    // Check for match
    const isMatch = await checkForMatch(fromUserId, toUserId);

    if (isMatch) {
      const matchId = await createMatch(fromUserId, toUserId);
      const chatId = await getOrCreateChatForMatch(matchId, fromUserId, toUserId);

      return {
        matchCreated: true,
        chatId,
        matchId,
      };
    }

    return { matchCreated: false };
  } catch (error) {
    console.error('Error recording like:', error);
    throw error;
  }
}

/**
 * Record a skip interaction
 */
export async function recordSkip(
  fromUserId: string,
  toUserId: string
): Promise<void> {
  try {
    const db = getFirestore();
    const interactionsRef = collection(db, 'interactions');

    await addDoc(interactionsRef, {
      fromUserId,
      toUserId,
      action: 'skip',
      isSuperLike: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error recording skip:', error);
    throw error;
  }
}

/**
 * Process SuperLike (requires tokens)
 */
export async function processSuperLike(
  fromUserId: string,
  toUserId: string
): Promise<{
  success: boolean;
  matchCreated: boolean;
  chatId?: string;
  matchId?: string;
  error?: string;
}> {
  try {
    // Use configured SuperLike cost from monetization.ts
    const SUPERLIKE_COST = DISCOVERY_CONFIG.SUPERLIKE_COST;
    
    // Check if user has enough tokens
    const hasTokens = await hasEnoughTokens(fromUserId, SUPERLIKE_COST);

    if (!hasTokens) {
      return {
        success: false,
        matchCreated: false,
        error: 'INSUFFICIENT_TOKENS',
      };
    }

    // Deduct tokens (SuperLike goes to Avalo, not the other user)
    const db = getFirestore();
    const { getTokenBalance } = await import('./tokenService');
    const currentBalance = await getTokenBalance(fromUserId);

    if (currentBalance < SUPERLIKE_COST) {
      return {
        success: false,
        matchCreated: false,
        error: 'INSUFFICIENT_TOKENS',
      };
    }

    // Deduct tokens from user's wallet
    const walletRef = doc(db, 'balances', fromUserId, 'wallet');
    await setDoc(
      walletRef,
      {
        tokens: currentBalance - SUPERLIKE_COST,
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );

    // Record transaction
    const transactionsRef = collection(db, 'transactions');
    await addDoc(transactionsRef, {
      senderUid: fromUserId,
      receiverUid: 'system',
      tokensAmount: SUPERLIKE_COST,
      avaloFee: SUPERLIKE_COST,
      chatId: 'superlike',
      transactionType: 'superlike',
      targetUserId: toUserId,
      createdAt: serverTimestamp(),
    });

    // Record the SuperLike
    const result = await recordLike(fromUserId, toUserId, true);

    return {
      success: true,
      ...result,
    };
  } catch (error) {
    console.error('Error processing SuperLike:', error);
    return {
      success: false,
      matchCreated: false,
      error: 'PROCESSING_ERROR',
    };
  }
}

/**
 * Get user's matches
 */
export async function getUserMatches(userId: string): Promise<Match[]> {
  try {
    const db = getFirestore();
    const matchesRef = collection(db, 'matches');

    const q = query(matchesRef, where('users', 'array-contains', userId));
    const snapshot = await getDocs(q);

    const matches: Match[] = [];
    snapshot.forEach((doc) => {
      matches.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        lastActivity: doc.data().lastActivity?.toDate(),
      } as Match);
    });

    return matches.sort(
      (a, b) => (b.lastActivity?.getTime() || 0) - (a.lastActivity?.getTime() || 0)
    );
  } catch (error) {
    console.error('Error getting user matches:', error);
    return [];
  }
}

/**
 * Get list of user IDs that have already been swiped (liked or skipped)
 */
export async function getSwipedUserIds(userId: string): Promise<string[]> {
  try {
    const db = getFirestore();
    const interactionsRef = collection(db, 'interactions');

    const q = query(interactionsRef, where('fromUserId', '==', userId));
    const snapshot = await getDocs(q);

    const swipedIds: string[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      swipedIds.push(data.toUserId);
    });

    return swipedIds;
  } catch (error) {
    console.error('Error getting swiped user IDs:', error);
    return [];
  }
}

/**
 * Check if user has SuperLiked another user
 */
export async function hasSuperLiked(
  fromUserId: string,
  toUserId: string
): Promise<boolean> {
  try {
    const db = getFirestore();
    const interactionsRef = collection(db, 'interactions');

    const q = query(
      interactionsRef,
      where('fromUserId', '==', fromUserId),
      where('toUserId', '==', toUserId),
      where('isSuperLike', '==', true)
    );

    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking SuperLike:', error);
    return false;
  }
}

// Export SuperLike cost from configuration
export const SUPERLIKE_COST = DISCOVERY_CONFIG.SUPERLIKE_COST;