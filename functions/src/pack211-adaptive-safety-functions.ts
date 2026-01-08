/**
 * PACK 211 — Adaptive Safety Intelligence Cloud Functions
 * Callable endpoints for adaptive safety system
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  calculateUserSafetyCategory,
  initializeUserRiskProfile,
  updateRiskScore,
  getUserRiskProfile,
  checkBookingCooldown,
  recordBookingAttempt,
  trackSwipePattern,
  shouldHideProfileFromSwiper,
  assessLocationSafety,
  needsEnhancedVerification,
  getSafetyAdjustmentsForUser,
  getRiskLevel,
} from './pack211-adaptive-safety-engine';

import type {
  DatingPreferences,
  MeetingOutcome,
} from './pack211-adaptive-safety-types';

const db = admin.firestore();

// ============================================================================
// USER SAFETY CATEGORY MANAGEMENT
// ============================================================================

/**
 * Calculate and set user's safety category
 * Called during profile setup or when preferences change
 */
export const pack211_updateUserSafetyCategory = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { datingPreferences, followerCount } = data as {
      datingPreferences: DatingPreferences;
      followerCount?: number;
    };

    try {
      // Get account creation date
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
      }

      const accountCreatedAt = userDoc.data()!.createdAt || admin.firestore.Timestamp.now();

      // Calculate category
      const category = await calculateUserSafetyCategory({
        userId,
        datingPreferences,
        followerCount,
        accountCreatedAt,
      });

      // Initialize or update risk profile
      const profile = await initializeUserRiskProfile(userId, category);

      // Update user document with category
      await db.collection('users').doc(userId).update({
        safetyCategory: category,
        lastSafetyCategoryUpdate: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Get safety adjustments
      const adjustments = await getSafetyAdjustmentsForUser(userId);

      return {
        success: true,
        category,
        riskScore: profile.riskScore,
        riskLevel: getRiskLevel(profile.riskScore),
        adjustments,
      };
    } catch (error: any) {
      console.error('Error updating user safety category:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get user's current risk profile (limited view for user)
 */
export const pack211_getMyRiskProfile = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    try {
      const profile = await getUserRiskProfile(userId);
      
      if (!profile) {
        return {
          success: false,
          message: 'No risk profile found',
        };
      }

      const adjustments = await getSafetyAdjustmentsForUser(userId);

      // Return limited view (users don't see their actual score)
      return {
        success: true,
        category: profile.safetyCategory,
        riskLevel: getRiskLevel(profile.riskScore),
        stats: {
          successfulMeetings: profile.successfulMeetings,
          positiveConfirmations: profile.positiveConfirmations,
          highRatings: profile.highRatings,
        },
        adjustments,
      };
    } catch (error: any) {
      console.error('Error getting risk profile:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// BOOKING COOLDOWN CHECKS
// ============================================================================

/**
 * Check if user can book another user (anti-stalking)
 * Called before allowing booking request
 */
export const pack211_checkBookingPermission = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const requesterId = context.auth.uid;
    const { targetId } = data as { targetId: string };

    if (!targetId) {
      throw new functions.https.HttpsError('invalid-argument', 'targetId is required');
    }

    try {
      const cooldownStatus = await checkBookingCooldown({ requesterId, targetId });

      return {
        success: true,
        ...cooldownStatus,
      };
    } catch (error: any) {
      console.error('Error checking booking permission:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Record booking outcome (for tracking rejections)
 * Called after booking is accepted, rejected, or completed
 */
export const pack211_recordBookingOutcome = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { bookingId, outcome } = data as {
      bookingId: string;
      outcome: MeetingOutcome;
    };

    if (!bookingId || !outcome) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'bookingId and outcome are required'
      );
    }

    try {
      // Get booking details
      const bookingDoc = await db.collection('calendarBookings').doc(bookingId).get();
      if (!bookingDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Booking not found');
      }

      const booking = bookingDoc.data()!;
      
      // Verify caller is involved in booking
      if (booking.bookerId !== context.auth.uid && booking.creatorId !== context.auth.uid) {
        throw new functions.https.HttpsError('permission-denied', 'Not authorized');
      }

      await recordBookingAttempt(booking.bookerId, booking.creatorId, outcome);

      // Update risk scores based on outcome
      if (outcome === 'PANIC_ENDED') {
        // Panic alert triggered - update risk score of other party
        const otherId = booking.bookerId === context.auth.uid 
          ? booking.creatorId 
          : booking.bookerId;
        
        await updateRiskScore({
          userId: otherId,
          event: 'PANIC_ALERT_TRIGGERED_BY_OTHER',
          relatedUserId: context.auth.uid,
          metadata: { bookingId, outcome },
        });
      } else if (outcome === 'COMPLETED_NORMAL') {
        // Successful meeting - improve both scores
        await updateRiskScore({
          userId: booking.bookerId,
          event: 'SUCCESSFUL_MEETING',
          relatedUserId: booking.creatorId,
          metadata: { bookingId },
        });
        await updateRiskScore({
          userId: booking.creatorId,
          event: 'SUCCESSFUL_MEETING',
          relatedUserId: booking.bookerId,
          metadata: { bookingId },
        });
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error recording booking outcome:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// SWIPE PATTERN TRACKING
// ============================================================================

/**
 * Record swipe action and check for obsessive patterns
 * Called after each swipe
 */
export const pack211_recordSwipe = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const swiperId = context.auth.uid;
    const { targetId, isRightSwipe, matchHappened, wasBlockedByTarget } = data as {
      targetId: string;
      isRightSwipe: boolean;
      matchHappened: boolean;
      wasBlockedByTarget?: boolean;
    };

    if (!targetId || isRightSwipe === undefined) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'targetId and isRightSwipe are required'
      );
    }

    try {
      const result = await trackSwipePattern(
        swiperId,
        targetId,
        isRightSwipe,
        matchHappened,
        wasBlockedByTarget || false
      );

      return {
        success: true,
        ...result,
      };
    } catch (error: any) {
      console.error('Error recording swipe:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Check if profile should be hidden from user
 * Called when generating match suggestions
 */
export const pack211_shouldShowProfile = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const swiperId = context.auth.uid;
    const { targetId } = data as { targetId: string };

    if (!targetId) {
      throw new functions.https.HttpsError('invalid-argument', 'targetId is required');
    }

    try {
      const hidden = await shouldHideProfileFromSwiper(swiperId, targetId);

      return {
        success: true,
        shouldShow: !hidden,
        isHidden: hidden,
      };
    } catch (error: any) {
      console.error('Error checking profile visibility:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// LOCATION SAFETY ASSESSMENT
// ============================================================================

/**
 * Assess location safety for meeting/event
 * Called when creating booking or selecting event venue
 */
export const pack211_assessMeetingLocation = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { bookingId, eventId, location } = data as {
      bookingId?: string;
      eventId?: string;
      location: {
        latitude: number;
        longitude: number;
        address?: string;
        placeName?: string;
      };
    };

    if (!location || !location.latitude || !location.longitude) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Valid location is required'
      );
    }

    try {
      const check = await assessLocationSafety({
        bookingId,
        eventId,
        location,
        requestedBy: context.auth.uid,
      });

      return {
        success: true,
        riskLevel: check.riskLevel,
        riskFactors: check.riskFactors,
        enhancedSelfieRequired: check.enhancedSelfieRequired,
        trustedContactMandatory: check.trustedContactMandatory,
        shortenedSafetyCheckTimer: check.shortenedSafetyCheckTimer,
        meetingBlocked: check.meetingBlocked,
      };
    } catch (error: any) {
      console.error('Error assessing location:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Get all high-risk users (admin only)
 */
export const pack211_admin_getHighRiskUsers = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const isAdmin = userDoc.data()?.roles?.admin === true;
    
    if (!isAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    const { limit = 50, minRiskScore = 600 } = data as {
      limit?: number;
      minRiskScore?: number;
    };

    try {
      const snapshot = await db
        .collection('user_risk_profiles')
        .where('riskScore', '>=', minRiskScore)
        .orderBy('riskScore', 'desc')
        .limit(limit)
        .get();

      const profiles = snapshot.docs.map(doc => ({
        userId: doc.id,
        ...doc.data(),
        riskLevel: getRiskLevel(doc.data().riskScore),
      }));

      return {
        success: true,
        profiles,
        count: profiles.length,
      };
    } catch (error: any) {
      console.error('Error getting high-risk users:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get adaptive safety events for review (admin/safety team)
 */
export const pack211_admin_getSafetyEvents = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin or safety team role
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    const isAuthorized = userData?.roles?.admin === true || userData?.roles?.safety_team === true;
    
    if (!isAuthorized) {
      throw new functions.https.HttpsError('permission-denied', 'Admin or safety team access required');
    }

    const { requiresReview, severity, limit = 100 } = data as {
      requiresReview?: boolean;
      severity?: 'INFO' | 'WARNING' | 'CRITICAL';
      limit?: number;
    };

    try {
      let query = db.collection('adaptive_safety_events').orderBy('createdAt', 'desc');

      if (requiresReview !== undefined) {
        query = query.where('requiresReview', '==', requiresReview) as any;
      }

      if (severity) {
        query = query.where('severity', '==', severity) as any;
      }

      const snapshot = await query.limit(limit).get();

      const events = snapshot.docs.map(doc => ({
        eventId: doc.id,
        ...doc.data(),
      }));

      return {
        success: true,
        events,
        count: events.length,
      };
    } catch (error: any) {
      console.error('Error getting safety events:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get booking cooldown statistics (admin)
 */
export const pack211_admin_getCooldownStats = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const isAdmin = userDoc.data()?.roles?.admin === true;
    
    if (!isAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    try {
      const snapshot = await db.collection('booking_attempt_history').get();

      const stats = {
        totalHistories: snapshot.size,
        activeCooldowns: 0,
        permanentBlocks: 0,
        oneRejection: 0,
        twoRejections: 0,
        threeOrMore: 0,
      };

      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.permanentlyBlocked) stats.permanentBlocks++;
        if (data.cooldownActive) stats.activeCooldowns++;
        if (data.rejectionCount === 1) stats.oneRejection++;
        if (data.rejectionCount === 2) stats.twoRejections++;
        if (data.rejectionCount >= 3) stats.threeOrMore++;
      });

      return {
        success: true,
        stats,
      };
    } catch (error: any) {
      console.error('Error getting cooldown stats:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Manually adjust user risk score (admin emergency override)
 */
export const pack211_admin_adjustRiskScore = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const isAdmin = userDoc.data()?.roles?.admin === true;
    
    if (!isAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    const { userId, newScore, reason } = data as {
      userId: string;
      newScore: number;
      reason: string;
    };

    if (!userId || newScore === undefined || !reason) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'userId, newScore, and reason are required'
      );
    }

    if (newScore < 0 || newScore > 1000) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'newScore must be between 0 and 1000'
      );
    }

    try {
      const profileRef = db.collection('user_risk_profiles').doc(userId);
      const profileDoc = await profileRef.get();

      if (!profileDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User risk profile not found');
      }

      const oldScore = profileDoc.data()!.riskScore;

      await profileRef.update({
        riskScore: newScore,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Log the manual adjustment
      await db.collection('adaptive_safety_events').add({
        eventType: 'RISK_SCORE_INCREASED',
        userId,
        previousRiskScore: oldScore,
        newRiskScore: newScore,
        riskScoreDelta: newScore - oldScore,
        actionsTaken: [`Manual admin adjustment by ${context.auth.uid}`],
        requiresReview: false,
        severity: 'WARNING',
        description: `Admin ${context.auth.uid} manually adjusted risk score: ${reason}`,
        metadata: { reason, adjustedBy: context.auth.uid },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        oldScore,
        newScore,
        oldRiskLevel: getRiskLevel(oldScore),
        newRiskLevel: getRiskLevel(newScore),
      };
    } catch (error: any) {
      console.error('Error adjusting risk score:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);
