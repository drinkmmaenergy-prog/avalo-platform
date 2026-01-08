/**
 * PACK 385 — Payment, Payout & Tax Safety During Launch
 * Manages delayed payouts, fraud buffers, and verification requirements during market launch
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Launch payout safety configuration
 */
interface PayoutSafetyConfig {
  marketCode: string;
  marketStatus: 'NEW' | 'STABILIZING' | 'MATURE';
  rules: {
    delayedPayouts: boolean;
    delayDays: number;
    rollingFraudBuffer: boolean;
    bufferPercentage: number;
    forcedVerification: boolean;
    verificationThreshold: number;
  };
  activatedAt: admin.firestore.Timestamp;
}

/**
 * Payout request with safety checks
 */
interface PayoutRequest {
  userId: string;
  amount: number;
  currency: string;
  marketCode: string;
  requestedAt: admin.firestore.Timestamp;
  status: 'PENDING' | 'DELAYED' | 'REVIEWING' | 'APPROVED' | 'REJECTED' | 'PAID';
  safetyChecks: {
    delayRequired: boolean;
    verificationRequired: boolean;
    fraudBufferApplied: boolean;
    manualReviewRequired: boolean;
  };
  releaseDate?: Date;
  rejectionReason?: string;
}

/**
 * Apply launch payout safety filter
 */
