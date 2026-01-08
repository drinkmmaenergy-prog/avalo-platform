/**
 * PACK 84 — KYC & Identity Verification Cloud Functions
 * Manual/semi-manual KYC system for payout eligibility
 *
 * COMPLIANCE RULES:
 * - No free tokens, no bonuses, no discounts tied to KYC
 * - Token price remains fixed (no changes)
 * - Revenue split unchanged (65/35)
 * - KYC only gates payouts, not earning
 *
 * PACK 85 Integration: KYC events now log to Trust & Risk Engine
 * PACK 296 Integration: All KYC events logged to audit system
 */

import * as functions from "firebase-functions";
import { db, serverTimestamp, generateId } from "./init";
import { onKycRejected, onKycBlocked } from "./trustRiskIntegrations";
import { onKycSubmission } from "./moderationCaseHooks";
import { enforceStepUpForKYC } from "./pack96-twoFactorIntegrations";
import { logKycEvent } from "./pack296-audit-helpers";
import {
  UserKycStatus,
  UserKycDocument,
  KycApplicationPayload,
  ApproveKycPayload,
  RejectKycPayload,
  BlockKycPayload,
  KycStatusResponse,
  KycDocumentResponse,
  KycError,
  KYC_ERROR_CODES,
  KycStatus,
  DocumentStatus,
} from "./types/kyc.types";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate KYC application payload
 */
function validateKycApplicationPayload(payload: any): KycApplicationPayload {
  const errors: string[] = [];

  if (!payload.documentType || !["ID_CARD", "PASSPORT", "DRIVERS_LICENSE"].includes(payload.documentType)) {
    errors.push("Invalid or missing documentType");
  }
  if (!payload.frontImageUrl || typeof payload.frontImageUrl !== "string") {
    errors.push("Missing frontImageUrl");
  }
  if (!payload.selfieImageUrl || typeof payload.selfieImageUrl !== "string") {
    errors.push("Missing selfieImageUrl");
  }
  if (!payload.country || typeof payload.country !== "string" || payload.country.length !== 2) {
    errors.push("Invalid country code (expected 2-letter ISO code)");
  }
  if (!payload.fullName || typeof payload.fullName !== "string" || payload.fullName.trim().length < 2) {
    errors.push("Invalid fullName");
  }
  
  // Validate date format YYYY-MM-DD
  if (!payload.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(payload.dateOfBirth)) {
    errors.push("Invalid dateOfBirth format (expected YYYY-MM-DD)");
  }

  if (errors.length > 0) {
    throw new KycError(
      KYC_ERROR_CODES.MISSING_REQUIRED_FIELD,
      "Validation failed: " + errors.join(", "),
      { errors }
    );
  }

  return {
    documentType: payload.documentType,
    frontImageUrl: payload.frontImageUrl,
    backImageUrl: payload.backImageUrl || undefined,
    selfieImageUrl: payload.selfieImageUrl,
    country: payload.country.toUpperCase(),
    fullName: payload.fullName.trim(),
    dateOfBirth: payload.dateOfBirth,
  };
}

/**
 * Check if user can submit KYC (status must be NOT_STARTED or REJECTED)
 */
async function canSubmitKyc(userId: string): Promise<{ canSubmit: boolean; reason?: string }> {
  const statusDoc = await db.collection("user_kyc_status").doc(userId).get();
  
  if (!statusDoc.exists) {
    return { canSubmit: true }; // New user, can submit
  }

  const status = statusDoc.data() as UserKycStatus;
  
  if (status.status === "NOT_STARTED" || status.status === "REJECTED") {
    return { canSubmit: true };
  }

  if (status.status === "PENDING") {
    return { canSubmit: false, reason: "KYC application is already pending review" };
  }

  if (status.status === "VERIFIED") {
    return { canSubmit: false, reason: "You are already verified" };
  }

  if (status.status === "BLOCKED") {
    return { canSubmit: false, reason: "Your account is blocked from verification" };
  }

  return { canSubmit: false, reason: "Cannot submit KYC at this time" };
}

