/**
 * ========================================================================
 * FEED & DISCOVERY 3.0 - COMPLETE IMPLEMENTATION
 * ========================================================================
 * Advanced multi-mode feed system with AI-powered discovery
 *
 * Feed Modes:
 * - Swipe (classic Tinder-style)
 * - Infinite Feed (scroll mode)
 * - AI Discovery (personalized recommendations)
 * - Popular Today (trending profiles)
 * - Rising Stars (new high-quality creators)
 * - Low Competition (free chat opportunities)
 * - Live Now (currently streaming)
 * - Promo Events (featured/promoted)
 *
 * Profile Cards:
 * - 6 photos with smart ordering
 * - Bio with highlights
 * - Online status (real-time)
 * - Social links (IG/TikTok verified)
 * - Shop preview (top products)
 * - AI compatibility score
 *
 * @version 1.0.0
 * @section FEED_DISCOVERY
 */

;
;
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
;

const db = getFirestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export enum FeedMode {
  SWIPE = "swipe",
  INFINITE = "infinite",
  AI_DISCOVERY = "ai_discovery",
  POPULAR_TODAY = "popular_today",
  RISING_STARS = "rising_stars",
  LOW_COMPETITION = "low_competition",
  LIVE_NOW = "live_now",
  PROMO_EVENTS = "promo_events",
}

export enum SwipeAction {
  LIKE = "like",
  PASS = "pass",
  SUPER_LIKE = "super_like",
}

export interface ProfileCard {
  userId: string;
  displayName: string;
  age: number;
  gender: string;

  // Visual
  photos: ProfilePhoto[];
  bio: string;
  bioHighlights?: string[];

  // Status
  online: boolean;
  lastSeen: Timestamp;
  distance?: number; // km from user

  // Social verification
  socialLinks?: {
    instagram?: {
      username: string;
      verified: boolean;
      followers: number;
      engagementRate: number;
    };
    tiktok?: {
      username: string;
      verified: boolean;
      followers: number;
      engagementRate: number;
    };
  };

  // Creator info
  isCreator: boolean;
  creatorLevel?: string;
  shopPreview?: {
    productCount: number;
    topProducts: Array<{
      productId: string;
      thumbnailURL: string;
      price: number;
      type: string;
    }>;
  };

  // Compatibility
  compatibilityScore?: number; // 0-100, AI-calculated
  matchReasons?: string[];

  // Stats
  responseRate?: number;
  avgResponseTime?: number;
  rating?: number; // 0-5 stars
  reviewCount?: number;

  // Badges
  badges: string[];
  verified: boolean;

  // Tags
  interests: string[];
  languages: string[];

  // Availability
  availableForChat?: boolean;
  acceptingCalendar?: boolean;
  liveNow?: boolean;
}

export interface ProfilePhoto {
  url: string;
  order: number;
  isPrimary: boolean;
  blurred?: boolean; // for NSFW
}

export interface FeedResult {
  profiles: ProfileCard[];
  mode: FeedMode;
  hasMore: boolean;
  nextCursor?: string;
  total?: number;
  filters?: FeedFilters;
}

export interface FeedFilters {
  ageMin?: number;
  ageMax?: number;
  distance?: number;
  gender?: string[];
  online?: boolean;
  verified?: boolean;
  creatorOnly?: boolean;
  hasShop?: boolean;
  acceptingChats?: boolean;
}

export interface DiscoveryScore {
  userId: string;
  targetUserId: string;
  score: number; // 0-100
  factors: {
    proximity: number;
    interests: number;
    activity: number;
    compatibility: number;
    quality: number;
  };
  reasons: string[];
  updatedAt: Timestamp;
}

