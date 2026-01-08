/**
 * PACK 91 — Regional Policy Engine & Content Classification
 * Admin Functions for Policy Management
 * 
 * Provides admin endpoints for managing regional policies and reviewing content classifications.
 * All endpoints require admin role verification.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  RegionalPolicy,
  SetRegionalPolicyPayload,
  ListPoliciesQuery,
  ListPoliciesResult,
  PolicyScope,
} from './pack91-types';
import { logBusinessEvent } from './pack90-logging';

// ============================================================================
// ADMIN VERIFICATION
// ============================================================================

/**
 * Verify that the caller has admin role
 */
async function verifyAdminRole(context: any): Promise<void> {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  
  const adminDoc = await db.collection('admin_roles')
    .doc(context.auth.uid)
    .get();
  
  if (!adminDoc.exists || !adminDoc.data()?.active) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
}

// ============================================================================
// POLICY MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Create or update a regional policy
 * 
 * @param payload - Policy configuration
 * @returns Created/updated policy
 */
export const admin_setRegionalPolicy = onCall<SetRegionalPolicyPayload>(
  async (request) => {
    await verifyAdminRole(request);
    
    const { data } = request;
    const adminId = request.auth!.uid;
    
    try {
      // Generate ID if creating new policy
      let policyId = data.id;
      
      if (!policyId) {
        // Auto-generate ID based on scope
        if (data.scope === 'GLOBAL') {
          policyId = 'GLOBAL_DEFAULT';
        } else if (data.scope === 'COUNTRY' && data.countryCode) {
          policyId = data.countryCode;
        } else if (data.scope === 'REGION_GROUP' && data.regionGroup) {
          policyId = data.regionGroup;
        } else {
          throw new HttpsError('invalid-argument', 'Invalid policy scope or missing identifiers');
        }
      }
      
      // Validate payload
      validatePolicyPayload(data);
      
      // Build policy document
      const policy: RegionalPolicy = {
        id: policyId,
        scope: data.scope,
        countryCode: data.countryCode,
        regionGroup: data.regionGroup,
        allowNSFWSoft: data.allowNSFWSoft,
        allowNSFWStrong: data.allowNSFWStrong,
        monetizeNSFWSoft: data.monetizeNSFWSoft,
        monetizeNSFWStrong: data.monetizeNSFWStrong,
        showInDiscoveryNSFW: data.showInDiscoveryNSFW,
        minAgeForSensitive: data.minAgeForSensitive,
        minAgeForNSFWSoft: data.minAgeForNSFWSoft,
        minAgeForNSFWStrong: data.minAgeForNSFWStrong,
        storeComplianceFlags: data.storeComplianceFlags || [],
        updatedAt: Timestamp.now(),
        updatedBy: adminId,
        notes: data.notes,
      };
      
      // Check if updating existing policy
      const existingDoc = await db.collection('regional_policies').doc(policyId).get();
      const isUpdate = existingDoc.exists;
      
      // Save policy
      await db.collection('regional_policies').doc(policyId).set(policy);
      
      // Log the change (PACK 90 integration)
      await logBusinessEvent({
        eventType: isUpdate ? 'POLICY_UPDATED' : 'POLICY_CREATED' as any,
        actorUserId: adminId,
        relatedId: policyId,
        metadata: {
          scope: policy.scope,
          countryCode: policy.countryCode,
          regionGroup: policy.regionGroup,
          allowNSFWSoft: policy.allowNSFWSoft,
          allowNSFWStrong: policy.allowNSFWStrong,
        },
        source: 'ADMIN_PANEL',
        functionName: 'admin_setRegionalPolicy',
      });
      
      console.log(`[Pack91] ${isUpdate ? 'Updated' : 'Created'} regional policy: ${policyId}`);
      
      return {
        success: true,
        policy,
        message: `Policy ${isUpdate ? 'updated' : 'created'} successfully`,
      };
    } catch (error: any) {
      console.error('[Pack91] admin_setRegionalPolicy failed:', error);
      throw new HttpsError('internal', error.message || 'Failed to set regional policy');
    }
  }
);

/**
 * List regional policies with optional filters
 * 
 * @param query - Query parameters (scope, country, region)
 * @returns List of policies
 */
