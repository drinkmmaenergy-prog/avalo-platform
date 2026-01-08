/**
 * PACK 428 — Kill-Switch Layer
 * 
 * Emergency shutdown capabilities for critical systems
 * 
 * Integration Points:
 * - PACK 293: Notifications to ops team
 * - PACK 296: Audit logs for all kill switch activations
 */

import * as admin from 'firebase-admin';
import { KillSwitch, KillSwitchKey } from './pack428-flags-types';

const db = admin.firestore();

/**
 * Initialize all required kill switches
 * Should be run on deployment
 */
export async function initializeKillSwitches(): Promise<void> {
  const killSwitches: Partial<KillSwitch>[] = [
    {
      key: KillSwitchKey.CHAT_GLOBAL,
      name: 'Global Chat Kill Switch',
      description: 'Disables all chat functionality across the platform',
      active: false,
      notifyOps: true
    },
    {
      key: KillSwitchKey.PAYMENTS_GLOBAL,
      name: 'Global Payments Kill Switch',
      description: 'Disables all payment processing (token purchases, subscriptions)',
      active: false,
      notifyOps: true
    },
    {
      key: KillSwitchKey.WITHDRAWALS_GLOBAL,
      name: 'Global Withdrawals Kill Switch',
      description: 'Disables all creator withdrawals and payouts',
      active: false,
      notifyOps: true
    },
    {
      key: KillSwitchKey.AI_COMPANIONS_GLOBAL,
      name: 'Global AI Companions Kill Switch',
      description: 'Disables all AI companion interactions',
      active: false,
      notifyOps: true
    },
    {
      key: KillSwitchKey.CALENDAR_BOOKINGS_GLOBAL,
      name: 'Global Calendar Bookings Kill Switch',
      description: 'Disables all calendar event bookings',
      active: false,
      notifyOps: true
    },
    {
      key: KillSwitchKey.EVENTS_GLOBAL,
      name: 'Global Events Kill Switch',
      description: 'Disables all live events and streams',
      active: false,
      notifyOps: true
    },
    {
      key: KillSwitchKey.DISCOVERY_GLOBAL,
      name: 'Global Discovery Kill Switch',
      description: 'Disables discovery feed and explore features',
      active: false,
      notifyOps: true
    },
    {
      key: KillSwitchKey.PUSH_NOTIFICATIONS_GLOBAL,
      name: 'Global Push Notifications Kill Switch',
      description: 'Disables all push notifications',
      active: false,
      notifyOps: true
    }
  ];

  const batch = db.batch();

  for (const killSwitch of killSwitches) {
    const ref = db.collection('global')
      .doc('killSwitches')
      .collection('switches')
      .doc(killSwitch.key!);

    batch.set(ref, {
      ...killSwitch,
      updatedBy: 'system',
      updatedAt: admin.firestore.Timestamp.now(),
      activatedAt: null,
      reason: null,
      incidentId: null
    }, { merge: true });
  }

  await batch.commit();
  console.log('[PACK 428] Kill switches initialized');
}

/**
 * Activate a kill switch (EMERGENCY)
 */
