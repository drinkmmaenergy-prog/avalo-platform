/**
 * PACK 99 — Admin Cloud Functions
 * Admin-only endpoints for managing feature flags and remote config
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId } from './init';
import * as logger from 'firebase-functions/logger';
import { writeAuditLog } from './auditLogger';
import {
  FeatureFlag,
  RemoteConfigParam,
  CreateFeatureFlagInput,
  UpdateFeatureFlagInput,
  CreateRemoteConfigParamInput,
  UpdateRemoteConfigParamInput,
} from './pack99-types';
import {
  validateFeatureFlagInput,
  validateRemoteConfigParamInput,
  logValidationFailure,
} from './pack99-validation';
import { clearCachedConfig } from './pack99-featureConfig';

// ============================================================================
// AUTHENTICATION HELPER
// ============================================================================

/**
 * Verify admin role
 * TODO: Replace with proper PACK 88 admin auth when integrated
 */
function requireAdmin(auth: any): {
  adminId: string;
  email: string;
  roles: any[];
  permissions: any;
} {
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  // TODO: Check if user has admin or ops role
  // For now, we'll assume they do
  // In production, this should check user.roles.admin or user.roles.moderator

  return {
    adminId: auth.uid,
    email: auth.token?.email || 'unknown',
    roles: ['SUPERADMIN'], // TODO: Get from user document
    permissions: {
      // Default permissions for now
      canViewUsers: true,
      canEditEnforcement: true,
      canEditAmlStatus: true,
      canResolveDisputes: true,
      canApprovePayouts: true,
      canReviewDeletionRequests: true,
      canManagePromotions: true,
      canManagePolicies: true,
    },
  };
}

// ============================================================================
// FEATURE FLAGS - LIST
// ============================================================================

export const admin_listFeatureFlags = onCall(async (request) => {
  const admin = requireAdmin(request.auth);

  try {
    const snapshot = await db
      .collection('feature_flags')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const flags = snapshot.docs.map((doc) => {
      const data = doc.data() as FeatureFlag;
      return {
        id: data.id,
        description: data.description,
        type: data.type,
        defaultVariant: data.defaultVariant,
        rulesCount: data.rules?.length || 0,
        safeScope: data.safeScope,
        updatedAt: data.updatedAt,
        createdAt: data.createdAt,
      };
    });

    return {
      success: true,
      flags,
      count: flags.length,
    };
  } catch (error: any) {
    logger.error('Error listing feature flags:', error);
    throw new HttpsError('internal', 'Failed to list feature flags');
  }
});

// ============================================================================
// FEATURE FLAGS - GET
// ============================================================================

export const admin_getFeatureFlag = onCall(async (request) => {
  const admin = requireAdmin(request.auth);
  const { key } = request.data;

  if (!key) {
    throw new HttpsError('invalid-argument', 'key is required');
  }

  try {
    const flagDoc = await db.collection('feature_flags').doc(key).get();

    if (!flagDoc.exists) {
      throw new HttpsError('not-found', `Feature flag not found: ${key}`);
    }

    const flag = flagDoc.data() as FeatureFlag;

    return {
      success: true,
      flag,
    };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error('Error getting feature flag:', error);
    throw new HttpsError('internal', 'Failed to get feature flag');
  }
});

// ============================================================================
// FEATURE FLAGS - CREATE/UPDATE
// ============================================================================

