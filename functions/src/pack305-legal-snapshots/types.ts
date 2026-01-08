/**
 * PACK 305 — Legal & Audit Snapshot Export
 * TypeScript types and interfaces for legal snapshots
 */

// Snapshot types
export type SnapshotType = 
  | 'INVESTOR_OVERVIEW' 
  | 'REGULATOR_OVERVIEW' 
  | 'INTERNAL_COMPLIANCE';

// File formats for export
export type SnapshotFileFormat = 'PDF' | 'ZIP' | 'JSON';

// Snapshot status
export type SnapshotStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

// Time period for snapshot
export interface SnapshotPeriod {
  from: string; // ISO datetime
  to: string;   // ISO datetime
}

// Main snapshot document
export interface LegalSnapshot {
  snapshotId: string;
  type: SnapshotType;
  requestedByAdminId: string;
  requestedAt: string; // ISO datetime
  period: SnapshotPeriod;
  status: SnapshotStatus;
  fileUrl: string | null;
  fileFormat: SnapshotFileFormat;
  metadata: {
    notes?: string | null;
  };
  errorMessage?: string | null;
}

// Request payload for creating snapshots
export interface CreateSnapshotRequest {
  type: SnapshotType;
  period: SnapshotPeriod;
  format: SnapshotFileFormat;
  notes?: string;
}

// ========================================
// INVESTOR_OVERVIEW Content Types
// ========================================

export interface InvestorOverviewSnapshot {
  type: 'INVESTOR_OVERVIEW';
  generatedAt: string;
  period: SnapshotPeriod;
  sections: {
    productAndSafety: ProductAndSafetySection;
    userAndGrowth: UserAndGrowthSection;
    economics: EconomicsSection;
    creatorActivity: CreatorActivitySection;
    riskAndSafety: RiskAndSafetyStatsSection;
    legalDocs: LegalDocsSection;
  };
}

export interface ProductAndSafetySection {
  description: string;
  safetyFoundations: {
    ageGating: string;
    safetyReporting: string;
    nsfwPolicy: string;
  };
}

export interface UserAndGrowthSection {
  totalRegistered: number;
  activeUsers: {
    dau: number;
    mau: number;
    retentionCohorts: string; // High-level summary
  };
  geographicDistribution: Array<{
    country: string;
    userCount: number;
  }>; // Top 10 only
}

export interface EconomicsSection {
  gmvTokens: number;
  gmvPLN: number;
  avaloFeesTokens: number;
  avaloFeesPLN: number;
  creatorShareTokens: number;
  numberOfPayouts: number;
  totalPayoutFiat: number;
}

export interface CreatorActivitySection {
  numberOfEarningCreators: number;
  averageMonthlyEarnings: number;
  distributionBuckets: Array<{
    range: string; // e.g., "0-100 PLN"
    count: number;
  }>;
}

export interface RiskAndSafetyStatsSection {
  totalSafetyReports: number;
  percentResolved: number;
  percentPending: number;
  blockedOrBannedAccounts: number;
}

export interface LegalDocsSection {
  termsOfService: {
    url: string;
    version: string;
  };
  privacyPolicy: {
    url: string;
    version: string;
  };
  communityGuidelines: {
    url: string;
    version: string;
  };
  safetyPolicy: {
    url: string;
    version: string;
  };
}

// ========================================
// REGULATOR_OVERVIEW Content Types
// ========================================

export interface RegulatorOverviewSnapshot {
  type: 'REGULATOR_OVERVIEW';
  generatedAt: string;
  period: SnapshotPeriod;
  sections: {
    ageAndAccessControl: AgeAndAccessControlSection;
    contentAndSafety: ContentAndSafetySection;
    meetingAndPanicSafety: MeetingAndPanicSafetySection;
    dataProtection: DataProtectionSection;
    financial: FinancialComplianceSection;
  };
}

export interface AgeAndAccessControlSection {
  description: string;
  stats: {
    percentFullyVerified: number;
    blockedSignupsDueToAge: number;
    reVerificationsTriggered: number;
  };
}

