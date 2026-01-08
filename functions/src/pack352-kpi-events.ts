/**
 * PACK 352 — KPI Event Logging
 * 
 * Central function for logging all KPI events across the platform.
 * Called from other packs (chat, calls, calendar, events, wallet, retention, support).
 * 
 * This is analytics-only: no changes to business logic.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  KpiEvent,
  KpiEventInput,
  KpiEventType,
  KpiEventContext,
} from '../../shared/types/kpi';

// Initialize Firestore
const db = admin.firestore();

// ============================================================================
// Event Logging Function
// ============================================================================

/**
 * Log a KPI event to Firestore
 * 
 * This function:
 * 1. Validates the event input
 * 2. Writes to kpiEvents collection (append-only log)
 * 3. Triggers incremental updates to daily aggregates (via Pub/Sub or direct call)
 * 
 * @param event - KPI event data
 * @returns Promise with event ID
 */
export async function pack352_logKpiEvent(
  event: KpiEventInput
): Promise<string> {
  try {
    // Validate input
    validateKpiEvent(event);

    // Create event document
    const eventDoc: KpiEvent = {
      eventId: db.collection('kpiEvents').doc().id,
      userId: event.userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp() as any,
      eventType: event.eventType,
      context: sanitizeContext(event.context),
      metadata: event.metadata,
    };

    // Write to kpiEvents collection
    await db.collection('kpiEvents').doc(eventDoc.eventId).set(eventDoc);

    // Publish to Pub/Sub for async processing (daily aggregator will pick this up)
    // This allows the aggregator to run incrementally throughout the day
    try {
      await publishToAggregator(eventDoc);
    } catch (pubsubError) {
      // Log but don't fail the main operation
      console.warn('Failed to publish to aggregator:', pubsubError);
    }

    return eventDoc.eventId;
  } catch (error) {
    console.error('Error logging KPI event:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to log KPI event',
      error
    );
  }
}

/**
 * HTTP callable function for logging KPI events
 * Exposed for server-side calls from other Cloud Functions
 */
export const logKpiEvent = functions.https.onCall(
  async (data: KpiEventInput, context) => {
    // Verify this is a server request (from another Cloud Function)
    // or from an authenticated user with proper permissions
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated to log KPI events'
      );
    }

    return await pack352_logKpiEvent(data);
  }
);

/**
 * Batch logging for multiple events at once
 * Useful for retroactive data import or bulk operations
 */
export const logKpiEventsBatch = functions.https.onCall(
  async (data: { events: KpiEventInput[] }, context) => {
    // Only admins can batch log
    if (!context.auth || context.auth.token.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can batch log events'
      );
    }

    const { events } = data;

    if (!Array.isArray(events) || events.length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'events must be a non-empty array'
      );
    }

    if (events.length > 500) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Maximum 500 events per batch'
      );
    }

    // Process in batches of 500 (Firestore batch limit)
    const batch = db.batch();
    const eventIds: string[] = [];

    for (const event of events) {
      validateKpiEvent(event);

      const eventId = db.collection('kpiEvents').doc().id;
      const eventDoc: KpiEvent = {
        eventId,
        userId: event.userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp() as any,
        eventType: event.eventType,
        context: sanitizeContext(event.context),
        metadata: event.metadata,
      };

      batch.set(db.collection('kpiEvents').doc(eventId), eventDoc);
      eventIds.push(eventId);
    }

    await batch.commit();

    return {
      success: true,
      eventIds,
      count: eventIds.length,
    };
  }
);

// ============================================================================
// Event-Specific Helpers
// ============================================================================

/**
 * Convenience functions for logging specific event types
 * These can be called directly from other packs
 */

export async function logSignupEvent(
  userId: string,
  method: string,
  referralCode?: string,
  country?: string
): Promise<void> {
  await pack352_logKpiEvent({
    userId,
    eventType: KpiEventType.SIGNUP,
    context: {
      method,
      referralCode,
      country,
    },
  });
}

export async function logChatPaidStarted(
  chatId: string,
  userId: string,
  creatorId: string,
  tokensCharged: number
): Promise<void> {
  await pack352_logKpiEvent({
    userId,
    eventType: KpiEventType.CHAT_PAID_STARTED,
    context: {
      chatId,
      participantIds: [userId, creatorId],
      isPaid: true,
      tokensCharged,
    },
  });
}

