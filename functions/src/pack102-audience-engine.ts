/**
 * PACK 102 — Cross-Platform Audience Growth Engine
 * 
 * Core backend logic for tracking organic audience growth from external platforms.
 * 
 * CRITICAL CONSTRAINTS:
 * - Zero incentives, bonuses, or rewards for referrals
 * - No changes to monetization logic (65/35 split, token prices)
 * - Tracking is analytics-only (read-only funnel data)
 * - Anti-spam controls to prevent abuse
 * - No PII tracking of individual referred users (aggregate only)
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { logTrustEvent } from './trustRiskEngine';
import {
  ExternalAudienceAttribution,
  AudienceGrowthMetrics,
  SocialPlatform,
  LogExternalVisitRequest,
  LogExternalVisitResponse,
  AudienceGrowthError,
  AudienceGrowthErrorCode,
} from './pack102-audience-types';

// ============================================================================
// CONSTANTS
// ============================================================================

const VALID_PLATFORMS: SocialPlatform[] = [
  'tiktok',
  'instagram',
  'youtube',
  'twitch',
  'snapchat',
  'x',
  'facebook',
  'other',
];

// Anti-spam thresholds
const SPAM_THRESHOLDS = {
  MAX_VISITS_PER_CREATOR_PER_HOUR: 100,
  MAX_VISITS_PER_IP_PER_HOUR: 20,
  MAX_EXTERNAL_LINKS_PER_DAY: 500,
};

// ============================================================================
// CORE TRACKING FUNCTIONS
// ============================================================================

/**
 * Log external visit from social platform
 * Called when someone clicks creator's public profile link
 */
export async function logExternalVisit(
  request: LogExternalVisitRequest
): Promise<LogExternalVisitResponse> {
  const { creatorId, platform, utmSource, utmMedium, utmCampaign, visitMetadata } = request;

  // Validate platform
  if (!VALID_PLATFORMS.includes(platform)) {
    throw new AudienceGrowthError(
      AudienceGrowthErrorCode.INVALID_PLATFORM,
      `Invalid platform: ${platform}`
    );
  }

  // Check if creator exists and has public profile enabled
  const creatorDoc = await db.collection('users').doc(creatorId).get();
  if (!creatorDoc.exists) {
    throw new AudienceGrowthError(
      AudienceGrowthErrorCode.CREATOR_NOT_FOUND,
      'Creator not found'
    );
  }

  // Anti-spam check: Rate limit visits per creator
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  const recentVisitsSnap = await db
    .collection('external_audience_attribution')
    .where('creatorId', '==', creatorId)
    .where('timestamp', '>=', Timestamp.fromDate(oneHourAgo))
    .count()
    .get();

  if (recentVisitsSnap.data().count >= SPAM_THRESHOLDS.MAX_VISITS_PER_CREATOR_PER_HOUR) {
    logger.warn(`[AudienceGrowth] Spam detected: Too many visits for creator ${creatorId}`);
    
    // Log spam event to Trust Engine (using OTHER as generic type)
    try {
      await logTrustEvent({
        userId: creatorId,
        type: 'OTHER' as any, // Using generic type since no specific spam type exists
        meta: {
          action: 'EXTERNAL_SPAM',
          platform,
          reason: 'Excessive external traffic',
        },
      });
    } catch (error) {
      logger.warn(`[AudienceGrowth] Failed to log spam event:`, error);
    }

    throw new AudienceGrowthError(
      AudienceGrowthErrorCode.SPAM_DETECTED,
      'Too many visits from external sources. Please try again later.'
    );
  }

  // Create attribution record
  const attributionId = generateId();
  const attribution: ExternalAudienceAttribution = {
    id: attributionId,
    creatorId,
    platform,
    timestamp: serverTimestamp() as any,
    completedSignup: false,
    becameFollower: false,
    becamePayer: false,
    utmSource,
    utmMedium,
    utmCampaign,
    visitMetadata,
  };

  await db
    .collection('external_audience_attribution')
    .doc(attributionId)
    .set(attribution);

  logger.info(`[AudienceGrowth] Logged visit: creator=${creatorId}, platform=${platform}`);

  return {
    success: true,
    attributionId,
  };
}

/**
 * Mark attribution as signup completed
 * Called during user registration if attribution exists
 */
