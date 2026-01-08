/**
 * PACK 376: App Store Defense, Reviews, Reputation & Trust Engine
 * 
 * Protects Avalo's public reputation and store rankings while actively 
 * optimizing ASO, review velocity, trust signals, and anti-sabotage defense.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

const db = admin.firestore();

// ============================================
// TYPES & INTERFACES
// ============================================

interface StoreReview {
  platform: 'ios' | 'android' | 'web';
  rating: number;
  text: string;
  userId: string;
  verifiedUser: boolean;
  sessionAge: number; // hours
  riskScore: number;
  sentimentScore: number;
  deviceFingerprint?: string;
  countryCode?: string;
  vpnDetected?: boolean;
  createdAt: Timestamp;
}

interface ReviewThreat {
  reviewId: string;
  threatType: 'review_bombing' | 'device_farm' | 'vpn_cluster' | 'fake_account' | 'suspicious_pattern';
  severity: 'low' | 'medium' | 'high' | 'critical';
  signals: string[];
  status: 'detected' | 'investigating' | 'confirmed' | 'false_positive';
  detectedAt: Timestamp;
  resolvedAt?: Timestamp;
}

interface TrustScore {
  userId: string;
  trustScore: number; // 0-100
  storeWeightMultiplier: number; // 0.0-2.0
  fraudHistoryScore: number;
  verifiedIdentity: boolean;
  accountAge: number; // days
  reviewsGiven: number;
  suspiciousActivity: string[];
  updatedAt: Timestamp;
}

interface ASOMetrics {
  platform: 'ios' | 'android';
  date: string; // YYYY-MM-DD
  metricType: 'keyword_ranking' | 'conversion_rate' | 'retention' | 'review_velocity';
  value: number;
  keyword?: string;
  retentionDay?: number; // D1, D7, D30
  metadata: Record<string, any>;
  createdAt: Timestamp;
}

interface ReviewRequest {
  userId: string;
  trigger: 'booking_success' | 'chat_rating' | 'event_completion' | 'payout_success';
  requestedAt: Timestamp;
  responded: boolean;
  reviewGiven: boolean;
}

interface TrustSignal {
  userId: string;
  signalType: 'verified_user' | 'id_verified' | 'safe_meetings' | 'panic_button' | 'verified_creator';
  level: 'bronze' | 'silver' | 'gold' | 'platinum';
  issuedAt: Timestamp;
  expiresAt?: Timestamp;
}

// ============================================
// 1. REVIEW COLLECTION & MONITORING ENGINE
// ============================================

/**
 * Ingest review from App Store / Google Play
 */
export const pack376_ingestStoreReview = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { platform, rating, text, deviceFingerprint, countryCode, vpnDetected } = data;

  // Validate inputs
  if (!platform || !rating || rating < 1 || rating > 5) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid review data');
  }

  const userId = context.auth.uid;
  const userDoc = await db.collection('users').doc(userId).get();
  
  if (!userDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }

  const userData = userDoc.data()!;
  const sessionAge = await calculateSessionAge(userId);
  
  // Calculate trust and sentiment scores
  const trustScore = await pack376_scoreReviewTrust(userId, {
    platform,
    deviceFingerprint,
    countryCode,
    vpnDetected,
    sessionAge
  });

  const sentimentScore = await analyzeSentiment(text);

  // Create store review
  const reviewData: StoreReview = {
    platform,
    rating,
    text,
    userId,
    verifiedUser: userData.verified || false,
    sessionAge,
    riskScore: trustScore.riskScore,
    sentimentScore,
    deviceFingerprint,
    countryCode,
    vpnDetected,
    createdAt: Timestamp.now()
  };

  const reviewRef = await db.collection('storeReviews').add(reviewData);

  // Check for attack patterns
  await pack376_detectReviewAttackPattern(reviewRef.id, reviewData);

  // Log in audit trail (PACK 296)
  await db.collection('auditLogs').add({
    action: 'store_review_ingested',
    userId,
    reviewId: reviewRef.id,
    platform,
    rating,
    riskScore: trustScore.riskScore,
    timestamp: Timestamp.now()
  });

  return {
    success: true,
    reviewId: reviewRef.id,
    riskScore: trustScore.riskScore,
    flagged: trustScore.riskScore > 70
  };
});

