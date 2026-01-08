/**
 * PHASE 48 - Global Feed System
 *
 * Multi-region, multi-language content feed with intelligent ranking
 * Combines engagement metrics, trust scores, and personalization
 *
 * Features:
 * - Redis-backed caching (15 min TTL)
 * - Region & language filtering
 * - Trust-weighted ranking algorithm
 * - Automatic cache invalidation on new posts
 * - Scheduled background refresh
 *
 * Region: europe-west3
 */

;
;
import { HttpsError } from 'firebase-functions/v2/https';
;
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
;
;
;
;

const db = getFirestore();

/**
 * Feed post entry structure
 */
interface FeedPost {
  postId: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  authorTrustTier: string;
  content: string;
  media?: {
    type: "photo" | "video";
    url: string;
    thumbnail?: string;
  }[];
  tags: string[];
  location: {
    city?: string;
    country: string;
    region: string; // EU, US, ASIA
  };
  language: string;
  engagement: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
    score: number; // Calculated engagement score
  };
  trustScore: number; // Author's trust score (0-1000)
  feedScore: number; // Final ranking score
  createdAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
  visibility: "public" | "followers" | "private";
  status: "active" | "flagged" | "removed";
}

/**
 * Feed request parameters
 */
interface FeedParams {
  region: string;
  language: string;
  page?: number;
  limit?: number;
  filters?: {
    tags?: string[];
    minTrustScore?: number;
    timeWindow?: "1h" | "6h" | "24h" | "7d" | "30d";
  };
}

/**
 * Cache configuration
 */
const FEED_CACHE_TTL = 15 * 60; // 15 minutes
const FEED_PAGE_SIZE = 20;
const MAX_FEED_PAGES = 10;

/**
 * Get Global Feed (Cached)
 *
 * Returns personalized feed based on region, language, and user preferences
 * Results are cached per region+language combination
 */
