/**
 * PACK 271 - Discovery Ranking System (Web)
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

const LOW_POPULARITY_THRESHOLD = 30;
const MAX_DISTANCE_KM = 100;

export function calculateActivityScore(profile: DiscoveryProfile): number {
  let score = 0;
  
  if (profile.isOnline) {
    score += 50;
  } else if (profile.lastActive) {
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
  
  return Math.min(score, 100);
}

export function calculateDistanceScore(distanceKm: number): number {
  if (distanceKm <= 0) return 100;
  if (distanceKm >= MAX_DISTANCE_KM) return 0;
  return Math.max(0, 100 - (distanceKm / MAX_DISTANCE_KM) * 100);
}

export function calculateRankingScore(profile: DiscoveryProfile): DiscoveryRankingScore {
  if (profile.incognito) {
    return {
      activityScore: 0,
      distanceScore: 0,
      profileQuality: 0,
      totalScore: 0,
      multipliers: { royal: 1, aiAvatar: 1, lowPopularity: 1 },
    };
  }
  
  const activityScore = calculateActivityScore(profile);
  const distanceScore = calculateDistanceScore(profile.distance);
  const profileQuality = profile.profileQuality;
  
  let baseScore = 
    (activityScore * WEIGHTS.activity) +
    (distanceScore * WEIGHTS.distance) +
    (profileQuality * WEIGHTS.profileQuality);
  
  const multipliers = {
    royal: profile.isRoyal ? MULTIPLIERS.royal : 1,
    aiAvatar: profile.hasAIAvatar ? MULTIPLIERS.aiAvatar : 1,
    lowPopularity: profile.popularity < LOW_POPULARITY_THRESHOLD ? MULTIPLIERS.lowPopularity : 1,
  };
  
  const totalScore = baseScore * multipliers.royal * multipliers.aiAvatar * multipliers.lowPopularity;
  
  return {
    activityScore,
    distanceScore,
    profileQuality,
    totalScore: Math.min(totalScore, 1000),
    multipliers,
  };
}

export function rankProfiles(profiles: DiscoveryProfile[]): DiscoveryProfile[] {
  const rankedProfiles = profiles.map(profile => ({
    profile,
    score: calculateRankingScore(profile),
  }));
  
  rankedProfiles.sort((a, b) => b.score.totalScore - a.score.totalScore);
  
  return rankedProfiles.map(item => item.profile);
}

export function getActivityIndicator(profile: DiscoveryProfile): {
  type: 'online' | 'recent' | 'new_post' | 'offline';
  label: string;
  color: string;
} {
  if (profile.isOnline) {
    return { type: 'online', label: 'Online now', color: '#4CAF50' };
  }
  
  if (profile.hasNewPost && profile.lastPostDate) {
    const hoursSincePost = (Date.now() - profile.lastPostDate.getTime()) / (1000 * 60 * 60);
    if (hoursSincePost < 24) {
      return { type: 'new_post', label: 'New post', color: '#FF6B6B' };
    }
  }
  
  if (profile.lastActive) {
    const hoursSinceActive = (Date.now() - profile.lastActive.getTime()) / (1000 * 60 * 60);
    if (hoursSinceActive < 24) {
      return { type: 'recent', label: 'Active today', color: '#FFA726' };
    } else if (hoursSinceActive < 168) {
      return { type: 'recent', label: 'Active this week', color: '#FFA726' };
    }
  }
  
  return { type: 'offline', label: '', color: '#808080' };
}