/**
 * ========================================================================
 * PACK 166: AVALO DIGITAL PRODUCT SCALABILITY ENGINE
 * ========================================================================
 * 
 * Backend Cloud Functions for:
 * - A/B Pricing Experiments
 * - Product Bundles
 * - Smart Upsells (Educational Only)
 * - Passive Revenue Automations
 * - Fair-Use Discounts
 * - Analytics & Performance Tracking
 * 
 * STRICT SAFETY: All operations validated by pack166-safety middleware
 * 
 * @version 1.0.0
 * @pack 166
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId, increment } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import {
  PricingTest,
  PricingTestVariant,
  PricingTestResult,
  ProductBundle,
  BundlePurchase,
  UpsellRule,
  UpsellImpression,
  ProductAutomation,
  AutomationExecution,
  ProductDiscount,
  DiscountUsage,
  ProductAnalytics,
  CreatorScalabilityMetrics,
  CreatePricingTestRequest,
  CreatePricingTestResponse,
  CreateBundleRequest,
  CreateBundleResponse,
  CreateUpsellRuleRequest,
  CreateUpsellRuleResponse,
  CreateAutomationRequest,
  CreateAutomationResponse,
  CreateDiscountRequest,
  CreateDiscountResponse,
  GetProductAnalyticsRequest,
  GetProductAnalyticsResponse,
  GetCreatorMetricsRequest,
  GetCreatorMetricsResponse,
} from './pack166-types';
import {
  validatePricingTest,
  validateProductBundle,
  validateUpsellRule,
  validateAutomation,
  validateDiscount,
} from './pack166-safety';

// ============================================================================
// CONSTANTS
// ============================================================================

const PLATFORM_FEE_PERCENTAGE = 0.35;
const CREATOR_EARNINGS_PERCENTAGE = 0.65;
const MIN_BUNDLE_PRODUCTS = 2;
const MAX_BUNDLE_PRODUCTS = 5;
const MAX_BUNDLE_DISCOUNT = 40;
const MAX_DISCOUNT_PERCENTAGE = 50;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function isVerifiedCreator(userId: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return false;
  
  const userData = userDoc.data();
  return userData?.verification?.status === 'approved' && 
         userData?.settings?.earnFromChat === true;
}

async function getProductById(productId: string) {
  const productDoc = await db.collection('digital_products').doc(productId).get();
  if (!productDoc.exists) {
    throw new HttpsError('not-found', 'Product not found');
  }
  return productDoc.data();
}

async function checkProductOwnership(productId: string, userId: string): Promise<boolean> {
  const product = await getProductById(productId);
  return product.creatorUserId === userId;
}

function calculateRevenueSplit(priceTokens: number): { platformFee: number; creatorEarnings: number } {
  const platformFee = Math.floor(priceTokens * PLATFORM_FEE_PERCENTAGE);
  const creatorEarnings = priceTokens - platformFee;
  return { platformFee, creatorEarnings };
}

// ============================================================================
// A/B PRICING TEST FUNCTIONS
// ============================================================================

/**
 * Create a new A/B pricing test
 */
