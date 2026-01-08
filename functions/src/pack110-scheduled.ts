/**
 * PACK 110 — Scheduled Jobs for Feedback Analytics
 * 
 * Nightly aggregation of feedback data for product insights.
 * 
 * CRITICAL CONSTRAINTS:
 * - Read-only analytics - no impact on user monetization
 * - Keyword extraction for sentiment analysis
 * - No public visibility of feedback data
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  ProductFeedbackInsights,
  UserFeedbackEvent,
  FEATURE_KEYS,
} from './pack110-types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format date as YYYY-MM-DD
 */
function formatDateYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Extract keywords from text using simple word frequency
 */
function extractKeywords(texts: string[], minLength: number = 4): string[] {
  // Common stop words to ignore
  const stopWords = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
    'is', 'was', 'are', 'been', 'has', 'had', 'were', 'can', 'could',
    'should', 'would', 'may', 'might', 'must', 'very', 'just', 'like',
    'really', 'also', 'more', 'some', 'only', 'than', 'so', 'too',
  ]);
  
  const wordCounts = new Map<string, number>();
  
  texts.forEach(text => {
    if (!text) return;
    
    // Extract words, convert to lowercase
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => 
        word.length >= minLength && 
        !stopWords.has(word) &&
        isNaN(Number(word)) // Exclude numbers
      );
    
    words.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });
  });
  
  // Sort by frequency and take top 20
  const sortedWords = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
  
  return sortedWords;
}

/**
 * Aggregate feedback for a specific feature or overall NPS
 */
async function aggregateFeedback(
  featureKey: string,
  periodDays: number = 30
): Promise<ProductFeedbackInsights | null> {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
    
    // Build query
    let query = db
      .collection('user_feedback_events')
      .where('createdAt', '>=', Timestamp.fromDate(startDate))
      .where('createdAt', '<=', Timestamp.fromDate(endDate));
    
    if (featureKey === 'overall') {
      // NPS feedback only
      query = query.where('eventType', '==', 'NPS') as any;
    } else {
      // Feature-specific feedback
      query = query
        .where('eventType', '==', 'FEATURE') as any;
      query = query.where('featureKey', '==', featureKey) as any;
    }
    
    const eventsSnapshot = await query.get();
    
    if (eventsSnapshot.empty) {
      logger.info(`No feedback found for ${featureKey} in the last ${periodDays} days`);
      return null;
    }
    
    // Aggregate metrics
    let totalScore = 0;
    let scoreCount = 0;
    const scoreHistogram: Record<number, number> = {};
    const languageCounts = new Map<string, number>();
    const regionCounts: Record<string, number> = {};
    const platformCounts: Record<string, number> = {};
    const negativeFeedbackTexts: string[] = [];
    const positiveFeedbackTexts: string[] = [];
    
    eventsSnapshot.forEach(doc => {
      const event = doc.data() as UserFeedbackEvent;
      
      // Score aggregation
      if (event.score !== undefined && event.score !== null) {
        totalScore += event.score;
        scoreCount++;
        scoreHistogram[event.score] = (scoreHistogram[event.score] || 0) + 1;
      }
      
      // Language tracking
      languageCounts.set(
        event.language,
        (languageCounts.get(event.language) || 0) + 1
      );
      
      // Region tracking
      if (event.region) {
        regionCounts[event.region] = (regionCounts[event.region] || 0) + 1;
      }
      
      // Platform tracking
      if (event.platform) {
        platformCounts[event.platform] = (platformCounts[event.platform] || 0) + 1;
      }
      
      // Sentiment-based text collection
      if (event.text) {
        if (featureKey === 'overall') {
          // NPS: 0-6 = detractors (negative), 7-8 = passive, 9-10 = promoters (positive)
          if (event.score !== undefined) {
            if (event.score <= 6) {
              negativeFeedbackTexts.push(event.text);
            } else if (event.score >= 9) {
              positiveFeedbackTexts.push(event.text);
            }
          }
        } else {
          // Feature: 1-2 = negative, 3 = neutral, 4-5 = positive
          if (event.score !== undefined) {
            if (event.score <= 2) {
              negativeFeedbackTexts.push(event.text);
            } else if (event.score >= 4) {
              positiveFeedbackTexts.push(event.text);
            }
          }
        }
      }
    });
    
    // Calculate average score
    const avgScore = scoreCount > 0 ? totalScore / scoreCount : 0;
    
    // Get top languages
    const topLanguages = Array.from(languageCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([lang]) => lang);
    
    // Extract keywords from feedback
    const negativeKeywords = extractKeywords(negativeFeedbackTexts);
    const positiveKeywords = extractKeywords(positiveFeedbackTexts);
    
    const insights: ProductFeedbackInsights = {
      featureKey,
      avgScore,
      scoreHistogram,
      totalResponses: eventsSnapshot.size,
      topLanguages,
      negativeKeywords,
      positiveKeywords,
      responsesByRegion: regionCounts,
      responsesByPlatform: platformCounts,
      periodStart: formatDateYMD(startDate),
      periodEnd: formatDateYMD(endDate),
      updatedAt: serverTimestamp(),
    };
    
    return insights;
  } catch (error: any) {
    logger.error(`Error aggregating feedback for ${featureKey}`, error);
    return null;
  }
}

