/**
 * PACK 379 — Global ASO, Reviews, Reputation & Store Defense Engine
 * 
 * Protects Avalo from store bans, review attacks, reputation manipulation,
 * and ASO sabotage while maximizing App Store & Google Play ranking.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { levenshtein } from './utils/string-similarity';

// Mock functions for dependencies (will be replaced with actual implementations)
async function sendTrustTeamAlert(data: any): Promise<void> {
  console.log('Trust team alert:', data);
  // TODO: Integrate with PACK 300 when available
}

async function logAuditEvent(data: any): Promise<void> {
  console.log('Audit event:', data);
  // TODO: Integrate with PACK 296 when available
}

async function getFraudScore(userId: string): Promise<number> {
  // TODO: Integrate with PACK 302 when available
  return 0;
}

async function getTaxComplianceStatus(userId: string): Promise<any> {
  // TODO: Integrate with PACK 378 when available
  return { compliant: true };
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// ========================================
// TYPES & INTERFACES
// ========================================

interface ReviewData {
  platform: 'ios' | 'android';
  rating: number;
  text: string;
  country: string;
  reviewId: string;
  authorId?: string;
  ipAddress?: string;
  deviceFingerprint?: string;
  timestamp: admin.firestore.Timestamp;
}

interface AttackPattern {
  type: 'velocity' | 'repetition' | 'coordinated' | 'bot';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  indicators: string[];
}

interface TrustScoreFactors {
  supportHistory: number; // 0-100
  fraudHistory: number; // 0-100
  paymentBehavior: number; // 0-100
  reportBehavior: number; // 0-100
  verificationDepth: number; // 0-100
  accountAge: number; // days
}

interface ASOMetrics {
  platform: 'ios' | 'android';
  country: string;
  date: string;
  impressions: number;
  installs: number;
  conversionRate: number;
  avgRating: number;
  totalReviews: number;
  keywords: KeywordRanking[];
}

interface KeywordRanking {
  keyword: string;
  rank: number;
  searchVolume: number;
  difficulty: number;
}

// ========================================
// 1. REVIEW DEFENSE & MANIPULATION DETECTION
// ========================================

/**
 * Detects review attacks and manipulation patterns
 * Triggered on new review ingestion from App Store Connect / Google Play API
 */
export const pack379_reviewAttackDetector = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const fifteenMinutesAgo = new Date(now.toMillis() - 15 * 60 * 1000);
    
    // Get recent reviews
    const recentReviews = await db.collection('storeReviewSecurity')
      .where('createdAt', '>=', fifteenMinutesAgo)
      .get();
    
    if (recentReviews.empty) {
      console.log('No recent reviews to analyze');
      return null;
    }
    
    const reviews = recentReviews.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];
    
    // Analyze patterns
    const velocityAttack = await detectVelocityAttack(reviews);
    const repetitionAttack = await detectRepetitionAttack(reviews);
    const coordinatedAttack = await detectCoordinatedAttack(reviews);
    const botAttack = await detectBotAttack(reviews);
    
    const attacks = [velocityAttack, repetitionAttack, coordinatedAttack, botAttack]
      .filter(attack => attack !== null);
    
    if (attacks.length > 0) {
      // Create alert
      const alertRef = await db.collection('reviewAttackAlerts').add({
        detectedAt: now,
        attacks: attacks,
        severity: calculateAttackSeverity(attacks),
        status: 'active',
        affectedReviews: reviews.length,
        autoActions: [],
        createdAt: now,
        updatedAt: now
      });
      
      // Execute auto-actions
      await executeAttackAutoActions(alertRef.id, attacks, reviews);
      
      // Log audit event
      await logAuditEvent({
        eventType: 'review_attack_detected',
        severity: 'critical',
        metadata: {
          alertId: alertRef.id,
          attackTypes: attacks.map(a => a.type),
          affectedReviews: reviews.length
        }
      });
    }
    
    return { analyzed: reviews.length, attacks: attacks.length };
  });

async function detectVelocityAttack(reviews: any[]): Promise<AttackPattern | null> {
  const oneStarReviews = reviews.filter(r => r.rating === 1);
  const velocityThreshold = 10; // More than 10 1-star reviews in 15min
  
  if (oneStarReviews.length >= velocityThreshold) {
    // Group by country
    const byCountry = groupBy(oneStarReviews, 'country');
    const suspiciousCountries = Object.entries(byCountry)
      .filter(([_, reviews]) => (reviews as any[]).length >= 5)
      .map(([country]) => country);
    
    if (suspiciousCountries.length > 0) {
      return {
        type: 'velocity',
        severity: oneStarReviews.length > 20 ? 'critical' : 'high',
        confidence: Math.min(oneStarReviews.length / velocityThreshold, 1),
        indicators: [
          `${oneStarReviews.length} 1-star reviews in 15 minutes`,
          `Concentrated in: ${suspiciousCountries.join(', ')}`
        ]
      };
    }
  }
  
  return null;
}

async function detectRepetitionAttack(reviews: any[]): Promise<AttackPattern | null> {
  const reviewTexts = reviews.map(r => r.text?.toLowerCase() || '');
  const similarities: { pair: [number, number], similarity: number }[] = [];
  
  // Compare all pairs
  for (let i = 0; i < reviewTexts.length; i++) {
    for (let j = i + 1; j < reviewTexts.length; j++) {
      if (reviewTexts[i] && reviewTexts[j]) {
        const similarity = calculateTextSimilarity(reviewTexts[i], reviewTexts[j]);
        if (similarity > 0.8) {
          similarities.push({ pair: [i, j], similarity });
        }
      }
    }
  }
  
  if (similarities.length >= 3) {
    return {
      type: 'repetition',
      severity: similarities.length > 10 ? 'critical' : 'high',
      confidence: similarities.length / reviews.length,
      indicators: [
        `${similarities.length} highly similar review pairs detected`,
        `Avg similarity: ${(similarities.reduce((sum, s) => sum + s.similarity, 0) / similarities.length * 100).toFixed(1)}%`
      ]
    };
  }
  
  return null;
}

