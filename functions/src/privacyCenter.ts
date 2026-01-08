/**
 * PACK 64 — GDPR Data Export & Deletion Center
 * 
 * Self-service data export and deletion with:
 * - Export job queues with status tracking
 * - Deletion job queues with safety flags
 * - AML/payouts/disputes retention
 * - Ops-safe background workers
 */

import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError } from "firebase-functions/v2/https";
import { db, auth, storage, admin, serverTimestamp, increment, generateId } from "./init";
import { v4 as uuidv4 } from "uuid";
import { Timestamp } from "firebase-admin/firestore";

// ============================================================================
// TYPES
// ============================================================================

export type ExportJobStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "READY"
  | "FAILED"
  | "CANCELLED";

export interface ExportJob {
  jobId: string;
  userId: string;
  status: ExportJobStatus;
  requestedAt: Timestamp;
  startedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  failedAt?: Timestamp | null;
  storagePath?: string | null;
  fileSizeBytes?: number | null;
  downloadToken?: string | null;
  expiresAt?: Timestamp | null;
  includes: {
    profile: boolean;
    preferences: boolean;
    controlSettings: boolean;
    chatMessages: boolean;
    mediaMetadata: boolean;
    reservations: boolean;
    payoutsSummary: boolean;
    analyticsSelfView: boolean;
  };
  errorMessage?: string | null;
  lastUpdatedAt: Timestamp;
}

export type DeletionJobStatus =
  | "REQUESTED"
  | "IN_REVIEW"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";

export interface DeletionJob {
  jobId: string;
  userId: string;
  status: DeletionJobStatus;
  requestedAt: Timestamp;
  reviewedAt?: Timestamp | null;
  scheduledFor?: Timestamp | null;
  startedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  rejectedAt?: Timestamp | null;
  userReason?: string | null;
  internalNote?: string | null;
  rejectionReason?: string | null;
  hasActivePayouts: boolean;
  hasOpenDisputes: boolean;
  hasHighRiskAmlProfile: boolean;
  requiresManualReview: boolean;
  lastUpdatedAt: Timestamp;
}

// ============================================================================
// EXPORT ENDPOINTS
// ============================================================================

/**
 * POST /privacy/export/request
 * Create a new export job for a user
 */
export const requestExport = onCall(
  { region: "europe-west3" },
  async (request) => {
    const { userId } = request.data;

    // Validate auth
    if (!request.auth || request.auth.uid !== userId) {
      throw new HttpsError("permission-denied", "Not authorized");
    }

    try {
      // Check for existing active job
      const existingJob = await db
        .collection("export_jobs")
        .where("userId", "==", userId)
        .where("status", "in", ["PENDING", "IN_PROGRESS", "READY"])
        .orderBy("requestedAt", "desc")
        .limit(1)
        .get();

      if (!existingJob.empty) {
        const job = existingJob.docs[0].data() as ExportJob;
        
        // Check if not expired
        if (job.expiresAt && job.expiresAt.toMillis() > Date.now()) {
          return {
            jobId: job.jobId,
            status: job.status,
            requestedAt: job.requestedAt.toMillis(),
            expiresAt: job.expiresAt?.toMillis(),
          };
        }
      }

      // Create new job
      const jobId = uuidv4();
      const now = Timestamp.now();

      const newJob: ExportJob = {
        jobId,
        userId,
        status: "PENDING",
        requestedAt: now,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        storagePath: null,
        fileSizeBytes: null,
        downloadToken: null,
        expiresAt: null,
        includes: {
          profile: true,
          preferences: true,
          controlSettings: true,
          chatMessages: true,
          mediaMetadata: true,
          reservations: true,
          payoutsSummary: true,
          analyticsSelfView: true,
        },
        errorMessage: null,
        lastUpdatedAt: now,
      };

      await db.collection("export_jobs").doc(jobId).set(newJob);

      return {
        jobId,
        status: newJob.status,
        requestedAt: now.toMillis(),
      };
    } catch (error: any) {
      console.error("Error creating export job:", error);
      throw new HttpsError("internal", "Failed to create export job");
    }
  }
);

