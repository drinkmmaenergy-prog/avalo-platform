/**
 * Tests for Creator Marketplace (Phase 24)
 * Focus on revenue splits, pricing, and purchase flow
 */
describe("Creator Marketplace", () => {
    let ProductType;
    (function (ProductType) {
        ProductType["PHOTO_PACK"] = "photo_pack";
        ProductType["VIDEO"] = "video";
        ProductType["CALL_SLOT"] = "call_slot";
        ProductType["CUSTOM"] = "custom";
    })(ProductType || (ProductType = {}));
    let ProductStatus;
    (function (ProductStatus) {
        ProductStatus["DRAFT"] = "draft";
        ProductStatus["ACTIVE"] = "active";
        ProductStatus["PAUSED"] = "paused";
        ProductStatus["ARCHIVED"] = "archived";
    })(ProductStatus || (ProductStatus = {}));
    describe("Revenue Split Calculation", () => {
        const PLATFORM_PERCENTAGE = 0.2; // 20%
        const CREATOR_PERCENTAGE = 0.8; // 80%
        function calculateRevenueSplit(price) {
            const platformFee = Math.floor(price * PLATFORM_PERCENTAGE);
            const creatorEarnings = price - platformFee;
            return { platformFee, creatorEarnings };
        }
        test("should split 1000 tokens as 200/800", () => {
            const { platformFee, creatorEarnings } = calculateRevenueSplit(1000);
            expect(platformFee).toBe(200);
            expect(creatorEarnings).toBe(800);
        });
        test("should split 5000 tokens as 1000/4000", () => {
            const { platformFee, creatorEarnings } = calculateRevenueSplit(5000);
            expect(platformFee).toBe(1000);
            expect(creatorEarnings).toBe(4000);
        });
        test("should split 100 tokens as 20/80", () => {
            const { platformFee, creatorEarnings } = calculateRevenueSplit(100);
            expect(platformFee).toBe(20);
            expect(creatorEarnings).toBe(80);
        });
        test("should handle price of 1 token", () => {
            const { platformFee, creatorEarnings } = calculateRevenueSplit(1);
            expect(platformFee).toBe(0); // Floor of 0.2
            expect(creatorEarnings).toBe(1);
        });
        test("should ensure total equals original price", () => {
            const price = 7777;
            const { platformFee, creatorEarnings } = calculateRevenueSplit(price);
            expect(platformFee + creatorEarnings).toBe(price);
        });
        test("should maintain 20/80 split for large amounts", () => {
            const price = 100000;
            const { platformFee, creatorEarnings } = calculateRevenueSplit(price);
            expect(platformFee).toBe(20000);
            expect(creatorEarnings).toBe(80000);
        });
    });
    describe("Pricing Validation", () => {
        const MIN_PRICE = 10;
        const MAX_PRICE = 50000;
        function isValidPrice(price) {
            return (Number.isInteger(price) && price >= MIN_PRICE && price <= MAX_PRICE);
        }
        test("should accept valid price", () => {
            expect(isValidPrice(1000)).toBe(true);
        });
        test("should reject price below minimum", () => {
            expect(isValidPrice(5)).toBe(false);
        });
        test("should reject price above maximum", () => {
            expect(isValidPrice(60000)).toBe(false);
        });
        test("should reject non-integer price", () => {
            expect(isValidPrice(99.5)).toBe(false);
        });
        test("should accept minimum price", () => {
            expect(isValidPrice(10)).toBe(true);
        });
        test("should accept maximum price", () => {
            expect(isValidPrice(50000)).toBe(true);
        });
        test("should reject negative price", () => {
            expect(isValidPrice(-100)).toBe(false);
        });
        test("should reject zero price", () => {
            expect(isValidPrice(0)).toBe(false);
        });
    });
    describe("Product Availability Check", () => {
        function isProductAvailable(product) {
            if (product.status !== ProductStatus.ACTIVE)
                return false;
            if (product.stock !== undefined && product.stock <= 0)
                return false;
            return true;
        }
        test("should be available for active product with stock", () => {
            const product = {
                status: ProductStatus.ACTIVE,
                stock: 10,
            };
            expect(isProductAvailable(product)).toBe(true);
        });
        test("should be available for active product with no stock limit", () => {
            const product = {
                status: ProductStatus.ACTIVE,
            };
            expect(isProductAvailable(product)).toBe(true);
        });
        test("should not be available for draft product", () => {
            const product = {
                status: ProductStatus.DRAFT,
                stock: 10,
            };
            expect(isProductAvailable(product)).toBe(false);
        });
        test("should not be available for out-of-stock product", () => {
            const product = {
                status: ProductStatus.ACTIVE,
                stock: 0,
            };
            expect(isProductAvailable(product)).toBe(false);
        });
        test("should not be available for paused product", () => {
            const product = {
                status: ProductStatus.PAUSED,
                stock: 10,
            };
            expect(isProductAvailable(product)).toBe(false);
        });
        test("should not be available for archived product", () => {
            const product = {
                status: ProductStatus.ARCHIVED,
                stock: 10,
            };
            expect(isProductAvailable(product)).toBe(false);
        });
    });
    describe("Signed URL Expiration", () => {
        function generateSignedURL(fileType) {
            const expiryMinutes = fileType === "upload" ? 30 : 7 * 24 * 60; // 30 min or 7 days
            const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
            return {
                url: `https://storage.example.com/signed?expires=${expiresAt.getTime()}`,
                expiresAt,
            };
        }
        test("should expire upload URLs in 30 minutes", () => {
            const { expiresAt } = generateSignedURL("upload");
            const expiresInMinutes = (expiresAt.getTime() - Date.now()) / (1000 * 60);
            expect(expiresInMinutes).toBeCloseTo(30, 0);
        });
        test("should expire download URLs in 7 days", () => {
            const { expiresAt } = generateSignedURL("download");
            const expiresInDays = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            expect(expiresInDays).toBeCloseTo(7, 1);
        });
        function isURLExpired(expiresAt) {
            return new Date() > expiresAt;
        }
        test("should detect expired URL", () => {
            const pastDate = new Date(Date.now() - 1000);
            expect(isURLExpired(pastDate)).toBe(true);
        });
        test("should detect valid URL", () => {
            const futureDate = new Date(Date.now() + 1000 * 60 * 60);
            expect(isURLExpired(futureDate)).toBe(false);
        });
    });
    describe("Purchase Eligibility", () => {
        function canPurchase(user, product) {
            if (user.tokens < product.price) {
                return { eligible: false, reason: "insufficient_tokens" };
            }
            if (user.blockedCreators.includes(product.creatorId)) {
                return { eligible: false, reason: "creator_blocked" };
            }
            return { eligible: true };
        }
        test("should allow purchase with sufficient tokens", () => {
            const user = { tokens: 1000, blockedCreators: [] };
            const product = { price: 500, creatorId: "creator123" };
            const { eligible } = canPurchase(user, product);
            expect(eligible).toBe(true);
        });
        test("should block purchase with insufficient tokens", () => {
            const user = { tokens: 100, blockedCreators: [] };
            const product = { price: 500, creatorId: "creator123" };
            const { eligible, reason } = canPurchase(user, product);
            expect(eligible).toBe(false);
            expect(reason).toBe("insufficient_tokens");
        });
        test("should block purchase from blocked creator", () => {
            const user = { tokens: 1000, blockedCreators: ["creator123"] };
            const product = { price: 500, creatorId: "creator123" };
            const { eligible, reason } = canPurchase(user, product);
            expect(eligible).toBe(false);
            expect(reason).toBe("creator_blocked");
        });
        test("should allow purchase with exact token amount", () => {
            const user = { tokens: 500, blockedCreators: [] };
            const product = { price: 500, creatorId: "creator123" };
            const { eligible } = canPurchase(user, product);
            expect(eligible).toBe(true);
        });
    });
    describe("Product Type Validation", () => {
        const VALID_PRODUCT_TYPES = Object.values(ProductType);
        test("should accept valid product types", () => {
            expect(VALID_PRODUCT_TYPES).toContain(ProductType.PHOTO_PACK);
            expect(VALID_PRODUCT_TYPES).toContain(ProductType.VIDEO);
            expect(VALID_PRODUCT_TYPES).toContain(ProductType.CALL_SLOT);
            expect(VALID_PRODUCT_TYPES).toContain(ProductType.CUSTOM);
        });
        test("should have exactly 4 product types", () => {
            expect(VALID_PRODUCT_TYPES.length).toBe(4);
        });
        function isValidProductType(type) {
            return VALID_PRODUCT_TYPES.includes(type);
        }
        test("should validate known product type", () => {
            expect(isValidProductType("photo_pack")).toBe(true);
        });
        test("should reject unknown product type", () => {
            expect(isValidProductType("unknown_type")).toBe(false);
        });
    });
    describe("Stock Management", () => {
        function decrementStock(product) {
            if (product.stock === undefined) {
                return product; // Unlimited stock
            }
            return {
                ...product,
                stock: Math.max(0, product.stock - 1),
            };
        }
        test("should decrement stock for limited products", () => {
            const product = { stock: 10 };
            const updated = decrementStock(product);
            expect(updated.stock).toBe(9);
        });
        test("should not affect unlimited stock products", () => {
            const product = {};
            const updated = decrementStock(product);
            expect(updated.stock).toBeUndefined();
        });
        test("should not go below zero stock", () => {
            const product = { stock: 0 };
            const updated = decrementStock(product);
            expect(updated.stock).toBe(0);
        });
    });
    describe("Purchase Statistics", () => {
        function calculateTotalRevenue(purchases) {
            return {
                totalSales: purchases.reduce((sum, p) => sum + p.price, 0),
                totalRevenue: purchases.reduce((sum, p) => sum + p.creatorEarnings, 0),
                purchaseCount: purchases.length,
            };
        }
        test("should calculate statistics correctly", () => {
            const purchases = [
                { price: 1000, creatorEarnings: 800 },
                { price: 2000, creatorEarnings: 1600 },
                { price: 500, creatorEarnings: 400 },
            ];
            const stats = calculateTotalRevenue(purchases);
            expect(stats.totalSales).toBe(3500);
            expect(stats.totalRevenue).toBe(2800);
            expect(stats.purchaseCount).toBe(3);
        });
        test("should handle empty purchase list", () => {
            const purchases = [];
            const stats = calculateTotalRevenue(purchases);
            expect(stats.totalSales).toBe(0);
            expect(stats.totalRevenue).toBe(0);
            expect(stats.purchaseCount).toBe(0);
        });
        test("should handle single purchase", () => {
            const purchases = [
                { price: 1000, creatorEarnings: 800 },
            ];
            const stats = calculateTotalRevenue(purchases);
            expect(stats.totalSales).toBe(1000);
            expect(stats.totalRevenue).toBe(800);
            expect(stats.purchaseCount).toBe(1);
        });
    });
    describe("Download Limit Tracking", () => {
        function canDownload(purchase) {
            return purchase.downloadCount < purchase.downloadLimit;
        }
        test("should allow download under limit", () => {
            const purchase = { downloadCount: 2, downloadLimit: 5 };
            expect(canDownload(purchase)).toBe(true);
        });
        test("should block download at limit", () => {
            const purchase = { downloadCount: 5, downloadLimit: 5 };
            expect(canDownload(purchase)).toBe(false);
        });
        test("should allow first download", () => {
            const purchase = { downloadCount: 0, downloadLimit: 5 };
            expect(canDownload(purchase)).toBe(true);
        });
        test("should block download over limit", () => {
            const purchase = { downloadCount: 6, downloadLimit: 5 };
            expect(canDownload(purchase)).toBe(false);
        });
    });
    describe("Content URL Generation", () => {
        function generateContentURLs(productId, contentFiles) {
            return contentFiles.map((file) => `https://storage.googleapis.com/creator-products/${productId}/${file}`);
        }
        test("should generate URLs for multiple files", () => {
            const urls = generateContentURLs("product123", [
                "photo1.jpg",
                "photo2.jpg",
            ]);
            expect(urls.length).toBe(2);
            expect(urls[0]).toContain("product123");
            expect(urls[0]).toContain("photo1.jpg");
        });
        test("should handle single file", () => {
            const urls = generateContentURLs("product123", ["video.mp4"]);
            expect(urls.length).toBe(1);
            expect(urls[0]).toContain("video.mp4");
        });
        test("should handle empty file list", () => {
            const urls = generateContentURLs("product123", []);
            expect(urls.length).toBe(0);
        });
    });
    describe("Creator Analytics Aggregation", () => {
        function aggregateAnalytics(products) {
            return {
                totalRevenue: products.reduce((sum, p) => sum + p.totalRevenue, 0),
                totalPurchases: products.reduce((sum, p) => sum + p.purchaseCount, 0),
                totalViews: products.reduce((sum, p) => sum + p.viewCount, 0),
            };
        }
        test("should aggregate multiple products", () => {
            const products = [
                { totalRevenue: 5000, purchaseCount: 10, viewCount: 100 },
                { totalRevenue: 3000, purchaseCount: 5, viewCount: 80 },
            ];
            const analytics = aggregateAnalytics(products);
            expect(analytics.totalRevenue).toBe(8000);
            expect(analytics.totalPurchases).toBe(15);
            expect(analytics.totalViews).toBe(180);
        });
        test("should handle empty product list", () => {
            const products = [];
            const analytics = aggregateAnalytics(products);
            expect(analytics.totalRevenue).toBe(0);
            expect(analytics.totalPurchases).toBe(0);
            expect(analytics.totalViews).toBe(0);
        });
    });
});
//# sourceMappingURL=creatorStore.test.js.map