export const admin_listRegionalPolicies = onCall<ListPoliciesQuery>(
  async (request) => {
    await verifyAdminRole(request);
    
    const { data = {} } = request;
    
    try {
      let query: any = db.collection('regional_policies');
      
      // Apply filters
      if (data.scope) {
        query = query.where('scope', '==', data.scope);
      }
      
      if (data.countryCode) {
        query = query.where('countryCode', '==', data.countryCode);
      }
      
      if (data.regionGroup) {
        query = query.where('regionGroup', '==', data.regionGroup);
      }
      
      // Order by scope then ID
      query = query.orderBy('scope').orderBy('id');
      
      const snapshot = await query.get();
      
      const policies: RegionalPolicy[] = snapshot.docs.map(doc => doc.data() as RegionalPolicy);
      
      // Optionally include global if not already present
      if (data.includeGlobal && !policies.find(p => p.id === 'GLOBAL_DEFAULT')) {
        const globalDoc = await db.collection('regional_policies').doc('GLOBAL_DEFAULT').get();
        if (globalDoc.exists) {
          policies.unshift(globalDoc.data() as RegionalPolicy);
        }
      }
      
      const result: ListPoliciesResult = {
        policies,
        total: policies.length,
      };
      
      return result;
    } catch (error: any) {
      console.error('[Pack91] admin_listRegionalPolicies failed:', error);
      throw new HttpsError('internal', error.message || 'Failed to list regional policies');
    }
  }
);

/**
 * Get a specific regional policy by ID
 * 
 * @param policyId - Policy ID to retrieve
 * @returns Policy document
 */
export const admin_getRegionalPolicy = onCall<{ policyId: string }>(
  async (request) => {
    await verifyAdminRole(request);
    
    const { data } = request;
    
    if (!data.policyId) {
      throw new HttpsError('invalid-argument', 'policyId is required');
    }
    
    try {
      const doc = await db.collection('regional_policies').doc(data.policyId).get();
      
      if (!doc.exists) {
        throw new HttpsError('not-found', `Policy ${data.policyId} not found`);
      }
      
      return {
        policy: doc.data() as RegionalPolicy,
      };
    } catch (error: any) {
      console.error('[Pack91] admin_getRegionalPolicy failed:', error);
      throw new HttpsError('internal', error.message || 'Failed to get regional policy');
    }
  }
);

/**
 * Delete a regional policy
 * 
 * @param policyId - Policy ID to delete
 */
export const admin_deleteRegionalPolicy = onCall<{ policyId: string }>(
  async (request) => {
    await verifyAdminRole(request);
    
    const { data } = request;
    const adminId = request.auth!.uid;
    
    if (!data.policyId) {
      throw new HttpsError('invalid-argument', 'policyId is required');
    }
    
    // Prevent deleting global default
    if (data.policyId === 'GLOBAL_DEFAULT') {
      throw new HttpsError('failed-precondition', 'Cannot delete global default policy');
    }
    
    try {
      const doc = await db.collection('regional_policies').doc(data.policyId).get();
      
      if (!doc.exists) {
        throw new HttpsError('not-found', `Policy ${data.policyId} not found`);
      }
      
      await db.collection('regional_policies').doc(data.policyId).delete();
      
      // Log the deletion
      await logBusinessEvent({
        eventType: 'POLICY_UPDATED' as any,
        actorUserId: adminId,
        relatedId: data.policyId,
        metadata: {
          action: 'DELETED',
        },
        source: 'ADMIN_PANEL',
        functionName: 'admin_deleteRegionalPolicy',
      });
      
      console.log(`[Pack91] Deleted regional policy: ${data.policyId}`);
      
      return {
        success: true,
        message: `Policy ${data.policyId} deleted successfully`,
      };
    } catch (error: any) {
      console.error('[Pack91] admin_deleteRegionalPolicy failed:', error);
      throw new HttpsError('internal', error.message || 'Failed to delete regional policy');
    }
  }
);

// ============================================================================
// CONTENT MODERATION ENDPOINTS
// ============================================================================

/**
 * Review and reclassify content
 * 
 * @param contentId - Content ID to review
 * @param contentType - Type of content (story, media, etc.)
 * @param newRating - New content rating
 * @param reviewNote - Moderator's review note
 */
