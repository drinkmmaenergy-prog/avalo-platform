/**
 * PACK 108 — NSFW Discovery & Feed Containment
 * Containment = visibility reduction + user control, not promotion
 * 
 * RULES:
 * - NSFW_EXPLICIT never recommended to non-adult users (hard block)
 * - NSFW_EXPLICIT does not appear in default discovery feed
 * - Users may opt-in to segregated NSFW feed if legal in region
 * - NSFW content never receives ranking boost
 * - Likes/follows from NSFW content do not increase ranking for SAFE content
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  NSFWLevel,
  UserNSFWFeedAccess,
  CreatorContentProfile,
  DEFAULT_NSFW_DISCOVERY_RULES,
} from './pack108-types';
import { getUserSafetyPreferences } from './pack108-safety-preferences';
import { checkNSFWCompliance } from './pack108-compliance';

// ============================================================================
// DISCOVERY FILTERING
// ============================================================================

/**
 * Check if content should appear in discovery feed for user
 */
export async function canShowInDiscoveryFeed(
  userId: string,
  contentId: string,
  nsfwLevel: NSFWLevel
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // SAFE content always allowed in discovery
    if (nsfwLevel === 'SAFE') {
      return { allowed: true };
    }

    // BANNED content never appears
    if (nsfwLevel === 'BANNED') {
      return {
        allowed: false,
        reason: 'Content is prohibited',
      };
    }

    // Check user's safety preferences
    const prefs = await getUserSafetyPreferences(userId);
    
    if (!prefs.allowAdultContentInFeed) {
      return {
        allowed: false,
        reason: 'Adult content disabled in your preferences',
      };
    }

    // Check compliance (region, age, platform)
    const compliance = await checkNSFWCompliance(userId, nsfwLevel, 'VIEW');
    
    if (!compliance.canView) {
      return {
        allowed: false,
        reason: compliance.blockReason,
      };
    }

    // NSFW_EXPLICIT requires explicit opt-in to segregated feed
    if (nsfwLevel === 'NSFW_EXPLICIT') {
      const feedAccess = await getUserNSFWFeedAccess(userId);
      
      if (!feedAccess.hasAccess || !feedAccess.userOptedIn) {
        return {
          allowed: false,
          reason: 'Explicit content requires opt-in to adult feed',
        };
      }
    }

    return { allowed: true };
  } catch (error) {
    console.error(`[PACK108] Error checking discovery feed permission:`, error);
    return {
      allowed: false,
      reason: 'Error checking permissions',
    };
  }
}

/**
 * Check if content should appear in trending feed
 */
export async function canShowInTrendingFeed(
  userId: string,
  nsfwLevel: NSFWLevel
): Promise<boolean> {
  // Trending feed follows same rules as discovery but is more restrictive
  if (nsfwLevel !== 'SAFE') {
    return false; // Only SAFE content in trending
  }
  
  return true;
}

/**
 * Check if content should be recommended
 */
export async function canRecommendContent(
  userId: string,
  nsfwLevel: NSFWLevel
): Promise<boolean> {
  // Recommendations never include NSFW_EXPLICIT
  if (nsfwLevel === 'NSFW_EXPLICIT' || nsfwLevel === 'BANNED') {
    return false;
  }

  // Check user preferences for SOFT_NSFW
  if (nsfwLevel === 'SOFT_NSFW') {
    const prefs = await getUserSafetyPreferences(userId);
    return prefs.allowAdultContentInFeed;
  }

  return true;
}

// ============================================================================
// NSFW FEED ACCESS MANAGEMENT
// ============================================================================

/**
 * Get user's NSFW feed access status
 */
export async function getUserNSFWFeedAccess(
  userId: string
): Promise<UserNSFWFeedAccess> {
  try {
    const doc = await db.collection('user_nsfw_feed_access').doc(userId).get();

    if (doc.exists) {
      return doc.data() as UserNSFWFeedAccess;
    }

    // Create default access record
    return await createNSFWFeedAccess(userId);
  } catch (error) {
    console.error(`[PACK108] Error getting NSFW feed access:`, error);
    throw error;
  }
}

/**
 * Create NSFW feed access record
 */
async function createNSFWFeedAccess(userId: string): Promise<UserNSFWFeedAccess> {
  try {
    const prefs = await getUserSafetyPreferences(userId);
    
    const access: UserNSFWFeedAccess = {
      userId,
      hasAccess: prefs.ageVerified && prefs.nsfwLegalInRegion,
      ageVerified: prefs.ageVerified,
      minimumAgeMet: prefs.ageVerified,
      regionAllows: prefs.nsfwLegalInRegion,
      userOptedIn: false,
      feedUnlocked: false,
      updatedAt: serverTimestamp() as Timestamp,
    };

    await db.collection('user_nsfw_feed_access').doc(userId).set(access);
    
    return access;
  } catch (error) {
    console.error(`[PACK108] Error creating NSFW feed access:`, error);
    throw error;
  }
}

