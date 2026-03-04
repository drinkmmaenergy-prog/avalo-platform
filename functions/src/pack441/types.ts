/**
 * PACK 441 — Growth Safety Net & Viral Abuse Control
 * Type Definitions
 */

export interface Pack441Config {
  riskScoring?: RiskScoringConfig;
  abuseDetection?: AbuseDetectionConfig;
  throttling?: ThrottlingConfig;
  retention?: RetentionConfig;
  dashboard?: DashboardConfig;
  [key: string]: any;
}

export interface RiskScoringConfig {
  entropyThreshold?: number;
  reuseThreshold?: number;
  velocityThreshold?: number;
  [key: string]: any;
}

export interface AbuseDetectionConfig {
  inviteRingMinSize?: number;
  selfReferralWindow?: number;
  farmIndicatorThreshold?: number;
  [key: string]: any;
}

export interface ThrottlingConfig {
  maxInvitesPerHour?: number;
  maxInvitesPerDay?: number;
  cooldownPeriod?: number;
  [key: string]: any;
}

export interface RetentionConfig {
  minRetentionDays?: number;
  qualityThreshold?: number;
  [key: string]: any;
}

export interface DashboardConfig {
  refreshInterval?: number;
  alertThreshold?: number;
  [key: string]: any;
}

export interface ReferralFraudSignals {
  userId?: string;
  suspectedInviteRing?: boolean | { detected: boolean; members: string[] };
  selfReferralDetected?: boolean;
  accountFarmIndicators?: number;
  signalStrength?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'low' | 'medium' | 'high' | 'critical';
  detectedAt?: Date | any;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface ReferralFraudAction {
  actionId?: string;
  userId?: string;
  actionType?: 'WARN' | 'RESTRICT' | 'SUSPEND' | 'BAN' | 'REVIEW' | 'manual_review' | 'reward_throttle' | 'delayed_unlock' | 'soft_cap' | 'account_flag';
  reason?: string;
  signals?: ReferralFraudSignals;
  executedAt?: Date | any;
  executedBy?: string;
  [key: string]: any;
}

export interface GrowthAbuseAlert {
  alertId?: string;
  userId?: string;
  alertType?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'low' | 'medium' | 'high' | 'critical';
  signals?: ReferralFraudSignals;
  createdAt?: Date | any;
  resolvedAt?: Date | any;
  status?: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED' | 'active';
  [key: string]: any;
}

export interface ViralLoopRiskScore {
  userId?: string;
  score?: number;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors?: ViralLoopRiskFactors;
  calculatedAt?: Date | any;
  [key: string]: any;
}

export interface ViralLoopRiskFactors {
  entropyScore?: number;
  deviceReuseScore?: number;
  ipReuseScore?: number;
  velocityScore?: number;
  patternScore?: number;
  [key: string]: any;
}

export interface GrowthThrottleState {
  userId?: string;
  throttled?: boolean;
  throttleLevel?: number;
  reason?: string;
  expiresAt?: Date | any;
  [key: string]: any;
}

export interface AbuseRetentionCorrelation {
  userId?: string;
  sourceId?: string;
  cohortId?: string;
  abuseScore?: number;
  retentionScore?: number;
  correlation?: number | { abuseToChurnCorrelation: number; abuseToLTVCorrelation: number; qualityScore: number; };
  recommendation?: string;
  metrics?: any;
  abuseMetrics?: any;
  analyzedAt?: Date | any;
  [key: string]: any;
}

export interface GrowthSafetyMetrics {
  totalAlerts?: number;
  resolvedAlerts?: number;
  activeThrottles?: number;
  averageRiskScore?: number;
  period?: string;
  [key: string]: any;
}

// Missing types for pack441 modules
export interface SourceQualityMetrics {
  sourceId?: string;
  qualityScore?: number;
  conversionRate?: number;
  retentionRate?: number;
  fraudRate?: number;
  totalUsers?: number;
  activeUsers?: number;
  abuseToChurnCorrelation?: number;
  abuseToLTVCorrelation?: number;
  [key: string]: any;
}

export interface GrowthThrottleConfig {
  maxInvitesPerHour?: number;
  maxInvitesPerDay?: number;
  cooldownPeriod?: number;
  riskThreshold?: number;
  enabled?: boolean;
  [key: string]: any;
}

export interface GrowthThrottleEvent {
  eventId?: string;
  userId?: string;
  eventType?: 'THROTTLE_APPLIED' | 'THROTTLE_RELEASED' | 'LIMIT_REACHED' | 'invite_sent' | 'reward_claimed' | 'referral_payout' | string;
  reason?: string;
  timestamp?: any;
  blocked?: boolean;
  currentCount?: number;
  limit?: number;
  windowStart?: Date | any;
  windowEnd?: Date | any;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface InviteQualityScore {
  inviteId?: string;
  inviterId?: string;
  inviteeId?: string;
  qualityScore?: number;
  riskScore?: number;
  factors?: Record<string, number>;
  calculatedAt?: any;
  [key: string]: any;
}