/**
 * Check if user is verified for payouts
 */
export async function isUserVerifiedForPayouts(userId: string): Promise<boolean> {
  const statusDoc = await db.collection("user_kyc_status").doc(userId).get();
  
  if (!statusDoc.exists) {
    return false;
  }

  const status = statusDoc.data() as UserKycStatus;
  return status.status === "VERIFIED" && status.level === "BASIC";
}

/**
 * Get KYC status with computed fields
 */
async function getKycStatusWithComputed(userId: string): Promise<KycStatusResponse> {
  const statusDoc = await db.collection("user_kyc_status").doc(userId).get();
  
  if (!statusDoc.exists) {
    // Default status for new users
    return {
      userId,
      status: "NOT_STARTED",
      level: "NONE",
      lastUpdatedAt: new Date().toISOString(),
      canRequestPayout: false,
    };
  }

  const status = statusDoc.data() as UserKycStatus;
  
  return {
    userId,
    status: status.status,
    level: status.level,
    lastUpdatedAt: status.lastUpdatedAt.toDate().toISOString(),
    rejectionReason: status.rejectionReason,
    canRequestPayout: status.status === "VERIFIED" && status.level === "BASIC",
  };
}

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

/**
 * Submit KYC Application
 * Callable function for users to submit identity verification
 */
export const kyc_submitApplication_callable = functions.https.onCall(
  async (data, context) => {
    // Authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required"
      );
    }

    const userId = context.auth.uid;

    try {
      // PACK 96: Step-up verification for KYC submission
      await enforceStepUpForKYC(userId);

      // Validate payload
      const payload = validateKycApplicationPayload(data.payload);

      // Check if user can submit
      const canSubmit = await canSubmitKyc(userId);
      if (!canSubmit.canSubmit) {
        throw new KycError(
          KYC_ERROR_CODES.INVALID_STATUS_FOR_SUBMISSION,
          canSubmit.reason || "Cannot submit KYC application"
        );
      }

      // Create KYC document
      const documentId = generateId();
      const now = serverTimestamp();

      const kycDocument: UserKycDocument = {
        id: documentId,
        userId,
        status: "PENDING",
        documentType: payload.documentType,
        frontImageUrl: payload.frontImageUrl,
        backImageUrl: payload.backImageUrl,
        selfieImageUrl: payload.selfieImageUrl,
        country: payload.country,
        fullName: payload.fullName,
        dateOfBirth: payload.dateOfBirth,
        submittedAt: now as any,
      };

      // Update KYC status
      const kycStatus: UserKycStatus = {
        userId,
        status: "PENDING",
        level: "NONE",
        lastUpdatedAt: now as any,
      };

      // Write both documents atomically
      const batch = db.batch();
      batch.set(db.collection("user_kyc_documents").doc(documentId), kycDocument);
      batch.set(db.collection("user_kyc_status").doc(userId), kycStatus);
      await batch.commit();

      console.log(`KYC application submitted for user ${userId}, document ${documentId}`);

      // PACK 296: Log to audit system
      await logKycEvent(userId, 'KYC_SUBMITTED', {
        documentId,
      });

      // PACK 88: Create moderation case
      try {
        await onKycSubmission(userId, documentId);
      } catch (error) {
        console.error('Failed to create moderation case for KYC submission:', error);
        // Don't fail the submission if case creation fails
      }

      return {
        success: true,
        documentId,
        message: "KYC application submitted successfully. It will be reviewed shortly.",
      };
    } catch (error: any) {
      console.error("Error submitting KYC application:", error);
      
      if (error instanceof KycError) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          error.message,
          { code: error.code, details: error.details }
        );
      }

      throw new functions.https.HttpsError(
        "internal",
        "Failed to submit KYC application",
        { error: error.message }
      );
    }
  }
);

