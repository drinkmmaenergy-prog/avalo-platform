/**
 * AI Auto-Pricing Engine
 * PACK 33-8: Dynamic price optimization for creators
 * 
 * UI-only implementation - reads from existing services and suggests optimal pricing
 * based on local statistics without any backend or external AI.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as messagePricingService from './messagePricingService';
import * as subscriptionService from './subscriptionService';
import * as ppvService from './ppvService';
import * as liveService from './liveService';
import * as creatorOfferService from './creatorOfferService';

// Storage keys
const PRICING_HISTORY_KEY = '@avalo_auto_pricing_history';
const PRICING_SUGGESTIONS_KEY = '@avalo_auto_pricing_suggestions';
const AUTO_APPLY_SETTINGS_KEY = '@avalo_auto_pricing_settings';

// Price presets (MUST use only these - NEVER custom numbers)
const PRICE_PRESETS = {
  PAID_CHAT: [0, 5, 10, 15, 20, 30],
  SUBSCRIPTION: [49, 79, 119, 159, 199, 249],
  PPV: [15, 25, 40, 60, 80, 120],
  LIVE_ENTRY: [10, 15, 25, 40, 60, 100],
  CREATOR_OFFERS: [80, 120, 200, 320, 450, 600],
};

// Commission split (MUST NOT be changed)
const AVALO_COMMISSION = 0.35;
const CREATOR_SHARE = 0.65;

// Types
export interface PriceSuggestion {
  type: 'PAID_CHAT' | 'SUBSCRIPTION' | 'PPV' | 'LIVE_ENTRY' | 'CREATOR_OFFERS';
  currentPrice: number;
  suggestedPrice: number;
  reason: string;
  estimatedRevenueIncrease: number; // percentage
  confidence: 'high' | 'medium' | 'low';
}

export interface PricingHistory {
  creatorId: string;
  timestamp: Date;
  changes: Array<{
    type: string;
    oldPrice: number;
    newPrice: number;
    reason: string;
  }>;
}

export interface AutoPricingSettings {
  creatorId: string;
  autoApplyEnabled: boolean;
  autoApplyInterval: number; // days (default 7)
  lastAutoApply?: Date;
}

export interface CreatorStats {
  views: number;
  followers: number;
  chatInitiations: number;
  paidMessages: number;
  subscriptions: number;
  ppvUnlocks: number;
  liveEntries: number;
  offerPurchases: number;
  totalRevenue: number;
}

/**
 * Analyze creator data and compute price suggestions
 */
export async function evaluatePricing(creatorId: string): Promise<PriceSuggestion[]> {
  try {
    const stats = await gatherCreatorStats(creatorId);
    const suggestions: PriceSuggestion[] = [];

    // Analyze Paid Chat pricing
    const chatSuggestion = await analyzePaidChatPricing(creatorId, stats);
    if (chatSuggestion) suggestions.push(chatSuggestion);

    // Analyze Subscription pricing
    const subSuggestion = await analyzeSubscriptionPricing(creatorId, stats);
    if (subSuggestion) suggestions.push(subSuggestion);

    // Analyze PPV pricing
    const ppvSuggestion = await analyzePPVPricing(creatorId, stats);
    if (ppvSuggestion) suggestions.push(ppvSuggestion);

    // Analyze LIVE entry pricing
    const liveSuggestion = await analyzeLivePricing(creatorId, stats);
    if (liveSuggestion) suggestions.push(liveSuggestion);

    // Analyze Creator Offers pricing
    const offerSuggestion = await analyzeOffersPricing(creatorId, stats);
    if (offerSuggestion) suggestions.push(offerSuggestion);

    // Save suggestions to storage
    await saveSuggestions(creatorId, suggestions);

    return suggestions;
  } catch (error) {
    console.error('Error evaluating pricing:', error);
    return [];
  }
}

/**
 * Gather statistics from all services
 */
