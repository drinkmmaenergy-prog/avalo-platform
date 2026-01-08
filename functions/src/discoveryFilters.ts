/**
 * Discovery & Swipe Filtering for Avalo
 *
 * Provides filters for shadowbanned users and other safety features.
 * Integrates with existing profileSafety.ts and trustEngine.ts
 *
 * Phase 9: Added account lifecycle status filtering
 *
 * IMPORTANT: This is additive only - does not change existing discovery logic.
 */

import { db } from './init.js';
import { isUserVisibleInDiscovery as checkAccountStatus } from './accountLifecycle.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DiscoveryFilters {
  excludeShadowbanned?: boolean;
  excludeIncognito?: boolean;
  excludeBlocked?: boolean;
  minTrustScore?: number;
}

export interface UserDiscoveryProfile {
  userId: string;
  shadowbanned?: boolean;
  incognito?: boolean;
  trustScore?: number;
  riskLevel?: string;
  [key: string]: any;
}

// ============================================================================
// CORE FILTERING FUNCTIONS
// ============================================================================

/**
 * Filter out shadowbanned users from a list of user profiles
 * 
 * @param users - Array of user profiles
 * @returns Filtered array without shadowbanned users
 */
export function filterShadowbannedUsers(users: UserDiscoveryProfile[]): UserDiscoveryProfile[] {
  return users.filter(user => !user.shadowbanned);
}

/**
 * Filter out incognito users from a list of user profiles
 * 
 * @param users - Array of user profiles
 * @returns Filtered array without incognito users
 */
export function filterIncognitoUsers(users: UserDiscoveryProfile[]): UserDiscoveryProfile[] {
  return users.filter(user => !user.incognito && !user.privacy?.incognito?.enabled);
}

/**
 * Apply all discovery filters to a list of users
 * 
 * @param users - Array of user profiles
 * @param filters - Filter options
 * @param currentUserId - ID of current user (to exclude blocked users)
 * @returns Filtered array of users
 */
export async function applyDiscoveryFilters(
  users: UserDiscoveryProfile[],
  filters: DiscoveryFilters = {},
  currentUserId?: string
): Promise<UserDiscoveryProfile[]> {
  let filteredUsers = [...users];
  
  // Filter shadowbanned users (default: enabled)
  if (filters.excludeShadowbanned !== false) {
    filteredUsers = filterShadowbannedUsers(filteredUsers);
  }
  
  // Filter incognito users (default: enabled)
  if (filters.excludeIncognito !== false) {
    filteredUsers = filterIncognitoUsers(filteredUsers);
  }
  
  // Filter by minimum trust score
  if (filters.minTrustScore !== undefined) {
    filteredUsers = filteredUsers.filter(user => {
      const trustScore = user.trustScore || 70; // Default to 70 if not set
      return trustScore >= filters.minTrustScore!;
    });
  }
  
  // Filter blocked users
  if (filters.excludeBlocked && currentUserId) {
    const blockedUserIds = await getBlockedUserIds(currentUserId);
    filteredUsers = filteredUsers.filter(user => !blockedUserIds.includes(user.userId));
  }
  
  return filteredUsers;
}

/**
 * Get list of user IDs that a user has blocked
 * 
 * @param userId - Current user ID
 * @returns Array of blocked user IDs
 */
async function getBlockedUserIds(userId: string): Promise<string[]> {
  try {
    const blockedSnap = await db.collection('users')
      .doc(userId)
      .collection('blockedUsers')
      .get();
    
    return blockedSnap.docs.map(doc => doc.id);
  } catch (error) {
    return [];
  }
}

/**
 * Check if a specific user should be visible in discovery
 * 
 * @param userId - User ID to check
 * @param currentUserId - Current user's ID
 * @returns Boolean indicating if user should be visible
 */
