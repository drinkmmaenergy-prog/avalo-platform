/**
 * PACK 201 — Policy Violation Scanner
 * Automated scanning for policy violations across content types
 */

import { db, serverTimestamp, generateId, increment } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  PolicyViolationScan,
  PolicyViolation,
  PolicyType,
  PolicyAction,
  Platform,
} from './types/pack201-compliance.types';

// ============================================================================
// PRODUCT POLICY SCANNING
// ============================================================================

/**
 * Scan a product for policy violations
 */
export async function scanProductForPolicyViolations(
  productId: string,
  productData: any
): Promise<PolicyViolationScan> {
  const scanId = generateId();
  const startedAt = serverTimestamp() as Timestamp;
  
  logger.info('[Pack201] Scanning product for policy violations', { productId, scanId });

  try {
    const violations: PolicyViolation[] = [];

    // Check marketplace rules
    violations.push(...await checkMarketplaceRules(productData));
    
    // Check commerce policy
    violations.push(...await checkCommercePolicy(productData));
    
    // Check content policy
    violations.push(...await checkContentPolicy(productData));
    
    // Check regional restrictions
    violations.push(...await checkRegionalRestrictions(productData));

    const completedAt = serverTimestamp() as Timestamp;
    const scanDurationMs = Date.now() - startedAt.toMillis();

    const scan: PolicyViolationScan = {
      scanId,
      targetType: 'PRODUCT',
      targetId: productId,
      scanType: 'AUTOMATED',
      violations,
      status: 'COMPLETED',
      startedAt,
      completedAt,
      scanDurationMs,
    };

    // Save scan result
    await db.collection('policy_violation_scans').doc(scanId).set(scan);

    // If violations found, take action
    if (violations.length > 0) {
      await handleProductViolations(productId, violations);
    }

    logger.info('[Pack201] Product scan completed', {
      productId,
      scanId,
      violations: violations.length,
    });

    return scan;
  } catch (error) {
    logger.error('[Pack201] Error scanning product', { productId, error });
    
    return {
      scanId,
      targetType: 'PRODUCT',
      targetId: productId,
      scanType: 'AUTOMATED',
      violations: [],
      status: 'FAILED',
      startedAt,
    };
  }
}

/**
 * Check marketplace rules
 */
async function checkMarketplaceRules(productData: any): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];

  // Check prohibited categories
  const prohibitedCategories = [
    'escort',
    'adult_services',
    'dating',
    'gambling',
    'weapons',
    'drugs',
    'illegal',
  ];

  if (prohibitedCategories.includes(productData.category?.toLowerCase())) {
    violations.push({
      violationId: generateId(),
      policyType: 'MARKETPLACE_RULES',
      severity: 'CRITICAL',
      blocked: true,
      rule: 'PROHIBITED_CATEGORY',
      ruleDescription: 'Product category is not permitted on the marketplace',
      detectedContent: productData.category,
      actionTaken: 'CONTENT_REMOVED',
      notificationSent: true,
      appealAllowed: true,
      detectedAt: serverTimestamp() as Timestamp,
    });
  }

  // Check for sexual content keywords
  const sexualKeywords = [
    'nude',
    'naked',
    'porn',
    'xxx',
    'sex',
    'erotic',
    'intimate',
    'escort',
    'companion',
  ];

  const description = productData.description?.toLowerCase() || '';
  const title = productData.title?.toLowerCase() || '';
  
  for (const keyword of sexualKeywords) {
    if (description.includes(keyword) || title.includes(keyword)) {
      violations.push({
        violationId: generateId(),
        policyType: 'MARKETPLACE_RULES',
        severity: 'CRITICAL',
        blocked: true,
        rule: 'SEXUAL_CONTENT_PROHIBITED',
        ruleDescription: 'Sexual content is not permitted in marketplace listings',
        detectedContent: keyword,
        actionTaken: 'CONTENT_REMOVED',
        notificationSent: true,
        appealAllowed: true,
        detectedAt: serverTimestamp() as Timestamp,
      });
      break; // Only report once per product
    }
  }

  // Check pricing transparency
  if (!productData.price || productData.price <= 0) {
    violations.push({
      violationId: generateId(),
      policyType: 'MARKETPLACE_RULES',
      severity: 'MEDIUM',
      blocked: false,
      rule: 'PRICE_REQUIRED',
      ruleDescription: 'All products must have a clear price',
      actionTaken: 'WARNING',
      notificationSent: true,
      appealAllowed: false,
      detectedAt: serverTimestamp() as Timestamp,
    });
  }

  return violations;
}

