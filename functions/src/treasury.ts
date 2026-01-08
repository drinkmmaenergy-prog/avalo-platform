/**
 * PACK 128 - Treasury & Payment Vault System
 * Core treasury functions for bank-grade token accounting
 * 
 * NON-NEGOTIABLE RULES:
 * - 65/35 split is immutable
 * - No bonuses or discounts
 * - Instant settlement on every transaction
 * - Complete audit trail
 * - Fraud-proof accounting
 */

import { https, logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, generateId, serverTimestamp } from './init';
import {
  AllocateSpendRequest,
  AllocateSpendResponse,
  RefundRequest,
  RefundResponse,
  GetBalanceRequest,
  GetBalanceResponse,
  TreasuryLedgerEntry,
  UserTokenWallet,
  CreatorVault,
  AvaloRevenueVault,
  RefundRecord,
  RefundStatus,
  VaultType,
  LedgerEventType,
  TransactionType,
} from './types/treasury.types';
import {
  calculateRevenueSplit,
  REFUND_POLICY,
  SECURITY_POLICY,
} from './config/treasury.config';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create ledger entry (immutable audit record)
 */
async function createLedgerEntry(
  eventType: LedgerEventType,
  userId: string,
  tokenAmount: number,
  vault: VaultType,
  metadata: Record<string, any> = {},
  creatorId?: string
): Promise<string> {
  const ledgerId = generateId();
  
  const entry: TreasuryLedgerEntry = {
    ledgerId,
    eventType,
    userId,
    creatorId,
    tokenAmount,
    vault,
    timestamp: serverTimestamp() as any,
    metadata,
  };

  await db.collection('treasury_ledger').doc(ledgerId).set(entry);
  
  logger.info('Ledger entry created', {
    ledgerId,
    eventType,
    userId,
    vault,
    tokenAmount,
  });

  return ledgerId;
}

/**
 * Check for double-spend (prevent duplicate transactions)
 */
async function checkDoubleSpend(
  userId: string,
  transactionId: string
): Promise<boolean> {
  if (!SECURITY_POLICY.DOUBLE_SPEND_PROTECTION) {
    return false;
  }

  // Check if transaction ID already exists in ledger
  const existing = await db
    .collection('treasury_ledger')
    .where('userId', '==', userId)
    .where('metadata.transactionId', '==', transactionId)
    .limit(1)
    .get();

  return !existing.empty;
}

/**
 * Initialize user wallet if doesn't exist
 */
async function ensureUserWallet(userId: string): Promise<void> {
  const walletRef = db.collection('user_token_wallets').doc(userId);
  const wallet = await walletRef.get();

  if (!wallet.exists) {
    const newWallet: UserTokenWallet = {
      userId,
      availableTokens: 0,
      lifetimePurchased: 0,
      lifetimeSpent: 0,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };
    await walletRef.set(newWallet);
  }
}

/**
 * Initialize creator vault if doesn't exist
 */
async function ensureCreatorVault(userId: string): Promise<void> {
  const vaultRef = db.collection('creator_vaults').doc(userId);
  const vault = await vaultRef.get();

  if (!vault.exists) {
    const newVault: CreatorVault = {
      userId,
      availableTokens: 0,
      lockedTokens: 0,
      lifetimeEarned: 0,
      lifetimePaidOut: 0,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };
    await vaultRef.set(newVault);
  }
}

/**
 * Initialize Avalo revenue vault (singleton)
 */
async function ensureAvaloVault(): Promise<void> {
  const vaultRef = db.collection('avalo_revenue_vault').doc('platform');
  const vault = await vaultRef.get();

  if (!vault.exists) {
    const newVault: AvaloRevenueVault = {
      id: 'platform',
      totalRevenue: 0,
      availableRevenue: 0,
      lifetimeWithdrawn: 0,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };
    await vaultRef.set(newVault);
  }
}

/**
 * Check if refund is eligible
 */
