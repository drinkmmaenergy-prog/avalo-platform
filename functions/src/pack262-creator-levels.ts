/**
 * PACK 262: Creator Levels & Rewards System
 * 
 * Gamified loyalty program that increases earnings, retention and Live/chat frequency
 * without breaking tokenomics or App Store compliance.
 * 
 * Features:
 * - Bronze → Diamond progression based on lifetime earned tokens
 * - Level Points (LP) system with transparent formula
 * - Visibility boosts and conversion benefits
 * - Anti-abuse detection
 * - Automatic notifications for level-ups and milestones
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, increment, FieldValue } from './init';
import { logger } from 'firebase-functions/v1';

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

export type CreatorLevel = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface LevelConfig {
  level: CreatorLevel;
  minTokens: number;
  maxTokens: number;
  badgeColor: string;
  targetSegment: string;
  benefits: LevelBenefits;
}

export interface LevelBenefits {
  profileBoostPerWeek: number;
  liveBoostPerWeek: number;
  withdrawalThresholdUSD: number;
  earlyAccess: boolean;
  vipSupport: boolean;
  fanClubBoost: boolean;
  giftMultiplierBanner: boolean;
  animatedBanner: boolean;
}

export const LEVEL_CONFIGS: Record<CreatorLevel, LevelConfig> = {
  bronze: {
    level: 'bronze',
    minTokens: 0,
    maxTokens: 4999,
    badgeColor: '#8B4513',
    targetSegment: 'new creators',
    benefits: {
      profileBoostPerWeek: 0,
      liveBoostPerWeek: 0,
      withdrawalThresholdUSD: 20, // default from PACK 261
      earlyAccess: false,
      vipSupport: false,
      fanClubBoost: false,
      giftMultiplierBanner: false,
      animatedBanner: false,
    },
  },
  silver: {
    level: 'silver',
    minTokens: 5000,
    maxTokens: 24999,
    badgeColor: '#C0C0C0',
    targetSegment: 'consistent activity',
    benefits: {
      profileBoostPerWeek: 1,
      liveBoostPerWeek: 0,
      withdrawalThresholdUSD: 20,
      earlyAccess: false,
      vipSupport: false,
      fanClubBoost: false,
      giftMultiplierBanner: false,
      animatedBanner: false,
    },
  },
  gold: {
    level: 'gold',
    minTokens: 25000,
    maxTokens: 74999,
    badgeColor: '#FFD700',
    targetSegment: 'rising earners',
    benefits: {
      profileBoostPerWeek: 2,
      liveBoostPerWeek: 1,
      withdrawalThresholdUSD: 10,
      earlyAccess: true,
      vipSupport: false,
      fanClubBoost: true,
      giftMultiplierBanner: true,
      animatedBanner: false,
    },
  },
  platinum: {
    level: 'platinum',
    minTokens: 75000,
    maxTokens: 199999,
    badgeColor: '#4169E1',
    targetSegment: 'top earners',
    benefits: {
      profileBoostPerWeek: 7, // daily
      liveBoostPerWeek: 2,
      withdrawalThresholdUSD: 10,
      earlyAccess: true,
      vipSupport: true,
      fanClubBoost: true,
      giftMultiplierBanner: true,
      animatedBanner: true,
    },
  },
  diamond: {
    level: 'diamond',
    minTokens: 200000,
    maxTokens: Infinity,
    badgeColor: '#9B59B6',
    targetSegment: 'elite earners',
    benefits: {
      profileBoostPerWeek: 7, // daily
      liveBoostPerWeek: 7, // daily (2× weekly means every 3-4 days ≈ twice per week)
      withdrawalThresholdUSD: 0, // instant withdrawals
      earlyAccess: true,
      vipSupport: true,
      fanClubBoost: true,
      giftMultiplierBanner: true,
      animatedBanner: true,
    },
  },
};

// LP earning rates
export const LP_RATES = {
  TOKEN_EARNED: 1,              // 1 LP per token earned
  LIVE_MINUTE_HOSTED: 10,       // 10 LP per minute hosting Live
  PPV_TICKET_SOLD: 100,         // 100 LP per PPV Live ticket
  EVENT_TICKET_SOLD: 150,       // 150 LP per Event ticket
  FAN_CLUB_SUBSCRIPTION: 300,   // 300 LP per Fan Club subscription
};

// Anti-abuse thresholds
const ABUSE_DETECTION = {
  MAX_TOKENS_PER_HOUR_FROM_SINGLE_USER: 1000,
  MAX_FAKE_ACCOUNT_GIFTS: 5,
  MIN_VIEWER_COUNT_FOR_LIVE_LP: 2,
  MIN_EVENT_CHECKINS: 5,
  SUSPICIOUS_PATTERN_THRESHOLD: 0.8,
};

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface CreatorLevelProfile {
  creatorId: string;
  level: CreatorLevel;
  lifetimeTokensEarned: number;
  lifetimeLP: number;
  currentLP: number;
  nextLevelLP: number;
  nextLevelTokens: number;
  progressToNextLevel: number; // percentage 0-100
  badges: {
    level: CreatorLevel;
    color: string;
    earnedAt: FirebaseFirestore.Timestamp;
  }[];
  stats: {
    tokensEarnedToday: number;
    tokensEarnedThisWeek: number;
    tokensEarnedThisMonth: number;
    liveMinutesHosted: number;
    ppvTicketsSold: number;
    eventTicketsSold: number;
    fanClubSubscriptions: number;
  };
  createdAt: FirebaseFirestore.Timestamp;
  lastUpdatedAt: FirebaseFirestore.Timestamp;
  lastLevelUpAt?: FirebaseFirestore.Timestamp;
}

export interface LPActivity {
  activityId: string;
  creatorId: string;
  activityType: 'token_earned' | 'live_minute' | 'ppv_ticket' | 'event_ticket' | 'fan_club_sub';
  lpEarned: number;
  tokensInvolved?: number;
  payerId?: string;
  metadata?: any;
  timestamp: FirebaseFirestore.Timestamp;
  flagged?: boolean;
  flagReason?: string;
}

export interface CreatorRewards {
  creatorId: string;
  level: CreatorLevel;
  benefits: LevelBenefits;
  activeBoosts: {
    profileBoost?: BoostInstance;
    liveBoost?: BoostInstance;
  };
  boostsRemaining: {
    profile: number;
    live: number;
  };
  lastBoostUsed?: FirebaseFirestore.Timestamp;
}

export interface BoostInstance {
  boostId: string;
  type: 'profile' | 'live';
  activatedAt: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
  active: boolean;
  multiplier: number;
}

// ============================================================================
// CORE FUNCTIONS: LP TRACKING & LEVEL PROGRESSION
// ============================================================================

/**
 * Initialize creator level profile
 */
