/**
 * PACK 202 - Ambassador & Early Access Program Functions
 * 
 * Professional creator ambassador program with strict anti-NSFW safeguards.
 * No free tokens, no romantic recruitment, no sexualized marketing.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  Ambassador,
  AmbassadorApplication,
  AmbassadorContract,
  AmbassadorQualification,
  AmbassadorReferral,
  AmbassadorRevenueLog,
  AmbassadorReport,
  AmbassadorViolation,
  NSFWDetectionResult,
  COMMISSION_STRUCTURE,
  QualificationType,
  ExpertiseCategory,
  ViolationType
} from '../types/ambassador.types';
import { detectNSFWContent, detectRomanticContent, detectInappropriateLanguage } from './nsfw-detection';
import { generateReferralCode } from '../utils/referral-utils';

const db = admin.firestore();

/**
 * Apply to become an ambassador
 */
export const applyForAmbassador = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const {
    qualification,
    expertise,
    portfolio,
    socialProfiles,
    motivationStatement,
    contentSamples,
    references
  } = data;

  // Validate required fields
  if (!qualification || !expertise || !motivationStatement) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: qualification, expertise, motivationStatement'
    );
  }

  // Validate qualification type
  const validQualificationTypes: QualificationType[] = [
    'educational_value',
    'community_building',
    'social_skills',
    'skill_excellence',
    'professionalism'
  ];

  if (!validQualificationTypes.includes(qualification.type)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid qualification type. Must be educational_value, community_building, social_skills, skill_excellence, or professionalism'
    );
  }

  // Check if user already has an application
  const existingApp = await db.collection('ambassador_applications')
    .where('userId', '==', userId)
    .where('status', 'in', ['submitted', 'under_review', 'approved'])
    .get();

  if (!existingApp.empty) {
    throw new functions.https.HttpsError(
      'already-exists',
      'You already have a pending or approved ambassador application'
    );
  }

  // Screen content for NSFW/romantic patterns
  const contentToScreen = [
    motivationStatement,
    qualification.description,
    qualification.experience,
    ...(qualification.achievements || []),
    ...(contentSamples || [])
  ].join(' ');

  const nsfwResult = await detectNSFWContent(contentToScreen);
  const romanticResult = await detectRomanticContent(contentToScreen);
  const inappropriateResult = await detectInappropriateLanguage(contentToScreen);

  // Auto-reject if NSFW/romantic content detected
  if (nsfwResult.detected || romanticResult.detected || inappropriateResult.detected) {
    const rejectionReason = [];
    if (nsfwResult.detected) rejectionReason.push('NSFW content detected');
    if (romanticResult.detected) rejectionReason.push('Romantic/sexualized content detected');
    if (inappropriateResult.detected) rejectionReason.push('Inappropriate language detected');

    const application: Partial<AmbassadorApplication> = {
      userId,
      status: 'rejected',
      qualification,
      expertise,
      portfolio: portfolio || [],
      socialProfiles: socialProfiles || [],
      motivationStatement,
      contentSamples: contentSamples || [],
      references: references || [],
      submittedAt: admin.firestore.Timestamp.now() as any,
      reviewedAt: admin.firestore.Timestamp.now() as any,
      rejectionReason: rejectionReason.join('; '),
      contentScreening: {
        checked: true,
        checkedAt: admin.firestore.Timestamp.now() as any,
        nsfwDetected: nsfwResult.detected,
        romanticContentDetected: romanticResult.detected,
        inappropriateLanguageDetected: inappropriateResult.detected,
        screeningDetails: JSON.stringify({
          nsfw: nsfwResult,
          romantic: romanticResult,
          inappropriate: inappropriateResult
        })
      },
      createdAt: admin.firestore.Timestamp.now() as any,
      updatedAt: admin.firestore.Timestamp.now() as any
    };

    const appRef = await db.collection('ambassador_applications').add(application);

    return {
      success: false,
      applicationId: appRef.id,
      status: 'rejected',
      reason: rejectionReason.join('; ')
    };
  }

  // Create application
  const application: Partial<AmbassadorApplication> = {
    userId,
    status: 'submitted',
    qualification,
    expertise,
    portfolio: portfolio || [],
    socialProfiles: socialProfiles || [],
    motivationStatement,
    contentSamples: contentSamples || [],
    references: references || [],
    submittedAt: admin.firestore.Timestamp.now() as any,
    contentScreening: {
      checked: true,
      checkedAt: admin.firestore.Timestamp.now() as any,
      nsfwDetected: false,
      romanticContentDetected: false,
      inappropriateLanguageDetected: false,
      screeningDetails: 'Content passed all screening checks'
    },
    createdAt: admin.firestore.Timestamp.now() as any,
    updatedAt: admin.firestore.Timestamp.now() as any
  };

  const appRef = await db.collection('ambassador_applications').add(application);

  // Notify admins of new application
  await db.collection('admin_notifications').add({
    type: 'ambassador_application',
    applicationId: appRef.id,
    userId,
    message: 'New ambassador application submitted',
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    success: true,
    applicationId: appRef.id,
    status: 'submitted',
    message: 'Application submitted successfully. You will be notified of the review outcome.'
  };
});