// ============================================================================
// SCHEDULED JOB
// ============================================================================

/**
 * Aggregate user feedback nightly
 * Runs at 2 AM UTC daily
 */
export const aggregateUserFeedbackNightly = onSchedule(
  {
    schedule: '0 2 * * *', // 2 AM UTC daily
    timeZone: 'UTC',
    region: 'europe-west3',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (event) => {
    logger.info('Starting nightly feedback aggregation');
    
    try {
      const aggregationPromises: Promise<void>[] = [];
      
      // Aggregate overall NPS feedback
      aggregationPromises.push(
        (async () => {
          const insights = await aggregateFeedback('overall', 90); // 90-day window for NPS
          
          if (insights) {
            await db
              .collection('product_feedback_insights')
              .doc('overall')
              .set(insights);
            
            logger.info(`Aggregated NPS feedback: avg=${insights.avgScore.toFixed(2)}, responses=${insights.totalResponses}`);
          }
        })()
      );
      
      // Aggregate feature-specific feedback
      const featureKeys = Object.values(FEATURE_KEYS);
      
      for (const featureKey of featureKeys) {
        aggregationPromises.push(
          (async () => {
            const insights = await aggregateFeedback(featureKey, 30); // 30-day window for features
            
            if (insights) {
              await db
                .collection('product_feedback_insights')
                .doc(featureKey)
                .set(insights);
              
              logger.info(`Aggregated ${featureKey} feedback: avg=${insights.avgScore.toFixed(2)}, responses=${insights.totalResponses}`);
            }
          })()
        );
      }
      
      // Wait for all aggregations to complete
      await Promise.all(aggregationPromises);
      
      // Update last run timestamp
      await db
        .collection('system_status')
        .doc('feedback_aggregation')
        .set({
          lastRunAt: serverTimestamp(),
          status: 'success',
        });
      
      logger.info('Nightly feedback aggregation completed successfully');
    } catch (error: any) {
      logger.error('Error in nightly feedback aggregation', error);
      
      // Update status to indicate failure
      await db
        .collection('system_status')
        .doc('feedback_aggregation')
        .set({
          lastRunAt: serverTimestamp(),
          status: 'failed',
          error: error.message,
        });
      
      throw error;
    }
  }
);

/**
 * Clean up old feedback events (optional - keep last 12 months)
 * Runs weekly on Sundays at 3 AM UTC
 */
export const cleanupOldFeedback = onSchedule(
  {
    schedule: '0 3 * * 0', // 3 AM UTC on Sundays
    timeZone: 'UTC',
    region: 'europe-west3',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (event) => {
    logger.info('Starting old feedback cleanup');
    
    try {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      
      // Find old feedback events
      const oldEventsQuery = await db
        .collection('user_feedback_events')
        .where('createdAt', '<', Timestamp.fromDate(twelveMonthsAgo))
        .limit(500) // Process in batches
        .get();
      
      if (oldEventsQuery.empty) {
        logger.info('No old feedback events to clean up');
        return;
      }
      
      // Delete in batch
      const batch = db.batch();
      
      oldEventsQuery.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      
      logger.info(`Cleaned up ${oldEventsQuery.size} old feedback events`);
      
      // Update status
      await db
        .collection('system_status')
        .doc('feedback_cleanup')
        .set({
          lastRunAt: serverTimestamp(),
          deletedCount: oldEventsQuery.size,
          status: 'success',
        });
    } catch (error: any) {
      logger.error('Error cleaning up old feedback', error);
      
      await db
        .collection('system_status')
        .doc('feedback_cleanup')
        .set({
          lastRunAt: serverTimestamp(),
          status: 'failed',
          error: error.message,
        });
      
      throw error;
    }
  }
);