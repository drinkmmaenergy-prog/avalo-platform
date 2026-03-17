"use client";

/**
 * Feed, Stories, and Reels Service
 * Handles content fetching with infinite scroll, NSFW gating, and premium unlocks
 */

import { requireDb, requireFunctions } from '../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  increment,
  Timestamp,
  DocumentSnapshot,
  QueryConstraint,
  deleteDoc,
  setDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Post, Story, Reel } from '../types';

const POSTS_PER_PAGE = 20;
const STORIES_PER_FETCH = 50;
const REELS_PER_PAGE = 10;

// ============================================================================
// FEED POSTS
// ============================================================================

export interface FeedFilters {
  includeNSFW?: boolean;
  onlyFollowing?: boolean;
  userId?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}

/**
 * Fetch feed posts with pagination
 */
export async function fetchFeedPosts(
  lastDoc: DocumentSnapshot | null = null,
  filters: FeedFilters = {}
): Promise<PaginatedResult<Post>> {
  try {
    const constraints: QueryConstraint[] = [
      orderBy('createdAt', 'desc'),
      limit(POSTS_PER_PAGE),
    ];

    // NSFW filter
    if (!filters.includeNSFW) {
      constraints.unshift(where('isNSFW', '==', false));
    }

    // User-specific posts
    if (filters.userId) {
      constraints.unshift(where('userId', '==', filters.userId));
    }

    if (lastDoc) {
      constraints.push(startAfter(lastDoc));
    }

    const q = query(collection(requireDb(), 'posts'), ...constraints);
    const snapshot = await getDocs(q);

    const posts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Post[];

    return {
      items: posts,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
      hasMore: posts.length === POSTS_PER_PAGE,
    };
  } catch (error) {
    console.error('Error fetching feed posts:', error);
    throw error;
  }
}

/**
 * Fetch a single post by ID from 'posts' collection
 */
export async function fetchPostById(postId: string): Promise<Post | null> {
  try {
    const postRef = doc(requireDb(), 'posts', postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      return null;
    }

    return { id: postSnap.id, ...postSnap.data() } as Post;
  } catch (error) {
    console.error('Error fetching post by ID:', error);
    throw error;
  }
}

/**
 * Unlock premium post
 */
export async function unlockPremiumPost(
  postId: string,
  userId: string
): Promise<{ success: boolean; mediaUrl?: string; error?: string }> {
  try {
    const postRef = doc(requireDb(), 'posts', postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }

    const post = postSnap.data() as Post;

    if (!post.isPremium) {
      return { success: true, mediaUrl: post.mediaUrl };
    }

    // Check if already unlocked
    const unlockRef = doc(requireDb(), 'unlocks', `${userId}_post_${postId}`);
    const unlockSnap = await getDoc(unlockRef);

    if (unlockSnap.exists()) {
      return { success: true, mediaUrl: post.mediaUrl };
    }

    // Call Cloud Function to deduct tokens + create unlock (same pattern as unlockPPVContent)
    const unlockContent = httpsCallable<
      { contentId: string; contentType: string },
      { success: boolean; mediaUrl?: string; error?: string }
    >(requireFunctions(), 'pack323_unlockContent');

    const result = await unlockContent({ contentId: postId, contentType: 'post' });
    return result.data;
  } catch (error: any) {
    console.error('Error unlocking post:', error);
    return {
      success: false,
      error: error?.message || 'Failed to unlock post',
    };
  }
}

/**
 * Unlock PPV (pay-per-view) content via Cloud Function.
 * The backend deducts tokens and creates an unlock record.
 */
export async function unlockPPVContent(
  contentId: string,
  contentType: 'post' | 'reel' | 'story',
  userId: string
): Promise<{ success: boolean; mediaUrl?: string; error?: string }> {
  try {
    // Check if already unlocked
    const unlockRef = doc(requireDb(), 'unlocks', `${userId}_${contentType}_${contentId}`);
    const unlockSnap = await getDoc(unlockRef);

    if (unlockSnap.exists()) {
      // Already unlocked — fetch the media URL from the content
      const contentCollection = contentType === 'post' ? 'posts' : contentType === 'reel' ? 'reels' : 'stories';
      const contentRef = doc(requireDb(), contentCollection, contentId);
      const contentSnap = await getDoc(contentRef);
      const data = contentSnap.data();
      return {
        success: true,
        mediaUrl: data?.mediaUrl || data?.videoUrl,
      };
    }

    // Call Cloud Function to deduct tokens + create unlock
    const unlockContent = httpsCallable<
      { contentId: string; contentType: string },
      { success: boolean; mediaUrl?: string; error?: string }
    >(requireFunctions(), 'pack323_unlockContent');

    const result = await unlockContent({ contentId, contentType });
    return result.data;
  } catch (error: any) {
    console.error('Error unlocking PPV content:', error);
    return {
      success: false,
      error: error?.message || 'Failed to unlock content',
    };
  }
}