/**
 * Opt user into NSFW feed
 */
export async function optIntoNSFWFeed(userId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const access = await getUserNSFWFeedAccess(userId);

    // Verify eligibility
    if (!access.ageVerified) {
      return {
        success: false,
        error: 'Age verification required',
      };
    }

    if (!access.regionAllows) {
      return {
        success: false,
        error: 'Not available in your region',
      };
    }

    // Update opt-in status
    await db.collection('user_nsfw_feed_access').doc(userId).update({
      userOptedIn: true,
      hasAccess: true,
      updatedAt: serverTimestamp(),
    });

    console.log(`[PACK108] User ${userId} opted into NSFW feed`);
    return { success: true };
  } catch (error) {
    console.error(`[PACK108] Error opting into NSFW feed:`, error);
    return {
      success: false,
      error: 'Failed to opt in',
    };
  }
}

/**
 * Opt user out of NSFW feed
 */
export async function optOutOfNSFWFeed(userId: string): Promise<void> {
  try {
    await db.collection('user_nsfw_feed_access').doc(userId).update({
      userOptedIn: false,
      feedUnlocked: false,
      updatedAt: serverTimestamp(),
    });

    console.log(`[PACK108] User ${userId} opted out of NSFW feed`);
  } catch (error) {
    console.error(`[PACK108] Error opting out of NSFW feed:`, error);
    throw error;
  }
}

/**
 * Unlock NSFW feed for current session
 */
export async function unlockNSFWFeedSession(
  userId: string,
  durationMinutes: number = 60
): Promise<void> {
  try {
    const access = await getUserNSFWFeedAccess(userId);

    if (!access.hasAccess || !access.userOptedIn) {
      throw new Error('User does not have NSFW feed access');
    }

    const now = new Date();
    const unlockedUntil = new Date(now.getTime() + durationMinutes * 60 * 1000);

    await db.collection('user_nsfw_feed_access').doc(userId).update({
      feedUnlocked: true,
      unlockedAt: serverTimestamp(),
      unlockedUntil: Timestamp.fromDate(unlockedUntil),
      updatedAt: serverTimestamp(),
    });

    console.log(`[PACK108] NSFW feed unlocked for user ${userId} until ${unlockedUntil.toISOString()}`);
  } catch (error) {
    console.error(`[PACK108] Error unlocking NSFW feed:`, error);
    throw error;
  }
}

// ============================================================================
// RANKING & VISIBILITY PENALTIES
// ============================================================================

/**
 * Apply visibility penalty to NSFW content
 * Returns multiplier to apply to ranking score (< 1.0 = reduced)
 */
export function getNSFWVisibilityMultiplier(nsfwLevel: NSFWLevel): number {
  const rules = DEFAULT_NSFW_DISCOVERY_RULES;

  switch (nsfwLevel) {
    case 'SAFE':
      return 1.0; // No penalty

    case 'SOFT_NSFW':
      return 0.5; // 50% visibility reduction

    case 'NSFW_EXPLICIT':
      return rules.penaltyMultiplier; // 90% visibility reduction (0.1)

    case 'BANNED':
      return 0.0; // Complete removal

    default:
      return 1.0;
  }
}

/**
 * Check if engagement from NSFW content should boost SAFE content
 * Prevents NSFW from artificially boosting SAFE content rankings
 */
export function shouldPropagateEngagement(
  sourceNSFWLevel: NSFWLevel,
  targetNSFWLevel: NSFWLevel
): boolean {
  // SAFE to SAFE = always propagate
  if (sourceNSFWLevel === 'SAFE' && targetNSFWLevel === 'SAFE') {
    return true;
  }

  // NSFW to SAFE = never propagate (containment rule)
  if (sourceNSFWLevel !== 'SAFE' && targetNSFWLevel === 'SAFE') {
    return false;
  }

  // NSFW to NSFW = propagate
  if (sourceNSFWLevel !== 'SAFE' && targetNSFWLevel !== 'SAFE') {
    return true;
  }

  // SAFE to NSFW = propagate (user choosing to engage)
  return true;
}

// ============================================================================
// CREATOR CONTENT PROFILE
// ============================================================================

/**
 * Get or create creator content profile
 */
export async function getCreatorContentProfile(
  userId: string
): Promise<CreatorContentProfile> {
  try {
    const doc = await db.collection('creator_content_profiles').doc(userId).get();

    if (doc.exists) {
      return doc.data() as CreatorContentProfile;
    }

    // Create new profile
    return await createCreatorContentProfile(userId);
  } catch (error) {
    console.error(`[PACK108] Error getting creator content profile:`, error);
    throw error;
  }
}

