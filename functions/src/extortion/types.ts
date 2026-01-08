export enum ExtortionSeverity {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4
}

export enum ExtortionType {
  SEXTORTION = 'sextortion',
  REVENGE_LEAK = 'revenge_leak',
  FINANCIAL_BLACKMAIL = 'financial_blackmail',
  EMOTIONAL_COERCION = 'emotional_coercion',
  EXPOSURE_THREAT = 'exposure_threat',
  HUMILIATION_THREAT = 'humiliation_threat',
  RELATIONSHIP_BLACKMAIL = 'relationship_blackmail'
}

export enum CaseStatus {
  PENDING = 'pending',
  INVESTIGATING = 'investigating',
  CONFIRMED = 'confirmed',
  REJECTED = 'rejected',
  RESOLVED = 'resolved',
  ESCALATED = 'escalated'
}

export enum EnforcementAction {
  FREEZE_ACCOUNT = 'freeze_account',
  SUSPEND_ACCOUNT = 'suspend_account',
  PERMANENT_BAN = 'permanent_ban',
  IP_BLOCK = 'ip_block',
  DEVICE_BLOCK = 'device_block',
  WITHHOLD_PAYOUTS = 'withhold_payouts',
  LEGAL_ESCALATION = 'legal_escalation',
  MULTI_ACCOUNT_SWEEP = 'multi_account_sweep'
}

export enum RecoveryAction {
  PRIVACY_CLEANUP = 'privacy_cleanup',
  USERNAME_CHANGE = 'username_change',
  PROFILE_IMAGE_REFRESH = 'profile_image_refresh',
  CONTENT_DELETION = 'content_deletion',
  LEGAL_RESOURCE_ACCESS = 'legal_resource_access',
  AI_SAFETY_SCRIPT = 'ai_safety_script'
}

export interface ExtortionCase {
  id: string;
  victimId: string;
  accusedId: string;
  type: ExtortionType;
  severity: ExtortionSeverity;
  status: CaseStatus;
  description: string;
  evidenceIds: string[];
  chatId?: string;
  messageIds: string[];
  detectionConfidence: number;
  autoDetected: boolean;
  reportedBy: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  resolution?: string;
  escalatedToLegal: boolean;
  moderatorNotes?: string[];
}

export interface BlackmailMessage {
  id: string;
  caseId: string;
  chatId: string;
  messageId: string;
  senderId: string;
  recipientId: string;
  victimId: string;
  content: string;
  detectedPatterns: string[];
  detectionConfidence: number;
  detectionMethod: 'keyword' | 'pattern' | 'ml' | 'manual';
  timestamp: Date;
  blocked: boolean;
  evidencePreserved: boolean;
}

export interface RevengeAttempt {
  id: string;
  attackerId: string;
  victimId: string;
  attemptType: 'upload' | 'share' | 'post' | 'threat';
  contentType?: string;
  contentHash?: string;
  blocked: boolean;
  reason: string;
  timestamp: Date;
  ipAddress?: string;
  deviceId?: string;
  associatedCaseId?: string;
}

export interface SafetyVaultRecord {
  id: string;
  victimId: string;
  caseId: string;
  recordType: 'message' | 'screenshot' | 'voice' | 'video' | 'document';
  encryptedContent: string;
  encryptionKey: string;
  fileSize: number;
  mimeType: string;
  originalFilename?: string;
  metadata: {
    uploadedAt: Date;
    source: string;
    verificationHash: string;
  };
  accessLog: Array<{
    userId: string;
    timestamp: Date;
    action: 'view' | 'export' | 'share';
    ipAddress?: string;
  }>;
  moderatorAccessGranted: boolean;
  legalExportRequested: boolean;
  createdAt: Date;
}

