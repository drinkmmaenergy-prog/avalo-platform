/**
 * PACK 173 — Avalo Global Abuse Firewall
 * Type Definitions
 * 
 * Anti-Harassment · Anti-Bullying · Anti-Defamation
 * No Mass-Dogpiling · Zero Witch-Hunting
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// ABUSE CATEGORIES
// ============================================================================

export type AbuseCategory =
  | 'HARASSMENT'
  | 'BULLYING'
  | 'DEFAMATION'
  | 'DOGPILING'
  | 'TARGETED_HATE'
  | 'ENCOURAGING_HARM'
  | 'BODY_SHAMING'
  | 'REVENGE_SHAMING'
  | 'SEXUALIZED_BULLYING'
  | 'TRAUMA_EXPLOITATION'
  | 'WITCH_HUNTING';

export type ContentType =
  | 'COMMENT'
  | 'POST'
  | 'MESSAGE'
  | 'STORY'
  | 'PROFILE_BIO';

export type AbuseStatus =
  | 'DETECTED'
  | 'UNDER_REVIEW'
  | 'CONFIRMED'
  | 'FALSE_POSITIVE'
  | 'RESOLVED'
  | 'ESCALATED';

export type MitigationAction =
  | 'STEALTH_HIDE'
  | 'THROTTLE'
  | 'AUTO_MUTE'
  | 'BLOCK_CHAIN'
  | 'RESTRICT_LINK_PREVIEW'
  | 'FREEZE_COMMENTS'
  | 'ENABLE_SHIELD_MODE'
  | 'REQUEST_EVIDENCE'
  | 'REMOVE_CONTENT'
  | 'SOFT_WARNING'
  | 'HARD_WARNING'
  | 'TEMP_BAN'
  | 'PERMANENT_BAN';

// ============================================================================
// ABUSE CASE MODELS
// ============================================================================

export interface AbuseCase {
  caseId: string;
  targetUserId: string;
  targetType: 'USER' | 'CREATOR' | 'EVENT_HOST' | 'BRAND';
  abuseCategory: AbuseCategory;
  severity: number; // 0-100
  confidence: number; // 0-1
  status: AbuseStatus;
  
  // Evidence
  contentIds: string[]; // Comments, posts, etc.
  reportIds: string[];
  evidenceSummary: string;
  
  // Detection metadata
  detectedAt: Timestamp;
  detectionMethod: 'AUTO' | 'USER_REPORT' | 'MODERATOR_FLAG';
  
  // Patterns detected
  patterns: AbusePattern[];
  
  // Mitigation applied
  mitigationActions: MitigationAction[];
  mitigationAppliedAt?: Timestamp;
  
  // Review tracking
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  reviewNotes?: string;
  
  // Resolution
  resolvedAt?: Timestamp;
  resolutionType?: 'CONFIRMED' | 'FALSE_POSITIVE' | 'NO_ACTION';
  resolutionNotes?: string;
  
  updatedAt: Timestamp;
}

export interface AbusePattern {
  patternType: 
    | 'REPEATED_INSULTS'
    | 'COORDINATED_ATTACK'
    | 'MASS_REPOST'
    | 'VELOCITY_SPIKE'
    | 'DEFAMATION_CLAIM'
    | 'TRAUMA_REFERENCE'
    | 'IDENTITY_ATTACK'
    | 'BODY_COMMENT'
    | 'HARM_ENCOURAGEMENT';
  
  matchCount: number;
  confidence: number;
  evidence: string[];
  metadata: Record<string, any>;
}

// ============================================================================
// ABUSE EVENT (Real-time tracking)
// ============================================================================

export interface AbuseEvent {
  eventId: string;
  caseId?: string; // Linked to case if one exists
  
  targetUserId: string;
  targetContentId?: string;
  targetContentType?: ContentType;
  
  // Perpetrator(s)
  perpetratorUserIds: string[];
  
  eventType: AbuseCategory;
  severity: number;
  confidence: number;
  
  content: string;
  contentSnapshot?: any; // Original content for evidence
  
  // Context
  isPartOfRaid: boolean;
  raidId?: string;
  isCoordinated: boolean;
  coordinationEvidence?: string[];
  
  detectedAt: Timestamp;
  mitigated: boolean;
  mitigationAction?: MitigationAction;
}

// ============================================================================
// COMMENT RAID DETECTION
// ============================================================================

export interface CommentRaid {
  raidId: string;
  targetUserId: string;
  targetContentId: string;
  targetContentType: ContentType;
  
  // Raid characteristics
  participantUserIds: string[];
  participantCount: number;
  commentCount: number;
  
  startedAt: Timestamp;
  endedAt?: Timestamp;
  duration?: number; // seconds
  
  // Patterns
  repeatedPhrase?: string;
  repeatedPhraseCount?: number;
  coordinationEvidence: string[];
  
  severity: number;
  
  // Mitigation
  mitigated: boolean;
  mitigationActions: MitigationAction[];
  mitigatedAt?: Timestamp;
  
  status: 'ACTIVE' | 'ENDED' | 'MITIGATED';
  updatedAt: Timestamp;
}

// ============================================================================
// DEFAMATION REPORTS
// ============================================================================

export interface DefamationReport {
  reportId: string;
  caseId?: string;
  
  targetUserId: string;
  accuserUserId: string;
  
  contentId: string;
  contentType: ContentType;
  contentSnapshot: string;
  
  // Defamation analysis
  defamationType: 'FACTUAL_CLAIM' | 'CRIME_ACCUSATION' | 'REPUTATION_ATTACK';
  claimsMadeWithoutEvidence: string[];
  
  // Status
  status: 'PENDING_EVIDENCE' | 'EVIDENCE_PROVIDED' | 'NO_EVIDENCE' | 'REMOVED';
  
  // Evidence request
  evidenceRequested: boolean;
  evidenceRequestedAt?: Timestamp;
  evidenceProvidedAt?: Timestamp;
  evidenceDescription?: string;
  
  // Actions
  throttled: boolean;
  removed: boolean;
  markedForReview: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// CREATOR SHIELD MODE
// ============================================================================

export interface CreatorShieldSettings {
  userId: string;
  enabled: boolean;
  
  // Auto-filter settings
  autoFilterInsults: boolean;
  autoHideToxicComments: boolean;
  toxicCommentThreshold: number; // 0-100
  
  // Raid protection
  allowOnlyFollowersWhenRaid: boolean;
  rateLimitDuringSpikes: boolean;
  blockFreshAccounts: boolean;
  freshAccountAgeDays: number; // Default 7
  
  // Comment limits
  autoHideFirstNToxic: number; // Default 100
  requireApprovalForNegative: boolean;
  
  // Active raid detection
  currentlyUnderRaid: boolean;
  lastRaidDetectedAt?: Timestamp;
  
  updatedAt: Timestamp;
}

// ============================================================================
// HARASSMENT SANCTIONS
// ============================================================================

export interface HarassmentSanction {
  sanctionId: string;
  userId: string;
  caseId: string;
  
  level: 1 | 2 | 3 | 4 | 5;
  action: 
    | 'SOFT_WARNING'
    | 'CONTENT_REMOVAL'
    | 'COMMENT_FREEZE'
    | 'GLOBAL_POSTING_FREEZE'
    | 'PERMANENT_BAN';
  
  // Freeze durations in hours
  freezeDuration?: number; // 24-168 hours
  freezeStartedAt?: Timestamp;
  freezeEndsAt?: Timestamp;
  
  // Ban details
  permanentBan: boolean;
  deviceBlocked: boolean;
  
  reason: string;
  appliedBy: 'SYSTEM' | string; // Admin user ID
  
  active: boolean;
  appealable: boolean;
  appealed: boolean;
  appealReviewedAt?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// STEALTH MITIGATION (Hidden from target)
// ============================================================================

export interface StealthMitigation {
  mitigationId: string;
  contentId: string;
  contentType: ContentType;
  authorUserId: string;
  
  // Visibility control
  visibleToAuthor: boolean; // True - author can see it
  visibleToTarget: boolean; // False - target cannot see it
  visibleToPublic: boolean; // False - hidden from others
  
  reason: AbuseCategory;
  appliedAt: Timestamp;
  expiresAt?: Timestamp;
}

// ============================================================================
// VELOCITY THROTTLE
// ============================================================================

export interface VelocityThrottle {
  throttleId: string;
  targetUserId: string;
  contentId: string;
  
  // Rate limiting
  commentCount: number;
  timeWindowMinutes: number;
  threshold: number;
  
  throttleActive: boolean;
  throttleStartedAt: Timestamp;
  throttleEndsAt: Timestamp;
  
  raidSuspected: boolean;
  raidId?: string;
}

// ============================================================================
// TRAUMA SAFETY VIOLATION
// ============================================================================

export interface TraumaSafetyViolation {
  violationId: string;
  contentId: string;
  contentType: ContentType;
  
  victimUserId: string; // Person whose trauma was exploited
  perpetratorUserId: string;
  
  violationType:
    | 'TRAUMA_SHAMING'
    | 'THERAPY_MOCKING'
    | 'RECEIPT_DEMAND'
    | 'TRAUMA_MONETIZATION';
  
  contentSnapshot: string;
  removed: boolean;
  sanctionApplied: boolean;
  
  createdAt: Timestamp;
}

// ============================================================================
// ABUSE CASE TRACKING (For victims)
// ============================================================================

export interface UserAbuseCaseLink {
  userId: string;
  caseIds: string[];
  
  // Victim protection
  totalCasesAsVictim: number;
  activeCasesAsVictim: number;
  shieldModeRecommended: boolean;
  
  // Perpetrator tracking
  totalCasesAsPerpetrator: number;
  activeSanctions: string[]; // Sanction IDs
  
  lastUpdatedAt: Timestamp;
}

// ============================================================================
// DETECTION CONFIGURATION
// ============================================================================

export interface AbuseDetectionConfig {
  // Thresholds
  harassmentThreshold: number; // Severity 0-100
  bullyingThreshold: number;
  defamationThreshold: number;
  
  // Raid detection
  raidMinParticipants: number; // Default 10
  raidMinComments: number; // Default 15
  raidTimeWindowMinutes: number; // Default 10
  
  // Velocity thresholds
  normalCommentRate: number; // Comments per hour
  suspiciousCommentRate: number;
  
  // Auto-actions
  autoMuteAtSeverity: number; // Default 80
  autoRemoveAtSeverity: number; // Default 90
  autoThrottleEnabled: boolean;
  
  // Evidence requirements
  requireEvidenceForDefamation: boolean;
  evidenceWaitHours: number; // Default 48
  
  updatedAt: Timestamp;
}

// ============================================================================
// API TYPES
// ============================================================================

export interface ReportAbuseRequest {
  targetUserId: string;
  targetContentId?: string;
  targetContentType?: ContentType;
  
  category: AbuseCategory;
  description: string;
  severity: number; // User-perceived 1-10
  
  // Optional evidence
  screenshotUrls?: string[];
  additionalContext?: string;
}

export interface ReportAbuseResponse {
  success: boolean;
  caseId: string;
  caseCreated: boolean;
  message: string;
  victimProtectionEnabled: boolean;
}

export interface GetAbuseCaseResponse {
  case: AbuseCase;
  events: AbuseEvent[];
  sanctions: HarassmentSanction[];
  canAppeal: boolean;
}

export interface AppeelSanctionRequest {
  sanctionId: string;
  appealReason: string;
  additionalEvidence?: string;
}