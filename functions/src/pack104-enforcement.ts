/**
 * PACK 104 — Anti-Ring & Anti-Collusion Detection
 * Enforcement Engine for Rings & Clusters
 *
 * Applies graduated enforcement based on detection confidence:
 * - NONE: No action
 * - VISIBILITY_REDUCED: Lower discovery ranking
 * - MONETIZATION_THROTTLED: Temporary earning restrictions
 * - MANUAL_REVIEW_REQUIRED: Hard block until manual review
 *
 * NON-NEGOTIABLE:
 * - Never reverses completed legitimate earnings
 * - No punishment fees or paid bypasses
 * - Enforcement is temporary until cleared
 */

import { db, serverTimestamp, generateId, admin, arrayUnion } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  CollusionEnforcementLevel,
  CollusionEnforcementAction,
  CollusionRing,
  CommercialSpamCluster,
} from './pack104-types';
import { recalculateEnforcementState } from './enforcementEngine';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTIONS = {
  COLLUSION_ENFORCEMENT: 'collusion_enforcement_actions',
  COLLUSION_RINGS: 'collusion_rings',
  SPAM_CLUSTERS: 'commercial_spam_clusters',
  USER_TRUST_PROFILE: 'user_trust_profile',
} as const;

// Enforcement duration (hours)
const ENFORCEMENT_DURATIONS = {
  VISIBILITY_REDUCED: 72,      // 3 days
  MONETIZATION_THROTTLED: 168,  // 7 days
  MANUAL_REVIEW_REQUIRED: null, // Indefinite until manual review
};

// ============================================================================
// ENFORCEMENT LOGIC
// ============================================================================

/**
 * Apply enforcement to collusion ring members
 */
export async function applyCollusionRingEnforcement(ringId: string): Promise<void> {
  console.log(`[CollusionEnforcement] Applying enforcement for ring ${ringId}`);
  
  const ringDoc = await db.collection(COLLECTIONS.COLLUSION_RINGS).doc(ringId).get();
  
  if (!ringDoc.exists) {
    console.error(`[CollusionEnforcement] Ring ${ringId} not found`);
    return;
  }
  
  const ring = ringDoc.data() as CollusionRing;
  
  // Determine enforcement level based on risk
  const enforcementLevel = determineEnforcementLevelForRing(ring);
  
  if (enforcementLevel === 'NONE') {
    console.log(`[CollusionEnforcement] No enforcement needed for ring ${ringId}`);
    return;
  }
  
  // Apply enforcement to each member
  for (const userId of ring.memberUserIds) {
    await applyEnforcementToUser(
      userId,
      enforcementLevel,
      `Collusion ring detection: ${ring.riskLevel} risk`,
      ringId,
      undefined
    );
  }
  
  console.log(`[CollusionEnforcement] Applied ${enforcementLevel} to ${ring.memberUserIds.length} users in ring ${ringId}`);
}

/**
 * Apply enforcement to spam cluster members
 */
export async function applySpamClusterEnforcement(clusterId: string): Promise<void> {
  console.log(`[CollusionEnforcement] Applying enforcement for cluster ${clusterId}`);
  
  const clusterDoc = await db.collection(COLLECTIONS.SPAM_CLUSTERS).doc(clusterId).get();
  
  if (!clusterDoc.exists) {
    console.error(`[CollusionEnforcement] Cluster ${clusterId} not found`);
    return;
  }
  
  const cluster = clusterDoc.data() as CommercialSpamCluster;
  
  // Determine enforcement level based on risk
  const enforcementLevel = determineEnforcementLevelForCluster(cluster);
  
  if (enforcementLevel === 'NONE') {
    console.log(`[CollusionEnforcement] No enforcement needed for cluster ${clusterId}`);
    return;
  }
  
  // Apply enforcement to each member
  for (const userId of cluster.memberUserIds) {
    await applyEnforcementToUser(
      userId,
      enforcementLevel,
      `Commercial spam cluster detection: ${cluster.riskLevel} risk`,
      undefined,
      clusterId
    );
  }
  
  console.log(`[CollusionEnforcement] Applied ${enforcementLevel} to ${cluster.memberUserIds.length} users in cluster ${clusterId}`);
}

/**
 * Apply enforcement to individual user
 */
