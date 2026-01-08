/**
 * PACK 301 - Growth & Retention Engine
 * Core retention service for managing user retention profiles and churn prediction
 */

import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  UserRetentionProfile,
  OnboardingStage,
  UserSegment,
  RetentionEvent,
  ChurnRiskFactors,
  RETENTION_CONSTANTS,
  RetentionAuditEvent,
} from './pack301-retention-types';

const db = admin.firestore();

// ============================================================================
// USER RETENTION PROFILE MANAGEMENT
// ============================================================================

/**
 * Get or create user retention profile
 */
export async function getUserRetentionProfile(
  userId: string
): Promise<UserRetentionProfile> {
  const retentionRef = db.collection('userRetention').doc(userId);
  const retentionSnap = await retentionRef.get();

  if (retentionSnap.exists) {
    return retentionSnap.data() as UserRetentionProfile;
  }

  // Create new retention profile
  const now = Timestamp.now();
  const newProfile: UserRetentionProfile = {
    uid: userId,
    onboardingStage: OnboardingStage.NEW,
    onboardingCompleted: false,
    lastActiveAt: now,
    lastSwipeAt: null,
    lastChatAt: null,
    lastPurchaseAt: null,
    daysActive7: 0,
    daysActive30: 0,
    riskOfChurn: 0.0,
    segment: 'NEW',
    winBackSequenceStarted: false,
    winBackSequenceStep: 0,
    winBackSequenceLastSent: null,
    createdAt: now,
    updatedAt: now,
  };

  await retentionRef.set(newProfile);
  
  // Log retention profile creation
  await logRetentionEvent(userId, 'RETENTION_SEGMENT_CHANGED', {
    segment: 'NEW',
    churnScore: 0.0,
  });

  return newProfile;
}

/**
 * Update user's last active timestamp
 */
export async function updateUserActivity(
  userId: string,
  activityType?: 'swipe' | 'chat' | 'purchase'
): Promise<void> {
  const retentionRef = db.collection('userRetention').doc(userId);
  const now = Timestamp.now();
  
  const updates: Partial<UserRetentionProfile> = {
    lastActiveAt: now,
    updatedAt: now,
  };

  // Update specific activity timestamps
  if (activityType === 'swipe') {
    updates.lastSwipeAt = now;
  } else if (activityType === 'chat') {
    updates.lastChatAt = now;
  } else if (activityType === 'purchase') {
    updates.lastPurchaseAt = now;
  }

  await retentionRef.set(updates, { merge: true });

  // Recalculate segment and churn score
  await updateUserSegmentAndChurnScore(userId);
}

/**
 * Update onboarding stage
 */
export async function updateOnboardingStage(
  userId: string,
  stage: OnboardingStage
): Promise<void> {
  const retentionRef = db.collection('userRetention').doc(userId);
  const profile = await getUserRetentionProfile(userId);

  // Only update if moving forward
  if (stage <= profile.onboardingStage) {
    return;
  }

  const isCompleted = stage >= RETENTION_CONSTANTS.ONBOARDING_COMPLETE_STAGE;

  await retentionRef.update({
    onboardingStage: stage,
    onboardingCompleted: isCompleted,
    updatedAt: Timestamp.now(),
  });

  // Log onboarding progress
  await logRetentionEvent(userId, 'RETENTION_ONBOARDING_COMPLETED', {
    onboardingStage: stage,
  });

  console.log(`[Retention] User ${userId} reached onboarding stage ${stage}`);
}

// ============================================================================
// CHURN PREDICTION & SCORING
// ============================================================================

/**
 * Calculate churn risk factors for a user
 */
export async function calculateChurnRiskFactors(
  userId: string
): Promise<ChurnRiskFactors> {
  const profile = await getUserRetentionProfile(userId);
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  const now = Date.now();
  const msPerDay = 1000 * 60 * 60 * 24;

  // Calculate time since last activities
  const daysSinceChat = profile.lastChatAt 
    ? (now - profile.lastChatAt.toMillis()) / msPerDay 
    : 999;
  const daysSinceSwipe = profile.lastSwipeAt 
    ? (now - profile.lastSwipeAt.toMillis()) / msPerDay 
    : 999;
  const daysSinceActive = (now - profile.lastActiveAt.toMillis()) / msPerDay;
  const daysSinceProfileUpdate = userData?.updatedAt
    ? (now - userData.updatedAt.toMillis()) / msPerDay
    : 999;

  return {
    noChatsIn5Days: daysSinceChat >= 5,
    noSwipesIn72h: daysSinceSwipe >= 3,
    noAppOpenRecent: daysSinceActive >= 1,
    profileNotUpdated30d: daysSinceProfileUpdate >= 30,
    noLikesIn72h: false, // Would need to query likes collection
    noPhotosAdded: !userData?.photos || userData.photos.length === 0,
    incompleteProfile: profile.onboardingStage < OnboardingStage.PREFERENCES_SET,
  };
}

