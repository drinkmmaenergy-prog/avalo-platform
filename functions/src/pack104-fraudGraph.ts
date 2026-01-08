/**
 * PACK 104 — Anti-Ring & Anti-Collusion Detection
 * Fraud Graph Engine - Core graph management and edge updates
 * 
 * NON-NEGOTIABLE RULES:
 * - Token price per unit never changes
 * - Revenue split always 65% creator / 35% Avalo
 * - No punishment fees, appeal fees, or paid enforcement bypass
 * - Detection never reduces already-completed legitimate earnings
 */

import { db, serverTimestamp, generateId, admin } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  FraudGraphEdge,
  EdgeType,
  EdgeUpdateInput,
} from './pack104-types';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTIONS = {
  FRAUD_GRAPH_EDGES: 'fraud_graph_edges',
  GRAPH_ANALYSIS: 'fraud_graph_analysis',
} as const;

// Edge decay: reduce weight over time if not reinforced
const EDGE_DECAY_DAYS = 30;
const EDGE_DECAY_RATE = 0.05;  // 5% decay per period

// ============================================================================
// FRAUD GRAPH EDGE MANAGEMENT
// ============================================================================

/**
 * Update or create fraud graph edge between two users
 * Automatically creates bidirectional relationship
 */
export async function updateFraudGraphEdge(input: EdgeUpdateInput): Promise<FraudGraphEdge> {
  const { userA, userB, edgeType, weight = 0.5, metadata = {} } = input;
  
  // Ensure consistent ordering (alphabetical) for edge ID
  const [user1, user2] = [userA, userB].sort();
  const edgeId = `${user1}_${user2}_${edgeType}`;
  
  const edgeRef = db.collection(COLLECTIONS.FRAUD_GRAPH_EDGES).doc(edgeId);
  const edgeDoc = await edgeRef.get();
  
  const now = admin.firestore.Timestamp.now();
  
  if (edgeDoc.exists) {
    // Update existing edge
    const existingEdge = edgeDoc.data() as FraudGraphEdge;
    
    // Reinforce edge: increase weight (capped at 1.0)
    const newWeight = Math.min(1.0, Math.max(existingEdge.weight, weight));
    
    await edgeRef.update({
      weight: newWeight,
      lastSeenAt: now,
      updatedAt: now,
      metadata: {
        ...existingEdge.metadata,
        ...metadata,
      },
    });
    
    const updatedDoc = await edgeRef.get();
    return updatedDoc.data() as FraudGraphEdge;
  } else {
    // Create new edge
    const newEdge: FraudGraphEdge = {
      edgeId,
      userA: user1,
      userB: user2,
      edgeType,
      weight,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      metadata,
    };
    
    await edgeRef.set(newEdge);
    return newEdge;
  }
}

/**
 * Get all edges for a user
 */
export async function getUserEdges(userId: string): Promise<FraudGraphEdge[]> {
  // Query edges where user is either userA or userB
  const edgesAQuery = db.collection(COLLECTIONS.FRAUD_GRAPH_EDGES)
    .where('userA', '==', userId)
    .get();
  
  const edgesBQuery = db.collection(COLLECTIONS.FRAUD_GRAPH_EDGES)
    .where('userB', '==', userId)
    .get();
  
  const [queryA, queryB] = await Promise.all([edgesAQuery, edgesBQuery]);
  
  const edges: FraudGraphEdge[] = [];
  queryA.forEach(doc => edges.push(doc.data() as FraudGraphEdge));
  queryB.forEach(doc => edges.push(doc.data() as FraudGraphEdge));
  
  return edges;
}

/**
 * Get edges between two users
 */
export async function getEdgesBetweenUsers(
  userA: string,
  userB: string
): Promise<FraudGraphEdge[]> {
  const [user1, user2] = [userA, userB].sort();
  
  const query = await db.collection(COLLECTIONS.FRAUD_GRAPH_EDGES)
    .where('userA', '==', user1)
    .where('userB', '==', user2)
    .get();
  
  return query.docs.map(doc => doc.data() as FraudGraphEdge);
}

