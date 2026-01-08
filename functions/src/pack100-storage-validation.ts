/**
 * PACK 100 — Storage Validation & Media Upload Safety
 * 
 * Server-side validation for all media uploads
 * Prevents malicious files and ensures storage security
 * 
 * COMPLIANCE RULES:
 * - Storage validation is for safety ONLY
 * - Does NOT affect content pricing or monetization
 * - No special rates for verified vs unverified content
 */

import { storage } from './init';
import { logTechEvent } from './pack90-logging';
import * as crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface StorageValidationResult {
  allowed: boolean;
  reason?: string;
  sanitizedFilename?: string;
  contentHash?: string;
}

export interface MediaUploadMetadata {
  userId: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedAt: number;
  contentHash: string;
  storageLocation: string;
}

// ============================================================================
// ALLOWED MIME TYPES
// ============================================================================

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
];

const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
];

const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/aac',
  'audio/m4a',
];

const ALL_ALLOWED_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
  ...ALLOWED_AUDIO_TYPES,
];

// ============================================================================
// FILE SIZE LIMITS
// ============================================================================

const MAX_FILE_SIZES = {
  IMAGE: 10 * 1024 * 1024,      // 10 MB
  VIDEO: 100 * 1024 * 1024,     // 100 MB
  AUDIO: 20 * 1024 * 1024,      // 20 MB
};

// ============================================================================
// DANGEROUS FILE EXTENSIONS (BLACKLIST)
// ============================================================================

const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
  '.msi', '.app', '.deb', '.rpm', '.dmg', '.pkg', '.sh', '.bash',
  '.ps1', '.psm1', '.psd1', '.ps1xml', '.psc1', '.msh', '.msh1', '.msh2', '.mshxml',
  '.scf', '.lnk', '.inf', '.reg', '.dll', '.so', '.dylib',
];

// ============================================================================
// MIME TYPE VALIDATION
// ============================================================================

/**
 * Validate MIME type against whitelist
 */
export function validateMimeType(mimeType: string): StorageValidationResult {
  if (!mimeType || typeof mimeType !== 'string') {
    return {
      allowed: false,
      reason: 'INVALID_MIME_TYPE',
    };
  }
  
  const normalizedMime = mimeType.toLowerCase().trim();
  
  if (!ALL_ALLOWED_TYPES.includes(normalizedMime)) {
    return {
      allowed: false,
      reason: 'MIME_TYPE_NOT_ALLOWED',
    };
  }
  
  return { allowed: true };
}

/**
 * Get media type from MIME type
 */
function getMediaType(mimeType: string): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'UNKNOWN' {
  const normalizedMime = mimeType.toLowerCase();
  
  if (ALLOWED_IMAGE_TYPES.includes(normalizedMime)) {
    return 'IMAGE';
  }
  
  if (ALLOWED_VIDEO_TYPES.includes(normalizedMime)) {
    return 'VIDEO';
  }
  
  if (ALLOWED_AUDIO_TYPES.includes(normalizedMime)) {
    return 'AUDIO';
  }
  
  return 'UNKNOWN';
}

// ============================================================================
// FILE SIZE VALIDATION
// ============================================================================

/**
 * Validate file size against limits
 */
export function validateFileSize(
  fileSizeBytes: number,
  mimeType: string
): StorageValidationResult {
  if (!fileSizeBytes || fileSizeBytes <= 0) {
    return {
      allowed: false,
      reason: 'INVALID_FILE_SIZE',
    };
  }
  
  const mediaType = getMediaType(mimeType);
  
  if (mediaType === 'UNKNOWN') {
    return {
      allowed: false,
      reason: 'UNKNOWN_MEDIA_TYPE',
    };
  }
  
  const maxSize = MAX_FILE_SIZES[mediaType];
  
  if (fileSizeBytes > maxSize) {
    return {
      allowed: false,
      reason: 'FILE_TOO_LARGE',
    };
  }
  
  return { allowed: true };
}

// ============================================================================
// FILENAME SANITIZATION
// ============================================================================

/**
 * Sanitize filename to prevent path traversal and dangerous extensions
 */
export function sanitizeFilename(filename: string): StorageValidationResult {
  if (!filename || typeof filename !== 'string') {
    return {
      allowed: false,
      reason: 'INVALID_FILENAME',
    };
  }
  
  // Remove path separators
  let sanitized = filename.replace(/[\/\\]/g, '_');
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  
  // Check for dangerous extensions
  const lowerFilename = sanitized.toLowerCase();
  for (const ext of DANGEROUS_EXTENSIONS) {
    if (lowerFilename.endsWith(ext)) {
      return {
        allowed: false,
        reason: 'DANGEROUS_FILE_EXTENSION',
      };
    }
  }
  
  // Remove leading/trailing dots and spaces
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '');
  
  // Replace multiple spaces with single space
  sanitized = sanitized.replace(/\s+/g, ' ');
  
  // Limit filename length
  if (sanitized.length > 200) {
    const ext = sanitized.substring(sanitized.lastIndexOf('.'));
    const name = sanitized.substring(0, 200 - ext.length);
    sanitized = name + ext;
  }
  
  return {
    allowed: true,
    sanitizedFilename: sanitized,
  };
}

// ============================================================================
// CONTENT HASH (FOR DUPLICATE DETECTION)
// ============================================================================

/**
 * Generate content hash from buffer
 * Used for duplicate detection (optional)
 */
export function generateContentHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Check if content hash already exists in storage
 * Returns true if duplicate found
 */
