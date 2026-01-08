/**
 * Chat Pricing Service - PACK 39
 * Dynamic message-level pricing for chat messages
 *
 * HARD CONSTRAINTS:
 * - Local data only (AsyncStorage)
 * - No backend, no Firestore, no Functions
 * - Deterministic pricing (no randomness)
 * - 65/35 revenue split
 * - No free tokens / no free trials / no discounts
 * - Conversion-first UX
 *
 * PACK 40 Integration:
 * - Now uses real signals from profileRankService
 *
 * PACK 41 Integration:
 * - Extended with boost pricing support
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProfileSignals, calculateInterestMatchStats } from './profileRankService';
import { getProfile } from '../lib/profileService';
import { calculateBoostExtraTokens } from './messageBoostService';

// ============================================================================
// TYPES
// ============================================================================

export interface ChatPricingContext {
  senderId: string;
  receiverId: string;
  senderHeatScore: number;        // 0-100
  receiverHeatScore: number;      // 0-100
  senderResponsiveness: number;   // 0-1 (0 = ghoster, 1 = highly responsive)
  receiverResponsiveness: number; // 0-1
  interestMatchCount: number;     // 0-5
  timeSinceLastReplyMinutes: number;
  receiverEarnsFromChat: boolean; // from profile settings
}

export interface ChatPricingResult {
  tokenCost: number;       // final price (2-12 tokens)
  breakdown: string[];     // human-readable reasons for UI/debug
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_KEYS = {
  HEAT_SCORES: '@avalo_heat_scores',           // { userId: number }
  RESPONSIVENESS: '@avalo_responsiveness',     // { userId: number }
  INTEREST_MATCHES: '@avalo_interest_matches', // { userId1_userId2: number }
  LAST_REPLIES: '@avalo_last_replies',         // { chatId: timestamp }
  EARNS_FROM_CHAT: '@avalo_earns_from_chat',   // { userId: boolean }
} as const;

// ============================================================================
// PRICING CALCULATION (100% DETERMINISTIC)
// ============================================================================

/**
 * Calculate dynamic message price based on multi-factor formula
 * 
 * Formula:
 * base = 4 tokens
 * + receiverHeatScore * 1.2
 * + (1 - senderResponsiveness) * 2.5
 * + receiverResponsiveness * 1.3
 * + (timeSinceLastReplyMinutes > 45 ? +2 : 0)
 * + (receiverEarnsFromChat ? +2 : 0)
 * - interestMatchCount * 0.8
 * 
 * After calculation:
 * - Floor to nearest integer
 * - Min = 2 tokens
 * - Max = 12 tokens
 * 
 * @param context - All pricing factors
 * @returns ChatPricingResult with cost and breakdown
 */
export function calculateMessagePrice(context: ChatPricingContext): ChatPricingResult {
  const breakdown: string[] = [];
  
  // Base price
  let price = 4;
  breakdown.push(`Base price: 4 tokens`);
  
  // Factor 1: Receiver heat score (↑ higher price)
  // Normalized from 0-100 to 0-1, then multiply by 1.2
  const heatFactor = (context.receiverHeatScore / 100) * 1.2;
  price += heatFactor;
  breakdown.push(`+ Receiver heat (${context.receiverHeatScore}/100): +${heatFactor.toFixed(2)}`);
  
  // Factor 2: Sender responsiveness (↓ lower price)
  // If sender is a ghoster (low responsiveness), price goes UP
  const senderResponsivenessFactor = (1 - context.senderResponsiveness) * 2.5;
  price += senderResponsivenessFactor;
  breakdown.push(`+ Sender low responsiveness (${(context.senderResponsiveness * 100).toFixed(0)}%): +${senderResponsivenessFactor.toFixed(2)}`);
  
  // Factor 3: Receiver responsiveness (↑ higher price)
  // If receiver is highly responsive, they're valuable -> higher price
  const receiverResponsivenessFactor = context.receiverResponsiveness * 1.3;
  price += receiverResponsivenessFactor;
  breakdown.push(`+ Receiver high responsiveness (${(context.receiverResponsiveness * 100).toFixed(0)}%): +${receiverResponsivenessFactor.toFixed(2)}`);
  
  // Factor 4: Time since last reply (↑ higher price when ignored)
  if (context.timeSinceLastReplyMinutes > 45) {
    price += 2;
    breakdown.push(`+ Long silence (${context.timeSinceLastReplyMinutes}min > 45min): +2`);
  } else {
    breakdown.push(`+ Quick replies (${context.timeSinceLastReplyMinutes}min ≤ 45min): +0`);
  }
  
  // Factor 5: Receiver earns from chat (↑ higher price)
  if (context.receiverEarnsFromChat) {
    price += 2;
    breakdown.push(`+ Receiver earns from chat: +2`);
  } else {
    breakdown.push(`+ Receiver doesn't earn: +0`);
  }
  
  // Factor 6: Interest match count (↓ lower price with strong match)
  const interestDiscount = context.interestMatchCount * 0.8;
  price -= interestDiscount;
  breakdown.push(`- Interest matches (${context.interestMatchCount}): -${interestDiscount.toFixed(2)}`);
  
  // Floor to integer
  price = Math.floor(price);
  
  // Clamp between min and max
  const finalPrice = Math.max(2, Math.min(12, price));
  
  if (price < 2) {
    breakdown.push(`Clamped to minimum: 2 tokens`);
  } else if (price > 12) {
    breakdown.push(`Clamped to maximum: 12 tokens`);
  }
  
  breakdown.push(`= FINAL PRICE: ${finalPrice} tokens`);
  
  // Debug log in DEV mode only
  if (__DEV__) {
    console.log('[ChatPaywall] Pricing breakdown:');
    breakdown.forEach(line => console.log(`  ${line}`));
  }
  
  return {
    tokenCost: finalPrice,
    breakdown,
  };
}

