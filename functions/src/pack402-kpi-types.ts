/**
 * PACK 402 — Global KPI & Monitoring Engine
 * 
 * Replaces previously mis-numbered PACK 353.
 * Canonical KPI engine for Avalo platform.
 * 
 * Dependencies:
 * - PACK 255/277: Wallet & Revenue
 * - PACK 267-268/296/302/401: Safety & Risk
 * - PACK 301/301A/301B/400: Retention
 * - PACK 300/300A/300B: Support
 * - PACK 293: Notifications
 * - PACK 280: Membership
 * - PACK 351: Technical Launch
 */

export type KpiInterval = 'day' | 'hour';

export interface KpiKey {
  date: string;      // YYYY-MM-DD
  hour?: number;     // 0–23 when interval = 'hour'
}

/**
 * Growth & Acquisition KPIs
 * Tracks user growth, verification, onboarding stages, retention segments
 */
export interface GrowthKpi {
  key: KpiKey;
  interval: KpiInterval;

  newUsers: number;
  verifiedUsers: number;
  onboardingStageCounts: Record<string, number>;
  retentionSegmentCounts: Record<string, number>;
}

/**
 * Engagement KPIs
 * Tracks swipes, matches, chats, voice/video, calendar, events, AI interactions
 */
export interface EngagementKpi {
  key: KpiKey;
  interval: KpiInterval;

  totalSwipes: number;
  uniqueSwipers: number;
  totalMatches: number;

  paidChatsStarted: number;
  paidChatWordsBilled: number;
  voiceMinutes: number;
  videoMinutes: number;

  calendarBookings: number;
  eventsCreated: number;
  eventTickets: number;

  aiChats: number;
  aiVoiceMinutes: number;
}

/**
 * Revenue & Tokenomics KPIs
 * Tracks token purchases, spending, creator earnings, payouts, paying users
 */
export interface RevenueKpi {
  key: KpiKey;
  interval: KpiInterval;

  tokenPurchasesCount: number;
  tokenPurchasedTotal: number;

  tokensSpentTotal: number;
  creatorEarningsTokens: number;
  avaloRevenueTokens: number;

  payoutsRequestedTokens: number;
  payoutsApprovedTokens: number;

  payingUsersCount: number;
}

/**
 * Safety & Moderation KPIs
 * Tracks abuse reports, safety tickets, account actions, fraud risk distribution
 */
export interface SafetyKpi {
  key: KpiKey;
  interval: KpiInterval;

  abuseReports: number;
  safetyTickets: number;
  criticalSafetyTickets: number;

  accountsFrozen: number;
  accountsBanned: number;

  fraudRiskDistribution: Record<string, number>; // NORMAL/WATCHLIST/HIGH_RISK/CRITICAL
}

/**
 * Support & Customer Service KPIs
 * Tracks tickets, response times, resolution times
 */
export interface SupportKpi {
  key: KpiKey;
  interval: KpiInterval;

  ticketsCreated: number;
  ticketsResolved: number;
  avgFirstResponseMinutes: number | null;
  avgResolveMinutes: number | null;
}

/**
 * Union type for all KPI types
 */
export type AnyKpi = GrowthKpi | EngagementKpi | RevenueKpi | SafetyKpi | SupportKpi;

/**
 * KPI type identifier
 */
export type KpiType = 'growth' | 'engagement' | 'revenue' | 'safety' | 'support';

/**
 * Helper to build document ID from key
 */
export function buildKpiDocId(key: KpiKey, interval: KpiInterval): string {
  if (interval === 'hour' && key.hour !== undefined) {
    const hourStr = key.hour.toString().padStart(2, '0');
    return `hour_${key.date}_${hourStr}`;
  }
  return `day_${key.date}`;
}

/**
 * Helper to parse document ID back to key
 */
export function parseKpiDocId(docId: string): { key: KpiKey; interval: KpiInterval } | null {
  if (docId.startsWith('hour_')) {
    const parts = docId.replace('hour_', '').split('_');
    if (parts.length === 2) {
      const [date, hourStr] = parts;
      return {
        key: { date, hour: parseInt(hourStr, 10) },
        interval: 'hour',
      };
    }
  } else if (docId.startsWith('day_')) {
    const date = docId.replace('day_', '');
    return {
      key: { date },
      interval: 'day',
    };
  }
  return null;
}

/**
 * Collections for each KPI type
 */
export const KPI_COLLECTIONS = {
  growth: 'kpiGrowth',
  engagement: 'kpiEngagement',
  revenue: 'kpiRevenue',
  safety: 'kpiSafety',
  support: 'kpiSupport',
} as const;
