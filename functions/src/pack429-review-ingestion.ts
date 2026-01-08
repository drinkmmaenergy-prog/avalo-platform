/**
 * PACK 429 — Review Ingestion & Mirroring
 * Handles import, language detection, sentiment analysis, and attack correlation
 */

import * as admin from 'firebase-admin';
import {
  StoreReviewMirror,
  ReviewImportRequest,
  ReviewImportResult,
  Platform,
  ReviewSentiment,
  AttackPattern,
} from './pack429-store-defense.types';
import { auditLog } from './pack296-audit-log';
import { notifyOps } from './pack293-notifications';

const db = admin.firestore();

// ============================================================================
// LANGUAGE DETECTION
// ============================================================================

/**
 * Simple language detection based on character patterns
 * For production, integrate with Google Cloud Translation API
 */
function detectLanguage(text: string): string {
  // Check for common language patterns
  const cyrillicPattern = /[\u0400-\u04FF]/;
  const arabicPattern = /[\u0600-\u06FF]/;
  const cjkPattern = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/;
  const spanishPattern = /[áéíóúñ¿¡]/i;
  const frenchPattern = /[àâæçéèêëïîôœùûüÿ]/i;
  const germanPattern = /[äöüß]/i;
  
  if (cyrillicPattern.test(text)) return 'ru';
  if (arabicPattern.test(text)) return 'ar';
  if (cjkPattern.test(text)) return 'zh';
  if (spanishPattern.test(text)) return 'es';
  if (frenchPattern.test(text)) return 'fr';
  if (germanPattern.test(text)) return 'de';
  
  // Default to English
  return 'en';
}

// ============================================================================
// SENTIMENT ANALYSIS
// ============================================================================

/**
 * Basic sentiment analysis based on rating and keywords
 * For production, integrate with Google Cloud Natural Language API
 */
function analyzeSentiment(text: string, rating: number): ReviewSentiment {
  const lowerText = text.toLowerCase();
  
  // Strong positive indicators
  const positiveKeywords = [
    'amazing', 'excellent', 'great', 'wonderful', 'fantastic',
    'love', 'best', 'perfect', 'awesome', 'incredible',
    'recommend', 'outstanding', 'brilliant', 'superb',
  ];
  
  // Strong negative indicators
  const negativeKeywords = [
    'terrible', 'awful', 'worst', 'horrible', 'useless',
    'scam', 'fraud', 'fake', 'garbage', 'trash',
    'waste', 'avoid', 'disappointed', 'refund',
  ];
  
  const positiveCount = positiveKeywords.filter(kw => lowerText.includes(kw)).length;
  const negativeCount = negativeKeywords.filter(kw => lowerText.includes(kw)).length;
  
  // Rating-based classification with keyword override
  if (rating >= 4 && negativeCount === 0) {
    return ReviewSentiment.POSITIVE;
  } else if (rating <= 2 || negativeCount > positiveCount) {
    return ReviewSentiment.NEGATIVE;
  } else {
    return ReviewSentiment.NEUTRAL;
  }
}

// ============================================================================
// ATTACK PATTERN DETECTION
// ============================================================================

/**
 * Check if this review is part of a coordinated attack pattern
 */
async function detectAttackPatterns(
  review: StoreReviewMirror,
  recentReviews: StoreReviewMirror[]
): Promise<boolean> {
  const patterns: AttackPattern[] = [];
  
  // Pattern 1: Phrase repetition
  const phrasePattern = detectPhraseRepetition(review, recentReviews);
  if (phrasePattern.detected) patterns.push(phrasePattern);
  
  // Pattern 2: Region concentration
  const regionPattern = detectRegionConcentration(review, recentReviews);
  if (regionPattern.detected) patterns.push(regionPattern);
  
  // Pattern 3: Rating spike
  const spikePattern = detectRatingSpike(recentReviews);
  if (spikePattern.detected) patterns.push(spikePattern);
  
  // Consider it an attack if multiple patterns detected with high confidence
  const highConfidencePatterns = patterns.filter(p => p.confidence > 0.7);
  return highConfidencePatterns.length >= 2;
}

function detectPhraseRepetition(
  review: StoreReviewMirror,
  recentReviews: StoreReviewMirror[]
): AttackPattern {
  const phrases = extractPhrases(review.text);
  let matchCount = 0;
  const matchingReviews: string[] = [];
  
  for (const recent of recentReviews) {
    const recentPhrases = extractPhrases(recent.text);
    const overlap = phrases.filter(p => recentPhrases.includes(p));
    
    if (overlap.length > 0) {
      matchCount++;
      matchingReviews.push(recent.id);
    }
  }
  
  const confidence = Math.min(matchCount / 5, 1); // 5+ matches = 100% confidence
  
  return {
    type: 'PHRASE_REPETITION',
    detected: matchCount >= 3,
    confidence,
    evidence: {
      sampleReviews: matchingReviews.slice(0, 5),
      matchCount,
    },
  };
}

