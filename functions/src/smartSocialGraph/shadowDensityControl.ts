/**
 * PACK 161 — Shadow Density Prevention
 * Prevents mega-creators from dominating discovery
 * 
 * Equal opportunity, NOT equal results
 */

import { db, serverTimestamp } from '../init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  ShadowDensityCounter,
  SHADOW_DENSITY_THRESHOLD,
  GUARANTEED_NEW_CREATOR_SLOTS,
} from '../types/smartSocialGraph.types';

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (...args: any[]) => console.log('[ShadowDensity]', ...args),
  warn: (...args: any[]) => console.warn('[ShadowDensity]', ...args),
  error: (...args: any[]) => console.error('[ShadowDensity]', ...args),
};

// ============================================================================
// IMPRESSION TRACKING
// ============================================================================

/**
 * Record impression for a creator
 */
export async function recordCreatorImpression(
  creatorId: string,
  viewerId: string,
  context: 'FEED' | 'SEARCH' | 'EVENT' | 'PRODUCT'
): Promise<void> {
  try {
    const weekStart = getWeekStartDate();
    const counterId = creatorId;
    
    // Get or create counter
    const counterRef = db.collection('shadow_density_counters').doc(counterId);
    const counterDoc = await counterRef.get();
    
    if (!counterDoc.exists) {
      // Create new counter
      const newCounter: ShadowDensityCounter = {
        creatorId,
        weeklyImpressions: 1,
        weekStartDate: weekStart,
        isInRotationLimit: false,
        guaranteedDiscoverySlots: 0,
        lastUpdated: serverTimestamp() as Timestamp,
      };
      
      await counterRef.set(newCounter);
      return;
    }
    
    const counter = counterDoc.data() as ShadowDensityCounter;
    
    // Check if we need to reset (new week)
    if (counter.weekStartDate !== weekStart) {
      // New week - reset counter
      const resetCounter: ShadowDensityCounter = {
        creatorId,
        weeklyImpressions: 1,
        weekStartDate: weekStart,
        isInRotationLimit: false,
        guaranteedDiscoverySlots: counter.guaranteedDiscoverySlots,
        lastUpdated: serverTimestamp() as Timestamp,
      };
      
      await counterRef.set(resetCounter);
      return;
    }
    
    // Increment counter
    const newImpressions = counter.weeklyImpressions + 1;
    const isInRotationLimit = newImpressions >= SHADOW_DENSITY_THRESHOLD;
    
    await counterRef.update({
      weeklyImpressions: newImpressions,
      isInRotationLimit,
      lastUpdated: serverTimestamp(),
    });
    
    // Log if entering rotation limit
    if (!counter.isInRotationLimit && isInRotationLimit) {
      logger.warn(`Creator ${creatorId} has exceeded rotation limit (${newImpressions} impressions)`);
    }
  } catch (error) {
    logger.error('Error recording creator impression:', error);
    // Non-blocking - don't fail the request
  }
}

/**
 * Check if creator is in rotation limit
 */
export async function isCreatorInRotationLimit(creatorId: string): Promise<boolean> {
  try {
    const counterDoc = await db.collection('shadow_density_counters').doc(creatorId).get();
    if (!counterDoc.exists) {
      return false;
    }
    
    const counter = counterDoc.data() as ShadowDensityCounter;
    const weekStart = getWeekStartDate();
    
    // If different week, not in limit
    if (counter.weekStartDate !== weekStart) {
      return false;
    }
    
    return counter.isInRotationLimit || false;
  } catch (error) {
    logger.error('Error checking rotation limit:', error);
    return false;
  }
}

/**
 * Get current week start date (Monday 00:00 UTC)
 */
function getWeekStartDate(): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const monday = new Date(now);
  
  // Calculate days since Monday (0 = Sunday, 1 = Monday, etc.)
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  monday.setUTCDate(now.getUTCDate() - daysSinceMonday);
  monday.setUTCHours(0, 0, 0, 0);
  
  return monday.toISOString().split('T')[0]; // YYYY-MM-DD
}

