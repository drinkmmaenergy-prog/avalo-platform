/**
 * PACK 123 - Team Permissions Middleware
 * 
 * Enforces role-based access control for team members
 * Protects sensitive operations from unauthorized access
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { TeamPermission, ROLE_PERMISSIONS } from '../types/team';

export interface TeamContext {
  isOwner: boolean;
  isTeamMember: boolean;
  role?: string;
  permissions: TeamPermission[];
  dmAccessGranted: boolean;
  membershipId?: string;
}

/**
 * Get team context for a user acting on behalf of an owner
 */
export async function getTeamContext(
  actorUserId: string,
  ownerUserId: string
): Promise<TeamContext> {
  const db = admin.firestore();

  // If acting as self, they're the owner
  if (actorUserId === ownerUserId) {
    return {
      isOwner: true,
      isTeamMember: false,
      role: 'owner',
      permissions: ROLE_PERMISSIONS.owner,
      dmAccessGranted: true,
    };
  }

  // Check if actor is a team member
  const membershipSnapshot = await db
    .collection('team_memberships')
    .where('ownerUserId', '==', ownerUserId)
    .where('memberUserId', '==', actorUserId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (membershipSnapshot.empty) {
    return {
      isOwner: false,
      isTeamMember: false,
      permissions: [],
      dmAccessGranted: false,
    };
  }

  const membership = membershipSnapshot.docs[0].data();

  return {
    isOwner: false,
    isTeamMember: true,
    role: membership.role,
    permissions: membership.permissions || [],
    dmAccessGranted: membership.dmAccessGranted || false,
    membershipId: membershipSnapshot.docs[0].id,
  };
}

/**
 * Verify a user has a specific permission
 */
export async function requirePermission(
  actorUserId: string,
  ownerUserId: string,
  requiredPermission: TeamPermission
): Promise<TeamContext> {
  const context = await getTeamContext(actorUserId, ownerUserId);

  if (!context.isOwner && !context.permissions.includes(requiredPermission)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      `Missing required permission: ${requiredPermission}`
    );
  }

  return context;
}

/**
 * Verify multiple permissions (requires ALL)
 */
export async function requireAllPermissions(
  actorUserId: string,
  ownerUserId: string,
  requiredPermissions: TeamPermission[]
): Promise<TeamContext> {
  const context = await getTeamContext(actorUserId, ownerUserId);

  if (!context.isOwner) {
    const missingPermissions = requiredPermissions.filter(
      p => !context.permissions.includes(p)
    );

    if (missingPermissions.length > 0) {
      throw new functions.https.HttpsError(
        'permission-denied',
        `Missing required permissions: ${missingPermissions.join(', ')}`
      );
    }
  }

  return context;
}

/**
 * Verify at least one permission (requires ANY)
 */
export async function requireAnyPermission(
  actorUserId: string,
  ownerUserId: string,
  requiredPermissions: TeamPermission[]
): Promise<TeamContext> {
  const context = await getTeamContext(actorUserId, ownerUserId);

  if (context.isOwner) {
    return context;
  }

  const hasAnyPermission = requiredPermissions.some(
    p => context.permissions.includes(p)
  );

  if (!hasAnyPermission) {
    throw new functions.https.HttpsError(
      'permission-denied',
      `Missing any of required permissions: ${requiredPermissions.join(', ')}`
    );
  }

  return context;
}

/**
 * Check if user can access DMs (requires explicit grant)
 */
export async function requireDmAccess(
  actorUserId: string,
  ownerUserId: string
): Promise<TeamContext> {
  const context = await getTeamContext(actorUserId, ownerUserId);

  if (!context.isOwner && !context.dmAccessGranted) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'DM access not granted for this team member'
    );
  }

  // Verify 2FA for DM access
  if (!context.isOwner) {
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(actorUserId).get();
    const userData = userDoc.data();

    if (!userData?.twoFactorEnabled) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Two-factor authentication required for DM access'
      );
    }
  }

  return context;
}

/**
 * Protect financial operations (owner-only, no exceptions)
 */
export async function requireOwnerOnly(
  actorUserId: string,
  ownerUserId: string
): Promise<void> {
  if (actorUserId !== ownerUserId) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'This operation is restricted to the account owner only'
    );
  }
}

/**
 * Blocked operations that NO team member can perform
 * (Token transfers, payouts, KYC changes, etc.)
 */
export const BLOCKED_TEAM_OPERATIONS = [
  'token_transfer',
  'payout_request',
  'kyc_update',
  'payment_method_change',
  'account_deletion',
  'ownership_transfer',
  'billing_change',
];

export function isBlockedOperation(operation: string): boolean {
  return BLOCKED_TEAM_OPERATIONS.includes(operation);
}

/**
 * Middleware wrapper for callable functions
 */
export function withTeamPermission(
  requiredPermission: TeamPermission,
  handler: (
    data: any,
    context: functions.https.CallableContext,
    teamContext: TeamContext
  ) => Promise<any>
) {
  return async (data: any, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const actorUserId = context.auth.uid;
    const ownerUserId = data.ownerUserId || actorUserId;

    const teamContext = await requirePermission(
      actorUserId,
      ownerUserId,
      requiredPermission
    );

    return handler(data, context, teamContext);
  };
}