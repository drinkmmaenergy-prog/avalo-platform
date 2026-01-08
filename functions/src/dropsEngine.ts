/**
 * Phase 15: Drops Marketplace Engine
 * Core business logic for drops creation, management, and purchases
 * 
 * IMPORTANT: This module is ADDITIVE ONLY.
 * It does NOT modify existing monetization, chat, call, or payout logic.
 */

import { db, serverTimestamp, increment, generateId } from './init';
import type {
  Drop,
  DropType,
  DropPurchase,
  UserDropOwnership,
  CreateDropInput,
  UpdateDropInput,
  ListDropsFilters,
  DropPublicInfo,
  ContentItem,
  LootboxPool,
  CoopCreatorShare,
} from './types/drops';

// Import existing engines for integration
import { recordRankingAction } from './rankingEngine';
import { recordRiskEvent, evaluateUserRisk } from './trustEngine';

// ============================================================================
// CONSTANTS
// ============================================================================

const DROP_CONSTANTS = {
  MIN_PRICE_TOKENS: 20,
  MAX_PRICE_TOKENS: 5000,
  MAX_TITLE_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 1000,
  MAX_TAGS: 10,
  CREATOR_SHARE_PERCENTAGE: 70, // 70% to creators
  AVALO_SHARE_PERCENTAGE: 30, // 30% to Avalo
  RANKING_POINTS_PER_TOKEN: 1, // For ranking system
};

// Simple error class for consistency
class HttpsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'HttpsError';
  }
}

// Simple logger
const logger = {
  error: (..._args: any[]) => {},
  info: (..._args: any[]) => {},
  warn: (..._args: any[]) => {},
};

// ============================================================================
// CREATE DROP
// ============================================================================

/**
 * Create a new drop
 * Only creators with appropriate status can create drops
 */
