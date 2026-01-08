"use strict";
/**
 * Compliance & Audit Engine - Phase 17
 *
 * Audit logging and AML (Anti-Money Laundering) detection:
 * - Action logging for all admin/moderator actions
 * - Audit report generation
 * - AML pattern detection (structuring, circular transfers, etc.)
 *
 * ⚠️ FLAG ONLY — NO TRANSACTION BLOCKING
 * This engine NEVER blocks transactions, only flags for review
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectAMLPatternsScheduler = exports.generateAuditReportCallable = void 0;
exports.logAction = logAction;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const zod_1 = require("zod");
const db = (0, firestore_1.getFirestore)();
/**
 * Log action
 * Called by other functions when admin/moderator actions occur
 */
async function logAction(actor, action, resource, metadata = {}) {
    const logRef = db.collection("auditLogs").doc();
    const log = {
        logId: logRef.id,
        actor,
        action,
        resource,
        metadata,
        timestamp: firestore_1.FieldValue.serverTimestamp(),
    };
    await logRef.set(log);
    // Log to engine logs
    await logEngineEvent("complianceEngine", "action_logged", {
        actor,
        action,
        resource,
    });
}
/**
 * Generate audit report callable (admin only)
 */
const GenerateAuditReportSchema = zod_1.z.object({
    startDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    actorId: zod_1.z.string().optional(),
    actionType: zod_1.z.string().optional(),
});
exports.generateAuditReportCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check if user is admin
    const userDoc = await db.collection("users").doc(uid).get();
    const roles = userDoc.data()?.roles || {};
    if (!roles.admin) {
        throw new https_1.HttpsError("permission-denied", "Only admins can generate audit reports");
    }
    // Validate input
    const validationResult = GenerateAuditReportSchema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { startDate, endDate, actorId, actionType } = validationResult.data;
    try {
        const startTimestamp = firestore_1.Timestamp.fromDate(new Date(`${startDate}T00:00:00Z`));
        const endTimestamp = firestore_1.Timestamp.fromDate(new Date(`${endDate}T23:59:59Z`));
        // Query audit logs
        let query = db
            .collection("auditLogs")
            .where("timestamp", ">=", startTimestamp)
            .where("timestamp", "<=", endTimestamp);
        if (actorId) {
            query = query.where("actor", "==", actorId);
        }
        if (actionType) {
            query = query.where("action", "==", actionType);
        }
        const logsSnapshot = await query.get();
        // Aggregate data
        const actionCounts = {};
        const actorCounts = {};
        const resourceCounts = {};
        const anomalies = [];
        logsSnapshot.docs.forEach((doc) => {
            const log = doc.data();
            // Count by action
            actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
            // Count by actor
            actorCounts[log.actor] = (actorCounts[log.actor] || 0) + 1;
            // Count by resource type
            const resourceType = log.resource.split(":")[0];
            resourceCounts[resourceType] = (resourceCounts[resourceType] || 0) + 1;
            // Detect anomalies (e.g., >100 actions by single actor in period)
            if (actorCounts[log.actor] > 100) {
                anomalies.push({
                    type: "high_activity",
                    actor: log.actor,
                    count: actorCounts[log.actor],
                });
            }
        });
        const report = {
            periodStart: startDate,
            periodEnd: endDate,
            totalActions: logsSnapshot.size,
            actionCounts,
            actorCounts,
            resourceCounts,
            anomalies: Array.from(new Set(anomalies.map((a) => JSON.stringify(a)))).map((a) => JSON.parse(a)),
            generatedAt: new Date().toISOString(),
            generatedBy: uid,
        };
        // Log to engine logs
        await logEngineEvent("complianceEngine", "audit_report_generated", {
            periodStart: startDate,
            periodEnd: endDate,
            totalActions: logsSnapshot.size,
        });
        return {
            success: true,
            report,
        };
    }
    catch (error) {
        console.error("Error generating audit report:", error);
        throw new https_1.HttpsError("internal", `Failed to generate audit report: ${error.message}`);
    }
});
/**
 * Detect AML patterns scheduler
 * Runs daily at 2:00 AM UTC
 *
 * ⚠️ FLAG ONLY — NO TRANSACTION BLOCKING
 */
