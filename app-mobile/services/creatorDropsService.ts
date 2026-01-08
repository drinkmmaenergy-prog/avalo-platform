/**
 * Creator Drops Service - Pack 33-7
 * Limited-seat, time-limited monetized bundles for creators
 * 100% UI simulation with AsyncStorage only
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'creator_drops_state_v1';

// Constants
export const PRICE_PRESETS = [80, 120, 200, 320, 450, 600] as const;
export const SEAT_PRESETS = [3, 5, 10] as const;
export const DURATION_PRESETS = [
  { hours: 24, label: '24h' },
  { hours: 48, label: '48h' },
  { hours: 72, label: '72h' },
] as const;

const CREATOR_SHARE = 0.65; // 65% to creator
const AVALO_SHARE = 0.35; // 35% to Avalo
const VIP_DISCOUNT = 0.05; // 5% discount for VIP

// Perk types
export type DropPerk =
  | 'vip_room_48h'
  | 'smartmatch_boost_72h'
  | 'gold_frame_7d'
  | 'vip_chat_group'
  | 'unlock_ppv_media';

export interface CreatorDrop {
  dropId: string;
  creatorId: string;
  price: number; // tokens
  seats: number;
  duration: number; // hours
  perks: DropPerk[];
  createdAt: Date;
  expiresAt: Date;
  purchasedBy: string[]; // userId array
  active: boolean;
}

export interface DropPurchase {
  purchaseId: string;
  dropId: string;
  userId: string;
  creatorId: string;
  tokensPaid: number;
  perksGranted: DropPerk[];
  purchasedAt: Date;
}

export interface DropStats {
  totalEarnings: number; // Creator's share
  totalRevenue: number; // Total collected
  purchaseCount: number;
  avaloShare: number;
}

interface DropsState {
  drops: { [dropId: string]: CreatorDrop };
  purchases: { [purchaseId: string]: DropPurchase };
  creatorDrops: { [creatorId: string]: string }; // creatorId -> active dropId
}

/**
 * Load drops state from storage
 */
async function loadState(): Promise<DropsState> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (!data) {
      return { drops: {}, purchases: {}, creatorDrops: {} };
    }
    const state = JSON.parse(data);
    // Convert date strings back to Date objects
    Object.values(state.drops || {}).forEach((drop: any) => {
      drop.createdAt = new Date(drop.createdAt);
      drop.expiresAt = new Date(drop.expiresAt);
    });
    Object.values(state.purchases || {}).forEach((purchase: any) => {
      purchase.purchasedAt = new Date(purchase.purchasedAt);
    });
    return state;
  } catch (error) {
    console.error('Error loading drops state:', error);
    return { drops: {}, purchases: {}, creatorDrops: {} };
  }
}

/**
 * Save drops state to storage
 */
async function saveState(state: DropsState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Error saving drops state:', error);
    throw error;
  }
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new drop (max 1 active drop per creator)
 */
export async function createDrop(
  creatorId: string,
  payload: {
    price: number;
    seats: number;
    duration: number;
    perks: DropPerk[];
  }
): Promise<{ success: boolean; dropId?: string; error?: string }> {
  try {
    // Validate inputs
    if (!PRICE_PRESETS.includes(payload.price as any)) {
      return { success: false, error: 'Invalid price preset' };
    }
    if (!SEAT_PRESETS.includes(payload.seats as any)) {
      return { success: false, error: 'Invalid seat preset' };
    }
    if (payload.perks.length === 0 || payload.perks.length > 5) {
      return { success: false, error: 'Must select 1-5 perks' };
    }

    const state = await loadState();

    // Check if creator already has an active drop
    const existingDropId = state.creatorDrops[creatorId];
    if (existingDropId && state.drops[existingDropId]?.active) {
      return { success: false, error: 'You already have an active drop' };
    }

    // Create new drop
    const dropId = generateId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + payload.duration * 60 * 60 * 1000);

    const drop: CreatorDrop = {
      dropId,
      creatorId,
      price: payload.price,
      seats: payload.seats,
      duration: payload.duration,
      perks: payload.perks,
      createdAt: now,
      expiresAt,
      purchasedBy: [],
      active: true,
    };

    state.drops[dropId] = drop;
    state.creatorDrops[creatorId] = dropId;

    await saveState(state);

    return { success: true, dropId };
  } catch (error) {
    console.error('Error creating drop:', error);
    return { success: false, error: 'Failed to create drop' };
  }
}

/**
 * Get active drop for a creator
 */
export async function getActiveDrop(
  creatorId: string
): Promise<CreatorDrop | null> {
  try {
    const state = await loadState();
    const dropId = state.creatorDrops[creatorId];
    
    if (!dropId) return null;

    const drop = state.drops[dropId];
    if (!drop || !drop.active) return null;

    // Check if expired
    if (new Date() > drop.expiresAt) {
      drop.active = false;
      await saveState(state);
      return null;
    }

    return drop;
  } catch (error) {
    console.error('Error getting active drop:', error);
    return null;
  }
}

/**
 * Join a drop (purchase)
 */
