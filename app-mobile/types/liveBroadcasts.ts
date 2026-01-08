/**
 * PACK 260: Live Broadcasts Types
 * TypeScript definitions for Fan-Only + Pay-Per-View + Gifting
 */

import { Timestamp } from 'firebase/firestore';

// =====================================================================
// ENUMS & TYPES
// =====================================================================

export type LiveStreamMode = 'fan_only' | 'ppv' | 'open';
export type LiveStreamStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
export type TicketStatus = 'pending_payment' | 'active' | 'used' | 'expired';
export type GiftType = 'standard' | 'premium' | 'seasonal';
export type GiftStatus = 'pending' | 'completed';
export type SafetyWarningType = 'explicit_content' | 'inappropriate_behavior' | 'policy_violation';
export type ConversionType = 'fan_club' | 'ppv_ticket' | 'one_on_one' | 'event_ticket';
export type TransactionType = 'ppv_ticket' | 'gift' | 'milestone_reward';

// =====================================================================
// LIVE STREAM SESSION
// =====================================================================

export interface LiveStreamSession {
  streamId: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  mode: LiveStreamMode;
  status: LiveStreamStatus;
  title: string;
  description?: string;
  scheduledStartAt?: Timestamp;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
  plannedDurationMinutes: number;
  actualDurationMinutes?: number;
  ticketPrice?: number; // For PPV mode only
  viewerCount: number;
  peakViewerCount: number;
  totalGiftTokens: number;
  totalRevenue: number;
  warningCount: number;
  milestones: LiveStreamMilestones;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  endReason?: string; // Optional: 'creator_ended' | 'safety_violations' | 'error'
}

export interface LiveStreamMilestones {
  extra5MinUnlocked: boolean;
  groupQAUnlocked: boolean;
  chooseTopicUnlocked: boolean;
}

// =====================================================================
// PPV TICKETS
// =====================================================================

export interface LiveStreamTicket {
  ticketId: string;
  streamId: string;
  userId: string;
  creatorId: string;
  ticketPrice: number;
  status: TicketStatus;
  purchasedAt?: Timestamp;
  expiresAt?: Timestamp;
}

export const PPV_TICKET_PRICES = [100, 250, 500, 750, 1000] as const;
export type PPVTicketPrice = typeof PPV_TICKET_PRICES[number];

// =====================================================================
// GIFTS
// =====================================================================

export interface LiveStreamGift {
  giftId: string;
  streamId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  creatorId: string;
  giftType: GiftType;
  giftName: string;
  giftEmoji: string;
  tokenValue: number;
  status: GiftStatus;
  sentAt: Timestamp;
  processedAt?: Timestamp;
}

export interface GiftCatalogItem {
  id: string;
  name: string;
  emoji: string;
  tokens: number;
  type: GiftType;
  description?: string;
}

export const GIFT_CATALOG: Record<GiftType, GiftCatalogItem[]> = {
  standard: [
    { id: 'rose', name: 'Rose', emoji: '🌹', tokens: 10, type: 'standard' },
    { id: 'heart', name: 'Heart', emoji: '❤️', tokens: 20, type: 'standard' },
    { id: 'kiss', name: 'Kiss', emoji: '💋', tokens: 30, type: 'standard' },
    { id: 'fire', name: 'Fire', emoji: '🔥', tokens: 50, type: 'standard' },
    { id: 'diamond', name: 'Diamond', emoji: '💎', tokens: 100, type: 'standard' },
  ],
  premium: [
    { id: 'champagne', name: 'Champagne', emoji: '🍾', tokens: 200, type: 'premium' },
    { id: 'ring', name: 'Ring', emoji: '💍', tokens: 300, type: 'premium' },
    { id: 'crown', name: 'Crown', emoji: '👑', tokens: 500, type: 'premium' },
    { id: 'rocket', name: 'Rocket', emoji: '🚀', tokens: 750, type: 'premium' },
    { id: 'unicorn', name: 'Unicorn', emoji: '🦄', tokens: 1000, type: 'premium' },
  ],
  seasonal: [
    { id: 'seasonal_1', name: 'Holiday Special', emoji: '🎄', tokens: 250, type: 'seasonal' },
    { id: 'seasonal_2', name: 'Seasonal Gift', emoji: '🎃', tokens: 350, type: 'seasonal' },
  ],
};

