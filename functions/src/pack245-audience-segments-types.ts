/**
 * PACK 245: Audience Classification & VIP Segmenting
 * TypeScript types and interfaces for smart viewer segmentation
 */

import { Timestamp } from 'firebase-admin/firestore';

// ========================================================================
// Core Segment Types
// ========================================================================

/**
 * Budget classification based on spending patterns
 */
export type BudgetTier = 'low' | 'mid' | 'high';

/**
 * Primary intent/behavior pattern
 */
export type IntentType = 'chat' | 'call' | 'meeting' | 'event';

/**
 * Geographic proximity classification
 */
export type ProximityClass = 'local' | 'nearby' | 'remote';

/**
 * Risk assessment level (INTERNAL ONLY)
 */
export type RiskLevel = 'normal' | 'watch' | 'blocked';

// ========================================================================
// Audience Segment Document
// Per viewer-creator relationship
// ========================================================================

export interface PassionSignals {
  /** Overlapping interests between viewer and creator */
  sharedInterests: boolean;
  
  /** High engagement without payment (views, likes) */
  visualAttraction: boolean;
  
  /** Repeated visits and chats over time */
  loyalFollower: boolean;
}

export interface AudienceSegment {
  /** Document ID: `${viewerId}_${creatorId}` */
  id: string;
  
  /** Viewer user ID */
  viewerId: string;
  
  /** Creator user ID */
  creatorId: string;
  
  // Economic segment
  /** Budget classification */
  budget: BudgetTier;
  
  /** Primary behavior/intent */
  intent: IntentType;
  
  /** Geographic proximity */
  proximity: ProximityClass;
  
  /** Passion/engagement signals */
  passion: PassionSignals;
  
  /** Risk assessment (INTERNAL ONLY, never exposed) */
  risk: RiskLevel;
  
  /** Last segment update timestamp */
  lastUpdated: Timestamp;
  
  /** Segment calculation version for migrations */
  version: number;
}

// ========================================================================
// Budget Classification Cache
// ========================================================================

export interface SpendingPattern {
  /** Total amount spent (in tokens) */
  totalSpent: number;
  
  /** Number of purchases */
  purchaseCount: number;
  
  /** Average purchase size */
  avgPurchaseSize: number;
  
  /** Last purchase timestamp */
  lastPurchaseAt: Timestamp | null;
  
  /** Purchase frequency (purchases per 30 days) */
  purchaseFrequency: number;
}

export interface BudgetClassificationCache {
  /** User ID */
  userId: string;
  
  /** Computed budget tier */
  budgetTier: BudgetTier;
  
  /** Spending on chats */
  chatSpending: SpendingPattern;
  
  /** Spending on calls */
  callSpending: SpendingPattern;
  
  /** Spending on meetings */
  meetingSpending: SpendingPattern;
  
  /** Spending on events */
  eventSpending: SpendingPattern;
  
  /** Spending on gifts */
  giftSpending: SpendingPattern;
  
  /** Total spending across all categories */
  totalSpending: number;
  
  /** Last calculation timestamp */
  lastUpdated: Timestamp;
}

// ========================================================================
// Intent Classification Cache
// ========================================================================

export interface ActivityMetrics {
  /** Total count */
  count: number;
  
  /** Total tokens spent */
  tokensSpent: number;
  
  /** Last activity timestamp */
  lastActivityAt: Timestamp | null;
  
  /** Activity frequency (per 30 days) */
  frequency: number;
}

export interface IntentClassificationCache {
  /** User ID */
  userId: string;
  
  /** Primary computed intent */
  primaryIntent: IntentType;
  
  /** Secondary intent (if applicable) */
  secondaryIntent: IntentType | null;
  
  /** Chat activity metrics */
  chatActivity: ActivityMetrics;
  
  /** Call activity metrics */
  callActivity: ActivityMetrics;
  
  /** Meeting activity metrics */
  meetingActivity: ActivityMetrics;
  
  /** Event activity metrics */
  eventActivity: ActivityMetrics;
  
  /** Chat frequency score (0-100) */
  chatFrequency: number;
  
  /** Call frequency score (0-100) */
  callFrequency: number;
  
  /** Meeting frequency score (0-100) */
  meetingFrequency: number;
  
  /** Event frequency score (0-100) */
  eventFrequency: number;
  
