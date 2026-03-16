import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 266: Smart Supporter CRM - Cloud Functions Endpoints
 * 
 * HTTP Callable Functions for the Supporter CRM system.
 * These functions are called from the frontend to manage supporter relationships,
 * generate insights, and execute CRM actions.
 * 
 * SECURITY:
 * - All functions require authentication
 * - Creators must have earnOnChat enabled
 * - Privacy guardrails enforced
 * - No bulk operations allowed
 * - Audit trail maintained
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  segmentSupporters,
  generateInboxEntries,
  buildSupporterProfile,
  validateCRMAction,
  sanitizeSupporterData,
  calculateBehavioralSignals
} from './pack266-supporter-crm-engine';
import {
  CRMActionType,
  AlertType,
  SupporterSegment,
  SmartAlert
} from './pack266-supporter-crm-types';
import { admin, auth, functions, timestamp, onSchedule } from './runtime';

const db = getFirestore();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Verify earner has earnOn enabled
 */
async function verifyCreatorAccess(userId: string): Promise<boolean> {
  const userDoc = await db.doc(`users/${userId}`).get();
  const user = userDoc.data();
  return user?.earnOnChat === true;
}

/**
 * Log CRM activity for audit trail
 */
async function logCRMActivity(
  earnerId: string,
  actionType: string,
  metadata: any
): Promise<void> {
  await db.collection(`crmActivityLog/${earnerId}/activities`).add({
    earnerId,
    actionType,
    metadata: sanitizeSupporterData(metadata),
    timestamp: Timestamp.now()
  });
}

// ============================================================================
// Supporter Segmentation
// ============================================================================

/**
 * Segment all supporters for a earner
 * This should be called periodically (daily) or on-demand
 */
export const segmentCreatorSupporters = onCall(
  { maxInstances: 10 },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const earnerId = data.earnerId || auth.uid;

    // Verify earner access
    if (earnerId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot segment supporters for another earner');
    }

    const hasAccess = await verifyCreatorAccess(earnerId);
    if (!hasAccess) {
      throw new HttpsError(
        'permission-denied',
        'Creator must have earnOn enabled to use CRM features'
      );
    }

    try {
      logger.info(`Segmenting supporters for earner: ${earnerId}`);
      
      const segments = await segmentSupporters(db, earnerId);

      await logCRMActivity(earnerId, 'segment_supporters', {
        totalSupporters: segments.length,
        vips: segments.filter(s => s.segment === 'vip').length,
        hotLeads: segments.filter(s => s.segment === 'hot_lead').length,
      });

      return {
        success: true,
        count: segments.length,
        segments: {
          vip: segments.filter(s => s.segment === 'vip').length,
          hot_leads: segments.filter(s => s.segment === 'hot_lead').length,
          active: segments.filter(s => s.segment === 'active').length,
          dormant: segments.filter(s => s.segment === 'dormant').length,
          cold: segments.filter(s => s.segment === 'cold').length,
        },
        timestamp: Timestamp.now()
      };
    } catch (error: any) {
      logger.error('Error segmenting supporters:', error);
      throw new HttpsError('internal', `Failed to segment supporters: ${error.message}`);
    }
  }
);

// ============================================================================
// CRM Inbox
// ============================================================================

/**
 * Get CRM inbox entries for a specific tab
 */
export const getCRMInbox = onCall(
  { maxInstances: 10 },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const earnerId = auth.uid;
    const { tab, limit = 50 } = data;

    const hasAccess = await verifyCreatorAccess(earnerId);
    if (!hasAccess) {
      throw new HttpsError(
        'permission-denied',
        'Creator must have earnOn enabled to use CRM features'
      );
    }

    if (!['vip', 'hot_leads', 'all_supporters', 'dormant', 'new'].includes(tab)) {
      throw new HttpsError('invalid-argument', 'Invalid inbox tab');
    }

    try {
      logger.info(`Getting CRM inbox for earner ${earnerId}, tab: ${tab}`);

      const entries = await generateInboxEntries(db, earnerId, tab, limit);

      console.log('Scheduled job result:', {
        success: true,
        entries: entries.map(sanitizeSupporterData),
        count: entries.length,
        hasMore: entries.length >= limit,
        timestamp: Timestamp.now()
      });


      return;
    } catch (error: any) {
      logger.error('Error getting CRM inbox:', error);
      throw new HttpsError('internal', `Failed to get inbox: ${error.message}`);
    }
  }
);

