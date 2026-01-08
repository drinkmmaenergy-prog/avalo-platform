/**
 * PACK 49 — Personalization Event Recording & Profile APIs
 * Records user behavior events and exposes taste profile summaries
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, generateId } from './init';
import { computeTasteProfile, aggregateEventCounters } from '../personalizationEngine';

// ============================================================================
// TYPES
// ============================================================================

type PersonalizationEventType =
  | 'SWIPE_RIGHT'
  | 'CHAT_MESSAGE_SENT'
  | 'TOKENS_SPENT'
  | 'MEDIA_UNLOCK'
  | 'AI_MESSAGE'
  | 'PROFILE_VIEW'
  | 'COMPANION_SELECTED';

interface PersonalizationEventPayload {
  userId: string;
  type: PersonalizationEventType;
  targetUserId?: string;
  companionId?: string;
  tokensSpent?: number;
  interestsContext?: string[];
}

interface UserTasteProfile {
  userId: string;
  preferredAgeMin: number | null;
  preferredAgeMax: number | null;
  preferredDistanceKm: number | null;
  likedInterests: string[];
  dislikedInterests: string[];
  preferredGenders: string[];
  interactionIntensityScore: number;
  spenderScore: number;
  aiUsageScore: number;
  lastUpdatedAt: FirebaseFirestore.Timestamp;
}

// ============================================================================
// HTTP ENDPOINTS
// ============================================================================

/**
 * POST /personalization/event
 * Log a personalization event
 */
export const recordPersonalizationEvent = functions
  .region('europe-west3')
  .https.onCall(async (data: PersonalizationEventPayload, context) => {
    try {
      // Verify authentication
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const callerId = context.auth.uid;
      const { userId, type, targetUserId, companionId, tokensSpent, interestsContext } = data;

      // Verify the caller is acting on their own behalf
      if (callerId !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Cannot record events for other users'
        );
      }

      // Validate event type
      const validTypes: PersonalizationEventType[] = [
        'SWIPE_RIGHT',
        'CHAT_MESSAGE_SENT',
        'TOKENS_SPENT',
        'MEDIA_UNLOCK',
        'AI_MESSAGE',
        'PROFILE_VIEW',
        'COMPANION_SELECTED',
      ];

      if (!validTypes.includes(type)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          `Invalid event type: ${type}`
        );
      }

      // Create event document
      const eventId = generateId();
      const eventDoc = {
        eventId,
        userId,
        type,
        targetUserId: targetUserId || null,
        companionId: companionId || null,
        tokensSpent: tokensSpent || 0,
        interestsContext: interestsContext || [],
        createdAt: serverTimestamp(),
      };

      // Write to personalization_events collection
      await db.collection('personalization_events').doc(eventId).set(eventDoc);

      console.log(`[Personalization] Event recorded: ${type} for user ${userId}`);

      // Trigger lightweight profile update (non-blocking)
      // We'll schedule this asynchronously to avoid blocking the response
      setImmediate(() => {
        updateUserTasteProfile(userId).catch((error) => {
          console.error(`[Personalization] Error updating profile for ${userId}:`, error);
        });
      });

      return { ok: true, eventId };
    } catch (error: any) {
      console.error('[recordPersonalizationEvent] Error:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError('internal', error.message || 'Failed to record event');
    }
  });

/**
 * GET /personalization/profile?userId=...
 * Get user's taste profile summary
 */
export const getPersonalizationProfile = functions
  .region('europe-west3')
  .https.onCall(async (data: { userId: string }, context) => {
    try {
      // Verify authentication
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const callerId = context.auth.uid;
      const { userId } = data;

      // Verify the caller is requesting their own profile
      if (callerId !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Cannot access other users\' profiles'
        );
      }

      // Fetch user taste profile
      const profileDoc = await db.collection('user_taste_profiles').doc(userId).get();

      if (!profileDoc.exists) {
        // Return default profile if none exists
        return {
          ok: true,
          profile: {
            userId,
            preferredAgeMin: null,
            preferredAgeMax: null,
            preferredDistanceKm: null,
            likedInterests: [],
            dislikedInterests: [],
            preferredGenders: [],
            interactionIntensityScore: 0,
            spenderScore: 0,
            aiUsageScore: 0,
            lastUpdatedAt: null,
          },
        };
      }

      const profile = profileDoc.data() as UserTasteProfile;

      return {
        ok: true,
        profile: {
          userId: profile.userId,
          preferredAgeMin: profile.preferredAgeMin,
          preferredAgeMax: profile.preferredAgeMax,
          preferredDistanceKm: profile.preferredDistanceKm,
          likedInterests: profile.likedInterests || [],
          dislikedInterests: profile.dislikedInterests || [],
          preferredGenders: profile.preferredGenders || [],
          interactionIntensityScore: profile.interactionIntensityScore,
          spenderScore: profile.spenderScore,
          aiUsageScore: profile.aiUsageScore,
          lastUpdatedAt: profile.lastUpdatedAt?.toMillis() || null,
        },
      };
    } catch (error: any) {
      console.error('[getPersonalizationProfile] Error:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError('internal', error.message || 'Failed to get profile');
    }
  });