export async function logCallEvent(
  callId: string,
  userId: string,
  creatorId: string,
  callType: 'voice' | 'video',
  eventType: 'started' | 'ended',
  durationSeconds: number = 0,
  tokensCharged: number = 0
): Promise<void> {
  const kpiEventType =
    callType === 'voice'
      ? eventType === 'started'
        ? KpiEventType.VOICE_CALL_STARTED
        : KpiEventType.VOICE_CALL_ENDED
      : eventType === 'started'
      ? KpiEventType.VIDEO_CALL_STARTED
      : KpiEventType.VIDEO_CALL_ENDED;

  await pack352_logKpiEvent({
    userId,
    eventType: kpiEventType,
    context: {
      callId,
      participantIds: [userId, creatorId],
      callType,
      durationSeconds,
      tokensCharged,
    },
  });
}

export async function logCalendarBooking(
  bookingId: string,
  userId: string,
  creatorId: string,
  eventType: 'created' | 'cancelled' | 'completed',
  tokensCharged: number,
  durationMinutes: number
): Promise<void> {
  const kpiEventType =
    eventType === 'created'
      ? KpiEventType.CALENDAR_BOOKING_CREATED
      : eventType === 'cancelled'
      ? KpiEventType.CALENDAR_BOOKING_CANCELLED
      : KpiEventType.CALENDAR_BOOKING_COMPLETED;

  await pack352_logKpiEvent({
    userId,
    eventType: kpiEventType,
    context: {
      bookingId,
      creatorId,
      tokensCharged,
      durationMinutes,
    },
  });
}

export async function logTokenPurchase(
  userId: string,
  amount: number,
  fiatValue: number,
  currency: string,
  paymentMethod: string,
  packageId?: string
): Promise<void> {
  await pack352_logKpiEvent({
    userId,
    eventType: KpiEventType.TOKEN_PURCHASE,
    context: {
      amount,
      fiatValue,
      currency,
      paymentMethod,
      packageId,
    },
  });
}

export async function logPanicEvent(
  userId: string,
  reason?: string,
  location?: { lat: number; lng: number }
): Promise<void> {
  await pack352_logKpiEvent({
    userId,
    eventType: KpiEventType.PANIC_TRIGGERED,
    context: {
      triggeredBy: userId,
      location,
      reason,
    },
  });
}

export async function logSupportTicket(
  ticketId: string,
  userId: string,
  category: string,
  priority: string,
  isSafety: boolean,
  eventType: 'created' | 'resolved'
): Promise<void> {
  const kpiEventType =
    eventType === 'created'
      ? KpiEventType.SUPPORT_TICKET_CREATED
      : KpiEventType.SUPPORT_TICKET_RESOLVED;

  await pack352_logKpiEvent({
    userId,
    eventType: kpiEventType,
    context: {
      ticketId,
      category,
      priority,
      isSafety,
    },
  });
}

export async function logFraudFlag(
  userId: string,
  targetUserId: string,
  flagType: string,
  severity: string,
  reason: string
): Promise<void> {
  await pack352_logKpiEvent({
    userId,
    eventType: KpiEventType.FRAUD_FLAG_RAISED,
    context: {
      flagType,
      severity,
      targetUserId,
      reason,
    },
  });
}

// ============================================================================
// Validation & Sanitization
// ============================================================================

/**
 * Validate KPI event input
 */
