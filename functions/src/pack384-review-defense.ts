/**
 * PACK 384 — App Store Review Defense Engine
 * Detects and prevents review bombing, fake reviews, and coordinated attacks
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

interface ReviewSignal {
  userId: string;
  reviewId: string;
  deviceFingerprint: string;
  ipAddress: string;
  ipCluster?: string;
  accountAge: number; // days
  hasPurchaseHistory: boolean;
  reviewVelocity: number; // reviews per day from this IP cluster
  sentimentPolarity: number; // -1 to 1
  rating: number; // 1-5
  reviewText: string;
  reviewLength: number;
  timestamp: admin.firestore.Timestamp;
  suspicious: boolean;
  suspicionReasons: string[];
}

interface ReviewBombingDetection {
  detected: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  startTime: admin.firestore.Timestamp;
  endTime: admin.firestore.Timestamp;
  affectedReviewCount: number;
  suspiciousAccountCount: number;
  averageRating: number;
  velocitySpike: number; // multiplier vs normal
  geoClusterAnomalies: string[];
  ipClusters: string[];
  reasons: string[];
  autoResponse: string[];
}

/**
 * Analyze review signal for suspicious patterns
 */
function analyzeReviewSignal(signal: Partial<ReviewSignal>): { suspicious: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let suspicious = false;

  // New account (< 7 days) leaving review
  if (signal.accountAge && signal.accountAge < 7) {
    reasons.push('new_account');
    suspicious = true;
  }

  // No purchase history
  if (!signal.hasPurchaseHistory) {
    reasons.push('no_purchase_history');
  }

  // High velocity from IP cluster
  if (signal.reviewVelocity && signal.reviewVelocity > 5) {
    reasons.push('high_velocity_ip_cluster');
    suspicious = true;
  }

  // Extreme sentiment (very negative without nuance)
  if (signal.sentimentPolarity && signal.sentimentPolarity < -0.8 && signal.reviewLength && signal.reviewLength < 50) {
    reasons.push('extreme_negative_sentiment');
    suspicious = true;
  }

  // Very short review with extreme rating
  if (signal.reviewLength && signal.reviewLength < 20 && signal.rating && (signal.rating === 1 || signal.rating === 5)) {
    reasons.push('short_extreme_rating');
  }

  // Suspicious device fingerprint patterns
  if (signal.deviceFingerprint && signal.deviceFingerprint.includes('emulator')) {
    reasons.push('emulator_detected');
    suspicious = true;
  }

  return { suspicious, reasons };
}

/**
 * Detect review bombing patterns
 */
