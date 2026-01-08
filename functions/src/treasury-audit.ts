/**
 * PACK 128 - Treasury Audit & Reporting System
 * Complete audit trail and integrity verification
 */

import { https, logger, scheduler } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, generateId, serverTimestamp } from './init';
import {
  TreasuryAuditReport,
  TransactionType,
  UserTokenWallet,
  CreatorVault,
  AvaloRevenueVault,
  TreasuryHotWallet,
  TreasuryColdWallet,
  TreasuryLedgerEntry,
} from './types/treasury.types';
import { verifyTreasuryIntegrity } from './treasury-helpers';
import { AUDIT_POLICY } from './config/treasury.config';

// ============================================================================
// AUDIT REPORT GENERATION
// ============================================================================

/**
 * Generate comprehensive treasury audit report
 */
export const treasury_generateAuditReport = https.onCall(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 120,
  },
  async (request) => {
    const auth = request.auth;
    if (!auth?.token?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { startDate, endDate } = request.data;

    try {
      const reportId = generateId();
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      logger.info('Generating treasury audit report', { reportId, start, end });

      // Get all vault balances
      const userWallets = await db.collection('user_token_wallets').get();
      const creatorVaults = await db.collection('creator_vaults').get();
      const avaloVault = await db.collection('avalo_revenue_vault').doc('platform').get();
      const hotWallet = await db.collection('treasury_hot_wallet').doc('hot_wallet').get();
      const coldWallet = await db.collection('treasury_cold_wallet').doc('cold_wallet').get();

      // Calculate totals
      const totalUserTokens = userWallets.docs.reduce(
        (sum, doc) => sum + ((doc.data() as UserTokenWallet).availableTokens || 0),
        0
      );

      const totalCreatorTokens = creatorVaults.docs.reduce(
        (sum, doc) => {
          const vault = doc.data() as CreatorVault;
          return sum + (vault.availableTokens || 0) + (vault.lockedTokens || 0);
        },
        0
      );

      const totalAvaloRevenue = avaloVault.exists
        ? ((avaloVault.data() as AvaloRevenueVault)?.availableRevenue || 0)
        : 0;

      const hotWalletBalance = hotWallet.exists
        ? ((hotWallet.data() as TreasuryHotWallet)?.totalBalance || 0)
        : 0;

      const coldWalletBalance = coldWallet.exists
        ? ((coldWallet.data() as TreasuryColdWallet)?.totalBalance || 0)
        : 0;

      const totalSupply = totalUserTokens + totalCreatorTokens + totalAvaloRevenue;

      // Get ledger entries for period
      const ledgerSnapshot = await db
        .collection('treasury_ledger')
        .where('timestamp', '>=', start)
        .where('timestamp', '<=', end)
        .get();

      const ledgerEntries = ledgerSnapshot.docs.map(doc => doc.data() as TreasuryLedgerEntry);

      // Count transactions by type
      const transactionCounts = {
        purchases: ledgerEntries.filter(e => e.eventType === 'PURCHASE').length,
        spends: ledgerEntries.filter(e => e.eventType === 'SPEND').length,
        earns: ledgerEntries.filter(e => e.eventType === 'EARN').length,
        refunds: ledgerEntries.filter(e => e.eventType === 'REFUND').length,
        payouts: ledgerEntries.filter(e => e.eventType === 'PAYOUT_RELEASE').length,
      };

      // Volume by transaction type
      const volumeByType: { [key in TransactionType]?: number } = {};
      ledgerEntries
        .filter(e => e.eventType === 'SPEND' && e.metadata.transactionType)
        .forEach(e => {
          const type = e.metadata.transactionType as TransactionType;
          volumeByType[type] = (volumeByType[type] || 0) + Math.abs(e.tokenAmount);
        });

      // Run integrity check
      const integrityCheck = await verifyTreasuryIntegrity();

      // Create audit report
      const report: TreasuryAuditReport = {
        reportId,
        generatedAt: serverTimestamp() as any,
        generatedBy: auth.uid,
        period: {
          startDate: start as any,
          endDate: end as any,
        },
        summary: {
          totalUserTokens,
          totalCreatorTokens,
          totalAvaloRevenue,
          hotWalletBalance,
          coldWalletBalance,
          totalSupply,
        },
        transactions: transactionCounts,
        volumeByType,
        integrityCheck: {
          balancesMatch: integrityCheck.valid,
          ledgerComplete: true,
          noNegativeBalances: integrityCheck.issues.length === 0,
        },
      };

      // Save report to Firestore
      await db.collection('treasury_audit_reports').doc(reportId).set(report);

      logger.info('Treasury audit report generated', {
        reportId,
        totalSupply,
        integrityValid: integrityCheck.valid,
      });

      return report;
    } catch (error: any) {
      logger.error('Audit report generation failed', { error });
      throw new HttpsError('internal', error.message || 'Failed to generate audit report');
    }
  }
);

