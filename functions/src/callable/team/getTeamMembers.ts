/**
 * PACK 123 - Team Accounts: Get Team Members
 * 
 * Retrieves team member list for an owner
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

interface GetTeamMembersRequest {
  status?: 'active' | 'invited' | 'removed' | 'suspended';
}

interface TeamMemberInfo {
  membershipId: string;
  memberUserId: string;
  memberEmail?: string;
  memberDisplayName?: string;
  role: string;
  status: string;
  permissions: string[];
  dmAccessGranted: boolean;
  twoFactorEnabled: boolean;
  invitedAt: any;
  joinedAt?: any;
  lastActivityAt?: any;
}

interface GetTeamMembersResponse {
  success: boolean;
  members: TeamMemberInfo[];
  error?: string;
}

export const getTeamMembers = functions.https.onCall(
  async (
    data: GetTeamMembersRequest,
    context: functions.https.CallableContext
  ): Promise<GetTeamMembersResponse> => {
    const db = admin.firestore();
    const auth = admin.auth();

    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const { status } = data;

      // Build query
      let query = db
        .collection('team_memberships')
        .where('ownerUserId', '==', userId);

      if (status) {
        query = query.where('status', '==', status);
      } else {
        // By default, only show active and invited
        query = query.where('status', 'in', ['active', 'invited']);
      }

      const snapshot = await query.get();

      // Enrich with user data
      const members: TeamMemberInfo[] = [];

      for (const doc of snapshot.docs) {
        const membership = doc.data();
        
        try {
          const memberUser = await auth.getUser(membership.memberUserId);
          
          members.push({
            membershipId: doc.id,
            memberUserId: membership.memberUserId,
            memberEmail: memberUser.email,
            memberDisplayName: memberUser.displayName || 'Unknown',
            role: membership.role,
            status: membership.status,
            permissions: membership.permissions || [],
            dmAccessGranted: membership.dmAccessGranted || false,
            twoFactorEnabled: membership.twoFactorEnabled || false,
            invitedAt: membership.invitedAt,
            joinedAt: membership.joinedAt,
            lastActivityAt: membership.metadata?.lastActivityAt,
          });
        } catch (error) {
          // If user doesn't exist, include minimal info
          members.push({
            membershipId: doc.id,
            memberUserId: membership.memberUserId,
            memberEmail: 'User not found',
            role: membership.role,
            status: membership.status,
            permissions: membership.permissions || [],
            dmAccessGranted: membership.dmAccessGranted || false,
            twoFactorEnabled: membership.twoFactorEnabled || false,
            invitedAt: membership.invitedAt,
            joinedAt: membership.joinedAt,
          });
        }
      }

      // Sort by status and join date
      members.sort((a, b) => {
        const statusOrder = { active: 0, invited: 1, suspended: 2, removed: 3 };
        const statusDiff = statusOrder[a.status as keyof typeof statusOrder] - 
                          statusOrder[b.status as keyof typeof statusOrder];
        
        if (statusDiff !== 0) return statusDiff;
        
        const aTime = a.joinedAt?.toMillis() || a.invitedAt?.toMillis() || 0;
        const bTime = b.joinedAt?.toMillis() || b.invitedAt?.toMillis() || 0;
        return bTime - aTime;
      });

      return {
        success: true,
        members,
      };
    } catch (error: any) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      console.error('Error getting team members:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to retrieve team members'
      );
    }
  }
);