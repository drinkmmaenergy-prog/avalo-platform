/**
 * PACK 100 — Disaster Recovery & Backup Utilities
 * 
 * Critical data backup and restore utilities
 * Ensures business continuity and data integrity
 * 
 * COMPLIANCE RULES:
 * - Backups preserve all financial records immutably
 * - No tampering with earnings, payouts, or transaction history
 * - Revenue split and tokenomics remain unchanged
 */

import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logBusinessEvent, logTechEvent } from './pack90-logging';
import * as functions from 'firebase-functions';

// ============================================================================
// TYPES
// ============================================================================

export interface BackupMetadata {
  backupId: string;
  collections: string[];
  documentCount: number;
  createdAt: Timestamp;
  createdBy: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  backupLocation?: string;
  errorMessage?: string;
}

export interface RestoreMetadata {
  restoreId: string;
  backupId: string;
  collections: string[];
  documentsRestored: number;
  createdAt: Timestamp;
  createdBy: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  errorMessage?: string;
}

// ============================================================================
// CRITICAL COLLECTIONS FOR BACKUP
// ============================================================================

/**
 * Collections that MUST be backed up regularly
 * These contain financial and legal records
 */
export const CRITICAL_COLLECTIONS = [
  'earnings_ledger',           // All earning events
  'creator_balances',          // Current balance states
  'payout_requests',           // Payout requests and statuses
  'user_profiles',             // User account data
  'user_trust_profile',        // Trust & risk scores
  'enforcement_state',         // Account enforcement records
  'kyc_applications',          // KYC verification data
  'transaction_issues',        // Disputes and issues
  'business_audit_log',        // Business event audit trail
  'legal_acceptances',         // Legal document acceptances
];

/**
 * Collections for operational backup (lower priority)
 */
export const OPERATIONAL_COLLECTIONS = [
  'user_sessions',
  'rate_limit_counters',
  'metrics_daily',
  'tech_event_log',
  'moderation_cases',
];

// ============================================================================
// BACKUP DOCUMENTATION
// ============================================================================

/**
 * Document backup strategy and locations
 * This is a reference guide for ops teams
 */
export interface BackupStrategy {
  criticalCollections: string[];
  backupFrequency: {
    critical: string;      // e.g., "Every 6 hours"
    operational: string;   // e.g., "Daily"
  };
  retentionPolicy: {
    critical: string;      // e.g., "7 years (financial records)"
    operational: string;   // e.g., "90 days"
  };
  backupMethod: string;
  restoreRTO: string;      // Recovery Time Objective
  restoreRPO: string;      // Recovery Point Objective
}

export const BACKUP_STRATEGY: BackupStrategy = {
  criticalCollections: CRITICAL_COLLECTIONS,
  backupFrequency: {
    critical: 'Every 6 hours via Cloud Scheduler',
    operational: 'Daily at 3 AM UTC',
  },
  retentionPolicy: {
    critical: '7 years (financial and legal compliance)',
    operational: '90 days',
  },
  backupMethod: 'Firestore export to Cloud Storage bucket',
  restoreRTO: '4 hours maximum',
  restoreRPO: '6 hours maximum (last backup)',
};

// ============================================================================
// BACKUP VALIDATION
// ============================================================================

/**
 * Validate data integrity before backup
 * Ensures critical records are consistent
 */
export async function validateBackupIntegrity(
  collectionName: string
): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];
  
  try {
    if (collectionName === 'earnings_ledger') {
      // Check for negative balances (should never happen)
      const negativeQuery = await db.collection('earnings_ledger')
        .where('tokensAmount', '<', 0)
        .limit(1)
        .get();
      
      if (!negativeQuery.empty) {
        issues.push('Found negative token amounts in earnings ledger');
      }
    }
    
    if (collectionName === 'creator_balances') {
      // Check for corrupted balance records
      const snapshot = await db.collection('creator_balances')
        .limit(100)
        .get();
      
      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (typeof data.availableTokens !== 'number' || data.availableTokens < 0) {
          issues.push(`Invalid balance for user ${doc.id}`);
        }
      }
    }
    
    if (collectionName === 'payout_requests') {
      // Check for inconsistent payout states
      const pendingPayouts = await db.collection('payout_requests')
        .where('status', '==', 'PENDING')
        .where('createdAt', '<=', Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .limit(10)
        .get();
      
      if (!pendingPayouts.empty) {
        issues.push(`Found ${pendingPayouts.size} stale PENDING payouts (>30 days old)`);
      }
    }
    
    return {
      valid: issues.length === 0,
      issues,
    };
  } catch (error) {
    console.error(`[DisasterRecovery] Error validating ${collectionName}:`, error);
    return {
      valid: false,
      issues: [`Validation error: ${String(error)}`],
    };
  }
}

// ============================================================================
// BACKUP METADATA TRACKING
// ============================================================================

/**
 * Record backup metadata for tracking
 */
export async function recordBackupMetadata(
  metadata: BackupMetadata
): Promise<void> {
  try {
    await db.collection('backup_metadata').doc(metadata.backupId).set(metadata);
    
    await logTechEvent({
      level: 'INFO',
      category: 'JOB',
      functionName: 'recordBackupMetadata',
      message: `Backup ${metadata.status}: ${metadata.backupId}`,
      context: {
        backupId: metadata.backupId,
        collections: metadata.collections.join(','),
        documentCount: metadata.documentCount,
      },
    });
  } catch (error) {
    console.error('[DisasterRecovery] Error recording backup metadata:', error);
  }
}

/**
 * Get backup history
 */
