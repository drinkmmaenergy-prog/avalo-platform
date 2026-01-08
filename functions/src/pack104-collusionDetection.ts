/**
 * PACK 104 — Anti-Ring & Anti-Collusion Detection
 * Collusion Ring Detection Engine
 * 
 * Detects coordinated groups manipulating earnings through:
 * - Closed payment loops
 * - Device/network sharing
 * - Artificial interaction inflation
 * 
 * NON-NEGOTIABLE: Never reverses completed legitimate earnings
 */

import { db, serverTimestamp, generateId, admin } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  CollusionRing,
  CollusionRiskLevel,
  CollusionSignal,
  DEFAULT_COLLUSION_CONFIG,
  FraudGraphEdge,
} from './pack104-types';
import {
  getUserEdges,
  buildSubgraph,
  getConnectedUsers,
} from './pack104-fraudGraph';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTIONS = {
  COLLUSION_RINGS: 'collusion_rings',
  FRAUD_GRAPH_EDGES: 'fraud_graph_edges',
} as const;

const CONFIG = DEFAULT_COLLUSION_CONFIG;

// ============================================================================
// COLLUSION RING DETECTION
// ============================================================================

/**
 * Detect collusion rings in the fraud graph
 * Uses connected component analysis + risk scoring
 */
export async function detectCollusionRings(): Promise<CollusionRing[]> {
  console.log('[CollusionDetection] Starting ring detection...');
  
  // Get all edges with strong weight
  const strongEdgesQuery = await db.collection(COLLECTIONS.FRAUD_GRAPH_EDGES)
    .where('weight', '>=', CONFIG.strongEdgeThreshold)
    .get();
  
  const strongEdges = strongEdgesQuery.docs.map(doc => doc.data() as FraudGraphEdge);
  
  console.log(`[CollusionDetection] Found ${strongEdges.length} strong edges`);
  
  // Build graph from strong edges
  const graph = buildGraphFromEdges(strongEdges);
  
  // Find connected components (potential rings)
  const components = findConnectedComponents(graph);
  
  console.log(`[CollusionDetection] Found ${components.length} connected components`);
  
  // Analyze each component for collusion risk
  const rings: CollusionRing[] = [];
  
  for (const component of components) {
    // Skip small components
    if (component.length < CONFIG.minRingSize) {
      continue;
    }
    
    const ring = await analyzeComponentForCollusion(component, strongEdges);
    
    if (ring && ring.collusionProbability >= CONFIG.lowRiskThreshold) {
      rings.push(ring);
    }
  }
  
  console.log(`[CollusionDetection] Detected ${rings.length} potential rings`);
  
  return rings;
}

/**
 * Analyze a specific user for collusion ring membership
 */
export async function analyzeUserForCollusion(userId: string): Promise<{
  inRing: boolean;
  rings: string[];
  collusionScore: number;
}> {
  // Get user's edges
  const edges = await getUserEdges(userId);
  const strongEdges = edges.filter(e => e.weight >= CONFIG.strongEdgeThreshold);
  
  if (strongEdges.length === 0) {
    return {
      inRing: false,
      rings: [],
      collusionScore: 0,
    };
  }
  
  // Check if user is in any detected rings
  const ringsQuery = await db.collection(COLLECTIONS.COLLUSION_RINGS)
    .where('memberUserIds', 'array-contains', userId)
    .where('status', 'in', ['DETECTED', 'UNDER_REVIEW', 'CONFIRMED'])
    .get();
  
  const rings = ringsQuery.docs.map(doc => doc.id);
  
  // Calculate personal collusion score
  const connectedUsers = await getConnectedUsers(userId);
  const collusionScore = calculatePersonalCollusionScore(
    edges,
    strongEdges.length,
    connectedUsers.length
  );
  
  return {
    inRing: rings.length > 0,
    rings,
    collusionScore,
  };
}

// ============================================================================
// GRAPH ANALYSIS ALGORITHMS
// ============================================================================

/**
 * Build adjacency list graph from edges
 */
function buildGraphFromEdges(edges: FraudGraphEdge[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  
  edges.forEach(edge => {
    if (!graph.has(edge.userA)) {
      graph.set(edge.userA, new Set());
    }
    if (!graph.has(edge.userB)) {
      graph.set(edge.userB, new Set());
    }
    
    graph.get(edge.userA)!.add(edge.userB);
    graph.get(edge.userB)!.add(edge.userA);
  });
  
  return graph;
}

/**
 * Find connected components using DFS
 */
function findConnectedComponents(graph: Map<string, Set<string>>): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];
  
  const dfs = (node: string, component: string[]) => {
    visited.add(node);
    component.push(node);
    
    const neighbors = graph.get(node) || new Set();
    neighbors.forEach(neighbor => {
      if (!visited.has(neighbor)) {
        dfs(neighbor, component);
      }
    });
  };
  
  graph.forEach((_, node) => {
    if (!visited.has(node)) {
      const component: string[] = [];
      dfs(node, component);
      components.push(component);
    }
  });
  
  return components;
}