exports.detectAMLPatternsScheduler = (0, scheduler_1.onSchedule)({
    schedule: "0 2 * * *", // Daily at 2 AM UTC
    region: "europe-west3",
    timeoutSeconds: 540,
}, async (event) => {
    console.log("Detecting AML patterns...");
    try {
        // Get all users
        const usersSnapshot = await db.collection("users").limit(1000).get();
        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            // Check for structuring (multiple small transactions to avoid detection)
            await detectStructuring(userId);
            // Check for circular transfers (A → B → C → A)
            await detectCircularTransfers(userId);
            // Check for frequent refunds (potential fraud)
            await detectFrequentRefunds(userId);
            // Check for high volume (unusually high transaction volume)
            await detectHighVolume(userId);
            // Check for rapid churn (quick deposit and withdrawal)
            await detectRapidChurn(userId);
        }
        console.log("AML pattern detection complete");
        // Log to engine logs
        await logEngineEvent("complianceEngine", "aml_detection_completed", {
            usersScanned: usersSnapshot.size,
        });
    }
    catch (error) {
        console.error("Error in detectAMLPatternsScheduler:", error);
    }
});
/**
 * Detect structuring (many small transactions)
 * ⚠️ FLAG ONLY — NO TRANSACTION BLOCKING
 */
async function detectStructuring(userId) {
    const twentyFourHoursAgo = firestore_1.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    const txSnapshot = await db
        .collection("transactions")
        .where("uid", "==", userId)
        .where("createdAt", ">", twentyFourHoursAgo)
        .where("amount", ">", 0) // Only purchases
        .get();
    if (txSnapshot.size < 5)
        return; // Need at least 5 transactions
    const transactions = txSnapshot.docs.map((doc) => ({
        id: doc.id,
        amount: doc.data().amount,
    }));
    const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    const avgAmount = totalAmount / transactions.length;
    // Flag if many small transactions (structuring pattern)
    if (transactions.length >= 10 && avgAmount < 100 && totalAmount > 500) {
        await createAMLFlag({
            userId,
            flagType: "structuring",
            severity: "medium",
            details: `${transactions.length} small transactions totaling ${totalAmount} tokens in 24h`,
            relatedTransactions: transactions.map((tx) => tx.id),
            amount: totalAmount,
        });
    }
}
/**
 * Detect circular transfers
 * ⚠️ FLAG ONLY — NO TRANSACTION BLOCKING
 */
async function detectCircularTransfers(userId) {
    const sevenDaysAgo = firestore_1.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
    // Query sent transactions
    const sentSnapshot = await db
        .collection("transactions")
        .where("uid", "==", userId)
        .where("createdAt", ">", sevenDaysAgo)
        .where("amount", "<", 0) // Outgoing
        .get();
    // Query received transactions
    const receivedSnapshot = await db
        .collection("transactions")
        .where("recipientId", "==", userId)
        .where("createdAt", ">", sevenDaysAgo)
        .where("amount", ">", 0) // Incoming
        .get();
    const sentTo = new Set(sentSnapshot.docs.map((doc) => doc.data().recipientId).filter(Boolean));
    const receivedFrom = new Set(receivedSnapshot.docs.map((doc) => doc.data().uid).filter(Boolean));
    // Check for users in both sets (circular pattern)
    const circular = [...sentTo].filter((id) => receivedFrom.has(id));
    if (circular.length >= 2) {
        const relatedTxIds = [
            ...sentSnapshot.docs.map((doc) => doc.id),
            ...receivedSnapshot.docs.map((doc) => doc.id),
        ];
        await createAMLFlag({
            userId,
            flagType: "circular_transfer",
            severity: "high",
            details: `Circular transfers detected with ${circular.length} users`,
            relatedTransactions: relatedTxIds,
            amount: 0,
        });
    }
}
/**
 * Detect frequent refunds
 * ⚠️ FLAG ONLY — NO TRANSACTION BLOCKING
 */
