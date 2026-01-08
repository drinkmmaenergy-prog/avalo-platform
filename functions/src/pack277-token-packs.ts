/**
 * PACK 277 — Token Packs Configuration & Purchase Logic (Enhanced with PACK 321)
 * FINAL token pack configuration - do not modify without approval
 * Payout rate: 1 token = 0.20 PLN (fixed, immutable)
 */

import { db, generateId, serverTimestamp } from './init';
import { FieldValue } from 'firebase-admin/firestore';
import { TokenPack, PurchaseRequest, PurchaseResponse } from './types/pack277-wallet.types';

// PACK 321: FINAL Token Pack Definitions (immutable)
// Sale prices ONLY - payout rate remains 0.20 PLN/token regardless of purchase price
export const DEFAULT_TOKEN_PACKS: Omit<TokenPack, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'mini',
    name: 'Mini',
    tokens: 100,
    pricePLN: 31.99,
    priceUSD: 8.00,
    priceEUR: 7.50,
    active: true,
    order: 1,
  },
  {
    id: 'basic',
    name: 'Basic',
    tokens: 300,
    pricePLN: 85.99,
    priceUSD: 21.50,
    priceEUR: 20.00,
    active: true,
    order: 2,
  },
  {
    id: 'standard',
    name: 'Standard',
    tokens: 500,
    pricePLN: 134.99,
    priceUSD: 34.00,
    priceEUR: 31.50,
    active: true,
    order: 3,
    popularBadge: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    tokens: 1000,
    pricePLN: 244.99,
    priceUSD: 61.50,
    priceEUR: 57.50,
    active: true,
    order: 4,
  },
  {
    id: 'pro',
    name: 'Pro',
    tokens: 2000,
    pricePLN: 469.99,
    priceUSD: 118.00,
    priceEUR: 110.00,
    active: true,
    order: 5,
  },
  {
    id: 'elite',
    name: 'Elite',
    tokens: 5000,
    pricePLN: 1125.99,
    priceUSD: 282.50,
    priceEUR: 264.00,
    active: true,
    order: 6,
  },
  {
    id: 'royal',
    name: 'Royal',
    tokens: 10000,
    pricePLN: 2149.99,
    priceUSD: 539.00,
    priceEUR: 504.00,
    active: true,
    order: 7,
  },
];

/**
 * PACK 321: Payout rate constant
 * 1 token = 0.20 PLN when cashing out
 * This is independent of purchase price
 */
export const TOKEN_PAYOUT_RATE_PLN = 0.20;

/**
 * Initialize token packs in Firestore (run once on deployment)
 */
export async function initializeTokenPacks(): Promise<void> {
  const packsRef = db.collection('config').doc('tokenPacks');
  const packsDoc = await packsRef.get();

  if (!packsDoc.exists) {
    const packs: Record<string, TokenPack> = {};
    
    for (const pack of DEFAULT_TOKEN_PACKS) {
      packs[pack.id] = {
        ...pack,
        createdAt: serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
      };
    }

    await packsRef.set({
      packs,
      lastUpdated: serverTimestamp(),
    });

    console.log('Token packs initialized');
  }
}

/**
 * Get all active token packs
 */
export async function getTokenPacks(): Promise<TokenPack[]> {
  try {
    const packsDoc = await db.collection('config').doc('tokenPacks').get();
    
    if (!packsDoc.exists) {
      await initializeTokenPacks();
      return getTokenPacks(); // Retry after initialization
    }

    const data = packsDoc.data();
    const packs: TokenPack[] = Object.values(data?.packs || {});
    
    return packs
      .filter(pack => pack.active)
      .sort((a, b) => a.order - b.order);
  } catch (error) {
    console.error('Get token packs error:', error);
    return [];
  }
}

/**
 * Get specific token pack by ID
 */