export const initializeCreatorLevel = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const creatorId = context.auth.uid;
  const levelRef = db.collection('creatorLevels').doc(creatorId);

  const existing = await levelRef.get();
  if (existing.exists) {
    return { success: true, message: 'Level profile already exists', data: existing.data() };
  }

  const initialProfile: CreatorLevelProfile = {
    creatorId,
    level: 'bronze',
    lifetimeTokensEarned: 0,
    lifetimeLP: 0,
    currentLP: 0,
    nextLevelLP: LEVEL_CONFIGS.silver.minTokens,
    nextLevelTokens: LEVEL_CONFIGS.silver.minTokens,
    progressToNextLevel: 0,
    badges: [
      {
        level: 'bronze',
        color: LEVEL_CONFIGS.bronze.badgeColor,
        earnedAt: serverTimestamp() as FirebaseFirestore.Timestamp,
      },
    ],
    stats: {
      tokensEarnedToday: 0,
      tokensEarnedThisWeek: 0,
      tokensEarnedThisMonth: 0,
      liveMinutesHosted: 0,
      ppvTicketsSold: 0,
      eventTicketsSold: 0,
      fanClubSubscriptions: 0,
    },
    createdAt: serverTimestamp() as FirebaseFirestore.Timestamp,
    lastUpdatedAt: serverTimestamp() as FirebaseFirestore.Timestamp,
  };

  await levelRef.set(initialProfile);

  // Initialize rewards document
  await initializeCreatorRewards(creatorId, 'bronze');

  logger.info(`Initialized creator level for ${creatorId}`);

  return { success: true, message: 'Creator level initialized', data: initialProfile };
});

/**
 * Record LP-earning activity and update level
 * Called by other systems when creators earn
 */
