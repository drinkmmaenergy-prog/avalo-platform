/**
 * PACK 134 — Personalized Feed Generator
 * 
 * Generates personalized content feeds based on:
 * - User interests (behavioral)
 * - Time-of-day patterns
 * - New creator fairness boost
 * - Diversity injection
 * - Safety filtering
 * 
 * STRICTLY FORBIDDEN in ranking:
 * - Token spending/earning
 * - Beauty/attractiveness
 * - Demographics
 * - VIP/subscription status
 * - NSFW boost
 */

import { Timestamp } from 'firebase-admin/firestore';
import { db } from './init';
import { logger } from 'firebase-functions/v2';
import {
  PersonalizedFeedRequest,
  PersonalizedFeedResponse,
  PersonalizedFeedItem,
  InterestCategory,
  RecommendationReason,
  RecommendationReasonType,
  NewCreatorBoostProfile,
  DiversityConfig,
  DEFAULT_RECOMMENDATION_CONFIG,
} from './types/pack134-types';
import { getUserInterests } from './pack134-interest-graph';
import { getTimeOfDayRelevance } from './pack134-time-relevance';
import { checkSafetyFilters } from './pack134-safety-filter';
import { calculateNewCreatorBoost } from './pack134-fairness-boost';

// ============================================================================
// FEED GENERATION CORE
// ============================================================================

/**
 * Generate personalized feed for user
 * 
 * @param request - Feed request parameters
 * @returns Personalized feed with items and explanations
 */
export async function generatePersonalizedFeed(
  request: PersonalizedFeedRequest
): Promise<PersonalizedFeedResponse> {
  const startTime = Date.now();
  logger.info('[Pack134] Generating personalized feed', {
    userId: request.userId,
    feedType: request.feedType,
    limit: request.limit,
  });
  
  try {
    // 1. Get user interests
    const userInterests = await getUserInterests(request.userId);
    
    // 2. Get time-of-day preferences
    const timePreferences = await getTimeOfDayRelevance(request.userId);
    
    // 3. Get candidate content
    const candidates = await fetchCandidateContent(request, userInterests);
    
    // 4. Apply safety filters
    const safeContent = await filterForSafety(request.userId, candidates);
    
    // 5. Score and rank content
    const rankedContent = await scoreAndRankContent(
      request.userId,
      safeContent,
      userInterests,
      timePreferences
    );
    
    // 6. Apply fairness boost for new creators
    const boostedContent = await applyFairnessBoost(rankedContent);
    
    // 7. Apply diversity injection
    const diversifiedContent = applyDiversityInjection(boostedContent);
    
    // 8. Generate recommendation reasons
    const itemsWithReasons = await generateRecommendationReasons(
      request.userId,
      diversifiedContent.slice(0, request.limit)
    );
    
    const duration = Date.now() - startTime;
    logger.info('[Pack134] Feed generation complete', {
      userId: request.userId,
      itemsReturned: itemsWithReasons.length,
      durationMs: duration,
    });
    
    return {
      items: itemsWithReasons,
      cursor: itemsWithReasons.length > 0 ? 
        itemsWithReasons[itemsWithReasons.length - 1].contentId : undefined,
      hasMore: itemsWithReasons.length === request.limit,
      generatedAt: Timestamp.now(),
      personalizationApplied: userInterests !== null,
    };
  } catch (error) {
    logger.error('[Pack134] Feed generation failed', { error });
    throw error;
  }
}

// ============================================================================
// CANDIDATE FETCHING
// ============================================================================

interface CandidateContent {
  contentId: string;
  contentType: 'POST' | 'STORY' | 'REEL';
  creatorId: string;
  creatorName: string;
  creatorPhotoUrl?: string;
  categories: InterestCategory[];
  createdAt: Timestamp;
  engagementScore: number;
  isNewCreator: boolean;
}

/**
 * Fetch candidate content based on feed type and filters
 */
