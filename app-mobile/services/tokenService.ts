/**
 * Token Service
 * Handles all token-related operations including balance management,
 * transactions, and message cost calculations
 */

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  increment,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import {
  TokenWallet,
  TokenTransaction,
  MessageCostInfo,
} from '../types/tokens';
import { MESSAGING_CONFIG } from '../config/monetization';

// Initialize Firestore
const getDb = () => {
  try {
    const app = getApp();
    return getFirestore(app);
  } catch (error) {
    console.error('Error getting Firestore instance:', error);
    throw error;
  }
};

/**
 * Get user's token balance
 */
export const getTokenBalance = async (userId: string): Promise<number> => {
  try {
    const db = getDb();
    const walletRef = doc(db, 'balances', userId, 'wallet');
    const walletSnap = await getDoc(walletRef);

    if (!walletSnap.exists()) {
      // Initialize wallet if it doesn't exist
      await setDoc(walletRef, {
        tokens: 0,
        lastUpdated: serverTimestamp(),
      });
      return 0;
    }

    return walletSnap.data().tokens || 0;
  } catch (error) {
    console.error('Error getting token balance:', error);
    return 0;
  }
};

/**
 * Subscribe to token balance updates
 */
export const subscribeToTokenBalance = (
  userId: string,
  onBalanceUpdate: (balance: number) => void,
  onError?: (error: Error) => void
): (() => void) => {
  try {
    const db = getDb();
    const walletRef = doc(db, 'balances', userId, 'wallet');

    const { onSnapshot } = require('firebase/firestore');
    
    const unsubscribe = onSnapshot(
      walletRef,
      (snapshot: any) => {
        if (snapshot.exists()) {
          onBalanceUpdate(snapshot.data().tokens || 0);
        } else {
          onBalanceUpdate(0);
        }
      },
      (error: Error) => {
        console.error('Error in token balance subscription:', error);
        if (onError) {
          onError(error);
        }
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('Error subscribing to token balance:', error);
    throw error;
  }
};

/**
 * Get message count between two users in a specific chat
 */
export const getMessageCountBetweenUsers = async (
  chatId: string,
  senderId: string
): Promise<number> => {
  try {
    const db = getDb();
    const messagesRef = collection(db, `chats/${chatId}/messages`);
    
    const q = query(messagesRef, where('senderId', '==', senderId));
    const snapshot = await getDocs(q);
    
    return snapshot.size;
  } catch (error) {
    console.error('Error getting message count:', error);
    return 0;
  }
};

/**
 * Calculate if a message should be charged and how much
 */
export const calculateMessageCost = async (
  chatId: string,
  senderId: string
): Promise<MessageCostInfo> => {
  try {
    const messageCount = await getMessageCountBetweenUsers(chatId, senderId);
    const messageNumber = messageCount + 1; // Next message number

    // First X messages are free (configured in monetization.ts)
    if (messageNumber <= MESSAGING_CONFIG.FREE_MESSAGES_COUNT) {
      return {
        shouldCharge: false,
        cost: 0,
        messageNumber,
        isFreeMessage: true,
      };
    }

    // After free messages, charge per message
    return {
      shouldCharge: true,
      cost: MESSAGING_CONFIG.MESSAGE_COST,
      messageNumber,
      isFreeMessage: false,
    };
  } catch (error) {
    console.error('Error calculating message cost:', error);
    // In case of error, don't charge
    return {
      shouldCharge: false,
      cost: 0,
      messageNumber: 0,
      isFreeMessage: true,
    };
  }
};

/**
 * Deduct tokens from sender's wallet
 */
export const deductTokens = async (userId: string, amount: number): Promise<void> => {
  const db = getDb();
  const walletRef = doc(db, 'balances', userId, 'wallet');
  
  await updateDoc(walletRef, {
    tokens: increment(-amount),
    lastUpdated: serverTimestamp(),
  });
};

/**
 * Add tokens to receiver's wallet
 */
const addTokens = async (userId: string, amount: number): Promise<void> => {
  const db = getDb();
  const walletRef = doc(db, 'balances', userId, 'wallet');
  
  // Check if wallet exists
  const walletSnap = await getDoc(walletRef);
  
  if (!walletSnap.exists()) {
    // Create wallet if it doesn't exist
    await setDoc(walletRef, {
      tokens: amount,
      lastUpdated: serverTimestamp(),
    });
  } else {
    await updateDoc(walletRef, {
      tokens: increment(amount),
      lastUpdated: serverTimestamp(),
    });
  }
};

/**
 * Record a transaction in Firestore
 */
const recordTransaction = async (
  transaction: Omit<TokenTransaction, 'id' | 'createdAt'>
): Promise<string> => {
  const db = getDb();
  const transactionsRef = collection(db, 'transactions');
  
  const docRef = await addDoc(transactionsRef, {
    ...transaction,
    createdAt: serverTimestamp(),
  });
  
  return docRef.id;
};

/**
 * Process a paid message transaction
 * Deducts from sender, credits receiver (minus fee), and records transaction
 */
export const processMessageTransaction = async (
  senderId: string,
  receiverId: string,
  chatId: string,
  messageId: string,
  cost: number
): Promise<string> => {
  try {
    // Calculate Avalo fee and receiver amount
    const avaloFee = Math.floor(cost * MESSAGING_CONFIG.MESSAGE_FEE_PERCENTAGE);
    const receiverAmount = cost - avaloFee;

    // Deduct from sender
    await deductTokens(senderId, cost);

    // Add to receiver (minus Avalo fee)
    await addTokens(receiverId, receiverAmount);

    // Record transaction
    const transactionId = await recordTransaction({
      senderUid: senderId,
      receiverUid: receiverId,
      tokensAmount: cost,
      avaloFee,
      messageId,
      chatId,
      transactionType: 'message',
    });

    return transactionId;
  } catch (error) {
    console.error('Error processing message transaction:', error);
    throw error;
  }
};

/**
 * Add tokens to user's wallet (after purchase)
 */
export const addTokensAfterPurchase = async (
  userId: string,
  tokens: number,
  transactionId?: string
): Promise<void> => {
  try {
    await addTokens(userId, tokens);

    // Record purchase transaction
    if (transactionId) {
      await recordTransaction({
        senderUid: 'system',
        receiverUid: userId,
        tokensAmount: tokens,
        avaloFee: 0,
        chatId: 'purchase',
        transactionType: 'purchase',
      });
    }
  } catch (error) {
    console.error('Error adding tokens after purchase:', error);
    throw error;
  }
};

/**
 * Check if user has enough tokens for a message
 */
export const hasEnoughTokens = async (
  userId: string,
  requiredTokens: number
): Promise<boolean> => {
  try {
    const balance = await getTokenBalance(userId);
    return balance >= requiredTokens;
  } catch (error) {
    console.error('Error checking token balance:', error);
    return false;
  }
};

/**
 * Get user's transaction history
 */
export const getUserTransactions = async (
  userId: string,
  limit: number = 50
): Promise<TokenTransaction[]> => {
  try {
    const db = getDb();
    const transactionsRef = collection(db, 'transactions');

    // Get transactions where user is sender or receiver
    const senderQuery = query(
      transactionsRef,
      where('senderUid', '==', userId)
    );
    const receiverQuery = query(
      transactionsRef,
      where('receiverUid', '==', userId)
    );

    const [senderSnap, receiverSnap] = await Promise.all([
      getDocs(senderQuery),
      getDocs(receiverQuery),
    ]);

    const transactions: TokenTransaction[] = [];

    senderSnap.forEach((doc) => {
      transactions.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      } as TokenTransaction);
    });

    receiverSnap.forEach((doc) => {
      transactions.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      } as TokenTransaction);
    });

    // Sort by date and limit
    return transactions
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  } catch (error) {
    console.error('Error getting user transactions:', error);
    return [];
  }
};

