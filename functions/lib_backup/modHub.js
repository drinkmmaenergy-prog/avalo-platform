"use strict";
/**
 * ========================================================================
 * AVALO 3.0 — PHASE 41: HUMAN-IN-THE-LOOP MODERATOR HUB
 * ========================================================================
 *
 * AI-assisted moderation dashboard backend for human reviewers.
 * Provides queuing, assignment, decision tracking, and analytics.
 *
 * Key Features:
 * - Priority-based moderation queue
 * - Automatic assignment to available moderators
 * - SLA tracking and alerting
 * - Historical decision analysis
 * - Similar case recommendations
 * - Pattern detection for repeat offenders
 * - Performance metrics per moderator
 * - Appeal handling workflow
 *
 * SLA Targets:
 * - Critical: <1 hour
 * - High: <4 hours
 * - Medium: <24 hours
 * - Low: <72 hours
 *
 * @module modHub
 * @version 3.0.0
 * @license Proprietary - Avalo Inc.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSLABreachesScheduler = exports.autoAssignQueueItemsScheduler = exports.getModeratorStatsV1 = exports.resolveQueueItemV1 = exports.claimQueueItemV1 = exports.getQueueItemDetailsV1 = exports.getModerationQueueV2 = exports.QueueItemStatus = exports.Priority = exports.ModeratorAction = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
// ============================================================================
// TYPES & INTERFACES
// ============================================================================
var ModeratorAction;
(function (ModeratorAction) {
    ModeratorAction["APPROVE"] = "approve";
    ModeratorAction["WARN"] = "warn";
    ModeratorAction["REMOVE_CONTENT"] = "remove_content";
    ModeratorAction["SUSPEND_USER"] = "suspend_user";
    ModeratorAction["BAN_USER"] = "ban_user";
    ModeratorAction["ESCALATE"] = "escalate";
    ModeratorAction["REQUEST_INFO"] = "request_info";
})(ModeratorAction || (exports.ModeratorAction = ModeratorAction = {}));
var Priority;
(function (Priority) {
    Priority[Priority["CRITICAL"] = 10] = "CRITICAL";
    Priority[Priority["HIGH"] = 7] = "HIGH";
    Priority[Priority["MEDIUM"] = 5] = "MEDIUM";
    Priority[Priority["LOW"] = 3] = "LOW";
})(Priority || (exports.Priority = Priority = {}));
var QueueItemStatus;
(function (QueueItemStatus) {
    QueueItemStatus["PENDING"] = "pending";
    QueueItemStatus["IN_REVIEW"] = "in_review";
    QueueItemStatus["RESOLVED"] = "resolved";
    QueueItemStatus["ESCALATED"] = "escalated";
    QueueItemStatus["APPEALED"] = "appealed";
})(QueueItemStatus || (exports.QueueItemStatus = QueueItemStatus = {}));
// ============================================================================
// CONFIGURATION
// ============================================================================
const SLA_HOURS = {
    [Priority.CRITICAL]: 1,
    [Priority.HIGH]: 4,
    [Priority.MEDIUM]: 24,
    [Priority.LOW]: 72,
};
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Check if moderator has permission
 */
async function checkModeratorPermission(userId) {
    const db = (0, firestore_1.getFirestore)();
    const userDoc = await db.collection("users").doc(userId).get();
    const role = userDoc.data()?.role;
    return role === "moderator" || role === "admin" || role === "senior_moderator";
}
/**
 * Calculate SLA deadline and status
 */
function calculateSLA(priority, createdAt) {
    const slaHours = SLA_HOURS[priority];
    const mustReviewBy = firestore_1.Timestamp.fromMillis(createdAt.toMillis() + slaHours * 60 * 60 * 1000);
    const hoursRemaining = (mustReviewBy.toMillis() - Date.now()) / (1000 * 60 * 60);
    const isOverdue = hoursRemaining < 0;
    return {
        mustReviewBy,
        isOverdue,
        hoursRemaining: Math.round(hoursRemaining * 10) / 10,
    };
}
/**
 * Find similar historical cases for recommendation
 */
