/**
 * Phase 15: Drops Marketplace Types
 * Type definitions for drop products, purchases, and related entities
 */

export type DropType = 'STANDARD_DROP' | 'FLASH_DROP' | 'LOOTBOX_DROP' | 'COOP_DROP';

export type DropVisibility = 'public' | 'followers_only' | 'test_only';

export type ContentRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface ContentItem {
  contentId: string;
  type: 'photo' | 'video' | 'audio' | 'document';
  url?: string;
  thumbnailUrl?: string;
  title: string;
  description?: string;
  rarity?: ContentRarity; // For lootbox items
  weight?: number; // For lootbox probability (higher = more likely)
}

export interface LootboxPool {
  items: ContentItem[];
  totalWeight: number;
}

export interface CoopCreatorShare {
  creatorId: string;
  sharePercentage: number; // 0-100, must sum to 100 across all creators
}

export interface Drop {
  dropId: string;
  ownerCreatorIds: string[]; // Single creator or multiple for COOP
  type: DropType;
  title: string;
  description: string;
  coverImageUrl: string;
  tags: string[];
  priceTokens: number;
  maxQuantity: number | null; // null = unlimited
  soldCount: number;
  startAt: Date | null; // For FLASH drops
  endAt: Date | null; // For FLASH drops
  isActive: boolean;
  is18Plus: boolean;
  visibility: DropVisibility;
  
  // Content configuration
  contentItems?: ContentItem[]; // For STANDARD/FLASH drops (transparent)
  lootboxPool?: LootboxPool; // For LOOTBOX drops
  coopShares?: CoopCreatorShare[]; // For COOP drops
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  
  // Stats (for creator dashboard)
  totalRevenue?: number;
  uniqueBuyers?: number;
}

export interface DropPurchase {
  purchaseId: string;
  dropId: string;
  userId: string;
  creatorIds: string[]; // All creators involved
  tokensSpent: number;
  createdAt: Date;
  
  // Resolved content (especially for lootbox)
  resolvedContentItems: ContentItem[];
  
  // Revenue split details
  revenueSplit: {
    [creatorId: string]: number; // tokens allocated to each creator
    avalo: number; // platform share
  };
}

export interface UserDropOwnership {
  userId: string;
  dropId: string;
  purchaseId: string;
  purchasedAt: Date;
}

export interface DropStats {
  dropId: string;
  dailyRevenue: number;
  weeklyRevenue: number;
  monthlyRevenue: number;
  totalRevenue: number;
  dailyBuyers: number;
  weeklyBuyers: number;
  monthlyBuyers: number;
  totalBuyers: number;
  lastUpdated: Date;
}

// Input types for functions

export interface CreateDropInput {
  type: DropType;
  title: string;
  description: string;
  coverImageUrl: string;
  tags: string[];
  priceTokens: number;
  maxQuantity?: number | null;
  startAt?: Date | null;
  endAt?: Date | null;
  is18Plus: boolean;
  visibility: DropVisibility;
  
  // Content
  contentItems?: ContentItem[];
  lootboxPool?: LootboxPool;
  coopCreatorIds?: string[]; // For COOP drops
  coopShares?: CoopCreatorShare[];
}

export interface UpdateDropInput {
  title?: string;
  description?: string;
  coverImageUrl?: string;
  tags?: string[];
  priceTokens?: number; // Only if drop hasn't started
  startAt?: Date | null;
  endAt?: Date | null;
  isActive?: boolean;
}

export interface ListDropsFilters {
  creatorId?: string;
  type?: DropType;
  tags?: string[];
  is18Plus?: boolean;
  activeOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
  offset?: number;
}

export interface DropPublicInfo {
  dropId: string;
  ownerCreatorIds: string[];
  creatorNames: string[];
  creatorAvatars: string[];
  type: DropType;
  title: string;
  description: string;
  coverImageUrl: string;
  tags: string[];
  priceTokens: number;
  soldCount: number;
  stockRemaining: number | null; // null = unlimited
  timeRemaining: number | null; // milliseconds, for FLASH drops
  isAvailable: boolean;
  is18Plus: boolean;
  
  // Preview of content
  contentPreview?: ContentItem[]; // For transparent drops
  lootboxCategories?: string[]; // For lootbox, show categories/rarities
}