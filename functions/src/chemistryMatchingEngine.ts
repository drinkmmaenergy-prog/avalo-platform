/**
 * PACK 195 — REVISED v2
 * Chemistry-Based Discovery Matching Algorithm
 * 
 * Replaces old version that restricted dating/romantic pairing.
 * Uses behavior-based chemistry signals to optimize matches.
 */

import { db, serverTimestamp, increment, arrayUnion } from './init';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

interface ChemistryWeights {
  mutualSwipes: number;
  profileViewTime: number;
  photoAttractiveness: number;
  conversationIntensity: number;
  sharedVibeTags: number;
  passportInterestSimilarity: number;
}

interface ChemistryScore {
  userId: string;
  targetUserId: string;
  totalScore: number;
  components: {
    mutualSwipes: number;
    profileViewTime: number;
    photoAttractiveness: number;
    conversationIntensity: number;
    sharedVibeTags: number;
    passportInterestSimilarity: number;
  };
  chemistryBoost: number;
  finalScore: number;
  timestamp: Date;
}

interface InteractionMetrics {
  userId: string;
  targetUserId: string;
  viewStartTime?: Date;
  viewDuration?: number; // seconds
  swipeDirection?: 'left' | 'right';
  messagesSent?: number;
  messagesReceived?: number;
  averageReplySpeed?: number; // seconds
  averageMessageLength?: number; // characters
  flirtCount?: number;
  complimentCount?: number;
  lastInteractionAt?: Date;
  isActive?: boolean;
}

interface ChemistryBoostState {
  userId1: string;
  userId2: string;
  bothFlirted: boolean;
  bothComplimented: boolean;
  bothActiveInChat: boolean;
  boostPercentage: number;
  appliedAt: Date;
  expiresAt: Date;
}