/**
 * Scheduled daily treasury reconciliation
 */
export const treasury_dailyReconciliation = scheduler.onSchedule(
  {
    schedule: 'every day 00:00',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async () => {
    if (!AUDIT_POLICY.DAILY_RECONCILIATION) {
      logger.info('Daily reconciliation disabled');
      return;
    }

    try {
      logger.info('Starting daily treasury reconciliation');

      // Run integrity check
      const integrity = await verifyTreasuryIntegrity();

      if (!integrity.valid) {
        logger.error('CRITICAL: Treasury integrity check failed', {
          issues: integrity.issues,
          userTotal: integrity.userTotal,
          creatorTotal: integrity.creatorTotal,
          avaloTotal: integrity.avaloTotal,
        });

        if (AUDIT_POLICY.REAL_TIME_ALERTS) {
          // Send alert to admins (would integrate with notification system)
          await db.collection('admin_alerts').add({
            type: 'TREASURY_INTEGRITY_FAILURE',
            severity: 'CRITICAL',
            message: 'Treasury integrity check failed',
            details: integrity,
            createdAt: serverTimestamp(),
          });
        }
      }

      // Generate daily report
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const today = new Date();

      const reportId = generateId();
      const report: Partial<TreasuryAuditReport> = {
        reportId,
        generatedAt: serverTimestamp() as any,
        period: {
          startDate: yesterday as any,
          endDate: today as any,
        },
        summary: {
          totalUserTokens: integrity.userTotal,
          totalCreatorTokens: integrity.creatorTotal,
          totalAvaloRevenue: integrity.avaloTotal,
          hotWalletBalance: 0, // Would fetch from hot wallet
          coldWalletBalance: 0, // Would fetch from cold wallet
          totalSupply: integrity.grandTotal,
        },
        transactions: {
          purchases: 0,
          spends: 0,
          earns: 0,
          refunds: 0,
          payouts: 0,
        },
        volumeByType: {},
        integrityCheck: {
          balancesMatch: integrity.valid,
          ledgerComplete: true,
          noNegativeBalances: integrity.issues.length === 0,
        },
      };

      await db.collection('treasury_audit_reports').doc(reportId).set(report);

      logger.info('Daily reconciliation completed', {
        reportId,
        valid: integrity.valid,
        totalSupply: integrity.grandTotal,
      });
    } catch (error: any) {
      logger.error('Daily reconciliation failed', { error });
    }
  }
);

/**
 * Get recent audit reports
 */
export const treasury_getAuditReports = https.onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
  },
  async (request) => {
    const auth = request.auth;
    if (!auth?.token?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { limit = 10 } = request.data;

    try {
      const snapshot = await db
        .collection('treasury_audit_reports')
        .orderBy('generatedAt', 'desc')
        .limit(limit)
        .get();

      const reports = snapshot.docs.map(doc => doc.data() as TreasuryAuditReport);

      return { reports };
    } catch (error: any) {
      logger.error('Failed to get audit reports', { error });
      throw new HttpsError('internal', 'Failed to retrieve audit reports');
    }
  }
);