/**
 * Calculate churn score based on risk factors (0-1)
 */
export function calculateChurnScore(factors: ChurnRiskFactors): number {
  let score = 0.0;

  if (factors.noChatsIn5Days) score += 0.15;
  if (factors.noSwipesIn72h) score += 0.10;
  if (factors.noAppOpenRecent) score += 0.20;
  if (factors.profileNotUpdated30d) score += 0.05;
  if (factors.noLikesIn72h) score += 0.10;
  if (factors.noPhotosAdded) score += 0.15;
  if (factors.incompleteProfile) score += 0.10;

  return Math.min(score, 1.0);
}

/**
 * Determine user segment based on last active time
 */
export function calculateUserSegment(
  lastActiveAt: Timestamp,
  winBackSequenceStarted: boolean
): UserSegment {
  const daysSinceActive = (Date.now() - lastActiveAt.toMillis()) / (1000 * 60 * 60 * 24);

  if (winBackSequenceStarted && daysSinceActive < RETENTION_CONSTANTS.CHURN_RISK_THRESHOLD) {
    return 'RETURNING';
  }

  if (daysSinceActive < RETENTION_CONSTANTS.ACTIVE_THRESHOLD) {
    return 'ACTIVE';
  } else if (daysSinceActive < RETENTION_CONSTANTS.DORMANT_THRESHOLD) {
    return 'DORMANT';
  } else if (daysSinceActive < RETENTION_CONSTANTS.CHURN_RISK_THRESHOLD) {
    return 'CHURN_RISK';
  } else {
    return 'CHURNED';
  }
}

/**
 * Update user segment and churn score
 */
export async function updateUserSegmentAndChurnScore(
  userId: string
): Promise<void> {
  const profile = await getUserRetentionProfile(userId);
  const factors = await calculateChurnRiskFactors(userId);
  const churnScore = calculateChurnScore(factors);
  const newSegment = calculateUserSegment(
    profile.lastActiveAt,
    profile.winBackSequenceStarted
  );

  const oldSegment = profile.segment;
  const oldChurnScore = profile.riskOfChurn;

  // Update profile
  await db.collection('userRetention').doc(userId).update({
    riskOfChurn: churnScore,
    segment: newSegment,
    updatedAt: Timestamp.now(),
  });

  // Log segment change
  if (oldSegment !== newSegment) {
    await logRetentionEvent(userId, 'RETENTION_SEGMENT_CHANGED', {
      segment: newSegment,
      oldSegment,
      churnScore,
    });

    console.log(`[Retention] User ${userId} segment changed: ${oldSegment} → ${newSegment}`);
  }

  // Log high churn risk
  if (churnScore >= RETENTION_CONSTANTS.HIGH_CHURN_RISK_THRESHOLD && 
      oldChurnScore < RETENTION_CONSTANTS.HIGH_CHURN_RISK_THRESHOLD) {
    await logRetentionEvent(userId, 'RETENTION_CHURN_RISK_HIGH', {
      churnScore,
      segment: newSegment,
    });

    console.log(`[Retention] User ${userId} entered high churn risk (score: ${churnScore})`);
  }
}

// ============================================================================
// ACTIVITY TRACKING
// ============================================================================

/**
 * Calculate active days in past N days
 */
export async function calculateActiveDays(
  userId: string,
  days: number
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // This is a simplified implementation
  // In production, you would track daily active sessions
  const profile = await getUserRetentionProfile(userId);
  
  const daysSinceActive = (Date.now() - profile.lastActiveAt.toMillis()) / (1000 * 60 * 60 * 24);
  
  // Simple heuristic: if active recently, count based on segment
  if (profile.segment === 'ACTIVE') {
    return Math.min(days, 7); // Active users ~7 days
  } else if (profile.segment === 'DORMANT') {
    return Math.min(days, 3); // Dormant users ~3 days
  } else {
    return 0;
  }
}

/**
 * Update active days metrics
 */
export async function updateActiveDaysMetrics(
  userId: string
): Promise<void> {
  const days7 = await calculateActiveDays(userId, 7);
  const days30 = await calculateActiveDays(userId, 30);

  await db.collection('userRetention').doc(userId).update({
    daysActive7: days7,
    daysActive30: days30,
    updatedAt: Timestamp.now(),
  });
}

// ============================================================================
// WIN-BACK SEQUENCE MANAGEMENT
// ============================================================================

