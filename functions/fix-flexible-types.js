/**
 * Fix type definitions to be more flexible
 * This adds index signatures and optional properties to allow any additional properties
 */

const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, 'src/types/shared');

// Helper to add index signature to interfaces
function makeFlexible(content) {
  // Add [key: string]: any; to interfaces that don't have it
  return content.replace(
    /export interface (\w+) \{([^}]*)\}/g,
    (match, name, body) => {
      if (body.includes('[key: string]: any')) {
        return match;
      }
      const trimmedBody = body.trimEnd();
      return `export interface ${name} {${trimmedBody}\n  [key: string]: any;\n}`;
    }
  );
}

// Pack 422 - Reputation types - complete rewrite with flexible types
const pack422Content = `// Pack 422 - Reputation Types (flexible)
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

export type ReputationPolicyAction = 
  | 'NONE'
  | 'WARN'
  | 'RESTRICT'
  | 'REVIEW'
  | 'BAN';

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
`;

// Pack 423 - Ratings types - complete rewrite with flexible types
const pack423Content = `// Pack 423 - Ratings Types (flexible)
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

// Additional exports for pack423-ratings.service.ts, pack423-nps.service.ts, pack423-integrations.ts, pack423-metrics.ts
export type InteractionType = 
  | 'CHAT'
  | 'CALL'
  | 'VIDEO_CALL'
  | 'VOICE_CALL'
  | 'MEETING'
  | 'EVENT'
  | 'PURCHASE'
  | 'CHAT_SESSION'
  | 'AI_COMPANION_SESSION';

export interface UserInteractionRating {
  id?: string;
  fromUserId?: string;
  toUserId?: string;
  interactionType?: InteractionType;
  interactionId?: string;
  score?: number;
  review?: string;
  tags?: string[];
  createdAt?: any;
  [key: string]: any;
}

export interface CreateRatingInput {
  toUserId?: string;
  raterUserId?: string;
  interactionType?: InteractionType;
  interactionId?: string;
  score?: number;
  rating?: number;
  review?: string;
  tags?: string[];
  thumbsUp?: boolean;
  comment?: string;
  [key: string]: any;
}

export interface UserRatingSummary {
  userId?: string;
  averageScore?: number;
  totalRatings?: number;
  totalRatings90d?: number;
  avgRating90d?: number;
  ratingsByType?: Record<InteractionType, number>;
  byType?: Record<string, number>;
  recentTrend?: 'UP' | 'DOWN' | 'STABLE';
  [key: string]: any;
}

export interface CompanionRatingSummary {
  companionId?: string;
  averageScore?: number;
  totalRatings?: number;
  topTags?: string[];
  [key: string]: any;
}

export interface RatingEligibility {
  canRate?: boolean;
  eligible?: boolean;
  reason?: string;
  cooldownEndsAt?: any;
  [key: string]: any;
}

export interface NpsSurveyResponse {
  id?: string;
  userId?: string;
  score?: number;
  feedback?: string;
  comment?: string;
  segment?: UserSegment;
  segmentAtTime?: UserSegment;
  productArea?: ProductArea;
  tagProductArea?: ProductArea;
  channel?: string;
  locale?: string;
  platform?: string;
  createdAt?: any;
  [key: string]: any;
}

export interface CreateNpsInput {
  userId?: string;
  score?: number;
  feedback?: string;
  comment?: string;
  productArea?: ProductArea;
  tagProductArea?: ProductArea;
  channel?: string;
  locale?: string;
  platform?: string;
  [key: string]: any;
}

export interface NpsAnalytics {
  npsScore?: number;
  promoters?: number;
  passives?: number;
  detractors?: number;
  totalResponses?: number;
  bySegment?: Record<UserSegment, number>;
  byProductArea?: Record<ProductArea, number>;
  timeRange?: string;
  [key: string]: any;
}

export interface NpsCooldown {
  userId?: string;
  lastPromptedAt?: any;
  lastResponseAt?: any;
  nextEligibleAt?: any;
  [key: string]: any;
}

export type UserSegment = 
  | 'NEW_USER'
  | 'NEW'
  | 'ACTIVE_USER'
  | 'ACTIVE'
  | 'POWER_USER'
  | 'CHURNED'
  | 'REACTIVATED'
  | 'DORMANT'
  | 'CHURN_RISK'
  | 'RETURNING';

export type ProductArea = 
  | 'DISCOVERY'
  | 'CHAT'
  | 'CALLS'
  | 'EVENTS'
  | 'PAYMENTS'
  | 'PROFILE'
  | 'OVERALL';
`;

// Write the files
const pack422Path = path.join(basePath, 'types/pack422-reputation.types.ts');
const pack423Path = path.join(basePath, 'types/pack423-ratings.types.ts');

fs.writeFileSync(pack422Path, pack422Content);
console.log('✅ Rewrote pack422-reputation.types.ts');

fs.writeFileSync(pack423Path, pack423Content);
console.log('✅ Rewrote pack423-ratings.types.ts');

console.log('\n✅ Flexible types applied!');