async function findSimilarCasesV1(contentType, flags, limit = 5) {
    const db = (0, firestore_1.getFirestore)();
    // Get cases with similar flags
    const similarCases = [];
    for (const flag of flags) {
        const casesSnapshot = await db
            .collection("moderation_queue")
            .where("status", "==", QueueItemStatus.RESOLVED)
            .where("contentType", "==", contentType)
            .orderBy("resolvedAt", "desc")
            .limit(20)
            .get();
        for (const caseDoc of casesSnapshot.docs) {
            const caseData = caseDoc.data();
            // Calculate similarity based on flag overlap
            const caseFlags = caseData.aiAnalysis.flags.map((f) => f.category);
            const queryFlags = flags.map((f) => f.category);
            const overlap = caseFlags.filter((f) => queryFlags.includes(f)).length;
            const similarity = (overlap / Math.max(caseFlags.length, queryFlags.length)) * 100;
            if (similarity > 50 && caseData.resolution) {
                similarCases.push({
                    caseId: caseDoc.id,
                    similarity: Math.round(similarity),
                    resolution: caseData.resolution.action,
                    moderatorNotes: caseData.resolution.notes || "",
                    resolvedAt: caseData.resolvedAt,
                });
            }
        }
    }
    // Sort by similarity and return top results
    return similarCases
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
}
/**
 * Detect patterns for repeat offenders
 */
async function detectUserPatternsV1(userId) {
    const db = (0, firestore_1.getFirestore)();
    // Get user's violation history (last 90 days)
    const ninetyDaysAgo = firestore_1.Timestamp.fromMillis(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const violationsSnapshot = await db
        .collection("moderation_queue")
        .where("userId", "==", userId)
        .where("status", "==", QueueItemStatus.RESOLVED)
        .where("resolvedAt", ">=", ninetyDaysAgo)
        .get();
    const violations = violationsSnapshot.docs
        .map((doc) => doc.data())
        .filter((item) => item.resolution?.action !== ModeratorAction.APPROVE);
    const offenseCount = violations.length;
    const isRepeatOffender = offenseCount >= 3;
    // Find common violation types
    const violationCategories = violations.flatMap((v) => v.aiAnalysis.flags.map((f) => f.category));
    const categoryCounts = violationCategories.reduce((acc, cat) => {
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
    }, {});
    const commonViolations = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat]) => cat);
    // Recommend escalating action for repeat offenders
    let recommendedAction;
    if (offenseCount >= 5) {
        recommendedAction = ModeratorAction.BAN_USER;
    }
    else if (offenseCount >= 3) {
        recommendedAction = ModeratorAction.SUSPEND_USER;
    }
    else if (offenseCount >= 2) {
        recommendedAction = ModeratorAction.WARN;
    }
    else {
        recommendedAction = ModeratorAction.REMOVE_CONTENT;
    }
    return {
        isRepeatOffender,
        offenseCount,
        commonViolations,
        recommendedAction,
    };
}
/**
 * Auto-assign queue item to available moderator
 */
