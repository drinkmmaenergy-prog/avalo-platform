/**
 * PACK 130 — Risk Profile Evaluation System
 * 
 * Classifies users into risk levels based on persistent behavior patterns
 * Triggers appropriate actions (consent revalidation, shields, review, lockdown)
 */

import { db } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  RiskProfileLevel,
  PatrolRiskProfile,
  RiskProfileChange,
  BehaviorPattern,
  EvaluateRiskProfileInput,
  EvaluateRiskProfileOutput,
  DEFAULT_PATROL_CONFIG,
} from './types/pack130-types';
import { detectBehaviorPatterns } from './pack130-patrol-engine';
import { pauseConsent } from './pack126-consent-protocol';
import { activateHarassmentShield } from './pack126-harassment-shield';

const RISK_PROFILE_COLLECTION = 'patrol_risk_profiles';

// ============================================================================
// RISK PROFILE EVALUATION
// ============================================================================

/**
 * Evaluate and update user's risk profile
 */
export async function evaluateRiskProfile(
  input: EvaluateRiskProfileInput
): Promise<EvaluateRiskProfileOutput> {
  const { userId, includeHistory = false } = input;
  
  console.log(`[Risk Profile] Evaluating risk for user ${userId}`);
  
  // Get existing profile
  const existingProfile = await getRiskProfile(userId);
  
  // Detect behavior patterns
  const patterns = await detectBehaviorPatterns(userId, 12);
  
  // Calculate new risk score
  const riskScore = calculateRiskScore(patterns);
  const riskLevel = determineRiskLevel(riskScore);
  const confidenceLevel = calculateConfidence(patterns);
  
  // Determine active flags
  const activeFlags = generateRiskFlags(patterns, riskScore);
  
  // Determine triggers
  const triggers = determineTriggers(riskLevel, riskScore, patterns);
  
  // Check if escalation is needed
  const shouldEscalate = existingProfile
    ? shouldEscalateRisk(existingProfile.riskLevel, riskLevel)
    : false;
  
  // Recommended actions
  const recommendedActions = generateRecommendedActions(
    riskLevel,
    triggers,
    shouldEscalate
  );
  
  // Update or create profile
  if (existingProfile) {
    await updateRiskProfile(userId, {
      riskLevel,
      riskScore,
      confidenceLevel,
      patterns,
      activeFlags,
      triggers,
      fromLevel: existingProfile.riskLevel,
    });
  } else {
    await createRiskProfile(userId, {
      riskLevel,
      riskScore,
      confidenceLevel,
      patterns,
      activeFlags,
      triggers,
    });
  }
  
  console.log(`[Risk Profile] User ${userId} risk level: ${riskLevel} (score: ${riskScore})`);
  
  return {
    riskLevel,
    riskScore,
    shouldEscalate,
    recommendedActions,
  };
}

/**
 * Calculate risk score from behavior patterns
 */
function calculateRiskScore(patterns: BehaviorPattern[]): number {
  if (patterns.length === 0) return 0;
  
  const weights: Record<string, number> = {
    'HARASSMENT_CYCLE': 25,
    'NSFW_BYPASS_ATTEMPT': 20,
    'BAN_EVASION': 40,
    'DECEPTIVE_MONETIZATION': 15,
    'PIRACY_ATTEMPT': 20,
    'MULTI_ACCOUNT_ABUSE': 30,
    'CONSENT_VIOLATION': 25,
    'PAYMENT_FRAUD': 35,
    'LOCATION_STALKING': 30,
    'COORDINATED_ATTACK': 35,
  };
  
  let totalScore = 0;
  
  for (const pattern of patterns) {
    const baseWeight = weights[pattern.patternType] || 10;
    
    // Adjust for frequency
    let frequencyMultiplier = 1.0;
    if (pattern.frequency >= 10) frequencyMultiplier = 2.0;
    else if (pattern.frequency >= 5) frequencyMultiplier = 1.5;
    else if (pattern.frequency >= 3) frequencyMultiplier = 1.2;
    
    // Adjust for trend
    let trendMultiplier = 1.0;
    if (pattern.trend === 'WORSENING') trendMultiplier = 1.5;
    else if (pattern.trend === 'IMPROVING') trendMultiplier = 0.7;
    
    // Adjust for recency
    const daysSinceLastOccurrence = Math.floor(
      (Date.now() - pattern.lastOccurrence.toMillis()) / (1000 * 60 * 60 * 24)
    );
    let recencyMultiplier = 1.0;
    if (daysSinceLastOccurrence < 7) recencyMultiplier = 1.3;
    else if (daysSinceLastOccurrence < 30) recencyMultiplier = 1.1;
    else if (daysSinceLastOccurrence > 180) recencyMultiplier = 0.8;
    
    const patternScore = baseWeight * frequencyMultiplier * trendMultiplier * recencyMultiplier;
    totalScore += patternScore;
  }
  
  // Cap at 100
  return Math.min(totalScore, 100);
}