export const detectReviewBombing = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const windowHours = data.windowHours || 24;
  const now = admin.firestore.Timestamp.now();
  const windowStart = admin.firestore.Timestamp.fromMillis(now.toMillis() - windowHours * 60 * 60 * 1000);

  try {
    // Get recent review signals
    const signalsSnapshot = await db.collection('storeReviewSignals')
      .where('timestamp', '>=', windowStart)
      .orderBy('timestamp', 'desc')
      .limit(1000)
      .get();

    const signals: ReviewSignal[] = [];
    signalsSnapshot.forEach(doc => signals.push({ ...doc.data(), reviewId: doc.id } as ReviewSignal));

    // Calculate baseline metrics
    const baselineSnapshot = await db.collection('asoHealthMetrics')
      .orderBy('timestamp', 'desc')
      .limit(30)
      .get();

    let baselineReviewsPerDay = 10; // default
    if (!baselineSnapshot.empty) {
      const baselineData = baselineSnapshot.docs.map(doc => doc.data());
      baselineReviewsPerDay = baselineData.reduce((sum, m) => sum + (m.reviewsPerDay || 0), 0) / baselineData.length;
    }

    // Analyze patterns
    const currentReviewsPerDay = signals.length / (windowHours / 24);
    const velocitySpike = currentReviewsPerDay / Math.max(baselineReviewsPerDay, 1);

    const suspiciousReviews = signals.filter(s => s.suspicious);
    const lowRatingReviews = signals.filter(s => s.rating <= 2);
    const averageRating = signals.length > 0 
      ? signals.reduce((sum, s) => sum + s.rating, 0) / signals.length 
      : 0;

    // Detect IP clusters
    const ipClusters = new Map<string, number>();
    signals.forEach(s => {
      if (s.ipCluster) {
        ipClusters.set(s.ipCluster, (ipClusters.get(s.ipCluster) || 0) + 1);
      }
    });
    const suspiciousIpClusters = Array.from(ipClusters.entries())
      .filter(([_, count]) => count > 5)
      .map(([cluster]) => cluster);

    // Detect geo anomalies
    const geoSnapshot = await db.collection('storeReviewSignals')
      .where('timestamp', '>=', windowStart)
      .get();

    const geoClusters = new Map<string, number>();
    geoSnapshot.forEach(doc => {
      const geo = doc.data().geoCountry;
      if (geo) {
        geoClusters.set(geo, (geoClusters.get(geo) || 0) + 1);
      }
    });

    const totalReviews = signals.length;
    const geoClusterAnomalies = Array.from(geoClusters.entries())
      .filter(([_, count]) => count / totalReviews > 0.5) // > 50% from one country
      .map(([geo]) => geo);

    // Determine if bombing is detected
    const reasons: string[] = [];
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let detected = false;

    if (velocitySpike > 5) {
      reasons.push(`Velocity spike: ${velocitySpike.toFixed(1)}x normal`);
      detected = true;
      severity = 'high';
    }

    if (suspiciousReviews.length / totalReviews > 0.3 && totalReviews > 10) {
      reasons.push(`${((suspiciousReviews.length / totalReviews) * 100).toFixed(0)}% suspicious accounts`);
      detected = true;
      severity = severity === 'high' ? 'critical' : 'high';
    }

    if (averageRating < 2.5 && totalReviews > 20) {
      reasons.push(`Abnormally low average rating: ${averageRating.toFixed(1)}`);
      detected = true;
      severity = severity === 'critical' ? 'critical' : 'medium';
    }

    if (suspiciousIpClusters.length > 0) {
      reasons.push(`${suspiciousIpClusters.length} suspicious IP clusters detected`);
      detected = true;
    }

    if (geoClusterAnomalies.length > 0) {
      reasons.push(`Geo-cluster anomaly: ${geoClusterAnomalies.join(', ')}`);
      detected = true;
    }

    const detection: ReviewBombingDetection = {
      detected,
      severity,
      startTime: windowStart,
      endTime: now,
      affectedReviewCount: totalReviews,
      suspiciousAccountCount: suspiciousReviews.length,
      averageRating,
      velocitySpike,
      geoClusterAnomalies,
      ipClusters: suspiciousIpClusters,
      reasons,
      autoResponse: []
    };

    // Auto-response actions
    if (detected && severity === 'critical') {
      detection.autoResponse.push('escalate_to_support');
      detection.autoResponse.push('generate_defense_dossier');
      detection.autoResponse.push('notify_admin_team');
      
      // Create abuse signal
      await db.collection('storeAbuseSignals').add({
        type: 'review_bombing',
        severity,
        detection,
        timestamp: now,
        status: 'active',
        escalated: true
      });
    }

    // Store detection result
    await db.collection('reviewBombingDetections').add({
      ...detection,
      detectedAt: now
    });

    return detection;
  } catch (error) {
    console.error('Error detecting review bombing:', error);
    throw new functions.https.HttpsError('internal', 'Failed to detect review bombing');
  }
});

/**
 * Record a store review signal
 */
export const recordStoreReviewSignal = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    // Get user account data
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data()!;
    const accountCreated = userData.createdAt?.toDate() || new Date();
    const accountAge = Math.floor((Date.now() - accountCreated.getTime()) / (1000 * 60 * 60 * 24));

    // Check purchase history
    const purchasesSnapshot = await db.collection('tokenPurchases')
      .where('userId', '==', userId)
      .where('status', '==', 'completed')
      .limit(1)
      .get();
    const hasPurchaseHistory = !purchasesSnapshot.empty;

    // Get IP cluster velocity
    const ipCluster = data.ipCluster || data.ipAddress?.substring(0, 10); // simplified clustering
    const recentFromClusterSnapshot = await db.collection('storeReviewSignals')
      .where('ipCluster', '==', ipCluster)
      .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
      .get();
    const reviewVelocity = recentFromClusterSnapshot.size;

    // Create signal
    const signal: Partial<ReviewSignal> = {
      userId,
      deviceFingerprint: data.deviceFingerprint,
      ipAddress: data.ipAddress,
      ipCluster,
      accountAge,
      hasPurchaseHistory,
      reviewVelocity,
      sentimentPolarity: data.sentimentPolarity || 0,
      rating: data.rating,
      reviewText: data.reviewText || '',
      reviewLength: (data.reviewText || '').length,
      timestamp: admin.firestore.Timestamp.now(),
      suspicious: false,
      suspicionReasons: []
    };

    // Analyze signal
    const analysis = analyzeReviewSignal(signal);
    signal.suspicious = analysis.suspicious;
    signal.suspicionReasons = analysis.reasons;

    // Store signal
    const signalRef = await db.collection('storeReviewSignals').add(signal);

    // If suspicious, create abuse signal
    if (analysis.suspicious) {
      await db.collection('storeAbuseSignals').add({
        type: 'suspicious_review',
        userId,
        signalId: signalRef.id,
        reasons: analysis.reasons,
        timestamp: signal.timestamp,
        status: 'pending_review'
      });
    }

    return {
      signalId: signalRef.id,
      suspicious: analysis.suspicious,
      reasons: analysis.reasons
    };
  } catch (error) {
    console.error('Error recording review signal:', error);
    throw new functions.https.HttpsError('internal', 'Failed to record review signal');
  }
});