/**
 * GET /privacy/export/status
 * Get export job status for user
 */
export const getExportStatus = onCall(
  { region: "europe-west3" },
  async (request) => {
    const { userId } = request.data;

    if (!request.auth || request.auth.uid !== userId) {
      throw new HttpsError("permission-denied", "Not authorized");
    }

    try {
      const jobSnapshot = await db
        .collection("export_jobs")
        .where("userId", "==", userId)
        .orderBy("requestedAt", "desc")
        .limit(1)
        .get();

      if (jobSnapshot.empty) {
        return null;
      }

      const job = jobSnapshot.docs[0].data() as ExportJob;

      return {
        jobId: job.jobId,
        status: job.status,
        requestedAt: job.requestedAt.toMillis(),
        startedAt: job.startedAt?.toMillis() || null,
        completedAt: job.completedAt?.toMillis() || null,
        failedAt: job.failedAt?.toMillis() || null,
        expiresAt: job.expiresAt?.toMillis() || null,
        fileSizeBytes: job.fileSizeBytes || null,
        errorMessage: job.errorMessage || null,
      };
    } catch (error: any) {
      console.error("Error fetching export status:", error);
      throw new HttpsError("internal", "Failed to fetch export status");
    }
  }
);

/**
 * GET /privacy/export/download
 * Get signed download URL for completed export
 */
export const downloadExport = onCall(
  { region: "europe-west3" },
  async (request) => {
    const { userId, jobId, token } = request.data;

    if (!request.auth || request.auth.uid !== userId) {
      throw new HttpsError("permission-denied", "Not authorized");
    }

    try {
      const jobDoc = await db.collection("export_jobs").doc(jobId).get();

      if (!jobDoc.exists) {
        throw new HttpsError("not-found", "Job not found");
      }

      const job = jobDoc.data() as ExportJob;

      if (job.userId !== userId) {
        throw new HttpsError("permission-denied", "Not authorized");
      }

      if (job.status !== "READY") {
        throw new HttpsError("failed-precondition", "Export not ready");
      }

      if (job.downloadToken !== token) {
        throw new HttpsError("permission-denied", "Invalid token");
      }

      if (job.expiresAt && job.expiresAt.toMillis() < Date.now()) {
        throw new HttpsError("failed-precondition", "Export expired");
      }

      if (!job.storagePath) {
        throw new HttpsError("not-found", "Export file not found");
      }

      // Generate signed URL (valid for 1 hour)
      const bucket = storage.bucket();
      const file = bucket.file(job.storagePath);
      const [url] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 3600000, // 1 hour
      });

      return { downloadUrl: url };
    } catch (error: any) {
      console.error("Error downloading export:", error);
      throw new HttpsError("internal", "Failed to generate download URL");
    }
  }
);

// ============================================================================
// DELETION ENDPOINTS
// ============================================================================

/**
 * POST /privacy/deletion/request
 * Create deletion request with safety checks
 */
