/**
 * PACK 384 — Paid Review & Fake Boost Detection
 * Detects review farms, VPN clusters, device emulation, and bot patterns
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

interface ReviewFarmIndicators {
  vpnClusters: string[];
  deviceEmulation: number;
  copyPastePatterns: number;
  botSentiments: number;
  suspiciousAccounts: number;
  totalReviews: number;
  confidenceScore: number; // 0-1
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface DeviceFingerprint {
  deviceId: string;
  model: string;
  os: string;
  osVersion: string;
  isEmulator: boolean;
  isRooted: boolean;
  hasVPN: boolean;
  timezone: string;
  language: string;
  screenResolution: string;
}

/**
 * Detect paid review farms
 */
export const detectPaidReviewFarms = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const windowHours = data.windowHours || 48;
  const windowStart = admin.firestore.Timestamp.fromMillis(Date.now() - windowHours * 60 * 60 * 1000);

  try {
    const indicators: ReviewFarmIndicators = {
      vpnClusters: [],
      deviceEmulation: 0,
      copyPastePatterns: 0,
      botSentiments: 0,
      suspiciousAccounts: 0,
      totalReviews: 0,
      confidenceScore: 0,
      severity: 'low'
    };

    // Get recent review signals
    const signalsSnapshot = await db.collection('storeReviewSignals')
      .where('timestamp', '>=', windowStart)
      .orderBy('timestamp', 'desc')
      .limit(500)
      .get();

    indicators.totalReviews = signalsSnapshot.size;

    // Analyze device fingerprints for emulation
    const deviceMap = new Map<string, number>();
    const ipMap = new Map<string, number>();
    const timezoneMap = new Map<string, number>();

    signalsSnapshot.forEach(doc => {
      const data = doc.data();
      
      // Track device fingerprint patterns
      if (data.deviceFingerprint) {
        deviceMap.set(data.deviceFingerprint, (deviceMap.get(data.deviceFingerprint) || 0) + 1);
        
        // Check for emulator indicators
        if (data.deviceFingerprint.toLowerCase().includes('emulator') ||
            data.deviceFingerprint.toLowerCase().includes('generic') ||
            data.deviceFingerprint.toLowerCase().includes('simulator')) {
          indicators.deviceEmulation++;
        }
      }

      // Track IP patterns
      if (data.ipAddress) {
        ipMap.set(data.ipAddress, (ipMap.get(data.ipAddress) || 0) + 1);
      }

      // Track timezone anomalies
      if (data.timezone) {
        timezoneMap.set(data.timezone, (timezoneMap.get(data.timezone) || 0) + 1);
      }

      // Check suspicious account flags
      if (data.suspicious) {
        indicators.suspiciousAccounts++;
      }
    });

    // Detect VPN clusters (multiple reviews from same IP with different geo locations)
    const vpnCandidates: string[] = [];
    for (const [ip, count] of ipMap.entries()) {
      if (count > 5) {
        // Check geo diversity for this IP
        const geoSnapshot = await db.collection('storeReviewSignals')
          .where('ipAddress', '==', ip)
          .where('timestamp', '>=', windowStart)
          .get();

        const geoLocations = new Set<string>();
        geoSnapshot.forEach(doc => {
          const geo = doc.data().geoCountry;
          if (geo) geoLocations.add(geo);
        });

        // Multiple geos from one IP = likely VPN
        if (geoLocations.size > 2) {
          vpnCandidates.push(ip);
        }
      }
    }
    indicators.vpnClusters = vpnCandidates;

    // Detect copy-paste patterns
    const reviewTextMap = new Map<string, number>();
    signalsSnapshot.forEach(doc => {
      const text = doc.data().reviewText?.toLowerCase().trim();
      if (text && text.length > 20) {
        reviewTextMap.set(text, (reviewTextMap.get(text) || 0) + 1);
      }
    });

    for (const [_, count] of reviewTextMap.entries()) {
      if (count > 2) {
        indicators.copyPastePatterns++;
      }
    }

    // Detect bot sentiment patterns (overly uniform sentiment scores)
    const sentiments: number[] = [];
    signalsSnapshot.forEach(doc => {
      const sentiment = doc.data().sentimentPolarity;
      if (typeof sentiment === 'number') {
        sentiments.push(sentiment);
      }
    });

    if (sentiments.length > 10) {
      // Calculate sentiment variance
      const mean = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
      const variance = sentiments.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / sentiments.length;
      const stdDev = Math.sqrt(variance);

      // Bot reviews often have very uniform sentiment
      if (stdDev < 0.15) {
        indicators.botSentiments = Math.floor(sentiments.length * 0.7); // Estimate ~70% are bots
      }
    }

    // Calculate confidence score
    let confidence = 0;
    
    if (indicators.vpnClusters.length > 0) confidence += 0.3;
    if (indicators.deviceEmulation / indicators.totalReviews > 0.2) confidence += 0.25;
    if (indicators.copyPastePatterns > 5) confidence += 0.2;
    if (indicators.botSentiments / indicators.totalReviews > 0.3) confidence += 0.15;
    if (indicators.suspiciousAccounts / indicators.totalReviews > 0.3) confidence += 0.1;

    indicators.confidenceScore = Math.min(confidence, 1);

    // Determine severity
    if (indicators.confidenceScore > 0.7) {
      indicators.severity = 'critical';
    } else if (indicators.confidenceScore > 0.5) {
      indicators.severity = 'high';
    } else if (indicators.confidenceScore > 0.3) {
      indicators.severity = 'medium';
    } else {
      indicators.severity = 'low';
    }

    // Store detection result
    await db.collection('reviewFarmDetections').add({
      ...indicators,
      timestamp: admin.firestore.Timestamp.now(),
      windowHours,
      status: indicators.severity === 'critical' || indicators.severity === 'high' ? 'active' : 'monitored'
    });

    // If high severity, create abuse signal
    if (indicators.severity === 'high' || indicators.severity === 'critical') {
      await db.collection('storeAbuseSignals').add({
        type: 'paid_review_farm',
        severity: indicators.severity,
        indicators,
        timestamp: admin.firestore.Timestamp.now(),
        status: 'detected',
        requiresAction: true
      });

      // Auto-block suspicious accounts
      const suspiciousAccounts = signalsSnapshot.docs
        .filter(doc => doc.data().suspicious)
        .map(doc => doc.data().userId);

      for (const userId of suspiciousAccounts.slice(0, 50)) { // Batch limit
        await db.collection('users').doc(userId).update({
          reviewBlocked: true,
          reviewBlockReason: 'suspected_paid_review_farm',
          reviewBlockedAt: admin.firestore.Timestamp.now()
        });
      }
    }

    return indicators;
  } catch (error) {
    console.error('Error detecting paid review farms:', error);
    throw new functions.https.HttpsError('internal', 'Failed to detect review farms');
  }
});

