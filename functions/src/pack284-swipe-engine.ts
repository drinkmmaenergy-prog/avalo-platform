/**
 * PACK 284 — Swipe Engine FINAL (Enhanced with PACK 309)
 *
 * Implements the definitive swipe engine for Avalo:
 * - Daily limits (50/day + 10/hour refill while active)
 * - Queue selection with filtering and ranking
 * - Resurfacing logic (no re-showing of swiped profiles)
 * - Match creation and notifications
 * - Abuse detection and safety
 * - PACK 309: 18+ verification enforcement
 * - PACK 309: Analytics and retention integration
 *
 * @module pack284-swipe-engine
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { checkSwipeVerificationRequirements, throwVerificationError } from './pack309-swipe-verification';
import { logSwipeAnalyticsEvent, updateRetentionProfileSwipe } from './pack309-analytics-integration';

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// ============================================================================
// CONSTANTS
// ============================================================================

const BASE_DAILY_LIMIT = 50;
const HOURLY_REFILL_AMOUNT = 10;
const QUEUE_BATCH_SIZE = 30;
const DEFAULT_RADIUS_KM = 50;
const MAX_AGE = 80;
const MIN_AGE = 18;
const MILLISECONDS_PER_HOUR = 3600000;

// Royal/VIP subscription boosts
const SUBSCRIPTION_BOOSTS = {
  royal: 10,
  vip: 5,
  standard: 0
};

// ============================================================================
// TYPES
// ============================================================================

interface SwipeProfile {
  userId: string;
  gender: 'male' | 'female' | 'nonbinary';
  age: number;
  city: string;
  country: string;
  orientation: 'male' | 'female' | 'both';
  location: {
    lat: number;
    lng: number;
  };
  verified: boolean;
  profileScore: number;
  nsfwLevel: 'safe' | 'soft' | 'erotic';
  riskScore: number;
  banLevel: 'none' | 'soft' | 'shadow' | 'full';
  isIncognito: boolean;
  passportLocation?: {
    lat: number;
    lng: number;
  };
  lastActiveAt: admin.firestore.Timestamp;
  photos?: string[];
  displayName?: string;
  bio?: string;
  subscription?: 'royal' | 'vip' | 'standard';
}

interface SwipeStats {
  userId: string;
  date: string; // YYYY-MM-DD in user's timezone
  swipesUsedToday: number;
  lastSwipeAt: admin.firestore.Timestamp | null;
  lastRefillAt: admin.firestore.Timestamp | null;
}

interface SwipeDecision {
  userId: string;
  targetId: string;
  decision: 'like' | 'dislike';
  createdAt: admin.firestore.Timestamp;
}

interface Match {
  matchId: string;
  userA: string;
  userB: string;
  createdAt: admin.firestore.Timestamp;
  fromSwipe: boolean;
  status: 'active' | 'blocked';
}

interface SwipeAllowance {
  allowed: boolean;
  remaining: number;
  nextRefillAt: number | null;
  reason?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get user's local date string (YYYY-MM-DD)
 */
