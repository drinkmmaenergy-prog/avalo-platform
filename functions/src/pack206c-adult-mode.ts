/**
 * PACK 206c — Adult Mode Cloud Functions
 * Romantic & Sexual Conversation System — Consent-Based
 *
 * Version: REVISED v2 (OVERWRITE)
 * Date: 2025-12-01
 */

import { onCall } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db, serverTimestamp, increment, admin, generateId } from './init';
import {
  AdultModeSettings,
  AdultModeLog,
  AdultModeReport,
  AdultModeToggleRequest,
  AdultModeToggleResponse,
  AdultModeStatus,
  AdultModeNotification,
  AdultModeReportReason,
  AgeVerificationStatus,
} from './pack206c-types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user is verified 18+
 */
async function isUserVerified18Plus(userId: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return false;
  
  const userData = userDoc.data();
  return userData?.ageVerified === true && userData?.age >= 18;
}

/**
 * Get user's age verification status
 */
async function getUserAgeVerification(userId: string): Promise<AgeVerificationStatus> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    return {
      userId,
      isVerified: false,
      verifiedAge: null,
    };
  }
  
  const userData = userDoc.data();
  return {
    userId,
    isVerified: userData?.ageVerified === true,
    verifiedAge: userData?.age || null,
    verificationMethod: userData?.verificationMethod,
    verifiedAt: userData?.verifiedAt,
  };
}

/**
 * Check if user is a participant in the chat
 */
async function isChatParticipant(chatId: string, userId: string): Promise<boolean> {
  const chatDoc = await db.collection('chats').doc(chatId).get();
  if (!chatDoc.exists) return false;
  
  const chatData = chatDoc.data();
  return chatData?.participants?.includes(userId) || false;
}

/**
 * Get both participant IDs from a chat
 */
async function getChatParticipants(chatId: string): Promise<{ user1Id: string; user2Id: string } | null> {
  const chatDoc = await db.collection('chats').doc(chatId).get();
  if (!chatDoc.exists) return null;
  
  const chatData = chatDoc.data();
  const participants = chatData?.participants || [];
  
  if (participants.length !== 2) return null;
  
  return {
    user1Id: participants[0],
    user2Id: participants[1],
  };
}

/**
 * Get the other user ID in a chat
 */
function getOtherUserId(user1Id: string, user2Id: string, currentUserId: string): string {
  return currentUserId === user1Id ? user2Id : user1Id;
}

/**
 * Log adult mode action to audit trail
 */
async function logAdultModeAction(
  chatId: string,
  userId: string,
  action: 'enabled' | 'disabled',
  bothEnabledAfterAction: boolean,
  context?: { userAgent?: string; ipAddress?: string }
): Promise<void> {
  const log: Omit<AdultModeLog, 'id'> = {
    chatId,
    userId,
    action,
    timestamp: serverTimestamp() as any,
    bothEnabledAfterAction,
    userAgent: context?.userAgent,
    ipAddress: context?.ipAddress,
  };
  
  await db.collection('adult_mode_logs').add(log);
}

/**
 * Send notification to other user about adult mode change
 */