/**
 * Score review trust based on multiple signals
 */
async function pack376_scoreReviewTrust(
  userId: string,
  signals: {
    platform: string;
    deviceFingerprint?: string;
    countryCode?: string;
    vpnDetected?: boolean;
    sessionAge: number;
  }
): Promise<{ riskScore: number; trustScore: number }> {
  let riskScore = 0;
  
  // Get user trust score
  const trustDoc = await db.collection('users').doc(userId).collection('trustScore').doc('current').get();
  const userTrustScore = trustDoc.exists ? trustDoc.data()!.trustScore : 50;

  // Low session age (< 24 hours)
  if (signals.sessionAge < 24) {
    riskScore += 30;
  }

  // VPN detected
  if (signals.vpnDetected) {
    riskScore += 20;
  }

  // Check device fingerprint reuse
  if (signals.deviceFingerprint) {
    const recentReviews = await db.collection('storeReviews')
      .where('deviceFingerprint', '==', signals.deviceFingerprint)
      .where('createdAt', '>', Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .limit(10)
      .get();

    if (recentReviews.size > 3) {
      riskScore += 40; // Device farm indicator
    }
  }

  // Country mismatch with user profile
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (userData && signals.countryCode && userData.countryCode !== signals.countryCode) {
    riskScore += 15;
  }

  // Zero app interaction history
  const interactions = await db.collection('userActivity')
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (interactions.empty) {
    riskScore += 35;
  }

  // Low user trust score
  if (userTrustScore < 30) {
    riskScore += 25;
  }

  return {
    riskScore: Math.min(riskScore, 100),
    trustScore: Math.max(100 - riskScore, 0)
  };
}

/**
 * Detect review attack patterns
 */
async function pack376_detectReviewAttackPattern(reviewId: string, review: StoreReview): Promise<void> {
  const threats: string[] = [];
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';

  // Check for rapid negative spike
  const recentNegativeReviews = await db.collection('storeReviews')
    .where('platform', '==', review.platform)
    .where('rating', '<=', 2)
    .where('createdAt', '>', Timestamp.fromMillis(Date.now() - 60 * 60 * 1000)) // Last hour
    .get();

  if (recentNegativeReviews.size > 10) {
    threats.push('rapid_negative_spike');
    severity = 'critical';
  }

  // High risk score
  if (review.riskScore > 70) {
    threats.push('high_risk_review');
    severity = severity === 'critical' ? 'critical' : 'high';
  }

  // VPN clustering
  if (review.vpnDetected) {
    const vpnReviews = await db.collection('storeReviews')
      .where('vpnDetected', '==', true)
      .where('createdAt', '>', Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
      .get();

    if (vpnReviews.size > 5) {
      threats.push('vpn_clustering');
      severity = severity === 'critical' ? 'critical' : 'high';
    }
  }

  // Create threat record if any threats detected
  if (threats.length > 0) {
    const threatData: ReviewThreat = {
      reviewId,
      threatType: 'review_bombing',
      severity,
      signals: threats,
      status: 'detected',
      detectedAt: Timestamp.now()
    };

    await db.collection('reviewThreats').add(threatData);

    // Log signal
    await db.collection('reviewSignals').add({
      signalType: 'attack_detected',
      reviewId,
      threats,
      severity,
      timestamp: Timestamp.now()
    });

    // Auto-responses based on severity
    if (severity === 'critical') {
      // Shadow-flag review
      await db.collection('storeReviews').doc(reviewId).update({
        shadowFlagged: true,
        excludeFromRating: true
      });

      // Freeze review impact calculation
      await db.collection('reputationMetrics').doc('current').update({
        reviewImpactFrozen: true,
        frozenAt: Timestamp.now(),
        reason: 'critical_attack_detected'
      });

      // Notify trust team
      await notifyTrustTeam({
        type: 'critical_review_attack',
        reviewId,
        threats,
        platform: review.platform
      });

      // Trigger anti-attack mode
      await db.collection('featureFlags').doc('reviews').update({
        'anti.reviewBomb.enabled': true,
        'antiAttackMode': true,
        'activatedAt': Timestamp.now()
      });
    }
  }
}

// ============================================
// 2. TRUST SCORE ENGINE
// ============================================

/**
 * Calculate and update user trust score
 */
export const pack376_updateTrustScore = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async () => {
    const usersSnapshot = await db.collection('users').limit(1000).get();

    const batch = db.batch();
    let updateCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();

      // Calculate trust score
      let trustScore = 50; // Base score

      // Verified identity (+20)
      if (userData.verified) trustScore += 20;
      if (userData.idVerified) trustScore += 10;

      // Account age
      const accountAge = Date.now() - userData.createdAt.toMillis();
      const accountAgeDays = accountAge / (1000 * 60 * 60 * 24);
      if (accountAgeDays > 365) trustScore += 15;
      else if (accountAgeDays > 90) trustScore += 10;
      else if (accountAgeDays > 30) trustScore += 5;

      // Good reviews given
      const reviewsGiven = await db.collection('storeReviews')
        .where('userId', '==', userId)
        .where('riskScore', '<', 30)
        .get();
      trustScore += Math.min(reviewsGiven.size * 2, 10);

      // Check fraud history (PACK 302)
      const fraudFlags = await db.collection('fraudDetection')
        .where('userId', '==', userId)
        .where('status', '==', 'confirmed')
        .get();
      trustScore -= fraudFlags.size * 15;

      // Check suspicious activity
      const suspiciousActivity: string[] = [];
      const threats = await db.collection('reviewThreats')
        .where('status', '==', 'confirmed')
        .limit(10)
        .get();
      
      threats.forEach(doc => {
        const threat = doc.data();
        if (threat.signals) {
          suspiciousActivity.push(...threat.signals);
        }
      });

      trustScore -= suspiciousActivity.length * 5;

      // Normalize to 0-100
      trustScore = Math.max(0, Math.min(100, trustScore));

      // Calculate weight multiplier (0.0 - 2.0)
      let weightMultiplier = 1.0;
      if (trustScore > 80) weightMultiplier = 1.5;
      else if (trustScore > 90) weightMultiplier = 2.0;
      else if (trustScore < 30) weightMultiplier = 0.5;
      else if (trustScore < 20) weightMultiplier = 0.0;

      const trustData: TrustScore = {
        userId,
        trustScore,
        storeWeightMultiplier: weightMultiplier,
        fraudHistoryScore: fraudFlags.size,
        verifiedIdentity: userData.verified || false,
        accountAge: accountAgeDays,
        reviewsGiven: reviewsGiven.size,
        suspiciousActivity,
        updatedAt: Timestamp.now()
      };

      const trustRef = db.collection('users').doc(userId).collection('trustScore').doc('current');
      batch.set(trustRef, trustData, { merge: true });

      updateCount++;
    }

    await batch.commit();

    console.log(`Updated trust scores for ${updateCount} users`);
    return null;
  });

