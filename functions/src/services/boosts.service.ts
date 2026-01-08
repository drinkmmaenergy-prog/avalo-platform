/**
 * PACK 252 - BOOSTS MARKETPLACE
 * Backend service for boost purchase and management
 */

import {
  BoostType,
  ActiveBoost,
  BoostPurchaseRequest,
  BoostPurchaseResponse,
  BoostStats,
  BOOST_CONFIGS,
  BOOSTS_COLLECTION,
  MIN_RISK_SCORE_FOR_BOOST,
  BOOST_DISABLED_MESSAGE
} from '../types/boosts.types';
import { db, arrayUnion, arrayRemove, serverTimestamp, increment } from '../init';
import type { UserTokenWallet } from '../types/treasury.types';

/**
 * Check if user is eligible to purchase boosts
 */
export async function checkBoostEligibility(userId: string): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return { eligible: false, reason: 'User not found' };
    }

    const userData = userDoc.data();

    // Check if account is verified
    if (!userData?.verified) {
      return { eligible: false, reason: 'Account must be verified to use boosts' };
    }

    // Check risk score (PACK 248 - Romance Scam Detection)
    if (userData?.riskScore && userData.riskScore > MIN_RISK_SCORE_FOR_BOOST) {
      return { eligible: false, reason: BOOST_DISABLED_MESSAGE };
    }

    // Check if account is suspended or banned
    if (userData?.banned || userData?.suspended) {
      return { eligible: false, reason: BOOST_DISABLED_MESSAGE };
    }

    // Check if account is under review
    if (userData?.underReview) {
      return { eligible: false, reason: BOOST_DISABLED_MESSAGE };
    }

    return { eligible: true };
  } catch (error) {
    console.error('Error checking boost eligibility:', error);
    return { eligible: false, reason: 'Unable to verify eligibility' };
  }
}

/**
 * Purchase a boost
 */
export async function purchaseBoost(
  request: BoostPurchaseRequest
): Promise<BoostPurchaseResponse> {
  try {
    const { userId, boostType, targetLocation } = request;

    // Check eligibility
    const eligibility = await checkBoostEligibility(userId);
    if (!eligibility.eligible) {
      return {
        success: false,
        error: 'Not eligible',
        reason: eligibility.reason
      };
    }

    // Get boost configuration
    const config = BOOST_CONFIGS[boostType];
    if (!config) {
      return {
        success: false,
        error: 'Invalid boost type'
      };
    }

    // Check user token balance (from Treasury system)
    const walletRef = db.collection('user_token_wallets').doc(userId);
    const walletDoc = await walletRef.get();
    
    if (!walletDoc.exists) {
      return {
        success: false,
        error: 'Wallet not found',
        reason: 'User wallet does not exist'
      };
    }
    
    const wallet = walletDoc.data() as UserTokenWallet;
    if (wallet.availableTokens < config.tokenPrice) {
      return {
        success: false,
        error: 'Insufficient tokens',
        reason: `Not enough tokens. Need ${config.tokenPrice}, have ${wallet.availableTokens}`
      };
    }

    // Deduct tokens (100% revenue for Avalo, no 65/35 split)
    await walletRef.update({
      availableTokens: increment(-config.tokenPrice),
      lifetimeSpent: increment(config.tokenPrice),
      lastSpendAt: serverTimestamp()
    });

    // Create boost record
    const now = Date.now();
    const boostId = db.collection(BOOSTS_COLLECTION).doc().id;

    const boost: ActiveBoost = {
      boostId,
      userId,
      type: boostType,
      startTime: now,
      endTime: now + config.duration,
      isActive: true,
      tokensPaid: config.tokenPrice,
      targetLocation: boostType === BoostType.LOCATION_JUMP ? targetLocation : undefined,
      stats: {
        views: 0,
        likes: 0,
        impressions: 0,
        matches: 0,
        messagesSent: 0,
        messagesReceived: 0,
        hourlyViews: {},
        dailyViews: {}
      }
    };

    // Save to Firestore
    await db.collection(BOOSTS_COLLECTION).doc(boostId).set(boost);

    // Update user's active boosts array
    await db.collection('users').doc(userId).update({
      activeBoosts: arrayUnion(boostId),
      [`boostHistory.${boostId}`]: {
        type: boostType,
        purchaseTime: now,
        endTime: boost.endTime,
        tokensPaid: config.tokenPrice
      }
    });

    return {
      success: true,
      boostId,
      boost
    };
  } catch (error) {
    console.error('Error purchasing boost:', error);
    return {
      success: false,
      error: 'Purchase failed',
      reason: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get active boosts for a user
 */
export async function getActiveBoosts(userId: string): Promise<ActiveBoost[]> {
  try {
    const now = Date.now();
    
    const snapshot = await db
      .collection(BOOSTS_COLLECTION)
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .where('endTime', '>', now)
      .get();

    return snapshot.docs.map(doc => doc.data() as ActiveBoost);
  } catch (error) {
    console.error('Error getting active boosts:', error);
    return [];
  }
}

/**
 * Deactivate expired boosts (run as scheduled function)
 */
export async function deactivateExpiredBoosts(): Promise<void> {
  try {
    const now = Date.now();
    
    const snapshot = await db
      .collection(BOOSTS_COLLECTION)
      .where('isActive', '==', true)
      .where('endTime', '<=', now)
      .get();

    const batch = db.batch();

    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, { isActive: false });
      
      // Remove from user's active boosts
      const boost = doc.data() as ActiveBoost;
      const userRef = db.collection('users').doc(boost.userId);
      batch.update(userRef, {
        activeBoosts: arrayRemove(doc.id)
      });
    });

    await batch.commit();
    console.log(`Deactivated ${snapshot.size} expired boosts`);
  } catch (error) {
    console.error('Error deactivating expired boosts:', error);
  }
}

