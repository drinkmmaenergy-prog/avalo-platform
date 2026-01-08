import { admin, db, serverTimestamp } from '../init';
import * as functions from 'firebase-functions';
import { Timestamp } from 'firebase-admin/firestore';

interface BrandProduct {
  brand_id: string;
  collaboration_id?: string;
  creator_id?: string;
  name: string;
  description: string;
  category: string;
  type: 'physical' | 'digital';
  price_tokens: number;
  status: 'draft' | 'active' | 'inactive' | 'banned';
  images?: string[];
  inventory?: {
    available?: number;
    total?: number;
    unlimited?: boolean;
  };
  shipping?: {
    required: boolean;
    regions?: string[];
  };
  digital_delivery?: {
    type?: 'download' | 'access_code' | 'email';
    url?: string;
  };
  created_at: Timestamp;
  updated_at: Timestamp;
  metadata?: {
    total_sales?: number;
    total_revenue?: number;
  };
}

interface ProductPurchase {
  buyer_id: string;
  product_id: string;
  brand_id: string;
  creator_id?: string;
  collaboration_id?: string;
  price_tokens: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  shipping_address?: {
    name: string;
    street: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
  tracking_number?: string;
  purchased_at: Timestamp;
  delivered_at?: Timestamp;
  metadata?: {
    transaction_id?: string;
  };
}

const NSFW_KEYWORDS = [
  'lingerie', 'erotic', 'sexy', 'sensual', 'seductive',
  'intimate', 'adult', 'nsfw', 'xxx', 'porn', 'escort'
];

const ROMANCE_KEYWORDS = [
  'romance', 'dating', 'girlfriend', 'boyfriend',
  'love package', 'attention', 'buy my love', 'exclusive intimacy'
];

const SAFE_CATEGORIES = [
  'physical_merch', 'fitness_wellness', 'beauty',
  'education', 'art_creativity', 'tech',
  'home_decor', 'tools', 'hobby_kits'
];

function hasNSFWContent(text: string): boolean {
  const lowerText = text.toLowerCase();
  return NSFW_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

function hasRomanceContent(text: string): boolean {
  const lowerText = text.toLowerCase();
  return ROMANCE_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

export const publishProduct = functions.https.onCall(
  async (data: {
    brand_id: string;
    collaboration_id?: string;
    name: string;
    description: string;
    category: string;
    type: 'physical' | 'digital';
    price_tokens: number;
    images?: string[];
    inventory?: any;
    shipping?: any;
    digital_delivery?: any;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const {
      brand_id,
      collaboration_id,
      name,
      description,
      category,
      type,
      price_tokens,
      images,
      inventory,
      shipping,
      digital_delivery
    } = data;

    if (!brand_id || !name || !description || !category || !type || !price_tokens) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Required fields missing'
      );
    }

    if (!SAFE_CATEGORIES.includes(category)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid or unsafe category'
      );
    }

    const contentToCheck = `${name} ${description}`;
    if (hasNSFWContent(contentToCheck)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Product contains prohibited NSFW content'
      );
    }

    if (hasRomanceContent(contentToCheck)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Product contains prohibited romance-coded content'
      );
    }

    if (price_tokens < 1 || price_tokens > 1000000) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Price must be between 1 and 1,000,000 tokens'
      );
    }

    const brandDoc = await db.collection('brand_profiles').doc(brand_id).get();
    if (!brandDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Brand profile not found'
      );
    }

    const brandData = brandDoc.data();
    let creator_id: string | undefined;

    if (collaboration_id) {
      const collabDoc = await db.collection('brand_collaborations').doc(collaboration_id).get();
      if (!collabDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Collaboration not found'
        );
      }
      const collabData = collabDoc.data();
      creator_id = collabData?.creator_id;

      if (collabData?.brand_id !== brand_id) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Collaboration does not belong to this brand'
        );
      }
    }

    if (brandData?.owner_id !== context.auth.uid && creator_id !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Not authorized to publish products for this brand'
      );
    }

    const now = Timestamp.now();
    const product: BrandProduct = {
      brand_id,
      name,
      description,
      category,
      type,
      price_tokens,
      status: 'draft',
      created_at: now,
      updated_at: now,
      metadata: {
        total_sales: 0,
        total_revenue: 0
      }
    };

    if (collaboration_id) product.collaboration_id = collaboration_id;
    if (creator_id) product.creator_id = creator_id;
    if (images) product.images = images;
    if (inventory) product.inventory = inventory;
    if (shipping) product.shipping = shipping;
    if (digital_delivery) product.digital_delivery = digital_delivery;

    const productRef = await db.collection('brand_products').add(product);

    await db.collection('brand_profiles').doc(brand_id).update({
      'metadata.total_products': admin.firestore.FieldValue.increment(1)
    });

    if (collaboration_id) {
      await db.collection('brand_collaborations').doc(collaboration_id).update({
        'metadata.total_products': admin.firestore.FieldValue.increment(1)
      });
    }

    await db.collection('activity_logs').add({
      user_id: context.auth.uid,
      action: 'product_published',
      product_id: productRef.id,
      timestamp: now,
      metadata: {
        brand_id,
        category,
        type
      }
    });

    return {
      success: true,
      product_id: productRef.id,
      message: 'Product created successfully'
    };
  }
);

