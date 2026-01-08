/**
 * PACK 110 — Voice of User & Continuous Feedback Engine
 * 
 * Backend functions for user feedback submission and eligibility checking.
 * 
 * CRITICAL CONSTRAINTS:
 * - Zero free tokens, zero bonuses, zero discounts, zero incentives
 * - No UX changes suggesting "earn more by submitting feedback"
 * - Feedback must not influence visibility, ranking, or monetization
 * - Internal tracking only - no public reviews or star ratings
 * - Anti-spam and abuse protection required
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, generateId, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  UserFeedbackEvent,
  FeedbackState,
  SubmitNpsFeedbackRequest,
  SubmitNpsFeedbackResponse,
  SubmitFeatureFeedbackRequest,
  SubmitFeatureFeedbackResponse,
  SubmitFreeFormFeedbackRequest,
  SubmitFreeFormFeedbackResponse,
  GetShouldAskForNpsResponse,
  GetShouldAskForFeatureFeedbackRequest,
  GetShouldAskForFeatureFeedbackResponse,
  DeclineFeedbackRequest,
  DeclineFeedbackResponse,
  SpamClassification,
  FEEDBACK_TIMING,
  SCORE_RANGES,
  FEATURE_KEYS,
  FeedbackErrorCode,
  FeedbackError,
} from './pack110-types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Sanitize text input to prevent XSS and HTML injection
 */
function sanitizeText(text: string): string {
  if (!text) return '';
  
  // Remove HTML tags
  let sanitized = text.replace(/<[^>]*>/g, '');
  
  // Remove script content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Trim and limit length
  sanitized = sanitized.trim().substring(0, 5000);
  
  return sanitized;
}

/**
 * Basic spam detection using simple heuristics
 */
function detectSpam(text: string): SpamClassification {
  if (!text) {
    return { isSpam: false, confidence: 0, reasons: [] };
  }
  
  const reasons: string[] = [];
  let spamScore = 0;
  
  // Check for excessive repetition
  const words = text.toLowerCase().split(/\s+/);
  const wordCounts = new Map<string, number>();
  
  words.forEach(word => {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  });
  
  for (const [word, count] of Array.from(wordCounts.entries())) {
    if (word.length > 3 && count > 5) {
      reasons.push('Excessive word repetition');
      spamScore += 0.3;
      break;
    }
  }
  
  // Check for URL spam
  const urlPattern = /(https?:\/\/[^\s]+)/gi;
  const urls = text.match(urlPattern) || [];
  if (urls.length > 3) {
    reasons.push('Too many URLs');
    spamScore += 0.4;
  }
  
  // Check for promotional keywords
  const promotionalKeywords = [
    'buy now', 'click here', 'limited offer', 'act now', 'discount code',
    'promo code', 'visit my', 'check out my', 'follow me on', 'subscribe to'
  ];
  
  const lowerText = text.toLowerCase();
  let promotionalMatches = 0;
  
  promotionalKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) {
      promotionalMatches++;
    }
  });
  
  if (promotionalMatches >= 2) {
    reasons.push('Promotional content detected');
    spamScore += 0.5;
  }
  
  // Check for very short or very long text
  if (text.length < 5) {
    reasons.push('Text too short');
    spamScore += 0.2;
  }
  
  if (text.length > 4000) {
    reasons.push('Text suspiciously long');
    spamScore += 0.3;
  }
  
  // Check for all caps (excluding short text)
  if (text.length > 20) {
    const upperCaseRatio = (text.match(/[A-Z]/g) || []).length / text.length;
    if (upperCaseRatio > 0.7) {
      reasons.push('Excessive caps lock');
      spamScore += 0.2;
    }
  }
  
  const isSpam = spamScore >= 0.6;
  
  return {
    isSpam,
    confidence: Math.min(spamScore, 1),
    reasons,
  };
}

/**
 * Check rate limits for feedback submission
 */
async function checkRateLimit(userId: string): Promise<boolean> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  // Check daily limit
  const dailyCount = await db
    .collection('user_feedback_events')
    .where('userId', '==', userId)
    .where('createdAt', '>=', Timestamp.fromDate(oneDayAgo))
    .count()
    .get();
  
  if (dailyCount.data().count >= FEEDBACK_TIMING.RATE_LIMIT_PER_DAY) {
    return false;
  }
  
  // Check hourly limit
  const hourlyCount = await db
    .collection('user_feedback_events')
    .where('userId', '==', userId)
    .where('createdAt', '>=', Timestamp.fromDate(oneHourAgo))
    .count()
    .get();
  
  if (hourlyCount.data().count >= FEEDBACK_TIMING.RATE_LIMIT_PER_HOUR) {
    return false;
  }
  
  return true;
}

