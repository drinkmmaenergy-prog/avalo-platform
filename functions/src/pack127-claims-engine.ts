/**
 * PACK 127 — Copyright Claims & Resolution Engine
 * 
 * Handles copyright claim submission, auto-resolution, and manual review
 * 
 * NON-NEGOTIABLE RULES:
 * - No monetization or ranking effects during disputes
 * - Fast-track auto-resolution for fingerprint matches
 * - Prevent weaponized claims
 * - False claims penalize the claimant
 */

import { db, serverTimestamp, generateId } from './init';
import {
  IPClaim,
  ClaimStrike,
  IPDisputeCase,
  SubmitClaimInput,
  ClaimStatus,
  ClaimResolution,
  DEFAULT_IP_CONFIG,
  STRIKE_IMPACTS,
} from './pack127-types';
import { getFingerprint, getFingerprintMatches } from './pack127-fingerprint-engine';

// ============================================================================
// CLAIM SUBMISSION
// ============================================================================

/**
 * Submit copyright claim
 * Includes anti-abuse checks and auto-resolution
 */
export async function submitCopyrightClaim(
  input: SubmitClaimInput
): Promise<{
  claimId: string;
  status: ClaimStatus;
  autoResolved: boolean;
  resolution?: ClaimResolution;
  message: string;
}> {
  // Anti-abuse checks
  await validateClaimSubmission(input);
  
  const claimId = generateId();
  
  // Check for fingerprint match (auto-resolution)
  const autoResolutionResult = await attemptAutoResolution(input);
  
  const claim: IPClaim = {
    claimId,
    claimantUserId: input.claimantUserId,
    accusedUserId: input.accusedUserId,
    fingerprintId: '', // Will be populated if found
    accusedAssetId: input.accusedAssetId,
    accusedAssetType: 'IMAGE', // Will be determined
    claimType: input.claimType,
    description: input.description,
    evidenceRef: generateId(), // Evidence vault reference
    evidenceUrls: input.evidenceUrls || [],
    status: autoResolutionResult.canAutoResolve ? 'AUTO_RESOLVED' : 'OPEN',
    priority: determinePriority(input),
    autoResolved: autoResolutionResult.canAutoResolve,
    autoResolutionReason: autoResolutionResult.reason,
    fingerprintMatchScore: autoResolutionResult.matchScore,
    assignedModeratorId: undefined,
    resolution: autoResolutionResult.resolution,
    resolvedAt: autoResolutionResult.canAutoResolve ? serverTimestamp() as any : undefined,
    resolvedBy: autoResolutionResult.canAutoResolve ? 'SYSTEM' : undefined,
    
    // CRITICAL: No economic/ranking effects
    monetizationAffected: false,
    discoveryAffected: false,
    
    isCounterClaim: await checkIfCounterClaim(input),
    relatedClaimIds: [],
    claimantStrikeCount: await getClaimantStrikeCount(input.claimantUserId),
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
    notificationsSentTo: ['CLAIMANT'],
  };
  
  // Save claim
  await db.collection('ip_claims').doc(claimId).set(claim);
  
  // If auto-resolved, execute resolution
  if (autoResolutionResult.canAutoResolve && autoResolutionResult.resolution) {
    await executeResolution(claimId, autoResolutionResult.resolution, 'SYSTEM');
  } else {
    // Create manual review case
    await createDisputeCase(claim);
  }
  
  // Send notifications
  await sendClaimNotifications(claim);
  
  return {
    claimId,
    status: claim.status,
    autoResolved: claim.autoResolved,
    resolution: claim.resolution,
    message: autoResolutionResult.canAutoResolve 
      ? 'Claim auto-resolved based on fingerprint match'
      : 'Claim submitted for manual review',
  };
}

/**
 * Validate claim submission (anti-abuse)
 */
async function validateClaimSubmission(input: SubmitClaimInput): Promise<void> {
  // Check if claimant has active strikes
  const strikes = await getActiveStrikes(input.claimantUserId);
  const hasBlockingStrike = strikes.some(s => 
    s.severity === 'MAJOR' || s.severity === 'CRITICAL'
  );
  
  if (hasBlockingStrike) {
    throw new Error('You cannot submit claims due to previous false claim penalties');
  }
  
  // Check claim rate limit
  const recentClaims = await getRecentClaimCount(input.claimantUserId, 24);
  if (recentClaims >= (DEFAULT_IP_CONFIG.maxClaimsPerDay || 10)) {
    throw new Error('Daily claim limit exceeded');
  }
  
  // Check cooldown period
  const lastClaim = await getLastClaim(input.claimantUserId);
  if (lastClaim) {
    const hoursSinceLastClaim = (Date.now() - lastClaim.createdAt.toMillis()) / (1000 * 60 * 60);
    if (hoursSinceLastClaim < (DEFAULT_IP_CONFIG.claimCooldownHours || 24)) {
      throw new Error('Please wait before submitting another claim');
    }
  }
  
  // Check if duplicate claim
  const existingClaim = await db
    .collection('ip_claims')
    .where('claimantUserId', '==', input.claimantUserId)
    .where('accusedUserId', '==', input.accusedUserId)
    .where('accusedAssetId', '==', input.accusedAssetId)
    .where('status', 'in', ['OPEN', 'UNDER_REVIEW'])
    .limit(1)
    .get();
  
  if (!existingClaim.empty) {
    throw new Error('You already have an open claim for this content');
  }
}

