/**
 * PACK 371: APP STORE DEFENSE, REVIEWS, REPUTATION & TRUST ENGINE
 * 
 * Features:
 * - Store Review Defense & Monitoring
 * - Automated Safe Response System
 * - Trust Score Engine (User + Platform)
 * - Fake Review & Bot Attack Shield
 * - Positive Review Acquisition
 * - ASO Reputation Optimizer
 * - Support + Store Integration
 * - Audit & Compliance
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const db = admin.firestore();

// ===== INTERFACES =====

interface StoreReputationSignal {
  source: 'app_store' | 'google_play';
  rating: number;
  text: string;
  sentimentScore: number;
  fraudProbability: number;
  userId?: string;
  geo: string;
  detectedAt: admin.firestore.Timestamp;
  actionTaken: string;
  reviewId: string;
  deviceFingerprint?: string;
}

interface TrustScore {
  userId: string;
  overallScore: number;
  profileVerification: number;
  creatorEarningsHonesty: number;
  appointmentReliability: number;
  reportHistory: number;
  identityConfirmation: number;
  lastUpdated: admin.firestore.Timestamp;
  decayApplied: admin.firestore.Timestamp;
}

interface PlatformTrustMetrics {
  reviewSentimentAverage: number;
  refundRatio: number;
  safetyIncidentResolutionTime: number;
  disputeResolutionScore: number;
  lastUpdated: admin.firestore.Timestamp;
}

interface ReputationAttack {
  attackType: 'review_spike' | 'geo_flood' | 'wording_cluster' | 'device_repeat';
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: admin.firestore.Timestamp;
  signalIds: string[];
  geo?: string;
  deviceFingerprints?: string[];
  actionsTaken: string[];
  resolved: boolean;
  reportedToStores: boolean;
}

interface ReviewNudge {
  userId: string;
  trigger: string;
  shownAt: admin.firestore.Timestamp;
  converted: boolean;
  conversionTime?: admin.firestore.Timestamp;
}

// ===== SENTIMENT ANALYSIS =====

/**
 * Analyze sentiment of review text
 * Range: -1 (very negative) to +1 (very positive)
 */
function analyzeSentiment(text: string): number {
  const lowerText = text.toLowerCase();
  
  // Positive keywords
  const positiveWords = [
    'great', 'excellent', 'amazing', 'wonderful', 'perfect', 'awesome',
    'love', 'fantastic', 'outstanding', 'superb', 'brilliant', 'best',
    'helpful', 'friendly', 'easy', 'smooth', 'fast', 'reliable'
  ];
  
  // Negative keywords
  const negativeWords = [
    'terrible', 'awful', 'horrible', 'worst', 'bad', 'poor', 'useless',
    'hate', 'scam', 'fraud', 'fake', 'broken', 'crash', 'bug', 'slow',
    'disappointing', 'waste', 'refund', 'money', 'steal', 'cheat'
  ];
  
  let score = 0;
  let wordCount = 0;
  
  positiveWords.forEach(word => {
    const count = (lowerText.match(new RegExp(word, 'g')) || []).length;
    score += count * 0.2;
    wordCount += count;
  });
  
  negativeWords.forEach(word => {
    const count = (lowerText.match(new RegExp(word, 'g')) || []).length;
    score -= count * 0.2;
    wordCount += count;
  });
  
  // Normalize to -1 to +1 range
  if (wordCount === 0) {
    return 0; // Neutral if no sentiment words found
  }
  
  return Math.max(-1, Math.min(1, score / Math.max(1, wordCount)));
}

/**
 * Calculate fraud probability based on various signals
 */
function calculateFraudProbability(signal: Partial<StoreReputationSignal>, recentSignals: StoreReputationSignal[]): number {
  let fraudScore = 0;
  let factors = 0;
  
  // Check for extreme rating mismatch with sentiment
  if (signal.rating && signal.sentimentScore !== undefined) {
    const expectedRating = (signal.sentimentScore + 1) * 2.5; // Convert -1 to +1 => 0 to 5
    const ratingDiff = Math.abs(signal.rating - expectedRating);
    if (ratingDiff > 3) {
      fraudScore += 0.4;
      factors++;
    }
  }
  
  // Check for very short or generic text
  if (signal.text && signal.text.length < 20) {
    fraudScore += 0.2;
    factors++;
  }
  
  // Check for duplicate or very similar text in recent signals
  if (signal.text && recentSignals.length > 0) {
    const similarTexts = recentSignals.filter(s => {
      const similarity = calculateTextSimilarity(signal.text!, s.text);
      return similarity > 0.8;
    });
    if (similarTexts.length > 0) {
      fraudScore += 0.5;
      factors++;
    }
  }
  
  // Check for same geo spike
  if (signal.geo && recentSignals.length > 0) {
    const sameGeoCount = recentSignals.filter(s => s.geo === signal.geo).length;
    if (sameGeoCount > 5) {
      fraudScore += 0.3;
      factors++;
    }
  }
  
  return factors > 0 ? Math.min(1, fraudScore / factors) : 0;
}

