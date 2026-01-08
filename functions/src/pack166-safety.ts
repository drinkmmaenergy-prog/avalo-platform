/**
 * ========================================================================
 * PACK 166: DIGITAL PRODUCT SCALABILITY - SAFETY MIDDLEWARE
 * ========================================================================
 * 
 * Comprehensive safety validation to prevent:
 * - Seductive/romantic pricing or discounts
 * - Parasocial upsells
 * - Appearance-based incentives
 * - Emotional coercion copywriting
 * - Attention-based pricing tiers
 * 
 * @version 1.0.0
 * @pack 166
 */

import {
  SafetyValidationResult,
  SafetyViolation,
  SafetyViolationType,
  PricingTest,
  ProductBundle,
  UpsellRule,
  ProductAutomation,
  ProductDiscount,
} from './pack166-types';
import * as logger from 'firebase-functions/logger';

// ============================================================================
// FORBIDDEN KEYWORDS & PATTERNS
// ============================================================================

const ROMANTIC_KEYWORDS = [
  'boyfriend', 'girlfriend', 'date', 'dating', 'romance', 'romantic',
  'flirt', 'flirty', 'sexy', 'hot', 'steamy', 'intimate', 'affection',
  'love', 'crush', 'attracted', 'attraction', 'desire', 'seduce',
  'seductive', 'tease', 'teasing', 'playful', 'naughty',
];

const ATTENTION_KEYWORDS = [
  'get noticed', 'creator attention', 'personal attention', 'special treatment',
  'priority access', 'exclusive attention', 'noticed by', 'stand out to',
  'get closer to', 'personal connection', 'direct access', 'one-on-one',
];

const EMOTIONAL_MANIPULATION_KEYWORDS = [
  'lonely', 'loneliness', 'alone', 'unloved', 'rejected', 'unwanted',
  'ignored', 'forgotten', 'desperate', 'craving', 'need you', 'miss me',
  'think of you', 'remember me', 'special to me', 'care about you',
];

const RANKING_KEYWORDS = [
  'visibility boost', 'ranking boost', 'top fan', 'priority placement',
  'featured profile', 'discovery boost', 'algorithm boost', 'more exposure',
  'get seen', 'increase visibility',
];

const DARK_PATTERN_PHRASES = [
  'limited time', 'urgent', 'act now', 'hurry', 'don\'t miss out',
  'last chance', 'expiring soon', 'only for you', 'exclusive offer',
  'secret deal', 'insider access',
];

const NSFW_KEYWORDS = [
  'nude', 'naked', 'nsfw', 'adult', 'explicit', 'xxx', 'porn',
  'erotic', 'sensual', 'lingerie', 'bikini', 'underwear', 'bedroom',
];

// ============================================================================
// SAFETY VALIDATION FUNCTIONS
// ============================================================================

/**
 * Check text for forbidden keywords
 */
function containsForbiddenKeywords(text: string, keywords: string[]): string[] {
  const lowerText = text.toLowerCase();
  const found: string[] = [];
  
  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      found.push(keyword);
    }
  }
  
  return found;
}

/**
 * Detect romantic/seductive language
 */
function detectRomanticLanguage(text: string): SafetyViolation[] {
  const violations: SafetyViolation[] = [];
  const found = containsForbiddenKeywords(text, ROMANTIC_KEYWORDS);
  
  if (found.length > 0) {
    violations.push({
      type: 'ROMANTIC_LANGUAGE',
      severity: 'CRITICAL',
      description: `Romantic keywords detected: ${found.join(', ')}`,
      field: 'text_content',
    });
  }
  
  return violations;
}

/**
 * Detect attention-based incentives
 */
function detectAttentionIncentives(text: string): SafetyViolation[] {
  const violations: SafetyViolation[] = [];
  const found = containsForbiddenKeywords(text, ATTENTION_KEYWORDS);
  
  if (found.length > 0) {
    violations.push({
      type: 'ATTENTION_INCENTIVE',
      severity: 'CRITICAL',
      description: `Attention-based incentives detected: ${found.join(', ')}`,
      field: 'text_content',
    });
  }
  
  return violations;
}

/**
 * Detect emotional manipulation
 */
function detectEmotionalCoercion(text: string): SafetyViolation[] {
  const violations: SafetyViolation[] = [];
  const found = containsForbiddenKeywords(text, EMOTIONAL_MANIPULATION_KEYWORDS);
  
  if (found.length > 0) {
    violations.push({
      type: 'EMOTIONAL_COERCION',
      severity: 'HIGH',
      description: `Emotional manipulation detected: ${found.join(', ')}`,
      field: 'text_content',
    });
  }
  
  return violations;
}

