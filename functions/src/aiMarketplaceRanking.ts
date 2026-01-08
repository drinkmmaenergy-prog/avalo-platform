/**
 * PACK 311 — AI Companions Marketplace, Ranking & Owner Analytics
 * Ranking logic and analytics aggregation
 */

import { db } from './init.js';
import type {
  AIAvatarIndex,
  AIAvatarIndexStats,
  AIAvatarIndexTrust,
  RankingCalculation,
  AnalyticsAggregationResult,
  TrustLevel,
  RiskLevel
} from './aiMarketplaceTypes.js';

/**
 * Calculate ranking score for an AI avatar
 */
export function calculateRankingScore(
  stats: AIAvatarIndexStats,
  trustLevel: TrustLevel,
  riskLevel: RiskLevel
): RankingCalculation {
  // Base scoring from stats
  const viewsScore = stats.views7d * 0.01;
  const startsScore = stats.starts7d * 0.1;
  const earningsScore = stats.tokensEarned7d * 0.001;
  const retentionScore = stats.retentionScore * 0.5;

  // Trust bonus
  let trustBonus = 0;
  if (trustLevel === 'HIGH') trustBonus = 0.2;
  else if (trustLevel === 'MEDIUM') trustBonus = 0.1;
  else trustBonus = 0.0;

  // Risk penalty
  let riskPenalty = 0;
  if (riskLevel === 'MEDIUM') riskPenalty = -0.2;
  else if (riskLevel === 'HIGH') riskPenalty = -0.5;
  else if (riskLevel === 'CRITICAL') riskPenalty = -1.0;

  // Calculate raw score
  const rawScore = Math.max(0,
    viewsScore + startsScore + earningsScore + retentionScore +
    trustBonus + riskPenalty
  );

  // Normalize to 0-100 range (for UI display)
  const normalizedScore = Math.min(100, rawScore * 10);

  return {
    avatarId: '',
    rawScore,
    normalizedScore,
    breakdown: {
      viewsScore,
      startsScore,
      earningsScore,
      retentionScore,
      trustBonus,
      riskPenalty
    }
  };
}

/**
 * Aggregate analytics for a specific avatar
 */
export async function aggregateAvatarAnalytics(
  avatarId: string,
  daysBack7: Date,
  daysBack30: Date
): Promise<AnalyticsAggregationResult> {
  const now = new Date();

  // Get view events from analytics
  const viewEvents7d = await db.collection('analytics_events')
    .where('eventType', '==', 'AI_AVATAR_CARD_VIEWED')
    .where('avatarId', '==', avatarId)
    .where('timestamp', '>=', daysBack7.toISOString())
    .where('timestamp', '<=', now.toISOString())
    .get();

  const viewEvents30d = await db.collection('analytics_events')
    .where('eventType', '==', 'AI_AVATAR_CARD_VIEWED')
    .where('avatarId', '==', avatarId)
    .where('timestamp', '>=', daysBack30.toISOString())
    .where('timestamp', '<=', now.toISOString())
    .get();

  // Get chat start events
  const startEvents7d = await db.collection('analytics_events')
    .where('eventType', '==', 'AI_AVATAR_CHAT_STARTED')
    .where('avatarId', '==', avatarId)
    .where('timestamp', '>=', daysBack7.toISOString())
    .where('timestamp', '<=', now.toISOString())
    .get();

  const startEvents30d = await db.collection('analytics_events')
    .where('eventType', '==', 'AI_AVATAR_CHAT_STARTED')
    .where('avatarId', '==', avatarId)
    .where('timestamp', '>=', daysBack30.toISOString())
    .where('timestamp', '<=', now.toISOString())
    .get();

  // Calculate unique and returning users (7d window)
  const uniqueUsers7d = new Set<string>();
  const userSessions = new Map<string, number>();

  startEvents7d.docs.forEach(doc => {
    const userId = doc.data().userId;
    uniqueUsers7d.add(userId);
    userSessions.set(userId, (userSessions.get(userId) || 0) + 1);
  });

  const returningUsers7d = Array.from(userSessions.values())
    .filter(count => count > 1).length;

  // Calculate tokens earned from avatar analytics
  const analyticsSnap = await db.collection('aiAvatarAnalytics')
    .doc(avatarId)
    .get();

  const analyticsData = analyticsSnap.data();
  
  // Get sessions in the time periods to calculate earnings
  const sessions7d = await db.collection('aiSessions')
    .where('avatarId', '==', avatarId)
    .where('createdAt', '>=', daysBack7.toISOString())
    .get();

  const sessions30d = await db.collection('aiSessions')
    .where('avatarId', '==', avatarId)
    .where('createdAt', '>=', daysBack30.toISOString())
    .get();

  const tokensEarned7d = sessions7d.docs.reduce((sum, doc) => 
    sum + (doc.data().tokensCreatorShare || 0), 0
  );

  const tokensEarned30d = sessions30d.docs.reduce((sum, doc) => 
    sum + (doc.data().tokensCreatorShare || 0), 0
  );

  // Calculate retention score
  const retentionScore = uniqueUsers7d.size > 0 
    ? returningUsers7d / uniqueUsers7d.size 
    : 0;

  return {
    avatarId,
    views7d: viewEvents7d.size,
    views30d: viewEvents30d.size,
    chatStarts7d: startEvents7d.size,
    chatStarts30d: startEvents30d.size,
    uniqueUsers7d: uniqueUsers7d.size,
    returningUsers7d,
    tokensEarned7d,
    tokensEarned30d,
    retentionScore
  };
}

