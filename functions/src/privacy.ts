/**
 * PHASE 23 - Legal & Audit Compliance Layer
 *
 * GDPR/DSA data subject rights implementation
 * - Data export (Article 15)
 * - Account deletion (Article 17 - Right to erasure)
 *
 * Region: europe-west3
 */

;
;
import { HttpsError } from 'firebase-functions/v2/https';
;
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
;
;
;

const db = getFirestore();
const storage = getStorage();

/**
 * Privacy request types
 */
enum PrivacyRequestType {
  DATA_EXPORT = "data_export",
  ACCOUNT_DELETION = "account_deletion",
}

enum PrivacyRequestStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  EXPIRED = "expired",
}

/**
 * Request data export (GDPR Article 15)
 *
 * Generates a comprehensive export of all user data
 * Creates a signed URL valid for 7 days
 */
export const requestDataExportV1 = onCall(
  { region: "europe-west3", timeoutSeconds: 540 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    logger.info(`Data export requested by user: ${uid}`);

    try {
      // Check for existing pending request
      const existingRequests = await db
        .collection("privacyRequests")
        .where("uid", "==", uid)
        .where("type", "==", PrivacyRequestType.DATA_EXPORT)
        .where("status", "in", [
          PrivacyRequestStatus.PENDING,
          PrivacyRequestStatus.PROCESSING,
        ])
        .limit(1)
        .get();

      if (!existingRequests.empty) {
        const existingRequest = existingRequests.docs[0].data();
        return {
          success: false,
          error: "existing_request",
          message: "A data export request is already in progress",
          requestId: existingRequests.docs[0].id,
          createdAt: existingRequest.createdAt,
        };
      }

      // Create privacy request
      const requestDoc = await db.collection("privacyRequests").add({
        uid,
        type: PrivacyRequestType.DATA_EXPORT,
        status: PrivacyRequestStatus.PENDING,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        metadata: {
          userAgent: request.rawRequest.headers["user-agent"],
          ip: request.rawRequest.ip,
        },
      });

      // Log compliance action
      await logComplianceAction(uid, "data_export_requested", {
        requestId: requestDoc.id,
      });

      // Trigger async processing
      await processDataExport(uid, requestDoc.id);

      return {
        success: true,
        requestId: requestDoc.id,
        message:
          "Data export request created. You will receive a download link within 24 hours.",
        estimatedCompletionTime: "24 hours",
      };
    } catch (error: any) {
      logger.error("Data export request failed:", error);
      throw new HttpsError("internal", "Failed to create data export request");
    }
  }
);

/**
 * Process data export (async)
 * Collects all user data and creates downloadable bundle
 */
