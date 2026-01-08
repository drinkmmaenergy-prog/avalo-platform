/**
 * PACK 384 — Trust Score & Public Reputation Index
 * Computes and maintains user trustworthiness scores for platform safety
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

interface TrustScoreFactors {
  accountAge: number; // days
  verificationTier: number; // 0-3
  payoutHistory: number; // successful payouts
  fraudFlags: number;
  abuseReports: number;
  successfulMeetings: number;
  positiveReviews: number;
  negativeReviews: number;
  responseRate: number; // 0-100
  cancellationRate: number; // 0-100
  disputeRate: number; // 0-100
  completionRate: number; // 0-100
}

interface PublicTrustScore {
  userId: string;
  score: number; // 0-1000
  tier: 'untrusted' | 'new' | 'bronze' | 'silver' | 'gold' | 'platinum';
  factors: TrustScoreFactors;
  lastComputed: admin.firestore.Timestamp;
  usedInRanking: boolean;
  visibleToPublic: boolean;
}

/**
 * Compute public trust score for a user
 */
export const computePublicTrustScore = functions.https.onCall(async (data, context) => {
  const targetUserId = data.userId || context.auth?.uid;
  
  if (!targetUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'User ID required');
  }

  // Admin can compute for anyone, users can only compute for themselves
  if (context.auth?.uid !== targetUserId && !context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Not authorized');
  }

  try {
    const userDoc = await db.collection('users').doc(targetUserId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data()!;
    const accountCreated = userData.createdAt?.toDate() || new Date();
    const accountAge = Math.floor((Date.now() - accountCreated.getTime()) / (1000 * 60 * 60 * 24));

    // Gather trust factors
    const factors: TrustScoreFactors = {
      accountAge,
      verificationTier: userData.verificationTier || 0,
      payoutHistory: 0,
      fraudFlags: 0,
      abuseReports: 0,
      successfulMeetings: 0,
      positiveReviews: 0,
      negativeReviews: 0,
      responseRate: 0,
      cancellationRate: 0,
      disputeRate: 0,
      completionRate: 0
    };

    // Get payout history
    const payoutsSnapshot = await db.collection('payouts')
      .where('userId', '==', targetUserId)
      .where('status', '==', 'completed')
      .get();
    factors.payoutHistory = payoutsSnapshot.size;

    // Get fraud flags
    const fraudSnapshot = await db.collection('fraudAlerts')
      .where('userId', '==', targetUserId)
      .where('status', '==', 'confirmed')
      .get();
    factors.fraudFlags = fraudSnapshot.size;

    // Get abuse reports
    const abuseSnapshot = await db.collection('abuseReports')
      .where('reportedUserId', '==', targetUserId)
      .where('status', 'in', ['confirmed', 'under_review'])
      .get();
    factors.abuseReports = abuseSnapshot.size;

    // Get successful meetings
    const meetingsSnapshot = await db.collection('meetings')
      .where('participants', 'array-contains', targetUserId)
      .where('status', '==', 'completed')
      .get();
    factors.successfulMeetings = meetingsSnapshot.size;

    // Get reviews
    const reviewsSnapshot = await db.collection('userReviews')
      .where('reviewedUserId', '==', targetUserId)
      .get();
    
    let totalRating = 0;
    reviewsSnapshot.forEach(doc => {
      const rating = doc.data().rating || 0;
      totalRating += rating;
      if (rating >= 4) factors.positiveReviews++;
      if (rating <= 2) factors.negativeReviews++;
    });

    // Calculate engagement metrics
    const totalMeetingsSnapshot = await db.collection('meetings')
      .where('participants', 'array-contains', targetUserId)
      .get();
    
    const totalMeetings = totalMeetingsSnapshot.size;
    const completedMeetings = factors.successfulMeetings;
    const cancelledMeetings = totalMeetingsSnapshot.docs.filter(d => d.data().status === 'cancelled').length;

    factors.completionRate = totalMeetings > 0 ? (completedMeetings / totalMeetings) * 100 : 0;
    factors.cancellationRate = totalMeetings > 0 ? (cancelledMeetings / totalMeetings) * 100 : 0;

    // Get disputes
    const disputesSnapshot = await db.collection('disputes')
      .where('userId', '==', targetUserId)
      .get();
    factors.disputeRate = totalMeetings > 0 ? (disputesSnapshot.size / totalMeetings) * 100 : 0;

    // Calculate response rate (from chat data)
    const responseSnapshot = await db.collection('userStats')
      .doc(targetUserId)
      .get();
    if (responseSnapshot.exists) {
      factors.responseRate = responseSnapshot.data()?.responseRate || 0;
    }

    // Compute trust score (0-1000 scale)
    let score = 500; // Start at neutral

    // Account age factor (up to +100)
    score += Math.min(accountAge / 365, 1) * 100;

    // Verification tier (up to +150)
    score += factors.verificationTier * 50;

    // Payout history (up to +100)
    score += Math.min(factors.payoutHistory / 10, 1) * 100;

    // Successful meetings (up to +100)
    score += Math.min(factors.successfulMeetings / 20, 1) * 100;

    // Positive reviews (up to +100)
    score += Math.min(factors.positiveReviews / 10, 1) * 100;

    // Completion rate (up to +50)
    score += (factors.completionRate / 100) * 50;

    // Response rate (up to +50)
    score += (factors.responseRate / 100) * 50;

    // Negative factors
    // Fraud flags (severe penalty)
    score -= factors.fraudFlags * 200;

    // Abuse reports
    score -= factors.abuseReports * 100;

    // Negative reviews
    score -= factors.negativeReviews * 30;

    // High cancellation rate
    score -= factors.cancellationRate * 2;

    // High dispute rate
    score -= factors.disputeRate * 3;

    // Clamp to 0-1000
    score = Math.max(0, Math.min(1000, score));

    // Determine tier
    let tier: PublicTrustScore['tier'] = 'new';
    if (score < 300) tier = 'untrusted';
    else if (score < 500) tier = 'new';
    else if (score < 650) tier = 'bronze';
    else if (score < 800) tier = 'silver';
    else if (score < 900) tier = 'gold';
    else tier = 'platinum';

    const trustScore: PublicTrustScore = {
      userId: targetUserId,
      score: Math.round(score),
      tier,
      factors,
      lastComputed: admin.firestore.Timestamp.now(),
      usedInRanking: true,
      visibleToPublic: true
    };

    // Store the trust score
    await db.collection('publicTrustScores').doc(targetUserId).set(trustScore);

    // Update user document with trust tier
    await db.collection('users').doc(targetUserId).update({
      trustTier: tier,
      trustScore: Math.round(score),
      trustLastUpdated: admin.firestore.Timestamp.now()
    });

    return trustScore;
  } catch (error) {
    console.error('Error computing trust score:', error);
    throw new functions.https.HttpsError('internal', 'Failed to compute trust score');
  }
});

