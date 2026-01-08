/**
 * PACK 417 — Incident Response, On-Call & Postmortem Engine
 * 
 * Type definitions for incident management system.
 * Integrates with PACK 267-268 (Safety), 293 (Notifications), 
 * 296 (Audit), 300/300A/300B (Support), 302 (Fraud), 351+ (Monitoring)
 */

import type { Timestamp } from 'firebase-admin/firestore';

/**
 * Incident severity levels
 */
export enum IncidentSeverity {
  SEV0 = 'SEV0', // full outage / critical safety
  SEV1 = 'SEV1', // major degradation / safety concern
  SEV2 = 'SEV2', // partial impact / non-critical
  SEV3 = 'SEV3', // minor / cosmetic
}

/**
 * Source that triggered the incident
 */
export enum IncidentSource {
  MONITORING = 'MONITORING',
  SUPPORT_TICKET = 'SUPPORT_TICKET',
  FRAUD_ENGINE = 'FRAUD_ENGINE',
  SAFETY_ENGINE = 'SAFETY_ENGINE',
  MANUAL = 'MANUAL',
}

/**
 * Incident lifecycle status
 */
export enum IncidentStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  MITIGATED = 'MITIGATED',
  MONITORING = 'MONITORING',
  RESOLVED = 'RESOLVED',
  POSTMORTEM_REQUIRED = 'POSTMORTEM_REQUIRED',
  POSTMORTEM_COMPLETE = 'POSTMORTEM_COMPLETE',
}

/**
 * Main incident document
 * 
 * Firestore path: incidents/{incidentId}
 */
export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  source: IncidentSource;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;   // admin or system id
  ownerId?: string;    // primary on-call / incident commander
  affectedFeatures: string[]; // keys from FeatureFlagKey, services, etc.
  relatedPacks?: number[];
  relatedTicketIds?: string[];
  relatedUserIds?: string[];
  relatedFunctionNames?: string[];
  timelineSummary?: string;
  fraudRelated?: boolean;
  safetyRelated?: boolean;
}

/**
 * Timeline entry types
 */
export type TimelineEntryType = 
  | 'NOTE'
  | 'STATUS_CHANGE'
  | 'MITIGATION'
  | 'ROOT_CAUSE'
  | 'COMMUNICATION';

/**
 * Timeline entry for incident history
 * 
 * Firestore path: incidents/{incidentId}/timeline/{timelineId}
 */
export interface IncidentTimelineEntry {
  id: string;
  incidentId: string;
  at: Timestamp;
  type: TimelineEntryType;
  authorId: string;
  message: string;
  fromStatus?: IncidentStatus;
  toStatus?: IncidentStatus;
}

/**
 * Action item for follow-up work
 * 
 * Firestore path: incidents/{incidentId}/actions/{actionId}
 */
export interface IncidentActionItem {
  id: string;
  incidentId: string;
  title: string;
  ownerId: string;
  dueAt?: Timestamp;
  completed: boolean;
  completedAt?: Timestamp;
}

/**
 * On-call rotation configuration
 * 
 * Firestore path: onCallConfig/global
 */
export interface OnCallConfig {
  currentPrimaryAdminId: string;
  currentSecondaryAdminId?: string;
  rotationSchedule: 'MANUAL' | 'WEEKLY';
  lastRotationAt: Timestamp;
}

/**
 * Input for creating a new incident
 */
export interface CreateIncidentInput {
  title: string;
  description: string;
  severity: IncidentSeverity;
  source: IncidentSource;
  createdBy: string;
  ownerId?: string;
  affectedFeatures?: string[];
  relatedPacks?: number[];
  relatedTicketIds?: string[];
  relatedUserIds?: string[];
  relatedFunctionNames?: string[];
  fraudRelated?: boolean;
  safetyRelated?: boolean;
}

/**
 * Input for updating incident status
 */
export interface UpdateIncidentStatusInput {
  incidentId: string;
  newStatus: IncidentStatus;
  authorId: string;
  message?: string;
}

/**
 * Input for adding timeline entry
 */
export interface AddTimelineEntryInput {
  incidentId: string;
  authorId: string;
  type: TimelineEntryType;
  message: string;
}

/**
 * Input for creating action item
 */
export interface CreateActionItemInput {
  incidentId: string;
  title: string;
  ownerId: string;
  dueAt?: Timestamp;
}

/**
 * Input for completing action item
 */
export interface CompleteActionItemInput {
  incidentId: string;
  actionId: string;
  authorId: string;
}

/**
 * Response type for incident operations
 */
export interface IncidentOperationResult {
  success: boolean;
  incidentId?: string;
  timelineEntryId?: string;
  actionItemId?: string;
  error?: string;
}
