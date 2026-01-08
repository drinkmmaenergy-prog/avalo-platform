/**
 * PACK 368 — ASO & STORE OPS SYNC
 * 
 * Automated monitoring of:
 * - Keyword rank shifts
 * - Competitor movement
 * - Review velocity
 * - Uninstall spikes
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ═══════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════

interface ASOMetric {
  countryCode: string;
  keyword?: string;
  rank?: number;
  downloads?: number;
  reviews?: number;
  avgRating?: number;
  uninstalls?: number;
  timestamp: admin.firestore.Timestamp;
}

interface StoreAlert {
  type: 'RANK_DROP' | 'REVIEW_SPIKE' | 'RATING_DROP' | 'UNINSTALL_SPIKE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  data: any;
}

// ═══════════════════════════════════════════════════════════════
// 1️⃣ TRACK KEYWORD RANKINGS
// ═══════════════════════════════════════════════════════════════

export const pack368_trackKeywordRanks = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    try {
      // Get active countries
      const countries = await db.collection('geoLaunchPhases')
        .where('phase', 'in', ['SOFT', 'OPEN', 'SCALE'])
        .get();

      const trackedKeywords = [
        'dating app',
        'meet people',
        'social network',
        'video chat',
        'make friends'
      ];

      for (const country of countries.docs) {
        const countryCode = country.id;

        for (const keyword of trackedKeywords) {
          // In production, this would call actual App Store/Play Store APIs
          const currentRank = await fetchKeywordRank(countryCode, keyword);
          
          // Get previous rank
          const previousMetric = await db.collection('asoMetrics')
            .where('countryCode', '==', countryCode)
            .where('keyword', '==', keyword)
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();

          const previousRank = previousMetric.empty ? null : previousMetric.docs[0].data().rank;

          // Save current metric
          await db.collection('asoMetrics').add({
            type: 'KEYWORD_RANK',
            countryCode,
            keyword,
            rank: currentRank,
            previousRank,
            rankChange: previousRank ? previousRank - currentRank : 0,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });

          // Check for significant drops
          if (previousRank && currentRank > previousRank + 10) {
            await createASOAlert('RANK_DROP', 'MEDIUM', {
              countryCode,
              keyword,
              previousRank,
              currentRank,
              drop: currentRank - previousRank
            });
          }
        }
      }

      console.log(`Tracked keyword ranks for ${countries.size} countries`);
      return null;

    } catch (error) {
      console.error('Track keyword ranks error:', error);
      throw error;
    }
  });

// ═══════════════════════════════════════════════════════════════
// 2️⃣ MONITOR COMPETITOR MOVEMENT
// ═══════════════════════════════════════════════════════════════

export const pack368_trackCompetitors = functions.pubsub
  .schedule('every 12 hours')
  .onRun(async (context) => {
    try {
      const competitors = [
        { id: 'tinder', name: 'Tinder' },
        { id: 'bumble', name: 'Bumble' },
        { id: 'hinge', name: 'Hinge' }
      ];

      const countries = await db.collection('geoLaunchPhases')
        .where('phase', 'in', ['OPEN', 'SCALE'])
        .get();

      for (const country of countries.docs) {
        const countryCode = country.id;

        for (const competitor of competitors) {
          // Fetch competitor metrics
          const metrics = await fetchCompetitorMetrics(countryCode, competitor.id);

          await db.collection('asoMetrics').add({
            type: 'COMPETITOR_TRACKING',
            countryCode,
            competitorId: competitor.id,
            competitorName: competitor.name,
            rank: metrics.rank,
            rating: metrics.rating,
            reviews: metrics.reviews,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });

          // Alert if competitor gains significant advantage
          if (metrics.rank < 3) {
            await createASOAlert('COMPETITOR_SURGE', 'MEDIUM', {
              countryCode,
              competitor: competitor.name,
              rank: metrics.rank
            });
          }
        }
      }

      console.log(`Tracked competitors for ${countries.size} countries`);
      return null;

    } catch (error) {
      console.error('Track competitors error:', error);
      throw error;
    }
  });

// ═══════════════════════════════════════════════════════════════
// 3️⃣ MONITOR REVIEW VELOCITY
// ═══════════════════════════════════════════════════════════════

export const pack368_trackReviewVelocity = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    try {
      const countries = await db.collection('geoLaunchPhases')
        .where('phase', 'in', ['SOFT', 'OPEN', 'SCALE'])
        .get();

      for (const country of countries.docs) {
        const countryCode = country.id;

        // Fetch review metrics
        const reviewMetrics = await fetchReviewMetrics(countryCode);

        // Save metrics
        await db.collection('asoMetrics').add({
          type: 'REVIEW_VELOCITY',
          countryCode,
          newReviews: reviewMetrics.newReviews,
          avgRating: reviewMetrics.avgRating,
          positiveCount: reviewMetrics.positiveCount,
          negativeCount: reviewMetrics.negativeCount,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // Check for review storms (fake reviews)
        if (reviewMetrics.newReviews > 100) { // per hour
          await createASOAlert('REVIEW_SPIKE', 'HIGH', {
            countryCode,
            newReviews: reviewMetrics.newReviews,
            suspectedFake: true
          });

          // Trigger PACK 367 Defense
          await triggerStoreDefense(countryCode, 'REVIEW_STORM', reviewMetrics);
        }

        // Check for rating drops
        const previousMetric = await db.collection('asoMetrics')
          .where('countryCode', '==', countryCode)
          .where('type', '==', 'REVIEW_VELOCITY')
          .orderBy('timestamp', 'desc')
          .limit(1)
          .get();

        if (!previousMetric.empty) {
          const prevRating = previousMetric.docs[0].data().avgRating;
          if (prevRating - reviewMetrics.avgRating > 0.5) {
            await createASOAlert('RATING_DROP', 'HIGH', {
              countryCode,
              previousRating: prevRating,
              currentRating: reviewMetrics.avgRating,
              drop: prevRating - reviewMetrics.avgRating
            });

            // Trigger PACK 367 Defense
            await triggerStoreDefense(countryCode, 'RATING_ATTACK', reviewMetrics);
          }
        }
      }

      console.log(`Tracked review velocity for ${countries.size} countries`);
      return null;

    } catch (error) {
      console.error('Track review velocity error:', error);
      throw error;
    }
  });

// ═══════════════════════════════════════════════════════════════
// 4️⃣ MONITOR UNINSTALL SPIKES
// ═══════════════════════════════════════════════════════════════

export const pack368_trackUninstalls = functions.pubsub
  .schedule('every 2 hours')
  .onRun(async (context) => {
    try {
      const countries = await db.collection('geoLaunchPhases')
        .where('phase', 'in', ['SOFT', 'OPEN', 'SCALE'])
        .get();

      for (const country of countries.docs) {
        const countryCode = country.id;

        // Calculate uninstall rate
        const last24h = new Date(Date.now() - 86400000);
        
        const installs = await db.collection('uaInstalls')
          .where('countryCode', '==', countryCode)
          .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(last24h))
          .count()
          .get();

        // In production, get actual uninstall data from analytics
        const uninstallRate = await fetchUninstallRate(countryCode);

        // Save metric
        await db.collection('asoMetrics').add({
          type: 'UNINSTALL_RATE',
          countryCode,
          installs: installs.data().count,
          uninstalls: Math.floor(installs.data().count * uninstallRate),
          uninstallRate,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // Check for spikes
        if (uninstallRate > 0.5) { // 50% uninstall rate
          await createASOAlert('UNINSTALL_SPIKE', 'CRITICAL', {
            countryCode,
            uninstallRate,
            installs: installs.data().count
          });

          // Trigger PACK 301A churn detection
          await triggerChurnAnalysis(countryCode, uninstallRate);

          // Consider pausing country
          await db.collection('geoLaunchPhases').doc(countryCode).update({
            phase: 'SOFT',
            pauseReason: 'HIGH_UNINSTALL_RATE',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }

      console.log(`Tracked uninstalls for ${countries.size} countries`);
      return null;

    } catch (error) {
      console.error('Track uninstalls error:', error);
      throw error;
    }
  });

// ═══════════════════════════════════════════════════════════════
// 5️⃣ DAILY DASHBOARD UPDATE
// ═══════════════════════════════════════════════════════════════

export const pack368_updateDashboard = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async (context) => {
    try {
      const countries = await db.collection('geoLaunchPhases').get();

      const dashboardData: any = {
        totalCountries: countries.size,
        byPhase: { CLOSED: 0, SOFT: 0, OPEN: 0, SCALE: 0 },
        totalInstalls: 0,
        totalRevenue: 0,
        totalSpent: 0,
        avgCPI: 0,
        avgROAS: 0,
        activeCampaigns: 0,
        activeAlerts: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Aggregate by phase
      for (const country of countries.docs) {
        const phase = country.data().phase;
        dashboardData.byPhase[phase]++;
      }

      // Get install totals
      const installs = await db.collection('uaInstalls').count().get();
      dashboardData.totalInstalls = installs.data().count;

      // Get campaign metrics
      const campaigns = await db.collection('uaCampaigns')
        .where('status', '==', 'ACTIVE')
        .get();

      dashboardData.activeCampaigns = campaigns.size;

      let totalSpent = 0;
      let totalRevenue = 0;
      let totalInstallCount = 0;

      for (const campaign of campaigns.docs) {
        const data = campaign.data();
        totalSpent += data.spent || 0;
        totalRevenue += data.revenue || 0;
        totalInstallCount += data.installs || 0;
      }

      dashboardData.totalSpent = totalSpent;
      dashboardData.totalRevenue = totalRevenue;
      dashboardData.avgCPI = totalInstallCount > 0 ? totalSpent / totalInstallCount : 0;
      dashboardData.avgROAS = totalSpent > 0 ? totalRevenue / totalSpent : 0;

      // Get active alerts
      const alerts = await db.collection('launchAlerts')
        .where('acknowledged', '==', false)
        .count()
        .get();

      dashboardData.activeAlerts = alerts.data().count;

      // Save dashboard data
      await db.collection('launchDashboard').doc('current').set(dashboardData);

      return null;

    } catch (error) {
      console.error('Update dashboard error:', error);
      throw error;
    }
  });

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function fetchKeywordRank(countryCode: string, keyword: string): Promise<number> {
  // Mock implementation - integrate with actual App Store Connect / Play Console API
  return Math.floor(Math.random() * 50) + 1;
}

async function fetchCompetitorMetrics(countryCode: string, competitorId: string) {
  // Mock implementation
  return {
    rank: Math.floor(Math.random() * 20) + 1,
    rating: 4.0 + Math.random(),
    reviews: Math.floor(Math.random() * 10000)
  };
}

async function fetchReviewMetrics(countryCode: string) {
  // Mock implementation
  return {
    newReviews: Math.floor(Math.random() * 50),
    avgRating: 4.0 + Math.random(),
    positiveCount: Math.floor(Math.random() * 40),
    negativeCount: Math.floor(Math.random() * 10)
  };
}

async function fetchUninstallRate(countryCode: string): Promise<number> {
  // Mock implementation - integrate with Firebase Analytics
  return Math.random() * 0.3; // 0-30%
}

async function createASOAlert(type: string, severity: string, data: any) {
  await db.collection('asoAlerts').add({
    type,
    severity,
    data,
    acknowledged: false,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function triggerStoreDefense(countryCode: string, type: string, data: any) {
  // Integrates with PACK 367 Store Defense
  await db.collection('storeDefenseIncidents').add({
    source: 'PACK_368_ASO',
    countryCode,
    type,
    data,
    status: 'ACTIVE',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function triggerChurnAnalysis(countryCode: string, uninstallRate: number) {
  // Integrates with PACK 301A Churn Detection
  await db.collection('churnAnalysisQueue').add({
    source: 'PACK_368_UNINSTALL',
    countryCode,
    uninstallRate,
    priority: 'HIGH',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}
