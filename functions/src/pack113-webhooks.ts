/**
 * PACK 113 — Full Ecosystem API Gateway
 * Webhook System
 * 
 * Allows external apps to subscribe to events:
 * - Content published
 * - Content deleted
 * - New follower
 * - Story expired
 */

import { onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, serverTimestamp, generateId } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  WebhookSubscription,
  WebhookDelivery,
  WebhookEventType,
  AccessToken,
} from './pack113-types';
import { validateAccessToken, hasScope } from './pack113-api-gateway';

const crypto = require('crypto');
const fetch = require('node-fetch');

// ============================================================================
// WEBHOOK SUBSCRIPTION MANAGEMENT
// ============================================================================

/**
 * Create webhook subscription
 */
export const subscribeWebhook = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { token, eventType, callbackUrl } = request.data;

    if (!token || !eventType || !callbackUrl) {
      throw new HttpsError('invalid-argument', 'token, eventType, and callbackUrl required');
    }

    // Validate token
    const validation = await validateAccessToken(token);
    if (!validation.valid) {
      throw new HttpsError('unauthenticated', validation.error || 'Invalid token');
    }

    const tokenData = validation.tokenData!;

    // Check required scope
    const requiredScope = eventType === 'CONTENT_PUBLISHED' || eventType === 'CONTENT_DELETED' 
      ? 'WEBHOOK_CONTENT' 
      : 'WEBHOOK_FOLLOWERS';

    if (!hasScope(tokenData, requiredScope)) {
      throw new HttpsError('permission-denied', `Missing required scope: ${requiredScope}`);
    }

    // Validate callback URL
    if (!callbackUrl.startsWith('https://')) {
      throw new HttpsError('invalid-argument', 'Callback URL must use HTTPS');
    }

    // Check if subscription already exists
    const existingSnapshot = await db
      .collection('webhook_subscriptions')
      .where('appId', '==', tokenData.appId)
      .where('userId', '==', tokenData.userId)
      .where('eventType', '==', eventType)
      .where('callbackUrl', '==', callbackUrl)
      .get();

    if (!existingSnapshot.empty) {
      const existing = existingSnapshot.docs[0].data() as WebhookSubscription;
      return { subscriptionId: existing.subscriptionId, status: 'already_exists' };
    }

    // Create subscription
    const subscriptionId = generateId();
    const secret = generateWebhookSecret();

    const subscription: WebhookSubscription = {
      subscriptionId,
      appId: tokenData.appId,
      userId: tokenData.userId,
      eventType: eventType as WebhookEventType,
      callbackUrl,
      secret,
      active: true,
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await db.collection('webhook_subscriptions').doc(subscriptionId).set(subscription);

    logger.info('Webhook subscription created', {
      subscriptionId,
      appId: tokenData.appId,
      userId: tokenData.userId,
      eventType,
    });

    return {
      subscriptionId,
      secret, // Return secret once for signature verification
      status: 'created',
    };
  }
);

/**
 * List webhook subscriptions
 */
export const listWebhookSubscriptions = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { token } = request.data;

    if (!token) {
      throw new HttpsError('invalid-argument', 'token required');
    }

    // Validate token
    const validation = await validateAccessToken(token);
    if (!validation.valid) {
      throw new HttpsError('unauthenticated', validation.error || 'Invalid token');
    }

    const tokenData = validation.tokenData!;

    // Fetch subscriptions
    const subscriptionsSnapshot = await db
      .collection('webhook_subscriptions')
      .where('appId', '==', tokenData.appId)
      .where('userId', '==', tokenData.userId)
      .get();

    const subscriptions = subscriptionsSnapshot.docs.map(doc => {
      const sub = doc.data() as WebhookSubscription;
      return {
        subscriptionId: sub.subscriptionId,
        eventType: sub.eventType,
        callbackUrl: sub.callbackUrl,
        active: sub.active,
        successCount: sub.successCount,
        failureCount: sub.failureCount,
        lastTriggeredAt: sub.lastTriggeredAt,
        createdAt: sub.createdAt,
      };
    });

    return { subscriptions };
  }
);

/**
 * Delete webhook subscription
 */
export const unsubscribeWebhook = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { token, subscriptionId } = request.data;

    if (!token || !subscriptionId) {
      throw new HttpsError('invalid-argument', 'token and subscriptionId required');
    }

    // Validate token
    const validation = await validateAccessToken(token);
    if (!validation.valid) {
      throw new HttpsError('unauthenticated', validation.error || 'Invalid token');
    }

    const tokenData = validation.tokenData!;

    // Verify ownership
    const subDoc = await db.collection('webhook_subscriptions').doc(subscriptionId).get();
    if (!subDoc.exists) {
      throw new HttpsError('not-found', 'Subscription not found');
    }

    const sub = subDoc.data() as WebhookSubscription;
    if (sub.userId !== tokenData.userId || sub.appId !== tokenData.appId) {
      throw new HttpsError('permission-denied', 'Not authorized to delete this subscription');
    }

    await db.collection('webhook_subscriptions').doc(subscriptionId).delete();

    logger.info('Webhook subscription deleted', {
      subscriptionId,
      appId: tokenData.appId,
      userId: tokenData.userId,
    });

    return { deleted: true, subscriptionId };
  }
);

