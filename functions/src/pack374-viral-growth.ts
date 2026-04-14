import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * ═══════════════════════════════════════════════════════════════
 * PACK 374 — VIRAL GROWTH ENGINE
 * ═══════════════════════════════════════════════════════════════
 * 
 * Implements:
 * - Viral Invite System
 * - Boost Mechanics
 * - Social Loops
 * - Share Tracking
 * - Reward Distribution
 * - Fraud Protection
 * - K-Factor Analytics
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import * as crypto from 'crypto';
import { FieldValue, HttpsError, Timestamp, increment, onCall, logger, onSchedule, onDocumentCreated } from './runtime';

const db = admin.firestore();
const auth = getAuth();

// ═════════════════════════════════════════════════════════════
// 1️⃣ VIRAL INVITE SYSTEM
// ═════════════════════════════════════════════════════════════

interface InviteCodeData {
  code: string;
  inviterUserId: string;
  channel: 'sms' | 'whatsapp' | 'messenger' | 'instagram' | 'qr' | 'link';
  deepLink: string;
  expiresAt: admin.firestore.Timestamp;
  createdAt: admin.firestore.Timestamp;
  maxUses: number;
  currentUses: number;
}

/**
 * Generate unique invite code for user
 */
export const pack374_generateInviteCode = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { channel, maxUses = 10 } = data;
  const userId = request.auth.uid;

  try {
    // Check rate limiting - max 5 codes per hour per user
    const oneHourAgo = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 60 * 60 * 1000)
    );
    
    const recentCodes = await db.collection('inviteCodes')
      .where('inviterUserId', '==', userId)
      .where('createdAt', '>', oneHourAgo)
      .count()
      .get();

    if (recentCodes.data().count >= 5) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Too many invite codes generated. Try again later.'
      );
    }

    // Generate unique code
    const code = generateUniqueCode(8);
    const deepLink = `platform://invite?code=${code}`;
    const webLink = `https://platform.app/join/${code}`;

    const inviteCodeData: InviteCodeData = {
      code,
      inviterUserId: userId,
      channel: channel || 'link',
      deepLink,
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      ),
      createdAt: admin.firestore.Timestamp.now(),
      maxUses,
      currentUses: 0,
    };

    await db.collection('inviteCodes').doc(code).set(inviteCodeData);

    // Track generation in user stats
    await db.collection('userInviteStats').doc(userId).set({
      totalCodesGenerated: admin.firestore.FieldValue.increment(1),
      lastCodeGeneratedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    }, { merge: true });

    return {
      code,
      deepLink,
      webLink,
      expiresAt: inviteCodeData.expiresAt.toDate().toISOString(),
    };

  } catch (error: any) {
    console.error('Error generating invite code:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Register invite acceptance and validate
 */
export const pack374_registerInviteAcceptance = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { inviteCode, deviceFingerprint, ipAddress } = data;
  const newUserId = request.auth.uid;

  try {
    // Get invite code
    const codeDoc = await db.collection('inviteCodes').doc(inviteCode).get();
    
    if (!codeDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Invalid invite code');
    }

    const codeData = codeDoc.data() as InviteCodeData;

    // Validate code hasn't expired
    if (codeData.expiresAt.toDate() < new Date()) {
      throw new functions.https.HttpsError('failed-precondition', 'Invite code expired');
    }

    // Validate max uses
    if (codeData.currentUses >= codeData.maxUses) {
      throw new functions.https.HttpsError('resource-exhausted', 'Invite code fully used');
    }

    // ⚠️ FRAUD DETECTION (PACK 302 integration)
    const fraudCheck = await checkInviteFraud(
      codeData.inviterUserId,
      newUserId,
      deviceFingerprint,
      ipAddress
    );

    if (fraudCheck.isFraud) {
      // Log fraud attempt
      await db.collection('inviteFraud').add({
        inviterUserId: codeData.inviterUserId,
        newUserId,
        inviteCode,
        fraudType: fraudCheck.fraudType,
        deviceFingerprint,
        ipAddress,
        severity: fraudCheck.severity,
        detectedAt: admin.firestore.Timestamp.now(),
      });

      throw new functions.https.HttpsError(
        'permission-denied',
        'Invite cannot be processed due to security concerns'
      );
    }

    // Create invite record
    const inviteId = db.collection('viralInvites').doc().id;
    await db.collection('viralInvites').doc(inviteId).set({
      inviteId,
      inviterUserId: codeData.inviterUserId,
      newUserId,
      inviteCode,
      channel: codeData.channel,
      rewardType: 'profile_boost',
      rewardStatus: 'pending',
      deviceFingerprint,
      ipAddress,
      createdAt: admin.firestore.Timestamp.now(),
    });

    // Update code usage
    await db.collection('inviteCodes').doc(inviteCode).update({
      currentUses: admin.firestore.FieldValue.increment(1),
    });

    // Update user stats
    await db.collection('userInviteStats').doc(codeData.inviterUserId).set({
      totalInvitesSent: admin.firestore.FieldValue.increment(1),
      totalInvitesAccepted: admin.firestore.FieldValue.increment(1),
      lastInviteAcceptedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    }, { merge: true });

    // Update new user profile
    await db.collection('users').doc(newUserId).set({
      invitedBy: codeData.inviterUserId,
      inviteCode,
      inviteAcceptedAt: admin.firestore.Timestamp.now(),
    }, { merge: true });

    // Track viral event
    await trackViralEvent({
      userId: newUserId,
      eventType: 'invite_accepted',
      targetUserId: codeData.inviterUserId,
      loopType: 'invite_loop',
      metadata: { inviteCode, channel: codeData.channel },
    });

    // Schedule reward check (after 7 days of activity)
    await scheduleRewardCheck(inviteId, codeData.inviterUserId, newUserId);

    console.log('Scheduled job result:', {
      success: true,
      inviteId,
      inviterUserId: codeData.inviterUserId,
    });


    return;

  } catch (error: any) {
    console.error('Error registering invite:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Reward inviter after successful conversion
 */
export const pack374_rewardInviteSuccess = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { inviteId } = data;

  try {
    const inviteDoc = await db.collection('viralInvites').doc(inviteId).get();
    
    if (!inviteDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Invite not found');
    }

    const inviteData = inviteDoc.data()!;

    // Check if already rewarded
    if (inviteData.rewardStatus === 'rewarded') {
      throw new functions.https.HttpsError('already-exists', 'Reward already issued');
    }

    // Verify new user has been active (completed profile, made at least 1 interaction)
    const newUserDoc = await db.collection('users').doc(inviteData.newUserId).get();
    const newUserData = newUserDoc.data();

    if (!newUserData || !newUserData.profileComplete) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'New user must complete profile first'
      );
    }

    // Issue reward: Profile Boost (48 hours, strength 3)
    const rewardId = await issueReward(
      inviteData.inviterUserId,
      'profile_boost',
      {
        boostType: 'profile',
        durationHours: 48,
        strength: 3,
        source: 'invite_success',
        metadata: { inviteId, newUserId: inviteData.newUserId },
      }
    );

    // Update invite status
    await db.collection('viralInvites').doc(inviteId).update({
      rewardStatus: 'rewarded',
      rewardIssuedAt: admin.firestore.Timestamp.now(),
      rewardId,
    });

    // Track viral event
    await trackViralEvent({
      userId: inviteData.inviterUserId,
      eventType: 'invite_reward_issued',
      targetUserId: inviteData.newUserId,
      loopType: 'invite_loop',
      metadata: { rewardType: 'profile_boost', rewardId },
      completed: true,
    });

    // Send notification (PACK 293 integration)
    await sendViralNotification(
      inviteData.inviterUserId,
      'invite_reward',
      {
        title: '🎉 Invite Reward!',
        body: 'You earned a 48-hour Profile Boost for inviting a friend!',
        data: { rewardId, inviteId },
      }
    );

    console.log('Scheduled job result:', {
      success: true,
      rewardId,
      rewardType: 'profile_boost',
    });


    return;

  } catch (error: any) {
    console.error('Error rewarding invite:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ═════════════════════════════════════════════════════════════
// 2️⃣ BOOST SYSTEM
// ═════════════════════════════════════════════════════════════

interface BoostConfig {
  boostType: 'profile' | 'story' | 'earner' | 'local';
  durationHours: number;
  strength: number; // 1-5
  price?: number; // In tokens (if paid)
  rewardSource?: string;
}

/**
 * Apply boost to user
 */
export const pack374_applyBoost = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { boostType, durationMinutes, strength, paid = true } = data;
  const userId = request.auth.uid;

  try {
    // Get boost configuration
    const boostConfigDoc = await db.collection('boostTypes').doc(boostType).get();
    
    if (!boostConfigDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Invalid boost type');
    }

    const config = boostConfigDoc.data()!;

    // If paid, process payment
    if (paid) {
      const priceInTokens = config.prices[`${durationMinutes}min`] || config.basePrice;
      
      // Check wallet balance (PACK 277 integration)
      const walletDoc = await db.collection('wallets').doc(userId).get();
      const balance = walletDoc.data()?.balance || 0;

      if (balance < priceInTokens) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Insufficient token balance'
        );
      }

      // Deduct tokens
      await db.collection('wallets').doc(userId).update({
        balance: admin.firestore.FieldValue.increment(-priceInTokens),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Log transaction
      await db.collection('walletTransactions').add({
        userId,
        type: 'boost_purchase',
        amount: -priceInTokens,
        boostType,
        durationMinutes,
        createdAt: admin.firestore.Timestamp.now(),
      });

      // Track purchase
      await db.collection('boostPurchaseHistory').add({
        userId,
        boostType,
        durationMinutes,
        price: priceInTokens,
        purchasedAt: admin.firestore.Timestamp.now(),
      });
    }

    // Create boost
    const boostId = db.collection('viralBoosts').doc().id;
    const expiresAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + durationMinutes * 60 * 1000)
    );

    await db.collection('viralBoosts').doc(boostId).set({
      boostId,
      userId,
      boostType,
      durationMinutes,
      strength: strength || 3,
      paid,
      status: 'active',
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt,
    });

    // Add to active boosts index
    await db.collection('activeBoosts').doc(userId).set({
      [boostType]: {
        boostId,
        strength: strength || 3,
        expiresAt,
      },
    }, { merge: true });

    // Track viral event
    await trackViralEvent({
      userId,
      eventType: 'boost_activated',
      loopType: 'boost_engagement',
      metadata: { boostType, durationMinutes, paid },
    });

    // Apply boost effects based on type
    await applyBoostEffects(userId, boostType, strength || 3);

    console.log('Scheduled job result:', {
      success: true,
      boostId,
      expiresAt: expiresAt.toDate().toISOString(),
    });


    return;

  } catch (error: any) {
    console.error('Error applying boost:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Expire boost (scheduled function)
 */
export const pack374_expireBoost = onSchedule("every 5 minutes", async (event) => {
    const now = admin.firestore.Timestamp.now();

    // Find expired boosts
    const expiredBoosts = await db.collection('viralBoosts')
      .where('status', '==', 'active')
      .where('expiresAt', '<=', now)
      .limit(100)
      .get();

    const batch = db.batch();

    expiredBoosts.forEach((doc) => {
      const boostData = doc.data();
      
      // Mark as expired
      batch.update(doc.ref, {
        status: 'expired',
        expiredAt: admin.firestore.Timestamp.now(),
      });

      // Remove from active boosts index
      const activeBoostRef = db.collection('activeBoosts').doc(boostData.userId);
      batch.update(activeBoostRef, {
        [boostData.boostType]: admin.firestore.FieldValue.delete(),
      });
    });

    await batch.commit();

    console.log(`Expired ${expiredBoosts.size} boosts`);
    return;
  });

// ═════════════════════════════════════════════════════════════
// 3️⃣ SOCIAL LOOPS
// ═════════════════════════════════════════════════════════════

/**
 * Track viral event for social loops
 */
async function trackViralEvent(eventData: {
  userId: string;
  eventType: string;
  targetUserId?: string;
  loopType: string;
  metadata?: any;
  completed?: boolean;
}) {
  const eventId = db.collection('viralEvents').doc().id;
  
  await db.collection('viralEvents').doc(eventId).set({
    eventId,
    userId: eventData.userId,
    eventType: eventData.eventType,
    targetUserId: eventData.targetUserId || null,
    loopType: eventData.loopType,
    metadata: eventData.metadata || {},
    completed: eventData.completed || false,
    createdAt: admin.firestore.Timestamp.now(),
  });

  return eventId;
}

/**
 * Process social loop completion
 */
export const pack374_processSocialLoop = onDocumentCreated('viralEvents/{eventId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const eventData = snap.data();

    // Check if this completes a viral loop
    if (eventData.eventType === 'profile_viewed') {
      // Send notification to trigger return (PACK 293)
      await sendViralNotification(
        eventData.targetUserId,
        'profile_view',
        {
          title: '👀 Someone viewed your profile',
          body: 'See who\'s interested in you!',
          data: { viewerUserId: eventData.userId },
        }
      );
    }

    if (eventData.eventType === 'discovery_liked') {
      // Trigger return loop
      await sendViralNotification(
        eventData.targetUserId,
        'discovery_like',
        {
          title: '❤️ New match potential!',
          body: 'Someone liked you in Discovery',
          data: { likerUserId: eventData.userId },
        }
      );
    }

    if (eventData.eventType === 'message_received') {
      // High-value loop - lead to paid conversion
      await trackViralEvent({
        userId: eventData.targetUserId,
        eventType: 'message_engagement_opportunity',
        targetUserId: eventData.userId,
        loopType: 'message_conversion',
        metadata: { parentEventId: event.params.eventId },
      });
    }

    // Update loop metrics
    await updateLoopMetrics(eventData.loopType, eventData.eventType);

    return;
  });

// ═════════════════════════════════════════════════════════════
// 4️⃣ SHARE TRACKING
// ═════════════════════════════════════════════════════════════

/**
 * Track share event
 */
export const pack374_trackShareEvent = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { shareType, shareChannel, contentId, externalPlatform } = data;
  const userId = request.auth.uid;

  try {
    // Check for spam pattern (max 10 shares per hour)
    const oneHourAgo = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 60 * 60 * 1000)
    );

    const recentShares = await db.collection('shareTracking')
      .where('userId', '==', userId)
      .where('createdAt', '>', oneHourAgo)
      .count()
      .get();

    if (recentShares.data().count >= 10) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Too many shares. Please try again later.'
      );
    }

    // Generate share tracking ID
    const shareId = db.collection('shareTracking').doc().id;
    const trackingUrl = `https://platform.app/s/${shareId}`;

    await db.collection('shareTracking').doc(shareId).set({
      shareId,
      userId,
      shareType,
      shareChannel,
      contentId: contentId || null,
      externalPlatform: externalPlatform || null,
      trackingUrl,
      converted: false,
      clicks: 0,
      installs: 0,
      revenue: 0,
      createdAt: admin.firestore.Timestamp.now(),
    });

    // Track viral event
    await trackViralEvent({
      userId,
      eventType: 'content_shared',
      loopType: 'share_loop',
      metadata: { shareType, shareChannel, shareId },
    });

    console.log('Scheduled job result:', {
      success: true,
      shareId,
      trackingUrl,
    });


    return;

  } catch (error: any) {
    console.error('Error tracking share:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Process share conversion
 */
export const pack374_processShareConversion = functions.https.onCall(async (request) => {
  const data = request.data;
  const { shareId, newUserId, revenue = 0 } = data;

  try {
    const shareDoc = await db.collection('shareTracking').doc(shareId).get();
    
    if (!shareDoc.exists) {
      console.log('Scheduled job result:', { success: false, message: 'Share not found' });

      return;
    }

    // Update share tracking
    await db.collection('shareTracking').doc(shareId).update({
      converted: true,
      convertedAt: admin.firestore.Timestamp.now(),
      newUserId,
      installs: admin.firestore.FieldValue.increment(1),
      revenue: admin.firestore.FieldValue.increment(revenue),
    });

    // Log conversion
    await db.collection('shareConversions').add({
      shareId,
      userId: shareDoc.data()!.userId,
      newUserId,
      shareChannel: shareDoc.data()!.shareChannel,
      revenueGenerated: revenue,
      convertedAt: admin.firestore.Timestamp.now(),
    });

    // Reward sharer if conversion generates revenue
    if (revenue > 0) {
      await issueReward(
        shareDoc.data()!.userId,
        'extra_swipes',
        {
          amount: 10,
          source: 'share_conversion',
          metadata: { shareId, revenue },
        }
      );
    }

    console.log('Scheduled job result:', {
      success: true,
      convertedUserId: newUserId,
    });


    return;

  } catch (error: any) {
    console.error('Error processing share conversion:', error);
    console.log('Scheduled job result:', { success: false, message: error.message });

    return;
  }
});

// ═════════════════════════════════════════════════════════════
// 5️⃣ REWARD SYSTEM
// ═════════════════════════════════════════════════════════════

/**
 * Issue reward to user
 */
async function issueReward(
  userId: string,
  rewardType: string,
  config: any
): Promise<string> {
  const rewardId = db.collection('viralRewards').doc().id;

  const rewardData: any = {
    rewardId,
    userId,
    rewardType,
    status: 'pending',
    config,
    createdAt: admin.firestore.Timestamp.now(),
  };

  // Set expiration for time-limited rewards
  if (config.durationHours) {
    rewardData.expiresAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + config.durationHours * 60 * 60 * 1000)
    );
  }

  await db.collection('viralRewards').doc(rewardId).set(rewardData);

  // Update user rewards summary
  await db.collection('userRewardsSummary').doc(userId).set({
    totalRewardsEarned: admin.firestore.FieldValue.increment(1),
    [rewardType]: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.Timestamp.now(),
  }, { merge: true });

  return rewardId;
}

