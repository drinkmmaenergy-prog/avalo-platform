/**
 * PACK 187 — Dating Intention & Chemistry Declaration System
 * Compatibility Calculation Engine
 */

import { Timestamp } from 'firebase-admin/firestore';
import {
  DatingIntentionBadge,
  IntentionCompatibility,
  UserDatingIntention,
  COMPATIBILITY_WEIGHTS,
  BADGE_COMPATIBILITY,
  BADGE_METADATA,
} from './types';

/**
 * Calculate compatibility score between two users based on their dating intentions
 * Returns a score from 0-100
 */
export function calculateCompatibilityScore(
  user1: UserDatingIntention,
  user2: UserDatingIntention
): IntentionCompatibility {
  let score = 0;
  const sharedIntentions: DatingIntentionBadge[] = [];
  const complementaryIntentions: DatingIntentionBadge[] = [];
  const conflictingIntentions: DatingIntentionBadge[] = [];

  // Base score if both users have any intentions set
  if (user1.badges.length > 0 && user2.badges.length > 0) {
    score = 20; // Base compatibility for having intentions
  }

  // Calculate exact matches
  for (const badge1 of user1.badges) {
    if (user2.badges.includes(badge1)) {
      sharedIntentions.push(badge1);
      score += COMPATIBILITY_WEIGHTS.EXACT_MATCH;
    }
  }

  // Calculate complementary matches
  for (const badge1 of user1.badges) {
    const compatibility = BADGE_COMPATIBILITY[badge1];
    
    for (const badge2 of user2.badges) {
      if (compatibility.complements.includes(badge2)) {
        if (!sharedIntentions.includes(badge1) && !complementaryIntentions.includes(badge2)) {
          complementaryIntentions.push(badge2);
          score += COMPATIBILITY_WEIGHTS.COMPLEMENTARY_MATCH;
        }
      }
      
      if (compatibility.conflicts.includes(badge2)) {
        if (!conflictingIntentions.includes(badge2)) {
          conflictingIntentions.push(badge2);
          score += COMPATIBILITY_WEIGHTS.CONFLICT_PENALTY;
        }
      }
    }
  }

  // Category-based compatibility (if no exact matches)
  if (sharedIntentions.length === 0) {
    const user1Categories = user1.badges.map(b => BADGE_METADATA[b].category);
    const user2Categories = user2.badges.map(b => BADGE_METADATA[b].category);
    
    for (const cat1 of user1Categories) {
      if (user2Categories.includes(cat1)) {
        score += COMPATIBILITY_WEIGHTS.CATEGORY_MATCH;
        break; // Only add once
      }
    }
  }

  // Normalize score to 0-100 range
  score = Math.max(0, Math.min(100, score));

  // Generate recommendation reason
  const recommendationReason = generateRecommendationReason(
    sharedIntentions,
    complementaryIntentions,
    conflictingIntentions,
    score
  );

  return {
    userId1: user1.userId,
    userId2: user2.userId,
    compatibilityScore: score,
    sharedIntentions,
    complementaryIntentions,
    conflictingIntentions,
    recommendationReason,
    calculatedAt: Timestamp.now(),
  };
}

/**
 * Generate human-readable reason for the compatibility score
 */
function generateRecommendationReason(
  shared: DatingIntentionBadge[],
  complementary: DatingIntentionBadge[],
  conflicting: DatingIntentionBadge[],
  score: number
): string {
  if (score >= 80) {
    if (shared.length > 0) {
      return `Excellent match! You both are ${BADGE_METADATA[shared[0]].displayName.toLowerCase()}.`;
    }
    return 'Excellent match! Your dating intentions align very well.';
  }

  if (score >= 60) {
    if (complementary.length > 0) {
      return `Good match! Your intentions complement each other well.`;
    }
    if (shared.length > 0) {
      return `Good match! You share similar dating goals.`;
    }
    return 'Compatible match! Your dating intentions work well together.';
  }

  if (score >= 40) {
    return 'Moderate compatibility. Some shared interests in dating style.';
  }

  if (conflicting.length > 0) {
    return 'Different dating goals. Open communication recommended.';
  }

  return 'Limited intention overlap. Worth exploring organically.';
}

/**
 * Batch calculate compatibility scores for a user against multiple potential matches
 */
