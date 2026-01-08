import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export interface EarningsNotification {
  type: 'large_gift' | 'record_breaking' | 'payout_status' | 'vip_active';
  title: string;
  body: string;
  data: Record<string, string>;
  priority: 'high' | 'normal';
}

// Send notification for large gift received
export const notifyLargeGift = async (
  creatorId: string,
  amount: number,
  payerId: string
): Promise<void> => {
  const userDoc = await db.collection('users').doc(creatorId).get();
  const fcmToken = userDoc.data()?.fcmToken;

  if (!fcmToken) return;

  const notification: EarningsNotification = {
    type: 'large_gift',
    title: '🎁 Large Gift Received!',
    body: `You just received ${amount} tokens! You have a new top supporter!`,
    data: {
      type: 'large_gift',
      amount: amount.toString(),
      payerId,
      navigateTo: '/creator/earnings',
    },
    priority: 'high',
  };

  await sendPushNotification(fcmToken, notification);

  // Store in notification history
  await db.collection('notifications').add({
    userId: creatorId,
    ...notification,
    timestamp: admin.firestore.Timestamp.now(),
    read: false,
  });
};

// Send notification for record-breaking earnings
export const notifyRecordBreaking = async (
  creatorId: string,
  recordType: 'day' | 'week' | 'month',
  amount: number,
  previousRecord: number
): Promise<void> => {
  const userDoc = await db.collection('users').doc(creatorId).get();
  const fcmToken = userDoc.data()?.fcmToken;

  if (!fcmToken) return;

  let emoji = '🎉';
  let title = '';
  let body = '';

  switch (recordType) {
    case 'day':
      emoji = '🎉';
      title = 'New Daily Record!';
      body = `Amazing! ${amount} tokens today - your best day ever! Previous record: ${previousRecord}`;
      break;
    case 'week':
      emoji = '🔥';
      title = 'Weekly Record Smashed!';
      body = `Incredible week! ${amount} tokens - you beat your record of ${previousRecord}!`;
      break;
    case 'month':
      emoji = '🏆';
      title = 'Monthly Milestone Achieved!';
      body = `Phenomenal! ${amount} tokens this month - your best month yet! Previous: ${previousRecord}`;
      break;
  }

  const notification: EarningsNotification = {
    type: 'record_breaking',
    title: `${emoji} ${title}`,
    body,
    data: {
      type: 'record_breaking',
      recordType,
      amount: amount.toString(),
      previousRecord: previousRecord.toString(),
      navigateTo: '/creator/earnings',
    },
    priority: 'high',
  };

  await sendPushNotification(fcmToken, notification);

  // Store in notification history
  await db.collection('notifications').add({
    userId: creatorId,
    ...notification,
    timestamp: admin.firestore.Timestamp.now(),
    read: false,
  });

  // Create celebratory in-app notification
  await db.collection('creators').doc(creatorId).collection('celebrations').add({
    type: recordType,
    amount,
    previousRecord,
    achievedAt: admin.firestore.Timestamp.now(),
    celebrated: false,
  });
};

// Send notification for payout status
export const notifyPayoutStatus = async (
  creatorId: string,
  status: 'initiated' | 'processing' | 'completed' | 'failed',
  amount: number,
  currency: string,
  payoutId: string,
  errorMessage?: string
): Promise<void> => {
  const userDoc = await db.collection('users').doc(creatorId).get();
  const fcmToken = userDoc.data()?.fcmToken;

  if (!fcmToken) return;

  let title = '';
  let body = '';
  let priority: 'high' | 'normal' = 'normal';

  switch (status) {
    case 'initiated':
      title = '💼 Payout Initiated';
      body = `Your ${amount} ${currency} payout request is being processed. ETA: 1-5 business days.`;
      break;
    case 'processing':
      title = '⏳ Payout Processing';
      body = `Your ${amount} ${currency} payout is being transferred to your account.`;
      break;
    case 'completed':
      title = '✅ Payout Completed';
      body = `Success! Your ${amount} ${currency} payout has been sent. Check your account.`;
      priority = 'high';
      break;
    case 'failed':
      title = '❌ Payout Failed';
      body = `Your ${amount} ${currency} payout failed. ${errorMessage || 'Please try again.'}`;
      priority = 'high';
      break;
  }

  const notification: EarningsNotification = {
    type: 'payout_status',
    title,
    body,
    data: {
      type: 'payout_status',
      status,
      amount: amount.toString(),
      currency,
      payoutId,
      navigateTo: '/creator/earnings/payout-center',
    },
    priority,
  };

  await sendPushNotification(fcmToken, notification);

  // Store in notification history
  await db.collection('notifications').add({
    userId: creatorId,
    ...notification,
    timestamp: admin.firestore.Timestamp.now(),
    read: false,
  });
};

// Send notification when VIP supporter comes online
export const notifyVIPActive = async (
  creatorId: string,
  supporterId: string,
  supporterName: string,
  totalSpent: number
): Promise<void> => {
  const userDoc = await db.collection('users').doc(creatorId).get();
  const fcmToken = userDoc.data()?.fcmToken;

  if (!fcmToken) return;

  const notification: EarningsNotification = {
    type: 'vip_active',
    title: '⭐ VIP Supporter Online',
    body: `${supporterName} is now active! They've spent ${totalSpent} tokens with you.`,
    data: {
      type: 'vip_active',
      supporterId,
      supporterName,
      totalSpent: totalSpent.toString(),
      navigateTo: `/chat/${supporterId}`,
    },
    priority: 'high',
  };

  await sendPushNotification(fcmToken, notification);

  // Store in notification history
  await db.collection('notifications').add({
    userId: creatorId,
    ...notification,
    timestamp: admin.firestore.Timestamp.now(),
    read: false,
  });
};

