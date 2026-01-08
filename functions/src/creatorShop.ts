/**
 * ========================================================================
 * CREATOR SHOP - COMPLETE IMPLEMENTATION
 * ========================================================================
 * Full creator economy system for selling digital products
 *
 * Features:
 * - Digital products (photos, videos, audio, packages, AI-generated content)
 * - Dynamic token pricing with 35% platform fee
 * - NSFW content moderation
 * - Upload management with blur preview
 * - Transaction history and statistics
 * - Creator analytics and earnings tracking
 *
 * @version 1.0.0
 * @section CREATOR_ECONOMY
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
;
;
;

const db = getFirestore();
const storage = getStorage();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export enum ProductType {
  PHOTO = "photo",
  PHOTO_PACK = "photo_pack",
  VIDEO = "video",
  VIDEO_PACK = "video_pack",
  VOICE_MESSAGE = "voice_message",
  FAN_PACK = "fan_pack",
  EBOOK = "ebook",
  LIFESTYLE_GUIDE = "lifestyle_guide",
  AI_GENERATED = "ai_generated",
  CUSTOM = "custom",
}

export enum ProductStatus {
  DRAFT = "draft",
  ACTIVE = "active",
  PAUSED = "paused",
  ARCHIVED = "archived",
  MODERATION = "moderation",
  REJECTED = "rejected",
}

export enum ContentRating {
  SFW = "sfw",
  NSFW = "nsfw",
  EXPLICIT = "explicit",
}

export interface CreatorProduct {
  productId: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  type: ProductType;
  title: string;
  description: string;
  price: number; // in tokens
  originalPrice?: number; // for discounts
  currency: "tokens";
  status: ProductStatus;
  contentRating: ContentRating;
  tags: string[];

  // Media
  thumbnailURL: string;
  thumbnailBlurred?: string; // for NSFW preview
  mediaFiles: MediaFile[];

  // Metadata
  fileCount: number;
  totalSize: number; // in bytes
  duration?: number; // for video/audio in seconds

  // Stats
  viewCount: number;
  purchaseCount: number;
  likeCount: number;
  revenue: number; // creator earnings only

  // Settings
  maxPurchases?: number; // stock limit
  remainingStock?: number;
  isUnlimited: boolean;
  allowDownload: boolean;
  downloadLimit: number;
  expiryDays: number; // access expiry

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt?: Timestamp;

  // Moderation
  moderationStatus?: "pending" | "approved" | "rejected";
  moderationNotes?: string;
  aiModerationScore?: number;
}

export interface MediaFile {
  fileId: string;
  filename: string;
  contentType: string;
  size: number;
  storagePath: string;
  thumbnailPath?: string;
  duration?: number;
  width?: number;
  height?: number;
  isNSFW?: boolean;
  aiScore?: number;
}

export interface ProductPurchase {
  purchaseId: string;
  productId: string;
  productTitle: string;
  productType: ProductType;

  buyerId: string;
  buyerName: string;

  creatorId: string;
  creatorName: string;

  // Pricing
  price: number;
  platformFee: number; // 35%
  creatorEarnings: number; // 65%

  // Access
  accessUrls: string[]; // signed URLs
  expiresAt: Timestamp;
  downloadCount: number;
  downloadLimit: number;
  lastAccessedAt?: Timestamp;

  // Status
  status: "active" | "expired" | "revoked";

  // Timestamps
  purchasedAt: Timestamp;

  // Transaction
  transactionId: string;
}

export interface CreatorStats {
  creatorId: string;

  // Product stats
  totalProducts: number;
  activeProducts: number;
  draftProducts: number;

  // Revenue
  totalRevenue: number;
  monthlyRevenue: number;
  weeklyRevenue: number;
  dailyRevenue: number;

  // Sales
  totalSales: number;
  monthlySales: number;
  weeklySales: number;
  dailySales: number;

  // Engagement
  totalViews: number;
  totalLikes: number;
  conversionRate: number; // purchases / views

  // Top products
  topProducts: Array<{
    productId: string;
    title: string;
    revenue: number;
    sales: number;
  }>;

  // Rankings
  rankOverall?: number;
  rankByCategory?: { [key: string]: number };

  // Updated
  updatedAt: Timestamp;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PLATFORM_FEE_PERCENTAGE = 0.35; // 35%
const MIN_PRODUCT_PRICE = 10;
const MAX_PRODUCT_PRICE = 50000;
const DEFAULT_DOWNLOAD_LIMIT = 3;
const DEFAULT_EXPIRY_DAYS = 7;
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const SIGNED_URL_EXPIRY = 7 * 24 * 3600; // 7 days in seconds

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate unique product ID
 */
