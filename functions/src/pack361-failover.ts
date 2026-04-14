import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 361 - Disaster Recovery & Failover
 * Hourly backups, region failover, recovery procedures
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { HttpsError, auth, onCall, timestamp, logger, onSchedule } from './runtime';

// ============================================
// TYPES
// ============================================

export interface BackupMetadata {
  id: string;
  type: "hourly" | "daily" | "cold_storage";
  collections: string[];
  size: number;
  status: "in_progress" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  storagUSDl: string;
  region: string;
}

export interface RecoveryPoint {
  id: string;
  timestamp: number;
  collections: string[];
  region: string;
  backupId: string;
}

export interface RecoveryOperation {
  id: string;
  type: "wallet" | "chat" | "support" | "ai_session" | "full";
  targetTime: number;
  status: "initiated" | "in_progress" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  affectedUsers: string[];
  recoveredDocuments: number;
}

export interface FailoverStatus {
  active: boolean;
  fromRegion: string;
  toRegion: string;
  initiatedAt: number;
  completedAt?: number;
  affectedServices: string[];
  usersFailedOver: number;
}

// ============================================
// CONFIGURATION
// ============================================

const BACKUP_CONFIG = {
  hourlyRetention: 48, // Keep 48 hourly backups (2 days)
  dailyRetention: 90, // Keep 90 daily backups (3 months)
  coldStorageRetention: 365, // Keep 1 year in cold storage
};

const CRITICAL_COLLECTIONS = [
  "users",
  "wallet",
  "walletTransactions",
  "chats",
  "messages",
  "calls",
  "supportTickets",
  "aiSessions",
  "events",
  "payments",
];

const RECOVERY_SLA = {
  wallet: 30, // 30 seconds
  chat: 10, // 10 seconds
  support: 60, // 60 seconds
  ai_session: 15, // 15 seconds
  full: 300, // 5 minutes
};

// ============================================
// BACKUP OPERATIONS
// ============================================

/**
 * Create hourly backup
 */
export const createHourlyBackup = onSchedule("0 * * * *", async (event) => {
    console.log("💾 Starting hourly backup...");
    
    const backupId = `hourly_${Date.now()}`;
    await createBackup(backupId, "hourly", CRITICAL_COLLECTIONS);
    
    // Clean up old hourly backups
    await cleanupOldBackups("hourly", BACKUP_CONFIG.hourlyRetention);
    
    console.log("✅ Hourly backup complete");
  });

/**
 * Create daily backup
 */
export const createDailyBackup = onSchedule("0 2 * * *", async (event) => {
    console.log("💾 Starting daily backup...");
    
    const backupId = `daily_${Date.now()}`;
    await createBackup(backupId, "daily", CRITICAL_COLLECTIONS);
    
    // Clean up old daily backups
    await cleanupOldBackups("daily", BACKUP_CONFIG.dailyRetention);
    
    console.log("✅ Daily backup complete");
  });

/**
 * Create cold storage archive
 */
export const createColdStorageBackup = onSchedule("0 3 1 * *", async (event) => {
    console.log("❄️ Starting cold storage backup...");
    
    const backupId = `cold_${Date.now()}`;
    await createBackup(backupId, "cold_storage", CRITICAL_COLLECTIONS);
    
    // Clean up old cold storage
    await cleanupOldBackups(
      "cold_storage",
      BACKUP_CONFIG.coldStorageRetention
    );
    
    console.log("✅ Cold storage backup complete");
  });

/**
 * Create backup
 */
