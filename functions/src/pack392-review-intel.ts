/**
 * PACK 392 - Review Intelligence & Filtering Engine
 * NLP-based sentiment analysis, coordinated attack detection, filtering
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPES
// ============================================================================

export interface ReviewIntelligence {
  reviewId: string;
  storeId: string;
  userId: string;
  rating: number;
  text: string;
  timestamp: FirebaseFirestore.Timestamp;
  
  // Analysis
  sentiment: 'VERY_NEGATIVE' | 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE' | 'VERY_POSITIVE';
  sentimentScore: number; // -1 to +1
  isAuthentic: boolean;
  authenticityScore: number; // 0-1
  threatLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // Clustering
  clusterId: string | null;
  similarReviewIds: string[];
  
  // Flags
  flags: ReviewFlag[];
  
  // Actions
  escalated: boolean;
  escalationId: string | null;
  blocked: boolean;
  blockReason: string | null;
}

export interface ReviewFlag {
  type: 'SPAM' | 'FAKE' | 'COORDINATED' | 'ABUSIVE' | 'INCENTIVIZED' | 'BOT';
  confidence: number; // 0-1
  reason: string;
  detectedAt: FirebaseFirestore.Timestamp;
}

export interface ReviewCluster {
  id: string;
  storeId: string;
  reviewIds: string[];
  centroidText: string;
  sentimentAvg: number;
  firstSeen: FirebaseFirestore.Timestamp;
  lastSeen: FirebaseFirestore.Timestamp;
  isAttack: boolean;
  attackType: string | null;
}

export interface ReviewEscalation {
  id: string;
  storeId: string;
  storeName: string; // 'APPLE' | 'GOOGLE' | 'HUAWEI' | 'SAMSUNG'
  reviewIds: string[];
  attackType: string;
  evidenceBundle: EvidenceBundle;
  submittedAt: FirebaseFirestore.Timestamp | null;
  status: 'PENDING' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'RESOLVED' | 'REJECTED';
  resolution: string | null;
}

export interface EvidenceBundle {
  summary: string;
  suspiciousPatterns: string[];
  reviewCount: number;
  timeWindow: { start: FirebaseFirestore.Timestamp; end: FirebaseFirestore.Timestamp };
  ipClusters: any[];
  deviceFingerprints: any[];
  userAccounts: any[];
  screenshots: string[];
}

export interface SentimentAnalysis {
  text: string;
  sentiment: string;
  score: number;
  keywords: string[];
  topics: string[];
  emotions: { [key: string]: number };
}

// ============================================================================
// CORE: REVIEW INTELLIGENCE ENGINE
// ============================================================================

export const pack392_reviewIntelligenceEngine = functions
  .runWith({ 
    timeoutSeconds: 540,
    memory: '2GB'
  })
  .pubsub
  .schedule('every 30 minutes')
  .onRun(async (context) => {
    console.log('[PACK 392] Running Review Intelligence Engine');

    try {
      const thirtyMinutesAgo = admin.firestore.Timestamp.fromMillis(
        Date.now() - (30 * 60 * 1000)
      );
      
      // Get all new reviews
      const reviewsSnap = await db.collection('storeReviewsRaw')
        .where('analyzed', '==', false)
        .where('timestamp', '>=', thirtyMinutesAgo)
        .limit(500)
        .get();
      
      console.log(`[PACK 392] Processing ${reviewsSnap.size} new reviews`);
      
      for (const reviewDoc of reviewsSnap.docs) {
        await analyzeReview(reviewDoc.id, reviewDoc.data());
      }
      
      // Detect review clusters
      await detectReviewClusters();
      
      // Check for coordinated attacks
      await checkCoordinatedAttacks();

      console.log('[PACK 392] Review Intelligence Engine completed');
      return { success: true, processed: reviewsSnap.size };
    } catch (error) {
      console.error('[PACK 392] Review Intelligence Engine error:', error);
      throw error;
    }
  });

// ============================================================================
// REVIEW ANALYSIS
// ============================================================================

async function analyzeReview(reviewId: string, reviewData: any): Promise<void> {
  console.log(`[PACK 392] Analyzing review: ${reviewId}`);
  
  // Run sentiment analysis
  const sentiment = await analyzeSentiment(reviewData.text);
  
  // Check authenticity
  const authenticity = await checkAuthenticity(reviewData);
  
  // Detect flags
  const flags = await detectReviewFlags(reviewData, sentiment);
  
  // Calculate threat level
  const threatLevel = calculateThreatLevel(flags, authenticity.score);
  
  // Find similar reviews
  const similarReviews = await findSimilarReviews(reviewId, reviewData.text, reviewData.storeId);
  
  // Determine clustering
  const clusterId = await assignToCluster(reviewId, reviewData.text, reviewData.storeId, sentiment);
  
  // Create review intelligence
  const intelligence: ReviewIntelligence = {
    reviewId,
    storeId: reviewData.storeId,
    userId: reviewData.userId,
    rating: reviewData.rating,
    text: reviewData.text,
    timestamp: reviewData.timestamp,
    sentiment: sentiment.sentiment as any,
    sentimentScore: sentiment.score,
    isAuthentic: authenticity.isAuthentic,
    authenticityScore: authenticity.score,
    threatLevel,
    clusterId,
    similarReviewIds: similarReviews,
    flags,
    escalated: false,
    escalationId: null,
    blocked: false,
    blockReason: null
  };
  
  // Store intelligence
  await db.collection('reviewIntelligence').doc(reviewId).set(intelligence);
  
  // Mark as analyzed
  await db.collection('storeReviewsRaw').doc(reviewId).update({ analyzed: true });
  
  // Handle threats
  if (threatLevel === 'HIGH' || threatLevel === 'CRITICAL') {
    await handleThreatReview(intelligence);
  }
  
  console.log(`[PACK 392] Review analysis complete: sentiment=${sentiment.sentiment}, threat=${threatLevel}`);
}

// ============================================================================
// SENTIMENT ANALYSIS (NLP-BASED)
// ============================================================================

async function analyzeSentiment(text: string): Promise<SentimentAnalysis> {
  // Simple NLP-based sentiment analysis
  // In production, integrate with Google NLP API or similar
  
  const lowerText = text.toLowerCase();
  
  // Positive keywords
  const positiveWords = ['great', 'amazing', 'excellent', 'love', 'perfect', 'best', 'awesome', 'fantastic', 'wonderful'];
  const negativeWords = ['terrible', 'awful', 'hate', 'worst', 'horrible', 'bad', 'poor', 'disappointing', 'useless', 'scam'];
  
  let score = 0;
  positiveWords.forEach(word => {
    if (lowerText.includes(word)) score += 0.2;
  });
  negativeWords.forEach(word => {
    if (lowerText.includes(word)) score -= 0.2;
  });
  
  // Normalize to -1 to +1
  score = Math.max(-1, Math.min(1, score));
  
  // Determine sentiment category
  let sentiment: string;
  if (score >= 0.5) sentiment = 'VERY_POSITIVE';
  else if (score >= 0.1) sentiment = 'POSITIVE';
  else if (score >= -0.1) sentiment = 'NEUTRAL';
  else if (score >= -0.5) sentiment = 'NEGATIVE';
  else sentiment = 'VERY_NEGATIVE';
  
  // Extract keywords
  const words = text.split(/\s+/).filter(w => w.length > 3);
  const keywords = words.slice(0, 10);
  
  // Extract topics (simple)
  const topics: string[] = [];
  if (lowerText.includes('crash') || lowerText.includes('bug')) topics.push('bugs');
  if (lowerText.includes('price') || lowerText.includes('cost') || lowerText.includes('expensive')) topics.push('pricing');
  if (lowerText.includes('ui') || lowerText.includes('design') || lowerText.includes('interface')) topics.push('design');
  if (lowerText.includes('feature') || lowerText.includes('function')) topics.push('features');
  
  return {
    text,
    sentiment,
    score,
    keywords,
    topics,
    emotions: {
      anger: lowerText.includes('angry') || lowerText.includes('frustrated') ? 0.7 : 0,
      joy: lowerText.includes('happy') || lowerText.includes('love') ? 0.8 : 0,
      sadness: lowerText.includes('disappointed') || lowerText.includes('sad') ? 0.6 : 0
    }
  };
}

// ============================================================================
// AUTHENTICITY CHECK
// ============================================================================

async function checkAuthenticity(reviewData: any): Promise<{ isAuthentic: boolean; score: number }> {
  let authenticityScore = 1.0;
  
  // Check user account age
  const userDoc = await db.collection('users').doc(reviewData.userId).get();
  if (userDoc.exists) {
    const userData = userDoc.data()!;
    const accountAge = Date.now() - userData.createdAt.toMillis();
    if (accountAge < 7 * 24 * 60 * 60 * 1000) { // less than 7 days
      authenticityScore -= 0.3;
    }
    
    // Check if user is KYC verified
    if (!userData.kycVerified) {
      authenticityScore -= 0.2;
    }
    
    // Check if user has completed transactions
    if (userData.transactionCount === 0) {
      authenticityScore -= 0.2;
    }
    
    // Check review history
    const reviewCountSnap = await db.collection('storeReviewsRaw')
      .where('userId', '==', reviewData.userId)
      .count()
      .get();
    
    if (reviewCountSnap.data().count > 10) { // suspiciously many reviews
      authenticityScore -= 0.3;
    }
  }
  
  // Check text quality
  if (reviewData.text.length < 10) {
    authenticityScore -= 0.2;
  }
  
  // Check for generic phrases
  const genericPhrases = ['this app', 'the app', 'good app', 'bad app', 'nice app'];
  const hasGeneric = genericPhrases.some(phrase => reviewData.text.toLowerCase().includes(phrase));
  if (hasGeneric && reviewData.text.length < 50) {
    authenticityScore -= 0.15;
  }
  
  authenticityScore = Math.max(0, Math.min(1, authenticityScore));
  
  return {
    isAuthentic: authenticityScore >= 0.5,
    score: authenticityScore
  };
}

// ============================================================================
// FLAG DETECTION
// ============================================================================

async function detectReviewFlags(reviewData: any, sentiment: SentimentAnalysis): Promise<ReviewFlag[]> {
  const flags: ReviewFlag[] = [];
  const now = admin.firestore.Timestamp.now();
  
  // Check for spam
  if (reviewData.text.length < 10 || /(.)\1{4,}/.test(reviewData.text)) {
    flags.push({
      type: 'SPAM',
      confidence: 0.9,
      reason: 'Text too short or contains repeated characters',
      detectedAt: now
    });
  }
  
  // Check for coordinated timing
  const recentReviewsSnap = await db.collection('storeReviewsRaw')
    .where('storeId', '==', reviewData.storeId)
    .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(reviewData.timestamp.toMillis() - 5 * 60 * 1000))
    .where('timestamp', '<=', admin.firestore.Timestamp.fromMillis(reviewData.timestamp.toMillis() + 5 * 60 * 1000))
    .get();
  
  if (recentReviewsSnap.size >= 5) {
    flags.push({
      type: 'COORDINATED',
      confidence: 0.7,
      reason: `${recentReviewsSnap.size} reviews within 5-minute window`,
      detectedAt: now
    });
  }
  
  // Check for incentivized language
  const incentiveKeywords = ['promo code', 'gift card', 'reward', 'paid me', 'free money', 'incentive'];
  const hasIncentive = incentiveKeywords.some(keyword => reviewData.text.toLowerCase().includes(keyword));
  if (hasIncentive) {
    flags.push({
      type: 'INCENTIVIZED',
      confidence: 0.8,
      reason: 'Contains incentive-related keywords',
      detectedAt: now
    });
  }
  
  // Check for abusive content
  const abusiveKeywords = ['scam', 'fraud', 'steal', 'criminal', 'illegal', 'lawsuit'];
  const hasAbusive = abusiveKeywords.some(keyword => reviewData.text.toLowerCase().includes(keyword));
  if (hasAbusive && reviewData.rating === 1) {
    flags.push({
      type: 'ABUSIVE',
      confidence: 0.6,
      reason: 'Contains potentially abusive or defamatory language',
      detectedAt: now
    });
  }
  
  // Check for bot patterns
  if (reviewData.text.length === reviewData.text.replace(/\s/g, '').length) { // no spaces
    flags.push({
      type: 'BOT',
      confidence: 0.7,
      reason: 'Text structure suggests bot generation',
      detectedAt: now
    });
  }
  
  return flags;
}

// ============================================================================
// THREAT LEVEL CALCULATION
// ============================================================================

function calculateThreatLevel(
  flags: ReviewFlag[],
  authenticityScore: number
): 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (flags.length === 0 && authenticityScore >= 0.7) {
    return 'NONE';
  }
  
  const highConfidenceFlags = flags.filter(f => f.confidence >= 0.7).length;
  const criticalFlags = flags.filter(f => f.type === 'COORDINATED' || f.type === 'FAKE').length;
  
  if (criticalFlags > 0 && authenticityScore < 0.3) {
    return 'CRITICAL';
  } else if (highConfidenceFlags >= 2 || authenticityScore < 0.4) {
    return 'HIGH';
  } else if (highConfidenceFlags >= 1 || authenticityScore < 0.6) {
    return 'MEDIUM';
  } else {
    return 'LOW';
  }
}

// ============================================================================
// SIMILARITY & CLUSTERING
// ============================================================================

async function findSimilarReviews(reviewId: string, text: string, storeId: string): Promise<string[]> {
  // Simple similarity: find reviews with similar text (first 50 chars)
  const snippet = text.toLowerCase().substring(0, 50);
  
  const similarSnap = await db.collection('reviewIntelligence')
    .where('storeId', '==', storeId)
    .limit(100)
    .get();
  
  const similar: string[] = [];
  similarSnap.docs.forEach(doc => {
    if (doc.id === reviewId) return;
    const data = doc.data();
    const otherSnippet = data.text.toLowerCase().substring(0, 50);
    
    // Calculate similarity (simple Jaccard)
    const words1 = new Set(snippet.split(/\s+/));
    const words2 = new Set(otherSnippet.split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    const similarity = intersection.size / union.size;
    
    if (similarity > 0.5) {
      similar.push(doc.id);
    }
  });
  
  return similar;
}

async function assignToCluster(
  reviewId: string,
  text: string,
  storeId: string,
  sentiment: SentimentAnalysis
): Promise<string | null> {
  // Find existing clusters for this store
  const clustersSnap = await db.collection('reviewClusters')
    .where('storeId', '==', storeId)
    .where('lastSeen', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
    .get();
  
  // Try to match to existing cluster
  for (const clusterDoc of clustersSnap.docs) {
    const cluster = clusterDoc.data();
    const similarity = calculateTextSimilarity(text, cluster.centroidText);
    
    if (similarity > 0.6) {
      // Add to cluster
      await db.collection('reviewClusters').doc(clusterDoc.id).update({
        reviewIds: admin.firestore.FieldValue.arrayUnion(reviewId),
        lastSeen: admin.firestore.Timestamp.now()
      });
      return clusterDoc.id;
    }
  }
  
  // Create new cluster
  const newCluster: Omit<ReviewCluster, 'id'> = {
    storeId,
    reviewIds: [reviewId],
    centroidText: text.substring(0, 100),
    sentimentAvg: sentiment.score,
    firstSeen: admin.firestore.Timestamp.now(),
    lastSeen: admin.firestore.Timestamp.now(),
    isAttack: false,
    attackType: null
  };
  
  const clusterRef = await db.collection('reviewClusters').add(newCluster);
  return clusterRef.id;
}

function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

// ============================================================================
// CLUSTER DETECTION
// ============================================================================

async function detectReviewClusters(): Promise<void> {
  const clustersSnap = await db.collection('reviewClusters')
    .where('isAttack', '==', false)
    .where('lastSeen', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
    .get();
  
  for (const clusterDoc of clustersSnap.docs) {
    const cluster = clusterDoc.data();
    
    // Check if cluster represents an attack
    if (cluster.reviewIds.length >= 5) {
      const avgSentiment = cluster.sentimentAvg;
      const timeWindow = cluster.lastSeen.toMillis() - cluster.firstSeen.toMillis();
      
      // Attack if: 5+ reviews, very negative sentiment, within 6 hours
      if (avgSentiment < -0.5 && timeWindow < 6 * 60 * 60 * 1000) {
        await db.collection('reviewClusters').doc(clusterDoc.id).update({
          isAttack: true,
          attackType: 'REVIEW_BOMB'
        });
        
        console.log(`[PACK 392] Detected attack cluster: ${clusterDoc.id}`);
      }
    }
  }
}

// ============================================================================
// COORDINATED ATTACK DETECTION
// ============================================================================

async function checkCoordinatedAttacks(): Promise<void> {
  const storesSnap = await db.collection('stores').where('active', '==', true).get();
  
  for (const storeDoc of storesSnap.docs) {
    const storeId = storeDoc.id;
    
    // Get recent attack clusters
    const attackClustersSnap = await db.collection('reviewClusters')
      .where('storeId', '==', storeId)
      .where('isAttack', '==', true)
      .where('lastSeen', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
      .get();
    
    if (attackClustersSnap.size >= 2) {
      // Multiple attack clusters = coordinated attack
      await escalateToStore(storeId, attackClustersSnap.docs);
    }
  }
}

// ============================================================================
// THREAT HANDLING
// ============================================================================

async function handleThreatReview(intelligence: ReviewIntelligence): Promise<void> {
  console.log(`[PACK 392] Handling threat review: ${intelligence.reviewId}, level: ${intelligence.threatLevel}`);
  
  // Add to threat collection
  await db.collection('storeReviewThreats').doc(intelligence.reviewId).set({
    ...intelligence,
    handledAt: admin.firestore.Timestamp.now()
  });
  
  // Auto-block if critical
  if (intelligence.threatLevel === 'CRITICAL') {
    await db.collection('reviewIntelligence').doc(intelligence.reviewId).update({
      blocked: true,
      blockReason: 'Automatic block due to critical threat level'
    });
  }
  
  // Notify admins
  await db.collection('adminNotifications').add({
    type: 'THREAT_REVIEW',
    reviewId: intelligence.reviewId,
    storeId: intelligence.storeId,
    threatLevel: intelligence.threatLevel,
    timestamp: admin.firestore.Timestamp.now(),
    read: false
  });
}

// ============================================================================
// STORE ESCALATION
// ============================================================================

async function escalateToStore(storeId: string, attackClusters: any[]): Promise<void> {
  console.log(`[PACK 392] Escalating to store for ${storeId}`);
  
  // Collect all review IDs from clusters
  const allReviewIds: string[] = [];
  attackClusters.forEach(cluster => {
    allReviewIds.push(...cluster.data().reviewIds);
  });
  
  // Build evidence bundle
  const evidenceBundle = await buildEvidenceBundle(storeId, allReviewIds);
  
  // Get store info
  const storeDoc = await db.collection('stores').doc(storeId).get();
  const storeName = storeDoc.data()?.platform || 'UNKNOWN';
  
  // Create escalation
  const escalation: Omit<ReviewEscalation, 'id'> = {
    storeId,
    storeName,
    reviewIds: allReviewIds,
    attackType: 'COORDINATED_REVIEW_BOMB',
    evidenceBundle,
    submittedAt: null,
    status: 'PENDING',
    resolution: null
  };
  
  const escalationRef = await db.collection('storeEscalations').add(escalation);
  
  // Mark reviews as escalated
  for (const reviewId of allReviewIds) {
    await db.collection('reviewIntelligence').doc(reviewId).update({
      escalated: true,
      escalationId: escalationRef.id
    });
  }
  
  console.log(`[PACK 392] Created escalation: ${escalationRef.id}`);
}

async function buildEvidenceBundle(storeId: string, reviewIds: string[]): Promise<EvidenceBundle> {
  const reviews: any[] = [];
  
  for (const reviewId of reviewIds) {
    const reviewDoc = await db.collection('storeReviewsRaw').doc(reviewId).get();
    if (reviewDoc.exists) {
      reviews.push(reviewDoc.data());
    }
  }
  
  // Analyze patterns
  const ipClusters = analyzeIPClusters(reviews);
  const deviceFingerprints = analyzeDeviceFingerprints(reviews);
  const suspiciousPatterns = identifySuspiciousPatterns(reviews);
  
  return {
    summary: `Coordinated attack detected: ${reviewIds.length} suspicious reviews in coordinated pattern`,
    suspiciousPatterns,
    reviewCount: reviewIds.length,
    timeWindow: {
      start: reviews[0].timestamp,
      end: reviews[reviews.length - 1].timestamp
    },
    ipClusters,
    deviceFingerprints,
    userAccounts: reviews.map(r => r.userId),
    screenshots: []
  };
}

function analyzeIPClusters(reviews: any[]): any[] {
  const ipMap = new Map<string, number>();
  reviews.forEach(r => {
    const ip = r.sourceIP || 'unknown';
    ipMap.set(ip, (ipMap.get(ip) || 0) + 1);
  });
  
  return Array.from(ipMap.entries())
    .filter(([ip, count]) => count > 1)
    .map(([ip, count]) => ({ ip, count }));
}

function analyzeDeviceFingerprints(reviews: any[]): any[] {
  const deviceMap = new Map<string, number>();
  reviews.forEach(r => {
    const device = r.deviceId || 'unknown';
    deviceMap.set(device, (deviceMap.get(device) || 0) + 1);
  });
  
  return Array.from(deviceMap.entries())
    .filter(([device, count]) => count > 1)
    .map(([device, count]) => ({ device, count }));
}

function identifySuspiciousPatterns(reviews: any[]): string[] {
  const patterns: string[] = [];
  
  // Check timing
  const timestamps = reviews.map(r => r.timestamp.toMillis()).sort();
  const firstLast = timestamps[timestamps.length - 1] - timestamps[0];
  if (firstLast < 60 * 60 * 1000) {
    patterns.push(`All reviews within 1 hour window`);
  }
  
  // Check rating distribution
  const ratings = reviews.map(r => r.rating);
  const oneStarPercent = ratings.filter(r => r === 1).length / ratings.length;
  if (oneStarPercent > 0.8) {
    patterns.push(`${Math.round(oneStarPercent * 100)}% are 1-star reviews`);
  }
  
  // Check text similarity
  const texts = reviews.map(r => r.text.substring(0, 50));
  const uniqueTexts = new Set(texts);
  if (uniqueTexts.size < texts.length * 0.5) {
    patterns.push(`High text similarity detected (${uniqueTexts.size}/${texts.length} unique)`);
  }
  
  return patterns;
}

// ============================================================================
// MANUAL FUNCTIONS
// ============================================================================

export const pack392_analyzeReviewManual = functions
  .https
  .onCall(async (data, context) => {
    if (!context.auth?.token.admin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin required');
    }

    const { reviewId } = data;
    const reviewDoc = await db.collection('storeReviewsRaw').doc(reviewId).get();
    
    if (!reviewDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Review not found');
    }

    await analyzeReview(reviewId, reviewDoc.data());
    
    const intelligenceDoc = await db.collection('reviewIntelligence').doc(reviewId).get();
    return intelligenceDoc.data();
  });

export const pack392_getReviewThreats = functions
  .https
  .onCall(async (data, context) => {
    if (!context.auth?.token.admin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin required');
    }

    const { storeId } = data;
    const threatsSnap = await db.collection('storeReviewThreats')
      .where('storeId', '==', storeId)
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();

    return threatsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  });

export const pack392_escalateReviews = functions
  .https
  .onCall(async (data, context) => {
    if (!context.auth?.token.admin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin required');
    }

    const { escalationId } = data;
    const escalationDoc = await db.collection('storeEscalations').doc(escalationId).get();
    
    if (!escalationDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Escalation not found');
    }

    await db.collection('storeEscalations').doc(escalationId).update({
      submittedAt: admin.firestore.Timestamp.now(),
      status: 'SUBMITTED'
    });

    return { success: true };
  });
