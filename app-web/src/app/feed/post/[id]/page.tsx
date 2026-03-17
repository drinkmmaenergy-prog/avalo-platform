'use client';

/**
 * PACK 323 - Post Viewer Page (Web)
 * Single post view with full media, comments from post_comments/{postId}/comments,
 * and like button writing to post_likes/{postId}/users/{uid}.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Heart, MessageCircle, ArrowLeft, Lock, Send, Loader2, Eye } from 'lucide-react';

import { useAuth } from '@/components/providers/AuthProvider';
import { Post } from '@/lib/types';
import {
  fetchPostById,
  fetchPostComments,
  addPostComment,
  togglePostLike,
  checkPostLiked,
  fetchUserProfiles,
  unlockPPVContent,
  incrementPostViews,
  PostComment,
  FeedUserProfile,
} from '@/lib/services/feedService';

export default function PostViewerPage() {
  const params = useParams()!;
  const router = useRouter();
  const postId = params.id as string;
  const { user, firebaseUser } = useAuth();
  const currentUserId = firebaseUser?.uid || null;

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [authorProfile, setAuthorProfile] = useState<FeedUserProfile | null>(null);
  const [commentProfiles, setCommentProfiles] = useState<Record<string, FeedUserProfile>>({});
  const [unlocked, setUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // ========================================================================
  // Load post + comments + like status
  // ========================================================================
  useEffect(() => {
    loadPost();
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  useEffect(() => {
    if (currentUserId && postId) {
      checkPostLiked(postId, currentUserId).then(setLiked).catch(() => {});
    }
  }, [currentUserId, postId]);

  const loadPost = async () => {
    try {
      setLoading(true);
      const postData = await fetchPostById(postId);

      if (postData) {
        setPost(postData);
        setLikeCount(postData.likes || 0);

        // Track view
        incrementPostViews(postId).catch(() => {});

        // Fetch author profile
        const profiles = await fetchUserProfiles([postData.userId]);
        setAuthorProfile(profiles[postData.userId] || null);

        // Check unlock status for PPV
        if (postData.isPremium && currentUserId) {
          const { checkContentUnlocked } = await import('@/lib/services/feedService');
          const isUnlocked = await checkContentUnlocked(postId, 'post', currentUserId);
          setUnlocked(isUnlocked);
        }
      }
    } catch (error) {
      console.error('Error loading post:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async () => {
    try {
      const commentsData = await fetchPostComments(postId);
      setComments(commentsData);

      // Fetch profiles for comment authors
      const userIds = commentsData.map((c) => c.userId).filter(Boolean);
      if (userIds.length > 0) {
        const profiles = await fetchUserProfiles(userIds);
        setCommentProfiles(profiles);
      }
    } catch (error) {
      console.error('Error loading comments:', error);
    }
  };

  // ========================================================================
  // Like
  // ========================================================================
  const handleLike = useCallback(async () => {
    if (!currentUserId) return;

    // Optimistic update
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((prev) => (newLiked ? prev + 1 : prev - 1));

    try {
      await togglePostLike(postId, currentUserId);
    } catch (error) {
      console.error('Error liking post:', error);
      // Revert
      setLiked(!newLiked);
      setLikeCount((prev) => (newLiked ? prev - 1 : prev + 1));
    }
  }, [currentUserId, liked, postId]);

  // ========================================================================
  // Comment
  // ========================================================================
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !currentUserId) return;

    setSubmitting(true);
    try {
      const newComment = await addPostComment(
        postId,
        currentUserId,
        commentText.trim(),
        user?.displayName || undefined,
        user?.photoURL || undefined
      );

      if (newComment) {
        setComments((prev) => [...prev, newComment]);
        // Add profile for the commenter
        if (user) {
          setCommentProfiles((prev) => ({
            ...prev,
            [currentUserId]: {
              uid: currentUserId,
              displayName: user.displayName,
              photoURL: user.photoURL,
              isVerified: user.isVerified,
              isCreator: user.isCreator,
            },
          }));
        }
      }

      setCommentText('');
    } catch (error: any) {
      console.error('Error adding comment:', error);
      alert(error.message || 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  // ========================================================================
  // Unlock PPV
  // ========================================================================
  const handleUnlock = useCallback(async () => {
    if (!currentUserId) return;
    setUnlocking(true);
    setUnlockError(null);

    try {
      const result = await unlockPPVContent(postId, 'post', currentUserId);
      if (result.success) {
        setUnlocked(true);
      } else {
        setUnlockError(result.error || 'Failed to unlock');
      }
    } catch (error: any) {
      setUnlockError(error?.message || 'Failed to unlock content');
    } finally {
      setUnlocking(false);
    }
  }, [currentUserId, postId]);

  // ========================================================================
  // Render
  // ========================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-gray-500 mb-4">Post not found</p>
        <button
          onClick={() => router.push('/feed')}
          className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          Back to Feed
        </button>
      </div>
    );
  }

  const isPPV = post.isPremium && !unlocked;
  const hasMedia = !!post.mediaUrl || !!post.thumbnailUrl;
  const authorName = authorProfile?.displayName || 'Anonymous';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-2 text-purple-600 hover:text-purple-700 text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          {/* Author Header */}
          <div className="flex items-center gap-3 p-5 pb-3">
            <Link href={`/profile/${post.userId}`} className="flex-shrink-0">
              {authorProfile?.photoURL ? (
                <Image
                  src={authorProfile.photoURL}
                  alt={authorName}
                  width={44}
                  height={44}
                  className="w-11 h-11 rounded-full object-cover"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold">
                  {authorName.charAt(0).toUpperCase()}
                </div>
              )}
            </Link>
            <div>
              <Link
                href={`/profile/${post.userId}`}
                className="font-semibold text-gray-900 dark:text-white hover:underline"
              >
                {authorName}
                {authorProfile?.isVerified && (
                  <span className="ml-1 text-blue-500">✓</span>
                )}
              </Link>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {post.createdAt?.toDate?.()
                  ? post.createdAt.toDate().toLocaleString()
                  : 'Just now'}
              </p>
            </div>
          </div>

          {/* Post Content */}
          <div className="px-5 pb-3">
            {post.caption && (
              <p className="text-gray-800 dark:text-gray-200 text-base mb-4 whitespace-pre-wrap">
                {post.caption}
              </p>
            )}

            {/* Media */}
            {hasMedia && (
              <div className="relative rounded-lg overflow-hidden mb-4">
                {post.mediaType === 'video' ? (
                  isPPV ? (
                    <div className="relative aspect-video bg-gray-200 dark:bg-gray-800">
                      {post.thumbnailUrl && (
                        <Image
                          src={post.thumbnailUrl}
                          alt="Locked"
                          fill
                          className="object-cover blur-xl scale-110"
                        />
                      )}
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                        <Lock className="w-12 h-12 text-white mb-3" />
                        <button
                          onClick={handleUnlock}
                          disabled={unlocking || !currentUserId}
                          className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-semibold rounded-full text-sm hover:from-purple-700 hover:to-pink-600 disabled:opacity-50 shadow-lg"
                        >
                          {unlocking
                            ? 'Unlocking...'
                            : `Unlock for ${post.unlockPrice || 0} tokens`}
                        </button>
                        {unlockError && (
                          <p className="mt-2 text-xs text-red-300">{unlockError}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <video
                      src={post.mediaUrl}
                      poster={post.thumbnailUrl || undefined}
                      controls
                      className="w-full aspect-video object-cover"
                      playsInline
                    />
                  )
                ) : isPPV ? (
                  <div className="relative aspect-square bg-gray-200 dark:bg-gray-800">
                    <Image
                      src={post.thumbnailUrl || post.mediaUrl || ''}
                      alt="Locked"
                      fill
                      className="object-cover blur-xl scale-110"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                      <Lock className="w-12 h-12 text-white mb-3" />
                      <button
                        onClick={handleUnlock}
                        disabled={unlocking || !currentUserId}
                        className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-semibold rounded-full text-sm hover:from-purple-700 hover:to-pink-600 disabled:opacity-50 shadow-lg"
                      >
                        {unlocking
                          ? 'Unlocking...'
                          : `Unlock for ${post.unlockPrice || 0} tokens`}
                      </button>
                      {unlockError && (
                        <p className="mt-2 text-xs text-red-300">{unlockError}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="relative aspect-square">
                    <Image
                      src={post.mediaUrl || post.thumbnailUrl || ''}
                      alt="Post media"
                      fill
                      className="object-cover rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-6 py-4 border-t border-gray-200 dark:border-gray-800">
              <button
                onClick={handleLike}
                disabled={!currentUserId}
                className="flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
              >
                <Heart
                  className={`w-6 h-6 ${liked ? 'fill-red-500 text-red-500' : ''}`}
                />
                <span className="text-sm font-medium">{likeCount}</span>
              </button>
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <MessageCircle className="w-6 h-6" />
                <span className="text-sm font-medium">{comments.length}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 ml-auto">
                <Eye className="w-5 h-5" />
                <span className="text-sm">{post.views || 0}</span>
              </div>
            </div>
          </div>

          {/* Comments Section */}
          <div className="border-t border-gray-200 dark:border-gray-800 p-5">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Comments ({comments.length})
            </h3>

            {/* Comment List */}
            <div className="space-y-4 mb-6">
              {comments.map((comment) => {
                const commentAuthor = commentProfiles[comment.userId];
                const commentName =
                  comment.displayName ||
                  commentAuthor?.displayName ||
                  'Anonymous';
                const commentAvatar =
                  comment.photoURL || commentAuthor?.photoURL || null;

                return (
                  <div
                    key={comment.id}
                    className="flex gap-3 pb-4 border-b border-gray-100 dark:border-gray-800 last:border-0"
                  >
                    {/* Comment author avatar */}
                    <div className="flex-shrink-0">
                      {commentAvatar ? (
                        <Image
                          src={commentAvatar}
                          alt={commentName}
                          width={32}
                          height={32}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 text-xs font-semibold">
                          {commentName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {commentName}
                        </span>
                        <span className="text-xs text-gray-400">
                          {comment.createdAt?.toDate?.()
                            ? comment.createdAt.toDate().toLocaleString()
                            : 'Just now'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">
                        {comment.text}
                      </p>
                    </div>
                  </div>
                );
              })}

              {comments.length === 0 && (
                <p className="text-gray-500 text-center py-8 text-sm">
                  No comments yet. Be the first!
                </p>
              )}
            </div>

            {/* Comment Input */}
            {currentUserId ? (
              <form onSubmit={handleAddComment} className="flex gap-3">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  maxLength={2000}
                />
                <button
                  type="submit"
                  disabled={!commentText.trim() || submitting}
                  className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </form>
            ) : (
              <p className="text-center text-sm text-gray-500">
                <Link
                  href="/auth/login"
                  className="text-purple-600 hover:underline"
                >
                  Sign in
                </Link>{' '}
                to comment
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