/**
 * Refresh inbox for a specific tab
 */
export const refreshInboxTab = onCall(
  { maxInstances: 10 },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const earnerId = auth.uid;
    const { tab } = data;

    const hasAccess = await verifyCreatorAccess(earnerId);
    if (!hasAccess) {
      throw new HttpsError(
        'permission-denied',
        'Creator must have earnOn enabled to use CRM features'
      );
    }

    try {
      // Re-generate entries for this tab
      await generateInboxEntries(db, earnerId, tab);

      return {
        success: true,
        message: `Inbox tab '${tab}' refreshed`,
        timestamp: Timestamp.now()
      };
    } catch (error: any) {
      logger.error('Error refreshing inbox tab:', error);
      throw new HttpsError('internal', `Failed to refresh inbox: ${error.message}`);
    }
  }
);

// ============================================================================
// Supporter Profiles
// ============================================================================

/**
 * Get detailed supporter profile with analytics
 */
export const getSupporterProfile = onCall(
  { maxInstances: 10 },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const earnerId = auth.uid;
    const { supporterId } = data;

    if (!supporterId) {
      throw new HttpsError('invalid-argument', 'supporterId is required');
    }

    const hasAccess = await verifyCreatorAccess(earnerId);
    if (!hasAccess) {
      throw new HttpsError(
        'permission-denied',
        'Creator must have earnOn enabled to use CRM features'
      );
    }

    try {
      logger.info(`Getting supporter profile for earner ${earnerId}, supporter: ${supporterId}`);

      const profile = await buildSupporterProfile(db, earnerId, supporterId);

      await logCRMActivity(earnerId, 'view_supporter_profile', {
        supporterId
      });

      console.log('Scheduled job result:', {
        success: true,
        profile: sanitizeSupporterData(profile),
        timestamp: Timestamp.now()
      });


      return;
    } catch (error: any) {
      logger.error('Error getting supporter profile:', error);
      throw new HttpsError('internal', `Failed to get profile: ${error.message}`);
    }
  }
);

/**
 * Get supporter behavioral signals (real-time)
 */
export const getSupporterSignals = onCall(
  { maxInstances: 10 },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const earnerId = auth.uid;
    const { supporterId } = data;

    if (!supporterId) {
      throw new HttpsError('invalid-argument', 'supporterId is required');
    }

    const hasAccess = await verifyCreatorAccess(earnerId);
    if (!hasAccess) {
      throw new HttpsError(
        'permission-denied',
        'Creator must have earnOn enabled to use CRM features'
      );
    }

    try {
      const signals = await calculateBehavioralSignals(db, earnerId, supporterId);

      console.log('Scheduled job result:', {
        success: true,
        signals: sanitizeSupporterData(signals),
        timestamp: Timestamp.now()
      });


      return;
    } catch (error: any) {
      logger.error('Error getting supporter signals:', error);
      throw new HttpsError('internal', `Failed to get signals: ${error.message}`);
    }
  }
);

// ============================================================================
// CRM Actions
// ============================================================================

/**
 * Execute a CRM action
 */
