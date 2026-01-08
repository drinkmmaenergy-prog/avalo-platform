/**
 * PACK 367: APP STORE DEFENSE & REPUTATION SYSTEM
 * Types and interfaces for store defense operations
 */

export type Platform = 'ios' | 'android';
export type FlagLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type ReviewClassification = 'fake_review' | 'emotional_rage' | 'coordinated_attack' | 'fair_criticism' | 'positive';
export type DefenseActionType = 
  | 'pause_notifications'
  | 'delay_updates'
  | 'suppress_prompts'
  | 'prioritize_support'
  | 'show_crisis_banner'
  | 'disable_invites'
  | 'lock_referrals'
  | 'shield_swipe';

export type CrisisEventType =
  | 'rating_drop'
  | 'uninstall_spike'
  | 'fraud_cluster'
  | 'coordinated_attack'
  | 'mass_negative_reviews';

export type ChurnSegment = 
  | 'CHURN_RISK'
  | 'FRAUD_FLAG'
  | 'SAFETY_UNDER_REVIEW'
  | 'ACTIVE'
  | 'DORMANT';

export interface StoreReview {
  id: string;
  platform: Platform;
  rating: number; // 1-5
  reviewText: string;
  authorName?: string;
  externalReviewId?: string;
  
  // AI Analysis
  sentimentScore: number; // -1 to 1
  classification: ReviewClassification;
  userRiskScore: number; // 0-100 from PACK 400
  
  // User Context
  userId?: string; // if identifiable
  installAge?: number; // days
  churnSegment?: ChurnSegment;
  
  // Flags
  flagLevel: FlagLevel;
  isVerified: boolean;
  isFlagged: boolean;
  flagReason?: string;
  
  // Metadata
  timestamp: FirebaseFirestore.Timestamp;
  importedAt: FirebaseFirestore.Timestamp;
  reviewDate: FirebaseFirestore.Timestamp;
  version?: string;
  
  // Audit
  lastAnalyzedAt?: FirebaseFirestore.Timestamp;
  analyzedBy?: string; // system/admin
}

export interface StoreReputationSignal {
  id: string;
  platform: Platform;
  signalType: 'rating_change' | 'review_volume' | 'uninstall_rate' | 'sentiment_shift' | 'fake_review_cluster';
  
  // Metrics
  severity: number; // 0-100
  confidence: number; // 0-100
  
  // Data
  currentValue: number;
  previousValue: number;
  changePercent: number;
  timeWindow: number; // hours
  
  // Details
  description: string;
  affectedReviews?: string[]; // review IDs
  detectionMethod: string;
  
  // Status
  resolved: boolean;
  resolvedAt?: FirebaseFirestore.Timestamp;
  resolvedBy?: string;
  
  // Timestamps
  timestamp: FirebaseFirestore.Timestamp;
  detectedAt: FirebaseFirestore.Timestamp;
}

export interface StoreDefenseAction {
  id: string;
  actionType: DefenseActionType;
  platform?: Platform;
  
  // Status
  active: boolean;
  autoTriggered: boolean;
  
  // Trigger Context
  triggeredBy: string; // system/admin userId
  triggerReason: string;
  relatedCrisisId?: string;
  relatedSignalIds?: string[];
  
  // Timing
  triggeredAt: FirebaseFirestore.Timestamp;
  deactivatedAt?: FirebaseFirestore.Timestamp;
  expiresAt?: FirebaseFirestore.Timestamp;
  
  // Impact
  affectedUsers?: number;
  affectedFeatures?: string[];
  
  // Audit
  notes?: string;
  overriddenBy?: string;
}

export interface StoreCrisisEvent {
  id: string;
  crisisType: CrisisEventType;
  platform?: Platform;
  
  // Status
  active: boolean;
  severity: number; // 0-100
  
  // Metrics
  triggerMetrics: {
    ratingDrop?: number;
    uninstallSpike?: number;
    fraudReviewCount?: number;
    timeWindow: number; // hours
  };
  
  // Actions
  triggeredActions: DefenseActionType[];
  activeActionIds: string[];
  
  // Timeline
  startedAt: FirebaseFirestore.Timestamp;
  detectedAt: FirebaseFirestore.Timestamp;
  resolvedAt?: FirebaseFirestore.Timestamp;
  
  // Resolution
  resolvedBy?: string;
  resolutionNotes?: string;
  impactAssessment?: string;
  
  // Notifications
  adminsNotified: string[];
  escalationLevel: number; // 1-5
}

export interface StoreReviewPrompt {
  id: string;
  userId: string;
  
  // Trigger
  triggerType: 'positive_chat' | 'successful_meeting' | 'successful_event' | 'payout_received' | 'support_resolved';
  triggerEventId?: string;
  
  // Status
  shown: boolean;
  responded: boolean;
  responseAction?: 'reviewed' | 'dismissed' | 'later';
  
  // Timing
  eligibleAt: FirebaseFirestore.Timestamp;
  shownAt?: FirebaseFirestore.Timestamp;
  respondedAt?: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
  
  // Safety Checks
  userChurnSegment: ChurnSegment;
  userRiskScore: number;
  blocked: boolean;
  blockReason?: string;
  
  // Audit
  auditLogId?: string;
}

export interface StoreDefenseConfig {
  id: string;
  
  // Crisis Thresholds
  crisisThresholds: {
    ratingDrop: number; // e.g., 0.3
    ratingDropWindow: number; // hours, e.g., 48
    uninstallSpikePercent: number; // e.g., 50
    uninstallSpikeWindow: number; // hours
    fraudReviewClusterSize: number; // e.g., 10
    fraudReviewClusterWindow: number; // hours
  };
  
  // Review Prompt Rules
  reviewPromptRules: {
    enabled: boolean;
    minDaysBetweenPrompts: number; // e.g., 30
    blockedChurnSegments: ChurnSegment[];
    minUserRiskScore: number; // must be below this
    maxPromptsPerUser: number;
  };
  
  // Defense Actions
  autoDefenseEnabled: boolean;
  defenseActionDurations: {
    [key in DefenseActionType]?: number; // hours
  };
  
  // Sentiment Analysis
  sentimentThresholds: {
    fakeReviewScore: number; // AI confidence threshold
    coordinatedAttackCorrelation: number;
    rageDetectionScore: number;
  };
  
  // Admin
  updatedAt: FirebaseFirestore.Timestamp;
  updatedBy: string;
}

// API Types
export interface ReviewScanRequest {
  platform: Platform;
  reviews: ExternalReview[];
  scanType: 'full' | 'incremental';
}

export interface ExternalReview {
  externalId: string;
  platform: Platform;
  rating: number;
  text: string;
  author: string;
  date: string;
  version?: string;
}

export interface ReviewScanResult {
  scannedCount: number;
  flaggedCount: number;
  newCrisisEvents: string[];
  triggeredActions: string[];
  summary: {
    averageRating: number;
    averageSentiment: number;
    fakeReviewCount: number;
    coordinatedAttackDetected: boolean;
  };
}

export interface DefenseStatus {
  platform: Platform;
  activeDefenseActions: StoreDefenseAction[];
  activeCrises: StoreCrisisEvent[];
  recentSignals: StoreReputationSignal[];
  currentRating: number;
  ratingTrend: 'up' | 'down' | 'stable';
  healthScore: number; // 0-100
}
