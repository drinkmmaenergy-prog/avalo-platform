/**
 * PACK 134 — Interest Graph Updater
 * 
 * Tracks user interests based on behavioral signals ONLY
 * NO appearance, monetization, or demographic signals
 * 
 * Behavioral signals used:
 * - Content viewed (duration-weighted)
 * - Content liked
 * - Creators followed
 * - Content type preferences
 * - Language preferences
 * 
 * STRICTLY FORBIDDEN:
 * - Token spending/earning
 * - Beauty/attractiveness scores
 * - Demographics (age, gender, race)
 * - Income level
 * - VIP/subscription status
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { db } from './init';
import { logger } from 'firebase-functions/v2';
import {
  InterestCategory,
  UserInterestVector,
  InterestUpdateSignal,
  ContentCategoryProfile,
  FORBIDDEN_SIGNALS,
} from './types/pack134-types';

// ============================================================================
// INTEREST GRAPH CORE
// ============================================================================

/**
 * Update user interest graph based on behavioral signal
 * 
 * @param signal - Behavioral signal (view, like, follow, etc.)
 * @returns Updated interest vector
 */
export async function updateInterestGraph(
  signal: InterestUpdateSignal
): Promise<UserInterestVector> {
  const { userId, category, signalType, weight, timestamp } = signal;
  
  logger.info('[Pack134] Updating interest graph', {
    userId,
    category,
    signalType,
    weight,
  });
  
  // Validate signal is ethical (no forbidden signals)
  validateSignalEthics(signal);
  
  // Get or create user interest vector
  const vectorRef = db.collection('user_interest_vectors').doc(userId);
  const vectorDoc = await vectorRef.get();
  
  let vector: UserInterestVector;
  
  if (!vectorDoc.exists) {
    // Create new interest vector
    vector = {
      userId,
      interests: { [category]: weight },
      updatedAt: timestamp,
      dataPoints: 1,
      confidenceScore: 0.1,
      lastInteractionAt: timestamp,
    };
  } else {
    // Update existing vector
    const existingVector = vectorDoc.data() as UserInterestVector;
    
    // Apply decay to existing interests based on time elapsed
    const decayedInterests = applyInterestDecay(
      existingVector.interests,
      existingVector.lastInteractionAt,
      timestamp
    );
    
    // Update the specific category interest
    const currentScore = decayedInterests[category] || 0;
    const newScore = Math.min(1.0, currentScore + weight * 0.1); // Incremental update
    
    vector = {
      userId,
      interests: {
        ...decayedInterests,
        [category]: newScore,
      },
      updatedAt: timestamp,
      dataPoints: existingVector.dataPoints + 1,
      confidenceScore: calculateConfidenceScore(existingVector.dataPoints + 1),
      lastInteractionAt: timestamp,
    };
    
    // Limit to top 10 interests
    vector.interests = keepTopInterests(vector.interests, 10);
  }
  
  // Save updated vector
  await vectorRef.set(vector);
  
  logger.info('[Pack134] Interest graph updated', {
    userId,
    topInterests: Object.entries(vector.interests)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([cat, score]) => ({ category: cat, score })),
  });
  
  return vector;
}

/**
 * Apply time-based decay to interest scores
 * Interests decay 5% per day without interaction
 */
function applyInterestDecay(
  interests: Partial<Record<InterestCategory, number>>,
  lastUpdate: Timestamp,
  currentTime: Timestamp
): Partial<Record<InterestCategory, number>> {
  const daysSinceUpdate = (currentTime.toMillis() - lastUpdate.toMillis()) / (1000 * 60 * 60 * 24);
  const decayFactor = Math.pow(0.95, daysSinceUpdate); // 5% decay per day
  
  const decayedInterests: Partial<Record<InterestCategory, number>> = {};
  
  for (const [category, score] of Object.entries(interests)) {
    const decayedScore = score * decayFactor;
    if (decayedScore > 0.05) { // Keep only meaningful interests
      decayedInterests[category as InterestCategory] = decayedScore;
    }
  }
  
  return decayedInterests;
}

/**
 * Calculate confidence score based on number of data points
 */
function calculateConfidenceScore(dataPoints: number): number {
  if (dataPoints < 5) return 0.2;
  if (dataPoints < 10) return 0.4;
  if (dataPoints < 20) return 0.6;
  if (dataPoints < 50) return 0.8;
  return 1.0;
}

