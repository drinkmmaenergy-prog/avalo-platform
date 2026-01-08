/**
 * Ads & Sponsorship Service
 * Phase 4: Placeholder implementation (no real ad SDK)
 */

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { ADS_AND_SPONSORSHIP_CONFIG } from '../config/monetization';

const getDb = () => {
  try {
    const app = getApp();
    return getFirestore(app);
  } catch (error) {
    console.error('Error getting Firestore instance:', error);
    throw error;
  }
};

/**
 * Sponsored profiles configuration
 * In production, this would be fetched from backend
 */
export interface SponsoredProfile {
  uid: string;
  displayName: string;
  isSponsored: true;
  sponsorshipTier: 'basic' | 'premium' | 'featured';
  visibilityMultiplier: number;
}

/**
 * Get sponsored profiles for injection into discovery/feed
 */
export function getSponsoredProfiles(): SponsoredProfile[] {
  // Placeholder: In production, fetch from backend based on active campaigns
  return [
    {
      uid: 'sponsored_profile_1',
      displayName: 'Featured Creator',
      isSponsored: true,
      sponsorshipTier: 'featured',
      visibilityMultiplier: ADS_AND_SPONSORSHIP_CONFIG.SPONSORED_VISIBILITY_MULTIPLIER,
    },
  ];
}

/**
 * Watch a rewarded ad (placeholder)
 * In production, integrate with ad provider SDK
 */
export async function watchRewardedAd(
  userId: string
): Promise<{ success: boolean; tokensEarned?: number; error?: string }> {
  try {
    const db = getDb();
    const tokensEarned = ADS_AND_SPONSORSHIP_CONFIG.REWARDED_AD_TOKENS;
    
    // In production: Show actual ad via SDK (AdMob, etc.)
    // For now, simulate ad watch
    
    // Credit user tokens
    const walletRef = doc(db, 'balances', userId, 'wallet');
    await updateDoc(walletRef, {
      tokens: increment(tokensEarned),
      lastUpdated: serverTimestamp(),
    });
    
    // Record transaction
    const transactionsRef = collection(db, 'transactions');
    await addDoc(transactionsRef, {
      senderUid: 'system',
      receiverUid: userId,
      tokensAmount: tokensEarned,
      avaloFee: 0,
      chatId: 'rewarded_ad',
      transactionType: 'rewarded_ad',
      createdAt: serverTimestamp(),
    });
    
    return {
      success: true,
      tokensEarned,
    };
  } catch (error) {
    console.error('Error processing rewarded ad:', error);
    return {
      success: false,
      error: 'AD_ERROR',
    };
  }
}

/**
 * Record sponsored profile impression
 */
export async function recordSponsoredImpression(
  profileUid: string,
  viewerUid: string
): Promise<void> {
  try {
    const db = getDb();
    const impressionsRef = collection(db, 'sponsored_impressions');
    
    await addDoc(impressionsRef, {
      profileUid,
      viewerUid,
      timestamp: serverTimestamp(),
      type: 'profile_view',
    });
  } catch (error) {
    console.error('Error recording impression:', error);
  }
}

/**
 * Record native ad impression
 */
export async function recordNativeAdImpression(
  adId: string,
  userId: string
): Promise<void> {
  try {
    const db = getDb();
    const impressionsRef = collection(db, 'ad_impressions');
    
    await addDoc(impressionsRef, {
      adId,
      userId,
      timestamp: serverTimestamp(),
      type: 'native_feed',
    });
  } catch (error) {
    console.error('Error recording ad impression:', error);
  }
}

/**
 * Check if user can watch rewarded ad (rate limiting)
 */
export function canWatchRewardedAd(): boolean {
  // In production: implement rate limiting (e.g., max 5 per day)
  // For now, always allow
  return true;
}