/**
 * PACK 427 - Message Delivery Workers
 * 
 * Background workers and Cloud Functions for processing the message queue
 * Handles scheduled processing, delivery attempts, and region-aware routing
 */

import * as functions from 'firebase-functions';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  QueuedMessage,
  Region,
  QUEUE_CONSTANTS,
  DeliveryResult,
} from './pack427-messaging-types';
import {
  markMessageDelivered,
  markMessageFailed,
  calculateBackoffDelay,
  getQueueStats,
  cleanupOldMessages,
} from './pack427-message-queue-service';
import { sendPushNotification } from './pack293-notification-service'; // PACK 293
import { checkFraudLimits } from './pack302-fraud-detection'; // PACK 302
import { routeRegion } from './pack426-region-router'; // PACK 426

const db = getFirestore();

/**
 * Process message queue - scheduled function
 * 
 * Runs every minute to process pending messages
 * Handles delivery, retries, and exponential backoff
 */
export const pack427_processMessageQueue = functions
  .runWith({
    timeoutSeconds: 540,
    memory: '1GB',
  })
  .pubsub.schedule('every 1 minutes')
  .onRun(async (context) => {
    const regions: Region[] = ['EU', 'US', 'APAC'];
    const results: Record<Region, DeliveryResult[]> = {
      EU: [],
      US: [],
      APAC: [],
    };

    // Process each region in parallel
    await Promise.all(
      regions.map(async (region) => {
        const regionResults = await processRegionQueue(region);
        results[region] = regionResults;
      })
    );

    // Log summary
    const summary = {
      timestamp: new Date().toISOString(),
      regions: Object.entries(results).map(([region, messages]) => ({
        region,
        processed: messages.length,
        succeeded: messages.filter(m => m.success).length,
        failed: messages.filter(m => !m.success).length,
      })),
    };

    console.log('Queue processing complete:', summary);
    return summary;
  });

/**
 * Process queue for a specific region
 * 
 * @param region Region to process
 * @returns Array of delivery results
 */
async function processRegionQueue(region: Region): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];

  try {
    // Fetch batch of pending messages
    const pendingMessages = await fetchPendingMessages(region);

    console.log(`Processing ${pendingMessages.length} messages in ${region}`);

    // Process each message
    for (const message of pendingMessages) {
      try {
        const result = await processMessage(message, region);
        results.push(result);
      } catch (error) {
        console.error(`Error processing message ${message.id}:`, error);
        results.push({
          success: false,
          messageId: message.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          attempts: message.attempts,
        });
      }
    }
  } catch (error) {
    console.error(`Error processing region ${region}:`, error);
  }

  return results;
}

/**
 * Fetch pending messages from queue
 * 
 * @param region Region to fetch from
 * @returns Array of pending messages ready for delivery
 */
async function fetchPendingMessages(region: Region): Promise<QueuedMessage[]> {
  const now = Timestamp.now();

  // Fetch PENDING messages
  const pendingSnapshot = await db
    .collection('regions')
    .doc(region)
    .collection('messageQueue')
    .where('status', '==', 'PENDING')
    .orderBy('createdAt', 'asc')
    .limit(QUEUE_CONSTANTS.BATCH_SIZE)
    .get();

  // Also fetch FAILED messages that are due for retry
  const failedSnapshot = await db
    .collection('regions')
    .doc(region)
    .collection('messageQueue')
    .where('status', '==', 'FAILED')
    .orderBy('updatedAt', 'asc')
    .limit(QUEUE_CONSTANTS.BATCH_SIZE)
    .get();

  const messages: QueuedMessage[] = [];

  // Add pending messages
  pendingSnapshot.docs.forEach(doc => {
    messages.push(doc.data() as QueuedMessage);
  });

  // Add failed messages that are ready for retry (after backoff period)
  failedSnapshot.docs.forEach(doc => {
    const message = doc.data() as QueuedMessage;
    const backoffDelay = calculateBackoffDelay(message.attempts);
    const retryTime = message.updatedAt.toMillis() + backoffDelay;

    if (now.toMillis() >= retryTime) {
      messages.push(message);
    }
  });

  return messages;
}

/**
 * Process a single message
 * 
 * @param message Queued message to process
 * @param region Current region
 * @returns Delivery result
 */
