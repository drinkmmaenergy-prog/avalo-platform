/**
 * PACK 66 — Web Landing + Referral & Influencer Tracking (Acquisition, No Free Tokens)
 * 
 * This module provides referral tracking and analytics WITHOUT monetary rewards.
 * It ONLY tracks clicks → installs → activations for analytics purposes.
 * 
 * HARD CONSTRAINTS:
 * - NO free tokens
 * - NO referral bonuses
 * - NO discounts
 * - ONLY attribution and analytics
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, generateId, increment } from './init';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

export interface ReferralProfile {
  userId: string;
  referralCode: string;
  customSlug?: string | null;
  clicksTotal: number;
  installsAttributed: number;
  signupsAttributed: number;
  activeUsers30d: number;
  payersCountTotal: number;
  tokensPurchasedByAttributedUsers: number;
  lastClickAt?: Timestamp | null;
  lastSignupAt?: Timestamp | null;
  lastUpdatedAt: Timestamp;
  createdAt: Timestamp;
}

export interface ReferralEvent {
  eventId: string;
  referralCode: string;
  referrerUserId?: string | null;
  eventType: 'CLICK' | 'INSTALL' | 'SIGNUP' | 'FIRST_PURCHASE' | 'FIRST_PAID_ACTION';
  viewerUserId?: string | null;
  userAgentHash?: string | null;
  ipCountry?: string | null;
  createdAt: Timestamp;
  source: 'WEB_LANDING' | 'LINK_DIRECT' | 'OTHER';
}

export interface UserAttribution {
  userId: string;
  referralCode?: string | null;
  referrerUserId?: string | null;
  attributionSource?: 'WEB_LANDING' | 'DEEP_LINK' | 'MANUAL' | 'NONE';
  attributedAt?: Timestamp | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a unique referral code
 * Format: username-based + random suffix
 */
async function generateUniqueReferralCode(userId: string): Promise<string> {
  // Get user profile to extract username
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  let baseCode = 'user';
  if (userData?.displayName) {
    // Create slug from display name (lowercase, alphanumeric only)
    baseCode = userData.displayName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 10);
  }
  
  // Try up to 10 times to generate unique code
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = Math.floor(10 + Math.random() * 90); // 2-digit number
    const code = `${baseCode}${suffix}`;
    
    // Check if code exists
    const existingQuery = await db.collection('referral_profiles')
      .where('referralCode', '==', code)
      .limit(1)
      .get();
    
    if (existingQuery.empty) {
      return code;
    }
  }
  
  // Fallback: use UUID-based code
  return `ref${generateId().substring(0, 8)}`;
}

/**
 * Validate referral code format
 */
function isValidReferralCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  if (code.length < 3 || code.length > 20) return false;
  // Only alphanumeric and hyphens
  return /^[a-z0-9]+$/i.test(code);
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * Create or get referral code for user
 * POST /referrals/create-or-get
 */