async function detectCoordinatedAttack(reviews: any[]): Promise<AttackPattern | null> {
  const reviewsByIP = groupBy(reviews.filter(r => r.ipAddress), 'ipAddress');
  const reviewsByDevice = groupBy(reviews.filter(r => r.deviceFingerprint), 'deviceFingerprint');
  
  const suspiciousIPs = Object.entries(reviewsByIP)
    .filter(([_, reviews]) => (reviews as any[]).length >= 3);
  
  const suspiciousDevices = Object.entries(reviewsByDevice)
    .filter(([_, reviews]) => (reviews as any[]).length >= 3);
  
  if (suspiciousIPs.length > 0 || suspiciousDevices.length > 0) {
    return {
      type: 'coordinated',
      severity: (suspiciousIPs.length + suspiciousDevices.length) > 5 ? 'critical' : 'high',
      confidence: 0.9,
      indicators: [
        `${suspiciousIPs.length} IPs with multiple reviews`,
        `${suspiciousDevices.length} devices with multiple reviews`
      ]
    };
  }
  
  return null;
}

async function detectBotAttack(reviews: any[]): Promise<AttackPattern | null> {
  // Bot fingerprints: very short reviews, generic text, no profile data
  const botIndicators = reviews.map(review => {
    let score = 0;
    if (!review.text || review.text.length < 10) score += 2;
    if (!review.authorId) score += 1;
    if (review.text && /^(bad|terrible|horrible|worst|scam)$/i.test(review.text)) score += 2;
    if (review.deviceFingerprint && review.deviceFingerprint.includes('bot')) score += 3;
    return score;
  });
  
  const suspiciousBots = botIndicators.filter(score => score >= 3).length;
  
  if (suspiciousBots >= 5) {
    return {
      type: 'bot',
      severity: suspiciousBots > 15 ? 'critical' : 'high',
      confidence: suspiciousBots / reviews.length,
      indicators: [
        `${suspiciousBots} reviews with bot fingerprints`,
        'Generic text patterns detected',
        'Missing user profile data'
      ]
    };
  }
  
  return null;
}

function calculateAttackSeverity(attacks: AttackPattern[]): 'low' | 'medium' | 'high' | 'critical' {
  const criticalCount = attacks.filter(a => a.severity === 'critical').length;
  const highCount = attacks.filter(a => a.severity === 'high').length;
  
  if (criticalCount > 0) return 'critical';
  if (highCount >= 2) return 'critical';
  if (highCount >= 1) return 'high';
  return 'medium';
}

async function executeAttackAutoActions(alertId: string, attacks: AttackPattern[], reviews: any[]) {
  const actions = [];
  
  // Flag reviews as suspicious
  const batch = db.batch();
  reviews.forEach(review => {
    batch.update(db.collection('storeReviewSecurity').doc(review.id), {
      flaggedAsAttack: true,
      flaggedAt: admin.firestore.Timestamp.now(),
      alertId: alertId
    });
  });
  await batch.commit();
  actions.push('flagged_reviews');
  
  // Notify trust team
  await sendTrustTeamAlert({
    type: 'review_attack',
    title: 'Review Attack Detected',
    message: `${attacks.length} attack patterns detected affecting ${reviews.length} reviews`,
    severity: calculateAttackSeverity(attacks),
    data: { alertId, attacks: attacks.map(a => a.type) }
  });
  actions.push('notified_trust_team');
  
  // Check if we should trigger crisis mode
  const severity = calculateAttackSeverity(attacks);
  if (severity === 'critical') {
    await triggerCrisisMode('review_bomb', {
      alertId,
      attackTypes: attacks.map(a => a.type),
      affectedReviews: reviews.length
    });
    actions.push('triggered_crisis_mode');
  }
  
  // Update alert with actions taken
  await db.collection('reviewAttackAlerts').doc(alertId).update({
    autoActions: actions,
    updatedAt: admin.firestore.Timestamp.now()
  });
  
  return actions;
}

/**
 * Fake review classifier using ML patterns
 */
export const pack379_fakeReviewClassifier = functions.firestore
  .document('storeReviewSecurity/{reviewId}')
  .onCreate(async (snap, context) => {
    const review = snap.data();
    
    // Calculate suspicion score
    let suspicionScore = 0;
    const indicators = [];
    
    // 1. Text analysis
    if (!review.text || review.text.length < 10) {
      suspicionScore += 20;
      indicators.push('Very short review text');
    }
    
    // 2. Generic phrases
    const genericPhrases = ['bad app', 'worst app', 'terrible', 'scam', 'fake', 'fraud'];
    if (review.text && genericPhrases.some(phrase => review.text.toLowerCase().includes(phrase))) {
      suspicionScore += 15;
      indicators.push('Generic negative phrases');
    }
    
    // 3. Account age (if available)
    if (review.authorAccountAge && review.authorAccountAge < 7) {
      suspicionScore += 25;
      indicators.push('New account (< 7 days)');
    }
    
    // 4. No previous reviews
    if (review.authorReviewCount === 0) {
      suspicionScore += 15;
      indicators.push('First review from user');
    }
    
    // 5. Rating vs text mismatch
    if (review.rating === 1 && review.text && review.text.length > 100) {
      // Long negative reviews might be legitimate
      suspicionScore -= 10;
    }
    
    // Update with classification
    await snap.ref.update({
      suspicionScore,
      suspicionLevel: suspicionScore > 60 ? 'high' : suspicionScore > 30 ? 'medium' : 'low',
      suspicionIndicators: indicators,
      classifiedAt: admin.firestore.Timestamp.now()
    });
    
    // If high suspicion, add to dispute queue
    if (suspicionScore > 60) {
      await db.collection('reviewDisputeQueue').add({
        reviewId: context.params.reviewId,
        platform: review.platform,
        suspicionScore,
        indicators,
        status: 'pending',
        createdAt: admin.firestore.Timestamp.now()
      });
    }
    
    return { suspicionScore, indicators };
  });

/**
 * Review velocity guard - monitors and throttles
 */
