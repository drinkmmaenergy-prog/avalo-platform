"use strict";
/**
 * Event Engine - Phase 12
 *
 * Implements system event queue processing with:
 * - Priority-based event queuing
 * - Idempotent processing
 * - TTL expiration
 * - Automatic retry for failed events
 *
 * Event types:
 * - chat.deposited, chat.message
 * - calendar.booked, calendar.verified
 * - payment.purchase
 * - ai.chat.started
 * - moderation.flag
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupExpiredEventsScheduler = exports.retryFailedEventsScheduler = exports.processEventScheduler = exports.enqueueEventCallable = exports.EventType = exports.EventPriority = exports.EventStatus = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const zod_1 = require("zod");
const db = (0, firestore_1.getFirestore)();
/**
 * Event status enum
 */
var EventStatus;
(function (EventStatus) {
    EventStatus["QUEUED"] = "queued";
    EventStatus["PROCESSING"] = "processing";
    EventStatus["COMPLETED"] = "completed";
    EventStatus["FAILED"] = "failed";
    EventStatus["EXPIRED"] = "expired";
})(EventStatus || (exports.EventStatus = EventStatus = {}));
/**
 * Event priority (higher = more urgent)
 */
var EventPriority;
(function (EventPriority) {
    EventPriority[EventPriority["LOW"] = 1] = "LOW";
    EventPriority[EventPriority["NORMAL"] = 5] = "NORMAL";
    EventPriority[EventPriority["HIGH"] = 10] = "HIGH";
    EventPriority[EventPriority["CRITICAL"] = 20] = "CRITICAL";
})(EventPriority || (exports.EventPriority = EventPriority = {}));
/**
 * Event types
 */
var EventType;
(function (EventType) {
    EventType["CHAT_DEPOSITED"] = "chat.deposited";
    EventType["CHAT_MESSAGE"] = "chat.message";
    EventType["CALENDAR_BOOKED"] = "calendar.booked";
    EventType["CALENDAR_VERIFIED"] = "calendar.verified";
    EventType["PAYMENT_PURCHASE"] = "payment.purchase";
    EventType["AI_CHAT_STARTED"] = "ai.chat.started";
    EventType["MODERATION_FLAG"] = "moderation.flag";
})(EventType || (exports.EventType = EventType = {}));
/**
 * Zod validation schemas
 */
const EnqueueEventSchema = zod_1.z.object({
    type: zod_1.z.nativeEnum(EventType),
    priority: zod_1.z.nativeEnum(EventPriority).optional().default(EventPriority.NORMAL),
    payload: zod_1.z.record(zod_1.z.any()),
    ttlMinutes: zod_1.z.number().min(1).max(10080).optional().default(60), // Max 1 week
    maxRetries: zod_1.z.number().min(0).max(10).optional().default(3),
});
/**
 * Enqueue a new event
 * Callable function
 */
exports.enqueueEventCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Validate input
    const validationResult = EnqueueEventSchema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { type, priority, payload, ttlMinutes, maxRetries } = validationResult.data;
    try {
        // Generate event ID
        const eventRef = db.collection("systemEvents").doc();
        const eventId = eventRef.id;
        // Calculate TTL
        const ttl = firestore_1.Timestamp.fromMillis(Date.now() + ttlMinutes * 60 * 1000);
        // Create event document
        const event = {
            eventId,
            type,
            priority,
            status: EventStatus.QUEUED,
            payload,
            ttl,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            retryCount: 0,
            maxRetries,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        await eventRef.set(event);
        // Log to engine logs
        await logEngineEvent("eventEngine", "event_enqueued", {
            eventId,
            type,
            priority,
            uid,
        });
        return {
            success: true,
            eventId,
        };
    }
    catch (error) {
        console.error("Error enqueuing event:", error);
        throw new https_1.HttpsError("internal", `Failed to enqueue event: ${error.message}`);
    }
});
/**
 * Process events from queue
 * Scheduled function - runs every 1 minute
 */
