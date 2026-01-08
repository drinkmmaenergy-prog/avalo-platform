/**
 * PACK 417 — Incident Response, On-Call & Postmortem Engine
 * 
 * Notification system for incident management.
 * Integrates with PACK 293 notifications.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getIncident } from './pack417-incident.service';
import type { Incident, OnCallConfig, IncidentSeverity } from './pack417-incident.types';

const db = getFirestore();

// Import notification service if available, otherwise use stub
let sendNotification: any;
try {
  sendNotification = require('./pack293-notifications.service').sendNotification;
} catch {
  sendNotification = async (notification: any) => {
    console.log('Notification:', notification);
  };
}

/**
 * Get current on-call configuration
 */
export async function getOnCallConfig(): Promise<OnCallConfig | null> {
  try {
    const doc = await db.collection('onCallConfig').doc('global').get();
    return doc.exists ? (doc.data() as OnCallConfig) : null;
  } catch (error) {
    console.error('Error getting on-call config:', error);
    return null;
  }
}

/**
 * Update on-call configuration
 */
export async function updateOnCallConfig(
  config: Partial<OnCallConfig>
): Promise<boolean> {
  try {
    await db.collection('onCallConfig').doc('global').set(
      {
        ...config,
        lastRotationAt: Timestamp.now(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error('Error updating on-call config:', error);
    return false;
  }
}

/**
 * Notify on-call team of new incident
 */
export async function notifyIncidentCreated(incidentId: string): Promise<void> {
  try {
    const incident = await getIncident(incidentId);
    if (!incident) {
      console.error('Incident not found:', incidentId);
      return;
    }

    const onCallConfig = await getOnCallConfig();
    if (!onCallConfig) {
      console.error('On-call configuration not found');
      return;
    }

    const isCritical = incident.severity === 'SEV0' || incident.severity === 'SEV1';

    // Notify primary on-call
    await sendNotification({
      userId: onCallConfig.currentPrimaryAdminId,
      type: 'INCIDENT_CREATED',
      title: `[${incident.severity}] New Incident: ${incident.title}`,
      body: incident.description,
      data: {
        incidentId: incident.id,
        severity: incident.severity,
      },
      priority: isCritical ? 'high' : 'normal',
      channels: isCritical ? ['push', 'email'] : ['push'],
    });

    // For critical incidents, also notify secondary
    if (isCritical && onCallConfig.currentSecondaryAdminId) {
      await sendNotification({
        userId: onCallConfig.currentSecondaryAdminId,
        type: 'INCIDENT_CREATED',
        title: `[${incident.severity}] New Critical Incident: ${incident.title}`,
        body: incident.description,
        data: {
          incidentId: incident.id,
          severity: incident.severity,
        },
        priority: 'high',
        channels: ['push', 'email'],
      });
    }
  } catch (error) {
    console.error('Error notifying incident created:', error);
  }
}

/**
 * Notify on status change (for critical incidents)
 */
export async function notifyIncidentStatusChange(
  incidentId: string,
  oldStatus: string,
  newStatus: string
): Promise<void> {
  try {
    const incident = await getIncident(incidentId);
    if (!incident) {
      return;
    }

    const isCritical = incident.severity === 'SEV0' || incident.severity === 'SEV1';
    if (!isCritical) {
      return; // Only notify for critical incidents
    }

    const onCallConfig = await getOnCallConfig();
    if (!onCallConfig) {
      return;
    }

    // Notify primary on-call
    await sendNotification({
      userId: onCallConfig.currentPrimaryAdminId,
      type: 'INCIDENT_STATUS_CHANGED',
      title: `Incident ${incident.id} Status Update`,
      body: `Status changed from ${oldStatus} to ${newStatus}`,
      data: {
        incidentId: incident.id,
        oldStatus,
        newStatus,
      },
      priority: 'normal',
      channels: ['push'],
    });
  } catch (error) {
    console.error('Error notifying status change:', error);
  }
}

/**
 * Broadcast critical incident to admin group
 */
export async function broadcastCriticalIncident(incidentId: string): Promise<void> {
  try {
    const incident = await getIncident(incidentId);
    if (!incident) {
      return;
    }

    const isCritical = incident.severity === 'SEV0' || incident.severity === 'SEV1';
    if (!isCritical) {
      return;
    }

    // Get all admin users (simplified - in production, query by role)
    const adminsSnapshot = await db
      .collection('users')
      .where('role', 'in', ['SUPER_ADMIN', 'ADMIN', 'PLATFORM_ADMIN'])
      .get();

    const notifyPromises = adminsSnapshot.docs.map(doc =>
      sendNotification({
        userId: doc.id,
        type: 'INCIDENT_BROADCAST',
        title: `[${incident.severity}] Critical Incident`,
        body: incident.title,
        data: {
          incidentId: incident.id,
          severity: incident.severity,
        },
        priority: 'high',
        channels: ['push'],
      })
    );

    await Promise.allSettled(notifyPromises);
  } catch (error) {
    console.error('Error broadcasting critical incident:', error);
  }
}

/**
 * Notify when incident is resolved
 */
export async function notifyIncidentResolved(incidentId: string): Promise<void> {
  try {
    const incident = await getIncident(incidentId);
    if (!incident) {
      return;
    }

    const onCallConfig = await getOnCallConfig();
    if (!onCallConfig) {
      return;
    }

    // Notify primary on-call
    await sendNotification({
      userId: onCallConfig.currentPrimaryAdminId,
      type: 'INCIDENT_RESOLVED',
      title: `Incident ${incident.id} Resolved`,
      body: incident.title,
      data: {
        incidentId: incident.id,
      },
      priority: 'normal',
      channels: ['push'],
    });
  } catch (error) {
    console.error('Error notifying incident resolved:', error);
  }
}

/**
 * Notify when incident requires postmortem
 */
export async function notifyPostmortemRequired(incidentId: string): Promise<void> {
  try {
    const incident = await getIncident(incidentId);
    if (!incident || !incident.ownerId) {
      return;
    }

    await sendNotification({
      userId: incident.ownerId,
      type: 'POSTMORTEM_REQUIRED',
      title: 'Postmortem Required',
      body: `Incident ${incident.id}: ${incident.title}`,
      data: {
        incidentId: incident.id,
      },
      priority: 'normal',
      channels: ['push', 'email'],
    });
  } catch (error) {
    console.error('Error notifying postmortem required:', error);
  }
}
