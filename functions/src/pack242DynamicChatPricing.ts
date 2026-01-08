/**
 * PACK 242 - Dynamic Chat Pricing Modifier (Elite Earners Upgrade)
 * 
 * Performance-based chat pricing system that allows elite creators to increase
 * their chat entry price from 100 tokens (baseline) to 500 tokens (maximum).
 * 
 * KEY DIFFERENCES FROM PACK 219:
 * - Performance-based (not reputation-based)
 * - Requires 60+ days active, 250+ partners OR 100+ bookings
 * - Requires 70%+ reply rate, 4.3★+ rating, 35k+ tokens/month
 * - Gender-inclusive (men need Influencer Badge)
 * - Price lock on 3 consecutive months of earnings drop
 * - No price reduction allowed (prevents bait & switch)
 * - 30-day change cooldown (vs 7 days in PACK 219)
 * 
 * ECONOMICS:
 * - 65/35 split unchanged
 * - 11/7 word billing unchanged
 * - Base price: 100 tokens for everyone
 * - Unlock is earned, not purchased
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import type { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

export type Pack242PriceTier = 0 | 1 | 2 | 3 | 4 | 5;

export interface Pack242PriceTierConfig {
  level: Pack242PriceTier;
  name: string;
  tokenCost: number;
  description: string;
}

export interface Pack242EligibilityRequirements {
  activeDays: number;
  minFanBase: {
    uniquePaidChatPartners?: number;
    calendarBookings?: number;
  };
  engagementQuality: {
    replyRatePercent: number;
    replyWithinHours: number;
  };
  safetyViolations: number;
  reviewRating: number;
  monthlyEarnings: number; // Before 35% Avalo share
}

export interface Pack242DynamicChatPricing {
  userId: string;
  eligible: boolean;
  currentPrice: number; // 100-500
  currentLevel: Pack242PriceTier; // 0-5
  lastPriceChange: Timestamp | FieldValue | null;
  lockedReason: 'earningsDrop' | 'violation' | 'manual' | null;
  lockedUntil: Timestamp | FieldValue | null;
  
  // Tracking for earnings drop detection
  monthlyEarnings: {
    [monthKey: string]: number; // Format: "2024-12"
  };
  consecutiveDropMonths: number;
  
  // Requirements status
  requirements: {
    activeDays: number;
    uniquePaidChatPartners: number;
    calendarBookings: number;
    replyRate: number;
    avgReplyTimeHours: number;
    safetyViolations: number;
    reviewRating: number;
    lastMonthEarnings: number;
  };
  
  // Gender-specific eligibility
  gender: 'male' | 'female' | 'other';
  hasInfluencerBadge: boolean;
  
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
  lastEligibilityCheck: Timestamp | FieldValue;
}

export interface Pack242PriceChangeHistory {
  userId: string;
  fromLevel: Pack242PriceTier;
  toLevel: Pack242PriceTier;
  fromPrice: number;
  toPrice: number;
  reason: 'manual' | 'earningsDrop' | 'violation' | 'initial';
  changedAt: Timestamp | FieldValue;
  analytics: {
    monthlyEarnings: number;
    replyRate: number;
    reviewRating: number;
  };
}

export interface Pack242DiscoveryAdjustment {
  userId: string;
  priceLevel: Pack242PriceTier;
  showToHighBudget: number; // 0-100 percentage
  showToMediumBudget: number; // 0-100 percentage
  showToLowBudget: number; // 0-100 percentage
  updatedAt: Timestamp | FieldValue;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const PACK_242_BASELINE_PRICE = 100; // Everyone starts here

export const PACK_242_PRICE_TIERS: Record<Pack242PriceTier, Pack242PriceTierConfig> = {
  0: {
    level: 0,
    name: 'Level 0 (Default)',
    tokenCost: 100,
    description: 'Default entry price for all chats'
  },
  1: {
    level: 1,
    name: 'Level 1',
    tokenCost: 150,
    description: 'First tier for proven performers'
  },
  2: {
    level: 2,
    name: 'Level 2',
    tokenCost: 200,
    description: 'Mid tier for consistent earners'
  },
  3: {
    level: 3,
    name: 'Level 3',
    tokenCost: 300,
    description: 'High tier for top performers'
  },
  4: {
    level: 4,
    name: 'Level 4',
    tokenCost: 400,
    description: 'Elite tier for exceptional earners'
  },
  5: {
    level: 5,
    name: 'Level 5 (Maximum)',
    tokenCost: 500,
    description: 'Maximum tier for highest performers'
  }
};

export const PACK_242_REQUIREMENTS: Pack242EligibilityRequirements = {
  activeDays: 60,
  minFanBase: {
    uniquePaidChatPartners: 250,
    calendarBookings: 100 // Alternative to chat partners
  },
  engagementQuality: {
    replyRatePercent: 70,
    replyWithinHours: 6
  },
  safetyViolations: 0,
  reviewRating: 4.3,
  monthlyEarnings: 35000 // Before 35% Avalo share
};

const PRICE_CHANGE_COOLDOWN_DAYS = 30;
const CONSECUTIVE_DROP_MONTHS_FOR_LOCK = 3;
const EARNINGS_DROP_THRESHOLD = 0.85; // If earnings < 85% of previous month

// Revenue split (unchanged from base system)
const EARNER_SHARE = 0.65; // 65%
const PLATFORM_SHARE = 0.35; // 35%

// ============================================================================
// ELIGIBILITY EVALUATION
// ============================================================================

/**
 * Check if a user is eligible for dynamic pricing
 * Evaluates ALL 6 requirements
 */