// ============================================================================
// BACKGROUND AGGREGATION
// ============================================================================

/**
 * Update user taste profile from recent events
 * Called asynchronously after event recording
 */
async function updateUserTasteProfile(userId: string): Promise<void> {
  try {
    // Fetch recent events (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const eventsSnapshot = await db
      .collection('personalization_events')
      .where('userId', '==', userId)
      .where('createdAt', '>=', ninetyDaysAgo)
      .limit(1000) // Cap at 1000 recent events for performance
      .get();

    if (eventsSnapshot.empty) {
      console.log(`[Personalization] No events for user ${userId}`);
      return;
    }

    // Aggregate events
    const events = eventsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        type: data.type,
        tokensSpent: data.tokensSpent || 0,
        interestsContext: data.interestsContext || [],
        targetGender: data.targetGender || null,
      };
    });

    const { counters, interestCounts, genderCounts } = aggregateEventCounters(events);

    // Compute taste profile
    const profile = computeTasteProfile({
      counters,
      interestCounts,
      genderCounts,
      agePrefMin: null, // Can be extended to extract from user preferences
      agePrefMax: null,
      distanceKm: null,
    });

    // Upsert user_taste_profiles document
    const profileData: UserTasteProfile = {
      userId,
      preferredAgeMin: profile.preferredAgeMin,
      preferredAgeMax: profile.preferredAgeMax,
      preferredDistanceKm: profile.preferredDistanceKm,
      likedInterests: profile.likedInterests,
      dislikedInterests: profile.dislikedInterests,
      preferredGenders: profile.preferredGenders,
      interactionIntensityScore: profile.interactionIntensityScore,
      spenderScore: profile.spenderScore,
      aiUsageScore: profile.aiUsageScore,
      lastUpdatedAt: serverTimestamp() as FirebaseFirestore.Timestamp,
    };

    await db.collection('user_taste_profiles').doc(userId).set(profileData, { merge: true });

    console.log(`[Personalization] Profile updated for user ${userId} - Interaction: ${profile.interactionIntensityScore}, Spender: ${profile.spenderScore}, AI: ${profile.aiUsageScore}`);
  } catch (error) {
    console.error(`[updateUserTasteProfile] Error for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Scheduled function: Update taste profiles for active users
 * Runs every 6 hours to refresh profiles
 */
export const scheduledProfileUpdate = functions
  .region('europe-west3')
  .pubsub.schedule('every 6 hours')
  .onRun(async (context) => {
    try {
      console.log('[Personalization] Starting scheduled profile update');

      // Get users with recent events (last 24 hours)
      const yesterdayAgo = new Date();
      yesterdayAgo.setDate(yesterdayAgo.getDate() - 1);

      const recentEventsSnapshot = await db
        .collection('personalization_events')
        .where('createdAt', '>=', yesterdayAgo)
        .limit(1000) // Process max 1000 active users per run
        .get();

      // Extract unique user IDs
      const activeUserIds = new Set<string>();
      recentEventsSnapshot.docs.forEach((doc) => {
        const userId = doc.data().userId;
        if (userId) {
          activeUserIds.add(userId);
        }
      });

      console.log(`[Personalization] Updating profiles for ${activeUserIds.size} active users`);

      // Update profiles for each active user
      const updatePromises = Array.from(activeUserIds).map((userId) =>
        updateUserTasteProfile(userId).catch((error) => {
          console.error(`[Personalization] Failed to update profile for ${userId}:`, error);
        })
      );

      await Promise.all(updatePromises);

      console.log('[Personalization] Scheduled profile update completed');
    } catch (error) {
      console.error('[scheduledProfileUpdate] Error:', error);
    }
  });

// ============================================================================
// FIRESTORE TRIGGER (ALTERNATIVE)
// ============================================================================

/**
 * Trigger on personalization event creation
 * Updates user profile when new events are logged
 */
export const onPersonalizationEventCreated = functions
  .region('europe-west3')
  .firestore.document('personalization_events/{eventId}')
  .onCreate(async (snap, context) => {
    try {
      const event = snap.data();
      const userId = event.userId;

      if (!userId) {
        console.warn('[onPersonalizationEventCreated] Event missing userId');
        return;
      }

      // Update user profile (throttled internally)
      await updateUserTasteProfile(userId);
    } catch (error) {
      console.error('[onPersonalizationEventCreated] Error:', error);
      // Don't throw - trigger failures shouldn't block event creation
    }
  });
