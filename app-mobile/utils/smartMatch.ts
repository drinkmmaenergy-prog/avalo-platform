/**
 * SmartMatch Scoring Utility
 * ===========================
 * 100% offline client-side scoring
 * NO backend calls, NO API consumption
 * 
 * Scores profiles based on:
 * - Shared interests overlap
 * - Age preference compatibility
 * - Location radius
 * - Activity score (recent usage)
 * - Membership tier bonuses
 */

export type MembershipTier = 'FREE' | 'VIP' | 'ROYAL';
export type MatchTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'TOP';

export interface SmartMatchInput {
  // Shared interests (0-100%)
  interestsOverlap: number;
  
  // Age compatibility (0-100%)
  ageCompatibility: number;
  
  // Location score (0-100%, closer = higher)
  locationScore: number;
  
  // Activity score (0-100%, more recent = higher)
  activityScore: number;
  
  // User's membership tier
  membershipTier: MembershipTier;
}

export interface SmartMatchResult {
  score: number;
  tier: MatchTier;
  breakdown: {
    interests: number;
    age: number;
    location: number;
    activity: number;
    tierBonus: number;
  };
}

/**
 * Calculate SmartMatch score for a profile
 */
export function calculateSmartMatch(input: SmartMatchInput): SmartMatchResult {
  // Base weights for each factor
  const weights = {
    interests: 0.35,      // 35% - Most important
    age: 0.25,            // 25% - Very important
    location: 0.20,       // 20% - Important
    activity: 0.20,       // 20% - Important
  };

  // Calculate weighted scores
  const interestsScore = input.interestsOverlap * weights.interests;
  const ageScore = input.ageCompatibility * weights.age;
  const locationScore = input.locationScore * weights.location;
  const activityScore = input.activityScore * weights.activity;

  // Base score (0-100)
  let baseScore = interestsScore + ageScore + locationScore + activityScore;

  // Membership tier bonuses
  let tierBonus = 0;
  switch (input.membershipTier) {
    case 'VIP':
      tierBonus = 5;  // +5 points
      break;
    case 'ROYAL':
      tierBonus = 12; // +12 points
      break;
    default:
      tierBonus = 0;
  }

  // Final score with tier bonus
  const finalScore = Math.min(100, baseScore + tierBonus);

  // Determine tier based on final score
  let tier: MatchTier;
  if (finalScore >= 85) {
    tier = 'TOP';       // 85-100: Top tier matches
  } else if (finalScore >= 70) {
    tier = 'HIGH';      // 70-84: High quality matches
  } else if (finalScore >= 50) {
    tier = 'MEDIUM';    // 50-69: Medium matches
  } else {
    tier = 'LOW';       // 0-49: Low matches
  }

  return {
    score: Math.round(finalScore),
    tier,
    breakdown: {
      interests: Math.round(interestsScore),
      age: Math.round(ageScore),
      location: Math.round(locationScore),
      activity: Math.round(activityScore),
      tierBonus,
    },
  };
}

/**
 * Calculate interests overlap percentage
 * @param userInterests Array of user's interest IDs
 * @param profileInterests Array of profile's interest IDs
 * @returns Overlap percentage (0-100)
 */
export function calculateInterestsOverlap(
  userInterests: string[],
  profileInterests: string[]
): number {
  if (!userInterests?.length || !profileInterests?.length) {
    return 0;
  }

  const userSet = new Set(userInterests);
  const profileSet = new Set(profileInterests);
  
  let matchCount = 0;
  userSet.forEach(interest => {
    if (profileSet.has(interest)) {
      matchCount++;
    }
  });

  // Calculate percentage based on the larger set
  const maxPossible = Math.max(userInterests.length, profileInterests.length);
  const overlapPercentage = (matchCount / maxPossible) * 100;
  
  return Math.min(100, overlapPercentage);
}

/**
 * Calculate age compatibility score
 * @param userAge User's age
 * @param profileAge Profile's age
 * @param userMinAge User's minimum age preference
 * @param userMaxAge User's maximum age preference
 * @returns Compatibility score (0-100)
 */
export function calculateAgeCompatibility(
  userAge: number,
  profileAge: number,
  userMinAge: number,
  userMaxAge: number
): number {
  // Check if profile age is within user's preferences
  if (profileAge < userMinAge || profileAge > userMaxAge) {
    return 0; // Outside preferences
  }

  // Calculate how close to the middle of the range
  const midPoint = (userMinAge + userMaxAge) / 2;
  const range = userMaxAge - userMinAge;
  
  if (range === 0) {
    return profileAge === userMinAge ? 100 : 0;
  }

  const distance = Math.abs(profileAge - midPoint);
  const maxDistance = range / 2;
  
  // Closer to middle = higher score
  const score = 100 - (distance / maxDistance) * 30; // Max penalty: 30 points
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate location score based on distance
 * @param distanceKm Distance in kilometers
 * @param maxDistanceKm Maximum distance preference
 * @returns Location score (0-100)
 */
export function calculateLocationScore(
  distanceKm: number,
  maxDistanceKm: number
): number {
  if (distanceKm > maxDistanceKm) {
    return 0; // Outside range
  }

  if (maxDistanceKm === 0) {
    return 100;
  }

  // Closer = higher score (inverse linear)
  const score = 100 - (distanceKm / maxDistanceKm) * 100;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate activity score based on last active time
 * @param lastActiveAt Timestamp of last activity
 * @returns Activity score (0-100)
 */
export function calculateActivityScore(lastActiveAt: Date | number | string): number {
  const now = Date.now();
  const lastActive = typeof lastActiveAt === 'number' 
    ? lastActiveAt 
    : new Date(lastActiveAt).getTime();
  
  const hoursSinceActive = (now - lastActive) / (1000 * 60 * 60);

  // Scoring:
  // < 1 hour = 100
  // < 24 hours = 80-100
  // < 7 days = 50-80
  // < 30 days = 20-50
  // > 30 days = 0-20

  if (hoursSinceActive < 1) {
    return 100;
  } else if (hoursSinceActive < 24) {
    return 80 + (24 - hoursSinceActive) / 24 * 20;
  } else if (hoursSinceActive < 24 * 7) {
    const days = hoursSinceActive / 24;
    return 50 + (7 - days) / 7 * 30;
  } else if (hoursSinceActive < 24 * 30) {
    const days = hoursSinceActive / 24;
    return 20 + (30 - days) / 30 * 30;
  } else {
    const days = hoursSinceActive / 24;
    return Math.max(0, 20 - (days - 30) / 30 * 20);
  }
}

/**
 * Get display color for match tier
 */
export function getMatchTierColor(tier: MatchTier): string {
  switch (tier) {
    case 'TOP':
      return '#D4AF37'; // Gold
    case 'HIGH':
      return '#26D0CE'; // Turquoise
    case 'MEDIUM':
      return '#A0AEC0'; // Gray
    case 'LOW':
      return '#718096'; // Light Gray
  }
}

/**
 * Get display label for match tier
 */
export function getMatchTierLabel(tier: MatchTier): string {
  switch (tier) {
    case 'TOP':
      return 'Top Match';
    case 'HIGH':
      return 'High Match';
    case 'MEDIUM':
      return 'Good Match';
    case 'LOW':
      return 'Potential Match';
  }
}