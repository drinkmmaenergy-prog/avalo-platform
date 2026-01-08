/**
 * ========================================================================
 * PACK 354 — INFLUENCER ACQUISITION & CREATOR ONBOARDING ENGINE
 * ========================================================================
 * Production-ready creator growth and high-value acquisition pipeline
 *
 * Features:
 * - Creator application & verification flow
 * - Multi-tier creator classification
 * - Regional rollout management
 * - Fraud-resistant onboarding
 * - KPI tracking & analytics
 * - Integration with PACK 277 (Wallet), 279 (AI), 300/300A (Support), 
 *   301 (Retention), 302 (Fraud), 352 (KPI), 353 (Hardening)
 *
 * @version 1.0.0
 * @section CREATOR_ECONOMY
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';

const db = getFirestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export enum InfluencerApplicationStatus {
  APPLIED = 'APPLIED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  BANNED = 'BANNED',
  UNDER_INVESTIGATION = 'UNDER_INVESTIGATION',
}

export enum CreatorTier {
  STANDARD_CREATOR = 'STANDARD_CREATOR',
  HIGH_VALUE_CREATOR = 'HIGH_VALUE_CREATOR',
  PLATFORM_STAR = 'PLATFORM_STAR',
}

export enum CreatorGender {
  FEMALE = 'FEMALE',
  MALE = 'MALE',
  AI = 'AI',
}

export enum CreatorCapability {
  PAID_CHAT = 'PAID_CHAT',
  CALLS = 'CALLS',
  CALENDAR = 'CALENDAR',
  EVENTS = 'EVENTS',
  AI_COMPANION_CREATION = 'AI_COMPANION_CREATION',
}

export interface InfluencerApplication {
  applicationId: string;
  userId: string;
  status: InfluencerApplicationStatus;

  // Personal information
  legalName: string;
  country: string;
  city: string;
  age: number;
  gender?: CreatorGender;

  // Content
  photoUrls: string[]; // 3-6 real photos, face required
  socialLinks?: {
    instagram?: string;
    tiktok?: string;
    twitter?: string;
    onlyfans?: string;
  };

  // Activity expectations
  expectedWeeklyActivity: number; // hours per week

  // Agreement
  agreedToRules: boolean;
  agreedAt?: Timestamp;

  // Metadata
  appliedAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string; // admin user ID
  reviewNotes?: string;

  // Rejection/Ban info
  rejectionReason?: string;
  banReason?: string;

  // Device & fraud tracking
  deviceInfo?: {
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
  };
}

export interface CreatorProfile {
  userId: string;
  applicationId: string;
  tier: CreatorTier;
  gender: CreatorGender;

  // Boost settings (affects discovery only, NOT payouts)
  boostMultiplier: number; // 1.0, 1.2, or 1.5

  // Enabled capabilities
  capabilities: {
    [CreatorCapability.PAID_CHAT]: boolean;
    [CreatorCapability.CALLS]: boolean;
    [CreatorCapability.CALENDAR]: boolean;
    [CreatorCapability.EVENTS]: boolean;
    [CreatorCapability.AI_COMPANION_CREATION]: boolean;
  };

  // Status flags
  kycRequired: boolean;
  kycCompleted: boolean;
  walletFrozen: boolean;

  // Safety & fraud
  safetyEscalations: number;
  identityMismatches: number;
  payoutDisputes: number;

  // Activation
  activatedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RegionalInfluencerProgram {
  programId: string;
  countryCode: string; // ISO 3166-1 alpha-2
  minimumCreatorsTarget: number;
  bonusBudgetTokens: number;
  launchDate: Timestamp;
  status: 'planned' | 'active' | 'frozen';

  // Metrics
  currentCreators: number;
  targetReached: boolean;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InfluencerKPISnapshot {
  snapshotId: string;
  creatorId: string;
  date: string; // YYYY-MM-DD format

  // Daily metrics
  dailyChats: number;
  tokensEarned: number;
  conversionRate: number; // chat opened → chat paid (0-1)
  avgSessionDuration: number; // minutes
  refundRatio: number; // 0-1

  // Retention
  retentionD1: number; // 0-1 (percentage of users who return next day)
  retentionD7: number;
  retentionD30: number;

  createdAt: Timestamp;
}

export interface CreatorRiskFlags {
  userId: string;
  flags: {
    highRefundRate?: boolean;
    suspiciousActivity?: boolean;
    multipleAccounts?: boolean;
    identityMismatch?: boolean;
    payoutAnomaly?: boolean;
  };
  riskScore: number; // 0-100
  lastCheckedAt: Timestamp;
}

// ============================================================================
// TIER CONFIGURATION
// ============================================================================

export const TIER_CONFIG = {
  [CreatorTier.STANDARD_CREATOR]: {
    boostMultiplier: 1.0,
    defaultCapabilities: {
      [CreatorCapability.PAID_CHAT]: true,
      [CreatorCapability.CALLS]: false,
      [CreatorCapability.CALENDAR]: false,
      [CreatorCapability.EVENTS]: false,
      [CreatorCapability.AI_COMPANION_CREATION]: false,
    },
  },
  [CreatorTier.HIGH_VALUE_CREATOR]: {
    boostMultiplier: 1.2,
    defaultCapabilities: {
      [CreatorCapability.PAID_CHAT]: true,
      [CreatorCapability.CALLS]: true,
      [CreatorCapability.CALENDAR]: true,
      [CreatorCapability.EVENTS]: false,
      [CreatorCapability.AI_COMPANION_CREATION]: false,
    },
  },
  [CreatorTier.PLATFORM_STAR]: {
    boostMultiplier: 1.5,
    defaultCapabilities: {
      [CreatorCapability.PAID_CHAT]: true,
      [CreatorCapability.CALLS]: true,
      [CreatorCapability.CALENDAR]: true,
      [CreatorCapability.EVENTS]: true,
      [CreatorCapability.AI_COMPANION_CREATION]: true,
    },
  },
} as const;

// Original economy rules (UNCHANGED)
export const ECONOMY_RULES = {
  chat: { creatorShare: 0.65, avaloShare: 0.35 },
  calls: { creatorShare: 0.80, avaloShare: 0.20 },
  calendar: { creatorShare: 0.80, avaloShare: 0.20 },
  events: { creatorShare: 0.80, avaloShare: 0.20 },
  tips: { creatorShare: 0.90, avaloShare: 0.10 },
  tokenPayoutRate: 0.2, // PLN per token
} as const;

// Safety thresholds
export const SAFETY_THRESHOLDS = {
  maxSafetyEscalations: 3,
  maxIdentityMismatches: 1,
  maxPayoutDisputes: 2,
} as const;

// ============================================================================
// APPLICATION MANAGEMENT
// ============================================================================

/**
 * Submit influencer application
 */