// =====================================================================
// CHAT MESSAGES
// =====================================================================

export interface LiveStreamChatMessage {
  messageId: string;
  streamId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderBadge?: string; // Fan Club tier badge
  message: string;
  isCreator: boolean;
  isCoHost: boolean;
  createdAt: Timestamp;
}

// =====================================================================
// VIEWERS
// =====================================================================

export interface LiveStreamViewer {
  viewerId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  streamId: string;
  joinedAt: Timestamp;
  lastActivityAt: Timestamp;
  isCoHost: boolean;
}

// =====================================================================
// SPOTLIGHT LEADERBOARD
// =====================================================================

export interface LiveStreamSpotlight {
  streamId: string;
  topGifters: SpotlightGifter[];
  lastUpdated: Timestamp;
}

export interface SpotlightGifter {
  userId: string;
  userName: string;
  userAvatar?: string;
  totalTokens: number;
  rank: number;
}

// =====================================================================
// CO-HOSTS
// =====================================================================

export interface LiveStreamCoHost {
  cohostId: string;
  streamId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  invitedAt: Timestamp;
  acceptedAt?: Timestamp;
  status: 'invited' | 'accepted' | 'declined' | 'removed';
}

// =====================================================================
// MILESTONES
// =====================================================================

export interface LiveStreamMilestoneTracker {
  streamId: string;
  creatorId: string;
  currentGiftTotal: number;
  milestones: {
    extra5Min: MilestoneProgress;
    groupQA: MilestoneProgress;
    chooseTopic: MilestoneProgress;
  };
  createdAt: Timestamp;
}

export interface MilestoneProgress {
  threshold: number;
  unlocked: boolean;
  unlockedAt?: Timestamp;
}

// =====================================================================
// SAFETY & MODERATION
// =====================================================================

export interface LiveStreamSafetyWarning {
  warningId: string;
  streamId: string;
  creatorId: string;
  warningType: SafetyWarningType;
  description: string;
  warningNumber: number; // 1, 2, or 3
  reportedBy: string;
  createdAt: Timestamp;
}

// =====================================================================
// CONVERSIONS
// =====================================================================

export interface LiveStreamConversion {
  conversionId: string;
  streamId: string;
  userId: string;
  creatorId: string;
  conversionType: ConversionType;
  status: 'pending' | 'completed' | 'expired';
  metadata: {
    triggerType: string;
    [key: string]: any;
  };
  createdAt: Timestamp;
  completedAt?: Timestamp;
}

// =====================================================================
// TRANSACTIONS
// =====================================================================

export interface LiveStreamTransaction {
  transactionId: string;
  type: TransactionType;
  streamId: string;
  userId: string;
  creatorId: string;
  amount: number; // Total amount
  creatorAmount: number; // 65% to creator
  avaloAmount: number; // 35% to Avalo
  giftType?: GiftType;
  giftName?: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Timestamp;
}

// =====================================================================
// ANALYTICS
// =====================================================================

export interface LiveStreamAnalytics {
  creatorId: string;
  totalStreams: number;
  totalRevenue: number;
  totalViewers: number;
  totalDurationMinutes: number;
  averageViewers: number;
  averageRevenue: number;
  averageDuration: number;
  lastStreamAt?: Timestamp;
  createdAt: Timestamp;
}

export interface StreamPerformance {
  streamId: string;
  mode: LiveStreamMode;
  viewerCount: number;
  revenue: number;
  durationMinutes: number;
  giftCount: number;
  conversionCount: number;
  date: Timestamp;
}

// =====================================================================
// UI PROPS & STATE
// =====================================================================

export interface LiveStreamCardProps {
  stream: LiveStreamSession;
  onPress: () => void;
  showTicketPrice?: boolean;
}

export interface LiveStreamPlayerProps {
  streamId: string;
  mode: LiveStreamMode;
  hasAccess: boolean;
  onEnd: () => void;
}

