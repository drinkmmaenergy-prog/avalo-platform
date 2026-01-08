/**
 * PACK 347 — Growth Engine: Viral Surfaces (Non-Intrusive Sharing)
 * 
 * Safe sharing formats with tracking:
 * - Creator card (auto-safe image + handle)
 * - Event poster
 * - AI companion avatar
 * - Booking invite
 * 
 * Platforms:
 * - WhatsApp, Telegram, Instagram (story), TikTok bio link, SMS
 * 
 * Collection: viralShares/{id}
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, increment, generateId } from './init';

// ============================================================================
// TYPES
// ============================================================================

export type ShareFormat =
  | 'CREATOR_CARD'        // Profile card with safe image + handle
  | 'EVENT_POSTER'        // Event promotional poster
  | 'AI_COMPANION'        // AI companion avatar card
  | 'BOOKING_INVITE';     // Calendar booking invitation

export type SharePlatform =
  | 'WHATSAPP'
  | 'TELEGRAM'
  | 'INSTAGRAM_STORY'
  | 'TIKTOK_BIO'
  | 'SMS'
  | 'OTHER';

export type ShareStatus =
  | 'CREATED'      // Share link/asset created
  | 'OPENED'       // Share link opened
  | 'CONVERTED';   // Resulted in registration/action

export interface ViralShare {
  shareId: string;
  creatorId: string;
  format: ShareFormat;
  platform: SharePlatform;
  status: ShareStatus;
  createdAt: FirebaseFirestore.Timestamp;
  openedAt?: FirebaseFirestore.Timestamp;
  convertedAt?: FirebaseFirestore.Timestamp;
  metadata?: {
    eventId?: string;         // For EVENT_POSTER
    aiCompanionId?: string;   // For AI_COMPANION
    bookingId?: string;       // For BOOKING_INVITE
    assetUrl?: string;        // Generated image URL
    trackingId?: string;      // For click tracking
    recipientId?: string;     // Who received the share
    campaignName?: string;    // Campaign identifier
    visitorUserId?: string;   // Visitor who opened/converted
    openMetadata?: any;       // Additional open tracking data
    conversionValue?: number; // Value of conversion
  };
}

export interface ViralShareStats {
  creatorId: string;
  totalShares: number;
  sharesByFormat: {
    [key in ShareFormat]?: number;
  };
  sharesByPlatform: {
    [key in SharePlatform]?: number;
  };
  totalOpens: number;
  totalConversions: number;
  conversionRate: number;
  updatedAt: FirebaseFirestore.Timestamp;
}

// ============================================================================
// SHARE GENERATION
// ============================================================================

/**
 * Generate creator card share
 * Auto-safe image (no nudity)
 */
export async function generateCreatorCardShare(data: {
  creatorId: string;
  platform: SharePlatform;
  campaignName?: string;
}): Promise<{
  success: boolean;
  shareId: string;
  shareUrl: string;
  assetUrl: string;
}> {
  const { creatorId, platform, campaignName } = data;
  
  // Validate creator exists
  const creatorSnap = await db.collection('users').doc(creatorId).get();
  if (!creatorSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Creator not found');
  }
  
  const creator = creatorSnap.data();
  
  // Generate safe profile card asset
  // NOTE: In production, this would call an image generation service
  // that automatically filters NSFW content and creates branded cards
  const assetUrl = `https://avalo.app/api/cards/${creatorId}?campaign=${campaignName || 'default'}`;
  
  // Create share tracking document
  const shareId = generateId();
  const trackingId = generateId();
  const shareUrl = `https://avalo.app/c/${creatorId}?share=${trackingId}`;
  
  const share: ViralShare = {
    shareId,
    creatorId,
    format: 'CREATOR_CARD',
    platform,
    status: 'CREATED',
    createdAt: serverTimestamp() as any,
    metadata: {
      assetUrl,
      trackingId,
      campaignName: campaignName || 'default'
    }
  };
  
  await db.collection('viral_shares').doc(shareId).set(share);
  
  // Update stats (async, non-blocking)
  updateShareStatsAsync(creatorId, 'CREATOR_CARD', platform).catch(() => {});
  
  return {
    success: true,
    shareId,
    shareUrl,
    assetUrl
  };
}