export const recordLPActivity = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const {
    creatorId,
    activityType,
    tokensEarned,
    liveMinutes,
    ppvTickets,
    eventTickets,
    fanClubSubs,
    payerId,
    metadata,
  } = data;

  // Validate required fields
  if (!creatorId || !activityType) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  // Calculate LP based on activity type
  let lpEarned = 0;
  const activityData: Partial<LPActivity> = {
    creatorId,
    activityType,
    payerId,
    metadata,
    timestamp: serverTimestamp() as FirebaseFirestore.Timestamp,
  };

  switch (activityType) {
    case 'token_earned':
      if (tokensEarned === undefined || tokensEarned <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid tokens amount');
      }
      lpEarned = tokensEarned * LP_RATES.TOKEN_EARNED;
      activityData.tokensInvolved = tokensEarned;
      break;

    case 'live_minute':
      if (liveMinutes === undefined || liveMinutes <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid live minutes');
      }
      lpEarned = liveMinutes * LP_RATES.LIVE_MINUTE_HOSTED;
      break;

    case 'ppv_ticket':
      if (ppvTickets === undefined || ppvTickets <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid PPV tickets');
      }
      lpEarned = ppvTickets * LP_RATES.PPV_TICKET_SOLD;
      break;

    case 'event_ticket':
      if (eventTickets === undefined || eventTickets <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid event tickets');
      }
      lpEarned = eventTickets * LP_RATES.EVENT_TICKET_SOLD;
      break;

    case 'fan_club_sub':
      if (fanClubSubs === undefined || fanClubSubs <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid fan club subs');
      }
      lpEarned = fanClubSubs * LP_RATES.FAN_CLUB_SUBSCRIPTION;
      break;

    default:
      throw new functions.https.HttpsError('invalid-argument', 'Unknown activity type');
  }

  // Anti-abuse check
  const abuseDetected = await detectAbuse(creatorId, activityType, {
    tokensEarned,
    payerId,
    liveMinutes,
    metadata,
  });

  if (abuseDetected.flagged) {
    logger.warn(`Abuse detected for creator ${creatorId}: ${abuseDetected.reason}`);
    activityData.flagged = true;
    activityData.flagReason = abuseDetected.reason;
    lpEarned = 0; // Don't award LP for suspected abuse
  }

  // Store activity log
  const activityRef = db
    .collection('levelPoints')
    .doc(creatorId)
    .collection('activities')
    .doc();
  
  activityData.activityId = activityRef.id;
  activityData.lpEarned = lpEarned;

  await activityRef.set(activityData);

  // Update creator level profile
  if (lpEarned > 0) {
    await updateCreatorLevel(creatorId, lpEarned, tokensEarned || 0);
  }

  return {
    success: true,
    lpEarned,
    flagged: abuseDetected.flagged,
    message: abuseDetected.flagged ? 'Activity flagged for review' : 'LP recorded successfully',
  };
});

/**
 * Update creator level based on LP earned
 */
async function updateCreatorLevel(
  creatorId: string,
  lpEarned: number,
  tokensEarned: number
): Promise<void> {
  const levelRef = db.collection('creatorLevels').doc(creatorId);

  await db.runTransaction(async (transaction) => {
    const levelDoc = await transaction.get(levelRef);

    if (!levelDoc.exists) {
      throw new Error('Creator level profile not found');
    }

    const profile = levelDoc.data() as CreatorLevelProfile;
    const newLifetimeLP = profile.lifetimeLP + lpEarned;
    const newLifetimeTokens = profile.lifetimeTokensEarned + tokensEarned;

    // Determine new level based on lifetime tokens
    const newLevel = calculateLevel(newLifetimeTokens);
    const levelChanged = newLevel !== profile.level;

    // Calculate progress to next level
    const currentConfig = LEVEL_CONFIGS[newLevel];
    const nextLevelConfig = getNextLevelConfig(newLevel);
    const progressToNextLevel = nextLevelConfig
      ? ((newLifetimeTokens - currentConfig.minTokens) /
          (nextLevelConfig.minTokens - currentConfig.minTokens)) * 100
      : 100;

    const updates: any = {
      lifetimeLP: newLifetimeLP,
      lifetimeTokensEarned: newLifetimeTokens,
      currentLP: newLifetimeLP,
      progressToNextLevel: Math.min(100, Math.round(progressToNextLevel)),
      lastUpdatedAt: serverTimestamp(),
    };

    if (nextLevelConfig) {
      updates.nextLevelLP = nextLevelConfig.minTokens;
      updates.nextLevelTokens = nextLevelConfig.minTokens;
    }

    if (tokensEarned > 0) {
      updates['stats.tokensEarnedToday'] = increment(tokensEarned);
      updates['stats.tokensEarnedThisWeek'] = increment(tokensEarned);
      updates['stats.tokensEarnedThisMonth'] = increment(tokensEarned);
    }

    if (levelChanged) {
      updates.level = newLevel;
      updates.lastLevelUpAt = serverTimestamp();
      updates.badges = FieldValue.arrayUnion({
        level: newLevel,
        color: LEVEL_CONFIGS[newLevel].badgeColor,
        earnedAt: serverTimestamp(),
      });

      // Trigger level-up notification
      await sendLevelUpNotification(creatorId, profile.level, newLevel, transaction);

      // Update rewards and benefits
      await updateCreatorRewards(creatorId, newLevel, transaction);

      logger.info(`Creator ${creatorId} leveled up from ${profile.level} to ${newLevel}`);
    }

    transaction.update(levelRef, updates);
  });
}