export async function checkDuplicateContent(
  contentHash: string,
  userId: string
): Promise<boolean> {
  try {
    const bucket = storage.bucket();
    const [files] = await bucket.getFiles({
      prefix: `media/${userId}/`,
      maxResults: 1000,
    });
    
    for (const file of files) {
      const [metadata] = await file.getMetadata();
      if (metadata.metadata?.contentHash === contentHash) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('[StorageValidation] Error checking duplicate:', error);
    // Return false to allow upload if check fails
    return false;
  }
}

// ============================================================================
// COMPREHENSIVE VALIDATION
// ============================================================================

/**
 * Perform comprehensive pre-upload validation
 */
export async function validateMediaUpload(
  filename: string,
  mimeType: string,
  fileSizeBytes: number,
  userId: string,
  checkDuplicates: boolean = false
): Promise<StorageValidationResult> {
  // Validate MIME type
  const mimeResult = validateMimeType(mimeType);
  if (!mimeResult.allowed) {
    await logTechEvent({
      level: 'WARN',
      category: 'SECURITY',
      functionName: 'validateMediaUpload',
      message: `Upload rejected: ${mimeResult.reason}`,
      context: { userId, filename, mimeType },
    });
    
    return mimeResult;
  }
  
  // Validate file size
  const sizeResult = validateFileSize(fileSizeBytes, mimeType);
  if (!sizeResult.allowed) {
    await logTechEvent({
      level: 'WARN',
      category: 'SECURITY',
      functionName: 'validateMediaUpload',
      message: `Upload rejected: ${sizeResult.reason}`,
      context: { userId, filename, mimeType, fileSizeBytes },
    });
    
    return sizeResult;
  }
  
  // Sanitize filename
  const filenameResult = sanitizeFilename(filename);
  if (!filenameResult.allowed) {
    await logTechEvent({
      level: 'WARN',
      category: 'SECURITY',
      functionName: 'validateMediaUpload',
      message: `Upload rejected: ${filenameResult.reason}`,
      context: { userId, filename },
    });
    
    return filenameResult;
  }
  
  return {
    allowed: true,
    sanitizedFilename: filenameResult.sanitizedFilename,
  };
}

// ============================================================================
// STORAGE PATH GENERATION
// ============================================================================

/**
 * Generate safe storage path for media file
 * Format: media/{userId}/{timestamp}_{random}_{sanitizedFilename}
 */
export function generateStoragePath(
  userId: string,
  sanitizedFilename: string
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  
  return `media/${userId}/${timestamp}_${random}_${sanitizedFilename}`;
}

// ============================================================================
// POST-UPLOAD VERIFICATION
// ============================================================================

/**
 * Verify uploaded file metadata
 * Should be called after upload completes
 */
export async function verifyUploadedFile(
  storagePath: string,
  expectedUserId: string,
  expectedMimeType: string
): Promise<boolean> {
  try {
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);
    
    const [exists] = await file.exists();
    if (!exists) {
      await logTechEvent({
        level: 'ERROR',
        category: 'SERVICE',
        functionName: 'verifyUploadedFile',
        message: 'Uploaded file not found in storage',
        context: { storagePath, expectedUserId },
      });
      return false;
    }
    
    const [metadata] = await file.getMetadata();
    
    // Verify MIME type matches
    if (metadata.contentType !== expectedMimeType) {
      await logTechEvent({
        level: 'WARN',
        category: 'SECURITY',
        functionName: 'verifyUploadedFile',
        message: 'MIME type mismatch after upload',
        context: {
          storagePath,
          expected: expectedMimeType,
          actual: metadata.contentType,
        },
      });
      return false;
    }
    
    // Verify file is in correct user directory
    if (!storagePath.startsWith(`media/${expectedUserId}/`)) {
      await logTechEvent({
        level: 'ERROR',
        category: 'SECURITY',
        functionName: 'verifyUploadedFile',
        message: 'File uploaded to wrong user directory',
        context: { storagePath, expectedUserId },
      });
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[StorageValidation] Error verifying upload:', error);
    await logTechEvent({
      level: 'ERROR',
      category: 'SERVICE',
      functionName: 'verifyUploadedFile',
      message: 'Upload verification failed',
      context: { storagePath, error: String(error) },
    });
    return false;
  }
}

// ============================================================================
// CLEANUP UTILITIES
// ============================================================================

/**
 * Delete file from storage (for failed uploads or violations)
 */
export async function deleteStorageFile(storagePath: string): Promise<void> {
  try {
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);
    
    await file.delete();
    
    console.log(`[StorageValidation] Deleted file: ${storagePath}`);
  } catch (error) {
    console.error(`[StorageValidation] Error deleting file ${storagePath}:`, error);
  }
}

/**
 * Get file metadata from storage
 */
export async function getFileMetadata(storagePath: string): Promise<any> {
  try {
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);
    
    const [metadata] = await file.getMetadata();
    return metadata;
  } catch (error) {
    console.error(`[StorageValidation] Error getting metadata for ${storagePath}:`, error);
    return null;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get list of allowed MIME types for UI display
 */
export function getAllowedMimeTypes(): {
  images: string[];
  videos: string[];
  audio: string[];
  all: string[];
} {
  return {
    images: [...ALLOWED_IMAGE_TYPES],
    videos: [...ALLOWED_VIDEO_TYPES],
    audio: [...ALLOWED_AUDIO_TYPES],
    all: [...ALL_ALLOWED_TYPES],
  };
}

/**
 * Get max file size for media type
 */
export function getMaxFileSize(mimeType: string): number {
  const mediaType = getMediaType(mimeType);
  return MAX_FILE_SIZES[mediaType] || 0;
}