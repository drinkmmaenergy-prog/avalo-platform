/**
 * PACK 94 — Discovery & Ranking Engine v2
 * Trust-/Region-/Earnings-Aware Feed & Search
 * 
 * Backend ranking logic + feed/search APIs
 * 
 * CRITICAL CONSTRAINTS:
 * - No token price changes
 * - No revenue split changes (65% creator / 35% Avalo)
 * - No free tokens, discounts, cashback, promo codes
 * - No pay-to-rank boosting (monetization signals used for engagement only)
 * - Risky/violating accounts have lower visibility or zero exposure
 * - Regional policies and age gating consistently applied
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  DiscoveryProfile,
  DiscoveryFilters,
  ProfileCard,
  DiscoveryFeedResponse,
  SearchProfilesResponse,
  RankingWeights,
  DEFAULT_RANKING_WEIGHTS,
  CandidateScore,
  UserPreferences,
  RebuildReason,
  FeedGenerationDiagnostics,
} from './types/discovery.types';
import { getTrustProfile } from './trustRiskEngine';
import { getEnforcementState } from './enforcementEngine';
import { resolveUserPolicyContext, canUserViewContent } from './pack91-policy-engine';

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (...args: any[]) => console.log('[DiscoveryV2]', ...args),
  warn: (...args: any[]) => console.warn('[DiscoveryV2]', ...args),
  error: (...args: any[]) => console.error('[DiscoveryV2]', ...args),
  debug: (...args: any[]) => {
    if (process.env.DEBUG_DISCOVERY === 'true') {
      console.log('[DiscoveryV2:DEBUG]', ...args);
    }
  },
};

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTIONS = {
  DISCOVERY_PROFILES: 'discovery_profiles',
  USERS: 'users',
  USER_TRUST_PROFILE: 'user_trust_profile',
  USER_ENFORCEMENT_STATE: 'user_enforcement_state',
} as const;

const WEIGHTS = DEFAULT_RANKING_WEIGHTS;

// ============================================================================
// RANKING MODEL v2 (Deterministic & Explainable)
// ============================================================================

/**
 * Calculate recency score based on last active time
 * Returns 1.0 for last 24h, decays smoothly after that
 */
function calculateRecencyScore(lastActiveAt: Timestamp): number {
  const now = Date.now();
  const lastActive = lastActiveAt.toMillis();
  const hoursAgo = (now - lastActive) / (1000 * 60 * 60);
  
  if (hoursAgo <= 24) {
    return 1.0; // Active within last 24 hours
  } else if (hoursAgo <= 168) {
    // Decay over 7 days
    return 1.0 - ((hoursAgo - 24) / 144) * 0.7; // Down to 0.3 after 7 days
  } else if (hoursAgo <= 720) {
    // Decay over 30 days
    return 0.3 - ((hoursAgo - 168) / 552) * 0.25; // Down to 0.05 after 30 days
  } else {
    return 0.05; // Minimum score for inactive users
  }
}

/**
 * Calculate preference match score between viewer and candidate
 */
async function calculatePreferenceMatch(
  viewerPrefs: UserPreferences,
  candidate: DiscoveryProfile
): Promise<number> {
  let score = 0.5; // Base match score
  
  // Gender matching
  if (viewerPrefs.preferredGenders && viewerPrefs.preferredGenders.length > 0) {
    if (viewerPrefs.preferredGenders.includes(candidate.gender)) {
      score += 0.25;
    } else {
      score -= 0.15;
    }
  }
  
  // Age matching
  if (viewerPrefs.minAge && candidate.age < viewerPrefs.minAge) {
    score -= 0.20;
  }
  if (viewerPrefs.maxAge && candidate.age > viewerPrefs.maxAge) {
    score -= 0.20;
  }
  
  // Interest matching (if available)
  if (viewerPrefs.interests && viewerPrefs.interests.length > 0) {
    // Would need to fetch candidate interests from users collection
    // For now, skip this to keep query fast
  }
  
  return Math.max(0, Math.min(1, score));
}

/**
 * Normalize a score to 0-1 range
 */
function normalize(value: number, max: number = 100): number {
  return Math.max(0, Math.min(1, value / max));
}

/**
 * Calculate ranking score for a candidate
 */
