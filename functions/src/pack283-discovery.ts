/**
 * PACK 283 — Discovery & People Browser (Free, Nearby Grid, Visitors)
 * 
 * Purpose: Implement the Discovery layer for Avalo: a free, map/grid-style people browser
 * where users can see profiles in their area (and via Passport), plus visitors/profile-views tracking.
 * 
 * Features:
 * - Free, unlimited browsing (no tokens, no subscription paywall)
 * - Visible info per tile: main photo, name, age, city/distance
 * - Tap → full profile screen
 * - Respects: orientation + gender preference, 18+ only, bans/risk flags, NSFW settings
 * - VIP/Royal only affect ranking & visibility, not access
 * - Incognito mode support
 * - Passport location switching
 * - Profile views tracking ("Visitors" feature)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { checkSwipeVerificationRequirements, throwVerificationError } from './pack309-swipe-verification';
import { logDiscoveryAnalyticsEvent } from './pack309-analytics-integration';

const db = admin.firestore();

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface DiscoveryPresence {
  userId: string;
  gender: 'male' | 'female' | 'nonbinary';
  age: number;
  city: string;
  country: string;
  location: {
    lat: number;
    lng: number;
    accuracyMeters: number;
  };
  verified: boolean;
  profileScore: number; // 0-100
  nsfwLevel: 'safe' | 'soft' | 'erotic';
  isIncognito: boolean;
  hasPassport: boolean;
  passportLocation?: {
    city: string;
    country: string;
  };
  lastActiveAt: FirebaseFirestore.Timestamp;
  riskScore: number;
  banLevel: 'none' | 'soft' | 'shadow' | 'full';
}

export interface ProfileView {
  viewId: string;
  viewerId: string;
  targetId: string;
  createdAt: FirebaseFirestore.Timestamp;
  source: 'discovery' | 'feed' | 'match' | 'search' | 'profile';
}

export interface DiscoveryProfile {
  userId: string;
  name: string;
  age: number;
  city: string;
  distanceKm: number;
  mainPhotoUrl: string;
  verified: boolean;
  nsfwLevel: 'safe' | 'soft' | 'erotic';
  subscriptionTier: 'free' | 'vip' | 'royal';
}

export interface DiscoveryBrowseParams {
  lat: number;
  lng: number;
  radiusKm: number;
  cursor?: string;
  limit: number;
  ageMin?: number;
  ageMax?: number;
  genderPreference?: string[];
  onlyVerified?: boolean;
  nsfwFilter?: string[];
}

export interface VisitorProfile {
  viewerId: string;
  name: string;
  age: number;
  city: string;
  viewedAt: FirebaseFirestore.Timestamp;
  incognito: boolean;
  mainPhotoUrl?: string;
  verified: boolean;
}

// ============================================================================
// HAVERSINE DISTANCE CALCULATION
// ============================================================================

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================================================
// RANKING LOGIC
// ============================================================================

function calculateDiscoveryScore(
  profile: DiscoveryPresence,
  userLocation: { lat: number; lng: number },
  preferences: {
    ageMin: number;
    ageMax: number;
    genderPreference?: string[];
  }
): number {
  let score = 100;

  // Distance penalty (closer = higher score)
  const distance = calculateDistance(
    userLocation.lat,
    userLocation.lng,
    profile.location.lat,
    profile.location.lng
  );
  const distancePenalty = Math.min(distance / 100, 50); // Max 50 point penalty
  score -= distancePenalty;

  // Activity bonus (recent activity = higher score)
  const hoursSinceActive =
    (Date.now() - profile.lastActiveAt.toMillis()) / (1000 * 60 * 60);
  if (hoursSinceActive < 1) score += 20;
  else if (hoursSinceActive < 24) score += 10;
  else if (hoursSinceActive < 168) score += 5;

  // Verification bonus
  if (profile.verified) score += 15;

  // Profile quality bonus
  score += profile.profileScore * 0.2; // Max 20 points

  // Subscription tier boost
  if (profile.banLevel === 'none') {
    // Royal gets modest boost
    score += 5; // Small boost for premium users
  }

  // Safety penalties
  if (profile.riskScore > 50) score -= 20;
  if (profile.banLevel !== 'none') score = 0; // Banned users get zero score

  return Math.max(0, score);
}

// ============================================================================
// DISCOVERY BROWSE API
// ============================================================================

export const discoveryBrowse = functions.https.onCall(
  async (data: DiscoveryBrowseParams, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const {
      lat,
      lng,
      radiusKm = 50,
      limit = 40,
      ageMin = 18,
      ageMax = 80,
      genderPreference,
      onlyVerified = false,
      nsfwFilter = ['safe', 'soft'],
    } = data;

    const userId = context.auth.uid;

    try {
      // PACK 309: Check 18+ verification requirement
      const verificationCheck = await checkSwipeVerificationRequirements(userId);
      if (!verificationCheck.allowed) {
        throwVerificationError(verificationCheck.reason!);
      }
      
      // PACK 309: Log discovery browse analytics
      await logDiscoveryAnalyticsEvent(userId, 'DISCOVERY_BROWSE', {
        radiusKm,
        filters: { ageMin, ageMax, genderPreference, onlyVerified, nsfwFilter }
      });
      
      // Get user's own data for filtering
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data()!;
      const userAge = userData.age || 18;
      const userGender = userData.gender || 'other';
      const userIncognito = userData.incognito || false;

      // Build query for discoveryPresence
      let query = db.collection('discoveryPresence')
        .where('isIncognito', '==', false)
        .where('banLevel', '==', 'none')
        .where('age', '>=', ageMin)
        .where('age', '<=', ageMax)
        .orderBy('age')
        .orderBy('lastActiveAt', 'desc')
        .limit(limit * 2); // Fetch extra for post-filtering

      const snapshot = await query.get();

      if (snapshot.empty) {
        return {
          success: true,
          items: [],
          nextCursor: null,
        };
      }

      // Filter and score profiles
      const profiles: Array<DiscoveryProfile & { score: number }> = [];

      for (const doc of snapshot.docs) {
        const presence = doc.data() as DiscoveryPresence;

        // Skip self
        if (presence.userId === userId) continue;

        // Calculate distance
        const distance = calculateDistance(lat, lng, presence.location.lat, presence.location.lng);

        // Skip if too far
        if (distance > radiusKm) continue;

        // Apply NSFW filter
        if (!nsfwFilter.includes(presence.nsfwLevel)) continue;

        // Apply verified filter
        if (onlyVerified && !presence.verified) continue;

        // Gender preference filter
        if (genderPreference && genderPreference.length > 0) {
          if (!genderPreference.includes(presence.gender)) continue;
        }

        // Calculate ranking score
        const score = calculateDiscoveryScore(
          presence,
          { lat, lng },
          { ageMin, ageMax, genderPreference }
        );

        // Get user's main photo
        const userPhotoDoc = await db
          .collection('users')
          .doc(presence.userId)
          .get();

        if (!userPhotoDoc.exists) continue;

        const userPhotoData = userPhotoDoc.data();
        const photos = userPhotoData?.photos || [];
        const mainPhotoUrl = photos.length > 0 ? photos[0].url : '';

        // Build profile object
        const profile: DiscoveryProfile & { score: number } = {
          userId: presence.userId,
          name: userPhotoData?.displayName || 'User',
          age: presence.age,
          city: presence.city,
          distanceKm: Math.round(distance * 10) / 10,
          mainPhotoUrl,
          verified: presence.verified,
          nsfwLevel: presence.nsfwLevel,
          subscriptionTier: userPhotoData?.subscription?.tier || 'free',
          score,
        };

        profiles.push(profile);
      }

      // Sort by score (highest first)
      profiles.sort((a, b) => b.score - a.score);

      // Limit to requested amount
      const items = profiles.slice(0, limit).map(({ score, ...profile }) => profile);

      return {
        success: true,
        items,
        nextCursor: items.length === limit ? items[items.length - 1].userId : null,
      };
    } catch (error: any) {
      console.error('Error in discoveryBrowse:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// PROFILE VIEW TRACKING
// ============================================================================

export const trackProfileView = functions.https.onCall(
  async (data: { targetId: string; source: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { targetId, source } = data;
    const viewerId = context.auth.uid;

    // Validate source
    const validSources = ['discovery', 'feed', 'match', 'search', 'profile'];
    if (!validSources.includes(source)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid source'
      );
    }

    try {
      // PACK 309: Check 18+ verification for discovery views
      if (source === 'discovery') {
        const verificationCheck = await checkSwipeVerificationRequirements(viewerId);
        if (!verificationCheck.allowed) {
          throwVerificationError(verificationCheck.reason!);
        }
      }
      
      // Get viewer's data
      const viewerDoc = await db.collection('users').doc(viewerId).get();
      if (!viewerDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Viewer not found');
      }

      const viewerData = viewerDoc.data()!;
      const isIncognito = viewerData.incognito || false;

      // Don't track if viewer is in incognito (unless they have interacted)
      // For now, we'll skip incognito tracking entirely
      if (isIncognito) {
        return { success: true, tracked: false, reason: 'incognito' };
      }

      // Check if view already exists (within last 24 hours to avoid spam)
      const recentViewsQuery = await db
        .collection('profileViews')
        .where('viewerId', '==', viewerId)
        .where('targetId', '==', targetId)
        .where('createdAt', '>', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
        .limit(1)
        .get();

      if (!recentViewsQuery.empty) {
        return { success: true, tracked: false, reason: 'recent_view_exists' };
      }

      // Create profile view record
      const viewId = db.collection('profileViews').doc().id;
      await db.collection('profileViews').doc(viewId).set({
        viewId,
        viewerId,
        targetId,
        source,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // PACK 309: Log discovery profile view analytics
      if (source === 'discovery') {
        await logDiscoveryAnalyticsEvent(viewerId, 'DISCOVERY_PROFILE_VIEW', {
          targetId,
          source
        });
      }

      return { success: true, tracked: true, viewId };
    } catch (error: any) {
      console.error('Error in trackProfileView:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// GET PROFILE VISITORS
// ============================================================================

export const getProfileVisitors = functions.https.onCall(
  async (data: { limit?: number; cursor?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { limit = 50, cursor } = data;

    try {
      // Query profile views where target is current user
      let query = db
        .collection('profileViews')
        .where('targetId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit);

      if (cursor) {
        const cursorDoc = await db.collection('profileViews').doc(cursor).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      const snapshot = await query.get();

      if (snapshot.empty) {
        return {
          success: true,
          visitors: [],
          nextCursor: null,
        };
      }

      // Build visitor profiles
      const visitors: VisitorProfile[] = [];

      for (const doc of snapshot.docs) {
        const view = doc.data() as ProfileView;

        // Get viewer's profile data
        const viewerDoc = await db.collection('users').doc(view.viewerId).get();
        if (!viewerDoc.exists) continue;

        const viewerData = viewerDoc.data()!;
        const isIncognito = viewerData.incognito || false;

        // Handle incognito visitors
        if (isIncognito) {
          visitors.push({
            viewerId: 'incognito',
            name: 'Incognito User',
            age: 0,
            city: '',
            viewedAt: view.createdAt,
            incognito: true,
            verified: false,
          });
          continue;
        }

        // Regular visitor
        const photos = viewerData.photos || [];
        const mainPhotoUrl = photos.length > 0 ? photos[0].url : '';

        visitors.push({
          viewerId: view.viewerId,
          name: viewerData.displayName || 'User',
          age: viewerData.age || 18,
          city: viewerData.location?.city || '',
          viewedAt: view.createdAt,
          incognito: false,
          mainPhotoUrl,
          verified: viewerData.isVerified || false,
        });
      }

      return {
        success: true,
        visitors,
        nextCursor: snapshot.docs.length === limit ? snapshot.docs[snapshot.docs.length - 1].id : null,
      };
    } catch (error: any) {
      console.error('Error in getProfileVisitors:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// SYNC USER TO DISCOVERY PRESENCE (TRIGGER)
// ============================================================================

export const syncUserToDiscoveryPresence = functions.firestore
  .document('users/{userId}')
  .onWrite(async (change, context) => {
    const userId = context.params.userId;

    // If user deleted, remove from discovery
    if (!change.after.exists) {
      await db.collection('discoveryPresence').doc(userId).delete();
      return;
    }

    const userData = change.after.data()!;

    // Build discovery presence object
    const presence: DiscoveryPresence = {
      userId,
      gender: userData.gender || 'other',
      age: userData.age || 18,
      city: userData.location?.city || '',
      country: userData.location?.country || '',
      location: {
        lat: userData.location?.coordinates?.lat || 0,
        lng: userData.location?.coordinates?.lng || 0,
        accuracyMeters: userData.location?.accuracyMeters || 1000,
      },
      verified: userData.isVerified || false,
      profileScore: userData.profileQuality || 50,
      nsfwLevel: userData.nsfwLevel || 'safe',
      isIncognito: userData.incognito || false,
      hasPassport: userData.hasPassport || false,
      passportLocation: userData.passportLocation || undefined,
      lastActiveAt: userData.lastActive || admin.firestore.Timestamp.now(),
      riskScore: userData.riskScore || 0,
      banLevel: userData.banLevel || 'none',
    };

    // Update discovery presence
    await db.collection('discoveryPresence').doc(userId).set(presence, { merge: true });

    console.log(`Synced user ${userId} to discoveryPresence`);
  });

console.log('✅ PACK 283 — Discovery & People Browser initialized');