/**
 * PACK 242 - Discovery Feed Integration
 * Adjusts profile visibility based on price tiers to protect conversion rates
 */

import { db } from './init.js';
import type { Pack242DiscoveryAdjustment } from './pack242DynamicChatPricing.js';

// ============================================================================
// USER BUDGET CLASSIFICATION
// ============================================================================

/**
 * Classify user's budget tier based on their token spending history
 */
export async function classifyUserBudget(userId: string): Promise<'low' | 'medium' | 'high'> {
  const now = new Date();
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  // Get spending in last 30 days
  const transactions = await db.collection('transactions')
    .where('userId', '==', userId)
    .where('type', 'in', ['chat_payment', 'call_payment', 'booking_payment'])
    .where('createdAt', '>=', last30Days)
    .get();
  
  const totalSpent = transactions.docs.reduce((sum, doc) => {
    const data = doc.data();
    return sum + Math.abs(data.amount || 0);
  }, 0);
  
  // Classification thresholds
  if (totalSpent >= 5000) return 'high'; // 5000+ tokens/month = high budget
  if (totalSpent >= 1000) return 'medium'; // 1000-4999 tokens/month = medium budget
  return 'low'; // < 1000 tokens/month = low budget
}

// ============================================================================
// DISCOVERY FEED ADJUSTMENTS
// ============================================================================

/**
 * Apply PACK 242 price-based visibility adjustments to discovery feed results
 * This should be called by the discovery/recommendation algorithm
 * 
 * @param profiles - Array of user profiles to show
 * @param viewerUserId - The user viewing the feed
 * @returns Adjusted profiles with visibility weights
 */
export async function applyPack242DiscoveryAdjustments(
  profiles: Array<{ userId: string; baseScore: number }>,
  viewerUserId: string
): Promise<Array<{ userId: string; adjustedScore: number; originalScore: number }>> {
  
  // Classify viewer's budget
  const viewerBudget = await classifyUserBudget(viewerUserId);
  
  // Get discovery adjustments for all profiles
  const adjustmentPromises = profiles.map(async (profile) => {
    const adjustmentRef = db.collection('pack242_discovery_adjustments').doc(profile.userId);
    const adjustmentSnap = await adjustmentRef.get();
    
    if (!adjustmentSnap.exists) {
      // No adjustment = default (100% visibility)
      return {
        userId: profile.userId,
        adjustedScore: profile.baseScore,
        originalScore: profile.baseScore
      };
    }
    
    const adjustment = adjustmentSnap.data() as Pack242DiscoveryAdjustment;
    
    // Get visibility percentage based on viewer's budget
    let visibilityPercent = 100;
    switch (viewerBudget) {
      case 'high':
        visibilityPercent = adjustment.showToHighBudget;
        break;
      case 'medium':
        visibilityPercent = adjustment.showToMediumBudget;
        break;
      case 'low':
        visibilityPercent = adjustment.showToLowBudget;
        break;
    }
    
    // Apply visibility adjustment to score
    const adjustedScore = profile.baseScore * (visibilityPercent / 100);
    
    return {
      userId: profile.userId,
      adjustedScore,
      originalScore: profile.baseScore
    };
  });
  
  const adjustedProfiles = await Promise.all(adjustmentPromises);
  
  // Sort by adjusted score (descending)
  return adjustedProfiles.sort((a, b) => b.adjustedScore - a.adjustedScore);
}

/**
 * Filter profiles by viewer's budget (hard filter version)
 * Use this if you want to completely hide expensive profiles from low-budget users
 * 
 * @param profiles - Array of user profiles
 * @param viewerUserId - The user viewing the feed
 * @param strictMode - If true, completely hide profiles when visibility < 50%
 * @returns Filtered profiles
 */
