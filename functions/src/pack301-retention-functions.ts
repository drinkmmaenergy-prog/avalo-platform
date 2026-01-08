/**
 * PACK 301A — Growth & Retention Automation Engine
 * Execution layer for PACK 301 & 301B
 * 
 * This pack turns PACK 301 from a static data layer into a live automation engine:
 * - Tracks real user activity events (login, swipe, chat, calls, purchases, profile updates)
 * - Maintains onboarding stages in real time
 * - Recomputes churn risk & segment daily
 * - Triggers win-back sequences and onboarding nudges via PACK 293 notifications
 * - Logs all important changes via PACK 296 audit logs
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  getUserRetentionProfile,
  recordActivity,
  recalculateChurnScore,
  recalculateSegment,
  getUsersForRetentionSweep,
  getUsersForWinbackSweep,
  getUsersForOnboardingNudges,
  updateOnboardingStage,
  markWinbackStepSent,
  markWinbackCompleted,
  ActivityType,
  ActivityMetadata,
  RETENTION_THRESHOLDS,
} from './pack301-retention-service';
import {
  OnboardingStage,
  WIN_BACK_MESSAGES,
  NUDGE_TEMPLATES,
  NudgeTrigger,
} from './pack301-retention-types';
import { enqueueNotification } from './pack293-notification-service';
import { writeAuditLog } from './pack296-audit-helpers';
import { isSuperAdmin } from './pack296-audit-helpers';

const db = admin.firestore();

// ============================================================================
// 2.1 pack301_logUserActivity (callable)
// ============================================================================

/**
 * Log user activity and update retention profile
 * Updates last-activity timestamps, recomputes churn risk and segment
 */
