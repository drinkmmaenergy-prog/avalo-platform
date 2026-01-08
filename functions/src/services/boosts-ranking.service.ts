/**
 * PACK 252 - BOOSTS MARKETPLACE
 * Ranking algorithm with boost priority logic
 */

import { db } from '../init';
import { BoostType, BoostRankingModifier, ActiveBoost } from '../types/boosts.types';
import { getActiveBoosts } from './boosts.service';

/**
 * Priority scores for ranking
 */
const RANKING_PRIORITIES = {
  SAFETY_VERIFIED: 1000,      // Highest priority
  BOOST_ACTIVE: 500,           // Above normal ranking
  ROYAL_BADGE: 300,            // Higher than normal
  LOW_POPULARITY: 150,         // Protected low-popularity profiles
  STANDARD: 100,               // Normal ranking
  UNVERIFIED: 50               // Lower priority
};

/**
 * Visibility multipliers for different boost types
 */
const VISIBILITY_MULTIPLIERS = {
  [BoostType.SUPER_VISIBILITY]: 3,
  [BoostType.BOOST_PACK]: 3,
  [BoostType.SPOTLIGHT]: 2,
  [BoostType.TRENDING_BADGE]: 1.5,
  [BoostType.LOCATION_JUMP]: 1
};

/**
 * Calculate ranking modifier for a user
 */
export async function calculateRankingModifier(
  userId: string
): Promise<BoostRankingModifier> {
  try {
    // Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return {
        userId,
        priorityScore: RANKING_PRIORITIES.STANDARD,
        multiplier: 1,
        badges: []
      };
    }

    const userData = userDoc.data();
    let priorityScore = RANKING_PRIORITIES.STANDARD;
    let multiplier = 1;
    const badges: string[] = [];
    let locationOverride: { latitude: number; longitude: number } | undefined;

    // 1. Safety & Identity Verification (Highest Priority)
    if (userData?.verified === true || userData?.identityVerified === true) {
      priorityScore = RANKING_PRIORITIES.SAFETY_VERIFIED;
    }

    // 2. Check for active boosts
    const activeBoosts = await getActiveBoosts(userId);
    
    if (activeBoosts.length > 0) {
      // User has active boosts - increase priority
      priorityScore = Math.max(priorityScore, RANKING_PRIORITIES.BOOST_ACTIVE);

      // Apply boost effects
      for (const boost of activeBoosts) {
        // Add visibility multiplier
        const boostMultiplier = VISIBILITY_MULTIPLIERS[boost.type] || 1;
        multiplier = Math.max(multiplier, boostMultiplier);

        // Add badges
        if (boost.type === BoostType.TRENDING_BADGE || boost.type === BoostType.BOOST_PACK) {
          badges.push('trending');
        }
        
        if (boost.type === BoostType.SPOTLIGHT || boost.type === BoostType.BOOST_PACK) {
          badges.push('spotlight');
        }

        // Location override
        if (boost.type === BoostType.LOCATION_JUMP && boost.targetLocation) {
          if (boost.targetLocation.latitude && boost.targetLocation.longitude) {
            locationOverride = {
              latitude: boost.targetLocation.latitude,
              longitude: boost.targetLocation.longitude
            };
          }
        }
      }
    }

    // 3. Royal Badge (if no boost active, applies higher than normal)
    if (userData?.badges?.includes('royal') && priorityScore < RANKING_PRIORITIES.BOOST_ACTIVE) {
      priorityScore = RANKING_PRIORITIES.ROYAL_BADGE;
      badges.push('royal');
    }

    // 4. Low-popularity protection (profiles with low engagement get a boost)
    const profileViews = userData?.stats?.profileViews || 0;
    const matches = userData?.stats?.matches || 0;
    if (profileViews < 50 && matches < 10 && priorityScore === RANKING_PRIORITIES.STANDARD) {
      priorityScore = RANKING_PRIORITIES.LOW_POPULARITY;
    }

    return {
      userId,
      priorityScore,
      multiplier,
      badges,
      locationOverride
    };
  } catch (error) {
    console.error('Error calculating ranking modifier:', error);
    // Return default values on error
    return {
      userId,
      priorityScore: RANKING_PRIORITIES.STANDARD,
      multiplier: 1,
      badges: []
    };
  }
}

/**
 * Get ranking modifiers for multiple users
 */
export async function calculateBulkRankingModifiers(
  userIds: string[]
): Promise<BoostRankingModifier[]> {
  try {
    const modifiers = await Promise.all(
      userIds.map(userId => calculateRankingModifier(userId))
    );
    return modifiers;
  } catch (error) {
    console.error('Error calculating bulk ranking modifiers:', error);
    return userIds.map(userId => ({
      userId,
      priorityScore: RANKING_PRIORITIES.STANDARD,
      multiplier: 1,
      badges: []
    }));
  }
}

/**
 * Sort users by ranking priority
 */
export function sortByRankingPriority(
  modifiers: BoostRankingModifier[]
): BoostRankingModifier[] {
  return modifiers.sort((a, b) => {
    // First sort by priority score
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    
    // Then by multiplier
    if (b.multiplier !== a.multiplier) {
      return b.multiplier - a.multiplier;
    }
    
    // Then by number of badges
    return b.badges.length - a.badges.length;
  });
}

/**
 * Apply boost ranking to discovery feed
 * This function should be called when generating discovery feeds
 */
export async function applyBoostRanking(
  userIds: string[]
): Promise<string[]> {
  try {
    // Calculate ranking modifiers for all users
    const modifiers = await calculateBulkRankingModifiers(userIds);
    
    // Sort by priority
    const sortedModifiers = sortByRankingPriority(modifiers);
    
    // Return sorted user IDs
    return sortedModifiers.map(m => m.userId);
  } catch (error) {
    console.error('Error applying boost ranking:', error);
    // Return original order on error
    return userIds;
  }
}

/**
 * Check if user should appear in specific location due to Location Jump boost
 */
export async function getEffectiveLocation(
  userId: string,
  defaultLocation: { latitude: number; longitude: number }
): Promise<{ latitude: number; longitude: number }> {
  try {
    const modifier = await calculateRankingModifier(userId);
    
    if (modifier.locationOverride) {
      return modifier.locationOverride;
    }
    
    return defaultLocation;
  } catch (error) {
    console.error('Error getting effective location:', error);
    return defaultLocation;
  }
}

/**
 * Get users with active boosts in a region
 */
export async function getBoostedUsersInRegion(
  centerLat: number,
  centerLng: number,
  radiusKm: number = 50
): Promise<string[]> {
  try {
    // Get all users with location jump boosts
    const now = Date.now();
    const snapshot = await db.collection('boosts')
      .where('type', '==', BoostType.LOCATION_JUMP)
      .where('isActive', '==', true)
      .where('endTime', '>', now)
      .get();

    const userIds: string[] = [];

    for (const doc of snapshot.docs) {
      const boost = doc.data() as ActiveBoost;
      
      if (boost.targetLocation?.latitude && boost.targetLocation?.longitude) {
        // Calculate distance
        const distance = calculateDistance(
          centerLat,
          centerLng,
          boost.targetLocation.latitude,
          boost.targetLocation.longitude
        );
        
        if (distance <= radiusKm) {
          userIds.push(boost.userId);
        }
      }
    }

    return userIds;
  } catch (error) {
    console.error('Error getting boosted users in region:', error);
    return [];
  }
}

/**
 * Calculate distance between two coordinates in kilometers
 * Using Haversine formula
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}