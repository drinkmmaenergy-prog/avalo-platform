/**
 * PACK 282 — Feed Engine
 * Core feed functionality: post creation, retrieval, ranking, and algorithm
 * PACK 325 Integration: Boost ranking for promoted posts
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db, serverTimestamp, generateId } from './init';
import { logger } from 'firebase-functions/v2';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import * as z from 'zod';
import { getActiveBoostForContent } from './pack325-feed-boosts';
import {
  FeedPost,
  CreatePostInput,
  UpdatePostInput,
  FeedQuery,
  FeedResponse,
  FeedPostWithAuthor,
  PostRankingScore,
  RankingConfig,
  DEFAULT_RANKING_WEIGHTS,
  FeedContext,
  FeedError,
  FeedErrorCode,
  NSFWFlag,
  PostVisibility,
} from './pack282-feed-types';
import { moderateImage, moderateText, ModerationResult } from './aiModeration';
import { getEnforcementState } from './moderationEngine';

// ============================================================================
// SCHEMAS
// ============================================================================

const MediaItemSchema = z.object({
  url: z.string().url(),
  thumbUrl: z.string().url().optional(),
  aspectRatio: z.number().min(0.1).max(10),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  duration: z.number().positive().optional(),
  order: z.number().nonnegative().optional(),
});

const CreatePostSchema = z.object({
  type: z.enum(['photo', 'video', 'carousel']),
  media: z.array(MediaItemSchema).min(1).max(10),
  caption: z.string().max(2200),
  tags: z.array(z.string()).max(30).optional(),
  location: z.object({
    city: z.string().optional(),
    country: z.string().optional(),
    coordinates: z.object({
      lat: z.number(),
      lng: z.number(),
    }).optional(),
  }).optional(),
  visibility: z.enum(['public', 'followers', 'subscribers']),
});

const UpdatePostSchema = z.object({
  caption: z.string().max(2200).optional(),
  tags: z.array(z.string()).max(30).optional(),
  location: z.object({
    city: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  visibility: z.enum(['public', 'followers', 'subscribers']).optional(),
});

const GetFeedSchema = z.object({
  limit: z.number().min(1).max(50).optional().default(20),
  cursor: z.string().optional(),
  authorId: z.string().optional(),
  onlyFollowing: z.boolean().optional(),
  excludeNSFW: z.boolean().optional(),
});

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if user is verified 18+
 */
async function isVerified18Plus(userId: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  return userDoc.exists && userDoc.data()?.verified18Plus === true;
}

/**
 * Get user's following list
 */
async function getUserFollowing(userId: string): Promise<string[]> {
  const followsSnap = await db
    .collection('follows')
    .where('followerId', '==', userId)
    .select('followingId')
    .get();
  
  return followsSnap.docs.map(doc => doc.data().followingId);
}

/**
 * Get user's NSFW filter preferences
 */
async function getUserNSFWFilter(userId: string): Promise<NSFWFlag[]> {
  const prefsDoc = await db.collection('feedPreferences').doc(userId).get();
  const prefs = prefsDoc.data();
  
  if (!prefs) {
    // Default: show safe and soft
    return ['safe', 'soft'];
  }
  
  const allowedFlags: NSFWFlag[] = ['safe'];
  if (!prefs.hideSoftNSFW) allowedFlags.push('soft');
  if (!prefs.hideEroticNSFW) allowedFlags.push('erotic');
  
  return allowedFlags;
}

/**
 * Classify NSFW content
 */
async function classifyNSFW(
  mediaUrls: string[],
  caption: string
): Promise<{ flag: NSFWFlag; scores: any; autoDetected: boolean }> {
  try {
    // Moderate first image and caption
    const [imageResult, textResult] = await Promise.all([
      mediaUrls.length > 0 ? moderateImage(mediaUrls[0]) : null,
      caption ? moderateText(caption) : null,
    ]);

    const nsfwScore = Math.max(
      imageResult?.scores.nsfw || 0,
      textResult?.scores.nsfw || 0
    );

    const sexualScore = Math.max(
      imageResult?.scores.sexual || 0,
      textResult?.scores.sexual || 0
    );

    const violenceScore = Math.max(
      imageResult?.scores.violence || 0,
      textResult?.scores.violence || 0
    );

    // Determine flag based on scores
    let flag: NSFWFlag = 'safe';
    
    if (imageResult?.action === 'block' || textResult?.action === 'block') {
      flag = 'blocked';
    } else if (sexualScore >= 0.8 || nsfwScore >= 0.8) {
      flag = 'erotic';
    } else if (sexualScore >= 0.5 || nsfwScore >= 0.5) {
      flag = 'soft';
    }

    return {
      flag,
      scores: {
        adult: imageResult?.scores.nsfw || 0,
        racy: imageResult?.scores.sexual || 0,
        violence: violenceScore,
      },
      autoDetected: true,
    };
  } catch (error: any) {
    logger.error('NSFW classification failed:', error);
    // Default to safe if classification fails
    return {
      flag: 'safe',
      scores: {},
      autoDetected: false,
    };
  }
}

