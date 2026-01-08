/**
 * PACK 81 — Creator Earnings Types
 * TypeScript types for earnings wallet and ledger
 */

import { Timestamp } from 'firebase/firestore';

export type EarningSourceType = 
  | 'GIFT' 
  | 'PREMIUM_STORY' 
  | 'PAID_MEDIA'
  | 'PAID_CALL'
  | 'AI_COMPANION'
  | 'OTHER';

export interface EarningsLedgerEntry {
  id: string;
  creatorId: string;
  sourceType: EarningSourceType;
  sourceId: string;
  fromUserId: string;
  grossTokens: number;
  netTokensCreator: number;
  commissionAvalo: number;
  createdAt: Timestamp | Date;
  metadata?: {
    chatId?: string;
    storyId?: string;
    giftId?: string;
    mediaId?: string;
    giftName?: string;
    [key: string]: any;
  };
}

export interface CreatorBalance {
  userId: string;
  availableTokens: number;
  lifetimeEarned: number;
  updatedAt: Timestamp | Date;
}

export interface EarningsBreakdown {
  gifts: number;
  premiumStories: number;
  paidMedia: number;
  paidCalls?: number;
  aiCompanion?: number;
  other?: number;
  total: number;
}

export interface WalletSummary {
  availableTokens: number;
  lifetimeEarned: number;
  breakdown: {
    last30Days: EarningsBreakdown;
    allTime: EarningsBreakdown;
  };
}

export interface LedgerFilter {
  fromDate?: Date;
  toDate?: Date;
  sourceType?: EarningSourceType;
}

export interface LedgerPage {
  entries: EarningsLedgerEntry[];
  nextPageToken?: string;
  hasMore: boolean;
  total: number;
}

export interface CSVExportResult {
  downloadUrl: string;
  expiresAt: Date;
}

// UI Display helpers
export const SOURCE_TYPE_LABELS: Record<EarningSourceType, string> = {
  GIFT: 'Gift',
  PREMIUM_STORY: 'Premium Story',
  PAID_MEDIA: 'Paid Media',
  PAID_CALL: 'Paid Call',
  AI_COMPANION: 'AI Companion',
  OTHER: 'Other',
};

export const SOURCE_TYPE_ICONS: Record<EarningSourceType, string> = {
  GIFT: '🎁',
  PREMIUM_STORY: '📖',
  PAID_MEDIA: '🔒',
  PAID_CALL: '📞',
  AI_COMPANION: '🤖',
  OTHER: '💰',
};

export const SOURCE_TYPE_COLORS: Record<EarningSourceType, string> = {
  GIFT: '#EC4899',      // Pink
  PREMIUM_STORY: '#8B5CF6', // Purple
  PAID_MEDIA: '#3B82F6',    // Blue
  PAID_CALL: '#10B981',     // Green
  AI_COMPANION: '#F59E0B',  // Amber
  OTHER: '#6B7280',         // Gray
};