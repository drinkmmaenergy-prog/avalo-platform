import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

// Stub types for KPI
export interface KpiEvent  {
  id?: string;
  eventId?: string;
  type?: KpiEventType;
  eventType?: any;
  userId?: any;
  timestamp?: any;
  createdAt?: any;
  context?: any;
  metadata?: Record<string, any>;
  [key: string]: any;
}

// KpiEventType as enum for value access
export enum KpiEventType {
  // User lifecycle
  USER_SIGNUP = 'USER_SIGNUP',
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_DELETED = 'USER_DELETED',
  VERIFICATION_COMPLETED = 'VERIFICATION_COMPLETED',
  PROFILE_COMPLETED = 'PROFILE_COMPLETED',
  
  // Engagement
  CHAT_STARTED = 'CHAT_STARTED',
  CHAT_MESSAGE_SENT = 'CHAT_MESSAGE_SENT',
  CHAT_PAID_STARTED = 'CHAT_PAID_STARTED',
  CHAT_PAID_ENDED = 'CHAT_PAID_ENDED',
  CALL_STARTED = 'CALL_STARTED',
  CALL_ENDED = 'CALL_ENDED',
  VOICE_CALL_ENDED = 'VOICE_CALL_ENDED',
  VIDEO_CALL_ENDED = 'VIDEO_CALL_ENDED',
  
  // Swipes
  SWIPE_LIKE = 'SWIPE_LIKE',
  SWIPE_PASS = 'SWIPE_PASS',
  
  // Monetization
  TOKEN_PURCHASED = 'TOKEN_PURCHASED',
  TOKEN_SPENT = 'TOKEN_SPENT',
  SUBSCRIPTION_STARTED = 'SUBSCRIPTION_STARTED',
  SUBSCRIPTION_CANCELLED = 'SUBSCRIPTION_CANCELLED',
  PURCHASE = 'PURCHASE',
  MESSAGE_SENT = 'MESSAGE_SENT',
  SUBSCRIPTION_CREATED = 'SUBSCRIPTION_CREATED',
  CHURN = 'CHURN',
  
  // Calendar
  CALENDAR_BOOKING_CREATED = 'CALENDAR_BOOKING_CREATED',
  CALENDAR_BOOKING_COMPLETED = 'CALENDAR_BOOKING_COMPLETED',
  CALENDAR_BOOKING_CANCELLED = 'CALENDAR_BOOKING_CANCELLED',
  
  // Events
  EVENT_TICKET_PURCHASED = 'EVENT_TICKET_PURCHASED',
  
  // AI
  AI_COMPANION_PAID_MESSAGE = 'AI_COMPANION_PAID_MESSAGE',
  
  // Safety
  REPORT_SUBMITTED = 'REPORT_SUBMITTED',
  REPORT_RESOLVED = 'REPORT_RESOLVED',
  USER_BANNED = 'USER_BANNED',
  USER_SUSPENDED = 'USER_SUSPENDED',
  FRAUD_FLAG_RAISED = 'FRAUD_FLAG_RAISED',
  
  // Payouts
  PAYOUT_REQUESTED = 'PAYOUT_REQUESTED',
  PAYOUT_COMPLETED = 'PAYOUT_COMPLETED',
  
  // Creator metrics events
  TIP_RECEIVED = 'TIP_RECEIVED',
  SUBSCRIPTION_PAYMENT = 'SUBSCRIPTION_PAYMENT',
  GIFT_RECEIVED = 'GIFT_RECEIVED',
  PROFILE_VIEW = 'PROFILE_VIEW',
  CHAT_MESSAGE_RECEIVED = 'CHAT_MESSAGE_RECEIVED',
  FOLLOW_RECEIVED = 'FOLLOW_RECEIVED',
  
  // Daily aggregator events
  DAILY_ACTIVE_USER = 'DAILY_ACTIVE_USER',
  NEW_USER_SIGNUP = 'NEW_USER_SIGNUP',
  REVENUE_EVENT = 'REVENUE_EVENT',
  FRAUD_DETECTED = 'FRAUD_DETECTED',
  REPORT_RECEIVED = 'REPORT_RECEIVED',
  
