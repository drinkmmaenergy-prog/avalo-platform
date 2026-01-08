/**
 * PACK 353 — Safe Rollback System
 * 
 * Purpose: Allow safe feature rollbacks without downtime
 * Capability: Disable individual features, version tracking
 */

import * as admin from 'firebase-admin';

type FeatureName =
  | 'chat'
  | 'calls'
  | 'calendar'
  | 'events'
  | 'wallet'
  | 'ai'
  | 'support';

interface FeatureVersion {
  feature: FeatureName;
  version: string;
  status: 'stable' | 'beta' | 'disabled' | 'rollback';
  deployedAt: number;
  lastStableVersion?: string;
  rollbackVersion?: string;
  autoDisableOnError: boolean;
  errorThreshold: number; // Max consecutive errors before auto-disable
  currentErrors: number;
  fallbackLogic?: 'graceful_degradation' | 'complete_disable' | 'redirect_to_stable';
}

interface RollbackRecord {
  feature: FeatureName;
  fromVersion: string;
  toVersion: string;
  reason: string;
  triggeredBy: 'auto' | 'manual';
  triggeredByUser?: string;
  rolledBackAt: number;
  restored: boolean;
  restoredAt?: number;
}

/**
 * Deploy new feature version
 */
export async function deployFeatureVersion(
  feature: FeatureName,
  version: string,
  options: {
    markAsStable?: boolean;
    autoDisableOnError?: boolean;
    errorThreshold?: number;
    fallbackLogic?: 'graceful_degradation' | 'complete_disable' | 'redirect_to_stable';
  } = {}
): Promise<{ success: boolean; versionId?: string }> {
  const db = admin.firestore();
  
  try {
    // Get current version to save as last stable
    const currentVersionDoc = await db
      .collection('featureVersions')
      .where('feature', '==', feature)
      .where('status', '==', 'stable')
      .limit(1)
      .get();
    
    const lastStableVersion = !currentVersionDoc.empty
      ? currentVersionDoc.docs[0].data().version
      : undefined;
    
    // Create new version record
    const versionData: FeatureVersion = {
      feature,
      version,
      status: options.markAsStable ? 'stable' : 'beta',
      deployedAt: Date.now(),
      lastStableVersion,
      autoDisableOnError: options.autoDisableOnError ?? true,
      errorThreshold: options.errorThreshold ?? 10,
      currentErrors: 0,
      fallbackLogic: options.fallbackLogic ?? 'graceful_degradation',
    };
    
    const versionRef = await db.collection('featureVersions').add(versionData);
    
    // Update feature status
    await db.collection('systemFeatureFlags').doc(feature).set({
      enabled: true,
      currentVersion: version,
      lastStableVersion,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    
    // Log deployment
    await db.collection('deploymentLogs').add({
      type: 'feature_deployment',
      feature,
      version,
      status: options.markAsStable ? 'stable' : 'beta',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return { success: true, versionId: versionRef.id };
  } catch (error) {
    console.error('Deploy feature version error:', error);
    return { success: false };
  }
}

/**
 * Record feature error (may trigger auto-disable)
 */
export async function recordFeatureError(
  feature: FeatureName,
  error: string,
  metadata?: any
): Promise<{ autoDisabled: boolean }> {
  const db = admin.firestore();
  
  try {
    // Get current version
    const versionSnapshot = await db
      .collection('featureVersions')
      .where('feature', '==', feature)
      .where('status', 'in', ['stable', 'beta'])
      .limit(1)
      .get();
    
    if (versionSnapshot.empty) {
      return { autoDisabled: false };
    }
    
    const versionDoc = versionSnapshot.docs[0];
    const version = versionDoc.data() as FeatureVersion;
    
    // Increment error count
    const newErrorCount = version.currentErrors + 1;
    
    await versionDoc.ref.update({
      currentErrors: newErrorCount,
      lastError: error,
      lastErrorAt: Date.now(),
    });
    
    // Log error
    await db.collection('featureErrors').add({
      feature,
      version: version.version,
      error,
      metadata,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Check if should auto-disable
    if (version.autoDisableOnError && newErrorCount >= version.errorThreshold) {
      await initiateAutoRollback(feature, version, 'error_threshold_exceeded');
      return { autoDisabled: true };
    }
    
    return { autoDisabled: false };
  } catch (error) {
    console.error('Record feature error:', error);
    return { autoDisabled: false };
  }
}

/**
 * Initiate automatic rollback
 */
async function initiateAutoRollback(
  feature: FeatureName,
  version: FeatureVersion,
  reason: string
): Promise<void> {
  const db = admin.firestore();
  
  console.warn(`Auto-rollback triggered for ${feature}:`, reason);
  
  // Determine rollback action based on fallback logic
  switch (version.fallbackLogic) {
    case 'complete_disable':
      await disableFeature(feature, 'auto', reason);
      break;
    
    case 'redirect_to_stable':
      if (version.lastStableVersion) {
        await rollbackToVersion(
          feature,
          version.lastStableVersion,
          'auto',
          undefined,
          reason
        );
      } else {
        await disableFeature(feature, 'auto', reason);
      }
      break;
    
    case 'graceful_degradation':
    default:
      // Enable degraded mode - feature works with limited functionality
      await db.collection('systemFeatureFlags').doc(feature).update({
        degradedMode: true,
        degradedReason: reason,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      break;
  }
  
  // Create rollback record
  await db.collection('rollbackRecords').add({
    feature,
    fromVersion: version.version,
    toVersion: version.lastStableVersion || 'disabled',
    reason,
    triggeredBy: 'auto',
    rolledBackAt: Date.now(),
    restored: false,
  });
  
  // Send alert
  await sendRollbackAlert(feature, version, reason, 'auto');
}

/**
 * Manual rollback to specific version
 */
export async function rollbackToVersion(
  feature: FeatureName,
  targetVersion: string,
  triggeredBy: 'auto' | 'manual',
  adminId?: string,
  reason?: string
): Promise<{ success: boolean }> {
  const db = admin.firestore();
  
  try {
    // Get current version
    const currentVersionSnapshot = await db
      .collection('featureVersions')
      .where('feature', '==', feature)
      .where('status', 'in', ['stable', 'beta'])
      .limit(1)
      .get();
    
    if (currentVersionSnapshot.empty) {
      return { success: false };
    }
    
    const currentVersion = currentVersionSnapshot.docs[0].data() as FeatureVersion;
    
    // Get target version
    const targetVersionSnapshot = await db
      .collection('featureVersions')
      .where('feature', '==', feature)
      .where('version', '==', targetVersion)
      .limit(1)
      .get();
    
    if (targetVersionSnapshot.empty) {
      return { success: false };
    }
    
    // Update current version to rollback status
    await currentVersionSnapshot.docs[0].ref.update({
      status: 'rollback',
      rollbackVersion: targetVersion,
    });
    
    // Update target version to stable
    await targetVersionSnapshot.docs[0].ref.update({
      status: 'stable',
    });
    
    // Update feature flag
    await db.collection('systemFeatureFlags').doc(feature).update({
      currentVersion: targetVersion,
      rollbackActive: true,
      rollbackReason: reason,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Create rollback record
    await db.collection('rollbackRecords').add({
      feature,
      fromVersion: currentVersion.version,
      toVersion: targetVersion,
      reason: reason || 'Manual rollback',
      triggeredBy,
      triggeredByUser: adminId,
      rolledBackAt: Date.now(),
      restored: false,
    });
    
    // Log rollback
    await db.collection('deploymentLogs').add({
      type: 'feature_rollback',
      feature,
      fromVersion: currentVersion.version,
      toVersion: targetVersion,
      triggeredBy,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`Rolled back ${feature} from ${currentVersion.version} to ${targetVersion}`);
    
    return { success: true };
  } catch (error) {
    console.error('Rollback error:', error);
    return { success: false };
  }
}

/**
 * Disable feature completely
 */
export async function disableFeature(
  feature: FeatureName,
  triggeredBy: 'auto' | 'manual',
  reason?: string,
  adminId?: string
): Promise<{ success: boolean }> {
  const db = admin.firestore();
  
  try {
    // Update feature flag
    await db.collection('systemFeatureFlags').doc(feature).update({
      enabled: false,
      disabledReason: reason,
      disabledBy: triggeredBy,
      disabledByUser: adminId,
      disabledAt: Date.now(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Log disable action
    await db.collection('deploymentLogs').add({
      type: 'feature_disabled',
      feature,
      reason,
      triggeredBy,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`Disabled feature: ${feature}, reason: ${reason}`);
    
    return { success: true };
  } catch (error) {
    console.error('Disable feature error:', error);
    return { success: false };
  }
}

/**
 * Enable feature
 */
export async function enableFeature(
  feature: FeatureName,
  adminId: string
): Promise<{ success: boolean }> {
  const db = admin.firestore();
  
  try {
    await db.collection('systemFeatureFlags').doc(feature).update({
      enabled: true,
      disabledReason: admin.firestore.FieldValue.delete(),
      disabledBy: admin.firestore.FieldValue.delete(),
      disabledByUser: admin.firestore.FieldValue.delete(),
      disabledAt: admin.firestore.FieldValue.delete(),
      degradedMode: false,
      enabledBy: adminId,
      enabledAt: Date.now(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Log enable action
    await db.collection('deploymentLogs').add({
      type: 'feature_enabled',
      feature,
      adminId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return { success: true };
  } catch (error) {
    console.error('Enable feature error:', error);
    return { success: false };
  }
}

/**
 * Get feature status
 */
export async function getFeatureStatus(
  feature: FeatureName
): Promise<any> {
  const db = admin.firestore();
  
  const doc = await db.collection('systemFeatureFlags').doc(feature).get();
  
  if (!doc.exists) {
    return null;
  }
  
  return doc.data();
}

/**
 * Get all features status
 */
export async function getAllFeaturesStatus(): Promise<Record<FeatureName, any>> {
  const db = admin.firestore();
  
  const features: FeatureName[] = ['chat', 'calls', 'calendar', 'events', 'wallet', 'ai', 'support'];
  const statuses: any = {};
  
  for (const feature of features) {
    const status = await getFeatureStatus(feature);
    statuses[feature] = status || { enabled: false, currentVersion: 'unknown' };
  }
  
  return statuses;
}

/**
 * Get rollback history
 */
export async function getRollbackHistory(
  feature?: FeatureName,
  limit: number = 50
): Promise<RollbackRecord[]> {
  const db = admin.firestore();
  
  let query: any = db.collection('rollbackRecords');
  
  if (feature) {
    query = query.where('feature', '==', feature);
  }
  
  const snapshot = await query
    .orderBy('rolledBackAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map((doc) => doc.data() as RollbackRecord);
}

/**
 * Send rollback alert
 */
async function sendRollbackAlert(
  feature: FeatureName,
  version: FeatureVersion,
  reason: string,
  triggeredBy: 'auto' | 'manual'
): Promise<void> {
  const db = admin.firestore();
  
  // Send to admin panel
  await db.collection('adminNotifications').add({
    type: 'feature_rollback',
    feature,
    version: version.version,
    reason,
    triggeredBy,
    severity: 'critical',
    message: `Feature "${feature}" (v${version.version}) has been rolled back. Reason: ${reason}`,
    read: false,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  console.warn('Rollback alert sent:', {
    feature,
    version: version.version,
    reason,
    triggeredBy,
  });
}

/**
 * Reset error counter (after fix deployment)
 */
export async function resetFeatureErrors(
  feature: FeatureName
): Promise<{ success: boolean }> {
  const db = admin.firestore();
  
  try {
    const versionSnapshot = await db
      .collection('featureVersions')
      .where('feature', '==', feature)
      .where('status', 'in', ['stable', 'beta'])
      .limit(1)
      .get();
    
    if (!versionSnapshot.empty) {
      await versionSnapshot.docs[0].ref.update({
        currentErrors: 0,
        lastError: admin.firestore.FieldValue.delete(),
        lastErrorAt: admin.firestore.FieldValue.delete(),
      });
    }
    
    return { success: true };
  } catch (error) {
    console.error('Reset errors error:', error);
    return { success: false };
  }
}