export const createPricingTest = onCall<CreatePricingTestRequest, Promise<CreatePricingTestResponse>>(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!(await isVerifiedCreator(uid))) {
      throw new HttpsError('permission-denied', 'Only verified creators can create pricing tests');
    }
    
    const {
      productId,
      testName,
      description,
      variationType,
      variants,
      startDate,
      endDate,
      targetImpressions,
    } = request.data;
    
    if (!productId || !testName || !description || !variationType || !variants || !startDate || !endDate) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    if (!(await checkProductOwnership(productId, uid))) {
      throw new HttpsError('permission-denied', 'You do not own this product');
    }
    
    if (variants.length < 2 || variants.length > 4) {
      throw new HttpsError('invalid-argument', 'Must have 2-4 test variants');
    }
    
    const testId = generateId();
    const testVariants: PricingTestVariant[] = variants.map((v, idx) => ({
      variantId: `var_${idx}_${generateId().substring(0, 8)}`,
      variantName: v.variantName,
      priceTokens: v.priceTokens,
      discountPercentage: v.discountPercentage,
      bundleProductIds: v.bundleProductIds,
      description: v.description,
      impressions: 0,
      conversions: 0,
      revenue: 0,
    }));
    
    const pricingTest: PricingTest = {
      testId,
      productId,
      creatorUserId: uid,
      testName,
      description,
      variationType,
      variants: testVariants,
      status: 'DRAFT',
      startAt: Timestamp.fromDate(new Date(startDate)),
      endAt: Timestamp.fromDate(new Date(endDate)),
      targetImpressions: targetImpressions || 1000,
      currentImpressions: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      safetyApproved: false,
    };
    
    const safetyResult = validatePricingTest(pricingTest);
    pricingTest.safetyApproved = safetyResult.approved;
    pricingTest.safetyFlags = safetyResult.flags;
    
    if (!safetyResult.approved) {
      logger.warn('Pricing test rejected by safety validation', {
        testId,
        violations: safetyResult.violations,
      });
      throw new HttpsError(
        'failed-precondition',
        `Pricing test rejected: ${safetyResult.flags.join(', ')}`
      );
    }
    
    await db.collection('digital_product_tests').doc(testId).set(pricingTest);
    
    logger.info(`Pricing test created: ${testId}`);
    
    return { success: true, testId };
  }
);

/**
 * Calculate pricing test results
 */
export const calculatePricingTestResults = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { testId } = request.data;
    
    if (!testId) {
      throw new HttpsError('invalid-argument', 'Missing testId');
    }
    
    const testDoc = await db.collection('digital_product_tests').doc(testId).get();
    if (!testDoc.exists) {
      throw new HttpsError('not-found', 'Test not found');
    }
    
    const test = testDoc.data() as PricingTest;
    
    if (test.creatorUserId !== uid) {
      throw new HttpsError('permission-denied', 'Not your test');
    }
    
    const variantResults = test.variants.map(v => ({
      variantId: v.variantId,
      impressions: v.impressions,
      conversions: v.conversions,
      conversionRate: v.impressions > 0 ? v.conversions / v.impressions : 0,
      revenue: v.revenue,
      averageOrderValue: v.conversions > 0 ? v.revenue / v.conversions : 0,
    }));
    
    const winningVariant = variantResults.reduce((best, current) => 
      current.conversionRate > best.conversionRate ? current : best
    );
    
    const result: PricingTestResult = {
      testId,
      variantResults,
      winningVariantId: winningVariant.variantId,
      confidenceLevel: test.currentImpressions >= test.targetImpressions ? 95 : 70,
      recommendation: `Variant ${winningVariant.variantId} performed best with ${(winningVariant.conversionRate * 100).toFixed(2)}% conversion rate`,
      completedAt: Timestamp.now(),
    };
    
    await db.collection('digital_product_test_results').doc(testId).set(result);
    
    await testDoc.ref.update({
      status: 'COMPLETED',
      winningVariantId: winningVariant.variantId,
      updatedAt: serverTimestamp(),
    });
    
    logger.info(`Pricing test results calculated: ${testId}`);
    
    return { success: true, result };
  }
);

// ============================================================================
// BUNDLE FUNCTIONS
// ============================================================================

/**
 * Create a product bundle
 */