export const admin_createOrUpdateFeatureFlag = onCall(async (request) => {
  const admin = requireAdmin(request.auth);
  const payload = request.data as CreateFeatureFlagInput | UpdateFeatureFlagInput;

  // Check if this is create or update
  const isUpdate = !!(payload as any).id;
  const key = (payload as any).id;

  if (!key) {
    throw new HttpsError('invalid-argument', 'id is required');
  }

  try {
    // Check if flag exists
    const flagDoc = await db.collection('feature_flags').doc(key).get();
    const exists = flagDoc.exists;
    const isCreate = !exists;

    // For updates, we need to merge with existing data
    let flagData: Partial<FeatureFlag>;

    if (isCreate) {
      // Creating new flag
      const createPayload = payload as CreateFeatureFlagInput;

      // Validate complete input
      const validation = validateFeatureFlagInput({
        id: createPayload.id,
        description: createPayload.description,
        variants: createPayload.variants,
        safeScope: createPayload.safeScope,
        rules: createPayload.rules,
      });

      if (!validation.valid) {
        logValidationFailure('feature_flag', key, validation.errors, admin.adminId);
        throw new HttpsError(
          'invalid-argument',
          `Validation failed: ${validation.errors.join(', ')}`
        );
      }

      flagData = {
        id: createPayload.id,
        description: createPayload.description,
        type: createPayload.type,
        variants: createPayload.variants,
        defaultVariant: createPayload.defaultVariant,
        rules: createPayload.rules || [],
        safeScope: createPayload.safeScope,
        createdAt: serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
      };
    } else {
      // Updating existing flag
      const updatePayload = payload as UpdateFeatureFlagInput;
      const existingFlag = flagDoc.data() as FeatureFlag;

      // Build updated flag with merged data
      const mergedFlag = {
        ...existingFlag,
        description: updatePayload.description ?? existingFlag.description,
        variants: updatePayload.variants ?? existingFlag.variants,
        defaultVariant: updatePayload.defaultVariant ?? existingFlag.defaultVariant,
        rules: updatePayload.rules ?? existingFlag.rules,
        safeScope: updatePayload.safeScope ?? existingFlag.safeScope,
      };

      // Validate merged result
      const validation = validateFeatureFlagInput({
        id: mergedFlag.id,
        description: mergedFlag.description,
        variants: mergedFlag.variants,
        safeScope: mergedFlag.safeScope,
        rules: mergedFlag.rules,
      });

      if (!validation.valid) {
        logValidationFailure('feature_flag', key, validation.errors, admin.adminId);
        throw new HttpsError(
          'invalid-argument',
          `Validation failed: ${validation.errors.join(', ')}`
        );
      }

      flagData = {
        ...mergedFlag,
        updatedAt: serverTimestamp() as any,
      };
    }

    // Write to Firestore
    await db.collection('feature_flags').doc(key).set(flagData, { merge: true });

    // Clear cache for this flag
    clearCachedConfig(key);

    // Write audit log
    await writeAuditLog({
      admin,
      targetType: 'FEATURE_FLAG',
      targetId: key,
      action: isCreate ? 'CREATE' : 'UPDATE',
      severity: 'INFO',
      before: exists ? flagDoc.data() : null,
      after: flagData,
      reason: `${isCreate ? 'Created' : 'Updated'} feature flag: ${key}`,
    });

    logger.info(`Feature flag ${isCreate ? 'created' : 'updated'}: ${key}`, {
      adminId: admin.adminId,
    });

    return {
      success: true,
      message: `Feature flag ${isCreate ? 'created' : 'updated'} successfully`,
      key,
    };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error('Error creating/updating feature flag:', error);
    throw new HttpsError('internal', 'Failed to create/update feature flag');
  }
});

// ============================================================================
// REMOTE CONFIG PARAMS - LIST
// ============================================================================

export const admin_listRemoteConfigParams = onCall(async (request) => {
  const admin = requireAdmin(request.auth);

  try {
    const snapshot = await db
      .collection('remote_config_params')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const params = snapshot.docs.map((doc) => {
      const data = doc.data() as RemoteConfigParam;
      return {
        id: data.id,
        description: data.description,
        type: data.type,
        rulesCount: data.rules?.length || 0,
        safeScope: data.safeScope,
        updatedAt: data.updatedAt,
        createdAt: data.createdAt,
      };
    });

    return {
      success: true,
      params,
      count: params.length,
    };
  } catch (error: any) {
    logger.error('Error listing remote config params:', error);
    throw new HttpsError('internal', 'Failed to list remote config params');
  }
});

// ============================================================================
// REMOTE CONFIG PARAMS - GET
// ============================================================================

export const admin_getRemoteConfigParam = onCall(async (request) => {
  const admin = requireAdmin(request.auth);
  const { key } = request.data;

  if (!key) {
    throw new HttpsError('invalid-argument', 'key is required');
  }

  try {
    const paramDoc = await db.collection('remote_config_params').doc(key).get();

    if (!paramDoc.exists) {
      throw new HttpsError('not-found', `Remote config param not found: ${key}`);
    }

    const param = paramDoc.data() as RemoteConfigParam;

    return {
      success: true,
      param,
    };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error('Error getting remote config param:', error);
    throw new HttpsError('internal', 'Failed to get remote config param');
  }
});

// ============================================================================
// REMOTE CONFIG PARAMS - CREATE/UPDATE
// ============================================================================

