import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Content Safety and Reporting System
 * From PACK 292 - integrates with PACK 268 Risk Engine
 */

export type ReportReason =
  | 'illegal'
  | 'minor_suspicion'
  | 'explicit_sex'
  | 'hate'
  | 'spam'
  | 'harassment'
  | 'fake_profile'
  | 'other';

export type ContentType = 'POST' | 'STORY' | 'REEL' | 'COMMENT';

interface ReportContentRequest {
  targetType: ContentType;
  targetId: string;
  reason: ReportReason;
  details?: string;
}

/**
 * Report content for policy violations
 */
export const reportContent = functions.https.onCall(async (data: ReportContentRequest, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const reporterId = context.auth.uid;
  const { targetType, targetId, reason, details } = data;

  try {
    // Validate inputs
    if (!['POST', 'STORY', 'REEL', 'COMMENT'].includes(targetType)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid target type');
    }

    const validReasons: ReportReason[] = [
      'illegal',
      'minor_suspicion',
      'explicit_sex',
      'hate',
      'spam',
      'harassment',
      'fake_profile',
      'other'
    ];

    if (!validReasons.includes(reason)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid report reason');
    }

    // Get target content
    const collection = getCollectionForType(targetType);
    const contentDoc = await db.collection(collection).doc(targetId).get();

    if (!contentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Content not found');
    }

    const contentData = contentDoc.data();
    if (!contentData) {
      throw new functions.https.HttpsError('not-found', 'Content data not found');
    }

    const targetAuthorId = contentData.authorId;

    // Check if user already reported this content
    const existingReport = await db.collection('contentReports')
      .where('reporterId', '==', reporterId)
      .where('targetType', '==', targetType)
      .where('targetId', '==', targetId)
      .limit(1)
      .get();

    if (!existingReport.empty) {
      throw new functions.https.HttpsError(
        'already-exists',
        'You have already reported this content'
      );
    }

    // Create report
    const reportId = `${reporterId}_${targetType}_${targetId}_${Date.now()}`;
    const now = admin.firestore.Timestamp.now();

    await db.collection('contentReports').doc(reportId).set({
      reportId,
      reporterId,
      targetType,
      targetId,
      targetAuthorId,
      reason,
      details: details || '',
      createdAt: now,
      status: 'pending',
      priority: calculateReportPriority(reason)
    });

    // Update target content report count
    if (targetType === 'COMMENT') {
      await db.collection('feedComments').doc(targetId).update({
        reports: admin.firestore.FieldValue.increment(1)
      });
    }

    // Handle critical reports immediately
    if (isCriticalReport(reason)) {
      await handleCriticalReport(reportId, targetType, targetId, targetAuthorId, reason);
    }

    // Update Risk Engine (PACK 268)
    await updateRiskProfile(targetAuthorId, reason, targetType);

    // Check if content should be auto-removed
    await checkAutoModeration(targetType, targetId, targetAuthorId);

    return {
      success: true,
      reportId,
      message: 'Report submitted successfully. Our team will review it.'
    };

  } catch (error) {
    console.error('Error reporting content:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to submit report');
  }
});

/**
 * Get Firestore collection for content type
 */
function getCollectionForType(type: ContentType): string {
  switch (type) {
    case 'POST': return 'feedPosts';
    case 'STORY': return 'stories';
    case 'REEL': return 'reels';
    case 'COMMENT': return 'feedComments';
    default: return 'feedPosts';
  }
}

/**
 * Calculate report priority for moderation queue
 */
function calculateReportPriority(reason: ReportReason): number {
  switch (reason) {
    case 'illegal': return 100;
    case 'minor_suspicion': return 100;
    case 'explicit_sex': return 80;
    case 'hate': return 70;
    case 'harassment': return 60;
    case 'fake_profile': return 40;
    case 'spam': return 30;
    case 'other': return 20;
    default: return 10;
  }
}

/**
 * Check if report is critical (requires immediate action)
 */
function isCriticalReport(reason: ReportReason): boolean {
  return reason === 'illegal' || reason === 'minor_suspicion';
}

/**
 * Handle critical reports with immediate action
 */