// ============================================
// 3. ASO OPTIMIZATION AUTOPILOT
// ============================================

/**
 * Track ASO metrics
 */
export const pack376_trackASOMetrics = functions.https.onCall(async (data, context) => {
  // Admin only
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }

  const { platform, metricType, value, keyword, retentionDay, metadata } = data;

  const metricData: ASOMetrics = {
    platform,
    date: new Date().toISOString().split('T')[0],
    metricType,
    value,
    keyword,
    retentionDay,
    metadata: metadata || {},
    createdAt: Timestamp.now()
  };

  await db.collection('asoMetrics').add(metricData);

  return { success: true };
});

/**
 * Generate keyword optimization hints
 */
export const pack376_generateKeywordOptimizationHints = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const platforms = ['ios', 'android'];

    for (const platform of platforms) {
      // Get recent keyword rankings
      const keywordMetrics = await db.collection('asoMetrics')
        .where('platform', '==', platform)
        .where('metricType', '==', 'keyword_ranking')
        .orderBy('date', 'desc')
        .limit(100)
        .get();

      const keywordPerformance: Record<string, number[]> = {};

      keywordMetrics.forEach(doc => {
        const data = doc.data();
        if (data.keyword) {
          if (!keywordPerformance[data.keyword]) {
            keywordPerformance[data.keyword] = [];
          }
          keywordPerformance[data.keyword].push(data.value);
        }
      });

      // Generate hints
      const hints: string[] = [];
      for (const [keyword, rankings] of Object.entries(keywordPerformance)) {
        const avgRanking = rankings.reduce((a, b) => a + b, 0) / rankings.length;
        
        if (avgRanking > 50) {
          hints.push(`Consider dropping low-performing keyword: "${keyword}" (avg rank: ${avgRanking.toFixed(0)})`);
        } else if (avgRanking < 10) {
          hints.push(`Strong performer: "${keyword}" (avg rank: ${avgRanking.toFixed(0)}) - consider similar keywords`);
        }
      }

      // Store hints
      await db.collection('asoMetrics').add({
        platform,
        date: new Date().toISOString().split('T')[0],
        metricType: 'optimization_hints',
        value: hints.length,
        metadata: { hints },
        createdAt: Timestamp.now()
      });
    }

    return null;
  });

