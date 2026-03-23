'use client';

/**
 * PACK 323 - Feed Page (Web)
 * Main feed view with infinite-scroll posts from Firestore 'posts' collection,
 * stories from 'stories' collection, and reels from 'reels' collection.
 *
 * Extended: Follow state for inline Follow/Unfollow buttons, followed-first feed ordering.
 *
 * FIX 92: Drops — limited-time exclusive content/offers from creators.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DocumentSnapshot, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';

import { useAuth } from '@/components/providers/AuthProvider';
import { requireDb, functions } from '@/lib/firebase';
import { useI18n } from '@/components/providers/I18nProvider';
import EmptyState from '@/components/ui/EmptyState';
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
import ActiveLivesBanner from '@/components/feed/ActiveLivesBanner';
import SponsoredAdCard, { type SponsoredAd } from '@/components/ads/SponsoredAdCard';

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

  // FIX 59D: Blocked user IDs for client-side filtering
  const [blockedIds, setBlockedIds] = useState<string[]>([]);

  // FIX 74B: Sponsored ads for feed
  const [feedAds, setFeedAds] = useState<SponsoredAd[]>([]);

  // FIX 92: Active drops — limited-time content/offers
  const [activeDrops, setActiveDrops] = useState<any[]>([]);

  // FIX 99: Trending hashtags for discovery bar
  const [trendingHashtags] = useState<string[]>([
    '#summer', '#fitness', '#travel', '#cooking',
    '#fashion', '#dating', '#music', '#art',
  ]);

  // FIX 92: Load active drops
  useEffect(() => {
    const loadDrops = async () => {
      try {
        const q = query(
          collection(requireDb(), 'drops'),
          where('status', '==', 'active'),
          where('expiresAt', '>', new Date()),
          orderBy('expiresAt', 'asc'),
          limit(5)
        );
        const snap = await getDocs(q);
        setActiveDrops(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        // Drops not critical — fail silently
      }
    };
    loadDrops();
  }, []);

  // FIX 59D: Load blocked user IDs
  useEffect(() => {
    if (!currentUserId) return;
    getDocs(query(collection(requireDb(), 'blocks'), where('blockerId', '==', currentUserId)))
      .then((snap) => {
        setBlockedIds(snap.docs.map(d => d.data().blockedId));
      }).catch(() => {});
  }, [currentUserId]);

  // FIX 74B: Load sponsored ads targeted for feed
  useEffect(() => {
    const loadAds = async () => {
      try {
        const fn = httpsCallable(functions, 'getAdForFeed');
        const result = await fn({});
        setFeedAds(((result.data as any)?.ads || []) as SponsoredAd[]);
      } catch {
        // Fallback: load active campaigns directly from Firestore
        try {
          const q = query(
            collection(requireDb(), 'ad_campaigns'),
            where('status', '==', 'active'),
            limit(3)
          );
          const snap = await getDocs(q);
          setFeedAds(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SponsoredAd)));
        } catch {
          // Ads not critical — fail silently
        }
      }
    };
    loadAds();
  }, []);

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

      {/* FIX 57B: LIVE banner — active lives from followed creators */}
      <ActiveLivesBanner uid={currentUserId} />

      {/* FIX 92: Active Drops — limited-time offers from creators */}
      {activeDrops.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">🔥 Active Drops</h3>
            <span className="text-xs text-[#E4458F]">Limited time</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {activeDrops.map(drop => (
              <div key={drop.id} className="flex-shrink-0 w-48 border rounded-xl overflow-hidden">
                {drop.imageURL && (
                  <img src={drop.imageURL} alt={drop.title || 'Drop'} className="w-full h-24 object-cover" />
                )}
                <div className="p-2">
                  <p className="text-sm font-medium">{drop.title}</p>
                  <p className="text-xs text-gray-500">{drop.description?.slice(0, 50)}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs font-bold text-[#E4458F]">{drop.price} tokens</span>
                    <span className="text-[10px] text-red-500">
                      ⏰ {Math.max(0, Math.ceil(((drop.expiresAt?.toDate ? drop.expiresAt.toDate().getTime() : new Date(drop.expiresAt).getTime()) - Date.now()) / 3600000))}h left
                    </span>
                  </div>
                  <button className="mt-1 w-full py-1 bg-[#E4458F] text-white rounded-lg text-xs">
                    Get Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stories Row */}
      <StoriesViewer
        stories={stories}
        profiles={profiles}
        currentUserId={currentUserId}
      />

      {/* FIX 99: Trending hashtags bar — drives discovery + search */}
      {trendingHashtags.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-1 py-2 mb-4 border-b border-gray-100 dark:border-gray-800">
          {trendingHashtags.map(h => (
            <a
              key={h}
              href={`/search?q=${encodeURIComponent(h)}`}
              className="px-3 py-1 bg-pink-50 dark:bg-pink-900/20 text-[#E4458F] rounded-full text-xs whitespace-nowrap hover:bg-pink-100 dark:hover:bg-pink-900/40 transition-colors"
            >
              {h}
            </a>
          ))}
        </div>
      )}

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
          {posts.filter((post) => !blockedIds.includes(post.userId)).map((post, i) => (
            <React.Fragment key={post.id}>
              <PostCard
                post={post}
                author={profiles[post.userId] || null}
                currentUserId={currentUserId}
                initialLiked={likedMap[post.id] || false}
                initialFollowing={followingMap[post.userId] || false}
                onFollowChange={handleFollowChange}
              />
              {/* FIX 74B: Insert sponsored ad after every 5 posts */}
              {i > 0 && i % 5 === 4 && feedAds[Math.floor(i / 5)] && (
                <SponsoredAdCard
                  ad={feedAds[Math.floor(i / 5)]}
                  variant="feed"
                />
              )}
            </React.Fragment>
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
        /* Empty state — FIX 36 + FIX 130: Professional empty state */
        <EmptyState
          icon="📸"
          title="Your feed is empty"
          description="Follow people to see their posts, or create your own!"
          actionLabel="Create Post"
          actionHref="/create/post"
        />
      )}
    </div>
  );
}
