/**
 * Profile & Safety Cloud Functions
 *
 * Handles:
 * - Incognito mode
 * - Passport location override
 * - User blocking & reporting
 * - Influencer badge computation
 *
 * PACK 85 Integration: Reports and blocks now log to Trust & Risk Engine
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import { onUserReported, onUserBlocked } from './trustRiskIntegrations';

// ============================================================================
// TYPES
// ============================================================================

export interface IncognitoSettings {
  enabled: boolean;
  enabledAt: any;
  disabledAt: any;
}

export interface PassportLocation {
  enabled: boolean;
  city: string;
  country: string;
  lat: number;
  lng: number;
  setAt: any;
}

export interface BlockedUser {
  userId: string;
  blockedAt: any;
  reason?: string;
}

export interface UserReport {
  reportId: string;
  reportedUserId: string;
  reporterUserId: string;
  reason: string;
  category: 'harassment' | 'fake_profile' | 'inappropriate_content' | 'spam' | 'other';
  description?: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  createdAt: any;
  reviewedAt?: any;
  reviewedBy?: string;
}

export interface InfluencerBadgeProgress {
  currentScore: number;
  currentLevel: 'none' | 'rising' | 'influencer' | 'top_influencer';
  nextLevel: 'rising' | 'influencer' | 'top_influencer' | 'max';
  nextLevelThreshold: number;
  progressPercent: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Influencer badge thresholds (based on popularity score)
const INFLUENCER_THRESHOLDS = {
  RISING: 1000,        // Rising star
  INFLUENCER: 5000,    // Influencer
  TOP_INFLUENCER: 20000 // Top influencer
};

// ============================================================================
// INCOGNITO MODE
// ============================================================================

/**
 * Toggle incognito mode for a user
 * When enabled: user is hidden in Swipe, Discovery, and Feed
 * User can still see others and send first message
 */
export async function toggleIncognito(
  userId: string,
  enabled: boolean
): Promise<{ success: boolean; incognitoSettings: IncognitoSettings }> {
  
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  
  if (!userSnap.exists) {
    throw new Error('User not found');
  }
  
  const now = serverTimestamp();
  const incognitoSettings: IncognitoSettings = {
    enabled,
    enabledAt: enabled ? now : null,
    disabledAt: enabled ? null : now
  };
  
  await userRef.update({
    'privacy.incognito': incognitoSettings,
    updatedAt: now
  });
  
  // Log for monitoring
  
  return { success: true, incognitoSettings };
}

/**
 * Check if user is in incognito mode
 */
export async function isUserIncognito(userId: string): Promise<boolean> {
  const userSnap = await db.collection('users').doc(userId).get();
  const userData = userSnap.data();
  return userData?.privacy?.incognito?.enabled || false;
}

/**
 * Filter out incognito users from discovery/swipe results
 */
export function filterIncognitoUsers(users: any[]): any[] {
  return users.filter(user => !user.privacy?.incognito?.enabled);
}

// ============================================================================
// PASSPORT LOCATION OVERRIDE
// ============================================================================

/**
 * Set passport location override (FREE for all users)
 * Overrides GPS location for Discovery/Swipe only
 */
export async function setPassportLocation(
  userId: string,
  location: { city: string; country: string; lat: number; lng: number }
): Promise<{ success: boolean; passportLocation: PassportLocation }> {
  
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  
  if (!userSnap.exists) {
    throw new Error('User not found');
  }
  
  const passportLocation: PassportLocation = {
    enabled: true,
    city: location.city,
    country: location.country,
    lat: location.lat,
    lng: location.lng,
    setAt: serverTimestamp()
  };
  
  await userRef.update({
    'location.passport': passportLocation,
    updatedAt: serverTimestamp()
  });
  
  // Log for monitoring
  
  return { success: true, passportLocation };
}

/**
 * Disable passport location (return to GPS)
 */
export async function disablePassportLocation(userId: string): Promise<{ success: boolean }> {
  
  const userRef = db.collection('users').doc(userId);
  
  await userRef.update({
    'location.passport.enabled': false,
    updatedAt: serverTimestamp()
  });
  
  // Log for monitoring
  
  return { success: true };
}

/**
 * Get effective location for discovery (passport if enabled, else GPS)
 */