/**
 * Create creator content profile
 */
async function createCreatorContentProfile(userId: string): Promise<CreatorContentProfile> {
  try {
    const profile: CreatorContentProfile = {
      userId,
      totalContent: 0,
      safeContent: 0,
      softNSFWContent: 0,
      explicitNSFWContent: 0,
      safeContentRatio: 1.0,
      nsfwContentRatio: 0.0,
      eligibleForSafeFeed: true,
      requiresSeparation: false,
      updatedAt: serverTimestamp() as Timestamp,
    };

    await db.collection('creator_content_profiles').doc(userId).set(profile);
    
    return profile;
  } catch (error) {
    console.error(`[PACK108] Error creating creator content profile:`, error);
    throw error;
  }
}

/**
 * Update creator content profile after content creation
 */
export async function updateCreatorContentProfile(
  userId: string,
  nsfwLevel: NSFWLevel
): Promise<void> {
  try {
    const profile = await getCreatorContentProfile(userId);

    // Increment counters
    const updates: any = {
      totalContent: profile.totalContent + 1,
      updatedAt: serverTimestamp(),
    };

    switch (nsfwLevel) {
      case 'SAFE':
        updates.safeContent = profile.safeContent + 1;
        updates.lastSafeContentAt = serverTimestamp();
        break;
      case 'SOFT_NSFW':
        updates.softNSFWContent = profile.softNSFWContent + 1;
        updates.lastNSFWContentAt = serverTimestamp();
        break;
      case 'NSFW_EXPLICIT':
        updates.explicitNSFWContent = profile.explicitNSFWContent + 1;
        updates.lastNSFWContentAt = serverTimestamp();
        break;
    }

    // Recalculate ratios
    const newTotal = profile.totalContent + 1;
    const newSafeCount = (profile.safeContent + (nsfwLevel === 'SAFE' ? 1 : 0));
    const newNSFWCount = newTotal - newSafeCount;

    updates.safeContentRatio = newSafeCount / newTotal;
    updates.nsfwContentRatio = newNSFWCount / newTotal;

    // Update eligibility
    updates.eligibleForSafeFeed = updates.safeContentRatio >= 0.8; // 80% safe content
    updates.requiresSeparation = updates.nsfwContentRatio > 0 && updates.safeContentRatio > 0;

    await db.collection('creator_content_profiles').doc(userId).update(updates);

    console.log(`[PACK108] Updated creator profile for ${userId}`);
  } catch (error) {
    console.error(`[PACK108] Error updating creator content profile:`, error);
  }
}

/**
 * Check if creator's content should be shown in safe feed
 */
export async function canShowCreatorInSafeFeed(userId: string): Promise<boolean> {
  try {
    const profile = await getCreatorContentProfile(userId);
    return profile.eligibleForSafeFeed;
  } catch (error) {
    console.error(`[PACK108] Error checking safe feed eligibility:`, error);
    return true; // Default to allowing
  }
}

// ============================================================================
// FEED CONSTRUCTION HELPERS
// ============================================================================

/**
 * Filter content list for user's feed
 */
export async function filterContentForFeed(
  userId: string,
  contentList: Array<{ id: string; nsfwLevel: NSFWLevel; creatorId: string }>
): Promise<Array<{ id: string; nsfwLevel: NSFWLevel; creatorId: string }>> {
  try {
    const filtered: Array<{ id: string; nsfwLevel: NSFWLevel; creatorId: string }> = [];

    for (const content of contentList) {
      const canShow = await canShowInDiscoveryFeed(userId, content.id, content.nsfwLevel);
      
      if (canShow.allowed) {
        filtered.push(content);
      }
    }

    return filtered;
  } catch (error) {
    console.error(`[PACK108] Error filtering content for feed:`, error);
    return [];
  }
}

/**
 * Get weighted ranking score for content (applies NSFW penalty)
 */
export function getWeightedRankingScore(
  baseScore: number,
  nsfwLevel: NSFWLevel
): number {
  const multiplier = getNSFWVisibilityMultiplier(nsfwLevel);
  return baseScore * multiplier;
}

/**
 * Segregate feed into SAFE and NSFW sections
 */
export function segregateFeed(
  contentList: Array<{ id: string; nsfwLevel: NSFWLevel; [key: string]: any }>
): {
  safeFeed: Array<{ id: string; nsfwLevel: NSFWLevel; [key: string]: any }>;
  nsfwFeed: Array<{ id: string; nsfwLevel: NSFWLevel; [key: string]: any }>;
} {
  const safeFeed = contentList.filter(c => c.nsfwLevel === 'SAFE');
  const nsfwFeed = contentList.filter(c => c.nsfwLevel !== 'SAFE' && c.nsfwLevel !== 'BANNED');

  return { safeFeed, nsfwFeed };
}