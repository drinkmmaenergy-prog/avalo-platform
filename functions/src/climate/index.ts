import * as functions from 'firebase-functions';
import { db } from '../init';
import { 
  detectConflictTrend,
  blockPoliticalRecruitment,
  blockReligiousWarfare,
  applyToxicTrendJammer,
  resolveConflictContentCase,
  analyzeCommentClimate,
  getContentClimateScore,
  isContentAllowedInFeed
} from './conflictDetection';
import { aiModerator } from './aiModeration';
import { CultureSafetyProfile } from './types';

export const onContentCreated = functions.firestore
  .document('posts/{postId}')
  .onCreate(async (snap, context) => {
    const postData = snap.data();
    const postId = context.params.postId;
    
    if (!postData.text) return;
    
    try {
      await detectConflictTrend(
        postId,
        postData.text,
        postData.hashtags || [],
        postData.userId
      );
    } catch (error) {
      console.error('Error detecting conflict trend:', error);
    }
  });

export const onCommentCreated = functions.firestore
  .document('posts/{postId}/comments/{commentId}')
  .onCreate(async (snap, context) => {
    const commentData = snap.data();
    const postId = context.params.postId;
    
    if (!commentData.text) return;
    
    try {
      const analysis = await aiModerator.analyzeContent({
        text: commentData.text
      });
      
      if (analysis.isConflict && analysis.severity === 'critical') {
        await snap.ref.update({
          flagged: true,
          flagReason: 'conflict_content',
          visibility: 'hidden'
        });
      }
      
      const commentsSnapshot = await db
        .collection('posts')
        .doc(postId)
        .collection('comments')
        .limit(50)
        .get();
      
      const comments = commentsSnapshot.docs.map(doc => ({
        text: doc.data().text,
        userId: doc.data().userId
      }));
      
      await analyzeCommentClimate(postId, comments);
    } catch (error) {
      console.error('Error analyzing comment:', error);
    }
  });

export const monitorTrendVelocity = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    try {
      const trendsSnapshot = await db
        .collection('conflict_trends')
        .where('status', 'in', ['monitoring', 'downranked'])
        .get();
      
      for (const trendDoc of trendsSnapshot.docs) {
        const trend = trendDoc.data();
        
        if (trend.velocity > 20) {
          await applyToxicTrendJammer(trendDoc.id);
        }
      }
    } catch (error) {
      console.error('Error monitoring trend velocity:', error);
    }
  });

export const createUserSafetyProfile = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }
    
    const userId = context.auth.uid;
    
    const defaultProfile: Omit<CultureSafetyProfile, 'userId'> = {
      filters: {
        hidePolitical: true,
        hideReligious: true,
        hideDebateThreads: true,
        hideProvocativeHashtags: true,
        hideConflictComments: true
      },
      preferences: {
        allowPeacefulBeliefExpression: false,
        allowedCreators: []
      },
      updatedAt: new Date()
    };
    
    await db.collection('culture_safety_profiles').doc(userId).set({
      userId,
      ...defaultProfile
    });
    
    return { success: true };
  }
);

export const updateUserSafetyProfile = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }
    
    const userId = context.auth.uid;
    const { filters, preferences } = data;
    
    await db.collection('culture_safety_profiles').doc(userId).update({
      ...(filters && { filters }),
      ...(preferences && { preferences }),
      updatedAt: new Date()
    });
    
    return { success: true };
  }
);

export const getUserSafetyProfile = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }
    
    const userId = context.auth.uid;
    const profileDoc = await db.collection('culture_safety_profiles').doc(userId).get();
    
    if (!profileDoc.exists) {
      return null;
    }
    
    return profileDoc.data();
  }
);

export const reportConflictContent = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }
    
    const { contentId, contentType, reportType, description } = data;
    
    if (!contentId || !contentType || !reportType) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields'
      );
    }
    
    await db.collection('climate_reports').add({
      reporterId: context.auth.uid,
      contentId,
      contentType,
      reportType,
      description: description || '',
      status: 'pending',
      priority: 'medium',
      timestamp: new Date()
    });
    
    return { success: true };
  }
);

export const appealContentDecision = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }
    
    const { contentId, caseId, reason, evidence } = data;
    
    if (!contentId || !caseId || !reason) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields'
      );
    }
    
    const caseDoc = await db.collection('conflict_content_cases').doc(caseId).get();
    
    if (!caseDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Case not found'
      );
    }
    
    const caseData = caseDoc.data();
    
    if (caseData?.userId !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Not authorized to appeal this case'
      );
    }
    
    if (!caseData?.appealable) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'This case is not appealable'
      );
    }
    
    await db.collection('climate_appeals').add({
      creatorId: context.auth.uid,
      contentId,
      caseId,
      reason,
      evidence: evidence || '',
      status: 'pending',
      timestamp: new Date()
    });
    
    return { success: true };
  }
);

export const getPositiveContentRedirects = functions.https.onCall(
  async (data, context) => {
    const { category } = data;
    
    const redirectsSnapshot = await db
      .collection('positive_redirects')
      .where('active', '==', true)
      .where('category', '==', category || 'lifestyle')
      .orderBy('priority', 'desc')
      .limit(10)
      .get();
    
    return redirectsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  }
);

export const checkContentAllowedInFeed = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }
    
    const { contentId } = data;
    
    if (!contentId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Content ID required'
      );
    }
    
    const allowed = await isContentAllowedInFeed(contentId, context.auth.uid);
    
    return { allowed };
  }
);

export const getClimateStatistics = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }
    
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const role = userDoc.data()?.role;
    
    if (role !== 'admin' && role !== 'moderator') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Insufficient permissions'
      );
    }
    
    const [
      activeTrends,
      pendingCases,
      pendingReports,
      pendingAppeals
    ] = await Promise.all([
      db.collection('conflict_trends')
        .where('status', '!=', 'resolved')
        .count()
        .get(),
      db.collection('conflict_content_cases')
        .where('status', '==', 'pending')
        .count()
        .get(),
      db.collection('climate_reports')
        .where('status', '==', 'pending')
        .count()
        .get(),
      db.collection('climate_appeals')
        .where('status', '==', 'pending')
        .count()
        .get()
    ]);
    
    return {
      activeTrends: activeTrends.data().count,
      pendingCases: pendingCases.data().count,
      pendingReports: pendingReports.data().count,
      pendingAppeals: pendingAppeals.data().count
    };
  }
);