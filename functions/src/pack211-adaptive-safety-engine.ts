/**
 * PACK 211 — Adaptive Safety Intelligence Engine
 * Risk Scoring, User Type Detection, and Safety Personalization
 */

import * as admin from 'firebase-admin';
import {
  UserRiskProfile,
  UserSafetyCategory,
  DatingPreferences,
  RiskLevel,
  AdaptiveSafetyEvent,
  SafetyEventType,
  CalculateSafetyCategoryRequest,
  UpdateRiskScoreRequest,
  RISK_THRESHOLDS,
  RISK_SCORE_WEIGHTS,
  getSafetyAdjustmentsForCategory,
  BookingAttemptHistory,
  MeetingOutcome,
  BOOKING_COOLDOWNS,
  CheckBookingCooldownRequest,
  BookingCooldownStatus,
  SwipePatternTracking,
  SWIPE_HIDING_PERIODS,
  LocationSafetyCheck,
  LocationRiskLevel,
  AssessLocationSafetyRequest,
  LOCATION_CATEGORIES,
} from './pack211-adaptive-safety-types';

const db = admin.firestore();

// ============================================================================
// USER SAFETY CATEGORY DETECTION
// ============================================================================

/**
 * Calculate user's safety category based on dating preferences
 * and account characteristics
 */
export async function calculateUserSafetyCategory(
  request: CalculateSafetyCategoryRequest
): Promise<UserSafetyCategory> {
  const { userId, datingPreferences, followerCount = 0, accountCreatedAt } = request;

  // Check if new account (< 30 days)
  const accountAgeMs = Date.now() - accountCreatedAt.toMillis();
  const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);
  
  if (accountAgeDays < 30) {
    return 'NEW_ACCOUNT';
  }

  // Check if influencer (high follower count)
  const INFLUENCER_THRESHOLD = 10000;
  if (followerCount >= INFLUENCER_THRESHOLD || datingPreferences.hasInfluencerStatus) {
    return 'INFLUENCER_PROFILE';
  }

  // Gender-based risk categorization
  if (datingPreferences.genderIdentity === 'NONBINARY') {
    return 'NONBINARY';
  }

  if (datingPreferences.genderIdentity === 'WOMAN' && 
      datingPreferences.interestedIn === 'MEN') {
    return 'WOMAN_DATING_MEN';
  }

  if (datingPreferences.genderIdentity === 'MAN' && 
      datingPreferences.interestedIn === 'WOMEN') {
    return 'MAN_DATING_WOMEN';
  }

  return 'STANDARD';
}

/**
 * Initialize or update user's risk profile
 */
export async function initializeUserRiskProfile(
  userId: string,
  category: UserSafetyCategory
): Promise<UserRiskProfile> {
  const profileRef = db.collection('user_risk_profiles').doc(userId);
  const existing = await profileRef.get();

  if (existing.exists) {
    // Update category only
    await profileRef.update({
      safetyCategory: category,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    });
    return existing.data() as UserRiskProfile;
  }

  // Create new profile
  const newProfile: UserRiskProfile = {
    userId,
    riskScore: 0,
    safetyCategory: category,
    complaintCount: 0,
    blockCount: 0,
    mismatchCount: 0,
    panicAlertsTriggered: 0,
    rejectionCount: 0,
    positiveConfirmations: 0,
    successfulMeetings: 0,
    voluntaryRefundsGiven: 0,
    highRatings: 0,
    selfieReverifications: 0,
    lastUpdated: admin.firestore.Timestamp.now(),
    lastIncidentDate: null,
    lastPositiveDate: null,
    createdAt: admin.firestore.Timestamp.now(),
  };

  await profileRef.set(newProfile);
  return newProfile;
}

// ============================================================================
// RISK SCORE CALCULATION & UPDATES
// ============================================================================

/**
 * Update user's risk score based on event
 */
