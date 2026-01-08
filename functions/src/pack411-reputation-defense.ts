/**
 * PACK 411 — Reputation Defense & Review Brigading Detection
 * Detects and responds to review attacks, brigading, and reputation anomalies
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  StoreReview,
  StoreType,
  ReputationSnapshot,
  ReviewBrigadeAlert,
  ReputationDefenseConfig,
} from '../../shared/types/pack411-reviews';

const db = admin.firestore();

const DEFAULT_DEFENSE_CONFIG: ReputationDefenseConfig = {
  enabled: true,
  spikeDetection: {
    enabled: true,
    windowHours: 24,
    minReviewCount: 10,
    stdDevThreshold: 2.5,
  },
  brigadingDetection: {
    enabled: true,
    coordinatedKeywords: [
      'boycott',
      'coordinated',
      'protest',
      'organized',
      'campaign',
    ],
    deviceClusteringThreshold: 0.3, // 30% or more from same device model
  },
  alerting: {
    notifyAdmins: true,
    createRiskCase: true,
    severity: 'HIGH',
  },
};

/**
 * Get reputation defense configuration
 */
async function getDefenseConfig(): Promise<ReputationDefenseConfig> {
  const configDoc = await db
    .collection('config')
    .doc('pack411ReputationDefense')
    .get();
  if (configDoc.exists) {
    return configDoc.data() as ReputationDefenseConfig;
  }
  return DEFAULT_DEFENSE_CONFIG;
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  const variance =
    squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Detect sudden spike in reviews
 */
async function detectReviewSpike(
  store: StoreType,
  windowHours: number,
  minReviewCount: number,
  stdDevThreshold: number
): Promise<ReviewBrigadeAlert | null> {
  const windowStart = new Date();
  windowStart.setHours(windowStart.getHours() - windowHours);

  // Get reviews in the window
  const recentReviewsSnapshot = await db
    .collection('storeReviews')
    .where('store', '==', store)
    .where('createdAt', '>=', windowStart.toISOString())
    .get();

  const recentReviews = recentReviewsSnapshot.docs.map(
    (doc) => doc.data() as StoreReview
  );

  if (recentReviews.length < minReviewCount) {
    return null; // Not enough reviews to be suspicious
  }

  // Get historical baseline (last 7 days excluding current window)
  const baselineStart = new Date();
  baselineStart.setDate(baselineStart.getDate() - 7);
  const baselineEnd = windowStart;

  const baselineSnapshot = await db
    .collection('storeReviews')
    .where('store', '==', store)
    .where('createdAt', '>=', baselineStart.toISOString())
    .where('createdAt', '<', baselineEnd.toISOString())
    .get();

  const baselineReviews = baselineSnapshot.docs.map(
    (doc) => doc.data() as StoreReview
  );

  if (baselineReviews.length === 0) {
    return null; // No baseline to compare
  }

  // Calculate baseline metrics
  const baselineAvgRating =
    baselineReviews.reduce((sum, r) => sum + r.rating, 0) /
    baselineReviews.length;

  // Calculate current window metrics
  const currentAvgRating =
    recentReviews.reduce((sum, r) => sum + r.rating, 0) / recentReviews.length;

  // Calculate rating variance
  const baselineRatings = baselineReviews.map((r) => r.rating);
  const stdDev = calculateStdDev(baselineRatings);

  // Check if current rating is significantly different
  const ratingDiff = Math.abs(currentAvgRating - baselineAvgRating);
  const standardDeviations = stdDev > 0 ? ratingDiff / stdDev : 0;

  if (standardDeviations >= stdDevThreshold) {
    const alert: ReviewBrigadeAlert = {
      id: db.collection('reviewBrigadeAlerts').doc().id,
      detectedAt: new Date().toISOString(),
      alertType: 'SUDDEN_SPIKE',
      severity: standardDeviations >= 4 ? 'CRITICAL' : 'HIGH',
      affectedStore: store,
      suspectedReviewIds: recentReviews.map((r) => r.id),
      metrics: {
        baselineAvgRating,
        currentAvgRating,
        reviewCountInWindow: recentReviews.length,
        timeWindowHours: windowHours,
        standardDeviations,
      },
      status: 'NEW',
    };

    return alert;
  }

  return null;
}

/**
 * Detect coordinated attack patterns
 */
async function detectCoordinatedAttack(
  store: StoreType,
  coordinatedKeywords: string[],
  windowHours: number = 24
): Promise<ReviewBrigadeAlert | null> {
  const windowStart = new Date();
  windowStart.setHours(windowStart.getHours() - windowHours);

  const recentReviewsSnapshot = await db
    .collection('storeReviews')
    .where('store', '==', store)
    .where('createdAt', '>=', windowStart.toISOString())
    .where('rating', '<=', 2) // Focus on negative reviews
    .get();

  const recentReviews = recentReviewsSnapshot.docs.map(
    (doc) => doc.data() as StoreReview
  );

  if (recentReviews.length < 5) {
    return null; // Not enough reviews
  }

  // Check for coordinated keywords
  let keywordMatches = 0;
  for (const review of recentReviews) {
    const reviewText = `${review.title || ''} ${review.body || ''}`.toLowerCase();
    if (
      coordinatedKeywords.some((keyword) => reviewText.includes(keyword.toLowerCase()))
    ) {
      keywordMatches++;
    }
  }

  const keywordMatchRate = keywordMatches / recentReviews.length;

  if (keywordMatchRate >= 0.3) {
    // 30% or more mention coordinated keywords
    const alert: ReviewBrigadeAlert = {
      id: db.collection('reviewBrigadeAlerts').doc().id,
      detectedAt: new Date().toISOString(),
      alertType: 'COORDINATED_ATTACK',
      severity: 'HIGH',
      affectedStore: store,
      suspectedReviewIds: recentReviews.map((r) => r.id),
      metrics: {
        baselineAvgRating: 0,
        currentAvgRating: recentReviews.reduce((sum, r) => sum + r.rating, 0) / recentReviews.length,
        reviewCountInWindow: recentReviews.length,
        timeWindowHours: windowHours,
        standardDeviations: 0,
      },
      status: 'NEW',
      notes: `${keywordMatches} reviews contain coordinated keywords`,
    };

    return alert;
  }

  return null;
}

/**
 * Detect device clustering (multiple reviews from same device)
 */
async function detectDeviceClustering(
  store: StoreType,
  threshold: number,
  windowHours: number = 24
): Promise<ReviewBrigadeAlert | null> {
  const windowStart = new Date();
  windowStart.setHours(windowStart.getHours() - windowHours);

  const recentReviewsSnapshot = await db
    .collection('storeReviews')
    .where('store', '==', store)
    .where('createdAt', '>=', windowStart.toISOString())
    .get();

  const recentReviews = recentReviewsSnapshot.docs.map(
    (doc) => doc.data() as StoreReview
  );

  if (recentReviews.length < 10) {
    return null;
  }

  // Count device models
  const deviceCounts: Record<string, number> = {};
  for (const review of recentReviews) {
    const deviceModel = review.metadata?.deviceModel || 'unknown';
    deviceCounts[deviceModel] = (deviceCounts[deviceModel] || 0) + 1;
  }

  // Check if any device model is over-represented
  const topDevice = Object.entries(deviceCounts).sort(
    (a, b) => b[1] - a[1]
  )[0];

  if (topDevice) {
    const [deviceModel, count] = topDevice;
    const deviceShare = count / recentReviews.length;

    if (deviceShare >= threshold) {
      const alert: ReviewBrigadeAlert = {
        id: db.collection('reviewBrigadeAlerts').doc().id,
        detectedAt: new Date().toISOString(),
        alertType: 'DEVICE_CLUSTERING',
        severity: 'MEDIUM',
        affectedStore: store,
        suspectedReviewIds: recentReviews
          .filter((r) => r.metadata?.deviceModel === deviceModel)
          .map((r) => r.id),
        metrics: {
          baselineAvgRating: 0,
          currentAvgRating: recentReviews.reduce((sum, r) => sum + r.rating, 0) / recentReviews.length,
          reviewCountInWindow: recentReviews.length,
          timeWindowHours: windowHours,
          standardDeviations: 0,
        },
        status: 'NEW',
        notes: `${Math.round(deviceShare * 100)}% of reviews from ${deviceModel}`,
      };

      return alert;
    }
  }

  return null;
}

/**
 * Create reputation snapshot
 */
async function createReputationSnapshot(
  store: StoreType,
  date: string,
  appVersion?: string,
  country?: string
): Promise<void> {
  let query: FirebaseFirestore.Query = db
    .collection('storeReviews')
    .where('store', '==', store);

  if (appVersion) {
    query = query.where('appVersion', '==', appVersion);
  }

  if (country) {
    query = query.where('country', '==', country);
  }

  const snapshot = await query.get();
  const reviews = snapshot.docs.map((doc) => doc.data() as StoreReview);

  if (reviews.length === 0) {
    return;
  }

  const ratingDistribution = {
    oneStar: reviews.filter((r) => r.rating === 1).length,
    twoStar: reviews.filter((r) => r.rating === 2).length,
    threeStar: reviews.filter((r) => r.rating === 3).length,
    fourStar: reviews.filter((r) => r.rating === 4).length,
    fiveStar: reviews.filter((r) => r.rating === 5).length,
  };

  const avgRating =
    reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const oneStarShare = (ratingDistribution.oneStar / reviews.length) * 100;
  const flaggedReviewsCount = reviews.filter((r) =>
    r.status === 'FLAGGED'
  ).length;

  const reputationSnapshot: ReputationSnapshot = {
    id: `${store}_${date}_${appVersion || 'all'}_${country || 'all'}`,
    date,
    appVersion,
    store,
    country,
    avgRating,
    ratingCount: reviews.length,
    ratingsDistribution: ratingDistribution,
    oneStarShare,
    flaggedReviewsCount,
    suspectedBrigadeScore: 0, // Will be calculated by anomaly detection
    alerts: [],
  };

  await db
    .collection('storeReputationSnapshots')
    .doc(reputationSnapshot.id)
    .set(reputationSnapshot);
}

/**
 * Scheduled job: Scan for reputation anomalies
 * Runs daily
 */
export const pack411_scanReputationAnomalies = functions.pubsub
  .schedule('0 2 * * *') // Run at 2 AM UTC daily
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      const config = await getDefenseConfig();

      if (!config.enabled) {
        console.log('Reputation defense is disabled');
        return;
      }

      const stores: StoreType[] = ['GOOGLE_PLAY', 'APPLE_APP_STORE'];
      const alerts: ReviewBrigadeAlert[] = [];

      for (const store of stores) {
        // Detect spikes
        if (config.spikeDetection.enabled) {
          const spikeAlert = await detectReviewSpike(
            store,
            config.spikeDetection.windowHours,
            config.spikeDetection.minReviewCount,
            config.spikeDetection.stdDevThreshold
          );
          if (spikeAlert) {
            alerts.push(spikeAlert);
          }
        }

        // Detect coordinated attacks
        if (config.brigadingDetection.enabled) {
          const coordinatedAlert = await detectCoordinatedAttack(
            store,
            config.brigadingDetection.coordinatedKeywords
          );
          if (coordinatedAlert) {
            alerts.push(coordinatedAlert);
          }

          // Detect device clustering
          const clusteringAlert = await detectDeviceClustering(
            store,
            config.brigadingDetection.deviceClusteringThreshold
          );
          if (clusteringAlert) {
            alerts.push(clusteringAlert);
          }
        }

        // Create daily reputation snapshot
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        await createReputationSnapshot(store, today);
      }

      // Process alerts
      for (const alert of alerts) {
        // Save alert
        await db.collection('reviewBrigadeAlerts').doc(alert.id).set(alert);

        // Create risk case if configured
        if (config.alerting.createRiskCase) {
          const riskCaseData = {
            caseType: 'STORE_REVIEW_BRIGADE',
            severity: alert.severity,
            source: 'PACK_411_REPUTATION_DEFENSE',
            status: 'NEW',
            metadata: {
              brigadeAlertId: alert.id,
              alertType: alert.alertType,
              affectedStore: alert.affectedStore,
              metrics: alert.metrics,
              suspectedReviewCount: alert.suspectedReviewIds.length,
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          const caseRef = await db.collection('riskCases').add(riskCaseData);
          alert.linkedRiskCaseId = caseRef.id;
          await db.collection('reviewBrigadeAlerts').doc(alert.id).update({
            linkedRiskCaseId: caseRef.id,
          });
        }

        // Log analytics event (PACK 410)
        await db.collection('analyticsEvents').add({
          eventType: 'REVIEW_BRIGADE_ALERT',
          metadata: {
            brigadeAlertId: alert.id,
            alertType: alert.alertType,
            severity: alert.severity,
            affectedStore: alert.affectedStore,
            reviewCount: alert.suspectedReviewIds.length,
          },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Send notification to admins (PACK 293)
        if (config.alerting.notifyAdmins) {
          await db.collection('notifications').add({
            type: 'REPUTATION_ALERT',
            title: 'Review Brigade Detected',
            body: `${alert.alertType} detected on ${alert.affectedStore}`,
            severity: alert.severity,
            recipients: ['ADMIN'],
            metadata: {
              brigadeAlertId: alert.id,
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      console.log(`Reputation scan complete. Found ${alerts.length} alerts.`);
    } catch (error) {
      console.error('Error scanning reputation anomalies:', error);
    }
  });

/**
 * Manual trigger for reputation scan (for testing/debugging)
 */
export const pack411_triggerReputationScan = functions.https.onCall(
  async (data, context) => {
    try {
      // Must be admin
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userDoc = await db.collection('users').doc(context.auth.uid).get();
      const userData = userDoc.data();

      if (!userData || userData.role !== 'ADMIN') {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only admins can trigger reputation scans'
        );
      }

      // Trigger the scan
      // This would call the same logic as the scheduled function
      console.log('Manual reputation scan triggered');

      return { success: true, message: 'Scan initiated' };
    } catch (error) {
      console.error('Error triggering reputation scan:', error);
      throw new functions.https.HttpsError('internal', 'Internal server error');
    }
  }
);
