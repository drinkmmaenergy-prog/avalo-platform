/**
 * PACK 115 — Public Reputation & Trust Score Engine
 * Core calculation and scoring logic
 * 
 * NON-NEGOTIABLE RULES:
 * - ALL calculations are internal only
 * - Only public reputation level is exposed to clients
 * - NO influence on ranking, monetization, or earnings
 * - Abuse detection is automatic and enforced
 */

import { db, serverTimestamp, generateId } from './init';
import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';
import {
  UserReputationScore,
  ReputationLevel,
  ReputationInputEvent,
  ReputationAuditLog,
  ReputationAbuseAttempt,
  getReputationLevelFromScore,
  isScoreChangeSuspicious,
} from './pack115-types';
import { logBusinessAudit } from './pack105-audit-logger';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTIONS = {
  REPUTATION_SCORES: 'user_reputation_scores',
  REPUTATION_EVENTS: 'reputation_input_events',
  REPUTATION_AUDIT: 'reputation_audit_logs',
  REPUTATION_ABUSE: 'reputation_abuse_attempts',
  REPUTATION_DISPLAY: 'user_reputation_display_settings',
  TRUST_PROFILE: 'user_trust_profile',
  KYC_STATUS: 'user_kyc_status',
  USER_PROFILES: 'users',
} as const;

// Score component weights (total target: ~950 for excellent behavior)
const SCORE_WEIGHTS = {
  identityVerification: {
    none: 0,
    selfieOnly: 50,
    kycPending: 100,
    kycVerified: 200,
  },
  profileCompleteness: {
    empty: 0,
    partial: 50,
    complete: 100,
  },
  responsiveness: {
    excellent: 100, // >80% response rate
    good: 75,       // 60-80%
    fair: 50,       // 40-60%
    poor: 25,       // 20-40%
    none: 0,        // <20%
  },
  conversationQuality: {
    excellent: 150, // High positive engagement
    good: 100,
    fair: 50,
    poor: 0,
  },
  reportRatio: {
    excellent: 150, // <1% report ratio
    good: 100,      // 1-3%
    fair: 50,       // 3-5%
    poor: 0,        // >5%
  },
  safetyCompliance: {
    clean: 200,     // No violations
    minor: 100,     // Minor violations resolved
    moderate: 50,   // Some violations
    serious: 0,     // Serious violations
  },
  accountLongevity: {
    veryNew: 20,    // <7 days
    new: 40,        // 7-30 days
    established: 60, // 30-90 days
    mature: 80,     // 90-180 days
    veteran: 100,   // >180 days
  },
};

// Penalty values (applied as negative points)
const PENALTIES = {
  confirmedViolation: 50,
  spamFlag: 30,
  hostilityFlag: 40,
  nsfwViolation: 60,
  chargebackAttempt: 100,
  multiAccountAbuse: 150,
};

// ============================================================================
// CORE CALCULATION
// ============================================================================

/**
 * Calculate reputation score for a user
 * Returns score between 0-1000, NEVER shown directly to users
 */
