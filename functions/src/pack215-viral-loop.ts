/**
 * PACK 215: Viral Loop Engine
 * 
 * Self-reinforcing growth loop:
 * Active Users → Invites → New Users → Attention → Attraction → Paid Activity → More Active Users
 * 
 * KEY RULES:
 * - NO financial rewards (tokens, coins, cash)
 * - Only social/visibility rewards allowed
 * - Selfie verification required before rewards
 * - Integration with PACK 211 (safety checks)
 * - Integration with PACK 212 (vibe patterns)
 * - Integration with PACK 213 (match priority)
 * - Integration with PACK 214 (return triggers)
 */

import * as functions from 'firebase-functions';
import { db, admin, generateId } from './init';

// =====================================================
// TYPES
// =====================================================

type RewardType = 
  | 'spotlight'              // 24h Discovery spotlight
  | 'priority_matching'      // Priority match boost
  | 'message_extension'      // 1 free message extension
  | 'fans_zone_badge'        // Social proof badge
  | 'chemistry_reveal'       // Chemistry match reveal (for payers)
  | 'strong_profile_badge'   // Strong profile badge (for payers)
  | 'attraction_magnet';     // Attraction magnet badge (for creators)

interface ViralReward {
  user_id: string;
  reward_type: RewardType;
  source: 'referral' | 'audience_import' | 'viral_moment';
  created_at: admin.firestore.Timestamp;
  expires_at: admin.firestore.Timestamp;
  claimed: boolean;
  claimed_at?: admin.firestore.Timestamp;
  metadata: {
    milestone?: string;
    count?: number;
    referral_id?: string;
  };
}

interface SocialProofEvent {
  target_user_id: string;
  event_type: 'wishlist_add' | 'meeting_booked' | 'discovery_boost' | 'high_activity';
  source_user_ids: string[];
  message: string;
  created_at: admin.firestore.Timestamp;
  read: boolean;
  read_at?: admin.firestore.Timestamp;
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Generate unique referral link code
 */
function generateLinkCode(): string {
  // Use Firebase's auto-generated ID and take first 10 chars
  return generateId().substring(0, 10).toUpperCase();
}

/**
 * Check if user has completed selfie verification
 */
async function hasSelfieVerification(userId: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  return userDoc.exists && userDoc.data()?.selfieVerified === true;
}

/**
 * Check if user is safety approved (PACK 211 integration)
 */
async function isSafetyApproved(userId: string): Promise<boolean> {
  const safetyDoc = await db.collection('safety_tracking').doc(userId).get();
  
  if (!safetyDoc.exists) return true;
  
  const data = safetyDoc.data();
  return !data?.stalker_flag && !data?.harassment_flag;
}

/**
 * Check if user has good vibe patterns (PACK 212 integration)
 */
async function hasGoodVibePattern(userId: string): Promise<boolean> {
  const reputationDoc = await db.collection('reputation_scores').doc(userId).get();
  
  if (!reputationDoc.exists) return true;
  
  const data = reputationDoc.data();
  return (data?.vibe_score || 0) >= 0.6;
}

/**
 * Grant non-financial viral reward
 */
async function grantViralReward(
  userId: string,
  rewardType: RewardType,
  source: 'referral' | 'audience_import' | 'viral_moment',
  metadata: any = {}
): Promise<void> {
  // Safety check
  if (!await isSafetyApproved(userId)) {
    console.log(`User ${userId} not safety approved, skipping reward`);
    return;
  }

  const reward: ViralReward = {
    user_id: userId,
    reward_type: rewardType,
    source,
    created_at: admin.firestore.Timestamp.now(),
    expires_at: admin.firestore.Timestamp.fromMillis(
      Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
    ),
    claimed: false,
    metadata
  };

  await db.collection('viral_rewards').add(reward);
  
  console.log(`Granted ${rewardType} reward to user ${userId}`);
}

/**
 * Create social proof notification
 */
async function createSocialProofEvent(
  targetUserId: string,
  eventType: SocialProofEvent['event_type'],
  sourceUserIds: string[],
  message: string
): Promise<void> {
  const event: SocialProofEvent = {
    target_user_id: targetUserId,
    event_type: eventType,
    source_user_ids: sourceUserIds,
    message,
    created_at: admin.firestore.Timestamp.now(),
    read: false
  };

  await db.collection('social_proof_events').add(event);
  
  // Send push notification
  await sendPushNotification(targetUserId, message);
}

/**
 * Send push notification
 */
async function sendPushNotification(userId: string, message: string): Promise<void> {
  const userDoc = await db.collection('users').doc(userId).get();
  const fcmToken = userDoc.data()?.fcmToken;
  
  if (!fcmToken) return;
  
  await admin.messaging().send({
    token: fcmToken,
    notification: {
      title: '🔥 Viral Moment',
      body: message
    },
    data: {
      type: 'viral_social_proof',
      userId
    }
  });
}

/**
 * Update viral stats for user
 */
async function updateViralStats(userId: string, updates: any): Promise<void> {
  const statsRef = db.collection('viral_stats').doc(userId);
  
  await statsRef.set({
    ...updates,
    updated_at: admin.firestore.Timestamp.now()
  }, { merge: true });
}

/**
 * Boost user in PACK 213 match priority
 */
async function boostMatchPriority(userId: string, duration: number): Promise<void> {
  await db.collection('match_priority_boosts').add({
    user_id: userId,
    boost_type: 'viral_reward',
    boost_factor: 1.5,
    created_at: admin.firestore.Timestamp.now(),
    expires_at: admin.firestore.Timestamp.fromMillis(Date.now() + duration),
    active: true
  });
}

/**
 * Award viral badge
 */
async function awardBadge(userId: string, badgeType: string, metadata: any = {}): Promise<void> {
  await db.collection('viral_badges').add({
    user_id: userId,
    badge_type: badgeType,
    awarded_at: admin.firestore.Timestamp.now(),
    active: true,
    metadata
  });
  
  // Update user profile to include badge
  await db.collection('users').doc(userId).update({
    [`badges.${badgeType}`]: true
  });
}

// =====================================================
// CLOUD FUNCTIONS
// =====================================================

/**
 * Generate unique referral link
 */
export const generateReferralLink = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  // Check safety approval
  if (!await isSafetyApproved(userId)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'User not approved for referral program'
    );
  }

  // Generate unique code
  const linkCode = generateLinkCode();
  const link = `https://avalo.app/invite/${linkCode}`;

  // Create referral link document
  await db.collection('referral_links').add({
    inviter_id: userId,
    link_code: linkCode,
    link_url: link,
    created_at: admin.firestore.Timestamp.now(),
    status: 'active',
    total_clicks: 0,
    total_installs: 0,
    total_verified: 0
  });

  return { link, code: linkCode };
});

