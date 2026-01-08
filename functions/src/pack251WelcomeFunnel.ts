/**
 * PACK 251 — Welcome Funnel for New Users
 * 
 * Converts "Curious → Paying" in <48 hours through a 3-phase activation funnel.
 * 
 * Phase 1 (0-2h): Instant validation - auto-likes, guaranteed match
 * Phase 2 (2-24h): Emotional investment - visibility boost, notifications
 * Phase 3 (24-48h): Conversion - smooth paywall with urgency
 * 
 * CRITICAL: NO free tokens, NO discounts, NO modified tokenomics
 * Only increases likelihood users WANT to pay through psychological engagement
 */

import { db, serverTimestamp, increment, generateId, arrayUnion } from './init.js';
import { getUserContext } from './chatMonetization.js';

// ============================================================================
// TYPES
// ============================================================================

export type FunnelPhase = 'PHASE_1_VALIDATION' | 'PHASE_2_INVESTMENT' | 'PHASE_3_CONVERSION' | 'COMPLETED';

export type UserCategory = 'MEN' | 'WOMEN' | 'NONBINARY' | 'POTENTIAL_CREATOR';

export interface WelcomeFunnelState {
  userId: string;
  startedAt: number;
  currentPhase: FunnelPhase;
  userCategory: UserCategory;
  
  // Phase 1: Instant validation (0-2h)
  phase1: {
    autoLikesReceived: number;
    guaranteedMatchUserId?: string;
    firstMessageSent: boolean;
    completedAt?: number;
  };
  
  // Phase 2: Emotional investment (2-24h)
  phase2: {
    visibilityBoostActive: boolean;
    visibilityBoostEndsAt?: number;
    trendingBadgeActive: boolean;
    profileViewNotificationsSent: number;
    priorityInboxActive: boolean;
    completedAt?: number;
  };
  
  // Phase 3: Conversion (24-48h)
  phase3: {
    conversionMomentTriggered: boolean;
    paymentCompleted: boolean;
    completedAt?: number;
  };
  
  // Gamification rewards (NO tokens)
  gamification: {
    photoUploadedCount: number;
    bioCompleted: boolean;
    profileVerified: boolean;
    interestsAdded: boolean;
  };
  
  // Analytics
  analytics: {
    totalProfileViews: number;
    totalLikesReceived: number;
    totalMatchesCreated: number;
    totalMessagesSent: number;
    totalMessagesReceived: number;
    firstDepositAt?: number;
    firstDepositAmount?: number;
    convertedToPaying: boolean;
    conversionTimeHours?: number;
  };
  
