/**
 * PACK 122 — Localized Safety Resources Provider
 * Provides region-specific emergency and support resources
 */

import { db, timestamp as Timestamp } from './init';
import { logger } from 'firebase-functions/v2';
import { SafetyResource, CRISIS_RESOURCES_BY_COUNTRY } from './pack122-types';
import { getRegionPolicy } from './pack122-region-policy';

// ============================================================================
// SAFETY RESOURCES RETRIEVAL
// ============================================================================

/**
 * Get safety resources for a specific region
 * Returns crisis hotlines, mental health support, etc. for the user's country
 */
export async function getSafetyResourcesForRegion(regionCode: string): Promise<SafetyResource[]> {
  try {
    logger.info('[Pack122] Getting safety resources', { regionCode });

    // 1. Try to get resources from database first (allows admin updates)
    const resourcesSnapshot = await db
      .collection('safety_resources')
      .where('region', '==', regionCode.toUpperCase())
      .where('enabled', '==', true)
      .orderBy('displayPriority', 'asc')
      .get();

    if (!resourcesSnapshot.empty) {
      const resources = resourcesSnapshot.docs.map(doc => doc.data() as SafetyResource);
      logger.info('[Pack122] Found safety resources in database', { 
        regionCode, 
        count: resources.length 
      });
      return resources;
    }

    // 2. Fall back to hardcoded resources (from types file)
    const hardcodedResources = CRISIS_RESOURCES_BY_COUNTRY[regionCode.toUpperCase()];
    if (hardcodedResources && hardcodedResources.length > 0) {
      logger.info('[Pack122] Using hardcoded safety resources', { 
        regionCode, 
        count: hardcodedResources.length 
      });
      return hardcodedResources;
    }

    // 3. Try to get regional group resources
    const policy = await getRegionPolicy(regionCode);
    if (policy.regionGroup) {
      const groupResourcesSnapshot = await db
        .collection('safety_resources')
        .where('region', '==', policy.regionGroup)
        .where('enabled', '==', true)
        .orderBy('displayPriority', 'asc')
        .get();

      if (!groupResourcesSnapshot.empty) {
        const resources = groupResourcesSnapshot.docs.map(doc => doc.data() as SafetyResource);
        logger.info('[Pack122] Found regional group safety resources', { 
          regionCode,
          regionGroup: policy.regionGroup,
          count: resources.length 
        });
        return resources;
      }
    }

    // 4. Fall back to global resources
    logger.info('[Pack122] Using global safety resources', { regionCode });
    return getGlobalSafetyResources();

  } catch (error) {
    logger.error('[Pack122] Error getting safety resources', { regionCode, error });
    return getGlobalSafetyResources();
  }
}

/**
 * Get global/international safety resources
 * Used as fallback when region-specific resources not available
 */
function getGlobalSafetyResources(): SafetyResource[] {
  return [
    {
      resourceId: 'global_iasp',
      region: 'GLOBAL',
      type: 'CRISIS_HOTLINE',
      name: 'International Association for Suicide Prevention',
      website: 'https://www.iasp.info/resources/Crisis_Centres/',
      description: 'Find crisis centers worldwide',
      displayPriority: 1,
      language: 'en',
      verified: true,
      lastVerifiedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      enabled: true,
    },
    {
      resourceId: 'global_who',
      region: 'GLOBAL',
      type: 'MENTAL_HEALTH',
      name: 'WHO Mental Health Resources',
      website: 'https://www.who.int/health-topics/mental-health',
      description: 'Global mental health information and resources',
      displayPriority: 2,
      language: 'en',
      verified: true,
      lastVerifiedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      enabled: true,
    },
  ];
}

// ============================================================================
// SAFETY RESOURCE MANAGEMENT
// ============================================================================

/**
 * Add or update a safety resource
 * Used by admins to maintain regional resources
 */
export async function upsertSafetyResource(resource: SafetyResource): Promise<void> {
  try {
    await db
      .collection('safety_resources')
      .doc(resource.resourceId)
      .set({
        ...resource,
        updatedAt: Timestamp.now(),
      }, { merge: true });

    logger.info('[Pack122] Safety resource upserted', { 
      resourceId: resource.resourceId,
      region: resource.region 
    });

  } catch (error) {
    logger.error('[Pack122] Error upserting safety resource', { resource, error });
    throw error;
  }
}

/**
 * Delete a safety resource
 */
export async function deleteSafetyResource(resourceId: string): Promise<void> {
  try {
    await db.collection('safety_resources').doc(resourceId).delete();
    logger.info('[Pack122] Safety resource deleted', { resourceId });
  } catch (error) {
    logger.error('[Pack122] Error deleting safety resource', { resourceId, error });
    throw error;
  }
}

/**
 * Verify safety resource (mark as verified and update verification date)
 */