export interface GiftSelectorProps {
  streamId: string;
  onGiftSent: (gift: GiftCatalogItem) => void;
  userBalance: number;
}

export interface SpotlightLeaderboardProps {
  streamId: string;
  topGifters: SpotlightGifter[];
}

export interface LiveChatProps {
  streamId: string;
  messages: LiveStreamChatMessage[];
  onSendMessage: (message: string) => void;
}

export interface MilestoneProgressProps {
  streamId: string;
  currentTotal: number;
  milestones: LiveStreamMilestoneTracker['milestones'];
}

// =====================================================================
// REQUEST & RESPONSE TYPES
// =====================================================================

export interface CreateStreamRequest {
  mode: LiveStreamMode;
  title: string;
  description?: string;
  scheduledStartAt?: string; // ISO date string
  plannedDurationMinutes?: number;
  ticketPrice?: PPVTicketPrice; // Required for PPV mode
}

export interface CreateStreamResponse {
  success: boolean;
  streamId: string;
  mode: LiveStreamMode;
  status: LiveStreamStatus;
}

export interface PurchaseTicketRequest {
  streamId: string;
}

export interface PurchaseTicketResponse {
  success: boolean;
  ticketPrice: number;
  message: string;
}

export interface SendGiftRequest {
  streamId: string;
  giftId: string;
}

export interface SendGiftResponse {
  success: boolean;
  giftName: string;
  tokenValue: number;
  message: string;
}

export interface TrackWatchTimeRequest {
  streamId: string;
  watchTimeMinutes: number;
}

export interface ReportSafetyRequest {
  streamId: string;
  warningType: SafetyWarningType;
  description: string;
}

export interface ReportSafetyResponse {
  success: boolean;
  warningCount: number;
  streamEnded: boolean;
  message: string;
}

export interface GetAnalyticsResponse {
  totalStreams: number;
  totalRevenue: number;
  totalViewers: number;
  totalDurationMinutes: number;
  averageViewers: number;
  averageRevenue: number;
  averageDuration: number;
  lastStreamAt?: Timestamp;
}

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

/**
 * Get display name for stream mode
 */
export function getModeName(mode: LiveStreamMode): string {
  const names: Record<LiveStreamMode, string> = {
    fan_only: 'Fan-Only Live',
    ppv: 'Pay-Per-View',
    open: 'Open Live',
  };
  return names[mode];
}

/**
 * Get mode description
 */
export function getModeDescription(mode: LiveStreamMode): string {
  const descriptions: Record<LiveStreamMode, string> = {
    fan_only: 'Exclusive for Gold+ Fan Club members',
    ppv: 'Buy a ticket to watch',
    open: 'Free entry + optional tipping',
  };
  return descriptions[mode];
}

/**
 * Get mode icon
 */
export function getModeIcon(mode: LiveStreamMode): string {
  const icons: Record<LiveStreamMode, string> = {
    fan_only: '🔒',
    ppv: '🎟️',
    open: '🌐',
  };
  return icons[mode];
}

/**
 * Check if user can access stream
 */
export function canAccessStream(
  mode: LiveStreamMode,
  hasFanClubAccess: boolean,
  hasTicket: boolean
): boolean {
  switch (mode) {
    case 'fan_only':
      return hasFanClubAccess;
    case 'ppv':
      return hasTicket;
    case 'open':
      return true;
    default:
      return false;
  }
}

/**
 * Format stream duration
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Format viewer count
 */