export const requestDeletion = onCall(
  { region: "europe-west3" },
  async (request) => {
    const { userId, userReason } = request.data;

    if (!request.auth || request.auth.uid !== userId) {
      throw new HttpsError("permission-denied", "Not authorized");
    }

    try {
      // Check for existing active job
      const existingJob = await db
        .collection("deletion_jobs")
        .where("userId", "==", userId)
        .where("status", "in", [
          "REQUESTED",
          "IN_REVIEW",
          "SCHEDULED",
          "IN_PROGRESS",
        ])
        .limit(1)
        .get();

      if (!existingJob.empty) {
        const job = existingJob.docs[0].data() as DeletionJob;
        return {
          jobId: job.jobId,
          status: job.status,
          requestedAt: job.requestedAt.toMillis(),
        };
      }

      // Check safety flags
      const safetyFlags = await checkDeletionSafetyFlags(userId);

      const jobId = uuidv4();
      const now = Timestamp.now();

      // Determine initial status
      const requiresManualReview =
        safetyFlags.hasActivePayouts ||
        safetyFlags.hasOpenDisputes ||
        safetyFlags.hasHighRiskAmlProfile;

      const status: DeletionJobStatus = requiresManualReview
        ? "IN_REVIEW"
        : "SCHEDULED";

      // Schedule deletion 7 days from now if not requiring review
      const scheduledFor = !requiresManualReview
        ? Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000)
        : null;

      const newJob: DeletionJob = {
        jobId,
        userId,
        status,
        requestedAt: now,
        reviewedAt: null,
        scheduledFor,
        startedAt: null,
        completedAt: null,
        rejectedAt: null,
        userReason: userReason || null,
        internalNote: null,
        rejectionReason: null,
        hasActivePayouts: safetyFlags.hasActivePayouts,
        hasOpenDisputes: safetyFlags.hasOpenDisputes,
        hasHighRiskAmlProfile: safetyFlags.hasHighRiskAmlProfile,
        requiresManualReview,
        lastUpdatedAt: now,
      };

      await db.collection("deletion_jobs").doc(jobId).set(newJob);

      return {
        jobId,
        status,
        requestedAt: now.toMillis(),
        scheduledFor: scheduledFor?.toMillis() || null,
      };
    } catch (error: any) {
      console.error("Error creating deletion job:", error);
      throw new HttpsError("internal", "Failed to create deletion job");
    }
  }
);

/**
 * GET /privacy/deletion/status
 * Get deletion job status for user
 */
export const getDeletionStatus = onCall(
  { region: "europe-west3" },
  async (request) => {
    const { userId } = request.data;

    if (!request.auth || request.auth.uid !== userId) {
      throw new HttpsError("permission-denied", "Not authorized");
    }

    try {
      const jobSnapshot = await db
        .collection("deletion_jobs")
        .where("userId", "==", userId)
        .orderBy("requestedAt", "desc")
        .limit(1)
        .get();

      if (jobSnapshot.empty) {
        return null;
      }

      const job = jobSnapshot.docs[0].data() as DeletionJob;

      return {
        jobId: job.jobId,
        status: job.status,
        requestedAt: job.requestedAt.toMillis(),
        reviewedAt: job.reviewedAt?.toMillis() || null,
        scheduledFor: job.scheduledFor?.toMillis() || null,
        startedAt: job.startedAt?.toMillis() || null,
        completedAt: job.completedAt?.toMillis() || null,
        rejectedAt: job.rejectedAt?.toMillis() || null,
        userReason: job.userReason || null,
        rejectionReason: job.rejectionReason || null,
      };
    } catch (error: any) {
      console.error("Error fetching deletion status:", error);
      throw new HttpsError("internal", "Failed to fetch deletion status");
    }
  }
);

/**
 * POST /privacy/deletion/review
 * Admin review of deletion request
 */
export const reviewDeletion = onCall(
  { region: "europe-west3" },
  async (request) => {
    const { adminId, jobId, action, internalNote, rejectionReason } = request.data;

    // TODO: Verify admin role from request.auth
    if (!request.auth) {
      throw new HttpsError("permission-denied", "Not authorized");
    }

    try {
      const jobDoc = await db.collection("deletion_jobs").doc(jobId).get();

      if (!jobDoc.exists) {
        throw new HttpsError("not-found", "Job not found");
      }

      const job = jobDoc.data() as DeletionJob;

      if (job.status !== "IN_REVIEW") {
        throw new HttpsError("failed-precondition", "Job not in review state");
      }

      const now = Timestamp.now();

      if (action === "APPROVE") {
        // Schedule for 7 days from now
        const scheduledFor = Timestamp.fromMillis(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        );

        await jobDoc.ref.update({
          status: "SCHEDULED",
          reviewedAt: now,
          scheduledFor,
          internalNote: internalNote || null,
          lastUpdatedAt: now,
        });

        return { success: true, status: "SCHEDULED" };
      } else {
        await jobDoc.ref.update({
          status: "REJECTED",
          reviewedAt: now,
          rejectedAt: now,
          internalNote: internalNote || null,
          rejectionReason: rejectionReason || "Rejected by admin",
          lastUpdatedAt: now,
        });

        return { success: true, status: "REJECTED" };
      }
    } catch (error: any) {
      console.error("Error reviewing deletion job:", error);
      throw new HttpsError("internal", "Failed to review deletion job");
    }
  }
);

