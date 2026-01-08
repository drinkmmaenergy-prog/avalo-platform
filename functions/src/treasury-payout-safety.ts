/**
 * PACK 128 - Payout Safety Layer
 * Multi-check validation before payout release
 * 
 * Integration points:
 * - PACK 84: KYC verification
 * - PACK 83: Payout methods
 * - PACK 126: Anti-fraud engine
 * - PACK 91: Regional compliance
 */

import { https, logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp } from './init';
import {
  RequestPayoutRequest,
  RequestPayoutResponse,
  ProcessPayoutRequest,
  ProcessPayoutResponse,
  PayoutSafetyCheckResult,
  CreatorVault,
} from './types/treasury.types';
import { PAYOUT_POLICY } from './config/treasury.config';
import { createLedgerEntry } from './treasury-helpers';

// ============================================================================
// PAYOUT SAFETY CHECKS
// ============================================================================

/**
 * Check if user has KYC verification (PACK 84 integration)
 */
async function checkKYCVerification(userId: string): Promise<boolean> {
  try {
    const kycDoc = await db.collection('user_kyc_status').doc(userId).get();
    
    if (!kycDoc.exists) {
      return false;
    }

    const kycData = kycDoc.data();
    return kycData?.status === 'VERIFIED' && kycData?.level === 'BASIC';
  } catch (error) {
    logger.error('KYC check failed', { error, userId });
    return false;
  }
}

/**
 * Check if user has valid payout method (PACK 83 integration)
 */
async function checkPayoutMethod(methodId: string, userId: string): Promise<boolean> {
  try {
    const methodDoc = await db.collection('payout_methods').doc(methodId).get();
    
    if (!methodDoc.exists) {
      return false;
    }

    const methodData = methodDoc.data();
    return methodData?.userId === userId;
  } catch (error) {
    logger.error('Payout method check failed', { error, methodId });
    return false;
  }
}

/**
 * Check regional legality (PACK 91 integration)
 */
async function checkRegionalCompliance(userId: string): Promise<boolean> {
  try {
    // Get user's country/region
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return false;
    }

    const userData = userDoc.data();
    const userCountry = userData?.country;

    // Check if payouts are allowed in this region
    // NOTE: This is a simplified check - real implementation would check against
    // a comprehensive list of sanctioned/restricted countries
    const restrictedCountries = ['KP', 'IR', 'CU', 'SY']; // Example: North Korea, Iran, Cuba, Syria
    
    if (userCountry && restrictedCountries.includes(userCountry)) {
      logger.warn('Payout blocked - restricted country', { userId, country: userCountry });
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Regional compliance check failed', { error, userId });
    return false;
  }
}

/**
 * Check treasury risk score
 */
