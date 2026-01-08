/**
 * PACK 150: Avalo Cross-App API & Partner Integrations Hub
 * Type definitions for partner integrations and API access control
 * 
 * Strict Rules:
 * - Read-only data access only
 * - No external messaging/payments
 * - No NSFW/romantic integrations
 * - No identity export
 * - No ranking influence
 */

export enum IntegrationCategory {
  SCHEDULING = 'scheduling',
  ANALYTICS = 'analytics',
  FITNESS = 'fitness',
  WELLBEING = 'wellbeing',
  EVENTS = 'events',
  MARKETING = 'marketing', // Non-romantic, non-NSFW only
  CRM = 'crm',
  ECOMMERCE = 'ecommerce'
}

export enum IntegrationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  REVOKED = 'revoked',
  BANNED = 'banned'
}

export enum DataPermissionType {
  // Approved read-only data types
  EVENT_ATTENDANCE = 'event_attendance',
  CHALLENGE_PROGRESS = 'challenge_progress',
  PRODUCT_SALES_AGGREGATE = 'product_sales_aggregate',
  CLUB_PARTICIPATION_COUNT = 'club_participation_count',
  CRM_SEGMENTS_AGGREGATE = 'crm_segments_aggregate',
  TRAFFIC_ANALYTICS = 'traffic_analytics',
  REVENUE_SUMMARY = 'revenue_summary',
  
  // Explicitly forbidden (for validation)
  PROFILE_VIEWERS = 'profile_viewers', // FORBIDDEN
  FOLLOWER_LISTS = 'follower_lists', // FORBIDDEN
  EARNING_HISTORY_INDIVIDUAL = 'earning_history_individual', // FORBIDDEN
  SPECIFIC_SPENDERS = 'specific_spenders', // FORBIDDEN
  CHAT_LOGS = 'chat_logs', // FORBIDDEN
  CALL_LOGS = 'call_logs', // FORBIDDEN
  GPS_LOCATION = 'gps_location', // FORBIDDEN
  MEDIA_CONTENT = 'media_content', // FORBIDDEN
  USER_IDENTITIES = 'user_identities' // FORBIDDEN
}

export enum ViolationType {
  TERMS_BREACH = 'terms_breach',
  RESTRICTED_DATA_ACCESS = 'restricted_data_access',
  NSFW_FUNNEL = 'nsfw_funnel',
  ROMANTIC_MONETIZATION = 'romantic_monetization',
  EXTERNAL_PAYMENT_LINK = 'external_payment_link',
  IDENTITY_EXPORT = 'identity_export',
  MESSAGING_OVERLAY = 'messaging_overlay',
  RANKING_MANIPULATION = 'ranking_manipulation',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  DATA_SCRAPING = 'data_scraping'
}

export interface APIPartnerProfile {
  partnerId: string;
  companyName: string;
  companyWebsite: string;
  contactEmail: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  
  // Verification
  identityVerified: boolean;
  verificationDate?: Date;
  verifiedBy?: string;
  
  // Legal
  securityAgreementSigned: boolean;
  agreementSignedDate?: Date;
  agreementVersion: string;
  
  // Usage
  apiKey: string;
  apiSecret: string;
  sandboxMode: boolean;
  
