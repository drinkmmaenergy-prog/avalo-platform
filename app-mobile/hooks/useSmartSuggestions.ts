/**
 * useSmartSuggestions Hook
 * PACK 36: Smart Suggestions Logic
 * Computes personalized match candidates from discovery list
 * No API; uses local fields only: interests, city, distance, gender preference, SmartMatch score, activity recency
 */

import { useState, useEffect } from 'react';
import { ProfileData } from '../lib/profileService';
import { getDiscoveryProfiles } from '../services/discoveryService';
import { getSwipedUserIds } from '../services/interactionService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SuggestionConfidence = 'top' | 'promising' | 'worth';

export interface SuggestedProfile extends ProfileData {
  score: number;
  confidence: SuggestionConfidence;
}

interface SmartSuggestionsResult {
  topPicks: SuggestedProfile[];
  promising: SuggestedProfile[];
  worthChecking: SuggestedProfile[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Calculate distance between two coordinates in kilometers
 */
function calculateDistance(
  lat1?: number,
  lng1?: number,
  lat2?: number,
  lng2?: number
): number {
  if (!lat1 || !lng1 || !lat2 || !lng2) return 999;
  
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
 * Calculate match score (0-100, deterministic)
 */
function calculateMatchScore(
  userProfile: ProfileData,
  candidateProfile: ProfileData
): number {
  let score = 0;

  // Interests overlap: up to 40 pts
  const userInterests = userProfile.interests || [];
  const candidateInterests = candidateProfile.interests || [];
  const sharedInterests = userInterests.filter(i => candidateInterests.includes(i));
  const interestScore = Math.min((sharedInterests.length / Math.max(userInterests.length, 1)) * 40, 40);
  score += interestScore;

  // Same city: +15 pts
  if (userProfile.city && candidateProfile.city && userProfile.city === candidateProfile.city) {
    score += 15;
  }

  // Distance <50km: +10 pts
  if (userProfile.location && candidateProfile.location) {
    const distance = calculateDistance(
      userProfile.location.lat,
      userProfile.location.lng,
      candidateProfile.location.lat,
      candidateProfile.location.lng
    );
    if (distance < 50) {
      score += 10;
    }
  }

  // Active last 72h: +20 pts
  const now = Date.now();
  const threeDaysAgo = now - (72 * 60 * 60 * 1000);
  const updatedAt = candidateProfile.updatedAt instanceof Date 
    ? candidateProfile.updatedAt.getTime()
    : typeof candidateProfile.updatedAt === 'number'
    ? candidateProfile.updatedAt
    : 0;
  
  if (updatedAt > threeDaysAgo) {
    score += 20;
  }

  // SmartMatch score (if exists): up to 15 pts
  // Note: SmartMatch not implemented yet, placeholder for future
  const smartMatchScore = 0; // TODO: integrate with SmartMatch system when available
  score += smartMatchScore;

  return Math.round(score);
}

/**
 * Categorize profile by score
 */
function getConfidenceLevel(score: number): SuggestionConfidence {
  if (score >= 70) return 'top';
  if (score >= 40) return 'promising';
  return 'worth';
}

/**
 * Hook to get smart suggestions
 */
export function useSmartSuggestions(
  userId: string | undefined,
  userProfile: ProfileData | null
): SmartSuggestionsResult {
  const [topPicks, setTopPicks] = useState<SuggestedProfile[]>([]);
  const [promising, setPromising] = useState<SuggestedProfile[]>([]);
  const [worthChecking, setWorthChecking] = useState<SuggestedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSuggestions = async () => {
    if (!userId || !userProfile) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get already swiped profiles to exclude
      const swipedIds = await getSwipedUserIds(userId);

      // Get discovery profiles
      const profiles = await getDiscoveryProfiles(userId, userProfile, 100);

      // Filter out already swiped
      const unseenProfiles = profiles.filter(p => !swipedIds.includes(p.uid));

      // Calculate scores and categorize
      const scoredProfiles: SuggestedProfile[] = unseenProfiles
        .map(profile => ({
          ...profile,
          score: calculateMatchScore(userProfile, profile),
          confidence: 'worth' as SuggestionConfidence, // Will be set below
        }))
        .filter(p => p.score >= 20) // Discard below 20
        .sort((a, b) => b.score - a.score)
        .map(p => ({
          ...p,
          confidence: getConfidenceLevel(p.score),
        }));

      // Group by confidence
      const top = scoredProfiles.filter(p => p.confidence === 'top').slice(0, 20);
      const prom = scoredProfiles.filter(p => p.confidence === 'promising').slice(0, 30);
      const worth = scoredProfiles.filter(p => p.confidence === 'worth').slice(0, 30);

      setTopPicks(top);
      setPromising(prom);
      setWorthChecking(worth);
    } catch (err) {
      console.error('Error loading smart suggestions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuggestions();
  }, [userId, userProfile?.uid]);

  return {
    topPicks,
    promising,
    worthChecking,
    loading,
    error,
    refresh: loadSuggestions,
  };
}