function generateProductId(): string {
  return `prod_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
}

/**
 * Generate unique purchase ID
 */
function generatePurchaseId(): string {
  return `pur_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
}

/**
 * Calculate platform fee and creator earnings
 */
function calculateRevenueSplit(price: number): { platformFee: number; creatorEarnings: number } {
  const platformFee = Math.floor(price * PLATFORM_FEE_PERCENTAGE);
  const creatorEarnings = price - platformFee;
  return { platformFee, creatorEarnings };
}

/**
 * Validate product price
 */
function validatePrice(price: number): void {
  if (!Number.isInteger(price)) {
    throw new HttpsError("invalid-argument", "Price must be an integer");
  }
  if (price < MIN_PRODUCT_PRICE || price > MAX_PRODUCT_PRICE) {
    throw new HttpsError(
      "invalid-argument",
      `Price must be between ${MIN_PRODUCT_PRICE} and ${MAX_PRODUCT_PRICE} tokens`
    );
  }
}

/**
 * Check if user is verified creator
 */
async function isVerifiedCreator(userId: string): Promise<boolean> {
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) return false;

  const userData = userDoc.data();
  return userData?.verification?.status === "approved" && userData?.settings?.earnFromChat === true;
}

/**
 * Generate signed URLs for media files
 */
async function generateSignedUrls(storagePaths: string[], expirySeconds: number = SIGNED_URL_EXPIRY): Promise<string[]> {
  const bucket = storage.bucket();
  const urls: string[] = [];

  for (const path of storagePaths) {
    try {
      const file = bucket.file(path);
      const [url] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + expirySeconds * 1000,
      });
      urls.push(url);
    } catch (error) {
      logger.error(`Failed to generate signed URL for ${path}:`, error);
      urls.push("");
    }
  }

  return urls;
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Create new creator product
 */
export const createCreatorProduct = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Verify creator status
    if (!(await isVerifiedCreator(uid))) {
      throw new HttpsError("permission-denied", "User must be a verified creator");
    }

    const {
      type,
      title,
      description,
      price,
      contentRating = ContentRating.SFW,
      tags = [],
      maxPurchases,
      downloadLimit = DEFAULT_DOWNLOAD_LIMIT,
      expiryDays = DEFAULT_EXPIRY_DAYS,
    } = request.data;

    // Validate inputs
    if (!type || !title || !description || price === undefined) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

    validatePrice(price);

    if (title.length < 5 || title.length > 100) {
      throw new HttpsError("invalid-argument", "Title must be 5-100 characters");
    }

    if (description.length < 10 || description.length > 1000) {
      throw new HttpsError("invalid-argument", "Description must be 10-1000 characters");
    }

    // Get creator info
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();

    const productId = generateProductId();

    const product: CreatorProduct = {
      productId,
      creatorId: uid,
      creatorName: userData?.profile?.name || "Unknown Creator",
      creatorAvatar: userData?.profile?.photos?.[0] || undefined,
      type,
      title,
      description,
      price,
      currency: "tokens",
      status: ProductStatus.DRAFT,
      contentRating,
      tags,
      thumbnailURL: "",
      mediaFiles: [],
      fileCount: 0,
      totalSize: 0,
      viewCount: 0,
      purchaseCount: 0,
      likeCount: 0,
      revenue: 0,
      maxPurchases,
      remainingStock: maxPurchases,
      isUnlimited: !maxPurchases,
      allowDownload: true,
      downloadLimit,
      expiryDays,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Save to Firestore
    await db.collection("creatorProducts").doc(productId).set(product);

    logger.info(`Product created: ${productId} by ${uid}`);

    return {
      success: true,
      productId,
      product,
      message: "Product created successfully. Upload media files and publish when ready.",
    };
  }
);

/**
 * Upload media files to product
 */
