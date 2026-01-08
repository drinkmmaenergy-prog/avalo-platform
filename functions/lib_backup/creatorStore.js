"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCreatorAnalyticsV1 = exports.deactivateProductV1 = exports.getMyPurchasesV1 = exports.purchaseCreatorProductV1 = exports.getCreatorProductsV1 = exports.publishCreatorProductV1 = exports.createCreatorProductV1 = exports.ProductStatus = exports.ProductType = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const v2_1 = require("firebase-functions/v2");
const zod_1 = require("zod");
const featureFlags_1 = require("./featureFlags");
const db = (0, firestore_1.getFirestore)();
const storage = (0, storage_1.getStorage)();
/**
 * Product types
 */
var ProductType;
(function (ProductType) {
    ProductType["PHOTO_PACK"] = "photo_pack";
    ProductType["VIDEO"] = "video";
    ProductType["CALL_SLOT"] = "call_slot";
    ProductType["CUSTOM"] = "custom";
})(ProductType || (exports.ProductType = ProductType = {}));
/**
 * Product status
 */
var ProductStatus;
(function (ProductStatus) {
    ProductStatus["DRAFT"] = "draft";
    ProductStatus["ACTIVE"] = "active";
    ProductStatus["PAUSED"] = "paused";
    ProductStatus["ARCHIVED"] = "archived";
})(ProductStatus || (exports.ProductStatus = ProductStatus = {}));
/**
 * Create creator product
 */
exports.createCreatorProductV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check feature flag
    const storeEnabled = await (0, featureFlags_1.getFeatureFlag)(uid, "creator_store", false);
    if (!storeEnabled) {
        throw new https_1.HttpsError("failed-precondition", "Creator store not enabled");
    }
    // Check if user is creator
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData?.role || userData.role !== "creator") {
        throw new https_1.HttpsError("permission-denied", "Only creators can create products");
    }
    // Validate input
    const schema = zod_1.z.object({
        type: zod_1.z.nativeEnum(ProductType),
        title: zod_1.z.string().min(3).max(100),
        description: zod_1.z.string().min(10).max(1000),
        price: zod_1.z.number().min(10).max(10000), // 10-10000 tokens
        durationMinutes: zod_1.z.number().optional(),
        tags: zod_1.z.array(zod_1.z.string()).optional(),
        category: zod_1.z.string().optional(),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { type, title, description, price, durationMinutes, tags, category } = validationResult.data;
    try {
        const productId = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const product = {
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
            createdAt: firestore_1.Timestamp.now(),
            updatedAt: firestore_1.Timestamp.now(),
        };
        // Generate upload URLs for content
        let uploadUrls = {};
        if (type === ProductType.PHOTO_PACK) {
            // Allow up to 10 photos
            const photoUrls = [];
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
            uploadUrls.photos = photoUrls;
        }
        else if (type === ProductType.VIDEO) {
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
        v2_1.logger.info(`Creator product created: ${productId} by ${uid}`);
        return {
            success: true,
            productId,
            uploadUrls,
            expiresIn: 3600, // seconds
        };
    }
    catch (error) {
        v2_1.logger.error("Product creation failed:", error);
        throw new https_1.HttpsError("internal", "Failed to create product");
    }
});
/**
 * Publish product (make it visible in store)
 */
exports.publishCreatorProductV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { productId } = request.data;
    if (!productId) {
        throw new https_1.HttpsError("invalid-argument", "productId required");
    }
    const productDoc = await db.collection("creatorProducts").doc(productId).get();
    if (!productDoc.exists) {
        throw new https_1.HttpsError("not-found", "Product not found");
    }
    const product = productDoc.data();
    if (product.creatorId !== uid) {
        throw new https_1.HttpsError("permission-denied", "Not your product");
    }
    // Verify content uploaded (check GCS)
    const contentPath = `creator-products/${uid}/${productId}/`;
    const [files] = await storage.bucket().getFiles({ prefix: contentPath });
    if (files.length === 0) {
        throw new https_1.HttpsError("failed-precondition", "No content uploaded");
    }
    await productDoc.ref.update({
        status: ProductStatus.ACTIVE,
        publishedAt: firestore_1.Timestamp.now(),
        updatedAt: firestore_1.Timestamp.now(),
    });
    v2_1.logger.info(`Product published: ${productId}`);
    return { success: true };
});
/**
 * Get creator products (public listing)
 */
