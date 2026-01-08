/**
 * PACK 277 — Unified Wallet Service (Enhanced with PACK 321)
 * Core wallet operations: spend, earn, refund, payout
 * Context-based revenue splitting aligned with final tokenomics
 */

import { db, generateId, serverTimestamp } from './init';
import { FieldValue } from 'firebase-admin/firestore';
import {
  WalletData,
  WalletTransaction,
  SpendTokensRequest,
  SpendTokensResponse,
  EarnTokensRequest,
  EarnTokensResponse,
  RefundTokensRequest,
  RefundTokensResponse,
  TransactionSource,
  WalletRevenueContextType,
  WalletRevenueSplit,
} from './types/pack277-wallet.types';

// ============================================================================
// PACK 321 — CONTEXT-BASED REVENUE SPLIT
// ============================================================================

/**
 * Get wallet split for context type
 * Enforces final revenue split rules per PACK 321
 */
export function getWalletSplitForContext(
  ctx: WalletRevenueContextType
): WalletRevenueSplit {
  switch (ctx) {
    case 'CHAT_PAID':
    case 'CALL_VOICE':
    case 'CALL_VIDEO':
    case 'AI_SESSION':
    case 'MEDIA_PURCHASE':
      return { platformShare: 0.35, earnerShare: 0.65 };
    
    case 'CALENDAR_BOOKING':
    case 'EVENT_TICKET':
      return { platformShare: 0.20, earnerShare: 0.80 };
    
    case 'TIP':
      return { platformShare: 0.10, earnerShare: 0.90 };
    
    case 'AVALO_ONLY_REVENUE':
    case 'AVALO_ONLY_VIDEO':
      return { platformShare: 1.0, earnerShare: 0.0 };
    
    default:
      throw new Error(`Unsupported WalletRevenueContextType: ${ctx}`);
  }
}

