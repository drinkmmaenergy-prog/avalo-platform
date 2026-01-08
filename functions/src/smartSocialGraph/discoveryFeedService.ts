/**
 * PACK 161 — Discovery Feed Service
 * Multi-Persona Personalization (User Controlled)
 * 
 * NO romantic mode, NO erotic mode, NO "meet people" mode
 */

import { db, serverTimestamp } from '../init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  DiscoveryMode,
  DiscoveryCategory,
  SmartSocialGraphRequest,
  SmartSocialGraphResponse,
  CreatorCard,
  InterestVector,
  UserDiscoveryPreferences,
} from '../types/smartSocialGraph.types';
import { calculateRelevanceScore } from './relevanceRanking';
import { 
  applyDiversityRules, 
  recordCreatorImpression,
  isCreatorInRotationLimit,
  prioritizeRegionalCreators,
} from './shadowDensityControl';
import { detectFlirtManipulation } from './antiFlirtManipulation';

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (...args: any[]) => console.log('[DiscoveryFeed]', ...args),
  warn: (...args: any[]) => console.warn('[DiscoveryFeed]', ...args),
  error: (...args: any[]) => console.error('[DiscoveryFeed]', ...args),
};

// ============================================================================
// MODE-SPECIFIC CATEGORY MAPPINGS
// ============================================================================

/**
 * Map discovery mode to relevant categories
 */
const MODE_CATEGORY_MAP: Record<DiscoveryMode, DiscoveryCategory[]> = {
  PROFESSIONAL: ['SKILLS', 'BUSINESS', 'DIGITAL_PRODUCTS'],
  SOCIAL_LIFESTYLE: ['LIFESTYLE', 'LOCAL_EVENTS', 'ENTERTAINMENT'],
  ENTERTAINMENT: ['ENTERTAINMENT', 'CREATIVE'],
  LEARNING: ['SKILLS', 'DIGITAL_PRODUCTS', 'BUSINESS'],
  LOCAL_EVENTS: ['LOCAL_EVENTS', 'LIFESTYLE', 'SKILLS'],
};

// ============================================================================
// USER PREFERENCES MANAGEMENT
// ============================================================================

/**
 * Get or create user discovery preferences
 */
export async function getUserDiscoveryPreferences(
  userId: string
): Promise<UserDiscoveryPreferences> {
  try {
    const prefsDoc = await db.collection('user_discovery_preferences').doc(userId).get();
    
    if (prefsDoc.exists) {
      return prefsDoc.data() as UserDiscoveryPreferences;
    }
    
    // Create default preferences
    const defaultPrefs: UserDiscoveryPreferences = {
      userId,
      currentMode: 'SOCIAL_LIFESTYLE',
      modeWeights: {
        PROFESSIONAL: 20,
        SOCIAL_LIFESTYLE: 40,
        ENTERTAINMENT: 30,
        LEARNING: 10,
        LOCAL_EVENTS: 0,
      },
      lastUpdated: serverTimestamp() as Timestamp,
    };
    
    await db.collection('user_discovery_preferences').doc(userId).set(defaultPrefs);
    
    return defaultPrefs;
  } catch (error) {
    logger.error('Error getting user preferences:', error);
    throw error;
  }
}

/**
 * Update user discovery mode
 */
export async function updateDiscoveryMode(
  userId: string,
  mode: DiscoveryMode
): Promise<void> {
  try {
    // Validate mode (NO forbidden modes)
    if (!['PROFESSIONAL', 'SOCIAL_LIFESTYLE', 'ENTERTAINMENT', 'LEARNING', 'LOCAL_EVENTS'].includes(mode)) {
      throw new Error(`Invalid discovery mode: ${mode}`);
    }
    
    await db.collection('user_discovery_preferences').doc(userId).update({
      currentMode: mode,
      lastUpdated: serverTimestamp(),
    });
    
    logger.info(`User ${userId} switched to ${mode} mode`);
  } catch (error) {
    logger.error('Error updating discovery mode:', error);
    throw error;
  }
}

