/**
 * PACK 80 — Paid Media Upload Service
 * Handles media upload, compression, and thumbnail generation for locked media
 */

import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { Video } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import app from '../lib/firebase';
import {
  PaidMediaType,
  CompressionResult,
  VideoCompressionResult,
  CompressionOptions,
  VideoCompressionOptions,
  PAID_MEDIA_CONFIG,
  PaidMediaErrorCode,
  MediaValidationResult,
  validateMediaFile,
} from '../types/paidMedia';

// ============================================================================
// CONSTANTS
// ============================================================================

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 400;
const THUMBNAIL_QUALITY = 0.3;

const IMAGE_COMPRESSION_QUALITY = 0.85;
const VIDEO_COMPRESSION_BITRATE = 2000000; // 2 Mbps

// ============================================================================
// IMAGE COMPRESSION
// ============================================================================

/**
 * Compress an image file
 */
export async function compressImage(
  uri: string,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  try {
    const {
      maxWidth = 1920,
      maxHeight = 1920,
      quality = IMAGE_COMPRESSION_QUALITY,
    } = options;

    // Get original file info
    const fileInfo = await FileSystem.getInfoAsync(uri);
    const originalSize = (fileInfo.exists && 'size' in fileInfo) ? fileInfo.size : 0;

    // Compress image
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: maxWidth, height: maxHeight } }],
      {
        compress: quality,
        format: SaveFormat.JPEG,
      }
    );

    // Get compressed file info
    const compressedInfo = await FileSystem.getInfoAsync(result.uri);
    const compressedSize = (compressedInfo.exists && 'size' in compressedInfo) ? compressedInfo.size : 0;

    const compressedBy = originalSize > 0
      ? ((originalSize - compressedSize) / originalSize) * 100
      : 0;

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      size: compressedSize,
      compressedBy,
    };
  } catch (error) {
    console.error('[paidMediaUploadService] Error compressing image:', error);
    throw error;
  }
}

/**
 * Generate blurred thumbnail for locked media
 */
export async function generateBlurredThumbnail(uri: string): Promise<string> {
  try {
    // Create thumbnail
    const thumbnail = await manipulateAsync(
      uri,
      [
        { resize: { width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT } },
      ],
      {
        compress: THUMBNAIL_QUALITY,
        format: SaveFormat.JPEG,
      }
    );

    // Apply blur effect
    const blurred = await manipulateAsync(
      thumbnail.uri,
      [
        // Multiple resize operations create a blur effect
        { resize: { width: 50 } },
        { resize: { width: THUMBNAIL_WIDTH } },
      ],
      {
        compress: THUMBNAIL_QUALITY,
        format: SaveFormat.JPEG,
      }
    );

    return blurred.uri;
  } catch (error) {
    console.error('[paidMediaUploadService] Error generating thumbnail:', error);
    throw error;
  }
}

// ============================================================================
// VIDEO COMPRESSION
// ============================================================================

/**
 * Compress a video file
 * Note: Video compression is complex and may require native modules
 * This is a simplified version using expo-av for basic operations
 */
export async function compressVideo(
  uri: string,
  options: VideoCompressionOptions = {}
): Promise<VideoCompressionResult> {
  try {
    const {
      maxDuration = PAID_MEDIA_CONFIG.MAX_VIDEO_DURATION_SEC,
    } = options;

    // Get video info
    const fileInfo = await FileSystem.getInfoAsync(uri);
    const originalSize = (fileInfo.exists && 'size' in fileInfo) ? fileInfo.size : 0;

    // Load video to get duration and dimensions
    const { sound: videoSound } = await Video.Sound.createAsync(
      { uri },
      { shouldPlay: false }
    );

    const status = await videoSound.getStatusAsync();
    if (!status.isLoaded) {
      throw new Error('Failed to load video');
    }

    const duration = (status.durationMillis || 0) / 1000;
    
    // Validate duration
    if (duration > maxDuration) {
      throw new Error(`Video duration ${duration}s exceeds maximum ${maxDuration}s`);
    }

    // For now, we'll use the original video as compression requires native modules
    // In production, you'd use expo-video-thumbnails or react-native-video-processing
    const compressedUri = uri;

    // Generate video thumbnail
    const thumbnailUri = await generateVideoThumbnail(uri);

    // Unload video
    await videoSound.unloadAsync();

    return {
      uri: compressedUri,
      width: 1920, // Default values - would need native module for actual values
      height: 1080,
      size: originalSize,
      compressedBy: 0,
      duration,
      thumbnailUri,
    };
  } catch (error) {
    console.error('[paidMediaUploadService] Error compressing video:', error);
    throw error;
  }
}