/**
 * Get KYC Status
 * Fetch current KYC status for user
 */
export const kyc_getStatus_callable = functions.https.onCall(
  async (data, context) => {
    // Authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required"
      );
    }

    const userId = context.auth.uid;

    try {
      const status = await getKycStatusWithComputed(userId);
      return status;
    } catch (error: any) {
      console.error("Error getting KYC status:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to get KYC status",
        { error: error.message }
      );
    }
  }
);

/**
 * Get KYC Documents
 * Fetch user's submitted KYC documents (without sensitive image URLs)
 */
export const kyc_getDocuments_callable = functions.https.onCall(
  async (data, context) => {
    // Authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required"
      );
    }

    const userId = context.auth.uid;

    try {
      const documentsSnapshot = await db
        .collection("user_kyc_documents")
        .where("userId", "==", userId)
        .orderBy("submittedAt", "desc")
        .get();

      const documents: KycDocumentResponse[] = documentsSnapshot.docs.map((doc) => {
        const data = doc.data() as UserKycDocument;
        
        return {
          id: data.id,
          documentType: data.documentType,
          status: data.status,
          country: data.country,
          fullName: data.fullName,
          dateOfBirth: data.dateOfBirth,
          submittedAt: data.submittedAt.toDate().toISOString(),
          reviewedAt: data.reviewedAt?.toDate().toISOString(),
          rejectionReason: data.rejectionReason,
          // Note: Image URLs intentionally excluded for security
        };
      });

      return { documents };
    } catch (error: any) {
      console.error("Error getting KYC documents:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to get KYC documents",
        { error: error.message }
      );
    }
  }
);

// ============================================================================
// ADMIN FUNCTIONS (Manual Review)
// ============================================================================

/**
 * Approve KYC Application
 * Admin function to approve a KYC submission
 */
export const kyc_approve_callable = functions.https.onCall(
  async (data: ApproveKycPayload, context) => {
    // Admin authentication check (simplified for now)
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required"
      );
    }

    // TODO: Add proper admin role check
    // For now, any authenticated user can call this (should be restricted to admins)
    const reviewerId = context.auth.uid;

    try {
      const { userId, documentId } = data;

      if (!userId || !documentId) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "userId and documentId are required"
        );
      }

      // Get document
      const docRef = db.collection("user_kyc_documents").doc(documentId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        throw new KycError(
          KYC_ERROR_CODES.DOCUMENT_NOT_FOUND,
          "KYC document not found"
        );
      }

      const document = docSnap.data() as UserKycDocument;

      if (document.userId !== userId) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Document does not belong to specified user"
        );
      }

      if (document.status !== "PENDING") {
        throw new KycError(
          KYC_ERROR_CODES.ALREADY_REVIEWED,
          `Document has already been reviewed (status: ${document.status})`
        );
      }

      const now = serverTimestamp();

      // Update document and status atomically
      const batch = db.batch();

      // Update document to APPROVED
      batch.update(docRef, {
        status: "APPROVED" as DocumentStatus,
        reviewedAt: now,
        reviewerId,
      });

      // Update user KYC status to VERIFIED
      batch.set(db.collection("user_kyc_status").doc(userId), {
        userId,
        status: "VERIFIED" as KycStatus,
        level: "BASIC",
        lastUpdatedAt: now,
        reviewerId,
      });

      await batch.commit();

      console.log(`KYC approved for user ${userId} by reviewer ${reviewerId}`);

      // PACK 296: Log to audit system
      await logKycEvent(userId, 'KYC_VERIFIED', {
        documentId,
        reviewerId,
      });

      return {
        success: true,
        message: "KYC application approved successfully",
      };
    } catch (error: any) {
      console.error("Error approving KYC:", error);

      if (error instanceof KycError) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          error.message,
          { code: error.code }
        );
      }

      throw new functions.https.HttpsError(
        "internal",
        "Failed to approve KYC",
        { error: error.message }
      );
    }
  }
);

