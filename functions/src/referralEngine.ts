/**
 * Phase 13 - Referral Engine
 * Manages referral codes, tracking, and rewards
 * 
 * IMPORTANT: This module only ADDS new referral functionality.
 * It does NOT modify ANY existing monetization, chat, call, or payout logic.
 */

import { db, serverTimestamp, generateId, increment } from './init';

// ============================================================================
// TYPES
// ============================================================================

export interface ReferralCode {
  userId: string;
  code: string;
  createdAt: Date;
  totalInvites: number;
  verifiedInvites: number;
  payingInvites: number;
  totalRewardsEarned: number;
  isActive: boolean;
}

export interface ReferralEvent {
  type: 'signup' | 'verification' | 'first_payment';
  referrerId: string;
  referredUserId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ReferralReward {
  referrerId: string;
  referredUserId: string;
  eventType: string;
  tokensRewarded: number;
  timestamp: Date;
  processed: boolean;
}

export interface ReferralStats {
  userId: string;
  code: string;
  totalInvites: number;
  verifiedInvites: number;
  payingInvites: number;
  totalRewardsEarned: number;
  pendingRewards: number;
  recentReferrals: Array<{
    userId: string;
    status: 'pending' | 'verified' | 'paying';
    joinedAt: Date;
  }>;
}

// ============================================================================
// REWARD CONFIGURATION
// ============================================================================

const REFERRAL_REWARDS = {
  SIGNUP: 10, // Basic signup bonus
  VERIFICATION: 50, // When referred user verifies (KYC/selfie)
  FIRST_PAYMENT: 100, // When referred user makes first paid action
} as const;

// ============================================================================
// REFERRAL CODE GENERATION
// ============================================================================

/**
 * Generate a unique referral code
 * Format: USER-XXXXX (5 random alphanumeric chars)
 */
function generateReferralCodeString(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `AVALO-${code}`;
}

/**
 * Create or get referral code for a user
 */
export async function createReferralCode(userId: string): Promise<string> {
  try {
    // Check if user already has a code
    const existingCodeRef = db.collection('referralCodes').doc(userId);
    const existingCodeSnap = await existingCodeRef.get();
    
    if (existingCodeSnap.exists) {
      return existingCodeSnap.data()?.code || '';
    }
    
    // Generate unique code
    let code = generateReferralCodeString();
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!isUnique && attempts < maxAttempts) {
      const codeQuery = await db.collection('referralCodes')
        .where('code', '==', code)
        .limit(1)
        .get();
      
      if (codeQuery.empty) {
        isUnique = true;
      } else {
        code = generateReferralCodeString();
        attempts++;
      }
    }
    
    if (!isUnique) {
      throw new Error('Failed to generate unique referral code');
    }
    
    // Store the code
    const referralCode: ReferralCode = {
      userId,
      code,
      createdAt: new Date(),
      totalInvites: 0,
      verifiedInvites: 0,
      payingInvites: 0,
      totalRewardsEarned: 0,
      isActive: true,
    };
    
    await existingCodeRef.set(referralCode);
    
    // Initialize stats document
    await db.collection('referralStats').doc(userId).set({
      userId,
      code,
      totalInvites: 0,
      verifiedInvites: 0,
      payingInvites: 0,
      totalRewardsEarned: 0,
      pendingRewards: 0,
      lastUpdated: serverTimestamp(),
    });
    
    return code;
  } catch (error) {
    console.error('Error creating referral code:', error);
    throw error;
  }
}

/**
 * Get user's referral code
 */
export async function getReferralCode(userId: string): Promise<string> {
  try {
    const codeRef = db.collection('referralCodes').doc(userId);
    const codeSnap = await codeRef.get();
    
    if (!codeSnap.exists) {
      // Create new code
      return await createReferralCode(userId);
    }
    
    return codeSnap.data()?.code || '';
  } catch (error) {
    console.error('Error getting referral code:', error);
    throw error;
  }
}

// ============================================================================
// APPLY REFERRAL CODE
// ============================================================================

/**
 * Apply referral code for a new user
 * Can only be applied once per user
 */
