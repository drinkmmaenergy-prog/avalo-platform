/**
 * PACK 208 — Chemistry Feed Engine
 * Main orchestration for adaptive attraction ranking feed
 */

import { db } from '../../init';
import {
  UserProfile,
  SwipeBehavior,
  FeedOptions,
  FeedResponse,
  ChemistryScore,
  AnalyticsEvent,
} from './types';
import {
  calculateChemistryScore,
  applyCategoryPriority,
  applyDiscoveryBoost,
  sortByChemistry,
} from './rankingModel';

// Cache configuration
const FEED_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
const SOFT_UPDATE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes during activity
const PREFETCH_SIZE = 20;

interface FeedCache {
  userId: string;
  profiles: UserProfile[];
  scores: ChemistryScore[];
  lastRefreshedAt: Date;
  lastAccessedAt: Date;
}

// In-memory cache (in production, use Redis)
const feedCache = new Map<string, FeedCache>();

/**
 * Get personalized chemistry feed for user
 * Main entry point for feed generation
 */
export async function getFeed(options: FeedOptions): Promise<FeedResponse> {
  const { userId, limit = 20, offset = 0, refreshCache = false } = options;

  // Check cache first
  const cached = feedCache.get(userId);
  const now = new Date();

  if (
    !refreshCache &&
    cached &&
    now.getTime() - cached.lastRefreshedAt.getTime() < FEED_CACHE_TTL_MS
  ) {
    // Return from cache
    const profiles = cached.profiles.slice(offset, offset + limit);
    const scores = cached.scores.slice(offset, offset + limit);

    // Update last accessed
    cached.lastAccessedAt = now;

    // Prefetch next batch in background if needed
    if (offset + limit >= cached.profiles.length - 5) {
      prefetchNextBatch(userId, cached.profiles.length).catch(console.error);
    }

    // Track analytics
    await trackAnalytics({
      eventType: 'feed.load',
      userId,
      metadata: { source: 'cache', profileCount: profiles.length },
      timestamp: now,
    });

    return {
      profiles,
      scores,
      nextOffset: offset + limit,
      totalAvailable: cached.profiles.length,
      lastRefreshedAt: cached.lastRefreshedAt,
    };
  }

  // Generate fresh feed
  const feedData = await generateFeed(userId);

  // Cache the results
  feedCache.set(userId, {
    userId,
    profiles: feedData.profiles,
    scores: feedData.scores,
    lastRefreshedAt: now,
    lastAccessedAt: now,
  });

  // Return requested slice
  const profiles = feedData.profiles.slice(offset, offset + limit);
  const scores = feedData.scores.slice(offset, offset + limit);

  // Track analytics
  await trackAnalytics({
    eventType: 'feed.load',
    userId,
    metadata: { source: 'fresh', profileCount: profiles.length },
    timestamp: now,
  });

  return {
    profiles,
    scores,
    nextOffset: offset + limit,
    totalAvailable: feedData.profiles.length,
    lastRefreshedAt: now,
  };
}

/**
 * Generate fresh feed with chemistry ranking
 */
async function generateFeed(userId: string): Promise<{
  profiles: UserProfile[];
  scores: ChemistryScore[];
}> {
  // Get viewer's profile
  const viewerProfile = await getUserProfile(userId);
  if (!viewerProfile) {
    throw new Error('Viewer profile not found');
  }

  // Get viewer's swipe behavior
  const swipeBehavior = await getSwipeBehavior(userId);

  // Get blocklist
  const blocklist = await getBlocklist(userId);

  // Get mission completion data
  const missionData = await getMissionCompletionData(userId);

  // Query candidate profiles
  const candidates = await queryCandidateProfiles(userId, viewerProfile, blocklist);

  // Calculate chemistry scores for all candidates
  const scores: ChemistryScore[] = [];
  const profiles: UserProfile[] = [];

  for (const candidate of candidates) {
    const score = calculateChemistryScore(
      viewerProfile,
      candidate,
      swipeBehavior,
      missionData
    );

    scores.push(score);
    profiles.push(candidate);
  }

  // Apply category priority weighting
  const prioritizedScores = applyCategoryPriority(scores);

  // Apply discovery boost for diversity
  const diverseScores = applyDiscoveryBoost(prioritizedScores);

  // Sort by final chemistry score
  const sortedScores = sortByChemistry(diverseScores);

  // Reorder profiles to match sorted scores
  const sortedProfiles = sortedScores.map(score =>
    profiles.find(p => p.userId === score.userId)!
  );

  // Apply feed balancing rules
  const { balancedProfiles, balancedScores } = balanceFeed(sortedProfiles, sortedScores);

  return {
    profiles: balancedProfiles,
    scores: balancedScores,
  };
}

