/**
 * PACK 255 — Swipe Heating System
 * 
 * Shows the best potential matches at optimal emotional moments
 * to maximize engagement and conversions.
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  SwipeHeatingState,
  EmotionalTrigger,
} from './pack255-ai-matchmaker-types';

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (...args: any[]) => console.log('[Pack255:SwipeHeating]', ...args),
  warn: (...args: any[]) => console.warn('[Pack255:SwipeHeating]', ...args),
  error: (...args: any[]) => console.error('[Pack255:SwipeHeating]', ...args),
};

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTIONS = {
  HEATING_STATES: 'pack255_swipe_heating',
} as const;

const HEATING_CONFIG = {
  WINDOW_MINUTES: 10,                            // Default heating window
  MAX_HEATS_PER_DAY: 20,                         // Prevent abuse
  DECAY_RATE: 0.1,                               // Heat decay per minute
  TRIGGER_HEAT_LEVELS: {
    [EmotionalTrigger.MATCH_RECEIVED]: 80,
    [EmotionalTrigger.MESSAGE_READ]: 60,
    [EmotionalTrigger.GIFT_RECEIVED]: 90,
    [EmotionalTrigger.BOOST_PURCHASED]: 95,
    [EmotionalTrigger.MEDIA_PURCHASED]: 85,
    [EmotionalTrigger.PAID_CHAT_END]: 100,
    [EmotionalTrigger.CALL_END]: 100,
    [EmotionalTrigger.MEETING_COMPLETED]: 100,
    [EmotionalTrigger.POSITIVE_INTERACTION]: 70,
  },
} as const;

// ============================================================================
// SWIPE HEATING ACTIVATION
// ============================================================================

/**
 * Activate swipe heating for a user after an emotional trigger
 */
export async function activateSwipeHeating(
  userId: string,
  trigger: EmotionalTrigger
): Promise<SwipeHeatingState> {
  try {
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(
      now.toMillis() + HEATING_CONFIG.WINDOW_MINUTES * 60 * 1000
    );

    // Check daily limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayHeatsSnapshot = await db
      .collection(COLLECTIONS.HEATING_STATES)
      .where('userId', '==', userId)
      .where('triggeredAt', '>=', Timestamp.fromDate(todayStart))
      .get();

    const consecutiveHeats = todayHeatsSnapshot.size;

    if (consecutiveHeats >= HEATING_CONFIG.MAX_HEATS_PER_DAY) {
      logger.warn(`User ${userId} has reached daily heating limit`);
      return await getHeatingState(userId);
    }

    // Get heat level for this trigger
    const heatLevel = HEATING_CONFIG.TRIGGER_HEAT_LEVELS[trigger] || 70;

    // Create heating state
    const heatingState: SwipeHeatingState = {
      userId,
      isHeated: true,
      trigger,
      triggeredAt: now,
      expiresAt,
      heatLevel,
      consecutiveHeats: consecutiveHeats + 1,
    };

    // Save heating state
    await db.collection(COLLECTIONS.HEATING_STATES).add(heatingState);

    logger.info(`Activated swipe heating for ${userId}: ${trigger} (level ${heatLevel})`);

    return heatingState;
  } catch (error) {
    logger.error(`Failed to activate swipe heating for ${userId}:`, error);
    throw error;
  }
}

/**
 * Get current heating state for a user
 */
export async function getHeatingState(userId: string): Promise<SwipeHeatingState> {
  try {
    const now = Timestamp.now();

    // Get most recent heating state
    const heatingSnapshot = await db
      .collection(COLLECTIONS.HEATING_STATES)
      .where('userId', '==', userId)
      .where('expiresAt', '>', now)
      .orderBy('expiresAt', 'desc')
      .limit(1)
      .get();

    if (heatingSnapshot.empty) {
      // Not heated
      return {
        userId,
        isHeated: false,
        heatLevel: 0,
        consecutiveHeats: 0,
      };
    }

    const heatingDoc = heatingSnapshot.docs[0];
    const heatingData = heatingDoc.data() as SwipeHeatingState;

    // Calculate current heat level with decay
    const minutesElapsed = (now.toMillis() - heatingData.triggeredAt!.toMillis()) / (60 * 1000);
    const decayedHeat = Math.max(
      0,
      heatingData.heatLevel - minutesElapsed * HEATING_CONFIG.DECAY_RATE
    );

    return {
      ...heatingData,
      heatLevel: decayedHeat,
      isHeated: decayedHeat > 0,
    };
  } catch (error) {
    logger.error(`Failed to get heating state for ${userId}:`, error);
    return {
      userId,
      isHeated: false,
      heatLevel: 0,
      consecutiveHeats: 0,
    };
  }
}

/**
 * Check if a user is currently heated
 */
export async function isUserHeated(userId: string): Promise<boolean> {
  const heatingState = await getHeatingState(userId);
  return heatingState.isHeated && heatingState.heatLevel > 0;
}

/**
 * Get heating multiplier for match ranking
 */
export async function getHeatingMultiplier(userId: string): Promise<number> {
  const heatingState = await getHeatingState(userId);
  
  if (!heatingState.isHeated || heatingState.heatLevel === 0) {
    return 1.0; // No boost
  }

  // Convert heat level (0-100) to multiplier (1.0-2.0)
  // Higher heat = higher multiplier
  return 1.0 + (heatingState.heatLevel / 100);
}

