/**
 * PACK 436 — Review Defense Engine
 * 
 * Mission-critical shield layer for Avalo's App Store presence.
 * Protects against:
 * - Spam attacks
 * - Coordinated review bombing
 * - Competitor sabotage
 * - Malicious users
 * - Fake/paid reviews
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface ReviewAuthenticityScore {
  score: number; // 0-100
  userId: string;
  reviewId: string;
  factors: {
    accountAge: number;
    isVerified: boolean;
    behaviorHistory: number;
    tokenPurchaseHistory: number;
    eventParticipation: number;
    supportTickets: number;
    socialInteractions: number;
    ipDeviceConsistency: number;
  };
  flags: string[];
  timestamp: number;
}

interface AttackPattern {
  type: 'volume_spike' | 'regional_cluster' | 'text_similarity' | 'vpn_cluster' | 'suspicious_ip';
  severity: 'low' | 'medium' | 'high' | 'critical';
  reviewIds: string[];
  detectedAt: number;
  metrics: {
    count: number;
    timeWindow: number;
    region?: string;
    similarityScore?: number;
    ipRange?: string;
  };
}

interface SentimentCluster {
  category: 'ux_complaints' | 'bug_reports' | 'feature_requests' | 'pricing_complaints' | 'competitor_attack' | 'personal_vendetta';
  reviews: string[];
  sentiment: number; // -1 to 1
  keywords: string[];
  priority: 'low' | 'medium' | 'high';
  actionRequired: boolean;
}

interface ReviewMetadata {
  userId: string;
  reviewId: string;
  platform: 'ios' | 'android';
  rating: number;
  text: string;
  timestamp: number;
  deviceInfo: {
    ip: string;
    deviceId: string;
    model: string;
    os: string;
  };
  userInfo: {
    accountAge: number;
    isVerified: boolean;
    totalTransactions: number;
    totalEvents: number;
    totalSupport: number;
    totalInteractions: number;
  };
}

// ============================================================================
// REVIEW AUTHENTICITY SCORING
// ============================================================================

/**
 * Calculate authenticity score for a review (0-100)
 * Low scores indicate potential fake/paid reviews
 */
export const calculateAuthenticityScore = async (
  reviewData: ReviewMetadata
): Promise<ReviewAuthenticityScore> => {
  const db = admin.firestore();
  const userId = reviewData.userId;
  
  // Fetch user data
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  if (!userData) {
    return {
      score: 0,
      userId,
      reviewId: reviewData.reviewId,
      factors: {
        accountAge: 0,
        isVerified: false,
        behaviorHistory: 0,
        tokenPurchaseHistory: 0,
        eventParticipation: 0,
        supportTickets: 0,
        socialInteractions: 0,
        ipDeviceConsistency: 0,
      },
      flags: ['USER_NOT_FOUND'],
      timestamp: Date.now(),
    };
  }
  
  // Calculate individual factors
  const factors = {
    // Account age (max 20 points)
    accountAge: calculateAccountAgeScore(userData.createdAt),
    
    // Verified status (max 15 points) - 100% verification in Avalo = strong signal
    isVerified: userData.verified === true,
    
    // Behavior history from PACK 302 (max 15 points)
    behaviorHistory: await calculateBehaviorScore(userId),
    
    // Token purchase history (max 10 points)
    tokenPurchaseHistory: await calculateTokenScore(userId),
    
    // Event participation (max 10 points)
    eventParticipation: await calculateEventScore(userId),
    
    // Support tickets (max 10 points)
    supportTickets: await calculateSupportScore(userId),
    
    // Social interactions (max 10 points)
    socialInteractions: await calculateSocialScore(userId),
    
    // IP/Device consistency (max 10 points)
    ipDeviceConsistency: await calculateDeviceConsistencyScore(userId, reviewData.deviceInfo),
  };
  
  // Calculate total score
  const score = 
    factors.accountAge +
    (factors.isVerified ? 15 : 0) +
    factors.behaviorHistory +
    factors.tokenPurchaseHistory +
    factors.eventParticipation +
    factors.supportTickets +
    factors.socialInteractions +
    factors.ipDeviceConsistency;
  
  // Generate flags
  const flags: string[] = [];
  if (score < 30) flags.push('LOW_AUTHENTICITY');
  if (factors.accountAge < 5) flags.push('NEW_ACCOUNT');
  if (!factors.isVerified) flags.push('UNVERIFIED');
  if (factors.ipDeviceConsistency < 5) flags.push('SUSPICIOUS_DEVICE');
  if (factors.behaviorHistory < 5) flags.push('SUSPICIOUS_BEHAVIOR');
  
  const result: ReviewAuthenticityScore = {
    score,
    userId,
    reviewId: reviewData.reviewId,
    factors,
    flags,
    timestamp: Date.now(),
  };
  
  // Store score
  await db.collection('reviewAuthenticityScores').doc(reviewData.reviewId).set(result);
  
  // Flag if score is low
  if (score < 40) {
    await flagSuspiciousReview(reviewData.reviewId, result);
  }
  
  return result;
};