/**
 * Detect ranking manipulation
 */
function detectRankingManipulation(text: string): SafetyViolation[] {
  const violations: SafetyViolation[] = [];
  const found = containsForbiddenKeywords(text, RANKING_KEYWORDS);
  
  if (found.length > 0) {
    violations.push({
      type: 'RANKING_MANIPULATION',
      severity: 'CRITICAL',
      description: `Ranking manipulation language detected: ${found.join(', ')}`,
      field: 'text_content',
    });
  }
  
  return violations;
}

/**
 * Detect dark patterns
 */
function detectDarkPatterns(text: string): SafetyViolation[] {
  const violations: SafetyViolation[] = [];
  const found = containsForbiddenKeywords(text, DARK_PATTERN_PHRASES);
  
  if (found.length >= 2) {
    violations.push({
      type: 'DARK_PATTERN',
      severity: 'HIGH',
      description: `Dark pattern language detected: ${found.join(', ')}`,
      field: 'text_content',
    });
  }
  
  return violations;
}

/**
 * Detect NSFW content
 */
function detectNsfwContent(text: string): SafetyViolation[] {
  const violations: SafetyViolation[] = [];
  const found = containsForbiddenKeywords(text, NSFW_KEYWORDS);
  
  if (found.length > 0) {
    violations.push({
      type: 'NSFW_BUNDLE',
      severity: 'CRITICAL',
      description: `NSFW keywords detected: ${found.join(', ')}`,
      field: 'text_content',
    });
  }
  
  return violations;
}

/**
 * Comprehensive text safety check
 */
function validateTextSafety(text: string): SafetyViolation[] {
  const violations: SafetyViolation[] = [];
  
  violations.push(...detectRomanticLanguage(text));
  violations.push(...detectAttentionIncentives(text));
  violations.push(...detectEmotionalCoercion(text));
  violations.push(...detectRankingManipulation(text));
  violations.push(...detectDarkPatterns(text));
  violations.push(...detectNsfwContent(text));
  
  return violations;
}

// ============================================================================
// PRICING TEST VALIDATION
// ============================================================================

/**
 * Validate pricing test for safety violations
 */
export function validatePricingTest(test: Partial<PricingTest>): SafetyValidationResult {
  const violations: SafetyViolation[] = [];
  
  // Check test name and description
  const textToCheck = `${test.testName || ''} ${test.description || ''}`;
  violations.push(...validateTextSafety(textToCheck));
  
  // Validate variation type
  const allowedVariations = ['BASE_PRICE', 'DISCOUNT_DURATION', 'BUNDLE_PRICE', 'SUBSCRIPTION_ADDON'];
  if (test.variationType && !allowedVariations.includes(test.variationType)) {
    violations.push({
      type: 'APPEARANCE_BASED_PRICING',
      severity: 'CRITICAL',
      description: 'Invalid variation type. Only base_price, discount_duration, bundle_price, and subscription_addon are allowed.',
      field: 'variationType',
    });
  }
  
  // Check variants for suspicious pricing patterns
  if (test.variants) {
    for (const variant of test.variants) {
      const variantText = `${variant.variantName} ${variant.description}`;
      violations.push(...validateTextSafety(variantText));
      
      // Check for attention-based tier naming
      const tierNames = ['vip', 'premium attention', 'priority', 'exclusive access'];
      if (tierNames.some(name => variant.variantName.toLowerCase().includes(name))) {
        violations.push({
          type: 'ATTENTION_INCENTIVE',
          severity: 'HIGH',
          description: `Variant name suggests attention-based pricing: ${variant.variantName}`,
          field: 'variants',
        });
      }
    }
  }
  
  const approved = violations.filter(v => v.severity === 'CRITICAL' || v.severity === 'HIGH').length === 0;
  const flags = violations.map(v => `${v.type}: ${v.description}`);
  const score = approved ? 100 : Math.max(0, 100 - (violations.length * 20));
  
  logger.info(`Pricing test validation: ${approved ? 'APPROVED' : 'REJECTED'}`, {
    testName: test.testName,
    violations: violations.length,
    flags,
  });
  
  return { approved, flags, violations, score };
}

// ============================================================================
// BUNDLE VALIDATION
// ============================================================================

/**
 * Validate product bundle for safety violations
 */