/**
 * Balance feed to prevent high-popularity domination
 * Ensures ecosystem health
 */
function balanceFeed(
  profiles: UserProfile[],
  scores: ChemistryScore[]
): { balancedProfiles: UserProfile[]; balancedScores: ChemistryScore[] } {
  const balancedProfiles: UserProfile[] = [];
  const balancedScores: ChemistryScore[] = [];

  // Category slots (ensure fair distribution)
  const slots = {
    verified: 30, // 30% of feed
    high_popularity: 20, // 20% (limited to prevent domination)
    medium_popularity: 35, // 35%
    low_popularity: 15, // 15% (gives everyone a chance)
  };

  const categorized = {
    verified: [] as { profile: UserProfile; score: ChemistryScore }[],
    high_popularity: [] as { profile: UserProfile; score: ChemistryScore }[],
    medium_popularity: [] as { profile: UserProfile; score: ChemistryScore }[],
    low_popularity: [] as { profile: UserProfile; score: ChemistryScore }[],
  };

  // Categorize profiles
  profiles.forEach((profile, index) => {
    const score = scores[index];
    categorized[score.category].push({ profile, score });
  });

  // Fill slots proportionally
  const totalSlots = Math.min(100, profiles.length);

  Object.entries(slots).forEach(([category, percentage]) => {
    const slotCount = Math.floor((percentage / 100) * totalSlots);
    const categoryItems = categorized[category as keyof typeof categorized];

    const toAdd = categoryItems.slice(0, slotCount);
    toAdd.forEach(item => {
      balancedProfiles.push(item.profile);
      balancedScores.push(item.score);
    });
  });

  // Fill remaining slots with best remaining candidates
  const remaining = profiles.filter(
    p => !balancedProfiles.find(bp => bp.userId === p.userId)
  );
  const remainingScores = scores.filter(
    s => !balancedScores.find(bs => bs.userId === s.userId)
  );

  const remainingSlots = totalSlots - balancedProfiles.length;
  if (remainingSlots > 0 && remaining.length > 0) {
    balancedProfiles.push(...remaining.slice(0, remainingSlots));
    balancedScores.push(...remainingScores.slice(0, remainingSlots));
  }

  return { balancedProfiles, balancedScores };
}

/**
 * Query candidate profiles from database
 */
async function queryCandidateProfiles(
  userId: string,
  viewerProfile: UserProfile,
  blocklist: Set<string>
): Promise<UserProfile[]> {
  const profiles: UserProfile[] = [];

  // Build query
  let query = db
    .collection('users')
    .where('active', '==', true)
    .where('profileComplete', '==', true);

  // Apply gender filter if specified
  if (viewerProfile.preferences?.gender && viewerProfile.preferences.gender.length > 0) {
    query = query.where('gender', 'in', viewerProfile.preferences.gender.slice(0, 10));
  }

  // Location-based query if available
  if (viewerProfile.location && viewerProfile.preferences?.distanceMax) {
    // Note: This would use geohashing in production
    // For now, we'll fetch more and filter client-side
    query = query.limit(200);
  } else {
    query = query.limit(100);
  }

  const snapshot = await query.get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const candidateId = doc.id;

    // Skip self
    if (candidateId === userId) continue;

    // Skip blocked users
    if (blocklist.has(candidateId)) continue;

    // Build profile
    const profile: UserProfile = {
      userId: candidateId,
      name: data.name || 'Unknown',
      age: data.age || 18,
      gender: data.gender || 'other',
      photos: data.photos || [],
      bio: data.bio,
      interests: data.interests || [],
      verified: data.verified || false,
      location: data.location ? {
        lat: data.location.lat,
        lng: data.location.lng,
        distanceKm: calculateDistance(viewerProfile.location, data.location),
      } : undefined,
      preferences: data.preferences,
      popularity: {
        likesReceived: data.stats?.likesReceived || 0,
        matchCount: data.stats?.matchCount || 0,
        chatCount: data.stats?.chatCount || 0,
        lastActiveAt: data.lastActiveAt?.toDate(),
      },
      safetyFlags: {
        banRisk: data.safety?.banRisk || 0,
        nsfwFlags: data.safety?.nsfwFlags || 0,
        reportStrikes: data.safety?.reportStrikes || 0,
      },
      completeness: {
        hasPhotos: (data.photos || []).length > 0,
        hasBio: !!data.bio,
        hasPreferences: !!data.preferences,
        score: calculateProfileCompletenessScore(data),
      },
    };

    profiles.push(profile);
  }

  return profiles;
}

/**
 * Get user profile
 */
