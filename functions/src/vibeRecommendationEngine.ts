/**
 * PACK 197 — AI Recommendation Engine — Match by Vibe, Not by Demographics
 * REVISED v2 — Overwrite of friendship-only bias
 * 
 * This engine matches users based on CHEMISTRY and VIBE:
 * - Photo energy analysis (smile, nightlife, glamour, serious)
 * - Interest compatibility
 * - Chat tone similarity
 * - Attraction preferences (NO SHAMING - all preferences allowed)
 * - Location & travel plans
 * - Past successful match patterns
 * 
 * Output: Pairs users based on what creates chemistry, not demographics
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { logger } from 'firebase-functions/v2';

const db = getFirestore();

// ============================================================================
// TYPES
// ============================================================================

interface PhotoEnergy {
  smile: number;        // 0-100
  nightlife: number;    // 0-100
  glamour: number;      // 0-100
  serious: number;      // 0-100
}

interface VibeProfile {
  userId: string;
  photoEnergy: PhotoEnergy;
  interests: string[];
  personalityLabels: string[];
  chatTone: 'playful' | 'serious' | 'emotional' | 'mixed';
  location?: {
    country: string;
    city?: string;
    coordinates?: { lat: number; lng: number };
  };
  travelPlans?: string[];
  age: number;
  gender: string;
  lastActiveAt: Timestamp;
  updatedAt: Timestamp;
}

interface AttractionPreferences {
  userId: string;
  physical?: {
    height?: 'any' | 'short' | 'average' | 'tall' | 'very_tall';
    build?: string[];  // ['slim', 'athletic', 'curvy', 'muscular', 'average']
    beard?: 'any' | 'yes' | 'no' | 'prefer';
    tattoos?: 'any' | 'yes' | 'no' | 'prefer';
    hairLength?: string[];
    gymFrequency?: 'any' | 'never' | 'sometimes' | 'regularly' | 'daily';
  };
  style?: string[]; // ['casual', 'sporty', 'elegant', 'alternative', 'glamorous']
  lifestyle?: {
    nightlife?: 'any' | 'love_it' | 'sometimes' | 'rarely';
    travel?: 'any' | 'frequent' | 'occasional' | 'rare';
    music?: string[];
  };
  updatedAt: Timestamp;
}

interface VibeMatch {
  userId: string;
  targetUserId: string;
  vibeScore: number;           // 0-100 overall chemistry score
  chemistryScore: number;       // 0-100 raw chemistry before preferences
  compatibilityBreakdown: {
    photoEnergyMatch: number;   // 0-100
    interestMatch: number;      // 0-100
    chatToneMatch: number;      // 0-100
    attractionMatch: number;    // 0-100
    locationBonus: number;      // 0-100
    successPatternBonus: number; // 0-100
  };
  reasons: string[];
  shownToUser: boolean;
  calculatedAt: Timestamp;
}

interface SuccessfulMatchPattern {
  userId: string;
  preferredPhotoEnergy: PhotoEnergy;
  preferredInterests: string[];
  preferredChatTone: string[];
  preferredPhysicalTraits: Record<string, any>;
  patternConfidence: number; // 0-100, based on sample size
  lastMatchAt: Timestamp;
  totalMatches: number;
  totalResponses: number;
  updatedAt: Timestamp;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const UpdateVibeProfileSchema = z.object({
  photoEnergy: z.object({
    smile: z.number().min(0).max(100),
    nightlife: z.number().min(0).max(100),
    glamour: z.number().min(0).max(100),
    serious: z.number().min(0).max(100),
  }).optional(),
  interests: z.array(z.string()).max(20).optional(),
  personalityLabels: z.array(z.string()).max(10).optional(),
  chatTone: z.enum(['playful', 'serious', 'emotional', 'mixed']).optional(),
  travelPlans: z.array(z.string()).max(10).optional(),
});

const UpdateAttractionPreferencesSchema = z.object({
  physical: z.object({
    height: z.enum(['any', 'short', 'average', 'tall', 'very_tall']).optional(),
    build: z.array(z.string()).optional(),
    beard: z.enum(['any', 'yes', 'no', 'prefer']).optional(),
    tattoos: z.enum(['any', 'yes', 'no', 'prefer']).optional(),
    hairLength: z.array(z.string()).optional(),
    gymFrequency: z.enum(['any', 'never', 'sometimes', 'regularly', 'daily']).optional(),
  }).optional(),
  style: z.array(z.string()).optional(),
  lifestyle: z.object({
    nightlife: z.enum(['any', 'love_it', 'sometimes', 'rarely']).optional(),
    travel: z.enum(['any', 'frequent', 'occasional', 'rare']).optional(),
    music: z.array(z.string()).optional(),
  }).optional(),
});

// ============================================================================
// VIBE MATCHING ALGORITHM
// ============================================================================

/**
 * Calculate photo energy similarity (0-100)
 * Higher score = more similar energy vibe
 */
