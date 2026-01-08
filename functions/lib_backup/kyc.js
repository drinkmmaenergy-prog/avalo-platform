"use strict";
/**
 * PHASE 21 - Trust & Identity Verification Engine (KYC)
 *
 * Identity verification flow:
 * - ID document upload
 * - Face verification
 * - Age verification (18+)
 * - Moderation queue for manual review
 *
 * Supports mockable KYC provider for testing
 * Feature flag: kyc_required
 * Region: europe-west3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewKYCVerificationV1 = exports.kycProviderWebhook = exports.getKYCStatusV1 = exports.submitKYCVerificationV1 = exports.startKYCVerificationV1 = exports.KYCMethod = exports.KYCStatus = void 0;
const https_1 = require("firebase-functions/v2/https");
const https_2 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const v2_1 = require("firebase-functions/v2");
const zod_1 = require("zod");
const featureFlags_1 = require("./featureFlags");
const db = (0, firestore_1.getFirestore)();
const storage = (0, storage_1.getStorage)();
/**
 * KYC verification status
 */
var KYCStatus;
(function (KYCStatus) {
    KYCStatus["NOT_STARTED"] = "not_started";
    KYCStatus["PENDING"] = "pending";
    KYCStatus["IN_REVIEW"] = "in_review";
    KYCStatus["APPROVED"] = "approved";
    KYCStatus["REJECTED"] = "rejected";
    KYCStatus["EXPIRED"] = "expired";
})(KYCStatus || (exports.KYCStatus = KYCStatus = {}));
/**
 * KYC verification methods
 */
var KYCMethod;
(function (KYCMethod) {
    KYCMethod["ID_DOCUMENT"] = "id_document";
    KYCMethod["FACE_MATCH"] = "face_match";
    KYCMethod["LIVENESS_CHECK"] = "liveness_check";
})(KYCMethod || (exports.KYCMethod = KYCMethod = {}));
/**
 * Start KYC verification
 * Creates verification session and returns upload URLs
 */
