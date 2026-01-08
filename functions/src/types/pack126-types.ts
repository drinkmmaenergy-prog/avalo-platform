/**
 * PACK 126 — Avalo End-to-End Safety Framework
 * Universal Consent Protocol · Harassment Shields · Background Risk Orchestration
 * 
 * Type definitions for the unified safety architecture
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// UNIVERSAL CONSENT PROTOCOL
// ============================================================================

export type ConsentState = 
  | 'PENDING'           // No communication yet - initial state
  | 'ACTIVE_CONSENT'    // Full communication enabled
  | 'PAUSED'            // Temporarily disabled by user
  | 'REVOKED';          // Permanently revoked - no chat allowed

export interface UserConsentRecord {
  userId: string;
  counterpartId: string;
  state: ConsentState;
  
  // Timestamps
  createdAt: Timestamp;
  lastUpdatedAt: Timestamp;
  activeConsentGrantedAt?: Timestamp;
  pausedAt?: Timestamp;
  revokedAt?: Timestamp;
  
  // Communication capabilities
  canSendMessages: boolean;
  canSendMedia: boolean;
  canMakeCalls: boolean;
  canSendLocation: boolean;
  canSendEventInvites: boolean;
  
  // Refund tracking (only for non-delivered content)
  pendingRefunds: string[];  // Transaction IDs
  
  // Audit trail
  stateHistory: ConsentStateChange[];
  
  // Metadata
  initiatedBy: string;  // userId who initiated connection
  connectionSource: 'DISCOVERY' | 'SEARCH' | 'EVENT' | 'REFERRAL';
}

export interface ConsentStateChange {
  fromState: ConsentState;
  toState: ConsentState;
  changedBy: string;
  changedAt: Timestamp;
  reason?: string;
}

export interface ConsentRequest {
  fromUserId: string;
  toUserId: string;
  requestType: 'MESSAGE' | 'MEDIA' | 'CALL' | 'LOCATION' | 'EVENT_INVITE';
  metadata?: Record<string, any>;
}

export interface ConsentCheckResult {
  allowed: boolean;
  state: ConsentState;
  reason?: string;
  requiresAction?: 'REQUEST_CONSENT' | 'REACTIVATE_CONSENT';
}

// ============================================================================
// HARASSMENT SHIELD SYSTEM
// ============================================================================

export type HarassmentShieldLevel = 
  | 'NONE'           // No issues detected
  | 'LOW'            // Slow mode enabled
  | 'MEDIUM'         // Reply-only mode
  | 'HIGH'           // Hard block + case
  | 'CRITICAL';      // Emergency lockdown

export interface HarassmentDetectionSignal {
  type: 
    | 'SPAM_BURST'              // Rapid messaging
    | 'REPEATED_UNWANTED'       // Continued msgs after no response
    | 'IMPERSONATION_ATTEMPT'   // Profile/name mimicry
    | 'NSFW_PRESSURE'           // Coercion tactics
    | 'TRAUMA_RISK_PHRASE'      // Threatening language
    | 'BLOCK_EVASION'           // New account after block
    | 'COORDINATED_HARASSMENT'; // Multiple accounts
  
  confidence: number;  // 0-1
  detectedAt: Timestamp;
  evidence: Record<string, any>;
}

export interface HarassmentShieldState {
  userId: string;              // Protected user
  harasserId: string;          // Suspected harasser
  level: HarassmentShieldLevel;
  
  // Detection
  signals: HarassmentDetectionSignal[];
  riskScore: number;  // Aggregated 0-100
  
  // Actions taken
  slowModeEnabled: boolean;
  replyOnlyMode: boolean;
  hardBlocked: boolean;
  caseCreated: boolean;
  caseId?: string;
  
  // Timestamps
  activatedAt: Timestamp;
  lastEscalatedAt?: Timestamp;
  resolvedAt?: Timestamp;
  
  // Audit
  actions: HarassmentShieldAction[];
}

export interface HarassmentShieldAction {
  action: 
    | 'ENABLED_SLOW_MODE'
    | 'ENABLED_REPLY_ONLY'
    | 'CREATED_HARD_BLOCK'
    | 'CREATED_CASE'
    | 'ESCALATED_TO_CRITICAL'
    | 'LOCKED_ACCOUNT';
  
  takenAt: Timestamp;
  reason: string;
  automaticAction: boolean;
}

// ============================================================================
// BACKGROUND RISK ORCHESTRATION
// ============================================================================

export interface RiskOrchestrationInput {
  userId: string;
  context: 'MESSAGE' | 'MEDIA_SEND' | 'CALL_REQUEST' | 'EVENT_INVITE' | 'LOCATION_SHARE';
  counterpartId?: string;
}

export interface RiskSignalSource {
  source: 
    | 'USER_REPORTS'              // PACK 85
    | 'TRUST_ENGINE'              // PACK 85
    | 'ENFORCEMENT_STATE'         // PACK 87
    | 'NSFW_CLASSIFIER'           // PACK 72
    | 'BEHAVIOR_PATTERNS'         // PACK 74
    | 'BAN_EVASION'              // Device fingerprinting
    | 'REGION_SAFETY'            // PACK 122
    | 'EVENT_RED_FLAGS'          // PACK 117/118
    | 'FRAUD_ATTEMPTS'           // PACK 71
    | 'CONSENT_VIOLATIONS';      // This pack
  
  riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  details: Record<string, any>;
}

export interface RiskOrchestrationResult {
  action: 
    | 'NO_ACTION'
    | 'SOFT_SAFETY_WARNING'
    | 'CONSENT_RECONFIRM'
    | 'ENABLE_HARASSMENT_SHIELD'
    | 'QUEUE_FOR_REVIEW'
    | 'IMMEDIATE_LOCKDOWN';
  
  signals: RiskSignalSource[];
  aggregatedRisk: number;  // 0-100
  reasoning: string;
  
  // Follow-up actions
  notifyUser: boolean;
  createCase: boolean;
  adjustEnforcement: boolean;
}

// ============================================================================
// EVIDENCE-BASED MODERATION
// ============================================================================

export interface EvidenceVault {
  vaultId: string;
  caseId: string;
  reporterId: string;
  reportedUserId: string;
  
  // Encrypted evidence
  sealedMessages: SealedEvidence[];
  sealedMedia: SealedEvidence[];
  sealedMetadata: SealedEvidence[];
  
  // Access control
  accessRequests: VaultAccessRequest[];
  accessGranted: VaultAccessGrant[];
  
  // Timestamps
  createdAt: Timestamp;
  sealedAt: Timestamp;
  expiresAt: Timestamp;  // Auto-purge after resolution + 90 days
}

export interface SealedEvidence {
  evidenceId: string;
  evidenceType: 'MESSAGE' | 'MEDIA' | 'METADATA' | 'SCREENSHOT';
  encryptedData: string;  // AES-256 encrypted
  encryptionKey: string;  // Stored separately, admin-only
  timestamp: Timestamp;
  relevanceScore: number;  // How relevant to report
}

export interface VaultAccessRequest {
  requestId: string;
  moderatorId: string;
  requestedAt: Timestamp;
  approvedBy?: string;
  approvedAt?: Timestamp;
  reason: string;
  scopeRequested: 'MESSAGES_ONLY' | 'MEDIA_ONLY' | 'FULL_CONTEXT';
}

export interface VaultAccessGrant {
  grantId: string;
  moderatorId: string;
  grantedBy: string;
  grantedAt: Timestamp;
  expiresAt: Timestamp;
  scope: 'MESSAGES_ONLY' | 'MEDIA_ONLY' | 'FULL_CONTEXT';
  accessed: boolean;
  accessedAt?: Timestamp;
}

// ============================================================================
// SAFETY DASHBOARD
// ============================================================================

export interface SafetyDashboard {
  userId: string;
  
  // Safety insights (non-numerical)
  safetyLevel: 'PROTECTED' | 'STANDARD' | 'NEEDS_ATTENTION';
  activeProtections: string[];
  
  // Consent management
  consentHistory: {
    totalConnections: number;
    activeConsents: number;
    pausedConsents: number;
    revokedConsents: number;
  };
  
  // Contact management
  contactsPaused: string[];
  contactsRevoked: string[];
  blockedUsers: string[];
  
  // Available tools
  availableTools: SafetyTool[];
  
  // Recent activity (sanitized)
  recentSafetyActions: SafetyDashboardAction[];
  
  // Timestamps
  lastUpdatedAt: Timestamp;
}

export interface SafetyTool {
  toolId: string;
  name: string;
  description: string;
  category: 'CONSENT' | 'BLOCKING' | 'REPORTING' | 'SUPPORT' | 'PRIVACY';
  enabled: boolean;
  lastUsed?: Timestamp;
}

export interface SafetyDashboardAction {
  action: string;
  timestamp: Timestamp;
  outcome: string;
  // No user IDs exposed - privacy-first
}

// ============================================================================
// TRAUMA-AWARE UX
// ============================================================================

export interface TraumaAwarePrompt {
  promptId: string;
  triggerContext: 'UNCOMFORTABLE' | 'UNSAFE' | 'OVERWHELMED';
  
  // User-friendly message
  title: string;
  message: string;
  
  // Actions offered
  actions: TraumaAwareAction[];
  
  // No confrontation required
  requiresExplanation: false;
}

export interface TraumaAwareAction {
  actionType: 
    | 'PAUSE_CONSENT'
    | 'REVOKE_CONSENT'
    | 'BLOCK_USER'
    | 'CONTACT_SUPPORT'
    | 'TAKE_BREAK';
  
  label: string;
  destructive: boolean;
  immediate: boolean;  // Takes effect instantly
}

// ============================================================================
// AUDIT & COMPLIANCE
// ============================================================================

export interface SafetyAuditLog {
  logId: string;
  eventType:
    | 'CONSENT_GRANTED'
    | 'CONSENT_PAUSED'
    | 'CONSENT_REVOKED'
    | 'CONSENT_RESUMED'
    | 'HARASSMENT_SHIELD_ACTIVATED'
    | 'HARASSMENT_SHIELD_RESOLVED'
    | 'RISK_ORCHESTRATION_TRIGGERED'
    | 'EVIDENCE_VAULT_CREATED'
    | 'EVIDENCE_ACCESSED'
    | 'SAFETY_DASHBOARD_VIEWED';
  
  userId: string;
  affectedUserId?: string;
  
  details: Record<string, any>;
  timestamp: Timestamp;
  
  // Compliance
  gdprCompliant: boolean;
  retentionPeriod: number;  // days
}

// ============================================================================
// INTEGRATION TYPES
// ============================================================================

export interface SafetyFrameworkConfig {
  // Feature flags
  consentProtocolEnabled: boolean;
  harassmentShieldsEnabled: boolean;
  riskOrchestrationEnabled: boolean;
  evidenceVaultsEnabled: boolean;
  
  // Thresholds
  harassmentShieldThresholds: {
    lowRisk: number;
    mediumRisk: number;
    highRisk: number;
    criticalRisk: number;
  };
  
  // Timeouts
  consentRequestTimeout: number;  // seconds
  evidenceVaultRetention: number;  // days
  
  // Economic protection
  refundWindowMinutes: number;
}

export const DEFAULT_SAFETY_CONFIG: SafetyFrameworkConfig = {
  consentProtocolEnabled: true,
  harassmentShieldsEnabled: true,
  riskOrchestrationEnabled: true,
  evidenceVaultsEnabled: true,
  
  harassmentShieldThresholds: {
    lowRisk: 20,
    mediumRisk: 50,
    highRisk: 75,
    criticalRisk: 90,
  },
  
  consentRequestTimeout: 300,  // 5 minutes
  evidenceVaultRetention: 90,  // 90 days after case resolution
  
  refundWindowMinutes: 5,  // Only refund if content not delivered within 5 mins
};