/**
 * Calculate level based on lifetime tokens earned
 */
function calculateLevel(lifetimeTokens: number): CreatorLevel {
  if (lifetimeTokens >= LEVEL_CONFIGS.diamond.minTokens) return 'diamond';
  if (lifetimeTokens >= LEVEL_CONFIGS.platinum.minTokens) return 'platinum';
  if (lifetimeTokens >= LEVEL_CONFIGS.gold.minTokens) return 'gold';
  if (lifetimeTokens >= LEVEL_CONFIGS.silver.minTokens) return 'silver';
  return 'bronze';
}

/**
 * Get next level configuration
 */
function getNextLevelConfig(currentLevel: CreatorLevel): LevelConfig | null {
  const levels: CreatorLevel[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
  const currentIndex = levels.indexOf(currentLevel);
  
  if (currentIndex === -1 || currentIndex === levels.length - 1) {
    return null;
  }

  return LEVEL_CONFIGS[levels[currentIndex + 1]];
}

// ============================================================================
// REWARDS & BENEFITS MANAGEMENT
// ============================================================================

/**
 * Initialize creator rewards document
 */
async function initializeCreatorRewards(
  creatorId: string,
  level: CreatorLevel
): Promise<void> {
  const rewardsRef = db.collection('creatorRewards').doc(creatorId);

  const rewards: CreatorRewards = {
    creatorId,
    level,
    benefits: LEVEL_CONFIGS[level].benefits,
    activeBoosts: {},
    boostsRemaining: {
      profile: LEVEL_CONFIGS[level].benefits.profileBoostPerWeek,
      live: LEVEL_CONFIGS[level].benefits.liveBoostPerWeek,
    },
  };

  await rewardsRef.set(rewards);
}

/**
 * Update creator rewards when level changes
 */
async function updateCreatorRewards(
  creatorId: string,
  newLevel: CreatorLevel,
  transaction: FirebaseFirestore.Transaction
): Promise<void> {
  const rewardsRef = db.collection('creatorRewards').doc(creatorId);

  transaction.set(
    rewardsRef,
    {
      level: newLevel,
      benefits: LEVEL_CONFIGS[newLevel].benefits,
      boostsRemaining: {
        profile: LEVEL_CONFIGS[newLevel].benefits.profileBoostPerWeek,
        live: LEVEL_CONFIGS[newLevel].benefits.liveBoostPerWeek,
      },
    },
    { merge: true }
  );
}

/**
 * Activate a boost (profile or live placement)
 */
export const activateBoost = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { boostType } = data; // 'profile' or 'live'
  const creatorId = context.auth.uid;

  if (!['profile', 'live'].includes(boostType)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid boost type');
  }

  const rewardsRef = db.collection('creatorRewards').doc(creatorId);
  const rewardsDoc = await rewardsRef.get();

  if (!rewardsDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Creator rewards not found');
  }

  const rewards = rewardsDoc.data() as CreatorRewards;

  // Check if boosts are available
  if (rewards.boostsRemaining[boostType as 'profile' | 'live'] <= 0) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'No boosts remaining this week'
    );
  }

  // Check if boost already active
  if (rewards.activeBoosts[`${boostType}Boost` as 'profileBoost' | 'liveBoost']?.active) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Boost already active'
    );
  }

  // Create boost instance
  const boostId = db.collection('_').doc().id;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour duration

  const boost: BoostInstance = {
    boostId,
    type: boostType as 'profile' | 'live',
    activatedAt: serverTimestamp() as FirebaseFirestore.Timestamp,
    expiresAt: FirebaseFirestore.Timestamp.fromDate(expiresAt),
    active: true,
    multiplier: 2, // 2× visibility
  };

  // Store boost
  await db
    .collection('activeBoosts')
    .doc(creatorId)
    .collection('boosts')
    .doc(boostId)
    .set(boost);

  // Update rewards
  await rewardsRef.update({
    [`activeBoosts.${boostType}Boost`]: boost,
    [`boostsRemaining.${boostType}`]: increment(-1),
    lastBoostUsed: serverTimestamp(),
  });

  // Send notification
  await sendBoostActivationNotification(creatorId, boostType, expiresAt);

  logger.info(`Boost activated for creator ${creatorId}: ${boostType}`);

  return {
    success: true,
    boost,
    message: `${boostType} boost activated for 1 hour`,
  };
});