/**
 * Check commerce policy
 */
async function checkCommercePolicy(productData: any): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];

  // Check refund policy disclosure
  if (!productData.refundPolicy) {
    violations.push({
      violationId: generateId(),
      policyType: 'COMMERCE_POLICY',
      severity: 'LOW',
      blocked: false,
      rule: 'REFUND_POLICY_REQUIRED',
      ruleDescription: 'Products should have a clear refund policy',
      actionTaken: 'WARNING',
      notificationSent: true,
      appealAllowed: false,
      detectedAt: serverTimestamp() as Timestamp,
    });
  }

  // Check delivery information
  if (productData.type === 'physical' && !productData.deliveryInfo) {
    violations.push({
      violationId: generateId(),
      policyType: 'COMMERCE_POLICY',
      severity: 'MEDIUM',
      blocked: false,
      rule: 'DELIVERY_INFO_REQUIRED',
      ruleDescription: 'Physical products must include delivery information',
      actionTaken: 'WARNING',
      notificationSent: true,
      appealAllowed: false,
      detectedAt: serverTimestamp() as Timestamp,
    });
  }

  return violations;
}

/**
 * Check content policy
 */
async function checkContentPolicy(productData: any): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];

  // Check for misleading content
  const misleadingKeywords = [
    'guaranteed',
    'get rich',
    'easy money',
    'no risk',
    'secret method',
    'overnight success',
  ];

  const description = productData.description?.toLowerCase() || '';
  
  for (const keyword of misleadingKeywords) {
    if (description.includes(keyword)) {
      violations.push({
        violationId: generateId(),
        policyType: 'CONTENT_POLICY',
        severity: 'HIGH',
        blocked: true,
        rule: 'NO_MISLEADING_CLAIMS',
        ruleDescription: 'Products cannot make misleading or unrealistic claims',
        detectedContent: keyword,
        actionTaken: 'CONTENT_REMOVED',
        notificationSent: true,
        appealAllowed: true,
        detectedAt: serverTimestamp() as Timestamp,
      });
      break;
    }
  }

  return violations;
}

/**
 * Check regional restrictions
 */
async function checkRegionalRestrictions(productData: any): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];

  // Check if product has regional restrictions
  if (productData.restrictedRegions && productData.restrictedRegions.length > 0) {
    violations.push({
      violationId: generateId(),
      policyType: 'MARKETPLACE_RULES',
      severity: 'LOW',
      blocked: false,
      rule: 'REGIONAL_RESTRICTIONS_APPLIED',
      ruleDescription: 'Product has regional restrictions that will be enforced',
      actionTaken: 'GEOBLOCKED',
      notificationSent: false,
      appealAllowed: false,
      detectedAt: serverTimestamp() as Timestamp,
    });
  }

  return violations;
}

// ============================================================================
// LIVESTREAM POLICY SCANNING
// ============================================================================

/**
 * Scan a livestream for policy violations
 */
export async function scanLivestreamForPolicyViolations(
  streamId: string,
  streamData: any
): Promise<PolicyViolationScan> {
  const scanId = generateId();
  const startedAt = serverTimestamp() as Timestamp;
  
  logger.info('[Pack201] Scanning livestream for policy violations', { streamId, scanId });

  try {
    const violations: PolicyViolation[] = [];

    // Check livestream rules
    violations.push(...await checkLivestreamRules(streamData));
    
    // Check content classification
    violations.push(...await checkLivestreamContent(streamData));
    
    // Check age restrictions
    violations.push(...await checkLivestreamAgeRestrictions(streamData));

    const completedAt = serverTimestamp() as Timestamp;
    const scanDurationMs = Date.now() - startedAt.toMillis();

    const scan: PolicyViolationScan = {
      scanId,
      targetType: 'LIVESTREAM',
      targetId: streamId,
      scanType: 'AUTOMATED',
      violations,
      status: 'COMPLETED',
      startedAt,
      completedAt,
      scanDurationMs,
    };

    await db.collection('policy_violation_scans').doc(scanId).set(scan);

    if (violations.length > 0) {
      await handleLivestreamViolations(streamId, violations);
    }

    logger.info('[Pack201] Livestream scan completed', {
      streamId,
      scanId,
      violations: violations.length,
    });

    return scan;
  } catch (error) {
    logger.error('[Pack201] Error scanning livestream', { streamId, error });
    
    return {
      scanId,
      targetType: 'LIVESTREAM',
      targetId: streamId,
      scanType: 'AUTOMATED',
      violations: [],
      status: 'FAILED',
      startedAt,
    };
  }
}