async function handleCriticalReport(
  reportId: string,
  targetType: ContentType,
  targetId: string,
  authorId: string,
  reason: ReportReason
) {
  console.log(`CRITICAL REPORT: ${reason} for ${targetType}/${targetId} by user ${authorId}`);

  // For minor suspicion or illegal content, immediately soft-delete
  const collection = getCollectionForType(targetType);
  await db.collection(collection).doc(targetId).update({
    deleted: true,
    deletedReason: 'critical_report',
    deletedAt: admin.firestore.Timestamp.now()
  });

  // Update report status
  await db.collection('contentReports').doc(reportId).update({
    status: 'reviewing',
    autoActioned: true,
    actionTaken: 'content_removed',
    reviewedAt: admin.firestore.Timestamp.now()
  });

  // Shadow ban user temporarily
  await db.collection('users').doc(authorId).update({
    shadowBanned: true,
    shadowBanReason: `critical_report_${reason}`,
    shadowBannedAt: admin.firestore.Timestamp.now()
  });

  // Send alert to moderation team
  await sendModerationAlert({
    level: 'critical',
    reportId,
    targetType,
    targetId,
    authorId,
    reason,
    action: 'content_removed_user_shadow_banned'
  });
}

/**
 * Update user's risk profile in Risk Engine (PACK 268)
 */
async function updateRiskProfile(
  userId: string,
  reason: ReportReason,
  contentType: ContentType
) {
  const riskRef = db.collection('riskProfiles').doc(userId);
  const riskDoc = await riskRef.get();

  const riskIncrement = calculateRiskIncrement(reason);
  
  if (!riskDoc.exists) {
    // Create new risk profile
    await riskRef.set({
      userId,
      riskScore: riskIncrement,
      reports: {
        [reason]: 1
      },
      contentViolations: {
        [contentType]: 1
      },
      lastUpdated: admin.firestore.Timestamp.now(),
      createdAt: admin.firestore.Timestamp.now()
    });
  } else {
    // Update existing risk profile
    await riskRef.update({
      riskScore: admin.firestore.FieldValue.increment(riskIncrement),
      [`reports.${reason}`]: admin.firestore.FieldValue.increment(1),
      [`contentViolations.${contentType}`]: admin.firestore.FieldValue.increment(1),
      lastUpdated: admin.firestore.Timestamp.now()
    });
  }
}

/**
 * Calculate risk score increment based on report reason
 */
function calculateRiskIncrement(reason: ReportReason): number {
  switch (reason) {
    case 'illegal': return 50;
    case 'minor_suspicion': return 50;
    case 'explicit_sex': return 30;
    case 'hate': return 25;
    case 'harassment': return 20;
    case 'fake_profile': return 15;
    case 'spam': return 10;
    case 'other': return 5;
    default: return 5;
  }
}

/**
 * Check if content should be auto-moderated (removed/hidden)
 */
async function checkAutoModeration(
  targetType: ContentType,
  targetId: string,
  authorId: string
) {
  // Count total reports for this content
  const reportsSnapshot = await db.collection('contentReports')
    .where('targetType', '==', targetType)
    .where('targetId', '==', targetId)
    .where('status', '==', 'pending')
    .get();

  const reportCount = reportsSnapshot.size;

  // Auto-remove if threshold reached
  const REPORT_THRESHOLD = 5; // Remove after 5 reports

  if (reportCount >= REPORT_THRESHOLD) {
    const collection = getCollectionForType(targetType);
    
    // Soft delete content
    await db.collection(collection).doc(targetId).update({
      deleted: true,
      deletedReason: 'auto_moderation_threshold',
      deletedAt: admin.firestore.Timestamp.now()
    });

    // Update all reports
    const batch = db.batch();
    reportsSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: 'resolved',
        resolution: 'auto_removed',
        resolvedAt: admin.firestore.Timestamp.now()
      });
    });
    await batch.commit();

    // Increase risk score
    await updateRiskProfile(authorId, 'spam', targetType);

    console.log(`Auto-moderated ${targetType}/${targetId} after ${reportCount} reports`);
  }
}

/**
 * Send alert to moderation team
 */
