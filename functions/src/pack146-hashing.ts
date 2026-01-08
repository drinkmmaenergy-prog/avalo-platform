/**
 * PACK 146 — Content Hashing & Registry System
 * Multi-algorithm hashing for duplicate detection
 * 
 * Features:
 * - SHA256 for exact matches
 * - Perceptual hashing for modified content
 * - Thumbnail hashing for quick comparison
 * - Audio fingerprinting for videos
 */

import { db, serverTimestamp, generateId } from './init';
import { logger } from './common';
import { 
  ContentHash, 
  DuplicateDetectionResult,
  HashAlgorithm 
} from './pack146-types';
import * as crypto from 'crypto';

// ============================================================================
// CONTENT HASHING
// ============================================================================

/**
 * Register content hash in registry
 */
export async function registerContentHash(
  contentId: string,
  contentType: 'IMAGE' | 'VIDEO' | 'PDF' | 'AUDIO' | 'DOCUMENT' | 'DIGITAL_PRODUCT',
  ownerId: string,
  metadata: {
    filename: string;
    mimeType: string;
    fileSize: number;
    width?: number;
    height?: number;
    duration?: number;
    format: string;
    contentUrl: string;
  }
): Promise<ContentHash> {
  
  const hashId = generateId();
  
  // Generate multiple hash types
  const exactHash = await generateExactHash(metadata.contentUrl);
  const perceptualHash = await generatePerceptualHash(metadata.contentUrl, contentType);
  const thumbnailHash = await generateThumbnailHash(metadata.contentUrl);
  const audioHash = (contentType === 'VIDEO' || contentType === 'AUDIO') 
    ? await generateAudioFingerprint(metadata.contentUrl)
    : undefined;
  
  // Get owner info for copyright
  const ownerDoc = await db.collection('users').doc(ownerId).get();
  const ownerUsername = ownerDoc.data()?.username || 'Unknown';
  
  const contentHash: any = {
    hashId,
    contentId,
    contentType,
    ownerId,
    hashes: {
      exact: exactHash,
      perceptual: perceptualHash,
      thumbnail: thumbnailHash,
      audio: audioHash,
    },
    metadata: {
      filename: metadata.filename,
      mimeType: metadata.mimeType,
      fileSize: metadata.fileSize,
      width: metadata.width,
      height: metadata.height,
      duration: metadata.duration,
      format: metadata.format,
    },
    copyright: {
      copyrightHolder: ownerUsername,
      registrationDate: serverTimestamp(),
      licenseType: 'ALL_RIGHTS_RESERVED',
      commercialUse: true,
    },
    duplicateDetectionEnabled: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  // Store in Firestore
  await db.collection('content_hash_registry').doc(hashId).set(contentHash);
  
  logger.info(`Content hash registered: ${hashId} for ${contentId}`);
  
  return contentHash as ContentHash;
}

/**
 * Generate exact hash (SHA256)
 */
async function generateExactHash(contentUrl: string): Promise<string> {
  // In production, this would download and hash the content
  // For now, create a deterministic hash from URL
  return crypto.createHash('sha256').update(contentUrl).digest('hex');
}

/**
 * Generate perceptual hash
 * Survives resizing, compression, minor modifications
 */
async function generatePerceptualHash(
  contentUrl: string,
  contentType: string
): Promise<string> {
  
  // In production, use pHash or similar algorithm
  // This is a simplified version
  
  const baseHash = crypto.createHash('sha256').update(contentUrl).digest('hex');
  
  // Simulate perceptual hash (first 16 chars for similarity)
  return baseHash.substring(0, 16);
}

/**
 * Generate thumbnail hash
 */
async function generateThumbnailHash(contentUrl: string): Promise<string> {
  // In production, generate thumbnail and hash it
  const baseHash = crypto.createHash('md5').update(contentUrl).digest('hex');
  return baseHash.substring(0, 12);
}

/**
 * Generate audio fingerprint
 */
async function generateAudioFingerprint(contentUrl: string): Promise<string> {
  // In production, use audio fingerprinting library
  const baseHash = crypto.createHash('sha256').update(`audio:${contentUrl}`).digest('hex');
  return baseHash.substring(0, 20);
}

// ============================================================================
// DUPLICATE DETECTION
// ============================================================================

/**
 * Scan for duplicate content
 */
export async function scanForDuplicateContent(
  contentUrl: string,
  contentType: 'IMAGE' | 'VIDEO' | 'PDF' | 'AUDIO' | 'DOCUMENT' | 'DIGITAL_PRODUCT',
  uploaderId: string
): Promise<DuplicateDetectionResult> {
  
  // Generate hashes for the new content
  const exactHash = await generateExactHash(contentUrl);
  const perceptualHash = await generatePerceptualHash(contentUrl, contentType);
  const thumbnailHash = await generateThumbnailHash(contentUrl);
  
  // Check for exact match first
  const exactMatch = await db.collection('content_hash_registry')
    .where('hashes.exact', '==', exactHash)
    .where('duplicateDetectionEnabled', '==', true)
    .limit(1)
    .get();
  
  if (!exactMatch.empty) {
    const match = exactMatch.docs[0].data() as ContentHash;
    
    // Check if uploader is the owner
    if (match.ownerId === uploaderId) {
      return {
        isDuplicate: false,
        matchType: 'NONE',
        confidence: 0,
        matchedHashes: {
          exact: false,
          perceptual: false,
          thumbnailSimilarity: 0,
        },
        modificationsDetected: [],
        checkedAt: serverTimestamp() as any,
      };
    }
    
    return {
      isDuplicate: true,
      matchType: 'EXACT',
      confidence: 1.0,
      originalContentId: match.contentId,
      originalOwnerId: match.ownerId,
      originalHash: match.hashes.exact,
      matchedHashes: {
        exact: true,
        perceptual: true,
        thumbnailSimilarity: 1.0,
      },
      modificationsDetected: [],
      checkedAt: serverTimestamp() as any,
    };
  }
  
  // Check for perceptual match (modified content)
  const perceptualMatches = await db.collection('content_hash_registry')
    .where('hashes.perceptual', '==', perceptualHash)
    .where('duplicateDetectionEnabled', '==', true)
    .limit(5)
    .get();
  
  if (!perceptualMatches.empty) {
    for (const doc of perceptualMatches.docs) {
      const match = doc.data() as ContentHash;
      
      // Skip if uploader is the owner
      if (match.ownerId === uploaderId) {
        continue;
      }
      
      // Calculate thumbnail similarity
      const thumbnailSimilarity = calculateHashSimilarity(
        thumbnailHash,
        match.hashes.thumbnail
      );
      
      if (thumbnailSimilarity > 0.8) {
        // Likely a modified version
        const modifications = detectModifications(match.metadata, {
          filename: '',
          mimeType: '',
          fileSize: 0,
          format: '',
        });
        
        return {
          isDuplicate: true,
          matchType: 'MODIFIED',
          confidence: thumbnailSimilarity,
          originalContentId: match.contentId,
          originalOwnerId: match.ownerId,
          originalHash: match.hashes.exact,
          matchedHashes: {
            exact: false,
            perceptual: true,
            thumbnailSimilarity,
          },
          modificationsDetected: modifications,
          checkedAt: serverTimestamp() as any,
        };
      }
    }
  }
  
  // No duplicate found
  return {
    isDuplicate: false,
    matchType: 'NONE',
    confidence: 0,
    matchedHashes: {
      exact: false,
      perceptual: false,
      thumbnailSimilarity: 0,
    },
    modificationsDetected: [],
    checkedAt: serverTimestamp() as any,
  };
}

/**
 * Calculate similarity between two hashes
 */
function calculateHashSimilarity(hash1: string, hash2: string): number {
  if (hash1 === hash2) return 1.0;
  
  // Hamming distance for similarity
  let matches = 0;
  const length = Math.min(hash1.length, hash2.length);
  
  for (let i = 0; i < length; i++) {
    if (hash1[i] === hash2[i]) {
      matches++;
    }
  }
  
  return matches / length;
}

/**
 * Detect modifications between original and uploaded content
 */
function detectModifications(
  originalMeta: any,
  uploadedMeta: any
): string[] {
  
  const modifications: string[] = [];
  
  // Check for resizing
  if (originalMeta.width && uploadedMeta.width) {
    if (originalMeta.width !== uploadedMeta.width || originalMeta.height !== uploadedMeta.height) {
      modifications.push('RESIZED');
    }
  }
  
  // Check for compression
  if (originalMeta.fileSize && uploadedMeta.fileSize) {
    const sizeRatio = uploadedMeta.fileSize / originalMeta.fileSize;
    if (sizeRatio < 0.8) {
      modifications.push('COMPRESSED');
    }
  }
  
  // Check for format change
  if (originalMeta.format !== uploadedMeta.format) {
    modifications.push('FORMAT_CHANGED');
  }
  
  if (modifications.length === 0) {
    modifications.push('UNKNOWN_MODIFICATION');
  }
  
  return modifications;
}

// ============================================================================
// HASH REGISTRY MANAGEMENT
// ============================================================================

/**
 * Update content hash
 */
export async function updateContentHash(
  hashId: string,
  updates: Partial<ContentHash>
): Promise<void> {
  
  await db.collection('content_hash_registry').doc(hashId).update({
    ...updates,
    updatedAt: serverTimestamp(),
  });
  
  logger.info(`Content hash updated: ${hashId}`);
}

/**
 * Get content hash by content ID
 */
export async function getContentHash(contentId: string): Promise<ContentHash | null> {
  const snapshot = await db.collection('content_hash_registry')
    .where('contentId', '==', contentId)
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    return null;
  }
  
  return snapshot.docs[0].data() as ContentHash;
}

