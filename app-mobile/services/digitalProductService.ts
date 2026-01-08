/**
 * PACK 116: Digital Product Service
 * SAFE content only, token-based purchases with 65/35 split
 */

import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  doc, 
  getDoc,
  onSnapshot,
  Timestamp 
} from 'firebase/firestore';

// ============================================================================
// TYPES
// ============================================================================

export enum DigitalProductType {
  EBOOK = "EBOOK",
  PDF_GUIDE = "PDF_GUIDE",
  VIDEO_TUTORIAL = "VIDEO_TUTORIAL",
  AUDIO_GUIDE = "AUDIO_GUIDE",
  TEMPLATE = "TEMPLATE",
  PRESET_PACK = "PRESET_PACK",
  COURSE = "COURSE",
  WORKBOOK = "WORKBOOK",
}

export enum ProductCategory {
  FITNESS_WELLNESS = "fitness_wellness",
  LIFESTYLE = "lifestyle",
  COACHING = "coaching",
  DATING_SELFHELP = "dating_selfhelp",
  PRODUCTIVITY = "productivity",
  EDUCATION = "education",
}

export interface DigitalProduct {
  productId: string;
  creatorUserId: string;
  creatorName: string;
  creatorAvatar?: string;
  
  title: string;
  description: string;
  priceTokens: number;
  type: DigitalProductType;
  
  fileRef: string;
  previewImageRef: string;
  categories: string[];
  
  isActive: boolean;
  nsfwLevel: "SAFE";
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  purchaseCount: number;
  viewCount: number;
  
  fileSize: number;
  fileMimeType: string;
}

export interface DigitalProductPurchase {
  purchaseId: string;
  productId: string;
  productTitle: string;
  
  buyerUserId: string;
  buyerName: string;
  
  creatorUserId: string;
  creatorName: string;
  
  tokensAmount: number;
  platformFee: number;
  creatorEarnings: number;
  
  downloadUrl?: string;
  downloadUrlExpiry?: Timestamp;
  downloadCount: number;
  maxDownloads: number;
  
  watermarkId: string;
  
  purchasedAt: Timestamp;
  lastAccessedAt?: Timestamp;
  
  transactionId: string;
  status: "active" | "revoked";
}

export interface CreateProductRequest {
  title: string;
  description: string;
  priceTokens: number;
  type: DigitalProductType;
  categories: ProductCategory[];
  fileName: string;
  fileMimeType: string;
  fileSize: number;
}

export interface UpdateProductRequest {
  productId: string;
  updates: {
    title?: string;
    description?: string;
    priceTokens?: number;
    categories?: ProductCategory[];
    isActive?: boolean;
  };
}

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

const createDigitalProduct = httpsCallable(functions, 'createDigitalProduct');
const updateDigitalProduct = httpsCallable(functions, 'updateDigitalProduct');
const deleteDigitalProduct = httpsCallable(functions, 'deleteDigitalProduct');
const listCreatorDigitalProducts = httpsCallable(functions, 'listCreatorDigitalProducts');
const getDigitalProductDetails = httpsCallable(functions, 'getDigitalProductDetails');
const purchaseDigitalProduct = httpsCallable(functions, 'purchaseDigitalProduct');
const getBuyerDigitalProducts = httpsCallable(functions, 'getBuyerDigitalProducts');
const getProductDownloadUrl = httpsCallable(functions, 'getProductDownloadUrl');

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Create a new digital product
 */
export async function createProduct(
  request: CreateProductRequest
): Promise<{ success: boolean; productId: string; uploadUrl: string; message: string }> {
  try {
    const result = await createDigitalProduct(request);
    return result.data as any;
  } catch (error: any) {
    console.error('Error creating product:', error);
    throw new Error(error.message || 'Failed to create product');
  }
}

/**
 * Update digital product
 */
export async function updateProduct(
  request: UpdateProductRequest
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await updateDigitalProduct(request);
    return result.data as any;
  } catch (error: any) {
    console.error('Error updating product:', error);
    throw new Error(error.message || 'Failed to update product');
  }
}

/**
 * Delete (deactivate) digital product
 */
export async function deleteProduct(
  productId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await deleteDigitalProduct({ productId });
    return result.data as any;
  } catch (error: any) {
    console.error('Error deleting product:', error);
    throw new Error(error.message || 'Failed to delete product');
  }
}

/**
 * List creator's digital products
 */
export async function listCreatorProducts(
  creatorUserId: string,
  includeInactive = false
): Promise<{ success: boolean; products: DigitalProduct[]; count: number }> {
  try {
    const result = await listCreatorDigitalProducts({ creatorUserId, includeInactive });
    return result.data as any;
  } catch (error: any) {
    console.error('Error listing products:', error);
    throw new Error(error.message || 'Failed to list products');
  }
}

/**
 * Get digital product details
 */
export async function getProductDetails(
  productId: string
): Promise<{ success: boolean; product: DigitalProduct }> {
  try {
    const result = await getDigitalProductDetails({ productId });
    return result.data as any;
  } catch (error: any) {
    console.error('Error getting product details:', error);
    throw new Error(error.message || 'Failed to get product details');
  }
}

/**
 * Purchase digital product
 */
export async function purchaseProduct(
  productId: string
): Promise<{ success: boolean; purchaseId: string; message: string }> {
  try {
    const result = await purchaseDigitalProduct({ productId });
    return result.data as any;
  } catch (error: any) {
    console.error('Error purchasing product:', error);
    throw new Error(error.message || 'Failed to purchase product');
  }
}

/**
 * Get buyer's purchased products
 */
