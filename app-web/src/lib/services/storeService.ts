"use client";

/**
 * Digital Product Store Service
 * Handles unlockable media, token pricing, ownership tracking, NFT-ready interface
 */

import { requireDb, requireFunctions } from '../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { DigitalProduct, ProductOwnership } from '../types';

// ============================================================================
// PRODUCT DISCOVERY
// ============================================================================

/**
 * Browse digital products
 */
export async function browseProducts(params: {
  creatorId?: string;
  type?: 'photo' | 'video' | 'album' | 'nft_ready';
  includeNSFW?: boolean;
  limitCount?: number;
}): Promise<DigitalProduct[]> {
  try {
    const constraints: any[] = [
      orderBy('createdAt', 'desc'),
      limit(params.limitCount || 50),
    ];

    if (params.creatorId) {
      constraints.unshift(where('creatorId', '==', params.creatorId));
    }

    if (params.type) {
      constraints.unshift(where('type', '==', params.type));
    }

    if (!params.includeNSFW) {
      constraints.unshift(where('isNSFW', '==', false));
    }

    const q = query(collection(requireDb(), 'digital_products'), ...constraints);
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as DigitalProduct[];
  } catch (error) {
    console.error('Error browsing products:', error);
    throw error;
  }
}

/**
 * Get specific product
 */
export async function getProduct(productId: string): Promise<DigitalProduct | null> {
  try {
    const productRef = doc(requireDb(), 'digital_products', productId);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      return null;
    }

    return {
      id: productSnap.id,
      ...productSnap.data(),
    } as DigitalProduct;
  } catch (error) {
    console.error('Error getting product:', error);
    throw error;
  }
}

/**
 * Get trending products
 */
export async function getTrendingProducts(limitCount: number = 20): Promise<DigitalProduct[]> {
  try {
    const q = query(
      collection(requireDb(), 'digital_products'),
      orderBy('sales', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as DigitalProduct[];
  } catch (error) {
    console.error('Error getting trending products:', error);
    throw error;
  }
}

// ============================================================================
// PURCHASE & OWNERSHIP
// ============================================================================

/**
 * Purchase digital product
 */
export async function purchaseProduct(params: {
  productId: string;
  userId: string;
}): Promise<{
  success: boolean;
  ownershipId?: string;
  mediaUrls?: string[];
  error?: string;
}> {
  try {
    const purchase = httpsCallable<typeof params, {
      success: boolean;
      ownershipId: string;
      mediaUrls: string[];
    }>(requireFunctions(), 'purchaseDigitalProduct');
    
    const result = await purchase(params);
    return result.data;
  } catch (error: any) {
    console.error('Error purchasing product:', error);
    return {
      success: false,
      error: error.message || 'Failed to purchase product',
    };
  }
}

/**
 * Check if user owns product
 */
export async function checkOwnership(params: {
  userId: string;
  productId: string;
}): Promise<boolean> {
  try {
    const ownershipRef = doc(requireDb(), 'product_ownership', `${params.userId}_${params.productId}`);
    const ownershipSnap = await getDoc(ownershipRef);
    
    if (!ownershipSnap.exists()) {
      return false;
    }

    const ownership = ownershipSnap.data() as ProductOwnership;
    
    // Check if access has expired
    if (ownership.accessExpiry) {
      return ownership.accessExpiry.toMillis() > Date.now();
    }

    return true;
  } catch (error) {
    console.error('Error checking ownership:', error);
    return false;
  }
}

/**
 * Get user's owned products
 */
export async function getOwnedProducts(userId: string): Promise<DigitalProduct[]> {
  try {
    const q = query(
      collection(requireDb(), 'product_ownership'),
      where('userId', '==', userId)
    );

    const snapshot = await getDocs(q);
    const productIds = snapshot.docs.map(doc => doc.data().productId);

    if (productIds.length === 0) {
      return [];
    }

    // Fetch actual products
    const products: DigitalProduct[] = [];
    for (const productId of productIds) {
      const product = await getProduct(productId);
      if (product) {
        products.push(product);
      }
    }

    return products;
  } catch (error) {
    console.error('Error getting owned products:', error);
    throw error;
  }
}

// ============================================================================
// NFT FEATURES (Ready for blockchain integration)
// ============================================================================

/**
 * Get NFT metadata for product
 */
export async function getNFTMetadata(productId: string): Promise<{
  name: string;
  description: string;
  image: string;
  attributes: Array<{ trait_type: string; value: string }>;
}> {
  try {
    const product = await getProduct(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    return {
      name: product.title,
      description: product.description,
      image: product.thumbnailUrl,
      attributes: [
        { trait_type: 'Creator', value: product.creatorId },
        { trait_type: 'Type', value: product.type },
        { trait_type: 'NSFW', value: product.isNSFW ? 'Yes' : 'No' },
        { trait_type: 'Sales', value: product.sales.toString() },
      ],
    };
  } catch (error) {
    console.error('Error getting NFT metadata:', error);
    throw error;
  }
}

/**
 * Prepare product for NFT minting (placeholder for future blockchain integration)
 */
export async function prepareForNFTMinting(params: {
  productId: string;
  creatorId: string;
}): Promise<{
  success: boolean;
  metadata?: any;
  error?: string;
}> {
  try {
    const prepare = httpsCallable<typeof params, {
      success: boolean;
      metadata: any;
    }>(requireFunctions(), 'prepareProductForNFT');
    
    const result = await prepare(params);
    return result.data;
  } catch (error: any) {
    console.error('Error preparing for NFT:', error);
    return {
      success: false,
      error: error.message || 'Failed to prepare for NFT minting',
    };
  }
}

// ============================================================================
// CREATOR TOOLS
// ============================================================================

/**
 * Create digital product (creator-only)
 */
export async function createProduct(params: {
  creatorId: string;
  title: string;
  description: string;
  type: 'photo' | 'video' | 'album' | 'nft_ready';
  mediaUrls: string[];
  thumbnailUrl: string;
  price: number;
  isNSFW: boolean;
}): Promise<{
  success: boolean;
  productId?: string;
  error?: string;
}> {
  try {
    const create = httpsCallable<typeof params, {
      success: boolean;
      productId: string;
    }>(requireFunctions(), 'createDigitalProduct');
    
    const result = await create(params);
    return result.data;
  } catch (error: any) {
    console.error('Error creating product:', error);
    return {
      success: false,
      error: error.message || 'Failed to create product',
    };
  }
}

/**
 * Update product pricing
 */
export async function updateProductPrice(params: {
  productId: string;
  creatorId: string;
  newPrice: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const update = httpsCallable<typeof params, { success: boolean }>(requireFunctions(),
      'updateProductPrice'
    );
    
    const result = await update(params);
    return result.data;
  } catch (error: any) {
    console.error('Error updating price:', error);
    return {
      success: false,
      error: error.message || 'Failed to update price',
    };
  }
}
