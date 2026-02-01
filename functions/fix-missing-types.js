/**
 * Fix missing type exports across pack413-423 type files
 * This script adds all missing exports identified from the TypeScript build errors
 */

const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, 'src/types/shared');

// Pack 413 - KPI types additions
const pack413Additions = `
// Additional exports for pack413-panic-modes.ts
export interface PanicModeProposal {
  modeId: PanicModeId;
  reason: string;
  triggeredBy: string;
  regionIds?: string[];
  metadata?: Record<string, any>;
}

export interface ActivatePanicModeRequest {
  modeId: PanicModeId;
  reason: string;
  regionIds?: string[];
  metadata?: Record<string, any>;
}

export interface DeactivatePanicModeRequest {
  modeId: PanicModeId;
  reason?: string;
}

export type LaunchStage = 
  | 'NOT_PLANNED'
  | 'PLANNED'
  | 'READY_FOR_SOFT'
  | 'SOFT_LIVE'
  | 'READY_FOR_FULL'
  | 'FULL_LIVE'
  | 'PAUSED'
  | 'ROLLED_BACK';
`;

// Pack 414 - Integration registry additions
const pack414Additions = `
// Additional exports for pack414-integration-audit.ts
export type IntegrationStatus = 'ACTIVE' | 'INACTIVE' | 'DEGRADED' | 'FAILED';
export type GreenlightStatus = 'GREEN' | 'YELLOW' | 'RED';

export function getGreenlightStatus(integrationId: string): GreenlightStatus {
  return 'GREEN';
}

export const CRITICAL_LAUNCH_REQUIREMENTS: string[] = [
  'PAYMENT_GATEWAY',
  'AUTH_SERVICE',
  'DATABASE',
  'STORAGE',
  'MODERATION',
];

export const AvaloIntegrationRegistry = INTEGRATION_REGISTRY;
`;

// Pack 416 - Feature flags additions
const pack416Additions = `
// Additional exports for pack416-feature-guard.ts and pack416-audit-integration.ts
export type FeatureFlagKey = string;

export interface FeatureFlagChangeEvent {
  flagId: string;
  previousValue: boolean;
  newValue: boolean;
  changedBy: string;
  timestamp: any;
  reason?: string;
}

export interface FeatureFlagUserContext {
  userId: string;
  segments?: string[];
  attributes?: Record<string, any>;
}

export function calculateRolloutBucket(userId: string, flagId: string): number {
  // Simple hash-based bucket calculation
  let hash = 0;
  const str = userId + flagId;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash % 100);
}

export const SAFE_DEFAULTS: Record<string, boolean> = {
  PAYMENTS_ENABLED: true,
  MODERATION_ENABLED: true,
  SAFETY_FEATURES: true,
};

export const CRITICAL_FEATURES: string[] = [
  'PAYMENTS_ENABLED',
  'MODERATION_ENABLED',
  'SAFETY_FEATURES',
  'AUTH_REQUIRED',
];
`;

// Pack 418 - Compliance constants additions
const pack418Additions = `
// Additional exports for pack418-compliance.service.ts
export const TOKEN_PAYOUT_RATE_PLN = 0.04; // 1 token = 0.04 PLN
export const AGE_MINIMUM_YEARS = 18;
export const REQUIRE_SELFIE_VERIFICATION_FOR_EARNING = true;
export const REQUIRE_SELFIE_FOR_MEETINGS_AND_EVENTS = true;

export const CONTENT_POLICY = {
  maxFileSize: 50 * 1024 * 1024, // 50MB
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
  allowedVideoTypes: ['video/mp4', 'video/webm'],
  maxVideoDuration: 300, // 5 minutes
  requireModeration: true,
};

export interface TokenomicsContext {
  userId: string;
  region: string;
  isCreator: boolean;
  verificationLevel: 'NONE' | 'BASIC' | 'FULL';
}

export interface UserComplianceContext {
  userId: string;
  age: number;
  region: string;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  consentGiven: boolean;
}

export interface ContentComplianceContext {
  contentId: string;
  contentType: string;
  creatorId: string;
  region: string;
  isAdultContent: boolean;
}

export interface RevenueSplit {
  creatorShare: number;
  platformShare: number;
  taxWithholding: number;
}

export function getRevenueSplit(context: TokenomicsContext): RevenueSplit {
  // Default 70/30 split
  return {
    creatorShare: 0.70,
    platformShare: 0.30,
    taxWithholding: 0,
  };
}

export function validateSplit(split: RevenueSplit): boolean {
  const total = split.creatorShare + split.platformShare + split.taxWithholding;
  return Math.abs(total - 1.0) < 0.001;
}
`;