exports.processEventScheduler = (0, scheduler_1.onSchedule)({
    schedule: "every 1 minutes",
    region: "europe-west3",
    timeoutSeconds: 540, // 9 minutes
}, async (event) => {
    console.log("Processing event queue...");
    try {
        const now = firestore_1.Timestamp.now();
        // Query queued events, ordered by priority (high to low), then by creation time
        const eventsSnapshot = await db
            .collection("systemEvents")
            .where("status", "==", EventStatus.QUEUED)
            .where("ttl", ">", now)
            .orderBy("ttl", "asc") // First order by TTL to use in query
            .orderBy("priority", "desc")
            .orderBy("createdAt", "asc")
            .limit(100)
            .get();
        if (eventsSnapshot.empty) {
            console.log("No events to process");
            return;
        }
        console.log(`Processing ${eventsSnapshot.size} events`);
        // Process events in batches
        const processingPromises = eventsSnapshot.docs.map(async (doc) => {
            const event = doc.data();
            return processEvent(event, doc.id);
        });
        const results = await Promise.allSettled(processingPromises);
        // Count successes and failures
        const succeeded = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.filter((r) => r.status === "rejected").length;
        console.log(`Event processing complete: ${succeeded} succeeded, ${failed} failed`);
        // Log processing summary
        await logEngineEvent("eventEngine", "batch_processed", {
            total: eventsSnapshot.size,
            succeeded,
            failed,
        });
    }
    catch (error) {
        console.error("Error in processEventScheduler:", error);
    }
});
/**
 * Process a single event (idempotent)
 */
