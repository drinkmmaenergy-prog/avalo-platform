/**
 * PACK 148 - API Endpoints
 * Callable functions for ledger access and management
 */

import * as functions from 'firebase-functions';
import {
  recordLedgerTransaction,
  updateLedgerOnEscrowRelease,
  updateLedgerOnDispute,
  getLedgerTransaction,
  getUserLedgerTransactions,
  validateLedgerEscrowStatus,
  getLedgerStats,
} from './pack148-ledger-engine';
import {
  verifyTransactionBlockchain,
  verifyBlockchainHash,
  getBlockchainProof,
  batchVerifyTransactions,
  getVerificationStats,
} from './pack148-blockchain-verification';
import {
  createExportRequest,
  getExportStatus,
  downloadExport,
  getUserExports,
} from './pack148-export-engine';
import {
  RecordLedgerTransactionRequest,
  ValidateLedgerEscrowRequest,
  ExportLedgerHistoryRequest,
  DownloadLedgerReportRequest,
  VerifyBlockchainHashRequest,
  GetLedgerOverviewRequest,
  LedgerError,
  ExportError,
  isValidProductType,
  isValidExportFormat,
  isValidExportType,
} from './pack148-types';

/**
 * Record a transaction to the ledger
 * Called by payment systems after transaction completion
 */
export const recordLedgerTransactionEndpoint = functions.https.onCall(
  async (data: RecordLedgerTransactionRequest, context) => {
    try {
      // Validate authentication
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      // Validate inputs
      if (!data.transactionId || !data.senderId || !data.receiverId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
      }

      if (!isValidProductType(data.productType)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid product type');
      }

      // Record transaction
      const result = await recordLedgerTransaction(data);

      return {
        success: true,
        ledgerId: result.ledgerId,
        blockchainHash: result.blockchainHash,
        message: 'Transaction recorded successfully',
      };
    } catch (error) {
      console.error('Error recording ledger transaction:', error);
      
      if (error instanceof LedgerError) {
        throw new functions.https.HttpsError('internal', error.message);
      }
      
      throw new functions.https.HttpsError('internal', 'Failed to record transaction');
    }
  }
);

/**
 * Validate ledger entry against escrow status
 */
export const validateLedgerEscrowStatusEndpoint = functions.https.onCall(
  async (data: ValidateLedgerEscrowRequest, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const result = await validateLedgerEscrowStatus(
        data.escrowId,
        data.expectedStatus
      );

      return {
        success: true,
        isValid: result.isValid,
        ledgerEntry: result.ledgerEntry,
        message: result.isValid ? 'Escrow status validated' : 'Escrow status mismatch',
      };
    } catch (error) {
      console.error('Error validating escrow status:', error);
      throw new functions.https.HttpsError('internal', 'Failed to validate escrow status');
    }
  }
);

/**
 * Get user's ledger overview
 */