export const pack379_reviewVelocityGuard = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const fiveMinutesAgo = new Date(now.toMillis() - 5 * 60 * 1000);
    
    // Check velocity by country
    const recentReviews = await db.collection('storeReviewSecurity')
      .where('createdAt', '>=', fiveMinutesAgo)
      .get();
    
    const byCountry = groupBy(recentReviews.docs.map(d => d.data()), 'country');
    
    const alerts = [];
    for (const [country, reviews] of Object.entries(byCountry)) {
      const reviewArray = reviews as any[];
      const oneStars = reviewArray.filter(r => r.rating === 1).length;
      
      // Alert if more than 5 1-star reviews in 5 min from same country
      if (oneStars >= 5) {
        alerts.push({
          country,
          count: oneStars,
          velocity: oneStars / 5, // per minute
          timestamp: now
        });
        
        // Update velocity metrics
        await db.collection('reviewVelocityMetrics').doc(`${country}-${now.toDate().toISOString().split('T')[0]}`).set({
          country,
          date: now.toDate().toISOString().split('T')[0],
          peakVelocity: oneStars / 5,
          totalReviews: reviewArray.length,
          oneStars: oneStars,
          detectedAt: now
        }, { merge: true });
      }
    }
    
    return { alerts };
  });

// ========================================
// 2. STORE DISPUTE AUTOMATION
// ========================================

/**
 * Generates store dispute packets with legal references
 */
export const pack379_storeDisputeGenerator = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  // Verify admin
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || !['admin', 'trust_team'].includes(userDoc.data()?.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Must be admin or trust team');
  }
  
  const { reviewIds, disputeReason, platform } = data;
  
  // Fetch review data
  const reviews = await Promise.all(
    reviewIds.map((id: string) => db.collection('storeReviewSecurity').doc(id).get())
  );
  
  // Generate dispute packet
  const disputePacket = {
    platform,
    reviewCount: reviews.length,
    disputeReason,
    evidence: {
      abuseClassification: await classifyAbuse(reviews),
      timestampCorrelation: await analyzeTimestamps(reviews),
      ipPatterns: await analyzeIPPatterns(reviews),
      fraudLinkage: await linkToFraudSystem(reviews),
      legalReferences: generateLegalReferences(platform)
    },
    generatedAt: admin.firestore.Timestamp.now(),
    generatedBy: context.auth.uid,
    status: 'draft'
  };
  
  // Save dispute bundle
  const bundleRef = await db.collection('reviewDisputeBundles').add(disputePacket);
  
  return { bundleId: bundleRef.id, packet: disputePacket };
});

/**
 * Auto-submits dispute appeals to store APIs (when available)
 */
export const pack379_storeAppealAutoSubmit = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const { bundleId } = data;
  
  const bundleDoc = await db.collection('reviewDisputeBundles').doc(bundleId).get();
  if (!bundleDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Bundle not found');
  }
  
  const bundle = bundleDoc.data();
  
  // In production, this would call App Store Connect API / Google Play Developer API
  // For now, we'll mark as ready for manual submission
  
  await bundleDoc.ref.update({
    status: 'ready_for_submission',
    preparedAt: admin.firestore.Timestamp.now(),
    preparedBy: context.auth.uid
  });
  
  // Log audit
  await logAuditEvent({
    eventType: 'dispute_prepared',
    userId: context.auth.uid,
    metadata: { bundleId, platform: bundle.platform }
  });
  
  return { success: true, bundleId, status: 'ready_for_submission' };
});

// Helper functions for dispute generation
async function classifyAbuse(reviews: admin.firestore.DocumentSnapshot[]): Promise<string[]> {
  const classifications = new Set<string>();
  
  reviews.forEach(review => {
    const data = review.data();
    if (data?.suspicionLevel === 'high') classifications.add('fake_review');
    if (data?.suspicionScore > 70) classifications.add('bot_generated');
    if (data?.flaggedAsAttack) classifications.add('coordinated_attack');
  });
  
  return Array.from(classifications);
}

async function analyzeTimestamps(reviews: admin.firestore.DocumentSnapshot[]): Promise<any> {
  const timestamps = reviews.map(r => r.data()?.createdAt?.toMillis() || 0);
  const sorted = timestamps.sort((a, b) => a - b);
  
  // Calculate intervals
  const intervals = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(sorted[i] - sorted[i - 1]);
  }
  
  const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
  
  return {
    reviewCount: reviews.length,
    timeSpan: sorted[sorted.length - 1] - sorted[0],
    avgInterval: avgInterval,
    suspiciouslyUniform: intervals.every(i => Math.abs(i - avgInterval) < avgInterval * 0.2)
  };
}

async function analyzeIPPatterns(reviews: admin.firestore.DocumentSnapshot[]): Promise<any> {
  const ipCounts = new Map<string, number>();
  
  reviews.forEach(review => {
    const ip = review.data()?.ipAddress;
    if (ip) {
      ipCounts.set(ip, (ipCounts.get(ip) || 0) + 1);
    }
  });
  
  return {
    uniqueIPs: ipCounts.size,
    duplicateIPs: Array.from(ipCounts.entries()).filter(([_, count]) => count > 1).length,
    maxReviewsPerIP: Math.max(...Array.from(ipCounts.values()))
  };
}

async function linkToFraudSystem(reviews: admin.firestore.DocumentSnapshot[]): Promise<any> {
  const userIds = reviews
    .map(r => r.data()?.authorId)
    .filter(id => id);
  
  if (userIds.length === 0) return { linkedUsers: 0 };
  
  // Check fraud scores
  const fraudChecks = await Promise.all(
    userIds.map(async (userId) => {
      try {
        const score = await getFraudScore(userId);
        return { userId, score };
      } catch (e) {
        return { userId, score: 0 };
      }
    })
  );
  
  return {
    linkedUsers: userIds.length,
    highRiskUsers: fraudChecks.filter(f => f.score > 70).length,
    avgFraudScore: fraudChecks.reduce((sum, f) => sum + f.score, 0) / fraudChecks.length
  };
}