/**
 * Calculate post ranking score
 * PACK 325: Includes boost multiplier for promoted content
 */
async function calculateRankingScore(
  post: FeedPost,
  context: FeedContext,
  config: RankingConfig = {
    weights: DEFAULT_RANKING_WEIGHTS,
    decayHalfLife: 24,
    minSafetyScore: 0.3,
    nsfwPenalty: 0.5,
  }
): Promise<{ score: number; boosted: boolean; boostId?: string }> {
  const now = Date.now();
  const postAge = now - post.createdAt.toMillis();
  const hoursOld = postAge / (1000 * 60 * 60);

  // Recency score (exponential decay)
  const recency = Math.exp(-0.693 * hoursOld / config.decayHalfLife);

  // Relationship score
  const isFollowing = context.following.includes(post.authorId);
  const recentInteraction = context.recentInteractions.includes(post.authorId);
  const relationship = isFollowing ? 1.0 : recentInteraction ? 0.5 : 0.0;

  // Engagement score
  const totalEngagements = post.stats.likes + post.stats.comments * 2 + post.stats.saves * 3;
  const engagement = Math.min(1.0, totalEngagements / 100);

  // Quality score (based on author's profile score)
  const quality = (context.profileScore || 50) / 100;

  // Safety score
  const safety = context.safetyScore || 0.8;

  // Diversity score (placeholder - can be enhanced)
  const diversity = 0.5;

  // NSFW penalty
  let nsfwMultiplier = 1.0;
  if (post.nsfw.flag === 'soft') nsfwMultiplier = 0.8;
  if (post.nsfw.flag === 'erotic') nsfwMultiplier = 0.5;

  // Calculate base weighted score
  const baseScore = (
    recency * config.weights.recency +
    relationship * config.weights.relationship +
    engagement * config.weights.engagement +
    quality * config.weights.quality +
    safety * config.weights.safety +
    diversity * config.weights.diversity
  ) * nsfwMultiplier;

  // PACK 325: Check for active boost
  const activeBoost = await getActiveBoostForContent(post.postId);
  let boostMultiplier = 1.0;
  let boosted = false;
  let boostId: string | undefined;

  if (activeBoost) {
    // Apply boost multiplier (1.5x - 3x based on boost size)
    const boostSizes: Record<string, number> = {
      SMALL: 1.5,
      MEDIUM: 2.0,
      LARGE: 3.0,
    };
    
    // Determine boost size from tokens paid
    const size = activeBoost.tokensPaid === 200 ? 'SMALL' :
                 activeBoost.tokensPaid === 500 ? 'MEDIUM' : 'LARGE';
    
    boostMultiplier = boostSizes[size] || 1.5;
    boosted = true;
    boostId = activeBoost.id;

    logger.info(`Post ${post.postId} has active boost ${boostId} with ${boostMultiplier}x multiplier`);
  }

  const finalScore = Math.min(1.0, Math.max(0.0, baseScore * boostMultiplier));

  return {
    score: finalScore,
    boosted,
    boostId,
  };
}

/**
 * Enrich posts with author data
 */
