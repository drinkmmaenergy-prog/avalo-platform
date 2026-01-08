/**
 * PACK 123 - Team Accounts: Remove Team Member
 * 
 * Allows owner to remove team members (immediate revocation)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { logTeamActivity } from './utils/activityLogger';
import { verifyTwoFactor } from './utils/twoFactorVerification';
import { checkComplianceStatus } from './utils/complianceCheck';

interface RemoveTeamMemberRequest {
  membershipId: string;
  reason?: string;
}

interface RemoveTeamMemberResponse {
  success: boolean;
  error?: string;
}

export const removeTeamMember = functions.https.onCall(
  async (
    data: RemoveTeamMemberRequest,
    context: functions.https.CallableContext
  ): Promise<RemoveTeamMemberResponse> => {
    const db = admin.firestore();

    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const { membershipId, reason } = data;

      if (!membershipId) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Membership ID is required'
        );
      }

      // Verify 2FA
      await verifyTwoFactor(userId);

      // Check compliance
      const compliance = await checkComplianceStatus(userId);
      if (!compliance.canManageTeam) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Account compliance status prevents team management'
        );
      }

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
          'Only the account owner can remove team members'
        );
      }

      // Cannot remove yourself if you're the owner
      if (membership.memberUserId === userId) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Cannot remove yourself as owner'
        );
      }

      // Only remove if currently active or invited
      if (!['active', 'invited'].includes(membership.status)) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Cannot remove member with status: ${membership.status}`
        );
      }

      // Remove member (immediate revocation)
      await membershipDoc.ref.update({
        status: 'removed',
        removedAt: admin.firestore.FieldValue.serverTimestamp(),
        'metadata.removalReason': reason || 'removed_by_owner',
        'metadata.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
      });

      // Revoke all active sessions for this member (if needed)
      // This would integrate with session management if implemented

      // Log activity
      await logTeamActivity({
        userId,
        memberUserId: userId,
        action: 'remove_member',
        target: membership.memberUserId,
        metadata: {
          targetMemberUserId: membership.memberUserId,
          actionDescription: reason || 'Team member removed',
        },
        success: true,
      });

      // Notify removed member
      await db.collection('notification_queue').add({
        type: 'team_membership_removed',
        recipientUserId: membership.memberUserId,
        data: {
          ownerUserId: userId,
          reason: reason || 'You have been removed from the team',
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
        action: 'remove_member',
        target: data.membershipId,
        metadata: {
          failureReason: error.message,
        },
        success: false,
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      console.error('Error removing team member:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to remove team member'
      );
    }
  }
);