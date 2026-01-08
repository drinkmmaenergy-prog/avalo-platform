/**
 * PACK 94 — Discovery Profile Builder
 * Background jobs to build and maintain discovery_profiles collection
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  DiscoveryProfile,
  RebuildReason,
  VisibilityTier,
  NSFWAffinity,
  ContentRating,
} from './types/discovery.types';
import { getTrustProfile } from './trustRiskEngine';
import { getEnforcementState } from './enforcementEngine';

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (...args: any[]) => console.log('[ProfileBuilder]', ...args),
  warn: (...args: any[]) => console.warn('[ProfileBuilder]', ...args),
  error: (...args: any[]) => console.error('[ProfileBuilder]', ...args),
};

// ============================================================================
// PROFILE SCORING HELPERS
// ============================================================================

/**
 * Calculate profile completeness score (0-100)
 */
function calculateProfileCompleteness(userData: any): number {
  let score = 0;
  
  // Photos (40 points)
  const photos = userData?.profile?.photos || [];
  if (photos.length >= 1) score += 20;
  if (photos.length >= 3) score += 10;
  if (photos.length >= 5) score += 10;
  
  // Bio (20 points)
  const bio = userData?.bio || '';
  if (bio.length >= 50) score += 10;
  if (bio.length >= 150) score += 10;
  
  // Profile fields (20 points)
  if (userData?.profile?.gender) score += 5;
  if (userData?.profile?.seeking && userData.profile.seeking.length > 0) score += 5;
  if (userData?.profile?.interests && userData.profile.interests.length > 0) score += 10;
  
  // Verification (20 points)
  if (userData?.verification?.selfie) score += 10;
  if (userData?.verification?.phone) score += 5;
  if (userData?.verification?.age18) score += 5;
  
  return Math.min(100, score);
}

/**
 * Calculate engagement score (0-100)
 * Based on followers, chats, monetized interactions
 */
async function calculateEngagementScore(userId: string): Promise<number> {
  let score = 0;
  
  try {
    // Get user stats
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    // Followers (30 points)
    const followers = userData?.stats?.followers || 0;
    if (followers >= 1) score += 5;
    if (followers >= 10) score += 10;
    if (followers >= 50) score += 10;
    if (followers >= 100) score += 5;
    
    // Chat interactions (30 points)
    const chatsSnapshot = await db
      .collection('chats')
      .where('participants', 'array-contains', userId)
      .where('status', '==', 'ACTIVE')
      .limit(100)
      .get();
    
    const activeChats = chatsSnapshot.size;
    if (activeChats >= 1) score += 10;
    if (activeChats >= 5) score += 10;
    if (activeChats >= 10) score += 10;
    
    // Profile views (20 points)
    const views = userData?.stats?.profileViews || 0;
    if (views >= 10) score += 5;
    if (views >= 50) score += 5;
    if (views >= 100) score += 5;
    if (views >= 500) score += 5;
    
    // Likes received (20 points)
    const likes = userData?.stats?.likesReceived || 0;
    if (likes >= 5) score += 5;
    if (likes >= 20) score += 5;
    if (likes >= 50) score += 5;
    if (likes >= 100) score += 5;
    
  } catch (error) {
    logger.error('Error calculating engagement score:', error);
  }
  
  return Math.min(100, score);
}

/**
 * Calculate monetization score (0-100)
 * Based on earnings and paid interactions (bounded, not pay-to-win)
 */