/**
 * Lock reward to prevent abuse
 */
export const pack374_lockRewardAbuse = onDocumentCreated('viralRewards/{rewardId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const rewardData = snap.data();

    // Check if user has excessive rewards (fraud detection)
    const recentRewards = await db.collection('viralRewards')
      .where('userId', '==', rewardData.userId)
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(
        new Date(Date.now() - 24 * 60 * 60 * 1000)
      ))
      .count()
      .get();

    // If more than 10 rewards in 24 hours, flag for review
    if (recentRewards.data().count > 10) {
      await db.collection('viralAbuseReports').add({
        targetUserId: rewardData.userId,
        abuseType: 'excessive_rewards',
        status: 'pending_review',
        metadata: {
          rewardCount: recentRewards.data().count,
          rewardId: event.params.rewardId,
        },
        reporterUserId: 'system',
        createdAt: admin.firestore.Timestamp.now(),
      });

      // Lock the reward
      await snap.ref.update({
        status: 'locked',
        lockReason: 'suspected_abuse',
        lockedAt: admin.firestore.Timestamp.now(),
      });
    }

    return;
  });

// ═════════════════════════════════════════════════════════════
// 6️⃣ FRAUD DETECTION
// ═════════════════════════════════════════════════════════════

interface FraudCheckResult {
  isFraud: boolean;
  fraudType?: string;
  severity?: 'low' | 'medium' | 'high';
}

