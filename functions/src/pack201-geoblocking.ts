/**
 * PACK 201 — Geo-Blocking Automation System
 * Automatic content and feature blocking based on regional policies
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  GeoblockingRule,
  BlockedCategory,
  ContentRestriction,
  GeoblockCheck,
} from './types/pack201-compliance.types';
import { getRegionPolicy } from './pack122-region-policy';

// ============================================================================
// GEO-BLOCKING RULES MANAGEMENT
// ============================================================================

/**
 * Create or update geo-blocking rule for a region
 */
export async function createGeoblockingRule(
  regionCode: string,
  blockedCategories: BlockedCategory[],
  blockedFeatures: string[],
  blockedContent: ContentRestriction[],
  legalBasis: string,
  createdBy: string
): Promise<GeoblockingRule> {
  const ruleId = generateId();
  
  logger.info('[Pack201] Creating geo-blocking rule', { regionCode, ruleId });

  const rule: GeoblockingRule = {
    ruleId,
    regionCode: regionCode.toUpperCase(),
    blockedCategories,
    blockedFeatures,
    blockedContent,
    active: true,
    priority: 100,
    legalBasis,
    effectiveFrom: serverTimestamp() as Timestamp,
    lastReviewedAt: serverTimestamp() as Timestamp,
    reviewedBy: createdBy,
  };

  await db.collection('geoblocking_rules').doc(ruleId).set(rule);

  logger.info('[Pack201] Geo-blocking rule created', { regionCode, ruleId });

  return rule;
}

/**
 * Get geo-blocking rules for a region
 */
export async function getGeoblockingRulesForRegion(
  regionCode: string
): Promise<GeoblockingRule[]> {
  const snapshot = await db.collection('geoblocking_rules')
    .where('regionCode', '==', regionCode.toUpperCase())
    .where('active', '==', true)
    .orderBy('priority', 'desc')
    .get();

  return snapshot.docs.map(doc => doc.data() as GeoblockingRule);
}

// ============================================================================
// CONTENT GEO-BLOCKING CHECKS
// ============================================================================

/**
 * Check if content should be geo-blocked for a user
 */
export async function checkContentGeoblocking(
  userId: string,
  contentType: string,
  contentId: string,
  contentMetadata?: any
): Promise<GeoblockCheck> {
  logger.info('[Pack201] Checking content geo-blocking', { userId, contentType, contentId });

  try {
    // Get user's region
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const regionCode = userData?.region || userData?.country || 'UNKNOWN';

    // Get geo-blocking rules for region
    const rules = await getGeoblockingRulesForRegion(regionCode);

    let blocked = false;
    let reason: string | undefined;
    let alternativeAvailable = false;

    // Check each rule
    for (const rule of rules) {
      // Check if content category is blocked
      if (contentMetadata?.category) {
        const categoryBlocked = rule.blockedCategories.some(
          cat => cat.toLowerCase() === contentMetadata.category.toLowerCase()
        );
        
        if (categoryBlocked) {
          blocked = true;
          reason = `Content category "${contentMetadata.category}" is not available in ${regionCode}`;
          break;
        }
      }

      // Check specific content restrictions
      const contentRestriction = rule.blockedContent.find(
        restriction => restriction.contentType === contentType
      );

      if (contentRestriction) {
        if (contentRestriction.restrictionType === 'BLOCKED') {
          blocked = true;
          reason = contentRestriction.reason;
          break;
        } else if (contentRestriction.restrictionType === 'AGE_RESTRICTED') {
          const userAge = userData?.age || 0;
          if (userAge < (contentRestriction.minimumAge || 21)) {
            blocked = true;
            reason = `This content requires minimum age ${contentRestriction.minimumAge} in ${regionCode}`;
            break;
          }
        } else if (contentRestriction.restrictionType === 'VERIFIED_ONLY') {
          const verified = userData?.verified || false;
          if (!verified) {
            blocked = true;
            reason = 'This content requires identity verification in your region';
            break;
          }
        }
      }
    }

    // Check for alternatives
    if (blocked && contentMetadata?.hasAlternative) {
      alternativeAvailable = true;
    }

    const check: GeoblockCheck = {
      userId,
      regionCode,
      contentType,
      contentId,
      blocked,
      reason,
      alternativeAvailable,
      checkedAt: serverTimestamp() as Timestamp,
    };

    // Log the check
    await db.collection('geoblock_checks').add(check);

    logger.info('[Pack201] Geo-blocking check completed', {
      userId,
      regionCode,
      contentType,
      blocked,
    });

    return check;
  } catch (error) {
    logger.error('[Pack201] Error checking content geo-blocking', { error });
    
    // Fail-safe: allow content on error
    return {
      userId,
      regionCode: 'ERROR',
      contentType,
      contentId,
      blocked: false,
      alternativeAvailable: false,
      checkedAt: serverTimestamp() as Timestamp,
    };
  }
}

