/**
 * Trust Service for Avalo Mobile App
 * 
 * Handles trust state fetching, caching, and blocklist management.
 * Provides helpers for UI to check risk levels and block status.
 * 
 * PACK 46 — Trust Engine & Blocklist Safety Mesh
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export interface TrustState {
  userId: string;
  trustScore: number;
  riskFlags: string[];
  earnModeAllowed: boolean;
  totalReportsReceived: number;
  totalBlocksReceived: number;
  lastFetchedAt: number;
}

export interface Blocklist {
  userId: string;
  blockedUserIds: string[];
  lastFetchedAt: number;
}

export type ReportReason = 'SCAM' | 'HARASSMENT' | 'SPAM' | 'OTHER';

// ============================================================================
// STORAGE KEYS
// ============================================================================

const TRUST_STATE_KEY = (userId: string) => `trust_state_v1_${userId}`;
const BLOCKLIST_KEY = (userId: string) => `blocklist_v1_${userId}`;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// TRUST STATE MANAGEMENT
// ============================================================================

/**
 * Fetch trust state from cache
 * Returns null if not cached or expired
 */
export async function fetchTrustState(userId: string): Promise<TrustState | null> {
  try {
    const cached = await AsyncStorage.getItem(TRUST_STATE_KEY(userId));
    if (!cached) return null;

    const trustState: TrustState = JSON.parse(cached);
    
    // Check if cache is still valid
    const now = Date.now();
    if (now - trustState.lastFetchedAt > CACHE_DURATION) {
      return null;
    }

    return trustState;
  } catch (error) {
    console.error('Error fetching trust state from cache:', error);
    return null;
  }
}

/**
 * Refresh trust state from backend
 */
export async function refreshTrustState(userId: string): Promise<TrustState> {
  const getTrustState = httpsCallable(functions, 'trust_getState');
  
  const result = await getTrustState({ userId });
  const backendState = result.data as any;

  const trustState: TrustState = {
    userId: backendState.userId,
    trustScore: backendState.trustScore,
    riskFlags: backendState.riskFlags || [],
    earnModeAllowed: backendState.earnModeAllowed,
    totalReportsReceived: backendState.totalReportsReceived || 0,
    totalBlocksReceived: backendState.totalBlocksReceived || 0,
    lastFetchedAt: Date.now()
  };

  // Save to cache
  await AsyncStorage.setItem(TRUST_STATE_KEY(userId), JSON.stringify(trustState));

  return trustState;
}

/**
 * Get trust state (from cache or fetch if needed)
 */
export async function getTrustState(userId: string, forceRefresh: boolean = false): Promise<TrustState> {
  if (!forceRefresh) {
    const cached = await fetchTrustState(userId);
    if (cached) return cached;
  }

  return await refreshTrustState(userId);
}

// ============================================================================
// BLOCKLIST MANAGEMENT
// ============================================================================

/**
 * Fetch blocklist from cache
 * Returns null if not cached or expired
 */
export async function fetchBlocklist(userId: string): Promise<Blocklist | null> {
  try {
    const cached = await AsyncStorage.getItem(BLOCKLIST_KEY(userId));
    if (!cached) return null;

    const blocklist: Blocklist = JSON.parse(cached);
    
    // Check if cache is still valid
    const now = Date.now();
    if (now - blocklist.lastFetchedAt > CACHE_DURATION) {
      return null;
    }

    return blocklist;
  } catch (error) {
    console.error('Error fetching blocklist from cache:', error);
    return null;
  }
}

/**
 * Refresh blocklist from backend
 */
export async function refreshBlocklist(userId: string): Promise<Blocklist> {
  const getBlocklistFn = httpsCallable(functions, 'trust_getBlocklist');
  
  const result = await getBlocklistFn({ userId });
  const backendData = result.data as any;

  const blocklist: Blocklist = {
    userId: backendData.userId,
    blockedUserIds: backendData.blockedUserIds || [],
    lastFetchedAt: Date.now()
  };

  // Save to cache
  await AsyncStorage.setItem(BLOCKLIST_KEY(userId), JSON.stringify(blocklist));

  return blocklist;
}

/**
 * Get blocklist (from cache or fetch if needed)
 */
export async function getBlocklist(userId: string, forceRefresh: boolean = false): Promise<Blocklist> {
  if (!forceRefresh) {
    const cached = await fetchBlocklist(userId);
    if (cached) return cached;
  }

  return await refreshBlocklist(userId);
}

/**
 * Block a user
 */
