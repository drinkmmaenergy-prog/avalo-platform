/**
 * PACK 253 — ROYAL UPGRADE FUNNEL
 * Performance-based elite creator tier system
 * Royal = high-demand profiles driving platform monetization
 */

export interface RoyalMetrics {
  userId: string;
  periodStart: number; // timestamp
  periodEnd: number; // timestamp
  
  // Required metrics for Royal unlock
  uniquePaidPartners: number; // Must be 30+ in last 90 days
  totalEarnings: number; // Must be 10,000+ tokens in last 90 days
  averageRating: number; // Must be 4.2+ / 5 in last 90 days
  isVerified: boolean; // Selfie + doc verification required
  
  // Supporting metrics for boost calculation
  eventParticipation: number;
  storyAlbumSales: number;
  boostPurchases: number;
  
  // Tracking data
  lastUpdated: number;
  calculatedAt: number;
}

export interface RoyalStatus {
  userId: string;
  isRoyal: boolean;
  isDormant: boolean; // Was Royal but dropped below 2/4 metrics
  
  // Timing
  royalSince: number | null; // timestamp when first became Royal
  royalExpiresAt: number | null; // 90 days from royalSince
  lastChecked: number;
  
  // Current metrics snapshot
  currentMetrics: {
    uniquePaidPartners: number;
    totalEarnings: number;
    averageRating: number;
    isVerified: boolean;
  };
  
  // Decay tracking
  metricsPassingCount: number; // How many of 4 metrics currently passing
  decayWarning: boolean; // True if only 2 metrics passing near expiry
  
  // Benefits active
  hasCustomPricing: boolean;
  hasPriorityInbox: boolean;
  hasDiscoveryBoost: boolean;
  
  // Metadata
  totalTimeAsRoyal: number; // total days spent as Royal (cumulative)
  timesAchievedRoyal: number; // how many times user became Royal
  visibleTo: string[]; // who can see this status (for badge display)
}

export interface RoyalProgress {
  userId: string;
  progressPercentage: number; // 0-100
  
  // Individual metric progress
  partnersProgress: number; // out of 30
  earningsProgress: number; // out of 10,000 tokens
  ratingProgress: number; // out of 4.2
  verificationProgress: boolean;
  
  // Status
  isEligible: boolean; // All 4 metrics met
  nextMilestone: string; // e.g., "5 more paid partners needed"
  
  lastUpdated: number;
}

export interface RoyalAnalytics {
  userId: string;
  periodStart: number;
  periodEnd: number;
  
  // Revenue breakdown
  chatRevenue: number;
  callRevenue: number;
  storyRevenue: number;
  albumRevenue: number;
  digitalProductRevenue: number;
  totalRevenue: number;
  
  // Engagement metrics
  uniquePayers: number;
  repeatPayers: number;
  averageTransactionSize: number;
  peakEarningHour: number; // hour of day (0-23)
  peakEarningDay: number; // day of week (0-6)
  
  // Royal-specific metrics
  royalEarningsBonus: number; // Extra earned from 7-word vs 11-word ratio
  customPricingRevenue: number; // Revenue from custom chat pricing
  priorityInboxConversions: number; // Chats initiated from priority placement
  
  // Retention
  returningPayerRate: number; // % of payers who came back this period
  averagePayerLifetimeValue: number;
  
  generatedAt: number;
}

export interface RoyalEvent {
  eventId: string;
  creatorId: string;
  title: string;
  description: string;
  
  startTime: number;
  endTime: number;
  
  // Event type
  type: 'networking' | 'workshop' | 'exclusive' | 'celebration';
  
  // Participants
  attendeeIds: string[];
  maxAttendees: number;
  
  // Status
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  
  createdAt: number;
  updatedAt: number;
}

export interface RoyalPricing {
  userId: string;
  chatPrice: number; // 100-500 tokens
  isActive: boolean;
  setAt: number;
  updatedAt: number;
}

export interface RoyalDecay {
  userId: string;
  warningLevel: 'none' | 'info' | 'warning' | 'critical';
  expiresAt: number;
  metricsStatus: {
    uniquePaidPartners: boolean;
    totalEarnings: boolean;
    averageRating: boolean;
    isVerified: boolean;
  };
  lastWarningAt: number;
  nextCheckAt: number;
}

export interface RoyalNotification {
  type: 'progress' | 'unlock' | 'decay_warning' | 'lost' | 'restored';
  userId: string;
  data: Record<string, any>;
  sentAt: number;
}

// Constants
export const ROYAL_REQUIREMENTS = {
  UNIQUE_PAID_PARTNERS: 30,
  TOTAL_EARNINGS: 10000,
  AVERAGE_RATING: 4.2,
  VERIFICATION_REQUIRED: true,
  PERIOD_DAYS: 90,
} as const;

export const ROYAL_BENEFITS = {
  EARNINGS_RATIO: 7, // 7 words = 1 token (vs 11 for standard)
  MIN_CHAT_PRICE: 100,
  MAX_CHAT_PRICE: 500,
  DISCOVERY_BOOST_PERCENTILE: 10, // Top 10% ranking
  INBOX_PRIORITY: 1, // Always first
  DURATION_DAYS: 90,
  MIN_METRICS_TO_MAINTAIN: 2, // Need 2 of 4 to keep Royal
} as const;

export const ROYAL_NOTIFICATION_THRESHOLDS = {
  PROGRESS_80: 80,
  PROGRESS_95: 95,
  DECAY_WARNING_DAYS: 14, // Warn 14 days before expiry if <2 metrics
} as const;