/**
 * Keep only top N interests by score
 */
function keepTopInterests(
  interests: Partial<Record<InterestCategory, number>>,
  topN: number
): Partial<Record<InterestCategory, number>> {
  const sorted = Object.entries(interests)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN);
  
  return Object.fromEntries(sorted) as Partial<Record<InterestCategory, number>>;
}

/**
 * Validate that signal doesn't use forbidden attributes
 */
function validateSignalEthics(signal: InterestUpdateSignal): void {
  const signalData = JSON.stringify(signal);
  
  for (const forbidden of FORBIDDEN_SIGNALS) {
    if (signalData.toLowerCase().includes(forbidden.toLowerCase())) {
      throw new Error(`[Pack134] ETHICS VIOLATION: Signal contains forbidden attribute: ${forbidden}`);
    }
  }
}

// ============================================================================
// GET USER INTERESTS
// ============================================================================

/**
 * Get user's current interest vector
 * 
 * @param userId - User ID
 * @returns Interest vector or null if not exists
 */
export async function getUserInterests(userId: string): Promise<UserInterestVector | null> {
  const vectorDoc = await db.collection('user_interest_vectors').doc(userId).get();
  
  if (!vectorDoc.exists) {
    return null;
  }
  
  const vector = vectorDoc.data() as UserInterestVector;
  
  // Apply decay before returning
  vector.interests = applyInterestDecay(
    vector.interests,
    vector.lastInteractionAt,
    Timestamp.now()
  );
  
  return vector;
}

/**
 * Get top N interests for a user
 * 
 * @param userId - User ID
 * @param topN - Number of top interests to return
 * @returns Array of [category, score] pairs
 */
export async function getTopUserInterests(
  userId: string,
  topN: number = 5
): Promise<Array<{ category: InterestCategory; score: number }>> {
  const vector = await getUserInterests(userId);
  
  if (!vector) {
    return [];
  }
  
  return Object.entries(vector.interests)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([category, score]) => ({
      category: category as InterestCategory,
      score,
    }));
}

// ============================================================================
// CONTENT CATEGORIZATION
// ============================================================================

/**
 * Assign categories to content based on analysis
 * Uses tags, description, and existing category assignments
 * NO appearance or user demographics used
 * 
 * @param targetId - Content or creator ID
 * @param targetType - Type of target
 * @param analysisData - Content analysis data (tags, description, etc.)
 * @returns Category profile
 */
export async function assignContentCategories(
  targetId: string,
  targetType: 'CREATOR' | 'POST' | 'STORY' | 'REEL',
  analysisData: {
    tags?: string[];
    description?: string;
    existingCategories?: InterestCategory[];
    language?: string;
  }
): Promise<ContentCategoryProfile> {
  logger.info('[Pack134] Assigning content categories', {
    targetId,
    targetType,
  });
  
  // Extract categories from tags and description
  const detectedCategories = detectCategoriesFromContent(analysisData);
  
  // Determine primary and secondary categories
  const primaryCategory = detectedCategories[0] || 'lifestyle';
  const secondaryCategories = detectedCategories.slice(1, 4);
  
  const profile: ContentCategoryProfile = {
    targetId,
    targetType,
    primaryCategory,
    secondaryCategories,
    confidence: calculateCategoryConfidence(analysisData),
    assignedAt: Timestamp.now(),
    basedOnSignals: ['tags', 'description', 'language'].filter(
      (signal) => analysisData[signal as keyof typeof analysisData]
    ),
  };
  
  // Save category profile
  await db.collection('content_category_profiles').doc(targetId).set(profile);
  
  return profile;
}

/**
 * Detect categories from content analysis data
 */
function detectCategoriesFromContent(analysisData: {
  tags?: string[];
  description?: string;
  existingCategories?: InterestCategory[];
}): InterestCategory[] {
  const categories: Map<InterestCategory, number> = new Map();
  
  // Use existing categories if available
  if (analysisData.existingCategories) {
    for (const cat of analysisData.existingCategories) {
      categories.set(cat, (categories.get(cat) || 0) + 1);
    }
  }
  
  // Analyze tags
  if (analysisData.tags) {
    for (const tag of analysisData.tags) {
      const matchedCategories = matchTagToCategory(tag.toLowerCase());
      for (const cat of matchedCategories) {
        categories.set(cat, (categories.get(cat) || 0) + 0.5);
      }
    }
  }
  
  // Analyze description
  if (analysisData.description) {
    const desc = analysisData.description.toLowerCase();
    const matchedCategories = matchDescriptionToCategories(desc);
    for (const cat of matchedCategories) {
      categories.set(cat, (categories.get(cat) || 0) + 0.3);
    }
  }
  
  // Sort by score and return
  return Array.from(categories.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([cat]) => cat);
}