async function applyEnforcementToUser(
  userId: string,
  level: CollusionEnforcementLevel,
  reason: string,
  ringId?: string,
  clusterId?: string
): Promise<void> {
  const actionId = generateId();
  const now = serverTimestamp();
  
  // Calculate expiry
  let expiresAt: Timestamp | undefined;
  const duration = ENFORCEMENT_DURATIONS[level];
  if (duration) {
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + duration);
    expiresAt = Timestamp.fromDate(expiryDate) as any;
  }
  
  // Create enforcement action record
  const action: CollusionEnforcementAction = {
    actionId,
    targetUserId: userId,
    ringId,
    clusterId,
    enforcementLevel: level,
    reason,
    appliedAt: now as any,
    expiresAt,
    appliedBy: 'SYSTEM',
  };
  
  await db.collection(COLLECTIONS.COLLUSION_ENFORCEMENT).doc(actionId).set(action);
  
  // Log to trust profile (simplified trust event)
  const trustProfileRef = db.collection(COLLECTIONS.USER_TRUST_PROFILE).doc(userId);
  await trustProfileRef.set({
    userId,
    lastEnforcementAction: {
      type: ringId ? 'COLLUSION_RISK' : 'COMMERCIAL_SPAM_RISK',
      severity: getSeverityFromLevel(level),
      enforcementLevel: level,
      timestamp: now,
    },
    updatedAt: now,
  }, { merge: true });
  
  // Apply visibility tier change if needed
  if (level === 'VISIBILITY_REDUCED' || level === 'MONETIZATION_THROTTLED' || level === 'MANUAL_REVIEW_REQUIRED') {
    await applyVisibilityTier(userId, level);
  }
  
  // Apply posting/monetization restrictions if needed
  if (level === 'MONETIZATION_THROTTLED' || level === 'MANUAL_REVIEW_REQUIRED') {
    await applyMonetizationThrottle(userId, level);
  }
  
  // Trigger enforcement state recalculation
  await recalculateEnforcementState(userId);
  
  console.log(`[CollusionEnforcement] Applied ${level} to user ${userId}`);
}

/**
 * Apply visibility tier change
 */