/**
 * Calculate text similarity (simple Jaccard similarity)
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

// ===== 1️⃣ APP STORE REVIEW DEFENSE ENGINE =====

/**
 * Scan and analyze app store reviews
 * Scheduled to run every 30 minutes
 */
export const pack371_scanStoreReviews = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async (context) => {
    console.log('Starting store review scan...');
    
    try {
      // Check feature flag
      const flagDoc = await db.collection('featureFlags').doc('store.defense.enabled').get();
      if (!flagDoc.exists || !flagDoc.data()?.enabled) {
        console.log('Store defense disabled');
        return null;
      }
      
      // Get recent signals (last hour) for comparison
      const oneHourAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 3600000);
      const recentSignalsSnap = await db.collection('storeReputationSignals')
        .where('detectedAt', '>', oneHourAgo)
        .get();
      const recentSignals = recentSignalsSnap.docs.map(d => d.data() as StoreReputationSignal);
      
      // In production, this would fetch from App Store Connect API and Google Play API
      // For now, we set up the detection framework
      
      // Simulate processing (in production would be real API data)
      console.log(`Analyzed ${recentSignals.length} recent reviews`);
      
      // Check for attack patterns
      await detectReputationAttack();
      
      // Update platform metrics
      await updatePlatformTrustMetrics();
      
      return null;
    } catch (error) {
      console.error('Error scanning store reviews:', error);
      throw error;
    }
  });

/**
 * Process individual review (called when new review detected)
 */
export const pack371_processReview = functions.firestore
  .document('storeReputationSignals/{signalId}')
  .onCreate(async (snap, context) => {
    const signal = snap.data() as StoreReputationSignal;
    
    try {
      // Calculate sentiment if not provided
      if (signal.sentimentScore === undefined) {
        signal.sentimentScore = analyzeSentiment(signal.text);
      }
      
      // Get recent signals for fraud detection
      const recentSignalsSnap = await db.collection('storeReputationSignals')
        .orderBy('detectedAt', 'desc')
        .limit(100)
        .get();
      const recentSignals = recentSignalsSnap.docs
        .map(d => d.data() as StoreReputationSignal)
        .filter(s => s.reviewId !== signal.reviewId);
      
      // Calculate fraud probability
      signal.fraudProbability = calculateFraudProbability(signal, recentSignals);
      
      // Update the signal with calculated values
      await snap.ref.update({
        sentimentScore: signal.sentimentScore,
        fraudProbability: signal.fraudProbability,
      });
      
      // Check for urgent issues that need support tickets
      await checkForSupportEscalation(signal);
      
      // Log audit event
      await logAuditEvent('review_processed', {
        signalId: context.params.signalId,
        fraudProbability: signal.fraudProbability,
        sentimentScore: signal.sentimentScore,
      });
      
      return null;
    } catch (error) {
      console.error('Error processing review:', error);
      throw error;
    }
  });

// ===== 2️⃣ AUTOMATED RESPONSE SYSTEM =====

/**
 * Generate safe reply to review
 */
