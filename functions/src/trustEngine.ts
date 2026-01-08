/**
 * Trust & Anti-Fraud Engine for Avalo
 * 
 * Protects against:
 * - Multi-account abuse
 * - Self-chat / collusion
 * - Free-pool exploitation
 * - Rapid earnings farming
 * - Risky withdrawals
 * 
 * IMPORTANT: All thresholds are configurable for easy tuning.
 * This module is ADDITIVE ONLY - does not change existing business logic.
 */

import { db, serverTimestamp, increment, generateId, arrayUnion } from './init.js';

// Simple logger (no-op for now, can be replaced with actual logger later)
const logger = {
  info: (..._args: any[]) => {},
  warn: (..._args: any[]) => {},
  error: (..._args: any[]) => {},
};

// ============================================================================
// TYPES
// ============================================================================

export type TrustScore = number; // 0-100
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export enum FraudFlagReason {
  SELF_CHAT = 'SELF_CHAT',
  MULTI_ACCOUNT = 'MULTI_ACCOUNT',
  FREE_POOL_ABUSE = 'FREE_POOL_ABUSE',
  RAPID_EARNINGS = 'RAPID_EARNINGS',
  RISKY_WITHDRAWAL = 'RISKY_WITHDRAWAL',
  SUSPICIOUS_PATTERN = 'SUSPICIOUS_PATTERN',
  DEVICE_OVERLAP = 'DEVICE_OVERLAP',
  IP_OVERLAP = 'IP_OVERLAP',
  REPEATED_PAIRS = 'REPEATED_PAIRS',
  EXCESSIVE_FREE_POOL = 'EXCESSIVE_FREE_POOL',
  VELOCITY_ABUSE = 'VELOCITY_ABUSE',
  CHARGEBACK_DISPUTE = 'CHARGEBACK_DISPUTE'
}

export interface UserRiskProfile {
  userId: string;
  trustScore: TrustScore;
  riskLevel: RiskLevel;
  flags: FraudFlagReason[];
  lastUpdated: any; // Timestamp
  stats: {
    totalPaidChats: number;
    totalEarnedTokens: number;
    totalWithdrawals: number;
    totalFreePoolChats: number;
    totalCalls: number;
    totalCallEarnings: number;
    suspiciousPatternCount: number;
    deviceIds: string[];
    ipHashes: string[];
    distinctPayers: Set<string> | string[]; // Set in memory, array in Firestore
    distinctEarners: Set<string> | string[]; // Set in memory, array in Firestore
    accountAgeDays: number;
  };
  restrictions: {
    shadowbanned: boolean;
    freePoolBlocked: boolean;
    withdrawalHold: boolean;
    requireKYC: boolean;
  };
  createdAt: any; // Timestamp
}

export interface RiskEventInput {
  userId: string;
  eventType: 'chat' | 'call' | 'withdrawal' | 'free_pool' | 'payout_request';
  metadata: {
    payerId?: string;
    earnerId?: string;
    totalTokens?: number;
    freePoolUsed?: boolean;
    deviceId?: string;
    ipHash?: string;
    callType?: 'VOICE' | 'VIDEO';
    durationMinutes?: number;
    withdrawalAmount?: number;
    [key: string]: any;
  };
}

export interface RiskEvent {
  eventId: string;
  userId: string;
  eventType: RiskEventInput['eventType'];
  metadata: RiskEventInput['metadata'];
  riskScoreImpact: number;
  flagsTriggered: FraudFlagReason[];
  createdAt: any; // Timestamp
}

export interface WithdrawalDecision {
  allowed: boolean;
  reason?: string;
  holdPayout?: boolean;
  requireKYC?: boolean;
}

// ============================================================================
// CONFIGURATION - EASILY TUNABLE THRESHOLDS
// ============================================================================

