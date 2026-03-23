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
import { Heart, MessageCircle, Lock, Eye, MoreHorizontal, Trash2, Share2 } from 'lucide-react';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { requireDb, requireStorage } from '@/lib/firebase';
import { Post } from '@/lib/types';
import { FeedUserProfile, togglePostLike, unlockPPVContent, fetchPostComments, addPostComment, PostComment } from '@/lib/services/feedService';
import FollowButton from '@/components/feed/FollowButton';
import TipModal from '@/components/feed/TipModal';
import ImageCarousel from '@/components/feed/ImageCarousel';
import HeartAnimation from '@/components/feed/HeartAnimation';

interface PostCardProps {
  post: Post;
  author: FeedUserProfile | null;
  currentUserId: string | null;
  currentUserName?: string | null;
  currentUserPhotoURL?: string | null;
  initialLiked: boolean;
  initialFollowing?: boolean;
  onUnlocked?: (postId: string) => void;
  onFollowChange?: (targetUserId: string, isFollowing: boolean) => void;
  /** FIX 32: Callback when post is deleted by its author */
  onDelete?: (postId: string) => void;
}

export default function PostCard({
  post,
  author,
  currentUserId,
  currentUserName,
  currentUserPhotoURL,
  initialLiked,
  initialFollowing = false,
  onUnlocked,
  onFollowChange,
  onDelete,
}: PostCardProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(post.likes || 0);
  const [unlocked, setUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [tipModalOpen, setTipModalOpen] = useState(false);
  const [heartTrigger, setHeartTrigger] = useState(0);

  // FIX 32: Three-dot menu state
  const [showPostMenu, setShowPostMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // FIX 62: Inline comments state
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentCount, setCommentCount] = useState(post.comments || 0);
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  // FIX 63: Share post state
  const [shareSuccess, setShareSuccess] = useState(false);

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

  /** FIX 32: Delete post handler */
  const handleDeletePost = useCallback(async () => {
    if (!confirm('Are you sure you want to delete this post?')) return;
    setDeleting(true);
    try {
      const db = requireDb();
      const postDoc = await getDoc(doc(db, 'posts', post.id));
      if (postDoc.exists()) {
        const mediaURLs = postDoc.data().mediaUrls || postDoc.data().mediaURLs || [];
        const storage = requireStorage();
        for (const url of mediaURLs) {
          try { await deleteObject(storageRef(storage, url)); } catch { /* ignore */ }
        }
      }
      await deleteDoc(doc(db, 'posts', post.id));
      setShowPostMenu(false);
      onDelete?.(post.id);
    } catch (err) {
      console.error('Failed to delete post:', err);
    } finally {
      setDeleting(false);
    }
  }, [post.id, onDelete]);

  // FIX 62: Load comments
  const handleLoadComments = useCallback(async () => {
    if (showComments) {
      setShowComments(false);
      return;
    }
    setLoadingComments(true);
    try {
      const fetchedComments = await fetchPostComments(post.id, 20);
      setComments(fetchedComments);
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setLoadingComments(false);
      setShowComments(true);
    }
  }, [post.id, showComments]);

  // FIX 62: Submit comment
  const handleSubmitComment = useCallback(async () => {
    if (!newComment.trim() || !currentUserId || submittingComment) return;
    setSubmittingComment(true);
    try {
      const comment = await addPostComment(
        post.id,
        currentUserId,
        newComment.trim(),
        currentUserName || undefined,
        currentUserPhotoURL || undefined
      );
      if (comment) {
        setComments((prev) => [...prev, comment]);
        setCommentCount((c) => c + 1);
      }
      setNewComment('');
    } catch (error) {
      console.error('Failed to submit comment:', error);
    } finally {
      setSubmittingComment(false);
    }
  }, [newComment, currentUserId, currentUserName, currentUserPhotoURL, post.id, submittingComment]);

  // FIX 63: Share post
  const handleSharePost = useCallback(async () => {
    const url = `${window.location.origin}/feed/post/${post.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Avalo', url });
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(url);
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    }
  }, [post.id]);

  const displayName = author?.displayName || 'Anonymous';
  const avatarUrl = author?.photoURL || null;

  const isOwnPost = currentUserId === post.userId || currentUserId === (post as any).authorId;

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
        {/* FIX 32: Three-dot menu for own posts */}
        {isOwnPost && (
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowPostMenu(!showPostMenu)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Post options"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
            {showPostMenu && (
              <div className="absolute right-0 top-8 bg-white dark:bg-gray-800 shadow-lg rounded-lg py-1 z-10 border border-gray-200 dark:border-gray-700 min-w-[140px]">
                <button
                  onClick={handleDeletePost}
                  disabled={deleting}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm w-full text-left flex items-center gap-2 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleting ? 'Deleting...' : 'Delete Post'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Text Content — FIX 99: Clickable hashtags linked to /search */}
      {post.caption && (
        <div className="px-4 pb-2">
          <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {post.caption.split(/(#\w+)/g).map((part, i) =>
              part.startsWith('#') ? (
                <a
                  key={i}
                  href={`/search?q=${encodeURIComponent(part)}`}
                  className="text-[#E4458F] hover:underline"
                >
                  {part}
                </a>
              ) : (
                <span key={i}>{part}</span>
              )
            )}
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

        {/* Comment — FIX 62: inline expandable */}
        <button
          onClick={handleLoadComments}
          disabled={loadingComments}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors disabled:opacity-50"
        >
          <MessageCircle className={`w-5 h-5 ${showComments ? 'text-purple-500' : ''}`} />
          <span>{commentCount}</span>
        </button>

        {/* Share — FIX 63 */}
        <button
          onClick={handleSharePost}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
        >
          <Share2 className="w-4 h-4" />
          <span className="text-xs">{shareSuccess ? 'Copied!' : ''}</span>
        </button>

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

      {/* FIX 62: Inline Comments Section */}
      {showComments && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800">
          {/* Comment input */}
          {currentUserId && (
            <div className="flex gap-2 pt-3 mb-3">
              <input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
                placeholder="Add a comment..."
                className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-full text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={handleSubmitComment}
                disabled={!newComment.trim() || submittingComment}
                className="px-4 py-2 bg-gradient-to-r from-[#E8593C] via-[#E4458F] to-[#8B5CF6] text-white rounded-full text-sm font-medium disabled:opacity-50 transition-opacity"
              >
                {submittingComment ? '...' : 'Post'}
              </button>
            </div>
          )}
          {/* Comments list */}
          {loadingComments ? (
            <div className="py-3 text-center text-sm text-gray-400">Loading comments...</div>
          ) : comments.length === 0 ? (
            <div className="py-3 text-center text-sm text-gray-400">No comments yet. Be the first!</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                    {c.photoURL && (
                      <Image src={c.photoURL} alt="" width={28} height={28} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      <strong className="text-gray-900 dark:text-white">{c.displayName || 'User'}</strong>{' '}
                      <span className="text-gray-400 dark:text-gray-500">
                        {c.createdAt?.toDate ? formatCommentTime(c.createdAt.toDate()) : 'Just now'}
                      </span>
                    </p>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

/**
 * FIX 62: Relative time formatter for comments
 */
function formatCommentTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;

  return date.toLocaleDateString();
}
