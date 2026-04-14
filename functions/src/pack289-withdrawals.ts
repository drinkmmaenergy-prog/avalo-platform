import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 289 — Payouts & Withdrawals Backend Functions
 * 
 * Core withdrawal system:
 * - Calculate withdrawable tokens (earned only)
 * - Create withdrawal requests
 * - Approve/reject withdrawals
 * - Token burn on approval
 * - Monthly limit tracking
 * - Integration with payout providers
 * 
 * @package platformapp
 * @version 1.0.0
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import {
  WithdrawalRequest,
  CreateWithdrawalRequest,
  CreateWithdrawalResponse,
  GetWithdrawableTokensRequest,
  GetWithdrawableTokensResponse,
  GetWithdrawalHistoryRequest,
  GetWithdrawalHistoryResponse,
  GetMonthlyLimitsRequest,
  GetMonthlyLimitsResponse,
  ApproveWithdrawalRequest,
  ApproveWithdrawalResponse,
  RejectWithdrawalRequest,
  RejectWithdrawalResponse,
  WithdrawableTokensCalculation,
  MonthlyWithdrawalStats,
  DEFAULT_WITHDRAWAL_LIMITS,
  WithdrawalErrorCode,
  KYCProfile,
  WithdrawalAuditLog,
  WithdrawalTransaction,
} from './types/pack289-withdrawals.types';
import { Timestamp, auth, onCall, timestamp } from './runtime';

const db = admin.firestore();

// ============================================================================
// CONSTANTS
// ============================================================================

import { TOKEN_PAYOUT_USD } from './config/economyConfig';

export { TOKEN_PAYOUT_USD };
const LIMITS = DEFAULT_WITHDRAWAL_LIMITS;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate withdrawable tokens for a user
 * Only earned tokens can be withdrawn (not purchased)
 */
export async function calculateWithdrawableTokens(  userId: string
): Promise<WithdrawableTokensCalculation> {
  const walletRef = db.collection('wallets').doc(userId);
  const walletDoc = await walletRef.get();

  if (!walletDoc.exists) {
    return {
      currentBalance: 0,
      totalEarned: 0,
      totalWithdrawn: 0,
      maxEarnedAvailable: 0,
      withdrawableTokens: 0,
    };
  }

  const wallet = walletDoc.data()!;
  const currentBalance = wallet.balanceTokens || 0;
  const totalEarned = wallet.lifetimeEarnedTokens || 0;
  const totalWithdrawn = wallet.totalWithdrawnTokens || 0;

  // Maximum earned tokens still available
  const maxEarnedAvailable = Math.max(0, totalEarned - totalWithdrawn);

  // Withdrawable = min(current balance, earned available)
  const withdrawableTokens = Math.max(0, Math.min(currentBalance, maxEarnedAvailable));

  return {
    currentBalance,
    totalEarned,
    totalWithdrawn,
    maxEarnedAvailable,
    withdrawableTokens,
  };
}

/**
 * Get or create monthly withdrawal stats
 */
export async function getMonthlyStats(  userId: string,
  month: string
): Promise<MonthlyWithdrawalStats> {
  const statsId = `${userId}_${month}`;
  const statsRef = db.collection('monthlyWithdrawalStats').doc(statsId);
  const statsDoc = await statsRef.get();

  if (statsDoc.exists) {
    return statsDoc.data() as MonthlyWithdrawalStats;
  }

  // Create new stats document
  const newStats: MonthlyWithdrawalStats = {
    userId,
    month,
    totalTokensWithdrawn: 0,
    totalUSDWithdrawn: 0,
    withdrawalCount: 0,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  };

  await statsRef.set(newStats);
  return newStats;
}

/**
 * Check if user can withdraw based on limits
 */