/**
 * Batch recompute trust scores for all users
 */
export const batchRecomputeTrustScores = functions.pubsub.schedule('every 24 hours').onRun(async () => {
  try {
    const usersSnapshot = await db.collection('users')
      .where('active', '==', true)
      .limit(1000)
      .get();

    let processed = 0;
    let errors = 0;

    for (const userDoc of usersSnapshot.docs) {
      try {
        // Call compute function for each user
        await computePublicTrustScore.run({ data: { userId: userDoc.id } } as any);
        processed++;
      } catch (error) {
        console.error(`Error computing trust score for user ${userDoc.id}:`, error);
        errors++;
      }
    }

    console.log(`Trust score batch complete: ${processed} processed, ${errors} errors`);
  } catch (error) {
    console.error('Error in batch trust score computation:', error);
  }
});

/**
 * Get trust score for display
 */
export const getPublicTrustScore = functions.https.onCall(async (data, context) => {
  const targetUserId = data.userId;
  
  if (!targetUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'User ID required');
  }

  try {
    const trustDoc = await db.collection('publicTrustScores').doc(targetUserId).get();
    
    if (!trustDoc.exists) {
      // Compute if not exists
      const result = await computePublicTrustScore.run({ 
        data: { userId: targetUserId },
        auth: context.auth as any
      } as any);
      return result;
    }

    const trustData = trustDoc.data() as PublicTrustScore;

    // Check if stale (> 7 days old)
    const daysSinceComputed = (Date.now() - trustData.lastComputed.toMillis()) / (1000 * 60 * 60 * 24);
    if (daysSinceComputed > 7) {
      // Recompute in background
      computePublicTrustScore.run({ 
        data: { userId: targetUserId },
        auth: context.auth as any
      } as any).catch(err => console.error('Background trust score update failed:', err));
    }

    return trustData;
  } catch (error) {
    console.error('Error getting trust score:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get trust score');
  }
});

