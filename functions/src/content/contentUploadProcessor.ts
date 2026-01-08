import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Storage } from '@google-cloud/storage';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

const storage = new Storage();
const db = admin.firestore();

// Reuse NSFW classifier from PACK 287
import { classifyNSFW, NSFWFlag } from '../media/nsfwClassifier';

/**
 * Content Policy Rules (from PACK 267, 268):
 * - 18+ only (no minors)
 * - No explicit genitals close-up
 * - No sexual acts
 * - No hate/gore
 * - Soft erotic content allowed with proper flagging
 */

interface MediaUploadRequest {
  userId: string;
  contentType: 'POST' | 'STORY' | 'REEL';
  tempPath: string;
  mediaType: 'PHOTO' | 'VIDEO';
  caption?: string;
  tags?: string[];
  location?: {
    city?: string;
    country?: string;
  };
  visibility: 'PUBLIC' | 'FOLLOWERS' | 'MATCHES_ONLY';
  musicTrack?: string; // for reels
}

interface MediaProcessingResult {
  storagePath: string;
  url: string;
  thumbUrl: string;
  durationSeconds: number;
  sizeBytes: number;
  nsfwFlag: NSFWFlag;
  width?: number;
  height?: number;
}

/**
 * Process uploaded content media
 * Validates, generates thumbnails, runs NSFW check, enforces policies
 */