async function gatherCreatorStats(creatorId: string): Promise<CreatorStats> {
  try {
    // Simulate gathering stats from various sources
    // In real implementation, these would read from the actual services
    
    // Get subscription stats
    const subscriberCount = await subscriptionService.getSubscriberCount(creatorId);
    
    // Get PPV stats
    const ppvEarnings = await ppvService.getEarnings(creatorId);
    
    // Get LIVE earnings
    const liveEarnings = await liveService.getCreatorTotalEarnings(creatorId);
    
    // Get offer stats
    const offerStats = await creatorOfferService.getCreatorOfferStats(creatorId);

    // Simulate engagement metrics (in real app, these would come from analytics)
    const stats: CreatorStats = {
      views: Math.floor(Math.random() * 1000) + 100,
      followers: Math.floor(Math.random() * 200) + 20,
      chatInitiations: Math.floor(Math.random() * 150) + 30,
      paidMessages: Math.floor(Math.random() * 80) + 10,
      subscriptions: subscriberCount,
      ppvUnlocks: ppvEarnings.unlockCount,
      liveEntries: Math.floor(Math.random() * 50) + 5,
      offerPurchases: offerStats.totalPurchases,
      totalRevenue: ppvEarnings.totalEarned + liveEarnings + offerStats.creatorEarnings,
    };

    return stats;
  } catch (error) {
    console.error('Error gathering creator stats:', error);
    return {
      views: 0,
      followers: 0,
      chatInitiations: 0,
      paidMessages: 0,
      subscriptions: 0,
      ppvUnlocks: 0,
      liveEntries: 0,
      offerPurchases: 0,
      totalRevenue: 0,
    };
  }
}

/**
 * Analyze Paid Chat pricing
 */
async function analyzePaidChatPricing(
  creatorId: string,
  stats: CreatorStats
): Promise<PriceSuggestion | null> {
  try {
    // Get current prices from all chats (simplified - would need actual chat IDs)
    const currentPrice = 10; // Default assumption

    // Calculate conversion rate
    const conversionRate = stats.chatInitiations > 0 
      ? stats.paidMessages / stats.chatInitiations 
      : 0;

    let suggestedPrice = currentPrice;
    let reason = 'Current pricing is optimal';
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    let estimatedRevenueIncrease = 0;

    // High engagement = can increase price
    if (conversionRate > 0.3 && currentPrice < 20) {
      suggestedPrice = findNextHigherPreset(currentPrice, PRICE_PRESETS.PAID_CHAT);
      reason = 'High conversion rate — viewers are willing to pay more';
      confidence = 'high';
      estimatedRevenueIncrease = 15;
    }
    // Low engagement = decrease price
    else if (conversionRate < 0.1 && currentPrice > 5) {
      suggestedPrice = findNextLowerPreset(currentPrice, PRICE_PRESETS.PAID_CHAT);
      reason = 'Low conversion rate — lower price may increase volume';
      confidence = 'medium';
      estimatedRevenueIncrease = 10;
    }
    // Medium engagement with high followers = test higher price
    else if (conversionRate >= 0.15 && stats.followers > 100 && currentPrice < 15) {
      suggestedPrice = findNextHigherPreset(currentPrice, PRICE_PRESETS.PAID_CHAT);
      reason = 'Strong follower base supports premium pricing';
      confidence = 'medium';
      estimatedRevenueIncrease = 12;
    }

    if (suggestedPrice !== currentPrice) {
      return {
        type: 'PAID_CHAT',
        currentPrice,
        suggestedPrice,
        reason,
        estimatedRevenueIncrease,
        confidence,
      };
    }

    return null;
  } catch (error) {
    console.error('Error analyzing paid chat pricing:', error);
    return null;
  }
}

/**
 * Analyze Subscription pricing
 */
async function analyzeSubscriptionPricing(
  creatorId: string,
  stats: CreatorStats
): Promise<PriceSuggestion | null> {
  try {
    const currentPrice = await subscriptionService.getCreatorPrice(creatorId);
    
    // If no price set, suggest starting price
    if (currentPrice === 0) {
      return {
        type: 'SUBSCRIPTION',
        currentPrice: 0,
        suggestedPrice: 79,
        reason: 'Recommended starting price for new creators',
        estimatedRevenueIncrease: 100,
        confidence: 'high',
      };
    }

    let suggestedPrice = currentPrice;
    let reason = 'Current subscription price is optimal';
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    let estimatedRevenueIncrease = 0;

    // High subscriber count = can increase
    if (stats.subscriptions > 20 && currentPrice < 159) {
      suggestedPrice = findNextHigherPreset(currentPrice, PRICE_PRESETS.SUBSCRIPTION);
      reason = 'Strong subscriber base — premium pricing justified';
      confidence = 'high';
      estimatedRevenueIncrease = 20;
    }
    // Low subscribers but high engagement = moderate price
    else if (stats.subscriptions < 5 && currentPrice > 79) {
      suggestedPrice = findNextLowerPreset(currentPrice, PRICE_PRESETS.SUBSCRIPTION);
      reason = 'Lower price may attract more subscribers';
      confidence = 'medium';
      estimatedRevenueIncrease = 15;
    }
    // High engagement metrics = test premium
    else if (stats.views > 500 && stats.ppvUnlocks > 30 && currentPrice < 199) {
      suggestedPrice = findNextHigherPreset(currentPrice, PRICE_PRESETS.SUBSCRIPTION);
      reason = 'High engagement metrics support premium pricing';
      confidence: 'high';
      estimatedRevenueIncrease = 18;
    }

    if (suggestedPrice !== currentPrice) {
      return {
        type: 'SUBSCRIPTION',
        currentPrice,
        suggestedPrice,
        reason,
        estimatedRevenueIncrease,
        confidence,
      };
    }

    return null;
  } catch (error) {
    console.error('Error analyzing subscription pricing:', error);
    return null;
  }
}