export async function checkPack242Eligibility(
  userId: string
): Promise<{
  eligible: boolean;
  reasons: string[];
  requirements: Pack242DynamicChatPricing['requirements'];
  canUse: boolean; // Gender-based permission
}> {
  
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  
  if (!userSnap.exists) {
    return {
      eligible: false,
      reasons: ['User not found'],
      requirements: {
        activeDays: 0,
        uniquePaidChatPartners: 0,
        calendarBookings: 0,
        replyRate: 0,
        avgReplyTimeHours: 0,
        safetyViolations: 0,
        reviewRating: 0,
        lastMonthEarnings: 0
      },
      canUse: false
    };
  }
  
  const user = userSnap.data() as any;
  const reasons: string[] = [];
  
  // Gender-based permission check
  const gender = user.gender as 'male' | 'female' | 'other';
  const hasInfluencerBadge = user.badges?.some((b: any) => b.type === 'influencer') || false;
  
  let canUse = true;
  if (gender === 'male' && !hasInfluencerBadge) {
    canUse = false;
    reasons.push('Men require Influencer Badge to use dynamic pricing');
  }
  // Women and nonbinary: eligible if they meet performance requirements (checked below)
  
  // Requirement 1: Active for ≥ 60 days
  const createdAt = user.createdAt?.toDate?.() || new Date();
  const activeDays = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  if (activeDays < PACK_242_REQUIREMENTS.activeDays) {
    reasons.push(`Need ${PACK_242_REQUIREMENTS.activeDays} days active (have ${activeDays})`);
  }
  
  // Requirement 2: Fan-base size (250+ unique paid chat partners OR 100+ calendar bookings)
  const uniquePaidChatPartners = await countUniquePaidChatPartners(userId);
  const calendarBookings = await countCalendarBookings(userId);
  
  const meetsFanBaseRequirement = 
    uniquePaidChatPartners >= PACK_242_REQUIREMENTS.minFanBase.uniquePaidChatPartners! ||
    calendarBookings >= PACK_242_REQUIREMENTS.minFanBase.calendarBookings!;
  
  if (!meetsFanBaseRequirement) {
    reasons.push(
      `Need ${PACK_242_REQUIREMENTS.minFanBase.uniquePaidChatPartners} unique paid partners ` +
      `OR ${PACK_242_REQUIREMENTS.minFanBase.calendarBookings} calendar bookings ` +
      `(have ${uniquePaidChatPartners} partners, ${calendarBookings} bookings)`
    );
  }
  
  // Requirement 3: Engagement quality (70%+ reply rate within 6 hours average)
  const engagementStats = await calculateEngagementStats(userId);
  if (engagementStats.replyRate < PACK_242_REQUIREMENTS.engagementQuality.replyRatePercent) {
    reasons.push(
      `Need ${PACK_242_REQUIREMENTS.engagementQuality.replyRatePercent}% reply rate ` +
      `(have ${engagementStats.replyRate.toFixed(1)}%)`
    );
  }
  if (engagementStats.avgReplyTimeHours > PACK_242_REQUIREMENTS.engagementQuality.replyWithinHours) {
    reasons.push(
      `Average reply time must be ≤ ${PACK_242_REQUIREMENTS.engagementQuality.replyWithinHours} hours ` +
      `(current: ${engagementStats.avgReplyTimeHours.toFixed(1)} hours)`
    );
  }
  
  // Requirement 4: Reputation (0 safety violations)
  const safetyViolations = await countSafetyViolations(userId);
  if (safetyViolations > PACK_242_REQUIREMENTS.safetyViolations) {
    reasons.push(`Must have 0 safety violations (have ${safetyViolations})`);
  }
  
  // Requirement 5: Review metric (4.3★ or higher)
  const reviewRating = user.stats?.reviewRating || 0;
  if (reviewRating < PACK_242_REQUIREMENTS.reviewRating) {
    reasons.push(
      `Need ${PACK_242_REQUIREMENTS.reviewRating}★ rating (have ${reviewRating.toFixed(1)}★)`
    );
  }
  
  // Requirement 6: Earnings (≥ 35,000 tokens per month before 35% Avalo share)
  const lastMonthEarnings = await calculateLastMonthEarnings(userId);
  if (lastMonthEarnings < PACK_242_REQUIREMENTS.monthlyEarnings) {
    reasons.push(
      `Need ${PACK_242_REQUIREMENTS.monthlyEarnings.toLocaleString()} tokens/month ` +
      `(have ${lastMonthEarnings.toLocaleString()})`
    );
  }
  
  const eligible = canUse &&
    activeDays >= PACK_242_REQUIREMENTS.activeDays &&
    meetsFanBaseRequirement &&
    engagementStats.replyRate >= PACK_242_REQUIREMENTS.engagementQuality.replyRatePercent &&
    engagementStats.avgReplyTimeHours <= PACK_242_REQUIREMENTS.engagementQuality.replyWithinHours &&
    safetyViolations === PACK_242_REQUIREMENTS.safetyViolations &&
    reviewRating >= PACK_242_REQUIREMENTS.reviewRating &&
    lastMonthEarnings >= PACK_242_REQUIREMENTS.monthlyEarnings;
  
  return {
    eligible,
    reasons: reasons.length > 0 ? reasons : ['All requirements met'],
    requirements: {
      activeDays,
      uniquePaidChatPartners,
      calendarBookings,
      replyRate: engagementStats.replyRate,
      avgReplyTimeHours: engagementStats.avgReplyTimeHours,
      safetyViolations,
      reviewRating,
      lastMonthEarnings
    },
    canUse
  };
}