async function processMessage(
  message: QueuedMessage,
  region: Region
): Promise<DeliveryResult> {
  // Step 1: Check if region routing has changed (PACK 426 integration)
  const recipientCountry = await getUserCountry(message.recipientId);
  const targetRegion = routeRegion ? routeRegion(recipientCountry) : region;

  if (targetRegion !== region) {
    // Move message to correct region
    await moveMessageToRegion(message, region, targetRegion);
    return {
      success: true,
      messageId: message.id,
      attempts: message.attempts,
    };
  }

  // Step 2: Check fraud limits (PACK 302 integration)
  try {
    const fraudCheck = await checkFraudLimits(message.senderId, {
      action: 'DELIVER_MESSAGE',
      recipientId: message.recipientId,
      timestamp: new Date(),
    });

    if (fraudCheck.blocked) {
      await markMessageFailed(message.id, region, 'RATE_LIMITED');
      return {
        success: false,
        messageId: message.id,
        error: 'Rate limited',
        attempts: message.attempts,
      };
    }
  } catch (error) {
    console.warn('Fraud check failed, continuing with delivery:', error);
  }

  // Step 3: Check if recipient is online
  const isOnline = await checkRecipientOnline(message.recipientId);

  if (isOnline) {
    // Attempt real-time delivery via presence channel
    const delivered = await deliverRealTime(message);
    if (delivered) {
      await markMessageDelivered(message.id, region);
      return {
        success: true,
        messageId: message.id,
        attempts: message.attempts,
      };
    }
  }

  // Step 4: Fallback to push notification if offline
  try {
    await deliverViaPushNotification(message);
    await markMessageDelivered(message.id, region);
    return {
      success: true,
      messageId: message.id,
      attempts: message.attempts,
    };
  } catch (error) {
    // Mark as failed for retry
    await markMessageFailed(
      message.id,
      region,
      error instanceof Error ? error.message : 'Delivery failed'
    );
    return {
      success: false,
      messageId: message.id,
      error: error instanceof Error ? error.message : 'Delivery failed',
      attempts: message.attempts + 1,
    };
  }
}

/**
 * Get user's country for region routing
 * 
 * @param userId User ID
 * @returns Country code
 */
async function getUserCountry(userId: string): Promise<string> {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  return userData?.country || 'US'; // Default to US
}

/**
 * Move message to different region
 * 
 * @param message Message to move
 * @param fromRegion Source region
 * @param toRegion Target region
 */
async function moveMessageToRegion(
  message: QueuedMessage,
  fromRegion: Region,
  toRegion: Region
): Promise<void> {
  const batch = db.batch();

  // Delete from source region
  const sourceRef = db
    .collection('regions')
    .doc(fromRegion)
    .collection('messageQueue')
    .doc(message.id);
  batch.delete(sourceRef);

  // Add to target region
  const targetRef = db
    .collection('regions')
    .doc(toRegion)
    .collection('messageQueue')
    .doc(message.id);
  batch.set(targetRef, {
    ...message,
    region: toRegion,
    updatedAt: Timestamp.now(),
  });

  await batch.commit();
}

/**
 * Check if recipient is currently online
 * 
 * Integrates with presence system (PACK 135)
 * 
 * @param userId User ID to check
 * @returns true if user is online
 */
async function checkRecipientOnline(userId: string): Promise<boolean> {
  try {
    const presenceDoc = await db.collection('presence').doc(userId).get();
    if (!presenceDoc.exists) {
      return false;
    }

    const presence = presenceDoc.data();
    const lastSeen = presence?.lastSeen?.toMillis() || 0;
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    return lastSeen > fiveMinutesAgo;
  } catch (error) {
    console.warn('Error checking presence:', error);
    return false;
  }
}

/**
 * Deliver message in real-time
 * 
 * Uses Firestore real-time listeners or similar mechanism
 * 
 * @param message Message to deliver
 * @returns true if delivered successfully
 */