export interface ContentAndSafetySection {
  nsfwPolicy: {
    allowed: string;
    forbidden: string;
  };
  detectionMethods: string;
  stats: {
    contentFlags: number;
    contentRemovals: number;
    medianResponseTime: number; // in minutes
  };
}

export interface MeetingAndPanicSafetySection {
  description: {
    qrVerification: string;
    selfieVerification: string;
    panicButton: string;
  };
  stats: {
    meetingsBooked: number;
    meetingsVerified: number;
    panicTriggers: number;
    outcomes: {
      resolved: number;
      escalated: number;
      falseAlarms: number;
    };
  };
}

export interface DataProtectionSection {
  summary: {
    dataCategories: string;
    retentionPeriods: string;
    userRights: string;
  };
  stats: {
    dataAccessRequests: number;
    deletionRequests: number;
    averageHandlingTime: number; // in hours
  };
}

export interface FinancialComplianceSection {
  payoutsByCountry: Array<{
    country: string;
    totalPLN: number;
  }>;
  highVolumeEarners: number; // count only
  flaggedAccounts: number; // from financeAnomalies
  amlChecks: string; // high-level description
}

// ========================================
// INTERNAL_COMPLIANCE Content Types
// ========================================

export interface InternalComplianceSnapshot {
  type: 'INTERNAL_COMPLIANCE';
  generatedAt: string;
  period: SnapshotPeriod;
  sections: {
    policyVersionMap: PolicyVersionMapSection;
    riskAndSafety: RiskAndSafetyMetricsSection;
    auditLogSummary: AuditLogSummarySection;
    financialConsistency: FinancialConsistencySection;
    dataProtectionOps: DataProtectionOpsSection;
  };
}

export interface PolicyVersionMapSection {
  policies: {
    termsOfService: PolicyVersion;
    privacyPolicy: PolicyVersion;
    communityGuidelines: PolicyVersion;
    safetyPolicy: PolicyVersion;
  };
  usersByVersion: Array<{
    policyType: string;
    version: string;
    userCount: number;
  }>;
}

export interface PolicyVersion {
  currentVersion: string;
  timestamp: string;
}

export interface RiskAndSafetyMetricsSection {
  riskScoreDistribution: Array<{
    bucket: string; // e.g., "0-20", "20-40"
    count: number;
  }>;
  highRiskUsers: number;
  trends: {
    reports: {
      current: number;
      previous: number;
      change: number; // percentage
    };
    bans: {
      current: number;
      previous: number;
      change: number;
    };
    contentRemovals: {
      current: number;
      previous: number;
      change: number;
    };
  };
}

export interface AuditLogSummarySection {
  volumeByType: Array<{
    eventType: string;
    count: number;
  }>;
  adminAccessPatterns: Array<{
    role: string;
    actionCount: number;
  }>;
}

export interface FinancialConsistencySection {
  anomalies: {
    open: number;
    underReview: number;
    resolved: number;
  };
  topCategories: Array<{
    category: string;
    count: number;
  }>;
}

export interface DataProtectionOpsSection {
  incidents: {
    count: number;
    severity: string; // aggregated
  };
  dataSubjectRequests: {
    count: number;
    averageHandlingTime: number; // in hours
  };
}

// ========================================
// Admin roles for access control
// ========================================

export type AdminRole = 
  | 'SUPERADMIN' 
  | 'FINANCE' 
  | 'COMPLIANCE' 
  | 'LEGAL' 
  | 'SUPPORT';

export interface AdminUser {
  adminId: string;
  role: AdminRole;
  email: string;
}

// ========================================
// Audit log event types for snapshots
// ========================================

export type SnapshotAuditEvent = 
  | 'LEGAL_SNAPSHOT_GENERATED'
  | 'LEGAL_SNAPSHOT_FAILED'
  | 'LEGAL_SNAPSHOT_ACCESSED'
  | 'LEGAL_SNAPSHOT_REQUESTED';

export interface SnapshotAuditLog {
  eventType: SnapshotAuditEvent;
  timestamp: string;
  adminId: string;
  snapshotId: string;
  snapshotType: SnapshotType;
  period?: SnapshotPeriod;
  fileFormat?: SnapshotFileFormat;
  errorMessage?: string;
  metadata?: Record<string, any>;
}