/**
 * Apply trust score to user rankings
 */
export const applyTrustScoreToRankings = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const category = data.category || 'all'; // 'discovery', 'calendar', 'ai_companions'

  try {
    const trustScoresSnapshot = await db.collection('publicTrustScores')
      .where('usedInRanking', '==', true)
      .get();

    const trustScores = new Map<string, number>();
    trustScoresSnapshot.forEach(doc => {
      const data = doc.data();
      trustScores.set(doc.id, data.score);
    });

    // Apply to discovery rankings
    if (category === 'all' || category === 'discovery') {
      const discoverSnapshot = await db.collection('userProfiles')
        .where('discoverable', '==', true)
        .limit(1000)
        .get();

      for (const userDoc of discoverSnapshot.docs) {
        const userId = userDoc.id;
        const trustScore = trustScores.get(userId) || 500;
        
        await db.collection('userProfiles').doc(userId).update({
          trustScore,
          rankingWeight: admin.firestore.FieldValue.increment(trustScore / 1000)
        });
      }
    }

    // Apply to calendar bookings
    if (category === 'all' || category === 'calendar') {
      const calendarSnapshot = await db.collection('calendarAvailability')
        .where('active', '==', true)
        .limit(1000)
        .get();

      for (const calDoc of calendarSnapshot.docs) {
        const userId = calDoc.data().userId;
        const trustScore = trustScores.get(userId) || 500;
        
        await db.collection('calendarAvailability').doc(calDoc.id).update({
          priorityScore: trustScore
        });
      }
    }

    return {
      success: true,
      category,
      usersProcessed: trustScores.size
    };
  } catch (error) {
    console.error('Error applying trust scores to rankings:', error);
    throw new functions.https.HttpsError('internal', 'Failed to apply trust scores');
  }
});

/**
 * Flag user with low trust score
 */
export const flagLowTrustUser = functions.firestore
  .document('publicTrustScores/{userId}')
  .onWrite(async (change, context) => {
    const userId = context.params.userId;
    
    if (!change.after.exists) return;
    
    const trustData = change.after.data() as PublicTrustScore;
    
    // Flag if trust score drops below threshold
    if (trustData.score < 300) {
      await db.collection('moderationQueue').add({
        type: 'low_trust_score',
        userId,
        trustScore: trustData.score,
        tier: trustData.tier,
        reasons: [
          trustData.factors.fraudFlags > 0 ? 'fraud_flags' : null,
          trustData.factors.abuseReports > 0 ? 'abuse_reports' : null,
          trustData.factors.negativeReviews > 5 ? 'negative_reviews' : null,
          trustData.factors.accountAge < 7 ? 'new_account' : null
        ].filter(Boolean),
        timestamp: admin.firestore.Timestamp.now(),
        status: 'pending',
        priority: trustData.score < 200 ? 'high' : 'medium'
      });
    }
  });
