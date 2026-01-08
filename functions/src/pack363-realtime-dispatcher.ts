/**
 * PACK 363 — Realtime Event Dispatcher
 * 
 * Backend dispatcher for realtime events across all channels:
 * - Chat messages
 * - AI companion responses
 * - Wallet transactions
 * - Support tickets
 * - Safety/panic signals
 * 
 * Handles event routing, priority management, and delivery guarantees
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type RealtimeChannelType = 'chat' | 'aiChat' | 'wallet' | 'support' | 'safety';
type EventPriority = 'normal' | 'high' | 'max';

interface RealtimeEvent {
  channel: RealtimeChannelType;
  type: string;
  payload: any;
  ts: number;
  priority?: EventPriority;
}

// ============================================================================
// CHAT EVENT DISPATCHERS
// ============================================================================

/**
 * Dispatch chat message events
 */
export const dispatchChatMessage = functions.firestore
  .document('messages/{messageId}')
  .onCreate(async (snap, context) => {
    const messageId = context.params.messageId;
    const message = snap.data();

    try {
      // Publish to realtime_chat_events
      await db.collection('realtime_chat_events').add({
        channel: 'chat',
        type: 'message_sent',
        payload: {
          messageId,
          conversationId: message.conversationId,
          senderId: message.senderId,
          content: message.content,
          type: message.type || 'text',
          timestamp: Date.now(),
          localId: message.localId
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        delivered: false,
        priority: 'normal'
      });

      // Mark message as delivered
      await snap.ref.update({
        deliveryState: 'delivered'
      });

      console.log(`[Chat] Dispatched message: ${messageId}`);
    } catch (error) {
      console.error(`[Chat] Dispatch error:`, error);
      throw error;
    }
  });

/**
 * Dispatch typing indicators (triggered by client publish)
 */
export const dispatchTypingIndicator = functions.firestore
  .document('realtime_chat_events/{eventId}')
  .onCreate(async (snap, context) => {
    const event = snap.data();
    
    // Only process typing_indicator events
    if (event.type !== 'typing_indicator') return;

    // Auto-delete after 10 seconds (cleanup)
    setTimeout(async () => {
      try {
        await snap.ref.delete();
      } catch (error) {
        console.error('[Chat] Cleanup error:', error);
      }
    }, 10000);
  });

// ============================================================================
// AI CHAT EVENT DISPATCHERS
// ============================================================================

/**
 * Process AI chat requests and dispatch streaming responses
 */
export const dispatchAIChatRequest = functions.firestore
  .document('ai_chat_requests/{requestId}')
  .onCreate(async (snap, context) => {
    const requestId = context.params.requestId;
    const request = snap.data();

    try {
      // Publish request queued event
      await db.collection('realtime_ai_chat_events').add({
        channel: 'aiChat',
        type: 'aiChat:request_queued',
        payload: {
          requestId,
          sessionId: request.sessionId,
          userId: request.userId,
          timestamp: Date.now()
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        priority: 'normal'
      });

      // Trigger AI processing (would integrate with actual AI service)
      // For now, simulate with a delay
      setTimeout(async () => {
        await processAIRequest(requestId, request);
      }, 1000);

      console.log(`[AI Chat] Queued request: ${requestId}`);
    } catch (error) {
      console.error(`[AI Chat] Dispatch error:`, error);
      throw error;
    }
  });

/**
 * Simulate AI processing and streaming
 */
async function processAIRequest(requestId: string, request: any) {
  try {
    const messageId = db.collection('ai_messages').doc().id;

    // Publish response started
    await db.collection('realtime_ai_chat_events').add({
      channel: 'aiChat',
      type: 'aiChat:response_started',
      payload: {
        requestId,
        messageId,
        sessionId: request.sessionId,
        timestamp: Date.now()
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      priority: 'normal'
    });

    // Simulate streaming chunks
    const response = "This is a simulated AI response for testing purposes.";
    const chunks = response.match(/.{1,5}/g) || [];

    for (let i = 0; i < chunks.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await db.collection('realtime_ai_chat_events').add({
        channel: 'aiChat',
        type: 'aiChat:response_chunk',
        payload: {
          requestId,
          messageId,
          chunk: chunks[i],
          timestamp: Date.now()
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        priority: 'normal'
      });
    }

    // Publish response completed
    await db.collection('realtime_ai_chat_events').add({
      channel: 'aiChat',
      type: 'aiChat:response_completed',
      payload: {
        requestId,
        messageId,
        fullContent: response,
        tokenCost: response.split(' ').length * 0.1,
        wordCost: response.split(' ').length,
        timestamp: Date.now()
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      priority: 'normal'
    });

  } catch (error) {
    console.error('[AI Chat] Processing error:', error);
    
    // Publish error event
    await db.collection('realtime_ai_chat_events').add({
      channel: 'aiChat',
      type: 'aiChat:error',
      payload: {
        requestId,
        error: error.message || 'AI processing failed',
        timestamp: Date.now()
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      priority: 'high'
    });
  }
}

// ============================================================================
// WALLET EVENT DISPATCHERS
// ============================================================================

/**
 * Dispatch wallet balance updates
 */
export const dispatchWalletUpdate = functions.firestore
  .document('wallets/{userId}')
  .onUpdate(async (change, context) => {
    const userId = context.params.userId;
    const before = change.before.data();
    const after = change.after.data();

    // Only dispatch if balance changed
    if (before.balance === after.balance) return;

    try {
      await db.collection('realtime_wallet_events').add({
        channel: 'wallet',
        type: 'balance_update',
        payload: {
          userId,
          newBalance: after.balance,
          currency: after.currency || 'USD',
          lastTxId: after.lastTxId,
          timestamp: Date.now()
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        priority: 'normal'
      });

      console.log(`[Wallet] Dispatched balance update for user: ${userId}`);
    } catch (error) {
      console.error(`[Wallet] Dispatch error:`, error);
    }
  });

/**
 * Dispatch transaction events
 */
export const dispatchWalletTransaction = functions.firestore
  .document('wallet_transactions/{txId}')
  .onCreate(async (snap, context) => {
    const txId = context.params.txId;
    const transaction = snap.data();

    try {
      // Publish transaction created
      await db.collection('realtime_wallet_events').add({
        channel: 'wallet',
        type: 'transaction_created',
        payload: {
          txId,
          userId: transaction.userId,
          type: transaction.type,
          amount: transaction.amount,
          currency: transaction.currency || 'USD',
          timestamp: Date.now()
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        priority: 'normal'
      });

      console.log(`[Wallet] Dispatched transaction: ${txId}`);
    } catch (error) {
      console.error(`[Wallet] Dispatch error:`, error);
    }
  });

export const dispatchWalletTransactionCompleted = functions.firestore
  .document('wallet_transactions/{txId}')
  .onUpdate(async (change, context) => {
    const txId = context.params.txId;
    const before = change.before.data();
    const after = change.after.data();

    // Only dispatch if status changed to completed
    if (before.status === after.status || after.status !== 'completed') return;

    try {
      await db.collection('realtime_wallet_events').add({
        channel: 'wallet',
        type: 'transaction_completed',
        payload: {
          txId,
          userId: after.userId,
          type: after.type,
          amount: after.amount,
          timestamp: Date.now()
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        priority: 'normal'
      });

      console.log(`[Wallet] Transaction completed: ${txId}`);
    } catch (error) {
      console.error(`[Wallet] Dispatch error:`, error);
    }
  });

// ============================================================================
// SUPPORT EVENT DISPATCHERS
// ============================================================================

/**
 * Dispatch support ticket messages
 */
export const dispatchSupportMessage = functions.firestore
  .document('support_messages/{messageId}')
  .onCreate(async (snap, context) => {
    const messageId = context.params.messageId;
    const message = snap.data();

    try {
      await db.collection('realtime_support_events').add({
        channel: 'support',
        type: 'ticket_message_added',
        payload: {
          messageId,
          ticketId: message.ticketId,
          senderId: message.senderId,
          senderType: message.senderType,
          content: message.content,
          timestamp: Date.now()
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        priority: 'normal'
      });

      console.log(`[Support] Dispatched message: ${messageId}`);
    } catch (error) {
      console.error(`[Support] Dispatch error:`, error);
    }
  });

/**
 * Dispatch support ticket status changes
 */
export const dispatchSupportStatusChange = functions.firestore
  .document('support_tickets/{ticketId}')
  .onUpdate(async (change, context) => {
    const ticketId = context.params.ticketId;
    const before = change.before.data();
    const after = change.after.data();

    // Check what changed
    if (before.status !== after.status) {
      await db.collection('realtime_support_events').add({
        channel: 'support',
        type: 'ticket_status_changed',
        payload: {
          ticketId,
          userId: after.userId,
          newStatus: after.status,
          timestamp: Date.now()
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        priority: 'normal'
      });
    }

    if (before.priority !== after.priority) {
      await db.collection('realtime_support_events').add({
        channel: 'support',
        type: 'ticket_priority_changed',
        payload: {
          ticketId,
          userId: after.userId,
          newPriority: after.priority,
          timestamp: Date.now()
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        priority: 'high'
      });
    }

    if (before.assignedTo !== after.assignedTo && after.assignedTo) {
      await db.collection('realtime_support_events').add({
        channel: 'support',
        type: 'ticket_assigned',
        payload: {
          ticketId,
          userId: after.userId,
          agentId: after.assignedTo,
          agentName: after.assignedToName,
          timestamp: Date.now()
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        priority: 'normal'
      });
    }
  });

// ============================================================================
// SAFETY EVENT DISPATCHERS
// ============================================================================

/**
 * Dispatch safety events with MAX priority
 */
export const dispatchSafetyEvent = functions.firestore
  .document('safety_events/{eventId}')
  .onCreate(async (snap, context) => {
    const eventId = context.params.eventId;
    const event = snap.data();

    try {
      // Determine priority based on severity
      const priority: EventPriority = 
        event.severity === 'emergency' ? 'max' :
        event.severity === 'critical' ? 'high' :
        'normal';

      // Publish safety event
      await db.collection('realtime_safety_events').add({
        channel: 'safety',
        type: `safety:${event.type}`,
        payload: {
          eventId,
          userId: event.userId,
          severity: event.severity,
          location: event.location,
          context: event.context,
          timestamp: Date.now()
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        priority
      });

      // Log to audit for all safety events
      await db.collection('pack363_audit_log').add({
        eventType: 'safety_event_dispatched',
        eventId,
        userId: event.userId,
        severity: event.severity,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`[SAFETY] Dispatched ${priority} priority event: ${eventId}`);

      // If emergency, trigger additional alerts
      if (event.severity === 'emergency') {
        await triggerEmergencyProtocol(eventId, event);
      }

    } catch (error) {
      console.error(`[Safety] Dispatch error:`, error);
      // Safety events must not fail silently - retry
      throw error;
    }
  });

/**
 * Emergency protocol for panic signals
 */
async function triggerEmergencyProtocol(eventId: string, event: any) {
  try {
    // Notify support system
    await db.collection('support_tickets').add({
      userId: event.userId,
      subject: 'EMERGENCY: Panic Signal Triggered',
      category: 'safety',
      status: 'open',
      priority: 'critical',
      autoCreated: true,
      relatedEventId: eventId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Notify emergency contacts (if configured)
    const userDoc = await db.collection('users').doc(event.userId).get();
    if (userDoc.exists) {
      const emergencyContacts = userDoc.data()?.emergencyContacts || [];
      
      for (const contact of emergencyContacts) {
        // Send notification (integrate with notification system)
        console.log(`[SAFETY] Notifying emergency contact: ${contact.id}`);
      }
    }

    // Log to high-priority audit
    await db.collection('safety_audit_log').add({
      type: 'emergency_protocol_triggered',
      eventId,
      userId: event.userId,
      location: event.location,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

  } catch (error) {
    console.error('[Safety] Emergency protocol error:', error);
  }
}

// ============================================================================
// CLEANUP TASKS
// ============================================================================

/**
 * Clean up old realtime events (scheduled)
 */
export const cleanupRealtimeEvents = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    const cutoffTime = admin.firestore.Timestamp.fromMillis(
      Date.now() - 24 * 60 * 60 * 1000 // 24 hours ago
    );

    const collections = [
      'realtime_chat_events',
      'realtime_ai_chat_events',
      'realtime_wallet_events',
      'realtime_support_events',
      'realtime_safety_events'
    ];

    let totalDeleted = 0;

    for (const collectionName of collections) {
      const snapshot = await db
        .collection(collectionName)
        .where('createdAt', '<', cutoffTime)
        .limit(500)
        .get();

      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      if (snapshot.size > 0) {
        await batch.commit();
        totalDeleted += snapshot.size;
      }
    }

    console.log(`[Cleanup] Deleted ${totalDeleted} old realtime events`);
    return null;
  });

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  dispatchChatMessage,
  dispatchTypingIndicator,
  dispatchAIChatRequest,
  dispatchWalletUpdate,
  dispatchWalletTransaction,
  dispatchWalletTransactionCompleted,
  dispatchSupportMessage,
  dispatchSupportStatusChange,
  dispatchSafetyEvent,
  cleanupRealtimeEvents
};
