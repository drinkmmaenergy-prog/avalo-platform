/**
 * PACK 123 - Team Accounts: Get Team Activity Log
 * 
 * Retrieves audit log for team member actions (owner-only)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

interface GetTeamActivityRequest {
  memberUserId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

interface ActivityLogEntry {
  id: string;
  memberUserId: string;
  memberEmail?: string;
  action: string;
  target: string;
  metadata: any;
  timestamp: any;
  success: boolean;
  errorMessage?: string;
}

interface GetTeamActivityResponse {
  success: boolean;
  activities: ActivityLogEntry[];
  hasMore: boolean;
  error?: string;
}

export const getTeamActivity = functions.https.onCall(
  async (
    data: GetTeamActivityRequest,
    context: functions.https.CallableContext
  ): Promise<GetTeamActivityResponse> => {
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
      const { memberUserId, action, startDate, endDate, limit = 100 } = data;

      // Verify user is owner (only owners can view activity logs)
      // Check if any team membership exists where this user is the owner
      const ownerCheck = await db
        .collection('team_memberships')
        .where('ownerUserId', '==', userId)
        .limit(1)
        .get();

      if (ownerCheck.empty) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only team owners can view activity logs'
        );
      }

      // Build query
      let query = db
        .collection('team_activity_log')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc');

      if (memberUserId) {
        query = query.where('memberUserId', '==', memberUserId);
      }

      if (action) {
        query = query.where('action', '==', action);
      }

      if (startDate) {
        const startTimestamp = admin.firestore.Timestamp.fromDate(new Date(startDate));
        query = query.where('timestamp', '>=', startTimestamp);
      }

      if (endDate) {
        const endTimestamp = admin.firestore.Timestamp.fromDate(new Date(endDate));
        query = query.where('timestamp', '<=', endTimestamp);
      }

      // Fetch limit + 1 to check if there are more results
      query = query.limit(limit + 1);

      const snapshot = await query.get();
      const hasMore = snapshot.size > limit;

      // Take only the requested limit
      const docs = snapshot.docs.slice(0, limit);

      // Enrich with user emails
      const activities: ActivityLogEntry[] = [];
      const userCache = new Map<string, string>();

      for (const doc of docs) {
        const activity = doc.data();
        
        let memberEmail = userCache.get(activity.memberUserId);
        
        if (!memberEmail) {
          try {
            const memberUser = await auth.getUser(activity.memberUserId);
            memberEmail = memberUser.email || 'Unknown';
            userCache.set(activity.memberUserId, memberEmail);
          } catch (error) {
            memberEmail = 'User not found';
          }
        }

        activities.push({
          id: doc.id,
          memberUserId: activity.memberUserId,
          memberEmail,
          action: activity.action,
          target: activity.target,
          metadata: activity.metadata || {},
          timestamp: activity.timestamp,
          success: activity.success,
          errorMessage: activity.errorMessage,
        });
      }

      return {
        success: true,
        activities,
        hasMore,
      };
    } catch (error: any) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      console.error('Error getting team activity:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to retrieve team activity log'
      );
    }
  }
);