export function validateProductBundle(bundle: Partial<ProductBundle>): SafetyValidationResult {
  const violations: SafetyViolation[] = [];
  
  // Check bundle name and description
  const textToCheck = `${bundle.bundleName || ''} ${bundle.bundleDescription || ''}`;
  violations.push(...validateTextSafety(textToCheck));
  
  // Check for romantic bundle patterns
  const romanticBundleKeywords = ['girlfriend', 'boyfriend', 'date night', 'romance pack'];
  const found = containsForbiddenKeywords(textToCheck, romanticBundleKeywords);
  if (found.length > 0) {
    violations.push({
      type: 'NSFW_BUNDLE',
      severity: 'CRITICAL',
      description: `Romantic bundle pattern detected: ${found.join(', ')}`,
      field: 'bundleName',
    });
  }
  
  // Validate bundle has 2-5 products
  if (bundle.productIds && (bundle.productIds.length < 2 || bundle.productIds.length > 5)) {
    violations.push({
      type: 'DARK_PATTERN',
      severity: 'MEDIUM',
      description: 'Bundle must contain 2-5 products',
      field: 'productIds',
    });
  }
  
  // Validate discount is reasonable (not more than 40%)
  if (bundle.discountPercentage && bundle.discountPercentage > 40) {
    violations.push({
      type: 'SEDUCTIVE_DISCOUNT',
      severity: 'MEDIUM',
      description: 'Bundle discount exceeds 40% (suspiciously high)',
      field: 'discountPercentage',
    });
  }
  
  const approved = violations.filter(v => v.severity === 'CRITICAL' || v.severity === 'HIGH').length === 0;
  const flags = violations.map(v => `${v.type}: ${v.description}`);
  const score = approved ? 100 : Math.max(0, 100 - (violations.length * 20));
  
  logger.info(`Bundle validation: ${approved ? 'APPROVED' : 'REJECTED'}`, {
    bundleName: bundle.bundleName,
    violations: violations.length,
    flags,
  });
  
  return { approved, flags, violations, score };
}

// ============================================================================
// UPSELL VALIDATION
// ============================================================================

/**
 * Validate upsell rule for safety violations
 */
export function validateUpsellRule(rule: Partial<UpsellRule>): SafetyValidationResult {
  const violations: SafetyViolation[] = [];
  
  // Check rule name
  const textToCheck = rule.ruleName || '';
  violations.push(...validateTextSafety(textToCheck));
  
  // Validate upsell type
  const allowedTypes = ['RELATED_PRODUCT', 'COMPLEMENTARY_PRODUCT', 'BUNDLE_UPGRADE', 'COURSE_CONTINUATION'];
  if (rule.upsellType && !allowedTypes.includes(rule.upsellType)) {
    violations.push({
      type: 'PARASOCIAL_UPSELL',
      severity: 'CRITICAL',
      description: 'Invalid upsell type. Must be value-driven, not attention-driven.',
      field: 'upsellType',
    });
  }
  
  // Check for parasocial patterns in rule name
  const parasocialKeywords = ['get attention', 'creator likes you', 'special treatment', 'closer to creator'];
  const found = containsForbiddenKeywords(textToCheck, parasocialKeywords);
  if (found.length > 0) {
    violations.push({
      type: 'PARASOCIAL_UPSELL',
      severity: 'CRITICAL',
      description: `Parasocial upsell pattern detected: ${found.join(', ')}`,
      field: 'ruleName',
    });
  }
  
  const approved = violations.filter(v => v.severity === 'CRITICAL' || v.severity === 'HIGH').length === 0;
  const flags = violations.map(v => `${v.type}: ${v.description}`);
  const score = approved ? 100 : Math.max(0, 100 - (violations.length * 20));
  
  logger.info(`Upsell rule validation: ${approved ? 'APPROVED' : 'REJECTED'}`, {
    ruleName: rule.ruleName,
    violations: violations.length,
    flags,
  });
  
  return { approved, flags, violations, score };
}

// ============================================================================
// AUTOMATION VALIDATION
// ============================================================================

/**
 * Validate automation for safety violations
 */
