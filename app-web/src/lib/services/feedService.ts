"use client";

/**
 * Feed, Stories, and Reels Service
 * Handles content fetching with infinite scroll, NSFW gating, and premium unlocks
 */

import { requireDb } from '../firebase';
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
} from 'firebase/firestore';
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
 * Unlock premium post
 */
export async function unlockPremiumPost(
  postId: string,
  userId: string
): Promise<{ success: boolean; mediaUrl?: string }> {
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

    // TODO: Deduct tokens and create unlock record
    // This should be done via Cloud Function for security

    return { success: true, mediaUrl: post.mediaUrl };
  } catch (error) {
    console.error('Error unlocking post:', error);
    throw error;
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
): Promise<{ success: boolean; mediaUrl?: string }> {
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

    // TODO: Deduct tokens and create unlock record via Cloud Function

    return { success: true, mediaUrl: story.mediaUrl };
  } catch (error) {
    console.error('Error unlocking story:', error);
    throw error;
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
): Promise<{ success: boolean; videoUrl?: string }> {
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

    // TODO: Deduct tokens via Cloud Function

    return { success: true, videoUrl: reel.videoUrl };
  } catch (error) {
    console.error('Error unlocking reel:', error);
    throw error;
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