export async function blockUser(userId: string, blockedUserId: string): Promise<void> {
  const blockUserFn = httpsCallable(functions, 'trust_block');
  
  await blockUserFn({ userId, blockedUserId });

  // Update local cache
  const blocklist = await fetchBlocklist(userId);
  if (blocklist && !blocklist.blockedUserIds.includes(blockedUserId)) {
    blocklist.blockedUserIds.push(blockedUserId);
    blocklist.lastFetchedAt = Date.now();
    await AsyncStorage.setItem(BLOCKLIST_KEY(userId), JSON.stringify(blocklist));
  } else {
    // Force refresh from backend
    await refreshBlocklist(userId);
  }
}

/**
 * Report a user
 */
export async function reportUser(params: {
  reporterId: string;
  targetId: string;
  reason: ReportReason;
  messageId?: string;
}): Promise<void> {
  const reportUserFn = httpsCallable(functions, 'trust_report');
  
  await reportUserFn({
    targetId: params.targetId,
    reason: params.reason,
    messageId: params.messageId
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a user is high risk
 * Returns true if trustScore < 40 OR has high-risk flags
 */
export function isUserHighRisk(trust: TrustState | null): boolean {
  if (!trust) return false;
  
  if (trust.trustScore < 40) return true;
  
  const highRiskFlags = ['SCAM_SUSPECT', 'HARASSMENT', 'SPAMMER'];
  return trust.riskFlags.some(flag => highRiskFlags.includes(flag));
}

/**
 * Check if earn mode is allowed
 */
export function isEarnModeAllowed(trust: TrustState | null): boolean {
  if (!trust) return true; // Default to allowed if no trust state
  return trust.earnModeAllowed;
}

/**
 * Check if a user is blocked
 */
export function isUserBlocked(blocklist: Blocklist | null, targetId: string): boolean {
  if (!blocklist) return false;
  return blocklist.blockedUserIds.includes(targetId);
}

/**
 * Get trust score level for display
 */
export function getTrustScoreLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * Get user-friendly trust score description
 */
export function getTrustScoreDescription(score: number, locale: 'en' | 'pl' = 'en'): string {
  const level = getTrustScoreLevel(score);
  
  if (locale === 'pl') {
    switch (level) {
      case 'high': return 'Wysoki poziom zaufania';
      case 'medium': return 'Średni poziom zaufania';
      case 'low': return 'Niski poziom zaufania';
    }
  }
  
  switch (level) {
    case 'high': return 'High trust level';
    case 'medium': return 'Medium trust level';
    case 'low': return 'Low trust level';
  }
}

/**
 * Get risk flag display text
 */
export function getRiskFlagDescription(flag: string, locale: 'en' | 'pl' = 'en'): string {
  if (locale === 'pl') {
    switch (flag) {
      case 'SCAM_SUSPECT': return 'Podejrzenie oszustwa';
      case 'HARASSMENT': return 'Nękanie';
      case 'SPAMMER': return 'Spam';
      case 'GHOSTING_EARNER': return 'Zarabianie bez odpowiedzi';
      default: return 'Nieznane';
    }
  }
  
  switch (flag) {
    case 'SCAM_SUSPECT': return 'Scam suspect';
    case 'HARASSMENT': return 'Harassment';
    case 'SPAMMER': return 'Spammer';
    case 'GHOSTING_EARNER': return 'Ghosting earner';
    default: return 'Unknown';
  }
}

/**
 * Clear all trust caches for a user (useful for logout)
 */
export async function clearTrustCaches(userId: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      TRUST_STATE_KEY(userId),
      BLOCKLIST_KEY(userId)
    ]);
  } catch (error) {
    console.error('Error clearing trust caches:', error);
  }
}

/**
 * Prefetch trust data for multiple users
 * Useful when loading a list of profiles
 */
export async function prefetchTrustStates(userIds: string[]): Promise<Map<string, TrustState>> {
  const results = new Map<string, TrustState>();
  
  await Promise.all(
    userIds.map(async (userId) => {
      try {
        const trustState = await getTrustState(userId);
        results.set(userId, trustState);
      } catch (error) {
        console.error(`Error prefetching trust state for ${userId}:`, error);
      }
    })
  );
  
  return results;
}

export default {
  fetchTrustState,
  refreshTrustState,
  getTrustState,
  fetchBlocklist,
  refreshBlocklist,
  getBlocklist,
  blockUser,
  reportUser,
  isUserHighRisk,
  isEarnModeAllowed,
  isUserBlocked,
  getTrustScoreLevel,
  getTrustScoreDescription,
  getRiskFlagDescription,
  clearTrustCaches,
  prefetchTrustStates
};