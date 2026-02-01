/**
 * Fix all TS2305/TS2724 - Add missing type exports to stub files
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const typesDir = path.join(srcDir, 'types', 'shared', 'types');

// Ensure types directory exists
if (!fs.existsSync(typesDir)) {
  fs.mkdirSync(typesDir, { recursive: true });
}

// KPI types - complete
const kpiTypes = `// Stub types for KPI
export interface KpiEvent {
  id: string;
  type: KpiEventType;
  userId: string;
  timestamp: any;
  metadata?: Record<string, any>;
}

export type KpiEventType = 
  | 'USER_SIGNUP'
  | 'USER_LOGIN'
  | 'PURCHASE'
  | 'MESSAGE_SENT'
  | 'CALL_STARTED'
  | 'SUBSCRIPTION_CREATED'
  | 'CHURN';

export interface KpiMetrics {
  dau: number;
  mau: number;
  revenue: number;
  churn: number;
}

export interface CreatorPerformanceMetrics {
  creatorId: string;
  earnings: number;
  messageCount: number;
  callMinutes: number;
  responseRate: number;
  avgResponseTime: number;
  customerSatisfaction: number;
}

export interface CreatorDailyMetricsDocument {
  creatorId: string;
  date: string;
  metrics: CreatorPerformanceMetrics;
  createdAt: any;
}

export interface DateRange {
  start: any;
  end: any;
}

export interface KpiDailyMetricsDocument {
  date: string;
  growth: DailyGrowthMetrics;
  monetization: DailyMonetizationMetrics;
  safety: DailySafetyMetrics;
  createdAt: any;
}

export interface DailyGrowthMetrics {
  newUsers: number;
  activeUsers: number;
  returningUsers: number;
  churnedUsers: number;
}

export interface DailyMonetizationMetrics {
  totalRevenue: number;
  revenueByVertical: Record<string, number>;
  avgRevenuePerUser: number;
  payingUsers: number;
}

export interface DailySafetyMetrics {
  reportsReceived: number;
  reportsResolved: number;
  fraudDetected: number;
  fraudBySeverity: Record<string, number>;
}

export const DEFAULT_REVENUE_BY_VERTICAL: Record<string, number> = {
  chat: 0,
  call: 0,
  subscription: 0,
  tips: 0,
};

export const DEFAULT_FRAUD_BY_SEVERITY: Record<string, number> = {
  low: 0,
  medium: 0,
  high: 0,
  critical: 0,
};

export interface KpiEventInput {
  type: KpiEventType;
  userId: string;
  metadata?: Record<string, any>;
}

export interface KpiEventContext {
  timestamp: any;
  source: string;
  sessionId?: string;
}
`;

// Pack412 launch types - complete
const pack412LaunchTypes = `// Stub types for pack412 launch
export type LaunchStage = 
  | 'PRE_LAUNCH'
  | 'SOFT_LAUNCH'
  | 'BETA'
  | 'GENERAL_AVAILABILITY'
  | 'MATURE';

export interface LaunchConfig {
  stage: LaunchStage;
  targetMarkets: string[];
  featureFlags: Record<string, boolean>;
  rolloutPercentage: number;
}

export interface LaunchRegionConfig {
  regionId: string;
  stage: LaunchStage;
  enabled: boolean;
  rolloutPercentage: number;
  featureFlags: Record<string, boolean>;
  guardrails: LaunchGuardrailThresholds;
}

export interface LaunchGuardrailThresholds {
  maxErrorRate: number;
  maxLatencyMs: number;
  minSuccessRate: number;
  maxFraudRate: number;
}

export interface LaunchGuardrailViolation {
  id: string;
  regionId: string;
  metric: string;
  threshold: number;
  actualValue: number;
  severity: 'WARNING' | 'CRITICAL';
  timestamp: any;
}

export interface LaunchEvent {
  id: string;
  type: string;
  regionId: string;
  stage: LaunchStage;
  timestamp: any;
  metadata?: Record<string, any>;
}

export interface LaunchRegionStats {
  regionId: string;
  activeUsers: number;
  errorRate: number;
  avgLatencyMs: number;
  successRate: number;
  fraudRate: number;
  lastUpdated: any;
}

export interface LaunchReadinessSummary {
  regionId: string;
  stage: LaunchStage;
  isReady: boolean;
  blockers: string[];
  warnings: string[];
  dependencies: LaunchDependencyCheck[];
}

export interface LaunchDependencyCheck {
  name: string;
  status: 'READY' | 'NOT_READY' | 'UNKNOWN';
  message?: string;
}

export interface MarketExpansionProposal {
  id: string;
  regionId: string;
  proposedStage: LaunchStage;
  currentStage: LaunchStage;
  rationale: string;
  metrics: LaunchRegionStats;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: any;
}

export interface GrowthMetrics {
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  retentionD1: number;
  retentionD7: number;
  retentionD30: number;
}

export interface LaunchChecklistItem {
  id: string;
  category: string;
  description: string;
  completed: boolean;
  requiredForStage: LaunchStage;
}
`;

// Pack413 KPI types - complete
const pack413KpiTypes = `// Stub types for pack413 KPI command center
export interface KpiMetric {
  id: string;
  name: string;
  category: KpiCategory;
  value: number;
  previousValue?: number;
  trend: KpiTrend;
  unit: string;
  timestamp: any;
}

export type KpiCategory = 
  | 'GROWTH'
  | 'ENGAGEMENT'
  | 'MONETIZATION'
  | 'SAFETY'
  | 'PERFORMANCE';

export type KpiTimeRange = 
  | 'HOUR'
  | 'DAY'
  | 'WEEK'
  | 'MONTH'
  | 'QUARTER'
  | 'YEAR';

export type KpiTrend = 'UP' | 'DOWN' | 'STABLE';

export type KpiSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface ToplineKpiData {
  dau: number;
  mau: number;
  revenue: number;
  arpu: number;
  churnRate: number;
  nps: number;
}

export interface RegionalKpiData {
  regionId: string;
  regionName: string;
  metrics: KpiMetric[];
}

export interface SegmentKpiData {
  segmentId: string;
  segmentName: string;
  metrics: KpiMetric[];
}

export interface GroupedKpis {
  byCategory: Record<KpiCategory, KpiMetric[]>;
  byRegion: RegionalKpiData[];
  bySegment: SegmentKpiData[];
}

export interface GetKpiParams {
  category?: KpiCategory;
  timeRange?: KpiTimeRange;
  regionId?: string;
  segmentId?: string;
}

export interface KpiAlertRule {
  id: string;
  metricId: string;
  condition: 'ABOVE' | 'BELOW' | 'CHANGE_PERCENT';
  threshold: number;
  severity: KpiSeverity;
  enabled: boolean;
}

export interface KpiAlertState {
  ruleId: string;
  isTriggered: boolean;
  lastTriggeredAt?: any;
  lastValue?: number;
}

export interface KpiAlertEvent {
  id: string;
  ruleId: string;
  metricId: string;
  severity: KpiSeverity;
  message: string;
  value: number;
  threshold: number;
  timestamp: any;
}

export interface AlertEvaluationResult {
  ruleId: string;
  triggered: boolean;
  value: number;
  threshold: number;
  message?: string;
}

export const STANDARD_METRIC_IDS = {
  DAU: 'dau',
  MAU: 'mau',
  REVENUE: 'revenue',
  ARPU: 'arpu',
  CHURN_RATE: 'churn_rate',
  NPS: 'nps',
  ERROR_RATE: 'error_rate',
  LATENCY_P99: 'latency_p99',
};

// Panic mode types
export interface PanicMode {
  id: PanicModeId;
  name: string;
  description: string;
  severity: KpiSeverity;
  actions: string[];
}

export type PanicModeId = 
  | 'FRAUD_SPIKE'
  | 'REVENUE_DROP'
  | 'ERROR_SURGE'
  | 'SAFETY_INCIDENT'
  | 'INFRASTRUCTURE_FAILURE';

export interface PanicModeConfig {
  id: PanicModeId;
  enabled: boolean;
  autoTrigger: boolean;
  thresholds: Record<string, number>;
  actions: PanicModeAction[];
}

export interface PanicModeAction {
  type: string;
  params: Record<string, any>;
  order: number;
}

export interface ActivePanicMode {
  id: string;
  modeId: PanicModeId;
  triggeredAt: any;
  triggeredBy: string;
  reason: string;
  status: 'ACTIVE' | 'RESOLVED';
  resolvedAt?: any;
  resolvedBy?: string;
}
`;

// Write all type files
fs.writeFileSync(path.join(typesDir, 'kpi.ts'), kpiTypes);
console.log('Updated: kpi.ts');

fs.writeFileSync(path.join(typesDir, 'pack412-launch.ts'), pack412LaunchTypes);
console.log('Updated: pack412-launch.ts');

fs.writeFileSync(path.join(typesDir, 'pack413-kpi.ts'), pack413KpiTypes);
console.log('Updated: pack413-kpi.ts');

console.log('Done adding missing types');