/**
 * Get strong edges (weight > threshold) for a user
 */
export async function getStrongEdges(
  userId: string,
  weightThreshold: number = 0.7
): Promise<FraudGraphEdge[]> {
  const allEdges = await getUserEdges(userId);
  return allEdges.filter(edge => edge.weight >= weightThreshold);
}

/**
 * Find connected users (direct connections via edges)
 */
export async function getConnectedUsers(userId: string): Promise<string[]> {
  const edges = await getUserEdges(userId);
  const connectedUsers = new Set<string>();
  
  edges.forEach(edge => {
    if (edge.userA === userId) {
      connectedUsers.add(edge.userB);
    } else {
      connectedUsers.add(edge.userA);
    }
  });
  
  return Array.from(connectedUsers);
}

/**
 * Build subgraph for a set of users (all edges between them)
 */
export async function buildSubgraph(userIds: string[]): Promise<FraudGraphEdge[]> {
  const userSet = new Set(userIds);
  const subgraphEdges: FraudGraphEdge[] = [];
  
  // For each pair of users, get their edges
  for (let i = 0; i < userIds.length; i++) {
    for (let j = i + 1; j < userIds.length; j++) {
      const edges = await getEdgesBetweenUsers(userIds[i], userIds[j]);
      subgraphEdges.push(...edges);
    }
  }
  
  return subgraphEdges;
}

// ============================================================================
// EDGE CREATION FROM SIGNALS
// ============================================================================

/**
 * Create edge from shared device signal
 */
export async function createDeviceEdge(
  userA: string,
  userB: string,
  deviceId: string
): Promise<void> {
  await updateFraudGraphEdge({
    userA,
    userB,
    edgeType: 'DEVICE',
    weight: 1.0,  // Strongest signal
    metadata: {
      deviceId,
      signalType: 'SHARED_DEVICE',
    },
  });
}

/**
 * Create edge from shared IP/network signal
 */
export async function createNetworkEdge(
  userA: string,
  userB: string,
  ipHash: string
): Promise<void> {
  await updateFraudGraphEdge({
    userA,
    userB,
    edgeType: 'NETWORK',
    weight: 0.7,  // Strong but not as definitive as device
    metadata: {
      ipHash,
      signalType: 'SHARED_IP',
    },
  });
}

/**
 * Create or update edge from payment/transaction pattern
 */
export async function createPaymentEdge(
  payerId: string,
  receiverId: string,
  transactionData: {
    transactionId: string;
    amount: number;
    timestamp: Timestamp;
  }
): Promise<void> {
  // Check if this is a mutual payment pattern
  const existingEdges = await getEdgesBetweenUsers(payerId, receiverId);
  const existingPaymentEdge = existingEdges.find(e => e.edgeType === 'PAYMENT');
  
  const transactionCount = existingPaymentEdge 
    ? (existingPaymentEdge.metadata.transactionCount || 0) + 1 
    : 1;
  
  // Calculate weight based on transaction frequency
  // More transactions = stronger correlation
  const weight = Math.min(0.9, 0.3 + (transactionCount * 0.1));
  
  await updateFraudGraphEdge({
    userA: payerId,
    userB: receiverId,
    edgeType: 'PAYMENT',
    weight,
    metadata: {
      transactionCount,
      lastTransactionId: transactionData.transactionId,
      lastTransactionAmount: transactionData.amount,
      lastTransactionAt: transactionData.timestamp,
    },
  });
}

/**
 * Create edge from behavioral similarity
 */
export async function createBehaviorEdge(
  userA: string,
  userB: string,
  similarityScore: number,
  behaviorType: string
): Promise<void> {
  await updateFraudGraphEdge({
    userA,
    userB,
    edgeType: 'BEHAVIOR',
    weight: similarityScore,
    metadata: {
      behaviorType,
      signalType: 'BEHAVIORAL_SIMILARITY',
    },
  });
}