export const getGlobalFeedV1 = onCall(
  { region: "europe-west3", memory: "512MiB" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Validate input
    const schema = z.object({
      region: z.enum(["EU", "US", "ASIA", "GLOBAL"]),
      language: z.string().length(2), // ISO 639-1 code (e.g., "en", "pl")
      page: z.number().min(0).max(MAX_FEED_PAGES).optional().default(0),
      limit: z.number().min(5).max(50).optional().default(FEED_PAGE_SIZE),
      filters: z.object({
        tags: z.array(z.string()).optional(),
        minTrustScore: z.number().min(0).max(1000).optional(),
        timeWindow: z.enum(["1h", "6h", "24h", "7d", "30d"]).optional(),
      }).optional(),
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const params = validationResult.data;
    const cacheKey = `feed:${params.region}:${params.language}:${params.page}:${JSON.stringify(params.filters || {})}`;

    logger.info(`Fetching global feed: ${cacheKey}`, { uid });

    try {
      // Try to get from cache
      const cachedFeed = await getCached<FeedPost[]>(
        cacheKey,
        async () => {
          // Cache miss - fetch and rank posts
          return await fetchAndRankPosts({
            region: params.region,
            language: params.language,
            page: params.page,
            limit: params.limit,
            filters: params.filters,
          });
        },
        FEED_CACHE_TTL,
        [`feed`, `region:${params.region}`, `lang:${params.language}`]
      );

      // Filter out posts from blocked users
      const userDoc = await db.collection("users").doc(uid).get();
      const blockedUsers = userDoc.data()?.blockedUsers || [];
      const filteredFeed = cachedFeed.filter(
        post => !blockedUsers.includes(post.authorId)
      );

      // Apply pagination
      const start = params.page * params.limit;
      const paginatedFeed = filteredFeed.slice(start, start + params.limit);

      // Log analytics event
      await logFeedView(uid, params.region, params.language, paginatedFeed.length);

      return {
        success: true,
        posts: paginatedFeed,
        pagination: {
          page: params.page,
          limit: params.limit,
          total: filteredFeed.length,
          hasMore: filteredFeed.length > start + params.limit,
        },
        metadata: {
          region: params.region,
          language: params.language,
          cachedAt: new Date().toISOString(),
          cacheKey,
        },
      };
    } catch (error: any) {
      logger.error("Error fetching global feed", { error, uid, params });
      throw new HttpsError("internal", `Failed to fetch feed: ${error.message}`);
    }
  }
);

/**
 * Fetch and rank posts from Firestore
 *
 * Algorithm:
 * 1. Fetch posts from region+language
 * 2. Apply time window filter
 * 3. Calculate engagement score
 * 4. Fetch author trust scores
 * 5. Calculate final feed score: (engagement * 0.6) + (trust * 0.4)
 * 6. Sort by feed score descending
 * 7. Return top N posts
 */
async function fetchAndRankPosts(params: FeedParams): Promise<FeedPost[]> {
  logger.info("Fetching posts from Firestore", { params });

  // Calculate time window
  const timeWindowMs = getTimeWindowMs(params.filters?.timeWindow || "24h");
  const cutoffTime = Timestamp.fromMillis(Date.now() - timeWindowMs);

  // Build Firestore query
  let query = db
    .collection("posts")
    .where("status", "==", "active")
    .where("visibility", "==", "public")
    .where("createdAt", ">=", cutoffTime);

  // Add region filter (unless GLOBAL)
  if (params.region !== "GLOBAL") {
    query = query.where("location.region", "==", params.region);
  }

  // Add language filter
  query = query.where("language", "==", params.language);

  // Execute query (limit to 500 posts for ranking)
  const postsSnapshot = await query.orderBy("createdAt", "desc").limit(500).get();

  if (postsSnapshot.empty) {
    logger.info("No posts found for query", { params });
    return [];
  }

  logger.info(`Found ${postsSnapshot.size} posts, ranking...`);

  // Fetch author trust scores in parallel
  const authorIds = [...new Set(postsSnapshot.docs.map(doc => doc.data().authorId))];
  const trustScores = await fetchTrustScores(authorIds);

  // Process and rank posts
  const rankedPosts: FeedPost[] = [];

  for (const doc of postsSnapshot.docs) {
    const data = doc.data();

    // Apply filters
    if (params.filters?.tags && params.filters.tags.length > 0) {
      const postTags = data.tags || [];
      const hasMatchingTag = params.filters.tags.some(tag => postTags.includes(tag));
      if (!hasMatchingTag) continue;
    }

    const authorTrustScore = trustScores[data.authorId] || 0;

    if (params.filters?.minTrustScore && authorTrustScore < params.filters.minTrustScore) {
      continue;
    }

    // Calculate engagement score (0-100)
    const engagementScore = calculateEngagementScore({
      likes: data.engagement?.likes || 0,
      comments: data.engagement?.comments || 0,
      shares: data.engagement?.shares || 0,
      views: data.engagement?.views || 0,
    });

    // Calculate final feed score
    // Formula: (engagement * 0.6) + (trustScore * 0.04) + recency_boost
    const trustComponent = (authorTrustScore / 1000) * 100;
    const recencyBoost = calculateRecencyBoost(data.createdAt);

    const feedScore = Math.round(
      (engagementScore * 0.6) +
      (trustComponent * 0.4) +
      recencyBoost
    );

    // Build feed post object
    const feedPost: FeedPost = {
      postId: doc.id,
      authorId: data.authorId,
      authorName: data.authorName || "Unknown",
      authorPhoto: data.authorPhoto,
      authorTrustTier: getTrustTier(authorTrustScore),
      content: data.content,
      media: data.media,
      tags: data.tags || [],
      location: data.location,
      language: data.language,
      engagement: {
        likes: data.engagement?.likes || 0,
        comments: data.engagement?.comments || 0,
        shares: data.engagement?.shares || 0,
        views: data.engagement?.views || 0,
        score: engagementScore,
      },
      trustScore: authorTrustScore,
      feedScore,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      visibility: data.visibility,
      status: data.status,
    };

    rankedPosts.push(feedPost);
  }

  // Sort by feed score descending
  rankedPosts.sort((a, b) => b.feedScore - a.feedScore);

  logger.info(`Ranked ${rankedPosts.length} posts`);

  return rankedPosts;
}

/**
 * Fetch trust scores for multiple users (batched)
 */
async function fetchTrustScores(userIds: string[]): Promise<Record<string, number>> {
  const trustScores: Record<string, number> = {};

  if (userIds.length === 0) return trustScores;

  // Batch fetch trust profiles (Firestore allows max 10 in one query)
  const batchSize = 10;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    const trustDocs = await db
      .collection("trustProfiles")
      .where("userId", "in", batch)
      .get();

    trustDocs.forEach(doc => {
      const data = doc.data();
      trustScores[data.userId] = data.trustScore || 0;
    });
  }

  // Fill in missing scores with default (500 = Silver tier)
  userIds.forEach(userId => {
    if (!(userId in trustScores)) {
      trustScores[userId] = 500;
    }
  });

  return trustScores;
}

/**
 * Calculate engagement score (0-100)
 *
 * Formula: weighted sum of interactions
 * - Likes: 1 point each
 * - Comments: 5 points each (more valuable)
 * - Shares: 10 points each (highest value)
 * - Views: 0.01 point each (base metric)
 */
function calculateEngagementScore(engagement: {
  likes: number;
  comments: number;
  shares: number;
  views: number;
}): number {
  const rawScore =
    (engagement.likes * 1) +
    (engagement.comments * 5) +
    (engagement.shares * 10) +
    (engagement.views * 0.01);

  // Normalize to 0-100 scale (using logarithmic scaling for better distribution)
  const normalized = Math.min(100, Math.log10(rawScore + 1) * 25);

  return Math.round(normalized);
}

/**
 * Calculate recency boost (0-20 points)
 *
 * Recent posts get a temporary boost to appear higher in feed
 * Decays exponentially over 24 hours
 */
function calculateRecencyBoost(createdAt: Timestamp | FieldValue): number {
  if (!(createdAt instanceof Timestamp)) {
    return 0;
  }

  const ageMs = Date.now() - createdAt.toMillis();
  const ageHours = ageMs / (60 * 60 * 1000);

  // Exponential decay: 20 points at 0h, 10 at 6h, 5 at 12h, 0 at 24h
  const boost = 20 * Math.exp(-ageHours / 8);

  return Math.round(Math.max(0, boost));
}

/**
 * Get time window in milliseconds
 */
function getTimeWindowMs(window: "1h" | "6h" | "24h" | "7d" | "30d"): number {
  const windows: Record<string, number> = {
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };

  return windows[window] || windows["24h"];
}

/**
 * Get trust tier name from score
 */
function getTrustTier(score: number): string {
  if (score >= 900) return "diamond";
  if (score >= 800) return "platinum";
  if (score >= 600) return "gold";
  if (score >= 400) return "silver";
  if (score >= 200) return "bronze";
  return "restricted";
}

/**
 * Log feed view analytics event
 */
async function logFeedView(
  userId: string,
  region: string,
  language: string,
  postCount: number
): Promise<void> {
  try {
    await db.collection("analyticsEvents").add({
      eventId: `feed_view_${Date.now()}_${userId}`,
      eventName: "feed_viewed",
      uid: userId,
      role: "user",
      source: "global_feed",
      locale: language,
      country: region,
      screen: "global_feed",
      payload: {
        region,
        language,
        postCount,
      },
      clientTimestamp: null,
      serverTimestamp: Timestamp.now(),
      processed: false,
      createdAt: Timestamp.now(),
    });
  } catch (error) {
    logger.warn("Failed to log feed view", { error, userId });
  }
}

/**
 * Invalidate Feed Cache
 *
 * Called when a new post is created to ensure fresh content
 */
export const invalidateFeedCacheV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const schema = z.object({
      postId: z.string(),
      region: z.string().optional(),
      language: z.string().optional(),
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { postId, region, language } = validationResult.data;

    logger.info(`Invalidating feed cache for post: ${postId}`, { uid, region, language });

    try {
      // Invalidate specific region+language cache
      if (region && language) {
        await invalidateCacheByTags([`feed`, `region:${region}`, `lang:${language}`]);
      } else {
        // Invalidate all feed caches
        await invalidateCacheByTags([`feed`]);
      }

      return {
        success: true,
        postId,
        message: "Feed cache invalidated",
      };
    } catch (error: any) {
      logger.error("Error invalidating feed cache", { error, postId });
      throw new HttpsError("internal", `Failed to invalidate cache: ${error.message}`);
    }
  }
);

/**
 * Scheduled job: Refresh global feed cache
 *
 * Runs every 15 minutes to pre-warm cache for popular region+language combinations
 */
export const refreshGlobalFeedScheduled = onSchedule(
  {
    schedule: "*/15 * * * *", // Every 15 minutes
    region: "europe-west3",
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async () => {
    logger.info("Starting scheduled feed refresh");

    try {
      // Popular region+language combinations to pre-warm
      const combinations = [
        { region: "EU", language: "en" },
        { region: "EU", language: "pl" },
        { region: "EU", language: "de" },
        { region: "EU", language: "fr" },
        { region: "US", language: "en" },
        { region: "US", language: "es" },
        { region: "ASIA", language: "en" },
        { region: "ASIA", language: "zh" },
        { region: "GLOBAL", language: "en" },
      ];

      let refreshed = 0;
      let errors = 0;

      for (const combo of combinations) {
        try {
          const posts = await fetchAndRankPosts({
            region: combo.region,
            language: combo.language,
            limit: FEED_PAGE_SIZE,
          });

          // Store in cache
          const cacheKey = `feed:${combo.region}:${combo.language}:0:{}`;
          await getCached(
            cacheKey,
            async () => posts,
            FEED_CACHE_TTL,
            [`feed`, `region:${combo.region}`, `lang:${combo.language}`]
          );

          refreshed++;
          logger.info(`Refreshed feed cache: ${combo.region}/${combo.language} (${posts.length} posts)`);
        } catch (error: any) {
          logger.error(`Failed to refresh feed: ${combo.region}/${combo.language}`, { error });
          errors++;
        }
      }

      logger.info(`Feed refresh complete: ${refreshed} succeeded, ${errors} failed`);

      // Log to engineLogs
      const today = new Date().toISOString().split("T")[0];
      await db
        .collection("engineLogs")
        .doc("globalFeed")
        .collection(today)
        .doc("refresh")
        .set(
          {
            refreshes: {
              [new Date().toISOString()]: {
                refreshed,
                errors,
                combinations: combinations.length,
              },
            },
          },
          { merge: true }
        );
    } catch (error: any) {
      logger.error("Feed refresh scheduler failed", { error });
      throw error;
    }
  }
);

/**
 * Export types for use in other modules
 */
export type { FeedPost, FeedParams };