/**
 * Check if feature should be geo-blocked for a user
 */
export async function checkFeatureGeoblocking(
  userId: string,
  featureName: string
): Promise<{ blocked: boolean; reason?: string }> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const regionCode = userData?.region || userData?.country || 'UNKNOWN';

    const rules = await getGeoblockingRulesForRegion(regionCode);

    for (const rule of rules) {
      if (rule.blockedFeatures.includes(featureName)) {
        return {
          blocked: true,
          reason: `Feature "${featureName}" is not available in ${regionCode} due to local regulations`,
        };
      }
    }

    return { blocked: false };
  } catch (error) {
    logger.error('[Pack201] Error checking feature geo-blocking', { error });
    return { blocked: false };
  }
}

// ============================================================================
// AUTOMATIC GEO-BLOCKING ENFORCEMENT
// ============================================================================

/**
 * Automatically apply geo-blocking to storefront/marketplace
 */
export async function applyStorefrontGeoblocking(
  regionCode: string
): Promise<{
  productsBlocked: number;
  categoriesBlocked: string[];
}> {
  logger.info('[Pack201] Applying storefront geo-blocking', { regionCode });

  try {
    const rules = await getGeoblockingRulesForRegion(regionCode);
    
    if (rules.length === 0) {
      return { productsBlocked: 0, categoriesBlocked: [] };
    }

    // Collect all blocked categories
    const blockedCategories = new Set<string>();
    rules.forEach(rule => {
      rule.blockedCategories.forEach(cat => blockedCategories.add(cat));
    });

    const categoriesArray = Array.from(blockedCategories);
    
    // Block products in these categories for this region
    let productsBlocked = 0;
    
    for (const category of categoriesArray) {
      const batch = db.batch();
      let batchCount = 0;

      const productsSnapshot = await db.collection('marketplace_products')
        .where('category', '==', category)
        .where('active', '==', true)
        .limit(500)
        .get();

      productsSnapshot.docs.forEach(doc => {
        const ref = db.collection('marketplace_products').doc(doc.id);
        const data = doc.data();
        const blockedRegions = data.blockedRegions || [];
        
        if (!blockedRegions.includes(regionCode)) {
          batch.update(ref, {
            blockedRegions: [...blockedRegions, regionCode],
            updatedAt: serverTimestamp(),
          });
          batchCount++;
          productsBlocked++;
        }
      });

      if (batchCount > 0) {
        await batch.commit();
      }
    }

    logger.info('[Pack201] Storefront geo-blocking applied', {
      regionCode,
      productsBlocked,
      categoriesBlocked: categoriesArray.length,
    });

    return {
      productsBlocked,
      categoriesBlocked: categoriesArray,
    };
  } catch (error) {
    logger.error('[Pack201] Error applying storefront geo-blocking', { error });
    throw error;
  }
}

/**
 * Automatically apply geo-blocking to livestreams
 */
