/**
 * PACK 65 — Admin Authentication & Authorization
 * Handles admin user authentication, role-based access control, and permission checks
 */

import * as functions from 'firebase-functions';
import { db } from './init';
import { 
  AdminUser, 
  AdminContext, 
  AdminPermissions, 
  AdminRole 
} from './types/adminTypes';

// ============================================================================
// ROLE-BASED DEFAULT PERMISSIONS
// ============================================================================

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermissions> = {
  SUPERADMIN: {
    canViewUsers: true,
    canEditEnforcement: true,
    canEditAmlStatus: true,
    canResolveDisputes: true,
    canApprovePayouts: true,
    canReviewDeletionRequests: true,
    canManagePromotions: true,
    canManagePolicies: true,
  },
  COMPLIANCE: {
    canViewUsers: true,
    canEditEnforcement: false,
    canEditAmlStatus: true,
    canResolveDisputes: true,
    canApprovePayouts: false,
    canReviewDeletionRequests: true,
    canManagePromotions: false,
    canManagePolicies: false,
  },
  MODERATION: {
    canViewUsers: true,
    canEditEnforcement: true,
    canEditAmlStatus: false,
    canResolveDisputes: true,
    canApprovePayouts: false,
    canReviewDeletionRequests: false,
    canManagePromotions: true,
    canManagePolicies: false,
  },
  SUPPORT: {
    canViewUsers: true,
    canEditEnforcement: false,
    canEditAmlStatus: false,
    canResolveDisputes: true,
    canApprovePayouts: false,
    canReviewDeletionRequests: false,
    canManagePromotions: false,
    canManagePolicies: false,
  },
  FINANCE: {
    canViewUsers: true,
    canEditEnforcement: false,
    canEditAmlStatus: false,
    canResolveDisputes: false,
    canApprovePayouts: true,
    canReviewDeletionRequests: false,
    canManagePromotions: true,
    canManagePolicies: false,
  },
};

// ============================================================================
// COMPUTE EFFECTIVE PERMISSIONS
// ============================================================================

/**
 * Compute effective permissions from roles and overrides
 */
function computeEffectivePermissions(
  roles: AdminRole[],
  permissionOverrides?: Partial<AdminPermissions>
): AdminPermissions {
  // Start with all permissions false
  const permissions: AdminPermissions = {
    canViewUsers: false,
    canEditEnforcement: false,
    canEditAmlStatus: false,
    canResolveDisputes: false,
    canApprovePayouts: false,
    canReviewDeletionRequests: false,
    canManagePromotions: false,
    canManagePolicies: false,
  };

  // Merge permissions from all roles (OR logic - any role grants permission)
  for (const role of roles) {
    const rolePerms = ROLE_PERMISSIONS[role];
    if (rolePerms) {
      Object.keys(permissions).forEach((key) => {
        const permKey = key as keyof AdminPermissions;
        if (rolePerms[permKey]) {
          permissions[permKey] = true;
        }
      });
    }
  }

  // Apply any explicit overrides
  if (permissionOverrides) {
    Object.keys(permissionOverrides).forEach((key) => {
      const permKey = key as keyof AdminPermissions;
      const override = permissionOverrides[permKey];
      if (override !== undefined) {
        permissions[permKey] = override;
      }
    });
  }

  return permissions;
}

// ============================================================================
// ADMIN AUTHENTICATION
// ============================================================================

/**
 * Extract and validate admin authentication from request
 * 
 * This function extracts adminId from the request context.
 * In production, this would verify JWT tokens, session cookies, or other auth mechanisms.
 * For now, it expects adminId to be provided in request headers or body.
 */
export async function requireAdmin(
  request: functions.https.Request,
  requiredPermission?: keyof AdminPermissions
): Promise<AdminContext> {
  // Extract adminId from request
  // In production, this would come from validated JWT/session
  const adminId = 
    request.headers['x-admin-id'] as string ||
    (request.body && request.body.adminId);

  if (!adminId) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Admin authentication required'
    );
  }

  // Load admin user
  const adminDoc = await db.collection('admin_users').doc(adminId).get();

  if (!adminDoc.exists) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Admin user not found'
    );
  }

  const adminUser = adminDoc.data() as AdminUser;

  // Check if admin is active
  if (!adminUser.isActive) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Admin account is inactive'
    );
  }

  // Compute effective permissions
  const permissions = computeEffectivePermissions(
    adminUser.roles,
    adminUser.permissions
  );

  const context: AdminContext = {
    adminId: adminUser.adminId,
    email: adminUser.email,
    roles: adminUser.roles,
    permissions,
  };

  // Check required permission if specified
  if (requiredPermission) {
    if (!permissions[requiredPermission]) {
      throw new functions.https.HttpsError(
        'permission-denied',
        `Missing required permission: ${requiredPermission}`
      );
    }
  }

  return context;
}

/**
 * Extract admin context from onCall request (Cloud Functions v2 style)
 */
export async function requireAdminFromCallRequest(
  auth: functions.https.CallableContext['auth'],
  requiredPermission?: keyof AdminPermissions
): Promise<AdminContext> {
  if (!auth || !auth.uid) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Admin authentication required'
    );
  }

  const adminId = auth.uid;

  // Load admin user
  const adminDoc = await db.collection('admin_users').doc(adminId).get();

  if (!adminDoc.exists) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Admin user not found'
    );
  }

  const adminUser = adminDoc.data() as AdminUser;

  if (!adminUser.isActive) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Admin account is inactive'
    );
  }

  const permissions = computeEffectivePermissions(
    adminUser.roles,
    adminUser.permissions
  );

  const context: AdminContext = {
    adminId: adminUser.adminId,
    email: adminUser.email,
    roles: adminUser.roles,
    permissions,
  };

  if (requiredPermission) {
    if (!permissions[requiredPermission]) {
      throw new functions.https.HttpsError(
        'permission-denied',
        `Missing required permission: ${requiredPermission}`
      );
    }
  }

  return context;
}

// ============================================================================
// ADMIN USER MANAGEMENT (UTILITIES)
// ============================================================================

/**
 * Create or update admin user
 */
export async function createOrUpdateAdminUser(params: {
  adminId: string;
  email: string;
  displayName?: string;
  roles: AdminRole[];
  permissions?: Partial<AdminPermissions>;
  isActive: boolean;
}): Promise<void> {
  const { adminId, email, displayName, roles, permissions, isActive } = params;

  const adminDoc = await db.collection('admin_users').doc(adminId).get();
  const now = new Date();

  if (adminDoc.exists) {
    // Update existing admin
    await db.collection('admin_users').doc(adminId).update({
      email,
      displayName: displayName || null,
      roles,
      permissions: permissions || null,
      isActive,
      updatedAt: now,
    });
  } else {
    // Create new admin
    const newAdmin: AdminUser = {
      adminId,
      email,
      displayName: displayName || null,
      roles,
      permissions,
      isActive,
      createdAt: now as any,
      updatedAt: now as any,
      lastLoginAt: null,
    };

    await db.collection('admin_users').doc(adminId).set(newAdmin);
  }
}

/**
 * Get admin user by ID
 */
export async function getAdminUser(adminId: string): Promise<AdminUser | null> {
  const adminDoc = await db.collection('admin_users').doc(adminId).get();
  
  if (!adminDoc.exists) {
    return null;
  }

  return adminDoc.data() as AdminUser;
}

/**
 * Update admin last login timestamp
 */
export async function updateAdminLastLogin(adminId: string): Promise<void> {
  await db.collection('admin_users').doc(adminId).update({
    lastLoginAt: new Date(),
  });
}