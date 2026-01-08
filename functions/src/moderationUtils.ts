/**
 * PACK 88 — Moderation Utilities
 * Helper functions for moderation console operations
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  ModerationAuditLog,
  ModerationActionType,
  AdminRole,
  AdminUser,
} from './types/moderation.types';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTIONS = {
  ADMIN_USERS: 'admin_users',
  MODERATION_CASES: 'moderation_cases',
  MODERATION_CASE_NOTES: 'moderation_case_notes',
  MODERATION_AUDIT_LOG: 'moderation_audit_log',
} as const;

// ============================================================================
// ADMIN ROLE VERIFICATION
// ============================================================================

/**
 * Check if a user is an admin
 */
export async function isAdmin(userId: string): Promise<boolean> {
  try {
    const adminDoc = await db.collection(COLLECTIONS.ADMIN_USERS).doc(userId).get();
    
    if (!adminDoc.exists) {
      return false;
    }
    
    const adminData = adminDoc.data() as AdminUser;
    return adminData.roles && adminData.roles.length > 0;
  } catch (error) {
    console.error(`[Moderation] Error checking admin status for user ${userId}:`, error);
    return false;
  }
}

/**
 * Check if a user has a specific admin role
 */
export async function hasAdminRole(userId: string, role: AdminRole): Promise<boolean> {
  try {
    const adminDoc = await db.collection(COLLECTIONS.ADMIN_USERS).doc(userId).get();
    
    if (!adminDoc.exists) {
      return false;
    }
    
    const adminData = adminDoc.data() as AdminUser;
    return adminData.roles && adminData.roles.includes(role);
  } catch (error) {
    console.error(`[Moderation] Error checking admin role for user ${userId}:`, error);
    return false;
  }
}

/**
 * Get admin user data
 */
export async function getAdminUser(userId: string): Promise<AdminUser | null> {
  try {
    const adminDoc = await db.collection(COLLECTIONS.ADMIN_USERS).doc(userId).get();
    
    if (!adminDoc.exists) {
      return null;
    }
    
    return adminDoc.data() as AdminUser;
  } catch (error) {
    console.error(`[Moderation] Error getting admin user ${userId}:`, error);
    return null;
  }
}

/**
 * Initialize admin user
 */
export async function initializeAdminUser(
  userId: string,
  roles: AdminRole[]
): Promise<void> {
  try {
    const adminUser: AdminUser = {
      userId,
      roles,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
    };
    
    await db.collection(COLLECTIONS.ADMIN_USERS).doc(userId).set(adminUser);
    console.log(`[Moderation] Initialized admin user ${userId} with roles:`, roles);
  } catch (error) {
    console.error(`[Moderation] Error initializing admin user ${userId}:`, error);
    throw error;
  }
}

/**
 * Update admin user roles
 */
export async function updateAdminRoles(
  userId: string,
  roles: AdminRole[]
): Promise<void> {
  try {
    await db.collection(COLLECTIONS.ADMIN_USERS).doc(userId).update({
      roles,
      updatedAt: serverTimestamp(),
    });
    console.log(`[Moderation] Updated admin roles for user ${userId}:`, roles);
  } catch (error) {
    console.error(`[Moderation] Error updating admin roles for user ${userId}:`, error);
    throw error;
  }
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Create audit log entry
 */
export async function createAuditLog(
  adminId: string,
  subjectUserId: string,
  actionType: ModerationActionType,
  payload: Record<string, any>,
  caseId?: string
): Promise<void> {
  try {
    const auditLog: ModerationAuditLog = {
      id: generateId(),
      adminId,
      subjectUserId,
      caseId,
      actionType,
      payload,
      createdAt: serverTimestamp() as Timestamp,
    };
    
    await db.collection(COLLECTIONS.MODERATION_AUDIT_LOG).add(auditLog);
    console.log(`[Moderation] Audit logged: ${actionType} by ${adminId} on ${subjectUserId}`);
  } catch (error) {
    console.error('[Moderation] Error creating audit log:', error);
    // Don't throw - audit failure shouldn't block operations
  }
}

/**
 * Get audit logs for a user
 */
export async function getAuditLogsForUser(
  userId: string,
  limit: number = 50
): Promise<ModerationAuditLog[]> {
  try {
    const snapshot = await db
      .collection(COLLECTIONS.MODERATION_AUDIT_LOG)
      .where('subjectUserId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as ModerationAuditLog[];
  } catch (error) {
    console.error(`[Moderation] Error getting audit logs for user ${userId}:`, error);
    return [];
  }
}

/**
 * Get audit logs for a case
 */
export async function getAuditLogsForCase(
  caseId: string,
  limit: number = 50
): Promise<ModerationAuditLog[]> {
  try {
    const snapshot = await db
      .collection(COLLECTIONS.MODERATION_AUDIT_LOG)
      .where('caseId', '==', caseId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as ModerationAuditLog[];
  } catch (error) {
    console.error(`[Moderation] Error getting audit logs for case ${caseId}:`, error);
    return [];
  }
}

// ============================================================================
// CASE STATUS TRANSITIONS
// ============================================================================

/**
 * Valid case status transitions
 */
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['IN_PROGRESS', 'DISMISSED'],
  IN_PROGRESS: ['RESOLVED', 'DISMISSED', 'OPEN'],
  RESOLVED: [],
  DISMISSED: [],
};

/**
 * Check if a status transition is valid
 */
export function isValidStatusTransition(
  currentStatus: string,
  newStatus: string
): boolean {
  const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus];
  return allowedTransitions ? allowedTransitions.includes(newStatus) : false;
}

// ============================================================================
// PRIORITY DETERMINATION
// ============================================================================

/**
 * Determine case priority based on type and context
 */
export function determineCasePriority(
  type: string,
  context?: Record<string, any>
): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  // Default priorities by type
  const defaultPriorities: Record<string, 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> = {
    KYC: 'MEDIUM',
    PAYOUT: 'MEDIUM',
    DISPUTE: 'HIGH',
    TRUST_REVIEW: 'HIGH',
    ENFORCEMENT: 'CRITICAL',
  };
  
  let priority = defaultPriorities[type] || 'MEDIUM';
  
  // Adjust based on context
  if (context) {
    // High risk score = higher priority
    if (context.riskScore && context.riskScore > 70) {
      priority = 'CRITICAL';
    } else if (context.riskScore && context.riskScore > 50) {
      priority = 'HIGH';
    }
    
    // Certain flags = higher priority
    if (context.flags && Array.isArray(context.flags)) {
      const criticalFlags = ['POTENTIAL_SCAMMER', 'PAYMENT_FRAUD_RISK', 'CSAM_RISK'];
      if (context.flags.some((flag: string) => criticalFlags.includes(flag))) {
        priority = 'CRITICAL';
      }
    }
    
    // Dispute reason codes
    if (context.reasonCode) {
      const highPriorityReasons = ['SCAM', 'FRAUD', 'HARASSMENT', 'SAFETY_CONCERN'];
      if (highPriorityReasons.includes(context.reasonCode)) {
        priority = 'HIGH';
      }
    }
    
    // Large payout amounts
    if (context.payoutAmount && context.payoutAmount > 1000) {
      priority = priority === 'MEDIUM' ? 'HIGH' : priority;
    }
  }
  
  return priority;
}

// ============================================================================
// COLLECTION NAME EXPORTS
// ============================================================================

export { COLLECTIONS };