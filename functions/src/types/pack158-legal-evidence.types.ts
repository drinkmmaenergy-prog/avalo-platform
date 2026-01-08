/**
 * PACK 158 — Avalo Legal Evidence Vault & Court-Ready Case Export
 * 
 * Encrypted Storage · Safety Reports · Subpoena Support
 * NOT for Romance Policing · NOT for Surveillance
 * 
 * NON-NEGOTIABLE RULES:
 * - Vault CANNOT store conversations only because they mention sex
 * - Vault CANNOT store sexual content between consenting adults unless unsafe or illegal
 * - Vault CANNOT store romantic messages unless tied to monetization or abuse
 * - Vault CANNOT be used for "jealous monitoring," "checking loyalty," or voyeurism
 * - Export only via court subpoena, law enforcement order, or user's own request
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// EVIDENCE CATEGORIES (Legal Safety Only)
// ============================================================================

/**
 * Categories of evidence that ARE stored in vault (legal violations only)
 */
export enum LegalEvidenceCategory {
  CHILD_EXPLOITATION = 'CHILD_EXPLOITATION',
  VIOLENCE_THREATS = 'VIOLENCE_THREATS',
  HARASSMENT_HATE_CRIMES = 'HARASSMENT_HATE_CRIMES',
  BLACKMAIL_EXTORTION = 'BLACKMAIL_EXTORTION',
  FRAUD_FINANCIAL_CRIME = 'FRAUD_FINANCIAL_CRIME',
  IP_THEFT_PIRACY = 'IP_THEFT_PIRACY',
  REFUND_SCAMS = 'REFUND_SCAMS',
  SEXUAL_SERVICES_PRICING = 'SEXUAL_SERVICES_PRICING',
  EXTERNAL_NSFW_FUNNELS = 'EXTERNAL_NSFW_FUNNELS',
  CONSENT_WITHDRAWAL_IGNORED = 'CONSENT_WITHDRAWAL_IGNORED',
}

/**
 * Topics that are NEVER stored (protected privacy)
 */
export enum ProtectedPrivacyCategory {
  CONSENSUAL_SEXUAL_CONVERSATION = 'CONSENSUAL_SEXUAL_CONVERSATION',
  ROMANTIC_CONVERSATION = 'ROMANTIC_CONVERSATION',
  EROTIC_SEXTING = 'EROTIC_SEXTING',
  DATING_REQUESTS = 'DATING_REQUESTS',
  EROTIC_PHOTOS_CONSENSUAL = 'EROTIC_PHOTOS_CONSENSUAL',
}

/**
 * Severity level for legal violations
 */
export enum LegalViolationSeverity {
  MISDEMEANOR = 'MISDEMEANOR',
  FELONY = 'FELONY',
  FEDERAL_CRIME = 'FEDERAL_CRIME',
  INTERNATIONAL_CRIME = 'INTERNATIONAL_CRIME',
}

// ============================================================================
// LEGAL EVIDENCE VAULT
// ============================================================================

/**
 * Main vault storage for legal evidence
 */
export interface LegalEvidenceVault {
  vaultId: string;
  caseId: string;
  reporterId: string;
  reportedUserId: string;
  
  // Evidence classification
  category: LegalEvidenceCategory;
  severity: LegalViolationSeverity;
  
  // Encrypted evidence
  sealedEvidence: SealedLegalEvidence[];
  
  // Access control (strict)
  accessLog: VaultAccessLog[];
  exportRequests: ExportRequest[];
  
  // Retention policy
  createdAt: Timestamp;
  retentionUntil: Timestamp;
  autoDeleteAt: Timestamp;
  
  // Compliance
  gdprCompliant: boolean;
  jurisdictions: string[];
}

/**
 * Encrypted evidence item
 */
export interface SealedLegalEvidence {
  evidenceId: string;
  evidenceType: 'MESSAGE' | 'MEDIA' | 'TRANSACTION' | 'METADATA' | 'SCREENSHOT';
  
  // Encrypted data (AES-256-GCM)
  encryptedPayload: string;
  encryptionIV: string;
  authTag: string;
  
  // Evidence metadata (not encrypted)
  timestamp: Timestamp;
  sourceType: 'CHAT' | 'CALL' | 'POST' | 'TRANSACTION' | 'REPORT';
  sourceId: string;
  
  // Legal relevance
  legalRelevanceScore: number;
  violatesLaw: string[];
  
  // Chain of custody
  capturedBy: string;
  capturedAt: Timestamp;
  hashChecksum: string;
}

// ============================================================================
// EVIDENCE CLASSIFICATION ENGINE
// ============================================================================

/**
 * Input for evidence classification
 */
export interface EvidenceClassificationInput {
  contentType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'TRANSACTION';
  content: string | Buffer;
  context: {
    senderId: string;
    recipientId: string;
    conversationId?: string;
    timestamp: Timestamp;
    metadata: Record<string, any>;
  };
}

/**
 * Result of evidence classification
 */
