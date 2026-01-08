/**
 * PACK 413 — Panic Modes & Ops Playbooks
 * 
 * Pre-defined panic modes with activation/deactivation logic and playbook actions.
 * Integrates with PACK 412 (launch orchestration), 301 (growth), 411 (store defense).
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  PanicModeId,
  PanicModeConfig,
  ActivePanicMode,
  PanicModeProposal,
  ActivatePanicModeRequest,
  DeactivatePanicModeRequest,
  LaunchStage,
} from '../../shared/types/pack413-kpi';

const db = admin.firestore();

/**
 * Default panic mode configurations
 */
const DEFAULT_PANIC_MODES: Omit<PanicModeConfig, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'SLOWDOWN_GROWTH',
    label: 'Slowdown Growth',
    description: 'Growth KPIs fine, but infrastructure/operations overloaded',
    allowedStages: ['SOFT_LIVE', 'FULL_LIVE'],
    autoTriggers: [],
    manualOnly: true,
    recommendedActions: [
      'Reduce acquisition spend',
      'Lower referral bonuses temporarily',
      'Limit new registrations in selected regions via PACK 412 traffic caps',
      'Pause non-essential marketing campaigns',
      'Throttle invitation system',
    ],
    integrationsAffected: ['PACK_412', 'PACK_301', 'PACK_301A'],
  },
  {
    id: 'SAFETY_LOCKDOWN',
    label: 'Safety Lockdown',
    description: 'Spike in safety incidents, abuse, or panic button triggers',
    allowedStages: ['SOFT_LIVE', 'FULL_LIVE'],
    autoTriggers: ['ALERT_SAFETY_INCIDENT_SPIKE', 'ALERT_PANIC_BUTTON_SPIKE'],
    manualOnly: false,
    recommendedActions: [
      'Auto-limit high-risk features (events, video calls) in affected regions',
      'Force age/ID re-verification in offending regions',
      'Tighten content filters and moderation',
      'Increase AI moderation sensitivity',
      'Deploy additional human moderators',
      'Enable stricter matching algorithms',
    ],
    integrationsAffected: ['PACK_302', 'PACK_412', 'PACK_159'],
  },
  {
    id: 'PAYMENT_PROTECT',
    label: 'Payment Protection',
    description: 'Payment errors, refund spikes, or suspected fraud',
    allowedStages: ['SOFT_LIVE', 'FULL_LIVE'],
    autoTriggers: ['ALERT_PAYMENT_ERROR_SPIKE', 'ALERT_REFUND_SPIKE'],
    manualOnly: false,
    recommendedActions: [
      'Temporarily disable high-risk payment methods',
      'Add extra verification for high-value transactions',
      'Restrict payouts in suspicious regions',
      'Enable enhanced fraud detection',
      'Pause token sales in affected countries',
      'Review and freeze suspicious accounts',
    ],
    integrationsAffected: ['PACK_302', 'PACK_174', 'Wallet_Packs'],
  },
  {
    id: 'SUPPORT_OVERLOAD',
    label: 'Support Overload',
    description: 'Support backlog spikes, SLA failing',
    allowedStages: ['SOFT_LIVE', 'FULL_LIVE'],
    autoTriggers: ['ALERT_SUPPORT_BACKLOG_CRITICAL', 'ALERT_SLA_BREACH_SPIKE'],
    manualOnly: false,
    recommendedActions: [
      'Temporarily rate-limit new feature rollouts',
      'Reduce notification campaign intensity',
      'Display "known issues" banners in-app',
      'Automatically slow new launches in PACK 412',
      'Enable automated response templates',
      'Deploy backup support agents',
      'Escalate to emergency support channels',
    ],
    integrationsAffected: ['PACK_300', 'PACK_300A', 'PACK_300B', 'PACK_412', 'PACK_301'],
  },
  {
    id: 'STORE_DEFENSE',
    label: 'Store Defense',
    description: 'Negative rating attack or review bombing detected',
    allowedStages: ['FULL_LIVE'],
    autoTriggers: ['ALERT_RATING_DROP_CRITICAL', 'ALERT_REVIEW_BOMBING'],
    manualOnly: false,
    recommendedActions: [
      'Activate PACK 411 defensive patterns',
      'Ramp up in-app rating prompts for happy users',
      'Pause high-risk experiments',
      'Contact app stores for review validation',
      'Deploy targeted satisfaction campaigns',
      'Analyze negative reviews for legitimate issues',
    ],
    integrationsAffected: ['PACK_411', 'PACK_301B', 'PACK_412'],
  },
];

/**
 * Initialize panic mode configs (run once during deployment)
 */