/**
 * Update boost stats
 */
export async function updateBoostStats(
  boostId: string,
  statType: keyof BoostStats,
  incrementBy: number = 1
): Promise<void> {
  try {
    const boostRef = db.collection(BOOSTS_COLLECTION).doc(boostId);
    const now = Date.now();
    const hour = new Date(now).toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const day = new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD

    const updates: any = {
      [`stats.${statType}`]: increment(incrementBy)
    };

    // Track hourly and daily views
    if (statType === 'views') {
      updates[`stats.hourlyViews.${hour}`] = increment(incrementBy);
      updates[`stats.dailyViews.${day}`] = increment(incrementBy);
    }

    await boostRef.update(updates);
  } catch (error) {
    console.error('Error updating boost stats:', error);
  }
}

/**
 * Get boost stats for display
 */
export async function getBoostStats(boostId: string): Promise<BoostStats | null> {
  try {
    const doc = await db.collection(BOOSTS_COLLECTION).doc(boostId).get();
    if (!doc.exists) return null;

    const boost = doc.data() as ActiveBoost;
    return boost.stats;
  } catch (error) {
    console.error('Error getting boost stats:', error);
    return null;
  }
}

/**
 * Check if user has any active boost
 */
export async function hasActiveBoost(
  userId: string,
  boostType?: BoostType
): Promise<boolean> {
  try {
    const now = Date.now();
    
    let query = db
      .collection(BOOSTS_COLLECTION)
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .where('endTime', '>', now);

    if (boostType) {
      query = query.where('type', '==', boostType);
    }

    const snapshot = await query.limit(1).get();
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking active boost:', error);
    return false;
  }
}

/**
 * Get all available boost types for user
 */
export async function getAvailableBoosts(userId: string): Promise<{
  boosts: typeof BOOST_CONFIGS;
  activeBoosts: ActiveBoost[];
  eligible: boolean;
  reason?: string;
}> {
  try {
    const eligibility = await checkBoostEligibility(userId);
    const activeBoosts = await getActiveBoosts(userId);

    return {
      boosts: BOOST_CONFIGS,
      activeBoosts,
      eligible: eligibility.eligible,
      reason: eligibility.reason
    };
  } catch (error) {
    console.error('Error getting available boosts:', error);
    return {
      boosts: BOOST_CONFIGS,
      activeBoosts: [],
      eligible: false,
      reason: 'Unable to load boosts'
    };
  }
}