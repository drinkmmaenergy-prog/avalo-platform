/**
 * PACK 448: Incident Response, Crisis Management & Regulatory Playbooks
 * Type Definitions and Interfaces
 */

import { Timestamp } from 'firebase-admin/firestore';

// ═══════════════════════════════════════════════════════════════════════════
// Incident Management Types
// ═══════════════════════════════════════════════════════════════════════════

export type IncidentCategory =
  | 'security_breach'
  | 'data_leakage'
  | 'payment_outage'
  | 'ai_misbehavior'
  | 'regulatory_inquiry'
  | 'compliance_violation'
  | 'reputation_crisis'
  | 'infrastructure_failure'
  | 'fraud_detection'
  | 'legal_threat'
  | 'privacy_breach'
  | 'service_disruption';

export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';

export type IncidentStatus = 
  | 'open'
  | 'investigating'
  | 'contained'
  | 'resolved'
  | 'closed';

export interface Incident {
  id: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  owner: string;
  affectedSystems: string[];
  affectedUsers?: number;
  financialImpact?: number;
  reputationImpact?: 'none' | 'low' | 'medium' | 'high' | 'critical';
  detectMethod: 'automated' | 'manual' | 'external' | 'user_report';
  tags: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  detectedAt?: Timestamp;
  containedAt?: Timestamp;
  resolvedAt?: Timestamp;
  closedAt?: Timestamp;
  slaResponseTime: number; // minutes
  slaResolutionTime: number; // minutes
  actualResponseTime?: number;
  actualResolutionTime?: number;
  slaBreach: boolean;
  playbookExecuted?: string;
  regulatorNotified: boolean;
  publicDisclosure: boolean;
  metadata: Record<string, any>;
}

export interface IncidentTimelineEntry {
  id: string;
  incidentId: string;
  timestamp: Timestamp;
  action: string;
  actor: string;
  actorRole: string;
  details: string;
  automated: boolean;
  metadata?: Record<string, any>;
}

export interface IncidentEvidence {
  id: string;
  incidentId: string;
  type: 'log' | 'screenshot' | 'recording' | 'document' | 'system_snapshot' | 'other';
  source: string;
  collectedAt: Timestamp;
  collectedBy: string;
  locked: boolean;
  lockedAt?: Timestamp;
  lockedBy?: string;
  storageUrl: string;
  hash: string;
  metadata: Record<string, any>;
}