// ============================================================================
// INTEREST VECTOR MANAGEMENT
// ============================================================================

/**
 * Get or create user interest vector
 */
async function getUserInterestVector(userId: string): Promise<InterestVector> {
  try {
    const vectorDoc = await db.collection('interest_vectors').doc(userId).get();
    
    if (vectorDoc.exists) {
      return vectorDoc.data() as InterestVector;
    }
    
    // Create default interest vector
    const defaultVector: InterestVector = {
      userId,
      categories: {
        skills: 20,
        lifestyle: 30,
        business: 10,
        creative: 15,
        entertainment: 25,
        localEvents: 0,
        digitalProducts: 0,
      },
      specificInterests: [],
      languages: ['en'],
      region: undefined,
      countryCode: undefined,
      avgSessionDurationSec: 0,
      contentRetentionRate: 0,
      diversityScore: 50,
      lastUpdated: serverTimestamp() as Timestamp,
      createdAt: serverTimestamp() as Timestamp,
    };
    
    await db.collection('interest_vectors').doc(userId).set(defaultVector);
    
    return defaultVector;
  } catch (error) {
    logger.error('Error getting interest vector:', error);
    throw error;
  }
}

/**
 * Update interest vector based on viewing behavior
 */
export async function updateInterestVector(
  userId: string,
  viewedCategory: DiscoveryCategory,
  sessionDurationSec: number,
  completed: boolean
): Promise<void> {
  try {
    const vectorRef = db.collection('interest_vectors').doc(userId);
    const vectorDoc = await vectorRef.get();
    
    if (!vectorDoc.exists) {
      await getUserInterestVector(userId);
      return;
    }
    
    const vector = vectorDoc.data() as InterestVector;
    
    // Update category weight (increase by 5, cap at 100)
    const categoryKey = viewedCategory.toLowerCase().replace('_', '') as keyof InterestVector['categories'];
    const currentWeight = vector.categories[categoryKey] || 0;
    const newWeight = Math.min(100, currentWeight + 5);
    
    // Update retention rate
    const totalViews = (vector.avgSessionDurationSec > 0 ? 10 : 0); // Estimate
    const completedViews = completed ? 1 : 0;
    const newRetentionRate = totalViews > 0
      ? ((vector.contentRetentionRate * totalViews) + completedViews) / (totalViews + 1)
      : (completed ? 1 : 0);
    
    // Update average session duration
    const newAvgDuration = totalViews > 0
      ? ((vector.avgSessionDurationSec * totalViews) + sessionDurationSec) / (totalViews + 1)
      : sessionDurationSec;
    
    await vectorRef.update({
      [`categories.${categoryKey}`]: newWeight,
      avgSessionDurationSec: newAvgDuration,
      contentRetentionRate: newRetentionRate,
      lastUpdated: serverTimestamp(),
    });
    
    logger.info(`Updated interest vector for user ${userId}: ${categoryKey}=${newWeight}`);
  } catch (error) {
    logger.error('Error updating interest vector:', error);
  }
}

// ============================================================================
// DISCOVERY FEED GENERATION
// ============================================================================

/**
 * Generate personalized discovery feed
 */