// ============================================================================
// LOCAL DATA HELPERS
// ============================================================================

/**
 * Get heat score for a user (0-100)
 * Higher = more popular/attractive profile
 */
export async function getHeatScore(userId: string): Promise<number> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.HEAT_SCORES);
    if (!stored) return 50; // Default mid-range
    
    const scores: Record<string, number> = JSON.parse(stored);
    return scores[userId] ?? 50;
  } catch (error) {
    if (__DEV__) console.error('[ChatPricing] Error getting heat score:', error);
    return 50;
  }
}

/**
 * Set heat score for a user
 */
export async function setHeatScore(userId: string, score: number): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.HEAT_SCORES);
    const scores: Record<string, number> = stored ? JSON.parse(stored) : {};
    
    scores[userId] = Math.max(0, Math.min(100, score)); // Clamp 0-100
    
    await AsyncStorage.setItem(STORAGE_KEYS.HEAT_SCORES, JSON.stringify(scores));
  } catch (error) {
    if (__DEV__) console.error('[ChatPricing] Error setting heat score:', error);
  }
}

/**
 * Get responsiveness score for a user (0-1)
 * 0 = ghoster, 1 = highly responsive
 */
export async function getResponsiveness(userId: string): Promise<number> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.RESPONSIVENESS);
    if (!stored) return 0.5; // Default mid-range
    
    const scores: Record<string, number> = JSON.parse(stored);
    return scores[userId] ?? 0.5;
  } catch (error) {
    if (__DEV__) console.error('[ChatPricing] Error getting responsiveness:', error);
    return 0.5;
  }
}

/**
 * Set responsiveness score for a user
 */
export async function setResponsiveness(userId: string, score: number): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.RESPONSIVENESS);
    const scores: Record<string, number> = stored ? JSON.parse(stored) : {};
    
    scores[userId] = Math.max(0, Math.min(1, score)); // Clamp 0-1
    
    await AsyncStorage.setItem(STORAGE_KEYS.RESPONSIVENESS, JSON.stringify(scores));
  } catch (error) {
    if (__DEV__) console.error('[ChatPricing] Error setting responsiveness:', error);
  }
}

/**
 * Get interest match count between two users (0-5)
 */
export async function getInterestMatchCount(userId1: string, userId2: string): Promise<number> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.INTEREST_MATCHES);
    if (!stored) return 0;
    
    const matches: Record<string, number> = JSON.parse(stored);
    
    // Check both key orders
    const key1 = `${userId1}_${userId2}`;
    const key2 = `${userId2}_${userId1}`;
    
    return matches[key1] ?? matches[key2] ?? 0;
  } catch (error) {
    if (__DEV__) console.error('[ChatPricing] Error getting interest matches:', error);
    return 0;
  }
}

/**
 * Set interest match count between two users
 */