/**
 * Track referral when new user signs up
 */
export const onUserCreated = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap, context) => {
    const userId = context.params.userId;
    const userData = snap.data();
    const referralCode = userData.referralCode;

    if (!referralCode) return;

    // Find the referral link
    const linkQuery = await db.collection('referral_links')
      .where('link_code', '==', referralCode)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (linkQuery.empty) {
      console.log(`No active referral link found for code ${referralCode}`);
      return;
    }

    const linkDoc = linkQuery.docs[0];
    const inviterId = linkDoc.data().inviter_id;

    // Create tracking document
    const trackingRef = await db.collection('referral_tracking').add({
      inviter_id: inviterId,
      invited_user_id: userId,
      referral_code: referralCode,
      created_at: admin.firestore.Timestamp.now(),
      status: 'pending_verification',
      selfie_verified: false,
      reward_granted: false
    });

    // Update link stats
    await linkDoc.ref.update({
      total_installs: admin.firestore.FieldValue.increment(1)
    });

    // Create invited user record
    await db.collection('invited_users').doc(userId).set({
      inviter_id: inviterId,
      joined_at: admin.firestore.Timestamp.now(),
      selfie_verified: false,
      boost_active: false,
      referral_tracking_id: trackingRef.id
    });

    // Grant 48h boosted visibility to new user
    await boostMatchPriority(userId, 48 * 60 * 60 * 1000);

    console.log(`User ${userId} referred by ${inviterId}`);
  });

/**
 * Process selfie verification and grant rewards
 */
