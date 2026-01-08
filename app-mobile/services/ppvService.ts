/**
 * Pay-Per-View (PPV) Service
 * Phase 33-4: UI-only PPV media monetization for creators
 * 
 * Handles per-media PPV pricing and unlocks with AsyncStorage persistence.
 * Revenue split: 65% creator / 35% Avalo (UI simulation only)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerChallengeProgress } from './fanChallengeService';

const PPV_STORAGE_KEY = '@avalo_ppv_purchases';
const PPV_PRICING_KEY = '@avalo_ppv_media_prices';
const PPV_EARNINGS_KEY = '@avalo_ppv_earnings';
const AVALO_COMMISSION = 0.35; // 35% commission
const CREATOR_EARNINGS = 0.65; // 65% to creator
const VIP_DISCOUNT = 0.20; // 20% discount for VIP subscribers

export interface PPVPurchase {
  mediaId: string;
  creatorId: string;
  price: number; // tokens paid
  purchasedAt: Date;
  unlocked: boolean;
}

export interface PPVPricing {
  [mediaId: string]: number; // mediaId -> price in tokens
}

export interface PPVPurchaseState {
  [userId: string]: {
    [mediaId: string]: PPVPurchase;
  };
}

export interface PPVEarnings {
  [creatorId: string]: {
    totalEarned: number; // Total tokens earned (after commission)
    totalSales: number; // Total tokens from sales (before commission)
    avaloCommission: number; // Total commission paid to Avalo
    unlockCount: number; // Number of unlocks
  };
}

// PPV price presets (tokens)
export const PPV_PRESETS = [15, 25, 40, 60, 80, 120];

/**
 * Get PPV price for a media item
 */
export async function getPrice(mediaId: string): Promise<number> {
  try {
    const storedData = await AsyncStorage.getItem(PPV_PRICING_KEY);
    if (!storedData) return 0;

    const pricing: PPVPricing = JSON.parse(storedData);
    return pricing[mediaId] || 0;
  } catch (error) {
    console.error('Error getting PPV price:', error);
    return 0;
  }
}

/**
 * Set PPV price for a media item (creator only)
 */
export async function setPrice(
  mediaId: string,
  price: number
): Promise<boolean> {
  try {
    if (!PPV_PRESETS.includes(price) && price !== 0) {
      console.warn('Invalid price. Must be one of:', PPV_PRESETS, 'or 0 to disable');
      return false;
    }

    const storedData = await AsyncStorage.getItem(PPV_PRICING_KEY);
    const pricing: PPVPricing = storedData ? JSON.parse(storedData) : {};

    pricing[mediaId] = price;

    await AsyncStorage.setItem(PPV_PRICING_KEY, JSON.stringify(pricing));
    return true;
  } catch (error) {
    console.error('Error setting PPV price:', error);
    return false;
  }
}

/**
 * Calculate discounted price for VIP subscribers
 */
export function calculateVIPPrice(basePrice: number): number {
  if (basePrice === 0) return 0;
  return Math.floor(basePrice * (1 - VIP_DISCOUNT));
}

/**
 * Get effective price for a user (with VIP discount if applicable)
 */
export async function getEffectivePrice(
  mediaId: string,
  isVIPSubscriber: boolean
): Promise<number> {
  const basePrice = await getPrice(mediaId);
  if (basePrice === 0) return 0;
  
  if (isVIPSubscriber) {
    return calculateVIPPrice(basePrice);
  }
  
  return basePrice;
}

/**
 * Check if user has unlocked a media item
 */
export async function checkUnlocked(
  userId: string,
  mediaId: string
): Promise<boolean> {
  try {
    const purchase = await getPurchase(userId, mediaId);
    return purchase?.unlocked || false;
  } catch (error) {
    console.error('Error checking unlock status:', error);
    return false;
  }
}

/**
 * Get purchase details for a user and media item
 */
export async function getPurchase(
  userId: string,
  mediaId: string
): Promise<PPVPurchase | null> {
  try {
    const storedData = await AsyncStorage.getItem(PPV_STORAGE_KEY);
    if (!storedData) return null;

    const state: PPVPurchaseState = JSON.parse(storedData);
    return state[userId]?.[mediaId] || null;
  } catch (error) {
    console.error('Error getting purchase:', error);
    return null;
  }
}

/**
 * Unlock a media item for a user
 * UI-only: Deducts tokens from user balance (simulated)
 */
export async function unlock(
  userId: string,
  mediaId: string,
  creatorId: string,
  price: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate price
    if (price <= 0) {
      return { success: false, error: 'Invalid price' };
    }

    const now = new Date();
    const purchase: PPVPurchase = {
      mediaId,
      creatorId,
      price,
      purchasedAt: now,
      unlocked: true,
    };

    // Get existing state
    const storedData = await AsyncStorage.getItem(PPV_STORAGE_KEY);
    const state: PPVPurchaseState = storedData ? JSON.parse(storedData) : {};

    // Initialize user purchases if needed
    if (!state[userId]) {
      state[userId] = {};
    }

    // Check if already unlocked
    if (state[userId][mediaId]?.unlocked) {
      return { success: false, error: 'Already unlocked' };
    }

    // Add purchase
    state[userId][mediaId] = purchase;

    // Save state
    await AsyncStorage.setItem(PPV_STORAGE_KEY, JSON.stringify(state));

    // Update creator earnings
    await updateCreatorEarnings(creatorId, price);

    // Pack 33-15: Register challenge progress
    await registerChallengeProgress(creatorId, userId, 'PPV_UNLOCK');

    return { success: true };
  } catch (error) {
    console.error('Error unlocking media:', error);
    return { success: false, error: 'Failed to unlock' };
  }
}

