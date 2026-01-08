/**
 * Premium Story Posts - Cloud Functions
 * Handles unlock processing, commission distribution, and cleanup
 * 
 * PACK 78 Implementation
 */

import { db, admin, serverTimestamp, generateId } from './init';
import { HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { recordStoryEarning } from './earningsIntegration';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PREMIUM_STORIES_CONFIG = {
  MIN_PRICE: 50,
  MAX_PRICE: 500,
  UNLOCK_DURATION_HOURS: 24,
  CREATOR_SPLIT: 0.65, // 65% to creator
  AVALO_COMMISSION: 0.35, // 35% to Avalo
  MAX_VIDEO_DURATION_SECONDS: 30,
  MAX_IMAGE_WIDTH: 1080,
  MAX_IMAGE_HEIGHT: 1920,
} as const;

// ============================================================================
// TYPES
// ============================================================================

export type PremiumStoryMediaType = 'image' | 'video';

export interface PremiumStory {
  id: string;
  authorId: string;
  mediaUrl: string;
  thumbnailUrl: string;
  mediaType: PremiumStoryMediaType;
  createdAt: Timestamp;
  durationHours: 24;
  priceTokens: number;
  viewCount: number;
  unlockCount: number;
  metadata?: {
    width: number;
    height: number;
    duration?: number;
    fileSize: number;
  };
}

export interface PremiumStoryUnlock {
  id: string;
  userId: string;
  storyId: string;
  unlockedAt: Timestamp;
  expiresAt: Timestamp;
  pricePaid: number;
  creatorEarnings: number;
  avaloFee: number;
}

interface UnlockResult {
  success: boolean;
  unlockId?: string;
  mediaUrl?: string;
  expiresAt?: Date;
  error?: string;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate story price is within allowed range
 */
function validateStoryPrice(price: number): void {
  if (price < PREMIUM_STORIES_CONFIG.MIN_PRICE || price > PREMIUM_STORIES_CONFIG.MAX_PRICE) {
    throw new HttpsError(
      'invalid-argument',
      `Story price must be between ${PREMIUM_STORIES_CONFIG.MIN_PRICE} and ${PREMIUM_STORIES_CONFIG.MAX_PRICE} tokens`
    );
  }
}

/**
 * Check if user has sufficient tokens
 */
async function checkUserBalance(userId: string, requiredTokens: number): Promise<boolean> {
  const walletRef = db.collection('wallets').doc(userId);
  const walletSnap = await walletRef.get();
  
  if (!walletSnap.exists) {
    return false;
  }
  
  const balance = walletSnap.data()?.tokens || 0;
  return balance >= requiredTokens;
}

/**
 * Check if story is already unlocked by user
 */
async function checkExistingUnlock(userId: string, storyId: string): Promise<PremiumStoryUnlock | null> {
  const now = Timestamp.now();
  
  const unlocksQuery = await db
    .collection('premium_story_unlocks')
    .where('userId', '==', userId)
    .where('storyId', '==', storyId)
    .where('expiresAt', '>', now)
    .limit(1)
    .get();
  
  if (unlocksQuery.empty) {
    return null;
  }
  
  return unlocksQuery.docs[0].data() as PremiumStoryUnlock;
}

// ============================================================================
// UNLOCK PROCESSING
// ============================================================================

/**
 * Process premium story unlock payment
 * 
 * Flow:
 * 1. Validate story exists and price
 * 2. Check user balance
 * 3. Check for existing valid unlock
 * 4. Deduct tokens from user
 * 5. Apply commission split (35% Avalo, 65% Creator)
 * 6. Create unlock record
 * 7. Update story stats
 * 8. Send notifications
 */
export async function unlockPremiumStory(
  userId: string,
  storyId: string
): Promise<UnlockResult> {
  try {
    // 1. Fetch story
    const storyRef = db.collection('premium_stories').doc(storyId);
    const storySnap = await storyRef.get();
    
    if (!storySnap.exists) {
      throw new HttpsError('not-found', 'Story not found');
    }
    
    const story = storySnap.data() as PremiumStory;
    const price = story.priceTokens;
    
    // Anti-fraud: Cannot unlock for 0 tokens
    if (price <= 0) {
      throw new HttpsError('invalid-argument', 'Invalid story price');
    }
    
    // Anti-fraud: Cannot unlock your own story
    if (story.authorId === userId) {
      throw new HttpsError('permission-denied', 'Cannot unlock your own story');
    }
    
    // 2. Check balance
    const hasBalance = await checkUserBalance(userId, price);
    if (!hasBalance) {
      throw new HttpsError('failed-precondition', 'Insufficient tokens');
    }
    
    // 3. Check existing unlock (anti-fraud: prevent double unlock)
    const existingUnlock = await checkExistingUnlock(userId, storyId);
    if (existingUnlock) {
      throw new HttpsError(
        'already-exists',
        'Story already unlocked. Access expires at ' + existingUnlock.expiresAt.toDate().toISOString()
      );
    }
    
    // Calculate commission split
    const creatorEarnings = Math.floor(price * PREMIUM_STORIES_CONFIG.CREATOR_SPLIT);
    const avaloFee = price - creatorEarnings;
    
    // Calculate expiry (24 hours from now)
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(
      now.toMillis() + (PREMIUM_STORIES_CONFIG.UNLOCK_DURATION_HOURS * 60 * 60 * 1000)
    );
    
    // Run transaction
    const unlockId = generateId();
    
    await db.runTransaction(async (transaction) => {
      // Deduct tokens from buyer
      const walletRef = db.collection('wallets').doc(userId);
      const walletSnap = await transaction.get(walletRef);
      
      if (!walletSnap.exists) {
        throw new HttpsError('not-found', 'Wallet not found');
      }
      
      const currentBalance = walletSnap.data()?.tokens || 0;
      if (currentBalance < price) {
        throw new HttpsError('failed-precondition', 'Insufficient tokens');
      }
      
      transaction.update(walletRef, {
        tokens: FieldValue.increment(-price),
        updatedAt: serverTimestamp(),
      });
      
      // Credit creator (65%)
      const creatorWalletRef = db.collection('wallets').doc(story.authorId);
      transaction.set(creatorWalletRef, {
        tokens: FieldValue.increment(creatorEarnings),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      
      // Create unlock record
      const unlockRef = db.collection('premium_story_unlocks').doc(unlockId);
      transaction.set(unlockRef, {
        id: unlockId,
        userId,
        storyId,
        unlockedAt: now,
        expiresAt,
        pricePaid: price,
        creatorEarnings,
        avaloFee,
        createdAt: serverTimestamp(),
      });
      
      // Update story stats
      transaction.update(storyRef, {
        unlockCount: FieldValue.increment(1),
        updatedAt: serverTimestamp(),
      });
      
      // Record transaction for buyer
      transaction.set(db.collection('transactions').doc(), {
        userId,
        type: 'premium_story_unlock',
        amount: -price,
        storyId,
        unlockId,
        createdAt: serverTimestamp(),
        description: `Unlocked premium story`,
      });
      
      // Record earning for creator
      transaction.set(db.collection('transactions').doc(), {
        userId: story.authorId,
        type: 'premium_story_earning',
        amount: creatorEarnings,
        storyId,
        unlockId,
        createdAt: serverTimestamp(),
        description: `Earned from story unlock`,
      });
      
      // Record Avalo commission
      transaction.set(db.collection('transactions').doc(), {
        userId: 'avalo_platform',
        type: 'premium_story_commission',
        amount: avaloFee,
        storyId,
        unlockId,
        createdAt: serverTimestamp(),
        description: `Platform commission (35%)`,
      });
    });
    
    // Record earning in ledger (PACK 81)
    recordStoryEarning({
      creatorId: story.authorId,
      buyerId: userId,
      storyId,
      priceTokens: price,
      unlockId,
    }).catch((err) => {
      logger.error('Failed to record story earning in ledger', err);
    });
    
    // Send notifications (non-blocking)
    sendUnlockNotifications(userId, story.authorId, creatorEarnings, storyId).catch((err) => {
      logger.error('Failed to send unlock notifications', err);
    });
    
    logger.info(`Story unlocked: ${storyId} by ${userId} for ${price} tokens`);
    
    return {
      success: true,
      unlockId,
      mediaUrl: story.mediaUrl,
      expiresAt: expiresAt.toDate(),
    };
    
  } catch (error: any) {
    logger.error('Failed to unlock story', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    return {
      success: false,
      error: error.message || 'Failed to unlock story',
    };
  }
}

// ============================================================================
// UNLOCK ACCESS VALIDATION
// ============================================================================

/**
 * Check if user has valid access to a premium story
 */
export async function checkStoryAccess(
  userId: string,
  storyId: string
): Promise<{
  hasAccess: boolean;
  expiresAt?: Date;
  unlockId?: string;
  remainingSeconds?: number;
}> {
  const now = Timestamp.now();
  
  // Check for valid unlock
  const unlocksQuery = await db
    .collection('premium_story_unlocks')
    .where('userId', '==', userId)
    .where('storyId', '==', storyId)
    .where('expiresAt', '>', now)
    .limit(1)
    .get();
  
  if (unlocksQuery.empty) {
    return { hasAccess: false };
  }
  
  const unlock = unlocksQuery.docs[0].data() as PremiumStoryUnlock;
  const expiresAt = unlock.expiresAt.toDate();
  const remainingSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  
  return {
    hasAccess: true,
    expiresAt,
    unlockId: unlock.id,
    remainingSeconds: Math.max(0, remainingSeconds),
  };
}

/**
 * Validate media URL access - CRITICAL SECURITY
 * Backend must never expose downloadable Storage URLs without unlock validation
 */
export async function validateMediaAccess(
  userId: string,
  storyId: string
): Promise<{ allowed: boolean; mediaUrl?: string; error?: string }> {
  try {
    // Get story
    const storySnap = await db.collection('premium_stories').doc(storyId).get();
    
    if (!storySnap.exists) {
      return { allowed: false, error: 'Story not found' };
    }
    
    const story = storySnap.data() as PremiumStory;
    
    // Author has full access
    if (story.authorId === userId) {
      return { allowed: true, mediaUrl: story.mediaUrl };
    }
    
    // Check unlock access
    const access = await checkStoryAccess(userId, storyId);
    
    if (!access.hasAccess) {
      return { allowed: false, error: 'Story not unlocked or access expired' };
    }
    
    // Increment view count
    await db.collection('premium_stories').doc(storyId).update({
      viewCount: FieldValue.increment(1),
      updatedAt: serverTimestamp(),
    });
    
    return { allowed: true, mediaUrl: story.mediaUrl };
    
  } catch (error: any) {
    logger.error('Failed to validate media access', error);
    return { allowed: false, error: 'Access validation failed' };
  }
}

// ============================================================================
// CLEANUP & MAINTENANCE
// ============================================================================

/**
 * Cleanup expired unlocks (scheduled function)
 * Runs every hour to delete expired unlock documents
 */
export const cleanupExpiredUnlocks = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'UTC',
    memory: '256MiB',
  },
  async () => {
    const now = Timestamp.now();
    
    try {
      // Find expired unlocks
      const expiredQuery = await db
        .collection('premium_story_unlocks')
        .where('expiresAt', '<=', now)
        .limit(500)
        .get();
      
      if (expiredQuery.empty) {
        logger.info('No expired unlocks to clean up');
        return;
      }
      
      // Delete in batches
      const batch = db.batch();
      let deleteCount = 0;
      
      expiredQuery.docs.forEach((doc) => {
        batch.delete(doc.ref);
        deleteCount++;
      });
      
      await batch.commit();
      
      logger.info(`Cleaned up ${deleteCount} expired unlocks`);
      
    } catch (error) {
      logger.error('Failed to cleanup expired unlocks', error);
      throw error;
    }
  }
);

/**
 * Send expiration reminder notifications
 * Runs every 6 hours to notify users whose access expires soon
 */
export const sendExpirationReminders = onSchedule(
  {
    schedule: 'every 6 hours',
    timeZone: 'UTC',
    memory: '256MiB',
  },
  async () => {
    const now = Timestamp.now();
    const twoHoursFromNow = Timestamp.fromMillis(now.toMillis() + (2 * 60 * 60 * 1000));
    
    try {
      // Find unlocks expiring in next 2 hours
      const expiringQuery = await db
        .collection('premium_story_unlocks')
        .where('expiresAt', '>', now)
        .where('expiresAt', '<=', twoHoursFromNow)
        .limit(100)
        .get();
      
      if (expiringQuery.empty) {
        logger.info('No expiring unlocks to notify');
        return;
      }
      
      const notifications: Promise<void>[] = [];
      
      expiringQuery.docs.forEach((doc) => {
        const unlock = doc.data() as PremiumStoryUnlock;
        const expiresInHours = Math.ceil((unlock.expiresAt.toMillis() - now.toMillis()) / (60 * 60 * 1000));
        
        notifications.push(
          sendExpirationNotification(unlock.userId, unlock.storyId, expiresInHours)
        );
      });
      
      await Promise.allSettled(notifications);
      
      logger.info(`Sent ${notifications.length} expiration reminders`);
      
    } catch (error) {
      logger.error('Failed to send expiration reminders', error);
    }
  }
);

// ============================================================================
// DELETION CASCADE
// ============================================================================

/**
 * Revoke all unlocks when story is deleted
 */
export async function revokeStoryUnlocks(storyId: string): Promise<number> {
  try {
    const unlocksQuery = await db
      .collection('premium_story_unlocks')
      .where('storyId', '==', storyId)
      .get();
    
    if (unlocksQuery.empty) {
      return 0;
    }
    
    const batch = db.batch();
    unlocksQuery.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    logger.info(`Revoked ${unlocksQuery.size} unlocks for deleted story ${storyId}`);
    return unlocksQuery.size;
    
  } catch (error) {
    logger.error('Failed to revoke story unlocks', error);
    throw error;
  }
}

/**
 * Revoke all unlocks when account is deleted
 */
export async function revokeUserUnlocks(userId: string): Promise<number> {
  try {
    const unlocksQuery = await db
      .collection('premium_story_unlocks')
      .where('userId', '==', userId)
      .get();
    
    if (unlocksQuery.empty) {
      return 0;
    }
    
    const batch = db.batch();
    unlocksQuery.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    logger.info(`Revoked ${unlocksQuery.size} unlocks for deleted user ${userId}`);
    return unlocksQuery.size;
    
  } catch (error) {
    logger.error('Failed to revoke user unlocks', error);
    throw error;
  }
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

/**
 * Send notifications after successful unlock
 */
async function sendUnlockNotifications(
  buyerId: string,
  creatorId: string,
  tokensEarned: number,
  storyId: string
): Promise<void> {
  try {
    // Get user profiles for notification
    const [buyerSnap, creatorSnap] = await Promise.all([
      db.collection('profiles').doc(buyerId).get(),
      db.collection('profiles').doc(creatorId).get(),
    ]);
    
    const buyerProfile = buyerSnap.data();
    const creatorProfile = creatorSnap.data();
    
    // Notification to creator
    if (creatorProfile?.fcmToken) {
      await admin.messaging().send({
        token: creatorProfile.fcmToken,
        notification: {
          title: '💰 Story Unlocked!',
          body: `Your story was unlocked — you earned ${tokensEarned} tokens.`,
        },
        data: {
          type: 'premium_story_earning',
          storyId,
          tokensEarned: tokensEarned.toString(),
        },
      });
    }
    
    // Create in-app notification for creator
    await db.collection('notifications').add({
      userId: creatorId,
      type: 'premium_story_earning',
      title: 'Story Unlocked',
      message: `Your story was unlocked — you earned ${tokensEarned} tokens.`,
      data: { storyId, tokensEarned },
      read: false,
      createdAt: serverTimestamp(),
    });
    
  } catch (error) {
    logger.error('Failed to send unlock notifications', error);
    // Don't throw - notifications are non-critical
  }
}

/**
 * Send expiration notification to buyer
 */
async function sendExpirationNotification(
  userId: string,
  storyId: string,
  expiresInHours: number
): Promise<void> {
  try {
    const profileSnap = await db.collection('profiles').doc(userId).get();
    const profile = profileSnap.data();
    
    if (!profile?.fcmToken) {
      return;
    }
    
    await admin.messaging().send({
      token: profile.fcmToken,
      notification: {
        title: '⏰ Premium Access Expiring',
        body: `Your premium unlock expires in ${expiresInHours} hours.`,
      },
      data: {
        type: 'premium_story_expiring',
        storyId,
        expiresInHours: expiresInHours.toString(),
      },
    });
    
    // Create in-app notification
    await db.collection('notifications').add({
      userId,
      type: 'premium_story_expiring',
      title: 'Premium Access Expiring',
      message: `Your premium unlock expires in ${expiresInHours} hours — unlock again to view new content.`,
      data: { storyId, expiresInHours },
      read: false,
      createdAt: serverTimestamp(),
    });
    
  } catch (error) {
    logger.error('Failed to send expiration notification', error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  validateStoryPrice,
  checkUserBalance,
  checkExistingUnlock,
  PREMIUM_STORIES_CONFIG,
};