// ============================================
// 4. POSITIVE REVIEW ACTIVATION LAYER
// ============================================

/**
 * Trigger review request (safe mode)
 */
export const pack376_triggerReviewRequest = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { trigger } = data;
  const userId = context.auth.uid;

  // Check feature flag
  const flagsDoc = await db.collection('featureFlags').doc('reviews').get();
  const flags = flagsDoc.data() || {};

  if (!flags['reviews.ask.enabled']) {
    return { success: false, reason: 'review_requests_disabled' };
  }

  // Check if in anti-attack mode
  if (flags['antiAttackMode']) {
    return { success: false, reason: 'anti_attack_mode_active' };
  }

  // Check fraud suspicion (PACK 302)
  const fraudDoc = await db.collection('fraudDetection')
    .where('userId', '==', userId)
    .where('status', 'in', ['investigating', 'flagged'])
    .limit(1)
    .get();

  if (!fraudDoc.empty) {
    return { success: false, reason: 'fraud_suspicion' };
  }

  // Check rate limit: max 1 review ask per 14 days
  const recentRequests = await db.collection('reviewRequests')
    .where('userId', '==', userId)
    .where('requestedAt', '>', Timestamp.fromMillis(Date.now() - 14 * 24 * 60 * 60 * 1000))
    .get();

  if (!recentRequests.empty) {
    return { success: false, reason: 'rate_limited' };
  }

  // Create review request
  const requestData: ReviewRequest = {
    userId,
    trigger,
    requestedAt: Timestamp.now(),
    responded: false,
    reviewGiven: false
  };

  const requestRef = await db.collection('reviewRequests').add(requestData);

  // Log in audit trail (PACK 296)
  await db.collection('auditLogs').add({
    action: 'review_request_sent',
    userId,
    requestId: requestRef.id,
    trigger,
    timestamp: Timestamp.now()
  });

  return {
    success: true,
    requestId: requestRef.id,
    canRequest: true
  };
});

// ============================================
// 5. REPUTATION DAMAGE CONTROL
// ============================================

/**
 * Monitor reputation and trigger damage control
 */
export const pack376_reputationDamageControl = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    const platforms = ['ios', 'android'];

    for (const platform of platforms) {
      // Calculate current rating
      const recentReviews = await db.collection('storeReviews')
        .where('platform', '==', platform)
        .where('excludeFromRating', '!=', true)
        .where('createdAt', '>', Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .get();

      let totalRating = 0;
      let count = 0;

      recentReviews.forEach(doc => {
        const review = doc.data();
        const trustDoc = db.collection('users').doc(review.userId).collection('trustScore').doc('current');
        // Weight by trust score (would need to fetch, simplified here)
        totalRating += review.rating;
        count++;
      });

      const avgRating = count > 0 ? totalRating / count : 5.0;

      // Threshold: 4.0
      if (avgRating < 4.0) {
        console.log(`⚠️ Rating drop detected for ${platform}: ${avgRating.toFixed(2)}`);

        // Auto-cooldown on review prompts
        await db.collection('featureFlags').doc('reviews').update({
          'reviews.ask.enabled': false,
          'cooldownReason': 'rating_drop',
          'cooldownAt': Timestamp.now()
        });

        // Trigger win-back campaigns (PACK 301B)
        await db.collection('campaigns').add({
          type: 'win_back',
          reason: 'rating_drop',
          platform,
          avgRating,
          targetSegment: 'churned_users',
          createdAt: Timestamp.now()
        });

        // Priority support routing (PACK 300A)
        await db.collection('supportConfig').doc('routing').update({
          priorityMode: true,
          reason: 'reputation_crisis',
          activatedAt: Timestamp.now()
        });

        // Store appeal preparation mode
        await db.collection('reputationMetrics').doc('current').set({
          platform,
          avgRating,
          status: 'damage_control',
          appealPrepMode: true,
          detectedAt: Timestamp.now()
        }, { merge: true });
      } else {
        // Good rating - ensure cooldown is off
        const flagsDoc = await db.collection('featureFlags').doc('reviews').get();
        const flags = flagsDoc.data() || {};
        
        if (flags.cooldownReason === 'rating_drop') {
          await db.collection('featureFlags').doc('reviews').update({
            'reviews.ask.enabled': true,
            'cooldownReason': admin.firestore.FieldValue.delete(),
            'cooldownAt': admin.firestore.FieldValue.delete()
          });
        }
      }

      // Update metrics
      await db.collection('reputationMetrics').add({
        platform,
        date: new Date().toISOString().split('T')[0],
        avgRating,
        reviewCount: count,
        createdAt: Timestamp.now()
      });
    }

    return null;
  });