// Legacy revenue split (deprecated, kept for backward compatibility)
const REVENUE_SPLIT = {
  CHAT: { creator: 0.65, avalo: 0.35 },
  CALL: { creator: 0.80, avalo: 0.20 },
  CALENDAR: { creator: 0.80, avalo: 0.20 },
  EVENT: { creator: 0.80, avalo: 0.20 },
  TIP: { creator: 0.90, avalo: 0.10 },
  MEDIA: { creator: 0.65, avalo: 0.35 },
  DIGITAL_PRODUCT: { creator: 0.65, avalo: 0.35 },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get revenue split for transaction source (LEGACY)
 * Use getWalletSplitForContext for new code
 */
function getRevenueSplit(source: TransactionSource): { creator: number; avalo: number } {
  return REVENUE_SPLIT[source] || { creator: 0.65, avalo: 0.35 };
}

/**
 * Map context type to refund reason
 */
type RefundReason =
  | 'CANCELLED_BY_PAYER'
  | 'CANCELLED_BY_EARNER'
  | 'TIME_WINDOW_POLICY'
  | 'MISMATCH_REFUND'
  | 'SYSTEM_ERROR';

/**
 * Ensure wallet exists for user
 */
async function ensureWallet(userId: string): Promise<void> {
  const walletRef = db.collection('wallets').doc(userId);
  const walletDoc = await walletRef.get();

  if (!walletDoc.exists) {
    const wallet: WalletData = {
      userId,
      tokensBalance: 0,
      lifetimePurchasedTokens: 0,
      lifetimeSpentTokens: 0,
      lifetimeEarnedTokens: 0,
      lastUpdated: serverTimestamp() as any,
      createdAt: serverTimestamp() as any,
    };
    await walletRef.set(wallet);
  }
}

/**
 * Create transaction record
 */
async function createTransaction(
  userId: string,
  type: string,
  source: TransactionSource,
  amountTokens: number,
  beforeBalance: number,
  afterBalance: number,
  metadata: any = {}
): Promise<string> {
  const txId = generateId();
  
  const transaction: WalletTransaction = {
    txId,
    userId,
    type: type as any,
    source,
    amountTokens,
    beforeBalance,
    afterBalance,
    metadata,
    timestamp: serverTimestamp() as any,
  };

  await db.collection('walletTransactions').doc(txId).set(transaction);
  
  return txId;
}

// ============================================================================
// CORE WALLET OPERATIONS
// ============================================================================

/**
 * Spend tokens (PACK 321 Enhanced)
 * Supports context-based revenue splitting for precise control
 * Backward compatible with legacy source-based splitting
 */
export async function spendTokens(
  request: SpendTokensRequest
): Promise<SpendTokensResponse> {
  const {
    userId,
    amountTokens,
    source,
    relatedId,
    creatorId,
    metadata = {},
    contextType,
    contextRef
  } = request;

  if (amountTokens <= 0) {
    return {
      success: false,
      error: 'Amount must be positive',
    };
  }

  // PACK 321: Handle AVALO_ONLY_REVENUE/VIDEO context (no earner required)
  const isAvaloOnlyRevenue = contextType === 'AVALO_ONLY_REVENUE' || contextType === 'AVALO_ONLY_VIDEO';
  
  if (!creatorId && !isAvaloOnlyRevenue && !['TIP', 'EVENT'].includes(source)) {
    return {
      success: false,
      error: 'Creator ID required for this transaction type',
    };
  }

  try {
    await ensureWallet(userId);
    if (creatorId) {
      await ensureWallet(creatorId);
    }

    // Run transaction atomically
    const result = await db.runTransaction(async (transaction) => {
      const walletRef = db.collection('wallets').doc(userId);
      const walletDoc = await transaction.get(walletRef);
      const wallet = walletDoc.data() as WalletData;

      // Check sufficient balance
      if (wallet.tokensBalance < amountTokens) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      const beforeBalance = wallet.tokensBalance;
      const afterBalance = beforeBalance - amountTokens;

      // Update spender wallet
      transaction.update(walletRef, {
        tokensBalance: afterBalance,
        lifetimeSpentTokens: FieldValue.increment(amountTokens),
        lastUpdated: serverTimestamp(),
      });

      let creatorEarned = 0;
      let avaloShare = 0;

      // PACK 321: Use context-based split if provided, otherwise fall back to legacy
      if (contextType) {
        const split = getWalletSplitForContext(contextType);
        creatorEarned = Math.floor(amountTokens * split.earnerShare);
        avaloShare = amountTokens - creatorEarned;

        // Only credit earner if there's an earner share
        if (creatorId && split.earnerShare > 0) {
          const creatorWalletRef = db.collection('wallets').doc(creatorId);
          const creatorDoc = await transaction.get(creatorWalletRef);
          const creatorWallet = creatorDoc.data() as WalletData;

          transaction.update(creatorWalletRef, {
            tokensBalance: creatorWallet.tokensBalance + creatorEarned,
            lifetimeEarnedTokens: FieldValue.increment(creatorEarned),
            lastUpdated: serverTimestamp(),
          });
        }
      } else if (creatorId) {
        // Legacy split logic for backward compatibility
        const split = getRevenueSplit(source);
        creatorEarned = Math.floor(amountTokens * split.creator);
        avaloShare = amountTokens - creatorEarned;

        const creatorWalletRef = db.collection('wallets').doc(creatorId);
        const creatorDoc = await transaction.get(creatorWalletRef);
        const creatorWallet = creatorDoc.data() as WalletData;

        transaction.update(creatorWalletRef, {
          tokensBalance: creatorWallet.tokensBalance + creatorEarned,
          lifetimeEarnedTokens: FieldValue.increment(creatorEarned),
          lastUpdated: serverTimestamp(),
        });
      }

      // Always track Avalo's platform revenue
      if (avaloShare > 0) {
        const revenueRef = db.collection('platformRevenue').doc('total');
        transaction.set(revenueRef, {
          totalRevenue: FieldValue.increment(avaloShare),
          lastUpdated: serverTimestamp(),
        }, { merge: true });
      }

      return {
        beforeBalance,
        afterBalance,
        creatorEarned,
        avaloShare,
      };
    });

    // Create transaction record
    const txId = await createTransaction(
      userId,
      'SPEND',
      source,
      -amountTokens,
      result.beforeBalance,
      result.afterBalance,
      {
        relatedId,
        creatorId,
        contextType,
        contextRef,
        split: (creatorId || contextType) ? {
          creatorAmount: result.creatorEarned,
          avaloAmount: result.avaloShare,
          splitPercent: contextType
            ? getWalletSplitForContext(contextType).earnerShare * 100
            : getRevenueSplit(source).creator * 100,
        } : undefined,
        ...metadata,
      }
    );

    // Create earning transaction for creator
    if (creatorId && result.creatorEarned > 0) {
      await createTransaction(
        creatorId,
        'EARN',
        source,
        result.creatorEarned,
        result.beforeBalance,
        result.afterBalance + result.creatorEarned,
        {
          relatedId,
          payerId: userId,
          contextType,
          contextRef,
          ...metadata,
        }
      );
    }

    return {
      success: true,
      txId,
      newBalance: result.afterBalance,
      creatorEarned: result.creatorEarned,
      avaloShare: result.avaloShare,
    };
  } catch (error: any) {
    if (error.message === 'INSUFFICIENT_FUNDS') {
      return {
        success: false,
        error: 'Insufficient token balance',
      };
    }
    
    console.error('Spend tokens error:', error);
    return {
      success: false,
      error: error.message || 'Failed to process transaction',
    };
  }
}

/**
 * Earn tokens (revenue for users from chat/calls/media/calendar/events)
 * Revenue split is already applied by spendTokens, this is for direct earnings
 */
export async function earnTokens(
  request: EarnTokensRequest
): Promise<EarnTokensResponse> {
  const { userId, amountTokens, source, relatedId, payerId, metadata = {} } = request;

  if (amountTokens <= 0) {
    return {
      success: false,
      error: 'Amount must be positive',
    };
  }

  try {
    await ensureWallet(userId);

    const result = await db.runTransaction(async (transaction) => {
      const walletRef = db.collection('wallets').doc(userId);
      const walletDoc = await transaction.get(walletRef);
      const wallet = walletDoc.data() as WalletData;

      const beforeBalance = wallet.tokensBalance;
      const afterBalance = beforeBalance + amountTokens;

      transaction.update(walletRef, {
        tokensBalance: afterBalance,
        lifetimeEarnedTokens: FieldValue.increment(amountTokens),
        lastUpdated: serverTimestamp(),
      });

      return { beforeBalance, afterBalance };
    });

    const txId = await createTransaction(
      userId,
      'EARN',
      source,
      amountTokens,
      result.beforeBalance,
      result.afterBalance,
      {
        relatedId,
        payerId,
        ...metadata,
      }
    );

    return {
      success: true,
      txId,
      newBalance: result.afterBalance,
    };
  } catch (error: any) {
    console.error('Earn tokens error:', error);
    return {
      success: false,
      error: error.message || 'Failed to process earning',
    };
  }
}

/**
 * Refund tokens (PACK 321 Enhanced)
 * Supports context-aware refunds with calendar/events time-window rules
 * Can refund platform share for earner-initiated cancellations
 */
export async function refundTokens(
  request: RefundTokensRequest
): Promise<RefundTokensResponse> {
  const {
    userId,
    amountTokens,
    source,
    relatedId,
    reason,
    metadata = {},
    contextType,
    refundPlatformShare = false,
    originalTransactionId,
    earnerUserId
  } = request;

  if (amountTokens <= 0) {
    return {
      success: false,
      error: 'Amount must be positive',
    };
  }

  try {
    await ensureWallet(userId);

    // PACK 321: Determine if platform commission should be refunded
    let shouldRefundPlatformShare = refundPlatformShare;
    
    // For calendar/event contexts with earner cancellation, always refund platform share
    if (contextType && ['CALENDAR_BOOKING', 'EVENT_TICKET'].includes(contextType)) {
      if (reason === 'CANCELLED_BY_EARNER') {
        shouldRefundPlatformShare = true;
      }
    }

    const result = await db.runTransaction(async (transaction) => {
      const walletRef = db.collection('wallets').doc(userId);
      const walletDoc = await transaction.get(walletRef);
      const wallet = walletDoc.data() as WalletData;

      const beforeBalance = wallet.tokensBalance;
      const afterBalance = beforeBalance + amountTokens;

      // Refund to payer wallet
      transaction.update(walletRef, {
        tokensBalance: afterBalance,
        lifetimeSpentTokens: FieldValue.increment(-amountTokens),
        lastUpdated: serverTimestamp(),
      });

      let earnerDeduction = 0;
      let platformDeduction = 0;

      // If platform share should be refunded, deduct from both earner and platform
      if (shouldRefundPlatformShare && contextType && earnerUserId) {
        const split = getWalletSplitForContext(contextType);
        earnerDeduction = Math.floor(amountTokens * split.earnerShare);
        platformDeduction = amountTokens - earnerDeduction;

        // Deduct from earner wallet
        if (earnerDeduction > 0) {
          await ensureWallet(earnerUserId);
          const earnerWalletRef = db.collection('wallets').doc(earnerUserId);
          const earnerDoc = await transaction.get(earnerWalletRef);
          const earnerWallet = earnerDoc.data() as WalletData;

          // Only deduct if earner has sufficient balance
          if (earnerWallet.tokensBalance >= earnerDeduction) {
            transaction.update(earnerWalletRef, {
              tokensBalance: earnerWallet.tokensBalance - earnerDeduction,
              lifetimeEarnedTokens: FieldValue.increment(-earnerDeduction),
              lastUpdated: serverTimestamp(),
            });
          }
        }

        // Deduct from platform revenue
        if (platformDeduction > 0) {
          const revenueRef = db.collection('platformRevenue').doc('total');
          transaction.set(revenueRef, {
            totalRevenue: FieldValue.increment(-platformDeduction),
            lastUpdated: serverTimestamp(),
          }, { merge: true });
        }
      }

      return {
        beforeBalance,
        afterBalance,
        earnerDeduction,
        platformDeduction
      };
    });

    const txId = await createTransaction(
      userId,
      'REFUND',
      source,
      amountTokens,
      result.beforeBalance,
      result.afterBalance,
      {
        relatedId,
        reason,
        contextType,
        originalTransactionId,
        refundDetails: shouldRefundPlatformShare ? {
          platformRefunded: true,
          earnerDeduction: result.earnerDeduction,
          platformDeduction: result.platformDeduction,
        } : undefined,
        ...metadata,
      }
    );

    return {
      success: true,
      txId,
      newBalance: result.afterBalance,
    };
  } catch (error: any) {
    console.error('Refund tokens error:', error);
    return {
      success: false,
      error: error.message || 'Failed to process refund',
    };
  }
}

/**
 * Get wallet bal for user
 */
export async function getWalletBalance(userId: string): Promise<WalletData | null> {
  try {
    await ensureWallet(userId);
    const walletDoc = await db.collection('wallets').doc(userId).get();
    return walletDoc.data() as WalletData;
  } catch (error) {
    console.error('Get wallet balance error:', error);
    return null;
  }
}

/**
 * Get transaction history
 */
export async function getTransactionHistory(
  userId: string,
  limit: number = 20,
  type?: string
): Promise<WalletTransaction[]> {
  try {
    let query = db
      .collection('walletTransactions')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(limit);

    if (type) {
      query = query.where('type', '==', type);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as WalletTransaction);
  } catch (error) {
    console.error('Get transaction history error:', error);
    return [];
  }
}