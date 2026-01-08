/**
 * PACK 131: Affiliate System Cloud Functions
 * Core affiliate management functions
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db, generateId } from '../init';
import {
  AffiliateProfile,
  AffiliateReferral,
  AffiliatePayout,
  AffiliateAnalytics,
  AffiliateLandingPage,
  CreateAffiliateProfileRequest,
  GenerateAffiliateLinkRequest,
  RecordReferralRequest,
  GetAffiliateAnalyticsRequest,
  RequestAffiliatePayoutRequest,
  ProcessAffiliatePayoutRequest,
  SuspendAffiliateRequest,
  AffiliateComplianceStatus,
  PAYOUT_CONFIG,
} from './types';
import { detectFraud, checkPayoutEligibility } from './fraud-detection';

/**
 * Generate a unique affiliate code
 */
function generateAffiliateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create a new affiliate profile
 * Must sign business agreement and verify identity
 */
export async function createAffiliateProfile(
  request: CreateAffiliateProfileRequest,
  callerUid: string
): Promise<{ affiliateId: string; affiliateCode: string }> {
  // Verify caller is the user
  if (request.userId !== callerUid) {
    throw new HttpsError('permission-denied', 'Cannot create profile for another user');
  }

  // Check if user already has an affiliate profile
  const existingQuery = await db
    .collection('affiliate_profiles')
    .where('userId', '==', request.userId)
    .limit(1)
    .get();

  if (!existingQuery.empty) {
    throw new HttpsError('already-exists', 'User already has an affiliate profile');
  }

  // Generate unique affiliate code
  let affiliateCode: string;
  let isUnique = false;
  let attempts = 0;

  while (!isUnique && attempts < 10) {
    affiliateCode = generateAffiliateCode();
    const codeCheck = await db
      .collection('affiliate_profiles')
      .where('affiliateCode', '==', affiliateCode)
      .limit(1)
      .get();
    
    isUnique = codeCheck.empty;
    attempts++;
  }

  if (!isUnique) {
    throw new HttpsError('internal', 'Failed to generate unique affiliate code');
  }

  // Create affiliate profile
  const affiliateId = generateId();
  const now = new Date();

  const profile: AffiliateProfile = {
    affiliateId,
    affiliateCode: affiliateCode!,
    userId: request.userId,
    status: 'pending',
    
    businessName: request.businessName,
    taxId: request.taxId,
    taxCountry: request.taxCountry,
    
    email: request.email,
    
    payoutMethod: request.payoutMethod,
    payoutDetails: request.payoutDetails,
    
    canViewAnalytics: false,
    
    landingPageEnabled: false,
    
    agreementSigned: false,
    identityVerified: false,
    antiMLMAccepted: false,
    antiSpamAccepted: false,
    
    violations: {
      count: 0,
      history: [],
    },
    
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('affiliate_profiles').doc(affiliateId).set(profile);

  return { affiliateId, affiliateCode: affiliateCode! };
}

/**
 * Generate an affiliate referral link
 */
export async function generateAffiliateLink(
  request: GenerateAffiliateLinkRequest,
  callerUid: string
): Promise<{ referralUrl: string; affiliateCode: string }> {
  // Get affiliate profile
  const profileDoc = await db
    .collection('affiliate_profiles')
    .doc(request.affiliateId)
    .get();

  if (!profileDoc.exists) {
    throw new HttpsError('not-found', 'Affiliate profile not found');
  }

  const profile = profileDoc.data() as AffiliateProfile;

  // Verify caller owns this profile
  if (profile.userId !== callerUid) {
    throw new HttpsError('permission-denied', 'Not authorized');
  }

  // Check if affiliate is active
  if (profile.status !== 'active') {
    throw new HttpsError(
      'failed-precondition',
      'Affiliate must be active to generate links'
    );
  }

  const referralUrl = `https://avalo.app/?ref=${profile.affiliateCode}`;

  return {
    referralUrl,
    affiliateCode: profile.affiliateCode,
  };
}

/**
 * Record a new referral signup
 * Called when a user signs up with an affiliate code
 */
export async function recordReferral(
  request: RecordReferralRequest
): Promise<{ referralId: string; success: boolean }> {
  // Validate affiliate code
  const affiliateQuery = await db
    .collection('affiliate_profiles')
    .where('affiliateCode', '==', request.affiliateCode)
    .limit(1)
    .get();

  if (affiliateQuery.empty) {
    throw new HttpsError('not-found', 'Invalid affiliate code');
  }

  const affiliateDoc = affiliateQuery.docs[0];
  const affiliate = affiliateDoc.data() as AffiliateProfile;

  // Check if affiliate is active
  if (affiliate.status !== 'active') {
    throw new HttpsError(
      'failed-precondition',
      'Affiliate is not active'
    );
  }

  // Check if user was already referred
  const existingReferral = await db
    .collection('affiliate_referrals')
    .where('userId', '==', request.userId)
    .limit(1)
    .get();

  if (!existingReferral.empty) {
    throw new HttpsError('already-exists', 'User already referred');
  }

  // Run fraud detection
  const fraudResult = await detectFraud(
    request.affiliateCode,
    request.userId,
    request.signupIP,
    request.signupDeviceId,
    request.signupUserAgent
  );

  // Block if confirmed fraud
  if (fraudResult.shouldBlock) {
    throw new HttpsError(
      'permission-denied',
      'Signup blocked due to fraud detection'
    );
  }

  // Create referral record
  const referralId = generateId();
  const now = new Date();

  const referral: AffiliateReferral = {
    referralId,
    affiliateId: affiliate.affiliateId,
    affiliateCode: request.affiliateCode,
    
    userId: request.userId,
    
    signupTimestamp: now,
    signupIP: request.signupIP,
    signupDeviceId: request.signupDeviceId,
    signupUserAgent: request.signupUserAgent,
    verificationCompleted: false,
    
    fraudScore: fraudResult.fraudScore,
    fraudFlags: fraudResult.fraudFlags,
    fraudStatus: fraudResult.fraudStatus,
    
    retentionDay1: false,
    
    payoutEligible: false,
    payoutProcessed: false,
    
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('affiliate_referrals').doc(referralId).set(referral);

  return { referralId, success: true };
}

/**
 * Mark a referral as verified
 * Called when user completes identity verification
 */
export async function markReferralVerified(
  userId: string
): Promise<void> {
  const referralQuery = await db
    .collection('affiliate_referrals')
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (referralQuery.empty) {
    return;
  }

  const referralDoc = referralQuery.docs[0];
  await referralDoc.ref.update({
    verificationCompleted: true,
    verificationCompletedAt: new Date(),
    updatedAt: new Date(),
  });
}

/**
 * Get affiliate analytics
 */
export async function getAffiliateAnalytics(
  request: GetAffiliateAnalyticsRequest,
  callerUid: string
): Promise<AffiliateAnalytics> {
  // Get affiliate profile
  const profileDoc = await db
    .collection('affiliate_profiles')
    .doc(request.affiliateId)
    .get();

  if (!profileDoc.exists) {
    throw new HttpsError('not-found', 'Affiliate profile not found');
  }

  const profile = profileDoc.data() as AffiliateProfile;

  // Verify caller owns this profile
  if (profile.userId !== callerUid) {
    throw new HttpsError('permission-denied', 'Not authorized');
  }

  // Check analytics permission
  if (!profile.canViewAnalytics) {
    throw new HttpsError('permission-denied', 'Analytics access not granted');
  }

  // Calculate date range
  const now = new Date();
  let periodStart: Date;

  switch (request.period) {
    case 'day':
      periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'all_time':
      periodStart = new Date(0);
      break;
  }

  // Get referrals in period
  const referralsQuery = await db
    .collection('affiliate_referrals')
    .where('affiliateId', '==', request.affiliateId)
    .where('createdAt', '>=', periodStart)
    .get();

  const referrals = referralsQuery.docs.map(doc => doc.data() as AffiliateReferral);

  // Calculate metrics
  const totalReferrals = referrals.length;
  const verifiedReferrals = referrals.filter(r => r.verificationCompleted).length;
  const pendingVerifications = referrals.filter(r => !r.verificationCompleted).length;
  
  const retentionDay1Count = referrals.filter(r => r.retentionDay1).length;
  const retentionDay7Count = referrals.filter(r => r.retentionDay7).length;
  const retentionDay30Count = referrals.filter(r => r.retentionDay30).length;
  
  const flaggedReferrals = referrals.filter(r => r.fraudStatus === 'suspicious').length;
  const fraudulentReferrals = referrals.filter(r => r.fraudStatus === 'confirmed_fraud').length;

  // Get payout data
  const payoutsQuery = await db
    .collection('affiliate_payouts')
    .where('affiliateId', '==', request.affiliateId)
    .get();

  const payouts = payoutsQuery.docs.map(doc => doc.data() as AffiliatePayout);
  
  const totalEarnings = payouts
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);
  
  const pendingPayouts = payouts.filter(p => p.status === 'pending').length;
  const completedPayouts = payouts.filter(p => p.status === 'completed').length;

  const analytics: AffiliateAnalytics = {
    affiliateId: request.affiliateId,
    period: request.period,
    periodStart,
    periodEnd: now,
    
    totalReferrals,
    verifiedReferrals,
    pendingVerifications,
    
    retentionDay1Count,
    retentionDay7Count,
    retentionDay30Count,
    
    totalEarnings,
    pendingPayouts,
    completedPayouts,
    
    flaggedReferrals,
    fraudulentReferrals,
    
    lastUpdated: now,
  };

  return analytics;
}

/**
 * Request a payout
 */
export async function requestAffiliatePayout(
  request: RequestAffiliatePayoutRequest,
  callerUid: string
): Promise<{ payoutId: string; amount: number; referralCount: number }> {
  // Get affiliate profile
  const profileDoc = await db
    .collection('affiliate_profiles')
    .doc(request.affiliateId)
    .get();

  if (!profileDoc.exists) {
    throw new HttpsError('not-found', 'Affiliate profile not found');
  }

  const profile = profileDoc.data() as AffiliateProfile;

  // Verify caller owns this profile
  if (profile.userId !== callerUid) {
    throw new HttpsError('permission-denied', 'Not authorized');
  }

  // Check compliance
  if (!profile.agreementSigned || !profile.identityVerified) {
    throw new HttpsError(
      'failed-precondition',
      'Must complete compliance requirements'
    );
  }

  // Get eligible referrals
  const referralsQuery = await db
    .collection('affiliate_referrals')
    .where('affiliateId', '==', request.affiliateId)
    .where('payoutEligible', '==', true)
    .where('payoutProcessed', '==', false)
    .get();

  const eligibleReferrals = referralsQuery.docs
    .map(doc => doc.data() as AffiliateReferral)
    .filter(r => {
      // Additional eligibility check
      const daysSinceVerification = r.verificationCompletedAt
        ? (Date.now() - r.verificationCompletedAt.getTime()) / (24 * 60 * 60 * 1000)
        : 0;
      
      return daysSinceVerification >= PAYOUT_CONFIG.payoutProcessingDays;
    });

  if (eligibleReferrals.length === 0) {
    throw new HttpsError('failed-precondition', 'No eligible referrals for payout');
  }

  // Calculate payout amount (CPA model: $10 per verified user)
  const amountPerUser = 1000; // 10.00 USD in cents
  const totalAmount = eligibleReferrals.length * amountPerUser;

  // Check minimum payout
  if (totalAmount < PAYOUT_CONFIG.minimumPayoutAmount) {
    throw new HttpsError(
      'failed-precondition',
      `Minimum payout is ${PAYOUT_CONFIG.minimumPayoutAmount / 100} USD`
    );
  }

  // Create payout request
  const payoutId = generateId();
  const now = new Date();

  const payout: AffiliatePayout = {
    payoutId,
    affiliateId: request.affiliateId,
    
    amount: totalAmount,
    currency: 'USD',
    payoutMethod: profile.payoutMethod,
    
    referralIds: eligibleReferrals.map(r => r.referralId),
    referralCount: eligibleReferrals.length,
    
    status: 'pending',
    requestedAt: now,
  };

  await db.collection('affiliate_payouts').doc(payoutId).set(payout);

  return {
    payoutId,
    amount: totalAmount,
    referralCount: eligibleReferrals.length,
  };
}

/**
 * Process a payout (admin function)
 */
export async function processAffiliatePayout(
  request: ProcessAffiliatePayoutRequest,
  callerUid: string
): Promise<{ success: boolean }> {
  // Verify admin permission (would check custom claims in production)
  // For now, just placeholder
  
  const payoutDoc = await db
    .collection('affiliate_payouts')
    .doc(request.payoutId)
    .get();

  if (!payoutDoc.exists) {
    throw new HttpsError('not-found', 'Payout not found');
  }

  const payout = payoutDoc.data() as AffiliatePayout;

  if (payout.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'Payout is not pending');
  }

  const now = new Date();
  const batch = db.batch();

  // Update payout status
  batch.update(payoutDoc.ref, {
    status: 'completed',
    processedAt: now,
    completedAt: now,
    approvedBy: request.approvedBy,
    notes: request.notes,
  });

  // Mark referrals as paid
  for (const referralId of payout.referralIds) {
    const referralRef = db.collection('affiliate_referrals').doc(referralId);
    batch.update(referralRef, {
      payoutProcessed: true,
      payoutId: request.payoutId,
      payoutAmount: payout.amount / payout.referralCount,
      updatedAt: now,
    });
  }

  await batch.commit();

  return { success: true };
}