interface SpamDetectionResult {
  isSpam: boolean;
  reasons: string[];
  confidence: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CHEMISTRY_WEIGHTS: ChemistryWeights = {
  mutualSwipes: 0.25,           // 25% - Strong signal of mutual interest
  profileViewTime: 0.15,         // 15% - Time spent indicates genuine interest
  photoAttractiveness: 0.20,     // 20% - User engagement with photos
  conversationIntensity: 0.20,   // 20% - Reply speed & length
  sharedVibeTags: 0.10,          // 10% - Common interests/vibes
  passportInterestSimilarity: 0.10, // 10% - Location/travel interests
};

const CHEMISTRY_BOOST_PERCENTAGE = 70; // +70% visibility boost
const CHEMISTRY_BOOST_DURATION_HOURS = 72; // 3 days active boost

const SPAM_THRESHOLDS = {
  maxIdenticalMessages: 3,
  maxSimilarMessagesPercentage: 0.8, // 80% similarity
  maxMessagesPerMinute: 5,
  minMessageVariety: 0.3, // 30% unique content required
};

const COLLECTIONS = {
  CHEMISTRY_SCORES: 'chemistry_scores',
  INTERACTION_METRICS: 'interaction_metrics',
  CHEMISTRY_BOOSTS: 'chemistry_boosts',
  SWIPES: 'swipes',
  MESSAGES: 'messages',
  USER_PROFILES: 'users',
  VIBE_TAGS: 'vibe_tags',
  PASSPORT_INTERESTS: 'passport_interests',
} as const;

// ============================================================================
// CHEMISTRY SCORE CALCULATION
// ============================================================================

/**
 * Calculate comprehensive chemistry score between two users
 */
export async function calculateChemistryScore(
  userId: string,
  targetUserId: string
): Promise<ChemistryScore> {
  console.log(`[ChemistryEngine] Calculating chemistry score: ${userId} → ${targetUserId}`);

  // Get interaction metrics
  const metrics = await getInteractionMetrics(userId, targetUserId);

  // Calculate component scores
  const mutualSwipeScore = await calculateMutualSwipeScore(userId, targetUserId);
  const viewTimeScore = calculateViewTimeScore(metrics.viewDuration || 0);
  const photoAttractivenessScore = await calculatePhotoAttractivenessScore(userId, targetUserId);
  const conversationScore = calculateConversationIntensityScore(metrics);
  const vibeTagScore = await calculateSharedVibeTagScore(userId, targetUserId);
  const passportScore = await calculatePassportInterestSimilarity(userId, targetUserId);

  // Apply weights
  const weightedScore = 
    mutualSwipeScore * CHEMISTRY_WEIGHTS.mutualSwipes +
    viewTimeScore * CHEMISTRY_WEIGHTS.profileViewTime +
    photoAttractivenessScore * CHEMISTRY_WEIGHTS.photoAttractiveness +
    conversationScore * CHEMISTRY_WEIGHTS.conversationIntensity +
    vibeTagScore * CHEMISTRY_WEIGHTS.sharedVibeTags +
    passportScore * CHEMISTRY_WEIGHTS.passportInterestSimilarity;

  // Check for chemistry boost
  const chemistryBoost = await getChemistryBoost(userId, targetUserId);

  // Calculate final score with boost
  const finalScore = weightedScore * (1 + (chemistryBoost / 100));

  const score: ChemistryScore = {
    userId,
    targetUserId,
    totalScore: weightedScore,
    components: {
      mutualSwipes: mutualSwipeScore,
      profileViewTime: viewTimeScore,
      photoAttractiveness: photoAttractivenessScore,
      conversationIntensity: conversationScore,
      sharedVibeTags: vibeTagScore,
      passportInterestSimilarity: passportScore,
    },
    chemistryBoost,
    finalScore,
    timestamp: new Date(),
  };

  // Store score
  await storeChemistryScore(score);

  console.log(`[ChemistryEngine] Final chemistry score: ${finalScore.toFixed(2)} (base: ${weightedScore.toFixed(2)}, boost: ${chemistryBoost}%)`);

  return score;
}

/**
 * Calculate mutual swipe score (0-100)
 */
async function calculateMutualSwipeScore(
  userId: string,
  targetUserId: string
): Promise<number> {
  try {
    // Check if user swiped right on target
    const userSwipeDoc = await db
      .collection(COLLECTIONS.SWIPES)
      .doc(`${userId}_${targetUserId}`)
      .get();

    // Check if target swiped right on user
    const targetSwipeDoc = await db
      .collection(COLLECTIONS.SWIPES)
      .doc(`${targetUserId}_${userId}`)
      .get();

    const userSwipedRight = userSwipeDoc.exists && userSwipeDoc.data()?.direction === 'right';
    const targetSwipedRight = targetSwipeDoc.exists && targetSwipeDoc.data()?.direction === 'right';

    // Mutual right swipes = maximum score
    if (userSwipedRight && targetSwipedRight) {
      return 100;
    }

    // One-way right swipe = medium score
    if (userSwipedRight || targetSwipedRight) {
      return 50;
    }

    // No swipes yet = neutral
    return 25;
  } catch (error) {
    console.error('[calculateMutualSwipeScore] Error:', error);
    return 25; // Default neutral score
  }
}

/**
 * Calculate view time score (0-100)
 * Based on how long user viewed target's profile
 */
function calculateViewTimeScore(viewDurationSeconds: number): number {
  // 0-10 seconds: low interest (0-30)
  // 10-30 seconds: medium interest (30-60)
  // 30-60 seconds: high interest (60-85)
  // 60+ seconds: very high interest (85-100)

  if (viewDurationSeconds < 10) {
    return Math.min(viewDurationSeconds * 3, 30);
  } else if (viewDurationSeconds < 30) {
    return 30 + ((viewDurationSeconds - 10) * 1.5);
  } else if (viewDurationSeconds < 60) {
    return 60 + ((viewDurationSeconds - 30) * 0.83);
  } else {
    return Math.min(85 + ((viewDurationSeconds - 60) * 0.25), 100);
  }
}

/**
 * Calculate photo attractiveness score (0-100)
 * Based on user engagement with target's photos
 */
async function calculatePhotoAttractivenessScore(
  userId: string,
  targetUserId: string
): Promise<number> {
  try {
    // Get photo interaction data
    const interactionDoc = await db
      .collection(COLLECTIONS.INTERACTION_METRICS)
      .doc(`${userId}_${targetUserId}`)
      .get();

    if (!interactionDoc.exists) {
      return 50; // Neutral score if no data
    }

    const data = interactionDoc.data();
    const photoViews = data?.photoViews || 0;
    const photoLikes = data?.photoLikes || 0;
    const photoViewDuration = data?.photoViewDuration || 0;

    // Calculate engagement rate
    const engagementRate = photoViews > 0 ? (photoLikes / photoViews) : 0;
    const avgViewTime = photoViews > 0 ? (photoViewDuration / photoViews) : 0;

    // Combine metrics
    const engagementScore = engagementRate * 50; // 0-50 based on like rate
    const timeScore = Math.min(avgViewTime * 5, 50); // 0-50 based on time (10+ sec = max)

    return Math.min(engagementScore + timeScore, 100);
  } catch (error) {
    console.error('[calculatePhotoAttractivenessScore] Error:', error);
    return 50;
  }
}

/**
 * Calculate conversation intensity score (0-100)
 * Based on reply speed and message length
 */
function calculateConversationIntensityScore(metrics: InteractionMetrics): number {
  const messagesSent = metrics.messagesSent || 0;
  const messagesReceived = metrics.messagesReceived || 0;
  const avgReplySpeed = metrics.averageReplySpeed || 9999;
  const avgMessageLength = metrics.averageMessageLength || 0;

  // No conversation yet
  if (messagesSent === 0 && messagesReceived === 0) {
    return 0;
  }

  // Reply speed score (0-50)
  // Under 1 min = 50, 1-5 min = 40-50, 5-30 min = 20-40, 30+ min = 0-20
  let replySpeedScore = 0;
  if (avgReplySpeed < 60) {
    replySpeedScore = 50;
  } else if (avgReplySpeed < 300) {
    replySpeedScore = 40 + ((300 - avgReplySpeed) / 240) * 10;
  } else if (avgReplySpeed < 1800) {
    replySpeedScore = 20 + ((1800 - avgReplySpeed) / 1500) * 20;
  } else {
    replySpeedScore = Math.max(0, 20 - ((avgReplySpeed - 1800) / 1800) * 20);
  }

  // Message length score (0-30)
  // 50+ chars = 30, 20-50 = 15-30, under 20 = 0-15
  let lengthScore = 0;
  if (avgMessageLength >= 50) {
    lengthScore = 30;
  } else if (avgMessageLength >= 20) {
    lengthScore = 15 + ((avgMessageLength - 20) / 30) * 15;
  } else {
    lengthScore = (avgMessageLength / 20) * 15;
  }

  // Balance score (0-20)
  // Mutual engagement is valued
  const totalMessages = messagesSent + messagesReceived;
  const balanceRatio = totalMessages > 0 
    ? Math.min(messagesSent, messagesReceived) / totalMessages 
    : 0;
  const balanceScore = balanceRatio * 40; // Perfect balance = 20

  return Math.min(replySpeedScore + lengthScore + balanceScore, 100);
}

/**
 * Calculate shared vibe tag score (0-100)
 */
async function calculateSharedVibeTagScore(
  userId: string,
  targetUserId: string
): Promise<number> {
  try {
    const userVibesDoc = await db.collection(COLLECTIONS.VIBE_TAGS).doc(userId).get();
    const targetVibesDoc = await db.collection(COLLECTIONS.VIBE_TAGS).doc(targetUserId).get();

    if (!userVibesDoc.exists || !targetVibesDoc.exists) {
      return 0;
    }

    const userVibes = new Set(userVibesDoc.data()?.tags || []);
    const targetVibes = new Set(targetVibesDoc.data()?.tags || []);

    // Calculate Jaccard similarity
    const intersection = new Set(Array.from(userVibes).filter(x => targetVibes.has(x)));
    const union = new Set([...Array.from(userVibes), ...Array.from(targetVibes)]);

    if (union.size === 0) {
      return 0;
    }

    const similarity = (intersection.size / union.size) * 100;
    return Math.min(similarity, 100);
  } catch (error) {
    console.error('[calculateSharedVibeTagScore] Error:', error);
    return 0;
  }
}

/**
 * Calculate passport interest similarity (0-100)
 */
async function calculatePassportInterestSimilarity(
  userId: string,
  targetUserId: string
): Promise<number> {
  try {
    const userPassportDoc = await db.collection(COLLECTIONS.PASSPORT_INTERESTS).doc(userId).get();
    const targetPassportDoc = await db.collection(COLLECTIONS.PASSPORT_INTERESTS).doc(targetUserId).get();

    if (!userPassportDoc.exists || !targetPassportDoc.exists) {
      return 0;
    }

    const userInterests = new Set(userPassportDoc.data()?.locations || []);
    const targetInterests = new Set(targetPassportDoc.data()?.locations || []);

    // Calculate overlap
    const commonLocations = new Set(Array.from(userInterests).filter(x => targetInterests.has(x)));
    const totalLocations = new Set([...Array.from(userInterests), ...Array.from(targetInterests)]);

    if (totalLocations.size === 0) {
      return 0;
    }

    return (commonLocations.size / totalLocations.size) * 100;
  } catch (error) {
    console.error('[calculatePassportInterestSimilarity] Error:', error);
    return 0;
  }
}

// ============================================================================
// CHEMISTRY BOOST SYSTEM
// ============================================================================

/**
 * Check and apply chemistry boost between two users
 */
export async function evaluateChemistryBoost(
  userId: string,
  targetUserId: string
): Promise<number> {
  try {
    // Check if boost already exists and is valid
    const existingBoost = await getActiveBoost(userId, targetUserId);
    if (existingBoost) {
      return existingBoost.boostPercentage;
    }

    // Check criteria for new boost
    const metrics1 = await getInteractionMetrics(userId, targetUserId);
    const metrics2 = await getInteractionMetrics(targetUserId, userId);

    const bothFlirted = (metrics1.flirtCount || 0) > 0 && (metrics2.flirtCount || 0) > 0;
    const bothComplimented = (metrics1.complimentCount || 0) > 0 && (metrics2.complimentCount || 0) > 0;
    const bothActiveInChat = (metrics1.isActive || false) && (metrics2.isActive || false);

    // All three criteria must be met for boost
    if (bothFlirted && bothComplimented && bothActiveInChat) {
      // Check for spam before applying boost
      const spam1 = await detectSpamBehavior(userId, targetUserId);
      const spam2 = await detectSpamBehavior(targetUserId, userId);

      if (!spam1.isSpam && !spam2.isSpam) {
        await applyChemistryBoost(userId, targetUserId);
        console.log(`[ChemistryBoost] Applied +${CHEMISTRY_BOOST_PERCENTAGE}% boost: ${userId} ↔ ${targetUserId}`);
        return CHEMISTRY_BOOST_PERCENTAGE;
      } else {
        console.log(`[ChemistryBoost] Spam detected, boost denied: ${userId} ↔ ${targetUserId}`);
      }
    }

    return 0;
  } catch (error) {
    console.error('[evaluateChemistryBoost] Error:', error);
    return 0;
  }
}

/**
 * Get active chemistry boost between users
 */
async function getActiveBoost(
  userId1: string,
  userId2: string
): Promise<ChemistryBoostState | null> {
  try {
    const boostId = [userId1, userId2].sort().join('_');
    const boostDoc = await db.collection(COLLECTIONS.CHEMISTRY_BOOSTS).doc(boostId).get();

    if (!boostDoc.exists) {
      return null;
    }

    const boost = boostDoc.data() as ChemistryBoostState;
    const now = new Date();

    // Check if boost is still valid
    if (boost.expiresAt && new Date(boost.expiresAt) > now) {
      return boost;
    }

    return null;
  } catch (error) {
    console.error('[getActiveBoost] Error:', error);
    return null;
  }
}

/**
 * Apply chemistry boost
 */
async function applyChemistryBoost(userId1: string, userId2: string): Promise<void> {
  const boostId = [userId1, userId2].sort().join('_');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHEMISTRY_BOOST_DURATION_HOURS * 60 * 60 * 1000);