export const pack301_logUserActivity = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { activityType, metadata } = data;

    // Validate input
    if (!activityType) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'activityType is required'
      );
    }

    const validTypes: ActivityType[] = [
      'login',
      'swipe',
      'chat_message',
      'call_started',
      'purchase',
      'profile_update',
    ];

    if (!validTypes.includes(activityType)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Invalid activityType. Must be one of: ${validTypes.join(', ')}`
      );
    }

    try {
      // Record activity and update profile
      const result = await recordActivity(
        userId,
        activityType as ActivityType,
        metadata as ActivityMetadata
      );

      // Log audit event
      await writeAuditLog({
        actorType: 'USER',
        actorId: userId,
        actionType: 'retention.activity_logged' as any,
        resourceType: 'USER',
        resourceId: userId,
        metadata: {
          activityType,
          ...metadata,
        },
      });

      console.log(`[PACK 301A] Activity logged for user ${userId}: ${activityType}`);

      return {
        success: true,
        ...result,
      };
    } catch (error: any) {
      console.error('[PACK 301A] Error logging activity:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// 2.2 pack301_updateOnboardingStage (callable)
// ============================================================================

/**
 * Update user's onboarding stage
 * Only moves forward, stores timestamps, resets nudge counters
 */
export const pack301_updateOnboardingStage = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { stage } = data;

    // Validate input
    if (stage === undefined || stage === null) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'stage is required'
      );
    }

    try {
      const profile = await getUserRetentionProfile(userId);
      const oldStage = profile.onboardingStage;

      // Only update if moving forward
      if (stage <= profile.onboardingStage) {
        return {
          success: true,
          message: 'Stage already completed',
          currentStage: profile.onboardingStage,
        };
      }

      // Update onboarding stage
      await updateOnboardingStage(userId, stage);

      // Log audit event
      await writeAuditLog({
        actorType: 'USER',
        actorId: userId,
        actionType: 'retention.onboarding_stage_changed' as any,
        resourceType: 'USER',
        resourceId: userId,
        metadata: {
          oldStage,
          newStage: stage,
        },
      });

      console.log(`[PACK 301A] Onboarding stage updated for user ${userId}: ${oldStage} → ${stage}`);

      return {
        success: true,
        currentStage: stage,
        previousStage: oldStage,
      };
    } catch (error: any) {
      console.error('[PACK 301A] Error updating onboarding stage:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// 2.3 pack301_dailyRetentionSweep (scheduled)
// ============================================================================

/**
 * Daily retention sweep - recalculate churn scores and segments
 * Runs once per day to update all user retention profiles
 */
export const pack301_dailyRetentionSweep = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    console.log('[PACK 301A] Starting daily retention sweep...');

    let processedUsers = 0;
    let segmentChanges = 0;
    let cursor: string | undefined;
    const batchSize = 500;

    try {
      // Process users in batches
      do {
        const { users, nextCursor } = await getUsersForRetentionSweep(
          batchSize,
          cursor
        );

        for (const user of users) {
          try {
            const oldSegment = user.segment;
            const oldRisk = user.riskOfChurn;

            // Recalculate churn score and segment
            const updatedProfile = await recalculateSegment(user.uid);

            processedUsers++;

            // Check for segment changes
            if (updatedProfile.segment !== oldSegment) {
              segmentChanges++;

              // Log segment change
              await writeAuditLog({
                actorType: 'SYSTEM',
                actionType: 'retention.segment_change' as any,
                resourceType: 'USER',
                resourceId: user.uid,
                metadata: {
                  oldSegment,
                  newSegment: updatedProfile.segment,
                  oldRisk,
                  newRisk: updatedProfile.riskOfChurn,
                },
              });

              // Mark user for win-back if entering CHURN_RISK or CHURNED
              if (
                (updatedProfile.segment === 'CHURN_RISK' ||
                  updatedProfile.segment === 'CHURNED') &&
                !updatedProfile.winBackSequenceStarted
              ) {
                await db.collection('userRetention').doc(user.uid).update({
                  winBackSequenceStarted: true,
                  winBackSequenceStep: 0,
                  winBackSequenceLastSent: null,
                  updatedAt: admin.firestore.Timestamp.now(),
                });

                console.log(`[PACK 301A] Marked user ${user.uid} for win-back (${updatedProfile.segment})`);
              }
            }
          } catch (error) {
            console.error(`[PACK 301A] Error processing user ${user.uid}:`, error);
            // Continue with next user
          }
        }

        cursor = nextCursor;
      } while (cursor);

      console.log(`[PACK 301A] Daily retention sweep complete: ${processedUsers} users processed, ${segmentChanges} segment changes`);

      return {
        success: true,
        processedUsers,
        segmentChanges,
      };
    } catch (error: any) {
      console.error('[PACK 301A] Error in daily retention sweep:', error);
      throw error;
    }
  });

// ============================================================================
// 2.4 pack301_dailyWinbackSweep (scheduled)
// ============================================================================

/**
 * Daily win-back sweep - send win-back messages to churned users
 * Sends 3-step win-back sequence (Day 1, Day 4, Day 7)
 */
export const pack301_dailyWinbackSweep = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    console.log('[PACK 301A] Starting daily win-back sweep...');

    let processedUsers = 0;
    let messagesSent = 0;
    let cursor: string | undefined;
    const batchSize = 500;

    try {
      // Process users in batches
      do {
        const { users, nextCursor } = await getUsersForWinbackSweep(
          batchSize,
          cursor
        );

        for (const user of users) {
          try {
            // Skip if user became ACTIVE or RETURNING
            if (user.segment === 'ACTIVE' || user.segment === 'RETURNING') {
              await markWinbackCompleted(user.uid);
              console.log(`[PACK 301A] User ${user.uid} returned - win-back sequence completed`);
              continue;
            }

            // Determine which win-back step to send
            const now = Date.now();
            const lastSent = user.winBackSequenceLastSent
              ? user.winBackSequenceLastSent.toMillis()
              : 0;
            const daysSinceLastSent = (now - lastSent) / (1000 * 60 * 60 * 24);

            let stepToSend: number | null = null;

            // Step 1: Day 1 (first message, 24h after entering churn)
            if (user.winBackSequenceStep === 0 && daysSinceLastSent >= 1) {
              stepToSend = 0;
            }
            // Step 2: Day 4 (4 days after first message)
            else if (user.winBackSequenceStep === 1 && daysSinceLastSent >= 3) {
              stepToSend = 1;
            }
            // Step 3: Day 7 (3 days after second message)
            else if (user.winBackSequenceStep === 2 && daysSinceLastSent >= 3) {
              stepToSend = 2;
            }

            if (stepToSend !== null && stepToSend < WIN_BACK_MESSAGES.length) {
              // Get user language
              const userDoc = await db.collection('users').doc(user.uid).get();
              const userLang = userDoc.data()?.language || 'en';

              const message = WIN_BACK_MESSAGES[stepToSend];
              const title = userLang === 'pl' ? message.titlePl : message.titleEn;
              const body = userLang === 'pl' ? message.bodyPl : message.bodyEn;

              // Send notification via PACK 293
              await enqueueNotification({
                userId: user.uid,
                type: 'WINBACK' as any,
                title,
                body,
                context: {
                  step: message.step,
                  dayOffset: message.dayOffset,
                },
                priority: message.priority,
                delivery: {
                  push: true,
                  inApp: true,
                  email: false,
                },
              });

              // Update win-back state
              await markWinbackStepSent(user.uid, stepToSend + 1);

              // Log audit event
              await writeAuditLog({
                actorType: 'SYSTEM',
                actionType: 'retention.winback_triggered' as any,
                resourceType: 'USER',
                resourceId: user.uid,
                metadata: {
                  step: message.step,
                  channel: 'push+inApp',
                },
              });

              messagesSent++;
              console.log(`[PACK 301A] Sent win-back step ${message.step} to user ${user.uid}`);
            }

            processedUsers++;
          } catch (error) {
            console.error(`[PACK 301A] Error processing user ${user.uid}:`, error);
            // Continue with next user
          }
        }

        cursor = nextCursor;
      } while (cursor);

      console.log(`[PACK 301A] Daily win-back sweep complete: ${processedUsers} users processed, ${messagesSent} messages sent`);

      return {
        success: true,
        processedUsers,
        messagesSent,
      };
    } catch (error: any) {
      console.error('[PACK 301A] Error in daily win-back sweep:', error);
      throw error;
    }
  });

// ============================================================================
// 2.5 pack301_onboardingNudgeSweep (scheduled)
// ============================================================================

/**
 * Onboarding nudge sweep - send nudges to users stuck in onboarding
 * Runs every 6 hours to remind users to complete onboarding steps
 */
export const pack301_onboardingNudgeSweep = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    console.log('[PACK 301A] Starting onboarding nudge sweep...');

    let processedUsers = 0;
    let nudgesSent = 0;
    let cursor: string | undefined;
    const batchSize = 500;

    try {
      // Process users in batches
      do {
        const { users, nextCursor } = await getUsersForOnboardingNudges(
          batchSize,
          cursor
        );

        for (const user of users) {
          try {
            // Check if user has been stale for too long at this stage
            const now = Date.now();
            const lastActive = user.lastActiveAt.toMillis();
            const hoursSinceActive = (now - lastActive) / (1000 * 60 * 60);
            const staleThreshold =
              RETENTION_THRESHOLDS.ONBOARDING_STAGE_STALE_AFTER_HOURS[user.onboardingStage] || 24;

            if (hoursSinceActive < staleThreshold) {
              continue; // Not stale yet
            }

            // Check nudge rate limit (stored in nudgeHistory)
            const historyRef = db.collection('nudgeHistory').doc(user.uid);
            const historySnap = await historyRef.get();
            const history = historySnap.data();

            if (history?.lastOnboardingNudge) {
              const hoursSinceLastNudge =
                (now - history.lastOnboardingNudge.toMillis()) / (1000 * 60 * 60);
              if (hoursSinceLastNudge < 24) {
                continue; // Rate limited
              }
            }

            // Check opt-out
            if (history?.optedOut) {
              continue;
            }

            // Determine which nudge to send
            let nudgeTrigger: NudgeTrigger | null = null;
            switch (user.onboardingStage) {
              case OnboardingStage.NEW:
                nudgeTrigger = 'NO_PHOTOS_24H';
                break;
              case OnboardingStage.PHOTOS_ADDED:
              case OnboardingStage.PREFERENCES_SET:
                nudgeTrigger = 'NO_DISCOVERY_48H';
                break;
              case OnboardingStage.DISCOVERY_VISITED:
                nudgeTrigger = 'NO_SWIPE_48H';
                break;
              case OnboardingStage.SWIPE_USED:
                nudgeTrigger = 'NO_CHAT_3D';
                break;
              default:
                break;
            }

            if (!nudgeTrigger) {
              continue;
            }

            // Get user language
            const userDoc = await db.collection('users').doc(user.uid).get();
            const userLang = userDoc.data()?.language || 'en';

            const template = NUDGE_TEMPLATES[nudgeTrigger];
            const title = userLang === 'pl' ? template.titlePl : template.titleEn;
            const body = userLang === 'pl' ? template.bodyPl : template.bodyEn;

            // Send notification via PACK 293
            await enqueueNotification({
              userId: user.uid,
              type: 'RETENTION_NUDGE' as any,
              title,
              body,
              context: {
                trigger: nudgeTrigger,
                stage: user.onboardingStage,
              },
              priority: template.priority,
              delivery: {
                push: true,
                inApp: true,
                email: false,
              },
            });

            // Update nudge history
            await historyRef.set(
              {
                userId: user.uid,
                lastOnboardingNudge: admin.firestore.Timestamp.now(),
                updatedAt: admin.firestore.Timestamp.now(),
              },
              { merge: true }
            );

            // Log audit event
            await writeAuditLog({
              actorType: 'SYSTEM',
              actionType: 'retention.onboarding_nudge_sent' as any,
              resourceType: 'USER',
              resourceId: user.uid,
              metadata: {
                trigger: nudgeTrigger,
                stage: user.onboardingStage,
              },
            });

            nudgesSent++;
            console.log(`[PACK 301A] Sent onboarding nudge to user ${user.uid}: ${nudgeTrigger}`);

            processedUsers++;
          } catch (error) {
            console.error(`[PACK 301A] Error processing user ${user.uid}:`, error);
            // Continue with next user
          }
        }

        cursor = nextCursor;
      } while (cursor);

      console.log(`[PACK 301A] Onboarding nudge sweep complete: ${processedUsers} users processed, ${nudgesSent} nudges sent`);

      return {
        success: true,
        processedUsers,
        nudgesSent,
      };
    } catch (error: any) {
      console.error('[PACK 301A] Error in onboarding nudge sweep:', error);
      throw error;
    }
  });

// ============================================================================
// 2.6 pack301_rebuildRetentionProfile (admin callable)
// ============================================================================

/**
 * Rebuild retention profile for a user (admin only)
 * Recomputes full retention profile from historical data
 */
export const pack301_rebuildRetentionProfile = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const adminId = context.auth.uid;
    const { userId } = data;

    if (!userId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'userId is required'
      );
    }

    // Verify admin access
    const isAdmin = await isSuperAdmin(adminId);
    if (!isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    try {
      console.log(`[PACK 301A] Rebuilding retention profile for user ${userId} by admin ${adminId}`);

      // Get current profile
      const oldProfile = await getUserRetentionProfile(userId);

      // Recompute churn score and segment
      const updatedProfile = await recalculateChurnScore(userId);
      await recalculateSegment(userId);

      // Get final profile
      const finalProfile = await getUserRetentionProfile(userId);

      // Log audit event
      await writeAuditLog({
        actorType: 'ADMIN',
        actorId: adminId,
        actionType: 'retention.profile_rebuilt' as any,
        resourceType: 'USER',
        resourceId: userId,
        metadata: {
          oldSegment: oldProfile.segment,
          newSegment: finalProfile.segment,
          oldRisk: oldProfile.riskOfChurn,
          newRisk: finalProfile.riskOfChurn,
        },
      });

      console.log(`[PACK 301A] Retention profile rebuilt for user ${userId}`);

      return {
        success: true,
        profile: {
          uid: finalProfile.uid,
          segment: finalProfile.segment,
          riskOfChurn: finalProfile.riskOfChurn,
          onboardingStage: finalProfile.onboardingStage,
          onboardingCompleted: finalProfile.onboardingCompleted,
          lastActiveAt: finalProfile.lastActiveAt,
          daysActive7: finalProfile.daysActive7,
          daysActive30: finalProfile.daysActive30,
        },
      };
    } catch (error: any) {
      console.error('[PACK 301A] Error rebuilding retention profile:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

console.log('✅ PACK 301A — Growth & Retention Automation Engine initialized');