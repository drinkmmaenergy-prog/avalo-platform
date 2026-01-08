/**
 * PACK 347 — Growth Engine: Referral System
 * 
 * User-to-user referral tracking with non-monetary rewards:
 * - Profile boost (24h)
 * - Discovery priority (48h)
 * - Swipe limit multiplier (temporary)
 * 
 * NO free tokens, NO cashback, NO balance credits.
 * 
 * Collection: referrals/{refId}
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, increment, generateId } from './init';

// ============================================================================
// TYPES
// ============================================================================

export type ReferralStatus = 
  | 'sent' 
  | 'installed' 
  | 'registered' 
  | 'verified' 
  | 'firstPayment';

export interface Referral {
  refId: string;
  referrerId: string;
  invitedUserId?: string; // Set when user registers
  status: ReferralStatus;
  createdAt: FirebaseFirestore.Timestamp;
  installedAt?: FirebaseFirestore.Timestamp;
  registeredAt?: FirebaseFirestore.Timestamp;
  verifiedAt?: FirebaseFirestore.Timestamp;
  firstPaymentAt?: FirebaseFirestore.Timestamp;
  metadata?: {
    source?: string; // 'sms', 'whatsapp', 'telegram', 'instagram', etc.
    deviceInfo?: any;
  };
}

export interface ReferralReward {
  type: 'profile_boost_24h' | 'discovery_priority_48h' | 'swipe_multiplier_temp';
  duration: number; // in hours
  multiplier?: number; // for swipe limit
  activatedAt: FirebaseFirestore.Timestamp;
  expiresAt: Date;
}

export interface ReferralStats {
  userId: string;
  totalReferrals: number;
  registered: number;
  verified: number;
  firstPayment: number;
  activeRewards: ReferralReward[];
  updatedAt: FirebaseFirestore.Timestamp;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const REFERRAL_REWARDS = {
  registered: {
    type: 'profile_boost_24h' as const,
    duration: 24,
    description: '24h profile visibility boost'
  },
  verified: {
    type: 'discovery_priority_48h' as const,
    duration: 48,
    description: '48h priority in discovery feed'
  },
  firstPayment: {
    type: 'swipe_multiplier_temp' as const,
    duration: 72,
    multiplier: 2,
    description: '2x swipe limit for 72h'
  }
};

const MAX_INVITES_PER_DAY = 50;
const REFERRAL_LINK_PREFIX = 'avalo.app/ref/';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check daily invite limit
 */
async function checkInviteLimit(userId: string): Promise<boolean> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const invitesToday = await db.collection('referrals')
    .where('referrerId', '==', userId)
    .where('createdAt', '>=', startOfDay)
    .get();
  
  return invitesToday.size < MAX_INVITES_PER_DAY;
}

/**
 * Check if user has AI anti-bot filtering flags
 */
async function checkAntiBotFilters(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Check trust engine for spam signals
    const { getUserRiskProfile } = await import('./trustEngine');
    const riskProfile = await getUserRiskProfile(userId);
    
    if (riskProfile && riskProfile.restrictions.shadowbanned) {
      return { allowed: false, reason: 'User is shadowbanned' };
    }
    
    if (riskProfile && riskProfile.riskLevel === 'CRITICAL') {
      return { allowed: false, reason: 'High risk user' };
    }
  } catch (error) {
    // Fail open if trust engine unavailable
    console.warn('[Referral] Trust engine check failed, allowing:', error);
  }
  
  return { allowed: true };
}

/**
 * Apply referral reward to user profile
 */
async function applyReferralReward(
  userId: string,
  rewardType: 'registered' | 'verified' | 'firstPayment'
): Promise<void> {
  const reward = REFERRAL_REWARDS[rewardType];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + reward.duration * 60 * 60 * 1000);
  
  const statsRef = db.collection('referral_stats').doc(userId);
  
  await db.runTransaction(async (transaction) => {
    const statsSnap = await transaction.get(statsRef);
    
    const newReward: ReferralReward = {
      type: reward.type,
      duration: reward.duration,
      multiplier: 'multiplier' in reward ? reward.multiplier : undefined,
      activatedAt: serverTimestamp() as any,
      expiresAt
    };
    
    if (!statsSnap.exists) {
      // Create new stats doc
      transaction.set(statsRef, {
        userId,
        totalReferrals: 0,
        registered: 0,
        verified: 0,
        firstPayment: 0,
        activeRewards: [newReward],
        updatedAt: serverTimestamp()
      });
    } else {
      // Add reward to existing
      const currentRewards = statsSnap.data()?.activeRewards || [];
      transaction.update(statsRef, {
        activeRewards: [...currentRewards, newReward],
        updatedAt: serverTimestamp()
      });
    }
  });
}