  const boost: ChemistryBoostState = {
    userId1,
    userId2,
    bothFlirted: true,
    bothComplimented: true,
    bothActiveInChat: true,
    boostPercentage: CHEMISTRY_BOOST_PERCENTAGE,
    appliedAt: now,
    expiresAt,
  };

  await db.collection(COLLECTIONS.CHEMISTRY_BOOSTS).doc(boostId).set(boost);
}

/**
 * Get chemistry boost value for user pair
 */
async function getChemistryBoost(userId: string, targetUserId: string): Promise<number> {
  const boost = await getActiveBoost(userId, targetUserId);
  return boost ? boost.boostPercentage : 0;
}

// ============================================================================
// SPAM DETECTION
// ============================================================================

/**
 * Detect spam behavior in user's messages
 */
export async function detectSpamBehavior(
  userId: string,
  targetUserId: string
): Promise<SpamDetectionResult> {
  try {
    const reasons: string[] = [];
    let spamScore = 0;

    // Get recent messages from user to target
    const messagesSnapshot = await db
      .collection(COLLECTIONS.MESSAGES)
      .where('senderId', '==', userId)
      .where('recipientId', '==', targetUserId)
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    if (messagesSnapshot.empty) {
      return { isSpam: false, reasons: [], confidence: 0 };
    }

    const messages = messagesSnapshot.docs.map(doc => doc.data());

    // Check for repetitive messages
    const repetitiveCount = detectRepetitiveMessages(messages);
    if (repetitiveCount > SPAM_THRESHOLDS.maxIdenticalMessages) {
      reasons.push(`Repetitive messages detected: ${repetitiveCount} identical`);
      spamScore += 30;
    }

    // Check for copy-paste patterns
    const copyPasteDetected = detectCopyPaste(messages);
    if (copyPasteDetected) {
      reasons.push('Copy-paste pattern detected');
      spamScore += 25;
    }

    // Check for flood (messages per minute)
    const floodRate = calculateFloodRate(messages);
    if (floodRate > SPAM_THRESHOLDS.maxMessagesPerMinute) {
      reasons.push(`Message flood detected: ${floodRate.toFixed(1)} msg/min`);
      spamScore += 25;
    }

    // Check for message variety
    const variety = calculateMessageVariety(messages);
    if (variety < SPAM_THRESHOLDS.minMessageVariety) {
      reasons.push(`Low message variety: ${(variety * 100).toFixed(0)}%`);
      spamScore += 20;
    }

    const isSpam = spamScore >= 50; // Spam threshold
    const confidence = Math.min(spamScore / 100, 1);

    return { isSpam, reasons, confidence };
  } catch (error) {
    console.error('[detectSpamBehavior] Error:', error);
    return { isSpam: false, reasons: [], confidence: 0 };
  }
}