/**
 * Analyze a component for collusion characteristics
 */
async function analyzeComponentForCollusion(
  userIds: string[],
  allEdges: FraudGraphEdge[]
): Promise<CollusionRing | null> {
  const ringId = generateId();
  const now = admin.firestore.Timestamp.now();
  
  // Get subgraph for this component
  const componentEdges = allEdges.filter(edge => 
    userIds.includes(edge.userA) && userIds.includes(edge.userB)
  );
  
  // Count internal vs external connections
  const internalEdgeCount = componentEdges.length;
  
  // Get external edges for members (simplified - just count strong edges not in component)
  let externalEdgeCount = 0;
  for (const userId of userIds) {
    const userEdges = await getUserEdges(userId);
    const external = userEdges.filter(edge => {
      const otherUser = edge.userA === userId ? edge.userB : edge.userA;
      return !userIds.includes(otherUser) && edge.weight >= CONFIG.strongEdgeThreshold;
    });
    externalEdgeCount += external.length;
  }
  
  // Calculate characteristics
  const sharedDevices = componentEdges.filter(e => e.edgeType === 'DEVICE').length;
  const sharedIPs = componentEdges.filter(e => e.edgeType === 'NETWORK').length;
  const internalPayments = componentEdges.filter(e => e.edgeType === 'PAYMENT').length;
  
  const totalConnections = internalEdgeCount + externalEdgeCount;
  const isolationScore = totalConnections > 0 
    ? internalEdgeCount / totalConnections 
    : 0;
  
  const avgInternalWeight = componentEdges.length > 0
    ? componentEdges.reduce((sum, e) => sum + e.weight, 0) / componentEdges.length
    : 0;
  
  // Detect collusion signals
  const signals: CollusionSignal[] = [];
  
  if (sharedDevices > 0) {
    signals.push({
      type: 'DEVICE_OVERLAP',
      severity: Math.min(1.0, sharedDevices / userIds.length),
      description: `${sharedDevices} shared device(s) detected across ${userIds.length} users`,
    });
  }
  
  if (sharedIPs > 0) {
    signals.push({
      type: 'NETWORK_OVERLAP',
      severity: Math.min(1.0, sharedIPs / userIds.length * 0.7),
      description: `${sharedIPs} shared network(s) detected`,
    });
  }
  
  if (internalPayments >= 3) {
    signals.push({
      type: 'PAYMENT_LOOP',
      severity: Math.min(1.0, internalPayments / (userIds.length * 2) * 0.8),
      description: `${internalPayments} internal payment edges detected (potential loop)`,
    });
  }
  
  if (isolationScore >= CONFIG.isolationThreshold) {
    signals.push({
      type: 'CLOSED_NETWORK',
      severity: isolationScore,
      description: `High isolation score: ${Math.round(isolationScore * 100)}% internal connections`,
    });
  }
  
  // Calculate collusion probability
  const collusionProbability = calculateCollusionProbability({
    ringSize: userIds.length,
    sharedDevices,
    sharedIPs,
    internalPayments,
    isolationScore,
    avgInternalWeight,
    signalCount: signals.length,
  });
  
  // Determine risk level
  const riskLevel = determineCollusionRiskLevel(collusionProbability);
  
  const ring: CollusionRing = {
    ringId,
    memberUserIds: userIds,
    ringSize: userIds.length,
    detectedAt: now,
    collusionProbability,
    riskLevel,
    characteristics: {
      sharedDevices,
      sharedIPs,
      internalTransactionCount: internalPayments,
      externalTransactionCount: externalEdgeCount,
      avgInternalWeight,
      isolationScore,
    },
    signals,
    status: 'DETECTED',
    updatedAt: now,
  };
  
  // Save to database
  await db.collection(COLLECTIONS.COLLUSION_RINGS).doc(ringId).set(ring);
  
  console.log(`[CollusionDetection] Ring ${ringId}: ${userIds.length} users, probability ${collusionProbability.toFixed(2)}, risk ${riskLevel}`);
  
  return ring;
}

// ============================================================================
// RISK SCORING
// ============================================================================

/**
 * Calculate collusion probability score
 */