export const processContentUpload = functions
  .runWith({
    timeoutSeconds: 300,
    memory: '2GB'
  })
  .https.onCall(async (data: MediaUploadRequest, context) => {
    // Authentication check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    if (data.userId !== userId) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'User ID mismatch'
      );
    }

    try {
      // Verify user is 18+ and has valid profile
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();

      if (!userData) {
        throw new functions.https.HttpsError('not-found', 'User not found');
      }

      if (!userData.isAdult) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Content creation requires 18+ verification'
        );
      }

      if (userData.banned || userData.shadowBanned) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Account is restricted from posting content'
        );
      }

      // Check if user has active Risk Engine penalties
      const riskDoc = await db.collection('riskProfiles').doc(userId).get();
      const riskData = riskDoc.data();
      
      if (riskData && riskData.riskScore > 70) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Account flagged for high risk - content creation suspended'
        );
      }

      // Process media based on type
      const bucket = storage.bucket();
      const tempFile = bucket.file(data.tempPath);

      // Check file exists
      const [exists] = await tempFile.exists();
      if (!exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Temporary file not found'
        );
      }

      // Get file metadata
      const [metadata] = await tempFile.getMetadata();
      const sizeBytes = parseInt(metadata.size || '0');

      // Validate file size (max 100MB for photos, 500MB for videos)
      const maxSize = data.mediaType === 'PHOTO' ? 100 * 1024 * 1024 : 500 * 1024 * 1024;
      if (sizeBytes > maxSize) {
        await tempFile.delete();
        throw new functions.https.HttpsError(
          'invalid-argument',
          `File too large. Max size: ${maxSize / (1024 * 1024)}MB`
        );
      }

      let processingResult: MediaProcessingResult;

      if (data.mediaType === 'PHOTO') {
        processingResult = await processPhotoUpload(
          tempFile,
          data.contentType,
          userId,
          sizeBytes
        );
      } else {
        processingResult = await processVideoUpload(
          tempFile,
          data.contentType,
          userId,
          sizeBytes
        );
      }

      // Check NSFW policy
      if (processingResult.nsfwFlag === 'blocked') {
        // Delete processed files
        await bucket.file(processingResult.storagePath).delete();
        await bucket.file(processingResult.thumbUrl.split('/').pop()!).delete();

        throw new functions.https.HttpsError(
          'failed-precondition',
          'Content violates Avalo community guidelines (explicit content detected)'
        );
      }

      // Create content document based on type
      let contentId: string;
      const now = admin.firestore.Timestamp.now();

      switch (data.contentType) {
        case 'POST':
          contentId = uuidv4();
          await db.collection('feedPosts').doc(contentId).set({
            postId: contentId,
            authorId: userId,
            type: data.mediaType,
            media: [{
              storagePath: processingResult.storagePath,
              url: processingResult.url,
              thumbUrl: processingResult.thumbUrl,
              durationSeconds: processingResult.durationSeconds,
              sizeBytes: processingResult.sizeBytes,
              nsfwFlag: processingResult.nsfwFlag,
              width: processingResult.width,
              height: processingResult.height
            }],
            caption: data.caption || '',
            tags: data.tags || [],
            location: data.location || { city: null, country: null },
            visibility: data.visibility,
            stats: {
              views: 0,
              likes: 0,
              comments: 0,
              shares: 0,
              clicksToProfile: 0,
              clicksToChat: 0
            },
            createdAt: now,
            updatedAt: now,
            deleted: false
          });
          break;

        case 'STORY':
          contentId = uuidv4();
          const expiresAt = admin.firestore.Timestamp.fromMillis(
            Date.now() + 24 * 60 * 60 * 1000 // 24 hours
          );
          
          await db.collection('stories').doc(contentId).set({
            storyId: contentId,
            authorId: userId,
            media: {
              storagePath: processingResult.storagePath,
              url: processingResult.url,
              thumbUrl: processingResult.thumbUrl,
              durationSeconds: processingResult.durationSeconds,
              nsfwFlag: processingResult.nsfwFlag
            },
            caption: data.caption || '',
            linkToProfile: true,
            visibility: data.visibility,
            createdAt: now,
            expiresAt: expiresAt,
            deleted: false,
            stats: {
              views: 0,
              replies: 0,
              clicksToChat: 0
            }
          });
          break;

        case 'REEL':
          contentId = uuidv4();
          await db.collection('reels').doc(contentId).set({
            reelId: contentId,
            authorId: userId,
            media: {
              storagePath: processingResult.storagePath,
              url: processingResult.url,
              thumbUrl: processingResult.thumbUrl,
              durationSeconds: processingResult.durationSeconds,
              nsfwFlag: processingResult.nsfwFlag
            },
            caption: data.caption || '',
            tags: data.tags || [],
            musicTrack: data.musicTrack || null,
            visibility: data.visibility,
            stats: {
              views: 0,
              likes: 0,
              comments: 0,
              shares: 0,
              clicksToProfile: 0,
              clicksToChat: 0
            },
            createdAt: now,
            updatedAt: now,
            deleted: false
          });
          break;
      }

      // Update creator stats
      await updateCreatorStats(userId, data.contentType);

      // Delete temp file
      await tempFile.delete();

      return {
        success: true,
        contentId,
        contentType: data.contentType,
        ...processingResult
      };

    } catch (error) {
      console.error('Content upload processing error:', error);
      throw error;
    }
  });

/**
 * Process photo upload - generate thumbnails and classify NSFW
 */