function generateLegalReferences(platform: string): string[] {
  const references = [
    'Consumer Review Fairness Act (US)',
    'GDPR Article 17 (Right to Erasure)',
    'Digital Services Act (EU)',
    'FTC Guidelines on Deceptive Practices'
  ];
  
  if (platform === 'ios') {
    references.push('App Store Review Guidelines 5.6');
  } else if (platform === 'android') {
    references.push('Google Play Developer Policy - User-Generated Content');
  }
  
  return references;
}

// ========================================
// 3. ASO BOOST ENGINE
// ========================================

/**
 * ASO optimization engine - analyzes and suggests improvements
 */
export const pack379_asoBoostOptimizer = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    
    // Fetch latest metrics for both platforms
    const iosMetrics = await fetchLatestASOMetrics('ios');
    const androidMetrics = await fetchLatestASOMetrics('android');
    
    // Generate optimizations
    const optimizations = [];
    
    // iOS optimizations
    if (iosMetrics) {
      const iosOpts = await generateASOOptimizations('ios', iosMetrics);
      optimizations.push(...iosOpts);
    }
    
    // Android optimizations
    if (androidMetrics) {
      const androidOpts = await generateASOOptimizations('android', androidMetrics);
      optimizations.push(...androidOpts);
    }
    
    // Save optimizations
    for (const opt of optimizations) {
      await db.collection('asoOptimizations').add({
        ...opt,
        createdAt: now,
        status: 'pending_review',
        appliedAt: null
      });
    }
    
    return { generated: optimizations.length };
  });

async function fetchLatestASOMetrics(platform: 'ios' | 'android'): Promise<any> {
  const snapshot = await db.collection('asoMetrics')
    .where('platform', '==', platform)
    .orderBy('date', 'desc')
    .limit(1)
    .get();
  
  return snapshot.empty ? null : snapshot.docs[0].data();
}

async function generateASOOptimizations(platform: string, metrics: any): Promise<any[]> {
  const optimizations = [];
  
  // Conversion rate optimization
  if (metrics.conversionRate < 0.25) {
    optimizations.push({
      type: 'conversion_rate',
      platform,
      priority: 'high',
      suggestion: 'Conversion rate below 25%. Consider updating screenshots and app preview video.',
      expectedImpact: 'Could increase installs by 15-30%',
      actionItems: [
        'A/B test new screenshot set',
        'Update app preview video',
        'Refine subtitle messaging'
      ]
    });
  }
  
  // Keyword optimization
  if (metrics.keywords) {
    const lowRankingKeywords = metrics.keywords.filter((k: any) => k.rank > 50);
    if (lowRankingKeywords.length > 5) {
      optimizations.push({
        type: 'keyword_ranking',
        platform,
        priority: 'medium',
        suggestion: `${lowRankingKeywords.length} keywords ranking below position 50`,
        expectedImpact: 'Could increase organic installs by 10-20%',
        actionItems: lowRankingKeywords.slice(0, 3).map((k: any) => 
          `Improve ranking for "${k.keyword}" (currently #${k.rank})`
        )
      });
    }
  }
  
  // Rating optimization
  if (metrics.avgRating < 4.5) {
    optimizations.push({
      type: 'rating_improvement',
      platform,
      priority: 'critical',
      suggestion: `Average rating is ${metrics.avgRating}. Should target 4.5+`,
      expectedImpact: 'Could increase conversion rate by 20-40%',
      actionItems: [
        'Implement proactive review prompts',
        'Address top negative feedback themes',
        'Improve onboarding experience'
      ]
    });
  }
  
  return optimizations;
}

/**
 * Keyword clustering engine for ASO
 */
export const pack379_keywordClusteringEngine = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const { platform, keywords } = data;
  
  // Cluster keywords by semantic similarity
  const clusters = await clusterKeywords(keywords);
  
  // Calculate cluster metrics
  const clusterMetrics = clusters.map(cluster => ({
    mainKeyword: cluster[0],
    relatedKeywords: cluster.slice(1),
    totalSearchVolume: cluster.reduce((sum: number, k: any) => sum + (k.searchVolume || 0), 0),
    avgDifficulty: cluster.reduce((sum: number, k: any) => sum + (k.difficulty || 0), 0) / cluster.length,
    potentialRank: estimatePotentialRank(cluster)
  }));
  
  return { clusters: clusterMetrics };
});

async function clusterKeywords(keywords: any[]): Promise<any[][]> {
  // Simple clustering based on keyword overlap
  const clusters: any[][] = [];
  const used = new Set();
  
  for (const kw of keywords) {
    if (used.has(kw.keyword)) continue;
    
    const cluster = [kw];
    used.add(kw.keyword);
    
    // Find related keywords
    for (const other of keywords) {
      if (used.has(other.keyword)) continue;
      
      if (areKeywordsRelated(kw.keyword, other.keyword)) {
        cluster.push(other);
        used.add(other.keyword);
      }
    }
    
    if (cluster.length > 0) {
      clusters.push(cluster);
    }
  }
  
  return clusters;
}

function areKeywordsRelated(kw1: string, kw2: string): boolean {
  const words1 = kw1.toLowerCase().split(' ');
  const words2 = kw2.toLowerCase().split(' ');
  
  // Check for word overlap
  const overlap = words1.filter(w => words2.includes(w)).length;
  return overlap >= Math.min(words1.length, words2.length) * 0.5;
}

function estimatePotentialRank(cluster: any[]): number {
  // Simplified rank estimation
  const avgDifficulty = cluster.reduce((sum: number, k: any) => sum + (k.difficulty || 50), 0) / cluster.length;
  return Math.max(1, Math.floor(avgDifficulty / 2));
}

/**
 * Store algorithm response monitor
 */
export const pack379_storeAlgorithmResponse = functions.pubsub
  .schedule('every 12 hours')
  .onRun(async (context) => {
    // Monitor algorithm changes and ranking volatility
    const recentMetrics = await db.collection('asoMetrics')
      .where('date', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .orderBy('date', 'desc')
      .get();
    
    const byPlatform = groupBy(recentMetrics.docs.map(d => d.data()), 'platform');
    
    for (const [platform, metrics] of Object.entries(byPlatform)) {
      const metricsArray = metrics as any[];
      
      // Calculate volatility
      const conversionRates = metricsArray.map(m => m.conversionRate);
      const volatility = calculateVolatility(conversionRates);
      
      if (volatility > 0.2) {
        // High volatility detected
        await db.collection('storeAlgorithmAlerts').add({
          platform,
          volatility,
          severity: volatility > 0.4 ? 'high' : 'medium',
          message: `High ranking volatility detected on ${platform}`,
          detectedAt: admin.firestore.Timestamp.now()
        });
      }
    }
    
    return null;
  });

function calculateVolatility(values: number[]): number {
  if (values.length < 2) return 0;
  
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance) / mean;
}