export const updateProductStatus = functions.https.onCall(
  async (data: {
    product_id: string;
    status: 'draft' | 'active' | 'inactive';
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { product_id, status } = data;

    if (!product_id || !status) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Product ID and status are required'
      );
    }

    const validStatuses = ['draft', 'active', 'inactive'];
    if (!validStatuses.includes(status)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid status'
      );
    }

    const productRef = db.collection('brand_products').doc(product_id);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Product not found'
      );
    }

    const productData = productDoc.data() as BrandProduct;

    const brandDoc = await db.collection('brand_profiles').doc(productData.brand_id).get();
    const brandData = brandDoc.data();

    if (brandData?.owner_id !== context.auth.uid && productData.creator_id !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Not authorized to update this product'
      );
    }

    await productRef.update({
      status,
      updated_at: Timestamp.now()
    });

    await db.collection('activity_logs').add({
      user_id: context.auth.uid,
      action: 'product_status_updated',
      product_id,
      timestamp: Timestamp.now(),
      metadata: { status }
    });

    return {
      success: true,
      message: `Product status updated to ${status}`
    };
  }
);

export const purchaseProduct = functions.https.onCall(
  async (data: {
    product_id: string;
    shipping_address?: any;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { product_id, shipping_address } = data;

    if (!product_id) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Product ID is required'
      );
    }

    const productDoc = await db.collection('brand_products').doc(product_id).get();

    if (!productDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Product not found'
      );
    }

    const productData = productDoc.data() as BrandProduct;

    if (productData.status !== 'active') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Product is not available for purchase'
      );
    }

    if (productData.inventory && !productData.inventory.unlimited) {
      const available = productData.inventory.available || 0;
      if (available < 1) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Product is out of stock'
        );
      }
    }

    if (productData.type === 'physical' && productData.shipping?.required && !shipping_address) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Shipping address is required for physical products'
      );
    }

    const userTokensRef = db.collection('user_tokens').doc(context.auth.uid);
    const userTokensDoc = await userTokensRef.get();
    const userTokens = userTokensDoc.data()?.balance || 0;

    if (userTokens < productData.price_tokens) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Insufficient tokens'
      );
    }

    const now = Timestamp.now();
    const purchase: ProductPurchase = {
      buyer_id: context.auth.uid,
      product_id,
      brand_id: productData.brand_id,
      price_tokens: productData.price_tokens,
      status: 'pending',
      purchased_at: now
    };

    if (productData.creator_id) purchase.creator_id = productData.creator_id;
    if (productData.collaboration_id) purchase.collaboration_id = productData.collaboration_id;
    if (shipping_address) purchase.shipping_address = shipping_address;

    const batch = db.batch();

    const purchaseRef = db.collection('brand_product_purchases').doc();
    batch.set(purchaseRef, purchase);

    batch.update(userTokensRef, {
      balance: admin.firestore.FieldValue.increment(-productData.price_tokens),
      updated_at: now
    });

    const escrowRef = db.collection('token_escrow').doc();
    batch.set(escrowRef, {
      purchase_id: purchaseRef.id,
      amount: productData.price_tokens,
      status: 'held',
      created_at: now
    });

    if (productData.inventory && !productData.inventory.unlimited) {
      batch.update(db.collection('brand_products').doc(product_id), {
        'inventory.available': admin.firestore.FieldValue.increment(-1)
      });
    }

    await batch.commit();

    await db.collection('activity_logs').add({
      user_id: context.auth.uid,
      action: 'product_purchased',
      product_id,
      timestamp: now,
      metadata: {
        purchase_id: purchaseRef.id,
        price_tokens: productData.price_tokens
      }
    });

    return {
      success: true,
      purchase_id: purchaseRef.id,
      message: 'Purchase completed successfully'
    };
  }
);

export const confirmProductDelivery = functions.https.onCall(
  async (data: {
    purchase_id: string;
    tracking_number?: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { purchase_id, tracking_number } = data;

    if (!purchase_id) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Purchase ID is required'
      );
    }

    const purchaseRef = db.collection('brand_product_purchases').doc(purchase_id);
    const purchaseDoc = await purchaseRef.get();

    if (!purchaseDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Purchase not found'
      );
    }

    const purchaseData = purchaseDoc.data() as ProductPurchase;

    if (purchaseData.buyer_id !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Not authorized to confirm this delivery'
      );
    }

    if (purchaseData.status !== 'shipped') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Purchase must be in shipped state'
      );
    }

    const now = Timestamp.now();
    await purchaseRef.update({
      status: 'delivered',
      delivered_at: now,
      updated_at: now
    });

    await releaseBrandRoyalties(purchase_id);

    await db.collection('activity_logs').add({
      user_id: context.auth.uid,
      action: 'delivery_confirmed',
      purchase_id,
      timestamp: now
    });

    return {
      success: true,
      message: 'Delivery confirmed successfully'
    };
  }
);

