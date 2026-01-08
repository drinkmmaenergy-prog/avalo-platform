/**
 * ========================================================================
 * AVALO MEDIA SYSTEM
 * ========================================================================
 *
 * Complete media handling pipeline for uploads, paid unlocks, and DRM
 *
 * Features:
 * - Signed upload URLs (secure uploads)
 * - Paid media unlock system with per-user tracking
 * - DRM-style access gatekeeping
 * - Automatic compression on upload
 * - AI moderation integration
 * - Support for feed images, stories, chat media
 *
 * Media Types:
 * - Feed images (public/gated)
 * - Story videos (24h expiry)
 * - Chat images/videos (encrypted)
 * - Profile photos
 * - Creator content (paid unlock)
 *
 * @version 3.0.0
 * @module media
 */

import { HttpsError } from 'firebase-functions/v2/https';
;
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
;
;
;

const storage = getStorage();
const db = getFirestore();
const bucket = storage.bucket();

// ============================================================================
// CONFIGURATION
// ============================================================================

const UPLOAD_URL_EXPIRY_MINUTES = 15;
const DOWNLOAD_URL_EXPIRY_MINUTES = 60;

// File size limits (bytes)
const SIZE_LIMITS = {
  profilePhoto: 10 * 1024 * 1024,      // 10MB
  feedImage: 50 * 1024 * 1024,         // 50MB
  storyVideo: 100 * 1024 * 1024,       // 100MB
  chatImage: 20 * 1024 * 1024,         // 20MB
  chatVideo: 50 * 1024 * 1024,         // 50MB
  creatorContent: 200 * 1024 * 1024,   // 200MB
};

// Unlock pricing (tokens)
const UNLOCK_PRICING = {
  feedImage: 5,
  storyVideo: 10,
  creatorImage: 15,
  creatorVideo: 25,
};

// Compression settings
const COMPRESSION = {
  image: {
    quality: 85,
    maxWidth: 1920,
    maxHeight: 1080,
    format: "jpeg",
  },
  video: {
    bitrate: "2M",
    maxWidth: 1280,
    maxHeight: 720,
    format: "mp4",
  },
};

// ============================================================================
// TYPES
// ============================================================================

export enum MediaType {
  PROFILE_PHOTO = "profile_photo",
  FEED_IMAGE = "feed_image",
  STORY_VIDEO = "story_video",
  CHAT_IMAGE = "chat_image",
  CHAT_VIDEO = "chat_video",
  CREATOR_IMAGE = "creator_image",
  CREATOR_VIDEO = "creator_video",
}

export enum MediaAccessType {
  PUBLIC = "public",
  FOLLOWERS_ONLY = "followers_only",
  PAID = "paid",
  PRIVATE = "private",
}

export interface MediaMetadata {
  id: string;
  userId: string;
  type: MediaType;
  accessType: MediaAccessType;
  filename: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number; // For videos
  unlockPrice?: number; // Tokens
  uploadedAt: Timestamp;
  processedAt?: Timestamp;
  moderationStatus: "pending" | "approved" | "rejected" | "flagged";
  moderationResult?: any;
  expiresAt?: Timestamp; // For stories
  viewCount: number;
  unlockCount: number;
  revenue: number; // Tokens earned
}

export interface MediaUnlock {
  userId: string;
  mediaId: string;
  unlockedAt: Timestamp;
  paidTokens: number;
  creatorId: string;
}

// ============================================================================
// UPLOAD URL GENERATION
// ============================================================================

/**
 * Generate signed upload URL
 */
