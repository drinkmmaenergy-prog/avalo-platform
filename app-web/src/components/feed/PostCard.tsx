'use client';

/**
 * PACK 323 - Post Card Component
 * Displays a single post in the feed with avatar, text, media, like/comment counts,
 * PPV blur overlay, and unlock button.
 *
 * Extended: Follow/Unfollow button, Tip button, Image carousel, double-tap like.
 */

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, MessageCircle, Lock, Eye } from 'lucide-react';
import { Post } from '@/lib/types';
import { FeedUserProfile, togglePostLike, unlockPPVContent } from '@/lib/services/feedService';
import FollowButton from '@/components/feed/FollowButton';
import TipModal from '@/components/feed/TipModal';
import ImageCarousel from '@/components/feed/ImageCarousel';
import HeartAnimation from '@/components/feed/HeartAnimation';

interface PostCardProps {
  post: Post;
  author: FeedUserProfile | null;
  currentUserId: string | null;
  initialLiked: boolean;
  initialFollowing?: boolean;
  onUnlocked?: (postId: string) => void;
  onFollowChange?: (targetUserId: string, isFollowing: boolean) => void;
}

export default function PostCard({
  post,
  author,
  currentUserId,
  initialLiked,
  initialFollowing = false,
  onUnlocked,
  onFollowChange,
}: PostCardProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(post.likes || 0);
  const [unlocked, setUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [tipModalOpen, setTipModalOpen] = useState(false);
  const [heartTrigger, setHeartTrigger] = useState(0);

  const isPPV = post.isPremium && !unlocked;
  const hasMedia = !!post.mediaUrl || !!post.thumbnailUrl;

  // Build images array for carousel support
  // Support both single mediaUrl and potential mediaUrls array (from post data)
  const postImages: string[] = [];
  const postData = post as Post & { mediaUrls?: string[] };
  if (postData.mediaUrls && Array.isArray(postData.mediaUrls) && postData.mediaUrls.length > 0) {
    postImages.push(...postData.mediaUrls);
  } else if (post.mediaUrl) {
    postImages.push(post.mediaUrl);
  } else if (post.thumbnailUrl) {
    postImages.push(post.thumbnailUrl);
  }

  const isImagePost = post.mediaType !== 'video' && postImages.length > 0;

  const handleLike = useCallback(async () => {
    if (!currentUserId) return;

    // Optimistic update
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((prev) => (newLiked ? prev + 1 : prev - 1));

    try {
      await togglePostLike(post.id, currentUserId);
    } catch (error) {
      // Revert on failure
      console.error('Like failed, reverting:', error);
      setLiked(!newLiked);
      setLikeCount((prev) => (newLiked ? prev - 1 : prev + 1));
    }
  }, [currentUserId, liked, post.id]);

  const handleDoubleTapLike = useCallback(() => {
    if (!currentUserId) return;
    if (!liked) {
      // Only like (not unlike) on double-tap
      setLiked(true);
      setLikeCount((prev) => prev + 1);
      togglePostLike(post.id, currentUserId).catch((error) => {
        console.error('Double-tap like failed:', error);
        setLiked(false);
        setLikeCount((prev) => prev - 1);
      });
    }
    // Always show animation regardless
    setHeartTrigger((prev) => prev + 1);
  }, [currentUserId, liked, post.id]);

  const handleUnlock = useCallback(async () => {
    if (!currentUserId) return;

    setUnlocking(true);
    setUnlockError(null);

    try {
      const result = await unlockPPVContent(post.id, 'post', currentUserId);
      if (result.success) {
        setUnlocked(true);
        onUnlocked?.(post.id);
      } else {
        setUnlockError(result.error || 'Failed to unlock');
      }
    } catch (error: any) {
      setUnlockError(error?.message || 'Failed to unlock content');
    } finally {
      setUnlocking(false);
    }
  }, [currentUserId, post.id, onUnlocked]);

  const displayName = author?.displayName || 'Anonymous';
  const avatarUrl = author?.photoURL || null;

  return (
    <div className="card overflow-hidden bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
      {/* Author Header */}
      <div className="flex items-center gap-3 p-4 pb-2">
        <Link href={`/profile/${post.userId}`} className="flex-shrink-0">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={displayName}
              width={40}
              height={40}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-sm">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/profile/${post.userId}`}
              className="font-semibold text-sm text-gray-900 dark:text-white hover:underline truncate"
            >
              {displayName}
              {author?.isVerified && (
                <span className="ml-1 text-blue-500" title="Verified">✓</span>
              )}
            </Link>
            <FollowButton
              currentUserId={currentUserId}
              targetUserId={post.userId}
              initialFollowing={initialFollowing}
              onFollowChange={onFollowChange}
            />
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {post.createdAt?.toDate?.()
              ? timeAgo(post.createdAt.toDate())
              : 'Just now'}
          </span>
        </div>
      </div>

      {/* Text Content */}
      {post.caption && (
        <div className="px-4 pb-2">
          <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {post.caption}
          </p>
        </div>
      )}

      {/* Media — Image Carousel with double-tap like */}
      {isImagePost && !isPPV && (
        <div className="relative">
          <ImageCarousel
            images={postImages}
            alt={`Post by ${displayName}`}
            isPPV={false}
            onDoubleTap={handleDoubleTapLike}
          />
          <HeartAnimation trigger={heartTrigger} />
        </div>
      )}

      {/* Media — Video or PPV-locked content (existing behavior preserved) */}
      {hasMedia && (isPPV || post.mediaType === 'video') && !(isImagePost && !isPPV) && (
        <Link href={`/feed/post/${post.id}`} className="block relative">
          <div className="relative w-full overflow-hidden bg-gray-100 dark:bg-gray-800" style={{ maxHeight: '600px' }}>
            {post.mediaType === 'video' ? (
              <>
                <video
                  src={isPPV ? undefined : post.mediaUrl}
                  poster={post.thumbnailUrl || undefined}
                  className={`w-full h-full object-cover ${isPPV ? 'blur-xl scale-110' : ''}`}
                  muted
                  playsInline
                  preload="metadata"
                  style={{ maxHeight: '600px' }}
                />
                {isPPV && post.thumbnailUrl && (
                  <Image
                    src={post.thumbnailUrl}
                    alt="Locked content"
                    fill
                    className="object-cover blur-xl scale-110"
                  />
                )}
              </>
            ) : (
              <div className="relative">
                <ImageCarousel
                  images={postImages}
                  alt="Locked content"
                  isPPV={true}
                />
              </div>
            )}

            {/* PPV Overlay */}
            {isPPV && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                <Lock className="w-10 h-10 text-white mb-3" />
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleUnlock();
                  }}
                  disabled={unlocking || !currentUserId}
                  className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-semibold rounded-full text-sm hover:from-purple-700 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  {unlocking
                    ? 'Unlocking...'
                    : `Unlock for ${post.unlockPrice || 0} tokens`}
                </button>
                {unlockError && (
                  <p className="mt-2 text-xs text-red-300">{unlockError}</p>
                )}
              </div>
            )}
          </div>
        </Link>
      )}

      {/* Actions Row */}
      <div className="flex items-center gap-4 px-4 py-3 border-t border-gray-100 dark:border-gray-800">
        {/* Like */}
        <button
          onClick={handleLike}
          disabled={!currentUserId}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
        >
          <Heart
            className={`w-5 h-5 ${liked ? 'fill-red-500 text-red-500' : ''}`}
          />
          <span>{likeCount}</span>
        </button>

        {/* Comment */}
        <Link
          href={`/feed/post/${post.id}`}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
          <span>{post.comments || 0}</span>
        </Link>

        {/* Tip */}
        {currentUserId && currentUserId !== post.userId && (
          <button
            onClick={() => setTipModalOpen(true)}
            className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
          >
            <span className="text-base">💎</span>
            <span>Tip</span>
          </button>
        )}

        {/* Views (pushed to right) */}
        <div className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 ml-auto">
          <Eye className="w-4 h-4" />
          <span>{post.views || 0}</span>
        </div>
      </div>

      {/* Tip Modal */}
      {currentUserId && (
        <TipModal
          isOpen={tipModalOpen}
          onClose={() => setTipModalOpen(false)}
          senderId={currentUserId}
          recipientId={post.userId}
          recipientName={displayName}
          postId={post.id}
        />
      )}
    </div>
  );
}

/**
 * Simple relative time formatter
 */
function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString();
}