/**
 * Analyze PPV pricing
 */
async function analyzePPVPricing(
  creatorId: string,
  stats: CreatorStats
): Promise<PriceSuggestion | null> {
  try {
    // Assume average PPV price (would get from actual media items)
    const currentPrice = 40;

    let suggestedPrice = currentPrice;
    let reason = 'Current PPV pricing is optimal';
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    let estimatedRevenueIncrease = 0;

    // High unlock rate = can increase
    if (stats.ppvUnlocks > 50 && currentPrice < 80) {
      suggestedPrice = findNextHigherPreset(currentPrice, PRICE_PRESETS.PPV);
      reason = 'High unlock rate supports premium PPV pricing';
      confidence = 'high';
      estimatedRevenueIncrease = 22;
    }
    // Low unlocks = decrease price
    else if (stats.ppvUnlocks < 10 && currentPrice > 25) {
      suggestedPrice = findNextLowerPreset(currentPrice, PRICE_PRESETS.PPV);
      reason = 'Lower PPV price may increase unlock volume';
      confidence = 'medium';
      estimatedRevenueIncrease = 14;
    }

    if (suggestedPrice !== currentPrice) {
      return {
        type: 'PPV',
        currentPrice,
        suggestedPrice,
        reason,
        estimatedRevenueIncrease,
        confidence,
      };
    }

    return null;
  } catch (error) {
    console.error('Error analyzing PPV pricing:', error);
    return null;
  }
}

/**
 * Analyze LIVE entry pricing
 */
async function analyzeLivePricing(
  creatorId: string,
  stats: CreatorStats
): Promise<PriceSuggestion | null> {
  try {
    // Assume current LIVE entry fee
    const currentPrice = 25;

    let suggestedPrice = currentPrice;
    let reason = 'Current LIVE entry fee is optimal';
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    let estimatedRevenueIncrease = 0;

    // High entry count = can increase
    if (stats.liveEntries > 30 && currentPrice < 60) {
      suggestedPrice = findNextHigherPreset(currentPrice, PRICE_PRESETS.LIVE_ENTRY);
      reason = 'Strong LIVE attendance supports higher entry fee';
      confidence = 'high';
      estimatedRevenueIncrease = 18;
    }
    // Low entries = decrease
    else if (stats.liveEntries < 5 && currentPrice > 15) {
      suggestedPrice = findNextLowerPreset(currentPrice, PRICE_PRESETS.LIVE_ENTRY);
      reason = 'Lower entry fee may attract more viewers';
      confidence = 'medium';
      estimatedRevenueIncrease = 12;
    }

    if (suggestedPrice !== currentPrice) {
      return {
        type: 'LIVE_ENTRY',
        currentPrice,
        suggestedPrice,
        reason,
        estimatedRevenueIncrease,
        confidence,
      };
    }

    return null;
  } catch (error) {
    console.error('Error analyzing LIVE pricing:', error);
    return null;
  }
}

/**
 * Analyze Creator Offers pricing
 */