// ============================================
// 6. PUBLIC TRUST SIGNALS
// ============================================

/**
 * Generate trust signals for users
 */
export const pack376_generateTrustSignals = functions.pubsub
  .schedule('every 12 hours')
  .onRun(async () => {
    const usersSnapshot = await db.collection('users').limit(500).get();

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();

      const signals: TrustSignal[] = [];

      // Verified user badge
      if (userData.verified) {
        signals.push({
          userId,
          signalType: 'verified_user',
          level: 'gold',
          issuedAt: Timestamp.now()
        });
      }

      // ID verified (PACK 110)
      if (userData.idVerified) {
        signals.push({
          userId,
          signalType: 'id_verified',
          level: 'platinum',
          issuedAt: Timestamp.now()
        });
      }

      // Safe meetings enabled (PACK 240+)
      const safetyDoc = await db.collection('userSafety').doc(userId).get();
      if (safetyDoc.exists && safetyDoc.data()?.safeMeetingsEnabled) {
        signals.push({
          userId,
          signalType: 'safe_meetings',
          level: 'gold',
          issuedAt: Timestamp.now()
        });
      }

      // Panic button active (PACK 300A)
      if (safetyDoc.exists && safetyDoc.data()?.panicButtonEnabled) {
        signals.push({
          userId,
          signalType: 'panic_button',
          level: 'platinum',
          issuedAt: Timestamp.now()
        });
      }

      // Verified creator
      if (userData.creatorVerified) {
        signals.push({
          userId,
          signalType: 'verified_creator',
          level: 'platinum',
          issuedAt: Timestamp.now()
        });
      }

      // Store signals
      const batch = db.batch();
      for (const signal of signals) {
        const signalRef = db.collection('trustSignals').doc(`${userId}_${signal.signalType}`);
        batch.set(signalRef, signal, { merge: true });
      }
      await batch.commit();
    }

    return null;
  });

// ============================================
// HELPER FUNCTIONS
// ============================================

async function calculateSessionAge(userId: string): Promise<number> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return 0;
  
  const createdAt = userDoc.data()!.createdAt;
  const ageMs = Date.now() - createdAt.toMillis();
  return ageMs / (1000 * 60 * 60); // hours
}

async function analyzeSentiment(text: string): Promise<number> {
  // Simplified sentiment analysis (0-100, 50 is neutral)
  // In production, use ML/NLP service
  const positiveWords = ['great', 'amazing', 'love', 'excellent', 'fantastic', 'wonderful'];
  const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'poor', 'worst'];
  
  let score = 50;
  const lowerText = text.toLowerCase();
  
  positiveWords.forEach(word => {
    if (lowerText.includes(word)) score += 10;
  });
  
  negativeWords.forEach(word => {
    if (lowerText.includes(word)) score -= 10;
  });
  
  return Math.max(0, Math.min(100, score));
}

async function notifyTrustTeam(alert: any): Promise<void> {
  // Send notification to trust & safety team
  const adminUsers = await db.collection('users')
    .where('role', 'in', ['admin', 'security'])
    .get();

  const batch = db.batch();
  adminUsers.forEach(doc => {
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      userId: doc.id,
      type: 'security_alert',
      priority: 'critical',
      alert,
      createdAt: Timestamp.now(),
      read: false
    });
  });

  await batch.commit();
}