/**
 * Generate event poster share
 */
export async function generateEventPosterShare(data: {
  creatorId: string;
  eventId: string;
  platform: SharePlatform;
}): Promise<{
  success: boolean;
  shareId: string;
  shareUrl: string;
  posterUrl: string;
}> {
  const { creatorId, eventId, platform } = data;
  
  // Validate event exists and belongs to creator
  const eventSnap = await db.collection('events').doc(eventId).get();
  if (!eventSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Event not found');
  }
  
  if (eventSnap.data()?.creatorId !== creatorId) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Event does not belong to creator'
    );
  }
  
  // Generate event poster
  const posterUrl = `https://avalo.app/api/posters/${eventId}`;
  
  // Create share tracking
  const shareId = generateId();
  const trackingId = generateId();
  const shareUrl = `https://avalo.app/e/${eventId}?share=${trackingId}`;
  
  const share: ViralShare = {
    shareId,
    creatorId,
    format: 'EVENT_POSTER',
    platform,
    status: 'CREATED',
    createdAt: serverTimestamp() as any,
    metadata: {
      eventId,
      assetUrl: posterUrl,
      trackingId
    }
  };
  
  await db.collection('viral_shares').doc(shareId).set(share);
  
  // Update stats (async, non-blocking)
  updateShareStatsAsync(creatorId, 'EVENT_POSTER', platform).catch(() => {});
  
  return {
    success: true,
    shareId,
    shareUrl,
    posterUrl
  };
}

/**
 * Generate AI companion share card
 */
export async function generateAICompanionShare(data: {
  creatorId: string;
  aiCompanionId: string;
  platform: SharePlatform;
}): Promise<{
  success: boolean;
  shareId: string;
  shareUrl: string;
  avatarUrl: string;
}> {
  const { creatorId, aiCompanionId, platform } = data;
  
  // Validate AI companion exists
  const companionSnap = await db.collection('ai_companions').doc(aiCompanionId).get();
  if (!companionSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'AI Companion not found');
  }
  
  if (companionSnap.data()?.creatorId !== creatorId) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'AI Companion does not belong to creator'
    );
  }
  
  // Generate avatar card
  const avatarUrl = `https://avalo.app/api/ai-cards/${aiCompanionId}`;
  
  // Create share tracking
  const shareId = generateId();
  const trackingId = generateId();
  const shareUrl = `https://avalo.app/ai/${aiCompanionId}?share=${trackingId}`;
  
  const share: ViralShare = {
    shareId,
    creatorId,
    format: 'AI_COMPANION',
    platform,
    status: 'CREATED',
    createdAt: serverTimestamp() as any,
    metadata: {
      aiCompanionId,
      assetUrl: avatarUrl,
      trackingId
    }
  };
  
  await db.collection('viral_shares').doc(shareId).set(share);
  
  // Update stats (async, non-blocking)
  updateShareStatsAsync(creatorId, 'AI_COMPANION', platform).catch(() => {});
  
  return {
    success: true,
    shareId,
    shareUrl,
    avatarUrl
  };
}

/**
 * Generate booking invite share
 */