async function calculateRankingScore(
  viewerId: string,
  viewerPrefs: UserPreferences,
  candidate: DiscoveryProfile,
  weights: RankingWeights = WEIGHTS
): Promise<CandidateScore> {
  // Component scores
  const profileScore = normalize(candidate.profileCompleteness);
  const activityScore = calculateRecencyScore(candidate.lastActiveAt);
  const engagementScore = normalize(candidate.engagementScore);
  const monetizationScore = normalize(candidate.monetizationScore);
  const matchScore = await calculatePreferenceMatch(viewerPrefs, candidate);
  const riskPenalty = normalize(candidate.trustScore); // Higher risk = higher penalty
  
  // Calculate weighted base score
  const baseScore = 
    weights.w_profile * profileScore +
    weights.w_active * activityScore +
    weights.w_engage * engagementScore +
    weights.w_monet * monetizationScore +
    weights.w_match * matchScore -
    weights.w_risk * riskPenalty;
  
  // Apply visibility modifiers
  let finalScore = baseScore;
  
  // Drastic reduction for low visibility
  if (candidate.visibilityTier === 'LOW') {
    finalScore *= 0.3;
  }
  
  // Ensure score is in valid range
  finalScore = Math.max(0, Math.min(1, finalScore));
  
  return {
    userId: candidate.userId,
    baseScore,
    components: {
      profileScore,
      activityScore,
      engagementScore,
      monetizationScore,
      matchScore,
      riskPenalty,
    },
    finalScore,
  };
}

// ============================================================================
// FILTERING LOGIC
// ============================================================================

/**
 * Check if candidate should be filtered out based on enforcement/policy
 */
async function shouldFilterCandidate(
  viewerId: string,
  candidate: DiscoveryProfile
): Promise<{ filtered: boolean; reason?: string }> {
  // Filter suspended accounts
  if (candidate.enforcementLevel === 'SUSPENDED') {
    return { filtered: true, reason: 'SUSPENDED' };
  }
  
  // Filter hidden profiles
  if (candidate.visibilityTier === 'HIDDEN') {
    return { filtered: true, reason: 'HIDDEN' };
  }
  
  // Filter undiscoverable profiles
  if (!candidate.isDiscoverable) {
    return { filtered: true, reason: 'NOT_DISCOVERABLE' };
  }
  
  // Check regional policy & content rating compatibility
  try {
    const viewDecision = await canUserViewContent(
      viewerId,
      candidate.contentRatingMax,
      { featureContext: 'FEED' }
    );
    
    if (!viewDecision.allowed) {
      return { filtered: true, reason: viewDecision.reasonCode || 'POLICY_BLOCKED' };
    }
  } catch (error) {
    logger.error('Policy check failed:', error);
    // Fail-safe: filter on error
    return { filtered: true, reason: 'POLICY_ERROR' };
  }
  
  return { filtered: false };
}

/**
 * Apply user filters to query
 */
function applyFiltersToQuery(
  baseQuery: FirebaseFirestore.Query,
  filters?: DiscoveryFilters
): FirebaseFirestore.Query {
  let query = baseQuery;
  
  if (filters?.gender) {
    query = query.where('gender', '==', filters.gender);
  }
  
  if (filters?.minAge) {
    query = query.where('age', '>=', filters.minAge);
  }
  
  if (filters?.maxAge) {
    query = query.where('age', '<=', filters.maxAge);
  }
  
  if (filters?.countryCode) {
    query = query.where('countryCode', '==', filters.countryCode);
  }
  
  return query;
}

// ============================================================================
// FEED GENERATION
// ============================================================================

/**
 * Get Discovery Feed for a user
 */