export async function applyLivestreamGeoblocking(
  regionCode: string
): Promise<{
  streamsBlocked: number;
  categoriesBlocked: string[];
}> {
  logger.info('[Pack201] Applying livestream geo-blocking', { regionCode });

  try {
    const rules = await getGeoblockingRulesForRegion(regionCode);
    
    if (rules.length === 0) {
      return { streamsBlocked: 0, categoriesBlocked: [] };
    }

    const blockedCategories = new Set<string>();
    rules.forEach(rule => {
      rule.blockedCategories.forEach(cat => {
        if (cat.includes('LIVESTREAM') || cat.includes('NSFW')) {
          blockedCategories.add(cat);
        }
      });
    });

    const categoriesArray = Array.from(blockedCategories);
    let streamsBlocked = 0;

    for (const category of categoriesArray) {
      const batch = db.batch();
      let batchCount = 0;

      const streamsSnapshot = await db.collection('livestreams')
        .where('category', '==', category)
        .where('status', 'in', ['LIVE', 'SCHEDULED'])
        .limit(500)
        .get();

      streamsSnapshot.docs.forEach(doc => {
        const ref = db.collection('livestreams').doc(doc.id);
        const data = doc.data();
        const blockedRegions = data.blockedRegions || [];
        
        if (!blockedRegions.includes(regionCode)) {
          batch.update(ref, {
            blockedRegions: [...blockedRegions, regionCode],
            updatedAt: serverTimestamp(),
          });
          batchCount++;
          streamsBlocked++;
        }
      });

      if (batchCount > 0) {
        await batch.commit();
      }
    }

    logger.info('[Pack201] Livestream geo-blocking applied', {
      regionCode,
      streamsBlocked,
      categoriesBlocked: categoriesArray.length,
    });

    return {
      streamsBlocked,
      categoriesBlocked: categoriesArray,
    };
  } catch (error) {
    logger.error('[Pack201] Error applying livestream geo-blocking', { error });
    throw error;
  }
}

// ============================================================================
// REGIONAL POLICY SYNC
// ============================================================================

/**
 * Sync geo-blocking rules with regional policies
 */
export async function syncGeoblockingWithRegionalPolicies(
  regionCode: string
): Promise<void> {
  logger.info('[Pack201] Syncing geo-blocking with regional policies', { regionCode });

  try {
    // Get regional policy from Pack 122
    const policy = await getRegionPolicy(regionCode);

    // Determine what should be blocked
    const blockedCategories: BlockedCategory[] = [];
    const blockedFeatures: string[] = [];
    const blockedContent: ContentRestriction[] = [];

    // NSFW restrictions
    if (!policy.guardrails.NSFW_ALLOWED) {
      blockedCategories.push('NSFW_SOFT', 'NSFW_EXPLICIT');
      blockedContent.push({
        contentType: 'NSFW_CONTENT',
        restrictionType: 'BLOCKED',
        reason: 'Adult content is not permitted in this region',
      });
    }

    if (!policy.guardrails.NSFW_EXPLICIT_ALLOWED) {
      blockedCategories.push('NSFW_EXPLICIT');
    }

    if (!policy.guardrails.NSFW_MONETIZATION_ALLOWED) {
      blockedFeatures.push('nsfw_sales', 'adult_content_monetization');
    }

    // Political content restrictions
    if (policy.guardrails.POLITICAL_CONTENT_RESTRICTED) {
      blockedCategories.push('POLITICAL_CONTENT');
    }

    // Payout restrictions
    if (!policy.payoutAvailability) {
      blockedFeatures.push('creator_payouts', 'earnings_withdrawal');
    }

    // Ad restrictions
    if (policy.adsRestrictions.includes('GAMBLING')) {
      blockedCategories.push('GAMBLING');
    }
    if (policy.adsRestrictions.includes('ALCOHOL')) {
      blockedCategories.push('ALCOHOL');
    }
    if (policy.adsRestrictions.includes('CANNABIS')) {
      blockedCategories.push('CANNABIS');
    }

    // Create or update geo-blocking rule
    await createGeoblockingRule(
      regionCode,
      blockedCategories,
      blockedFeatures,
      blockedContent,
      `Regional policy compliance for ${policy.regionName}`,
      'SYSTEM_SYNC'
    );

    // Apply geo-blocking
    await applyStorefrontGeoblocking(regionCode);
    await applyLivestreamGeoblocking(regionCode);

    logger.info('[Pack201] Geo-blocking sync completed', { regionCode });
  } catch (error) {
    logger.error('[Pack201] Error syncing geo-blocking', { error });
    throw error;
  }
}

