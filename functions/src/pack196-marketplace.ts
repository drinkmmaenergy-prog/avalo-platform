/**
 * PACK 196 — AVALO SOCIAL COMMERCE MARKETPLACE
 * Brand Deals • Affiliate Tools • Product Discovery • Zero Body-Selling • Zero Romantic-Selling
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, increment } from './init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

export type ProductCategory = 
  | 'fitness' 
  | 'fashion' 
  | 'digital_skills' 
  | 'beauty' 
  | 'gadgets' 
  | 'education' 
  | 'home_lifestyle';

export type ProductType = 'physical' | 'digital';

export type ProductStatus = 'pending' | 'active' | 'inactive' | 'rejected';

export type OrderStatus = 
  | 'pending' 
  | 'confirmed' 
  | 'shipped' 
  | 'delivered' 
  | 'cancelled' 
  | 'refunded';

export interface Product {
  productId: string;
  creatorId: string;
  name: string;
  description: string;
  category: ProductCategory;
  type: ProductType;
  priceTokens: number;
  imageUrls: string[];
  status: ProductStatus;
  stock?: number;
  totalSales: number;
  totalReviews: number;
  averageRating: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProductOrder {
  orderId: string;
  productId: string;
  buyerId: string;
  sellerId: string;
  priceTokens: number;
  avaloFee: number;
  creatorEarnings: number;
  status: OrderStatus;
  shippingAddress?: {
    fullName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    phone: string;
  };
  trackingNumber?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BrandDeal {
  dealId: string;
  creatorId: string;
  brandName: string;
  type: 'sponsored_post' | 'sponsored_stream' | 'product_drop' | 'promo_code' | 'affiliate_link';
  status: 'draft' | 'active' | 'completed';
  disclosureText: string;
  startDate?: Timestamp;
  endDate?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// SAFETY MIDDLEWARE
// ============================================================================

const BLOCKED_KEYWORDS = [
  'erotic', 'sexual', 'nsfw', 'xxx', 'porn', 'sexy', 'hot', 'nude', 'naked',
  'date with me', 'girlfriend experience', 'boyfriend experience', 'sugar daddy',
  'sugar baby', 'escort', 'massage', 'sensual', 'intimate', 'private show',
  'cam show', 'webcam', 'onlyfans', 'fansly', 'manyvids', 'fetish', 'feet pics',
  'foot fetish', 'cosplay fetish', 'buy my attention', 'talk to me if you buy',
  'personal time', 'romantic', 'flirty', 'seduc', 'arousing'
];

const ROMANTIC_MANIPULATION_PATTERNS = [
  'buy and i will talk',
  'purchase to get my attention',
  'spend tokens and i will',
  'if you buy i will chat',
  'buy this and we can',
  'lonely? buy this',
  'need someone? purchase',
  'feeling down? buy'
];

/**
 * Detect romantic or body-selling content
 */
export function detectRomanticSelling(text: string): { 
  blocked: boolean; 
  reason?: string 
} {
  const lowerText = text.toLowerCase();
  
  // Check blocked keywords
  for (const keyword of BLOCKED_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return {
        blocked: true,
        reason: `Contains prohibited keyword: ${keyword}`
      };
    }
  }
  
  // Check romantic manipulation patterns
  for (const pattern of ROMANTIC_MANIPULATION_PATTERNS) {
    if (lowerText.includes(pattern)) {
      return {
        blocked: true,
        reason: 'Contains manipulative romantic selling pattern'
      };
    }
  }
  
  return { blocked: false };
}

/**
 * Detect NSFW product marketing
 */
export function detectNSFWMarketing(product: {
  name: string;
  description: string;
  category: string;
}): { blocked: boolean; reason?: string } {
  // Check product name and description
  const nameCheck = detectRomanticSelling(product.name);
  if (nameCheck.blocked) {
    return nameCheck;
  }
  
  const descCheck = detectRomanticSelling(product.description);
  if (descCheck.blocked) {
    return descCheck;
  }
  
  // Category-specific checks
  const blockedCategories = ['adult', 'dating', 'romantic', 'nsfw'];
  if (blockedCategories.includes(product.category.toLowerCase())) {
    return {
      blocked: true,
      reason: 'Product category is not allowed'
    };
  }
  
  return { blocked: false };
}

/**
 * Validate product against safety rules
 */
