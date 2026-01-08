import AsyncStorage from '@react-native-async-storage/async-storage';

// ===========================
// TYPE DEFINITIONS
// ===========================

export type CreatorOfferType = 'BUNDLE' | 'LAUNCH' | 'FLASH';

export interface CreatorOfferPerk {
  type: 'PPV_UNLOCK_PACK' | 'VIP_ROOM_ACCESS' | 'COSMETIC_BOOST';
  label: string;
  durationHours?: number | null;
}

export interface CreatorOffer {
  id: string;
  creatorId: string;
  type: CreatorOfferType;
  title: string;
  description: string;
  tokenPrice: number;
  perks: CreatorOfferPerk[];
  createdAt: number;
  expiresAt: number;
  isActive: boolean;
  purchasersCount: number;
}

export interface CreatorOfferPurchase {
  offerId: string;
  creatorId: string;
  buyerId: string;
  purchasedAt: number;
  tokenPricePaid: number;
  creatorEarnings: number;
  avaloFee: number;
}

// ===========================
// CONSTANTS
// ===========================

const ALLOWED_TOKEN_PRICES = [80, 120, 200, 320, 450, 600];
const DURATION_OPTIONS_HOURS = [24, 48, 72];

// AsyncStorage keys
const CREATOR_OFFERS_KEY_PREFIX = 'creator_offers_v1_';
const OFFER_PURCHASES_KEY_PREFIX = 'creator_offer_purchases_v1_';

// ===========================
// HELPER FUNCTIONS
// ===========================

function generateId(): string {
  return `offer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function validateTokenPrice(price: number): void {
  if (!ALLOWED_TOKEN_PRICES.includes(price)) {
    throw new Error(
      `Invalid token price. Allowed prices: ${ALLOWED_TOKEN_PRICES.join(', ')}`
    );
  }
}

function validateDuration(durationHours: number): void {
  if (!DURATION_OPTIONS_HOURS.includes(durationHours)) {
    throw new Error(
      `Invalid duration. Allowed durations: ${DURATION_OPTIONS_HOURS.join(', ')} hours`
    );
  }
}

function isOfferExpired(offer: CreatorOffer): boolean {
  return Date.now() > offer.expiresAt;
}

function calculateEarnings(tokenPrice: number): { creatorEarnings: number; avaloFee: number } {
  const creatorEarnings = Math.floor(tokenPrice * 0.65);
  const avaloFee = Math.floor(tokenPrice * 0.35);
  return { creatorEarnings, avaloFee };
}

// ===========================
// ASYNCSTORAGE OPERATIONS
// ===========================

async function getCreatorOffersFromStorage(creatorId: string): Promise<CreatorOffer[]> {
  try {
    const key = `${CREATOR_OFFERS_KEY_PREFIX}${creatorId}`;
    const data = await AsyncStorage.getItem(key);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading creator offers from storage:', error);
    return [];
  }
}

async function saveCreatorOffersToStorage(
  creatorId: string,
  offers: CreatorOffer[]
): Promise<void> {
  try {
    const key = `${CREATOR_OFFERS_KEY_PREFIX}${creatorId}`;
    await AsyncStorage.setItem(key, JSON.stringify(offers));
  } catch (error) {
    console.error('Error saving creator offers to storage:', error);
    throw new Error('Failed to save creator offers');
  }
}

async function getUserPurchasesFromStorage(userId: string): Promise<CreatorOfferPurchase[]> {
  try {
    const key = `${OFFER_PURCHASES_KEY_PREFIX}${userId}`;
    const data = await AsyncStorage.getItem(key);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading user purchases from storage:', error);
    return [];
  }
}

async function saveUserPurchasesToStorage(
  userId: string,
  purchases: CreatorOfferPurchase[]
): Promise<void> {
  try {
    const key = `${OFFER_PURCHASES_KEY_PREFIX}${userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(purchases));
  } catch (error) {
    console.error('Error saving user purchases to storage:', error);
    throw new Error('Failed to save user purchases');
  }
}

// ===========================
// PUBLIC API
// ===========================

