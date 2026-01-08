/**
 * PACK 309 — Analytics Integration for Swipe Events
 * 
 * Tracks swipe-related events for analytics and retention
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export type SwipeEventType = 
  | 'SWIPE_LIKE' 
  | 'SWIPE_DISLIKE'
  | 'SWIPE_LIMIT_HIT_DAILY'
  | 'SWIPE_LIMIT_HIT_HOURLY'
  | 'SWIPE_MATCH_CREATED';

/**
 * Log swipe analytics event
 */
export async function logSwipeAnalyticsEvent(
  userId: string,
  eventType: SwipeEventType,
  metadata: Record<string, any> = {}
): Promise<void> {
  try {
    // Create analytics event
    await db.collection('analyticsEvents').add({
      userId,
      eventType,
      eventCategory: 'swipe',
      metadata,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      platform: metadata.platform || 'unknown',
      sessionId: metadata.sessionId || null
    });

    console.log(`[Analytics] Logged ${eventType} for user ${userId}`);
  } catch (error) {
    console.error('[Analytics] Error logging swipe event:', error);
    // Don't throw - analytics failures shouldn't block user actions
  }
}

/**
 * Update retention profile with swipe activity
 */
export async function updateRetentionProfileSwipe(
  userId: string
): Promise<void> {
  try {
    const retentionRef = db.collection('userRetention').doc(userId);
    
    await retentionRef.set({
      userId,
      lastSwipeAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`[Retention] Updated lastSwipeAt for user ${userId}`);
  } catch (error) {
    console.error('[Retention] Error updating swipe activity:', error);
    // Don't throw - retention updates shouldn't block user actions
  }
}

/**
 * Track Discovery analytics event
 */
export async function logDiscoveryAnalyticsEvent(
  userId: string,
  eventType: 'DISCOVERY_BROWSE' | 'DISCOVERY_PROFILE_VIEW' | 'DISCOVERY_LIKE',
  metadata: Record<string, any> = {}
): Promise<void> {
  try {
    await db.collection('analyticsEvents').add({
      userId,
      eventType,
      eventCategory: 'discovery',
      metadata,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      platform: metadata.platform || 'unknown'
    });

    console.log(`[Analytics] Logged ${eventType} for user ${userId}`);
  } catch (error) {
    console.error('[Analytics] Error logging discovery event:', error);
  }
}

console.log('✅ PACK 309 — Analytics Integration initialized');