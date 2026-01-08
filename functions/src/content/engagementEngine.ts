import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Content Engagement Engine
 * Handles likes, comments, views, and shares
 * From PACK 292
 */

/**
 * Like a post or reel
 */
export const likeContent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;
  const { targetType, targetId } = data;

  if (!['POST', 'REEL'].includes(targetType)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid target type');
  }

  try {
    // Check if already liked
    const likeId = `${userId}_${targetType}_${targetId}`;
    const existingLike = await db.collection('feedLikes').doc(likeId).get();

    if (existingLike.exists) {
      throw new functions.https.HttpsError('already-exists', 'Already liked');
    }

    // Verify content exists
    const collection = targetType === 'POST' ? 'feedPosts' : 'reels';
    const contentDoc = await db.collection(collection).doc(targetId).get();

    if (!contentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Content not found');
    }

    const contentData = contentDoc.data();
    if (contentData?.deleted) {
      throw new functions.https.HttpsError('not-found', 'Content has been deleted');
    }

    // Create like
    await db.collection('feedLikes').doc(likeId).set({
      likeId,
      userId,
      targetType,
      targetId,
      createdAt: admin.firestore.Timestamp.now()
    });

    // Increment like count
    await db.collection(collection).doc(targetId).update({
      'stats.likes': admin.firestore.FieldValue.increment(1)
    });

    // Update daily stats for content author
    await updateCreatorDailyStats(contentData.authorId, 'like');

    return { success: true, liked: true };

  } catch (error) {
    console.error('Error liking content:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to like content');
  }
});

/**
 * Unlike a post or reel
 */
export const unlikeContent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;
  const { targetType, targetId } = data;

  if (!['POST', 'REEL'].includes(targetType)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid target type');
  }

  try {
    const likeId = `${userId}_${targetType}_${targetId}`;
    const likeDoc = await db.collection('feedLikes').doc(likeId).get();

    if (!likeDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Like not found');
    }

    // Delete like
    await likeDoc.ref.delete();

    // Decrement like count
    const collection = targetType === 'POST' ? 'feedPosts' : 'reels';
    await db.collection(collection).doc(targetId).update({
      'stats.likes': admin.firestore.FieldValue.increment(-1)
    });

    return { success: true, liked: false };

  } catch (error) {
    console.error('Error unliking content:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to unlike content');
  }
});

/**
 * Comment on a post or reel
 */
export const createComment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;
  const { targetType, targetId, text } = data;

  if (!['POST', 'REEL'].includes(targetType)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid target type');
  }

  if (!text || text.trim().length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Comment text is required');
  }

  if (text.length > 1000) {
    throw new functions.https.HttpsError('invalid-argument', 'Comment too long (max 1000 chars)');
  }

  try {
    // Verify content exists
    const collection = targetType === 'POST' ? 'feedPosts' : 'reels';
    const contentDoc = await db.collection(collection).doc(targetId).get();

    if (!contentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Content not found');
    }

    const contentData = contentDoc.data();
    if (contentData?.deleted) {
      throw new functions.https.HttpsError('not-found', 'Content has been deleted');
    }

    // Create comment
    const commentId = `${userId}_${targetType}_${targetId}_${Date.now()}`;
    const comment = {
      commentId,
      authorId: userId,
      targetType,
      targetId,
      text: text.trim(),
      createdAt: admin.firestore.Timestamp.now(),
      deleted: false,
      reports: 0
    };

    await db.collection('feedComments').doc(commentId).set(comment);

    // Increment comment count
    await db.collection(collection).doc(targetId).update({
      'stats.comments': admin.firestore.FieldValue.increment(1)
    });

    // Update daily stats for content author
    await updateCreatorDailyStats(contentData.authorId, 'comment');

    // Fetch user data for response
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    return {
      success: true,
      comment: {
        ...comment,
        author: {
          userId,
          displayName: userData?.displayName,
          photoURL: userData?.photoURL
        }
      }
    };

  } catch (error) {
    console.error('Error creating comment:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to create comment');
  }
});

/**
 * Get comments for content
 */
export const getComments = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { targetType, targetId, cursor, limit = 20 } = data;

  try {
    let query = db.collection('feedComments')
      .where('targetType', '==', targetType)
      .where('targetId', '==', targetId)
      .where('deleted', '==', false)
      .orderBy('createdAt', 'asc')
      .limit(Math.min(limit, 100));

    if (cursor) {
      const cursorDoc = await db.collection('feedComments').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const commentsSnapshot = await query.get();

    // Fetch author data for all comments
    const authorIds = [...new Set(commentsSnapshot.docs.map(doc => doc.data().authorId))];
    const authorsData: Record<string, any> = {};

    for (const authorId of authorIds) {
      const userDoc = await db.collection('users').doc(authorId).get();
      const userData = userDoc.data();
      authorsData[authorId] = {
        userId: authorId,
        displayName: userData?.displayName,
        photoURL: userData?.photoURL
      };
    }

    const comments = commentsSnapshot.docs.map(doc => ({
      ...doc.data(),
      author: authorsData[doc.data().authorId]
    }));

    const nextCursor = comments.length >= limit 
      ? comments[comments.length - 1].commentId 
      : null;

    return {
      comments,
      nextCursor,
      hasMore: comments.length >= limit
    };

  } catch (error) {
    console.error('Error getting comments:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get comments');
  }
});

