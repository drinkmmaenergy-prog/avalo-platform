// Pack 422 - Reputation Types (flexible)
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

// Additional exports for pack422-reputation.policy.ts and pack422-reputation.service.ts
export interface ReputationProfile {
  userId?: string;
  overallScore?: number;
  reputationScore?: number;
  dimensions?: Record<string, number>;
  riskLabels?: RiskLabel[];
  riskLabel?: RiskLabel;
  lastUpdated?: any;
  updatedAt?: any;
  manualReview?: boolean;
  limitedMode?: boolean;
  totalReports?: number;
  totalSafetyIncidents?: number;
  lastPositiveEvent?: any;
  lastNegativeEvent?: any;
  chatQuality?: number;
  callQuality?: number;
  meetingReliability?: number;
  cancellationBehavior?: number;
  disputeHistory?: number;
  paymentTrust?: number;
  socialPresence?: number;
  supportInteractionQuality?: number;
  safetySignalRisk?: number;
  [key: string]: any;
}

export type RiskLabel = 
  | 'TRUSTED'
  | 'NEW_USER'
  | 'LOW_ACTIVITY'
  | 'FLAGGED'
  | 'HIGH_RISK'
  | 'BANNED'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export type ReputationPolicyActionType = 
  | 'NONE'
  | 'WARN'
  | 'RESTRICT'
  | 'REVIEW'
  | 'BAN'
  | 'MANUAL_REVIEW'
  | 'MANDATORY_VERIFICATION'
  | 'VISIBILITY_REDUCTION'
  | 'FEATURE_RESTRICTION';

export interface ReputationPolicyAction {
  riskLabel?: RiskLabel;
  action?: ReputationPolicyActionType | string;
  description?: string;
  appliedAt?: number;
  [key: string]: any;
}

export interface ReputationSignals {
  verificationLevel?: number;
  accountAge?: number;
  activityScore?: number;
  reportCount?: number;
  positiveInteractions?: number;
  negativeInteractions?: number;
  totalMessages?: number;
  reportedMessages?: number;
  successfulCalls?: number;
  droppedCalls?: number;
  meetingsCompleted?: number;
  meetingsLate?: number;
  meetingsCancelled?: number;
  meetingsNoShow?: number;
  qrVerifications?: number;
  successfulPayments?: number;
  failedPayments?: number;
  payoutsRejected?: number;
  fraudAlerts?: number;
  disputesAsProvider?: number;
  disputesAsClient?: number;
  profileCompleteness?: number;
  positiveRatings?: number;
  supportTickets?: number;
  aggressiveTickets?: number;
  resolvedPositively?: number;
  safetyIncidents?: number;
  panicEvents?: number;
  nsfwViolations?: number;
  blockedByAI?: number;
  [key: string]: any;
}

export interface ReputationWeights {
  verification?: number;
  accountAge?: number;
  activity?: number;
  reports?: number;
  interactions?: number;
  chatQuality?: number;
  callQuality?: number;
  meetingReliability?: number;
  cancellationBehavior?: number;
  disputeHistory?: number;
  paymentTrust?: number;
  socialPresence?: number;
  supportInteractionQuality?: number;
  safetySignalRisk?: number;
  [key: string]: any;
}

export const DEFAULT_REPUTATION_WEIGHTS: ReputationWeights = {
  verification: 0.25,
  accountAge: 0.15,
  activity: 0.20,
  reports: 0.20,
  interactions: 0.20,
};

export interface ReputationHistoryEvent {
  timestamp?: any;
  eventType?: string;
  scoreDelta?: number;
  reason?: string;
  metadata?: Record<string, any>;
  module?: string;
  [key: string]: any;
}