export async function applyReferralCode(
  referralCode: string,
  newUserId: string
): Promise<{ success: boolean; message: string; referrerId?: string }> {
  try {
    // Check if user already has a referrer
    const userRef = db.collection('users').doc(newUserId);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      return { success: false, message: 'User not found' };
    }
    
    const userData = userSnap.data();
    if (userData?.referredBy) {
      return { success: false, message: 'User already referred by someone' };
    }
    
    // Find referrer by code
    const referralCodeQuery = await db.collection('referralCodes')
      .where('code', '==', referralCode.toUpperCase())
      .where('isActive', '==', true)
      .limit(1)
      .get();
    
    if (referralCodeQuery.empty) {
      return { success: false, message: 'Invalid referral code' };
    }
    
    const referrerDoc = referralCodeQuery.docs[0];
    const referrerId = referrerDoc.data().userId;
    
    // Can't refer yourself
    if (referrerId === newUserId) {
      return { success: false, message: 'Cannot use your own referral code' };
    }
    
    // Create referral record
    const referralId = generateId();
    await db.collection('referrals').doc(referralId).set({
      referrerId,
      referredUserId: newUserId,
      code: referralCode.toUpperCase(),
      status: 'pending',
      signupDate: serverTimestamp(),
      verificationDate: null,
      firstPaymentDate: null,
      totalRewardsGenerated: 0,
      createdAt: serverTimestamp(),
    });
    
    // Update user's referrer
    await userRef.update({
      referredBy: referrerId,
      referralCode: referralCode.toUpperCase(),
      referredAt: serverTimestamp(),
    });
    
    // Update referrer stats
    await db.collection('referralCodes').doc(referrerId).update({
      totalInvites: increment(1),
    });
    
    await db.collection('referralStats').doc(referrerId).update({
      totalInvites: increment(1),
      lastUpdated: serverTimestamp(),
    });
    
    // Record signup event
    await recordReferralEvent('signup', referrerId, newUserId, {
      code: referralCode,
    });
    
    // Award signup bonus
    await grantReferralReward(referrerId, newUserId, 'signup', REFERRAL_REWARDS.SIGNUP);
    
    return { success: true, message: 'Referral code applied successfully', referrerId };
  } catch (error) {
    console.error('Error applying referral code:', error);
    return { success: false, message: 'Failed to apply referral code' };
  }
}

// ============================================================================
// EVENT RECORDING
// ============================================================================

/**
 * Record a referral event
 */
export async function recordReferralEvent(
  type: 'signup' | 'verification' | 'first_payment',
  referrerId: string,
  referredUserId: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const event: Omit<ReferralEvent, 'timestamp'> & { timestamp: any } = {
      type,
      referrerId,
      referredUserId,
      timestamp: serverTimestamp(),
      metadata: metadata || {},
    };
    
    await db.collection('referralEvents').add(event);
    
    // Update referral status based on event type
    if (type === 'verification') {
      await handleVerificationEvent(referrerId, referredUserId);
    } else if (type === 'first_payment') {
      await handleFirstPaymentEvent(referrerId, referredUserId);
    }
  } catch (error) {
    console.error('Error recording referral event:', error);
    throw error;
  }
}

/**
 * Handle verification event
 */
async function handleVerificationEvent(referrerId: string, referredUserId: string): Promise<void> {
  try {
    // Check if referrer is verified
    const referrerRef = db.collection('users').doc(referrerId);
    const referrerSnap = await referrerRef.get();
    
    if (!referrerSnap.exists) return;
    
    const referrerData = referrerSnap.data();
    const isReferrerVerified = referrerData?.isVerified || false;
    
    // Only verified users can earn from referrals
    if (!isReferrerVerified) {
      console.log(`Referrer ${referrerId} not verified - skipping reward`);
      return;
    }
    
    // Update referral record
    const referralQuery = await db.collection('referrals')
      .where('referrerId', '==', referrerId)
      .where('referredUserId', '==', referredUserId)
      .limit(1)
      .get();
    
    if (!referralQuery.empty) {
      const referralDoc = referralQuery.docs[0];
      await referralDoc.ref.update({
        status: 'verified',
        verificationDate: serverTimestamp(),
      });
    }
    
    // Update stats
    await db.collection('referralCodes').doc(referrerId).update({
      verifiedInvites: increment(1),
    });
    
    await db.collection('referralStats').doc(referrerId).update({
      verifiedInvites: increment(1),
      lastUpdated: serverTimestamp(),
    });
    
    // Grant verification reward
    await grantReferralReward(referrerId, referredUserId, 'verification', REFERRAL_REWARDS.VERIFICATION);
  } catch (error) {
    console.error('Error handling verification event:', error);
  }
}

/**
 * Handle first payment event
 */