function getUserLocalDate(timezone: string = 'UTC'): string {
  const now = new Date();
  return now.toLocaleString('en-CA', { 
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).split(',')[0];
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if user's gender/orientation matches target's preferences
 */
function matchesOrientation(
  userGender: string,
  userOrientation: string,
  targetGender: string,
  targetOrientation: string
): boolean {
  // Check if target's orientation includes user's gender
  const targetWantsUser = 
    targetOrientation === 'both' ||
    targetOrientation === userGender;
  
  // Check if user's orientation includes target's gender
  const userWantsTarget = 
    userOrientation === 'both' ||
    userOrientation === targetGender;
  
  return targetWantsUser && userWantsTarget;
}

/**
 * Calculate profile ranking score for swipe queue
 */
function calculateSwipeScore(
  profile: SwipeProfile,
  userLat: number,
  userLng: number
): number {
  let score = 100;
  
  // Distance penalty (max 50 points)
  const distance = calculateDistance(
    userLat,
    userLng,
    profile.location.lat,
    profile.location.lng
  );
  const distancePenalty = Math.min(distance / 2, 50);
  score -= distancePenalty;
  
  // Activity bonus
  const hoursSinceActive = (Date.now() - profile.lastActiveAt.toMillis()) / MILLISECONDS_PER_HOUR;
  if (hoursSinceActive < 1) {
    score += 20; // Online now
  } else if (hoursSinceActive < 24) {
    score += 10; // Active today
  } else if (hoursSinceActive < 168) {
    score += 5; // Active this week
  }
  
  // Verification bonus
  if (profile.verified) {
    score += 15;
  }
  
  // Profile quality bonus (max 20 points)
  score += (profile.profileScore / 100) * 20;
  
  // Subscription boost
  const subscriptionBoost = SUBSCRIPTION_BOOSTS[profile.subscription || 'standard'];
  score += subscriptionBoost;
  
  // Risk penalty
  if (profile.riskScore > 50) {
    score -= 20;
  }
  
  return Math.max(0, score);
}

/**
 * Get user's timezone from their profile
 */
async function getUserTimezone(userId: string): Promise<string> {
  const userDoc = await db.collection('users').doc(userId).get();
  return userDoc.data()?.timezone || 'UTC';
}

// ============================================================================
// SWIPE LIMIT MANAGEMENT
// ============================================================================

/**
 * Check swipe allowance for user
 * Handles refills and daily reset
 */
export async function checkSwipeAllowance(
  userId: string
): Promise<SwipeAllowance> {
  const timezone = await getUserTimezone(userId);
  const today = getUserLocalDate(timezone);
  const now = admin.firestore.Timestamp.now();
  
  const statsRef = db.collection('swipeStats').doc(userId);
  
  return await db.runTransaction(async (transaction) => {
    const statsDoc = await transaction.get(statsRef);
    
    let stats: SwipeStats;
    
    if (!statsDoc.exists) {
      // First time user - create stats
      stats = {
        userId,
        date: today,
        swipesUsedToday: 0,
        lastSwipeAt: null,
        lastRefillAt: now
      };
      transaction.set(statsRef, stats);
    } else {
      stats = statsDoc.data() as SwipeStats;
      
      // Check if date changed (midnight reset)
      if (stats.date !== today) {
        stats.date = today;
        stats.swipesUsedToday = 0;
        stats.lastRefillAt = now;
        transaction.update(statsRef, {
          date: today,
          swipesUsedToday: 0,
          lastRefillAt: now
        });
      }
    }
    
    // Calculate refills since last refill
    let totalRefills = 0;
    if (stats.lastRefillAt) {
      const hoursSinceRefill = (now.toMillis() - stats.lastRefillAt.toMillis()) / MILLISECONDS_PER_HOUR;
      const fullHoursPassed = Math.floor(hoursSinceRefill);
      totalRefills = fullHoursPassed * HOURLY_REFILL_AMOUNT;
    }
    
    // Calculate available swipes
    const maxAvailable = BASE_DAILY_LIMIT + totalRefills;
    const available = maxAvailable - stats.swipesUsedToday;
    
    // Calculate next refill time (1 hour from last refill)
    const nextRefillAt = stats.lastRefillAt 
      ? stats.lastRefillAt.toMillis() + MILLISECONDS_PER_HOUR
      : now.toMillis() + MILLISECONDS_PER_HOUR;
    
    if (available <= 0) {
      return {
        allowed: false,
        remaining: 0,
        nextRefillAt,
        reason: "You've reached today's swipe limit. Come back later when you're active."
      };
    }
    
    return {
      allowed: true,
      remaining: available,
      nextRefillAt
    };
  });
}

/**
 * Consume one swipe from user's allowance
 */
async function consumeSwipe(userId: string): Promise<void> {
  const timezone = await getUserTimezone(userId);
  const today = getUserLocalDate(timezone);
  const now = admin.firestore.Timestamp.now();
  
  const statsRef = db.collection('swipeStats').doc(userId);
  
  await db.runTransaction(async (transaction) => {
    const statsDoc = await transaction.get(statsRef);
    
    if (!statsDoc.exists) {
      // Create new stats
      transaction.set(statsRef, {
        userId,
        date: today,
        swipesUsedToday: 1,
        lastSwipeAt: now,
        lastRefillAt: now
      });
    } else {
      const stats = statsDoc.data() as SwipeStats;
      
      // Check for date change
      if (stats.date !== today) {
        transaction.update(statsRef, {
          date: today,
          swipesUsedToday: 1,
          lastSwipeAt: now,
          lastRefillAt: now
        });
      } else {
        // Calculate hourly refills before incrementing
        let refillsSinceLastRefill = 0;
        if (stats.lastRefillAt) {
          const hoursSinceRefill = (now.toMillis() - stats.lastRefillAt.toMillis()) / MILLISECONDS_PER_HOUR;
          const fullHoursPassed = Math.floor(hoursSinceRefill);
          if (fullHoursPassed >= 1) {
            // Update lastRefillAt
            transaction.update(statsRef, {
              lastRefillAt: now
            });
          }
        }
        
        transaction.update(statsRef, {
          swipesUsedToday: FieldValue.increment(1),
          lastSwipeAt: now
        });
      }
    }
  });
}

// ============================================================================
// SWIPE QUEUE SELECTION
// ============================================================================

/**
 * Get swipe queue for user
 */
export const getSwipeQueue = onCall(
  { region: 'europe-west3' },
  async (request): Promise<any> => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { lat, lng, radiusKm = DEFAULT_RADIUS_KM, limit = QUEUE_BATCH_SIZE } = request.data;
    
    if (!lat || !lng) {
      throw new HttpsError('invalid-argument', 'Location (lat, lng) is required');
    }
    
    try {
      // PACK 309: Check 18+ verification requirement
      const verificationCheck = await checkSwipeVerificationRequirements(userId);
      if (!verificationCheck.allowed) {
        throwVerificationError(verificationCheck.reason!);
      }
      
      // Check swipe allowance
      const allowance = await checkSwipeAllowance(userId);
      
      // Get user's profile for orientation matching
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      
      if (!userData) {
        throw new HttpsError('not-found', 'User profile not found');
      }
      
      const userGender = userData.gender || 'male';
      const userOrientation = userData.orientation || 'both';
      const userAge = userData.age || 25;
      
      // Get already swiped user IDs
      const swipedSnapshot = await db.collection('swipeDecisions')
        .where('userId', '==', userId)
        .select('targetId')
        .get();
      
      const swipedIds = new Set(swipedSnapshot.docs.map(doc => doc.data().targetId));
      swipedIds.add(userId); // Exclude self
      
      // Query potential candidates
      // Start with base filters that Firestore can handle
      let query = db.collection('swipeProfiles')
        .where('banLevel', 'in', ['none', 'soft'])
        .where('isIncognito', '==', false)
        .limit(limit * 3); // Fetch extra for post-filtering
      
      const snapshot = await query.get();
      
      // Post-filter and score candidates
      const candidates: Array<{ profile: SwipeProfile; score: number }> = [];
      
      for (const doc of snapshot.docs) {
        const profile = doc.data() as SwipeProfile;
        
        // Skip if already swiped
        if (swipedIds.has(profile.userId)) {
          continue;
        }
        
        // Age filter
        if (profile.age < MIN_AGE || profile.age > MAX_AGE) {
          continue;
        }
        
        // Orientation matching
        if (!matchesOrientation(userGender, userOrientation, profile.gender, profile.orientation)) {
          continue;
        }
        
        // Distance filter
        const distance = calculateDistance(lat, lng, profile.location.lat, profile.location.lng);
        if (distance > radiusKm) {
          continue;
        }
        
        // Skip profiles with only AI avatars (future enhancement)
        // For now, assume all profiles are valid
        
        // Calculate score
        const score = calculateSwipeScore(profile, lat, lng);
        
        candidates.push({ profile, score });
      }
      
      // Sort by score (highest first)
      candidates.sort((a, b) => b.score - a.score);
      
      // Take top N
      const topCandidates = candidates.slice(0, limit);
      
      // Format profiles for client
      const profiles = topCandidates.map(c => ({
        userId: c.profile.userId,
        displayName: c.profile.displayName || 'User',
        age: c.profile.age,
        city: c.profile.city,
        country: c.profile.country,
        photos: c.profile.photos || [],
        bio: c.profile.bio || '',
        verified: c.profile.verified,
        distance: Math.round(calculateDistance(lat, lng, c.profile.location.lat, c.profile.location.lng)),
        score: Math.round(c.score)
      }));
      
      return {
        success: true,
        profiles,
        remaining: allowance.remaining,
        nextRefillAt: allowance.nextRefillAt
      };
      
    } catch (error: any) {
      console.error('Error getting swipe queue:', error);
      throw new HttpsError('internal', error.message || 'Failed to get swipe queue');
    }
  }
);

// ============================================================================
// SWIPE PROCESSING
// ============================================================================

/**
 * Process swipe (like or dislike)
 */
export const processSwipe = onCall(
  { region: 'europe-west3' },
  async (request): Promise<any> => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { targetId, decision } = request.data;
    
    if (!targetId || !decision || !['like', 'dislike'].includes(decision)) {
      throw new HttpsError('invalid-argument', 'targetId and decision (like/dislike) are required');
    }
    
    if (targetId === userId) {
      throw new HttpsError('invalid-argument', 'Cannot swipe on yourself');
    }
    
    try {
      // PACK 309: Check 18+ verification requirement
      const verificationCheck = await checkSwipeVerificationRequirements(userId);
      if (!verificationCheck.allowed) {
        throwVerificationError(verificationCheck.reason!);
      }
      
      // Check swipe allowance
      const allowance = await checkSwipeAllowance(userId);
      
      if (!allowance.allowed) {
        // PACK 309: Log limit hit analytics
        if (allowance.reason?.includes('daily')) {
          await logSwipeAnalyticsEvent(userId, 'SWIPE_LIMIT_HIT_DAILY', {
            swipesUsed: BASE_DAILY_LIMIT,
            platform: request.data.platform || 'unknown'
          });
        } else if (allowance.reason?.includes('hour')) {
          await logSwipeAnalyticsEvent(userId, 'SWIPE_LIMIT_HIT_HOURLY', {
            swipesUsed: HOURLY_REFILL_AMOUNT,
            platform: request.data.platform || 'unknown'
          });
        }
        throw new HttpsError('resource-exhausted', allowance.reason || 'Swipe limit reached');
      }
      
      // Check for abuse patterns
      await detectAbusePatterns(userId);
      
      // Record swipe decision
      const decisionId = `${userId}_${targetId}`;
      const decisionRef = db.collection('swipeDecisions').doc(decisionId);
      
      const swipeDecision: SwipeDecision = {
        userId,
        targetId,
        decision,
        createdAt: admin.firestore.Timestamp.now()
      };
      
      await decisionRef.set(swipeDecision);
      
      // Consume swipe
      await consumeSwipe(userId);
      
      // PACK 309: Log swipe analytics event
      const eventType = decision === 'like' ? 'SWIPE_LIKE' : 'SWIPE_DISLIKE';
      await logSwipeAnalyticsEvent(userId, eventType, {
        targetId,
        platform: request.data.platform || 'unknown'
      });
      
      // PACK 309: Update retention profile with swipe activity
      await updateRetentionProfileSwipe(userId);
      
      // If like, check for mutual match
      let matched = false;
      let matchId: string | undefined;
      let chatId: string | undefined;
      
      if (decision === 'like') {
        const matchResult = await checkAndCreateMatch(userId, targetId);
        matched = matchResult.matched;
        matchId = matchResult.matchId;
        chatId = matchResult.chatId;
        
        // PACK 309: Log match analytics if matched
        if (matched) {
          await logSwipeAnalyticsEvent(userId, 'SWIPE_MATCH_CREATED', {
            targetId,
            matchId,
            platform: request.data.platform || 'unknown'
          });
        }
      }
      
      // Get updated allowance
      const updatedAllowance = await checkSwipeAllowance(userId);
      
      return {
        success: true,
        matched,
        matchId,
        chatId,
        remaining: updatedAllowance.remaining,
        nextRefillAt: updatedAllowance.nextRefillAt
      };
      
    } catch (error: any) {
      console.error('Error processing swipe:', error);
      throw new HttpsError('internal', error.message || 'Failed to process swipe');
    }
  }
);

