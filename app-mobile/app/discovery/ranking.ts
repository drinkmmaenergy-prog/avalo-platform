/**
 * PACK 271 - Discovery Ranking System
 * Implements profile ranking algorithm with fairness boost
 * 
 * Formula: score = (activity_score * 0.5) + (distance_score * 0.4) + (profile_quality * 0.1)
 * Multipliers:
 * - Royal users: 1.3x
 * - AI Avatar: 1.1x
 * - Low popularity: 1.2x (fairness boost)
 * - Incognito: excluded
 */

import { DiscoveryProfile, DiscoveryRankingScore } from './types';

const WEIGHTS = {
  activity: 0.5,
  distance: 0.4,
  profileQuality: 0.1,
} as const;

const MULTIPLIERS = {
  royal: 1.3,
  aiAvatar: 1.1,
  lowPopularity: 1.2,
} as const;

const LOW_POPULARITY_THRESHOLD = 30; // Below this score, apply fairness boost
const MAX_DISTANCE_KM = 100; // Max distance for normalization

/**
 * Calculate activity score (0-100)
 * Based on online status, recent activity, and new content
 */
export function calculateActivityScore(profile: DiscoveryProfile): number {
  let score = 0;
  
  // Online users get highest score
  if (profile.isOnline) {
    score += 50;
  } else if (profile.lastActive) {
    // Recent activity score (last 24h = full points, decay after)
    const hoursSinceActive = (Date.now() - profile.lastActive.getTime()) / (1000 * 60 * 60);
    if (hoursSinceActive < 24) {
      score += 40;
    } else if (hoursSinceActive < 48) {
      score += 30;
    } else if (hoursSinceActive < 72) {
      score += 20;
    } else if (hoursSinceActive < 168) {
      score += 10;
    }
  }
  
  // New post bonus
  if (profile.hasNewPost && profile.lastPostDate) {
    const hoursSincePost = (Date.now() - profile.lastPostDate.getTime()) / (1000 * 60 * 60);
    if (hoursSincePost < 24) {
      score += 30;
    } else if (hoursSincePost < 48) {
      score += 20;
    } else if (hoursSincePost < 72) {
      score += 10;
    }
  }
  
  // Normalize to 0-100
  return Math.min(score, 100);
}

/**
 * Calculate distance score (0-100)
 * Closer = higher score
 */
export function calculateDistanceScore(distanceKm: number): number {
  if (distanceKm <= 0) return 100;
  if (distanceKm >= MAX_DISTANCE_KM) return 0;
  
  // Linear decay: 100 at 0km, 0 at MAX_DISTANCE_KM
  return Math.max(0, 100 - (distanceKm / MAX_DISTANCE_KM) * 100);
}

/**
 * Calculate full ranking score for a profile
 */
export function calculateRankingScore(profile: DiscoveryProfile): DiscoveryRankingScore {
  // Skip incognito users completely
  if (profile.incognito) {
    return {
      activityScore: 0,
      distanceScore: 0,
      profileQuality: 0,
      totalScore: 0,
      multipliers: {
        royal: 1,
        aiAvatar: 1,
        lowPopularity: 1,
      },
    };
  }
  
  // Calculate component scores
  const activityScore = calculateActivityScore(profile);
  const distanceScore = calculateDistanceScore(profile.distance);
  const profileQuality = profile.profileQuality;
  
  // Calculate base score using weights
  let baseScore = 
    (activityScore * WEIGHTS.activity) +
    (distanceScore * WEIGHTS.distance) +
    (profileQuality * WEIGHTS.profileQuality);
  
  // Apply multipliers
  const multipliers = {
    royal: profile.isRoyal ? MULTIPLIERS.royal : 1,
    aiAvatar: profile.hasAIAvatar ? MULTIPLIERS.aiAvatar : 1,
    lowPopularity: profile.popularity < LOW_POPULARITY_THRESHOLD ? MULTIPLIERS.lowPopularity : 1,
  };
  
  // Calculate final score with all multipliers
  const totalScore = baseScore * multipliers.royal * multipliers.aiAvatar * multipliers.lowPopularity;
  
  return {
    activityScore,
    distanceScore,
    profileQuality,
    totalScore: Math.min(totalScore, 1000), // Cap at 1000
    multipliers,
  };
}

/**
 * Rank profiles by score (highest first)
 */
export function rankProfiles(profiles: DiscoveryProfile[]): DiscoveryProfile[] {
  const rankedProfiles = profiles.map(profile => ({
    profile,
    score: calculateRankingScore(profile),
  }));
  
  // Sort by total score (descending)
  rankedProfiles.sort((a, b) => b.score.totalScore - a.score.totalScore);
  
  return rankedProfiles.map(item => item.profile);
}

/**
 * Filter and rank profiles for Discovery
 */
export function prepareDiscoveryProfiles(
  profiles: DiscoveryProfile[],
  includeScores = false
): DiscoveryProfile[] | Array<{ profile: DiscoveryProfile; score: DiscoveryRankingScore }> {
  // Filter out incognito users
  const filteredProfiles = profiles.filter(p => !p.incognito);
  
  // Rank profiles
  const rankedProfiles = rankProfiles(filteredProfiles);
  
  if (includeScores) {
    return rankedProfiles.map(profile => ({
      profile,
      score: calculateRankingScore(profile),
    }));
  }
  
  return rankedProfiles;
}

/**
 * Calculate activity indicator for display
 */
export function getActivityIndicator(profile: DiscoveryProfile): {
  type: 'online' | 'recent' | 'new_post' | 'offline';
  label: string;
  color: string;
} {
  if (profile.isOnline) {
    return {
      type: 'online',
      label: 'Online now',
      color: '#4CAF50',
    };
  }
  
  if (profile.hasNewPost && profile.lastPostDate) {
    const hoursSincePost = (Date.now() - profile.lastPostDate.getTime()) / (1000 * 60 * 60);
    if (hoursSincePost < 24) {
      return {
        type: 'new_post',
        label: 'New post',
        color: '#FF6B6B',
      };
    }
  }
  
  if (profile.lastActive) {
    const hoursSinceActive = (Date.now() - profile.lastActive.getTime()) / (1000 * 60 * 60);
    if (hoursSinceActive < 24) {
      return {
        type: 'recent',
        label: 'Active today',
        color: '#FFA726',
      };
    } else if (hoursSinceActive < 168) {
      return {
        type: 'recent',
        label: 'Active this week',
        color: '#FFA726',
      };
    }
  }
  
  return {
    type: 'offline',
    label: '',
    color: '#808080',
  };
}