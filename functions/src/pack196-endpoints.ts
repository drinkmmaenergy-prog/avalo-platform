/**
 * PACK 196 — MARKETPLACE CLOUD FUNCTIONS ENDPOINTS
 */

import * as functions from 'firebase-functions';
import {
  uploadProduct,
  purchaseProduct,
  logProductReview,
  assignAffiliateLink,
  discloseSponsoredContent,
  resolveMarketplaceDispute,
  detectRomanticSelling,
} from './pack196-marketplace';
import { db } from './init';

// ============================================================================
// PRODUCT MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Upload a product (creators only)
 */
export const marketplace_uploadProduct = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const {
    name,
    description,
    category,
    type,
    priceTokens,
    imageUrls,
    stock
  } = data;

  if (!name || !description || !category || !type || !priceTokens) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const result = await uploadProduct({
      userId: context.auth.uid,
      name,
      description,
      category,
      type,
      priceTokens,
      imageUrls: imageUrls || [],
      stock
    });

    if (!result.success) {
      throw new functions.https.HttpsError('failed-precondition', result.error || 'Failed to upload product');
    }

    return result;
  } catch (error: any) {
    console.error('[Pack196] Error in marketplace_uploadProduct:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Purchase a product
 */
export const marketplace_purchaseProduct = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { productId, shippingAddress } = data;

  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'Product ID is required');
  }

  try {
    const result = await purchaseProduct({
      userId: context.auth.uid,
      productId,
      shippingAddress
    });

    if (!result.success) {
      throw new functions.https.HttpsError('failed-precondition', result.error || 'Failed to purchase product');
    }

    return result;
  } catch (error: any) {
    console.error('[Pack196] Error in marketplace_purchaseProduct:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Submit product review
 */
export const marketplace_logProductReview = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { productId, rating, review } = data;

  if (!productId || !rating || !review) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const result = await logProductReview({
      userId: context.auth.uid,
      productId,
      rating,
      review
    });

    if (!result.success) {
      throw new functions.https.HttpsError('failed-precondition', result.error || 'Failed to submit review');
    }

    return result;
  } catch (error: any) {
    console.error('[Pack196] Error in marketplace_logProductReview:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get product discovery feed
 */
export const marketplace_getProductFeed = functions.https.onCall(async (data, context) => {
  const { category, sortBy, limit = 20, offset = 0 } = data;

  try {
    let query = db.collection('products')
      .where('status', '==', 'active');

    // Filter by category
    if (category) {
      query = query.where('category', '==', category);
    }

    // Sort products
    switch (sortBy) {
      case 'rating':
        query = query.orderBy('averageRating', 'desc');
        break;
      case 'sales':
        query = query.orderBy('totalSales', 'desc');
        break;
      case 'newest':
      default:
        query = query.orderBy('createdAt', 'desc');
        break;
    }

    // Pagination
    query = query.limit(limit).offset(offset);

    const snapshot = await query.get();
    const products = snapshot.docs.map(doc => ({
      productId: doc.id,
      ...doc.data()
    }));

    return {
      success: true,
      products,
      hasMore: products.length === limit
    };
  } catch (error: any) {
    console.error('[Pack196] Error in marketplace_getProductFeed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get creator shop
 */
export const marketplace_getCreatorShop = functions.https.onCall(async (data, context) => {
  const { creatorId } = data;

  if (!creatorId) {
    throw new functions.https.HttpsError('invalid-argument', 'Creator ID is required');
  }

  try {
    // Get shop info
    const shopQuery = await db.collection('creator_shops')
      .where('creatorId', '==', creatorId)
      .limit(1)
      .get();

    let shop = null;
    if (!shopQuery.empty) {
      shop = {
        shopId: shopQuery.docs[0].id,
        ...shopQuery.docs[0].data()
      };
    }

    // Get creator's products
    const productsQuery = await db.collection('products')
      .where('creatorId', '==', creatorId)
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    const products = productsQuery.docs.map(doc => ({
      productId: doc.id,
      ...doc.data()
    }));

    // Get creator's brand deals
    const dealsQuery = await db.collection('brand_deals')
      .where('creatorId', '==', creatorId)
      .where('status', '==', 'active')
      .limit(10)
      .get();

    const brandDeals = dealsQuery.docs.map(doc => ({
      dealId: doc.id,
      ...doc.data()
    }));

    return {
      success: true,
      shop,
      products,
      brandDeals
    };
  } catch (error: any) {
    console.error('[Pack196] Error in marketplace_getCreatorShop:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// AFFILIATE SYSTEM ENDPOINTS
// ============================================================================

/**
 * Create affiliate link for product
 */
export const marketplace_assignAffiliateLink = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { productId } = data;

  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'Product ID is required');
  }

  try {
    const result = await assignAffiliateLink({
      creatorId: context.auth.uid,
      productId
    });

    if (!result.success) {
      throw new functions.https.HttpsError('failed-precondition', result.error || 'Failed to create affiliate link');
    }

    return result;
  } catch (error: any) {
    console.error('[Pack196] Error in marketplace_assignAffiliateLink:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Track affiliate click
 */
export const marketplace_trackAffiliateClick = functions.https.onCall(async (data, context) => {
  const { linkId } = data;

  if (!linkId) {
    throw new functions.https.HttpsError('invalid-argument', 'Link ID is required');
  }

  try {
    const linkRef = db.collection('affiliate_links').doc(linkId);
    await linkRef.update({
      clicks: (await linkRef.get()).data()?.clicks || 0 + 1,
      lastClickedAt: new Date()
    });

    return { success: true };
  } catch (error: any) {
    console.error('[Pack196] Error in marketplace_trackAffiliateClick:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// BRAND DEAL ENDPOINTS
// ============================================================================

/**
 * Disclose sponsored content
 */
export const marketplace_discloseSponsoredContent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { dealId, postId, streamId } = data;

  if (!dealId) {
    throw new functions.https.HttpsError('invalid-argument', 'Deal ID is required');
  }

  try {
    const result = await discloseSponsoredContent({
      creatorId: context.auth.uid,
      dealId,
      postId,
      streamId
    });

    if (!result.success) {
      throw new functions.https.HttpsError('failed-precondition', result.error || 'Failed to disclose sponsored content');
    }

    return result;
  } catch (error: any) {
    console.error('[Pack196] Error in marketplace_discloseSponsoredContent:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// ORDER MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get user orders (as buyer or seller)
 */
export const marketplace_getUserOrders = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { role = 'buyer', limit = 20, offset = 0 } = data;

  try {
    const field = role === 'buyer' ? 'buyerId' : 'sellerId';
    
    const ordersQuery = await db.collection('product_orders')
      .where(field, '==', context.auth.uid)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .offset(offset)
      .get();

    const orders = ordersQuery.docs.map(doc => ({
      orderId: doc.id,
      ...doc.data()
    }));

    return {
      success: true,
      orders,
      hasMore: orders.length === limit
    };
  } catch (error: any) {
    console.error('[Pack196] Error in marketplace_getUserOrders:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Update order shipping status (seller only)
 */
export const marketplace_updateOrderShipping = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { orderId, status, trackingNumber } = data;

  if (!orderId || !status) {
    throw new functions.https.HttpsError('invalid-argument', 'Order ID and status are required');
  }

  try {
    const orderRef = db.collection('product_orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Order not found');
    }

    const order = orderDoc.data();
    if (order?.sellerId !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Only the seller can update shipping status');
    }

    const validStatuses = ['confirmed', 'shipped', 'delivered'];
    if (!validStatuses.includes(status)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid status');
    }

    await orderRef.update({
      status,
      trackingNumber: trackingNumber || order.trackingNumber,
      updatedAt: new Date()
    });

    return { success: true };
  } catch (error: any) {
    console.error('[Pack196] Error in marketplace_updateOrderShipping:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// SAFETY & MODERATION ENDPOINTS
// ============================================================================

/**
 * Detect romantic selling (internal/admin)
 */
export const marketplace_detectRomanticSelling = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { text } = data;

  if (!text) {
    throw new functions.https.HttpsError('invalid-argument', 'Text is required');
  }

  try {
    const result = detectRomanticSelling(text);
    return result;
  } catch (error: any) {
    console.error('[Pack196] Error in marketplace_detectRomanticSelling:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Resolve marketplace dispute (admin only)
 */
export const marketplace_resolveDispute = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // TODO: Add admin check
  // const userDoc = await db.collection('users').doc(context.auth.uid).get();
  // if (!userDoc.data()?.isAdmin) {
  //   throw new functions.https.HttpsError('permission-denied', 'Admin only');
  // }

  const { disputeId, resolution, refundAmount, moderatorNotes } = data;

  if (!disputeId || !resolution || !moderatorNotes) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const result = await resolveMarketplaceDispute({
      disputeId,
      resolution,
      refundAmount,
      moderatorNotes
    });

    if (!result.success) {
      throw new functions.https.HttpsError('failed-precondition', result.error || 'Failed to resolve dispute');
    }

    return result;
  } catch (error: any) {
    console.error('[Pack196] Error in marketplace_resolveDispute:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

console.log('✅ Pack 196 (Avalo Social Commerce Marketplace) endpoints initialized');