export const admin_createOrUpdateRemoteConfigParam = onCall(async (request) => {
  const admin = requireAdmin(request.auth);
  const payload = request.data as CreateRemoteConfigParamInput | UpdateRemoteConfigParamInput;

  const key = (payload as any).id;

  if (!key) {
    throw new HttpsError('invalid-argument', 'id is required');
  }

  try {
    // Check if param exists
    const paramDoc = await db.collection('remote_config_params').doc(key).get();
    const exists = paramDoc.exists;
    const isCreate = !exists;

    // For updates, we need to merge with existing data
    let paramData: Partial<RemoteConfigParam>;

    if (isCreate) {
      // Creating new param
      const createPayload = payload as CreateRemoteConfigParamInput;

      // Validate complete input
      const validation = validateRemoteConfigParamInput({
        id: createPayload.id,
        description: createPayload.description,
        defaultValue: createPayload.defaultValue,
        safeScope: createPayload.safeScope,
        rules: createPayload.rules,
      });

      if (!validation.valid) {
        logValidationFailure('remote_config', key, validation.errors, admin.adminId);
        throw new HttpsError(
          'invalid-argument',
          `Validation failed: ${validation.errors.join(', ')}`
        );
      }

      paramData = {
        id: createPayload.id,
        description: createPayload.description,
        type: createPayload.type,
        defaultValue: createPayload.defaultValue,
        rules: createPayload.rules || [],
        safeScope: createPayload.safeScope,
        createdAt: serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
      };
    } else {
      // Updating existing param
      const updatePayload = payload as UpdateRemoteConfigParamInput;
      const existingParam = paramDoc.data() as RemoteConfigParam;

      // Build updated param with merged data
      const mergedParam = {
        ...existingParam,
        description: updatePayload.description ?? existingParam.description,
        defaultValue: updatePayload.defaultValue ?? existingParam.defaultValue,
        rules: updatePayload.rules ?? existingParam.rules,
        safeScope: updatePayload.safeScope ?? existingParam.safeScope,
      };

      // Validate merged result
      const validation = validateRemoteConfigParamInput({
        id: mergedParam.id,
        description: mergedParam.description,
        defaultValue: mergedParam.defaultValue,
        safeScope: mergedParam.safeScope,
        rules: mergedParam.rules,
      });

      if (!validation.valid) {
        logValidationFailure('remote_config', key, validation.errors, admin.adminId);
        throw new HttpsError(
          'invalid-argument',
          `Validation failed: ${validation.errors.join(', ')}`
        );
      }

      paramData = {
        ...mergedParam,
        updatedAt: serverTimestamp() as any,
      };
    }

    // Write to Firestore
    await db.collection('remote_config_params').doc(key).set(paramData, { merge: true });

    // Clear cache for this param
    clearCachedConfig(key);

    // Write audit log
    await writeAuditLog({
      admin,
      targetType: 'REMOTE_CONFIG',
      targetId: key,
      action: isCreate ? 'CREATE' : 'UPDATE',
      severity: 'INFO',
      before: exists ? paramDoc.data() : null,
      after: paramData,
      reason: `${isCreate ? 'Created' : 'Updated'} remote config param: ${key}`,
    });

    logger.info(`Remote config param ${isCreate ? 'created' : 'updated'}: ${key}`, {
      adminId: admin.adminId,
    });

    return {
      success: true,
      message: `Remote config param ${isCreate ? 'created' : 'updated'} successfully`,
      key,
    };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error('Error creating/updating remote config param:', error);
    throw new HttpsError('internal', 'Failed to create/update remote config param');
  }
});

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

export const admin_clearConfigCache = onCall(async (request) => {
  const admin = requireAdmin(request.auth);

  try {
    // Import and call the cache clearing function
    const { clearConfigCache } = await import('./pack99-featureConfig');
    clearConfigCache();

    // Write audit log
    await writeAuditLog({
      admin,
      targetType: 'SYSTEM',
      action: 'CACHE_CLEAR',
      severity: 'INFO',
      reason: 'Cleared feature config cache',
    });

    logger.info('Config cache cleared by admin', { adminId: admin.adminId });

    return {
      success: true,
      message: 'Config cache cleared successfully',
    };
  } catch (error: any) {
    logger.error('Error clearing config cache:', error);
    throw new HttpsError('internal', 'Failed to clear config cache');
  }
});