/**
 * Generate thumbnail from video
 */
export async function generateVideoThumbnail(videoUri: string): Promise<string> {
  try {
    // This would typically use expo-video-thumbnails
    // For now, return a placeholder or use first frame
    // In production, implement proper video thumbnail generation
    
    // Placeholder implementation
    // You should install and use expo-video-thumbnails:
    // import * as VideoThumbnails from 'expo-video-thumbnails';
    // const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 1000 });
    
    console.warn('[paidMediaUploadService] Video thumbnail generation not fully implemented');
    return videoUri; // Return video URI as fallback
  } catch (error) {
    console.error('[paidMediaUploadService] Error generating video thumbnail:', error);
    throw error;
  }
}

// ============================================================================
// FIREBASE STORAGE UPLOAD
// ============================================================================

/**
 * Upload progress callback
 */
export type UploadProgressCallback = (progress: number) => void;

/**
 * Upload media to Firebase Storage
 */
export async function uploadMediaToStorage(
  uri: string,
  storagePath: string,
  onProgress?: UploadProgressCallback
): Promise<string> {
  try {
    const storage = getStorage(app);
    const storageRef = ref(storage, storagePath);

    // Convert URI to Blob
    const response = await fetch(uri);
    const blob = await response.blob();

    // Upload with progress tracking
    const uploadTask = uploadBytesResumable(storageRef, blob);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) {
            onProgress(progress);
          }
          console.log(`[paidMediaUploadService] Upload ${progress.toFixed(1)}% complete`);
        },
        (error) => {
          console.error('[paidMediaUploadService] Upload error:', error);
          reject(error);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            console.log('[paidMediaUploadService] Upload complete:', downloadURL);
            resolve(downloadURL);
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  } catch (error) {
    console.error('[paidMediaUploadService] Error uploading to storage:', error);
    throw error;
  }
}

// ============================================================================
// MAIN UPLOAD FUNCTION
// ============================================================================

export interface UploadPaidMediaParams {
  uri: string;
  mediaType: PaidMediaType;
  chatId: string;
  messageId: string;
  onProgress?: UploadProgressCallback;
}

export interface UploadPaidMediaResult {
  mediaUrl: string;
  thumbnailUrl: string;
  storagePath: string;
  thumbnailStoragePath: string;
  compressedSize: number;
  originalSize: number;
  width?: number;
  height?: number;
  duration?: number;
}

/**
 * Upload and process paid media (main function)
 */
