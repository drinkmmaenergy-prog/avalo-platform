"use strict";
/**
 * Content Intelligence Engine - Phase 15
 *
 * ML-lite content classification and flagging:
 * - Auto-scan new posts and photos
 * - NSFW detection
 * - Scam detection
 * - Flag only (never delete)
 * - GDPR-safe metadata
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewContentFlagCallable = exports.scanNewPhotoTrigger = exports.scanNewPostTrigger = exports.ContentCategory = void 0;
exports.classifyContent = classifyContent;
exports.markContentFlag = markContentFlag;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const db = (0, firestore_2.getFirestore)();
/**
 * Content category enum
 */
var ContentCategory;
(function (ContentCategory) {
    ContentCategory["SAFE"] = "safe";
    ContentCategory["NSFW"] = "nsfw";
    ContentCategory["SCAM"] = "scam";
    ContentCategory["SPAM"] = "spam";
    ContentCategory["HATE_SPEECH"] = "hate_speech";
    ContentCategory["VIOLENCE"] = "violence";
    ContentCategory["UNKNOWN"] = "unknown";
})(ContentCategory || (exports.ContentCategory = ContentCategory = {}));
/**
 * Scan new content trigger - Posts
 */
exports.scanNewPostTrigger = (0, firestore_1.onDocumentCreated)({
    document: "feedPosts/{postId}",
    region: "europe-west3",
}, async (event) => {
    const postData = event.data?.data();
    if (!postData)
        return;
    const postId = event.params.postId;
    try {
        const content = postData.caption || postData.text || "";
        const userId = postData.uid;
        const classification = await classifyContent(content, "text");
        if (classification.flagOnly && classification.confidence > 0.7) {
            await markContentFlag({
                contentType: "post",
                contentId: postId,
                userId,
                category: classification.category,
                confidence: classification.confidence,
                aiSignature: classification.metadata.mlSignature || "content-engine-v1",
            });
            console.log(`Post ${postId} flagged as ${classification.category} (confidence: ${classification.confidence})`);
        }
        // Log to engine logs
        await logEngineEvent("contentEngine", "post_scanned", {
            postId,
            category: classification.category,
            confidence: classification.confidence,
            flagged: classification.flagOnly && classification.confidence > 0.7,
        });
    }
    catch (error) {
        console.error(`Error scanning post ${postId}:`, error);
    }
});
/**
 * Scan new content trigger - Photos
 * Note: Actual image analysis would require Vision API or similar
 */
exports.scanNewPhotoTrigger = (0, firestore_1.onDocumentCreated)({
    document: "users/{userId}/photos/{photoId}",
    region: "europe-west3",
}, async (event) => {
    const photoData = event.data?.data();
    if (!photoData)
        return;
    const userId = event.params.userId;
    const photoId = event.params.photoId;
    try {
        // Placeholder for image analysis
        // In production, would call Vision API or ML model
        const classification = {
            category: ContentCategory.SAFE,
            confidence: 0.95,
            flagOnly: false,
            metadata: {
                mlSignature: "content-engine-image-v1",
            },
        };
        if (classification.flagOnly && classification.confidence > 0.7) {
            await markContentFlag({
                contentType: "photo",
                contentId: photoId,
                userId,
                category: classification.category,
                confidence: classification.confidence,
                aiSignature: classification.metadata.mlSignature || "content-engine-v1",
            });
            console.log(`Photo ${photoId} flagged as ${classification.category} (confidence: ${classification.confidence})`);
        }
        // Log to engine logs
        await logEngineEvent("contentEngine", "photo_scanned", {
            userId,
            photoId,
            category: classification.category,
            confidence: classification.confidence,
            flagged: classification.flagOnly && classification.confidence > 0.7,
        });
    }
    catch (error) {
        console.error(`Error scanning photo ${photoId}:`, error);
    }
});
/**
 * Classify content using ML-lite heuristics
 */