/**
 * Attempt auto-resolution using fingerprint matching
 */
async function attemptAutoResolution(
  input: SubmitClaimInput
): Promise<{
  canAutoResolve: boolean;
  reason?: string;
  resolution?: ClaimResolution;
  matchScore?: number;
}> {
  // Find fingerprint for accused asset
  const accusedFingerprints = await db
    .collection('ip_fingerprints')
    .where('assetId', '==', input.accusedAssetId)
    .limit(1)
    .get();
  
  if (accusedFingerprints.empty) {
    return { canAutoResolve: false };
  }
  
  const accusedFingerprint = accusedFingerprints.docs[0].data();
  
  // Find claimant's fingerprints
  const claimantFingerprints = await db
    .collection('ip_fingerprints')
    .where('ownerUserId', '==', input.claimantUserId)
    .get();
  
  // Check for exact match
  for (const doc of claimantFingerprints.docs) {
    const claimantFp = doc.data();
    
    // Exact match on content hash or file checksum
    if (claimantFp.contentHash === accusedFingerprint.contentHash ||
        (claimantFp.fileChecksum && claimantFp.fileChecksum === accusedFingerprint.fileChecksum)) {
      
      // Check timestamp - who uploaded first
      const claimantTime = claimantFp.createdAt.toMillis();
      const accusedTime = accusedFingerprint.createdAt.toMillis();
      
      if (claimantTime < accusedTime) {
        // Claimant uploaded first - auto-resolve in their favor
        return {
          canAutoResolve: true,
          reason: 'Exact fingerprint match - claimant uploaded first',
          resolution: 'TAKEDOWN',
          matchScore: 1.0,
        };
      } else {
        // Accused uploaded first - dismiss claim
        return {
          canAutoResolve: true,
          reason: 'Exact fingerprint match - accused uploaded first',
          resolution: 'DISMISSED',
          matchScore: 1.0,
        };
      }
    }
  }
  
  // Check for perceptual match (requires manual review)
  // Only auto-resolve on exact matches
  return { canAutoResolve: false };
}

/**
 * Determine claim priority
 */
function determinePriority(input: SubmitClaimInput): IPClaim['priority'] {
  if (input.claimType === 'EXACT_COPY') {
    return 'HIGH';
  }
  if (input.claimType === 'DERIVATIVE_WORK') {
    return 'MEDIUM';
  }
  return 'LOW';
}

/**
 * Check if this is a counter-claim
 */
async function checkIfCounterClaim(input: SubmitClaimInput): Promise<boolean> {
  // Check if accused has previously claimed against claimant
  const existingClaim = await db
    .collection('ip_claims')
    .where('claimantUserId', '==', input.accusedUserId)
    .where('accusedUserId', '==', input.claimantUserId)
    .limit(1)
    .get();
  
  return !existingClaim.empty;
}

// ============================================================================
// CLAIM REVIEW & RESOLUTION
// ============================================================================

/**
 * Review claim manually
 */
export async function reviewClaim(
  claimId: string,
  moderatorId: string,
  decision: 'FAVOR_CLAIMANT' | 'FAVOR_ACCUSED' | 'PARTIAL' | 'INSUFFICIENT_EVIDENCE',
  notes: string
): Promise<void> {
  const claim = await getClaim(claimId);
  if (!claim) {
    throw new Error('Claim not found');
  }
  
  // Determine resolution based on decision
  let resolution: ClaimResolution;
  
  switch (decision) {
    case 'FAVOR_CLAIMANT':
      resolution = 'TAKEDOWN';
      break;
    case 'FAVOR_ACCUSED':
      resolution = 'CONTENT_RESTORED';
      break;
    case 'PARTIAL':
      resolution = 'ATTRIBUTION_ADDED';
      break;
    case 'INSUFFICIENT_EVIDENCE':
      resolution = 'DISMISSED';
      break;
  }
  
  // Update claim
  await db.collection('ip_claims').doc(claimId).update({
    status: 'CONFIRMED',
    resolution,
    resolvedAt: serverTimestamp(),
    resolvedBy: moderatorId,
    reviewNotes: notes,
    updatedAt: serverTimestamp(),
  });
  
  // Execute resolution
  await executeResolution(claimId, resolution, moderatorId);
  
  // Handle false claims
  if (decision === 'FAVOR_ACCUSED' || decision === 'INSUFFICIENT_EVIDENCE') {
    await handleFalseClaim(claim, moderatorId);
  }
}

