"use strict";
/**
 * PHASE 18 - Global Analytics & Monitoring Engine
 *
 * Client event logging with schema validation
 * Events are queued to analyticsEvents collection for batch export to BigQuery
 *
 * Region: europe-west3
 * No changes to existing pricing/splits
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalyticsSummaryV1 = exports.logClientEventV1 = exports.EventNames = void 0;
exports.logServerEvent = logServerEvent;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const zod_1 = require("zod");
const featureFlags_1 = require("./featureFlags");
const db = (0, firestore_1.getFirestore)();
/**
 * Normalized analytics event schema
 */
const AnalyticsEventSchema = zod_1.z.object({
    eventName: zod_1.z.string().min(1).max(100),
    uid: zod_1.z.string().optional(), // Optional for anonymous events
    role: zod_1.z.enum(["user", "creator", "admin", "ai_companion"]).optional(),
    source: zod_1.z.enum(["app", "web"]),
    locale: zod_1.z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/), // en, en-US, pl-PL
    country: zod_1.z.string().length(2).optional(), // ISO 3166-1 alpha-2
    screen: zod_1.z.string().max(200).optional(), // Current screen/page
    payload: zod_1.z.record(zod_1.z.any()).optional(), // Additional event data
    // Client timestamp (server adds server timestamp)
    clientTimestamp: zod_1.z.number().optional(),
});
/**
 * Standard event names (extensible)
 */
exports.EventNames = {
    // User lifecycle
    USER_SIGNUP: "user_signup",
    USER_LOGIN: "user_login",
    USER_LOGOUT: "user_logout",
    USER_DELETED: "user_deleted",
    // Onboarding
    ONBOARDING_STARTED: "onboarding_started",
    ONBOARDING_STEP: "onboarding_step",
    ONBOARDING_COMPLETED: "onboarding_completed",
    // Discovery
    DISCOVERY_VIEW: "discovery_view",
    PROFILE_VIEW: "profile_view",
    PROFILE_LIKE: "profile_like",
    PROFILE_PASS: "profile_pass",
    // Chat
    CHAT_STARTED: "chat_started",
    CHAT_MESSAGE_SENT: "chat_message_sent",
    CHAT_DEPOSIT: "chat_deposit",
    CHAT_ENDED: "chat_ended",
    // Calendar
    CALENDAR_VIEW: "calendar_view",
    CALENDAR_BOOKING_STARTED: "calendar_booking_started",
    CALENDAR_BOOKING_COMPLETED: "calendar_booking_completed",
    CALENDAR_BOOKING_CANCELED: "calendar_booking_canceled",
    // Payments
    WALLET_VIEW: "wallet_view",
    PURCHASE_STARTED: "purchase_started",
    PURCHASE_COMPLETED: "purchase_completed",
    PURCHASE_FAILED: "purchase_failed",
    // AI Companions
    AI_COMPANION_VIEW: "ai_companion_view",
    AI_SUBSCRIPTION_STARTED: "ai_subscription_started",
    AI_SUBSCRIPTION_COMPLETED: "ai_subscription_completed",
    AI_MEDIA_UNLOCKED: "ai_media_unlocked",
    // Creator
    CREATOR_PROFILE_EDIT: "creator_profile_edit",
    CREATOR_EARNINGS_VIEW: "creator_earnings_view",
    CREATOR_PRODUCT_CREATED: "creator_product_created",
    // Moderation
    CONTENT_REPORTED: "content_reported",
    USER_BLOCKED: "user_blocked",
    // Errors
    ERROR_OCCURRED: "error_occurred",
    API_ERROR: "api_error",
};
/**
 * Log client event - Callable function
 *
 * Usage:
 * ```typescript
 * const logEvent = httpsCallable(functions, 'logClientEventV1');
 * await logEvent({
 *   eventName: 'profile_view',
 *   source: 'app',
 *   locale: 'pl-PL',
 *   screen: 'ProfileScreen',
 *   payload: { targetUserId: 'user123' }
 * });
 * ```
 */