/**
 * Review an ambassador application (Admin only)
 */
export const reviewAmbassadorApplication = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { applicationId, approved, reviewNotes, rejectionReason } = data;

  if (!applicationId || approved === undefined) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: applicationId, approved'
    );
  }

  // Verify admin role
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins can review ambassador applications'
    );
  }

  const appRef = db.collection('ambassador_applications').doc(applicationId);
  const appDoc = await appRef.get();

  if (!appDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Application not found');
  }

  const application = appDoc.data() as AmbassadorApplication;

  if (application.status !== 'submitted' && application.status !== 'under_review') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Application has already been reviewed'
    );
  }

  const now = admin.firestore.Timestamp.now() as any;

  if (approved) {
    // Approve application and create ambassador profile
    const referralCode = await generateReferralCode(application.userId);

    const ambassador: Partial<Ambassador> = {
      userId: application.userId,
      status: 'approved',
      applicationDate: application.submittedAt,
      approvalDate: now,
      qualification: application.qualification,
      expertise: application.expertise,
      portfolio: application.portfolio,
      socialProfiles: application.socialProfiles,
      badge: 'Early Builder',
      referralCode,
      totalReferrals: 0,
      totalRevenue: 0,
      totalCommission: 0,
      academyProgress: {
        completedModules: [],
        certifications: []
      },
      contractSigned: false,
      safetyTrainingCompleted: false,
      violations: [],
      createdAt: now,
      updatedAt: now,
      metadata: {}
    };

    const ambassadorRef = await db.collection('ambassadors').add(ambassador);

    // Update application
    await appRef.update({
      status: 'approved',
      reviewedBy: context.auth.uid,
      reviewedAt: now,
      reviewNotes: reviewNotes || '',
      updatedAt: now
    });

    // Generate contract
    await generateAmbassadorContract(ambassadorRef.id, application.userId);

    // Notify user
    await db.collection('notifications').add({
      userId: application.userId,
      type: 'ambassador_approved',
      title: 'Ambassador Application Approved!',
      message: 'Congratulations! Your ambassador application has been approved. Please review and sign your ambassador contract.',
      data: {
        ambassadorId: ambassadorRef.id,
        applicationId
      },
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      ambassadorId: ambassadorRef.id,
      message: 'Application approved and ambassador profile created'
    };
  } else {
    // Reject application
    await appRef.update({
      status: 'rejected',
      reviewedBy: context.auth.uid,
      reviewedAt: now,
      reviewNotes: reviewNotes || '',
      rejectionReason: rejectionReason || 'Application did not meet ambassador requirements',
      updatedAt: now
    });

    // Notify user
    await db.collection('notifications').add({
      userId: application.userId,
      type: 'ambassador_rejected',
      title: 'Ambassador Application Update',
      message: `Your ambassador application has been reviewed. ${rejectionReason || 'Unfortunately, it did not meet our current requirements.'}`,
      data: {
        applicationId
      },
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      message: 'Application rejected'
    };
  }
});

/**
 * Assign referral code to existing ambassador
 */
export const assignReferralCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { ambassadorId } = data;

  if (!ambassadorId) {
    throw new functions.https.HttpsError('invalid-argument', 'ambassadorId is required');
  }

  const ambassadorRef = db.collection('ambassadors').doc(ambassadorId);
  const ambassadorDoc = await ambassadorRef.get();

  if (!ambassadorDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Ambassador not found');
  }

  const ambassador = ambassadorDoc.data() as Ambassador;

  if (ambassador.userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Unauthorized');
  }

  if (ambassador.referralCode) {
    return {
      success: true,
      referralCode: ambassador.referralCode,
      message: 'Referral code already exists'
    };
  }

  const referralCode = await generateReferralCode(ambassador.userId);

  await ambassadorRef.update({
    referralCode,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    success: true,
    referralCode,
    message: 'Referral code assigned successfully'
  };
});