export const pack413_initPanicModes = functions.https.onCall(async (data, context) => {
  if (!context.auth || !await isAdmin(context.auth.uid)) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  try {
    const batch = db.batch();
    const now = new Date().toISOString();

    for (const mode of DEFAULT_PANIC_MODES) {
      const ref = db.collection('panicModeConfigs').doc(mode.id);
      batch.set(ref, {
        ...mode,
        createdAt: now,
        updatedAt: now,
      });
    }

    await batch.commit();

    return { success: true, message: `Initialized ${DEFAULT_PANIC_MODES.length} panic mode configurations` };
  } catch (error) {
    console.error('Error initializing panic modes:', error);
    throw new functions.https.HttpsError('internal', 'Failed to initialize panic modes');
  }
});

/**
 * Propose panic mode activation (called by alert system or admins)
 */
export const pack413_proposePanicModeActivation = functions.https.onCall(async (data, context) => {
  const { modeId, reason, triggeringAlerts = [], affectedRegions, userId } = data;

  if (!modeId || !reason) {
    throw new functions.https.HttpsError('invalid-argument', 'modeId and reason are required');
  }

  try {
    // Check if mode config exists
    const configDoc = await db.collection('panicModeConfigs').doc(modeId).get();
    if (!configDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Panic mode configuration not found');
    }

    const config = configDoc.data() as PanicModeConfig;

    // Check if mode is already active
    const activeQuery = await db.collection('activePanicModes')
      .where('modeId', '==', modeId)
      .where('deactivatedAt', '==', null)
      .limit(1)
      .get();

    if (!activeQuery.empty) {
      return { success: false, message: 'Panic mode already active' };
    }

    // Create proposal
    const proposalId = db.collection('panicModeProposals').doc().id;
    const proposal: PanicModeProposal = {
      id: proposalId,
      modeId: modeId as PanicModeId,
      proposedAt: new Date().toISOString(),
      proposedBy: userId || (context.auth ? 'USER' : 'SYSTEM'),
      reason,
      triggeringAlerts: triggeringAlerts || [],
      affectedRegions,
      autoApprove: config.manualOnly ? false : triggeringAlerts.length > 0,
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour TTL
      status: 'PENDING',
    };

    await db.collection('panicModeProposals').doc(proposalId).set(proposal);

    // Send notification to admins
    await db.collection('notifications').add({
      type: 'PANIC_MODE_PROPOSAL',
      channel: 'admin-launch-control',
      severity: 'CRITICAL',
      title: `Panic Mode Proposed: ${config.label}`,
      body: `${proposal.proposedBy} proposes activating ${config.label}. Reason: ${reason}`,
      data: proposal,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, proposalId, message: 'Panic mode activation proposed' };
  } catch (error) {
    console.error('Error proposing panic mode:', error);
    throw new functions.https.HttpsError('internal', 'Failed to propose panic mode');
  }
});

/**
 * Activate panic mode (admin only)
 */
export const pack413_activatePanicMode = functions.https.onCall(async (data: ActivatePanicModeRequest, context) => {
  if (!context.auth || !await isAdmin(context.auth.uid)) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { modeId, reason, regionIds, metadata } = data;

  if (!modeId || !reason) {
    throw new functions.https.HttpsError('invalid-argument', 'modeId and reason are required');
  }

  try {
    // Verify mode config exists
    const configDoc = await db.collection('panicModeConfigs').doc(modeId).get();
    if (!configDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Panic mode configuration not found');
    }

    const config = configDoc.data() as PanicModeConfig;

    // Check if already active
    const activeQuery = await db.collection('activePanicModes')
      .where('modeId', '==', modeId)
      .where('deactivatedAt', '==', null)
      .limit(1)
      .get();

    if (!activeQuery.empty) {
      throw new functions.https.HttpsError('already-exists', 'Panic mode already active');
    }

    // Verify current launch stage allows this mode
    const currentStage = await getCurrentLaunchStage();
    if (currentStage && !config.allowedStages.includes(currentStage as LaunchStage)) {
      throw new functions.https.HttpsError('failed-precondition', `Panic mode not allowed in ${currentStage} stage`);
    }

    // Create active panic mode record
    const activeModeId = db.collection('activePanicModes').doc().id;
    const activeMode: ActivePanicMode = {
      id: activeModeId,
      modeId: modeId as PanicModeId,
      activatedAt: new Date().toISOString(),
      activatedBy: context.auth.uid,
      reason,
      regionIds,
      autoActivated: false,
      metadata,
    };

    await db.collection('activePanicModes').doc(activeModeId).set(activeMode);

    // Log to audit (PACK 296)
    await db.collection('auditLogs').add({
      action: 'PANIC_MODE_ACTIVATED',
      actorId: context.auth.uid,
      actorType: 'USER',
      resource: 'PANIC_MODE',
      resourceId: activeModeId,
      details: {
        modeId,
        reason,
        regionIds,
        config,
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send notification
    await db.collection('notifications').add({
      type: 'PANIC_MODE_ACTIVATED',
      channel: 'admin-launch-control',
      severity: 'CRITICAL',
      title: `⚠️ Panic Mode Activated: ${config.label}`,
      body: `${reason}. Affected regions: ${regionIds?.join(', ') || 'All'}`,
      data: activeMode,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Execute panic mode integrations
    await executePanicModeActions(modeId, regionIds);

    return { success: true, activeModeId, message: `Panic mode ${config.label} activated` };
  } catch (error) {
    console.error('Error activating panic mode:', error);
    throw new functions.https.HttpsError('internal', 'Failed to activate panic mode');
  }
});

/**
 * Deactivate panic mode (admin only)
 */
export const pack413_deactivatePanicMode = functions.https.onCall(async (data: DeactivatePanicModeRequest, context) => {
  if (!context.auth || !await isAdmin(context.auth.uid)) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { modeId, reason, metadata } = data;

  if (!modeId || !reason) {
    throw new functions.https.HttpsError('invalid-argument', 'modeId and reason are required');
  }

  try {
    // Find active mode
    const activeQuery = await db.collection('activePanicModes')
      .where('modeId', '==', modeId)
      .where('deactivatedAt', '==', null)
      .limit(1)
      .get();

    if (activeQuery.empty) {
      throw new functions.https.HttpsError('not-found', 'No active panic mode found');
    }

    const activeModeDoc = activeQuery.docs[0];
    const activeMode = activeModeDoc.data() as ActivePanicMode;

    // Update with deactivation info
    await activeModeDoc.ref.update({
      deactivatedAt: new Date().toISOString(),
      deactivatedBy: context.auth.uid,
      deactivationReason: reason,
      metadata: { ...activeMode.metadata, ...metadata },
    });

    // Log to audit
    await db.collection('auditLogs').add({
      action: 'PANIC_MODE_DEACTIVATED',
      actorId: context.auth.uid,
      actorType: 'USER',
      resource: 'PANIC_MODE',
      resourceId: activeMode.id,
      details: {
        modeId,
        reason,
        activatedAt: activeMode.activatedAt,
        deactivatedAt: new Date().toISOString(),
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send notification
    await db.collection('notifications').add({
      type: 'PANIC_MODE_DEACTIVATED',
      channel: 'admin-launch-control',
      severity: 'INFO',
      title: `✅ Panic Mode Deactivated: ${modeId}`,
      body: `Deactivation reason: ${reason}`,
      data: { modeId, reason },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Revert panic mode actions
    await revertPanicModeActions(modeId, activeMode.regionIds);

    return { success: true, message: `Panic mode ${modeId} deactivated` };
  } catch (error) {
    console.error('Error deactivating panic mode:', error);
    throw new functions.https.HttpsError('internal', 'Failed to deactivate panic mode');
  }
});

/**
 * Get all active panic modes
 */
export const pack413_getActivePanicModes = functions.https.onCall(async (data, context) => {
  if (!context.auth || !await isAdminOrService(context.auth.uid)) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  try {
    const snapshot = await db.collection('activePanicModes')
      .where('deactivatedAt', '==', null)
      .orderBy('activatedAt', 'desc')
      .get();

    const activeModes = snapshot.docs.map(doc => doc.data() as ActivePanicMode);

    return { success: true, data: activeModes };
  } catch (error) {
    console.error('Error fetching active panic modes:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch active panic modes');
  }
});

/**
 * Get panic mode history
 */
export const pack413_getPanicModeHistory = functions.https.onCall(async (data, context) => {
  if (!context.auth || !await isAdminOrService(context.auth.uid)) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { limit = 50, modeId } = data;

  try {
    let query = db.collection('activePanicModes')
      .orderBy('activatedAt', 'desc')
      .limit(limit);

    if (modeId) {
      query = query.where('modeId', '==', modeId) as any;
    }

    const snapshot = await query.get();
    const history = snapshot.docs.map(doc => doc.data() as ActivePanicMode);

    return { success: true, data: history };
  } catch (error) {
    console.error('Error fetching panic mode history:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch panic mode history');
  }
});

/**
 * Execute panic mode integration actions
 */
async function executePanicModeActions(modeId: string, regionIds?: string[]): Promise<void> {
  console.log(`Executing panic mode actions for ${modeId}...`);

  switch (modeId) {
    case 'SLOWDOWN_GROWTH':
      // Signal PACK 412 to reduce traffic caps
      await db.collection('systemCommands').add({
        type: 'PACK_412_REDUCE_TRAFFIC',
        regionIds: regionIds || ['ALL'],
        params: { reductionPct: 50 },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Signal PACK 301 to reduce campaign intensity
      await db.collection('systemCommands').add({
        type: 'PACK_301_REDUCE_CAMPAIGNS',
        params: { intensityMultiplier: 0.5 },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      break;

    case 'SAFETY_LOCKDOWN':
      // Signal PACK 412 to disable risky features in regions
      await db.collection('systemCommands').add({
        type: 'PACK_412_DISABLE_FEATURES',
        regionIds: regionIds || ['ALL'],
        params: { features: ['VIDEO_CALLS', 'EVENTS', 'LOCATION_SHARING'] },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Signal PACK 302 to increase moderation sensitivity
      await db.collection('systemCommands').add({
        type: 'PACK_302_INCREASE_SENSITIVITY',
        params: { level: 'HIGH' },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      break;

    case 'PAYMENT_PROTECT':
      // Signal wallet/payment systems to enable enhanced verification
      await db.collection('systemCommands').add({
        type: 'PAYMENT_ENHANCED_VERIFICATION',
        regionIds: regionIds || ['ALL'],
        params: { thresholdAmount: 100 },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      break;

    case 'SUPPORT_OVERLOAD':
      // Signal PACK 412 to slow rollouts
      await db.collection('systemCommands').add({
        type: 'PACK_412_PAUSE_ROLLOUTS',
        regionIds: regionIds || ['ALL'],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Signal PACK 300 to enable auto-responses
      await db.collection('systemCommands').add({
        type: 'PACK_300_ENABLE_AUTO_RESPONSES',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      break;

    case 'STORE_DEFENSE':
      // Signal PACK 411 to activate defensive patterns
      await db.collection('systemCommands').add({
        type: 'PACK_411_ACTIVATE_DEFENSE',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Signal PACK 301B to ramp up rating prompts
      await db.collection('systemCommands').add({
        type: 'PACK_301B_INCREASE_RATING_PROMPTS',
        params: { multiplier: 3 },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      break;
  }

  console.log(`Panic mode actions executed for ${modeId}`);
}

/**
 * Revert panic mode integration actions
 */
async function revertPanicModeActions(modeId: string, regionIds?: string[]): Promise<void> {
  console.log(`Reverting panic mode actions for ${modeId}...`);

  switch (modeId) {
    case 'SLOWDOWN_GROWTH':
      await db.collection('systemCommands').add({
        type: 'PACK_412_RESTORE_TRAFFIC',
        regionIds: regionIds || ['ALL'],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('systemCommands').add({
        type: 'PACK_301_RESTORE_CAMPAIGNS',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      break;

    case 'SAFETY_LOCKDOWN':
      await db.collection('systemCommands').add({
        type: 'PACK_412_RESTORE_FEATURES',
        regionIds: regionIds || ['ALL'],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('systemCommands').add({
        type: 'PACK_302_RESTORE_SENSITIVITY',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      break;

    case 'PAYMENT_PROTECT':
      await db.collection('systemCommands').add({
        type: 'PAYMENT_RESTORE_NORMAL',
        regionIds: regionIds || ['ALL'],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      break;

    case 'SUPPORT_OVERLOAD':
      await db.collection('systemCommands').add({
        type: 'PACK_412_RESUME_ROLLOUTS',
        regionIds: regionIds || ['ALL'],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('systemCommands').add({
        type: 'PACK_300_DISABLE_AUTO_RESPONSES',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      break;

    case 'STORE_DEFENSE':
      await db.collection('systemCommands').add({
        type: 'PACK_411_DEACTIVATE_DEFENSE',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('systemCommands').add({
        type: 'PACK_301B_RESTORE_RATING_PROMPTS',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      break;
  }

  console.log(`Panic mode actions reverted for ${modeId}`);
}

/**
 * Get current launch stage from PACK 412
 */
async function getCurrentLaunchStage(): Promise<string | undefined> {
  const doc = await db.collection('launchOrchestration').doc('globalState').get();
  return doc.exists ? doc.data()?.currentStage : undefined;
}

/**
 * Check if user is admin
 */
async function isAdmin(uid: string): Promise<boolean> {
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    return userDoc.data()?.role === 'ADMIN';
  } catch {
    return false;
  }
}

/**
 * Check if user is admin or service account
 */
async function isAdminOrService(uid: string): Promise<boolean> {
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    return userData?.role === 'ADMIN' || userData?.role === 'SERVICE';
  } catch {
    return false;
  }
}
