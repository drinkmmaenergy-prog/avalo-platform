/**
 * PACK 392 - Trust Score & Store Safety Rating Engine
 * Global app trust scoring based on multiple signals
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPES
// ============================================================================

export interface AppTrustScore {
  globalScore: number; // 0-100
  storeScores: { [storeId: string]: number };
  components: TrustScoreComponents;
  lastCalculated: FirebaseFirestore.Timestamp;
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  historicalScores: HistoricalScore[];
}

export interface TrustScoreComponents {
  verifiedReviewsScore: number; // 0-25
  retentionRateScore: number; // 0-25
  payoutSuccessScore: number; // 0-25
  fraudIncidentScore: number; // 0-15
  panicReportScore: number; // 0-10
}

export interface HistoricalScore {
  score: number;
  timestamp: FirebaseFirestore.Timestamp;
}

export interface UserTrustImpact {
  userId: string;
  impactOnGlobalScore: number; // -10 to +10
  reason: string;
  timestamp: FirebaseFirestore.Timestamp;
}

export interface StoreSafetyRating {
  storeId: string;
  safetyRating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
  safetyScore: number; // 0-100
  riskFactors: RiskFactor[];
  protectionLevel: 'MAXIMUM' | 'HIGH' | 'MEDIUM' | 'LOW';
  certifications: string[];
  lastAudit: FirebaseFirestore.Timestamp;
}

export interface RiskFactor {
  category: 'SECURITY' | 'FRAUD' | 'CONTENT' | 'FINANCIAL' | 'LEGAL';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  mitigated: boolean;
}

// ============================================================================
// CORE: TRUST SCORE CALCULATION ENGINE
// ============================================================================

export const pack392_calculateTrustScore = functions
  .runWith({ 
    timeoutSeconds: 300,
    memory: '2GB'
  })
  .pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    console.log('[PACK 392] Calculating Global Trust Score');

    try {
      // Calculate component scores
      const verifiedReviewsScore = await calculateVerifiedReviewsScore();
      const retentionRateScore = await calculateRetentionRateScore();
      const payoutSuccessScore = await calculatePayoutSuccessScore();
      const fraudIncidentScore = await calculateFraudIncidentScore();
      const panicReportScore = await calculatePanicReportScore();
      
      const components: TrustScoreComponents = {
        verifiedReviewsScore,
        retentionRateScore,
        payoutSuccessScore,
        fraudIncidentScore,
        panicReportScore
      };
      
      // Calculate global score
      const globalScore = 
        verifiedReviewsScore +
        retentionRateScore +
        payoutSuccessScore +
        fraudIncidentScore +
        panicReportScore;
      
      // Calculate per-store scores
      const storeScores = await calculateStoreScores();
      
      // Get historical scores
      const historicalSnap = await db.collection('appTrustScore')
        .orderBy('lastCalculated', 'desc')
        .limit(1)
        .get();
      
      const previousScore = historicalSnap.empty ? globalScore : historicalSnap.docs[0].data().globalScore;
      const trend = determineTrend(globalScore, previousScore);
      
      // Get previous historical scores (keep last 30)
      const historical: HistoricalScore[] = [];
      if (!historicalSnap.empty) {
        const prevData = historicalSnap.docs[0].data();
        historical.push(...(prevData.historicalScores || []).slice(0, 29));
      }
      historical.unshift({
        score: globalScore,
        timestamp: admin.firestore.Timestamp.now()
      });
      
      // Save trust score
      const trustScore: AppTrustScore = {
        globalScore,
        storeScores,
        components,
        lastCalculated: admin.firestore.Timestamp.now(),
        trend,
        historicalScores: historical
      };
      
      await db.collection('appTrustScore').doc('current').set(trustScore);
      
      console.log(`[PACK 392] Global Trust Score: ${globalScore}/100 (${trend})`);
      
      return { success: true, globalScore, trend };
    } catch (error) {
      console.error('[PACK 392] Trust Score calculation error:', error);
      throw error;
    }
  });

// ============================================================================
// COMPONENT: VERIFIED REVIEWS SCORE (0-25 points)
// ============================================================================

async function calculateVerifiedReviewsScore(): Promise<number> {
  const thirtyDaysAgo = admin.firestore.Timestamp.fromMillis(
    Date.now() - (30 * 24 * 60 * 60 * 1000)
  );
  
  // Get all reviews from verified users
  const reviewsSnap = await db.collection('storeReviewsRaw')
    .where('timestamp', '>=', thirtyDaysAgo)
    .get();
  
  if (reviewsSnap.empty) return 0;
  
  let verifiedCount = 0;
  let totalRating = 0;
  let verifiedTotalRating = 0;
  
  for (const reviewDoc of reviewsSnap.docs) {
    const reviewData = reviewDoc.data();
    totalRating += reviewData.rating;
    
    // Check if user is KYC verified and has transactions
    const userDoc = await db.collection('users').doc(reviewData.userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data()!;
      if (userData.kycVerified && userData.transactionCount > 0) {
        verifiedCount++;
        verifiedTotalRating += reviewData.rating;
      }
    }
  }
  
  const verifiedPercent = verifiedCount / reviewsSnap.size;
  const avgVerifiedRating = verifiedCount > 0 ? verifiedTotalRating / verifiedCount : 0;
  
  // Score calculation: (verified % * 10) + (avg rating / 5 * 15)
  const score = (verifiedPercent * 10) + ((avgVerifiedRating / 5) * 15);
  
  return Math.round(Math.min(25, score));
}

// ============================================================================
// COMPONENT: RETENTION RATE SCORE (0-25 points)
// ============================================================================

async function calculateRetentionRateScore(): Promise<number> {
  // Get retention metrics from PACK 301
  const retentionDoc = await db.collection('retentionMetrics').doc('current').get();
  
  if (!retentionDoc.exists) return 0;
  
  const retentionData = retentionDoc.data()!;
  
  // Day 1, Day 7, Day 30 retention rates
  const day1Retention = retentionData.day1Retention || 0;
  const day7Retention = retentionData.day7Retention || 0;
  const day30Retention = retentionData.day30Retention || 0;
  
  // Weighted average: Day 1 (30%), Day 7 (40%), Day 30 (30%)
  const weightedRetention = (day1Retention * 0.3) + (day7Retention * 0.4) + (day30Retention * 0.3);
  
  // Score: retention rate * 25
  return Math.round(weightedRetention * 25);
}

// ============================================================================
// COMPONENT: PAYOUT SUCCESS SCORE (0-25 points)
// ============================================================================

async function calculatePayoutSuccessScore(): Promise<number> {
  const thirtyDaysAgo = admin.firestore.Timestamp.fromMillis(
    Date.now() - (30 * 24 * 60 * 60 * 1000)
  );
  
  // Get all payout attempts
  const payoutsSnap = await db.collection('payouts')
    .where('createdAt', '>=', thirtyDaysAgo)
    .get();
  
  if (payoutsSnap.empty) return 15; // Default decent score if no payouts yet
  
  const successful = payoutsSnap.docs.filter(d => d.data().status === 'COMPLETED').length;
  const failed = payoutsSnap.docs.filter(d => d.data().status === 'FAILED').length;
  const disputed = payoutsSnap.docs.filter(d => d.data().status === 'DISPUTED').length;
  
  const successRate = successful / payoutsSnap.size;
  const disputeRate = disputed / payoutsSnap.size;
  
  // Success rate contributes 20 points, low dispute rate contributes 5
  const successScore = successRate * 20;
  const disputeScore = Math.max(0, 5 - (disputeRate * 50)); // Penalty for disputes
  
  return Math.round(successScore + disputeScore);
}

// ============================================================================
// COMPONENT: FRAUD INCIDENT SCORE (0-15 points, inverse)
// ============================================================================

async function calculateFraudIncidentScore(): Promise<number> {
  const thirtyDaysAgo = admin.firestore.Timestamp.fromMillis(
    Date.now() - (30 * 24 * 60 * 60 * 1000)
  );
  
  // Get fraud incidents from PACK 302
  const fraudSnap = await db.collection('fraudDetections')
    .where('detectedAt', '>=', thirtyDaysAgo)
    .where('confirmed', '==', true)
    .get();
  
  // Get total user count for rate calculation
  const usersSnap = await db.collection('users')
    .where('createdAt', '>=', thirtyDaysAgo)
    .get();
  
  const fraudRate = usersSnap.size > 0 ? fraudSnap.size / usersSnap.size : 0;
  
  // Score: inverse of fraud rate, max 15 points
  // 0% fraud = 15 points, 1% fraud = 10 points, 2%+ fraud = 0 points
  let score = 15;
  if (fraudRate > 0.02) {
    score = 0;
  } else if (fraudRate > 0.01) {
    score = Math.round(15 - ((fraudRate - 0.01) * 1000));
  } else {
    score = Math.round(15 - (fraudRate * 500));
  }
  
  return Math.max(0, score);
}

// ============================================================================
// COMPONENT: PANIC REPORT SCORE (0-10 points, inverse)
// ============================================================================

async function calculatePanicReportScore(): Promise<number> {
  const thirtyDaysAgo = admin.firestore.Timestamp.fromMillis(
    Date.now() - (30 * 24 * 60 * 60 * 1000)
  );
  
  // Get panic reports from PACK 300
  const panicSnap = await db.collection('supportTickets')
    .where('type', '==', 'PANIC')
    .where('createdAt', '>=', thirtyDaysAgo)
    .get();
  
  // Get total active users
  const activeUsersSnap = await db.collection('users')
    .where('lastActive', '>=', thirtyDaysAgo)
    .get();
  
  const panicRate = activeUsersSnap.size > 0 ? panicSnap.size / activeUsersSnap.size : 0;
  
  // Score: inverse of panic rate, max 10 points
  // 0% panic = 10 points, 0.5% = 5 points, 1%+ = 0 points
  let score = 10;
  if (panicRate > 0.01) {
    score = 0;
  } else if (panicRate > 0.005) {
    score = Math.round(10 - ((panicRate - 0.005) * 1000));
  } else {
    score = Math.round(10 - (panicRate * 1000));
  }
  
  return Math.max(0, score);
}

// ============================================================================
// PER-STORE SCORES
// ============================================================================

async function calculateStoreScores(): Promise<{ [storeId: string]: number }> {
  const storesSnap = await db.collection('stores').where('active', '==', true).get();
  const scores: { [storeId: string]: number } = {};
  
  for (const storeDoc of storesSnap.docs) {
    const storeId = storeDoc.id;
    
    // Get store-specific metrics
    const defenseDoc = await db.collection('storeDefense').doc(storeId).get();
    const asoSnap = await db.collection('asoMetrics').where('storeId', '==', storeId).get();
    
    let storeScore = 100; // Start with perfect score
    
    // Deduct based on threats
    if (defenseDoc.exists) {
      const defenseData = defenseDoc.data()!;
      if (defenseData.storeRiskState === 'CRITICAL') {
        storeScore -= 40;
      } else if (defenseData.storeRiskState === 'WARNING') {
        storeScore -= 20;
      }
      
      storeScore -= Math.min(30, defenseData.storeThreatScore * 0.3);
    }
    
    // Add based on ASO performance
    if (!asoSnap.empty) {
      const avgASOScore = asoSnap.docs.reduce((sum, doc) => sum + (doc.data().overallScore || 0), 0) / asoSnap.size;
      storeScore += (avgASOScore - 50) * 0.2; // Bonus for above-average ASO
    }
    
    scores[storeId] = Math.max(0, Math.min(100, Math.round(storeScore)));
  }
  
  return scores;
}

// ============================================================================
// TREND DETERMINATION
// ============================================================================

function determineTrend(currentScore: number, previousScore: number): 'IMPROVING' | 'STABLE' | 'DECLINING' {
  const diff = currentScore - previousScore;
  
  if (diff > 2) {
    return 'IMPROVING';
  } else if (diff < -2) {
    return 'DECLINING';
  } else {
    return 'STABLE';
  }
}

// ============================================================================
// USER IMPACT TRACKING
// ============================================================================

export const pack392_trackUserTrustImpact = functions
  .runWith({ timeoutSeconds: 60 })
  .https
  .onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { userId, event } = data;
    let impact = 0;
    let reason = '';
    
    // Calculate impact based on event
    switch (event) {
      case 'KYC_VERIFIED':
        impact = +2;
        reason = 'User completed KYC verification';
        break;
      case 'FIRST_TRANSACTION':
        impact = +1;
        reason = 'User completed first transaction';
        break;
      case 'POSITIVE_REVIEW':
        impact = +1;
        reason = 'User left verified positive review';
        break;
      case 'SUCCESSFUL_PAYOUT':
        impact = +1;
        reason = 'Successful payout completed';
        break;
      case 'FRAUD_DETECTED':
        impact = -5;
        reason = 'Fraud activity detected';
        break;
      case 'PANIC_REPORT':
        impact = -3;
        reason = 'Panic report filed';
        break;
      case 'CHARGEBACK':
        impact = -4;
        reason = 'Payment chargeback';
        break;
      case 'REFUND_ABUSE':
        impact = -2;
        reason = 'Refund abuse pattern detected';
        break;
      default:
        impact = 0;
    }
    
    if (impact !== 0) {
      const userImpact: UserTrustImpact = {
        userId,
        impactOnGlobalScore: impact,
        reason,
        timestamp: admin.firestore.Timestamp.now()
      };
      
      await db.collection('userTrustImpacts').add(userImpact);
      
      // Update user's trust contribution
      await db.collection('users').doc(userId).update({
        trustContribution: admin.firestore.FieldValue.increment(impact),
        lastTrustUpdate: admin.firestore.Timestamp.now()
      });
    }
    
    return { impact, reason };
  });

// ============================================================================
// STORE SAFETY RATING
// ============================================================================

export const pack392_calculateStoreSafetyRating = functions
  .runWith({ timeoutSeconds: 300 })
  .pubsub
  .schedule('every 12 hours')
  .onRun(async (context) => {
    console.log('[PACK 392] Calculating Store Safety Ratings');

    const storesSnap = await db.collection('stores').where('active', '==', true).get();
    
    for (const storeDoc of storesSnap.docs) {
      const storeId = storeDoc.id;
      await calculateStoreSafetyRating(storeId);
    }

    return { success: true, calculated: storesSnap.size };
  });

async function calculateStoreSafetyRating(storeId: string): Promise<void> {
  const riskFactors: RiskFactor[] = [];
  let safetyScore = 100;
  
  // Check security risks
  const securityAuditDoc = await db.collection('securityAudits').doc(storeId).get();
  if (!securityAuditDoc.exists || securityAuditDoc.data()!.lastAudit < admin.firestore.Timestamp.fromMillis(Date.now() - 90 * 24 * 60 * 60 * 1000)) {
    riskFactors.push({
      category: 'SECURITY',
      severity: 'MEDIUM',
      description: 'Security audit overdue',
      mitigated: false
    });
    safetyScore -= 15;
  }
  
  // Check fraud risks
  const defenseDoc = await db.collection('storeDefense').doc(storeId).get();
  if (defenseDoc.exists && defenseDoc.data()!.storeRiskState === 'CRITICAL') {
    riskFactors.push({
      category: 'FRAUD',
      severity: 'CRITICAL',
      description: 'Active coordinated attack detected',
      mitigated: false
    });
    safetyScore -= 40;
  }
  
  // Check content moderation
  const moderationDoc = await db.collection('contentModeration').doc(storeId).get();
  if (moderationDoc.exists && moderationDoc.data()!.violationRate > 0.05) {
    riskFactors.push({
      category: 'CONTENT',
      severity: 'HIGH',
      description: 'High content violation rate',
      mitigated: false
    });
    safetyScore -= 25;
  }
  
  // Check financial compliance
  const complianceDoc = await db.collection('financialCompliance').doc(storeId).get();
  if (!complianceDoc.exists || !complianceDoc.data()!.amlCompliant) {
    riskFactors.push({
      category: 'FINANCIAL',
      severity: 'HIGH',
      description: 'AML compliance issues',
      mitigated: false
    });
    safetyScore -= 30;
  }
  
  // Determine safety rating
  let safetyRating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
  if (safetyScore >= 90) safetyRating = 'EXCELLENT';
  else if (safetyScore >= 75) safetyRating = 'GOOD';
  else if (safetyScore >= 60) safetyRating = 'FAIR';
  else if (safetyScore >= 40) safetyRating = 'POOR';
  else safetyRating = 'CRITICAL';
  
  // Determine protection level
  let protectionLevel: 'MAXIMUM' | 'HIGH' | 'MEDIUM' | 'LOW';
  if (safetyScore >= 85) protectionLevel = 'MAXIMUM';
  else if (safetyScore >= 70) protectionLevel = 'HIGH';
  else if (safetyScore >= 50) protectionLevel = 'MEDIUM';
  else protectionLevel = 'LOW';
  
  // Get certifications
  const certificationsSnap = await db.collection('storeCertifications')
    .where('storeId', '==', storeId)
    .where('active', '==', true)
    .get();
  
  const certifications = certificationsSnap.docs.map(d => d.data().name);
  
  // Save safety rating
  const rating: StoreSafetyRating = {
    storeId,
    safetyRating,
    safetyScore,
    riskFactors,
    protectionLevel,
    certifications,
    lastAudit: admin.firestore.Timestamp.now()
  };
  
  await db.collection('storeSafetyRatings').doc(storeId).set(rating);
  
  console.log(`[PACK 392] Store ${storeId} safety: ${safetyRating} (${safetyScore}/100)`);
}

// ============================================================================
// MANUAL FUNCTIONS
// ============================================================================

export const pack392_getTrustScore = functions
  .https
  .onCall(async (data, context) => {
    const trustDoc = await db.collection('appTrustScore').doc('current').get();
    
    if (!trustDoc.exists) {
      return { globalScore: 0, message: 'Trust score not yet calculated' };
    }
    
    return trustDoc.data();
  });

export const pack392_getStoreSafetyRating = functions
  .https
  .onCall(async (data, context) => {
    const { storeId } = data;
    
    if (!storeId) {
      throw new functions.https.HttpsError('invalid-argument', 'storeId required');
    }
    
    const ratingDoc = await db.collection('storeSafetyRatings').doc(storeId).get();
    
    if (!ratingDoc.exists) {
      return { message: 'Safety rating not yet calculated' };
    }
    
    return ratingDoc.data();
  });

export const pack392_recalculateTrustScore = functions
  .runWith({ timeoutSeconds: 300 })
  .https
  .onCall(async (data, context) => {
    if (!context.auth?.token.admin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin required');
    }

    // Trigger immediate recalculation
    await pack392_calculateTrustScore(context);
    
    const trustDoc = await db.collection('appTrustScore').doc('current').get();
    return trustDoc.data();
  });
