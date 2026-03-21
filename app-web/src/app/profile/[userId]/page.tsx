'use client';

/**
 * Public Profile Page — Instagram/OnlyFans-style redesign
 * Route: /profile/[userId]
 *
 * Photo-first, alive, monetized profile view.
 *
 * LAYOUT:
 *   1. HEADER: Cover photo → avatar overlap → name/badge → bio → stats → actions
 *   2. CONTENT TABS: Posts (3-col grid), Reels (vertical video grid), About
 *   3. PPV (Pay-per-view): Locked posts show blur + lock icon + token price
 *
 * Data: Firestore `public_profiles/{userId}` and `posts` / `reels` collections.
 *
 * CANONICAL: Does NOT modify profile/page.tsx (own-profile view).
 * Reuses existing components: FollowButton, TipModal from feed.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  BadgeCheck,
  Lock,
  Loader2,
  MessageCircle,
  AlertCircle,
  Play,
  Share2,
  Edit3,
  Grid3X3,
  Film,
  User,
  Eye,
} from 'lucide-react';
import { DocumentSnapshot } from 'firebase/firestore';

import { useAuth } from '@/components/providers/AuthProvider';
import { getPublicProfile, findOrCreateChat } from '@/lib/services/discoveryService';
import {
  fetchFeedPosts,
  fetchReels,
  unlockPPVContent,
  checkContentUnlocked,
  PaginatedResult,
} from '@/lib/services/feedService';
import {
  checkIsFollowing,
} from '@/lib/services/feedInteractionService';
import FollowButton from '@/components/feed/FollowButton';
import TipModal from '@/components/feed/TipModal';
import type { PublicProfile } from '@/lib/types/publicProfile';
import type { Post, Reel } from '@/lib/types';

// ============================================================================
// TYPES
// ============================================================================

type ProfileTab = 'posts' | 'reels' | 'about';

// ============================================================================
// HELPER — format large numbers
// ============================================================================

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function ProfileSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Cover photo skeleton */}
      <div className="w-full h-[300px] bg-gray-200 dark:bg-gray-700" />

      {/* Avatar + info skeleton */}
      <div className="max-w-4xl mx-auto px-4">
        <div className="-mt-10 flex items-end gap-4 mb-4">
          <div className="w-20 h-20 rounded-full bg-gray-300 dark:bg-gray-600 border-4 border-white dark:border-gray-900 flex-shrink-0" />
          <div className="flex-1 pt-12">
            <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
        <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-700 rounded mb-6" />
        <div className="flex gap-6 mb-6">
          <div className="h-12 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-12 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-12 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// NOT FOUND STATE
// ============================================================================

function ProfileNotFound() {
  const router = useRouter();

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mx-auto mb-4 flex items-center justify-center">
        <AlertCircle className="w-8 h-8 text-gray-400" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        Profile not found
      </h2>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
        This user doesn&apos;t exist or their profile is no longer public.
      </p>
      <button
        onClick={() => router.push('/discover')}
        className="btn btn-primary"
      >
        Back to Discover
      </button>
    </div>
  );
}

// ============================================================================
// POST GRID ITEM — Instagram-style 3-column grid cell with PPV overlay
// ============================================================================

function PostGridItem({
  post,
  currentUserId,
  onClick,
}: {
  post: Post;
  currentUserId: string | null;
  onClick: (post: Post) => void;
}) {
  const isPPV = post.isPremium;
  const thumbnailUrl = post.thumbnailUrl || post.mediaUrl;
  const isVideo = post.mediaType === 'video';

  return (
    <button
      onClick={() => onClick(post)}
      className="relative aspect-square w-full overflow-hidden bg-gray-100 dark:bg-gray-800 group focus:outline-none"
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={post.caption || 'Post'}
          className={`w-full h-full object-cover transition-transform duration-200 group-hover:scale-105 ${
            isPPV ? 'blur-lg scale-110' : ''
          }`}
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400">
          <Grid3X3 className="w-8 h-8" />
        </div>
      )}

      {/* Video indicator */}
      {isVideo && !isPPV && (
        <div className="absolute top-2 right-2">
          <Play className="w-5 h-5 text-white drop-shadow-lg" fill="white" />
        </div>
      )}

      {/* PPV Lock Overlay */}
      {isPPV && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center">
          <Lock className="w-8 h-8 text-white mb-2" />
          {post.unlockPrice && post.unlockPrice > 0 && (
            <span className="text-white text-sm font-bold bg-black/50 px-3 py-1 rounded-full">
              🔒 {post.unlockPrice} tokens
            </span>
          )}
        </div>
      )}

      {/* Hover overlay with stats */}
      {!isPPV && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="flex items-center gap-4 text-white text-sm font-semibold">
            <span className="flex items-center gap-1">
              ❤️ {formatCount(post.likes || 0)}
            </span>
            <span className="flex items-center gap-1">
              💬 {formatCount(post.comments || 0)}
            </span>
          </div>
        </div>
      )}
    </button>
  );
}

