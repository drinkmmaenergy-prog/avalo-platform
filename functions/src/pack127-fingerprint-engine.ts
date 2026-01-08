/**
 * PACK 127 — IP Fingerprint Registration & Matching Engine
 * 
 * Handles content fingerprinting, matching, and duplicate detection
 * 
 * NON-NEGOTIABLE RULES:
 * - All creators protected equally (no paid priority)
 * - No economic/ranking effects
 * - Automatic protection on upload
 */

import { db, serverTimestamp, generateId } from './init';
import {
  IPFingerprint,
  FingerprintMatch,
  AssetType,
  RegisterFingerprintInput,
  FingerprintMethod,
  DEFAULT_IP_CONFIG,
} from './pack127-types';
import { createHash } from 'crypto';

// ============================================================================
// FINGERPRINT REGISTRATION
// ============================================================================

/**
 * Register content fingerprint
 * Called automatically on upload
 */
export async function registerFingerprint(
  input: RegisterFingerprintInput
): Promise<IPFingerprint> {
  const fingerprintId = generateId();
  
  // Generate fingerprints based on asset type
  const fingerprints = await generateFingerprints(input);
  
  const fingerprint: IPFingerprint = {
    fingerprintId,
    ownerUserId: input.userId,
    assetType: input.assetType,
    assetId: input.assetId,
    assetUrl: input.assetUrl,
    ...fingerprints,
    hasWatermark: false,
    createdAt: serverTimestamp() as any,
    registeredVia: 'UPLOAD',
    status: 'ACTIVE',
    disputeCount: 0,
    ...input.metadata,
  };
  
  await db.collection('ip_fingerprints').doc(fingerprintId).set(fingerprint);
  
  return fingerprint;
}

/**
 * Generate fingerprints for content
 */
async function generateFingerprints(input: RegisterFingerprintInput): Promise<{
  contentHash: string;
  perceptualHash?: string;
  waveformSignature?: string;
  fileChecksum?: string;
}> {
  const result: any = {};
  
  // Always generate content hash
  result.contentHash = generateContentHash(input.assetId, input.userId);
  
  // Generate type-specific fingerprints
  switch (input.assetType) {
    case 'IMAGE':
    case 'VIDEO':
      result.perceptualHash = await generatePerceptualHash(input);
      break;
    
    case 'AUDIO':
      result.waveformSignature = await generateWaveformSignature(input);
      break;
    
    case 'DOCUMENT':
    case 'DIGITAL_PRODUCT':
      if (input.fileData) {
        result.fileChecksum = generateFileChecksum(input.fileData);
      }
      break;
  }
  
  return result;
}

/**
 * Generate content hash (primary identifier)
 */
function generateContentHash(assetId: string, userId: string): string {
  return createHash('sha256')
    .update(`${assetId}:${userId}:${Date.now()}`)
    .digest('hex');
}

/**
 * Generate perceptual hash for images/video
 * Uses simplified algorithm - in production, use proper pHash library
 */
async function generatePerceptualHash(input: RegisterFingerprintInput): Promise<string> {
  // Simplified perceptual hash generation
  // In production, integrate with image processing library (sharp, jimp, etc.)
  const baseHash = createHash('sha256')
    .update(input.assetId + 'perceptual')
    .digest('hex');
  
  return baseHash.substring(0, 32);  // 128-bit hash
}

/**
 * Generate waveform signature for audio
 */
async function generateWaveformSignature(input: RegisterFingerprintInput): Promise<string> {
  // Simplified audio fingerprinting
  // In production, integrate with audio fingerprinting library (Chromaprint, etc.)
  const baseHash = createHash('sha256')
    .update(input.assetId + 'waveform')
    .digest('hex');
  
  return baseHash.substring(0, 32);
}

/**
 * Generate file checksum
 */
function generateFileChecksum(fileData: Buffer): string {
  return createHash('sha256')
    .update(fileData)
    .digest('hex');
}