  /** Last calculation timestamp */
  lastUpdated: Timestamp;
}

// ========================================================================
// Proximity Cache
// ========================================================================

export interface LocationData {
  /** City name */
  city: string | null;
  
  /** Region/state */
  region: string | null;
  
  /** Country code (ISO 3166-1 alpha-2) */
  countryCode: string;
  
  /** Latitude (approximate, for distance calc) */
  lat: number;
  
  /** Longitude (approximate, for distance calc) */
  lng: number;
  
  /** Last location update */
  lastUpdated: Timestamp;
}

export interface ProximityCache {
  /** Document ID: `${viewerId}_${creatorId}` */
  id: string;
  
  /** Viewer user ID */
  viewerId: string;
  
  /** Creator user ID */
  creatorId: string;
  
  /** Computed proximity classification */
  proximityClass: ProximityClass;
  
  /** Distance in kilometers (approximate) */
  distanceKm: number;
  
  /** Same city flag */
  sameCity: boolean;
  
  /** Same region flag */
  sameRegion: boolean;
  
  /** Same country flag */
  sameCountry: boolean;
  
  /** Viewer location data */
  viewerLocation: LocationData;
  
  /** Creator location data */
  creatorLocation: LocationData;
  
  /** Last calculation timestamp */
  lastUpdated: Timestamp;
}

// ========================================================================
// Passion Signals
// ========================================================================

export interface InterestOverlap {
  /** Number of shared interests */
  sharedCount: number;
  
  /** List of shared interest tags */
  sharedInterests: string[];
  
  /** Interest overlap score (0-100) */
  overlapScore: number;
}

export interface EngagementMetrics {
  /** Total profile views */
  profileViews: number;
  
  /** Total media views */
  mediaViews: number;
  
  /** Total likes given */
  totalLikes: number;
  
  /** Average session duration (seconds) */
  avgSessionDuration: number;
  
  /** Last engagement timestamp */
  lastEngagementAt: Timestamp | null;
}

export interface LoyaltyMetrics {
  /** Total visit count */
  totalVisits: number;
  
  /** Visits in last 30 days */
  recentVisits: number;
  
  /** Days since first interaction */
  daysSinceFirstContact: number;
  
  /** Consecutive days with activity */
  streakDays: number;
  
  /** Average days between visits */
  avgDaysBetweenVisits: number;
}

export interface PassionSignalsDocument {
  /** Document ID: `${viewerId}_${creatorId}` */
  id: string;
  
  /** Viewer user ID */
  viewerId: string;
  
  /** Creator user ID */
  creatorId: string;
  
  /** Interest overlap data */
  interestOverlap: InterestOverlap;
  
  /** Engagement metrics */
  engagement: EngagementMetrics;
  
  /** Loyalty metrics */
  loyalty: LoyaltyMetrics;
  
  /** Computed shared interests flag */
  sharedInterests: boolean;
  
  /** Visual attraction score (0-100) */
  visualAttractionScore: number;
  
  /** Computed visual attraction flag */
  visualAttraction: boolean;
  
  /** Loyalty score (0-100) */
  loyaltyScore: number;
  
  /** Computed loyal follower flag */
  loyalFollower: boolean;
  
  /** Last calculation timestamp */
  lastUpdated: Timestamp;
}

// ========================================================================
// Risk Assessment Cache (INTERNAL ONLY)
// ========================================================================

export interface RiskIndicators {
  /** Rapid spending pattern changes */
  spendingAnomaly: boolean;
  
  /** Unusual interaction patterns */
  behaviorAnomaly: boolean;
  
  /** Multiple reports received */
  reportCount: number;
  
  /** Safety flags from other systems */
  safetyFlags: string[];
  
  /** Fraud detection score (0-100) */
  fraudScore: number;
}

export interface RiskAssessmentCache {
  /** User ID */
  userId: string;
  
  /** Computed risk level */
  riskLevel: RiskLevel;
  
  /** Risk indicators */
  indicators: RiskIndicators;
  
  /** Needs manual review flag */
  needsReview: boolean;
  
  /** Review reason */
  reviewReason: string | null;
  
  /** Last assessment timestamp */
  lastUpdated: Timestamp;
  
  /** Next scheduled review */
  nextReviewAt: Timestamp | null;
}