async function calculateMonetizationScore(userId: string): Promise<number> {
  let score = 0;
  
  try {
    // Get wallet data
    const walletDoc = await db.collection('wallets').doc(userId).get();
    const walletData = walletDoc.data();
    
    // Total earned (40 points)
    const totalEarned = walletData?.earned || 0;
    if (totalEarned >= 100) score += 10; // ~20 PLN
    if (totalEarned >= 500) score += 10; // ~100 PLN
    if (totalEarned >= 2000) score += 10; // ~400 PLN
    if (totalEarned >= 5000) score += 10; // ~1000 PLN
    
    // Paid interactions count (30 points)
    const transactionsSnapshot = await db
      .collection('transactions')
      .where('uid', '==', userId)
      .where('type', 'in', ['CHAT_DEPOSIT', 'GIFT_SENT', 'PREMIUM_STORY'])
      .where('status', '==', 'completed')
      .limit(100)
      .get();
    
    const paidInteractions = transactionsSnapshot.size;
    if (paidInteractions >= 1) score += 10;
    if (paidInteractions >= 5) score += 10;
    if (paidInteractions >= 20) score += 10;
    
    // Premium content (30 points)
    const premiumStoriesSnapshot = await db
      .collection('premium_stories')
      .where('creatorId', '==', userId)
      .where('status', '==', 'published')
      .limit(50)
      .get();
    
    const premiumStories = premiumStoriesSnapshot.size;
    if (premiumStories >= 1) score += 10;
    if (premiumStories >= 5) score += 10;
    if (premiumStories >= 10) score += 10;
    
  } catch (error) {
    logger.error('Error calculating monetization score:', error);
  }
  
  return Math.min(100, score);
}

/**
 * Determine NSFW affinity from user content
 */
async function determineNSFWAffinity(userId: string): Promise<NSFWAffinity> {
  try {
    // Check if user has NSFW content
    const nsfwContentSnapshot = await db
      .collection('media')
      .where('userId', '==', userId)
      .where('contentRating', 'in', ['NSFW_SOFT', 'NSFW_STRONG'])
      .limit(1)
      .get();
    
    if (nsfwContentSnapshot.empty) {
      return 'NONE';
    }
    
    // Check for strong NSFW
    const strongNSFWSnapshot = await db
      .collection('media')
      .where('userId', '==', userId)
      .where('contentRating', '==', 'NSFW_STRONG')
      .limit(1)
      .get();
    
    if (!strongNSFWSnapshot.empty) {
      return 'STRONG';
    }
    
    return 'SOFT';
  } catch (error) {
    logger.error('Error determining NSFW affinity:', error);
    return 'NONE';
  }
}

/**
 * Determine max content rating from user's public content
 */
async function determineContentRatingMax(userId: string): Promise<ContentRating> {
  try {
    // Check for NSFW_STRONG
    const strongSnapshot = await db
      .collection('media')
      .where('userId', '==', userId)
      .where('contentRating', '==', 'NSFW_STRONG')
      .where('visibility', '==', 'public')
      .limit(1)
      .get();
    
    if (!strongSnapshot.empty) {
      return 'NSFW_STRONG';
    }
    
    // Check for NSFW_SOFT
    const softSnapshot = await db
      .collection('media')
      .where('userId', '==', userId)
      .where('contentRating', '==', 'NSFW_SOFT')
      .where('visibility', '==', 'public')
      .limit(1)
      .get();
    
    if (!softSnapshot.empty) {
      return 'NSFW_SOFT';
    }
    
    // Check for SENSITIVE
    const sensitiveSnapshot = await db
      .collection('media')
      .where('userId', '==', userId)
      .where('contentRating', '==', 'SENSITIVE')
      .where('visibility', '==', 'public')
      .limit(1)
      .get();
    
    if (!sensitiveSnapshot.empty) {
      return 'SENSITIVE';
    }
    
    // Default to SFW
    return 'SFW';
  } catch (error) {
    logger.error('Error determining content rating max:', error);
    return 'SFW';
  }
}

// ============================================================================
// PROFILE REBUILD
// ============================================================================

/**
 * Rebuild discovery profile for a user
 * Main entry point called by triggers and scheduled jobs
 */