/**
 * Start win-back sequence for churned user
 */
export async function startWinBackSequence(
  userId: string
): Promise<void> {
  const profile = await getUserRetentionProfile(userId);

  // Only start if not already started and user is churned
  if (profile.winBackSequenceStarted || profile.segment !== 'CHURNED') {
    return;
  }

  await db.collection('userRetention').doc(userId).update({
    winBackSequenceStarted: true,
    winBackSequenceStep: 0,
    winBackSequenceLastSent: null,
    updatedAt: Timestamp.now(),
  });

  await logRetentionEvent(userId, 'RETENTION_WINBACK_STARTED', {
    segment: profile.segment,
    churnScore: profile.riskOfChurn,
  });

  console.log(`[Retention] Started win-back sequence for user ${userId}`);
}

/**
 * Mark user as returned from win-back
 */
export async function markUserReturned(
  userId: string
): Promise<void> {
  const profile = await getUserRetentionProfile(userId);

  if (!profile.winBackSequenceStarted) {
    return;
  }

  await db.collection('userRetention').doc(userId).update({
    segment: 'RETURNING',
    winBackSequenceStarted: false,
    winBackSequenceStep: 0,
    updatedAt: Timestamp.now(),
  });

  await logRetentionEvent(userId, 'RETENTION_WINBACK_RETURNED', {
    segment: 'RETURNING',
    winBackStep: profile.winBackSequenceStep,
  });

  console.log(`[Retention] User ${userId} returned from win-back sequence`);
}

// ============================================================================
// EVENT LOGGING
// ============================================================================

/**
 * Log retention event for analytics and audit
 */
async function logRetentionEvent(
  userId: string,
  eventType: RetentionAuditEvent['eventType'],
  metadata: RetentionAuditEvent['metadata']
): Promise<void> {
  const profile = await getUserRetentionProfile(userId);
  
  const eventRef = db.collection('retentionEvents').doc();
  const event: RetentionEvent = {
    eventId: eventRef.id,
    userId,
    eventType,
    newValue: metadata,
    segment: profile.segment,
    churnScore: profile.riskOfChurn,
    timestamp: Timestamp.now(),
  };

  await eventRef.set(event);
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Get users for re-engagement (DORMANT or CHURN_RISK)
 */
export async function getUsersForReengagement(
  segment: UserSegment,
  limit: number = 100
): Promise<UserRetentionProfile[]> {
  const snapshot = await db
    .collection('userRetention')
    .where('segment', '==', segment)
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => doc.data() as UserRetentionProfile);
}

/**
 * Get users needing win-back messages
 */
export async function getUsersForWinBack(
  step: number,
  limit: number = 100
): Promise<UserRetentionProfile[]> {
  const snapshot = await db
    .collection('userRetention')
    .where('winBackSequenceStarted', '==', true)
    .where('winBackSequenceStep', '==', step)
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => doc.data() as UserRetentionProfile);
}

/**
 * Get incomplete onboarding users
 */