// ============================================================================
// WEBHOOK DELIVERY
// ============================================================================

/**
 * Generate webhook secret for signature verification
 */
function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate webhook signature
 */
function generateWebhookSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Deliver webhook to callback URL
 */
async function deliverWebhook(
  subscription: WebhookSubscription,
  payload: Record<string, any>
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const payloadString = JSON.stringify(payload);
  const signature = generateWebhookSignature(payloadString, subscription.secret);

  try {
    const response = await fetch(subscription.callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Avalo-Signature': signature,
        'X-Avalo-Event': subscription.eventType,
        'User-Agent': 'Avalo-Webhook/1.0',
      },
      body: payloadString,
      timeout: 10000, // 10 second timeout
    });

    if (response.ok) {
      return { success: true, statusCode: response.status };
    } else {
      return {
        success: false,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Network error',
    };
  }
}

/**
 * Create and process webhook delivery
 */
async function createWebhookDelivery(
  subscription: WebhookSubscription,
  eventType: WebhookEventType,
  payload: Record<string, any>
): Promise<void> {
  const deliveryId = generateId();

  const delivery: WebhookDelivery = {
    deliveryId,
    subscriptionId: subscription.subscriptionId,
    appId: subscription.appId,
    eventType,
    payload,
    attemptNumber: 1,
    maxAttempts: 3,
    status: 'PENDING',
    createdAt: Timestamp.now(),
  };

  await db.collection('webhook_deliveries').doc(deliveryId).set(delivery);

  // Attempt delivery
  await attemptWebhookDelivery(deliveryId);
}

/**
 * Attempt webhook delivery
 */