async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const doc = await db.collection('users').doc(userId).get();
  if (!doc.exists) return null;

  const data = doc.data()!;
  return {
    userId,
    name: data.name || 'Unknown',
    age: data.age || 18,
    gender: data.gender || 'other',
    photos: data.photos || [],
    bio: data.bio,
    interests: data.interests || [],
    verified: data.verified || false,
    location: data.location,
    preferences: data.preferences,
    popularity: {
      likesReceived: data.stats?.likesReceived || 0,
      matchCount: data.stats?.matchCount || 0,
      chatCount: data.stats?.chatCount || 0,
    },
    safetyFlags: {
      banRisk: data.safety?.banRisk || 0,
      nsfwFlags: data.safety?.nsfwFlags || 0,
      reportStrikes: data.safety?.reportStrikes || 0,
    },
  };
}

/**
 * Get user's swipe behavior data
 */
async function getSwipeBehavior(userId: string): Promise<SwipeBehavior | undefined> {
  const doc = await db.collection('swipe_behavior').doc(userId).get();
  if (!doc.exists) return undefined;

  const data = doc.data()!;
  return {
    userId,
    totalSwipes: data.totalSwipes || 0,
    rightSwipes: data.rightSwipes || 0,
    leftSwipes: data.leftSwipes || 0,
    patterns: data.patterns,
  };
}

/**
 * Get user's blocklist
 */
async function getBlocklist(userId: string): Promise<Set<string>> {
  const doc = await db.collection('blocklists').doc(userId).get();
  const blocklist = new Set<string>();

  if (doc.exists) {
    const data = doc.data()!;
    (data.blockedUserIds || []).forEach((id: string) => blocklist.add(id));
  }

  // Also get users who blocked this user
  const blockedBySnapshot = await db
    .collection('blocklists')
    .where('blockedUserIds', 'array-contains', userId)
    .get();

  blockedBySnapshot.docs.forEach(doc => blocklist.add(doc.id));

  return blocklist;
}

/**
 * Get mission completion data (PACK 206C reference)
 */
async function getMissionCompletionData(
  userId: string
): Promise<{ completed: boolean; recentActivity: boolean }> {
  const doc = await db.collection('missions').doc(userId).get();
  
  if (!doc.exists) {
    return { completed: false, recentActivity: false };
  }

  const data = doc.data()!;
  const lastActivity = data.lastActivityAt?.toDate();
  const recentActivity = lastActivity
    ? Date.now() - lastActivity.getTime() < 24 * 60 * 60 * 1000
    : false;

  return {
    completed: data.completed || false,
    recentActivity,
  };
}

/**
 * Calculate distance between two locations (Haversine formula)
 */
function calculateDistance(
  loc1: { lat: number; lng: number } | undefined,
  loc2: { lat: number; lng: number } | undefined
): number | undefined {
  if (!loc1 || !loc2) return undefined;

  const R = 6371; // Earth's radius in km
  const dLat = toRad(loc2.lat - loc1.lat);
  const dLon = toRad(loc2.lng - loc1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(loc1.lat)) *
      Math.cos(toRad(loc2.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate profile completeness score (0-100)
 */
function calculateProfileCompletenessScore(data: any): number {
  let score = 0;
  
  if ((data.photos || []).length > 0) score += 40;
  if (data.bio && data.bio.length > 20) score += 30;
  if (data.preferences) score += 30;
  
  return score;
}

/**
 * Prefetch next batch of profiles in background
 */
async function prefetchNextBatch(userId: string, currentSize: number): Promise<void> {
  console.log(`[ChemistryFeed] Prefetching next batch for user ${userId}`);
  
  // This would trigger background feed refresh
  // Implementation depends on your background job system
  // For now, just log
}

/**
 * Track analytics event
 */
async function trackAnalytics(event: AnalyticsEvent): Promise<void> {
  try {
    await db.collection('analytics_events').add({
      ...event,
      timestamp: event.timestamp,
    });
  } catch (error) {
    console.error('[ChemistryFeed] Failed to track analytics:', error);
    // Don't throw - analytics should not block feed
  }
}

/**
 * Invalidate cache for user (call after profile updates)
 */
export function invalidateCache(userId: string): void {
  feedCache.delete(userId);
  console.log(`[ChemistryFeed] Cache invalidated for user ${userId}`);
}

/**
 * Clear old cache entries (run periodically)
 */
export function cleanupCache(): void {
  const now = Date.now();
  let cleaned = 0;

  feedCache.forEach((cache, userId) => {
    if (now - cache.lastAccessedAt.getTime() > 6 * 60 * 60 * 1000) {
      // 6 hours
      feedCache.delete(userId);
      cleaned++;
    }
  });

  if (cleaned > 0) {
    console.log(`[ChemistryFeed] Cleaned ${cleaned} cache entries`);
  }
}

console.log('✅ PACK 208: Feed Engine module loaded');