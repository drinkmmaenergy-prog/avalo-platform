/**
 * Generate all missing type files with flexible interfaces
 */

const fs = require('fs');
const path = require('path');

const typesDir = path.join(__dirname, 'src', 'types', 'shared', 'types');
const complianceDir = path.join(__dirname, 'src', 'types', 'shared', 'compliance');
const configDir = path.join(__dirname, 'src', 'types', 'shared', 'config');
const integrationDir = path.join(__dirname, 'src', 'types', 'shared', 'integration');

// Ensure directories exist
[typesDir, complianceDir, configDir, integrationDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Pack 418 - Compliance Constants
const pack418 = `// Pack 418 - Compliance Constants
export const COMPLIANCE_REGIONS = ['US', 'EU', 'UK', 'CA', 'AU', 'JP', 'KR', 'BR', 'IN', 'SG'] as const;
export type ComplianceRegion = typeof COMPLIANCE_REGIONS[number];

export const COMPLIANCE_FRAMEWORKS = ['GDPR', 'CCPA', 'LGPD', 'PIPA', 'PDPA', 'APPI'] as const;
export type ComplianceFramework = typeof COMPLIANCE_FRAMEWORKS[number];

export const DATA_CATEGORIES = ['PERSONAL', 'SENSITIVE', 'FINANCIAL', 'HEALTH', 'BIOMETRIC', 'LOCATION'] as const;
export type DataCategory = typeof DATA_CATEGORIES[number];

export const CONSENT_TYPES = ['MARKETING', 'ANALYTICS', 'PERSONALIZATION', 'THIRD_PARTY', 'DATA_SALE'] as const;
export type ConsentType = typeof CONSENT_TYPES[number];

export const RETENTION_PERIODS = {
  SHORT: 30,
  MEDIUM: 90,
  LONG: 365,
  EXTENDED: 730,
  PERMANENT: -1,
} as const;

export const COMPLIANCE_ACTIONS = ['AUDIT', 'REPORT', 'DELETE', 'EXPORT', 'ANONYMIZE', 'RESTRICT'] as const;
export type ComplianceAction = typeof COMPLIANCE_ACTIONS[number];

export interface ComplianceConfig {
  region?: ComplianceRegion;
  frameworks?: ComplianceFramework[];
  dataCategories?: DataCategory[];
  retentionDays?: number;
  [key: string]: any;
}

export interface ComplianceAuditLog {
  id?: string;
  action?: ComplianceAction;
  userId?: string;
  timestamp?: any;
  metadata?: Record<string, any>;
  [key: string]: any;
}
`;

// Pack 419 - Enforcement Types
const pack419 = `// Pack 419 - Enforcement Types
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

export type EnforcementActionType = 
  | 'WARNING'
  | 'CONTENT_REMOVAL'
  | 'FEATURE_RESTRICTION'
  | 'TEMPORARY_BAN'
  | 'PERMANENT_BAN'
  | 'ACCOUNT_SUSPENSION';

export type EnforcementSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

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
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
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
`;

// Pack 420 - Data Rights Types
const pack420 = `// Pack 420 - Data Rights Types
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

export type DataRequestType = 'ACCESS' | 'EXPORT' | 'DELETE' | 'RECTIFY' | 'RESTRICT' | 'PORTABILITY';
export type DataRequestStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'EXPIRED';

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
`;

// Pack 421 - Observability Types
const pack421 = `// Pack 421 - Observability Types
export interface MetricPoint {
  name?: string;
  value?: number;
  timestamp?: any;
  tags?: Record<string, string>;
  [key: string]: any;
}

export interface TraceSpan {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  operationName?: string;
  startTime?: any;
  endTime?: any;
  tags?: Record<string, string>;
  logs?: SpanLog[];
  [key: string]: any;
}

export interface SpanLog {
  timestamp?: any;
  message?: string;
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  [key: string]: any;
}

export interface AlertRule {
  id?: string;
  name?: string;
  condition?: string;
  threshold?: number;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  enabled?: boolean;
  [key: string]: any;
}

export interface AlertEvent {
  id?: string;
  ruleId?: string;
  triggeredAt?: any;
  resolvedAt?: any;
  status?: 'FIRING' | 'RESOLVED';
  [key: string]: any;
}

export interface DashboardConfig {
  id?: string;
  name?: string;
  panels?: DashboardPanel[];
  [key: string]: any;
}

export interface DashboardPanel {
  id?: string;
  type?: 'CHART' | 'TABLE' | 'STAT' | 'LOG';
  query?: string;
  [key: string]: any;
}

export interface HealthCheck {
  service?: string;
  status?: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  latencyMs?: number;
  lastChecked?: any;
  [key: string]: any;
}
`;

// Pack 422 - Reputation Types
const pack422 = `// Pack 422 - Reputation Types (extended)
export interface UserReputation {
  userId?: string;
  score?: number;
  level?: string;
  badges?: string[];
  history?: ReputationChange[];
  [key: string]: any;
}

export interface ReputationChange {
  timestamp?: any;
  delta?: number;
  reason?: string;
  source?: string;
  [key: string]: any;
}

export interface ReputationRule {
  id?: string;
  name?: string;
  eventType?: string;
  scoreImpact?: number;
  conditions?: Record<string, any>;
  [key: string]: any;
}

export interface ReputationThreshold {
  level?: string;
  minScore?: number;
  maxScore?: number;
  privileges?: string[];
  [key: string]: any;
}

export interface ReputationReport {
  userId?: string;
  period?: string;
  startScore?: number;
  endScore?: number;
  changes?: ReputationChange[];
  [key: string]: any;
}
`;

// Pack 423 - Ratings Types
const pack423 = `// Pack 423 - Ratings Types
export interface Rating {
  id?: string;
  fromUserId?: string;
  toUserId?: string;
  score?: number;
  review?: string;
  tags?: string[];
  createdAt?: any;
  [key: string]: any;
}

export interface RatingAggregation {
  userId?: string;
  averageScore?: number;
  totalRatings?: number;
  distribution?: Record<number, number>;
  [key: string]: any;
}

export interface RatingPrompt {
  id?: string;
  userId?: string;
  contextType?: string;
  contextId?: string;
  promptedAt?: any;
  respondedAt?: any;
  [key: string]: any;
}

export interface RatingConfig {
  minScore?: number;
  maxScore?: number;
  requireReview?: boolean;
  cooldownHours?: number;
  [key: string]: any;
}

export interface RatingModeration {
  ratingId?: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string;
  moderatedBy?: string;
  [key: string]: any;
}
`;

// Pack 416 - Feature Flags Config
const pack416 = `// Pack 416 - Feature Flags Config
export interface FeatureFlag {
  id?: string;
  name?: string;
  enabled?: boolean;
  rolloutPercentage?: number;
  targetUsers?: string[];
  targetSegments?: string[];
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface FeatureFlagConfig {
  flags?: Record<string, FeatureFlag>;
  defaultEnabled?: boolean;
  [key: string]: any;
}

export function getFeatureFlag(flagId: string): FeatureFlag | undefined {
  return undefined;
}

export function isFeatureEnabled(flagId: string, userId?: string): boolean {
  return false;
}

export const DEFAULT_FLAGS: Record<string, boolean> = {};
`;

// Pack 414 - Integration Registry
const pack414 = `// Pack 414 - Integration Registry
export interface IntegrationConfig {
  id?: string;
  name?: string;
  type?: IntegrationType;
  enabled?: boolean;
  credentials?: Record<string, any>;
  settings?: Record<string, any>;
  [key: string]: any;
}

export type IntegrationType = 
  | 'PAYMENT'
  | 'ANALYTICS'
  | 'NOTIFICATION'
  | 'STORAGE'
  | 'AI'
  | 'MODERATION';

export interface IntegrationRequest {
  integrationId?: string;
  action?: string;
  payload?: any;
  auth?: any;
  [key: string]: any;
}

export interface IntegrationResponse {
  success?: boolean;
  data?: any;
  error?: string;
  [key: string]: any;
}

export interface IntegrationHealth {
  integrationId?: string;
  status?: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  lastChecked?: any;
  latencyMs?: number;
  [key: string]: any;
}

export const INTEGRATION_REGISTRY: Record<string, IntegrationConfig> = {};

export function getIntegration(id: string): IntegrationConfig | undefined {
  return INTEGRATION_REGISTRY[id];
}
`;

// Write all files
fs.writeFileSync(path.join(complianceDir, 'pack418-compliance-constants.ts'), pack418);
console.log('Created: pack418-compliance-constants.ts');

fs.writeFileSync(path.join(typesDir, 'pack419-enforcement.types.ts'), pack419);
console.log('Created: pack419-enforcement.types.ts');

fs.writeFileSync(path.join(typesDir, 'pack420-data-rights.types.ts'), pack420);
console.log('Created: pack420-data-rights.types.ts');

fs.writeFileSync(path.join(typesDir, 'pack421-observability.types.ts'), pack421);
console.log('Created: pack421-observability.types.ts');

fs.writeFileSync(path.join(typesDir, 'pack422-reputation.types.ts'), pack422);
console.log('Created: pack422-reputation.types.ts');

fs.writeFileSync(path.join(typesDir, 'pack423-ratings.types.ts'), pack423);
console.log('Created: pack423-ratings.types.ts');

fs.writeFileSync(path.join(configDir, 'pack416-feature-flags.ts'), pack416);
console.log('Created: pack416-feature-flags.ts');

fs.writeFileSync(path.join(integrationDir, 'pack414-registry.ts'), pack414);
console.log('Created: pack414-registry.ts');

console.log('\nDone generating type files');