async function deliverRealTime(message: QueuedMessage): Promise<boolean> {
  try {
    // Write to user's inbox collection which client subscribes to
    await db
      .collection('users')
      .doc(message.recipientId)
      .collection('inbox')
      .doc(message.id)
      .set({
        messageId: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        contentRef: message.contentRef,
        timestamp: Timestamp.now(),
        read: false,
      });

    return true;
  } catch (error) {
    console.error('Real-time delivery failed:', error);
    return false;
  }
}

/**
 * Deliver message via push notification
 * 
 * Integrates with PACK 293 notification service
 * 
 * @param message Message to deliver
 */
async function deliverViaPushNotification(message: QueuedMessage): Promise<void> {
  // Determine notification type
  const isPaidMessage = await checkIfPaidMessage(message.contentRef);
  const notificationType = isPaidMessage ? 'NEW_PAID_CHAT_MESSAGE' : 'NEW_MESSAGE';

  // Get sender info for notification content
  const senderDoc = await db.collection('users').doc(message.senderId).get();
  const senderName = senderDoc.data()?.displayName || 'Someone';

  // Check if this is a system nudge (PACK 301/301B)
  const isSystemNudge = message.transportMetadata?.systemNudge === true;

  try {
    await sendPushNotification({
      userId: message.recipientId,
      type: notificationType,
      title: isSystemNudge ? 'Come back to Avalo!' : `New message from ${senderName}`,
      body: isSystemNudge
        ? 'You have unread messages waiting'
        : 'You have a new message',
      data: {
        chatId: message.chatId,
        messageId: message.id,
        senderId: message.senderId,
      },
      // Throttle per PACK 293 rules
      throttleKey: `chat_${message.chatId}`,
    });
  } catch (error) {
    console.error('Push notification failed:', error);
    throw error;
  }
}

/**
 * Check if message is a paid message
 * 
 * @param contentRef Reference to message content
 * @returns true if paid message
 */
async function checkIfPaidMessage(contentRef: string): Promise<boolean> {
  try {
    const messageDoc = await db.doc(contentRef).get();
    const messageData = messageDoc.data();
    return messageData?.isPaid === true || messageData?.tokenCost > 0;
  } catch (error) {
    console.warn('Error checking paid message:', error);
    return false;
  }
}

/**
 * Cleanup old messages - scheduled function
 * 
 * Runs daily to remove old delivered messages
 */
export const pack427_cleanupMessages = functions
  .runWith({
    timeoutSeconds: 540,
    memory: '512MB',
  })
  .pubsub.schedule('every 24 hours')
  .onRun(async (context) => {
    const regions: Region[] = ['EU', 'US', 'APAC'];
    const results: Record<Region, number> = {
      EU: 0,
      US: 0,
      APAC: 0,
    };

    await Promise.all(
      regions.map(async (region) => {
        const deleted = await cleanupOldMessages(region, 7); // 7 day retention
        results[region] = deleted;
      })
    );

    console.log('Cleanup complete:', results);
    return results;
  });

/**
 * Queue stats export - scheduled function
 * 
 * Exports queue statistics for monitoring
 */
export const pack427_exportQueueStats = functions
  .runWith({
    timeoutSeconds: 60,
    memory: '256MB',
  })
  .pubsub.schedule('every 5 minutes')
  .onRun(async (context) => {
    const regions: Region[] = ['EU', 'US', 'APAC'];
    const stats: Record<Region, any> = {
      EU: {},
      US: {},
      APAC: {},
    };

    await Promise.all(
      regions.map(async (region) => {
        const regionStats = await getQueueStats(region);
        stats[region] = regionStats;
      })
    );

    // Export to monitoring system or log
    console.log('Queue stats:', {
      timestamp: new Date().toISOString(),
      stats,
    });

    return stats;
  });

/**
 * Message creation trigger - onWrite
 * 
 * Triggers immediate processing when new messages are enqueued
 */
export const pack427_onMessageEnqueued = functions
  .runWith({
    timeoutSeconds: 60,
    memory: '256MB',
  })
  .firestore.document('regions/{region}/messageQueue/{messageId}')
  .onCreate(async (snapshot, context) => {
    const message = snapshot.data() as QueuedMessage;
    const region = context.params.region as Region;

    // Process immediately if message is high priority
    if (message.status === 'PENDING') {
      try {
        await processMessage(message, region);
      } catch (error) {
        console.error('Failed to process new message:', error);
      }
    }
  });