async function classifyContent(content, contentType) {
    if (contentType === "image") {
        // Placeholder for image classification
        // Would integrate with Vision API or TensorFlow model
        return {
            category: ContentCategory.SAFE,
            confidence: 0.95,
            flagOnly: false,
            metadata: {
                mlSignature: "content-engine-image-v1",
            },
        };
    }
    // Text classification using keyword matching
    const lowerContent = content.toLowerCase();
    // NSFW keywords
    const nsfwKeywords = [
        "nsfw",
        "nude",
        "naked",
        "porn",
        "xxx",
        "explicit",
        "adult content",
    ];
    // Scam keywords
    const scamKeywords = [
        "send money",
        "wire transfer",
        "western union",
        "moneygram",
        "gift card",
        "bitcoin wallet",
        "crypto wallet",
        "investment opportunity",
        "guaranteed returns",
        "get rich quick",
    ];
    // Spam keywords
    const spamKeywords = [
        "click here",
        "buy now",
        "limited time",
        "act fast",
        "free money",
        "congratulations you won",
    ];
    // Hate speech keywords
    const hateSpeechKeywords = [
        // Intentionally minimal for demo
        "hate speech placeholder",
    ];
    // Violence keywords
    const violenceKeywords = [
        "kill",
        "murder",
        "weapon",
        "bomb",
        "terrorist",
    ];
    let category = ContentCategory.SAFE;
    let confidence = 0.5;
    let matchedKeywords = [];
    // Check each category
    const nsfwMatches = nsfwKeywords.filter((kw) => lowerContent.includes(kw));
    if (nsfwMatches.length > 0) {
        category = ContentCategory.NSFW;
        confidence = Math.min(0.95, 0.6 + nsfwMatches.length * 0.15);
        matchedKeywords = nsfwMatches;
    }
    const scamMatches = scamKeywords.filter((kw) => lowerContent.includes(kw));
    if (scamMatches.length > 0 && confidence < 0.8) {
        category = ContentCategory.SCAM;
        confidence = Math.min(0.95, 0.7 + scamMatches.length * 0.1);
        matchedKeywords = scamMatches;
    }
    const spamMatches = spamKeywords.filter((kw) => lowerContent.includes(kw));
    if (spamMatches.length > 1 && confidence < 0.75) {
        category = ContentCategory.SPAM;
        confidence = Math.min(0.9, 0.65 + spamMatches.length * 0.1);
        matchedKeywords = spamMatches;
    }
    const hateMatches = hateSpeechKeywords.filter((kw) => lowerContent.includes(kw));
    if (hateMatches.length > 0) {
        category = ContentCategory.HATE_SPEECH;
        confidence = 0.85;
        matchedKeywords = hateMatches;
    }
    const violenceMatches = violenceKeywords.filter((kw) => lowerContent.includes(kw));
    if (violenceMatches.length > 0 && confidence < 0.8) {
        category = ContentCategory.VIOLENCE;
        confidence = Math.min(0.9, 0.7 + violenceMatches.length * 0.1);
        matchedKeywords = violenceMatches;
    }
    // Determine if flagOnly (NSFW and SCAM are flagOnly, not removed)
    const flagOnly = category === ContentCategory.NSFW ||
        category === ContentCategory.SCAM ||
        category === ContentCategory.SPAM;
    return {
        category,
        confidence,
        flagOnly,
        metadata: {
            keywords: matchedKeywords,
            patterns: [],
            mlSignature: "content-engine-text-v1",
        },
    };
}
/**
 * Mark content flag
 */
async function markContentFlag(params) {
    const flagRef = db.collection("flags").doc("content").collection("items").doc();
    const flag = {
        flagId: flagRef.id,
        contentType: params.contentType,
        contentId: params.contentId,
        userId: params.userId,
        category: params.category,
        confidence: params.confidence,
        aiSignature: params.aiSignature,
        flaggedAt: firestore_2.FieldValue.serverTimestamp(),
        reviewed: false,
    };
    await flagRef.set(flag);
    // Log to engine logs
    await logEngineEvent("contentEngine", "content_flagged", {
        contentType: params.contentType,
        contentId: params.contentId,
        category: params.category,
        confidence: params.confidence,
    });
}
/**
 * Review content flag (admin/moderator callable)
 */
exports.reviewContentFlagCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check if user is moderator or admin
    const userDoc = await db.collection("users").doc(uid).get();
    const roles = userDoc.data()?.roles || {};
    if (!roles.moderator && !roles.admin) {
        throw new https_1.HttpsError("permission-denied", "Only moderators can review flags");
    }
    const { flagId, action } = request.data;
    if (!flagId || !action) {
        throw new https_1.HttpsError("invalid-argument", "Missing required fields");
    }
    try {
        const flagRef = db.collection("flags").doc("content").collection("items").doc(flagId);
        const flagDoc = await flagRef.get();
        if (!flagDoc.exists) {
            throw new https_1.HttpsError("not-found", "Flag not found");
        }
        await flagRef.update({
            reviewed: true,
            reviewedBy: uid,
            reviewedAt: firestore_2.FieldValue.serverTimestamp(),
            action,
        });
        // Log to engine logs
        await logEngineEvent("contentEngine", "flag_reviewed", {
            flagId,
            reviewerId: uid,
            action,
        });
        return { success: true };
    }
    catch (error) {
        console.error("Error reviewing flag:", error);
        throw new https_1.HttpsError("internal", `Failed to review flag: ${error.message}`);
    }
});
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
        timestamp: firestore_2.FieldValue.serverTimestamp(),
    });
}
//# sourceMappingURL=contentEngine.js.map