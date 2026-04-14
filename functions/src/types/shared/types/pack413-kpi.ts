import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

// Stub types for pack413 KPI command center
export interface KpiMetric  {
  id?: string;
  name?: string;
  label?: string;
  description?: string;
  category?: KpiCategory;
  value?: number;
  previousValue?: number;
  baseline?: number;
  changePct?: number;
  trend?: KpiTrend;
  unit?: string | 'COUNT' | 'PERCENT' | 'CURRENCY' | 'SECONDS' | 'SCORE';
  timestamp?: any;
  updatedAt?: string;
  severity?: KpiSeverity;
  regionId?: string;
  [key: string]: any;
}

export type KpiCategory =
  | 'GROWTH'
  | 'ENGAGEMENT'
  | 'MONETIZATION'
  | 'SAFETY'
  | 'PERFORMANCE'
  | 'REVENUE'
  | 'SUPPORT'
  | 'STORE_REPUTATION';

export type KpiTimeRange =
  | 'HOUR'
  | 'DAY'
  | 'WEEK'
  | 'MONTH'
  | 'QUARTER'
  | 'YEAR';

export type KpiTrend = 'UP' | 'DOWN' | 'STABLE' | 'FLAT';

export type KpiSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'WARN';

export interface ToplineKpiData  {
  dau?: number;
  mau?: number;
  revenue?: number;
  arpu?: number;
  churnRate?: number;
  nps?: number;
  timestamp?: string;
  launchStage?: string;
  activePanicModes?: any;
  groups?: GroupedKpis[];
  activeAlerts?: KpiAlertEvent[];
  recentIncidents?: KpiAlertEvent[];
  [key: string]: any;
}

export interface RegionalKpiData  {
  regionId: string;
  regionName: string;
  metrics: KpiMetric[];
  [key: string]: any;
}

export interface SegmentKpiData  {
  segmentId?: string;
  segmentKey?: any;
  segmentName?: string;
  metrics?: KpiMetric[];
  timestamp?: string;
  [key: string]: any;
}

export interface GroupedKpis  {
  byCategory?: Record<KpiCategory, KpiMetric[]>;
  byRegion?: RegionalKpiData[];
  bySegment?: SegmentKpiData[];
  category?: KpiCategory;
  metrics?: KpiMetric[];
  summary?: {
    totalMetrics?: number;
    criticalCount?: number;
    warningCount?: number;
    avgChangePct?: number;
  };
  [key: string]: any;
}

export interface GetKpiParams  {
  category?: KpiCategory;
  timeRange?: KpiTimeRange;
  regionId?: string;
  segmentId?: string;
  [key: string]: any;
}

export interface KpiAlertRule  {
  id: string;
  metricId: string;
  condition: 'ABOVE' | 'BELOW' | 'CHANGE_PERCENT';
  threshold: number;
  severity: KpiSeverity;
  enabled: boolean;
  [key: string]: any;
}

export interface KpiAlertState  {
  ruleId?: string;
  isTriggered?: boolean;
  lastTriggeredAt?: any;
  lastValue?: number;
  metricId?: string;
  firstViolatedAt?: any;
  lastViolatedAt?: any;
  lastCheckedAt?: string;
  currentValue?: number;
  thresholdValue?: any;
  isViolated?: boolean;
  violationDurationMinutes?: number;
  shouldTrigger?: boolean;
  [key: string]: any;
}

export interface KpiAlertEvent  {
  id?: string;
  ruleId?: string;
  metricId?: string;
  regionId?: string;
  severity?: KpiSeverity;
  message?: string;
  value?: number;
  currentValue?: number;
  threshold?: number;
  thresholdValue?: any;
  timestamp?: any;
  triggeredAt?: string;
  [key: string]: any;
}

export interface AlertEvaluationResult  {
  ruleId?: string;
  triggered?: boolean;
  evaluated?: boolean;
  value?: number;
  threshold?: number;
  message?: string;
  notificationsSent?: any[];
  timestamp?: string;
  [key: string]: any;
}

export const STANDARD_METRIC_IDS: Record<string, string> = {
  DAU: 'dau',
  MAU: 'mau',
  REVENUE: 'revenue',
  ARPU: 'arpu',
  CHURN_RATE: 'churn_rate',
  NPS: 'nps',
  ERROR_RATE: 'error_rate',
  LATENCY_P99: 'latency_p99',
  // Growth metrics
  NEW_REGISTRATIONS: 'new_registrations',
  VERIFIED_USERS: 'verified_users',
  FIRST_CHAT_CONVERSION: 'first_chat_conversion',
  // Engagement metrics
  CHATS_PER_USER: 'chats_per_user',
  ACTIVE_CHATS: 'active_chats',
  EVENTS_BOOKED: 'events_booked',
  // Revenue metrics
  TOKEN_PURCHASES: 'token_purchases',
  PAYING_USERS: 'paying_users',
  // Safety metrics
  INCIDENT_RATE: 'incident_rate',
  PANIC_BUTTON_TRIGGERS: 'panic_button_triggers',
  BLOCKED_ACCOUNTS: 'blocked_accounts',
  // Support metrics
  OPEN_TICKETS: 'open_tickets',
  SLA_BREACHES: 'sla_breaches',
  AVG_FIRST_RESPONSE_TIME: 'avg_first_response_time',
  // Store reputation metrics
  AVG_RATING: 'avg_rating',
  ONE_STAR_SHARE: 'one_star_share',
  NEGATIVE_REVIEW_VOLUME: 'negative_review_volume',
  // Performance metrics
  CRASH_RATE: 'crash_rate',
  P95_LATENCY: 'p95_latency',
  API_ERROR_RATE: 'api_error_rate',
};

// Panic mode types
export interface PanicMode  {
  id: PanicModeId;
  name: string;
  description: string;
  severity: KpiSeverity;
  actions: string[];
  [key: string]: any;
}

export type PanicModeId = 
  | 'FRAUD_SPIKE'
  | 'REVENUE_DROP'
  | 'ERROR_SURGE'
  | 'SAFETY_INCIDENT'
  | 'INFRASTRUCTURE_FAILURE';

export interface PanicModeConfig  {
  id: PanicModeId;
  enabled: boolean;
  autoTrigger: boolean;
  thresholds: Record<string, number>;
  actions: PanicModeAction[];
  [key: string]: any;
}

export interface PanicModeAction  {
  type: string;
  params: Record<string, any>;
  order: number;
  [key: string]: any;
}

export interface ActivePanicMode  {
  id?: string;
  modeId?: PanicModeId;
  triggeredAt?: any;
  activatedAt?: string;
  triggeredBy?: string;
  activatedBy?: any;
  reason?: any;
  status?: 'ACTIVE' | 'RESOLVED';
  regionIds?: any;
  autoActivated?: boolean;
  metadata?: any;
  resolvedAt?: any;
  resolvedBy?: string;
  [key: string]: any;
}


// Additional exports for pack413-panic-modes.ts
export interface PanicModeProposal  {
  id?: string;
  modeId?: PanicModeId;
  reason?: any;
  triggeredBy?: string;
  proposedAt?: string;
  proposedBy?: any;
  triggeringAlerts?: any;
  affectedRegions?: any;
  autoApprove?: boolean;
  expiresAt?: string;
  status?: string;
  regionIds?: string[];
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface ActivatePanicModeRequest  {
  modeId: PanicModeId;
  reason: string;
  regionIds?: string[];
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface DeactivatePanicModeRequest  {
  modeId: PanicModeId;
  reason?: string;
  [key: string]: any;
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




























