/**
 * PACK 282 — Feed Interactions
 * Like, comment, save, view tracking, and reporting functionality
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId } from './init';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';
import * as z from 'zod';
import {
  FeedComment,
  CreateCommentInput,
  UpdateCommentInput,
  CreateReportInput,
  FeedReport,
} from './pack282-feed-types';
import { moderateText } from './aiModeration';
import { canSendMessage, getEnforcementState } from './moderationEngine';

// ============================================================================
// SCHEMAS
// ============================================================================

const CreateCommentSchema = z.object({
  postId: z.string(),
  text: z.string().min(1).max(2000),
  parentCommentId: z.string().optional(),
});

const UpdateCommentSchema = z.object({
  commentId: z.string(),
  text: z.string().min(1).max(2000),
});

const CreateReportSchema = z.object({
  targetType: z.enum(['post', 'comment', 'user']),
  targetId: z.string(),
  reason: z.enum(['hate', 'spam', 'illegal', 'violence', 'sexual_minor', 'harassment', 'misinformation', 'copyright', 'other']),
  details: z.string().max(1000).optional(),
});

// ============================================================================
// LIKE OPERATIONS
// ============================================================================

/**
 * Like a post
 */
export const likePost = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { postId } = request.data;
    if (!postId) {
      throw new HttpsError('invalid-argument', 'postId is required');
    }

    // Check if post exists
    const postDoc = await db.collection('feedPosts').doc(postId).get();
    if (!postDoc.exists || postDoc.data()?.deleted) {
      throw new HttpsError('not-found', 'Post not found');
    }

    // Check enforcement state
    const enforcement = await getEnforcementState(uid);
    if (enforcement.accountStatus !== 'ACTIVE') {
      throw new HttpsError('permission-denied', 'Account is restricted');
    }

    const likeId = `${postId}_${uid}`;
    const likeRef = db.collection('feedLikes').doc(likeId);

    // Check if already liked
    const existingLike = await likeRef.get();
    if (existingLike.exists) {
      return { success: true, alreadyLiked: true };
    }

    // Create like
    await likeRef.set({
      postId,
      userId: uid,
      createdAt: serverTimestamp(),
    });

    // Update post stats
    await db.collection('feedPosts').doc(postId).update({
      'stats.likes': FieldValue.increment(1),
      updatedAt: serverTimestamp(),
    });

    logger.info(`User ${uid} liked post ${postId}`);

    return { success: true, alreadyLiked: false };
  }
);

/**
 * Unlike a post
 */
export const unlikePost = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { postId } = request.data;
    if (!postId) {
      throw new HttpsError('invalid-argument', 'postId is required');
    }

    const likeId = `${postId}_${uid}`;
    const likeRef = db.collection('feedLikes').doc(likeId);

    // Check if like exists
    const existingLike = await likeRef.get();
    if (!existingLike.exists) {
      return { success: true, wasNotLiked: true };
    }

    // Delete like
    await likeRef.delete();

    // Update post stats
    await db.collection('feedPosts').doc(postId).update({
      'stats.likes': FieldValue.increment(-1),
      updatedAt: serverTimestamp(),
    });

    logger.info(`User ${uid} unliked post ${postId}`);

    return { success: true, wasNotLiked: false };
  }
);

/**
 * Get likes for a post
 */
export const getPostLikes = onCall(
  {
    region: 'europe-west3',
  },
  async (request) => {
    const { postId, limit = 50, cursor } = request.data;

    if (!postId) {
      throw new HttpsError('invalid-argument', 'postId is required');
    }

    let query = db
      .collection('feedLikes')
      .where('postId', '==', postId)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    if (cursor) {
      const cursorDoc = await db.collection('feedLikes').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const likes = snapshot.docs.map(doc => doc.data());

    // Get user info for likes
    const userIds = likes.map(l => l.userId);
    const usersSnap = await db
      .collection('users')
      .where('__name__', 'in', userIds.slice(0, 10))
      .select('displayName', 'username', 'avatarUrl', 'verified')
      .get();

    const usersMap = new Map(usersSnap.docs.map(d => [d.id, d.data()]));

    const enrichedLikes = likes.map(like => ({
      ...like,
      user: usersMap.get(like.userId),
    }));

    return {
      likes: enrichedLikes,
      hasMore: snapshot.docs.length === limit,
      nextCursor: snapshot.docs.length === limit ? snapshot.docs[snapshot.docs.length - 1].id : null,
    };
  }
);

// ============================================================================
// COMMENT OPERATIONS
// ============================================================================

/**
 * Create a comment
 */
export const createComment = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const data = CreateCommentSchema.parse(request.data);

    // Check if post exists
    const postDoc = await db.collection('feedPosts').doc(data.postId).get();
    if (!postDoc.exists || postDoc.data()?.deleted) {
      throw new HttpsError('not-found', 'Post not found');
    }

    // Check if user can message/comment
    const messageCheck = await canSendMessage(uid);
    if (!messageCheck.allowed) {
      throw new HttpsError('permission-denied', 'You cannot comment at this time');
    }

    // Moderate comment text
    const moderation = await moderateText(data.text);
    if (moderation.action === 'block') {
      throw new HttpsError(
        'invalid-argument',
        'Comment violates community guidelines',
        { reasons: moderation.reasons }
      );
    }

    const commentId = generateId();
    const now = serverTimestamp();

    const comment: FeedComment = {
      commentId,
      postId: data.postId,
      authorId: uid,
      text: data.text,
      createdAt: now as any,
      updatedAt: now as any,
      deleted: false,
      reportedCount: 0,
      parentCommentId: data.parentCommentId,
    };

    await db.collection('feedComments').doc(commentId).set(comment);

    // Update post stats
    await db.collection('feedPosts').doc(data.postId).update({
      'stats.comments': FieldValue.increment(1),
      updatedAt: serverTimestamp(),
    });

    logger.info(`User ${uid} commented on post ${data.postId}`);

    return {
      success: true,
      commentId,
      requiresReview: moderation.action === 'review',
    };
  }
);