export function calculateBatchCompatibility(
  sourceUser: UserDatingIntention,
  candidateUsers: UserDatingIntention[],
  minScore = 0
): IntentionCompatibility[] {
  const results: IntentionCompatibility[] = [];

  for (const candidate of candidateUsers) {
    // Skip if same user
    if (sourceUser.userId === candidate.userId) {
      continue;
    }

    const compatibility = calculateCompatibilityScore(sourceUser, candidate);
    
    // Only include if meets minimum score threshold
    if (compatibility.compatibilityScore >= minScore) {
      results.push(compatibility);
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

  return results;
}

/**
 * Calculate weighted match score for discovery feed ranking
 * Combines intention compatibility with other factors
 */
export interface MatchWeightFactors {
  intentionCompatibility: number; // 0-100
  profileCompleteness: number;    // 0-100
  activityLevel: number;          // 0-100
  mutualInterests: number;        // 0-100
  locationProximity?: number;     // 0-100 (optional)
}

export function calculateWeightedMatchScore(factors: MatchWeightFactors): number {
  // Weights for each factor
  const weights = {
    intentionCompatibility: 0.35,  // 35% - highest weight
    profileCompleteness: 0.15,     // 15%
    activityLevel: 0.20,           // 20%
    mutualInterests: 0.20,         // 20%
    locationProximity: 0.10,       // 10%
  };

  let weightedScore = 0;
  let totalWeight = 0;

  weightedScore += factors.intentionCompatibility * weights.intentionCompatibility;
  totalWeight += weights.intentionCompatibility;

  weightedScore += factors.profileCompleteness * weights.profileCompleteness;
  totalWeight += weights.profileCompleteness;

  weightedScore += factors.activityLevel * weights.activityLevel;
  totalWeight += weights.activityLevel;

  weightedScore += factors.mutualInterests * weights.mutualInterests;
  totalWeight += weights.mutualInterests;

  if (factors.locationProximity !== undefined) {
    weightedScore += factors.locationProximity * weights.locationProximity;
    totalWeight += weights.locationProximity;
  }

  // Normalize to 0-100
  return weightedScore / totalWeight;
}

/**
 * Determine if user's preferences allow them to be shown a potential match
 */
export function shouldShowMatch(
  sourceUser: UserDatingIntention,
  candidateUser: UserDatingIntention,
  compatibility: IntentionCompatibility
): boolean {
  // If source user has min compatibility threshold
  if (
    sourceUser.preferences.minCompatibilityScore !== undefined &&
    compatibility.compatibilityScore < sourceUser.preferences.minCompatibilityScore
  ) {
    return false;
  }

  // If source user only wants compatible users
  if (
    sourceUser.preferences.onlyShowCompatibleUsers &&
    compatibility.compatibilityScore < 50
  ) {
    return false;
  }

  // If candidate user doesn't allow intention filtering, always show
  if (candidateUser.preferences.allowIntentionFiltering === false) {
    return true;
  }

  return true;
}

/**
 * Get intention-based recommendations for icebreaker messages
 */
export function getIcebreakerSuggestions(
  compatibility: IntentionCompatibility
): string[] {
  const suggestions: string[] = [];

  if (compatibility.sharedIntentions.includes(DatingIntentionBadge.ROMANTIC_VIBE)) {
    suggestions.push('I love your vibe! What is your idea of a perfect romantic evening?');
    suggestions.push('Your profile caught my eye. What kind of connection are you hoping to find?');
  }

  if (compatibility.sharedIntentions.includes(DatingIntentionBadge.OPEN_TO_FLIRTING)) {
    suggestions.push('Hey there! Love your energy. What is your go-to conversation starter?');
    suggestions.push('Your smile is contagious. What makes you laugh the most?');
  }

  if (compatibility.sharedIntentions.includes(DatingIntentionBadge.SERIOUS_DATING)) {
    suggestions.push('Hi! I appreciate your authenticity. What matters most to you in a relationship?');
    suggestions.push('Your profile seems genuine. What are you looking for in a partner?');
  }

  if (compatibility.sharedIntentions.includes(DatingIntentionBadge.CASUAL_DATING)) {
    suggestions.push('Hey! Love your laid-back vibe. What do you do for fun?');
    suggestions.push('Your profile is awesome! Want to grab coffee sometime?');
  }

  if (compatibility.sharedIntentions.includes(DatingIntentionBadge.VIBING)) {
    suggestions.push('Hi! Lets see where this goes. What brings you here?');
    suggestions.push('Hey! Just going with the flow. What is your story?');
  }

  // Default suggestions if no shared intentions
  if (suggestions.length === 0) {
    suggestions.push('Hi! Your profile caught my attention. Tell me about yourself?');
    suggestions.push('Hey there! What is something that made you smile today?');
  }

  return suggestions;
}