async function applyVisibilityTier(
  userId: string,
  level: CollusionEnforcementLevel
): Promise<void> {
  const trustProfileRef = db.collection(COLLECTIONS.USER_TRUST_PROFILE).doc(userId);
  const trustDoc = await trustProfileRef.get();
  
  if (!trustDoc.exists) {
    // Initialize trust profile
    await trustProfileRef.set({
      userId,
      riskScore: 50,  // Moderate initial score
      flags: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  
  // Add flags based on level
  const flags: string[] = [];
  
  if (level === 'VISIBILITY_REDUCED') {
    flags.push('COLLUSION_RISK_LOW');
  } else if (level === 'MONETIZATION_THROTTLED') {
    flags.push('COLLUSION_RISK_MEDIUM');
  } else if (level === 'MANUAL_REVIEW_REQUIRED') {
    flags.push('COLLUSION_RISK_HIGH');
  }
  
  if (flags.length > 0) {
    await trustProfileRef.update({
      flags: arrayUnion(...flags),
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Apply monetization throttle
 */
async function applyMonetizationThrottle(
  userId: string,
  level: CollusionEnforcementLevel
): Promise<void> {
  // This sets a flag that can be checked by monetization systems
  // The actual earning restrictions are applied through the enforcement state machine
  
  const trustProfileRef = db.collection(COLLECTIONS.USER_TRUST_PROFILE).doc(userId);
  
  await trustProfileRef.set({
    userId,
    monetizationThrottle: true,
    monetizationThrottleLevel: level,
    throttleAppliedAt: serverTimestamp(),
  }, { merge: true });
}

// ============================================================================
// ENFORCEMENT LEVEL DETERMINATION
// ============================================================================

/**
 * Determine enforcement level for collusion ring
 */
function determineEnforcementLevelForRing(ring: CollusionRing): CollusionEnforcementLevel {
  const { riskLevel, collusionProbability } = ring;
  
  // No action for minimal risk
  if (riskLevel === 'NONE' || collusionProbability < 0.3) {
    return 'NONE';
  }
  
  // Low risk: Reduce visibility only
  if (riskLevel === 'LOW') {
    return 'VISIBILITY_REDUCED';
  }
  
  // Medium risk: Throttle monetization temporarily
  if (riskLevel === 'MEDIUM') {
    return 'MONETIZATION_THROTTLED';
  }
  
  // High risk: Require manual review
  if (riskLevel === 'HIGH') {
    return 'MANUAL_REVIEW_REQUIRED';
  }
  
  return 'NONE';
}

/**
 * Determine enforcement level for spam cluster
 */
function determineEnforcementLevelForCluster(cluster: CommercialSpamCluster): CollusionEnforcementLevel {
  const { riskLevel, spamProbability } = cluster;
  
  // No action for minimal risk
  if (riskLevel === 'NONE' || spamProbability < 0.3) {
    return 'NONE';
  }
  
  // Low risk: Reduce visibility only
  if (riskLevel === 'LOW') {
    return 'VISIBILITY_REDUCED';
  }
  
  // Medium risk: Throttle posting/monetization
  if (riskLevel === 'MEDIUM') {
    return 'MONETIZATION_THROTTLED';
  }
  
  // High risk: Require manual review
  if (riskLevel === 'HIGH') {
    return 'MANUAL_REVIEW_REQUIRED';
  }
  
  return 'NONE';
}

/**
 * Get severity level for trust event
 */
function getSeverityFromLevel(level: CollusionEnforcementLevel): 'LOW' | 'MEDIUM' | 'HIGH' {
  switch (level) {
    case 'VISIBILITY_REDUCED':
      return 'LOW';
    case 'MONETIZATION_THROTTLED':
      return 'MEDIUM';
    case 'MANUAL_REVIEW_REQUIRED':
      return 'HIGH';
    default:
      return 'LOW';
  }
}

// ============================================================================
// ENFORCEMENT REMOVAL & APPEALS
// ============================================================================

/**
 * Remove enforcement after manual review clears user
 */
export async function removeEnforcement(
  actionId: string,
  reviewerId: string,
  reason: string
): Promise<void> {
  const actionRef = db.collection(COLLECTIONS.COLLUSION_ENFORCEMENT).doc(actionId);
  const actionDoc = await actionRef.get();
  
  if (!actionDoc.exists) {
    throw new Error(`Enforcement action ${actionId} not found`);
  }
  
  const action = actionDoc.data() as CollusionEnforcementAction;
  
  // Mark as reversed
  await actionRef.update({
    reversedAt: serverTimestamp(),
    reversedBy: reviewerId,
    reversalReason: reason,
  });
  
  // Remove trust flags
  const trustProfileRef = db.collection(COLLECTIONS.USER_TRUST_PROFILE).doc(action.targetUserId);
  const trustDoc = await trustProfileRef.get();
  
  if (trustDoc.exists) {
    const flags = trustDoc.data()?.flags || [];
    const cleanedFlags = flags.filter((f: string) => !f.includes('COLLUSION_RISK'));
    
    await trustProfileRef.update({
      flags: cleanedFlags,
      monetizationThrottle: false,
      updatedAt: serverTimestamp(),
    });
  }
  
  // Recalculate enforcement state
  await recalculateEnforcementState(action.targetUserId);
  
  console.log(`[CollusionEnforcement] Removed enforcement ${actionId} for user ${action.targetUserId}`);
}

/**
 * Check if user has active enforcement
 */
export async function hasActiveEnforcement(userId: string): Promise<{
  hasEnforcement: boolean;
  level?: CollusionEnforcementLevel;
  reason?: string;
  actionId?: string;
}> {
  const now = Date.now();
  
  const actionsQuery = await db.collection(COLLECTIONS.COLLUSION_ENFORCEMENT)
    .where('targetUserId', '==', userId)
    .where('reversedAt', '==', null)
    .orderBy('appliedAt', 'desc')
    .limit(1)
    .get();
  
  if (actionsQuery.empty) {
    return { hasEnforcement: false };
  }
  
  const action = actionsQuery.docs[0].data() as CollusionEnforcementAction;
  
  // Check if expired
  if (action.expiresAt) {
    const expiryTime = action.expiresAt.toMillis();
    if (now > expiryTime) {
      return { hasEnforcement: false };
    }
  }
  
  return {
    hasEnforcement: true,
    level: action.enforcementLevel,
    reason: action.reason,
    actionId: action.actionId,
  };
}

/**
 * Get enforcement actions for a user
 */
export async function getUserEnforcementActions(
  userId: string,
  limit: number = 10
): Promise<CollusionEnforcementAction[]> {
  const query = await db.collection(COLLECTIONS.COLLUSION_ENFORCEMENT)
    .where('targetUserId', '==', userId)
    .orderBy('appliedAt', 'desc')
    .limit(limit)
    .get();
  
  return query.docs.map(doc => doc.data() as CollusionEnforcementAction);
}

/**
 * Clean up expired enforcement actions
 */
export async function cleanupExpiredEnforcements(): Promise<number> {
  const now = Date.now();
  
  const expiredQuery = await db.collection(COLLECTIONS.COLLUSION_ENFORCEMENT)
    .where('expiresAt', '<=', Timestamp.fromMillis(now))
    .where('reversedAt', '==', null)
    .limit(100)
    .get();
  
  let cleaned = 0;
  
  for (const doc of expiredQuery.docs) {
    const action = doc.data() as CollusionEnforcementAction;
    
    // Mark as expired (not reversed, just expired naturally)
    await doc.ref.update({
      expiredNaturally: true,
      updatedAt: serverTimestamp(),
    });
    
    // Recalculate enforcement state for user
    await recalculateEnforcementState(action.targetUserId);
    
    cleaned++;
  }
  
  console.log(`[CollusionEnforcement] Cleaned up ${cleaned} expired enforcements`);
  
  return cleaned;
}