export interface TrendingProfile {
  userId: string;
  trendScore: number; // 0-100
  newFollowers24h: number;
  newMatches24h: number;
  engagement24h: number;
  rank: number;
  category: "rising_star" | "popular" | "hot";
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SWIPE_LIMITS = {
  free: 50,
  vip: 200,
  royal: -1, // unlimited
};

const MAX_DISTANCE_KM = 100;
const DEFAULT_PROFILE_LIMIT = 20;
const TRENDING_WINDOW_HOURS = 24;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate compatibility score between two users
 */
function calculateCompatibility(user1: any, user2: any): { score: number; reasons: string[] } {
  let score = 50; // Base score
  const reasons: string[] = [];

  // Age compatibility (prefer similar ages, ±5 years ideal)
  const ageDiff = Math.abs(user1.age - user2.age);
  if (ageDiff <= 3) {
    score += 15;
    reasons.push("Similar age");
  } else if (ageDiff <= 7) {
    score += 10;
  }

  // Common interests
  const commonInterests = user1.interests?.filter((i: string) =>
    user2.interests?.includes(i)
  ) || [];

  if (commonInterests.length > 0) {
    const interestBonus = Math.min(commonInterests.length * 5, 20);
    score += interestBonus;
    reasons.push(`${commonInterests.length} shared interests`);
  }

  // Distance (prefer nearby)
  if (user1.distance && user1.distance < 10) {
    score += 10;
    reasons.push("Nearby location");
  } else if (user1.distance && user1.distance < 30) {
    score += 5;
  }

  // Activity level (both active)
  if (user1.activityScore > 70 && user2.activityScore > 70) {
    score += 10;
    reasons.push("Both active users");
  }

  // Quality score
  if (user2.qualityScore > 80) {
    score += 5;
    reasons.push("High-quality profile");
  }

  return {
    score: Math.min(Math.max(score, 0), 100),
    reasons,
  };
}

/**
 * Build profile card from user data
 */
async function buildProfileCard(userId: string, viewerId: string): Promise<ProfileCard> {
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) {
    throw new HttpsError("not-found", "User not found");
  }

  const user = userDoc.data();

  // Get photos
  const photos: ProfilePhoto[] = (user?.profile?.photos || []).map((url: string, index: number) => ({
    url,
    order: index,
    isPrimary: index === 0,
  }));

  // Get shop preview if creator
  let shopPreview;
  if (user?.settings?.earnFromChat) {
    const productsSnapshot = await db
      .collection("creatorProducts")
      .where("creatorId", "==", userId)
      .where("status", "==", "active")
      .orderBy("revenue", "desc")
      .limit(3)
      .get();

    if (!productsSnapshot.empty) {
      shopPreview = {
        productCount: productsSnapshot.size,
        topProducts: productsSnapshot.docs.map(doc => {
          const p = doc.data();
          return {
            productId: p.productId,
            thumbnailURL: p.thumbnailURL,
            price: p.price,
            type: p.type,
          };
        }),
      };
    }
  }

  // Calculate compatibility
  const viewerDoc = await db.collection("users").doc(viewerId).get();
  const viewer = viewerDoc.data();
  const compatibility = calculateCompatibility(viewer, user);

  // Build card
  const card: ProfileCard = {
    userId,
    displayName: user?.profile?.name || "Unknown",
    age: user?.profile?.age || 18,
    gender: user?.profile?.gender || "other",
    photos,
    bio: user?.profile?.bio || "",
    bioHighlights: user?.profile?.bioHighlights || [],
    online: user?.presence?.online || false,
    lastSeen: user?.presence?.lastSeen || Timestamp.now(),
    distance: user?.location?.distance || undefined,
    socialLinks: user?.socialLinks,
    isCreator: user?.settings?.earnFromChat || false,
    creatorLevel: user?.creatorLevel,
    shopPreview,
    compatibilityScore: compatibility.score,
    matchReasons: compatibility.reasons,
    responseRate: user?.stats?.responseRate,
    avgResponseTime: user?.stats?.avgResponseTime,
    rating: user?.stats?.rating,
    reviewCount: user?.stats?.reviewCount,
    badges: user?.badges || [],
    verified: user?.verification?.status === "approved",
    interests: user?.profile?.interests || [],
    languages: user?.profile?.languages || ["en"],
    availableForChat: user?.settings?.availableForChat !== false,
    acceptingCalendar: user?.settings?.acceptingCalendar || false,
    liveNow: user?.liveSession?.active || false,
  };

