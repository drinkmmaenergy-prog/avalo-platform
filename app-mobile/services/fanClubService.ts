/**
 * PACK 259: Fan Clubs / Support Circles
 * Mobile service for Fan Club operations
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import type {
  FanClubSettings,
  FanClubMembership,
  FanClubContent,
  FanClubAnalytics,
  FanClubTier,
  TopSupporter,
} from '../types/fanClubs';

// ============================================================================
// FAN CLUB SETTINGS (CREATOR)
// ============================================================================

export async function enableFanClub(params: {
  availableTiers: FanClubTier[];
  welcomeMessage?: string;
  groupChatEnabled?: boolean;
  liveStreamsEnabled?: boolean;
  eventsEnabled?: boolean;
}): Promise<{ success: boolean; settings: FanClubSettings }> {
  const enableFanClubFn = httpsCallable<typeof params, { success: boolean; settings: FanClubSettings }>(
    functions,
    'enableFanClub'
  );
  const result = await enableFanClubFn(params);
  return result.data;
}

export async function updateFanClubSettings(
  updates: Partial<FanClubSettings>
): Promise<{ success: boolean }> {
  const updateFanClubSettingsFn = httpsCallable<
    Partial<FanClubSettings>,
    { success: boolean }
  >(functions, 'updateFanClubSettings');
  const result = await updateFanClubSettingsFn(updates);
  return result.data;
}

export async function disableFanClub(): Promise<{ success: boolean }> {
  const disableFanClubFn = httpsCallable<void, { success: boolean }>(
    functions,
    'disableFanClub'
  );
  const result = await disableFanClubFn();
  return result.data;
}

// ============================================================================
// MEMBERSHIP MANAGEMENT (MEMBER)
// ============================================================================

export async function joinFanClub(params: {
  creatorId: string;
  tier: FanClubTier;
  billingType?: 'monthly' | 'one_time';
}): Promise<{
  success: boolean;
  membershipId: string;
  tier: FanClubTier;
  nextBillingDate: number | null;
}> {
  const joinFanClubFn = httpsCallable<
    typeof params,
    {
      success: boolean;
      membershipId: string;
      tier: FanClubTier;
      nextBillingDate: number | null;
    }
  >(functions, 'joinFanClub');
  const result = await joinFanClubFn(params);
  return result.data;
}

export async function leaveFanClub(params: {
  creatorId: string;
}): Promise<{
  success: boolean;
  message: string;
  expiresAt: number;
}> {
  const leaveFanClubFn = httpsCallable<
    typeof params,
    {
      success: boolean;
      message: string;
      expiresAt: number;
    }
  >(functions, 'leaveFanClub');
  const result = await leaveFanClubFn(params);
  return result.data;
}

export async function changeFanClubTier(params: {
  creatorId: string;
  newTier: FanClubTier;
}): Promise<{
  success: boolean;
  newTier: FanClubTier;
  message: string;
}> {
  const changeFanClubTierFn = httpsCallable<
    typeof params,
    {
      success: boolean;
      newTier: FanClubTier;
      message: string;
    }
  >(functions, 'changeFanClubTier');
  const result = await changeFanClubTierFn(params);
  return result.data;
}

// ============================================================================
// CREATOR TOOLS
// ============================================================================

export async function sendExclusiveDrop(params: {
  contentId: string;
  minimumTier: FanClubTier;
}): Promise<{
  success: boolean;
  notifiedCount: number;
}> {
  const sendExclusiveDropFn = httpsCallable<
    typeof params,
    {
      success: boolean;
      notifiedCount: number;
    }
  >(functions, 'sendExclusiveDrop');
  const result = await sendExclusiveDropFn(params);
  return result.data;
}

export async function sendFanClubAnnouncement(params: {
  message: string;
}): Promise<{
  success: boolean;
  notifiedCount: number;
}> {
  const sendFanClubAnnouncementFn = httpsCallable<
    typeof params,
    {
      success: boolean;
      notifiedCount: number;
    }
  >(functions, 'sendFanClubAnnouncement');
  const result = await sendFanClubAnnouncementFn(params);
  return result.data;
}

export async function getFanClubAnalytics(): Promise<FanClubAnalytics> {
  const getFanClubAnalyticsFn = httpsCallable<void, FanClubAnalytics>(
    functions,
    'getFanClubAnalytics'
  );
  const result = await getFanClubAnalyticsFn();
  return result.data;
}

export async function getTopSupporters(params?: {
  limit?: number;
}): Promise<{ supporters: TopSupporter[] }> {
  const getTopSupportersFn = httpsCallable<
    { limit?: number },
    { supporters: TopSupporter[] }
  >(functions, 'getTopSupporters');
  const result = await getTopSupportersFn(params || {});
  return result.data;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if user can afford to join a Fan Club tier
 */