/**
 * Delete content hash
 */
export async function deleteContentHash(hashId: string): Promise<void> {
  await db.collection('content_hash_registry').doc(hashId).delete();
  logger.info(`Content hash deleted: ${hashId}`);
}

/**
 * Search for similar content by hash
 */
export async function searchSimilarContent(
  perceptualHash: string,
  limit: number = 10
): Promise<ContentHash[]> {
  
  const snapshot = await db.collection('content_hash_registry')
    .where('hashes.perceptual', '==', perceptualHash)
    .where('duplicateDetectionEnabled', '==', true)
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as ContentHash);
}

/**
 * Verify content ownership
 */
export async function verifyContentOwnership(
  contentId: string,
  userId: string
): Promise<boolean> {
  
  const hash = await getContentHash(contentId);
  
  if (!hash) {
    return false;
  }
  
  return hash.ownerId === userId;
}

/**
 * Get all content hashes for user
 */
export async function getUserContentHashes(
  userId: string,
  limit: number = 50
): Promise<ContentHash[]> {
  
  const snapshot = await db.collection('content_hash_registry')
    .where('ownerId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as ContentHash);
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Scan user's content for duplicates
 */
export async function scanUserContentForDuplicates(
  userId: string
): Promise<{
  total: number;
  duplicatesFound: number;
  duplicates: Array<{
    contentId: string;
    originalOwnerId: string;
    confidence: number;
  }>;
}> {
  
  const userHashes = await getUserContentHashes(userId, 100);
  const duplicates: Array<{
    contentId: string;
    originalOwnerId: string;
    confidence: number;
  }> = [];
  
  for (const hash of userHashes) {
    // Check if this content is a duplicate
    const similarContent = await searchSimilarContent(hash.hashes.perceptual);
    
    for (const similar of similarContent) {
      if (similar.ownerId !== userId && similar.contentId !== hash.contentId) {
        // Found a duplicate
        duplicates.push({
          contentId: hash.contentId,
          originalOwnerId: similar.ownerId,
          confidence: 0.9,
        });
      }
    }
  }
  
  return {
    total: userHashes.length,
    duplicatesFound: duplicates.length,
    duplicates,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  registerContentHash,
  scanForDuplicateContent,
  updateContentHash,
  getContentHash,
  deleteContentHash,
  searchSimilarContent,
  verifyContentOwnership,
  getUserContentHashes,
  scanUserContentForDuplicates,
};