  updatedAt: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PHASE_1_DURATION_HOURS = 2;
const PHASE_2_DURATION_HOURS = 22; // 2-24h
const PHASE_3_DURATION_HOURS = 24; // 24-48h

const AUTO_LIKES_COUNT = {
  MEN: 5,
  WOMEN: 3,
  NONBINARY: 4,
  POTENTIAL_CREATOR: 5
};

const VISIBILITY_BOOST_DURATION_HOURS = 12;

// ============================================================================
// FUNNEL INITIALIZATION
// ============================================================================

/**
 * Initialize welcome funnel for new user
 * Called immediately after registration
 */
export async function initializeWelcomeFunnel(
  userId: string,
  gender: 'male' | 'female' | 'other',
  hasCreatorIntent: boolean = false
): Promise<void> {
  
  // Determine user category for personalization
  const userCategory = categorizeUser(gender, hasCreatorIntent);
  
  const now = Date.now();
  
  const funnelState: WelcomeFunnelState = {
    userId,
    startedAt: now,
    currentPhase: 'PHASE_1_VALIDATION',
    userCategory,
    
    phase1: {
      autoLikesReceived: 0,
      firstMessageSent: false
    },
    
    phase2: {
      visibilityBoostActive: false,
      trendingBadgeActive: false,
      profileViewNotificationsSent: 0,
      priorityInboxActive: false
    },
    
    phase3: {
      conversionMomentTriggered: false,
      paymentCompleted: false
    },
    
    gamification: {
      photoUploadedCount: 0,
      bioCompleted: false,
      profileVerified: false,
      interestsAdded: false
    },
    
    analytics: {
      totalProfileViews: 0,
      totalLikesReceived: 0,
      totalMatchesCreated: 0,
      totalMessagesSent: 0,
      totalMessagesReceived: 0,
      convertedToPaying: false
    },
    
    updatedAt: now
  };
  
  await db.collection('welcome_funnels').doc(userId).set(funnelState);
  
  // Trigger Phase 1 immediately
  await triggerPhase1Validation(userId, userCategory);
}

/**
 * Categorize user for personalized funnel optimization
 */
function categorizeUser(gender: 'male' | 'female' | 'other', hasCreatorIntent: boolean): UserCategory {
  if (hasCreatorIntent) return 'POTENTIAL_CREATOR';
  if (gender === 'male') return 'MEN';
  if (gender === 'female') return 'WOMEN';
  return 'NONBINARY';
}

// ============================================================================
// PHASE 1: INSTANT VALIDATION (0-2h)
// ============================================================================

/**
 * Phase 1: Generate instant likes and guaranteed match
 * Purpose: User feels "Avalo is working for me"
 */
async function triggerPhase1Validation(userId: string, userCategory: UserCategory): Promise<void> {
  
  const autoLikesCount = AUTO_LIKES_COUNT[userCategory];
  
  // Find compatible users to generate likes from
  const compatibleUsers = await findCompatibleUsers(userId, autoLikesCount + 1);
  
  if (compatibleUsers.length === 0) {
    console.warn(`No compatible users found for ${userId} in Phase 1`);
    return;
  }
  
  // Create auto-likes from compatible users
  const likePromises = compatibleUsers.slice(0, autoLikesCount).map(async (compatibleUserId) => {
    await createAutoLike(compatibleUserId, userId);
  });
  
  await Promise.all(likePromises);
  
  // Create guaranteed match with most compatible user
  const guaranteedMatchUserId = compatibleUsers[0];
  await createGuaranteedMatch(userId, guaranteedMatchUserId);
  
  // Update funnel state
  await db.collection('welcome_funnels').doc(userId).update({
    'phase1.autoLikesReceived': autoLikesCount,
    'phase1.guaranteedMatchUserId': guaranteedMatchUserId,
    'analytics.totalLikesReceived': increment(autoLikesCount),
    'analytics.totalMatchesCreated': increment(1),
    updatedAt: serverTimestamp()
  });
  
  // Send notification: "You have new matches!"
  await sendNotification(userId, {
    type: 'NEW_MATCHES',
    title: `${autoLikesCount} people liked you!`,
    body: 'Start chatting now',
    data: { matchUserId: guaranteedMatchUserId }
  });
}

/**
 * Find compatible users algorithmically (not random)
 * Takes into account preferences, location, age, etc.
 */
async function findCompatibleUsers(userId: string, limit: number): Promise<string[]> {
  
  // Get user profile
  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) return [];
  
  const user = userSnap.data()!;
  const userGender = user.gender;
  const userPreferences = user.preferences || {};
  
  // Query for compatible users based on preferences
  let query = db.collection('users')
    .where('uid', '!=', userId)
    .where('accountStatus', '==', 'active')
    .limit(limit * 5); // Get more than needed for filtering
  
  // Add gender preference filter if set
  if (userPreferences.interestedInGender) {
    query = query.where('gender', '==', userPreferences.interestedInGender);
  }
  
  const usersSnapshot = await query.get();
  
  const compatibleUserIds: string[] = [];
  