async function fetchCandidateContent(
  request: PersonalizedFeedRequest,
  userInterests: any
): Promise<CandidateContent[]> {
  const config = DEFAULT_RECOMMENDATION_CONFIG;
  const candidates: CandidateContent[] = [];
  
  // Determine content collection based on feed type
  let collectionName: string;
  switch (request.feedType) {
    case 'HOME':
      collectionName = 'feed_posts';
      break;
    case 'STORIES':
      collectionName = 'premium_stories';
      break;
    case 'REELS':
      collectionName = 'reels';
      break;
    case 'DISCOVER':
      collectionName = 'feed_posts';
      break;
    default:
      collectionName = 'feed_posts';
  }
  
  // Build query
  let query = db.collection(collectionName)
    .where('visibility', '==', 'PUBLIC')
    .orderBy('createdAt', 'desc')
    .limit(config.maxCandidates);
  
  // Apply cursor for pagination
  if (request.cursor) {
    const cursorDoc = await db.collection(collectionName).doc(request.cursor).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }
  
  // Apply time window filter
  if (request.filters?.timeWindow) {
    const cutoffTime = getTimeWindowCutoff(request.filters.timeWindow);
    query = query.where('createdAt', '>=', cutoffTime);
  }
  
  // Execute query
  const snapshot = await query.get();
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    // Get creator info
    const creatorDoc = await db.collection('users').doc(data.userId).get();
    const creatorData = creatorDoc.data();
    
    if (!creatorData) continue;
    
    // Get content categories
    const categoryDoc = await db.collection('content_category_profiles').doc(doc.id).get();
    const categoryData = categoryDoc.data();
    
    // Check if creator is "new"
    const accountAgeMs = Date.now() - creatorData.createdAt.toMillis();
    const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);
    const isNewCreator = accountAgeDays < config.newCreatorDefinitionDays;
    
    candidates.push({
      contentId: doc.id,
      contentType: data.type || 'POST',
      creatorId: data.userId,
      creatorName: creatorData.displayName || 'Unknown',
      creatorPhotoUrl: creatorData.photoURL,
      categories: categoryData?.primaryCategory ? 
        [categoryData.primaryCategory, ...(categoryData.secondaryCategories || [])] : 
        ['lifestyle'],
      createdAt: data.createdAt,
      engagementScore: calculateEngagementScore(data),
      isNewCreator,
    });
  }
  
  logger.info('[Pack134] Fetched candidates', {
    count: candidates.length,
    collection: collectionName,
  });
  
  return candidates;
}

/**
 * Calculate engagement score from content data
 */
function calculateEngagementScore(contentData: any): number {
  const likes = contentData.likesCount || 0;
  const comments = contentData.commentsCount || 0;
  const shares = contentData.sharesCount || 0;
  const views = contentData.viewsCount || 1;
  
  // Engagement rate calculation
  const engagementRate = (likes + comments * 2 + shares * 3) / views;
  
  return Math.min(1.0, engagementRate);
}

/**
 * Get timestamp cutoff for time window
 */
function getTimeWindowCutoff(timeWindow: string): Timestamp {
  const now = Date.now();
  let cutoffMs: number;
  
  switch (timeWindow) {
    case 'RECENT':
      cutoffMs = now - (1000 * 60 * 60); // 1 hour
      break;
    case 'TODAY':
      cutoffMs = now - (1000 * 60 * 60 * 24); // 24 hours
      break;
    case 'WEEK':
      cutoffMs = now - (1000 * 60 * 60 * 24 * 7); // 7 days
      break;
    case 'MONTH':
      cutoffMs = now - (1000 * 60 * 60 * 24 * 30); // 30 days
      break;
    default:
      cutoffMs = now - (1000 * 60 * 60 * 24); // Default 24 hours
  }
  
  return Timestamp.fromMillis(cutoffMs);
}

// ============================================================================
// SAFETY FILTERING
// ============================================================================

/**
 * Filter content for safety (integrates with PACK 126)
 */
async function filterForSafety(
  userId: string,
  candidates: CandidateContent[]
): Promise<CandidateContent[]> {
  const safeContent: CandidateContent[] = [];
  
  for (const candidate of candidates) {
    const isSafe = await checkSafetyFilters(userId, candidate.creatorId, candidate.contentId);
    
    if (isSafe) {
      safeContent.push(candidate);
    }
  }
  
  logger.info('[Pack134] Safety filtered content', {
    before: candidates.length,
    after: safeContent.length,
    filtered: candidates.length - safeContent.length,
  });
  
  return safeContent;
}

// ============================================================================
// SCORING & RANKING
// ============================================================================

interface ScoredContent extends CandidateContent {
  relevanceScore: number;
  interestMatch: number;
  timeRelevance: number;
  freshnessScore: number;
  qualityScore: number;
}

