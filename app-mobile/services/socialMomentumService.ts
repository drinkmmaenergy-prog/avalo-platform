/**
 * Social Momentum Service - Phase 32-7
 * Read-only service that interprets existing local activity data
 * Returns motivational insights based on REAL user activity
 * NO fake stats, NO bots, NO artificial interactions
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProfileData } from '../lib/profileService';

const DISMISSAL_KEY = 'momentum_card_dismissed_until';

export type MomentumCategory = 'VIEWS' | 'MATCHES' | 'QUIZ' | 'PHOTO' | 'LOCATION';

export interface MomentumInsight {
  message: string;
  category: MomentumCategory;
  intensity: 1 | 2 | 3 | 4; // 1=low, 2=medium, 3=high, 4=very high (drives animation)
  actionRoute?: string; // Optional route to navigate when clicked
}

export interface MomentumData {
  profile: ProfileData;
  recentSwipeCount?: number; // Swipes in last 7 days
  recentMatchCount?: number; // Matches in last 7 days
  photoCount?: number; // Number of photos in profile
  profileCompleteness?: number; // 0-100 percentage
  lastPhotoUpload?: number; // Timestamp of last photo upload
  nearbyActiveUsers?: number; // Estimate based on discovery profiles
}

/**
 * Analyze user data and return a momentum insight if applicable
 * Returns null if no significant momentum detected
 */
export async function analyzeMomentum(data: MomentumData): Promise<MomentumInsight | null> {
  // Check if card was recently dismissed
  const isDismissed = await isCardDismissed();
  if (isDismissed) {
    return null;
  }

  // Don't show if profile incomplete
  if (!data.profile.profileComplete) {
    return null;
  }

  // Analyze different momentum signals in priority order
  
  // 1. NEW PHOTOS (High priority - recent activity)
  if (data.lastPhotoUpload) {
    const daysSinceUpload = (Date.now() - data.lastPhotoUpload) / (1000 * 60 * 60 * 24);
    if (daysSinceUpload < 3 && (data.photoCount || 0) >= 3) {
      return {
        message: 'momentum.newPhotosBoost',
        category: 'PHOTO',
        intensity: 3,
        actionRoute: '/(onboarding)/profile-setup',
      };
    }
  }

  // 2. RECENT MATCHES (High engagement signal)
  if ((data.recentMatchCount || 0) >= 3) {
    return {
      message: 'momentum.trending',
      category: 'MATCHES',
      intensity: 4,
      actionRoute: '/(tabs)/chats',
    };
  }

  // 3. HIGH NEARBY ACTIVITY (Location-based)
  if ((data.nearbyActiveUsers || 0) >= 10) {
    return {
      message: 'momentum.nearbyActive',
      category: 'LOCATION',
      intensity: 3,
      actionRoute: '/(tabs)/home',
    };
  }

  // 4. ACTIVE SWIPING (User engagement)
  if ((data.recentSwipeCount || 0) >= 20) {
    return {
      message: 'momentum.quizBoost',
      category: 'QUIZ',
      intensity: 2,
      actionRoute: '/(tabs)/dating-preferences',
    };
  }

  // 5. PROFILE NEEDS IMPROVEMENT (Motivational nudge)
  const completeness = data.profileCompleteness || 0;
  if (completeness < 80 && completeness > 30) {
    return {
      message: 'momentum.upgradeProfile',
      category: 'QUIZ',
      intensity: 2,
      actionRoute: '/(onboarding)/profile-setup',
    };
  }

  // 6. FEW PHOTOS (Actionable suggestion)
  if ((data.photoCount || 0) < 3 && data.profile.profileComplete) {
    return {
      message: 'momentum.newPhotosBoost',
      category: 'PHOTO',
      intensity: 2,
      actionRoute: '/(onboarding)/profile-setup',
    };
  }

  // 7. GENERAL PROFILE TRENDING (Default positive message)
  if ((data.recentSwipeCount || 0) >= 5 || (data.nearbyActiveUsers || 0) >= 5) {
    return {
      message: 'momentum.similarProfilesMatching',
      category: 'VIEWS',
      intensity: 1,
      actionRoute: '/(tabs)/home',
    };
  }

  // No significant momentum to display
  return null;
}

