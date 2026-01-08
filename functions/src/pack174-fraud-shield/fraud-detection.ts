/**
 * PACK 174 - Core Fraud Detection
 * Main fraud detection and case management functions
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId } from '../init';
import {
  FraudCase,
  FraudType,
  FraudEvidence,
  UserFraudRiskProfile,
} from './types';

/**
 * Detect and log fraudulent payment activity
 */
export const detectFraudulentPayment = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const {
    transactionId,
    paymentMethodId,
    amount,
    currency,
    fraudType,
  } = request.data;

  if (!transactionId || !fraudType) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const caseId = generateId();
  const now = new Date();

  const fraudCase: Partial<FraudCase> = {
    id: caseId,
    userId,
    fraudType: fraudType as FraudType,
    status: 'open',
    severity: calculateSeverity(fraudType, amount),
    riskScore: await calculateRiskScore(userId, fraudType, amount),
    evidence: [{
      type: 'transaction',
      id: transactionId,
      data: { paymentMethodId, amount, currency },
      timestamp: now,
    }],
    description: `Suspected ${fraudType} detected for transaction ${transactionId}`,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('fraud_cases').doc(caseId).set(fraudCase);

  await db.collection('payment_fraud_attempts').add({
    id: generateId(),
    userId,
    fraudType,
    paymentMethodId,
    amount,
    currency,
    riskScore: fraudCase.riskScore,
    blocked: fraudCase.riskScore! > 80,
    reason: fraudCase.description,
    createdAt: serverTimestamp(),
  });

  await updateUserRiskProfile(userId);

  return {
    caseId,
    blocked: fraudCase.riskScore! > 80,
    riskScore: fraudCase.riskScore,
  };
});

/**
 * Report fraud manually
 */
export const reportFraud = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const {
    targetUserId,
    fraudType,
    description,
    evidence,
  } = request.data;

  if (!targetUserId || !fraudType || !description) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const caseId = generateId();
  const now = new Date();

  const fraudCase: Partial<FraudCase> = {
    id: caseId,
    userId: targetUserId,
    targetUserId,
    fraudType: fraudType as FraudType,
    status: 'open',
    severity: 'medium',
    riskScore: 50,
    evidence: evidence ? evidence.map((e: any) => ({
      type: e.type,
      id: e.id || generateId(),
      data: e.data,
      timestamp: now,
    })) : [],
    description,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('fraud_cases').doc(caseId).set(fraudCase);

  return { caseId, success: true };
});

/**
 * Get fraud case details
 */
export const getFraudCase = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { caseId } = request.data;
  if (!caseId) {
    throw new HttpsError('invalid-argument', 'Case ID is required');
  }

  const caseDoc = await db.collection('fraud_cases').doc(caseId).get();
  if (!caseDoc.exists) {
    throw new HttpsError('not-found', 'Fraud case not found');
  }

  const caseData = caseDoc.data();

  const isInvestigator = await checkIsFraudInvestigator(userId);
  const isAdmin = await checkIsAdmin(userId);

  if (!isInvestigator && !isAdmin && 
      caseData!.userId !== userId && 
      caseData!.targetUserId !== userId) {
    throw new HttpsError('permission-denied', 'Not authorized to view this case');
  }

  return caseData;
});

/**
 * Update fraud case status
 */
export const updateFraudCase = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const isInvestigator = await checkIsFraudInvestigator(userId);
  const isAdmin = await checkIsAdmin(userId);

  if (!isInvestigator && !isAdmin) {
    throw new HttpsError('permission-denied', 'Only investigators can update cases');
  }

  const { caseId, status, resolutionNotes, mitigation } = request.data;
  if (!caseId || !status) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const updateData: any = {
    status,
    updatedAt: serverTimestamp(),
  };

  if (status === 'resolved' || status === 'closed') {
    updateData.resolvedAt = serverTimestamp();
    if (resolutionNotes) {
      updateData.resolutionNotes = resolutionNotes;
    }
  }

  if (mitigation) {
    updateData.mitigation = {
      ...mitigation,
      appliedAt: serverTimestamp(),
    };
  }

  await db.collection('fraud_cases').doc(caseId).update(updateData);

  return { success: true };
});

/**
 * Get user fraud risk profile
 */
export const getUserFraudRiskProfile = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { targetUserId } = request.data;
  const profileUserId = targetUserId || userId;

  const isInvestigator = await checkIsFraudInvestigator(userId);
  const isAdmin = await checkIsAdmin(userId);

  if (profileUserId !== userId && !isInvestigator && !isAdmin) {
    throw new HttpsError('permission-denied', 'Not authorized to view this profile');
  }

  const profileDoc = await db.collection('user_fraud_risk_profiles').doc(profileUserId).get();
  
  if (!profileDoc.exists) {
    await updateUserRiskProfile(profileUserId);
    const newProfileDoc = await db.collection('user_fraud_risk_profiles').doc(profileUserId).get();
    return newProfileDoc.data();
  }

  return profileDoc.data();
});