async function detectFrequentRefunds(userId) {
    const thirtyDaysAgo = firestore_1.Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const refundSnapshot = await db
        .collection("transactions")
        .where("uid", "==", userId)
        .where("type", "==", "refund")
        .where("createdAt", ">", thirtyDaysAgo)
        .get();
    if (refundSnapshot.size >= 5) {
        const relatedTxIds = refundSnapshot.docs.map((doc) => doc.id);
        const totalRefunded = refundSnapshot.docs.reduce((sum, doc) => sum + Math.abs(doc.data().amount), 0);
        await createAMLFlag({
            userId,
            flagType: "frequent_refunds",
            severity: "medium",
            details: `${refundSnapshot.size} refunds in 30 days, total: ${totalRefunded} tokens`,
            relatedTransactions: relatedTxIds,
            amount: totalRefunded,
        });
    }
}
/**
 * Detect high volume
 * ⚠️ FLAG ONLY — NO TRANSACTION BLOCKING
 */
async function detectHighVolume(userId) {
    const sevenDaysAgo = firestore_1.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const txSnapshot = await db
        .collection("transactions")
        .where("uid", "==", userId)
        .where("createdAt", ">", sevenDaysAgo)
        .get();
    if (txSnapshot.size < 50)
        return; // Normal activity
    const totalVolume = txSnapshot.docs.reduce((sum, doc) => sum + Math.abs(doc.data().amount), 0);
    // Flag if >10,000 tokens in 7 days
    if (totalVolume > 10000) {
        const relatedTxIds = txSnapshot.docs.map((doc) => doc.id);
        await createAMLFlag({
            userId,
            flagType: "high_volume",
            severity: "low",
            details: `High volume: ${totalVolume} tokens in 7 days across ${txSnapshot.size} transactions`,
            relatedTransactions: relatedTxIds,
            amount: totalVolume,
        });
    }
}
/**
 * Detect rapid churn
 * ⚠️ FLAG ONLY — NO TRANSACTION BLOCKING
 */
async function detectRapidChurn(userId) {
    const twentyFourHoursAgo = firestore_1.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    const txSnapshot = await db
        .collection("transactions")
        .where("uid", "==", userId)
        .where("createdAt", ">", twentyFourHoursAgo)
        .get();
    let deposits = 0;
    let withdrawals = 0;
    txSnapshot.docs.forEach((doc) => {
        const amount = doc.data().amount;
        if (amount > 0)
            deposits += amount;
        else
            withdrawals += Math.abs(amount);
    });
    // Flag if deposited and withdrawn >1000 tokens in 24h
    if (deposits > 1000 && withdrawals > 1000) {
        const relatedTxIds = txSnapshot.docs.map((doc) => doc.id);
        await createAMLFlag({
            userId,
            flagType: "rapid_churn",
            severity: "high",
            details: `Rapid churn: deposited ${deposits}, withdrew ${withdrawals} in 24h`,
            relatedTransactions: relatedTxIds,
            amount: deposits + withdrawals,
        });
    }
}
/**
 * Create AML flag
 * ⚠️ FLAG ONLY — NO TRANSACTION BLOCKING
 */
async function createAMLFlag(params) {
    // Check if flag already exists for this user and type in last 7 days
    const sevenDaysAgo = firestore_1.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const existingFlagSnapshot = await db
        .collection("amlFlags")
        .where("userId", "==", params.userId)
        .where("flagType", "==", params.flagType)
        .where("detectedAt", ">", sevenDaysAgo)
        .limit(1)
        .get();
    if (!existingFlagSnapshot.empty) {
        console.log(`AML flag already exists for user ${params.userId} (type: ${params.flagType})`);
        return;
    }
    const flagRef = db.collection("amlFlags").doc();
    const flag = {
        flagId: flagRef.id,
        userId: params.userId,
        flagType: params.flagType,
        severity: params.severity,
        details: params.details,
        relatedTransactions: params.relatedTransactions,
        amount: params.amount,
        detectedAt: firestore_1.FieldValue.serverTimestamp(),
        reviewed: false,
    };
    await flagRef.set(flag);
    console.log(`AML flag created: ${params.flagType} for user ${params.userId}`);
    // Log to engine logs
    await logEngineEvent("complianceEngine", "aml_flag_created", {
        userId: params.userId,
        flagType: params.flagType,
        severity: params.severity,
        amount: params.amount,
    });
}
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
//# sourceMappingURL=complianceEngine.js.map