export async function updateRiskScore(
  request: UpdateRiskScoreRequest
): Promise<{ newScore: number; riskLevel: RiskLevel; delta: number }> {
  const { userId, event, relatedUserId, metadata } = request;
  
  const profileRef = db.collection('user_risk_profiles').doc(userId);
  
  return await db.runTransaction(async (transaction) => {
    const profileDoc = await transaction.get(profileRef);
    
    if (!profileDoc.exists) {
      throw new Error('User risk profile not found');
    }

    const profile = profileDoc.data() as UserRiskProfile;
    const scoreDelta = RISK_SCORE_WEIGHTS[event] || 0;
    const newScore = Math.max(0, Math.min(1000, profile.riskScore + scoreDelta));
    const riskLevel = getRiskLevel(newScore);

    // Update counters based on event type
    const updates: Partial<UserRiskProfile> = {
      riskScore: newScore,
      lastUpdated: admin.firestore.Timestamp.now(),
    };

    // Increase counters (negative events)
    if (event === 'COMPLAINT_RECEIVED') {
      updates.complaintCount = (profile.complaintCount || 0) + 1;
      updates.lastIncidentDate = admin.firestore.Timestamp.now();
    } else if (event === 'BLOCKED_AFTER_FIRST_MESSAGE') {
      updates.blockCount = (profile.blockCount || 0) + 1;
      updates.lastIncidentDate = admin.firestore.Timestamp.now();
    } else if (event === 'APPEARANCE_MISMATCH') {
      updates.mismatchCount = (profile.mismatchCount || 0) + 1;
      updates.lastIncidentDate = admin.firestore.Timestamp.now();
    } else if (event === 'PANIC_ALERT_TRIGGERED_BY_OTHER') {
      updates.panicAlertsTriggered = (profile.panicAlertsTriggered || 0) + 1;
      updates.lastIncidentDate = admin.firestore.Timestamp.now();
    } else if (event === 'BOOKING_REJECTED') {
      updates.rejectionCount = (profile.rejectionCount || 0) + 1;
      updates.lastIncidentDate = admin.firestore.Timestamp.now();
    }
    // Decrease counters (positive events)
    else if (event === 'POSITIVE_CONFIRMATION') {
      updates.positiveConfirmations = (profile.positiveConfirmations || 0) + 1;
      updates.lastPositiveDate = admin.firestore.Timestamp.now();
    } else if (event === 'SUCCESSFUL_MEETING') {
      updates.successfulMeetings = (profile.successfulMeetings || 0) + 1;
      updates.lastPositiveDate = admin.firestore.Timestamp.now();
    } else if (event === 'VOLUNTARY_REFUND_GIVEN') {
      updates.voluntaryRefundsGiven = (profile.voluntaryRefundsGiven || 0) + 1;
      updates.lastPositiveDate = admin.firestore.Timestamp.now();
    } else if (event === 'HIGH_RATING_RECEIVED') {
      updates.highRatings = (profile.highRatings || 0) + 1;
      updates.lastPositiveDate = admin.firestore.Timestamp.now();
    } else if (event === 'SELFIE_REVERIFICATION') {
      updates.selfieReverifications = (profile.selfieReverifications || 0) + 1;
      updates.lastPositiveDate = admin.firestore.Timestamp.now();
    }

    transaction.update(profileRef, updates);

    // Log the event
    await logAdaptiveSafetyEvent({
      eventType: scoreDelta > 0 ? 'RISK_SCORE_INCREASED' : 'RISK_SCORE_DECREASED',
      userId,
      relatedUserId,
      previousRiskScore: profile.riskScore,
      newRiskScore: newScore,
      riskScoreDelta: scoreDelta,
      actionsTaken: [`Risk score updated: ${profile.riskScore} → ${newScore}`],
      requiresReview: newScore >= RISK_THRESHOLDS.HIGH,
      severity: getSeverityFromRiskLevel(riskLevel),
      description: `Risk score ${scoreDelta > 0 ? 'increased' : 'decreased'} by ${Math.abs(scoreDelta)} due to ${event}`,
      metadata: { event, ...metadata },
    });

    return { newScore, riskLevel, delta: scoreDelta };
  });
}

/**
 * Get risk level from score
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score >= RISK_THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (score >= RISK_THRESHOLDS.HIGH) return 'HIGH';
  if (score >= RISK_THRESHOLDS.MEDIUM) return 'MEDIUM';
  return 'LOW';
}

/**
 * Get severity from risk level
 */
function getSeverityFromRiskLevel(level: RiskLevel): 'INFO' | 'WARNING' | 'CRITICAL' {
  switch (level) {
    case 'CRITICAL': return 'CRITICAL';
    case 'HIGH': return 'CRITICAL';
    case 'MEDIUM': return 'WARNING';
    case 'LOW': return 'INFO';
  }
}