function validateKpiEvent(event: KpiEventInput): void {
  if (!event.eventType) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'eventType is required'
    );
  }

  if (!Object.values(KpiEventType).includes(event.eventType)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Invalid eventType: ${event.eventType}`
    );
  }

  if (!event.context || typeof event.context !== 'object') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'context must be an object'
    );
  }

  // Event type specific validation
  switch (event.eventType) {
    case KpiEventType.SIGNUP:
      if (!event.userId) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'userId is required for signup events'
        );
      }
      break;

    case KpiEventType.TOKEN_PURCHASE:
      const purchaseContext = event.context as any;
      if (!purchaseContext.amount || !purchaseContext.fiatValue) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'amount and fiatValue are required for token purchase events'
        );
      }
      break;

    // Add more specific validations as needed
  }
}

/**
 * Sanitize context to remove sensitive data
 * No PII should be stored in KPI events
 */
function sanitizeContext(context: KpiEventContext): KpiEventContext {
  // Remove any fields that might contain PII
  const sanitized = { ...context };

  // Remove email, phone, full names, addresses, etc.
  delete (sanitized as any).email;
  delete (sanitized as any).phone;
  delete (sanitized as any).phoneNumber;
  delete (sanitized as any).fullName;
  delete (sanitized as any).address;
  delete (sanitized as any).ipAddress;

  // Keep only country/region for geo data (not precise location)
  // Exception: panic events can have precise location
  if ((sanitized as any).location && context !== null) {
    const event = context as any;
    if (!event.panicEvent) {
      delete (sanitized as any).location;
    }
  }

  return sanitized;
}

/**
 * Publish event to Pub/Sub for daily aggregator
 */
async function publishToAggregator(event: KpiEvent): Promise<void> {
  // TODO: Implement Pub/Sub publishing when aggregator is ready
  // For now, we'll rely on the scheduled daily aggregator
  // that reads directly from kpiEvents collection
  
  // Example implementation:
  /*
  const topic = admin.pubsub().topic('kpi-events');
  await topic.publishMessage({
    json: event,
    attributes: {
      eventType: event.eventType,
      date: new Date(event.createdAt).toISOString().split('T')[0],
    },
  });
  */
}

// ============================================================================
// Integration Examples (TODO comments for existing packs)
// ============================================================================

/**
 * INTEGRATION GUIDE:
 * 
 * To integrate KPI logging into existing packs, add calls like:
 * 
 * 1. Chat Engine (PACK 268):
 *    ```typescript
 *    import { logChatPaidStarted } from './pack352-kpi-events';
 *    
 *    // When paid chat starts:
 *    await logChatPaidStarted(chatId, userId, creatorId, tokensCharged);
 *    ```
 * 
 * 2. Voice/Video Calls:
 *    ```typescript
 *    import { logCallEvent } from './pack352-kpi-events';
 *    
 *    // When call starts:
 *    await logCallEvent(callId, userId, creatorId, 'voice', 'started');
 *    
 *    // When call ends:
 *    await logCallEvent(callId, userId, creatorId, 'voice', 'ended', durationSeconds, tokensCharged);
 *    ```
 * 
 * 3. Calendar Bookings:
 *    ```typescript
 *    import { logCalendarBooking } from './pack352-kpi-events';
 *    
 *    // When booking created:
 *    await logCalendarBooking(bookingId, userId, creatorId, 'created', tokensCharged, durationMinutes);
 *    ```
 * 
 * 4. Wallet/Token Purchases (PACK 277):
 *    ```typescript
 *    import { logTokenPurchase } from './pack352-kpi-events';
 *    
 *    // When user purchases tokens:
 *    await logTokenPurchase(userId, amount, fiatValue, currency, paymentMethod, packageId);
 *    ```
 * 
 * 5. Support & Panic (PACK 300/300A/300B/351):
 *    ```typescript
 *    import { logPanicEvent, logSupportTicket } from './pack352-kpi-events';
 *    
 *    // When panic button pressed:
 *    await logPanicEvent(userId, reason, location);
 *    
 *    // When support ticket created:
 *    await logSupportTicket(ticketId, userId, category, priority, isSafety, 'created');
 *    ```
 * 
 * 6. Fraud Detection (PACK 302):
 *    ```typescript
 *    import { logFraudFlag } from './pack352-kpi-events';
 *    
 *    // When fraud detected:
 *    await logFraudFlag(userId, targetUserId, flagType, severity, reason);
 *    ```
 * 
 * IMPORTANT:
 * - All calls are async, handle appropriately
 * - Logging should NOT block main business logic
 * - Wrap in try-catch to prevent failures from breaking core features
 * - Example:
 *   ```typescript
 *   try {
 *     await logKpiEvent(...);
 *   } catch (error) {
 *     console.error('KPI logging failed:', error);
 *     // Continue with business logic
 *   }
 *   ```
 */

// Named exports already declared above with 'export async function'
// No need for additional export statement
