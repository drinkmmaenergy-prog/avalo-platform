/**
 * PACK 436 — Review Boost Engine
 * 
 * Generates positive review momentum automatically while remaining
 * fully compliant with Apple and Google policies.
 * 
 * IMPORTANT: Apple forbids review incentives. Incentives are NOT tied
 * to review submission — only to performance metrics in-app.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface ReviewNudgeTrigger {
  userId: string;
  trigger: 'date_success' | 'monetization' | 'event_attendance' | 'onboarding' | 'match_unlock';
  score: number; // 0-100 emotional readiness score
  timestamp: number;
  shouldNudge: boolean;
  reason?: string;
}

interface CreatorIncentive {
  creatorId: string;
  performanceScore: number;
  visibilityBoost: boolean;
  revenueSplitBoost: number; // 0-3% additional
  prioritySupport: boolean;
  period: string; // '24h'
  appliedAt: number;
}

interface UserNudgeHistory {
  userId: string;
  lastNudge: number;
  totalNudges: number;
  responded: boolean;
  ratings: Array<{
    platform: string;
    rating: number;
    date: number;
  }>;
}

// ============================================================================
// POSITIVE REVIEW NUDGES
// ============================================================================

/**
 * Evaluate if user is ready for a review nudge
 * Only triggers at good emotional moments
 */
export const evaluateReviewNudge = functions.firestore
  .document('userActions/{actionId}')
  .onCreate(async (snap, context) => {
    const action = snap.data();
    const userId = action.userId;
    
    if (!userId) return null;
    
    const db = admin.firestore();
    
    // Check nudge history - don't spam users
    const historyDoc = await db.collection('reviewNudgeHistory').doc(userId).get();
    const history = historyDoc.data() as UserNudgeHistory | undefined;
    
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    // Don't nudge if:
    // - Nudged in last 24 hours
    // - Already left a rating
    // - Nudged more than 3 times in last week
    if (history) {
      if (history.lastNudge > oneDayAgo) return null;
      if (history.responded) return null;
      
      const recentNudges = history.totalNudges || 0;
      if (recentNudges >= 3 && history.lastNudge > oneWeekAgo) return null;
    }
    
    // Evaluate triggers
    const trigger = await evaluateTriggerConditions(userId, action);
    
    if (trigger.shouldNudge) {
      await sendReviewNudge(trigger);
      
      // Update history
      await db.collection('reviewNudgeHistory').doc(userId).set({
        userId,
        lastNudge: now,
        totalNudges: (history?.totalNudges || 0) + 1,
        responded: false,
        ratings: history?.ratings || [],
      }, { merge: true });
    }
    
    return trigger;
  });

async function evaluateTriggerConditions(
  userId: string,
  action: any
): Promise<ReviewNudgeTrigger> {
  const db = admin.firestore();
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  if (!userData) {
    return {
      userId,
      trigger: 'onboarding',
      score: 0,
      timestamp: Date.now(),
      shouldNudge: false,
      reason: 'User not found',
    };
  }
  
  let score = 0;
  let trigger: ReviewNudgeTrigger['trigger'] = 'onboarding';
  let shouldNudge = false;
  
  // 1. Successful date completion
  if (action.type === 'date_completed' && action.success === true) {
    score = 85;
    trigger = 'date_success';
    shouldNudge = true;
  }
  
  // 2. User monetized and earned >= 100 tokens
  else if (action.type === 'tokens_earned' && action.amount >= 100) {
    score = 80;
    trigger = 'monetization';
    shouldNudge = true;
  }
  
  // 3. Event attendance
  else if (action.type === 'event_attended') {
    score = 75;
    trigger = 'event_attendance';
    shouldNudge = true;
  }
  
  // 4. Completed onboarding
  else if (action.type === 'onboarding_completed') {
    score = 60;
    trigger = 'onboarding';
    // Only nudge if user completed onboarding smoothly
    shouldNudge = userData.onboardingScore > 80;
  }
  
  // 5. Unlocked matches or conversations
  else if (action.type === 'match_unlocked' || action.type === 'conversation_started') {
    score = 70;
    trigger = 'match_unlock';
    shouldNudge = true;
  }
  
  // 6. High retention score (PACK 301)
  else if (action.type === 'retention_milestone') {
    const retentionDoc = await db.collection('retentionScores').doc(userId).get();
    const retention = retentionDoc.data();
    
    if (retention && retention.score > 70) {
      score = 75;
      trigger = 'onboarding';
      shouldNudge = true;
    }
  }
  
  return {
    userId,
    trigger,
    score,
    timestamp: Date.now(),
    shouldNudge,
  };
}