export const createOrGetReferralCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = data.userId || context.auth.uid;
  
  // Only allow users to create their own referral code
  if (userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot create referral code for another user');
  }
  
  try {
    // Check age verification (18+)
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }
    
    const userData = userDoc.data();
    const age = userData?.age || 0;
    const isVerified = userData?.verification?.age18 || false;
    
    if (age < 18 || !isVerified) {
      throw new functions.https.HttpsError('failed-precondition', 'User must be 18+ and age-verified');
    }
    
    // Check if profile already exists
    const profileRef = db.collection('referral_profiles').doc(userId);
    const profileDoc = await profileRef.get();
    
    if (profileDoc.exists) {
      const profile = profileDoc.data() as ReferralProfile;
      return {
        userId,
        referralCode: profile.referralCode,
        customSlug: profile.customSlug || null
      };
    }
    
    // Generate new code
    const referralCode = await generateUniqueReferralCode(userId);
    
    const now = serverTimestamp() as Timestamp;
    const newProfile: Omit<ReferralProfile, 'lastClickAt' | 'lastSignupAt'> = {
      userId,
      referralCode,
      customSlug: null,
      clicksTotal: 0,
      installsAttributed: 0,
      signupsAttributed: 0,
      activeUsers30d: 0,
      payersCountTotal: 0,
      tokensPurchasedByAttributedUsers: 0,
      lastUpdatedAt: now,
      createdAt: now
    };
    
    await profileRef.set(newProfile);
    
    console.log(`[Referrals] Created referral code for user ${userId}: ${referralCode}`);
    
    return {
      userId,
      referralCode,
      customSlug: null
    };
  } catch (error: any) {
    console.error('[Referrals] Error in createOrGetReferralCode:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Track referral click
 * POST /referrals/track-click
 */
export const trackClick = functions.https.onCall(async (data, context) => {
  const { referralCode, source, userAgentHash } = data;
  
  if (!referralCode) {
    throw new functions.https.HttpsError('invalid-argument', 'referralCode is required');
  }
  
  if (!isValidReferralCode(referralCode)) {
    return {
      valid: false,
      error: 'Invalid referral code format'
    };
  }
  
  try {
    // Find referrer by code
    const profileQuery = await db.collection('referral_profiles')
      .where('referralCode', '==', referralCode)
      .limit(1)
      .get();
    
    if (profileQuery.empty) {
      return {
        valid: false,
        error: 'Referral code not found'
      };
    }
    
    const profileDoc = profileQuery.docs[0];
    const profile = profileDoc.data() as ReferralProfile;
    const referrerUserId = profile.userId;
    
    // Create event
    const eventId = generateId();
    const now = serverTimestamp() as Timestamp;
    const event: Omit<ReferralEvent, 'createdAt'> & { createdAt: any } = {
      eventId,
      referralCode,
      referrerUserId,
      eventType: 'CLICK',
      viewerUserId: context.auth?.uid || null,
      userAgentHash: userAgentHash || null,
      ipCountry: null, // Could extract from request headers in production
      createdAt: now,
      source: source || 'WEB_LANDING'
    };
    
    await db.collection('referral_events').doc(eventId).set(event);
    
    // Update profile counters
    await profileDoc.ref.update({
      clicksTotal: increment(1),
      lastClickAt: now,
      lastUpdatedAt: now
    });
    
    // Get referrer display info (if privacy allows)
    const referrerDoc = await db.collection('users').doc(referrerUserId).get();
    const referrerData = referrerDoc.data();
    
    return {
      valid: true,
      referrerUserId,
      referrerDisplayName: referrerData?.displayName || 'Someone'
    };
  } catch (error: any) {
    console.error('[Referrals] Error in trackClick:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Attribution on signup
 * POST /referrals/attribution-on-signup
 */
export const attributionOnSignup = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { newUserId, referralCode, source } = data;
  const userId = newUserId || context.auth.uid;
  
  // Only allow users to set their own attribution
  if (userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot set attribution for another user');
  }
  
  if (!referralCode) {
    // No referral code = no attribution (valid case)
    return { success: true, message: 'No referral code provided' };
  }
  
  if (!isValidReferralCode(referralCode)) {
    return { success: false, error: 'Invalid referral code format' };
  }
  
  try {
    // Check if user already has attribution
    const attributionRef = db.collection('user_attribution').doc(userId);
    const attributionDoc = await attributionRef.get();
    
    if (attributionDoc.exists && attributionDoc.data()?.referrerUserId) {
      // Already attributed, idempotent
      return {
        success: true,
        message: 'User already has attribution'
      };
    }
    
    // Find referrer
    const profileQuery = await db.collection('referral_profiles')
      .where('referralCode', '==', referralCode)
      .limit(1)
      .get();
    
    if (profileQuery.empty) {
      return {
        success: false,
        error: 'Referral code not found'
      };
    }
    
    const profileDoc = profileQuery.docs[0];
    const profile = profileDoc.data() as ReferralProfile;
    const referrerUserId = profile.userId;
    
    // Cannot refer yourself
    if (referrerUserId === userId) {
      return {
        success: false,
        error: 'Cannot use your own referral code'
      };
    }
    
    const now = serverTimestamp() as Timestamp;
    
    // Set attribution
    const attribution: UserAttribution = {
      userId,
      referralCode,
      referrerUserId,
      attributionSource: source || 'WEB_LANDING',
      attributedAt: now
    };
    
    await attributionRef.set(attribution, { merge: true });
    
    // Create signup event
    const eventId = generateId();
    const event: Omit<ReferralEvent, 'createdAt'> & { createdAt: any } = {
      eventId,
      referralCode,
      referrerUserId,
      eventType: 'SIGNUP',
      viewerUserId: userId,
      userAgentHash: null,
      ipCountry: null,
      createdAt: now,
      source: source || 'WEB_LANDING'
    };
    
    await db.collection('referral_events').doc(eventId).set(event);
    
    // Update referrer profile
    await profileDoc.ref.update({
      signupsAttributed: increment(1),
      installsAttributed: increment(1), // For v1, installs = signups
      lastSignupAt: now,
      lastUpdatedAt: now
    });
    
    console.log(`[Referrals] Attributed user ${userId} to referrer ${referrerUserId} via code ${referralCode}`);
    
    return {
      success: true,
      referrerUserId
    };
  } catch (error: any) {
    console.error('[Referrals] Error in attributionOnSignup:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Track milestone (first purchase, first paid action)
 * POST /referrals/track-milestone
 */
export const trackMilestone = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { userId, milestone, tokensPurchased } = data;
  
  // Only allow tracking own milestones
  if (userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot track milestone for another user');
  }
  
  if (!milestone || !['FIRST_PURCHASE', 'FIRST_PAID_ACTION'].includes(milestone)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid milestone type');
  }
  
  if (milestone === 'FIRST_PURCHASE' && !tokensPurchased) {
    throw new functions.https.HttpsError('invalid-argument', 'tokensPurchased required for FIRST_PURCHASE');
  }
  
  try {
    // Get user attribution
    const attributionDoc = await db.collection('user_attribution').doc(userId).get();
    
    if (!attributionDoc.exists || !attributionDoc.data()?.referrerUserId) {
      // No attribution = nothing to track
      return { success: true, message: 'No attribution found' };
    }
    
    const attribution = attributionDoc.data() as UserAttribution;
    const referrerUserId = attribution.referrerUserId!;
    const referralCode = attribution.referralCode!;
    
    // Check if milestone already tracked (idempotent)
    const existingEventQuery = await db.collection('referral_events')
      .where('viewerUserId', '==', userId)
      .where('eventType', '==', milestone)
      .limit(1)
      .get();
    
    if (!existingEventQuery.empty) {
      // Already tracked
      return { success: true, message: 'Milestone already tracked' };
    }
    
    const now = serverTimestamp() as Timestamp;
    
    // Create event
    const eventId = generateId();
    const event: Omit<ReferralEvent, 'createdAt'> & { createdAt: any } = {
      eventId,
      referralCode,
      referrerUserId,
      eventType: milestone,
      viewerUserId: userId,
      userAgentHash: null,
      ipCountry: null,
      createdAt: now,
      source: 'OTHER'
    };
    
    await db.collection('referral_events').doc(eventId).set(event);
    
    // Update referrer profile
    const profileRef = db.collection('referral_profiles').doc(referrerUserId);
    const updateData: any = {
      lastUpdatedAt: now
    };
    
    if (milestone === 'FIRST_PURCHASE') {
      // Check if this is first payer
      const existingPayerEvents = await db.collection('referral_events')
        .where('referrerUserId', '==', referrerUserId)
        .where('viewerUserId', '==', userId)
        .where('eventType', '==', 'FIRST_PURCHASE')
        .limit(1)
        .get();
      
      if (existingPayerEvents.empty) {
        updateData.payersCountTotal = increment(1);
      }
      
      updateData.tokensPurchasedByAttributedUsers = increment(tokensPurchased || 0);
    }
    
    await profileRef.update(updateData);
    
    console.log(`[Referrals] Tracked milestone ${milestone} for user ${userId}, referrer ${referrerUserId}`);
    
    return { success: true };
  } catch (error: any) {
    console.error('[Referrals] Error in trackMilestone:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get referral profile and stats
 * GET /referrals/get-profile
 */
export const getReferralProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = data.userId || context.auth.uid;
  
  // Only allow users to see their own referral profile
  if (userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot view another user\'s referral profile');
  }
  
  try {
    const profileDoc = await db.collection('referral_profiles').doc(userId).get();
    
    if (!profileDoc.exists) {
      // No profile yet
      return {
        hasProfile: false,
        userId
      };
    }
    
    const profile = profileDoc.data() as ReferralProfile;
    
    return {
      hasProfile: true,
      userId: profile.userId,
      referralCode: profile.referralCode,
      customSlug: profile.customSlug || null,
      stats: {
        clicksTotal: profile.clicksTotal,
        installsAttributed: profile.installsAttributed,
        signupsAttributed: profile.signupsAttributed,
        activeUsers30d: profile.activeUsers30d,
        payersCountTotal: profile.payersCountTotal,
        tokensPurchasedByAttributedUsers: profile.tokensPurchasedByAttributedUsers
      }
    };
  } catch (error: any) {
    console.error('[Referrals] Error in getReferralProfile:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// BACKGROUND JOBS
// ============================================================================

/**
 * Scheduled job to aggregate referral profiles
 * Computes activeUsers30d by checking attributed users with recent activity
 */
export const aggregateReferralProfiles = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    console.log('[Referrals] Starting daily aggregation of referral profiles');
    
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // Get all referral profiles with recent activity
      const profilesSnapshot = await db.collection('referral_profiles')
        .where('signupsAttributed', '>', 0)
        .get();
      
      let processedCount = 0;
      const batch = db.batch();
      
      for (const profileDoc of profilesSnapshot.docs) {
        const profile = profileDoc.data() as ReferralProfile;
        const referrerUserId = profile.userId;
        
        // Get all attributed users for this referrer
        const attributionsSnapshot = await db.collection('user_attribution')
          .where('referrerUserId', '==', referrerUserId)
          .get();
        
        let activeCount = 0;
        
        for (const attrDoc of attributionsSnapshot.docs) {
          const attr = attrDoc.data() as UserAttribution;
          const attributedUserId = attr.userId;
          
          // Check if user has recent activity (any transaction, message, etc.)
          // For simplicity, check transactions in last 30 days
          const recentActivityQuery = await db.collection('transactions')
            .where('senderUid', '==', attributedUserId)
            .where('createdAt', '>=', thirtyDaysAgo)
            .limit(1)
            .get();
          
          if (!recentActivityQuery.empty) {
            activeCount++;
          }
        }
        
        // Update profile with active count
        batch.update(profileDoc.ref, {
          activeUsers30d: activeCount,
          lastUpdatedAt: serverTimestamp()
        });
        
        processedCount++;
        
        // Commit batch every 500 documents
        if (processedCount % 500 === 0) {
          await batch.commit();
        }
      }
      
      // Commit remaining
      if (processedCount % 500 !== 0) {
        await batch.commit();
      }
      
      console.log(`[Referrals] Aggregated ${processedCount} referral profiles`);
      
      return { success: true, processedCount };
    } catch (error: any) {
      console.error('[Referrals] Error in aggregateReferralProfiles:', error);
      throw error;
    }
  });

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * Admin: Get referral profile for any user
 */
export const admin_getReferralProfile = functions.https.onCall(async (data, context) => {
  // TODO: Add admin authentication check
  const { userId } = data;
  
  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId is required');
  }
  
  try {
    const profileDoc = await db.collection('referral_profiles').doc(userId).get();
    
    if (!profileDoc.exists) {
      return {
        found: false,
        userId
      };
    }
    
    const profile = profileDoc.data() as ReferralProfile;
    
    // Get recent events
    const eventsSnapshot = await db.collection('referral_events')
      .where('referrerUserId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    
    const events = eventsSnapshot.docs.map(doc => doc.data());
    
    return {
      found: true,
      profile,
      recentEvents: events
    };
  } catch (error: any) {
    console.error('[Referrals] Error in admin_getReferralProfile:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

console.log('✅ PACK 66 — Referrals module loaded (tracking only, no rewards)');