export const onSelfieVerified = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const userId = context.params.userId;
    const before = change.before.data();
    const after = change.after.data();

    // Check if selfie verification just completed
    if (before.selfieVerified || !after.selfieVerified) return;

    console.log(`Selfie verified for user ${userId}`);

    // Check if this is a referred user
    const invitedUserDoc = await db.collection('invited_users').doc(userId).get();
    
    if (!invitedUserDoc.exists) return;

    const invitedData = invitedUserDoc.data();
    const inviterId = invitedData?.inviter_id;
    const trackingId = invitedData?.referral_tracking_id;

    if (!inviterId || !trackingId) return;

    // Update tracking
    await db.collection('referral_tracking').doc(trackingId).update({
      selfie_verified: true,
      verified_at: admin.firestore.Timestamp.now(),
      status: 'verified'
    });

    // Update invited user record
    await invitedUserDoc.ref.update({
      selfie_verified: true,
      verified_at: admin.firestore.Timestamp.now()
    });

    // Count total verified referrals for inviter
    const verifiedCount = await db.collection('referral_tracking')
      .where('inviter_id', '==', inviterId)
      .where('selfie_verified', '==', true)
      .count()
      .get();

    const count = verifiedCount.data().count;

    // Grant rewards based on milestones
    if (count === 1) {
      // First referral: Spotlight
      await grantViralReward(inviterId, 'spotlight', 'referral', { milestone: 'first_referral' });
    } else if (count === 3) {
      // 3 referrals: Priority matching
      await grantViralReward(inviterId, 'priority_matching', 'referral', { milestone: '3_referrals' });
    } else if (count === 5) {
      // 5 referrals: Fans Zone badge
      await awardBadge(inviterId, 'fans_zone', { referral_count: 5 });
    } else if (count === 10) {
      // 10 referrals: Message extension
      await grantViralReward(inviterId, 'message_extension', 'referral', { milestone: '10_referrals' });
    }

    // Update inviter's viral stats
    await updateViralStats(inviterId, {
      total_invites: admin.firestore.FieldValue.increment(1),
      verified_invites: count
    });

    // Mark reward as granted
    await db.collection('referral_tracking').doc(trackingId).update({
      reward_granted: true,
      reward_granted_at: admin.firestore.Timestamp.now()
    });

    // Update referral link stats
    const linkQuery = await db.collection('referral_links')
      .where('inviter_id', '==', inviterId)
      .limit(1)
      .get();

    if (!linkQuery.empty) {
      await linkQuery.docs[0].ref.update({
        total_verified: admin.firestore.FieldValue.increment(1)
      });
    }

    console.log(`Granted rewards to inviter ${inviterId} for ${count} verified referrals`);
  });

/**
 * Track social proof moments (wishlist adds)
 */
export const onWishlistAdd = functions.firestore
  .document('wishlists/{wishlistId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const targetUserId = data.target_user_id;
    const sourceUserId = data.user_id;

    // Check if target user is an inviter
    const invitedQuery = await db.collection('invited_users')
      .where('inviter_id', '==', targetUserId)
      .where('selfie_verified', '==', true)
      .limit(5)
      .get();

    if (invitedQuery.empty) return;

    // Check if source user was invited by target
    const sourceInvited = invitedQuery.docs.find(doc => doc.id === sourceUserId);
    
    if (sourceInvited) {
      // Count recent wishlist adds from invited users
      const recentAdds = await db.collection('wishlists')
        .where('target_user_id', '==', targetUserId)
        .where('created_at', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
        .get();

      const invitedUserIds = new Set(invitedQuery.docs.map(doc => doc.id));
      const invitedAdds = recentAdds.docs.filter(doc => invitedUserIds.has(doc.data().user_id));

      if (invitedAdds.length >= 3) {
        // Create social proof event
        await createSocialProofEvent(
          targetUserId,
          'wishlist_add',
          invitedAdds.map(doc => doc.data().user_id),
          `${invitedAdds.length} people you brought to Avalo added you to wishlist`
        );
      }
    }
  });

/**
 * Track social proof moments (meetings booked)
 */
export const onMeetingBooked = functions.firestore
  .document('meetings/{meetingId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const creatorUserId = data.creator_user_id;
    const bookerUserId = data.user_id;

    // Check if booker was invited by creator
    const invitedDoc = await db.collection('invited_users').doc(bookerUserId).get();
    
    if (!invitedDoc.exists) return;
    
    const invitedData = invitedDoc.data();
    if (invitedData?.inviter_id !== creatorUserId) return;

    // Create social proof event
    await createSocialProofEvent(
      creatorUserId,
      'meeting_booked',
      [bookerUserId],
      'Someone you invited just booked a meeting — you\'re getting popular'
    );

    // Boost creator's visibility (PACK 213 integration)
    await boostMatchPriority(creatorUserId, 24 * 60 * 60 * 1000);
  });

/**
 * Process audience import for creators
 */
export const processAudienceImport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { platform, followerCount } = data;

  if (!['instagram', 'tiktok', 'telegram', 'snapchat'].includes(platform)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid platform');
  }

  // Check if user is a creator/earner
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  if (!userData?.earningsEnabled) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only creators with earnings enabled can import audience'
    );
  }

  // Create import tracking
  await db.collection('audience_imports').add({
    creator_id: userId,
    platform,
    follower_count: followerCount,
    created_at: admin.firestore.Timestamp.now(),
    status: 'pending'
  });

  // Grant rewards based on follower milestones
  if (followerCount >= 100) {
    await grantViralReward(userId, 'spotlight', 'audience_import', { platform, count: followerCount });
    await awardBadge(userId, 'attraction_magnet', { platform, follower_count: followerCount });
  } else if (followerCount >= 25) {
    await awardBadge(userId, 'attraction_magnet', { platform, follower_count: followerCount });
  } else if (followerCount >= 10) {
    await grantViralReward(userId, 'priority_matching', 'audience_import', { platform, count: followerCount });
  } else if (followerCount >= 5) {
    await grantViralReward(userId, 'spotlight', 'audience_import', { platform, count: followerCount });
  }

  return { success: true, message: 'Audience import processed' };
});

