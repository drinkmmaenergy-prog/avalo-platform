import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

// Reputation types - all properties optional for flexibility
export interface ReputationScore {
  userId?: string;
  score?: number;
  overallScore?: number;
  level?: ReputationLevel;
  factors?: ReputationFactors;
  history?: ReputationHistoryEntry[];
  updatedAt?: any;
  lastCalculatedAt?: any;
  createdAt?: any;
  totalEvents?: number;
  version?: number;
  // Dimension scores
  reliability?: number;
  communication?: number;
  delivery?: number;
  expertiseValidation?: number;
  safetyConsistency?: number;
  [key: string]: any;
}

export type ReputationLevel = 'NEW' | 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';

export interface ReputationFactors {
  responseRate?: number;
  responseTime?: number;
  completionRate?: number;
  customerSatisfaction?: number;
  safetyScore?: number;
  verificationLevel?: number;
  [key: string]: any;
}

export interface ReputationHistoryEntry {
  date?: string | any;
  score?: number;
  level?: ReputationLevel;
  change?: number;
  reason?: string;
  dimension?: ReputationDimension | string;
  entryId?: string;
  userId?: string;
  [key: string]: any;
}

export interface ReputationUpdate {
  userId?: string;
  factor?: keyof ReputationFactors | string;
  value?: number;
  reason?: string;
  [key: string]: any;
}

export interface ReputationConfig {
  levelThresholds?: Record<ReputationLevel, number>;
  factorWeights?: Record<string, number>;
  decayRate?: number;
  minScoreForFeatures?: Record<string, number>;
  [key: string]: any;
}

export interface ReputationBadge {
  id?: string;
  name?: string;
  description?: string;
  icon?: string;
  requirement?: ReputationBadgeRequirement;
  [key: string]: any;
}