// ============================================================================
// SCHEDULED WORKERS
// ============================================================================

/**
 * Process pending export jobs
 * Runs every 5 minutes
 */
export const processExportJobs = onSchedule(
  {
    schedule: "every 5 minutes",
    region: "europe-west3",
  },
  async (event) => {
    console.log("Processing export jobs...");

    const jobs = await db
      .collection("export_jobs")
      .where("status", "in", ["PENDING", "IN_PROGRESS"])
      .limit(10)
      .get();

    for (const jobDoc of jobs.docs) {
      const job = jobDoc.data() as ExportJob;

      try {
        await processExportJob(job);
      } catch (error: any) {
        console.error(`Error processing export job ${job.jobId}:`, error);
        
        await jobDoc.ref.update({
          status: "FAILED",
          failedAt: Timestamp.now(),
          errorMessage: error.message || "Unknown error",
          lastUpdatedAt: Timestamp.now(),
        });
      }
    }

    console.log(`Processed ${jobs.size} export jobs`);
  }
);

/**
 * Process deletion jobs
 * Runs every 10 minutes
 */
export const processDeletionJobs = onSchedule(
  {
    schedule: "every 10 minutes",
    region: "europe-west3",
  },
  async (event) => {
    console.log("Processing deletion jobs...");

    const now = Date.now();

    const jobs = await db
      .collection("deletion_jobs")
      .where("status", "in", ["SCHEDULED", "IN_PROGRESS"])
      .limit(5)
      .get();

    for (const jobDoc of jobs.docs) {
      const job = jobDoc.data() as DeletionJob;

      // Skip if not yet scheduled
      if (
        job.status === "SCHEDULED" &&
        job.scheduledFor &&
        job.scheduledFor.toMillis() > now
      ) {
        continue;
      }

      try {
        await processDeletionJob(job);
      } catch (error: any) {
        console.error(`Error processing deletion job ${job.jobId}:`, error);
        
        // Mark for manual review on error
        await jobDoc.ref.update({
          status: "IN_REVIEW",
          internalNote: `Error during deletion: ${error.message}`,
          lastUpdatedAt: Timestamp.now(),
        });
      }
    }

    console.log(`Processed ${jobs.size} deletion jobs`);
  }
);

// ============================================================================
// WORKER HELPERS
// ============================================================================

/**
 * Process a single export job
 */