export async function getEffectiveLocation(userId: string): Promise<{
  lat: number;
  lng: number;
  city: string;
  country: string;
  source: 'passport' | 'gps';
}> {
  
  const userSnap = await db.collection('users').doc(userId).get();
  const userData = userSnap.data();
  
  if (!userData) {
    throw new Error('User not found');
  }
  
  // Check if passport is enabled
  const passport = userData.location?.passport;
  if (passport?.enabled) {
    return {
      lat: passport.lat,
      lng: passport.lng,
      city: passport.city,
      country: passport.country,
      source: 'passport'
    };
  }
  
  // Fall back to GPS location
  const gpsLocation = userData.location;
  return {
    lat: gpsLocation?.coordinates?.lat || 0,
    lng: gpsLocation?.coordinates?.lng || 0,
    city: gpsLocation?.city || '',
    country: gpsLocation?.country || '',
    source: 'gps'
  };
}

// ============================================================================
// USER BLOCKING
// ============================================================================

/**
 * Block a user
 */
export async function blockUser(
  blockerId: string,
  blockedUserId: string,
  reason?: string
): Promise<{ success: boolean }> {
  
  if (blockerId === blockedUserId) {
    throw new Error('Cannot block yourself');
  }
  
  const blockerRef = db.collection('users').doc(blockerId);
  const blockListRef = blockerRef.collection('blockedUsers').doc(blockedUserId);
  
  const blockedUser: BlockedUser = {
    userId: blockedUserId,
    blockedAt: serverTimestamp(),
    reason
  };
  
  await blockListRef.set(blockedUser);
  
  // Update block count
  await blockerRef.update({
    'privacy.blockedUsersCount': increment(1),
    updatedAt: serverTimestamp()
  });
  
  // Log for monitoring
  
  // PACK 85: Log to Trust & Risk Engine
  try {
    await onUserBlocked(blockedUserId, blockerId);
  } catch (error) {
    console.error('Failed to log block to Trust Engine:', error);
    // Don't fail the block operation if trust logging fails
  }
  
  return { success: true };
}

/**
 * Unblock a user
 */
export async function unblockUser(
  blockerId: string,
  blockedUserId: string
): Promise<{ success: boolean }> {
  
  const blockerRef = db.collection('users').doc(blockerId);
  const blockListRef = blockerRef.collection('blockedUsers').doc(blockedUserId);
  
  await blockListRef.delete();
  
  // Update block count
  await blockerRef.update({
    'privacy.blockedUsersCount': increment(-1),
    updatedAt: serverTimestamp()
  });
  
  // Log for monitoring
  
  return { success: true };
}

/**
 * Get list of blocked users
 */
export async function getBlockedUsers(userId: string): Promise<BlockedUser[]> {
  
  const blockListSnap = await db.collection('users')
    .doc(userId)
    .collection('blockedUsers')
    .orderBy('blockedAt', 'desc')
    .get();
  
  return blockListSnap.docs.map(doc => doc.data() as BlockedUser);
}

/**
 * Check if user A has blocked user B
 */
export async function isUserBlocked(blockerId: string, blockedUserId: string): Promise<boolean> {
  const blockListRef = db.collection('users')
    .doc(blockerId)
    .collection('blockedUsers')
    .doc(blockedUserId);
  
  const blockSnap = await blockListRef.get();
  return blockSnap.exists;
}

// ============================================================================
// USER REPORTING
// ============================================================================

/**
 * Report a user
 */
export async function reportUser(
  reporterUserId: string,
  reportedUserId: string,
  category: UserReport['category'],
  reason: string,
  description?: string
): Promise<{ success: boolean; reportId: string }> {
  
  if (reporterUserId === reportedUserId) {
    throw new Error('Cannot report yourself');
  }
  
  const reportId = generateId();
  const reportRef = db.collection('reports').doc(reportId);
  
  const report: UserReport = {
    reportId,
    reportedUserId,
    reporterUserId,
    reason,
    category,
    description,
    status: 'pending',
    createdAt: serverTimestamp()
  };
  
  await reportRef.set(report);
  
  // Update reported user's report count
  await db.collection('users').doc(reportedUserId).update({
    'moderation.reportCount': increment(1),
    updatedAt: serverTimestamp()
  });
  
  // Log for monitoring
  
  // PACK 85: Log to Trust & Risk Engine
  try {
    await onUserReported(reportedUserId, reporterUserId, reason);
  } catch (error) {
    console.error('Failed to log report to Trust Engine:', error);
    // Don't fail the report operation if trust logging fails
  }
  
  return { success: true, reportId };
}