/**
 * Get all active offers for a creator (creator's view)
 * Automatically marks expired offers as inactive
 */
export async function getActiveOffersForCreator(creatorId: string): Promise<CreatorOffer[]> {
  const allOffers = await getCreatorOffersFromStorage(creatorId);
  const now = Date.now();
  let hasChanges = false;

  const updatedOffers = allOffers.map(offer => {
    if (offer.isActive && now > offer.expiresAt) {
      hasChanges = true;
      return { ...offer, isActive: false };
    }
    return offer;
  });

  if (hasChanges) {
    await saveCreatorOffersToStorage(creatorId, updatedOffers);
  }

  return updatedOffers.filter(offer => offer.isActive);
}

/**
 * Get active offers for a viewer (fan's view)
 * Filters out offers the viewer has already purchased
 */
export async function getActiveOffersForViewer(
  creatorId: string,
  viewerId: string
): Promise<CreatorOffer[]> {
  const activeOffers = await getActiveOffersForCreator(creatorId);
  const userPurchases = await getUserPurchasesFromStorage(viewerId);
  
  const purchasedOfferIds = new Set(
    userPurchases
      .filter(p => p.creatorId === creatorId)
      .map(p => p.offerId)
  );

  return activeOffers.filter(offer => !purchasedOfferIds.has(offer.id));
}

/**
 * Create new offer or update existing one
 */
export async function createOrUpdateOffer(
  creatorId: string,
  payload: Partial<CreatorOffer>
): Promise<CreatorOffer> {
  // Validate token price
  if (payload.tokenPrice !== undefined) {
    validateTokenPrice(payload.tokenPrice);
  }

  const allOffers = await getCreatorOffersFromStorage(creatorId);
  
  // Check if updating existing offer
  if (payload.id) {
    const existingIndex = allOffers.findIndex(o => o.id === payload.id);
    if (existingIndex >= 0) {
      const updated = { ...allOffers[existingIndex], ...payload };
      allOffers[existingIndex] = updated;
      await saveCreatorOffersToStorage(creatorId, allOffers);
      return updated;
    }
  }

  // Creating new offer - check limit
  const activeCount = allOffers.filter(o => o.isActive && !isOfferExpired(o)).length;
  if (activeCount >= 2) {
    throw new Error('Maximum 2 active offers allowed at once');
  }

  // Validate duration and calculate expiry
  const durationHours = payload.expiresAt
    ? Math.round((payload.expiresAt - Date.now()) / (1000 * 60 * 60))
    : 24;
  
  if (!DURATION_OPTIONS_HOURS.includes(durationHours)) {
    throw new Error(`Invalid duration: ${durationHours}h. Use 24, 48, or 72 hours.`);
  }

  const now = Date.now();
  const newOffer: CreatorOffer = {
    id: generateId(),
    creatorId,
    type: payload.type || 'BUNDLE',
    title: payload.title || '',
    description: payload.description || '',
    tokenPrice: payload.tokenPrice || 120,
    perks: payload.perks || [],
    createdAt: now,
    expiresAt: payload.expiresAt || now + durationHours * 60 * 60 * 1000,
    isActive: true,
    purchasersCount: 0,
  };

  allOffers.push(newOffer);
  await saveCreatorOffersToStorage(creatorId, allOffers);
  return newOffer;
}

/**
 * Deactivate an offer
 */
export async function deactivateOffer(creatorId: string, offerId: string): Promise<void> {
  const allOffers = await getCreatorOffersFromStorage(creatorId);
  const offerIndex = allOffers.findIndex(o => o.id === offerId);

  if (offerIndex < 0) {
    throw new Error('Offer not found');
  }

  allOffers[offerIndex].isActive = false;
  await saveCreatorOffersToStorage(creatorId, allOffers);
}

/**
 * Purchase an offer (simulated)
 * Deducts tokens, records purchase, updates stats
 */