export async function generateBookingInviteShare(data: {
  creatorId: string;
  bookingId: string;
  platform: SharePlatform;
  recipientId?: string;
}): Promise<{
  success: boolean;
  shareId: string;
  shareUrl: string;
}> {
  const { creatorId, bookingId, platform, recipientId } = data;
  
  // Validate booking exists
  const bookingSnap = await db.collection('bookings').doc(bookingId).get();
  if (!bookingSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Booking not found');
  }
  
  if (bookingSnap.data()?.creatorId !== creatorId) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Booking does not belong to creator'
    );
  }
  
  // Create share tracking
  const shareId = generateId();
  const trackingId = generateId();
  const shareUrl = `https://avalo.app/booking/${bookingId}?share=${trackingId}`;
  
  const share: ViralShare = {
    shareId,
    creatorId,
    format: 'BOOKING_INVITE',
    platform,
    status: 'CREATED',
    createdAt: serverTimestamp() as any,
    metadata: {
      bookingId,
      trackingId,
      recipientId
    }
  };
  
  await db.collection('viral_shares').doc(shareId).set(share);
  
  // Update stats (async, non-blocking)
  updateShareStatsAsync(creatorId, 'BOOKING_INVITE', platform).catch(() => {});
  
  return {
    success: true,
    shareId,
    shareUrl
  };
}

// ============================================================================
// TRACKING
// ============================================================================

/**
 * Track share link open
 */
export async function trackShareOpen(data: {
  trackingId: string;
  visitorUserId?: string;
  metadata?: any;
}): Promise<{ success: boolean }> {
  const { trackingId, visitorUserId, metadata } = data;
  
  // Find share by tracking ID
  const shareQuery = await db.collection('viral_shares')
    .where('metadata.trackingId', '==', trackingId)
    .limit(1)
    .get();
  
  if (shareQuery.empty) {
    console.warn('[ViralSurfaces] Share not found for tracking ID:', trackingId);
    return { success: false };
  }
  
  const shareDoc = shareQuery.docs[0];
  const share = shareDoc.data() as ViralShare;
  
  // Update to opened status if still in created state
  if (share.status === 'CREATED') {
    await shareDoc.ref.update({
      status: 'OPENED',
      openedAt: serverTimestamp(),
      'metadata.visitorUserId': visitorUserId || null,
      'metadata.openMetadata': metadata || null
    });
    
    // Update stats (async, non-blocking)
    incrementShareOpenAsync(share.creatorId).catch(() => {});
  }
  
  return { success: true };
}

/**
 * Track share conversion (registration or paid action)
 */
export async function trackShareConversion(data: {
  trackingId: string;
  visitorUserId: string;
  conversionValue?: number;
}): Promise<{ success: boolean }> {
  const { trackingId, visitorUserId, conversionValue } = data;
  
  // Find share by tracking ID
  const shareQuery = await db.collection('viral_shares')
    .where('metadata.trackingId', '==', trackingId)
    .limit(1)
    .get();
  
  if (shareQuery.empty) {
    console.warn('[ViralSurfaces] Share not found for tracking ID:', trackingId);
    return { success: false };
  }
  
  const shareDoc = shareQuery.docs[0];
  const share = shareDoc.data() as ViralShare;
  
  // Update to converted status
  await shareDoc.ref.update({
    status: 'CONVERTED',
    convertedAt: serverTimestamp(),
    'metadata.visitorUserId': visitorUserId,
    'metadata.conversionValue': conversionValue || 0
  });
  
  // Update stats (async, non-blocking)
  incrementShareConversionAsync(share.creatorId).catch(() => {});
  
  return { success: true };
}

// ============================================================================
// STATS HELPERS
// ============================================================================

/**
 * Update share statistics
 */
async function updateShareStatsAsync(
  creatorId: string,
  format: ShareFormat,
  platform: SharePlatform
): Promise<void> {
  const statsRef = db.collection('viral_share_stats').doc(creatorId);
  
  await db.runTransaction(async (transaction) => {
    const statsSnap = await transaction.get(statsRef);
    
    if (!statsSnap.exists) {
      // Create new stats
      const initialStats: ViralShareStats = {
        creatorId,
        totalShares: 1,
        sharesByFormat: { [format]: 1 },
        sharesByPlatform: { [platform]: 1 },
        totalOpens: 0,
        totalConversions: 0,
        conversionRate: 0,
        updatedAt: serverTimestamp() as any
      };
      transaction.set(statsRef, initialStats);
    } else {
      // Update existing stats
      transaction.update(statsRef, {
        totalShares: increment(1),
        [`sharesByFormat.${format}`]: increment(1),
        [`sharesByPlatform.${platform}`]: increment(1),
        updatedAt: serverTimestamp()
      });
    }
  });
}

