/**
 * Creator Collections Service
 * Phase 33-10: UI-only Creator Collections (PPV + Subscription Hybrid Bundles)
 * 
 * Allows creators to publish premium playlists made from multiple media types
 * and sell them for tokens. AsyncStorage only, no backend.
 * 
 * Revenue split: 65% creator / 35% Avalo
 * VIP discount: 10% discount, minimum 1 token, NEVER free
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const COLLECTIONS_STORAGE_KEY = 'creatorCollections_v1';
const PURCHASES_STORAGE_KEY = 'creatorCollections_v1_purchases';
const EARNINGS_STORAGE_KEY = 'creatorCollections_v1_earnings';

const AVALO_COMMISSION = 0.35; // 35% commission
const CREATOR_EARNINGS = 0.65; // 65% to creator
const VIP_DISCOUNT = 0.10; // 10% discount for VIP subscribers

// Price presets (tokens): Bronze → Royal
export const COLLECTION_PRICE_PRESETS = [180, 280, 400, 600, 850];

const MAX_COLLECTIONS_PER_CREATOR = 4;

export interface CollectionMedia {
  mediaId: string;
  type: 'photo' | 'video' | 'voice' | 'live_replay' | 'ai_prompt';
  title?: string;
}

export interface Collection {
  id: string;
  creatorId: string;
  name: string;
  description: string;
  coverImage?: string;
  price: number; // tokens
  media: CollectionMedia[];
  active: boolean;
  createdAt: Date;
  expiresAt?: Date; // Optional expiration date
}

export interface CollectionPurchase {
  collectionId: string;
  userId: string;
  creatorId: string;
  price: number; // tokens paid
  purchasedAt: Date;
  hasAccess: boolean;
}

export interface CollectionEarnings {
  [creatorId: string]: {
    totalEarned: number; // Total tokens earned (after commission)
    totalSales: number; // Total tokens from sales (before commission)
    avaloCommission: number; // Total commission paid to Avalo
    purchaseCount: number; // Number of purchases
  };
}

interface CollectionsState {
  [collectionId: string]: Collection;
}

interface PurchasesState {
  [userId: string]: {
    [collectionId: string]: CollectionPurchase;
  };
}

/**
 * Generate unique collection ID
 */
