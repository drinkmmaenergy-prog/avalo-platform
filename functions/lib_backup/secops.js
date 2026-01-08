"use strict";
/**
 * PHASE 22 - Avalo Security Operations Center (ASOC)
 *
 * Proactive security monitoring and incident response:
 * - Anomaly detection (unusual token drain, chat spikes, etc.)
 * - Alert rules and thresholds
 * - Incident logging and tracking
 * - Security metrics dashboards
 *
 * Region: europe-west3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSecurityIncidentV1 = exports.getSecurityIncidentsV1 = exports.securityMonitoringScheduler = exports.IncidentType = exports.IncidentSeverity = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
const zod_1 = require("zod");
const db = (0, firestore_1.getFirestore)();
/**
 * Security incident severity levels
 */
var IncidentSeverity;
(function (IncidentSeverity) {
    IncidentSeverity["LOW"] = "low";
    IncidentSeverity["MEDIUM"] = "medium";
    IncidentSeverity["HIGH"] = "high";
    IncidentSeverity["CRITICAL"] = "critical";
})(IncidentSeverity || (exports.IncidentSeverity = IncidentSeverity = {}));
/**
 * Security incident types
 */
var IncidentType;
(function (IncidentType) {
    // Account anomalies
    IncidentType["UNUSUAL_TOKEN_DRAIN"] = "unusual_token_drain";
    IncidentType["RAPID_ACCOUNT_CREATION"] = "rapid_account_creation";
    IncidentType["ACCOUNT_TAKEOVER_ATTEMPT"] = "account_takeover_attempt";
    // Transaction anomalies
    IncidentType["LARGE_TRANSACTION"] = "large_transaction";
    IncidentType["UNUSUAL_PURCHASE_PATTERN"] = "unusual_purchase_pattern";
    IncidentType["CHARGEBACK_FRAUD"] = "chargeback_fraud";
    // Content anomalies
    IncidentType["SPAM_WAVE"] = "spam_wave";
    IncidentType["CONTENT_FLOOD"] = "content_flood";
    IncidentType["MALICIOUS_LINK_DETECTED"] = "malicious_link_detected";
    // System anomalies
    IncidentType["API_ABUSE"] = "api_abuse";
    IncidentType["DDOS_ATTEMPT"] = "ddos_attempt";
    IncidentType["UNAUTHORIZED_ACCESS_ATTEMPT"] = "unauthorized_access_attempt";
    // Manual reports
    IncidentType["MANUAL_INVESTIGATION"] = "manual_investigation";
})(IncidentType || (exports.IncidentType = IncidentType = {}));
/**
 * Security metrics thresholds
 */
const THRESHOLDS = {
    // Token drain
    TOKENS_PER_HOUR_MAX: 10000,
    TOKENS_PER_USER_HOUR_MAX: 1000,
    // Account creation
    NEW_ACCOUNTS_PER_HOUR_MAX: 50,
    NEW_ACCOUNTS_PER_IP_HOUR_MAX: 5,
    // Transactions
    LARGE_TRANSACTION_AMOUNT: 5000, // tokens
    TRANSACTIONS_PER_USER_HOUR_MAX: 20,
    // Content
    POSTS_PER_USER_HOUR_MAX: 10,
    REPORTS_PER_HOUR_MAX: 20,
    // API
    API_CALLS_PER_IP_MINUTE_MAX: 100,
    FAILED_AUTH_PER_IP_HOUR_MAX: 10,
};
/**
 * Security monitoring scheduler
 * Runs every 5 minutes to detect anomalies
 */
