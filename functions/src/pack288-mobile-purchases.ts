/**
 * PACK 288 — Mobile Purchase Validation (Android/iOS)
 * 
 * Handles receipt verification and token crediting for mobile in-app purchases
 * from Google Play Store (Android) and App Store (iOS).
 * 
 * Flow:
 * 1. Client completes purchase in store
 * 2. Client sends receipt to backend
 * 3. Backend verifies with Apple/Google
 * 4. If valid, credit tokens to wallet
 * 5. Return success/failure to client
 */

import { https, logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId } from './init';
import { FieldValue } from 'firebase-admin/firestore';
import {
  TokenPurchase,
  MobilePurchaseRequest,
  MobilePurchaseResponse,
  VerifyReceiptResponse,
} from './types/pack288-token-store.types';
// Token package configuration (must match app-mobile/lib/token-store-config.ts)
const TOKEN_PACKAGES = [
  { id: 'mini', tokens: 100, basePricePLN: 31.99 },
  { id: 'basic', tokens: 300, basePricePLN: 85.99 },
  { id: 'standard', tokens: 500, basePricePLN: 134.99 },
  { id: 'premium', tokens: 1000, basePricePLN: 244.99 },
  { id: 'pro', tokens: 2000, basePricePLN: 469.99 },
  { id: 'elite', tokens: 5000, basePricePLN: 1125.99 },
  { id: 'royal', tokens: 10000, basePricePLN: 2149.99 },
] as const;

const getPackageById = (id: string) => {
  return TOKEN_PACKAGES.find(p => p.id === id) || null;
};

// ============================================================================
// RECEIPT VERIFICATION
// ============================================================================

/**
 * Verify iOS App Store receipt
 * In production, this should call Apple's verifyReceipt API
 */
async function verifyAppleReceipt(
  receiptData: string,
  productId: string
): Promise<VerifyReceiptResponse> {
  try {
    // TODO: Implement actual Apple receipt verification
    // POST to https://buy.itunes.apple.com/verifyReceipt (production)
    // POST to https://sandbox.itunes.apple.com/verifyReceipt (sandbox)
    
    // For now, parse product ID to get package
    const packId = productId.split('.').pop()?.split('_')[0];
    if (!packId) {
      return {
        valid: false,
        error: 'Invalid product ID format',
        errorCode: 'INVALID_RECEIPT',
      };
    }
    
    const pack = getPackageById(packId);
    if (!pack) {
      return {
        valid: false,
        error: 'Package not found',
        errorCode: 'INVALID_RECEIPT',
      };
    }
    
    // Mock verification for development
    // In production, actually verify with Apple
    const isValid = receiptData.length > 50; // Basic check
    
    if (!isValid) {
      return {
        valid: false,
        error: 'Invalid receipt',
        errorCode: 'INVALID_RECEIPT',
      };
    }
    
    return {
      valid: true,
      packId: pack.id,
      tokens: pack.tokens,
      transactionId: `apple_${Date.now()}`,
      paidAmount: pack.basePricePLN,
      paidCurrency: 'PLN',
    };
  } catch (error: any) {
    logger.error('Apple receipt verification error:', error);
    return {
      valid: false,
      error: error.message || 'Verification failed',
      errorCode: 'INVALID_RECEIPT',
    };
  }
}

/**
 * Verify Android Google Play receipt
 * In production, this should call Google Play Developer API
 */
async function verifyGoogleReceipt(
  receiptData: string,
  productId: string
): Promise<VerifyReceiptResponse> {
  try {
    // TODO: Implement actual Google Play receipt verification
    // Use Google Play Developer API with service account
    // https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/get
    
    // Parse product ID to get package
    const packId = productId.split('_').pop()?.split('_')[0];
    if (!packId) {
      return {
        valid: false,
        error: 'Invalid product ID format',
        errorCode: 'INVALID_RECEIPT',
      };
    }
    
    const pack = getPackageById(packId);
    if (!pack) {
      return {
        valid: false,
        error: 'Package not found',
        errorCode: 'INVALID_RECEIPT',
      };
    }
    
    // Mock verification for development
    const isValid = receiptData.length > 50;
    
    if (!isValid) {
      return {
        valid: false,
        error: 'Invalid receipt',
        errorCode: 'INVALID_RECEIPT',
      };
    }
    
    return {
      valid: true,
      packId: pack.id,
      tokens: pack.tokens,
      transactionId: `google_${Date.now()}`,
      paidAmount: pack.basePricePLN,
      paidCurrency: 'PLN',
    };
  } catch (error: any) {
    logger.error('Google receipt verification error:', error);
    return {
      valid: false,
      error: error.message || 'Verification failed',
      errorCode: 'INVALID_RECEIPT',
    };
  }
}