/**
 * Helper: Calculate fraud severity
 */
function calculateSeverity(fraudType: string, amount?: number): 'low' | 'medium' | 'high' | 'critical' {
  const criticalTypes = ['financial_blackmail', 'identity_theft', 'impersonation'];
  const highTypes = ['stolen_card', 'chargeback_abuse', 'phishing'];
  
  if (criticalTypes.includes(fraudType)) {
    return 'critical';
  }
  
  if (highTypes.includes(fraudType)) {
    return 'high';
  }
  
  if (amount && amount > 1000) {
    return 'high';
  }
  
  if (amount && amount > 500) {
    return 'medium';
  }
  
  return 'low';
}

/**
 * Helper: Calculate risk score
 */
async function calculateRiskScore(
  userId: string,
  fraudType: string,
  amount?: number
): Promise<number> {
  let score = 0;

  const recentCases = await db.collection('fraud_cases')
    .where('userId', '==', userId)
    .where('createdAt', '>', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    .get();

  score += recentCases.size * 15;

  const highRiskTypes = ['financial_blackmail', 'impersonation', 'stolen_card'];
  if (highRiskTypes.includes(fraudType)) {
    score += 40;
  } else {
    score += 20;
  }

  if (amount) {
    if (amount > 5000) score += 30;
    else if (amount > 1000) score += 20;
    else if (amount > 500) score += 10;
  }

  const blacklistedDevice = await db.collection('blacklisted_devices')
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (!blacklistedDevice.empty) {
    score += 50;
  }

  return Math.min(score, 100);
}

/**
 * Helper: Update user fraud risk profile
 */
async function updateUserRiskProfile(userId: string): Promise<void> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentCases = await db.collection('fraud_cases')
    .where('userId', '==', userId)
    .where('createdAt', '>', thirtyDaysAgo)
    .get();

  const recentAttempts = await db.collection('payment_fraud_attempts')
    .where('userId', '==', userId)
    .where('createdAt', '>', thirtyDaysAgo)
    .get();

  let overallRiskScore = 0;
  let paymentRiskScore = 0;
  let behaviorRiskScore = 0;
  let identityRiskScore = 0;
  const flags: string[] = [];

  recentCases.forEach(doc => {
    const caseData = doc.data();
    const caseScore = caseData.riskScore || 0;
    overallRiskScore += caseScore / 10;

    if (['payment_fraud', 'chargeback_abuse', 'stolen_card'].includes(caseData.fraudType)) {
      paymentRiskScore += 20;
    }
    if (['impersonation', 'identity_theft'].includes(caseData.fraudType)) {
      identityRiskScore += 25;
    }
    if (['romance_fraud', 'emotional_manipulation'].includes(caseData.fraudType)) {
      behaviorRiskScore += 15;
    }
  });

  paymentRiskScore += recentAttempts.size * 10;

  if (recentCases.size > 5) flags.push('multiple_fraud_cases');
  if (paymentRiskScore > 50) flags.push('high_payment_risk');
  if (identityRiskScore > 50) flags.push('identity_verification_required');
  if (behaviorRiskScore > 50) flags.push('suspicious_behavior');

  overallRiskScore = Math.min(
    overallRiskScore + paymentRiskScore / 3 + behaviorRiskScore / 3 + identityRiskScore / 3,
    100
  );

  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  if (overallRiskScore >= 80) riskLevel = 'critical';
  else if (overallRiskScore >= 60) riskLevel = 'high';
  else if (overallRiskScore >= 30) riskLevel = 'medium';
  else riskLevel = 'low';

  const profile: Partial<UserFraudRiskProfile> = {
    userId,
    overallRiskScore: Math.round(overallRiskScore),
    riskLevel,
    paymentRiskScore: Math.round(paymentRiskScore),
    behaviorRiskScore: Math.round(behaviorRiskScore),
    identityRiskScore: Math.round(identityRiskScore),
    flags,
    lastScanAt: now,
    updatedAt: now,
  };

  await db.collection('user_fraud_risk_profiles').doc(userId).set(profile, { merge: true });
}

/**
 * Helper: Check if user is fraud investigator
 */
async function checkIsFraudInvestigator(userId: string): Promise<boolean> {
  const investigatorDoc = await db.collection('fraud_investigators').doc(userId).get();
  return investigatorDoc.exists;
}

/**
 * Helper: Check if user is admin
 */
async function checkIsAdmin(userId: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  return userDoc.exists && userDoc.data()?.role === 'admin';
}