// ============================================================================
// MATCH CREATION
// ============================================================================

/**
 * Check for mutual like and create match if found
 */
async function checkAndCreateMatch(
  userId: string,
  targetId: string
): Promise<{ matched: boolean; matchId?: string; chatId?: string }> {
  // Check if target already liked user
  const reverseDecisionId = `${targetId}_${userId}`;
  const reverseDecisionDoc = await db.collection('swipeDecisions')
    .doc(reverseDecisionId)
    .get();
  
  if (!reverseDecisionDoc.exists) {
    return { matched: false };
  }
  
  const reverseDecision = reverseDecisionDoc.data() as SwipeDecision;
  
  if (reverseDecision.decision !== 'like') {
    return { matched: false };
  }
  
  // Mutual like found! Create match
  const matchId = `match_${Date.now()}_${userId.substring(0, 8)}`;
  const chatId = `chat_${Date.now()}_${userId.substring(0, 8)}`;
  
  const match: Match = {
    matchId,
    userA: userId,
    userB: targetId,
    createdAt: admin.firestore.Timestamp.now(),
    fromSwipe: true,
    status: 'active'
  };
  
  await db.collection('matches').doc(matchId).set(match);
  
  // Create match notifications for both users
  await Promise.all([
    createMatchNotification(userId, targetId, matchId, chatId),
    createMatchNotification(targetId, userId, matchId, chatId)
  ]);
  
  // Emit match event (for chat engine to listen)
  await emitMatchEvent(matchId, userId, targetId, chatId);
  
  console.log(`Match created: ${userId} ↔ ${targetId} (${matchId})`);
  
  return {
    matched: true,
    matchId,
    chatId
  };
}

