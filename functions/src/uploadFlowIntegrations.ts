/**
 * PACK 72 — AI-Driven Auto-Moderation V2 + Sensitive Media Classification
 * Upload Flow Integration Examples
 * 
 * This file demonstrates how to integrate moderation into existing upload flows.
 * Import and use these patterns in your existing upload functions.
 */

import { moderateUploadedContent, getModerationStatusForUI } from './moderationIntegration';
import { ModeratedContentType } from '../../shared/types/contentModeration';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

/**
 * PATTERN 1: PPM Media Upload Integration
 * 
 * Usage in existing PPM upload handler:
 * 
 * export const uploadPPMMedia = functions.https.onCall(async (data, context) => {
 *   // ... existing upload logic ...
 *   
 *   // After upload to storage, before publishing:
 *   const moderationResult = await moderatePPMMedia({
 *     messageId: data.messageId,
 *     chatId: data.chatId,
 *     userId: context.auth.uid,
 *     mediaUrl: uploadedMediaUrl,
 *   });
 *   
 *   if (!moderationResult.allowed) {
 *     // Handle blocked content
 *     return {
 *       success: false,
 *       error: moderationResult.reason,
 *       status: moderationResult.requiresReview ? 'pending_review' : 'blocked',
 *     };
 *   }
 *   
 *   // Continue with normal publishing...
 * });
 */
export async function moderatePPMMedia(params: {
  messageId: string;
  chatId: string;
  userId: string;
  mediaUrl: string;
}): Promise<{
  allowed: boolean;
  reason: string;
  requiresReview: boolean;
}> {
  const contentId = `ppm_${params.chatId}_${params.messageId}`;
  
  const result = await moderateUploadedContent({
    contentId,
    userId: params.userId,
    mediaUrl: params.mediaUrl,
    contentType: 'PPM_MEDIA',
    associatedId: params.chatId,
    metadata: {
      messageId: params.messageId,
      chatId: params.chatId,
    },
  });

  return {
    allowed: result.allowed,
    reason: result.reason,
    requiresReview: result.requiresReview,
  };
}

/**
 * PATTERN 2: Feed Post Media Integration
 * 
 * Usage in existing feed post upload:
 * 
 * export const createPost = functions.https.onCall(async (data, context) => {
 *   // ... create post document ...
 *   
 *   // If post has media, moderate each one:
 *   if (data.mediaUrls && data.mediaUrls.length > 0) {
 *     const moderationResults = await moderatePostMedia({
 *       postId,
 *       userId: context.auth.uid,
 *       mediaUrls: data.mediaUrls,
 *     });
 *     
 *     // Check if any are blocked
 *     const hasBlocked = moderationResults.some(r => !r.allowed && !r.requiresReview);
 *     const allPendingReview = moderationResults.every(r => r.requiresReview);
 *     
 *     if (hasBlocked) {
 *       // Delete post
 *       await db.collection('posts').doc(postId).delete();
 *       return { success: false, error: 'Content violates our policies' };
 *     }
 *     
 *     if (allPendingReview) {
 *       // Mark post as pending
 *       await db.collection('posts').doc(postId).update({
 *         status: 'pending_review',
 *         moderationStatus: 'review_required',
 *       });
 *     }
 *   }
 *   
 *   // Continue...
 * });
 */
export async function moderatePostMedia(params: {
  postId: string;
  userId: string;
  mediaUrls: string[];
}): Promise<Array<{
  mediaUrl: string;
  allowed: boolean;
  reason: string;
  requiresReview: boolean;
}>> {
  const results = await Promise.all(
    params.mediaUrls.map(async (mediaUrl, index) => {
      const contentId = `post_${params.postId}_media_${index}`;
      
      const result = await moderateUploadedContent({
        contentId,
        userId: params.userId,
        mediaUrl,
        contentType: 'POST_MEDIA',
        associatedId: params.postId,
        metadata: {
          postId: params.postId,
          mediaIndex: index,
        },
      });

      return {
        mediaUrl,
        allowed: result.allowed,
        reason: result.reason,
        requiresReview: result.requiresReview,
      };
    })
  );

  return results;
}

/**
 * PATTERN 3: Profile Photo Upload Integration
 * 
 * Usage in profile photo update:
 * 
 * export const updateProfilePhoto = functions.https.onCall(async (data, context) => {
 *   // ... upload photo to storage ...
 *   
 *   const moderationResult = await moderateProfilePhoto({
 *     userId: context.auth.uid,
 *     photoUrl: uploadedPhotoUrl,
 *     photoIndex: data.photoIndex || 0,
 *   });
 *   
 *   if (!moderationResult.allowed) {
 *     // Don't add to profile
 *     return {
 *       success: false,
 *       error: moderationResult.reason,
 *       status: moderationResult.requiresReview ? 'pending_review' : 'blocked',
 *     };
 *   }
 *   
 *   // Add to profile photos
 *   await db.collection('users').doc(context.auth.uid).update({
 *     'profile.photos': FieldValue.arrayUnion(uploadedPhotoUrl),
 *   });
 * });
 */