async function enrichPostsWithAuthors(
  posts: FeedPost[],
  currentUserId?: string
): Promise<FeedPostWithAuthor[]> {
  const authorIds = Array.from(new Set(posts.map(p => p.authorId)));
  
  // Batch fetch authors
  const authorsSnap = await db
    .collection('users')
    .where('__name__', 'in', authorIds.slice(0, 10)) // Firestore limit
    .select('displayName', 'username', 'avatarUrl', 'verified', 'profileScore')
    .get();
  
  const authorsMap = new Map(
    authorsSnap.docs.map(doc => [doc.id, doc.data()])
  );

  // Get user interactions if logged in
  let likesSet = new Set<string>();
  let savesSet = new Set<string>();
  let followingSet = new Set<string>();

  if (currentUserId) {
    const [likesSnap, savesSnap, followsSnap] = await Promise.all([
      db.collection('feedLikes')
        .where('userId', '==', currentUserId)
        .where('postId', 'in', posts.map(p => p.postId).slice(0, 10))
        .select('postId')
        .get(),
      db.collection('feedSaves')
        .where('userId', '==', currentUserId)
        .where('postId', 'in', posts.map(p => p.postId).slice(0, 10))
        .select('postId')
        .get(),
      db.collection('follows')
        .where('followerId', '==', currentUserId)
        .select('followingId')
        .get(),
    ]);

    likesSet = new Set(likesSnap.docs.map(d => d.data().postId));
    savesSet = new Set(savesSnap.docs.map(d => d.data().postId));
    followingSet = new Set(followsSnap.docs.map(d => d.data().followingId));
  }

  return posts.map(post => {
    const author = authorsMap.get(post.authorId);
    return {
      ...post,
      author: {
        userId: post.authorId,
        displayName: author?.displayName || 'Unknown',
        username: author?.username || 'unknown',
        avatarUrl: author?.avatarUrl,
        verified: author?.verified,
        profileScore: author?.profileScore,
      },
      userInteractions: currentUserId ? {
        liked: likesSet.has(post.postId),
        saved: savesSet.has(post.postId),
        following: followingSet.has(post.authorId),
      } : undefined,
    };
  });
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Create a new post
 */
export const createPost = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    // Verify 18+ status
    const is18Plus = await isVerified18Plus(uid);
    if (!is18Plus) {
      throw new HttpsError(
        'permission-denied',
        'Only verified 18+ users can post',
        { code: FeedErrorCode.NOT_VERIFIED_18_PLUS }
      );
    }

    // Check enforcement state
    const enforcement = await getEnforcementState(uid);
    if (enforcement.accountStatus !== 'ACTIVE') {
      throw new HttpsError(
        'permission-denied',
        'Account is restricted from posting',
        { code: FeedErrorCode.ACCOUNT_SUSPENDED }
      );
    }

    const data = CreatePostSchema.parse(request.data);

    // Classify NSFW content
    const mediaUrls = data.media.map(m => m.url);
    const nsfwResult = await classifyNSFW(mediaUrls, data.caption);

    // Block if flagged as blocked
    if (nsfwResult.flag === 'blocked') {
      throw new HttpsError(
        'invalid-argument',
        'Content violates community guidelines',
        { code: FeedErrorCode.NSFW_BLOCKED }
      );
    }

    const postId = generateId();
    const now = serverTimestamp();

    const post: FeedPost = {
      postId,
      authorId: uid,
      type: data.type,
      media: data.media as any, // Type assertion - validated by schema
      caption: data.caption,
      tags: data.tags || [],
      location: data.location as any, // Type assertion - validated by schema
      visibility: data.visibility,
      nsfw: {
        flag: nsfwResult.flag,
        autoDetected: nsfwResult.autoDetected,
        manualOverride: 'none',
        scores: nsfwResult.scores,
      },
      stats: {
        likes: 0,
        comments: 0,
        views: 0,
        saves: 0,
      },
      createdAt: now as any,
      updatedAt: now as any,
      deleted: false,
    };

    await db.collection('feedPosts').doc(postId).set(post);

    logger.info(`Post created: ${postId} by ${uid}, NSFW: ${nsfwResult.flag}`);

    return {
      success: true,
      postId,
      nsfwFlag: nsfwResult.flag,
    };
  }
);

/**
 * Update an existing post
 */
export const updatePost = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { postId, ...updates } = request.data;
    if (!postId) {
      throw new HttpsError('invalid-argument', 'postId is required');
    }

    const data = UpdatePostSchema.parse(updates);

    const postRef = db.collection('feedPosts').doc(postId);
    const postDoc = await postRef.get();

    if (!postDoc.exists) {
      throw new HttpsError('not-found', 'Post not found');
    }

    const post = postDoc.data() as FeedPost;

    if (post.authorId !== uid) {
      throw new HttpsError('permission-denied', 'Not the post author');
    }

    const updateData: any = {
      updatedAt: serverTimestamp(),
    };

    if (data.caption !== undefined) updateData.caption = data.caption;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.visibility !== undefined) updateData.visibility = data.visibility;

    await postRef.update(updateData);

    logger.info(`Post updated: ${postId}`);

    return { success: true };
  }
);

/**
 * Delete a post (soft delete)
 */
export const deletePost = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { postId } = request.data;
    if (!postId) {
      throw new HttpsError('invalid-argument', 'postId is required');
    }

    const postRef = db.collection('feedPosts').doc(postId);
    const postDoc = await postRef.get();

    if (!postDoc.exists) {
      throw new HttpsError('not-found', 'Post not found');
    }

    const post = postDoc.data() as FeedPost;

    if (post.authorId !== uid) {
      throw new HttpsError('permission-denied', 'Not the post author');
    }

    await postRef.update({
      deleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: uid,
      updatedAt: serverTimestamp(),
    });

    logger.info(`Post deleted: ${postId}`);

    return { success: true };
  }
);