/**
 * Log referral revenue and calculate commission
 */
export const logReferralRevenue = functions.https.onCall(async (data, context) => {
  const {
    ambassadorId,
    referralId,
    referredUserId,
    transactionId,
    transactionType,
    transactionAmount
  } = data;

  if (!ambassadorId || !referralId || !referredUserId || !transactionId || !transactionAmount) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields'
    );
  }

  // Get ambassador
  const ambassadorDoc = await db.collection('ambassadors').doc(ambassadorId).get();
  if (!ambassadorDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Ambassador not found');
  }

  const ambassador = ambassadorDoc.data() as Ambassador;

  if (ambassador.status !== 'approved') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Ambassador is not active'
    );
  }

  // Get referral
  const referralDoc = await db.collection('ambassador_referrals').doc(referralId).get();
  if (!referralDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Referral not found');
  }

  const referral = referralDoc.data() as AmbassadorReferral;

  if (referral.ambassadorId !== ambassadorId) {
    throw new functions.https.HttpsError('permission-denied', 'Referral does not belong to this ambassador');
  }

  // Calculate commission
  const platformShare = transactionAmount * COMMISSION_STRUCTURE.platformSplit;
  const commissionAmount = platformShare * COMMISSION_STRUCTURE.rate;

  // Create revenue log
  const revenueLog: Partial<AmbassadorRevenueLog> = {
    ambassadorId,
    referralId,
    referredUserId,
    transactionId,
    transactionType,
    transactionAmount,
    platformShare,
    commissionRate: COMMISSION_STRUCTURE.rate,
    commissionAmount,
    transactionDate: admin.firestore.Timestamp.now() as any,
    createdAt: admin.firestore.Timestamp.now() as any
  };

  await db.collection('ambassador_revenue_logs').add(revenueLog);

  // Update ambassador totals
  await db.collection('ambassadors').doc(ambassadorId).update({
    totalRevenue: admin.firestore.FieldValue.increment(transactionAmount),
    totalCommission: admin.firestore.FieldValue.increment(commissionAmount),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Update referral totals
  await db.collection('ambassador_referrals').doc(referralId).update({
    totalRevenueGenerated: admin.firestore.FieldValue.increment(transactionAmount),
    totalCommissionEarned: admin.firestore.FieldValue.increment(commissionAmount),
    lastRevenueDate: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    success: true,
    commissionAmount,
    message: 'Revenue logged and commission calculated'
  };
});

/**
 * Remove ambassador for violation
 */
export const removeAmbassadorForViolation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { ambassadorId, violationType, description, severity, evidence } = data;

  if (!ambassadorId || !violationType || !description) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: ambassadorId, violationType, description'
    );
  }

  // Verify admin role
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins can remove ambassadors'
    );
  }

  const ambassadorRef = db.collection('ambassadors').doc(ambassadorId);
  const ambassadorDoc = await ambassadorRef.get();

  if (!ambassadorDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Ambassador not found');
  }

  const ambassador = ambassadorDoc.data() as Ambassador;

  // Create violation record
  const violation: Partial<AmbassadorViolation> = {
    type: violationType as ViolationType,
    description,
    severity: severity || 'critical',
    evidence: evidence || [],
    reportedBy: context.auth.uid,
    reportedAt: admin.firestore.Timestamp.now() as any
  };

  // Update ambassador status
  await ambassadorRef.update({
    status: 'removed',
    violations: admin.firestore.FieldValue.arrayUnion(violation),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Freeze pending revenue
  const pendingRevenue = await db.collection('ambassador_revenue_logs')
    .where('ambassadorId', '==', ambassadorId)
    .where('commissionPaidDate', '==', null)
    .get();

  const batch = db.batch();
  pendingRevenue.docs.forEach(doc => {
    batch.update(doc.ref, {
      frozen: true,
      frozenReason: 'Ambassador removed for violation',
      frozenAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  await batch.commit();

  // Terminate contract
  const contractQuery = await db.collection('ambassador_contracts')
    .where('ambassadorId', '==', ambassadorId)
    .where('status', '==', 'active')
    .get();

  for (const contractDoc of contractQuery.docs) {
    await contractDoc.ref.update({
      status: 'terminated',
      terminatedAt: admin.firestore.FieldValue.serverTimestamp(),
      terminationReason: `Violation: ${violationType} - ${description}`
    });
  }

  // Send legal notice notification
  await db.collection('notifications').add({
    userId: ambassador.userId,
    type: 'ambassador_removed',
    title: 'Ambassador Status Removed',
    message: `Your ambassador status has been removed due to a violation of our terms. Type: ${violationType}. A legal notice will be sent to your registered email.`,
    data: {
      ambassadorId,
      violationType,
      severity
    },
    read: false,
    priority: 'high',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Create legal notice task
  await db.collection('legal_notices').add({
    userId: ambassador.userId,
    type: 'ambassador_violation',
    ambassadorId,
    violationType,
    description,
    severity,
    evidence: evidence || [],
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    success: true,
    message: 'Ambassador removed, revenue frozen, and legal notice issued'
  };
});

/**
 * Generate ambassador contract
 */
async function generateAmbassadorContract(ambassadorId: string, userId: string): Promise<string> {
  const contract: Partial<AmbassadorContract> = {
    ambassadorId,
    userId,
    version: '1.0',
    terms: {
      prohibitions: {
        noSexualMonetization: true,
        noRomanticMarketing: true,
        noParasocialStrategies: true,
        noBodySellingContent: true,
        noEmotionalPressure: true
      },
      requirements: {
        mandatorySafetyTraining: true,
        ethicalRecruitment: true,
        professionalStandards: true,
        contentModeration: true
      },
      violations: {
        autoRemoval: true,
        revenueFreezeOnViolation: true,
        legalNoticeOnBreach: true
      },
      commissionStructure: {
        rate: COMMISSION_STRUCTURE.rate,
        source: COMMISSION_STRUCTURE.source,
        noCreatorImpact: true,
        noInflation: true
      }
    },
    signed: false,
    status: 'draft',
    createdAt: admin.firestore.Timestamp.now() as any,
    updatedAt: admin.firestore.Timestamp.now() as any
  };

  const contractRef = await db.collection('ambassador_contracts').add(contract);
  return contractRef.id;
}

/**
 * Sign ambassador contract
 */
export const signAmbassadorContract = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { contractId, signature } = data;

  if (!contractId || !signature) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: contractId, signature'
    );
  }

  const contractRef = db.collection('ambassador_contracts').doc(contractId);
  const contractDoc = await contractRef.get();

  if (!contractDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Contract not found');
  }

  const contract = contractDoc.data() as AmbassadorContract;

  if (contract.userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Unauthorized');
  }

  if (contract.signed) {
    throw new functions.https.HttpsError('failed-precondition', 'Contract already signed');
  }

  // Update contract
  await contractRef.update({
    signed: true,
    signedAt: admin.firestore.FieldValue.serverTimestamp(),
    signature,
    ipAddress: context.rawRequest.ip,
    status: 'active',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Update ambassador
  const ambassadorQuery = await db.collection('ambassadors')
    .where('userId', '==', context.auth.uid)
    .get();

  if (!ambassadorQuery.empty) {
    await ambassadorQuery.docs[0].ref.update({
      contractSigned: true,
      contractSignedDate: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  return {
    success: true,
    message: 'Contract signed successfully'
  };
});

/**
 * Report ambassador misconduct
 */
export const reportAmbassadorMisconduct = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { ambassadorId, reportType, description, evidence, severity } = data;

  if (!ambassadorId || !reportType || !description) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: ambassadorId, reportType, description'
    );
  }

  // Check if ambassador exists
  const ambassadorDoc = await db.collection('ambassadors').doc(ambassadorId).get();
  if (!ambassadorDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Ambassador not found');
  }

  const report: Partial<AmbassadorReport> = {
    reportedAmbassadorId: ambassadorId,
    reportedBy: context.auth.uid,
    reportType: reportType as ViolationType,
    description,
    evidence: evidence || [],
    severity: severity || 'medium',
    status: 'pending',
    reportedAt: admin.firestore.Timestamp.now() as any,
    metadata: {}
  };

  const reportRef = await db.collection('ambassador_reports').add(report);

  // Notify admins
  await db.collection('admin_notifications').add({
    type: 'ambassador_report',
    reportId: reportRef.id,
    ambassadorId,
    reportType,
    severity: severity || 'medium',
    message: `New ambassador misconduct report: ${reportType}`,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    success: true,
    reportId: reportRef.id,
    message: 'Report submitted successfully. Our team will investigate.'
  };
});