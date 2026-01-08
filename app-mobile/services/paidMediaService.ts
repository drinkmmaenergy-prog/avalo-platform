/**
 * PACK 250 - Paid Media Service
 * Frontend service for token-gated content
 */

import { 
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  updateDoc,
  increment,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../lib/firebase';
import type {
  MediaProductType,
  PaidMediaProduct,
  MediaProductCard,
  PurchaseResult,
  MediaDashboardStats,
  MediaProductFilter,
  PurchasedMediaAccess,
} from '../types/paid-media.types';

const functions = getFunctions();

// ============================================================================
// Cloud Function Calls
// ============================================================================

/**
 * Create a new paid media product
 */
export async function createMediaProduct(productData: {
  productType: MediaProductType;
  title: string;
  description?: string;
  items: any[];
  thumbnailUrl: string;
  previewUrls?: string[];
  priceTokens: number;
  tags?: string[];
  isNSFW: boolean;
}): Promise<{ success: boolean; productId?: string; error?: string }> {
  try {
    const createProduct = httpsCallable(functions, 'createMediaProduct');
    const result = await createProduct(productData);
    
    return result.data as { success: boolean; productId: string };
  } catch (error: any) {
    console.error('Error creating media product:', error);
    return {
      success: false,
      error: error.message || 'Failed to create product',
    };
  }
}

/**
 * Publish a media product
 */
export async function publishMediaProduct(productId: string): Promise<{ 
  success: boolean; 
  error?: string 
}> {
  try {
    const publishProduct = httpsCallable(functions, 'publishMediaProduct');
    const result = await publishProduct({ productId });
    
    return result.data as { success: boolean };
  } catch (error: any) {
    console.error('Error publishing media product:', error);
    return {
      success: false,
      error: error.message || 'Failed to publish product',
    };
  }
}

/**
 * Track impression (view) of a product
 */
export async function trackMediaImpression(productId: string): Promise<void> {
  try {
    const trackImpression = httpsCallable(functions, 'trackMediaImpression');
    await trackImpression({ productId });
  } catch (error) {
    console.error('Error tracking impression:', error);
    // Non-critical, don't throw
  }
}

/**
 * Purchase a paid media product
 */
export async function purchaseMediaProduct(productId: string): Promise<PurchaseResult> {
  try {
    const purchaseProduct = httpsCallable(functions, 'purchaseMediaProduct');
    const result = await purchaseProduct({ productId });
    
    const data = result.data as any;
    
    return {
      success: data.success,
      purchaseId: data.purchaseId,
      accessUrls: data.accessUrls,
      creatorId: data.creatorId, // For "Say Something Now" CTA
    };
  } catch (error: any) {
    console.error('Error purchasing media:', error);
    
    // Map error messages to error codes
    let errorCode: PurchaseResult['errorCode'] = 'UNKNOWN';
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('insufficient')) {
      errorCode = 'INSUFFICIENT_TOKENS';
    } else if (message.includes('already purchased')) {
      errorCode = 'ALREADY_PURCHASED';
    } else if (message.includes('not available') || message.includes('expired')) {
      errorCode = 'PRODUCT_UNAVAILABLE';
    }
    
    return {
      success: false,
      error: error.message || 'Purchase failed',
      errorCode,
    };
  }
}

/**
 * Get access to purchased media
 */
export async function getMediaAccess(productId: string): Promise<{
  success: boolean;
  itemUrls?: string[];
  purchasedAt?: number;
  error?: string;
}> {
  try {
    const getAccess = httpsCallable(functions, 'getMediaAccess');
    const result = await getAccess({ productId });
    
    return result.data as any;
  } catch (error: any) {
    console.error('Error getting media access:', error);
    return {
      success: false,
      error: error.message || 'Failed to get access',
    };
  }
}

/**
 * Get creator's media dashboard stats
 */
export async function getCreatorDashboard(): Promise<MediaDashboardStats | null> {
  try {
    const getDashboard = httpsCallable(functions, 'getCreatorMediaDashboard');
    const result = await getDashboard();
    
    return result.data as MediaDashboardStats;
  } catch (error) {
    console.error('Error getting dashboard:', error);
    return null;
  }
}

/**
 * Get recommended media products
 */
export async function getRecommendedMedia(options?: {
  limit?: number;
  productType?: MediaProductType;
}): Promise<MediaProductCard[]> {
  try {
    const getRecommended = httpsCallable(functions, 'getRecommendedMedia');
    const result = await getRecommended(options || {});
    
    const data = result.data as any;
    return data.products || [];
  } catch (error) {
    console.error('Error getting recommended media:', error);
    return [];
  }
}