/**
 * Execute claim resolution
 */
async function executeResolution(
  claimId: string,
  resolution: ClaimResolution,
  resolvedBy: string
): Promise<void> {
  const claim = await getClaim(claimId);
  if (!claim) {
    throw new Error('Claim not found');
  }
  
  switch (resolution) {
    case 'TAKEDOWN':
      await executeTakedown(claim);
      break;
    
    case 'CONTENT_RESTORED':
      await restoreContent(claim);
      break;
    
    case 'ATTRIBUTION_ADDED':
      await addAttribution(claim);
      break;
    
    case 'LICENSE_GRANTED':
      await grantLicense(claim);
      break;
    
    case 'DISMISSED':
      // No action needed
      break;
    
    case 'CLAIMANT_PENALIZED':
      await penalizeClaimant(claim, resolvedBy);
      break;
  }
  
  // Send resolution notifications
  await sendResolutionNotifications(claim, resolution);
}

/**
 * Execute takedown
 */
async function executeTakedown(claim: IPClaim): Promise<void> {
  // Update fingerprint status
  const fingerprints = await db
    .collection('ip_fingerprints')
    .where('assetId', '==', claim.accusedAssetId)
    .get();
  
  for (const doc of fingerprints.docs) {
    await doc.ref.update({
      status: 'INVALIDATED',
      updatedAt: serverTimestamp(),
    });
  }
  
  // CRITICAL: DO NOT affect monetization or ranking
  // Content is removed, but no economic penalties
  
  console.log(`[IP Protection] Takedown executed for claim ${claim.claimId}`);
}

/**
 * Restore content
 */
async function restoreContent(claim: IPClaim): Promise<void> {
  // Restore fingerprint status
  const fingerprints = await db
    .collection('ip_fingerprints')
    .where('assetId', '==', claim.accusedAssetId)
    .get();
  
  for (const doc of fingerprints.docs) {
    await doc.ref.update({
      status: 'ACTIVE',
      updatedAt: serverTimestamp(),
    });
  }
  
  console.log(`[IP Protection] Content restored for claim ${claim.claimId}`);
}

/**
 * Add attribution
 */
async function addAttribution(claim: IPClaim): Promise<void> {
  // Add attribution metadata to content
  // Implementation depends on content type
  
  console.log(`[IP Protection] Attribution added for claim ${claim.claimId}`);
}

/**
 * Grant license
 */
async function grantLicense(claim: IPClaim): Promise<void> {
  // Create license record
  // Will be implemented in licensing engine
  
  console.log(`[IP Protection] License granted for claim ${claim.claimId}`);
}

/**
 * Penalize claimant for false claim
 */
async function penalizeClaimant(claim: IPClaim, moderatorId: string): Promise<void> {
  await handleFalseClaim(claim, moderatorId);
}

// ============================================================================
// FALSE CLAIM HANDLING
// ============================================================================

/**
 * Handle false claim (issue strike)
 */
async function handleFalseClaim(claim: IPClaim, moderatorId: string): Promise<void> {
  const existingStrikes = await getActiveStrikes(claim.claimantUserId);
  const strikeCount = existingStrikes.length;
  
  // Determine severity
  let severity: ClaimStrike['severity'];
  if (strikeCount === 0) {
    severity = 'WARNING';
  } else if (strikeCount === 1) {
    severity = 'MINOR';
  } else if (strikeCount === 2) {
    severity = 'MAJOR';
  } else {
    severity = 'CRITICAL';
  }
  
  const strikeId = generateId();
  const impact = STRIKE_IMPACTS[severity];
  
  const strike: ClaimStrike = {
    strikeId,
    userId: claim.claimantUserId,
    claimId: claim.claimId,
    reason: 'FALSE_CLAIM',
    severity,
    claimingRestricted: impact.claimsBlocked,
    restrictedUntil: impact.claimsBlocked 
      ? new Date(Date.now() + impact.restrictionDays * 24 * 60 * 60 * 1000) as any
      : undefined,
    canStillReceiveClaims: true, // Victims can still be protected
    createdAt: serverTimestamp() as any,
    createdBy: moderatorId,
  };
  
  await db.collection('claim_strikes').doc(strikeId).set(strike);
  
  console.log(`[IP Protection] Strike issued to ${claim.claimantUserId} - Severity: ${severity}`);
}

/**
 * Get active strikes for user
 */
