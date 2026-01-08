/**
 * PACK 174 - Impersonation Detection
 * Detect and handle identity theft, fake brands, fake celebrities
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId } from '../init';
import { ImpersonationReport, ImpersonationType } from './types';

/**
 * Report impersonation
 */
export const reportImpersonation = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const {
    reportedUserId,
    impersonationType,
    evidence,
    description,
  } = request.data;

  if (!reportedUserId || !impersonationType) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const reportId = generateId();
  const now = new Date();

  const priority = calculateImpersonationPriority(impersonationType, evidence);

  const report: Partial<ImpersonationReport> = {
    id: reportId,
    reportedUserId,
    claimantUserId: userId,
    impersonationType: impersonationType as ImpersonationType,
    status: 'pending',
    priority,
    evidence: evidence || [],
    createdAt: now,
  };

  await db.collection('impersonation_reports').doc(reportId).set(report);

  await db.collection('fraud_cases').add({
    id: generateId(),
    userId: reportedUserId,
    targetUserId: userId,
    fraudType: 'impersonation',
    status: 'open',
    severity: priority === 'urgent' ? 'critical' : 'high',
    riskScore: priority === 'urgent' ? 90 : 70,
    evidence: [{
      type: 'report',
      id: reportId,
      data: { description, evidence },
      timestamp: now,
    }],
    description: `Impersonation report: ${impersonationType} - ${description}`,
    createdAt: now,
    updatedAt: now,
  });

  if (priority === 'urgent') {
    await freezeAccountPendingInvestigation(reportedUserId, reportId);
  }

  return {
    success: true,
    reportId,
    priority,
    statusMessage: priority === 'urgent' 
      ? 'Report filed. Account under immediate review.'
      : 'Report filed. Will be reviewed within 48 hours.',
  };
});

/**
 * Verify identity for impersonation claim
 */
export const verifyIdentityForClaim = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { reportId, verificationType, verificationData } = request.data;

  if (!reportId || !verificationType || !verificationData) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const reportDoc = await db.collection('impersonation_reports').doc(reportId).get();
  
  if (!reportDoc.exists) {
    throw new HttpsError('not-found', 'Report not found');
  }

  const reportData = reportDoc.data();

  if (reportData!.claimantUserId !== userId) {
    throw new HttpsError('permission-denied', 'Not authorized to verify this claim');
  }

  await db.collection('impersonation_reports').doc(reportId).update({
    status: 'under_review',
    evidence: [
      ...(reportData!.evidence || []),
      {
        type: verificationType,
        description: 'Identity verification submitted',
        uploadedAt: serverTimestamp(),
        ...verificationData,
      },
    ],
    updatedAt: serverTimestamp(),
  });

  return {
    success: true,
    message: 'Verification submitted. Report is under review.',
  };
});

/**
 * Review impersonation report (investigators only)
 */
export const reviewImpersonationReport = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const isInvestigator = await checkIsFraudInvestigator(userId);
  const isAdmin = await checkIsAdmin(userId);

  if (!isInvestigator && !isAdmin) {
    throw new HttpsError('permission-denied', 'Only investigators can review reports');
  }

  const { reportId, decision, verificationNotes } = request.data;

  if (!reportId || !decision) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const reportDoc = await db.collection('impersonation_reports').doc(reportId).get();
  
  if (!reportDoc.exists) {
    throw new HttpsError('not-found', 'Report not found');
  }

  const reportData = reportDoc.data();
  const now = new Date();

  await db.collection('impersonation_reports').doc(reportId).update({
    status: decision,
    verificationNotes,
    reviewedAt: now,
    resolvedAt: decision === 'verified' || decision === 'rejected' ? now : null,
    updatedAt: now,
  });

  if (decision === 'verified') {
    await handleVerifiedImpersonation(reportData!.reportedUserId, reportData!.claimantUserId, reportId);
  }

  return { success: true, decision };
});

/**
 * Check profile for impersonation indicators
 */
export const checkProfileForImpersonation = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { targetUserId } = request.data;

  if (!targetUserId) {
    throw new HttpsError('invalid-argument', 'Target user ID is required');
  }

  const targetProfile = await db.collection('users').doc(targetUserId).get();
  
  if (!targetProfile.exists) {
    throw new HttpsError('not-found', 'User not found');
  }

  const profileData = targetProfile.data();

  const indicators = await detectImpersonationIndicators(profileData);

  return {
    userId: targetUserId,
    riskScore: indicators.riskScore,
    riskLevel: indicators.riskLevel,
    indicators: indicators.flags,
    recommendation: indicators.recommendation,
  };
});

/**
 * Detect impersonation indicators in profile
 */
