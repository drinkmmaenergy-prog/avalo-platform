"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.likePostV1 = void 0;
const https_1 = require("firebase-functions/v2/https");
const init_1 = require("./init");
exports.likePostV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (req) => {
    const { postId } = req.data;
    const userId = req.auth?.uid;
    if (!userId)
        throw new https_1.HttpsError("unauthenticated", "User must be logged in.");
    if (!postId)
        throw new https_1.HttpsError("invalid-argument", "postId is required.");
    const postRef = init_1.db.collection("posts").doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists)
        throw new https_1.HttpsError("not-found", "Post not found.");
    await postRef.collection("likes").doc(userId).set({
        userId,
        createdAt: (0, init_1.serverTimestamp)(),
    });
    return { success: true };
});
//# sourceMappingURL=feedInteractions.js.map