export async function calculateReputationScore(userId: string): Promise<UserReputationScore> {
  try {
    logger.info(`[Reputation] Calculating score for user ${userId}`);

    // Fetch all required data
    const [trustProfile, kycStatus, userProfile, previousScore] = await Promise.all([
      getTrustProfile(userId),
      getKycStatus(userId),
      getUserProfile(userId),
      getPreviousScore(userId),
    ]);

    // Calculate positive components
    const components = {
      identityVerification: calculateIdentityScore(kycStatus, userProfile),
      profileCompleteness: calculateProfileCompletenessScore(userProfile),
      responsiveness: calculateResponsivenessScore(userProfile),
      conversationQuality: calculateConversationQualityScore(trustProfile),
      reportRatio: calculateReportRatioScore(trustProfile),
      safetyCompliance: calculateSafetyComplianceScore(trustProfile),
      accountLongevity: calculateAccountLongevityScore(userProfile),
    };

    // Calculate penalties
    const penalties = {
      confirmedViolations: (trustProfile?.violationCount || 0) * PENALTIES.confirmedViolation,
      spamFlags: (trustProfile?.spamFlagCount || 0) * PENALTIES.spamFlag,
      hostilityFlags: (trustProfile?.hostilityFlagCount || 0) * PENALTIES.hostilityFlag,
      nsfwViolations: (trustProfile?.nsfwViolationCount || 0) * PENALTIES.nsfwViolation,
      chargebackAttempts: (trustProfile?.chargebackCount || 0) * PENALTIES.chargebackAttempt,
      multiAccountAbuse: (trustProfile?.multiAccountFlags || 0) * PENALTIES.multiAccountAbuse,
    };

    // Sum components
    const positiveScore = Object.values(components).reduce((sum, val) => sum + val, 0);
    const penaltyScore = Object.values(penalties).reduce((sum, val) => sum + val, 0);

    // Calculate final score (clamped to 0-1000)
    const rawScore = positiveScore - penaltyScore;
    const internalScore = Math.max(0, Math.min(1000, rawScore));

    // Map to public level
    const publicLevel = getReputationLevelFromScore(internalScore);

    // Detect abuse if score changed too rapidly
    const abuseDetection = await detectScoreAbuse(
      userId,
      previousScore?.internalScore || 500, // default to middle if new
      internalScore,
      previousScore?.calculatedAt
    );

    const reputationScore: UserReputationScore = {
      userId,
      internalScore,
      publicLevel,
      components,
      penalties,
      calculatedAt: serverTimestamp() as Timestamp,
      lastUpdatedAt: serverTimestamp() as Timestamp,
      version: 1, // Algorithm version
      abuseDetection,
    };

    // Save score
    await db.collection(COLLECTIONS.REPUTATION_SCORES).doc(userId).set(reputationScore);

    // Log audit trail if score changed significantly
    if (previousScore && Math.abs(previousScore.internalScore - internalScore) > 10) {
      await logReputationChange(userId, previousScore, reputationScore);
    }

    // Log to business audit
    await logBusinessAudit({
      eventType: 'REPUTATION_SCORE_UPDATE',
      userId,
      context: {
        previousScore: previousScore?.internalScore,
        newScore: internalScore,
        previousLevel: previousScore?.publicLevel,
        newLevel: publicLevel,
      },
      source: 'reputation_engine',
    });

    logger.info(`[Reputation] Score calculated for user ${userId}: ${internalScore} (${publicLevel})`);

    return reputationScore;
  } catch (error: any) {
    logger.error(`[Reputation] Error calculating score for user ${userId}:`, error);
    throw error;
  }
}

// ============================================================================
// COMPONENT CALCULATIONS
// ============================================================================

function calculateIdentityScore(kycStatus: any, userProfile: any): number {
  if (!kycStatus && !userProfile) return SCORE_WEIGHTS.identityVerification.none;
  
  if (kycStatus?.status === 'VERIFIED') {
    return SCORE_WEIGHTS.identityVerification.kycVerified;
  }
  
  if (kycStatus?.status === 'PENDING' || kycStatus?.status === 'IN_REVIEW') {
    return SCORE_WEIGHTS.identityVerification.kycPending;
  }
  
  if (userProfile?.selfieVerified) {
    return SCORE_WEIGHTS.identityVerification.selfieOnly;
  }
  
  return SCORE_WEIGHTS.identityVerification.none;
}

function calculateProfileCompletenessScore(userProfile: any): number {
  if (!userProfile) return SCORE_WEIGHTS.profileCompleteness.empty;
  
  let completenessFields = 0;
  const requiredFields = ['displayName', 'bio', 'profilePhoto', 'age', 'gender'];
  
  for (const field of requiredFields) {
    if (userProfile[field]) completenessFields++;
  }
  
  const completenessRatio = completenessFields / requiredFields.length;
  
  if (completenessRatio >= 0.8) return SCORE_WEIGHTS.profileCompleteness.complete;
  if (completenessRatio >= 0.4) return SCORE_WEIGHTS.profileCompleteness.partial;
  return SCORE_WEIGHTS.profileCompleteness.empty;
}

function calculateResponsivenessScore(userProfile: any): number {
  const responseRate = userProfile?.messageResponseRate || 0;
  
  if (responseRate >= 0.8) return SCORE_WEIGHTS.responsiveness.excellent;
  if (responseRate >= 0.6) return SCORE_WEIGHTS.responsiveness.good;
  if (responseRate >= 0.4) return SCORE_WEIGHTS.responsiveness.fair;
  if (responseRate >= 0.2) return SCORE_WEIGHTS.responsiveness.poor;
  return SCORE_WEIGHTS.responsiveness.none;
}

function calculateConversationQualityScore(trustProfile: any): number {
  if (!trustProfile) return SCORE_WEIGHTS.conversationQuality.fair;
  
  // Positive engagement indicators
  const positiveRatio = trustProfile.positiveInteractionRatio || 0.5;
  
  if (positiveRatio >= 0.8) return SCORE_WEIGHTS.conversationQuality.excellent;
  if (positiveRatio >= 0.6) return SCORE_WEIGHTS.conversationQuality.good;
  if (positiveRatio >= 0.4) return SCORE_WEIGHTS.conversationQuality.fair;
  return SCORE_WEIGHTS.conversationQuality.poor;
}