export const admin_reviewContentRating = onCall<{
  contentId: string;
  contentType: 'premium_story' | 'paid_media' | 'post';
  newRating: string;
  reviewNote?: string;
}>(
  async (request) => {
    await verifyAdminRole(request);
    
    const { data } = request;
    const moderatorId = request.auth!.uid;
    
    if (!data.contentId || !data.contentType || !data.newRating) {
      throw new HttpsError('invalid-argument', 'contentId, contentType, and newRating are required');
    }
    
    try {
      // Determine collection based on content type
      let collection: string;
      switch (data.contentType) {
        case 'premium_story':
          collection = 'premium_stories';
          break;
        case 'paid_media':
          collection = 'paid_media_messages';
          break;
        case 'post':
          collection = 'posts';
          break;
        default:
          throw new HttpsError('invalid-argument', 'Invalid content type');
      }
      
      // Update content rating
      await db.collection(collection).doc(data.contentId).update({
        contentRating: data.newRating,
        reviewStatus: 'MOD_REVIEWED',
        'classification.reviewedAt': Timestamp.now(),
        'classification.reviewedBy': moderatorId,
        'classification.reviewNote': data.reviewNote || '',
      });
      
      // Log the review
      await logBusinessEvent({
        eventType: 'MANUAL_REVIEW_COMPLETED',
        actorUserId: moderatorId,
        relatedId: data.contentId,
        metadata: {
          contentType: data.contentType,
          newRating: data.newRating,
          reviewNote: data.reviewNote,
        },
        source: 'ADMIN_PANEL',
        functionName: 'admin_reviewContentRating',
      });
      
      console.log(`[Pack91] Reviewed content ${data.contentId}: ${data.newRating}`);
      
      return {
        success: true,
        message: 'Content rating updated successfully',
      };
    } catch (error: any) {
      console.error('[Pack91] admin_reviewContentRating failed:', error);
      throw new HttpsError('internal', error.message || 'Failed to review content rating');
    }
  }
);

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate policy payload before saving
 */
function validatePolicyPayload(payload: SetRegionalPolicyPayload): void {
  // Validate scope-specific fields
  if (payload.scope === 'COUNTRY' && !payload.countryCode) {
    throw new HttpsError('invalid-argument', 'countryCode required for COUNTRY scope');
  }
  
  if (payload.scope === 'REGION_GROUP' && !payload.regionGroup) {
    throw new HttpsError('invalid-argument', 'regionGroup required for REGION_GROUP scope');
  }
  
  // Validate age requirements
  if (payload.minAgeForSensitive < 0 || payload.minAgeForSensitive > 100) {
    throw new HttpsError('invalid-argument', 'Invalid minAgeForSensitive');
  }
  
  if (payload.minAgeForNSFWSoft < 0 || payload.minAgeForNSFWSoft > 100) {
    throw new HttpsError('invalid-argument', 'Invalid minAgeForNSFWSoft');
  }
  
  if (payload.minAgeForNSFWStrong < 0 || payload.minAgeForNSFWStrong > 100) {
    throw new HttpsError('invalid-argument', 'Invalid minAgeForNSFWStrong');
  }
  
  // Validate logical consistency
  if (payload.monetizeNSFWSoft && !payload.allowNSFWSoft) {
    throw new HttpsError('invalid-argument', 'Cannot monetize NSFW soft if not allowed');
  }
  
  if (payload.monetizeNSFWStrong && !payload.allowNSFWStrong) {
    throw new HttpsError('invalid-argument', 'Cannot monetize NSFW strong if not allowed');
  }
}

/**
 * Get policy statistics (for admin dashboard)
 */
export const admin_getPolicyStats = onCall(
  async (request) => {
    await verifyAdminRole(request);
    
    try {
      const snapshot = await db.collection('regional_policies').get();
      
      const stats = {
        totalPolicies: snapshot.size,
        byScope: {
          GLOBAL: 0,
          REGION_GROUP: 0,
          COUNTRY: 0,
        },
        nsfwRestrictions: {
          softBlocked: 0,
          strongBlocked: 0,
          discoveryBlocked: 0,
        },
        monetizationRestrictions: {
          softBlocked: 0,
          strongBlocked: 0,
        },
      };
      
      snapshot.docs.forEach(doc => {
        const policy = doc.data() as RegionalPolicy;
        
        stats.byScope[policy.scope]++;
        
        if (!policy.allowNSFWSoft) stats.nsfwRestrictions.softBlocked++;
        if (!policy.allowNSFWStrong) stats.nsfwRestrictions.strongBlocked++;
        if (!policy.showInDiscoveryNSFW) stats.nsfwRestrictions.discoveryBlocked++;
        if (!policy.monetizeNSFWSoft) stats.monetizationRestrictions.softBlocked++;
        if (!policy.monetizeNSFWStrong) stats.monetizationRestrictions.strongBlocked++;
      });
      
      return stats;
    } catch (error: any) {
      console.error('[Pack91] admin_getPolicyStats failed:', error);
      throw new HttpsError('internal', error.message || 'Failed to get policy stats');
    }
  }
);