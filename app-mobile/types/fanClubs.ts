/**
 * PACK 259: Fan Clubs / Support Circles
 * TypeScript types for mobile app
 */

export type FanClubTier = 'silver' | 'gold' | 'diamond' | 'royal_elite';

export type MembershipStatus = 'pending_payment' | 'active' | 'cancelled' | 'expired';

export type BillingType = 'monthly' | 'one_time';

export interface FanClubTierConfig {
  slug: FanClubTier;
  name: string;
  priceTokens: number;
  features: string[];
}

export const FAN_CLUB_TIERS: Record<string, FanClubTierConfig> = {
  SILVER: {
    slug: 'silver',
    name: 'Silver',
    priceTokens: 250,
    features: [
      'Exclusive stories & media',
      'Basic access to exclusive content',
    ],
  },
  GOLD: {
    slug: 'gold',
    name: 'Gold',
    priceTokens: 750,
    features: [
      'All Silver benefits',
      'Group chat access',
      'Fan-only live streams',
      'Priority placement in inbox',
      'Member badge in DMs',
    ],
  },
  DIAMOND: {
    slug: 'diamond',
    name: 'Diamond',
    priceTokens: 1500,
    features: [
      'All Gold benefits',
      'Member events access',
      '1-on-1 boosted visibility',
      'Priority replies',
    ],
  },
  ROYAL_ELITE: {
    slug: 'royal_elite',
    name: 'Royal Elite',
    priceTokens: 2500,
    features: [
      'All Diamond benefits',
      'VIP live sessions',
      'Full access to all content',
      'Highest priority support',
    ],
  },
};

export interface FanClubSettings {
  creatorId: string;
  enabled: boolean;
  availableTiers: FanClubTier[];
  welcomeMessage?: string;
  groupChatEnabled: boolean;
  liveStreamsEnabled: boolean;
  eventsEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface FanClubMembership {
  membershipId: string;
  creatorId: string;
  memberId: string;
  tier: FanClubTier;
  status: MembershipStatus;
  billingType: BillingType;
  priceTokens: number;
  joinedAt: number;
  nextBillingDate?: number;
  lastBillingDate?: number;
  cancelledAt?: number;
  expiresAt?: number;
  autoRenew: boolean;
  totalPaid: number;
  billingHistory: string[];
  createdAt: number;
  updatedAt: number;
}

export interface FanClubContent {
  contentId: string;
  creatorId: string;
  contentType: 'story' | 'photo' | 'video' | 'message' | 'post';
  minimumTier: FanClubTier;
  title?: string;
  description?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  text?: string;
  published: boolean;
  viewCount: number;
  likeCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface FanClubGroupChat {
  chatId: string;
  creatorId: string;
  name: string;
  memberCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface FanClubGroupChatMessage {
  messageId: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderTier?: FanClubTier;
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  replyTo?: string;
  createdAt: number;
}

export interface FanClubLiveStream {
  streamId: string;
  creatorId: string;
  title: string;
  description?: string;
  status: 'scheduled' | 'live' | 'ended';
  scheduledAt?: number;
  startedAt?: number;
  endedAt?: number;
  viewerCount: number;
  minimumTier: FanClubTier;
  recordingUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface FanClubMemberEvent {
  eventId: string;
  creatorId: string;
  title: string;
  description: string;
  eventType: 'online' | 'offline' | 'hybrid';
  minimumTier: FanClubTier;
  eventDate: number;
  location?: string;
  maxAttendees?: number;
  currentAttendees: number;
  published: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface FanClubMemberBadge {
  creatorId: string;
  tier: FanClubTier;
  joinedAt: number;
}

export interface FanClubTransaction {
  transactionId: string;
  membershipId: string;
  creatorId: string;
  memberId: string;
  type: 'subscription' | 'renewal' | 'cancellation_refund';
  amount: number;
  avaloFee: number;
  creatorEarnings: number;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  billingCycle?: string;
  createdAt: number;
  processedAt?: number;
}

export interface FanClubNotification {
  notificationId: string;
  recipientId: string;
  type: 'new_member' | 'member_left' | 'exclusive_drop' | 'announcement' | 'renewal_failed' | 'live_stream_starting' | 'event_reminder';
  creatorId?: string;
  memberId?: string;
  contentId?: string;
  tier?: FanClubTier;
  message?: string;
  read: boolean;
  createdAt: number;
  readAt?: number;
}

export interface FanClubAnalytics {
  totalMembers: number;
  activeMembers: number;
  membersByTier: {
    silver: number;
    gold: number;
    diamond: number;
    royal_elite: number;
  };
  monthlyRecurringRevenue: number;
  lifetimeRevenue: number;
  averageLifetimeValue: number;
  cancellationRate: number;
}

export interface TopSupporter {
  memberId: string;
  tier: FanClubTier;
  totalPaid: number;
  joinedAt: number;
}

export interface FanClubSafetyReport {
  reportId: string;
  reporterId: string;
  reportedUserId: string;
  reportedIn: 'fan_club' | 'group_chat' | 'exclusive_content' | 'live_stream';
  reason: string;
  description: string;
  evidenceUrls?: string[];
  status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
  createdAt: number;
  resolvedAt?: number;
}

// Helper functions
export function getTierName(tier: FanClubTier): string {
  const tierConfig = Object.values(FAN_CLUB_TIERS).find(t => t.slug === tier);
  return tierConfig?.name || tier;
}

export function getTierPrice(tier: FanClubTier): number {
  const tierConfig = Object.values(FAN_CLUB_TIERS).find(t => t.slug === tier);
  return tierConfig?.priceTokens || 0;
}

export function getTierFeatures(tier: FanClubTier): string[] {
  const tierConfig = Object.values(FAN_CLUB_TIERS).find(t => t.slug === tier);
  return tierConfig?.features || [];
}

export function compareTiers(tier1: FanClubTier, tier2: FanClubTier): number {
  const tierOrder: FanClubTier[] = ['silver', 'gold', 'diamond', 'royal_elite'];
  return tierOrder.indexOf(tier1) - tierOrder.indexOf(tier2);
}

export function hasTierAccess(userTier: FanClubTier, requiredTier: FanClubTier): boolean {
  return compareTiers(userTier, requiredTier) >= 0;
}

export function getTierColor(tier: FanClubTier): string {
  switch (tier) {
    case 'silver':
      return '#C0C0C0';
    case 'gold':
      return '#FFD700';
    case 'diamond':
      return '#B9F2FF';
    case 'royal_elite':
      return '#9B59B6';
    default:
      return '#999999';
  }
}

export function getTierBadgeEmoji(tier: FanClubTier): string {
  switch (tier) {
    case 'silver':
      return '🥈';
    case 'gold':
      return '🥇';
    case 'diamond':
      return '💎';
    case 'royal_elite':
      return '👑';
    default:
      return '⭐';
  }
}