// ============================================================================
// FINGERPRINT MATCHING
// ============================================================================

/**
 * Match fingerprint against existing fingerprints
 * Returns matches and determines action
 */
export async function matchFingerprint(
  fingerprintId: string
): Promise<{
  matches: FingerprintMatch[];
  action: 'ALLOWED' | 'BLOCKED' | 'FLAGGED';
  blockReason?: string;
}> {
  const fingerprint = await getFingerprint(fingerprintId);
  if (!fingerprint) {
    throw new Error('Fingerprint not found');
  }
  
  // Search for similar fingerprints
  const matches = await findSimilarFingerprints(fingerprint);
  
  // Determine action based on matches
  if (matches.length === 0) {
    return { matches: [], action: 'ALLOWED' };
  }
  
  // Check if any match requires blocking
  const blockingMatch = matches.find(m => 
    !m.isSameUser && 
    !m.isTeamMember && 
    m.confidenceScore >= (DEFAULT_IP_CONFIG.exactMatchThreshold || 0.95)
  );
  
  if (blockingMatch) {
    return {
      matches,
      action: 'BLOCKED',
      blockReason: 'Exact match with existing content from different user',
    };
  }
  
  // Flag potential matches for review
  const suspiciousMatch = matches.find(m => 
    !m.isSameUser && 
    m.confidenceScore >= (DEFAULT_IP_CONFIG.perceptualMatchThreshold || 0.85)
  );
  
  if (suspiciousMatch) {
    return {
      matches,
      action: 'FLAGGED',
      blockReason: 'Potential copyright infringement detected',
    };
  }
  
  return { matches, action: 'ALLOWED' };
}

/**
 * Find similar fingerprints in database
 */
async function findSimilarFingerprints(
  fingerprint: IPFingerprint
): Promise<FingerprintMatch[]> {
  const matches: FingerprintMatch[] = [];
  
  // Query fingerprints of same asset type
  const existingFingerprints = await db
    .collection('ip_fingerprints')
    .where('assetType', '==', fingerprint.assetType)
    .where('status', '==', 'ACTIVE')
    .get();
  
  for (const doc of existingFingerprints.docs) {
    const existing = doc.data() as IPFingerprint;
    
    // Skip self
    if (existing.fingerprintId === fingerprint.fingerprintId) {
      continue;
    }
    
    // Check for matches
    const matchResult = compareFingerprints(fingerprint, existing);
    
    if (matchResult.isMatch) {
      const match: FingerprintMatch = {
        matchId: generateId(),
        originalFingerprintId: existing.fingerprintId,
        matchedFingerprintId: fingerprint.fingerprintId,
        matchType: matchResult.matchType,
        confidenceScore: matchResult.confidenceScore,
        similarity: matchResult.similarity,
        matchedUserId: fingerprint.ownerUserId,
        originalOwnerId: existing.ownerUserId,
        isSameUser: fingerprint.ownerUserId === existing.ownerUserId,
        isTeamMember: await checkTeamMembership(fingerprint.ownerUserId, existing.ownerUserId),
        detectionMethod: matchResult.method,
        matchedAt: serverTimestamp() as any,
        actionTaken: 'FLAGGED',
      };
      
      matches.push(match);
      
      // Store match record
      await db.collection('fingerprint_matches').doc(match.matchId).set(match);
    }
  }
  
  return matches;
}

/**
 * Compare two fingerprints
 */
