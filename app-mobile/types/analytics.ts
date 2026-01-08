/**
 * PACK 82 — Creator Performance Analytics & Insights Dashboard
 * TypeScript types for read-only analytics data
 */

import { Timestamp } from 'firebase/firestore';
import { EarningSourceType } from './earnings';

// ============================================================================
// FIRESTORE MODELS
// ============================================================================

/**
 * Daily analytics snapshot (Firestore: creator_analytics_daily)
 * Document ID format: ${creatorId}_${YYYYMMDD}
 */
export interface CreatorAnalyticsDaily {
  id: string;                      // ${creatorId}_${YYYYMMDD}
  creatorId: string;
  date: string;                    // YYYY-MM-DD
  totalNetTokens: number;          // Net earnings (65% share) for that day
  giftNetTokens: number;           // Sum from gifts
  storyNetTokens: number;          // Sum from premium stories
  paidMediaNetTokens: number;      // Sum from paid media
  paidCallNetTokens: number;       // Sum from paid calls (future)
  aiCompanionNetTokens: number;    // Sum from AI companions (future)
  otherNetTokens: number;          // Sum from other sources
  totalPayers: number;             // Number of unique paying users that day
  totalPaidEvents: number;         // Count of monetized events that day
  updatedAt: Timestamp | Date;
}

/**
 * Top supporter in last 30 days
 */
export interface TopSupporter {
  userId: string;
  maskedName: string;              // e.g., @jo***23
  totalTokens: number;             // Total tokens they spent toward this creator
  paidActions: number;             // Number of paid actions (unlocks/gifts/etc.)
}

/**
 * Top earning content item
 */
export interface TopContentItem {
  id: string;                      // Story/media/gift ID
  type: EarningSourceType;
  title?: string;                  // Display name
  thumbnailUrl?: string;           // Preview image if available
  totalEarnings: number;           // Net earnings from this item
  unlockCount?: number;            // Number of unlocks/purchases
}

/**
 * Aggregated analytics snapshot (Firestore: creator_analytics_snapshot)
 */
export interface CreatorAnalyticsSnapshot {
  creatorId: string;               // Primary key
  
  // Last 30 days aggregate data
  last30_totalNet: number;         // Total net earnings last 30 days
  last30_totalPayers: number;      // Unique payers last 30 days
  last30_totalEvents: number;      // Monetized events last 30 days
  
  // Breakdown by source (last 30 days)
  last30_bySource: {
    GIFT: number;
    PREMIUM_STORY: number;
    PAID_MEDIA: number;
    PAID_CALL?: number;
    AI_COMPANION?: number;
    OTHER?: number;
  };
  
  // Top supporters (last 30 days)
  last30_topSupporters: TopSupporter[];
  
  // Top earning content (last 30 days)
  last30_topStories: TopContentItem[];      // Top 3 premium stories
  last30_topPaidMedia: TopContentItem[];    // Top 3 paid media entries
  last30_topGifts: TopContentItem[];        // Top 3 gifts by quantity
  
  updatedAt: Timestamp | Date;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Overview data for KPI cards
 */
export interface CreatorAnalyticsOverview {
  // Last 30 days summary
  totalEarnings: number;           // Net tokens earned
  payingUsers: number;             // Unique payers
  paidInteractions: number;        // Total monetized events
  topEarningSource: EarningSourceType | null; // Highest earning source
  
  // Breakdown by source
  earningsBySource: {
    GIFT: number;
    PREMIUM_STORY: number;
    PAID_MEDIA: number;
    PAID_CALL?: number;
    AI_COMPANION?: number;
    OTHER?: number;
  };
  
  // Top supporters
  topSupporters: TopSupporter[];
  
  // Top content
  topStories: TopContentItem[];
  topPaidMedia: TopContentItem[];
  topGifts: TopContentItem[];
  
  // Metadata
  periodStart: Date;
  periodEnd: Date;
  lastUpdated: Date;
}

/**
 * Single data point in timeseries
 */
export interface TimeseriesDataPoint {
  date: string;                    // YYYY-MM-DD
  totalNetTokens: number;
  giftNetTokens: number;
  storyNetTokens: number;
  paidMediaNetTokens: number;
  paidCallNetTokens: number;
  aiCompanionNetTokens: number;
  otherNetTokens: number;
  totalPaidEvents: number;
}

/**
 * Timeseries data for charts
 */
export interface CreatorAnalyticsTimeseries {
  dataPoints: TimeseriesDataPoint[];
  periodStart: Date;
  periodEnd: Date;
  totalDays: number;
  summary: {
    totalEarnings: number;
    averageDaily: number;
    peakDay: {
      date: string;
      earnings: number;
    } | null;
  };
}

// ============================================================================
// UI DISPLAY TYPES
// ============================================================================

/**
 * KPI card data
 */
export interface KpiCardData {
  label: string;
  value: string | number;
  icon: string;
  color?: string;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    percentage: number;
  };
}

