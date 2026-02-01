// Pack 419 - Enforcement Types
export interface EnforcementAction {
  id?: string;
  type?: EnforcementActionType;
  targetUserId?: string;
  reason?: string;
  severity?: EnforcementSeverity;
  duration?: number;
  metadata?: Record<string, any>;
  createdAt?: any;
  expiresAt?: any;
  [key: string]: any;
}

export enum EnforcementActionType {
  WARNING = 'WARNING',
  CONTENT_REMOVAL = 'CONTENT_REMOVAL',
  FEATURE_RESTRICTION = 'FEATURE_RESTRICTION',
  TEMPORARY_BAN = 'TEMPORARY_BAN',
  PERMANENT_BAN = 'PERMANENT_BAN',
  ACCOUNT_SUSPENSION = 'ACCOUNT_SUSPENSION',
  PERMA_BAN = 'PERMA_BAN',
  TEMP_RESTRICTION = 'TEMP_RESTRICTION',
  SHADOW_RESTRICTION = 'SHADOW_RESTRICTION',
}

export enum EnforcementSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface EnforcementPolicy {
  id?: string;
  name?: string;
  description?: string;
  triggers?: EnforcementTrigger[];
  actions?: EnforcementActionType[];
  enabled?: boolean;
  [key: string]: any;
}

export interface EnforcementTrigger {
  type?: string;
  threshold?: number;
  timeWindowHours?: number;
  [key: string]: any;
}

export interface EnforcementAppeal {
  id?: string;
  actionId?: string;
  userId?: string;
  reason?: string;
  status?: AppealStatus;
  reviewedBy?: string;
  reviewedAt?: any;
  [key: string]: any;
}

export interface EnforcementStats {
  totalActions?: number;
  byType?: Record<EnforcementActionType, number>;
  bySeverity?: Record<EnforcementSeverity, number>;
  appealRate?: number;
  [key: string]: any;
}

// Additional exports - converted to enums
export enum EnforcementScope {
  ACCOUNT = 'ACCOUNT',
  CONTENT = 'CONTENT',
  FEATURE = 'FEATURE',
  GLOBAL = 'GLOBAL',
  MESSAGING = 'MESSAGING',
  PAYMENTS = 'PAYMENTS',
  DISCOVERY = 'DISCOVERY',
  CALLS = 'CALLS',
  EVENTS = 'EVENTS',
  PROFILE = 'PROFILE',
  ACCOUNT_FULL = 'ACCOUNT_FULL',
  MONETIZATION = 'MONETIZATION',
  CHAT = 'CHAT',
  MEETINGS = 'MEETINGS',
  FEED = 'FEED',
  SWIPE = 'SWIPE',
  AI_COMPANIONS = 'AI_COMPANIONS',
}

export enum EnforcementSource {
  AUTOMATED = 'AUTOMATED',
  MANUAL = 'MANUAL',
  APPEAL = 'APPEAL',
  SYSTEM = 'SYSTEM',
  FRAUD_ENGINE = 'FRAUD_ENGINE',
}

export enum AppealStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ESCALATED = 'ESCALATED',
}

export enum EnforcementErrorCode {
  INVALID_ACTION = 'INVALID_ACTION',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  ALREADY_ENFORCED = 'ALREADY_ENFORCED',
  APPEAL_NOT_FOUND = 'APPEAL_NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_SCOPE = 'INVALID_SCOPE',
  INVALID_INPUT = 'INVALID_INPUT',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_ACTION_FOR_VIOLATION = 'INVALID_ACTION_FOR_VIOLATION',
  INVALID_SCOPE_COMBINATION = 'INVALID_SCOPE_COMBINATION',
  ENFORCEMENT_NOT_FOUND = 'ENFORCEMENT_NOT_FOUND',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  NOT_APPEALABLE = 'NOT_APPEALABLE',
  APPEAL_ALREADY_EXISTS = 'APPEAL_ALREADY_EXISTS',
  USER_RESTRICTED = 'USER_RESTRICTED',
}

export interface EnforcementDecision {
  actionType?: EnforcementActionType;
  severity?: EnforcementSeverity;
  reason?: string;
  duration?: number;
  scope?: EnforcementScope;
  [key: string]: any;
}

export interface IssueEnforcementInput {
  targetUserId?: string;
  actionType?: EnforcementActionType;
  reason?: string;
  severity?: EnforcementSeverity;
  duration?: number;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface CreateAppealInput {
  actionId?: string;
  reason?: string;
  evidence?: string[];
  [key: string]: any;
}

export interface UpdateAppealStatusInput {
  appealId?: string;
  status?: AppealStatus;
  reviewNotes?: string;
  [key: string]: any;
}

export interface RestrictionCheckResult {
  isRestricted?: boolean;
  restrictions?: EnforcementAction[];
  canAppeal?: boolean;
  [key: string]: any;
}

export interface EnforcementDecisionUserView {
  actionType?: EnforcementActionType;
  reason?: string;
  expiresAt?: any;
  canAppeal?: boolean;
  appealDeadline?: any;
  [key: string]: any;
}

export enum EnforcementReasonCode {
  SPAM = 'SPAM',
  HARASSMENT = 'HARASSMENT',
  FRAUD = 'FRAUD',
  INAPPROPRIATE_CONTENT = 'INAPPROPRIATE_CONTENT',
  TERMS_VIOLATION = 'TERMS_VIOLATION',
  SAFETY_CONCERN = 'SAFETY_CONCERN',
  OTHER = 'OTHER',
}