export async function activateKillSwitch(
  key: KillSwitchKey,
  reason: string,
  adminId: string,
  incidentId?: string
): Promise<void> {
  try {
    const ref = db.collection('global')
      .doc('killSwitches')
      .collection('switches')
      .doc(key);

    const killSwitch = await ref.get();
    if (!killSwitch.exists) {
      throw new Error(`Kill switch ${key} not found`);
    }

    // Activate the kill switch
    await ref.update({
      active: true,
      reason,
      updatedBy: adminId,
      updatedAt: admin.firestore.Timestamp.now(),
      activatedAt: admin.firestore.Timestamp.now(),
      incidentId: incidentId || null
    });

    console.log(`[PACK 428] Kill switch ${key} ACTIVATED by ${adminId}`);

    // Create audit log (PACK 296 integration)
    await createKillSwitchAuditLog({
      action: 'ACTIVATE',
      killSwitchKey: key,
      reason,
      adminId,
      incidentId
    });

    // Send notification to ops team (PACK 293 integration)
    await notifyOpsTeam({
      type: 'KILL_SWITCH_ACTIVATED',
      killSwitchKey: key,
      reason,
      adminId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`[PACK 428] Error activating kill switch ${key}:`, error);
    throw error;
  }
}

/**
 * Deactivate a kill switch (restore functionality)
 */
export async function deactivateKillSwitch(
  key: KillSwitchKey,
  adminId: string
): Promise<void> {
  try {
    const ref = db.collection('global')
      .doc('killSwitches')
      .collection('switches')
      .doc(key);

    const killSwitch = await ref.get();
    if (!killSwitch.exists) {
      throw new Error(`Kill switch ${key} not found`);
    }

    // Deactivate the kill switch
    await ref.update({
      active: false,
      reason: null,
      updatedBy: adminId,
      updatedAt: admin.firestore.Timestamp.now(),
      activatedAt: null,
      incidentId: null
    });

    console.log(`[PACK 428] Kill switch ${key} DEACTIVATED by ${adminId}`);

    // Create audit log
    await createKillSwitchAuditLog({
      action: 'DEACTIVATE',
      killSwitchKey: key,
      adminId
    });

    // Notify ops team
    await notifyOpsTeam({
      type: 'KILL_SWITCH_DEACTIVATED',
      killSwitchKey: key,
      adminId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`[PACK 428] Error deactivating kill switch ${key}:`, error);
    throw error;
  }
}

/**
 * Check if a kill switch is active
 */
export async function isKillSwitchActive(key: KillSwitchKey): Promise<boolean> {
  try {
    const ref = db.collection('global')
      .doc('killSwitches')
      .collection('switches')
      .doc(key);

    const doc = await ref.get();
    
    if (!doc.exists) {
      // Fail safe - if kill switch doesn't exist, assume not active
      return false;
    }

    const data = doc.data();
    return data?.active === true;

  } catch (error) {
    console.error(`[PACK 428] Error checking kill switch ${key}:`, error);
    // Fail safe - assume not active on error
    return false;
  }
}

/**
 * Get all active kill switches
 */
export async function getActiveKillSwitches(): Promise<KillSwitch[]> {
  try {
    const snapshot = await db.collection('global')
      .doc('killSwitches')
      .collection('switches')
      .where('active', '==', true)
      .get();

    return snapshot.docs.map(doc => doc.data() as KillSwitch);

  } catch (error) {
    console.error('[PACK 428] Error fetching active kill switches:', error);
    return [];
  }
}

/**
 * Get all kill switches (for admin panel)
 */
export async function getAllKillSwitches(): Promise<KillSwitch[]> {
  try {
    const snapshot = await db.collection('global')
      .doc('killSwitches')
      .collection('switches')
      .get();

    return snapshot.docs.map(doc => doc.data() as KillSwitch);

  } catch (error) {
    console.error('[PACK 428] Error fetching all kill switches:', error);
    return [];
  }
}

/**
 * Enforce kill switch on backend operation
 * Use this in critical backend functions
 */
export async function enforceKillSwitch(key: KillSwitchKey): Promise<void> {
  const active = await isKillSwitchActive(key);
  
  if (active) {
    throw new Error(`${key} is currently disabled by kill switch`);
  }
}

/**
 * Check if operation should be blocked by any kill switch
 */
export async function shouldBlockOperation(operationType: string): Promise<{
  blocked: boolean;
  reason?: string;
  killSwitchKey?: string;
}> {
  try {
    const activeKillSwitches = await getActiveKillSwitches();

    // Map operation types to kill switches
    const killSwitchMappings: Record<string, KillSwitchKey[]> = {
      'chat': [KillSwitchKey.CHAT_GLOBAL],
      'message': [KillSwitchKey.CHAT_GLOBAL],
      'payment': [KillSwitchKey.PAYMENTS_GLOBAL],
      'purchase': [KillSwitchKey.PAYMENTS_GLOBAL],
      'withdrawal': [KillSwitchKey.WITHDRAWALS_GLOBAL],
      'payout': [KillSwitchKey.WITHDRAWALS_GLOBAL],
      'ai_companion': [KillSwitchKey.AI_COMPANIONS_GLOBAL],
      'booking': [KillSwitchKey.CALENDAR_BOOKINGS_GLOBAL],
      'event': [KillSwitchKey.EVENTS_GLOBAL],
      'live_stream': [KillSwitchKey.EVENTS_GLOBAL],
      'discovery': [KillSwitchKey.DISCOVERY_GLOBAL],
      'explore': [KillSwitchKey.DISCOVERY_GLOBAL],
      'notification': [KillSwitchKey.PUSH_NOTIFICATIONS_GLOBAL]
    };

    const relevantKillSwitches = killSwitchMappings[operationType] || [];

    for (const ks of activeKillSwitches) {
      if (relevantKillSwitches.includes(ks.key as KillSwitchKey)) {
        return {
          blocked: true,
          reason: ks.reason || 'System temporarily disabled',
          killSwitchKey: ks.key
        };
      }
    }

    return { blocked: false };

  } catch (error) {
    console.error('[PACK 428] Error checking operation block:', error);
    // Fail open - don't block on error
    return { blocked: false };
  }
}

/**
 * Create audit log for kill switch action (PACK 296 integration)
 */
async function createKillSwitchAuditLog(data: {
  action: 'ACTIVATE' | 'DEACTIVATE';
  killSwitchKey: string;
  reason?: string;
  adminId: string;
  incidentId?: string;
}): Promise<void> {
  try {
    await db.collection('auditLogs').add({
      type: 'KILL_SWITCH',
      action: data.action,
      resource: 'killSwitch',
      resourceId: data.killSwitchKey,
      userId: data.adminId,
      metadata: {
        killSwitchKey: data.killSwitchKey,
        reason: data.reason,
        incidentId: data.incidentId
      },
      timestamp: admin.firestore.Timestamp.now(),
      severity: 'CRITICAL'
    });
  } catch (error) {
    console.error('[PACK 428] Error creating audit log:', error);
    // Non-blocking
  }
}

/**
 * Notify ops team about kill switch change (PACK 293 integration)
 */
async function notifyOpsTeam(data: {
  type: 'KILL_SWITCH_ACTIVATED' | 'KILL_SWITCH_DEACTIVATED';
  killSwitchKey: string;
  reason?: string;
  adminId: string;
  timestamp: string;
}): Promise<void> {
  try {
    // Get all ops team members
    const opsTeamSnapshot = await db.collection('users')
      .where('role', '==', 'ops')
      .get();

    const batch = db.batch();

    for (const userDoc of opsTeamSnapshot.docs) {
      const notificationRef = db.collection('notifications').doc();
      
      batch.set(notificationRef, {
        userId: userDoc.id,
        type: data.type,
        title: data.type === 'KILL_SWITCH_ACTIVATED' 
          ? `🚨 Kill Switch Activated: ${data.killSwitchKey}`
          : `✅ Kill Switch Deactivated: ${data.killSwitchKey}`,
        body: data.reason || 'No reason provided',
        data: {
          killSwitchKey: data.killSwitchKey,
          adminId: data.adminId
        },
        priority: 'CRITICAL',
        read: false,
        createdAt: admin.firestore.Timestamp.now()
      });
    }

    await batch.commit();

  } catch (error) {
    console.error('[PACK 428] Error notifying ops team:', error);
    // Non-blocking
  }
}

/**
 * Auto-activate kill switch based on system metrics
 * Called by monitoring systems (PACK 302/352 integration)
 */
export async function autoActivateKillSwitch(
  key: KillSwitchKey,
  reason: string,
  triggerMetrics: Record<string, number>,
  incidentId: string
): Promise<void> {
  try {
    console.log(`[PACK 428] Auto-activating kill switch ${key}:`, reason);

    await activateKillSwitch(key, reason, 'AUTO_SYSTEM', incidentId);

    // Log auto-activation event
    await db.collection('global')
      .doc('killSwitches')
      .collection('autoActivations')
      .add({
        killSwitchKey: key,
        reason,
        triggerMetrics,
        incidentId,
        timestamp: admin.firestore.Timestamp.now()
      });

  } catch (error) {
    console.error(`[PACK 428] Error auto-activating kill switch ${key}:`, error);
    throw error;
  }
}