export async function uploadPaidMedia(
  params: UploadPaidMediaParams
): Promise<UploadPaidMediaResult> {
  const { uri, mediaType, chatId, messageId, onProgress } = params;

  try {
    console.log('[paidMediaUploadService] Starting paid media upload:', {
      mediaType,
      chatId,
      messageId,
    });

    // Get original file info
    const fileInfo = await FileSystem.getInfoAsync(uri);
    const originalSize = (fileInfo.exists && 'size' in fileInfo) ? fileInfo.size : 0;

    // Validate file
    const validation = validateMediaFile(originalSize, mediaType);
    if (!validation.isValid) {
      throw new Error(validation.errorMessage || 'Invalid media file');
    }

    let compressedUri: string;
    let thumbnailUri: string;
    let width: number | undefined;
    let height: number | undefined;
    let duration: number | undefined;
    let compressedSize: number;

    // Process based on media type
    if (mediaType === PaidMediaType.IMAGE) {
      // Compress image
      const compressed = await compressImage(uri);
      compressedUri = compressed.uri;
      width = compressed.width;
      height = compressed.height;
      compressedSize = compressed.size;

      // Generate blurred thumbnail
      thumbnailUri = await generateBlurredThumbnail(compressedUri);
    } else {
      // Compress video
      const compressed = await compressVideo(uri);
      compressedUri = compressed.uri;
      width = compressed.width;
      height = compressed.height;
      duration = compressed.duration;
      compressedSize = compressed.size;

      // Use video thumbnail (blurred)
      if (compressed.thumbnailUri) {
        thumbnailUri = await generateBlurredThumbnail(compressed.thumbnailUri);
      } else {
        thumbnailUri = compressedUri; // Fallback
      }
    }

    // Upload main media
    const mediaStoragePath = `paid-media/${chatId}/${messageId}/media.${mediaType === PaidMediaType.IMAGE ? 'jpg' : 'mp4'}`;
    const mediaUrl = await uploadMediaToStorage(compressedUri, mediaStoragePath, (progress) => {
      if (onProgress) {
        // Allocate 80% of progress to media upload
        onProgress(progress * 0.8);
      }
    });

    // Upload thumbnail
    const thumbnailStoragePath = `paid-media/${chatId}/${messageId}/thumbnail.jpg`;
    const thumbnailUrl = await uploadMediaToStorage(thumbnailUri, thumbnailStoragePath, (progress) => {
      if (onProgress) {
        // Allocate remaining 20% to thumbnail upload
        onProgress(80 + progress * 0.2);
      }
    });

    console.log('[paidMediaUploadService] Upload complete:', {
      mediaUrl,
      thumbnailUrl,
    });

    return {
      mediaUrl,
      thumbnailUrl,
      storagePath: mediaStoragePath,
      thumbnailStoragePath,
      compressedSize,
      originalSize,
      width,
      height,
      duration,
    };
  } catch (error) {
    console.error('[paidMediaUploadService] Error uploading paid media:', error);
    throw error;
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate media before upload
 */
export async function validateMediaBeforeUpload(
  uri: string,
  mediaType: PaidMediaType
): Promise<MediaValidationResult> {
  try {
    // Get file info
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      return {
        isValid: false,
        error: PaidMediaErrorCode.MEDIA_NOT_FOUND,
        errorMessage: 'Media file not found',
      };
    }

    const fileSize = (fileInfo.exists && 'size' in fileInfo) ? fileInfo.size : 0;

    // Validate video duration if applicable
    if (mediaType === PaidMediaType.VIDEO) {
      try {
        const { sound: videoSound } = await Video.Sound.createAsync(
          { uri },
          { shouldPlay: false }
        );

        const status = await videoSound.getStatusAsync();
        if (status.isLoaded) {
          const duration = (status.durationMillis || 0) / 1000;
          await videoSound.unloadAsync();

          return validateMediaFile(fileSize, mediaType, duration);
        }

        await videoSound.unloadAsync();
      } catch (error) {
        console.error('[paidMediaUploadService] Error validating video:', error);
      }
    }

    return validateMediaFile(fileSize, mediaType);
  } catch (error) {
    console.error('[paidMediaUploadService] Error validating media:', error);
    return {
      isValid: false,
      error: PaidMediaErrorCode.INVALID_MEDIA_TYPE,
      errorMessage: 'Failed to validate media file',
    };
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Delete temporary files after upload
 */
export async function cleanupTempFiles(uris: string[]): Promise<void> {
  try {
    for (const uri of uris) {
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch (error) {
        console.warn('[paidMediaUploadService] Failed to delete temp file:', uri, error);
      }
    }
  } catch (error) {
    console.error('[paidMediaUploadService] Error cleaning up temp files:', error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  compressImage,
  compressVideo,
  generateBlurredThumbnail,
  generateVideoThumbnail,
  uploadMediaToStorage,
  uploadPaidMedia,
  validateMediaBeforeUpload,
  cleanupTempFiles,
};