/**
 * Create match notification for user
 */
async function createMatchNotification(
  userId: string,
  matchedUserId: string,
  matchId: string,
  chatId: string
): Promise<void> {
  const notificationRef = db.collection('users').doc(userId)
    .collection('matchNotifications').doc();
  
  await notificationRef.set({
    userId,
    matchedUserId,
    matchId,
    chatId,
    read: false,
    createdAt: admin.firestore.Timestamp.now()
  });
}

/**
 * Emit match event for other systems to listen
 */
async function emitMatchEvent(
  matchId: string,
  userA: string,
  userB: string,
  chatId: string
): Promise<void> {
  // Write to events collection for pub/sub pattern
  await db.collection('events').add({
    type: 'match_created',
    matchId,
    userA,
    userB,
    chatId,
    fromSwipe: true,
    timestamp: admin.firestore.Timestamp.now()
  });
}

// ============================================================================
// GET MATCHES
// ============================================================================

/**
 * Get user's matches
 */
export const getMatches = onCall(
  { region: 'europe-west3' },
  async (request): Promise<any> => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { limit = 50, cursor } = request.data;
    
    try {
      // Query matches where user is participant
      let queryA = db.collection('matches')
        .where('userA', '==', userId)
        .where('status', '==', 'active')
        .orderBy('createdAt', 'desc')
        .limit(limit);
      
      let queryB = db.collection('matches')
        .where('userB', '==', userId)
        .where('status', '==', 'active')
        .orderBy('createdAt', 'desc')
        .limit(limit);
      
      const [snapshotA, snapshotB] = await Promise.all([
        queryA.get(),
        queryB.get()
      ]);
      
      // Combine and sort
      const allMatches = [
        ...snapshotA.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        ...snapshotB.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      ];
      
      allMatches.sort((a: any, b: any) => b.createdAt.toMillis() - a.createdAt.toMillis());
      
      // Enrich with user data
      const enrichedMatches = await Promise.all(
        allMatches.slice(0, limit).map(async (match: any) => {
          const matchUserId = match.userA === userId ? match.userB : match.userA;
          const matchUserDoc = await db.collection('users').doc(matchUserId).get();
          const matchUser = matchUserDoc.data();
          
          return {
            matchId: match.matchId,
            userId: matchUserId,
            displayName: matchUser?.displayName || 'User',
            photo: matchUser?.photos?.[0] || null,
            age: matchUser?.age || 0,
            city: matchUser?.city || '',
            verified: matchUser?.verified || false,
            chatId: match.chatId,
            createdAt: match.createdAt.toMillis()
          };
        })
      );
      
      return {
        success: true,
        matches: enrichedMatches,
        nextCursor: null // Implement pagination if needed
      };
      
    } catch (error: any) {
      console.error('Error getting matches:', error);
      throw new HttpsError('internal', error.message || 'Failed to get matches');
    }
  }
);