/**
 * Get user's current risk profile
 */
export async function getUserRiskProfile(userId: string): Promise<UserRiskProfile | null> {
  const doc = await db.collection('user_risk_profiles').doc(userId).get();
  return doc.exists ? (doc.data() as UserRiskProfile) : null;
}

// ============================================================================
// ANTI-STALKING: REPEATED BOOKING PROTECTION
// ============================================================================

/**
 * Check if user can book another user (cooldown check)
 */
export async function checkBookingCooldown(
  request: CheckBookingCooldownRequest
): Promise<BookingCooldownStatus> {
  const { requesterId, targetId } = request;
  
  const historyRef = db.collection('booking_attempt_history')
    .where('requesterId', '==', requesterId)
    .where('targetId', '==', targetId)
    .limit(1);
  
  const snapshot = await historyRef.get();
  
  if (snapshot.empty) {
    // No history, can book
    return {
      canBook: true,
      cooldownActive: false,
      cooldownUntil: null,
      rejectionCount: 0,
      permanentlyBlocked: false,
    };
  }

  const history = snapshot.docs[0].data() as BookingAttemptHistory;

  // Check permanent block
  if (history.permanentlyBlocked) {
    return {
      canBook: false,
      reason: 'You cannot book this user due to repeated rejections.',
      cooldownActive: true,
      cooldownUntil: null,
      rejectionCount: history.rejectionCount,
      permanentlyBlocked: true,
    };
  }

  // Check active cooldown
  if (history.cooldownActive && history.cooldownUntil) {
    const now = admin.firestore.Timestamp.now();
    if (history.cooldownUntil.toMillis() > now.toMillis()) {
      return {
        canBook: false,
        reason: `You can try booking again after ${history.cooldownUntil.toDate().toLocaleDateString()}.`,
        cooldownActive: true,
        cooldownUntil: history.cooldownUntil.toDate(),
        rejectionCount: history.rejectionCount,
        permanentlyBlocked: false,
      };
    }
  }

  // Cooldown expired or no active cooldown
  return {
    canBook: true,
    cooldownActive: false,
    cooldownUntil: null,
    rejectionCount: history.rejectionCount,
    permanentlyBlocked: false,
  };
}

/**
 * Record booking attempt
 */
