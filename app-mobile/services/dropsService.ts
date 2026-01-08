/**
 * Drops Service
 * Handles all drops-related operations for mobile app
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

// Types
export interface ContentItem {
  contentId: string;
  type: 'photo' | 'video' | 'audio' | 'document';
  url?: string;
  thumbnailUrl?: string;
  title: string;
  description?: string;
  rarity?: 'common' | 'rare' | 'epic' | 'legendary';
  weight?: number;
}

export interface LootboxPool {
  items: ContentItem[];
  totalWeight: number;
}

export interface CoopCreatorShare {
  creatorId: string;
  sharePercentage: number;
}

export interface Drop {
  dropId: string;
  ownerCreatorIds: string[];
  type: 'STANDARD_DROP' | 'FLASH_DROP' | 'LOOTBOX_DROP' | 'COOP_DROP';
  title: string;
  description: string;
  coverImageUrl: string;
  tags: string[];
  priceTokens: number;
  soldCount: number;
  maxQuantity: number | null;
  startAt: Date | null;
  endAt: Date | null;
  isActive: boolean;
  is18Plus: boolean;
  visibility: 'public' | 'followers_only' | 'test_only';
  contentItems?: ContentItem[];
  lootboxPool?: LootboxPool;
  coopShares?: CoopCreatorShare[];
  createdAt: Date;
  updatedAt: Date;
  totalRevenue?: number;
  uniqueBuyers?: number;
}

export interface DropPublicInfo {
  dropId: string;
  ownerCreatorIds: string[];
  creatorNames: string[];
  creatorAvatars: string[];
  type: 'STANDARD_DROP' | 'FLASH_DROP' | 'LOOTBOX_DROP' | 'COOP_DROP';
  title: string;
  description: string;
  coverImageUrl: string;
  tags: string[];
  priceTokens: number;
  soldCount: number;
  stockRemaining: number | null;
  timeRemaining: number | null;
  isAvailable: boolean;
  is18Plus: boolean;
  contentPreview?: ContentItem[];
  lootboxCategories?: string[];
}

export interface CreateDropInput {
  type: 'STANDARD_DROP' | 'FLASH_DROP' | 'LOOTBOX_DROP' | 'COOP_DROP';
  title: string;
  description: string;
  coverImageUrl: string;
  tags: string[];
  priceTokens: number;
  maxQuantity?: number | null;
  startAt?: Date | null;
  endAt?: Date | null;
  is18Plus: boolean;
  visibility: 'public' | 'followers_only' | 'test_only';
  contentItems?: ContentItem[];
  lootboxPool?: LootboxPool;
  coopCreatorIds?: string[];
  coopShares?: CoopCreatorShare[];
}

export interface UpdateDropInput {
  title?: string;
  description?: string;
  coverImageUrl?: string;
  tags?: string[];
  priceTokens?: number;
  startAt?: Date | null;
  endAt?: Date | null;
  isActive?: boolean;
}

export interface ListDropsFilters {
  creatorId?: string;
  type?: 'STANDARD_DROP' | 'FLASH_DROP' | 'LOOTBOX_DROP' | 'COOP_DROP';
  tags?: string[];
  is18Plus?: boolean;
  activeOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
  offset?: number;
}

export interface DropPurchase {
  purchaseId: string;
  dropId: string;
  userId: string;
  creatorIds: string[];
  tokensSpent: number;
  createdAt: Date;
  resolvedContentItems: ContentItem[];
  revenueSplit: {
    [creatorId: string]: number;
    avalo: number;
  };
}

// Initialize Firebase Functions
const getFunctionsInstance = () => {
  try {
    const app = getApp();
    return getFunctions(app);
  } catch (error) {
    console.error('Error getting Functions instance:', error);
    throw error;
  }
};

/**
 * Create a new drop
 */
export const createDrop = async (data: CreateDropInput): Promise<Drop> => {
  try {
    const functions = getFunctionsInstance();
    const callable = httpsCallable(functions, 'drops_createDrop');
    const result = await callable(data);
    return result.data as Drop;
  } catch (error: any) {
    console.error('Error creating drop:', error);
    throw new Error(error.message || 'Failed to create drop');
  }
};

/**
 * Update an existing drop
 */