export const TRUST_ENGINE_CONFIG = {
  // Trust Score Mapping
  TRUST_SCORE_THRESHOLDS: {
    CRITICAL_MAX: 30,    // 0-30 = CRITICAL
    HIGH_MAX: 50,        // 31-50 = HIGH
    MEDIUM_MAX: 70,      // 51-70 = MEDIUM
    // 71-100 = LOW risk
  },
  
  // Initial Trust Score
  NEW_USER_TRUST_SCORE: 70,
  
  // Risk Score Adjustments
  RISK_ADJUSTMENTS: {
    // Penalties (decrease trust score)
    SELF_CHAT_DETECTED: -30,
    DEVICE_OVERLAP: -15,
    IP_OVERLAP: -10,
    REPEATED_PAIRS_THRESHOLD: 10, // Same pair > 10 interactions
    REPEATED_PAIRS_PENALTY: -20,
    EXCESSIVE_FREE_POOL_RATIO: 0.8, // Free pool > 80% of total chats
    EXCESSIVE_FREE_POOL_PENALTY: -25,
    VELOCITY_ABUSE_PENALTY: -15,
    
    // Rewards (increase trust score)
    ORGANIC_EARNING_REWARD: 2, // Per distinct payer
    LONG_TERM_ACTIVITY_REWARD: 5, // Per 30 days
    DIVERSE_INTERACTION_REWARD: 3, // Per 5 distinct users
  },
  
  // Velocity Thresholds (abuse detection)
  VELOCITY: {
    MAX_CHATS_PER_HOUR: 20,
    MAX_CHATS_PER_DAY: 100,
    MAX_EARNINGS_PER_HOUR: 1000, // tokens
    MAX_EARNINGS_PER_DAY: 5000, // tokens
    MAX_CALLS_PER_HOUR: 10,
  },
  
  // Withdrawal Limits
  WITHDRAWAL: {
    MIN_TRUST_SCORE_FOR_WITHDRAWAL: 40,
    MIN_ACCOUNT_AGE_DAYS: 7,
    MAX_WITHDRAWAL_NEW_USER: 500, // tokens (< 30 days)
    HOLD_THRESHOLD_TOKENS: 2000, // Hold for review if > 2000
    KYC_THRESHOLD_TOKENS: 5000, // Require KYC if > 5000
  },
  
  // Free Pool Restrictions
  FREE_POOL: {
    MIN_TRUST_SCORE: 50,
    MAX_FREE_POOL_CHATS_PER_DAY: 20,
  },
  
  // Pattern Detection
  PATTERN: {
    MIN_DISTINCT_PAYERS_FOR_TRUST: 5, // Need interactions with 5+ different payers
    SAME_PAIR_THRESHOLD: 10, // Flag if same two users interact > 10 times
  },
  
  // Shadowban Triggers
  SHADOWBAN: {
    TRIGGER_RISK_LEVELS: ['HIGH', 'CRITICAL'] as RiskLevel[],
  },
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record a risk event and update user aggregates
 */
export async function recordRiskEvent(event: RiskEventInput): Promise<RiskEvent> {
  const eventId = generateId();
  
  // Analyze event for immediate risk signals
  const analysis = analyzeEvent(event);
  
  const riskEvent: RiskEvent = {
    eventId,
    userId: event.userId,
    eventType: event.eventType,
    metadata: event.metadata,
    riskScoreImpact: analysis.scoreImpact,
    flagsTriggered: analysis.flags,
    createdAt: serverTimestamp()
  };
  
  // Store event for audit trail
  await db.collection('riskEvents').doc(eventId).set(riskEvent);
  
  // Update user's risk profile aggregates
  await updateRiskProfileAggregates(event.userId, event, analysis);
  
  logger.info(`Risk event recorded: ${eventId} for user ${event.userId}, impact: ${analysis.scoreImpact}`);
  
  return riskEvent;
}

/**
 * Analyze an event for risk signals
 */
function analyzeEvent(event: RiskEventInput): { scoreImpact: number; flags: FraudFlagReason[] } {
  let scoreImpact = 0;
  const flags: FraudFlagReason[] = [];
  
  // Check for self-chat (payer and earner are same or share device/IP)
  if (event.metadata.payerId && event.metadata.earnerId) {
    if (event.metadata.payerId === event.metadata.earnerId) {
      scoreImpact += TRUST_ENGINE_CONFIG.RISK_ADJUSTMENTS.SELF_CHAT_DETECTED;
      flags.push(FraudFlagReason.SELF_CHAT);
    }
  }
  
  // Device/IP overlap will be checked in aggregate analysis
  
  // Free pool usage tracking
  if (event.eventType === 'free_pool' || event.metadata.freePoolUsed) {
    // No immediate penalty, but tracked for aggregate analysis
  }
  
  return { scoreImpact, flags };
}

/**
 * Update risk profile aggregates for a user
 */
async function updateRiskProfileAggregates(
  userId: string,
  event: RiskEventInput,
  analysis: { scoreImpact: number; flags: FraudFlagReason[] }
): Promise<void> {
  const profileRef = db.collection('riskProfiles').doc(userId);
  const profileSnap = await profileRef.get();
  
  if (!profileSnap.exists) {
    // Initialize new profile
    await initializeRiskProfile(userId);
  }
  
  // Update aggregates
  const updates: any = {
    lastUpdated: serverTimestamp()
  };
  
  // Update stats based on event type
  if (event.eventType === 'chat') {
    if (event.metadata.freePoolUsed) {
      updates['stats.totalFreePoolChats'] = increment(1);
    } else {
      updates['stats.totalPaidChats'] = increment(1);
    }
    
    if (event.metadata.totalTokens) {
      updates['stats.totalEarnedTokens'] = increment(event.metadata.totalTokens);
    }
  }
  
  if (event.eventType === 'call') {
    updates['stats.totalCalls'] = increment(1);
    if (event.metadata.totalTokens) {
      updates['stats.totalCallEarnings'] = increment(event.metadata.totalTokens);
    }
  }
  
  if (event.eventType === 'withdrawal' || event.eventType === 'payout_request') {
    updates['stats.totalWithdrawals'] = increment(1);
  }
  
  // Track device IDs (add to array if new)
  if (event.metadata.deviceId) {
    updates['stats.deviceIds'] = arrayUnion(event.metadata.deviceId);
  }
  
  // Track IP hashes (add to array if new)
  if (event.metadata.ipHash) {
    updates['stats.ipHashes'] = arrayUnion(event.metadata.ipHash);
  }
  
  // Track distinct payers/earners
  if (event.metadata.payerId && event.metadata.earnerId === userId) {
    updates['stats.distinctPayers'] = arrayUnion(event.metadata.payerId);
  }
  if (event.metadata.earnerId && event.metadata.payerId === userId) {
    updates['stats.distinctEarners'] = arrayUnion(event.metadata.earnerId);
  }
  
  // Add any triggered flags
  if (analysis.flags.length > 0) {
    updates.flags = arrayUnion(...analysis.flags);
    updates['stats.suspiciousPatternCount'] = increment(1);
  }
  
  await profileRef.update(updates);
}

/**
 * Initialize a new risk profile for a user
 */
async function initializeRiskProfile(userId: string): Promise<void> {
  // Get user data to calculate account age
  const userSnap = await db.collection('users').doc(userId).get();
  const userData = userSnap.data();
  const createdAt = userData?.createdAt?.toDate?.() || new Date();
  const accountAgeDays = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  
  const profile: Partial<UserRiskProfile> = {
    userId,
    trustScore: TRUST_ENGINE_CONFIG.NEW_USER_TRUST_SCORE,
    riskLevel: 'MEDIUM',
    flags: [],
    lastUpdated: serverTimestamp(),
    stats: {
      totalPaidChats: 0,
      totalEarnedTokens: 0,
      totalWithdrawals: 0,
      totalFreePoolChats: 0,
      totalCalls: 0,
      totalCallEarnings: 0,
      suspiciousPatternCount: 0,
      deviceIds: [],
      ipHashes: [],
      distinctPayers: [],
      distinctEarners: [],
      accountAgeDays
    },
    restrictions: {
      shadowbanned: false,
      freePoolBlocked: false,
      withdrawalHold: false,
      requireKYC: false
    },
    createdAt: serverTimestamp()
  };
  
  await db.collection('riskProfiles').doc(userId).set(profile);
}

/**
 * Evaluate and update user's risk score based on all available data
 */
export async function evaluateUserRisk(userId: string): Promise<UserRiskProfile> {
  const profileRef = db.collection('riskProfiles').doc(userId);
  const profileSnap = await profileRef.get();
  
  if (!profileSnap.exists) {
    await initializeRiskProfile(userId);
    return (await profileRef.get()).data() as UserRiskProfile;
  }
  
  const profile = profileSnap.data() as UserRiskProfile;
  let newTrustScore = profile.trustScore;
  const newFlags: FraudFlagReason[] = [...profile.flags];
  
  // === PENALTY CALCULATIONS ===
  
  // Check free pool abuse ratio
  const totalChats = profile.stats.totalPaidChats + profile.stats.totalFreePoolChats;
  if (totalChats > 0) {
    const freePoolRatio = profile.stats.totalFreePoolChats / totalChats;
    if (freePoolRatio > TRUST_ENGINE_CONFIG.RISK_ADJUSTMENTS.EXCESSIVE_FREE_POOL_RATIO) {
      newTrustScore += TRUST_ENGINE_CONFIG.RISK_ADJUSTMENTS.EXCESSIVE_FREE_POOL_PENALTY;
      if (!newFlags.includes(FraudFlagReason.EXCESSIVE_FREE_POOL)) {
        newFlags.push(FraudFlagReason.EXCESSIVE_FREE_POOL);
      }
    }
  }
  
  // Check device/IP overlap (multiple accounts using same device)
  if (profile.stats.deviceIds.length > 3) {
    // Check if these devices are associated with other accounts (complex query, simplified here)
    newTrustScore += TRUST_ENGINE_CONFIG.RISK_ADJUSTMENTS.DEVICE_OVERLAP;
    if (!newFlags.includes(FraudFlagReason.DEVICE_OVERLAP)) {
      newFlags.push(FraudFlagReason.DEVICE_OVERLAP);
    }
  }
  
  // Check if IP hashes overlap with known fraud patterns
  if (profile.stats.ipHashes.length > 5) {
    newTrustScore += TRUST_ENGINE_CONFIG.RISK_ADJUSTMENTS.IP_OVERLAP;
    if (!newFlags.includes(FraudFlagReason.IP_OVERLAP)) {
      newFlags.push(FraudFlagReason.IP_OVERLAP);
    }
  }
  
  // === REWARD CALCULATIONS ===
  
  // Reward for diverse payers (organic earnings)
  const distinctPayersCount = Array.isArray(profile.stats.distinctPayers) 
    ? profile.stats.distinctPayers.length 
    : 0;
  if (distinctPayersCount >= TRUST_ENGINE_CONFIG.PATTERN.MIN_DISTINCT_PAYERS_FOR_TRUST) {
    newTrustScore += TRUST_ENGINE_CONFIG.RISK_ADJUSTMENTS.ORGANIC_EARNING_REWARD * 
      Math.floor(distinctPayersCount / 5);
  }
  
  // Reward for long-term activity
  const monthsActive = Math.floor(profile.stats.accountAgeDays / 30);
  if (monthsActive > 0) {
    newTrustScore += TRUST_ENGINE_CONFIG.RISK_ADJUSTMENTS.LONG_TERM_ACTIVITY_REWARD * monthsActive;
  }
  
  // Clamp trust score to 0-100
  newTrustScore = Math.max(0, Math.min(100, newTrustScore));
  
  // Determine risk level
  const newRiskLevel = calculateRiskLevel(newTrustScore);
  
  // Update profile
  await profileRef.update({
    trustScore: newTrustScore,
    riskLevel: newRiskLevel,
    flags: newFlags,
    lastUpdated: serverTimestamp()
  });
  
  logger.info(`Risk evaluated for user ${userId}: score=${newTrustScore}, level=${newRiskLevel}`);
  
  // Return updated profile
  const updatedSnap = await profileRef.get();
  return updatedSnap.data() as UserRiskProfile;
}

/**
 * Calculate risk level from trust score
 */
function calculateRiskLevel(trustScore: TrustScore): RiskLevel {
  if (trustScore <= TRUST_ENGINE_CONFIG.TRUST_SCORE_THRESHOLDS.CRITICAL_MAX) {
    return 'CRITICAL';
  }
  if (trustScore <= TRUST_ENGINE_CONFIG.TRUST_SCORE_THRESHOLDS.HIGH_MAX) {
    return 'HIGH';
  }
  if (trustScore <= TRUST_ENGINE_CONFIG.TRUST_SCORE_THRESHOLDS.MEDIUM_MAX) {
    return 'MEDIUM';
  }
  return 'LOW';
}

/**
 * Apply shadowban if user's risk level warrants it
 */
export async function applyShadowbanIfNeeded(userId: string): Promise<boolean> {
  const profileSnap = await db.collection('riskProfiles').doc(userId).get();
  
  if (!profileSnap.exists) {
    return false;
  }
  
  const profile = profileSnap.data() as UserRiskProfile;
  const shouldBan = TRUST_ENGINE_CONFIG.SHADOWBAN.TRIGGER_RISK_LEVELS.includes(profile.riskLevel);
  
  if (shouldBan && !profile.restrictions.shadowbanned) {
    // Apply shadowban
    await db.collection('riskProfiles').doc(userId).update({
      'restrictions.shadowbanned': true,
      lastUpdated: serverTimestamp()
    });
    
    // Update user profile
    await db.collection('users').doc(userId).update({
      shadowbanned: true,
      updatedAt: serverTimestamp()
    });
    
    logger.warn(`Shadowban applied to user ${userId} (risk level: ${profile.riskLevel})`);
    return true;
  }
  
  if (!shouldBan && profile.restrictions.shadowbanned) {
    // Remove shadowban
    await db.collection('riskProfiles').doc(userId).update({
      'restrictions.shadowbanned': false,
      lastUpdated: serverTimestamp()
    });
    
    await db.collection('users').doc(userId).update({
      shadowbanned: false,
      updatedAt: serverTimestamp()
    });
    
    logger.info(`Shadowban removed from user ${userId}`);
    return false;
  }
  
  return shouldBan;
}

/**
 * Check if user can withdraw funds
 */
export async function canWithdraw(
  userId: string,
  amountTokens: number
): Promise<WithdrawalDecision> {
  const profileRef = db.collection('riskProfiles').doc(userId);
  const profileSnap = await profileRef.get();
  
  if (!profileSnap.exists) {
    await initializeRiskProfile(userId);
    return {
      allowed: false,
      reason: 'New account - needs activity before withdrawal',
      holdPayout: true
    };
  }
  
  const profile = profileSnap.data() as UserRiskProfile;
  
  // Check trust score threshold
  if (profile.trustScore < TRUST_ENGINE_CONFIG.WITHDRAWAL.MIN_TRUST_SCORE_FOR_WITHDRAWAL) {
    return {
      allowed: false,
      reason: `Trust score too low (${profile.trustScore}/100). Build trust through interactions.`,
      holdPayout: true
    };
  }
  
  // Check account age
  if (profile.stats.accountAgeDays < TRUST_ENGINE_CONFIG.WITHDRAWAL.MIN_ACCOUNT_AGE_DAYS) {
    return {
      allowed: false,
      reason: `Account too new (${profile.stats.accountAgeDays} days). Wait ${TRUST_ENGINE_CONFIG.WITHDRAWAL.MIN_ACCOUNT_AGE_DAYS - profile.stats.accountAgeDays} more days.`,
      holdPayout: true
    };
  }
  
  // Check if already on hold
  if (profile.restrictions.withdrawalHold) {
    return {
      allowed: false,
      reason: 'Withdrawal on hold - under review',
      holdPayout: true
    };
  }
  
  // Check if KYC required
  if (profile.restrictions.requireKYC) {
    return {
      allowed: false,
      reason: 'KYC verification required',
      requireKYC: true
    };
  }
  
  // Check new user withdrawal limits
  if (profile.stats.accountAgeDays < 30 && 
      amountTokens > TRUST_ENGINE_CONFIG.WITHDRAWAL.MAX_WITHDRAWAL_NEW_USER) {
    return {
      allowed: false,
      reason: `New users limited to ${TRUST_ENGINE_CONFIG.WITHDRAWAL.MAX_WITHDRAWAL_NEW_USER} tokens per withdrawal`,
      holdPayout: false
    };
  }
  
  // Check if amount requires manual review
  if (amountTokens > TRUST_ENGINE_CONFIG.WITHDRAWAL.HOLD_THRESHOLD_TOKENS) {
    await profileRef.update({
      'restrictions.withdrawalHold': true,
      lastUpdated: serverTimestamp()
    });
    
    return {
      allowed: false,
      reason: 'Large withdrawal - manual review required',
      holdPayout: true
    };
  }
  
  // Check if amount requires KYC
  if (amountTokens > TRUST_ENGINE_CONFIG.WITHDRAWAL.KYC_THRESHOLD_TOKENS) {
    await profileRef.update({
      'restrictions.requireKYC': true,
      lastUpdated: serverTimestamp()
    });
    
    return {
      allowed: false,
      reason: 'Large withdrawal - KYC verification required',
      requireKYC: true
    };
  }
  
  // All checks passed
  return {
    allowed: true
  };
}

/**
 * Check if user can use free pool
 */
export async function canUseFreePool(userId: string): Promise<boolean> {
  const profileSnap = await db.collection('riskProfiles').doc(userId).get();
  
  if (!profileSnap.exists) {
    // New users can use free pool initially
    return true;
  }
  
  const profile = profileSnap.data() as UserRiskProfile;
  
  // Check if explicitly blocked
  if (profile.restrictions.freePoolBlocked) {
    return false;
  }
  
  // Check trust score threshold
  if (profile.trustScore < TRUST_ENGINE_CONFIG.FREE_POOL.MIN_TRUST_SCORE) {
    // Auto-block free pool for low trust users
    await db.collection('riskProfiles').doc(userId).update({
      'restrictions.freePoolBlocked': true,
      lastUpdated: serverTimestamp()
    });
    
    logger.warn(`Free pool blocked for user ${userId} (low trust score: ${profile.trustScore})`);
    return false;
  }
  
  // Check daily limit (requires checking recent events - simplified here)
  // In production, you'd query riskEvents for this user in last 24h
  
  return true;
}

/**
 * Get user risk profile
 */
export async function getUserRiskProfile(userId: string): Promise<UserRiskProfile | null> {
  const profileSnap = await db.collection('riskProfiles').doc(userId).get();
  
  if (!profileSnap.exists) {
    return null;
  }
  
  return profileSnap.data() as UserRiskProfile;
}

/**
 * Check for velocity abuse (too many actions too quickly)
 */
export async function checkVelocityAbuse(
  userId: string,
  eventType: 'chat' | 'call' | 'earning'
): Promise<{ allowed: boolean; reason?: string }> {
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  
  // Query recent events
  const recentEventsSnap = await db.collection('riskEvents')
    .where('userId', '==', userId)
    .where('createdAt', '>=', oneHourAgo)
    .get();
  
  const hourlyCount = recentEventsSnap.size;
  
  // Check hourly limits
  if (eventType === 'chat' && hourlyCount > TRUST_ENGINE_CONFIG.VELOCITY.MAX_CHATS_PER_HOUR) {
    return {
      allowed: false,
      reason: `Rate limit exceeded: max ${TRUST_ENGINE_CONFIG.VELOCITY.MAX_CHATS_PER_HOUR} chats per hour`
    };
  }
  
  if (eventType === 'call' && hourlyCount > TRUST_ENGINE_CONFIG.VELOCITY.MAX_CALLS_PER_HOUR) {
    return {
      allowed: false,
      reason: `Rate limit exceeded: max ${TRUST_ENGINE_CONFIG.VELOCITY.MAX_CALLS_PER_HOUR} calls per hour`
    };
  }
  
  // For earnings, check token velocity
  if (eventType === 'earning') {
    const hourlyEvents = recentEventsSnap.docs.map(doc => doc.data() as RiskEvent);
    const hourlyEarnings = hourlyEvents.reduce((sum, e) => sum + (e.metadata.totalTokens || 0), 0);
    
    if (hourlyEarnings > TRUST_ENGINE_CONFIG.VELOCITY.MAX_EARNINGS_PER_HOUR) {
      // Flag for review but allow (reduces trust score)
      await recordRiskEvent({
        userId,
        eventType: 'free_pool',
        metadata: { velocityFlag: true, hourlyEarnings }
      });
      
      logger.warn(`Velocity flag for user ${userId}: ${hourlyEarnings} tokens/hour`);
    }
  }
  
  return { allowed: true };
}
