/**
 * ========================================================================
 * PACK 323 - FEED CORE ENGINE
 * ========================================================================
 * Posts, Reels, Stories with Likes, Views, Comments
 * Ranking & Safety Filtering
 * 
 * CRITICAL BUSINESS RULES:
 * - ZERO wallet operations
 * - ZERO tokenomics changes
 * - NO spendTokens or refundTokens calls
 * - NO tipping or paid boosts
 * - NO 65/35, 80/20, 90/10 splits
 * - NO payout modifications
 * 
 * Pure social content layer only
 * 
 * @version 1.0.0
 * @pack PACK_323
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { canAppearInDiscovery } from './moderationEngine';
import { createOrUpdateCaseFromReport } from './moderationEngine';

const db = getFirestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type ContentVisibility = "PUBLIC" | "FOLLOWERS" | "MATCHES";
export type ContentType = "FEED_POST" | "FEED_REEL" | "FEED_STORY";

export interface FeedPost {
  id: string;
  ownerUserId: string;
  mediaUrls: string[];
  caption: string;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
  visibility: ContentVisibility;
  allowComments: boolean;
  isDeleted: boolean;
  location?: {
    lat: number;
    lng: number;
    city?: string;
    country?: string;
  };
  safetyFlags?: {
    nsfw: boolean;
    violence: boolean;
    spam: boolean;
  };
}

export interface FeedReel {
  id: string;
  ownerUserId: string;
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  durationSec: number;
  aspectRatio: string;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
  visibility: ContentVisibility;
  allowComments: boolean;
  isDeleted: boolean;
  location?: {
    lat: number;
    lng: number;
    city?: string;
    country?: string;
  };
  safetyFlags?: {
    nsfw: boolean;
    violence: boolean;
    spam: boolean;
  };
}

export interface FeedStory {
  id: string;
  ownerUserId: string;
  mediaUrl: string;
  caption?: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  isDeleted: boolean;
}

export interface FeedLike {
  id: string;
  userId: string;
  contentId: string;
  contentType: ContentType;
  createdAt: Timestamp;
}

export interface FeedView {
  id: string;
  userId: string;
  contentId: string;
  contentType: ContentType;
  createdAt: Timestamp;
  durationSec?: number;
}

export interface FeedComment {
  id: string;
  userId: string;
  contentId: string;
  contentType: ContentType;
  text: string;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
  isDeleted: boolean;
  parentCommentId?: string;
}

// ============================================================================
// CLOUD FUNCTIONS - POST OPERATIONS
// ============================================================================

/**
 * Create a feed post
 */
export const pack323_createFeedPost = onCall(
  { region: "europe-west3", maxInstances: 100 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      mediaUrls = [],
      caption = "",
      visibility = "PUBLIC",
      allowComments = true,
      location,
    } = request.data;

    // Validation
    if (mediaUrls.length === 0 && !caption) {
      throw new HttpsError("invalid-argument", "Post must have either media or caption");
    }

    if (mediaUrls.length > 10) {
      throw new HttpsError("invalid-argument", "Maximum 10 media files per post");
    }

    if (caption.length > 5000) {
      throw new HttpsError("invalid-argument", "Caption too long (max 5000 characters)");
    }

    // Safety check: Run NSFW detection
    const safetyFlags = await runSafetyCheck(mediaUrls, caption);

    // If high risk, block or shadowban
    if (safetyFlags.nsfw || safetyFlags.violence) {
      logger.warn(`High risk content detected by ${uid}`, { safetyFlags });
      
      // Create moderation case
      await createModerationCase(uid, "FEED_POST", "automated_detection", safetyFlags);
      
      throw new HttpsError(
        "failed-precondition",
        "Content violates community guidelines"
      );
    }

    // Create post
    const postRef = db.collection("feedPosts").doc();
    const now = FieldValue.serverTimestamp();

    const post: Omit<FeedPost, 'id' | 'createdAt' | 'updatedAt'> & {
      createdAt: any;
      updatedAt: any;
    } = {
      ownerUserId: uid,
      mediaUrls,
      caption,
      createdAt: now,
      updatedAt: null,
      visibility,
      allowComments,
      isDeleted: false,
      location,
      safetyFlags,
    };

    await postRef.set(post);

    // Initialize aggregate counters
    await db.collection("feedAggregates").doc(postRef.id).set({
      contentId: postRef.id,
      contentType: "FEED_POST",
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      createdAt: now,
    });

    logger.info(`Feed post created: ${postRef.id} by ${uid}`);

    return {
      success: true,
      postId: postRef.id,
      post: {
        ...post,
        id: postRef.id,
        createdAt: Timestamp.now(),
      },
    };
  }
);