export const executeCRMAction = onCall(
  { maxInstances: 10 },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const earnerId = auth.uid;
    const { actionType, supporterId, metadata = {} } = data;

    if (!actionType || !supporterId) {
      throw new HttpsError('invalid-argument', 'actionType and supporterId are required');
    }

    const hasAccess = await verifyCreatorAccess(earnerId);
    if (!hasAccess) {
      throw new HttpsError(
        'permission-denied',
        'Creator must have earnOn enabled to use CRM features'
      );
    }

    // Validate action
    const validation = validateCRMAction(actionType as CRMActionType);
    if (!validation.valid) {
      throw new HttpsError('invalid-argument', validation.reason || 'Invalid action');
    }

    try {
      logger.info(`Executing CRM action: ${actionType} for earner ${earnerId}, supporter: ${supporterId}`);

      const actionRef = db.collection('crmActions').doc();
      
      const action = {
        actionId: actionRef.id,
        type: actionType,
        earnerId,
        supporterId,
        status: 'pending',
        metadata: sanitizeSupporterData(metadata),
        createdAt: Timestamp.now()
      };

      await actionRef.set(action);

      // Execute the action based on type
      let result;
      switch (actionType) {
        case 'dm_reminder':
          result = await executeDMReminder(earnerId, supporterId);
          break;
        case 'invite_to_live':
          result = await executeInviteToLive(earnerId, supporterId, metadata);
          break;
        case 'offer_fan_club':
          result = await executeOfferFanClub(earnerId, supporterId, metadata);
          break;
        case 'event_early_access':
          result = await executeEventEarlyAccess(earnerId, supporterId, metadata);
          break;
        case 'prioritize_reply':
          result = await executePrioritizeReply(earnerId, supporterId);
          break;
        default:
          throw new Error('Unknown action type');
      }

      // Update action with result
      await actionRef.update({
        status: 'executed',
        executedAt: Timestamp.now(),
        result
      });

      await logCRMActivity(earnerId, actionType, {
        supporterId,
        result
      });

      console.log('Scheduled job result:', {
        success: true,
        actionId: actionRef.id,
        result,
        timestamp: Timestamp.now()
      });


      return;
    } catch (error: any) {
      logger.error('Error executing CRM action:', error);
      throw new HttpsError('internal', `Failed to execute action: ${error.message}`);
    }
  }
);

// Action execution helpers
async function executeDMReminder(earnerId: string, supporterId: string) {
  // Mark the supporter's chat for priority attention
  const chatsQuery = await db
    .collection('chats')
    .where('participants', 'array-contains', supporterId)
    .where('roles.earnerId', '==', earnerId)
    .limit(1)
    .get();

  if (!chatsQuery.empty) {
    const chatDoc = chatsQuery.docs[0];
    await chatDoc.ref.update({
      priority: 'high',
      prioritySetAt: Timestamp.now(),
      prioritySetBy: 'crm_action'
    });
  }

  return {
    executed: true,
    message: 'Chat marked for priority attention'
  };
}

async function executeInviteToLive(earnerId: string, supporterId: string, metadata: any) {
  // Create a notification for the supporter
  await db.collection('notifications').add({
    userId: supporterId,
    type: 'live_invite',
    title: 'Live Stream Invitation',
    message: 'You\'re invited to an upcoming live stream!',
    earnerId,
    liveStreamId: metadata.liveStreamId,
    scheduledFor: metadata.scheduledFor,
    createdAt: Timestamp.now(),
    read: false
  });

  return {
    executed: true,
    message: 'Live stream invitation sent'
  };
}

async function executeOfferFanClub(earnerId: string, supporterId: string, metadata: any) {
  // Create a notification with fan club offer
  await db.collection('notifications').add({
    userId: supporterId,
    type: 'fan_club_offer',
    title: 'Exclusive Fan Club Invitation',
    message: 'Join my Fan Club for exclusive content and perks!',
    earnerId,
    suggestedTier: metadata.suggestedTier,
    createdAt: Timestamp.now(),
    read: false
  });

  return {
    executed: true,
    message: 'Fan club offer sent'
  };
}

async function executeEventEarlyAccess(earnerId: string, supporterId: string, metadata: any) {
  // Grant early access to event
  await db.collection('eventEarlyAccess').add({
    eventId: metadata.eventId,
    userId: supporterId,
    earnerId,
    grantedAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Timestamp.now().toMillis() + 24 * 60 * 60 * 1000)
  });

  // Send notification
  await db.collection('notifications').add({
    userId: supporterId,
    type: 'event_early_access',
    title: 'Early Access Granted',
    message: 'You have early access to an exclusive event!',
    earnerId,
    eventId: metadata.eventId,
    createdAt: Timestamp.now(),
    read: false
  });

  return {
    executed: true,
    message: 'Early access granted and notification sent'
  };
}

async function executePrioritizeReply(earnerId: string, supporterId: string) {
  // Add to priority reply queue
  await db.doc(`priorityReplies/${earnerId}_${supporterId}`).set({
    earnerId,
    supporterId,
    prioritizedAt: Timestamp.now(),
    processed: false
  });

  return {
    executed: true,
    message: 'Supporter marked for priority reply'
  };
}

// ============================================================================
// Smart Alerts
// ============================================================================

/**
 * Get smart alerts for a earner
 */