// Helper scoring functions
function calculateAccountAgeScore(createdAt: number): number {
  const ageInDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
  if (ageInDays < 1) return 0;
  if (ageInDays < 7) return 5;
  if (ageInDays < 30) return 10;
  if (ageInDays < 90) return 15;
  return 20;
}

async function calculateBehaviorScore(userId: string): Promise<number> {
  const db = admin.firestore();
  const behaviorDoc = await db.collection('behaviorScores').doc(userId).get();
  const behavior = behaviorDoc.data();
  
  if (!behavior) return 0;
  
  // Check PACK 302 fraud score (inverted - lower fraud = higher authenticity)
  const fraudScore = behavior.fraudScore || 0;
  return Math.max(0, 15 - (fraudScore * 0.15));
}

async function calculateTokenScore(userId: string): Promise<number> {
  const db = admin.firestore();
  const purchases = await db.collection('tokenPurchases')
    .where('userId', '==', userId)
    .get();
  
  const totalPurchases = purchases.size;
  if (totalPurchases === 0) return 0;
  if (totalPurchases < 3) return 3;
  if (totalPurchases < 10) return 7;
  return 10;
}

async function calculateEventScore(userId: string): Promise<number> {
  const db = admin.firestore();
  const events = await db.collection('eventAttendees')
    .where('userId', '==', userId)
    .where('attended', '==', true)
    .get();
  
  const totalEvents = events.size;
  if (totalEvents === 0) return 0;
  if (totalEvents < 2) return 3;
  if (totalEvents < 5) return 7;
  return 10;
}

async function calculateSupportScore(userId: string): Promise<number> {
  const db = admin.firestore();
  const tickets = await db.collection('supportTickets')
    .where('userId', '==', userId)
    .get();
  
  const totalTickets = tickets.size;
  // Having some support tickets is normal, too many is suspicious
  if (totalTickets === 0) return 5;
  if (totalTickets <= 3) return 10;
  if (totalTickets <= 10) return 5;
  return 0; // Too many tickets = suspicious
}

async function calculateSocialScore(userId: string): Promise<number> {
  const db = admin.firestore();
  const interactions = await db.collection('interactions')
    .where('userId', '==', userId)
    .get();
  
  const totalInteractions = interactions.size;
  if (totalInteractions < 10) return 0;
  if (totalInteractions < 50) return 5;
  if (totalInteractions < 200) return 8;
  return 10;
}

async function calculateDeviceConsistencyScore(
  userId: string,
  deviceInfo: ReviewMetadata['deviceInfo']
): Promise<number> {
  const db = admin.firestore();
  const userDevices = await db.collection('userDevices')
    .where('userId', '==', userId)
    .get();
  
  if (userDevices.empty) return 0;
  
  // Check if device and IP have been seen before
  const knownDevice = userDevices.docs.some(doc => {
    const data = doc.data();
    return data.deviceId === deviceInfo.deviceId;
  });
  
  const knownIP = userDevices.docs.some(doc => {
    const data = doc.data();
    return data.ip === deviceInfo.ip;
  });
  
  if (knownDevice && knownIP) return 10;
  if (knownDevice || knownIP) return 5;
  return 0;
}