export interface IncidentAction {
  id: string;
  incidentId: string;
  title: string;
  description: string;
  assignee: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  dueDate: Timestamp;
  createdAt: Timestamp;
  completedAt?: Timestamp;
  verifiedBy?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Crisis Playbook Types
// ═══════════════════════════════════════════════════════════════════════════

export interface CrisisPlaybookStep {
  order: number;
  title: string;
  description: string;
  action: 'manual' | 'automated' | 'approval_required';
  handler?: string; // Function name for automated actions
  requiredRole: string[];
  estimatedDuration: number; // minutes
  critical: boolean;
  dependencies?: number[]; // Step orders that must complete first
  rollbackPossible: boolean;
  rollbackHandler?: string;
}

export interface CrisisPlaybook {
  id: string;
  name: string;
  description: string;
  version: string;
  active: boolean;
  triggerConditions: {
    categories: IncidentCategory[];
    severities: IncidentSeverity[];
    customRules?: Record<string, any>;
  };
  steps: CrisisPlaybookStep[];
  requiredApprovals: string[]; // Roles
  timeoutMinutes: number;
  escalationPath: string[];
  notificationChannels: string[];
  killSwitchEnabled: boolean;
  communicationFreeze: boolean;
  regulatorNotification: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  lastTestedAt?: Timestamp;
  testResults?: Record<string, any>;
}

export interface PlaybookExecution {
  id: string;
  playbookId: string;
  playbookVersion: string;
  incidentId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  startedAt: Timestamp;
  completedAt?: Timestamp;
  currentStep: number;
  completedSteps: number[];
  failedSteps: number[];
  skipedSteps: number[];
  executionLog: any[];
  automated: boolean;
  triggeredBy: string;
  approvals: Record<string, { approved: boolean; by: string; at: Timestamp }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Severity Matrix Types
// ═══════════════════════════════════════════════════════════════════════════

export interface SeverityMatrixRule {
  category: IncidentCategory;
  conditions: {
    affectedUsers?: { min?: number; max?: number };
    financialImpact?: { min?: number; max?: number };
    dataVolume?: { min?: number; max?: number };
    downtime?: { min?: number; max?: number }; // minutes
    regulatoryRisk?: boolean;
    reputationRisk?: 'low' | 'medium' | 'high';
  };
  severity: IncidentSeverity;
  slaResponseMinutes: number;
  slaResolutionMinutes: number;
  owner: string; // Role
  escalationPath: string[]; // Roles
  autoNotify: string[]; // User IDs or roles
  playbookId?: string;
}

export interface IncidentSeverityMatrix {
  id: string;
  version: string;
  active: boolean;
  rules: SeverityMatrixRule[];
  defaultSeverity: IncidentSeverity;
  defaultSLA: { response: number; resolution: number };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ═══════════════════════════════════════════════════════════════════════════
// Regulator Interaction Types
// ═══════════════════════════════════════════════════════════════════════════

export type RegulatorInteractionType =
  | 'inquiry'
  | 'audit'
  | 'inspection'
  | 'investigation'
  | 'complaint_response';

export type LockMode =
  | 'log_lock' // No log modifications
  | 'evidence_snapshot' // Snapshot all relevant data
  | 'decision_freeze' // No automated decisions
  | 'full_freeze'; // Minimal operations only

export interface RegulatorInteraction {
  id: string;
  regulatorName: string;
  regulatorContact: string;
  jurisdiction: string;
  type: RegulatorInteractionType;
  referenceNumber: string;
  relatedIncidents: string[];
  startedAt: Timestamp;
  expectedEndAt?: Timestamp;
  actualEndAt?: Timestamp;
  status: 'active' | 'pending_response' | 'completed' | 'escalated';
  lockMode: LockMode;
  lockActivatedAt: Timestamp;
  lockActivatedBy: string;
  scope: string[];
  responsibleTeam: string[];
  internalCaseId: string;
  metadata: Record<string, any>;
}

export interface RegulatorSnapshot {
  id: string;
  interactionId: string;
  timestamp: Timestamp;
  snapshotType: 'full' | 'incremental' | 'targeted';
  scope: string[];
  storageUrl: string;
  hash: string;
  size: number;
  encrypted: boolean;
  metadata: Record<string, any>;
}

export interface RegulatorCommunication {
  id: string;
  interactionId: string;
  direction: 'inbound' | 'outbound';
  channel: 'email' | 'phone' | 'portal' | 'letter' | 'meeting';
  subject: string;
  content: string;
  approved: boolean;
  approvedBy?: string;
  approvedAt?: Timestamp;
  sentAt?: Timestamp;
  timestamp: Timestamp;
  attachments: string[];
  metadata: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Communication Freeze Types
// ═══════════════════════════════════════════════════════════════════════════

export type CommunicationScope =
  | 'internal_only'
  | 'external_only'
  | 'all_public'
  | 'social_media'
  | 'press'
  | 'store_communications'
  | 'user_communications'
  | 'complete_freeze';

export interface CommunicationFreeze {
  id: string;
  incidentId: string;
  scope: CommunicationScope[];
  reason: string;
  active: boolean;
  startedAt: Timestamp;
  endedAt?: Timestamp;
  activatedBy: string;
  approvedBy: string[];
  exceptionRoles: string[]; // Roles that can bypass
  metadata: Record<string, any>;
}

export interface ApprovedMessage {
  id: string;
  freezeId: string;
  channel: 'internal' | 'social_media' | 'press' | 'email' | 'app' | 'website';
  audience: string;
  content: string;
  approvedBy: string;
  approvedAt: Timestamp;
  publishedAt?: Timestamp;
  publishedBy?: string;
  language: string;
  translations?: Record<string, string>;
  metadata: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Post-Incident Review Types
// ═══════════════════════════════════════════════════════════════════════════

export interface PostIncidentReview {
  id: string;
  incidentId: string;
  conductedBy: string[];
  reviewTeam: string[];
  startedAt: Timestamp;
  completedAt?: Timestamp;
  publishedAt?: Timestamp;
  status: 'in_progress' | 'completed' | 'published';
  executiveSummary: string;
  timeline: any[];
  impactAnalysis: {
    users: number;
    financial: number;
    reputation: string;
    technical: string;
  };
  responseEffectiveness: {
    detectionTime: number;
    responseTime: number;
    containmentTime: number;
    resolutionTime: number;
    slaCompliance: boolean;
    playbookEffectiveness?: string;
  };
  metadata: Record<string, any>;
}

export interface RootCauseAnalysis {
  id: string;
  pirId: string;
  methodology: 'five_whys' | 'fishbone' | 'fault_tree' | 'timeline' | 'hybrid';
  primaryCause: string;
  contributingFactors: string[];
  systemWeaknesses: string[];
  processGaps: string[];
  humanFactors: string[];
  preventable: boolean;
  recommendations: string[];
  createdAt: Timestamp;
  createdBy: string;
}

export interface CorrectiveAction {
  id: string;
  pirId: string;
  type: 'immediate' | 'short_term' | 'long_term' | 'preventive';
  category: 'technical' | 'process' | 'policy' | 'training' | 'monitoring';
  description: string;
  rationale: string;
  owner: string;
  team: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'testing' | 'completed' | 'verified' | 'cancelled';
  dueDate: Timestamp;
  completedAt?: Timestamp;
  verifiedAt?: Timestamp;
  verifiedBy?: string;
  estimatedEffort: number; // hours
  actualEffort?: number;
  dependencies: string[];
  successCriteria: string[];
  verificationMethod: string;
  metadata: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Crisis Mode State Types
// ═══════════════════════════════════════════════════════════════════════════

export type CrisisLevel = 'none' | 'monitoring' | 'active' | 'critical' | 'emergency';

export interface CrisisModeState {
  id: string;
  active: boolean;
  level: CrisisLevel;
  reason: string;
  activatedAt: Timestamp;
  activatedBy: string;
  deactivatedAt?: Timestamp;
  deactivatedBy?: string;
  relatedIncidents: string[];
  restrictions: {
    deploymentsFrozen: boolean;
    configChangesFrozen: boolean;
    nonEssentialServicesPaused: boolean;
    enhancedMonitoring: boolean;
    allHandsRequired: boolean;
  };
  communicationPlan: {
    internalFrequency: number; // minutes
    externalRequired: boolean;
    stakeholdersList: string[];
  };
  metadata: Record<string, any>;
}

export interface CrisisKillSwitch {
  id: string;
  name: string;
  description: string;
  scope: string[];
  active: boolean;
  activatedAt?: Timestamp;
  activatedBy?: string;
  reason?: string;
  reversible: boolean;
  reverseTimeMinutes?: number;
  relatedIncident?: string;
  metadata: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Audit Trail Types
// ═══════════════════════════════════════════════════════════════════════════

export interface IncidentAuditEntry {
  id: string;
  incidentId?: string;
  timestamp: Timestamp;
  actor: string;
  actorRole: string;
  action: string;
  resource: string;
  resourceId: string;
  before?: any;
  after?: any;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  errorMessage?: string;
  metadata: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Metrics Types
// ═══════════════════════════════════════════════════════════════════════════

export interface IncidentMetrics {
  id: string;
  period: string; // ISO date or "YYYY-MM" or "YYYY-Www"
  totalIncidents: number;
  byCategory: Record<IncidentCategory, number>;
  bySeverity: Record<IncidentSeverity, number>;
  byStatus: Record<IncidentStatus, number>;
  avgResponseTime: number;
  avgResolutionTime: number;
  slaCompliance: number; // percentage
  slaBreaches: number;
  criticalIncidents: number;
  autoDetected: number;
  playbooksExecuted: number;
  playbookSuccessRate: number;
  regulatorInteractions: number;
  communicationFreezes: number;
  completedPIRs: number;
  openCorrectiveActions: number;
  completedCorrectiveActions: number;
  mttr: number; // Mean Time To Recovery
  mttd: number; // Mean Time To Detect
  mtta: number; // Mean Time To Acknowledge
  calculatedAt: Timestamp;
}

// ═══════════════════════════════════════════════════════════════════════════
// Event Types for Functions
// ═══════════════════════════════════════════════════════════════════════════

export interface IncidentCreatedEvent {
  incident: Incident;
  triggeredBy: string;
  automated: boolean;
}

export interface IncidentEscalatedEvent {
  incidentId: string;
  from: IncidentSeverity;
  to: IncidentSeverity;
  reason: string;
  escalatedBy: string;
}

export interface PlaybookTriggeredEvent {
  playbookId: string;
  incidentId: string;
  executionId: string;
  automated: boolean;
  triggeredBy: string;
}

export interface CrisisActivatedEvent {
  level: CrisisLevel;
  reason: string;
  incidentIds: string[];
  activatedBy: string;
}

export interface RegulatorNotificationEvent {
  interactionId: string;
  regulatorName: string;
  incidentIds: string[];
  urgency: 'routine' | 'urgent' | 'critical';
}