/**
 * Reset weekly boosts (scheduled function - runs every Monday 00:00 UTC)
 */
export const resetWeeklyBoosts = functions.pubsub
  .schedule('0 0 * * 1')
  .timeZone('UTC')
  .onRun(async (context) => {
    const rewardsSnapshot = await db.collection('creatorRewards').get();
    const batch = db.batch();
    let count = 0;

    rewardsSnapshot.forEach((doc) => {
      const rewards = doc.data() as CreatorRewards;
      const benefits = LEVEL_CONFIGS[rewards.level].benefits;

      batch.update(doc.ref, {
        boostsRemaining: {
          profile: benefits.profileBoostPerWeek,
          live: benefits.liveBoostPerWeek,
        },
      });

      count++;
    });

    await batch.commit();

    logger.info(`Reset weekly boosts for ${count} creators`);
    return { success: true, count };
  });

/**
 * Expire inactive boosts (scheduled function - runs every hour)
 */
export const expireInactiveBoosts = functions.pubsub
  .schedule('0 * * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const now = FirebaseFirestore.Timestamp.now();
    const boostsSnapshot = await db.collectionGroup('boosts')
      .where('active', '==', true)
      .where('expiresAt', '<=', now)
      .get();

    const batch = db.batch();
    let count = 0;

    boostsSnapshot.forEach((doc) => {
      batch.update(doc.ref, { active: false });
      count++;
    });

    await batch.commit();

    logger.info(`Expired ${count} boosts`);
    return { success: true, count };
  });

// ============================================================================
// ANTI-ABUSE DETECTION
// ============================================================================

/**
 * Detect potential abuse patterns
 */
async function detectAbuse(
  creatorId: string,
  activityType: string,
  data: any
): Promise<{ flagged: boolean; reason?: string }> {
  const { tokensEarned, payerId, liveMinutes, metadata } = data;

  // Check 1: Tokens from single user in short time
  if (activityType === 'token_earned' && payerId) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentFromPayer = await db
      .collection('levelPoints')
      .doc(creatorId)
      .collection('activities')
      .where('payerId', '==', payerId)
      .where('timestamp', '>=', oneHourAgo)
      .get();

    let totalFromPayer = tokensEarned;
    recentFromPayer.forEach((doc) => {
      const activity = doc.data() as LPActivity;
      totalFromPayer += activity.tokensInvolved || 0;
    });

    if (totalFromPayer > ABUSE_DETECTION.MAX_TOKENS_PER_HOUR_FROM_SINGLE_USER) {
      await flagCreatorForReview(creatorId, 'high_tokens_single_user', { payerId, totalFromPayer });
      return { flagged: true, reason: 'Excessive tokens from single user' };
    }
  }

  // Check 2: Live minutes without sufficient viewers
  if (activityType === 'live_minute' && metadata?.viewerCount !== undefined) {
    if (metadata.viewerCount < ABUSE_DETECTION.MIN_VIEWER_COUNT_FOR_LIVE_LP) {
      return { flagged: true, reason: 'Insufficient viewers for Live LP' };
    }
  }

  // Check 3: Event tickets without sufficient check-ins
  if (activityType === 'event_ticket' && metadata?.checkinCount !== undefined) {
    if (metadata.checkinCount < ABUSE_DETECTION.MIN_EVENT_CHECKINS) {
      return { flagged: true, reason: 'Insufficient event check-ins' };
    }
  }

  // Check 4: Pattern analysis - look for suspicious activity patterns
  const recentActivities = await db
    .collection('levelPoints')
    .doc(creatorId)
    .collection('activities')
    .orderBy('timestamp', 'desc')
    .limit(50)
    .get();

  const activities = recentActivities.docs.map(doc => doc.data() as LPActivity);
  const suspiciousScore = analyzeSuspiciousPatterns(activities);

  if (suspiciousScore > ABUSE_DETECTION.SUSPICIOUS_PATTERN_THRESHOLD) {
    await flagCreatorForReview(creatorId, 'suspicious_pattern', { score: suspiciousScore });
    return { flagged: true, reason: 'Suspicious activity pattern detected' };
  }

  return { flagged: false };
}