/**
 * Check livestream rules
 */
async function checkLivestreamRules(streamData: any): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];

  // Check prohibited categories
  const prohibitedCategories = [
    'adult',
    'erotic',
    'nsfw',
    'gambling',
    'violence',
  ];

  if (prohibitedCategories.includes(streamData.category?.toLowerCase())) {
    violations.push({
      violationId: generateId(),
      policyType: 'LIVESTREAM_RULES',
      severity: 'CRITICAL',
      blocked: true,
      rule: 'PROHIBITED_LIVESTREAM_CATEGORY',
      ruleDescription: 'This livestream category is not permitted',
      detectedContent: streamData.category,
      actionTaken: 'CONTENT_REMOVED',
      notificationSent: true,
      appealAllowed: true,
      detectedAt: serverTimestamp() as Timestamp,
    });
  }

  return violations;
}

/**
 * Check livestream content
 */
async function checkLivestreamContent(streamData: any): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];

  // Check title and description for prohibited keywords
  const prohibitedKeywords = [
    'nude',
    'naked',
    'sexy',
    'hot',
    'private show',
    'adults only',
  ];

  const title = streamData.title?.toLowerCase() || '';
  const description = streamData.description?.toLowerCase() || '';
  
  for (const keyword of prohibitedKeywords) {
    if (title.includes(keyword) || description.includes(keyword)) {
      violations.push({
        violationId: generateId(),
        policyType: 'LIVESTREAM_RULES',
        severity: 'CRITICAL',
        blocked: true,
        rule: 'INAPPROPRIATE_LIVESTREAM_CONTENT',
        ruleDescription: 'Livestream contains inappropriate content indicators',
        detectedContent: keyword,
        actionTaken: 'CONTENT_REMOVED',
        notificationSent: true,
        appealAllowed: true,
        detectedAt: serverTimestamp() as Timestamp,
      });
      break;
    }
  }

  return violations;
}

/**
 * Check livestream age restrictions
 */
async function checkLivestreamAgeRestrictions(streamData: any): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];

  // All livestreams must be 18+
  if (!streamData.ageRestricted || streamData.minimumAge < 18) {
    violations.push({
      violationId: generateId(),
      policyType: 'LIVESTREAM_RULES',
      severity: 'HIGH',
      blocked: false,
      rule: 'AGE_RESTRICTION_REQUIRED',
      ruleDescription: 'All livestreams must be restricted to 18+ users',
      actionTaken: 'FEATURE_DISABLED',
      notificationSent: true,
      appealAllowed: false,
      detectedAt: serverTimestamp() as Timestamp,
    });
  }

  return violations;
}

// ============================================================================
// VIOLATION HANDLERS
// ============================================================================

/**
 * Handle product violations
 */
async function handleProductViolations(
  productId: string,
  violations: PolicyViolation[]
): Promise<void> {
  const criticalViolations = violations.filter(v => v.severity === 'CRITICAL');
  
  if (criticalViolations.length > 0) {
    // Remove product from marketplace
    await db.collection('marketplace_products').doc(productId).update({
      status: 'REMOVED',
      removedReason: 'POLICY_VIOLATION',
      removedAt: serverTimestamp(),
      violations: criticalViolations.map(v => v.violationId),
    });

    logger.warn('[Pack201] Product removed due to critical violations', {
      productId,
      violations: criticalViolations.length,
    });
  } else {
    // Flag for review
    await db.collection('marketplace_products').doc(productId).update({
      flaggedForReview: true,
      flagReason: 'POLICY_VIOLATIONS',
      violations: violations.map(v => v.violationId),
    });
  }
}

