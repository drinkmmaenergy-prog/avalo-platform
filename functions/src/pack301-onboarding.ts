/**
 * PACK 301B - Onboarding Funnel Tracking Cloud Function
 * Tracks user progress through onboarding stages and triggers contextual nudges
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  OnboardingStage,
  NUDGE_TEMPLATES,
  NudgeTrigger,
} from './pack301-retention-types';
import {
  getUserRetentionProfile,
  updateOnboardingStage,
  updateUserActivity,
} from './pack301-retention-service';
import { enqueueNotification } from './pack293-notification-service';
import { writeAuditLog } from './pack296-audit-helpers';

const db = admin.firestore();

// Track onboarding stage progression
interface OnboardingTrackRequest {
  userId: string;
  stage: OnboardingStage;
  metadata?: Record<string, any>;
}

/**
 * Track onboarding stage change
 * Called by client when user completes onboarding steps
 */
export const trackOnboardingStage = functions.https.onCall(
  async (data: OnboardingTrackRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, stage, metadata } = data;

    // Verify user is tracking their own onboarding
    if (userId !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Cannot track onboarding for other users');
    }

    try {
      // Get current retention profile
      const profile = await getUserRetentionProfile(userId);

      // Only update if moving forward
      if (stage <= profile.onboardingStage) {
        return {
          success: true,
          currentStage: profile.onboardingStage,
          message: 'Stage already completed',
        };
      }

      // Update onboarding stage
      await updateOnboardingStage(userId, stage);

      // Update last active timestamp
      await updateUserActivity(userId);

      // Log to audit trail
      await writeAuditLog({
        actorType: 'USER',
        actorId: userId,
        actionType: 'RETENTION_ONBOARDING_COMPLETED',
        resourceType: 'USER',
        resourceId: userId,
        metadata: {
          stage,
          previousStage: profile.onboardingStage,
          ...metadata,
        },
      });

      // Check if we should send encouragement nudge
      await maybeTriggerOnboardingNudge(userId, stage);

      console.log(`[Onboarding] User ${userId} progressed to stage ${stage}`);

      return {
        success: true,
        currentStage: stage,
        completed: stage >= OnboardingStage.CHAT_STARTED,
      };
    } catch (error: any) {
      console.error('[Onboarding] Error tracking stage:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Trigger contextual nudge based on onboarding stage
 */
async function maybeTriggerOnboardingNudge(
  userId: string,
  stage: OnboardingStage
): Promise<void> {
  try {
    // Check nudge cooldown (max 1 onboarding nudge per 24h)
    const cooldownRef = db.collection('nudgeHistory').doc(userId);
    const cooldownSnap = await cooldownRef.get();
    const cooldownData = cooldownSnap.data();

    if (cooldownData?.lastOnboardingNudge) {
      const hoursSinceLastNudge =
        (Date.now() - cooldownData.lastOnboardingNudge.toMillis()) / (1000 * 60 * 60);
      
      if (hoursSinceLastNudge < 24) {
        console.log(`[Onboarding] Skipping nudge for ${userId} - cooldown active`);
        return;
      }
    }

    // Get user's language preference
    const userDoc = await db.collection('users').doc(userId).get();
    const userLang = userDoc.data()?.language || 'en';

    // Determine which nudge to send based on stage
    let nudgeTrigger: NudgeTrigger | null = null;

    switch (stage) {
      case OnboardingStage.NEW:
        nudgeTrigger = 'NO_PHOTOS_24H';
        break;
      case OnboardingStage.PHOTOS_ADDED:
        // Encourage to set preferences
        nudgeTrigger = 'NO_DISCOVERY_48H';
        break;
      case OnboardingStage.PREFERENCES_SET:
        // Encourage to visit discovery
        nudgeTrigger = 'NO_DISCOVERY_48H';
        break;
      case OnboardingStage.DISCOVERY_VISITED:
        // Encourage first swipe
        nudgeTrigger = 'NO_SWIPE_48H';
        break;
      case OnboardingStage.SWIPE_USED:
        // Encourage first chat
        nudgeTrigger = 'NEW_PROFILES_IN_AREA';
        break;
      default:
        // No nudge needed for advanced stages
        break;
    }

    if (!nudgeTrigger) {
      return;
    }

    const template = NUDGE_TEMPLATES[nudgeTrigger];
    const title = userLang === 'pl' ? template.titlePl : template.titleEn;
    const body = userLang === 'pl' ? template.bodyPl : template.bodyEn;

    // Send notification via PACK 293
    await enqueueNotification({
      userId,
      type: 'RETENTION_NUDGE' as any,
      title,
      body,
      context: {
        trigger: nudgeTrigger,
        stage,
      },
      priority: template.priority,
      delivery: {
        push: true,
        inApp: true,
        email: false,
      },
    });

    // Update nudge cooldown
    await cooldownRef.set(
      {
        userId,
        lastOnboardingNudge: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      },
      { merge: true }
    );

    // Log nudge sent
    await writeAuditLog({
      actorType: 'SYSTEM',
      actionType: 'RETENTION_NUDGE_SENT',
      resourceType: 'USER',
      resourceId: userId,
      metadata: {
        trigger: nudgeTrigger,
        stage,
        channel: 'onboarding',
      },
    });

    console.log(`[Onboarding] Sent nudge ${nudgeTrigger} to user ${userId}`);
  } catch (error) {
    console.error('[Onboarding] Error sending nudge:', error);
    // Don't throw - nudge failure shouldn't block onboarding
  }
}

/**
 * Get user's onboarding progress
 */
export const getOnboardingProgress = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = data.userId || context.auth.uid;

  // Users can only check their own progress
  if (userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot view other users\' onboarding');
  }

  try {
    const profile = await getUserRetentionProfile(userId);

    return {
      success: true,
      stage: profile.onboardingStage,
      completed: profile.onboardingCompleted,
      stages: {
        NEW: profile.onboardingStage >= OnboardingStage.NEW,
        PHOTOS_ADDED: profile.onboardingStage >= OnboardingStage.PHOTOS_ADDED,
        PREFERENCES_SET: profile.onboardingStage >= OnboardingStage.PREFERENCES_SET,
        DISCOVERY_VISITED: profile.onboardingStage >= OnboardingStage.DISCOVERY_VISITED,
        SWIPE_USED: profile.onboardingStage >= OnboardingStage.SWIPE_USED,
        CHAT_STARTED: profile.onboardingStage >= OnboardingStage.CHAT_STARTED,
      },
    };
  } catch (error: any) {
    console.error('[Onboarding] Error getting progress:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Firestore trigger: Auto-track photo uploads for onboarding
 */
export const onPhotoUploaded = functions.firestore
  .document('users/{userId}/photos/{photoId}')
  .onCreate(async (snapshot, context) => {
    const userId = context.params.userId;

    try {
      const profile = await getUserRetentionProfile(userId);

      // Auto-advance to PHOTOS_ADDED if still at NEW
      if (profile.onboardingStage < OnboardingStage.PHOTOS_ADDED) {
        await updateOnboardingStage(userId, OnboardingStage.PHOTOS_ADDED);
        console.log(`[Onboarding] Auto-advanced ${userId} to PHOTOS_ADDED`);
      }
    } catch (error) {
      console.error('[Onboarding] Error in photo trigger:', error);
    }
  });

console.log('✅ PACK 301B - Onboarding Funnel Tracking initialized');