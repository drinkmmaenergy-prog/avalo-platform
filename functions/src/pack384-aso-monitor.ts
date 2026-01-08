/**
 * PACK 384 — App Store ASO Stability Engine
 * Monitors keyword rankings, uninstalls, crashes, and sentiment
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

interface ASOHealthMetrics {
  timestamp: admin.firestore.Timestamp;
  platform: 'ios' | 'android' | 'both';
  keywordRankings: Record<string, number>; // keyword -> rank
  averageRank: number;
  rankVolatility: number; // standard deviation
  dailyDownloads: number;
  dailyUninstalls: number;
  retentionRate: number; // %
  crashRate: number; // per 1000 sessions
  averageRating: number;
  totalReviews: number;
  reviewsPerDay: number;
  negativeReviewRate: number; // %
  sentimentScore: number; // -1 to 1
  conversionRate: number; // store page view to install %
  health: 'excellent' | 'good' | 'warning' | 'critical';
  alerts: string[];
}

interface KeywordRankingAlert {
  keyword: string;
  previousRank: number;
  currentRank: number;
  change: number;
  significance: 'major_drop' | 'minor_drop' | 'stable' | 'improvement';
  timestamp: admin.firestore.Timestamp;
}

/**
 * Monitor ASO health metrics
 */
export const monitorASOHealth = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const platform = data.platform || 'both';

  try {
    // Get current metrics from external sources or internal tracking
    const metrics: Partial<ASOHealthMetrics> = {
      timestamp: admin.firestore.Timestamp.now(),
      platform,
      keywordRankings: {},
      alerts: []
    };

    // Get download/install data
    const installsToday = await db.collection('appInstalls')
      .where('installedAt', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
      .get();
    metrics.dailyDownloads = installsToday.size;

    // Get uninstall data
    const uninstallsToday = await db.collection('appUninstalls')
      .where('uninstalledAt', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
      .get();
    metrics.dailyUninstalls = uninstallsToday.size;

    // Calculate retention
    const installs7DaysAgo = await db.collection('appInstalls')
      .where('installedAt', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 8 * 24 * 60 * 60 * 1000))
      .where('installedAt', '<', admin.firestore.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .get();
    
    const retained7Days = await db.collection('users')
      .where('installedAt', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 8 * 24 * 60 * 60 * 1000))
      .where('installedAt', '<', admin.firestore.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .where('lastActive', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
      .get();

    metrics.retentionRate = installs7DaysAgo.size > 0 
      ? (retained7Days.size / installs7DaysAgo.size) * 100 
      : 0;

    // Get crash data
    const crashesToday = await db.collection('crashReports')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
      .get();
    
    const sessionsToday = await db.collection('sessionLogs')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
      .get();

    metrics.crashRate = sessionsToday.size > 0 
      ? (crashesToday.size / sessionsToday.size) * 1000 
      : 0;

    // Get review data
    const reviewsToday = await db.collection('storeReviewSignals')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
      .get();
    metrics.reviewsPerDay = reviewsToday.size;

    let totalRating = 0;
    let negativeCount = 0;
    let sentimentSum = 0;

    reviewsToday.forEach(doc => {
      const data = doc.data();
      totalRating += data.rating || 0;
      if (data.rating <= 2) negativeCount++;
      sentimentSum += data.sentimentPolarity || 0;
    });

    metrics.averageRating = reviewsToday.size > 0 ? totalRating / reviewsToday.size : 0;
    metrics.negativeReviewRate = reviewsToday.size > 0 ? (negativeCount / reviewsToday.size) * 100 : 0;
    metrics.sentimentScore = reviewsToday.size > 0 ? sentimentSum / reviewsToday.size : 0;

    // Get total reviews
    const allReviews = await db.collection('storeReviewSignals').count().get();
    metrics.totalReviews = allReviews.data().count;

    // Get store page conversion
    const pageViewsToday = await db.collection('storePageViews')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
      .get();

    metrics.conversionRate = pageViewsToday.size > 0 
      ? (metrics.dailyDownloads / pageViewsToday.size) * 100 
      : 0;

    // Get keyword rankings (would typically come from external ASO tool)
    const keywordDoc = await db.collection('asoKeywords').doc('current').get();
    if (keywordDoc.exists) {
      metrics.keywordRankings = keywordDoc.data()?.rankings || {};
    }

    // Calculate average rank and volatility
    const ranks = Object.values(metrics.keywordRankings || {});
    if (ranks.length > 0) {
      metrics.averageRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
      
      const variance = ranks.reduce((sum, rank) => sum + Math.pow(rank - metrics.averageRank!, 2), 0) / ranks.length;
      metrics.rankVolatility = Math.sqrt(variance);
    }

    // Determine health status and generate alerts
    const alerts: string[] = [];
    let health: ASOHealthMetrics['health'] = 'excellent';

    // Check for critical issues
    if (metrics.crashRate! > 10) {
      alerts.push(`Critical: High crash rate (${metrics.crashRate!.toFixed(1)} per 1000 sessions)`);
      health = 'critical';
    }

    if (metrics.negativeReviewRate! > 50) {
      alerts.push(`Critical: ${metrics.negativeReviewRate!.toFixed(0)}% negative reviews in last 24h`);
      health = 'critical';
    }

    if (metrics.retentionRate! < 20) {
      alerts.push(`Critical: Low 7-day retention (${metrics.retentionRate!.toFixed(0)}%)`);
      if (health !== 'critical') health = 'critical';
    }

    // Check for warning issues
    if (metrics.dailyUninstalls > metrics.dailyDownloads! * 0.5) {
      alerts.push(`Warning: High uninstall rate (${metrics.dailyUninstalls} vs ${metrics.dailyDownloads} installs)`);
      if (health === 'excellent') health = 'warning';
    }

    if (metrics.conversionRate! < 10) {
      alerts.push(`Warning: Low store conversion rate (${metrics.conversionRate!.toFixed(1)}%)`);
      if (health === 'excellent') health = 'warning';
    }

    if (metrics.sentimentScore! < -0.3) {
      alerts.push(`Warning: Negative sentiment trend (${metrics.sentimentScore!.toFixed(2)})`);
      if (health === 'excellent') health = 'warning';
    }

    // Check keyword rank drops
    const previousMetricsSnapshot = await db.collection('asoHealthMetrics')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (!previousMetricsSnapshot.empty) {
      const previousMetrics = previousMetricsSnapshot.docs[0].data() as ASOHealthMetrics;
      
      for (const [keyword, currentRank] of Object.entries(metrics.keywordRankings || {})) {
        const previousRank = previousMetrics.keywordRankings?.[keyword];
        if (previousRank && currentRank > previousRank + 10) {
          alerts.push(`Keyword "${keyword}" dropped from #${previousRank} to #${currentRank}`);
          if (health === 'excellent') health = 'warning';
        }
      }
    }

    metrics.health = health;
    metrics.alerts = alerts;

    // Store metrics
    await db.collection('asoHealthMetrics').add(metrics as ASOHealthMetrics);

    // If critical, create incident
    if (health === 'critical') {
      await db.collection('asoIncidents').add({
        type: 'health_critical',
        metrics,
        timestamp: admin.firestore.Timestamp.now(),
        status: 'open',
        escalated: true
      });
    }

    return metrics;
  } catch (error) {
    console.error('Error monitoring ASO health:', error);
    throw new functions.https.HttpsError('internal', 'Failed to monitor ASO health');
  }
});

/**
 * Scheduled ASO health check
 */
export const scheduledASOHealthCheck = functions.pubsub.schedule('every 6 hours').onRun(async () => {
  try {
    const platforms: Array<'ios' | 'android'> = ['ios', 'android'];
    
    for (const platform of platforms) {
      await monitorASOHealth.run({
        data: { platform },
        auth: { token: { admin: true } } as any
      } as any, {} as any);
    }

    console.log('ASO health check completed');
  } catch (error) {
    console.error('Error in scheduled ASO health check:', error);
  }
});

/**
 * Detect crash-to-review correlation
 */
export const detectCrashReviewCorrelation = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  try {
    const windowDays = data.windowDays || 7;
    const windowStart = admin.firestore.Timestamp.fromMillis(
      Date.now() - windowDays * 24 * 60 * 60 * 1000
    );

    // Get crashes by day
    const crashesSnapshot = await db.collection('crashReports')
      .where('timestamp', '>=', windowStart)
      .orderBy('timestamp')
      .get();

    const crashesByDay = new Map<string, number>();
    crashesSnapshot.forEach(doc => {
      const date = new Date(doc.data().timestamp.toMillis()).toISOString().split('T')[0];
      crashesByDay.set(date, (crashesByDay.get(date) || 0) + 1);
    });

    // Get negative reviews by day
    const reviewsSnapshot = await db.collection('storeReviewSignals')
      .where('timestamp', '>=', windowStart)
      .where('rating', '<=', 2)
      .orderBy('timestamp')
      .get();

    const negativeReviewsByDay = new Map<string, number>();
    reviewsSnapshot.forEach(doc => {
      const date = new Date(doc.data().timestamp.toMillis()).toISOString().split('T')[0];
      negativeReviewsByDay.set(date, (negativeReviewsByDay.get(date) || 0) + 1);
    });

    // Calculate correlation
    const allDates = Array.from(new Set([...crashesByDay.keys(), ...negativeReviewsByDay.keys()])).sort();
    
    let correlationSum = 0;
    let count = 0;

    for (const date of allDates) {
      const crashes = crashesByDay.get(date) || 0;
      const reviews = negativeReviewsByDay.get(date) || 0;
      
      if (crashes > 0 || reviews > 0) {
        correlationSum += Math.min(crashes, reviews);
        count++;
      }
    }

    const correlationStrength = count > 0 ? correlationSum / count : 0;

    return {
      correlationStrength,
      windowDays,
      crashesByDay: Object.fromEntries(crashesByDay),
      negativeReviewsByDay: Object.fromEntries(negativeReviewsByDay),
      recommendation: correlationStrength > 5 
        ? 'High correlation detected. Prioritize crash fixes to improve ratings.'
        : 'Normal correlation. Monitor trends.'
    };
  } catch (error) {
    console.error('Error detecting crash-review correlation:', error);
    throw new functions.https.HttpsError('internal', 'Failed to detect correlation');
  }
});