  // Legacy aliases (same values as canonical)
  SIGNUP = 'USER_SIGNUP',
  TOKEN_PURCHASE = 'TOKEN_PURCHASED',
  PANIC_TRIGGERED = 'REPORT_SUBMITTED',
  SUPPORT_TICKET_CREATED = 'REPORT_SUBMITTED',
  SUPPORT_TICKET_RESOLVED = 'REPORT_RESOLVED',
  VOICE_CALL_STARTED = 'CALL_STARTED',
  VIDEO_CALL_STARTED = 'CALL_STARTED',
}

export interface KpiMetrics  {
  dau: number;
  mau: number;
  revenue: number;
  churn: number;
  [key: string]: any;
}

export interface CreatorPerformanceMetrics  {
  earnerId?: string;
  earnings?: number;
  messageCount?: number;
  callMinutes?: number;
  responseRate?: number;
  avgResponseTime?: number;
  customerSatisfaction?: number;
  date?: string;
  tokensEarned?: number;
  tokensEarnedChat?: number;
  tokensEarnedVoiceCalls?: number;
  tokensEarnedVideoCalls?: number;
  tokensEarnedCalendar?: number;
  tokensEarnedEvents?: number;
  isTopPerformer?: boolean;
  [key: string]: any;
}

export interface CreatorDailyMetricsDocument  {
  earnerId?: string;
  date?: string;
  metrics?: CreatorPerformanceMetrics;
  createdAt?: any;
  computedAt?: any;
  version?: number;
  earnings?: number;
  messageCount?: number;
  callMinutes?: number;
  responseRate?: number;
  avgResponseTime?: number;
  customerSatisfaction?: number;
  [key: string]: any;
}

export interface DateRange  {
  start?: any;
  end?: any;
  startDate?: string;
  endDate?: string;
  [key: string]: any;
}

export interface KpiDailyMetricsDocument  {
  date: string;
  growth: DailyGrowthMetrics;
  monetization: DailyMonetizationMetrics;
  safety: DailySafetyMetrics;
  createdAt: any;
  [key: string]: any;
}

export interface DailyGrowthMetrics  {
  newUsers?: number;
  activeUsers?: number;
  returningUsers?: number;
  churnedUsers?: number;
  retentionRate?: number;
  date?: string;
  newSignups?: number;
  verifiedUsers?: number;
  completedProfiles?: number;
  activeUsersDaily?: number;
  activeUsersWeeklyRolling?: number;
  activeUsersMonthlyRolling?: number;
  totalSwipes?: number;
  totalLikes?: number;
  totalPasses?: number;
  totalMatches?: number;
  [key: string]: any;
}

export interface DailyMonetizationMetrics  {
  totalRevenue?: number;
  revenueByVertical?: Record<string, number>;
  avgRevenuePerUser?: number;
  averageRevenuePerUser?: number;
  payingUsers?: number;
  conversionRate?: number;
  date?: string;
  totalTokenPurchases?: number;
  totalTokensSold?: number;
  totalTokensBurned?: number;
  totalPlatformRevenueTokens?: number;
  payingUsersCount?: number;
  newPayingUsersCount?: number;
  payoutTotalAmount?: number;
  [key: string]: any;
}

export interface DailySafetyMetrics  {
  reportsReceived?: number;
  reportsResolved?: number;
  fraudDetected?: number;
  fraudCases?: number;
  banCount?: number;
  fraudBySeverity?: Record<string, number>;
  date?: string;
  supportTicketsTotal?: number;
  supportTicketsSafety?: number;
  supportTicketsResolved?: number;
  panicEventsCount?: number;
  bansCount?: number;
  suspensionsCount?: number;
  fraudFlagsCount?: number;
  fraudByType?: Record<string, number>;
  highRiskRegions?: any;
  [key: string]: any;
}

export const DEFAULT_REVENUE_BY_VERTICAL: Record<string, number> = {
  chat: 0,
  call: 0,
  subscription: 0,
  tips: 0,
};

export const DEFAULT_FRAUD_BY_SEVERITY: Record<string, number> = {
  low: 0,
  medium: 0,
  high: 0,
  critical: 0,
};

export interface KpiEventInput  {
  type?: KpiEventType;
  eventType?: KpiEventType | any;
  userId: string;
  metadata?: Record<string, any>;
  context?: KpiEventContext | Record<string, any>;
  [key: string]: any;
}

export interface KpiEventContext  {
  timestamp?: any;
  source?: string;
  sessionId?: string;
  tokensCharged?: number;
  ticketPrice?: number;
  [key: string]: any;
}


