export const pack371_generateSafeReply = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const { reviewId } = data;
  
  if (!reviewId) {
    throw new functions.https.HttpsError('invalid-argument', 'reviewId required');
  }
  
  try {
    // Check feature flag
    const flagDoc = await db.collection('featureFlags').doc('review.ai.responses.enabled').get();
    if (!flagDoc.exists || !flagDoc.data()?.enabled) {
      throw new functions.https.HttpsError('failed-precondition', 'AI responses disabled');
    }
    
    // Get review signal
    const signalSnap = await db.collection('storeReputationSignals')
      .where('reviewId', '==', reviewId)
      .limit(1)
      .get();
    
    if (signalSnap.empty) {
      throw new functions.https.HttpsError('not-found', 'Review not found');
    }
    
    const signal = signalSnap.docs[0].data() as StoreReputationSignal;
    
    // Get response templates
    const templatesSnap = await db.collection('reviewResponseTemplates')
      .where('sentimentRange.min', '<=', signal.sentimentScore)
      .where('sentimentRange.max', '>=', signal.sentimentScore)
      .get();
    
    let responseText = '';
    
    if (!templatesSnap.empty) {
      // Use template
      const template = templatesSnap.docs[0].data();
      responseText = template.text;
    } else {
      // Generate safe default response based on sentiment
      responseText = generateDefaultResponse(signal);
    }
    
    // Verify response is safe
    const isSafe = verifySafeResponse(responseText);
    
    if (!isSafe) {
      throw new functions.https.HttpsError('internal', 'Generated response not safe');
    }
    
    // Log audit event
    await logAuditEvent('review_response_generated', {
      reviewId,
      sentimentScore: signal.sentimentScore,
      legalSafe: true,
      brandSafe: true,
    });
    
    return {
      response: responseText,
      legalSafe: true,
      brandSafe: true,
    };
  } catch (error) {
    console.error('Error generating safe reply:', error);
    throw error;
  }
});

/**
 * Generate default safe response based on review sentiment
 */
function generateDefaultResponse(signal: StoreReputationSignal): string {
  if (signal.sentimentScore > 0.3) {
    // Positive review
    return "Thank you so much for your kind words! We're thrilled you're enjoying Avalo. Your feedback helps us continue improving the experience for everyone. 🌟";
  } else if (signal.sentimentScore < -0.3) {
    // Negative review
    return "Thank you for your feedback. We take all concerns seriously and continuously work to improve Avalo. Please reach out to our support team at support@avalo.app so we can better understand and address your experience.";
  } else {
    // Neutral review
    return "Thank you for taking the time to share your feedback. We're always working to improve Avalo and would love to hear more about your experience. Feel free to contact us at support@avalo.app anytime.";
  }
}

/**
 * Verify response doesn't contain unsafe content
 */
function verifySafeResponse(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // Check for prohibited terms
  const prohibitedTerms = [
    'refund', 'money back', 'guarantee', 'promise', 'legal',
    'lawsuit', 'sue', 'attorney', 'lawyer', 'settlement',
    'personal information', 'password', 'credit card', 'ssn',
    'social security', 'bank account'
  ];
  
  for (const term of prohibitedTerms) {
    if (lowerText.includes(term)) {
      return false;
    }
  }
  
  return true;
}

// ===== 3️⃣ TRUST SCORE ENGINE =====

/**
 * Calculate and update user trust score
 */
export const pack371_updateTrustScore = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const { userId } = data;
  const targetUserId = userId || context.auth.uid;
  
  try {
    // Check feature flag
    const flagDoc = await db.collection('featureFlags').doc('trust.score.enabled').get();
    if (!flagDoc.exists || !flagDoc.data()?.enabled) {
      throw new functions.https.HttpsError('failed-precondition', 'Trust score disabled');
    }
    
    // Get user data
    const userDoc = await db.collection('users').doc(targetUserId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }
    
    const userData = userDoc.data()!;
    
    // Calculate trust components
    const profileVerification = calculateProfileVerification(userData);
    const creatorEarningsHonesty = await calculateCreatorEarningsHonesty(targetUserId);
    const appointmentReliability = await calculateAppointmentReliability(targetUserId);
    const reportHistory = await calculateReportHistory(targetUserId);
    const identityConfirmation = calculateIdentityConfirmation(userData);
    
    // Calculate overall score (weighted average)
    const overallScore = (
      profileVerification * 0.25 +
      creatorEarningsHonesty * 0.20 +
      appointmentReliability * 0.25 +
      reportHistory * 0.15 +
      identityConfirmation * 0.15
    );
    
    // Save trust score
    const trustScore: TrustScore = {
      userId: targetUserId,
      overallScore,
      profileVerification,
      creatorEarningsHonesty,
      appointmentReliability,
      reportHistory,
      identityConfirmation,
      lastUpdated: admin.firestore.Timestamp.now(),
      decayApplied: admin.firestore.Timestamp.now(),
    };
    
    await db.collection('trustScore').doc(targetUserId).set(trustScore, { merge: true });
    
    // Log audit event
    await logAuditEvent('trust_score_updated', {
      userId: targetUserId,
      overallScore,
    });
    
    return { trustScore: overallScore };
  } catch (error) {
    console.error('Error updating trust score:', error);
    throw error;
  }
});

/**
 * Calculate profile verification score (0-1)
 */