export const getSmartAlerts = onCall(
  { maxInstances: 10 },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const earnerId = auth.uid;
    const { unreadOnly = false, limit = 50 } = data;

    const hasAccess = await verifyCreatorAccess(earnerId);
    if (!hasAccess) {
      throw new HttpsError(
        'permission-denied',
        'Creator must have earnOn enabled to use CRM features'
      );
    }

    try {
      let query = db
        .collection(`smartAlerts/${earnerId}/alerts`)
        .orderBy('createdAt', 'desc')
        .limit(limit);

      if (unreadOnly) {
        query = query.where('readAt', '==', null) as any;
      }

      const snapshot = await query.get();
      const alerts = snapshot.docs.map(doc => ({
        alertId: doc.id,
        ...sanitizeSupporterData(doc.data())
      }));

      const unreadCount = unreadOnly 
        ? alerts.length
        : alerts.filter(a => !a.readAt).length;

      console.log('Scheduled job result:', {
        success: true,
        alerts,
        count: alerts.length,
        unreadCount,
        timestamp: Timestamp.now()
      });


      return;
    } catch (error: any) {
      logger.error('Error getting smart alerts:', error);
      throw new HttpsError('internal', `Failed to get alerts: ${error.message}`);
    }
  }
);

/**
 * Mark alert as read
 */
export const markAlertRead = onCall(
  { maxInstances: 10 },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const earnerId = auth.uid;
    const { alertId } = data;

    if (!alertId) {
      throw new HttpsError('invalid-argument', 'alertId is required');
    }

    const hasAccess = await verifyCreatorAccess(earnerId);
    if (!hasAccess) {
      throw new HttpsError(
        'permission-denied',
        'Creator must have earnOn enabled to use CRM features'
      );
    }

    try {
      await db.doc(`smartAlerts/${earnerId}/alerts/${alertId}`).update({
        readAt: Timestamp.now()
      });

      console.log('Scheduled job result:', {
        success: true,
        timestamp: Timestamp.now()
      });


      return;
    } catch (error: any) {
      logger.error('Error marking alert as read:', error);
      throw new HttpsError('internal', `Failed to mark alert: ${error.message}`);
    }
  }
);

/**
 * Dismiss an alert
 */
export const dismissAlert = onCall(
  { maxInstances: 10 },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const earnerId = auth.uid;
    const { alertId } = data;

    if (!alertId) {
      throw new HttpsError('invalid-argument', 'alertId is required');
    }

    const hasAccess = await verifyCreatorAccess(earnerId);
    if (!hasAccess) {
      throw new HttpsError(
        'permission-denied',
        'Creator must have earnOn enabled to use CRM features'
      );
    }

    try {
      await db.doc(`smartAlerts/${earnerId}/alerts/${alertId}`).update({
        dismissedAt: Timestamp.now()
      });

      console.log('Scheduled job result:', {
        success: true,
        timestamp: Timestamp.now()
      });


      return;
    } catch (error: any) {
      logger.error('Error dismissing alert:', error);
      throw new HttpsError('internal', `Failed to dismiss alert: ${error.message}`);
    }
  }
);

// ============================================================================
// CRM Settings
// ============================================================================

/**
 * Get CRM settings for a earner
 */
export const getCRMSettings = onCall(
  { maxInstances: 10 },
  async (request) => {
    const { auth } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const earnerId = auth.uid;

    const hasAccess = await verifyCreatorAccess(earnerId);
    if (!hasAccess) {
      throw new HttpsError(
        'permission-denied',
        'Creator must have earnOn enabled to use CRM features'
      );
    }

    try {
      const settingsDoc = await db.doc(`crmSettings/${earnerId}`).get();

      if (!settingsDoc.exists) {
        // Create default settings
        const defaultSettings = {
          earnerId,
          enabled: true,
          preferences: {
            enableAlerts: true,
            alertTypes: ['vip_online', 'hot_lead_active', 'dormant_reactivation'],
            defaultTab: 'hot_leads',
            sortPreference: 'conversion_probability',
            vipThresholdTokens: 1000,
            dormantThresholdDays: 7,
            coldThresholdDays: 30
          },
          automations: {
            autoTagVIP: true,
            autoAlertHotLeads: true,
            autoRemindDormant: false
          },
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        };

        await db.doc(`crmSettings/${earnerId}`).set(defaultSettings);
        console.log('Scheduled job result:', {
          success: true,
          settings: defaultSettings,
          timestamp: Timestamp.now()
        });

        return;
      }

      console.log('Scheduled job result:', {
        success: true,
        settings: settingsDoc.data(),
        timestamp: Timestamp.now()
      });


      return;
    } catch (error: any) {
      logger.error('Error getting CRM settings:', error);
      throw new HttpsError('internal', `Failed to get settings: ${error.message}`);
    }
  }
);

