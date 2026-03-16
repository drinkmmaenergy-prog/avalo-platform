import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * PACK 161 — Relevance Ranking Service
 * Interest-Driven Discovery Without Matchmaking Bias
 * 
 * CRITICAL: Zero attractiveness scoring, zero appearance bias
 */

import { db, serverTimestamp } from '../init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  DiscoveryRankingFactors,
  DiscoveryScore,
  CreatorRelevanceScore,
  InterestVector,
  DEFAULT_RANKING_WEIGHTS,
  FORBIDDEN_KEYWORDS,
} from '../types/smartSocialGraph.types';
import { admin, timestamp } from '../runtime';

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (...args: any[]) => console.log('[RelevanceRanking]', ...args),
  warn: (...args: any[]) => console.warn('[RelevanceRanking]', ...args),
  error: (...args: any[]) => console.error('[RelevanceRanking]', ...args),
};

// ============================================================================
// RELEVANCE CALCULATION (NO APPEARANCE METRICS)
// ============================================================================

/**
 * Calculate topical match between viewer interests and earner content
 * Based on content tags, category alignment, NOT looks
 */
function calculateTopicalRelevance(
  viewerInterests: InterestVector,
  earnerScore: CreatorRelevanceScore
): number {
  // Get viewer's primary category weight
  const categoryKey = earnerScore.primaryCategory.toLowerCase().replace('_', '');
  const viewerCategoryWeight = (viewerInterests.categories as any)[categoryKey] || 0;
  
  // Normalize to 0-1
  const categoryMatch = viewerCategoryWeight / 100;
  
  // Boost if specific interests overlap
  let specificInterestBoost = 0;
  const earnerTopics = earnerScore.topicalMatch; // Already 0-100
  
  // Combine category match with topical precision
  const topicalScore = (categoryMatch * 0.7) + ((earnerTopics / 100) * 0.3);
  
  return Math.max(0, Math.min(1, topicalScore));
}

/**
 * Calculate language alignment (NOT accent or voice attractiveness)
 */
function calculateLanguageAlignment(
  viewerLanguages: string[],
  earnerLanguage: string
): number {
  if (!earnerLanguage) return 0.5; // Neutral if unknown
  
  // Perfect match
  if (viewerLanguages.includes(earnerLanguage)) {
    return 1.0;
  }
  
  // Partial match (e.g., en-US matches en-GB)
  const earnerLangCode = earnerLanguage.split('-')[0];
  const hasPartialMatch = viewerLanguages.some(vl => vl.split('-')[0] === earnerLangCode);
  
  if (hasPartialMatch) {
    return 0.8;
  }
  
  // No match
  return 0.3;
}

/**
 * Calculate regional relevance (broad geographic, NOT GPS stalking)
 */
function calculateRegionalRelevance(
  viewerRegion: string | undefined,
  viewerCountry: string | undefined,
  earnerRegion: string | undefined,
  earnerCountry: string | undefined
): number {
  // Same country = high relevance
  if (viewerCountry && earnerCountry && viewerCountry === earnerCountry) {
    return 1.0;
  }
  
  // Same region = medium relevance
  if (viewerRegion && earnerRegion && viewerRegion === earnerRegion) {
    return 0.7;
  }
  
  // Different region = lower but not zero (global content still valuable)
  return 0.4;
}

/**
 * Calculate content recency score (NOT "hotness")
 */
function calculateRecencyScore(lastActivity: Timestamp | Date): number {
  const now = Date.now();
  const lastActiveMs = lastActivity instanceof Timestamp 
    ? lastActivity.toMillis() 
    : lastActivity.getTime();
  
  const hoursAgo = (now - lastActiveMs) / (1000 * 60 * 60);
  
  // Active within last 24 hours
  if (hoursAgo <= 24) {
    return 1.0;
  }
  
  // Active within last week
  if (hoursAgo <= 168) {
    return 0.8;
  }
  
  // Active within last month
  if (hoursAgo <= 720) {
    return 0.5;
  }
  
  // Older content
  return 0.2;
}

/**
 * Calculate retention quality (how engaging content is, NOT how attractive earner is)
 */
function calculateRetentionScore(retentionQuality: number): number {
  // Already 0-100, normalize to 0-1
  return Math.max(0, Math.min(1, retentionQuality / 100));
}

/**
 * Calculate safety score (good behavior = stable, NOT boosted)
 */
function calculateSafetyScore(safetyScore: number): number {
  // Already 0-100, normalize to 0-1
  // High safety = full visibility, low safety = reduced
  return Math.max(0, Math.min(1, safetyScore / 100));
}

/**
 * Calculate shadow density penalty (prevent mega-earner dominance)
 */