async function checkInviteFraud(
  inviterUserId: string,
  newUserId: string,
  deviceFingerprint: string,
  ipAddress: string
): Promise<FraudCheckResult> {
  
  // Rule 1: Same device check
  const existingFingerprint = await db.collection('deviceFingerprints')
    .where('fingerprint', '==', deviceFingerprint)
    .where('userId', '!=', newUserId)
    .limit(1)
    .get();

  if (!existingFingerprint.empty) {
    return {
      isFraud: true,
      fraudType: 'same_device_invite',
      severity: 'high',
    };
  }

  // Rule 2: IP check - multiple invites from same IP
  const recentIPInvites = await db.collection('viralInvites')
    .where('ipAddress', '==', ipAddress)
    .where('createdAt', '>', admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    ))
    .count()
    .get();

  if (recentIPInvites.data().count > 5) {
    return {
      isFraud: true,
      fraudType: 'ip_farming',
      severity: 'high',
    };
  }

  // Rule 3: Inviter pattern check - too many invites
  const inviterStats = await db.collection('userInviteStats').doc(inviterUserId).get();
  const stats = inviterStats.data();

  if (stats && stats.totalInvitesSent > 50 && stats.conversionRate < 0.1) {
    return {
      isFraud: true,
      fraudType: 'spam_invites',
      severity: 'medium',
    };
  }

  // Rule 4: New account check - suspicious timing
  const userRecord = await auth.getUser(newUserId);
  const accountAge = Date.now() - new Date(userRecord.metadata.creationTime).getTime();
  
  if (accountAge < 60 * 1000) { // Created less than 1 minute ago
    console.log('Scheduled job result:', {
      isFraud: true,
      fraudType: 'instant_account_creation',
      severity: 'medium',
    });

    return;
  }

  // Store device fingerprint
  await db.collection('deviceFingerprints').add({
    userId: newUserId,
    fingerprint: deviceFingerprint,
    ipAddress,
    lastSeen: admin.firestore.Timestamp.now(),
    createdAt: admin.firestore.Timestamp.now(),
  });

  return { isFraud: false };
}