export async function submitInfluencerApplication(
  userId: string,
  data: {
    legalName: string;
    country: string;
    city: string;
    age: number;
    photoUrls: string[];
    socialLinks?: Record<string, string>;
    expectedWeeklyActivity: number;
    agreedToRules: boolean;
    deviceInfo?: Record<string, string>;
  }
): Promise<string> {
  // Validation
  if (data.age < 18) {
    throw new HttpsError('failed-precondition', 'Must be 18+ to apply');
  }

  if (data.photoUrls.length < 3 || data.photoUrls.length > 6) {
    throw new HttpsError('invalid-argument', 'Must provide 3-6 photos');
  }

  if (!data.agreedToRules) {
    throw new HttpsError('failed-precondition', 'Must agree to Avalo rules');
  }

  // Check for existing application
  const existingApp = await db
    .collection('influencerApplications')
    .where('userId', '==', userId)
    .where('status', 'in', [
      InfluencerApplicationStatus.APPLIED,
      InfluencerApplicationStatus.UNDER_REVIEW,
      InfluencerApplicationStatus.APPROVED,
    ])
    .limit(1)
    .get();

  if (!existingApp.empty) {
    throw new HttpsError('already-exists', 'Application already exists');
  }

  // Create application
  const applicationId = `app_${Date.now()}_${userId.substring(0, 8)}`;

  const application: InfluencerApplication = {
    applicationId,
    userId,
    status: InfluencerApplicationStatus.APPLIED,
    legalName: data.legalName,
    country: data.country,
    city: data.city,
    age: data.age,
    photoUrls: data.photoUrls,
    socialLinks: data.socialLinks,
    expectedWeeklyActivity: data.expectedWeeklyActivity,
    agreedToRules: data.agreedToRules,
    agreedAt: Timestamp.now(),
    appliedAt: Timestamp.now(),
    deviceInfo: data.deviceInfo,
  };

  await db.collection('influencerApplications').doc(applicationId).set(application);

  logger.info(`Influencer application submitted: ${applicationId} by user ${userId}`);

  return applicationId;
}

