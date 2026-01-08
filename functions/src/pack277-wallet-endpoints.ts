/**
 * PACK 277 — Wallet & Token Store Cloud Functions Endpoints
 * Callable functions for wallet operations
 */

import { https, logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp } from './init';
import {
  spendTokens,
  earnTokens,
  refundTokens,
  getWalletBalance,
  getTransactionHistory,
} from './pack277-wallet-service';
import {
  getTokenPacks,
  getTokenPack,
  recordPurchase,
  validatePurchase,
  initializeTokenPacks,
} from './pack277-token-packs';
import {
  PAYOUT_RATE,
  MIN_PAYOUT_TOKENS,
  PayoutRequest,
  PayoutResponse,
} from './types/pack277-wallet.types';

// ============================================================================
// TOKEN PACKS ENDPOINTS
// ============================================================================

/**
 * Get all available token packs
 */
export const wallet_getTokenPacks = https.onCall(
  { region: 'us-central1', memory: '128MiB' },
  async (request) => {
    try {
      const packs = await getTokenPacks();
      return { success: true, packs };
    } catch (error: any) {
      logger.error('Get token packs error:', error);
      throw new HttpsError('internal', 'Failed to fetch token packs');
    }
  }
);

/**
 * Initialize token packs (admin only, run once)
 */
export const wallet_admin_initTokenPacks = https.onCall(
  { region: 'us-central1', memory: '128MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth || !auth.token?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      await initializeTokenPacks();
      return { success: true, message: 'Token packs initialized' };
    } catch (error: any) {
      logger.error('Init token packs error:', error);
      throw new HttpsError('internal', 'Failed to initialize token packs');
    }
  }
);

// ============================================================================
// PURCHASE ENDPOINTS
// ============================================================================

/**
 * Purchase token pack (web - Stripe)
 */
export const wallet_purchaseTokensWeb = https.onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 60 },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { packId, paymentIntentId } = request.data;

    if (!packId || !paymentIntentId) {
      throw new HttpsError('invalid-argument', 'Missing packId or paymentIntentId');
    }

    try {
      // Validate purchase
      const validation = await validatePurchase(auth.uid, packId, paymentIntentId);
      if (!validation.valid) {
        throw new HttpsError('failed-precondition', validation.error || 'Invalid purchase');
      }

      // Get pack details
      const pack = await getTokenPack(packId);
      if (!pack) {
        throw new HttpsError('not-found', 'Token pack not found');
      }

      // Verify Stripe payment (you would check Stripe API here)
      // For now, we trust the paymentIntentId is valid if it passes validation

      // Record purchase
      const result = await recordPurchase(
        auth.uid,
        packId,
        pack.tokens,
        'web',
        paymentIntentId
      );

      if (!result.success) {
        throw new HttpsError('internal', result.error || 'Failed to record purchase');
      }

      logger.info('Web purchase completed', {
        userId: auth.uid,
        packId,
        tokens: pack.tokens,
        paymentIntentId,
      });

      return result;
    } catch (error: any) {
      logger.error('Web purchase error:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', error.message || 'Purchase failed');
    }
  }
);

/**
 * Verify mobile IAP receipt (iOS/Android)
 */
export const wallet_verifyIAPReceipt = https.onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 60 },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { platform, receiptData, productId } = request.data;

    if (!platform || !receiptData || !productId) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    if (!['ios', 'android'].includes(platform)) {
      throw new HttpsError('invalid-argument', 'Invalid platform');
    }

    try {
      // Map product ID to pack ID (e.g., com.avalo.tokens.mini -> mini)
      const packId = productId.split('.').pop() || '';

      // Validate purchase
      const validation = await validatePurchase(auth.uid, packId);
      if (!validation.valid) {
        throw new HttpsError('failed-precondition', validation.error || 'Invalid purchase');
      }

      // Get pack details
      const pack = await getTokenPack(packId);
      if (!pack) {
        throw new HttpsError('not-found', 'Token pack not found');
      }

      // Verify receipt with Apple/Google
      // (In production, you would call Apple/Google IAP verification APIs)
      // For now, we assume receipt is valid if it passes our validation

      // Record purchase
      const result = await recordPurchase(
        auth.uid,
        packId,
        pack.tokens,
        platform,
        undefined,
        receiptData
      );

      if (!result.success) {
        throw new HttpsError('internal', result.error || 'Failed to record purchase');
      }

      logger.info('IAP purchase completed', {
        userId: auth.uid,
        platform,
        packId,
        tokens: pack.tokens,
      });

      return result;
    } catch (error: any) {
      logger.error('IAP verification error:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', error.message || 'Receipt verification failed');
    }
  }
);