/**
 * Detect repetitive messages
 */
function detectRepetitiveMessages(messages: any[]): number {
  const messageTexts = messages.map(m => m.text?.toLowerCase().trim() || '');
  const textCounts = new Map<string, number>();

  for (const text of messageTexts) {
    if (text.length > 0) {
      textCounts.set(text, (textCounts.get(text) || 0) + 1);
    }
  }

  const counts = Array.from(textCounts.values());
  return counts.length > 0 ? Math.max(...counts) : 0;
}

/**
 * Detect copy-paste behavior
 */
function detectCopyPaste(messages: any[]): boolean {
  if (messages.length < 5) return false;

  // Check for suspiciously similar messages sent to multiple people
  const recentMessages = messages.slice(0, 20);
  const similarities: number[] = [];

  for (let i = 0; i < recentMessages.length - 1; i++) {
    const similarity = calculateSimilarity(
      recentMessages[i].text || '',
      recentMessages[i + 1].text || ''
    );
    similarities.push(similarity);
  }

  const avgSimilarity = similarities.reduce((sum, s) => sum + s, 0) / similarities.length;
  return avgSimilarity > SPAM_THRESHOLDS.maxSimilarMessagesPercentage;
}

/**
 * Calculate message flood rate (messages per minute)
 */
function calculateFloodRate(messages: any[]): number {
  if (messages.length < 2) return 0;

  const recentMessages = messages.slice(0, 10);
  const timestamps = recentMessages
    .map(m => m.timestamp?.toDate?.() || new Date(m.timestamp))
    .sort((a, b) => b.getTime() - a.getTime());

  if (timestamps.length < 2) return 0;

  const timeSpanMs = timestamps[0].getTime() - timestamps[timestamps.length - 1].getTime();
  const timeSpanMin = timeSpanMs / (1000 * 60);

  return timeSpanMin > 0 ? timestamps.length / timeSpanMin : 0;
}

