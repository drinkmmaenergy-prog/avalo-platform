/**
 * PACK 46 — Trust Engine & Blocklist Safety Mesh
 * 
 * This module handles:
 * - Trust scoring based on reports, blocks, and behavior patterns
 * - User reporting system
 * - Blocklist management
 * - Risk flag management (SCAM_SUSPECT, HARASSMENT, SPAMMER, GHOSTING_EARNER)
 * - Earn mode eligibility control
 * 
 * IMPORTANT: This is ADDITIVE ONLY - no changes to monetization logic.
 * All thresholds are deterministic and easily tunable.
 */

import { db, serverTimestamp, increment, generateId } from './init.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TrustCounters {
  totalReportsReceived: number;
  totalBlocksReceived: number;
  ghostingEarnSessions: number;
  spamMessageCount: number;
}

export interface TrustState {
  userId: string;
  trustScore: number;              // 0-100
  riskFlags: string[];             // e.g. ["SCAM_SUSPECT", "HARASSMENT"]
  earnModeAllowed: boolean;        // if false, user cannot enable "earns from chat"
  totalReportsReceived: number;
  totalBlocksReceived: number;
  ghostingEarnSessions: number;
  spamMessageCount: number;
  lastUpdatedAt: any; // FirebaseTimestamp
}

export interface Report {
  reportId: string;
  reporterId: string;
  targetId: string;
  reason: 'SCAM' | 'HARASSMENT' | 'SPAM' | 'OTHER';
  messageId?: string;
  createdAt: any; // FirebaseTimestamp
}

export interface BlocklistEntry {
  userId: string;
  blockedUserId: string;
  createdAt: any; // FirebaseTimestamp
}

// ============================================================================
// CORE TRUST COMPUTATION LOGIC (DETERMINISTIC)
// ============================================================================

/**
 * Compute trust state from counters
 * This is a pure function - same inputs always produce same outputs
 */
export function computeTrustState(counters: TrustCounters): TrustState {
  // Start with base trust score
  let trustScore = 80;

  // Apply penalties
  trustScore -= 3 * counters.totalReportsReceived;
  trustScore -= 5 * counters.totalBlocksReceived;
  trustScore -= 4 * counters.ghostingEarnSessions;
  trustScore -= 2 * counters.spamMessageCount;

  // Clamp to [0, 100]
  trustScore = Math.max(0, Math.min(100, trustScore));

  // Determine risk flags
  const riskFlags: string[] = [];
  
  if (counters.totalReportsReceived >= 3) {
    riskFlags.push('SCAM_SUSPECT');
  }
  
  if (counters.totalBlocksReceived >= 5) {
    riskFlags.push('HARASSMENT');
  }
  
  if (counters.spamMessageCount >= 10) {
    riskFlags.push('SPAMMER');
  }
  
  if (counters.ghostingEarnSessions >= 5) {
    riskFlags.push('GHOSTING_EARNER');
  }

  // Determine earn mode eligibility
  const earnModeAllowed = trustScore >= 40 && !riskFlags.includes('GHOSTING_EARNER');

  return {
    userId: '', // Will be set by caller
    trustScore,
    riskFlags,
    earnModeAllowed,
    totalReportsReceived: counters.totalReportsReceived,
    totalBlocksReceived: counters.totalBlocksReceived,
    ghostingEarnSessions: counters.ghostingEarnSessions,
    spamMessageCount: counters.spamMessageCount,
    lastUpdatedAt: serverTimestamp()
  };
}

// ============================================================================
// TRUST STATE MANAGEMENT
// ============================================================================

/**
 * Initialize trust state for a new user
 */
export async function initializeTrustState(userId: string): Promise<TrustState> {
  const initialCounters: TrustCounters = {
    totalReportsReceived: 0,
    totalBlocksReceived: 0,
    ghostingEarnSessions: 0,
    spamMessageCount: 0
  };

  const state = computeTrustState(initialCounters);
  state.userId = userId;

  await db.collection('trust_state').doc(userId).set(state);
  
  return state;
}

/**
 * Get trust state for a user (create if doesn't exist)
 */
export async function getTrustState(userId: string): Promise<TrustState> {
  const doc = await db.collection('trust_state').doc(userId).get();
  
  if (!doc.exists) {
    return await initializeTrustState(userId);
  }
  
  return doc.data() as TrustState;
}

/**
 * Recompute and update trust state based on current counters
 */
async function recomputeTrustState(userId: string): Promise<void> {
  const doc = await db.collection('trust_state').doc(userId).get();
  
  if (!doc.exists) {
    await initializeTrustState(userId);
    return;
  }

  const currentState = doc.data() as TrustState;
  
  const counters: TrustCounters = {
    totalReportsReceived: currentState.totalReportsReceived,
    totalBlocksReceived: currentState.totalBlocksReceived,
    ghostingEarnSessions: currentState.ghostingEarnSessions,
    spamMessageCount: currentState.spamMessageCount
  };

  const newState = computeTrustState(counters);
  
  // Update only computed fields
  await db.collection('trust_state').doc(userId).update({
    trustScore: newState.trustScore,
    riskFlags: newState.riskFlags,
    earnModeAllowed: newState.earnModeAllowed,
    lastUpdatedAt: serverTimestamp()
  });
}