/**
 * Score and rank content based on multiple signals
 */
async function scoreAndRankContent(
  userId: string,
  candidates: CandidateContent[],
  userInterests: any,
  timePreferences: any
): Promise<ScoredContent[]> {
  const scoredContent: ScoredContent[] = [];
  
  for (const candidate of candidates) {
    // Calculate interest match score
    const interestMatch = calculateInterestMatch(
      candidate.categories,
      userInterests?.interests || {}
    );
    
    // Calculate time-of-day relevance
    const timeRelevance = calculateTimeRelevance(
      candidate.categories,
      timePreferences
    );
    
    // Calculate freshness score (newer is better)
    const freshnessScore = calculateFreshnessScore(candidate.createdAt);
    
    // Calculate quality score (engagement-based)
    const qualityScore = candidate.engagementScore;
    
    // Combine scores with weights
    const relevanceScore = 
      (interestMatch * 0.35) +
      (timeRelevance * 0.15) +
      (freshnessScore * 0.25) +
      (qualityScore * 0.25);
    
    scoredContent.push({
      ...candidate,
      relevanceScore,
      interestMatch,
      timeRelevance,
      freshnessScore,
      qualityScore,
    });
  }
  
  // Sort by relevance score (descending)
  scoredContent.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  return scoredContent;
}

/**
 * Calculate how well content matches user interests
 */
function calculateInterestMatch(
  contentCategories: InterestCategory[],
  userInterests: Partial<Record<InterestCategory, number>>
): number {
  if (Object.keys(userInterests).length === 0) {
    return 0.5; // Neutral score if no interests
  }
  
  let maxMatch = 0;
  
  for (const category of contentCategories) {
    const interestScore = userInterests[category] || 0;
    maxMatch = Math.max(maxMatch, interestScore);
  }
  
  return maxMatch;
}

/**
 * Calculate time-of-day relevance
 */
function calculateTimeRelevance(
  contentCategories: InterestCategory[],
  timePreferences: any
): number {
  if (!timePreferences) {
    return 0.5; // Neutral if no time data
  }
  
  const currentHour = new Date().getHours();
  
  // Check if current hour has relevant patterns
  const hourPattern = timePreferences.hourlyPatterns?.find(
    (p: any) => p.hour === currentHour
  );
  
  if (!hourPattern) {
    return 0.5;
  }
  
  // Check if content categories match preferred categories for this hour
  const categoryMatch = contentCategories.some(cat =>
    hourPattern.preferredCategories.includes(cat)
  );
  
  return categoryMatch ? 0.8 : 0.3;
}

/**
 * Calculate freshness score (decays over time)
 */
function calculateFreshnessScore(createdAt: Timestamp): number {
  const ageMs = Date.now() - createdAt.toMillis();
  const ageHours = ageMs / (1000 * 60 * 60);
  
  // Exponential decay with half-life of 12 hours
  return Math.exp(-0.0578 * ageHours);
}

// ============================================================================
// FAIRNESS BOOST
// ============================================================================

/**
 * Apply fairness boost to new creators
 */
async function applyFairnessBoost(
  content: ScoredContent[]
): Promise<ScoredContent[]> {
  const config = DEFAULT_RECOMMENDATION_CONFIG;
  
  if (!config.newCreatorBoostEnabled) {
    return content;
  }
  
  const boostedContent = [...content];
  
  for (const item of boostedContent) {
    if (item.isNewCreator) {
      const boost = await calculateNewCreatorBoost(item.creatorId);
      item.relevanceScore *= boost.boostMultiplier;
    }
  }
  
  // Re-sort after boosting
  boostedContent.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  logger.info('[Pack134] Applied fairness boost', {
    newCreatorsCount: boostedContent.filter(c => c.isNewCreator).length,
  });
  
  return boostedContent;
}

// ============================================================================
// DIVERSITY INJECTION
// ============================================================================

/**
 * Apply diversity injection to prevent filter bubbles
 */