function calculateReportRatioScore(trustProfile: any): number {
  if (!trustProfile) return SCORE_WEIGHTS.reportRatio.good;
  
  const reportRatio = trustProfile.reportRatio || 0;
  
  if (reportRatio < 0.01) return SCORE_WEIGHTS.reportRatio.excellent;
  if (reportRatio < 0.03) return SCORE_WEIGHTS.reportRatio.good;
  if (reportRatio < 0.05) return SCORE_WEIGHTS.reportRatio.fair;
  return SCORE_WEIGHTS.reportRatio.poor;
}

function calculateSafetyComplianceScore(trustProfile: any): number {
  if (!trustProfile) return SCORE_WEIGHTS.safetyCompliance.clean;
  
  const violationCount = trustProfile.violationCount || 0;
  const seriousViolations = trustProfile.seriousViolationCount || 0;
  
  if (seriousViolations > 0) return SCORE_WEIGHTS.safetyCompliance.serious;
  if (violationCount === 0) return SCORE_WEIGHTS.safetyCompliance.clean;
  if (violationCount <= 2) return SCORE_WEIGHTS.safetyCompliance.minor;
  return SCORE_WEIGHTS.safetyCompliance.moderate;
}

function calculateAccountLongevityScore(userProfile: any): number {
  if (!userProfile?.createdAt) return SCORE_WEIGHTS.accountLongevity.veryNew;
  
  const accountAge = Date.now() - userProfile.createdAt.toMillis();
  const daysSinceCreation = accountAge / (1000 * 60 * 60 * 24);
  
  if (daysSinceCreation > 180) return SCORE_WEIGHTS.accountLongevity.veteran;
  if (daysSinceCreation > 90) return SCORE_WEIGHTS.accountLongevity.mature;
  if (daysSinceCreation > 30) return SCORE_WEIGHTS.accountLongevity.established;
  if (daysSinceCreation > 7) return SCORE_WEIGHTS.accountLongevity.new;
  return SCORE_WEIGHTS.accountLongevity.veryNew;
}

// ============================================================================
// ABUSE DETECTION
// ============================================================================

async function detectScoreAbuse(
  userId: string,
  previousScore: number,
  newScore: number,
  previousCalculatedAt?: Timestamp
): Promise<UserReputationScore['abuseDetection']> {
  const abuseDetection: UserReputationScore['abuseDetection'] = {
    rapidScoreChanges: 0,
    crossDeviceAnomalies: false,
    campaignManipulationDetected: false,
  };

  if (!previousCalculatedAt) {
    return abuseDetection; // First calculation, no abuse possible
  }

  // Check for rapid score changes
  const timeSinceLastCalc = Date.now() - previousCalculatedAt.toMillis();
  const minutesSinceLastCalc = timeSinceLastCalc / (1000 * 60);

  if (isScoreChangeSuspicious(previousScore, newScore, minutesSinceLastCalc)) {
    abuseDetection.rapidScoreChanges = 1;
    abuseDetection.lastRapidChangeAt = serverTimestamp() as Timestamp;

    // Log abuse attempt
    await logAbuseAttempt(userId, 'RAPID_SCORE_MANIPULATION', {
      previousScore,
      newScore,
      timWindowMinutes: minutesSinceLastCalc,
      change: Math.abs(newScore - previousScore),
    });

    logger.warn(`[Reputation] Suspicious score change detected for user ${userId}`);
  }

  return abuseDetection;
}

