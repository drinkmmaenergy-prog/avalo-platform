/**
 * PACK 427 - Message Queue Service
 * 
 * Core service for managing message queue operations
 * Pure wrapper around existing chat logic (PACK 268/273)
 * DOES NOT change billing, tokenomics, or business logic
 */

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { ulid } from 'ulid';
import {
  QueuedMessage,
  MessageStatus,
  BillingState,
  Region,
  EnqueueMessageRequest,
  MessageQueueError,
  QUEUE_CONSTANTS,
  DeliveryResult,
} from './pack427-messaging-types';
import { auditLog } from './pack296-audit-service'; // PACK 296 audit logging
import { checkFraudLimits } from './pack302-fraud-detection'; // PACK 302 fraud checks
import { routeRegion } from './pack426-region-router'; // PACK 426 region routing

const db = getFirestore();

/**
 * Enqueue a message for delivery
 * 
 * This is the main entry point for sending messages through the queue
 * Validates user permissions and inserts into regional queue
 * 
 * @param request Message enqueue request
 * @throws Error if validation fails or user is blocked
 */
export async function enqueueMessage(
  request: EnqueueMessageRequest
): Promise<void> {
  const { chatId, senderId, recipientId, messageRefId, region, transportMetadata } = request;

  // Step 1: Validate sender permissions
  await validateSenderPermissions(senderId, recipientId);

  // Step 2: Check fraud limits (PACK 302)
  const fraudCheck = await checkFraudLimits(senderId, {
    action: 'SEND_MESSAGE',
    recipientId,
    timestamp: new Date(),
  });

  if (fraudCheck.blocked) {
    throw new Error(MessageQueueError.RATE_LIMITED);
  }

  // Step 3: Verify message exists in chat collection
  const messageDoc = await db.doc(messageRefId).get();
  if (!messageDoc.exists) {
    throw new Error(MessageQueueError.INVALID_MESSAGE);
  }

  // Step 4: Create queued message
  const messageId = ulid();
  const now = Timestamp.now();

  const queuedMessage: QueuedMessage = {
    id: messageId,
    chatId,
    senderId,
    recipientId,
    region,
    contentRef: messageRefId,
    status: 'PENDING',
    attempts: 0,
    billingState: 'NOT_BILLED', // Billing handled by PACK 273
    transportMetadata: transportMetadata || {},
    createdAt: now,
    updatedAt: now,
  };

  // Step 5: Insert into regional queue
  await db
    .collection('regions')
    .doc(region)
    .collection('messageQueue')
    .doc(messageId)
    .set(queuedMessage);

  // Step 6: Audit log for tracking
  await auditLog({
    action: 'MESSAGE_ENQUEUED',
    userId: senderId,
    resourceId: messageId,
    metadata: {
      chatId,
      recipientId,
      region,
    },
  });
}

/**
 * Mark a message as delivered
 * 
 * Called by delivery workers when message successfully reaches recipient
 * Idempotent - safe to call multiple times
 * 
 * @param messageId Queue message ID
 * @param region Region where message is queued
 */
export async function markMessageDelivered(
  messageId: string,
  region: Region
): Promise<void> {
  const messageRef = db
    .collection('regions')
    .doc(region)
    .collection('messageQueue')
    .doc(messageId);

  const messageDoc = await messageRef.get();
  if (!messageDoc.exists) {
    // Already processed or doesn't exist - idempotent
    return;
  }

  const message = messageDoc.data() as QueuedMessage;

  // Update status to DELIVERED
  await messageRef.update({
    status: 'DELIVERED' as MessageStatus,
    updatedAt: Timestamp.now(),
  });

  // Billing is handled by PACK 273 during message creation
  // This queue layer does NOT handle billing to avoid double-charging

  await auditLog({
    action: 'MESSAGE_DELIVERED',
    userId: message.senderId,
    resourceId: messageId,
    metadata: {
      chatId: message.chatId,
      attempts: message.attempts,
    },
  });
}

/**
 * Mark a message as failed
 * 
 * Increments attempt counter and applies exponential backoff
 * If max attempts exceeded, marks as DROPPED
 * 
 * @param messageId Queue message ID
 * @param region Region where message is queued
 * @param reason Failure reason
 */
export async function markMessageFailed(
  messageId: string,
  region: Region,
  reason: string
): Promise<void> {
  const messageRef = db
    .collection('regions')
    .doc(region)
    .collection('messageQueue')
    .doc(messageId);

  const messageDoc = await messageRef.get();
  if (!messageDoc.exists) {
    return;
  }

  const message = messageDoc.data() as QueuedMessage;
  const newAttempts = message.attempts + 1;

  // Check if max attempts exceeded
  if (newAttempts >= QUEUE_CONSTANTS.MAX_ATTEMPTS) {
    // Mark as DROPPED
    await messageRef.update({
      status: 'DROPPED' as MessageStatus,
      attempts: newAttempts,
      updatedAt: Timestamp.now(),
    });

    await auditLog({
      action: 'MESSAGE_DROPPED',
      userId: message.senderId,
      resourceId: messageId,
      metadata: {
        chatId: message.chatId,
        reason,
        attempts: newAttempts,
      },
    });
  } else {
    // Mark as FAILED with incremented attempts
    await messageRef.update({
      status: 'FAILED' as MessageStatus,
      attempts: newAttempts,
      updatedAt: Timestamp.now(),
    });

    await auditLog({
      action: 'MESSAGE_FAILED',
      userId: message.senderId,
      resourceId: messageId,
      metadata: {
        chatId: message.chatId,
        reason,
        attempts: newAttempts,
      },
    });
  }
}