function compareFingerprints(
  fp1: IPFingerprint,
  fp2: IPFingerprint
): {
  isMatch: boolean;
  matchType: FingerprintMatch['matchType'];
  confidenceScore: number;
  similarity: number;
  method: FingerprintMethod;
} {
  // Exact content hash match
  if (fp1.contentHash === fp2.contentHash) {
    return {
      isMatch: true,
      matchType: 'EXACT',
      confidenceScore: 1.0,
      similarity: 100,
      method: 'TEXT_HASH',
    };
  }
  
  // Perceptual hash match (images/video)
  if (fp1.perceptualHash && fp2.perceptualHash) {
    const similarity = calculateHashSimilarity(fp1.perceptualHash, fp2.perceptualHash);
    const confidenceScore = similarity / 100;
    
    if (confidenceScore >= (DEFAULT_IP_CONFIG.perceptualMatchThreshold || 0.85)) {
      return {
        isMatch: true,
        matchType: confidenceScore >= 0.95 ? 'EXACT' : 'PERCEPTUAL',
        confidenceScore,
        similarity,
        method: 'PERCEPTUAL_HASH',
      };
    }
  }
  
  // Waveform signature match (audio)
  if (fp1.waveformSignature && fp2.waveformSignature) {
    const similarity = calculateHashSimilarity(fp1.waveformSignature, fp2.waveformSignature);
    const confidenceScore = similarity / 100;
    
    if (confidenceScore >= (DEFAULT_IP_CONFIG.perceptualMatchThreshold || 0.85)) {
      return {
        isMatch: true,
        matchType: confidenceScore >= 0.95 ? 'EXACT' : 'PERCEPTUAL',
        confidenceScore,
        similarity,
        method: 'WAVEFORM_SIGNATURE',
      };
    }
  }
  
  // File checksum match
  if (fp1.fileChecksum && fp2.fileChecksum && fp1.fileChecksum === fp2.fileChecksum) {
    return {
      isMatch: true,
      matchType: 'EXACT',
      confidenceScore: 1.0,
      similarity: 100,
      method: 'FILE_CHECKSUM',
    };
  }
  
  return {
    isMatch: false,
    matchType: 'POTENTIAL',
    confidenceScore: 0,
    similarity: 0,
    method: 'TEXT_HASH',
  };
}

/**
 * Calculate similarity between two hashes
 * Uses Hamming distance for simplified comparison
 */
function calculateHashSimilarity(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    return 0;
  }
  
  let matches = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] === hash2[i]) {
      matches++;
    }
  }
  
  return (matches / hash1.length) * 100;
}

/**
 * Check if users are team members
 */
async function checkTeamMembership(userId1: string, userId2: string): Promise<boolean> {
  // Check if userId2 is part of userId1's team
  const teamCheck = await db
    .collection('team_members')
    .where('teamOwnerId', '==', userId1)
    .where('memberId', '==', userId2)
    .where('status', '==', 'ACTIVE')
    .limit(1)
    .get();
  
  if (!teamCheck.empty) {
    return true;
  }
  
  // Check reverse
  const reverseCheck = await db
    .collection('team_members')
    .where('teamOwnerId', '==', userId2)
    .where('memberId', '==', userId1)
    .where('status', '==', 'ACTIVE')
    .limit(1)
    .get();
  
  return !reverseCheck.empty;
}

// ============================================================================
// DERIVATIVE DETECTION
// ============================================================================

/**
 * Detect if content is a derivative work
 * Checks for resized, recolored, cropped versions
 */