/**
 * Clean expired rewards from user stats
 */
async function cleanExpiredRewards(userId: string): Promise<void> {
  const statsRef = db.collection('referral_stats').doc(userId);
  const statsSnap = await statsRef.get();
  
  if (!statsSnap.exists) return;
  
  const stats = statsSnap.data() as ReferralStats;
  const now = new Date();
  
  const activeRewards = (stats.activeRewards || []).filter(reward => {
    const expiresAt = reward.expiresAt instanceof Date 
      ? reward.expiresAt 
      : new Date(reward.expiresAt);
    return expiresAt > now;
  });
  
  if (activeRewards.length !== (stats.activeRewards || []).length) {
    await statsRef.update({
      activeRewards,
      updatedAt: serverTimestamp()
    });
  }
}

// ============================================================================
// REFERRAL LINK GENERATION
// ============================================================================

/**
 * Generate unique referral link for user
 */
export async function generateReferralLink(data: {
  userId: string;
  source?: string;
}): Promise<{ success: boolean; referralLink: string; refId: string }> {
  const { userId, source } = data;
  
  // Validate user exists
  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }
  
  // Check invite limit
  const canInvite = await checkInviteLimit(userId);
  if (!canInvite) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      `Maximum ${MAX_INVITES_PER_DAY} invites per day reached`
    );
  }
  
  // Check anti-bot filters
  const botCheck = await checkAntiBotFilters(userId);
  if (!botCheck.allowed) {
    throw new functions.https.HttpsError(
      'permission-denied',
      botCheck.reason || 'Not allowed to create referral links'
    );
  }
  
  // Generate unique ref ID
  const refId = generateId();
  
  // Create referral document
  await db.collection('referrals').doc(refId).set({
    refId,
    referrerId: userId,
    status: 'sent',
    createdAt: serverTimestamp(),
    metadata: {
      source: source || 'unknown'
    }
  } as Referral);
  
  // Increment user's referral count
  const statsRef = db.collection('referral_stats').doc(userId);
  await statsRef.set({
    userId,
    totalReferrals: increment(1),
    updatedAt: serverTimestamp()
  }, { merge: true });
  
  const referralLink = `${REFERRAL_LINK_PREFIX}${refId}`;
  
  return {
    success: true,
    referralLink,
    refId
  };
}

// ============================================================================
// REFERRAL TRACKING
// ============================================================================

/**
 * Track referral app installation
 * Called when user opens app with referral link
 */
export async function trackReferralInstall(data: {
  refId: string;
  deviceInfo?: any;
}): Promise<{ success: boolean }> {
  const { refId, deviceInfo } = data;
  
  const refDoc = db.collection('referrals').doc(refId);
  const refSnap = await refDoc.get();
  
  if (!refSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Invalid referral link');
  }
  
  const referral = refSnap.data() as Referral;
  
  // Update to installed if still in sent state
  if (referral.status === 'sent') {
    await refDoc.update({
      status: 'installed',
      installedAt: serverTimestamp(),
      'metadata.deviceInfo': deviceInfo || null
    });
  }
  
  return { success: true };
}

/**
 * Track referral registration
 * Called when invited user completes registration
 */