async function processDataExport(uid: string, requestId: string): Promise<void> {
  try {
    // Update status to processing
    await db.collection("privacyRequests").doc(requestId).update({
      status: PrivacyRequestStatus.PROCESSING,
      processingStartedAt: FieldValue.serverTimestamp(),
    });

    // Collect all user data
    const userData = await collectUserData(uid);

    // Create JSON export
    const exportData = {
      exportDate: new Date().toISOString(),
      userId: uid,
      data: userData,
      metadata: {
        version: "1.0",
        dataCategories: Object.keys(userData),
      },
    };

    const exportJson = JSON.stringify(exportData, null, 2);

    // Upload to GCS
    const bucket = storage.bucket();
    const filename = `data-exports/${uid}/${requestId}.json`;
    const file = bucket.file(filename);

    await file.save(exportJson, {
      contentType: "application/json",
      metadata: {
        uid,
        requestId,
        exportedAt: new Date().toISOString(),
      },
    });

    // Generate signed URL (valid for 7 days)
    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    // Update request with download link
    await db.collection("privacyRequests").doc(requestId).update({
      status: PrivacyRequestStatus.COMPLETED,
      completedAt: FieldValue.serverTimestamp(),
      downloadUrl: signedUrl,
      expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    logger.info(`Data export completed for user: ${uid}`);

    // TODO: Send email notification with download link
  } catch (error: any) {
    logger.error("Data export processing failed:", error);

    await db.collection("privacyRequests").doc(requestId).update({
      status: PrivacyRequestStatus.FAILED,
      failedAt: FieldValue.serverTimestamp(),
      failureReason: error.message,
    });
  }
}

/**
 * Collect all user data for export
 */
async function collectUserData(uid: string): Promise<Record<string, any>> {
  const data: Record<string, any> = {};

  try {
    // User profile
    const userDoc = await db.collection("users").doc(uid).get();
    data.profile = userDoc.exists ? userDoc.data() : null;

    // Transactions
    const transactionsSnapshot = await db
      .collection("transactions")
      .where("userId", "==", uid)
      .get();
    data.transactions = transactionsSnapshot.docs.map((doc) => doc.data());

    // Chats (metadata only, no messages for privacy)
    const chatsSnapshot = await db
      .collection("chats")
      .where("participants", "array-contains", uid)
      .get();
    data.chats = chatsSnapshot.docs.map((doc) => ({
      chatId: doc.id,
      participants: doc.data().participants,
      createdAt: doc.data().createdAt,
      // Exclude message content
    }));

    // Calendar bookings
    const bookingsSnapshot = await db
      .collection("calendarBookings")
      .where("bookerId", "==", uid)
      .get();
    data.calendarBookings = bookingsSnapshot.docs.map((doc) => doc.data());

    // AI subscriptions
    const subscriptionsSnapshot = await db
      .collection("aiSubscriptions")
      .where("userId", "==", uid)
      .get();
    data.aiSubscriptions = subscriptionsSnapshot.docs.map((doc) => doc.data());

    // Content flags (if reported)
    const flagsSnapshot = await db
      .collection("contentFlags")
      .where("reporterId", "==", uid)
      .get();
    data.contentReports = flagsSnapshot.docs.map((doc) => doc.data());

    // Risk profile
    const riskDoc = await db.collection("userRiskProfiles").doc(uid).get();
    data.riskProfile = riskDoc.exists ? riskDoc.data() : null;

    // User insights
    const insightDoc = await db.collection("userInsights").doc(uid).get();
    data.insights = insightDoc.exists ? insightDoc.data() : null;

    return data;
  } catch (error: any) {
    logger.error("Error collecting user data:", error);
    throw error;
  }
}

/**
 * Request account deletion (GDPR Article 17)
 *
 * Marks account for deletion with 30-day grace period
 * Account can be restored within grace period
 */
export const requestAccountDeletionV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Validate input
    const schema = z.object({
      reason: z.string().optional(),
      confirmEmail: z.string().email().optional(),
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", "Invalid input");
    }

    const { reason } = validationResult.data;

    logger.info(`Account deletion requested by user: ${uid}`);

    try {
      // Check for existing deletion request
      const existingRequests = await db
        .collection("privacyRequests")
        .where("uid", "==", uid)
        .where("type", "==", PrivacyRequestType.ACCOUNT_DELETION)
        .where("status", "==", PrivacyRequestStatus.PENDING)
        .limit(1)
        .get();

      if (!existingRequests.empty) {
        const existingRequest = existingRequests.docs[0].data();
        return {
          success: false,
          error: "existing_request",
          message: "An account deletion request is already pending",
          requestId: existingRequests.docs[0].id,
          scheduledDeletionDate: existingRequest.scheduledDeletionAt,
        };
      }

      // Create deletion request with 30-day grace period
      const scheduledDeletionAt = Timestamp.fromMillis(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      );

      const requestDoc = await db.collection("privacyRequests").add({
        uid,
        type: PrivacyRequestType.ACCOUNT_DELETION,
        status: PrivacyRequestStatus.PENDING,
        reason: reason || "User requested",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        scheduledDeletionAt,
        gracePeriodEndsAt: scheduledDeletionAt,
      });

      // Mark user account as pending deletion
      await db.collection("users").doc(uid).update({
        accountStatus: "pending_deletion",
        deletionRequestId: requestDoc.id,
        scheduledDeletionAt,
        canRestoreUntil: scheduledDeletionAt,
        // Disable paid features
        canPurchaseTokens: false,
        canCreateBookings: false,
        canSendMessages: false,
      });

      // Log compliance action
      await logComplianceAction(uid, "account_deletion_requested", {
        requestId: requestDoc.id,
        gracePeriodDays: 30,
      });

      return {
        success: true,
        requestId: requestDoc.id,
        message:
          "Account marked for deletion. You have 30 days to restore your account.",
        gracePeriodDays: 30,
        scheduledDeletionDate: scheduledDeletionAt.toDate().toISOString(),
        canRestoreUntil: scheduledDeletionAt.toDate().toISOString(),
      };
    } catch (error: any) {
      logger.error("Account deletion request failed:", error);
      throw new HttpsError("internal", "Failed to create deletion request");
    }
  }
);

/**
 * Cancel account deletion (restore account)
 */
export const cancelAccountDeletionV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    try {
      // Find pending deletion request
      const requestsSnapshot = await db
        .collection("privacyRequests")
        .where("uid", "==", uid)
        .where("type", "==", PrivacyRequestType.ACCOUNT_DELETION)
        .where("status", "==", PrivacyRequestStatus.PENDING)
        .limit(1)
        .get();

      if (requestsSnapshot.empty) {
        throw new HttpsError("not-found", "No pending deletion request found");
      }

      const requestDoc = requestsSnapshot.docs[0];
      const requestData = requestDoc.data();

      // Check if still within grace period
      const now = Date.now();
      const gracePeriodEnd = requestData.gracePeriodEndsAt.toMillis();

      if (now > gracePeriodEnd) {
        throw new HttpsError("failed-precondition", "Grace period has expired");
      }

      // Cancel deletion request
      await requestDoc.ref.update({
        status: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
      });

      // Restore user account
      await db.collection("users").doc(uid).update({
        accountStatus: "active",
        deletionRequestId: FieldValue.delete(),
        scheduledDeletionAt: FieldValue.delete(),
        canRestoreUntil: FieldValue.delete(),
        canPurchaseTokens: true,
        canCreateBookings: true,
        canSendMessages: true,
      });

      // Log compliance action
      await logComplianceAction(uid, "account_deletion_cancelled", {
        requestId: requestDoc.id,
      });

      return {
        success: true,
        message: "Account deletion cancelled. Your account has been restored.",
      };
    } catch (error: any) {
      logger.error("Cancel deletion failed:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to cancel deletion");
    }
  }
);