/**
 * Safe automated review request
 */
export const requestStoreReview = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const actionType = data.actionType; // 'completed_chat', 'completed_meeting', 'successful_payout', '7d_retention'

  try {
    // Check if user is eligible for review request
    const lastRequestSnapshot = await db.collection('storeReviewRequests')
      .where('userId', '==', userId)
      .orderBy('requestedAt', 'desc')
      .limit(1)
      .get();

    // Rule: max 1 request per 30 days
    if (!lastRequestSnapshot.empty) {
      const lastRequest = lastRequestSnapshot.docs[0].data();
      const daysSinceLastRequest = (Date.now() - lastRequest.requestedAt.toMillis()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastRequest < 30) {
        return { 
          eligible: false, 
          reason: 'too_soon',
          daysRemaining: Math.ceil(30 - daysSinceLastRequest)
        };
      }
    }

    // Check for failed transactions (recent)
    const recentFailedTxSnapshot = await db.collection('tokenPurchases')
      .where('userId', '==', userId)
      .where('status', '==', 'failed')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .limit(1)
      .get();

    if (!recentFailedTxSnapshot.empty) {
      return { eligible: false, reason: 'recent_failed_transaction' };
    }

    // Check churn risk state
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (userData?.churnRisk === 'high') {
      return { eligible: false, reason: 'churn_risk' };
    }

    // Check open support tickets
    const openTicketsSnapshot = await db.collection('supportTickets')
      .where('userId', '==', userId)
      .where('status', 'in', ['open', 'pending'])
      .limit(1)
      .get();

    if (!openTicketsSnapshot.empty) {
      return { eligible: false, reason: 'open_support_ticket' };
    }

    // User is eligible - record the request
    await db.collection('storeReviewRequests').add({
      userId,
      actionType,
      requestedAt: admin.firestore.Timestamp.now(),
      shown: true
    });

    return {
      eligible: true,
      shouldShow: true
    };
  } catch (error) {
    console.error('Error requesting store review:', error);
    throw new functions.https.HttpsError('internal', 'Failed to request review');
  }
});

/**
 * Detect copy-paste review content (bot patterns)
 */
export const detectCopyPasteReviews = functions.pubsub.schedule('every 6 hours').onRun(async () => {
  try {
    const windowStart = admin.firestore.Timestamp.fromMillis(Date.now() - 48 * 60 * 60 * 1000);
    
    const signalsSnapshot = await db.collection('storeReviewSignals')
      .where('timestamp', '>=', windowStart)
      .get();

    const reviewTexts = new Map<string, string[]>();
    signalsSnapshot.forEach(doc => {
      const data = doc.data();
      const text = data.reviewText?.toLowerCase().trim();
      if (text && text.length > 20) {
        if (!reviewTexts.has(text)) {
          reviewTexts.set(text, []);
        }
        reviewTexts.get(text)!.push(doc.id);
      }
    });

    // Find duplicates
    const duplicates = Array.from(reviewTexts.entries())
      .filter(([_, ids]) => ids.length > 3); // More than 3 identical reviews

    for (const [text, signalIds] of duplicates) {
      await db.collection('storeAbuseSignals').add({
        type: 'copy_paste_reviews',
        reviewText: text,
        signalIds,
        count: signalIds.length,
        timestamp: admin.firestore.Timestamp.now(),
        status: 'detected',
        severity: signalIds.length > 10 ? 'high' : 'medium'
      });
    }

    console.log(`Detected ${duplicates.length} copy-paste review patterns`);
  } catch (error) {
    console.error('Error detecting copy-paste reviews:', error);
  }
});
