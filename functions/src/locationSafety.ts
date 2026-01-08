/**
 * PACK 175 — Cyberstalking & Location Safety Defender
 * Location Safety Protection Layer
 * 
 * Prevents GPS tracking, location sharing abuse, and territorial jealousy tools.
 * No live location sharing to other users - privacy always wins.
 */

import * as admin from 'firebase-admin';
import {
  LocationSafetyViolation,
  LocationViolationType,
  LocationSafetyLog,
} from './types/cyberstalking.types';

const db = admin.firestore();

// ============================================================================
// LOCATION SAFETY RULES
// ============================================================================

/**
 * Core location safety rules (ZERO EXCEPTIONS)
 */
const LOCATION_SAFETY_RULES = {
  // Avalo never shows live GPS location to other users
  liveLocationSharingBlocked: true,
  
  // City-level location is always optional and non-precise
  cityLevelOnly: true,
  
  // Temporary location sharing (PACK 76) is session-based and ends automatically
  sessionBasedOnly: true,
  
  // No user may track another user's movement or presence history
  movementTrackingBlocked: true,
  
  // Event check-ins delayed by 60-180 min to prevent ambush
  checkInDelayMinutes: {
    min: 60,
    max: 180,
  },
  
  // Forbidden features forever
  forbiddenFeatures: [
    'NEARBY_USERS_MAP',
    'LIVE_GPS_TRACKING',
    'LOCATION_HISTORY',
    'FIND_NEARBY',
    'CAFE_GYM_FINDER',
  ],
};

// ============================================================================
// LOCATION REQUEST BLOCKING
// ============================================================================

/**
 * Block invasive location request
 */
export async function blockLocationRequest(
  requesterId: string,
  targetUserId: string,
  requestType: LocationViolationType,
  context?: string
): Promise<{
  blocked: boolean;
  violation: LocationSafetyViolation;
  educationRequired: boolean;
}> {
  try {
    const now = admin.firestore.Timestamp.now();
    const violationId = generateId();
    
    const violation: LocationSafetyViolation = {
      id: violationId,
      victimUserId: targetUserId,
      violatorUserId: requesterId,
      violationType: requestType,
      detectedAt: now,
      blocked: true,
      educationalCardShown: false,
    };
    
    // Store violation
    await db.collection('location_safety_violations').doc(violationId).set(violation);
    
    // Log the block
    await logLocationSafetyEvent(requesterId, 'REQUEST_BLOCKED', {
      requestType,
      requestedBy: requesterId,
      context,
    });
    
    // Check if education is needed (first time offender gets education)
    const violationCount = await getViolationCount(requesterId);
    const educationRequired = violationCount <= 1;
    
    if (educationRequired) {
      await markEducationRequired(requesterId, requestType);
    }
    
    console.log(`[LocationSafety] Blocked ${requestType} request from ${requesterId} to ${targetUserId}`);
    
    return {
      blocked: true,
      violation,
      educationRequired,
    };
  } catch (error) {
    console.error('[LocationSafety] Error blocking location request:', error);
    return {
      blocked: false,
      violation: {} as LocationSafetyViolation,
      educationRequired: false,
    };
  }
}

/**
 * Validate location share request (for PACK 76 integration)
 */
export async function validateLocationShare(
  userId: string,
  partnerId: string,
  sessionId?: string
): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  try {
    // Check if session-based sharing is properly configured
    if (!sessionId) {
      return {
        allowed: false,
        reason: 'Location sharing must be session-based with automatic expiry',
      };
    }
    
    // Verify session exists and is active
    const session = await db.collection('geoshare_sessions').doc(sessionId).get();
    if (!session.exists) {
      return {
        allowed: false,
        reason: 'Invalid or expired location sharing session',
      };
    }
    
    const sessionData = session.data();
    
    // Check if session has expired
    const now = admin.firestore.Timestamp.now();
    if (sessionData?.expiresAt && sessionData.expiresAt.toMillis() < now.toMillis()) {
      return {
        allowed: false,
        reason: 'Location sharing session has expired',
      };
    }
    
    // Check if both users are participants
    const isParticipant = 
      sessionData?.userA === userId || 
      sessionData?.userB === userId;
    
    if (!isParticipant) {
      return {
        allowed: false,
        reason: 'User is not a participant in this location sharing session',
      };
    }
    
    // All checks passed
    return { allowed: true };
  } catch (error) {
    console.error('[LocationSafety] Error validating location share:', error);
    return {
      allowed: false,
      reason: 'Error validating location sharing session',
    };
  }
}

/**
 * Check if user can access another user's location (always NO except active session)
 */