// ============================================================================
// PURCHASE VALIDATION & FRAUD DETECTION
// ============================================================================

/**
 * Check if receipt has already been consumed
 */
async function checkReceiptConsumed(
  transactionId: string,
  platform: string
): Promise<boolean> {
  const existingPurchase = await db
    .collection('tokenPurchases')
    .where('providerOrderId', '==', transactionId)
    .where('platform', '==', platform)
    .where('status', '==', 'COMPLETED')
    .limit(1)
    .get();
    
  return !existingPurchase.empty;
}

/**
 * Check purchase limits and fraud indicators
 */
async function validatePurchaseLimits(
  userId: string,
  amountPLN: number
): Promise<{ valid: boolean; reason?: string }> {
  // Check age verification (must be 18+)
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  if (!userData?.ageVerified) {
    return {
      valid: false,
      reason: 'Age verification required (18+)',
    };
  }
  
  // Check monthly limit (10000 PLN equivalent)
  const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
  const monthlyLimitDoc = await db
    .collection('purchaseLimits')
    .doc(`${userId}_${currentMonth}`)
    .get();
    
  const monthlyTotal = monthlyLimitDoc.data()?.totalPLN || 0;
  if (monthlyTotal + amountPLN > 10000) {
    return {
      valid: false,
      reason: 'Monthly purchase limit exceeded (10000 PLN)',
    };
  }
  
  // Check purchase frequency (anti-fraud)
  const recentPurchases = await db
    .collection('tokenPurchases')
    .where('userId', '==', userId)
    .where('createdAt', '>', new Date(Date.now() - 60000)) // Last minute
    .get();
    
  if (recentPurchases.size >= 3) {
    return {
      valid: false,
      reason: 'Too many purchases in short time',
    };
  }
  
  return { valid: true };
}

// ============================================================================
// TOKEN CREDITING
// ============================================================================

/**
 * Credit tokens to user wallet after successful purchase
 */
