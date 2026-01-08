/**
 * PACK 123 - Team Accounts: Revoke DM Access
 * 
 * Allows owner to revoke DM access from team members (immediate)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { logTeamActivity } from './utils/activityLogger';
import { verifyTwoFactor } from './utils/twoFactorVerification';

interface RevokeDmAccessRequest {
  membershipId: string;
  reason?: string;
}

interface RevokeDmAccessResponse {
  success: boolean;
  error?: string;
}

export const revokeDmAccess = functions.https.onCall(
  async (
    data: RevokeDmAccessRequest,
    context: functions.https.CallableContext
  ): Promise<RevokeDmAccessResponse> => {
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

      // Verify 2FA for this sensitive operation
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
          'Only the account owner can revoke DM access'
        );
      }

      // Revoke DM access (immediate)
      await membershipDoc.ref.update({
        dmAccessGranted: false,
        'metadata.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
      });

      // Log activity (high-risk action)
      await logTeamActivity({
        userId,
        memberUserId: userId,
        action: 'revoke_dm_access',
        target: membership.memberUserId,
        metadata: {
          targetMemberUserId: membership.memberUserId,
          actionDescription: reason || 'DM access revoked from team member',
        },
        success: true,
      });

      // Notify member
      await db.collection('notification_queue').add({
        type: 'team_dm_access_revoked',
        recipientUserId: membership.memberUserId,
        data: {
          ownerUserId: userId,
          reason: reason || 'Your DM access has been revoked',
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
        action: 'revoke_dm_access',
        target: data.membershipId,
        metadata: {
          failureReason: error.message,
        },
        success: false,
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      console.error('Error revoking DM access:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to revoke DM access'
      );
    }
  }
);