/**
 * Get pending messages for a user
 * 
 * Used by offline sync to fetch missed messages
 * 
 * @param userId User ID
 * @param region Region to query
 * @param sinceTimestamp Only fetch messages after this time
 * @returns Array of pending messages
 */
export async function getPendingMessagesForUser(
  userId: string,
  region: Region,
  sinceTimestamp: Timestamp
): Promise<QueuedMessage[]> {
  const querySnapshot = await db
    .collection('regions')
    .doc(region)
    .collection('messageQueue')
    .where('recipientId', '==', userId)
    .where('status', '==', 'PENDING')
    .where('createdAt', '>', sinceTimestamp)
    .orderBy('createdAt', 'asc')
    .limit(QUEUE_CONSTANTS.SYNC_BATCH_SIZE)
    .get();

  return querySnapshot.docs.map(doc => doc.data() as QueuedMessage);
}

/**
 * Get all messages for a chat
 * 
 * Used by sync API to fetch historical messages
 * 
 * @param chatId Chat ID
 * @param region Region to query
 * @param sinceTimestamp Only fetch messages after this time
 * @returns Array of messages
 */
export async function getMessagesForChat(
  chatId: string,
  region: Region,
  sinceTimestamp: Timestamp
): Promise<QueuedMessage[]> {
  const querySnapshot = await db
    .collection('regions')
    .doc(region)
    .collection('messageQueue')
    .where('chatId', '==', chatId)
    .where('createdAt', '>', sinceTimestamp)
    .orderBy('createdAt', 'asc')
    .limit(QUEUE_CONSTANTS.SYNC_BATCH_SIZE)
    .get();

  return querySnapshot.docs.map(doc => doc.data() as QueuedMessage);
}

/**
 * Calculate exponential backoff delay
 * 
 * @param attempts Number of attempts made
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(attempts: number): number {
  const delay = QUEUE_CONSTANTS.BASE_DELAY_MS * Math.pow(2, attempts - 1);
  return Math.min(delay, QUEUE_CONSTANTS.MAX_DELAY_MS);
}

/**
 * Validate sender permissions
 * 
 * Checks if sender is allowed to message recipient
 * Integrates with existing safety/blocking logic
 * 
 * @param senderId Sender user ID
 * @param recipientId Recipient user ID
 * @throws Error if sender is not allowed to message recipient
 */
async function validateSenderPermissions(
  senderId: string,
  recipientId: string
): Promise<void> {
  // Check if sender is banned (PACK 302)
  const senderDoc = await db.collection('users').doc(senderId).get();
  if (!senderDoc.exists) {
    throw new Error(MessageQueueError.INVALID_MESSAGE);
  }

  const senderData = senderDoc.data();
  if (senderData?.banned === true) {
    throw new Error(MessageQueueError.USER_BANNED);
  }

  // Check if sender is blocked by recipient
  const blockQuery = await db
    .collection('users')
    .doc(recipientId)
    .collection('blocked')
    .doc(senderId)
    .get();

  if (blockQuery.exists) {
    throw new Error(MessageQueueError.USER_BLOCKED);
  }

  // Check age restrictions (18+)
  if (senderData?.age && senderData.age < 18) {
    throw new Error(MessageQueueError.SAFETY_VIOLATION);
  }

  // Additional safety checks from existing safety systems can be added here
  // This integrates with PACK 159, 173, etc.
}

/**
 * Requeue a message for retry
 * 
 * Used when a message fails but hasn't exceeded max attempts
 * 
 * @param messageId Message ID to requeue
 * @param region Region where message is queued
 */
export async function requeueMessage(
  messageId: string,
  region: Region
): Promise<void> {
  const messageRef = db
    .collection('regions')
    .doc(region)
    .collection('messageQueue')
    .doc(messageId);

  await messageRef.update({
    status: 'PENDING' as MessageStatus,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Get queue statistics for monitoring
 * 
 * @param region Region to get stats for
 * @returns Queue statistics
 */
export async function getQueueStats(region: Region): Promise<{
  pending: number;
  delivered: number;
  failed: number;
  dropped: number;
}> {
  const [pendingSnap, deliveredSnap, failedSnap, droppedSnap] = await Promise.all([
    db.collection('regions').doc(region).collection('messageQueue')
      .where('status', '==', 'PENDING').count().get(),
    db.collection('regions').doc(region).collection('messageQueue')
      .where('status', '==', 'DELIVERED').count().get(),
    db.collection('regions').doc(region).collection('messageQueue')
      .where('status', '==', 'FAILED').count().get(),
    db.collection('regions').doc(region).collection('messageQueue')
      .where('status', '==', 'DROPPED').count().get(),
  ]);

  return {
    pending: pendingSnap.data().count,
    delivered: deliveredSnap.data().count,
    failed: failedSnap.data().count,
    dropped: droppedSnap.data().count,
  };
}

/**
 * Cleanup old delivered messages
 * 
 * Should be run periodically to prevent collection growth
 * Only removes DELIVERED messages older than retention period
 * 
 * @param region Region to cleanup
 * @param retentionDays Number of days to retain delivered messages
 */
export async function cleanupOldMessages(
  region: Region,
  retentionDays: number = 7
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

  const batch = db.batch();
  let deleteCount = 0;

  const oldMessagesSnapshot = await db
    .collection('regions')
    .doc(region)
    .collection('messageQueue')
    .where('status', '==', 'DELIVERED')
    .where('updatedAt', '<', cutoffTimestamp)
    .limit(500) // Process in batches
    .get();

  oldMessagesSnapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
    deleteCount++;
  });

  await batch.commit();

  return deleteCount;
}