/**
 * Update a comment
 */
export const updateComment = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const data = UpdateCommentSchema.parse(request.data);

    const commentRef = db.collection('feedComments').doc(data.commentId);
    const commentDoc = await commentRef.get();

    if (!commentDoc.exists) {
      throw new HttpsError('not-found', 'Comment not found');
    }

    const comment = commentDoc.data() as FeedComment;

    if (comment.authorId !== uid) {
      throw new HttpsError('permission-denied', 'Not the comment author');
    }

    // Moderate updated text
    const moderation = await moderateText(data.text);
    if (moderation.action === 'block') {
      throw new HttpsError(
        'invalid-argument',
        'Comment violates community guidelines',
        { reasons: moderation.reasons }
      );
    }

    await commentRef.update({
      text: data.text,
      updatedAt: serverTimestamp(),
    });

    logger.info(`User ${uid} updated comment ${data.commentId}`);

    return {
      success: true,
      requiresReview: moderation.action === 'review',
    };
  }
);

/**
 * Delete a comment (soft delete)
 */
export const deleteComment = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { commentId } = request.data;
    if (!commentId) {
      throw new HttpsError('invalid-argument', 'commentId is required');
    }

    const commentRef = db.collection('feedComments').doc(commentId);
    const commentDoc = await commentRef.get();

    if (!commentDoc.exists) {
      throw new HttpsError('not-found', 'Comment not found');
    }

    const comment = commentDoc.data() as FeedComment;

    if (comment.authorId !== uid) {
      throw new HttpsError('permission-denied', 'Not the comment author');
    }

    await commentRef.update({
      deleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: uid,
      updatedAt: serverTimestamp(),
    });

    // Update post stats
    await db.collection('feedPosts').doc(comment.postId).update({
      'stats.comments': FieldValue.increment(-1),
      updatedAt: serverTimestamp(),
    });

    logger.info(`User ${uid} deleted comment ${commentId}`);

    return { success: true };
  }
);

/**
 * Get comments for a post
 */
export const getPostComments = onCall(
  {
    region: 'europe-west3',
  },
  async (request) => {
    const { postId, limit = 50, cursor, sortOrder = 'desc' } = request.data;

    if (!postId) {
      throw new HttpsError('invalid-argument', 'postId is required');
    }

    let query = db
      .collection('feedComments')
      .where('postId', '==', postId)
      .where('deleted', '==', false)
      .orderBy('createdAt', sortOrder === 'asc' ? 'asc' : 'desc')
      .limit(limit);

    if (cursor) {
      const cursorDoc = await db.collection('feedComments').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const comments = snapshot.docs.map(doc => doc.data() as FeedComment);

    // Get user info for comments
    const userIds = Array.from(new Set(comments.map(c => c.authorId)));
    const usersSnap = await db
      .collection('users')
      .where('__name__', 'in', userIds.slice(0, 10))
      .select('displayName', 'username', 'avatarUrl', 'verified')
      .get();

    const usersMap = new Map(usersSnap.docs.map(d => [d.id, d.data()]));

    const enrichedComments = comments.map(comment => ({
      ...comment,
      author: usersMap.get(comment.authorId),
    }));

    return {
      comments: enrichedComments,
      hasMore: snapshot.docs.length === limit,
      nextCursor: snapshot.docs.length === limit ? snapshot.docs[snapshot.docs.length - 1].id : null,
    };
  }
);

// ============================================================================
// SAVE/BOOKMARK OPERATIONS
// ============================================================================

/**
 * Save a post (bookmark)
 */
export const savePost = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { postId } = request.data;
    if (!postId) {
      throw new HttpsError('invalid-argument', 'postId is required');
    }

    // Check if post exists
    const postDoc = await db.collection('feedPosts').doc(postId).get();
    if (!postDoc.exists || postDoc.data()?.deleted) {
      throw new HttpsError('not-found', 'Post not found');
    }

    const saveId = `${postId}_${uid}`;
    const saveRef = db.collection('feedSaves').doc(saveId);

    // Check if already saved
    const existingSave = await saveRef.get();
    if (existingSave.exists) {
      return { success: true, alreadySaved: true };
    }

    // Create save
    await saveRef.set({
      postId,
      userId: uid,
      createdAt: serverTimestamp(),
    });

    // Update post stats
    await db.collection('feedPosts').doc(postId).update({
      'stats.saves': FieldValue.increment(1),
      updatedAt: serverTimestamp(),
    });

    logger.info(`User ${uid} saved post ${postId}`);

    return { success: true, alreadySaved: false };
  }
);