export const updateDrop = async (
  dropId: string,
  updates: UpdateDropInput
): Promise<void> => {
  try {
    const functions = getFunctionsInstance();
    const callable = httpsCallable(functions, 'drops_updateDrop');
    await callable({ dropId, updates });
  } catch (error: any) {
    console.error('Error updating drop:', error);
    throw new Error(error.message || 'Failed to update drop');
  }
};

/**
 * Disable a drop
 */
export const disableDrop = async (dropId: string): Promise<void> => {
  try {
    const functions = getFunctionsInstance();
    const callable = httpsCallable(functions, 'drops_disableDrop');
    await callable({ dropId });
  } catch (error: any) {
    console.error('Error disabling drop:', error);
    throw new Error(error.message || 'Failed to disable drop');
  }
};

/**
 * Get drop public info
 */
export const getDrop = async (dropId: string): Promise<DropPublicInfo> => {
  try {
    const functions = getFunctionsInstance();
    const callable = httpsCallable(functions, 'drops_getDrop');
    const result = await callable({ dropId });
    return result.data as DropPublicInfo;
  } catch (error: any) {
    console.error('Error getting drop:', error);
    throw new Error(error.message || 'Failed to get drop');
  }
};

/**
 * List public drops with filters
 */
export const listDrops = async (
  filters: ListDropsFilters = {}
): Promise<DropPublicInfo[]> => {
  try {
    const functions = getFunctionsInstance();
    const callable = httpsCallable(functions, 'drops_listDrops');
    const result = await callable(filters);
    return (result.data as any).drops || [];
  } catch (error: any) {
    console.error('Error listing drops:', error);
    throw new Error(error.message || 'Failed to list drops');
  }
};

/**
 * Purchase a drop
 */
export const purchaseDrop = async (
  dropId: string,
  deviceId?: string,
  ipHash?: string
): Promise<DropPurchase> => {
  try {
    const functions = getFunctionsInstance();
    const callable = httpsCallable(functions, 'drops_purchaseDrop');
    const result = await callable({ dropId, deviceId, ipHash });
    return result.data as DropPurchase;
  } catch (error: any) {
    console.error('Error purchasing drop:', error);
    
    // Handle specific error cases
    if (error.message?.includes('Insufficient tokens')) {
      throw new Error('INSUFFICIENT_TOKENS');
    }
    if (error.message?.includes('18+')) {
      throw new Error('AGE_RESTRICTED');
    }
    if (error.message?.includes('sold out')) {
      throw new Error('SOLD_OUT');
    }
    if (error.message?.includes('ended')) {
      throw new Error('DROP_ENDED');
    }
    if (error.message?.includes('not started')) {
      throw new Error('DROP_NOT_STARTED');
    }
    
    throw new Error(error.message || 'Failed to purchase drop');
  }
};

/**
 * Get user's owned drops
 */
export const getUserOwnedDrops = async (): Promise<DropPublicInfo[]> => {
  try {
    const functions = getFunctionsInstance();
    const callable = httpsCallable(functions, 'drops_getUserOwnedDrops');
    const result = await callable({});
    return (result.data as any).drops || [];
  } catch (error: any) {
    console.error('Error getting owned drops:', error);
    throw new Error(error.message || 'Failed to get owned drops');
  }
};

/**
 * Get creator's drops (for creator dashboard)
 */
export const getCreatorDrops = async (): Promise<Drop[]> => {
  try {
    const functions = getFunctionsInstance();
    const callable = httpsCallable(functions, 'drops_getCreatorDrops');
    const result = await callable({});
    return (result.data as any).drops || [];
  } catch (error: any) {
    console.error('Error getting creator drops:', error);
    throw new Error(error.message || 'Failed to get creator drops');
  }
};

/**
 * Format time remaining as human-readable string
 */
export const formatTimeRemaining = (milliseconds: number | null): string => {
  if (milliseconds === null) {
    return 'Unlimited';
  }
  
  if (milliseconds <= 0) {
    return 'Ended';
  }
  
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
};

/**
 * Check if drop is available for purchase
 */
export const isDropAvailable = (drop: DropPublicInfo): boolean => {
  return drop.isAvailable && 
         (drop.stockRemaining === null || drop.stockRemaining > 0) &&
         (drop.timeRemaining === null || drop.timeRemaining > 0);
};