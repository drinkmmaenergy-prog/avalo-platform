/**
 * PACK 155: Data Retention & Compliance Types
 * GDPR, CCPA, LGPD, PDPA compliant data retention system
 */

export enum DataCategory {
  CHATS_CALLS = 'chats_calls',
  PUBLIC_POSTS = 'public_posts',
  PAID_CONTENT = 'paid_content',
  IDENTITY_DOCS = 'identity_docs',
  AI_COMPANION = 'ai_companion',
  SAFETY_CASES = 'safety_cases',
  ANALYTICS_DATA = 'analytics_data',
  LOCATION_DATA = 'location_data',
  DEVICE_DATA = 'device_data'
}

export enum RetentionStatus {
  ACTIVE = 'active',
  SCHEDULED_DELETION = 'scheduled_deletion',
  LEGAL_HOLD = 'legal_hold',
  DELETED = 'deleted',
  ANONYMIZED = 'anonymized'
}

export enum ExportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  READY = 'ready',
  DOWNLOADED = 'downloaded',
  EXPIRED = 'expired',
  FAILED = 'failed'
}

export enum DeletionStatus {
  REQUESTED = 'requested',
  ACCOUNT_FROZEN = 'account_frozen',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  LEGAL_HOLD = 'legal_hold'
}

export enum PrivacyActionType {
  DATA_EXPORT_REQUESTED = 'data_export_requested',
  DATA_EXPORT_COMPLETED = 'data_export_completed',
  DATA_EXPORT_DOWNLOADED = 'data_export_downloaded',
  DATA_DELETION_REQUESTED = 'data_deletion_requested',
  DATA_DELETION_COMPLETED = 'data_deletion_completed',
  LEGAL_HOLD_APPLIED = 'legal_hold_applied',
  LEGAL_HOLD_RELEASED = 'legal_hold_released',
  CONSENT_UPDATED = 'consent_updated',
  AUTO_DELETION_EXECUTED = 'auto_deletion_executed'
}

export interface RetentionPolicy {
  category: DataCategory;
  retentionMonths: number | null;
  deleteLogic: 'auto_delete' | 'user_controlled' | 'anonymize' | 'purge';
  legalRequirement?: string;
  description: string;
}

export interface DataRetentionLog {
  id: string;
  userId: string;
  category: DataCategory;
  dataId: string;
  scheduledDeletionDate: Date;
  status: RetentionStatus;
  legalHoldReason?: string;
  legalHoldRequestedBy?: string;
  legalHoldDate?: Date;
  deletedAt?: Date;
  anonymizedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataExportRequest {
  id: string;
  userId: string;
  requestedAt: Date;
  status: ExportStatus;
  exportCategories: DataCategory[];
  downloadUrl?: string;
  downloadExpiresAt?: Date;
  downloadedAt?: Date;
  completedAt?: Date;
  error?: string;
  ipAddress: string;
  userAgent: string;
}

export interface DataDeletionRequest {
  id: string;
  userId: string;
  requestedAt: Date;
  status: DeletionStatus;
  accountFrozenAt?: Date;
  processingStartedAt?: Date;
  completedAt?: Date;
  legalHoldReason?: string;
  legalHoldRequestedBy?: string;
  error?: string;
  deletionSteps: DeletionStep[];
  ipAddress: string;
  userAgent: string;
}

export interface DeletionStep {
  step: string;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  completedAt?: Date;
  error?: string;
}

export interface PrivacyActionLog {
  id: string;
  userId: string;
  actionType: PrivacyActionType;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}

export interface UserConsentSettings {
  userId: string;
  locationTracking: boolean;
  analyticsData: boolean;
  emailMarketing: boolean;
  pushNotifications: boolean;
  cookieConsent: boolean;
  personalization: boolean;
  thirdPartySharing: boolean;
  updatedAt: Date;
}

export interface DataRetentionSummary {
  userId: string;
  categories: {
    category: DataCategory;
    itemCount: number;
    oldestItem: Date;
    scheduledDeletionDate?: Date;
    retentionPolicy: RetentionPolicy;
  }[];
  exportRequests: number;
  deletionRequests: number;
  lastExportDate?: Date;
  hasLegalHold: boolean;
}

export const RETENTION_POLICIES: Record<DataCategory, RetentionPolicy> = {
  [DataCategory.CHATS_CALLS]: {
    category: DataCategory.CHATS_CALLS,
    retentionMonths: 24,
    deleteLogic: 'auto_delete',
    description: 'Chats and calls auto-deleted after 24 months'
  },
  [DataCategory.PUBLIC_POSTS]: {
    category: DataCategory.PUBLIC_POSTS,
    retentionMonths: null,
    deleteLogic: 'user_controlled',
    description: 'Public posts retained until user deletion'
  },
  [DataCategory.PAID_CONTENT]: {
    category: DataCategory.PAID_CONTENT,
    retentionMonths: 84,
    deleteLogic: 'anonymize',
    legalRequirement: 'Financial records retention (7 years)',
    description: 'Paid content purchases anonymized after 7 years'
  },
  [DataCategory.IDENTITY_DOCS]: {
    category: DataCategory.IDENTITY_DOCS,
    retentionMonths: 0,
    deleteLogic: 'purge',
    description: 'Identity documents purged immediately after verification'
  },
  [DataCategory.AI_COMPANION]: {
    category: DataCategory.AI_COMPANION,
    retentionMonths: 6,
    deleteLogic: 'auto_delete',
    description: 'AI companion history auto-expires after 6 months'
  },
  [DataCategory.SAFETY_CASES]: {
    category: DataCategory.SAFETY_CASES,
    retentionMonths: 60,
    deleteLogic: 'anonymize',
    legalRequirement: 'Safety investigation records (5 years)',
    description: 'Safety cases anonymized after 5 years'
  },
  [DataCategory.ANALYTICS_DATA]: {
    category: DataCategory.ANALYTICS_DATA,
    retentionMonths: 12,
    deleteLogic: 'auto_delete',
    description: 'Analytics data auto-deleted after 12 months'
  },
  [DataCategory.LOCATION_DATA]: {
    category: DataCategory.LOCATION_DATA,
    retentionMonths: 6,
    deleteLogic: 'auto_delete',
    description: 'Location data auto-deleted after 6 months'
  },
  [DataCategory.DEVICE_DATA]: {
    category: DataCategory.DEVICE_DATA,
    retentionMonths: 12,
    deleteLogic: 'auto_delete',
    description: 'Device data auto-deleted after 12 months'
  }
};

export const EXPORT_DOWNLOAD_EXPIRY_HOURS = 48;
export const MAX_EXPORT_FILE_SIZE_MB = 500;
export const DELETION_FREEZE_PERIOD_DAYS = 30;