function calculateCollusionProbability(params: {
  ringSize: number;
  sharedDevices: number;
  sharedIPs: number;
  internalPayments: number;
  isolationScore: number;
  avgInternalWeight: number;
  signalCount: number;
}): number {
  let score = 0;
  
  // Factor 1: Shared devices (strongest signal) - up to 40%
  if (params.sharedDevices > 0) {
    score += Math.min(0.4, params.sharedDevices / params.ringSize * 0.5);
  }
  
  // Factor 2: Payment loops - up to 30%
  if (params.internalPayments >= 3) {
    score += Math.min(0.3, (params.internalPayments / (params.ringSize * 2)) * 0.4);
  }
  
  // Factor 3: Network isolation - up to 20%
  if (params.isolationScore >= CONFIG.isolationThreshold) {
    score += Math.min(0.2, (params.isolationScore - CONFIG.isolationThreshold) * 0.5);
  }
  
  // Factor 4: Edge strength - up to 10%
  if (params.avgInternalWeight >= 0.8) {
    score += 0.1;
  }
  
  // Bonus: Multiple signal types
  if (params.signalCount >= 3) {
    score += 0.1;
  }
  
  return Math.min(1.0, score);
}

/**
 * Calculate personal collusion score for individual user
 */
function calculatePersonalCollusionScore(
  allEdges: FraudGraphEdge[],
  strongEdgeCount: number,
  totalConnections: number
): number {
  if (totalConnections === 0) return 0;
  
  const deviceEdges = allEdges.filter(e => e.edgeType === 'DEVICE').length;
  const paymentEdges = allEdges.filter(e => e.edgeType === 'PAYMENT').length;
  
  let score = 0;
  
  // Strong connections
  score += Math.min(0.4, (strongEdgeCount / totalConnections) * 0.5);
  
  // Device sharing
  if (deviceEdges > 0) {
    score += Math.min(0.3, deviceEdges * 0.15);
  }
  
  // Payment patterns
  if (paymentEdges >= 3) {
    score += Math.min(0.3, paymentEdges * 0.1);
  }
  
  return Math.min(1.0, score);
}

/**
 * Determine risk level from probability
 */
function determineCollusionRiskLevel(probability: number): CollusionRiskLevel {
  if (probability >= CONFIG.highRiskThreshold) {
    return 'HIGH';
  } else if (probability >= CONFIG.mediumRiskThreshold) {
    return 'MEDIUM';
  } else if (probability >= CONFIG.lowRiskThreshold) {
    return 'LOW';
  }
  return 'NONE';
}

// ============================================================================
// RING MANAGEMENT
// ============================================================================

/**
 * Get collusion ring by ID
 */
export async function getCollusionRing(ringId: string): Promise<CollusionRing | null> {
  const ringDoc = await db.collection(COLLECTIONS.COLLUSION_RINGS).doc(ringId).get();
  
  if (!ringDoc.exists) {
    return null;
  }
  
  return ringDoc.data() as CollusionRing;
}

/**
 * Update ring status (e.g., after manual review)
 */
export async function updateRingStatus(
  ringId: string,
  status: CollusionRing['status'],
  reviewerId?: string,
  notes?: string
): Promise<void> {
  const updates: any = {
    status,
    updatedAt: serverTimestamp(),
  };
  
  if (reviewerId) {
    updates.reviewedBy = reviewerId;
    updates.reviewedAt = serverTimestamp();
  }
  
  if (notes) {
    updates.reviewNotes = notes;
  }
  
  await db.collection(COLLECTIONS.COLLUSION_RINGS).doc(ringId).update(updates);
  
  console.log(`[CollusionDetection] Ring ${ringId} status updated to ${status}`);
}

/**
 * Get all detected rings with minimum risk level
 */
export async function getDetectedRings(
  minRiskLevel: CollusionRiskLevel = 'LOW'
): Promise<CollusionRing[]> {
  const riskLevels: CollusionRiskLevel[] = [];
  
  if (minRiskLevel === 'LOW') {
    riskLevels.push('LOW', 'MEDIUM', 'HIGH');
  } else if (minRiskLevel === 'MEDIUM') {
    riskLevels.push('MEDIUM', 'HIGH');
  } else if (minRiskLevel === 'HIGH') {
    riskLevels.push('HIGH');
  }
  
  const query = await db.collection(COLLECTIONS.COLLUSION_RINGS)
    .where('riskLevel', 'in', riskLevels)
    .where('status', 'in', ['DETECTED', 'UNDER_REVIEW'])
    .orderBy('collusionProbability', 'desc')
    .limit(100)
    .get();
  
  return query.docs.map(doc => doc.data() as CollusionRing);
}

/**
 * Clean up old resolved/false positive rings
 */
export async function cleanupOldRings(daysOld: number = 90): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);
  
  const query = await db.collection(COLLECTIONS.COLLUSION_RINGS)
    .where('status', 'in', ['FALSE_POSITIVE'])
    .where('updatedAt', '<', cutoffTimestamp)
    .limit(100)
    .get();
  
  const batch = db.batch();
  query.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  
  console.log(`[CollusionDetection] Cleaned up ${query.size} old rings`);
  
  return query.size;
}