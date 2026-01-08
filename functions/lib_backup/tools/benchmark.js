"use strict";
/**
 * Performance Benchmark Tool
 *
 * Measures execution time, Firestore I/O, memory for engine functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.bench = bench;
exports.trackRead = trackRead;
exports.trackWrite = trackWrite;
exports.runBenchmarkSuite = runBenchmarkSuite;
exports.getBenchmarkReport = getBenchmarkReport;
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
/**
 * Global I/O counters (simplified tracking)
 */
let globalReads = 0;
let globalWrites = 0;
/**
 * Benchmark a function
 */
async function bench(fnName, fn) {
    // Reset counters
    globalReads = 0;
    globalWrites = 0;
    // Start timer
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    // Execute function
    let result;
    try {
        result = await fn();
    }
    catch (error) {
        console.error(`Benchmark error for ${fnName}:`, error);
        result = null;
    }
    // End timer
    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;
    const ms = endTime - startTime;
    const memoryDelta = endMemory - startMemory;
    // Estimate I/O operations (simplified)
    // In production, would use Firestore profiling or SDK hooks
    const reads = globalReads;
    const writes = globalWrites;
    const benchResult = {
        fnName,
        ms: parseFloat(ms.toFixed(2)),
        reads,
        writes,
        diag: {
            memoryDeltaBytes: memoryDelta,
            resultType: typeof result,
        },
    };
    // Log result
    console.log(`Benchmark [${fnName}]: ${ms.toFixed(2)}ms, ${reads}R/${writes}W`);
    // Save to engine logs
    await saveBenchmarkResult(benchResult);
    return benchResult;
}
/**
 * Track Firestore read
 */
function trackRead(count = 1) {
    globalReads += count;
}
/**
 * Track Firestore write
 */
function trackWrite(count = 1) {
    globalWrites += count;
}
/**
 * Save benchmark result to Firestore
 */
async function saveBenchmarkResult(result) {
    try {
        const today = new Date().toISOString().split("T")[0];
        const reportRef = db
            .collection("engineLogs")
            .doc("benchmarks")
            .collection(today)
            .doc("report");
        // Append to report array
        await reportRef.set({
            results: firestore_2.FieldValue.arrayUnion(result),
            lastUpdated: firestore_2.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    catch (error) {
        console.error("Error saving benchmark result:", error);
    }
}
/**
 * Run full benchmark suite
 */
async function runBenchmarkSuite() {
    console.log("Running benchmark suite...");
    const results = [];
    // Benchmark: Simple Firestore read
    results.push(await bench("firestore_read_single", async () => {
        trackRead(1);
        const doc = await db.collection("users").doc("test_user_1").get();
        return doc.exists;
    }));
    // Benchmark: Firestore query
    results.push(await bench("firestore_query_10", async () => {
        const snapshot = await db.collection("users").limit(10).get();
        trackRead(snapshot.size);
        return snapshot.size;
    }));
    // Benchmark: Firestore write
    results.push(await bench("firestore_write_single", async () => {
        trackWrite(1);
        await db.collection("benchmarkTest").doc().set({
            timestamp: firestore_2.FieldValue.serverTimestamp(),
            value: Math.random(),
        });
        return true;
    }));
    // Benchmark: Transaction (read + write)
    results.push(await bench("firestore_transaction", async () => {
        const userRef = db.collection("users").doc("test_user_1");
        await db.runTransaction(async (tx) => {
            trackRead(1);
            const doc = await tx.get(userRef);
            if (doc.exists) {
                trackWrite(1);
                tx.update(userRef, { lastBenchmark: firestore_2.FieldValue.serverTimestamp() });
            }
        });
        return true;
    }));
    // Benchmark: Batch write
    results.push(await bench("firestore_batch_write_5", async () => {
        const batch = db.batch();
        for (let i = 0; i < 5; i++) {
            const ref = db.collection("benchmarkTest").doc();
            batch.set(ref, { index: i, timestamp: firestore_2.FieldValue.serverTimestamp() });
            trackWrite(1);
        }
        await batch.commit();
        return true;
    }));
    console.log(`Benchmark suite complete: ${results.length} tests`);
    // Save summary
    const today = new Date().toISOString().split("T")[0];
    const summaryRef = db
        .collection("engineLogs")
        .doc("benchmarks")
        .collection(today)
        .doc("summary");
    await summaryRef.set({
        totalTests: results.length,
        averageMs: results.reduce((sum, r) => sum + r.ms, 0) / results.length,
        totalReads: results.reduce((sum, r) => sum + r.reads, 0),
        totalWrites: results.reduce((sum, r) => sum + r.writes, 0),
        timestamp: firestore_2.FieldValue.serverTimestamp(),
    });
    return results;
}
/**
 * Get benchmark report for date
 */
async function getBenchmarkReport(date) {
    const reportRef = db
        .collection("engineLogs")
        .doc("benchmarks")
        .collection(date)
        .doc("report");
    const reportDoc = await reportRef.get();
    if (!reportDoc.exists) {
        return { date, results: [], message: "No benchmark data for this date" };
    }
    return {
        date,
        ...reportDoc.data(),
    };
}
//# sourceMappingURL=benchmark.js.map