export async function verifySafetyResource(resourceId: string): Promise<void> {
  try {
    await db.collection('safety_resources').doc(resourceId).update({
      verified: true,
      lastVerifiedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    logger.info('[Pack122] Safety resource verified', { resourceId });
  } catch (error) {
    logger.error('[Pack122] Error verifying safety resource', { resourceId, error });
    throw error;
  }
}

// ============================================================================
// TRIGGER-BASED RESOURCE PROVISION
// ============================================================================

/**
 * Get appropriate safety resources based on user context
 * Called when user triggers safety-related features (PACK 111 integration)
 */
export async function getSafetyResourcesForTrigger(
  userId: string,
  triggerType: 'CRISIS' | 'MENTAL_HEALTH' | 'DOMESTIC_VIOLENCE' | 'HARASSMENT',
  userRegion: string
): Promise<SafetyResource[]> {
  try {
    logger.info('[Pack122] Getting safety resources for trigger', { 
      userId, 
      triggerType, 
      userRegion 
    });

    // Get all resources for region
    const allResources = await getSafetyResourcesForRegion(userRegion);

    // Filter based on trigger type
    let relevantResources: SafetyResource[];

    switch (triggerType) {
      case 'CRISIS':
        relevantResources = allResources.filter(r => 
          r.type === 'CRISIS_HOTLINE' || r.type === 'MENTAL_HEALTH'
        );
        break;

      case 'MENTAL_HEALTH':
        relevantResources = allResources.filter(r => 
          r.type === 'MENTAL_HEALTH'
        );
        break;

      case 'DOMESTIC_VIOLENCE':
        relevantResources = allResources.filter(r => 
          r.type === 'DOMESTIC_VIOLENCE' || r.type === 'CRISIS_HOTLINE'
        );
        break;

      case 'HARASSMENT':
        relevantResources = allResources.filter(r => 
          r.type === 'LEGAL_AID' || r.type === 'CRISIS_HOTLINE'
        );
        break;

      default:
        relevantResources = allResources;
    }

    // Log resource provision for analytics
    await logSafetyResourceProvision(userId, triggerType, relevantResources.length);

    return relevantResources;

  } catch (error) {
    logger.error('[Pack122] Error getting safety resources for trigger', { 
      userId, 
      triggerType, 
      error 
    });
    // Return global resources as fallback
    return getGlobalSafetyResources();
  }
}

/**
 * Log when safety resources are provided to user
 */
async function logSafetyResourceProvision(
  userId: string,
  triggerType: string,
  resourceCount: number
): Promise<void> {
  try {
    await db.collection('safety_resource_provisions').add({
      userId,
      triggerType,
      resourceCount,
      providedAt: Timestamp.now(),
    });
  } catch (error) {
    logger.error('[Pack122] Error logging safety resource provision', { userId, error });
    // Don't throw - logging failure shouldn't block resource provision
  }
}

// ============================================================================
// RESOURCE VALIDATION
// ============================================================================

/**
 * Validate safety resource data
 */
export function validateSafetyResource(resource: Partial<SafetyResource>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!resource.resourceId) {
    errors.push('resourceId is required');
  }

  if (!resource.region) {
    errors.push('region is required');
  }

  if (!resource.type) {
    errors.push('type is required');
  }

  if (!resource.name) {
    errors.push('name is required');
  }

  if (!resource.phoneNumber && !resource.website && !resource.textNumber) {
    errors.push('At least one contact method (phone, website, or text) is required');
  }

  if (!resource.language) {
    errors.push('language is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// ADMIN UTILITIES
// ============================================================================

/**
 * Get all safety resources (for admin dashboard)
 */
export async function getAllSafetyResources(): Promise<SafetyResource[]> {
  try {
    const snapshot = await db
      .collection('safety_resources')
      .orderBy('region')
      .orderBy('displayPriority')
      .get();

    return snapshot.docs.map(doc => doc.data() as SafetyResource);
  } catch (error) {
    logger.error('[Pack122] Error getting all safety resources', { error });
    throw error;
  }
}

/**
 * Get safety resources by region (for admin dashboard)
 */
export async function getSafetyResourcesByRegion(regionCode: string): Promise<SafetyResource[]> {
  try {
    const snapshot = await db
      .collection('safety_resources')
      .where('region', '==', regionCode.toUpperCase())
      .orderBy('displayPriority')
      .get();

    return snapshot.docs.map(doc => doc.data() as SafetyResource);
  } catch (error) {
    logger.error('[Pack122] Error getting safety resources by region', { regionCode, error });
    throw error;
  }
}

/**
 * Get safety resource statistics
 */
export async function getSafetyResourceStats(): Promise<{
  totalResources: number;
  resourcesByRegion: Record<string, number>;
  resourcesByType: Record<string, number>;
  verifiedCount: number;
  unverifiedCount: number;
}> {
  try {
    const snapshot = await db.collection('safety_resources').get();
    const resources = snapshot.docs.map(doc => doc.data() as SafetyResource);

    const resourcesByRegion: Record<string, number> = {};
    const resourcesByType: Record<string, number> = {};
    let verifiedCount = 0;
    let unverifiedCount = 0;

    for (const resource of resources) {
      // Count by region
      resourcesByRegion[resource.region] = (resourcesByRegion[resource.region] || 0) + 1;

      // Count by type
      resourcesByType[resource.type] = (resourcesByType[resource.type] || 0) + 1;

      // Count verification status
      if (resource.verified) {
        verifiedCount++;
      } else {
        unverifiedCount++;
      }
    }

    return {
      totalResources: resources.length,
      resourcesByRegion,
      resourcesByType,
      verifiedCount,
      unverifiedCount,
    };

  } catch (error) {
    logger.error('[Pack122] Error getting safety resource stats', { error });
    throw error;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { SafetyResource } from './pack122-types';