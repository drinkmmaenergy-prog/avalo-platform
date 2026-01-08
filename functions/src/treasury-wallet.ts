/**
 * PACK 128 - Hot/Cold Wallet Management
 * Automatic rebalancing and secure storage
 * 
 * Security architecture:
 * - Hot wallet: Daily payout operations
 * - Cold wallet: Long-term secure storage
 * - Automatic rebalancing based on thresholds
 */

import { https, logger, scheduler } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, generateId, serverTimestamp } from './init';
import {
  TreasuryHotWallet,
  TreasuryColdWallet,
  RebalanceWalletResponse,
} from './types/treasury.types';
import { WALLET_POLICY } from './config/treasury.config';
import { createLedgerEntry } from './treasury-helpers';

// ============================================================================
// WALLET INITIALIZATION
// ============================================================================

/**
 * Initialize hot wallet (singleton)
 */
async function ensureHotWallet(): Promise<void> {
  const walletRef = db.collection('treasury_hot_wallet').doc('hot_wallet');
  const wallet = await walletRef.get();

  if (!wallet.exists) {
    const newWallet: TreasuryHotWallet = {
      id: 'hot_wallet',
      totalBalance: WALLET_POLICY.HOT_WALLET_TARGET_BALANCE,
      dailyPayoutLimit: WALLET_POLICY.HOT_WALLET_MAX_BALANCE,
      rebalanceThreshold: WALLET_POLICY.HOT_WALLET_MAX_BALANCE,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };
    await walletRef.set(newWallet);
    logger.info('Hot wallet initialized', { balance: newWallet.totalBalance });
  }
}

/**
 * Initialize cold wallet (singleton)
 */
async function ensureColdWallet(): Promise<void> {
  const walletRef = db.collection('treasury_cold_wallet').doc('cold_wallet');
  const wallet = await walletRef.get();

  if (!wallet.exists) {
    const newWallet: TreasuryColdWallet = {
      id: 'cold_wallet',
      totalBalance: 0,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };
    await walletRef.set(newWallet);
    logger.info('Cold wallet initialized');
  }
}

// ============================================================================
// REBALANCING LOGIC
// ============================================================================

/**
 * Check if hot wallet needs rebalancing
 */
async function checkRebalanceNeeded(): Promise<{
  needed: boolean;
  direction?: 'HOT_TO_COLD' | 'COLD_TO_HOT';
  amount?: number;
}> {
  await ensureHotWallet();
  await ensureColdWallet();

  const hotWalletSnap = await db.collection('treasury_hot_wallet').doc('hot_wallet').get();
  const hotWallet = hotWalletSnap.data() as TreasuryHotWallet;

  // Hot wallet overflow → move to cold
  if (hotWallet.totalBalance > WALLET_POLICY.HOT_WALLET_MAX_BALANCE) {
    const excessAmount = hotWallet.totalBalance - WALLET_POLICY.HOT_WALLET_TARGET_BALANCE;
    return {
      needed: true,
      direction: 'HOT_TO_COLD',
      amount: excessAmount,
    };
  }

  // Hot wallet too low → refill from cold
  if (hotWallet.totalBalance < WALLET_POLICY.HOT_WALLET_MIN_BALANCE) {
    const coldWalletSnap = await db.collection('treasury_cold_wallet').doc('cold_wallet').get();
    const coldWallet = coldWalletSnap.data() as TreasuryColdWallet;

    if (coldWallet.totalBalance > 0) {
      const refillAmount = Math.min(
        WALLET_POLICY.HOT_WALLET_TARGET_BALANCE - hotWallet.totalBalance,
        coldWallet.totalBalance
      );
      return {
        needed: true,
        direction: 'COLD_TO_HOT',
        amount: refillAmount,
      };
    }
  }

  return { needed: false };
}

/**
 * Execute wallet rebalancing
 */
