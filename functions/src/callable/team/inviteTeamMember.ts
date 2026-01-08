/**
 * PACK 123 - Team Accounts: Invite Team Member
 * 
 * Allows account owner to invite new team members
 * Security: Owner-only, 2FA required, logged, compliance-checked
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { TeamMembership, TeamRole, ROLE_PERMISSIONS } from '../../types/team';
import { logTeamActivity } from './utils/activityLogger';
import { verifyTwoFactor } from './utils/twoFactorVerification';
import { generateInviteToken } from './utils/tokenGenerator';
import { checkComplianceStatus } from './utils/complianceCheck';

interface InviteTeamMemberRequest {
  memberEmail: string;
  role: TeamRole;
  permissions?: string[];
  dmAccessGranted?: boolean;
}

interface InviteTeamMemberResponse {
  success: boolean;
  membershipId?: string;
  inviteToken?: string;
  error?: string;
}

export const inviteTeamMember = functions.https.onCall(
  async (
    data: InviteTeamMemberRequest,
    context: functions.https.CallableContext
  ): Promise<InviteTeamMemberResponse> => {
    const db = admin.firestore();
    const auth = admin.auth();

    try {
      // Authentication check
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const { memberEmail, role, permissions, dmAccessGranted = false } = data;

      // Validate role
      if (!['manager', 'editor', 'analyst', 'support_agent'].includes(role)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Invalid role. Only owner can be the account owner.'
        );
      }

      // Verify 2FA for owner
      await verifyTwoFactor(userId);

      // Check compliance status - owner must not be banned/suspended
      const complianceStatus = await checkComplianceStatus(userId);
      if (!complianceStatus.canManageTeam) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Account compliance status prevents team management'
        );
      }

      // Get or create member user by email
      let memberUser;
      try {
        memberUser = await auth.getUserByEmail(memberEmail);
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          throw new functions.https.HttpsError(
            'not-found',
            'User with this email does not exist on Avalo'
          );
        }
        throw error;
      }

      const memberUserId = memberUser.uid;

      // Check if member is already part of this team
      const existingMembership = await db
        .collection('team_memberships')
        .where('ownerUserId', '==', userId)
        .where('memberUserId', '==', memberUserId)
        .where('status', 'in', ['invited', 'active'])
        .get();

      if (!existingMembership.empty) {
        throw new functions.https.HttpsError(
          'already-exists',
          'This user is already a team member or has a pending invite'
        );
      }

      // Check team size limit (max 20 members per team)
      const teamCount = await db
        .collection('team_memberships')
        .where('ownerUserId', '==', userId)
        .where('status', 'in', ['invited', 'active'])
        .count()
        .get();

      if (teamCount.data().count >= 20) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          'Maximum team size (20 members) reached'
        );
      }

      // Generate invite
      const membershipId = db.collection('team_memberships').doc().id;
      const inviteToken = generateInviteToken();
      const now = admin.firestore.Timestamp.now();
      const expiresAt = admin.firestore.Timestamp.fromMillis(
        Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
      );

      const membership: TeamMembership = {
        membershipId,
        ownerUserId: userId,
        memberUserId,
        role,
        invitedAt: now,
        permissions: permissions || ROLE_PERMISSIONS[role],
        dmAccessGranted,
        twoFactorEnabled: false,
        deviceFingerprints: [],
        inviteToken,
        inviteExpiresAt: expiresAt,
        status: 'invited',
        metadata: {
          inviterUserId: userId,
          createdAt: now,
          updatedAt: now,
        },
      };

      // Save membership
      await db
        .collection('team_memberships')
        .doc(membershipId)
        .set(membership);

      // Log activity
      await logTeamActivity({
        userId,
        memberUserId: userId,
        action: 'invite_member',
        target: memberUserId,
        metadata: {
          targetMemberUserId: memberUserId,
          roleChanged: { from: 'none', to: role },
          permissionsGranted: membership.permissions,
        },
        success: true,
      });

      // Send invitation email (integration with notification system)
      await db.collection('notification_queue').add({
        type: 'team_invitation',
        recipientUserId: memberUserId,
        data: {
          ownerUserId: userId,
          membershipId,
          role,
          inviteToken,
          expiresAt,
        },
        createdAt: now,
        status: 'pending',
      });

      return {
        success: true,
        membershipId,
        inviteToken,
      };
    } catch (error: any) {
      // Log failed attempt
      await logTeamActivity({
        userId: context.auth?.uid || 'unknown',
        memberUserId: context.auth?.uid || 'unknown',
        action: 'invite_member',
        target: data.memberEmail,
        metadata: {
          failureReason: error.message,
        },
        success: false,
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      console.error('Error inviting team member:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to invite team member'
      );
    }
  }
);