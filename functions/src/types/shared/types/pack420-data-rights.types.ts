// Pack 420 - Data Rights Types
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
  SOFT_FROZEN = 'SOFT_FROZEN',
}

export enum GatedFeature {
  MESSAGING = 'MESSAGING',
  PAYMENTS = 'PAYMENTS',
  CONTENT_UPLOAD = 'CONTENT_UPLOAD',
  PROFILE_EDIT = 'PROFILE_EDIT',
  DISCOVERY = 'DISCOVERY',
  SWIPE = 'SWIPE',
  CHAT = 'CHAT',
  CALLS = 'CALLS',
  MEETINGS = 'MEETINGS',
  EVENTS = 'EVENTS',
  EARN = 'EARN',
  WITHDRAW = 'WITHDRAW',
  POST = 'POST',
  AI_COMPANIONS = 'AI_COMPANIONS',
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
  INVALID_STATUS_TRANSITION = 'INVALID_STATUS_TRANSITION',
  USER_ALREADY_DELETED = 'USER_ALREADY_DELETED',
  DUPLICATE_ACTIVE_DELETE_REQUEST = 'DUPLICATE_ACTIVE_DELETE_REQUEST',
  EXPORT_RATE_LIMIT_EXCEEDED = 'EXPORT_RATE_LIMIT_EXCEEDED',
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',
  ACCOUNT_PENDING_DELETION = 'ACCOUNT_PENDING_DELETION',
  ACCOUNT_FROZEN = 'ACCOUNT_FROZEN',
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

// Alias for compatibility
export type DataRightsRequest = DataRightsRequestInput;

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
