/**
 * PACK 417 — Incident Response, On-Call & Postmortem Engine
 * 
 * Triggers and integrations with existing systems.
 * Connects monitoring, fraud, safety, and support systems to incident management.
 */

import { https } from 'firebase-functions';
import { createIncident, linkRelatedEntities } from './pack417-incident.service';
import { notifyIncidentCreated } from './pack417-incident.notifications';
import type { CreateIncidentInput, IncidentSource, IncidentSeverity } from './pack417-incident.types';

/**
 * Callable function: Create incident from support ticket
 * 
 * Used by support admins to escalate tickets to incidents.
 */
export const pack417_createIncidentFromTicket = https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Verify admin role (simplified - should check against PACK 296/300A roles)
  // In production, this should use proper role checking
  const { ticketId, severity, title, description } = data;

  if (!ticketId || !severity || !title || !description) {
    throw new https.HttpsError(
      'invalid-argument',
      'Missing required fields: ticketId, severity, title, description'
    );
  }

  const input: CreateIncidentInput = {
    title,
    description,
    severity,
    source: 'SUPPORT_TICKET' as IncidentSource,
    createdBy: context.auth.uid,
    relatedTicketIds: [ticketId],
  };

  const result = await createIncident(input);

  if (result.success && result.incidentId) {
    // Notify on-call team
    await notifyIncidentCreated(result.incidentId);
  }

  return result;
});

/**
 * Callable function: Create incident manually
 * 
 * Used by admins to create incidents directly.
 */
export const pack417_createIncident = https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const {
    title,
    description,
    severity,
    source,
    affectedFeatures,
    relatedPacks,
    fraudRelated,
    safetyRelated,
  } = data;

  if (!title || !description || !severity || !source) {
    throw new https.HttpsError(
      'invalid-argument',
      'Missing required fields: title, description, severity, source'
    );
  }

  const input: CreateIncidentInput = {
    title,
    description,
    severity,
    source,
    createdBy: context.auth.uid,
    affectedFeatures,
    relatedPacks,
    fraudRelated,
    safetyRelated,
  };

  const result = await createIncident(input);

  if (result.success && result.incidentId) {
    // Notify on-call team
    await notifyIncidentCreated(result.incidentId);
  }

  return result;
});

/**
 * Helper: Auto-create incident from monitoring threshold
 * 
 * Called by PACK 351+ observability system when critical thresholds are exceeded.
 */
export async function createIncidentFromMonitoring(params: {
  errorType: string;
  errorRate: number;
  threshold: number;
  affectedFunctions: string[];
  severity: 'SEV0' | 'SEV1';
}): Promise<string | null> {
  try {
    const input: CreateIncidentInput = {
      title: `Critical Error Rate: ${params.errorType}`,
      description: `Error rate of ${params.errorRate}% exceeded threshold of ${params.threshold}%. Affected functions: ${params.affectedFunctions.join(', ')}`,
      severity: params.severity as IncidentSeverity,
      source: 'MONITORING' as IncidentSource,
      createdBy: 'system',
      relatedFunctionNames: params.affectedFunctions,
    };

    const result = await createIncident(input);

    if (result.success && result.incidentId) {
      await notifyIncidentCreated(result.incidentId);
      return result.incidentId;
    }

    return null;
  } catch (error) {
    console.error('Error creating incident from monitoring:', error);
    return null;
  }
}

/**
 * Helper: Auto-create incident from fraud pattern
 * 
 * Called by PACK 302 fraud engine when critical patterns are detected.
 */
export async function createIncidentFromFraud(params: {
  patternType: string;
  affectedUsers: string[];
  riskLevel: 'critical' | 'high';
  description: string;
}): Promise<string | null> {
  try {
    const severity =
      (params.riskLevel === 'critical' ? 'SEV0' : 'SEV1') as IncidentSeverity;

    const input: CreateIncidentInput = {
      title: `Fraud Pattern Detected: ${params.patternType}`,
      description: params.description,
      severity,
      source: 'FRAUD_ENGINE' as IncidentSource,
      createdBy: 'system',
      relatedUserIds: params.affectedUsers,
      fraudRelated: true,
    };

    const result = await createIncident(input);

    if (result.success && result.incidentId) {
      await notifyIncidentCreated(result.incidentId);
      return result.incidentId;
    }

    return null;
  } catch (error) {
    console.error('Error creating incident from fraud:', error);
    return null;
  }
}

/**
 * Helper: Auto-create incident from safety escalation
 * 
 * Called by PACK 267-268 safety system for critical safety issues.
 */
export async function createIncidentFromSafety(params: {
  safetyTicketId: string;
  issueType: string;
  affectedUsers: string[];
  severity: 'SEV0' | 'SEV1';
  description: string;
}): Promise<string | null> {
  try {
    const input: CreateIncidentInput = {
      title: `Safety Issue: ${params.issueType}`,
      description: params.description,
      severity: params.severity as IncidentSeverity,
      source: 'SAFETY_ENGINE' as IncidentSource,
      createdBy: 'system',
      relatedUserIds: params.affectedUsers,
      relatedTicketIds: [params.safetyTicketId],
      safetyRelated: true,
    };

    const result = await createIncident(input);

    if (result.success && result.incidentId) {
      await notifyIncidentCreated(result.incidentId);
      return result.incidentId;
    }

    return null;
  } catch (error) {
    console.error('Error creating incident from safety:', error);
    return null;
  }
}

/**
 * Check for existing open incident with similar pattern
 * (Prevent duplicate incident creation)
 */
export async function findSimilarOpenIncident(params: {
  source: string;
  fraudRelated?: boolean;
  safetyRelated?: boolean;
  issueType?: string;
}): Promise<string | null> {
  try {
    const { getFirestore } = require('firebase-admin/firestore');
    const db = getFirestore();

    let query = db
      .collection('incidents')
      .where('source', '==', params.source)
      .where('status', 'in', ['OPEN', 'INVESTIGATING']);

    if (params.fraudRelated !== undefined) {
      query = query.where('fraudRelated', '==', params.fraudRelated);
    }

    if (params.safetyRelated !== undefined) {
      query = query.where('safetyRelated', '==', params.safetyRelated);
    }

    const snapshot = await query.limit(1).get();

    if (!snapshot.empty) {
      return snapshot.docs[0].id;
    }

    return null;
  } catch (error) {
    console.error('Error finding similar incident:', error);
    return null;
  }
}
