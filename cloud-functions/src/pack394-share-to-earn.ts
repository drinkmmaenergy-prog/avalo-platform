/**
 * PACK 394 — Viral Growth Engine
 * Share-to-Earn System
 * 
 * Users earn temporary boosts for sharing content
 * Tracking engagement and viral reach
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { nanoid } from 'nanoid';

const db = admin.firestore();

export enum ShareContentType {
  PROFILE = 'profile',
  EVENT = 'event',
  FEED_POST = 'feed_post',
  AI_COMPANION = 'ai_companion',
  REFERRAL_CAMPAIGN = 'referral_campaign',
}

export enum SharePlatform {
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  INSTAGRAM = 'instagram',
  TIKTOK = 'tiktok',
  TWITTER = 'twitter',
  FACEBOOK = 'facebook',
  SNAPCHAT = 'snapchat',
  TELEGRAM = 'telegram',
  COPY_LINK = 'copy_link',
}

export enum BoostType {
  DISCOVERY_MULTIPLIER = 'discovery_multiplier',
  FEED_VISIBILITY = 'feed_visibility',
  PROFILE_HIGHLIGHT = 'profile_highlight',
  PRIORITY_RANKING = 'priority_ranking',
}

interface ShareEvent {
  shareId: string;
  userId: string;
  contentType: ShareContentType;
  contentId: string;
  platform: SharePlatform;
  shareUrl: string;
  timestamp: Date;
  expiresAt: Date;
  clicks: number;
  conversions: number;
  viralReach: number;
  boostEarned: boolean;
  metadata: {
    userAgent?: string;
    customMessage?: string;
  };
}

interface ShareConversion {
  conversionId: string;
  shareId: string;
  userId: string; // sharer
  convertedUserId?: string; // viewer
  conversionType: 'click' | 'view' | 'install' | 'register' | 'engage';
  timestamp: Date;
  geo: {
    country: string;
    city?: string;
  };
  metadata: {
    referrerUrl?: string;
    userAgent?: string;
  };
}

interface ViralBoost {
  boostId: string;
  userId: string;
  shareId: string;
  type: BoostType;
  multiplier: number;
  active: boolean;
  activatedAt: Date;
  expiresAt: Date;
  performance: {
    impressions: number;
    engagements: number;
    conversions: number;
  };
}

/**
 * Create Share Event
 * Generates trackable share link
 */