export async function isUserVisibleInDiscovery(
  userId: string,
  currentUserId?: string
): Promise<boolean> {
  try {
    // Get user profile
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) {
      return false;
    }
    
    const userData = userSnap.data();
    
    // Phase 9: Check account status (active, suspended, deleted)
    const accountStatus = userData?.accountStatus?.status || 'active';
    if (accountStatus !== 'active') {
      return false;
    }
    
    // Check shadowban
    if (userData?.shadowbanned) {
      return false;
    }
    
    // Check incognito
    if (userData?.privacy?.incognito?.enabled) {
      return false;
    }
    
    // Check if current user blocked this user
    if (currentUserId) {
      const isBlocked = await isUserBlocked(currentUserId, userId);
      if (isBlocked) {
        return false;
      }
      
      // Check reverse block (if this user blocked current user)
      const hasBlockedCurrent = await isUserBlocked(userId, currentUserId);
      if (hasBlockedCurrent) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    // On error, be conservative and hide user
    return false;
  }
}

/**
 * Check if userA has blocked userB
 */
async function isUserBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  try {
    const blockSnap = await db.collection('users')
      .doc(blockerId)
      .collection('blockedUsers')
      .doc(blockedId)
      .get();
    
    return blockSnap.exists;
  } catch (error) {
    return false;
  }
}

/**
 * Build Firestore query conditions for discovery
 * Returns array of where conditions to exclude shadowbanned/incognito users
 * 
 * @returns Query filter conditions
 */
export function getDiscoveryQueryFilters(): Array<{ field: string; op: any; value: any }> {
  return [
    { field: 'accountStatus.status', op: '==', value: 'active' },
    { field: 'shadowbanned', op: '!=', value: true },
    { field: 'privacy.incognito.enabled', op: '!=', value: true },
  ];
}

/**
 * Reduce visibility multiplier for users based on risk level
 * Used in ranking/sorting algorithms
 * 
 * @param user - User profile with risk data
 * @returns Visibility multiplier (0.0 - 1.0)
 */
export function calculateVisibilityMultiplier(user: UserDiscoveryProfile): number {
  // Shadowbanned users get 0
  if (user.shadowbanned) {
    return 0;
  }
  
  // Incognito users get 0
  if (user.incognito || user.privacy?.incognito?.enabled) {
    return 0;
  }
  
  // Risk-based reduction
  if (user.riskLevel === 'CRITICAL') {
    return 0.1; // 90% reduction
  }
  
  if (user.riskLevel === 'HIGH') {
    return 0.3; // 70% reduction
  }
  
  if (user.riskLevel === 'MEDIUM') {
    return 0.7; // 30% reduction
  }
  
  // LOW risk or no risk data = full visibility
  return 1.0;
}

/**
 * Enrich user profiles with shadowban/trust data for filtering
 * Call this before applying filters
 * 
 * @param userIds - Array of user IDs to enrich
 * @returns Map of userId to enriched profile data
 */
export async function enrichUsersWithTrustData(
  userIds: string[]
): Promise<Map<string, { shadowbanned: boolean; trustScore: number; riskLevel: string }>> {
  const enrichedData = new Map();
  
  // Batch fetch in chunks of 10
  const CHUNK_SIZE = 10;
  for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + CHUNK_SIZE);
    
    await Promise.all(chunk.map(async (userId) => {
      try {
        // Get user profile for shadowban status
        const userSnap = await db.collection('users').doc(userId).get();
        const userData = userSnap.data();
        
        // Get risk profile for trust data
        const riskSnap = await db.collection('riskProfiles').doc(userId).get();
        const riskData = riskSnap.data();
        
        enrichedData.set(userId, {
          shadowbanned: userData?.shadowbanned || false,
          trustScore: riskData?.trustScore || 70,
          riskLevel: riskData?.riskLevel || 'MEDIUM',
        });
      } catch (error) {
        // If error, assume safe defaults
        enrichedData.set(userId, {
          shadowbanned: false,
          trustScore: 70,
          riskLevel: 'MEDIUM',
        });
      }
    }));
  }
  
  return enrichedData;
}

/**
 * Apply visibility weighting to discovery/swipe results
 * Reduces ranking of high-risk users without completely hiding them
 * 
 * @param users - Array of users with scores
 * @returns Users with adjusted scores based on trust/risk
 */
export function applyVisibilityWeighting(
  users: Array<UserDiscoveryProfile & { score: number }>
): Array<UserDiscoveryProfile & { score: number }> {
  return users.map(user => {
    const multiplier = calculateVisibilityMultiplier(user);
    return {
      ...user,
      score: user.score * multiplier,
      originalScore: user.score,
      visibilityMultiplier: multiplier,
    };
  });
}