export const createBundleOffer = onCall<CreateBundleRequest, Promise<CreateBundleResponse>>(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!(await isVerifiedCreator(uid))) {
      throw new HttpsError('permission-denied', 'Only verified creators can create bundles');
    }
    
    const { bundleName, bundleDescription, productIds, bundlePriceTokens } = request.data;
    
    if (!bundleName || !bundleDescription || !productIds || !bundlePriceTokens) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    if (productIds.length < MIN_BUNDLE_PRODUCTS || productIds.length > MAX_BUNDLE_PRODUCTS) {
      throw new HttpsError(
        'invalid-argument',
        `Bundle must contain ${MIN_BUNDLE_PRODUCTS}-${MAX_BUNDLE_PRODUCTS} products`
      );
    }
    
    let totalIndividualPrice = 0;
    for (const productId of productIds) {
      if (!(await checkProductOwnership(productId, uid))) {
        throw new HttpsError('permission-denied', 'You do not own all bundled products');
      }
      const product = await getProductById(productId);
      totalIndividualPrice += product.priceTokens;
    }
    
    const discountPercentage = Math.round(((totalIndividualPrice - bundlePriceTokens) / totalIndividualPrice) * 100);
    
    if (discountPercentage > MAX_BUNDLE_DISCOUNT) {
      throw new HttpsError(
        'invalid-argument',
        `Bundle discount cannot exceed ${MAX_BUNDLE_DISCOUNT}%`
      );
    }
    
    const bundleId = generateId();
    const bundle: ProductBundle = {
      bundleId,
      creatorUserId: uid,
      bundleName,
      bundleDescription,
      productIds,
      individualPriceTotal: totalIndividualPrice,
      bundlePriceTokens,
      discountPercentage,
      status: 'DRAFT',
      purchaseCount: 0,
      viewCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      safetyApproved: false,
    };
    
    const safetyResult = validateProductBundle(bundle);
    bundle.safetyApproved = safetyResult.approved;
    bundle.safetyFlags = safetyResult.flags;
    
    if (!safetyResult.approved) {
      logger.warn('Bundle rejected by safety validation', {
        bundleId,
        violations: safetyResult.violations,
      });
      throw new HttpsError(
        'failed-precondition',
        `Bundle rejected: ${safetyResult.flags.join(', ')}`
      );
    }
    
    await db.collection('digital_product_bundles').doc(bundleId).set(bundle);
    
    logger.info(`Bundle created: ${bundleId}`);
    
    return { success: true, bundleId };
  }
);

/**
 * Purchase a product bundle
 */
export const purchaseBundle = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { bundleId } = request.data;
    
    if (!bundleId) {
      throw new HttpsError('invalid-argument', 'Missing bundleId');
    }
    
    return await db.runTransaction(async (tx) => {
      const bundleRef = db.collection('digital_product_bundles').doc(bundleId);
      const bundleDoc = await tx.get(bundleRef);
      
      if (!bundleDoc.exists) {
        throw new HttpsError('not-found', 'Bundle not found');
      }
      
      const bundle = bundleDoc.data() as ProductBundle;
      
      if (bundle.status !== 'ACTIVE') {
        throw new HttpsError('failed-precondition', 'Bundle is not active');
      }
      
      if (bundle.creatorUserId === uid) {
        throw new HttpsError('failed-precondition', 'Cannot purchase your own bundle');
      }
      
      const buyerRef = db.collection('users').doc(uid);
      const buyerDoc = await tx.get(buyerRef);
      
      if (!buyerDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }
      
      const buyer = buyerDoc.data();
      const balance = buyer?.wallet?.balance || 0;
      
      if (balance < bundle.bundlePriceTokens) {
        throw new HttpsError(
          'failed-precondition',
          `Insufficient tokens. Required: ${bundle.bundlePriceTokens}, Available: ${balance}`
        );
      }
      
      const { platformFee, creatorEarnings } = calculateRevenueSplit(bundle.bundlePriceTokens);
      
      const purchaseId = generateId();
      const productPurchaseIds: string[] = [];
      
      for (const productId of bundle.productIds) {
        const productPurchaseId = `${purchaseId}_${productId}`;
        productPurchaseIds.push(productPurchaseId);
      }
      
      const purchase: BundlePurchase = {
        purchaseId,
        bundleId,
        buyerUserId: uid,
        creatorUserId: bundle.creatorUserId,
        tokensAmount: bundle.bundlePriceTokens,
        platformFee,
        creatorEarnings,
        productPurchaseIds,
        purchasedAt: Timestamp.now(),
        status: 'active',
      };
      
      tx.update(buyerRef, {
        'wallet.balance': increment(-bundle.bundlePriceTokens),
        updatedAt: serverTimestamp(),
      });
      
      const creatorRef = db.collection('users').doc(bundle.creatorUserId);
      tx.update(creatorRef, {
        'wallet.balance': increment(creatorEarnings),
        'wallet.earned': increment(creatorEarnings),
        updatedAt: serverTimestamp(),
      });
      
      tx.update(bundleRef, {
        purchaseCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      
      const purchaseRef = db.collection('digital_product_bundle_purchases').doc(purchaseId);
      tx.set(purchaseRef, purchase);
      
      logger.info(`Bundle purchased: ${bundleId} by ${uid}`);
      
      return { success: true, purchaseId };
    });
  }
);