/**
 * Get personalized feed
 */
export const getFeed = onCall(
  {
    region: 'europe-west3',
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const params = GetFeedSchema.parse(request.data);

    // Get user context
    const [following, nsfwFilter, userDoc] = await Promise.all([
      getUserFollowing(uid),
      getUserNSFWFilter(uid),
      db.collection('users').doc(uid).get(),
    ]);

    const userData = userDoc.data();
    const context: FeedContext = {
      userId: uid,
      verified18Plus: userData?.verified18Plus || false,
      safetyScore: userData?.safetyScore || 0.8,
      profileScore: userData?.profileScore || 50,
      following,
      recentInteractions: [], // TODO: Get from recent activity
    };

    // Build query
    let query = db
      .collection('feedPosts')
      .where('deleted', '==', false);

    // Filter by author if specified
    if (params.authorId) {
      query = query.where('authorId', '==', params.authorId);
    }

    // Filter by following if specified
    if (params.onlyFollowing && following.length > 0) {
      query = query.where('authorId', 'in', following.slice(0, 10));
    }

    // Filter by NSFW
    if (params.excludeNSFW || !context.verified18Plus) {
      query = query.where('nsfw.flag', '==', 'safe');
    } else {
      query = query.where('nsfw.flag', 'in', nsfwFilter);
    }

    // Add visibility filter (public posts for now)
    query = query.where('visibility', '==', 'public');

    // Order and limit
    query = query
      .orderBy('createdAt', 'desc')
      .limit(params.limit);

    // Pagination cursor
    if (params.cursor) {
      const cursorDoc = await db.collection('feedPosts').doc(params.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const posts = snapshot.docs.map(doc => doc.data() as FeedPost);

    // Calculate ranking scores (PACK 325: includes boost check)
    const rankedPosts = await Promise.all(
      posts.map(async (post) => {
        const ranking = await calculateRankingScore(post, context);
        return {
          post,
          score: ranking.score,
          boosted: ranking.boosted,
          boostId: ranking.boostId,
        };
      })
    );

    // Sort by ranking score (boosted posts get higher scores)
    rankedPosts.sort((a, b) => b.score - a.score);

    // Get top posts and mark if boosted
    const topPosts = rankedPosts.slice(0, params.limit).map(r => ({
      ...r.post,
      isBoosted: r.boosted,
      boostId: r.boostId,
    }));

    // Enrich with author data
    const enrichedPosts = await enrichPostsWithAuthors(topPosts as any, uid);

    const response: FeedResponse = {
      posts: enrichedPosts,
      nextCursor: snapshot.docs.length === params.limit 
        ? snapshot.docs[snapshot.docs.length - 1].id 
        : undefined,
      hasMore: snapshot.docs.length === params.limit,
    };

    return response;
  }
);

/**
 * Get a single post by ID
 */
export const getPost = onCall(
  {
    region: 'europe-west3',
  },
  async (request) => {
    const uid = request.auth?.uid;
    const { postId } = request.data;

    if (!postId) {
      throw new HttpsError('invalid-argument', 'postId is required');
    }

    const postDoc = await db.collection('feedPosts').doc(postId).get();

    if (!postDoc.exists) {
      throw new HttpsError('not-found', 'Post not found');
    }

    const post = postDoc.data() as FeedPost;

    // Check if user can view this post
    if (post.deleted && post.authorId !== uid) {
      throw new HttpsError('not-found', 'Post not found');
    }

    const enrichedPosts = await enrichPostsWithAuthors([post], uid);

    return enrichedPosts[0];
  }
);

// ============================================================================
// BACKGROUND TRIGGERS
// ============================================================================

/**
 * Update post stats when a like is created
 */
export const onLikeCreated = onDocumentCreated(
  'feedLikes/{likeId}',
  async (event) => {
    const like = event.data?.data();
    if (!like) return;

    const postRef = db.collection('feedPosts').doc(like.postId);
    await postRef.update({
      'stats.likes': FieldValue.increment(1),
    });

    logger.info(`Post ${like.postId} likes incremented`);
  }
);

/**
 * Update post stats when a like is deleted
 */
export const onLikeDeleted = onDocumentCreated(
  'feedLikes/{likeId}',
  async (event) => {
    const like = event.data?.data();
    if (!like) return;

    const postRef = db.collection('feedPosts').doc(like.postId);
    await postRef.update({
      'stats.likes': FieldValue.increment(-1),
    });

    logger.info(`Post ${like.postId} likes decremented`);
  }
);