/**
 * Update CRM settings
 */
export const updateCRMSettings = onCall(
  { maxInstances: 10 },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const earnerId = auth.uid;
    const { settings } = data;

    if (!settings) {
      throw new HttpsError('invalid-argument', 'settings is required');
    }

    const hasAccess = await verifyCreatorAccess(earnerId);
    if (!hasAccess) {
      throw new HttpsError(
        'permission-denied',
        'Creator must have earnOn enabled to use CRM features'
      );
    }

    try {
      await db.doc(`crmSettings/${earnerId}`).update({
        ...settings,
        updatedAt: Timestamp.now()
      });

      await logCRMActivity(earnerId, 'update_settings', {
        changes: Object.keys(settings)
      });

      console.log('Scheduled job result:', {
        success: true,
        message: 'Settings updated',
        timestamp: Timestamp.now()
      });


      return;
    } catch (error: any) {
      logger.error('Error updating CRM settings:', error);
      throw new HttpsError('internal', `Failed to update settings: ${error.message}`);
    }
  }
);

// ============================================================================
// Scheduled Functions
// ============================================================================

/**
 * Daily supporter segmentation for all active earners
 * Runs at 3 AM UTC
 */
export const dailySupporterSegmentation = onSchedule(
  { schedule: '0 3 * * *', timeZone: 'UTC' },
  async () => {
    logger.info('Starting daily supporter segmentation');

    try {
      // Get all earners with earnOn enabled
      const earnersQuery = await db
        .collection('users')
        .where('earnOnChat', '==', true)
        .get();

      let processedCount = 0;
      let errorCount = 0;

      for (const doc of earnersQuery.docs) {
        const earnerId = doc.id;
        
        try {
          await segmentSupporters(db, earnerId);
          processedCount++;
          logger.info(`Segmented supporters for earner: ${earnerId}`);
        } catch (error: any) {
          errorCount++;
          logger.error(`Error segmenting for earner ${earnerId}:`, error);
        }
      }

      logger.info(`Daily segmentation complete. Processed: ${processedCount}, Errors: ${errorCount}`);
    } catch (error: any) {
      logger.error('Error in daily segmentation:', error);
    }
  }
);

/**
 * Generate smart alerts based on supporter activity
 * Runs every hour
 */
export const generateSmartAlerts = onSchedule(
  { schedule: 'every 1 hours' },
  async () => {
    logger.info('Generating smart alerts');

    try {
      // Get all earners with CRM enabled
      const settingsQuery = await db
        .collection('crmSettings')
        .where('enabled', '==', true)
        .where('preferences.enableAlerts', '==', true)
        .get();

      for (const settingsDoc of settingsQuery.docs) {
        const earnerId = settingsDoc.id;
        const settings = settingsDoc.data();

        try {
          // Check for VIP online
          if (settings.preferences.alertTypes.includes('vip_online')) {
            await checkVIPOnline(earnerId);
          }

          // Check for hot lead activity
          if (settings.preferences.alertTypes.includes('hot_lead_active')) {
            await checkHotLeadActivity(earnerId);
          }

          // Check for dormant reactivation
          if (settings.preferences.alertTypes.includes('dormant_reactivation')) {
            await checkDormantReactivation(earnerId);
          }
        } catch (error: any) {
          logger.error(`Error generating alerts for earner ${earnerId}:`, error);
        }
      }

      logger.info('Smart alerts generation complete');
    } catch (error: any) {
      logger.error('Error generating smart alerts:', error);
    }
  }
);