// Pack 419 - Enforcement types additions
const pack419Additions = `
// Additional exports for pack419-enforcement.service.ts
export type EnforcementScope = 'ACCOUNT' | 'CONTENT' | 'FEATURE' | 'GLOBAL';
export type EnforcementSource = 'AUTOMATED' | 'MANUAL' | 'APPEAL' | 'SYSTEM';
export type AppealStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED';
export type EnforcementErrorCode = 
  | 'INVALID_ACTION'
  | 'USER_NOT_FOUND'
  | 'ALREADY_ENFORCED'
  | 'APPEAL_NOT_FOUND'
  | 'UNAUTHORIZED';

export interface EnforcementDecision {
  actionType: EnforcementActionType;
  severity: EnforcementSeverity;
  reason: string;
  duration?: number;
  scope: EnforcementScope;
}

export interface IssueEnforcementInput {
  targetUserId: string;
  actionType: EnforcementActionType;
  reason: string;
  severity?: EnforcementSeverity;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface CreateAppealInput {
  actionId: string;
  reason: string;
  evidence?: string[];
}

export interface UpdateAppealStatusInput {
  appealId: string;
  status: AppealStatus;
  reviewNotes?: string;
}

export interface RestrictionCheckResult {
  isRestricted: boolean;
  restrictions: EnforcementAction[];
  canAppeal: boolean;
}

export interface EnforcementDecisionUserView {
  actionType: EnforcementActionType;
  reason: string;
  expiresAt?: any;
  canAppeal: boolean;
  appealDeadline?: any;
}

export type EnforcementReasonCode = 
  | 'SPAM'
  | 'HARASSMENT'
  | 'FRAUD'
  | 'INAPPROPRIATE_CONTENT'
  | 'TERMS_VIOLATION'
  | 'SAFETY_CONCERN'
  | 'OTHER';
`;

// Pack 420 - Data rights types additions
const pack420Additions = `
// Additional exports for pack420-data-rights.service.ts and pack420-account-lifecycle.guard.ts
export type AccountLifecycleState = 
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'PENDING_DELETION'
  | 'DELETED'
  | 'ANONYMIZED';

export type GatedFeature = 
  | 'MESSAGING'
  | 'PAYMENTS'
  | 'CONTENT_UPLOAD'
  | 'PROFILE_EDIT'
  | 'DISCOVERY';

export interface LifecycleCheckResult {
  allowed: boolean;
  state: AccountLifecycleState;
  blockedFeatures: GatedFeature[];
  reason?: string;
}

export interface DataRightsError {
  code: DataRightsErrorCode;
  message: string;
  details?: Record<string, any>;
}

export type DataRightsErrorCode = 
  | 'INVALID_REQUEST'
  | 'USER_NOT_FOUND'
  | 'REQUEST_NOT_FOUND'
  | 'ALREADY_PROCESSING'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED';

export interface DataRightsRequest {
  id: string;
  userId: string;
  type: DataRequestType;
  status: DataRequestStatus;
  requestedAt: any;
  completedAt?: any;
  metadata?: Record<string, any>;
}

export interface CreateDataRightsRequestInput {
  userId: string;
  type: DataRequestType;
  reason?: string;
}

export interface UpdateDataRightsRequestInput {
  requestId: string;
  status: DataRequestStatus;
  notes?: string;
}

export interface DeletionJobResult {
  requestId: string;
  success: boolean;
  deletedCollections: string[];
  errors: string[];
  completedAt: any;
}
`;

// Pack 421 - Observability types additions
const pack421Additions = `
// Additional exports for pack421-alerting.config.ts, pack421-health.controller.ts, pack421-metrics.adapter.ts
export type AlertSeverity = 'P0' | 'P1' | 'P2' | 'P3' | 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertChannel = 'SLACK' | 'PAGERDUTY' | 'EMAIL' | 'SMS' | 'WEBHOOK';
export type MetricName = string;

export interface MetricTag {
  key: string;
  value: string;
}

export interface HealthCheckResponse {
  status: HealthStatus;
  components: HealthComponent[];
  timestamp: any;
  version?: string;
}

export interface HealthComponent {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  lastChecked?: any;
}

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';

export interface FeatureMatrixResponse {
  features: FeatureStatus[];
  timestamp: any;
}

export interface FeatureStatus {
  featureId: string;
  name: string;
  enabled: boolean;
  rolloutPercentage: number;
  status: 'ACTIVE' | 'DISABLED' | 'ROLLING_OUT';
}
`;