/**
 * Process scheduled deletions (runs daily)
 * Permanently deletes accounts that have passed grace period
 */
export const processScheduledDeletionsScheduler = onSchedule(
  {
    schedule: "0 3 * * *", // 3 AM daily
    region: "europe-west3",
    timeoutSeconds: 540,
  },
  async (event) => {
    logger.info("Processing scheduled account deletions");

    try {
      const now = Timestamp.now();

      // Find deletion requests past grace period
      const dueForDeletionSnapshot = await db
        .collection("privacyRequests")
        .where("type", "==", PrivacyRequestType.ACCOUNT_DELETION)
        .where("status", "==", PrivacyRequestStatus.PENDING)
        .where("gracePeriodEndsAt", "<=", now)
        .limit(50)
        .get();

      if (dueForDeletionSnapshot.empty) {
        logger.info("No accounts due for deletion");
        return;
      }

      // Process each deletion
      for (const requestDoc of dueForDeletionSnapshot.docs) {
        const requestData = requestDoc.data();
        const uid = requestData.uid;

        try {
          await permanentlyDeleteUserData(uid);

          await requestDoc.ref.update({
            status: PrivacyRequestStatus.COMPLETED,
            completedAt: FieldValue.serverTimestamp(),
          });

          logger.info(`Successfully deleted account: ${uid}`);
        } catch (error: any) {
          logger.error(`Failed to delete account ${uid}:`, error);

          await requestDoc.ref.update({
            status: PrivacyRequestStatus.FAILED,
            failedAt: FieldValue.serverTimestamp(),
            failureReason: error.message,
          });
        }
      }

      logger.info(`Processed ${dueForDeletionSnapshot.size} account deletions`);
    } catch (error: any) {
      logger.error("Scheduled deletion processing failed:", error);
      throw error;
    }
  }
);

/**
 * Permanently delete all user data
 *
 * NOTE: Retains audit logs and compliance records as required by law
 */
async function permanentlyDeleteUserData(uid: string): Promise<void> {
  const batch = db.batch();

  // Delete user profile
  batch.delete(db.collection("users").doc(uid));

  // Delete user-specific collections
  const collectionsToDelete = [
    "transactions",
    "userRiskProfiles",
    "userInsights",
    "deviceTrust",
  ];

  for (const collection of collectionsToDelete) {
    const snapshot = await db.collection(collection).where("userId", "==", uid).limit(500).get();

    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
  }

  await batch.commit();

  // Anonymize retained data (for compliance)
  await anonymizeRetainedData(uid);

  logger.info(`Permanently deleted data for user: ${uid}`);
}

/**
 * Anonymize data that must be retained for legal/compliance reasons
 */
async function anonymizeRetainedData(uid: string): Promise<void> {
  // Anonymize audit logs (keep for compliance but remove PII)
  const auditLogsSnapshot = await db
    .collection("auditLogs")
    .where("uid", "==", uid)
    .limit(500)
    .get();

  const batch = db.batch();

  auditLogsSnapshot.docs.forEach((doc) => {
    batch.update(doc.ref, {
      uid: "[DELETED]",
      email: "[DELETED]",
      displayName: "[DELETED]",
      anonymizedAt: FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
}

/**
 * Log compliance action for audit trail
 */
async function logComplianceAction(
  uid: string,
  action: string,
  metadata: Record<string, any>
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  await db
    .collection("engineLogs")
    .doc("compliance")
    .collection(today)
    .doc("actions")
    .set(
      {
        actions: FieldValue.arrayUnion({
          uid,
          action,
          metadata,
          timestamp: new Date().toISOString(),
        }),
      },
      { merge: true }
    );
}

/**
 * Get privacy request status
 */
export const getPrivacyRequestStatusV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { requestId } = request.data;

    if (!requestId) {
      throw new HttpsError("invalid-argument", "requestId is required");
    }

    const requestDoc = await db.collection("privacyRequests").doc(requestId).get();

    if (!requestDoc.exists) {
      throw new HttpsError("not-found", "Privacy request not found");
    }

    const requestData = requestDoc.data();

    // Verify ownership
    if (requestData?.uid !== uid) {
      throw new HttpsError("permission-denied", "Not authorized to view this request");
    }

    return {
      requestId: requestDoc.id,
      type: requestData.type,
      status: requestData.status,
      createdAt: requestData.createdAt,
      completedAt: requestData.completedAt || null,
      downloadUrl: requestData.downloadUrl || null,
      expiresAt: requestData.expiresAt || null,
    };
  }
);


