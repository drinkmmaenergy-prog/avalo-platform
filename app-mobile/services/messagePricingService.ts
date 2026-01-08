/**
 * Message Pricing Service
 * Phase 33-2: Monetized Chat - Dynamic Pricing + Revenue Split
 * 
 * Handles per-chat message pricing for creators.
 * UI-only implementation - no backend integration.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getApp } from 'firebase/app';

const PRICING_STORAGE_KEY = '@avalo_chat_pricing';
const AVALO_COMMISSION = 0.35; // 35% fixed commission

export interface ChatPricingData {
  [chatId: string]: number; // chatId -> price in tokens
}

export interface CreatorProfile {
  earnFromChat?: boolean;
  isCreator?: boolean;
}

/**
 * Get the per-message price for a specific chat
 */
export async function getChatPrice(chatId: string): Promise<number> {
  try {
    const storedData = await AsyncStorage.getItem(PRICING_STORAGE_KEY);
    if (!storedData) return 0;

    const pricing: ChatPricingData = JSON.parse(storedData);
    return pricing[chatId] || 0;
  } catch (error) {
    console.error('Error getting chat price:', error);
    return 0;
  }
}

/**
 * Set the per-message price for a specific chat
 * Only creators with earnFromChat === true can set prices
 */
export async function setChatPrice(
  chatId: string,
  price: number,
  userId: string
): Promise<boolean> {
  try {
    // Validate that user is a creator with earnFromChat enabled
    const canSetPrice = await canUserSetChatPrice(userId);
    if (!canSetPrice) {
      console.warn('User is not authorized to set chat prices');
      return false;
    }

    // Validate price (must be 0, 5, 10, 15, 20, or 30)
    const validPrices = [0, 5, 10, 15, 20, 30];
    if (!validPrices.includes(price)) {
      console.warn('Invalid price. Must be one of:', validPrices);
      return false;
    }

    // Get existing pricing data
    const storedData = await AsyncStorage.getItem(PRICING_STORAGE_KEY);
    const pricing: ChatPricingData = storedData ? JSON.parse(storedData) : {};

    // Update price for this chat
    pricing[chatId] = price;

    // Save back to storage
    await AsyncStorage.setItem(PRICING_STORAGE_KEY, JSON.stringify(pricing));
    
    return true;
  } catch (error) {
    console.error('Error setting chat price:', error);
    return false;
  }
}

/**
 * Check if a user can set chat prices
 * Only creators with earnFromChat === true can set prices
 */
export async function canUserSetChatPrice(userId: string): Promise<boolean> {
  try {
    const db = getFirestore(getApp());
    const profileRef = doc(db, 'profiles', userId);
    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {
      return false;
    }

    const profile = profileSnap.data() as CreatorProfile;
    
    // User must have earnFromChat enabled
    return profile.earnFromChat === true;
  } catch (error) {
    console.error('Error checking user creator status:', error);
    return false;
  }
}

/**
 * Calculate earnings from a message
 * Returns the amount the creator earns after Avalo commission
 */
export function calculateCreatorEarnings(messagePrice: number): number {
  if (messagePrice === 0) return 0;
  
  const avaloFee = Math.floor(messagePrice * AVALO_COMMISSION);
  const creatorEarnings = messagePrice - avaloFee;
  
  return creatorEarnings;
}

/**
 * Calculate Avalo commission from a message
 */
export function calculateAvaloCommission(messagePrice: number): number {
  if (messagePrice === 0) return 0;
  
  return Math.floor(messagePrice * AVALO_COMMISSION);
}

/**
 * Get all chat pricing data (for debugging/admin)
 */
export async function getAllChatPricing(): Promise<ChatPricingData> {
  try {
    const storedData = await AsyncStorage.getItem(PRICING_STORAGE_KEY);
    return storedData ? JSON.parse(storedData) : {};
  } catch (error) {
    console.error('Error getting all chat pricing:', error);
    return {};
  }
}

/**
 * Clear all pricing data (for testing)
 */
export async function clearAllPricing(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PRICING_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing pricing data:', error);
  }
}

/**
 * Get available price options
 */
export function getAvailablePriceOptions(): number[] {
  return [0, 5, 10, 15, 20, 30];
}

export default {
  getChatPrice,
  setChatPrice,
  canUserSetChatPrice,
  calculateCreatorEarnings,
  calculateAvaloCommission,
  getAllChatPricing,
  clearAllPricing,
  getAvailablePriceOptions,
  AVALO_COMMISSION,
};