export async function recordBookingAttempt(
  requesterId: string,
  targetId: string,
  outcome: MeetingOutcome
): Promise<void> {
  const historyQuery = db.collection('booking_attempt_history')
    .where('requesterId', '==', requesterId)
    .where('targetId', '==', targetId)
    .limit(1);
  
  const snapshot = await historyQuery.get();
  const now = admin.firestore.Timestamp.now();

  if (snapshot.empty) {
    // Create new history
    const newHistory: BookingAttemptHistory = {
      historyId: db.collection('booking_attempt_history').doc().id,
      requesterId,
      targetId,
      totalAttempts: 1,
      rejectionCount: outcome === 'REJECTED' ? 1 : 0,
      lastAttemptDate: now,
      lastRejectionDate: outcome === 'REJECTED' ? now : null,
      cooldownActive: false,
      cooldownUntil: null,
      permanentlyBlocked: false,
      completedMeetings: outcome === 'COMPLETED_NORMAL' ? 1 : 0,
      meetingOutcomes: [outcome],
      createdAt: now,
      updatedAt: now,
    };

    // Apply cooldown if rejected
    if (outcome === 'REJECTED') {
      const cooldownDays = BOOKING_COOLDOWNS.ONE_REJECTION;
      newHistory.cooldownActive = true;
      newHistory.cooldownUntil = addDays(now, cooldownDays);
      
      await logAdaptiveSafetyEvent({
        eventType: 'BOOKING_COOLDOWN_APPLIED',
        userId: requesterId,
        relatedUserId: targetId,
        actionsTaken: [`${cooldownDays}-day booking cooldown applied`],
        requiresReview: false,
        severity: 'INFO',
        description: `${cooldownDays}-day cooldown applied after first rejection`,
        metadata: { rejectionCount: 1, cooldownDays },
      });
    }

    await db.collection('booking_attempt_history').doc(newHistory.historyId).set(newHistory);
  } else {
    // Update existing history
    const docRef = snapshot.docs[0].ref;
    const history = snapshot.docs[0].data() as BookingAttemptHistory;

    const updates: Partial<BookingAttemptHistory> = {
      totalAttempts: history.totalAttempts + 1,
      lastAttemptDate: now,
      updatedAt: now,
      meetingOutcomes: [...history.meetingOutcomes.slice(-4), outcome], // Keep last 5
    };

    if (outcome === 'REJECTED') {
      const newRejectionCount = history.rejectionCount + 1;
      updates.rejectionCount = newRejectionCount;
      updates.lastRejectionDate = now;

      // Apply cooldown based on rejection count
      if (newRejectionCount === 1) {
        updates.cooldownActive = true;
        updates.cooldownUntil = addDays(now, BOOKING_COOLDOWNS.ONE_REJECTION);
      } else if (newRejectionCount === 2) {
        updates.cooldownActive = true;
        updates.cooldownUntil = addDays(now, BOOKING_COOLDOWNS.TWO_REJECTIONS);
      } else if (newRejectionCount >= 3) {
        updates.cooldownActive = true;
        updates.cooldownUntil = null;
        updates.permanentlyBlocked = true;
        
        await logAdaptiveSafetyEvent({
          eventType: 'BOOKING_PERMANENTLY_BLOCKED',
          userId: requesterId,
          relatedUserId: targetId,
          actionsTaken: ['Permanent booking block applied', 'Manual review required'],
          requiresReview: true,
          severity: 'WARNING',
          description: 'Permanently blocked from booking this user after 3 rejections',
          metadata: { rejectionCount: newRejectionCount },
        });
      }

      if (newRejectionCount <= 2) {
        const cooldownDays = newRejectionCount === 1 
          ? BOOKING_COOLDOWNS.ONE_REJECTION 
          : BOOKING_COOLDOWNS.TWO_REJECTIONS;
        
        await logAdaptiveSafetyEvent({
          eventType: 'BOOKING_COOLDOWN_APPLIED',
          userId: requesterId,
          relatedUserId: targetId,
          actionsTaken: [`${cooldownDays}-day booking cooldown applied`],
          requiresReview: false,
          severity: 'INFO',
          description: `${cooldownDays}-day cooldown applied after ${newRejectionCount} rejection(s)`,
          metadata: { rejectionCount: newRejectionCount, cooldownDays },
        });
      }
    } else if (outcome === 'COMPLETED_NORMAL') {
      updates.completedMeetings = (history.completedMeetings || 0) + 1;
    }

    await docRef.update(updates);
  }

  // Update risk score if rejected
  if (outcome === 'REJECTED') {
    await updateRiskScore({
      userId: requesterId,
      event: 'BOOKING_REJECTED',
      relatedUserId: targetId,
    });
  }
}

// ============================================================================
// REPEATED-MATCH STALKING PREVENTION (SWIPING)
// ============================================================================

/**
 * Track swipe pattern and hide profile if obsessive
 */