/**
 * Deactivate heating for a user (manual override)
 */
export async function deactivateSwipeHeating(userId: string): Promise<void> {
  try {
    const now = Timestamp.now();

    // Get all active heating states
    const heatingSnapshot = await db
      .collection(COLLECTIONS.HEATING_STATES)
      .where('userId', '==', userId)
      .where('expiresAt', '>', now)
      .get();

    // Expire them all
    const batch = db.batch();
    heatingSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        expiresAt: now,
        isHeated: false,
      });
    });

    await batch.commit();

    logger.info(`Deactivated swipe heating for ${userId}`);
  } catch (error) {
    logger.error(`Failed to deactivate swipe heating for ${userId}:`, error);
    throw error;
  }
}

// ============================================================================
// TRIGGER HANDLERS
// ============================================================================

/**
 * Fire heating when user receives a match
 */
export async function onMatchReceived(userId: string): Promise<void> {
  await activateSwipeHeating(userId, EmotionalTrigger.MATCH_RECEIVED);
}

/**
 * Fire heating when user's message is read
 */
export async function onMessageRead(userId: string): Promise<void> {
  await activateSwipeHeating(userId, EmotionalTrigger.MESSAGE_READ);
}

/**
 * Fire heating when user receives a gift
 */
export async function onGiftReceived(userId: string): Promise<void> {
  await activateSwipeHeating(userId, EmotionalTrigger.GIFT_RECEIVED);
}

/**
 * Fire heating when user purchases boost or media
 */
export async function onPurchase(userId: string, type: 'boost' | 'media'): Promise<void> {
  const trigger = type === 'boost'
    ? EmotionalTrigger.BOOST_PURCHASED
    : EmotionalTrigger.MEDIA_PURCHASED;
  
  await activateSwipeHeating(userId, trigger);
}

/**
 * Fire heating when paid chat ends
 */
export async function onPaidChatEnd(userId: string): Promise<void> {
  await activateSwipeHeating(userId, EmotionalTrigger.PAID_CHAT_END);
}

/**
 * Fire heating when call ends
 */
export async function onCallEnd(userId: string): Promise<void> {
  await activateSwipeHeating(userId, EmotionalTrigger.CALL_END);
}

/**
 * Fire heating when meeting completes
 */
export async function onMeetingCompleted(userId: string): Promise<void> {
  await activateSwipeHeating(userId, EmotionalTrigger.MEETING_COMPLETED);
}

/**
 * Fire heating on positive interaction
 */
export async function onPositiveInteraction(userId: string): Promise<void> {
  await activateSwipeHeating(userId, EmotionalTrigger.POSITIVE_INTERACTION);
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up expired heating states (scheduled job)
 */
export async function cleanupExpiredHeating(): Promise<{
  deleted: number;
}> {
  try {
    const now = Timestamp.now();
    const expiredSnapshot = await db
      .collection(COLLECTIONS.HEATING_STATES)
      .where('expiresAt', '<', now)
      .limit(500)
      .get();

    if (expiredSnapshot.empty) {
      return { deleted: 0 };
    }

    const batch = db.batch();
    expiredSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    logger.info(`Cleaned up ${expiredSnapshot.size} expired heating states`);

    return { deleted: expiredSnapshot.size };
  } catch (error) {
    logger.error('Failed to cleanup expired heating states:', error);
    throw error;
  }
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get heating statistics for a user
 */
export async function getHeatingStats(
  userId: string,
  days: number = 7
): Promise<{
  totalHeats: number;
  avgHeatLevel: number;
  mostCommonTrigger: EmotionalTrigger | null;
  conversionsDuringHeating: number;
}> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const heatsSnapshot = await db
      .collection(COLLECTIONS.HEATING_STATES)
      .where('userId', '==', userId)
      .where('triggeredAt', '>=', Timestamp.fromDate(startDate))
      .get();

    if (heatsSnapshot.empty) {
      return {
        totalHeats: 0,
        avgHeatLevel: 0,
        mostCommonTrigger: null,
        conversionsDuringHeating: 0,
      };
    }

    const heats = heatsSnapshot.docs.map(doc => doc.data() as SwipeHeatingState);

    // Calculate statistics
    const totalHeats = heats.length;
    const avgHeatLevel = heats.reduce((sum, h) => sum + h.heatLevel, 0) / totalHeats;

    // Find most common trigger
    const triggerCounts = new Map<EmotionalTrigger, number>();
    heats.forEach(h => {
      if (h.trigger) {
        triggerCounts.set(h.trigger, (triggerCounts.get(h.trigger) || 0) + 1);
      }
    });

    let mostCommonTrigger: EmotionalTrigger | null = null;
    let maxCount = 0;
    triggerCounts.forEach((count, trigger) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommonTrigger = trigger;
      }
    });

    // TODO: Calculate conversions during heating (requires tracking)
    const conversionsDuringHeating = 0;

    return {
      totalHeats,
      avgHeatLevel,
      mostCommonTrigger,
      conversionsDuringHeating,
    };
  } catch (error) {
    logger.error(`Failed to get heating stats for ${userId}:`, error);
    throw error;
  }
}

logger.info('✅ Pack 255 Swipe Heating System initialized');