  for (const doc of usersSnapshot.docs) {
    const potentialMatch = doc.data();
    
    // Check if they're interested in user's gender
    const theirPreferences = potentialMatch.preferences || {};
    if (theirPreferences.interestedInGender && theirPreferences.interestedInGender !== userGender) {
      continue;
    }
    
    // Check age range compatibility
    if (userPreferences.ageRange && potentialMatch.age) {
      const { min, max } = userPreferences.ageRange;
      if (potentialMatch.age < min || potentialMatch.age > max) {
        continue;
      }
    }
    
    compatibleUserIds.push(potentialMatch.uid);
    
    if (compatibleUserIds.length >= limit) break;
  }
  
  return compatibleUserIds;
}

/**
 * Create an auto-like from one user to another
 */
async function createAutoLike(fromUserId: string, toUserId: string): Promise<void> {
  const likeId = generateId();
  
  await db.collection('likes').doc(likeId).set({
    likeId,
    fromUserId,
    toUserId,
    isAutoGenerated: true, // Mark as system-generated
    createdAt: serverTimestamp()
  });
}

/**
 * Create a guaranteed match between two users
 */
async function createGuaranteedMatch(userId: string, matchUserId: string): Promise<void> {
  const matchId = generateId();
  
  await db.collection('matches').doc(matchId).set({
    matchId,
    participants: [userId, matchUserId],
    isWelcomeFunnelMatch: true, // Mark for special handling
    createdAt: serverTimestamp(),
    lastActivityAt: serverTimestamp()
  });
  
  // Add to both users' match lists
  await db.collection('users').doc(userId).update({
    matches: arrayUnion(matchId)
  });
  
  await db.collection('users').doc(matchUserId).update({
    matches: arrayUnion(matchId)
  });
}

// ============================================================================
// PHASE 2: EMOTIONAL INVESTMENT (2-24h)
// ============================================================================

/**
 * Phase 2: Activate visibility boost and engagement features
 * Purpose: User gets hooked on social response
 */
export async function triggerPhase2Investment(userId: string): Promise<void> {
  
  const now = Date.now();
  const boostEndsAt = now + (VISIBILITY_BOOST_DURATION_HOURS * 60 * 60 * 1000);
  
  // Activate visibility boost
  await db.collection('users').doc(userId).update({
    'visibilityBoost': {
      active: true,
      multiplier: 3.0, // 3x visibility
      endsAt: new Date(boostEndsAt),
      source: 'welcome_funnel'
    },
    'badges.trending': true, // Add "New and Trending" badge
    updatedAt: serverTimestamp()
  });
  
  // Update funnel state
  await db.collection('welcome_funnels').doc(userId).update({
    currentPhase: 'PHASE_2_INVESTMENT',
    'phase1.completedAt': now,
    'phase2.visibilityBoostActive': true,
    'phase2.visibilityBoostEndsAt': boostEndsAt,
    'phase2.trendingBadgeActive': true,
    'phase2.priorityInboxActive': true,
    updatedAt: serverTimestamp()
  });
  
  // Send notification
  await sendNotification(userId, {
    type: 'VISIBILITY_BOOST',
    title: 'Your profile is boosted!',
    body: `You'll appear first for the next ${VISIBILITY_BOOST_DURATION_HOURS} hours`,
    data: { boostEndsAt: boostEndsAt.toString() }
  });
}

/**
 * Handle profile view and send notification if >5 seconds
 */
export async function trackProfileView(viewerId: string, viewedUserId: string, durationSeconds: number): Promise<void> {
  
  // Check if viewed user is in welcome funnel Phase 2
  const funnelSnap = await db.collection('welcome_funnels').doc(viewedUserId).get();
  
  if (!funnelSnap.exists) return;
  
  const funnel = funnelSnap.data() as WelcomeFunnelState;
  
  // Update analytics
  await db.collection('welcome_funnels').doc(viewedUserId).update({
    'analytics.totalProfileViews': increment(1),
    updatedAt: serverTimestamp()
  });
  
  // If in Phase 2 and view duration >5s, send notification
  if (funnel.currentPhase === 'PHASE_2_INVESTMENT' && durationSeconds > 5) {
    
    // Get viewer profile for notification
    const viewerSnap = await db.collection('users').doc(viewerId).get();
    const viewerName = viewerSnap.exists ? viewerSnap.data()!.displayName : 'Someone';
    
    await sendNotification(viewedUserId, {
      type: 'PROFILE_VIEW',
      title: `${viewerName} is checking you out`,
      body: 'They viewed your profile for a while 👀',
      data: { viewerId }
    });
    
    await db.collection('welcome_funnels').doc(viewedUserId).update({
      'phase2.profileViewNotificationsSent': increment(1),
      updatedAt: serverTimestamp()
    });
  }
}