async function sendReviewNudge(trigger: ReviewNudgeTrigger) {
  const db = admin.firestore();
  
  // Store nudge for mobile app to display
  await db.collection('reviewNudges').doc(trigger.userId).set({
    type: 'review_request',
    trigger: trigger.trigger,
    score: trigger.score,
    message: getReviewNudgeMessage(trigger.trigger),
    createdAt: Date.now(),
    displayed: false,
    responded: false,
  });
  
  // Send push notification
  const userDoc = await db.collection('users').doc(trigger.userId).get();
  const userData = userDoc.data();
  
  if (userData?.pushToken) {
    await admin.messaging().send({
      token: userData.pushToken,
      notification: {
        title: '❤️ Support Avalo',
        body: getReviewNudgeMessage(trigger.trigger),
      },
      data: {
        type: 'review_nudge',
        trigger: trigger.trigger,
      },
    });
  }
}

function getReviewNudgeMessage(trigger: ReviewNudgeTrigger['trigger']): string {
  const messages = {
    date_success: 'Had a great experience? Help others discover Avalo! ❤️',
    monetization: 'You\'re earning on Avalo! Support us with a rating ⭐',
    event_attendance: 'Enjoyed the event? Your feedback helps us grow! 🎉',
    onboarding: 'Welcome to Avalo! Would you like to support us with a rating? ❤️',
    match_unlock: 'Making connections! Share your experience with a rating 💫',
  };
  
  return messages[trigger] || 'Would you like to support Avalo with a rating? ❤️ Your feedback helps us grow!';
}

// ============================================================================
// CREATOR INCENTIVE SYSTEM
// ============================================================================

/**
 * Reward high-performing creators (NOT for reviews - for performance metrics)
 * Fully Apple/Google compliant
 */
export const evaluateCreatorIncentives = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async () => {
    const db = admin.firestore();
    
    // Fetch creators
    const creators = await db.collection('users')
      .where('isCreator', '==', true)
      .get();
    
    const incentives: CreatorIncentive[] = [];
    
    for (const creatorDoc of creators.docs) {
      const creatorId = creatorDoc.id;
      const performanceScore = await calculateCreatorPerformanceScore(creatorId);
      
      // High-performing creators get incentives
      if (performanceScore >= 80) {
        const incentive: CreatorIncentive = {
          creatorId,
          performanceScore,
          visibilityBoost: true,
          revenueSplitBoost: Math.min(3, Math.floor((performanceScore - 80) / 5)), // 0-3%
          prioritySupport: true,
          period: '24h',
          appliedAt: Date.now(),
        };
        
        incentives.push(incentive);
        
        // Apply incentive
        await applyCreatorIncentive(incentive);
      }
    }
    
    return { incentivesApplied: incentives.length };
  });

async function calculateCreatorPerformanceScore(creatorId: string): Promise<number> {
  const db = admin.firestore();
  
  // Fetch performance metrics
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
  
  // Revenue metrics (30 points)
  const revenueDoc = await db.collection('creatorRevenue').doc(creatorId).get();
  const revenue = revenueDoc.data();
  const revenueScore = revenue ? Math.min(30, (revenue.last7Days / 1000) * 30) : 0;
  
  // Engagement metrics (30 points)
  const engagementDoc = await db.collection('creatorEngagement').doc(creatorId).get();
  const engagement = engagementDoc.data();
  const engagementScore = engagement ? Math.min(30, (engagement.averageRating / 5) * 30) : 0;
  
  // Event metrics (20 points)
  const events = await db.collection('events')
    .where('creatorId', '==', creatorId)
    .where('startTime', '>', oneWeekAgo)
    .get();
  const eventScore = Math.min(20, events.size * 5);
  
  // Retention metrics (20 points)
  const retentionDoc = await db.collection('creatorRetention').doc(creatorId).get();
  const retention = retentionDoc.data();
  const retentionScore = retention ? Math.min(20, (retention.rate / 100) * 20) : 0;
  
  return revenueScore + engagementScore + eventScore + retentionScore;
}