async function sendAdultModeNotification(
  recipientId: string,
  chatId: string,
  action: 'enabled' | 'disabled',
  actingUserName: string
): Promise<void> {
  const message = action === 'enabled'
    ? `${actingUserName} enabled Adult Mode. Enable yours to unlock?`
    : `${actingUserName} disabled Adult Mode. Conversation returned to standard mode.`;
  
  const notification: Omit<AdultModeNotification, 'id'> = {
    recipientId,
    chatId,
    otherUserName: actingUserName,
    action,
    message,
    timestamp: serverTimestamp() as any,
  };
  
  // Create notification document
  await db.collection('notifications').add({
    ...notification,
    type: 'adult_mode_change',
    read: false,
  });
  
  // Send push notification if user has enabled them
  const userDoc = await db.collection('users').doc(recipientId).get();
  const fcmTokens = userDoc.data()?.fcmTokens || [];
  
  if (fcmTokens.length > 0) {
    const payload = {
      notification: {
        title: 'Adult Mode Update',
        body: message,
      },
      data: {
        type: 'adult_mode_change',
        chatId,
        action,
      },
    };
    
    await Promise.all(
      fcmTokens.map((token: string) =>
        admin.messaging().send({ ...payload, token }).catch(console.error)
      )
    );
  }
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Toggle Adult Mode for a user in a chat
 * Requires mutual consent from both users
 */
export const toggleAdultMode = onCall(
  { region: 'europe-west3' },
  async (request): Promise<AdultModeToggleResponse> => {
    // Authentication check
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userId = request.auth.uid;
    const { chatId, enabled } = request.data;
    
    // Validate input
    if (!chatId || typeof enabled !== 'boolean') {
      throw new HttpsError('invalid-argument', 'Invalid request data');
    }
    
    // Check if user is 18+ verified
    const isVerified = await isUserVerified18Plus(userId);
    if (!isVerified) {
      return {
        success: false,
        chatId,
        currentUserEnabled: false,
        otherUserEnabled: false,
        bothEnabled: false,
        message: 'Age verification required before enabling Adult Mode',
        requiresVerification: true,
      };
    }
    
    // Check if user is a participant in the chat
    const isParticipant = await isChatParticipant(chatId, userId);
    if (!isParticipant) {
      throw new HttpsError('permission-denied', 'User is not a participant in this chat');
    }
    
    // Get chat participants
    const participants = await getChatParticipants(chatId);
    if (!participants) {
      throw new HttpsError('not-found', 'Chat not found or invalid');
    }
    
    const { user1Id, user2Id } = participants;
    const isUser1 = userId === user1Id;
    const otherUserId = getOtherUserId(user1Id, user2Id, userId);
    
    // Get or create adult mode settings document
    const settingsRef = db.collection('adult_mode_settings').doc(chatId);
    const settingsDoc = await settingsRef.get();
    
    const now = serverTimestamp() as any;
    
    if (!settingsDoc.exists) {
      // Create new settings document
      const newSettings: Omit<AdultModeSettings, 'id'> = {
        chatId,
        user1Id,
        user1Enabled: isUser1 ? enabled : false,
        user1Timestamp: isUser1 ? now : now,
        user2Id,
        user2Enabled: !isUser1 ? enabled : false,
        user2Timestamp: !isUser1 ? now : now,
        bothEnabled: false, // Can't be true with only one user enabling
        createdAt: now,
        updatedAt: now,
      };
      
      await settingsRef.set(newSettings);
      
      // Log action
      await logAdultModeAction(chatId, userId, enabled ? 'enabled' : 'disabled', false);
      
      // Send notification to other user if enabling
      if (enabled) {
        const actingUser = await db.collection('users').doc(userId).get();
        const actingUserName = actingUser.data()?.displayName || 'Someone';
        await sendAdultModeNotification(otherUserId, chatId, 'enabled', actingUserName);
      }
      
      return {
        success: true,
        chatId,
        currentUserEnabled: enabled,
        otherUserEnabled: false,
        bothEnabled: false,
        message: enabled
          ? 'Adult Mode enabled for you. Waiting for other user to enable.'
          : 'Adult Mode remains disabled.',
      };
    }
    
    // Update existing settings
    const currentSettings = settingsDoc.data() as AdultModeSettings;
    
    const update: any = {
      updatedAt: serverTimestamp(),
    };
    
    if (isUser1) {
      update.user1Enabled = enabled;
      update.user1Timestamp = serverTimestamp();
      update.bothEnabled = enabled && currentSettings.user2Enabled;
    } else {
      update.user2Enabled = enabled;
      update.user2Timestamp = serverTimestamp();
      update.bothEnabled = enabled && currentSettings.user1Enabled;
    }
    
    await settingsRef.update(update);
    
    const otherUserEnabled = isUser1 ? currentSettings.user2Enabled : currentSettings.user1Enabled;
    const bothEnabled = enabled && otherUserEnabled;
    
    // Log action
    await logAdultModeAction(chatId, userId, enabled ? 'enabled' : 'disabled', bothEnabled);
    
    // Send notification to other user
    const actingUser = await db.collection('users').doc(userId).get();
    const actingUserName = actingUser.data()?.displayName || 'Someone';
    await sendAdultModeNotification(
      otherUserId,
      chatId,
      enabled ? 'enabled' : 'disabled',
      actingUserName
    );
    
    // Determine response message
    let message: string;
    if (enabled) {
      if (bothEnabled) {
        message = 'Adult Mode is now active for both users.';
      } else {
        message = 'Adult Mode enabled for you. Waiting for other user to enable.';
      }
    } else {
      message = 'Adult Mode disabled. Conversation returned to standard mode.';
    }
    
    return {
      success: true,
      chatId,
      currentUserEnabled: enabled,
      otherUserEnabled,
      bothEnabled,
      message,
    };
  }
);

/**
 * Get Adult Mode status for a chat
 */
export const getAdultModeStatus = onCall(
  { region: 'europe-west3' },
  async (request): Promise<AdultModeStatus | null> => {
    // Authentication check
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userId = request.auth.uid;
    const { chatId } = request.data;
    
    // Check if user is a participant in the chat
    const isParticipant = await isChatParticipant(chatId, userId);
    if (!isParticipant) {
      throw new HttpsError('permission-denied', 'User is not a participant in this chat');
    }
    
    // Get adult mode settings
    const settingsDoc = await db.collection('adult_mode_settings').doc(chatId).get();
    
    if (!settingsDoc.exists) {
      return null;
    }
    
    const settings = settingsDoc.data() as AdultModeSettings;
    const isUser1 = userId === settings.user1Id;
    
    return {
      chatId: settings.chatId,
      user1Id: settings.user1Id,
      user1Enabled: settings.user1Enabled,
      user2Id: settings.user2Id,
      user2Enabled: settings.user2Enabled,
      bothEnabled: settings.bothEnabled,
      currentUserEnabled: isUser1 ? settings.user1Enabled : settings.user2Enabled,
      otherUserEnabled: isUser1 ? settings.user2Enabled : settings.user1Enabled,
    };
  }
);

/**
 * Report abuse in Adult Mode
 */
export const reportAdultModeAbuse = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean; reportId: string }> => {
    // Authentication check
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const reporterId = request.auth.uid;
    const { chatId, reportedUserId, reason, description } = request.data;
    
    // Validate input
    if (!chatId || !reportedUserId || !reason || !description) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    // Check if reporter is a participant in the chat
    const isParticipant = await isChatParticipant(chatId, reporterId);
    if (!isParticipant) {
      throw new HttpsError('permission-denied', 'User is not a participant in this chat');
    }
    
    // Get adult mode status
    const settingsDoc = await db.collection('adult_mode_settings').doc(chatId).get();
    const adultModeActive = settingsDoc.exists ? (settingsDoc.data() as AdultModeSettings).bothEnabled : false;
    const bothConsented = adultModeActive;
    
    // Create report
    const report: Omit<AdultModeReport, 'id'> = {
      reporterId,
      reportedUserId,
      chatId,
      reason,
      description,
      timestamp: serverTimestamp() as any,
      status: 'pending',
      adultModeWasActive: adultModeActive,
      bothUsersHadConsented: bothConsented,
    };
    
    const reportRef = await db.collection('adult_mode_reports').add(report);
    
    // Notify moderators (implement based on your moderation system)
    await db.collection('moderation_queue').add({
      type: 'adult_mode_violation',
      reportId: reportRef.id,
      chatId,
      reportedUserId,
      reason,
      priority: 'high',
      createdAt: serverTimestamp(),
    });
    
    return {
      success: true,
      reportId: reportRef.id,
    };
  }
);

/**
 * Firestore trigger: When adult mode is disabled by either user, disable for both
 */
export const onAdultModeDisabled = onDocumentUpdated(
  { document: 'adult_mode_settings/{chatId}', region: 'europe-west3' },
  async (event) => {
    const change = event.data;
    if (!change) return;
    const before = change.before.data() as AdultModeSettings;
    const after = change.after.data() as AdultModeSettings;
    
    // If either user disabled, ensure bothEnabled is false
    if ((before.bothEnabled === true) && (after.user1Enabled === false || after.user2Enabled === false)) {
      if (after.bothEnabled !== false) {
        await change.after.ref.update({
          bothEnabled: false,
          updatedAt: serverTimestamp(),
        });
      }
    }
    
    // If both users enabled, ensure bothEnabled is true
    if (after.user1Enabled === true && after.user2Enabled === true) {
      if (after.bothEnabled !== true) {
        await change.after.ref.update({
          bothEnabled: true,
          updatedAt: serverTimestamp(),
        });
      }
    }
  }
);

/**
 * Get user's age verification status
 */
export const getAgeVerificationStatus = onCall(
  { region: 'europe-west3' },
  async (request): Promise<AgeVerificationStatus> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    return await getUserAgeVerification(request.auth.uid);
  }
);