async function processExportJob(job: ExportJob): Promise<void> {
  const jobRef = db.collection("export_jobs").doc(job.jobId);

  // Mark as in progress if first time
  if (job.status === "PENDING") {
    await jobRef.update({
      status: "IN_PROGRESS",
      startedAt: Timestamp.now(),
      lastUpdatedAt: Timestamp.now(),
    });
  }

  // Gather data
  const exportData: any = {};

  if (job.includes.profile) {
    exportData.profile = await gatherProfileData(job.userId);
  }

  if (job.includes.preferences) {
    exportData.preferences = await gatherPreferencesData(job.userId);
  }

  if (job.includes.controlSettings) {
    exportData.controlSettings = await gatherControlSettings(job.userId);
  }

  if (job.includes.chatMessages) {
    exportData.chatMessages = await gatherChatMessages(job.userId);
  }

  if (job.includes.mediaMetadata) {
    exportData.mediaMetadata = await gatherMediaMetadata(job.userId);
  }

  if (job.includes.reservations) {
    exportData.reservations = await gatherReservations(job.userId);
  }

  if (job.includes.payoutsSummary) {
    exportData.payoutsSummary = await gatherPayoutsSummary(job.userId);
  }

  if (job.includes.analyticsSelfView) {
    exportData.analyticsSelfView = await gatherAnalyticsSelfView(job.userId);
  }

  // Create single JSON file with all export data
  const storagePath = `exports/${job.userId}/${job.jobId}.json`;
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);

  const exportContent = JSON.stringify({
    exportedAt: new Date().toISOString(),
    ...exportData,
  }, null, 2);

  await file.save(exportContent, {
    metadata: {
      contentType: "application/json",
    },
  });

  // Get file size
  const fileSizeBytes = Buffer.byteLength(exportContent, 'utf8');

  // Generate download token
  const downloadToken = uuidv4();

  // Set expiry to 7 days from now
  const expiresAt = Timestamp.fromMillis(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  );

  // Update job
  await jobRef.update({
    status: "READY",
    completedAt: Timestamp.now(),
    storagePath,
    fileSizeBytes,
    downloadToken,
    expiresAt,
    lastUpdatedAt: Timestamp.now(),
  });
}

/**
 * Process a single deletion job
 */
async function processDeletionJob(job: DeletionJob): Promise<void> {
  const jobRef = db.collection("deletion_jobs").doc(job.jobId);

  // Mark as in progress if first time
  if (job.status === "SCHEDULED") {
    await jobRef.update({
      status: "IN_PROGRESS",
      startedAt: Timestamp.now(),
      lastUpdatedAt: Timestamp.now(),
    });
  }

  // Deactivate account via Firebase Auth
  try {
    await auth.updateUser(job.userId, { disabled: true });
  } catch (error: any) {
    console.error("Error disabling user auth:", error);
  }

  // Delete/pseudonymize profile data
  await deleteProfileData(job.userId);

  // Delete control settings
  await deleteControlSettings(job.userId);

  // Delete preferences
  await deletePreferences(job.userId);

  // Pseudonymize chat messages
  await pseudonymizeChatMessages(job.userId);

  // Delete devices & sessions
  await deleteDevicesAndSessions(job.userId);

  // Delete analytics (keep aggregated data)
  await deleteUserAnalytics(job.userId);

  // Mark AML data as user erased (but keep it)
  await markAmlDataErased(job.userId);

  // Mark payouts as user erased (but keep financial records)
  await markPayoutsErased(job.userId);

  // Handle reservations
  await pseudonymizeReservations(job.userId);

  // Mark user as deleted in enforcement
  await markUserDeleted(job.userId);

  // Complete job
  await jobRef.update({
    status: "COMPLETED",
    completedAt: Timestamp.now(),
    lastUpdatedAt: Timestamp.now(),
  });
}

/**
 * Check safety flags before deletion
 */
async function checkDeletionSafetyFlags(userId: string): Promise<{
  hasActivePayouts: boolean;
  hasOpenDisputes: boolean;
  hasHighRiskAmlProfile: boolean;
}> {
  // Check active payouts
  const activePayouts = await db
    .collection("payout_requests")
    .where("userId", "==", userId)
    .where("status", "in", ["PENDING", "IN_PROGRESS"])
    .limit(1)
    .get();

  // Check open disputes
  const openDisputes = await db
    .collection("disputes")
    .where("parties", "array-contains", userId)
    .where("status", "in", ["OPEN", "IN_REVIEW"])
    .limit(1)
    .get();

  // Check AML risk level
  let hasHighRiskAmlProfile = false;
  const amlProfile = await db.collection("aml_profiles").doc(userId).get();
  if (amlProfile.exists) {
    const data = amlProfile.data();
    hasHighRiskAmlProfile = ["HIGH", "CRITICAL"].includes(data?.riskLevel);
  }

  return {
    hasActivePayouts: !activePayouts.empty,
    hasOpenDisputes: !openDisputes.empty,
    hasHighRiskAmlProfile,
  };
}