export async function moderateProfilePhoto(params: {
  userId: string;
  photoUrl: string;
  photoIndex?: number;
}): Promise<{
  allowed: boolean;
  reason: string;
  requiresReview: boolean;
}> {
  const contentId = `profile_photo_${params.userId}_${params.photoIndex || 0}`;
  
  const result = await moderateUploadedContent({
    contentId,
    userId: params.userId,
    mediaUrl: params.photoUrl,
    contentType: 'PROFILE_PHOTO',
    metadata: {
      photoIndex: params.photoIndex,
    },
  });

  return {
    allowed: result.allowed,
    reason: result.reason,
    requiresReview: result.requiresReview,
  };
}

/**
 * PATTERN 4: Carousel Photos Integration (PACK 42)
 * 
 * Usage in carousel upload:
 * 
 * export const uploadCarouselPhotos = functions.https.onCall(async (data, context) => {
 *   // ... upload photos to storage ...
 *   
 *   const moderationResults = await moderateCarouselPhotos({
 *     userId: context.auth.uid,
 *     photoUrls: uploadedPhotoUrls,
 *     carouselId: data.carouselId,
 *   });
 *   
 *   // Filter out blocked photos
 *   const approvedPhotos = uploadedPhotoUrls.filter((url, index) => 
 *     moderationResults[index].allowed
 *   );
 *   
 *   const pendingReviewPhotos = uploadedPhotoUrls.filter((url, index) => 
 *     moderationResults[index].requiresReview
 *   );
 *   
 *   // Save approved and pending separately
 *   await db.collection('carousels').doc(data.carouselId).update({
 *     approvedPhotos: FieldValue.arrayUnion(...approvedPhotos),
 *     pendingPhotos: FieldValue.arrayUnion(...pendingReviewPhotos),
 *   });
 * });
 */
export async function moderateCarouselPhotos(params: {
  userId: string;
  photoUrls: string[];
  carouselId: string;
}): Promise<Array<{
  photoUrl: string;
  allowed: boolean;
  reason: string;
  requiresReview: boolean;
}>> {
  const results = await Promise.all(
    params.photoUrls.map(async (photoUrl, index) => {
      const contentId = `carousel_${params.carouselId}_photo_${index}`;
      
      const result = await moderateUploadedContent({
        contentId,
        userId: params.userId,
        mediaUrl: photoUrl,
        contentType: 'CAROUSEL_PHOTO',
        associatedId: params.carouselId,
        metadata: {
          carouselId: params.carouselId,
          photoIndex: index,
        },
      });

      return {
        photoUrl,
        allowed: result.allowed,
        reason: result.reason,
        requiresReview: result.requiresReview,
      };
    })
  );

  return results;
}

/**
 * PATTERN 5: AI Companion Avatar Integration
 * 
 * Usage in AI companion creation/update:
 * 
 * export const createAICompanion = functions.https.onCall(async (data, context) => {
 *   // ... upload avatar to storage ...
 *   
 *   if (data.avatarUrl) {
 *     const moderationResult = await moderateAICompanionAvatar({
 *       userId: context.auth.uid,
 *       avatarUrl: data.avatarUrl,
 *       companionId: companionId,
 *     });
 *     
 *     if (!moderationResult.allowed) {
 *       return {
 *         success: false,
 *         error: 'Avatar does not meet content guidelines',
 *         status: moderationResult.requiresReview ? 'pending_review' : 'blocked',
 *       };
 *     }
 *   }
 *   
 *   // Create companion...
 * });
 */
export async function moderateAICompanionAvatar(params: {
  userId: string;
  avatarUrl: string;
  companionId: string;
}): Promise<{
  allowed: boolean;
  reason: string;
  requiresReview: boolean;
}> {
  const contentId = `ai_companion_avatar_${params.companionId}`;
  
  const result = await moderateUploadedContent({
    contentId,
    userId: params.userId,
    mediaUrl: params.avatarUrl,
    contentType: 'AI_COMPANION_AVATAR',
    associatedId: params.companionId,
    metadata: {
      companionId: params.companionId,
    },
  });

  return {
    allowed: result.allowed,
    reason: result.reason,
    requiresReview: result.requiresReview,
  };
}

