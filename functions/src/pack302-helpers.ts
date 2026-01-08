/**
 * PACK 302 — Unified Token & Subscription Checkout
 * Helper Functions
 */

import { db, generateId, serverTimestamp, increment } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from './common';
import {
  UserSubscriptions,
  UserBenefits,
  UserWallet,
  WalletTransaction,
  WalletTransactionType,
  WalletTransactionProvider,
  TokenPackageId,
  TOKEN_PACKAGES,
  SubscriptionTier,
  BillingAuditAction,
  CALL_DISCOUNT_NONE,
  CALL_DISCOUNT_VIP,
  CALL_DISCOUNT_ROYAL,
  REGION_DEFAULT_CURRENCY,
  CURRENCY_CONFIGS,
} from './pack302-types';

// ============================================================================
// USER BENEFITS RESOLUTION
// ============================================================================

/**
 * Resolve user benefits (VIP/Royal discounts)
 * This is the central function to determine call discounts
 */
export function resolveUserBenefits(subscription: UserSubscriptions): UserBenefits {
  const now = new Date();
  
  // Check if VIP is actually active and not expired
  const vipActive = subscription.vipActive && 
    subscription.vipCurrentPeriodEnd !== null &&
    new Date(subscription.vipCurrentPeriodEnd) > now;
  
  // Check if Royal is actually active and not expired
  const royalActive = subscription.royalActive && 
    subscription.royalCurrentPeriodEnd !== null &&
    new Date(subscription.royalCurrentPeriodEnd) > now;
  
  // Determine discount factor
  let callDiscountFactor = CALL_DISCOUNT_NONE;
  
  if (royalActive) {
    // Royal wins if both are active (50% discount)
    callDiscountFactor = CALL_DISCOUNT_ROYAL;
  } else if (vipActive) {
    // VIP only (30% discount)
    callDiscountFactor = CALL_DISCOUNT_VIP;
  }
  
  return {
    vipActive,
    royalActive,
    callDiscountFactor,
  };
}

/**
 * Get user subscription status
 */
export async function getUserSubscriptions(userId: string): Promise<UserSubscriptions> {
  const subDoc = await db.collection('userSubscriptions').doc(userId).get();
  
  if (!subDoc.exists) {
    // Return default subscription state
    return {
      userId,
      vipActive: false,
      vipPlanId: null,
      vipProvider: 'NONE',
      vipCurrentPeriodEnd: null,
      royalActive: false,
      royalPlanId: null,
      royalProvider: 'NONE',
      royalCurrentPeriodEnd: null,
      updatedAt: Timestamp.now(),
    };
  }
  
  return subDoc.data() as UserSubscriptions;
}

// ============================================================================
// WALLET OPERATIONS
// ============================================================================

/**
 * Get user wallet
 */
export async function getUserWallet(userId: string): Promise<UserWallet> {
  const walletDoc = await db.collection('wallets').doc(userId).get();
  
  if (!walletDoc.exists) {
    // Initialize wallet if it doesn't exist
    const newWallet: UserWallet = {
      userId,
      tokensBalance: 0,
      lifetimePurchasedTokens: 0,
      lifetimeEarnedTokens: 0,
      lifetimeWithdrawnTokens: 0,
      updatedAt: Timestamp.now(),
    };
    
    await db.collection('wallets').doc(userId).set(newWallet);
    return newWallet;
  }
  
  return walletDoc.data() as UserWallet;
}

/**
 * Add tokens to wallet (from purchase)
 * This is called after successful payment verification
 */
export async function addTokensToWallet(
  userId: string,
  tokens: number,
  externalId: string,
  provider: WalletTransactionProvider,
  packageId?: TokenPackageId
): Promise<{ newBalance: number; transactionId: string }> {
  const txId = generateId();
  const now = Timestamp.now();
  
  // Check idempotency
  const existingTx = await db
    .collection('walletTransactions')
    .where('externalId', '==', externalId)
    .where('userId', '==', userId)
    .limit(1)
    .get();
  
  if (!existingTx.empty) {
    logger.info(`Duplicate purchase attempt detected: ${externalId}`);
    throw new HttpsError('already-exists', 'Transaction already processed');
  }
  
  // Create transaction record
  const transaction: WalletTransaction = {
    txId,
    userId,
    type: 'TOKEN_PURCHASE',
    direction: 'IN',
    amountTokens: tokens,
    externalId,
    provider,
    createdAt: now,
    meta: {
      packageId: packageId || null,
    },
  };
  
  // Update wallet and create transaction atomically
  await db.runTransaction(async (firestoreTx) => {
    const walletRef = db.collection('wallets').doc(userId);
    const walletDoc = await firestoreTx.get(walletRef);
    
    if (!walletDoc.exists) {
      // Create new wallet
      const newWallet: UserWallet = {
        userId,
        tokensBalance: tokens,
        lifetimePurchasedTokens: tokens,
        lifetimeEarnedTokens: 0,
        lifetimeWithdrawnTokens: 0,
        updatedAt: now,
      };
      firestoreTx.set(walletRef, newWallet);
    } else {
      // Update existing wallet
      firestoreTx.update(walletRef, {
        tokensBalance: increment(tokens),
        lifetimePurchasedTokens: increment(tokens),
        updatedAt: now,
      });
    }
    
    // Create transaction record
    const txRef = db.collection('walletTransactions').doc(txId);
    firestoreTx.set(txRef, transaction);
  });
  
  // Get new balance
  const updatedWallet = await getUserWallet(userId);
  
  logger.info(`Added ${tokens} tokens to user ${userId}, new balance: ${updatedWallet.tokensBalance}`);
  
  return {
    newBalance: updatedWallet.tokensBalance,
    transactionId: txId,
  };
}