/**
 * Run geo-blocking sync for all regions
 */
export async function syncAllRegionalGeoblocking(): Promise<{
  regionsSynced: number;
  totalProductsBlocked: number;
  totalStreamsBlocked: number;
}> {
  logger.info('[Pack201] Starting global geo-blocking sync');

  try {
    // Get all regional policy profiles
    const policiesSnapshot = await db.collection('region_policy_profiles')
      .where('enabled', '==', true)
      .get();

    let regionsSynced = 0;
    let totalProductsBlocked = 0;
    let totalStreamsBlocked = 0;

    for (const doc of policiesSnapshot.docs) {
      const policy = doc.data();
      const regionCode = policy.regionCode;

      if (regionCode === 'GLOBAL_DEFAULT') {
        continue; // Skip global default
      }

      try {
        await syncGeoblockingWithRegionalPolicies(regionCode);
        regionsSynced++;

        // Count blocked items
        const productsResult = await applyStorefrontGeoblocking(regionCode);
        const streamsResult = await applyLivestreamGeoblocking(regionCode);

        totalProductsBlocked += productsResult.productsBlocked;
        totalStreamsBlocked += streamsResult.streamsBlocked;
      } catch (error) {
        logger.error('[Pack201] Error syncing region', { regionCode, error });
      }
    }

    logger.info('[Pack201] Global geo-blocking sync completed', {
      regionsSynced,
      totalProductsBlocked,
      totalStreamsBlocked,
    });

    return {
      regionsSynced,
      totalProductsBlocked,
      totalStreamsBlocked,
    };
  } catch (error) {
    logger.error('[Pack201] Error in global geo-blocking sync', { error });
    throw error;
  }
}

// ============================================================================
// GEO-BLOCK ANALYTICS
// ============================================================================

/**
 * Get geo-blocking statistics
 */
export async function getGeoblockingStatistics(
  regionCode?: string,
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalChecks: number;
  totalBlocked: number;
  blockRate: number;
  topBlockedCategories: Array<{ category: string; count: number }>;
  topBlockedContentTypes: Array<{ contentType: string; count: number }>;
}> {
  try {
    let query = db.collection('geoblock_checks').where('blocked', '==', true);

    if (regionCode) {
      query = query.where('regionCode', '==', regionCode);
    }

    if (startDate) {
      query = query.where('checkedAt', '>=', Timestamp.fromDate(startDate));
    }

    if (endDate) {
      query = query.where('checkedAt', '<=', Timestamp.fromDate(endDate));
    }

    const snapshot = await query.get();
    const blocked = snapshot.docs.map(doc => doc.data() as GeoblockCheck);

    // Get total checks
    let totalChecksQuery: any = db.collection('geoblock_checks');
    if (regionCode) {
      totalChecksQuery = totalChecksQuery.where('regionCode', '==', regionCode);
    }
    if (startDate) {
      totalChecksQuery = totalChecksQuery.where('checkedAt', '>=', Timestamp.fromDate(startDate));
    }
    if (endDate) {
      totalChecksQuery = totalChecksQuery.where('checkedAt', '<=', Timestamp.fromDate(endDate));
    }

    const totalSnapshot = await totalChecksQuery.get();
    const totalChecks = totalSnapshot.size;
    const totalBlocked = blocked.length;
    const blockRate = totalChecks > 0 ? (totalBlocked / totalChecks) * 100 : 0;

    // Aggregate by content type
    const contentTypeCounts = new Map<string, number>();
    blocked.forEach(check => {
      const current = contentTypeCounts.get(check.contentType) || 0;
      contentTypeCounts.set(check.contentType, current + 1);
    });

    const topBlockedContentTypes = Array.from(contentTypeCounts.entries())
      .map(([contentType, count]) => ({ contentType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalChecks,
      totalBlocked,
      blockRate,
      topBlockedCategories: [], // Would need to track categories in checks
      topBlockedContentTypes,
    };
  } catch (error) {
    logger.error('[Pack201] Error getting geo-blocking statistics', { error });
    throw error;
  }
}