/**
 * PACK 411 — Store Reviews Ingestion Module
 * Ingests and processes reviews from Google Play and Apple App Store
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  StoreReview,
  StoreType,
  ReviewTag,
  DEFAULT_TAG_PATTERNS,
  ReviewTagPattern,
} from '../../shared/types/pack411-reviews';

const db = admin.firestore();

/**
 * Tag a review based on NLP patterns
 */
export function tagReview(reviewText: string): ReviewTag[] {
  const tags: ReviewTag[] = [];
  const lowerText = reviewText.toLowerCase();

  for (const pattern of DEFAULT_TAG_PATTERNS) {
    const hasKeyword = pattern.keywords.some((keyword) =>
      lowerText.includes(keyword.toLowerCase())
    );
    if (hasKeyword) {
      tags.push(pattern.tag);
    }
  }

  return Array.from(new Set(tags)); // Remove duplicates
}

/**
 * Check if review contains safety-critical content
 */
export function isSafetyCritical(tags: ReviewTag[]): boolean {
  const criticalTags: ReviewTag[] = [
    'SCAM',
    'FRAUD',
    'VIOLENCE',
    'HARASSMENT',
    'UNDERAGE',
    'MINORS',
    'SELF_HARM',
    'THREATS',
  ];
  return tags.some((tag) => criticalTags.includes(tag));
}

/**
 * Normalize and deduplicate a store review
 */
async function processReview(
  rawReview: any,
  store: StoreType,
  source: 'STORE_SCRAPE' | 'IN_APP_PROMPT' | 'SUPPORT_PORTAL'
): Promise<StoreReview> {
  const reviewText = `${rawReview.title || ''} ${rawReview.body || ''}`;
  const tags = tagReview(reviewText);

  const review: StoreReview = {
    id: rawReview.id,
    store,
    appVersion: rawReview.appVersion || 'unknown',
    rating: rawReview.rating,
    title: rawReview.title,
    body: rawReview.body,
    language: rawReview.language || 'en',
    country: rawReview.country || 'unknown',
    userPseudoId: rawReview.userPseudoId,
    createdAt: rawReview.createdAt || new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    source,
    status: 'NEW',
    tags,
    metadata: {
      deviceModel: rawReview.deviceModel,
      osVersion: rawReview.osVersion,
      reply: rawReview.reply,
      repliedAt: rawReview.repliedAt,
    },
  };

  return review;
}

/**
 * Create support ticket for low-rated or critical reviews
 */