async function attemptWebhookDelivery(deliveryId: string): Promise<void> {
  const deliveryDoc = await db.collection('webhook_deliveries').doc(deliveryId).get();
  if (!deliveryDoc.exists) {
    return;
  }

  const delivery = deliveryDoc.data() as WebhookDelivery;

  // Get subscription
  const subDoc = await db.collection('webhook_subscriptions').doc(delivery.subscriptionId).get();
  if (!subDoc.exists || !subDoc.data()!.active) {
    return; // Subscription deleted or inactive
  }

  const subscription = subDoc.data() as WebhookSubscription;

  // Deliver
  const result = await deliverWebhook(subscription, delivery.payload);

  if (result.success) {
    // Success
    await db.runTransaction(async (transaction) => {
      transaction.update(deliveryDoc.ref, {
        status: 'DELIVERED',
        statusCode: result.statusCode,
        deliveredAt: serverTimestamp(),
      });

      transaction.update(subDoc.ref, {
        successCount: FieldValue.increment(1),
        consecutiveFailures: 0,
        lastTriggeredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    logger.info('Webhook delivered successfully', {
      deliveryId,
      subscriptionId: subscription.subscriptionId,
    });
  } else {
    // Failure
    const newAttemptNumber = delivery.attemptNumber + 1;
    const shouldRetry = newAttemptNumber <= delivery.maxAttempts;

    await db.runTransaction(async (transaction) => {
      const updates: any = {
        attemptNumber: newAttemptNumber,
        statusCode: result.statusCode,
        errorMessage: result.error,
      };

      if (shouldRetry) {
        // Schedule retry with exponential backoff
        const retryDelaySeconds = Math.pow(2, newAttemptNumber - 1) * 60; // 1min, 2min, 4min
        updates.nextRetryAt = Timestamp.fromMillis(Date.now() + retryDelaySeconds * 1000);
      } else {
        updates.status = 'FAILED';
      }

      transaction.update(deliveryDoc.ref, updates);

      const newConsecutiveFailures = subscription.consecutiveFailures + 1;
      transaction.update(subDoc.ref, {
        failureCount: FieldValue.increment(1),
        consecutiveFailures: newConsecutiveFailures,
        lastFailureReason: result.error,
        updatedAt: serverTimestamp(),
      });

      // Auto-disable after 10 consecutive failures
      if (newConsecutiveFailures >= 10) {
        transaction.update(subDoc.ref, {
          active: false,
          disabledAt: serverTimestamp(),
        });
      }
    });

    logger.warn('Webhook delivery failed', {
      deliveryId,
      subscriptionId: subscription.subscriptionId,
      attemptNumber: newAttemptNumber,
      error: result.error,
    });
  }
}

/**
 * Retry failed webhook deliveries
 */
export const retryFailedWebhooks = onSchedule(
  {
    schedule: '*/5 * * * *', // Every 5 minutes
    timeZone: 'UTC',
  },
  async (event) => {
    try {
      const now = Timestamp.now();

      const pendingDeliveries = await db
        .collection('webhook_deliveries')
        .where('status', '==', 'PENDING')
        .where('nextRetryAt', '<=', now)
        .limit(50)
        .get();

      for (const doc of pendingDeliveries.docs) {
        await attemptWebhookDelivery(doc.id);
      }

      logger.info(`Retried ${pendingDeliveries.size} webhook deliveries`);
      return null;
    } catch (error: any) {
      logger.error('Error retrying webhooks', error);
      throw error;
    }
  }
);

// ============================================================================
// WEBHOOK TRIGGERS
// ============================================================================

/**
 * Trigger webhooks for content published
 */
export const onContentPublished = onDocumentCreated(
  {
    document: 'posts/{postId}',
    region: 'europe-west3',
  },
  async (event) => {
    const post = event.data?.data();
    if (!post || !post.postedViaAPI) {
      return null; // Only trigger for API-posted content
    }

    const authorId = post.authorId;
    const appId = post.postedByAppId;

    // Find subscriptions for this user/app
    const subscriptions = await db
      .collection('webhook_subscriptions')
      .where('userId', '==', authorId)
      .where('appId', '==', appId)
      .where('eventType', '==', 'CONTENT_PUBLISHED')
      .where('active', '==', true)
      .get();

    const payload = {
      event: 'content.published',
      userId: authorId,
      contentId: event.params.postId,
      contentType: 'post',
      publishedAt: post.createdAt,
    };

    for (const doc of subscriptions.docs) {
      const subscription = doc.data() as WebhookSubscription;
      await createWebhookDelivery(subscription, 'CONTENT_PUBLISHED', payload);
    }

    return null;
  }
);

/**
 * Trigger webhooks for content deleted
 */
export const onContentDeleted = onDocumentDeleted(
  {
    document: 'posts/{postId}',
    region: 'europe-west3',
  },
  async (event) => {
    const post = event.data?.data();
    if (!post || !post.postedViaAPI) {
      return null;
    }

    const authorId = post.authorId;
    const appId = post.postedByAppId;

    const subscriptions = await db
      .collection('webhook_subscriptions')
      .where('userId', '==', authorId)
      .where('appId', '==', appId)
      .where('eventType', '==', 'CONTENT_DELETED')
      .where('active', '==', true)
      .get();

    const payload = {
      event: 'content.deleted',
      userId: authorId,
      contentId: event.params.postId,
      contentType: 'post',
      deletedAt: Timestamp.now(),
    };

    for (const doc of subscriptions.docs) {
      const subscription = doc.data() as WebhookSubscription;
      await createWebhookDelivery(subscription, 'CONTENT_DELETED', payload);
    }

    return null;
  }
);

/**
 * Trigger webhooks for new follower
 */
export const onNewFollower = onDocumentCreated(
  {
    document: 'followers/{followId}',
    region: 'europe-west3',
  },
  async (event) => {
    const follow = event.data?.data();
    if (!follow) {
      return null;
    }

    const creatorId = follow.followedUserId;

    // Find all active subscriptions for this creator
    const subscriptions = await db
      .collection('webhook_subscriptions')
      .where('userId', '==', creatorId)
      .where('eventType', '==', 'NEW_FOLLOWER')
      .where('active', '==', true)
      .get();

    const payload = {
      event: 'follower.new',
      userId: creatorId,
      followerId: follow.followerUserId,
      followedAt: follow.createdAt,
    };

    for (const doc of subscriptions.docs) {
      const subscription = doc.data() as WebhookSubscription;
      await createWebhookDelivery(subscription, 'NEW_FOLLOWER', payload);
    }

    return null;
  }
);

/**
 * Cleanup old webhook deliveries
 */
export const cleanupOldWebhookDeliveries = onSchedule(
  {
    schedule: '0 3 * * *', // Daily at 3 AM UTC
    timeZone: 'UTC',
  },
  async (event) => {
    try {
      const threshold = Timestamp.fromMillis(Date.now() - 30 * 24 * 3600 * 1000); // 30 days

      const oldDeliveries = await db
        .collection('webhook_deliveries')
        .where('createdAt', '<', threshold)
        .get();

      const batch = db.batch();
      oldDeliveries.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      logger.info(`Cleaned up ${oldDeliveries.size} old webhook deliveries`);
      return null;
    } catch (error: any) {
      logger.error('Error cleaning up webhook deliveries', error);
      throw error;
    }
  }
);