export async function filterProfilesByBudget(
  profiles: Array<{ userId: string; [key: string]: any }>,
  viewerUserId: string,
  strictMode: boolean = false
): Promise<Array<{ userId: string; [key: string]: any }>> {
  
  const viewerBudget = await classifyUserBudget(viewerUserId);
  
  const filteredProfiles: Array<{ userId: string; [key: string]: any }> = [];
  
  for (const profile of profiles) {
    const adjustmentRef = db.collection('pack242_discovery_adjustments').doc(profile.userId);
    const adjustmentSnap = await adjustmentRef.get();
    
    if (!adjustmentSnap.exists) {
      // No adjustment = always show
      filteredProfiles.push(profile);
      continue;
    }
    
    const adjustment = adjustmentSnap.data() as Pack242DiscoveryAdjustment;
    
    // Get visibility percentage
    let visibilityPercent = 100;
    switch (viewerBudget) {
      case 'high':
        visibilityPercent = adjustment.showToHighBudget;
        break;
      case 'medium':
        visibilityPercent = adjustment.showToMediumBudget;
        break;
      case 'low':
        visibilityPercent = adjustment.showToLowBudget;
        break;
    }
    
    // In strict mode, hide if visibility < 50%
    if (strictMode && visibilityPercent < 50) {
      continue;
    }
    
    // Otherwise include the profile
    filteredProfiles.push(profile);
  }
  
  return filteredProfiles;
}

/**
 * Get recommended visibility adjustment for a user's current price level
 * Useful for showing creators what will happen if they change their price
 */
export async function getVisibilityPreview(
  userId: string,
  priceLevel: number
): Promise<{
  priceLevel: number;
  price: number;
  visibility: {
    highBudget: number;
    mediumBudget: number;
    lowBudget: number;
  };
  estimatedReachChange: string;
}> {
  
  const adjustmentRef = db.collection('pack242_discovery_adjustments').doc(userId);
  const adjustmentSnap = await adjustmentRef.get();
  
  let visibility = { highBudget: 100, mediumBudget: 100, lowBudget: 100 };
  
  if (adjustmentSnap.exists) {
    const adjustment = adjustmentSnap.data() as Pack242DiscoveryAdjustment;
    visibility = {
      highBudget: adjustment.showToHighBudget,
      mediumBudget: adjustment.showToMediumBudget,
      lowBudget: adjustment.showToLowBudget
    };
  }
  
  // Calculate estimated reach change
  const avgVisibility = (visibility.highBudget + visibility.mediumBudget + visibility.lowBudget) / 3;
  let estimatedReachChange = 'No change';
  
  if (avgVisibility > 100) {
    estimatedReachChange = `+${(avgVisibility - 100).toFixed(0)}% more high-budget viewers`;
  } else if (avgVisibility < 100) {
    estimatedReachChange = `${(100 - avgVisibility).toFixed(0)}% fewer low-budget viewers`;
  }
  
  // Get price for the level
  const PACK_242_PRICE_TIERS = [100, 150, 200, 300, 400, 500];
  const price = PACK_242_PRICE_TIERS[priceLevel] || 100;
  
  return {
    priceLevel,
    price,
    visibility,
    estimatedReachChange
  };
}

/**
 * Get budget distribution among active users
 * Useful for analytics and understanding the user base
 */
export async function getBudgetDistribution(): Promise<{
  high: number;
  medium: number;
  low: number;
  total: number;
}> {
  
  const now = new Date();
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  // Get all users who were active in last 30 days
  const activeUsers = await db.collection('users')
    .where('lastActiveAt', '>=', last30Days)
    .get();
  
  let high = 0;
  let medium = 0;
  let low = 0;
  
  for (const userDoc of activeUsers.docs) {
    const budget = await classifyUserBudget(userDoc.id);
    switch (budget) {
      case 'high': high++; break;
      case 'medium': medium++; break;
      case 'low': low++; break;
    }
  }
  
  return {
    high,
    medium,
    low,
    total: activeUsers.size
  };
}
