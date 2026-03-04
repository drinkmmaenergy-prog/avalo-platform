/**
 * PACK 227: Desire Loop Engine - Cloud Functions Triggers
 * 
 * Scheduled tasks and event triggers for the Desire Loop system
 */

import * as functions from 'firebase-functions';
import {
  getDesireState,
  updateDesireDriver,
  restoreDesireDriver,
  applyDailyDecay,
  generateTriggerForDriver,
  createDailyDesireSnapshot,
  cleanupExpiredData,
  setBreakupCooldown,
  setToxicCooldown,
} from './pack-227-desire-loop-engine.js';
import { HttpsError, admin, auth, db, onCall, logger, onSchedule, onDocumentCreated, onDocumentUpdated } from './runtime';

// ============================================================================
// SCHEDULED FUNCTIONS (CRON JOBS)
// ============================================================================

/**
 * Daily decay and cleanup - Runs at 3 AM UTC
 * Applies natural decay to all desire states
 */
export const dailyDesireDecay = onSchedule({ schedule: "0 3 * * *", timeZone: "UTC" }, async (event) => {
    console.log('Running daily desire decay...');
    
    try {
      const { db } = await import('./init.js');
      const statesSnap = await db.collection('desire_states').limit(1000).get();
      
      let processedCount = 0;
      let errorCount = 0;
      
      for (const stateDoc of statesSnap.docs) {
        try {
          await applyDailyDecay(stateDoc.id);
          processedCount++;
        } catch (error) {
          console.error(`Failed to apply decay for user ${stateDoc.id}:`, error);
          errorCount++;
        }
      }
      
      console.log(`Daily decay complete: ${processedCount} processed, ${errorCount} errors`);
      console.log('Scheduled job result:', { success: true, processed: processedCount, errors: errorCount });

      return;
    } catch (error) {
      console.error('Daily decay failed:', error);
      throw error;
    }
  });

/**
 * Daily snapshot creation - Runs at 2 AM UTC
 * Creates historical snapshots for analytics
 */
export const dailyDesireSnapshot = onSchedule({ schedule: "0 2 * * *", timeZone: "UTC" }, async (event) => {
    console.log('Creating daily desire snapshots...');
    
    try {
      await createDailyDesireSnapshot();
      console.log('Daily snapshots created successfully');
      console.log('Scheduled job result:', { success: true });

      return;
    } catch (error) {
      console.error('Snapshot creation failed:', error);
      throw error;
    }
  });

/**
 * Cleanup expired data - Runs every 6 hours
 * Removes expired triggers and cooldowns
 */
export const cleanupDesireLoopData = onSchedule({ schedule: "0 */6 * * *", timeZone: "UTC" }, async (event) => {
    console.log('Cleaning up expired desire loop data...');
    
    try {
      const result = await cleanupExpiredData();
      console.log(`Cleanup complete: ${result.triggers} triggers, ${result.cooldowns} cooldowns removed`);
      console.log('Scheduled job result:', { success: true, ...result });

      return;
    } catch (error) {
      console.error('Cleanup failed:', error);
      throw error;
    }
  });

// ============================================================================
// EVENT TRIGGERS - Restore desire states on positive actions
// ============================================================================

/**
 * Trigger when user views new profiles (curiosity)
 */
export const onProfileViewed = onDocumentCreated('profile_views/{viewId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const view = snap.data();
    const viewerId = view.viewerId;
    
    try {
      await restoreDesireDriver(viewerId, 'curiosity', 'profile_view');
      console.log(`Curiosity restored for user ${viewerId} after profile view`);
    } catch (error) {
      console.error('Failed to restore curiosity:', error);
    }
  });

/**
 * Trigger when chat message is sent (intimacy)
 */
export const onChatMessageSent = onDocumentCreated('messages/{messageId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const message = snap.data();
    const senderId = message.senderId;
    
    try {
      await restoreDesireDriver(senderId, 'intimacy', 'chat_message');
      console.log(`Intimacy restored for user ${senderId} after message`);
    } catch (error) {
      console.error('Failed to restore intimacy:', error);
    }
  });

/**
 * Trigger when call is completed (intimacy)
 */
export const onCallCompleted = onDocumentUpdated('calls/{callId}', async (event) => {
  const change = event.data;
  if (!change) return;
    const before = change.before.data();
    const after = change.after.data();
    
    // Only trigger on status change to completed
    if (before.status !== 'completed' && after.status === 'completed') {
      const participants = after.participants || [];
      
      for (const userId of participants) {
        try {
          await restoreDesireDriver(userId, 'intimacy', 'call_completed');
          console.log(`Intimacy restored for user ${userId} after call completion`);
        } catch (error) {
          console.error(`Failed to restore intimacy for ${userId}:`, error);
        }
      }
    }
  });

/**
 * Trigger when meeting is verified (intimacy)
 */