/**
 * Get or create feedback state for user
 */
async function getFeedbackState(userId: string): Promise<FeedbackState> {
  const stateDoc = await db.collection('feedback_state').doc(userId).get();
  
  if (stateDoc.exists) {
    return stateDoc.data() as FeedbackState;
  }
  
  // Create new state
  const newState: FeedbackState = {
    userId,
    lastAskedByFeature: {},
    declinedFeatures: [],
    updatedAt: serverTimestamp(),
  };
  
  await db.collection('feedback_state').doc(userId).set(newState);
  
  return newState;
}

/**
 * Update feedback state
 */
async function updateFeedbackState(
  userId: string,
  updates: Partial<FeedbackState>
): Promise<void> {
  await db.collection('feedback_state').doc(userId).update({
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Validate feature key
 */
function validateFeatureKey(featureKey: string): boolean {
  const validKeys = Object.values(FEATURE_KEYS);
  return validKeys.includes(featureKey as any);
}

// ============================================================================
// NPS FEEDBACK FUNCTIONS
// ============================================================================

/**
 * Submit NPS feedback
 */
export const submitNpsFeedback = onCall(
  { region: 'europe-west3' },
  async (request): Promise<SubmitNpsFeedbackResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const userId = request.auth.uid;
    const data = request.data as SubmitNpsFeedbackRequest;
    
    // Validate score
    if (
      typeof data.score !== 'number' ||
      data.score < SCORE_RANGES.NPS_MIN ||
      data.score > SCORE_RANGES.NPS_MAX
    ) {
      throw new HttpsError(
        'invalid-argument',
        `NPS score must be between ${SCORE_RANGES.NPS_MIN} and ${SCORE_RANGES.NPS_MAX}`
      );
    }
    
    try {
      // Check rate limits
      const withinLimit = await checkRateLimit(userId);
      if (!withinLimit) {
        throw new FeedbackError(
          FeedbackErrorCode.RATE_LIMITED,
          'Too many feedback submissions. Please try again later.'
        );
      }
      
      // Sanitize text
      const sanitizedText = data.text ? sanitizeText(data.text) : undefined;
      
      // Check for spam
      if (sanitizedText) {
        const spamCheck = detectSpam(sanitizedText);
        if (spamCheck.isSpam) {
          logger.warn(`Spam detected in NPS feedback from user ${userId}`, {
            confidence: spamCheck.confidence,
            reasons: spamCheck.reasons,
          });
          
          throw new FeedbackError(
            FeedbackErrorCode.SPAM_DETECTED,
            'Your feedback was flagged as spam. Please provide genuine feedback.'
          );
        }
      }
      
      // Create feedback event
      const eventId = generateId();
      const feedbackEvent: UserFeedbackEvent = {
        id: eventId,
        userId,
        eventType: 'NPS',
        score: data.score,
        text: sanitizedText,
        language: data.language,
        appVersion: data.appVersion,
        region: data.region,
        platform: data.platform,
        createdAt: serverTimestamp(),
      };
      
      await db.collection('user_feedback_events').doc(eventId).set(feedbackEvent);
      
      // Update feedback state
      await updateFeedbackState(userId, {
        lastNpsShownAt: Timestamp.now(),
      });
      
      logger.info(`NPS feedback submitted: user=${userId}, score=${data.score}`);
      
      return {
        success: true,
        eventId,
      };
    } catch (error: any) {
      if (error instanceof FeedbackError) {
        throw new HttpsError('invalid-argument', error.message);
      }
      
      logger.error('Error submitting NPS feedback', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Check if should ask for NPS
 */
export const getShouldAskForNps = onCall(
  { region: 'europe-west3' },
  async (request): Promise<GetShouldAskForNpsResponse> => {
    if (!request.auth) {
      return {
        shouldAsk: false,
        reason: 'User not authenticated',
      };
    }
    
    const userId = request.auth.uid;
    
    try {
      const state = await getFeedbackState(userId);
      
      // Check if user declined
      if (state.npsDeclined) {
        return {
          shouldAsk: false,
          reason: 'User previously declined NPS survey',
        };
      }
      
      // Check cooldown period
      if (state.lastNpsShownAt) {
        const lastShown = (state.lastNpsShownAt as Timestamp).toDate();
        const daysSinceLastShown = 
          (Date.now() - lastShown.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceLastShown < FEEDBACK_TIMING.NPS_COOLDOWN_DAYS) {
          return {
            shouldAsk: false,
            reason: `Cooldown period: ${Math.ceil(FEEDBACK_TIMING.NPS_COOLDOWN_DAYS - daysSinceLastShown)} days remaining`,
          };
        }
      }
      
      return {
        shouldAsk: true,
      };
    } catch (error: any) {
      logger.error('Error checking NPS eligibility', error);
      return {
        shouldAsk: false,
        reason: 'Error checking eligibility',
      };
    }
  }
);

// ============================================================================
// FEATURE FEEDBACK FUNCTIONS
// ============================================================================

/**
 * Submit feature-specific feedback
 */
export const submitFeatureFeedback = onCall(
  { region: 'europe-west3' },
  async (request): Promise<SubmitFeatureFeedbackResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const userId = request.auth.uid;
    const data = request.data as SubmitFeatureFeedbackRequest;
    
    // Validate feature key
    if (!validateFeatureKey(data.featureKey)) {
      throw new HttpsError('invalid-argument', 'Invalid feature key');
    }
    
    // Validate score
    if (
      typeof data.score !== 'number' ||
      data.score < SCORE_RANGES.FEATURE_MIN ||
      data.score > SCORE_RANGES.FEATURE_MAX
    ) {
      throw new HttpsError(
        'invalid-argument',
        `Feature score must be between ${SCORE_RANGES.FEATURE_MIN} and ${SCORE_RANGES.FEATURE_MAX}`
      );
    }
    
    try {
      // Check rate limits
      const withinLimit = await checkRateLimit(userId);
      if (!withinLimit) {
        throw new FeedbackError(
          FeedbackErrorCode.RATE_LIMITED,
          'Too many feedback submissions. Please try again later.'
        );
      }
      
      // Sanitize text
      const sanitizedText = data.text ? sanitizeText(data.text) : undefined;
      
      // Check for spam
      if (sanitizedText) {
        const spamCheck = detectSpam(sanitizedText);
        if (spamCheck.isSpam) {
          logger.warn(`Spam detected in feature feedback from user ${userId}`, {
            featureKey: data.featureKey,
            confidence: spamCheck.confidence,
            reasons: spamCheck.reasons,
          });
          
          throw new FeedbackError(
            FeedbackErrorCode.SPAM_DETECTED,
            'Your feedback was flagged as spam. Please provide genuine feedback.'
          );
        }
      }
      
      // Create feedback event
      const eventId = generateId();
      const feedbackEvent: UserFeedbackEvent = {
        id: eventId,
        userId,
        eventType: 'FEATURE',
        score: data.score,
        featureKey: data.featureKey,
        text: sanitizedText,
        language: data.language,
        appVersion: data.appVersion,
        region: data.region,
        platform: data.platform,
        createdAt: serverTimestamp(),
      };
      
      await db.collection('user_feedback_events').doc(eventId).set(feedbackEvent);
      
      // Update feedback state
      const state = await getFeedbackState(userId);
      const lastAskedByFeature = { ...state.lastAskedByFeature };
      lastAskedByFeature[data.featureKey] = Timestamp.now();
      
      await updateFeedbackState(userId, {
        lastAskedByFeature,
      });
      
      logger.info(`Feature feedback submitted: user=${userId}, feature=${data.featureKey}, score=${data.score}`);
      
      return {
        success: true,
        eventId,
      };
    } catch (error: any) {
      if (error instanceof FeedbackError) {
        throw new HttpsError('invalid-argument', error.message);
      }
      
      logger.error('Error submitting feature feedback', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Check if should ask for feature feedback
 */
export const getShouldAskForFeatureFeedback = onCall(
  { region: 'europe-west3' },
  async (request): Promise<GetShouldAskForFeatureFeedbackResponse> => {
    if (!request.auth) {
      return {
        shouldAsk: false,
        reason: 'User not authenticated',
      };
    }
    
    const userId = request.auth.uid;
    const data = request.data as GetShouldAskForFeatureFeedbackRequest;
    
    // Validate feature key
    if (!validateFeatureKey(data.featureKey)) {
      return {
        shouldAsk: false,
        reason: 'Invalid feature key',
      };
    }
    
    try {
      const state = await getFeedbackState(userId);
      
      // Check if user declined for this feature
      if (state.declinedFeatures.includes(data.featureKey)) {
        return {
          shouldAsk: false,
          reason: 'User previously declined feedback for this feature',
        };
      }
      
      // Check cooldown period for this feature
      const lastAsked = state.lastAskedByFeature[data.featureKey];
      
      if (lastAsked) {
        const lastAskedDate = (lastAsked as Timestamp).toDate();
        const daysSinceLastAsked = 
          (Date.now() - lastAskedDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceLastAsked < FEEDBACK_TIMING.FEATURE_COOLDOWN_DAYS) {
          return {
            shouldAsk: false,
            reason: `Cooldown period: ${Math.ceil(FEEDBACK_TIMING.FEATURE_COOLDOWN_DAYS - daysSinceLastAsked)} days remaining`,
          };
        }
      }
      
      return {
        shouldAsk: true,
      };
    } catch (error: any) {
      logger.error('Error checking feature feedback eligibility', error);
      return {
        shouldAsk: false,
        reason: 'Error checking eligibility',
      };
    }
  }
);

// ============================================================================
// FREE-FORM FEEDBACK FUNCTIONS
// ============================================================================

/**
 * Submit free-form feedback
 */
export const submitFreeFormFeedback = onCall(
  { region: 'europe-west3' },
  async (request): Promise<SubmitFreeFormFeedbackResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const userId = request.auth.uid;
    const data = request.data as SubmitFreeFormFeedbackRequest;
    
    // Validate text
    if (!data.text || data.text.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'Feedback text is required');
    }
    
    try {
      // Check rate limits
      const withinLimit = await checkRateLimit(userId);
      if (!withinLimit) {
        throw new FeedbackError(
          FeedbackErrorCode.RATE_LIMITED,
          'Too many feedback submissions. Please try again later.'
        );
      }
      
      // Sanitize text
      const sanitizedText = sanitizeText(data.text);
      
      if (sanitizedText.length < 5) {
        throw new HttpsError('invalid-argument', 'Feedback text is too short');
      }
      
      // Check for spam
      const spamCheck = detectSpam(sanitizedText);
      if (spamCheck.isSpam) {
        logger.warn(`Spam detected in free-form feedback from user ${userId}`, {
          confidence: spamCheck.confidence,
          reasons: spamCheck.reasons,
        });
        
        throw new FeedbackError(
          FeedbackErrorCode.SPAM_DETECTED,
          'Your feedback was flagged as spam. Please provide genuine feedback.'
        );
      }
      
      // Create feedback event
      const eventId = generateId();
      const feedbackEvent: UserFeedbackEvent = {
        id: eventId,
        userId,
        eventType: 'FREE_FORM',
        text: sanitizedText,
        language: data.language,
        appVersion: data.appVersion,
        region: data.region,
        platform: data.platform,
        createdAt: serverTimestamp(),
      };
      
      await db.collection('user_feedback_events').doc(eventId).set(feedbackEvent);
      
      logger.info(`Free-form feedback submitted: user=${userId}`);
      
      return {
        success: true,
        eventId,
      };
    } catch (error: any) {
      if (error instanceof FeedbackError) {
        throw new HttpsError('invalid-argument', error.message);
      }
      
      logger.error('Error submitting free-form feedback', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// DECLINE FEEDBACK FUNCTIONS
// ============================================================================

/**
 * Mark feedback as declined
 */
export const declineFeedback = onCall(
  { region: 'europe-west3' },
  async (request): Promise<DeclineFeedbackResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const userId = request.auth.uid;
    const data = request.data as DeclineFeedbackRequest;
    
    try {
      if (data.type === 'nps') {
        // Mark NPS as declined permanently
        await updateFeedbackState(userId, {
          npsDeclined: true,
          lastNpsShownAt: Timestamp.now(),
        });
        
        logger.info(`User ${userId} declined NPS survey`);
      } else if (data.type === 'feature' && data.featureKey) {
        // Validate feature key
        if (!validateFeatureKey(data.featureKey)) {
          throw new HttpsError('invalid-argument', 'Invalid feature key');
        }
        
        // Add to declined features list
        const state = await getFeedbackState(userId);
        const declinedFeatures = Array.from(new Set([
          ...state.declinedFeatures,
          data.featureKey,
        ]));
        
        const lastAskedByFeature = { ...state.lastAskedByFeature };
        lastAskedByFeature[data.featureKey] = Timestamp.now();
        
        await updateFeedbackState(userId, {
          declinedFeatures,
          lastAskedByFeature,
        });
        
        logger.info(`User ${userId} declined feedback for feature ${data.featureKey}`);
      } else {
        throw new HttpsError('invalid-argument', 'Invalid decline request');
      }
      
      return {
        success: true,
      };
    } catch (error: any) {
      logger.error('Error declining feedback', error);
      throw new HttpsError('internal', error.message);
    }
  }
);