async function releaseBrandRoyalties(purchase_id: string) {
  const purchaseDoc = await db.collection('brand_product_purchases').doc(purchase_id).get();
  const purchaseData = purchaseDoc.data() as ProductPurchase;

  const escrowSnapshot = await db.collection('token_escrow')
    .where('purchase_id', '==', purchase_id)
    .where('status', '==', 'held')
    .limit(1)
    .get();

  if (escrowSnapshot.empty) {
    return;
  }

  const escrowDoc = escrowSnapshot.docs[0];
  const escrowData = escrowDoc.data();
  const totalTokens = escrowData.amount;

  let creatorShare = 0;
  let brandShare = totalTokens;

  if (purchaseData.creator_id && purchaseData.collaboration_id) {
    const collabDoc = await db.collection('brand_collaborations')
      .doc(purchaseData.collaboration_id)
      .get();
    const collabData = collabDoc.data();
    
    if (collabData?.terms?.revenue_split) {
      const creatorPercent = collabData.terms.revenue_split.creator || 35;
      creatorShare = Math.floor(totalTokens * (creatorPercent / 100));
      brandShare = totalTokens - creatorShare;
    } else {
      creatorShare = Math.floor(totalTokens * 0.35);
      brandShare = totalTokens - creatorShare;
    }
  }

  const batch = db.batch();
  const now = Timestamp.now();

  if (creatorShare > 0 && purchaseData.creator_id) {
    const creatorTokensRef = db.collection('user_tokens').doc(purchaseData.creator_id);
    batch.update(creatorTokensRef, {
      balance: admin.firestore.FieldValue.increment(creatorShare),
      updated_at: now
    });

    const royaltyRef = db.collection('brand_royalties').doc();
    batch.set(royaltyRef, {
      creator_id: purchaseData.creator_id,
      purchase_id,
      product_id: purchaseData.product_id,
      amount: creatorShare,
      status: 'paid',
      created_at: now
    });
  }

  const brandDoc = await db.collection('brand_profiles').doc(purchaseData.brand_id).get();
  const brandData = brandDoc.data();
  if (brandData?.owner_id) {
    const brandTokensRef = db.collection('user_tokens').doc(brandData.owner_id);
    batch.update(brandTokensRef, {
      balance: admin.firestore.FieldValue.increment(brandShare),
      updated_at: now
    });
  }

  batch.update(escrowDoc.ref, {
    status: 'released',
    released_at: now
  });

  batch.update(db.collection('brand_products').doc(purchaseData.product_id), {
    'metadata.total_sales': admin.firestore.FieldValue.increment(1),
    'metadata.total_revenue': admin.firestore.FieldValue.increment(totalTokens)
  });

  await batch.commit();
}

export const releaseBrandRoyaltiesManual = functions.https.onCall(
  async (data: { purchase_id: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const isAdmin = await db.collection('admin_users').doc(context.auth.uid).get()
      .then(doc => doc.exists);

    if (!isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    await releaseBrandRoyalties(data.purchase_id);

    return {
      success: true,
      message: 'Royalties released successfully'
    };
  }
);

export const getProduct = functions.https.onCall(
  async (data: { product_id: string }, context) => {
    const { product_id } = data;

    if (!product_id) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Product ID is required'
      );
    }

    const productDoc = await db.collection('brand_products').doc(product_id).get();

    if (!productDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Product not found'
      );
    }

    const productData = productDoc.data() as BrandProduct;

    if (productData.status !== 'active') {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Product not accessible'
        );
      }

      const brandDoc = await db.collection('brand_profiles').doc(productData.brand_id).get();
      const brandData = brandDoc.data();

      if (brandData?.owner_id !== context.auth.uid && productData.creator_id !== context.auth.uid) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Product not accessible'
        );
      }
    }

    return {
      success: true,
      product: {
        id: productDoc.id,
        ...productData,
        created_at: productData.created_at.toMillis(),
        updated_at: productData.updated_at.toMillis()
      }
    };
  }
);

export const listBrandProducts = functions.https.onCall(
  async (data: {
    brand_id: string;
    category?: string;
    status?: string;
    limit?: number;
  }, context) => {
    const { brand_id, category, status = 'active', limit = 20 } = data;

    if (!brand_id) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Brand ID is required'
      );
    }

    let query = db.collection('brand_products')
      .where('brand_id', '==', brand_id)
      .where('status', '==', status);

    if (category) {
      query = query.where('category', '==', category);
    }

    query = query.orderBy('created_at', 'desc').limit(limit);

    const snapshot = await query.get();
    const products = snapshot.docs.map(doc => {
      const data = doc.data() as BrandProduct;
      return {
        id: doc.id,
        ...data,
        created_at: data.created_at.toMillis(),
        updated_at: data.updated_at.toMillis()
      };
    });

    return {
      success: true,
      products,
      total: products.length
    };
  }
);