// ============================================================================
// GUARANTEED SLOTS FOR NEW/MID-SIZE CREATORS
// ============================================================================

/**
 * Identify new and mid-size creators who deserve guaranteed slots
 */
export async function identifyGuaranteedSlotCreators(limit: number = 100): Promise<string[]> {
  try {
    const weekStart = getWeekStartDate();
    
    // Get creators with low impression counts (new or mid-size)
    const snapshot = await db
      .collection('shadow_density_counters')
      .where('weekStartDate', '==', weekStart)
      .where('weeklyImpressions', '<', 100000) // Under 100K impressions = eligible
      .orderBy('weeklyImpressions', 'asc')
      .limit(limit)
      .get();
    
    const creatorIds = snapshot.docs.map(doc => doc.data().creatorId);
    
    logger.info(`Identified ${creatorIds.length} creators for guaranteed slots`);
    
    return creatorIds;
  } catch (error) {
    logger.error('Error identifying guaranteed slot creators:', error);
    return [];
  }
}

/**
 * Mark creator as eligible for guaranteed discovery slots
 */
export async function grantGuaranteedSlots(creatorId: string, slotCount: number = 3): Promise<void> {
  try {
    const counterRef = db.collection('shadow_density_counters').doc(creatorId);
    
    await counterRef.update({
      guaranteedDiscoverySlots: slotCount,
      lastUpdated: serverTimestamp(),
    });
    
    logger.info(`Granted ${slotCount} guaranteed slots to creator ${creatorId}`);
  } catch (error) {
    logger.error('Error granting guaranteed slots:', error);
  }
}

// ============================================================================
// FEED DIVERSITY ENFORCEMENT
// ============================================================================

/**
 * Apply diversity rules to discovery feed candidates
 * Ensures new/mid creators get fair visibility
 */
export async function applyDiversityRules(
  candidates: Array<{ creatorId: string; score: number }>
): Promise<Array<{ creatorId: string; score: number; boosted?: boolean }>> {
  try {
    // Separate into mega-creators and regular creators
    const megaCreators: typeof candidates = [];
    const regularCreators: typeof candidates = [];
    const guaranteedSlotCreators: typeof candidates = [];
    
    for (const candidate of candidates) {
      const isInLimit = await isCreatorInRotationLimit(candidate.creatorId);
      const hasGuaranteedSlots = await checkGuaranteedSlots(candidate.creatorId);
      
      if (hasGuaranteedSlots) {
        guaranteedSlotCreators.push(candidate);
      } else if (isInLimit) {
        megaCreators.push(candidate);
      } else {
        regularCreators.push(candidate);
      }
    }
    
    logger.info(
      `Diversity split: ${guaranteedSlotCreators.length} guaranteed, ` +
      `${regularCreators.length} regular, ${megaCreators.length} mega`
    );
    
    // Build balanced feed
    const balancedFeed: Array<{ creatorId: string; score: number; boosted?: boolean }> = [];
    
    // First, add guaranteed slot creators (up to 3)
    for (let i = 0; i < Math.min(GUARANTEED_NEW_CREATOR_SLOTS, guaranteedSlotCreators.length); i++) {
      balancedFeed.push({
        ...guaranteedSlotCreators[i],
        boosted: true,
      });
    }
    
    // Then add regular creators (70% of remaining slots)
    const remainingSlots = candidates.length - balancedFeed.length;
    const regularSlots = Math.floor(remainingSlots * 0.7);
    
    for (let i = 0; i < Math.min(regularSlots, regularCreators.length); i++) {
      balancedFeed.push(regularCreators[i]);
    }
    
    // Finally add mega creators (30% of remaining slots)
    const megaSlots = remainingSlots - (balancedFeed.length - GUARANTEED_NEW_CREATOR_SLOTS);
    
    for (let i = 0; i < Math.min(megaSlots, megaCreators.length); i++) {
      balancedFeed.push(megaCreators[i]);
    }
    
    return balancedFeed;
  } catch (error) {
    logger.error('Error applying diversity rules:', error);
    return candidates; // Fallback to original list
  }
}