async function applyCreatorIncentive(incentive: CreatorIncentive) {
  const db = admin.firestore();
  
  // Store incentive
  await db.collection('creatorIncentives').add(incentive);
  
  // Apply visibility boost
  if (incentive.visibilityBoost) {
    await db.collection('users').doc(incentive.creatorId).update({
      visibilityBoost: true,
      visibilityBoostExpires: Date.now() + (24 * 60 * 60 * 1000),
    });
  }
  
  // Apply revenue split boost
  if (incentive.revenueSplitBoost > 0) {
    await db.collection('users').doc(incentive.creatorId).update({
      revenueSplitBonus: incentive.revenueSplitBoost,
      revenueSplitBonusExpires: Date.now() + (24 * 60 * 60 * 1000),
    });
  }
  
  // Apply priority support flag
  if (incentive.prioritySupport) {
    await db.collection('users').doc(incentive.creatorId).update({
      prioritySupport: true,
      prioritySupportExpires: Date.now() + (24 * 60 * 60 * 1000),
    });
  }
  
  // Notify creator
  const creatorDoc = await db.collection('users').doc(incentive.creatorId).get();
  const creator = creatorDoc.data();
  
  if (creator?.pushToken) {
    await admin.messaging().send({
      token: creator.pushToken,
      notification: {
        title: '🌟 Performance Bonus!',
        body: `You're crushing it! +${incentive.revenueSplitBoost}% revenue boost for 24h`,
      },
      data: {
        type: 'creator_incentive',
        boost: incentive.revenueSplitBoost.toString(),
      },
    });
  }
}

// ============================================================================
// REVIEW RESPONSE TRACKING
// ============================================================================

/**
 * Track when users respond to review nudges
 */
export const trackReviewResponse = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { platform, rating, responded } = data;
  
  const db = admin.firestore();
  
  // Update nudge history
  const historyDoc = await db.collection('reviewNudgeHistory').doc(userId).get();
  const history = historyDoc.data() as UserNudgeHistory | undefined;
  
  await db.collection('reviewNudgeHistory').doc(userId).set({
    userId,
    lastNudge: history?.lastNudge || Date.now(),
    totalNudges: history?.totalNudges || 0,
    responded: true,
    ratings: [
      ...(history?.ratings || []),
      {
        platform,
        rating,
        date: Date.now(),
      },
    ],
  }, { merge: true });
  
  // Mark nudge as responded
  await db.collection('reviewNudges').doc(userId).update({
    responded: true,
    respondedAt: Date.now(),
    rating,
    platform,
  });
  
  // Track in analytics
  await db.collection('analytics').doc('reviewNudges').set({
    totalResponses: admin.firestore.FieldValue.increment(1),
    totalRatings: admin.firestore.FieldValue.increment(rating),
    lastUpdated: Date.now(),
  }, { merge: true });
  
  return { success: true };
});

/**
 * Clear expired incentives
 */
export const cleanupExpiredIncentives = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    const db = admin.firestore();
    const now = Date.now();
    
    // Remove expired visibility boosts
    const expiredBoosts = await db.collection('users')
      .where('visibilityBoostExpires', '<', now)
      .get();
    
    const batch = db.batch();
    expiredBoosts.docs.forEach(doc => {
      batch.update(doc.ref, {
        visibilityBoost: false,
        visibilityBoostExpires: admin.firestore.FieldValue.delete(),
      });
    });
    
    // Remove expired revenue boosts
    const expiredRevenue = await db.collection('users')
      .where('revenueSplitBonusExpires', '<', now)
      .get();
    
    expiredRevenue.docs.forEach(doc => {
      batch.update(doc.ref, {
        revenueSplitBonus: 0,
        revenueSplitBonusExpires: admin.firestore.FieldValue.delete(),
      });
    });
    
    // Remove expired priority support
    const expiredSupport = await db.collection('users')
      .where('prioritySupportExpires', '<', now)
      .get();
    
    expiredSupport.docs.forEach(doc => {
      batch.update(doc.ref, {
        prioritySupport: false,
        prioritySupportExpires: admin.firestore.FieldValue.delete(),
      });
    });
    
    await batch.commit();
    
    return {
      expiredBoosts: expiredBoosts.size,
      expiredRevenue: expiredRevenue.size,
      expiredSupport: expiredSupport.size,
    };
  });

// ============================================================================
// EXPORTS
// ============================================================================

export {
  ReviewNudgeTrigger,
  CreatorIncentive,
  UserNudgeHistory,
};
