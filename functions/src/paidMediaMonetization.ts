/**
 * PACK 250 - Paid Media Unlock 2.0
 * Token-Gated Albums, Bundles & Story Drops
 * 
 * Backend Cloud Functions for paid media monetization
 */

import { 
  FieldValue, 
  getFirestore, 
  Timestamp 
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall } from 'firebase-functions/v2/https';
import * as crypto from 'crypto';

// ============================================================================
// Configuration Constants
// ============================================================================

const CONFIG = {
  MIN_PRICE_TOKENS: 80,
  MAX_PRICE_TOKENS: 1000,
  CREATOR_CUT_PERCENT: 65,
  AVALO_CUT_PERCENT: 35,
  STORY_EXPIRY_HOURS: 24,
  FARMING_THRESHOLD_PURCHASES: 5,
  MAX_PURCHASES_PER_DAY: 50,
  DISCOVERY_SCORE_WEIGHTS: {
    SALES_COUNT: 0.3,
    UNIQUE_BUYERS: 0.25,
    RECENT_ACTIVITY: 0.2,
    QUALITY_SCORE: 0.15,
    ANTI_FARMING: 0.1,
  },
} as const;

const db = getFirestore();

// ============================================================================
// Type Definitions
// ============================================================================

type MediaProductType = 
  | 'SINGLE_PHOTO' 
  | 'SINGLE_VIDEO' 
  | 'ALBUM' 
  | 'VIDEO_SERIES' 
  | 'STORY_DROP' 
  | 'BUNDLE';

interface MediaItem {
  id: string;
  type: 'photo' | 'video';
  url: string;
  thumbnailUrl?: string;
  blurredPreviewUrl?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  fileSize: number;
  uploadedAt: Timestamp;
}

interface PaidMediaProduct {
  productId: string;
  creatorId: string;
  productType: MediaProductType;
  title: string;
  description?: string;
  items: MediaItem[];
  thumbnailUrl: string;
  previewUrls?: string[];
  priceTokens: number;
  salesCount: number;
  uniqueBuyersCount: number;
  totalRevenue: number;
  impressions: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'UNDER_REVIEW';
  tags?: string[];
  isNSFW: boolean;
  isFeatured?: boolean;
  expiresAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt?: Timestamp;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate perceptual hash for content validation
 * (Simplified - in production use proper image hashing library)
 */
function generatePerceptualHash(content: Buffer): string {
  const hash = crypto.createHash('sha256');
  hash.update(content);
  return hash.digest('hex').substring(0, 16);
}

/**
 * Check if user has already purchased a product
 */
async function hasUserPurchased(
  userId: string, 
  productId: string
): Promise<boolean> {
  const accessId = `${userId}_${productId}`;
  const accessDoc = await db
    .collection('purchased_media_access')
    .doc(accessId)
    .get();
  
  return accessDoc.exists;
}

/**
 * Get user's wallet balance
 */
async function getWalletBalance(userId: string): Promise<number> {
  const walletDoc = await db
    .collection('users')
    .doc(userId)
    .collection('wallet')
    .doc('main')
    .get();
  
  return walletDoc.data()?.balance || 0;
}

/**
 * Check anti-farming: has buyer purchased too much from this creator?
 */
async function checkFarmingRisk(
  buyerId: string,
  creatorId: string
): Promise<{ isSuspicious: boolean; purchaseCount: number }> {
  const purchases = await db
    .collection('media_purchases')
    .where('buyerId', '==', buyerId)
    .where('creatorId', '==', creatorId)
    .where('status', '==', 'COMPLETED')
    .get();
  
  const purchaseCount = purchases.size;
  const isSuspicious = purchaseCount >= CONFIG.FARMING_THRESHOLD_PURCHASES;
  
  return { isSuspicious, purchaseCount };
}

/**
 * Check daily purchase limit
 */
async function checkDailyPurchaseLimit(buyerId: string): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const purchases = await db
    .collection('media_purchases')
    .where('buyerId', '==', buyerId)
    .where('purchasedAt', '>=', Timestamp.fromDate(today))
    .get();
  
  return purchases.size < CONFIG.MAX_PURCHASES_PER_DAY;
}

// ============================================================================
// Core Functions: Product Management
// ============================================================================

