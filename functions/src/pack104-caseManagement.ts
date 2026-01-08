/**
 * PACK 104 — Anti-Ring & Anti-Collusion Detection
 * Case Generation & Prioritization System
 * 
 * Automatically creates moderation cases for detected rings/clusters
 * Prioritizes based on risk factors and connects to PACK 103 governance
 * 
 * NON-NEGOTIABLE: Cases track evidence but never directly control funds
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  ClusterModerationCase,
  ClusterCasePriority,
  ClusterResolution,
  CollusionRing,
  CommercialSpamCluster,
} from './pack104-types';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTIONS = {
  CLUSTER_CASES: 'cluster_moderation_cases',
  COLLUSION_RINGS: 'collusion_rings',
  SPAM_CLUSTERS: 'commercial_spam_clusters',
  MODERATION_CASES: 'moderation_cases',  // PACK 103 cases
} as const;

// ============================================================================
// CASE GENERATION
// ============================================================================

/**
 * Create moderation case for collusion ring
 */
export async function createCollusionRingCase(ringId: string): Promise<string> {
  console.log(`[CaseManagement] Creating case for collusion ring ${ringId}`);
  
  const ringDoc = await db.collection(COLLECTIONS.COLLUSION_RINGS).doc(ringId).get();
  
  if (!ringDoc.exists) {
    throw new Error(`Ring ${ringId} not found`);
  }
  
  const ring = ringDoc.data() as CollusionRing;
  
  // Check if case already exists
  const existingCaseQuery = await db.collection(COLLECTIONS.CLUSTER_CASES)
    .where('ringId', '==', ringId)
    .where('status', 'in', ['OPEN', 'UNDER_REVIEW'])
    .limit(1)
    .get();
  
  if (!existingCaseQuery.empty) {
    const existingCase = existingCaseQuery.docs[0];
    console.log(`[CaseManagement] Case already exists: ${existingCase.id}`);
    return existingCase.id;
  }
  
  // Generate case
  const caseId = generateId();
  const now = serverTimestamp();
  
  // Determine priority
  const priority = determinePriorityForRing(ring);
  
  // Build evidence summary
  const evidenceSummary = {
    graphSnapshot: JSON.stringify({
      ringSize: ring.ringSize,
      characteristics: ring.characteristics,
    }),
    riskFeatures: ring.signals.map(s => `${s.type}: ${s.description}`),
    signalsSummary: `${ring.signals.length} signals detected with ${Math.round(ring.collusionProbability * 100)}% probability`,
  };
  
  // Determine priority factors
  const priorityFactors = {
    minorSafetyRisk: false,  // Would need additional data to determine
    financialClusterDepth: ring.characteristics.internalTransactionCount,
    crossRegionSpread: false,  // Would need geographic data
    coordinatedViolations: ring.characteristics.sharedDevices > 0,
  };
  
  const moderationCase: ClusterModerationCase = {
    caseId,
    caseType: 'COLLUSION_RING',
    ringId,
    linkedUserIds: ring.memberUserIds,
    priority,
    openedAt: now as any,
    openedBy: 'AUTO',
    status: 'OPEN',
    evidenceSummary,
    priorityFactors,
    updatedAt: now as any,
  };
  
  await db.collection(COLLECTIONS.CLUSTER_CASES).doc(caseId).set(moderationCase);
  
  // Update ring with case ID
  await db.collection(COLLECTIONS.COLLUSION_RINGS).doc(ringId).update({
    moderationCaseId: caseId,
    updatedAt: now,
  });
  
  console.log(`[CaseManagement] Created case ${caseId} for ring ${ringId} with priority ${priority}`);
  
  return caseId;
}

/**
 * Create moderation case for spam cluster
 */
