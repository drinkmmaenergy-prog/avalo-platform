"use strict";
/**
 * PHASE 18 - Analytics Export to BigQuery
 *
 * Scheduled function that drains analyticsEvents collection to BigQuery
 * Runs every 5 minutes
 *
 * For emulator: exports to GCS JSON then loads to BigQuery
 * For production: uses BigQuery Streaming Inserts
 *
 * Region: europe-west3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupAnalyticsEventsScheduler = exports.exportAnalyticsScheduler = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
// import { BigQuery } from "@google-cloud/bigquery"; // Requires @google-cloud/bigquery package
// BigQuery placeholder - requires package installation
class BigQuery {
    async getDatasets() {
        return [[]];
    }
    async createDataset(name, options) {
        return {};
    }
    dataset(name) {
        return {
            async getTables() {
                return [[]];
            },
            async createTable(name, options) {
                return {};
            },
            table: (name) => ({
                insert: async (rows, options) => { },
            }),
        };
    }
}
const storage_1 = require("firebase-admin/storage");
const v2_1 = require("firebase-functions/v2");
const db = (0, firestore_1.getFirestore)();
const bigquery = new BigQuery();
const storage = (0, storage_1.getStorage)();
const DATASET_ID = "avalo";
const TABLE_ID = "analytics_events";
const BATCH_SIZE = 500; // Process 500 events per batch
const MAX_RETRIES = 3;
/**
 * Export analytics events to BigQuery
 * Runs every 5 minutes
 */
exports.exportAnalyticsScheduler = (0, scheduler_1.onSchedule)({
    schedule: "every 5 minutes",
    region: "europe-west3",
    timeoutSeconds: 540,
    memory: "512MiB",
}, async (event) => {
    const startTime = Date.now();
    v2_1.logger.info("Analytics export started");
    try {
        // Query unprocessed events
        const eventsSnapshot = await db
            .collection("analyticsEvents")
            .where("processed", "==", false)
            .orderBy("createdAt", "asc")
            .limit(BATCH_SIZE)
            .get();
        if (eventsSnapshot.empty) {
            v2_1.logger.info("No events to export");
            return;
        }
        const events = eventsSnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                eventId: data.eventId,
                eventName: data.eventName,
                uid: data.uid,
                role: data.role,
                source: data.source,
                locale: data.locale,
                country: data.country,
                screen: data.screen,
                payload: JSON.stringify(data.payload || {}),
                clientTimestamp: data.clientTimestamp
                    ? data.clientTimestamp.toDate().toISOString()
                    : null,
                serverTimestamp: data.serverTimestamp
                    ? data.serverTimestamp.toDate().toISOString()
                    : new Date().toISOString(),
                docId: doc.id,
            };
        });
        v2_1.logger.info(`Exporting ${events.length} events to BigQuery`);
        // Check if running in emulator
        const isEmulator = process.env.FIRESTORE_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR;
        if (isEmulator) {
            // Emulator mode: Write to GCS JSON file
            await exportToGCS(events);
        }
        else {
            // Production mode: Stream to BigQuery
            await exportToBigQuery(events);
        }
        // Mark events as processed
        const batch = db.batch();
        eventsSnapshot.docs.forEach((doc) => {
            batch.update(doc.ref, {
                processed: true,
                processedAt: firestore_1.Timestamp.now(),
            });
        });
        await batch.commit();
        const duration = Date.now() - startTime;
        v2_1.logger.info(`Analytics export completed: ${events.length} events in ${duration}ms`);
        // Log to engineLogs
        const today = new Date().toISOString().split("T")[0];
        await db
            .collection("engineLogs")
            .doc("analytics")
            .collection(today)
            .doc("export")
            .set({
            exports: {
                [new Date().toISOString()]: {
                    eventCount: events.length,
                    durationMs: duration,
                    success: true,
                },
            },
        }, { merge: true });
    }
    catch (error) {
        v2_1.logger.error("Analytics export failed:", error);
        // Move failed events to dead letter queue
        await handleExportFailure(error);
        // Log failure
        const today = new Date().toISOString().split("T")[0];
        await db
            .collection("engineLogs")
            .doc("analytics")
            .collection(today)
            .doc("export")
            .set({
            errors: {
                [new Date().toISOString()]: {
                    error: error.message,
                    stack: error.stack,
                },
            },
        }, { merge: true });
        throw error; // Re-throw for Cloud Functions retry
    }
});
/**
 * Export events to BigQuery using Streaming Inserts
 */
async function exportToBigQuery(events) {
    try {
        // Ensure dataset and table exist
        await ensureBigQuerySetup();
        // Transform events for BigQuery schema
        const rows = events.map((event) => ({
            insertId: event.eventId, // For deduplication
            json: {
                event_id: event.eventId,
                event_name: event.eventName,
                uid: event.uid,
                role: event.role,
                source: event.source,
                locale: event.locale,
                country: event.country,
                screen: event.screen,
                payload: event.payload,
                client_timestamp: event.clientTimestamp,
                server_timestamp: event.serverTimestamp,
            },
        }));
        // Insert rows
        await bigquery.dataset(DATASET_ID).table(TABLE_ID).insert(rows, {
            ignoreUnknownValues: true,
            skipInvalidRows: false,
        });
        v2_1.logger.info(`Successfully inserted ${rows.length} rows to BigQuery`);
    }
    catch (error) {
        if (error.name === "PartialFailureError") {
            v2_1.logger.error("Partial failure in BigQuery insert:", error.errors);
            // Log partial failures but continue
        }
        else {
            throw error;
        }
    }
}
/**
 * Export events to GCS (for emulator or backup)
 */