function detectRegionConcentration(
  review: StoreReviewMirror,
  recentReviews: StoreReviewMirror[]
): AttackPattern {
  const regionReviews = recentReviews.filter(r => r.region === review.region);
  const regionRatio = regionReviews.length / recentReviews.length;
  
  // If >60% of recent reviews from same region, suspicious
  const detected = regionRatio > 0.6;
  const confidence = Math.min(regionRatio / 0.6, 1);
  
  return {
    type: 'REGION_CONCENTRATION',
    detected,
    confidence,
    evidence: {
      affectedRegions: [review.region],
      concentrationRatio: regionRatio,
    },
  };
}

function detectRatingSpike(recentReviews: StoreReviewMirror[]): AttackPattern {
  if (recentReviews.length < 10) {
    return {
      type: 'RATING_SPIKE',
      detected: false,
      confidence: 0,
      evidence: {},
    };
  }
  
  // Check for sudden 1-star spike
  const last24h = recentReviews.slice(0, Math.min(20, recentReviews.length));
  const oneStarCount = last24h.filter(r => r.rating === 1).length;
  const oneStarRatio = oneStarCount / last24h.length;
  
  // If >50% of recent reviews are 1-star, it's a spike
  const detected = oneStarRatio > 0.5;
  const confidence = Math.min(oneStarRatio / 0.5, 1);
  
  return {
    type: 'RATING_SPIKE',
    detected,
    confidence,
    evidence: {
      oneStarCount,
      totalReviews: last24h.length,
      ratio: oneStarRatio,
    },
  };
}

function extractPhrases(text: string): string[] {
  // Extract 3-4 word phrases for pattern matching
  const words = text.toLowerCase().split(/\s+/);
  const phrases: string[] = [];
  
  for (let i = 0; i < words.length - 2; i++) {
    phrases.push(words.slice(i, i + 3).join(' '));
  }
  
  return phrases;
}

// ============================================================================
// CORRELATION WITH FRAUD/BANS
// ============================================================================

async function correlateWithFraud(review: StoreReviewMirror): Promise<string[]> {
  if (!review.userLinked) return [];
  
  try {
    // Check if user has recent fraud events (PACK 302)
    const fraudEventsSnap = await db
      .collection('fraudEvents')
      .where('userId', '==', review.userLinked)
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
      ))
      .get();
    
    // Check if user is banned
    const userSnap = await db.collection('users').doc(review.userLinked).get();
    const userData = userSnap.data();
    
    const correlations: string[] = [];
    
    if (!fraudEventsSnap.empty) {
      correlations.push('RECENT_FRAUD_EVENT');
    }
    
    if (userData && userData.banned) {
      correlations.push('USER_BANNED');
    }
    
    if (userData && userData.accountAge && userData.accountAge < 24) {
      correlations.push('FRESH_ACCOUNT');
    }
    
    return correlations;
  } catch (error) {
    console.error('Error correlating with fraud:', error);
    return [];
  }
}

// ============================================================================
// REVIEW IMPORT
// ============================================================================