/**
 * Determine risk level from score
 */
function determineRiskLevel(riskScore: number): RiskProfileLevel {
  const thresholds = DEFAULT_PATROL_CONFIG.riskThresholds;
  
  if (riskScore >= thresholds.critical) return 'RISK_CRITICAL';
  if (riskScore >= thresholds.severe) return 'RISK_SEVERE';
  if (riskScore >= thresholds.escalation) return 'RISK_ESCALATION';
  if (riskScore >= thresholds.monitor) return 'RISK_MONITOR';
  return 'RISK_NONE';
}

/**
 * Calculate confidence in risk assessment
 */
function calculateConfidence(patterns: BehaviorPattern[]): number {
  if (patterns.length === 0) return 0;
  
  // More patterns = higher confidence
  let confidence = Math.min(patterns.length / 5, 1.0);
  
  // Recent patterns increase confidence
  const recentPatterns = patterns.filter(p => {
    const daysSince = Math.floor(
      (Date.now() - p.lastOccurrence.toMillis()) / (1000 * 60 * 60 * 24)
    );
    return daysSince < 30;
  });
  
  if (recentPatterns.length > 0) {
    confidence = Math.min(confidence + 0.2, 1.0);
  }
  
  return confidence;
}

/**
 * Generate risk flags for the profile
 */
function generateRiskFlags(patterns: BehaviorPattern[], riskScore: number): string[] {
  const flags: string[] = [];
  
  // Add flags based on patterns
  for (const pattern of patterns) {
    if (pattern.frequency >= 3) {
      flags.push(`REPEATED_${pattern.patternType}`);
    }
    
    if (pattern.trend === 'WORSENING') {
      flags.push(`ESCALATING_${pattern.patternType}`);
    }
  }
  
  // Add flags based on overall risk
  if (riskScore >= 75) {
    flags.push('HIGH_RISK_USER');
  }
  
  if (riskScore >= 90) {
    flags.push('IMMEDIATE_THREAT');
  }
  
  return flags;
}

/**
 * Determine which triggers should be enabled
 */
function determineTriggers(
  riskLevel: RiskProfileLevel,
  riskScore: number,
  patterns: BehaviorPattern[]
): {
  canTriggerConsentRevalidation: boolean;
  canTriggerHarassmentShield: boolean;
  canTriggerModeratorReview: boolean;
  canTriggerForcedKYC: boolean;
  canTriggerAccountLockdown: boolean;
} {
  const hasHarassmentPattern = patterns.some(p =>
    p.patternType === 'HARASSMENT_CYCLE' || p.patternType === 'CONSENT_VIOLATION'
  );
  
  const hasFraudPattern = patterns.some(p =>
    p.patternType === 'PAYMENT_FRAUD' || p.patternType === 'DECEPTIVE_MONETIZATION'
  );
  
  const hasEvasionPattern = patterns.some(p =>
    p.patternType === 'BAN_EVASION' || p.patternType === 'MULTI_ACCOUNT_ABUSE'
  );
  
  return {
    canTriggerConsentRevalidation: riskLevel === 'RISK_ESCALATION' || riskLevel === 'RISK_SEVERE' || riskLevel === 'RISK_CRITICAL',
    canTriggerHarassmentShield: hasHarassmentPattern && (riskLevel === 'RISK_SEVERE' || riskLevel === 'RISK_CRITICAL'),
    canTriggerModeratorReview: riskLevel === 'RISK_ESCALATION' || riskLevel === 'RISK_SEVERE' || riskLevel === 'RISK_CRITICAL',
    canTriggerForcedKYC: hasFraudPattern && (riskLevel === 'RISK_SEVERE' || riskLevel === 'RISK_CRITICAL'),
    canTriggerAccountLockdown: riskLevel === 'RISK_CRITICAL' || hasEvasionPattern,
  };
}

/**
 * Check if risk should be escalated
 */