// ============================================================================
// SUBSCRIPTION OPERATIONS
// ============================================================================

/**
 * Update user subscription status
 */
export async function updateSubscriptionStatus(
  userId: string,
  tier: SubscriptionTier,
  active: boolean,
  planId: string | null,
  provider: 'STRIPE' | 'GOOGLE' | 'APPLE',
  currentPeriodEnd: string | null
): Promise<void> {
  const subRef = db.collection('userSubscriptions').doc(userId);
  const now = Timestamp.now();
  
  const updates: Partial<UserSubscriptions> = {
    updatedAt: now,
  };
  
  if (tier === 'VIP') {
    updates.vipActive = active;
    updates.vipPlanId = planId;
    updates.vipProvider = provider;
    updates.vipCurrentPeriodEnd = currentPeriodEnd;
  } else if (tier === 'ROYAL') {
    updates.royalActive = active;
    updates.royalPlanId = planId;
    updates.royalProvider = provider;
    updates.royalCurrentPeriodEnd = currentPeriodEnd;
  }
  
  await subRef.set(updates, { merge: true });
  
  logger.info(`Updated ${tier} subscription for user ${userId}: active=${active}`);
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Write billing audit log
 */
export async function writeBillingAuditLog(
  action: BillingAuditAction,
  userId: string,
  provider: WalletTransactionProvider,
  details: {
    amount?: number;
    packageId?: TokenPackageId;
    tier?: SubscriptionTier;
    externalId?: string;
  }
): Promise<void> {
  const logId = generateId();
  const now = Timestamp.now();
  
  const auditLog = {
    logId,
    action,
    userId,
    provider,
    timestamp: now,
    ...details,
  };
  
  await db.collection('billingAuditLogs').doc(logId).set(auditLog);
  
  logger.info(`Billing audit log: ${action} for user ${userId}`);
}

// ============================================================================
// CURRENCY HELPERS
// ============================================================================

/**
 * Resolve currency for a locale
 */
export function resolveCurrency(locale: string, currencyOverride?: string | null): string {
  if (currencyOverride && CURRENCY_CONFIGS[currencyOverride]) {
    return currencyOverride;
  }
  
  return REGION_DEFAULT_CURRENCY[locale] || 'PLN';
}

/**
 * Convert PLN price to target currency
 */
export function convertPrice(pricePLN: number, targetCurrency: string): number {
  const config = CURRENCY_CONFIGS[targetCurrency];
  if (!config) {
    return pricePLN; // Fallback to PLN
  }
  
  return Math.round(pricePLN * config.conversionRate * 100) / 100;
}

/**
 * Format price with currency symbol
 */
export function formatPrice(amount: number, currency: string): string {
  const config = CURRENCY_CONFIGS[currency];
  const symbol = config?.symbol || currency;
  
  return `${symbol}${amount.toFixed(2)}`;
}

// ============================================================================
// PACKAGE VALIDATION
// ============================================================================

/**
 * Validate and get token package
 */
export function getTokenPackage(packageId: string): { tokens: number; pricePLN: number } {
  const pkg = TOKEN_PACKAGES[packageId as TokenPackageId];
  
  if (!pkg) {
    throw new HttpsError('invalid-argument', `Invalid package ID: ${packageId}`);
  }
  
  return {
    tokens: pkg.tokens,
    pricePLN: pkg.pricePLN,
  };
}

/**
 * Validate subscription tier
 */
export function validateSubscriptionTier(tier: string): SubscriptionTier {
  if (tier !== 'VIP' && tier !== 'ROYAL') {
    throw new HttpsError('invalid-argument', `Invalid subscription tier: ${tier}`);
  }
  return tier;
}

// ============================================================================
// IDEMPOTENCY HELPERS
// ============================================================================

/**
 * Check if transaction was already processed
 */
export async function isTransactionProcessed(
  externalId: string,
  userId: string
): Promise<boolean> {
  const existingTx = await db
    .collection('walletTransactions')
    .where('externalId', '==', externalId)
    .where('userId', '==', userId)
    .limit(1)
    .get();
  
  return !existingTx.empty;
}

/**
 * Check if subscription sync was already processed
 */
export async function isSubscriptionSyncProcessed(
  originalTransactionId: string,
  userId: string,
  tier: SubscriptionTier
): Promise<boolean> {
  const existingLog = await db
    .collection('billingAuditLogs')
    .where('action', '==', 'MOBILE_SUBSCRIPTION_SYNCED')
    .where('userId', '==', userId)
    .where('externalId', '==', originalTransactionId)
    .where('tier', '==', tier)
    .limit(1)
    .get();
  
  return !existingLog.empty;
}