export interface ReputationAuditLog {
  id?: string;
  userId?: string;
  action?: string;
  previousScore?: number;
  newScore?: number;
  reason?: string;
  timestamp?: any;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface ReputationBadgeRequirement {
  minScore?: number;
  minLevel?: ReputationLevel;
  factor?: string;
  factorValue?: number;
  [key: string]: any;
}

export interface ReputationEvent {
  id?: string;
  eventId?: string;
  userId?: string;
  type?: ReputationEventType;
  eventType?: ReputationEventType;
  impact?: number;
  scoreImpact?: number;
  dimension?: ReputationDimension | string;
  timestamp?: any;
  metadata?: Record<string, any>;
  context?: any;
  source?: string;
  createdAt?: any;
  [key: string]: any;
}

// ReputationEventType as enum for value access
export enum ReputationEventType {
  POSITIVE_REVIEW = 'POSITIVE_REVIEW',
  NEGATIVE_REVIEW = 'NEGATIVE_REVIEW',
  COMPLETED_BOOKING = 'COMPLETED_BOOKING',
  CANCELLED_BOOKING = 'CANCELLED_BOOKING',
  FAST_RESPONSE = 'FAST_RESPONSE',
  SLOW_RESPONSE = 'SLOW_RESPONSE',
  SAFETY_INCIDENT = 'SAFETY_INCIDENT',
  VERIFICATION_COMPLETED = 'VERIFICATION_COMPLETED',
  SESSION_COMPLETED = 'SESSION_COMPLETED',
  SESSION_ATTENDED = 'SESSION_ATTENDED',
  SESSION_NO_SHOW = 'SESSION_NO_SHOW',
  SESSION_LATE_CANCEL = 'SESSION_LATE_CANCEL',
  REVIEW_RECEIVED = 'REVIEW_RECEIVED',
  CURRICULUM_COMPLETED = 'CURRICULUM_COMPLETED',
  CURRICULUM_MODULE_COMPLETED = 'CURRICULUM_MODULE_COMPLETED',
  EVENT_ATTENDED = 'EVENT_ATTENDED',
  EVENT_NO_SHOW = 'EVENT_NO_SHOW',
  CHALLENGE_COMPLETED = 'CHALLENGE_COMPLETED',
  PRODUCT_DELIVERED = 'PRODUCT_DELIVERED',
  PRODUCT_REFUNDED = 'PRODUCT_REFUNDED',
  DISPUTE_RESOLVED = 'DISPUTE_RESOLVED',
  DISPUTE_UNRESOLVED = 'DISPUTE_UNRESOLVED',
  CONSENT_VIOLATION = 'CONSENT_VIOLATION',
  HARASSMENT_DETECTED = 'HARASSMENT_DETECTED',
  SAFETY_VIOLATION = 'SAFETY_VIOLATION',
  TRUST_FLAG_ADDED = 'TRUST_FLAG_ADDED',
  TRUST_FLAG_REMOVED = 'TRUST_FLAG_REMOVED',
  REPORT_DISMISSED = 'REPORT_DISMISSED',
  NO_SAFETY_INCIDENTS = 'NO_SAFETY_INCIDENTS',
  TOKEN_PURCHASE = 'TOKEN_PURCHASE',
  PAYOUT_REQUESTED = 'PAYOUT_REQUESTED',
}

export enum ReputationDimension {
  RELIABILITY = 'RELIABILITY',
  COMMUNICATION = 'COMMUNICATION',
  DELIVERY = 'DELIVERY',
  EXPERTISE_VALIDATION = 'EXPERTISE_VALIDATION',
  EXPERTISE = 'EXPERTISE',
  SAFETY_CONSISTENCY = 'SAFETY_CONSISTENCY',
}

export interface ReputationSnapshot {
  userId?: string;
  score?: number;
  level?: ReputationLevel;
  timestamp?: any;
  [key: string]: any;
}

export interface ReputationLeaderboard {
  category?: string;
  entries?: ReputationLeaderboardEntry[];
  updatedAt?: any;
  [key: string]: any;
}

export interface ReputationLeaderboardEntry {
  userId?: string;
  rank?: number;
  score?: number;
  level?: ReputationLevel;
  displayName?: string;
  avatarUrl?: string;
  [key: string]: any;
}

export interface ReputationAlert {
  id?: string;
  userId?: string;
  type?: 'SCORE_DROP' | 'LEVEL_CHANGE' | 'BADGE_EARNED' | 'WARNING';
  message?: string;
  timestamp?: any;
  read?: boolean;
  [key: string]: any;
}

export interface ReputationRecoveryPlan {
  userId?: string;
  currentScore?: number;
  targetScore?: number;
  actions?: ReputationRecoveryAction[];
  deadline?: any;
  [key: string]: any;
}

export interface ReputationRecoveryAction {
  type?: string;
  description?: string;
  impact?: number;
  completed?: boolean;
  [key: string]: any;
}

export interface ReputationProtection {
  userId?: string;
  enabled?: boolean;
  protectionLevel?: 'BASIC' | 'ENHANCED' | 'PREMIUM';
  features?: string[];
  blockedReporterIds?: string[];
  massReportCampaigns?: any[];
  flagsPendingVerification?: any[];
  lastUpdatedAt?: any;
  minimumScoreFloor?: number;
  [key: string]: any;
}

export interface ReputationRecovery {
  userId?: string;
  plan?: ReputationRecoveryPlan;
  progress?: number;
  status?: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  dimension?: ReputationDimension | string;
  recoveryPoints?: number;
  targetPoints?: number;
  currentStreak?: number;
  requiredStreak?: number;
  completedAt?: any;
  startedAt?: any;
  [key: string]: any;
}

// Badge types - converted to enums for value access
export enum BadgeType {
  ACHIEVEMENT = 'ACHIEVEMENT',
  MILESTONE = 'MILESTONE',
  SPECIAL = 'SPECIAL',
  SEASONAL = 'SEASONAL',
  VERIFIED = 'VERIFIED',
  CREATOR = 'CREATOR',
  SUPPORTER = 'SUPPORTER',
  VERIFIED_IDENTITY = 'VERIFIED_IDENTITY',
  VERIFIED_SKILLS = 'VERIFIED_SKILLS',
}

export enum AchievementCategory {
  ENGAGEMENT = 'ENGAGEMENT',
  SAFETY = 'SAFETY',
  QUALITY = 'QUALITY',
  GROWTH = 'GROWTH',
  COMMUNITY = 'COMMUNITY',
  CREATOR = 'CREATOR',
  SUPPORTER = 'SUPPORTER',
}

export interface AchievementMilestone {
  id?: string;
  category?: AchievementCategory;
  name?: string;
  description?: string;
  threshold?: number;
  badgeId?: string;
  rewardTokens?: number;
  [key: string]: any;
}

export interface ReputationDisplaySettings {
  showScore?: boolean;
  showLevel?: boolean;
  showBadges?: boolean;
  showHistory?: boolean;
  publicProfile?: boolean;
  [key: string]: any;
}

export interface PublicReputation {
  userId?: string;
  displayName?: string;
  avatarUrl?: string;
  score?: number;
  level?: ReputationLevel;
  badges?: ReputationBadge[];
  memberSince?: any;
  [key: string]: any;
}

// Request/Response types
export interface AssignBadgeRequest {
  userId?: string;
  badgeId?: string;
  badgeType?: BadgeType;
  reason?: string;
  [key: string]: any;
}

export interface AssignBadgeResponse {
  success?: boolean;
  badge?: ReputationBadge;
  error?: string;
  [key: string]: any;
}

export interface RemoveBadgeRequest {
  userId?: string;
  badgeId?: string;
  reason?: string;
  [key: string]: any;
}

export interface RemoveBadgeResponse {
  success?: boolean;
  error?: string;
  [key: string]: any;
}

export interface TrackMilestoneRequest {
  userId?: string;
  milestoneId?: string;
  progress?: number;
  [key: string]: any;
}

export interface TrackMilestoneResponse {
  success?: boolean;
  milestone?: AchievementMilestone;
  completed?: boolean;
  error?: string;
  [key: string]: any;
}

export interface GetPublicReputationRequest {
  userId?: string;
  [key: string]: any;
}

export interface GetPublicReputationResponse {
  success?: boolean;
  reputation?: PublicReputation;
  error?: string;
  [key: string]: any;
}

export interface UpdateDisplaySettingsRequest {
  userId?: string;
  settings?: ReputationDisplaySettings;
  [key: string]: any;
}

export interface UpdateDisplaySettingsResponse {
  success?: boolean;
  settings?: ReputationDisplaySettings;
  error?: string;
  [key: string]: any;
}

// Badge definitions constant
export const BADGE_DEFINITIONS: Record<string, ReputationBadge> = {
  VERIFIED: { id: 'VERIFIED', name: 'Verified', description: 'Identity verified' },
  TOP_CREATOR: { id: 'TOP_CREATOR', name: 'Top Creator', description: 'Top performing earner' },
  SAFETY_CHAMPION: { id: 'SAFETY_CHAMPION', name: 'Safety Champion', description: 'Excellent safety record' },
  COMMUNITY_LEADER: { id: 'COMMUNITY_LEADER', name: 'Community Leader', description: 'Active community contributor' },
};

export const FORBIDDEN_BADGE_FIELDS: string[] = ['id', 'createdAt', 'systemAssigned'];

// Risk and policy types
export type RiskLabel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ReputationPolicyAction = 'WARN' | 'RESTRICT' | 'SUSPEND' | 'BAN' | 'REVIEW';

export interface ReputationSignals {
  positiveReviews?: number;
  negativeReviews?: number;
  completedSessions?: number;
  cancelledSessions?: number;
  safetyIncidents?: number;
  verificationLevel?: number;
  accountAge?: number;
  [key: string]: any;
}

export interface ReputationWeights {
  positiveReviews?: number;
  negativeReviews?: number;
  completedSessions?: number;
  cancelledSessions?: number;
  safetyIncidents?: number;
  verificationLevel?: number;
  accountAge?: number;
  [key: string]: any;
}

export const DEFAULT_REPUTATION_WEIGHTS: ReputationWeights = {
  positiveReviews: 10,
  negativeReviews: -15,
  completedSessions: 5,
  cancelledSessions: -10,
  safetyIncidents: -50,
  verificationLevel: 20,
  accountAge: 1,
};

export interface ReputationHistoryEvent {
  id?: string;
  userId?: string;
  eventType?: ReputationEventType;
  scoreBefore?: number;
  scoreAfter?: number;
  change?: number;
  reason?: string;
  timestamp?: any;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface ReputationInsights {
  userId?: string;
  strengths?: string[];
  weaknesses?: string[];
  recommendations?: string[];
  riskLevel?: RiskLabel;
  trend?: 'IMPROVING' | 'STABLE' | 'DECLINING';
  [key: string]: any;
}

export enum ReputationVisibilityContext {
  SELF = 'SELF',
  MATCH = 'MATCH',
  PUBLIC = 'PUBLIC',
  ADMIN = 'ADMIN',
  MENTORSHIP_BOOKING = 'MENTORSHIP_BOOKING',
  DIGITAL_PRODUCT_PURCHASE = 'DIGITAL_PRODUCT_PURCHASE',
  PAID_CLUB_JOIN = 'PAID_CLUB_JOIN',
  PAID_EVENT_JOIN = 'PAID_EVENT_JOIN',
}

// Score impact constants
export const REPUTATION_SCORE_IMPACTS: Record<string, number> = {
  POSITIVE_REVIEW: 10,
  NEGATIVE_REVIEW: -15,
  COMPLETED_BOOKING: 5,
  CANCELLED_BOOKING: -10,
  FAST_RESPONSE: 3,
  SLOW_RESPONSE: -2,
  SAFETY_INCIDENT: -50,
  VERIFICATION_COMPLETED: 20,
  SESSION_COMPLETED: 5,
  SESSION_NO_SHOW: -20,
};

// Utility functions
export function calculateOverallScore(
  signalsOrReliability: ReputationSignals | number,
  weightsOrCommunication?: ReputationWeights | number,
  delivery?: number,
  expertise?: number,
  safetyConsistency?: number
): number {
  // Support both object form and positional arguments
  if (typeof signalsOrReliability === 'number') {
    // Positional arguments form
    const reliability = signalsOrReliability;
    const communication = (weightsOrCommunication as number) || 50;
    const del = delivery || 50;
    const exp = expertise || 50;
    const safety = safetyConsistency || 50;
    return clampScore((reliability + communication + del + exp + safety) / 5);
  }
  
  // Object form
  const signals = signalsOrReliability;
  const w = (weightsOrCommunication as ReputationWeights) || DEFAULT_REPUTATION_WEIGHTS;
  let score = 50; // Base score
  for (const key of Object.keys(signals)) {
    const signal = signals[key] || 0;
    const weight = (w as any)[key] || 0;
    score += signal * weight;
  }
  return clampScore(score);
}

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

export function applyScoreFloor(score: number, floorOrIsUserRating?: number | boolean): number {
  // Support both (score, floor) and (score, isUserRating) forms
  const floor = typeof floorOrIsUserRating === 'number' ? floorOrIsUserRating : (floorOrIsUserRating ? 40 : 0);
  return Math.max(floor, score);
}

export function getDimensionForEvent(eventType: ReputationEventType): ReputationDimension {
  const mapping: Record<string, ReputationDimension> = {
    POSITIVE_REVIEW: ReputationDimension.COMMUNICATION,
    NEGATIVE_REVIEW: ReputationDimension.COMMUNICATION,
    COMPLETED_BOOKING: ReputationDimension.RELIABILITY,
    CANCELLED_BOOKING: ReputationDimension.RELIABILITY,
    FAST_RESPONSE: ReputationDimension.COMMUNICATION,
    SLOW_RESPONSE: ReputationDimension.COMMUNICATION,
    SAFETY_INCIDENT: ReputationDimension.SAFETY_CONSISTENCY,
    SESSION_COMPLETED: ReputationDimension.DELIVERY,
    SESSION_NO_SHOW: ReputationDimension.RELIABILITY,
  };
  return mapping[eventType] || ReputationDimension.RELIABILITY;
}

export function generateReasonString(
  eventOrType: ReputationEvent | ReputationEventType,
  change?: number
): string {
  if (typeof eventOrType === 'object') {
    return `${eventOrType.eventType || 'UNKNOWN'}: ${eventOrType.metadata?.description || 'No description'}`;
  }
  // Positional arguments form
  const changeStr = change !== undefined ? (change >= 0 ? `+${change}` : `${change}`) : '';
  return `${eventOrType}${changeStr ? ` (${changeStr})` : ''}`;
}

export function generateSuggestions(insights: ReputationInsights): string[] {
  const suggestions: string[] = [];
  if (insights.weaknesses?.includes('response_time')) {
    suggestions.push('Improve your response time to messages');
  }
  if (insights.weaknesses?.includes('cancellations')) {
    suggestions.push('Reduce booking cancellations');
  }
  if (insights.riskLevel === 'HIGH' || insights.riskLevel === 'CRITICAL') {
    suggestions.push('Review safety guidelines');
  }
  return suggestions;
}

export function validateReputationEvent(event: ReputationEvent): { valid: boolean; errors: string[] } | boolean {
  const errors: string[] = [];
  if (!event.userId) errors.push('userId is required');
  if (!event.eventType) errors.push('eventType is required');
  
  // Return object form for compatibility
  return {
    valid: errors.length === 0,
    errors,
  };
}

export function isBlockedReporter(protection: ReputationProtection, reporterId: string): boolean {
  return protection.blockedReporterIds?.includes(reporterId) || false;
}

export function detectMassReportCampaign(reports: any[], threshold: number = 5): boolean {
  // Simple detection: if same user reported by many in short time
  const recentReports = reports.filter(r => {
    const reportTime = r.timestamp?.toMillis?.() || r.timestamp || 0;
    const hourAgo = Date.now() - 3600000;
    return reportTime > hourAgo;
  });
  return recentReports.length >= threshold;
}

export function calculateReviewImpact(rating: number, weight: number = 1): number {
  // 5-star rating: positive impact, 1-star: negative
  const normalized = (rating - 3) * 5; // -10 to +10
  return normalized * weight;
}



