export function canAffordTier(
  userBalance: number,
  tier: FanClubTier
): boolean {
  const prices: Record<FanClubTier, number> = {
    silver: 250,
    gold: 750,
    diamond: 1500,
    royal_elite: 2500,
  };
  return userBalance >= prices[tier];
}

/**
 * Get tier display info
 */
export function getTierDisplayInfo(tier: FanClubTier): {
  name: string;
  price: number;
  emoji: string;
  color: string;
} {
  const configs: Record<
    FanClubTier,
    { name: string; price: number; emoji: string; color: string }
  > = {
    silver: { name: 'Silver', price: 250, emoji: '🥈', color: '#C0C0C0' },
    gold: { name: 'Gold', price: 750, emoji: '🥇', color: '#FFD700' },
    diamond: { name: 'Diamond', price: 1500, emoji: '💎', color: '#B9F2FF' },
    royal_elite: {
      name: 'Royal Elite',
      price: 2500,
      emoji: '👑',
      color: '#9B59B6',
    },
  };
  return configs[tier];
}

/**
 * Format billing cycle date
 */
export function formatBillingDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Calculate days until next billing
 */
export function daysUntilNextBilling(nextBillingDate: number): number {
  const now = Date.now();
  const diff = nextBillingDate - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Check if membership is active
 */
export function isMembershipActive(membership: FanClubMembership): boolean {
  return membership.status === 'active';
}

/**
 * Check if membership is expiring soon (within 3 days)
 */
export function isMembershipExpiringSoon(
  membership: FanClubMembership
): boolean {
  if (!membership.nextBillingDate || membership.status !== 'active') {
    return false;
  }
  return daysUntilNextBilling(membership.nextBillingDate) <= 3;
}

/**
 * Get features by tier
 */
export function getTierFeatures(tier: FanClubTier): string[] {
  const features: Record<FanClubTier, string[]> = {
    silver: ['Exclusive stories & media', 'Basic access to exclusive content'],
    gold: [
      'All Silver benefits',
      'Group chat access',
      'Fan-only live streams',
      'Priority placement in inbox',
      'Member badge in DMs',
    ],
    diamond: [
      'All Gold benefits',
      'Member events access',
      '1-on-1 boosted visibility',
      'Priority replies',
    ],
    royal_elite: [
      'All Diamond benefits',
      'VIP live sessions',
      'Full access to all content',
      'Highest priority support',
    ],
  };
  return features[tier];
}

/**
 * Check if member has access to feature based on tier
 */
export function hasFeatureAccess(
  memberTier: FanClubTier,
  requiredTier: FanClubTier
): boolean {
  const tierOrder: FanClubTier[] = ['silver', 'gold', 'diamond', 'royal_elite'];
  const memberIndex = tierOrder.indexOf(memberTier);
  const requiredIndex = tierOrder.indexOf(requiredTier);
  return memberIndex >= requiredIndex;
}

/**
 * Get tier upgrade suggestions
 */
export function getUpgradeSuggestion(
  currentTier: FanClubTier
): FanClubTier | null {
  const tierOrder: FanClubTier[] = ['silver', 'gold', 'diamond', 'royal_elite'];
  const currentIndex = tierOrder.indexOf(currentTier);
  if (currentIndex < tierOrder.length - 1) {
    return tierOrder[currentIndex + 1];
  }
  return null;
}

/**
 * Calculate total savings for annual commitment (if implemented)
 */
export function calculateAnnualSavings(tier: FanClubTier): number {
  const monthlyPrice = getTierDisplayInfo(tier).price;
  const annualPrice = monthlyPrice * 12;
  const discountedAnnualPrice = annualPrice * 0.8; // 20% discount
  return annualPrice - discountedAnnualPrice;
}