export function calculateDensityPenalty(weeklyImpressions: number): number {
  // Under 500K impressions/week = no penalty
  if (weeklyImpressions < 500_000) {
    return 0;
  }
  
  // 500K-1M = slight penalty
  if (weeklyImpressions < 1_000_000) {
    return 0.1;
  }
  
  // 1M-2M = moderate penalty
  if (weeklyImpressions < 2_000_000) {
    return 0.3;
  }
  
  // 2M+ = significant penalty (rotation limit)
  return 0.5;
}

// ============================================================================
// MAIN RELEVANCE SCORING
// ============================================================================

/**
 * Calculate relevance score between viewer and earner
 * ZERO appearance bias, ZERO attractiveness scoring
 */
export async function calculateRelevanceScore(
  viewerId: string,
  earnerId: string
): Promise<DiscoveryScore> {
  try {
    // Fetch viewer interests
    const viewerDoc = await db.collection('interest_vectors').doc(viewerId).get();
    if (!viewerDoc.exists) {
      throw new Error(`Interest vector not found for viewer ${viewerId}`);
    }
    const viewerInterests = viewerDoc.data() as InterestVector;
    
    // Fetch earner relevance score
    const earnerDoc = await db.collection('earner_relevance_scores').doc(earnerId).get();
    if (!earnerDoc.exists) {
      throw new Error(`Relevance score not found for earner ${earnerId}`);
    }
    const earnerScore = earnerDoc.data() as CreatorRelevanceScore;
    
    // Calculate component scores
    const topicalRelevance = calculateTopicalRelevance(viewerInterests, earnerScore);
    const languageAlignment = calculateLanguageAlignment(
      viewerInterests.languages,
      viewerInterests.languages[0] || 'en' // Assume earner uses viewer's primary language for now
    );
    const regionalRelevance = calculateRegionalRelevance(
      viewerInterests.region,
      viewerInterests.countryCode,
      undefined, // Would fetch from earner profile
      undefined
    );
    const recencyScore = calculateRecencyScore(
      earnerScore.lastCalculated instanceof Timestamp 
        ? earnerScore.lastCalculated 
        : Timestamp.now()
    );
    const retentionScore = calculateRetentionScore(earnerScore.retentionQuality);
    const safetyScore = calculateSafetyScore(earnerScore.safetyScore);
    const densityPenalty = calculateDensityPenalty(earnerScore.weeklyImpressions);
    
    // Build ranking factors (FORBIDDEN fields must be 0)
    const factors: DiscoveryRankingFactors = {
      topicalRelevance,
      languageAlignment,
      regionalRelevance,
      recencyScore,
      retentionScore,
      safetyScore,
      densityPenalty,
      
      // FORBIDDEN - must always be 0
      attractivenessScore: 0,
      beautyRating: 0,
      sexAppeal: 0,
      tokenSpendingBoost: 0,
      relationshipInfluence: 0,
    };
    
    // Calculate weighted final score
    const weights = DEFAULT_RANKING_WEIGHTS;
    const finalScore = Math.max(0, Math.min(100,
      (factors.topicalRelevance * weights.topical * 100) +
      (factors.languageAlignment * weights.language * 100) +
      (factors.regionalRelevance * weights.region * 100) +
      (factors.recencyScore * weights.recency * 100) +
      (factors.retentionScore * weights.retention * 100) +
      (factors.safetyScore * weights.safety * 100) -
      (factors.densityPenalty * Math.abs(weights.density) * 100)
    ));
    
    // Generate explanation
    const explanation = generateExplanation(factors, finalScore);
    
    const discoveryScore: DiscoveryScore = {
      targetUserId: earnerId,
      viewerId,
      factors,
      finalScore,
      explanation,
      computedAt: serverTimestamp() as Timestamp,
    };
    
    return discoveryScore;
  } catch (error) {
    logger.error('Error calculating relevance score:', error);
    throw error;
  }
}

/**
 * Generate human-readable explanation for score
 */
function generateExplanation(factors: DiscoveryRankingFactors, finalScore: number): string {
  const reasons: string[] = [];
  
  if (factors.topicalRelevance > 0.7) {
    reasons.push('High topical match with your interests');
  } else if (factors.topicalRelevance > 0.4) {
    reasons.push('Moderate topical relevance');
  }
  
  if (factors.languageAlignment > 0.9) {
    reasons.push('Content in your preferred language');
  }
  
  if (factors.regionalRelevance > 0.8) {
    reasons.push('Local earner from your region');
  }
  
  if (factors.recencyScore > 0.7) {
    reasons.push('Recently active');
  }
  
  if (factors.retentionScore > 0.7) {
    reasons.push('High-quality engaging content');
  }
  
  if (factors.safetyScore > 0.9) {
    reasons.push('Excellent safety track record');
  }
  
  if (factors.densityPenalty > 0.3) {
    reasons.push('(Visibility reduced due to high recent exposure)');
  }
  
  if (reasons.length === 0) {
    return 'Suggested based on general compatibility';
  }
  
  return reasons.join(', ');
}