async function checkTreasuryRisk(userId: string): Promise<boolean> {
  try {
    // Check for suspicious patterns in ledger
    const recentLedger = await db
      .collection('treasury_ledger')
      .where('userId', '==', userId)
      .where('timestamp', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // Last 7 days
      .get();

    // Check for excessive refunds
    const refunds = recentLedger.docs.filter(doc => 
      doc.data().eventType === 'REFUND'
    );

    if (refunds.length > 10) {
      logger.warn('Treasury risk - excessive refunds', { userId, refundCount: refunds.length });
      return false;
    }

    // Check for rapid payout requests
    const payoutRequests = await db
      .collection('payout_requests')
      .where('userId', '==', userId)
      .where('status', '==', 'PENDING')
      .get();

    if (payoutRequests.size >= PAYOUT_POLICY.MAX_PENDING_PAYOUTS_PER_USER) {
      logger.warn('Treasury risk - too many pending payouts', { 
        userId, 
        pendingCount: payoutRequests.size 
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Treasury risk check failed', { error, userId });
    return false;
  }
}

/**
 * Check anti-fraud score (PACK 126 integration)
 */
async function checkFraudScore(userId: string): Promise<{ passed: boolean; score?: number }> {
  try {
    // Integration with PACK 126 fraud detection
    // This would call the fraud risk engine
    const userRiskDoc = await db.collection('user_risk_scores').doc(userId).get();
    
    if (!userRiskDoc.exists) {
      // No risk score = assume safe
      return { passed: true, score: 0 };
    }

    const riskData = userRiskDoc.data();
    const riskScore = riskData?.overallScore || 0;

    // Block if high risk (score > 70)
    if (riskScore > 70) {
      logger.warn('Fraud check failed - high risk score', { userId, riskScore });
      return { passed: false, score: riskScore };
    }

    return { passed: true, score: riskScore };
  } catch (error) {
    logger.error('Fraud check failed', { error, userId });
    return { passed: false };
  }
}

/**
 * Check sufficient balance
 */
async function checkBalance(userId: string, requestedAmount: number): Promise<boolean> {
  try {
    const vaultDoc = await db.collection('creator_vaults').doc(userId).get();
    
    if (!vaultDoc.exists) {
      return false;
    }

    const vault = vaultDoc.data() as CreatorVault;
    return vault.availableTokens >= requestedAmount;
  } catch (error) {
    logger.error('Balance check failed', { error, userId });
    return false;
  }
}

/**
 * Execute comprehensive payout safety check
 */
async function executeSafetyCheck(
  userId: string,
  methodId: string,
  tokenAmount: number
): Promise<PayoutSafetyCheckResult> {
  const checks = {
    kycVerified: false,
    payoutMethodValid: false,
    regionLegal: false,
    treasuryRiskClear: false,
    fraudCheckPassed: false,
    balanceSufficient: false,
  };

  const blockedReasons: string[] = [];

  // Execute all checks in parallel
  const [kycCheck, methodCheck, regionCheck, riskCheck, fraudCheck, balanceCheck] = await Promise.all([
    checkKYCVerification(userId),
    checkPayoutMethod(methodId, userId),
    checkRegionalCompliance(userId),
    checkTreasuryRisk(userId),
    checkFraudScore(userId),
    checkBalance(userId, tokenAmount),
  ]);

  checks.kycVerified = kycCheck;
  checks.payoutMethodValid = methodCheck;
  checks.regionLegal = regionCheck;
  checks.treasuryRiskClear = riskCheck;
  checks.fraudCheckPassed = fraudCheck.passed;
  checks.balanceSufficient = balanceCheck;

  // Collect blocked reasons
  if (!kycCheck) blockedReasons.push('KYC verification required');
  if (!methodCheck) blockedReasons.push('Invalid payout method');
  if (!regionCheck) blockedReasons.push('Region not supported for payouts');
  if (!riskCheck) blockedReasons.push('Treasury risk assessment failed');
  if (!fraudCheck.passed) blockedReasons.push('Fraud check failed');
  if (!balanceCheck) blockedReasons.push('Insufficient balance');

  const result: PayoutSafetyCheckResult = {
    passed: blockedReasons.length === 0,
    blockedReasons,
    checks,
    riskScore: fraudCheck.score,
    timestamp: serverTimestamp() as any,
  };

  return result;
}

// ============================================================================
// PAYOUT REQUEST FUNCTIONS
// ============================================================================

/**
 * Request payout with safety checks
 */
export const treasury_requestPayout = https.onCall<RequestPayoutRequest>(
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

    const { userId, methodId, tokenAmount } = request.data;

    // Validate input
    if (!userId || !methodId || !tokenAmount) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    if (userId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot request payout for another user');
    }

    if (tokenAmount < PAYOUT_POLICY.MINIMUM_PAYOUT_TOKENS) {
      throw new HttpsError(
        'invalid-argument',
        `Minimum payout is ${PAYOUT_POLICY.MINIMUM_PAYOUT_TOKENS} tokens`
      );
    }

    try {
      // Execute safety check
      const safetyCheck = await executeSafetyCheck(userId, methodId, tokenAmount);

      if (!safetyCheck.passed) {
        const response: RequestPayoutResponse = {
          success: false,
          safetyCheck,
          message: `Payout blocked: ${safetyCheck.blockedReasons.join(', ')}`,
        };
        
        logger.warn('Payout request blocked', {
          userId,
          tokenAmount,
          reasons: safetyCheck.blockedReasons,
        });

        return response;
      }

      // Lock tokens and create payout request (atomic transaction)
      const payoutRequestId = await db.runTransaction(async (transaction) => {
        const vaultRef = db.collection('creator_vaults').doc(userId);
        const vaultSnap = await transaction.get(vaultRef);
        const vault = vaultSnap.data() as CreatorVault;

        // Double-check balance
        if (vault.availableTokens < tokenAmount) {
          throw new HttpsError('failed-precondition', 'Insufficient balance');
        }

        // Lock tokens
        transaction.update(vaultRef, {
          availableTokens: vault.availableTokens - tokenAmount,
          lockedTokens: vault.lockedTokens + tokenAmount,
          updatedAt: serverTimestamp(),
        });

        // Create payout request (from PACK 83)
        const payoutRef = db.collection('payout_requests').doc();
        transaction.set(payoutRef, {
          id: payoutRef.id,
          userId,
          methodId,
          status: 'PENDING',
          requestedTokens: tokenAmount,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          safetyCheckResult: safetyCheck,
        });

        return payoutRef.id;
      });

      // Create ledger entry
      await createLedgerEntry(
        'PAYOUT_LOCK',
        userId,
        -tokenAmount,
        'CREATOR',
        {
          payoutRequestId,
          methodId,
        },
        userId
      );

      const response: RequestPayoutResponse = {
        success: true,
        payoutRequestId,
        safetyCheck,
        message: 'Payout request submitted for review',
      };

      logger.info('Payout request created', {
        userId,
        payoutRequestId,
        tokenAmount,
      });

      return response;
    } catch (error: any) {
      logger.error('Payout request failed', { error, userId, tokenAmount });
      throw new HttpsError('internal', error.message || 'Failed to process payout request');
    }
  }
);

/**
 * Process payout (admin only)
 */
export const treasury_processPayout = https.onCall<ProcessPayoutRequest>(
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

    const { payoutRequestId, approved, adminId, notes } = request.data;

    if (!payoutRequestId || typeof approved !== 'boolean' || !adminId) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    try {
      // Get payout request
      const payoutDoc = await db.collection('payout_requests').doc(payoutRequestId).get();
      
      if (!payoutDoc.exists) {
        throw new HttpsError('not-found', 'Payout request not found');
      }

      const payout = payoutDoc.data();
      const userId = payout?.userId;
      const tokenAmount = payout?.requestedTokens;

      if (payout?.status !== 'PENDING') {
        throw new HttpsError('failed-precondition', 'Payout already processed');
      }

      if (approved) {
        // APPROVED: Release tokens from locked to paid
        await db.runTransaction(async (transaction) => {
          const vaultRef = db.collection('creator_vaults').doc(userId);
          const vaultSnap = await transaction.get(vaultRef);
          const vault = vaultSnap.data() as CreatorVault;

          // Release locked tokens
          transaction.update(vaultRef, {
            lockedTokens: vault.lockedTokens - tokenAmount,
            lifetimePaidOut: vault.lifetimePaidOut + tokenAmount,
            lastPayoutAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          // Update payout request
          transaction.update(payoutDoc.ref, {
            status: 'PAID',
            reviewedAt: serverTimestamp(),
            reviewerId: adminId,
            notes,
            updatedAt: serverTimestamp(),
          });
        });

        // Create ledger entry
        await createLedgerEntry(
          'PAYOUT_RELEASE',
          userId,
          -tokenAmount,
          'CREATOR',
          {
            payoutRequestId,
            adminId,
            notes,
          },
          userId
        );

        logger.info('Payout approved and processed', {
          payoutRequestId,
          userId,
          tokenAmount,
          adminId,
        });

        const response: ProcessPayoutResponse = {
          success: true,
          status: 'APPROVED',
          message: 'Payout approved and processed',
        };

        return response;
      } else {
        // REJECTED: Return locked tokens to available
        await db.runTransaction(async (transaction) => {
          const vaultRef = db.collection('creator_vaults').doc(userId);
          const vaultSnap = await transaction.get(vaultRef);
          const vault = vaultSnap.data() as CreatorVault;

          // Return locked tokens
          transaction.update(vaultRef, {
            availableTokens: vault.availableTokens + tokenAmount,
            lockedTokens: vault.lockedTokens - tokenAmount,
            updatedAt: serverTimestamp(),
          });

          // Update payout request
          transaction.update(payoutDoc.ref, {
            status: 'REJECTED',
            reviewedAt: serverTimestamp(),
            reviewerId: adminId,
            rejectionReason: notes || 'Payout rejected by admin',
            updatedAt: serverTimestamp(),
          });
        });

        // Create ledger entry
        await createLedgerEntry(
          'PAYOUT_REFUND',
          userId,
          tokenAmount,
          'CREATOR',
          {
            payoutRequestId,
            adminId,
            reason: notes,
          },
          userId
        );

        logger.info('Payout rejected', {
          payoutRequestId,
          userId,
          tokenAmount,
          adminId,
        });

        const response: ProcessPayoutResponse = {
          success: true,
          status: 'REJECTED',
          message: 'Payout rejected and tokens returned',
        };

        return response;
      }
    } catch (error: any) {
      logger.error('Payout processing failed', { error, payoutRequestId });
      throw new HttpsError('internal', error.message || 'Failed to process payout');
    }
  }
);

/**
 * Get payout safety check (preview before requesting)
 */
export const treasury_checkPayoutEligibility = https.onCall(
  {
    region: 'us-central1',
    memory: '128MiB',
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, methodId, tokenAmount } = request.data;

    if (userId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot check eligibility for another user');
    }

    try {
      const safetyCheck = await executeSafetyCheck(userId, methodId, tokenAmount);
      return safetyCheck;
    } catch (error: any) {
      logger.error('Eligibility check failed', { error, userId });
      throw new HttpsError('internal', 'Failed to check eligibility');
    }
  }
);