export async function getIncompleteOnboardingUsers(
  limit: number = 100
): Promise<UserRetentionProfile[]> {
  const snapshot = await db
    .collection('userRetention')
    .where('onboardingCompleted', '==', false)
    .orderBy('createdAt', 'asc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => doc.data() as UserRetentionProfile);
}

// ============================================================================
// PACK 301A — AUTOMATION ENGINE HELPERS
// ============================================================================

/**
 * Activity type definitions
 */
export type ActivityType = 'login' | 'swipe' | 'chat_message' | 'call_started' | 'purchase' | 'profile_update';

export interface ActivityMetadata {
  source?: string;
  platform?: 'android' | 'ios' | 'web';
  countryCode?: string;
}

/**
 * Threshold constants for retention automation
 */
export const RETENTION_THRESHOLDS = {
  DORMANT_AFTER_DAYS: 3,
  CHURN_RISK_AFTER_DAYS: 7,
  CHURNED_AFTER_DAYS: 30,
  ONBOARDING_STAGE_STALE_AFTER_HOURS: {
    [0]: 24,  // NEW -> 24h
    [1]: 48,  // PHOTOS_ADDED -> 48h
    [2]: 48,  // PREFERENCES_SET -> 48h
    [3]: 72,  // DISCOVERY_VISITED -> 72h
    [4]: 72,  // SWIPE_USED -> 72h
    [5]: 0,   // CHAT_STARTED (complete)
    [6]: 0,   // SAFETY_ENABLED
  },
};

/**
 * Record user activity and update retention profile
 */
export async function recordActivity(
  userId: string,
  activityType: ActivityType,
  metadata?: ActivityMetadata
): Promise<any> {
  const now = Timestamp.now();
  const updates: any = {
    lastActiveAt: now,
    updatedAt: now,
  };

  // Update specific activity timestamps
  if (activityType === 'swipe') {
    updates.lastSwipeAt = now;
  } else if (activityType === 'chat_message') {
    updates.lastChatAt = now;
  } else if (activityType === 'purchase') {
    updates.lastPurchaseAt = now;
  }

  // Update retention profile
  const retentionRef = db.collection('userRetention').doc(userId);
  await retentionRef.set(updates, { merge: true });

  // Recompute churn and segment
  await updateUserSegmentAndChurnScore(userId);

  // Get updated profile
  const profile = await getUserRetentionProfile(userId);
  
  return {
    segment: profile.segment,
    riskOfChurn: profile.riskOfChurn,
    lastActivityAt: profile.lastActiveAt,
    onboardingStage: profile.onboardingStage,
  };
}

/**
 * Recalculate churn score for a user
 */
export async function recalculateChurnScore(userId: string): Promise<any> {
  const factors = await calculateChurnRiskFactors(userId);
  const churnScore = calculateChurnScore(factors);
  
  await db.collection('userRetention').doc(userId).update({
    riskOfChurn: churnScore,
    updatedAt: Timestamp.now(),
  });

  const profile = await getUserRetentionProfile(userId);
  return profile;
}

/**
 * Recalculate segment for a user
 */
export async function recalculateSegment(userId: string): Promise<any> {
  await updateUserSegmentAndChurnScore(userId);
  const profile = await getUserRetentionProfile(userId);
  return profile;
}

/**
 * Get users for retention sweep with pagination
 */
export async function getUsersForRetentionSweep(
  batchSize: number,
  cursor?: string
): Promise<{ users: any[]; nextCursor?: string }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 1); // Users with activity < 1 day ago need recomputation
  const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

  let query = db
    .collection('userRetention')
    .where('lastActiveAt', '<', cutoffTimestamp)
    .orderBy('lastActiveAt', 'asc')
    .limit(batchSize);

  if (cursor) {
    const cursorDoc = await db.collection('userRetention').doc(cursor).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  const snapshot = await query.get();
  const users = snapshot.docs.map(doc => doc.data());
  
  const nextCursor = snapshot.docs.length === batchSize
    ? snapshot.docs[snapshot.docs.length - 1].id
    : undefined;

  return { users, nextCursor };
}

/**
 * Get users for win-back sweep
 */
export async function getUsersForWinbackSweep(
  batchSize: number,
  cursor?: string
): Promise<{ users: any[]; nextCursor?: string }> {
  let query = db
    .collection('userRetention')
    .where('segment', 'in', ['CHURN_RISK', 'CHURNED'])
    .where('winBackSequenceStarted', '==', true)
    .orderBy('winBackSequenceLastSent', 'asc')
    .limit(batchSize);

  if (cursor) {
    const cursorDoc = await db.collection('userRetention').doc(cursor).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  const snapshot = await query.get();
  const users = snapshot.docs.map(doc => doc.data());
  
  const nextCursor = snapshot.docs.length === batchSize
    ? snapshot.docs[snapshot.docs.length - 1].id
    : undefined;

  return { users, nextCursor };
}

/**
 * Get users for onboarding nudges
 */
export async function getUsersForOnboardingNudges(
  batchSize: number,
  cursor?: string
): Promise<{ users: any[]; nextCursor?: string }> {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - 24); // Users inactive for 24h
  const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

  let query = db
    .collection('userRetention')
    .where('onboardingCompleted', '==', false)
    .where('lastActiveAt', '<', cutoffTimestamp)
    .orderBy('lastActiveAt', 'asc')
    .limit(batchSize);

  if (cursor) {
    const cursorDoc = await db.collection('userRetention').doc(cursor).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  const snapshot = await query.get();
  const users = snapshot.docs.map(doc => doc.data());
  
  const nextCursor = snapshot.docs.length === batchSize
    ? snapshot.docs[snapshot.docs.length - 1].id
    : undefined;

  return { users, nextCursor };
}

/**
 * Mark win-back step as sent
 */
export async function markWinbackStepSent(
  userId: string,
  stepIndex: number
): Promise<void> {
  await db.collection('userRetention').doc(userId).update({
    winBackSequenceStep: stepIndex,
    winBackSequenceLastSent: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

/**
 * Mark win-back sequence as completed
 */
export async function markWinbackCompleted(userId: string): Promise<void> {
  await db.collection('userRetention').doc(userId).update({
    winBackSequenceStarted: false,
    winBackSequenceStep: 0,
    updatedAt: Timestamp.now(),
  });
}