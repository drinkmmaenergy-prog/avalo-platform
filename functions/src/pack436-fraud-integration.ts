/**
 * PACK 436 — Fraud Graph Integration
 * 
 * Integrates review defense with PACK 302 fraud detection
 * Adds review fraud patterns to the fraud graph
 */

import * as admin from 'firebase-admin';

// ============================================================================
// TYPES
// ============================================================================

export interface ReviewFraudNode {
  type: 'review';
  reviewId: string;
  userId: string;
  platform: 'ios' | 'android';
  rating: number;
  authenticityScore: number;
  flags: string[];
  timestamp: number;
}

export interface ReviewFraudPattern {
  patternType: 'review_ring' | 'multi_account' | 'coordinated_attack' | 'fake_positive' | 'sabotage';
  reviewIds: string[];
  userIds: string[];
  confidence: number; // 0-100
  evidence: string[];
  detectedAt: number;
}

export interface ReviewerCluster {
  clusterId: string;
  reviewers: string[];
  commonTraits: {
    similarIPs?: string[];
    similarDevices?: string[];
    similarText?: boolean;
    similarTiming?: boolean;
    sameRegion?: boolean;
  };
  suspicionScore: number; // 0-100
}

// ============================================================================
// FRAUD NODE CREATION
// ============================================================================

/**
 * Add review to fraud graph
 */
export async function addReviewToFraudGraph(
  reviewId: string,
  userId: string,
  platform: 'ios' | 'android',
  authenticityScore: number
): Promise<void> {
  const db = admin.firestore();
  
  const reviewDoc = await db.collection('reviews').doc(reviewId).get();
  const review = reviewDoc.data();
  
  if (!review) return;
  
  const fraudNode: ReviewFraudNode = {
    type: 'review',
    reviewId,
    userId,
    platform,
    rating: review.rating,
    authenticityScore,
    flags: review.flags || [],
    timestamp: Date.now(),
  };
  
  // Add to fraud graph
  await db.collection('fraudGraph').doc(`review_${reviewId}`).set(fraudNode);
  
  // Link to user node
  await linkReviewToUser(reviewId, userId);
  
  // Check for fraud patterns
  if (authenticityScore < 40) {
    await analyzeFraudPatterns(reviewId, userId);
  }
}

/**
 * Link review to user in fraud graph
 */
async function linkReviewToUser(reviewId: string, userId: string): Promise<void> {
  const db = admin.firestore();
  
  await db.collection('fraudGraphEdges').add({
    from: `user_${userId}`,
    to: `review_${reviewId}`,
    type: 'left_review',
    timestamp: Date.now(),
  });
}

// ============================================================================
// FRAUD PATTERN DETECTION
// ============================================================================

/**
 * Analyze review for fraud patterns
 */
export async function analyzeFraudPatterns(
  reviewId: string,
  userId: string
): Promise<ReviewFraudPattern[]> {
  const patterns: ReviewFraudPattern[] = [];
  
  // 1. Check for review rings
  const reviewRing = await detectReviewRing(userId);
  if (reviewRing) {
    patterns.push(reviewRing);
  }
  
  // 2. Check for multi-account abuse
  const multiAccount = await detectMultiAccountReviews(userId);
  if (multiAccount) {
    patterns.push(multiAccount);
  }
  
  // 3. Check for coordinated attacks
  const coordinated = await detectCoordinatedAttack(reviewId);
  if (coordinated) {
    patterns.push(coordinated);
  }
  
  // 4. Check for fake positive reviews (paid reviews)
  const fakePositive = await detectFakePositiveReview(reviewId);
  if (fakePositive) {
    patterns.push(fakePositive);
  }
  
  // Store patterns
  const db = admin.firestore();
  for (const pattern of patterns) {
    await db.collection('reviewFraudPatterns').add(pattern);
    
    // Escalate to support if high confidence
    if (pattern.confidence > 75) {
      await escalateToSupport(pattern);
    }
  }
  
  return patterns;
}

/**
 * Detect review rings (connected users leaving reviews)
 */