export async function getBackupHistory(
  limit: number = 20
): Promise<BackupMetadata[]> {
  try {
    const snapshot = await db.collection('backup_metadata')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    
    return snapshot.docs.map(doc => doc.data() as BackupMetadata);
  } catch (error) {
    console.error('[DisasterRecovery] Error fetching backup history:', error);
    return [];
  }
}

// ============================================================================
// RESTORE METADATA TRACKING
// ============================================================================

/**
 * Record restore operation metadata
 */
export async function recordRestoreMetadata(
  metadata: RestoreMetadata
): Promise<void> {
  try {
    await db.collection('restore_metadata').doc(metadata.restoreId).set(metadata);
    
    await logBusinessEvent({
      eventType: 'MODERATOR_ACTION',
      actorUserId: metadata.createdBy,
      metadata: {
        action: 'DISASTER_RECOVERY_RESTORE',
        restoreId: metadata.restoreId,
        backupId: metadata.backupId,
        status: metadata.status,
      },
      source: 'ADMIN_PANEL',
      functionName: 'recordRestoreMetadata',
    });
    
    await logTechEvent({
      level: 'INFO',
      category: 'JOB',
      functionName: 'recordRestoreMetadata',
      message: `Restore ${metadata.status}: ${metadata.restoreId}`,
      context: {
        restoreId: metadata.restoreId,
        backupId: metadata.backupId,
        documentsRestored: metadata.documentsRestored,
      },
    });
  } catch (error) {
    console.error('[DisasterRecovery] Error recording restore metadata:', error);
  }
}

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * Get backup strategy documentation (admin only)
 */
export const admin_getBackupStrategy = functions.https.onCall(async (data, context) => {
  // Require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  // Check admin privileges
  const adminDoc = await db.collection('admin_users').doc(context.auth.uid).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  return {
    success: true,
    strategy: BACKUP_STRATEGY,
  };
});

/**
 * Get backup history (admin only)
 */
export const admin_getBackupHistory = functions.https.onCall(async (data, context) => {
  // Require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  // Check admin privileges
  const adminDoc = await db.collection('admin_users').doc(context.auth.uid).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  try {
    const { limit } = data as { limit?: number };
    const history = await getBackupHistory(limit || 20);
    
    return {
      success: true,
      backups: history.map(b => ({
        ...b,
        createdAt: b.createdAt.toMillis(),
      })),
    };
  } catch (error: any) {
    console.error('[DisasterRecovery] Error in admin_getBackupHistory:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Validate backup integrity (admin only)
 */
export const admin_validateBackupIntegrity = functions.https.onCall(async (data, context) => {
  // Require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  // Check admin privileges
  const adminDoc = await db.collection('admin_users').doc(context.auth.uid).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  try {
    const { collection } = data as { collection: string };
    
    if (!collection) {
      throw new functions.https.HttpsError('invalid-argument', 'collection is required');
    }
    
    if (!CRITICAL_COLLECTIONS.includes(collection) && !OPERATIONAL_COLLECTIONS.includes(collection)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid collection name');
    }
    
    const validation = await validateBackupIntegrity(collection);
    
    return {
      success: true,
      collection,
      validation,
    };
  } catch (error: any) {
    console.error('[DisasterRecovery] Error in admin_validateBackupIntegrity:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// DISASTER RECOVERY RUNBOOK
// ============================================================================

/**
 * Disaster Recovery Runbook
 * 
 * This is documentation for ops teams on how to perform recovery
 * 
 * CRITICAL DATA BACKUP LOCATIONS:
 * - Firestore exports: gs://avalo-backups/firestore/
 * - Storage media backups: gs://avalo-backups/storage/
 * 
 * RECOVERY PROCEDURES:
 * 
 * 1. ASSESS THE SITUATION
 *    - Determine scope of data loss
 *    - Identify last known good backup
 *    - Calculate data recovery window
 * 
 * 2. FINANCIAL DATA PRIORITY
 *    Collections to restore FIRST:
 *    - earnings_ledger (all earnings events)
 *    - creator_balances (current balance states)
 *    - payout_requests (payout history)
 *    - business_audit_log (audit trail)
 * 
 * 3. RESTORE PROCESS
 *    a) Stop all write operations (enable maintenance mode)
 *    b) Restore Firestore collections from backup
 *    c) Validate data integrity using admin_validateBackupIntegrity
 *    d) Run reconciliation checks
 *    e) Resume operations
 * 
 * 4. POST-RECOVERY VALIDATION
 *    - Verify all critical financial records
 *    - Check for data consistency
 *    - Confirm no revenue split alterations
 *    - Validate payout eligibility remains correct
 * 
 * 5. COMMUNICATION
 *    - Notify affected users if necessary
 *    - Document incident and recovery timeline
 *    - Update backup procedures if gaps identified
 * 
 * FIRESTORE EXPORT COMMAND (Manual):
 * ```
 * gcloud firestore export gs://avalo-backups/firestore/$(date +%Y%m%d_%H%M%S) \
 *   --collection-ids=earnings_ledger,creator_balances,payout_requests
 * ```
 * 
 * FIRESTORE IMPORT COMMAND (Manual):
 * ```
 * gcloud firestore import gs://avalo-backups/firestore/BACKUP_TIMESTAMP
 * ```
 */

export const DISASTER_RECOVERY_RUNBOOK = {
  criticalCollections: CRITICAL_COLLECTIONS,
  backupLocations: {
    firestore: 'gs://avalo-backups/firestore/',
    storage: 'gs://avalo-backups/storage/',
  },
  recoveryPriority: [
    'earnings_ledger',
    'creator_balances',
    'payout_requests',
    'business_audit_log',
    'user_profiles',
    'user_trust_profile',
    'enforcement_state',
  ],
  contactsAndEscalation: {
    primary: 'ops-team@avalo.app',
    escalation: 'tech-lead@avalo.app',
  },
};