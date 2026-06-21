import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

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
import { HttpsError, Timestamp } from './runtime';

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
  earnerId: string;
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
  earnerId: string;
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
 * Generate earner card share
 * Auto-safe image (no nudity)
 */
export async function generateCreatorCardShare(data: {
  earnerId: string;
  platform: SharePlatform;
  campaignName?: string;
}): Promise<{
  success: boolean;
  shareId: string;
  sharUSDl: string;
  assetUrl: string;
}> {
  const { earnerId, platform, campaignName } = data;
  
  // Validate earner exists
  const earnerSnap = await db.collection('users').doc(earnerId).get();
  if (!earnerSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Creator not found');
  }
  
  const earner = earnerSnap.data();
  
  // Generate safe profile card asset
  // NOTE: In production, this would call an image generation service
  // that automatically filters NSFW content and creates branded cards
  const assetUrl = `https://platform.app/api/cards/${earnerId}?campaign=${campaignName || 'default'}`;
  
  // Create share tracking document
  const shareId = generateId();
  const trackingId = generateId();
  const sharUSDl = `https://platform.app/c/${earnerId}?share=${trackingId}`;
  
  const share: ViralShare = {
    shareId,
    earnerId,
    format: 'CREATOR_CARD',
    platform,
    status: 'CREATED',
    createdAt: serverTimestamp() as unknown as Timestamp,
    metadata: {
      assetUrl,
      trackingId,
      campaignName: campaignName || 'default'
    }
  };
  
  await db.collection('viral_shares').doc(shareId).set(share);
  
  // Update stats (async, non-blocking)
  updateShareStatsAsync(earnerId, 'CREATOR_CARD', platform).catch(() => {});
  
  return {
    success: true,
    shareId,
    sharUSDl,
    assetUrl
  };
}

/**
 * Generate event poster share
 */
export async function generateEventPosterShare(data: {
  earnerId: string;
  eventId: string;
  platform: SharePlatform;
}): Promise<{
  success: boolean;
  shareId: string;
  sharUSDl: string;
  posterUrl: string;
}> {
  const { earnerId, eventId, platform } = data;
  
  // Validate event exists and belongs to earner
  const eventSnap = await db.collection('events').doc(eventId).get();
  if (!eventSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Event not found');
  }
  
  if (eventSnap.data()?.earnerId !== earnerId) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Event does not belong to earner'
    );
  }
  
  // Generate event poster
  const posterUrl = `https://platform.app/api/posters/${eventId}`;
  
  // Create share tracking
  const shareId = generateId();
  const trackingId = generateId();
  const sharUSDl = `https://platform.app/e/${eventId}?share=${trackingId}`;
  
  const share: ViralShare = {
    shareId,
    earnerId,
    format: 'EVENT_POSTER',
    platform,
    status: 'CREATED',
    createdAt: serverTimestamp() as unknown as Timestamp,
    metadata: {
      eventId,
      assetUrl: posterUrl,
      trackingId
    }
  };
  
  await db.collection('viral_shares').doc(shareId).set(share);
  
  // Update stats (async, non-blocking)
  updateShareStatsAsync(earnerId, 'EVENT_POSTER', platform).catch(() => {});
  
  return {
    success: true,
    shareId,
    sharUSDl,
    posterUrl
  };
}

/**
 * Generate AI companion share card
 */
export async function generateAICompanionShare(data: {
  earnerId: string;
  aiCompanionId: string;
  platform: SharePlatform;
}): Promise<{
  success: boolean;
  shareId: string;
  sharUSDl: string;
  avatarUrl: string;
}> {
  const { earnerId, aiCompanionId, platform } = data;
  
  // Validate AI companion exists
  const companionSnap = await db.collection('ai_companions').doc(aiCompanionId).get();
  if (!companionSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'AI Companion not found');
  }
  
  if (companionSnap.data()?.earnerId !== earnerId) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'AI Companion does not belong to earner'
    );
  }
  
  // Generate avatar card
  const avatarUrl = `https://platform.app/api/ai-cards/${aiCompanionId}`;
  
  // Create share tracking
  const shareId = generateId();
  const trackingId = generateId();
  const sharUSDl = `https://platform.app/ai/${aiCompanionId}?share=${trackingId}`;
  
  const share: ViralShare = {
    shareId,
    earnerId,
    format: 'AI_COMPANION',
    platform,
    status: 'CREATED',
    createdAt: serverTimestamp() as unknown as Timestamp,
    metadata: {
      aiCompanionId,
      assetUrl: avatarUrl,
      trackingId
    }
  };
  
  await db.collection('viral_shares').doc(shareId).set(share);
  
  // Update stats (async, non-blocking)
  updateShareStatsAsync(earnerId, 'AI_COMPANION', platform).catch(() => {});
  
  return {
    success: true,
    shareId,
    sharUSDl,
    avatarUrl
  };
}

