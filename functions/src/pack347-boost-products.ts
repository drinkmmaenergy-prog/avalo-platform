/**
 * PACK 347 — Growth Engine: Boost Products (Paid Visibility)
 * 
 * New boost types beyond existing discovery/retarget:
 * - Local Boost (3h): Discovery in specific city
 * - Global Boost (1h): Passport + Feed visibility
 * - Event Boost: Per event listing boost
 * - AI Companion Boost (6h): AI discovery priority
 * 
 * Revenue split: 65% creator / 35% Avalo for all boosts
 * All paid with tokens via spendTokens()
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, increment, generateId } from './init';

// ============================================================================
// TYPES
// ============================================================================

export type Pack347BoostType = 
  | 'LOCAL_BOOST'           // 3h city-specific discovery
  | 'GLOBAL_BOOST'          // 1h passport + feed
  | 'EVENT_BOOST'           // per event
  | 'AI_COMPANION_BOOST';   // 6h AI discovery

export interface Pack347Boost {
  boostId: string;
  userId: string;
  type: Pack347BoostType;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  tokensCharged: number;
  creatorReceives: number; // 65%
  avaloReceives: number;   // 35%
  createdAt: FirebaseFirestore.Timestamp;
  expiresAt: Date;
  metadata?: {
    city?: string;          // For LOCAL_BOOST
    eventId?: string;       // For EVENT_BOOST
    aiCompanionId?: string; // For AI_COMPANION_BOOST
    duration?: number;      // in hours
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const BOOST_PRICING = {
  LOCAL_BOOST: {
    tokens: 120,
    durationHours: 3,
    description: '3h visibility boost in your city'
  },
  GLOBAL_BOOST: {
    tokens: 200,
    durationHours: 1,
    description: '1h global visibility in Passport & Feed'
  },
  EVENT_BOOST: {
    tokens: 80,
    durationHours: 24,
    description: '24h event listing priority'
  },
  AI_COMPANION_BOOST: {
    tokens: 150,
    durationHours: 6,
    description: '6h AI companion discovery boost'
  }
};

const REVENUE_SPLIT = {
  creator: 0.65,
  avalo: 0.35
};

const MAX_BOOSTS_PER_DAY = 10;

// ============================================================================
// TOKEN BILLING
// ============================================================================

/**
 * Charge tokens and split revenue between creator and Avalo
 * Uses atomic transaction for safety
 */