export async function createSpamClusterCase(clusterId: string): Promise<string> {
  console.log(`[CaseManagement] Creating case for spam cluster ${clusterId}`);
  
  const clusterDoc = await db.collection(COLLECTIONS.SPAM_CLUSTERS).doc(clusterId).get();
  
  if (!clusterDoc.exists) {
    throw new Error(`Cluster ${clusterId} not found`);
  }
  
  const cluster = clusterDoc.data() as CommercialSpamCluster;
  
  // Check if case already exists
  const existingCaseQuery = await db.collection(COLLECTIONS.CLUSTER_CASES)
    .where('clusterId', '==', clusterId)
    .where('status', 'in', ['OPEN', 'UNDER_REVIEW'])
    .limit(1)
    .get();
  
  if (!existingCaseQuery.empty) {
    const existingCase = existingCaseQuery.docs[0];
    console.log(`[CaseManagement] Case already exists: ${existingCase.id}`);
    return existingCase.id;
  }
  
  // Generate case
  const caseId = generateId();
  const now = serverTimestamp();
  
  // Determine priority
  const priority = determinePriorityForCluster(cluster);
  
  // Build evidence summary
  const evidenceSummary = {
    graphSnapshot: JSON.stringify({
      clusterSize: cluster.clusterSize,
      characteristics: cluster.characteristics,
    }),
    riskFeatures: cluster.signals.map(s => `${s.type}: ${s.description}`),
    signalsSummary: `${cluster.signals.length} signals detected with ${Math.round(cluster.spamProbability * 100)}% probability`,
  };
  
  // Determine priority factors
  const priorityFactors = {
    minorSafetyRisk: false,
    financialClusterDepth: 0,  // Spam clusters typically don't have financial patterns
    crossRegionSpread: false,
    coordinatedViolations: cluster.characteristics.bioSimilarityScore > 0.8,
  };
  
  const moderationCase: ClusterModerationCase = {
    caseId,
    caseType: 'COMMERCIAL_SPAM_CLUSTER',
    clusterId,
    linkedUserIds: cluster.memberUserIds,
    priority,
    openedAt: now as any,
    openedBy: 'AUTO',
    status: 'OPEN',
    evidenceSummary,
    priorityFactors,
    updatedAt: now as any,
  };
  
  await db.collection(COLLECTIONS.CLUSTER_CASES).doc(caseId).set(moderationCase);
  
  // Update cluster with case ID
  await db.collection(COLLECTIONS.SPAM_CLUSTERS).doc(clusterId).update({
    moderationCaseId: caseId,
    updatedAt: now,
  });
  
  console.log(`[CaseManagement] Created case ${caseId} for cluster ${clusterId} with priority ${priority}`);
  
  return caseId;
}

// ============================================================================
// PRIORITY DETERMINATION
// ============================================================================

/**
 * Determine priority for collusion ring case
 */
function determinePriorityForRing(ring: CollusionRing): ClusterCasePriority {
  let priorityScore = 0;
  
  // Factor 1: Risk level
  if (ring.riskLevel === 'HIGH') {
    priorityScore += 40;
  } else if (ring.riskLevel === 'MEDIUM') {
    priorityScore += 20;
  } else if (ring.riskLevel === 'LOW') {
    priorityScore += 10;
  }
  
  // Factor 2: Ring size (larger rings are higher priority)
  if (ring.ringSize >= 10) {
    priorityScore += 30;
  } else if (ring.ringSize >= 5) {
    priorityScore += 15;
  }
  
  // Factor 3: Financial activity
  if (ring.characteristics.internalTransactionCount >= 20) {
    priorityScore += 20;
  } else if (ring.characteristics.internalTransactionCount >= 10) {
    priorityScore += 10;
  }
  
  // Factor 4: Device sharing (strongest collusion signal)
  if (ring.characteristics.sharedDevices >= 3) {
    priorityScore += 10;
  }
  
  // Determine priority level
  if (priorityScore >= 70) {
    return 'CRITICAL';
  } else if (priorityScore >= 50) {
    return 'HIGH';
  } else if (priorityScore >= 30) {
    return 'MEDIUM';
  }
  return 'LOW';
}