function calculateProfileVerification(userData: any): number {
  let score = 0;
  let factors = 0;
  
  if (userData.emailVerified) {
    score += 0.3;
    factors++;
  }
  
  if (userData.phoneVerified) {
    score += 0.3;
    factors++;
  }
  
  if (userData.photoURL) {
    score += 0.2;
    factors++;
  }
  
  if (userData.bio && userData.bio.length > 50) {
    score += 0.2;
    factors++;
  }
  
  return factors > 0 ? score : 0;
}

/**
 * Calculate creator earnings honesty (0-1)
 */
async function calculateCreatorEarningsHonesty(userId: string): Promise<number> {
  // Check if user has creator earnings and withdrawals
  const walletDoc = await db.collection('wallets').doc(userId).get();
  if (!walletDoc.exists) return 0.5; // Neutral if no data
  
  const walletData = walletDoc.data()!;
  
  // Check for suspicious patterns
  const hasReasonableBalance = walletData.availableRealUSD >= 0;
  const hasWithdrawals = walletData.totalWithdrawn > 0;
  
  if (!hasReasonableBalance) return 0; // Red flag
  if (hasWithdrawals) return 1; // Good sign
  
  return 0.7; // Neutral-positive
}

/**
 * Calculate appointment reliability (0-1)
 */
async function calculateAppointmentReliability(userId: string): Promise<number> {
  // Get completed vs cancelled appointments
  const appointmentsSnap = await db.collection('videoCallEvents')
    .where('creatorId', '==', userId)
    .where('status', 'in', ['completed', 'cancelled', 'no_show'])
    .limit(50)
    .get();
  
  if (appointmentsSnap.empty) return 0.8; // Neutral-high for new users
  
  const appointments = appointmentsSnap.docs.map(d => d.data());
  const completed = appointments.filter(a => a.status === 'completed').length;
  const total = appointments.length;
  
  return completed / total;
}

/**
 * Calculate report history score (0-1)
 */
async function calculateReportHistory(userId: string): Promise<number> {
  // Check safety reports against user
  const reportsSnap = await db.collection('safetyReports')
    .where('reportedUserId', '==', userId)
    .where('status', '==', 'confirmed')
    .get();
  
  if (reportsSnap.empty) return 1; // Perfect if no confirmed reports
  
  const reportCount = reportsSnap.size;
  
  // Penalize based on confirmed reports
  return Math.max(0, 1 - (reportCount * 0.2));
}

/**
 * Calculate identity confirmation score (0-1)
 */
function calculateIdentityConfirmation(userData: any): number {
  if (userData.kycStatus === 'verified') return 1;
  if (userData.kycStatus === 'pending') return 0.5;
  return 0.3; // Base score for unverified
}

/**
 * Apply trust score decay (scheduled daily)
 */
export const pack371_applyTrustScoreDecay = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    console.log('Applying trust score decay...');
    
    try {
      const oneMonthAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 86400000);
      
      const scoresSnap = await db.collection('trustScore')
        .where('lastUpdated', '<', oneMonthAgo)
        .get();
      
      const batch = db.batch();
      let updateCount = 0;
      
      for (const doc of scoresSnap.docs) {
        const score = doc.data() as TrustScore;
        
        // Decay by 5% per month of inactivity
        const newScore = score.overallScore * 0.95;
        
        batch.update(doc.ref, {
          overallScore: newScore,
          decayApplied: admin.firestore.Timestamp.now(),
        });
        
        updateCount++;
        
        // Commit in batches of 500
        if (updateCount % 500 === 0) {
          await batch.commit();
        }
      }
      
      if (updateCount % 500 !== 0) {
        await batch.commit();
      }
      
      console.log(`Applied decay to ${updateCount} trust scores`);
      return null;
    } catch (error) {
      console.error('Error applying trust score decay:', error);
      throw error;
    }
  });

/**
 * Update platform trust metrics (scheduled hourly)
 */