/**
 * Create edge from social/audience overlap
 */
export async function createSocialEdge(
  userA: string,
  userB: string,
  overlapData: {
    sharedAudiencePercent: number;
    referralPattern?: string;
  }
): Promise<void> {
  await updateFraudGraphEdge({
    userA,
    userB,
    edgeType: 'SOCIAL',
    weight: overlapData.sharedAudiencePercent,
    metadata: {
      sharedAudiencePercent: overlapData.sharedAudiencePercent,
      referralPattern: overlapData.referralPattern,
      signalType: 'AUDIENCE_OVERLAP',
    },
  });
}

/**
 * Create edge from enforcement correlation
 */
export async function createEnforcementEdge(
  userA: string,
  userB: string,
  reason: string
): Promise<void> {
  await updateFraudGraphEdge({
    userA,
    userB,
    edgeType: 'ENFORCEMENT',
    weight: 0.9,  // High weight for enforcement correlation
    metadata: {
      enforcementLinkReason: reason,
      signalType: 'ENFORCEMENT_CORRELATION',
    },
  });
}

// ============================================================================
// EDGE DECAY & MAINTENANCE
// ============================================================================

/**
 * Apply decay to old edges (scheduled job)
 * Reduces weight of edges that haven't been seen recently
 */
export async function decayStaleEdges(): Promise<{ decayed: number; removed: number }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - EDGE_DECAY_DAYS);
  const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);
  
  const staleEdgesQuery = await db.collection(COLLECTIONS.FRAUD_GRAPH_EDGES)
    .where('lastSeenAt', '<', cutoffTimestamp)
    .limit(500)  // Process in batches
    .get();
  
  let decayed = 0;
  let removed = 0;
  
  const batch = db.batch();
  
  staleEdgesQuery.docs.forEach(doc => {
    const edge = doc.data() as FraudGraphEdge;
    const newWeight = Math.max(0, edge.weight - EDGE_DECAY_RATE);
    
    if (newWeight <= 0.1) {
      // Remove very weak edges
      batch.delete(doc.ref);
      removed++;
    } else {
      // Apply decay
      batch.update(doc.ref, {
        weight: newWeight,
        updatedAt: serverTimestamp(),
      });
      decayed++;
    }
  });
  
  await batch.commit();
  
  console.log(`[FraudGraph] Decay complete: ${decayed} edges decayed, ${removed} removed`);
  
  return { decayed, removed };
}

/**
 * Calculate edge statistics for a user
 */
export async function calculateUserEdgeStats(userId: string): Promise<{
  totalEdges: number;
  strongEdges: number;
  edgesByType: Record<EdgeType, number>;
  avgWeight: number;
}> {
  const edges = await getUserEdges(userId);
  
  const edgesByType: Record<EdgeType, number> = {
    DEVICE: 0,
    NETWORK: 0,
    PAYMENT: 0,
    BEHAVIOR: 0,
    SOCIAL: 0,
    ENFORCEMENT: 0,
  };
  
  let strongEdges = 0;
  let totalWeight = 0;
  
  edges.forEach(edge => {
    edgesByType[edge.edgeType]++;
    if (edge.weight >= 0.7) strongEdges++;
    totalWeight += edge.weight;
  });
  
  return {
    totalEdges: edges.length,
    strongEdges,
    edgesByType,
    avgWeight: edges.length > 0 ? totalWeight / edges.length : 0,
  };
}

/**
 * Delete all edges for a user (for cleanup/testing)
 */
export async function deleteUserEdges(userId: string): Promise<number> {
  const edges = await getUserEdges(userId);
  
  const batch = db.batch();
  edges.forEach(edge => {
    const edgeRef = db.collection(COLLECTIONS.FRAUD_GRAPH_EDGES).doc(edge.edgeId);
    batch.delete(edgeRef);
  });
  
  await batch.commit();
  
  console.log(`[FraudGraph] Deleted ${edges.length} edges for user ${userId}`);
  
  return edges.length;
}