/**
 * Update earner relevance score
 * Called by background job to refresh scores
 */
export async function updateCreatorRelevanceScore(earnerId: string): Promise<void> {
  try {
    logger.info(`Updating relevance score for earner ${earnerId}`);
    
    // Fetch earner data
    const earnerDoc = await db.collection('users').doc(earnerId).get();
    if (!earnerDoc.exists) {
      throw new Error(`Creator ${earnerId} not found`);
    }
    
    const earnerData = earnerDoc.data();
    
    // Calculate topical match (from content analysis, not profile photo analysis)
    const topicalMatch = await calculateCreatorTopicalMatch(earnerId);
    
    // Calculate retention quality (from view duration, not attractiveness)
    const retentionQuality = await calculateCreatorRetentionQuality(earnerId);
    
    // Calculate safety score (from violation history)
    const safetyScore = await calculateCreatorSafetyScore(earnerId);
    
    // Get weekly impressions for shadow density
    const weeklyImpressions = await getWeeklyImpressions(earnerId);
    
    // Determine primary category
    const primaryCategory = earnerData?.profile?.primaryCategory || 'ENTERTAINMENT';
    
    const relevanceScore: CreatorRelevanceScore = {
      earnerId,
      primaryCategory,
      topicalMatch,
      languageMatch: 100, // Would calculate from content language analysis
      regionMatch: 100, // Would calculate from location data
      contentFreshness: calculateContentFreshness(earnerData?.lastActiveAt),
      retentionQuality,
      satisfactionScore: 70, // Would calculate from feedback
      productDeliveryQuality: undefined,
      safetyScore,
      weeklyImpressions,
      lastCalculated: serverTimestamp() as Timestamp,
    };
    
    // Save to Firestore
    await db.collection('earner_relevance_scores').doc(earnerId).set(relevanceScore);
    
    logger.info(`Relevance score updated for earner ${earnerId}: topical=${topicalMatch}, safety=${safetyScore}`);
  } catch (error) {
    logger.error(`Error updating relevance score for earner ${earnerId}:`, error);
    throw error;
  }
}

/**
 * Calculate earner's topical match score (content analysis, NOT appearance)
 */
async function calculateCreatorTopicalMatch(earnerId: string): Promise<number> {
  // Would analyze content tags, categories, topics
  // For now, return default
  return 70;
}

/**
 * Calculate earner's retention quality (watch time, NOT attractiveness)
 */
async function calculateCreatorRetentionQuality(earnerId: string): Promise<number> {
  // Would analyze video completion rates, session duration
  // For now, return default
  return 70;
}

/**
 * Calculate earner's safety score (violation history)
 */
async function calculateCreatorSafetyScore(earnerId: string): Promise<number> {
  try {
    const enforcementDoc = await db.collection('user_enforcement_state').doc(earnerId).get();
    if (!enforcementDoc.exists) {
      return 100; // No violations = perfect score
    }
    
    const enforcement = enforcementDoc.data();
    const accountStatus = enforcement?.accountStatus || 'ACTIVE';
    
    if (accountStatus === 'SUSPENDED') return 0;
    if (accountStatus === 'HARD_RESTRICTED') return 30;
    if (accountStatus === 'SOFT_RESTRICTED') return 60;
    
    // Check violation count
    const violationCount = enforcement?.violationHistory?.length || 0;
    if (violationCount === 0) return 100;
    if (violationCount <= 2) return 85;
    if (violationCount <= 5) return 70;
    
    return 50;
  } catch (error) {
    return 70; // Default safe score
  }
}

/**
 * Calculate content freshness score
 */
function calculateContentFreshness(lastActiveAt: any): number {
  if (!lastActiveAt) return 50;
  
  const timestamp = lastActiveAt instanceof Timestamp ? lastActiveAt : Timestamp.fromDate(lastActiveAt);
  const recency = calculateRecencyScore(timestamp);
  
  return Math.round(recency * 100);
}

/**
 * Get weekly impressions for shadow density calculation
 */
async function getWeeklyImpressions(earnerId: string): Promise<number> {
  try {
    const counterDoc = await db.collection('shadow_density_counters').doc(earnerId).get();
    if (!counterDoc.exists) {
      return 0;
    }
    
    const counter = counterDoc.data();
    return counter?.weeklyImpressions || 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Validate that no forbidden keywords are used in discovery
 */
export function validateNoForbiddenContent(content: string): boolean {
  const lowerContent = content.toLowerCase();
  
  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (lowerContent.includes(keyword)) {
      logger.warn(`Forbidden keyword detected: ${keyword}`);
      return false;
    }
  }
  
  return true;
}

logger.info('✅ Relevance Ranking Service initialized');

