export async function joinDrop(
  userId: string,
  dropId: string,
  isVip: boolean = false
): Promise<{ success: boolean; error?: string; purchase?: DropPurchase }> {
  try {
    const state = await loadState();
    const drop = state.drops[dropId];

    if (!drop) {
      return { success: false, error: 'Drop not found' };
    }

    if (!drop.active) {
      return { success: false, error: 'Drop is no longer active' };
    }

    // Check if expired
    if (new Date() > drop.expiresAt) {
      drop.active = false;
      await saveState(state);
      return { success: false, error: 'Drop has expired' };
    }

    // Check if sold out
    if (drop.purchasedBy.length >= drop.seats) {
      drop.active = false;
      await saveState(state);
      return { success: false, error: 'Drop is sold out' };
    }

    // Check if user already purchased
    if (drop.purchasedBy.includes(userId)) {
      return { success: false, error: 'You already purchased this drop' };
    }

    // Calculate price with VIP discount (5% off, but never free)
    let finalPrice = drop.price;
    if (isVip) {
      finalPrice = Math.max(1, Math.floor(drop.price * (1 - VIP_DISCOUNT)));
    }

    // Create purchase record
    const purchaseId = generateId();
    const purchase: DropPurchase = {
      purchaseId,
      dropId,
      userId,
      creatorId: drop.creatorId,
      tokensPaid: finalPrice,
      perksGranted: drop.perks,
      purchasedAt: new Date(),
    };

    // Update state
    drop.purchasedBy.push(userId);
    state.purchases[purchaseId] = purchase;

    // Auto-deactivate if sold out
    if (drop.purchasedBy.length >= drop.seats) {
      drop.active = false;
    }

    await saveState(state);

    return { success: true, purchase };
  } catch (error) {
    console.error('Error joining drop:', error);
    return { success: false, error: 'Failed to join drop' };
  }
}

/**
 * Get drop statistics for creator
 */
export async function getDropStats(creatorId: string): Promise<DropStats> {
  try {
    const state = await loadState();
    let totalRevenue = 0;
    let purchaseCount = 0;

    Object.values(state.purchases).forEach((purchase) => {
      if (purchase.creatorId === creatorId) {
        totalRevenue += purchase.tokensPaid;
        purchaseCount++;
      }
    });

    const totalEarnings = Math.floor(totalRevenue * CREATOR_SHARE);
    const avaloShare = Math.floor(totalRevenue * AVALO_SHARE);

    return {
      totalEarnings,
      totalRevenue,
      purchaseCount,
      avaloShare,
    };
  } catch (error) {
    console.error('Error getting drop stats:', error);
    return {
      totalEarnings: 0,
      totalRevenue: 0,
      purchaseCount: 0,
      avaloShare: 0,
    };
  }
}

/**
 * Expire old drops (cleanup)
 */
export async function expireDrops(): Promise<number> {
  try {
    const state = await loadState();
    const now = new Date();
    let expiredCount = 0;

    Object.values(state.drops).forEach((drop) => {
      if (drop.active && now > drop.expiresAt) {
        drop.active = false;
        expiredCount++;
      }
    });

    if (expiredCount > 0) {
      await saveState(state);
    }

    return expiredCount;
  } catch (error) {
    console.error('Error expiring drops:', error);
    return 0;
  }
}

/**
 * Delete a drop (creator only)
 */
export async function deleteDrop(
  creatorId: string,
  dropId: string
): Promise<boolean> {
  try {
    const state = await loadState();
    const drop = state.drops[dropId];

    if (!drop || drop.creatorId !== creatorId) {
      return false;
    }

    // Mark as inactive
    drop.active = false;
    
    // Remove from creator's active drops
    if (state.creatorDrops[creatorId] === dropId) {
      delete state.creatorDrops[creatorId];
    }

    await saveState(state);
    return true;
  } catch (error) {
    console.error('Error deleting drop:', error);
    return false;
  }
}

/**
 * Get user's purchased drops
 */
export async function getUserPurchases(userId: string): Promise<DropPurchase[]> {
  try {
    const state = await loadState();
    return Object.values(state.purchases).filter(
      (purchase) => purchase.userId === userId
    );
  } catch (error) {
    console.error('Error getting user purchases:', error);
    return [];
  }
}

/**
 * Check if user has purchased a specific drop
 */
export async function hasUserPurchased(
  userId: string,
  dropId: string
): Promise<boolean> {
  try {
    const state = await loadState();
    const drop = state.drops[dropId];
    return drop?.purchasedBy.includes(userId) || false;
  } catch (error) {
    return false;
  }
}

/**
 * Calculate earnings breakdown
 */
export function calculateEarnings(price: number): {
  creatorEarns: number;
  avaloFee: number;
} {
  return {
    creatorEarns: Math.floor(price * CREATOR_SHARE),
    avaloFee: Math.floor(price * AVALO_SHARE),
  };
}

/**
 * Calculate VIP price
 */
export function calculateVIPPrice(price: number): number {
  return Math.max(1, Math.floor(price * (1 - VIP_DISCOUNT)));
}

/**
 * Get perk display info
 */
export function getPerkInfo(perk: DropPerk): {
  key: string;
  icon: string;
} {
  const perkMap: Record<DropPerk, { key: string; icon: string }> = {
    vip_room_48h: { key: 'vip_room_48h', icon: '👑' },
    smartmatch_boost_72h: { key: 'smartmatch_boost_72h', icon: '⚡' },
    gold_frame_7d: { key: 'gold_frame_7d', icon: '✨' },
    vip_chat_group: { key: 'vip_chat_group', icon: '💬' },
    unlock_ppv_media: { key: 'unlock_ppv_media', icon: '🔓' },
  };
  return perkMap[perk] || { key: perk, icon: '🎁' };
}

/**
 * Format time remaining
 */
export function formatTimeRemaining(expiresAt: Date): string {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();

  if (diff <= 0) return 'Expired';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Clear all data (for testing)
 */
export async function clearAllData(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing drops data:', error);
  }
}