/**
 * Create a new paid media product
 */
const createMediaProduct = onCall(async (request) => {
  const { auth, data } = request;
  
  if (!auth) {
    throw new Error('Authentication required');
  }
  
  const {
    productType,
    title,
    description,
    items,
    thumbnailUrl,
    previewUrls,
    priceTokens,
    tags,
    isNSFW,
  } = data as {
    productType: MediaProductType;
    title: string;
    description?: string;
    items: MediaItem[];
    thumbnailUrl: string;
    previewUrls?: string[];
    priceTokens: number;
    tags?: string[];
    isNSFW: boolean;
  };
  
  // Validate price range
  if (priceTokens < CONFIG.MIN_PRICE_TOKENS || priceTokens > CONFIG.MAX_PRICE_TOKENS) {
    throw new Error(`Price must be between ${CONFIG.MIN_PRICE_TOKENS} and ${CONFIG.MAX_PRICE_TOKENS} tokens`);
  }
  
  // Validate items count based on product type
  const itemLimits: Record<MediaProductType, { min: number; max: number }> = {
    SINGLE_PHOTO: { min: 1, max: 1 },
    SINGLE_VIDEO: { min: 1, max: 1 },
    ALBUM: { min: 5, max: 30 },
    VIDEO_SERIES: { min: 3, max: 10 },
    STORY_DROP: { min: 1, max: 10 },
    BUNDLE: { min: 2, max: 20 },
  };
  
  const limits = itemLimits[productType];
  if (items.length < limits.min || items.length > limits.max) {
    throw new Error(`${productType} requires ${limits.min}-${limits.max} items`);
  }
  
  // Create product document
  const productRef = db.collection('paid_media_products').doc();
  const now = Timestamp.now();
  
  const expiresAt = productType === 'STORY_DROP' 
    ? Timestamp.fromMillis(now.toMillis() + CONFIG.STORY_EXPIRY_HOURS * 60 * 60 * 1000)
    : undefined;
  
  const product: PaidMediaProduct = {
    productId: productRef.id,
    creatorId: auth.uid,
    productType,
    title,
    description,
    items,
    thumbnailUrl,
    previewUrls,
    priceTokens,
    salesCount: 0,
    uniqueBuyersCount: 0,
    totalRevenue: 0,
    impressions: 0,
    status: 'DRAFT',
    tags,
    isNSFW,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  };
  
  await productRef.set(product);
  
  logger.info(`Created media product ${productRef.id} by ${auth.uid}`);
  
  return { 
    success: true, 
    productId: productRef.id,
    expiresAt: expiresAt?.toMillis(),
  };
});

/**
 * Publish a media product (make it available for purchase)
 */
