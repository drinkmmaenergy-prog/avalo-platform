/**
 * PACK 198 — Dating Funnel Engine
 * 
 * Avalo Dating Funnel: Attention → Flirt → Chemistry → Meeting
 * 
 * This module manages the complete romantic conversion flow through four phases,
 * integrating with chat monetization, call monetization, and safety systems.
 */

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type FunnelPhase = 'ATTENTION' | 'FLIRT' | 'CONNECTION' | 'MEETING';
export type AttractionActionType = 'follow' | 'like' | 'wink' | 'superlike';
export type FlirtSessionStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CLOSED';
export type ConnectionStatus = 'MESSAGING' | 'VOICE_CALL' | 'VIDEO_CALL' | 'SCHEDULED';
export type MeetingStatus = 'SCHEDULED' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'COMPLETED' | 'CANCELLED';
export type SexyModeStatus = 'DISABLED' | 'REQUESTED' | 'ENABLED';

export interface FunnelProgress {
  userId: string;
  currentPhase: FunnelPhase;
  phases: {
    attention: {
      completed: boolean;
      actionsGiven: number;
      actionsReceived: number;
      matchesCreated: number;
    };
    flirt: {
      completed: boolean;
      sessionsStarted: number;
      complimentsSent: number;
      complimentsReceived: number;
      sexyModeEnabled: boolean;
    };
    connection: {
      completed: boolean;
      voiceCallsCompleted: number;
      videoCallsCompleted: number;
      eventsScheduled: number;
    };
    meeting: {
      completed: boolean;
      meetingsScheduled: number;
      meetingsVerified: number;
      meetingsCompleted: number;
    };
  };
  totalSpent: number;
  totalEarned: number;
  emotionalScore: number; // 0-100
  retentionDays: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AttractionAction {
  actionId: string;
  fromUserId: string;
  toUserId: string;
  actionType: AttractionActionType;
  photoId?: string;
  profileSection?: string;
  timestamp: Timestamp;
  cost?: number;
}

export interface FlirtSession {
  sessionId: string;
  user1Id: string;
  user2Id: string;
  status: FlirtSessionStatus;
  sexyMode: SexyModeStatus;
  complimentsExchanged: number;
  chemistryBoostActive: boolean;
  emotionalAcceleration: number;
  messageCount: number;
  lastActivityAt: Timestamp;
  createdAt: Timestamp;
}

export interface ComplimentData {
  complimentId: string;
  senderId: string;
  recipientId: string;
  sessionId: string;
  type: 'appearance' | 'personality' | 'style' | 'vibe' | 'custom';
  message: string;
  cost: number;
  timestamp: Timestamp;
}

export interface ConnectionSession {
  sessionId: string;
  user1Id: string;
  user2Id: string;
  phase: FunnelPhase;
  currentActivity: ConnectionStatus;
  emotionalScore: number;
  callsCompleted: number;
  eventsScheduled: number;
  nextMilestone: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MeetingVerification {
  verificationId: string;
  meetingId: string;
  user1Id: string;
  user2Id: string;
  qrCode: string;
  status: MeetingStatus;
  user1Verified: boolean;
  user2Verified: boolean;
  user1VerifiedAt?: Timestamp;
  user2VerifiedAt?: Timestamp;
  user1SelfieUrl?: string;
  user2SelfieUrl?: string;
  location?: {
    lat: number;
    lng: number;
    accuracy: number;
  };
  safetyCheckEnabled: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PaidTimeBooking {
  bookingId: string;
  hostId: string;
  bookerId: string;
  duration: number;
  pricePerHour: number;
  totalCost: number;
  platformFee: number;
  hostEarning: number;
  status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  scheduledAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  escrowAmount: number;
  createdAt: Timestamp;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const FUNNEL_CONFIG = {
  ATTENTION: {
    LIKE_COST: 0,
    WINK_COST: 1,
    SUPERLIKE_COST: 5,
    FOLLOW_COST: 0,
  },
  FLIRT: {
    BASIC_COMPLIMENT_COST: 0,
    PREMIUM_COMPLIMENT_COST: 3,
    CHEMISTRY_BOOST_COST: 10,
    SEXY_MODE_REQUIRES_MUTUAL_CONSENT: true,
  },
  CONNECTION: {
    EMOTIONAL_ACCELERATION_THRESHOLD: 60,
  },
  MEETING: {
    QR_VERIFICATION_REQUIRED: true,
    SELFIE_VERIFICATION_OPTIONAL: true,
    SAFETY_TRACKING_DURATION_HOURS: 4,
    MIN_PAID_TIME_BOOKING_MINUTES: 30,
    MAX_PAID_TIME_BOOKING_MINUTES: 480,
    PLATFORM_FEE_PERCENT: 20,
    HOST_EARNING_PERCENT: 80,
  },
  ANALYTICS: {
    PHASE_CONVERSION_WINDOW_DAYS: 7,
    EMOTIONAL_SCORE_DECAY_DAYS: 30,
  },
};

// ============================================================================
// PHASE 1: ATTENTION
// ============================================================================

/**
 * Create an attraction action (Like, Wink, SuperLike, Follow)
 */
export async function createAttractionAction(
  fromUserId: string,
  toUserId: string,
  actionType: AttractionActionType,
  options?: {
    photoId?: string;
    profileSection?: string;
  }
): Promise<{ success: boolean; actionId?: string; cost?: number; error?: string }> {
  const db = getFirestore();

  try {
    let cost = 0;
    switch (actionType) {
      case 'wink':
        cost = FUNNEL_CONFIG.ATTENTION.WINK_COST;
        break;
      case 'superlike':
        cost = FUNNEL_CONFIG.ATTENTION.SUPERLIKE_COST;
        break;
      default:
        cost = 0;
    }

    if (cost > 0) {
      const userDoc = await db.collection('users').doc(fromUserId).get();
      const balance = userDoc.data()?.tokenBalance || 0;
      
      if (balance < cost) {
        return {
          success: false,
          error: `Insufficient tokens. ${actionType} costs ${cost} tokens.`,
        };
      }
    }

    const actionRef = db.collection('attraction_actions').doc();
    const actionId = actionRef.id;

    const actionData: AttractionAction = {
      actionId,
      fromUserId,
      toUserId,
      actionType,
      photoId: options?.photoId,
      profileSection: options?.profileSection,
      timestamp: Timestamp.now(),
      cost,
    };

    await db.runTransaction(async (transaction) => {
      if (cost > 0) {
        const userRef = db.collection('users').doc(fromUserId);
        transaction.update(userRef, {
          tokenBalance: FieldValue.increment(-cost),
          totalSpent: FieldValue.increment(cost),
        });

        const txRef = db.collection('transactions').doc();
        transaction.set(txRef, {
          userId: fromUserId,
          type: `${actionType}_action`,
          amount: -cost,
          description: `${actionType} sent to user`,
          timestamp: Timestamp.now(),
        });
      }

      transaction.set(actionRef, actionData);

      const receivedRef = db
        .collection('received_attraction_actions')
        .doc(toUserId)
        .collection('actions')
        .doc(actionId);
      
      transaction.set(receivedRef, actionData);

      const progressRef = db.collection('dating_funnel_progress').doc(fromUserId);
      transaction.set(
        progressRef,
        {
          userId: fromUserId,
          'phases.attention.actionsGiven': FieldValue.increment(1),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      const recipientProgressRef = db.collection('dating_funnel_progress').doc(toUserId);
      transaction.set(
        recipientProgressRef,
        {
          userId: toUserId,
          'phases.attention.actionsReceived': FieldValue.increment(1),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
    });

    logger.info(`Attraction action created: ${actionType} from ${fromUserId} to ${toUserId}`);

    return { success: true, actionId, cost };
  } catch (error) {
    logger.error('Error creating attraction action:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Check if mutual attraction exists
 */
export async function checkMutualAttraction(
  user1Id: string,
  user2Id: string
): Promise<{ matched: boolean; matchType?: 'like' | 'superlike' }> {
  const db = getFirestore();

  try {
    const actions1 = await db
      .collection('attraction_actions')
      .where('fromUserId', '==', user1Id)
      .where('toUserId', '==', user2Id)
      .where('actionType', 'in', ['like', 'superlike'])
      .limit(1)
      .get();

    if (actions1.empty) {
      return { matched: false };
    }

    const actions2 = await db
      .collection('attraction_actions')
      .where('fromUserId', '==', user2Id)
      .where('toUserId', '==', user1Id)
      .where('actionType', 'in', ['like', 'superlike'])
      .limit(1)
      .get();

    if (actions2.empty) {
      return { matched: false };
    }

    const matchType = actions1.docs[0].data().actionType === 'superlike' ||
                      actions2.docs[0].data().actionType === 'superlike'
      ? 'superlike'
      : 'like';

    await Promise.all([
      db.collection('dating_funnel_progress').doc(user1Id).set(
        {
          'phases.attention.matchesCreated': FieldValue.increment(1),
          'phases.attention.completed': true,
          currentPhase: 'FLIRT',
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      ),
      db.collection('dating_funnel_progress').doc(user2Id).set(
        {
          'phases.attention.matchesCreated': FieldValue.increment(1),
          'phases.attention.completed': true,
          currentPhase: 'FLIRT',
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      ),
    ]);

    logger.info(`Mutual match created: ${user1Id} ↔ ${user2Id} (${matchType})`);

    return { matched: true, matchType };
  } catch (error) {
    logger.error('Error checking mutual attraction:', error);
    return { matched: false };
  }
}

// ============================================================================
// PHASE 2: FLIRT
// ============================================================================

/**
 * Initialize a flirt session when users match
 */
export async function initializeFlirtSession(
  user1Id: string,
  user2Id: string
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  const db = getFirestore();

  try {
    const sessionRef = db.collection('flirt_sessions').doc();
    const sessionId = sessionRef.id;

    const sessionData: FlirtSession = {
      sessionId,
      user1Id,
      user2Id,
      status: 'ACTIVE',
      sexyMode: 'DISABLED',
      complimentsExchanged: 0,
      chemistryBoostActive: false,
      emotionalAcceleration: 0,
      messageCount: 0,
      lastActivityAt: Timestamp.now(),
      createdAt: Timestamp.now(),
    };

    await sessionRef.set(sessionData);

    await Promise.all([
      db.collection('dating_funnel_progress').doc(user1Id).set(
        {
          'phases.flirt.sessionsStarted': FieldValue.increment(1),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      ),
      db.collection('dating_funnel_progress').doc(user2Id).set(
        {
          'phases.flirt.sessionsStarted': FieldValue.increment(1),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      ),
    ]);

    logger.info(`Flirt session initialized: ${sessionId}`);

    return { success: true, sessionId };
  } catch (error) {
    logger.error('Error initializing flirt session:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Send a compliment in a flirt session
 */
export async function sendCompliment(
  senderId: string,
  recipientId: string,
  sessionId: string,
  complimentType: 'appearance' | 'personality' | 'style' | 'vibe' | 'custom',
  message: string,
  isPremium: boolean = false
): Promise<{ success: boolean; complimentId?: string; cost?: number; error?: string }> {
  const db = getFirestore();

  try {
    const cost = isPremium ? FUNNEL_CONFIG.FLIRT.PREMIUM_COMPLIMENT_COST : 0;

    if (cost > 0) {
      const userDoc = await db.collection('users').doc(senderId).get();
      const balance = userDoc.data()?.tokenBalance || 0;

      if (balance < cost) {
        return {
          success: false,
          error: `Insufficient tokens. Premium compliments cost ${cost} tokens.`,
        };
      }
    }

    const complimentRef = db.collection('compliments').doc();
    const complimentId = complimentRef.id;

    const complimentData: ComplimentData = {
      complimentId,
      senderId,
      recipientId,
      sessionId,
      type: complimentType,
      message,
      cost,
      timestamp: Timestamp.now(),
    };

    await db.runTransaction(async (transaction) => {
      if (cost > 0) {
        const userRef = db.collection('users').doc(senderId);
        transaction.update(userRef, {
          tokenBalance: FieldValue.increment(-cost),
          totalSpent: FieldValue.increment(cost),
        });
      }

      transaction.set(complimentRef, complimentData);

      const sessionRef = db.collection('flirt_sessions').doc(sessionId);
      transaction.update(sessionRef, {
        complimentsExchanged: FieldValue.increment(1),
        emotionalAcceleration: FieldValue.increment(5),
        lastActivityAt: Timestamp.now(),
      });

      const senderProgressRef = db.collection('dating_funnel_progress').doc(senderId);
      transaction.set(
        senderProgressRef,
        {
          'phases.flirt.complimentsSent': FieldValue.increment(1),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      const recipientProgressRef = db.collection('dating_funnel_progress').doc(recipientId);
      transaction.set(
        recipientProgressRef,
        {
          'phases.flirt.complimentsReceived': FieldValue.increment(1),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
    });

    logger.info(`Compliment sent in session ${sessionId}`);

    return { success: true, complimentId, cost };
  } catch (error) {
    logger.error('Error sending compliment:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Activate chemistry discovery boost
 */
export async function activateChemistryBoost(
  userId: string,
  partnerId: string,
  sessionId: string
): Promise<{ success: boolean; boostId?: string; error?: string }> {
  const db = getFirestore();
  const cost = FUNNEL_CONFIG.FLIRT.CHEMISTRY_BOOST_COST;

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const balance = userDoc.data()?.tokenBalance || 0;

    if (balance < cost) {
      return {
        success: false,
        error: `Insufficient tokens. Chemistry boost costs ${cost} tokens.`,
      };
    }

    const boostRef = db.collection('chemistry_discovery_boosts').doc();
    const boostId = boostRef.id;

    await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(userId);
      transaction.update(userRef, {
        tokenBalance: FieldValue.increment(-cost),
        totalSpent: FieldValue.increment(cost),
      });

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      transaction.set(boostRef, {
        boostId,
        userId1: userId,
        userId2: partnerId,
        sessionId,
        activatedBy: userId,
        active: true,
        expiresAt: Timestamp.fromDate(expiresAt),
        createdAt: Timestamp.now(),
      });

      const sessionRef = db.collection('flirt_sessions').doc(sessionId);
      transaction.update(sessionRef, {
        chemistryBoostActive: true,
        emotionalAcceleration: FieldValue.increment(20),
      });
    });

    logger.info(`Chemistry boost activated: ${boostId}`);

    return { success: true, boostId };
  } catch (error) {
    logger.error('Error activating chemistry boost:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Request or enable sexy mode (requires mutual consent)
 */
export async function updateSexyModeConsent(
  userId: string,
  partnerId: string,
  consent: boolean
): Promise<{ success: boolean; sexyModeEnabled?: boolean; error?: string }> {
  const db = getFirestore();

  try {
    const pairId = [userId, partnerId].sort().join('_');
    const consentRef = db.collection('sexy_mode_consent').doc(pairId);

    let sexyModeEnabled = false;

    await db.runTransaction(async (transaction) => {
      const consentDoc = await transaction.get(consentRef);

      if (!consentDoc.exists) {
        transaction.set(consentRef, {
          userId1: userId,
          userId2: partnerId,
          userId1Consent: userId < partnerId ? consent : false,
          userId2Consent: userId > partnerId ? consent : false,
          enabled: false,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      } else {
        const data = consentDoc.data()!;
        const isUser1 = userId === data.userId1;

        const updates: any = {
          updatedAt: Timestamp.now(),
        };

        if (isUser1) {
          updates.userId1Consent = consent;
        } else {
          updates.userId2Consent = consent;
        }

        const user1Consent = isUser1 ? consent : data.userId1Consent;
        const user2Consent = !isUser1 ? consent : data.userId2Consent;

        if (user1Consent && user2Consent) {
          updates.enabled = true;
          sexyModeEnabled = true;
        } else {
          updates.enabled = false;
        }

        transaction.update(consentRef, updates);

        if (sexyModeEnabled) {
          const sessionsSnapshot = await db
            .collection('flirt_sessions')
            .where('user1Id', 'in', [userId, partnerId])
            .where('user2Id', 'in', [userId, partnerId])
            .limit(1)
            .get();

          if (!sessionsSnapshot.empty) {
            const sessionRef = sessionsSnapshot.docs[0].ref;
            transaction.update(sessionRef, {
              sexyMode: 'ENABLED',
            });
          }

          transaction.set(
            db.collection('dating_funnel_progress').doc(userId),
            {
              'phases.flirt.sexyModeEnabled': true,
              updatedAt: Timestamp.now(),
            },
            { merge: true }
          );

          transaction.set(
            db.collection('dating_funnel_progress').doc(partnerId),
            {
              'phases.flirt.sexyModeEnabled': true,
              updatedAt: Timestamp.now(),
            },
            { merge: true }
          );
        }
      }
    });

    logger.info(`Sexy mode consent updated: ${userId} → ${consent}`);

    return { success: true, sexyModeEnabled };
  } catch (error) {
    logger.error('Error updating sexy mode consent:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Check if users can progress to CONNECTION phase
 */
export async function checkFlirtCompletion(
  sessionId: string
): Promise<{ canProgress: boolean; reason?: string }> {
  const db = getFirestore();

  try {
    const sessionDoc = await db.collection('flirt_sessions').doc(sessionId).get();

    if (!sessionDoc.exists) {
      return { canProgress: false, reason: 'Session not found' };
    }

    const session = sessionDoc.data() as FlirtSession;

    const hasEnoughCompliments = session.complimentsExchanged >= 5;
    const hasEmotionalMomentum = session.emotionalAcceleration >= 30;
    const sessionAge = Date.now() - session.createdAt.toMillis();
    const hasTimeInvested = sessionAge >= 3600000 || session.chemistryBoostActive;

    const canProgress = hasEnoughCompliments && hasEmotionalMomentum && hasTimeInvested;

    if (canProgress) {
      await db.runTransaction(async (transaction) => {
        transaction.update(sessionDoc.ref, {
          status: 'COMPLETED',
        });

        const progress1Ref = db.collection('dating_funnel_progress').doc(session.user1Id);
        const progress2Ref = db.collection('dating_funnel_progress').doc(session.user2Id);

        transaction.set(
          progress1Ref,
          {
            'phases.flirt.completed': true,
            currentPhase: 'CONNECTION',
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );

        transaction.set(
          progress2Ref,
          {
            'phases.flirt.completed': true,
            currentPhase: 'CONNECTION',
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
      });

      logger.info(`Flirt phase completed for session ${sessionId}`);
    }

    return {
      canProgress,
      reason: !canProgress
        ? `Need: ${!hasEnoughCompliments ? 'more compliments, ' : ''}${!hasEmotionalMomentum ? 'higher emotional acceleration, ' : ''}${!hasTimeInvested ? 'more time invested' : ''}`
        : undefined,
    };
  } catch (error) {
    logger.error('Error checking flirt completion:', error);
    return { canProgress: false, reason: String(error) };
  }
}

// File continues in next part due to length...

export const DATING_FUNNEL = {
  CONFIG: FUNNEL_CONFIG,
  
  // Phase 1: Attention
  createAttractionAction,
  checkMutualAttraction,
  
  // Phase 2: Flirt
  initializeFlirtSession,
  sendCompliment,
  activateChemistryBoost,
  updateSexyModeConsent,
  checkFlirtCompletion,
};