// ============================================================================
// UPSELL FUNCTIONS
// ============================================================================

/**
 * Create an upsell rule
 */
export const createUpsellRule = onCall<CreateUpsellRuleRequest, Promise<CreateUpsellRuleResponse>>(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!(await isVerifiedCreator(uid))) {
      throw new HttpsError('permission-denied', 'Only verified creators can create upsell rules');
    }
    
    const { ruleName, trigger, sourceProductId, targetProductIds, upsellType, priority } = request.data;
    
    if (!ruleName || !trigger || !sourceProductId || !targetProductIds || !upsellType) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    if (!(await checkProductOwnership(sourceProductId, uid))) {
      throw new HttpsError('permission-denied', 'You do not own the source product');
    }
    
    for (const targetId of targetProductIds) {
      if (!(await checkProductOwnership(targetId, uid))) {
        throw new HttpsError('permission-denied', 'You do not own all target products');
      }
    }
    
    const ruleId = generateId();
    const rule: UpsellRule = {
      ruleId,
      creatorUserId: uid,
      ruleName,
      trigger,
      sourceProductId,
      targetProductIds,
      upsellType,
      priority: priority || 0,
      active: false,
      conversions: 0,
      impressions: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      safetyApproved: false,
    };
    
    const safetyResult = validateUpsellRule(rule);
    rule.safetyApproved = safetyResult.approved;
    rule.safetyFlags = safetyResult.flags;
    
    if (!safetyResult.approved) {
      logger.warn('Upsell rule rejected by safety validation', {
        ruleId,
        violations: safetyResult.violations,
      });
      throw new HttpsError(
        'failed-precondition',
        `Upsell rule rejected: ${safetyResult.flags.join(', ')}`
      );
    }
    
    await db.collection('digital_product_upsell_rules').doc(ruleId).set(rule);
    
    logger.info(`Upsell rule created: ${ruleId}`);
    
    return { success: true, ruleId };
  }
);

/**
 * Record upsell impression
 */
export const recordUpsellImpression = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { ruleId, sourceProductId, targetProductId, trigger, clicked, converted } = request.data;
    
    const impressionId = generateId();
    const impression: UpsellImpression = {
      impressionId,
      ruleId,
      sourceProductId,
      targetProductId,
      userId: uid,
      trigger,
      shown: true,
      clicked: clicked || false,
      converted: converted || false,
      timestamp: Timestamp.now(),
    };
    
    await db.collection('digital_product_upsell_impressions').doc(impressionId).set(impression);
    
    await db.collection('digital_product_upsell_rules').doc(ruleId).update({
      impressions: increment(1),
      ...(clicked && { conversions: increment(1) }),
    });
    
    return { success: true, impressionId };
  }
);

// ============================================================================
// AUTOMATION FUNCTIONS
// ============================================================================

/**
 * Schedule a product automation
 */