/**
 * Get application status
 */
export async function getApplicationStatus(
  userId: string
): Promise<InfluencerApplication | null> {
  const snapshot = await db
    .collection('influencerApplications')
    .where('userId', '==', userId)
    .orderBy('appliedAt', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data() as InfluencerApplication;
}

/**
 * Update application status (admin only)
 */
export async function updateApplicationStatus(
  applicationId: string,
  adminUserId: string,
  newStatus: InfluencerApplicationStatus,
  notes?: string,
  tier?: CreatorTier
): Promise<void> {
  const appRef = db.collection('influencerApplications').doc(applicationId);
  const appDoc = await appRef.get();

  if (!appDoc.exists) {
    throw new HttpsError('not-found', 'Application not found');
  }

  const application = appDoc.data() as InfluencerApplication;

  // Update application
  const updateData: any = {
    status: newStatus,
    reviewedAt: Timestamp.now(),
    reviewedBy: adminUserId,
    reviewNotes: notes,
  };

  if (newStatus === InfluencerApplicationStatus.REJECTED && notes) {
    updateData.rejectionReason = notes;
  }

  if (newStatus === InfluencerApplicationStatus.BANNED && notes) {
    updateData.banReason = notes;
  }

  await appRef.update(updateData);

  // If approved, create creator profile
  if (newStatus === InfluencerApplicationStatus.APPROVED) {
    await activateCreatorProfile(
      application.userId,
      applicationId,
      tier || CreatorTier.STANDARD_CREATOR,
      application.gender || CreatorGender.FEMALE
    );
  }

  logger.info(
    `Application ${applicationId} updated to ${newStatus} by admin ${adminUserId}`
  );
}

/**
 * Activate creator profile after approval
 */
async function activateCreatorProfile(
  userId: string,
  applicationId: string,
  tier: CreatorTier,
  gender: CreatorGender
): Promise<void> {
  const tierConfig = TIER_CONFIG[tier];

  const profile: CreatorProfile = {
    userId,
    applicationId,
    tier,
    gender,
    boostMultiplier: tierConfig.boostMultiplier,
    capabilities: { ...tierConfig.defaultCapabilities },
    kycRequired: false,
    kycCompleted: false,
    walletFrozen: false,
    safetyEscalations: 0,
    identityMismatches: 0,
    payoutDisputes: 0,
    activatedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await db.collection('creatorProfiles').doc(userId).set(profile);

  // Update user document with creator flag
  await db
    .collection('users')
    .doc(userId)
    .update({
      'roles.creator': true,
      'verification.status': 'approved',
      updatedAt: FieldValue.serverTimestamp(),
    });

  logger.info(`Creator profile activated for user ${userId} with tier ${tier}`);
}

// ============================================================================
// CREATOR PROFILE MANAGEMENT
// ============================================================================

/**
 * Get creator profile
 */
export async function getCreatorProfile(userId: string): Promise<CreatorProfile | null> {
  const doc = await db.collection('creatorProfiles').doc(userId).get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as CreatorProfile;
}

/**
 * Update creator tier (admin only)
 */
export async function updateCreatorTier(
  userId: string,
  newTier: CreatorTier
): Promise<void> {
  const profileRef = db.collection('creatorProfiles').doc(userId);
  const tierConfig = TIER_CONFIG[newTier];

  await profileRef.update({
    tier: newTier,
    boostMultiplier: tierConfig.boostMultiplier,
    updatedAt: Timestamp.now(),
  });

  logger.info(`Creator ${userId} tier updated to ${newTier}`);
}

/**
 * Toggle creator capability
 */
export async function toggleCreatorCapability(
  userId: string,
  capability: CreatorCapability,
  enabled: boolean
): Promise<void> {
  await db
    .collection('creatorProfiles')
    .doc(userId)
    .update({
      [`capabilities.${capability}`]: enabled,
      updatedAt: Timestamp.now(),
    });

  logger.info(`Creator ${userId} capability ${capability} set to ${enabled}`);
}

/**
 * Flag creator for investigation
 */
export async function flagCreatorForInvestigation(
  userId: string,
  reason: string
): Promise<void> {
  // Update application status
  const appSnapshot = await db
    .collection('influencerApplications')
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (!appSnapshot.empty) {
    await appSnapshot.docs[0].ref.update({
      status: InfluencerApplicationStatus.UNDER_INVESTIGATION,
      reviewNotes: reason,
      reviewedAt: Timestamp.now(),
    });
  }

  // Freeze wallet
  await db.collection('creatorProfiles').doc(userId).update({
    walletFrozen: true,
    updatedAt: Timestamp.now(),
  });

  logger.warn(`Creator ${userId} flagged for investigation: ${reason}`);
}

/**
 * Check and auto-flag creators based on safety thresholds
 */
export async function checkCreatorSafetyThresholds(userId: string): Promise<void> {
  const profile = await getCreatorProfile(userId);

  if (!profile) {
    return;
  }

  let shouldInvestigate = false;
  let reason = '';

  if (profile.safetyEscalations >= SAFETY_THRESHOLDS.maxSafetyEscalations) {
    shouldInvestigate = true;
    reason = `${profile.safetyEscalations} safety escalations`;
  } else if (profile.identityMismatches >= SAFETY_THRESHOLDS.maxIdentityMismatches) {
    shouldInvestigate = true;
    reason = `${profile.identityMismatches} identity mismatches`;
  } else if (profile.payoutDisputes >= SAFETY_THRESHOLDS.maxPayoutDisputes) {
    shouldInvestigate = true;
    reason = `${profile.payoutDisputes} payout disputes`;
  }

  if (shouldInvestigate) {
    await flagCreatorForInvestigation(userId, reason);
  }
}

// ============================================================================
// REGIONAL PROGRAM MANAGEMENT
// ============================================================================

/**
 * Create regional influencer program
 */
export async function createRegionalProgram(
  countryCode: string,
  minimumCreatorsTarget: number,
  bonusBudgetTokens: number,
  launchDate: Date
): Promise<string> {
  const programId = `prog_${countryCode}_${Date.now()}`;

  const program: RegionalInfluencerProgram = {
    programId,
    countryCode: countryCode.toUpperCase(),
    minimumCreatorsTarget,
    bonusBudgetTokens,
    launchDate: Timestamp.fromDate(launchDate),
    status: 'planned',
    currentCreators: 0,
    targetReached: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await db.collection('regionalInfluencerPrograms').doc(programId).set(program);

  logger.info(`Regional program created: ${programId} for ${countryCode}`);

  return programId;
}

/**
 * Get regional program by country
 */
export async function getRegionalProgram(
  countryCode: string
): Promise<RegionalInfluencerProgram | null> {
  const snapshot = await db
    .collection('regionalInfluencerPrograms')
    .where('countryCode', '==', countryCode.toUpperCase())
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data() as RegionalInfluencerProgram;
}

/**
 * Update regional program creator count
 */
export async function updateRegionalProgramMetrics(countryCode: string): Promise<void> {
  const program = await getRegionalProgram(countryCode);

  if (!program) {
    return;
  }

  // Count active creators in this region
  const creatorsSnapshot = await db
    .collection('influencerApplications')
    .where('country', '==', countryCode.toUpperCase())
    .where('status', '==', InfluencerApplicationStatus.APPROVED)
    .get();

  const currentCreators = creatorsSnapshot.size;
  const targetReached = currentCreators >= program.minimumCreatorsTarget;

  await db
    .collection('regionalInfluencerPrograms')
    .doc(program.programId)
    .update({
      currentCreators,
      targetReached,
      updatedAt: Timestamp.now(),
    });

  logger.info(
    `Regional program ${program.programId} updated: ${currentCreators}/${program.minimumCreatorsTarget} creators`
  );
}

// ============================================================================
// KPI TRACKING
// ============================================================================

/**
 * Record daily KPI snapshot for creator
 */
export async function recordCreatorKPISnapshot(
  creatorId: string,
  metrics: {
    dailyChats: number;
    tokensEarned: number;
    conversionRate: number;
    avgSessionDuration: number;
    refundRatio: number;
    retentionD1: number;
    retentionD7: number;
    retentionD30: number;
  }
): Promise<string> {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const snapshotId = `kpi_${creatorId}_${date.replace(/-/g, '')}`;

  const snapshot: InfluencerKPISnapshot = {
    snapshotId,
    creatorId,
    date,
    ...metrics,
    createdAt: Timestamp.now(),
  };

  await db.collection('influencerKPISnapshots').doc(snapshotId).set(snapshot);

  logger.info(`KPI snapshot recorded for creator ${creatorId} on ${date}`);

  return snapshotId;
}

/**
 * Get creator KPIs for date range
 */
export async function getCreatorKPIs(
  creatorId: string,
  startDate: string,
  endDate: string
): Promise<InfluencerKPISnapshot[]> {
  const snapshot = await db
    .collection('influencerKPISnapshots')
    .where('creatorId', '==', creatorId)
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .orderBy('date', 'desc')
    .get();

  return snapshot.docs.map((doc) => doc.data() as InfluencerKPISnapshot);
}

/**
 * Calculate creator risk score
 */
export async function calculateCreatorRiskScore(userId: string): Promise<number> {
  const profile = await getCreatorProfile(userId);

  if (!profile) {
    return 0;
  }

  let riskScore = 0;

  // Safety escalations (up to 30 points)
  riskScore += Math.min(profile.safetyEscalations * 10, 30);

  // Identity mismatches (up to 20 points)
  riskScore += Math.min(profile.identityMismatches * 20, 20);

  // Payout disputes (up to 20 points)
  riskScore += Math.min(profile.payoutDisputes * 10, 20);

  // Recent KPIs
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const kpis = await getCreatorKPIs(userId, weekAgo, today);

  if (kpis.length > 0) {
    const avgRefundRatio =
      kpis.reduce((sum, k) => sum + k.refundRatio, 0) / kpis.length;

    // High refund ratio (up to 30 points)
    if (avgRefundRatio > 0.2) {
      riskScore += 30;
    } else if (avgRefundRatio > 0.1) {
      riskScore += 15;
    }
  }

  return Math.min(riskScore, 100);
}

/**
 * Update creator risk flags
 */
export async function updateCreatorRiskFlags(userId: string): Promise<void> {
  const riskScore = await calculateCreatorRiskScore(userId);

  const flags: CreatorRiskFlags = {
    userId,
    flags: {},
    riskScore,
    lastCheckedAt: Timestamp.now(),
  };

  const profile = await getCreatorProfile(userId);

  if (profile) {
    if (profile.identityMismatches > 0) {
      flags.flags.identityMismatch = true;
    }
    if (profile.safetyEscalations >= 2) {
      flags.flags.suspiciousActivity = true;
    }
    if (profile.payoutDisputes >= 2) {
      flags.flags.payoutAnomaly = true;
    }
  }

  // Check for recent high refund rate
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const kpis = await getCreatorKPIs(userId, weekAgo, today);

  if (kpis.length > 0) {
    const avgRefundRatio =
      kpis.reduce((sum, k) => sum + k.refundRatio, 0) / kpis.length;

    if (avgRefundRatio > 0.15) {
      flags.flags.highRefundRate = true;
    }
  }

  await db.collection('creatorRiskFlags').doc(userId).set(flags);

  logger.info(`Risk flags updated for creator ${userId}: score ${riskScore}`);
}

logger.info('✅ PACK 354 Influencer Service loaded successfully');