/**
 * Check if creator has guaranteed slots available
 */
async function checkGuaranteedSlots(creatorId: string): Promise<boolean> {
  try {
    const counterDoc = await db.collection('shadow_density_counters').doc(creatorId).get();
    if (!counterDoc.exists) {
      return false;
    }
    
    const counter = counterDoc.data() as ShadowDensityCounter;
    return (counter.guaranteedDiscoverySlots || 0) > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Consume a guaranteed slot (decrement counter)
 */
export async function consumeGuaranteedSlot(creatorId: string): Promise<void> {
  try {
    const counterRef = db.collection('shadow_density_counters').doc(creatorId);
    const counterDoc = await counterRef.get();
    
    if (!counterDoc.exists) {
      return;
    }
    
    const counter = counterDoc.data() as ShadowDensityCounter;
    const currentSlots = counter.guaranteedDiscoverySlots || 0;
    
    if (currentSlots > 0) {
      await counterRef.update({
        guaranteedDiscoverySlots: currentSlots - 1,
        lastUpdated: serverTimestamp(),
      });
    }
  } catch (error) {
    logger.error('Error consuming guaranteed slot:', error);
  }
}

// ============================================================================
// REGIONAL CREATOR PRIORITY
// ============================================================================

/**
 * Prioritize local creators for regional feeds
 */
export function prioritizeRegionalCreators(
  candidates: Array<{ creatorId: string; score: number; region?: string }>,
  viewerRegion: string
): Array<{ creatorId: string; score: number }> {
  // Sort with local creators first
  const localCreators = candidates.filter(c => c.region === viewerRegion);
  const otherCreators = candidates.filter(c => c.region !== viewerRegion);
  
  // Boost local creators by 20%
  const boostedLocal = localCreators.map(c => ({
    ...c,
    score: c.score * 1.2,
  }));
  
  // Combine and sort by score
  const combined = [...boostedLocal, ...otherCreators];
  combined.sort((a, b) => b.score - a.score);
  
  logger.info(`Regional priority: ${localCreators.length} local, ${otherCreators.length} global`);
  
  return combined;
}

// ============================================================================
// ANALYTICS & MONITORING
// ============================================================================

/**
 * Get shadow density statistics
 */
export async function getShadowDensityStats(): Promise<{
  totalCreators: number;
  creatorsInRotationLimit: number;
  avgWeeklyImpressions: number;
  top10Creators: Array<{ creatorId: string; impressions: number }>;
}> {
  try {
    const weekStart = getWeekStartDate();
    
    const snapshot = await db
      .collection('shadow_density_counters')
      .where('weekStartDate', '==', weekStart)
      .get();
    
    let totalImpressions = 0;
    let creatorsInLimit = 0;
    const impressionList: Array<{ creatorId: string; impressions: number }> = [];
    
    snapshot.docs.forEach(doc => {
      const counter = doc.data() as ShadowDensityCounter;
      totalImpressions += counter.weeklyImpressions;
      
      if (counter.isInRotationLimit) {
        creatorsInLimit++;
      }
      
      impressionList.push({
        creatorId: counter.creatorId,
        impressions: counter.weeklyImpressions,
      });
    });
    
    // Sort by impressions desc
    impressionList.sort((a, b) => b.impressions - a.impressions);
    
    return {
      totalCreators: snapshot.size,
      creatorsInRotationLimit: creatorsInLimit,
      avgWeeklyImpressions: snapshot.size > 0 ? Math.round(totalImpressions / snapshot.size) : 0,
      top10Creators: impressionList.slice(0, 10),
    };
  } catch (error) {
    logger.error('Error getting shadow density stats:', error);
    return {
      totalCreators: 0,
      creatorsInRotationLimit: 0,
      avgWeeklyImpressions: 0,
      top10Creators: [],
    };
  }
}

logger.info('✅ Shadow Density Control initialized');