/**
 * Check if user has unlocked a specific content item
 */
export async function checkContentUnlocked(
  contentId: string,
  contentType: 'post' | 'reel' | 'story',
  userId: string
): Promise<boolean> {
  try {
    const unlockRef = doc(requireDb(), 'unlocks', `${userId}_${contentType}_${contentId}`);
    const unlockSnap = await getDoc(unlockRef);
    return unlockSnap.exists();
  } catch (error) {
    console.error('Error checking unlock status:', error);
    return false;
  }
}

/**
 * Increment post view count
 */
export async function incrementPostViews(postId: string): Promise<void> {
  try {
    const postRef = doc(requireDb(), 'posts', postId);
    await updateDoc(postRef, {
      views: increment(1),
    });
  } catch (error) {
    console.error('Error incrementing post views:', error);
  }
}

// ============================================================================
// POST LIKES — subcollection: post_likes/{postId}/users/{uid}
// ============================================================================

/**
 * Toggle like on a post using subcollection path.
 * Writes to: post_likes/{postId}/users/{uid}
 * Also updates the likes count on the post document.
 */
export async function togglePostLike(
  postId: string,
  userId: string
): Promise<{ liked: boolean }> {
  try {
    const likeRef = doc(requireDb(), 'post_likes', postId, 'users', userId);
    const likeSnap = await getDoc(likeRef);

    const postRef = doc(requireDb(), 'posts', postId);

    if (likeSnap.exists()) {
      // Unlike
      await deleteDoc(likeRef);
      await updateDoc(postRef, { likes: increment(-1) });
      return { liked: false };
    } else {
      // Like
      await setDoc(likeRef, {
        userId,
        createdAt: Timestamp.now(),
      });
      await updateDoc(postRef, { likes: increment(1) });
      return { liked: true };
    }
  } catch (error) {
    console.error('Error toggling post like:', error);
    throw error;
  }
}

/**
 * Check if the current user has liked a specific post
 */
export async function checkPostLiked(
  postId: string,
  userId: string
): Promise<boolean> {
  try {
    const likeRef = doc(requireDb(), 'post_likes', postId, 'users', userId);
    const likeSnap = await getDoc(likeRef);
    return likeSnap.exists();
  } catch (error) {
    console.error('Error checking post like:', error);
    return false;
  }
}

/**
 * Batch check which posts the user has liked
 */
export async function batchCheckPostLikes(
  postIds: string[],
  userId: string
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  try {
    const checks = postIds.map(async (postId) => {
      const likeRef = doc(requireDb(), 'post_likes', postId, 'users', userId);
      const likeSnap = await getDoc(likeRef);
      result[postId] = likeSnap.exists();
    });
    await Promise.all(checks);
  } catch (error) {
    console.error('Error batch checking post likes:', error);
  }
  return result;
}

// ============================================================================
// POST COMMENTS — subcollection: post_comments/{postId}/comments
// ============================================================================

export interface PostComment {
  id: string;
  userId: string;
  text: string;
  createdAt: any;
  displayName?: string | null;
  photoURL?: string | null;
}

/**
 * Fetch comments for a post from subcollection
 * Reads from: post_comments/{postId}/comments
 */