/**
 * Chart data for pie/bar charts
 */
export interface ChartDataPoint {
  label: string;
  value: number;
  color: string;
  percentage: number;
  icon?: string;
}

/**
 * Line chart data point
 */
export interface LineChartDataPoint {
  x: string | number;              // Date or timestamp
  y: number;                       // Value
  label?: string;
}

// ============================================================================
// HOOK RETURN TYPES
// ============================================================================

export interface UseCreatorAnalyticsReturn {
  overview: CreatorAnalyticsOverview | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
}

export interface UseCreatorAnalyticsTimeseriesReturn {
  timeseries: CreatorAnalyticsTimeseries | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

// ============================================================================
// HELPER CONSTANTS
// ============================================================================

/**
 * Analytics period options
 */
export const ANALYTICS_PERIODS = {
  LAST_7_DAYS: 7,
  LAST_30_DAYS: 30,
  LAST_90_DAYS: 90,
} as const;

/**
 * Chart color palette for sources
 */
export const ANALYTICS_COLORS = {
  GIFT: '#EC4899',              // Pink
  PREMIUM_STORY: '#8B5CF6',     // Purple
  PAID_MEDIA: '#3B82F6',        // Blue
  PAID_CALL: '#10B981',         // Green
  AI_COMPANION: '#F59E0B',      // Amber
  OTHER: '#6B7280',             // Gray
} as const;

/**
 * Default number of top items to show
 */
export const TOP_ITEMS_LIMIT = {
  SUPPORTERS: 10,
  STORIES: 3,
  MEDIA: 3,
  GIFTS: 3,
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format date for daily analytics ID
 */
export function formatDailyAnalyticsId(creatorId: string, date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${creatorId}_${year}${month}${day}`;
}

/**
 * Format date for display (YYYY-MM-DD)
 */
export function formatDateYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse date from YYYY-MM-DD format
 */
export function parseDateYMD(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get date range for last N days
 */
export function getDateRange(days: number): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  
  return { start, end };
}

/**
 * Calculate percentage of total
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

/**
 * Find top earning source
 */
export function findTopEarningSource(
  bySource: Record<string, number>
): EarningSourceType | null {
  let maxValue = 0;
  let topSource: EarningSourceType | null = null;
  
  for (const [source, value] of Object.entries(bySource)) {
    if (value > maxValue) {
      maxValue = value;
      topSource = source as EarningSourceType;
    }
  }
  
  return topSource;
}

/**
 * Convert analytics data to chart format
 */
export function convertToChartData(
  bySource: Record<string, number>
): ChartDataPoint[] {
  const total = Object.values(bySource).reduce((sum, val) => sum + val, 0);
  
  return Object.entries(bySource)
    .filter(([_, value]) => value > 0)
    .map(([source, value]) => ({
      label: source,
      value,
      color: ANALYTICS_COLORS[source as keyof typeof ANALYTICS_COLORS] || ANALYTICS_COLORS.OTHER,
      percentage: calculatePercentage(value, total),
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Mask username for privacy
 * Example: "john_doe123" -> "@jo***23"
 */
export function maskUsername(username: string): string {
  if (!username) return '@anonymous';
  
  // Remove @ if present
  const clean = username.replace('@', '');
  
  if (clean.length <= 4) {
    return `@${clean[0]}***`;
  }
  
  const firstTwo = clean.substring(0, 2);
  const lastTwo = clean.substring(clean.length - 2);
  
  return `@${firstTwo}***${lastTwo}`;
}

/**
 * Calculate trend direction
 */
export function calculateTrend(
  current: number,
  previous: number
): { direction: 'up' | 'down' | 'neutral'; percentage: number } {
  if (previous === 0) {
    return { direction: 'neutral', percentage: 0 };
  }
  
  const change = current - previous;
  const percentage = Math.abs(Math.round((change / previous) * 100));
  
  if (change > 0) {
    return { direction: 'up', percentage };
  } else if (change < 0) {
    return { direction: 'down', percentage };
  } else {
    return { direction: 'neutral', percentage: 0 };
  }
}

/**
 * Format large numbers (e.g., 1234 -> "1.2K")
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Get friendly source label
 */
export function getSourceLabel(source: EarningSourceType): string {
  const labels: Record<EarningSourceType, string> = {
    GIFT: 'Gifts',
    PREMIUM_STORY: 'Premium Stories',
    PAID_MEDIA: 'Paid Media',
    PAID_CALL: 'Paid Calls',
    AI_COMPANION: 'AI Companions',
    OTHER: 'Other',
  };
  return labels[source] || source;
}

/**
 * Get source icon
 */
export function getSourceIcon(source: EarningSourceType): string {
  const icons: Record<EarningSourceType, string> = {
    GIFT: '🎁',
    PREMIUM_STORY: '📖',
    PAID_MEDIA: '🔒',
    PAID_CALL: '📞',
    AI_COMPANION: '🤖',
    OTHER: '💰',
  };
  return icons[source] || '💰';
}