// ========================================================================
// Creator Audience Analytics (Aggregated)
// ========================================================================

export interface SegmentDistribution {
  /** Percentage of audience in low budget */
  lowBudget: number;
  
  /** Percentage of audience in mid budget */
  midBudget: number;
  
  /** Percentage of audience in high budget */
  highBudget: number;
}

export interface IntentDistribution {
  /** Percentage chat-focused */
  chatFocused: number;
  
  /** Percentage call-focused */
  callFocused: number;
  
  /** Percentage meeting-focused */
  meetingFocused: number;
  
  /** Percentage event-focused */
  eventExplorer: number;
}

export interface ProximityDistribution {
  /** Percentage local */
  local: number;
  
  /** Percentage nearby */
  nearby: number;
  
  /** Percentage remote */
  remote: number;
}

export interface PassionDistribution {
  /** Percentage with shared interests */
  sharedInterests: number;
  
  /** Percentage with visual attraction */
  visualAttraction: number;
  
  /** Percentage loyal followers */
  loyalFollower: number;
}

export interface TopSegmentCombination {
  /** Budget tier */
  budget: BudgetTier;
  
  /** Intent type */
  intent: IntentType;
  
  /** Proximity class */
  proximity: ProximityClass;
  
  /** Count of viewers in this segment */
  count: number;
  
  /** Percentage of total audience */
  percentage: number;
  
  /** Average revenue per viewer in this segment */
  avgRevenue: number;
}

export interface CreatorAudienceAnalytics {
  /** Creator user ID */
  creatorId: string;
  
  /** Total unique viewers with segments */
  totalAudienceSize: number;
  
  /** Paying audience size */
  payingAudienceSize: number;
  
  /** Budget tier distribution */
  budgetDistribution: SegmentDistribution;
  
  /** Intent distribution */
  intentDistribution: IntentDistribution;
  
  /** Proximity distribution */
  proximityDistribution: ProximityDistribution;
  
  /** Passion signals distribution */
  passionDistribution: PassionDistribution;
  
  /** Top 5 segment combinations */
  topSegments: TopSegmentCombination[];
  
  /** Most valuable segment (highest avg revenue) */
  mostValuableSegment: TopSegmentCombination;
  
  /** Largest growing segment (by count) */
  growingSegment: TopSegmentCombination | null;
  
  /** Last calculation timestamp */
  calculatedAt: Timestamp;
  
  /** Next scheduled update */
  nextUpdateAt: Timestamp;
}

// ========================================================================
// Segment Update Events (Audit Trail)
// ========================================================================

export type SegmentChangeType = 
  | 'budget_upgraded'
  | 'budget_downgraded'
  | 'intent_changed'
  | 'proximity_changed'
  | 'passion_increased'
  | 'passion_decreased'
  | 'risk_elevated'
  | 'risk_cleared'
  | 'initial_classification';

export interface SegmentChange {
  /** Field that changed */
  field: string;
  
  /** Old value */
  oldValue: any;
  
  /** New value */
  newValue: any;
}

export interface SegmentUpdateEvent {
  /** Event ID */
  id: string;
  
  /** Viewer user ID */
  viewerId: string;
  
  /** Creator user ID */
  creatorId: string;
  
  /** Type of change */
  changeType: SegmentChangeType;
  
  /** Changes made */
  changes: SegmentChange[];
  
  /** Reason for update */
  reason: string;
  
  /** Triggering event (e.g., 'purchase', 'chat_completed') */
  trigger: string;
  
  /** Event timestamp */
  createdAt: Timestamp;
}

// ========================================================================
// Segment Computation Queue
// ========================================================================

export type ComputationStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface SegmentComputationQueue {
  /** Queue item ID */
  id: string;
  
  /** Viewer user ID */
  viewerId: string;
  
  /** Creator user ID (null for all creators) */
  creatorId: string | null;
  
  /** Computation type */
  computationType: 'full' | 'incremental' | 'targeted';
  
  /** Processing status */
  status: ComputationStatus;
  
  /** Priority (1-10, higher = more urgent) */
  priority: number;
  
  /** Scheduled computation time */
  scheduledAt: Timestamp;
  
  /** Started processing time */
  startedAt: Timestamp | null;
  
  /** Completed processing time */
  completedAt: Timestamp | null;
  
  /** Error message (if failed) */
  error: string | null;
  
  /** Retry count */
  retryCount: number;
  
  /** Maximum retries allowed */
  maxRetries: number;
}

