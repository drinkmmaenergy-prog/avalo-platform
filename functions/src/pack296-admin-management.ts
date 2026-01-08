/**
 * PACK 296 — Admin User Management
 * Functions for managing admin users, roles, and permissions
 */

import * as functions from 'firebase-functions';
import { db, generateId, serverTimestamp } from './init';
import { logAdminAction } from './pack296-audit-helpers';
import type { AdminUser, AdminRole } from './types/audit.types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if requesting user is a SUPERADMIN
 */
async function requireSuperAdmin(context: functions.https.CallableContext): Promise<string> {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const adminId = context.auth.uid;
  const adminDoc = await db.collection('adminUsers').doc(adminId).get();

  if (!adminDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Admin account not found');
  }

  const admin = adminDoc.data() as AdminUser;

  if (admin.role !== 'SUPERADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'SUPERADMIN role required');
  }

  if (admin.disabled) {
    throw new functions.https.HttpsError('permission-denied', 'Admin account is disabled');
  }

  return adminId;
}

/**
 * Check if user is an admin with minimum role
 */
async function requireMinimumRole(
  context: functions.https.CallableContext,
  minRole: AdminRole
): Promise<{ adminId: string; role: AdminRole }> {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const adminId = context.auth.uid;
  const adminDoc = await db.collection('adminUsers').doc(adminId).get();

  if (!adminDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Admin account not found');
  }

  const admin = adminDoc.data() as AdminUser;

  if (admin.disabled) {
    throw new functions.https.HttpsError('permission-denied', 'Admin account is disabled');
  }

  const roleHierarchy: Record<AdminRole, number> = {
    VIEWER: 1,
    MODERATOR: 2,
    RISK: 3,
    SUPERADMIN: 4,
  };

  if (roleHierarchy[admin.role] < roleHierarchy[minRole]) {
    throw new functions.https.HttpsError(
      'permission-denied',
      `Minimum role ${minRole} required, you have ${admin.role}`
    );
  }

  return { adminId, role: admin.role };
}

// ============================================================================
// ADMIN USER MANAGEMENT - CALLABLE FUNCTIONS
// ============================================================================

/**
 * Create a new admin user (SUPERADMIN only)
 */
export const admin_createAdmin = functions.https.onCall(
  async (data: { email: string; role: AdminRole; permissions?: any[] }, context) => {
    const superAdminId = await requireSuperAdmin(context);

    try {
      const { email, role, permissions = [] } = data;

      if (!email || !role) {
        throw new functions.https.HttpsError('invalid-argument', 'Email and role are required');
      }

      // Validate role
      const validRoles: AdminRole[] = ['VIEWER', 'MODERATOR', 'RISK', 'SUPERADMIN'];
      if (!validRoles.includes(role)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid admin role');
      }

      // Generate admin ID
      const adminId = generateId();
      const now = serverTimestamp();

      const adminUser: Omit<AdminUser, 'adminId' | 'createdAt'> & { adminId: string; createdAt: any } = {
        adminId,
        email: email.toLowerCase().trim(),
        role,
        permissions,
        createdAt: now,
        createdBy: superAdminId,
        disabled: false,
      };

      await db.collection('adminUsers').doc(adminId).set(adminUser);

      // Log admin creation
      await logAdminAction(superAdminId, 'ADMIN_NOTE_ADDED', {
        resourceType: 'USER',
        resourceId: adminId,
        details: { action: 'admin_created', role, email },
      });

      console.log(`Admin user created: ${adminId} (${email}) with role ${role}`);

      return {
        success: true,
        adminId,
        message: 'Admin user created successfully',
      };
    } catch (error: any) {
      console.error('Error creating admin user:', error);
      throw error;
    }
  }
);

/**
 * Update admin user role or permissions (SUPERADMIN only)
 */