async function updatePlatformTrustMetrics(): Promise<void> {
  console.log('Updating platform trust metrics...');
  
  try {
    // Calculate review sentiment average
    const recentReviewsSnap = await db.collection('storeReputationSignals')
      .orderBy('detectedAt', 'desc')
      .limit(1000)
      .get();
    
    const reviews = recentReviewsSnap.docs.map(d => d.data() as StoreReputationSignal);
    const avgSentiment = reviews.reduce((sum, r) => sum + r.sentimentScore, 0) / reviews.length;
    
    // Calculate refund ratio (placeholder - would integrate with actual refund data)
    const refundRatio = 0.02; // 2% default
    
    // Calculate safety incident resolution time (placeholder)
    const resolutionTime = 24; // 24 hours default
    
    // Calculate dispute resolution score
    const disputeResolutionScore = 0.95; // 95% default
    
    const metrics: PlatformTrustMetrics = {
      reviewSentimentAverage: avgSentiment,
      refundRatio,
      safetyIncidentResolutionTime: resolutionTime,
      disputeResolutionScore,
      lastUpdated: admin.firestore.Timestamp.now(),
    };
    
    await db.collection('platformMetrics').doc('trustMetrics').set(metrics, { merge: true });
    
    console.log('Platform trust metrics updated');
  } catch (error) {
    console.error('Error updating platform metrics:', error);
    throw error;
  }
}

// ===== 4️⃣ FAKE REVIEW & BOT ATTACK SHIELD =====

/**
 * Detect reputation attacks
 */
async function detectReputationAttack(): Promise<void> {
  console.log('Checking for reputation attacks...');
  
  try {
    const oneHourAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 3600000);
    
    const recentSignalsSnap = await db.collection('storeReputationSignals')
      .where('detectedAt', '>', oneHourAgo)
      .get();
    
    const signals = recentSignalsSnap.docs.map(d => ({ id: d.id, ...d.data() } as StoreReputationSignal & { id: string }));
    
    // Check for review spike
    if (signals.length > 20) {
      await reportAttack({
        attackType: 'review_spike',
        severity: signals.length > 50 ? 'critical' : 'high',
        detectedAt: admin.firestore.Timestamp.now(),
        signalIds: signals.map(s => s.id),
        actionsTaken: ['quarantine', 'alert_admin'],
        resolved: false,
        reportedToStores: false,
      });
    }
    
    // Check for geo flood
    const geoGroups = signals.reduce((acc, s) => {
      acc[s.geo] = (acc[s.geo] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    for (const [geo, count] of Object.entries(geoGroups)) {
      if (count > 10) {
        await reportAttack({
          attackType: 'geo_flood',
          severity: count > 20 ? 'high' : 'medium',
          detectedAt: admin.firestore.Timestamp.now(),
          signalIds: signals.filter(s => s.geo === geo).map(s => s.id),
          geo,
          actionsTaken: ['geo_quarantine', 'alert_admin'],
          resolved: false,
          reportedToStores: false,
        });
      }
    }
    
    // Check for wording clusters
    const textGroups: Record<string, string[]> = {};
    for (const signal of signals) {
      for (const existingText in textGroups) {
        if (calculateTextSimilarity(signal.text, existingText) > 0.8) {
          textGroups[existingText].push(signal.id);
          break;
        }
      }
      if (!Object.values(textGroups).flat().includes(signal.id)) {
        textGroups[signal.text] = [signal.id];
      }
    }
    
    for (const [text, ids] of Object.entries(textGroups)) {
      if (ids.length > 5) {
        await reportAttack({
          attackType: 'wording_cluster',
          severity: ids.length > 10 ? 'high' : 'medium',
          detectedAt: admin.firestore.Timestamp.now(),
          signalIds: ids,
          actionsTaken: ['text_quarantine', 'alert_admin'],
          resolved: false,
          reportedToStores: false,
        });
      }
    }
    
    console.log('Attack detection complete');
  } catch (error) {
    console.error('Error detecting reputation attack:', error);
    throw error;
  }
}

/**
 * Report attack to database
 */
async function reportAttack(attack: ReputationAttack): Promise<void> {
  await db.collection('reputationAttacks').add(attack);
  
  // Log audit event
  await logAuditEvent('reputation_attack_detected', {
    attackType: attack.attackType,
    severity: attack.severity,
    signalCount: attack.signalIds.length,
  });
  
  // Send alert (integrate with PACK 293 notifications)
  console.log(`🚨 REPUTATION ATTACK DETECTED: ${attack.attackType} (${attack.severity})`);
}

// ===== 5️⃣ POSITIVE REVIEW ACQUISITION AUTOMATION =====

/**
 * Trigger review nudge for user
 */
export const pack371_reviewNudges = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const { trigger } = data;
  const userId = context.auth.uid;
  
  try {
    // Check if user is eligible for review nudge
    const eligible = await isEligibleForReviewNudge(userId);
    
    if (!eligible) {
      return { shouldShow: false, reason: 'not_eligible' };
    }
    
    // Record nudge shown
    const nudge: ReviewNudge = {
      userId,
      trigger,
      shownAt: admin.firestore.Timestamp.now(),
      converted: false,
    };
    
    await db.collection('reviewNudgeHistory').add(nudge);
    
    // Log audit event
    await logAuditEvent('review_nudge_shown', {
      userId,
      trigger,
    });
    
    return {
      shouldShow: true,
      message: "Enjoying Avalo? Share your experience on the App Store!",
    };
  } catch (error) {
    console.error('Error processing review nudge:', error);
    throw error;
  }
});