async function checkWithdrawalLimits(
  userId: string,
  requestedTokens: number
): Promise<{ canWithdraw: boolean; reasons: string[] }> {
  const reasons: string[] = [];

  // Check minimum
  if (requestedTokens < LIMITS.minTokensPerWithdrawal) {
    reasons.push(
      `Minimum withdrawal is ${LIMITS.minTokensPerWithdrawal} tokens (${LIMITS.minTokensPerWithdrawal * TOKEN_PAYOUT_USD} USD)`
    );
  }

  // Check maximum per withdrawal
  if (requestedTokens > LIMITS.maxTokensPerWithdrawal) {
    reasons.push(
      `Maximum withdrawal is ${LIMITS.maxTokensPerWithdrawal} tokens (${LIMITS.maxTokensPerWithdrawal * TOKEN_PAYOUT_USD} USD)`
    );
  }

  // Check monthly limits
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const stats = await getMonthlyStats(userId, currentMonth);

  const requestedUSD = requestedTokens * TOKEN_PAYOUT_USD;
  const newTotalUSD = stats.totalUSDWithdrawn + requestedUSD;

  if (newTotalUSD > LIMITS.maxUSDPerMonth) {
    const remaining = LIMITS.maxUSDPerMonth - stats.totalUSDWithdrawn;
    reasons.push(
      `Monthly limit exceeded. You have ${remaining.toFixed(2)} USD remaining this month.`
    );
  }

  if (stats.withdrawalCount >= LIMITS.maxWithdrawalsPerMonth) {
    reasons.push(
      `Maximum ${LIMITS.maxWithdrawalsPerMonth} withdrawals per month reached.`
    );
  }

  return {
    canWithdraw: reasons.length === 0,
    reasons,
  };
}

/**
 * Check KYC status
 */
async function checkKYCStatus(userId: string): Promise<{
  verified: boolean;
  profile?: KYCProfile;
  reason?: string;
}> {
  const kycRef = db.collection('kycProfiles').doc(userId);
  const kycDoc = await kycRef.get();

  if (!kycDoc.exists) {
    return {
      verified: false,
      reason: 'KYC profile not found. Please complete KYC verification.',
    };
  }

  const profile = kycDoc.data() as KYCProfile;

  if (profile.status !== 'VERIFIED') {
    return {
      verified: false,
      profile,
      reason: `KYC status is ${profile.status}. Only VERIFIED users can withdraw.`,
    };
  }

  return {
    verified: true,
    profile,
  };
}

/**
 * Create audit log entry
 */
export async function createAuditLog(  withdrawalId: string,
  userId: string,
  action: WithdrawalAuditLog['action'],
  performedBy: string,
  previousStatus: string | undefined,
  newStatus: string,
  notes?: string,
  metadata?: Record<string, any>
): Promise<void> {
  const logId = uuidv4();
  const log: WithdrawalAuditLog = {
    logId,
    withdrawalId,
    userId,
    action,
    performedBy,
    previousStatus: previousStatus as any,
    newStatus: newStatus as any,
    notes,
    metadata,
    timestamp: admin.firestore.Timestamp.now(),
  };

  await db.collection('withdrawalAuditLogs').doc(logId).set(log);
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Get withdrawable tokens for a user
 */
export const withdrawals_getWithdrawableTokens = functions.https.onCall(async (request) => {
  const data = request.data;
    try {
      // Auth check
      if (!request.auth) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const userId = data.userId || request.auth.uid;

      // Security: Only own data or admin
      if (userId !== request.auth.uid) {
        const userDoc = await db.collection('users').doc(request.auth.uid).get();
        if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
          return {
            success: false,
            error: 'Unauthorized',
          };
        }
      }

      // Calculate withdrawable tokens
      const calculation = await calculateWithdrawableTokens(userId);

      // Check if user can withdraw
      const reasons: string[] = [];
      
      // Check KYC
      const kycCheck = await checkKYCStatus(userId);
      if (!kycCheck.verified) {
        reasons.push(kycCheck.reason || 'KYC not verified');
      }

      // Check age verification
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists || !userDoc.data()?.ageVerified) {
        reasons.push('Age verification required (18+)');
      }

      const canWithdraw = reasons.length === 0 && calculation.withdrawableTokens > 0;

      return {
        success: true,
        withdrawableTokens: calculation.withdrawableTokens,
        calculation,
        canWithdraw,
        reasons: reasons.length > 0 ? reasons : undefined,
      };
    } catch (error) {
      console.error('Error getting withdrawable tokens:', error);
      return {
        success: false,
        error: 'Failed to calculate withdrawable tokens',
      };
    }
  }
);