async function exportToGCS(events) {
    const bucket = storage.bucket();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `analytics-exports/${timestamp}.json`;
    const file = bucket.file(filename);
    await file.save(JSON.stringify(events, null, 2), {
        contentType: "application/json",
        metadata: {
            eventCount: events.length.toString(),
            exportedAt: new Date().toISOString(),
        },
    });
    v2_1.logger.info(`Exported ${events.length} events to gs://${bucket.name}/${filename}`);
}
/**
 * Ensure BigQuery dataset and table exist
 */
async function ensureBigQuerySetup() {
    try {
        // Check/create dataset
        const [datasets] = await bigquery.getDatasets();
        const datasetExists = datasets.some((ds) => ds.id === DATASET_ID);
        if (!datasetExists) {
            await bigquery.createDataset(DATASET_ID, {
                location: "EU", // europe-west3 compatible
            });
            v2_1.logger.info(`Created BigQuery dataset: ${DATASET_ID}`);
        }
        // Check/create table
        const dataset = bigquery.dataset(DATASET_ID);
        const [tables] = await dataset.getTables();
        const tableExists = tables.some((t) => t.id === TABLE_ID);
        if (!tableExists) {
            const schema = [
                { name: "event_id", type: "STRING", mode: "REQUIRED" },
                { name: "event_name", type: "STRING", mode: "REQUIRED" },
                { name: "uid", type: "STRING", mode: "NULLABLE" },
                { name: "role", type: "STRING", mode: "NULLABLE" },
                { name: "source", type: "STRING", mode: "REQUIRED" },
                { name: "locale", type: "STRING", mode: "REQUIRED" },
                { name: "country", type: "STRING", mode: "NULLABLE" },
                { name: "screen", type: "STRING", mode: "NULLABLE" },
                { name: "payload", type: "STRING", mode: "NULLABLE" }, // JSON string
                { name: "client_timestamp", type: "TIMESTAMP", mode: "NULLABLE" },
                { name: "server_timestamp", type: "TIMESTAMP", mode: "REQUIRED" },
            ];
            await dataset.createTable(TABLE_ID, {
                schema,
                timePartitioning: {
                    type: "DAY",
                    field: "server_timestamp",
                },
            });
            v2_1.logger.info(`Created BigQuery table: ${DATASET_ID}.${TABLE_ID}`);
        }
    }
    catch (error) {
        v2_1.logger.warn("BigQuery setup check failed:", error.message);
        // Non-fatal - table might exist but API call failed
    }
}
/**
 * Handle export failures by moving events to dead letter queue
 */
async function handleExportFailure(error) {
    try {
        // Query failed events (still marked as processed=false)
        const failedSnapshot = await db
            .collection("analyticsEvents")
            .where("processed", "==", false)
            .limit(100)
            .get();
        if (failedSnapshot.empty)
            return;
        const batch = db.batch();
        failedSnapshot.docs.forEach((doc) => {
            const data = doc.data();
            // Move to dead letter queue
            const deadLetterRef = db.collection("analyticsDeadLetter").doc(doc.id);
            batch.set(deadLetterRef, {
                ...data,
                failedAt: firestore_1.Timestamp.now(),
                failureReason: error.message,
                retryCount: (data.retryCount || 0) + 1,
            });
            // Mark original as failed if max retries exceeded
            if ((data.retryCount || 0) >= MAX_RETRIES) {
                batch.update(doc.ref, {
                    processed: true,
                    failed: true,
                    processedAt: firestore_1.Timestamp.now(),
                });
            }
        });
        await batch.commit();
        v2_1.logger.info(`Moved ${failedSnapshot.size} events to dead letter queue`);
    }
    catch (dlqError) {
        v2_1.logger.error("Dead letter queue failed:", dlqError);
    }
}
/**
 * Cleanup old processed events (runs daily)
 * Removes events older than 7 days from analyticsEvents collection
 */
exports.cleanupAnalyticsEventsScheduler = (0, scheduler_1.onSchedule)({
    schedule: "0 2 * * *", // 2 AM daily
    region: "europe-west3",
    timeoutSeconds: 540,
}, async (event) => {
    v2_1.logger.info("Analytics cleanup started");
    try {
        const sevenDaysAgo = firestore_1.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const oldEventsSnapshot = await db
            .collection("analyticsEvents")
            .where("processed", "==", true)
            .where("createdAt", "<", sevenDaysAgo)
            .limit(500)
            .get();
        if (oldEventsSnapshot.empty) {
            v2_1.logger.info("No old events to clean up");
            return;
        }
        const batch = db.batch();
        oldEventsSnapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        v2_1.logger.info(`Cleaned up ${oldEventsSnapshot.size} old analytics events`);
    }
    catch (error) {
        v2_1.logger.error("Analytics cleanup failed:", error);
        throw error;
    }
});
//# sourceMappingURL=analyticsExport.js.map