// ============================================================================
// REPORT SYSTEM
// ============================================================================

/**
 * Submit a report against another user
 */
export async function submitReport(params: {
  reporterId: string;
  targetId: string;
  reason: 'SCAM' | 'HARASSMENT' | 'SPAM' | 'OTHER';
  messageId?: string;
}): Promise<{ ok: boolean; reportId: string }> {
  const { reporterId, targetId, reason, messageId } = params;

  // Validate: cannot report self
  if (reporterId === targetId) {
    throw new Error('Cannot report yourself');
  }

  const reportId = generateId();
  
  const report: Report = {
    reportId,
    reporterId,
    targetId,
    reason,
    messageId,
    createdAt: serverTimestamp()
  };

  // Write report
  await db.collection('reports').doc(reportId).set(report);

  // Increment counter for target
  const targetRef = db.collection('trust_state').doc(targetId);
  const targetDoc = await targetRef.get();
  
  if (!targetDoc.exists) {
    await initializeTrustState(targetId);
  }
  
  await targetRef.update({
    totalReportsReceived: increment(1),
    lastUpdatedAt: serverTimestamp()
  });

  // Recompute trust state
  await recomputeTrustState(targetId);

  return { ok: true, reportId };
}

// ============================================================================
// BLOCKLIST SYSTEM
// ============================================================================

/**
 * Block a user
 */
export async function blockUser(params: {
  userId: string;
  blockedUserId: string;
}): Promise<{ ok: boolean }> {
  const { userId, blockedUserId } = params;

  // Validate: cannot block self
  if (userId === blockedUserId) {
    throw new Error('Cannot block yourself');
  }

  // Check if already blocked (idempotent)
  const blockRef = db.collection('users').doc(userId)
    .collection('blocklist').doc(blockedUserId);
  
  const blockDoc = await blockRef.get();
  
  if (blockDoc.exists) {
    // Already blocked, return success
    return { ok: true };
  }

  // Create blocklist entry
  const entry: BlocklistEntry = {
    userId,
    blockedUserId,
    createdAt: serverTimestamp()
  };

  await blockRef.set(entry);

  // Increment block counter for blocked user
  const targetRef = db.collection('trust_state').doc(blockedUserId);
  const targetDoc = await targetRef.get();
  
  if (!targetDoc.exists) {
    await initializeTrustState(blockedUserId);
  }
  
  await targetRef.update({
    totalBlocksReceived: increment(1),
    lastUpdatedAt: serverTimestamp()
  });

  // Recompute trust state
  await recomputeTrustState(blockedUserId);

  return { ok: true };
}

/**
 * Get user's blocklist
 */
export async function getBlocklist(userId: string): Promise<string[]> {
  const snapshot = await db.collection('users').doc(userId)
    .collection('blocklist')
    .get();

  return snapshot.docs.map(doc => doc.id);
}

/**
 * Check if user A has blocked user B
 */
export async function isUserBlocked(userId: string, targetId: string): Promise<boolean> {
  const doc = await db.collection('users').doc(userId)
    .collection('blocklist').doc(targetId).get();
  
  return doc.exists;
}

// ============================================================================
// BEHAVIOR TRACKING
// ============================================================================

/**
 * Record a ghosting-earn event
 * This is triggered when a user earns from chat while not replying
 */
export async function recordGhostingEarnEvent(params: {
  userId: string;
  partnerId: string;
  sessionId?: string;
}): Promise<{ ok: boolean }> {
  const { userId } = params;

  const ref = db.collection('trust_state').doc(userId);
  const doc = await ref.get();
  
  if (!doc.exists) {
    await initializeTrustState(userId);
  }
  
  await ref.update({
    ghostingEarnSessions: increment(1),
    lastUpdatedAt: serverTimestamp()
  });

  // Recompute trust state
  await recomputeTrustState(userId);

  return { ok: true };
}

/**
 * Record a spam event
 */
export async function recordSpamEvent(params: {
  userId: string;
  reason: string;
}): Promise<{ ok: boolean }> {
  const { userId } = params;

  const ref = db.collection('trust_state').doc(userId);
  const doc = await ref.get();
  
  if (!doc.exists) {
    await initializeTrustState(userId);
  }
  
  await ref.update({
    spamMessageCount: increment(1),
    lastUpdatedAt: serverTimestamp()
  });

  // Recompute trust state
  await recomputeTrustState(userId);

  return { ok: true };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if user is high risk
 */
export function isUserHighRisk(trustState: TrustState | null): boolean {
  if (!trustState) return false;
  
  if (trustState.trustScore < 40) return true;
  
  const highRiskFlags = ['SCAM_SUSPECT', 'HARASSMENT', 'SPAMMER'];
  return trustState.riskFlags.some(flag => highRiskFlags.includes(flag));
}

/**
 * Get display-friendly risk level
 */
export function getTrustScoreLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}