// ============================================================================
// Direct Firestore Queries
// ============================================================================

/**
 * Get a single media product by ID
 */
export async function getMediaProduct(productId: string): Promise<PaidMediaProduct | null> {
  try {
    const productDoc = await getDoc(doc(db, 'paid_media_products', productId));
    
    if (!productDoc.exists()) {
      return null;
    }
    
    return productDoc.data() as PaidMediaProduct;
  } catch (error) {
    console.error('Error getting media product:', error);
    return null;
  }
}

/**
 * Get creator's media products
 */
export async function getCreatorProducts(
  creatorId: string,
  filters?: MediaProductFilter
): Promise<PaidMediaProduct[]> {
  try {
    let q = query(
      collection(db, 'paid_media_products'),
      where('creatorId', '==', creatorId),
      orderBy('createdAt', 'desc')
    );
    
    if (filters?.status) {
      q = query(q, where('status', '==', filters.status));
    }
    
    if (filters?.productType) {
      q = query(q, where('productType', '==', filters.productType));
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as PaidMediaProduct);
  } catch (error) {
    console.error('Error getting creator products:', error);
    return [];
  }
}

/**
 * Get user's purchased media
 */
export async function getUserPurchasedMedia(userId: string): Promise<PurchasedMediaAccess[]> {
  try {
    const q = query(
      collection(db, 'purchased_media_access'),
      where('userId', '==', userId),
      orderBy('purchasedAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as PurchasedMediaAccess);
  } catch (error) {
    console.error('Error getting purchased media:', error);
    return [];
  }
}

/**
 * Check if user has purchased a product
 */
export async function hasUserPurchasedProduct(
  userId: string,
  productId: string
): Promise<boolean> {
  try {
    const accessId = `${userId}_${productId}`;
    const accessDoc = await getDoc(doc(db, 'purchased_media_access', accessId));
    
    return accessDoc.exists();
  } catch (error) {
    console.error('Error checking purchase status:', error);
    return false;
  }
}

/**
 * Get popular media products
 */
export async function getPopularMedia(
  productType?: MediaProductType,
  limitCount: number = 20
): Promise<MediaProductCard[]> {
  try {
    let q = query(
      collection(db, 'paid_media_products'),
      where('status', '==', 'PUBLISHED'),
      orderBy('salesCount', 'desc'),
      limit(limitCount)
    );
    
    if (productType) {
      q = query(
        collection(db, 'paid_media_products'),
        where('status', '==', 'PUBLISHED'),
        where('productType', '==', productType),
        orderBy('salesCount', 'desc'),
        limit(limitCount)
      );
    }
    
    const snapshot = await getDocs(q);
    
    // Transform to MediaProductCard
    const products = await Promise.all(
      snapshot.docs.map(async (productDoc) => {
        const product = productDoc.data() as PaidMediaProduct;
        
        // Get creator info
        const creatorDoc = await getDoc(doc(db, 'users', product.creatorId));
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
          isLocked: true, // Will be updated by component
          isPurchased: false, // Will be updated by component
          itemCount: product.items.length,
          expiresAt: product.expiresAt?.toMillis(),
          isExpiringSoon: product.expiresAt 
            ? (product.expiresAt.toMillis() - Date.now()) < 2 * 60 * 60 * 1000
            : false,
        } as MediaProductCard;
      })
    );
    
    return products;
  } catch (error) {
    console.error('Error getting popular media:', error);
    return [];
  }
}

/**
 * Get new/recent media products
 */
export async function getNewMedia(
  productType?: MediaProductType,
  limitCount: number = 20
): Promise<MediaProductCard[]> {
  try {
    let q = query(
      collection(db, 'paid_media_products'),
      where('status', '==', 'PUBLISHED'),
      orderBy('publishedAt', 'desc'),
      limit(limitCount)
    );
    
    if (productType) {
      q = query(
        collection(db, 'paid_media_products'),
        where('status', '==', 'PUBLISHED'),
        where('productType', '==', productType),
        orderBy('publishedAt', 'desc'),
        limit(limitCount)
      );
    }
    
    const snapshot = await getDocs(q);
    
    // Transform to MediaProductCard
    const products = await Promise.all(
      snapshot.docs.map(async (productDoc) => {
        const product = productDoc.data() as PaidMediaProduct;
        
        // Get creator info
        const creatorDoc = await getDoc(doc(db, 'users', product.creatorId));
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
          isLocked: true,
          isPurchased: false,
          itemCount: product.items.length,
          expiresAt: product.expiresAt?.toMillis(),
          isExpiringSoon: product.expiresAt 
            ? (product.expiresAt.toMillis() - Date.now()) < 2 * 60 * 60 * 1000
            : false,
        } as MediaProductCard;
      })
    );
    
    return products;
  } catch (error) {
    console.error('Error getting new media:', error);
    return [];
  }
}

