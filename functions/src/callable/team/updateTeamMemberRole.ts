/**
 * PACK 123 - Team Accounts: Update Team Member Role
 * 
 * Allows owner to change team member roles and permissions
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { TeamRole, ROLE_PERMISSIONS } from '../../types/team';
import { logTeamActivity } from './utils/activityLogger';
import { verifyTwoFactor } from './utils/twoFactorVerification';
import { requireTwoFactorForRole } from './utils/twoFactorVerification';

interface UpdateTeamMemberRoleRequest {
  membershipId: string;
  newRole: TeamRole;
  customPermissions?: string[];
}

interface UpdateTeamMemberRoleResponse {
  success: boolean;
  require2FA?: boolean;
  error?: string;
}

export const updateTeamMemberRole = functions.https.onCall(
  async (
    data: UpdateTeamMemberRoleRequest,
    context: functions.https.CallableContext
  ): Promise<UpdateTeamMemberRoleResponse> => {
    const db = admin.firestore();

    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const { membershipId, newRole, customPermissions } = data;

      // Validate inputs
      if (!membershipId || !newRole) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Membership ID and new role are required'
        );
      }

      if (newRole === 'owner') {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Cannot change role to owner'
        );
      }

      // Verify 2FA
      await verifyTwoFactor(userId);

      // Get membership
      const membershipDoc = await db
        .collection('team_memberships')
        .doc(membershipId)
        .get();

      if (!membershipDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Team membership not found'
        );
      }

      const membership = membershipDoc.data();

      // Verify ownership
      if (membership?.ownerUserId !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only the account owner can update team member roles'
        );
      }

      // Only update active members
      if (membership.status !== 'active') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Can only update role for active team members'
        );
      }

      const oldRole = membership.role;
      const memberUserId = membership.memberUserId;

      // Determine permissions (custom or role-based)
      const newPermissions = customPermissions || ROLE_PERMISSIONS[newRole];

      // Check if new role requires 2FA
      const requires2FA = await requireTwoFactorForRole(
        memberUserId,
        newRole,
        newPermissions.includes('post_content'),
        membership.dmAccessGranted
      );

      if (requires2FA) {
        const memberDoc = await db.collection('users').doc(memberUserId).get();
        const memberData = memberDoc.data();

        if (!memberData?.twoFactorEnabled) {
          return {
            success: false,
            require2FA: true,
            error: 'Team member must enable 2FA for this role',
          };
        }
      }

      // Update role
      await membershipDoc.ref.update({
        role: newRole,
        permissions: newPermissions,
        twoFactorEnabled: requires2FA,
        'metadata.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
      });

      // Log activity
      await logTeamActivity({
        userId,
        memberUserId: userId,
        action: 'update_member_role',
        target: memberUserId,
        metadata: {
          targetMemberUserId: memberUserId,
          roleChanged: {
            from: oldRole,
            to: newRole,
          },
          permissionsGranted: newPermissions,
        },
        success: true,
      });

      // Notify member
      await db.collection('notification_queue').add({
        type: 'team_role_updated',
        recipientUserId: memberUserId,
        data: {
          ownerUserId: userId,
          oldRole,
          newRole,
          requires2FA,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'pending',
      });

      return {
        success: true,
      };
    } catch (error: any) {
      // Log failed attempt
      await logTeamActivity({
        userId: context.auth?.uid || 'unknown',
        memberUserId: context.auth?.uid || 'unknown',
        action: 'update_member_role',
        target: data.membershipId,
        metadata: {
          failureReason: error.message,
        },
        success: false,
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      console.error('Error updating team member role:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to update team member role'
      );
    }
  }
);