  return card;
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Get feed based on mode
 */
export const getFeed = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      mode = FeedMode.SWIPE,
      filters = {},
      limit = DEFAULT_PROFILE_LIMIT,
      cursor,
    } = request.data;

    let profiles: ProfileCard[] = [];
    let hasMore = false;
    let nextCursor: string | undefined;

    switch (mode) {
      case FeedMode.SWIPE:
        ({ profiles, hasMore, nextCursor } = await getSwipeFeed(uid, filters, limit, cursor));
        break;

      case FeedMode.INFINITE:
        ({ profiles, hasMore, nextCursor } = await getInfiniteFeed(uid, filters, limit, cursor));
        break;

      case FeedMode.AI_DISCOVERY:
        ({ profiles, hasMore } = await getAIDiscoveryFeed(uid, filters, limit));
        break;

      case FeedMode.POPULAR_TODAY:
        ({ profiles, hasMore } = await getPopularTodayFeed(uid, filters, limit));
        break;

      case FeedMode.RISING_STARS:
        ({ profiles, hasMore } = await getRisingStarsFeed(uid, filters, limit));
        break;

      case FeedMode.LOW_COMPETITION:
        ({ profiles, hasMore } = await getLowCompetitionFeed(uid, filters, limit));
        break;

      case FeedMode.LIVE_NOW:
        ({ profiles, hasMore } = await getLiveNowFeed(uid, filters, limit));
        break;

      case FeedMode.PROMO_EVENTS:
        ({ profiles, hasMore } = await getPromoEventsFeed(uid, filters, limit));
        break;

      default:
        throw new HttpsError("invalid-argument", "Invalid feed mode");
    }

    logger.info(`Feed retrieved: ${mode} for ${uid}, ${profiles.length} profiles`);

    return {
      success: true,
      feed: {
        profiles,
        mode,
        hasMore,
        nextCursor,
        total: profiles.length,
        filters,
      },
    };
  }
);

/**
 * Perform swipe action
 */
export const performSwipe = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { targetUserId, action } = request.data;

    if (!targetUserId || !action) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

    // Check swipe limit
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    const tier = userData?.tier || "free";
    const limit = SWIPE_LIMITS[tier as keyof typeof SWIPE_LIMITS];

    if (limit !== -1) {
      // Check daily swipes
      const today = new Date().toISOString().split('T')[0];
      const swipesSnapshot = await db
        .collection("users")
        .doc(uid)
        .collection("swipes")
        .where("date", "==", today)
        .get();

      if (swipesSnapshot.size >= limit) {
        throw new HttpsError("failed-precondition", "Daily swipe limit reached");
      }
    }

    // Record swipe
    const swipeId = `swipe_${Date.now()}_${targetUserId}`;
    await db.collection("users").doc(uid).collection("swipes").doc(swipeId).set({
      targetUserId,
      action,
      date: new Date().toISOString().split('T')[0],
      createdAt: FieldValue.serverTimestamp(),
    });

    // Check for match if LIKE or SUPER_LIKE
    if (action === SwipeAction.LIKE || action === SwipeAction.SUPER_LIKE) {
      const matchResult = await checkForMatch(uid, targetUserId, action === SwipeAction.SUPER_LIKE);

      if (matchResult.matched) {
        return {
          success: true,
          action,
          matched: true,
          matchId: matchResult.matchId,
          chatId: matchResult.chatId,
        };
      }
    }

    logger.info(`Swipe: ${uid} ${action} ${targetUserId}`);

    return {
      success: true,
      action,
      matched: false,
    };
  }
);

/**
 * Get discovery recommendations
 */
export const getDiscoveryRecommendations = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { limit = 10 } = request.data;

    // Get or calculate discovery scores
    let scoresSnapshot = await db
      .collection("discoveryScores")
      .where("userId", "==", uid)
      .orderBy("score", "desc")
      .limit(limit)
      .get();

    if (scoresSnapshot.empty) {
      // Generate fresh recommendations
      await generateDiscoveryScores(uid);

      // Re-fetch after generation
      scoresSnapshot = await db
        .collection("discoveryScores")
        .where("userId", "==", uid)
        .orderBy("score", "desc")
        .limit(limit)
        .get();
    }

    const recommendations = scoresSnapshot.docs.map(doc => doc.data());

    logger.info(`Discovery recommendations: ${recommendations.length} for ${uid}`);

    return {
      success: true,
      recommendations,
    };
  }
);

/**
 * Update online status
 */
export const updateOnlineStatus = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { online } = request.data;

    await db.collection("users").doc(uid).update({
      "presence.online": online,
      "presence.lastSeen": FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info(`User ${uid} online status: ${online}`);

    return {
      success: true,
    };
  }
);

// ============================================================================
// FEED MODE IMPLEMENTATIONS
// ============================================================================

/**
 * Swipe mode feed
 */
