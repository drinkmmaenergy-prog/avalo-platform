/**
 * PACK 417 — Incident Response, On-Call & Postmortem Engine
 * 
 * Postmortem type definitions and service.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';

/**
 * Postmortem document structure
 * 
 * Firestore path: incidentPostmortems/{incidentId}
 */
export interface IncidentPostmortem {
  id: string;            // = incidentId
  incidentId: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  summary: string;
  impact: string;
  rootCause: string;
  timeline: string;
  whatWentWell: string;
  whatWentWrong: string;
  actionItems: string;
  followUpIncidents?: string[];
}

/**
 * Input for creating/updating postmortem
 */
export interface PostmortemInput {
  incidentId: string;
  createdBy: string;
  summary: string;
  impact: string;
  rootCause: string;
  timeline: string;
  whatWentWell: string;
  whatWentWrong: string;
  actionItems: string;
  followUpIncidents?: string[];
}

const db = getFirestore();

/**
 * Create or update incident postmortem
 */
export async function savePostmortem(
  input: PostmortemInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const postmortemRef = db.collection('incidentPostmortems').doc(input.incidentId);
    const exists = (await postmortemRef.get()).exists;
    const now = Timestamp.now();

    const postmortem: IncidentPostmortem = {
      id: input.incidentId,
      incidentId: input.incidentId,
      createdAt: exists ? (await postmortemRef.get()).data()!.createdAt : now,
      createdBy: input.createdBy,
      updatedAt: now,
      summary: input.summary,
      impact: input.impact,
      rootCause: input.rootCause,
      timeline: input.timeline,
      whatWentWell: input.whatWentWell,
      whatWentWrong: input.whatWentWrong,
      actionItems: input.actionItems,
      followUpIncidents: input.followUpIncidents,
    };

    await postmortemRef.set(postmortem);

    return { success: true };
  } catch (error) {
    console.error('Error saving postmortem:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get postmortem for incident
 */
export async function getPostmortem(
  incidentId: string
): Promise<IncidentPostmortem | null> {
  try {
    const doc = await db.collection('incidentPostmortems').doc(incidentId).get();
    return doc.exists ? (doc.data() as IncidentPostmortem) : null;
  } catch (error) {
    console.error('Error getting postmortem:', error);
    return null;
  }
}

/**
 * Mark postmortem as complete (updates incident status)
 */
export async function markPostmortemComplete(
  incidentId: string,
  authorId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Import the service function
    const { updateIncidentStatus } = require('./pack417-incident.service');
    
    await updateIncidentStatus({
      incidentId,
      newStatus: 'POSTMORTEM_COMPLETE',
      authorId,
      message: 'Postmortem completed',
    });

    return { success: true };
  } catch (error) {
    console.error('Error marking postmortem complete:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