// ========================================
// 4. USER TRUST SCORE ENGINE
// ========================================

/**
 * Computes comprehensive trust score for users
 */
export const pack379_trustScoreEngine = functions.firestore
  .document('users/{userId}')
  .onWrite(async (change, context) => {
    const userId = context.params.userId;
    
    // Calculate trust score
    const trustScore = await calculateTrustScore(userId);
    
    // Save trust score
    await db.collection('userTrustScores').doc(userId).set({
      userId,
      score: trustScore.overall,
      riskLevel: trustScore.riskLevel,
      factors: trustScore.factors,
      computedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    }, { merge: true });
    
    // Record history
    await db.collection('userTrustScores').doc(userId)
      .collection('history').add({
        score: trustScore.overall,
        factors: trustScore.factors,
        timestamp: admin.firestore.Timestamp.now()
      });
    
    return trustScore;
  });

async function calculateTrustScore(userId: string): Promise<any> {
  const factors: any = {
    supportHistory: 100,
    fraudHistory: 100,
    paymentBehavior: 100,
    reportBehavior: 100,
    verificationDepth: 0,
    accountAge: 0
  };
  
  // 1. Support history (PACK 300/300A)
  const supportTickets = await db.collection('supportTickets')
    .where('userId', '==', userId)
    .get();
  
  const negativeTickets = supportTickets.docs.filter(d => 
    ['refund_requested', 'complaint', 'dispute'].includes(d.data().type)
  ).length;
  
  factors.supportHistory = Math.max(0, 100 - (negativeTickets * 10));
  
  // 2. Fraud history (PACK 302)
  try {
    const fraudScore = await getFraudScore(userId);
    factors.fraudHistory = Math.max(0, 100 - fraudScore);
  } catch (e) {
    factors.fraudHistory = 100;
  }
  
  // 3. Payment behavior (PACK 277)
  const payments = await db.collection('transactions')
    .where('userId', '==', userId)
    .get();
  
  const chargebacks = payments.docs.filter(d => d.data().status === 'chargeback').length;
  const successfulPayments = payments.docs.filter(d => d.data().status === 'completed').length;
  
  if (payments.size > 0) {
    factors.paymentBehavior = Math.max(0, 100 - (chargebacks * 20)) * (successfulPayments / payments.size);
  }
  
  // 4. Report behavior
  const reports = await db.collection('userReports')
    .where('reportedBy', '==', userId)
    .get();
  
  const validReports = reports.docs.filter(d => d.data().status === 'confirmed').length;
  const falseReports = reports.docs.filter(d => d.data().status === 'false_report').length;
  
  if (reports.size > 0) {
    factors.reportBehavior = Math.min(100, (validReports / reports.size) * 100 - (falseReports * 20));
  }
  
  // 5. Verification depth
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  if (userData) {
    let verificationScore = 0;
    if (userData.emailVerified) verificationScore += 20;
    if (userData.phoneVerified) verificationScore += 30;
    if (userData.idVerified) verificationScore += 50;
    factors.verificationDepth = verificationScore;
  }
  
  // 6. Account age
  if (userData?.createdAt) {
    const accountAge = (Date.now() - userData.createdAt.toMillis()) / (1000 * 60 * 60 * 24);
    factors.accountAge = Math.min(100, accountAge * 2); // 50 days = 100 points
  }
  
  // Calculate overall score (weighted average)
  const weights = {
    supportHistory: 0.15,
    fraudHistory: 0.25,
    paymentBehavior: 0.20,
    reportBehavior: 0.15,
    verificationDepth: 0.15,
    accountAge: 0.10
  };
  
  const overall = Object.entries(factors).reduce((sum, [key, value]) => {
    return sum + (value as number) * weights[key as keyof typeof weights];
  }, 0);
  
  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  if (overall >= 80) riskLevel = 'low';
  else if (overall >= 60) riskLevel = 'medium';
  else if (overall >= 40) riskLevel = 'high';
  else riskLevel = 'critical';
  
  return { overall: Math.round(overall), riskLevel, factors };
}

// ========================================
// 5. STORE COMPLIANCE MONITORING
// ========================================

/**
 * Watches for store policy changes and compliance risks
 */
export const pack379_storePolicyWatcher = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    // In production, this would scrape/monitor:
    // - App Store Review Guidelines
    // - Google Play Developer Policy
    // - Regional compliance changes
    
    // For now, we'll check our internal compliance status
    const complianceChecks = await runComplianceChecks();
    
    for (const check of complianceChecks) {
      if (check.status !== 'pass') {
        await db.collection('storeComplianceAlerts').add({
          platform: check.platform,
          category: check.category,
          severity: check.severity,
          issue: check.issue,
          recommendation: check.recommendation,
          detectedAt: admin.firestore.Timestamp.now(),
          status: 'active'
        });
      }
    }
    
    return { checks: complianceChecks.length };
  });