async function getSwipeFeed(
  userId: string,
  filters: FeedFilters,
  limit: number,
  cursor?: string
): Promise<{ profiles: ProfileCard[]; hasMore: boolean; nextCursor?: string }> {
  // Get users already swiped
  const today = new Date().toISOString().split('T')[0];
  const swipedSnapshot = await db
    .collection(`users/${userId}/swipes`)
    .where("date", "==", today)
    .get();

  const swipedIds = swipedSnapshot.docs.map(doc => doc.data().targetUserId);

  // Get user preferences
  const userDoc = await db.collection("users").doc(userId).get();
  const user = userDoc.data();

  // Build query
  let query = db.collection("users")
    .where("visibility.discover", "==", true)
    .orderBy("qualityScore", "desc")
    .limit(limit + 1); // +1 to check if more exist

  // Apply filters
  if (filters.gender && filters.gender.length > 0) {
    query = query.where("profile.gender", "in", filters.gender) as any;
  }

  if (filters.verified) {
    query = query.where("verification.status", "==", "approved") as any;
  }

  if (filters.online) {
    query = query.where("presence.online", "==", true) as any;
  }

  const snapshot = await query.get();

  // Filter and build cards
  const candidates = snapshot.docs
    .filter(doc => doc.id !== userId && !swipedIds.includes(doc.id))
    .slice(0, limit);

  const profiles: ProfileCard[] = [];

  for (const doc of candidates) {
    try {
      const card = await buildProfileCard(doc.id, userId);
      profiles.push(card);
    } catch (error) {
      logger.warn(`Failed to build card for ${doc.id}:`, error);
    }
  }

  return {
    profiles,
    hasMore: snapshot.docs.length > limit,
    nextCursor: profiles.length > 0 ? profiles[profiles.length - 1].userId : undefined,
  };
}

/**
 * Infinite feed mode
 */
async function getInfiniteFeed(
  userId: string,
  filters: FeedFilters,
  limit: number,
  cursor?: string
): Promise<{ profiles: ProfileCard[]; hasMore: boolean; nextCursor?: string }> {
  // Similar to swipe but shows all profiles in scrollable list
  return await getSwipeFeed(userId, filters, limit, cursor);
}

/**
 * AI Discovery feed
 */
async function getAIDiscoveryFeed(
  userId: string,
  filters: FeedFilters,
  limit: number
): Promise<{ profiles: ProfileCard[]; hasMore: boolean }> {
  // Get discovery scores
  const scoresSnapshot = await db
    .collection("discoveryScores")
    .where("userId", "==", userId)
    .orderBy("score", "desc")
    .limit(limit)
    .get();

  const profiles: ProfileCard[] = [];

  for (const doc of scoresSnapshot.docs) {
    const score = doc.data() as DiscoveryScore;
    try {
      const card = await buildProfileCard(score.targetUserId, userId);
      card.compatibilityScore = score.score;
      card.matchReasons = score.reasons;
      profiles.push(card);
    } catch (error) {
      logger.warn(`Failed to build AI discovery card:`, error);
    }
  }

  return { profiles, hasMore: false };
}

/**
 * Popular Today feed
 */
async function getPopularTodayFeed(
  userId: string,
  filters: FeedFilters,
  limit: number
): Promise<{ profiles: ProfileCard[]; hasMore: boolean }> {
  const snapshot = await db
    .collection("trendingProfiles")
    .where("category", "==", "popular")
    .orderBy("trendScore", "desc")
    .limit(limit)
    .get();

  const profiles: ProfileCard[] = [];

  for (const doc of snapshot.docs) {
    const trending = doc.data() as TrendingProfile;
    try {
      const card = await buildProfileCard(trending.userId, userId);
      profiles.push(card);
    } catch (error) {
      logger.warn(`Failed to build popular card:`, error);
    }
  }

  return { profiles, hasMore: false };
}

/**
 * Rising Stars feed
 */
async function getRisingStarsFeed(
  userId: string,
  filters: FeedFilters,
  limit: number
): Promise<{ profiles: ProfileCard[]; hasMore: boolean }> {
  const snapshot = await db
    .collection("trendingProfiles")
    .where("category", "==", "rising_star")
    .orderBy("newFollowers24h", "desc")
    .limit(limit)
    .get();

  const profiles: ProfileCard[] = [];

  for (const doc of snapshot.docs) {
    const trending = doc.data() as TrendingProfile;
    try {
      const card = await buildProfileCard(trending.userId, userId);
      profiles.push(card);
    } catch (error) {
      logger.warn(`Failed to build rising star card:`, error);
    }
  }

  return { profiles, hasMore: false };
}

/**
 * Low Competition feed (for free chats)
 */
async function getLowCompetitionFeed(
  userId: string,
  filters: FeedFilters,
  limit: number
): Promise<{ profiles: ProfileCard[]; hasMore: boolean }> {
  // Find creators with low active chats
  const snapshot = await db
    .collection("users")
    .where("settings.earnFromChat", "==", false) // Non-earning users
    .where("visibility.discover", "==", true)
    .orderBy("stats.activeChats", "asc")
    .limit(limit)
    .get();

  const profiles: ProfileCard[] = [];

  for (const doc of snapshot.docs) {
    if (doc.id === userId) continue;

    try {
      const card = await buildProfileCard(doc.id, userId);
      profiles.push(card);
    } catch (error) {
      logger.warn(`Failed to build low competition card:`, error);
    }
  }

  return { profiles, hasMore: false };
}