/**
 * Create a feed reel (short video)
 */
export const pack323_createFeedReel = onCall(
  { region: "europe-west3", maxInstances: 100 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      videoUrl,
      thumbnailUrl,
      caption = "",
      durationSec,
      aspectRatio = "9:16",
      visibility = "PUBLIC",
      allowComments = true,
      location,
    } = request.data;

    // Validation
    if (!videoUrl) {
      throw new HttpsError("invalid-argument", "Video URL is required");
    }

    if (!durationSec || durationSec <= 0 || durationSec > 180) {
      throw new HttpsError("invalid-argument", "Duration must be between 1-180 seconds");
    }

    // Safety check
    const safetyFlags = await runSafetyCheck([videoUrl, thumbnailUrl].filter(Boolean), caption);

    if (safetyFlags.nsfw || safetyFlags.violence) {
      logger.warn(`High risk reel detected by ${uid}`, { safetyFlags });
      await createModerationCase(uid, "FEED_REEL", "automated_detection", safetyFlags);
      throw new HttpsError("failed-precondition", "Content violates community guidelines");
    }

    // Create reel
    const reelRef = db.collection("feedReels").doc();
    const now = FieldValue.serverTimestamp();

    const reel: Omit<FeedReel, 'id' | 'createdAt' | 'updatedAt'> & {
      createdAt: any;
      updatedAt: any;
    } = {
      ownerUserId: uid,
      videoUrl,
      thumbnailUrl,
      caption,
      durationSec,
      aspectRatio,
      createdAt: now,
      updatedAt: null,
      visibility,
      allowComments,
      isDeleted: false,
      location,
      safetyFlags,
    };

    await reelRef.set(reel);

    // Initialize aggregate counters
    await db.collection("feedAggregates").doc(reelRef.id).set({
      contentId: reelRef.id,
      contentType: "FEED_REEL",
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      createdAt: now,
    });

    logger.info(`Feed reel created: ${reelRef.id} by ${uid}`);

    return {
      success: true,
      reelId: reelRef.id,
      reel: {
        ...reel,
        id: reelRef.id,
        createdAt: Timestamp.now(),
      },
    };
  }
);

/**
 * Create a feed story (24h expiration)
 */
export const pack323_createFeedStory = onCall(
  { region: "europe-west3", maxInstances: 100 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      mediaUrl,
      caption = "",
    } = request.data;

    // Validation
    if (!mediaUrl) {
      throw new HttpsError("invalid-argument", "Media URL is required");
    }

    // Safety check
    const safetyFlags = await runSafetyCheck([mediaUrl], caption);

    if (safetyFlags.nsfw || safetyFlags.violence) {
      logger.warn(`High risk story detected by ${uid}`, { safetyFlags });
      await createModerationCase(uid, "FEED_STORY", "automated_detection", safetyFlags);
      throw new HttpsError("failed-precondition", "Content violates community guidelines");
    }

    // Create story with 24h expiration
    const storyRef = db.collection("feedStories").doc();
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000);

    const story: Omit<FeedStory, 'id'> & { createdAt: Timestamp } = {
      ownerUserId: uid,
      mediaUrl,
      caption,
      createdAt: now,
      expiresAt,
      isDeleted: false,
    };

    await storyRef.set(story);

    // Initialize aggregate counters
    await db.collection("feedAggregates").doc(storyRef.id).set({
      contentId: storyRef.id,
      contentType: "FEED_STORY",
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    logger.info(`Feed story created: ${storyRef.id} by ${uid}, expires at ${expiresAt.toDate()}`);

    return {
      success: true,
      storyId: storyRef.id,
      story: {
        ...story,
        id: storyRef.id,
      },
    };
  }
);

// ============================================================================
// CLOUD FUNCTIONS - INTERACTION OPERATIONS
// ============================================================================

/**
 * Like/unlike content
 */