export const getLedgerOverviewEndpoint = functions.https.onCall(
  async (data: GetLedgerOverviewRequest, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;

      // Get stats
      const stats = await getLedgerStats(userId);

      // Get recent transactions
      const recentTransactions = await getUserLedgerTransactions(userId, {
        limit: 10,
        startAfter: data.dateRange?.startDate,
      });

      // Calculate payout summary
      const userTransactions = await getUserLedgerTransactions(userId, {
        limit: 1000,
      });
      
      let totalEarned = 0;
      let platformFees = 0;
      let totalPaidOut = 0;
      let pendingPayout = 0;
      
      // Simple calculation (can be optimized)
      for (const tx of userTransactions) {
        if (tx.status === 'completed' && tx.payoutEligible) {
          totalPaidOut += tx.creatorShare;
        } else if (tx.status === 'pending' || tx.status === 'escrowed') {
          pendingPayout += tx.creatorShare;
        }
        totalEarned += tx.creatorShare;
        platformFees += tx.platformShare;
      }

      return {
        success: true,
        stats: {
          userId,
          role: 'both',
          asCreator: {
            totalEarned: stats.totalReceived,
            totalTransactions: stats.transactionCount,
            averageTransaction: stats.transactionCount > 0 ? stats.totalReceived / stats.transactionCount : 0,
            topProductType: 'chat',
            verificationRate: (stats.verifiedCount / stats.transactionCount) * 100,
          },
          asUser: {
            totalSpent: stats.totalSent,
            totalTransactions: stats.transactionCount,
            averageTransaction: stats.transactionCount > 0 ? stats.totalSent / stats.transactionCount : 0,
            topProductType: 'chat',
            refundRate: 0,
          },
          allVerified: stats.verifiedCount === stats.transactionCount,
          canExport: true,
          lastUpdated: new Date(),
        },
        recentTransactions: recentTransactions.map(tx => ({
          id: tx.id,
          transactionId: tx.transactionId,
          productType: tx.productType,
          tokenAmount: tx.tokenAmount,
          status: tx.status,
          timestamp: tx.timestamp.toDate(),
          blockchainHash: tx.blockchainHash,
          verified: tx.blockchainVerified,
        })),
        payoutSummary: {
          userId,
          period: 'monthly',
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate: new Date(),
          totalEarned,
          platformFees,
          totalPaidOut,
          pendingPayout,
          inEscrow: 0,
          refunded: 0,
          totalTransactions: userTransactions.length,
          completedTransactions: userTransactions.filter(tx => tx.status === 'completed').length,
          disputedTransactions: userTransactions.filter(tx => tx.status === 'disputed').length,
          allTransactionsVerified: stats.verifiedCount === stats.transactionCount,
          verificationRate: (stats.verifiedCount / stats.transactionCount) * 100,
          generatedAt: new Date(),
          earningsByType: {},
          blockchainHashes: [],
        },
      };
    } catch (error) {
      console.error('Error getting ledger overview:', error);
      throw new functions.https.HttpsError('internal', 'Failed to get ledger overview');
    }
  }
);

/**
 * Get user's transaction history
 */
export const getTransactionHistoryEndpoint = functions.https.onCall(
  async (data: { limit?: number; productTypes?: string[] }, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const transactions = await getUserLedgerTransactions(userId, {
        limit: data.limit || 50,
        productTypes: data.productTypes as any,
      });

      return {
        success: true,
        transactions: transactions.map(tx => ({
          id: tx.id,
          transactionId: tx.transactionId,
          productType: tx.productType,
          tokenAmount: tx.tokenAmount,
          usdEquivalent: tx.usdEquivalent,
          status: tx.status,
          timestamp: tx.timestamp.toDate(),
          blockchainHash: tx.blockchainHash,
          verified: tx.blockchainVerified,
          platformShare: tx.platformShare,
          creatorShare: tx.creatorShare,
        })),
        count: transactions.length,
      };
    } catch (error) {
      console.error('Error getting transaction history:', error);
      throw new functions.https.HttpsError('internal', 'Failed to get transaction history');
    }
  }
);

/**
 * Verify blockchain hash for transaction
 */
export const verifyBlockchainHashEndpoint = functions.https.onCall(
  async (data: VerifyBlockchainHashRequest, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const verification = await verifyBlockchainHash(
        data.transactionId,
        data.blockchainHash
      );

      return {
        success: true,
        isValid: verification.isValid,
        verificationDetails: {
          ...verification,
          verifiedAt: verification.verifiedAt.toDate(),
        },
        message: verification.isValid 
          ? 'Blockchain hash verified'
          : 'Hash verification failed',
      };
    } catch (error) {
      console.error('Error verifying blockchain hash:', error);
      throw new functions.https.HttpsError('internal', 'Failed to verify hash');
    }
  }
);

/**
 * Get blockchain proof for transaction
 */
export const getBlockchainProofEndpoint = functions.https.onCall(
  async (data: { transactionId: string }, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const proof = await getBlockchainProof(data.transactionId);

      return {
        success: true,
        proof: {
          ...proof,
          blockchainTimestamp: proof.blockchainTimestamp.toISOString(),
        },
      };
    } catch (error) {
      console.error('Error getting blockchain proof:', error);
      throw new functions.https.HttpsError('internal', 'Failed to get blockchain proof');
    }
  }
);

/**
 * Request export of ledger data
 */
export const exportLedgerHistoryEndpoint = functions.https.onCall(
  async (data: ExportLedgerHistoryRequest, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      // Validate inputs
      if (!isValidExportType(data.exportType)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid export type');
      }

      if (!isValidExportFormat(data.format)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid export format');
      }

      const userId = context.auth.uid;

      const exportId = await createExportRequest(
        userId,
        data.exportType,
        data.format,
        data.dateRange,
        data.filters
      );

      return {
        success: true,
        exportId,
        estimatedTime: 60,
        message: 'Export request created. Processing...',
      };
    } catch (error) {
      console.error('Error creating export:', error);
      
      if (error instanceof ExportError) {
        throw new functions.https.HttpsError('internal', error.message);
      }
      
      throw new functions.https.HttpsError('internal', 'Failed to create export');
    }
  }
);