// ============================================================================
// DATA GATHERING HELPERS (for export)
// ============================================================================

async function gatherProfileData(userId: string): Promise<any> {
  const profile = await db.collection("profiles").doc(userId).get();
  if (!profile.exists) return null;

  const data = profile.data();
  
  // Return minimal profile data
  return {
    userId,
    displayName: data?.displayName,
    bio: data?.bio,
    gender: data?.gender,
    birthYear: data?.birthYear,
    location: data?.location,
    createdAt: data?.createdAt?.toMillis(),
    // Do NOT include auth email or sensitive fields
  };
}

async function gatherPreferencesData(userId: string): Promise<any> {
  const prefs = await db.collection("user_preferences").doc(userId).get();
  return prefs.exists ? prefs.data() : null;
}

async function gatherControlSettings(userId: string): Promise<any> {
  const control = await db.collection("user_control_profiles").doc(userId).get();
  return control.exists ? control.data() : null;
}

async function gatherChatMessages(userId: string): Promise<any> {
  // Gather last 100 messages where user is participant
  const messages = await db
    .collection("messages")
    .where("participants", "array-contains", userId)
    .orderBy("timestamp", "desc")
    .limit(100)
    .get();

  return messages.docs.map((doc) => {
    const data = doc.data();
    return {
      messageId: doc.id,
      conversationId: data.conversationId,
      senderId: data.senderId,
      content: data.senderId === userId ? data.content : "[other user message]",
      timestamp: data.timestamp?.toMillis(),
    };
  });
}

async function gatherMediaMetadata(userId: string): Promise<any> {
  const media = await db
    .collection("media")
    .where("userId", "==", userId)
    .limit(50)
    .get();

  return media.docs.map((doc) => {
    const data = doc.data();
    return {
      mediaId: doc.id,
      type: data.type,
      createdAt: data.createdAt?.toMillis(),
      // Do NOT include actual file URLs
    };
  });
}

async function gatherReservations(userId: string): Promise<any> {
  const reservations = await db
    .collection("reservations")
    .where("participants", "array-contains", userId)
    .limit(50)
    .get();

  return reservations.docs.map((doc) => {
    const data = doc.data();
    return {
      reservationId: doc.id,
      status: data.status,
      startTime: data.startTime?.toMillis(),
      endTime: data.endTime?.toMillis(),
      createdAt: data.createdAt?.toMillis(),
    };
  });
}

async function gatherPayoutsSummary(userId: string): Promise<any> {
  const payouts = await db
    .collection("payout_requests")
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();

  return payouts.docs.map((doc) => {
    const data = doc.data();
    return {
      payoutId: doc.id,
      status: data.status,
      amountCents: data.amountCents,
      currency: data.currency,
      createdAt: data.createdAt?.toMillis(),
      // Do NOT include bank details
    };
  });
}

async function gatherAnalyticsSelfView(userId: string): Promise<any> {
  const creatorEarnings = await db
    .collection("analytics_creator_earnings")
    .doc(userId)
    .get();

  const userSpending = await db
    .collection("analytics_user_spending")
    .doc(userId)
    .get();

  return {
    creatorEarnings: creatorEarnings.exists ? creatorEarnings.data() : null,
    userSpending: userSpending.exists ? userSpending.data() : null,
  };
}

// ============================================================================
// DATA DELETION HELPERS
// ============================================================================