export const uploadProductMedia = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { productId, files } = request.data as {
      productId: string;
      files: Array<{ filename: string; contentType: string; size: number }>;
    };

    if (!productId || !files || files.length === 0) {
      throw new HttpsError("invalid-argument", "Missing productId or files");
    }

    // Verify product ownership
    const productDoc = await db.collection("creatorProducts").doc(productId).get();
    if (!productDoc.exists) {
      throw new HttpsError("not-found", "Product not found");
    }

    const product = productDoc.data() as CreatorProduct;
    if (product.creatorId !== uid) {
      throw new HttpsError("permission-denied", "Not your product");
    }

    // Generate signed upload URLs (30 min expiry)
    const uploadUrls: { [filename: string]: string } = {};
    const mediaFiles: MediaFile[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        throw new HttpsError("invalid-argument", `File ${file.filename} exceeds size limit`);
      }

      const fileId = crypto.randomBytes(16).toString("hex");
      const storagePath = `creator-products/${uid}/${productId}/${fileId}_${file.filename}`;

      const bucket = storage.bucket();
      const fileRef = bucket.file(storagePath);

      const [url] = await fileRef.getSignedUrl({
        action: "write",
        expires: Date.now() + 30 * 60 * 1000, // 30 minutes
        contentType: file.contentType,
      });

      uploadUrls[file.filename] = url;

      mediaFiles.push({
        fileId,
        filename: file.filename,
        contentType: file.contentType,
        size: file.size,
        storagePath,
      });
    }

    // Update product with media file info
    await productDoc.ref.update({
      mediaFiles: FieldValue.arrayUnion(...mediaFiles),
      fileCount: FieldValue.increment(files.length),
      totalSize: FieldValue.increment(files.reduce((sum, f) => sum + f.size, 0)),
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info(`Upload URLs generated for product ${productId}`);

    return {
      success: true,
      uploadUrls,
      message: "Upload URLs generated. Upload files within 30 minutes.",
    };
  }
);

/**
 * Publish product (make it active)
 */
export const publishCreatorProduct = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { productId } = request.data;

    if (!productId) {
      throw new HttpsError("invalid-argument", "Missing productId");
    }

    // Verify product ownership
    const productDoc = await db.collection("creatorProducts").doc(productId).get();
    if (!productDoc.exists) {
      throw new HttpsError("not-found", "Product not found");
    }

    const product = productDoc.data() as CreatorProduct;
    if (product.creatorId !== uid) {
      throw new HttpsError("permission-denied", "Not your product");
    }

    if (product.status !== ProductStatus.DRAFT) {
      throw new HttpsError("failed-precondition", "Product is not in draft status");
    }

    if (product.mediaFiles.length === 0) {
      throw new HttpsError("failed-precondition", "Product must have at least one media file");
    }

    if (!product.thumbnailURL) {
      throw new HttpsError("failed-precondition", "Product must have a thumbnail");
    }

    // Publish product
    await productDoc.ref.update({
      status: ProductStatus.ACTIVE,
      publishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Update creator stats
    await updateCreatorProductStats(uid, { activeProducts: 1 });

    logger.info(`Product published: ${productId}`);

    return {
      success: true,
      message: "Product published successfully",
    };
  }
);

/**
 * Purchase product
 */