export const onMeetingVerified = onDocumentUpdated('meetings/{meetingId}', async (event) => {
  const change = event.data;
  if (!change) return;
    const before = change.before.data();
    const after = change.after.data();
    
    // Only trigger when verification changes to true
    if (!before.verified && after.verified) {
      const participants = after.participants || [];
      
      for (const userId of participants) {
        try {
          await restoreDesireDriver(userId, 'intimacy', 'meeting_verified');
          console.log(`Intimacy restored for user ${userId} after meeting verification`);
        } catch (error) {
          console.error(`Failed to restore intimacy for ${userId}:`, error);
        }
      }
    }
  });

/**
 * Trigger when profile view is received (recognition)
 */
export const onProfileViewReceived = onDocumentCreated('profile_views/{viewId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const view = snap.data();
    const profileUserId = view.profileUserId;
    
    try {
      await restoreDesireDriver(profileUserId, 'recognition', 'profile_view_received');
      console.log(`Recognition restored for user ${profileUserId} after being viewed`);
    } catch (error) {
      console.error('Failed to restore recognition:', error);
    }
  });

/**
 * Trigger when compliment is received (recognition)
 */
export const onComplimentReceived = onDocumentCreated('compliments/{complimentId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const compliment = snap.data();
    const recipientId = compliment.recipientId;
    
    try {
      await restoreDesireDriver(recipientId, 'recognition', 'compliment_received');
      console.log(`Recognition restored for user ${recipientId} after compliment`);
    } catch (error) {
      console.error('Failed to restore recognition:', error);
    }
  });

/**
 * Trigger when fan status changes (recognition)
 */
export const onFanStatusChanged = onDocumentUpdated('fan_status/{statusId}', async (event) => {
  const change = event.data;
  if (!change) return;
    const before = change.before.data();
    const after = change.after.data();
    
    // Check if fan count increased
    if (after.fanCount > before.fanCount) {
      const userId = after.userId;
      
      try {
        await restoreDesireDriver(userId, 'recognition', 'new_fan');
        console.log(`Recognition restored for user ${userId} after gaining fan`);
      } catch (error) {
        console.error('Failed to restore recognition:', error);
      }
    }
  });

/**
 * Trigger when user levels up (growth)
 */
export const onUserLevelUp = onDocumentUpdated('users/{userId}', async (event) => {
  const change = event.data;
  if (!change) return;
    const before = change.before.data();
    const after = change.after.data();
    
    // Check if level increased
    if (after.level > before.level) {
      const userId = event.params.userId;
      
      try {
        await restoreDesireDriver(userId, 'growth', 'level_up');
        console.log(`Growth restored for user ${userId} after level up`);
      } catch (error) {
        console.error('Failed to restore growth:', error);
      }
    }
  });

/**
 * Trigger when Royal tier is achieved (growth)
 */
export const onRoyalTierAchieved = onDocumentUpdated('users/{userId}', async (event) => {
  const change = event.data;
  if (!change) return;
    const before = change.before.data();
    const after = change.after.data();
    
    // Check if tier changed to royal
    if (before.tier !== 'royal' && after.tier === 'royal') {
      const userId = event.params.userId;
      
      try {
        await restoreDesireDriver(userId, 'growth', 'royal_achieved');
        console.log(`Growth restored for user ${userId} after achieving Royal`);
      } catch (error) {
        console.error('Failed to restore growth:', error);
      }
    }
  });

/**
 * Trigger when user joins an event (opportunity)
 */
export const onEventJoined = onDocumentCreated('event_participants/{participantId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const participant = snap.data();
    const userId = participant.userId;
    
    try {
      await restoreDesireDriver(userId, 'opportunity', 'event_joined');
      console.log(`Opportunity restored for user ${userId} after joining event`);
    } catch (error) {
      console.error('Failed to restore opportunity:', error);
    }
  });

/**
 * Trigger when travel mode is activated (opportunity)
 */
export const onTravelModeActivated = onDocumentUpdated('users/{userId}', async (event) => {
  const change = event.data;
  if (!change) return;
    const before = change.before.data();
    const after = change.after.data();
    
    // Check if travel mode was activated
    if (!before.travelMode?.active && after.travelMode?.active) {
      const userId = event.params.userId;
      
      try {
        await restoreDesireDriver(userId, 'opportunity', 'travel_mode_activated');
        console.log(`Opportunity restored for user ${userId} after activating travel mode`);
      } catch (error) {
        console.error('Failed to restore opportunity:', error);
      }
    }
  });

// ============================================================================
// INTEGRATION TRIGGERS - Safety and special states
// ============================================================================

/**
 * Trigger when breakup recovery starts (PACK 222)
 * Pauses desire loop triggers for cooldown period
 */