// ========================================================================
// Segment Performance Metrics
// ========================================================================

export interface ConversionMetrics {
  /** Total impressions */
  impressions: number;
  
  /** Total clicks/interactions */
  interactions: number;
  
  /** Total conversions */
  conversions: number;
  
  /** Conversion rate */
  conversionRate: number;
  
  /** Average revenue per conversion */
  avgRevenuePerConversion: number;
  
  /** Total revenue generated */
  totalRevenue: number;
}

export interface SegmentPerformanceMetrics {
  /** Metric ID */
  id: string;
  
  /** Metric type */
  metricType: 'daily' | 'weekly' | 'monthly';
  
  /** Segment type being measured */
  segmentType: 'budget' | 'intent' | 'proximity' | 'passion' | 'combined';
  
  /** Segment value */
  segmentValue: string;
  
  /** Creator ID (null for platform-wide) */
  creatorId: string | null;
  
  /** Performance metrics */
  metrics: ConversionMetrics;
  
  /** Comparison to baseline */
  performanceVsBaseline: number;
  
  /** Timestamp */
  timestamp: Timestamp;
  
  /** Period start */
  periodStart: Timestamp;
  
  /** Period end */
  periodEnd: Timestamp;
}

// ========================================================================
// Segment Configuration
// ========================================================================

export interface BudgetThresholds {
  /** Low to mid threshold (total spending) */
  lowToMid: number;
  
  /** Mid to high threshold (total spending) */
  midToHigh: number;
  
  /** Minimum purchase frequency for mid (per 30 days) */
  midFrequency: number;
  
  /** Minimum purchase frequency for high (per 30 days) */
  highFrequency: number;
}

export interface IntentThresholds {
  /** Minimum activity count for primary classification */
  minActivityCount: number;
  
  /** Minimum ratio for strong intent signal */
  strongIntentRatio: number;
}

export interface ProximityThresholds {
  /** Local radius in km */
  localRadiusKm: number;
  
  /** Nearby radius in km */
  nearbyRadiusKm: number;
}

export interface PassionThresholds {
  /** Minimum shared interests for flag */
  minSharedInterests: number;
  
  /** Minimum visual attraction score */
  minVisualAttractionScore: number;
  
  /** Minimum loyalty score */
  minLoyaltyScore: number;
  
  /** Minimum visits for loyalty */
  minVisitsForLoyalty: number;
}

export interface SegmentConfiguration {
  /** Configuration ID */
  id: string;
  
  /** Configuration type */
  configType: 'budget' | 'intent' | 'proximity' | 'passion' | 'risk';
  
  /** Budget thresholds */
  budgetThresholds?: BudgetThresholds;
  
  /** Intent thresholds */
  intentThresholds?: IntentThresholds;
  
  /** Proximity thresholds */
  proximityThresholds?: ProximityThresholds;
  
  /** Passion thresholds */
  passionThresholds?: PassionThresholds;
  
  /** Active flag */
  isActive: boolean;
  
  /** Last updated */
  updatedAt: Timestamp;
  
  /** Updated by user ID */
  updatedBy: string;
}

// ========================================================================
// Segment Integration Hooks
// ========================================================================

export interface SegmentUpdateTrigger {
  /** User ID to update */
  userId: string;
  
  /** Creator ID (null for all) */
  creatorId: string | null;
  
  /** Trigger source */
  source: 'purchase' | 'chat' | 'call' | 'meeting' | 'event' | 'location' | 'profile' | 'scheduled';
  
  /** Priority for queue */
  priority: number;
  
  /** Additional context */
  context?: Record<string, any>;
}

// ========================================================================
// Helper Types
// ========================================================================

export interface SegmentFilter {
  budget?: BudgetTier[];
  intent?: IntentType[];
  proximity?: ProximityClass[];
  sharedInterests?: boolean;
  visualAttraction?: boolean;
  loyalFollower?: boolean;
  risk?: RiskLevel[];
}

export interface SegmentScore {
  budget: number;
  intent: number;
  proximity: number;
  passion: number;
  overall: number;
}