export async function getDiscoveryFeed(
  userId: string,
  cursor?: string,
  limit: number = 20,
  filters?: DiscoveryFilters
): Promise<DiscoveryFeedResponse> {
  const startTime = Date.now();
  const diagnostics: FeedGenerationDiagnostics = {
    userId,
    candidatesQueried: 0,
    candidatesFiltered: 0,
    candidatesRanked: 0,
    candidatesReturned: 0,
    filterReasons: {},
    averageScore: 0,
    generationTimeMs: 0,
  };
  
  try {
    logger.info(`Generating feed for user ${userId}, limit=${limit}`);
    
    // Get viewer preferences
    const viewerPrefs = await getUserPreferences(userId);
    
    // Build base query
    let query = db
      .collection(COLLECTIONS.DISCOVERY_PROFILES)
      .where('isDiscoverable', '==', true);
    
    // Apply filters
    query = applyFiltersToQuery(query, filters);
    
    // Apply cursor for pagination
    if (cursor) {
      const cursorDoc = await db.collection(COLLECTIONS.DISCOVERY_PROFILES).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }
    
    // Fetch candidates (fetch more than needed to account for filtering)
    const fetchLimit = limit * 3;
    query = query.limit(fetchLimit);
    
    const snapshot = await query.get();
    diagnostics.candidatesQueried = snapshot.size;
    
    // Score and filter candidates
    const scoredCandidates: CandidateScore[] = [];
    
    for (const doc of snapshot.docs) {
      const candidate = doc.data() as DiscoveryProfile;
      
      // Skip self
      if (candidate.userId === userId) {
        continue;
      }
      
      // Apply filtering
      const filterCheck = await shouldFilterCandidate(userId, candidate);
      if (filterCheck.filtered) {
        diagnostics.candidatesFiltered++;
        diagnostics.filterReasons[filterCheck.reason!] = 
          (diagnostics.filterReasons[filterCheck.reason!] || 0) + 1;
        continue;
      }
      
      // Calculate ranking score
      const score = await calculateRankingScore(userId, viewerPrefs, candidate);
      scoredCandidates.push(score);
    }
    
    diagnostics.candidatesRanked = scoredCandidates.length;
    
    // Sort by final score descending
    scoredCandidates.sort((a, b) => b.finalScore - a.finalScore);
    
    // Take top N
    const topCandidates = scoredCandidates.slice(0, limit);
    diagnostics.candidatesReturned = topCandidates.length;
    
    // Calculate average score
    if (topCandidates.length > 0) {
      diagnostics.averageScore = 
        topCandidates.reduce((sum, c) => sum + c.finalScore, 0) / topCandidates.length;
    }
    
    // Build profile cards
    const items: ProfileCard[] = [];
    for (const scored of topCandidates) {
      const card = await buildProfileCard(scored.userId);
      if (card) {
        items.push(card);
      }
    }
    
    // Determine if there are more results
    const hasMore = scoredCandidates.length > limit;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].userId : undefined;
    
    diagnostics.generationTimeMs = Date.now() - startTime;
    
    logger.info(`Feed generated: ${items.length} items in ${diagnostics.generationTimeMs}ms`);
    logger.debug('Diagnostics:', diagnostics);
    
    return {
      items,
      cursor: nextCursor,
      hasMore,
      totalFiltered: diagnostics.candidatesFiltered,
    };
  } catch (error) {
    logger.error('Error generating feed:', error);
    throw error;
  }
}

// ============================================================================
// SEARCH
// ============================================================================

/**
 * Search Profiles by text query
 */
export async function searchProfiles(
  userId: string,
  query?: string,
  cursor?: string,
  limit: number = 20,
  filters?: DiscoveryFilters
): Promise<SearchProfilesResponse> {
  const startTime = Date.now();
  
  try {
    logger.info(`Searching profiles for user ${userId}, query="${query}", limit=${limit}`);
    
    // Get viewer preferences
    const viewerPrefs = await getUserPreferences(userId);
    
    // Build base query
    let firestoreQuery = db
      .collection(COLLECTIONS.DISCOVERY_PROFILES)
      .where('isDiscoverable', '==', true);
    
    // Apply filters
    firestoreQuery = applyFiltersToQuery(firestoreQuery, filters);
    
    // Apply cursor for pagination
    if (cursor) {
      const cursorDoc = await db.collection(COLLECTIONS.DISCOVERY_PROFILES).doc(cursor).get();
      if (cursorDoc.exists) {
        firestoreQuery = firestoreQuery.startAfter(cursorDoc);
      }
    }
    
    // Fetch candidates
    const fetchLimit = limit * 3;
    firestoreQuery = firestoreQuery.limit(fetchLimit);
    
    const snapshot = await firestoreQuery.get();
    
    // Score and filter candidates
    const scoredCandidates: CandidateScore[] = [];
    
    for (const doc of snapshot.docs) {
      const candidate = doc.data() as DiscoveryProfile;
      
      // Skip self
      if (candidate.userId === userId) {
        continue;
      }
      
      // Apply filtering
      const filterCheck = await shouldFilterCandidate(userId, candidate);
      if (filterCheck.filtered) {
        continue;
      }
      
      // If query text provided, check against user data
      if (query && query.trim()) {
        const matchesQuery = await checkTextMatch(candidate.userId, query);
        if (!matchesQuery) {
          continue;
        }
      }
      
      // Calculate ranking score (with higher weight on match for search)
      const searchWeights: RankingWeights = {
        ...WEIGHTS,
        w_match: 0.35, // Increase match weight for search
        w_active: 0.15, // Reduce activity weight
      };
      
      const score = await calculateRankingScore(userId, viewerPrefs, candidate, searchWeights);
      scoredCandidates.push(score);
    }
    
    // Sort by final score descending
    scoredCandidates.sort((a, b) => b.finalScore - a.finalScore);
    
    // Take top N
    const topCandidates = scoredCandidates.slice(0, limit);
    
    // Build profile cards
    const items: ProfileCard[] = [];
    for (const scored of topCandidates) {
      const card = await buildProfileCard(scored.userId);
      if (card) {
        items.push(card);
      }
    }
    
    // Determine if there are more results
    const hasMore = scoredCandidates.length > limit;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].userId : undefined;
    
    const elapsedMs = Date.now() - startTime;
    logger.info(`Search completed: ${items.length} items in ${elapsedMs}ms`);
    
    return {
      items,
      cursor: nextCursor,
      hasMore,
      totalResults: items.length,
    };
  } catch (error) {
    logger.error('Error searching profiles:', error);
    throw error;
  }
}