async function detectReviewRing(userId: string): Promise<ReviewFraudPattern | null> {
  const db = admin.firestore();
  
  // Find  users with connections to this user
  const connections = await db.collection('userConnections')
    .where('userId', '==', userId)
    .get();
  
  if (connections.empty) return null;
  
  const connectedUserIds = connections.docs.map(doc => doc.data().connectedUserId);
  
  // Check if connected users also left reviews recently
  const recentReviews = await db.collection('reviews')
    .where('userId', 'in', connectedUserIds)
    .where('timestamp', '>', Date.now() - (7 * 24 * 60 * 60 * 1000))
    .get();
  
  if (recentReviews.size >= 3) {
    // Potential review ring detected
    return {
      patternType: 'review_ring',
      reviewIds: recentReviews.docs.map(doc => doc.id),
      userIds: [userId, ...connectedUserIds],
      confidence: Math.min(90, recentReviews.size * 20),
      evidence: [
        `${recentReviews.size} connected users left reviews within 7 days`,
        'Suspicious review coordination pattern',
      ],
      detectedAt: Date.now(),
    };
  }
  
  return null;
}

/**
 * Detect multi-account reviews (same person, multiple accounts)
 */
async function detectMultiAccountReviews(userId: string): Promise<ReviewFraudPattern | null> {
  const db = admin.firestore();
  
  // Get user's device info
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  if (!userData?.deviceId) return null;
  
  // Find other users with same device
  const sameDeviceUsers = await db.collection('users')
    .where('deviceId', '==', userData.deviceId)
    .get();
  
  if (sameDeviceUsers.size <= 1) return null;
  
  const userIds = sameDeviceUsers.docs.map(doc => doc.id);
  
  // Check if these users left reviews
  const reviews = await db.collection('reviews')
    .where('userId', 'in', userIds)
    .get();
  
  if (reviews.size >= 2) {
    return {
      patternType: 'multi_account',
      reviewIds: reviews.docs.map(doc => doc.id),
      userIds,
      confidence: 85,
      evidence: [
        `${sameDeviceUsers.size} accounts on same device`,
        `${reviews.size} reviews from these accounts`,
        'Potential multi-account abuse',
      ],
      detectedAt: Date.now(),
    };
  }
  
  return null;
}

/**
 * Detect coordinated attack pattern
 */
async function detectCoordinatedAttack(reviewId: string): Promise<ReviewFraudPattern | null> {
  const db = admin.firestore();
  
  // Get review details
  const reviewDoc = await db.collection('reviews').doc(reviewId).get();
  const review = reviewDoc.data();
  
  if (!review) return null;
  
  // Find similar reviews in time window
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  const similarReviews = await db.collection('reviews')
    .where('rating', '==', review.rating)
    .where('timestamp', '>', oneHourAgo)
    .get();
  
  if (similarReviews.size >= 10 && review.rating <= 2) {
    // Potential coordinated negative campaign
    return {
      patternType: 'coordinated_attack',
      reviewIds: similarReviews.docs.map(doc => doc.id),
      userIds: similarReviews.docs.map(doc => doc.data().userId),
      confidence: Math.min(95, similarReviews.size * 5),
      evidence: [
        `${similarReviews.size} negative reviews in 1 hour`,
        'Coordinated timing pattern',
        'Potential competitor attack or review bombing',
      ],
      detectedAt: Date.now(),
    };
  }
  
  return null;
}

/**
 * Detect fake positive reviews (paid reviews)
 */
async function detectFakePositiveReview(reviewId: string): Promise<ReviewFraudPattern | null> {
  const db = admin.firestore();
  
  // Get review details
  const reviewDoc = await db.collection('reviews').doc(reviewId).get();
  const review = reviewDoc.data();
  
  if (!review || review.rating < 4) return null;
  
  // Get user authenticity score
  const authDoc = await db.collection('reviewAuthenticityScores').doc(reviewId).get();
  const auth = authDoc.data();
  
  if (!auth || auth.score >= 40) return null;
  
  // Check for suspicious patterns
  const suspicionFactors = [];
  
  if (auth.flags?.includes('NEW_ACCOUNT')) {
    suspicionFactors.push('New account with positive review');
  }
  
  if (auth.flags?.includes('UNVERIFIED')) {
    suspicionFactors.push('Unverified user leaving review');
  }
  
  if (auth.flags?.includes('SUSPICIOUS_DEVICE')) {
    suspicionFactors.push('Suspicious device pattern');
  }
  
  if (review.text && review.text.length < 20) {
    suspicionFactors.push('Very short review text');
  }
  
  if (suspicionFactors.length >= 2) {
    return {
      patternType: 'fake_positive',
      reviewIds: [reviewId],
      userIds: [review.userId],
      confidence: suspicionFactors.length * 25,
      evidence: suspicionFactors,
      detectedAt: Date.now(),
    };
  }
  
  return null;
}