/**
 * Handle livestream violations
 */
async function handleLivestreamViolations(
  streamId: string,
  violations: PolicyViolation[]
): Promise<void> {
  const criticalViolations = violations.filter(v => v.severity === 'CRITICAL');
  
  if (criticalViolations.length > 0) {
    // Terminate livestream immediately
    await db.collection('livestreams').doc(streamId).update({
      status: 'TERMINATED',
      terminatedReason: 'POLICY_VIOLATION',
      terminatedAt: serverTimestamp(),
      violations: criticalViolations.map(v => v.violationId),
    });

    logger.warn('[Pack201] Livestream terminated due to critical violations', {
      streamId,
      violations: criticalViolations.length,
    });
  } else {
    // Issue warning to streamer
    await db.collection('livestreams').doc(streamId).update({
      warningIssued: true,
      warningReason: 'POLICY_VIOLATIONS',
      violations: violations.map(v => v.violationId),
    });
  }
}

// ============================================================================
// USER CONTENT SCANNING
// ============================================================================

/**
 * Scan user profile for policy violations
 */
export async function scanUserProfileForViolations(
  userId: string
): Promise<PolicyViolationScan> {
  const scanId = generateId();
  const startedAt = serverTimestamp() as Timestamp;
  
  logger.info('[Pack201] Scanning user profile for violations', { userId, scanId });

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData) {
      throw new Error('User not found');
    }

    const violations: PolicyViolation[] = [];

    // Check username
    const usernameViolations = await checkUsername(userData.username);
    violations.push(...usernameViolations);

    // Check bio
    const bioViolations = await checkBio(userData.bio);
    violations.push(...bioViolations);

    // Check profile images
    const imageViolations = await checkProfileImages(userData);
    violations.push(...imageViolations);

    const completedAt = serverTimestamp() as Timestamp;
    const scanDurationMs = Date.now() - startedAt.toMillis();

    const scan: PolicyViolationScan = {
      scanId,
      targetType: 'USER',
      targetId: userId,
      scanType: 'AUTOMATED',
      violations,
      status: 'COMPLETED',
      startedAt,
      completedAt,
      scanDurationMs,
    };

    await db.collection('policy_violation_scans').doc(scanId).set(scan);

    if (violations.length > 0) {
      await handleUserViolations(userId, violations);
    }

    return scan;
  } catch (error) {
    logger.error('[Pack201] Error scanning user profile', { userId, error });
    
    return {
      scanId,
      targetType: 'USER',
      targetId: userId,
      scanType: 'AUTOMATED',
      violations: [],
      status: 'FAILED',
      startedAt,
    };
  }
}

/**
 * Check username for violations
 */
async function checkUsername(username: string): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];

  const prohibitedKeywords = [
    'escort',
    'porn',
    'xxx',
    'sex',
    'admin',
    'official',
    'support',
  ];

  const lowerUsername = username.toLowerCase();
  
  for (const keyword of prohibitedKeywords) {
    if (lowerUsername.includes(keyword)) {
      violations.push({
        violationId: generateId(),
        policyType: 'COMMUNITY_GUIDELINES',
        severity: 'HIGH',
        blocked: true,
        rule: 'INAPPROPRIATE_USERNAME',
        ruleDescription: 'Username contains inappropriate content',
        detectedContent: keyword,
        actionTaken: 'ACCOUNT_RESTRICTED',
        notificationSent: true,
        appealAllowed: true,
        detectedAt: serverTimestamp() as Timestamp,
      });
      break;
    }
  }

  return violations;
}

/**
 * Check bio for violations
 */
