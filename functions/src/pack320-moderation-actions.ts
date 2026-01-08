/**
 * PACK 320 - Real-Time Moderation Dashboard
 * Admin Decision Enforcement Function
 * 
 * Processes moderation actions taken by admins/moderators
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type {
  ModerationAction,
  ModerationActionType,
  ProcessModerationActionRequest,
  ProcessModerationActionResponse
} from './pack320-moderation-types';
import { sendEmail, NotificationType } from './notifications';

const db = getFirestore();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verify admin/moderator role
 */
async function verifyModeratorRole(uid: string): Promise<boolean> {
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    
    if (!userData) return false;
    
    const role = userData.role || 'USER';
    return role === 'ADMIN' || role === 'MODERATOR';
  } catch (error: any) {
    logger.error('Failed to verify moderator role:', error);
    return false;
  }
}

/**
 * Get notification template for action
 */
function getNotificationTemplate(actionType: ModerationActionType, language: 'en' | 'pl'): {
  subject: string;
  body: string;
} {
  const templates = {
    WARNING: {
      en: {
        subject: 'Content Violation Warning',
        body: 'Your content violated our safety guidelines. Please review our rules to avoid further action.'
      },
      pl: {
        subject: 'Ostrzeżenie o naruszeniu zasad',
        body: 'Twoja treść naruszyła zasady bezpieczeństwa. Prosimy o zapoznanie się z regulaminem, aby uniknąć dalszych działań.'
      }
    },
    SUSPEND_24H: {
      en: {
        subject: 'Account Suspended - 24 Hours',
        body: 'Your account has been suspended for 24 hours due to safety violations. You will be able to access your account after this period.'
      },
      pl: {
        subject: 'Konto zawieszone - 24 godziny',
        body: 'Twoje konto zostało zawieszone na 24 godziny z powodu naruszenia zasad bezpieczeństwa. Będziesz mógł uzyskać dostęp do konta po tym okresie.'
      }
    },
    SUSPEND_72H: {
      en: {
        subject: 'Account Suspended - 72 Hours',
        body: 'Your account has been suspended for 72 hours due to serious safety violations. You will be able to access your account after this period.'
      },
      pl: {
        subject: 'Konto zawieszone - 72 godziny',
        body: 'Twoje konto zostało zawieszone na 72 godziny z powodu poważnych naruszeń zasad bezpieczeństwa. Będziesz mógł uzyskać dostęp do konta po tym okresie.'
      }
    },
    SUSPEND_7D: {
      en: {
        subject: 'Account Suspended - 7 Days',
        body: 'Your account has been suspended for 7 days due to severe safety violations. You will be able to access your account after this period.'
      },
      pl: {
        subject: 'Konto zawieszone - 7 dni',
        body: 'Twoje konto zostało zawieszone na 7 dni z powodu poważnych naruszeń zasad bezpieczeństwa. Będziesz mógł uzyskać dostęp do konta po tym okresie.'
      }
    },
    PERMANENT_BAN: {
      en: {
        subject: 'Account Permanently Banned',
        body: 'Your account has been permanently banned due to severe violations of our safety guidelines. This decision is final.'
      },
      pl: {
        subject: 'Konto trwale zablokowane',
        body: 'Twoje konto zostało trwale zablokowane z powodu poważnych naruszeń naszych zasad bezpieczeństwa. Ta decyzja jest ostateczna.'
      }
    },
    REQUIRE_REVERIFICATION: {
      en: {
        subject: 'Re-verification Required',
        body: 'For security reasons, you are required to verify your identity again. Please submit a new selfie verification.'
      },
      pl: {
        subject: 'Wymagana ponowna weryfikacja',
        body: 'Ze względów bezpieczeństwa musisz ponownie zweryfikować swoją tożsamość. Prześlij nowe zdjęcie weryfikacyjne.'
      }
    },
    REMOVE_CONTENT: {
      en: {
        subject: 'Content Removed',
        body: 'Your content has been removed as it violated our community guidelines.'
      },
      pl: {
        subject: 'Treść usunięta',
        body: 'Twoja treść została usunięta, ponieważ naruszyła nasze zasady społeczności.'
      }
    },
    LIMIT_VISIBILITY: {
      en: {
        subject: 'Profile Visibility Limited',
        body: 'Your profile visibility has been limited for 72 hours due to policy violations.'
      },
      pl: {
        subject: 'Widoczność profilu ograniczona',
        body: 'Widoczność Twojego profilu została ograniczona na 72 godziny z powodu naruszenia zasad.'
      }
    },
    DISMISS: {
      en: {
        subject: '',
        body: ''
      },
      pl: {
        subject: '',
        body: ''
      }
    }
  };

  return templates[actionType][language];
}

/**
 * Calculate suspension end time
 */
