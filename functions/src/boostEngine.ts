/**
 * BOOST ENGINE – Phase: Pay-Per-Boost & Chat Retargeting
 * 
 * This module implements promotional boosts for the Avalo platform.
 * All boost payments are 100% Avalo revenue (no creator share).
 * Boosts are non-refundable.
 * 
 * DO NOT modify existing monetization logic in other modules.
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, increment, generateId } from './init';

// ============================================================================
// TYPES
// ============================================================================

export type BoostType = 'DISCOVERY_PROFILE' | 'CHAT_RETARGET';
export type BoostStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
export type BoostVisibility = 'GLOBAL' | 'LOCAL';

export interface Boost {
  id: string;
  userId: string;
  type: BoostType;
  status: BoostStatus;
  createdAt: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
  tokensCharged: number;
  visibility: BoostVisibility;
  targetUserId?: string;
  chatId?: string;
  notes?: string;
  meta?: Record<string, any>;
}

export type DiscoveryTier = 'basic' | 'plus' | 'max';

// ============================================================================
// CONFIGURATION
// ============================================================================

const BOOST_CONFIG = {
  discovery: {
    // 100% Avalo revenue
    basic: { tokens: 80, durationMinutes: 30 },
    plus: { tokens: 180, durationMinutes: 90 },
    max: { tokens: 400, durationMinutes: 240 },
  },
  chatRetarget: {
    // single one-shot retarget boost
    ping: { tokens: 60, durationMinutes: 60 },
  },
};

// Threshold for considering a chat "inactive" (in minutes)
const CHAT_INACTIVE_THRESHOLD_MINUTES = 60;

// ============================================================================
// TOKEN CHARGING HELPER
// ============================================================================

/**
 * Safely charge tokens from user wallet
 * Uses Firestore transaction for atomicity
 *
 * @param userId - User to charge
 * @param amount - Token amount
 * @param reason - Description for transaction log
 * @param metadata - Additional transaction metadata
 */