async function processPhotoUpload(
  sourceFile: any,
  contentType: string,
  userId: string,
  sizeBytes: number
): Promise<MediaProcessingResult> {
  const bucket = storage.bucket();
  const contentId = uuidv4();
  
  // Determine storage path based on content type
  const basePath = contentType === 'POST' ? 'feed' : 
                   contentType === 'STORY' ? 'stories' : 'reels';
  const storagePath = `${basePath}/${userId}/${contentId}`;

  // Download temp file to memory
  const [fileBuffer] = await sourceFile.download();

  // Get image metadata
  const imageMetadata = await sharp(fileBuffer).metadata();
  const width = imageMetadata.width || 0;
  const height = imageMetadata.height || 0;

  // Generate thumbnail (400x400 for feed)
  const thumbnailBuffer = await sharp(fileBuffer)
    .resize(400, 400, {
      fit: 'cover',
      position: 'center'
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  // Upload original
  const originalFile = bucket.file(`${storagePath}.jpg`);
  await originalFile.save(fileBuffer, {
    contentType: 'image/jpeg',
    metadata: {
      contentType: 'image/jpeg'
    }
  });
  await originalFile.makePublic();

  // Upload thumbnail
  const thumbFile = bucket.file(`${storagePath}_thumb.jpg`);
  await thumbFile.save(thumbnailBuffer, {
    contentType: 'image/jpeg',
    metadata: {
      contentType: 'image/jpeg'
    }
  });
  await thumbFile.makePublic();

  // Classify NSFW
  const nsfwFlag = await classifyNSFW(fileBuffer, 'image');

  return {
    storagePath: `${storagePath}.jpg`,
    url: originalFile.publicUrl(),
    thumbUrl: thumbFile.publicUrl(),
    durationSeconds: 0,
    sizeBytes,
    nsfwFlag,
    width,
    height
  };
}

/**
 * Process video upload - generate thumbnail and classify NSFW
 */
async function processVideoUpload(
  sourceFile: any,
  contentType: string,
  userId: string,
  sizeBytes: number
): Promise<MediaProcessingResult> {
  const bucket = storage.bucket();
  const contentId = uuidv4();
  
  const basePath = contentType === 'POST' ? 'feed' : 
                   contentType === 'STORY' ? 'stories' : 'reels';
  const storagePath = `${basePath}/${userId}/${contentId}.mp4`;

  // Move temp file to final location
  await sourceFile.move(storagePath);
  const finalFile = bucket.file(storagePath);
  await finalFile.makePublic();

  // For video, we'd use FFmpeg for thumbnail extraction and duration
  // Simplified here - in production, use Cloud Run or video processing service
  const durationSeconds = 15; // Placeholder - extract from video metadata
  
  // Generate video thumbnail (extract frame at 1 second)
  // This would use FFmpeg in production
  const thumbPath = `${storagePath.replace('.mp4', '_thumb.jpg')}`;
  const thumbFile = bucket.file(thumbPath);
  
  // Placeholder thumbnail generation
  // In production: ffmpeg -i video.mp4 -ss 00:00:01 -vframes 1 thumb.jpg
  const placeholderThumb = Buffer.from('placeholder');
  await thumbFile.save(placeholderThumb);
  await thumbFile.makePublic();

  // Classify NSFW from thumbnail
  const nsfwFlag = await classifyNSFW(placeholderThumb, 'image');

  return {
    storagePath,
    url: finalFile.publicUrl(),
    thumbUrl: thumbFile.publicUrl(),
    durationSeconds,
    sizeBytes,
    nsfwFlag
  };
}

/**
 * Update creator daily stats
 */
async function updateCreatorStats(userId: string, contentType: string) {
  const today = new Date().toISOString().split('T')[0];
  const statsRef = db.collection('creatorDailyStats').doc(`${userId}_${today}`);

  const increment = admin.firestore.FieldValue.increment(1);

  await statsRef.set({
    userId,
    date: today,
    contentPostsCount: contentType === 'POST' ? increment : 0,
    contentStoriesCount: contentType === 'STORY' ? increment : 0,
    contentReelsCount: contentType === 'REEL' ? increment : 0,
    updatedAt: admin.firestore.Timestamp.now()
  }, { merge: true });
}

/**
 * Scheduled cleanup of expired stories
 */
export const cleanupExpiredStories = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    
    const expiredStories = await db.collection('stories')
      .where('expiresAt', '<=', now)
      .where('deleted', '==', false)
      .limit(500)
      .get();

    const batch = db.batch();
    const bucket = storage.bucket();

    for (const doc of expiredStories.docs) {
      const story = doc.data();
      
      // Soft delete story
      batch.update(doc.ref, { deleted: true });

      // Delete media files (optional - keep for analytics/appeal)
      // Uncomment to delete files:
      // try {
      //   await bucket.file(story.media.storagePath).delete();
      //   await bucket.file(story.media.storagePath.replace(/\.\w+$/, '_thumb.jpg')).delete();
      // } catch (error) {
      //   console.error('Error deleting story files:', error);
      // }
    }

    await batch.commit();
    
    console.log(`Cleaned up ${expiredStories.size} expired stories`);
    return null;
  });