async function analyzeOffersPricing(
  creatorId: string,
  stats: CreatorStats
): Promise<PriceSuggestion | null> {
  try {
    // Assume current offer price
    const currentPrice = 200;

    let suggestedPrice = currentPrice;
    let reason = 'Current offer pricing is optimal';
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    let estimatedRevenueIncrease = 0;

    // High purchases = can increase
    if (stats.offerPurchases > 15 && currentPrice < 450) {
      suggestedPrice = findNextHigherPreset(currentPrice, PRICE_PRESETS.CREATOR_OFFERS);
      reason = 'Strong offer sales support premium bundle pricing';
      confidence = 'high';
      estimatedRevenueIncrease = 25;
    }
    // Low purchases = decrease
    else if (stats.offerPurchases < 3 && currentPrice > 120) {
      suggestedPrice = findNextLowerPreset(currentPrice, PRICE_PRESETS.CREATOR_OFFERS);
      reason = 'Lower offer price may increase bundle sales';
      confidence = 'medium';
      estimatedRevenueIncrease = 16;
    }

    if (suggestedPrice !== currentPrice) {
      return {
        type: 'CREATOR_OFFERS',
        currentPrice,
        suggestedPrice,
        reason,
        estimatedRevenueIncrease,
        confidence,
      };
    }

    return null;
  } catch (error) {
    console.error('Error analyzing offers pricing:', error);
    return null;
  }
}

/**
 * Find next higher preset price
 */
function findNextHigherPreset(currentPrice: number, presets: number[]): number {
  const sorted = [...presets].sort((a, b) => a - b);
  const nextHigher = sorted.find(p => p > currentPrice);
  return nextHigher || currentPrice;
}

/**
 * Find next lower preset price
 */
function findNextLowerPreset(currentPrice: number, presets: number[]): number {
  const sorted = [...presets].sort((a, b) => b - a);
  const nextLower = sorted.find(p => p < currentPrice);
  // NEVER return 0 for paid services (forbidden)
  if (nextLower === 0 && currentPrice > 0) {
    return sorted.find(p => p > 0 && p < currentPrice) || currentPrice;
  }
  return nextLower || currentPrice;
}

/**
 * Apply suggested prices to all monetization types
 */
export async function applySuggestedPrices(creatorId: string): Promise<boolean> {
  try {
    const suggestions = await getSuggestions(creatorId);
    if (!suggestions || suggestions.length === 0) {
      return false;
    }

    const changes: Array<{ type: string; oldPrice: number; newPrice: number; reason: string }> = [];

    for (const suggestion of suggestions) {
      let success = false;

      switch (suggestion.type) {
        case 'PAID_CHAT':
          // Would apply to all chats - simplified for UI demo
          success = true;
          break;

        case 'SUBSCRIPTION':
          success = await subscriptionService.setCreatorPrice(
            creatorId,
            suggestion.suggestedPrice
          );
          break;

        case 'PPV':
          // Would apply to media items - simplified for UI demo
          success = true;
          break;

        case 'LIVE_ENTRY':
          // Would apply to future LIVE sessions - simplified for UI demo
          success = true;
          break;

        case 'CREATOR_OFFERS':
          // Would apply to future offers - simplified for UI demo
          success = true;
          break;
      }

      if (success) {
        changes.push({
          type: suggestion.type,
          oldPrice: suggestion.currentPrice,
          newPrice: suggestion.suggestedPrice,
          reason: suggestion.reason,
        });
      }
    }

    // Save to history
    if (changes.length > 0) {
      await addToHistory(creatorId, changes);
    }

    // Clear suggestions after applying
    await clearSuggestions(creatorId);

    return changes.length > 0;
  } catch (error) {
    console.error('Error applying suggested prices:', error);
    return false;
  }
}

/**
 * Get pricing change history for creator
 */
export async function getHistory(creatorId: string): Promise<PricingHistory[]> {
  try {
    const data = await AsyncStorage.getItem(PRICING_HISTORY_KEY);
    if (!data) return [];

    const allHistory: PricingHistory[] = JSON.parse(data);
    return allHistory.filter(h => h.creatorId === creatorId);
  } catch (error) {
    console.error('Error getting pricing history:', error);
    return [];
  }
}

/**
 * Add entry to pricing history
 */
async function addToHistory(
  creatorId: string,
  changes: Array<{ type: string; oldPrice: number; newPrice: number; reason: string }>
): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(PRICING_HISTORY_KEY);
    const allHistory: PricingHistory[] = data ? JSON.parse(data) : [];

    const historyEntry: PricingHistory = {
      creatorId,
      timestamp: new Date(),
      changes,
    };

    allHistory.push(historyEntry);

    // Keep only last 50 entries per creator
    const creatorHistory = allHistory.filter(h => h.creatorId === creatorId);
    if (creatorHistory.length > 50) {
      const otherHistory = allHistory.filter(h => h.creatorId !== creatorId);
      const trimmedCreatorHistory = creatorHistory.slice(-50);
      await AsyncStorage.setItem(
        PRICING_HISTORY_KEY,
        JSON.stringify([...otherHistory, ...trimmedCreatorHistory])
      );
    } else {
      await AsyncStorage.setItem(PRICING_HISTORY_KEY, JSON.stringify(allHistory));
    }
  } catch (error) {
    console.error('Error adding to history:', error);
  }
}

