/**
 * PACK 339 — Type Definitions
 * Disaster Recovery & Legal Crisis Management
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// BACKUP TYPES
// ============================================================================

export type BackupEnvironment = 'STAGING' | 'PRODUCTION';
export type BackupType = 'SCHEDULED' | 'MANUAL';
export type BackupStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface BackupSnapshot {
  id: string;
  env: BackupEnvironment;
  type: BackupType;
  startedAt: Timestamp;
  completedAt?: Timestamp;
  includes: {
    firestore: boolean;
    storageMedia: boolean;
    functionsConfig: boolean;
  };
  rpoMinutes: number;
  status: BackupStatus;
  storageLocation?: string;
  errorMessage?: string;
}

export interface DisasterRecoveryPlan {
  id: string;
  env: BackupEnvironment;
  rpoTargetMinutes: number;
  rtoTargetMinutes: number;
  priorityOrder: string[];
  runbookUrl?: string;
  lastTestedAt?: Timestamp;
  lastTestResult?: 'PASS' | 'FAIL';
}

// ============================================================================
// LEGAL HOLD TYPES
// ============================================================================

export type LegalHoldReason = 
  | 'REGULATOR_REQUEST' 
  | 'COURT_ORDER' 
  | 'FRAUD_INVESTIGATION';

export interface LegalHold {
  id: string;
  userId?: string;
  reason: LegalHoldReason;
  createdAt: Timestamp;
  createdBy: 'ADMIN' | 'SYSTEM';
  createdByAdminId?: string;
  active: boolean;
  notes?: string;
}

export interface RegulatorLockState {
  id: 'GLOBAL';
  isRegulatorLockActive: boolean;
  activatedAt?: Timestamp;
  activatedBy?: string;
  reason?: string;
  deactivatedAt?: Timestamp;
  deactivatedBy?: string;
}

// ============================================================================
// EVIDENCE EXPORT TYPES
// ============================================================================

export type EvidenceExportType = 'USER_CASE' | 'REGULATOR_AUDIT';
export type ExportStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface EvidenceExportJob {
  id: string;
  type: EvidenceExportType;
  requestedByAdminId: string;
  targetUserId?: string;
  dateRange?: {
    from: Timestamp;
    to: Timestamp;
  };
  status: ExportStatus;
  createdAt: Timestamp;
  completedAt?: Timestamp;
  exportedLocation?: string;
  notes?: string;
  errorMessage?: string;
}

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================

export type RegulatorAuditAction = 
  | 'LEGAL_HOLD_APPLIED'
  | 'LEGAL_HOLD_REMOVED'
  | 'REGULATOR_LOCK_ACTIVATED'
  | 'REGULATOR_LOCK_DEACTIVATED'
  | 'EVIDENCE_EXPORT_REQUESTED'
  | 'BACKUP_COMPLETED'
  | 'BACKUP_FAILED'
  | 'DR_TEST_EXECUTED';

export interface RegulatorAuditLog {
  timestamp: Timestamp;
  action: RegulatorAuditAction;
  adminId?: string;
  targetUserId?: string | null;
  holdId?: string;
  jobId?: string;
  reason?: string;
  notes?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// ALERT TYPES
// ============================================================================

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type AlertType = 
  | 'BACKUP_FAILURE'
  | 'RPO_BREACH'
  | 'REGULATOR_LOCK_CHANGED'
  | 'LEGAL_HOLD_MASS_ACTIVATION';

export interface SystemAlert {
  type: AlertType;
  severity: AlertSeverity;
  timestamp: Timestamp;
  backupId?: string;
  rpoMinutes?: number;
  target?: number;
  activated?: boolean;
  holdCount?: number;
  errorMessage?: string;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface SimulateDRRequest {
  env: BackupEnvironment;
  snapshotId: string;
}

export interface SimulateDRResponse {
  success: boolean;
  snapshotId: string;
  validation: {
    valid: boolean;
    checks: Array<{
      name: string;
      passed: boolean;
      message?: string;
    }>;
  };
  restoreSimulation: Array<{
    priority: string;
    status: string;
    estimatedTimeMinutes: number;
  }>;
  estimatedRTOMinutes: number;
}

export interface ApplyLegalHoldRequest {
  userId?: string;
  reason: LegalHoldReason;
  notes?: string;
}

export interface ApplyLegalHoldResponse {
  success: boolean;
  holdId: string;
  userId: string | null;
  reason: LegalHoldReason;
}

export interface RemoveLegalHoldRequest {
  holdId: string;
}

export interface RemoveLegalHoldResponse {
  success: boolean;
  holdId: string;
}

export interface ToggleRegulatorLockRequest {
  activate: boolean;
  reason?: string;
}

export interface ToggleRegulatorLockResponse {
  success: boolean;
  isRegulatorLockActive: boolean;
}

export interface RequestEvidenceExportRequest {
  type: EvidenceExportType;
  targetUserId?: string;
  dateRange?: {
    from: number;
    to: number;
  };
  notes?: string;
}

export interface RequestEvidenceExportResponse {
  success: boolean;
  jobId: string;
  type: EvidenceExportType;
  status: ExportStatus;
}

export interface GetBackupStatusResponse {
  success: boolean;
  currentRPO: number;
  rpoTarget: number;
  rtoTarget: number;
  recentBackups: Array<BackupSnapshot & {
    startedAt: number;
    completedAt: number | null;
  }>;
}

export interface GetActiveLegalHoldsResponse {
  success: boolean;
  holds: Array<LegalHold & {
    createdAt: number;
  }>;
}

export interface GetRegulatorLockStatusResponse {
  success: boolean;
  isRegulatorLockActive: boolean;
  activatedAt: number | null;
  activatedBy: string | null;
  reason: string | null;
}

export interface GetEvidenceExportJobsRequest {
  limit?: number;
}

export interface GetEvidenceExportJobsResponse {
  success: boolean;
  jobs: Array<EvidenceExportJob & {
    createdAt: number;
    completedAt: number | null;
  }>;
}

// ============================================================================
// EVIDENCE DATA TYPES
// ============================================================================

export interface EvidenceDataUserCase {
  exportMetadata: {
    jobId: string;
    type: 'USER_CASE';
    requestedBy: string;
    createdAt: number;
    dateRange: {
      from: number;
      to: number;
    } | null;
  };
  profile?: any;
  walletTransactions?: any[];
  payouts?: any[];
  bookings?: any[];
  compliance?: any;
  enforcement?: any;
  legalAcceptances?: any[];
}

export interface EvidenceDataRegulatorAudit {
  exportMetadata: {
    jobId: string;
    type: 'REGULATOR_AUDIT';
    requestedBy: string;
    createdAt: number;
    dateRange: {
      from: number;
      to: number;
    } | null;
  };
  auditLogs?: any[];
  backupHistory?: any[];
  legalHolds?: any[];
}

export type EvidenceData = EvidenceDataUserCase | EvidenceDataRegulatorAudit;

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export interface ValidationCheck {
  name: string;
  passed: boolean;
  message?: string;
}

export interface ValidationResult {
  valid: boolean;
  checks: ValidationCheck[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const RECOVERY_PRIORITIES = [
  'WALLET',
  'AUTH',
  'CHAT',
  'CALENDAR',
  'AI',
  'FEED',
  'ANALYTICS',
  'ADMIN',
  'INVESTOR',
] as const;

export type RecoveryPriority = typeof RECOVERY_PRIORITIES[number];

export const BACKUP_COLLECTIONS = {
  critical: [
    'walletTransactions',
    'payoutRequests',
    'creatorBalances',
    'userProfiles',
    'userComplianceStatus',
    'kycVerifications',
    'regulatorAuditLogs',
    'legalAcceptances',
    'businessAuditLog',
    'enforcementState',
  ],
  operational: [
    'chats',
    'messages',
    'bookings',
    'events',
    'aiCompanions',
    'feedItems',
    'userSessions',
  ],
  analytics: [
    'kpiDaily',
    'kpiWeekly',
    'kpiMonthly',
    'metricsDaily',
  ],
} as const;

// ============================================================================
// ADMIN PERMISSION TYPES
// ============================================================================

export type AdminPermission = 'OPS' | 'LEGAL' | 'FINANCE' | 'SUPPORT';

export interface AdminUser {
  id: string;
  role: 'ADMIN' | 'MODERATOR' | 'VIEWER';
  permissions: AdminPermission[];
  email: string;
  createdAt: Timestamp;
}