export async function setInterestMatchCount(userId1: string, userId2: string, count: number): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.INTEREST_MATCHES);
    const matches: Record<string, number> = stored ? JSON.parse(stored) : {};
    
    const key = `${userId1}_${userId2}`;
    matches[key] = Math.max(0, Math.min(5, count)); // Clamp 0-5
    
    await AsyncStorage.setItem(STORAGE_KEYS.INTEREST_MATCHES, JSON.stringify(matches));
  } catch (error) {
    if (__DEV__) console.error('[ChatPricing] Error setting interest matches:', error);
  }
}

/**
 * Get time since last reply in minutes for a chat
 */
export async function getTimeSinceLastReply(chatId: string): Promise<number> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.LAST_REPLIES);
    if (!stored) return 0;
    
    const lastReplies: Record<string, number> = JSON.parse(stored);
    const lastReplyTimestamp = lastReplies[chatId];
    
    if (!lastReplyTimestamp) return 0;
    
    const now = Date.now();
    const minutesElapsed = Math.floor((now - lastReplyTimestamp) / (1000 * 60));
    
    return Math.max(0, minutesElapsed);
  } catch (error) {
    if (__DEV__) console.error('[ChatPricing] Error getting time since last reply:', error);
    return 0;
  }
}

/**
 * Update last reply timestamp for a chat
 */
export async function updateLastReply(chatId: string): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.LAST_REPLIES);
    const lastReplies: Record<string, number> = stored ? JSON.parse(stored) : {};
    
    lastReplies[chatId] = Date.now();
    
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_REPLIES, JSON.stringify(lastReplies));
  } catch (error) {
    if (__DEV__) console.error('[ChatPricing] Error updating last reply:', error);
  }
}

/**
 * Get whether user earns from chat (from profile settings)
 */
export async function getEarnsFromChat(userId: string): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.EARNS_FROM_CHAT);
    if (!stored) return false;
    
    const settings: Record<string, boolean> = JSON.parse(stored);
    return settings[userId] ?? false;
  } catch (error) {
    if (__DEV__) console.error('[ChatPricing] Error getting earns from chat:', error);
    return false;
  }
}

/**
 * Set whether user earns from chat
 */
export async function setEarnsFromChat(userId: string, earns: boolean): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.EARNS_FROM_CHAT);
    const settings: Record<string, boolean> = stored ? JSON.parse(stored) : {};
    
    settings[userId] = earns;
    
    await AsyncStorage.setItem(STORAGE_KEYS.EARNS_FROM_CHAT, JSON.stringify(settings));
  } catch (error) {
    if (__DEV__) console.error('[ChatPricing] Error setting earns from chat:', error);
  }
}

// ============================================================================
// CONVENIENCE HELPERS
// ============================================================================

/**
 * Build complete pricing context from local storage
 * This is the main function used by the hook
 *
 * PACK 40: Now uses real signals from profileRankService
 */
export async function buildPricingContext(
  senderId: string,
  receiverId: string,
  chatId: string
): Promise<ChatPricingContext> {
  // PACK 40: Get profile signals from profileRankService
  const [senderSignals, receiverSignals] = await Promise.all([
    getProfileSignals(senderId),
    getProfileSignals(receiverId),
  ]);

  // Get profiles for interests
  const [senderProfile, receiverProfile] = await Promise.all([
    getProfile(senderId),
    getProfile(receiverId),
  ]);

  const viewerInterests = senderProfile?.interests || [];
  const targetInterests = receiverProfile?.interests || [];

  // Calculate interest match
  const interestStats = calculateInterestMatchStats(
    viewerInterests,
    targetInterests,
    senderId,
    receiverId
  );

  // Get receiver earns from chat setting (fallback to existing storage)
  const receiverEarnsFromChat = await getEarnsFromChat(receiverId);

  // Get time since last reply
  const timeSinceLastReplyMinutes = await getTimeSinceLastReply(chatId);

  return {
    senderId,
    receiverId,
    senderHeatScore: senderSignals.heatScore,
    receiverHeatScore: receiverSignals.heatScore,
    senderResponsiveness: senderSignals.responsiveness,
    receiverResponsiveness: receiverSignals.responsiveness,
    interestMatchCount: interestStats.matchCount,
    timeSinceLastReplyMinutes,
    receiverEarnsFromChat,
  };
}

/**
 * Calculate price for a message in a chat
 * This is the main entry point for price calculation
 *
 * PACK 40: Uses real signals via buildPricingContext
 */