/**
 * Determine priority for spam cluster case
 */
function determinePriorityForCluster(cluster: CommercialSpamCluster): ClusterCasePriority {
  let priorityScore = 0;
  
  // Factor 1: Risk level
  if (cluster.riskLevel === 'HIGH') {
    priorityScore += 40;
  } else if (cluster.riskLevel === 'MEDIUM') {
    priorityScore += 20;
  } else if (cluster.riskLevel === 'LOW') {
    priorityScore += 10;
  }
  
  // Factor 2: Cluster size
  if (cluster.clusterSize >= 20) {
    priorityScore += 30;
  } else if (cluster.clusterSize >= 10) {
    priorityScore += 15;
  }
  
  // Factor 3: Messaging volume
  if (cluster.characteristics.outboundMessageCount >= 500) {
    priorityScore += 20;
  } else if (cluster.characteristics.outboundMessageCount >= 200) {
    priorityScore += 10;
  }
  
  // Factor 4: Rapid creation
  if (cluster.characteristics.accountCreationWindow <= 24) {
    priorityScore += 10;
  }
  
  // Determine priority level
  if (priorityScore >= 70) {
    return 'CRITICAL';
  } else if (priorityScore >= 50) {
    return 'HIGH';
  } else if (priorityScore >= 30) {
    return 'MEDIUM';
  }
  return 'LOW';
}

// ============================================================================
// CASE MANAGEMENT
// ============================================================================

/**
 * Get case by ID
 */
export async function getClusterCase(caseId: string): Promise<ClusterModerationCase | null> {
  const caseDoc = await db.collection(COLLECTIONS.CLUSTER_CASES).doc(caseId).get();
  
  if (!caseDoc.exists) {
    return null;
  }
  
  return caseDoc.data() as ClusterModerationCase;
}

/**
 * Assign case to moderator
 */
export async function assignCase(caseId: string, moderatorId: string): Promise<void> {
  await db.collection(COLLECTIONS.CLUSTER_CASES).doc(caseId).update({
    assignedTo: moderatorId,
    assignedAt: serverTimestamp(),
    status: 'UNDER_REVIEW',
    updatedAt: serverTimestamp(),
  });
  
  console.log(`[CaseManagement] Case ${caseId} assigned to ${moderatorId}`);
}

/**
 * Resolve case with outcome
 */