export function validateAutomation(automation: Partial<ProductAutomation>): SafetyValidationResult {
  const violations: SafetyViolation[] = [];
  
  // Check automation name and description
  const textToCheck = `${automation.automationName || ''} ${automation.description || ''}`;
  violations.push(...validateTextSafety(textToCheck));
  
  // Validate trigger type
  const allowedTriggers = [
    'ABANDONED_CART',
    'COURSE_MILESTONE',
    'NEW_PRODUCT_RELEASE',
    'LEARNING_PATH_RECOMMENDATION',
    'PURCHASE_ANNIVERSARY',
  ];
  if (automation.trigger && !allowedTriggers.includes(automation.trigger)) {
    violations.push({
      type: 'ATTENTION_INCENTIVE',
      severity: 'CRITICAL',
      description: 'Invalid automation trigger. Must be value-driven, not attention-driven.',
      field: 'trigger',
    });
  }
  
  // Check actions for forbidden patterns
  if (automation.actions) {
    for (const action of automation.actions) {
      const actionText = JSON.stringify(action.parameters || {});
      violations.push(...validateTextSafety(actionText));
      
      // Forbidden action types
      const forbiddenActions = ['OFFER_ATTENTION', 'PROMISE_RESPONSE', 'ROMANTIC_INCENTIVE'];
      if (forbiddenActions.some(fa => action.type.includes(fa))) {
        violations.push({
          type: 'ATTENTION_INCENTIVE',
          severity: 'CRITICAL',
          description: `Forbidden automation action: ${action.type}`,
          field: 'actions',
        });
      }
    }
  }
  
  const approved = violations.filter(v => v.severity === 'CRITICAL' || v.severity === 'HIGH').length === 0;
  const flags = violations.map(v => `${v.type}: ${v.description}`);
  const score = approved ? 100 : Math.max(0, 100 - (violations.length * 20));
  
  logger.info(`Automation validation: ${approved ? 'APPROVED' : 'REJECTED'}`, {
    automationName: automation.automationName,
    violations: violations.length,
    flags,
  });
  
  return { approved, flags, violations, score };
}

// ============================================================================
// DISCOUNT VALIDATION
// ============================================================================

/**
 * Validate discount for safety violations
 */
export function validateDiscount(discount: Partial<ProductDiscount>): SafetyValidationResult {
  const violations: SafetyViolation[] = [];
  
  // Check discount name
  const textToCheck = discount.discountName || '';
  violations.push(...validateTextSafety(textToCheck));
  
  // Validate discount type
  const allowedTypes = ['LAUNCH', 'LOYALTY', 'BUNDLE', 'EVENT', 'SEASONAL'];
  if (discount.discountType && !allowedTypes.includes(discount.discountType)) {
    violations.push({
      type: 'SEDUCTIVE_DISCOUNT',
      severity: 'CRITICAL',
      description: 'Invalid discount type. Must be commercial logic, not emotional exploitation.',
      field: 'discountType',
    });
  }
  
  // Check for forbidden discount patterns
  const forbiddenDiscounts = [
    'flirt discount',
    'romance special',
    'attention sale',
    'lonely hearts',
    'vulnerable',
  ];
  const found = containsForbiddenKeywords(textToCheck, forbiddenDiscounts);
  if (found.length > 0) {
    violations.push({
      type: 'SEDUCTIVE_DISCOUNT',
      severity: 'CRITICAL',
      description: `Forbidden discount pattern detected: ${found.join(', ')}`,
      field: 'discountName',
    });
  }
  
  // Validate discount percentage is reasonable (not more than 50%)
  if (discount.discountPercentage && discount.discountPercentage > 50) {
    violations.push({
      type: 'SEDUCTIVE_DISCOUNT',
      severity: 'HIGH',
      description: 'Discount exceeds 50% (suspiciously high, may indicate emotional manipulation)',
      field: 'discountPercentage',
    });
  }
  
  // Check requirements for emotional labor
  if (discount.requirements) {
    for (const req of discount.requirements) {
      const reqText = JSON.stringify(req.value || {});
      if (reqText.toLowerCase().includes('flirt') || reqText.toLowerCase().includes('romance')) {
        violations.push({
          type: 'EMOTIONAL_COERCION',
          severity: 'CRITICAL',
          description: 'Discount requires emotional labor or romantic favors',
          field: 'requirements',
        });
      }
    }
  }
  
  const approved = violations.filter(v => v.severity === 'CRITICAL' || v.severity === 'HIGH').length === 0;
  const flags = violations.map(v => `${v.type}: ${v.description}`);
  const score = approved ? 100 : Math.max(0, 100 - (violations.length * 20));
  
  logger.info(`Discount validation: ${approved ? 'APPROVED' : 'REJECTED'}`, {
    discountName: discount.discountName,
    violations: violations.length,
    flags,
  });
  
  return { approved, flags, violations, score };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const pack166Safety = {
  validatePricingTest,
  validateProductBundle,
  validateUpsellRule,
  validateAutomation,
  validateDiscount,
  validateTextSafety,
};

logger.info('✅ PACK 166 Safety Middleware loaded successfully');