/**
 * Analyze device fingerprint for authenticity
 */
export const analyzeDeviceFingerprint = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const fingerprint: DeviceFingerprint = {
    deviceId: data.deviceId,
    model: data.model,
    os: data.os,
    osVersion: data.osVersion,
    isEmulator: data.isEmulator || false,
    isRooted: data.isRooted || false,
    hasVPN: data.hasVPN || false,
    timezone: data.timezone,
    language: data.language,
    screenResolution: data.screenResolution
  };

  try {
    const suspicionReasons: string[] = [];
    let riskScore = 0;

    // Check for emulator
    if (fingerprint.isEmulator) {
      suspicionReasons.push('emulator_detected');
      riskScore += 50;
    }

    // Check for rooted/jailbroken device
    if (fingerprint.isRooted) {
      suspicionReasons.push('rooted_device');
      riskScore += 30;
    }

    // Check for VPN
    if (fingerprint.hasVPN) {
      suspicionReasons.push('vpn_active');
      riskScore += 20;
    }

    // Check for generic/suspicious device models
    const suspiciousModels = ['generic', 'unknown', 'sdk', 'emulator', 'simulator'];
    if (suspiciousModels.some(m => fingerprint.model.toLowerCase().includes(m))) {
      suspicionReasons.push('suspicious_device_model');
      riskScore += 40;
    }

    // Check screen resolution anomalies
    if (fingerprint.screenResolution === '0x0' || fingerprint.screenResolution === '') {
      suspicionReasons.push('invalid_screen_resolution');
      riskScore += 15;
    }

    // Check how many times this device ID has been seen
    const deviceUsageCount = await db.collection('deviceFingerprints')
      .where('deviceId', '==', fingerprint.deviceId)
      .get();

    if (deviceUsageCount.size > 5) {
      suspicionReasons.push('device_id_reuse');
      riskScore += 25;
    }

    // Store fingerprint
    await db.collection('deviceFingerprints').add({
      ...fingerprint,
      userId: context.auth.uid,
      riskScore,
      suspicionReasons,
      timestamp: admin.firestore.Timestamp.now()
    });

    return {
      riskScore,
      suspicious: riskScore > 50,
      suspicionReasons,
      blocked: riskScore > 80
    };
  } catch (error) {
    console.error('Error analyzing device fingerprint:', error);
    throw new functions.https.HttpsError('internal', 'Failed to analyze fingerprint');
  }
});

/**
 * Detect coordinated review attacks
 */
