/**
 * feed.ts - Simple public post creation + global feed fetch
 * Avalo Mobile App Functions
 */

import { HttpsError } from 'firebase-functions/v2/https';
;
;

// Schema for creating a post
const CreatePostSchema = z.object({
  text: z.string().min(1).max(5000),
  mediaUrls: z.array(z.string().url()).optional(),
});

// Schema for getting feed
const GetFeedSchema = z.object({
  limit: z.number().min(1).max(50).optional().default(20),
  startAfter: z.string().optional(),
});

/**
 * Create a new post
 * Mobile-friendly version for Avalo app
 */
export const createPostV1 = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "User must be logged in");
    }

    const data = CreatePostSchema.parse(request.data);

    const post = {
      uid: auth.uid,
      text: data.text,
      mediaUrls: data.mediaUrls || [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const ref = await db.collection("posts").add(post);

    return {
      success: true,
      id: ref.id,
      post: {
        id: ref.id,
        ...post,
        createdAt: Date.now(),
      }
    };
  }
);

/**
 * Get global feed
 * Returns posts ordered by creation time
 */
export const getGlobalFeedV1 = onCall(
  { region: "us-central1" },
  async (request) => {
    const data = GetFeedSchema.parse(request.data);

    let query = db
      .collection("posts")
      .orderBy("createdAt", "desc")
      .limit(data.limit);

    // Pagination support
    if (data.startAfter) {
      const startDoc = await db.collection("posts").doc(data.startAfter).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc);
      }
    }

    const snap = await query.get();
    const posts = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        uid: data.uid,
        text: data.text,
        mediaUrls: data.mediaUrls || [],
        createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now(),
      };
    });

    return {
      success: true,
      posts,
      hasMore: posts.length === data.limit,
    };
  }
);