async function autoAssignToModeratorV1(queueId) {
    const db = (0, firestore_1.getFirestore)();
    // Find moderators who are:
    // 1. Online (active in last 15 minutes)
    // 2. Have no overdue cases
    // 3. Have capacity (<10 active cases)
    const fifteenMinutesAgo = firestore_1.Timestamp.fromMillis(Date.now() - 15 * 60 * 1000);
    const moderatorsSnapshot = await db
        .collection("users")
        .where("role", "in", ["moderator", "senior_moderator"])
        .where("lastActiveAt", ">=", fifteenMinutesAgo)
        .get();
    for (const modDoc of moderatorsSnapshot.docs) {
        const modId = modDoc.id;
        // Check workload
        const activeCases = await db
            .collection("moderation_queue")
            .where("assignedTo", "==", modId)
            .where("status", "==", QueueItemStatus.IN_REVIEW)
            .get();
        if (activeCases.size < 10) {
            // Assign to this moderator
            await db.collection("moderation_queue").doc(queueId).update({
                assignedTo: modId,
                assignedAt: firestore_1.FieldValue.serverTimestamp(),
                status: QueueItemStatus.IN_REVIEW,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            v2_1.logger.info(`Auto-assigned queue item ${queueId} to moderator ${modId}`);
            return modId;
        }
    }
    return null;
}
// ============================================================================
// API ENDPOINTS
// ============================================================================
/**
 * Get moderation queue with filters
 *
 * @endpoint getModerationQueueV2
 * @auth moderator
 */
exports.getModerationQueueV2 = (0, https_1.onCall)({
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
}, async (request) => {
    const moderatorId = request.auth?.uid;
    if (!moderatorId) {
        throw new Error("Authentication required");
    }
    const isModerator = await checkModeratorPermission(moderatorId);
    if (!isModerator) {
        throw new Error("Moderator access required");
    }
    const db = (0, firestore_1.getFirestore)();
    const { status, priority, assignedToMe, limit = 50 } = request.data;
    let query = db.collection("moderation_queue");
    // Apply filters
    if (status) {
        query = query.where("status", "==", status);
    }
    else {
        query = query.where("status", "in", [QueueItemStatus.PENDING, QueueItemStatus.IN_REVIEW]);
    }
    if (priority !== undefined) {
        query = query.where("priority", "==", priority);
    }
    if (assignedToMe) {
        query = query.where("assignedTo", "==", moderatorId);
    }
    query = query.orderBy("priority", "desc").orderBy("createdAt", "asc").limit(limit);
    const snapshot = await query.get();
    const queue = snapshot.docs.map((doc) => {
        const data = doc.data();
        // Recalculate SLA status
        data.sla = calculateSLA(data.priority, data.createdAt);
        return data;
    });
    // Get stats
    const pendingSnapshot = await db
        .collection("moderation_queue")
        .where("status", "==", QueueItemStatus.PENDING)
        .get();
    const overdueItems = queue.filter((item) => item.sla.isOverdue);
    const criticalItems = queue.filter((item) => item.priority === Priority.CRITICAL);
    return {
        queue,
        stats: {
            totalPending: pendingSnapshot.size,
            totalOverdue: overdueItems.length,
            criticalCount: criticalItems.length,
        },
    };
});
/**
 * Get single queue item with context
 *
 * @endpoint getQueueItemDetailsV1
 * @auth moderator
 */
exports.getQueueItemDetailsV1 = (0, https_1.onCall)({
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
}, async (request) => {
    const moderatorId = request.auth?.uid;
    if (!moderatorId) {
        throw new Error("Authentication required");
    }
    const isModerator = await checkModeratorPermission(moderatorId);
    if (!isModerator) {
        throw new Error("Moderator access required");
    }
    const { queueId } = request.data;
    const db = (0, firestore_1.getFirestore)();
    const itemDoc = await db.collection("moderation_queue").doc(queueId).get();
    if (!itemDoc.exists) {
        throw new Error("Queue item not found");
    }
    const item = itemDoc.data();
    item.sla = calculateSLA(item.priority, item.createdAt);
    // Get similar cases for reference
    const similarCases = await findSimilarCasesV1(item.contentType, item.aiAnalysis.flags, 5);
    // Detect user patterns
    const userPattern = await detectUserPatternsV1(item.userId);
    return {
        item,
        similarCases,
        userPattern,
    };
});
/**
 * Claim queue item for review
 *
 * @endpoint claimQueueItemV1
 * @auth moderator
 */
exports.claimQueueItemV1 = (0, https_1.onCall)({
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
}, async (request) => {
    const moderatorId = request.auth?.uid;
    if (!moderatorId) {
        throw new Error("Authentication required");
    }
    const isModerator = await checkModeratorPermission(moderatorId);
    if (!isModerator) {
        throw new Error("Moderator access required");
    }
    const { queueId } = request.data;
    const db = (0, firestore_1.getFirestore)();
    const itemDoc = await db.collection("moderation_queue").doc(queueId).get();
    if (!itemDoc.exists) {
        throw new Error("Queue item not found");
    }
    const item = itemDoc.data();
    // Check if already assigned
    if (item.assignedTo && item.assignedTo !== moderatorId) {
        throw new Error("Already assigned to another moderator");
    }
    // Claim the item
    await itemDoc.ref.update({
        assignedTo: moderatorId,
        assignedAt: firestore_1.FieldValue.serverTimestamp(),
        status: QueueItemStatus.IN_REVIEW,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    const updatedItem = (await itemDoc.ref.get()).data();
    updatedItem.sla = calculateSLA(updatedItem.priority, updatedItem.createdAt);
    v2_1.logger.info(`Moderator ${moderatorId} claimed queue item ${queueId}`);
    return { success: true, item: updatedItem };
});
/**
 * Resolve queue item with decision
 *
 * @endpoint resolveQueueItemV1
 * @auth moderator
 */
exports.resolveQueueItemV1 = (0, https_1.onCall)({
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
}, async (request) => {
    const moderatorId = request.auth?.uid;
    if (!moderatorId) {
        throw new Error("Authentication required");
    }
    const isModerator = await checkModeratorPermission(moderatorId);
    if (!isModerator) {
        throw new Error("Moderator access required");
    }
    const { queueId, action, reason, notes, durationDays } = request.data;
    const db = (0, firestore_1.getFirestore)();
    const itemDoc = await db.collection("moderation_queue").doc(queueId).get();
    if (!itemDoc.exists) {
        throw new Error("Queue item not found");
    }
    const item = itemDoc.data();
    // Update queue item
    await itemDoc.ref.update({
        status: QueueItemStatus.RESOLVED,
        resolvedBy: moderatorId,
        resolvedAt: firestore_1.FieldValue.serverTimestamp(),
        resolution: {
            action,
            reason,
            notes,
            durationDays,
        },
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    // Execute the moderation action
    await executeModerationActionV1(item, action, moderatorId, durationDays);
    // Update moderator stats
    await updateModeratorStatsV1(moderatorId, item);
    v2_1.logger.info(`Moderator ${moderatorId} resolved ${queueId} with action: ${action}`);
    return { success: true };
});
/**
 * Execute moderation action on content/user
 */
async function executeModerationActionV1(item, action, moderatorId, durationDays) {
    const db = (0, firestore_1.getFirestore)();
    // Log action
    await db.collection("moderation_actions").add({
        queueId: item.queueId,
        contentId: item.contentId,
        userId: item.userId,
        action,
        moderatorId,
        durationDays,
        timestamp: firestore_1.FieldValue.serverTimestamp(),
    });
    switch (action) {
        case ModeratorAction.APPROVE:
            // No action needed
            break;
        case ModeratorAction.WARN:
            // Send warning to user
            await db.collection("user_warnings").add({
                userId: item.userId,
                reason: item.resolution?.reason,
                contentId: item.contentId,
                moderatorId,
                timestamp: firestore_1.FieldValue.serverTimestamp(),
            });
            break;
        case ModeratorAction.REMOVE_CONTENT:
            // Mark content as removed
            if (item.contentType === "message") {
                await db.collection("messages").doc(item.contentId).update({
                    deleted: true,
                    deletedBy: moderatorId,
                    deletedAt: firestore_1.FieldValue.serverTimestamp(),
                    deletionReason: item.resolution?.reason,
                });
            }
            break;
        case ModeratorAction.SUSPEND_USER:
            // Suspend user account
            const suspendUntil = firestore_1.Timestamp.fromMillis(Date.now() + (durationDays || 7) * 24 * 60 * 60 * 1000);
            await db.collection("users").doc(item.userId).update({
                accountStatus: "suspended",
                suspendedUntil: suspendUntil,
                suspendedBy: moderatorId,
                suspensionReason: item.resolution?.reason,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            break;
        case ModeratorAction.BAN_USER:
            // Ban user permanently
            await db.collection("users").doc(item.userId).update({
                accountStatus: "banned",
                bannedBy: moderatorId,
                bannedAt: firestore_1.FieldValue.serverTimestamp(),
                banReason: item.resolution?.reason,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            break;
        case ModeratorAction.ESCALATE:
            // Escalate to senior moderator
            await db.collection("moderation_queue").doc(item.queueId).update({
                status: QueueItemStatus.ESCALATED,
                priority: Priority.CRITICAL,
                assignedTo: null, // Unassign for senior mod assignment
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            break;
    }
}
/**
 * Update moderator performance stats
 */
async function updateModeratorStatsV1(moderatorId, item) {
    const db = (0, firestore_1.getFirestore)();
    const statsRef = db.collection("moderator_stats").doc(moderatorId);
    const reviewTime = item.assignedAt
        ? (Date.now() - item.assignedAt.toMillis()) / (1000 * 60) // minutes
        : 0;
    await statsRef.set({
        moderatorId,
        totalReviewed: firestore_1.FieldValue.increment(1),
        avgReviewTime: reviewTime, // Would need proper calculation
        lastActiveAt: firestore_1.FieldValue.serverTimestamp(),
        criticalHandled: item.priority === Priority.CRITICAL ? firestore_1.FieldValue.increment(1) : firestore_1.FieldValue.increment(0),
    }, { merge: true });
}
/**
 * Get moderator performance stats
 *
 * @endpoint getModeratorStatsV1
 * @auth moderator/admin
 */
exports.getModeratorStatsV1 = (0, https_1.onCall)({
    region: "europe-west3",
    cors: true,
    enforceAppCheck: true,
}, async (request) => {
    const callerId = request.auth?.uid;
    if (!callerId) {
        throw new Error("Authentication required");
    }
    const db = (0, firestore_1.getFirestore)();
    const moderatorId = request.data.moderatorId || callerId;
    const days = request.data.days || 30;
    // Check permission (can view own stats or admin can view all)
    if (moderatorId !== callerId) {
        const callerDoc = await db.collection("users").doc(callerId).get();
        if (callerDoc.data()?.role !== "admin") {
            throw new Error("Admin access required to view other moderator stats");
        }
    }
    const statsDoc = await db.collection("moderator_stats").doc(moderatorId).get();
    const stats = statsDoc.exists ? statsDoc.data() : null;
    if (!stats) {
        return {
            moderatorId,
            totalReviewed: 0,
            avgReviewTime: 0,
            accuracyScore: 0,
            avgResolutionTime: 0,
            criticalHandled: 0,
            overdueCases: 0,
            appealsOverturned: 0,
            lastActiveAt: firestore_1.Timestamp.now(),
        };
    }
    return stats;
});
/**
 * Schedule: Auto-assign pending items to available moderators
 */
exports.autoAssignQueueItemsScheduler = (0, scheduler_1.onSchedule)({
    schedule: "every 5 minutes",
    region: "europe-west3",
    timeoutSeconds: 120,
}, async () => {
    const db = (0, firestore_1.getFirestore)();
    v2_1.logger.info("Auto-assigning pending queue items");
    // Get unassigned pending items
    const pendingItems = await db
        .collection("moderation_queue")
        .where("status", "==", QueueItemStatus.PENDING)
        .where("assignedTo", "==", null)
        .orderBy("priority", "desc")
        .limit(20)
        .get();
    let assigned = 0;
    for (const itemDoc of pendingItems.docs) {
        const moderatorId = await autoAssignToModeratorV1(itemDoc.id);
        if (moderatorId) {
            assigned++;
        }
    }
    v2_1.logger.info(`Auto-assigned ${assigned} queue items`);
});
/**
 * Schedule: Alert on SLA breaches
 */
exports.checkSLABreachesScheduler = (0, scheduler_1.onSchedule)({
    schedule: "every 30 minutes",
    region: "europe-west3",
    timeoutSeconds: 60,
}, async () => {
    const db = (0, firestore_1.getFirestore)();
    v2_1.logger.info("Checking for SLA breaches");
    const activeItems = await db
        .collection("moderation_queue")
        .where("status", "in", [QueueItemStatus.PENDING, QueueItemStatus.IN_REVIEW])
        .get();
    const overdueItems = activeItems.docs.filter((doc) => {
        const item = doc.data();
        const sla = calculateSLA(item.priority, item.createdAt);
        return sla.isOverdue;
    });
    if (overdueItems.length > 0) {
        v2_1.logger.warn(`⚠️ ${overdueItems.length} queue items are overdue SLA`);
        // TODO: Send alert to Slack/email
    }
});
//# sourceMappingURL=modHub.js.map