exports.securityMonitoringScheduler = (0, scheduler_1.onSchedule)({
    schedule: "*/5 * * * *", // Every 5 minutes
    region: "europe-west3",
    timeoutSeconds: 300,
}, async (event) => {
    v2_1.logger.info("Security monitoring started");
    try {
        const now = Date.now();
        const oneHourAgo = now - 60 * 60 * 1000;
        // Run all anomaly detections in parallel
        await Promise.all([
            detectUnusualTokenDrain(oneHourAgo, now),
            detectRapidAccountCreation(oneHourAgo, now),
            detectLargeTransactions(oneHourAgo, now),
            detectContentFlood(oneHourAgo, now),
            detectAPIAbuse(oneHourAgo, now),
        ]);
        v2_1.logger.info("Security monitoring completed");
        // Log metrics
        await logSecurityMetrics();
    }
    catch (error) {
        v2_1.logger.error("Security monitoring failed:", error);
        throw error;
    }
});
/**
 * Detect unusual token drain
 * Alert if tokens are being drained faster than normal
 */
async function detectUnusualTokenDrain(startTime, endTime) {
    try {
        const startTimestamp = firestore_1.Timestamp.fromMillis(startTime);
        // Query transactions in the time window
        const transactionsSnapshot = await db
            .collection("transactions")
            .where("createdAt", ">=", startTimestamp)
            .where("amount", "<", 0) // Negative = spending
            .limit(10000)
            .get();
        let totalDrained = 0;
        const userDrainMap = new Map();
        transactionsSnapshot.docs.forEach((doc) => {
            const data = doc.data();
            const amount = Math.abs(data.amount || 0);
            totalDrained += amount;
            const userId = data.userId;
            userDrainMap.set(userId, (userDrainMap.get(userId) || 0) + amount);
        });
        // Check system-wide threshold
        if (totalDrained > THRESHOLDS.TOKENS_PER_HOUR_MAX) {
            await createSecurityIncident({
                type: IncidentType.UNUSUAL_TOKEN_DRAIN,
                severity: IncidentSeverity.HIGH,
                description: `Unusual token drain detected: ${totalDrained} tokens in 1 hour`,
                metrics: {
                    totalTokensDrained: totalDrained,
                    threshold: THRESHOLDS.TOKENS_PER_HOUR_MAX,
                    transactionCount: transactionsSnapshot.size,
                },
                evidence: [],
                detectionMethod: "automated",
            });
        }
        // Check per-user threshold
        const suspiciousUsers = [];
        userDrainMap.forEach((amount, userId) => {
            if (amount > THRESHOLDS.TOKENS_PER_USER_HOUR_MAX) {
                suspiciousUsers.push(userId);
            }
        });
        if (suspiciousUsers.length > 0) {
            await createSecurityIncident({
                type: IncidentType.UNUSUAL_TOKEN_DRAIN,
                severity: IncidentSeverity.MEDIUM,
                description: `${suspiciousUsers.length} users with unusual token drain`,
                affectedUserIds: suspiciousUsers,
                metrics: {
                    userCount: suspiciousUsers.length,
                    threshold: THRESHOLDS.TOKENS_PER_USER_HOUR_MAX,
                },
                evidence: suspiciousUsers.map((uid) => ({
                    userId: uid,
                    amount: userDrainMap.get(uid),
                })),
                detectionMethod: "automated",
            });
        }
    }
    catch (error) {
        v2_1.logger.error("Token drain detection failed:", error);
    }
}
/**
 * Detect rapid account creation (potential bot activity)
 */