async function runComplianceChecks(): Promise<any[]> {
  const checks = [];
  
  // 1. Content moderation compliance
  const recentContent = await db.collection('userContent')
    .where('createdAt', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    .where('moderationStatus', '==', 'pending')
    .limit(1)
    .get();
  
  if (!recentContent.empty) {
    checks.push({
      platform: 'both',
      category: 'content_moderation',
      severity: 'medium',
      status: 'warning',
      issue: 'Unmoderated content exists',
      recommendation: 'Review pending content within 24 hours'
    });
  }
  
  // 2. Payment compliance
  const paymentConfig = await db.collection('config').doc('payments').get();
  if (paymentConfig.exists) {
    const config = paymentConfig.data();
    if (config?.allowExternalPayments === true) {
      checks.push({
        platform: 'ios',
        category: 'payment',
        severity: 'critical',
        status: 'fail',
        issue: 'External payments enabled - violates App Store guidelines',
        recommendation: 'Disable external payment options for iOS build'
      });
    }
  }
  
  // 3. Age rating compliance
  const appConfig = await db.collection('config').doc('app').get();
  if (appConfig.exists) {
    const config = appConfig.data();
    if (config?.minAge < 17 && config?.hasDatingFeatures === true) {
      checks.push({
        platform: 'both',
        category: 'age_rating',
        severity: 'critical',
        status: 'fail',
        issue: 'Dating features require 17+ age rating',
        recommendation: 'Update age rating in store listings'
      });
    }
  }
  
  // Add passing check if everything is OK
  if (checks.length === 0) {
    checks.push({
      platform: 'both',
      category: 'general',
      severity: 'info',
      status: 'pass',
      issue: null,
      recommendation: 'All compliance checks passed'
    });
  }
  
  return checks;
}

/**
 * Preemptive risk alert system
 */
export const pack379_preemptiveRiskAlert = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const risks = await detectPreemptiveRisks();
  
  return { risks };
});

async function detectPreemptiveRisks(): Promise<any[]> {
  const risks = [];
  
  // 1. Review rating trend
  const recentReviews = await db.collection('storeReviewSecurity')
    .where('createdAt', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    .get();
  
  const avgRating = recentReviews.docs.reduce((sum, doc) => sum + (doc.data().rating || 0), 0) / recentReviews.size;
  
  if (avgRating < 4.0) {
    risks.push({
      type: 'rating_decline',
      severity: 'high',
      message: `7-day average rating is ${avgRating.toFixed(2)}`,
      recommendation: 'Investigate user feedback and address top issues'
    });
  }
  
  // 2. Negative review velocity
  const negativeReviews = recentReviews.docs.filter(d => (d.data().rating || 0) <= 2).length;
  if (negativeReviews > recentReviews.size * 0.3) {
    risks.push({
      type: 'negative_review_spike',
      severity: 'high',
      message: `${(negativeReviews / recentReviews.size * 100).toFixed(1)}% negative reviews`,
      recommendation: 'Monitor for potential attack or major bug'
    });
  }
  
  // 3. Support ticket volume
  const recentTickets = await db.collection('supportTickets')
    .where('createdAt', '>=', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000))
    .get();
  
  if (recentTickets.size > 100) {
    risks.push({
      type: 'support_volume_spike',
      severity: 'medium',
      message: `${recentTickets.size} tickets in last 3 days`,
      recommendation: 'Check for widespread issues'
    });
  }
  
  return risks;
}

// ========================================
// 6. CRISIS MODE & REPUTATION SHIELD
// ========================================

/**
 * Triggers crisis mode with automatic protective actions
 */
async function triggerCrisisMode(type: string, metadata: any) {
  const now = admin.firestore.Timestamp.now();
  
  // Create crisis event
  const crisisRef = await db.collection('crisisEvents').add({
    type,
    severity: 'critical',
    status: 'active',
    triggeredAt: now,
    metadata,
    actions: []
  });
  
  const actions = [];
  
  // 1. Freeze public reviews (soft freeze)
  await db.collection('pack379Config').doc('reviewPrompts').update({
    enabled: false,
    frozenAt: now,
    frozenReason: type
  });
  actions.push('froze_review_prompts');
  
  // 2. Raise trust threshold
  await db.collection('pack379Config').doc('trustThresholds').update({
    minimumScoreForReview: 70,
    minimumScoreForPublicContent: 75,
    crisisModeActive: true
  });
  actions.push('raised_trust_thresholds');
  
  // 3. Lock suspicious accounts
  const suspiciousUsers = await db.collection('userTrustScores')
    .where('riskLevel', 'in', ['high', 'critical'])
    .limit(50)
    .get();
  
  const batch = db.batch();
  suspiciousUsers.docs.forEach(doc => {
    batch.update(db.collection('users').doc(doc.id), {
      accountStatus: 'restricted',
      restrictedAt: now,
      restrictionReason: 'crisis_mode_auto_lock'
    });
  });
  await batch.commit();
  actions.push(`locked_${suspiciousUsers.size}_accounts`);
  
  // 4. Silence discovery volatility
  await db.collection('pack379Config').doc('discovery').update({
    volatilitySuppressionEnabled: true,
    suppressionLevel: 'high'
  });
  actions.push('enabled_discovery_suppression');
  
  // 5. Activate emergency support routing
  await db.collection('pack300Config').doc('supportRouting').update({
    emergencyMode: true,
    priorityLevel: 'critical',
    routeToSeniorAgents: true
  });
  actions.push('activated_emergency_support');
  
  // Update crisis event with actions
  await crisisRef.update({
    actions,
    updatedAt: now
  });
  
  // Alert all admins
  await sendTrustTeamAlert({
    type: 'crisis_mode_activated',
    title: 'CRISIS MODE ACTIVATED',
    message: `Crisis mode triggered due to: ${type}`,
    severity: 'critical',
    data: { crisisId: crisisRef.id, type, actions }
  });
  
  // Log audit
  await logAuditEvent({
    eventType: 'crisis_mode_activated',
    severity: 'critical',
    metadata: { crisisId: crisisRef.id, type, actions }
  });
  
  return { crisisId: crisisRef.id, actions };
}

/**
 * Crisis reputation shield callable function
 */
export const pack379_crisisReputationShield = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  // Verify admin
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Must be admin');
  }
  
  const { action, crisisId } = data;
  
  if (action === 'activate') {
    const result = await triggerCrisisMode('manual_activation', {
      activatedBy: context.auth.uid,
      reason: data.reason
    });
    return result;
  } else if (action === 'deactivate') {
    // Deactivate crisis mode
    await deactivateCrisisMode(crisisId, context.auth.uid);
    return { success: true, message: 'Crisis mode deactivated' };
  }
  
  throw new functions.https.HttpsError('invalid-argument', 'Invalid action');
});