// ============================================================================
// GET SWIPE STATS
// ============================================================================

/**
 * Get swipe statistics for user
 */
export const getSwipeStats = onCall(
  { region: 'europe-west3' },
  async (request): Promise<any> => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    try {
      const allowance = await checkSwipeAllowance(userId);
      
      const timezone = await getUserTimezone(userId);
      const today = getUserLocalDate(timezone);
      const statsDoc = await db.collection('swipeStats').doc(userId).get();
      const stats = statsDoc.data() as SwipeStats | undefined;
      
      // Calculate next reset (midnight in user's timezone)
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const nextReset = tomorrow.getTime();
      
      return {
        success: true,
        swipesUsedToday: stats?.swipesUsedToday || 0,
        swipesRemaining: allowance.remaining,
        baseLimit: BASE_DAILY_LIMIT,
        hourlyRefill: HOURLY_REFILL_AMOUNT,
        nextRefillAt: allowance.nextRefillAt,
        nextResetAt: nextReset,
        date: today
      };
      
    } catch (error: any) {
      console.error('Error getting swipe stats:', error);
      throw new HttpsError('internal', error.message || 'Failed to get swipe stats');
    }
  }
);

// ============================================================================
// ABUSE DETECTION
// ============================================================================

/**
 * Detect abuse patterns (rapid swiping, bot behavior)
 */
