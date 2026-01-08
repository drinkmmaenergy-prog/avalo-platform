import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  arrayUnion,
  arrayRemove,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { FeedItem, Post, ReportReason } from '@/shared/types/feed';

export class FeedService {
  static async fetchFeed(limitCount = 20): Promise<FeedItem[]> {
    const q = query(
      collection(db, 'feed'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as FeedItem),
    }));
  }
}

export async function likePost(postId: string, userId: string) {
  const ref = doc(db, 'posts', postId);
  await updateDoc(ref, {
    likes: arrayUnion(userId),
  });
}

export async function unlikePost(postId: string, userId: string) {
  const ref = doc(db, 'posts', postId);
  await updateDoc(ref, {
    likes: arrayRemove(userId),
  });
}

export async function savePost(postId: string, userId: string) {
  const ref = doc(db, 'users', userId);
  await updateDoc(ref, {
    savedPosts: arrayUnion(postId),
  });
}

export async function reportContent(
  postId: string,
  reason: ReportReason,
  reporterId: string
) {
  await addDoc(collection(db, 'reports'), {
    postId,
    reason,
    reporterId,
    createdAt: serverTimestamp(),
  });
}