export const createShareEvent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const {
    contentType,
    contentId,
    platform,
    customMessage,
  } = data;

  try {
    // Validate content exists
    await validateSharedContent(contentType, contentId);

    // Generate unique share ID
    const shareId = nanoid(16);
    
    // Create trackable URL
    const shareUrl = `https://avalo.app/s/${shareId}`;
    
    // Set expiration (24-72h based on content type)
    const expiryHours = getExpiryHours(contentType);
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    const shareEvent: ShareEvent = {
      shareId,
      userId,
      contentType,
      contentId,
      platform,
      shareUrl,
      timestamp: new Date(),
      expiresAt,
      clicks: 0,
      conversions: 0,
      viralReach: 0,
      boostEarned: false,
      metadata: {
        customMessage,
      },
    };

    // Save share event
    await db.collection('shareEvents').doc(shareId).set(shareEvent);

    // Increment user share count
    await db.collection('users').doc(userId).update({
      'analytics.totalShares': admin.firestore.FieldValue.increment(1),
      'analytics.lastShareAt': new Date(),
    });

    functions.logger.info(`Share event created: ${shareId} for user ${userId}`);

    return {
      success: true,
      shareEvent,
    };
  } catch (error: any) {
    functions.logger.error('Error creating share event:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Track Share Conversion
 * Records when someone clicks/views shared content
 */
export const trackShareConversion = functions.https.onCall(async (data, context) => {
  const {
    shareId,
    conversionType,
    geo,
    metadata,
  } = data;

  try {
    // Get share event
    const shareDoc = await db.collection('shareEvents').doc(shareId).get();
    if (!shareDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Share event not found');
    }

    const shareEvent = shareDoc.data() as ShareEvent;

    // Check if expired
    if (shareEvent.expiresAt < new Date()) {
      throw new functions.https.HttpsError('failed-precondition', 'Share link has expired');
    }

    // Create conversion record
    const conversionId = nanoid(16);
    const conversion: ShareConversion = {
      conversionId,
      shareId,
      userId: shareEvent.userId,
      convertedUserId: context.auth?.uid,
      conversionType,
      timestamp: new Date(),
      geo: geo || { country: 'unknown' },
      metadata: metadata || {},
    };

    // Save conversion
    await db.collection('shareConversionMap').doc(conversionId).set(conversion);

    // Update share event stats
    const updates: any = {
      clicks: admin.firestore.FieldValue.increment(1),
    };

    if (conversionType === 'register' || conversionType === 'engage') {
      updates.conversions = admin.firestore.FieldValue.increment(1);
    }

    await shareDoc.ref.update(updates);

    // Calculate viral reach score
    await updateViralReachScore(shareId);

    // Check if boost should be granted
    await checkAndGrantBoost(shareId);

    functions.logger.info(`Share conversion tracked: ${conversionId} for share ${shareId}`);

    return {
      success: true,
      conversion,
    };
  } catch (error: any) {
    functions.logger.error('Error tracking share conversion:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Update Viral Reach Score
 * Calculates viral coefficient based on share performance
 */
async function updateViralReachScore(shareId: string): Promise<void> {
  const shareDoc = await db.collection('shareEvents').doc(shareId).get();
  if (!shareDoc.exists) return;

  const shareEvent = shareDoc.data() as ShareEvent;

  // Get all conversions for this share
  const conversionsSnapshot = await db.collection('shareConversionMap')
    .where('shareId', '==', shareId)
    .get();

  const conversions = conversionsSnapshot.docs.map(doc => doc.data() as ShareConversion);

  // Calculate viral reach
  // Formula: clicks * 1 + views * 0.5 + registers * 10 + engages * 5
  let viralReach = 0;
  conversions.forEach(conv => {
    switch (conv.conversionType) {
      case 'click': viralReach += 1; break;
      case 'view': viralReach += 0.5; break;
      case 'install': viralReach += 5; break;
      case 'register': viralReach += 10; break;
      case 'engage': viralReach += 5; break;
    }
  });

  // Update share event
  await shareDoc.ref.update({ viralReach });

  // Update user's total viral reach
  await db.collection('users').doc(shareEvent.userId).update({
    'viralReachScore': admin.firestore.FieldValue.increment(viralReach),
  });
}

/**
 * Check and Grant Boost
 * Grants temporary boost if share performance meets thresholds
 */
async function checkAndGrantBoost(shareId: string): Promise<void> {
  const shareDoc = await db.collection('shareEvents').doc(shareId).get();
  if (!shareDoc.exists) return;

  const shareEvent = shareDoc.data() as ShareEvent;

  // Skip if boost already earned
  if (shareEvent.boostEarned) return;

  // Define thresholds for boost
  const CLICK_THRESHOLD = 10;
  const CONVERSION_THRESHOLD = 3;
  const VIRAL_REACH_THRESHOLD = 50;

  // Check if thresholds met
  if (
    shareEvent.clicks >= CLICK_THRESHOLD &&
    shareEvent.conversions >= CONVERSION_THRESHOLD &&
    shareEvent.viralReach >= VIRAL_REACH_THRESHOLD
  ) {
    // Determine boost type based on content
    const boostType = getBoostTypeForContent(shareEvent.contentType);
    const multiplier = calculateBoostMultiplier(shareEvent);

    // Grant boost
    await grantViralBoost(
      shareEvent.userId,
      shareId,
      boostType,
      multiplier,
      24 // hours
    );

    // Mark boost as earned
    await shareDoc.ref.update({ boostEarned: true });

    // Notify user
    await db.collection('notifications').add({
      userId: shareEvent.userId,
      type: 'viral_boost_earned',
      title: 'Viral Boost Earned! 🚀',
      body: `Your share generated ${shareEvent.viralReach} viral reach! Boost activated for 24h.`,
      data: {
        shareId,
        boostType,
        multiplier,
      },
      read: false,
      createdAt: new Date(),
    });

    functions.logger.info(`Viral boost granted for share ${shareId}`);
  }
}

/**
 * Grant Viral Boost
 * Creates an active boost for the user
 */
async function grantViralBoost(
  userId: string,
  shareId: string,
  type: BoostType,
  multiplier: number,
  durationHours: number
): Promise<void> {
  const boostId = nanoid(16);
  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

  const boost: ViralBoost = {
    boostId,
    userId,
    shareId,
    type,
    multiplier,
    active: true,
    activatedAt: new Date(),
    expiresAt,
    performance: {
      impressions: 0,
      engagements: 0,
      conversions: 0,
    },
  };

  await db.collection('viralBoosts').doc(boostId).set(boost);

  // Update user profile with active boost
  await db.collection('users').doc(userId).update({
    [`activeBoosts.${type}`]: {
      boostId,
      multiplier,
      expiresAt,
    },
  });
}

/**
 * Get User Active Boosts
 * Returns all active boosts for a user
 */
export const getUserActiveBoosts = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const boostsSnapshot = await db.collection('viralBoosts')
      .where('userId', '==', userId)
      .where('active', '==', true)
      .where('expiresAt', '>', new Date())
      .get();

    const boosts = boostsSnapshot.docs.map(doc => doc.data());

    return {
      success: true,
      boosts,
    };
  } catch (error: any) {
    functions.logger.error('Error getting active boosts:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get Share Analytics
 * Returns share performance for a user
 */
export const getShareAnalytics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { timeframe = '30d' } = data;

  try {
    // Calculate timeframe
    const startDate = new Date(Date.now() - getTimeframeMs(timeframe));

    // Get share events
    const sharesSnapshot = await db.collection('shareEvents')
      .where('userId', '==', userId)
      .where('timestamp', '>=', startDate)
      .get();

    const shares = sharesSnapshot.docs.map(doc => doc.data() as ShareEvent);

    // Calculate analytics
    const analytics = {
      totalShares: shares.length,
      totalClicks: shares.reduce((sum, s) => sum + s.clicks, 0),
      totalConversions: shares.reduce((sum, s) => sum + s.conversions, 0),
      totalViralReach: shares.reduce((sum, s) => sum + s.viralReach, 0),
      boostsEarned: shares.filter(s => s.boostEarned).length,
      conversionRate: 0,
      topPlatforms: {} as Record<string, number>,
      topContentTypes: {} as Record<string, number>,
    };

    // Calculate conversion rate
    if (analytics.totalClicks > 0) {
      analytics.conversionRate = (analytics.totalConversions / analytics.totalClicks) * 100;
    }

    // Calculate top platforms
    shares.forEach(share => {
      analytics.topPlatforms[share.platform] = 
        (analytics.topPlatforms[share.platform] || 0) + 1;
    });

    // Calculate top content types
    shares.forEach(share => {
      analytics.topContentTypes[share.contentType] = 
        (analytics.topContentTypes[share.contentType] || 0) + 1;
    });

    return {
      success: true,
      analytics,
    };
  } catch (error: any) {
    functions.logger.error('Error getting share analytics:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Helper: Validate shared content exists
 */
async function validateSharedContent(contentType: ShareContentType, contentId: string): Promise<boolean> {
  let collection = '';
  
  switch (contentType) {
    case ShareContentType.PROFILE:
      collection = 'users';
      break;
    case ShareContentType.EVENT:
      collection = 'events';
      break;
    case ShareContentType.FEED_POST:
      collection = 'posts';
      break;
    case ShareContentType.AI_COMPANION:
      collection = 'aiCompanions';
      break;
    case ShareContentType.REFERRAL_CAMPAIGN:
      collection = 'referralLinks';
      break;
    default:
      throw new Error('Invalid content type');
  }

  const doc = await db.collection(collection).doc(contentId).get();
  if (!doc.exists) {
    throw new Error('Content not found');
  }

  return true;
}

/**
 * Helper: Get expiry hours based on content type
 */
function getExpiryHours(contentType: ShareContentType): number {
  switch (contentType) {
    case ShareContentType.EVENT:
      return 168; // 7 days
    case ShareContentType.REFERRAL_CAMPAIGN:
      return 720; // 30 days
    default:
      return 72; // 3 days
  }
}

/**
 * Helper: Get boost type for content
 */
function getBoostTypeForContent(contentType: ShareContentType): BoostType {
  switch (contentType) {
    case ShareContentType.PROFILE:
      return BoostType.DISCOVERY_MULTIPLIER;
    case ShareContentType.FEED_POST:
      return BoostType.FEED_VISIBILITY;
    case ShareContentType.EVENT:
      return BoostType.PRIORITY_RANKING;
    default:
      return BoostType.PROFILE_HIGHLIGHT;
  }
}

/**
 * Helper: Calculate boost multiplier
 */
function calculateBoostMultiplier(shareEvent: ShareEvent): number {
  const baseMultiplier = 1.5;
  const viralBonus = Math.min(shareEvent.viralReach / 100, 1.0); // Max +1.0x
  return baseMultiplier + viralBonus;
}

/**
 * Helper: Get timeframe in milliseconds
 */
function getTimeframeMs(timeframe: string): number {
  const matches = timeframe.match(/^(\d+)([dhm])$/);
  if (!matches) return 30 * 24 * 60 * 60 * 1000;

  const value = parseInt(matches[1]);
  const unit = matches[2];

  switch (unit) {
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'm': return value * 60 * 1000;
    default: return 30 * 24 * 60 * 60 * 1000;
  }
}

/**
 * Scheduled function to deactivate expired boosts
 */
export const deactivateExpiredBoosts = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    const now = new Date();
    
    const expiredBoostsSnapshot = await db.collection('viralBoosts')
      .where('active', '==', true)
      .where('expiresAt', '<', now)
      .get();

    const batch = db.batch();
    expiredBoostsSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, { active: false });
      
      // Also remove from user's active boosts
      const boost = doc.data() as ViralBoost;
      batch.update(db.collection('users').doc(boost.userId), {
        [`activeBoosts.${boost.type}`]: admin.firestore.FieldValue.delete(),
      });
    });

    await batch.commit();

    functions.logger.info(`Deactivated ${expiredBoostsSnapshot.size} expired viral boosts`);
    
    return null;
  });