/**
 * Get user's report history (as reporter)
 */
export async function getUserReports(userId: string): Promise<UserReport[]> {
  
  const reportsSnap = await db.collection('reports')
    .where('reporterUserId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  
  return reportsSnap.docs.map(doc => doc.data() as UserReport);
}

// ============================================================================
// INFLUENCER BADGE SYSTEM
// ============================================================================

/**
 * Calculate influencer badge progress
 * Based on user's popularity score
 */
export async function getInfluencerProgress(userId: string): Promise<InfluencerBadgeProgress> {
  
  const userSnap = await db.collection('users').doc(userId).get();
  const userData = userSnap.data();
  
  if (!userData) {
    throw new Error('User not found');
  }
  
  const currentScore = userData.popularityScore || 0;
  
  let currentLevel: InfluencerBadgeProgress['currentLevel'] = 'none';
  let nextLevel: InfluencerBadgeProgress['nextLevel'] = 'rising';
  let nextLevelThreshold = INFLUENCER_THRESHOLDS.RISING;
  
  if (currentScore >= INFLUENCER_THRESHOLDS.TOP_INFLUENCER) {
    currentLevel = 'top_influencer';
    nextLevel = 'max';
    nextLevelThreshold = INFLUENCER_THRESHOLDS.TOP_INFLUENCER;
  } else if (currentScore >= INFLUENCER_THRESHOLDS.INFLUENCER) {
    currentLevel = 'influencer';
    nextLevel = 'top_influencer';
    nextLevelThreshold = INFLUENCER_THRESHOLDS.TOP_INFLUENCER;
  } else if (currentScore >= INFLUENCER_THRESHOLDS.RISING) {
    currentLevel = 'rising';
    nextLevel = 'influencer';
    nextLevelThreshold = INFLUENCER_THRESHOLDS.INFLUENCER;
  }
  
  const progressPercent = nextLevel === 'max' 
    ? 100 
    : Math.min(100, Math.round((currentScore / nextLevelThreshold) * 100));
  
  return {
    currentScore,
    currentLevel,
    nextLevel,
    nextLevelThreshold,
    progressPercent
  };
}

/**
 * Update user's popularity score
 * Called by various engagement actions (likes, matches, messages, etc.)
 */
export async function updatePopularityScore(
  userId: string,
  delta: number,
  reason: string
): Promise<{ newScore: number }> {
  
  const userRef = db.collection('users').doc(userId);
  
  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    const userData = userSnap.data();
    
    const currentScore = userData?.popularityScore || 0;
    const newScore = Math.max(0, currentScore + delta);
    
    transaction.update(userRef, {
      popularityScore: newScore,
      updatedAt: serverTimestamp()
    });
    
    // Log score change
    const scoreLogRef = db.collection('users').doc(userId).collection('popularityLog').doc(generateId());
    transaction.set(scoreLogRef, {
      delta,
      reason,
      oldScore: currentScore,
      newScore,
      createdAt: serverTimestamp()
    });
  });
  
  const updatedSnap = await userRef.get();
  const newScore = updatedSnap.data()?.popularityScore || 0;
  
  // Log for monitoring
  
  return { newScore };
}

/**
 * Check if user should have influencer badge
 */
export function hasInfluencerBadge(popularityScore: number): boolean {
  return popularityScore >= INFLUENCER_THRESHOLDS.RISING;
}

/**
 * Get influencer badge level
 */
export function getInfluencerBadgeLevel(popularityScore: number): 'rising' | 'influencer' | 'top_influencer' | null {
  if (popularityScore >= INFLUENCER_THRESHOLDS.TOP_INFLUENCER) {
    return 'top_influencer';
  }
  if (popularityScore >= INFLUENCER_THRESHOLDS.INFLUENCER) {
    return 'influencer';
  }
  if (popularityScore >= INFLUENCER_THRESHOLDS.RISING) {
    return 'rising';
  }
  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  INFLUENCER_THRESHOLDS
};