async function logAbuseAttempt(
  userId: string,
  pattern: ReputationAbuseAttempt['pattern'],
  evidence: any
): Promise<void> {
  try {
    const abuseAttempt: ReputationAbuseAttempt = {
      attemptId: generateId(),
      userId,
      pattern,
      evidence,
      detectedAt: serverTimestamp() as Timestamp,
      confidenceScore: 0.8, // High confidence for rapid changes
      actionTaken: 'FLAGGED',
    };

    await db.collection(COLLECTIONS.REPUTATION_ABUSE).add(abuseAttempt);

    // Also log to business audit for compliance
    await logBusinessAudit({
      eventType: 'REPUTATION_SCORE_UPDATE',
      userId,
      context: {
        abusePattern: pattern,
        evidence,
        action: 'FLAGGED_FOR_REVIEW',
      },
      source: 'reputation_abuse_detection',
    });
  } catch (error: any) {
    logger.error('[Reputation] Error logging abuse attempt:', error);
    // Don't throw - abuse logging failure shouldn't fail calculation
  }
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

async function logReputationChange(
  userId: string,
  previousScore: UserReputationScore,
  newScore: UserReputationScore
): Promise<void> {
  try {
    const auditLog: ReputationAuditLog = {
      logId: generateId(),
      userId,
      previousScore: previousScore.internalScore,
      newScore: newScore.internalScore,
      previousLevel: previousScore.publicLevel,
      newLevel: newScore.publicLevel,
      trigger: 'DAILY_RECALCULATION',
      calculatedAt: serverTimestamp() as Timestamp,
    };

    await db.collection(COLLECTIONS.REPUTATION_AUDIT).add(auditLog);
  } catch (error: any) {
    logger.error('[Reputation] Error logging audit:', error);
    // Don't throw - audit failure shouldn't fail calculation
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getTrustProfile(userId: string): Promise<any> {
  try {
    const doc = await db.collection(COLLECTIONS.TRUST_PROFILE).doc(userId).get();
    return doc.exists ? doc.data() : null;
  } catch (error) {
    logger.error(`[Reputation] Error fetching trust profile for ${userId}:`, error);
    return null;
  }
}

async function getKycStatus(userId: string): Promise<any> {
  try {
    const doc = await db.collection(COLLECTIONS.KYC_STATUS).doc(userId).get();
    return doc.exists ? doc.data() : null;
  } catch (error) {
    logger.error(`[Reputation] Error fetching KYC status for ${userId}:`, error);
    return null;
  }
}

async function getUserProfile(userId: string): Promise<any> {
  try {
    const doc = await db.collection(COLLECTIONS.USER_PROFILES).doc(userId).get();
    return doc.exists ? doc.data() : null;
  } catch (error) {
    logger.error(`[Reputation] Error fetching user profile for ${userId}:`, error);
    return null;
  }
}

async function getPreviousScore(userId: string): Promise<UserReputationScore | null> {
  try {
    const doc = await db.collection(COLLECTIONS.REPUTATION_SCORES).doc(userId).get();
    return doc.exists ? (doc.data() as UserReputationScore) : null;
  } catch (error) {
    logger.error(`[Reputation] Error fetching previous score for ${userId}:`, error);
    return null;
  }
}

// ============================================================================
// PUBLIC EXPORTS
// ============================================================================

/**
 * Get public reputation profile for a user (safe for clients)
 */
export async function getPublicReputationProfile(userId: string): Promise<any> {
  try {
    const [scoreDoc, displayDoc] = await Promise.all([
      db.collection(COLLECTIONS.REPUTATION_SCORES).doc(userId).get(),
      db.collection(COLLECTIONS.REPUTATION_DISPLAY).doc(userId).get(),
    ]);

    if (!scoreDoc.exists) {
      // No score yet, return default
      return {
        userId,
        level: 'MODERATE',
        levelLabel: 'Moderate',
        levelDescription: 'New member',
        levelColor: '#6B7280',
        levelIcon: '✓',
        displayBadge: true,
        disclaimer: {
          doesNotAffect: [
            'Premium Membership does not affect trust',
            'Spending tokens does not affect trust',
            'Earnings do not affect trust',
          ],
          basedOn: [
            'Identity verification',
            'Respectful conduct',
            'Safety compliance',
          ],
        },
        lastUpdatedAt: serverTimestamp(),
      };
    }

    const score = scoreDoc.data() as UserReputationScore;
    const displaySettings = displayDoc.exists ? displayDoc.data() : { displayBadge: true };

    const { REPUTATION_LEVELS } = await import('./pack115-types');
    const levelConfig = REPUTATION_LEVELS[score.publicLevel];

    return {
      userId,
      level: score.publicLevel,
      levelLabel: levelConfig.label,
      levelDescription: levelConfig.description,
      levelColor: levelConfig.color,
      levelIcon: levelConfig.icon,
      displayBadge: displaySettings.displayBadge !== false,
      disclaimer: {
        doesNotAffect: [
          'Premium Membership does not affect trust',
          'Spending tokens does not affect trust',
          'Earnings do not affect trust',
          'Number of messages does not affect trust',
        ],
        basedOn: [
          'Identity verification',
          'Profile completeness',
          'Respectful conduct',
          'Safety compliance',
        ],
      },
      lastUpdatedAt: score.lastUpdatedAt,
    };
  } catch (error: any) {
    logger.error(`[Reputation] Error getting public profile for ${userId}:`, error);
    throw error;
  }
}

/**
 * Get internal reputation score (admin/staff only)
 */
export async function getInternalReputationScore(userId: string): Promise<UserReputationScore | null> {
  try {
    const doc = await db.collection(COLLECTIONS.REPUTATION_SCORES).doc(userId).get();
    return doc.exists ? (doc.data() as UserReputationScore) : null;
  } catch (error: any) {
    logger.error(`[Reputation] Error getting internal score for ${userId}:`, error);
    throw error;
  }
}