// ============================================================================
// REEL GRID ITEM — Vertical video grid cell
// ============================================================================

function ReelGridItem({
  reel,
  onClick,
}: {
  reel: Reel;
  onClick: (reel: Reel) => void;
}) {
  const isPPV = reel.isPremium;

  return (
    <button
      onClick={() => onClick(reel)}
      className="relative aspect-[9/16] w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 group focus:outline-none"
    >
      {reel.thumbnailUrl ? (
        <img
          src={reel.thumbnailUrl}
          alt={reel.caption || 'Reel'}
          className={`w-full h-full object-cover transition-transform duration-200 group-hover:scale-105 ${
            isPPV ? 'blur-lg scale-110' : ''
          }`}
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400">
          <Film className="w-8 h-8" />
        </div>
      )}

      {/* Play icon */}
      {!isPPV && (
        <div className="absolute top-2 right-2">
          <Play className="w-5 h-5 text-white drop-shadow-lg" fill="white" />
        </div>
      )}

      {/* Views count */}
      {!isPPV && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1 text-white text-xs font-medium">
          <Eye className="w-3.5 h-3.5" />
          {formatCount(reel.views || 0)}
        </div>
      )}

      {/* PPV Lock Overlay */}
      {isPPV && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center">
          <Lock className="w-8 h-8 text-white mb-2" />
          {reel.unlockPrice && reel.unlockPrice > 0 && (
            <span className="text-white text-sm font-bold bg-black/50 px-3 py-1 rounded-full">
              🔒 {reel.unlockPrice} tokens
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// ============================================================================
// POST FULL VIEW MODAL — expanded post view when clicking grid item
// ============================================================================

function PostFullView({
  post,
  currentUserId,
  onClose,
  onUnlocked,
}: {
  post: Post;
  currentUserId: string | null;
  onClose: () => void;
  onUnlocked: (postId: string) => void;
}) {
  const [unlocking, setUnlocking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [unlockedMediaUrl, setUnlockedMediaUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPPV = post.isPremium && !unlocked;
  const displayMediaUrl = unlocked ? (unlockedMediaUrl || post.mediaUrl) : post.mediaUrl;

  // Check if already unlocked on mount
  useEffect(() => {
    if (!post.isPremium || !currentUserId) return;
    let active = true;

    checkContentUnlocked(post.id, 'post', currentUserId).then((isUnlocked) => {
      if (active && isUnlocked) {
        setUnlocked(true);
      }
    });

    return () => {
      active = false;
    };
  }, [post.id, post.isPremium, currentUserId]);

  const handleUnlock = async () => {
    if (!currentUserId) return;

    setUnlocking(true);
    setError(null);

    try {
      const result = await unlockPPVContent(post.id, 'post', currentUserId);
      if (result.success) {
        setUnlocked(true);
        setUnlockedMediaUrl(result.mediaUrl || null);
        onUnlocked(post.id);
      } else {
        setError(result.error || 'Failed to unlock');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to unlock');
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] mx-4 bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Media area */}
        <div className="relative w-full aspect-square bg-gray-100 dark:bg-gray-800">
          {displayMediaUrl ? (
            <img
              src={displayMediaUrl}
              alt={post.caption || 'Post'}
              className={`w-full h-full object-contain ${isPPV ? 'blur-xl' : ''}`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              No media
            </div>
          )}

          {/* PPV Unlock overlay */}
          {isPPV && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
              <Lock className="w-12 h-12 text-white mb-3" />
              <p className="text-white font-bold text-lg mb-1">Premium Content</p>
              {post.unlockPrice && post.unlockPrice > 0 && (
                <p className="text-white/80 text-sm mb-4">
                  {post.unlockPrice} tokens to unlock
                </p>
              )}
              <button
                onClick={handleUnlock}
                disabled={unlocking || !currentUserId}
                className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold rounded-xl hover:from-purple-700 hover:to-pink-600 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {unlocking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Unlocking...
                  </>
                ) : (
                  <>
                    🔓 Unlock for {post.unlockPrice || 0} tokens
                  </>
                )}
              </button>
              {error && (
                <p className="text-red-400 text-sm mt-2">{error}</p>
              )}
              {!currentUserId && (
                <p className="text-white/60 text-xs mt-2">Sign in to unlock content</p>
              )}
            </div>
          )}
        </div>

        {/* Caption + stats */}
        <div className="p-4">
          {post.caption && (
            <p className="text-gray-900 dark:text-white text-sm mb-3 whitespace-pre-line">
              {post.caption}
            </p>
          )}
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span>❤️ {formatCount(post.likes || 0)} likes</span>
            <span>💬 {formatCount(post.comments || 0)} comments</span>
            <span>👁 {formatCount(post.views || 0)} views</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PROFILE PAGE COMPONENT
// ============================================================================

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user, firebaseUser } = useAuth();

  const userId = params?.userId as string;
  const currentUserId = firebaseUser?.uid || user?.uid || null;
  const isOwnProfile = currentUserId === userId;

  // ── Profile state ─────────────────────────────────────────────────────
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ── Tab state ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');

  // ── Posts state ───────────────────────────────────────────────────────
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLastDoc, setPostsLastDoc] = useState<DocumentSnapshot | null>(null);
  const [postsHasMore, setPostsHasMore] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // ── Reels state ──────────────────────────────────────────────────────
  const [reels, setReels] = useState<Reel[]>([]);
  const [reelsLastDoc, setReelsLastDoc] = useState<DocumentSnapshot | null>(null);
  const [reelsHasMore, setReelsHasMore] = useState(true);
  const [loadingReels, setLoadingReels] = useState(false);

  // ── Follow state ─────────────────────────────────────────────────────
  const [isFollowing, setIsFollowing] = useState(false);

  // ── Chat state ───────────────────────────────────────────────────────
  const [startingChat, setStartingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // ── Tip modal state ──────────────────────────────────────────────────
  const [tipModalOpen, setTipModalOpen] = useState(false);

  // ── Post full view state ─────────────────────────────────────────────
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  // ── Share state ──────────────────────────────────────────────────────
  const [shareSuccess, setShareSuccess] = useState(false);

  // ====================================================================
  // FETCH PROFILE
  // ====================================================================
  useEffect(() => {
    if (!userId) return;
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setNotFound(false);
        const result = await getPublicProfile(userId);
        if (!active) return;

        if (!result) {
          setNotFound(true);
        } else {
          setProfile(result);
        }
      } catch (err) {
        console.error('[UserProfilePage] Load error:', err);
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [userId]);

  // ====================================================================
  // CHECK FOLLOW STATUS
  // ====================================================================
  useEffect(() => {
    if (!currentUserId || !userId || isOwnProfile) return;
    let active = true;

    checkIsFollowing(currentUserId, userId).then((following) => {
      if (active) setIsFollowing(following);
    });

    return () => {
      active = false;
    };
  }, [currentUserId, userId, isOwnProfile]);

  // ====================================================================
  // FETCH POSTS FOR GRID
  // ====================================================================
  useEffect(() => {
    if (!userId || !profile) return;
    loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, profile]);

  const loadPosts = async () => {
    try {
      setLoadingPosts(true);
      const result: PaginatedResult<Post> = await fetchFeedPosts(null, {
        userId,
      });
      setPosts(result.items);
      setPostsLastDoc(result.lastDoc);
      setPostsHasMore(result.hasMore);
    } catch (err) {
      console.error('[UserProfilePage] Load posts error:', err);
    } finally {
      setLoadingPosts(false);
    }
  };

  const loadMorePosts = async () => {
    if (loadingPosts || !postsHasMore) return;
    try {
      setLoadingPosts(true);
      const result = await fetchFeedPosts(postsLastDoc, { userId });
      setPosts((prev) => [...prev, ...result.items]);
      setPostsLastDoc(result.lastDoc);
      setPostsHasMore(result.hasMore);
    } catch (err) {
      console.error('[UserProfilePage] Load more posts error:', err);
    } finally {
      setLoadingPosts(false);
    }
  };

  // ====================================================================
  // FETCH REELS FOR GRID (lazy — only when tab is active)
  // ====================================================================
  useEffect(() => {
    if (activeTab !== 'reels' || !userId || reels.length > 0) return;
    loadReels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, userId]);

  const loadReels = async () => {
    try {
      setLoadingReels(true);
      const result = await fetchReels(null, { userId });
      setReels(result.items);
      setReelsLastDoc(result.lastDoc);
      setReelsHasMore(result.hasMore);
    } catch (err) {
      console.error('[UserProfilePage] Load reels error:', err);
    } finally {
      setLoadingReels(false);
    }
  };

  const loadMoreReels = async () => {
    if (loadingReels || !reelsHasMore) return;
    try {
      setLoadingReels(true);
      const result = await fetchReels(reelsLastDoc, { userId });
      setReels((prev) => [...prev, ...result.items]);
      setReelsLastDoc(result.lastDoc);
      setReelsHasMore(result.hasMore);
    } catch (err) {
      console.error('[UserProfilePage] Load more reels error:', err);
    } finally {
      setLoadingReels(false);
    }
  };

  // ====================================================================
  // HANDLERS
  // ====================================================================

  /** Start Chat → navigate to /chat */
  const handleStartChat = useCallback(async () => {
    if (!currentUserId) {
      router.push('/auth/login');
      return;
    }
    if (isOwnProfile) return;

    try {
      setStartingChat(true);
      setChatError(null);
      const { chatId } = await findOrCreateChat({
        currentUserId,
        targetUserId: userId,
      });
      router.push(`/chat?chatId=${chatId}`);
    } catch (err: any) {
      console.error('[UserProfilePage] Start chat error:', err);
      setChatError(err.message || 'Failed to start chat');
    } finally {
      setStartingChat(false);
    }
  }, [currentUserId, userId, isOwnProfile, router]);

  /** Follow change handler from FollowButton */
  const handleFollowChange = useCallback(
    (_targetUserId: string, nowFollowing: boolean) => {
      setIsFollowing(nowFollowing);
    },
    []
  );

  /** Share profile URL */
  const handleShareProfile = useCallback(async () => {
    const profileUrl = `${window.location.origin}/profile/${userId}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: profile?.displayName || 'Profile',
          url: profileUrl,
        });
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(profileUrl);
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    }
  }, [userId, profile?.displayName]);

  /** Post click — open full view */
  const handlePostClick = useCallback((post: Post) => {
    setSelectedPost(post);
  }, []);

  /** Reel click — navigate to reel view */
  const handleReelClick = useCallback(
    (reel: Reel) => {
      router.push(`/feed/reel/${reel.id}`);
    },
    [router]
  );

  /** PPV unlock callback */
  const handlePostUnlocked = useCallback((postId: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, isPremium: false } : p
      )
    );
  }, []);

  // ====================================================================
  // RENDER
  // ====================================================================

  if (loading) return <ProfileSkeleton />;
  if (notFound || !profile) return <ProfileNotFound />;

  const coverPhoto =
    profile.photos && profile.photos.length > 0 ? profile.photos[0] : null;

  const initials = profile.displayName
    ? profile.displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <>
      {/* ================================================================
          HEADER SECTION
          ================================================================ */}
      <div className="relative">
        {/* Cover Photo */}
        <div className="w-full h-[300px] bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 overflow-hidden">
          {coverPhoto ? (
            <img
              src={coverPhoto}
              alt={`${profile.displayName} cover`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-8xl opacity-30">📷</span>
            </div>
          )}
        </div>

        {/* Back button (overlaying cover) */}
        <button
          onClick={() => router.back()}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors z-10"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Profile Info Container */}
      <div className="max-w-4xl mx-auto px-4">
        {/* Avatar overlapping cover */}
        <div className="-mt-10 flex items-end gap-4">
          {profile.photoURL ? (
            <img
              src={profile.photoURL}
              alt={profile.displayName}
              className="w-20 h-20 rounded-full object-cover border-4 border-white dark:border-gray-900 flex-shrink-0 shadow-lg"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 border-4 border-white dark:border-gray-900 flex-shrink-0 shadow-lg flex items-center justify-center text-white text-2xl font-bold">
              {initials}
            </div>
          )}

          {/* Name row */}
          <div className="flex-1 min-w-0 pb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                {profile.displayName}
                {/* Age — computed from dateOfBirth if available, fallback to pre-computed age */}
                {(() => {
                  const computedAge = profile.dateOfBirth
                    ? Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
                    : profile.age;
                  return computedAge !== null && computedAge !== undefined && computedAge > 0
                    ? `, ${computedAge}`
                    : '';
                })()}
              </h1>
              {profile.verified && (
                <BadgeCheck className="w-5 h-5 text-blue-500 flex-shrink-0" />
              )}
              {profile.earn_on && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 dark:bg-purple-900/30 dark:from-purple-900/30 dark:to-pink-900/30 dark:text-purple-400 rounded-full flex-shrink-0">
                  💎 Creator
                </span>
              )}
            </div>
            {/* City — shown below name line */}
            {profile.city && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {profile.city}
              </p>
            )}
          </div>
        </div>

        {/* Bio */}
        {profile.bio && (
          <p className="mt-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
            {profile.bio}
          </p>
        )}

        {/* Stats Row */}
        {profile.stats && (
          <div className="flex gap-6 mt-4">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {formatCount(profile.stats.posts)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Posts</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {formatCount(profile.stats.followers)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Followers
              </p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {formatCount(profile.stats.following)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Following
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 mt-5 flex-wrap">
          {isOwnProfile ? (
            <>
              {/* Own profile: Edit + Share */}
              <Link
                href="/account"
                className="flex-1 min-w-[120px] py-2.5 px-4 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-semibold text-sm text-center flex items-center justify-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                Edit Profile
              </Link>
              <button
                onClick={handleShareProfile}
                className="flex-1 min-w-[120px] py-2.5 px-4 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <Share2 className="w-4 h-4" />
                {shareSuccess ? 'Link Copied!' : 'Share Profile'}
              </button>
            </>
          ) : (
            <>
              {/* Other's profile: Follow + Message + Tip */}
              <div className="flex-shrink-0">
                <FollowButton
                  currentUserId={currentUserId}
                  targetUserId={userId}
                  initialFollowing={isFollowing}
                  onFollowChange={handleFollowChange}
                />
              </div>

              <button
                onClick={handleStartChat}
                disabled={startingChat}
                className="flex-1 min-w-[100px] py-2.5 px-4 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {startingChat ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <MessageCircle className="w-4 h-4" />
                )}
                Message
              </button>

              <button
                onClick={() => {
                  if (!currentUserId) {
                    router.push('/auth/login');
                    return;
                  }
                  setTipModalOpen(true);
                }}
                className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold text-sm flex items-center justify-center gap-1 hover:from-purple-600 hover:to-pink-600 transition-all shadow-sm"
              >
                💎 Tip
              </button>
            </>
          )}
        </div>

        {/* Chat error */}
        {chatError && (
          <p className="text-center text-sm text-red-500 mt-2">{chatError}</p>
        )}

        {/* ================================================================
            CONTENT TABS
            ================================================================ */}
        <div className="mt-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex">
            <button
              onClick={() => setActiveTab('posts')}
              className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'posts'
                  ? 'border-pink-500 text-pink-500'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Grid3X3 className="w-4 h-4" />
              Posts
            </button>
            <button
              onClick={() => setActiveTab('reels')}
              className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'reels'
                  ? 'border-pink-500 text-pink-500'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Film className="w-4 h-4" />
              Reels
            </button>
            <button
              onClick={() => setActiveTab('about')}
              className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'about'
                  ? 'border-pink-500 text-pink-500'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <User className="w-4 h-4" />
              About
            </button>
          </div>
        </div>

        {/* ================================================================
            TAB CONTENT
            ================================================================ */}

        {/* POSTS TAB — Instagram-style 3-column grid */}
        {activeTab === 'posts' && (
          <div className="mt-1">
            {loadingPosts && posts.length === 0 ? (
              <div className="grid grid-cols-3 gap-0.5">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square bg-gray-200 dark:bg-gray-700 animate-pulse"
                  />
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="py-16 text-center">
                <Grid3X3 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No posts yet
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-0.5">
                  {posts.map((post) => (
                    <PostGridItem
                      key={post.id}
                      post={post}
                      currentUserId={currentUserId}
                      onClick={handlePostClick}
                    />
                  ))}
                </div>

                {/* Load more */}
                {postsHasMore && (
                  <div className="py-6 text-center">
                    <button
                      onClick={loadMorePosts}
                      disabled={loadingPosts}
                      className="text-sm text-pink-500 font-semibold hover:text-pink-600 disabled:opacity-50 flex items-center gap-2 mx-auto"
                    >
                      {loadingPosts ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        'Load more posts'
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* REELS TAB — Vertical video grid */}
        {activeTab === 'reels' && (
          <div className="mt-4">
            {loadingReels && reels.length === 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-[9/16] bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : reels.length === 0 ? (
              <div className="py-16 text-center">
                <Film className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No reels yet
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {reels.map((reel) => (
                    <ReelGridItem
                      key={reel.id}
                      reel={reel}
                      onClick={handleReelClick}
                    />
                  ))}
                </div>

                {/* Load more */}
                {reelsHasMore && (
                  <div className="py-6 text-center">
                    <button
                      onClick={loadMoreReels}
                      disabled={loadingReels}
                      className="text-sm text-pink-500 font-semibold hover:text-pink-600 disabled:opacity-50 flex items-center gap-2 mx-auto"
                    >
                      {loadingReels ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        'Load more reels'
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ABOUT TAB — Extended bio, rates, earn_on surfaces */}
        {activeTab === 'about' && (
          <div className="mt-6 space-y-6 pb-8">
            {/* Extended Bio */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                About
              </h3>
              {profile.bio ? (
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                  {profile.bio}
                </p>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                  No bio provided
                </p>
              )}
            </div>

            {/* Location */}
            {profile.location && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Location
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  📍 {profile.location}
                </p>
              </div>
            )}

            {/* Rates / Earn On Surfaces */}
            {profile.earn_on && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Rates
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-pink-500" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        Chat Message
                      </span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {profile.chat_price > 0
                        ? `${profile.chat_price} tokens`
                        : 'Free'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Creator Badge Info */}
            {profile.earn_on && (
              <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">💎</span>
                  <span className="font-semibold text-gray-900 dark:text-white text-sm">
                    Verified Creator
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  This creator accepts tips, paid messages, and offers premium
                  content. Support them by subscribing or sending a tip!
                </p>
              </div>
            )}
          </div>
        )}

        {/* Bottom spacing */}
        <div className="h-8" />
      </div>

      {/* ================================================================
          MODALS
          ================================================================ */}

      {/* Tip Modal — reused from feed */}
      {tipModalOpen && currentUserId && (
        <TipModal
          isOpen={tipModalOpen}
          onClose={() => setTipModalOpen(false)}
          senderId={currentUserId}
          recipientId={userId}
          recipientName={profile.displayName}
          postId={`profile_tip_${userId}`}
        />
      )}

      {/* Post Full View Modal */}
      {selectedPost && (
        <PostFullView
          post={selectedPost}
          currentUserId={currentUserId}
          onClose={() => setSelectedPost(null)}
          onUnlocked={handlePostUnlocked}
        />
      )}
    </>
  );
}
