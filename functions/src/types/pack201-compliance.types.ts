/**
 * PACK 201 — Global Compliance, Risk & Trust Audit Types
 * All compliance and trust audit type definitions
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// COMPLIANCE AUDIT TYPES
// ============================================================================

export interface ComplianceAuditResult {
  auditId: string;
  timestamp: Timestamp;
  auditType: 'GLOBAL' | 'REGION' | 'USER' | 'CONTENT' | 'PLATFORM';
  status: 'PASS' | 'FAIL' | 'WARNING' | 'REVIEW_REQUIRED';
  
  // Audit categories
  sexualSafety: CategoryResult;
  platformPositioning: CategoryResult;
  businessFinanceSafety: CategoryResult;
  psychologicalSafety: CategoryResult;
  aiSafety: CategoryResult;
  dataProtection: CategoryResult;
  appStoreCompliance: CategoryResult;
  regionalCompliance: CategoryResult;
  
  // Overall results
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  warningChecks: number;
  complianceScore: number; // 0-100
  
  // Violations
  violations: ComplianceViolation[];
  recommendations: string[];
  
  // Metadata
  performedBy: string;
  completedAt?: Timestamp;
  nextAuditDue?: Timestamp;
}

export interface CategoryResult {
  category: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  checks: CheckResult[];
  score: number; // 0-100
}

export interface CheckResult {
  checkId: string;
  checkName: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  details?: any;
  autoFixAvailable: boolean;
}

export interface ComplianceViolation {
  violationId: string;
  category: ComplianceCategory;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  riskLevel: RiskLevel;
  impactedRegions?: string[];
  impactedPlatforms?: Platform[];
  remediation: RemediationStep[];
  detectedAt: Timestamp;
  resolvedAt?: Timestamp;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'ACCEPTED_RISK';
}

export type ComplianceCategory =
  | 'SEXUAL_CONTENT'
  | 'DATING_MECHANICS'
  | 'GAMBLING'
  | 'FINANCIAL_SCHEMES'
  | 'PSYCHOLOGICAL_MANIPULATION'
  | 'AI_SAFETY'
  | 'DATA_PRIVACY'
  | 'AGE_VERIFICATION'
  | 'REGIONAL_RESTRICTIONS'
  | 'PLATFORM_POLICY'
  | 'PAYMENT_COMPLIANCE';

export type RiskLevel = 'ACCEPTABLE' | 'MONITOR' | 'MITIGATE' | 'CRITICAL';

export type Platform = 'IOS' | 'ANDROID' | 'WEB' | 'DESKTOP';

export interface RemediationStep {
  step: number;
  action: string;
  responsible: 'SYSTEM' | 'ADMIN' | 'DEVELOPER' | 'LEGAL';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  automated: boolean;
  estimatedTimeHours?: number;
}

// ============================================================================
// POLICY VIOLATION SCANNING
// ============================================================================

export interface PolicyViolationScan {
  scanId: string;
  targetType: 'USER' | 'PRODUCT' | 'LIVESTREAM' | 'EVENT' | 'CONTENT';
  targetId: string;
  scanType: 'AUTOMATED' | 'MANUAL' | 'SCHEDULED';
  
  violations: PolicyViolation[];
  
  status: 'SCANNING' | 'COMPLETED' | 'FAILED';
  startedAt: Timestamp;
  completedAt?: Timestamp;
  scanDurationMs?: number;
}

export interface PolicyViolation {
  violationId: string;
  policyType: PolicyType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  blocked: boolean;
  
  // What was violated
  rule: string;
  ruleDescription: string;
  detectedContent?: string;
  
  // Context
  regionCode?: string;
  platform?: Platform;
  
  // Actions
  actionTaken: PolicyAction;
  notificationSent: boolean;
  appealAllowed: boolean;
  
  detectedAt: Timestamp;
}

export type PolicyType =
  | 'COMMUNITY_GUIDELINES'
  | 'COMMERCE_POLICY'
  | 'AI_SAFETY_POLICY'
  | 'MARKETPLACE_RULES'
  | 'LIVESTREAM_RULES'
  | 'EVENT_RULES'
  | 'CONTENT_POLICY'
  | 'MONETIZATION_POLICY';

export type PolicyAction =
  | 'WARNING'
  | 'CONTENT_REMOVED'
  | 'FEATURE_DISABLED'
  | 'ACCOUNT_RESTRICTED'
  | 'PAYMENT_HELD'
  | 'GEOBLOCKED'
  | 'APPEAL_REQUIRED';

// ============================================================================
// APP STORE VALIDATION
// ============================================================================

export interface AppStoreSubmission {
  submissionId: string;
  platform: 'APPLE' | 'GOOGLE';
  appVersion: string;
  buildNumber: string;
  
  validation: AppStoreValidation;
  
  status: 'VALIDATING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW';
  submittedAt: Timestamp;
  validatedAt?: Timestamp;
  approvedAt?: Timestamp;
}

export interface AppStoreValidation {
  validationId: string;
  platform: 'APPLE' | 'GOOGLE';
  
  // Required checks
  ageRestriction: ValidationCheck;
  contentRestrictions: ValidationCheck;
  safetyFeatures: ValidationCheck;
  paymentCompliance: ValidationCheck;
  businessTransparency: ValidationCheck;
  subscriptionClarity: ValidationCheck;
  lootBoxCompliance: ValidationCheck;
  cryptoCompliance: ValidationCheck;
  
  // Overall result
  passed: boolean;
  issues: ValidationIssue[];
  warnings: string[];
  
  validatedAt: Timestamp;
}

export interface ValidationCheck {
  checkName: string;
  passed: boolean;
  required: boolean;
  details: string;
  evidence?: string[];
}

export interface ValidationIssue {
  issueId: string;
  severity: 'BLOCKING' | 'WARNING' | 'INFO';
  category: string;
  description: string;
  howToFix: string;
  autoFixAvailable: boolean;
}

// ============================================================================
// GEO-BLOCKING
// ============================================================================

export interface GeoblockingRule {
  ruleId: string;
  regionCode: string;
  
  // What is blocked
  blockedCategories: BlockedCategory[];
  blockedFeatures: string[];
  blockedContent: ContentRestriction[];
  
  // Rules
  active: boolean;
  priority: number;
  
  // Metadata
  legalBasis: string;
  effectiveFrom: Timestamp;
  expiresAt?: Timestamp;
  lastReviewedAt: Timestamp;
  reviewedBy: string;
}

export type BlockedCategory =
  | 'NSFW_SOFT'
  | 'NSFW_EXPLICIT'
  | 'LIVESTREAM_ADULT'
  | 'POLITICAL_CONTENT'
  | 'RELIGIOUS_CONTENT'
  | 'GAMBLING'
  | 'ALCOHOL'
  | 'CANNABIS'
  | 'WEAPONS'
  | 'DATING'
  | 'CRYPTO';

export interface ContentRestriction {
  contentType: string;
  restrictionType: 'BLOCKED' | 'AGE_RESTRICTED' | 'VERIFIED_ONLY';
  minimumAge?: number;
  reason: string;
}

export interface GeoblockCheck {
  userId: string;
  regionCode: string;
  contentType: string;
  contentId: string;
  
  blocked: boolean;
  reason?: string;
  alternativeAvailable: boolean;
  
  checkedAt: Timestamp;
}

// ============================================================================
// COMPLIANCE REPORTING
// ============================================================================

export interface ComplianceReport {
  reportId: string;
  reportType: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'ON_DEMAND';
  period: {
    startDate: Timestamp;
    endDate: Timestamp;
  };
  
  // Summary
  summary: ComplianceSummary;
  
  // Detailed sections
  sexualSafetyReport: SafetyCategoryReport;
  platformPositioningReport: SafetyCategoryReport;
  financialSafetyReport: SafetyCategoryReport;
  psychologicalSafetyReport: SafetyCategoryReport;
  aiSafetyReport: AISafetyReport;
  dataProtectionReport: DataProtectionReport;
  regionalComplianceReport: RegionalComplianceReport;
  
  // Metrics
  metrics: ComplianceMetrics;
  
  // Generated
  generatedAt: Timestamp;
  generatedBy: string;
  approved: boolean;
  approvedBy?: string;
  approvedAt?: Timestamp;
}

export interface ComplianceSummary {
  overallScore: number; // 0-100
  status: 'COMPLIANT' | 'ISSUES_FOUND' | 'CRITICAL_ISSUES';
  totalViolations: number;
  criticalViolations: number;
  resolvedViolations: number;
  openViolations: number;
  
  trendsVsPreviousPeriod: {
    scoreChange: number;
    violationChange: number;
    resolutionRate: number;
  };
}

export interface SafetyCategoryReport {
  category: string;
  status: 'PASS' | 'FAIL' | 'REVIEW';
  checksPerformed: number;
  checksPassed: number;
  violations: ComplianceViolation[];
  recommendations: string[];
}

export interface AISafetyReport {
  totalAIInteractions: number;
  flaggedInteractions: number;
  emotionalDependencyFlags: number;
  inappropriateContentFlags: number;
  minorProtectionFlags: number;
  escalationsToHuman: number;
  averageResponseTime: number;
  safetyScore: number; // 0-100
}

export interface DataProtectionReport {
  gdprCompliance: boolean;
  ccpaCompliance: boolean;
  dataExportRequests: number;
  dataDeletionRequests: number;
  consentUpdatesRequired: number;
  breachesDetected: number;
  averageResponseTimeHours: number;
}

export interface RegionalComplianceReport {
  regionsCovered: number;
  regionsCompliant: number;
  regionsWithIssues: number;
  
  regionalBreakdown: {
    [regionCode: string]: {
      compliant: boolean;
      issues: string[];
      geoblockingActive: boolean;
    };
  };
}

export interface ComplianceMetrics {
  totalUsers: number;
  activeUsers: number;
  verifiedUsers: number;
  restrictedUsers: number;
  bannedUsers: number;
  
  totalContent: number;
  blockedContent: number;
  reportedContent: number;
  
  totalTransactions: number;
  blockedTransactions: number;
  disputedTransactions: number;
  
  moderationActions: number;
  appealsFiled: number;
  appealsApproved: number;
}

// ============================================================================
// TRUST & SAFETY CONTROLS
// ============================================================================

export interface TrustControl {
  controlId: string;
  controlType: TrustControlType;
  name: string;
  description: string;
  
  active: boolean;
  mandatory: boolean;
  
  // Implementation
  automated: boolean;
  monitoringLevel: 'BASIC' | 'ENHANCED' | 'STRICT';
  
  // Coverage
  platforms: Platform[];
  regions: string[];
  
  // Status
  lastAuditAt: Timestamp;
  nextAuditDue: Timestamp;
  status: 'OPERATIONAL' | 'DEGRADED' | 'FAILED';
}

export type TrustControlType =
  | 'AGE_VERIFICATION'
  | 'CONTENT_MODERATION'
  | 'REPORTING_SYSTEM'
  | 'APPEAL_PROCESS'
  | 'SAFETY_TRIAGE'
  | 'COMMUNITY_GUIDELINES'
  | 'TRANSPARENCY_CENTER'
  | 'CONSENT_MANAGEMENT'
  | 'DATA_PROTECTION'
  | 'PAYMENT_SECURITY';

// ============================================================================
// LEGAL POLICY DOCUMENTS
// ============================================================================

export interface PolicyDocument {
  documentId: string;
  documentType: PolicyType;
  version: string;
  
  title: string;
  content: PolicySection[];
  
  // Localization
  language: string;
  translations: {
    [languageCode: string]: string; // documentId of translated version
  };
  
  // Status
  status: 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED';
  effectiveFrom: Timestamp;
  expiresAt?: Timestamp;
  
  // Acknowledgment tracking
  requiresUserAcknowledgment: boolean;
  acknowledgmentCount: number;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt?: Timestamp;
  createdBy: string;
  reviewedBy?: string;
  approvedBy?: string;
}

export interface PolicySection {
  sectionId: string;
  title: string;
  content: string;
  order: number;
  subsections?: PolicySection[];
  
  // Highlighting
  critical: boolean;
  requiresExplicitConsent: boolean;
}

export interface UserPolicyAcknowledgment {
  acknowledgmentId: string;
  userId: string;
  documentId: string;
  documentType: PolicyType;
  documentVersion: string;
  
  acknowledgedAt: Timestamp;
  ipAddress: string;
  userAgent: string;
  
  // Evidence
  explicitConsent: boolean;
  consentMethod: 'CHECKBOX' | 'BUTTON' | 'SIGNATURE';
}

// ============================================================================
// LAUNCH READINESS
// ============================================================================

export interface LaunchReadinessCheck {
  checkId: string;
  platform: Platform;
  region?: string;
  
  // All categories must pass
  categories: {
    sexualSafety: ReadinessCategory;
    platformPositioning: ReadinessCategory;
    businessFinance: ReadinessCategory;
    psychologicalSafety: ReadinessCategory;
    aiSafety: ReadinessCategory;
    dataProtection: ReadinessCategory;
    appStore: ReadinessCategory;
    trustControls: ReadinessCategory;
  };
  
  // Overall
  readyToLaunch: boolean;
  blockingIssues: string[];
  warnings: string[];
  
  performedAt: Timestamp;
  performedBy: string;
  approvedBy?: string;
  approvedAt?: Timestamp;
}

export interface ReadinessCategory {
  name: string;
  status: 'READY' | 'NOT_READY' | 'NEEDS_REVIEW';
  checks: CheckResult[];
  blockingIssues: number;
  warnings: number;
}