async function flagSuspiciousReview(reviewId: string, score: ReviewAuthenticityScore) {
  const db = admin.firestore();
  await db.collection('flaggedReviews').doc(reviewId).set({
    reviewId,
    score: score.score,
    flags: score.flags,
    userId: score.userId,
    flaggedAt: Date.now(),
    status: 'pending_review',
  });
}

// ============================================================================
// COMPETITOR ATTACK DETECTION
// ============================================================================

/**
 * Detect coordinated negative campaigns and competitor attacks
 */
export const detectAttackPatterns = functions.pubsub
  .schedule('every 10 minutes')
  .onRun(async () => {
    const db = admin.firestore();
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Fetch recent negative reviews
    const recentReviews = await db.collection('reviews')
      .where('timestamp', '>', oneHourAgo)
      .where('rating', '<=', 2)
      .get();
    
    const attacks: AttackPattern[] = [];
    
    // 1. Volume Spike Detection (10 negative reviews in 60 minutes)
    if (recentReviews.size >= 10) {
      attacks.push({
        type: 'volume_spike',
        severity: recentReviews.size >= 30 ? 'critical' : recentReviews.size >= 20 ? 'high' : 'medium',
        reviewIds: recentReviews.docs.map(doc => doc.id),
        detectedAt: now,
        metrics: {
          count: recentReviews.size,
          timeWindow: 60,
        },
      });
    }
    
    // 2. Regional Cluster Detection (30+ negative reviews from same region)
    const regionCounts = new Map<string, string[]>();
    recentReviews.docs.forEach(doc => {
      const data = doc.data();
      const region = data.region || 'unknown';
      if (!regionCounts.has(region)) {
        regionCounts.set(region, []);
      }
      regionCounts.get(region)!.push(doc.id);
    });
    
    regionCounts.forEach((reviewIds, region) => {
      if (reviewIds.length >= 30) {
        attacks.push({
          type: 'regional_cluster',
          severity: 'high',
          reviewIds,
          detectedAt: now,
          metrics: {
            count: reviewIds.length,
            timeWindow: 60,
            region,
          },
        });
      }
    });
    
    // 3. Text Similarity Detection (3+ similar review texts)
    const textSimilarity = await detectTextSimilarity(recentReviews.docs);
    if (textSimilarity.length > 0) {
      textSimilarity.forEach(cluster => {
        attacks.push({
          type: 'text_similarity',
          severity: 'high',
          reviewIds: cluster.reviewIds,
          detectedAt: now,
          metrics: {
            count: cluster.reviewIds.length,
            timeWindow: 60,
            similarityScore: cluster.similarity,
          },
        });
      });
    }
    
    // 4. VPN/IP Cluster Detection
    const ipClusters = await detectIPClusters(recentReviews.docs);
    if (ipClusters.length > 0) {
      ipClusters.forEach(cluster => {
        attacks.push({
          type: cluster.isVPN ? 'vpn_cluster' : 'suspicious_ip',
          severity: 'high',
          reviewIds: cluster.reviewIds,
          detectedAt: now,
          metrics: {
            count: cluster.reviewIds.length,
            timeWindow: 60,
            ipRange: cluster.ipRange,
          },
        });
      });
    }
    
    // Store and respond to attacks
    for (const attack of attacks) {
      await handleAttackPattern(attack);
    }
    
    return { attacks: attacks.length };
  });