// ============================================================================
// WALLET OPERATIONS ENDPOINTS
// ============================================================================

/**
 * Get wallet balance
 */
export const wallet_getBalance = https.onCall(
  { region: 'us-central1', memory: '128MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const wallet = await getWalletBalance(auth.uid);
      if (!wallet) {
        throw new HttpsError('not-found', 'Wallet not found');
      }

      return {
        success: true,
        balance: wallet.tokensBalance,
        lifetimePurchased: wallet.lifetimePurchasedTokens,
        lifetimeSpent: wallet.lifetimeSpentTokens,
        lifetimeEarned: wallet.lifetimeEarnedTokens,
      };
    } catch (error: any) {
      logger.error('Get balance error:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to get balance');
    }
  }
);

/**
 * Get transaction history
 */
export const wallet_getTransactionHistory = https.onCall(
  { region: 'us-central1', memory: '256MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { limit = 20, type } = request.data;

    try {
      const transactions = await getTransactionHistory(auth.uid, limit, type);
      return { success: true, transactions };
    } catch (error: any) {
      logger.error('Get transaction history error:', error);
      throw new HttpsError('internal', 'Failed to fetch transactions');
    }
  }
);

/**
 * Spend tokens (internal use by other services)
 */
export const wallet_spendTokens = https.onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { amountTokens, source, relatedId, creatorId, metadata } = request.data;

    if (!amountTokens || !source || !relatedId) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    try {
      const result = await spendTokens({
        userId: auth.uid,
        amountTokens,
        source,
        relatedId,
        creatorId,
        metadata,
      });

      if (!result.success) {
        throw new HttpsError('failed-precondition', result.error || 'Spend failed');
      }

      return result;
    } catch (error: any) {
      logger.error('Spend tokens error:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', error.message || 'Failed to spend tokens');
    }
  }
);

/**
 * Refund tokens (internal use by other services)
 */
export const wallet_refundTokens = https.onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, amountTokens, source, relatedId, reason, metadata } = request.data;

    if (!userId || !amountTokens || !source || !relatedId || !reason) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    // Only allow admins or the user themselves to issue refunds
    if (userId !== auth.uid && !auth.token?.admin) {
      throw new HttpsError('permission-denied', 'Not authorized to issue refunds');
    }

    try {
      const result = await refundTokens({
        userId,
        amountTokens,
        source,
        relatedId,
        reason,
        metadata,
      });

      if (!result.success) {
        throw new HttpsError('failed-precondition', result.error || 'Refund failed');
      }

      return result;
    } catch (error: any) {
      logger.error('Refund tokens error:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', error.message || 'Failed to refund tokens');
    }
  }
);

// ============================================================================
// PAYOUT ENDPOINTS
// ============================================================================

/**
 * Request payout (convert tokens to fiat)
 */