// ============================================================================
// PHASE 3: CONVERSION MOMENT (24-48h)
// ============================================================================

/**
 * Phase 3: Trigger conversion moment when free messages run out
 * Purpose: "I don't want to lose this connection"
 */
export async function triggerPhase3Conversion(userId: string, chatId: string, partnerUserId: string): Promise<void> {
  
  const now = Date.now();
  
  // Get partner's name for personalization
  const partnerSnap = await db.collection('users').doc(partnerUserId).get();
  const partnerName = partnerSnap.exists ? partnerSnap.data()!.displayName : 'them';
  
  // Update funnel state
  await db.collection('welcome_funnels').doc(userId).update({
    currentPhase: 'PHASE_3_CONVERSION',
    'phase2.completedAt': now,
    'phase3.conversionMomentTriggered': true,
    updatedAt: serverTimestamp()
  });
  
  // Return special conversion UI data
  // Frontend will show: "Continue the conversation — {partnerName} is waiting"
  // NO message like "You must pay" - seamless UX
}

/**
 * Track when user completes first payment (conversion success)
 */
export async function trackFunnelConversion(userId: string, depositAmount: number): Promise<void> {
  
  const funnelSnap = await db.collection('welcome_funnels').doc(userId).get();
  if (!funnelSnap.exists) return;
  
  const funnel = funnelSnap.data() as WelcomeFunnelState;
  const now = Date.now();
  const conversionTimeHours = (now - funnel.startedAt) / (1000 * 60 * 60);
  
  await db.collection('welcome_funnels').doc(userId).update({
    currentPhase: 'COMPLETED',
    'phase3.paymentCompleted': true,
    'phase3.completedAt': now,
    'analytics.firstDepositAt': now,
    'analytics.firstDepositAmount': depositAmount,
    'analytics.convertedToPaying': true,
    'analytics.conversionTimeHours': conversionTimeHours,
    updatedAt: serverTimestamp()
  });
  
  // Track conversion in analytics
  await db.collection('funnel_conversions').add({
    userId,
    userCategory: funnel.userCategory,
    conversionTimeHours,
    depositAmount,
    phase1LikesReceived: funnel.phase1.autoLikesReceived,
    phase2ProfileViews: funnel.analytics.totalProfileViews,
    totalMessagesBeforeConversion: funnel.analytics.totalMessagesSent + funnel.analytics.totalMessagesReceived,
    convertedAt: serverTimestamp()
  });
}

// ============================================================================
// GAMIFICATION BOOSTERS (NO TOKENS)
// ============================================================================

/**
 * Track gamification actions and grant visibility rewards
 * NO tokens given - only visibility/engagement boosts
 */