async function creditTokensToWallet(
  userId: string,
  tokens: number,
  purchaseId: string
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  try {
    const walletRef = db.collection('wallets').doc(userId);
    
    const result = await db.runTransaction(async (transaction) => {
      const walletDoc = await transaction.get(walletRef);
      
      const currentBalance = walletDoc.exists 
        ? (walletDoc.data()?.tokensBalance || 0)
        : 0;
      const newBalance = currentBalance + tokens;
      
      if (walletDoc.exists) {
        transaction.update(walletRef, {
          tokensBalance: newBalance,
          lifetimePurchasedTokens: FieldValue.increment(tokens),
          lastUpdated: serverTimestamp(),
        });
      } else {
        transaction.set(walletRef, {
          userId,
          tokensBalance: newBalance,
          lifetimePurchasedTokens: tokens,
          lifetimeSpentTokens: 0,
          lifetimeEarnedTokens: 0,
          lastUpdated: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      }
      
      // Create wallet transaction record
      const txId = generateId();
      transaction.set(db.collection('walletTransactions').doc(txId), {
        txId,
        userId,
        type: 'PURCHASE',
        source: 'STORE',
        amountTokens: tokens,
        beforeBalance: currentBalance,
        afterBalance: newBalance,
        metadata: {
          purchaseId,
          platform: 'mobile',
        },
        timestamp: serverTimestamp(),
      });
      
      return { newBalance };
    });
    
    return {
      success: true,
      newBalance: result.newBalance,
    };
  } catch (error: any) {
    logger.error('Credit tokens error:', error);
    return {
      success: false,
      error: error.message || 'Failed to credit tokens',
    };
  }
}

// ============================================================================
// MAIN PURCHASE ENDPOINT
// ============================================================================

/**
 * Handle mobile in-app purchase
 * Verifies receipt and credits tokens
 */
export const tokens_mobilePurchase = https.onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 60 },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const {
      platform,
      providerReceipt,
      packageId,
      productId,
    } = request.data as MobilePurchaseRequest;
    
    // Validate input
    if (!platform || !providerReceipt || !packageId || !productId) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }
    
    if (platform !== 'ios' && platform !== 'android') {
      throw new HttpsError('invalid-argument', 'Invalid platform');
    }
    
    try {
      // Step 1: Verify receipt with platform
      logger.info('Verifying receipt', {
        userId: auth.uid,
        platform,
        packageId,
      });
      
      let verification: VerifyReceiptResponse;
      if (platform === 'ios') {
        verification = await verifyAppleReceipt(providerReceipt, productId);
      } else {
        verification = await verifyGoogleReceipt(providerReceipt, productId);
      }
      
      if (!verification.valid) {
        throw new HttpsError(
          'failed-precondition',
          verification.error || 'Invalid receipt'
        );
      }
      
      // Step 2: Check if already consumed
      if (verification.transactionId) {
        const alreadyConsumed = await checkReceiptConsumed(
          verification.transactionId,
          platform
        );
        
        if (alreadyConsumed) {
          throw new HttpsError(
            'already-exists',
            'Receipt already processed'
          );
        }
      }
      
      // Step 3: Validate purchase limits
      const pack = getPackageById(packageId);
      if (!pack) {
        throw new HttpsError('not-found', 'Package not found');
      }
      
      const limitsCheck = await validatePurchaseLimits(
        auth.uid,
        pack.basePricePLN
      );
      
      if (!limitsCheck.valid) {
        throw new HttpsError(
          'failed-precondition',
          limitsCheck.reason || 'Purchase limit exceeded'
        );
      }
      
      // Step 4: Create purchase record
      const purchaseId = generateId();
      const purchase: TokenPurchase = {
        purchaseId,
        userId: auth.uid,
        packageId: packageId as any,
        tokens: pack.tokens,
        basePricePLN: pack.basePricePLN,
        paidCurrency: verification.paidCurrency || 'PLN',
        paidAmount: verification.paidAmount || pack.basePricePLN,
        platform,
        provider: platform === 'ios' ? 'app_store' : 'google_play',
        providerOrderId: verification.transactionId || `${platform}_${Date.now()}`,
        status: 'COMPLETED',
        createdAt: serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
      };
      
      await db.collection('tokenPurchases').doc(purchaseId).set(purchase);
      
      // Step 5: Credit tokens to wallet
      const creditResult = await creditTokensToWallet(
        auth.uid,
        pack.tokens,
        purchaseId
      );
      
      if (!creditResult.success) {
        // Mark purchase as failed
        await db.collection('tokenPurchases').doc(purchaseId).update({
          status: 'FAILED',
          updatedAt: serverTimestamp(),
        });
        
        throw new HttpsError(
          'internal',
          creditResult.error || 'Failed to credit tokens'
        );
      }
      
      // Step 6: Update monthly limit tracking
      const currentMonth = new Date().toISOString().substring(0, 7);
      const limitDocRef = db
        .collection('purchaseLimits')
        .doc(`${auth.uid}_${currentMonth}`);
        
      await limitDocRef.set(
        {
          userId: auth.uid,
          month: currentMonth,
          totalPLN: FieldValue.increment(pack.basePricePLN),
          purchaseCount: FieldValue.increment(1),
          lastPurchaseAt: serverTimestamp(),
        },
        { merge: true }
      );
      
      logger.info('Mobile purchase completed', {
        userId: auth.uid,
        purchaseId,
        platform,
        tokens: pack.tokens,
      });
      
      const response: MobilePurchaseResponse = {
        success: true,
        purchaseId,
        tokensAdded: pack.tokens,
        newBalance: creditResult.newBalance,
      };
      
      return response;
    } catch (error: any) {
      logger.error('Mobile purchase error:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError(
        'internal',
        error.message || 'Purchase failed'
      );
    }
  }
);

/**
 * Get user's purchase history
 */
export const tokens_getPurchaseHistory = https.onCall(
  { region: 'us-central1', memory: '128MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { limit = 20 } = request.data;
    
    try {
      const purchases = await db
        .collection('tokenPurchases')
        .where('userId', '==', auth.uid)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
        
      const history = purchases.docs.map(doc => doc.data());
      
      return {
        success: true,
        purchases: history,
      };
    } catch (error: any) {
      logger.error('Get purchase history error:', error);
      throw new HttpsError('internal', 'Failed to fetch purchase history');
    }
  }
);

/**
 * Get user's monthly purchase limits
 */
export const tokens_getMonthlyLimits = https.onCall(
  { region: 'us-central1', memory: '128MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    try {
      const currentMonth = new Date().toISOString().substring(0, 7);
      const limitDoc = await db
        .collection('purchaseLimits')
        .doc(`${auth.uid}_${currentMonth}`)
        .get();
        
      const limitData = limitDoc.data();
      const totalPLN = limitData?.totalPLN || 0;
      const maxPLN = 10000;
      const remaining = Math.max(0, maxPLN - totalPLN);
      
      return {
        success: true,
        month: currentMonth,
        totalSpent: totalPLN,
        limit: maxPLN,
        remaining,
        purchaseCount: limitData?.purchaseCount || 0,
        canPurchase: remaining > 0,
      };
    } catch (error: any) {
      logger.error('Get monthly limits error:', error);
      throw new HttpsError('internal', 'Failed to fetch limits');
    }
  }
);