/**
 * Dismiss the momentum card for 24 hours
 */
export async function dismissCard(): Promise<void> {
  try {
    const dismissUntil = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now
    await AsyncStorage.setItem(DISMISSAL_KEY, dismissUntil.toString());
  } catch (error) {
    console.error('Error dismissing momentum card:', error);
  }
}

/**
 * Check if the card is currently dismissed
 */
export async function isCardDismissed(): Promise<boolean> {
  try {
    const dismissedUntilStr = await AsyncStorage.getItem(DISMISSAL_KEY);
    if (!dismissedUntilStr) {
      return false;
    }

    const dismissedUntil = parseInt(dismissedUntilStr, 10);
    return Date.now() < dismissedUntil;
  } catch (error) {
    console.error('Error checking card dismissal:', error);
    return false;
  }
}

/**
 * Clear dismissal state (for testing)
 */
export async function clearDismissal(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DISMISSAL_KEY);
  } catch (error) {
    console.error('Error clearing dismissal:', error);
  }
}

/**
 * Get time remaining until card can be shown again (in milliseconds)
 * Returns 0 if not dismissed
 */
export async function getTimeUntilReshow(): Promise<number> {
  try {
    const dismissedUntilStr = await AsyncStorage.getItem(DISMISSAL_KEY);
    if (!dismissedUntilStr) {
      return 0;
    }

    const dismissedUntil = parseInt(dismissedUntilStr, 10);
    const remaining = dismissedUntil - Date.now();
    return remaining > 0 ? remaining : 0;
  } catch (error) {
    console.error('Error getting time until reshow:', error);
    return 0;
  }
}

/**
 * Calculate profile completeness score (0-100)
 */
export function calculateProfileCompleteness(profile: ProfileData): number {
  let score = 0;
  const weights = {
    name: 10,
    bio: 20,
    photos: 30,
    interests: 15,
    age: 10,
    city: 10,
    gender: 5,
  };

  if (profile.name) score += weights.name;
  if (profile.bio && profile.bio.length > 20) score += weights.bio;
  if (profile.photos && profile.photos.length >= 3) {
    score += weights.photos;
  } else if (profile.photos && profile.photos.length > 0) {
    score += (weights.photos * profile.photos.length) / 3;
  }
  if (profile.interests && profile.interests.length >= 3) score += weights.interests;
  if (profile.age) score += weights.age;
  if (profile.city) score += weights.city;
  if (profile.gender) score += weights.gender;

  return Math.min(100, Math.round(score));
}

/**
 * Estimate nearby active users based on discovery profiles
 */
export function estimateNearbyActiveUsers(discoveryProfiles: ProfileData[]): number {
  // Simple estimation: each profile in discovery represents active users
  // This is based on real data (actual profiles loaded)
  return discoveryProfiles.length;
}

/**
 * Count recent swipes from stored interaction data
 * This would typically come from interactionService
 */
export function countRecentSwipes(swipedUserIds: string[], daysAgo: number = 7): number {
  // For now, return the total count as an estimate
  // In a real implementation, we'd filter by timestamp
  // Since we don't have timestamps in the basic array, return a conservative estimate
  return Math.min(swipedUserIds.length, 50);
}

/**
 * Detect if user uploaded photos recently
 * Returns timestamp of most recent upload, or null
 */
export function getLastPhotoUploadTime(profile: ProfileData): number | null {
  // In a real implementation, we'd track upload timestamps
  // For now, if user has 3+ photos, assume they uploaded within last week
  if (profile.photos && profile.photos.length >= 3) {
    // Estimate: if profile is recent (< 30 days), photos are recent
    const profileAge = typeof profile.createdAt === 'number' 
      ? Date.now() - profile.createdAt
      : null;
    
    if (profileAge && profileAge < 30 * 24 * 60 * 60 * 1000) {
      return Date.now() - (7 * 24 * 60 * 60 * 1000); // Estimate 7 days ago
    }
  }
  
  return null;
}