async function handleFirstPaymentEvent(referrerId: string, referredUserId: string): Promise<void> {
  try {
    // Check if referrer is verified
    const referrerRef = db.collection('users').doc(referrerId);
    const referrerSnap = await referrerRef.get();
    
    if (!referrerSnap.exists) return;
    
    const referrerData = referrerSnap.data();
    const isReferrerVerified = referrerData?.isVerified || false;
    
    if (!isReferrerVerified) {
      console.log(`Referrer ${referrerId} not verified - skipping reward`);
      return;
    }
    
    // Update referral record
    const referralQuery = await db.collection('referrals')
      .where('referrerId', '==', referrerId)
      .where('referredUserId', '==', referredUserId)
      .limit(1)
      .get();
    
    if (!referralQuery.empty) {
      const referralDoc = referralQuery.docs[0];
      await referralDoc.ref.update({
        status: 'paying',
        firstPaymentDate: serverTimestamp(),
      });
    }
    
    // Update stats
    await db.collection('referralCodes').doc(referrerId).update({
      payingInvites: increment(1),
    });
    
    await db.collection('referralStats').doc(referrerId).update({
      payingInvites: increment(1),
      lastUpdated: serverTimestamp(),
    });
    
    // Grant first payment reward
    await grantReferralReward(referrerId, referredUserId, 'first_payment', REFERRAL_REWARDS.FIRST_PAYMENT);
  } catch (error) {
    console.error('Error handling first payment event:', error);
  }
}

// ============================================================================
// REWARD GRANTING
// ============================================================================

/**
 * Grant referral reward tokens to referrer
 */
async function grantReferralReward(
  referrerId: string,
  referredUserId: string,
  eventType: string,
  tokensAmount: number
): Promise<void> {
  try {
    // Add tokens to referrer's wallet
    const walletRef = db.collection('balances').doc(referrerId).collection('wallet').doc('wallet');
    const walletSnap = await walletRef.get();
    
    if (walletSnap.exists) {
      await walletRef.update({
        tokens: increment(tokensAmount),
        lastUpdated: serverTimestamp(),
      });
    } else {
      await walletRef.set({
        tokens: tokensAmount,
        lastUpdated: serverTimestamp(),
      });
    }
    
    // Record reward
    await db.collection('referralRewards').add({
      referrerId,
      referredUserId,
      eventType,
      tokensRewarded: tokensAmount,
      timestamp: serverTimestamp(),
      processed: true,
    });
    
    // Update stats
    await db.collection('referralStats').doc(referrerId).update({
      totalRewardsEarned: increment(tokensAmount),
      lastUpdated: serverTimestamp(),
    });
    
    await db.collection('referralCodes').doc(referrerId).update({
      totalRewardsEarned: increment(tokensAmount),
    });
    
    // Record transaction
    await db.collection('transactions').add({
      senderUid: 'referral_system',
      receiverUid: referrerId,
      tokensAmount,
      avaloFee: 0,
      transactionType: 'referral_reward',
      referralEventType: eventType,
      referredUserId,
      createdAt: serverTimestamp(),
      validated: true,
    });
    
    // Integrate with ranking system
    try {
      const { recordRankingAction } = await import('./rankingEngine');
      await recordRankingAction({
        type: 'tip', // Count referral rewards as tips for ranking
        creatorId: referrerId,
        payerId: 'referral_system',
        tokensAmount,
        points: tokensAmount, // 1 point per token for tips
        timestamp: new Date(),
      });
    } catch (error) {
      // Ranking integration optional - don't fail reward if ranking fails
    }
  } catch (error) {
    console.error('Error granting referral reward:', error);
    throw error;
  }
}

// ============================================================================
// GET REFERRAL DETAILS
// ============================================================================

/**
 * Get detailed referral stats for a user
 */
export async function getReferralDetails(userId: string): Promise<ReferralStats> {
  try {
    const statsRef = db.collection('referralStats').doc(userId);
    const statsSnap = await statsRef.get();
    
    if (!statsSnap.exists) {
      // Initialize stats
      const code = await getReferralCode(userId);
      return {
        userId,
        code,
        totalInvites: 0,
        verifiedInvites: 0,
        payingInvites: 0,
        totalRewardsEarned: 0,
        pendingRewards: 0,
        recentReferrals: [],
      };
    }
    
    const stats = statsSnap.data();
    
    // Get recent referrals
    const referralsQuery = await db.collection('referrals')
      .where('referrerId', '==', userId)
      .orderBy('signupDate', 'desc')
      .limit(10)
      .get();
    
    const recentReferrals = referralsQuery.docs.map(doc => {
      const data = doc.data();
      return {
        userId: data.referredUserId,
        status: data.status,
        joinedAt: data.signupDate?.toDate() || new Date(),
      };
    });
    
    return {
      userId,
      code: stats.code || '',
      totalInvites: stats.totalInvites || 0,
      verifiedInvites: stats.verifiedInvites || 0,
      payingInvites: stats.payingInvites || 0,
      totalRewardsEarned: stats.totalRewardsEarned || 0,
      pendingRewards: stats.pendingRewards || 0,
      recentReferrals,
    };
  } catch (error) {
    console.error('Error getting referral details:', error);
    throw error;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  REFERRAL_REWARDS,
};