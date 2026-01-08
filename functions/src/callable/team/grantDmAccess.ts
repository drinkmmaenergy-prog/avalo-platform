/**
 * PACK 123 - Team Accounts: Grant DM Access
 * 
 * Allows owner to grant DM access to team members
 * CRITICAL: DM access requires explicit consent and cannot be bulk-exported
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { logTeamActivity } from './utils/activityLogger';
import { verifyTwoFactor } from './utils/twoFactorVerification';

interface GrantDmAccessRequest {
  membershipId: string;
}

interface GrantDmAccessResponse {
  success: boolean;
  require2FA?: boolean;
  error?: string;
}

export const grantDmAccess = functions.https.onCall(
  async (
    data: GrantDmAccessRequest,
    context: functions.https.CallableContext
  ): Promise<GrantDmAccessResponse> => {
    const db = admin.firestore();

    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const { membershipId } = data;

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
          'Only the account owner can grant DM access'
        );
      }

      // Only grant to active members
      if (membership.status !== 'active') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Can only grant DM access to active team members'
        );
      }

      // Check if member has 2FA enabled (required for DM access)
      const memberDoc = await db
        .collection('users')
        .doc(membership.memberUserId)
        .get();
      
      const memberData = memberDoc.data();
      if (!memberData?.twoFactorEnabled) {
        return {
          success: false,
          require2FA: true,
          error: 'Team member must enable 2FA before receiving DM access',
        };
      }

      // Grant DM access
      await membershipDoc.ref.update({
        dmAccessGranted: true,
        twoFactorEnabled: true,
        'metadata.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
      });

      // Log activity (high-risk action)
      await logTeamActivity({
        userId,
        memberUserId: userId,
        action: 'grant_dm_access',
        target: membership.memberUserId,
        metadata: {
          targetMemberUserId: membership.memberUserId,
          actionDescription: 'DM access granted to team member',
        },
        success: true,
      });

      // Notify member
      await db.collection('notification_queue').add({
        type: 'team_dm_access_granted',
        recipientUserId: membership.memberUserId,
        data: {
          ownerUserId: userId,
          message: 'You have been granted access to respond to direct messages',
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'pending',
      });

      // Create security alert for monitoring
      await db.collection('security_alerts').add({
        type: 'dm_access_granted',
        userId,
        memberUserId: membership.memberUserId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        severity: 'medium',
        status: 'logged',
      });

      return {
        success: true,
      };
    } catch (error: any) {
      // Log failed attempt (critical for security)
      await logTeamActivity({
        userId: context.auth?.uid || 'unknown',
        memberUserId: context.auth?.uid || 'unknown',
        action: 'grant_dm_access',
        target: data.membershipId,
        metadata: {
          failureReason: error.message,
        },
        success: false,
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      console.error('Error granting DM access:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to grant DM access'
      );
    }
  }
);