/**
 * Track uninstall spike
 */
export const trackUninstallSpike = functions.firestore
  .document('appUninstalls/{uninstallId}')
  .onCreate(async (snap, context) => {
    try {
      // Get uninstalls in last 24 hours
      const recentUninstalls = await db.collection('appUninstalls')
        .where('uninstalledAt', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
        .get();

      // Get baseline (average of previous 7 days)
      const baselineStart = admin.firestore.Timestamp.fromMillis(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const baselineEnd = admin.firestore.Timestamp.fromMillis(Date.now() - 1 * 24 * 60 * 60 * 1000);
      
      const baselineUninstalls = await db.collection('appUninstalls')
        .where('uninstalledAt', '>=', baselineStart)
        .where('uninstalledAt', '<', baselineEnd)
        .get();

      const baselineDaily = baselineUninstalls.size / 7;
      const currentDaily = recentUninstalls.size;

      // Detect spike (>2x baseline)
      if (currentDaily > baselineDaily * 2 && currentDaily > 10) {
        await db.collection('asoIncidents').add({
          type: 'uninstall_spike',
          currentRate: currentDaily,
          baselineRate: baselineDaily,
          multiplier: currentDaily / baselineDaily,
          timestamp: admin.firestore.Timestamp.now(),
          status: 'open',
          severity: currentDaily > baselineDaily * 5 ? 'critical' : 'high'
        });
      }
    } catch (error) {
      console.error('Error tracking uninstall spike:', error);
    }
  });
