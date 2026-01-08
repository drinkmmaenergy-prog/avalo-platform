/**
 * Token Escrow Service
 * Manages token escrow for Earn-to-Chat billing
 */

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
  increment,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import {
  EARN_TO_CHAT_CONFIG,
  calculateInitialEscrowDeposit,
  calculateEscrowDeduction,
  splitEscrowTokens,
} from '../config/monetization';

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

export interface Escrow {
  id: string;
  chatId: string;
  senderId: string;
  receiverId: string;
  balance: number;
  totalDeposited: number;
  totalConsumed: number;
  instantFeePaid: number;
  status: 'active' | 'closed' | 'depleted';
  createdAt: Timestamp;
  lastUpdated: Timestamp;
}

/**
 * Get escrow for a chat
 */
export const getEscrow = async (chatId: string): Promise<Escrow | null> => {
  try {
    const db = getDb();
    const escrowRef = doc(db, 'escrows', chatId);
    const escrowSnap = await getDoc(escrowRef);

    if (!escrowSnap.exists()) {
      return null;
    }

    return {
      id: escrowSnap.id,
      ...escrowSnap.data(),
    } as Escrow;
  } catch (error) {
    console.error('Error getting escrow:', error);
    return null;
  }
};

/**
 * Create escrow and deduct initial deposit + instant fee
 */
export const createEscrow = async (
  chatId: string,
  senderId: string,
  receiverId: string
): Promise<Escrow> => {
  try {
    const db = getDb();
    const { totalRequired, instantFee, escrowAmount } = calculateInitialEscrowDeposit();

    // Check sender has enough balance
    const senderWalletRef = doc(db, 'balances', senderId, 'wallet');
    const senderWalletSnap = await getDoc(senderWalletRef);
    
    if (!senderWalletSnap.exists()) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    const currentBalance = senderWalletSnap.data().tokens || 0;
    if (currentBalance < totalRequired) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    const batch = writeBatch(db);

    // Deduct total from sender
    batch.update(senderWalletRef, {
      tokens: increment(-totalRequired),
      lastUpdated: serverTimestamp(),
    });

    // Create escrow with remaining balance after instant fee
    const escrowRef = doc(db, 'escrows', chatId);
    const escrowData: Omit<Escrow, 'id'> = {
      chatId,
      senderId,
      receiverId,
      balance: escrowAmount,
      totalDeposited: totalRequired,
      totalConsumed: 0,
      instantFeePaid: instantFee,
      status: 'active',
      createdAt: serverTimestamp() as Timestamp,
      lastUpdated: serverTimestamp() as Timestamp,
    };
    batch.set(escrowRef, escrowData);

    // Record instant fee transaction
    const instantFeeTransactionRef = doc(collection(db, 'transactions'));
    batch.set(instantFeeTransactionRef, {
      senderUid: senderId,
      receiverUid: 'avalo_platform',
      tokensAmount: instantFee,
      avaloFee: instantFee,
      chatId,
      transactionType: 'instant_fee',
      createdAt: serverTimestamp(),
    });

    await batch.commit();

    return {
      id: chatId,
      ...escrowData,
      createdAt: new Date() as any,
      lastUpdated: new Date() as any,
    };
  } catch (error) {
    console.error('Error creating escrow:', error);
    throw error;
  }
};

/**
 * Add more tokens to existing escrow
 */
export const topUpEscrow = async (
  chatId: string,
  senderId: string,
  amount: number
): Promise<void> => {
  try {
    const db = getDb();

    // Check sender has enough balance
    const senderWalletRef = doc(db, 'balances', senderId, 'wallet');
    const senderWalletSnap = await getDoc(senderWalletRef);
    
    if (!senderWalletSnap.exists()) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    const currentBalance = senderWalletSnap.data().tokens || 0;
    if (currentBalance < amount) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    const batch = writeBatch(db);

    // Deduct from sender
    batch.update(senderWalletRef, {
      tokens: increment(-amount),
      lastUpdated: serverTimestamp(),
    });

    // Add to escrow
    const escrowRef = doc(db, 'escrows', chatId);
    batch.update(escrowRef, {
      balance: increment(amount),
      totalDeposited: increment(amount),
      lastUpdated: serverTimestamp(),
      status: 'active',
    });

    await batch.commit();
  } catch (error) {
    console.error('Error topping up escrow:', error);
    throw error;
  }
};

