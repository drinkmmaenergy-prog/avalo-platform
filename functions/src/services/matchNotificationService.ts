/**
 * Match Notification Service
 * 
 * Handles push notifications for new matches
 * Listens to match creation events and sends notifications to both users
 */

import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

const db = admin.firestore();

/**
 * Send match notification to user
 */
async function sendMatchNotification(
  userId: string,
  matchedUserId: string,
  matchId: string,
  chatId: string | null
): Promise<void> {
  try {
    // Get matched user's profile
    const matchedUserDoc = await db.collection('users').doc(matchedUserId).get();
    const matchedUser = matchedUserDoc.data();

    if (!matchedUser) {
      console.error(`Matched user not found: ${matchedUserId}`);
      return;
    }

    // Get user's FCM tokens
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const fcmTokens = userData?.fcmTokens || [];

    if (fcmTokens.length === 0) {
      console.log(`No FCM tokens for user ${userId}`);
      return;
    }

    const displayName = matchedUser.displayName || 'Someone';
    const photo = matchedUser.photos?.[0] || null;

    // Prepare notification payload
    const notification: admin.messaging.MulticastMessage = {
      tokens: fcmTokens,
      notification: {
        title: '❤️ You have a new match!',
        body: `You and ${displayName} liked each other`,
        imageUrl: photo || undefined,
      },
      data: {
        type: 'match_created',
        matchId,
        matchedUserId,
        chatId: chatId || '',
        click_action: chatId ? `avalo://chat/${chatId}` : `avalo://profile/${matchedUserId}`,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'matches',
          priority: 'high',
          sound: 'match_sound',
          clickAction: chatId ? `avalo://chat/${chatId}` : `avalo://profile/${matchedUserId}`,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'match_sound.caf',
            badge: 1,
            category: 'MATCH_NOTIFICATION',
          },
        },
      },
    };

    // Send notification
    const response = await admin.messaging().sendMulticast(notification);

    console.log(`Match notification sent to ${userId}: ${response.successCount} success, ${response.failureCount} failures`);

    // Clean up invalid tokens
    if (response.failureCount > 0) {
      const tokensToRemove: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          const errorCode = resp.error.code;
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            tokensToRemove.push(fcmTokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        await db.collection('users').doc(userId).update({
          fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove),
        });
        console.log(`Removed ${tokensToRemove.length} invalid FCM tokens for user ${userId}`);
      }
    }
  } catch (error) {
    console.error(`Error sending match notification to ${userId}:`, error);
  }
}

/**
 * Firestore trigger: Send notifications when match is created
 */
export const onMatchCreated = onDocumentCreated(
  {
    document: 'matches/{matchId}',
    region: 'europe-west3',
  },
  async (event) => {
    const matchData = event.data?.data();

    if (!matchData) {
      console.error('No match data in event');
      return;
    }

    const { userA, userB, matchId, fromSwipe } = matchData;

    // Only send notifications for swipe matches
    if (!fromSwipe) {
      console.log(`Skipping notification for non-swipe match: ${matchId}`);
      return;
    }

    console.log(`Match created: ${userA} ↔ ${userB} (${matchId})`);

    // Get or create chat ID
    const chatId = matchData.chatId || null;

    // Send notifications to both users
    await Promise.all([
      sendMatchNotification(userA, userB, matchId, chatId),
      sendMatchNotification(userB, userA, matchId, chatId),
    ]);

    console.log(`Match notifications sent for ${matchId}`);
  }
);

/**
 * Export for integration tests
 */
export { sendMatchNotification };