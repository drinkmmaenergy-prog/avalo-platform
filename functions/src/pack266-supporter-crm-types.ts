/**
 * PACK 266: Smart Supporter CRM (Fans Relationship Manager)
 * 
 * Type definitions for the supporter CRM system that helps creators
 * understand their paying audience, retain supporters, and prioritize engagement.
 * 
 * CORE PRINCIPLES:
 * - NO free messages or tokens
 * - NO changes to 65/35 split
 * - NO revealing supporter identity or location
 * - NO export or bulk messaging capabilities
 * - Privacy-safe design: supporters cannot see analytics about themselves
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// Supporter Segmentation
// ============================================================================

export type SupporterSegment =
  | 'vip'           // 💎 High lifetime spending
  | 'hot_lead'      // 🔥 Recent heavy activity / high conversion potential
  | 'active'        // ⭐ Regular messaging / viewing / gifting
  | 'dormant'       // 🌙 No activity in 7-30 days
  | 'cold';         // ❄️ No activity 30+ days

export type ConversionPotential = 
  | 'extremely_high'  // 90%+ probability
  | 'very_high'       // 70-89%
  | 'high'           // 50-69%
  | 'medium'         // 30-49%
  | 'low';           // <30%

export interface SupporterSegmentData {
  supporterId: string;
  creatorId: string;
  segment: SupporterSegment;
  conversionPotential: ConversionPotential;
  conversionProbability: number; // 0-100
  lastActivityAt: Timestamp;
  daysSinceLastActivity: number;
  lifetimeTokensSpent: number;
  monthlyTokensSpent: number;
  calculatedAt: Timestamp;
  signals: BehavioralSignals;
}

export interface BehavioralSignals {
  // Chat activity
  recentChatActivity: number;        // Messages sent in last 7 days
  avgChatResponseTime: number;       // Minutes
  totalChatsInitiated: number;
  
  // Gifting behavior
  totalGiftsSent: number;
  giftsLast7Days: number;
  giftsLast30Days: number;
  avgGiftValue: number;
  
  // Profile engagement
  profileViewsLast7Days: number;
  profileViewsLast30Days: number;
  
  // Live engagement
  liveStreamsAttended: number;
  liveStreamsAttendedLast7Days: number;
  avgLiveWatchTime: number;          // Minutes
  giftsInLive: number;
  
  // PPV purchases
  ppvPurchases: number;
  ppvLast30Days: number;
  
  // Fan Club
  isFanClubMember: boolean;
  fanClubTier?: 'silver' | 'gold' | 'diamond' | 'royal_elite';
  fanClubJoinedAt?: Timestamp;
  
  // Events
  eventsAttended: number;
  eventsRegistered: number;
  
  // Recency
  lastChatAt?: Timestamp;
  lastGiftAt?: Timestamp;
  lastLiveAt?: Timestamp;
  lastPurchaseAt?: Timestamp;
  
  // Online presence
  isCurrentlyOnline: boolean;
  avgOnlineHoursPerDay: number;
  preferredContactTimes: number[];   // Hours 0-23
}

// ============================================================================
// CRM Inbox Tabs
// ============================================================================

export type CRMInboxTab = 
  | 'vip'             // Top 10 supporters
  | 'hot_leads'       // Potential high spenders
  | 'all_supporters'  // All with payment history
  | 'dormant'        // Reactivation candidates
  | 'new';           // New paid-first-time supporters

export interface CRMInboxFilter {
  tab: CRMInboxTab;
  creatorId: string;
  limit?: number;
  sortBy?: 'online_status' | 'conversion_probability' | 'recent_live' | 'last_activity';
}

export interface CRMInboxEntry {
  supporterId: string;
  displayName: string;
  avatarUrl?: string;
  segment: SupporterSegment;
  conversionPotential: ConversionPotential;
  isOnline: boolean;
  lastActivityAt: Timestamp;
  lifetimeSpent: number;
  monthlySpent: number;
  unreadMessages: number;
  priorityScore: number;  // 0-100 for sorting
  hasRecentLiveInteraction: boolean;
  badges: string[];      // e.g., ['fan_club_gold', 'event_attendee']
}

// ============================================================================
// Supporter Profile Analytics
// ============================================================================

export interface SupporterProfile {
  supporterId: string;
  creatorId: string;
  
  // Spending metrics (VISIBLE to creator only)
  lifetimeTokensSpent: number;
  monthlyTokensSpent: number;
  weeklyTokensSpent: number;
  avgSpendPerMonth: number;
  
  // Feature usage breakdown
  featureUsage: {
    chat: {
      totalMessages: number;
      tokensSpent: number;
      avgResponseTime: number;  // Minutes
      lastChatAt?: Timestamp;
    };
    live: {
      streamsAttended: number;
      totalGifts: number;
      tokensSpent: number;
      avgWatchTime: number;     // Minutes
      lastAttendedAt?: Timestamp;
    };
    ppv: {
      itemsPurchased: number;
      tokensSpent: number;
      categories: string[];     // e.g., ['photos', 'videos']
      lastPurchaseAt?: Timestamp;
    };
    fanClub: {
      isMember: boolean;
      tier?: 'silver' | 'gold' | 'diamond' | 'royal_elite';
      joinedAt?: Timestamp;
      totalMonths: number;
      tokensSpent: number;
    };
    events: {
      attended: number;
      registered: number;
      tokensSpent: number;
      lastEventAt?: Timestamp;
    };
  };
  
  // Engagement metrics
  attendance: {
    liveStreamsAttended: number;
    liveStreamsTotal: number;
    attendanceRate: number;       // Percentage
    eventsAttended: number;
    eventsInvited: number;
  };
  
  // Communication analytics
  dmResponseScore: {
    avgResponseTime: number;      // Minutes
    responseRate: number;         // Percentage
    conversationStarters: number;
    repliesReceived: number;
  };
  
  // AI-calculated insights
  bestContactTime: {
    hourOfDay: number;            // 0-23
    dayOfWeek: number;            // 0-6 (Sunday-Saturday)
    confidence: number;           // 0-100
    timezone?: string;
  };
  
  // Behavioral patterns
  patterns: {
    preferredFeatures: string[];  // Most used features
    spendingTrend: 'increasing' | 'stable' | 'decreasing';
    engagementTrend: 'increasing' | 'stable' | 'decreasing';
    retentionRisk: 'low' | 'medium' | 'high';
    likelyToUpgrade: boolean;     // To higher fan club tier
  };
  
  // Lifecycle
  firstPurchaseAt: Timestamp;
  lastActivityAt: Timestamp;
  lifetimeDays: number;
  
  // Privacy: NO personal info
  // NEVER include: real name, phone, email, location, social media
  
  updatedAt: Timestamp;
}

// ============================================================================
// CRM Actions
// ============================================================================

export type CRMActionType =
  | 'dm_reminder'         // Send DM reminder
  | 'invite_to_live'      // Invite to upcoming live
  | 'offer_fan_club'      // Offer fan club membership
  | 'event_early_access'  // Early access to event
  | 'prioritize_reply';   // Mark for priority reply

export interface CRMAction {
  actionId: string;
  type: CRMActionType;
  creatorId: string;
  supporterId: string;
  status: 'pending' | 'executed' | 'failed';
  
  // Action-specific data
  metadata: {
    // For invite_to_live
    liveStreamId?: string;
    scheduledFor?: Timestamp;
    
    // For offer_fan_club
    suggestedTier?: 'silver' | 'gold' | 'diamond' | 'royal_elite';
    
    // For event_early_access
    eventId?: string;
    
    // For dm_reminder
    lastMessageAt?: Timestamp;
    hoursSinceLastMessage?: number;
  };
  
  expectedImpact?: {
    conversionProbability: number;
    estimatedTokens: number;
  };
  
  createdAt: Timestamp;
  executedAt?: Timestamp;
  result?: {
    success: boolean;
    responseReceived?: boolean;
    tokensGenerated?: number;
  };
}

// ============================================================================
// Smart Automation & Alerts
// ============================================================================

export type AlertType =
  | 'vip_online'              // VIP supporter is online now
  | 'hot_lead_active'         // Hot lead showing activity
  | 'dormant_reactivation'    // Dormant supporter opening profile
  | 'spending_spike'          // Unusual spending increase
  | 'fan_club_renewal_due'    // Fan club renewal coming up
  | 'event_rsvp'              // Supporter RSVP'd to event
  | 'milestone_reached';      // Supporter reached spending milestone

export interface SmartAlert {
  alertId: string;
  type: AlertType;
  creatorId: string;
  supporterId: string;
  
  priority: 'urgent' | 'high' | 'medium' | 'low';
  
  message: string;
  actionable: boolean;
  suggestedAction?: CRMActionType;
  
  metadata: {
    conversionProbability?: number;
    estimatedRevenue?: number;
    timeWindow?: string;        // e.g., "online for next 2 hours"
    context?: Record<string, any>;
  };
  
  createdAt: Timestamp;
  expiresAt?: Timestamp;        // Time-sensitive alerts expire
  readAt?: Timestamp;
  dismissedAt?: Timestamp;
}

// ============================================================================
// CRM Settings & Configuration
// ============================================================================

export interface CRMSettings {
  creatorId: string;
  enabled: boolean;
  
  preferences: {
    // Alert preferences
    enableAlerts: boolean;
    alertTypes: AlertType[];
    quietHours?: {
      start: number;  // Hour 0-23
      end: number;    // Hour 0-23
    };
    
    // Inbox preferences
    defaultTab: CRMInboxTab;
    sortPreference: 'online_status' | 'conversion_probability' | 'last_activity';
    
    // VIP threshold
    vipThresholdTokens: number;  // Default: 1000
    
    // Dormant threshold
    dormantThresholdDays: number;  // Default: 7
    coldThresholdDays: number;     // Default: 30
  };
  
  automations: {
    autoTagVIP: boolean;
    autoAlertHotLeads: boolean;
    autoRemindDormant: boolean;
  };
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// CRM Analytics & Metrics
// ============================================================================

export interface CRMMetrics {
  creatorId: string;
  period: 'daily' | 'weekly' | 'monthly';
  date: string;  // YYYY-MM-DD or YYYY-WW or YYYY-MM
  
  supporters: {
    total: number;
    new: number;
    active: number;
    dormant: number;
    reactivated: number;
    lost: number;
    
    bySegment: {
      vip: number;
      hot_lead: number;
      active: number;
      dormant: number;
      cold: number;
    };
  };
  
  engagement: {
    totalMessages: number;
    avgResponseTime: number;  // Minutes
    conversationsStarted: number;
    
    actionsExecuted: number;
    actionsByType: Record<CRMActionType, number>;
    
    alertsSent: number;
    alertsActedUpon: number;
  };
  
  revenue: {
    totalFromSupporters: number;
    avgPerSupporter: number;
    topSupporterContribution: number;
    
    byFeature: {
      chat: number;
      live: number;
      ppv: number;
      fanClub: number;
      events: number;
    };
  };
  
  retention: {
    retentionRate: number;       // Percentage
    churnRate: number;           // Percentage
    reactivationRate: number;    // Percentage
    avgLifetimeDays: number;
  };
  
  createdAt: Timestamp;
}

// ============================================================================
// CRM Leaderboard (PRIVATE - only creator sees)
// ============================================================================

export interface CRMLeaderboard {
  creatorId: string;
  topSupporters: Array<{
    supporterId: string;
    rank: number;
    lifetimeSpent: number;
    monthlySpent: number;
    segmentBadge: string;        // e.g., "💎 VIP"
    // NO personal identifying information
  }>;
  updatedAt: Timestamp;
}

// ============================================================================
// Safety & Privacy Guardrails
// ============================================================================

export interface SafetyCheck {
  passed: boolean;
  violations: string[];
  blockedActions: string[];
}

export const SAFETY_RULES = {
  // Never expose
  FORBIDDEN_DATA: [
    'realName',
    'phoneNumber',
    'email',
    'socialMediaHandles',
    'location',
    'city',
    'country',
    'ipAddress',
    'deviceInfo'
  ],
  
  // Never allow
  FORBIDDEN_ACTIONS: [
    'bulk_messaging',
    'export_supporter_list',
    'offline_meetup_planning',
    'identity_revelation',
    'contact_info_exchange'
  ],
  
  // Must respect
  CORE_ECONOMICS: {
    noFreeMessages: true,
    noFreeTokens: true,
    noSplitChanges: true,
    maintainPaywall: true
  }
};

// ============================================================================
// Integration with Other Packs
// ============================================================================

export interface PackIntegration {
  // From PACK 265 (AI Earn Assist)
  aiEarnAssist?: {
    lastSuggestion?: string;
    conversionScore: number;
  };
  
  // From PACK 262 (Levels)
  creatorLevel?: {
    level: string;
    lifetimeLP: number;
  };
  
  // From PACK 263 (Missions)
  activeMissions?: string[];
  
  // From PACK 261 (Dashboard)
  dashboardMetrics?: {
    todayEarnings: number;
    weeklyEarnings: number;
  };
  
  // Live Streams
  upcomingLive?: {
    streamId: string;
    scheduledFor: Timestamp;
  };
  
  // Events
  upcomingEvents?: Array<{
    eventId: string;
    date: Timestamp;
  }>;
  
  // Fan Clubs
  fanClubSettings?: {
    enabled: boolean;
    tiers: string[];
  };
}

// ============================================================================
// Function Response Types
// ============================================================================

export interface CRMResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Timestamp;
}

export interface SegmentSupportersResponse {
  success: boolean;
  segments: {
    vip: SupporterSegmentData[];
    hot_leads: SupporterSegmentData[];
    active: SupporterSegmentData[];
    dormant: SupporterSegmentData[];
    cold: SupporterSegmentData[];
  };
  count: number;
  updatedAt: Timestamp;
}

export interface GetInboxResponse {
  success: boolean;
  entries: CRMInboxEntry[];
  count: number;
  hasMore: boolean;
}

export interface GetSupporterProfileResponse {
  success: boolean;
  profile: SupporterProfile;
}

export interface ExecuteActionResponse {
  success: boolean;
  actionId: string;
  result?: {
    executed: boolean;
    message?: string;
    tokensGenerated?: number;
  };
}

export interface GetAlertsResponse {
  success: boolean;
  alerts: SmartAlert[];
  count: number;
  unreadCount: number;
}