/**
 * Unsave a post (remove bookmark)
 */
export const unsavePost = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { postId } = request.data;
    if (!postId) {
      throw new HttpsError('invalid-argument', 'postId is required');
    }

    const saveId = `${postId}_${uid}`;
    const saveRef = db.collection('feedSaves').doc(saveId);

    // Check if save exists
    const existingSave = await saveRef.get();
    if (!existingSave.exists) {
      return { success: true, wasNotSaved: true };
    }

    // Delete save
    await saveRef.delete();

    // Update post stats
    await db.collection('feedPosts').doc(postId).update({
      'stats.saves': FieldValue.increment(-1),
      updatedAt: serverTimestamp(),
    });

    logger.info(`User ${uid} unsaved post ${postId}`);

    return { success: true, wasNotSaved: false };
  }
);

/**
 * Get user's saved posts
 */
export const getSavedPosts = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { limit = 50, cursor } = request.data;

    let query = db
      .collection('feedSaves')
      .where('userId', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    if (cursor) {
      const cursorDoc = await db.collection('feedSaves').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const saves = snapshot.docs.map(doc => doc.data());

    // Get post data
    const postIds = saves.map(s => s.postId);
    if (postIds.length === 0) {
      return { posts: [], hasMore: false };
    }

    const postsSnap = await db
      .collection('feedPosts')
      .where('__name__', 'in', postIds.slice(0, 10))
      .where('deleted', '==', false)
      .get();

    const posts = postsSnap.docs.map(doc => doc.data());

    return {
      posts,
      hasMore: snapshot.docs.length === limit,
      nextCursor: snapshot.docs.length === limit ? snapshot.docs[snapshot.docs.length - 1].id : null,
    };
  }
);

// ============================================================================
// VIEW TRACKING
// ============================================================================

/**
 * Track post view
 */
export const trackPostView = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { postId, durationMs, scrollDepth } = request.data;
    if (!postId) {
      throw new HttpsError('invalid-argument', 'postId is required');
    }

    // Log view (will be aggregated by scheduled function)
    const viewId = `${postId}_${uid}_${Date.now()}`;
    await db.collection('feedViews').doc(viewId).set({
      postId,
      userId: uid,
      timestamp: serverTimestamp(),
      durationMs: durationMs || 0,
      scrollDepth: scrollDepth || 0,
    });

    // Increment view count (optimistic, batched updates would be better for scale)
    await db.collection('feedPosts').doc(postId).update({
      'stats.views': FieldValue.increment(1),
    });

    return { success: true };
  }
);

// ============================================================================
// REPORTING
// ============================================================================

/**
 * Report content (post, comment, or user)
 */
export const reportContent = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const data = CreateReportSchema.parse(request.data);

    // Verify target exists
    if (data.targetType === 'post') {
      const postDoc = await db.collection('feedPosts').doc(data.targetId).get();
      if (!postDoc.exists) {
        throw new HttpsError('not-found', 'Post not found');
      }
    } else if (data.targetType === 'comment') {
      const commentDoc = await db.collection('feedComments').doc(data.targetId).get();
      if (!commentDoc.exists) {
        throw new HttpsError('not-found', 'Comment not found');
      }
    } else if (data.targetType === 'user') {
      const userDoc = await db.collection('users').doc(data.targetId).get();
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }
    }

    const reportId = generateId();
    const now = serverTimestamp();

    const report: FeedReport = {
      reportId,
      targetType: data.targetType,
      targetId: data.targetId,
      reporterId: uid,
      reason: data.reason,
      details: data.details,
      status: 'pending',
      createdAt: now as any,
      updatedAt: now as any,
    };

    await db.collection('feedReports').doc(reportId).set(report);

    // Increment reported count if it's a comment
    if (data.targetType === 'comment') {
      await db.collection('feedComments').doc(data.targetId).update({
        reportedCount: FieldValue.increment(1),
      });
    }

    // Create moderation case if serious reason
    if (['sexual_minor', 'violence', 'illegal'].includes(data.reason)) {
      // Queue for immediate review
      await db.collection('moderation_queue').add({
        reportId,
        targetType: data.targetType,
        targetId: data.targetId,
        reason: data.reason,
        priority: 'high',
        status: 'pending',
        createdAt: now,
      });
    }

    logger.info(`User ${uid} reported ${data.targetType} ${data.targetId} for ${data.reason}`);

    return { success: true, reportId };
  }
);