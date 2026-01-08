/**
 * PACK 103 — Community Governance, Moderation Expansion & Federated Automated Enforcement
 * Type Definitions
 * 
 * NON-NEGOTIABLE RULES:
 * - No free tokens, no bonuses, no discounts, no cashback
 * - No changes to token price or 65/35 revenue split
 * - Enforcement cannot be influenced by payments or user popularity
 * - Moderation actions must be legally, ethically, and procedurally defensible
 * - No moderator can affect earnings or token flow directly
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// MODERATION LEVELS & ROLES
// ============================================================================

export type ModeratorLevel = 0 | 1 | 2 | 3;

export interface ModeratorRole {
  level: ModeratorLevel;
  name: 'USER' | 'COMMUNITY_MOD' | 'TRUSTED_MOD' | 'ADMIN';
  description: string;
  permissions: ModeratorPermission[];
}

export type ModeratorPermission =
  | 'FLAG_CONTENT'
  | 'FLAG_CHAT'
  | 'RECOMMEND_VISIBILITY_DOWNGRADE'
  | 'TEMPORARY_VISIBILITY_RESTRICTION'
  | 'TEMPORARY_POSTING_FREEZE'
  | 'MARK_KYC_PRIORITY'
  | 'FULL_ENFORCEMENT'
  | 'BAN_UNBAN'
  | 'KYC_REVIEW'
  | 'PAYOUT_HOLD';

export interface UserRoles {
  userId: string;
  roles: ModeratorRole['name'][];
  grantedAt: Timestamp;
  grantedBy: string;
  updatedAt: Timestamp;
}

// Moderation level definitions
export const MODERATOR_LEVELS: Record<ModeratorLevel, ModeratorRole> = {
  0: {
    level: 0,
    name: 'USER',
    description: 'Regular user - can report content/users',
    permissions: ['FLAG_CONTENT', 'FLAG_CHAT'],
  },
  1: {
    level: 1,
    name: 'COMMUNITY_MOD',
    description: 'Community moderator - can flag for review',
    permissions: ['FLAG_CONTENT', 'FLAG_CHAT', 'RECOMMEND_VISIBILITY_DOWNGRADE'],
  },
  2: {
    level: 2,
    name: 'TRUSTED_MOD',
    description: 'Trusted moderator - can trigger temporary enforcement',
    permissions: [
      'FLAG_CONTENT',
      'FLAG_CHAT',
      'RECOMMEND_VISIBILITY_DOWNGRADE',
      'TEMPORARY_VISIBILITY_RESTRICTION',
      'TEMPORARY_POSTING_FREEZE',
      'MARK_KYC_PRIORITY',
    ],
  },
  3: {
    level: 3,
    name: 'ADMIN',
    description: 'Avalo Safety Team - full enforcement authority',
    permissions: [
      'FLAG_CONTENT',
      'FLAG_CHAT',
      'RECOMMEND_VISIBILITY_DOWNGRADE',
      'TEMPORARY_VISIBILITY_RESTRICTION',
      'TEMPORARY_POSTING_FREEZE',
      'MARK_KYC_PRIORITY',
      'FULL_ENFORCEMENT',
      'BAN_UNBAN',
      'KYC_REVIEW',
      'PAYOUT_HOLD',
    ],
  },
};

// ============================================================================
// ENFORCEMENT CONFIDENCE MODEL
// ============================================================================

export interface EnforcementConfidence {
  userId: string;
  score: number; // 0.0 - 1.0
  sources: ConfidenceSource[];
  calculatedAt: Timestamp;
  factors: ConfidenceFactor[];
}

export interface ConfidenceSource {
  type: 'AI_SCAN' | 'COMMUNITY_FLAG' | 'TRUSTED_MOD_ACTION' | 'USER_REPORT' | 'VIOLATION_HISTORY' | 'ANOMALY_DETECTION';
  weight: number;
  contribution: number;
  timestamp: Timestamp;
  details?: Record<string, any>;
}

export interface ConfidenceFactor {
  factor: string;
  value: number;
  impact: number;
}

export type EnforcementConfidenceLevel = 'NONE' | 'SOFT' | 'HARD' | 'SUSPENSION_RISK';

export interface EnforcementConfidenceThresholds {
  none: number; // < 0.3
  soft: number; // 0.3 - 0.6
  hard: number; // 0.6 - 0.8
  suspensionRisk: number; // > 0.8
}

export const DEFAULT_CONFIDENCE_THRESHOLDS: EnforcementConfidenceThresholds = {
  none: 0.3,
  soft: 0.6,
  hard: 0.8,
  suspensionRisk: 0.8,
};

// ============================================================================
// MODERATION CASE (ENHANCED)
// ============================================================================

export type ModerationCaseStatus = 'OPEN' | 'UNDER_REVIEW' | 'PENDING_ACTION' | 'RESOLVED' | 'ESCALATED' | 'APPEALED';

export type ModerationCasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ModerationReasonCode =
  | 'NSFW_POLICY'
  | 'HARASSMENT'
  | 'SPAM'
  | 'SCAM'
  | 'IDENTITY_FRAUD'
  | 'KYC_MISMATCH'
  | 'MINOR_SAFETY'
  | 'CRIMINAL_ACTIVITY'
  | 'MONETIZATION_BYPASS'
  | 'GOVERNANCE_BYPASS'
  | 'HIGH_RISK_CONTENT'
  | 'PERSISTENT_VIOLATIONS'
  | 'COORDINATED_ABUSE';

export interface ModerationCase {
  caseId: string;
  subjectUserId: string;
  
  // Case lifecycle
  status: ModerationCaseStatus;
  priority: ModerationCasePriority;
  openedAt: Timestamp;
  openedBy: string; // 'AUTO' or moderator ID
  assigneeId?: string;
  resolvedAt?: Timestamp;
  
  // Case details
  reasonCodes: ModerationReasonCode[];
  description?: string;
  
  // Evidence tracking
  history: ModerationCaseHistoryEntry[];
  relatedReports: string[];
  relatedContent: string[];
  
  // Enforcement context
  enforcementConfidence?: number;
  currentEnforcementLevel?: string;
  
  // Resolution
  resolution?: ModerationResolution;
  
  // Metadata
  updatedAt: Timestamp;
}

export interface ModerationCaseHistoryEntry {
  timestamp: Timestamp;
  actorId: string;
  actorType: 'SYSTEM' | 'USER' | 'COMMUNITY_MOD' | 'TRUSTED_MOD' | 'ADMIN';
  action: string;
  details: string;
  metadata?: Record<string, any>;
}

export interface ModerationResolution {
  outcome: 'NO_ACTION' | 'WARNING' | 'TEMPORARY_RESTRICTION' | 'PERMANENT_RESTRICTION' | 'SUSPENSION' | 'ESCALATED';
  appliedEnforcement?: {
    accountStatus?: string;
    visibilityTier?: string;
    featureLocks?: string[];
    duration?: number;
  };
  reviewNote: string;
  reviewerId: string;
  resolvedAt: Timestamp;
}

// ============================================================================
// MODERATION ACTIONS (AUDIT LOG)
// ============================================================================

export type ModeratorActionType =
  | 'FLAG_FOR_REVIEW'
  | 'RECOMMEND_VISIBILITY_DOWNGRADE'
  | 'APPLY_VISIBILITY_RESTRICTION'
  | 'FREEZE_POSTING'
  | 'UNFREEZE_POSTING'
  | 'MARK_KYC_PRIORITY'
  | 'CREATE_CASE'
  | 'UPDATE_CASE'
  | 'ASSIGN_CASE'
  | 'RESOLVE_CASE'
  | 'APPLY_ENFORCEMENT'
  | 'REMOVE_ENFORCEMENT'
  | 'APPEAL_SUBMITTED'
  | 'APPEAL_REVIEWED';

export interface ModerationAuditLog {
  logId: string;
  caseId?: string;
  actorId: string;
  actorLevel: ModeratorLevel;
  targetUserId: string;
  actionType: ModeratorActionType;
  
  // Action details
  details: string;
  metadata?: Record<string, any>;
  
  // Context
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  
  // Reversibility
  reversible: boolean;
  reversedAt?: Timestamp;
  reversedBy?: string;
  
  // Timestamps
  createdAt: Timestamp;
}

// ============================================================================
// ENFORCEMENT APPEALS
// ============================================================================

export type AppealStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';

export interface EnforcementAppeal {
  appealId: string;
  caseId: string;
  userId: string;
  
  // Appeal details
  explanation: string;
  submittedAt: Timestamp;
  status: AppealStatus;
  
  // Review
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  reviewNotes?: string;
  
  // Outcome
  outcome?: {
    decision: 'UPHELD' | 'OVERTURNED' | 'MODIFIED';
    newEnforcement?: Record<string, any>;
    explanation: string;
  };
  
  updatedAt: Timestamp;
}

// ============================================================================
// VISIBILITY & POSTING RESTRICTIONS
// ============================================================================

export type VisibilityTierRestriction = 'NORMAL' | 'LOW' | 'HIDDEN';

export interface VisibilityRestriction {
  userId: string;
  tier: VisibilityTierRestriction;
  appliedAt: Timestamp;
  appliedBy: string;
  expiresAt?: Timestamp;
  reason: string;
  caseId?: string;
}

export interface PostingRestriction {
  userId: string;
  restricted: boolean;
  appliedAt: Timestamp;
  appliedBy: string;
  expiresAt?: Timestamp;
  reason: string;
  caseId?: string;
}

// ============================================================================
// RATE LIMITING & ABUSE DETECTION
// ============================================================================

export interface ModeratorActionRateLimit {
  moderatorId: string;
  actionType: ModeratorActionType;
  count: number;
  windowStart: Timestamp;
  windowEnd: Timestamp;
}

export interface RogueModeratorDetection {
  moderatorId: string;
  detectedAt: Timestamp;
  reason: string;
  falsePositiveRate: number;
  suspiciousPatterns: string[];
  autoSuspended: boolean;
  caseId: string;
}

// ============================================================================
// HUMAN-IN-LOOP PRIORITY QUEUE
// ============================================================================

export type ReviewPriorityReason =
  | 'IDENTITY_FRAUD'
  | 'KYC_MISMATCH'
  | 'HIGH_RISK_CONTENT'
  | 'MINOR_SAFETY'
  | 'CRIMINAL_ACTIVITY'
  | 'PERSISTENT_SPAM'
  | 'BYPASS_ATTEMPT';

export interface HumanReviewQueueItem {
  queueId: string;
  caseId: string;
  userId: string;
  priority: ModerationCasePriority;
  reason: ReviewPriorityReason;
  enforcementConfidence: number;
  queuedAt: Timestamp;
  assignedTo?: string;
  assignedAt?: Timestamp;
}

// ============================================================================
// TRANSPARENCY MESSAGING
// ============================================================================

export interface EnforcementNotificationContext {
  userId: string;
  actionType: 'VISIBILITY_DOWNGRADE' | 'POSTING_FREEZE' | 'TEMPORARY_SUSPENSION' | 'PERMANENT_SUSPENSION';
  message: string;
  canAppeal: boolean;
  appealDeadline?: Timestamp;
  supportLink: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getEnforcementLevelFromConfidence(score: number): EnforcementConfidenceLevel {
  const thresholds = DEFAULT_CONFIDENCE_THRESHOLDS;
  
  if (score < thresholds.none) return 'NONE';
  if (score < thresholds.soft) return 'SOFT';
  if (score < thresholds.hard) return 'HARD';
  return 'SUSPENSION_RISK';
}

export function canModeratorPerformAction(
  moderatorLevel: ModeratorLevel,
  action: ModeratorActionType
): boolean {
  const role = MODERATOR_LEVELS[moderatorLevel];
  
  // Map actions to required permissions
  const actionPermissionMap: Record<ModeratorActionType, ModeratorPermission> = {
    'FLAG_FOR_REVIEW': 'FLAG_CONTENT',
    'RECOMMEND_VISIBILITY_DOWNGRADE': 'RECOMMEND_VISIBILITY_DOWNGRADE',
    'APPLY_VISIBILITY_RESTRICTION': 'TEMPORARY_VISIBILITY_RESTRICTION',
    'FREEZE_POSTING': 'TEMPORARY_POSTING_FREEZE',
    'UNFREEZE_POSTING': 'TEMPORARY_POSTING_FREEZE',
    'MARK_KYC_PRIORITY': 'MARK_KYC_PRIORITY',
    'CREATE_CASE': 'FLAG_CONTENT',
    'UPDATE_CASE': 'FLAG_CONTENT',
    'ASSIGN_CASE': 'TEMPORARY_VISIBILITY_RESTRICTION',
    'RESOLVE_CASE': 'TEMPORARY_VISIBILITY_RESTRICTION',
    'APPLY_ENFORCEMENT': 'FULL_ENFORCEMENT',
    'REMOVE_ENFORCEMENT': 'FULL_ENFORCEMENT',
    'APPEAL_SUBMITTED': 'FLAG_CONTENT',
    'APPEAL_REVIEWED': 'FULL_ENFORCEMENT',
  };
  
  const requiredPermission = actionPermissionMap[action];
  return role.permissions.includes(requiredPermission);
}

export function getTransparencyMessage(
  actionType: EnforcementNotificationContext['actionType']
): string {
  const messages: Record<typeof actionType, string> = {
    'VISIBILITY_DOWNGRADE': "Your account's visibility has been temporarily reduced due to policy violations. You can continue using Avalo while our team reviews the case.",
    'POSTING_FREEZE': 'Your posting privileges are temporarily suspended due to recent safety concerns.',
    'TEMPORARY_SUSPENSION': 'Your account has been temporarily suspended due to policy violations. You may appeal this decision.',
    'PERMANENT_SUSPENSION': 'Your account has been permanently suspended due to serious policy violations. You may appeal this decision within 30 days.',
  };
  
  return messages[actionType];
}