export async function calculateChatMessagePrice(
  senderId: string,
  receiverId: string,
  chatId: string
): Promise<ChatPricingResult> {
  const context = await buildPricingContext(senderId, receiverId, chatId);
  return calculateMessagePrice(context);
}

// ============================================================================
// PACK 41: BOOST PRICING INTEGRATION
// ============================================================================

/**
 * Extended pricing result with boost support
 */
export interface ChatPricingWithBoostResult extends ChatPricingResult {
  boostExtraTokens: number;
  totalTokenCost: number;
}

/**
 * Calculate message price with optional boost
 *
 * @param context - Chat pricing context
 * @param isBoostEnabled - Whether boost is enabled for this message
 * @returns Extended result with boost pricing
 */
export async function calculateMessagePriceWithBoost(
  context: ChatPricingContext,
  isBoostEnabled: boolean
): Promise<ChatPricingWithBoostResult> {
  // Get base price from PACK 39
  const base = calculateMessagePrice(context);

  let boostExtraTokens = 0;
  let totalTokenCost = base.tokenCost;

  if (isBoostEnabled) {
    // Get receiver signals for heat score
    const receiverSignals = await getProfileSignals(context.receiverId);
    
    // Calculate boost extra tokens
    const boostResult = calculateBoostExtraTokens({
      senderId: context.senderId,
      receiverId: context.receiverId,
      receiverHeatScore: receiverSignals.heatScore,
    });

    boostExtraTokens = boostResult.extraTokens;
    totalTokenCost = base.tokenCost + boostExtraTokens;
  }

  return {
    ...base,
    boostExtraTokens,
    totalTokenCost,
  };
}

/**
 * Build chat pricing context (alias for buildPricingContext)
 * PACK 40: Convenience export for other modules
 */
export async function buildChatPricingContext(
  senderId: string,
  receiverId: string
): Promise<ChatPricingContext> {
  // For contexts without a specific chatId, create a temporary one
  const tempChatId = `${senderId}_${receiverId}`;
  return buildPricingContext(senderId, receiverId, tempChatId);
}

/**
 * Update responsiveness after a message is sent/received
 * Call this after each message to keep responsiveness up-to-date
 */
export async function updateResponsivenessAfterMessage(
  userId: string,
  responseTimeMinutes: number
): Promise<void> {
  try {
    // Get current responsiveness
    const currentScore = await getResponsiveness(userId);
    
    // Calculate new score based on response time
    // Fast response (< 5 min) = increase score
    // Medium response (5-30 min) = slight increase
    // Slow response (> 30 min) = decrease score
    let adjustment = 0;
    if (responseTimeMinutes < 5) {
      adjustment = 0.05; // Fast responder
    } else if (responseTimeMinutes < 30) {
      adjustment = 0.02; // Medium responder
    } else if (responseTimeMinutes < 120) {
      adjustment = -0.02; // Slow responder
    } else {
      adjustment = -0.05; // Very slow / ghoster
    }
    
    // Apply exponential moving average (80% old, 20% new)
    const newScore = currentScore * 0.8 + (currentScore + adjustment) * 0.2;
    
    await setResponsiveness(userId, newScore);
  } catch (error) {
    if (__DEV__) console.error('[ChatPricing] Error updating responsiveness:', error);
  }
}

/**
 * Clear all pricing data (for testing/reset)
 */
export async function clearAllPricingData(): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.HEAT_SCORES),
      AsyncStorage.removeItem(STORAGE_KEYS.RESPONSIVENESS),
      AsyncStorage.removeItem(STORAGE_KEYS.INTEREST_MATCHES),
      AsyncStorage.removeItem(STORAGE_KEYS.LAST_REPLIES),
      AsyncStorage.removeItem(STORAGE_KEYS.EARNS_FROM_CHAT),
    ]);
    
    if (__DEV__) console.log('[ChatPricing] All pricing data cleared');
  } catch (error) {
    if (__DEV__) console.error('[ChatPricing] Error clearing pricing data:', error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Core pricing
  calculateMessagePrice,
  calculateChatMessagePrice,
  buildPricingContext,
  
  // Data getters
  getHeatScore,
  getResponsiveness,
  getInterestMatchCount,
  getTimeSinceLastReply,
  getEarnsFromChat,
  
  // Data setters
  setHeatScore,
  setResponsiveness,
  setInterestMatchCount,
  updateLastReply,
  setEarnsFromChat,
  
  // Utilities
  updateResponsivenessAfterMessage,
  clearAllPricingData,
};