exports.getCreatorProductsV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const { creatorId, limit = 20, offset = 0 } = request.data;
    if (!creatorId) {
        throw new https_1.HttpsError("invalid-argument", "creatorId required");
    }
    const productsSnapshot = await db
        .collection("creatorProducts")
        .where("creatorId", "==", creatorId)
        .where("status", "==", ProductStatus.ACTIVE)
        .orderBy("publishedAt", "desc")
        .limit(limit + offset)
        .get();
    const products = productsSnapshot.docs.slice(offset).map((doc) => {
        const data = doc.data();
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
exports.purchaseCreatorProductV1 = (0, https_1.onCall)({ region: "europe-west3", timeoutSeconds: 60 }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { productId } = request.data;
    if (!productId) {
        throw new https_1.HttpsError("invalid-argument", "productId required");
    }
    try {
        // Get product
        const productDoc = await db.collection("creatorProducts").doc(productId).get();
        if (!productDoc.exists) {
            throw new https_1.HttpsError("not-found", "Product not found");
        }
        const product = productDoc.data();
        if (product.status !== ProductStatus.ACTIVE) {
            throw new https_1.HttpsError("failed-precondition", "Product not available");
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
            throw new https_1.HttpsError("already-exists", "Already purchased");
        }
        // Get buyer balance
        const buyerDoc = await db.collection("users").doc(uid).get();
        const buyerBalance = buyerDoc.data()?.tokens || 0;
        if (buyerBalance < product.price) {
            throw new https_1.HttpsError("failed-precondition", "Insufficient tokens");
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
                tokens: firestore_1.FieldValue.increment(-product.price),
            });
            // Credit creator
            transaction.update(db.collection("users").doc(product.creatorId), {
                tokens: firestore_1.FieldValue.increment(creatorEarnings),
            });
            // Create transaction records
            transaction.create(db.collection("transactions").doc(), {
                userId: uid,
                type: "product_purchase",
                amount: -product.price,
                productId,
                creatorId: product.creatorId,
                createdAt: firestore_1.Timestamp.now(),
            });
            transaction.create(db.collection("transactions").doc(), {
                userId: product.creatorId,
                type: "product_sale",
                amount: creatorEarnings,
                productId,
                buyerId: uid,
                createdAt: firestore_1.Timestamp.now(),
            });
            // Update product stats
            transaction.update(productDoc.ref, {
                purchaseCount: firestore_1.FieldValue.increment(1),
                totalRevenue: firestore_1.FieldValue.increment(product.price),
            });
        });
        // Generate signed URLs for content delivery
        const contentUrls = await generateContentUrls(product, uid);
        // Create purchase record
        const purchase = {
            purchaseId,
            productId,
            buyerId: uid,
            creatorId: product.creatorId,
            amount: product.price,
            platformFee,
            creatorEarnings,
            status: "completed",
            contentUrls,
            expiresAt: firestore_1.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            purchasedAt: firestore_1.Timestamp.now(),
            deliveredAt: firestore_1.Timestamp.now(),
        };
        await db.collection("productPurchases").doc(purchaseId).set(purchase);
        v2_1.logger.info(`Product purchased: ${productId} by ${uid}`);
        return {
            success: true,
            purchaseId,
            contentUrls,
            expiresAt: purchase.expiresAt?.toDate().toISOString(),
        };
    }
    catch (error) {
        v2_1.logger.error("Product purchase failed:", error);
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError("internal", "Purchase failed");
    }
});
/**
 * Get user purchases
 */
exports.getMyPurchasesV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const purchasesSnapshot = await db
        .collection("productPurchases")
        .where("buyerId", "==", uid)
        .where("status", "==", "completed")
        .orderBy("purchasedAt", "desc")
        .limit(50)
        .get();
    const purchases = await Promise.all(purchasesSnapshot.docs.map(async (doc) => {
        const purchase = doc.data();
        // Get product details
        const productDoc = await db.collection("creatorProducts").doc(purchase.productId).get();
        const product = productDoc.data();
        // Check if content URLs expired, regenerate if needed
        let contentUrls = purchase.contentUrls;
        if (purchase.expiresAt && purchase.expiresAt.toMillis() < Date.now()) {
            contentUrls = await generateContentUrls(product, uid);
            // Update purchase with new URLs
            await doc.ref.update({
                contentUrls,
                expiresAt: firestore_1.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
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
    }));
    return { purchases };
});
/**
 * Generate signed URLs for content delivery
 */
async function generateContentUrls(product, buyerId) {
    const contentPath = `creator-products/${product.creatorId}/${product.productId}/`;
    const [files] = await storage.bucket().getFiles({ prefix: contentPath });
    // Filter out thumbnail
    const contentFiles = files.filter((f) => !f.name.includes("thumbnail"));
    const urls = await Promise.all(contentFiles.map(async (file) => {
        const [signedUrl] = await file.getSignedUrl({
            version: "v4",
            action: "read",
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        });
        return signedUrl;
    }));
    return urls;
}
/**
 * Deactivate product (admin or creator)
 */
exports.deactivateProductV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { productId, reason } = request.data;
    if (!productId) {
        throw new https_1.HttpsError("invalid-argument", "productId required");
    }
    const productDoc = await db.collection("creatorProducts").doc(productId).get();
    if (!productDoc.exists) {
        throw new https_1.HttpsError("not-found", "Product not found");
    }
    const product = productDoc.data();
    // Check permission (creator or admin)
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    const isAdmin = userData?.role && ["admin", "moderator"].includes(userData.role);
    if (product.creatorId !== uid && !isAdmin) {
        throw new https_1.HttpsError("permission-denied", "Unauthorized");
    }
    await productDoc.ref.update({
        status: ProductStatus.ARCHIVED,
        updatedAt: firestore_1.Timestamp.now(),
    });
    v2_1.logger.info(`Product deactivated: ${productId} by ${uid}, reason: ${reason || "N/A"}`);
    return { success: true };
});
/**
 * Creator analytics
 */
exports.getCreatorAnalyticsV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
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
        const product = doc.data();
        totalRevenue += product.totalRevenue;
        totalPurchases += product.purchaseCount;
        totalViews += product.viewCount;
    });
    // Get recent purchases (last 30 days)
    const thirtyDaysAgo = firestore_1.Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
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
        averagePrice: productsSnapshot.size > 0 ? totalRevenue / totalPurchases || 0 : 0,
    };
});
//# sourceMappingURL=creatorStore.js.map