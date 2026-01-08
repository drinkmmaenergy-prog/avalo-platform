/**
 * PACK 386 - Review & Store Reputation Boost Engine
 * 
 * Smart review request system that:
 * - Only prompts happy, verified users
 * - Triggers after positive experiences (chat, meeting, payout)
 * - Suppresses on support issues or fraud flags
 * - Integrates with PACK 384 (Store Defense) and PACK 301 (Retention)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface ReviewPrompt {
  promptId: string;
  userId: string;
  trigger: 'SUCCESSFUL_CHAT' | 'FIRST_MEETING' | 'FIRST_PAYOUT' | 'MILESTONE_REACHED';
  triggered: boolean;
  shown: boolean;
  completed: boolean;
  suppressedReason?: string;
  triggeredAt?: admin.firestore.Timestamp;
  shownAt?: admin.firestore.Timestamp;
  completedAt?: admin.firestore.Timestamp;
  createdAt: admin.firestore.Timestamp;
}

interface ReviewEligibility {
  eligible: boolean;
  reason?: string;
  churnRisk?: number;
  hasSupportIssue?: boolean;
  hasFraudFlag?: boolean;
}

// ============================================================================
// TRIGGER SMART REVIEW PROMPT
// ============================================================================

export const pack386_triggerSmartReviewPrompt = functions.https.onCall(
  async (data: {
    userId: string;
    trigger: 'SUCCESSFUL_CHAT' | 'FIRST_MEETING' | 'FIRST_PAYOUT' | 'MILESTONE_REACHED';
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const callerId = context.auth.uid;

    // Verify caller is user or admin
    if (callerId !== data.userId) {
      const userDoc = await db.collection('users').doc(callerId).get();
      if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Permission denied');
      }
    }

    // Check eligibility
    const eligibility = await checkReviewEligibility(data.userId);

    if (!eligibility.eligible) {
      return {
        success: false,
        eligible: false,
        reason: eligibility.reason,
      };
    }

    // Check if already prompted for this trigger
    const existingPrompt = await db.collection('reviewPrompts')
      .where('userId', '==', data.userId)
      .where('trigger', '==', data.trigger)
      .limit(1)
      .get();

    if (!existingPrompt.empty) {
      return {
        success: false,
        eligible: false,
        reason: 'ALREADY_PROMPTED',
      };
    }

    // Create review prompt
    const promptRef = db.collection('reviewPrompts').doc();
    const prompt: ReviewPrompt = {
      promptId: promptRef.id,
      userId: data.userId,
      trigger: data.trigger,
      triggered: true,
      shown: false,
      completed: false,
      triggeredAt: admin.firestore.Timestamp.now(),
      createdAt: admin.firestore.Timestamp.now(),
    };

    await promptRef.set(prompt);

    // Log to analytics
    await db.collection('analyticsEvents').add({
      eventType: 'REVIEW_PROMPT_TRIGGERED',
      userId: data.userId,
      trigger: data.trigger,
      timestamp: admin.firestore.Timestamp.now(),
    });

    return {
      success: true,
      eligible: true,
      promptId: promptRef.id,
    };
  }
);

// ============================================================================
// CHECK REVIEW ELIGIBILITY
// ============================================================================

async function checkReviewEligibility(userId: string): Promise<ReviewEligibility> {
  // 1. Check user exists and is verified
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    return { eligible: false, reason: 'USER_NOT_FOUND' };
  }

  const userData = userDoc.data();
  if (!userData?.verified) {
    return { eligible: false, reason: 'USER_NOT_VERIFIED' };
  }

  // 2. Check for unresolved support tickets (PACK 300)
  const supportSnapshot = await db.collection('supportTickets')
    .where('userId', '==', userId)
    .where('status', '==', 'OPEN')
    .limit(1)
    .get();

  if (!supportSnapshot.empty) {
    return { 
      eligible: false, 
      reason: 'UNRESOLVED_SUPPORT_TICKET',
      hasSupportIssue: true,
    };
  }

  // 3. Check fraud flag (PACK 302)
  const fraudDoc = await db.collection('fraudDetectionProfiles').doc(userId).get();
  if (fraudDoc.exists) {
    const fraudData = fraudDoc.data();
    if (fraudData?.riskScore >= 0.7) {
      return {
        eligible: false,
        reason: 'FRAUD_FLAG',
        hasFraudFlag: true,
      };
    }
  }

  // 4. Check churn risk (PACK 301)
  const churnDoc = await db.collection('churnPredictionProfiles').doc(userId).get();
  if (churnDoc.exists) {
    const churnData = churnDoc.data();
    if (churnData?.churnRisk >= 0.7) {
      return {
        eligible: false,
        reason: 'HIGH_CHURN_RISK',
        churnRisk: churnData.churnRisk,
      };
    }
  }

  // 5. Check if user has been banned or restricted
  if (userData?.status === 'BANNED' || userData?.status === 'SUSPENDED') {
    return { eligible: false, reason: 'USER_RESTRICTED' };
  }

  // 6. Check minimum activity threshold
  const activityScore = userData?.activityScore || 0;
  if (activityScore < 50) {
    return { eligible: false, reason: 'INSUFFICIENT_ACTIVITY' };
  }

  // All checks passed
  return { eligible: true };
}

// ============================================================================
// MARK REVIEW PROMPT AS SHOWN
// ============================================================================

export const pack386_markReviewShown = functions.https.onCall(
  async (data: { promptId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    if (!data.promptId) {
      throw new functions.https.HttpsError('invalid-argument', 'Prompt ID required');
    }

    const promptRef = db.collection('reviewPrompts').doc(data.promptId);
    const promptDoc = await promptRef.get();

    if (!promptDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Prompt not found');
    }

    const prompt = promptDoc.data();
    if (prompt?.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Not your prompt');
    }

    await promptRef.update({
      shown: true,
      shownAt: admin.firestore.Timestamp.now(),
    });

    // Log to analytics
    await db.collection('analyticsEvents').add({
      eventType: 'REVIEW_PROMPT_SHOWN',
      userId,
      promptId: data.promptId,
      trigger: prompt?.trigger,
      timestamp: admin.firestore.Timestamp.now(),
    });

    return { success: true };
  }
);

// ============================================================================
// MARK REVIEW PROMPT AS COMPLETED
// ============================================================================

export const pack386_markReviewCompleted = functions.https.onCall(
  async (data: { promptId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    if (!data.promptId) {
      throw new functions.https.HttpsError('invalid-argument', 'Prompt ID required');
    }

    const promptRef = db.collection('reviewPrompts').doc(data.promptId);
    const promptDoc = await promptRef.get();

    if (!promptDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Prompt not found');
    }

    const prompt = promptDoc.data();
    if (prompt?.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Not your prompt');
    }

    await promptRef.update({
      completed: true,
      completedAt: admin.firestore.Timestamp.now(),
    });

    // Update user profile
    await db.collection('users').doc(userId).update({
      hasLeftReview: true,
      lastReviewAt: admin.firestore.Timestamp.now(),
    });

    // Log to analytics
    await db.collection('analyticsEvents').add({
      eventType: 'REVIEW_COMPLETED',
      userId,
      promptId: data.promptId,
      trigger: prompt?.trigger,
      timestamp: admin.firestore.Timestamp.now(),
    });

    // Integrate with PACK 384 (Store Defense)
    await db.collection('storeReviewEvents').add({
      userId,
      trigger: prompt?.trigger,
      timestamp: admin.firestore.Timestamp.now(),
    });

    return { success: true };
  }
);

// ============================================================================
// AUTO-TRIGGER ON SUCCESSFUL CHAT (TRIGGERED)
// ============================================================================

export const pack386_autoTriggerOnChat = functions.firestore
  .document('chats/{chatId}/messages/{messageId}')
  .onCreate(async (snap) => {
    const message = snap.data();
    const chatId = snap.ref.parent.parent?.id;

    if (!chatId) return;

    // Get chat document
    const chatDoc = await db.collection('chats').doc(chatId).get();
    if (!chatDoc.exists) return;

    const chatData = chatDoc.data();
    const messageCount = chatData?.messageCount || 0;

    // Trigger after 10 messages
    if (messageCount === 10) {
      const participants = chatData?.participants || [];
      for (const userId of participants) {
        // Check if this would be their first prompt
        const existingPrompts = await db.collection('reviewPrompts')
          .where('userId', '==', userId)
          .limit(1)
          .get();

        if (existingPrompts.empty) {
          // Trigger review prompt
          const eligibility = await checkReviewEligibility(userId);
          if (eligibility.eligible) {
            const promptRef = db.collection('reviewPrompts').doc();
            await promptRef.set({
              promptId: promptRef.id,
              userId,
              trigger: 'SUCCESSFUL_CHAT',
              triggered: true,
              shown: false,
              completed: false,
              triggeredAt: admin.firestore.Timestamp.now(),
              createdAt: admin.firestore.Timestamp.now(),
            });
          }
        }
      }
    }
  });

// ============================================================================
// AUTO-TRIGGER ON FIRST MEETING (TRIGGERED)
// ============================================================================

export const pack386_autoTriggerOnMeeting = functions.firestore
  .document('calls/{callId}')
  .onCreate(async (snap) => {
    const call = snap.data();
    const participants = call.participants || [];

    for (const userId of participants) {
      // Check if this is their first call
      const previousCalls = await db.collection('calls')
        .where('participants', 'array-contains', userId)
        .limit(2)
        .get();

      if (previousCalls.size === 1) {
        // This is their first call
        const eligibility = await checkReviewEligibility(userId);
        if (eligibility.eligible) {
          const promptRef = db.collection('reviewPrompts').doc();
          await promptRef.set({
            promptId: promptRef.id,
            userId,
            trigger: 'FIRST_MEETING',
            triggered: true,
            shown: false,
            completed: false,
            triggeredAt: admin.firestore.Timestamp.now(),
            createdAt: admin.firestore.Timestamp.now(),
          });
        }
      }
    }
  });

// ============================================================================
// AUTO-TRIGGER ON FIRST PAYOUT (TRIGGERED)
// ============================================================================

export const pack386_autoTriggerOnPayout = functions.firestore
  .document('payoutRequests/{requestId}')
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();

    // Check if payout just completed
    if (before.status !== 'COMPLETED' && after.status === 'COMPLETED') {
      const userId = after.userId;

      // Check if this is their first payout
      const previousPayouts = await db.collection('payoutRequests')
        .where('userId', '==', userId)
        .where('status', '==', 'COMPLETED')
        .limit(2)
        .get();

      if (previousPayouts.size === 1) {
        // This is their first payout
        const eligibility = await checkReviewEligibility(userId);
        if (eligibility.eligible) {
          const promptRef = db.collection('reviewPrompts').doc();
          await promptRef.set({
            promptId: promptRef.id,
            userId,
            trigger: 'FIRST_PAYOUT',
            triggered: true,
            shown: false,
            completed: false,
            triggeredAt: admin.firestore.Timestamp.now(),
            createdAt: admin.firestore.Timestamp.now(),
          });
        }
      }
    }
  });

// ============================================================================
// GET REVIEW PROMPT ANALYTICS
// ============================================================================

export const pack386_getReviewAnalytics = functions.https.onCall(
  async (data: { period?: 'day' | 'week' | 'month' }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    // Verify admin permissions
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    switch (data.period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    const promptsSnapshot = await db.collection('reviewPrompts')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
      .get();

    // Aggregate metrics
    const byTrigger: Record<string, any> = {};
    let totalTriggered = 0;
    let totalShown = 0;
    let totalCompleted = 0;

    promptsSnapshot.forEach(doc => {
      const prompt = doc.data();
      const trigger = prompt.trigger;

      if (!byTrigger[trigger]) {
        byTrigger[trigger] = {
          triggered: 0,
          shown: 0,
          completed: 0,
        };
      }

      if (prompt.triggered) {
        byTrigger[trigger].triggered++;
        totalTriggered++;
      }

      if (prompt.shown) {
        byTrigger[trigger].shown++;
        totalShown++;
      }

      if (prompt.completed) {
        byTrigger[trigger].completed++;
        totalCompleted++;
      }
    });

    // Calculate conversion rates
    Object.keys(byTrigger).forEach(trigger => {
      byTrigger[trigger].showRate = byTrigger[trigger].triggered > 0
        ? byTrigger[trigger].shown / byTrigger[trigger].triggered
        : 0;
      byTrigger[trigger].completionRate = byTrigger[trigger].shown > 0
        ? byTrigger[trigger].completed / byTrigger[trigger].shown
        : 0;
    });

    return {
      summary: {
        totalTriggered,
        totalShown,
        totalCompleted,
        showRate: totalTriggered > 0 ? totalShown / totalTriggered : 0,
        completionRate: totalShown > 0 ? totalCompleted / totalShown : 0,
      },
      byTrigger,
    };
  }
);
