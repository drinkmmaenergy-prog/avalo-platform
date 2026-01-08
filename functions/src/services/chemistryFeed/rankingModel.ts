/**
 * PACK 208 — Chemistry Ranking Model
 * Adaptive attraction ranking with multi-signal scoring
 */

import {
  UserProfile,
  SwipeBehavior,
  ChemistrySignals,
  ChemistryScore,
} from './types';
import {
  calculatePhotoAttractivenessScore,
  getVisualAppealMultiplier,
} from './signalsAesthetic';

/**
 * Calculate comprehensive chemistry score for a profile
 */
export function calculateChemistryScore(
  viewerProfile: UserProfile,
  candidateProfile: UserProfile,
  viewerBehavior?: SwipeBehavior,
  missionCompletionData?: { completed: boolean; recentActivity: boolean }
): ChemistryScore {
  const signals: ChemistrySignals = {
    photoAttractivenessScore: calculatePhotoAttractivenessScore(candidateProfile),
    verifiedBoost: candidateProfile.verified ? 20 : 0,
    popularityScore: calculatePopularityScore(candidateProfile),
    completenessScore: calculateCompletenessScore(candidateProfile),
    preferencesMatchScore: calculatePreferencesMatch(viewerProfile, candidateProfile),
    behaviorMatchScore: viewerBehavior ? calculateBehaviorMatch(viewerBehavior, candidateProfile) : 50,
    locationScore: calculateLocationScore(viewerProfile, candidateProfile),
    timeOfDayBoost: calculateTimeOfDayBoost(),
    missionCompletionBoost: missionCompletionData?.completed ? 15 : 0,
    safetyPenalty: calculateSafetyPenalty(candidateProfile),
  };

  // Calculate weighted total score
  const totalScore = calculateWeightedScore(signals);

  // Determine category
  const category = determineCategory(candidateProfile);

  // Apply discovery boost (5-10% random for diversity)
  const discoveryBoost = Math.random() < 0.075; // 7.5% chance

  return {
    userId: candidateProfile.userId,
    totalScore,
    signals,
    category,
    discoveryBoost,
  };
}

/**
 * Calculate weighted chemistry score from signals
 */
