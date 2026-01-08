/**
 * PACK 146 — Piracy Watchlist & Network Detection
 * Track repeat offenders and professional piracy groups
 * 
 * Features:
 * - User risk scoring
 * - Device/network tracking
 * - Professional piracy group detection
 * - Automated enforcement
 */

import { db, serverTimestamp, generateId, increment, arrayUnion } from './init';
import { logger, HttpsError, onCall } from './common';
import { 
  PiracyWatchlistEntry,
  PiracyViolation,
  PiracyEnforcementAction,
  PiracyNetwork,
  PiracyRiskLevel,
  PiracyViolationType 
} from './pack146-types';

// ============================================================================
// WATCHLIST MANAGEMENT
// ============================================================================

/**
 * Add user to piracy watchlist
 */
export async function addToPiracyWatchlist(
  userId: string,
  violation: {
    type: PiracyViolationType;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    contentId?: string;
    originalOwnerId?: string;
    copyrightCaseId?: string;
    isNSFW: boolean;
    evidence: string[];
  }
): Promise<void> {
  
  const watchlistRef = db.collection('piracy_watchlist').doc(userId);
  const watchlistDoc = await watchlistRef.get();
  
  // Create violation record
  const violationRecord: PiracyViolation = {
    violationId: generateId(),
    type: violation.type,
    severity: violation.severity,
    contentId: violation.contentId,
    originalOwnerId: violation.originalOwnerId,
    copyrightCaseId: violation.copyrightCaseId,
    detectedAt: serverTimestamp() as any,
    detectedBy: 'AUTO_SCAN',
    evidence: violation.evidence,
    isNSFWContent: violation.isNSFW,
    resolved: false,
  };
  
  if (watchlistDoc.exists) {
    // Update existing entry
    const currentData = watchlistDoc.data() as PiracyWatchlistEntry;
    const newViolations = [...(currentData.violations || []), violationRecord];
    const totalViolations = newViolations.length;
    
    // Calculate new risk score
    const riskScore = calculateRiskScore(newViolations);
    const riskLevel = determineRiskLevel(riskScore);
    
    // Update counts based on violation type
    const updates: any = {
      violations: newViolations,
      totalViolations,
      lastViolationAt: serverTimestamp(),
      riskScore,
      riskLevel,
      updatedAt: serverTimestamp(),
    };
    
    // Increment specific counters
    switch (violation.type) {
      case 'SCREENSHOT_THEFT':
        updates.screenshotAttempts = increment(1);
        break;
      case 'SCREEN_RECORDING':
        updates.recordingAttempts = increment(1);
        break;
      case 'REPEAT_UPLOADER':
        updates.uploadedStolenContent = increment(1);
        break;
      case 'LEAK_CIRCULATION':
        updates.downloadedAndLeakedContent = increment(1);
        break;
      case 'REFUND_FRAUD':
        updates.refundAbuseCount = increment(1);
        break;
    }
    
    // Check for blacklist threshold
    if (totalViolations >= 3 || violation.isNSFW) {
      updates.isBlacklisted = true;
      updates.blacklistedAt = serverTimestamp();
      updates.blacklistReason = violation.isNSFW 
        ? 'STOLEN_NSFW_ZERO_TOLERANCE' 
        : 'REPEAT_VIOLATIONS';
    }
    
    await watchlistRef.update(updates);
    
    // Apply enforcement if needed
    if (updates.isBlacklisted) {
      await applyWatchlistEnforcement(userId, riskLevel, violation.isNSFW);
    }
  } else {
    // Create new watchlist entry
    const riskScore = calculateRiskScore([violationRecord]);
    const riskLevel = determineRiskLevel(riskScore);
    
    const entry: any = {
      entryId: userId,
      userId,
      riskLevel,
      riskScore,
      violations: [violationRecord],
      totalViolations: 1,
      lastViolationAt: serverTimestamp(),
      deviceFingerprints: [],
      ipAddressHashes: [],
      connectedWallets: [],
      payoutAccountIds: [],
      refundAbuseCount: 0,
      uploadedStolenContent: violation.type === 'REPEAT_UPLOADER' ? 1 : 0,
      downloadedAndLeakedContent: violation.type === 'LEAK_CIRCULATION' ? 1 : 0,
      screenshotAttempts: violation.type === 'SCREENSHOT_THEFT' ? 1 : 0,
      recordingAttempts: violation.type === 'SCREEN_RECORDING' ? 1 : 0,
      isBlacklisted: violation.isNSFW,
      blacklistedAt: violation.isNSFW ? serverTimestamp() : null,
      blacklistReason: violation.isNSFW ? 'STOLEN_NSFW_ZERO_TOLERANCE' : null,
      enforcementActions: [],
      currentRestrictions: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    await watchlistRef.set(entry);
    
    // Apply enforcement for NSFW violations
    if (violation.isNSFW) {
      await applyWatchlistEnforcement(userId, 'CRITICAL', true);
    }
  }
  
  logger.warn(`User ${userId} added to piracy watchlist: ${violation.type}`);
}

/**
 * Calculate risk score based on violations
 */
function calculateRiskScore(violations: PiracyViolation[]): number {
  let score = 0;
  
  for (const violation of violations) {
    // Weight by severity
    switch (violation.severity) {
      case 'CRITICAL':
        score += 30;
        break;
      case 'HIGH':
        score += 20;
        break;
      case 'MEDIUM':
        score += 10;
        break;
      case 'LOW':
        score += 5;
        break;
    }
    
    // Extra weight for NSFW
    if (violation.isNSFWContent) {
      score += 50;
    }
  }
  
  return Math.min(score, 100);
}

/**
 * Determine risk level from score
 */
function determineRiskLevel(score: number): PiracyRiskLevel {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  if (score >= 10) return 'LOW';
  return 'NONE';
}

/**
 * Apply enforcement based on watchlist status
 */
async function applyWatchlistEnforcement(
  userId: string,
  riskLevel: PiracyRiskLevel,
  isNSFW: boolean
): Promise<void> {
  
  const actionId = generateId();
  
  // Determine enforcement level
  let actionType: PiracyEnforcementAction['actionType'];
  let restrictions: PiracyEnforcementAction['restrictions'];
  let isPermanent = false;
  
  if (isNSFW) {
    // Zero tolerance for stolen NSFW
    actionType = 'PERMANENT_BAN';
    isPermanent = true;
    restrictions = {
      uploadBlocked: true,
      downloadBlocked: true,
      monetizationBlocked: true,
      accountFrozen: true,
    };
  } else if (riskLevel === 'CRITICAL') {
    actionType = 'PERMANENT_BAN';
    isPermanent = true;
    restrictions = {
      uploadBlocked: true,
      downloadBlocked: true,
      monetizationBlocked: true,
      accountFrozen: true,
    };
  } else if (riskLevel === 'HIGH') {
    actionType = 'ACCOUNT_SUSPENSION';
    restrictions = {
      uploadBlocked: true,
      downloadBlocked: true,
      monetizationBlocked: true,
      accountFrozen: false,
    };
  } else if (riskLevel === 'MEDIUM') {
    actionType = 'UPLOAD_RESTRICTION';
    restrictions = {
      uploadBlocked: true,
      downloadBlocked: false,
      monetizationBlocked: false,
      accountFrozen: false,
    };
  } else {
    actionType = 'WARNING';
    restrictions = {
      uploadBlocked: false,
      downloadBlocked: false,
      monetizationBlocked: false,
      accountFrozen: false,
    };
  }
  
  const action: any = {
    actionId,
    targetUserId: userId,
    actionType,
    reason: isNSFW ? 'Stolen NSFW content - zero tolerance' : 'Repeated piracy violations',
    restrictions,
    appliedAt: serverTimestamp(),
    expiresAt: isPermanent ? null : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    isPermanent,
    appliedBy: 'SYSTEM',
    canAppeal: !isNSFW,
    appealDeadline: !isNSFW ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
  };
  
  // Store enforcement action
  await db.collection('piracy_enforcement_actions').doc(actionId).set(action);
  
  // Update user account status
  if (actionType === 'PERMANENT_BAN') {
    await db.collection('users').doc(userId).update({
      accountStatus: 'BANNED',
      banReason: 'PIRACY_COPYRIGHT_INFRINGEMENT',
      bannedAt: serverTimestamp(),
    });
  } else if (actionType === 'ACCOUNT_SUSPENSION') {
    await db.collection('users').doc(userId).update({
      accountStatus: 'SUSPENDED',
      suspensionReason: 'PIRACY_COPYRIGHT_INFRINGEMENT',
      suspendedUntil: action.expiresAt,
      suspendedAt: serverTimestamp(),
    });
  }
  
  // Update watchlist with enforcement
  await db.collection('piracy_watchlist').doc(userId).update({
    enforcementActions: increment(1),
    currentRestrictions: Object.keys(restrictions).filter(k => restrictions[k as keyof typeof restrictions]),
    updatedAt: serverTimestamp(),
  });
  
  logger.warn(`Enforcement applied to ${userId}: ${actionType}`);
}

// ============================================================================
// DEVICE & NETWORK TRACKING
// ============================================================================

/**
 * Track device fingerprint
 */
export async function trackDeviceFingerprint(
  userId: string,
  deviceFingerprint: string
): Promise<void> {
  
  const watchlistRef = db.collection('piracy_watchlist').doc(userId);
  
  await watchlistRef.update({
    deviceFingerprints: arrayUnion(deviceFingerprint),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Track IP address
 */
export async function trackIPAddress(
  userId: string,
  ipAddress: string
): Promise<void> {
  
  // Hash IP for privacy
  const crypto = require('crypto');
  const ipHash = crypto.createHash('sha256').update(ipAddress).digest('hex');
  
  const watchlistRef = db.collection('piracy_watchlist').doc(userId);
  
  await watchlistRef.update({
    ipAddressHashes: arrayUnion(ipHash),
    updatedAt: serverTimestamp(),
  });
}

// ============================================================================
// PROFESSIONAL PIRACY GROUP DETECTION
// ============================================================================

/**
 * Detect professional piracy networks
 */
export async function detectPiracyNetworks(): Promise<PiracyNetwork[]> {
  
  const networks: PiracyNetwork[] = [];
  
  // Get all watchlist entries
  const watchlistSnapshot = await db.collection('piracy_watchlist')
    .where('riskLevel', 'in', ['HIGH', 'CRITICAL'])
    .limit(100)
    .get();
  
  const entries = watchlistSnapshot.docs.map(doc => doc.data() as PiracyWatchlistEntry);
  
  // Group by shared fingerprints
  const fingerprintGroups = groupBySharedFingerprints(entries);
  
  for (const group of fingerprintGroups) {
    if (group.length >= 3) {
      // Potential network
      const networkId = generateId();
      
      const characteristics = {
        sharedDeviceFingerprints: countSharedDevices(group),
        sharedIPAddresses: countSharedIPs(group),
        sharedPaymentMethods: 0,
        coordinatedUploads: countCoordinatedActivity(group, 'upload'),
        coordinatedRefunds: countCoordinatedActivity(group, 'refund'),
        contentCirculation: countCoordinatedActivity(group, 'circulation'),
      };
      
      const detectionConfidence = calculateNetworkConfidence(characteristics);
      const riskLevel = determineNetworkRiskLevel(characteristics, detectionConfidence);
      
      const network: any = {
        networkId,
        memberUserIds: group.map(e => e.userId),
        networkSize: group.length,
        detectedAt: serverTimestamp(),
        detectionConfidence,
        characteristics,
        riskLevel,
        isProfessionalGroup: detectionConfidence > 0.8,
        status: 'DETECTED',
        networkBlocked: false,
        membersBlacklisted: 0,
        updatedAt: serverTimestamp(),
      };
      
      networks.push(network as PiracyNetwork);
      
      // Store network
      await db.collection('piracy_networks').doc(networkId).set(network);
      
      logger.warn(`Piracy network detected: ${networkId} with ${group.length} members`);
    }
  }
  
  return networks;
}

/**
 * Group entries by shared fingerprints
 */
function groupBySharedFingerprints(entries: PiracyWatchlistEntry[]): PiracyWatchlistEntry[][] {
  const groups: PiracyWatchlistEntry[][] = [];
  const processed = new Set<string>();
  
  for (const entry of entries) {
    if (processed.has(entry.userId)) continue;
    
    const group: PiracyWatchlistEntry[] = [entry];
    processed.add(entry.userId);
    
    // Find similar entries
    for (const other of entries) {
      if (other.userId === entry.userId || processed.has(other.userId)) continue;
      
      // Check for shared fingerprints
      const sharedDevices = entry.deviceFingerprints.filter(
        d => other.deviceFingerprints.includes(d)
      );
      
      const sharedIPs = entry.ipAddressHashes.filter(
        ip => other.ipAddressHashes.includes(ip)
      );
      
      if (sharedDevices.length > 0 || sharedIPs.length > 0) {
        group.push(other);
        processed.add(other.userId);
      }
    }
    
    if (group.length >= 2) {
      groups.push(group);
    }
  }
  
  return groups;
}

/**
 * Count shared devices
 */
function countSharedDevices(group: PiracyWatchlistEntry[]): number {
  const allDevices = group.flatMap(e => e.deviceFingerprints);
  const uniqueDevices = new Set(allDevices);
  return allDevices.length - uniqueDevices.size;
}

/**
 * Count shared IPs
 */
function countSharedIPs(group: PiracyWatchlistEntry[]): number {
  const allIPs = group.flatMap(e => e.ipAddressHashes);
  const uniqueIPs = new Set(allIPs);
  return allIPs.length - uniqueIPs.size;
}

/**
 * Count coordinated activity
 */
function countCoordinatedActivity(
  group: PiracyWatchlistEntry[],
  type: 'upload' | 'refund' | 'circulation'
): number {
  
  let count = 0;
  
  for (const entry of group) {
    switch (type) {
      case 'upload':
        count += entry.uploadedStolenContent;
        break;
      case 'refund':
        count += entry.refundAbuseCount;
        break;
      case 'circulation':
        count += entry.downloadedAndLeakedContent;
        break;
    }
  }
  
  return count;
}

/**
 * Calculate network detection confidence
 */
function calculateNetworkConfidence(characteristics: any): number {
  let confidence = 0;
  
  if (characteristics.sharedDeviceFingerprints > 0) confidence += 0.3;
  if (characteristics.sharedIPAddresses > 0) confidence += 0.3;
  if (characteristics.coordinatedUploads > 5) confidence += 0.2;
  if (characteristics.contentCirculation > 5) confidence += 0.2;
  
  return Math.min(confidence, 1.0);
}

/**
 * Determine network risk level
 */
function determineNetworkRiskLevel(
  characteristics: any,
  confidence: number
): PiracyRiskLevel {
  
  if (confidence > 0.9) return 'CRITICAL';
  if (confidence > 0.7) return 'HIGH';
  if (confidence > 0.5) return 'MEDIUM';
  return 'LOW';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  addToPiracyWatchlist,
  trackDeviceFingerprint,
  trackIPAddress,
  detectPiracyNetworks,
};