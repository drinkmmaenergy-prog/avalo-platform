import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

// KPI types - copied from shared/types/kpi.ts to avoid rootDir issues

export interface KPIMetric {
  name: string;
  value: number;
  target: number;
  unit: string;
  period: string;
}

export interface KPIReport {
  metrics: KPIMetric[];
  period: string;
  generatedAt: any;
}

export interface KPIEvent {
  eventType: string;
  value: number;
  userId?: string;
  timestamp: any;
}

export type KPIPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';

// Additional types needed by pack352-daily-aggregator
export interface KpiDailyMetricsDocument {
  date: string;
  growth: DailyGrowthMetrics;
  monetization: DailyMonetizationMetrics;
  safety: DailySafetyMetrics;
  computedAt: any;
  version?: number;
  [key: string]: any;
}

export interface DailyGrowthMetrics {
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

export interface DailyMonetizationMetrics {
  totalRevenue?: number;
  revenueByVertical?: Record<string, number>;
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

export interface DailySafetyMetrics {
  reportsReceived?: number;
  reportsResolved?: number;
  fraudCases?: number;
  fraudBySeverity?: Record<string, number>;
  banCount?: number;
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
  calls: 0,
  calendar: 0,
  events: 0,
  tips: 0,
  media: 0,
  ai: 0,
};

export const DEFAULT_FRAUD_BY_SEVERITY: Record<string, number> = {
  low: 0,
  medium: 0,
  high: 0,
  critical: 0,
};

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
  
  // Legacy aliases
  SIGNUP = 'USER_SIGNUP',
  TOKEN_PURCHASE = 'TOKEN_PURCHASED',
  PANIC_TRIGGERED = 'REPORT_SUBMITTED',
  SUPPORT_TICKET_CREATED = 'REPORT_SUBMITTED',
  SUPPORT_TICKET_RESOLVED = 'REPORT_RESOLVED',
  VOICE_CALL_STARTED = 'CALL_STARTED',
  VIDEO_CALL_STARTED = 'CALL_STARTED',
}

























