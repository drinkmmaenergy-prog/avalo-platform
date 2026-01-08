/**
 * PACK 237: Breakup Recovery & Restart Path - Helper Functions
 * 
 * Support functions for notifications, analytics, monetization, and safety.
 */

import { db, serverTimestamp, generateId, increment } from './init.js';
import type {
  RecoveryFeedItem,
  RestartPathOffer,
  BreakupRecoveryAnalytics,
  BreakupSafetyIncident,
  RestartStage
} from './pack237-breakup-recovery-types.js';

// ============================================================================
// NOTIFICATION HELPERS
// ============================================================================

/**
 * Send notification about end connection request
 */
export async function sendEndConnectionNotification(
  respondentId: string,
  initiatorId: string,
  requestId: string
): Promise<void> {
  
  try {
    // Get initiator profile
    const initiatorSnap = await db.collection('users').doc(initiatorId).get();
    const initiatorName = initiatorSnap.exists ? 
      (initiatorSnap.data()?.displayName || 'Someone') : 'Someone';
    
    await db.collection('notifications').add({
      userId: respondentId,
      type: 'end_connection_request',
      title: 'Connection Ending Request',
      message: `${initiatorName} would like to end your connection`,
      data: {
        requestId,
        initiatorId
      },
      actionRequired: true,
      read: false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error sending end connection notification:', error);
  }
}

/**
 * Send notification about stage unlock
 */
export async function sendStageUnlockNotification(
  userId: string,
  stage: RestartStage
): Promise<void> {
  
  const messages: Record<RestartStage, { title: string; message: string }> = {
    0: { title: '', message: '' }, // No notification for stage 0
    1: {
      title: 'Discovery Unlocked',
      message: 'You can now browse profiles again'
    },
    2: {
      title: 'Swipe Queue Unlocked',
      message: 'Start making new connections'
    },
    3: {
      title: 'Chat Unlocked',
      message: 'Begin conversations with your matches'
    },
    4: {
      title: 'Welcome Back',
      message: 'Every ending creates space for something new'
    }
  };
  
  if (stage === 0) return;
  
  const { title, message } = messages[stage];
  
  try {
    await db.collection('notifications').add({
      userId,
      type: 'recovery_stage_unlock',
      title,
      message,
      data: { stage },
      read: false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error sending stage unlock notification:', error);
  }
}

/**
 * Send notification about recovery completion
 */
export async function sendRecoveryCompleteNotification(
  userId: string
): Promise<void> {
  
  try {
    await db.collection('notifications').add({
      userId,
      type: 'recovery_complete',
      title: 'Welcome Back',
      message: 'Every ending creates space for something new. All features are now unlocked.',
      data: {},
      read: false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error sending recovery complete notification:', error);
  }
}

// ============================================================================
// ANALYTICS HELPERS
// ============================================================================

/**
 * Create recovery analytics tracking
 */
export async function createRecoveryAnalytics(
  userId: string,
  recoveryId: string,
  expectedDuration: number
): Promise<void> {
  
  const analyticsId = generateId();
  
  const analytics: BreakupRecoveryAnalytics = {
    analyticsId,
    userId,
    recoveryId,
    totalDuration: expectedDuration,
    stageProgression: {
      stage0Duration: 0,
      stage1Duration: 0,
      stage2Duration: 0,
      stage3Duration: 0,
      stage4Duration: 0
    },
    recoveryFeedViews: 0,
    affirmationsViewed: 0,
    suggestionsViewed: 0,
    actionsTaken: 0,
    tokensSpent: 0,
    restartedSuccessfully: false,
    timeToRestart: 0,
    returnedToActive: false,
    churnedAfterRecovery: false,
    createdAt: serverTimestamp() as any
  };
  
  await db.collection('breakup_recovery_analytics').doc(analyticsId).set(analytics);
}

/**
 * Complete recovery analytics
 */
export async function completeRecoveryAnalytics(
  recoveryId: string
): Promise<void> {
  
  try {
    const analyticsSnap = await db.collection('breakup_recovery_analytics')
      .where('recoveryId', '==', recoveryId)
      .limit(1)
      .get();
    
    if (analyticsSnap.empty) return;
    
    const analyticsRef = analyticsSnap.docs[0].ref;
    const analytics = analyticsSnap.docs[0].data() as BreakupRecoveryAnalytics;
    
    const timeToRestart = Date.now() - analytics.createdAt.toDate().getTime();
    
    await analyticsRef.update({
      restartedSuccessfully: true,
      timeToRestart: timeToRestart / (60 * 60 * 1000), // Convert to hours
      returnedToActive: true,
      completedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error completing recovery analytics:', error);
  }
}

/**
 * Track recovery feed interaction
 */
export async function trackRecoveryFeedInteraction(
  recoveryId: string,
  itemType: string
): Promise<void> {
  
  try {
    const analyticsSnap = await db.collection('breakup_recovery_analytics')
      .where('recoveryId', '==', recoveryId)
      .limit(1)
      .get();
    
    if (analyticsSnap.empty) return;
    
    const analyticsRef = analyticsSnap.docs[0].ref;
    
    if (itemType === 'affirmation') {
      await analyticsRef.update({
        affirmationsViewed: increment(1),
        recoveryFeedViews: increment(1)
      });
    } else if (itemType === 'profile_suggestion') {
      await analyticsRef.update({
        suggestionsViewed: increment(1),
        recoveryFeedViews: increment(1)
      });
    } else {
      await analyticsRef.update({
        recoveryFeedViews: increment(1)
      });
    }
  } catch (error) {
    console.error('Error tracking recovery feed interaction:', error);
  }
}

// ============================================================================
// MONETIZATION HELPERS
// ============================================================================

/**
 * Generate restart path monetization offers
 */
export async function generateRestartPathOffers(
  userId: string,
  recoveryId: string,
  stage: RestartStage
): Promise<void> {
  
  const offers: Omit<RestartPathOffer, 'offerId' | 'createdAt'>[] = [];
  
  // Stage 2: Swipe queue unlocked - offer visibility boost
  if (stage === 2) {
    offers.push({
      userId,
      recoveryId,
      type: 'boost_visibility',
      title: 'Boost visibility to restart strong',
      description: '3x profile visibility for 24 hours to help you reconnect',
      price: 50, // 50 tokens
      availableAt: 2
    });
  }
  
  // Stage 3: Chat unlocked - offer profile polish
  if (stage === 3) {
    offers.push({
      userId,
      recoveryId,
      type: 'polish_profile',
      title: 'Polish profile before you return',
      description: 'AI-powered bio rewrite and photo tips',
      price: 75, // 75 tokens
      availableAt: 3
    });
  }
  
  // Stage 4: Full restart - offer trait matching
  if (stage === 4) {
    offers.push({
      userId,
      recoveryId,
      type: 'choose_traits',
      title: 'Choose 5 traits you want to attract',
      description: 'Smart matching based on your desired partner qualities',
      price: 100, // 100 tokens
      availableAt: 4
    });
  }
  
  // Save offers
  for (const offer of offers) {
    const offerId = generateId();
    await db.collection('restart_path_offers').doc(offerId).set({
      offerId,
      ...offer,
      createdAt: serverTimestamp()
    });
  }
}

/**
 * Get available restart path offers
 */
export async function getRestartPathOffers(
  userId: string
): Promise<RestartPathOffer[]> {
  
  // Get user's active recovery state
  const recoverySnap = await db.collection('breakup_recovery_states')
    .where('userId', '==', userId)
    .where('status', 'in', ['active', 'cooldown'])
    .limit(1)
    .get();
  
  if (recoverySnap.empty) return [];
  
  const recovery = recoverySnap.docs[0].data();
  const currentStage = recovery.restartStage;
  
  // Get offers for current or lower stages that haven't been shown
  const offersSnap = await db.collection('restart_path_offers')
    .where('userId', '==', userId)
    .where('availableAt', '<=', currentStage)
    .where('shownAt', '==', null)
    .orderBy('availableAt', 'desc')
    .limit(3)
    .get();
  
  return offersSnap.docs.map(doc => doc.data() as RestartPathOffer);
}

/**
 * Purchase restart path offer
 */
export async function purchaseRestartPathOffer(
  offerId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  
  try {
    const offerRef = db.collection('restart_path_offers').doc(offerId);
    const offerSnap = await offerRef.get();
    
    if (!offerSnap.exists) {
      return { success: false, error: 'Offer not found' };
    }
    
    const offer = offerSnap.data() as RestartPathOffer;
    
    if (offer.userId !== userId) {
      return { success: false, error: 'Not authorized' };
    }
    
    if (offer.purchasedAt) {
      return { success: false, error: 'Already purchased' };
    }
    
    // Check user token balance
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) {
      return { success: false, error: 'User not found' };
    }
    
    const userData = userSnap.data();
    const tokenBalance = userData?.tokens || 0;
    
    if (tokenBalance < offer.price) {
      return { success: false, error: 'Insufficient tokens' };
    }
    
    // Deduct tokens
    await db.collection('users').doc(userId).update({
      tokens: increment(-offer.price)
    });
    
    // Mark offer as purchased
    await offerRef.update({
      purchasedAt: serverTimestamp()
    });
    
    // Track analytics
    const analyticsSnap = await db.collection('breakup_recovery_analytics')
      .where('recoveryId', '==', offer.recoveryId)
      .limit(1)
      .get();
    
    if (!analyticsSnap.empty) {
      await analyticsSnap.docs[0].ref.update({
        tokensSpent: increment(offer.price),
        actionsTaken: increment(1)
      });
    }
    
    // Execute the offer action
    await executeOfferAction(userId, offer.type);
    
    return { success: true };
  } catch (error) {
    console.error('Error purchasing restart path offer:', error);
    return { success: false, error: 'Purchase failed' };
  }
}

/**
 * Execute offer action (boost, profile polish, etc.)
 */
async function executeOfferAction(
  userId: string,
  offerType: 'boost_visibility' | 'polish_profile' | 'choose_traits'
): Promise<void> {
  
  switch (offerType) {
    case 'boost_visibility':
      // Apply 24-hour visibility boost
      const boostEnd = new Date(Date.now() + (24 * 60 * 60 * 1000));
      await db.collection('users').doc(userId).update({
        visibilityBoost: true,
        visibilityBoostEndsAt: boostEnd
      });
      break;
      
    case 'polish_profile':
      // Create AI profile polish task
      await db.collection('ai_tasks').add({
        userId,
        taskType: 'profile_polish',
        status: 'pending',
        createdAt: serverTimestamp()
      });
      break;
      
    case 'choose_traits':
      // Unlock trait selection feature
      await db.collection('users').doc(userId).update({
        traitMatchingEnabled: true
      });
      break;
  }
}

// ============================================================================
// SAFETY HELPERS
// ============================================================================

/**
 * Create safety incident for breakup
 */
export async function createBreakupSafetyIncident(
  userId: string,
  partnerId: string,
  connectionId: string,
  incidentType: 'harassment' | 'stalking' | 'abuse' | 'under_18' | 'other',
  severity: 'low' | 'medium' | 'high' | 'critical',
  description: string
): Promise<{ incidentId: string; immediateActions: string[] }> {
  
  const incidentId = generateId();
  const immediateActions: string[] = [];
  
  // Determine actions based on severity
  const immediateBreakup = severity === 'high' || severity === 'critical';
  const permanentBlock = severity === 'critical' || incidentType === 'under_18';
  const accountAudit = severity === 'high' || severity === 'critical';
  const forcedInvisibility = severity === 'critical';
  const monitoredRestart = severity === 'high' || severity === 'critical';
  
  const incident: BreakupSafetyIncident = {
    incidentId,
    userId,
    partnerId,
    connectionId,
    type: incidentType,
    severity,
    description,
    immediateBreakup,
    permanentBlock,
    accountAudit,
    forcedInvisibility,
    monitoredRestart,
    status: 'active',
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any
  };
  
  await db.collection('breakup_safety_incidents').doc(incidentId).set(incident);
  
  // Execute immediate actions
  if (immediateBreakup) {
    immediateActions.push('immediate_breakup');
  }
  
  if (permanentBlock) {
    await db.collection('blocks').add({
      blockerId: userId,
      blockedId: partnerId,
      permanent: true,
      reason: 'safety_incident',
      incidentId,
      createdAt: serverTimestamp()
    });
    immediateActions.push('permanent_block');
  }
  
  if (accountAudit) {
    await db.collection('moderation_queue').add({
      userId: partnerId,
      type: 'account_audit',
      priority: 'high',
      incidentId,
      createdAt: serverTimestamp()
    });
    immediateActions.push('account_audit_queued');
  }
  
  if (forcedInvisibility) {
    await db.collection('users').doc(partnerId).update({
      visibilityForced: false,
      visibilityForcedUntil: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)) // 30 days
    });
    immediateActions.push('forced_invisibility');
  }
  
  return { incidentId, immediateActions };
}

/**
 * Resolve safety incident
 */
export async function resolveBreakupSafetyIncident(
  incidentId: string,
  resolution: string
): Promise<void> {
  
  await db.collection('breakup_safety_incidents').doc(incidentId).update({
    status: 'resolved',
    resolution,
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

/**
 * Check if user has active safety incidents
 */
export async function hasActiveSafetyIncidents(
  userId: string
): Promise<boolean> {
  
  const incidentsSnap = await db.collection('breakup_safety_incidents')
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  
  return !incidentsSnap.empty;
}

// ============================================================================
// AFFIRMATION GENERATOR
// ============================================================================

/**
 * Generate AI affirmations for recovery feed
 */
export async function generateAffirmations(
  userId: string,
  recoveryId: string,
  count: number = 3
): Promise<void> {
  
  const affirmations = [
    {
      title: 'You\'re growing',
      message: 'Every experience teaches us what we truly need in a partner.',
      icon: '🌱'
    },
    {
      title: 'Your worth is constant',
      message: 'One connection ending doesn\'t diminish your value or potential.',
      icon: '💎'
    },
    {
      title: 'Better matches ahead',
      message: 'Space for someone more aligned with your authentic self.',
      icon: '⭐'
    },
    {
      title: 'Trust the timing',
      message: 'The right connection will feel easier, not harder.',
      icon: '🌟'
    },
    {
      title: 'You\'re resilient',
      message: 'Taking time to heal shows wisdom and self-respect.',
      icon: '💪'
    }
  ];
  
  // Randomly select affirmations
  const selectedAffirmations = affirmations
    .sort(() => Math.random() - 0.5)
    .slice(0, count);
  
  for (const affirmation of selectedAffirmations) {
    const itemId = generateId();
    await db.collection('recovery_feed_items').doc(itemId).set({
      itemId,
      userId,
      recoveryId,
      type: 'affirmation',
      ...affirmation,
      createdAt: serverTimestamp()
    });
  }
}