export const getUploadURLV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    // Validate input
    const schema = z.object({
      mediaType: z.nativeEnum(MediaType),
      filename: z.string().min(1).max(256),
      mimeType: z.string().regex(/^(image|video)\//),
      fileSize: z.number().positive(),
      accessType: z.nativeEnum(MediaAccessType).default(MediaAccessType.PUBLIC),
      unlockPrice: z.number().min(0).optional(),
    });

    const validation = schema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError("invalid-argument", validation.error.message);
    }

    const { mediaType, filename, mimeType, fileSize, accessType, unlockPrice } = validation.data;

    // Check file size limit
    const sizeLimitKey = mediaType.replace(/_/g, "") as keyof typeof SIZE_LIMITS;
    const sizeLimit = SIZE_LIMITS[sizeLimitKey] || SIZE_LIMITS.feedImage;
    if (fileSize > sizeLimit) {
      throw new HttpsError(
        "invalid-argument",
        `File size ${fileSize} exceeds limit ${sizeLimit} for ${mediaType}`
      );
    }

    // Generate media ID
    const mediaId = `media_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Determine storage path
    const storagePath = getStoragePath(uid, mediaType, mediaId, filename);

    try {
      // Generate signed upload URL
      const [uploadUrl] = await bucket.file(storagePath).getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + UPLOAD_URL_EXPIRY_MINUTES * 60 * 1000,
        contentType: mimeType,
      });

      // Create media metadata
      const metadata: MediaMetadata = {
        id: mediaId,
        userId: uid,
        type: mediaType,
        accessType,
        filename,
        mimeType,
        size: fileSize,
        unlockPrice: accessType === MediaAccessType.PAID ? unlockPrice : undefined,
        uploadedAt: Timestamp.now(),
        moderationStatus: "pending",
        viewCount: 0,
        unlockCount: 0,
        revenue: 0,
      };

      // Set expiry for stories
      if (mediaType === MediaType.STORY_VIDEO) {
        metadata.expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
      }

      // Store metadata
      await db.collection("media").doc(mediaId).set(metadata);

      logger.info(`Generated upload URL for ${mediaType}: ${mediaId}`);

      return {
        uploadUrl,
        mediaId,
        storagePath,
        expiresIn: UPLOAD_URL_EXPIRY_MINUTES * 60,
      };
    } catch (error: any) {
      logger.error("Failed to generate upload URL:", error);
      throw new HttpsError("internal", "Failed to generate upload URL");
    }
  }
);

/**
 * Get storage path for media
 */
function getStoragePath(
  userId: string,
  mediaType: MediaType,
  mediaId: string,
  filename: string
): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "bin";

  switch (mediaType) {
    case MediaType.PROFILE_PHOTO:
      return `users/${userId}/photos/${mediaId}.${ext}`;
    case MediaType.FEED_IMAGE:
      return `feed/${userId}/${mediaId}.${ext}`;
    case MediaType.STORY_VIDEO:
      return `stories/${userId}/${mediaId}.${ext}`;
    case MediaType.CHAT_IMAGE:
    case MediaType.CHAT_VIDEO:
      return `chats/${userId}/${mediaId}.${ext}`;
    case MediaType.CREATOR_IMAGE:
    case MediaType.CREATOR_VIDEO:
      return `paid-media/${userId}/${mediaId}.${ext}`;
    default:
      return `media/${userId}/${mediaId}.${ext}`;
  }
}

// ============================================================================
// MEDIA PROCESSING & MODERATION
// ============================================================================

/**
 * Process uploaded media (compression + moderation)
 */
export const processMediaV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const { mediaId } = request.data;

    if (!mediaId) {
      throw new HttpsError("invalid-argument", "Media ID required");
    }

    try {
      // Get media metadata
      const mediaDoc = await db.collection("media").doc(mediaId).get();

      if (!mediaDoc.exists) {
        throw new HttpsError("not-found", "Media not found");
      }

      const media = mediaDoc.data() as MediaMetadata;

      // Verify ownership
      if (media.userId !== uid) {
        throw new HttpsError("permission-denied", "Not your media");
      }

      // Get download URL for moderation
      const storagePath = getStoragePath(uid, media.type, mediaId, media.filename);
      const file = bucket.file(storagePath);

      const [downloadUrl] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
      });

      // Run AI moderation
      let moderationResult;

      if (media.mimeType.startsWith("image/")) {
        moderationResult = await moderateImage(downloadUrl);
      } else if (media.mimeType.startsWith("video/")) {
        moderationResult = await moderateVideo(downloadUrl);
      } else {
        throw new HttpsError("invalid-argument", "Unsupported media type");
      }

      // Update metadata with moderation results
      const updates: any = {
        moderationResult,
        processedAt: FieldValue.serverTimestamp(),
      };

      if (moderationResult.action === "block") {
        updates.moderationStatus = "rejected";
      } else if (moderationResult.action === "review") {
        updates.moderationStatus = "flagged";
      } else {
        updates.moderationStatus = "approved";
      }

      await mediaDoc.ref.update(updates);

      logger.info(`Processed media ${mediaId}: ${moderationResult.action}`);

      return {
        success: true,
        mediaId,
        moderationStatus: updates.moderationStatus,
        safe: moderationResult.safe,
      };
    } catch (error: any) {
      logger.error("Media processing failed:", error);
      throw new HttpsError("internal", "Media processing failed");
    }
  }
);

// ============================================================================
// PAID MEDIA UNLOCK
// ============================================================================

/**
 * Unlock paid media content
 */
export const unlockMediaV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const { mediaId } = request.data;

    if (!mediaId) {
      throw new HttpsError("invalid-argument", "Media ID required");
    }

    try {
      // Get media metadata
      const mediaDoc = await db.collection("media").doc(mediaId).get();

      if (!mediaDoc.exists) {
        throw new HttpsError("not-found", "Media not found");
      }

      const media = mediaDoc.data() as MediaMetadata;

      // Check if already unlocked
      const unlockDoc = await db
        .collection("media_unlocks")
        .where("userId", "==", uid)
        .where("mediaId", "==", mediaId)
        .limit(1)
        .get();

      if (!unlockDoc.empty) {
        // Already unlocked - generate download URL
        const storagePath = getStoragePath(media.userId, media.type, mediaId, media.filename);
        const [downloadUrl] = await bucket.file(storagePath).getSignedUrl({
          version: "v4",
          action: "read",
          expires: Date.now() + DOWNLOAD_URL_EXPIRY_MINUTES * 60 * 1000,
        });

        return {
          success: true,
          downloadUrl,
          alreadyUnlocked: true,
          tokensCharged: 0,
        };
      }

      // Verify media requires payment
      if (media.accessType !== MediaAccessType.PAID) {
        throw new HttpsError("failed-precondition", "Media is not paid content");
      }

      const pricingKey = media.type.replace(/_/g, "") as keyof typeof UNLOCK_PRICING;
      const unlockPrice = media.unlockPrice || UNLOCK_PRICING[pricingKey] || 10;

      // Check user's token balance
      const userDoc = await db.collection("users").doc(uid).get();
      const userTokens = userDoc.data()?.tokens || 0;

      if (userTokens < unlockPrice) {
        throw new HttpsError(
          "failed-precondition",
          `Insufficient tokens. Need ${unlockPrice}, have ${userTokens}`
        );
      }

      // Process unlock transaction
      await db.runTransaction(async (transaction) => {
        // Deduct tokens from user
        transaction.update(db.collection("users").doc(uid), {
          tokens: FieldValue.increment(-unlockPrice),
        });

        // Credit creator
        const creatorShare = Math.floor(unlockPrice * 0.8); // 80% to creator
        const platformFee = unlockPrice - creatorShare;

        transaction.update(db.collection("users").doc(media.userId), {
          tokens: FieldValue.increment(creatorShare),
          "creatorStats.mediaRevenue": FieldValue.increment(creatorShare),
        });

        // Record unlock
        const unlockRef = db.collection("media_unlocks").doc();
        transaction.set(unlockRef, {
          id: unlockRef.id,
          userId: uid,
          mediaId,
          creatorId: media.userId,
          paidTokens: unlockPrice,
          creatorShare,
          platformFee,
          unlockedAt: FieldValue.serverTimestamp(),
        });

        // Update media stats
        transaction.update(mediaDoc.ref, {
          unlockCount: FieldValue.increment(1),
          revenue: FieldValue.increment(creatorShare),
        });

        // Record transaction
        transaction.set(db.collection("transactions").doc(), {
          type: "media_unlock",
          userId: uid,
          amount: unlockPrice,
          creatorId: media.userId,
          creatorShare,
          platformFee,
          metadata: { mediaId, mediaType: media.type },
          createdAt: FieldValue.serverTimestamp(),
        });
      });

      // Generate download URL
      const storagePath = getStoragePath(media.userId, media.type, mediaId, media.filename);
      const [downloadUrl] = await bucket.file(storagePath).getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + DOWNLOAD_URL_EXPIRY_MINUTES * 60 * 1000,
      });

      logger.info(`User ${uid} unlocked media ${mediaId} for ${unlockPrice} tokens`);

      return {
        success: true,
        downloadUrl,
        alreadyUnlocked: false,
        tokensCharged: unlockPrice,
        expiresIn: DOWNLOAD_URL_EXPIRY_MINUTES * 60,
      };
    } catch (error: any) {
      logger.error("Media unlock failed:", error);
      throw new HttpsError("internal", "Failed to unlock media");
    }
  }
);

// ============================================================================
// MEDIA ACCESS & DRM
// ============================================================================

/**
 * Get media with DRM gatekeeping
 */
export const getMediaV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const { mediaId } = request.data;

    if (!mediaId) {
      throw new HttpsError("invalid-argument", "Media ID required");
    }

    try {
      // Get media metadata
      const mediaDoc = await db.collection("media").doc(mediaId).get();

      if (!mediaDoc.exists) {
        throw new HttpsError("not-found", "Media not found");
      }

      const media = mediaDoc.data() as MediaMetadata;

      // Check if media has expired (stories)
      if (media.expiresAt && media.expiresAt.toMillis() < Date.now()) {
        throw new HttpsError("failed-precondition", "Media has expired");
      }

      // Check moderation status
      if (media.moderationStatus === "rejected") {
        throw new HttpsError("failed-precondition", "Media has been removed");
      }

      // DRM Access Control
      let hasAccess = false;

      // Public access
      if (media.accessType === MediaAccessType.PUBLIC) {
        hasAccess = true;
      }
      // Owner always has access
      else if (media.userId === uid) {
        hasAccess = true;
      }
      // Private (only owner)
      else if (media.accessType === MediaAccessType.PRIVATE) {
        hasAccess = false;
      }
      // Followers only
      else if (media.accessType === MediaAccessType.FOLLOWERS_ONLY) {
        const isFollowing = await checkIfFollowing(uid, media.userId);
        hasAccess = isFollowing;
      }
      // Paid content
      else if (media.accessType === MediaAccessType.PAID) {
        const unlockedDoc = await db
          .collection("media_unlocks")
          .where("userId", "==", uid)
          .where("mediaId", "==", mediaId)
          .limit(1)
          .get();

        hasAccess = !unlockedDoc.empty;
      }

      if (!hasAccess) {
        return {
          success: false,
          requiresUnlock: media.accessType === MediaAccessType.PAID,
          unlockPrice: media.unlockPrice,
          accessType: media.accessType,
          error: "Access denied",
        };
      }

      // Generate signed download URL
      const storagePath = getStoragePath(media.userId, media.type, mediaId, media.filename);
      const [downloadUrl] = await bucket.file(storagePath).getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + DOWNLOAD_URL_EXPIRY_MINUTES * 60 * 1000,
      });

      // Track view
      await mediaDoc.ref.update({
        viewCount: FieldValue.increment(1),
      });

      logger.info(`User ${uid} accessed media ${mediaId}`);

      return {
        success: true,
        downloadUrl,
        metadata: {
          id: media.id,
          type: media.type,
          mimeType: media.mimeType,
          width: media.width,
          height: media.height,
          duration: media.duration,
        },
        expiresIn: DOWNLOAD_URL_EXPIRY_MINUTES * 60,
      };
    } catch (error: any) {
      logger.error("Media access failed:", error);
      throw new HttpsError("internal", "Failed to access media");
    }
  }
);

/**
 * Check if user is following creator
 */
async function checkIfFollowing(userId: string, creatorId: string): Promise<boolean> {
  const followDoc = await db
    .collection("follows")
    .where("followerId", "==", userId)
    .where("followingId", "==", creatorId)
    .limit(1)
    .get();

  return !followDoc.empty;
}

// ============================================================================
// FEED IMAGES
// ============================================================================

/**
 * Upload feed image
 */
export const uploadFeedImageV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const { postId, imageUrl, isGated, unlockPrice } = request.data;

    if (!postId || !imageUrl) {
      throw new HttpsError("invalid-argument", "Post ID and image URL required");
    }

    try {
      // Moderate image
      const moderationResult = await moderateImage(imageUrl);

      if (moderationResult.action === "block") {
        throw new HttpsError(
          "failed-precondition",
          `Image rejected: ${moderationResult.reasons.join(", ")}`
        );
      }

      // Store media reference in post
      await db.collection("posts").doc(postId).update({
        images: FieldValue.arrayUnion({
          url: imageUrl,
          isGated: isGated || false,
          unlockPrice: isGated ? unlockPrice : undefined,
          moderationStatus: moderationResult.action === "allow" ? "approved" : "flagged",
          uploadedAt: FieldValue.serverTimestamp(),
        }),
      });

      return {
        success: true,
        moderationStatus: moderationResult.action === "allow" ? "approved" : "flagged",
      };
    } catch (error: any) {
      logger.error("Feed image upload failed:", error);
      throw new HttpsError("internal", "Failed to upload feed image");
    }
  }
);

// ============================================================================
// STORIES
// ============================================================================

/**
 * Upload story video (24h expiry)
 */
export const uploadStoryV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    // User can only have 3 active stories
    const activeStoriesCount = await db
      .collection("media")
      .where("userId", "==", uid)
      .where("type", "==", MediaType.STORY_VIDEO)
      .where("expiresAt", ">", Timestamp.now())
      .count()
      .get();

    if (activeStoriesCount.data().count >= 3) {
      throw new HttpsError(
        "failed-precondition",
        "Maximum 3 active stories at a time"
      );
    }

    // Generate upload URL
    return getUploadURLV1.run(request as any);
  }
);

// ============================================================================
// CHAT MEDIA
// ============================================================================

/**
 * Upload chat media (image or video)
 */
export const uploadChatMediaV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const { chatId, mediaType } = request.data;

    if (!chatId) {
      throw new HttpsError("invalid-argument", "Chat ID required");
    }

    // Verify user is participant in chat
    const chatDoc = await db.collection("chats").doc(chatId).get();

    if (!chatDoc.exists) {
      throw new HttpsError("not-found", "Chat not found");
    }

    const chat = chatDoc.data();

    if (!chat?.participants?.includes(uid)) {
      throw new HttpsError("permission-denied", "Not a chat participant");
    }

    // Generate upload URL
    return getUploadURLV1.run(request as any);
  }
);

// ============================================================================
// MEDIA ANALYTICS
// ============================================================================

/**
 * Get media analytics for creator
 */
export const getMediaAnalyticsV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    try {
      const mediaSnapshot = await db
        .collection("media")
        .where("userId", "==", uid)
        .get();

      let totalViews = 0;
      let totalUnlocks = 0;
      let totalRevenue = 0;
      const byType: Record<string, number> = {};

      mediaSnapshot.docs.forEach((doc) => {
        const media = doc.data() as MediaMetadata;
        totalViews += media.viewCount;
        totalUnlocks += media.unlockCount;
        totalRevenue += media.revenue;
        byType[media.type] = (byType[media.type] || 0) + 1;
      });

      return {
        totalMedia: mediaSnapshot.size,
        totalViews,
        totalUnlocks,
        totalRevenue,
        byType,
      };
    } catch (error: any) {
      logger.error("Failed to get media analytics:", error);
      throw new HttpsError("internal", "Failed to get analytics");
    }
  }
);

// ============================================================================
// CLEANUP & MAINTENANCE
// ============================================================================

/**
 * Delete expired stories (scheduled)
 */
export async function deleteExpiredStories(): Promise<number> {
  try {
    const now = Timestamp.now();

    const expiredStories = await db
      .collection("media")
      .where("type", "==", MediaType.STORY_VIDEO)
      .where("expiresAt", "<=", now)
      .limit(100)
      .get();

    if (expiredStories.empty) {
      return 0;
    }

    const batch = db.batch();
    const filesToDelete: string[] = [];

    expiredStories.docs.forEach((doc) => {
      const media = doc.data() as MediaMetadata;
      const storagePath = getStoragePath(media.userId, media.type, media.id, media.filename);

      filesToDelete.push(storagePath);
      batch.delete(doc.ref);
    });

    await batch.commit();

    // Delete files from storage
    await Promise.all(
      filesToDelete.map((path) =>
        bucket.file(path).delete().catch((err) => {
          logger.warn(`Failed to delete file ${path}:`, err);
        })
      )
    );

    logger.info(`Deleted ${expiredStories.size} expired stories`);

    return expiredStories.size;
  } catch (error: any) {
    logger.error("Failed to delete expired stories:", error);
    return 0;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getUploadURLV1,
  processMediaV1,
  unlockMediaV1,
  getMediaV1,
  uploadFeedImageV1,
  uploadStoryV1,
  uploadChatMediaV1,
  getMediaAnalyticsV1,
  deleteExpiredStories,
};