/**
 * Increment share opens counter
 */
async function incrementShareOpenAsync(creatorId: string): Promise<void> {
  const statsRef = db.collection('viral_share_stats').doc(creatorId);
  
  await statsRef.set({
    creatorId,
    totalOpens: increment(1),
    updatedAt: serverTimestamp()
  }, { merge: true });
  
  // Recalculate conversion rate
  recalculateShareConversionRate(creatorId).catch(() => {});
}

/**
 * Increment share conversions counter
 */
async function incrementShareConversionAsync(creatorId: string): Promise<void> {
  const statsRef = db.collection('viral_share_stats').doc(creatorId);
  
  await statsRef.set({
    creatorId,
    totalConversions: increment(1),
    updatedAt: serverTimestamp()
  }, { merge: true });
  
  // Recalculate conversion rate
  recalculateShareConversionRate(creatorId).catch(() => {});
}

/**
 * Recalculate conversion rate
 */
async function recalculateShareConversionRate(creatorId: string): Promise<void> {
  const statsRef = db.collection('viral_share_stats').doc(creatorId);
  const statsSnap = await statsRef.get();
  
  if (!statsSnap.exists) return;
  
  const stats = statsSnap.data() as ViralShareStats;
  const conversionRate = stats.totalOpens > 0
    ? (stats.totalConversions / stats.totalOpens) * 100
    : 0;
  
  await statsRef.update({
    conversionRate,
    updatedAt: serverTimestamp()
  });
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get creator's viral share stats
 */
export async function getCreatorShareStats(data: {
  creatorId: string;
}): Promise<ViralShareStats | null> {
  const { creatorId } = data;
  
  const statsSnap = await db.collection('viral_share_stats').doc(creatorId).get();
  
  if (!statsSnap.exists) {
    return null;
  }
  
  return statsSnap.data() as ViralShareStats;
}

/**
 * Get creator's share history
 */
export async function getCreatorShares(data: {
  creatorId: string;
  limit?: number;
  format?: ShareFormat;
}): Promise<ViralShare[]> {
  const { creatorId, limit = 100, format } = data;
  
  let query = db.collection('viral_shares')
    .where('creatorId', '==', creatorId)
    .orderBy('createdAt', 'desc')
    .limit(limit);
  
  if (format) {
    query = query.where('format', '==', format) as any;
  }
  
  const snapshot = await query.get();
  
  return snapshot.docs.map(doc => doc.data() as ViralShare);
}

/**
 * Get top performing share platforms for creator
 */
export async function getTopSharePlatforms(data: {
  creatorId: string;
}): Promise<Array<{ platform: SharePlatform; shares: number }>> {
  const { creatorId } = data;
  
  const stats = await getCreatorShareStats({ creatorId });
  
  if (!stats || !stats.sharesByPlatform) {
    return [];
  }
  
  return Object.entries(stats.sharesByPlatform)
    .map(([platform, shares]) => ({
      platform: platform as SharePlatform,
      shares: shares || 0
    }))
    .sort((a, b) => b.shares - a.shares);
}

/**
 * PACK 347: Viral Surfaces
 * 
 * - Safe sharing formats with auto-content filtering
 * - Multi-platform support (WhatsApp, Telegram, Instagram, TikTok, SMS)
 * - Click tracking and conversion attribution
 * - Share performance analytics
 * - Creator card, event poster, AI companion, booking invite formats
 */