export async function trackReferralRegistration(data: {
  refId: string;
  invitedUserId: string;
}): Promise<{ success: boolean }> {
  const { refId, invitedUserId } = data;
  
  const refDoc = db.collection('referrals').doc(refId);
  const refSnap = await refDoc.get();
  
  if (!refSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Invalid referral link');
  }
  
  const referral = refSnap.data() as Referral;
  
  // Prevent duplicate referral attribution
  if (referral.invitedUserId) {
    console.warn(`[Referral] Duplicate registration attempt for refId: ${refId}`);
    return { success: false };
  }
  
  await db.runTransaction(async (transaction) => {
    // Update referral
    transaction.update(refDoc, {
      status: 'registered',
      invitedUserId,
      registeredAt: serverTimestamp()
    });
    
    // Update referrer stats
    const statsRef = db.collection('referral_stats').doc(referral.referrerId);
    transaction.set(statsRef, {
      userId: referral.referrerId,
      registered: increment(1),
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
  
  // Apply reward to referrer (async, non-blocking)
  applyReferralReward(referral.referrerId, 'registered').catch(err => 
    console.error('[Referral] Failed to apply registration reward:', err)
  );
  
  return { success: true };
}

/**
 * Track referral verification
 * Called when invited user completes selfie verification
 */
export async function trackReferralVerification(data: {
  invitedUserId: string;
}): Promise<{ success: boolean }> {
  const { invitedUserId } = data;
  
  // Find referral by invited user ID
  const refQuery = await db.collection('referrals')
    .where('invitedUserId', '==', invitedUserId)
    .where('status', '==', 'registered')
    .limit(1)
    .get();
  
  if (refQuery.empty) {
    // No referral found, user likely registered organically
    return { success: false };
  }
  
  const refDoc = refQuery.docs[0];
  const referral = refDoc.data() as Referral;
  
  await db.runTransaction(async (transaction) => {
    // Update referral
    transaction.update(refDoc.ref, {
      status: 'verified',
      verifiedAt: serverTimestamp()
    });
    
    // Update referrer stats
    const statsRef = db.collection('referral_stats').doc(referral.referrerId);
    transaction.set(statsRef, {
      userId: referral.referrerId,
      verified: increment(1),
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
  
  // Apply reward to referrer (async, non-blocking)
  applyReferralReward(referral.referrerId, 'verified').catch(err => 
    console.error('[Referral] Failed to apply verification reward:', err)
  );
  
  return { success: true };
}

/**
 * Track referral first payment
 * Called when invited user makes their first token purchase
 */
export async function trackReferralFirstPayment(data: {
  invitedUserId: string;
}): Promise<{ success: boolean }> {
  const { invitedUserId } = data;
  
  // Find referral by invited user ID
  const refQuery = await db.collection('referrals')
    .where('invitedUserId', '==', invitedUserId)
    .where('status', '==', 'verified')
    .limit(1)
    .get();
  
  if (refQuery.empty) {
    // No verified referral found
    return { success: false };
  }
  
  const refDoc = refQuery.docs[0];
  const referral = refDoc.data() as Referral;
  
  await db.runTransaction(async (transaction) => {
    // Update referral
    transaction.update(refDoc.ref, {
      status: 'firstPayment',
      firstPaymentAt: serverTimestamp()
    });
    
    // Update referrer stats
    const statsRef = db.collection('referral_stats').doc(referral.referrerId);
    transaction.set(statsRef, {
      userId: referral.referrerId,
      firstPayment: increment(1),
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
  
  // Apply reward to referrer (async, non-blocking)
  applyReferralReward(referral.referrerId, 'firstPayment').catch(err => 
    console.error('[Referral] Failed to apply first payment reward:', err)
  );
  
  return { success: true };
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get user's referral stats and active rewards
 */
export async function getUserReferralStats(data: {
  userId: string;
}): Promise<ReferralStats | null> {
  const { userId } = data;
  
  // Clean expired rewards first
  await cleanExpiredRewards(userId);
  
  const statsSnap = await db.collection('referral_stats').doc(userId).get();
  
  if (!statsSnap.exists) {
    return null;
  }
  
  return statsSnap.data() as ReferralStats;
}

/**
 * Get user's referral history
 */
export async function getUserReferrals(data: {
  userId: string;
  limit?: number;
}): Promise<Referral[]> {
  const { userId, limit = 50 } = data;
  
  const refQuery = await db.collection('referrals')
    .where('referrerId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  return refQuery.docs.map(doc => doc.data() as Referral);
}

// ============================================================================
// SCHEDULED CLEANUP
// ============================================================================

/**
 * Clean expired referral rewards
 * Should be called by Cloud Scheduler (hourly)
 */
export async function cleanupExpiredReferralRewards(
  batchSize: number = 500
): Promise<{ success: boolean; cleaned: number }> {
  const statsQuery = await db.collection('referral_stats')
    .where('activeRewards', '!=', [])
    .limit(batchSize)
    .get();
  
  if (statsQuery.empty) {
    return { success: true, cleaned: 0 };
  }
  
  let cleanedCount = 0;
  const now = new Date();
  const batch = db.batch();
  
  for (const doc of statsQuery.docs) {
    const stats = doc.data() as ReferralStats;
    const activeRewards = (stats.activeRewards || []).filter(reward => {
      const expiresAt = reward.expiresAt instanceof Date 
        ? reward.expiresAt 
        : new Date(reward.expiresAt);
      return expiresAt > now;
    });
    
    if (activeRewards.length !== (stats.activeRewards || []).length) {
      batch.update(doc.ref, {
        activeRewards,
        updatedAt: serverTimestamp()
      });
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    await batch.commit();
  }
  
  return { success: true, cleaned: cleanedCount };
}

/**
 * PACK 347: Referral Engine
 * 
 * - User-to-user referral tracking
 * - Non-monetary rewards (boosts, priority, multipliers)
 * - Anti-spam protection (50 invites/day max)
 * - AI anti-bot filtering via trust engine
 * - No free tokens or cashback
 */
