/**
 * PHASE 24 - Creator Ecosystem & Marketplace
 *
 * Creator monetization expansion:
 * - Digital products (photo packs, videos, 1:1 call slots)
 * - Product storefront
 * - Token-based purchases
 * - Stripe Connect for fiat payouts
 *
 * Feature flag: creator_store
 * Region: europe-west3
 * No changes to existing chat/calendar pricing
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
;
;
;
;

const db = getFirestore();
const storage = getStorage();

/**
 * Product types
 */
export enum ProductType {
  PHOTO_PACK = "photo_pack", // Collection of photos
  VIDEO = "video", // Single video
  CALL_SLOT = "call_slot", // 1:1 video/audio call booking
  CUSTOM = "custom", // Custom digital content
}

/**
 * Product status
 */
export enum ProductStatus {
  DRAFT = "draft",
  ACTIVE = "active",
  PAUSED = "paused",
  ARCHIVED = "archived",
}

/**
 * Creator product
 */
interface CreatorProduct {
  productId: string;
  creatorId: string;
  type: ProductType;
  status: ProductStatus;

  // Product details
  title: string;
  description: string;
  price: number; // In tokens
  thumbnailUrl?: string;

  // Content delivery
  contentUrls?: string[]; // Signed URLs to GCS
  contentPath?: string; // GCS path (not exposed to users)

  // For call slots
  durationMinutes?: number;
  availableSlots?: Timestamp[];

  // Metadata
  tags?: string[];
  category?: string;

  // Analytics
  viewCount: number;
  purchaseCount: number;
  totalRevenue: number; // In tokens

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt?: Timestamp;
}

/**
 * Product purchase
 */
interface ProductPurchase {
  purchaseId: string;
  productId: string;
  buyerId: string;
  creatorId: string;

  // Payment
  amount: number; // Tokens paid
  platformFee: number; // 20% platform fee
  creatorEarnings: number; // 80% to creator

  // Status
  status: "pending" | "completed" | "refunded" | "failed";

  // Content delivery
  contentUrls?: string[]; // Signed URLs (expire in 7 days)
  expiresAt?: Timestamp;

  // Timestamps
  purchasedAt: Timestamp;
  deliveredAt?: Timestamp;
  refundedAt?: Timestamp;

  // Metadata
  refundReason?: string;
}

/**
 * Create creator product
 */