// ============================================================================
// REVIEWER CLUSTERING
// ============================================================================

/**
 * Cluster suspicious reviewers
 */
export async function clusterSuspiciousReviewers(): Promise<ReviewerCluster[]> {
  const db = admin.firestore();
  const clusters: ReviewerCluster[] = [];
  
  // Get flagged reviews
  const flaggedReviews = await db.collection('flaggedReviews')
    .where('status', '==', 'pending_review')
    .limit(100)
    .get();
  
  if (flaggedReviews.empty) return clusters;
  
  // Group by common traits
  const ipGroups = new Map<string, string[]>();
  const deviceGroups = new Map<string, string[]>();
  
  for (const reviewDoc of flaggedReviews.docs) {
    const review = reviewDoc.data();
    const userId = review.userId;
    
    // Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData) continue;
    
    // Group by IP
    if (userData.lastIP) {
      if (!ipGroups.has(userData.lastIP)) {
        ipGroups.set(userData.lastIP, []);
      }
      ipGroups.get(userData.lastIP)!.push(userId);
    }
    
    // Group by device
    if (userData.deviceId) {
      if (!deviceGroups.has(userData.deviceId)) {
        deviceGroups.set(userData.deviceId, []);
      }
      deviceGroups.get(userData.deviceId)!.push(userId);
    }
  }
  
  // Create clusters
  let clusterId = 0;
  
  for (const [ip, userIds] of ipGroups.entries()) {
    if (userIds.length >= 3) {
      clusters.push({
        clusterId: `ip_cluster_${clusterId++}`,
        reviewers: userIds,
        commonTraits: {
          similarIPs: [ip],
        },
        suspicionScore: Math.min(100, userIds.length * 20),
      });
    }
  }
  
  for (const [deviceId, userIds] of deviceGroups.entries()) {
    if (userIds.length >= 2) {
      clusters.push({
        clusterId: `device_cluster_${clusterId++}`,
        reviewers: userIds,
        commonTraits: {
          similarDevices: [deviceId],
        },
        suspicionScore: Math.min(100, userIds.length * 30),
      });
    }
  }
  
  // Store clusters
  for (const cluster of clusters) {
    await db.collection('reviewerClusters').doc(cluster.clusterId).set(cluster);
  }
  
  return clusters;
}

// ============================================================================
// ESCALATION
// ============================================================================

/**
 * Escalate pattern to support (PACK 300A)
 */
async function escalateToSupport(pattern: ReviewFraudPattern): Promise<void> {
  const db = admin.firestore();
  
  await db.collection('supportEscalations').add({
    type: 'review_fraud',
    patternType: pattern.patternType,
    confidence: pattern.confidence,
    reviewIds: pattern.reviewIds,
    userIds: pattern.userIds,
    evidence: pattern.evidence,
    priority: pattern.confidence > 85 ? 'high' : 'medium',
    status: 'pending',
    createdAt: Date.now(),
  });
}

// ============================================================================
// BRAND SABOTAGE DETECTION
// ============================================================================

/**
 * Detect brand sabotage attempts
 */
export async function detectBrandSabotage(): Promise<void> {
  const db = admin.firestore();
  
  // Check for suspicious patterns
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  
  // 1. High volume of negative reviews
  const negativeReviews = await db.collection('reviews')
    .where('rating', '<=', 2)
    .where('timestamp', '>', oneDayAgo)
    .get();
  
  if (negativeReviews.size > 30) {
    await db.collection('fraudGraphEvents').add({
      type: 'brand_sabotage_attempt',
      subtype: 'negative_review_flood',
      severity: 'high',
      reviewCount: negativeReviews.size,
      timestamp: Date.now(),
    });
  }
  
  // 2. Competitor mentions in negative reviews
  let competitorMentions = 0;
  negativeReviews.docs.forEach(doc => {
    const text = doc.data().text?.toLowerCase() || '';
    const competitors = ['tinder', 'bumble', 'hinge', 'match'];
    
    if (competitors.some(comp => text.includes(comp))) {
      competitorMentions++;
    }
  });
  
  if (competitorMentions > 5) {
    await db.collection('fraudGraphEvents').add({
      type: 'brand_sabotage_attempt',
      subtype: 'competitor_campaign',
      severity: 'critical',
      mentions: competitorMentions,
      timestamp: Date.now(),
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  ReviewFraudNode,
  ReviewFraudPattern,
  ReviewerCluster,
};