export interface EvidenceClassificationResult {
  shouldStore: boolean;
  category?: LegalEvidenceCategory;
  severity?: LegalViolationSeverity;
  reasoning: string;
  
  // Protection checks
  isProtectedPrivacy: boolean;
  protectedCategory?: ProtectedPrivacyCategory;
  
  // Legal triggers
  triggeredLaws: string[];
  requiresImmediateAction: boolean;
  
  confidence: number;
}

// ============================================================================
// EXPORT CONTROL (Court Orders Only)
// ============================================================================

/**
 * Export request types (strictly controlled)
 */
export enum ExportRequestType {
  COURT_SUBPOENA = 'COURT_SUBPOENA',
  LAW_ENFORCEMENT_ORDER = 'LAW_ENFORCEMENT_ORDER',
  USER_OWN_REQUEST = 'USER_OWN_REQUEST',
}

/**
 * Forbidden export request types (explicitly rejected)
 */
export enum ForbiddenExportRequest {
  PARTNER_JEALOUSY = 'PARTNER_JEALOUSY',
  EMPLOYER_REQUEST = 'EMPLOYER_REQUEST',
  CREATOR_FAN_IDENTITY = 'CREATOR_FAN_IDENTITY',
  PERSONAL_DRAMA = 'PERSONAL_DRAMA',
}

/**
 * Export request record
 */
export interface ExportRequest {
  requestId: string;
  vaultId: string;
  
  // Request details
  requestType: ExportRequestType;
  requestedBy: string;
  requestedAt: Timestamp;
  
  // Legal authorization
  courtOrderId?: string;
  lawEnforcementAgency?: string;
  badgeNumber?: string;
  caseNumber?: string;
  
  // Approval workflow
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DELIVERED';
  approvedBy?: string;
  approvedAt?: Timestamp;
  rejectionReason?: string;
  
  // Delivery
  deliveredAt?: Timestamp;
  deliveryMethod?: 'SECURE_DOWNLOAD' | 'ENCRYPTED_EMAIL' | 'PHYSICAL_MEDIA';
  recipient: string;
  
  // Audit trail
  accessLog: ExportAccessLog[];
}

/**
 * Export request validation result
 */
export interface ExportRequestValidation {
  valid: boolean;
  allowedToRequest: boolean;
  requiresCourtOrder: boolean;
  errors: string[];
  forbiddenType?: ForbiddenExportRequest;
}

// ============================================================================
// ACCESS LOGGING (Chain of Custody)
// ============================================================================

/**
 * Vault access log entry
 */
export interface VaultAccessLog {
  accessId: string;
  vaultId: string;
  
  // Who accessed
  accessorId: string;
  accessorType: 'MODERATOR' | 'ADMIN' | 'LEGAL_TEAM' | 'LAW_ENFORCEMENT' | 'SYSTEM';
  
  // What was accessed
  evidenceIdsViewed: string[];
  actionTaken: 'VIEW' | 'EXPORT' | 'MODIFY' | 'DELETE';
  
  // When and why
  accessedAt: Timestamp;
  reason: string;
  legalBasis?: string;
  
  // Verification
  ipAddress: string;
  userAgent: string;
  signature: string;
}

/**
 * Export access log entry
 */
export interface ExportAccessLog {
  logId: string;
  exportRequestId: string;
  
  event: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'DOWNLOADED' | 'VERIFIED';
  performedBy: string;
  timestamp: Timestamp;
  notes?: string;
}

// ============================================================================
// LEGAL CASE MANAGEMENT
// ============================================================================

/**
 * Legal hold case
 */
export interface LegalHoldCase {
  caseId: string;
  
  // Case details
  caseType: 'CRIMINAL' | 'CIVIL' | 'REGULATORY' | 'INTERNAL';
  caseName: string;
  jurisdictions: string[];
  
  // Parties
  plaintiffId?: string;
  defendantId?: string;
  involvedUserIds: string[];
  
  // Vault references
  vaultIds: string[];
  
  // Legal team
  legalCounsel: string[];
  lawEnforcementContact?: string;
  
  // Status
  status: 'ACTIVE' | 'CLOSED' | 'APPEALED' | 'SETTLED';
  openedAt: Timestamp;
  closedAt?: Timestamp;
  
  // Retention override
  retentionOverride: boolean;
  retentionReason?: string;
}

// ============================================================================
// EVIDENCE TRIGGERS (What Gets Stored)
// ============================================================================

/**
 * Trigger configuration for evidence capture
 */
export interface EvidenceTriggerConfig {
  category: LegalEvidenceCategory;
  
  // Trigger conditions
  keywords: string[];
  patterns: RegExp[];
  aiModelThreshold: number;
  
  // Actions
  captureMessage: boolean;
  captureMedia: boolean;
  captureTransaction: boolean;
  captureMetadata: boolean;
  
  // Immediate actions
  openCase: boolean;
  notifyAuthorities: boolean;
  suspendUser: boolean;
  
  // Retention
  retentionDays: number;
  
  active: boolean;
}

/**
 * Default trigger configurations
 */
