/**
 * ========================================================================
 * PACK 166: AVALO DIGITAL PRODUCT SCALABILITY ENGINE
 * ========================================================================
 * 
 * A/B Pricing · Bundle Logic · Ethical Upsells · Passive Revenue Automations
 * 
 * STRICT RULES:
 * - NO seductive/romantic funnels
 * - NO emotional manipulation
 * - NO "pay more for creator attention"
 * - NO ranking/visibility advantage
 * - All upsells must be value-driven, not emotional-driven
 * 
 * @version 1.0.0
 * @pack 166
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// A/B PRICING TEST TYPES
// ============================================================================

export type PricingTestStatus = 
  | 'DRAFT'
  | 'ACTIVE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED';

export type PricingVariationType =
  | 'BASE_PRICE'
  | 'DISCOUNT_DURATION'
  | 'BUNDLE_PRICE'
  | 'SUBSCRIPTION_ADDON';

export interface PricingTestVariant {
  variantId: string;
  variantName: string;
  priceTokens: number;
  discountPercentage?: number;
  bundleProductIds?: string[];
  description: string;
  impressions: number;
  conversions: number;
  revenue: number;
}

export interface PricingTest {
  testId: string;
  productId: string;
  creatorUserId: string;
  testName: string;
  description: string;
  variationType: PricingVariationType;
  variants: PricingTestVariant[];
  status: PricingTestStatus;
  startAt: Timestamp;
  endAt: Timestamp;
  targetImpressions: number;
  currentImpressions: number;
  winningVariantId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  safetyApproved: boolean;
  safetyFlags?: string[];
}

export interface PricingTestResult {
  testId: string;
  variantResults: {
    variantId: string;
    impressions: number;
    conversions: number;
    conversionRate: number;
    revenue: number;
    averageOrderValue: number;
  }[];
  winningVariantId: string;
  confidenceLevel: number;
  recommendation: string;
  completedAt: Timestamp;
}

// ============================================================================
// BUNDLE TYPES
// ============================================================================

export type BundleStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

export interface ProductBundle {
  bundleId: string;
  creatorUserId: string;
  bundleName: string;
  bundleDescription: string;
  productIds: string[];
  individualPriceTotal: number;
  bundlePriceTokens: number;
  discountPercentage: number;
  status: BundleStatus;
  purchaseCount: number;
  viewCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  safetyApproved: boolean;
  safetyFlags?: string[];
}

export interface BundlePurchase {
  purchaseId: string;
  bundleId: string;
  buyerUserId: string;
  creatorUserId: string;
  tokensAmount: number;
  platformFee: number;
  creatorEarnings: number;
  productPurchaseIds: string[];
  purchasedAt: Timestamp;
  status: 'active' | 'revoked';
}

// ============================================================================
// UPSELL TYPES
// ============================================================================

export type UpsellTrigger =
  | 'CHECKOUT'
  | 'COURSE_COMPLETION'
  | 'PRODUCT_VIEW'
  | 'PURCHASE_CONFIRMATION';

export type UpsellType =
  | 'RELATED_PRODUCT'
  | 'COMPLEMENTARY_PRODUCT'
  | 'BUNDLE_UPGRADE'
  | 'COURSE_CONTINUATION';

export interface UpsellRule {
  ruleId: string;
  creatorUserId: string;
  ruleName: string;
  trigger: UpsellTrigger;
  sourceProductId: string;
  targetProductIds: string[];
  upsellType: UpsellType;
  priority: number;
  active: boolean;
  conversions: number;
  impressions: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  safetyApproved: boolean;
  safetyFlags?: string[];
}

export interface UpsellImpression {
  impressionId: string;
  ruleId: string;
  sourceProductId: string;
  targetProductId: string;
  userId: string;
  trigger: UpsellTrigger;
  shown: boolean;
  clicked: boolean;
  converted: boolean;
  timestamp: Timestamp;
}

// ============================================================================
// AUTOMATION TYPES
// ============================================================================

export type AutomationTrigger =
  | 'ABANDONED_CART'
  | 'COURSE_MILESTONE'
  | 'NEW_PRODUCT_RELEASE'
  | 'LEARNING_PATH_RECOMMENDATION'
  | 'PURCHASE_ANNIVERSARY';

export type AutomationStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export interface ProductAutomation {
  automationId: string;
  creatorUserId: string;
  automationName: string;
  description: string;
  trigger: AutomationTrigger;
  targetProductIds: string[];
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  status: AutomationStatus;
  executionCount: number;
  conversionCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  safetyApproved: boolean;
  safetyFlags?: string[];
}

export interface AutomationCondition {
  type: 'TIME_DELAY' | 'PROGRESS_THRESHOLD' | 'PURCHASE_HISTORY' | 'PRODUCT_CATEGORY';
  value: any;
}

export interface AutomationAction {
  type: 'SEND_NOTIFICATION' | 'RECOMMEND_PRODUCT' | 'OFFER_DISCOUNT';
  parameters: Record<string, any>;
}

export interface AutomationExecution {
  executionId: string;
  automationId: string;
  userId: string;
  triggeredAt: Timestamp;
  completed: boolean;
  converted: boolean;
  resultProductId?: string;
}

// ============================================================================
// DISCOUNT TYPES
// ============================================================================

export type DiscountType =
  | 'LAUNCH'
  | 'LOYALTY'
  | 'BUNDLE'
  | 'EVENT'
  | 'SEASONAL';

export type DiscountStatus = 'SCHEDULED' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

export interface ProductDiscount {
  discountId: string;
  creatorUserId: string;
  productIds: string[];
  discountName: string;
  discountType: DiscountType;
  discountPercentage: number;
  startAt: Timestamp;
  endAt: Timestamp;
  maxUses?: number;
  currentUses: number;
  requirements?: DiscountRequirement[];
  status: DiscountStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  safetyApproved: boolean;
  safetyFlags?: string[];
}

export interface DiscountRequirement {
  type: 'MIN_PURCHASE' | 'REPEAT_CUSTOMER' | 'SPECIFIC_PRODUCT' | 'BUNDLE_PURCHASE';
  value: any;
}

export interface DiscountUsage {
  usageId: string;
  discountId: string;
  userId: string;
  productId: string;
  originalPrice: number;
  discountedPrice: number;
  savedTokens: number;
  usedAt: Timestamp;
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

export interface ProductAnalytics {
  analyticsId: string;
  creatorUserId: string;
  productId: string;
  period: {
    startDate: Timestamp;
    endDate: Timestamp;
  };
  metrics: {
    impressions: number;
    views: number;
    purchases: number;
    revenue: number;
    conversionRate: number;
    averageOrderValue: number;
    returnRate: number;
  };
  sourceBreakdown: {
    feed: number;
    challenge: number;
    search: number;
    club: number;
    direct: number;
  };
  retentionMetrics?: {
    completionRate: number;
    averageEngagementTime: number;
  };
  bundlePerformance?: {
    bundleId: string;
    purchases: number;
    revenue: number;
  }[];
  upsellPerformance?: {
    ruleId: string;
    impressions: number;
    conversions: number;
    revenue: number;
  }[];
  calculatedAt: Timestamp;
}

export interface CreatorScalabilityMetrics {
  creatorUserId: string;
  period: {
    startDate: Timestamp;
    endDate: Timestamp;
  };
  overview: {
    totalProducts: number;
    activeProducts: number;
    totalRevenue: number;
    totalPurchases: number;
    averageProductPrice: number;
  };
  testingMetrics: {
    activeTests: number;
    completedTests: number;
    averageConversionLift: number;
  };
  bundleMetrics: {
    activeBundles: number;
    bundleRevenue: number;
    bundleConversionRate: number;
  };
  automationMetrics: {
    activeAutomations: number;
    automationConversions: number;
    automationRevenue: number;
  };
  discountMetrics: {
    activeDiscounts: number;
    discountRedemptions: number;
    discountRevenueLoss: number;
  };
  topPerformingProducts: {
    productId: string;
    productTitle: string;
    revenue: number;
    purchases: number;
  }[];
  calculatedAt: Timestamp;
}

// ============================================================================
// SAFETY VALIDATION TYPES
// ============================================================================

export interface SafetyValidationResult {
  approved: boolean;
  flags: string[];
  violations: SafetyViolation[];
  score: number;
}

export interface SafetyViolation {
  type: SafetyViolationType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  field?: string;
}

export type SafetyViolationType =
  | 'SEDUCTIVE_DISCOUNT'
  | 'PARASOCIAL_UPSELL'
  | 'APPEARANCE_BASED_PRICING'
  | 'EMOTIONAL_COERCION'
  | 'ATTENTION_INCENTIVE'
  | 'ROMANTIC_LANGUAGE'
  | 'RANKING_MANIPULATION'
  | 'DARK_PATTERN'
  | 'NSFW_BUNDLE';

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreatePricingTestRequest {
  productId: string;
  testName: string;
  description: string;
  variationType: PricingVariationType;
  variants: Omit<PricingTestVariant, 'variantId' | 'impressions' | 'conversions' | 'revenue'>[];
  startDate: string;
  endDate: string;
  targetImpressions: number;
}

export interface CreatePricingTestResponse {
  success: boolean;
  testId?: string;
  error?: string;
}

export interface CreateBundleRequest {
  bundleName: string;
  bundleDescription: string;
  productIds: string[];
  bundlePriceTokens: number;
}

export interface CreateBundleResponse {
  success: boolean;
  bundleId?: string;
  error?: string;
}

export interface CreateUpsellRuleRequest {
  ruleName: string;
  trigger: UpsellTrigger;
  sourceProductId: string;
  targetProductIds: string[];
  upsellType: UpsellType;
  priority: number;
}

export interface CreateUpsellRuleResponse {
  success: boolean;
  ruleId?: string;
  error?: string;
}

export interface CreateAutomationRequest {
  automationName: string;
  description: string;
  trigger: AutomationTrigger;
  targetProductIds: string[];
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

export interface CreateAutomationResponse {
  success: boolean;
  automationId?: string;
  error?: string;
}

export interface CreateDiscountRequest {
  productIds: string[];
  discountName: string;
  discountType: DiscountType;
  discountPercentage: number;
  startDate: string;
  endDate: string;
  maxUses?: number;
  requirements?: DiscountRequirement[];
}

export interface CreateDiscountResponse {
  success: boolean;
  discountId?: string;
  error?: string;
}

export interface GetProductAnalyticsRequest {
  productId: string;
  startDate: string;
  endDate: string;
}

export interface GetProductAnalyticsResponse {
  success: boolean;
  analytics?: ProductAnalytics;
  error?: string;
}

export interface GetCreatorMetricsRequest {
  startDate: string;
  endDate: string;
}

export interface GetCreatorMetricsResponse {
  success: boolean;
  metrics?: CreatorScalabilityMetrics;
  error?: string;
}