async function detectTextSimilarity(
  reviews: admin.firestore.QueryDocumentSnapshot[]
): Promise<Array<{ reviewIds: string[]; similarity: number }>> {
  const clusters: Array<{ reviewIds: string[]; similarity: number }> = [];
  
  for (let i = 0; i < reviews.length; i++) {
    const cluster: string[] = [reviews[i].id];
    const text1 = reviews[i].data().text?.toLowerCase() || '';
    
    for (let j = i + 1; j < reviews.length; j++) {
      const text2 = reviews[j].data().text?.toLowerCase() || '';
      const similarity = calculateStringSimilarity(text1, text2);
      
      if (similarity > 0.7) { // 70% similarity threshold
        cluster.push(reviews[j].id);
      }
    }
    
    if (cluster.length >= 3) {
      clusters.push({
        reviewIds: cluster,
        similarity: 0.7,
      });
    }
  }
  
  return clusters;
}

function calculateStringSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

async function detectIPClusters(
  reviews: admin.firestore.QueryDocumentSnapshot[]
): Promise<Array<{ reviewIds: string[]; ipRange: string; isVPN: boolean }>> {
  const ipGroups = new Map<string, string[]>();
  
  reviews.forEach(doc => {
    const data = doc.data();
    const ip = data.deviceInfo?.ip || 'unknown';
    const ipPrefix = ip.split('.').slice(0, 3).join('.'); // Group by /24 subnet
    
    if (!ipGroups.has(ipPrefix)) {
      ipGroups.set(ipPrefix, []);
    }
    ipGroups.get(ipPrefix)!.push(doc.id);
  });
  
  const clusters: Array<{ reviewIds: string[]; ipRange: string; isVPN: boolean }> = [];
  
  for (const [ipPrefix, reviewIds] of ipGroups.entries()) {
    if (reviewIds.length >= 3) {
      const isVPN = await checkIfVPN(ipPrefix);
      clusters.push({
        reviewIds,
        ipRange: ipPrefix,
        isVPN,
      });
    }
  }
  
  return clusters;
}

async function checkIfVPN(ipPrefix: string): Promise<boolean> {
  // Known VPN ranges (simplified - in production use a proper VPN detection service)
  const knownVPNRanges = [
    '10.', '172.16.', '192.168.', // Private ranges often used by VPNs
  ];
  
  return knownVPNRanges.some(range => ipPrefix.startsWith(range));
}

async function handleAttackPattern(attack: AttackPattern) {
  const db = admin.firestore();
  
  // Store attack pattern
  await db.collection('attackPatterns').add(attack);
  
  // Auto-submit Apple/Google appeal
  if (attack.severity === 'critical' || attack.severity === 'high') {
    await submitAppStoreAppeal(attack);
  }
  
  // Hide harmful keywords in store (metadata adaptation)
  await adaptMetadata(attack);
  
  // Generate PR counter strategy (PACK 439 tie-in)
  await generatePRCounterStrategy(attack);
  
  // Alert admins
  await alertAdmins(attack);
}

async function submitAppStoreAppeal(attack: AttackPattern) {
  const db = admin.firestore();
  await db.collection('appStoreAppeals').add({
    attackId: attack.type,
    reviewIds: attack.reviewIds,
    severity: attack.severity,
    submittedAt: Date.now(),
    status: 'pending',
    platform: 'both', // iOS and Android
  });
}

async function adaptMetadata(attack: AttackPattern) {
  // Flag for metadata review
  const db = admin.firestore();
  await db.collection('metadataAlerts').add({
    type: 'attack_detected',
    attackType: attack.type,
    timestamp: Date.now(),
    status: 'pending_review',
  });
}

async function generatePRCounterStrategy(attack: AttackPattern) {
  const db = admin.firestore();
  await db.collection('prStrategies').add({
    trigger: 'attack_detected',
    attackType: attack.type,
    severity: attack.severity,
    createdAt: Date.now(),
    status: 'draft',
  });
}

async function alertAdmins(attack: AttackPattern) {
  const db = admin.firestore();
  await db.collection('adminAlerts').add({
    type: 'review_attack',
    severity: attack.severity,
    attackType: attack.type,
    reviewCount: attack.reviewIds.length,
    timestamp: Date.now(),
    read: false,
  });
}