function applyDiversityInjection(content: ScoredContent[]): ScoredContent[] {
  const config = DEFAULT_RECOMMENDATION_CONFIG;
  
  if (!config.diversityInjectionEnabled) {
    return content;
  }
  
  const diversified: ScoredContent[] = [];
  const categoryStreak: InterestCategory[] = [];
  let explorationCount = 0;
  const explorationThreshold = Math.floor(content.length * config.explorationRate);
  
  // Inject diversity while maintaining overall quality
  for (let i = 0; i < content.length; i++) {
    const candidate = content[i];
    const primaryCategory = candidate.categories[0];
    
    // Check for category streak
    const streakLength = categoryStreak.filter(c => c === primaryCategory).length;
    
    if (streakLength >= config.maxSameCategoryStreak) {
      // Find content from different category
      const different = content.slice(i).find(
        c => c.categories[0] !== primaryCategory
      );
      
      if (different) {
        diversified.push(different);
        categoryStreak.push(different.categories[0]);
        categoryStreak.shift();
        continue;
      }
    }
    
    // Random exploration injection
    if (explorationCount < explorationThreshold && Math.random() < 0.2) {
      // Add random content from lower ranks for exploration
      const explorationIndex = Math.floor(i + Math.random() * 20);
      if (explorationIndex < content.length) {
        diversified.push(content[explorationIndex]);
        explorationCount++;
        continue;
      }
    }
    
    // Add normally
    diversified.push(candidate);
    categoryStreak.push(primaryCategory);
    
    // Keep streak window at max size
    if (categoryStreak.length > config.maxSameCategoryStreak) {
      categoryStreak.shift();
    }
  }
  
  logger.info('[Pack134] Applied diversity injection', {
    explorationItems: explorationCount,
  });
  
  return diversified;
}

// ============================================================================
// RECOMMENDATION REASONS
// ============================================================================

/**
 * Generate explanations for why content was recommended
 */
async function generateRecommendationReasons(
  userId: string,
  content: ScoredContent[]
): Promise<PersonalizedFeedItem[]> {
  const itemsWithReasons: PersonalizedFeedItem[] = [];
  
  for (const item of content) {
    const reasonId = `reason_${userId}_${item.contentId}_${Date.now()}`;
    
    // Determine primary reason
    let primaryReason: RecommendationReasonType;
    let explanation: string;
    
    if (item.interestMatch > 0.6) {
      primaryReason = 'INTEREST_MATCH';
      explanation = `You often view ${item.categories[0]} posts`;
    } else if (item.timeRelevance > 0.6) {
      primaryReason = 'TIME_PATTERN';
      explanation = 'You prefer this content at this time';
    } else if (item.isNewCreator) {
      primaryReason = 'NEW_CREATOR_BOOST';
      explanation = `New creator in ${item.categories[0]}`;
    } else if (item.freshnessScore > 0.8) {
      primaryReason = 'TRENDING_CATEGORY';
      explanation = `Popular in categories you like`;
    } else {
      primaryReason = 'SIMILAR_INTERACTION';
      explanation = 'Similar to content you liked';
    }
    
    // Store recommendation reason
    const reason: RecommendationReason = {
      reasonId,
      contentId: item.contentId,
      userId,
      primaryReason,
      explanation,
      factors: [
        {
          factorType: 'interest_match',
          value: item.interestMatch,
          description: 'Interest alignment',
        },
        {
          factorType: 'time_relevance',
          value: item.timeRelevance,
          description: 'Time-of-day match',
        },
        {
          factorType: 'quality',
          value: item.qualityScore,
          description: 'Content quality',
        },
      ],
      createdAt: Timestamp.now(),
    };
    
    await db.collection('recommendation_reasons').doc(reasonId).set(reason);
    
    itemsWithReasons.push({
      contentId: item.contentId,
      contentType: item.contentType,
      creatorId: item.creatorId,
      creatorName: item.creatorName,
      creatorPhotoUrl: item.creatorPhotoUrl,
      categories: item.categories,
      relevanceScore: item.relevanceScore,
      reasonId,
      timestamp: item.createdAt,
    });
  }
  
  return itemsWithReasons;
}

// ============================================================================
// EXPLANATION RETRIEVAL
// ============================================================================

/**
 * Get recommendation reason by ID (for "Why am I seeing this?" feature)
 */
export async function getRecommendationReason(
  reasonId: string
): Promise<RecommendationReason | null> {
  const reasonDoc = await db.collection('recommendation_reasons').doc(reasonId).get();
  
  if (!reasonDoc.exists) {
    return null;
  }
  
  return reasonDoc.data() as RecommendationReason;
}