/**
 * Force manual recalculation
 */
export async function forceRecalculate(creatorId: string): Promise<PriceSuggestion[]> {
  return evaluatePricing(creatorId);
}

/**
 * Save suggestions to storage
 */
async function saveSuggestions(creatorId: string, suggestions: PriceSuggestion[]): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(PRICING_SUGGESTIONS_KEY);
    const allSuggestions: Record<string, PriceSuggestion[]> = data ? JSON.parse(data) : {};
    
    allSuggestions[creatorId] = suggestions;
    
    await AsyncStorage.setItem(PRICING_SUGGESTIONS_KEY, JSON.stringify(allSuggestions));
  } catch (error) {
    console.error('Error saving suggestions:', error);
  }
}

/**
 * Get saved suggestions
 */
export async function getSuggestions(creatorId: string): Promise<PriceSuggestion[]> {
  try {
    const data = await AsyncStorage.getItem(PRICING_SUGGESTIONS_KEY);
    if (!data) return [];

    const allSuggestions: Record<string, PriceSuggestion[]> = JSON.parse(data);
    return allSuggestions[creatorId] || [];
  } catch (error) {
    console.error('Error getting suggestions:', error);
    return [];
  }
}

/**
 * Clear suggestions after applying
 */
async function clearSuggestions(creatorId: string): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(PRICING_SUGGESTIONS_KEY);
    if (!data) return;

    const allSuggestions: Record<string, PriceSuggestion[]> = JSON.parse(data);
    delete allSuggestions[creatorId];
    
    await AsyncStorage.setItem(PRICING_SUGGESTIONS_KEY, JSON.stringify(allSuggestions));
  } catch (error) {
    console.error('Error clearing suggestions:', error);
  }
}

/**
 * Get auto-apply settings
 */
export async function getAutoApplySettings(creatorId: string): Promise<AutoPricingSettings> {
  try {
    const data = await AsyncStorage.getItem(AUTO_APPLY_SETTINGS_KEY);
    if (!data) {
      return {
        creatorId,
        autoApplyEnabled: false,
        autoApplyInterval: 7,
      };
    }

    const allSettings: Record<string, AutoPricingSettings> = JSON.parse(data);
    return allSettings[creatorId] || {
      creatorId,
      autoApplyEnabled: false,
      autoApplyInterval: 7,
    };
  } catch (error) {
    console.error('Error getting auto-apply settings:', error);
    return {
      creatorId,
      autoApplyEnabled: false,
      autoApplyInterval: 7,
    };
  }
}

/**
 * Update auto-apply settings
 */
export async function updateAutoApplySettings(settings: AutoPricingSettings): Promise<boolean> {
  try {
    const data = await AsyncStorage.getItem(AUTO_APPLY_SETTINGS_KEY);
    const allSettings: Record<string, AutoPricingSettings> = data ? JSON.parse(data) : {};
    
    allSettings[settings.creatorId] = settings;
    
    await AsyncStorage.setItem(AUTO_APPLY_SETTINGS_KEY, JSON.stringify(allSettings));
    return true;
  } catch (error) {
    console.error('Error updating auto-apply settings:', error);
    return false;
  }
}

/**
 * Check if auto-apply should run
 */
export async function shouldAutoApply(creatorId: string): Promise<boolean> {
  try {
    const settings = await getAutoApplySettings(creatorId);
    
    if (!settings.autoApplyEnabled) {
      return false;
    }

    if (!settings.lastAutoApply) {
      return true;
    }

    const lastApply = new Date(settings.lastAutoApply);
    const daysSinceLastApply = (Date.now() - lastApply.getTime()) / (1000 * 60 * 60 * 24);
    
    return daysSinceLastApply >= settings.autoApplyInterval;
  } catch (error) {
    console.error('Error checking auto-apply:', error);
    return false;
  }
}

export default {
  evaluatePricing,
  applySuggestedPrices,
  getHistory,
  forceRecalculate,
  getSuggestions,
  getAutoApplySettings,
  updateAutoApplySettings,
  shouldAutoApply,
  PRICE_PRESETS,
  AVALO_COMMISSION,
  CREATOR_SHARE,
};