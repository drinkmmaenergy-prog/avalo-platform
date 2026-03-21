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
import { DocumentSnapshot, doc, getDoc, collection, query, where, getDocs, limit, arrayUnion, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import { useAuth } from '@/components/providers/AuthProvider';
import { requireDb, requireStorage } from '@/lib/firebase';
import { toast } from '@/components/ui/Toaster';
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

  // ── FIX 18: Live post/follower/following counts ────────────────────
  const [postCount, setPostCount] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  // ── FIX 32: Subscribe button state ─────────────────────────────────
  const [hasSubscriptions, setHasSubscriptions] = useState(false);

  // ── FIX 33: Suggested profiles ─────────────────────────────────────
  const [suggestions, setSuggestions] = useState<any[]>([]);

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

        // FIX 4: Read from public_profiles FIRST, fall back to users/{uid}, merge
        const db = requireDb();
        const publicSnap = await getDoc(doc(db, 'public_profiles', userId));
        const userSnap = await getDoc(doc(db, 'users', userId));
        const merged = { ...userSnap.data?.(), ...publicSnap.data?.() } as any;

        if (!active) return;

        // If neither doc exists, try legacy getPublicProfile
        if (!publicSnap.exists() && !userSnap.exists()) {
          const result = await getPublicProfile(userId);
          if (!active) return;
          if (!result) {
            setNotFound(true);
          } else {
            setProfile(result);
          }
          return;
        }

        // Build profile from merged data
        const result: PublicProfile = {
          uid: userId,
          displayName: merged.displayName ?? merged.name ?? '',
          photoURL: merged.photoURL ?? merged.avatarUrl ?? '',
          coverURL: merged.coverURL ?? '',
          bio: merged.bio ?? '',
          age: merged.age ?? null,
          dateOfBirth: merged.dateOfBirth ?? null,
          city: merged.city ?? merged.location ?? '',
          location: merged.location ?? merged.city ?? '',
          gender: merged.gender ?? '',
          lookingFor: merged.lookingFor ?? '',
          interests: merged.interests ?? [],
          verified: merged.verified ?? merged.isVerified ?? false,
          earn_on: merged.earn_on ?? false,
          chat_price: merged.chat_price ?? merged.chatPricePerToken ?? 0,
          photos: merged.photos ?? [],
          stats: merged.stats ?? {
            posts: merged.totalPosts ?? 0,
            followers: merged.followerCount ?? 0,
            following: merged.followingCount ?? 0,
          },
          discoverable: merged.discoverable ?? true,
          online: merged.online ?? false,
          lastActiveAt: merged.lastActiveAt ?? null,
          createdAt: merged.createdAt ?? null,
          updatedAt: merged.updatedAt ?? null,
        };
        setProfile(result);
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
  // FIX 18: QUERY LIVE POST / FOLLOWER / FOLLOWING COUNTS
  // ====================================================================
  useEffect(() => {
    if (!userId) return;
    let active = true;

    async function loadCounts() {
      try {
        const db = requireDb();

        // Post count
        const postsQuery = query(collection(db, 'posts'), where('authorId', '==', userId));
        const postsSnap = await getDocs(postsQuery);
        if (active) setPostCount(postsSnap.size);

        // Follower count
        const followersQuery = query(collection(db, 'follows'), where('followeeId', '==', userId));
        const followersSnap = await getDocs(followersQuery);
        if (active) setFollowerCount(followersSnap.size);

        // Following count
        const followingQuery = query(collection(db, 'follows'), where('followerId', '==', userId));
        const followingSnap = await getDocs(followingQuery);
        if (active) setFollowingCount(followingSnap.size);
      } catch (err) {
        console.error('[UserProfilePage] Count query error:', err);
      }
    }

    void loadCounts();
    return () => { active = false; };
  }, [userId]);

  // ====================================================================
  // FIX 32: CHECK IF PROFILE USER HAS SUBSCRIPTIONS ENABLED
  // ====================================================================
  useEffect(() => {
    if (!userId || isOwnProfile) return;
    let active = true;

    async function checkSubscriptions() {
      try {
        const db = requireDb();
        const earnSnap = await getDoc(doc(db, 'earn_settings', userId));
        if (active && earnSnap.exists()) {
          const data = earnSnap.data();
          setHasSubscriptions(data?.subscriptions === true);
        }
      } catch (err) {
        console.error('[UserProfilePage] Earn settings check error:', err);
      }
    }

    void checkSubscriptions();
    return () => { active = false; };
  }, [userId, isOwnProfile]);

  // ====================================================================
  // FIX 33: LOAD SUGGESTED PROFILES
  // ====================================================================
  useEffect(() => {
    let active = true;

    async function loadSuggestions() {
      try {
        const db = requireDb();
        const q = query(
          collection(db, 'public_profiles'),
          where('discoverable', '==', true),
          limit(8)
        );
        const snap = await getDocs(q);
        const profiles = snap.docs
          .map(d => ({ ...d.data(), uid: d.id }))
          .filter((p: any) => p.uid !== userId && p.uid !== currentUserId);
        if (active) setSuggestions(profiles.slice(0, 6));
      } catch (err) {
        console.error('[UserProfilePage] Suggestions load error:', err);
      }
    }

    void loadSuggestions();
    return () => { active = false; };
  }, [userId, currentUserId]);

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

  /** FIX 26: Quick photo upload handler */
  const handleQuickPhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUserId) return;

    try {
      const storage = requireStorage();
      const storageRef = ref(storage, `users/${currentUserId}/photos/${Date.now()}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      const db = requireDb();
      await updateDoc(doc(db, 'public_profiles', currentUserId), {
        photos: arrayUnion(downloadURL),
      });

      toast({ type: 'success', title: 'Photo added!' });
    } catch (err) {
      console.error('[UserProfilePage] Quick photo upload error:', err);
      toast({ type: 'error', title: 'Failed to upload photo' });
    }
  }, [currentUserId]);

  /** FIX 32: Subscribe handler (placeholder) */
  const handleSubscribe = useCallback(() => {
    toast({ type: 'info', title: 'Coming soon — subscription payments will be available after Stripe integration is complete.' });
  }, []);

  // ====================================================================
  // RENDER
  // ====================================================================

  if (loading) return <ProfileSkeleton />;
  if (notFound || !profile) return <ProfileNotFound />;

  const coverPhoto =
    profile.coverURL || (profile.photos && profile.photos.length > 0 ? profile.photos[0] : null);

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
        {/* Cover Photo — FIX 22 */}
        <div className="w-full h-48 sm:h-56 relative overflow-hidden">
          {coverPhoto ? (
            <img src={coverPhoto} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full" style={{background: 'linear-gradient(135deg, #E8593C, #E4458F, #8B5CF6)'}} />
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
        {/* Avatar overlapping cover — FIX 22 */}
        <div className="relative -mt-12 ml-4 z-10 flex items-end gap-4">
          {profile.photoURL ? (
            <img
              src={profile.photoURL}
              alt=""
              className="w-24 h-24 rounded-full border-4 border-white shadow-lg object-cover"
            />
          ) : (
            <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-3xl font-bold">
              {profile.displayName?.charAt(0) || '?'}
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

        {/* Stats Row — FIX 18: Uses live Firestore counts, falls back to profile.stats */}
        <div className="flex gap-6 text-sm mt-4">
          <span><strong>{formatCount(postCount || profile.stats?.posts || 0)}</strong> Posts</span>
          <span><strong>{formatCount(followerCount || profile.stats?.followers || 0)}</strong> Followers</span>
          <span><strong>{formatCount(followingCount || profile.stats?.following || 0)}</strong> Following</span>
        </div>

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

              {/* FIX 32: Subscribe button */}
              {hasSubscriptions && (
                <button
                  onClick={handleSubscribe}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold"
                >
                  Subscribe
                </button>
              )}
            </>
          )}
        </div>

        {/* FIX 26: Owner quick action buttons */}
        {isOwnProfile && (
          <div className="flex gap-2 mt-3">
            <button onClick={() => router.push('/create/post')}
              className="flex-1 py-2 px-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg text-sm font-medium">
              + New Post
            </button>
            <button onClick={() => document.getElementById('quick-photo-upload')?.click()}
              className="flex-1 py-2 px-3 border border-gray-300 rounded-lg text-sm font-medium">
              + Add Photo
            </button>
            <input id="quick-photo-upload" type="file" accept="image/*" className="hidden"
              onChange={handleQuickPhotoUpload} />
          </div>
        )}

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

            {/* Gender */}
            {profile.gender && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Gender
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {profile.gender}
                </p>
              </div>
            )}

            {/* Looking For */}
            {profile.lookingFor && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Looking For
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {profile.lookingFor}
                </p>
              </div>
            )}

            {/* Interests */}
            {profile.interests && profile.interests.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Interests
                </h3>
                <div className="flex flex-wrap gap-2">
                  {profile.interests.map((interest, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            )}

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

        {/* FIX 33: Suggested profiles carousel */}
        {suggestions.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-500 mb-3">You might also like</h3>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{scrollSnapType: 'x mandatory'}}>
              {suggestions.map((s: any) => (
                <Link href={`/profile/${s.uid}`} key={s.uid}
                  className="flex-shrink-0 w-28" style={{scrollSnapAlign: 'start'}}>
                  <div className="w-28 h-36 rounded-xl overflow-hidden relative">
                    {s.photoURL ? (
                      <img src={s.photoURL} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-2xl font-bold">
                        {s.displayName?.charAt(0)}
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                      <p className="text-white text-xs font-medium truncate">{s.displayName}</p>
                      <p className="text-white/70 text-[10px] truncate">{s.city}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
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