/**
 * Spend tokens for sending a chat message (PACK 39)
 * Deducts tokens from user's wallet with proper validation
 *
 * @param userId - User ID spending tokens
 * @param cost - Number of tokens to spend
 * @throws Error if insufficient balance
 */
export const spendTokensForMessage = async (userId: string, cost: number): Promise<void> => {
  try {
    // Validate cost is positive
    if (cost <= 0) {
      throw new Error('Invalid token cost');
    }

    // Check if user has enough tokens
    const balance = await getTokenBalance(userId);
    if (balance < cost) {
      throw new Error(`Insufficient tokens. Required: ${cost}, Available: ${balance}`);
    }

    // Deduct tokens
    await deductTokens(userId, cost);

    // PACK 50: Record Royal Club spend (async, non-blocking)
    recordRoyalSpend(userId, cost).catch(err => {
      console.error('[TokenService] Failed to record Royal spend:', err);
    });

    if (__DEV__) {
      console.log(`[TokenService] Spent ${cost} tokens for message. User: ${userId}, New balance: ${balance - cost}`);
    }
  } catch (error) {
    if (__DEV__) {
      console.error('[TokenService] Error spending tokens for message:', error);
    }
    throw error;
  }
};

/**
 * PACK 50: Record token spend for Royal Club tracking
 * This is called asynchronously and non-blocking
 */
async function recordRoyalSpend(userId: string, tokensSpent: number): Promise<void> {
  try {
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('../lib/firebase');
    
    const recordSpend = httpsCallable(functions, 'royal_recordSpend');
    await recordSpend({ userId, tokensSpent });
  } catch (error) {
    // Silent failure - Royal tracking should not block token operations
    console.error('[TokenService] Royal spend tracking failed:', error);
  }
}