function calculatePhotoEnergyMatch(energy1: PhotoEnergy, energy2: PhotoEnergy): number {
  const smileDiff = Math.abs(energy1.smile - energy2.smile);
  const nightlifeDiff = Math.abs(energy1.nightlife - energy2.nightlife);
  const glamourDiff = Math.abs(energy1.glamour - energy2.glamour);
  const seriousDiff = Math.abs(energy1.serious - energy2.serious);
  
  // Average difference, then invert to similarity score
  const avgDiff = (smileDiff + nightlifeDiff + glamourDiff + seriousDiff) / 4;
  return Math.max(0, 100 - avgDiff);
}

/**
 * Calculate interest overlap score (0-100)
 */
function calculateInterestMatch(interests1: string[], interests2: string[]): number {
  if (interests1.length === 0 || interests2.length === 0) {
    return 50; // Neutral if no interests
  }
  
  const commonInterests = interests1.filter(i => interests2.includes(i));
  const totalUniqueInterests = new Set([...interests1, ...interests2]).size;
  
  // Jaccard similarity * 100
  return (commonInterests.length / totalUniqueInterests) * 100;
}

/**
 * Calculate chat tone compatibility (0-100)
 */
function calculateChatToneMatch(tone1: string, tone2: string): number {
  if (tone1 === tone2) {
    return 100; // Perfect match
  }
  
  if (tone1 === 'mixed' || tone2 === 'mixed') {
    return 80; // Mixed matches well with everything
  }
  
  // Playful and emotional have some overlap
  if ((tone1 === 'playful' && tone2 === 'emotional') || 
      (tone1 === 'emotional' && tone2 === 'playful')) {
    return 60;
  }
  
  // Serious clashes more with playful/emotional
  return 40;
}

/**
 * Calculate attraction preference match (0-100)
 * NO SHAMING - all preferences are valid and honored
 */
function calculateAttractionMatch(
  preferences: AttractionPreferences | null,
  targetProfile: VibeProfile,
  targetUserData: any
): number {
  if (!preferences || !preferences.physical) {
    return 75; // Neutral score if no preferences set
  }
  
  let score = 100;
  let checksPerformed = 0;
  
  // Height preference
  if (preferences.physical.height && preferences.physical.height !== 'any') {
    checksPerformed++;
    const targetHeight = targetUserData?.physical?.height;
    if (targetHeight && targetHeight !== preferences.physical.height) {
      score -= 20;
    }
  }
  
  // Build preference
  if (preferences.physical.build && preferences.physical.build.length > 0) {
    checksPerformed++;
    const targetBuild = targetUserData?.physical?.build;
    if (targetBuild && !preferences.physical.build.includes(targetBuild)) {
      score -= 20;
    }
  }
  
  // Beard preference
  if (preferences.physical.beard && preferences.physical.beard !== 'any') {
    checksPerformed++;
    const hasBeard = targetUserData?.physical?.beard === true;
    if (preferences.physical.beard === 'yes' && !hasBeard) {
      score -= 15;
    } else if (preferences.physical.beard === 'no' && hasBeard) {
      score -= 15;
    }
  }
  
  // Tattoos preference
  if (preferences.physical.tattoos && preferences.physical.tattoos !== 'any') {
    checksPerformed++;
    const hasTattoos = targetUserData?.physical?.tattoos === true;
    if (preferences.physical.tattoos === 'yes' && !hasTattoos) {
      score -= 15;
    } else if (preferences.physical.tattoos === 'no' && hasTattoos) {
      score -= 15;
    }
  }
  
  // Gym frequency preference
  if (preferences.physical.gymFrequency && preferences.physical.gymFrequency !== 'any') {
    checksPerformed++;
    const targetGymFreq = targetUserData?.physical?.gymFrequency;
    if (targetGymFreq && targetGymFreq !== preferences.physical.gymFrequency) {
      score -= 10;
    }
  }
  
  // Style preference
  if (preferences.style && preferences.style.length > 0) {
    checksPerformed++;
    const targetStyle = targetUserData?.style;
    if (targetStyle && !preferences.style.includes(targetStyle)) {
      score -= 15;
    }
  }
  
  // Lifestyle - nightlife
  if (preferences.lifestyle?.nightlife && preferences.lifestyle.nightlife !== 'any') {
    checksPerformed++;
    const targetNightlife = targetUserData?.lifestyle?.nightlife;
    if (targetNightlife && targetNightlife !== preferences.lifestyle.nightlife) {
      score -= 10;
    }
  }
  
  return Math.max(0, score);
}