/**
 * Check if candidate matches text query
 */
async function checkTextMatch(userId: string, query: string): Promise<boolean> {
  try {
    const userDoc = await db.collection(COLLECTIONS.USERS).doc(userId).get();
    if (!userDoc.exists) {
      return false;
    }
    
    const userData = userDoc.data();
    const searchText = query.toLowerCase();
    
    // Check name
    const displayName = (userData?.displayName || '').toLowerCase();
    if (displayName.includes(searchText)) {
      return true;
    }
    
    // Check bio
    const bio = (userData?.bio || '').toLowerCase();
    if (bio.includes(searchText)) {
      return true;
    }
    
    // Check interests
    const interests = userData?.profile?.interests || [];
    for (const interest of interests) {
      if (interest.toLowerCase().includes(searchText)) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    logger.error('Error checking text match:', error);
    return false;
  }
}

// ============================================================================
// PROFILE CARD BUILDER
// ============================================================================

/**
 * Build a lightweight profile card from user data
 */
async function buildProfileCard(userId: string): Promise<ProfileCard | null> {
  try {
    const userDoc = await db.collection(COLLECTIONS.USERS).doc(userId).get();
    if (!userDoc.exists) {
      return null;
    }
    
    const userData = userDoc.data();
    const profile = userData?.profile || {};
    
    // Check if user is currently online (last active within 5 minutes)
    const lastActiveAt = userData?.lastActiveAt;
    const isOnline = lastActiveAt && 
      (Date.now() - lastActiveAt.toMillis()) < 5 * 60 * 1000;
    
    // Build badges
    const badges: string[] = [];
    if (userData?.verification?.selfie) {
      badges.push('verified');
    }
    if (userData?.roles?.royal) {
      badges.push('royal');
    }
    
    return {
      userId,
      displayName: userData?.displayName || 'Anonymous',
      age: profile.age || 18,
      gender: profile.gender || 'other',
      country: userData?.location?.country || 'Unknown',
      bio: userData?.bio,
      mainPhoto: profile.photos?.[0],
      photos: profile.photos?.slice(0, 3),
      distance: userData?.location?.distanceKm,
      lastActiveAt: lastActiveAt?.toDate().toISOString() || new Date().toISOString(),
      isOnline,
      badges,
    };
  } catch (error) {
    logger.error(`Error building profile card for ${userId}:`, error);
    return null;
  }
}

// ============================================================================
// USER PREFERENCES
// ============================================================================

/**
 * Get user preferences for matching
 */
async function getUserPreferences(userId: string): Promise<UserPreferences> {
  try {
    const userDoc = await db.collection(COLLECTIONS.USERS).doc(userId).get();
    if (!userDoc.exists) {
      return {};
    }
    
    const userData = userDoc.data();
    const profile = userData?.profile || {};
    
    return {
      preferredGenders: profile.seeking || [],
      minAge: profile.agePreference?.min || 18,
      maxAge: profile.agePreference?.max || 99,
      maxDistanceKm: userData?.searchAreaKm !== 'country' ? userData?.searchAreaKm : undefined,
      interests: profile.interests || [],
    };
  } catch (error) {
    logger.error('Error fetching user preferences:', error);
    return {};
  }
}

logger.info('✅ Discovery & Ranking Engine v2 initialized');