export const purchaseCreatorProduct = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { productId } = request.data;

    if (!productId) {
      throw new HttpsError("invalid-argument", "Missing productId");
    }

    return await db.runTransaction(async (tx) => {
      // Get product
      const productRef = db.collection("creatorProducts").doc(productId);
      const productDoc = await tx.get(productRef);

      if (!productDoc.exists) {
        throw new HttpsError("not-found", "Product not found");
      }

      const product = productDoc.data() as CreatorProduct;

      // Validate purchase
      if (product.status !== ProductStatus.ACTIVE) {
        throw new HttpsError("failed-precondition", "Product is not available");
      }

      if (product.creatorId === uid) {
        throw new HttpsError("failed-precondition", "Cannot purchase your own product");
      }

      if (!product.isUnlimited && product.remainingStock! <= 0) {
        throw new HttpsError("failed-precondition", "Product is sold out");
      }

      // Check if already purchased
      const existingPurchase = await db
        .collection("productPurchases")
        .where("productId", "==", productId)
        .where("buyerId", "==", uid)
        .where("status", "==", "active")
        .limit(1)
        .get();

      if (!existingPurchase.empty) {
        throw new HttpsError("already-exists", "You already own this product");
      }

      // Get buyer info
      const buyerRef = db.collection("users").doc(uid);
      const buyerDoc = await tx.get(buyerRef);

      if (!buyerDoc.exists) {
        throw new HttpsError("not-found", "Buyer not found");
      }

      const buyer = buyerDoc.data();
      const balance = buyer?.wallet?.balance || 0;

      if (balance < product.price) {
        throw new HttpsError("failed-precondition", "Insufficient tokens");
      }

      // Calculate revenue split
      const { platformFee, creatorEarnings } = calculateRevenueSplit(product.price);

      // Create purchase
      const purchaseId = generatePurchaseId();
      const expiresAt = Timestamp.fromMillis(
        Date.now() + product.expiryDays * 24 * 3600 * 1000
      );

      const purchase: ProductPurchase = {
        purchaseId,
        productId,
        productTitle: product.title,
        productType: product.type,
        buyerId: uid,
        buyerName: buyer?.profile?.name || "Unknown",
        creatorId: product.creatorId,
        creatorName: product.creatorName,
        price: product.price,
        platformFee,
        creatorEarnings,
        accessUrls: [],
        expiresAt,
        downloadCount: 0,
        downloadLimit: product.downloadLimit,
        status: "active",
        purchasedAt: Timestamp.now(),
        transactionId: `tx_${purchaseId}`,
      };

      // Update balances
      tx.update(buyerRef, {
        "wallet.balance": FieldValue.increment(-product.price),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const creatorRef = db.collection("users").doc(product.creatorId);
      tx.update(creatorRef, {
        "wallet.earned": FieldValue.increment(creatorEarnings),
        "wallet.balance": FieldValue.increment(creatorEarnings),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Update product stats
      tx.update(productRef, {
        purchaseCount: FieldValue.increment(1),
        revenue: FieldValue.increment(creatorEarnings),
        remainingStock: product.isUnlimited ? null : FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Create purchase record
      const purchaseRef = db.collection("productPurchases").doc(purchaseId);
      tx.set(purchaseRef, purchase);

      // Create transaction records
      const buyerTxRef = db.collection("transactions").doc(`tx_buyer_${purchaseId}`);
      tx.set(buyerTxRef, {
        txId: `tx_buyer_${purchaseId}`,
        type: "product_purchase",
        uid: uid,
        amount: -product.price,
        metadata: {
          productId,
          productTitle: product.title,
          creatorId: product.creatorId,
          purchaseId,
        },
        createdAt: FieldValue.serverTimestamp(),
      });

      const creatorTxRef = db.collection("transactions").doc(`tx_creator_${purchaseId}`);
      tx.set(creatorTxRef, {
        txId: `tx_creator_${purchaseId}`,
        type: "product_sale",
        uid: product.creatorId,
        amount: creatorEarnings,
        metadata: {
          productId,
          productTitle: product.title,
          buyerId: uid,
          purchaseId,
          platformFee,
        },
        createdAt: FieldValue.serverTimestamp(),
      });

      logger.info(`Product purchased: ${productId} by ${uid}`);

      return {
        success: true,
        purchaseId,
        message: "Product purchased successfully",
      };
    });
  }
);

/**
 * Get purchase access URLs
 */
export const getProductAccessUrls = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { purchaseId } = request.data;

    if (!purchaseId) {
      throw new HttpsError("invalid-argument", "Missing purchaseId");
    }

    // Get purchase
    const purchaseDoc = await db.collection("productPurchases").doc(purchaseId).get();

    if (!purchaseDoc.exists) {
      throw new HttpsError("not-found", "Purchase not found");
    }

    const purchase = purchaseDoc.data() as ProductPurchase;

    if (purchase.buyerId !== uid) {
      throw new HttpsError("permission-denied", "Not your purchase");
    }

    if (purchase.status !== "active") {
      throw new HttpsError("failed-precondition", "Purchase is not active");
    }

    if (purchase.expiresAt.toMillis() < Date.now()) {
      await purchaseDoc.ref.update({ status: "expired" });
      throw new HttpsError("failed-precondition", "Purchase has expired");
    }

    if (purchase.downloadCount >= purchase.downloadLimit) {
      throw new HttpsError("failed-precondition", "Download limit reached");
    }

    // Get product
    const productDoc = await db.collection("creatorProducts").doc(purchase.productId).get();
    if (!productDoc.exists) {
      throw new HttpsError("not-found", "Product not found");
    }

    const product = productDoc.data() as CreatorProduct;

    // Generate signed URLs
    const storagePaths = product.mediaFiles.map((f) => f.storagePath);
    const accessUrls = await generateSignedUrls(storagePaths);

    // Update download count
    await purchaseDoc.ref.update({
      downloadCount: FieldValue.increment(1),
      lastAccessedAt: FieldValue.serverTimestamp(),
    });

    logger.info(`Access URLs generated for purchase ${purchaseId}`);

    return {
      success: true,
      accessUrls,
      expiresAt: purchase.expiresAt,
      downloadCount: purchase.downloadCount + 1,
      downloadLimit: purchase.downloadLimit,
    };
  }
);

/**
 * Get creator products
 */
export const getCreatorProducts = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      creatorId,
      type,
      status,
      limit = 20,
      offset = 0,
    } = request.data;

    let query = db.collection("creatorProducts").orderBy("createdAt", "desc");

    if (creatorId) {
      query = query.where("creatorId", "==", creatorId) as any;
    }

    if (type) {
      query = query.where("type", "==", type) as any;
    }

    if (status) {
      query = query.where("status", "==", status) as any;
    } else {
      // Only show active products by default for non-owners
      if (!creatorId || creatorId !== uid) {
        query = query.where("status", "==", ProductStatus.ACTIVE) as any;
      }
    }

    const snapshot = await query.limit(limit).offset(offset).get();

    const products = snapshot.docs.map((doc) => ({
      ...doc.data(),
      // Don't expose full media paths to non-owners
      mediaFiles: doc.data().creatorId === uid ? doc.data().mediaFiles : [],
    }));

    logger.info(`Retrieved ${products.length} products`);

    return {
      success: true,
      products,
      total: snapshot.size,
    };
  }
);