export const scheduleProductAutomation = onCall<CreateAutomationRequest, Promise<CreateAutomationResponse>>(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!(await isVerifiedCreator(uid))) {
      throw new HttpsError('permission-denied', 'Only verified creators can create automations');
    }
    
    const { automationName, description, trigger, targetProductIds, conditions, actions } = request.data;
    
    if (!automationName || !description || !trigger || !targetProductIds || !conditions || !actions) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    for (const productId of targetProductIds) {
      if (!(await checkProductOwnership(productId, uid))) {
        throw new HttpsError('permission-denied', 'You do not own all target products');
      }
    }
    
    const automationId = generateId();
    const automation: ProductAutomation = {
      automationId,
      creatorUserId: uid,
      automationName,
      description,
      trigger,
      targetProductIds,
      conditions,
      actions,
      status: 'PAUSED',
      executionCount: 0,
      conversionCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      safetyApproved: false,
    };
    
    const safetyResult = validateAutomation(automation);
    automation.safetyApproved = safetyResult.approved;
    automation.safetyFlags = safetyResult.flags;
    
    if (!safetyResult.approved) {
      logger.warn('Automation rejected by safety validation', {
        automationId,
        violations: safetyResult.violations,
      });
      throw new HttpsError(
        'failed-precondition',
        `Automation rejected: ${safetyResult.flags.join(', ')}`
      );
    }
    
    await db.collection('digital_product_automations').doc(automationId).set(automation);
    
    logger.info(`Automation created: ${automationId}`);
    
    return { success: true, automationId };
  }
);

// ============================================================================
// DISCOUNT FUNCTIONS
// ============================================================================

/**
 * Apply a discount to products
 */
export const applyDiscount = onCall<CreateDiscountRequest, Promise<CreateDiscountResponse>>(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!(await isVerifiedCreator(uid))) {
      throw new HttpsError('permission-denied', 'Only verified creators can create discounts');
    }
    
    const {
      productIds,
      discountName,
      discountType,
      discountPercentage,
      startDate,
      endDate,
      maxUses,
      requirements,
    } = request.data;
    
    if (!productIds || !discountName || !discountType || !discountPercentage || !startDate || !endDate) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    if (discountPercentage > MAX_DISCOUNT_PERCENTAGE) {
      throw new HttpsError(
        'invalid-argument',
        `Discount cannot exceed ${MAX_DISCOUNT_PERCENTAGE}%`
      );
    }
    
    for (const productId of productIds) {
      if (!(await checkProductOwnership(productId, uid))) {
        throw new HttpsError('permission-denied', 'You do not own all products');
      }
    }
    
    const discountId = generateId();
    const discount: ProductDiscount = {
      discountId,
      creatorUserId: uid,
      productIds,
      discountName,
      discountType,
      discountPercentage,
      startAt: Timestamp.fromDate(new Date(startDate)),
      endAt: Timestamp.fromDate(new Date(endDate)),
      maxUses,
      currentUses: 0,
      requirements,
      status: 'SCHEDULED',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      safetyApproved: false,
    };
    
    const safetyResult = validateDiscount(discount);
    discount.safetyApproved = safetyResult.approved;
    discount.safetyFlags = safetyResult.flags;
    
    if (!safetyResult.approved) {
      logger.warn('Discount rejected by safety validation', {
        discountId,
        violations: safetyResult.violations,
      });
      throw new HttpsError(
        'failed-precondition',
        `Discount rejected: ${safetyResult.flags.join(', ')}`
      );
    }
    
    await db.collection('digital_product_discounts').doc(discountId).set(discount);
    
    logger.info(`Discount created: ${discountId}`);
    
    return { success: true, discountId };
  }
);

// ============================================================================
// ANALYTICS FUNCTIONS
// ============================================================================

/**
 * Track product analytics
 */