/**
 * Get trust and risk information for an avatar owner
 */
export async function getOwnerTrustInfo(ownerId: string): Promise<{
  verified: boolean;
  trustLevel: TrustLevel;
}> {
  const userSnap = await db.collection('users').doc(ownerId).get();
  
  if (!userSnap.exists) {
    return { verified: false, trustLevel: 'LOW' };
  }

  const userData = userSnap.data() as any;

  // Check verification status (from PACK 306)
  const verified = userData.verified18Plus === true || 
                   userData.verificationStatus === 'VERIFIED';

  // Determine trust level based on various factors
  let trustLevel: TrustLevel = 'LOW';

  const trustScore = userData.trustScore || 0;
  const accountAge = Date.now() - new Date(userData.createdAt).getTime();
  const accountAgeDays = accountAge / (1000 * 60 * 60 * 24);

  if (trustScore >= 80 && accountAgeDays >= 90 && verified) {
    trustLevel = 'HIGH';
  } else if (trustScore >= 50 && accountAgeDays >= 30 && verified) {
    trustLevel = 'MEDIUM';
  } else {
    trustLevel = 'LOW';
  }

  return { verified, trustLevel };
}

/**
 * Get category tags from avatar persona
 */
export function deriveCategoryTags(avatar: any): string[] {
  const tags: string[] = [];

  // From vibe
  if (avatar.personaProfile?.vibe) {
    if (avatar.personaProfile.vibe.includes('romantic') || 
        avatar.personaProfile.vibe.includes('playful')) {
      tags.push('romantic');
    }
    if (avatar.personaProfile.vibe.includes('intellectual') ||
        avatar.personaProfile.vibe.includes('creative')) {
      tags.push('intellectual');
    }
  }

  // From style tone
  if (avatar.styleConfig?.tone) {
    if (avatar.styleConfig.tone === 'SOFT_FLIRTY') {
      tags.push('flirty');
    } else if (avatar.styleConfig.tone === 'COACH') {
      tags.push('coach');
    } else if (avatar.styleConfig.tone === 'FRIENDLY') {
      tags.push('chatty');
    }
  }

  // From topics
  if (avatar.personaProfile?.topics) {
    if (avatar.personaProfile.topics.includes('fitness') ||
        avatar.personaProfile.topics.includes('wellness')) {
      tags.push('wellness');
    }
  }

  return Array.from(new Set(tags)); // Remove duplicates
}