// Send weekly earnings summary
export const sendWeeklySummary = functions.pubsub
  .schedule('0 9 * * 1') // Every Monday at 9 AM
  .onRun(async (context) => {
    const creatorsSnapshot = await db.collection('users')
      .where('role', '==', 'creator')
      .get();

    for (const creatorDoc of creatorsSnapshot.docs) {
      const creatorId = creatorDoc.id;
      const fcmToken = creatorDoc.data().fcmToken;

      if (!fcmToken) continue;

      // Get last week's earnings
      const summaryDoc = await db.collection('creators').doc(creatorId)
        .collection('earningSummary').doc('current').get();

      if (!summaryDoc.exists) continue;

      const summary = summaryDoc.data();
      const weekTokens = summary?.weekTokens || 0;

      if (weekTokens === 0) continue;

      const notification: EarningsNotification = {
        type: 'record_breaking',
        title: '📊 Weekly Earnings Summary',
        body: `Last week you earned ${weekTokens} tokens! Keep up the great work!`,
        data: {
          type: 'weekly_summary',
          amount: weekTokens.toString(),
          navigateTo: '/creator/earnings',
        },
        priority: 'normal',
      };

      await sendPushNotification(fcmToken, notification);
    }

    return null;
  });

// Send milestone approaching notification
export const notifyMilestoneApproaching = async (
  creatorId: string,
  milestoneType: 'day' | 'week' | 'month',
  current: number,
  target: number,
  remaining: number
): Promise<void> => {
  const userDoc = await db.collection('users').doc(creatorId).get();
  const fcmToken = userDoc.data()?.fcmToken;

  if (!fcmToken) return;

  const percentage = ((current / target) * 100).toFixed(0);

  const notification: EarningsNotification = {
    type: 'record_breaking',
    title: '🎯 Almost There!',
    body: `You're ${percentage}% to your best ${milestoneType}! Just ${remaining} tokens to go!`,
    data: {
      type: 'milestone_approaching',
      milestoneType,
      current: current.toString(),
      target: target.toString(),
      remaining: remaining.toString(),
      navigateTo: '/creator/earnings',
    },
    priority: 'normal',
  };

  await sendPushNotification(fcmToken, notification);
};

// Helper function to send push notification
async function sendPushNotification(
  fcmToken: string,
  notification: EarningsNotification
): Promise<void> {
  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data,
      android: {
        priority: notification.priority === 'high' ? 'high' : 'normal',
        notification: {
          channelId: 'earnings',
          sound: 'default',
          priority: notification.priority === 'high' ? 'high' : 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            category: 'EARNINGS',
          },
        },
      },
    });
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}

// Batch send notifications (for admin broadcasts)
export const batchNotifyCreators = functions.https.onCall(async (data, context) => {
  // Only admin can send batch notifications
  if (!context.auth || context.auth.token.admin !== true) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can send batch notifications');
  }

  const { title, body, targetType, targetValue } = data;

  let query = db.collection('users').where('role', '==', 'creator');

  // Apply filters if specified
  if (targetType && targetValue) {
    switch (targetType) {
      case 'highEarners':
        // Target creators with earnings above threshold
        const threshold = parseInt(targetValue);
        const creatorsSnapshot = await query.get();
        
        for (const doc of creatorsSnapshot.docs) {
          const summaryDoc = await db.collection('creators').doc(doc.id)
            .collection('earningSummary').doc('current').get();
          
          const summary = summaryDoc.data();
          if (summary && summary.monthTokens >= threshold) {
            const fcmToken = doc.data().fcmToken;
            if (fcmToken) {
              await sendPushNotification(fcmToken, {
                type: 'large_gift',
                title,
                body,
                data: {
                  type: 'admin_broadcast',
                  navigateTo: '/creator/earnings',
                },
                priority: 'normal',
              });
            }
          }
        }
        break;

      case 'region':
        query = query.where('region', '==', targetValue);
        break;
    }
  }

  const snapshot = await query.get();
  let sent = 0;

  for (const doc of snapshot.docs) {
    const fcmToken = doc.data().fcmToken;
    if (fcmToken) {
      await sendPushNotification(fcmToken, {
        type: 'large_gift',
        title,
        body,
        data: {
          type: 'admin_broadcast',
          navigateTo: '/creator/earnings',
        },
        priority: 'normal',
      });
      sent++;
    }
  }

  return { success: true, sent };
});

// Mark notification as read
export const markNotificationRead = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { notificationId } = data;

  await db.collection('notifications').doc(notificationId).update({
    read: true,
    readAt: admin.firestore.Timestamp.now(),
  });

  return { success: true };
});

// Get unread notifications count
export const getUnreadCount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const snapshot = await db.collection('notifications')
    .where('userId', '==', context.auth.uid)
    .where('read', '==', false)
    .get();

  return { count: snapshot.size };
});