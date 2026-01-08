/**
 * PACK 72 — AI-Driven Auto-Moderation V2 + Sensitive Media Classification
 * Cloud Functions for Content Moderation
 */

import * as functions from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  moderateContent,
  getModerationStatus,
  updateModerationDecision,
} from './aiModerationEngine';
import {
  ModerationContext,
  ModeratedContentType,
  AdminReviewRequest,
  ModerationQueueItem,
} from '../../shared/types/contentModeration';
import { logEvent } from './observability';

const db = getFirestore();

/**
 * Callable function: Moderate content
 * Called after content upload to classify and make decision
 */
export const moderateContentFunction = functions.https.onCall(async (data, context) => {
  try {
    // Authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to moderate content'
      );
    }

    const userId = context.auth.uid;
    const {
      contentId,
      mediaUrl,
      contentType,
      associatedId,
      metadata,
    } = data;

    // Validate required fields
    if (!contentId || !mediaUrl || !contentType) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields: contentId, mediaUrl, contentType'
      );
    }

    // Get user's adult verification status
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const isAdultVerified = userData?.verification?.ageVerified === true || false;

    // Build moderation context
    const moderationContext: ModerationContext = {
      contentType: contentType as ModeratedContentType,
      userId,
      isAdultVerified,
      associatedId,
      metadata,
    };

    // Run moderation
    const result = await moderateContent(
      contentId,
      userId,
      mediaUrl,
      moderationContext
    );

    return {
      success: true,
      decision: result.decision,
      reason: result.reason,
      confidence: result.confidence,
    };
  } catch (error) {
    await logEvent({
      level: 'ERROR',
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'CONTENT_SAFETY',
      message: 'Content moderation function failed',
      details: {
        extra: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      },
    });

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      'An error occurred during content moderation'
    );
  }
});

/**
 * Callable function: Get moderation status
 * Check if content has been moderated and its status
 */
export const getModerationStatusFunction = functions.https.onCall(async (data, context) => {
  try {
    // Authentication required
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
        'Missing required field: contentId'
      );
    }

    const status = await getModerationStatus(contentId);

    if (!status) {
      return {
        success: true,
        status: null,
      };
    }

    return {
      success: true,
      status: {
        decision: status.decision,
        reason: status.reason,
        createdAt: status.createdAt,
      },
    };
  } catch (error) {
    throw new functions.https.HttpsError(
      'internal',
      'Failed to get moderation status'
    );
  }
});

/**
 * HTTP function: Get moderation queue for admin
 * Returns pending content requiring manual review
 */
export const getModerationQueue = functions.https.onRequest(async (req, res) => {
  try {
    // Verify admin authentication (simple token-based for now)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Verify admin token (integrate with admin authentication)
    // For now, we'll check if user has admin role
    const adminAuth = await import('firebase-admin/auth');
    const auth = adminAuth.getAuth();
    
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    // Check if user is admin
    const adminDoc = await db.collection('users').doc(decodedToken.uid).get();
    const adminData = adminDoc.data();
    
    if (!adminData?.role || adminData.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden: Admin access required' });
      return;
    }

    // Get limit from query params
    const limit = parseInt(req.query.limit as string) || 50;

    // Query for content requiring review
    const queueQuery = await db
      .collection('content_moderation')
      .where('decision', '==', 'REVIEW_REQUIRED')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const queueItems: ModerationQueueItem[] = [];

    for (const doc of queueQuery.docs) {
      const data = doc.data();
      
      // Determine priority based on labels
      let priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
      if (data.labels.minorPresence > 0.05 || data.labels.illegal > 0.3) {
        priority = 'HIGH';
      } else if (data.labels.violence > 0.5 || data.labels.hateful > 0.5) {
        priority = 'MEDIUM';
      } else {
        priority = 'LOW';
      }

      queueItems.push({
        contentId: data.contentId,
        userId: data.userId,
        mediaUrl: data.mediaUrl,
        contentType: data.contentType || 'POST_MEDIA',
        labels: data.labels,
        uploadedAt: data.createdAt,
        priority,
      });
    }

    // Sort by priority (HIGH first)
    queueItems.sort((a, b) => {
      const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    res.status(200).json({
      success: true,
      queue: queueItems,
      total: queueItems.length,
    });
  } catch (error) {
    await logEvent({
      level: 'ERROR',
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'ADMIN_QUEUE',
      message: 'Failed to get moderation queue',
      details: {
        extra: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      },
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get moderation queue',
    });
  }
});

/**
 * HTTP function: Admin moderation decision
 * Allows admin to approve or block content
 */
export const adminModerationDecision = functions.https.onRequest(async (req, res) => {
  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Verify admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    
    const adminAuth = await import('firebase-admin/auth');
    const auth = adminAuth.getAuth();
    
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    // Check if user is admin
    const adminDoc = await db.collection('users').doc(decodedToken.uid).get();
    const adminData = adminDoc.data();
    
    if (!adminData?.role || adminData.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden: Admin access required' });
      return;
    }

    const adminId = decodedToken.uid;
    const reviewRequest: AdminReviewRequest = req.body;

    // Validate request
    if (!reviewRequest.contentId || !reviewRequest.decision) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: contentId, decision',
      });
      return;
    }

    if (reviewRequest.decision !== 'ALLOW' && reviewRequest.decision !== 'AUTO_BLOCK') {
      res.status(400).json({
        success: false,
        error: 'Invalid decision. Must be ALLOW or AUTO_BLOCK',
      });
      return;
    }

    // Update moderation decision
    await updateModerationDecision(
      reviewRequest.contentId,
      reviewRequest.decision,
      reviewRequest.reason || `Manually reviewed by admin`,
      adminId
    );

    res.status(200).json({
      success: true,
      message: 'Moderation decision updated',
    });
  } catch (error) {
    await logEvent({
      level: 'ERROR',
      source: 'BACKEND',
      service: 'functions.moderation',
      module: 'ADMIN_DECISION',
      message: 'Failed to process admin decision',
      details: {
        extra: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      },
    });

    res.status(500).json({
      success: false,
      error: 'Failed to process moderation decision',
    });
  }
});