exports.startKYCVerificationV1 = (0, https_1.onCall)({ region: "europe-west3", timeoutSeconds: 60 }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check feature flag
    const kycRequired = await (0, featureFlags_1.getFeatureFlag)(uid, "kyc_required", false);
    // Validate input
    const schema = zod_1.z.object({
        method: zod_1.z.nativeEnum(KYCMethod).default(KYCMethod.ID_DOCUMENT),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { method } = validationResult.data;
    try {
        v2_1.logger.info(`KYC verification started for user: ${uid}`);
        // Check for existing verification
        const existingVerification = await db
            .collection("kycVerifications")
            .where("userId", "==", uid)
            .where("status", "in", [KYCStatus.PENDING, KYCStatus.IN_REVIEW])
            .limit(1)
            .get();
        if (!existingVerification.empty) {
            const existing = existingVerification.docs[0].data();
            return {
                success: false,
                error: "verification_in_progress",
                verificationId: existingVerification.docs[0].id,
                status: existing.status,
            };
        }
        // Check if already verified
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data();
        if (userData?.verification?.status === "approved") {
            // Check if expired (2 years)
            const approvedAt = userData.verification.approvedAt;
            const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
            if (approvedAt && approvedAt.toMillis() > twoYearsAgo) {
                return {
                    success: false,
                    error: "already_verified",
                    verifiedAt: approvedAt.toDate().toISOString(),
                };
            }
        }
        // Create verification session
        const verificationId = `kyc_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;
        const verification = {
            userId: uid,
            status: KYCStatus.PENDING,
            method,
            isOver18: false, // To be determined
            startedAt: firestore_1.Timestamp.now(),
            expiresAt: firestore_1.Timestamp.fromMillis(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000), // 2 years
            ipAddress: request.rawRequest.ip,
            userAgent: request.rawRequest.headers["user-agent"],
        };
        await db.collection("kycVerifications").doc(verificationId).set(verification);
        // Generate signed upload URLs for images
        const bucket = storage.bucket();
        const idFrontPath = `kyc/${uid}/${verificationId}/id_front.jpg`;
        const idBackPath = `kyc/${uid}/${verificationId}/id_back.jpg`;
        const selfiePath = `kyc/${uid}/${verificationId}/selfie.jpg`;
        const [idFrontUrl] = await bucket.file(idFrontPath).getSignedUrl({
            version: "v4",
            action: "write",
            expires: Date.now() + 30 * 60 * 1000, // 30 minutes
            contentType: "image/jpeg",
        });
        const [idBackUrl] = await bucket.file(idBackPath).getSignedUrl({
            version: "v4",
            action: "write",
            expires: Date.now() + 30 * 60 * 1000,
            contentType: "image/jpeg",
        });
        const [selfieUrl] = await bucket.file(selfiePath).getSignedUrl({
            version: "v4",
            action: "write",
            expires: Date.now() + 30 * 60 * 1000,
            contentType: "image/jpeg",
        });
        // Log compliance action
        await logKYCAction(uid, "kyc_started", { verificationId, method });
        return {
            success: true,
            verificationId,
            uploadUrls: {
                idFront: idFrontUrl,
                idBack: idBackUrl,
                selfie: selfieUrl,
            },
            expiresIn: 1800, // 30 minutes in seconds
            instructions: {
                idFront: "Upload a clear photo of the front of your ID document",
                idBack: "Upload a clear photo of the back of your ID document",
                selfie: "Take a selfie holding your ID document next to your face",
            },
        };
    }
    catch (error) {
        v2_1.logger.error("KYC start failed:", error);
        throw new https_1.HttpsError("internal", "Failed to start KYC verification");
    }
});
/**
 * Submit KYC verification for review
 * Called after images are uploaded
 */
exports.submitKYCVerificationV1 = (0, https_1.onCall)({ region: "europe-west3", timeoutSeconds: 60 }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const schema = zod_1.z.object({
        verificationId: zod_1.z.string(),
        documentType: zod_1.z.enum(["passport", "id_card", "drivers_license"]),
        documentNumber: zod_1.z.string().min(5), // Will be hashed
        dateOfBirth: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { verificationId, documentType, documentNumber, dateOfBirth } = validationResult.data;
    try {
        // Get verification
        const verificationDoc = await db
            .collection("kycVerifications")
            .doc(verificationId)
            .get();
        if (!verificationDoc.exists) {
            throw new https_1.HttpsError("not-found", "Verification session not found");
        }
        const verification = verificationDoc.data();
        if (verification.userId !== uid) {
            throw new https_1.HttpsError("permission-denied", "Unauthorized");
        }
        if (verification.status !== KYCStatus.PENDING) {
            throw new https_1.HttpsError("failed-precondition", "Verification already submitted");
        }
        // Calculate age
        const dob = new Date(dateOfBirth);
        const age = calculateAge(dob);
        const isOver18 = age >= 18;
        if (!isOver18) {
            // Reject immediately if under 18
            await verificationDoc.ref.update({
                status: KYCStatus.REJECTED,
                rejectionReason: "age_requirement_not_met",
                age,
                isOver18: false,
                dateOfBirth: firestore_1.Timestamp.fromDate(dob),
                submittedAt: firestore_1.Timestamp.now(),
                completedAt: firestore_1.Timestamp.now(),
            });
            return {
                success: false,
                error: "age_requirement_not_met",
                message: "You must be 18 or older to use this service",
            };
        }
        // Hash document number for security
        const hashedDocNumber = hashString(documentNumber);
        // Check for images in GCS
        const bucket = storage.bucket();
        const idFrontPath = `kyc/${uid}/${verificationId}/id_front.jpg`;
        const idBackPath = `kyc/${uid}/${verificationId}/id_back.jpg`;
        const selfiePath = `kyc/${uid}/${verificationId}/selfie.jpg`;
        const [idFrontExists] = await bucket.file(idFrontPath).exists();
        const [selfieExists] = await bucket.file(selfiePath).exists();
        if (!idFrontExists || !selfieExists) {
            throw new https_1.HttpsError("failed-precondition", "Required images not uploaded");
        }
        // Mock KYC provider processing
        const providerResponse = await mockKYCProvider({
            idFrontPath,
            idBackPath,
            selfiePath,
            documentType,
            dateOfBirth: dob,
        });
        // Update verification
        await verificationDoc.ref.update({
            status: KYCStatus.IN_REVIEW,
            documentType,
            documentNumber: hashedDocNumber,
            dateOfBirth: firestore_1.Timestamp.fromDate(dob),
            age,
            isOver18,
            idFrontImageUrl: idFrontPath,
            idBackImageUrl: idBackPath,
            selfieImageUrl: selfiePath,
            providerResponse,
            confidence: providerResponse.confidence,
            submittedAt: firestore_1.Timestamp.now(),
        });
        // Auto-approve if high confidence
        if (providerResponse.confidence > 90) {
            await approveKYCVerification(verificationId, "auto_approved");
        }
        // Log compliance action
        await logKYCAction(uid, "kyc_submitted", {
            verificationId,
            documentType,
            isOver18,
        });
        return {
            success: true,
            verificationId,
            status: providerResponse.confidence > 90 ? "approved" : "in_review",
            estimatedReviewTime: providerResponse.confidence > 90 ? "immediate" : "24-48 hours",
        };
    }
    catch (error) {
        v2_1.logger.error("KYC submission failed:", error);
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError("internal", "Failed to submit verification");
    }
});
/**
 * Get KYC verification status
 */
exports.getKYCStatusV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { verificationId } = request.data;
    if (verificationId) {
        // Get specific verification
        const verificationDoc = await db.collection("kycVerifications").doc(verificationId).get();
        if (!verificationDoc.exists) {
            throw new https_1.HttpsError("not-found", "Verification not found");
        }
        const verification = verificationDoc.data();
        if (verification.userId !== uid) {
            throw new https_1.HttpsError("permission-denied", "Unauthorized");
        }
        return {
            verificationId,
            status: verification.status,
            method: verification.method,
            isOver18: verification.isOver18,
            startedAt: verification.startedAt,
            submittedAt: verification.submittedAt || null,
            completedAt: verification.completedAt || null,
            rejectionReason: verification.rejectionReason || null,
        };
    }
    else {
        // Get latest verification
        const latestSnapshot = await db
            .collection("kycVerifications")
            .where("userId", "==", uid)
            .orderBy("startedAt", "desc")
            .limit(1)
            .get();
        if (latestSnapshot.empty) {
            return {
                status: KYCStatus.NOT_STARTED,
            };
        }
        const verification = latestSnapshot.docs[0].data();
        return {
            verificationId: latestSnapshot.docs[0].id,
            status: verification.status,
            method: verification.method,
            isOver18: verification.isOver18,
            startedAt: verification.startedAt,
            submittedAt: verification.submittedAt || null,
            completedAt: verification.completedAt || null,
            rejectionReason: verification.rejectionReason || null,
        };
    }
});
/**
 * Webhook endpoint for KYC provider callbacks
 * Mockable for testing
 */
exports.kycProviderWebhook = (0, https_2.onRequest)({ region: "europe-west3" }, async (req, res) => {
    try {
        // Validate webhook signature (in production)
        // const signature = req.headers['x-webhook-signature'];
        // if (!validateWebhookSignature(signature, req.body)) {
        //   res.status(401).send('Invalid signature');
        //   return;
        // }
        const { verificationId, status, confidence, extractedData } = req.body;
        if (!verificationId) {
            res.status(400).send("Missing verificationId");
            return;
        }
        const verificationDoc = await db
            .collection("kycVerifications")
            .doc(verificationId)
            .get();
        if (!verificationDoc.exists) {
            res.status(404).send("Verification not found");
            return;
        }
        // Update verification with provider results
        await verificationDoc.ref.update({
            providerResponse: {
                status,
                confidence,
                extractedData,
                receivedAt: new Date().toISOString(),
            },
            confidence,
        });
        v2_1.logger.info(`KYC webhook processed for ${verificationId}`);
        res.status(200).send({ success: true });
    }
    catch (error) {
        v2_1.logger.error("KYC webhook failed:", error);
        res.status(500).send("Webhook processing failed");
    }
});
/**
 * Admin: Review and approve/reject KYC
 */
exports.reviewKYCVerificationV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const adminUid = request.auth?.uid;
    if (!adminUid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check admin role
    const adminDoc = await db.collection("users").doc(adminUid).get();
    const adminData = adminDoc.data();
    if (!adminData?.role || !["admin", "moderator"].includes(adminData.role)) {
        throw new https_1.HttpsError("permission-denied", "Admin access required");
    }
    const schema = zod_1.z.object({
        verificationId: zod_1.z.string(),
        action: zod_1.z.enum(["approve", "reject"]),
        notes: zod_1.z.string().optional(),
        rejectionReason: zod_1.z.string().optional(),
    });
    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
        throw new https_1.HttpsError("invalid-argument", validationResult.error.message);
    }
    const { verificationId, action, notes, rejectionReason } = validationResult.data;
    if (action === "approve") {
        await approveKYCVerification(verificationId, adminUid, notes);
    }
    else {
        await rejectKYCVerification(verificationId, adminUid, rejectionReason, notes);
    }
    return { success: true, action };
});
/**
 * Approve KYC verification
 */
async function approveKYCVerification(verificationId, reviewerId, notes) {
    const verificationDoc = await db.collection("kycVerifications").doc(verificationId).get();
    if (!verificationDoc.exists) {
        throw new Error("Verification not found");
    }
    const verification = verificationDoc.data();
    // Update verification
    await verificationDoc.ref.update({
        status: KYCStatus.APPROVED,
        reviewedBy: reviewerId,
        reviewedAt: firestore_1.Timestamp.now(),
        reviewNotes: notes || "",
        completedAt: firestore_1.Timestamp.now(),
    });
    // Update user profile
    await db
        .collection("users")
        .doc(verification.userId)
        .update({
        "verification.status": "approved",
        "verification.approvedAt": firestore_1.Timestamp.now(),
        "verification.method": verification.method,
        "verification.age18": verification.isOver18,
    });
    v2_1.logger.info(`KYC approved for user: ${verification.userId}`);
    // Log compliance action
    await logKYCAction(verification.userId, "kyc_approved", {
        verificationId,
        reviewerId,
    });
}
/**
 * Reject KYC verification
 */
async function rejectKYCVerification(verificationId, reviewerId, reason, notes) {
    const verificationDoc = await db.collection("kycVerifications").doc(verificationId).get();
    if (!verificationDoc.exists) {
        throw new Error("Verification not found");
    }
    const verification = verificationDoc.data();
    await verificationDoc.ref.update({
        status: KYCStatus.REJECTED,
        reviewedBy: reviewerId,
        reviewedAt: firestore_1.Timestamp.now(),
        rejectionReason: reason || "manual_review_failed",
        reviewNotes: notes || "",
        completedAt: firestore_1.Timestamp.now(),
    });
    v2_1.logger.info(`KYC rejected for user: ${verification.userId}`);
    // Log compliance action
    await logKYCAction(verification.userId, "kyc_rejected", {
        verificationId,
        reviewerId,
        reason,
    });
}
/**
 * Mock KYC provider (for testing)
 * In production, integrate with real KYC service (Onfido, Jumio, etc.)
 */
async function mockKYCProvider(data) {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // Mock response with high confidence
    return {
        success: true,
        confidence: 95,
        extractedData: {
            fullName: "Test User",
            dateOfBirth: data.dateOfBirth.toISOString(),
            documentType: data.documentType,
            documentCountry: "PL",
        },
        checks: {
            documentAuthenticity: "pass",
            faceMatch: "pass",
            livenessCheck: "pass",
        },
        provider: "mock",
        timestamp: new Date().toISOString(),
    };
}
function hashString(input) {
    // Simple hash for demo - use crypto.createHash in production
    return Buffer.from(input).toString("base64");
}
function calculateAge(dateOfBirth) {
    const today = new Date();
    let age = today.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = today.getMonth() - dateOfBirth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
        age--;
    }
    return age;
}
async function logKYCAction(userId, action, metadata) {
    const today = new Date().toISOString().split("T")[0];
    await db
        .collection("engineLogs")
        .doc("kyc")
        .collection(today)
        .doc("actions")
        .set({
        actions: firestore_1.FieldValue.arrayUnion({
            userId,
            action,
            metadata,
            timestamp: new Date().toISOString(),
        }),
    }, { merge: true });
}
//# sourceMappingURL=kyc.js.map