  // Limits
  rateLimit: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
  };
  
  // Audit
  totalRequests: number;
  lastAccessDate?: Date;
  violationCount: number;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface APIIntegration {
  integrationId: string;
  partnerId: string;
  creatorId: string;
  
  // Integration details
  integrationName: string;
  description: string;
  category: IntegrationCategory;
  webhookUrl?: string;
  
  // Permissions
  requestedPermissions: DataPermissionType[];
  approvedPermissions: DataPermissionType[];
  
  // Consent
  consentGrantedAt: Date;
  consentExpiresAt: Date;
  consentRenewedAt?: Date;
  autoRenew: boolean;
  
  // Status
  status: IntegrationStatus;
  activatedAt?: Date;
  suspendedAt?: Date;
  revokedAt?: Date;
  revocationReason?: string;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface APIAccessLog {
  logId: string;
  partnerId: string;
  integrationId: string;
  creatorId: string;
  
  // Request details
  endpoint: string;
  method: string;
  requestedData: DataPermissionType[];
  
  // Response
  statusCode: number;
  responseTime: number;
  dataReturned: boolean;
  recordCount?: number;
  
  // Audit
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  
  // Security
  anomalyScore?: number;
  flaggedForReview: boolean;
  violationDetected?: ViolationType;
}

export interface IntegrationRiskCase {
  caseId: string;
  partnerId: string;
  integrationId?: string;
  
  // Violation
  violationType: ViolationType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: string[];
  
  // Detection
  detectedAt: Date;
  detectedBy: 'automatic' | 'manual' | 'user_report';
  detectionMethod: string;
  
  // Action taken
  actionTaken: 'warning' | 'suspension' | 'ban' | 'legal_report';
  actionDate: Date;
  actionBy: string;
  
  // Resolution
  resolved: boolean;
  resolvedAt?: Date;
  resolution?: string;
  
  // Legal
  legalReportFiled: boolean;
  legalReportDate?: Date;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface AnonymizedDataset {
  datasetId: string;
  creatorId: string;
  partnerId: string;
  
  // Data type
  dataType: DataPermissionType;
  timeRange: {
    start: Date;
    end: Date;
  };
  
  // Anonymization
  hashedIds: boolean;
  regionBucketed: boolean;
  segmented: boolean;
  timestampClustered: boolean;
  personalAttributesRemoved: boolean;
  
  // Data
  data: Record<string, any>;
  recordCount: number;
  
  // Metadata
  generatedAt: Date;
  expiresAt: Date;
}

export interface IntegrationRequest {
  requestId: string;
  partnerId: string;
  creatorId: string;
  
  // Request details
  integrationName: string;
  category: IntegrationCategory;
  purpose: string;
  requestedPermissions: DataPermissionType[];
  
  // Status
  status: 'pending' | 'approved' | 'denied';
  reviewedAt?: Date;
  reviewedBy?: string;
  denialReason?: string;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface PartnerSecurityAgreement {
  agreementId: string;
  version: string;
  content: string;
  
  // Terms
  prohibitedActivities: string[];
  dataUsageRestrictions: string[];
  securityRequirements: string[];
  
  // Legal
  effectiveDate: Date;
  expirationDate?: Date;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface IntegrationConsent {
  consentId: string;
  integrationId: string;
  creatorId: string;
  
  // Permissions
  permissions: DataPermissionType[];
  
  // Consent
  grantedAt: Date;
  expiresAt: Date;
  renewalDue: Date;
  
  // History
  renewalHistory: Array<{
    renewedAt: Date;
    expiresAt: Date;
  }>;
  
  // Revocation
  revoked: boolean;
  revokedAt?: Date;
  revocationReason?: string;
}

export interface RateLimitStatus {
  partnerId: string;
  
  // Current usage
  requestsLastMinute: number;
  requestsLastHour: number;
  requestsLastDay: number;
  
  // Limits
  minuteLimit: number;
  hourLimit: number;
  dayLimit: number;
  
  // Status
  throttled: boolean;
  resetAt: Date;
  
  // Metadata
  lastUpdated: Date;
}

// Forbidden integration patterns
export const FORBIDDEN_PATTERNS = [
  // NSFW/Adult
  /\b(nsfw|adult|escort|sugar|onlyfans|porn|xxx)\b/i,
  
  // Dating/Romance
  /\b(dating|romance|match|hookup|affair|flirt)\b/i,
  
  // Emotional labor monetization
  /\b(emotional\s+labor|girlfriend\s+experience|boyfriend\s+experience)\b/i,
  
  // External messaging
  /\b(telegram|whatsapp|snapchat|signal|discord)\s+(migration|export|sync)\b/i,
  
  // External payments
  /\b(paypal|venmo|cashapp|zelle|crypto|bitcoin)\s+(payment|payout|transfer)\b/i,
  
  // Identity export
  /\b(contact\s+export|email\s+list|phone\s+list|scrape|harvest)\b/i,
  
  // CRM with NSFW focus
  /\b(adult\s+crm|nsfw\s+crm|escort\s+crm)\b/i
];

// Approved data types (read-only, anonymized)
export const APPROVED_DATA_TYPES: DataPermissionType[] = [
  DataPermissionType.EVENT_ATTENDANCE,
  DataPermissionType.CHALLENGE_PROGRESS,
  DataPermissionType.PRODUCT_SALES_AGGREGATE,
  DataPermissionType.CLUB_PARTICIPATION_COUNT,
  DataPermissionType.CRM_SEGMENTS_AGGREGATE,
  DataPermissionType.TRAFFIC_ANALYTICS,
  DataPermissionType.REVENUE_SUMMARY
];

// Forbidden data types
export const FORBIDDEN_DATA_TYPES: DataPermissionType[] = [
  DataPermissionType.PROFILE_VIEWERS,
  DataPermissionType.FOLLOWER_LISTS,
  DataPermissionType.EARNING_HISTORY_INDIVIDUAL,
  DataPermissionType.SPECIFIC_SPENDERS,
  DataPermissionType.CHAT_LOGS,
  DataPermissionType.CALL_LOGS,
  DataPermissionType.GPS_LOCATION,
  DataPermissionType.MEDIA_CONTENT,
  DataPermissionType.USER_IDENTITIES
];

// Consent refresh period (90 days)
export const CONSENT_REFRESH_DAYS = 90;
export const CONSENT_REFRESH_MS = CONSENT_REFRESH_DAYS * 24 * 60 * 60 * 1000;

// Rate limits per partner tier
export const DEFAULT_RATE_LIMITS = {
  free: {
    requestsPerMinute: 10,
    requestsPerHour: 100,
    requestsPerDay: 1000
  },
  basic: {
    requestsPerMinute: 50,
    requestsPerHour: 500,
    requestsPerDay: 5000
  },
  premium: {
    requestsPerMinute: 200,
    requestsPerHour: 2000,
    requestsPerDay: 20000
  }
};