function generateCollectionId(): string {
  return `col_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all collections from storage
 */
async function getAllCollections(): Promise<CollectionsState> {
  try {
    const data = await AsyncStorage.getItem(COLLECTIONS_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Error getting all collections:', error);
    return {};
  }
}

/**
 * Save collections to storage
 */
async function saveCollections(collections: CollectionsState): Promise<void> {
  try {
    await AsyncStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(collections));
  } catch (error) {
    console.error('Error saving collections:', error);
    throw error;
  }
}

/**
 * Get all purchases from storage
 */
async function getAllPurchases(): Promise<PurchasesState> {
  try {
    const data = await AsyncStorage.getItem(PURCHASES_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Error getting all purchases:', error);
    return {};
  }
}

/**
 * Save purchases to storage
 */
async function savePurchases(purchases: PurchasesState): Promise<void> {
  try {
    await AsyncStorage.setItem(PURCHASES_STORAGE_KEY, JSON.stringify(purchases));
  } catch (error) {
    console.error('Error saving purchases:', error);
    throw error;
  }
}

/**
 * Create a new collection
 * Max 4 active collections per creator
 */
export async function createCollection(
  creatorId: string,
  payload: {
    name: string;
    description: string;
    coverImage?: string;
    price: number;
    expiresAt?: Date;
  }
): Promise<{ success: boolean; collectionId?: string; error?: string }> {
  try {
    // Validate price
    if (!COLLECTION_PRICE_PRESETS.includes(payload.price)) {
      return { 
        success: false, 
        error: `Invalid price. Must be one of: ${COLLECTION_PRICE_PRESETS.join(', ')}` 
      };
    }

    // Check creator's active collection count
    const collections = await getAllCollections();
    const activeCount = Object.values(collections).filter(
      c => c.creatorId === creatorId && c.active
    ).length;

    if (activeCount >= MAX_COLLECTIONS_PER_CREATOR) {
      return {
        success: false,
        error: `Maximum ${MAX_COLLECTIONS_PER_CREATOR} active collections per creator`,
      };
    }

    const collectionId = generateCollectionId();
    const newCollection: Collection = {
      id: collectionId,
      creatorId,
      name: payload.name,
      description: payload.description,
      coverImage: payload.coverImage,
      price: payload.price,
      media: [],
      active: true,
      createdAt: new Date(),
      expiresAt: payload.expiresAt,
    };

    collections[collectionId] = newCollection;
    await saveCollections(collections);

    return { success: true, collectionId };
  } catch (error) {
    console.error('Error creating collection:', error);
    return { success: false, error: 'Failed to create collection' };
  }
}

/**
 * Get active collections for a creator
 */
export async function getCollections(creatorId: string): Promise<Collection[]> {
  try {
    const collections = await getAllCollections();
    return Object.values(collections)
      .filter(c => c.creatorId === creatorId && c.active)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch (error) {
    console.error('Error getting collections:', error);
    return [];
  }
}

/**
 * Get collection by ID with full details including media
 */
export async function getCollectionById(collectionId: string): Promise<Collection | null> {
  try {
    const collections = await getAllCollections();
    const collection = collections[collectionId];
    
    if (!collection) {
      return null;
    }

    // Parse dates if they're stored as strings
    if (collection.createdAt && typeof collection.createdAt === 'string') {
      collection.createdAt = new Date(collection.createdAt);
    }
    if (collection.expiresAt && typeof collection.expiresAt === 'string') {
      collection.expiresAt = new Date(collection.expiresAt);
    }

    return collection;
  } catch (error) {
    console.error('Error getting collection by ID:', error);
    return null;
  }
}

/**
 * Add media asset to collection
 */
export async function addMediaToCollection(
  collectionId: string,
  media: CollectionMedia
): Promise<{ success: boolean; error?: string }> {
  try {
    const collections = await getAllCollections();
    const collection = collections[collectionId];

    if (!collection) {
      return { success: false, error: 'Collection not found' };
    }

    if (!collection.active) {
      return { success: false, error: 'Collection is not active' };
    }

    // Check if media already exists in collection
    const exists = collection.media.some(m => m.mediaId === media.mediaId);
    if (exists) {
      return { success: false, error: 'Media already in collection' };
    }

    collection.media.push(media);
    collections[collectionId] = collection;
    await saveCollections(collections);

    return { success: true };
  } catch (error) {
    console.error('Error adding media to collection:', error);
    return { success: false, error: 'Failed to add media' };
  }
}

/**
 * Calculate VIP discounted price
 * Minimum 1 token, NEVER free
 */
export function calculateVIPPrice(basePrice: number): number {
  if (basePrice === 0) return 0;
  const discounted = Math.floor(basePrice * (1 - VIP_DISCOUNT));
  return Math.max(1, discounted); // Ensure minimum 1 token
}

/**
 * Get effective price for a user (with VIP discount if applicable)
 */
export async function getEffectivePrice(
  collectionId: string,
  isVIPSubscriber: boolean
): Promise<number> {
  try {
    const collection = await getCollectionById(collectionId);
    if (!collection) return 0;

    if (isVIPSubscriber) {
      return calculateVIPPrice(collection.price);
    }

    return collection.price;
  } catch (error) {
    console.error('Error getting effective price:', error);
    return 0;
  }
}

/**
 * Purchase collection
 * Deducts tokens and assigns access
 */
export async function purchaseCollection(
  userId: string,
  collectionId: string,
  price: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate price
    if (price <= 0) {
      return { success: false, error: 'Invalid price' };
    }

    const collection = await getCollectionById(collectionId);
    if (!collection) {
      return { success: false, error: 'Collection not found' };
    }

    if (!collection.active) {
      return { success: false, error: 'Collection is not active' };
    }

    // Check if already purchased
    const purchases = await getAllPurchases();
    if (!purchases[userId]) {
      purchases[userId] = {};
    }

    if (purchases[userId][collectionId]?.hasAccess) {
      return { success: false, error: 'Already purchased' };
    }

    // Create purchase record
    const purchase: CollectionPurchase = {
      collectionId,
      userId,
      creatorId: collection.creatorId,
      price,
      purchasedAt: new Date(),
      hasAccess: true,
    };

    purchases[userId][collectionId] = purchase;
    await savePurchases(purchases);

    // Update creator earnings
    await updateCreatorEarnings(collection.creatorId, price);

    return { success: true };
  } catch (error) {
    console.error('Error purchasing collection:', error);
    return { success: false, error: 'Failed to purchase collection' };
  }
}

/**
 * Update creator earnings after a purchase
 */
async function updateCreatorEarnings(
  creatorId: string,
  salePrice: number
): Promise<void> {
  try {
    const storedData = await AsyncStorage.getItem(EARNINGS_STORAGE_KEY);
    const earnings: CollectionEarnings = storedData ? JSON.parse(storedData) : {};

    if (!earnings[creatorId]) {
      earnings[creatorId] = {
        totalEarned: 0,
        totalSales: 0,
        avaloCommission: 0,
        purchaseCount: 0,
      };
    }

    const creatorEarning = Math.floor(salePrice * CREATOR_EARNINGS);
    const avaloCommission = Math.floor(salePrice * AVALO_COMMISSION);

    earnings[creatorId].totalEarned += creatorEarning;
    earnings[creatorId].totalSales += salePrice;
    earnings[creatorId].avaloCommission += avaloCommission;
    earnings[creatorId].purchaseCount += 1;

    await AsyncStorage.setItem(EARNINGS_STORAGE_KEY, JSON.stringify(earnings));
  } catch (error) {
    console.error('Error updating creator earnings:', error);
  }
}

/**
 * Check if user has access to a collection
 */
export async function hasAccess(
  userId: string,
  collectionId: string
): Promise<boolean> {
  try {
    const purchases = await getAllPurchases();
    return purchases[userId]?.[collectionId]?.hasAccess || false;
  } catch (error) {
    console.error('Error checking access:', error);
    return false;
  }
}

/**
 * Get collection statistics for a creator
 * Returns total purchases and revenue
 */
export async function getCollectionStats(creatorId: string): Promise<{
  totalEarned: number;
  totalSales: number;
  avaloCommission: number;
  purchaseCount: number;
}> {
  try {
    const storedData = await AsyncStorage.getItem(EARNINGS_STORAGE_KEY);
    if (!storedData) {
      return { totalEarned: 0, totalSales: 0, avaloCommission: 0, purchaseCount: 0 };
    }

    const earnings: CollectionEarnings = JSON.parse(storedData);
    return earnings[creatorId] || {
      totalEarned: 0,
      totalSales: 0,
      avaloCommission: 0,
      purchaseCount: 0,
    };
  } catch (error) {
    console.error('Error getting collection stats:', error);
    return { totalEarned: 0, totalSales: 0, avaloCommission: 0, purchaseCount: 0 };
  }
}

/**
 * Remove expired collections automatically
 */
export async function expireCollections(): Promise<number> {
  try {
    const collections = await getAllCollections();
    const now = new Date();
    let expiredCount = 0;

    for (const collectionId in collections) {
      const collection = collections[collectionId];
      
      if (collection.expiresAt) {
        const expiresAt = typeof collection.expiresAt === 'string' 
          ? new Date(collection.expiresAt) 
          : collection.expiresAt;

        if (expiresAt <= now && collection.active) {
          collection.active = false;
          expiredCount++;
        }
      }
    }

    if (expiredCount > 0) {
      await saveCollections(collections);
    }

    return expiredCount;
  } catch (error) {
    console.error('Error expiring collections:', error);
    return 0;
  }
}

/**
 * Calculate creator earnings from a sale price
 */
export function calculateCreatorEarnings(salePrice: number): number {
  if (salePrice === 0) return 0;
  return Math.floor(salePrice * CREATOR_EARNINGS);
}

/**
 * Calculate Avalo commission from a sale price
 */
export function calculateAvaloCommission(salePrice: number): number {
  if (salePrice === 0) return 0;
  return Math.floor(salePrice * AVALO_COMMISSION);
}

/**
 * Get all collections purchased by a user
 */
export async function getUserPurchases(userId: string): Promise<CollectionPurchase[]> {
  try {
    const purchases = await getAllPurchases();
    const userPurchases = purchases[userId] || {};
    return Object.values(userPurchases).filter(p => p.hasAccess);
  } catch (error) {
    console.error('Error getting user purchases:', error);
    return [];
  }
}

/**
 * Get purchase count for a collection
 */
export async function getCollectionPurchaseCount(collectionId: string): Promise<number> {
  try {
    const purchases = await getAllPurchases();
    let count = 0;

    for (const userId in purchases) {
      if (purchases[userId][collectionId]?.hasAccess) {
        count++;
      }
    }

    return count;
  } catch (error) {
    console.error('Error getting collection purchase count:', error);
    return 0;
  }
}

/**
 * Deactivate a collection
 */
export async function deactivateCollection(
  collectionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const collections = await getAllCollections();
    const collection = collections[collectionId];

    if (!collection) {
      return { success: false, error: 'Collection not found' };
    }

    collection.active = false;
    collections[collectionId] = collection;
    await saveCollections(collections);

    return { success: true };
  } catch (error) {
    console.error('Error deactivating collection:', error);
    return { success: false, error: 'Failed to deactivate collection' };
  }
}

/**
 * Remove media from collection
 */
export async function removeMediaFromCollection(
  collectionId: string,
  mediaId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const collections = await getAllCollections();
    const collection = collections[collectionId];

    if (!collection) {
      return { success: false, error: 'Collection not found' };
    }

    collection.media = collection.media.filter(m => m.mediaId !== mediaId);
    collections[collectionId] = collection;
    await saveCollections(collections);

    return { success: true };
  } catch (error) {
    console.error('Error removing media from collection:', error);
    return { success: false, error: 'Failed to remove media' };
  }
}

/**
 * Clear all collection data (for testing)
 */
export async function clearAllCollections(): Promise<void> {
  try {
    await AsyncStorage.removeItem(COLLECTIONS_STORAGE_KEY);
    await AsyncStorage.removeItem(PURCHASES_STORAGE_KEY);
    await AsyncStorage.removeItem(EARNINGS_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing collections:', error);
  }
}

export default {
  createCollection,
  getCollections,
  getCollectionById,
  addMediaToCollection,
  purchaseCollection,
  hasAccess,
  getCollectionStats,
  expireCollections,
  calculateVIPPrice,
  getEffectivePrice,
  calculateCreatorEarnings,
  calculateAvaloCommission,
  getUserPurchases,
  getCollectionPurchaseCount,
  deactivateCollection,
  removeMediaFromCollection,
  clearAllCollections,
  COLLECTION_PRICE_PRESETS,
  AVALO_COMMISSION,
  CREATOR_EARNINGS,
  VIP_DISCOUNT,
  MAX_COLLECTIONS_PER_CREATOR,
};