export async function createDrop(
  creatorId: string,
  data: CreateDropInput
): Promise<Drop> {
  // Phase 30A: TrustShield 2.0 - Content Moderation for drop description
  try {
    const { moderateText, logModerationIncident } = await import('./contentModerationEngine');
    
    // Check title
    const titleModeration = await moderateText({
      userId: creatorId,
      text: data.title,
      source: 'drop_description',
    });
    
    if (titleModeration.actions.includes('BLOCK_CONTENT')) {
      await logModerationIncident({ userId: creatorId, text: data.title, source: 'drop_description' }, titleModeration);
      throw new HttpsError('failed-precondition', 'CONTENT_BLOCKED_POLICY_VIOLATION');
    }
    
    if (titleModeration.actions.includes('ALLOW_AND_LOG') || titleModeration.actions.includes('FLAG_FOR_REVIEW')) {
      logModerationIncident({ userId: creatorId, text: data.title, source: 'drop_description' }, titleModeration).catch(() => {});
    }
    
    // Check description
    const descModeration = await moderateText({
      userId: creatorId,
      text: data.description,
      source: 'drop_description',
    });
    
    if (descModeration.actions.includes('BLOCK_CONTENT')) {
      await logModerationIncident({ userId: creatorId, text: data.description, source: 'drop_description' }, descModeration);
      throw new HttpsError('failed-precondition', 'CONTENT_BLOCKED_POLICY_VIOLATION');
    }
    
    if (descModeration.actions.includes('ALLOW_AND_LOG') || descModeration.actions.includes('FLAG_FOR_REVIEW')) {
      logModerationIncident({ userId: creatorId, text: data.description, source: 'drop_description' }, descModeration).catch(() => {});
    }
  } catch (error: any) {
    // If it's our policy error, re-throw it
    if (error.name === 'HttpsError' && error.message === 'CONTENT_BLOCKED_POLICY_VIOLATION') {
      throw error;
    }
    // Otherwise, non-blocking
    logger.error('Content moderation check failed:', error);
  }
  
  // Validate creator eligibility
  const creatorRef = db.collection('users').doc(creatorId);
  const creatorSnap = await creatorRef.get();
  
  if (!creatorSnap.exists) {
    throw new HttpsError('not-found', 'Creator not found');
  }
  
  const creatorData = creatorSnap.data();
  
  // Check if creator can earn (similar to other monetization features)
  if (!creatorData?.modes?.earnFromChat && !creatorData?.earnOnChat) {
    throw new HttpsError(
      'permission-denied',
      'Creator must enable earnings to create drops'
    );
  }
  
  // Validate input
  validateDropInput(data);
  
  // Validate COOP configuration if applicable
  if (data.type === 'COOP_DROP') {
    validateCoopConfiguration(data.coopCreatorIds, data.coopShares);
  }
  
  // Validate FLASH time window if applicable
  if (data.type === 'FLASH_DROP') {
    validateFlashTimeWindow(data.startAt, data.endAt);
  }
  
  // Validate LOOTBOX pool if applicable
  if (data.type === 'LOOTBOX_DROP') {
    validateLootboxPool(data.lootboxPool);
  }
  
  // Determine owner creator IDs
  const ownerCreatorIds = data.type === 'COOP_DROP' && data.coopCreatorIds
    ? [creatorId, ...data.coopCreatorIds]
    : [creatorId];
  
  // Create drop document
  const dropId = generateId();
  const now = new Date();
  
  const drop: Drop = {
    dropId,
    ownerCreatorIds,
    type: data.type,
    title: data.title.trim(),
    description: data.description.trim(),
    coverImageUrl: data.coverImageUrl,
    tags: data.tags.map(t => t.toLowerCase().trim()),
    priceTokens: data.priceTokens,
    maxQuantity: data.maxQuantity ?? null,
    soldCount: 0,
    startAt: data.startAt ?? null,
    endAt: data.endAt ?? null,
    isActive: true,
    is18Plus: data.is18Plus,
    visibility: data.visibility,
    contentItems: data.contentItems,
    lootboxPool: data.lootboxPool,
    coopShares: data.coopShares,
    createdAt: now,
    updatedAt: now,
    totalRevenue: 0,
    uniqueBuyers: 0,
  };
  
  await db.collection('drops').doc(dropId).set({
    ...drop,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  return drop;
}

/**
 * Validate drop input
 */
function validateDropInput(data: CreateDropInput): void {
  // Validate price
  if (data.priceTokens < DROP_CONSTANTS.MIN_PRICE_TOKENS ||
      data.priceTokens > DROP_CONSTANTS.MAX_PRICE_TOKENS) {
    throw new HttpsError(
      'invalid-argument',
      `Price must be between ${DROP_CONSTANTS.MIN_PRICE_TOKENS} and ${DROP_CONSTANTS.MAX_PRICE_TOKENS} tokens`
    );
  }
  
  // Validate title
  if (!data.title || data.title.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Title is required');
  }
  if (data.title.length > DROP_CONSTANTS.MAX_TITLE_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Title must be ${DROP_CONSTANTS.MAX_TITLE_LENGTH} characters or less`
    );
  }
  
  // Validate description
  if (!data.description || data.description.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Description is required');
  }
  if (data.description.length > DROP_CONSTANTS.MAX_DESCRIPTION_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Description must be ${DROP_CONSTANTS.MAX_DESCRIPTION_LENGTH} characters or less`
    );
  }
  
  // Validate tags
  if (data.tags.length > DROP_CONSTANTS.MAX_TAGS) {
    throw new HttpsError(
      'invalid-argument',
      `Maximum ${DROP_CONSTANTS.MAX_TAGS} tags allowed`
    );
  }
  
  // Validate maxQuantity
  if (data.maxQuantity !== undefined && data.maxQuantity !== null && data.maxQuantity < 1) {
    throw new HttpsError('invalid-argument', 'Max quantity must be at least 1 or null for unlimited');
  }
  
  // Validate cover image
  if (!data.coverImageUrl) {
    throw new HttpsError('invalid-argument', 'Cover image is required');
  }
}

/**
 * Validate COOP configuration
 */
function validateCoopConfiguration(
  coopCreatorIds?: string[],
  coopShares?: CoopCreatorShare[]
): void {
  if (!coopCreatorIds || coopCreatorIds.length === 0) {
    throw new HttpsError('invalid-argument', 'COOP drop requires at least one co-creator');
  }
  
  if (!coopShares || coopShares.length === 0) {
    throw new HttpsError('invalid-argument', 'COOP drop requires share percentages');
  }
  
  // Validate shares sum to 100
  const totalShare = coopShares.reduce((sum, share) => sum + share.sharePercentage, 0);
  if (Math.abs(totalShare - 100) > 0.01) {
    throw new HttpsError('invalid-argument', 'COOP shares must sum to 100%');
  }
  
  // Validate all creator IDs in shares exist in coopCreatorIds (plus main creator)
  const allCreatorIds = new Set(coopCreatorIds);
  for (const share of coopShares) {
    if (!allCreatorIds.has(share.creatorId)) {
      throw new HttpsError(
        'invalid-argument',
        `Share specified for unknown creator ${share.creatorId}`
      );
    }
  }
}

/**
 * Validate FLASH time window
 */
function validateFlashTimeWindow(startAt?: Date | null, endAt?: Date | null): void {
  if (!startAt || !endAt) {
    throw new HttpsError('invalid-argument', 'FLASH drop requires start and end times');
  }
  
  const start = startAt instanceof Date ? startAt : new Date(startAt);
  const end = endAt instanceof Date ? endAt : new Date(endAt);
  
  if (start >= end) {
    throw new HttpsError('invalid-argument', 'Start time must be before end time');
  }
  
  if (end <= new Date()) {
    throw new HttpsError('invalid-argument', 'End time must be in the future');
  }
}

/**
 * Validate lootbox pool
 */
function validateLootboxPool(pool?: LootboxPool): void {
  if (!pool || !pool.items || pool.items.length === 0) {
    throw new HttpsError('invalid-argument', 'LOOTBOX drop requires content items');
  }
  
  // Validate weights
  let totalWeight = 0;
  for (const item of pool.items) {
    if (!item.weight || item.weight <= 0) {
      throw new HttpsError('invalid-argument', 'All lootbox items must have positive weight');
    }
    totalWeight += item.weight;
  }
  
  if (Math.abs(totalWeight - (pool.totalWeight || totalWeight)) > 0.01) {
    throw new HttpsError('invalid-argument', 'Lootbox weights do not match total');
  }
}

// ============================================================================
// UPDATE DROP
// ============================================================================

/**
 * Update an existing drop
 * Only the owner creator(s) can update
 */
export async function updateDrop(
  dropId: string,
  creatorId: string,
  updates: UpdateDropInput
): Promise<void> {
  const dropRef = db.collection('drops').doc(dropId);
  const dropSnap = await dropRef.get();
  
  if (!dropSnap.exists) {
    throw new HttpsError('not-found', 'Drop not found');
  }
  
  const drop = dropSnap.data() as Drop;
  
  // Verify creator is owner
  if (!drop.ownerCreatorIds.includes(creatorId)) {
    throw new HttpsError('permission-denied', 'Only drop owners can update');
  }
  
  // Build update object (only allowed fields)
  const updateData: any = {
    updatedAt: serverTimestamp(),
  };
  
  if (updates.title !== undefined) {
    if (updates.title.length > DROP_CONSTANTS.MAX_TITLE_LENGTH) {
      throw new HttpsError('invalid-argument', 'Title too long');
    }
    updateData.title = updates.title.trim();
  }
  
  if (updates.description !== undefined) {
    if (updates.description.length > DROP_CONSTANTS.MAX_DESCRIPTION_LENGTH) {
      throw new HttpsError('invalid-argument', 'Description too long');
    }
    updateData.description = updates.description.trim();
  }
  
  if (updates.coverImageUrl !== undefined) {
    updateData.coverImageUrl = updates.coverImageUrl;
  }
  
  if (updates.tags !== undefined) {
    if (updates.tags.length > DROP_CONSTANTS.MAX_TAGS) {
      throw new HttpsError('invalid-argument', 'Too many tags');
    }
    updateData.tags = updates.tags.map(t => t.toLowerCase().trim());
  }
  
  // Price can only be changed if drop hasn't started yet
  if (updates.priceTokens !== undefined) {
    if (drop.startAt && new Date(drop.startAt as any) <= new Date()) {
      throw new HttpsError('permission-denied', 'Cannot change price after drop has started');
    }
    if (updates.priceTokens < DROP_CONSTANTS.MIN_PRICE_TOKENS ||
        updates.priceTokens > DROP_CONSTANTS.MAX_PRICE_TOKENS) {
      throw new HttpsError('invalid-argument', 'Invalid price');
    }
    updateData.priceTokens = updates.priceTokens;
  }
  
  // Schedule can be changed before start
  if (updates.startAt !== undefined || updates.endAt !== undefined) {
    if (drop.startAt && new Date(drop.startAt as any) <= new Date()) {
      throw new HttpsError('permission-denied', 'Cannot change schedule after drop has started');
    }
    if (updates.startAt !== undefined) {
      updateData.startAt = updates.startAt;
    }
    if (updates.endAt !== undefined) {
      updateData.endAt = updates.endAt;
    }
  }
  
  if (updates.isActive !== undefined) {
    updateData.isActive = updates.isActive;
  }
  
  await dropRef.update(updateData);
}

// ============================================================================
// DELETE/DISABLE DROP
// ============================================================================

/**
 * Soft delete / disable drop
 * Keeps data for past purchases but prevents new purchases
 */
export async function disableDrop(
  dropId: string,
  creatorId: string
): Promise<void> {
  const dropRef = db.collection('drops').doc(dropId);
  const dropSnap = await dropRef.get();
  
  if (!dropSnap.exists) {
    throw new HttpsError('not-found', 'Drop not found');
  }
  
  const drop = dropSnap.data() as Drop;
  
  // Verify creator is owner
  if (!drop.ownerCreatorIds.includes(creatorId)) {
    throw new HttpsError('permission-denied', 'Only drop owners can disable');
  }
  
  await dropRef.update({
    isActive: false,
    updatedAt: serverTimestamp(),
  });
}

// ============================================================================
// GET DROP PUBLIC INFO
// ============================================================================

/**
 * Get public-safe drop information
 */
export async function getDropPublicInfo(dropId: string): Promise<DropPublicInfo> {
  const dropSnap = await db.collection('drops').doc(dropId).get();
  
  if (!dropSnap.exists) {
    throw new HttpsError('not-found', 'Drop not found');
  }
  
  const drop = dropSnap.data() as Drop;
  
  // Get creator names and avatars
  const creatorNames: string[] = [];
  const creatorAvatars: string[] = [];
  
  for (const creatorId of drop.ownerCreatorIds) {
    const creatorSnap = await db.collection('users').doc(creatorId).get();
    if (creatorSnap.exists) {
      const creatorData = creatorSnap.data();
      creatorNames.push(creatorData?.displayName || creatorData?.name || 'Unknown');
      creatorAvatars.push(creatorData?.avatar || creatorData?.profilePicture || '');
    }
  }
  
  // Calculate stock remaining
  const stockRemaining = drop.maxQuantity !== null
    ? Math.max(0, drop.maxQuantity - drop.soldCount)
    : null;
  
  // Calculate time remaining for FLASH drops
  let timeRemaining: number | null = null;
  if (drop.type === 'FLASH_DROP' && drop.endAt) {
    const end = drop.endAt instanceof Date ? drop.endAt : new Date(drop.endAt as any);
    timeRemaining = Math.max(0, end.getTime() - Date.now());
  }
  
  // Determine if drop is available
  const now = new Date();
  let isAvailable = drop.isActive;
  
  if (drop.type === 'FLASH_DROP') {
    const start = drop.startAt instanceof Date ? drop.startAt : new Date(drop.startAt as any);
    const end = drop.endAt instanceof Date ? drop.endAt : new Date(drop.endAt as any);
    isAvailable = isAvailable && now >= start && now <= end;
  }
  
  if (drop.maxQuantity !== null && drop.soldCount >= drop.maxQuantity) {
    isAvailable = false;
  }
  
  // Prepare content preview
  const contentPreview = drop.type === 'LOOTBOX_DROP'
    ? undefined
    : drop.contentItems;
  
  const lootboxCategories = drop.type === 'LOOTBOX_DROP' && drop.lootboxPool
    ? [...new Set(drop.lootboxPool.items.map(item => item.rarity || 'common'))]
    : undefined;
  
  return {
    dropId: drop.dropId,
    ownerCreatorIds: drop.ownerCreatorIds,
    creatorNames,
    creatorAvatars,
    type: drop.type,
    title: drop.title,
    description: drop.description,
    coverImageUrl: drop.coverImageUrl,
    tags: drop.tags,
    priceTokens: drop.priceTokens,
    soldCount: drop.soldCount,
    stockRemaining,
    timeRemaining,
    isAvailable,
    is18Plus: drop.is18Plus,
    contentPreview,
    lootboxCategories,
  };
}

// ============================================================================
// LIST PUBLIC DROPS
// ============================================================================

/**
 * List public drops with filters
 */
export async function listPublicDrops(filters: ListDropsFilters): Promise<DropPublicInfo[]> {
  let query = db.collection('drops').where('visibility', '==', 'public');
  
  // Apply filters
  if (filters.activeOnly !== false) {
    query = query.where('isActive', '==', true);
  }
  
  if (filters.creatorId) {
    query = query.where('ownerCreatorIds', 'array-contains', filters.creatorId);
  }
  
  if (filters.type) {
    query = query.where('type', '==', filters.type);
  }
  
  if (filters.is18Plus !== undefined) {
    query = query.where('is18Plus', '==', filters.is18Plus);
  }
  
  // Get documents
  const snapshot = await query.get();
  const drops: Drop[] = snapshot.docs.map(doc => doc.data() as Drop);
  
  // Filter in memory for remaining conditions
  let filtered = drops;
  
  // Filter by tags
  if (filters.tags && filters.tags.length > 0) {
    filtered = filtered.filter(drop =>
      filters.tags!.some(tag => drop.tags.includes(tag.toLowerCase()))
    );
  }
  
  // Filter by price range
  if (filters.minPrice !== undefined) {
    filtered = filtered.filter(drop => drop.priceTokens >= filters.minPrice!);
  }
  if (filters.maxPrice !== undefined) {
    filtered = filtered.filter(drop => drop.priceTokens <= filters.maxPrice!);
  }
  
  // Filter out drops outside time window (FLASH drops)
  const now = new Date();
  filtered = filtered.filter(drop => {
    if (drop.type === 'FLASH_DROP') {
      const start = drop.startAt instanceof Date ? drop.startAt : new Date(drop.startAt as any);
      const end = drop.endAt instanceof Date ? drop.endAt : new Date(drop.endAt as any);
      return now >= start && now <= end;
    }
    return true;
  });
  
  // Filter out sold-out drops
  filtered = filtered.filter(drop =>
    drop.maxQuantity === null || drop.soldCount < drop.maxQuantity
  );
  
  // Apply pagination
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;
  const paginated = filtered.slice(offset, offset + limit);
  
  // Convert to public info
  const publicInfos = await Promise.all(
    paginated.map(drop => getDropPublicInfo(drop.dropId))
  );
  
  return publicInfos;
}

// ============================================================================
// PURCHASE DROP
// ============================================================================

/**
 * Purchase a drop
 * Main transaction logic with all validations
 */
export async function purchaseDrop(
  userId: string,
  dropId: string,
  deviceId?: string,
  ipHash?: string
): Promise<DropPurchase> {
  // Get drop
  const dropRef = db.collection('drops').doc(dropId);
  const dropSnap = await dropRef.get();
  
  if (!dropSnap.exists) {
    throw new HttpsError('not-found', 'Drop not found');
  }
  
  const drop = dropSnap.data() as Drop;
  
  // Validate 18+ requirement
  if (drop.is18Plus) {
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'User not found');
    }
    const userData = userSnap.data();
    if (!userData?.age18Plus) {
      throw new HttpsError('permission-denied', 'Must be 18+ to purchase this drop');
    }
  }
  
  // Validate drop is active
  if (!drop.isActive) {
    throw new HttpsError('failed-precondition', 'Drop is not active');
  }
  
  // Validate time window for FLASH drops
  if (drop.type === 'FLASH_DROP') {
    const now = new Date();
    const start = drop.startAt instanceof Date ? drop.startAt : new Date(drop.startAt as any);
    const end = drop.endAt instanceof Date ? drop.endAt : new Date(drop.endAt as any);
    
    if (now < start) {
      throw new HttpsError('failed-precondition', 'Drop has not started yet');
    }
    if (now > end) {
      throw new HttpsError('failed-precondition', 'Drop has ended');
    }
  }
  
  // Validate stock
  if (drop.maxQuantity !== null && drop.soldCount >= drop.maxQuantity) {
    throw new HttpsError('failed-precondition', 'Drop is sold out');
  }
  
  // Check user token balance
  const walletRef = db.collection('users').doc(userId).collection('wallet').doc('current');
  const walletSnap = await walletRef.get();
  
  if (!walletSnap.exists) {
    throw new HttpsError('failed-precondition', 'User wallet not found');
  }
  
  const wallet = walletSnap.data();
  const balance = wallet?.balance || 0;
  
  if (balance < drop.priceTokens) {
    throw new HttpsError('failed-precondition', 'Insufficient tokens');
  }
  
  // Calculate revenue split
  const avaloShare = Math.ceil(drop.priceTokens * (DROP_CONSTANTS.AVALO_SHARE_PERCENTAGE / 100));
  const creatorPoolShare = drop.priceTokens - avaloShare;
  
  const revenueSplit: { [creatorId: string]: number; avalo: number } = {
    avalo: avaloShare,
  };
  
  // Split creator share among co-creators for COOP drops
  if (drop.type === 'COOP_DROP' && drop.coopShares) {
    for (const share of drop.coopShares) {
      revenueSplit[share.creatorId] = Math.floor(creatorPoolShare * (share.sharePercentage / 100));
    }
  } else {
    // Single creator gets all creator share
    revenueSplit[drop.ownerCreatorIds[0]] = creatorPoolShare;
  }
  
  // For LOOTBOX: perform random roll
  let resolvedContentItems: ContentItem[];
  if (drop.type === 'LOOTBOX_DROP' && drop.lootboxPool) {
    resolvedContentItems = rollLootbox(drop.lootboxPool);
  } else {
    resolvedContentItems = drop.contentItems || [];
  }
  
  // Execute transaction
  const purchaseId = generateId();
  const purchase: DropPurchase = {
    purchaseId,
    dropId: drop.dropId,
    userId,
    creatorIds: drop.ownerCreatorIds,
    tokensSpent: drop.priceTokens,
    createdAt: new Date(),
    resolvedContentItems,
    revenueSplit,
  };
  
  await db.runTransaction(async (transaction) => {
    // Deduct tokens from user
    transaction.update(walletRef, {
      balance: increment(-drop.priceTokens),
      spent: increment(drop.priceTokens),
    });
    
    // Credit tokens to each creator
    for (const creatorId of drop.ownerCreatorIds) {
      const creatorShare = revenueSplit[creatorId] || 0;
      if (creatorShare > 0) {
        const creatorWalletRef = db.collection('users').doc(creatorId).collection('wallet').doc('current');
        transaction.update(creatorWalletRef, {
          balance: increment(creatorShare),
          earned: increment(creatorShare),
        });
      }
    }
    
    // Update drop stats
    transaction.update(dropRef, {
      soldCount: increment(1),
      totalRevenue: increment(drop.priceTokens),
      updatedAt: serverTimestamp(),
    });
    
    // Write purchase record
    transaction.set(db.collection('dropPurchases').doc(purchaseId), {
      ...purchase,
      createdAt: serverTimestamp(),
    });
    
    // Write user ownership record
    transaction.set(
      db.collection('userDrops').doc(userId).collection('ownedDrops').doc(dropId),
      {
        userId,
        dropId,
        purchaseId,
        purchasedAt: serverTimestamp(),
      }
    );
  });
  
  // Record ranking actions for each creator (async, non-blocking)
  for (const creatorId of drop.ownerCreatorIds) {
    const creatorTokens = revenueSplit[creatorId] || 0;
    if (creatorTokens > 0) {
      recordRankingAction({
        type: 'content_purchase',
        creatorId,
        payerId: userId,
        tokensAmount: creatorTokens,
        points: creatorTokens * DROP_CONSTANTS.RANKING_POINTS_PER_TOKEN,
        timestamp: new Date(),
      }).catch(err => logger.error('Error recording ranking action:', err));
    }
  }
  
  // Record risk event (async, non-blocking)
  recordRiskEvent({
    userId,
    eventType: 'free_pool',
    metadata: {
      dropId,
      tokensSpent: drop.priceTokens,
      deviceId,
      ipHash,
      creatorIds: drop.ownerCreatorIds,
    },
  }).then(() => {
    // Evaluate risk
    evaluateUserRisk(userId).catch(() => {});
  }).catch(err => logger.error('Error recording risk event:', err));
  
  return purchase;
}