function shouldEscalateRisk(
  currentLevel: RiskProfileLevel,
  newLevel: RiskProfileLevel
): boolean {
  const levelOrder: RiskProfileLevel[] = [
    'RISK_NONE',
    'RISK_MONITOR',
    'RISK_ESCALATION',
    'RISK_SEVERE',
    'RISK_CRITICAL',
  ];
  
  const currentIndex = levelOrder.indexOf(currentLevel);
  const newIndex = levelOrder.indexOf(newLevel);
  
  return newIndex > currentIndex;
}

/**
 * Generate recommended actions
 */
function generateRecommendedActions(
  riskLevel: RiskProfileLevel,
  triggers: ReturnType<typeof determineTriggers>,
  shouldEscalate: boolean
): string[] {
  const actions: string[] = [];
  
  if (triggers.canTriggerConsentRevalidation) {
    actions.push('REVALIDATE_CONSENT');
  }
  
  if (triggers.canTriggerHarassmentShield) {
    actions.push('ACTIVATE_HARASSMENT_SHIELD');
  }
  
  if (triggers.canTriggerModeratorReview) {
    actions.push('QUEUE_FOR_MODERATOR_REVIEW');
  }
  
  if (triggers.canTriggerForcedKYC) {
    actions.push('REQUIRE_KYC_VERIFICATION');
  }
  
  if (triggers.canTriggerAccountLockdown) {
    actions.push('LOCK_ACCOUNT');
  }
  
  if (shouldEscalate) {
    actions.push('CREATE_SAFETY_CASE');
  }
  
  return actions;
}

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================

/**
 * Create new risk profile
 */
async function createRiskProfile(
  userId: string,
  data: {
    riskLevel: RiskProfileLevel;
    riskScore: number;
    confidenceLevel: number;
    patterns: BehaviorPattern[];
    activeFlags: string[];
    triggers: ReturnType<typeof determineTriggers>;
  }
): Promise<void> {
  const profile: PatrolRiskProfile = {
    userId,
    riskLevel: data.riskLevel,
    riskScore: data.riskScore,
    confidenceLevel: data.confidenceLevel,
    detectedPatterns: data.patterns,
    activeFlags: data.activeFlags,
    canTriggerConsentRevalidation: data.triggers.canTriggerConsentRevalidation,
    canTriggerHarassmentShield: data.triggers.canTriggerHarassmentShield,
    canTriggerModeratorReview: data.triggers.canTriggerModeratorReview,
    canTriggerForcedKYC: data.triggers.canTriggerForcedKYC,
    canTriggerAccountLockdown: data.triggers.canTriggerAccountLockdown,
    createdAt: Timestamp.now(),
    lastUpdatedAt: Timestamp.now(),
    riskHistory: [],
  };
  
  await db.collection(RISK_PROFILE_COLLECTION).doc(userId).set(profile);
}

/**
 * Update existing risk profile
 */
async function updateRiskProfile(
  userId: string,
  data: {
    riskLevel: RiskProfileLevel;
    riskScore: number;
    confidenceLevel: number;
    patterns: BehaviorPattern[];
    activeFlags: string[];
    triggers: ReturnType<typeof determineTriggers>;
    fromLevel: RiskProfileLevel;
  }
): Promise<void> {
  const change: RiskProfileChange = {
    fromLevel: data.fromLevel,
    toLevel: data.riskLevel,
    changedAt: Timestamp.now(),
    reason: `Risk score updated to ${data.riskScore}`,
    triggeredBy: 'PATTERN_DETECTION',
  };
  
  await db.collection(RISK_PROFILE_COLLECTION).doc(userId).update({
    riskLevel: data.riskLevel,
    riskScore: data.riskScore,
    confidenceLevel: data.confidenceLevel,
    detectedPatterns: data.patterns,
    activeFlags: data.activeFlags,
    canTriggerConsentRevalidation: data.triggers.canTriggerConsentRevalidation,
    canTriggerHarassmentShield: data.triggers.canTriggerHarassmentShield,
    canTriggerModeratorReview: data.triggers.canTriggerModeratorReview,
    canTriggerForcedKYC: data.triggers.canTriggerForcedKYC,
    canTriggerAccountLockdown: data.triggers.canTriggerAccountLockdown,
    lastUpdatedAt: Timestamp.now(),
    ...(shouldEscalateRisk(data.fromLevel, data.riskLevel) && {
      lastEscalatedAt: Timestamp.now(),
    }),
    riskHistory: FieldValue.arrayUnion(change),
  });
}

/**
 * Get risk profile for a user
 */