async function checkRefundEligibility(
  transactionId: string,
  userId: string
): Promise<{ status: RefundStatus; reason: string }> {
  // Find original transaction in ledger
  const ledgerSnapshot = await db
    .collection('treasury_ledger')
    .where('metadata.transactionId', '==', transactionId)
    .where('eventType', '==', 'SPEND')
    .limit(1)
    .get();

  if (ledgerSnapshot.empty) {
    return {
      status: 'INELIGIBLE',
      reason: 'Transaction not found',
    };
  }

  const ledgerEntry = ledgerSnapshot.docs[0].data() as TreasuryLedgerEntry;

  // Check if content was delivered
  if (ledgerEntry.metadata.contentDelivered) {
    return {
      status: 'CONTENT_DELIVERED',
      reason: 'Content has already been delivered',
    };
  }

  // Check grace period
  const transactionTime = ledgerEntry.timestamp;
  const now = new Date();
  const graceWindowMs = REFUND_POLICY.GRACE_WINDOW_MINUTES * 60 * 1000;
  
  if (transactionTime && typeof transactionTime !== 'function') {
    const timeDiff = now.getTime() - (transactionTime as any).toMillis();
    if (timeDiff > graceWindowMs) {
      return {
        status: 'GRACE_EXPIRED',
        reason: `Grace period of ${REFUND_POLICY.GRACE_WINDOW_MINUTES} minutes expired`,
      };
    }
  }

  // Check for fraud patterns (check refund history)
  const recentRefunds = await db
    .collection('refund_records')
    .where('userId', '==', userId)
    .where('processedAt', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .get();

  if (recentRefunds.size >= REFUND_POLICY.MAX_REFUNDS_PER_DAY_PER_USER) {
    return {
      status: 'FRAUD_DETECTED',
      reason: 'Too many refunds in 24 hours',
    };
  }

  return {
    status: 'ELIGIBLE',
    reason: 'Refund eligible',
  };
}

// ============================================================================
// MAIN TREASURY FUNCTIONS
// ============================================================================

/**
 * Allocate token spend with instant 65/35 split
 * This is called on EVERY monetized interaction
 */
export const treasury_allocateSpend = https.onCall<AllocateSpendRequest>(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 60,
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, creatorId, tokenAmount, transactionType, contentId, metadata = {} } = request.data;

    // Validate input
    if (!userId || !creatorId || !tokenAmount || !transactionType) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    if (tokenAmount <= 0) {
      throw new HttpsError('invalid-argument', 'Token amount must be positive');
    }

    if (userId === creatorId) {
      throw new HttpsError('invalid-argument', 'Cannot spend tokens on own content');
    }

    // Check double-spend protection
    const transactionId = metadata.transactionId || generateId();
    if (await checkDoubleSpend(userId, transactionId)) {
      throw new HttpsError('already-exists', 'Duplicate transaction detected');
    }

    try {
      // Run in transaction for atomicity
      const result = await db.runTransaction(async (transaction) => {
        // Ensure all vaults exist
        await ensureUserWallet(userId);
        await ensureCreatorVault(creatorId);
        await ensureAvaloVault();

        // Get user wallet
        const walletRef = db.collection('user_token_wallets').doc(userId);
        const walletSnap = await transaction.get(walletRef);
        const wallet = walletSnap.data() as UserTokenWallet;

        // Check sufficient balance
        if (wallet.availableTokens < tokenAmount) {
          throw new HttpsError(
            'failed-precondition',
            `Insufficient balance. Available: ${wallet.availableTokens}, Required: ${tokenAmount}`
          );
        }

        // Calculate 65/35 split
        const split = calculateRevenueSplit(tokenAmount);

        // Get creator vault
        const creatorVaultRef = db.collection('creator_vaults').doc(creatorId);
        const creatorSnap = await transaction.get(creatorVaultRef);
        const creatorVault = creatorSnap.data() as CreatorVault;

        // Get Avalo vault
        const avaloVaultRef = db.collection('avalo_revenue_vault').doc('platform');
        const avaloSnap = await transaction.get(avaloVaultRef);
        const avaloVault = avaloSnap.data() as AvaloRevenueVault;

        // Update user wallet (deduct tokens)
        transaction.update(walletRef, {
          availableTokens: wallet.availableTokens - tokenAmount,
          lifetimeSpent: wallet.lifetimeSpent + tokenAmount,
          lastSpendAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Update creator vault (add 65%)
        transaction.update(creatorVaultRef, {
          availableTokens: creatorVault.availableTokens + split.creatorAmount,
          lifetimeEarned: creatorVault.lifetimeEarned + split.creatorAmount,
          lastEarnedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Update Avalo vault (add 35%)
        transaction.update(avaloVaultRef, {
          totalRevenue: avaloVault.totalRevenue + split.avaloAmount,
          availableRevenue: avaloVault.availableRevenue + split.avaloAmount,
          lastRevenueAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        return {
          userBalance: wallet.availableTokens - tokenAmount,
          creatorEarnings: split.creatorAmount,
          avaloRevenue: split.avaloAmount,
        };
      });

      // Create ledger entries (outside transaction for performance)
      const ledgerMetadata = {
        transactionId,
        transactionType,
        contentId,
        ...metadata,
        balanceAfter: result.userBalance,
      };

      // User spend ledger entry
      const spendLedgerId = await createLedgerEntry(
        'SPEND',
        userId,
        -tokenAmount,
        'USER',
        ledgerMetadata
      );

      // Creator earn ledger entry
      await createLedgerEntry(
        'EARN',
        creatorId,
        result.creatorEarnings,
        'CREATOR',
        { ...ledgerMetadata, spendLedgerId },
        creatorId
      );

      // Avalo commission ledger entry
      await createLedgerEntry(
        'COMMISSION',
        userId,
        result.avaloRevenue,
        'AVALO_REVENUE',
        { ...ledgerMetadata, spendLedgerId }
      );

      const response: AllocateSpendResponse = {
        success: true,
        ledgerId: spendLedgerId,
        userBalance: result.userBalance,
        creatorEarnings: result.creatorEarnings,
        avaloRevenue: result.avaloRevenue,
        timestamp: serverTimestamp() as any,
      };

      logger.info('Token spend allocated', {
        userId,
        creatorId,
        tokenAmount,
        split: result,
      });

      return response;
    } catch (error: any) {
      logger.error('Failed to allocate spend', { error, userId, tokenAmount });
      throw new HttpsError('internal', error.message || 'Failed to process transaction');
    }
  }
);

/**
 * Process refund (fraud-proof with eligibility checks)
 */
export const treasury_refundTransaction = https.onCall<RefundRequest>(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { transactionId, reason, adminId } = request.data;

    if (!transactionId || !reason) {
      throw new HttpsError('invalid-argument', 'Missing transaction ID or reason');
    }

    // Check if admin approval required
    if (REFUND_POLICY.REQUIRE_ADMIN_APPROVAL && !adminId) {
      throw new HttpsError('permission-denied', 'Admin approval required for refunds');
    }

    try {
      // Find original transaction
      const ledgerSnapshot = await db
        .collection('treasury_ledger')
        .where('metadata.transactionId', '==', transactionId)
        .where('eventType', '==', 'SPEND')
        .limit(1)
        .get();

      if (ledgerSnapshot.empty) {
        throw new HttpsError('not-found', 'Transaction not found');
      }

      const originalLedger = ledgerSnapshot.docs[0].data() as TreasuryLedgerEntry;
      const userId = originalLedger.userId;
      const creatorId = originalLedger.creatorId;
      const tokenAmount = Math.abs(originalLedger.tokenAmount);

      // Check eligibility
      const eligibility = await checkRefundEligibility(transactionId, userId);
      
      if (eligibility.status !== 'ELIGIBLE') {
        const response: RefundResponse = {
          success: false,
          refunded: false,
          status: eligibility.status,
          reason: eligibility.reason,
        };
        return response;
      }

      // Process refund in transaction
      await db.runTransaction(async (transaction) => {
        // Calculate split to reverse
        const split = calculateRevenueSplit(tokenAmount);

        // Get all vaults
        const walletRef = db.collection('user_token_wallets').doc(userId);
        const walletSnap = await transaction.get(walletRef);
        const wallet = walletSnap.data() as UserTokenWallet;

        if (creatorId) {
          const creatorVaultRef = db.collection('creator_vaults').doc(creatorId);
          const creatorSnap = await transaction.get(creatorVaultRef);
          const creatorVault = creatorSnap.data() as CreatorVault;

          const avaloVaultRef = db.collection('avalo_revenue_vault').doc('platform');
          const avaloSnap = await transaction.get(avaloVaultRef);
          const avaloVault = avaloSnap.data() as AvaloRevenueVault;

          // Return tokens to user
          transaction.update(walletRef, {
            availableTokens: wallet.availableTokens + tokenAmount,
            updatedAt: serverTimestamp(),
          });

          // Deduct from creator vault
          transaction.update(creatorVaultRef, {
            availableTokens: Math.max(0, creatorVault.availableTokens - split.creatorAmount),
            updatedAt: serverTimestamp(),
          });

          // Deduct from Avalo vault
          transaction.update(avaloVaultRef, {
            availableRevenue: Math.max(0, avaloVault.availableRevenue - split.avaloAmount),
            totalRevenue: avaloVault.totalRevenue - split.avaloAmount,
            updatedAt: serverTimestamp(),
          });
        }
      });

      // Create refund ledger entries
      const refundId = generateId();
      const refundMetadata = {
        originalTransactionId: transactionId,
        refundId,
        reason,
        adminId,
      };

      await createLedgerEntry('REFUND', userId, tokenAmount, 'USER', refundMetadata);
      
      if (creatorId) {
        const split = calculateRevenueSplit(tokenAmount);
        await createLedgerEntry('REFUND_CREATOR', creatorId, -split.creatorAmount, 'CREATOR', refundMetadata, creatorId);
        await createLedgerEntry('REFUND_COMMISSION', userId, -split.avaloAmount, 'AVALO_REVENUE', refundMetadata);
      }

      // Create refund record
      const refundRecord: RefundRecord = {
        id: refundId,
        originalTransactionId: transactionId,
        userId,
        creatorId,
        tokenAmount,
        reason,
        status: 'ELIGIBLE',
        eligibilityCheck: {
          contentDelivered: false,
          graceWindowExpired: false,
          fraudDetected: false,
        },
        processedAt: serverTimestamp() as any,
        processedBy: adminId,
      };

      await db.collection('refund_records').doc(refundId).set(refundRecord);

      const response: RefundResponse = {
        success: true,
        refunded: true,
        status: 'ELIGIBLE',
        reason: 'Refund processed successfully',
        tokenAmount,
        ledgerIds: [refundId],
      };

      logger.info('Refund processed', { transactionId, userId, tokenAmount });

      return response;
    } catch (error: any) {
      logger.error('Refund failed', { error, transactionId });
      throw new HttpsError('internal', error.message || 'Failed to process refund');
    }
  }
);

/**
 * Get user token balance
 */
export const treasury_getUserBalance = https.onCall<GetBalanceRequest>(
  {
    region: 'us-central1',
    memory: '128MiB',
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId } = request.data;
    const requestUserId = userId || auth.uid;

    // Users can only check their own balance unless admin
    if (requestUserId !== auth.uid && !auth.token?.admin) {
      throw new HttpsError('permission-denied', 'Cannot check other user balances');
    }

    try {
      await ensureUserWallet(requestUserId);
      
      const walletSnap = await db.collection('user_token_wallets').doc(requestUserId).get();
      const wallet = walletSnap.data() as UserTokenWallet;

      const response: GetBalanceResponse = {
        availableTokens: wallet.availableTokens,
        lifetimeSpent: wallet.lifetimeSpent,
        vaultType: 'USER',
      };

      return response;
    } catch (error: any) {
      logger.error('Failed to get balance', { error, userId: requestUserId });
      throw new HttpsError('internal', 'Failed to retrieve balance');
    }
  }
);

/**
 * Get creator earnings balance
 */
export const treasury_getCreatorBalance = https.onCall<GetBalanceRequest>(
  {
    region: 'us-central1',
    memory: '128MiB',
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId } = request.data;
    const requestUserId = userId || auth.uid;

    // Users can only check their own earnings unless admin
    if (requestUserId !== auth.uid && !auth.token?.admin) {
      throw new HttpsError('permission-denied', 'Cannot check other user earnings');
    }

    try {
      await ensureCreatorVault(requestUserId);
      
      const vaultSnap = await db.collection('creator_vaults').doc(requestUserId).get();
      const vault = vaultSnap.data() as CreatorVault;

      const response: GetBalanceResponse = {
        availableTokens: vault.availableTokens,
        lockedTokens: vault.lockedTokens,
        lifetimeEarned: vault.lifetimeEarned,
        vaultType: 'CREATOR',
      };

      return response;
    } catch (error: any) {
      logger.error('Failed to get creator balance', { error, userId: requestUserId });
      throw new HttpsError('internal', 'Failed to retrieve creator balance');
    }
  }
);

/**
 * Record token purchase (fiat to tokens)
 */
export const treasury_recordPurchase = https.onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {
      userId,
      tokenAmount,
      fiatAmount,
      fiatCurrency,
      paymentMethodType,
      paymentIntentId,
      metadata = {},
    } = request.data;

    if (!userId || !tokenAmount || !fiatAmount || !fiatCurrency) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    if (tokenAmount <= 0) {
      throw new HttpsError('invalid-argument', 'Token amount must be positive');
    }

    try {
      await ensureUserWallet(userId);

      // Update user wallet
      const walletRef = db.collection('user_token_wallets').doc(userId);
      await db.runTransaction(async (transaction) => {
        const walletSnap = await transaction.get(walletRef);
        const wallet = walletSnap.data() as UserTokenWallet;

        transaction.update(walletRef, {
          availableTokens: wallet.availableTokens + tokenAmount,
          lifetimePurchased: wallet.lifetimePurchased + tokenAmount,
          lastPurchaseAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      // Create ledger entry
      await createLedgerEntry('PURCHASE', userId, tokenAmount, 'USER', {
        fiatAmount,
        fiatCurrency,
        paymentMethodType,
        paymentIntentId,
        exchangeRate: fiatAmount / tokenAmount,
        ...metadata,
      });

      logger.info('Token purchase recorded', { userId, tokenAmount, fiatAmount });

      return {
        success: true,
        newBalance: (await db.collection('user_token_wallets').doc(userId).get()).data()?.availableTokens,
      };
    } catch (error: any) {
      logger.error('Failed to record purchase', { error, userId, tokenAmount });
      throw new HttpsError('internal', 'Failed to record purchase');
    }
  }
);