/**
 * Count unique paid chat partners
 */
async function countUniquePaidChatPartners(userId: string): Promise<number> {
  const chats = await db.collection('chats')
    .where('roles.earnerId', '==', userId)
    .where('mode', '==', 'PAID')
    .where('billing.totalConsumed', '>', 0)
    .get();
  
  const uniquePartners = new Set<string>();
  chats.docs.forEach(doc => {
    const data = doc.data();
    const partnerId = data.roles.payerId;
    if (partnerId) uniquePartners.add(partnerId);
  });
  
  return uniquePartners.size;
}

/**
 * Count calendar bookings
 */
async function countCalendarBookings(userId: string): Promise<number> {
  const bookings = await db.collection('calendarBookings')
    .where('creatorId', '==', userId)
    .where('status', 'in', ['confirmed', 'completed'])
    .get();
  
  return bookings.size;
}

/**
 * Calculate engagement statistics
 */
async function calculateEngagementStats(userId: string): Promise<{
  replyRate: number;
  avgReplyTimeHours: number;
}> {
  // Get all messages where user is the earner in the last 90 days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  
  const chats = await db.collection('chats')
    .where('roles.earnerId', '==', userId)
    .where('lastActivityAt', '>=', cutoffDate)
    .get();
  
  let totalIncomingMessages = 0;
  let repliedMessages = 0;
  let totalReplyTimeMs = 0;
  let replyCount = 0;
  
  for (const chatDoc of chats.docs) {
    const chatId = chatDoc.id;
    const chatData = chatDoc.data();
    const payerId = chatData.roles.payerId;
    
    // Get messages in this chat
    const messages = await db.collection('messages')
      .where('chatId', '==', chatId)
      .orderBy('createdAt', 'asc')
      .get();
    
    let lastPayerMessageTime: Date | null = null;
    
    messages.docs.forEach(msgDoc => {
      const msg = msgDoc.data();
      const msgTime = msg.createdAt?.toDate();
      
      if (msg.senderId === payerId) {
        // Incoming message from payer
        totalIncomingMessages++;
        lastPayerMessageTime = msgTime;
      } else if (msg.senderId === userId && lastPayerMessageTime) {
        // Reply from earner
        repliedMessages++;
        const replyTimeMs = msgTime.getTime() - lastPayerMessageTime.getTime();
        totalReplyTimeMs += replyTimeMs;
        replyCount++;
        lastPayerMessageTime = null; // Reset for next message
      }
    });
  }
  
  const replyRate = totalIncomingMessages > 0 ? (repliedMessages / totalIncomingMessages) * 100 : 0;
  const avgReplyTimeHours = replyCount > 0 ? (totalReplyTimeMs / replyCount) / (1000 * 60 * 60) : 0;
  
  return { replyRate, avgReplyTimeHours };
}