/**
 * Update creator earnings after a purchase
 */
async function updateCreatorEarnings(
  creatorId: string,
  salePrice: number
): Promise<void> {
  try {
    const storedData = await AsyncStorage.getItem(PPV_EARNINGS_KEY);
    const earnings: PPVEarnings = storedData ? JSON.parse(storedData) : {};

    if (!earnings[creatorId]) {
      earnings[creatorId] = {
        totalEarned: 0,
        totalSales: 0,
        avaloCommission: 0,
        unlockCount: 0,
      };
    }

    const creatorEarning = Math.floor(salePrice * CREATOR_EARNINGS);
    const avaloCommission = Math.floor(salePrice * AVALO_COMMISSION);

    earnings[creatorId].totalEarned += creatorEarning;
    earnings[creatorId].totalSales += salePrice;
    earnings[creatorId].avaloCommission += avaloCommission;
    earnings[creatorId].unlockCount += 1;

    await AsyncStorage.setItem(PPV_EARNINGS_KEY, JSON.stringify(earnings));
  } catch (error) {
    console.error('Error updating creator earnings:', error);
  }
}

/**
 * Get creator earnings from PPV
 */
export async function getEarnings(creatorId: string): Promise<{
  totalEarned: number;
  totalSales: number;
  avaloCommission: number;
  unlockCount: number;
}> {
  try {
    const storedData = await AsyncStorage.getItem(PPV_EARNINGS_KEY);
    if (!storedData) {
      return { totalEarned: 0, totalSales: 0, avaloCommission: 0, unlockCount: 0 };
    }

    const earnings: PPVEarnings = JSON.parse(storedData);
    return earnings[creatorId] || { 
      totalEarned: 0, 
      totalSales: 0, 
      avaloCommission: 0, 
      unlockCount: 0 
    };
  } catch (error) {
    console.error('Error getting earnings:', error);
    return { totalEarned: 0, totalSales: 0, avaloCommission: 0, unlockCount: 0 };
  }
}

/**
 * Calculate creator earnings from a sale price
 */
export function calculateCreatorEarnings(salePrice: number): number {
  if (salePrice === 0) return 0;
  return Math.floor(salePrice * CREATOR_EARNINGS);
}

/**
 * Calculate Avalo commission from a sale price
 */
export function calculateAvaloCommission(salePrice: number): number {
  if (salePrice === 0) return 0;
  return Math.floor(salePrice * AVALO_COMMISSION);
}

/**
 * Get all unlocked media for a user
 */
export async function getUserUnlocks(userId: string): Promise<PPVPurchase[]> {
  try {
    const storedData = await AsyncStorage.getItem(PPV_STORAGE_KEY);
    if (!storedData) return [];

    const state: PPVPurchaseState = JSON.parse(storedData);
    const userPurchases = state[userId] || {};

    return Object.values(userPurchases).filter(p => p.unlocked);
  } catch (error) {
    console.error('Error getting user unlocks:', error);
    return [];
  }
}

/**
 * Get unlock count for a media item
 */
export async function getUnlockCount(mediaId: string): Promise<number> {
  try {
    const storedData = await AsyncStorage.getItem(PPV_STORAGE_KEY);
    if (!storedData) return 0;

    const state: PPVPurchaseState = JSON.parse(storedData);
    let count = 0;

    // Count unlocks across all users
    for (const userId in state) {
      if (state[userId][mediaId]?.unlocked) {
        count++;
      }
    }

    return count;
  } catch (error) {
    console.error('Error getting unlock count:', error);
    return 0;
  }
}

/**
 * Get all media items with set prices (for creator)
 */
export async function getCreatorMediaPrices(): Promise<PPVPricing> {
  try {
    const storedData = await AsyncStorage.getItem(PPV_PRICING_KEY);
    if (!storedData) return {};

    return JSON.parse(storedData);
  } catch (error) {
    console.error('Error getting creator media prices:', error);
    return {};
  }
}

/**
 * Clear all PPV data (for testing)
 */
export async function clearAllPPV(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PPV_STORAGE_KEY);
    await AsyncStorage.removeItem(PPV_PRICING_KEY);
    await AsyncStorage.removeItem(PPV_EARNINGS_KEY);
  } catch (error) {
    console.error('Error clearing PPV data:', error);
  }
}

export default {
  getPrice,
  setPrice,
  calculateVIPPrice,
  getEffectivePrice,
  checkUnlocked,
  getPurchase,
  unlock,
  getEarnings,
  calculateCreatorEarnings,
  calculateAvaloCommission,
  getUserUnlocks,
  getUnlockCount,
  getCreatorMediaPrices,
  clearAllPPV,
  PPV_PRESETS,
  AVALO_COMMISSION,
  CREATOR_EARNINGS,
  VIP_DISCOUNT,
};