export async function purchaseOffer(
  creatorId: string,
  viewerId: string,
  offerId: string
): Promise<CreatorOfferPurchase> {
  // Get offer
  const allOffers = await getCreatorOffersFromStorage(creatorId);
  const offerIndex = allOffers.findIndex(o => o.id === offerId);

  if (offerIndex < 0) {
    throw new Error('Offer not found');
  }

  const offer = allOffers[offerIndex];

  // Validate offer is active and not expired
  if (!offer.isActive) {
    throw new Error('Offer is no longer active');
  }

  if (isOfferExpired(offer)) {
    // Auto-deactivate
    allOffers[offerIndex].isActive = false;
    await saveCreatorOffersToStorage(creatorId, allOffers);
    throw new Error('Offer has expired');
  }

  // Check if user already purchased this offer
  const userPurchases = await getUserPurchasesFromStorage(viewerId);
  const alreadyPurchased = userPurchases.some(
    p => p.offerId === offerId && p.creatorId === creatorId
  );

  if (alreadyPurchased) {
    throw new Error('You have already purchased this offer');
  }

  // Calculate earnings split (65/35)
  const { creatorEarnings, avaloFee } = calculateEarnings(offer.tokenPrice);

  // Create purchase record
  const purchase: CreatorOfferPurchase = {
    offerId,
    creatorId,
    buyerId: viewerId,
    purchasedAt: Date.now(),
    tokenPricePaid: offer.tokenPrice,
    creatorEarnings,
    avaloFee,
  };

  // Update offer purchaser count
  allOffers[offerIndex].purchasersCount += 1;
  await saveCreatorOffersToStorage(creatorId, allOffers);

  // Save purchase to user's records
  userPurchases.push(purchase);
  await saveUserPurchasesToStorage(viewerId, userPurchases);

  return purchase;
}

/**
 * Get all purchases for a user
 */
export async function getPurchasesForUser(viewerId: string): Promise<CreatorOfferPurchase[]> {
  return getUserPurchasesFromStorage(viewerId);
}

/**
 * Get aggregated stats for a creator
 */
export async function getCreatorOfferStats(
  creatorId: string
): Promise<{
  totalPurchases: number;
  totalTokens: number;
  creatorEarnings: number;
  avaloFees: number;
}> {
  try {
    // Get all users' purchases and filter for this creator
    // In a real app, we'd query by creatorId. For AsyncStorage simulation,
    // we'll need to iterate through possible keys or maintain a global index.
    // For simplicity, we'll aggregate from the creator's offers.
    
    const allOffers = await getCreatorOffersFromStorage(creatorId);
    const totalPurchases = allOffers.reduce((sum, offer) => sum + offer.purchasersCount, 0);
    
    // Estimate total tokens and earnings based on offer stats
    // In real implementation, we'd query actual purchase records
    let totalTokens = 0;
    let creatorEarnings = 0;
    let avaloFees = 0;

    for (const offer of allOffers) {
      const offerTotal = offer.tokenPrice * offer.purchasersCount;
      totalTokens += offerTotal;
      const earnings = calculateEarnings(offer.tokenPrice);
      creatorEarnings += earnings.creatorEarnings * offer.purchasersCount;
      avaloFees += earnings.avaloFee * offer.purchasersCount;
    }

    return {
      totalPurchases,
      totalTokens,
      creatorEarnings,
      avaloFees,
    };
  } catch (error) {
    console.error('Error calculating creator offer stats:', error);
    return {
      totalPurchases: 0,
      totalTokens: 0,
      creatorEarnings: 0,
      avaloFees: 0,
    };
  }
}

/**
 * Check if user has purchased a specific offer
 */
export async function hasUserPurchasedOffer(
  viewerId: string,
  offerId: string
): Promise<boolean> {
  const purchases = await getUserPurchasesFromStorage(viewerId);
  return purchases.some(p => p.offerId === offerId);
}

/**
 * Get allowed token prices
 */
export function getAllowedTokenPrices(): number[] {
  return [...ALLOWED_TOKEN_PRICES];
}

/**
 * Get allowed duration options in hours
 */
export function getAllowedDurations(): number[] {
  return [...DURATION_OPTIONS_HOURS];
}