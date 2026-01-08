import { HttpsError } from 'firebase-functions/v2/https';
;

export const likePostV1 = onCall({ region: "europe-west3" }, async (req) => {
  const { postId } = req.data;
  const userId = req.auth?.uid;
  if (!userId) throw new HttpsError("unauthenticated", "User must be logged in.");
  if (!postId) throw new HttpsError("invalid-argument", "postId is required.");

  const postRef = db.collection("posts").doc(postId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) throw new HttpsError("not-found", "Post not found.");

  await postRef.collection("likes").doc(userId).set({
    userId,
    createdAt: serverTimestamp(),
  });

  return { success: true };
});