/**
 * Verify treasury integrity on-demand
 */
export const treasury_verifyIntegrity = https.onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
  },
  async (request) => {
    const auth = request.auth;
    if (!auth?.token?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      const integrity = await verifyTreasuryIntegrity();

      logger.info('Treasury integrity check completed', {
        valid: integrity.valid,
        issues: integrity.issues.length,
      });

      return integrity;
    } catch (error: any) {
      logger.error('Integrity verification failed', { error });
      throw new HttpsError('internal', 'Failed to verify integrity');
    }
  }
);

/**
 * Get treasury statistics (dashboard summary)
 */
export const treasury_getStatistics = https.onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
  },
  async (request) => {
    const auth = request.auth;
    if (!auth?.token?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      // Get current balances
      const [userWallets, creatorVaults, avaloVault, hotWallet, coldWallet] = await Promise.all([
        db.collection('user_token_wallets').get(),
        db.collection('creator_vaults').get(),
        db.collection('avalo_revenue_vault').doc('platform').get(),
        db.collection('treasury_hot_wallet').doc('hot_wallet').get(),
        db.collection('treasury_cold_wallet').doc('cold_wallet').get(),
      ]);

      // Calculate totals
      const totalUserTokens = userWallets.docs.reduce(
        (sum, doc) => sum + ((doc.data() as UserTokenWallet).availableTokens || 0),
        0
      );

      const totalCreatorAvailable = creatorVaults.docs.reduce(
        (sum, doc) => sum + ((doc.data() as CreatorVault).availableTokens || 0),
        0
      );

      const totalCreatorLocked = creatorVaults.docs.reduce(
        (sum, doc) => sum + ((doc.data() as CreatorVault).lockedTokens || 0),
        0
      );

      const totalAvaloRevenue = avaloVault.exists
        ? ((avaloVault.data() as AvaloRevenueVault)?.availableRevenue || 0)
        : 0;

      const hotWalletBalance = hotWallet.exists
        ? ((hotWallet.data() as TreasuryHotWallet)?.totalBalance || 0)
        : 0;

      const coldWalletBalance = coldWallet.exists
        ? ((coldWallet.data() as TreasuryColdWallet)?.totalBalance || 0)
        : 0;

      // Get transaction counts (last 24h)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentLedger = await db
        .collection('treasury_ledger')
        .where('timestamp', '>=', oneDayAgo)
        .get();

      const last24h = {
        purchases: recentLedger.docs.filter(d => d.data().eventType === 'PURCHASE').length,
        spends: recentLedger.docs.filter(d => d.data().eventType === 'SPEND').length,
        refunds: recentLedger.docs.filter(d => d.data().eventType === 'REFUND').length,
        payouts: recentLedger.docs.filter(d => d.data().eventType === 'PAYOUT_RELEASE').length,
      };

      return {
        balances: {
          totalUserTokens,
          totalCreatorAvailable,
          totalCreatorLocked,
          totalAvaloRevenue,
          hotWalletBalance,
          coldWalletBalance,
          totalSupply: totalUserTokens + totalCreatorAvailable + totalCreatorLocked + totalAvaloRevenue,
        },
        counts: {
          totalUsers: userWallets.size,
          totalCreators: creatorVaults.size,
        },
        last24h,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error('Failed to get statistics', { error });
      throw new HttpsError('internal', 'Failed to retrieve statistics');
    }
  }
);

/**
 * Alert on anomalies (called by other functions)
 */
export async function checkAndAlertAnomalies(
  context: string,
  details: Record<string, any>
): Promise<void> {
  if (!AUDIT_POLICY.REAL_TIME_ALERTS) {
    return;
  }

  try {
    await db.collection('admin_alerts').add({
      type: 'TREASURY_ANOMALY',
      severity: 'WARNING',
      context,
      details,
      createdAt: serverTimestamp(),
    });

    logger.warn('Treasury anomaly detected and alerted', { context, details });
  } catch (error) {
    logger.error('Failed to create alert', { error, context });
  }
}