async function deleteProfileData(userId: string): Promise<void> {
  const profileRef = db.collection("profiles").doc(userId);
  const profileSnap = await profileRef.get();
  
  if (profileSnap.exists) {
    await profileRef.update({
      displayName: "Deleted User",
      bio: "",
      photos: [],
      deletedAt: Timestamp.now(),
      userErased: true,
    });
  }
}

async function deleteControlSettings(userId: string): Promise<void> {
  const controlRef = db.collection("user_control_profiles").doc(userId);
  const controlSnap = await controlRef.get();
  
  if (controlSnap.exists) {
    await controlRef.delete();
  }
}

async function deletePreferences(userId: string): Promise<void> {
  const prefsRef = db.collection("user_preferences").doc(userId);
  const prefsSnap = await prefsRef.get();
  
  if (prefsSnap.exists) {
    await prefsRef.delete();
  }
}

async function pseudonymizeChatMessages(userId: string): Promise<void> {
  // Mark messages as from deleted user
  const batch = db.batch();
  const messages = await db
    .collection("messages")
    .where("senderId", "==", userId)
    .limit(500)
    .get();

  messages.docs.forEach((doc) => {
    batch.update(doc.ref, {
      senderId: "DELETED_USER",
      senderName: "Deleted User",
    });
  });

  if (messages.size > 0) {
    await batch.commit();
  }
}

async function deleteDevicesAndSessions(userId: string): Promise<void> {
  const devices = await db
    .collection("user_devices")
    .where("userId", "==", userId)
    .get();

  if (devices.size > 0) {
    const batch = db.batch();
    devices.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  const sessions = await db
    .collection("user_sessions")
    .where("userId", "==", userId)
    .get();

  if (sessions.size > 0) {
    const sessionBatch = db.batch();
    sessions.docs.forEach((doc) => sessionBatch.delete(doc.ref));
    await sessionBatch.commit();
  }
}

async function deleteUserAnalytics(userId: string): Promise<void> {
  const creatorRef = db.collection("analytics_creator_earnings").doc(userId);
  const spendingRef = db.collection("analytics_user_spending").doc(userId);
  
  const creatorSnap = await creatorRef.get();
  const spendingSnap = await spendingRef.get();
  
  if (creatorSnap.exists) {
    await creatorRef.delete();
  }
  
  if (spendingSnap.exists) {
    await spendingRef.delete();
  }
}

async function markAmlDataErased(userId: string): Promise<void> {
  const amlProfile = db.collection("aml_profiles").doc(userId);
  const snapshot = await amlProfile.get();
  
  if (snapshot.exists) {
    await amlProfile.update({
      userErased: true,
      erasedAt: Timestamp.now(),
    });
  }
}

async function markPayoutsErased(userId: string): Promise<void> {
  const batch = db.batch();
  const payouts = await db
    .collection("payout_requests")
    .where("userId", "==", userId)
    .get();

  payouts.docs.forEach((doc) => {
    batch.update(doc.ref, {
      userErased: true,
      erasedAt: Timestamp.now(),
    });
  });

  if (payouts.size > 0) {
    await batch.commit();
  }
}

async function pseudonymizeReservations(userId: string): Promise<void> {
  // Keep reservation records but mark user as deleted
  const batch = db.batch();
  const reservations = await db
    .collection("reservations")
    .where("participants", "array-contains", userId)
    .limit(500)
    .get();

  reservations.docs.forEach((doc) => {
    const data = doc.data();
    const updatedParticipants = data.participants.map((id: string) =>
      id === userId ? "DELETED_USER" : id
    );
    
    batch.update(doc.ref, {
      participants: updatedParticipants,
      userErased: true,
    });
  });

  if (reservations.size > 0) {
    await batch.commit();
  }
}

async function markUserDeleted(userId: string): Promise<void> {
  // Create enforcement record for deleted account
  await db.collection("user_restrictions").doc(userId).set({
    userId,
    type: "ACCOUNT_DELETED",
    reason: "User requested account deletion",
    createdAt: Timestamp.now(),
    permanent: true,
  });
}