/**
 * Script to create stub type files for missing shared types
 * These are minimal type definitions to satisfy TypeScript compilation
 */

const fs = require('fs');
const path = require('path');

// Base path for shared folder (relative to functions folder)
const sharedBase = path.join(__dirname, '..', 'shared');

// Type definitions to create
const typeDefinitions = {
  'types/contentModeration.ts': `
// Stub types for content moderation
export interface ModerationLabels {
  adult?: boolean;
  violence?: boolean;
  racy?: boolean;
  spoof?: boolean;
  medical?: boolean;
}

export interface ModerationResult {
  safe: boolean;
  labels: ModerationLabels;
  confidence: number;
  action: 'ALLOW' | 'FLAG' | 'BLOCK';
}

export interface ModerationContext {
  userId: string;
  contentType: string;
  source: string;
}

export interface ModerationDecision {
  action: 'ALLOW' | 'FLAG' | 'BLOCK' | 'REVIEW';
  reason?: string;
  confidence: number;
}

export interface ContentModerationRecord {
  id: string;
  contentId: string;
  userId: string;
  result: ModerationResult;
  decision: ModerationDecision;
  createdAt: any;
}

export type ModerationAction = 'ALLOW' | 'FLAG' | 'BLOCK' | 'REVIEW';
`,

  'src/types/calendar.ts': `
// Stub types for calendar
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: any;
  endTime: any;
  userId: string;
  type: string;
}

export interface CalendarSlot {
  startTime: any;
  endTime: any;
  available: boolean;
}

export type CalendarEventType = 'MEETING' | 'CALL' | 'DATE' | 'OTHER';
`,

  'src/types/creatorLeague.ts': `
// Stub types for creator league
export interface CreatorLeagueEntry {
  creatorId: string;
  tier: string;
  points: number;
  rank: number;
}

export interface LeagueTier {
  name: string;
  minPoints: number;
  maxPoints: number;
  benefits: string[];
}

export type LeagueTierName = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';
`,

  'types/support.ts': `
// Stub types for support
export interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  createdAt: any;
}

export interface SupportResponse {
  ticketId: string;
  message: string;
  responderId: string;
  createdAt: any;
}

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
`,

  'types/support-300b.ts': `
// Stub types for support-300b
export interface SupportArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
}

export interface FAQEntry {
  question: string;
  answer: string;
  category: string;
}
`,

  'types/kpi.ts': `
// Stub types for KPI
export interface KPIMetric {
  name: string;
  value: number;
  target: number;
  unit: string;
  period: string;
}

export interface KPIReport {
  metrics: KPIMetric[];
  period: string;
  generatedAt: any;
}

export interface KPIEvent {
  eventType: string;
  value: number;
  userId?: string;
  timestamp: any;
}

export type KPIPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';
`,

  'types/pack411-reviews.ts': `
// Stub types for pack411 reviews
export interface StoreReview {
  id: string;
  platform: 'IOS' | 'ANDROID';
  rating: number;
  title?: string;
  content: string;
  authorName?: string;
  createdAt: any;
  version?: string;
}

export interface ReviewAnalysis {
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  topics: string[];
  actionRequired: boolean;
}

export interface ReputationScore {
  overall: number;
  ios: number;
  android: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
}
`,

  'types/pack412-launch.ts': `
// Stub types for pack412 launch
export interface LaunchConfig {
  id: string;
  name: string;
  targetDate: any;
  regions: string[];
  features: string[];
}

export interface LaunchMetrics {
  downloads: number;
  activeUsers: number;
  retention: number;
  revenue: number;
}

export interface GrowthTarget {
  metric: string;
  target: number;
  current: number;
  deadline: any;
}
`,

  'types/pack413-kpi.ts': `
// Stub types for pack413 KPI
export interface KPICommandConfig {
  id: string;
  name: string;
  thresholds: Record<string, number>;
  alerts: AlertConfig[];
}

export interface AlertConfig {
  metric: string;
  condition: 'ABOVE' | 'BELOW';
  threshold: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface PanicMode {
  id: string;
  name: string;
  trigger: string;
  actions: string[];
  active: boolean;
}
`,

  'integration/pack414-registry.ts': `
// Stub types for pack414 registry
export interface IntegrationEntry {
  id: string;
  name: string;
  type: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DEPRECATED';
  version: string;
}

export interface AuditResult {
  integrationId: string;
  passed: boolean;
  issues: string[];
  timestamp: any;
}

export const INTEGRATION_REGISTRY: Record<string, IntegrationEntry> = {};
`,

  'config/pack416-feature-flags.ts': `
// Stub types for pack416 feature flags
export interface FeatureFlag {
  id: string;
  name: string;
  enabled: boolean;
  rolloutPercentage: number;
  targetUsers?: string[];
}

export interface FeatureFlagConfig {
  flags: Record<string, FeatureFlag>;
  defaultEnabled: boolean;
}

export const FEATURE_FLAGS: Record<string, FeatureFlag> = {};
export const getFeatureFlag = (flagId: string): FeatureFlag | undefined => FEATURE_FLAGS[flagId];
`,

  'compliance/pack418-compliance-constants.ts': `
// Stub types for pack418 compliance
export const COMPLIANCE_REGIONS = ['EU', 'US', 'UK', 'APAC'] as const;
export type ComplianceRegion = typeof COMPLIANCE_REGIONS[number];

export interface ComplianceRule {
  id: string;
  region: ComplianceRegion;
  requirement: string;
  mandatory: boolean;
}

export interface ComplianceStatus {
  region: ComplianceRegion;
  compliant: boolean;
  issues: string[];
}

export const GDPR_REQUIREMENTS: ComplianceRule[] = [];
export const CCPA_REQUIREMENTS: ComplianceRule[] = [];
`,

  'types/pack419-enforcement.types.ts': `
// Stub types for pack419 enforcement
export interface EnforcementAction {
  id: string;
  type: 'WARNING' | 'SUSPENSION' | 'BAN' | 'RESTRICTION';
  userId: string;
  reason: string;
  duration?: number;
  createdAt: any;
}

export interface EnforcementPolicy {
  id: string;
  name: string;
  triggers: string[];
  actions: string[];
}

export type EnforcementSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
`,

  'types/pack420-data-rights.types.ts': `
// Stub types for pack420 data rights
export interface DataRightsRequest {
  id: string;
  userId: string;
  type: 'ACCESS' | 'DELETE' | 'EXPORT' | 'RECTIFY';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
  createdAt: any;
}

export interface AccountLifecycleEvent {
  userId: string;
  event: 'CREATED' | 'VERIFIED' | 'SUSPENDED' | 'DELETED';
  timestamp: any;
}

export type DataRightsType = 'ACCESS' | 'DELETE' | 'EXPORT' | 'RECTIFY';
`,

  'types/pack421-observability.types.ts': `
// Stub types for pack421 observability
export interface MetricDefinition {
  name: string;
  type: 'COUNTER' | 'GAUGE' | 'HISTOGRAM';
  description: string;
  labels: string[];
}

export interface AlertRule {
  id: string;
  metric: string;
  condition: string;
  threshold: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface HealthCheck {
  name: string;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  lastCheck: any;
  details?: Record<string, any>;
}

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
`,

  'types/pack422-reputation.types.ts': `
// Stub types for pack422 reputation
export interface ReputationScore {
  userId: string;
  score: number;
  tier: string;
  factors: ReputationFactor[];
}

export interface ReputationFactor {
  name: string;
  weight: number;
  value: number;
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
}

export interface ReputationPolicy {
  id: string;
  name: string;
  rules: string[];
  penalties: string[];
}

export type ReputationTier = 'NEW' | 'TRUSTED' | 'VERIFIED' | 'ELITE';
`,

  'types/pack423-ratings.types.ts': `
// Stub types for pack423 ratings
export interface UserRating {
  id: string;
  fromUserId: string;
  toUserId: string;
  rating: number;
  comment?: string;
  createdAt: any;
}

export interface NPSResponse {
  userId: string;
  score: number;
  feedback?: string;
  timestamp: any;
}

export interface RatingMetrics {
  averageRating: number;
  totalRatings: number;
  distribution: Record<number, number>;
}

export type RatingCategory = 'OVERALL' | 'COMMUNICATION' | 'RELIABILITY' | 'QUALITY';
`,

  'legal/legalRegistry.ts': `
// Stub types for legal registry
export interface LegalDocument {
  id: string;
  type: 'TOS' | 'PRIVACY' | 'COMMUNITY' | 'COOKIE';
  version: string;
  content: string;
  effectiveDate: any;
}

export interface UserConsent {
  userId: string;
  documentId: string;
  version: string;
  acceptedAt: any;
}

export const LEGAL_DOCUMENTS: Record<string, LegalDocument> = {};
export const getCurrentLegalVersion = (type: string): string => '1.0.0';
`,
};

// Create directories and files
function createTypeFiles() {
  console.log('Creating shared type stub files...');
  
  for (const [relativePath, content] of Object.entries(typeDefinitions)) {
    const fullPath = path.join(sharedBase, relativePath);
    const dir = path.dirname(fullPath);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
    
    // Write file
    fs.writeFileSync(fullPath, content.trim() + '\n');
    console.log(`Created: ${fullPath}`);
  }
  
  console.log('\nDone! Created all shared type stub files.');
}

createTypeFiles();