async function detectAbusePatterns(userId: string): Promise<void> {
  const fiveMinutesAgo = admin.firestore.Timestamp.fromMillis(
    Date.now() - 5 * 60 * 1000
  );
  
  // Check swipes in last 5 minutes
  const recentSwipes = await db.collection('swipeDecisions')
    .where('userId', '==', userId)
    .where('createdAt', '>', fiveMinutesAgo)
    .count()
    .get();
  
  const swipeCount = recentSwipes.data().count;
  
  // If more than 50 swipes in 5 minutes, flag as abuse
  if (swipeCount > 50) {
    await db.collection('swipeAbuseReports').add({
      userId,
      type: 'rapid_swiping',
      count: swipeCount,
      timeWindow: '5_minutes',
      severity: 'high',
      reportedAt: admin.firestore.Timestamp.now()
    });
    
    throw new HttpsError(
      'resource-exhausted',
      'Unusual swipe pattern detected. Please slow down.'
    );
  }
}

// ============================================================================
// SYNC SWIPE PROFILES FROM DISCOVERY PRESENCE
// ============================================================================

/**
 * Sync swipeProfiles collection from discoveryPresence
 * Triggered on discoveryPresence document changes
 */
export const syncSwipeProfiles = onDocumentWritten(
  {
    document: 'discoveryPresence/{userId}',
    region: 'europe-west3'
  },
  async (event) => {
    const userId = event.params.userId;
    const data = event.data?.after.data();
    
    if (!data) {
      // Document deleted - remove from swipeProfiles
      await db.collection('swipeProfiles').doc(userId).delete();
      console.log(`Removed swipeProfile for deleted user: ${userId}`);
      return;
    }
    
    // Create/update swipeProfile
    const swipeProfile: SwipeProfile = {
      userId: data.userId,
      gender: data.gender,
      age: data.age,
      city: data.city,
      country: data.country,
      orientation: data.orientation || 'both',
      location: data.location,
      verified: data.verified || false,
      profileScore: data.profileScore || 0,
      nsfwLevel: data.nsfwLevel || 'safe',
      riskScore: data.riskScore || 0,
      banLevel: data.banLevel || 'none',
      isIncognito: data.isIncognito || false,
      passportLocation: data.passportLocation,
      lastActiveAt: data.lastActiveAt || admin.firestore.Timestamp.now()
    };
    
    await db.collection('swipeProfiles').doc(userId).set(swipeProfile, { merge: true });
    console.log(`Synced swipeProfile for user: ${userId}`);
  }
);