async function processEvent(event, docId) {
    const eventRef = db.collection("systemEvents").doc(docId);
    try {
        // Use transaction for idempotency
        await db.runTransaction(async (tx) => {
            const currentDoc = await tx.get(eventRef);
            const currentEvent = currentDoc.data();
            // Idempotency check: if already processed, skip
            if (currentEvent.status !== EventStatus.QUEUED) {
                console.log(`Event ${event.eventId} already processed, skipping`);
                return;
            }
            // Check TTL expiration
            if (currentEvent.ttl.toMillis() < Date.now()) {
                tx.update(eventRef, {
                    status: EventStatus.EXPIRED,
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                return;
            }
            // Mark as processing
            tx.update(eventRef, {
                status: EventStatus.PROCESSING,
                processedBy: `scheduler_${Date.now()}`,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
        // Execute event handler
        await executeEventHandler(event);
        // Mark as completed
        await eventRef.update({
            status: EventStatus.COMPLETED,
            processedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        console.log(`Event ${event.eventId} processed successfully`);
    }
    catch (error) {
        console.error(`Error processing event ${event.eventId}:`, error);
        // Mark as failed
        await eventRef.update({
            status: EventStatus.FAILED,
            failureReason: error.message || "Unknown error",
            retryCount: firestore_1.FieldValue.increment(1),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        throw error;
    }
}
/**
 * Execute event-specific handler
 */
async function executeEventHandler(event) {
    switch (event.type) {
        case EventType.CHAT_DEPOSITED:
            await handleChatDeposited(event.payload);
            break;
        case EventType.CHAT_MESSAGE:
            await handleChatMessage(event.payload);
            break;
        case EventType.CALENDAR_BOOKED:
            await handleCalendarBooked(event.payload);
            break;
        case EventType.CALENDAR_VERIFIED:
            await handleCalendarVerified(event.payload);
            break;
        case EventType.PAYMENT_PURCHASE:
            await handlePaymentPurchase(event.payload);
            break;
        case EventType.AI_CHAT_STARTED:
            await handleAIChatStarted(event.payload);
            break;
        case EventType.MODERATION_FLAG:
            await handleModerationFlag(event.payload);
            break;
        default:
            console.warn(`Unknown event type: ${event.type}`);
    }
}
/**
 * Event handlers
 */
async function handleChatDeposited(payload) {
    console.log("Handling chat.deposited:", payload);
    // Logic: Update analytics, trigger welcome message, etc.
    await logEngineEvent("eventEngine", "chat_deposited_handled", payload);
}
async function handleChatMessage(payload) {
    console.log("Handling chat.message:", payload);
    // Logic: Update conversation stats, check for spam, etc.
    await logEngineEvent("eventEngine", "chat_message_handled", payload);
}
async function handleCalendarBooked(payload) {
    console.log("Handling calendar.booked:", payload);
    // Logic: Send notifications, update availability, etc.
    await logEngineEvent("eventEngine", "calendar_booked_handled", payload);
}
async function handleCalendarVerified(payload) {
    console.log("Handling calendar.verified:", payload);
    // Logic: Release escrow, update ratings, etc.
    await logEngineEvent("eventEngine", "calendar_verified_handled", payload);
}
async function handlePaymentPurchase(payload) {
    console.log("Handling payment.purchase:", payload);
    // Logic: Credit tokens, send receipt, update stats
    await logEngineEvent("eventEngine", "payment_purchase_handled", payload);
}
async function handleAIChatStarted(payload) {
    console.log("Handling ai.chat.started:", payload);
    // Logic: Initialize AI context, log usage
    await logEngineEvent("eventEngine", "ai_chat_started_handled", payload);
}
async function handleModerationFlag(payload) {
    console.log("Handling moderation.flag:", payload);
    // Logic: Alert moderators, update risk score
    await logEngineEvent("eventEngine", "moderation_flag_handled", payload);
}
/**
 * Retry failed events
 * Scheduled function - runs every 10 minutes
 */
exports.retryFailedEventsScheduler = (0, scheduler_1.onSchedule)({
    schedule: "every 10 minutes",
    region: "europe-west3",
    timeoutSeconds: 540,
}, async (event) => {
    console.log("Retrying failed events...");
    try {
        const now = firestore_1.Timestamp.now();
        // Query failed events that haven't exceeded max retries
        const failedEventsSnapshot = await db
            .collection("systemEvents")
            .where("status", "==", EventStatus.FAILED)
            .where("ttl", ">", now)
            .limit(50)
            .get();
        if (failedEventsSnapshot.empty) {
            console.log("No failed events to retry");
            return;
        }
        console.log(`Found ${failedEventsSnapshot.size} failed events`);
        let retriedCount = 0;
        let maxedOutCount = 0;
        for (const doc of failedEventsSnapshot.docs) {
            const event = doc.data();
            if (event.retryCount >= event.maxRetries) {
                console.log(`Event ${event.eventId} exceeded max retries`);
                maxedOutCount++;
                continue;
            }
            // Reset to QUEUED for retry
            await doc.ref.update({
                status: EventStatus.QUEUED,
                failureReason: firestore_1.FieldValue.delete(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            retriedCount++;
        }
        console.log(`Retry complete: ${retriedCount} events queued for retry, ${maxedOutCount} exceeded max retries`);
        await logEngineEvent("eventEngine", "retry_batch_completed", {
            total: failedEventsSnapshot.size,
            retried: retriedCount,
            maxedOut: maxedOutCount,
        });
    }
    catch (error) {
        console.error("Error in retryFailedEventsScheduler:", error);
    }
});
/**
 * Helper: Log engine event
 */
async function logEngineEvent(engine, action, metadata) {
    const today = new Date().toISOString().split("T")[0];
    const logRef = db
        .collection("engineLogs")
        .doc(engine)
        .collection(today)
        .doc();
    await logRef.set({
        action,
        metadata,
        timestamp: firestore_1.FieldValue.serverTimestamp(),
    });
}
/**
 * Cleanup expired events (optional maintenance)
 */
exports.cleanupExpiredEventsScheduler = (0, scheduler_1.onSchedule)({
    schedule: "every 24 hours",
    region: "europe-west3",
    timeoutSeconds: 540,
}, async (event) => {
    console.log("Cleaning up expired events...");
    try {
        const now = firestore_1.Timestamp.now();
        // Query expired events
        const expiredSnapshot = await db
            .collection("systemEvents")
            .where("ttl", "<", now)
            .limit(500)
            .get();
        if (expiredSnapshot.empty) {
            console.log("No expired events to clean up");
            return;
        }
        // Delete in batches
        const batch = db.batch();
        expiredSnapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`Deleted ${expiredSnapshot.size} expired events`);
        await logEngineEvent("eventEngine", "cleanup_completed", {
            deletedCount: expiredSnapshot.size,
        });
    }
    catch (error) {
        console.error("Error in cleanupExpiredEventsScheduler:", error);
    }
});
//# sourceMappingURL=eventEngine.js.map