/**
 * Process viral moment for payers (men)
 */
export const processPayerViralMoment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  // Check if user has spending history
  const spendingQuery = await db.collection('transactions')
    .where('user_id', '==', userId)
    .where('type', '==', 'payment')
    .where('status', '==', 'completed')
    .limit(1)
    .get();

  if (spendingQuery.empty) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only active payers can access viral moments'
    );
  }

  // Count friends who installed
  const friendsInstalled = await db.collection('invited_users')
    .where('inviter_id', '==', userId)
    .where('selfie_verified', '==', true)
    .count()
    .get();

  const count = friendsInstalled.data().count;

  if (count === 1) {
    // First friend: Chemistry match reveal
    await grantViralReward(userId, 'chemistry_reveal', 'viral_moment', { milestone: 'first_friend' });
  } else if (count >= 3) {
    // 3+ friends: Strong profile badge + boosted exposure
    await awardBadge(userId, 'strong_profile_badge', { friend_count: count });
    await boostMatchPriority(userId, 7 * 24 * 60 * 60 * 1000); // 7 days
  }

  return { success: true, friendCount: count };
});

/**
 * Claim viral reward
 */
export const claimViralReward = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { rewardId } = data;

  const rewardDoc = await db.collection('viral_rewards').doc(rewardId).get();
  
  if (!rewardDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Reward not found');
  }

  const reward = rewardDoc.data() as ViralReward;

  if (reward.user_id !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your reward');
  }

  if (reward.claimed) {
    throw new functions.https.HttpsError('already-exists', 'Reward already claimed');
  }

  if (reward.expires_at.toMillis() < Date.now()) {
    throw new functions.https.HttpsError('deadline-exceeded', 'Reward expired');
  }

  // Apply the reward based on type
  switch (reward.reward_type) {
    case 'spotlight':
      await boostMatchPriority(userId, 24 * 60 * 60 * 1000);
      break;
    
    case 'priority_matching':
      await boostMatchPriority(userId, 7 * 24 * 60 * 60 * 1000);
      break;
    
    case 'message_extension':
      await db.collection('users').doc(userId).update({
        free_message_extensions: admin.firestore.FieldValue.increment(1)
      });
      break;
    
    case 'chemistry_reveal':
      // Grant access to reveal one high-potential match
      await db.collection('users').doc(userId).update({
        chemistry_reveals_available: admin.firestore.FieldValue.increment(1)
      });
      break;
  }

  // Mark as claimed
  await rewardDoc.ref.update({
    claimed: true,
    claimed_at: admin.firestore.Timestamp.now()
  });

  // Trigger PACK 214 return engagement
  await db.collection('return_triggers').add({
    user_id: userId,
    trigger_type: 'viral_reward_claimed',
    trigger_data: { reward_type: reward.reward_type },
    created_at: admin.firestore.Timestamp.now(),
    processed: false
  });

  return { success: true, rewardType: reward.reward_type };
});

/**
 * Daily viral metrics aggregation
 */
export const aggregateViralMetrics = functions.pubsub
  .schedule('0 2 * * *') // 2 AM daily
  .timeZone('UTC')
  .onRun(async (context) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Calculate viral metrics
    const newInvites = await db.collection('referral_tracking')
      .where('created_at', '>=', admin.firestore.Timestamp.fromDate(yesterday))
      .where('created_at', '<', admin.firestore.Timestamp.fromDate(todayStart))
      .count()
      .get();

    const verifiedInvites = await db.collection('referral_tracking')
      .where('verified_at', '>=', admin.firestore.Timestamp.fromDate(yesterday))
      .where('verified_at', '<', admin.firestore.Timestamp.fromDate(todayStart))
      .count()
      .get();

    const rewardsClaimed = await db.collection('viral_rewards')
      .where('claimed_at', '>=', admin.firestore.Timestamp.fromDate(yesterday))
      .where('claimed_at', '<', admin.firestore.Timestamp.fromDate(todayStart))
      .count()
      .get();

    // Store metrics
    await db.collection('viral_metrics').add({
      date: admin.firestore.Timestamp.fromDate(yesterday),
      new_invites: newInvites.data().count,
      verified_invites: verifiedInvites.data().count,
      rewards_claimed: rewardsClaimed.data().count,
      created_at: admin.firestore.Timestamp.now()
    });

    console.log(`Viral metrics aggregated for ${yesterday.toISOString().split('T')[0]}`);
  });