export async function getSmartSocialGraphFeed(
  request: SmartSocialGraphRequest
): Promise<SmartSocialGraphResponse> {
  try {
    const { userId, mode, category, language, region, cursor, limit = 20 } = request;
    
    logger.info(
      `Generating feed for user ${userId} in ${mode} mode` +
      (category ? `, category=${category}` : '')
    );
    
    // Get user preferences and interests
    const [preferences, interests] = await Promise.all([
      getUserDiscoveryPreferences(userId),
      getUserInterestVector(userId),
    ]);
    
    // Determine target categories based on mode
    const targetCategories = category 
      ? [category]
      : MODE_CATEGORY_MAP[mode];
    
    // Fetch candidate creators
    const candidates = await fetchCandidateCreators(
      targetCategories,
      language || interests.languages[0],
      region || interests.region,
      cursor,
      limit * 3 // Fetch more to account for filtering
    );
    
    logger.info(`Found ${candidates.length} candidate creators`);
    
    // Score and rank candidates
    const scoredCandidates = await scoreCandidates(userId, candidates);
    
    // Apply diversity rules (shadow density prevention)
    const diversifiedCandidates = await applyDiversityRules(scoredCandidates);
    
    // Apply regional prioritization
    const prioritizedCandidates = prioritizeRegionalCreators(
      diversifiedCandidates.map(c => ({
        ...c,
        region: region || interests.region,
      })),
      region || interests.region || 'GLOBAL'
    );
    
    // Take top N candidates
    const topCandidates = prioritizedCandidates.slice(0, limit);
    
    // Build creator cards
    const items: CreatorCard[] = [];
    for (const candidate of topCandidates) {
      const card = await buildCreatorCard(candidate.creatorId);
      if (card) {
        items.push(card);
        
        // Record impression (for shadow density tracking)
        await recordCreatorImpression(candidate.creatorId, userId, 'FEED');
      }
    }
    
    // Check diversity achievement
    const uniqueCategories = new Set(items.map(i => i.primaryCategory));
    const diversityAchieved = uniqueCategories.size >= 2;
    
    // Generate explanation
    const explanation = generateFeedExplanation(mode, diversityAchieved, items.length);
    
    // Determine pagination
    const hasMore = candidates.length >= limit * 3;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].creatorId
      : undefined;
    
    logger.info(
      `Feed generated: ${items.length} items, ` +
      `${uniqueCategories.size} categories, ` +
      `diversity=${diversityAchieved}`
    );
    
    return {
      items,
      cursor: nextCursor,
      hasMore,
      explanation,
      diversityAchieved,
    };
  } catch (error) {
    logger.error('Error generating discovery feed:', error);
    throw error;
  }
}

/**
 * Fetch candidate creators from database
 */
async function fetchCandidateCreators(
  categories: DiscoveryCategory[],
  language: string,
  region: string | undefined,
  cursor: string | undefined,
  limit: number
): Promise<string[]> {
  try {
    // Query creator relevance scores
    let query = db
      .collection('creator_relevance_scores')
      .where('primaryCategory', 'in', categories)
      .orderBy('contentFreshness', 'desc');
    
    if (cursor) {
      const cursorDoc = await db.collection('creator_relevance_scores').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }
    
    const snapshot = await query.limit(limit).get();
    
    return snapshot.docs.map(doc => doc.id);
  } catch (error) {
    logger.error('Error fetching candidate creators:', error);
    return [];
  }
}

/**
 * Score candidates using relevance algorithm
 */
async function scoreCandidates(
  viewerId: string,
  creatorIds: string[]
): Promise<Array<{ creatorId: string; score: number }>> {
  const scored: Array<{ creatorId: string; score: number }> = [];
  
  for (const creatorId of creatorIds) {
    try {
      // Skip self
      if (creatorId === viewerId) {
        continue;
      }
      
      // Calculate relevance score
      const discoveryScore = await calculateRelevanceScore(viewerId, creatorId);
      
      scored.push({
        creatorId,
        score: discoveryScore.finalScore,
      });
    } catch (error) {
      logger.error(`Error scoring creator ${creatorId}:`, error);
    }
  }
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  return scored;
}

/**
 * Build creator card (NO appearance metrics)
 */
async function buildCreatorCard(creatorId: string): Promise<CreatorCard | null> {
  try {
    const [creatorDoc, relevanceDoc] = await Promise.all([
      db.collection('users').doc(creatorId).get(),
      db.collection('creator_relevance_scores').doc(creatorId).get(),
    ]);
    
    if (!creatorDoc.exists || !relevanceDoc.exists) {
      return null;
    }
    
    const creator = creatorDoc.data();
    const relevance = relevanceDoc.data();
    
    const card: CreatorCard = {
      creatorId,
      displayName: creator?.displayName || 'Anonymous',
      primaryCategory: relevance?.primaryCategory || 'ENTERTAINMENT',
      expertise: creator?.profile?.skills || [],
      contentType: creator?.profile?.contentType || 'mixed',
      recentActivity: relevance?.lastCalculated?.toDate?.()?.toISOString() || new Date().toISOString(),
      contentQuality: relevance?.retentionQuality || 70,
      safetyRating: relevance?.safetyScore || 70,
      thumbnailUrl: creator?.profile?.coverImage,
      bio: creator?.bio,
    };
    
    return card;
  } catch (error) {
    logger.error(`Error building creator card for ${creatorId}:`, error);
    return null;
  }
}