/**
 * Calculate message variety (uniqueness ratio)
 */
function calculateMessageVariety(messages: any[]): number {
  if (messages.length === 0) return 1;

  const uniqueMessages = new Set(
    messages.map(m => m.text?.toLowerCase().trim() || '')
  );

  return uniqueMessages.size / messages.length;
}

/**
 * Calculate string similarity (Levenshtein-based)
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (str1.length === 0 && str2.length === 0) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;

  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

// ============================================================================
// DATA PERSISTENCE
// ============================================================================

/**
 * Store chemistry score
 */
async function storeChemistryScore(score: ChemistryScore): Promise<void> {
  const docId = `${score.userId}_${score.targetUserId}`;
  await db.collection(COLLECTIONS.CHEMISTRY_SCORES).doc(docId).set({
    ...score,
    timestamp: serverTimestamp(),
  });
}

/**
 * Get interaction metrics
 */
async function getInteractionMetrics(
  userId: string,
  targetUserId: string
): Promise<InteractionMetrics> {
  try {
    const docId = `${userId}_${targetUserId}`;
    const doc = await db.collection(COLLECTIONS.INTERACTION_METRICS).doc(docId).get();

    if (!doc.exists) {
      return {
        userId,
        targetUserId,
      };
    }

    return doc.data() as InteractionMetrics;
  } catch (error) {
    console.error('[getInteractionMetrics] Error:', error);
    return { userId, targetUserId };
  }
}