export async function fetchPostComments(
  postId: string,
  limitCount: number = 50
): Promise<PostComment[]> {
  try {
    const commentsRef = collection(requireDb(), 'post_comments', postId, 'comments');
    const q = query(
      commentsRef,
      orderBy('createdAt', 'asc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as PostComment[];
  } catch (error) {
    console.error('Error fetching post comments:', error);
    return [];
  }
}

/**
 * Add a comment to a post
 * Writes to: post_comments/{postId}/comments
 * Also increments the comments count on the post document.
 */
export async function addPostComment(
  postId: string,
  userId: string,
  text: string,
  displayName?: string,
  photoURL?: string
): Promise<PostComment | null> {
  try {
    const commentsRef = collection(requireDb(), 'post_comments', postId, 'comments');
    const commentData = {
      userId,
      text: text.trim(),
      displayName: displayName || null,
      photoURL: photoURL || null,
      createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(commentsRef, commentData);

    // Increment comment count on the post
    const postRef = doc(requireDb(), 'posts', postId);
    await updateDoc(postRef, { comments: increment(1) });

    return {
      id: docRef.id,
      ...commentData,
      createdAt: Timestamp.now(), // local approximation for immediate display
    };
  } catch (error) {
    console.error('Error adding post comment:', error);
    throw error;
  }
}

// ============================================================================
// USER PROFILES (for feed display)
// ============================================================================

export interface FeedUserProfile {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  isVerified: boolean;
  isCreator: boolean;
}

/**
 * Fetch multiple user profiles for feed display (avatar + name)
 */
export async function fetchUserProfiles(
  userIds: string[]
): Promise<Record<string, FeedUserProfile>> {
  const profiles: Record<string, FeedUserProfile> = {};

  try {
    const uniqueIds = [...new Set(userIds)];
    const fetches = uniqueIds.map(async (uid) => {
      const userRef = doc(requireDb(), 'users', uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        profiles[uid] = {
          uid,
          displayName: data.displayName || null,
          photoURL: data.photoURL || null,
          isVerified: data.isVerified || false,
          isCreator: data.isCreator || false,
        };
      } else {
        profiles[uid] = {
          uid,
          displayName: null,
          photoURL: null,
          isVerified: false,
          isCreator: false,
        };
      }
    });
    await Promise.all(fetches);
  } catch (error) {
    console.error('Error fetching user profiles:', error);
  }

  return profiles;
}

// ============================================================================
// STORIES
// ============================================================================

/**
 * Fetch active stories (last 24h)
 */
export async function fetchActiveStories(
  includeNSFW: boolean = false
): Promise<Story[]> {
  try {
    const twentyFourHoursAgo = Timestamp.fromDate(
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    const constraints: QueryConstraint[] = [
      where('expiresAt', '>', Timestamp.now()),
      where('createdAt', '>', twentyFourHoursAgo),
      orderBy('createdAt', 'desc'),
      limit(STORIES_PER_FETCH),
    ];

    if (!includeNSFW) {
      constraints.unshift(where('isNSFW', '==', false));
    }

    const q = query(collection(requireDb(), 'stories'), ...constraints);
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Story[];
  } catch (error) {
    console.error('Error fetching stories:', error);
    throw error;
  }
}

/**
 * Fetch stories by user
 */
export async function fetchUserStories(
  userId: string,
  includeNSFW: boolean = false
): Promise<Story[]> {
  try {
    const twentyFourHoursAgo = Timestamp.fromDate(
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    const constraints: QueryConstraint[] = [
      where('userId', '==', userId),
      where('expiresAt', '>', Timestamp.now()),
      where('createdAt', '>', twentyFourHoursAgo),
      orderBy('createdAt', 'desc'),
    ];

    if (!includeNSFW) {
      constraints.push(where('isNSFW', '==', false));
    }

    const q = query(collection(requireDb(), 'stories'), ...constraints);
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Story[];
  } catch (error) {
    console.error('Error fetching user stories:', error);
    throw error;
  }
}

/**
 * Unlock premium story
 */
export async function unlockPremiumStory(
  storyId: string,
  userId: string
): Promise<{ success: boolean; mediaUrl?: string; error?: string }> {
  try {
    const storyRef = doc(requireDb(), 'stories', storyId);
    const storySnap = await getDoc(storyRef);

    if (!storySnap.exists()) {
      throw new Error('Story not found');
    }

    const story = storySnap.data() as Story;

    if (!story.isPremium) {
      return { success: true, mediaUrl: story.mediaUrl };
    }

    // Check if already unlocked
    const unlockRef = doc(requireDb(), 'unlocks', `${userId}_story_${storyId}`);
    const unlockSnap = await getDoc(unlockRef);

    if (unlockSnap.exists()) {
      return { success: true, mediaUrl: story.mediaUrl };
    }

    // Call Cloud Function to deduct tokens + create unlock (same pattern as unlockPPVContent)
    const unlockContent = httpsCallable<
      { contentId: string; contentType: string },
      { success: boolean; mediaUrl?: string; error?: string }
    >(requireFunctions(), 'pack323_unlockContent');

    const result = await unlockContent({ contentId: storyId, contentType: 'story' });
    return result.data;
  } catch (error: any) {
    console.error('Error unlocking story:', error);
    return {
      success: false,
      error: error?.message || 'Failed to unlock story',
    };
  }
}

/**
 * Increment story views
 */
export async function incrementStoryViews(storyId: string): Promise<void> {
  try {
    const storyRef = doc(requireDb(), 'stories', storyId);
    await updateDoc(storyRef, {
      views: increment(1),
    });
  } catch (error) {
    console.error('Error incrementing story views:', error);
  }
}

// ============================================================================
// REELS
// ============================================================================

/**
 * Fetch reels with pagination (vertical swipe feed)
 */
export async function fetchReels(
  lastDoc: DocumentSnapshot | null = null,
  filters: FeedFilters = {}
): Promise<PaginatedResult<Reel>> {
  try {
    const constraints: QueryConstraint[] = [
      orderBy('createdAt', 'desc'),
      limit(REELS_PER_PAGE),
    ];

    if (!filters.includeNSFW) {
      constraints.unshift(where('isNSFW', '==', false));
    }

    if (filters.userId) {
      constraints.unshift(where('userId', '==', filters.userId));
    }

    if (lastDoc) {
      constraints.push(startAfter(lastDoc));
    }

    const q = query(collection(requireDb(), 'reels'), ...constraints);
    const snapshot = await getDocs(q);

    const reels = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Reel[];

    return {
      items: reels,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
      hasMore: reels.length === REELS_PER_PAGE,
    };
  } catch (error) {
    console.error('Error fetching reels:', error);
    throw error;
  }
}

/**
 * Unlock premium reel
 */
export async function unlockPremiumReel(
  reelId: string,
  userId: string
): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  try {
    const reelRef = doc(requireDb(), 'reels', reelId);
    const reelSnap = await getDoc(reelRef);

    if (!reelSnap.exists()) {
      throw new Error('Reel not found');
    }

    const reel = reelSnap.data() as Reel;

    if (!reel.isPremium) {
      return { success: true, videoUrl: reel.videoUrl };
    }

    // Check if already unlocked
    const unlockRef = doc(requireDb(), 'unlocks', `${userId}_reel_${reelId}`);
    const unlockSnap = await getDoc(unlockRef);

    if (unlockSnap.exists()) {
      return { success: true, videoUrl: reel.videoUrl };
    }

    // Call Cloud Function to deduct tokens + create unlock (same pattern as unlockPPVContent)
    const unlockContent = httpsCallable<
      { contentId: string; contentType: string },
      { success: boolean; mediaUrl?: string; error?: string }
    >(requireFunctions(), 'pack323_unlockContent');

    const result = await unlockContent({ contentId: reelId, contentType: 'reel' });
    return {
      success: result.data.success,
      videoUrl: result.data.mediaUrl,
      error: result.data.error,
    };
  } catch (error: any) {
    console.error('Error unlocking reel:', error);
    return {
      success: false,
      error: error?.message || 'Failed to unlock reel',
    };
  }
}

/**
 * Increment reel views
 */
export async function incrementReelViews(reelId: string): Promise<void> {
  try {
    const reelRef = doc(requireDb(), 'reels', reelId);
    await updateDoc(reelRef, {
      views: increment(1),
    });
  } catch (error) {
    console.error('Error incrementing reel views:', error);
  }
}

/**
 * Like/Unlike content
 */
export async function toggleLike(
  contentId: string,
  userId: string,
  contentType: 'post' | 'reel'
): Promise<{ liked: boolean }> {
  try {
    const likeRef = doc(requireDb(), 'likes', `${userId}_${contentType}_${contentId}`);
    const likeSnap = await getDoc(likeRef);

    const contentCollection = contentType === 'post' ? 'posts' : 'reels';
    const contentRef = doc(requireDb(), contentCollection, contentId);

    if (likeSnap.exists()) {
      // Unlike
      await deleteDoc(likeRef);
      await updateDoc(contentRef, { likes: increment(-1) });
      return { liked: false };
    } else {
      // Like
      await setDoc(likeRef, { userId, contentId, contentType, createdAt: Timestamp.now() });
      await updateDoc(contentRef, { likes: increment(1) });
      return { liked: true };
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    throw error;
  }
}