function getSuspensionEndTime(actionType: ModerationActionType): Timestamp | null {
  const now = new Date();
  
  switch (actionType) {
    case 'SUSPEND_24H':
      return Timestamp.fromDate(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    case 'SUSPEND_72H':
      return Timestamp.fromDate(new Date(now.getTime() + 72 * 60 * 60 * 1000));
    case 'SUSPEND_7D':
      return Timestamp.fromDate(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
    default:
      return null;
  }
}

// ============================================================================
// ACTION ENFORCEMENT
// ============================================================================

/**
 * Enforce content removal
 */
async function enforceContentRemoval(
  sourceRef: string,
  reason: string
): Promise<void> {
  try {
    // Parse source reference
    const parts = sourceRef.split('/');
    
    if (parts[0] === 'userPhotos') {
      // Remove photo
      await db.doc(sourceRef).update({
        status: 'removed',
        removedReason: reason,
        removedAt: FieldValue.serverTimestamp()
      });
    } else if (parts[0] === 'chats') {
      // Remove message
      await db.doc(sourceRef).update({
        deleted: true,
        deletedReason: reason,
        deletedAt: FieldValue.serverTimestamp()
      });
    }
    
    logger.info(`Content removed: ${sourceRef}`);
  } catch (error: any) {
    logger.error('Failed to enforce content removal:', error);
    throw error;
  }
}

/**
 * Enforce visibility limitation
 */
async function enforceVisibilityLimit(
  userId: string,
  durationHours: number = 72
): Promise<void> {
  try {
    const endTime = new Date(Date.now() + durationHours * 60 * 60 * 1000);
    
    await db.collection('users').doc(userId).update({
      visibilityLimited: true,
      visibilityLimitedUntil: Timestamp.fromDate(endTime),
      visibilityLimitedAt: FieldValue.serverTimestamp()
    });
    
    logger.info(`Visibility limited for user ${userId} until ${endTime}`);
  } catch (error: any) {
    logger.error('Failed to enforce visibility limit:', error);
    throw error;
  }
}

/**
 * Enforce suspension
 */
async function enforceSuspension(
  userId: string,
  actionType: ModerationActionType,
  reason: string
): Promise<void> {
  try {
    const suspendedUntil = getSuspensionEndTime(actionType);
    
    if (!suspendedUntil) {
      throw new Error('Invalid suspension action type');
    }
    
    await db.collection('users').doc(userId).update({
      status: 'SUSPENDED',
      suspendedUntil,
      suspendedReason: reason,
      suspendedAt: FieldValue.serverTimestamp()
    });
    
    logger.info(`User ${userId} suspended until ${suspendedUntil.toDate()}`);
  } catch (error: any) {
    logger.error('Failed to enforce suspension:', error);
    throw error;
  }
}

/**
 * Enforce permanent ban
 */
async function enforcePermanentBan(
  userId: string,
  reason: string
): Promise<void> {
  try {
    await db.collection('users').doc(userId).update({
      status: 'BANNED',
      bannedReason: reason,
      bannedAt: FieldValue.serverTimestamp()
    });
    
    logger.warn(`User ${userId} permanently banned: ${reason}`);
  } catch (error: any) {
    logger.error('Failed to enforce permanent ban:', error);
    throw error;
  }
}

/**
 * Enforce re-verification requirement
 */
async function enforceReverification(userId: string): Promise<void> {
  try {
    await db.collection('users').doc(userId).update({
      verificationStatus: 'PENDING',
      requiresReverification: true,
      reverificationRequiredAt: FieldValue.serverTimestamp()
    });
    
    logger.info(`Re-verification required for user ${userId}`);
  } catch (error: any) {
    logger.error('Failed to enforce re-verification:', error);
    throw error;
  }
}

// ============================================================================
// MAIN ENFORCEMENT FUNCTION
// ============================================================================

/**
 * Process moderation action
 * Validates moderator role, enforces action, logs audit event, sends notification
 */
export const processModerationAction = onCall(
  {
    region: 'europe-west3',
    enforceAppCheck: false // Allow admin tools
  },
  async (request): Promise<ProcessModerationActionResponse> => {
    const moderatorId = request.auth?.uid;
    
    if (!moderatorId) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    // Verify moderator role
    const isModerator = await verifyModeratorRole(moderatorId);
    if (!isModerator) {
      throw new HttpsError('permission-denied', 'Insufficient permissions');
    }

    const {
      queueItemId,
      actionType,
      reason,
      notes
    } = request.data as ProcessModerationActionRequest;

    if (!queueItemId || !actionType || !reason) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    try {
      // Get queue item
      const queueItemDoc = await db.collection('moderationQueue').doc(queueItemId).get();
      
      if (!queueItemDoc.exists) {
        throw new HttpsError('not-found', 'Moderation queue item not found');
      }

      const queueItem = queueItemDoc.data();
      const userId = queueItem?.userId;
      const sourceRef = queueItem?.sourceRef;

      if (!userId || !sourceRef) {
        throw new HttpsError('invalid-argument', 'Invalid queue item data');
      }

      // Enforce action based on type
      switch (actionType) {
        case 'DISMISS':
          // No enforcement needed, just update queue status
          break;

        case 'WARNING':
          // Send warning notification only
          break;

        case 'LIMIT_VISIBILITY':
          await enforceVisibilityLimit(userId);
          break;

        case 'SUSPEND_24H':
        case 'SUSPEND_72H':
        case 'SUSPEND_7D':
          await enforceSuspension(userId, actionType, reason);
          break;

        case 'PERMANENT_BAN':
          await enforcePermanentBan(userId, reason);
          break;

        case 'REMOVE_CONTENT':
          await enforceContentRemoval(sourceRef, reason);
          break;

        case 'REQUIRE_REVERIFICATION':
          await enforceReverification(userId);
          break;

        default:
          throw new HttpsError('invalid-argument', `Unknown action type: ${actionType}`);
      }

      // Create action audit log
      const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Get previous action count
      const previousActionsSnapshot = await db
        .collection('moderationActions')
        .where('userId', '==', userId)
        .get();
      
      const actionData: Omit<ModerationAction, 'actionId'> = {
        userId,
        moderatorId,
        actionType,
        reason,
        timestamp: Timestamp.now(),
        queueItemId,
        contentRef: sourceRef,
        previousActions: previousActionsSnapshot.size
      };

      await db.collection('moderationActions').doc(actionId).set({
        actionId,
        ...actionData
      });

      // Update queue item status
      await db.collection('moderationQueue').doc(queueItemId).update({
        status: actionType === 'DISMISS' ? 'DISMISSED' : 'ACTION_TAKEN',
        notes: notes || queueItem?.notes || '',
        lastUpdated: FieldValue.serverTimestamp()
      });

      // Send notification to user (if not dismissed)
      if (actionType !== 'DISMISS') {
        try {
          const userDoc = await db.collection('users').doc(userId).get();
          const userData = userDoc.data();
          
          if (userData?.email) {
            const language = userData.language || 'en';
            const template = getNotificationTemplate(actionType, language);
            
            if (template.subject) {
              await sendEmail(
                userId,
                userData.email,
                NotificationType.VERIFICATION_REQUIRED, // Use closest type
                {
                  subject: template.subject,
                  text: `${template.body}\n\nReason: ${reason}`,
                  html: `
                    <p>${template.body}</p>
                    <p><strong>Reason:</strong> ${reason}</p>
                  `
                }
              );
            }
          }
        } catch (notifError: any) {
          logger.error('Failed to send notification:', notifError);
          // Don't fail the entire action if notification fails
        }
      }

      // Update user moderation history
      await updateUserModerationHistory(userId, actionType);

      logger.info(`Moderation action processed: ${actionId} (${actionType} on ${userId})`);

      return {
        success: true,
        actionId
      };

    } catch (error: any) {
      logger.error('Failed to process moderation action:', error);
      
      return {
        success: false,
        actionId: '',
        error: error.message || 'Unknown error'
      };
    }
  }
);

/**
 * Update user moderation history
 */
async function updateUserModerationHistory(
  userId: string,
  actionType: ModerationActionType
): Promise<void> {
  try {
    const historyRef = db.collection('userModerationHistory').doc(userId);
    const historyDoc = await historyRef.get();

    if (!historyDoc.exists) {
      // Create new history
      await historyRef.set({
        userId,
        totalFlags: 1,
        totalActions: 1,
        warnings: actionType === 'WARNING' ? 1 : 0,
        suspensions: actionType.includes('SUSPEND') ? 1 : 0,
        bans: actionType === 'PERMANENT_BAN' ? 1 : 0,
        contentRemovals: actionType === 'REMOVE_CONTENT' ? 1 : 0,
        currentStatus: actionType === 'PERMANENT_BAN' ? 'BANNED' : 
                      actionType.includes('SUSPEND') ? 'SUSPENDED' : 'ACTIVE',
        lastActionAt: FieldValue.serverTimestamp(),
        lastActionType: actionType,
        trustScore: 70, // Default score
        trustLevel: 'MEDIUM',
        createdAt: FieldValue.serverTimestamp(),
        lastUpdated: FieldValue.serverTimestamp()
      });
    } else {
      // Update existing history
      const updates: any = {
        totalActions: FieldValue.increment(1),
        lastActionAt: FieldValue.serverTimestamp(),
        lastActionType: actionType,
        lastUpdated: FieldValue.serverTimestamp()
      };

      if (actionType === 'WARNING') {
        updates.warnings = FieldValue.increment(1);
        updates.trustScore = FieldValue.increment(-5);
      } else if (actionType.includes('SUSPEND')) {
        updates.suspensions = FieldValue.increment(1);
        updates.currentStatus = 'SUSPENDED';
        updates.trustScore = FieldValue.increment(-15);
      } else if (actionType === 'PERMANENT_BAN') {
        updates.bans = FieldValue.increment(1);
        updates.currentStatus = 'BANNED';
        updates.trustScore = 0;
        updates.trustLevel = 'LOW';
      } else if (actionType === 'REMOVE_CONTENT') {
        updates.contentRemovals = FieldValue.increment(1);
        updates.trustScore = FieldValue.increment(-10);
      }

      await historyRef.update(updates);
    }

    logger.info(`Updated moderation history for user ${userId}`);
  } catch (error: any) {
    logger.error('Failed to update user moderation history:', error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  processModerationAction
};