/**
 * Get export status
 */
export const getExportStatusEndpoint = functions.https.onCall(
  async (data: { exportId: string }, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const exportRecord = await getExportStatus(data.exportId);

      // Verify user owns this export
      if (exportRecord.userId !== context.auth.uid) {
        throw new functions.https.HttpsError('permission-denied', 'Access denied');
      }

      return {
        success: true,
        export: {
          id: exportRecord.id,
          exportType: exportRecord.exportType,
          format: exportRecord.format,
          status: exportRecord.status,
          recordCount: exportRecord.recordCount,
          createdAt: exportRecord.createdAt.toDate(),
          completedAt: exportRecord.completedAt?.toDate(),
          errorMessage: exportRecord.errorMessage,
        },
      };
    } catch (error) {
      console.error('Error getting export status:', error);
      throw new functions.https.HttpsError('internal', 'Failed to get export status');
    }
  }
);

/**
 * Download export file
 */
export const downloadLedgerReportEndpoint = functions.https.onCall(
  async (data: DownloadLedgerReportRequest, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const download = await downloadExport(data.exportId, data.downloadToken);

      return {
        success: true,
        downloadUrl: download.url,
        expiresAt: download.expiresAt.toISOString(),
        fileSize: 0,
        format: 'json',
      };
    } catch (error) {
      console.error('Error downloading export:', error);
      
      if (error instanceof ExportError) {
        throw new functions.https.HttpsError('internal', error.message);
      }
      
      throw new functions.https.HttpsError('internal', 'Failed to download export');
    }
  }
);

/**
 * Get user's export history
 */
export const getMyExportsEndpoint = functions.https.onCall(
  async (data: {}, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const exports = await getUserExports(userId);

      return {
        success: true,
        exports: exports.map(exp => ({
          id: exp.id,
          exportType: exp.exportType,
          format: exp.format,
          status: exp.status,
          recordCount: exp.recordCount,
          createdAt: exp.createdAt.toDate(),
          completedAt: exp.completedAt?.toDate(),
          expiresAt: exp.expiresAt.toDate(),
          downloadCount: exp.downloadCount,
          maxDownloads: exp.maxDownloads,
        })),
        count: exports.length,
      };
    } catch (error) {
      console.error('Error getting user exports:', error);
      throw new functions.https.HttpsError('internal', 'Failed to get exports');
    }
  }
);

/**
 * Get verification statistics (system-wide)
 */
export const getVerificationStatsEndpoint = functions.https.onCall(
  async (data: {}, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const stats = await getVerificationStats();

      return {
        success: true,
        stats: {
          ...stats,
          lastIntegrityCheck: stats.lastIntegrityCheck?.toISOString(),
        },
      };
    } catch (error) {
      console.error('Error getting verification stats:', error);
      throw new functions.https.HttpsError('internal', 'Failed to get verification stats');
    }
  }
);

/**
 * Internal: Update ledger on escrow release (called by payment system)
 */
export const updateLedgerOnEscrowReleaseEndpoint = functions.https.onCall(
  async (data: { transactionId: string; escrowOutcome: 'released' | 'refunded' }, context) => {
    try {
      // This should be called by system only
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'System authentication required');
      }

      await updateLedgerOnEscrowRelease(data.transactionId, data.escrowOutcome);

      return {
        success: true,
        message: 'Ledger updated successfully',
      };
    } catch (error) {
      console.error('Error updating ledger on escrow release:', error);
      throw new functions.https.HttpsError('internal', 'Failed to update ledger');
    }
  }
);

/**
 * Internal: Update ledger on dispute (called by dispute system)
 */
export const updateLedgerOnDisputeEndpoint = functions.https.onCall(
  async (data: { transactionId: string; disputeId: string }, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'System authentication required');
      }

      await updateLedgerOnDispute(data.transactionId, data.disputeId);

      return {
        success: true,
        message: 'Ledger updated with dispute status',
      };
    } catch (error) {
      console.error('Error updating ledger on dispute:', error);
      throw new functions.https.HttpsError('internal', 'Failed to update ledger');
    }
  }
);