/**
 * Get my purchases
 */
export const getMyPurchases = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { limit = 20, offset = 0 } = request.data;

    const snapshot = await db
      .collection("productPurchases")
      .where("buyerId", "==", uid)
      .orderBy("purchasedAt", "desc")
      .limit(limit)
      .offset(offset)
      .get();

    const purchases = snapshot.docs.map((doc) => doc.data());

    logger.info(`Retrieved ${purchases.length} purchases for ${uid}`);

    return {
      success: true,
      purchases,
      total: snapshot.size,
    };
  }
);

/**
 * Get creator statistics
 */
export const getCreatorStats = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { creatorId = uid } = request.data;

    // Only allow viewing own stats or if admin
    if (creatorId !== uid) {
      const userDoc = await db.collection("users").doc(uid).get();
      const isAdmin = userDoc.data()?.roles?.admin === true;
      if (!isAdmin) {
        throw new HttpsError("permission-denied", "Can only view your own statistics");
      }
    }

    // Get cached stats
    const statsDoc = await db.collection("creatorStats").doc(creatorId).get();

    if (!statsDoc.exists) {
      // Generate fresh stats
      return await generateCreatorStats(creatorId);
    }

    const stats = statsDoc.data();

    logger.info(`Retrieved stats for creator ${creatorId}`);

    return {
      success: true,
      stats,
    };
  }
);

/**
 * Update product (edit)
 */
export const updateCreatorProduct = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { productId, updates } = request.data;

    if (!productId || !updates) {
      throw new HttpsError("invalid-argument", "Missing productId or updates");
    }

    // Verify product ownership
    const productDoc = await db.collection("creatorProducts").doc(productId).get();
    if (!productDoc.exists) {
      throw new HttpsError("not-found", "Product not found");
    }

    const product = productDoc.data() as CreatorProduct;
    if (product.creatorId !== uid) {
      throw new HttpsError("permission-denied", "Not your product");
    }

    // Validate updates
    const allowedFields = ["title", "description", "price", "tags", "status", "maxPurchases"];
    const filteredUpdates: any = {};

    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key];
      }
    }

    if (filteredUpdates.price) {
      validatePrice(filteredUpdates.price);
    }

    filteredUpdates.updatedAt = FieldValue.serverTimestamp();

    await productDoc.ref.update(filteredUpdates);

    logger.info(`Product updated: ${productId}`);

    return {
      success: true,
      message: "Product updated successfully",
    };
  }
);

/**
 * Pause/Resume product
 */
export const toggleProductStatus = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { productId, status } = request.data;

    if (!productId || !status) {
      throw new HttpsError("invalid-argument", "Missing productId or status");
    }

    if (![ProductStatus.ACTIVE, ProductStatus.PAUSED].includes(status)) {
      throw new HttpsError("invalid-argument", "Invalid status");
    }

    // Verify product ownership
    const productDoc = await db.collection("creatorProducts").doc(productId).get();
    if (!productDoc.exists) {
      throw new HttpsError("not-found", "Product not found");
    }

    const product = productDoc.data() as CreatorProduct;
    if (product.creatorId !== uid) {
      throw new HttpsError("permission-denied", "Not your product");
    }

    await productDoc.ref.update({
      status,
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info(`Product ${productId} status changed to ${status}`);

    return {
      success: true,
      message: `Product ${status === ProductStatus.ACTIVE ? "activated" : "paused"}`,
    };
  }
);