/**
 * Match tag to interest categories
 */
function matchTagToCategory(tag: string): InterestCategory[] {
  const categoryMap: Record<string, InterestCategory[]> = {
    // Fitness
    'fitness': ['fitness'],
    'gym': ['fitness'],
    'workout': ['fitness'],
    'health': ['health_wellness', 'fitness'],
    'yoga': ['fitness', 'health_wellness'],
    
    // Travel
    'travel': ['travel'],
    'adventure': ['travel', 'nature_outdoors'],
    'tourism': ['travel'],
    'vacation': ['travel'],
    
    // Self-improvement
    'motivation': ['self_improvement'],
    'productivity': ['self_improvement'],
    'mindset': ['self_improvement'],
    'growth': ['self_improvement'],
    
    // Entertainment
    'entertainment': ['entertainment'],
    'fun': ['entertainment'],
    'comedy': ['entertainment'],
    
    // Photography
    'photography': ['photography'],
    'photos': ['photography'],
    'camera': ['photography'],
    
    // Gaming
    'gaming': ['gaming'],
    'games': ['gaming'],
    'esports': ['gaming'],
    
    // Art & Creative
    'art': ['art_creative'],
    'creative': ['art_creative'],
    'painting': ['art_creative'],
    'design': ['art_creative'],
    
    // Music
    'music': ['music'],
    'musician': ['music'],
    'singer': ['music'],
    
    // Food & Cooking
    'food': ['food_cooking'],
    'cooking': ['food_cooking'],
    'recipe': ['food_cooking'],
    'chef': ['food_cooking'],
    
    // Fashion & Style
    'fashion': ['fashion_style'],
    'style': ['fashion_style'],
    'outfit': ['fashion_style'],
    
    // Technology
    'tech': ['technology'],
    'technology': ['technology'],
    'coding': ['technology'],
    'programming': ['technology'],
    
    // Education
    'education': ['education'],
    'learning': ['education'],
    'teaching': ['education'],
    
    // Business
    'business': ['business'],
    'entrepreneur': ['business'],
    'startup': ['business'],
    
    // Lifestyle
    'lifestyle': ['lifestyle'],
    'life': ['lifestyle'],
    
    // Sports
    'sports': ['sports'],
    'athlete': ['sports'],
    'training': ['fitness', 'sports'],
    
    // Books & Reading
    'books': ['books_reading'],
    'reading': ['books_reading'],
    'literature': ['books_reading'],
    
    // Movies & TV
    'movies': ['movies_tv'],
    'film': ['movies_tv'],
    'cinema': ['movies_tv'],
    'tv': ['movies_tv'],
    
    // Nature & Outdoors
    'nature': ['nature_outdoors'],
    'outdoor': ['nature_outdoors'],
    'hiking': ['nature_outdoors', 'fitness'],
    
    // Pets & Animals
    'pets': ['pets_animals'],
    'animals': ['pets_animals'],
    'dogs': ['pets_animals'],
    'cats': ['pets_animals'],
  };
  
  const matches: InterestCategory[] = [];
  
  for (const [keyword, categories] of Object.entries(categoryMap)) {
    if (tag.includes(keyword)) {
      matches.push(...categories);
    }
  }
  
  return Array.from(new Set(matches)); // Remove duplicates
}

/**
 * Match description to categories (simplified)
 */
function matchDescriptionToCategories(description: string): InterestCategory[] {
  const categories: InterestCategory[] = [];
  
  // Simple keyword matching (can be enhanced with NLP)
  const keywords = description.split(/\s+/);
  
  for (const keyword of keywords) {
    const matched = matchTagToCategory(keyword);
    categories.push(...matched);
  }
  
  return Array.from(new Set(categories)); // Remove duplicates
}

/**
 * Calculate confidence of category assignment
 */