async function chargeBoostTokens(
  userId: string,
  tokensAmount: number,
  boostType: Pack347BoostType,
  metadata: any = {}
): Promise<{ creatorReceives: number; avaloReceives: number }> {
  const creatorReceives = Math.floor(tokensAmount * REVENUE_SPLIT.creator);
  const avaloReceives = Math.floor(tokensAmount * REVENUE_SPLIT.avalo);
  
  const walletRef = db.collection('users').doc(userId).collection('wallet').doc('current');
  
  await db.runTransaction(async (transaction) => {
    const walletSnap = await transaction.get(walletRef);
    
    if (!walletSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'User wallet not found');
    }
    
    const wallet = walletSnap.data();
    const currentBalance = wallet?.balance || 0;
    
    if (currentBalance < tokensAmount) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Insufficient tokens. Required: ${tokensAmount}, Available: ${currentBalance}`
      );
    }
    
    // Deduct tokens
    transaction.update(walletRef, {
      balance: increment(-tokensAmount),
      spent: increment(tokensAmount)
    });
    
    // Log transaction with split
    const txRef = db.collection('transactions').doc(generateId());
    transaction.set(txRef, {
      senderUid: userId,
      receiverUid: userId, // Creator receives their share
      tokensAmount: creatorReceives,
      avaloFee: avaloReceives,
      transactionType: `boost_${boostType.toLowerCase()}`,
      metadata: {
        ...metadata,
        revenueSplit: REVENUE_SPLIT
      },
      createdAt: serverTimestamp(),
      validated: true
    });
  });
  
  // Track Royal spend (async, non-blocking)
  trackRoyalSpendAsync(userId, tokensAmount, boostType).catch(() => {});
  
  // Track fan economy spend (async, non-blocking)
  trackFanSpendAsync(userId, userId, tokensAmount, 'boost').catch(() => {});
  
  return { creatorReceives, avaloReceives };
}

/**
 * Track Royal Club spend (PACK 50 integration)
 */
async function trackRoyalSpendAsync(
  userId: string,
  amount: number,
  source: string
): Promise<void> {
  try {
    const { trackRoyalSpend } = await import('./royalSpendTracking');
    await trackRoyalSpend(userId, amount, source);
  } catch (error) {
    console.error('[BoostProducts] Royal spend tracking failed:', error);
  }
}

/**
 * Track fan economy spend (PACK 220 integration)
 */
async function trackFanSpendAsync(
  fanId: string,
  creatorId: string,
  tokens: number,
  source: 'chat' | 'call' | 'meeting' | 'event' | 'boost'
): Promise<void> {
  try {
    const { trackTokenSpend } = await import('./fanKissEconomy');
    // Map 'boost' to a valid source type for fanKissEconomy
    const validSource = source === 'boost' ? 'event' : source;
    await trackTokenSpend(fanId, creatorId, tokens, validSource as any);
  } catch (error) {
    console.error('[BoostProducts] Fan spend tracking failed:', error);
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check daily boost limit
 */
async function checkBoostLimit(userId: string): Promise<boolean> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const boostsToday = await db.collection('pack347_boosts')
    .where('userId', '==', userId)
    .where('createdAt', '>=', startOfDay)
    .get();
  
  return boostsToday.size < MAX_BOOSTS_PER_DAY;
}

/**
 * Validate user can purchase boost
 */
async function validateUserForBoost(userId: string): Promise<void> {
  // Check account status
  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }
  
  const user = userSnap.data();
  if (user?.accountStatus !== 'active') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Account is not active'
    );
  }
  
  // Check daily limit
  const withinLimit = await checkBoostLimit(userId);
  if (!withinLimit) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      `Maximum ${MAX_BOOSTS_PER_DAY} boosts per day reached`
    );
  }
  
  // Check trust engine
  try {
    const { getUserRiskProfile } = await import('./trustEngine');
    const riskProfile = await getUserRiskProfile(userId);
    
    if (riskProfile && riskProfile.restrictions.shadowbanned) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'User is restricted from purchasing boosts'
      );
    }
  } catch (error) {
    // Fail open if trust engine unavailable
    console.warn('[BoostProducts] Trust engine check failed, allowing:', error);
  }
}

// ============================================================================
// BOOST CREATION
// ============================================================================

/**
 * Create Local Boost (3h city-specific discovery)
 */
export async function createLocalBoost(data: {
  userId: string;
  city: string;
}): Promise<{ success: boolean; boostId: string; expiresAt: Date }> {
  const { userId, city } = data;
  
  await validateUserForBoost(userId);
  
  const config = BOOST_PRICING.LOCAL_BOOST;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.durationHours * 60 * 60 * 1000);
  
  // Charge tokens
  const { creatorReceives, avaloReceives } = await chargeBoostTokens(
    userId,
    config.tokens,
    'LOCAL_BOOST',
    { city, duration: config.durationHours }
  );
  
  // Create boost document
  const boostId = generateId();
  const boost: Pack347Boost = {
    boostId,
    userId,
    type: 'LOCAL_BOOST',
    status: 'ACTIVE',
    tokensCharged: config.tokens,
    creatorReceives,
    avaloReceives,
    createdAt: serverTimestamp() as any,
    expiresAt,
    metadata: {
      city,
      duration: config.durationHours
    }
  };
  
  await db.collection('pack347_boosts').doc(boostId).set(boost);
  
  // Update promotion score (async, non-blocking)
  updatePromotionScoreAsync(userId).catch(() => {});
  
  return { success: true, boostId, expiresAt };
}

/**
 * Create Global Boost (1h passport + feed visibility)
 */
export async function createGlobalBoost(data: {
  userId: string;
}): Promise<{ success: boolean; boostId: string; expiresAt: Date }> {
  const { userId } = data;
  
  await validateUserForBoost(userId);
  
  const config = BOOST_PRICING.GLOBAL_BOOST;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.durationHours * 60 * 60 * 1000);
  
  // Charge tokens
  const { creatorReceives, avaloReceives } = await chargeBoostTokens(
    userId,
    config.tokens,
    'GLOBAL_BOOST',
    { duration: config.durationHours }
  );
  
  // Create boost document
  const boostId = generateId();
  const boost: Pack347Boost = {
    boostId,
    userId,
    type: 'GLOBAL_BOOST',
    status: 'ACTIVE',
    tokensCharged: config.tokens,
    creatorReceives,
    avaloReceives,
    createdAt: serverTimestamp() as any,
    expiresAt,
    metadata: {
      duration: config.durationHours
    }
  };
  
  await db.collection('pack347_boosts').doc(boostId).set(boost);
  
  // Update promotion score (async, non-blocking)
  updatePromotionScoreAsync(userId).catch(() => {});
  
  return { success: true, boostId, expiresAt };
}

/**
 * Create Event Boost (24h event listing priority)
 */
export async function createEventBoost(data: {
  userId: string;
  eventId: string;
}): Promise<{ success: boolean; boostId: string; expiresAt: Date }> {
  const { userId, eventId } = data;
  
  await validateUserForBoost(userId);
  
  // Validate event exists and belongs to user
  const eventSnap = await db.collection('events').doc(eventId).get();
  if (!eventSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Event not found');
  }
  
  if (eventSnap.data()?.creatorId !== userId) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Event does not belong to user'
    );
  }
  
  const config = BOOST_PRICING.EVENT_BOOST;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.durationHours * 60 * 60 * 1000);
  
  // Charge tokens
  const { creatorReceives, avaloReceives } = await chargeBoostTokens(
    userId,
    config.tokens,
    'EVENT_BOOST',
    { eventId, duration: config.durationHours }
  );
  
  // Create boost document
  const boostId = generateId();
  const boost: Pack347Boost = {
    boostId,
    userId,
    type: 'EVENT_BOOST',
    status: 'ACTIVE',
    tokensCharged: config.tokens,
    creatorReceives,
    avaloReceives,
    createdAt: serverTimestamp() as any,
    expiresAt,
    metadata: {
      eventId,
      duration: config.durationHours
    }
  };
  
  await db.collection('pack347_boosts').doc(boostId).set(boost);
  
  return { success: true, boostId, expiresAt };
}

/**
 * Create AI Companion Boost (6h AI discovery priority)
 */
export async function createAICompanionBoost(data: {
  userId: string;
  aiCompanionId: string;
}): Promise<{ success: boolean; boostId: string; expiresAt: Date }> {
  const { userId, aiCompanionId } = data;
  
  await validateUserForBoost(userId);
  
  // Validate AI companion exists and belongs to user
  const companionSnap = await db.collection('ai_companions').doc(aiCompanionId).get();
  if (!companionSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'AI Companion not found');
  }
  
  if (companionSnap.data()?.creatorId !== userId) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'AI Companion does not belong to user'
    );
  }
  
  const config = BOOST_PRICING.AI_COMPANION_BOOST;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.durationHours * 60 * 60 * 1000);
  
  // Charge tokens
  const { creatorReceives, avaloReceives } = await chargeBoostTokens(
    userId,
    config.tokens,
    'AI_COMPANION_BOOST',
    { aiCompanionId, duration: config.durationHours }
  );
  
  // Create boost document
  const boostId = generateId();
  const boost: Pack347Boost = {
    boostId,
    userId,
    type: 'AI_COMPANION_BOOST',
    status: 'ACTIVE',
    tokensCharged: config.tokens,
    creatorReceives,
    avaloReceives,
    createdAt: serverTimestamp() as any,
    expiresAt,
    metadata: {
      aiCompanionId,
      duration: config.durationHours
    }
  };
  
  await db.collection('pack347_boosts').doc(boostId).set(boost);
  
  return { success: true, boostId, expiresAt };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Update promotion score after boost purchase (async, non-blocking)
 */
async function updatePromotionScoreAsync(userId: string): Promise<void> {
  try {
    const { calculatePromotionScore } = await import('./pack347-promotion-algorithm');
    await calculatePromotionScore({ creatorId: userId });
  } catch (error) {
    console.error('[BoostProducts] Failed to update promotion score:', error);
  }
}

/**
 * Check if user has active boost of specific type
 */
export async function hasActiveBoost(data: {
  userId: string;
  boostType: Pack347BoostType;
}): Promise<{ hasActive: boolean; boost?: Pack347Boost }> {
  const { userId, boostType } = data;
  
  const now = new Date();
  const activeBoostsQuery = await db.collection('pack347_boosts')
    .where('userId', '==', userId)
    .where('type', '==', boostType)
    .where('status', '==', 'ACTIVE')
    .where('expiresAt', '>', now)
    .limit(1)
    .get();
  
  if (activeBoostsQuery.empty) {
    return { hasActive: false };
  }
  
  return {
    hasActive: true,
    boost: activeBoostsQuery.docs[0].data() as Pack347Boost
  };
}

/**
 * Get user's boost history
 */
export async function getUserBoosts(data: {
  userId: string;
  limit?: number;
}): Promise<Pack347Boost[]> {
  const { userId, limit = 50 } = data;
  
  const boostsQuery = await db.collection('pack347_boosts')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  return boostsQuery.docs.map(doc => doc.data() as Pack347Boost);
}

/**
 * Get boost pricing configuration
 */
export function getBoostPricing(): typeof BOOST_PRICING {
  return BOOST_PRICING;
}

// ============================================================================
// SCHEDULED CLEANUP
// ============================================================================

/**
 * Clean expired boosts
 * Should be called by Cloud Scheduler (hourly)
 */
export async function cleanupExpiredPack347Boosts(
  batchSize: number = 200
): Promise<{ success: boolean; expired: number }> {
  const now = new Date();
  
  const expiredQuery = await db.collection('pack347_boosts')
    .where('status', '==', 'ACTIVE')
    .where('expiresAt', '<', now)
    .limit(batchSize)
    .get();
  
  if (expiredQuery.empty) {
    return { success: true, expired: 0 };
  }
  
  const batch = db.batch();
  expiredQuery.docs.forEach(doc => {
    batch.update(doc.ref, {
      status: 'EXPIRED',
      expiredAt: serverTimestamp()
    });
  });
  
  await batch.commit();
  
  return { success: true, expired: expiredQuery.size };
}

/**
 * PACK 347: Boost Products
 * 
 * - Local Boost (3h city discovery)
 * - Global Boost (1h passport + feed)
 * - Event Boost (24h event listing)
 * - AI Companion Boost (6h AI discovery)
 * 
 * - 65/35 revenue split (creator/Avalo)
 * - Token-based payments
 * - Daily limit protection (10 boosts/day)
 * - Integration with promotion algorithm
 * - Royal Club and Fan Economy tracking
 */
