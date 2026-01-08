/**
 * Discovery Service
 * Handles profile discovery queries based on dating preferences
 * Includes boost and membership priority ranking
 */

import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
} from 'firebase/firestore';
import { ProfileData, DatingPreferences } from '../lib/profileService';
import { DISCOVERY_CONFIG, VIP_BENEFITS, ROYAL_BENEFITS } from '../config/monetization';
import { isProfileBoosted } from './boostService';
import { hasBoostBadge } from './leaderboardService';

/**
 * Calculate distance between two coordinates in kilometers
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get discovery profiles based on user preferences
 */
export async function getDiscoveryProfiles(
  currentUserId: string,
  userProfile: ProfileData,
  maxResults: number = 30
): Promise<ProfileData[]> {
  try {
    const db = getFirestore();
    const profilesRef = collection(db, 'profiles');

    const preferences = userProfile.datingPreferences || {
      whoIWant: ['everyone'],
      preferredAgeRange: [18, 55],
      preferredDistanceKm: 100,
    };

    // Base query: profileComplete and selfieVerified
    let q = query(
      profilesRef,
      where('profileComplete', '==', true),
      where('selfieVerified', '==', true)
    );

    const querySnapshot = await getDocs(q);
    const profiles: ProfileData[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data() as ProfileData;

      // Exclude current user
      if (data.uid === currentUserId) return;

      // Filter by gender preference
      if (!preferences.whoIWant.includes('everyone')) {
        // Handle 'prefer-not-to-say' as 'non-binary' for matching
        const matchGender = data.gender === 'prefer-not-to-say' ? 'non-binary' : data.gender;
        if (!preferences.whoIWant.includes(matchGender as any)) return;
      }

      // Filter by age range
      const [minAge, maxAge] = preferences.preferredAgeRange;
      if (data.age < minAge || data.age > maxAge) return;

      // Filter by distance if location data exists
      if (userProfile.location && data.location) {
        const distance = calculateDistance(
          userProfile.location.lat,
          userProfile.location.lng,
          data.location.lat,
          data.location.lng
        );
        if (distance > preferences.preferredDistanceKm) return;
      }

      profiles.push(data);
    });

    // Calculate boost status and leaderboard badges for all profiles
    const profilesWithBoost = await Promise.all(
      profiles.map(async (profile) => {
        const isBoosted = await isProfileBoosted(profile.uid);
        const hasLeaderboardBadge = await hasBoostBadge(profile.uid);
        return { profile, isBoosted, hasLeaderboardBadge };
      })
    );

    // Sort by match score with boost, leaderboard badge, and membership priority
    const sortedProfiles = profilesWithBoost
      .sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;

        // BOOST PRIORITY (highest priority - 10x multiplier)
        if (a.isBoosted) scoreA += 1000 * DISCOVERY_CONFIG.BOOST_MULTIPLIER;
        if (b.isBoosted) scoreB += 1000 * DISCOVERY_CONFIG.BOOST_MULTIPLIER;

        // LEADERBOARD BADGE BOOST (5x multiplier - surfaces top creators)
        // This is UI-only reordering, not artificial popularity
        if (a.hasLeaderboardBadge) scoreA += 500;
        if (b.hasLeaderboardBadge) scoreB += 500;

        // MEMBERSHIP PRIORITY
        // Royal members (7x total: 2x VIP + 5x Royal)
        if (a.profile.membership === 'royal') {
          scoreA += 700 * (VIP_BENEFITS.DISCOVERY_PRIORITY_MULTIPLIER + ROYAL_BENEFITS.DISCOVERY_PRIORITY_MULTIPLIER);
        }
        if (b.profile.membership === 'royal') {
          scoreB += 700 * (VIP_BENEFITS.DISCOVERY_PRIORITY_MULTIPLIER + ROYAL_BENEFITS.DISCOVERY_PRIORITY_MULTIPLIER);
        }

        // VIP members (2x)
        if (a.profile.membership === 'vip') {
          scoreA += 200 * VIP_BENEFITS.DISCOVERY_PRIORITY_MULTIPLIER;
        }
        if (b.profile.membership === 'vip') {
          scoreB += 200 * VIP_BENEFITS.DISCOVERY_PRIORITY_MULTIPLIER;
        }

        // Legacy isVIP flag support
        if (a.profile.isVIP) scoreA += 100;
        if (b.profile.isVIP) scoreB += 100;

        // Same city bonus
        if (a.profile.city === userProfile.city) scoreA += 50;
        if (b.profile.city === userProfile.city) scoreB += 50;

        // Shared interests
        const sharedA = a.profile.interests.filter((i) =>
          userProfile.interests.includes(i)
        ).length;
        const sharedB = b.profile.interests.filter((i) =>
          userProfile.interests.includes(i)
        ).length;
        scoreA += sharedA * 10;
        scoreB += sharedB * 10;

        return scoreB - scoreA;
      })
      .map(item => item.profile)
      .slice(0, maxResults);

    return sortedProfiles;
  } catch (error) {
    console.error('Error fetching discovery profiles:', error);
    throw error;
  }
}

/**
 * Get profiles for swipe deck (similar to discovery but different ordering)
 */
export async function getSwipeProfiles(
  currentUserId: string,
  userProfile: ProfileData,
  excludeUserIds: string[] = [],
  maxResults: number = 50
): Promise<ProfileData[]> {
  try {
    const profiles = await getDiscoveryProfiles(
      currentUserId,
      userProfile,
      maxResults + excludeUserIds.length
    );

    // Filter out already swiped profiles
    return profiles
      .filter((p) => !excludeUserIds.includes(p.uid))
      .slice(0, maxResults);
  } catch (error) {
    console.error('Error fetching swipe profiles:', error);
    throw error;
  }
}

/**
 * Get mini discovery grid (local users only, for home screen)
 */
export async function getMiniDiscoveryProfiles(
  currentUserId: string,
  userProfile: ProfileData,
  maxResults: number = 12
): Promise<ProfileData[]> {
  try {
    const profiles = await getDiscoveryProfiles(
      currentUserId,
      userProfile,
      maxResults * 2
    );

    // Prioritize local profiles
    return profiles
      .filter((p) => p.city === userProfile.city)
      .slice(0, maxResults);
  } catch (error) {
    console.error('Error fetching mini discovery profiles:', error);
    return [];
  }
}