const publishMediaProduct = onCall(async (request) => {
  const { auth, data } = request;
  
  if (!auth) {
    throw new Error('Authentication required');
  }
  
  const { productId } = data as { productId: string };
  
  const productRef = db.collection('paid_media_products').doc(productId);
  const productDoc = await productRef.get();
  
  if (!productDoc.exists) {
    throw new Error('Product not found');
  }
  
  const product = productDoc.data() as PaidMediaProduct;
  
  if (product.creatorId !== auth.uid) {
    throw new Error('Unauthorized: You can only publish your own products');
  }
  
  if (product.status !== 'DRAFT') {
    throw new Error('Product can only be published from DRAFT status');
  }
  
  // Run NSFW check if needed (integrate with PACK 249)
  if (product.isNSFW) {
    // Content moderation would go here
    logger.info(`NSFW product ${productId} flagged for review`);
  }
  
  await productRef.update({
    status: 'PUBLISHED',
    publishedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  
  // If story drop, create story_drops entry
  if (product.productType === 'STORY_DROP') {
    await db.collection('story_drops').doc(productId).set({
      storyId: productId,
      productId,
      creatorId: product.creatorId,
      items: product.items,
      buyerIds: [],
      viewCount: 0,
      status: 'ACTIVE',
      expiresAt: product.expiresAt,
      createdAt: Timestamp.now(),
    });
  }
  
  logger.info(`Published media product ${productId}`);
  
  return { success: true };
});

/**
 * Update product impressions (view tracking)
 */
const trackMediaImpression = onCall(async (request) => {
  const { auth, data } = request;
  
  if (!auth) {
    throw new Error('Authentication required');
  }
  
  const { productId } = data as { productId: string };
  
  await db.collection('paid_media_products').doc(productId).update({
    impressions: FieldValue.increment(1),
  });
  
  return { success: true };
});

// ============================================================================
// Core Functions: Purchase Flow
// ============================================================================

/**
 * Purchase a paid media product
 */
const purchaseMediaProduct = onCall(async (request) => {
  const { auth, data } = request;
  
  if (!auth) {
    throw new Error('Authentication required');
  }
  
  const { productId } = data as { productId: string };
  
  // Get product
  const productRef = db.collection('paid_media_products').doc(productId);
  const productDoc = await productRef.get();
  
  if (!productDoc.exists) {
    throw new Error('Product not found');
  }
  
  const product = productDoc.data() as PaidMediaProduct;
  
  // Validate product status
  if (product.status !== 'PUBLISHED') {
    throw new Error('Product is not available for purchase');
  }
  
  // Check if story has expired
  if (product.productType === 'STORY_DROP' && product.expiresAt) {
    if (product.expiresAt.toMillis() < Date.now()) {
      throw new Error('This story has expired');
    }
  }
  
  // Prevent self-purchase
  if (product.creatorId === auth.uid) {
    throw new Error('You cannot purchase your own content');
  }
  
  // Check if already purchased
  if (await hasUserPurchased(auth.uid, productId)) {
    throw new Error('You have already purchased this product');
  }
  
  // Check daily limit
  if (!(await checkDailyPurchaseLimit(auth.uid))) {
    throw new Error('Daily purchase limit reached. Please try again tomorrow.');
  }
  
  // Check wallet balance
  const balance = await getWalletBalance(auth.uid);
  if (balance < product.priceTokens) {
    throw new Error('Insufficient tokens');
  }
  
  // Check farming risk
  const farmingCheck = await checkFarmingRisk(auth.uid, product.creatorId);
  
  // Perform transaction
  const purchaseRef = db.collection('media_purchases').doc();
  const accessId = `${auth.uid}_${productId}`;
  
  const creatorEarnings = Math.floor(product.priceTokens * CONFIG.CREATOR_CUT_PERCENT / 100);
  const platformFee = product.priceTokens - creatorEarnings;
  
  try {
    await db.runTransaction(async (transaction) => {
      // Deduct from buyer's wallet
      const buyerWalletRef = db
        .collection('users')
        .doc(auth.uid)
        .collection('wallet')
        .doc('main');
      
      transaction.update(buyerWalletRef, {
        balance: FieldValue.increment(-product.priceTokens),
        updatedAt: Timestamp.now(),
      });
      
      // Add to creator's wallet
      const creatorWalletRef = db
        .collection('users')
        .doc(product.creatorId)
        .collection('wallet')
        .doc('main');
      
      transaction.update(creatorWalletRef, {
        balance: FieldValue.increment(creatorEarnings),
        updatedAt: Timestamp.now(),
      });
      
      // Create purchase record
      transaction.set(purchaseRef, {
        purchaseId: purchaseRef.id,
        productId,
        buyerId: auth.uid,
        creatorId: product.creatorId,
        priceTokens: product.priceTokens,
        creatorEarnings,
        platformFee,
        productSnapshot: {
          title: product.title,
          productType: product.productType,
          itemCount: product.items.length,
        },
        status: 'COMPLETED',
        purchasedAt: Timestamp.now(),
      });
      
      // Grant lifetime access
      const accessRef = db.collection('purchased_media_access').doc(accessId);
      transaction.set(accessRef, {
        accessId,
        userId: auth.uid,
        productId,
        creatorId: product.creatorId,
        purchaseId: purchaseRef.id,
        productType: product.productType,
        itemUrls: product.items.map(item => item.url),
        purchasedAt: Timestamp.now(),
        accessCount: 0,
      });
      
      // Update product stats
      transaction.update(productRef, {
        salesCount: FieldValue.increment(1),
        totalRevenue: FieldValue.increment(product.priceTokens),
        updatedAt: Timestamp.now(),
      });
      
      // Create earning record
      const earningRef = db.collection('creator_media_earnings').doc();
      transaction.set(earningRef, {
        earningId: earningRef.id,
        creatorId: product.creatorId,
        purchaseId: purchaseRef.id,
        productId,
        tokensEarned: creatorEarnings,
        status: 'PENDING',
        earnedAt: Timestamp.now(),
      });
      
      // Create transaction records
      const buyerTxRef = db.collection('transactions').doc();
      transaction.set(buyerTxRef, {
        transactionId: buyerTxRef.id,
        userId: auth.uid,
        type: 'media_purchase',
        amount: -product.priceTokens,
        balanceBefore: balance,
        balanceAfter: balance - product.priceTokens,
        metadata: {
          productId,
          creatorId: product.creatorId,
          productType: product.productType,
        },
        createdAt: Timestamp.now(),
      });
      
      const creatorTxRef = db.collection('transactions').doc();
      transaction.set(creatorTxRef, {
        transactionId: creatorTxRef.id,
        userId: product.creatorId,
        type: 'media_earning',
        amount: creatorEarnings,
        metadata: {
          productId,
          buyerId: auth.uid,
          purchaseId: purchaseRef.id,
        },
        createdAt: Timestamp.now(),
      });
      
      // If story drop, add buyer to list
      if (product.productType === 'STORY_DROP') {
        const storyRef = db.collection('story_drops').doc(productId);
        transaction.update(storyRef, {
          buyerIds: FieldValue.arrayUnion(auth.uid),
          updatedAt: Timestamp.now(),
        });
      }
    });
    
    // Update unique buyers count (separate query to avoid transaction conflicts)
    await updateUniqueBuyersCount(productId);
    
    // Update discovery score for creator
    await updateDiscoveryScore(product.creatorId);
    
    // Log farming risk if suspicious
    if (farmingCheck.isSuspicious) {
      logger.warn(`Potential farming detected: buyer ${auth.uid} has ${farmingCheck.purchaseCount} purchases from creator ${product.creatorId}`);
    }
    
    logger.info(`Media purchase completed: ${purchaseRef.id}`);
    
    return {
      success: true,
      purchaseId: purchaseRef.id,
      accessUrls: product.items.map(item => item.url),
      creatorId: product.creatorId, // For "Say Something Now" CTA
    };
    
  } catch (error) {
    logger.error('Purchase transaction failed:', error);
    throw new Error('Purchase failed. Please try again.');
  }
});

/**
 * Get purchased media access
 */
const getMediaAccess = onCall(async (request) => {
  const { auth, data } = request;
  
  if (!auth) {
    throw new Error('Authentication required');
  }
  
  const { productId } = data as { productId: string };
  const accessId = `${auth.uid}_${productId}`;
  
  const accessDoc = await db
    .collection('purchased_media_access')
    .doc(accessId)
    .get();
  
  if (!accessDoc.exists) {
    throw new Error('Access denied: Product not purchased');
  }
  
  // Update access count
  await accessDoc.ref.update({
    lastAccessedAt: Timestamp.now(),
    accessCount: FieldValue.increment(1),
  });
  
  const access = accessDoc.data();
  
  return {
    success: true,
    itemUrls: access?.itemUrls || [],
    purchasedAt: access?.purchasedAt?.toMillis(),
  };
});

// ============================================================================
// Analytics Functions
// ============================================================================

/**
 * Update unique buyers count for a product
 */
async function updateUniqueBuyersCount(productId: string): Promise<void> {
  const purchases = await db
    .collection('media_purchases')
    .where('productId', '==', productId)
    .where('status', '==', 'COMPLETED')
    .get();
  
  const uniqueBuyers = new Set<string>();
  purchases.forEach(doc => {
    uniqueBuyers.add(doc.data().buyerId);
  });
  
  await db.collection('paid_media_products').doc(productId).update({
    uniqueBuyersCount: uniqueBuyers.size,
  });
}

/**
 * Get creator dashboard stats
 */
const getCreatorMediaDashboard = onCall(async (request) => {
  const { auth } = request;
  
  if (!auth) {
    throw new Error('Authentication required');
  }
  
  // Get all creator's products
  const productsSnapshot = await db
    .collection('paid_media_products')
    .where('creatorId', '==', auth.uid)
    .get();
  
  const products = productsSnapshot.docs.map(doc => doc.data() as PaidMediaProduct);
  
  // Calculate stats
  const totalEarnings = products.reduce((sum, p) => sum + (p.totalRevenue * CONFIG.CREATOR_CUT_PERCENT / 100), 0);
  const totalSales = products.reduce((sum, p) => sum + p.salesCount, 0);
  const totalProducts = products.length;
  const publishedProducts = products.filter(p => p.status === 'PUBLISHED').length;
  const draftProducts = products.filter(p => p.status === 'DRAFT').length;
  
  // Get earnings from last periods
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
  
  const earningsSnapshot = await db
    .collection('creator_media_earnings')
    .where('creatorId', '==', auth.uid)
    .where('status', '==', 'PENDING')
    .get();
  
  let earningsToday = 0;
  let earningsThisWeek = 0;
  let earningsThisMonth = 0;
  
  earningsSnapshot.forEach(doc => {
    const earning = doc.data();
    const earnedAtMillis = earning.earnedAt.toMillis();
    
    if (earnedAtMillis >= oneDayAgo) earningsToday += earning.tokensEarned;
    if (earnedAtMillis >= oneWeekAgo) earningsThisWeek += earning.tokensEarned;
    if (earnedAtMillis >= oneMonthAgo) earningsThisMonth += earning.tokensEarned;
  });
  
  // Get unique buyers
  const purchasesSnapshot = await db
    .collection('media_purchases')
    .where('creatorId', '==', auth.uid)
    .where('status', '==', 'COMPLETED')
    .get();
  
  const uniqueBuyers = new Set<string>();
  let salesToday = 0;
  
  purchasesSnapshot.forEach(doc => {
    const purchase = doc.data();
    uniqueBuyers.add(purchase.buyerId);
    
    if (purchase.purchasedAt.toMillis() >= oneDayAgo) {
      salesToday++;
    }
  });
  
  // Top selling products
  const topProducts = products
    .filter(p => p.salesCount > 0)
    .sort((a, b) => b.salesCount - a.salesCount)
    .slice(0, 5)
    .map(p => ({
      productId: p.productId,
      title: p.title,
      sales: p.salesCount,
      revenue: Math.floor(p.totalRevenue * CONFIG.CREATOR_CUT_PERCENT / 100),
    }));
  
  const averageSalePrice = totalSales > 0 ? totalEarnings / totalSales : 0;
  
  return {
    totalEarnings: Math.floor(totalEarnings),
    earningsToday,
    earningsThisWeek,
    earningsThisMonth,
    totalSales,
    salesToday,
    uniqueBuyers: uniqueBuyers.size,
    totalProducts,
    publishedProducts,
    draftProducts,
    averageSalePrice: Math.floor(averageSalePrice),
    topSellingProducts: topProducts,
  };
});

/**
 * Generate daily analytics
 */
const generateDailyAnalytics = onSchedule(
  { schedule: 'every day 02:00', timeZone: 'UTC' },
  async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dateStr = yesterday.toISOString().split('T')[0];
    
    // Get all creators with sales yesterday
    const purchasesSnapshot = await db
      .collection('media_purchases')
      .where('purchasedAt', '>=', Timestamp.fromDate(yesterday))
      .where('purchasedAt', '<', Timestamp.fromDate(today))
      .where('status', '==', 'COMPLETED')
      .get();
    
    const creatorStats = new Map<string, any>();
    
    purchasesSnapshot.forEach(doc => {
      const purchase = doc.data();
      const creatorId = purchase.creatorId;
      
      if (!creatorStats.has(creatorId)) {
        creatorStats.set(creatorId, {
          totalSales: 0,
          totalRevenue: 0,
          uniqueBuyers: new Set<string>(),
          productTypes: new Map<string, number>(),
          products: new Map<string, { sales: number; revenue: number }>(),
        });
      }
      
      const stats = creatorStats.get(creatorId);
      stats.totalSales++;
      stats.totalRevenue += purchase.creatorEarnings;
      stats.uniqueBuyers.add(purchase.buyerId);
      
      const productType = purchase.productSnapshot.productType;
      stats.productTypes.set(productType, (stats.productTypes.get(productType) || 0) + 1);
      
      const productId = purchase.productId;
      const productStats = stats.products.get(productId) || { sales: 0, revenue: 0 };
      productStats.sales++;
      productStats.revenue += purchase.creatorEarnings;
      stats.products.set(productId, productStats);
    });
    
    // Save analytics for each creator
    const batch = db.batch();
    
    const creatorEntries = Array.from(creatorStats.entries());
    for (const [creatorId, stats] of creatorEntries) {
      const analyticsRef = db.collection('media_sales_analytics').doc(`${creatorId}_${dateStr}`);
      
      const salesByProductType: Record<string, number> = {};
      stats.productTypes.forEach((count: number, type: string) => {
        salesByProductType[type] = count;
      });
      
      const topProducts = Array.from(stats.products.entries())
        .sort((a, b) => b[1].sales - a[1].sales)
        .slice(0, 10)
        .map(([productId, data]) => ({
          productId,
          sales: data.sales,
          revenue: data.revenue,
        }));
      
      batch.set(analyticsRef, {
        analyticsId: analyticsRef.id,
        creatorId,
        date: dateStr,
        totalSales: stats.totalSales,
        totalRevenue: stats.totalRevenue,
        uniqueBuyers: stats.uniqueBuyers.size,
        impressions: 0, // Would need separate tracking
        clickThroughRate: 0,
        conversionRate: 0,
        salesByProductType,
        topProducts,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }
    
    await batch.commit();
    
    logger.info(`Generated daily analytics for ${creatorStats.size} creators`);
  }
);

// ============================================================================
// Discovery Algorithm
// ============================================================================

/**
 * Update discovery score for a creator
 */
async function updateDiscoveryScore(creatorId: string): Promise<void> {
  // Get purchases
  const purchasesSnapshot = await db
    .collection('media_purchases')
    .where('creatorId', '==', creatorId)
    .where('status', '==', 'COMPLETED')
    .get();
  
  const totalSales = purchasesSnapshot.size;
  const uniqueBuyers = new Set<string>();
  const buyerPurchaseCounts = new Map<string, number>();
  
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let recentSales = 0;
  let recentRevenue = 0;
  
  purchasesSnapshot.forEach(doc => {
    const purchase = doc.data();
    uniqueBuyers.add(purchase.buyerId);
    
    buyerPurchaseCounts.set(
      purchase.buyerId, 
      (buyerPurchaseCounts.get(purchase.buyerId) || 0) + 1
    );
    
    if (purchase.purchasedAt.toMillis() >= sevenDaysAgo) {
      recentSales++;
      recentRevenue += purchase.creatorEarnings;
    }
  });
  
  // Calculate repeat purchase rate
  const repeatBuyers = Array.from(buyerPurchaseCounts.values()).filter(count => count > 1).length;
  const repeatPurchaseRate = uniqueBuyers.size > 0 ? repeatBuyers / uniqueBuyers.size : 0;
  
  // Calculate farming score (suspicious buyers)
  let suspiciousBuyerCount = 0;
  buyerPurchaseCounts.forEach(count => {
    if (count >= CONFIG.FARMING_THRESHOLD_PURCHASES) {
      suspiciousBuyerCount++;
    }
  });
  
  const farmingScore = uniqueBuyers.size > 0 
    ? Math.min(100, (suspiciousBuyerCount / uniqueBuyers.size) * 100)
    : 0;
  
  // Get refund data
  const refundsSnapshot = await db
    .collection('media_purchases')
    .where('creatorId', '==', creatorId)
    .where('status', '==', 'REFUNDED')
    .get();
  
  const refundRate = totalSales > 0 ? refundsSnapshot.size / totalSales : 0;
  
  // Calculate discovery score
  const weights = CONFIG.DISCOVERY_SCORE_WEIGHTS;
  
  const salesScore = Math.min(1000, totalSales * 10);
  const buyerScore = uniqueBuyers.size * 20;
  const recentActivityScore = recentSales * 15;
  const qualityScore = (1 - refundRate) * 200;
  const antiFarmingPenalty = farmingScore * -5;
  
  const discoveryScore = Math.max(0, Math.floor(
    salesScore * weights.SALES_COUNT +
    buyerScore * weights.UNIQUE_BUYERS +
    recentActivityScore * weights.RECENT_ACTIVITY +
    qualityScore * weights.QUALITY_SCORE +
    antiFarmingPenalty * weights.ANTI_FARMING
  ));
  
  // Save discovery score
  await db.collection('user_media_discovery_score').doc(creatorId).set({
    userId: creatorId,
    totalSales,
    uniqueBuyers: uniqueBuyers.size,
    repeatPurchaseRate,
    recentSales,
    recentRevenue,
    refundRate,
    complaintCount: 0, // Would integrate with PACK 209
    suspiciousBuyerCount,
    farmingScore,
    discoveryScore,
    lastCalculatedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  
  logger.info(`Updated discovery score for ${creatorId}: ${discoveryScore}`);
}

/**
 * Get recommended media products based on discovery algorithm
 */
const getRecommendedMedia = onCall(async (request) => {
  const { auth, data } = request;
  
  if (!auth) {
    throw new Error('Authentication required');
  }
  
  const { limit = 20, productType } = data as { 
    limit?: number; 
    productType?: MediaProductType;
  };
  
  // Get top discovery scores
  let query: any = db
    .collection('user_media_discovery_score')
    .orderBy('discoveryScore', 'desc')
    .limit(limit * 2); // Get more to filter
  
  const scoresSnapshot = await query.get();
  const topCreatorIds = scoresSnapshot.docs.map(doc => doc.data().userId);
  
  // Get products from top creators
  let productsQuery: any = db
    .collection('paid_media_products')
    .where('status', '==', 'PUBLISHED')
    .where('creatorId', 'in', topCreatorIds.slice(0, 10)); // Firestore limit
  
  if (productType) {
    productsQuery = productsQuery.where('productType', '==', productType);
  }
  
  const productsSnapshot = await productsQuery
    .orderBy('salesCount', 'desc')
    .limit(limit)
    .get();
  
  const products = await Promise.all(
    productsSnapshot.docs.map(async doc => {
      const product = doc.data() as PaidMediaProduct;
      const isPurchased = await hasUserPurchased(auth.uid, product.productId);
      
      // Get creator info
      const creatorDoc = await db.collection('users').doc(product.creatorId).get();
      const creator = creatorDoc.data();
      
      return {
        productId: product.productId,
        creatorId: product.creatorId,
        creatorName: creator?.displayName || 'Unknown',
        creatorAvatar: creator?.photoURL || '',
        productType: product.productType,
        title: product.title,
        thumbnailUrl: product.thumbnailUrl,
        priceTokens: product.priceTokens,
        salesCount: product.salesCount,
        isLocked: !isPurchased,
        isPurchased,
        itemCount: product.items.length,
        expiresAt: product.expiresAt?.toMillis(),
        isExpiringSoon: product.expiresAt 
          ? (product.expiresAt.toMillis() - Date.now()) < 2 * 60 * 60 * 1000
          : false,
      };
    })
  );
  
  return { success: true, products };
});

// ============================================================================
// Story Drop Management
// ============================================================================

/**
 * Expire old story drops
 */
const expireStoryDrops = onSchedule(
  { schedule: 'every 1 hours' },
  async () => {
    const now = Timestamp.now();
    
    // Find expired stories
    const expiredStories = await db
      .collection('story_drops')
      .where('status', '==', 'ACTIVE')
      .where('expiresAt', '<=', now)
      .get();
    
    const batch = db.batch();
    
    expiredStories.forEach(doc => {
      batch.update(doc.ref, {
        status: 'EXPIRED',
        expiredAt: now,
      });
    });
    
    // Also update products
    expiredStories.forEach(doc => {
      const productRef = db.collection('paid_media_products').doc(doc.data().productId);
      batch.update(productRef, {
        status: 'ARCHIVED',
        updatedAt: now,
      });
    });
    
    await batch.commit();
    
    logger.info(`Expired ${expiredStories.size} story drops`);
  }
);

// ============================================================================
// Export Functions
// ============================================================================

export {
  // Product management
  createMediaProduct,
  publishMediaProduct,
  trackMediaImpression,
  
  // Purchase flow
  purchaseMediaProduct,
  getMediaAccess,
  
  // Analytics
  getCreatorMediaDashboard,
  generateDailyAnalytics,
  
  // Discovery
  getRecommendedMedia,
  
  // Scheduled tasks
  expireStoryDrops,
};