export const detectCoordinatedAttack = functions.pubsub.schedule('every 4 hours').onRun(async () => {
  try {
    const windowStart = admin.firestore.Timestamp.fromMillis(Date.now() - 12 * 60 * 60 * 1000);

    // Get recent reviews
    const reviewsSnapshot = await db.collection('storeReviewSignals')
      .where('timestamp', '>=', windowStart)
      .orderBy('timestamp')
      .get();

    // Group by time buckets (hourly)
    const timeBuckets = new Map<string, any[]>();
    reviewsSnapshot.forEach(doc => {
      const data = doc.data();
      const hour = new Date(data.timestamp.toMillis()).toISOString().substring(0, 13); // YYYY-MM-DDTHH
      
      if (!timeBuckets.has(hour)) {
        timeBuckets.set(hour, []);
      }
      timeBuckets.get(hour)!.push(data);
    });

    // Detect coordinated patterns
    for (const [hour, reviews] of timeBuckets.entries()) {
      if (reviews.length < 10) continue;

      // Check for coordinated patterns
      const ipClusters = new Map<string, number>();
      const sentiments: number[] = [];
      let suspiciousCount = 0;

      reviews.forEach(r => {
        if (r.ipCluster) {
          ipClusters.set(r.ipCluster, (ipClusters.get(r.ipCluster) || 0) + 1);
        }
        if (r.sentimentPolarity) {
          sentiments.push(r.sentimentPolarity);
        }
        if (r.suspicious) {
          suspiciousCount++;
        }
      });

      // Calculate uniformity of sentiment (bot indicator)
      const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
      const variance = sentiments.reduce((sum, s) => sum + Math.pow(s - avgSentiment, 2), 0) / sentiments.length;
      const uniformity = 1 - Math.sqrt(variance);

      // Detect attack if:
      // - More than 30% suspicious accounts
      // - High sentiment uniformity (>0.8)
      // - Dominant IP clusters
      const dominantClusters = Array.from(ipClusters.values()).filter(count => count > 3).length;

      if ((suspiciousCount / reviews.length > 0.3) || 
          (uniformity > 0.8 && reviews.length > 20) || 
          dominantClusters > 5) {
        
        await db.collection('coordinatedAttacks').add({
          type: 'review_attack',
          timeWindow: hour,
          reviewCount: reviews.length,
          suspiciousCount,
          uniformity,
          dominantClusters,
          ipClusters: Object.fromEntries(ipClusters),
          timestamp: admin.firestore.Timestamp.now(),
          status: 'detected',
          severity: suspiciousCount / reviews.length > 0.5 ? 'critical' : 'high'
        });
      }
    }

    console.log('Coordinated attack detection completed');
  } catch (error) {
    console.error('Error detecting coordinated attacks:', error);
  }
});

/**
 * Block review farm IP ranges
 */
export const blockReviewFarmIPRanges = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const ipRanges = data.ipRanges as string[];
  const reason = data.reason || 'suspected_review_farm';

  try {
    const blockedCount = ipRanges.length;

    for (const ipRange of ipRanges) {
      await db.collection('blockedIPRanges').add({
        ipRange,
        reason,
        type: 'review_farm',
        blockedAt: admin.firestore.Timestamp.now(),
        blockedBy: context.auth.uid,
        active: true
      });

      // Also block any reviews from this IP range
      const reviewsFromIP = await db.collection('storeReviewSignals')
        .where('ipAddress', '>=', ipRange)
        .where('ipAddress', '<', ipRange + '\uf8ff')
        .get();

      for (const reviewDoc of reviewsFromIP.docs) {
        await reviewDoc.ref.update({
          blocked: true,
          blockReason: 'ip_range_blocked',
          blockedAt: admin.firestore.Timestamp.now()
        });
      }
    }

    return {
      success: true,
      blockedCount,
      message: `Blocked ${blockedCount} IP ranges associated with review farms`
    };
  } catch (error) {
    console.error('Error blocking IP ranges:', error);
    throw new functions.https.HttpsError('internal', 'Failed to block IP ranges');
  }
});

/**
 * Generate review authenticity report
 */
export const generateAuthenticityReport = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  try {
    const last30Days = admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get all reviews from last 30 days
    const reviewsSnapshot = await db.collection('storeReviewSignals')
      .where('timestamp', '>=', last30Days)
      .get();

    const totalReviews = reviewsSnapshot.size;
    const authenticReviews = reviewsSnapshot.docs.filter(d => !d.data().suspicious).length;
    const suspiciousReviews = totalReviews - authenticReviews;

    // Get detection results
    const farmDetections = await db.collection('reviewFarmDetections')
      .where('timestamp', '>=', last30Days)
      .get();

    const coordinatedAttacks = await db.collection('coordinatedAttacks')
      .where('timestamp', '>=', last30Days)
      .get();

    const report = {
      period: '30_days',
      generatedAt: admin.firestore.Timestamp.now(),
      overview: {
        totalReviews,
        authenticReviews,
        suspiciousReviews,
        authenticityRate: (authenticReviews / totalReviews) * 100
      },
      threats: {
        farmDetections: farmDetections.size,
        coordinatedAttacks: coordinatedAttacks.size,
        blockedIPRanges: (await db.collection('blockedIPRanges').where('active', '==', true).get()).size
      },
      mitigations: {
        accountsBlocked: (await db.collection('users').where('reviewBlocked', '==', true).get()).size,
        reviewsBlocked: reviewsSnapshot.docs.filter(d => d.data().blocked).length
      },
      healthScore: Math.min(100, (authenticReviews / totalReviews) * 100)
    };

    // Store report
    await db.collection('authenticityReports').add(report);

    return report;
  } catch (error) {
    console.error('Error generating authenticity report:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate report');
  }
});
