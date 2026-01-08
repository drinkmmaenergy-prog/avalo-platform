/**
 * PACK 387: Global PR, Reputation Intelligence & Crisis Response Engine
 * Review & Store Crisis Shield (Integration with PACK 384)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Store Crisis Shield - prevents review requests during crises
 */
export const pack387_storeCrisisShield = functions.https.onCall(
  async (
    data: {
      incidentId: string;
      active: boolean;
      geo?: string;
      suppressReviewPrompts?: boolean;
      suppressRatingRequests?: boolean;
    },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      if (data.active) {
        // Activate shield
        const shield = {
          incidentId: data.incidentId,
          active: true,
          suppressReviewPrompts: data.suppressReviewPrompts ?? true,
          suppressRatingRequests: data.suppressRatingRequests ?? true,
          geo: data.geo || 'GLOBAL',
          activatedAt: admin.firestore.Timestamp.now(),
          activatedBy: context.auth.uid,
        };

        const shieldRef = await db.collection('storeCrisisShields').add(shield);

        // Log activation
        await db.collection('crisisResponseLogs').add({
          incidentId: data.incidentId,
          actionType: 'STORE_SHIELD_ACTIVATED',
          performedBy: context.auth.uid,
          timestamp: admin.firestore.Timestamp.now(),
          metadata: { shieldId: shieldRef.id, geo: data.geo },
        });

        return { success: true, shieldId: shieldRef.id };
      } else {
        // Deactivate shields for this incident
        const shields = await db
          .collection('storeCrisisShields')
          .where('incidentId', '==', data.incidentId)
          .where('active', '==', true)
          .get();

        const deactivatePromises = shields.docs.map(doc =>
          doc.ref.update({
            active: false,
            deactivatedAt: admin.firestore.Timestamp.now(),
            deactivatedBy: context.auth.uid,
          })
        );

        await Promise.all(deactivatePromises);

        // Log deactivation
        await db.collection('crisisResponseLogs').add({
          incidentId: data.incidentId,
          actionType: 'STORE_SHIELD_DEACTIVATED',
          performedBy: context.auth.uid,
          timestamp: admin.firestore.Timestamp.now(),
          metadata: { shieldCount: shields.size },
        });

        return { success: true, deactivatedCount: shields.size };
      }
    } catch (error: any) {
      console.error('Error managing store crisis shield:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Check if review prompts should be suppressed for a user
 */
export const pack387_shouldSuppressReviewPrompt = functions.https.onCall(
  async (data: { userId: string; geo?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      // Check for active global shields
      const globalShields = await db
        .collection('storeCrisisShields')
        .where('active', '==', true)
        .where('geo', '==', 'GLOBAL')
        .where('suppressReviewPrompts', '==', true)
        .get();

      if (globalShields.size > 0) {
        return { suppress: true, reason: 'Global crisis shield active' };
      }

      // Check for geo-specific shields
      if (data.geo) {
        const geoShields = await db
          .collection('storeCrisisShields')
          .where('active', '==', true)
          .where('geo', '==', data.geo)
          .where('suppressReviewPrompts', '==', true)
          .get();

        if (geoShields.size > 0) {
          return { suppress: true, reason: `Crisis shield active in ${data.geo}` };
        }
      }

      return { suppress: false };
    } catch (error: any) {
      console.error('Error checking review prompt suppression:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Detect mass negative review clustering
 */
export const pack387_detectNegativeReviewClustering = functions.firestore
  .document('appStoreReviews/{reviewId}')
  .onCreate(async (snapshot, context) => {
    const review = snapshot.data();

    // Only process negative reviews (rating < 3)
    if (review.rating >= 3) {
      return null;
    }

    try {
      const now = admin.firestore.Timestamp.now();
      const oneHourAgo = new admin.firestore.Timestamp(now.seconds - 3600, now.nanoseconds);

      // Count negative reviews in last hour
      const recentNegative = await db
        .collection('appStoreReviews')
        .where('timestamp', '>=', oneHourAgo)
        .where('rating', '<', 3)
        .get();

      console.log(`${recentNegative.size} negative reviews in last hour`);

      // Alert if clustering detected (>20 negative reviews/hour)
      if (recentNegative.size > 20) {
        console.log('🚨 NEGATIVE REVIEW CLUSTERING DETECTED');

        // Check if incident already exists
        const existingIncidents = await db
          .collection('prIncidents')
          .where('status', 'in', ['OPEN', 'ESCALATED'])
          .where('topic', '==', 'storeReviews')
          .get();

        if (existingIncidents.empty) {
          // Create new incident
          await db.collection('prIncidents').add({
            title: 'Negative Review Clustering Detected',
            description: `${recentNegative.size} negative app store reviews received in last hour`,
            status: 'OPEN',
            threatLevel: 'HIGH',
            topic: 'storeReviews',
            publicVisibility: 'HIGH',
            legalExposure: false,
            createdAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now(),
          });
        }
      }

      return null;
    } catch (error) {
      console.error('Error detecting review clustering:', error);
      return null;
    }
  });

/**
 * Store reply macros for common crisis scenarios
 */
export const pack387_getStoreReplyMacro = functions.https.onCall(
  async (data: { topic: 'safety' | 'fraud' | 'billing' | 'moderation' }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const macros = {
      safety: {
        title: 'Safety Response',
        content: `Thank you for bringing this to our attention. User safety is our top priority. We've escalated your concern to our safety team who will investigate immediately. If you need immediate assistance, please contact our 24/7 support at support@avalo.app.`,
      },
      fraud: {
        title: 'Fraud Allegation Response',
        content: `We take fraud allegations very seriously. Our security team investigates all reports thoroughly. If you've experienced unauthorized charges, please contact our billing support immediately at billing@avalo.app. We're committed to protecting our community.`,
      },
      billing: {
        title: 'Billing Issue Response',
        content: `We understand your frustration with the billing issue. Our billing team is here to help resolve this quickly. Please reach out to billing@avalo.app with your account details, and we'll work to resolve this within 24 hours.`,
      },
      moderation: {
        title: 'Content Moderation Response',
        content: `Thank you for your feedback. Our moderation team works hard to maintain a safe and positive environment. If you believe content was incorrectly moderated, please contact appeals@avalo.app with details. We review all appeals carefully.`,
      },
    };

    return macros[data.topic] || null;
  }
);

/**
 * Analyze app store rating trends
 */
export const pack387_analyzeRatingTrends = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async context => {
    console.log('Analyzing app store rating trends...');

    try {
      const now = admin.firestore.Timestamp.now();
      const yesterday = new admin.firestore.Timestamp(now.seconds - 86400, now.nanoseconds);
      const weekAgo = new admin.firestore.Timestamp(now.seconds - 604800, now.nanoseconds);

      // Get reviews from last 24 hours
      const recentReviews = await db
        .collection('appStoreReviews')
        .where('timestamp', '>=', yesterday)
        .get();

      if (recentReviews.size < 10) {
        console.log('Not enough recent reviews for analysis');
        return null;
      }

      const recentAvg =
        recentReviews.docs.reduce((sum, doc) => sum + doc.data().rating, 0) /
        recentReviews.size;

      // Get reviews from previous week
      const historicalReviews = await db
        .collection('appStoreReviews')
        .where('timestamp', '>=', weekAgo)
        .where('timestamp', '<', yesterday)
        .get();

      if (historicalReviews.size < 10) {
        console.log('Not enough historical data');
        return null;
      }

      const historicalAvg =
        historicalReviews.docs.reduce((sum, doc) => sum + doc.data().rating, 0) /
        historicalReviews.size;

      const drop = historicalAvg - recentAvg;

      console.log(
        `Rating trend: Historical ${historicalAvg.toFixed(2)} → Recent ${recentAvg.toFixed(2)} (${drop > 0 ? '-' : '+'}${Math.abs(drop).toFixed(2)})`
      );

      // Alert if significant drop
      if (drop > 0.5) {
        console.log('⚠️  Significant rating drop detected');

        // Check for existing incident
        const existingIncidents = await db
          .collection('prIncidents')
          .where('status', 'in', ['OPEN', 'ESCALATED'])
          .where('topic', '==', 'storeRating')
          .get();

        if (existingIncidents.empty) {
          await db.collection('prIncidents').add({
            title: 'App Store Rating Drop',
            description: `Average rating dropped ${drop.toFixed(2)} stars in last 24 hours (from ${historicalAvg.toFixed(2)} to ${recentAvg.toFixed(2)})`,
            status: 'OPEN',
            threatLevel: drop > 1.0 ? 'CRITICAL' : 'HIGH',
            topic: 'storeRating',
            publicVisibility: 'CRITICAL',
            legalExposure: false,
            createdAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now(),
            metadata: {
              recentAvg,
              historicalAvg,
              drop,
              recentReviewCount: recentReviews.size,
            },
          });
        }
      }

      return null;
    } catch (error) {
      console.error('Error analyzing rating trends:', error);
      return null;
    }
  });