export async function importReviews(
  request: ReviewImportRequest
): Promise<ReviewImportResult> {
  const result: ReviewImportResult = {
    success: true,
    imported: 0,
    failed: 0,
    errors: [],
  };
  
  try {
    // Get recent reviews for pattern detection (last 50)
    const recentReviewsSnap = await db
      .collection('storeReviewsMirror')
      .where('platform', '==', request.platform)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    
    const recentReviews: StoreReviewMirror[] = [];
    recentReviewsSnap.forEach(doc => {
      recentReviews.push(doc.data() as StoreReviewMirror);
    });
    
    const batch = db.batch();
    let batchCount = 0;
    const attackPatternReviews: StoreReviewMirror[] = [];
    
    for (const reviewData of request.reviews) {
      try {
        const reviewId = reviewData.externalId || db.collection('storeReviewsMirror').doc().id;
        const reviewRef = db.collection('storeReviewsMirror').doc(reviewId);
        
        // Detect language and sentiment
        const language = reviewData.language || detectLanguage(reviewData.text);
        const sentiment = analyzeSentiment(reviewData.text, reviewData.rating);
        
        const review: StoreReviewMirror = {
          id: reviewId,
          platform: request.platform,
          rating: reviewData.rating,
          text: reviewData.text,
          language,
          region: reviewData.region || 'UNKNOWN',
          detectedSentiment: sentiment,
          isAttackPattern: false, // Will be updated if attack detected
          reviewDate: reviewData.reviewDate
            ? admin.firestore.Timestamp.fromDate(
                reviewData.reviewDate instanceof Date
                  ? reviewData.reviewDate
                  : (reviewData.reviewDate as any).toDate()
              )
            : undefined,
          importedAt: admin.firestore.Timestamp.now(),
          createdAt: admin.firestore.Timestamp.now(),
        };
        
        // Check for attack patterns
        const isAttack = await detectAttackPatterns(review, recentReviews);
        review.isAttackPattern = isAttack;
        
        if (isAttack) {
          attackPatternReviews.push(review);
        }
        
        // Correlate with fraud if user linked
        if (review.userLinked) {
          const correlations = await correlateWithFraud(review);
          if (correlations.length > 0) {
            review.isAttackPattern = true;
            attackPatternReviews.push(review);
          }
        }
        
        batch.set(reviewRef, review);
        batchCount++;
        
        // Add to recent reviews for pattern detection of next review
        recentReviews.unshift(review);
        if (recentReviews.length > 50) recentReviews.pop();
        
        // Commit batch every 500 operations
        if (batchCount >= 500) {
          await batch.commit();
          batchCount = 0;
        }
        
        result.imported++;
      } catch (error: any) {
        result.failed++;
        result.errors?.push(`Review ${reviewData.externalId || 'unknown'}: ${error.message}`);
      }
    }
    
    // Commit remaining operations
    if (batchCount > 0) {
      await batch.commit();
    }
    
    // Log audit event
    await auditLog({
      eventType: 'STORE_REVIEWS_IMPORTED',
      userId: request.importedBy,
      resource: 'storeReviewsMirror',
      action: 'IMPORT',
      metadata: {
        platform: request.platform,
        imported: result.imported,
        failed: result.failed,
        attackPatternsDetected: attackPatternReviews.length,
      },
    });
    
    // If attack patterns detected, create defense event
    if (attackPatternReviews.length >= 3) {
      const { createDefenseEvent } = await import('./pack429-review-defense-engine');
      
      const eventId = await createDefenseEvent({
        type: 'BOT_ATTACK',
        platform: request.platform,
        region: 'MULTIPLE',
        severity: attackPatternReviews.length >= 10 ? 'CRITICAL' : 'HIGH',
        triggerSource: 'REVIEWS',
        description: `Detected ${attackPatternReviews.length} reviews with attack patterns during import`,
        metadata: {
          affectedReviews: attackPatternReviews.length,
          detectedPatterns: ['MULTIPLE'],
        },
      });
      
      result.eventId = eventId;
      
      // Notify ops
      await notifyOps({
        title: '⚠️ Attack Pattern Detected',
        message: `Detected ${attackPatternReviews.length} suspicious reviews during import`,
        priority: 'HIGH',
        link: `/admin/store-defense/event/${eventId}`,
      });
    }
    
    return result;
  } catch (error: any) {
    console.error('Error importing reviews:', error);
    result.success = false;
    result.errors?.push(`Import failed: ${error.message}`);
    return result;
  }
}

// ============================================================================
// WEBHOOK HANDLER (FUTURE)
// ============================================================================

/**
 * Placeholder for future App Store/Google Play webhook integration
 * When stores provide webhook APIs, implement here
 */
export async function handleStoreWebhook(
  platform: Platform,
  webhookData: any
): Promise<void> {
  console.log('Store webhook handler (not yet implemented)', platform, webhookData);
  
  // TODO: When App Store Connect API or Google Play Developer API
  // provides webhook support, implement real-time review syncing here
}

// ============================================================================
// MANUAL REVIEW QUERY
// ============================================================================

export async function getRecentReviews(
  platform?: Platform,
  limit: number = 50
): Promise<StoreReviewMirror[]> {
  let query = db
    .collection('storeReviewsMirror')
    .orderBy('createdAt', 'desc')
    .limit(limit);
  
  if (platform) {
    query = query.where('platform', '==', platform) as any;
  }
  
  const snapshot = await query.get();
  const reviews: StoreReviewMirror[] = [];
  
  snapshot.forEach(doc => {
    reviews.push(doc.data() as StoreReviewMirror);
  });
  
  return reviews;
}

export async function getAttackPatternReviews(
  platform?: Platform,
  limit: number = 100
): Promise<StoreReviewMirror[]> {
  let query = db
    .collection('storeReviewsMirror')
    .where('isAttackPattern', '==', true)
    .orderBy('createdAt', 'desc')
    .limit(limit);
  
  if (platform) {
    query = query.where('platform', '==', platform) as any;
  }
  
  const snapshot = await query.get();
  const reviews: StoreReviewMirror[] = [];
  
  snapshot.forEach(doc => {
    reviews.push(doc.data() as StoreReviewMirror);
  });
  
  return reviews;
}