async function detectRapidAccountCreation(startTime, endTime) {
    try {
        const startTimestamp = firestore_1.Timestamp.fromMillis(startTime);
        const newUsersSnapshot = await db
            .collection("users")
            .where("createdAt", ">=", startTimestamp)
            .limit(1000)
            .get();
        const accountCount = newUsersSnapshot.size;
        // Check threshold
        if (accountCount > THRESHOLDS.NEW_ACCOUNTS_PER_HOUR_MAX) {
            // Group by IP to detect coordinated creation
            const ipMap = new Map();
            newUsersSnapshot.docs.forEach((doc) => {
                const data = doc.data();
                const ip = data.registrationIP || "unknown";
                ipMap.set(ip, (ipMap.get(ip) || 0) + 1);
            });
            // Find suspicious IPs
            const suspiciousIPs = Array.from(ipMap.entries())
                .filter(([_, count]) => count > THRESHOLDS.NEW_ACCOUNTS_PER_IP_HOUR_MAX)
                .map(([ip]) => ip);
            await createSecurityIncident({
                type: IncidentType.RAPID_ACCOUNT_CREATION,
                severity: IncidentSeverity.HIGH,
                description: `Rapid account creation detected: ${accountCount} accounts in 1 hour`,
                affectedIPs: suspiciousIPs,
                metrics: {
                    totalAccounts: accountCount,
                    threshold: THRESHOLDS.NEW_ACCOUNTS_PER_HOUR_MAX,
                    suspiciousIPCount: suspiciousIPs.length,
                },
                evidence: Array.from(ipMap.entries())
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 10)
                    .map(([ip, count]) => ({ ip, count })),
                detectionMethod: "automated",
            });
        }
    }
    catch (error) {
        v2_1.logger.error("Account creation detection failed:", error);
    }
}
/**
 * Detect large transactions
 */
async function detectLargeTransactions(startTime, endTime) {
    try {
        const startTimestamp = firestore_1.Timestamp.fromMillis(startTime);
        const largeTransactionsSnapshot = await db
            .collection("transactions")
            .where("createdAt", ">=", startTimestamp)
            .limit(1000)
            .get();
        const largeTransactions = largeTransactionsSnapshot.docs
            .map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }))
            .filter((tx) => Math.abs(tx.amount) > THRESHOLDS.LARGE_TRANSACTION_AMOUNT);
        if (largeTransactions.length > 0) {
            await createSecurityIncident({
                type: IncidentType.LARGE_TRANSACTION,
                severity: IncidentSeverity.MEDIUM,
                description: `${largeTransactions.length} large transactions detected`,
                affectedUserIds: largeTransactions.map((tx) => tx.userId),
                metrics: {
                    transactionCount: largeTransactions.length,
                    threshold: THRESHOLDS.LARGE_TRANSACTION_AMOUNT,
                    totalAmount: largeTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
                },
                evidence: largeTransactions.slice(0, 10),
                detectionMethod: "automated",
            });
        }
    }
    catch (error) {
        v2_1.logger.error("Large transaction detection failed:", error);
    }
}
/**
 * Detect content flood (spam wave)
 */
async function detectContentFlood(startTime, endTime) {
    try {
        const startTimestamp = firestore_1.Timestamp.fromMillis(startTime);
        const postsSnapshot = await db
            .collection("posts")
            .where("createdAt", ">=", startTimestamp)
            .limit(1000)
            .get();
        // Group by user
        const userPostCount = new Map();
        postsSnapshot.docs.forEach((doc) => {
            const userId = doc.data().userId;
            userPostCount.set(userId, (userPostCount.get(userId) || 0) + 1);
        });
        // Find users posting excessively
        const flooders = Array.from(userPostCount.entries())
            .filter(([_, count]) => count > THRESHOLDS.POSTS_PER_USER_HOUR_MAX)
            .map(([userId]) => userId);
        if (flooders.length > 0) {
            await createSecurityIncident({
                type: IncidentType.CONTENT_FLOOD,
                severity: IncidentSeverity.MEDIUM,
                description: `Content flood detected: ${flooders.length} users posting excessively`,
                affectedUserIds: flooders,
                metrics: {
                    userCount: flooders.length,
                    threshold: THRESHOLDS.POSTS_PER_USER_HOUR_MAX,
                },
                evidence: flooders.map((userId) => ({
                    userId,
                    postCount: userPostCount.get(userId),
                })),
                detectionMethod: "automated",
            });
        }
    }
    catch (error) {
        v2_1.logger.error("Content flood detection failed:", error);
    }
}
/**
 * Detect API abuse
 */
