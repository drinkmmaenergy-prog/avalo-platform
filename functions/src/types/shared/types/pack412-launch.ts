// Stub types for pack412 launch
export type LaunchStage = 
  | 'PRE_LAUNCH'
  | 'SOFT_LAUNCH'
  | 'BETA'
  | 'GENERAL_AVAILABILITY'
  | 'MATURE'
  | 'FULL_LIVE'
  | 'NOT_PLANNED'
  | 'PAUSED'
  | 'ROLLED_BACK'
  | 'SOFT_LIVE'
  | 'PLANNED'
  | 'READY_FOR_SOFT'
  | 'READY_FOR_FULL';

export interface LaunchConfig  {
  stage: LaunchStage;
  targetMarkets: string[];
  featureFlags: Record<string, boolean>;
  rolloutPercentage: number;
  [key: string]: any;
}

export interface LaunchRegionConfig {
  regionId: string;
  stage: LaunchStage;
  enabled: boolean;
  rolloutPercentage: number;
  featureFlags: Record<string, boolean>;
  guardrails: LaunchGuardrailThresholds;
  // Additional properties used in pack412-launch-orchestrator
  id?: string;
  currentTrafficCapPct?: number;
  dependenciesOk?: boolean;
  countries?: string[];
  cluster?: string;
  [key: string]: any;
}

export interface LaunchGuardrailThresholds {
  maxErrorRate: number;
  maxLatencyMs: number;
  minSuccessRate: number;
  maxFraudRate: number;
  id?: string;
  [key: string]: any;
}

export interface LaunchGuardrailViolation {
  id?: string;
  regionId?: string;
  metric?: string;
  threshold?: number;
  actualValue?: number;
  severity?: 'WARNING' | 'CRITICAL';
  timestamp?: any;
  metricName?: string;
  thresholdId?: string;
  measuredValue?: any;
  thresholdValue?: any;
  actionTaken?: string;
  autoResolve?: boolean;
  createdAt?: string;
  [key: string]: any;
}

export interface LaunchEvent  {
  id: string;
  type: string;
  regionId: string;
  stage: LaunchStage;
  timestamp: any;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface LaunchRegionStats  {
  regionId: string;
  activeUsers: number;
  errorRate: number;
  avgLatencyMs: number;
  successRate: number;
  fraudRate: number;
  lastUpdated: any;
  [key: string]: any;
}

export interface LaunchReadinessSummary  {
  regionId?: string;
  stage?: LaunchStage;
  isReady?: boolean;
  blockers?: string[];
  warnings?: string[] | undefined[];
  dependencies?: LaunchDependencyCheck[];
  checks?: LaunchDependencyCheck[];
  generatedAt?: string;
  [key: string]: any;
}

export interface LaunchDependencyCheck  {
  name?: string;
  checkName?: string;
  status?: 'READY' | 'NOT_READY' | 'UNKNOWN';
  passed?: boolean;
  message?: string;
  checkedAt?: string;
  [key: string]: any;
}

export interface MarketExpansionProposal  {
  id?: string;
  regionId?: string;
  proposedStage?: LaunchStage;
  currentStage?: LaunchStage;
  rationale?: string;
  metrics?: LaunchRegionStats;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt?: any;
  proposedRegions?: string[];
  priority?: number;
  estimatedReadiness?: string;
  dependencies?: any[];
  generatedAt?: string;
  [key: string]: any;
}

export interface GrowthMetrics  {
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  retentionD1: number;
  retentionD7: number;
  retentionD30: number;
  [key: string]: any;
}

export interface LaunchChecklistItem  {
  id: string;
  category: string;
  description: string;
  completed: boolean;
  requiredForStage: LaunchStage;
  [key: string]: any;
}