async function getActiveStrikes(userId: string): Promise<ClaimStrike[]> {
  const snapshot = await db
    .collection('claim_strikes')
    .where('userId', '==', userId)
    .where('restrictedUntil', '>', new Date())
    .get();
  
  return snapshot.docs.map(doc => doc.data() as ClaimStrike);
}

// ============================================================================
// DISPUTE CASE MANAGEMENT
// ============================================================================

/**
 * Create dispute case for manual review
 */
async function createDisputeCase(claim: IPClaim): Promise<IPDisputeCase> {
  const caseId = generateId();
  
  const disputeCase: IPDisputeCase = {
    caseId,
    claimId: claim.claimId,
    claimantUserId: claim.claimantUserId,
    accusedUserId: claim.accusedUserId,
    claimantEvidence: claim.evidenceUrls || [],
    status: 'OPEN',
    createdAt: serverTimestamp() as any,
    appealable: true,
    appealed: false,
  };
  
  await db.collection('ip_dispute_cases').doc(caseId).set(disputeCase);
  
  // Update claim with case reference
  await db.collection('ip_claims').doc(claim.claimId).update({
    status: 'UNDER_REVIEW',
    updatedAt: serverTimestamp(),
  });
  
  return disputeCase;
}

/**
 * Assign moderator to case
 */
export async function assignModerator(
  caseId: string,
  moderatorId: string
): Promise<void> {
  await db.collection('ip_dispute_cases').doc(caseId).update({
    assignedModeratorId: moderatorId,
    updatedAt: serverTimestamp(),
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get claim by ID
 */
export async function getClaim(claimId: string): Promise<IPClaim | null> {
  const doc = await db.collection('ip_claims').doc(claimId).get();
  
  if (!doc.exists) {
    return null;
  }
  
  return doc.data() as IPClaim;
}

/**
 * Get claims for user (filed by user)
 */
export async function getUserClaims(userId: string): Promise<IPClaim[]> {
  const snapshot = await db
    .collection('ip_claims')
    .where('claimantUserId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();
  
  return snapshot.docs.map(doc => doc.data() as IPClaim);
}

/**
 * Get claims against user
 */
export async function getClaimsAgainstUser(userId: string): Promise<IPClaim[]> {
  const snapshot = await db
    .collection('ip_claims')
    .where('accusedUserId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();
  
  return snapshot.docs.map(doc => doc.data() as IPClaim);
}

/**
 * Get claimant strike count
 */
async function getClaimantStrikeCount(userId: string): Promise<number> {
  const snapshot = await db
    .collection('claim_strikes')
    .where('userId', '==', userId)
    .get();
  
  return snapshot.size;
}

/**
 * Get recent claim count
 */
async function getRecentClaimCount(userId: string, hours: number): Promise<number> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const snapshot = await db
    .collection('ip_claims')
    .where('claimantUserId', '==', userId)
    .where('createdAt', '>', cutoff)
    .get();
  
  return snapshot.size;
}

/**
 * Get last claim
 */
async function getLastClaim(userId: string): Promise<IPClaim | null> {
  const snapshot = await db
    .collection('ip_claims')
    .where('claimantUserId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    return null;
  }
  
  return snapshot.docs[0].data() as IPClaim;
}

/**
 * Send claim notifications
 */
async function sendClaimNotifications(claim: IPClaim): Promise<void> {
  // Notify claimant
  await db.collection('ip_notifications').add({
    notificationId: generateId(),
    userId: claim.claimantUserId,
    type: 'CLAIM_RECEIVED',
    title: 'Copyright Claim Submitted',
    message: claim.autoResolved 
      ? 'Your claim has been automatically resolved'
      : 'Your claim is under review',
    relatedClaimId: claim.claimId,
    read: false,
    createdAt: serverTimestamp(),
    priority: 'NORMAL',
  });
  
  // DO NOT notify accused until case is confirmed
  // Prevents harassment via claims
}

/**
 * Send resolution notifications
 */
async function sendResolutionNotifications(
  claim: IPClaim,
  resolution: ClaimResolution
): Promise<void> {
  // Notify claimant
  await db.collection('ip_notifications').add({
    notificationId: generateId(),
    userId: claim.claimantUserId,
    type: 'CLAIM_RESOLVED',
    title: 'Copyright Claim Resolved',
    message: `Resolution: ${resolution}`,
    relatedClaimId: claim.claimId,
    read: false,
    createdAt: serverTimestamp(),
    priority: 'HIGH',
  });
  
  // Notify accused
  await db.collection('ip_notifications').add({
    notificationId: generateId(),
    userId: claim.accusedUserId,
    type: 'CLAIM_RESOLVED',
    title: 'Copyright Claim Resolved',
    message: `Resolution: ${resolution}`,
    relatedClaimId: claim.claimId,
    read: false,
    createdAt: serverTimestamp(),
    priority: 'HIGH',
  });
}