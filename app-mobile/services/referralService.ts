/**
 * Referral Service for Avalo Mobile App
 * PACK 66 — Web Landing + Referral & Influencer Tracking
 * 
 * Handles referral code generation, attribution, and analytics.
 * NO rewards/bonuses - tracking only.
 */

import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  lastClickAt?: number | null;
  lastSignupAt?: number | null;
}

export interface ReferralStats {
  hasProfile: boolean;
  userId: string;
  referralCode?: string;
  customSlug?: string | null;
  stats?: {
    clicksTotal: number;
    installsAttributed: number;
    signupsAttributed: number;
    activeUsers30d: number;
    payersCountTotal: number;
    tokensPurchasedByAttributedUsers: number;
  };
}

export type AttributionSource = 'WEB_LANDING' | 'DEEP_LINK' | 'MANUAL' | 'OTHER';

// ============================================================================
// CONSTANTS
// ============================================================================

const PENDING_REFERRAL_KEY = 'pending_referral_code';
const PENDING_SOURCE_KEY = 'pending_referral_source';

// ============================================================================
// LOCAL STORAGE HELPERS
// ============================================================================

/**
 * Store pending referral code (before signup)
 */
export async function storePendingReferralCode(
  referralCode: string,
  source: AttributionSource = 'DEEP_LINK'
): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_REFERRAL_KEY, referralCode);
    await AsyncStorage.setItem(PENDING_SOURCE_KEY, source);
    console.log(`[Referral] Stored pending referral code: ${referralCode}`);
  } catch (error) {
    console.error('[Referral] Error storing pending referral code:', error);
  }
}

/**
 * Get pending referral code
 */
export async function getPendingReferralCode(): Promise<{
  code: string | null;
  source: AttributionSource;
}> {
  try {
    const code = await AsyncStorage.getItem(PENDING_REFERRAL_KEY);
    const source = (await AsyncStorage.getItem(PENDING_SOURCE_KEY)) as AttributionSource | null;
    
    return {
      code,
      source: source || 'DEEP_LINK'
    };
  } catch (error) {
    console.error('[Referral] Error getting pending referral code:', error);
    return { code: null, source: 'DEEP_LINK' };
  }
}

/**
 * Clear pending referral code
 */
export async function clearPendingReferralCode(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_REFERRAL_KEY);
    await AsyncStorage.removeItem(PENDING_SOURCE_KEY);
    console.log('[Referral] Cleared pending referral code');
  } catch (error) {
    console.error('[Referral] Error clearing pending referral code:', error);
  }
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Get or create referral code for current user
 */
export async function getOrCreateReferralCode(userId: string): Promise<ReferralProfile> {
  const createOrGet = httpsCallable(functions, 'createOrGetReferralCode');
  
  try {
    const result = await createOrGet({ userId });
    return result.data as ReferralProfile;
  } catch (error: any) {
    console.error('[Referral] Error getting/creating referral code:', error);
    throw new Error(error.message || 'Failed to get referral code');
  }
}

/**
 * Send signup attribution
 * Should be called once after user completes signup
 */
export async function sendSignupAttribution(
  newUserId: string,
  referralCode: string | null,
  source: AttributionSource = 'DEEP_LINK'
): Promise<void> {
  if (!referralCode) {
    console.log('[Referral] No referral code, skipping attribution');
    return;
  }
  
  const attributionFn = httpsCallable(functions, 'attributionOnSignup');
  
  try {
    const result = await attributionFn({
      newUserId,
      referralCode,
      source
    });
    
    const data = result.data as any;
    
    if (data.success) {
      console.log('[Referral] Signup attribution successful');
    } else {
      console.warn('[Referral] Signup attribution failed:', data.error);
    }
  } catch (error: any) {
    console.error('[Referral] Error sending signup attribution:', error);
    // Don't throw - attribution failure shouldn't block signup
  }
}

/**
 * Track referral milestone (first purchase, first paid action)
 */
export async function trackReferralMilestone(
  userId: string,
  milestone: 'FIRST_PURCHASE' | 'FIRST_PAID_ACTION',
  tokensPurchased?: number
): Promise<void> {
  const trackMilestoneFn = httpsCallable(functions, 'trackMilestone');
  
  try {
    const result = await trackMilestoneFn({
      userId,
      milestone,
      tokensPurchased
    });
    
    const data = result.data as any;
    
    if (data.success) {
      console.log(`[Referral] Milestone ${milestone} tracked successfully`);
    } else {
      console.warn('[Referral] Milestone tracking failed:', data.message);
    }
  } catch (error: any) {
    console.error('[Referral] Error tracking milestone:', error);
    // Don't throw - milestone tracking shouldn't block transactions
  }
}

/**
 * Get referral profile and stats for current user
 */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const getProfile = httpsCallable(functions, 'getReferralProfile');
  
  try {
    const result = await getProfile({ userId });
    return result.data as ReferralStats;
  } catch (error: any) {
    console.error('[Referral] Error getting referral stats:', error);
    throw new Error(error.message || 'Failed to get referral stats');
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format referral link for sharing
 */
export function formatReferralLink(referralCode: string, baseUrl: string = 'https://avalo.app'): string {
  return `${baseUrl}/r/${referralCode}`;
}

/**
 * Extract referral code from deep link URL
 */
export function extractReferralCodeFromUrl(url: string): string | null {
  try {
    // Handle various URL formats:
    // - https://avalo.app/r/anna54
    // - https://avalo.app/?ref=anna54
    // - avalo://signup?ref=anna54
    
    const urlObj = new URL(url);
    
    // Check path-based code (/r/CODE)
    const pathMatch = urlObj.pathname.match(/\/r\/([a-z0-9]+)/i);
    if (pathMatch) {
      return pathMatch[1];
    }
    
    // Check query param (?ref=CODE)
    const refParam = urlObj.searchParams.get('ref');
    if (refParam) {
      return refParam;
    }
    
    return null;
  } catch (error) {
    console.error('[Referral] Error extracting referral code from URL:', error);
    return null;
  }
}

/**
 * Check if user needs to complete attribution
 * Call this after signup to process any pending referral
 */
export async function processPendingAttribution(userId: string): Promise<boolean> {
  try {
    const { code, source } = await getPendingReferralCode();
    
    if (!code) {
      return false;
    }
    
    await sendSignupAttribution(userId, code, source);
    await clearPendingReferralCode();
    
    return true;
  } catch (error) {
    console.error('[Referral] Error processing pending attribution:', error);
    return false;
  }
}

/**
 * Format stats for display
 */
export function formatReferralStats(stats: ReferralStats): {
  signups: string;
  active: string;
  payers: string;
  tokens: string;
} {
  if (!stats.hasProfile || !stats.stats) {
    return {
      signups: '0',
      active: '0',
      payers: '0',
      tokens: '0'
    };
  }
  
  return {
    signups: stats.stats.signupsAttributed.toString(),
    active: stats.stats.activeUsers30d.toString(),
    payers: stats.stats.payersCountTotal.toString(),
    tokens: stats.stats.tokensPurchasedByAttributedUsers.toString()
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Local storage
  storePendingReferralCode,
  getPendingReferralCode,
  clearPendingReferralCode,
  
  // API functions
  getOrCreateReferralCode,
  sendSignupAttribution,
  trackReferralMilestone,
  getReferralStats,
  
  // Helper functions
  formatReferralLink,
  extractReferralCodeFromUrl,
  processPendingAttribution,
  formatReferralStats
};