async function deactivateCrisisMode(crisisId: string, adminId: string) {
  const now = admin.firestore.Timestamp.now();
  
  // Update crisis event
  await db.collection('crisisEvents').doc(crisisId).update({
    status: 'resolved',
    resolvedAt: now,
    resolvedBy: adminId
  });
  
  // Restore normal settings
  await db.collection('pack379Config').doc('reviewPrompts').update({
    enabled: true,
    frozenAt: null,
    frozenReason: null
  });
  
  await db.collection('pack379Config').doc('trustThresholds').update({
    minimumScoreForReview: 50,
    minimumScoreForPublicContent: 60,
    crisisModeActive: false
  });
  
  await db.collection('pack379Config').doc('discovery').update({
    volatilitySuppressionEnabled: false
  });
  
  await db.collection('pack300Config').doc('supportRouting').update({
    emergencyMode: false
  });
  
  // Log audit
  await logAuditEvent({
    eventType: 'crisis_mode_deactivated',
    userId: adminId,
    metadata: { crisisId }
  });
}

// ========================================
// 7. STORE-SAFE REVIEW TRIGGER SYSTEM
// ========================================

/**
 * Store-compliant review prompt system
 */
export const pack379_storeSafeReviewTrigger = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { platform, triggerEvent } = data;
  
  // Check if prompts are enabled
  const config = await db.collection('pack379Config').doc('reviewPrompts').get();
  if (!config.exists || config.data()?.enabled === false) {
    return { shouldPrompt: false, reason: 'prompts_disabled' };
  }
  
  // Check prompt history
  const historyDoc = await db.collection('reviewPromptHistory').doc(userId).get();
  const history = historyDoc.data();
  
  // Throttling rules
  if (history) {
    const lastPromptDate = history.lastPromptedAt?.toDate();
    if (lastPromptDate) {
      const daysSinceLastPrompt = (Date.now() - lastPromptDate.getTime()) / (1000 * 60 * 60 * 24);
      
      // Don't prompt more than once every 90 days
      if (daysSinceLastPrompt < 90) {
        return { shouldPrompt: false, reason: 'too_soon' };
      }
    }
    
    // Max 2 prompts per user lifetime
    if ((history.promptCount || 0) >= 2) {
      return { shouldPrompt: false, reason: 'max_prompts_reached' };
    }
  }
  
  // Check user trust score
  const trustScore = await db.collection('userTrustScores').doc(userId).get();
  const minimumScore = config.data()?.minimumScoreForReview || 50;
  
  if (!trustScore.exists || (trustScore.data()?.score || 0) < minimumScore) {
    return { shouldPrompt: false, reason: 'insufficient_trust_score' };
  }
  
  // Check if trigger event is valid
  const validTriggers = [
    'successful_match',
    'successful_date',
    'positive_interaction',
    'milestone_achieved',
    'premium_upgrade'
  ];
  
  if (!validTriggers.includes(triggerEvent)) {
    return { shouldPrompt: false, reason: 'invalid_trigger' };
  }
  
  // All checks passed - can prompt
  await db.collection('reviewPromptHistory').doc(userId).set({
    lastPromptedAt: admin.firestore.Timestamp.now(),
    promptCount: FieldValue.increment(1),
    lastTrigger: triggerEvent,
    platform,
    completed: false
  }, { merge: true });
  
  return {
    shouldPrompt: true,
    message: getReviewPromptMessage(triggerEvent)
  };
});

function getReviewPromptMessage(trigger: string): string {
  const messages: Record<string, string> = {
    'successful_match': "We're glad you found a great match! Would you like to share your experience?",
    'successful_date': "Awesome! How was your experience with Avalo?",
    'positive_interaction': "Loving Avalo? Help others discover it too!",
    'milestone_achieved': "Congrats on your milestone! Mind rating your experience?",
    'premium_upgrade': "Thanks for upgrading! We'd love to hear your thoughts."
  };
  
  return messages[trigger] || "Enjoying Avalo? Let us know what you think!";
}

/**
 * Records when user completes review
 */
export const pack379_recordReviewCompletion = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { platform, completed } = data;
  
  await db.collection('reviewPromptHistory').doc(userId).update({
    completed,
    completedAt: completed ? admin.firestore.Timestamp.now() : null,
    platform
  });
  
  return { success: true };
});

// ========================================
// 8. ANALYTICS & EXECUTIVE DASHBOARD
// ========================================

/**
 * Generates executive reputation dashboard data
 */
export const pack379_execReputationDashboard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  // Verify admin
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || !['admin', 'executive'].includes(userDoc.data()?.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Must be admin or executive');
  }
  
  const { timeRange = '30d' } = data;
  const days = parseInt(timeRange);
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  // 1. ASO Health
  const asoHealth = await getASOHealthMetrics(startDate);
  
  // 2. Review Health
  const reviewHealth = await getReviewHealthMetrics(startDate);
  
  // 3. Trust Score Distribution
  const trustDistribution = await getTrustScoreDistribution();
  
  // 4. Active Alerts
  const activeAlerts = await getActiveAlerts();
  
  // 5. Country Reputation
  const countryReputation = await getCountryReputationMap();
  
  // 6. Overall Health Score
  const overallHealth = calculateOverallHealth({
    asoHealth,
    reviewHealth,
    alertCount: activeAlerts.length
  });
  
  return {
    overallHealth,
    asoHealth,
    reviewHealth,
    trustDistribution,
    activeAlerts,
    countryReputation,
    generatedAt: new Date().toISOString()
  };
});

async function getASOHealthMetrics(startDate: Date): Promise<any> {
  const metrics = await db.collection('asoMetrics')
    .where('date', '>=', startDate.toISOString().split('T')[0])
    .get();
  
  if (metrics.empty) {
    return { status: 'no_data', platforms: {} };
  }
  
  const byPlatform = groupBy(metrics.docs.map(d => d.data()), 'platform');
  
  const platformMetrics: any = {};
  
  for (const [platform, data] of Object.entries(byPlatform)) {
    const metricsArray = data as any[];
    platformMetrics[platform] = {
      avgConversionRate: average(metricsArray.map(m => m.conversionRate)),
      avgRating: average(metricsArray.map(m => m.avgRating)),
      totalInstalls: sum(metricsArray.map(m => m.installs)),
      trend: calculateTrend(metricsArray.map(m => m.installs))
    };
  }
  
  return {
    status: 'healthy',
    platforms: platformMetrics
  };
}

