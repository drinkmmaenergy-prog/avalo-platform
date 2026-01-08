/**
 * Stripe Service - Phase 5
 * Handles token purchases via Stripe Checkout
 */

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { TOKEN_PACKS, getTotalTokensForPack, TokenPack } from '../config/monetization';

const getDb = () => {
  try {
    const app = getApp();
    return getFirestore(app);
  } catch (error) {
    console.error('Error getting Firestore instance:', error);
    throw error;
  }
};

export interface PendingPurchase {
  id: string;
  userId: string;
  packId: string;
  tokens: number;
  priceUSD: number;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

/**
 * Create Stripe checkout session (mock for dev)
 */
export const createCheckoutSession = async (
  userId: string,
  pack: TokenPack
): Promise<{ success: boolean; checkoutUrl?: string; sessionId?: string; error?: string }> => {
  try {
    const db = getDb();
    
    // Create pending purchase record
    const purchaseRef = doc(collection(db, 'pending_purchases'));
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30); // 30-minute expiration

    await setDoc(purchaseRef, {
      userId,
      packId: pack.packId,
      tokens: getTotalTokensForPack(pack),
      priceUSD: pack.price,
      status: 'pending',
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
    });

    // In production, this would call your Cloud Function to create Stripe session
    // For now, return mock URL
    const checkoutUrl = `https://checkout.stripe.com/mock/${purchaseRef.id}`;

    return {
      success: true,
      checkoutUrl,
      sessionId: purchaseRef.id,
    };
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return {
      success: false,
      error: 'PROCESSING_ERROR',
    };
  }
};

/**
 * Mock purchase for testing (dev/staging only)
 */
export const mockCompletePurchase = async (
  userId: string,
  pack: TokenPack
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!__DEV__) {
      return {
        success: false,
        error: 'MOCK_ONLY_IN_DEV',
      };
    }

    const db = getDb();
    const totalTokens = getTotalTokensForPack(pack);

    // Add tokens to wallet
    const walletRef = doc(db, 'balances', userId, 'wallet');
    const walletSnap = await getDoc(walletRef);

    if (!walletSnap.exists()) {
      await setDoc(walletRef, {
        tokens: totalTokens,
        lastUpdated: serverTimestamp(),
      });
    } else {
      const { updateDoc, increment } = await import('firebase/firestore');
      await updateDoc(walletRef, {
        tokens: increment(totalTokens),
        lastUpdated: serverTimestamp(),
      });
    }

    // Record transaction
    await addDoc(collection(db, 'transactions'), {
      senderUid: 'stripe_mock',
      receiverUid: userId,
      tokensAmount: totalTokens,
      avaloFee: 0,
      transactionType: 'purchase',
      packId: pack.packId,
      priceUSD: pack.price,
      createdAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error('Error completing mock purchase:', error);
    return {
      success: false,
      error: 'PROCESSING_ERROR',
    };
  }
};

/**
 * Verify purchase completion (called after Stripe webhook)
 */
export const verifyPurchase = async (
  sessionId: string
): Promise<{ success: boolean; tokens?: number; error?: string }> => {
  try {
    const db = getDb();
    const purchaseRef = doc(db, 'pending_purchases', sessionId);
    const purchaseSnap = await getDoc(purchaseRef);

    if (!purchaseSnap.exists()) {
      return {
        success: false,
        error: 'PURCHASE_NOT_FOUND',
      };
    }

    const purchase = purchaseSnap.data() as PendingPurchase;

    if (purchase.status === 'completed') {
      return {
        success: true,
        tokens: purchase.tokens,
      };
    }

    return {
      success: false,
      error: 'PURCHASE_NOT_COMPLETED',
    };
  } catch (error) {
    console.error('Error verifying purchase:', error);
    return {
      success: false,
      error: 'PROCESSING_ERROR',
    };
  }
};

/**
 * Get purchase history
 */
export const getPurchaseHistory = async (
  userId: string,
  limit: number = 20
): Promise<any[]> => {
  try {
    const db = getDb();
    const transactionsRef = collection(db, 'transactions');
    
    const q = query(
      transactionsRef,
      where('receiverUid', '==', userId),
      where('transactionType', '==', 'purchase')
    );
    
    const snapshot = await getDocs(q);
    
    return snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a: any, b: any) => b.createdAt?.toMillis() - a.createdAt?.toMillis())
      .slice(0, limit);
  } catch (error) {
    console.error('Error getting purchase history:', error);
    return [];
  }
};

/**
 * Get available token packs
 */
export const getTokenPacks = (): TokenPack[] => {
  return TOKEN_PACKS;
};