// ============================================================================
// SENTIMENT CLUSTERING
// ============================================================================

/**
 * Cluster reviews by sentiment and category for targeted responses
 */
export const clusterReviewSentiments = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    const db = admin.firestore();
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    // Fetch recent reviews
    const recentReviews = await db.collection('reviews')
      .where('timestamp', '>', oneDayAgo)
      .get();
    
    const clusters: SentimentCluster[] = [
      { category: 'ux_complaints', reviews: [], sentiment: 0, keywords: [], priority: 'low', actionRequired: false },
      { category: 'bug_reports', reviews: [], sentiment: 0, keywords: [], priority: 'low', actionRequired: false },
      { category: 'feature_requests', reviews: [], sentiment: 0, keywords: [], priority: 'low', actionRequired: false },
      { category: 'pricing_complaints', reviews: [], sentiment: 0, keywords: [], priority: 'low', actionRequired: false },
      { category: 'competitor_attack', reviews: [], sentiment: 0, keywords: [], priority: 'low', actionRequired: false },
      { category: 'personal_vendetta', reviews: [], sentiment: 0, keywords: [], priority: 'low', actionRequired: false },
    ];
    
    // Categorize each review
    recentReviews.docs.forEach(doc => {
      const data = doc.data();
      const text = data.text?.toLowerCase() || '';
      const category = categorizeReview(text);
      
      const cluster = clusters.find(c => c.category === category);
      if (cluster) {
        cluster.reviews.push(doc.id);
        cluster.sentiment += (data.rating - 3) / 2; // Normalize to -1 to 1
      }
    });
    
    // Calculate priorities and action requirements
    clusters.forEach(cluster => {
      if (cluster.reviews.length > 0) {
        cluster.sentiment /= cluster.reviews.length;
        cluster.keywords = extractKeywords(cluster);
        
        // Determine priority
        if (cluster.category === 'bug_reports' && cluster.reviews.length > 5) {
          cluster.priority = 'high';
          cluster.actionRequired = true;
        } else if (cluster.category === 'competitor_attack' || cluster.category === 'personal_vendetta') {
          cluster.priority = 'high';
          cluster.actionRequired = true;
        } else if (cluster.reviews.length > 10) {
          cluster.priority = 'medium';
          cluster.actionRequired = true;
        }
        
        // Store cluster
        db.collection('reviewClusters').add({
          ...cluster,
          timestamp: Date.now(),
        });
      }
    });
    
    return { clusters: clusters.length };
  });

function categorizeReview(text: string): SentimentCluster['category'] {
  const keywords = {
    ux_complaints: ['confusing', 'hard to use', 'ui', 'interface', 'design', 'navigation', 'difficult'],
    bug_reports: ['bug', 'crash', 'broken', 'not working', 'error', 'freeze', 'glitch', 'issue'],
    feature_requests: ['wish', 'should add', 'would be nice', 'need', 'missing', 'feature', 'suggestion'],
    pricing_complaints: ['expensive', 'price', 'cost', 'tokens', 'money', 'cheap', 'free', 'subscription'],
    competitor_attack: ['tinder', 'bumble', 'hinge', 'better app', 'use instead', 'competitor'],
    personal_vendetta: ['hate', 'worst', 'terrible', 'scam', 'fraud', 'delete', 'uninstall'],
  };
  
  let maxScore = 0;
  let category: SentimentCluster['category'] = 'ux_complaints';
  
  for (const [cat, words] of Object.entries(keywords)) {
    const score = words.filter(word => text.includes(word)).length;
    if (score > maxScore) {
      maxScore = score;
      category = cat as SentimentCluster['category'];
    }
  }
  
  return category;
}

function extractKeywords(cluster: SentimentCluster): string[] {
  // Simplified keyword extraction
  // In production, use proper NLP/TF-IDF
  return [];
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  ReviewAuthenticityScore,
  AttackPattern,
  SentimentCluster,
  ReviewMetadata,
};