export async function getRiskProfile(userId: string): Promise<PatrolRiskProfile | null> {
  const doc = await db.collection(RISK_PROFILE_COLLECTION).doc(userId).get();
  
  if (!doc.exists) {
    return null;
  }
  
  return doc.data() as PatrolRiskProfile;
}

/**
 * Get all users at specific risk level
 */
export async function getUsersByRiskLevel(
  riskLevel: RiskProfileLevel,
  limit: number = 100
): Promise<PatrolRiskProfile[]> {
  const snapshot = await db.collection(RISK_PROFILE_COLLECTION)
    .where('riskLevel', '==', riskLevel)
    .orderBy('riskScore', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as PatrolRiskProfile);
}

/**
 * Get users with specific trigger enabled
 */
export async function getUsersWithTrigger(
  triggerType: keyof Pick<
    PatrolRiskProfile,
    'canTriggerConsentRevalidation' |
    'canTriggerHarassmentShield' |
    'canTriggerModeratorReview' |
    'canTriggerForcedKYC' |
    'canTriggerAccountLockdown'
  >
): Promise<PatrolRiskProfile[]> {
  const snapshot = await db.collection(RISK_PROFILE_COLLECTION)
    .where(triggerType, '==', true)
    .limit(100)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as PatrolRiskProfile);
}

// ============================================================================
// AUTOMATED ACTIONS
// ============================================================================

/**
 * Execute automated actions based on risk profile
 */
export async function executeRiskProfileActions(
  userId: string,
  profile: PatrolRiskProfile
): Promise<{ actionsExecuted: string[] }> {
  const actionsExecuted: string[] = [];
  
  // Consent revalidation for all counterparts
  if (profile.canTriggerConsentRevalidation) {
    await triggerConsentRevalidation(userId);
    actionsExecuted.push('CONSENT_REVALIDATION_TRIGGERED');
  }
  
  // Create moderation case
  if (profile.canTriggerModeratorReview) {
    await createRiskReviewCase(userId, profile);
    actionsExecuted.push('MODERATOR_REVIEW_QUEUED');
  }
  
  // Lock account if critical
  if (profile.canTriggerAccountLockdown && profile.riskLevel === 'RISK_CRITICAL') {
    await lockHighRiskAccount(userId);
    actionsExecuted.push('ACCOUNT_LOCKED');
  }
  
  return { actionsExecuted };
}

/**
 * Trigger consent revalidation for all user's connections
 */
async function triggerConsentRevalidation(userId: string): Promise<void> {
  // Get all active consents
  const consents = await db.collection('user_consent_records')
    .where('userId', '==', userId)
    .where('state', '==', 'ACTIVE_CONSENT')
    .get();
  
  // Pause each consent (requires revalidation)
  for (const consentDoc of consents.docs) {
    const consent = consentDoc.data();
    await pauseConsent(
      consent.userId,
      consent.counterpartId,
      'SYSTEM',
      'Risk assessment requires consent revalidation'
    );
  }
  
  console.log(`[Risk Profile] Triggered consent revalidation for ${consents.size} connections of user ${userId}`);
}

/**
 * Create moderation case for risk review
 */
async function createRiskReviewCase(userId: string, profile: PatrolRiskProfile): Promise<string> {
  const caseData = {
    subjectUserId: userId,
    category: 'RISK_REVIEW',
    priority: profile.riskLevel === 'RISK_CRITICAL' ? 'CRITICAL' : profile.riskLevel === 'RISK_SEVERE' ? 'VERY_HIGH' : 'HIGH',
    status: 'PENDING',
    createdAt: Timestamp.now(),
    source: 'RISK_PROFILE_SYSTEM',
    details: {
      riskLevel: profile.riskLevel,
      riskScore: profile.riskScore,
      patterns: profile.detectedPatterns.map(p => ({
        type: p.patternType,
        frequency: p.frequency,
        trend: p.trend,
      })),
      activeFlags: profile.activeFlags,
    },
  };
  
  const caseRef = await db.collection('patrol_cases').add(caseData);
  return caseRef.id;
}

/**
 * Lock high-risk account
 */
async function lockHighRiskAccount(userId: string): Promise<void> {
  await db.collection('user_enforcement_state').doc(userId).set({
    accountStatus: 'HARD_RESTRICTED',
    reasonCodes: ['HIGH_RISK_PROFILE'],
    restrictedAt: Timestamp.now(),
    requiresManualReview: true,
  }, { merge: true });
  
  console.log(`[Risk Profile] Locked account for high-risk user ${userId}`);
}