export async function getTokenPack(packId: string): Promise<TokenPack | null> {
  try {
    const packsDoc = await db.collection('config').doc('tokenPacks').get();
    const data = packsDoc.data();
    return data?.packs?.[packId] || null;
  } catch (error) {
    console.error('Get token pack error:', error);
    return null;
  }
}

/**
 * Record purchase in wallet
 */
export async function recordPurchase(
  userId: string,
  packId: string,
  tokens: number,
  platform: string,
  paymentIntentId?: string,
  receiptData?: string
): Promise<PurchaseResponse> {
  try {
    const walletRef = db.collection('wallets').doc(userId);
    
    // Update wallet atomically
    const result = await db.runTransaction(async (transaction) => {
      const walletDoc = await transaction.get(walletRef);
      const wallet = walletDoc.data();

      const beforeBalance = wallet?.tokensBalance || 0;
      const afterBalance = beforeBalance + tokens;

      if (wallet) {
        transaction.update(walletRef, {
          tokensBalance: afterBalance,
          lifetimePurchasedTokens: FieldValue.increment(tokens),
          lastUpdated: serverTimestamp(),
        });
      } else {
        transaction.set(walletRef, {
          userId,
          tokensBalance: afterBalance,
          lifetimePurchasedTokens: tokens,
          lifetimeSpentTokens: 0,
          lifetimeEarnedTokens: 0,
          lastUpdated: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      }

      return { beforeBalance, afterBalance };
    });

    // Create transaction record
    const txId = generateId();
    await db.collection('walletTransactions').doc(txId).set({
      txId,
      userId,
      type: 'PURCHASE',
      source: 'STORE',
      amountTokens: tokens,
      beforeBalance: result.beforeBalance,
      afterBalance: result.afterBalance,
      metadata: {
        packId,
        paymentIntentId,
        receiptData,
        platform,
      },
      timestamp: serverTimestamp(),
    });

    return {
      success: true,
      txId,
      newBalance: result.afterBalance,
      tokensAdded: tokens,
    };
  } catch (error: any) {
    console.error('Record purchase error:', error);
    return {
      success: false,
      error: error.message || 'Failed to record purchase',
    };
  }
}

/**
 * Validate purchase before recording (prevent fraud)
 */
export async function validatePurchase(
  userId: string,
  packId: string,
  paymentIntentId?: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Check if payment intent already used
    if (paymentIntentId) {
      const existingTx = await db
        .collection('walletTransactions')
        .where('type', '==', 'PURCHASE')
        .where('metadata.paymentIntentId', '==', paymentIntentId)
        .limit(1)
        .get();

      if (!existingTx.empty) {
        return { valid: false, error: 'Payment already processed' };
      }
    }

    // Check if pack exists and is active
    const pack = await getTokenPack(packId);
    if (!pack) {
      return { valid: false, error: 'Invalid pack ID' };
    }

    if (!pack.active) {
      return { valid: false, error: 'Pack is no longer available' };
    }

    // Anti-fraud: Check purchase frequency
    const recentPurchases = await db
      .collection('walletTransactions')
      .where('userId', '==', userId)
      .where('type', '==', 'PURCHASE')
      .where('timestamp', '>', new Date(Date.now() - 60000)) // Last minute
      .get();

    if (recentPurchases.size >= 3) {
      return { valid: false, error: 'Too many purchases in short time' };
    }

    return { valid: true };
  } catch (error: any) {
    console.error('Validate purchase error:', error);
    return { valid: false, error: 'Validation failed' };
  }
}

/**
 * Update token pack configuration (admin only)
 */
export async function updateTokenPack(
  packId: string,
  updates: Partial<Omit<TokenPack, 'id' | 'createdAt'>>
): Promise<boolean> {
  try {
    const packsRef = db.collection('config').doc('tokenPacks');
    
    await packsRef.update({
      [`packs.${packId}`]: {
        ...updates,
        updatedAt: serverTimestamp(),
      },
      lastUpdated: serverTimestamp(),
    });

    return true;
  } catch (error) {
    console.error('Update token pack error:', error);
    return false;
  }
}