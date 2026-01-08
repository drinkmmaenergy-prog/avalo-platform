/**
 * PACK 417 — Incident Response, On-Call & Postmortem Engine
 * 
 * Service layer for incident management.
 * Provides functions for creating, updating, and managing incidents.
 */

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
// Import audit service if available, otherwise use stub
let logAuditEvent: any;
try {
  logAuditEvent = require('./pack296-audit.service').logAuditEvent;
} catch {
  logAuditEvent = async (event: any) => {
    console.log('Audit event:', event);
  };
}
import type {
  Incident,
  IncidentTimelineEntry,
  IncidentActionItem,
  CreateIncidentInput,
  UpdateIncidentStatusInput,
  AddTimelineEntryInput,
  CreateActionItemInput,
  CompleteActionItemInput,
  IncidentOperationResult,
  IncidentStatus,
} from './pack417-incident.types';

const db = getFirestore();

/**
 * Generate a short incident ID (e.g., INC-2024-001)
 */
function generateIncidentId(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INC-${year}-${random}`;
}

/**
 * Create a new incident
 */
export async function createIncident(
  input: CreateIncidentInput
): Promise<IncidentOperationResult> {
  try {
    const incidentId = generateIncidentId();
    const now = Timestamp.now();

    // Create incident document
    const incident: Incident = {
      id: incidentId,
      title: input.title,
      description: input.description,
      severity: input.severity,
      status: 'OPEN' as IncidentStatus,
      source: input.source,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
      ownerId: input.ownerId,
      affectedFeatures: input.affectedFeatures || [],
      relatedPacks: input.relatedPacks,
      relatedTicketIds: input.relatedTicketIds,
      relatedUserIds: input.relatedUserIds,
      relatedFunctionNames: input.relatedFunctionNames,
      fraudRelated: input.fraudRelated || false,
      safetyRelated: input.safetyRelated || false,
    };

    // Write incident
    await db.collection('incidents').doc(incidentId).set(incident);

    // Create initial timeline entry
    await addIncidentTimelineEntry({
      incidentId,
      authorId: input.createdBy,
      type: 'NOTE',
      message: 'Incident created',
    });

    // Audit log
    await logAuditEvent({
      eventType: 'INCIDENT_CREATED',
      actorId: input.createdBy,
      resourceType: 'INCIDENT',
      resourceId: incidentId,
      metadata: {
        severity: input.severity,
        source: input.source,
        title: input.title,
      },
    });

    return {
      success: true,
      incidentId,
    };
  } catch (error) {
    console.error('Error creating incident:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Update incident status
 */
export async function updateIncidentStatus(
  input: UpdateIncidentStatusInput
): Promise<IncidentOperationResult> {
  try {
    const incidentRef = db.collection('incidents').doc(input.incidentId);
    const incidentDoc = await incidentRef.get();

    if (!incidentDoc.exists) {
      return {
        success: false,
        error: 'Incident not found',
      };
    }

    const incident = incidentDoc.data() as Incident;
    const oldStatus = incident.status;

    // Update status
    await incidentRef.update({
      status: input.newStatus,
      updatedAt: Timestamp.now(),
    });

    // Add timeline entry
    const timelineId = await addIncidentTimelineEntry({
      incidentId: input.incidentId,
      authorId: input.authorId,
      type: 'STATUS_CHANGE',
      message: input.message || `Status changed from ${oldStatus} to ${input.newStatus}`,
    });

    // Audit log
    await logAuditEvent({
      eventType: 'INCIDENT_STATUS_CHANGED',
      actorId: input.authorId,
      resourceType: 'INCIDENT',
      resourceId: input.incidentId,
      metadata: {
        from: oldStatus,
        to: input.newStatus,
      },
    });

    return {
      success: true,
      incidentId: input.incidentId,
      timelineEntryId: timelineId.timelineEntryId,
    };
  } catch (error) {
    console.error('Error updating incident status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Add timeline entry to incident
 */
export async function addIncidentTimelineEntry(
  input: AddTimelineEntryInput
): Promise<IncidentOperationResult> {
  try {
    const timelineRef = db
      .collection('incidents')
      .doc(input.incidentId)
      .collection('timeline')
      .doc();

    const entry: IncidentTimelineEntry = {
      id: timelineRef.id,
      incidentId: input.incidentId,
      at: Timestamp.now(),
      type: input.type,
      authorId: input.authorId,
      message: input.message,
    };

    await timelineRef.set(entry);

    // Update incident's updatedAt
    await db.collection('incidents').doc(input.incidentId).update({
      updatedAt: Timestamp.now(),
    });

    return {
      success: true,
      timelineEntryId: timelineRef.id,
    };
  } catch (error) {
    console.error('Error adding timeline entry:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create action item for incident
 */
export async function createActionItem(
  input: CreateActionItemInput
): Promise<IncidentOperationResult> {
  try {
    const actionRef = db
      .collection('incidents')
      .doc(input.incidentId)
      .collection('actions')
      .doc();

    const actionItem: IncidentActionItem = {
      id: actionRef.id,
      incidentId: input.incidentId,
      title: input.title,
      ownerId: input.ownerId,
      dueAt: input.dueAt,
      completed: false,
    };

    await actionRef.set(actionItem);

    // Add timeline entry
    await addIncidentTimelineEntry({
      incidentId: input.incidentId,
      authorId: input.ownerId,
      type: 'NOTE',
      message: `Action item created: ${input.title}`,
    });

    return {
      success: true,
      actionItemId: actionRef.id,
    };
  } catch (error) {
    console.error('Error creating action item:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Complete action item
 */
export async function completeActionItem(
  input: CompleteActionItemInput
): Promise<IncidentOperationResult> {
  try {
    const actionRef = db
      .collection('incidents')
      .doc(input.incidentId)
      .collection('actions')
      .doc(input.actionId);

    const actionDoc = await actionRef.get();
    if (!actionDoc.exists) {
      return {
        success: false,
        error: 'Action item not found',
      };
    }

    const action = actionDoc.data() as IncidentActionItem;

    await actionRef.update({
      completed: true,
      completedAt: Timestamp.now(),
    });

    // Add timeline entry
    await addIncidentTimelineEntry({
      incidentId: input.incidentId,
      authorId: input.authorId,
      type: 'NOTE',
      message: `Action item completed: ${action.title}`,
    });

    // Audit log
    await logAuditEvent({
      eventType: 'INCIDENT_ACTION_COMPLETED',
      actorId: input.authorId,
      resourceType: 'INCIDENT',
      resourceId: input.incidentId,
      metadata: {
        actionId: input.actionId,
        actionTitle: action.title,
      },
    });

    return {
      success: true,
      actionItemId: input.actionId,
    };
  } catch (error) {
    console.error('Error completing action item:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Link related entities to incident
 */
export async function linkRelatedEntities(
  incidentId: string,
  entities: {
    ticketIds?: string[];
    userIds?: string[];
    functionNames?: string[];
    packs?: number[];
  }
): Promise<IncidentOperationResult> {
  try {
    const updateData: any = {
      updatedAt: Timestamp.now(),
    };

    if (entities.ticketIds && entities.ticketIds.length > 0) {
      updateData.relatedTicketIds = FieldValue.arrayUnion(...entities.ticketIds);
    }
    if (entities.userIds && entities.userIds.length > 0) {
      updateData.relatedUserIds = FieldValue.arrayUnion(...entities.userIds);
    }
    if (entities.functionNames && entities.functionNames.length > 0) {
      updateData.relatedFunctionNames = FieldValue.arrayUnion(...entities.functionNames);
    }
    if (entities.packs && entities.packs.length > 0) {
      updateData.relatedPacks = FieldValue.arrayUnion(...entities.packs);
    }

    await db.collection('incidents').doc(incidentId).update(updateData);

    return {
      success: true,
      incidentId,
    };
  } catch (error) {
    console.error('Error linking related entities:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get incident by ID
 */
export async function getIncident(incidentId: string): Promise<Incident | null> {
  try {
    const doc = await db.collection('incidents').doc(incidentId).get();
    return doc.exists ? (doc.data() as Incident) : null;
  } catch (error) {
    console.error('Error getting incident:', error);
    return null;
  }
}

/**
 * Get incident timeline
 */
export async function getIncidentTimeline(
  incidentId: string
): Promise<IncidentTimelineEntry[]> {
  try {
    const snapshot = await db
      .collection('incidents')
      .doc(incidentId)
      .collection('timeline')
      .orderBy('at', 'desc')
      .get();

    return snapshot.docs.map(doc => doc.data() as IncidentTimelineEntry);
  } catch (error) {
    console.error('Error getting incident timeline:', error);
    return [];
  }
}

/**
 * Get incident action items
 */
export async function getIncidentActions(
  incidentId: string,
  includeCompleted = true
): Promise<IncidentActionItem[]> {
  try {
    let query = db
      .collection('incidents')
      .doc(incidentId)
      .collection('actions');

    if (!includeCompleted) {
      query = query.where('completed', '==', false) as any;
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as IncidentActionItem);
  } catch (error) {
    console.error('Error getting incident actions:', error);
    return [];
  }
}

/**
 * Assign incident owner
 */
export async function assignIncidentOwner(
  incidentId: string,
  ownerId: string,
  authorId: string
): Promise<IncidentOperationResult> {
  try {
    await db.collection('incidents').doc(incidentId).update({
      ownerId,
      updatedAt: Timestamp.now(),
    });

    // Add timeline entry
    await addIncidentTimelineEntry({
      incidentId,
      authorId,
      type: 'NOTE',
      message: `Incident assigned to ${ownerId}`,
    });

    // Audit log
    await logAuditEvent({
      eventType: 'INCIDENT_ASSIGNED',
      actorId: authorId,
      resourceType: 'INCIDENT',
      resourceId: incidentId,
      metadata: {
        ownerId,
      },
    });

    return {
      success: true,
      incidentId,
    };
  } catch (error) {
    console.error('Error assigning incident owner:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
