/**
 * PACK 155: Firestore Data Retention Schemas
 * Collections for GDPR/CCPA/LGPD/PDPA compliance
 */

import { 
  DataCategory, 
  RetentionStatus, 
  ExportStatus, 
  DeletionStatus,
  PrivacyActionType 
} from '../types/data-retention.types';

/**
 * Collection: data_retention_logs
 * Tracks scheduled deletions for all user data
 */
export interface DataRetentionLogSchema {
  id: string;
  userId: string;
  category: DataCategory;
  dataId: string;
  dataType: string;
  scheduledDeletionDate: FirebaseFirestore.Timestamp;
  status: RetentionStatus;
  legalHoldReason?: string;
  legalHoldRequestedBy?: string;
  legalHoldDate?: FirebaseFirestore.Timestamp;
  deletedAt?: FirebaseFirestore.Timestamp;
  anonymizedAt?: FirebaseFirestore.Timestamp;
  metadata?: Record<string, any>;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export const dataRetentionLogsIndexes = [
  { fields: ['userId', 'category'], queryScope: 'COLLECTION' },
  { fields: ['userId', 'status'], queryScope: 'COLLECTION' },
  { fields: ['scheduledDeletionDate', 'status'], queryScope: 'COLLECTION' },
  { fields: ['status', 'category'], queryScope: 'COLLECTION' }
];

/**
 * Collection: data_export_requests
 * User data export requests (GDPR Article 15, CCPA §1798.110)
 */
export interface DataExportRequestSchema {
  id: string;
  userId: string;
  requestedAt: FirebaseFirestore.Timestamp;
  status: ExportStatus;
  exportCategories: DataCategory[];
  fileSize?: number;
  downloadUrl?: string;
  downloadExpiresAt?: FirebaseFirestore.Timestamp;
  downloadedAt?: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp;
  error?: string;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, any>;
}

export const dataExportRequestsIndexes = [
  { fields: ['userId', 'requestedAt'], queryScope: 'COLLECTION' },
  { fields: ['status', 'downloadExpiresAt'], queryScope: 'COLLECTION' }
];

/**
 * Collection: data_deletion_requests
 * Account deletion requests (GDPR Article 17, CCPA §1798.105)
 */
export interface DataDeletionRequestSchema {
  id: string;
  userId: string;
  userEmail: string;
  requestedAt: FirebaseFirestore.Timestamp;
  status: DeletionStatus;
  accountFrozenAt?: FirebaseFirestore.Timestamp;
  processingStartedAt?: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp;
  legalHoldReason?: string;
  legalHoldRequestedBy?: string;
  error?: string;
  deletionSteps: {
    step: string;
    description: string;
    status: 'pending' | 'completed' | 'failed';
    completedAt?: FirebaseFirestore.Timestamp;
    error?: string;
  }[];
  ipAddress: string;
  userAgent: string;
  confirmationToken?: string;
  metadata?: Record<string, any>;
}

export const dataDeletionRequestsIndexes = [
  { fields: ['userId', 'requestedAt'], queryScope: 'COLLECTION' },
  { fields: ['status', 'requestedAt'], queryScope: 'COLLECTION' }
];

/**
 * Collection: privacy_action_logs
 * Audit trail for all privacy-related actions
 */
export interface PrivacyActionLogSchema {
  id: string;
  userId: string;
  actionType: PrivacyActionType;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  timestamp: FirebaseFirestore.Timestamp;
}

export const privacyActionLogsIndexes = [
  { fields: ['userId', 'timestamp'], queryScope: 'COLLECTION' },
  { fields: ['actionType', 'timestamp'], queryScope: 'COLLECTION' }
];

/**
 * Collection: user_consent_settings
 * User privacy preferences (GDPR Article 7, CCPA Opt-Out)
 */
export interface UserConsentSettingsSchema {
  userId: string;
  locationTracking: boolean;
  analyticsData: boolean;
  emailMarketing: boolean;
  pushNotifications: boolean;
  cookieConsent: boolean;
  personalization: boolean;
  thirdPartySharing: boolean;
  consentVersion: string;
  consentHistory: {
    version: string;
    consentedAt: FirebaseFirestore.Timestamp;
    settings: Record<string, boolean>;
  }[];
  updatedAt: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
}

export const userConsentSettingsIndexes = [
  { fields: ['userId'], queryScope: 'COLLECTION', unique: true }
];

/**
 * Collection: data_retention_policies
 * System-wide retention policies configuration
 */
export interface DataRetentionPolicySchema {
  id: string;
  category: DataCategory;
  retentionMonths: number | null;
  deleteLogic: 'auto_delete' | 'user_controlled' | 'anonymize' | 'purge';
  legalRequirement?: string;
  description: string;
  active: boolean;
  effectiveDate: FirebaseFirestore.Timestamp;
  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export const dataRetentionPoliciesIndexes = [
  { fields: ['category', 'active'], queryScope: 'COLLECTION' }
];

/**
 * Collection: legal_holds
 * Legal hold requests that pause data deletion
 */
export interface LegalHoldSchema {
  id: string;
  userId: string;
  reason: string;
  requestedBy: string;
  requestedByRole: 'legal' | 'safety' | 'compliance' | 'law_enforcement';
  caseNumber?: string;
  categories: DataCategory[];
  appliedAt: FirebaseFirestore.Timestamp;
  releasedAt?: FirebaseFirestore.Timestamp;
  status: 'active' | 'released';
  notes?: string;
  legalDocumentPath?: string;
}

export const legalHoldsIndexes = [
  { fields: ['userId', 'status'], queryScope: 'COLLECTION' },
  { fields: ['status', 'appliedAt'], queryScope: 'COLLECTION' }
];

export const COLLECTION_NAMES = {
  DATA_RETENTION_LOGS: 'data_retention_logs',
  DATA_EXPORT_REQUESTS: 'data_export_requests',
  DATA_DELETION_REQUESTS: 'data_deletion_requests',
  PRIVACY_ACTION_LOGS: 'privacy_action_logs',
  USER_CONSENT_SETTINGS: 'user_consent_settings',
  DATA_RETENTION_POLICIES: 'data_retention_policies',
  LEGAL_HOLDS: 'legal_holds'
} as const;