async function getReviewHealthMetrics(startDate: Date): Promise<any> {
  const reviews = await db.collection('storeReviewSecurity')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
    .get();
  
  const totalReviews = reviews.size;
  const avgRating = average(reviews.docs.map(d => d.data().rating || 0));
  const flaggedCount = reviews.docs.filter(d => d.data().flaggedAsAttack).length;
  const highSuspicionCount = reviews.docs.filter(d => d.data().suspicionLevel === 'high').length;
  
  return {
    totalReviews,
    avgRating,
    flaggedCount,
    highSuspicionCount,
    healthScore: Math.max(0, 100 - (flaggedCount / totalReviews * 100) - (highSuspicionCount / totalReviews * 50))
  };
}

async function getTrustScoreDistribution(): Promise<any> {
  const scores = await db.collection('userTrustScores')
    .limit(10000)
    .get();
  
  const distribution = {
    low: 0,        // 0-40
    medium: 0,     // 41-70
    high: 0,       // 71-85
    excellent: 0   // 86-100
  };
  
  scores.docs.forEach(doc => {
    const score = doc.data().score || 0;
    if (score <= 40) distribution.low++;
    else if (score <= 70) distribution.medium++;
    else if (score <= 85) distribution.high++;
    else distribution.excellent++;
  });
  
  return distribution;
}

async function getActiveAlerts(): Promise<any[]> {
  const alerts = await db.collection('reviewAttackAlerts')
    .where('status', '==', 'active')
    .orderBy('detectedAt', 'desc')
    .limit(10)
    .get();
  
  return alerts.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

async function getCountryReputationMap(): Promise<any> {
  const scores = await db.collection('countryReputationScores')
    .get();
  
  const map: any = {};
  scores.docs.forEach(doc => {
    const data = doc.data();
    map[data.country] = {
      score: data.score,
      riskLevel: data.riskLevel,
      reviewCount: data.reviewCount
    };
  });
  
  return map;
}

function calculateOverallHealth(data: any): number {
  let score = 100;
  
  // Deduct for alerts
  score -= data.alertCount * 5;
  
  // Factor in review health
  if (data.reviewHealth?.healthScore) {
    score = (score + data.reviewHealth.healthScore) / 2;
  }
  
  return Math.max(0, Math.min(100, score));
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function groupBy(array: any[], key: string): Record<string, any[]> {
  return array.reduce((result, item) => {
    const group = item[key] || 'unknown';
    if (!result[group]) {
      result[group] = [];
    }
    result[group].push(item);
    return result;
  }, {});
}

function calculateTextSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;
  
  const len1 = text1.length;
  const len2 = text2.length;
  const maxLen = Math.max(len1, len2);
  
  if (maxLen === 0) return 1;
  
  const distance = levenshtein(text1, text2);
  return 1 - (distance / maxLen);
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function sum(numbers: number[]): number {
  return numbers.reduce((sum, n) => sum + n, 0);
}

function calculateTrend(values: number[]): 'up' | 'down' | 'flat' {
  if (values.length < 2) return 'flat';
  
  const first = average(values.slice(0, Math.floor(values.length / 2)));
  const second = average(values.slice(Math.floor(values.length / 2)));
  
  const change = (second - first) / first;
  
  if (change > 0.1) return 'up';
  if (change < -0.1) return 'down';
  return 'flat';
}

// ========================================
// SCHEDULED REPORTS
// ========================================

/**
 * Daily executive report generation
 */
export const pack379_dailyExecutiveReport = functions.pubsub
  .schedule('every day 08:00')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    const report = await generateExecutiveReport('daily');
    
    await db.collection('executiveReports').add({
      reportType: 'daily',
      data: report,
      generatedAt: admin.firestore.Timestamp.now()
    });
    
    // Send to admins
    const admins = await db.collection('users')
      .where('role', 'in', ['admin', 'executive'])
      .get();
    
    // In production, send email/notification to admins
    console.log(`Daily report generated for ${admins.size} admins`);
    
    return { success: true };
  });

async function generateExecutiveReport(type: string): Promise<any> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  return {
    period: type,
    date: new Date().toISOString().split('T')[0],
    metrics: {
      newReviews: await countNewReviews(yesterday),
      avgRating: await getAvgRating(yesterday),
      attacksDetected: await countAttacks(yesterday),
      trustScoreAvg: await getAvgTrustScore(),
      asoPerformance: await getASOPerformance(yesterday)
    }
  };
}

async function countNewReviews(since: Date): Promise<number> {
  const count = await db.collection('storeReviewSecurity')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(since))
    .count()
    .get();
  
  return count.data().count;
}

async function getAvgRating(since: Date): Promise<number> {
  const reviews = await db.collection('storeReviewSecurity')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(since))
    .get();
  
  if (reviews.empty) return 0;
  
  return average(reviews.docs.map(d => d.data().rating || 0));
}

async function countAttacks(since: Date): Promise<number> {
  const count = await db.collection('reviewAttackAlerts')
    .where('detectedAt', '>=', admin.firestore.Timestamp.fromDate(since))
    .count()
    .get();
  
  return count.data().count;
}

async function getAvgTrustScore(): Promise<number> {
  const scores = await db.collection('userTrustScores')
    .limit(1000)
    .get();
  
  if (scores.empty) return 0;
  
  return average(scores.docs.map(d => d.data().score || 0));
}

async function getASOPerformance(since: Date): Promise<any> {
  const metrics = await db.collection('asoMetrics')
    .where('date', '>=', since.toISOString().split('T')[0])
    .get();
  
  if (metrics.empty) return null;
  
  const data = metrics.docs.map(d => d.data());
  
  return {
    totalInstalls: sum(data.map(m => m.installs || 0)),
    avgConversionRate: average(data.map(m => m.conversionRate || 0)),
    avgRating: average(data.map(m => m.avgRating || 0))
  };
}