exports.logClientEventV1 = (0, https_1.onCall)({ region: "europe-west3", maxInstances: 100 }, async (request) => {
    try {
        // Check feature flag
        const analyticsEnabled = await (0, featureFlags_1.getFeatureFlag)(request.auth?.uid, "analytics_enabled", true // Default enabled
        );
        if (!analyticsEnabled) {
            return { success: true, queued: false, reason: "feature_disabled" };
        }
        // Validate input
        const validationResult = AnalyticsEventSchema.safeParse(request.data);
        if (!validationResult.success) {
            throw new https_1.HttpsError("invalid-argument", `Invalid analytics event: ${validationResult.error.message}`);
        }
        const event = validationResult.data;
        // Auto-populate uid if authenticated
        const uid = event.uid || request.auth?.uid;
        // PII safety check - no raw messages or sensitive content
        if (event.payload) {
            const sanitizedPayload = sanitizePayload(event.payload);
            event.payload = sanitizedPayload;
        }
        // Create normalized event document
        const eventDoc = {
            eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            eventName: event.eventName,
            uid: uid || null,
            role: event.role || null,
            source: event.source,
            locale: event.locale,
            country: event.country || null,
            screen: event.screen || null,
            payload: event.payload || {},
            clientTimestamp: event.clientTimestamp
                ? firestore_1.Timestamp.fromMillis(event.clientTimestamp)
                : null,
            serverTimestamp: firestore_1.FieldValue.serverTimestamp(),
            processed: false, // For batch export
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        };
        // Queue to analyticsEvents for batch export
        await db.collection("analyticsEvents").add(eventDoc);
        // Log to engineLogs for monitoring
        const today = new Date().toISOString().split("T")[0];
        await db
            .collection("engineLogs")
            .doc("analytics")
            .collection(today)
            .doc("entries")
            .set({
            events: firestore_1.FieldValue.arrayUnion({
                eventName: event.eventName,
                uid: uid || "anonymous",
                source: event.source,
                timestamp: new Date().toISOString(),
            }),
        }, { merge: true });
        return {
            success: true,
            queued: true,
            eventId: eventDoc.eventId,
        };
    }
    catch (error) {
        console.error("Analytics error:", error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        // Don't fail client requests due to analytics errors
        return {
            success: false,
            queued: false,
            error: "Analytics logging failed but request not blocked",
        };
    }
});
/**
 * Sanitize payload to remove PII
 * Remove: message content, passwords, tokens, emails in plain text
 */
function sanitizePayload(payload) {
    const sanitized = {};
    const bannedKeys = [
        "message",
        "messageContent",
        "password",
        "token",
        "accessToken",
        "refreshToken",
        "email",
        "phoneNumber",
        "creditCard",
        "ssn",
    ];
    for (const [key, value] of Object.entries(payload)) {
        // Skip banned keys
        if (bannedKeys.some((banned) => key.toLowerCase().includes(banned.toLowerCase()))) {
            sanitized[key] = "[REDACTED]";
            continue;
        }
        // Recursively sanitize nested objects
        if (value && typeof value === "object" && !Array.isArray(value)) {
            sanitized[key] = sanitizePayload(value);
        }
        else if (Array.isArray(value)) {
            sanitized[key] = value.map((item) => typeof item === "object" ? sanitizePayload(item) : item);
        }
        else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}
/**
 * Internal helper: Log server-side analytics events
 * Used by other functions to track backend events
 */
async function logServerEvent(eventName, uid, payload) {
    try {
        const eventDoc = {
            eventId: `srv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            eventName,
            uid,
            role: null,
            source: "server",
            locale: "en",
            country: null,
            screen: null,
            payload: sanitizePayload(payload),
            clientTimestamp: null,
            serverTimestamp: firestore_1.FieldValue.serverTimestamp(),
            processed: false,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        };
        await db.collection("analyticsEvents").add(eventDoc);
    }
    catch (error) {
        console.error("Server event logging failed:", error);
        // Don't throw - analytics failures shouldn't break business logic
    }
}
/**
 * Get analytics summary for dashboard
 * Callable function (admin only)
 */
exports.getAnalyticsSummaryV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check admin role
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData?.role || !["admin", "moderator"].includes(userData.role)) {
        throw new https_1.HttpsError("permission-denied", "Admin access required");
    }
    // Get last 24 hours of events
    const oneDayAgo = firestore_1.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    const eventsSnapshot = await db
        .collection("analyticsEvents")
        .where("serverTimestamp", ">=", oneDayAgo)
        .limit(10000)
        .get();
    // Aggregate events
    const eventCounts = {};
    const sourceBreakdown = { app: 0, web: 0, server: 0 };
    const localeBreakdown = {};
    let totalEvents = 0;
    let uniqueUsers = new Set();
    eventsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        totalEvents++;
        // Event name counts
        eventCounts[data.eventName] = (eventCounts[data.eventName] || 0) + 1;
        // Source breakdown
        if (data.source) {
            sourceBreakdown[data.source] = (sourceBreakdown[data.source] || 0) + 1;
        }
        // Locale breakdown
        if (data.locale) {
            localeBreakdown[data.locale] = (localeBreakdown[data.locale] || 0) + 1;
        }
        // Unique users
        if (data.uid) {
            uniqueUsers.add(data.uid);
        }
    });
    return {
        period: "24h",
        totalEvents,
        uniqueUsers: uniqueUsers.size,
        eventCounts,
        sourceBreakdown,
        localeBreakdown,
        topEvents: Object.entries(eventCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([name, count]) => ({ name, count })),
    };
});
//# sourceMappingURL=analytics.js.map