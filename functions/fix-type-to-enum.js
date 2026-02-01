/**
 * Fix type aliases that need to be enums
 * These types are being used as values in the code
 */

const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, 'src/types/shared');

// Pack 419 - Enforcement types - convert to enums
const pack419Content = `// Pack 419 - Enforcement Types
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
}

export enum EnforcementSource {
  AUTOMATED = 'AUTOMATED',
  MANUAL = 'MANUAL',
  APPEAL = 'APPEAL',
  SYSTEM = 'SYSTEM',
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
`;

// Pack 420 - Data rights types - convert to enums
const pack420Content = `// Pack 420 - Data Rights Types
export interface DataRequest {
  id?: string;
  userId?: string;
  type?: DataRequestType;
  status?: DataRequestStatus;
  requestedAt?: any;
  completedAt?: any;
  rawRequest?: any;
  [key: string]: any;
}

export enum DataRequestType {
  ACCESS = 'ACCESS',
  EXPORT = 'EXPORT',
  DELETE = 'DELETE',
  RECTIFY = 'RECTIFY',
  RESTRICT = 'RESTRICT',
  PORTABILITY = 'PORTABILITY',
}

export enum DataRequestStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export interface DataExport {
  id?: string;
  userId?: string;
  format?: 'JSON' | 'CSV' | 'PDF';
  downloadUrl?: string;
  expiresAt?: any;
  [key: string]: any;
}

export interface DataDeletionRequest {
  id?: string;
  userId?: string;
  scope?: DataDeletionScope;
  status?: DataRequestStatus;
  [key: string]: any;
}

export type DataDeletionScope = 'FULL' | 'PARTIAL' | 'ANONYMIZE';

export interface ConsentRecord {
  id?: string;
  userId?: string;
  consentType?: string;
  granted?: boolean;
  timestamp?: any;
  source?: string;
  [key: string]: any;
}

export interface DataRetentionPolicy {
  dataCategory?: string;
  retentionDays?: number;
  deletionStrategy?: 'HARD_DELETE' | 'SOFT_DELETE' | 'ANONYMIZE';
  [key: string]: any;
}

// Additional exports - converted to enums
export enum AccountLifecycleState {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_DELETION = 'PENDING_DELETION',
  DELETED = 'DELETED',
  ANONYMIZED = 'ANONYMIZED',
}

export enum GatedFeature {
  MESSAGING = 'MESSAGING',
  PAYMENTS = 'PAYMENTS',
  CONTENT_UPLOAD = 'CONTENT_UPLOAD',
  PROFILE_EDIT = 'PROFILE_EDIT',
  DISCOVERY = 'DISCOVERY',
}

export interface LifecycleCheckResult {
  allowed?: boolean;
  state?: AccountLifecycleState;
  blockedFeatures?: GatedFeature[];
  reason?: string;
  [key: string]: any;
}

export class DataRightsError extends Error {
  code: DataRightsErrorCode;
  details?: Record<string, any>;
  
  constructor(code: DataRightsErrorCode, message: string, details?: Record<string, any>) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'DataRightsError';
  }
}

export enum DataRightsErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  REQUEST_NOT_FOUND = 'REQUEST_NOT_FOUND',
  ALREADY_PROCESSING = 'ALREADY_PROCESSING',
  RATE_LIMITED = 'RATE_LIMITED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_STATE = 'INVALID_STATE',
  DELETION_BLOCKED = 'DELETION_BLOCKED',
}

export interface DataRightsRequestInput {
  id?: string;
  userId?: string;
  type?: DataRequestType;
  status?: DataRequestStatus;
  requestedAt?: any;
  completedAt?: any;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface CreateDataRightsRequestInput {
  userId?: string;
  type?: DataRequestType;
  reason?: string;
  [key: string]: any;
}

export interface UpdateDataRightsRequestInput {
  requestId?: string;
  status?: DataRequestStatus;
  notes?: string;
  [key: string]: any;
}

export interface DeletionJobResult {
  requestId?: string;
  success?: boolean;
  deletedCollections?: string[];
  errors?: string[];
  completedAt?: any;
  [key: string]: any;
}
`;

// Write the files
const pack419Path = path.join(basePath, 'types/pack419-enforcement.types.ts');
const pack420Path = path.join(basePath, 'types/pack420-data-rights.types.ts');

fs.writeFileSync(pack419Path, pack419Content);
console.log('✅ Rewrote pack419-enforcement.types.ts with enums');

fs.writeFileSync(pack420Path, pack420Content);
console.log('✅ Rewrote pack420-data-rights.types.ts with enums');

// Also fix pack435-event-types.ts for AttendeeStatus
const pack435Path = path.join(__dirname, 'src/pack435-event-types.ts');
const pack435Content = `// Pack 435 - Event Types
export interface EventConfig {
  id?: string;
  name?: string;
  description?: string;
  startTime?: any;
  endTime?: any;
  location?: string;
  maxAttendees?: number;
  ticketTiers?: TicketTierConfig[];
  status?: EventStatus;
  visibility?: EventVisibility;
  [key: string]: any;
}

export enum TicketTier {
  GENERAL = 'GENERAL',
  VIP = 'VIP',
  MEET_AND_GREET = 'MEET_AND_GREET',
  PREMIUM = 'PREMIUM',
  EARLY_BIRD = 'EARLY_BIRD',
}

export interface TicketTierConfig {
  tier?: TicketTier;
  price?: number;
  quantity?: number;
  description?: string;
  [key: string]: any;
}

export interface EventAttendee {
  userId?: string;
  eventId?: string;
  ticketTier?: TicketTier;
  status?: AttendeeStatus;
  purchasedAt?: any;
  checkedInAt?: any;
  [key: string]: any;
}

export enum AttendeeStatus {
  REGISTERED = 'registered',
  CONFIRMED = 'confirmed',
  CHECKED_IN = 'checked_in',
  NO_SHOW = 'no_show',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum EventStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

export enum EventVisibility {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
  FOLLOWERS_ONLY = 'FOLLOWERS_ONLY',
}
`;

fs.writeFileSync(pack435Path, pack435Content);
console.log('✅ Rewrote pack435-event-types.ts with enums');

console.log('\n✅ Type-to-enum conversions complete!');