/**
 * Count safety violations
 */
async function countSafetyViolations(userId: string): Promise<number> {
  const violations = await db.collection('safety_incidents')
    .where('userId', '==', userId)
    .where('severity', 'in', ['medium', 'high', 'critical'])
    .get();
  
  return violations.size;
}

/**
 * Calculate earnings for the last complete month
 */
async function calculateLastMonthEarnings(userId: string): Promise<number> {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  
  const transactions = await db.collection('transactions')
    .where('userId', '==', userId)
    .where('type', 'in', ['chat_earning', 'call_earning', 'booking_earning'])
    .where('createdAt', '>=', lastMonth)
    .where('createdAt', '<=', monthEnd)
    .get();
  
  const totalEarnings = transactions.docs.reduce((sum, doc) => {
    const data = doc.data();
    return sum + (data.amount || 0);
  }, 0);
  
  // Convert from earner's 65% to gross (before Avalo's 35%)
  const grossEarnings = totalEarnings / EARNER_SHARE;
  
  return Math.floor(grossEarnings);
}

// ============================================================================
// PRICE TIER MANAGEMENT
// ============================================================================

/**
 * Get current price for a user
 */
export async function getPack242ChatPrice(userId: string): Promise<number> {
  const pricingRef = db.collection('pack242_dynamic_pricing').doc(userId);
  const pricingSnap = await pricingRef.get();
  
  if (!pricingSnap.exists) {
    return PACK_242_BASELINE_PRICE;
  }
  
  const pricingData = pricingSnap.data() as Pack242DynamicChatPricing;
  
  // Check if locked
  if (pricingData.lockedReason) {
    return PACK_242_BASELINE_PRICE; // Locked users default to baseline
  }
  
  return pricingData.currentPrice || PACK_242_BASELINE_PRICE;
}

/**
 * Change price tier
 * Enforces all PACK 242 rules including no price reduction
 */