export const DEFAULT_EVIDENCE_TRIGGERS: Record<LegalEvidenceCategory, Partial<EvidenceTriggerConfig>> = {
  [LegalEvidenceCategory.CHILD_EXPLOITATION]: {
    captureMessage: true,
    captureMedia: true,
    captureTransaction: false,
    captureMetadata: true,
    openCase: true,
    notifyAuthorities: true,
    suspendUser: true,
    retentionDays: 2555,
  },
  [LegalEvidenceCategory.VIOLENCE_THREATS]: {
    captureMessage: true,
    captureMedia: true,
    captureTransaction: false,
    captureMetadata: true,
    openCase: true,
    notifyAuthorities: true,
    suspendUser: false,
    retentionDays: 730,
  },
  [LegalEvidenceCategory.HARASSMENT_HATE_CRIMES]: {
    captureMessage: true,
    captureMedia: true,
    captureTransaction: false,
    captureMetadata: false,
    openCase: true,
    notifyAuthorities: false,
    suspendUser: false,
    retentionDays: 365,
  },
  [LegalEvidenceCategory.BLACKMAIL_EXTORTION]: {
    captureMessage: true,
    captureMedia: true,
    captureTransaction: true,
    captureMetadata: true,
    openCase: true,
    notifyAuthorities: true,
    suspendUser: false,
    retentionDays: 730,
  },
  [LegalEvidenceCategory.FRAUD_FINANCIAL_CRIME]: {
    captureMessage: true,
    captureMedia: false,
    captureTransaction: true,
    captureMetadata: true,
    openCase: true,
    notifyAuthorities: true,
    suspendUser: false,
    retentionDays: 2555,
  },
  [LegalEvidenceCategory.IP_THEFT_PIRACY]: {
    captureMessage: false,
    captureMedia: true,
    captureTransaction: true,
    captureMetadata: true,
    openCase: false,
    notifyAuthorities: false,
    suspendUser: false,
    retentionDays: 365,
  },
  [LegalEvidenceCategory.REFUND_SCAMS]: {
    captureMessage: true,
    captureMedia: false,
    captureTransaction: true,
    captureMetadata: true,
    openCase: false,
    notifyAuthorities: false,
    suspendUser: false,
    retentionDays: 365,
  },
  [LegalEvidenceCategory.SEXUAL_SERVICES_PRICING]: {
    captureMessage: true,
    captureMedia: false,
    captureTransaction: true,
    captureMetadata: false,
    openCase: false,
    notifyAuthorities: false,
    suspendUser: false,
    retentionDays: 365,
  },
  [LegalEvidenceCategory.EXTERNAL_NSFW_FUNNELS]: {
    captureMessage: true,
    captureMedia: false,
    captureTransaction: false,
    captureMetadata: false,
    openCase: false,
    notifyAuthorities: false,
    suspendUser: false,
    retentionDays: 90,
  },
  [LegalEvidenceCategory.CONSENT_WITHDRAWAL_IGNORED]: {
    captureMessage: true,
    captureMedia: false,
    captureTransaction: false,
    captureMetadata: true,
    openCase: true,
    notifyAuthorities: false,
    suspendUser: false,
    retentionDays: 365,
  },
};

// ============================================================================
// PRIVACY PROTECTION RULES
// ============================================================================

/**
 * Privacy protection validation result
 */
export interface PrivacyProtectionCheck {
  isProtected: boolean;
  protectedCategory?: ProtectedPrivacyCategory;
  reasoning: string;
  cannotStore: boolean;
}

/**
 * Content safety vs privacy decision
 */
export interface SafetyPrivacyDecision {
  decision: 'STORE_EVIDENCE' | 'PROTECT_PRIVACY' | 'REQUIRES_REVIEW';
  category?: LegalEvidenceCategory | ProtectedPrivacyCategory;
  reasoning: string;
  confidence: number;
}

// ============================================================================
// COMPLIANCE & REPORTING
// ============================================================================

/**
 * Evidence retention policy
 */
export interface EvidenceRetentionPolicy {
  category: LegalEvidenceCategory;
  
  // Retention requirements
  minimumRetentionDays: number;
  maximumRetentionDays: number;
  
  // Auto-deletion
  autoDeleteEnabled: boolean;
  deleteAfterCaseClosure: boolean;
  gracePeriodDays: number;
  
  // Compliance
  gdprCompliant: boolean;
  ccpaCompliant: boolean;
  regulatoryBasis: string[];
}

/**
 * Transparency report data
 */
export interface EvidenceTransparencyReport {
  reportId: string;
  periodStart: Timestamp;
  periodEnd: Timestamp;
  
  // Statistics (anonymized)
  totalVaults: number;
  categoryCounts: Record<LegalEvidenceCategory, number>;
  severityCounts: Record<LegalViolationSeverity, number>;
  
  // Export requests
  totalExportRequests: number;
  approvedExports: number;
  rejectedExports: number;
  exportsByType: Record<ExportRequestType, number>;
  
  // No user identifiable information
  jurisdictions: string[];
  
  generatedAt: Timestamp;
}