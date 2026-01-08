/**
 * Subscription Service
 * Phase 33-3: UI-only subscription management for creators
 * 
 * Handles monthly subscriptions with AsyncStorage persistence.
 * Revenue split: 65% creator / 35% Avalo (UI simulation only)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const SUBSCRIPTION_STORAGE_KEY = '@avalo_subscriptions';
const CREATOR_PRICING_KEY = '@avalo_creator_subscription_prices';
const AVALO_COMMISSION = 0.35; // 35% commission
const CREATOR_EARNINGS = 0.65; // 65% to creator

export interface SubscriptionData {
  creatorId: string;
  price: number; // tokens per month
  subscribedAt: Date;
  expiresAt: Date; // subscribedAt + 30 days
}

export interface CreatorPricing {
  [creatorId: string]: number; // creatorId -> monthly price in tokens
}

export interface SubscriptionState {
  [userId: string]: {
    [creatorId: string]: SubscriptionData;
  };
}

// Subscription price presets (tokens/month)
export const SUBSCRIPTION_PRESETS = [49, 79, 119, 159, 199, 249];

/**
 * Check if user is subscribed to a creator
 */
export async function isSubscribed(
  userId: string,
  creatorId: string
): Promise<boolean> {
  try {
    const subscription = await getSubscription(userId, creatorId);
    if (!subscription) return false;

    // Check if subscription is still active
    const now = new Date();
    const expiresAt = new Date(subscription.expiresAt);
    
    return now < expiresAt;
  } catch (error) {
    console.error('Error checking subscription:', error);
    return false;
  }
}

/**
 * Get subscription details for a user and creator
 */
export async function getSubscription(
  userId: string,
  creatorId: string
): Promise<SubscriptionData | null> {
  try {
    const storedData = await AsyncStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
    if (!storedData) return null;

    const state: SubscriptionState = JSON.parse(storedData);
    return state[userId]?.[creatorId] || null;
  } catch (error) {
    console.error('Error getting subscription:', error);
    return null;
  }
}

/**
 * Subscribe to a creator
 * UI-only: Deducts tokens from user balance (simulated)
 */
export async function subscribe(
  userId: string,
  creatorId: string,
  price: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate price is one of the presets
    if (!SUBSCRIPTION_PRESETS.includes(price)) {
      return { success: false, error: 'Invalid subscription price' };
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days subscription

    const subscriptionData: SubscriptionData = {
      creatorId,
      price,
      subscribedAt: now,
      expiresAt,
    };

    // Get existing state
    const storedData = await AsyncStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
    const state: SubscriptionState = storedData ? JSON.parse(storedData) : {};

    // Initialize user subscriptions if needed
    if (!state[userId]) {
      state[userId] = {};
    }

    // Add subscription
    state[userId][creatorId] = subscriptionData;

    // Save state
    await AsyncStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(state));

    return { success: true };
  } catch (error) {
    console.error('Error subscribing:', error);
    return { success: false, error: 'Failed to subscribe' };
  }
}

/**
 * Unsubscribe from a creator
 */
export async function unsubscribe(
  userId: string,
  creatorId: string
): Promise<boolean> {
  try {
    const storedData = await AsyncStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
    if (!storedData) return false;

    const state: SubscriptionState = JSON.parse(storedData);
    
    if (state[userId]?.[creatorId]) {
      delete state[userId][creatorId];
      await AsyncStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(state));
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error unsubscribing:', error);
    return false;
  }
}

/**
 * Get time remaining on subscription
 */
export async function getTimeRemaining(
  userId: string,
  creatorId: string
): Promise<{ days: number; hours: number } | null> {
  try {
    const subscription = await getSubscription(userId, creatorId);
    if (!subscription) return null;

    const now = new Date();
    const expiresAt = new Date(subscription.expiresAt);
    const diffMs = expiresAt.getTime() - now.getTime();

    if (diffMs <= 0) return null;

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    return { days, hours };
  } catch (error) {
    console.error('Error getting time remaining:', error);
    return null;
  }
}

/**
 * Set creator's subscription price
 */
export async function setCreatorPrice(
  creatorId: string,
  price: number
): Promise<boolean> {
  try {
    if (!SUBSCRIPTION_PRESETS.includes(price)) {
      console.warn('Invalid price. Must be one of:', SUBSCRIPTION_PRESETS);
      return false;
    }

    const storedData = await AsyncStorage.getItem(CREATOR_PRICING_KEY);
    const pricing: CreatorPricing = storedData ? JSON.parse(storedData) : {};

    pricing[creatorId] = price;

    await AsyncStorage.setItem(CREATOR_PRICING_KEY, JSON.stringify(pricing));
    return true;
  } catch (error) {
    console.error('Error setting creator price:', error);
    return false;
  }
}

/**
 * Get creator's subscription price
 */
export async function getCreatorPrice(creatorId: string): Promise<number> {
  try {
    const storedData = await AsyncStorage.getItem(CREATOR_PRICING_KEY);
    if (!storedData) return 0;

    const pricing: CreatorPricing = JSON.parse(storedData);
    return pricing[creatorId] || 0;
  } catch (error) {
    console.error('Error getting creator price:', error);
    return 0;
  }
}

/**
 * Calculate creator earnings from subscription
 */
export function calculateCreatorEarnings(subscriptionPrice: number): number {
  if (subscriptionPrice === 0) return 0;
  return Math.floor(subscriptionPrice * CREATOR_EARNINGS);
}

/**
 * Calculate Avalo commission from subscription
 */
export function calculateAvaloCommission(subscriptionPrice: number): number {
  if (subscriptionPrice === 0) return 0;
  return Math.floor(subscriptionPrice * AVALO_COMMISSION);
}

/**
 * Get all user subscriptions
 */
export async function getUserSubscriptions(
  userId: string
): Promise<SubscriptionData[]> {
  try {
    const storedData = await AsyncStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
    if (!storedData) return [];

    const state: SubscriptionState = JSON.parse(storedData);
    const userSubs = state[userId] || {};

    return Object.values(userSubs);
  } catch (error) {
    console.error('Error getting user subscriptions:', error);
    return [];
  }
}

/**
 * Get subscriber count for a creator (UI simulation)
 */
export async function getSubscriberCount(creatorId: string): Promise<number> {
  try {
    const storedData = await AsyncStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
    if (!storedData) return 0;

    const state: SubscriptionState = JSON.parse(storedData);
    let count = 0;

    // Count active subscriptions to this creator
    for (const userId in state) {
      if (state[userId][creatorId]) {
        const sub = state[userId][creatorId];
        const now = new Date();
        const expiresAt = new Date(sub.expiresAt);
        
        if (now < expiresAt) {
          count++;
        }
      }
    }

    return count;
  } catch (error) {
    console.error('Error getting subscriber count:', error);
    return 0;
  }
}

/**
 * Clear all subscription data (for testing)
 */
export async function clearAllSubscriptions(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SUBSCRIPTION_STORAGE_KEY);
    await AsyncStorage.removeItem(CREATOR_PRICING_KEY);
  } catch (error) {
    console.error('Error clearing subscription data:', error);
  }
}

export default {
  isSubscribed,
  getSubscription,
  subscribe,
  unsubscribe,
  getTimeRemaining,
  setCreatorPrice,
  getCreatorPrice,
  calculateCreatorEarnings,
  calculateAvaloCommission,
  getUserSubscriptions,
  getSubscriberCount,
  clearAllSubscriptions,
  SUBSCRIPTION_PRESETS,
  AVALO_COMMISSION,
  CREATOR_EARNINGS,
};