export const createCreatorProductV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Check feature flag
    const storeEnabled = await getFeatureFlag(uid, "creator_store", false);
    if (!storeEnabled) {
      throw new HttpsError("failed-precondition", "Creator store not enabled");
    }

    // Check if user is creator
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();

    if (!userData?.role || userData.role !== "creator") {
      throw new HttpsError("permission-denied", "Only creators can create products");
    }

    // Validate input
    const schema = z.object({
      type: z.nativeEnum(ProductType),
      title: z.string().min(3).max(100),
      description: z.string().min(10).max(1000),
      price: z.number().min(10).max(10000), // 10-10000 tokens
      durationMinutes: z.number().optional(),
      tags: z.array(z.string()).optional(),
      category: z.string().optional(),
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { type, title, description, price, durationMinutes, tags, category } =
      validationResult.data;

    try {
      const productId = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const product: CreatorProduct = {
        productId,
        creatorId: uid,
        type,
        status: ProductStatus.DRAFT,
        title,
        description,
        price,
        durationMinutes,
        tags: tags || [],
        category: category || "general",
        viewCount: 0,
        purchaseCount: 0,
        totalRevenue: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      // Generate upload URLs for content
      let uploadUrls: Record<string, string> = {};

      if (type === ProductType.PHOTO_PACK) {
        // Allow up to 10 photos
        const photoUrls: string[] = [];
        for (let i = 0; i < 10; i++) {
          const path = `creator-products/${uid}/${productId}/photo_${i}.jpg`;
          const [signedUrl] = await storage
            .bucket()
            .file(path)
            .getSignedUrl({
              version: "v4",
              action: "write",
              expires: Date.now() + 60 * 60 * 1000, // 1 hour
              contentType: "image/jpeg",
            });
          photoUrls.push(signedUrl);
        }
        uploadUrls.photos = photoUrls as any;
      } else if (type === ProductType.VIDEO) {
        const path = `creator-products/${uid}/${productId}/video.mp4`;
        const [signedUrl] = await storage
          .bucket()
          .file(path)
          .getSignedUrl({
            version: "v4",
            action: "write",
            expires: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
            contentType: "video/mp4",
          });
        uploadUrls.video = signedUrl;
      }

      // Thumbnail upload URL
      const thumbnailPath = `creator-products/${uid}/${productId}/thumbnail.jpg`;
      const [thumbnailUrl] = await storage
        .bucket()
        .file(thumbnailPath)
        .getSignedUrl({
          version: "v4",
          action: "write",
          expires: Date.now() + 60 * 60 * 1000,
          contentType: "image/jpeg",
        });
      uploadUrls.thumbnail = thumbnailUrl;

      await db.collection("creatorProducts").doc(productId).set(product);

      logger.info(`Creator product created: ${productId} by ${uid}`);

      return {
        success: true,
        productId,
        uploadUrls,
        expiresIn: 3600, // seconds
      };
    } catch (error: any) {
      logger.error("Product creation failed:", error);
      throw new HttpsError("internal", "Failed to create product");
    }
  }
);

/**
 * Publish product (make it visible in store)
 */
export const publishCreatorProductV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { productId } = request.data;

    if (!productId) {
      throw new HttpsError("invalid-argument", "productId required");
    }

    const productDoc = await db.collection("creatorProducts").doc(productId).get();

    if (!productDoc.exists) {
      throw new HttpsError("not-found", "Product not found");
    }

    const product = productDoc.data() as CreatorProduct;

    if (product.creatorId !== uid) {
      throw new HttpsError("permission-denied", "Not your product");
    }

    // Verify content uploaded (check GCS)
    const contentPath = `creator-products/${uid}/${productId}/`;
    const [files] = await storage.bucket().getFiles({ prefix: contentPath });

    if (files.length === 0) {
      throw new HttpsError("failed-precondition", "No content uploaded");
    }

    await productDoc.ref.update({
      status: ProductStatus.ACTIVE,
      publishedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    logger.info(`Product published: ${productId}`);

    return { success: true };
  }
);

/**
 * Get creator products (public listing)
 */
export const getCreatorProductsV1 = onCall({ region: "europe-west3" }, async (request) => {
  const { creatorId, limit = 20, offset = 0 } = request.data;

  if (!creatorId) {
    throw new HttpsError("invalid-argument", "creatorId required");
  }

  const productsSnapshot = await db
    .collection("creatorProducts")
    .where("creatorId", "==", creatorId)
    .where("status", "==", ProductStatus.ACTIVE)
    .orderBy("publishedAt", "desc")
    .limit(limit + offset)
    .get();

  const products = productsSnapshot.docs.slice(offset).map((doc) => {
    const data = doc.data() as CreatorProduct;
    return {
      productId: data.productId,
      type: data.type,
      title: data.title,
      description: data.description,
      price: data.price,
      thumbnailUrl: data.thumbnailUrl,
      durationMinutes: data.durationMinutes,
      tags: data.tags,
      category: data.category,
      purchaseCount: data.purchaseCount,
      publishedAt: data.publishedAt,
    };
  });

  return {
    products,
    total: productsSnapshot.size,
  };
});

/**
 * Purchase creator product
 */
export const purchaseCreatorProductV1 = onCall(
  { region: "europe-west3", timeoutSeconds: 60 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { productId } = request.data;

    if (!productId) {
      throw new HttpsError("invalid-argument", "productId required");
    }

    try {
      // Get product
      const productDoc = await db.collection("creatorProducts").doc(productId).get();

      if (!productDoc.exists) {
        throw new HttpsError("not-found", "Product not found");
      }

      const product = productDoc.data() as CreatorProduct;

      if (product.status !== ProductStatus.ACTIVE) {
        throw new HttpsError("failed-precondition", "Product not available");
      }

      // Check if already purchased
      const existingPurchaseSnapshot = await db
        .collection("productPurchases")
        .where("buyerId", "==", uid)
        .where("productId", "==", productId)
        .where("status", "==", "completed")
        .limit(1)
        .get();

      if (!existingPurchaseSnapshot.empty) {
        throw new HttpsError("already-exists", "Already purchased");
      }

      // Get buyer balance
      const buyerDoc = await db.collection("users").doc(uid).get();
      const buyerBalance = buyerDoc.data()?.tokens || 0;

      if (buyerBalance < product.price) {
        throw new HttpsError("failed-precondition", "Insufficient tokens");
      }

      // Calculate revenue split (20/80 for creator products)
      const platformFee = Math.floor(product.price * 0.2); // 20%
      const creatorEarnings = product.price - platformFee; // 80%

      const purchaseId = `purchase_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Create purchase using transaction
      await db.runTransaction(async (transaction) => {
        // Deduct from buyer
        transaction.update(db.collection("users").doc(uid), {
          tokens: FieldValue.increment(-product.price),
        });

        // Credit creator
        transaction.update(db.collection("users").doc(product.creatorId), {
          tokens: FieldValue.increment(creatorEarnings),
        });

        // Create transaction records
        transaction.create(db.collection("transactions").doc(), {
          userId: uid,
          type: "product_purchase",
          amount: -product.price,
          productId,
          creatorId: product.creatorId,
          createdAt: Timestamp.now(),
        });

        transaction.create(db.collection("transactions").doc(), {
          userId: product.creatorId,
          type: "product_sale",
          amount: creatorEarnings,
          productId,
          buyerId: uid,
          createdAt: Timestamp.now(),
        });

        // Update product stats
        transaction.update(productDoc.ref, {
          purchaseCount: FieldValue.increment(1),
          totalRevenue: FieldValue.increment(product.price),
        });
      });

      // Generate signed URLs for content delivery
      const contentUrls = await generateContentUrls(product, uid);

      // Create purchase record
      const purchase: ProductPurchase = {
        purchaseId,
        productId,
        buyerId: uid,
        creatorId: product.creatorId,
        amount: product.price,
        platformFee,
        creatorEarnings,
        status: "completed",
        contentUrls,
        expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        purchasedAt: Timestamp.now(),
        deliveredAt: Timestamp.now(),
      };

      await db.collection("productPurchases").doc(purchaseId).set(purchase);

      logger.info(`Product purchased: ${productId} by ${uid}`);

      return {
        success: true,
        purchaseId,
        contentUrls,
        expiresAt: purchase.expiresAt?.toDate().toISOString(),
      };
    } catch (error: any) {
      logger.error("Product purchase failed:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Purchase failed");
    }
  }
);

/**
 * Get user purchases
 */
export const getMyPurchasesV1 = onCall({ region: "europe-west3" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const purchasesSnapshot = await db
    .collection("productPurchases")
    .where("buyerId", "==", uid)
    .where("status", "==", "completed")
    .orderBy("purchasedAt", "desc")
    .limit(50)
    .get();

  const purchases = await Promise.all(
    purchasesSnapshot.docs.map(async (doc) => {
      const purchase = doc.data() as ProductPurchase;

      // Get product details
      const productDoc = await db.collection("creatorProducts").doc(purchase.productId).get();
      const product = productDoc.data() as CreatorProduct;

      // Check if content URLs expired, regenerate if needed
      let contentUrls = purchase.contentUrls;
      if (purchase.expiresAt && purchase.expiresAt.toMillis() < Date.now()) {
        contentUrls = await generateContentUrls(product, uid);

        // Update purchase with new URLs
        await doc.ref.update({
          contentUrls,
          expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      }

      return {
        purchaseId: purchase.purchaseId,
        productId: purchase.productId,
        productTitle: product.title,
        productType: product.type,
        amount: purchase.amount,
        purchasedAt: purchase.purchasedAt,
        contentUrls,
        expiresAt: purchase.expiresAt,
      };
    })
  );

  return { purchases };
});

/**
 * Generate signed URLs for content delivery
 */
async function generateContentUrls(
  product: CreatorProduct,
  buyerId: string
): Promise<string[]> {
  const contentPath = `creator-products/${product.creatorId}/${product.productId}/`;
  const [files] = await storage.bucket().getFiles({ prefix: contentPath });

  // Filter out thumbnail
  const contentFiles = files.filter((f) => !f.name.includes("thumbnail"));

  const urls = await Promise.all(
    contentFiles.map(async (file) => {
      const [signedUrl] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      return signedUrl;
    })
  );

  return urls;
}

/**
 * Deactivate product (admin or creator)
 */
export const deactivateProductV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { productId, reason } = request.data;

    if (!productId) {
      throw new HttpsError("invalid-argument", "productId required");
    }

    const productDoc = await db.collection("creatorProducts").doc(productId).get();

    if (!productDoc.exists) {
      throw new HttpsError("not-found", "Product not found");
    }

    const product = productDoc.data() as CreatorProduct;

    // Check permission (creator or admin)
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    const isAdmin = userData?.role && ["admin", "moderator"].includes(userData.role);

    if (product.creatorId !== uid && !isAdmin) {
      throw new HttpsError("permission-denied", "Unauthorized");
    }

    await productDoc.ref.update({
      status: ProductStatus.ARCHIVED,
      updatedAt: Timestamp.now(),
    });

    logger.info(`Product deactivated: ${productId} by ${uid}, reason: ${reason || "N/A"}`);

    return { success: true };
  }
);

/**
 * Creator analytics
 */
export const getCreatorAnalyticsV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Get all creator products
    const productsSnapshot = await db
      .collection("creatorProducts")
      .where("creatorId", "==", uid)
      .get();

    let totalRevenue = 0;
    let totalPurchases = 0;
    let totalViews = 0;

    productsSnapshot.docs.forEach((doc) => {
      const product = doc.data() as CreatorProduct;
      totalRevenue += product.totalRevenue;
      totalPurchases += product.purchaseCount;
      totalViews += product.viewCount;
    });

    // Get recent purchases (last 30 days)
    const thirtyDaysAgo = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentPurchasesSnapshot = await db
      .collection("productPurchases")
      .where("creatorId", "==", uid)
      .where("purchasedAt", ">=", thirtyDaysAgo)
      .get();

    return {
      totalProducts: productsSnapshot.size,
      totalRevenue,
      totalPurchases,
      totalViews,
      recentPurchases: recentPurchasesSnapshot.size,
      averagePrice:
        productsSnapshot.size > 0 ? totalRevenue / totalPurchases || 0 : 0,
    };
  }
);