export const pack323_likeContent = onCall(
  { region: "europe-west3", maxInstances: 200 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { contentId, contentType } = request.data;

    if (!contentId || !contentType) {
      throw new HttpsError("invalid-argument", "contentId and contentType are required");
    }

    // Validate content type
    const validTypes: ContentType[] = ["FEED_POST", "FEED_REEL", "FEED_STORY"];
    if (!validTypes.includes(contentType)) {
      throw new HttpsError("invalid-argument", "Invalid content type");
    }

    // Check if already liked
    const likeQuery = await db
      .collection("feedLikes")
      .where("userId", "==", uid)
      .where("contentId", "==", contentId)
      .limit(1)
      .get();

    if (!likeQuery.empty) {
      // Unlike - remove like and decrement counter
      const likeDoc = likeQuery.docs[0];
      await likeDoc.ref.delete();

      await db
        .collection("feedAggregates")
        .doc(contentId)
        .update({
          likes: FieldValue.increment(-1),
        });

      logger.info(`Unlike: ${uid} unliked ${contentType} ${contentId}`);

      return {
        success: true,
        action: "unliked",
        contentId,
      };
    } else {
      // Like - create like and increment counter
      const likeRef = db.collection("feedLikes").doc();
      const now = FieldValue.serverTimestamp();

      const like: Omit<FeedLike, 'id' | 'createdAt'> & { createdAt: any } = {
        userId: uid,
        contentId,
        contentType,
        createdAt: now,
      };

      await likeRef.set(like);

      await db
        .collection("feedAggregates")
        .doc(contentId)
        .update({
          likes: FieldValue.increment(1),
        });

      logger.info(`Like: ${uid} liked ${contentType} ${contentId}`);

      return {
        success: true,
        action: "liked",
        contentId,
        likeId: likeRef.id,
      };
    }
  }
);

/**
 * Add comment to content
 */
export const pack323_addComment = onCall(
  { region: "europe-west3", maxInstances: 100 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      contentId,
      contentType,
      text,
      parentCommentId,
    } = request.data;

    // Validation
    if (!contentId || !contentType || !text) {
      throw new HttpsError("invalid-argument", "contentId, contentType, and text are required");
    }

    if (text.length > 2000) {
      throw new HttpsError("invalid-argument", "Comment too long (max 2000 characters)");
    }

    // Check if content allows comments
    const contentCollection = getContentCollection(contentType);
    const contentDoc = await db.collection(contentCollection).doc(contentId).get();

    if (!contentDoc.exists) {
      throw new HttpsError("not-found", "Content not found");
    }

    const contentData = contentDoc.data();
    if (contentData?.allowComments === false) {
      throw new HttpsError("failed-precondition", "Comments are disabled for this content");
    }

    // Safety check for spam/harassment
    const isSafe = await checkCommentSafety(text, uid);
    if (!isSafe) {
      logger.warn(`Unsafe comment blocked from ${uid}`);
      await createModerationCase(uid, contentType, "spam_or_harassment", { text });
      throw new HttpsError("failed-precondition", "Comment violates community guidelines");
    }

    // Create comment
    const commentRef = db.collection("feedComments").doc();
    const now = FieldValue.serverTimestamp();

    const comment: Omit<FeedComment, 'id' | 'createdAt' | 'updatedAt'> & {
      createdAt: any;
      updatedAt: any;
    } = {
      userId: uid,
      contentId,
      contentType,
      text,
      createdAt: now,
      updatedAt: null,
      isDeleted: false,
      parentCommentId,
    };

    await commentRef.set(comment);

    // Increment comment counter
    await db
      .collection("feedAggregates")
      .doc(contentId)
      .update({
        comments: FieldValue.increment(1),
      });

    logger.info(`Comment added: ${commentRef.id} on ${contentType} ${contentId} by ${uid}`);

    return {
      success: true,
      commentId: commentRef.id,
      comment: {
        ...comment,
        id: commentRef.id,
        createdAt: Timestamp.now(),
      },
    };
  }
);

/**
 * Report content
 */
export const pack323_reportContent = onCall(
  { region: "europe-west3", maxInstances: 50 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      contentId,
      contentType,
      reason,
      details = "",
    } = request.data;

    // Validation
    if (!contentId || !contentType || !reason) {
      throw new HttpsError("invalid-argument", "contentId, contentType, and reason are required");
    }

    const validReasons = [
      "spam",
      "harassment",
      "nudity",
      "violence",
      "hate_speech",
      "false_information",
      "scam",
      "other",
    ];

    if (!validReasons.includes(reason)) {
      throw new HttpsError("invalid-argument", "Invalid report reason");
    }

    // Create report
    const reportRef = db.collection("moderationQueue").doc();
    const now = FieldValue.serverTimestamp();

    const report = {
      reportId: reportRef.id,
      reporterId: uid,
      targetContentId: contentId,
      targetContentType: contentType,
      reason,
      details,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    };

    await reportRef.set(report);

    // Get content owner for moderation case
    const contentCollection = getContentCollection(contentType);
    const contentDoc = await db.collection(contentCollection).doc(contentId).get();
    
    if (contentDoc.exists) {
      const contentOwner = contentDoc.data()?.ownerUserId;
      if (contentOwner) {
        // Create or update moderation case
        await createOrUpdateCaseFromReport(reportRef.id, contentOwner, reason);
      }
    }

    logger.info(`Content reported: ${contentId} (${contentType}) by ${uid} for ${reason}`);

    return {
      success: true,
      reportId: reportRef.id,
      message: "Report submitted successfully",
    };
  }
);

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Story Expiration Job
 * Runs hourly to mark expired stories as deleted
 */