/**
 * Update interaction metrics
 */
export async function updateInteractionMetrics(
  userId: string,
  targetUserId: string,
  updates: Partial<InteractionMetrics>
): Promise<void> {
  const docId = `${userId}_${targetUserId}`;
  await db.collection(COLLECTIONS.INTERACTION_METRICS).doc(docId).set(
    {
      userId,
      targetUserId,
      ...updates,
      lastInteractionAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// ============================================================================
// BATCH CHEMISTRY CALCULATIONS
// ============================================================================

/**
 * Calculate chemistry scores for all candidates in discovery feed
 */
export async function calculateChemistryScoresForFeed(
  userId: string,
  candidateIds: string[]
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();

  // Calculate scores in parallel (with concurrency limit)
  const batchSize = 10;
  for (let i = 0; i < candidateIds.length; i += batchSize) {
    const batch = candidateIds.slice(i, i + batchSize);
    const batchScores = await Promise.all(
      batch.map(async (targetId) => {
        try {
          const score = await calculateChemistryScore(userId, targetId);
          return { targetId, score: score.finalScore };
        } catch (error) {
          console.error(`[calculateChemistryScoresForFeed] Error for ${targetId}:`, error);
          return { targetId, score: 0 };
        }
      })
    );

    for (const { targetId, score } of batchScores) {
      scores.set(targetId, score);
    }
  }

  return scores;
}

console.log('✅ PACK 195 — Chemistry-Based Matching Engine initialized');