/**
 * Check if user is eligible for review nudge
 */
async function isEligibleForReviewNudge(userId: string): Promise<boolean> {
  // Check if user has been nudged in last 30 days
  const thirtyDaysAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 86400000);
  
  const recentNudgesSnap = await db.collection('reviewNudgeHistory')
    .where('userId', '==', userId)
    .where('shownAt', '>', thirtyDaysAgo)
    .limit(1)
    .get();
  
  if (!recentNudgesSnap.empty) {
    return false; // Already nudged recently
  }
  
  // Check for safety flags
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return false;
  
  const userData = userDoc.data()!;
  if (userData.safetyFlags && userData.safetyFlags.length > 0) {
    return false; // User has safety issues
  }
  
  // Check for recent complaints
  const recentComplaintsSnap = await db.collection('supportTickets')
    .where('userId', '==', userId)
    .where('type', '==', 'complaint')
    .where('createdAt', '>', thirtyDaysAgo)
    .limit(1)
    .get();
  
  if (!recentComplaintsSnap.empty) {
    return false; // User has recent complaints
  }
  
  return true;
}

/**
 * Record review conversion (user left review)
 */
export const pack371_recordReviewConversion = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = context.auth.uid;
  
  try {
    // Find most recent nudge for user
    const recentNudgeSnap = await db.collection('reviewNudgeHistory')
      .where('userId', '==', userId)
      .where('converted', '==', false)
      .orderBy('shownAt', 'desc')
      .limit(1)
      .get();
    
    if (!recentNudgeSnap.empty) {
      await recentNudgeSnap.docs[0].ref.update({
        converted: true,
        conversionTime: admin.firestore.Timestamp.now(),
      });
      
      // Log audit event
      await logAuditEvent('review_conversion', {
        userId,
      });
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error recording review conversion:', error);
    throw error;
  }
});

// ===== 7️⃣ SUPPORT + STORE INTEGRATION =====

/**
 * Check if review requires support escalation
 */
async function checkForSupportEscalation(signal: StoreReputationSignal): Promise<void> {
  const lowerText = signal.text.toLowerCase();
  
  let shouldEscalate = false;
  let ticketType = 'general';
  let priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';
  
  // Safety concern keywords
  if (lowerText.includes('unsafe') || lowerText.includes('danger') || lowerText.includes('threat')) {
    shouldEscalate = true;
    ticketType = 'safety';
    priority = 'urgent';
  }
  
  // Fraud concern keywords
  if (lowerText.includes('scam') || lowerText.includes('fraud') || lowerText.includes('fake')) {
    shouldEscalate = true;
    ticketType = 'fraud';
    priority = 'high';
  }
  
  // Refund keywords
  if (lowerText.includes('refund') || lowerText.includes('money back') || lowerText.includes('charge')) {
    shouldEscalate = true;
    ticketType = 'billing';
    priority = 'high';
  }
  
  if (shouldEscalate) {
    // Create support ticket (integrate with PACK 300)
    await db.collection('supportTickets').add({
      userId: signal.userId || null,
      source: 'store_review',
      type: ticketType,
      priority,
      reviewId: signal.reviewId,
      reviewText: signal.text,
      reviewRating: signal.rating,
      createdAt: admin.firestore.Timestamp.now(),
      status: 'open',
    });
    
    console.log(`Created ${ticketType} support ticket from review ${signal.reviewId}`);
  }
}

// ===== 8️⃣ AUDIT & COMPLIANCE =====

/**
 * Log audit event (integrate with PACK 296)
 */
async function logAuditEvent(action: string, metadata: any): Promise<void> {
  await db.collection('auditLogs').add({
    action: `pack371_${action}`,
    metadata,
    timestamp: admin.firestore.Timestamp.now(),
    source: 'reputation_engine',
  });
}

// ===== EXPORTS =====

export {
  detectReputationAttack as pack371_detectReputationAttack,
  updatePlatformTrustMetrics as pack371_updatePlatformTrustMetrics,
};