export const withdrawals_createRequest = functions.https.onCall(async (request) => {

  try {

    if (!request.auth) {
      return {
        success: false,
        error: 'Authentication required'
      };
    }

    const data = request.data || {};
    const userId = data.userId || request.auth.uid;
    const requestedTokens = Number(data.requestedTokens || 0);

    if (!requestedTokens || requestedTokens <= 0) {
      return {
        success: false,
        error: 'Invalid token amount'
      };
    }

    const kycCheck = await checkKYCStatus(userId);

    if (!kycCheck?.profile) {
      return {
        success: false,
        error: 'KYC profile missing'
      };
    }

    const kycProfile = kycCheck.profile;

    const payoutAmountUSD = requestedTokens * TOKEN_PAYOUT_USD;

    const payoutCurrency =
      kycProfile.payoutMethod?.currency || 'USD';

    const fxRate = 1.0;
    const payoutAmount = payoutAmountUSD;

    const withdrawalId = uuidv4();
    const now = admin.firestore.Timestamp.now();

    const withdrawal: WithdrawalRequest = {
      withdrawalId,
      userId,
      requestedTokens,
      approvedTokens: 0,
      payoutCurrency,
      payoutAmount,
      ratePerTokenUSD: TOKEN_PAYOUT_USD,
      fxRateToPayoutCurrency: fxRate,
      status: 'PENDING_REVIEW',
      kycSnapshot: {
        kycStatus: kycProfile.status,
        country: kycProfile.country,
        payoutMethod: kycProfile.payoutMethod?.type
      },
      provider:
        kycProfile.payoutMethod?.type === 'WISE'
          ? 'WISE'
          : 'BANK_TRANSFER',
      createdAt: now,
      updatedAt: now
    };

    await db
      .collection('withdrawalRequests')
      .doc(withdrawalId)
      .set(withdrawal);

    await createAuditLog(
      withdrawalId,
      userId,
      'CREATED',
      userId,
      undefined,
      'PENDING_REVIEW',
      'Withdrawal request created by user'
    );

    return {
      success: true,
      withdrawalId,
      requestedTokens,
      payoutAmount,
      payoutCurrency,
      estimatedPayoutDate: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString()
    };

  } catch (error) {

    console.error(
      'Error creating withdrawal request:',
      error
    );

    return {
      success: false,
      error: 'Failed to create withdrawal request',
      errorCode: WithdrawalErrorCode.INTERNAL_ERROR
    };

  }

});

/**
 * Get withdrawal history for a user
 */
export const withdrawals_getHistory = functions.https.onCall(async (request) => {
  const data = request.data;
    try {
      if (!request.auth) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const userId = data.userId || request.auth.uid;
      const limit = data.limit || 20;

      // Security check
      if (userId !== request.auth.uid) {
        const userDoc = await db.collection('users').doc(request.auth.uid).get();
        if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
          return {
            success: false,
            error: 'Unauthorized',
          };
        }
      }

      // Query withdrawals
      let query = db
        .collection('withdrawalRequests')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit + 1);

      if (data.startAfter) {
        const startDoc = await db.collection('withdrawalRequests').doc(data.startAfter).get();
        if (startDoc.exists) {
          query = query.startAfter(startDoc);
        }
      }

      const snapshot = await query.get();
      const withdrawals = snapshot.docs
        .slice(0, limit)
        .map(doc => doc.data() as WithdrawalRequest);
      const hasMore = snapshot.docs.length > limit;

      return {
        success: true,
        withdrawals,
        hasMore,
      };
    } catch (error) {
      console.error('Error getting withdrawal history:', error);
      return {
        success: false,
        error: 'Failed to fetch withdrawal history',
      };
    }
  }
);

/**
 * Get monthly withdrawal limits status
 */
export const withdrawals_getMonthlyLimits = functions.https.onCall(async (request) => {
  const data = request.data;
    try {
      if (!request.auth) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const userId = data.userId || request.auth.uid;

      // Security check
      if (userId !== request.auth.uid) {
        const userDoc = await db.collection('users').doc(request.auth.uid).get();
        if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
          return {
            success: false,
            error: 'Unauthorized',
          };
        }
      }

// Get current month stats
const now = new Date();
const currentMonth =
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

const stats = await getMonthlyStats(userId, currentMonth);

// Safe defaults in case stats are missing
const totalUSDWithdrawn = stats?.totalUSDWithdrawn ?? 0;
const withdrawalCount = stats?.withdrawalCount ?? 0;

// Remaining limits
const remainingUSD = Math.max(
  0,
  LIMITS.maxUSDPerMonth - totalUSDWithdrawn
);

const remainingWithdrawals = Math.max(
  0,
  LIMITS.maxWithdrawalsPerMonth - withdrawalCount
);

// Eligibility
const canWithdraw =
  remainingUSD > 0 &&
  remainingWithdrawals > 0;

return {
  success: true,
  stats: {
    totalUSDWithdrawn,
    withdrawalCount,
    month: currentMonth,
  },
  limits: LIMITS,
  remainingUSD,
  remainingWithdrawals,
  canWithdraw,
};

} catch (error) {

  console.error(
    'Error getting monthly limits:',
    error
  );

  return {
    success: false,
    error: 'Failed to get monthly limits',
  };

    }
  }
);



