function calculateWeightedScore(signals: ChemistrySignals): number {
  // Base score from signals
  let score = 0;

  // Photo attractiveness (25% weight)
  score += signals.photoAttractivenessScore * 0.25;

  // Verified boost (+20 points directly)
  score += signals.verifiedBoost;

  // Popularity (15% weight)
  score += signals.popularityScore * 0.15;

  // Profile completeness (10% weight)
  score += signals.completenessScore * 0.10;

  // Preferences match (20% weight)
  score += signals.preferencesMatchScore * 0.20;

  // Behavior match (15% weight)
  score += signals.behaviorMatchScore * 0.15;

  // Location (10% weight)
  score += signals.locationScore * 0.10;

  // Time of day boost
  score += signals.timeOfDayBoost;

  // Mission completion boost
  score += signals.missionCompletionBoost;

  // Apply safety penalty
  score -= signals.safetyPenalty;

  // Normalize to 0-100 range
  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate popularity score
 */
function calculatePopularityScore(profile: UserProfile): number {
  if (!profile.popularity) return 30; // Default for new users

  const { likesReceived, matchCount, chatCount } = profile.popularity;

  // Weighted popularity calculation
  let score = 0;

  // Likes received (up to 30 points)
  score += Math.min(30, likesReceived / 10);

  // Match count (up to 30 points)
  score += Math.min(30, matchCount / 5);

  // Chat count (up to 40 points - most valuable)
  score += Math.min(40, chatCount / 3);

  return Math.min(100, score);
}

/**
 * Calculate profile completeness score
 */
function calculateCompletenessScore(profile: UserProfile): number {
  let score = 0;

  // Photos (40 points)
  if (profile.photos && profile.photos.length > 0) {
    score += 20;
    if (profile.photos.length >= 3) score += 20;
  }

  // Bio (30 points)
  if (profile.bio && profile.bio.length > 20) {
    score += 30;
  }

  // Preferences (30 points)
  if (profile.preferences) {
    if (profile.preferences.gender && profile.preferences.gender.length > 0) score += 10;
    if (profile.preferences.ageMin && profile.preferences.ageMax) score += 10;
    if (profile.preferences.vibeTags && profile.preferences.vibeTags.length > 0) score += 10;
  }

  return score;
}

/**
 * Calculate preferences match score
 */
function calculatePreferencesMatch(
  viewer: UserProfile,
  candidate: UserProfile
): number {
  let score = 50; // Base score

  // Gender preference match
  if (viewer.preferences?.gender && viewer.preferences.gender.length > 0) {
    if (viewer.preferences.gender.includes(candidate.gender)) {
      score += 25;
    } else {
      score -= 20;
    }
  }

  // Age preference match
  if (viewer.preferences?.ageMin && viewer.preferences?.ageMax) {
    if (
      candidate.age >= viewer.preferences.ageMin &&
      candidate.age <= viewer.preferences.ageMax
    ) {
      score += 15;
    } else {
      score -= 10;
    }
  }

  // Interests match
  if (viewer.interests && candidate.interests) {
    const commonInterests = viewer.interests.filter(interest =>
      candidate.interests?.includes(interest)
    );
    score += Math.min(10, commonInterests.length * 3);
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate behavior match based on swipe patterns
 */
function calculateBehaviorMatch(
  behavior: SwipeBehavior,
  candidate: UserProfile
): number {
  let score = 50; // Base score

  // Pattern matching
  if (behavior.patterns) {
    // Age pattern match
    if (behavior.patterns.preferredAgeRange) {
      const [minAge, maxAge] = behavior.patterns.preferredAgeRange;
      if (candidate.age >= minAge && candidate.age <= maxAge) {
        score += 20;
      } else {
        score -= 10;
      }
    }

    // Gender pattern match
    if (behavior.patterns.likedGenders && behavior.patterns.likedGenders.length > 0) {
      if (behavior.patterns.likedGenders.includes(candidate.gender)) {
        score += 20;
      }
    }

    // Distance pattern match
    if (behavior.patterns.preferredDistance && candidate.location?.distanceKm) {
      if (candidate.location.distanceKm <= behavior.patterns.preferredDistance) {
        score += 10;
      }
    }
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate location-based score
 */
function calculateLocationScore(viewer: UserProfile, candidate: UserProfile): number {
  if (!viewer.location || !candidate.location || candidate.location.distanceKm === undefined) {
    return 50; // Neutral score if location unavailable
  }

  const distance = candidate.location.distanceKm;

  // Score based on distance (closer = higher score)
  if (distance <= 5) return 100;
  if (distance <= 10) return 90;
  if (distance <= 20) return 75;
  if (distance <= 50) return 60;
  if (distance <= 100) return 40;
  return 25;
}

/**
 * Calculate time-of-day boost
 * Peak hours get slight boost for active users
 */
function calculateTimeOfDayBoost(): number {
  const hour = new Date().getHours();

  // Peak hours: 18:00 - 23:00 (evening)
  if (hour >= 18 && hour <= 23) return 10;

  // Secondary peak: 12:00 - 14:00 (lunch)
  if (hour >= 12 && hour <= 14) return 5;

  return 0;
}

/**
 * Calculate safety penalty
 */
function calculateSafetyPenalty(profile: UserProfile): number {
  if (!profile.safetyFlags) return 0;

  let penalty = 0;

  // Ban risk penalty (0-1 scale)
  penalty += profile.safetyFlags.banRisk * 30;

  // NSFW flags penalty
  penalty += Math.min(20, profile.safetyFlags.nsfwFlags * 5);

  // Report strikes penalty
  penalty += Math.min(15, profile.safetyFlags.reportStrikes * 3);

  return Math.min(50, penalty);
}

/**
 * Determine user category for feed priority
 */
function determineCategory(
  profile: UserProfile
): 'verified' | 'medium_popularity' | 'low_popularity' | 'high_popularity' {
  // Verified users always get top priority
  if (profile.verified) return 'verified';

  const popularity = profile.popularity;
  if (!popularity) return 'low_popularity';

  const totalInteractions = popularity.likesReceived + popularity.matchCount + popularity.chatCount;

  if (totalInteractions >= 100) return 'high_popularity';
  if (totalInteractions >= 20) return 'medium_popularity';
  return 'low_popularity';
}

/**
 * Apply category-based feed priority
 */
export function applyCategoryPriority(scores: ChemistryScore[]): ChemistryScore[] {
  const priorityWeights = {
    verified: 1.3,
    high_popularity: 0.9, // Slightly reduced to prevent domination
    medium_popularity: 1.1,
    low_popularity: 1.0,
  };

  return scores.map(score => ({
    ...score,
    totalScore: Math.min(100, score.totalScore * priorityWeights[score.category]),
  }));
}

/**
 * Apply discovery boost randomization
 * 5-10% of profiles get random boost for diversity
 */
export function applyDiscoveryBoost(scores: ChemistryScore[]): ChemistryScore[] {
  return scores.map(score => {
    if (score.discoveryBoost) {
      return {
        ...score,
        totalScore: Math.min(100, score.totalScore + Math.random() * 15 + 5),
      };
    }
    return score;
  });
}

/**
 * Sort profiles by chemistry score
 */
export function sortByChemistry(scores: ChemistryScore[]): ChemistryScore[] {
  return [...scores].sort((a, b) => b.totalScore - a.totalScore);
}

console.log('✅ PACK 208: Ranking Model module loaded');