/**
 * Generate human-readable feed explanation
 */
function generateFeedExplanation(
  mode: DiscoveryMode,
  diversityAchieved: boolean,
  itemCount: number
): string {
  const modeDescriptions: Record<DiscoveryMode, string> = {
    PROFESSIONAL: 'professional networking and skills',
    SOCIAL_LIFESTYLE: 'lifestyle and social content',
    ENTERTAINMENT: 'entertainment and creative content',
    LEARNING: 'educational and skill-building content',
    LOCAL_EVENTS: 'local events and community activities',
  };
  
  let explanation = `Showing ${itemCount} creators based on your interest in ${modeDescriptions[mode]}.`;
  
  if (diversityAchieved) {
    explanation += ' We\'ve included creators from multiple categories for variety.';
  }
  
  explanation += ' Rankings are based on content relevance, not appearance or popularity.';
  
  return explanation;
}

// ============================================================================
// TOPIC-BASED RECOMMENDATIONS
// ============================================================================

/**
 * Get recommendations for a specific topic
 */
export async function getTopicRecommendations(
  userId: string,
  topic: string,
  limit: number = 10
): Promise<CreatorCard[]> {
  try {
    logger.info(`Getting recommendations for topic: ${topic}`);
    
    // Search for creators with matching expertise/tags
    const snapshot = await db
      .collection('users')
      .where('profile.skills', 'array-contains', topic)
      .where('roles.creator', '==', true)
      .limit(limit * 2)
      .get();
    
    const creatorIds = snapshot.docs.map(doc => doc.id);
    
    // Score and rank
    const scored = await scoreCandidates(userId, creatorIds);
    const topScored = scored.slice(0, limit);
    
    // Build cards
    const cards: CreatorCard[] = [];
    for (const candidate of topScored) {
      const card = await buildCreatorCard(candidate.creatorId);
      if (card) {
        cards.push(card);
      }
    }
    
    return cards;
  } catch (error) {
    logger.error('Error getting topic recommendations:', error);
    return [];
  }
}

// ============================================================================
// FOLLOW RECOMMENDATIONS
// ============================================================================

/**
 * Get ethical follow recommendations (interest-aligned only)
 */
export async function getFollowRecommendations(
  userId: string,
  limit: number = 10
): Promise<CreatorCard[]> {
  try {
    logger.info(`Getting follow recommendations for user ${userId}`);
    
    // Get user's current interests
    const interests = await getUserInterestVector(userId);
    
    // Find top 2 categories
    const sortedCategories = Object.entries(interests.categories)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([cat]) => cat.toUpperCase().replace('LOCALEVENTS', 'LOCAL_EVENTS').replace('DIGITALPRODUCTS', 'DIGITAL_PRODUCTS'));
    
    // Get candidates from top categories
    const candidates = await fetchCandidateCreators(
      sortedCategories as DiscoveryCategory[],
      interests.languages[0] || 'en',
      interests.region,
      undefined,
      limit * 2
    );
    
    // Score and rank
    const scored = await scoreCandidates(userId, candidates);
    const topScored = scored.slice(0, limit);
    
    // Build cards
    const cards: CreatorCard[] = [];
    for (const candidate of topScored) {
      const card = await buildCreatorCard(candidate.creatorId);
      if (card) {
        cards.push(card);
      }
    }
    
    logger.info(`Generated ${cards.length} follow recommendations`);
    
    return cards;
  } catch (error) {
    logger.error('Error getting follow recommendations:', error);
    return [];
  }
}

logger.info('✅ Discovery Feed Service initialized');