/**
 * Deduct tokens from escrow based on message word count
 */
export const deductFromEscrow = async (
  chatId: string,
  wordCount: number
): Promise<{ tokensDeducted: number; remainingBalance: number }> => {
  try {
    const db = getDb();
    const escrowRef = doc(db, 'escrows', chatId);
    const escrowSnap = await getDoc(escrowRef);

    if (!escrowSnap.exists()) {
      throw new Error('ESCROW_NOT_FOUND');
    }

    const escrow = escrowSnap.data() as Escrow;
    const tokensToDeduct = calculateEscrowDeduction(wordCount);

    // Check if escrow has enough balance
    if (escrow.balance < tokensToDeduct) {
      // Mark as depleted
      await updateDoc(escrowRef, {
        status: 'depleted',
        lastUpdated: serverTimestamp(),
      });
      throw new Error('ESCROW_DEPLETED');
    }

    // Deduct from escrow
    await updateDoc(escrowRef, {
      balance: increment(-tokensToDeduct),
      totalConsumed: increment(tokensToDeduct),
      lastUpdated: serverTimestamp(),
    });

    const newBalance = escrow.balance - tokensToDeduct;

    // Check if balance is below minimum threshold
    if (newBalance < EARN_TO_CHAT_CONFIG.MIN_ESCROW_BALANCE) {
      await updateDoc(escrowRef, {
        status: 'depleted',
      });
    }

    return {
      tokensDeducted: tokensToDeduct,
      remainingBalance: newBalance,
    };
  } catch (error) {
    console.error('Error deducting from escrow:', error);
    throw error;
  }
};

/**
 * Release escrow tokens to receiver when chat ends or tokens consumed
 */
export const releaseEscrow = async (
  chatId: string,
  tokensToRelease: number
): Promise<void> => {
  try {
    const db = getDb();
    const escrowRef = doc(db, 'escrows', chatId);
    const escrowSnap = await getDoc(escrowRef);

    if (!escrowSnap.exists()) {
      throw new Error('ESCROW_NOT_FOUND');
    }

    const escrow = escrowSnap.data() as Escrow;
    const { creatorAmount, avaloAmount } = splitEscrowTokens(tokensToRelease);

    const batch = writeBatch(db);

    // Add tokens to receiver (creator)
    const receiverWalletRef = doc(db, 'balances', escrow.receiverId, 'wallet');
    const receiverWalletSnap = await getDoc(receiverWalletRef);

    if (!receiverWalletSnap.exists()) {
      batch.set(receiverWalletRef, {
        tokens: creatorAmount,
        lastUpdated: serverTimestamp(),
      });
    } else {
      batch.update(receiverWalletRef, {
        tokens: increment(creatorAmount),
        lastUpdated: serverTimestamp(),
      });
    }

    // Record transaction
    const transactionRef = doc(collection(db, 'transactions'));
    batch.set(transactionRef, {
      senderUid: escrow.senderId,
      receiverUid: escrow.receiverId,
      tokensAmount: tokensToRelease,
      creatorAmount,
      avaloFee: avaloAmount,
      chatId,
      transactionType: 'escrow_release',
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    console.error('Error releasing escrow:', error);
    throw error;
  }
};

/**
 * Close escrow and release remaining balance
 */
export const closeEscrow = async (chatId: string): Promise<void> => {
  try {
    const db = getDb();
    const escrowRef = doc(db, 'escrows', chatId);
    const escrowSnap = await getDoc(escrowRef);

    if (!escrowSnap.exists()) {
      return;
    }

    const escrow = escrowSnap.data() as Escrow;

    // Release remaining balance if any
    if (escrow.balance > 0) {
      await releaseEscrow(chatId, escrow.balance);
    }

    // Update escrow status
    await updateDoc(escrowRef, {
      balance: 0,
      status: 'closed',
      lastUpdated: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error closing escrow:', error);
    throw error;
  }
};

/**
 * Check if escrow needs top-up
 */
export const needsTopUp = async (chatId: string): Promise<boolean> => {
  try {
    const escrow = await getEscrow(chatId);
    if (!escrow) return true;
    
    return escrow.balance < EARN_TO_CHAT_CONFIG.MIN_ESCROW_BALANCE;
  } catch (error) {
    console.error('Error checking escrow top-up:', error);
    return true;
  }
};