export const admin_updateAdmin = functions.https.onCall(
  async (data: { adminId: string; role?: AdminRole; permissions?: any[]; disabled?: boolean }, context) => {
    const superAdminId = await requireSuperAdmin(context);

    try {
      const { adminId, role, permissions, disabled } = data;

      if (!adminId) {
        throw new functions.https.HttpsError('invalid-argument', 'Admin ID is required');
      }

      // Cannot modify yourself
      if (adminId === superAdminId) {
        throw new functions.https.HttpsError('invalid-argument', 'Cannot modify your own admin account');
      }

      const adminDoc = await db.collection('adminUsers').doc(adminId).get();

      if (!adminDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Admin user not found');
      }

      const updates: any = {};

      if (role !== undefined) {
        const validRoles: AdminRole[] = ['VIEWER', 'MODERATOR', 'RISK', 'SUPERADMIN'];
        if (!validRoles.includes(role)) {
          throw new functions.https.HttpsError('invalid-argument', 'Invalid admin role');
        }
        updates.role = role;
      }

      if (permissions !== undefined) {
        updates.permissions = permissions;
      }

      if (disabled !== undefined) {
        updates.disabled = disabled;
      }

      if (Object.keys(updates).length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'No updates provided');
      }

      await db.collection('adminUsers').doc(adminId).update(updates);

      // Log admin update
      await logAdminAction(superAdminId, 'ADMIN_NOTE_ADDED', {
        resourceType: 'USER',
        resourceId: adminId,
        details: { action: 'admin_updated', updates },
      });

      console.log(`Admin user updated: ${adminId}`);

      return {
        success: true,
        message: 'Admin user updated successfully',
      };
    } catch (error: any) {
      console.error('Error updating admin user:', error);
      throw error;
    }
  }
);

/**
 * Delete admin user (SUPERADMIN only)
 */
export const admin_deleteAdmin = functions.https.onCall(
  async (data: { adminId: string }, context) => {
    const superAdminId = await requireSuperAdmin(context);

    try {
      const { adminId } = data;

      if (!adminId) {
        throw new functions.https.HttpsError('invalid-argument', 'Admin ID is required');
      }

      // Cannot delete yourself
      if (adminId === superAdminId) {
        throw new functions.https.HttpsError('invalid-argument', 'Cannot delete your own admin account');
      }

      const adminDoc = await db.collection('adminUsers').doc(adminId).get();

      if (!adminDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Admin user not found');
      }

      await db.collection('adminUsers').doc(adminId).delete();

      // Log admin deletion
      await logAdminAction(superAdminId, 'ADMIN_NOTE_ADDED', {
        resourceType: 'USER',
        resourceId: adminId,
        details: { action: 'admin_deleted' },
      });

      console.log(`Admin user deleted: ${adminId}`);

      return {
        success: true,
        message: 'Admin user deleted successfully',
      };
    } catch (error: any) {
      console.error('Error deleting admin user:', error);
      throw error;
    }
  }
);

/**
 * List all admin users (SUPERADMIN only)
 */
export const admin_listAdmins = functions.https.onCall(async (data, context) => {
  await requireSuperAdmin(context);

  try {
    const adminsSnapshot = await db.collection('adminUsers').orderBy('createdAt', 'desc').get();

    const admins = adminsSnapshot.docs.map((doc) => {
      const admin = doc.data() as AdminUser;
      return {
        adminId: admin.adminId,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
        createdAt: admin.createdAt.toDate().toISOString(),
        lastLoginAt: admin.lastLoginAt?.toDate().toISOString(),
        disabled: admin.disabled || false,
      };
    });

    return {
      success: true,
      admins,
    };
  } catch (error: any) {
    console.error('Error listing admin users:', error);
    throw new functions.https.HttpsError('internal', 'Failed to list admin users');
  }
});

/**
 * Get current admin profile
 */
export const admin_getProfile = functions.https.onCall(async (data, context) => {
  const { adminId } = await requireMinimumRole(context, 'VIEWER');

  try {
    const adminDoc = await db.collection('adminUsers').doc(adminId).get();

    if (!adminDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Admin profile not found');
    }

    const admin = adminDoc.data() as AdminUser;

    // Update last login time
    await db.collection('adminUsers').doc(adminId).update({
      lastLoginAt: serverTimestamp(),
    });

    return {
      success: true,
      profile: {
        adminId: admin.adminId,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
        createdAt: admin.createdAt.toDate().toISOString(),
        lastLoginAt: admin.lastLoginAt?.toDate().toISOString(),
      },
    };
  } catch (error: any) {
    console.error('Error getting admin profile:', error);
    throw error;
  }
});

// ============================================================================
// ADMIN SESSION TRACKING
// ============================================================================

/**
 * Log admin session start
 */
export async function logAdminSession(
  adminId: string,
  metadata: {
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void> {
  try {
    const sessionId = generateId();
    const now = serverTimestamp();

    await db.collection('adminSessionLogs').doc(sessionId).set({
      sessionId,
      adminId,
      startedAt: now,
      metadata,
      createdAt: now,
    });
  } catch (error) {
    console.error('Error logging admin session:', error);
    // Don't throw - session logging should not break main flow
  }
}