export const onBreakupRecoveryStarted = onDocumentCreated('breakup_recovery/{recoveryId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const recovery = snap.data();
    const userId = recovery.userId;
    const cooldownDays = recovery.cooldownDays || 14;
    
    try {
      await setBreakupCooldown(userId, cooldownDays);
      console.log(`Desire loop paused for user ${userId} during breakup recovery`);
    } catch (error) {
      console.error('Failed to set breakup cooldown:', error);
    }
  });

/**
 * Trigger when safety incident is created
 * Pauses desire loop for toxic contacts
 */
export const onSafetyIncident = onDocumentCreated('trust_safety_incidents/{incidentId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const incident = snap.data();
    const userId = incident.userId;
    const severity = incident.severity;
    
    // Only pause for high/critical incidents
    if (severity === 'HIGH' || severity === 'CRITICAL') {
      try {
        await setToxicCooldown(userId, 14); // 14-day cooldown
        console.log(`Desire loop paused for user ${userId} due to safety incident`);
      } catch (error) {
        console.error('Failed to set toxic cooldown:', error);
      }
    }
  });

/**
 * Trigger when romantic momentum drops significantly (PACK 224)
 * Boosts opportunity and curiosity to help recovery
 */
export const onMomentumDropDetected = onDocumentUpdated('romantic_momentum_states/{userId}', async (event) => {
  const change = event.data;
  if (!change) return;
    const before = change.before.data();
    const after = change.after.data();
    
    // Detect significant momentum drop
    if (before.score >= 30 && after.score < 20) {
      const userId = event.params.userId;
      
      try {
        // Generate recovery triggers
        await generateTriggerForDriver(userId, 'curiosity');
        await generateTriggerForDriver(userId, 'opportunity');
        console.log(`Recovery triggers generated for user ${userId} after momentum drop`);
      } catch (error) {
        console.error('Failed to generate recovery triggers:', error);
      }
    }
  });

/**
 * Trigger when chemistry lock-in activates (PACK 226)
 * Boosts intimacy state
 */
export const onChemistryLockInActivated = onDocumentUpdated('conversations/{conversationId}', async (event) => {
  const change = event.data;
  if (!change) return;
    const before = change.before.data();
    const after = change.after.data();
    
    // Check if chemistry lock-in just activated
    if (!before.chemistryLockIn?.isActive && after.chemistryLockIn?.isActive) {
      const participants = after.participants || [];
      
      for (const userId of participants) {
        try {
          await restoreDesireDriver(userId, 'intimacy', 'chemistry_lock_in');
          console.log(`Intimacy restored for user ${userId} from chemistry lock-in`);
        } catch (error) {
          console.error(`Failed to restore intimacy for ${userId}:`, error);
        }
      }
    }
  });

/**
 * Trigger when romantic journey milestone is unlocked (PACK 221)
 * Boosts growth and intimacy
 */
export const onJourneyMilestoneUnlocked = onDocumentCreated('journey_milestones/{milestoneId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const milestone = snap.data();
    const user1Id = milestone.user1Id;
    const user2Id = milestone.user2Id;
    
    for (const userId of [user1Id, user2Id]) {
      try {
        await restoreDesireDriver(userId, 'growth', 'journey_milestone');
        await restoreDesireDriver(userId, 'intimacy', 'journey_milestone');
        console.log(`Desire states restored for user ${userId} after journey milestone`);
      } catch (error) {
        console.error(`Failed to restore states for ${userId}:`, error);
      }
    }
  });

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

/**
 * Manually trigger desire state check (for testing or admin)
 */
export const triggerDesireStateCheck = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = data.userId || request.auth.uid;
  
  // Only allow users to check their own state, or admins to check any
  if (userId !== request.auth.uid) {
    const { db } = await import('./init.js');
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const isAdmin = userDoc.data()?.role === 'admin';
    
    if (!isAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Not authorized');
    }
  }
  
  try {
    const state = await getDesireState(userId);
    
    // Check each driver and generate triggers if needed
    const triggers = [];
    for (const driver of state.enabledDrivers) {
      if (state[driver] < 30) {
        const trigger = await generateTriggerForDriver(userId, driver);
        if (trigger) {
          triggers.push(trigger);
        }
      }
    }
    
    console.log('Scheduled job result:', {
      success: true,
      state,
      triggersGenerated: triggers.length,
    });

    
    return;
  } catch (error) {
    console.error('Failed to check desire state:', error);
    throw new functions.https.HttpsError('internal', 'Failed to check desire state');
  }
});

/**
 * Get user's current desire state (callable from client)
 */
export const getMyDesireState = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    const state = await getDesireState(request.auth.uid);
    return {
      success: true,
      state: {
        curiosity: state.curiosity,
        intimacy: state.intimacy,
        recognition: state.recognition,
        growth: state.growth,
        opportunity: state.opportunity,
        frequency: state.frequency,
        enabledDrivers: state.enabledDrivers,
      },
    };
  } catch (error) {
    console.error('Failed to get desire state:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get desire state');
  }
});