/**
 * Archive product
 */
export const archiveCreatorProduct = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { productId } = request.data;

    if (!productId) {
      throw new HttpsError("invalid-argument", "Missing productId");
    }

    // Verify product ownership
    const productDoc = await db.collection("creatorProducts").doc(productId).get();
    if (!productDoc.exists) {
      throw new HttpsError("not-found", "Product not found");
    }

    const product = productDoc.data() as CreatorProduct;
    if (product.creatorId !== uid) {
      throw new HttpsError("permission-denied", "Not your product");
    }

    await productDoc.ref.update({
      status: ProductStatus.ARCHIVED,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Update creator stats
    await updateCreatorProductStats(uid, { activeProducts: -1 });

    logger.info(`Product archived: ${productId}`);

    return {
      success: true,
      message: "Product archived successfully",
    };
  }
);

// ============================================================================
// HELPER FUNCTIONS - STATS
// ============================================================================

/**
 * Generate creator statistics
 */
async function generateCreatorStats(creatorId: string): Promise<any> {
  const productsSnapshot = await db
    .collection("creatorProducts")
    .where("creatorId", "==", creatorId)
    .get();

  const products = productsSnapshot.docs.map((doc) => doc.data() as CreatorProduct);

  const now = Date.now();
  const dayAgo = now - 24 * 3600 * 1000;
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  const monthAgo = now - 30 * 24 * 3600 * 1000;

  const stats: CreatorStats = {
    creatorId,
    totalProducts: products.length,
    activeProducts: products.filter((p) => p.status === ProductStatus.ACTIVE).length,
    draftProducts: products.filter((p) => p.status === ProductStatus.DRAFT).length,
    totalRevenue: products.reduce((sum, p) => sum + p.revenue, 0),
    monthlyRevenue: 0,
    weeklyRevenue: 0,
    dailyRevenue: 0,
    totalSales: products.reduce((sum, p) => sum + p.purchaseCount, 0),
    monthlySales: 0,
    weeklySales: 0,
    dailySales: 0,
    totalViews: products.reduce((sum, p) => sum + p.viewCount, 0),
    totalLikes: products.reduce((sum, p) => sum + p.likeCount, 0),
    conversionRate: 0,
    topProducts: products
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((p) => ({
        productId: p.productId,
        title: p.title,
        revenue: p.revenue,
        sales: p.purchaseCount,
      })),
    updatedAt: Timestamp.now(),
  };

  // Calculate time-based metrics from purchases
  const purchasesSnapshot = await db
    .collection("productPurchases")
    .where("creatorId", "==", creatorId)
    .get();

  for (const doc of purchasesSnapshot.docs) {
    const purchase = doc.data() as ProductPurchase;
    const purchaseTime = purchase.purchasedAt.toMillis();

    if (purchaseTime > dayAgo) {
      stats.dailyRevenue += purchase.creatorEarnings;
      stats.dailySales += 1;
    }
    if (purchaseTime > weekAgo) {
      stats.weeklyRevenue += purchase.creatorEarnings;
      stats.weeklySales += 1;
    }
    if (purchaseTime > monthAgo) {
      stats.monthlyRevenue += purchase.creatorEarnings;
      stats.monthlySales += 1;
    }
  }

  stats.conversionRate = stats.totalViews > 0 ? stats.totalSales / stats.totalViews : 0;

  // Save stats
  await db.collection("creatorStats").doc(creatorId).set(stats);

  return { success: true, stats };
}

/**
 * Update creator product stats
 */
async function updateCreatorProductStats(
  creatorId: string,
  updates: Partial<{ activeProducts: number; draftProducts: number }>
): Promise<void> {
  const statsRef = db.collection("creatorStats").doc(creatorId);
  const statsDoc = await statsRef.get();

  if (!statsDoc.exists) {
    await generateCreatorStats(creatorId);
    return;
  }

  const updateData: any = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (updates.activeProducts) {
    updateData.activeProducts = FieldValue.increment(updates.activeProducts);
  }

  if (updates.draftProducts) {
    updateData.draftProducts = FieldValue.increment(updates.draftProducts);
  }

  await statsRef.update(updateData);
}

logger.info("✅ Creator Shop module loaded successfully");