export async function trackSwipePattern(
  swiperId: string,
  targetId: string,
  isRightSwipe: boolean,
  matchHappened: boolean,
  wasBlockedByTarget: boolean = false
): Promise<{ shouldHideProfile: boolean; hiddenUntil: Date | null }> {
  if (!isRightSwipe) {
    return { shouldHideProfile: false, hiddenUntil: null };
  }

  const trackingQuery = db.collection('swipe_pattern_tracking')
    .where('swiperId', '==', swiperId)
    .where('targetId', '==', targetId)
    .limit(1);
  
  const snapshot = await trackingQuery.get();
  const now = admin.firestore.Timestamp.now();

  if (snapshot.empty) {
    // First swipe
    const newTracking: SwipePatternTracking = {
      trackingId: db.collection('swipe_pattern_tracking').doc().id,
      swiperId,
      targetId,
      totalRightSwipes: 1,
      noMatchCount: matchHappened ? 0 : 1,
      lastSwipeDate: now,
      hiddenUntil: null,
      hiddenDays: 0,
      permanentlyHidden: false,
      wasBlockedByTarget,
      matchNeverHappened: !matchHappened,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('swipe_pattern_tracking').doc(newTracking.trackingId).set(newTracking);
    return { shouldHideProfile: false, hiddenUntil: null };
  }

  // Existing tracking
  const docRef = snapshot.docs[0].ref;
  const tracking = snapshot.docs[0].data() as SwipePatternTracking;

  const newRightSwipes = tracking.totalRightSwipes + 1;
  const newNoMatchCount = matchHappened ? tracking.noMatchCount : tracking.noMatchCount + 1;

  // Pattern detection: 3+ right swipes without match
  const STALKING_THRESHOLD = 3;
  const shouldHide = newNoMatchCount >= STALKING_THRESHOLD && !matchHappened;

  let hiddenUntil: admin.firestore.Timestamp | null = null;
  let hiddenDays = 0;

  if (shouldHide) {
    // Determine hiding period
    if (wasBlockedByTarget) {
      hiddenDays = SWIPE_HIDING_PERIODS.BLOCKED_BY_USER;
    } else {
      hiddenDays = SWIPE_HIDING_PERIODS.REGULAR_USER;
    }
    hiddenUntil = addDays(now, hiddenDays);

    await logAdaptiveSafetyEvent({
      eventType: 'SWIPE_PATTERN_DETECTED',
      userId: swiperId,
      relatedUserId: targetId,
      actionsTaken: [`Profile hidden for ${hiddenDays} days`],
      requiresReview: false,
      severity: 'INFO',
      description: `Profile hidden for ${hiddenDays} days due to repeated swiping without match`,
      metadata: { totalRightSwipes: newRightSwipes, noMatchCount: newNoMatchCount, hiddenDays },
    });

    await logAdaptiveSafetyEvent({
      eventType: 'PROFILE_HIDDEN_FROM_USER',
      userId: targetId,
      relatedUserId: swiperId,
      actionsTaken: ['Profile hidden from specific user'],
      requiresReview: false,
      severity: 'INFO',
      description: 'Profile hidden from user to prevent obsessive behavior',
      metadata: { hiddenDays },
    });
  }

  const updates: Partial<SwipePatternTracking> = {
    totalRightSwipes: newRightSwipes,
    noMatchCount: newNoMatchCount,
    lastSwipeDate: now,
    hiddenUntil: shouldHide ? hiddenUntil : tracking.hiddenUntil,
    hiddenDays: shouldHide ? hiddenDays : tracking.hiddenDays,
    wasBlockedByTarget: wasBlockedByTarget || tracking.wasBlockedByTarget,
    matchNeverHappened: tracking.matchNeverHappened && !matchHappened,
    updatedAt: now,
  };

  await docRef.update(updates);

  return {
    shouldHideProfile: shouldHide,
    hiddenUntil: hiddenUntil ? hiddenUntil.toDate() : null,
  };
}

/**
 * Check if profile should be hidden from swiper
 */
export async function shouldHideProfileFromSwiper(
  swiperId: string,
  targetId: string
): Promise<boolean> {
  const trackingQuery = db.collection('swipe_pattern_tracking')
    .where('swiperId', '==', swiperId)
    .where('targetId', '==', targetId)
    .limit(1);
  
  const snapshot = await trackingQuery.get();
  
  if (snapshot.empty) {
    return false;
  }

  const tracking = snapshot.docs[0].data() as SwipePatternTracking;

  if (tracking.permanentlyHidden) {
    return true;
  }

  if (tracking.hiddenUntil) {
    const now = admin.firestore.Timestamp.now();
    return tracking.hiddenUntil.toMillis() > now.toMillis();
  }

  return false;
}

// ============================================================================
// LOCATION-AWARE RISK REDUCTION
// ============================================================================

/**
 * Assess location safety for meeting/event
 */
export async function assessLocationSafety(
  request: AssessLocationSafetyRequest
): Promise<LocationSafetyCheck> {
  const { bookingId, eventId, location, requestedBy } = request;
  
  let riskLevel: LocationRiskLevel = 'SAFE';
  const riskFactors: string[] = [];
  let enhancedSelfieRequired = false;
  let trustedContactMandatory = false;
  let shortenedSafetyCheckTimer = false;
  let meetingBlocked = false;

  // Check if address is provided
  if (!location.address || location.address.trim() === '') {
    riskLevel = 'BLOCKED';
    riskFactors.push('No public address provided');
    meetingBlocked = true;
  }
  // Check place type (would integrate with Google Places API in production)
  else {
    const placeType = location.placeName?.toLowerCase() || '';
    
    // Check SAFE locations
    const isSafe = LOCATION_CATEGORIES.SAFE.some(type => 
      placeType.includes(type) || location.address?.toLowerCase().includes(type)
    );
    
    // Check ELEVATED risk locations
    const isElevated = LOCATION_CATEGORIES.ELEVATED.some(type => 
      placeType.includes(type) || location.address?.toLowerCase().includes(type)
    );
    
    // Check HIGH risk (remote/isolated)
    const isRemote = !location.placeName || 
      location.placeName.toLowerCase().includes('remote') ||
      location.placeName.toLowerCase().includes('isolated');

    if (isSafe) {
      riskLevel = 'SAFE';
    } else if (isElevated) {
      riskLevel = 'ELEVATED';
      riskFactors.push('Private or hotel location');
      enhancedSelfieRequired = true;
    } else if (isRemote) {
      riskLevel = 'HIGH';
      riskFactors.push('Remote or isolated location');
      enhancedSelfieRequired = true;
      trustedContactMandatory = true;
      shortenedSafetyCheckTimer = true;
    } else {
      // Unknown location type - default to safe but note it
      riskLevel = 'SAFE';
      riskFactors.push('Location type unclear - defaulting to safe');
    }
  }

  const check: LocationSafetyCheck = {
    checkId: db.collection('location_safety_checks').doc().id,
    bookingId,
    eventId,
    location,
    riskLevel,
    riskFactors,
    enhancedSelfieRequired,
    trustedContactMandatory,
    shortenedSafetyCheckTimer,
    meetingBlocked,
    assessedAt: admin.firestore.Timestamp.now(),
    assessedBy: 'AUTOMATIC',
  };

  await db.collection('location_safety_checks').doc(check.checkId).set(check);

  // Log if elevated or higher
  if (riskLevel !== 'SAFE') {
    const eventType: SafetyEventType = meetingBlocked 
      ? 'LOCATION_RISK_BLOCKED' 
      : 'LOCATION_RISK_ELEVATED';
    
    await logAdaptiveSafetyEvent({
      eventType,
      userId: requestedBy,
      locationCheckId: check.checkId,
      locationRiskLevel: riskLevel,
      actionsTaken: meetingBlocked
        ? ['Meeting blocked', 'Location flagged for review']
        : [`Enhanced verification applied`, `Safety monitoring increased`],
      requiresReview: meetingBlocked,
      severity: meetingBlocked ? 'CRITICAL' : 'WARNING',
      description: `Location assessed as ${riskLevel} risk: ${riskFactors.join(', ')}`,
      metadata: { location, riskFactors },
    });
  }

  return check;
}

// ============================================================================
// ADAPTIVE SAFETY EVENT LOGGING
// ============================================================================

/**
 * Log adaptive safety event for audit trail
 */
export async function logAdaptiveSafetyEvent(
  event: Omit<AdaptiveSafetyEvent, 'eventId' | 'createdAt'>
): Promise<string> {
  const eventId = db.collection('adaptive_safety_events').doc().id;
  
  const fullEvent: AdaptiveSafetyEvent = {
    eventId,
    ...event,
    createdAt: admin.firestore.Timestamp.now(),
  };

  await db.collection('adaptive_safety_events').doc(eventId).set(fullEvent);
  return eventId;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Add days to timestamp
 */
function addDays(timestamp: admin.firestore.Timestamp, days: number): admin.firestore.Timestamp {
  const date = timestamp.toDate();
  date.setDate(date.getDate() + days);
  return admin.firestore.Timestamp.fromDate(date);
}

/**
 * Check if user needs enhanced verification based on risk score
 */
export async function needsEnhancedVerification(userId: string): Promise<boolean> {
  const profile = await getUserRiskProfile(userId);
  
  if (!profile) {
    return false;
  }

  const riskLevel = getRiskLevel(profile.riskScore);
  return riskLevel === 'HIGH' || riskLevel === 'CRITICAL';
}

/**
 * Get safety adjustments for user
 */
export async function getSafetyAdjustmentsForUser(userId: string) {
  const profile = await getUserRiskProfile(userId);
  
  if (!profile) {
    return getSafetyAdjustmentsForCategory('STANDARD');
  }

  return getSafetyAdjustmentsForCategory(profile.safetyCategory);
}