async function checkVIPOnline(earnerId: string) {
  // Get VIP supporters
  const vipsQuery = await db
    .collection(`supporterSegments/${earnerId}/supporters`)
    .where('segment', '==', 'vip')
    .get();

  for (const doc of vipsQuery.docs) {
    const supporter = doc.data();
    
    if (supporter.signals?.isCurrentlyOnline) {
      // Check if alert already sent recently
      const recentAlertQuery = await db
        .collection(`smartAlerts/${earnerId}/alerts`)
        .where('type', '==', 'vip_online')
        .where('supporterId', '==', supporter.supporterId)
        .where('createdAt', '>', Timestamp.fromMillis(Timestamp.now().toMillis() - 60 * 60 * 1000))
        .get();

      if (recentAlertQuery.empty) {
        // Create alert
        await db.collection(`smartAlerts/${earnerId}/alerts`).add({
          type: 'vip_online',
          earnerId,
          supporterId: supporter.supporterId,
          priority: 'urgent',
          message: `💎 VIP supporter is online now — high conversion probability`,
          actionable: true,
          suggestedAction: 'dm_reminder',
          metadata: {
            conversionProbability: supporter.conversionProbability,
            timeWindow: 'online now'
          },
          createdAt: Timestamp.now(),
          expiresAt: Timestamp.fromMillis(Timestamp.now().toMillis() + 2 * 60 * 60 * 1000)
        });
      }
    }
  }
}

async function checkHotLeadActivity(earnerId: string) {
  // Get hot leads
  const hotLeadsQuery = await db
    .collection(`supporterSegments/${earnerId}/supporters`)
    .where('segment', '==', 'hot_lead')
    .where('signals.isCurrentlyOnline', '==', true)
    .get();

  for (const doc of hotLeadsQuery.docs) {
    const supporter = doc.data();

    // Check if alert already sent recently
    const recentAlertQuery = await db
      .collection(`smartAlerts/${earnerId}/alerts`)
      .where('type', '==', 'hot_lead_active')
      .where('supporterId', '==', supporter.supporterId)
      .where('createdAt', '>', Timestamp.fromMillis(Timestamp.now().toMillis() - 60 * 60 * 1000))
      .get();

    if (recentAlertQuery.empty) {
      await db.collection(`smartAlerts/${earnerId}/alerts`).add({
        type: 'hot_lead_active',
        earnerId,
        supporterId: supporter.supporterId,
        priority: 'high',
        message: `🔥 High conversion lead is active now`,
        actionable: true,
        suggestedAction: 'dm_reminder',
        metadata: {
          conversionProbability: supporter.conversionProbability,
          estimatedRevenue: 100
        },
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Timestamp.now().toMillis() + 2 * 60 * 60 * 1000)
      });
    }
  }
}

async function checkDormantReactivation(earnerId: string) {
  // Get dormant supporters who recently viewed profile
  const dormantQuery = await db
    .collection(`supporterSegments/${earnerId}/supporters`)
    .where('segment', '==', 'dormant')
    .get();

  for (const doc of dormantQuery.docs) {
    const supporter = doc.data();

    // Check for recent profile view
    const recentViewQuery = await db
      .collection('profileViews')
      .where('viewerId', '==', supporter.supporterId)
      .where('profileOwnerId', '==', earnerId)
      .where('viewedAt', '>', Timestamp.fromMillis(Timestamp.now().toMillis() - 24 * 60 * 60 * 1000))
      .get();

    if (!recentViewQuery.empty) {
      // Check if alert already sent recently
      const recentAlertQuery = await db
        .collection(`smartAlerts/${earnerId}/alerts`)
        .where('type', '==', 'dormant_reactivation')
        .where('supporterId', '==', supporter.supporterId)
        .where('createdAt', '>', Timestamp.fromMillis(Timestamp.now().toMillis() - 24 * 60 * 60 * 1000))
        .get();

      if (recentAlertQuery.empty) {
        await db.collection(`smartAlerts/${earnerId}/alerts`).add({
          type: 'dormant_reactivation',
          earnerId,
          supporterId: supporter.supporterId,
          priority: 'medium',
          message: `🌙 Dormant supporter viewed your profile — reactivation opportunity`,
          actionable: true,
          suggestedAction: 'dm_reminder',
          metadata: {
            daysDormant: supporter.daysSinceLastActivity
          },
          createdAt: Timestamp.now(),
          expiresAt: Timestamp.fromMillis(Timestamp.now().toMillis() + 24 * 60 * 60 * 1000)
        });
      }
    }
  }
}
