// ═════════════════════════════════════════════════════════════
// 7️⃣ K-FACTOR ANALYTICS
// ═════════════════════════════════════════════════════════════

/**
 * Calculate viral coefficient (K-Factor)
 * Runs daily
 */
export const pack374_calculateKFactor = onSchedule({ schedule: "0 0 * * *", timeZone: "UTC" }, async (event) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const startTimestamp = admin.firestore.Timestamp.fromDate(yesterday);
    const endTimestamp = admin.firestore.Timestamp.fromDate(today);

    // Get invites sent
    const invitesSent = await db.collection('viralInvites')
      .where('createdAt', '>=', startTimestamp)
      .where('createdAt', '<', endTimestamp)
      .count()
      .get();

    // Get invites accepted
    const invitesAccepted = await db.collection('viralInvites')
      .where('createdAt', '>=', startTimestamp)
      .where('createdAt', '<', endTimestamp)
      .where('rewardStatus', '==', 'rewarded')
      .count()
      .get();

    // Get total active users
    const activeUsers = await db.collection('users')
      .where('lastActiveAt', '>=', startTimestamp)
      .count()
      .get();

    const kFactor = activeUsers.data().count > 0
      ? invitesAccepted.data().count / activeUsers.data().count
      : 0;

    const periodId = yesterday.toISOString().split('T')[0];

    await db.collection('viralCoefficients').doc(periodId).set({
      period: periodId,
      date: admin.firestore.Timestamp.fromDate(yesterday),
      invitesSent: invitesSent.data().count,
      invitesAccepted: invitesAccepted.data().count,
      activeUsers: activeUsers.data().count,
      kFactor,
      calculatedAt: admin.firestore.Timestamp.now(),
    });

    console.log(`K-Factor for ${periodId}: ${kFactor.toFixed(4)}`);
    return;
  });