async function detectImpersonationIndicators(profileData: any): Promise<{
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  flags: string[];
  recommendation: string;
}> {
  let riskScore = 0;
  const flags: string[] = [];

  if (profileData.displayName) {
    const suspiciousNamePatterns = [
      /official/i,
      /verified/i,
      /™/,
      /®/,
      /©/,
      /celebrity/i,
      /brand/i,
    ];

    for (const pattern of suspiciousNamePatterns) {
      if (pattern.test(profileData.displayName)) {
        riskScore += 15;
        flags.push('suspicious_name_pattern');
        break;
      }
    }
  }

  if (profileData.bio) {
    const impersonationPhrases = [
      /i am the real/i,
      /this is my official account/i,
      /verified account/i,
      /dm for collaboration/i,
    ];

    for (const phrase of impersonationPhrases) {
      if (phrase.test(profileData.bio)) {
        riskScore += 20;
        flags.push('suspicious_bio_claims');
        break;
      }
    }
  }

  if (!profileData.emailVerified) {
    riskScore += 10;
    flags.push('unverified_email');
  }

  if (!profileData.phoneVerified) {
    riskScore += 10;
    flags.push('unverified_phone');
  }

  const accountAge = Date.now() - profileData.createdAt?.toMillis();
  const daysSinceCreation = accountAge / (1000 * 60 * 60 * 24);

  if (daysSinceCreation < 7) {
    riskScore += 15;
    flags.push('new_account');
  }

  const existingReports = await db.collection('impersonation_reports')
    .where('reportedUserId', '==', profileData.uid)
    .get();

  if (existingReports.size > 0) {
    riskScore += existingReports.size * 20;
    flags.push('previous_impersonation_reports');
  }

  riskScore = Math.min(riskScore, 100);

  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  if (riskScore >= 70) riskLevel = 'critical';
  else if (riskScore >= 50) riskLevel = 'high';
  else if (riskScore >= 30) riskLevel = 'medium';
  else riskLevel = 'low';

  let recommendation = '';
  if (riskLevel === 'critical') {
    recommendation = 'Immediate verification required. Account should be frozen pending investigation.';
  } else if (riskLevel === 'high') {
    recommendation = 'High risk of impersonation. Verify identity before allowing further activity.';
  } else if (riskLevel === 'medium') {
    recommendation = 'Moderate risk. Monitor account activity closely.';
  } else {
    recommendation = 'Low risk of impersonation.';
  }

  return { riskScore, riskLevel, flags, recommendation };
}

/**
 * Calculate impersonation priority
 */
function calculateImpersonationPriority(
  type: string,
  evidence: any[]
): 'low' | 'medium' | 'high' | 'urgent' {
  const urgentTypes = ['fake_celebrity', 'fake_brand'];
  const highTypes = ['deepfake', 'stolen_photos'];

  if (urgentTypes.includes(type)) {
    return 'urgent';
  }

  if (highTypes.includes(type)) {
    return 'high';
  }

  if (evidence && evidence.length > 3) {
    return 'high';
  }

  if (evidence && evidence.length > 1) {
    return 'medium';
  }

  return 'low';
}

/**
 * Freeze account pending investigation
 */
async function freezeAccountPendingInvestigation(userId: string, reportId: string): Promise<void> {
  await db.collection('fraud_mitigation_actions').add({
    id: generateId(),
    userId,
    caseId: reportId,
    actionType: 'account_freeze',
    reason: 'Account frozen pending impersonation investigation',
    appliedAt: serverTimestamp(),
  });

  await db.collection('users').doc(userId).update({
    accountFrozen: true,
    accountFrozenReason: 'impersonation_investigation',
    accountFrozenAt: serverTimestamp(),
  });
}

/**
 * Handle verified impersonation
 */
async function handleVerifiedImpersonation(
  impersonatorId: string,
  victimId: string,
  reportId: string
): Promise<void> {
  await db.collection('fraud_mitigation_actions').add({
    id: generateId(),
    userId: impersonatorId,
    caseId: reportId,
    actionType: 'permanent_ban',
    reason: 'Verified impersonation - permanent account termination',
    appliedAt: serverTimestamp(),
  });

  await db.collection('users').doc(impersonatorId).update({
    accountStatus: 'banned',
    banReason: 'impersonation',
    bannedAt: serverTimestamp(),
  });

  await db.collection('blacklisted_devices')
    .where('userId', '==', impersonatorId)
    .get()
    .then(snapshot => {
      if (snapshot.empty) {
        return db.collection('blacklisted_devices').add({
          id: generateId(),
          deviceFingerprint: `user_${impersonatorId}`,
          reason: 'Impersonation - permanent ban',
          reportedBy: 'system',
          status: 'active',
          addedAt: serverTimestamp(),
        });
      }
    });
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