/**
 * Analyze activity patterns for suspicious behavior
 */
function analyzeSuspiciousPatterns(activities: LPActivity[]): number {
  if (activities.length < 10) return 0;

  let suspiciousScore = 0;

  // Check for identical timestamps (bot-like behavior)
  const timestamps = activities.map(a => a.timestamp.toMillis());
  const uniqueTimestamps = new Set(timestamps);
  if (uniqueTimestamps.size < activities.length * 0.7) {
    suspiciousScore += 0.3;
  }

  // Check for round token amounts (e.g., always 100, 200, etc.)
  const tokenAmounts = activities
    .filter(a => a.tokensInvolved)
    .map(a => a.tokensInvolved!);
  const roundAmounts = tokenAmounts.filter(t => t % 100 === 0);
  if (roundAmounts.length > tokenAmounts.length * 0.8) {
    suspiciousScore += 0.3;
  }

  // Check for same payer repeatedly
  const payers = activities.filter(a => a.payerId).map(a => a.payerId);
  if (payers.length > 5) {
    const uniquePayers = new Set(payers);
    if (uniquePayers.size < payers.length * 0.3) {
      suspiciousScore += 0.4;
    }
  }

  return suspiciousScore;
}

/**
 * Flag creator for manual review
 */
async function flagCreatorForReview(
  creatorId: string,
  flagType: string,
  metadata: any
): Promise<void> {
  const flagRef = db.collection('creatorAbuseFlags').doc(creatorId);

  await flagRef.set(
    {
      creatorId,
      flags: FieldValue.arrayUnion({
        type: flagType,
        metadata,
        flaggedAt: serverTimestamp(),
      }),
      lastFlaggedAt: serverTimestamp(),
      reviewStatus: 'pending',
    },
    { merge: true }
  );

  logger.warn(`Creator ${creatorId} flagged for review: ${flagType}`);
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

/**
 * Send level-up notification
 */
async function sendLevelUpNotification(
  creatorId: string,
  oldLevel: CreatorLevel,
  newLevel: CreatorLevel,
  transaction: FirebaseFirestore.Transaction
): Promise<void> {
  const notificationRef = db.collection('levelUpNotifications').doc();

  const notification = {
    notificationId: notificationRef.id,
    creatorId,
    type: 'level_up',
    oldLevel,
    newLevel,
    title: `Congrats, you reached ${newLevel.toUpperCase()} level!`,
    message: `You've unlocked new benefits! Check your Creator Dashboard to see what's new.`,
    read: false,
    createdAt: serverTimestamp(),
  };

  transaction.set(notificationRef, notification);

  // Also send push notification if available
  // This would integrate with the existing notification system
}

/**
 * Send milestone notification (e.g., 80% to next level)
 */
export const checkAndSendMilestoneNotifications = functions.pubsub
  .schedule('0 */6 * * *') // Every 6 hours
  .timeZone('UTC')
  .onRun(async (context) => {
    const levels = await db.collection('creatorLevels').get();
    const notifications: any[] = [];

    levels.forEach((doc) => {
      const profile = doc.data() as CreatorLevelProfile;

      // Check if approaching next level (80%, 90%, 95%)
      if (profile.progressToNextLevel >= 80 && profile.progressToNextLevel < 100) {
        const lpRemaining = profile.nextLevelLP - profile.currentLP;
        
        notifications.push({
          creatorId: profile.creatorId,
          type: 'milestone_approaching',
          title: '🎯 Almost There!',
          message: `You're ${profile.progressToNextLevel}% to ${getNextLevelConfig(profile.level)?.level.toUpperCase()}! Just ${lpRemaining} LP to go!`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
    });

    // Batch write notifications
    const batch = db.batch();
    notifications.forEach((notif) => {
      const ref = db.collection('levelUpNotifications').doc();
      batch.set(ref, { ...notif, notificationId: ref.id });
    });

    await batch.commit();

    logger.info(`Sent ${notifications.length} milestone notifications`);
    return { success: true, count: notifications.length };
  });

/**
 * Send boost activation notification
 */
async function sendBoostActivationNotification(
  creatorId: string,
  boostType: string,
  expiresAt: Date
): Promise<void> {
  const notification = {
    creatorId,
    type: 'boost_activated',
    boostType,
    title: `Your ${boostType} boost is now active for 1 hour`,
    message: `Increased visibility until ${expiresAt.toLocaleTimeString()}`,
    read: false,
    createdAt: serverTimestamp(),
  };

  await db.collection('levelUpNotifications').add(notification);
}

/**
 * Notify when top supporter comes online
 */
export const notifyTopSupporterOnline = functions.firestore
  .document('users/{userId}/presence/status')
  .onUpdate(async (change, context) => {
    const newStatus = change.after.data();
    const oldStatus = change.before.data();

    // Only proceed if user came online
    if (oldStatus.status !== 'online' && newStatus.status === 'online') {
      const userId = context.params.userId;

      // Find creators for whom this user is a top supporter
      const supporterDocs = await db
        .collectionGroup('topSupporters')
        .where('supporterId', '==', userId)
        .orderBy('totalSpent', 'desc')
        .limit(5)
        .get();

      const notifications: any[] = [];

      supporterDocs.forEach((doc) => {
        const creatorId = doc.ref.parent.parent!.id;
        const supporter = doc.data();

        notifications.push({
          creatorId,
          type: 'top_supporter_online',
          supporterId: userId,
          title: '⭐ VIP Supporter Online',
          message: `${supporter.username} is now active! They've spent ${supporter.totalSpent} tokens with you.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      });

      // Batch write
      const batch = db.batch();
      notifications.forEach((notif) => {
        const ref = db.collection('levelUpNotifications').doc();
        batch.set(ref, { ...notif, notificationId: ref.id });
      });

      await batch.commit();

      logger.info(`Sent ${notifications.length} top supporter online notifications`);
    }
  });

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get creator level profile
 */
export const getCreatorLevel = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const creatorId = data.creatorId || context.auth.uid;

  // Only allow users to view their own level or public basic info
  const isOwner = creatorId === context.auth.uid;

  const levelDoc = await db.collection('creatorLevels').doc(creatorId).get();

  if (!levelDoc.exists) {
    return { success: false, message: 'Creator level not found' };
  }

  const profile = levelDoc.data() as CreatorLevelProfile;

  // Return full profile if owner, partial if public
  if (isOwner) {
    const rewardsDoc = await db.collection('creatorRewards').doc(creatorId).get();
    const rewards = rewardsDoc.exists ? rewardsDoc.data() : null;

    return {
      success: true,
      profile,
      rewards,
    };
  } else {
    // Public view - only show level and badge
    return {
      success: true,
      public: {
        level: profile.level,
        badge: {
          level: profile.level,
          color: LEVEL_CONFIGS[profile.level].badgeColor,
        },
      },
    };
  }
});

/**
 * Get LP activity history
 */
export const getLPActivityHistory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const creatorId = context.auth.uid;
  const { limit = 50, startAfter } = data;

  let query = db
    .collection('levelPoints')
    .doc(creatorId)
    .collection('activities')
    .orderBy('timestamp', 'desc')
    .limit(limit);

  if (startAfter) {
    const lastDoc = await db
      .collection('levelPoints')
      .doc(creatorId)
      .collection('activities')
      .doc(startAfter)
      .get();
    
    if (lastDoc.exists) {
      query = query.startAfter(lastDoc);
    }
  }

  const snapshot = await query.get();
  const activities = snapshot.docs.map(doc => doc.data());

  return {
    success: true,
    activities,
    hasMore: snapshot.size === limit,
  };
});

// ============================================================================
// All functions are exported inline above
// ============================================================================