export async function detectDerivative(
  fingerprintId: string
): Promise<{
  isDerivative: boolean;
  originalFingerprintId?: string;
  derivativeType?: 'RESIZED' | 'RECOLORED' | 'CROPPED' | 'FILTERED' | 'WATERMARK_REMOVED';
  confidence: number;
}> {
  const fingerprint = await getFingerprint(fingerprintId);
  if (!fingerprint) {
    throw new Error('Fingerprint not found');
  }
  
  // Only applicable to images and video
  if (fingerprint.assetType !== 'IMAGE' && fingerprint.assetType !== 'VIDEO') {
    return { isDerivative: false, confidence: 0 };
  }
  
  // Find similar fingerprints with lower threshold
  const similarFingerprints = await db
    .collection('ip_fingerprints')
    .where('assetType', '==', fingerprint.assetType)
    .where('status', '==', 'ACTIVE')
    .get();
  
  for (const doc of similarFingerprints.docs) {
    const existing = doc.data() as IPFingerprint;
    
    if (existing.fingerprintId === fingerprintId) {
      continue;
    }
    
    if (existing.ownerUserId === fingerprint.ownerUserId) {
      continue;  // Same user
    }
    
    // Check perceptual similarity
    if (fingerprint.perceptualHash && existing.perceptualHash) {
      const similarity = calculateHashSimilarity(
        fingerprint.perceptualHash,
        existing.perceptualHash
      );
      
      const confidence = similarity / 100;
      
      // Derivative threshold: 70-85% similarity
      if (confidence >= (DEFAULT_IP_CONFIG.derivativeMatchThreshold || 0.70) &&
          confidence < (DEFAULT_IP_CONFIG.perceptualMatchThreshold || 0.85)) {
        
        // Determine derivative type based on metadata differences
        const derivativeType = determineDerivativeType(fingerprint, existing);
        
        return {
          isDerivative: true,
          originalFingerprintId: existing.fingerprintId,
          derivativeType,
          confidence,
        };
      }
    }
  }
  
  return { isDerivative: false, confidence: 0 };
}

/**
 * Determine type of derivative work
 */
function determineDerivativeType(
  fp1: IPFingerprint,
  fp2: IPFingerprint
): 'RESIZED' | 'RECOLORED' | 'CROPPED' | 'FILTERED' | 'WATERMARK_REMOVED' {
  // Check dimensions
  if (fp1.dimensions && fp2.dimensions) {
    const aspectRatio1 = fp1.dimensions.width / fp1.dimensions.height;
    const aspectRatio2 = fp2.dimensions.width / fp2.dimensions.height;
    
    if (Math.abs(aspectRatio1 - aspectRatio2) < 0.01) {
      return 'RESIZED';
    } else {
      return 'CROPPED';
    }
  }
  
  // Check watermark
  if (fp2.hasWatermark && !fp1.hasWatermark) {
    return 'WATERMARK_REMOVED';
  }
  
  // Default to filtered
  return 'FILTERED';
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get fingerprint by ID
 */
export async function getFingerprint(fingerprintId: string): Promise<IPFingerprint | null> {
  const doc = await db.collection('ip_fingerprints').doc(fingerprintId).get();
  
  if (!doc.exists) {
    return null;
  }
  
  return doc.data() as IPFingerprint;
}

/**
 * Get all fingerprints for a user
 */
export async function getUserFingerprints(userId: string): Promise<IPFingerprint[]> {
  const snapshot = await db
    .collection('ip_fingerprints')
    .where('ownerUserId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();
  
  return snapshot.docs.map(doc => doc.data() as IPFingerprint);
}

/**
 * Update fingerprint status
 */
export async function updateFingerprintStatus(
  fingerprintId: string,
  status: IPFingerprint['status']
): Promise<void> {
  await db.collection('ip_fingerprints').doc(fingerprintId).update({
    status,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Get fingerprint matches
 */
export async function getFingerprintMatches(
  fingerprintId: string
): Promise<FingerprintMatch[]> {
  const snapshot = await db
    .collection('fingerprint_matches')
    .where('matchedFingerprintId', '==', fingerprintId)
    .orderBy('matchedAt', 'desc')
    .get();
  
  return snapshot.docs.map(doc => doc.data() as FingerprintMatch);
}

/**
 * Block upload based on fingerprint match
 */
export async function blockUploadDueToMatch(
  fingerprintId: string,
  matchId: string,
  reason: string
): Promise<void> {
  // Update fingerprint status
  await updateFingerprintStatus(fingerprintId, 'DISPUTED');
  
  // Update match record
  await db.collection('fingerprint_matches').doc(matchId).update({
    actionTaken: 'BLOCKED',
    blockReason: reason,
  });
  
  // Create notification for uploader
  // (Integration with notification system)
  
  console.log(`[IP Protection] Blocked upload ${fingerprintId} due to match ${matchId}`);
}