export async function trackGamificationAction(
  userId: string,
  action: 'PHOTO_UPLOAD' | 'BIO_COMPLETE' | 'PROFILE_VERIFY' | 'INTERESTS_ADD'
): Promise<{ reward: string; description: string } | null> {
  
  const funnelSnap = await db.collection('welcome_funnels').doc(userId).get();
  if (!funnelSnap.exists) return null;
  
  const funnel = funnelSnap.data() as WelcomeFunnelState;
  let reward: { reward: string; description: string } | null = null;
  
  switch (action) {
    case 'PHOTO_UPLOAD':
      if (funnel.gamification.photoUploadedCount === 1) {
        // Second photo uploaded
        reward = {
          reward: 'Visibility unlocked for 1 hour',
          description: 'Your profile will appear more in discovery'
        };
        
        // Grant 1-hour visibility boost
        await grantTemporaryVisibilityBoost(userId, 1);
      }
      
      await db.collection('welcome_funnels').doc(userId).update({
        'gamification.photoUploadedCount': increment(1),
        updatedAt: serverTimestamp()
      });
      break;
      
    case 'BIO_COMPLETE':
      reward = {
        reward: 'Profile push + targeted visibility',
        description: 'You\'ll be shown to your best matches'
      };
      
      await db.collection('welcome_funnels').doc(userId).update({
        'gamification.bioCompleted': true,
        updatedAt: serverTimestamp()
      });
      
      // Add to "Featured Profiles" for 2 hours
      await addToFeaturedProfiles(userId, 2);
      break;
      
    case 'PROFILE_VERIFY':
      reward = {
        reward: 'Top of discovery for 2 hours',
        description: 'Verified profiles get priority placement'
      };
      
      await db.collection('welcome_funnels').doc(userId).update({
        'gamification.profileVerified': true,
        updatedAt: serverTimestamp()
      });
      
      await grantTemporaryVisibilityBoost(userId, 2, 5.0); // 5x boost for 2h
      break;
      
    case 'INTERESTS_ADD':
      reward = {
        reward: 'Better matches double speed',
        description: 'Algorithm will find your perfect matches faster'
      };
      
      await db.collection('welcome_funnels').doc(userId).update({
        'gamification.interestsAdded': true,
        updatedAt: serverTimestamp()
      });
      
      // Enable enhanced matching algorithm
      await db.collection('users').doc(userId).update({
        'matchingPreferences.enhancedAlgorithm': true
      });
      break;
  }
  
  if (reward) {
    await sendNotification(userId, {
      type: 'GAMIFICATION_REWARD',
      title: `🎉 ${reward.reward}`,
      body: reward.description,
      data: { action }
    });
  }
  
  return reward;
}

/**
 * Grant temporary visibility boost
 */
async function grantTemporaryVisibilityBoost(
  userId: string,
  durationHours: number,
  multiplier: number = 2.0
): Promise<void> {
  
  const now = Date.now();
  const endsAt = now + (durationHours * 60 * 60 * 1000);
  
  await db.collection('users').doc(userId).update({
    'visibilityBoost': {
      active: true,
      multiplier,
      endsAt: new Date(endsAt),
      source: 'gamification'
    },
    updatedAt: serverTimestamp()
  });
}

/**
 * Add user to featured profiles list
 */
async function addToFeaturedProfiles(userId: string, durationHours: number): Promise<void> {
  const endsAt = Date.now() + (durationHours * 60 * 60 * 1000);
  
  await db.collection('featured_profiles').doc(userId).set({
    userId,
    reason: 'profile_completion',
    endsAt: new Date(endsAt),
    createdAt: serverTimestamp()
  });
}

// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================

/**
 * Get funnel analytics for a user category
 */