async function checkBio(bio: string): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];

  if (!bio) return violations;

  const prohibitedKeywords = [
    'escort',
    'sugar daddy',
    'sugar baby',
    'hookup',
    'meet for money',
    'private show',
  ];

  const lowerBio = bio.toLowerCase();
  
  for (const keyword of prohibitedKeywords) {
    if (lowerBio.includes(keyword)) {
      violations.push({
        violationId: generateId(),
        policyType: 'COMMUNITY_GUIDELINES',
        severity: 'CRITICAL',
        blocked: true,
        rule: 'INAPPROPRIATE_BIO_CONTENT',
        ruleDescription: 'Bio contains prohibited content',
        detectedContent: keyword,
        actionTaken: 'CONTENT_REMOVED',
        notificationSent: true,
        appealAllowed: true,
        detectedAt: serverTimestamp() as Timestamp,
      });
      break;
    }
  }

  return violations;
}

/**
 * Check profile images for violations
 */
async function checkProfileImages(userData: any): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];

  // This would integrate with image moderation AI
  // For now, just check if images exist and are flagged
  if (userData.profileImage?.flagged) {
    violations.push({
      violationId: generateId(),
      policyType: 'CONTENT_POLICY',
      severity: 'HIGH',
      blocked: true,
      rule: 'INAPPROPRIATE_PROFILE_IMAGE',
      ruleDescription: 'Profile image was flagged by moderation system',
      actionTaken: 'CONTENT_REMOVED',
      notificationSent: true,
      appealAllowed: true,
      detectedAt: serverTimestamp() as Timestamp,
    });
  }

  return violations;
}

/**
 * Handle user violations
 */
async function handleUserViolations(
  userId: string,
  violations: PolicyViolation[]
): Promise<void> {
  const criticalViolations = violations.filter(v => v.severity === 'CRITICAL');
  
  if (criticalViolations.length > 0) {
    // Restrict account
    await db.collection('users').doc(userId).update({
      accountStatus: 'RESTRICTED',
      restrictedReason: 'POLICY_VIOLATIONS',
      restrictedAt: serverTimestamp(),
      violations: criticalViolations.map(v => v.violationId),
    });

    logger.warn('[Pack201] User account restricted due to violations', {
      userId,
      violations: criticalViolations.length,
    });
  } else {
    // Issue warning
    await db.collection('users').doc(userId).update({
      warningIssued: true,
      warningCount: increment(1),
      lastWarningAt: serverTimestamp(),
      violations: violations.map(v => v.violationId),
    });
  }
}

// ============================================================================
// BATCH SCANNING
// ============================================================================

/**
 * Run scheduled compliance scans across platform
 */
export async function runScheduledComplianceScans(): Promise<{
  productsScanned: number;
  livestreamsScanned: number;
  usersScanned: number;
  totalViolations: number;
}> {
  logger.info('[Pack201] Running scheduled compliance scans');

  let productsScanned = 0;
  let livestreamsScanned = 0;
  let usersScanned = 0;
  let totalViolations = 0;

  try {
    // Scan recent products (last 24 hours)
    const productsSnapshot = await db.collection('marketplace_products')
      .where('createdAt', '>', Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
      .limit(100)
      .get();

    for (const doc of productsSnapshot.docs) {
      const scan = await scanProductForPolicyViolations(doc.id, doc.data());
      productsScanned++;
      totalViolations += scan.violations.length;
    }

    // Scan active livestreams
    const livestreamsSnapshot = await db.collection('livestreams')
      .where('status', '==', 'LIVE')
      .limit(50)
      .get();

    for (const doc of livestreamsSnapshot.docs) {
      const scan = await scanLivestreamForPolicyViolations(doc.id, doc.data());
      livestreamsScanned++;
      totalViolations += scan.violations.length;
    }

    // Scan new users (last 24 hours)
    const usersSnapshot = await db.collection('users')
      .where('createdAt', '>', Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
      .limit(100)
      .get();

    for (const doc of usersSnapshot.docs) {
      const scan = await scanUserProfileForViolations(doc.id);
      usersScanned++;
      totalViolations += scan.violations.length;
    }

    logger.info('[Pack201] Scheduled compliance scans completed', {
      productsScanned,
      livestreamsScanned,
      usersScanned,
      totalViolations,
    });

    return {
      productsScanned,
      livestreamsScanned,
      usersScanned,
      totalViolations,
    };
  } catch (error) {
    logger.error('[Pack201] Error running scheduled scans', { error });
    throw error;
  }
}