// ═════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═════════════════════════════════════════════════════════════

function generateUniqueCode(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  const bytes = crypto.randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    code += chars[bytes[i] % chars.length];
  }
  
  return code;
}

async function applyBoostEffects(
  userId: string,
  boostType: string,
  strength: number
): Promise<void> {
  // Boost effects are applied in the feed algorithm (PACK 323)
  // This function creates the necessary metadata
  
  const effects: any = {
    discoveryMultiplier: 1.0,
    feedPriority: 0,
    visibilityScore: 0,
  };

  switch (boostType) {
    case 'profile':
      effects.discoveryMultiplier = 1.5 + (strength * 0.1);
      effects.feedPriority = strength * 10;
      break;
    case 'story':
      effects.feedPriority = strength * 15;
      break;
    case 'earner':
      effects.visibilityScore = strength * 5;
      break;
    case 'local':
      effects.discoveryMultiplier = 2.0 + (strength * 0.2);
      break;
  }

  await db.collection('users').doc(userId).update({
    [`boostEffects.${boostType}`]: effects,
    'boostEffects.updatedAt': admin.firestore.Timestamp.now(),
  });
}

async function sendViralNotification(
  userId: string,
  type: string,
  notification: {
    title: string;
    body: string;
    data?: any;
  }
): Promise<void> {
  // Integration with PACK 293 notifications
  await db.collection('viralNotificationsQueue').add({
    userId,
    type,
    notification,
    processed: false,
    createdAt: admin.firestore.Timestamp.now(),
  });
}

async function scheduleRewardCheck(
  inviteId: string,
  inviterUserId: string,
  newUserId: string
): Promise<void> {
  // Schedule check for 7 days from now
  const checkDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  
  await db.collection('scheduledTasks').add({
    taskType: 'check_invite_conversion',
    inviteId,
    inviterUserId,
    newUserId,
    scheduledFor: admin.firestore.Timestamp.fromDate(checkDate),
    status: 'pending',
    createdAt: admin.firestore.Timestamp.now(),
  });
}

async function updateLoopMetrics(
  loopType: string,
  eventType: string
): Promise<void> {
  const hour = new Date();
  hour.setMinutes(0, 0, 0);
  const metricId = `${loopType}_${hour.toISOString()}`;

  await db.collection('viralLoopMetrics').doc(metricId).set({
    loopType,
    period: admin.firestore.Timestamp.fromDate(hour),
    [`events.${eventType}`]: admin.firestore.FieldValue.increment(1),
    totalEvents: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.Timestamp.now(),
  }, { merge: true });
}

