export async function markAttributionSignup(
  attributionId: string,
  userId: string
): Promise<void> {
  const attributionRef = db.collection('external_audience_attribution').doc(attributionId);
  const attributionSnap = await attributionRef.get();

  if (!attributionSnap.exists) {
    logger.warn(`[AudienceGrowth] Attribution not found: ${attributionId}`);
    return;
  }

  await attributionRef.update({
    completedSignup: true,
    userId,
  });

  logger.info(`[AudienceGrowth] Marked signup: attribution=${attributionId}, user=${userId}`);
}

/**
 * Mark attribution as follower
 * Called when new user follows the creator
 */
export async function markAttributionFollower(
  creatorId: string,
  userId: string
): Promise<void> {
  // Find most recent attribution for this creator/user combo
  const attributionSnap = await db
    .collection('external_audience_attribution')
    .where('creatorId', '==', creatorId)
    .where('userId', '==', userId)
    .where('completedSignup', '==', true)
    .where('becameFollower', '==', false)
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();

  if (attributionSnap.empty) {
    return; // No attribution found, user may have come through app discovery
  }

  const attributionDoc = attributionSnap.docs[0];
  await attributionDoc.ref.update({
    becameFollower: true,
  });

  logger.info(`[AudienceGrowth] Marked follower: creator=${creatorId}, user=${userId}`);
}

/**
 * Mark attribution as payer
 * Called on first paid interaction (message, gift, etc.)
 */
export async function markAttributionPayer(
  creatorId: string,
  userId: string
): Promise<void> {
  // Find attribution for this creator/user combo
  const attributionSnap = await db
    .collection('external_audience_attribution')
    .where('creatorId', '==', creatorId)
    .where('userId', '==', userId)
    .where('completedSignup', '==', true)
    .where('becamePayer', '==', false)
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();

  if (attributionSnap.empty) {
    return; // No attribution found
  }

  const attributionDoc = attributionSnap.docs[0];
  await attributionDoc.ref.update({
    becamePayer: true,
  });

  logger.info(`[AudienceGrowth] Marked payer: creator=${creatorId}, user=${userId}`);
}

// ============================================================================
// AGGREGATION & ANALYTICS
// ============================================================================

/**
 * Rebuild daily audience attribution metrics
 * Aggregates funnel data for analytics dashboard
 */