async function detectAPIAbuse(startTime, endTime) {
    try {
        // Query rate limit violations from the past hour
        const today = new Date().toISOString().split("T")[0];
        const logsDoc = await db
            .collection("engineLogs")
            .doc("secops")
            .collection(today)
            .doc("rateLimits")
            .get();
        if (!logsDoc.exists)
            return;
        const violations = logsDoc.data()?.violations || [];
        // Filter to time window
        const recentViolations = violations.filter((v) => {
            const timestamp = new Date(v.timestamp).getTime();
            return timestamp >= startTime && timestamp <= endTime;
        });
        // Group by identifier (user or IP)
        const violationsByIdentifier = new Map();
        recentViolations.forEach((v) => {
            violationsByIdentifier.set(v.identifier, (violationsByIdentifier.get(v.identifier) || 0) + 1);
        });
        // Find severe abusers (10+ violations in 1 hour)
        const severeAbusers = Array.from(violationsByIdentifier.entries())
            .filter(([_, count]) => count >= 10)
            .map(([identifier]) => identifier);
        if (severeAbusers.length > 0) {
            await createSecurityIncident({
                type: IncidentType.API_ABUSE,
                severity: IncidentSeverity.HIGH,
                description: `API abuse detected: ${severeAbusers.length} identifiers with excessive rate limit violations`,
                affectedUserIds: severeAbusers.filter((id) => !id.startsWith("ip:")),
                affectedIPs: severeAbusers.filter((id) => id.startsWith("ip:")).map((id) => id.replace("ip:", "")),
                metrics: {
                    violationCount: recentViolations.length,
                    severeAbuserCount: severeAbusers.length,
                },
                evidence: severeAbusers.map((identifier) => ({
                    identifier,
                    violationCount: violationsByIdentifier.get(identifier),
                })),
                detectionMethod: "automated",
            });
        }
    }
    catch (error) {
        v2_1.logger.error("API abuse detection failed:", error);
    }
}
/**
 * Create security incident
 */