async function createBackup(
  backupId: string,
  type: BackupMetadata["type"],
  collections: string[]
): Promise<void> {
  const db = admin.firestore();
  const storage = admin.storage();
  
  const backupMetadata: BackupMetadata = {
    id: backupId,
    type,
    collections,
    size: 0,
    status: "in_progress",
    startedAt: Date.now(),
    storagUSDl: "",
    region: "EU", // Primary region
  };
  
  // Save metadata
  await db.collection("backupMetadata").doc(backupId).set(backupMetadata);
  
  try {
    const backupData: Record<string, any[]> = {};
    let totalSize = 0;
    
    // Export each collection
    for (const collectionName of collections) {
      const snapshot = await db.collection(collectionName).get();
      const documents = snapshot.docs.map((doc) => ({
        id: doc.id,
        data: doc.data(),
      }));
      
      backupData[collectionName] = documents;
      totalSize += JSON.stringify(documents).length;
    }
    
    // Upload to storage
    const bucket = storage.bucket();
    const fileName = `backups/${type}/${backupId}.json`;
    const file = bucket.file(fileName);
    
    await file.save(JSON.stringify(backupData), {
      metadata: {
        contentType: "application/json",
        metadata: {
          backupId,
          type,
          timestamp: Date.now().toString(),
        },
      },
    });
    
    const [storagUSDl] = await file.getSignedUrl({
      action: "read",
      expires: "03-01-2500",
    });
    
    // Update metadata
    await db
      .collection("backupMetadata")
      .doc(backupId)
      .update({
        status: "completed",
        completedAt: Date.now(),
        size: totalSize,
        storagUSDl,
      });
    
    console.log(`✅ Backup ${backupId} completed (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
  } catch (error) {
    console.error(`❌ Backup ${backupId} failed:`, error);
    
    await db.collection("backupMetadata").doc(backupId).update({
      status: "failed",
      completedAt: Date.now(),
    });
    
    throw error;
  }
}

/**
 * Clean up old backups
 */
async function cleanupOldBackups(
  type: BackupMetadata["type"],
  retentionHours: number
): Promise<void> {
  const db = admin.firestore();
  const storage = admin.storage();
  
  const cutoff = Date.now() - retentionHours * 60 * 60 * 1000;
  
  const oldBackups = await db
    .collection("backupMetadata")
    .where("type", "==", type)
    .where("startedAt", "<", cutoff)
    .get();
  
  console.log(`🗑️ Cleaning up ${oldBackups.size} old ${type} backups...`);
  
  const batch = db.batch();
  const bucket = storage.bucket();
  
  for (const doc of oldBackups.docs) {
    const backup = doc.data() as BackupMetadata;
    
    // Delete from storage
    const fileName = `backups/${type}/${backup.id}.json`;
    try {
      await bucket.file(fileName).delete();
    } catch (error) {
      console.warn(`Failed to delete backup file ${fileName}:`, error);
    }
    
    // Delete metadata
    batch.delete(doc.ref);
  }
  
  await batch.commit();
  
  console.log(`✅ Cleaned up ${oldBackups.size} backups`);
}

// ============================================
// RECOVERY OPERATIONS
// ============================================

/**
 * Recover wallet snapshot
 */
export const recoverWallet = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const startTime = Date.now();
    console.log(`💰 Recovering wallet for ${data.userId}...`);
    
    const recoveryId = `wallet_${Date.now()}`;
    await performRecovery(
      recoveryId,
      "wallet",
      data.targetTime || Date.now(),
      [data.userId]
    );
    
    const duration = Date.now() - startTime;
    console.log(`✅ Wallet recovered in ${duration}ms`);
    
    if (duration > RECOVERY_SLA.wallet * 1000) {
      console.warn(`⚠️ Recovery exceeded SLA (${RECOVERY_SLA.wallet}s)`);
    }
    
    console.log('Scheduled job result:', {
      success: true,
      recoveryId,
      durationMs: duration,
    });

    
    return;
  }
);

/**
 * Recover chat history
 */
export const recoverChat = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const startTime = Date.now();
    console.log(`💬 Recovering chat ${data.chatId}...`);
    
    const recoveryId = `chat_${Date.now()}`;
    await performRecovery(
      recoveryId,
      "chat",
      data.targetTime || Date.now(),
      [data.chatId]
    );
    
    const duration = Date.now() - startTime;
    console.log(`✅ Chat recovered in ${duration}ms`);
    
    if (duration > RECOVERY_SLA.chat * 1000) {
      console.warn(`⚠️ Recovery exceeded SLA (${RECOVERY_SLA.chat}s)`);
    }
    
    console.log('Scheduled job result:', {
      success: true,
      recoveryId,
      durationMs: duration,
    });

    
    return;
  }
);

/**
 * Recover support ticket
 */
export const recoverSupportTicket = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const startTime = Date.now();
    console.log(`🎫 Recovering support ticket ${data.ticketId}...`);
    
    const recoveryId = `support_${Date.now()}`;
    await performRecovery(
      recoveryId,
      "support",
      data.targetTime || Date.now(),
      [data.ticketId]
    );
    
    const duration = Date.now() - startTime;
    console.log(`✅ Support ticket recovered in ${duration}ms`);
    
    if (duration > RECOVERY_SLA.support * 1000) {
      console.warn(`⚠️ Recovery exceeded SLA (${RECOVERY_SLA.support}s)`);
    }
    
    console.log('Scheduled job result:', {
      success: true,
      recoveryId,
      durationMs: duration,
    });

    
    return;
  }
);

/**
 * Recover AI session
 */
export const recoverAiSession = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const startTime = Date.now();
    console.log(`🤖 Recovering AI session ${data.sessionId}...`);
    
    const recoveryId = `ai_${Date.now()}`;
    await performRecovery(
      recoveryId,
      "ai_session",
      data.targetTime || Date.now(),
      [data.sessionId]
    );
    
    const duration = Date.now() - startTime;
    console.log(`✅ AI session recovered in ${duration}ms`);
    
    if (duration > RECOVERY_SLA.ai_session * 1000) {
      console.warn(`⚠️ Recovery exceeded SLA (${RECOVERY_SLA.ai_session}s)`);
    }
    
    console.log('Scheduled job result:', {
      success: true,
      recoveryId,
      durationMs: duration,
    });

    
    return;
  }
);

/**
 * Perform recovery operation
 */
async function performRecovery(
  recoveryId: string,
  type: RecoveryOperation["type"],
  targetTime: number,
  affectedIds: string[]
): Promise<void> {
  const db = admin.firestore();
  
  const operation: RecoveryOperation = {
    id: recoveryId,
    type,
    targetTime,
    status: "initiated",
    startedAt: Date.now(),
    affectedUsers: affectedIds,
    recoveredDocuments: 0,
  };
  
  await db.collection("recoveryOperations").doc(recoveryId).set(operation);
  
  try {
    // Find nearest backup before target time
    const backupsSnapshot = await db
      .collection("backupMetadata")
      .where("startedAt", "<=", targetTime)
      .where("status", "==", "completed")
      .orderBy("startedAt", "desc")
      .limit(1)
      .get();
    
    if (backupsSnapshot.empty) {
      throw new Error("No backup available for recovery");
    }
    
    const backup = backupsSnapshot.docs[0].data() as BackupMetadata;
    
    console.log(`📦 Using backup ${backup.id} from ${new Date(backup.startedAt).toISOString()}`);
    
    // Download backup
    const storage = admin.storage();
    const bucket = storage.bucket();
    const fileName = `backups/${backup.type}/${backup.id}.json`;
    const file = bucket.file(fileName);
    
    const [contents] = await file.download();
    const backupData = JSON.parse(contents.toString());
    
    // Restore specific documents based on type
    const collections = getCollectionsForType(type);
    let recoveredCount = 0;
    
    for (const collectionName of collections) {
      const documents = backupData[collectionName] || [];
      
      for (const doc of documents) {
        // Only restore if ID matches affected IDs
        if (affectedIds.includes(doc.id)) {
          await db.collection(collectionName).doc(doc.id).set(doc.data);
          recoveredCount++;
        }
      }
    }
    
    // Update operation status
    await db
      .collection("recoveryOperations")
      .doc(recoveryId)
      .update({
        status: "completed",
        completedAt: Date.now(),
        recoveredDocuments: recoveredCount,
      });
    
    console.log(`✅ Recovered ${recoveredCount} documents`);
  } catch (error) {
    console.error(`❌ Recovery ${recoveryId} failed:`, error);
    
    await db.collection("recoveryOperations").doc(recoveryId).update({
      status: "failed",
      completedAt: Date.now(),
    });
    
    throw error;
  }
}

/**
 * Get collections for recovery type
 */
function getCollectionsForType(type: RecoveryOperation["type"]): string[] {
  const collectionMap: Record<string, string[]> = {
    wallet: ["wallet", "walletTransactions"],
    chat: ["chats", "messages"],
    support: ["supportTickets"],
    ai_session: ["aiSessions"],
    full: CRITICAL_COLLECTIONS,
  };
  
  return collectionMap[type] || [];
}

// ============================================
// REGION FAILOVER
// ============================================

/**
 * Initiate region failover
 */
export const initiateRegionFailover = functions.https.onCall(async (request) => {
  const data = request.data;
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }
    
    const db = admin.firestore();
    
    // Check admin permission
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    const isAdmin = userDoc.data()?.role === "admin";
    
    if (!isAdmin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin access required"
      );
    }
    
    console.log(`🔄 Initiating region failover: ${data.fromRegion} → ${data.toRegion}`);
    
    const failover: FailoverStatus = {
      active: true,
      fromRegion: data.fromRegion,
      toRegion: data.toRegion,
      initiatedAt: Date.now(),
      affectedServices: data.services,
      usersFailedOver: 0,
    };
    
    await db.collection("failoverStatus").doc("current").set(failover);
    
    // Get all users in source region
    const usersSnapshot = await db
      .collection("regionMappings")
      .where("assignedRegion", "==", data.fromRegion)
      .get();
    
    console.log(`👥 Failing over ${usersSnapshot.size} users...`);
    
    // Failover users in batches
    const batchSize = 500;
    let failedOverCount = 0;
    
    for (let i = 0; i < usersSnapshot.docs.length; i += batchSize) {
      const batch = db.batch();
      const batchDocs = usersSnapshot.docs.slice(i, i + batchSize);
      
      for (const doc of batchDocs) {
        batch.update(doc.ref, {
          assignedRegion: data.toRegion,
          lastRouted: Date.now(),
        });
      }
      
      await batch.commit();
      failedOverCount += batchDocs.length;
      
      console.log(`✅ Failed over ${failedOverCount}/${usersSnapshot.size} users`);
    }
    
    // Mark failover complete
    await db.collection("failoverStatus").doc("current").update({
      active: false,
      completedAt: Date.now(),
      usersFailedOver: failedOverCount,
    });
    
    console.log(`✅ Region failover complete: ${failedOverCount} users`);
    
    console.log('Scheduled job result:', {
      success: true,
      usersFailedOver: failedOverCount,
    });

    
    return;
  }
);

// ============================================
// HEALTH MONITORING
// ============================================

/**
 * Monitor backup health
 */
export const monitorBackupHealth = onSchedule("every 6 hours", async (event) => {
    const db = admin.firestore();
    
    console.log("🏥 Checking backup health...");
    
    // Check last hourly backup
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentHourlyBackup = await db
      .collection("backupMetadata")
      .where("type", "==", "hourly")
      .where("startedAt", ">", oneHourAgo)
      .where("status", "==", "completed")
      .get();
    
    if (recentHourlyBackup.empty) {
      await db.collection("systemAlerts").add({
        type: "backup_health",
        severity: "critical",
        message: "No hourly backup completed in last hour",
        timestamp: Date.now(),
        resolved: false,
      });
    }
    
    console.log("✅ Backup health check complete");
  });

