/**
 * PATTERN 6: Verification Photo Integration (Secondary Check)
 * Note: Human verification remains primary, this is a secondary safety check
 * 
 * Usage in KYC verification submission:
 * 
 * export const submitKYCVerification = functions.https.onCall(async (data, context) => {
 *   // ... existing KYC logic ...
 *   
 *   // Secondary moderation check on verification photos
 *   const moderationResult = await moderateVerificationPhotos({
 *     userId: context.auth.uid,
 *     verificationId: data.verificationId,
 *     photoUrls: {
 *       idFront: data.idFrontUrl,
 *       idBack: data.idBackUrl,
 *       selfie: data.selfieUrl,
 *     },
 *   });
 *   
 *   // If any photos are flagged, escalate for extra scrutiny
 *   if (moderationResult.hasFlags) {
 *     await db.collection('kyc_verifications').doc(data.verificationId).update({
 *       flaggedForReview: true,
 *       flagReason: moderationResult.flags.join(', '),
 *     });
 *   }
 *   
 *   // Continue with normal human verification process...
 * });
 */
export async function moderateVerificationPhotos(params: {
  userId: string;
  verificationId: string;
  photoUrls: {
    idFront: string;
    idBack?: string;
    selfie: string;
  };
}): Promise<{
  hasFlags: boolean;
  flags: string[];
}> {
  const flags: string[] = [];

  // Check ID front
  const idFrontResult = await moderateUploadedContent({
    contentId: `verification_${params.verificationId}_id_front`,
    userId: params.userId,
    mediaUrl: params.photoUrls.idFront,
    contentType: 'VERIFICATION_PHOTO',
    associatedId: params.verificationId,
    metadata: {
      verificationId: params.verificationId,
      photoType: 'id_front',
    },
  });

  if (!idFrontResult.allowed) {
    flags.push(`ID front: ${idFrontResult.reason}`);
  }

  // Check ID back if provided
  if (params.photoUrls.idBack) {
    const idBackResult = await moderateUploadedContent({
      contentId: `verification_${params.verificationId}_id_back`,
      userId: params.userId,
      mediaUrl: params.photoUrls.idBack,
      contentType: 'VERIFICATION_PHOTO',
      associatedId: params.verificationId,
      metadata: {
        verificationId: params.verificationId,
        photoType: 'id_back',
      },
    });

    if (!idBackResult.allowed) {
      flags.push(`ID back: ${idBackResult.reason}`);
    }
  }

  // Check selfie
  const selfieResult = await moderateUploadedContent({
    contentId: `verification_${params.verificationId}_selfie`,
    userId: params.userId,
    mediaUrl: params.photoUrls.selfie,
    contentType: 'VERIFICATION_PHOTO',
    associatedId: params.verificationId,
    metadata: {
      verificationId: params.verificationId,
      photoType: 'selfie',
    },
  });

  if (!selfieResult.allowed) {
    flags.push(`Selfie: ${selfieResult.reason}`);
  }

  return {
    hasFlags: flags.length > 0,
    flags,
  };
}

/**
 * PATTERN 7: Message Media Integration
 * 
 * Usage in chat message with media:
 * 
 * export const sendMessageWithMedia = functions.https.onCall(async (data, context) => {
 *   // ... upload media to storage ...
 *   
 *   if (data.mediaUrl) {
 *     const moderationResult = await moderateMessageMedia({
 *       messageId: messageId,
 *       chatId: data.chatId,
 *       userId: context.auth.uid,
 *       mediaUrl: data.mediaUrl,
 *       mediaType: data.mediaType,
 *     });
 *     
 *     if (!moderationResult.allowed) {
 *       return {
 *         success: false,
 *         error: 'Media content violates our policies',
 *       };
 *     }
 *   }
 *   
 *   // Send message...
 * });
 */
export async function moderateMessageMedia(params: {
  messageId: string;
  chatId: string;
  userId: string;
  mediaUrl: string;
  mediaType: 'photo' | 'video' | 'audio';
}): Promise<{
  allowed: boolean;
  reason: string;
  requiresReview: boolean;
}> {
  const contentId = `message_media_${params.chatId}_${params.messageId}`;
  
  const result = await moderateUploadedContent({
    contentId,
    userId: params.userId,
    mediaUrl: params.mediaUrl,
    contentType: 'MESSAGE_MEDIA',
    associatedId: params.chatId,
    metadata: {
      messageId: params.messageId,
      chatId: params.chatId,
      mediaType: params.mediaType,
    },
  });

  return {
    allowed: result.allowed,
    reason: result.reason,
    requiresReview: result.requiresReview,
  };
}