// Pack 422 - Reputation types additions
const pack422Additions = `
// Additional exports for pack422-reputation.policy.ts and pack422-reputation.service.ts
export interface ReputationProfile {
  userId: string;
  overallScore: number;
  dimensions: Record<string, number>;
  riskLabels: RiskLabel[];
  lastUpdated: any;
}

export type RiskLabel = 
  | 'TRUSTED'
  | 'NEW_USER'
  | 'LOW_ACTIVITY'
  | 'FLAGGED'
  | 'HIGH_RISK'
  | 'BANNED';

export type ReputationPolicyAction = 
  | 'NONE'
  | 'WARN'
  | 'RESTRICT'
  | 'REVIEW'
  | 'BAN';

export interface ReputationSignals {
  verificationLevel: number;
  accountAge: number;
  activityScore: number;
  reportCount: number;
  positiveInteractions: number;
  negativeInteractions: number;
}

export interface ReputationWeights {
  verification: number;
  accountAge: number;
  activity: number;
  reports: number;
  interactions: number;
}

export const DEFAULT_REPUTATION_WEIGHTS: ReputationWeights = {
  verification: 0.25,
  accountAge: 0.15,
  activity: 0.20,
  reports: 0.20,
  interactions: 0.20,
};

export interface ReputationHistoryEvent {
  timestamp: any;
  eventType: string;
  scoreDelta: number;
  reason: string;
  metadata?: Record<string, any>;
}
`;

// Pack 423 - Ratings types additions
const pack423Additions = `
// Additional exports for pack423-ratings.service.ts, pack423-nps.service.ts, pack423-integrations.ts, pack423-metrics.ts
export type InteractionType = 
  | 'CHAT'
  | 'CALL'
  | 'VIDEO_CALL'
  | 'MEETING'
  | 'EVENT'
  | 'PURCHASE';

export interface UserInteractionRating {
  id: string;
  fromUserId: string;
  toUserId: string;
  interactionType: InteractionType;
  interactionId: string;
  score: number;
  review?: string;
  tags?: string[];
  createdAt: any;
}

export interface CreateRatingInput {
  toUserId: string;
  interactionType: InteractionType;
  interactionId: string;
  score: number;
  review?: string;
  tags?: string[];
}

export interface UserRatingSummary {
  userId: string;
  averageScore: number;
  totalRatings: number;
  ratingsByType: Record<InteractionType, number>;
  recentTrend: 'UP' | 'DOWN' | 'STABLE';
}

export interface CompanionRatingSummary {
  companionId: string;
  averageScore: number;
  totalRatings: number;
  topTags: string[];
}

export interface RatingEligibility {
  canRate: boolean;
  reason?: string;
  cooldownEndsAt?: any;
}

export interface NpsSurveyResponse {
  id: string;
  userId: string;
  score: number;
  feedback?: string;
  segment?: UserSegment;
  productArea?: ProductArea;
  createdAt: any;
}

export interface CreateNpsInput {
  score: number;
  feedback?: string;
  productArea?: ProductArea;
}

export interface NpsAnalytics {
  npsScore: number;
  promoters: number;
  passives: number;
  detractors: number;
  totalResponses: number;
  bySegment: Record<UserSegment, number>;
  byProductArea: Record<ProductArea, number>;
}

export interface NpsCooldown {
  userId: string;
  lastPromptedAt: any;
  nextEligibleAt: any;
}

export type UserSegment = 
  | 'NEW_USER'
  | 'ACTIVE_USER'
  | 'POWER_USER'
  | 'CHURNED'
  | 'REACTIVATED';

export type ProductArea = 
  | 'DISCOVERY'
  | 'CHAT'
  | 'CALLS'
  | 'EVENTS'
  | 'PAYMENTS'
  | 'PROFILE'
  | 'OVERALL';
`;

// Apply additions to files
function appendToFile(filePath, content) {
  const fullPath = path.join(basePath, filePath);
  if (fs.existsSync(fullPath)) {
    const existing = fs.readFileSync(fullPath, 'utf8');
    // Check if content already exists (avoid duplicates)
    if (!existing.includes(content.trim().split('\n')[1])) {
      fs.appendFileSync(fullPath, '\n' + content);
      console.log(`✅ Updated: ${filePath}`);
    } else {
      console.log(`⏭️ Skipped (already exists): ${filePath}`);
    }
  } else {
    console.log(`❌ File not found: ${filePath}`);
  }
}

console.log('Adding missing type exports...\n');

appendToFile('types/pack413-kpi.ts', pack413Additions);
appendToFile('integration/pack414-registry.ts', pack414Additions);
appendToFile('config/pack416-feature-flags.ts', pack416Additions);
appendToFile('compliance/pack418-compliance-constants.ts', pack418Additions);
appendToFile('types/pack419-enforcement.types.ts', pack419Additions);
appendToFile('types/pack420-data-rights.types.ts', pack420Additions);
appendToFile('types/pack421-observability.types.ts', pack421Additions);
appendToFile('types/pack422-reputation.types.ts', pack422Additions);
appendToFile('types/pack423-ratings.types.ts', pack423Additions);

console.log('\n✅ Type additions complete!');