export const pack323_storyExpiryJob = onSchedule(
  { 
    schedule: "0 * * * *", // Every hour
    region: "europe-west3",
    timeZone: "UTC",
  },
  async () => {
    logger.info("Starting story expiration job...");

    const now = Timestamp.now();
    
    // Find expired stories that aren't deleted yet
    const expiredStoriesQuery = await db
      .collection("feedStories")
      .where("isDeleted", "==", false)
      .where("expiresAt", "<", now)
      .limit(500)
      .get();

    if (expiredStoriesQuery.empty) {
      logger.info("No expired stories found");
      return;
    }

    // Batch delete expired stories
    const batchSize = 500;
    const batches: FirebaseFirestore.WriteBatch[] = [];
    let currentBatch = db.batch();
    let operationCount = 0;

    for (const doc of expiredStoriesQuery.docs) {
      currentBatch.update(doc.ref, {
        isDeleted: true,
        deletedAt: FieldValue.serverTimestamp(),
      });

      operationCount++;

      if (operationCount === batchSize) {
        batches.push(currentBatch);
        currentBatch = db.batch();
        operationCount = 0;
      }
    }

    if (operationCount > 0) {
      batches.push(currentBatch);
    }

    // Commit all batches
    for (const batch of batches) {
      await batch.commit();
    }

    logger.info(`Story expiration completed: ${expiredStoriesQuery.size} stories marked as deleted`);
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Run safety check on content (NSFW, violence, spam detection)
 */
async function runSafetyCheck(
  mediaUrls: string[],
  text: string
): Promise<{ nsfw: boolean; violence: boolean; spam: boolean }> {
  // TODO: Integrate with AI moderation service (PACK 320)
  // For now, basic keyword detection

  const safetyFlags = {
    nsfw: false,
    violence: false,
    spam: false,
  };

  // Check text for explicit keywords
  const explicitKeywords = ['nsfw', 'xxx', 'porn'];
  const violenceKeywords = ['kill', 'attack', 'harm'];
  const spamKeywords = ['click here', 'buy now', 'limited offer'];

  const lowerText = text.toLowerCase();

  for (const keyword of explicitKeywords) {
    if (lowerText.includes(keyword)) {
      safetyFlags.nsfw = true;
      break;
    }
  }

  for (const keyword of violenceKeywords) {
    if (lowerText.includes(keyword)) {
      safetyFlags.violence = true;
      break;
    }
  }

  for (const keyword of spamKeywords) {
    if (lowerText.includes(keyword)) {
      safetyFlags.spam = true;
      break;
    }
  }

  // TODO: Check media URLs with AI vision API

  return safetyFlags;
}

/**
 * Check comment safety (spam/harassment detection)
 */
async function checkCommentSafety(text: string, userId: string): Promise<boolean> {
  // TODO: Integrate with AI moderation
  // Basic checks for now

  // Check for excessive caps
  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (capsRatio > 0.5 && text.length > 20) {
    return false; // Likely spam/yelling
  }

  // Check for repeated characters
  if (/(.)\1{10,}/.test(text)) {
    return false; // Spam pattern
  }

  // Check for URLs in comments (potential spam)
  if (/(https?:\/\/|www\.)/i.test(text)) {
    return false; // No links in comments
  }

  return true;
}

/**
 * Create moderation case for automated detection
 */
async function createModerationCase(
  userId: string,
  contentType: ContentType,
  reason: string,
  flags: any
): Promise<void> {
  const reportRef = db.collection("moderationQueue").doc();
  
  await reportRef.set({
    reportId: reportRef.id,
    reporterId: "SYSTEM_AUTOMATED",
    targetUserId: userId,
    targetContentType: contentType,
    reason,
    details: JSON.stringify(flags),
    status: "PENDING",
    priority: "HIGH",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Create moderation case via existing engine
  await createOrUpdateCaseFromReport(reportRef.id, userId, reason);
}

/**
 * Get Firestore collection name for content type
 */
function getContentCollection(contentType: ContentType): string {
  switch (contentType) {
    case "FEED_POST":
      return "feedPosts";
    case "FEED_REEL":
      return "feedReels";
    case "FEED_STORY":
      return "feedStories";
    default:
      throw new Error(`Unknown content type: ${contentType}`);
  }
}

logger.info("✅ PACK 323 - Feed Core Engine loaded successfully");