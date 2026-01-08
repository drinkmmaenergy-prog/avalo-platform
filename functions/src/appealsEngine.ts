/**
 * Appeals Engine - Phase 30C-3
 * Handles user appeals for account restrictions
 * 
 * Features:
 * - Submit appeals (appeals_submit)
 * - Get appeal status (appeals_getStatus)
 * - Manual review by moderators (future: dashboard integration)
 * 
 * @module appealsEngine
 */

import { db, serverTimestamp } from './init';
import * as functions from 'firebase-functions';

// ============================================================================
// TYPES
// ============================================================================

export type AppealStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEED_MORE_INFO';

export interface AppealData {
  userId: string;
  accountStatusAtSubmission: string;
  statusExpiresAt: number | null;
  statusReason: string | null;
  violationCount: number;
  messageFromUser: string;
  status: AppealStatus;
  moderatorNote: string | null;
  createdAt: any;
  updatedAt: any;
  platform: 'mobile' | 'web';
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Submit an appeal
 * Callable function for users to submit appeals
 */
export const appeals_submit = async (
  data: any,
  context: functions.https.CallableContext
): Promise<{ success: boolean; appealId?: string; error?: string }> => {
  
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { messageFromUser } = data;

  // Validate input
  if (!messageFromUser || typeof messageFromUser !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Appeal message is required');
  }

  if (messageFromUser.trim().length < 100) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Appeal message must be at least 100 characters'
    );
  }

  if (messageFromUser.trim().length > 2000) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Appeal message must not exceed 2000 characters'
    );
  }

  try {
    // Check if user already has a pending appeal
    const existingAppealsSnapshot = await db
      .collection('appeals')
      .where('userId', '==', userId)
      .where('status', 'in', ['PENDING', 'NEED_MORE_INFO'])
      .get();

    if (!existingAppealsSnapshot.empty) {
      return {
        success: false,
        error: 'You already have a pending appeal',
      };
    }

    // Get user's current status
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userSnap.data();
    const accountStatus = userData?.accountStatus || 'ACTIVE';
    const statusExpiresAt = userData?.statusExpiresAt || null;
    const statusReason = userData?.accountStatusReason || null;

    // Don't allow appeals for ACTIVE accounts
    if (accountStatus === 'ACTIVE') {
      return {
        success: false,
        error: 'No appeal needed for active accounts',
      };
    }

    // Get violation count
    const statsRef = db.collection('userModerationStats').doc(userId);
    const statsSnap = await statsRef.get();
    const violationCount = statsSnap.exists ? (statsSnap.data()?.totalIncidents || 0) : 0;

    // Create appeal
    const appealRef = await db.collection('appeals').add({
      userId,
      accountStatusAtSubmission: accountStatus,
      statusExpiresAt,
      statusReason,
      violationCount,
      messageFromUser: messageFromUser.trim(),
      status: 'PENDING',
      moderatorNote: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      platform: data.platform || 'mobile',
    });

    console.log(`Appeal created: ${appealRef.id} for user ${userId}`);

    return {
      success: true,
      appealId: appealRef.id,
    };
  } catch (error: any) {
    console.error('Error submitting appeal:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
};

/**
 * Get appeal status for current user
 * Returns the most recent appeal and its status
 */
export const appeals_getStatus = async (
  data: any,
  context: functions.https.CallableContext
): Promise<{ 
  success: boolean; 
  appeal?: any; 
  hasAppeal: boolean;
  error?: string;
}> => {
  
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    // Get most recent appeal
    const appealsSnapshot = await db
      .collection('appeals')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (appealsSnapshot.empty) {
      return {
        success: true,
        hasAppeal: false,
      };
    }

    const appealDoc = appealsSnapshot.docs[0];
    const appealData = appealDoc.data();

    return {
      success: true,
      hasAppeal: true,
      appeal: {
        id: appealDoc.id,
        status: appealData.status,
        messageFromUser: appealData.messageFromUser,
        moderatorNote: appealData.moderatorNote,
        accountStatusAtSubmission: appealData.accountStatusAtSubmission,
        createdAt: appealData.createdAt,
        updatedAt: appealData.updatedAt,
      },
    };
  } catch (error: any) {
    console.error('Error getting appeal status:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
};

/**
 * Update appeal status (admin/moderator only)
 * This would be called from moderator dashboard
 * For now, it's prepared for future use
 */
export const appeals_updateStatus = async (
  data: any,
  context: functions.https.CallableContext
): Promise<{ success: boolean; error?: string }> => {
  
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // TODO: Check if user is admin/moderator
  // For now, allow any authenticated user (to be restricted later)
  
  const { appealId, status, moderatorNote } = data;

  if (!appealId || !status) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Appeal ID and status are required'
    );
  }

  const validStatuses: AppealStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'NEED_MORE_INFO'];
  if (!validStatuses.includes(status)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid appeal status');
  }

  try {
    const appealRef = db.collection('appeals').doc(appealId);
    const appealSnap = await appealRef.get();

    if (!appealSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Appeal not found');
    }

    await appealRef.update({
      status,
      moderatorNote: moderatorNote || null,
      updatedAt: serverTimestamp(),
      reviewedBy: context.auth.uid,
    });

    // If appeal is approved, update user's account status
    if (status === 'APPROVED') {
      const appealData = appealSnap.data();
      const userId = appealData?.userId;
      
      if (userId) {
        const userRef = db.collection('users').doc(userId);
        await userRef.update({
          accountStatus: 'ACTIVE',
          statusExpiresAt: null,
          accountStatusReason: 'Appeal approved',
          accountStatusUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        
        console.log(`Appeal ${appealId} approved. User ${userId} status set to ACTIVE`);
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error updating appeal status:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  appeals_submit,
  appeals_getStatus,
  appeals_updateStatus,
};