/**
 * Rebuild index for a single avatar
 */
export async function rebuildAvatarIndex(avatarId: string): Promise<void> {
  // Get avatar data
  const avatarSnap = await db.collection('aiAvatars').doc(avatarId).get();
  
  if (!avatarSnap.exists) {
    console.log(`Avatar ${avatarId} not found, skipping index rebuild`);
    return;
  }

  const avatar = avatarSnap.data();

  // Skip if not ACTIVE
  if (avatar.status !== 'ACTIVE') {
    console.log(`Avatar ${avatarId} is ${avatar.status}, skipping index rebuild`);
    return;
  }

  // Get owner info
  const ownerSnap = await db.collection('users').doc(avatar.ownerId).get();
  const ownerData = ownerSnap.data();

  // Get trust info
  const trustInfo = await getOwnerTrustInfo(avatar.ownerId);

  // Aggregate analytics
  const now = new Date();
  const daysBack7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const daysBack30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const analytics = await aggregateAvatarAnalytics(avatarId, daysBack7, daysBack30);

  // Build stats object
  const stats: AIAvatarIndexStats = {
    views7d: analytics.views7d,
    views30d: analytics.views30d,
    starts7d: analytics.chatStarts7d,
    starts30d: analytics.chatStarts30d,
    tokensEarned7d: analytics.tokensEarned7d,
    tokensEarned30d: analytics.tokensEarned30d,
    retentionScore: analytics.retentionScore
  };

  // Build trust object
  const trust: AIAvatarIndexTrust = {
    ownerVerified: trustInfo.verified,
    ownerTrustLevel: trustInfo.trustLevel,
    riskLevel: avatar.safety?.riskLevel || 'LOW'
  };

  // Calculate ranking score
  const ranking = calculateRankingScore(stats, trust.ownerTrustLevel, trust.riskLevel);

  // Get primary photo URL
  const primaryPhotoId = avatar.media?.primaryPhotoId;
  let primaryPhotoUrl = '';
  
  if (primaryPhotoId) {
    const photoSnap = await db.collection('photos').doc(primaryPhotoId).get();
    if (photoSnap.exists) {
      primaryPhotoUrl = photoSnap.data()?.url || '';
    }
  }

  // Derive category tags
  const categoryTags = deriveCategoryTags(avatar);

  // Build index document
  const indexDoc: AIAvatarIndex = {
    avatarId,
    ownerId: avatar.ownerId,
    status: avatar.status,
    displayName: avatar.displayName,
    shortTagline: avatar.shortTagline,
    primaryPhotoUrl,
    languages: avatar.languageCodes || ['en'],
    primaryLanguage: avatar.languageCodes?.[0] || 'en',
    categoryTags,
    country: ownerData?.country || 'PL',
    region: ownerData?.region,
    trust,
    stats,
    rankingScore: ranking.normalizedScore,
    lastRankingUpdatedAt: now.toISOString()
  };

  // Write to index
  await db.collection('aiAvatarIndex').doc(avatarId).set(indexDoc);

  console.log(`Rebuilt index for avatar ${avatarId}, ranking score: ${ranking.normalizedScore}`);
}

/**
 * Rebuild indexes for all active avatars
 */
export async function rebuildAllAvatarIndexes(): Promise<{
  processed: number;
  skipped: number;
  errors: number;
}> {
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  // Get all avatars
  const avatarsSnap = await db.collection('aiAvatars')
    .where('status', '==', 'ACTIVE')
    .get();

  console.log(`Found ${avatarsSnap.size} active avatars to index`);

  // Process each avatar
  for (const avatarDoc of avatarsSnap.docs) {
    try {
      await rebuildAvatarIndex(avatarDoc.id);
      processed++;
    } catch (error) {
      console.error(`Error rebuilding index for avatar ${avatarDoc.id}:`, error);
      errors++;
    }
  }

  console.log(`Index rebuild complete: ${processed} processed, ${skipped} skipped, ${errors} errors`);

  return { processed, skipped, errors };
}