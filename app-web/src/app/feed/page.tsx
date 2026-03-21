'use client';

/**
 * PACK 323 - Feed Page (Web)
 * Main feed view with infinite-scroll posts from Firestore 'posts' collection,
 * stories from 'stories' collection, and reels from 'reels' collection.
 *
 * Extended: Follow state for inline Follow/Unfollow buttons, followed-first feed ordering.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DocumentSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';

import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import { Post } from '@/lib/types';
import {
  fetchFeedPosts,
  fetchActiveStories,
  fetchReels,
  fetchUserProfiles,
  batchCheckPostLikes,
  FeedUserProfile,
  PaginatedResult,
} from '@/lib/services/feedService';
import {
  batchCheckFollowing,
  getFollowingIds,
} from '@/lib/services/feedInteractionService';
import { Story, Reel } from '@/lib/types';

import PostCard from '@/components/feed/PostCard';
import StoriesViewer from '@/components/feed/StoriesViewer';
import ReelsPlayer from '@/components/feed/ReelsPlayer';

export default function FeedPage() {
  const { t } = useI18n();
  const { user, firebaseUser } = useAuth();
  const router = useRouter();

  // Posts state
  const [posts, setPosts] = useState<Post[]>([]);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Likes state
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});

  // Follow state
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [followingIds, setFollowingIds] = useState<string[]>([]);

  // User profiles cache
  const [profiles, setProfiles] = useState<Record<string, FeedUserProfile>>({});

  // Stories state
  const [stories, setStories] = useState<Story[]>([]);

  // Reels state
  const [reels, setReels] = useState<Reel[]>([]);

  // Infinite scroll sentinel ref
  const sentinelRef = useRef<HTMLDivElement>(null);
  const currentUserId = firebaseUser?.uid || null;

  // ========================================================================
  // Feed ordering: posts from followed users first, then rest by createdAt desc
  // ========================================================================
  const sortPostsFollowedFirst = useCallback(
    (postsToSort: Post[], followedUserIds: string[]): Post[] => {
      if (followedUserIds.length === 0) return postsToSort;

      const followedSet = new Set(followedUserIds);
      const followedPosts: Post[] = [];
      const otherPosts: Post[] = [];

      for (const post of postsToSort) {
        if (followedSet.has(post.userId)) {
          followedPosts.push(post);
        } else {
          otherPosts.push(post);
        }
      }

      // Each group is already sorted by createdAt desc from the query
      return [...followedPosts, ...otherPosts];
    },
    []
  );

  // ========================================================================
  // Initial load
  // ========================================================================
  useEffect(() => {
    loadInitialFeed();
    loadStories();
    loadReels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadInitialFeed = async () => {
    try {
      setLoadingPosts(true);
      setError(null);

      // Load following IDs for feed ordering (if logged in)
      let myFollowingIds: string[] = [];
      if (currentUserId) {
        myFollowingIds = await getFollowingIds(currentUserId);
        setFollowingIds(myFollowingIds);
      }

      const result: PaginatedResult<Post> = await fetchFeedPosts(null);

      // Apply followed-first ordering
      const orderedPosts = sortPostsFollowedFirst(result.items, myFollowingIds);
      setPosts(orderedPosts);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);

      // Fetch profiles for post authors
      const userIds = result.items.map((p) => p.userId);
      if (userIds.length > 0) {
        const fetchedProfiles = await fetchUserProfiles(userIds);
        setProfiles((prev) => ({ ...prev, ...fetchedProfiles }));
      }

      // Check liked status if user is logged in
      if (currentUserId && result.items.length > 0) {
        const postIds = result.items.map((p) => p.id);
        const likes = await batchCheckPostLikes(postIds, currentUserId);
        setLikedMap((prev) => ({ ...prev, ...likes }));
      }

      // Check following status for post authors
      if (currentUserId && userIds.length > 0) {
        const following = await batchCheckFollowing(currentUserId, userIds);
        setFollowingMap((prev) => ({ ...prev, ...following }));
      }
    } catch (err) {
      console.error('Error loading feed:', err);
      setError('Could not load feed. Pull to refresh.');
    } finally {
      setLoadingPosts(false);
    }
  };

  const loadMorePosts = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    try {
      setLoadingMore(true);
      const result = await fetchFeedPosts(lastDoc);

      // Apply followed-first ordering to new batch
      const orderedNew = sortPostsFollowedFirst(result.items, followingIds);
      setPosts((prev) => [...prev, ...orderedNew]);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);

      // Fetch profiles for new post authors
      const newUserIds = result.items
        .map((p) => p.userId)
        .filter((uid) => !profiles[uid]);
      if (newUserIds.length > 0) {
        const fetchedProfiles = await fetchUserProfiles(newUserIds);
        setProfiles((prev) => ({ ...prev, ...fetchedProfiles }));
      }

      // Check liked status for new posts
      if (currentUserId && result.items.length > 0) {
        const newPostIds = result.items.map((p) => p.id);
        const likes = await batchCheckPostLikes(newPostIds, currentUserId);
        setLikedMap((prev) => ({ ...prev, ...likes }));
      }

      // Check following status for new post authors
      if (currentUserId && newUserIds.length > 0) {
        const following = await batchCheckFollowing(currentUserId, newUserIds);
        setFollowingMap((prev) => ({ ...prev, ...following }));
      }
    } catch (err) {
      console.error('Error loading more posts:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, lastDoc, profiles, currentUserId, followingIds, sortPostsFollowedFirst]);

  // ========================================================================
  // Infinite scroll via IntersectionObserver
  // ========================================================================
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMorePosts();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMorePosts]);

  // ========================================================================
  // Stories
  // ========================================================================
  const loadStories = async () => {
    try {
      const storiesData = await fetchActiveStories();
      setStories(storiesData);

      // Fetch profiles for story authors
      const userIds = storiesData.map((s) => s.userId);
      if (userIds.length > 0) {
        const fetchedProfiles = await fetchUserProfiles(userIds);
        setProfiles((prev) => ({ ...prev, ...fetchedProfiles }));
      }
    } catch (err) {
      console.error('Error loading stories:', err);
    }
  };

  // ========================================================================
  // Reels
  // ========================================================================
  const loadReels = async () => {
    try {
      const result = await fetchReels(null);
      setReels(result.items);

      // Fetch profiles for reel authors
      const userIds = result.items.map((r) => r.userId);
      if (userIds.length > 0) {
        const fetchedProfiles = await fetchUserProfiles(userIds);
        setProfiles((prev) => ({ ...prev, ...fetchedProfiles }));
      }
    } catch (err) {
      console.error('Error loading reels:', err);
    }
  };

  // ========================================================================
  // Follow change handler (from PostCard FollowButton)
  // ========================================================================
  const handleFollowChange = useCallback(
    (targetUserId: string, isFollowing: boolean) => {
      setFollowingMap((prev) => ({ ...prev, [targetUserId]: isFollowing }));
      if (isFollowing) {
        setFollowingIds((prev) => [...new Set([...prev, targetUserId])]);
      } else {
        setFollowingIds((prev) => prev.filter((id) => id !== targetUserId));
      }
    },
    []
  );

  // ========================================================================
  // Render
  // ========================================================================

  if (loadingPosts) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">{t('placeholder.feedTitle')}</h1>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
        {t('placeholder.feedTitle')}
      </h1>

      {/* Stories Row */}
      <StoriesViewer
        stories={stories}
        profiles={profiles}
        currentUserId={currentUserId}
      />

      {/* Reels Row */}
      {reels.length > 0 && (
        <div className="mb-6">
          <ReelsPlayer
            reels={reels}
            profiles={profiles}
            currentUserId={currentUserId}
          />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="card p-6 mb-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-xl">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <button
            onClick={loadInitialFeed}
            className="btn btn-outline mt-3 text-sm px-4 py-2"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Feed Posts */}
      {posts.length > 0 ? (
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              author={profiles[post.userId] || null}
              currentUserId={currentUserId}
              initialLiked={likedMap[post.id] || false}
              initialFollowing={followingMap[post.userId] || false}
              onFollowChange={handleFollowChange}
            />
          ))}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-4" />

          {/* Loading more indicator */}
          {loadingMore && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
            </div>
          )}

          {/* End of feed */}
          {!hasMore && posts.length > 0 && (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">
              You&apos;re all caught up!
            </p>
          )}
        </div>
      ) : (
        /* Empty state — FIX 36: Wire "+" to /create/post */
        <div className="card p-12 text-center rounded-xl cursor-pointer" onClick={() => router.push('/create/post')}>
          <div className="w-16 h-16 rounded-full bg-primary-50 dark:bg-primary-900/30 mx-auto mb-4 flex items-center justify-center">
            <Plus className="w-8 h-8 text-primary-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {t('placeholder.feedTitle')}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto">
            {t('placeholder.feedDesc')}
          </p>
        </div>
      )}
    </div>
  );
}