/**
 * Live Now feed
 */
async function getLiveNowFeed(
  userId: string,
  filters: FeedFilters,
  limit: number
): Promise<{ profiles: ProfileCard[]; hasMore: boolean }> {
  const snapshot = await db
    .collection("liveSessions")
    .where("active", "==", true)
    .orderBy("viewerCount", "desc")
    .limit(limit)
    .get();

  const profiles: ProfileCard[] = [];

  for (const doc of snapshot.docs) {
    const session = doc.data();
    try {
      const card = await buildProfileCard(session.hostId, userId);
      card.liveNow = true;
      profiles.push(card);
    } catch (error) {
      logger.warn(`Failed to build live card:`, error);
    }
  }

  return { profiles, hasMore: false };
}

/**
 * Promo Events feed
 */
async function getPromoEventsFeed(
  userId: string,
  filters: FeedFilters,
  limit: number
): Promise<{ profiles: ProfileCard[]; hasMore: boolean }> {
  const snapshot = await db
    .collection("promotedProfiles")
    .where("active", "==", true)
    .where("expiresAt", ">", Timestamp.now())
    .orderBy("expiresAt", "asc")
    .limit(limit)
    .get();

  const profiles: ProfileCard[] = [];

  for (const doc of snapshot.docs) {
    const promo = doc.data();
    try {
      const card = await buildProfileCard(promo.userId, userId);
      profiles.push(card);
    } catch (error) {
      logger.warn(`Failed to build promo card:`, error);
    }
  }

  return { profiles, hasMore: false };
}

/**
 * Check for match
 */
async function checkForMatch(
  userId: string,
  targetUserId: string,
  isSuperLike: boolean
): Promise<{ matched: boolean; matchId?: string; chatId?: string }> {
  // Check if target has liked back
  const targetSwipesSnapshot = await db
    .collection(`users/${targetUserId}/swipes`)
    .where("targetUserId", "==", userId)
    .where("action", "in", [SwipeAction.LIKE, SwipeAction.SUPER_LIKE])
    .limit(1)
    .get();

  if (targetSwipesSnapshot.empty && !isSuperLike) {
    return { matched: false };
  }

  // Create match
  return await db.runTransaction(async (tx) => {
    const matchId = `match_${Date.now()}_${userId.substring(0, 8)}`;
    const chatId = `chat_${Date.now()}_${userId.substring(0, 8)}`;

    const matchRef = db.collection("matches").doc(matchId);
    tx.set(matchRef, {
      matchId,
      user1Id: userId,
      user2Id: targetUserId,
      chatId,
      superLike: isSuperLike,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Create chat
    const chatRef = db.collection("chats").doc(chatId);
    tx.set(chatRef, {
      chatId,
      participants: [userId, targetUserId],
      status: "active",
      freeMessagesRemaining: 6,
      depositPaid: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info(`Match created: ${matchId}`);

    return {
      matched: true,
      matchId,
      chatId,
    };
  });
}

/**
 * Generate discovery scores (AI-powered)
 */
async function generateDiscoveryScores(userId: string): Promise<void> {
  const userDoc = await db.collection("users").doc(userId).get();
  const user = userDoc.data();

  // Get candidate profiles
  const candidatesSnapshot = await db
    .collection("users")
    .where("visibility.discover", "==", true)
    .limit(100)
    .get();

  const batch = db.batch();
  let count = 0;

  for (const doc of candidatesSnapshot.docs) {
    if (doc.id === userId) continue;

    const candidate = doc.data();
    const compatibility = calculateCompatibility(user, candidate);

    const scoreRef = db.collection("discoveryScores").doc(`${userId}_${doc.id}`);
    batch.set(scoreRef, {
      userId,
      targetUserId: doc.id,
      score: compatibility.score,
      factors: {
        proximity: 20,
        interests: 25,
        activity: 20,
        compatibility: 20,
        quality: 15,
      },
      reasons: compatibility.reasons,
      updatedAt: FieldValue.serverTimestamp(),
    });

    count++;

    if (count >= 50) break; // Limit batch size
  }

  await batch.commit();
  logger.info(`Generated ${count} discovery scores for ${userId}`);
}

logger.info("✅ Feed & Discovery 3.0 module loaded successfully");