export async function changePack242PriceTier(
  userId: string,
  newLevel: Pack242PriceTier,
  reason: 'manual' | 'earningsDrop' | 'violation' = 'manual'
): Promise<{ success: boolean; message: string }> {
  
  // Check eligibility (unless it's a system lock action)
  if (reason === 'manual') {
    const eligibility = await checkPack242Eligibility(userId);
    
    if (!eligibility.canUse) {
      return {
        success: false,
        message: 'Not authorized to use dynamic pricing (men require Influencer Badge)'
      };
    }
    
    if (!eligibility.eligible) {
      return {
        success: false,
        message: `Not eligible: ${eligibility.reasons.join(', ')}`
      };
    }
  }
  
  const pricingRef = db.collection('pack242_dynamic_pricing').doc(userId);
  const pricingSnap = await pricingRef.get();
  
  let currentLevel: Pack242PriceTier = 0;
  let currentPrice = PACK_242_BASELINE_PRICE;
  
  if (pricingSnap.exists) {
    const pricingData = pricingSnap.data() as Pack242DynamicChatPricing;
    currentLevel = pricingData.currentLevel;
    currentPrice = pricingData.currentPrice;
    
    // Check if locked
    if (pricingData.lockedReason && reason === 'manual') {
      return {
        success: false,
        message: `Price is locked due to: ${pricingData.lockedReason}. Contact support.`
      };
    }
    
    // Check cooldown (30 days)
    if (pricingData.lastPriceChange && reason === 'manual') {
      const lastChange = (pricingData.lastPriceChange as Timestamp).toDate();
      const daysSinceChange = (Date.now() - lastChange.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceChange < PRICE_CHANGE_COOLDOWN_DAYS) {
        return {
          success: false,
          message: `Price change cooldown: ${Math.ceil(PRICE_CHANGE_COOLDOWN_DAYS - daysSinceChange)} days remaining`
        };
      }
    }
    
    // CRITICAL: No price reduction allowed (prevents bait & switch)
    if (newLevel < currentLevel && reason === 'manual') {
      return {
        success: false,
        message: 'Price reduction not allowed. You cannot lower your price once increased.'
      };
    }
  }
  
  const newPrice = PACK_242_PRICE_TIERS[newLevel].tokenCost;
  
  // Get current requirements for history
  const eligibility = await checkPack242Eligibility(userId);
  const userSnap = await db.collection('users').doc(userId).get();
  const user = userSnap.data() as any;
  
  // Update pricing document
  await pricingRef.set({
    userId,
    eligible: eligibility.eligible,
    currentPrice: newPrice,
    currentLevel: newLevel,
    lastPriceChange: reason === 'manual' ? serverTimestamp() : null,
    lockedReason: reason === 'manual' ? null : reason,
    lockedUntil: null,
    monthlyEarnings: pricingSnap.exists ? (pricingSnap.data() as Pack242DynamicChatPricing).monthlyEarnings : {},
    consecutiveDropMonths: 0, // Reset on manual change
    requirements: eligibility.requirements,
    gender: user.gender,
    hasInfluencerBadge: user.badges?.some((b: any) => b.type === 'influencer') || false,
    updatedAt: serverTimestamp(),
    lastEligibilityCheck: serverTimestamp(),
    createdAt: pricingSnap.exists ? (pricingSnap.data() as Pack242DynamicChatPricing).createdAt : serverTimestamp()
  } as Pack242DynamicChatPricing, { merge: true });
  
  // Record history
  await db.collection('pack242_dynamic_pricing').doc(userId).collection('history').add({
    userId,
    fromLevel: currentLevel,
    toLevel: newLevel,
    fromPrice: currentPrice,
    toPrice: newPrice,
    reason,
    changedAt: serverTimestamp(),
    analytics: {
      monthlyEarnings: eligibility.requirements.lastMonthEarnings,
      replyRate: eligibility.requirements.replyRate,
      reviewRating: eligibility.requirements.reviewRating
    }
  } as Pack242PriceChangeHistory);
  
  // Update discovery feed adjustments
  await updateDiscoveryAdjustments(userId, newLevel);
  
  return {
    success: true,
    message: `Price tier changed to Level ${newLevel} (${newPrice} tokens)`
  };
}

/**
 * Update discovery feed visibility based on price tier
 */
async function updateDiscoveryAdjustments(
  userId: string,
  priceLevel: Pack242PriceTier
): Promise<void> {
  
  // Algorithm: Higher price = shown more to high-budget users, less to low-budget
  let showToHighBudget = 100;
  let showToMediumBudget = 100;
  let showToLowBudget = 100;
  
  switch (priceLevel) {
    case 0: // 100 tokens - show to everyone equally
      break;
    case 1: // 150 tokens
      showToLowBudget = 80;
      break;
    case 2: // 200 tokens
      showToHighBudget = 120; // Boost to high-budget
      showToLowBudget = 60;
      break;
    case 3: // 300 tokens
      showToHighBudget = 150;
      showToMediumBudget = 90;
      showToLowBudget = 40;
      break;
    case 4: // 400 tokens
      showToHighBudget = 180;
      showToMediumBudget = 70;
      showToLowBudget = 20;
      break;
    case 5: // 500 tokens
      showToHighBudget = 200;
      showToMediumBudget = 50;
      showToLowBudget = 10;
      break;
  }
  
  await db.collection('pack242_discovery_adjustments').doc(userId).set({
    userId,
    priceLevel,
    showToHighBudget,
    showToMediumBudget,
    showToLowBudget,
    updatedAt: serverTimestamp()
  } as Pack242DiscoveryAdjustment);
}

// ============================================================================
// MONTHLY EARNINGS TRACKING
// ============================================================================

/**
 * Track monthly earnings and detect drops
 * Should run at the end of each month
 */