function calculateCategoryConfidence(analysisData: {
  tags?: string[];
  description?: string;
  existingCategories?: InterestCategory[];
}): number {
  let confidence = 0;
  
  if (analysisData.existingCategories && analysisData.existingCategories.length > 0) {
    confidence += 0.4;
  }
  
  if (analysisData.tags && analysisData.tags.length > 0) {
    confidence += Math.min(0.4, analysisData.tags.length * 0.1);
  }
  
  if (analysisData.description && analysisData.description.length > 50) {
    confidence += 0.2;
  }
  
  return Math.min(1.0, confidence);
}

/**
 * Get content categories for a target
 * 
 * @param targetId - Content or creator ID
 * @returns Category profile or null
 */
export async function getContentCategories(
  targetId: string
): Promise<ContentCategoryProfile | null> {
  const profileDoc = await db.collection('content_category_profiles').doc(targetId).get();
  
  if (!profileDoc.exists) {
    return null;
  }
  
  return profileDoc.data() as ContentCategoryProfile;
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Process multiple interest update signals in batch
 * 
 * @param signals - Array of signals to process
 */
export async function batchUpdateInterests(signals: InterestUpdateSignal[]): Promise<void> {
  logger.info('[Pack134] Batch updating interests', { count: signals.length });
  
  const batch = db.batch();
  const userVectors: Map<string, UserInterestVector> = new Map();
  
  // Group signals by user
  const signalsByUser: Map<string, InterestUpdateSignal[]> = new Map();
  for (const signal of signals) {
    if (!signalsByUser.has(signal.userId)) {
      signalsByUser.set(signal.userId, []);
    }
    signalsByUser.get(signal.userId)!.push(signal);
  }
  
  // Process each user's signals
  for (const [userId, userSignals] of Array.from(signalsByUser.entries())) {
    const vectorRef = db.collection('user_interest_vectors').doc(userId);
    const vectorDoc = await vectorRef.get();
    
    let vector: UserInterestVector;
    
    if (!vectorDoc.exists) {
      vector = {
        userId,
        interests: {},
        updatedAt: Timestamp.now(),
        dataPoints: 0,
        confidenceScore: 0,
        lastInteractionAt: Timestamp.now(),
      };
    } else {
      vector = vectorDoc.data() as UserInterestVector;
      vector.interests = applyInterestDecay(
        vector.interests,
        vector.lastInteractionAt,
        Timestamp.now()
      );
    }
    
    // Apply all signals for this user
    for (const signal of userSignals) {
      const currentScore = vector.interests[signal.category] || 0;
      const newScore = Math.min(1.0, currentScore + signal.weight * 0.1);
      vector.interests[signal.category] = newScore;
      vector.dataPoints++;
    }
    
    vector.updatedAt = Timestamp.now();
    vector.lastInteractionAt = Timestamp.now();
    vector.confidenceScore = calculateConfidenceScore(vector.dataPoints);
    vector.interests = keepTopInterests(vector.interests, 10);
    
    batch.set(vectorRef, vector);
  }
  
  await batch.commit();
  
  logger.info('[Pack134] Batch interest update complete', {
    usersUpdated: signalsByUser.size,
  });
}

/**
 * Recalculate all interest vectors (maintenance operation)
 * Used for periodic recalculation or after algorithm changes
 * 
 * @param batchSize - Number of users to process per batch
 */
export async function recalculateAllInterestVectors(batchSize: number = 100): Promise<void> {
  logger.info('[Pack134] Starting interest vector recalculation');
  
  let processed = 0;
  let lastUserId: string | undefined;
  
  while (true) {
    let query = db.collection('user_interest_vectors')
      .orderBy('userId')
      .limit(batchSize);
    
    if (lastUserId) {
      query = query.startAfter(lastUserId);
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      break;
    }
    
    const batch = db.batch();
    
    for (const doc of snapshot.docs) {
      const vector = doc.data() as UserInterestVector;
      
      // Apply decay
      vector.interests = applyInterestDecay(
        vector.interests,
        vector.lastInteractionAt,
        Timestamp.now()
      );
      
      // Keep top interests
      vector.interests = keepTopInterests(vector.interests, 10);
      
      // Update confidence
      vector.confidenceScore = calculateConfidenceScore(vector.dataPoints);
      vector.updatedAt = Timestamp.now();
      
      batch.update(doc.ref, vector as any);
      lastUserId = vector.userId;
    }
    
    await batch.commit();
    processed += snapshot.size;
    
    logger.info('[Pack134] Recalculated batch', {
      processed,
      lastUserId,
    });
  }
  
  logger.info('[Pack134] Interest vector recalculation complete', {
    totalProcessed: processed,
  });
}