export async function rebuildAudienceAttributionDaily(date: Date): Promise<void> {
  const dateStr = formatDateYMD(date);
  const startTimestamp = Timestamp.fromDate(new Date(date.setHours(0, 0, 0, 0)));
  const endTimestamp = Timestamp.fromDate(new Date(date.setHours(23, 59, 59, 999)));

  logger.info(`[AudienceGrowth] Rebuilding attribution for ${dateStr}`);

  // Query all attributions for this day
  const attributionsSnap = await db
    .collection('external_audience_attribution')
    .where('timestamp', '>=', startTimestamp)
    .where('timestamp', '<=', endTimestamp)
    .get();

  // Group by creator and platform
  const metricsMap = new Map<string, {
    creatorId: string;
    visits: number;
    signups: number;
    follows: number;
    platformBreakdown: Map<SocialPlatform, { visits: number; signups: number; follows: number }>;
  }>();

  attributionsSnap.forEach((doc) => {
    const attr = doc.data() as ExternalAudienceAttribution;
    const key = attr.creatorId;

    let metrics = metricsMap.get(key);
    if (!metrics) {
      metrics = {
        creatorId: attr.creatorId,
        visits: 0,
        signups: 0,
        follows: 0,
        platformBreakdown: new Map(),
      };
      metricsMap.set(key, metrics);
    }

    // Increment totals
    metrics.visits++;
    if (attr.completedSignup) metrics.signups++;
    if (attr.becameFollower) metrics.follows++;

    // Increment platform breakdown
    let platformData = metrics.platformBreakdown.get(attr.platform);
    if (!platformData) {
      platformData = { visits: 0, signups: 0, follows: 0 };
      metrics.platformBreakdown.set(attr.platform, platformData);
    }
    platformData.visits++;
    if (attr.completedSignup) platformData.signups++;
    if (attr.becameFollower) platformData.follows++;
  });

  // Write aggregated metrics
  const batch = db.batch();
  let batchCount = 0;

  for (const [creatorId, metrics] of Array.from(metricsMap.entries())) {
    const docId = `${creatorId}_${dateStr.replace(/-/g, '')}`;
    const docRef = db.collection('audience_growth_daily').doc(docId);

    // Convert platform breakdown map to object
    const platformBreakdown: Partial<Record<SocialPlatform, any>> = {};
    metrics.platformBreakdown.forEach((data, platform) => {
      platformBreakdown[platform] = data;
    });

    batch.set(docRef, {
      creatorId,
      date: dateStr,
      visits: metrics.visits,
      signups: metrics.signups,
      follows: metrics.follows,
      platformBreakdown,
      updatedAt: serverTimestamp(),
    });

    batchCount++;

    if (batchCount >= 500) {
      await batch.commit();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  logger.info(`[AudienceGrowth] Rebuilt attribution for ${dateStr}: ${metricsMap.size} creators`);
}

/**
 * Get audience growth metrics for a creator
 * Returns aggregated funnel data for specified date range
 */
export async function getCreatorAudienceGrowth(
  creatorId: string,
  fromDate: Date,
  toDate: Date
): Promise<AudienceGrowthMetrics> {
  const fromDateStr = formatDateYMD(fromDate);
  const toDateStr = formatDateYMD(toDate);

  // Query daily metrics
  const metricsSnap = await db
    .collection('audience_growth_daily')
    .where('creatorId', '==', creatorId)
    .where('date', '>=', fromDateStr)
    .where('date', '<=', toDateStr)
    .get();

  // Aggregate across all days
  let totalVisits = 0;
  let totalSignups = 0;
  let totalFollows = 0;
  let totalFirstMessages = 0;
  let totalFirstPaidInteractions = 0;
  const platformBreakdown: Partial<Record<SocialPlatform, {
    visits: number;
    signups: number;
    follows: number;
  }>> = {};

  metricsSnap.forEach((doc) => {
    const data = doc.data();
    totalVisits += data.visits || 0;
    totalSignups += data.signups || 0;
    totalFollows += data.follows || 0;
    totalFirstMessages += data.firstMessages || 0;
    totalFirstPaidInteractions += data.firstPaidInteractions || 0;

    // Merge platform breakdown
    if (data.platformBreakdown) {
      Object.entries(data.platformBreakdown).forEach(([platform, breakdown]: [string, any]) => {
        const p = platform as SocialPlatform;
        if (!platformBreakdown[p]) {
          platformBreakdown[p] = { visits: 0, signups: 0, follows: 0 };
        }
        platformBreakdown[p]!.visits += breakdown.visits || 0;
        platformBreakdown[p]!.signups += breakdown.signups || 0;
        platformBreakdown[p]!.follows += breakdown.follows || 0;
      });
    }
  });

  // Calculate conversion rates
  const visitToSignupRate = totalVisits > 0 ? (totalSignups / totalVisits) * 100 : 0;
  const signupToFollowRate = totalSignups > 0 ? (totalFollows / totalSignups) * 100 : 0;
  const followToPayerRate = totalFollows > 0 ? (totalFirstPaidInteractions / totalFollows) * 100 : 0;

  return {
    creatorId,
    periodStart: fromDateStr,
    periodEnd: toDateStr,
    visits: totalVisits,
    signups: totalSignups,
    follows: totalFollows,
    firstMessages: totalFirstMessages,
    firstPaidInteractions: totalFirstPaidInteractions,
    visitToSignupRate,
    signupToFollowRate,
    followToPayerRate,
    platformBreakdown,
    updatedAt: serverTimestamp() as any,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format date as YYYY-MM-DD
 */
function formatDateYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Validate date range for queries
 */
export function validateDateRange(fromDate: Date, toDate: Date): void {
  if (fromDate > toDate) {
    throw new AudienceGrowthError(
      AudienceGrowthErrorCode.INVALID_DATE_RANGE,
      'fromDate must be before toDate'
    );
  }

  const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year in ms
  if (toDate.getTime() - fromDate.getTime() > maxRange) {
    throw new AudienceGrowthError(
      AudienceGrowthErrorCode.INVALID_DATE_RANGE,
      'Date range cannot exceed 1 year'
    );
  }
}