async function createSupportTicketIfNeeded(review: StoreReview): Promise<string | undefined> {
  // Only create tickets for low ratings or safety-critical content
  if (review.rating > 3 && !isSafetyCritical(review.tags)) {
    return undefined;
  }

  const ticketData = {
    source: 'STORE_REVIEW',
    category: isSafetyCritical(review.tags) ? 'SAFETY_CRITICAL' : 'APP_QUALITY',
    subject: `Store Review: ${review.rating}★ - ${review.title || 'No title'}`,
    description: review.body || 'No description',
    userId: review.linkedUserId,
    metadata: {
      storeReviewId: review.id,
      store: review.store,
      appVersion: review.appVersion,
      rating: review.rating,
      tags: review.tags,
    },
    priority: isSafetyCritical(review.tags) ? 'CRITICAL' : 'HIGH',
    status: 'NEW',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const ticketRef = await db.collection('supportTickets').add(ticketData);
  
  // Log to PACK 296 audit
  await db.collection('auditLogs').add({
    eventType: 'SUPPORT_TICKET_CREATED_FROM_REVIEW',
    entityType: 'SUPPORT_TICKET',
    entityId: ticketRef.id,
    metadata: {
      storeReviewId: review.id,
      store: review.store,
      rating: review.rating,
      tags: review.tags,
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return ticketRef.id;
}

/**
 * Create risk case for safety-critical reviews
 */
async function createRiskCaseIfNeeded(review: StoreReview): Promise<string | undefined> {
  if (!isSafetyCritical(review.tags)) {
    return undefined;
  }

  const riskCaseData = {
    caseType: 'STORE_REVIEW_SAFETY',
    severity: 'HIGH',
    source: 'PACK_411_REVIEW_INGESTION',
    status: 'NEW',
    metadata: {
      storeReviewId: review.id,
      store: review.store,
      appVersion: review.appVersion,
      rating: review.rating,
      tags: review.tags,
      reviewText: review.body,
      country: review.country,
    },
    userId: review.linkedUserId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const caseRef = await db.collection('riskCases').add(riskCaseData);

  // Log analytics event (PACK 410)
  await db.collection('analyticsEvents').add({
    eventType: 'SAFETY_CRITICAL_REVIEW',
    userId: review.linkedUserId,
    metadata: {
      storeReviewId: review.id,
      riskCaseId: caseRef.id,
      store: review.store,
      tags: review.tags,
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return caseRef.id;
}

/**
 * Log analytics event for review ingestion (PACK 410)
 */
async function logAnalyticsEvent(review: StoreReview): Promise<void> {
  await db.collection('analyticsEvents').add({
    eventType: 'STORE_REVIEW_INGESTED',
    userId: review.linkedUserId,
    metadata: {
      storeReviewId: review.id,
      store: review.store,
      rating: review.rating,
      language: review.language,
      country: review.country,
      tags: review.tags,
      appVersion: review.appVersion,
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Import Google Play reviews
 * Scheduled function or webhook-driven
 */
export const pack411_importStoreReviewsGoogle = functions
  .runWith({ 
    timeoutSeconds: 540,
    memory: '1GB' 
  })
  .https.onRequest(async (req, res) => {
    try {
      // Verify admin/service account auth
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).send('Unauthorized');
        return;
      }

      const rawReviews = req.body.reviews || [];
      const results = {
        imported: 0,
        updated: 0,
        errors: 0,
      };

      for (const rawReview of rawReviews) {
        try {
          const review = await processReview(rawReview, 'GOOGLE_PLAY', 'STORE_SCRAPE');

          // Check if review already exists
          const existingReviewRef = db.collection('storeReviews').doc(review.id);
          const existingReview = await existingReviewRef.get();

          if (existingReview.exists) {
            // Update lastSeenAt
            await existingReviewRef.update({
              lastSeenAt: review.lastSeenAt,
              metadata: review.metadata,
            });
            results.updated++;
          } else {
            // Create new review
            // Check for support ticket and risk case needs
            const ticketId = await createSupportTicketIfNeeded(review);
            if (ticketId) {
              review.linkedSupportTicketId = ticketId;
            }

            const riskCaseId = await createRiskCaseIfNeeded(review);
            if (riskCaseId) {
              review.linkedRiskCaseId = riskCaseId;
            }

            await existingReviewRef.set(review);
            await logAnalyticsEvent(review);
            results.imported++;
          }
        } catch (error) {
          console.error('Error processing review:', error);
          results.errors++;
        }
      }

      res.status(200).json(results);
    } catch (error) {
      console.error('Error importing Google Play reviews:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

/**
 * Import Apple App Store reviews
 * Scheduled function or webhook-driven
 */
export const pack411_importStoreReviewsApple = functions
  .runWith({ 
    timeoutSeconds: 540,
    memory: '1GB' 
  })
  .https.onRequest(async (req, res) => {
    try {
      // Verify admin/service account auth
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).send('Unauthorized');
        return;
      }

      const rawReviews = req.body.reviews || [];
      const results = {
        imported: 0,
        updated: 0,
        errors: 0,
      };

      for (const rawReview of rawReviews) {
        try {
          const review = await processReview(rawReview, 'APPLE_APP_STORE', 'STORE_SCRAPE');

          // Check if review already exists
          const existingReviewRef = db.collection('storeReviews').doc(review.id);
          const existingReview = await existingReviewRef.get();

          if (existingReview.exists) {
            // Update lastSeenAt
            await existingReviewRef.update({
              lastSeenAt: review.lastSeenAt,
              metadata: review.metadata,
            });
            results.updated++;
          } else {
            // Create new review
            // Check for support ticket and risk case needs
            const ticketId = await createSupportTicketIfNeeded(review);
            if (ticketId) {
              review.linkedSupportTicketId = ticketId;
            }

            const riskCaseId = await createRiskCaseIfNeeded(review);
            if (riskCaseId) {
              review.linkedRiskCaseId = riskCaseId;
            }

            await existingReviewRef.set(review);
            await logAnalyticsEvent(review);
            results.imported++;
          }
        } catch (error) {
          console.error('Error processing review:', error);
          results.errors++;
        }
      }

      res.status(200).json(results);
    } catch (error) {
      console.error('Error importing Apple App Store reviews:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

/**
 * Helper: Get review statistics for a time period
 */
export async function getReviewStats(
  store: StoreType,
  startDate: Date,
  endDate: Date,
  country?: string
): Promise<{
  totalReviews: number;
  avgRating: number;
  ratingDistribution: Record<number, number>;
}> {
  let query: FirebaseFirestore.Query = db
    .collection('storeReviews')
    .where('store', '==', store)
    .where('createdAt', '>=', startDate.toISOString())
    .where('createdAt', '<=', endDate.toISOString());

  if (country) {
    query = query.where('country', '==', country);
  }

  const snapshot = await query.get();
  const reviews = snapshot.docs.map((doc) => doc.data() as StoreReview);

  const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalRating = 0;

  reviews.forEach((review) => {
    ratingDistribution[review.rating]++;
    totalRating += review.rating;
  });

  return {
    totalReviews: reviews.length,
    avgRating: reviews.length > 0 ? totalRating / reviews.length : 0,
    ratingDistribution,
  };
}