/**
 * Background function: Auto-cleanup old moderation records
 * Runs daily to remove old ALLOW records (keep blocks indefinitely)
 */
export const cleanupOldModerationRecords = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Delete old ALLOW records (keep blocks for audit)
      const oldRecordsQuery = await db
        .collection('content_moderation')
        .where('decision', '==', 'ALLOW')
        .where('createdAt', '<', thirtyDaysAgo)
        .limit(500)
        .get();

      const batch = db.batch();
      let deleteCount = 0;

      oldRecordsQuery.docs.forEach(doc => {
        batch.delete(doc.ref);
        deleteCount++;
      });

      if (deleteCount > 0) {
        await batch.commit();
      }

      await logEvent({
        level: 'INFO',
        source: 'BACKEND',
        service: 'functions.moderation',
        module: 'CLEANUP',
        message: `Cleaned up ${deleteCount} old moderation records`,
      });

      return { success: true, deletedCount: deleteCount };
    } catch (error) {
      await logEvent({
        level: 'ERROR',
        source: 'BACKEND',
        service: 'functions.moderation',
        module: 'CLEANUP',
        message: 'Failed to cleanup old moderation records',
        details: {
          extra: {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        },
      });

      throw error;
    }
  });

/**
 * Background function: Generate moderation statistics
 * Runs hourly to compute stats for monitoring
 */
export const generateModerationStats = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    try {
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      // Query recent moderation records
      const recentRecords = await db
        .collection('content_moderation')
        .where('createdAt', '>', oneHourAgo)
        .get();

      let allowed = 0;
      let restricted = 0;
      let autoBlocked = 0;
      let reviewRequired = 0;
      let totalConfidence = 0;

      recentRecords.docs.forEach(doc => {
        const data = doc.data();
        
        switch (data.decision) {
          case 'ALLOW':
            allowed++;
            break;
          case 'RESTRICT':
            restricted++;
            break;
          case 'AUTO_BLOCK':
            autoBlocked++;
            break;
          case 'REVIEW_REQUIRED':
            reviewRequired++;
            break;
        }

        // Calculate average confidence from labels
        const labelValues = Object.values(data.labels).filter((val): val is number => typeof val === 'number');
        const avgLabelScore = labelValues.length > 0
          ? labelValues.reduce((sum, val) => sum + val, 0) / labelValues.length
          : 0;
        
        totalConfidence += avgLabelScore;
      });

      const total = recentRecords.size;
      const averageConfidence = total > 0 ? totalConfidence / total : 0;

      // Store stats
      await db.collection('moderation_stats').add({
        totalProcessed: total,
        allowed,
        restricted,
        autoBlocked,
        reviewRequired,
        averageConfidence,
        timestamp: FieldValue.serverTimestamp(),
      });

      await logEvent({
        level: 'INFO',
        source: 'BACKEND',
        service: 'functions.moderation',
        module: 'STATS',
        message: `Generated moderation stats: ${total} processed in last hour`,
        details: {
          extra: {
            allowed,
            restricted,
            autoBlocked,
            reviewRequired,
            averageConfidence,
          },
        },
      });

      return { success: true };
    } catch (error) {
      await logEvent({
        level: 'ERROR',
        source: 'BACKEND',
        service: 'functions.moderation',
        module: 'STATS',
        message: 'Failed to generate moderation statistics',
        details: {
          extra: {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        },
      });

      throw error;
    }
  });