export const pack385_launchPayoutSafetyFilter = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { amount, currency, marketCode } = data;
  const userId = context.auth.uid;

  if (!amount || !currency || !marketCode) {
    throw new functions.https.HttpsError('invalid-argument', 'Amount, currency, and market code required');
  }

  // Get market safety configuration
  const safetyConfig = await getMarketSafetyConfig(marketCode);

  // Get user data
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  if (!userData) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }

  // Initialize safety checks
  const safetyChecks = {
    delayRequired: false,
    verificationRequired: false,
    fraudBufferApplied: false,
    manualReviewRequired: false
  };

  let effectiveAmount = amount;
  let releaseDate: Date | undefined;

  // Check 1: Delayed payouts for new markets
  if (safetyConfig.rules.delayedPayouts) {
    safetyChecks.delayRequired = true;
    releaseDate = new Date(Date.now() + safetyConfig.rules.delayDays * 24 * 60 * 60 * 1000);
  }

  // Check 2: Verification requirements
  const verificationRequired = await checkVerificationRequired(
    userId,
    amount,
    safetyConfig,
    userData
  );

  if (verificationRequired.required) {
    safetyChecks.verificationRequired = true;
    
    if (!userData.kycVerified) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'KYC verification required for this payout',
        { reason: verificationRequired.reason }
      );
    }
  }

  // Check 3: Rolling fraud buffer
  if (safetyConfig.rules.rollingFraudBuffer) {
    const fraudRisk = await assessFraudRisk(userId, marketCode);
    
    if (fraudRisk.risk > 0.3) {
      safetyChecks.fraudBufferApplied = true;
      const bufferAmount = amount * safetyConfig.rules.bufferPercentage / 100;
      effectiveAmount = amount - bufferAmount;

      // Store buffer amount
      await db.collection('payoutBuffers').add({
        userId,
        originalAmount: amount,
        bufferAmount,
        effectiveAmount,
        reason: 'FRAUD_RISK',
        riskScore: fraudRisk.risk,
        marketCode,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  // Check 4: Manual review triggers
  const reviewRequired = await checkManualReviewRequired(
    userId,
    amount,
    marketCode,
    userData
  );

  if (reviewRequired.required) {
    safetyChecks.manualReviewRequired = true;
  }

  // Create payout request
  const payoutRequest: PayoutRequest = {
    userId,
    amount: effectiveAmount,
    currency,
    marketCode,
    requestedAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
    status: safetyChecks.manualReviewRequired ? 'REVIEWING' : 
            safetyChecks.delayRequired ? 'DELAYED' : 'PENDING',
    safetyChecks,
    releaseDate
  };

  const requestRef = await db.collection('payoutRequests').add(payoutRequest);

  // Log payout request
  await db.collection('auditLogs').add({
    type: 'PAYOUT_REQUEST',
    severity: safetyChecks.manualReviewRequired ? 'HIGH' : 'MEDIUM',
    userId,
    data: {
      requestId: requestRef.id,
      amount: effectiveAmount,
      originalAmount: amount,
      safetyChecks,
      marketCode
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    success: true,
    requestId: requestRef.id,
    effectiveAmount,
    originalAmount: amount,
    status: payoutRequest.status,
    safetyChecks,
    releaseDate: releaseDate?.toISOString(),
    message: getPayoutMessage(safetyChecks, releaseDate)
  };
});

/**
 * Get market safety configuration
 */
async function getMarketSafetyConfig(marketCode: string): Promise<PayoutSafetyConfig> {
  const configDoc = await db.collection('payoutSafetyConfig').doc(marketCode).get();

  if (configDoc.exists) {
    return configDoc.data() as PayoutSafetyConfig;
  }

  // Check market activation date to determine status
  const marketDoc = await db.collection('marketActivation').doc(marketCode).get();
  
  let marketStatus: PayoutSafetyConfig['marketStatus'] = 'NEW';
  
  if (marketDoc.exists) {
    const activatedAt = marketDoc.data()!.activatedAt;
    const daysSinceActivation = (Date.now() - activatedAt.toMillis()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceActivation > 90) {
      marketStatus = 'MATURE';
    } else if (daysSinceActivation > 30) {
      marketStatus = 'STABILIZING';
    }
  }

  // Default safety configuration based on market status
  return {
    marketCode,
    marketStatus,
    rules: {
      delayedPayouts: marketStatus === 'NEW',
      delayDays: marketStatus === 'NEW' ? 14 : marketStatus === 'STABILIZING' ? 7 : 0,
      rollingFraudBuffer: marketStatus !== 'MATURE',
      bufferPercentage: marketStatus === 'NEW' ? 20 : 10,
      forcedVerification: true,
      verificationThreshold: marketStatus === 'NEW' ? 100 : 500
    },
    activatedAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp
  };
}

/**
 * Check if verification is required
 */
async function checkVerificationRequired(
  userId: string,
  amount: number,
  config: PayoutSafetyConfig,
  userData: any
): Promise<{ required: boolean; reason?: string }> {
  // Always require for creators and ambassadors
  if (userData.isCreator || userData.isLaunchAmbassador) {
    return { required: true, reason: 'Creator/Ambassador status' };
  }

  // Check threshold
  if (amount >= config.rules.verificationThreshold) {
    return { required: true, reason: `Amount exceeds threshold (${config.rules.verificationThreshold})` };
  }

  // Check cumulative payouts
  const totalPayouts = await db.collection('payoutRequests')
    .where('userId', '==', userId)
    .where('status', 'in', ['APPROVED', 'PAID'])
    .get();

  let cumulativeAmount = 0;
  totalPayouts.forEach(doc => {
    cumulativeAmount += doc.data().amount;
  });

  if (cumulativeAmount + amount >= config.rules.verificationThreshold * 5) {
    return { required: true, reason: 'Cumulative payout threshold' };
  }

  return { required: false };
}

/**
 * Assess fraud risk for payout
 */
async function assessFraudRisk(userId: string, marketCode: string): Promise<{ risk: number; factors: string[] }> {
  const factors: string[] = [];
  let riskScore = 0;

  // Check account age
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  if (userData) {
    const accountAge = Date.now() - userData.createdAt?.toMillis();
    const daysSinceCreation = accountAge / (1000 * 60 * 60 * 24);
    
    if (daysSinceCreation < 30) {
      riskScore += 0.3;
      factors.push('NEW_ACCOUNT');
    }
  }

  // Check fraud history
  const fraudHistory = await db.collection('fraudDetection')
    .where('userId', '==', userId)
    .where('resolved', '==', false)
    .get();

  if (!fraudHistory.empty) {
    riskScore += 0.4;
    factors.push('FRAUD_HISTORY');
  }

  // Check rapid payout requests
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentPayouts = await db.collection('payoutRequests')
    .where('userId', '==', userId)
    .where('requestedAt', '>', last24h)
    .get();

  if (recentPayouts.size > 3) {
    riskScore += 0.2;
    factors.push('RAPID_REQUESTS');
  }

  // Check for VPN/suspicious activity
  const suspiciousActivity = await db.collection('suspiciousActivity')
    .where('userId', '==', userId)
    .where('timestamp', '>', last24h)
    .get();

  if (!suspiciousActivity.empty) {
    riskScore += 0.3;
    factors.push('SUSPICIOUS_ACTIVITY');
  }

  return {
    risk: Math.min(1.0, riskScore),
    factors
  };
}

/**
 * Check if manual review is required
 */
async function checkManualReviewRequired(
  userId: string,
  amount: number,
  marketCode: string,
  userData: any
): Promise<{ required: boolean; reason?: string }> {
  // Large amounts always require review
  if (amount >= 10000) {
    return { required: true, reason: 'Large amount' };
  }

  // First payout in new market
  const existingPayouts = await db.collection('payoutRequests')
    .where('userId', '==', userId)
    .where('marketCode', '==', marketCode)
    .where('status', 'in', ['APPROVED', 'PAID'])
    .limit(1)
    .get();

  if (existingPayouts.empty) {
    return { required: true, reason: 'First payout in market' };
  }

  // High fraud risk
  const fraudRisk = await assessFraudRisk(userId, marketCode);
  if (fraudRisk.risk > 0.5) {
    return { required: true, reason: 'High fraud risk' };
  }

  return { required: false };
}

/**
 * Get user-friendly payout message
 */
function getPayoutMessage(safetyChecks: PayoutRequest['safetyChecks'], releaseDate?: Date): string {
  if (safetyChecks.manualReviewRequired) {
    return 'Payout pending manual review. You will be notified when approved.';
  }
  
  if (safetyChecks.delayRequired && releaseDate) {
    return `Payout scheduled for ${releaseDate.toLocaleDateString()} due to market launch safety policies.`;
  }

  if (safetyChecks.fraudBufferApplied) {
    return 'A security buffer has been applied. Buffer will be released after verification period.';
  }

  return 'Payout request submitted successfully.';
}

/**
 * Approve payout request
 * Admin-only function
 */
export const pack385_approvePayoutRequest = functions.https.onCall(async (data, context) => {
  // Admin authentication required
  if (!context.auth || !context.auth.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { requestId, notes } = data;

  if (!requestId) {
    throw new functions.https.HttpsError('invalid-argument', 'Request ID required');
  }

  const requestDoc = await db.collection('payoutRequests').doc(requestId).get();

  if (!requestDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Payout request not found');
  }

  const request = requestDoc.data() as PayoutRequest;

  if (request.status === 'APPROVED' || request.status === 'PAID') {
    throw new functions.https.HttpsError('already-exists', 'Payout already approved');
  }

  await requestDoc.ref.update({
    status: 'APPROVED',
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    approvedBy: context.auth.uid,
    adminNotes: notes || ''
  });

  // Log approval
  await db.collection('auditLogs').add({
    type: 'PAYOUT_APPROVED',
    severity: 'MEDIUM',
    userId: context.auth.uid,
    data: {
      requestId,
      payoutUserId: request.userId,
      amount: request.amount,
      notes
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true, requestId };
});

/**
 * Reject payout request
 * Admin-only function
 */
export const pack385_rejectPayoutRequest = functions.https.onCall(async (data, context) => {
  // Admin authentication required
  if (!context.auth || !context.auth.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { requestId, reason } = data;

  if (!requestId || !reason) {
    throw new functions.https.HttpsError('invalid-argument', 'Request ID and reason required');
  }

  const requestDoc = await db.collection('payoutRequests').doc(requestId).get();

  if (!requestDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Payout request not found');
  }

  await requestDoc.ref.update({
    status: 'REJECTED',
    rejectionReason: reason,
    rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
    rejectedBy: context.auth.uid
  });

  // Log rejection
  await db.collection('auditLogs').add({
    type: 'PAYOUT_REJECTED',
    severity: 'MEDIUM',
    userId: context.auth.uid,
    data: {
      requestId,
      reason
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true, requestId };
});

/**
 * Background job: Process delayed payouts
 */
export const pack385_processDelayedPayouts = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const now = new Date();

    // Get payouts ready for release
    const readyPayouts = await db.collection('payoutRequests')
      .where('status', '==', 'DELAYED')
      .where('releaseDate', '<=', now)
      .get();

    const batch = db.batch();
    let processed = 0;

    readyPayouts.forEach(doc => {
      batch.update(doc.ref, {
        status: 'PENDING',
        releasedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      processed++;
    });

    if (processed > 0) {
      await batch.commit();
    }

    console.log(`Released ${processed} delayed payouts`);
  });

/**
 * Background job: Release fraud buffers
 */
export const pack385_releaseFraudBuffers = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get old buffers ready for release
    const oldBuffers = await db.collection('payoutBuffers')
      .where('timestamp', '<=', thirtyDaysAgo)
      .where('released', '==', false)
      .get();

    const batch = db.batch();
    let released = 0;

    for (const doc of oldBuffers.docs) {
      const data = doc.data();

      // Create supplemental payout for buffer amount
      const supplementalRef = db.collection('payoutRequests').doc();
      batch.set(supplementalRef, {
        userId: data.userId,
        amount: data.bufferAmount,
        currency: 'USD',
        marketCode: data.marketCode,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'APPROVED',
        type: 'BUFFER_RELEASE',
        originalBufferId: doc.id
      });

      // Mark buffer as released
      batch.update(doc.ref, {
        released: true,
        releasedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      released++;

      // Commit in batches of 500
      if (released % 500 === 0) {
        await batch.commit();
      }
    }

    if (released % 500 !== 0) {
      await batch.commit();
    }

    console.log(`Released ${released} fraud buffers`);
  });
