/**
 * PACK 123 - Team Accounts: Accept Team Invite
 * 
 * Allows invited user to accept team membership
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { logTeamActivity } from './utils/activityLogger';
import { checkMemberEligibility } from './utils/complianceCheck';
import { requireTwoFactorForRole } from './utils/twoFactorVerification';

interface AcceptTeamInviteRequest {
  inviteToken: string;
}

interface AcceptTeamInviteResponse {
  success: boolean;
  membershipId?: string;
  require2FA?: boolean;
  error?: string;
}

export const acceptTeamInvite = functions.https.onCall(
  async (
    data: AcceptTeamInviteRequest,
    context: functions.https.CallableContext
  ): Promise<AcceptTeamInviteResponse> => {
    const db = admin.firestore();

    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const { inviteToken } = data;

      if (!inviteToken) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Invite token is required'
        );
      }

      // Find invitation by token
      const membershipSnapshot = await db
        .collection('team_memberships')
        .where('inviteToken', '==', inviteToken)
        .where('status', '==', 'invited')
        .limit(1)
        .get();

      if (membershipSnapshot.empty) {
        throw new functions.https.HttpsError(
          'not-found',
          'Invalid or expired invitation'
        );
      }

      const membershipDoc = membershipSnapshot.docs[0];
      const membership = membershipDoc.data();

      // Verify this invite is for the current user
      if (membership.memberUserId !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'This invitation is not for your account'
        );
      }

      // Check if invitation has expired
      const now = Date.now();
      const expiresAt = membership.inviteExpiresAt?.toMillis();
      if (expiresAt && now > expiresAt) {
        await membershipDoc.ref.update({
          status: 'removed',
          'metadata.removalReason': 'invitation_expired',
          'metadata.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
        });

        throw new functions.https.HttpsError(
          'deadline-exceeded',
          'This invitation has expired'
        );
      }

      // Check member eligibility
      const eligibility = await checkMemberEligibility(userId);
      if (!eligibility.eligible) {
        throw new functions.https.HttpsError(
          'permission-denied',
          eligibility.reason || 'Not eligible to join teams'
        );
      }

      // Check if 2FA is required for this role
      const requires2FA = await requireTwoFactorForRole(
        userId,
        membership.role,
        ['editor', 'manager'].includes(membership.role),
        membership.dmAccessGranted
      );

      if (requires2FA) {
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();

        if (!userData?.twoFactorEnabled) {
          return {
            success: false,
            require2FA: true,
            error: 'Two-factor authentication must be enabled for this role',
          };
        }
      }

      // Accept invitation
      await membershipDoc.ref.update({
        status: 'active',
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        twoFactorEnabled: requires2FA,
        inviteToken: admin.firestore.FieldValue.delete(),
        inviteExpiresAt: admin.firestore.FieldValue.delete(),
        'metadata.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
      });

      // Log activity
      await logTeamActivity({
        userId: membership.ownerUserId,
        memberUserId: userId,
        action: 'invite_member',
        target: userId,
        metadata: {
          actionDescription: 'Team invitation accepted',
          targetMemberUserId: userId,
        },
        success: true,
      });

      // Notify owner
      await db.collection('notification_queue').add({
        type: 'team_member_joined',
        recipientUserId: membership.ownerUserId,
        data: {
          memberUserId: userId,
          membershipId: membershipDoc.id,
          role: membership.role,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'pending',
      });

      return {
        success: true,
        membershipId: membershipDoc.id,
      };
    } catch (error: any) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      console.error('Error accepting team invite:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to accept team invitation'
      );
    }
  }
);