export async function validateProductSafety(productData: any): Promise<{
  valid: boolean;
  reason?: string;
}> {
  // Detect NSFW marketing
  const nsfwCheck = detectNSFWMarketing({
    name: productData.name,
    description: productData.description,
    category: productData.category
  });
  
  if (nsfwCheck.blocked) {
    return {
      valid: false,
      reason: nsfwCheck.reason
    };
  }
  
  // Validate category
  const allowedCategories: ProductCategory[] = [
    'fitness', 'fashion', 'digital_skills', 'beauty', 
    'gadgets', 'education', 'home_lifestyle'
  ];
  
  if (!allowedCategories.includes(productData.category)) {
    return {
      valid: false,
      reason: 'Invalid product category'
    };
  }
  
  // Validate price range
  if (productData.priceTokens < 1 || productData.priceTokens > 10000) {
    return {
      valid: false,
      reason: 'Price must be between 1 and 10,000 tokens'
    };
  }
  
  return { valid: true };
}

// ============================================================================
// PRODUCT MANAGEMENT
// ============================================================================

/**
 * Upload a new product
 */
export async function uploadProduct(data: {
  userId: string;
  name: string;
  description: string;
  category: ProductCategory;
  type: ProductType;
  priceTokens: number;
  imageUrls: string[];
  stock?: number;
}): Promise<{ success: boolean; productId?: string; error?: string }> {
  try {
    // Validate user is a verified creator
    const userDoc = await db.collection('users').doc(data.userId).get();
    if (!userDoc.exists) {
      return { success: false, error: 'User not found' };
    }
    
    const userData = userDoc.data();
    if (!userData?.isCreator || !userData?.verified) {
      return { success: false, error: 'Only verified creators can upload products' };
    }
    
    // Validate product safety
    const safetyCheck = await validateProductSafety(data);
    if (!safetyCheck.valid) {
      return { success: false, error: safetyCheck.reason };
    }
    
    // Create product
    const productRef = db.collection('products').doc();
    const product: Omit<Product, 'productId'> = {
      creatorId: data.userId,
      name: data.name,
      description: data.description,
      category: data.category,
      type: data.type,
      priceTokens: data.priceTokens,
      imageUrls: data.imageUrls,
      status: 'pending', // Requires admin approval
      stock: data.stock,
      totalSales: 0,
      totalReviews: 0,
      averageRating: 0,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp
    };
    
    await productRef.set(product);
    
    return {
      success: true,
      productId: productRef.id
    };
  } catch (error: any) {
    console.error('[Pack196] Error uploading product:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Purchase a product
 */
export async function purchaseProduct(data: {
  userId: string;
  productId: string;
  shippingAddress?: any;
}): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    // Get product
    const productDoc = await db.collection('products').doc(data.productId).get();
    if (!productDoc.exists) {
      return { success: false, error: 'Product not found' };
    }
    
    const product = productDoc.data() as Product;
    
    // Validate product status
    if (product.status !== 'active') {
      return { success: false, error: 'Product is not available for purchase' };
    }
    
    // Check stock for physical products
    if (product.type === 'physical' && product.stock !== undefined && product.stock < 1) {
      return { success: false, error: 'Product is out of stock' };
    }
    
    // Physical products require shipping address
    if (product.type === 'physical' && !data.shippingAddress) {
      return { success: false, error: 'Shipping address is required for physical products' };
    }
    
    // Get user wallet
    const walletRef = db.collection('balances').doc(data.userId).collection('wallet').doc('wallet');
    const walletDoc = await walletRef.get();
    const balance = walletDoc.data()?.tokens || 0;
    
    if (balance < product.priceTokens) {
      return { success: false, error: 'Insufficient token balance' };
    }
    
    // Calculate revenue split (65% creator, 35% Avalo)
    const avaloFee = Math.floor(product.priceTokens * 0.35);
    const creatorEarnings = product.priceTokens - avaloFee;
    
    // Create order in transaction
    const orderId = `${data.userId}_${data.productId}_${Date.now()}`;
    const orderRef = db.collection('product_orders').doc(orderId);
    
    await db.runTransaction(async (transaction) => {
      // Deduct from buyer
      const wallet = await transaction.get(walletRef);
      const currentBalance = wallet.data()?.tokens || 0;
      
      if (currentBalance < product.priceTokens) {
        throw new Error('Insufficient balance');
      }
      
      transaction.update(walletRef, {
        tokens: currentBalance - product.priceTokens,
        lastUpdated: serverTimestamp()
      });
      
      // Add to creator earnings
      const creatorWalletRef = db.collection('balances').doc(product.creatorId).collection('wallet').doc('wallet');
      const creatorWallet = await transaction.get(creatorWalletRef);
      const creatorBalance = creatorWallet.data()?.tokens || 0;
      
      transaction.update(creatorWalletRef, {
        tokens: creatorBalance + creatorEarnings,
        lastUpdated: serverTimestamp()
      });
      
      // Create order
      const order: Omit<ProductOrder, 'orderId'> = {
        productId: data.productId,
        buyerId: data.userId,
        sellerId: product.creatorId,
        priceTokens: product.priceTokens,
        avaloFee,
        creatorEarnings,
        status: 'pending',
        shippingAddress: data.shippingAddress,
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp
      };
      
      transaction.set(orderRef, order);
      
      // Update product stats
      transaction.update(productDoc.ref, {
        totalSales: increment(1),
        stock: product.type === 'physical' && product.stock !== undefined 
          ? increment(-1) 
          : product.stock,
        updatedAt: serverTimestamp()
      });
      
      // Create transaction record
      const transactionRef = db.collection('transactions').doc();
      transaction.set(transactionRef, {
        senderUid: data.userId,
        receiverUid: product.creatorId,
        tokensAmount: product.priceTokens,
        avaloFee,
        transactionType: 'marketplace_purchase',
        productId: data.productId,
        orderId,
        createdAt: serverTimestamp(),
        validated: true
      });
    });
    
    return {
      success: true,
      orderId
    };
  } catch (error: any) {
    console.error('[Pack196] Error purchasing product:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Log product review
 */
export async function logProductReview(data: {
  userId: string;
  productId: string;
  rating: number;
  review: string;
}): Promise<{ success: boolean; reviewId?: string; error?: string }> {
  try {
    // Validate rating
    if (data.rating < 1 || data.rating > 5) {
      return { success: false, error: 'Rating must be between 1 and 5' };
    }
    
    // Check if user purchased product
    const ordersQuery = await db.collection('product_orders')
      .where('buyerId', '==', data.userId)
      .where('productId', '==', data.productId)
      .limit(1)
      .get();
    
    if (ordersQuery.empty) {
      return { success: false, error: 'You must purchase the product before reviewing' };
    }
    
    // Check if review already exists
    const existingReview = await db.collection('product_reviews')
      .where('userId', '==', data.userId)
      .where('productId', '==', data.productId)
      .limit(1)
      .get();
    
    if (!existingReview.empty) {
      return { success: false, error: 'You have already reviewed this product' };
    }
    
    // Create review
    const reviewRef = db.collection('product_reviews').doc();
    await reviewRef.set({
      productId: data.productId,
      userId: data.userId,
      rating: data.rating,
      review: data.review,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    // Update product average rating
    const productRef = db.collection('products').doc(data.productId);
    const productDoc = await productRef.get();
    const product = productDoc.data();
    
    if (product) {
      const newTotalReviews = (product.totalReviews || 0) + 1;
      const currentTotal = (product.averageRating || 0) * (product.totalReviews || 0);
      const newAverage = (currentTotal + data.rating) / newTotalReviews;
      
      await productRef.update({
        totalReviews: newTotalReviews,
        averageRating: Math.round(newAverage * 10) / 10,
        updatedAt: serverTimestamp()
      });
    }
    
    return {
      success: true,
      reviewId: reviewRef.id
    };
  } catch (error: any) {
    console.error('[Pack196] Error logging review:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// AFFILIATE SYSTEM
// ============================================================================

/**
 * Assign affiliate link to creator
 */
export async function assignAffiliateLink(data: {
  creatorId: string;
  productId: string;
}): Promise<{ success: boolean; linkId?: string; error?: string }> {
  try {
    // Validate creator
    const userDoc = await db.collection('users').doc(data.creatorId).get();
    if (!userDoc.exists) {
      return { success: false, error: 'User not found' };
    }
    
    const userData = userDoc.data();
    if (!userData?.isCreator || !userData?.verified) {
      return { success: false, error: 'Only verified creators can create affiliate links' };
    }
    
    // Validate product
    const productDoc = await db.collection('products').doc(data.productId).get();
    if (!productDoc.exists) {
      return { success: false, error: 'Product not found' };
    }
    
    const product = productDoc.data();
    if (product?.status !== 'active') {
      return { success: false, error: 'Product is not active' };
    }
    
    // Check if link already exists
    const existingLink = await db.collection('affiliate_links')
      .where('creatorId', '==', data.creatorId)
      .where('productId', '==', data.productId)
      .limit(1)
      .get();
    
    if (!existingLink.empty) {
      return {
        success: true,
        linkId: existingLink.docs[0].id
      };
    }
    
    // Create affiliate link
    const linkRef = db.collection('affiliate_links').doc();
    await linkRef.set({
      creatorId: data.creatorId,
      productId: data.productId,
      status: 'active',
      clicks: 0,
      conversions: 0,
      earnings: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    return {
      success: true,
      linkId: linkRef.id
    };
  } catch (error: any) {
    console.error('[Pack196] Error assigning affiliate link:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// BRAND DEAL SYSTEM
// ============================================================================

/**
 * Disclose sponsored content
 */
export async function discloseSponsoredContent(data: {
  creatorId: string;
  dealId: string;
  postId?: string;
  streamId?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Get brand deal
    const dealDoc = await db.collection('brand_deals').doc(data.dealId).get();
    if (!dealDoc.exists) {
      return { success: false, error: 'Brand deal not found' };
    }
    
    const deal = dealDoc.data();
    if (deal?.creatorId !== data.creatorId) {
      return { success: false, error: 'Unauthorized' };
    }
    
    // Log disclosure
    const disclosureRef = db.collection('sponsored_disclosures').doc();
    await disclosureRef.set({
      dealId: data.dealId,
      creatorId: data.creatorId,
      postId: data.postId,
      streamId: data.streamId,
      disclosureText: deal.disclosureText || 'Sponsored by ' + deal.brandName,
      createdAt: serverTimestamp()
    });
    
    return { success: true };
  } catch (error: any) {
    console.error('[Pack196] Error disclosing sponsored content:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// DISPUTE RESOLUTION
// ============================================================================

/**
 * Resolve marketplace dispute
 */
export async function resolveMarketplaceDispute(data: {
  disputeId: string;
  resolution: 'refund_buyer' | 'favor_seller' | 'partial_refund';
  refundAmount?: number;
  moderatorNotes: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Get dispute
    const disputeDoc = await db.collection('marketplace_disputes').doc(data.disputeId).get();
    if (!disputeDoc.exists) {
      return { success: false, error: 'Dispute not found' };
    }
    
    const dispute = disputeDoc.data();
    if (dispute?.status !== 'open') {
      return { success: false, error: 'Dispute is already resolved' };
    }
    
    // Get order
    const orderDoc = await db.collection('product_orders').doc(dispute.orderId).get();
    if (!orderDoc.exists) {
      return { success: false, error: 'Order not found' };
    }
    
    const order = orderDoc.data() as ProductOrder;
    
    // Process resolution in transaction
    await db.runTransaction(async (transaction) => {
      // Update dispute status
      transaction.update(disputeDoc.ref, {
        status: 'resolved',
        resolution: data.resolution,
        moderatorNotes: data.moderatorNotes,
        resolvedAt: serverTimestamp()
      });
      
      // Handle refunds
      if (data.resolution === 'refund_buyer' || data.resolution === 'partial_refund') {
        const refundAmount = data.resolution === 'refund_buyer' 
          ? order.priceTokens 
          : (data.refundAmount || 0);
        
        // Refund buyer
        const buyerWalletRef = db.collection('balances').doc(order.buyerId).collection('wallet').doc('wallet');
        const buyerWallet = await transaction.get(buyerWalletRef);
        const buyerBalance = buyerWallet.data()?.tokens || 0;
        
        transaction.update(buyerWalletRef, {
          tokens: buyerBalance + refundAmount,
          lastUpdated: serverTimestamp()
        });
        
        // Deduct from seller
        const sellerWalletRef = db.collection('balances').doc(order.sellerId).collection('wallet').doc('wallet');
        const sellerWallet = await transaction.get(sellerWalletRef);
        const sellerBalance = sellerWallet.data()?.tokens || 0;
        
        // Calculate what to deduct from seller (they received creatorEarnings)
        const sellerDeduction = Math.min(refundAmount * 0.65, order.creatorEarnings);
        
        transaction.update(sellerWalletRef, {
          tokens: Math.max(0, sellerBalance - sellerDeduction),
          lastUpdated: serverTimestamp()
        });
        
        // Update order status
        transaction.update(orderDoc.ref, {
          status: 'refunded',
          refundAmount,
          updatedAt: serverTimestamp()
        });
      }
    });
    
    return { success: true };
  } catch (error: any) {
    console.error('[Pack196] Error resolving dispute:', error);
    return { success: false, error: error.message };
  }
}