export async function rebuildDiscoveryProfile(
  userId: string,
  reason: RebuildReason = 'MANUAL_TRIGGER'
): Promise<DiscoveryProfile> {
  try {
    logger.info(`Rebuilding discovery profile for user ${userId} (reason: ${reason})`);
    
    // Fetch user data
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new Error(`User ${userId} not found`);
    }
    
    const userData = userDoc.data();
    
    // Fetch trust profile
    let trustProfile;
    try {
      trustProfile = await getTrustProfile(userId);
    } catch (error) {
      logger.warn(`Trust profile not found for user ${userId}, using defaults`);
      trustProfile = {
        userId,
        riskScore: 10,
        enforcementLevel: 'NONE',
        flags: [],
      };
    }
    
    // Fetch enforcement state
    let enforcementState;
    try {
      enforcementState = await getEnforcementState(userId);
    } catch (error) {
      logger.warn(`Enforcement state not found for user ${userId}, using defaults`);
      enforcementState = {
        userId,
        accountStatus: 'ACTIVE',
        featureLocks: [],
        visibilityTier: 'NORMAL',
        reasonCodes: [],
        manualOverride: false,
      };
    }
    
    // Calculate scores
    const profileCompleteness = calculateProfileCompleteness(userData);
    const engagementScore = await calculateEngagementScore(userId);
    const monetizationScore = await calculateMonetizationScore(userId);
    
    // Determine NSFW preferences
    const nsfwAffinity = await determineNSFWAffinity(userId);
    const contentRatingMax = await determineContentRatingMax(userId);
    
    // Determine if discoverable
    const isDiscoverable = 
      (userData?.modes?.incognito !== true) && // Not in incognito mode
      (enforcementState?.accountStatus !== 'SUSPENDED') && // Not suspended
      (enforcementState?.visibilityTier !== 'HIDDEN') && // Not hidden
      (userData?.profileComplete === true); // Profile is complete
    
    // Map enforcement level
    let enforcementLevel: 'NONE' | 'SOFT_LIMIT' | 'HARD_LIMIT' | 'SUSPENDED';
    if (enforcementState?.accountStatus === 'SUSPENDED') {
      enforcementLevel = 'SUSPENDED';
    } else if (enforcementState?.accountStatus === 'HARD_RESTRICTED') {
      enforcementLevel = 'HARD_LIMIT';
    } else if (enforcementState?.accountStatus === 'SOFT_RESTRICTED') {
      enforcementLevel = 'SOFT_LIMIT';
    } else {
      enforcementLevel = 'NONE';
    }
    
    // Build discovery profile
    const discoveryProfile: DiscoveryProfile = {
      userId,
      isDiscoverable,
      gender: userData?.profile?.gender || 'other',
      age: userData?.profile?.age || 18,
      countryCode: userData?.location?.country?.toUpperCase() || 'UNKNOWN',
      lastActiveAt: userData?.lastActiveAt || Timestamp.now(),
      profileCompleteness,
      engagementScore,
      monetizationScore,
      trustScore: trustProfile.riskScore,
      enforcementLevel,
      visibilityTier: enforcementState?.visibilityTier || 'NORMAL',
      nsfwAffinity,
      contentRatingMax,
      updatedAt: serverTimestamp() as Timestamp,
    };
    
    // Write to Firestore
    await db
      .collection('discovery_profiles')
      .doc(userId)
      .set(discoveryProfile);
    
    logger.info(
      `Discovery profile rebuilt for user ${userId}: ` +
      `discoverable=${isDiscoverable}, ` +
      `profile=${profileCompleteness}, ` +
      `engagement=${engagementScore}, ` +
      `monetization=${monetizationScore}, ` +
      `trust=${trustProfile.riskScore}, ` +
      `enforcement=${enforcementLevel}`
    );
    
    return discoveryProfile;
  } catch (error) {
    logger.error(`Error rebuilding discovery profile for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Bulk rebuild discovery profiles
 * Used for scheduled maintenance and migrations
 */
export async function bulkRebuildDiscoveryProfiles(
  batchSize: number = 100,
  cursor?: string
): Promise<{ processed: number; errors: number; nextCursor?: string }> {
  let processed = 0;
  let errors = 0;
  
  try {
    logger.info(`Starting bulk rebuild, batchSize=${batchSize}`);
    
    // Query users
    let query = db
      .collection('users')
      .where('profileComplete', '==', true)
      .limit(batchSize);
    
    if (cursor) {
      const cursorDoc = await db.collection('users').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }
    
    const snapshot = await query.get();
    
    // Rebuild each profile
    for (const doc of snapshot.docs) {
      try {
        await rebuildDiscoveryProfile(doc.id, 'SCHEDULED_REFRESH');
        processed++;
      } catch (error) {
        logger.error(`Error rebuilding profile for user ${doc.id}:`, error);
        errors++;
      }
    }
    
    // Determine next cursor
    const nextCursor = snapshot.docs.length === batchSize
      ? snapshot.docs[snapshot.docs.length - 1].id
      : undefined;
    
    logger.info(`Bulk rebuild completed: ${processed} processed, ${errors} errors`);
    
    return { processed, errors, nextCursor };
  } catch (error) {
    logger.error('Error in bulk rebuild:', error);
    throw error;
  }
}

/**
 * Refresh stale discovery profiles
 * Rebuilds profiles that haven't been updated in X days
 */
export async function refreshStaleProfiles(
  daysOld: number = 7,
  batchSize: number = 100
): Promise<{ refreshed: number; errors: number }> {
  let refreshed = 0;
  let errors = 0;
  
  try {
    logger.info(`Refreshing profiles older than ${daysOld} days`);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffTimestamp = Timestamp.fromDate(cutoffDate);
    
    // Query stale profiles
    const snapshot = await db
      .collection('discovery_profiles')
      .where('updatedAt', '<=', cutoffTimestamp)
      .limit(batchSize)
      .get();
    
    logger.info(`Found ${snapshot.size} stale profiles`);
    
    // Rebuild each profile
    for (const doc of snapshot.docs) {
      try {
        await rebuildDiscoveryProfile(doc.id, 'SCHEDULED_REFRESH');
        refreshed++;
      } catch (error) {
        logger.error(`Error refreshing profile for user ${doc.id}:`, error);
        errors++;
      }
    }
    
    logger.info(`Stale profile refresh completed: ${refreshed} refreshed, ${errors} errors`);
    
    return { refreshed, errors };
  } catch (error) {
    logger.error('Error refreshing stale profiles:', error);
    throw error;
  }
}

/**
 * Degrade inactive user scores
 * Reduces engagement/monetization scores for very inactive users
 */
export async function degradeInactiveUserScores(
  inactiveDays: number = 30,
  batchSize: number = 100
): Promise<{ degraded: number }> {
  let degraded = 0;
  
  try {
    logger.info(`Degrading scores for users inactive for ${inactiveDays} days`);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);
    const cutoffTimestamp = Timestamp.fromDate(cutoffDate);
    
    // Query inactive profiles
    const snapshot = await db
      .collection('discovery_profiles')
      .where('lastActiveAt', '<=', cutoffTimestamp)
      .where('engagementScore', '>', 0)
      .limit(batchSize)
      .get();
    
    logger.info(`Found ${snapshot.size} inactive profiles to degrade`);
    
    // Degrade each profile
    const batch = db.batch();
    for (const doc of snapshot.docs) {
      const profile = doc.data() as DiscoveryProfile;
      
      // Reduce scores by 20%
      const newEngagement = Math.floor(profile.engagementScore * 0.8);
      const newMonetization = Math.floor(profile.monetizationScore * 0.8);
      
      batch.update(doc.ref, {
        engagementScore: newEngagement,
        monetizationScore: newMonetization,
        updatedAt: serverTimestamp(),
      });
      
      degraded++;
    }
    
    await batch.commit();
    
    logger.info(`Degraded ${degraded} inactive user scores`);
    
    return { degraded };
  } catch (error) {
    logger.error('Error degrading inactive user scores:', error);
    throw error;
  }
}

logger.info('✅ Discovery Profile Builder initialized');