export const trackProductAnalytics = onCall<GetProductAnalyticsRequest, Promise<GetProductAnalyticsResponse>>(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { productId, startDate, endDate } = request.data;
    
    if (!productId || !startDate || !endDate) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    if (!(await checkProductOwnership(productId, uid))) {
      throw new HttpsError('permission-denied', 'You do not own this product');
    }
    
    const start = Timestamp.fromDate(new Date(startDate));
    const end = Timestamp.fromDate(new Date(endDate));
    
    const purchasesSnapshot = await db.collection('digital_product_purchases')
      .where('productId', '==', productId)
      .where('purchasedAt', '>=', start)
      .where('purchasedAt', '<=', end)
      .get();
    
    const purchases = purchasesSnapshot.docs.map(doc => doc.data());
    const totalRevenue = purchases.reduce((sum, p) => sum + p.tokensAmount, 0);
    const totalPurchases = purchases.length;
    
    const productDoc = await db.collection('digital_products').doc(productId).get();
    const product = productDoc.data();
    
    const analytics: ProductAnalytics = {
      analyticsId: generateId(),
      creatorUserId: uid,
      productId,
      period: { startDate: start, endDate: end },
      metrics: {
        impressions: product?.viewCount || 0,
        views: product?.viewCount || 0,
        purchases: totalPurchases,
        revenue: totalRevenue,
        conversionRate: product?.viewCount > 0 ? totalPurchases / product.viewCount : 0,
        averageOrderValue: totalPurchases > 0 ? totalRevenue / totalPurchases : 0,
        returnRate: 0,
      },
      sourceBreakdown: {
        feed: 0,
        challenge: 0,
        search: 0,
        club: 0,
        direct: totalPurchases,
      },
      calculatedAt: Timestamp.now(),
    };
    
    await db.collection('digital_product_analytics').doc(analytics.analyticsId).set(analytics);
    
    logger.info(`Analytics tracked for product: ${productId}`);
    
    return { success: true, analytics };
  }
);

/**
 * Get creator scalability metrics
 */
export const getCreatorScalabilityMetrics = onCall<GetCreatorMetricsRequest, Promise<GetCreatorMetricsResponse>>(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { startDate, endDate } = request.data;
    
    if (!startDate || !endDate) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    const start = Timestamp.fromDate(new Date(startDate));
    const end = Timestamp.fromDate(new Date(endDate));
    
    const productsSnapshot = await db.collection('digital_products')
      .where('creatorUserId', '==', uid)
      .get();
    
    const products = productsSnapshot.docs.map(doc => doc.data());
    const activeProducts = products.filter(p => p.isActive);
    
    const testsSnapshot = await db.collection('digital_product_tests')
      .where('creatorUserId', '==', uid)
      .get();
    
    const bundlesSnapshot = await db.collection('digital_product_bundles')
      .where('creatorUserId', '==', uid)
      .get();
    
    const automationsSnapshot = await db.collection('digital_product_automations')
      .where('creatorUserId', '==', uid)
      .get();
    
    const discountsSnapshot = await db.collection('digital_product_discounts')
      .where('creatorUserId', '==', uid)
      .get();
    
    const tests = testsSnapshot.docs.map(doc => doc.data());
    const bundles = bundlesSnapshot.docs.map(doc => doc.data());
    const automations = automationsSnapshot.docs.map(doc => doc.data());
    const discounts = discountsSnapshot.docs.map(doc => doc.data());
    
    const metrics: CreatorScalabilityMetrics = {
      creatorUserId: uid,
      period: { startDate: start, endDate: end },
      overview: {
        totalProducts: products.length,
        activeProducts: activeProducts.length,
        totalRevenue: 0,
        totalPurchases: 0,
        averageProductPrice: products.length > 0
          ? products.reduce((sum, p) => sum + p.priceTokens, 0) / products.length
          : 0,
      },
      testingMetrics: {
        activeTests: tests.filter(t => t.status === 'ACTIVE').length,
        completedTests: tests.filter(t => t.status === 'COMPLETED').length,
        averageConversionLift: 0,
      },
      bundleMetrics: {
        activeBundles: bundles.filter(b => b.status === 'ACTIVE').length,
        bundleRevenue: 0,
        bundleConversionRate: 0,
      },
      automationMetrics: {
        activeAutomations: automations.filter(a => a.status === 'ACTIVE').length,
        automationConversions: automations.reduce((sum, a) => sum + a.conversionCount, 0),
        automationRevenue: 0,
      },
      discountMetrics: {
        activeDiscounts: discounts.filter(d => d.status === 'ACTIVE').length,
        discountRedemptions: discounts.reduce((sum, d) => sum + d.currentUses, 0),
        discountRevenueLoss: 0,
      },
      topPerformingProducts: [],
      calculatedAt: Timestamp.now(),
    };
    
    logger.info(`Scalability metrics calculated for creator: ${uid}`);
    
    return { success: true, metrics };
  }
);

logger.info('✅ PACK 166 Scalability Engine (Backend) loaded successfully');