export async function resolveCase(
  caseId: string,
  resolution: ClusterResolution
): Promise<void> {
  const caseRef = db.collection(COLLECTIONS.CLUSTER_CASES).doc(caseId);
  const caseDoc = await caseRef.get();
  
  if (!caseDoc.exists) {
    throw new Error(`Case ${caseId} not found`);
  }
  
  const moderationCase = caseDoc.data() as ClusterModerationCase;
  
  // Update case
  await caseRef.update({
    status: 'RESOLVED',
    resolution,
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  // Update ring/cluster status based on resolution
  if (moderationCase.ringId) {
    const ringStatus = determineRingStatusFromResolution(resolution.outcome);
    await db.collection(COLLECTIONS.COLLUSION_RINGS).doc(moderationCase.ringId).update({
      status: ringStatus,
      reviewedAt: serverTimestamp(),
      reviewedBy: resolution.reviewedBy,
      reviewNotes: resolution.reviewNote,
      updatedAt: serverTimestamp(),
    });
  }
  
  if (moderationCase.clusterId) {
    const clusterStatus = determineClusterStatusFromResolution(resolution.outcome);
    await db.collection(COLLECTIONS.SPAM_CLUSTERS).doc(moderationCase.clusterId).update({
      status: clusterStatus,
      reviewedAt: serverTimestamp(),
      reviewedBy: resolution.reviewedBy,
      reviewNotes: resolution.reviewNote,
      updatedAt: serverTimestamp(),
    });
  }
  
  console.log(`[CaseManagement] Case ${caseId} resolved with outcome: ${resolution.outcome}`);
}

/**
 * Determine ring status from resolution outcome
 */
function determineRingStatusFromResolution(
  outcome: ClusterResolution['outcome']
): CollusionRing['status'] {
  switch (outcome) {
    case 'NO_ACTION':
      return 'FALSE_POSITIVE';
    case 'SOFT_RESTRICTION':
    case 'TEMPORARY_SUSPENSION':
      return 'UNDER_REVIEW';
    case 'PERMANENT_SUSPENSION':
      return 'CONFIRMED';
    default:
      return 'UNDER_REVIEW';
  }
}

/**
 * Determine cluster status from resolution outcome
 */
function determineClusterStatusFromResolution(
  outcome: ClusterResolution['outcome']
): CommercialSpamCluster['status'] {
  switch (outcome) {
    case 'NO_ACTION':
      return 'FALSE_POSITIVE';
    case 'SOFT_RESTRICTION':
    case 'TEMPORARY_SUSPENSION':
      return 'UNDER_REVIEW';
    case 'PERMANENT_SUSPENSION':
      return 'CONFIRMED';
    default:
      return 'UNDER_REVIEW';
  }
}

/**
 * Get open cases prioritized
 */
export async function getOpenCasesPrioritized(limit: number = 50): Promise<ClusterModerationCase[]> {
  const query = await db.collection(COLLECTIONS.CLUSTER_CASES)
    .where('status', 'in', ['OPEN', 'UNDER_REVIEW'])
    .orderBy('priority', 'desc')
    .orderBy('openedAt', 'asc')
    .limit(limit)
    .get();
  
  return query.docs.map(doc => doc.data() as ClusterModerationCase);
}

/**
 * Get cases assigned to moderator
 */
export async function getModeratorCases(
  moderatorId: string,
  limit: number = 20
): Promise<ClusterModerationCase[]> {
  const query = await db.collection(COLLECTIONS.CLUSTER_CASES)
    .where('assignedTo', '==', moderatorId)
    .where('status', '==', 'UNDER_REVIEW')
    .orderBy('priority', 'desc')
    .limit(limit)
    .get();
  
  return query.docs.map(doc => doc.data() as ClusterModerationCase);
}

/**
 * Escalate case to higher priority
 */
export async function escalateCase(caseId: string, reason: string): Promise<void> {
  const caseDoc = await db.collection(COLLECTIONS.CLUSTER_CASES).doc(caseId).get();
  
  if (!caseDoc.exists) {
    throw new Error(`Case ${caseId} not found`);
  }
  
  const currentCase = caseDoc.data() as ClusterModerationCase;
  
  // Increase priority
  let newPriority: ClusterCasePriority = currentCase.priority;
  
  if (currentCase.priority === 'LOW') {
    newPriority = 'MEDIUM';
  } else if (currentCase.priority === 'MEDIUM') {
    newPriority = 'HIGH';
  } else if (currentCase.priority === 'HIGH') {
    newPriority = 'CRITICAL';
  }
  
  await db.collection(COLLECTIONS.CLUSTER_CASES).doc(caseId).update({
    priority: newPriority,
    status: 'ESCALATED',
    escalationReason: reason,
    updatedAt: serverTimestamp(),
  });
  
  console.log(`[CaseManagement] Case ${caseId} escalated from ${currentCase.priority} to ${newPriority}`);
}

/**
 * Mark cluster for linked group case view
 */
export async function linkUsersInCaseView(caseId: string, userIds: string[]): Promise<void> {
  await db.collection(COLLECTIONS.CLUSTER_CASES).doc(caseId).update({
    linkedUserIds: userIds,
    updatedAt: serverTimestamp(),
  });
  
  console.log(`[CaseManagement] Linked ${userIds.length} users to case ${caseId}`);
}