export const wallet_requestPayout = https.onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 60 },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { amountTokens, payoutMethod, payoutDetails, currency = 'PLN' } = request.data as PayoutRequest;

    if (!amountTokens || !payoutMethod || !payoutDetails) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    try {
      // Check minimum payout amount
      if (amountTokens < MIN_PAYOUT_TOKENS) {
        throw new HttpsError(
          'failed-precondition',
          `Minimum payout is ${MIN_PAYOUT_TOKENS} tokens (${MIN_PAYOUT_TOKENS * PAYOUT_RATE} PLN)`
        );
      }

      // Get wallet balance
      const wallet = await getWalletBalance(auth.uid);
      if (!wallet) {
        throw new HttpsError('not-found', 'Wallet not found');
      }

      // Check if enough earned tokens (can't cash out purchased tokens)
      if (wallet.lifetimeEarnedTokens < amountTokens) {
        throw new HttpsError(
          'failed-precondition',
          'Insufficient earned tokens for payout'
        );
      }

      // Check current balance
      if (wallet.tokensBalance < amountTokens) {
        throw new HttpsError(
          'failed-precondition',
          'Insufficient balance'
        );
      }

      // PACK 330 & PACK 328A: Check compliance requirements
      // 1. Identity verification (PACK 328A)
      const verificationDoc = await db
        .collection('identityVerificationResults')
        .doc(auth.uid)
        .get();
      
      const identityVerified =
        verificationDoc.exists &&
        verificationDoc.data()?.verified === true &&
        verificationDoc.data()?.ageConfirmed === true;

      if (!identityVerified) {
        throw new HttpsError(
          'failed-precondition',
          'Please complete identity verification before requesting payout.'
        );
      }

      // 2. Tax profile with consent (PACK 330)
      const taxProfileDoc = await db
        .collection('taxProfiles')
        .doc(auth.uid)
        .get();

      if (!taxProfileDoc.exists) {
        throw new HttpsError(
          'failed-precondition',
          'Please complete tax profile before requesting payout.'
        );
      }

      const taxProfile = taxProfileDoc.data();
      if (!taxProfile?.consentToElectronicDocs) {
        throw new HttpsError(
          'failed-precondition',
          'You must consent to electronic tax documents before requesting payout.'
        );
      }

      // Legacy KYC check (kept for backward compatibility)
      const kycDoc = await db.collection('kycVerifications').doc(auth.uid).get();
      const kycVerified = kycDoc.exists && kycDoc.data()?.status === 'VERIFIED';

      // Calculate payout amounts
      const amountPLN = amountTokens * PAYOUT_RATE;
      const processingFee = Math.ceil(amountPLN * 0.02); // 2% processing fee
      const netAmount = amountPLN - processingFee;

      // Exchange rate for other currencies (simplified - use real rates in production)
      const exchangeRates: Record<string, number> = {
        PLN: 1.0,
        USD: 0.25,
        EUR: 0.23,
        GBP: 0.20,
      };
      const exchangeRate = exchangeRates[currency] || 1.0;
      const amountLocal = Math.round(netAmount * exchangeRate * 100) / 100;

      // Create payout request (would be processed by admin/automation)
      const payoutId = db.collection('payoutRequests').doc().id;
      await db.collection('payoutRequests').doc(payoutId).set({
        id: payoutId,
        userId: auth.uid,
        amountTokens,
        amountPLN,
        amountLocal,
        localCurrency: currency,
        exchangeRate,
        processingFee,
        netAmount,
        payoutMethod,
        payoutDetails,
        status: 'PENDING',
        kycVerified,
        identityVerified: true,
        taxProfileCompleted: true,
        requestedAt: serverTimestamp(),
      });

      logger.info('Payout requested', {
        userId: auth.uid,
        payoutId,
        amountTokens,
        amountPLN,
      });

      const response: PayoutResponse = {
        success: true,
        txId: payoutId,
        amountTokens,
        amountPLN,
        amountLocal,
        localCurrency: currency,
        exchangeRate,
        processingFee,
        netAmount,
        status: 'PENDING',
      };

      return response;
    } catch (error: any) {
      logger.error('Payout request error:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', error.message || 'Failed to request payout');
    }
  }
);

/**
 * Get payout history
 */
export const wallet_getPayoutHistory = https.onCall(
  { region: 'us-central1', memory: '128MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const payouts = await db
        .collection('payoutRequests')
        .where('userId', '==', auth.uid)
        .orderBy('requestedAt', 'desc')
        .limit(20)
        .get();

      const payoutHistory = payouts.docs.map(doc => doc.data());

      return { success: true, payouts: payoutHistory };
    } catch (error: any) {
      logger.error('Get payout history error:', error);
      throw new HttpsError('internal', 'Failed to fetch payout history');
    }
  }
);