async function sendModerationAlert(alert: any) {
  // In production, this would:
  // 1. Send to moderation dashboard
  // 2. Create Slack/Discord notification
  // 3. Email moderation team if critical
  // 4. Log to monitoring system
  
  console.log('MODERATION ALERT:', JSON.stringify(alert, null, 2));

  // Store in moderation queue
  await db.collection('moderationAlerts').add({
    ...alert,
    createdAt: admin.firestore.Timestamp.now(),
    acknowledged: false
  });
}

/**
 * Get moderation queue for moderators
 */
export const getModerationQueue = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Check if user is moderator
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();

  if (!userData?.isModerator && !userData?.isAdmin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only moderators can access moderation queue'
    );
  }

  const status = data.status || 'pending';
  const limit = Math.min(data.limit || 50, 100);

  try {
    // Get reports ordered by priority and creation time
    const reportsSnapshot = await db.collection('contentReports')
      .where('status', '==', status)
      .orderBy('priority', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const reports = await Promise.all(
      reportsSnapshot.docs.map(async doc => {
        const report = doc.data();
        
        // Fetch reporter info
        const reporterDoc = await db.collection('users').doc(report.reporterId).get();
        const reporterData = reporterDoc.data();

        // Fetch target author info
        const authorDoc = await db.collection('users').doc(report.targetAuthorId).get();
        const authorData = authorDoc.data();

        // Fetch content
        const collection = getCollectionForType(report.targetType);
        const contentDoc = await db.collection(collection).doc(report.targetId).get();
        const contentData = contentDoc.exists ? contentDoc.data() : null;

        return {
          ...report,
          reporter: {
            userId: report.reporterId,
            displayName: reporterData?.displayName
          },
          author: {
            userId: report.targetAuthorId,
            displayName: authorData?.displayName,
            riskScore: authorData?.riskScore || 0
          },
          content: contentData
        };
      })
    );

    return {
      reports,
      total: reports.length,
      hasMore: reports.length >= limit
    };

  } catch (error) {
    console.error('Error fetching moderation queue:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch moderation queue');
  }
});

/**
 * Resolve a content report (moderator action)
 */
export const resolveReport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Check if user is moderator
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();

  if (!userData?.isModerator && !userData?.isAdmin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only moderators can resolve reports'
    );
  }

  const { reportId, action, notes } = data;

  try {
    const reportDoc = await db.collection('contentReports').doc(reportId).get();
    if (!reportDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Report not found');
    }

    const report = reportDoc.data();
    if (!report) {
      throw new functions.https.HttpsError('not-found', 'Report data not found');
    }

    // Perform action
    switch (action) {
      case 'remove_content':
        await removeContent(report.targetType, report.targetId);
        break;
      case 'ban_user':
        await banUser(report.targetAuthorId, `Report ${reportId}: ${notes}`);
        break;
      case 'warn_user':
        await warnUser(report.targetAuthorId, notes);
        break;
      case 'dismiss':
        // No action needed
        break;
    }

    // Update report
    await reportDoc.ref.update({
      status: 'resolved',
      resolution: action,
      resolutionNotes: notes || '',
      resolvedBy: context.auth.uid,
      resolvedAt: admin.firestore.Timestamp.now()
    });

    return {
      success: true,
      message: `Report ${action} successfully`
    };

  } catch (error) {
    console.error('Error resolving report:', error);
    throw new functions.https.HttpsError('internal', 'Failed to resolve report');
  }
});

/**
 * Remove content (moderator action)
 */
async function removeContent(targetType: ContentType, targetId: string) {
  const collection = getCollectionForType(targetType);
  await db.collection(collection).doc(targetId).update({
    deleted: true,
    deletedReason: 'moderator_action',
    deletedAt: admin.firestore.Timestamp.now()
  });
}

/**
 * Ban user (moderator action)
 */
async function banUser(userId: string, reason: string) {
  await db.collection('users').doc(userId).update({
    banned: true,
    banReason: reason,
    bannedAt: admin.firestore.Timestamp.now()
  });

  // Disable Firebase Auth
  await admin.auth().updateUser(userId, { disabled: true });
}

/**
 * Warn user (moderator action)
 */
async function warnUser(userId: string, message: string) {
  await db.collection('userWarnings').add({
    userId,
    message,
    createdAt: admin.firestore.Timestamp.now(),
    acknowledged: false
  });
}