/**
 * Search media products by creator
 */
export async function searchMediaByCreator(
  creatorId: string,
  limitCount: number = 20
): Promise<MediaProductCard[]> {
  try {
    const q = query(
      collection(db, 'paid_media_products'),
      where('creatorId', '==', creatorId),
      where('status', '==', 'PUBLISHED'),
      orderBy('salesCount', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    
    // Get creator info once
    const creatorDoc = await getDoc(doc(db, 'users', creatorId));
    const creator = creatorDoc.data();
    
    const products = snapshot.docs.map((productDoc) => {
      const product = productDoc.data() as PaidMediaProduct;
      
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
        isLocked: true,
        isPurchased: false,
        itemCount: product.items.length,
        expiresAt: product.expiresAt?.toMillis(),
        isExpiringSoon: product.expiresAt 
          ? (product.expiresAt.toMillis() - Date.now()) < 2 * 60 * 60 * 1000
          : false,
      } as MediaProductCard;
    });
    
    return products;
  } catch (error) {
    console.error('Error searching media by creator:', error);
    return [];
  }
}

/**
 * Get active story drops
 */
export async function getActiveStoryDrops(limitCount: number = 10): Promise<MediaProductCard[]> {
  try {
    const q = query(
      collection(db, 'story_drops'),
      where('status', '==', 'ACTIVE'),
      orderBy('expiresAt', 'asc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    
    // Get products for each story
    const products = await Promise.all(
      snapshot.docs.map(async (storyDoc) => {
        const story = storyDoc.data();
        const productDoc = await getDoc(doc(db, 'paid_media_products', story.productId));
        
        if (!productDoc.exists()) {
          return null;
        }
        
        const product = productDoc.data() as PaidMediaProduct;
        
        // Get creator info
        const creatorDoc = await getDoc(doc(db, 'users', product.creatorId));
        const creator = creatorDoc.data();
        
        return {
          productId: product.productId,
          creatorId: product.creatorId,
          creatorName: creator?.displayName || 'Unknown',
          creatorAvatar: creator?.photoURL || '',
          productType: 'STORY_DROP' as MediaProductType,
          title: product.title,
          thumbnailUrl: product.thumbnailUrl,
          priceTokens: product.priceTokens,
          salesCount: product.salesCount,
          isLocked: true,
          isPurchased: false,
          itemCount: product.items.length,
          expiresAt: product.expiresAt?.toMillis(),
          isExpiringSoon: product.expiresAt 
            ? (product.expiresAt.toMillis() - Date.now()) < 2 * 60 * 60 * 1000
            : false,
        } as MediaProductCard;
      })
    );
    
    // Filter out nulls
    return products.filter(p => p !== null) as MediaProductCard[];
  } catch (error) {
    console.error('Error getting story drops:', error);
    return [];
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format time remaining for story drops
 */
export function getTimeRemaining(expiresAt: number): string {
  const now = Date.now();
  const diff = expiresAt - now;
  
  if (diff <= 0) {
    return 'Expired';
  }
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  
  return `${minutes}m`;
}

/**
 * Get product type display name
 */
export function getProductTypeLabel(type: MediaProductType): string {
  const labels: Record<MediaProductType, string> = {
    SINGLE_PHOTO: 'Photo',
    SINGLE_VIDEO: 'Video',
    ALBUM: 'Album',
    VIDEO_SERIES: 'Video Series',
    STORY_DROP: 'Story',
    BUNDLE: 'Bundle',
  };
  
  return labels[type] || type;
}

/**
 * Get product type icon
 */
export function getProductTypeIcon(type: MediaProductType): string {
  const icons: Record<MediaProductType, string> = {
    SINGLE_PHOTO: '📸',
    SINGLE_VIDEO: '🎥',
    ALBUM: '🖼️',
    VIDEO_SERIES: '📹',
    STORY_DROP: '⚡',
    BUNDLE: '📦',
  };
  
  return icons[type] || '📄';
}