/**
 * Generate booking invite share
 */
export async function generateBookingInviteShare(data: {
  earnerId: string;
  bookingId: string;
  platform: SharePlatform;
  recipientId?: string;
}): Promise<{
  success: boolean;
  shareId: string;
  sharUSDl: string;
}> {
  const { earnerId, bookingId, platform, recipientId } = data;
  
  // Validate booking exists
  const bookingSnap = await db.collection('bookings').doc(bookingId).get();
  if (!bookingSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Booking not found');
  }
  
  if (bookingSnap.data()?.earnerId !== earnerId) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Booking does not belong to earner'
    );
  }
  
  // Create share tracking
  const shareId = generateId();
  const trackingId = generateId();
  const sharUSDl = `https://platform.app/booking/${bookingId}?share=${trackingId}`;
  
  const share: ViralShare = {
    shareId,
    earnerId,
    format: 'BOOKING_INVITE',
    platform,
    status: 'CREATED',
    createdAt: serverTimestamp() as unknown as Timestamp,
    metadata: {
      bookingId,
      trackingId,
      recipientId
    }
  };
  
  await db.collection('viral_shares').doc(shareId).set(share);
  
  // Update stats (async, non-blocking)
  updateShareStatsAsync(earnerId, 'BOOKING_INVITE', platform).catch(() => {});
  
  return {
    success: true,
    shareId,
    sharUSDl
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
    incrementShareOpenAsync(share.earnerId).catch(() => {});
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
  incrementShareConversionAsync(share.earnerId).catch(() => {});
  
  return { success: true };
}

// ============================================================================
// STATS HELPERS
// ============================================================================

/**
 * Update share statistics
 */
async function updateShareStatsAsync(
  earnerId: string,
  format: ShareFormat,
  platform: SharePlatform
): Promise<void> {
  const statsRef = db.collection('viral_share_stats').doc(earnerId);
  
  await db.runTransaction(async (transaction) => {
    const statsSnap = await transaction.get(statsRef);
    
    if (!statsSnap.exists) {
      // Create new stats
      const initialStats: ViralShareStats = {
        earnerId,
        totalShares: 1,
        sharesByFormat: { [format]: 1 },
        sharesByPlatform: { [platform]: 1 },
        totalOpens: 0,
        totalConversions: 0,
        conversionRate: 0,
        updatedAt: serverTimestamp() as unknown as Timestamp
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
async function incrementShareOpenAsync(earnerId: string): Promise<void> {
  const statsRef = db.collection('viral_share_stats').doc(earnerId);
  
  await statsRef.set({
    earnerId,
    totalOpens: increment(1),
    updatedAt: serverTimestamp()
  }, { merge: true });
  
  // Recalculate conversion rate
  recalculateShareConversionRate(earnerId).catch(() => {});
}

/**
 * Increment share conversions counter
 */
async function incrementShareConversionAsync(earnerId: string): Promise<void> {
  const statsRef = db.collection('viral_share_stats').doc(earnerId);
  
  await statsRef.set({
    earnerId,
    totalConversions: increment(1),
    updatedAt: serverTimestamp()
  }, { merge: true });
  
  // Recalculate conversion rate
  recalculateShareConversionRate(earnerId).catch(() => {});
}

/**
 * Recalculate conversion rate
 */
async function recalculateShareConversionRate(earnerId: string): Promise<void> {
  const statsRef = db.collection('viral_share_stats').doc(earnerId);
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
 * Get earner's viral share stats
 */
export async function getCreatorShareStats(data: {
  earnerId: string;
}): Promise<ViralShareStats | null> {
  const { earnerId } = data;
  
  const statsSnap = await db.collection('viral_share_stats').doc(earnerId).get();
  
  if (!statsSnap.exists) {
    return null;
  }
  
  return statsSnap.data() as ViralShareStats;
}

/**
 * Get earner's share history
 */
export async function getCreatorShares(data: {
  earnerId: string;
  limit?: number;
  format?: ShareFormat;
}): Promise<ViralShare[]> {
  const { earnerId, limit = 100, format } = data;
  
  let query = db.collection('viral_shares')
    .where('earnerId', '==', earnerId)
    .orderBy('createdAt', 'desc')
    .limit(limit);
  
  if (format) {
    query = query.where('format', '==', format);
  }
  
  const snapshot = await query.get();
  
  return snapshot.docs.map(doc => doc.data() as ViralShare);
}

/**
 * Get top performing share platforms for earner
 */
export async function getTopSharePlatforms(data: {
  earnerId: string;
}): Promise<Array<{ platform: SharePlatform; shares: number }>> {
  const { earnerId } = data;
  
  const stats = await getCreatorShareStats({ earnerId });
  
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

