export async function trackMonthlyEarningsForPack242(): Promise<number> {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`; // e.g., "2024-12"
  
  // Get all users with dynamic pricing
  const pricingDocs = await db.collection('pack242_dynamic_pricing')
    .where('eligible', '==', true)
    .get();
  
  let tracked = 0;
  
  for (const doc of pricingDocs.docs) {
    const userId = doc.id;
    const pricingData = doc.data() as Pack242DynamicChatPricing;
    
    // Calculate this month's earnings
    const monthEarnings = await calculateLastMonthEarnings(userId);
    
    // Get previous months' earnings
    const previousMonths = Object.keys(pricingData.monthlyEarnings || {}).sort().reverse();
    let consecutiveDrops = 0;
    
    // Check for consecutive drops
    if (previousMonths.length > 0) {
      const lastMonthKey = previousMonths[0];
      const lastMonthEarnings = pricingData.monthlyEarnings[lastMonthKey];
      
      if (monthEarnings < lastMonthEarnings * EARNINGS_DROP_THRESHOLD) {
        // Earnings dropped below 85% of previous month
        consecutiveDrops = pricingData.consecutiveDropMonths + 1;
        
        // If 3 consecutive months of drops, lock pricing
        if (consecutiveDrops >= CONSECUTIVE_DROP_MONTHS_FOR_LOCK) {
          await changePack242PriceTier(userId, 0, 'earningsDrop');
          console.log(`Locked pricing for user ${userId} due to 3 consecutive months of earnings drops`);
        }
      } else {
        // Reset counter if earnings recovered
        consecutiveDrops = 0;
      }
    }
    
    // Update monthly earnings record
    await db.collection('pack242_dynamic_pricing').doc(userId).update({
      [`monthlyEarnings.${monthKey}`]: monthEarnings,
      consecutiveDropMonths: consecutiveDrops,
      updatedAt: serverTimestamp()
    });
    
    tracked++;
  }
  
  return tracked;
}

// ============================================================================
// INTEGRATION WITH CHAT SYSTEM
// ============================================================================

/**
 * Get chat entry price for PACK 242 integration
 * Replaces PACK 219's getChatEntryPrice for PACK 242 users
 */
export async function getPack242ChatEntryPrice(earnerId: string | null): Promise<number> {
  if (!earnerId) {
    return PACK_242_BASELINE_PRICE;
  }
  
  return getPack242ChatPrice(earnerId);
}

/**
 * Calculate revenue split (same as base system)
 */
export function calculatePack242RevenueSplit(entryPrice: number): {
  earnerAmount: number;
  platformAmount: number;
} {
  const platformAmount = Math.ceil(entryPrice * PLATFORM_SHARE);
  const earnerAmount = entryPrice - platformAmount;
  
  return {
    earnerAmount,
    platformAmount
  };
}

// ============================================================================
// ADMIN & ANALYTICS
// ============================================================================

/**
 * Get analytics for admin dashboard
 */
export async function getPack242Analytics(): Promise<{
  totalEligible: number;
  totalLocked: number;
  priceDistribution: Record<Pack242PriceTier, number>;
  averageMonthlyEarnings: number;
  topEarners: Array<{ userId: string; level: Pack242PriceTier; earnings: number }>;
}> {
  const pricingDocs = await db.collection('pack242_dynamic_pricing').get();
  
  let totalEligible = 0;
  let totalLocked = 0;
  const priceDistribution: Record<Pack242PriceTier, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalEarnings = 0;
  const earners: Array<{ userId: string; level: Pack242PriceTier; earnings: number }> = [];
  
  pricingDocs.docs.forEach(doc => {
    const data = doc.data() as Pack242DynamicChatPricing;
    
    if (data.eligible) totalEligible++;
    if (data.lockedReason) totalLocked++;
    
    priceDistribution[data.currentLevel]++;
    
    const earnings = data.requirements.lastMonthEarnings;
    totalEarnings += earnings;
    earners.push({ userId: doc.id, level: data.currentLevel, earnings });
  });
  
  const topEarners = earners.sort((a, b) => b.earnings - a.earnings).slice(0, 10);
  const averageMonthlyEarnings = pricingDocs.size > 0 ? totalEarnings / pricingDocs.size : 0;
  
  return {
    totalEligible,
    totalLocked,
    priceDistribution,
    averageMonthlyEarnings,
    topEarners
  };
}

/**
 * Unlock a user's pricing after lock (admin only)
 */
export async function unlockPack242Pricing(
  userId: string,
  adminId: string
): Promise<{ success: boolean; message: string }> {
  const pricingRef = db.collection('pack242_dynamic_pricing').doc(userId);
  const pricingSnap = await pricingRef.get();
  
  if (!pricingSnap.exists) {
    return { success: false, message: 'User does not have dynamic pricing' };
  }
  
  await pricingRef.update({
    lockedReason: null,
    lockedUntil: null,
    consecutiveDropMonths: 0,
    updatedAt: serverTimestamp()
  });
  
  // Log admin action
  await db.collection('admin_actions').add({
    adminId,
    action: 'unlock_pack242_pricing',
    targetUserId: userId,
    timestamp: serverTimestamp()
  });
  
  return { success: true, message: 'Pricing unlocked successfully' };
}