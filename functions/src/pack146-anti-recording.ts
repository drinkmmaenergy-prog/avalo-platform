/**
 * PACK 146 — Anti-Recording & Screenshot Detection
 * Client-side helper system for detecting screen captures
 * 
 * Features:
 * - Screenshot detection tracking
 * - Screen recording detection tracking
 * - Watermark strengthening
 * - Access freezing for repeat offenders
 */

import { db, serverTimestamp, generateId, increment } from './init';
import { logger, HttpsError, onCall } from './common';
import { 
  ScreenCaptureEvent,
  ScreenCaptureType,
  ScreenCaptureAction 
} from './pack146-types';
import { strengthenWatermark } from './pack146-watermarking';
import { addToPiracyWatchlist } from './pack146-piracy-watchlist';

// ============================================================================
// SCREEN CAPTURE DETECTION
// ============================================================================

/**
 * Report screen capture event
 * Called from client when screenshot or recording detected
 */
export const reportScreenCapture = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const {
      contentId,
      captureType,
      deviceId,
      sessionId,
    } = request.data;
    
    if (!contentId || !captureType) {
      throw new HttpsError('invalid-argument', 'Content ID and capture type required');
    }
    
    try {
      // Get content details
      const contentDoc = await db.collection('media').doc(contentId).get();
      if (!contentDoc.exists) {
        throw new HttpsError('not-found', 'Content not found');
      }
      
      const content = contentDoc.data();
      const contentOwnerId = content?.userId;
      const isPaidContent = content?.accessType === 'PAID';
      
      // Check user's previous capture count
      const previousCaptureCount = await getPreviousCaptureCount(uid, contentOwnerId);
      const isRepeatOffender = previousCaptureCount >= 2;
      
      // Determine action based on attempt count
      const action = determineScreenCaptureAction(
        captureType,
        previousCaptureCount,
        isPaidContent
      );
      
      // Log the event
      const eventId = generateId();
      const event: any = {
        eventId,
        userId: uid,
        contentId,
        contentOwnerId,
        captureType,
        detectedAt: serverTimestamp(),
        deviceId: deviceId || 'unknown',
        sessionId: sessionId || 'unknown',
        contentType: isPaidContent ? 'PAID_CONTENT' : 'FREE_CONTENT',
        isPaidContent,
        actionTaken: action,
        warningShown: action !== 'ALLOW',
        accessRestricted: action === 'FREEZE_ACCESS',
        previousCaptureCount,
        isRepeatOffender,
        reportedToCreator: true,
        addedToPiracyWatchlist: isRepeatOffender,
      };
      
      await db.collection('screen_capture_events').doc(eventId).set(event);
      
      // Apply action
      const response = await applyScreenCaptureAction(
        uid,
        contentId,
        contentOwnerId,
        action,
        captureType,
        isPaidContent
      );
      
      logger.warn(`Screen capture detected: ${uid} on ${contentId} (${captureType}) - Action: ${action}`);
      
      return response;
    } catch (error: any) {
      logger.error('Screen capture report failed:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Get previous capture count for user
 */
async function getPreviousCaptureCount(
  userId: string,
  contentOwnerId: string
): Promise<number> {
  
  const snapshot = await db.collection('screen_capture_events')
    .where('userId', '==', userId)
    .where('contentOwnerId', '==', contentOwnerId)
    .count()
    .get();
  
  return snapshot.data().count;
}

/**
 * Determine action based on capture attempt
 */
function determineScreenCaptureAction(
  captureType: ScreenCaptureType,
  previousCount: number,
  isPaidContent: boolean
): ScreenCaptureAction {
  
  // Stricter enforcement for paid content
  if (isPaidContent) {
    if (previousCount === 0) {
      return 'STRENGTHEN_WATERMARK';
    } else if (previousCount === 1) {
      return 'SHOW_WARNING';
    } else if (previousCount === 2) {
      return captureType === 'SCREEN_RECORDING' ? 'BLACK_SCREEN' : 'SHOW_WARNING';
    } else {
      return 'FREEZE_ACCESS';
    }
  } else {
    // More lenient for free content
    if (previousCount === 0) {
      return 'LOG_INCIDENT';
    } else if (previousCount >= 1 && previousCount < 3) {
      return 'STRENGTHEN_WATERMARK';
    } else if (previousCount >= 3) {
      return 'SHOW_WARNING';
    } else {
      return 'LOG_INCIDENT';
    }
  }
}

/**
 * Apply screen capture action
 */
async function applyScreenCaptureAction(
  userId: string,
  contentId: string,
  contentOwnerId: string,
  action: ScreenCaptureAction,
  captureType: ScreenCaptureType,
  isPaidContent: boolean
): Promise<{
  success: boolean;
  action: ScreenCaptureAction;
  warning?: string;
  accessFrozen?: boolean;
  watermarkStrengthened?: boolean;
}> {
  
  const response: any = {
    success: true,
    action,
  };
  
  switch (action) {
    case 'ALLOW':
      // No action needed
      break;
    
    case 'LOG_INCIDENT':
      // Already logged
      break;
    
    case 'STRENGTHEN_WATERMARK':
      // Strengthen watermark for this content
      const watermarkSnapshot = await db.collection('watermark_registry')
        .where('contentId', '==', contentId)
        .limit(1)
        .get();
      
      if (!watermarkSnapshot.empty) {
        await strengthenWatermark(watermarkSnapshot.docs[0].id);
        response.watermarkStrengthened = true;
      }
      break;
    
    case 'SHOW_WARNING':
      response.warning = 'Screenshot detection: Repeated attempts will result in access restrictions.';
      break;
    
    case 'BLACK_SCREEN':
      response.warning = 'Screen recording detected. Content has been blocked.';
      response.accessRestricted = true;
      break;
    
    case 'FREEZE_ACCESS':
      // Freeze user's access to this creator's paid content
      await freezeUserAccess(userId, contentOwnerId);
      response.warning = 'Your access has been frozen due to repeated screen capture attempts.';
      response.accessFrozen = true;
      
      // Add to piracy watchlist
      await addToPiracyWatchlist(userId, {
        type: captureType === 'SCREENSHOT' ? 'SCREENSHOT_THEFT' : 'SCREEN_RECORDING',
        severity: 'HIGH',
        contentId,
        originalOwnerId: contentOwnerId,
        isNSFW: false,
        evidence: [`Screen capture attempts on ${contentId}`],
      });
      break;
  }
  
  // Notify content owner
  if (action !== 'ALLOW' && action !== 'LOG_INCIDENT') {
    await notifyContentOwner(contentOwnerId, {
      userId,
      contentId,
      captureType,
      action,
    });
  }
  
  return response;
}

/**
 * Freeze user access to creator's content
 */
async function freezeUserAccess(
  userId: string,
  creatorId: string
): Promise<void> {
  
  const freezeId = generateId();
  
  await db.collection('access_freezes').doc(freezeId).set({
    freezeId,
    userId,
    creatorId,
    reason: 'REPEATED_SCREEN_CAPTURE',
    frozenAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    canAppeal: true,
    appealDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });
  
  // Revoke all unlocks for this creator
  const unlocks = await db.collection('media_unlocks')
    .where('userId', '==', userId)
    .where('creatorId', '==', creatorId)
    .get();
  
  const batch = db.batch();
  unlocks.docs.forEach(doc => {
    batch.update(doc.ref, {
      accessRevoked: true,
      revokedAt: serverTimestamp(),
      revokeReason: 'SCREEN_CAPTURE_VIOLATION',
    });
  });
  
  await batch.commit();
  
  logger.warn(`Access frozen for user ${userId} to creator ${creatorId}`);
}

/**
 * Notify content owner of screen capture attempt
 */
async function notifyContentOwner(
  ownerId: string,
  details: {
    userId: string;
    contentId: string;
    captureType: ScreenCaptureType;
    action: ScreenCaptureAction;
  }
): Promise<void> {
  
  await db.collection('notifications').doc(generateId()).set({
    userId: ownerId,
    type: 'SCREEN_CAPTURE_DETECTED',
    title: 'Screen Capture Detected',
    message: `Someone attempted to capture your protected content.`,
    metadata: {
      captureType: details.captureType,
      contentId: details.contentId,
      actionTaken: details.action,
    },
    read: false,
    createdAt: serverTimestamp(),
  });
}

// ============================================================================
// ACCESS CHECKING
// ============================================================================

/**
 * Check if user's access is frozen
 */
export const checkAccessFreeze = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const { creatorId } = request.data;
    
    if (!creatorId) {
      throw new HttpsError('invalid-argument', 'Creator ID required');
    }
    
    try {
      const freezes = await db.collection('access_freezes')
        .where('userId', '==', uid)
        .where('creatorId', '==', creatorId)
        .where('expiresAt', '>', new Date())
        .limit(1)
        .get();
      
      if (freezes.empty) {
        return {
          isFrozen: false,
        };
      }
      
      const freeze = freezes.docs[0].data();
      
      return {
        isFrozen: true,
        reason: freeze.reason,
        frozenAt: freeze.frozenAt,
        expiresAt: freeze.expiresAt,
        canAppeal: freeze.canAppeal,
        appealDeadline: freeze.appealDeadline,
      };
    } catch (error: any) {
      logger.error('Access freeze check failed:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get creator's screen capture statistics
 */
export const getScreenCaptureStats = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    try {
      // Get all events for this creator's content
      const eventsSnapshot = await db.collection('screen_capture_events')
        .where('contentOwnerId', '==', uid)
        .get();
      
      const stats = {
        totalAttempts: eventsSnapshot.size,
        screenshots: 0,
        recordings: 0,
        uniqueUsers: new Set(),
        repeatOffenders: 0,
        accessesFrozen: 0,
        byContent: {} as Record<string, number>,
      };
      
      eventsSnapshot.docs.forEach(doc => {
        const event = doc.data() as ScreenCaptureEvent;
        
        if (event.captureType === 'SCREENSHOT') {
          stats.screenshots++;
        } else if (event.captureType === 'SCREEN_RECORDING') {
          stats.recordings++;
        }
        
        stats.uniqueUsers.add(event.userId);
        
        if (event.isRepeatOffender) {
          stats.repeatOffenders++;
        }
        
        if (event.accessRestricted) {
          stats.accessesFrozen++;
        }
        
        stats.byContent[event.contentId] = (stats.byContent[event.contentId] || 0) + 1;
      });
      
      return {
        totalAttempts: stats.totalAttempts,
        screenshots: stats.screenshots,
        recordings: stats.recordings,
        uniqueUsers: stats.uniqueUsers.size,
        repeatOffenders: stats.repeatOffenders,
        accessesFrozen: stats.accessesFrozen,
        topTargetedContent: Object.entries(stats.byContent)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([contentId, count]) => ({ contentId, attempts: count })),
      };
    } catch (error: any) {
      logger.error('Screen capture stats failed:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  reportScreenCapture,
  checkAccessFreeze,
  getScreenCaptureStats,
};