/**
 * PACK 302 — Mobile Token & Subscription Verification
 * Endpoints for mobile app purchases via Google Play and App Store
 */

import { onRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from './common';
import axios from 'axios';
import {
  getTokenPackage,
  addTokensToWallet,
  updateSubscriptionStatus,
  writeBillingAuditLog,
  isTransactionProcessed,
  isSubscriptionSyncProcessed,
  validateSubscriptionTier,
} from './pack302-helpers';
import {
  VerifyMobilePurchaseRequest,
  VerifyMobilePurchaseResponse,
  SyncMobileSubscriptionRequest,
  SyncMobileSubscriptionResponse,
  MobilePlatform,
  TokenPackageId,
  SubscriptionTier,
} from './pack302-types';

// ============================================================================
// MOBILE TOKEN PURCHASE VERIFICATION
// ============================================================================

/**
 * POST /billing/mobile/verify-purchase
 * Verify mobile purchase receipt and credit tokens
 */
export const verifyMobilePurchase = onRequest(
  {
    region: 'europe-west3',
    cors: true,
    maxInstances: 10,
  },
  async (req, res) => {
    try {
      // Only accept POST
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const data = req.body as VerifyMobilePurchaseRequest;
      const { userId, platform, packageId, receipt } = data;

      // Validate input
      if (!userId || !platform || !packageId || !receipt) {
        throw new HttpsError('invalid-argument', 'Missing required fields');
      }

      if (platform !== 'GOOGLE' && platform !== 'APPLE') {
        throw new HttpsError('invalid-argument', 'Invalid platform');
      }

      // Get package details
      const pkg = getTokenPackage(packageId);

      // Verify receipt with platform
      const verification = await verifyPlatformReceipt(platform, receipt, packageId);

      if (!verification.valid) {
        throw new HttpsError('invalid-argument', 'Invalid receipt');
      }

      const transactionId = verification.transactionId;

      // Check idempotency
      if (await isTransactionProcessed(transactionId, userId)) {
        logger.info(`Mobile purchase already processed: ${transactionId}`);
        throw new HttpsError('already-exists', 'Purchase already processed');
      }

      // Add tokens to wallet
      const result = await addTokensToWallet(
        userId,
        pkg.tokens,
        transactionId,
        platform === 'GOOGLE' ? 'GOOGLE' : 'APPLE',
        packageId
      );

      // Write audit log
      await writeBillingAuditLog(
        'MOBILE_PURCHASE_VERIFIED',
        userId,
        platform === 'GOOGLE' ? 'GOOGLE' : 'APPLE',
        {
          amount: pkg.tokens,
          packageId,
          externalId: transactionId,
        }
      );

      const response: VerifyMobilePurchaseResponse = {
        success: true,
        tokensAdded: pkg.tokens,
        newBalance: result.newBalance,
        transactionId: result.transactionId,
      };

      logger.info(`Mobile purchase verified: ${pkg.tokens} tokens for user ${userId}`);
      res.status(200).json(response);
    } catch (error: any) {
      logger.error('Error verifying mobile purchase:', error);
      
      if (error instanceof HttpsError) {
        res.status(400).json({ 
          error: error.code,
          message: error.message 
        });
      } else {
        res.status(500).json({ 
          error: 'verification_failed',
          message: error.message 
        });
      }
    }
  }
);

// ============================================================================
// MOBILE SUBSCRIPTION SYNC
// ============================================================================

/**
 * POST /billing/mobile/sync-subscription
 * Sync mobile subscription status to Firestore
 */
export const syncMobileSubscription = onRequest(
  {
    region: 'europe-west3',
    cors: true,
    maxInstances: 10,
  },
  async (req, res) => {
    try {
      // Only accept POST
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const data = req.body as SyncMobileSubscriptionRequest;
      const { userId, platform, tier, status, currentPeriodEnd, originalTransactionId } = data;

      // Validate input
      if (!userId || !platform || !tier || !status || !originalTransactionId) {
        throw new HttpsError('invalid-argument', 'Missing required fields');
      }

      if (platform !== 'GOOGLE' && platform !== 'APPLE') {
        throw new HttpsError('invalid-argument', 'Invalid platform');
      }

      validateSubscriptionTier(tier);

      if (!['ACTIVE', 'CANCELLED', 'EXPIRED'].includes(status)) {
        throw new HttpsError('invalid-argument', 'Invalid status');
      }

      // Check idempotency
      if (await isSubscriptionSyncProcessed(originalTransactionId, userId, tier)) {
        logger.info(`Subscription sync already processed: ${originalTransactionId}`);
        
        const response: SyncMobileSubscriptionResponse = {
          success: true,
          subscriptionUpdated: false,
        };
        
        res.status(200).json(response);
        return;
      }

      // Determine active status
      const active = status === 'ACTIVE';
      const planId = originalTransactionId; // Use transaction ID as plan identifier

      // Update subscription status
      await updateSubscriptionStatus(
        userId,
        tier,
        active,
        planId,
        platform === 'GOOGLE' ? 'GOOGLE' : 'APPLE',
        active ? currentPeriodEnd : null
      );

      // Write audit log
      await writeBillingAuditLog(
        'MOBILE_SUBSCRIPTION_SYNCED',
        userId,
        platform === 'GOOGLE' ? 'GOOGLE' : 'APPLE',
        {
          tier,
          externalId: originalTransactionId,
        }
      );

      const response: SyncMobileSubscriptionResponse = {
        success: true,
        subscriptionUpdated: true,
      };

      logger.info(`Mobile subscription synced for user ${userId}: ${tier} ${status}`);
      res.status(200).json(response);
    } catch (error: any) {
      logger.error('Error syncing mobile subscription:', error);
      
      if (error instanceof HttpsError) {
        res.status(400).json({ 
          error: error.code,
          message: error.message 
        });
      } else {
        res.status(500).json({ 
          error: 'sync_failed',
          message: error.message 
        });
      }
    }
  }
);

// ============================================================================
// PLATFORM RECEIPT VERIFICATION
// ============================================================================

interface ReceiptVerification {
  valid: boolean;
  transactionId: string;
  productId?: string;
}

/**
 * Verify receipt with Google Play or App Store
 */
async function verifyPlatformReceipt(
  platform: MobilePlatform,
  receipt: string,
  expectedProductId: string
): Promise<ReceiptVerification> {
  if (platform === 'GOOGLE') {
    return verifyGooglePlayReceipt(receipt, expectedProductId);
  } else {
    return verifyAppStoreReceipt(receipt, expectedProductId);
  }
}

/**
 * Verify Google Play receipt
 */
async function verifyGooglePlayReceipt(
  receipt: string,
  expectedProductId: string
): Promise<ReceiptVerification> {
  try {
    // Parse receipt (should contain purchaseToken and packageName)
    const receiptData = JSON.parse(receipt);
    const { purchaseToken, packageName, productId } = receiptData;

    if (!purchaseToken || !packageName) {
      throw new Error('Invalid Google Play receipt format');
    }

    // In production, you would verify with Google Play Developer API
    // https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/get
    
    // For now, we'll do basic validation
    // TODO: Implement actual Google Play API verification
    const GOOGLE_PACKAGE_NAME = process.env.GOOGLE_PACKAGE_NAME || 'com.avalo.app';
    
    if (packageName !== GOOGLE_PACKAGE_NAME) {
      throw new Error('Package name mismatch');
    }

    if (productId !== expectedProductId) {
      throw new Error('Product ID mismatch');
    }

    // In production, verify with Google Play API here
    // const googleAuth = await getGoogleAuth();
    // const androidPublisher = google.androidpublisher({ version: 'v3', auth: googleAuth });
    // const result = await androidPublisher.purchases.products.get({
    //   packageName,
    //   productId,
    //   token: purchaseToken,
    // });
    
    // For now, return the purchase token as transaction ID
    return {
      valid: true,
      transactionId: purchaseToken,
      productId,
    };
  } catch (error: any) {
    logger.error('Error verifying Google Play receipt:', error);
    return {
      valid: false,
      transactionId: '',
    };
  }
}

/**
 * Verify App Store receipt
 */
async function verifyAppStoreReceipt(
  receipt: string,
  expectedProductId: string
): Promise<ReceiptVerification> {
  try {
    // Verify with App Store
    const isProduction = process.env.FIREBASE_CONFIG !== 'development';
    const verifyUrl = isProduction
      ? 'https://buy.itunes.apple.com/verifyReceipt'
      : 'https://sandbox.itunes.apple.com/verifyReceipt';

    const response = await axios.post(verifyUrl, {
      'receipt-data': receipt,
      password: process.env.APPLE_SHARED_SECRET || '',
    });

    const { status, receipt: receiptData } = response.data;

    // Status 0 means valid
    if (status !== 0) {
      // If production returns 21007, try sandbox
      if (status === 21007 && isProduction) {
        return verifyAppStoreSandbox(receipt, expectedProductId);
      }
      
      logger.error(`App Store verification failed with status: ${status}`);
      return {
        valid: false,
        transactionId: '',
      };
    }

    // Get the latest transaction
    const inApp = receiptData.in_app || [];
    if (inApp.length === 0) {
      throw new Error('No in-app purchases found');
    }

    const latestPurchase = inApp[inApp.length - 1];
    const productId = latestPurchase.product_id;
    const transactionId = latestPurchase.transaction_id;

    if (productId !== expectedProductId) {
      throw new Error('Product ID mismatch');
    }

    return {
      valid: true,
      transactionId,
      productId,
    };
  } catch (error: any) {
    logger.error('Error verifying App Store receipt:', error);
    return {
      valid: false,
      transactionId: '',
    };
  }
}

/**
 * Verify App Store receipt in sandbox (fallback)
 */
async function verifyAppStoreSandbox(
  receipt: string,
  expectedProductId: string
): Promise<ReceiptVerification> {
  try {
    const response = await axios.post('https://sandbox.itunes.apple.com/verifyReceipt', {
      'receipt-data': receipt,
      password: process.env.APPLE_SHARED_SECRET || '',
    });

    const { status, receipt: receiptData } = response.data;

    if (status !== 0) {
      return {
        valid: false,
        transactionId: '',
      };
    }

    const inApp = receiptData.in_app || [];
    if (inApp.length === 0) {
      return {
        valid: false,
        transactionId: '',
      };
    }

    const latestPurchase = inApp[inApp.length - 1];
    const productId = latestPurchase.product_id;
    const transactionId = latestPurchase.transaction_id;

    if (productId !== expectedProductId) {
      return {
        valid: false,
        transactionId: '',
      };
    }

    return {
      valid: true,
      transactionId,
      productId,
    };
  } catch (error: any) {
    logger.error('Error verifying App Store sandbox receipt:', error);
    return {
      valid: false,
      transactionId: '',
    };
  }
}