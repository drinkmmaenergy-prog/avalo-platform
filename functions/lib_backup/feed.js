"use strict";
/**
 * feed.ts - Simple public post creation + global feed fetch
 * Avalo Emulator Test Module
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGlobalFeedV1 = exports.createPostV1 = void 0;
const https_1 = require("firebase-functions/v2/https");
const init_1 = require("./init");
const zod_1 = require("zod");
// Schemat walidacji danych wejściowych
const CreatePostSchema = zod_1.z.object({
    region: zod_1.z.enum(["EU", "US", "ASIA", "GLOBAL"]),
    language: zod_1.z.string(),
    content: zod_1.z.string().min(1),
    visibility: zod_1.z.enum(["public", "private"]).default("public"),
});
/**
 * Tworzy nowy post w Firestore.
 * Kolekcja: posts
 */
exports.createPostV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const auth = request.auth;
    if (!auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be logged in");
    }
    const data = CreatePostSchema.parse(request.data);
    const post = {
        userId: auth.uid,
        ...data,
        createdAt: (0, init_1.serverTimestamp)(),
    };
    const ref = await init_1.db.collection("posts").add(post);
    return { success: true, id: ref.id };
});
/**
 * Pobiera posty globalne wg regionu i języka
 */
exports.getGlobalFeedV1 = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    const { region, language } = request.data;
    const query = init_1.db
        .collection("posts")
        .where("region", "==", region)
        .where("language", "==", language)
        .orderBy("createdAt", "desc")
        .limit(20);
    const snap = await query.get();
    const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return {
        success: true,
        count: posts.length,
        posts,
    };
});
//# sourceMappingURL=feed.js.map