export async function canAccessLocation(
  requesterId: string,
  targetUserId: string
): Promise<{
  canAccess: boolean;
  sessionId?: string;
  expiresAt?: admin.firestore.Timestamp;
}> {
  try {
    // Check for active geoshare session between users
    const sessionsSnapshot = await db.collection('geoshare_sessions')
      .where('status', '==', 'ACTIVE')
      .get();
    
    const now = admin.firestore.Timestamp.now();
    
    for (const doc of sessionsSnapshot.docs) {
      const session = doc.data();
      
      // Check if both users are participants and session hasn't expired
      const isParticipant = 
        (session.userA === requesterId && session.userB === targetUserId) ||
        (session.userB === requesterId && session.userA === targetUserId);
      
      if (isParticipant && session.expiresAt.toMillis() > now.toMillis()) {
        return {
          canAccess: true,
          sessionId: doc.id,
          expiresAt: session.expiresAt,
        };
      }
    }
    
    // No active session found - access denied
    return { canAccess: false };
  } catch (error) {
    console.error('[LocationSafety] Error checking location access:', error);
    return { canAccess: false };
  }
}

// ============================================================================
// EVENT CHECK-IN DELAY
// ============================================================================

/**
 * Apply delay to event check-in to prevent ambush
 */
export async function getDelayedCheckInTime(
  eventId: string,
  userId: string
): Promise<{
  canCheckInAt: admin.firestore.Timestamp;
  delayMinutes: number;
}> {
  try {
    // Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new Error('Event not found');
    }
    
    const eventData = eventDoc.data();
    const eventStartTime = eventData?.startTime as admin.firestore.Timestamp;
    
    // Calculate random delay between min and max
    const minDelay = LOCATION_SAFETY_RULES.checkInDelayMinutes.min;
    const maxDelay = LOCATION_SAFETY_RULES.checkInDelayMinutes.max;
    const delayMinutes = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    
    // Add delay to event start time
    const canCheckInAt = admin.firestore.Timestamp.fromMillis(
      eventStartTime.toMillis() + delayMinutes * 60 * 1000
    );
    
    return {
      canCheckInAt,
      delayMinutes,
    };
  } catch (error) {
    console.error('[LocationSafety] Error calculating check-in delay:', error);
    // Default to max delay on error
    const now = admin.firestore.Timestamp.now();
    return {
      canCheckInAt: admin.firestore.Timestamp.fromMillis(
        now.toMillis() + LOCATION_SAFETY_RULES.checkInDelayMinutes.max * 60 * 1000
      ),
      delayMinutes: LOCATION_SAFETY_RULES.checkInDelayMinutes.max,
    };
  }
}

/**
 * Validate event check-in (ensures delay has passed)
 */
export async function validateEventCheckIn(
  eventId: string,
  userId: string
): Promise<{
  canCheckIn: boolean;
  reason?: string;
  waitMinutes?: number;
}> {
  try {
    const delayInfo = await getDelayedCheckInTime(eventId, userId);
    const now = admin.firestore.Timestamp.now();
    
    if (now.toMillis() < delayInfo.canCheckInAt.toMillis()) {
      const waitMillis = delayInfo.canCheckInAt.toMillis() - now.toMillis();
      const waitMinutes = Math.ceil(waitMillis / (60 * 1000));
      
      return {
        canCheckIn: false,
        reason: 'Check-in delayed for safety. Please wait before checking in.',
        waitMinutes,
      };
    }
    
    return { canCheckIn: true };
  } catch (error) {
    console.error('[LocationSafety] Error validating check-in:', error);
    return {
      canCheckIn: false,
      reason: 'Error validating check-in',
    };
  }
}

// ============================================================================
// LOCATION SHARING PREVENTION
// ============================================================================

/**
 * Block attempts to share live location outside of PACK 76 sessions
 */
export async function blockUnauthorizedLocationShare(
  userId: string,
  attemptedRecipient: string
): Promise<void> {
  try {
    await blockLocationRequest(
      userId,
      attemptedRecipient,
      'LIVE_LOCATION_REQUEST',
      'Attempted unauthorized location share'
    );
    
    console.log(`[LocationSafety] Blocked unauthorized location share from ${userId}`);
  } catch (error) {
    console.error('[LocationSafety] Error blocking location share:', error);
  }
}

/**
 * Validate that no forbidden features are enabled
 */
export function isForbiddenFeature(featureName: string): boolean {
  return LOCATION_SAFETY_RULES.forbiddenFeatures.includes(featureName);
}

/**
 * Get sanitized location (only city-level, never precise)
 */