async function chargeUserTokens(
  userId: string,
  amount: number,
  reason: string,
  metadata: Record<string, any> = {}
): Promise<void> {
  const walletRef = db.collection('balances').doc(userId).collection('wallet').doc('wallet');
  
  await db.runTransaction(async (transaction) => {
    const walletSnap = await transaction.get(walletRef);
    
    if (!walletSnap.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'User wallet not found'
      );
    }
    
    const wallet = walletSnap.data();
    const currentBalance = wallet?.tokens || 0;
    
    if (currentBalance < amount) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Insufficient tokens. Required: ${amount}, Available: ${currentBalance}`
      );
    }
    
    // Deduct tokens
    transaction.update(walletRef, {
      tokens: currentBalance - amount,
      lastUpdated: serverTimestamp(),
    });
    
    // Log transaction
    const txRef = db.collection('transactions').doc(generateId());
    transaction.set(txRef, {
      senderUid: userId,
      receiverUid: 'avalo_boost_revenue',
      tokensAmount: amount,
      avaloFee: amount, // 100% to Avalo
      transactionType: reason,
      metadata,
      createdAt: serverTimestamp(),
      validated: true,
    });
  });
  
  // PACK 50: Record Royal spend (async, non-blocking)
  trackRoyalSpendAsync(userId, amount, reason);
}

/**
 * PACK 50: Track Royal spend asynchronously
 */
async function trackRoyalSpendAsync(userId: string, amount: number, source: string): Promise<void> {
  try {
    const { trackRoyalSpend } = await import('./royalSpendTracking');
    await trackRoyalSpend(userId, amount, source);
  } catch (error) {
    // Silent failure - Royal tracking should never block boost operations
    console.error('[BoostEngine] Royal spend tracking failed:', error);
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate user can create a boost
 */
async function validateUserForBoost(userId: string): Promise<void> {
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  
  if (!userSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }
  
  const user = userSnap.data();
  
  // Check if account is active
  const accountStatus = user?.accountStatus || 'active';
  if (accountStatus !== 'active') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Account is not active. Cannot create boost.'
    );
  }
  
  // Check if user is banned or restricted (trust engine integration)
  try {
    // Check trust score to determine if user can make purchases
    const { getUserRiskProfile } = await import('./trustEngine');
    const riskProfile = await getUserRiskProfile(userId);
    
    if (riskProfile && riskProfile.restrictions.shadowbanned) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'User is restricted from creating boosts'
      );
    }
  } catch (error: any) {
    // If trust engine check fails, log but don't block (fail-open)
    console.warn('Trust engine check failed, allowing boost:', error.message);
  }
}

/**
 * Record boost purchase event in ranking engine (non-blocking)
 */
async function recordBoostPurchaseEvent(
  userId: string,
  tokensCharged: number,
  boostType: BoostType
): Promise<void> {
  try {
    const { recordRankingAction } = await import('./rankingEngine');
    await recordRankingAction({
      type: 'boost',
      creatorId: userId,
      payerId: userId,
      points: 200, // Fixed boost bonus from scoring table
      timestamp: new Date(),
    });
  } catch (error) {
    // Non-blocking - log but don't fail the boost
    console.warn('Failed to record boost purchase in ranking engine:', error);
  }
}

/**
 * Record risk event in trust engine (non-blocking)
 * Note: Using 'free_pool' event type as a generic purchase tracking mechanism
 */
async function recordBoostRiskEvent(
  userId: string,
  tokensCharged: number,
  boostType: BoostType
): Promise<void> {
  try {
    const { recordRiskEvent } = await import('./trustEngine');
    await recordRiskEvent({
      userId,
      eventType: 'free_pool', // Using existing event type for tracking
      metadata: {
        boostType,
        tokensCharged,
        source: 'boost_purchase',
      },
    });
  } catch (error) {
    // Non-blocking - log but don't fail the boost
    console.warn('Failed to record boost risk event:', error);
  }
}

// ============================================================================
// DISCOVERY PROFILE BOOST
// ============================================================================

export async function createDiscoveryBoost(data: {
  userId: string;
  tier: DiscoveryTier;
}): Promise<{ success: boolean; boostId: string; expiresAt: Date }> {
  const { userId, tier } = data;
  
  // Validate tier
  if (!['basic', 'plus', 'max'].includes(tier)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid tier. Must be basic, plus, or max'
    );
  }
  
  // Validate user can create boost
  await validateUserForBoost(userId);
  
  // Get config for tier
  const config = BOOST_CONFIG.discovery[tier];
  const { tokens, durationMinutes } = config;
  
  // Calculate expiration
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
  
  // Charge tokens (atomic)
  await chargeUserTokens(
    userId,
    tokens,
    'boost_discovery',
    { tier, durationMinutes }
  );
  
  // Create boost document
  const boostId = generateId();
  const boostRef = db.collection('boosts').doc(boostId);
  
  await boostRef.set({
    id: boostId,
    userId,
    type: 'DISCOVERY_PROFILE' as BoostType,
    status: 'ACTIVE' as BoostStatus,
    createdAt: serverTimestamp(),
    expiresAt: expiresAt,
    tokensCharged: tokens,
    visibility: 'GLOBAL' as BoostVisibility,
    meta: {
      tier,
      durationMinutes,
    },
  });
  
  // Record events (non-blocking)
  recordBoostPurchaseEvent(userId, tokens, 'DISCOVERY_PROFILE').catch(() => {});
  recordBoostRiskEvent(userId, tokens, 'DISCOVERY_PROFILE').catch(() => {});
  
  return {
    success: true,
    boostId,
    expiresAt,
  };
}

// ============================================================================
// CHAT RETARGET BOOST
// ============================================================================

export async function createChatRetargetBoost(data: {
  userId: string;
  chatId: string;
}): Promise<{ success: boolean; boostId: string; expiresAt: Date }> {
  const { userId, chatId } = data;
  
  // Validate user can create boost
  await validateUserForBoost(userId);
  
  // Validate chatId
  if (!chatId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Chat ID is required'
    );
  }
  
  // Load chat document
  const chatRef = db.collection('chats').doc(chatId);
  const chatSnap = await chatRef.get();
  
  if (!chatSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Chat not found');
  }
  
  const chat = chatSnap.data();
  
  // Verify caller is a participant
  const participants = chat?.participants || [];
  if (!participants.includes(userId)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'You are not a participant in this chat'
    );
  }
  
  // Determine target user (the other participant)
  const targetUserId = participants.find((p: string) => p !== userId);
  if (!targetUserId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Cannot determine target user'
    );
  }
  
  // Check if chat is closed/inactive
  const lastActivityAt = chat?.lastActivityAt?.toDate?.() || new Date(0);
  const minutesSinceActivity = (Date.now() - lastActivityAt.getTime()) / (1000 * 60);
  
  if (minutesSinceActivity < CHAT_INACTIVE_THRESHOLD_MINUTES) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Chat is still active. Wait ${Math.ceil(CHAT_INACTIVE_THRESHOLD_MINUTES - minutesSinceActivity)} more minutes before retargeting.`
    );
  }
  
  // Get config
  const config = BOOST_CONFIG.chatRetarget.ping;
  const { tokens, durationMinutes } = config;
  
  // Calculate expiration
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
  
  // Charge tokens (atomic)
  await chargeUserTokens(
    userId,
    tokens,
    'boost_chat_retarget',
    { chatId, targetUserId }
  );
  
  // Create boost document
  const boostId = generateId();
  const boostRef = db.collection('boosts').doc(boostId);
  
  await boostRef.set({
    id: boostId,
    userId,
    type: 'CHAT_RETARGET' as BoostType,
    status: 'ACTIVE' as BoostStatus,
    createdAt: serverTimestamp(),
    expiresAt: expiresAt,
    tokensCharged: tokens,
    visibility: 'GLOBAL' as BoostVisibility,
    targetUserId,
    chatId,
    meta: {
      durationMinutes,
    },
  });
  
  // TODO: Enqueue notification to target user
  // This requires an existing notification system
  // For now, we just create the boost and let the app poll for active boosts
  
  // Record events (non-blocking)
  recordBoostPurchaseEvent(userId, tokens, 'CHAT_RETARGET').catch(() => {});
  recordBoostRiskEvent(userId, tokens, 'CHAT_RETARGET').catch(() => {});
  
  return {
    success: true,
    boostId,
    expiresAt,
  };
}