export function formatViewerCount(count: number): string {
  if (count < 1000) {
    return count.toString();
  }
  if (count < 1000000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return `${(count / 1000000).toFixed(1)}M`;
}

/**
 * Get all gifts from catalog
 */
export function getAllGifts(): GiftCatalogItem[] {
  return [...GIFT_CATALOG.standard, ...GIFT_CATALOG.premium, ...GIFT_CATALOG.seasonal];
}

/**
 * Get gift by ID
 */
export function getGiftById(giftId: string): GiftCatalogItem | undefined {
  return getAllGifts().find((g) => g.id === giftId);
}

/**
 * Get gifts by type
 */
export function getGiftsByType(type: GiftType): GiftCatalogItem[] {
  return GIFT_CATALOG[type];
}

/**
 * Calculate revenue split (65/35)
 */
export function calculateRevenueSplit(totalAmount: number): {
  creatorAmount: number;
  avaloAmount: number;
} {
  const creatorAmount = Math.floor(totalAmount * 0.65);
  const avaloAmount = totalAmount - creatorAmount;
  return { creatorAmount, avaloAmount };
}

/**
 * Check if stream is live
 */
export function isStreamLive(stream: LiveStreamSession): boolean {
  return stream.status === 'live';
}

/**
 * Check if stream is scheduled
 */
export function isStreamScheduled(stream: LiveStreamSession): boolean {
  return stream.status === 'scheduled';
}

/**
 * Check if stream has ended
 */
export function isStreamEnded(stream: LiveStreamSession): boolean {
  return stream.status === 'ended' || stream.status === 'cancelled';
}

/**
 * Get milestone progress percentage
 */
export function getMilestoneProgress(current: number, threshold: number): number {
  return Math.min(Math.round((current / threshold) * 100), 100);
}

/**
 * Check if milestone is unlocked
 */
export function isMilestoneUnlocked(current: number, threshold: number): boolean {
  return current >= threshold;
}

/**
 * Get status color
 */
export function getStatusColor(status: LiveStreamStatus): string {
  const colors: Record<LiveStreamStatus, string> = {
    scheduled: '#FFA500',
    live: '#FF0000',
    ended: '#808080',
    cancelled: '#808080',
  };
  return colors[status];
}

/**
 * Get status label
 */
export function getStatusLabel(status: LiveStreamStatus): string {
  const labels: Record<LiveStreamStatus, string> = {
    scheduled: 'Scheduled',
    live: 'LIVE',
    ended: 'Ended',
    cancelled: 'Cancelled',
  };
  return labels[status];
}

/**
 * Format currency (tokens)
 */
export function formatTokens(amount: number): string {
  return `${amount.toLocaleString()} tokens`;
}

/**
 * Validate ticket price
 */
export function isValidTicketPrice(price: number): boolean {
  return PPV_TICKET_PRICES.includes(price as PPVTicketPrice);
}

/**
 * Get conversion type label
 */
export function getConversionTypeLabel(type: ConversionType): string {
  const labels: Record<ConversionType, string> = {
    fan_club: 'Join Fan Club',
    ppv_ticket: 'Buy More Streams',
    one_on_one: 'Book 1-on-1 Call',
    event_ticket: 'Get Event Tickets',
  };
  return labels[type];
}

/**
 * Get conversion type description
 */
export function getConversionTypeDescription(type: ConversionType): string {
  const descriptions: Record<ConversionType, string> = {
    fan_club: 'Unlock exclusive content and benefits',
    ppv_ticket: 'Get access to more premium streams',
    one_on_one: 'Personal video call with creator',
    event_ticket: 'Meet creator at exclusive events',
  };
  return descriptions[type];
}

/**
 * Time remaining until scheduled start
 */
export function getTimeUntilStart(scheduledStartAt: Timestamp): string {
  const now = Date.now();
  const start = scheduledStartAt.toMillis();
  const diff = start - now;
  
  if (diff < 0) {
    return 'Started';
  }
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m`;
}

/**
 * Check if user can send gift
 */
export function canSendGift(userBalance: number, giftTokens: number): boolean {
  return userBalance >= giftTokens;
}

/**
 * Get warning severity
 */
export function getWarningSeverity(warningCount: number): 'low' | 'medium' | 'high' {
  if (warningCount === 1) return 'low';
  if (warningCount === 2) return 'medium';
  return 'high';
}

/**
 * Get warning color
 */
export function getWarningColor(warningCount: number): string {
  const severity = getWarningSeverity(warningCount);
  const colors = {
    low: '#FFA500',
    medium: '#FF6347',
    high: '#FF0000',
  };
  return colors[severity];
}