export function sanitizeLocation(location: {
  latitude?: number;
  longitude?: number;
  city?: string;
  country?: string;
}): {
  city?: string;
  country?: string;
} {
  // Strip precise coordinates, only return city/country
  return {
    city: location.city,
    country: location.country,
  };
}

// ============================================================================
// EDUCATION & LOGGING
// ============================================================================

/**
 * Mark that user requires education about location safety
 */
async function markEducationRequired(
  userId: string,
  violationType: LocationViolationType
): Promise<void> {
  try {
    await db.collection('location_safety_education').doc(userId).set({
      userId,
      violationType,
      educationRequired: true,
      educationShown: false,
      markedAt: admin.firestore.Timestamp.now(),
    }, { merge: true });
  } catch (error) {
    console.error('[LocationSafety] Error marking education required:', error);
  }
}

/**
 * Mark education as shown to user
 */
export async function markEducationShown(
  userId: string,
  violationType: LocationViolationType
): Promise<void> {
  try {
    await db.collection('location_safety_education').doc(userId).update({
      educationShown: true,
      shownAt: admin.firestore.Timestamp.now(),
    });
    
    // Also update the violation record
    const violationsSnapshot = await db.collection('location_safety_violations')
      .where('violatorUserId', '==', userId)
      .where('violationType', '==', violationType)
      .where('educationalCardShown', '==', false)
      .limit(1)
      .get();
    
    if (!violationsSnapshot.empty) {
      await violationsSnapshot.docs[0].ref.update({
        educationalCardShown: true,
      });
    }
    
    await logLocationSafetyEvent(userId, 'EDUCATION_SHOWN', { violationType });
  } catch (error) {
    console.error('[LocationSafety] Error marking education shown:', error);
  }
}

/**
 * Log location safety event
 */
async function logLocationSafetyEvent(
  userId: string,
  eventType: 'SHARE_BLOCKED' | 'REQUEST_BLOCKED' | 'EDUCATION_SHOWN',
  details: any
): Promise<void> {
  try {
    const log: LocationSafetyLog = {
      id: generateId(),
      userId,
      eventType,
      details,
      timestamp: admin.firestore.Timestamp.now(),
    };
    
    await db.collection('location_safety_logs').doc(log.id).set(log);
  } catch (error) {
    console.error('[LocationSafety] Error logging event:', error);
  }
}

/**
 * Get violation count for user
 */
async function getViolationCount(userId: string): Promise<number> {
  try {
    const violationsSnapshot = await db.collection('location_safety_violations')
      .where('violatorUserId', '==', userId)
      .get();
    
    return violationsSnapshot.size;
  } catch (error) {
    console.error('[LocationSafety] Error getting violation count:', error);
    return 0;
  }
}

/**
 * Get user's location safety violations
 */
export async function getUserLocationViolations(
  userId: string,
  role: 'victim' | 'violator'
): Promise<LocationSafetyViolation[]> {
  try {
    const field = role === 'victim' ? 'victimUserId' : 'violatorUserId';
    const violationsSnapshot = await db.collection('location_safety_violations')
      .where(field, '==', userId)
      .orderBy('detectedAt', 'desc')
      .limit(50)
      .get();
    
    return violationsSnapshot.docs.map(doc => doc.data() as LocationSafetyViolation);
  } catch (error) {
    console.error('[LocationSafety] Error getting violations:', error);
    return [];
  }
}

/**
 * Check if user needs location safety education
 */
export async function needsLocationEducation(userId: string): Promise<{
  needsEducation: boolean;
  violationType?: LocationViolationType;
}> {
  try {
    const educationDoc = await db.collection('location_safety_education').doc(userId).get();
    
    if (!educationDoc.exists) {
      return { needsEducation: false };
    }
    
    const data = educationDoc.data();
    if (data?.educationRequired && !data?.educationShown) {
      return {
        needsEducation: true,
        violationType: data.violationType,
      };
    }
    
    return { needsEducation: false };
  } catch (error) {
    console.error('[LocationSafety] Error checking education need:', error);
    return { needsEducation: false };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate unique ID
 */
function generateId(): string {
  return db.collection('_').doc().id;
}

/**
 * Get location safety rules (for API exposure)
 */
export function getLocationSafetyRules() {
  return {
    liveLocationBlocked: LOCATION_SAFETY_RULES.liveLocationSharingBlocked,
    onlyCityLevel: LOCATION_SAFETY_RULES.cityLevelOnly,
    sessionBasedOnly: LOCATION_SAFETY_RULES.sessionBasedOnly,
    checkInDelayMinutes: LOCATION_SAFETY_RULES.checkInDelayMinutes,
    forbiddenFeatures: LOCATION_SAFETY_RULES.forbiddenFeatures,
  };
}