/**
 * Reject KYC Application
 * Admin function to reject a KYC submission
 */
export const kyc_reject_callable = functions.https.onCall(
  async (data: RejectKycPayload, context) => {
    // Admin authentication check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required"
      );
    }

    const reviewerId = context.auth.uid;

    try {
      const { userId, documentId, reason } = data;

      if (!userId || !documentId || !reason) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "userId, documentId, and reason are required"
        );
      }

      // Get document
      const docRef = db.collection("user_kyc_documents").doc(documentId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        throw new KycError(
          KYC_ERROR_CODES.DOCUMENT_NOT_FOUND,
          "KYC document not found"
        );
      }

      const document = docSnap.data() as UserKycDocument;

      if (document.userId !== userId) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Document does not belong to specified user"
        );
      }

      if (document.status !== "PENDING") {
        throw new KycError(
          KYC_ERROR_CODES.ALREADY_REVIEWED,
          `Document has already been reviewed (status: ${document.status})`
        );
      }

      const now = serverTimestamp();

      // Update document and status atomically
      const batch = db.batch();

      // Update document to REJECTED
      batch.update(docRef, {
        status: "REJECTED" as DocumentStatus,
        reviewedAt: now,
        reviewerId,
        rejectionReason: reason,
      });

      // Update user KYC status to REJECTED
      batch.set(db.collection("user_kyc_status").doc(userId), {
        userId,
        status: "REJECTED" as KycStatus,
        level: "NONE",
        lastUpdatedAt: now,
        reviewerId,
        rejectionReason: reason,
      });

      await batch.commit();

      console.log(`KYC rejected for user ${userId} by reviewer ${reviewerId}. Reason: ${reason}`);

      // PACK 296: Log to audit system
      await logKycEvent(userId, 'KYC_REJECTED', {
        documentId,
        reviewerId,
        reason,
      });

      // PACK 85: Log to Trust & Risk Engine
      try {
        await onKycRejected(userId, documentId, reason);
      } catch (error) {
        console.error('Failed to log KYC rejection to Trust Engine:', error);
        // Don't fail the rejection if trust logging fails
      }

      return {
        success: true,
        message: "KYC application rejected",
      };
    } catch (error: any) {
      console.error("Error rejecting KYC:", error);

      if (error instanceof KycError) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          error.message,
          { code: error.code }
        );
      }

      throw new functions.https.HttpsError(
        "internal",
        "Failed to reject KYC",
        { error: error.message }
      );
    }
  }
);

/**
 * Block User from KYC
 * Admin function to permanently block a user from payouts
 */
export const kyc_block_callable = functions.https.onCall(
  async (data: BlockKycPayload, context) => {
    // Admin authentication check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required"
      );
    }

    const reviewerId = context.auth.uid;

    try {
      const { userId, reason } = data;

      if (!userId || !reason) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "userId and reason are required"
        );
      }

      const now = serverTimestamp();

      // Update user KYC status to BLOCKED
      await db.collection("user_kyc_status").doc(userId).set({
        userId,
        status: "BLOCKED" as KycStatus,
        level: "NONE",
        lastUpdatedAt: now,
        reviewerId,
        rejectionReason: reason,
      });

      console.log(`User ${userId} blocked from KYC by reviewer ${reviewerId}. Reason: ${reason}`);

      // PACK 85: Log to Trust & Risk Engine
      try {
        await onKycBlocked(userId, reason);
      } catch (error) {
        console.error('Failed to log KYC block to Trust Engine:', error);
        // Don't fail the block if trust logging fails
      }

      return {
        success: true,
        message: "User blocked from payouts",
      };
    } catch (error: any) {
      console.error("Error blocking user:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to block user",
        { error: error.message }
      );
    }
  }
);