/**
 * Calculate location bonus (0-100)
 */
function calculateLocationBonus(
  location1: VibeProfile['location'],
  location2: VibeProfile['location']
): number {
  if (!location1 || !location2) {
    return 50; // Neutral
  }
  
  if (location1.country !== location2.country) {
    return 20; // Different countries
  }
  
  if (location1.city && location2.city && location1.city === location2.city) {
    return 100; // Same city - perfect
  }
  
  // Same country, different or unknown city
  return 70;
}

/**
 * Apply successful match pattern bonus
 */
async function calculateSuccessPatternBonus(
  userId: string,
  targetProfile: VibeProfile
): Promise<number> {
  try {
    const patternDoc = await db.collection('successful_match_patterns').doc(userId).get();
    
    if (!patternDoc.exists) {
      return 50; // Neutral - no pattern data yet
    }
    
    const pattern = patternDoc.data() as SuccessfulMatchPattern;
    
    if (pattern.patternConfidence < 30 || pattern.totalMatches < 3) {
      return 50; // Not enough data
    }
    
    let bonus = 0;
    
    // Check photo energy match with successful pattern
    const energyMatch = calculatePhotoEnergyMatch(
      pattern.preferredPhotoEnergy,
      targetProfile.photoEnergy
    );
    bonus += (energyMatch / 100) * 30;
    
    // Check interest match with successful pattern
    const interestMatch = calculateInterestMatch(
      pattern.preferredInterests,
      targetProfile.interests
    );
    bonus += (interestMatch / 100) * 20;
    
    // Apply confidence weight
    return bonus * (pattern.patternConfidence / 100);
  } catch (error) {
    logger.error('Error calculating success pattern bonus:', error);
    return 50;
  }
}

/**
 * Calculate overall vibe match score
 */