export interface ExtortionReport {
  id: string;
  reportedBy: string;
  victimId: string;
  accusedUserId: string;
  reportType: ExtortionType;
  description: string;
  evidenceUrls: string[];
  chatId?: string;
  messageIds: string[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'reviewed' | 'actioned' | 'dismissed';
  timestamp: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  actionTaken?: string;
}

export interface CaseAppeal {
  id: string;
  caseId: string;
  userId: string;
  appealReason: string;
  supportingEvidence: string[];
  status: 'pending' | 'reviewing' | 'approved' | 'rejected';
  timestamp: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  outcome?: string;
}

export interface ExtortionPattern {
  id: string;
  patternType: 'keyword' | 'phrase' | 'behavioral' | 'contextual';
  pattern: string;
  regex?: string;
  severity: ExtortionSeverity;
  confidence: number;
  language: string;
  active: boolean;
  detectionCount: number;
  falsePositiveRate: number;
  lastDetected: Date;
  createdAt: Date;
}

export interface EnforcementActionRecord {
  id: string;
  caseId: string;
  targetUserId: string;
  actionType: EnforcementAction;
  severity: ExtortionSeverity;
  reason: string;
  executedBy: 'system' | 'moderator' | 'admin';
  executedById?: string;
  timestamp: Date;
  details: {
    accountFrozen?: boolean;
    payoutsWithheld?: boolean;
    ipBlocked?: string[];
    deviceBlocked?: string[];
    durationDays?: number;
    appealable: boolean;
  };
  reversible: boolean;
  reversedAt?: Date;
  reversedBy?: string;
}

export interface RecoveryRequest {
  id: string;
  userId: string;
  caseId?: string;
  requestedActions: RecoveryAction[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timestamp: Date;
  processedAt?: Date;
  completedActions: RecoveryAction[];
  failedActions: Array<{
    action: RecoveryAction;
    reason: string;
  }>;
  notes?: string;
}

export interface LegalExportRequest {
  id: string;
  caseId: string;
  requestedBy: string;
  requestType: 'victim' | 'law_enforcement' | 'court_order';
  jurisdiction: string;
  caseNumber?: string;
  authorizedBy?: string;
  status: 'pending' | 'approved' | 'processing' | 'completed' | 'denied';
  exportFormat: 'pdf' | 'json' | 'encrypted_archive';
  includeMetadata: boolean;
  timestamp: Date;
  approvedAt?: Date;
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
}

export interface BlockedUploadAttempt {
  id: string;
  userId: string;
  contentType: string;
  contentHash: string;
  uploadType: 'profile' | 'post' | 'message' | 'story';
  blockReason: string;
  detectionMethod: 'hash_match' | 'ml_detection' | 'metadata' | 'manual_flag';
  timestamp: Date;
  ipAddress?: string;
  deviceId?: string;
  relatedCaseId?: string;
  victimNotified: boolean;
}

export interface ExtortionRing {
  id: string;
  members: string[];
  memberCount: number;
  coordinated: boolean;
  tactics: string[];
  victimIds: string[];
  caseIds: string[];
  detectedAt: Date;
  status: 'active' | 'monitoring' | 'disrupted' | 'neutralized';
  severity: ExtortionSeverity;
  lawEnforcementNotified: boolean;
  notes?: string;
}

export interface EmotionalBlackmailPattern {
  id: string;
  patternType: 'abandonment_threat' | 'shame_pressure' | 'guilt_trap' | 'status_threat';
  description: string;
  examplePhrases: string[];
  confidence: number;
  requiresFinancialContext: boolean;
  active: boolean;
  detectionCount: number;
  lastDetected: Date;
}

export interface VictimSafetyRecord {
  userId: string;
  activeCases: number;
  historicalCases: number;
  vaultRecordCount: number;
  lastIncidentDate?: Date;
  highRiskProfile: boolean;
  protectionLevel: 'standard' | 'enhanced' | 'maximum';
  recoveryActionsApplied: RecoveryAction[];
  legalResourcesProvided: boolean;
  counselingSupportOffered: boolean;
  privacySettingsEnhanced: boolean;
  updatedAt: Date;
}

export interface DetectionResult {
  isExtortion: boolean;
  confidence: number;
  type?: ExtortionType;
  severity?: ExtortionSeverity;
  patterns: string[];
  requiresImmediateAction: boolean;
  suggestedActions: EnforcementAction[];
  evidenceSnippets: string[];
}