/**
 * Suspend an affiliate
 */
export async function suspendAffiliate(
  request: SuspendAffiliateRequest,
  callerUid: string
): Promise<{ success: boolean }> {
  // Verify admin permission (would check custom claims in production)
  
  const profileDoc = await db
    .collection('affiliate_profiles')
    .doc(request.affiliateId)
    .get();

  if (!profileDoc.exists) {
    throw new HttpsError('not-found', 'Affiliate profile not found');
  }

  const now = new Date();
  const violationId = `viol_${Date.now()}`;

  await profileDoc.ref.update({
    status: request.severity === 3 ? 'banned' : 'suspended',
    suspendedAt: now,
    ...(request.severity === 3 && { bannedAt: now }),
    'violations.count': FieldValue.increment(1),
    'violations.history': FieldValue.arrayUnion({
      violationId,
      type: request.violationType,
      description: request.reason,
      severity: request.severity,
      actionTaken: request.severity === 3 ? 'termination' : (request.severity === 2 ? 'suspension' : 'warning'),
      detectedAt: now,
    }),
    updatedAt: now,
  });

  return { success: true };
}

/**
 * Get affiliate compliance status
 */
export async function getAffiliateComplianceStatus(
  affiliateId: string,
  callerUid: string
): Promise<AffiliateComplianceStatus> {
  const profileDoc = await db
    .collection('affiliate_profiles')
    .doc(affiliateId)
    .get();

  if (!profileDoc.exists) {
    throw new HttpsError('not-found', 'Affiliate profile not found');
  }

  const profile = profileDoc.data() as AffiliateProfile;

  // Verify caller owns this profile
  if (profile.userId !== callerUid) {
    throw new HttpsError('permission-denied', 'Not authorized');
  }

  const taxInfoComplete = !!(profile.taxId && profile.taxCountry);
  const payoutMethodConfigured = !!(profile.payoutMethod && profile.payoutDetails);

  return {
    agreementSigned: profile.agreementSigned,
    identityVerified: profile.identityVerified,
    antiMLMAccepted: profile.antiMLMAccepted,
    antiSpamAccepted: profile.antiSpamAccepted,
    taxInfoComplete,
    payoutMethodConfigured,
    violationCount: profile.violations.count,
    canCreateLandingPage: profile.status === 'active' && profile.agreementSigned,
    canReceivePayouts: profile.status === 'active' && profile.agreementSigned && profile.identityVerified && taxInfoComplete && payoutMethodConfigured,
  };
}