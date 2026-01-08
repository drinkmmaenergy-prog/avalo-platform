/**
 * PACK 289 — Withdrawal Admin Functions
 * 
 * Admin-only functions for:
 * - Approving withdrawal requests
 * - Rejecting withdrawal requests
 * - Token burning on approval
 * - Manual payout management
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import {
  WithdrawalRequest,
  ApproveWithdrawalRequest,
  ApproveWithdrawalResponse,
  RejectWithdrawalRequest,
  RejectWithdrawalResponse,
  AdminWithdrawalListRequest,
  AdminWithdrawalListResponse,
  WithdrawalTransaction,
  MonthlyWithdrawalStats,
  WithdrawalErrorCode,
} from './types/pack289-withdrawals.types';
import {
  calculateWithdrawableTokens,
  createAuditLog,
  getMonthlyStats,
  PAYOUT_RATE_PLN,
} from './pack289-withdrawals';
import { startPayout } from './pack289-payout-providers';

const db = admin.firestore();

// ============================================================================
// TOKEN BURN FUNCTION
// ============================================================================

/**
 * Burn tokens for withdrawal
 * This removes tokens from wallet and marks them as withdrawn
 */
async function burnTokensForWithdrawal(
  userId: string,
  tokens: number,
  withdrawalId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const walletRef = db.collection('wallets').doc(userId);

    await db.runTransaction(async (transaction) => {
      const walletDoc = await transaction.get(walletRef);

      if (!walletDoc.exists) {
        throw new Error('Wallet not found');
      }

      const wallet = walletDoc.data()!;
      const currentBalance = wallet.balanceTokens || 0;
      const totalWithdrawn = wallet.totalWithdrawnTokens || 0;

      // Verify sufficient balance
      if (currentBalance < tokens) {
        throw new Error(`Insufficient balance. Current: ${currentBalance}, Requested: ${tokens}`);
      }

      // Calculate new balances
      const newBalance = currentBalance - tokens;
      const newTotalWithdrawn = totalWithdrawn + tokens;

      // Update wallet
      transaction.update(walletRef, {
        balanceTokens: newBalance,
        totalWithdrawnTokens: newTotalWithdrawn,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Create wallet transaction record
      const txId = uuidv4();
      const txData: WithdrawalTransaction = {
        txId,
        userId,
        type: 'WITHDRAWAL',
        source: 'PAYOUT',
        amountTokens: tokens,
        beforeBalance: currentBalance,
        afterBalance: newBalance,
        metadata: {
          withdrawalId,
          payoutAmount: tokens * PAYOUT_RATE_PLN,
          payoutCurrency: 'PLN',
          provider: 'MANUAL',
          ratePerTokenPLN: PAYOUT_RATE_PLN,
        },
        timestamp: admin.firestore.Timestamp.now(),
      };

      transaction.set(db.collection('walletTransactions').doc(txId), txData);
    });

    return { success: true };
  } catch (error) {
    console.error('Error burning tokens:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to burn tokens',
    };
  }
}

/**
 * Update monthly withdrawal stats
 */
async function updateMonthlyStats(
  userId: string,
  tokens: number,
  pln: number
): Promise<void> {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const statsId = `${userId}_${month}`;
  const statsRef = db.collection('monthlyWithdrawalStats').doc(statsId);

  await db.runTransaction(async (transaction) => {
    const statsDoc = await transaction.get(statsRef);

    if (statsDoc.exists) {
      const stats = statsDoc.data() as MonthlyWithdrawalStats;
      transaction.update(statsRef, {
        totalTokensWithdrawn: stats.totalTokensWithdrawn + tokens,
        totalPLNWithdrawn: stats.totalPLNWithdrawn + pln,
        withdrawalCount: stats.withdrawalCount + 1,
        lastWithdrawalAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      });
    } else {
      const newStats: MonthlyWithdrawalStats = {
        userId,
        month,
        totalTokensWithdrawn: tokens,
        totalPLNWithdrawn: pln,
        withdrawalCount: 1,
        lastWithdrawalAt: admin.firestore.Timestamp.now(),
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      };
      transaction.set(statsRef, newStats);
    }
  });
}

// ============================================================================
// ADMIN CLOUD FUNCTIONS
// ============================================================================

/**
 * Approve a withdrawal request (ADMIN ONLY)
 */
export const withdrawals_admin_approve = functions.https.onCall(
  async (
    data: ApproveWithdrawalRequest,
    context
  ): Promise<ApproveWithdrawalResponse> => {
    try {
      // Check admin auth
      if (!context.auth) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const adminDoc = await db.collection('users').doc(context.auth.uid).get();
      if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
        return {
          success: false,
          error: 'Admin access required',
        };
      }

      const { withdrawalId, approvedTokens, adminNotes } = data;

      // Get withdrawal request
      const withdrawalRef = db.collection('withdrawalRequests').doc(withdrawalId);
      const withdrawalDoc = await withdrawalRef.get();

      if (!withdrawalDoc.exists) {
        return {
          success: false,
          error: 'Withdrawal request not found',
        };
      }

      const withdrawal = withdrawalDoc.data() as WithdrawalRequest;

      // Check if already processed
      if (withdrawal.status !== 'PENDING_REVIEW') {
        return {
          success: false,
          error: `Withdrawal is ${withdrawal.status}, cannot approve`,
        };
      }

      // Determine approved amount
      let finalApprovedTokens = approvedTokens || withdrawal.requestedTokens;

      // Re-verify withdrawable tokens
      const calculation = await calculateWithdrawableTokens(withdrawal.userId);

      if (finalApprovedTokens > calculation.withdrawableTokens) {
        // Reduce to available amount
        console.log(
          `Reducing approved tokens from ${finalApprovedTokens} to ${calculation.withdrawableTokens}`
        );
        finalApprovedTokens = calculation.withdrawableTokens;

        if (finalApprovedTokens <= 0) {
          return {
            success: false,
            error: 'No withdrawable tokens available',
          };
        }
      }

      // Calculate payout amount
      const payoutAmountPLN = finalApprovedTokens * PAYOUT_RATE_PLN;

      // Update withdrawal to APPROVED
      await withdrawalRef.update({
        approvedTokens: finalApprovedTokens,
        payoutAmount: payoutAmountPLN * withdrawal.fxRateToPayoutCurrency,
        status: 'APPROVED',
        updatedAt: admin.firestore.Timestamp.now(),
        adminNotes,
      });

      // Create audit log
      await createAuditLog(
        withdrawalId,
        withdrawal.userId,
        'APPROVED',
        context.auth.uid,
        'PENDING_REVIEW',
        'APPROVED',
        adminNotes || `Approved ${finalApprovedTokens} tokens`
      );

      // Burn tokens
      const burnResult = await burnTokensForWithdrawal(
        withdrawal.userId,
        finalApprovedTokens,
        withdrawalId
      );

      if (!burnResult.success) {
        // Rollback approval
        await withdrawalRef.update({
          status: 'PENDING_REVIEW',
          updatedAt: admin.firestore.Timestamp.now(),
        });

        return {
          success: false,
          error: `Failed to burn tokens: ${burnResult.error}`,
        };
      }

      // Update monthly stats
      await updateMonthlyStats(withdrawal.userId, finalApprovedTokens, payoutAmountPLN);

      // Update to PROCESSING
      await withdrawalRef.update({
        status: 'PROCESSING',
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Start payout
      try {
        const kycDoc = await db.collection('kycProfiles').doc(withdrawal.userId).get();
        if (kycDoc.exists) {
          const kycProfile = kycDoc.data()!;
          const payoutResult = await startPayout(
            withdrawal.userId,
            withdrawalId,
            withdrawal.payoutCurrency,
            withdrawal.payoutAmount,
            kycProfile.payoutMethod
          );

          if (payoutResult.success && payoutResult.providerPayoutId) {
            await withdrawalRef.update({
              providerPayoutId: payoutResult.providerPayoutId,
              provider: payoutResult.provider || withdrawal.provider,
              updatedAt: admin.firestore.Timestamp.now(),
            });
          }
        }
      } catch (error) {
        console.error('Error starting payout:', error);
        // Don't fail the approval, just log
      }

      // Create processing audit log
      await createAuditLog(
        withdrawalId,
        withdrawal.userId,
        'APPROVED',
        'SYSTEM',
        'APPROVED',
        'PROCESSING',
        'Tokens burned and payout initiated'
      );

      return {
        success: true,
        withdrawalId,
        approvedTokens: finalApprovedTokens,
      };
    } catch (error) {
      console.error('Error approving withdrawal:', error);
      return {
        success: false,
        error: 'Failed to approve withdrawal',
      };
    }
  }
);

/**
 * Reject a withdrawal request (ADMIN ONLY)
 */
export const withdrawals_admin_reject = functions.https.onCall(
  async (
    data: RejectWithdrawalRequest,
    context
  ): Promise<RejectWithdrawalResponse> => {
    try {
      // Check admin auth
      if (!context.auth) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const adminDoc = await db.collection('users').doc(context.auth.uid).get();
      if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
        return {
          success: false,
          error: 'Admin access required',
        };
      }

      const { withdrawalId, rejectionReason, adminNotes } = data;

      if (!rejectionReason) {
        return {
          success: false,
          error: 'Rejection reason required',
        };
      }

      // Get withdrawal request
      const withdrawalRef = db.collection('withdrawalRequests').doc(withdrawalId);
      const withdrawalDoc = await withdrawalRef.get();

      if (!withdrawalDoc.exists) {
        return {
          success: false,
          error: 'Withdrawal request not found',
        };
      }

      const withdrawal = withdrawalDoc.data() as WithdrawalRequest;

      // Check if editable
      if (!['PENDING_USER', 'PENDING_REVIEW'].includes(withdrawal.status)) {
        return {
          success: false,
          error: `Withdrawal is ${withdrawal.status}, cannot reject`,
        };
      }

      // Update to REJECTED
      await withdrawalRef.update({
        status: 'REJECTED',
        rejectionReason,
        adminNotes,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Create audit log
      await createAuditLog(
        withdrawalId,
        withdrawal.userId,
        'REJECTED',
        context.auth.uid,
        withdrawal.status,
        'REJECTED',
        rejectionReason
      );

      return {
        success: true,
        withdrawalId,
      };
    } catch (error) {
      console.error('Error rejecting withdrawal:', error);
      return {
        success: false,
        error: 'Failed to reject withdrawal',
      };
    }
  }
);

/**
 * List withdrawal requests for admin review
 */
export const withdrawals_admin_list = functions.https.onCall(
  async (
    data: AdminWithdrawalListRequest,
    context
  ): Promise<AdminWithdrawalListResponse> => {
    try {
      // Check admin auth
      if (!context.auth) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const adminDoc = await db.collection('users').doc(context.auth.uid).get();
      if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
        return {
          success: false,
          error: 'Admin access required',
        };
      }

      const { status, limit = 50, startAfter } = data;

      // Build query
      let query = db.collection('withdrawalRequests') as admin.firestore.Query;

      if (status) {
        query = query.where('status', '==', status);
      }

      query = query.orderBy('createdAt', 'desc').limit(limit + 1);

      if (startAfter) {
        const startDoc = await db.collection('withdrawalRequests').doc(startAfter).get();
        if (startDoc.exists) {
          query = query.startAfter(startDoc);
        }
      }

      const snapshot = await query.get();
      const withdrawals = await Promise.all(
        snapshot.docs.slice(0, limit).map(async (doc) => {
          const withdrawal = doc.data() as WithdrawalRequest;

          // Fetch user details
          const userDoc = await db.collection('users').doc(withdrawal.userId).get();
          const userData = userDoc.exists ? userDoc.data() : undefined;

          // Fetch KYC status
          const kycDoc = await db.collection('kycProfiles').doc(withdrawal.userId).get();
          const kycStatus = kycDoc.exists ? kycDoc.data()?.status : 'NOT_STARTED';

          // Fetch monthly stats
          const now = new Date();
          const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const stats = await getMonthlyStats(withdrawal.userId, month);

          return {
            ...withdrawal,
            userEmail: userData?.email,
            userDisplayName: userData?.displayName,
            kycStatus,
            monthlyStats: stats,
          };
        })
      );

      const hasMore = snapshot.docs.length > limit;

      return {
        success: true,
        withdrawals,
        hasMore,
      };
    } catch (error) {
      console.error('Error listing withdrawals:', error);
      return {
        success: false,
        error: 'Failed to fetch withdrawal list',
      };
    }
  }
);

/**
 * Mark withdrawal as paid (ADMIN or WEBHOOK)
 */
export const withdrawals_markAsPaid = functions.https.onCall(
  async (
    data: { withdrawalId: string; paidAt?: string },
    context
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // Check admin auth
      if (!context.auth) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const adminDoc = await db.collection('users').doc(context.auth.uid).get();
      if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
        return {
          success: false,
          error: 'Admin access required',
        };
      }

      const { withdrawalId, paidAt } = data;

      const withdrawalRef = db.collection('withdrawalRequests').doc(withdrawalId);
      const withdrawalDoc = await withdrawalRef.get();

      if (!withdrawalDoc.exists) {
        return {
          success: false,
          error: 'Withdrawal request not found',
        };
      }

      const withdrawal = withdrawalDoc.data() as WithdrawalRequest;

      if (withdrawal.status === 'PAID') {
        return {
          success: false,
          error: 'Withdrawal already marked as paid',
        };
      }

      // Update to PAID
      await withdrawalRef.update({
        status: 'PAID',
        paidAt: paidAt
          ? admin.firestore.Timestamp.fromDate(new Date(paidAt))
          : admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Create audit log
      await createAuditLog(
        withdrawalId,
        withdrawal.userId,
        'PAID',
        context.auth.uid,
        withdrawal.status,
        'PAID',
        'Withdrawal marked as paid'
      );

      return {
        success: true,
      };
    } catch (error) {
      console.error('Error marking withdrawal as paid:', error);
      return {
        success: false,
        error: 'Failed to mark withdrawal as paid',
      };
    }
  }
);

// Export for testing and use in other modules
export { burnTokensForWithdrawal, updateMonthlyStats };