/**
 * Roll lootbox to get random items
 */
function rollLootbox(pool: LootboxPool): ContentItem[] {
  const { items, totalWeight } = pool;
  const random = Math.random() * totalWeight;
  
  let cumulative = 0;
  for (const item of items) {
    cumulative += item.weight || 0;
    if (random <= cumulative) {
      return [item]; // Return single item (can be extended to multiple items)
    }
  }
  
  // Fallback: return first item
  return [items[0]];
}

// ============================================================================
// GET USER OWNED DROPS
// ============================================================================

/**
 * Get all drops owned by a user
 */
export async function getUserOwnedDrops(userId: string): Promise<DropPublicInfo[]> {
  const ownedDropsSnapshot = await db
    .collection('userDrops')
    .doc(userId)
    .collection('ownedDrops')
    .get();
  
  const dropIds = ownedDropsSnapshot.docs.map(doc => doc.data().dropId as string);
  
  if (dropIds.length === 0) {
    return [];
  }
  
  // Get public info for each drop
  const drops = await Promise.all(
    dropIds.map(dropId => getDropPublicInfo(dropId))
  );
  
  return drops;
}

// ============================================================================
// CREATOR DASHBOARD
// ============================================================================

/**
 * Get creator's drops with stats
 */
export async function getCreatorDrops(creatorId: string): Promise<Drop[]> {
  const dropsSnapshot = await db
    .collection('drops')
    .where('ownerCreatorIds', 'array-contains', creatorId)
    .get();
  
  return dropsSnapshot.docs.map(doc => doc.data() as Drop);
}