async function calculateVibeMatch(
  userId: string,
  userProfile: VibeProfile,
  userPreferences: AttractionPreferences | null,
  targetUserId: string,
  targetProfile: VibeProfile,
  targetUserData: any
): Promise<VibeMatch> {
  // Calculate component scores
  const photoEnergyMatch = calculatePhotoEnergyMatch(
    userProfile.photoEnergy,
    targetProfile.photoEnergy
  );
  
  const interestMatch = calculateInterestMatch(
    userProfile.interests,
    targetProfile.interests
  );
  
  const chatToneMatch = calculateChatToneMatch(
    userProfile.chatTone,
    targetProfile.chatTone
  );
  
  const attractionMatch = calculateAttractionMatch(
    userPreferences,
    targetProfile,
    targetUserData
  );
  
  const locationBonus = calculateLocationBonus(
    userProfile.location,
    targetProfile.location
  );
  
  const successPatternBonus = await calculateSuccessPatternBonus(
    userId,
    targetProfile
  );
  
  // Calculate chemistry score (before preferences)
  const chemistryScore = Math.round(
    (photoEnergyMatch * 0.30) +
    (interestMatch * 0.25) +
    (chatToneMatch * 0.20) +
    (locationBonus * 0.15) +
    (successPatternBonus * 0.10)
  );
  
  // Calculate final vibe score (with preferences)
  const vibeScore = Math.round(
    (chemistryScore * 0.70) +
    (attractionMatch * 0.30)
  );
  
  // Generate reasons
  const reasons: string[] = [];
  
  if (photoEnergyMatch > 75) {
    reasons.push('Similar photo energy and vibe');
  }
  if (interestMatch > 60) {
    reasons.push('Shared interests and passions');
  }
  if (chatToneMatch > 70) {
    reasons.push('Compatible communication style');
  }
  if (locationBonus > 80) {
    reasons.push('Close proximity');
  }
  if (attractionMatch > 80) {
    reasons.push('Strong physical attraction match');
  }
  if (successPatternBonus > 60) {
    reasons.push('Matches your successful dating pattern');
  }
  
  if (reasons.length === 0) {
    reasons.push('Potential chemistry worth exploring');
  }
  
  return {
    userId,
    targetUserId,
    vibeScore,
    chemistryScore,
    compatibilityBreakdown: {
      photoEnergyMatch: Math.round(photoEnergyMatch),
      interestMatch: Math.round(interestMatch),
      chatToneMatch: Math.round(chatToneMatch),
      attractionMatch: Math.round(attractionMatch),
      locationBonus: Math.round(locationBonus),
      successPatternBonus: Math.round(successPatternBonus),
    },
    reasons,
    shownToUser: false,
    calculatedAt: Timestamp.now(),
  };
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Update user's vibe profile
 */
export const updateVibeProfile = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const validationResult = UpdateVibeProfileSchema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError('invalid-argument', validationResult.error.message);
    }
    
    const updates = validationResult.data;
    
    try {
      const vibeRef = db.collection('vibe_profiles').doc(uid);
      
      await vibeRef.set({
        userId: uid,
        ...updates,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      
      logger.info(`Vibe profile updated for user ${uid}`);
      
      // Trigger recalculation of matches
      await triggerMatchRecalculation(uid);
      
      return { success: true };
    } catch (error: any) {
      logger.error('Error updating vibe profile:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Update user's attraction preferences (NO SHAMING)
 */
export const updateAttractionPreferences = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const validationResult = UpdateAttractionPreferencesSchema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError('invalid-argument', validationResult.error.message);
    }
    
    const preferences = validationResult.data;
    
    try {
      const prefRef = db.collection('attraction_preferences').doc(uid);
      
      await prefRef.set({
        userId: uid,
        ...preferences,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      
      logger.info(`Attraction preferences updated for user ${uid}`);
      
      // Trigger recalculation of matches
      await triggerMatchRecalculation(uid);
      
      return { success: true };
    } catch (error: any) {
      logger.error('Error updating attraction preferences:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Get vibe-based recommendations for user
 */
export const getVibeRecommendations = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { limit = 20, minScore = 60 } = request.data;
    
    try {
      // Get user's recommendation queue
      const queueSnapshot = await db
        .collection('recommendation_queues')
        .doc(uid)
        .collection('queue')
        .where('score', '>=', minScore)
        .orderBy('score', 'desc')
        .limit(limit)
        .get();
      
      if (queueSnapshot.empty) {
        // Generate new recommendations
        await generateVibeRecommendations(uid);
        
        // Retry fetch
        const retrySnapshot = await db
          .collection('recommendation_queues')
          .doc(uid)
          .collection('queue')
          .where('score', '>=', minScore)
          .orderBy('score', 'desc')
          .limit(limit)
          .get();
        
        const recommendations = retrySnapshot.docs.map(doc => doc.data());
        
        return {
          success: true,
          recommendations,
          total: recommendations.length,
        };
      }
      
      const recommendations = queueSnapshot.docs.map(doc => doc.data());
      
      return {
        success: true,
        recommendations,
        total: recommendations.length,
      };
    } catch (error: any) {
      logger.error('Error getting vibe recommendations:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Record match feedback (for ML training)
 */
export const recordMatchFeedback = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { targetUserId, action, rating, notes } = request.data;
    
    if (!targetUserId || !action) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    try {
      const feedbackRef = db.collection('match_feedback').doc();
      
      await feedbackRef.set({
        userId: uid,
        targetUserId,
        action,
        rating: rating || null,
        notes: notes || null,
        timestamp: FieldValue.serverTimestamp(),
      });
      
      // If matched or responded, update success patterns
      if (action === 'matched' || action === 'responded') {
        await updateSuccessPatterns(uid, targetUserId);
      }
      
      logger.info(`Match feedback recorded: ${uid} -> ${targetUserId} (${action})`);
      
      return { success: true };
    } catch (error: any) {
      logger.error('Error recording match feedback:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate vibe-based recommendations for a user
 */
async function generateVibeRecommendations(userId: string): Promise<void> {
  try {
    // Get user's vibe profile
    const userVibeDoc = await db.collection('vibe_profiles').doc(userId).get();
    if (!userVibeDoc.exists) {
      logger.warn(`No vibe profile found for user ${userId}`);
      return;
    }
    
    const userProfile = userVibeDoc.data() as VibeProfile;
    
    // Get user's attraction preferences
    const userPrefDoc = await db.collection('attraction_preferences').doc(userId).get();
    const userPreferences = userPrefDoc.exists ? userPrefDoc.data() as AttractionPreferences : null;
    
    // Get user's main profile data
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    // Query potential matches
    const candidatesSnapshot = await db
      .collection('vibe_profiles')
      .where('lastActiveAt', '>', Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))) // Active in last 30 days
      .limit(100)
      .get();
    
    const matches: VibeMatch[] = [];
    
    for (const candidateDoc of candidatesSnapshot.docs) {
      if (candidateDoc.id === userId) continue;
      
      const targetProfile = candidateDoc.data() as VibeProfile;
      
      // Get target user's full data
      const targetUserDoc = await db.collection('users').doc(candidateDoc.id).get();
      const targetUserData = targetUserDoc.data();
      
      // Calculate vibe match
      const match = await calculateVibeMatch(
        userId,
        userProfile,
        userPreferences,
        candidateDoc.id,
        targetProfile,
        targetUserData
      );
      
      if (match.vibeScore >= 50) {
        matches.push(match);
      }
    }
    
    // Sort by vibe score
    matches.sort((a, b) => b.vibeScore - a.vibeScore);
    
    // Store top matches in recommendation queue
    const batch = db.batch();
    const queueRef = db.collection('recommendation_queues').doc(userId).collection('queue');
    
    // Clear old queue
    const oldQueueSnapshot = await queueRef.get();
    oldQueueSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Add new recommendations
    matches.slice(0, 50).forEach(match => {
      const docRef = queueRef.doc(match.targetUserId);
      batch.set(docRef, {
        ...match,
        addedAt: FieldValue.serverTimestamp(),
      });
    });
    
    await batch.commit();
    
    logger.info(`Generated ${matches.length} vibe recommendations for user ${userId}`);
  } catch (error) {
    logger.error('Error generating vibe recommendations:', error);
    throw error;
  }
}

/**
 * Trigger match recalculation when profile updated
 */
async function triggerMatchRecalculation(userId: string): Promise<void> {
  // Queue for background recalculation
  await db.collection('recalculation_queue').add({
    userId,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Update successful match patterns based on feedback
 */
async function updateSuccessPatterns(userId: string, targetUserId: string): Promise<void> {
  try {
    const targetVibeDoc = await db.collection('vibe_profiles').doc(targetUserId).get();
    if (!targetVibeDoc.exists) return;
    
    const targetProfile = targetVibeDoc.data() as VibeProfile;
    
    const patternRef = db.collection('successful_match_patterns').doc(userId);
    const patternDoc = await patternRef.get();
    
    if (!patternDoc.exists) {
      // Create new pattern
      await patternRef.set({
        userId,
        preferredPhotoEnergy: targetProfile.photoEnergy,
        preferredInterests: targetProfile.interests,
        preferredChatTone: [targetProfile.chatTone],
        preferredPhysicalTraits: {},
        patternConfidence: 10,
        lastMatchAt: FieldValue.serverTimestamp(),
        totalMatches: 1,
        totalResponses: 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      // Update existing pattern with weighted average
      const pattern = patternDoc.data() as SuccessfulMatchPattern;
      const weight = 0.2; // New match has 20% weight
      
      const updatedPhotoEnergy: PhotoEnergy = {
        smile: Math.round(pattern.preferredPhotoEnergy.smile * (1 - weight) + targetProfile.photoEnergy.smile * weight),
        nightlife: Math.round(pattern.preferredPhotoEnergy.nightlife * (1 - weight) + targetProfile.photoEnergy.nightlife * weight),
        glamour: Math.round(pattern.preferredPhotoEnergy.glamour * (1 - weight) + targetProfile.photoEnergy.glamour * weight),
        serious: Math.round(pattern.preferredPhotoEnergy.serious * (1 - weight) + targetProfile.photoEnergy.serious * weight),
      };
      
      await patternRef.update({
        preferredPhotoEnergy: updatedPhotoEnergy,
        preferredInterests: Array.from(new Set([...pattern.preferredInterests, ...targetProfile.interests])),
        preferredChatTone: Array.from(new Set([...pattern.preferredChatTone, targetProfile.chatTone])),
        patternConfidence: Math.min(100, pattern.patternConfidence + 5),
        lastMatchAt: FieldValue.serverTimestamp(),
        totalMatches: FieldValue.increment(1),
        totalResponses: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    
    logger.info(`Updated success patterns for user ${userId}`);
  } catch (error) {
    logger.error('Error updating success patterns:', error);
  }
}

/**
 * Auto-trigger recommendation generation when profile created/updated
 */
export const onVibeProfileUpdated = onDocumentCreated(
  {
    document: 'vibe_profiles/{userId}',
    region: 'europe-west3',
  },
  async (event) => {
    const userId = event.params.userId;
    
    try {
      await generateVibeRecommendations(userId);
      logger.info(`Auto-generated recommendations for new profile: ${userId}`);
    } catch (error) {
      logger.error('Error auto-generating recommendations:', error);
    }
  }
);

logger.info('✅ Vibe Recommendation Engine (PACK 197 v2) loaded successfully');