async function createSecurityIncident(incidentData) {
    try {
        // Check for duplicate incidents (within last hour)
        const oneHourAgo = firestore_1.Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);
        const duplicateCheck = await db
            .collection("securityIncidents")
            .where("type", "==", incidentData.type)
            .where("status", "in", ["open", "investigating"])
            .where("detectedAt", ">=", oneHourAgo)
            .limit(1)
            .get();
        if (!duplicateCheck.empty) {
            // Update existing incident
            const existingIncident = duplicateCheck.docs[0];
            await existingIncident.ref.update({
                lastOccurrenceAt: firestore_1.Timestamp.now(),
                metrics: incidentData.metrics,
            });
            v2_1.logger.info(`Updated existing incident: ${existingIncident.id}`);
            return existingIncident.id;
        }
        // Create new incident
        const incidentId = `incident_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;
        const incident = {
            incidentId,
            type: incidentData.type,
            severity: incidentData.severity,
            status: "open",
            description: incidentData.description,
            metrics: incidentData.metrics || {},
            evidence: incidentData.evidence || [],
            affectedUserIds: incidentData.affectedUserIds || [],
            affectedDeviceIds: incidentData.affectedDeviceIds || [],
            affectedIPs: incidentData.affectedIPs || [],
            detectedAt: firestore_1.Timestamp.now(),
            firstOccurrenceAt: firestore_1.Timestamp.now(),
            lastOccurrenceAt: firestore_1.Timestamp.now(),
            detectionMethod: incidentData.detectionMethod || "automated",
            falsePositive: false,
        };
        await db.collection("securityIncidents").doc(incidentId).set(incident);
        v2_1.logger.warn(`Security incident created: ${incidentId} - ${incident.type}`, {
            severity: incident.severity,
            description: incident.description,
        });
        // Log to engineLogs
        const today = new Date().toISOString().split("T")[0];
        await db
            .collection("engineLogs")
            .doc("secops")
            .collection(today)
            .doc("incidents")
            .set({
            incidents: firestore_1.FieldValue.arrayUnion({
                incidentId,
                type: incident.type,
                severity: incident.severity,
                timestamp: new Date().toISOString(),
            }),
        }, { merge: true });
        // TODO: Send alert to security team (email, Slack, PagerDuty)
        return incidentId;
    }
    catch (error) {
        v2_1.logger.error("Failed to create security incident:", error);
        throw error;
    }
}
/**
 * Get security incidents (admin only)
 */
exports.getSecurityIncidentsV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const adminUid = request.auth?.uid;
    if (!adminUid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check admin role
    const adminDoc = await db.collection("users").doc(adminUid).get();
    if (!adminDoc.data()?.role ||
        !["admin", "moderator"].includes(adminDoc.data()?.role)) {
        throw new https_1.HttpsError("permission-denied", "Admin access required");
    }
    const schema = zod_1.z.object({
        status: zod_1.z.enum(["open", "investigating", "resolved", "false_positive"]).optional(),
        severity: zod_1.z.nativeEnum(IncidentSeverity).optional(),
        limit: zod_1.z.number().min(1).max(100).default(50),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { status, severity, limit } = validationResult.data;
    let query = db
        .collection("securityIncidents")
        .orderBy("detectedAt", "desc")
        .limit(limit);
    if (status) {
        query = query.where("status", "==", status);
    }
    if (severity) {
        query = query.where("severity", "==", severity);
    }
    const incidentsSnapshot = await query.get();
    const incidents = incidentsSnapshot.docs.map((doc) => ({
        incidentId: doc.id,
        ...doc.data(),
    }));
    return { incidents, total: incidents.length };
});
/**
 * Update incident status (admin only)
 */
exports.updateSecurityIncidentV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const adminUid = request.auth?.uid;
    if (!adminUid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check admin role
    const adminDoc = await db.collection("users").doc(adminUid).get();
    if (!adminDoc.data()?.role ||
        !["admin", "moderator"].includes(adminDoc.data()?.role)) {
        throw new https_1.HttpsError("permission-denied", "Admin access required");
    }
    const schema = zod_1.z.object({
        incidentId: zod_1.z.string(),
        status: zod_1.z.enum(["investigating", "resolved", "false_positive"]),
        resolutionNotes: zod_1.z.string().optional(),
        actionsTaken: zod_1.z.array(zod_1.z.string()).optional(),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { incidentId, status, resolutionNotes, actionsTaken } = validationResult.data;
    const updateData = {
        status,
        assignedTo: adminUid,
        assignedAt: firestore_1.Timestamp.now(),
    };
    if (status === "resolved" || status === "false_positive") {
        updateData.resolvedBy = adminUid;
        updateData.resolvedAt = firestore_1.Timestamp.now();
        updateData.resolutionNotes = resolutionNotes || "";
        updateData.actionsTaken = actionsTaken || [];
        updateData.falsePositive = status === "false_positive";
    }
    await db.collection("securityIncidents").doc(incidentId).update(updateData);
    v2_1.logger.info(`Incident ${incidentId} updated to ${status} by ${adminUid}`);
    return { success: true };
});
/**
 * Log security metrics
 */
async function logSecurityMetrics() {
    try {
        const today = new Date().toISOString().split("T")[0];
        // Count open incidents by severity
        const openIncidentsSnapshot = await db
            .collection("securityIncidents")
            .where("status", "in", ["open", "investigating"])
            .get();
        const severityCounts = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
        };
        openIncidentsSnapshot.docs.forEach((doc) => {
            const severity = doc.data().severity;
            severityCounts[severity]++;
        });
        await db
            .collection("engineLogs")
            .doc("secops")
            .collection(today)
            .doc("metrics")
            .set({
            [new Date().toISOString()]: {
                openIncidents: openIncidentsSnapshot.size,
                severityCounts,
            },
        }, { merge: true });
    }
    catch (error) {
        v2_1.logger.error("Failed to log security metrics:", error);
    }
}
//# sourceMappingURL=secops.js.map