// ============================================================================
// BOOST CLEANUP
// ============================================================================

/**
 * Find and expire boosts that have passed their expiration time
 * Should be called by Cloud Scheduler or manually triggered
 * 
 * @param batchSize - Maximum number of boosts to process in one run
 * @returns Number of boosts expired
 */
export async function cleanupExpiredBoosts(
  batchSize: number = 200
): Promise<{ success: true; expiredCount: number }> {
  const now = new Date();
  
  // Query active boosts that have expired
  const expiredBoostsSnap = await db
    .collection('boosts')
    .where('status', '==', 'ACTIVE')
    .where('expiresAt', '<', now)
    .limit(batchSize)
    .get();
  
  if (expiredBoostsSnap.empty) {
    return { success: true, expiredCount: 0 };
  }
  
  // Use batch write for efficiency
  const batch = db.batch();
  
  expiredBoostsSnap.docs.forEach((doc) => {
    batch.update(doc.ref, {
      status: 'EXPIRED' as BoostStatus,
      expiredAt: serverTimestamp(),
    });
  });
  
  await batch.commit();
  
  return {
    success: true,
    expiredCount: expiredBoostsSnap.docs.length,
  };
}

// ============================================================================
// READ-ONLY FUNCTIONS (SAFE GETTERS)
// ============================================================================

/**
 * Get user's boost history (read-only getter)
 * Returns last N boosts for a user
 *
 * @param userId - User ID to fetch boosts for
 * @param limit - Maximum number of boosts to return (default: 20)
 * @returns Array of user's boosts
 */
export async function getUserBoosts(userId: string, limit: number = 20): Promise<Boost[]> {
  const boostsRef = db.collection('boosts')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit);

  const snapshot = await boostsRef.get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId,
      type: data.type as BoostType,
      status: data.status as BoostStatus,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      tokensCharged: data.tokensCharged,
      visibility: data.visibility as BoostVisibility,
      targetUserId: data.targetUserId,
      chatId: data.chatId,
      notes: data.notes,
      meta: data.meta,
    };
  });
}

/**
 * BOOST ENGINE – Phase: Pay-Per-Boost & Chat Retargeting
 *
 * - Discovery Profile Boosts:
 *   - 3 tiers (basic/plus/max), 100% Avalo revenue
 *   - Stored in `boosts` collection, type = 'DISCOVERY_PROFILE'
 *
 * - Chat Retarget Boosts:
 *   - Ping a closed / inactive chat
 *   - Stored in `boosts` collection, type = 'CHAT_RETARGET'
 *
 * - No changes to existing chat/call monetization.
 * - All boosts are non-refundable.
 */