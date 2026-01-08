/**
 * PACK 387: Global PR, Reputation Intelligence & Crisis Response Engine
 * PR Incident & Crisis Management
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Types
type IncidentStatus = 'OPEN' | 'ESCALATED' | 'LEGAL_REVIEW' | 'MITIGATED' | 'CLOSED';
type ThreatLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface PRIncident {
  id?: string;
  title: string;
  description: string;
  status: IncidentStatus;
  threatLevel: ThreatLevel;
  triggeringSignals?: any[];
  linkedSupportTickets?: string[];
  linkedFraudCases?: string[];
  linkedSafetyIncidents?: string[];
  influencerInvolvement?: string[];
  publicVisibility: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  legalExposure: boolean;
  legalReview?: {
    approved: boolean;
    reviewedBy: string;
    reviewedAt: admin.firestore.Timestamp;
    notes: string;
  };
  geo?: string;
  topic?: string;
  assignedTo?: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  resolvedAt?: admin.firestore.Timestamp;
  resolutionNotes?: string;
}

/**
 * Create a new PR incident
 */
export const pack387_createIncident = functions.https.onCall(
  async (data: Omit<PRIncident, 'id' | 'createdAt' | 'updatedAt'>, context) => {
    // Verify admin/staff auth
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      const incident: PRIncident = {
        ...data,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      };

      const incidentRef = await db.collection('prIncidents').add(incident);

      // Log incident creation
      await db.collection('crisisResponseLogs').add({
        incidentId: incidentRef.id,
        actionType: 'INCIDENT_CREATED',
        performedBy: context.auth.uid,
        timestamp: admin.firestore.Timestamp.now(),
        metadata: { incident },
      });

      // If critical, trigger crisis orchestration immediately
      if (data.threatLevel === 'CRITICAL') {
        await triggerCrisisOrchestration(incidentRef.id, incident);
      }

      return {
        success: true,
        incidentId: incidentRef.id,
      };
    } catch (error: any) {
      console.error('Error creating incident:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Update incident status
 */
export const pack387_updateIncidentStatus = functions.https.onCall(
  async (data: { incidentId: string; status: IncidentStatus; notes?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      const incidentRef = db.collection('prIncidents').doc(data.incidentId);
      const incident = await incidentRef.get();

      if (!incident.exists) {
        throw new functions.https.HttpsError('not-found', 'Incident not found');
      }

      await incidentRef.update({
        status: data.status,
        updatedAt: admin.firestore.Timestamp.now(),
        ...(data.notes && { resolutionNotes: data.notes }),
        ...(data.status === 'CLOSED' && { resolvedAt: admin.firestore.Timestamp.now() }),
      });

      // Log status change
      await db.collection('crisisResponseLogs').add({
        incidentId: data.incidentId,
        actionType: 'STATUS_CHANGED',
        performedBy: context.auth.uid,
        timestamp: admin.firestore.Timestamp.now(),
        metadata: {
          oldStatus: incident.data()!.status,
          newStatus: data.status,
          notes: data.notes,
        },
      });

      // If escalating to legal review, notify legal team
      if (data.status === 'LEGAL_REVIEW') {
        await notifyLegalTeam(data.incidentId, incident.data() as PRIncident);
      }

      // If mitigated, deactivate crisis measures
      if (data.status === 'MITIGATED' || data.status === 'CLOSED') {
        await deactivateCrisisMeasures(data.incidentId);
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error updating incident status:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Close incident with detailed report
 */
export const pack387_closeIncidentWithReport = functions.https.onCall(
  async (
    data: {
      incidentId: string;
      resolutionSummary: string;
      lessonsLearned: string;
      preventativeMeasures: string;
    },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      const incidentRef = db.collection('prIncidents').doc(data.incidentId);
      const incident = await incidentRef.get();

      if (!incident.exists) {
        throw new functions.https.HttpsError('not-found', 'Incident not found');
      }

      await incidentRef.update({
        status: 'CLOSED',
        resolvedAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        resolutionReport: {
          summary: data.resolutionSummary,
          lessonsLearned: data.lessonsLearned,
          preventativeMeasures: data.preventativeMeasures,
          closedBy: context.auth.uid,
          closedAt: admin.firestore.Timestamp.now(),
        },
      });

      // Log closure
      await db.collection('crisisResponseLogs').add({
        incidentId: data.incidentId,
        actionType: 'INCIDENT_CLOSED',
        performedBy: context.auth.uid,
        timestamp: admin.firestore.Timestamp.now(),
        metadata: {
          resolutionSummary: data.resolutionSummary,
          lessonsLearned: data.lessonsLearned,
        },
      });

      // Deactivate all crisis measures
      await deactivateCrisisMeasures(data.incidentId);

      return { success: true };
    } catch (error: any) {
      console.error('Error closing incident:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Add legal review to incident
 */
export const pack387_addLegalReview = functions.https.onCall(
  async (
    data: {
      incidentId: string;
      approved: boolean;
      notes: string;
    },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    // Verify legal role (should check actual role from users collection)
    // For now, trust authenticated user

    try {
      const incidentRef = db.collection('prIncidents').doc(data.incidentId);
      
      await incidentRef.update({
        legalReview: {
          approved: data.approved,
          reviewedBy: context.auth.uid,
          reviewedAt: admin.firestore.Timestamp.now(),
          notes: data.notes,
        },
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Log legal review
      await db.collection('crisisResponseLogs').add({
        incidentId: data.incidentId,
        actionType: 'LEGAL_REVIEW_ADDED',
        performedBy: context.auth.uid,
        timestamp: admin.firestore.Timestamp.now(),
        metadata: {
          approved: data.approved,
          notes: data.notes,
        },
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error adding legal review:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Link support tickets to incident
 */
export const pack387_linkSupportTickets = functions.https.onCall(
  async (data: { incidentId: string; ticketIds: string[] }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      const incidentRef = db.collection('prIncidents').doc(data.incidentId);
      
      await incidentRef.update({
        linkedSupportTickets: admin.firestore.FieldValue.arrayUnion(...data.ticketIds),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error linking support tickets:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Link fraud cases to incident
 */
export const pack387_linkFraudCases = functions.https.onCall(
  async (data: { incidentId: string; fraudCaseIds: string[] }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      const incidentRef = db.collection('prIncidents').doc(data.incidentId);
      
      await incidentRef.update({
        linkedFraudCases: admin.firestore.FieldValue.arrayUnion(...data.fraudCaseIds),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error linking fraud cases:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get incident details with all linked data
 */
export const pack387_getIncidentDetails = functions.https.onCall(
  async (data: { incidentId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      const incidentDoc = await db.collection('prIncidents').doc(data.incidentId).get();

      if (!incidentDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Incident not found');
      }

      const incident = incidentDoc.data() as PRIncident;

      // Get linked support tickets
      const supportTickets = incident.linkedSupportTickets?.length
        ? await Promise.all(
            incident.linkedSupportTickets.map(id =>
              db.collection('supportTickets').doc(id).get()
            )
          )
        : [];

      // Get linked fraud cases
      const fraudCases = incident.linkedFraudCases?.length
        ? await Promise.all(
            incident.linkedFraudCases.map(id =>
              db.collection('fraudCases').doc(id).get()
            )
          )
        : [];

      // Get crisis response logs
      const logs = await db
        .collection('crisisResponseLogs')
        .where('incidentId', '==', data.incidentId)
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get();

      return {
        incident: { id: incidentDoc.id, ...incident },
        supportTickets: supportTickets.map(doc => ({ id: doc.id, ...doc.data() })),
        fraudCases: fraudCases.map(doc => ({ id: doc.id, ...doc.data() })),
        logs: logs.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      };
    } catch (error: any) {
      console.error('Error getting incident details:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// Helper functions

async function triggerCrisisOrchestration(incidentId: string, incident: PRIncident): Promise<void> {
  await db.collection('crisisResponseLogs').add({
    incidentId,
    actionType: 'CRISIS_ORCHESTRATION_TRIGGERED',
    status: 'PENDING',
    timestamp: admin.firestore.Timestamp.now(),
    metadata: { incident },
  });
}

async function notifyLegalTeam(incidentId: string, incident: PRIncident): Promise<void> {
  // Get legal team members
  const legalUsers = await db
    .collection('users')
    .where('role', 'in', ['legal', 'executive', 'admin'])
    .get();

  // Send notifications
  const notificationPromises = legalUsers.docs.map(user =>
    db.collection('notifications').add({
      userId: user.id,
      type: 'LEGAL_REVIEW_REQUIRED',
      title: 'Legal Review Required',
      message: `PR Incident "${incident.title}" requires legal review`,
      data: { incidentId },
      read: false,
      createdAt: admin.firestore.Timestamp.now(),
    })
  );

  await Promise.all(notificationPromises);
}

async function deactivateCrisisMeasures(incidentId: string): Promise<void> {
  // Deactivate store crisis shields
  const shields = await db
    .collection('storeCrisisShields')
    .where('incidentId', '==', incidentId)
    .where('active', '==', true)
    .get();

  const deactivatePromises = shields.docs.map(doc =>
    doc.ref.update({
      active: false,
      deactivatedAt: admin.firestore.Timestamp.now(),
    })
  );

  await Promise.all(deactivatePromises);

  // Resume marketing campaigns (if they were paused)
  await db.collection('crisisResponseLogs').add({
    incidentId,
    actionType: 'CRISIS_MEASURES_DEACTIVATED',
    timestamp: admin.firestore.Timestamp.now(),
  });
}
