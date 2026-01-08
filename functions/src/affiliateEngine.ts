/**
 * Phase 13 - Affiliate Engine
 * Lightweight affiliate/influencer tracking extension of referral system
 * 
 * IMPORTANT: This module only ADDS new affiliate tracking.
 * It does NOT modify ANY existing monetization, chat, call, or payout logic.
 */

import { db, serverTimestamp, increment } from './init';

// ============================================================================
// TYPES
// ============================================================================

export interface AffiliateProfile {
  userId: string;
  isAffiliate: boolean;
  affiliateLevel: 'standard' | 'pro';
  activatedAt: Date;
  referredSignups: number;
  referredPayers: number;
  totalReferredRevenueTokens: number;
  lastUpdated: Date;
}

export interface AffiliatePerformance {
  userId: string;
  period: 'daily' | 'weekly' | 'monthly' | 'lifetime';
  signups: number;
  conversions: number;
  revenueGenerated: number;
  commissionEarned: number;
  date: string;
}

// ============================================================================
// AFFILIATE MANAGEMENT
// ============================================================================

/**
 * Mark user as affiliate/influencer
 */
export async function setAffiliateStatus(
  userId: string,
  isAffiliate: boolean,
  level: 'standard' | 'pro' = 'standard'
): Promise<void> {
  try {
    const profileRef = db.collection('affiliateProfiles').doc(userId);
    const profileSnap = await profileRef.get();
    
    if (!profileSnap.exists) {
      const newProfile: Omit<AffiliateProfile, 'activatedAt' | 'lastUpdated'> & {
        activatedAt: any;
        lastUpdated: any;
      } = {
        userId,
        isAffiliate,
        affiliateLevel: level,
        activatedAt: serverTimestamp(),
        referredSignups: 0,
        referredPayers: 0,
        totalReferredRevenueTokens: 0,
        lastUpdated: serverTimestamp(),
      };
      
      await profileRef.set(newProfile);
    } else {
      await profileRef.update({
        isAffiliate,
        affiliateLevel: level,
        lastUpdated: serverTimestamp(),
      });
    }
    
    // Update user profile
    await db.collection('users').doc(userId).update({
      'affiliate.isAffiliate': isAffiliate,
      'affiliate.level': level,
      'affiliate.updatedAt': serverTimestamp(),
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Get affiliate profile
 */
export async function getAffiliateProfile(userId: string): Promise<AffiliateProfile | null> {
  try {
    const profileRef = db.collection('affiliateProfiles').doc(userId);
    const profileSnap = await profileRef.get();
    
    if (!profileSnap.exists) {
      return null;
    }
    
    const data = profileSnap.data();
    return {
      userId,
      isAffiliate: data.isAffiliate || false,
      affiliateLevel: data.affiliateLevel || 'standard',
      activatedAt: data.activatedAt?.toDate() || new Date(),
      referredSignups: data.referredSignups || 0,
      referredPayers: data.referredPayers || 0,
      totalReferredRevenueTokens: data.totalReferredRevenueTokens || 0,
      lastUpdated: data.lastUpdated?.toDate() || new Date(),
    };
  } catch (error) {
    return null;
  }
}

// ============================================================================
// TRACKING
// ============================================================================

/**
 * Track affiliate performance when referred user takes action
 * Called from referralEngine and monetization flows
 */
export async function trackAffiliateActivity(
  affiliateId: string,
  eventType: 'signup' | 'payment',
  revenueTokens: number = 0
): Promise<void> {
  try {
    // Check if user is an affiliate
    const profile = await getAffiliateProfile(affiliateId);
    if (!profile || !profile.isAffiliate) {
      return; // Not an affiliate - skip tracking
    }
    
    const profileRef = db.collection('affiliateProfiles').doc(affiliateId);
    
    if (eventType === 'signup') {
      await profileRef.update({
        referredSignups: increment(1),
        lastUpdated: serverTimestamp(),
      });
    } else if (eventType === 'payment') {
      await profileRef.update({
        referredPayers: increment(1),
        totalReferredRevenueTokens: increment(revenueTokens),
        lastUpdated: serverTimestamp(),
      });
    }
    
    // Record performance event
    await db.collection('affiliatePerformance').add({
      userId: affiliateId,
      eventType,
      revenueTokens,
      timestamp: serverTimestamp(),
      date: new Date().toISOString().split('T')[0],
    });
  } catch (error) {
    // Tracking failure should not break main flow
  }
}

/**
 * Get affiliate performance stats
 */
export async function getAffiliatePerformance(
  userId: string,
  period: 'daily' | 'weekly' | 'monthly' | 'lifetime' = 'lifetime'
): Promise<{
  signups: number;
  conversions: number;
  revenueGenerated: number;
  conversionRate: number;
}> {
  try {
    const profile = await getAffiliateProfile(userId);
    
    if (!profile || !profile.isAffiliate) {
      return {
        signups: 0,
        conversions: 0,
        revenueGenerated: 0,
        conversionRate: 0,
      };
    }
    
    // For now, return lifetime stats
    // Can be enhanced with time-based filtering
    const signups = profile.referredSignups;
    const conversions = profile.referredPayers;
    const revenueGenerated = profile.totalReferredRevenueTokens;
    const conversionRate = signups > 0 ? (conversions / signups) * 100 : 0;
    
    return {
      signups,
      conversions,
      revenueGenerated,
      conversionRate,
    };
  } catch (error) {
    return {
      signups: 0,
      conversions: 0,
      revenueGenerated: 0,
      conversionRate: 0,
    };
  }
}

/**
 * Check if user is an affiliate
 */
export async function isAffiliate(userId: string): Promise<boolean> {
  try {
    const profile = await getAffiliateProfile(userId);
    return profile?.isAffiliate || false;
  } catch (error) {
    return false;
  }
}

// ============================================================================
// INTEGRATION HOOKS
// ============================================================================

/**
 * Hook to call when a referred user signs up
 * Should be called from referralEngine
 */
export async function onReferredUserSignup(referrerId: string): Promise<void> {
  await trackAffiliateActivity(referrerId, 'signup');
}

/**
 * Hook to call when a referred user makes a payment
 * Should be called from monetization flows
 */
export async function onReferredUserPayment(
  referrerId: string,
  revenueTokens: number
): Promise<void> {
  await trackAffiliateActivity(referrerId, 'payment', revenueTokens);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  setAffiliateStatus,
  getAffiliateProfile,
  getAffiliatePerformance,
  isAffiliate,
  trackAffiliateActivity,
  onReferredUserSignup,
  onReferredUserPayment,
};