export async function getBuyerPurchases(): Promise<{ 
  success: boolean; 
  purchases: DigitalProductPurchase[]; 
  count: number 
}> {
  try {
    const result = await getBuyerDigitalProducts({});
    return result.data as any;
  } catch (error: any) {
    console.error('Error getting purchases:', error);
    throw new Error(error.message || 'Failed to get purchases');
  }
}

/**
 * Get download URL for purchased product
 */
export async function getDownloadUrl(
  purchaseId: string
): Promise<{ 
  success: boolean; 
  downloadUrl: string; 
  expiresAt: Timestamp;
  remainingDownloads: number;
}> {
  try {
    const result = await getProductDownloadUrl({ purchaseId });
    return result.data as any;
  } catch (error: any) {
    console.error('Error getting download URL:', error);
    throw new Error(error.message || 'Failed to get download URL');
  }
}

/**
 * Subscribe to creator's products (real-time)
 */
export function subscribeToCreatorProducts(
  creatorUserId: string,
  callback: (products: DigitalProduct[]) => void,
  onlyActive = true
): () => void {
  let q = query(
    collection(db, 'digital_products'),
    where('creatorUserId', '==', creatorUserId),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  
  if (onlyActive) {
    q = query(q, where('isActive', '==', true));
  }
  
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const products = snapshot.docs.map(doc => doc.data() as DigitalProduct);
      callback(products);
    },
    (error) => {
      console.error('Error subscribing to products:', error);
    }
  );
  
  return unsubscribe;
}

/**
 * Subscribe to user's purchases (real-time)
 */
export function subscribeToUserPurchases(
  userId: string,
  callback: (purchases: DigitalProductPurchase[]) => void
): () => void {
  const q = query(
    collection(db, 'digital_product_purchases'),
    where('buyerUserId', '==', userId),
    where('status', '==', 'active'),
    orderBy('purchasedAt', 'desc'),
    limit(100)
  );
  
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const purchases = snapshot.docs.map(doc => doc.data() as DigitalProductPurchase);
      callback(purchases);
    },
    (error) => {
      console.error('Error subscribing to purchases:', error);
    }
  );
  
  return unsubscribe;
}

/**
 * Get product by ID (one-time fetch)
 */
export async function getProduct(productId: string): Promise<DigitalProduct | null> {
  try {
    const docRef = doc(db, 'digital_products', productId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as DigitalProduct;
    }
    return null;
  } catch (error) {
    console.error('Error getting product:', error);
    return null;
  }
}

/**
 * Get purchase by ID (one-time fetch)
 */
export async function getPurchase(purchaseId: string): Promise<DigitalProductPurchase | null> {
  try {
    const docRef = doc(db, 'digital_product_purchases', purchaseId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as DigitalProductPurchase;
    }
    return null;
  } catch (error) {
    console.error('Error getting purchase:', error);
    return null;
  }
}

/**
 * Check if content is safe (validation helper)
 */
export function validateSafeContent(title: string, description: string): {
  isValid: boolean;
  errors: string[]
} {
  const errors: string[] = [];
  
  const nsfwKeywords = [
    'adult', 'explicit', 'nsfw', 'nude', 'naked', 'sexy', 'sex',
    'porn', 'xxx', 'erotic', 'sensual', 'intimate', 'bedroom',
    'lingerie', 'bikini', 'underwear', 'onlyfans', 'fansly'
  ];
  
  const textToCheck = `${title} ${description}`.toLowerCase();
  
  for (const keyword of nsfwKeywords) {
    if (textToCheck.includes(keyword)) {
      errors.push(`Content contains restricted keyword: "${keyword}"`);
    }
  }
  
  if (title.length < 5) {
    errors.push('Title must be at least 5 characters');
  }
  
  if (title.length > 100) {
    errors.push('Title must be at most 100 characters');
  }
  
  if (description.length < 20) {
    errors.push('Description must be at least 20 characters');
  }
  
  if (description.length > 1000) {
    errors.push('Description must be at most 1000 characters');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Calculate revenue split
 */
export function calculateRevenueSplit(priceTokens: number): {
  platformFee: number;
  creatorEarnings: number;
} {
  const platformFee = Math.floor(priceTokens * 0.35);
  const creatorEarnings = priceTokens - platformFee;
  return { platformFee, creatorEarnings };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get product type display name
 */
export function getProductTypeDisplay(type: DigitalProductType): string {
  const displayNames: Record<DigitalProductType, string> = {
    [DigitalProductType.EBOOK]: 'E-Book',
    [DigitalProductType.PDF_GUIDE]: 'PDF Guide',
    [DigitalProductType.VIDEO_TUTORIAL]: 'Video Tutorial',
    [DigitalProductType.AUDIO_GUIDE]: 'Audio Guide',
    [DigitalProductType.TEMPLATE]: 'Template',
    [DigitalProductType.PRESET_PACK]: 'Preset Pack',
    [DigitalProductType.COURSE]: 'Course',
    [DigitalProductType.WORKBOOK]: 'Workbook',
  };
  
  return displayNames[type] || type;
}

/**
 * Get category display name
 */
export function getCategoryDisplay(category: ProductCategory): string {
  const displayNames: Record<ProductCategory, string> = {
    [ProductCategory.FITNESS_WELLNESS]: 'Fitness & Wellness',
    [ProductCategory.LIFESTYLE]: 'Lifestyle',
    [ProductCategory.COACHING]: 'Coaching',
    [ProductCategory.DATING_SELFHELP]: 'Dating & Self-Help',
    [ProductCategory.PRODUCTIVITY]: 'Productivity',
    [ProductCategory.EDUCATION]: 'Education',
  };
  
  return displayNames[category] || category;
}