/**
 * Delete a comment (author or moderator only)
 */
export const deleteComment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;
  const { commentId } = data;

  try {
    const commentDoc = await db.collection('feedComments').doc(commentId).get();

    if (!commentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Comment not found');
    }

    const comment = commentDoc.data();
    if (!comment) {
      throw new functions.https.HttpsError('not-found', 'Comment data not found');
    }

    // Check permissions
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const isModerator = userData?.isModerator || userData?.isAdmin;

    if (comment.authorId !== userId && !isModerator) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You can only delete your own comments'
      );
    }

    // Soft delete comment
    await commentDoc.ref.update({
      deleted: true,
      deletedAt: admin.firestore.Timestamp.now()
    });

    // Decrement comment count
    const collection = comment.targetType === 'POST' ? 'feedPosts' : 'reels';
    await db.collection(collection).doc(comment.targetId).update({
      'stats.comments': admin.firestore.FieldValue.increment(-1)
    });

    return { success: true };

  } catch (error) {
    console.error('Error deleting comment:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to delete comment');
  }
});

/**
 * Record a view (with sampling to reduce writes)
 */
export const recordView = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;
  const { targetType, targetId } = data;

  if (!['POST', 'STORY', 'REEL'].includes(targetType)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid target type');
  }

  try {
    // Sample views: only record every Nth view to reduce writes
    // For now, record all views for accuracy
    const viewId = `${userId}_${targetType}_${targetId}_${Date.now()}`;
    
    await db.collection('feedViews').doc(viewId).set({
      viewId,
      viewerId: userId,
      targetType,
      targetId,
      createdAt: admin.firestore.Timestamp.now()
    });

    // Increment view count
    const collection = targetType === 'POST' ? 'feedPosts' : 
                      targetType === 'STORY' ? 'stories' : 'reels';
    
    await db.collection(collection).doc(targetId).update({
      'stats.views': admin.firestore.FieldValue.increment(1)
    });

    // Update daily stats
    const contentDoc = await db.collection(collection).doc(targetId).get();
    const contentData = contentDoc.data();
    if (contentData) {
      await updateCreatorDailyStats(contentData.authorId, 'view');
    }

    return { success: true };

  } catch (error) {
    console.error('Error recording view:', error);
    // Don't throw error for views - fail silently
    return { success: false };
  }
});

/**
 * Track clicks to profile/chat (for CTA analytics)
 */
export const trackClick = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { targetType, targetId, clickType } = data;

  if (!['POST', 'STORY', 'REEL'].includes(targetType)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid target type');
  }

  if (!['profile', 'chat'].includes(clickType)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid click type');
  }

  try {
    const collection = targetType === 'POST' ? 'feedPosts' : 
                      targetType === 'STORY' ? 'stories' : 'reels';
    
    const field = clickType === 'profile' ? 'stats.clicksToProfile' : 'stats.clicksToChat';
    
    await db.collection(collection).doc(targetId).update({
      [field]: admin.firestore.FieldValue.increment(1)
    });

    // Update daily stats
    const contentDoc = await db.collection(collection).doc(targetId).get();
    const contentData = contentDoc.data();
    if (contentData) {
      const statField = clickType === 'profile' ? 'clicksToProfile' : 'clicksToChat';
      await updateCreatorDailyStats(contentData.authorId, statField);
    }

    return { success: true };

  } catch (error) {
    console.error('Error tracking click:', error);
    return { success: false };
  }
});

/**
 * Update creator daily stats
 */
async function updateCreatorDailyStats(authorId: string, action: string) {
  const today = new Date().toISOString().split('T')[0];
  const statsRef = db.collection('creatorDailyStats').doc(`${authorId}_${today}`);

  const increment = admin.firestore.FieldValue.increment(1);
  const updates: any = {
    userId: authorId,
    date: today,
    updatedAt: admin.firestore.Timestamp.now()
  };

  switch (action) {
    case 'view':
      updates.contentViews = increment;
      break;
    case 'like':
      updates.contentLikes = increment;
      break;
    case 'comment':
      updates.contentComments = increment;
      break;
    case 'share':
      updates.contentShares = increment;
      break;
    case 'clicksToProfile':
      updates.contentClicksToProfile = increment;
      break;
    case 'clicksToChat':
      updates.contentClicksToChat = increment;
      break;
  }

  await statsRef.set(updates, { merge: true });
}

/**
 * Get user's liked content
 */
export const getUserLikes = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = data.userId || context.auth.uid;
  const cursor = data.cursor || null;
  const limit = Math.min(data.limit || 20, 50);

  try {
    let query = db.collection('feedLikes')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    if (cursor) {
      const cursorDoc = await db.collection('feedLikes').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const likesSnapshot = await query.get();
    const likes = likesSnapshot.docs.map(doc => doc.data());

    return {
      likes,
      nextCursor: likes.length >= limit ? likes[likes.length - 1].likeId : null,
      hasMore: likes.length >= limit
    };

  } catch (error) {
    console.error('Error getting user likes:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get user likes');
  }
});