export const treasury_rebalanceWallet = https.onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (request) => {
    const auth = request.auth;
    
    // Only admins can manually trigger rebalancing
    if (!auth?.token?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    if (!WALLET_POLICY.AUTO_REBALANCE_ENABLED) {
      throw new HttpsError('failed-precondition', 'Auto-rebalancing is disabled');
    }

    try {
      // Check if rebalancing needed
      const check = await checkRebalanceNeeded();

      if (!check.needed) {
        return {
          success: true,
          movedAmount: 0,
          direction: null,
          hotBalance: (await db.collection('treasury_hot_wallet').doc('hot_wallet').get()).data()?.totalBalance || 0,
          coldBalance: (await db.collection('treasury_cold_wallet').doc('cold_wallet').get()).data()?.totalBalance || 0,
          timestamp: serverTimestamp() as any,
          message: 'No rebalancing needed',
        };
      }

      // Execute rebalance in transaction
      await db.runTransaction(async (transaction) => {
        const hotRef = db.collection('treasury_hot_wallet').doc('hot_wallet');
        const coldRef = db.collection('treasury_cold_wallet').doc('cold_wallet');

        const hotSnap = await transaction.get(hotRef);
        const coldSnap = await transaction.get(coldRef);

        const hotWallet = hotSnap.data() as TreasuryHotWallet;
        const coldWallet = coldSnap.data() as TreasuryColdWallet;

        if (check.direction === 'HOT_TO_COLD') {
          // Move excess to cold storage
          transaction.update(hotRef, {
            totalBalance: hotWallet.totalBalance - check.amount!,
            lastRebalanceAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          transaction.update(coldRef, {
            totalBalance: coldWallet.totalBalance + check.amount!,
            lastDepositAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else if (check.direction === 'COLD_TO_HOT') {
          // Refill hot wallet from cold storage
          transaction.update(hotRef, {
            totalBalance: hotWallet.totalBalance + check.amount!,
            lastRebalanceAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          transaction.update(coldRef, {
            totalBalance: coldWallet.totalBalance - check.amount!,
            lastWithdrawalAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      });

      // Create ledger entry
      await createLedgerEntry(
        check.direction === 'HOT_TO_COLD' ? 'HOT_TO_COLD' : 'COLD_TO_HOT',
        'system',
        check.amount!,
        'AVALO_REVENUE',
        {
          reason: 'Automatic rebalancing',
          direction: check.direction,
          triggeredBy: auth.uid,
        }
      );

      // Get updated balances
      const hotWalletSnap = await db.collection('treasury_hot_wallet').doc('hot_wallet').get();
      const coldWalletSnap = await db.collection('treasury_cold_wallet').doc('cold_wallet').get();

      const response: RebalanceWalletResponse = {
        success: true,
        movedAmount: check.amount!,
        direction: check.direction!,
        hotBalance: hotWalletSnap.data()?.totalBalance || 0,
        coldBalance: coldWalletSnap.data()?.totalBalance || 0,
        timestamp: serverTimestamp() as any,
      };

      logger.info('Wallet rebalanced', {
        direction: check.direction,
        amount: check.amount,
      });

      return response;
    } catch (error: any) {
      logger.error('Rebalancing failed', { error });
      throw new HttpsError('internal', error.message || 'Failed to rebalance wallets');
    }
  }
);

/**
 * Scheduled automatic rebalancing (runs every 6 hours)
 */
export const treasury_autoRebalance = scheduler.onSchedule(
  {
    schedule: `every ${WALLET_POLICY.REBALANCE_CHECK_INTERVAL_HOURS} hours`,
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async () => {
    if (!WALLET_POLICY.AUTO_REBALANCE_ENABLED) {
      logger.info('Auto-rebalancing disabled, skipping');
      return;
    }

    try {
      logger.info('Starting automatic wallet rebalancing check');

      const check = await checkRebalanceNeeded();

      if (!check.needed) {
        logger.info('No rebalancing needed');
        return;
      }

      // Execute rebalance
      await db.runTransaction(async (transaction) => {
        const hotRef = db.collection('treasury_hot_wallet').doc('hot_wallet');
        const coldRef = db.collection('treasury_cold_wallet').doc('cold_wallet');

        const hotSnap = await transaction.get(hotRef);
        const coldSnap = await transaction.get(coldRef);

        const hotWallet = hotSnap.data() as TreasuryHotWallet;
        const coldWallet = coldSnap.data() as TreasuryColdWallet;

        if (check.direction === 'HOT_TO_COLD') {
          transaction.update(hotRef, {
            totalBalance: hotWallet.totalBalance - check.amount!,
            lastRebalanceAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          transaction.update(coldRef, {
            totalBalance: coldWallet.totalBalance + check.amount!,
            lastDepositAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else if (check.direction === 'COLD_TO_HOT') {
          transaction.update(hotRef, {
            totalBalance: hotWallet.totalBalance + check.amount!,
            lastRebalanceAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          transaction.update(coldRef, {
            totalBalance: coldWallet.totalBalance - check.amount!,
            lastWithdrawalAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      });

      // Create ledger entry
      await createLedgerEntry(
        check.direction === 'HOT_TO_COLD' ? 'HOT_TO_COLD' : 'COLD_TO_HOT',
        'system',
        check.amount!,
        'AVALO_REVENUE',
        {
          reason: 'Automatic scheduled rebalancing',
          direction: check.direction,
        }
      );

      logger.info('Automatic rebalancing completed', {
        direction: check.direction,
        amount: check.amount,
      });
    } catch (error: any) {
      logger.error('Automatic rebalancing failed', { error });
    }
  }
);

/**
 * Get wallet status (admin only)
 */
export const treasury_getWalletStatus = https.onCall(
  {
    region: 'us-central1',
    memory: '128MiB',
  },
  async (request) => {
    const auth = request.auth;
    
    if (!auth?.token?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      await ensureHotWallet();
      await ensureColdWallet();

      const hotWalletSnap = await db.collection('treasury_hot_wallet').doc('hot_wallet').get();
      const coldWalletSnap = await db.collection('treasury_cold_wallet').doc('cold_wallet').get();

      const hotWallet = hotWalletSnap.data() as TreasuryHotWallet;
      const coldWallet = coldWalletSnap.data() as TreasuryColdWallet;

      const check = await checkRebalanceNeeded();

      return {
        hotWallet: {
          balance: hotWallet.totalBalance,
          dailyLimit: hotWallet.dailyPayoutLimit,
          threshold: hotWallet.rebalanceThreshold,
          lastRebalance: hotWallet.lastRebalanceAt,
        },
        coldWallet: {
          balance: coldWallet.totalBalance,
          lastDeposit: coldWallet.lastDepositAt,
          lastWithdrawal: coldWallet.lastWithdrawalAt,
        },
        totalBalance: hotWallet.totalBalance + coldWallet.totalBalance,
        rebalanceNeeded: check.needed,
        rebalanceDirection: check.direction,
        rebalanceAmount: check.amount,
        config: {
          maxBalance: WALLET_POLICY.HOT_WALLET_MAX_BALANCE,
          targetBalance: WALLET_POLICY.HOT_WALLET_TARGET_BALANCE,
          minBalance: WALLET_POLICY.HOT_WALLET_MIN_BALANCE,
          autoRebalanceEnabled: WALLET_POLICY.AUTO_REBALANCE_ENABLED,
        },
      };
    } catch (error: any) {
      logger.error('Failed to get wallet status', { error });
      throw new HttpsError('internal', 'Failed to retrieve wallet status');
    }
  }
);

/**
 * Emergency wallet transfer (admin only, for critical situations)
 */
export const treasury_emergencyTransfer = https.onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (request) => {
    const auth = request.auth;
    
    if (!auth?.token?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { amount, direction, reason } = request.data;

    if (!amount || !direction || !reason) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    if (amount <= 0) {
      throw new HttpsError('invalid-argument', 'Amount must be positive');
    }

    if (!['HOT_TO_COLD', 'COLD_TO_HOT'].includes(direction)) {
      throw new HttpsError('invalid-argument', 'Invalid direction');
    }

    try {
      await db.runTransaction(async (transaction) => {
        const hotRef = db.collection('treasury_hot_wallet').doc('hot_wallet');
        const coldRef = db.collection('treasury_cold_wallet').doc('cold_wallet');

        const hotSnap = await transaction.get(hotRef);
        const coldSnap = await transaction.get(coldRef);

        const hotWallet = hotSnap.data() as TreasuryHotWallet;
        const coldWallet = coldSnap.data() as TreasuryColdWallet;

        if (direction === 'HOT_TO_COLD') {
          if (hotWallet.totalBalance < amount) {
            throw new HttpsError('failed-precondition', 'Insufficient hot wallet balance');
          }

          transaction.update(hotRef, {
            totalBalance: hotWallet.totalBalance - amount,
            updatedAt: serverTimestamp(),
          });

          transaction.update(coldRef, {
            totalBalance: coldWallet.totalBalance + amount,
            lastDepositAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          if (coldWallet.totalBalance < amount) {
            throw new HttpsError('failed-precondition', 'Insufficient cold wallet balance');
          }

          transaction.update(hotRef, {
            totalBalance: hotWallet.totalBalance + amount,
            updatedAt: serverTimestamp(),
          });

          transaction.update(coldRef, {
            totalBalance: coldWallet.totalBalance - amount,
            lastWithdrawalAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      });

      // Create ledger entry
      await createLedgerEntry(
        direction === 'HOT_TO_COLD' ? 'HOT_TO_COLD' : 'COLD_TO_HOT',
        'system',
        amount,
        'AVALO_REVENUE',
        {
          reason: `Emergency transfer: ${reason}`,
          direction,
          adminId: auth.uid,
          isEmergency: true,
        }
      );

      logger.warn('Emergency wallet transfer executed', {
        amount,
        direction,
        reason,
        adminId: auth.uid,
      });

      return {
        success: true,
        message: 'Emergency transfer completed',
        amount,
        direction,
      };
    } catch (error: any) {
      logger.error('Emergency transfer failed', { error });
      throw new HttpsError('internal', error.message || 'Failed to execute emergency transfer');
    }
  }
);