export async function getFunnelAnalytics(userCategory?: UserCategory): Promise<{
  totalUsers: number;
  conversionRate: number;
  avgConversionTimeHours: number;
  byPhase: {
    phase1Complete: number;
    phase2Complete: number;
    phase3Complete: number;
    converted: number;
  };
  avgARPU48h: number;
  retention: {
    day2: number;
    day7: number;
  };
}> {
  
  let query = db.collection('welcome_funnels');
  
  if (userCategory) {
    query = query.where('userCategory', '==', userCategory) as any;
  }
  
  const funnelSnapshot = await query.get();
  
  const analytics = {
    totalUsers: funnelSnapshot.size,
    conversionRate: 0,
    avgConversionTimeHours: 0,
    byPhase: {
      phase1Complete: 0,
      phase2Complete: 0,
      phase3Complete: 0,
      converted: 0
    },
    avgARPU48h: 0,
    retention: {
      day2: 0,
      day7: 0
    }
  };
  
  let totalConversionTime = 0;
  let convertedCount = 0;
  let totalRevenue = 0;
  
  funnelSnapshot.forEach((doc) => {
    const funnel = doc.data() as WelcomeFunnelState;
    
    if (funnel.phase1.completedAt) analytics.byPhase.phase1Complete++;
    if (funnel.phase2.completedAt) analytics.byPhase.phase2Complete++;
    if (funnel.phase3.completedAt) analytics.byPhase.phase3Complete++;
    
    if (funnel.analytics.convertedToPaying) {
      analytics.byPhase.converted++;
      convertedCount++;
      
      if (funnel.analytics.conversionTimeHours) {
        totalConversionTime += funnel.analytics.conversionTimeHours;
      }
      
      if (funnel.analytics.firstDepositAmount) {
        totalRevenue += funnel.analytics.firstDepositAmount;
      }
    }
  });
  
  if (funnelSnapshot.size > 0) {
    analytics.conversionRate = (convertedCount / funnelSnapshot.size) * 100;
    analytics.avgARPU48h = totalRevenue / funnelSnapshot.size;
  }
  
  if (convertedCount > 0) {
    analytics.avgConversionTimeHours = totalConversionTime / convertedCount;
  }
  
  // TODO: Calculate retention from user_sessions or login_events
  
  return analytics;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Send push notification to user
 */
async function sendNotification(
  userId: string,
  notification: {
    type: string;
    title: string;
    body: string;
    data?: Record<string, any>;
  }
): Promise<void> {
  
  // Store notification in database
  await db.collection('notifications').add({
    userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data || {},
    read: false,
    createdAt: serverTimestamp()
  });
  
  // Send push notification (async, non-blocking)
  try {
    // Get user's FCM tokens
    const userSnap = await db.collection('users').doc(userId).get();
    const fcmTokens = userSnap.exists ? userSnap.data()!.fcmTokens : [];
    
    if (fcmTokens && fcmTokens.length > 0) {
      const { admin } = await import('./init.js');
      
      await admin.messaging().sendMulticast({
        tokens: fcmTokens,
        notification: {
          title: notification.title,
          body: notification.body
        },
        data: notification.data || {}
      });
    }
  } catch (error) {
    console.error('Failed to send push notification:', error);
    // Non-blocking - don't throw
  }
}

/**
 * Scheduled function to advance funnel phases
 * Runs every hour to check and advance users to next phase
 */
export async function advanceFunnelPhases(): Promise<number> {
  const now = Date.now();
  let advancedCount = 0;
  
  // Find users ready for Phase 2 (>2h since start)
  const phase1Users = await db.collection('welcome_funnels')
    .where('currentPhase', '==', 'PHASE_1_VALIDATION')
    .where('startedAt', '<', now - (PHASE_1_DURATION_HOURS * 60 * 60 * 1000))
    .limit(500)
    .get();
  
  for (const doc of phase1Users.docs) {
    try {
      await triggerPhase2Investment(doc.id);
      advancedCount++;
    } catch (error) {
      console.error(`Failed to advance user ${doc.id} to Phase 2:`, error);
    }
  }
  
  // Find users ready for Phase 3 (>24h since start)
  const phase2Users = await db.collection('welcome_funnels')
    .where('currentPhase', '==', 'PHASE_2_INVESTMENT')
    .where('startedAt', '<', now - (24 * 60 * 60 * 1000))
    .limit(500)
    .get();
  
  for (const doc of phase2Users.docs) {
    try {
      // Phase 3 is triggered by chat events, so just mark them as ready
      await db.collection('welcome_funnels').doc(doc.id).update({
        currentPhase: 'PHASE_3_CONVERSION',
        'phase2.completedAt': now,
        updatedAt: serverTimestamp()
      });
      advancedCount++;
    } catch (error) {
      console.error(`Failed to advance user ${doc.id} to Phase 3:`, error);
    }
  }
  
  return advancedCount;
}